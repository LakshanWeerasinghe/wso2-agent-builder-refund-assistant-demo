// New refund request: reservation lookup, policies in scope, demo scenarios and submission to the agent.
import {
  el, mount, icon, flag, regionName, languageName, formatMoney, formatRange, badge, languageBadge, REGIONS,
  pageHeader, toast, spinner, emptyState, busyOverlay, INCIDENT_LABELS, CATEGORY_LABELS, CHANNEL_LABELS
} from "../ui.js";

// One complaint per demo reservation, in the guest's own words.
const SCENARIOS = [
  { reservationId: "RES-PAR-24117", region: "EUROPE", countryCode: "FR", hotel: "Paris Opéra", guest: "Emily Carter", language: "en", channel: "EMAIL",
    complaint: "There was drilling and scaffolding right outside my window every day, and one night we had no hot water at all — not what I expect for €420 a night." },
  { reservationId: "RES-BER-60455", region: "EUROPE", countryCode: "DE", hotel: "Berlin Mitte", guest: "Sophie Laurent", language: "fr", channel: "EMAIL",
    complaint: "The heating in my room broke overnight. It was freezing — the little heater only arrived after 1 a.m. and I barely slept." },
  { reservationId: "RES-BCN-41208", region: "EUROPE", countryCode: "ES", hotel: "Barcelona Gòtic", guest: "Giulia Romano", language: "it", channel: "CHAT",
    complaint: "Two nights in a row a party on your rooftop terrace kept me awake with loud music well past midnight." },
  { reservationId: "RES-CPT-50391", region: "AFRICA", countryCode: "ZA", hotel: "Cape Town Waterfront", guest: "Lukas Becker", language: "de", channel: "PHONE",
    complaint: "Every night the power went off with the load-shedding and our air conditioning stopped for hours. We could hardly sleep for three nights." },
  { reservationId: "RES-MIA-77120", region: "AMERICAS", countryCode: "US", hotel: "Miami Beach", guest: "Carlos Mendoza", language: "es", channel: "PHONE",
    complaint: "With the hurricane the pool and beach were closed for days, yet you charged me the full resort fee, and one night we had no air conditioning at all." },
  { reservationId: "RES-NYC-80233", region: "AMERICAS", countryCode: "US", hotel: "New York Midtown", guest: "James O'Neill", language: "en", channel: "FRONT_DESK",
    complaint: "The air conditioning in my room was broken for two nights and nobody fixed it." },
  { reservationId: "RES-KYO-31842", region: "ASIA_PACIFIC", countryCode: "JP", hotel: "Kyoto Gion", guest: "佐藤 陽斗 (Haruto Sato)", language: "ja", channel: "EMAIL",
    complaint: "We chose your ryokan for its hot-spring bath, but it was closed for most of our stay." },
  { reservationId: "RES-SIN-90017", region: "ASIA_PACIFIC", countryCode: "SG", hotel: "Singapore Marina", guest: "Priya Nair", language: "en", channel: "EMAIL",
    complaint: "Back in August the air conditioning stopped one night and the room was unbearably hot — I'd like some compensation." }
];

const CHANNELS = ["PHONE", "EMAIL", "FRONT_DESK", "CHAT"];

// Kept across re-renders (region / role switches) until the request is submitted.
const form = { reservationId: "", complaint: "", channel: "PHONE", reservation: null, lookupError: null, policies: null, policiesError: null, scenario: null };
let showAllScenarios = false;

export async function render(container, ctx) {
  const header = pageHeader({
    eyebrow: [icon("plus", 13), "Guest relations"],
    title: "New refund request",
    subtitle: "Log the guest’s complaint against their reservation. The refund agent reads the stay, the incident log and every policy in force, then recommends an outcome for your approval."
  });

  const lookupCard = el("section", { class: "card" });
  const complaintCard = el("section", { class: "card" });
  const policiesCard = el("section", { class: "card card--policies" });
  const scenariosCard = el("section", { class: "card card--side scenarios" });

  mount(container, header,
    el("div", { class: "new-layout" },
      el("div", { class: "new-main" }, lookupCard, policiesCard, complaintCard),
      el("aside", { class: "new-side" }, scenariosCard)));

  const refresh = () => {
    drawLookup(lookupCard, ctx, refresh);
    drawComplaint(complaintCard, ctx, refresh);
    drawPolicies(policiesCard);
    drawScenarios(scenariosCard, ctx, refresh);
  };
  refresh();
}

