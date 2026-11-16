// Hotel network: regions → countries → hotels, with the policy documents layered at each scope.
import {
  el, mount, icon, flag, regionName, languageName, formatNumber, badge, REGIONS, CATEGORY_LABELS,
  pageHeader, errorState, emptyState, skeleton
} from "../ui.js";

export async function render(container, ctx) {
  const { refundApi, policyApi } = ctx.api;
  const header = pageHeader({
    eyebrow: [icon("globe", 13), ctx.scopeLabel()],
    title: "Hotel network",
    subtitle: "Every property and the refund policies layered over it — global, regional, country and hotel rules, plus seasonal protocols."
  });
  const body = el("div", { class: "network" },
    el("div", { class: "net-stats" }, Array.from({ length: 5 }, () => el("div", { class: "net-stat" }, skeleton(2)))),
    el("div", { class: "card" }, skeleton(8)));
  mount(container, header, body);

  const [regionsRes, hotelsRes, policiesRes] = await Promise.allSettled([refundApi.regions(), refundApi.hotels({}), policyApi.list({})]);
  if (hotelsRes.status === "rejected") {
    mount(body, errorState("The hotel network could not be loaded", hotelsRes.reason, () => ctx.rerender()));
    return;
  }
  const regions = regionsRes.status === "fulfilled" && Array.isArray(regionsRes.value) && regionsRes.value.length ? regionsRes.value : ctx.regions;
  const hotels = Array.isArray(hotelsRes.value) ? hotelsRes.value : [];
  const policies = policiesRes.status === "fulfilled" && Array.isArray(policiesRes.value) ? policiesRes.value : null;

  const counts = policyCounts(policies);
  const visibleRegions = regions.filter((r) => !ctx.state.region || r.code === ctx.state.region);
  const scopedHotels = hotels.filter((h) => ctx.inScope(h));

  mount(body, 
    stats(regions, hotels, scopedHotels, policies, ctx),
    layering(policies, counts, ctx),
    policies ? null : el("div", { class: "callout callout--warning" }, icon("alert"),
      el("span", { text: `Policy counts unavailable: ${policiesRes.reason ? policiesRes.reason.message : "policy service unreachable"}.` })),
    visibleRegions.length
      ? visibleRegions.map((r) => regionSection(r, hotels.filter((h) => h.region === r.code), counts, ctx))
      : emptyState("No regions", "The reservation system returned no regions."),
    ctx.state.region ? el("div", { class: "network__more" },
      el("span", { class: "muted", text: `${regions.length - visibleRegions.length} other regions hidden by your scope.` }),
      el("button", { class: "btn btn--ghost btn--sm", type: "button", onclick: () => ctx.setFilter(null, null) }, icon("globe", 14), "Show all regions")) : null);
}

function policyCounts(policies) {
  const counts = { global: [], region: {}, country: {}, hotel: {} };
  for (const p of policies || []) {
    const add = (bucket, key) => { (bucket[key] = bucket[key] || []).push(p); };
    if (p.scope === "GLOBAL") counts.global.push(p);
    else if (p.scope === "REGION") add(counts.region, p.region);
    else if (p.scope === "COUNTRY") add(counts.country, p.countryCode);
    else if (p.scope === "HOTEL") add(counts.hotel, p.hotelId);
  }
  return counts;
}

function stats(regions, hotels, scopedHotels, policies, ctx) {
  const countries = new Set(scopedHotels.map((h) => h.countryCode));
  const allCountries = regions.reduce((n, r) => n + (r.countries || []).length, 0);
  const rooms = scopedHotels.reduce((n, h) => n + (Number(h.rooms) || 0), 0);
  const scoped = Boolean(ctx.state.region);
  const policyCount = policies ? policies.filter((p) => p.scope === "GLOBAL" || ctx.inScope(p)).length : null;
  return el("section", { class: "net-stats", "aria-label": "Network summary" },
    netStat(scoped ? "Region" : "Regions", scoped ? regionName(ctx.state.region) : String(regions.length), scoped ? `of ${regions.length}` : "Europe · Africa · Americas · Asia-Pacific"),
    netStat("Countries", String(countries.size), scoped ? `of ${allCountries}` : "with a ReverieEscapes property"),
    netStat("Hotels", String(scopedHotels.length), scoped ? `of ${hotels.length}` : "city, resort, safari and ryokan"),
    netStat("Rooms", formatNumber(rooms), "keys in operation"),
    netStat("Policy documents", policyCount === null ? "—" : String(policyCount), scoped ? "in force for this scope" : "in the register"));
}

function netStat(label, value, note) {
  return el("div", { class: "net-stat" },
    el("span", { class: "net-stat__label", text: label }),
    el("span", { class: "net-stat__value", text: value }),
    el("span", { class: "net-stat__note", text: note }));
}