// ---------- Reservation lookup ----------

function drawLookup(card, ctx, refresh) {
  const input = el("input", { class: "input input--lg input--mono", type: "text", placeholder: "RES-PAR-24117", value: form.reservationId,
    "aria-label": "Reservation number", autocomplete: "off", spellcheck: "false",
    oninput: (e) => { form.reservationId = e.target.value.toUpperCase(); e.target.value = form.reservationId; },
    onkeydown: (e) => { if (e.key === "Enter") { e.preventDefault(); lookup(ctx, refresh); } } });
  const button = el("button", { class: "btn btn--ink", type: "button", onclick: () => lookup(ctx, refresh) }, icon("search"), "Look up");

  let result = null;
  if (form.loading) result = el("div", { class: "stay-card stay-card--loading" }, spinner("Finding the reservation…"));
  else if (form.lookupError) result = el("div", { class: "callout callout--danger" }, icon("alert"), el("span", { text: form.lookupError }));
  else if (form.reservation) result = stayCard(form.reservation, ctx);

  mount(card, 
    el("div", { class: "card__header" },
      el("h2", { class: "card__title" }, el("span", { class: "step", text: "1" }), "Reservation"),
      el("span", { class: "card__meta", text: "From the reservation system" })),
    el("div", { class: "lookup" }, input, button),
    result);
}

async function lookup(ctx, refresh) {
  const id = form.reservationId.trim();
  if (!id) { form.lookupError = "Enter a reservation number, for example RES-PAR-24117."; refresh(); return; }
  Object.assign(form, { loading: true, lookupError: null, reservation: null, policies: null, policiesError: null });
  refresh();
  try {
    form.reservation = await ctx.api.refundApi.reservation(id);
  } catch (error) {
    form.lookupError = error.status === 404 ? `No reservation ${id} was found.` : error.message;
  }
  form.loading = false;
  refresh();
  if (form.reservation) loadPolicies(ctx, form.reservation, refresh);
}

async function loadPolicies(ctx, r, refresh) {
  const hotel = r.hotel || {};
  form.policies = "loading";
  refresh();
  try {
    const list = await ctx.api.policyApi.applicable({
      region: hotel.region, countryCode: hotel.countryCode, hotelId: hotel.hotelId, checkIn: r.checkIn, checkOut: r.checkOut
    });
    if (form.reservation !== r) return;
    form.policies = (Array.isArray(list) ? list : []).sort((a, b) => (b.precedence || 0) - (a.precedence || 0));
  } catch (error) {
    if (form.reservation !== r) return;
    form.policies = null;
    form.policiesError = error.message;
  }
  refresh();
}

function stayCard(r, ctx) {
  const hotel = r.hotel || {};
  const guest = r.guest || {};
  const incidents = r.incidents || [];
  const categories = [...new Set(incidents.map((i) => INCIDENT_LABELS[i.category] || i.category))];
  const outOfScope = !ctx.inScope({ region: hotel.region, countryCode: hotel.countryCode });
  return el("div", { class: "stay-card" },
    el("div", { class: "stay-card__top" },
      el("span", { class: "flag flag--xl", text: flag(hotel.countryCode) }),
      el("div", { class: "stay-card__hotel" },
        el("div", { class: "stay-card__name", text: hotel.name || "—" }),
        el("div", { class: "muted", text: [hotel.city, hotel.countryName, regionName(hotel.region), CATEGORY_LABELS[hotel.category]].filter(Boolean).join(" · ") })),
      badge(titleCase(r.status), r.status === "CHECKED_OUT" ? "neutral" : "warning")),
    el("div", { class: "stay-card__grid" },
      cell("Guest", el("span", null, guest.name || "—", " ", languageBadge(guest.preferredLanguage))),
      cell("Stay", `${formatRange(r.checkIn, r.checkOut)} · ${r.nights} ${r.nights === 1 ? "night" : "nights"}`),
      cell("Room", `${r.roomNumber} · ${r.roomType}`),
      cell("Rate", `${formatMoney(r.nightlyRate, r.currency)} / night · ${titleCase(r.rateType)}`),
      cell("Incidents on record", incidents.length
        ? el("span", { class: "incident-count" }, el("strong", { text: String(incidents.length) }), ` · ${categories.join(", ")}`)
        : el("span", { class: "muted", text: "None recorded" }))),
    outOfScope ? el("p", { class: "field-hint" }, icon("globe", 12), ` Outside your current scope (${ctx.scopeLabel()}) — you can still log it.`) : null);
}

function cell(label, value) {
  return el("div", { class: "stay-card__cell" }, el("span", { class: "stay-card__label", text: label }), el("span", { class: "stay-card__value" }, value));
}

function titleCase(s) {
  return s ? String(s).toLowerCase().replace(/_/g, " ").replace(/^\w/, (x) => x.toUpperCase()) : "—";
}

// ---------- Complaint & submission ----------

function drawComplaint(card, ctx, refresh) {
  const textarea = el("textarea", { class: "textarea", rows: "5", placeholder: "What happened, in the guest’s words…", "aria-label": "Complaint",
    oninput: (e) => { form.complaint = e.target.value; updateSubmit(); } });
  textarea.value = form.complaint;
  const channel = el("select", { class: "select", "aria-label": "Channel", onchange: (e) => { form.channel = e.target.value; } },
    CHANNELS.map((c) => el("option", { value: c, text: CHANNEL_LABELS[c], selected: form.channel === c })));
  channel.value = form.channel;

  const summary = policySummary();
  const submit = el("button", { class: "btn btn--primary btn--lg", type: "button", onclick: () => submitRequest(ctx, refresh) },
    icon("sparkle"), "Assess with the refund agent");
  function updateSubmit() {
    submit.disabled = !form.reservation || !form.complaint.trim();
  }
  updateSubmit();

  mount(card, 
    el("div", { class: "card__header" },
      el("h2", { class: "card__title" }, el("span", { class: "step", text: "2" }), "Complaint"),
      form.scenario ? el("span", { class: "card__meta" }, icon("sparkle", 13), `Demo scenario · ${form.scenario}`) : null),
    el("label", { class: "field" }, el("span", { class: "field__label", text: "Guest’s complaint" }), textarea),
    el("div", { class: "field-row" },
      el("label", { class: "field" }, el("span", { class: "field__label", text: "Channel" }), channel),
      el("div", { class: "field" }, el("span", { class: "field__label", text: "Logged by" }),
        el("div", { class: "readonly-value" }, icon("user", 14), ctx.state.repName))),
    el("div", { class: "submit-row" },
      el("p", { class: "field-hint", text: form.reservation
        ? (summary ? `The agent will weigh ${summary}. It usually takes 20–60 seconds.` : "The agent usually takes 20–60 seconds.")
        : "Look up the reservation first." }),
      submit));
}

function policySummary() {
  if (!Array.isArray(form.policies) || !form.policies.length) return "";
  const langs = new Set(form.policies.map((p) => p.language));
  return `${form.policies.length} ${form.policies.length === 1 ? "policy" : "policies"} in ${langs.size} ${langs.size === 1 ? "language" : "languages"}`;
}

async function submitRequest(ctx, refresh) {
  if (!form.reservation || !form.complaint.trim()) return;
  const summary = policySummary();
  const busy = busyOverlay(summary ? `Assessing with ${summary}…` : "Assessing the request…",
    "The refund agent, hosted in Microsoft Foundry, is working through the case. This usually takes 20–60 seconds.",
    [
      "Reading the reservation and the property’s incident log",
      "Checking the guest’s Reverie Circle tier",
      "Retrieving clauses from Azure AI Search — hotel, country, region and global",
      "Applying precedence and seasonal windows",
      "Calculating per night and drafting the guest message"
    ]);
  try {
    const created = await ctx.api.refundApi.createCase({
      reservationId: form.reservation.reservationId,
      complaint: form.complaint.trim(),
      channel: form.channel,
      createdBy: ctx.state.repName
    });
    Object.assign(form, { reservationId: "", complaint: "", reservation: null, policies: null, policiesError: null, lookupError: null, scenario: null });
    busy.close();
    toast(`${created.caseNumber || "Case"} created — recommendation ready`, "success");
    ctx.refreshShell();
    ctx.navigate(`#/cases/${encodeURIComponent(created.id)}`);
  } catch (error) {
    busy.close();
    toast(error.status === 404 ? error.message : `The assessment failed: ${error.message}`, "danger");
    refresh();
  }
}