function layering(policies, counts, ctx) {
  if (!policies) return null;
  const by = (scope) => policies.filter((p) => p.scope === scope && (scope === "GLOBAL" || ctx.inScope(p)));
  const layers = [
    { label: "Global", list: by("GLOBAL"), note: "All properties" },
    { label: "Region", list: by("REGION"), note: "Regional addenda" },
    { label: "Country", list: by("COUNTRY"), note: "Country addenda" },
    { label: "Hotel", list: by("HOTEL"), note: "House rules" }
  ];
  return el("section", { class: "layers card" },
    el("div", { class: "card__header" },
      el("h2", { class: "card__title" }, icon("layers", 16), "Policy layering"),
      el("span", { class: "card__meta", text: "More specific documents prevail · seasonal documents apply inside their window" })),
    el("ol", { class: "layers__row" }, layers.map((l, i) => el("li", { class: "layer" },
      el("span", { class: "layer__index", text: String(i + 1) }),
      el("div", { class: "layer__text" },
        el("span", { class: "layer__label", text: l.label }),
        el("span", { class: "layer__count" },
          el("strong", { text: String(l.list.length) }),
          ` ${l.list.length === 1 ? "document" : "documents"}`,
          l.list.some((p) => p.policyType === "SEASONAL") ? el("span", { class: "layer__seasonal", text: ` · ${l.list.filter((p) => p.policyType === "SEASONAL").length} seasonal` }) : null),
        el("span", { class: "layer__note", text: l.note }))))));
}

function regionSection(region, hotels, counts, ctx) {
  const regionPolicies = counts.region[region.code] || [];
  const countries = region.countries || [];
  const rooms = hotels.reduce((n, h) => n + (Number(h.rooms) || 0), 0);
  const focused = ctx.state.region === region.code;
  return el("section", { class: ["region-block", focused && "is-focused"] },
    el("header", { class: "region-block__head" },
      el("div", null,
        el("h2", { class: "region-block__title", text: region.name || regionName(region.code) }),
        el("div", { class: "region-block__meta", text: `${countries.length} countries · ${hotels.length} hotels · ${formatNumber(rooms)} rooms` })),
      el("div", { class: "region-block__policies" },
        regionPolicies.map((p) => policyChip(p)),
        focused ? null : el("button", { class: "btn btn--ghost btn--sm", type: "button", onclick: () => ctx.setFilter(region.code, null) }, "Focus", icon("arrowRight", 13)))),
    el("div", { class: "country-grid" }, countries.map((c) => countryCard(c, hotels.filter((h) => h.countryCode === c.code), counts, ctx))));
}

function policyChip(p) {
  return el("span", { class: ["policy-chip", p.policyType === "SEASONAL" && "policy-chip--seasonal"], title: `${p.titleEnglish || p.title} · ${languageName(p.language)}` },
    icon(p.policyType === "SEASONAL" ? "calendar" : "file", 12), p.documentId);
}

function countryCard(country, hotels, counts, ctx) {
  const countryPolicies = counts.country[country.code] || [];
  const selected = ctx.state.countryCode === country.code;
  const dimmed = ctx.state.countryCode && !selected;
  const stackBase = counts.global.length + (counts.region[hotels[0] && hotels[0].region] || []).length + countryPolicies.length;
  return el("article", { class: ["country", selected && "is-selected", dimmed && "is-dimmed"] },
    el("button", { class: "country__head", type: "button", title: selected ? "Clear country filter" : `Filter to ${country.name}`,
      onclick: () => ctx.setFilter(ctx.regionOfCountry(country.code), selected ? null : country.code) },
      el("span", { class: "flag flag--xl", text: country.flag || flag(country.code) }),
      el("span", { class: "country__text" },
        el("span", { class: "country__name", text: country.name }),
        el("span", { class: "country__meta", text: `${country.currency} · ${languageName(country.localLanguage)}` }))),
    countryPolicies.length ? el("div", { class: "country__policies" }, countryPolicies.map(policyChip)) : null,
    el("ul", { class: "hotel-list" }, hotels.map((h) => {
      const hotelPolicies = counts.hotel[h.hotelId] || [];
      return el("li", { class: "hotel" },
        el("div", { class: "hotel__main" },
          el("span", { class: "hotel__name", text: String(h.name || "").replace(/^ReverieEscapes\s+/, "") }),
          el("span", { class: "hotel__meta" },
            el("span", { class: "meta-id", text: h.hotelId }),
            `${h.city} · ${formatNumber(h.rooms)} rooms`)),
        el("div", { class: "hotel__tags" },
          h.category !== "CITY" ? badge(CATEGORY_LABELS[h.category] || h.category, h.category === "RYOKAN" || h.category === "SAFARI_LODGE" ? "gold" : "info") : null,
          hotelPolicies.length ? el("span", { class: "hotel__rules", title: hotelPolicies.map((p) => p.documentId).join(", ") },
            icon("file", 11), `${hotelPolicies.length} house ${hotelPolicies.length === 1 ? "rule" : "rules"}`) : null,
          el("span", { class: "hotel__stack", title: "Policy documents in this hotel's stack (all windows)", text: `${stackBase + hotelPolicies.length} docs` })));
    })),
    hotels.length ? null : el("p", { class: "muted small", text: "No properties listed." }));
}