// ---------- Policies in scope ----------

function drawPolicies(card) {
  let content;
  card.hidden = !form.reservation;
  if (!form.reservation) {
    content = null;
  } else if (form.policies === "loading") {
    content = spinner("Resolving the policy stack…");
  } else if (form.policiesError) {
    content = el("div", { class: "callout callout--warning" }, icon("alert"),
      el("span", { text: `Policy service unavailable (${form.policiesError}). The agent resolves policies itself, so you can still submit.` }));
  } else if (Array.isArray(form.policies)) {
    const langs = [...new Set(form.policies.map((p) => p.language))];
    content = el("div", null,
      el("div", { class: "lang-row" }, langs.map((l) => languageBadge(l))),
      el("ol", { class: "scope-list" }, form.policies.map((p) => el("li", { class: ["scope-item", p.policyType === "SEASONAL" && "is-seasonal"] },
        el("span", { class: "scope-item__level", text: p.level || p.scope }),
        el("span", { class: "scope-item__title", text: p.titleEnglish || p.title }),
        el("span", { class: "scope-item__meta" },
          el("span", { class: "lang-code", text: (p.language || "").toUpperCase() }),
          `${p.documentId}`)))));
  }
  mount(card, 
    el("div", { class: "card__header" },
      el("h2", { class: "card__title" }, icon("layers", 16), "Policies in scope"),
      Array.isArray(form.policies) ? el("span", { class: "card__meta", text: policySummary() }) : null),
    content);
}

// ---------- Demo scenarios ----------

function drawScenarios(card, ctx, refresh) {
  const inScope = SCENARIOS.filter((s) => ctx.inScope(s));
  const list = showAllScenarios || !ctx.state.region ? SCENARIOS : inScope;
  const groups = REGIONS.map((r) => ({ region: r, items: list.filter((s) => s.region === r.code) })).filter((g) => g.items.length);

  const scopeNote = ctx.state.region && !showAllScenarios
    ? el("div", { class: "scenarios__note" },
      el("span", { text: `${inScope.length} of ${SCENARIOS.length} in ${ctx.scopeLabel()}` }),
      el("button", { class: "link-btn", type: "button", onclick: () => { showAllScenarios = true; refresh(); } }, "Show all"))
    : ctx.state.region ? el("div", { class: "scenarios__note" },
      el("span", { text: `Showing all regions` }),
      el("button", { class: "link-btn", type: "button", onclick: () => { showAllScenarios = false; refresh(); } }, `Only ${ctx.scopeLabel()}`)) : null;

  mount(card, 
    el("div", { class: "card__header" },
      el("h2", { class: "card__title" }, icon("sparkle", 16), "Demo scenarios"),
      el("span", { class: "card__meta", text: "Click to fill the form" })),
    scopeNote,
    groups.length ? groups.map((g) => el("div", { class: "scenario-group" },
      el("div", { class: "scenario-group__title", text: g.region.name }),
      g.items.map((s) => scenarioCard(s, ctx, refresh)))) :
      emptyState(`No demo stays in ${ctx.scopeLabel()}`, "Pick another region, or show all scenarios."));
}

function scenarioCard(s, ctx, refresh) {
  const active = form.reservation && form.reservation.reservationId === s.reservationId;
  return el("button", { class: ["scenario", active && "is-active"], type: "button",
    onclick: () => {
      Object.assign(form, { reservationId: s.reservationId, complaint: s.complaint, channel: s.channel, scenario: `${s.guest} · ${s.hotel}` });
      lookup(ctx, refresh);
    } },
    el("div", { class: "scenario__head" },
      el("span", { class: "flag", text: flag(s.countryCode) }),
      el("span", { class: "scenario__hotel", text: s.hotel }),
      el("span", { class: "lang-code", title: languageName(s.language), text: s.language.toUpperCase() })),
    el("div", { class: "scenario__guest", text: `${s.guest} · ${s.reservationId}` }),
    el("p", { class: "scenario__quote", text: `“${s.complaint}”` }));
}
