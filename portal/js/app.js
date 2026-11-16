// App shell: hash router, navigation, region / country / role switchers and the shared view context.
import { refundApi, policyApi, guestApi } from "./api.js";
import { el, icon, flag, regionName, REGIONS, ROLES, roleName, initials, errorState, spinner } from "./ui.js";

const ROUTES = [
  { name: "queue", pattern: /^\/queue$/, module: () => import("./views/queue.js"), title: "Refund queue" },
  { name: "case", pattern: /^\/cases\/([^/]+)$/, module: () => import("./views/case.js"), title: "Refund case" },
  { name: "new", pattern: /^\/new$/, module: () => import("./views/new-request.js"), title: "New request" },
  { name: "policies", pattern: /^\/policies$/, module: () => import("./views/policies.js"), title: "Policy library" },
  { name: "network", pattern: /^\/network$/, module: () => import("./views/network.js"), title: "Hotel network" }
];

const NAV = [
  { route: "queue", hash: "#/queue", label: "Refund queue", icon: "inbox" },
  { route: "new", hash: "#/new", label: "New request", icon: "plus" },
  { route: "policies", hash: "#/policies", label: "Policy library", icon: "book" },
  { route: "network", hash: "#/network", label: "Hotel network", icon: "globe" }
];

// Used until /regions answers (and if it never does), so the switchers always work.
const FALLBACK_REGIONS = [
  { code: "EUROPE", name: "Europe", countries: [["FR", "France", "EUR", "fr"], ["DE", "Germany", "EUR", "de"], ["ES", "Spain", "EUR", "es"], ["IT", "Italy", "EUR", "it"], ["GB", "United Kingdom", "GBP", "en"], ["NL", "Netherlands", "EUR", "nl"], ["PT", "Portugal", "EUR", "pt"]] },
  { code: "AFRICA", name: "Africa", countries: [["ZA", "South Africa", "ZAR", "en"], ["KE", "Kenya", "KES", "en"], ["MA", "Morocco", "MAD", "fr"], ["EG", "Egypt", "EGP", "ar"]] },
  { code: "AMERICAS", name: "Americas", countries: [["US", "United States", "USD", "en"], ["CA", "Canada", "CAD", "en"], ["MX", "Mexico", "MXN", "es"]] },
  { code: "ASIA_PACIFIC", name: "Asia-Pacific", countries: [["JP", "Japan", "JPY", "ja"], ["SG", "Singapore", "SGD", "en"], ["TH", "Thailand", "THB", "th"], ["IN", "India", "INR", "en"]] }
].map((r) => ({ ...r, countries: r.countries.map(([code, name, currency, localLanguage]) => ({ code, name, currency, localLanguage, flag: flag(code) })) }));

const STORAGE_KEY = "reverie.portal.context";

function loadState() {
  const defaults = { region: null, countryCode: null, role: "REPRESENTATIVE", repName: "Amelia Hart" };
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return { ...defaults, ...saved };
  } catch {
    return defaults;
  }
}

function saveState(state) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* private mode */ }
}

const state = loadState();
let regions = FALLBACK_REGIONS;
let currentRoute = null;
let renderToken = 0;

const ctx = {
  state,
  api: { refundApi, policyApi, guestApi, refund: refundApi, policy: policyApi, policies: policyApi },
  get regions() { return regions; },
  countryName(code) {
    for (const r of regions) {
      const c = (r.countries || []).find((x) => x.code === code);
      if (c) return c.name;
    }
    return code || "";
  },
  regionOfCountry(code) {
    const r = regions.find((x) => (x.countries || []).some((c) => c.code === code));
    return r ? r.code : null;
  },
  // Region / country scope as a short label, e.g. "Europe · 🇫🇷 France".
  scopeLabel() {
    if (state.countryCode) return `${regionName(state.region)} · ${flag(state.countryCode)} ${ctx.countryName(state.countryCode)}`;
    return state.region ? regionName(state.region) : "All regions";
  },
  // True when an object with region / countryCode fields is inside the current filter.
  inScope(item) {
    if (!item) return false;
    if (state.region && item.region !== state.region) return false;
    if (state.countryCode && item.countryCode !== state.countryCode) return false;
    return true;
  },
  navigate(hash) {
    if (location.hash === hash) renderRoute();
    else location.hash = hash;
  },
  refreshShell: () => refreshShell(),
  setFilter: (region, countryCode = null) => setFilter(region, countryCode),
  rerender: () => renderRoute()
};

// ---------- Shell ----------

const nodes = {};

function buildShell() {
  const app = document.getElementById("app");
  nodes.navLinks = NAV.map((item) => {
    const count = el("span", { class: "nav__count", hidden: true });
    const link = el("a", { class: "nav__link", href: item.hash, dataset: { route: item.route } },
      icon(item.icon, 18), el("span", { class: "nav__label", text: item.label }), item.route === "queue" ? count : null);
    if (item.route === "queue") nodes.queueCount = count;
    return link;
  });

  nodes.apiDot = el("span", { class: "status-dot", title: "Refund API" });
  nodes.policyDot = el("span", { class: "status-dot", title: "Policy service" });

  const sidebar = el("aside", { class: "sidebar" },
    el("a", { class: "brand", href: "#/queue", "aria-label": "ReverieEscapes — refund queue" },
      el("span", { class: "brand__monogram", "aria-hidden": "true", text: "R" }),
      el("span", { class: "brand__text" },
        el("span", { class: "brand__name" }, "Reverie", el("em", { text: "Escapes" })),
        el("span", { class: "brand__sub", text: "Hotels & Resorts" }))),
    el("div", { class: "sidebar__section-label", text: "Guest relations" }),
    el("nav", { class: "nav", "aria-label": "Main" }, nodes.navLinks),
    el("div", { class: "sidebar__foot" },
      el("div", { class: "sidebar__services" },
        el("div", { class: "service" }, nodes.apiDot, el("span", { text: "Refund API" })),
        el("div", { class: "service" }, nodes.policyDot, el("span", { text: "Policy service" }))),
      el("div", { class: "sidebar__date" },
        el("span", { class: "sidebar__date-label", text: "Today" }),
        el("span", { text: new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date()) })),
      el("div", { class: "sidebar__powered", text: "WSO2 Integrator · Microsoft Foundry" })));

  // Region switcher: segmented control on wide screens, select on narrow ones.
  nodes.regionButtons = [{ code: null, name: "All regions" }, ...REGIONS].map((r) =>
    el("button", { class: "segmented__item", type: "button", dataset: { region: r.code || "" }, onclick: () => setFilter(r.code, null) }, r.name));
  nodes.regionSelect = el("select", { class: "select region-select", "aria-label": "Region", onchange: (e) => setFilter(e.target.value || null, null) },
    el("option", { value: "", text: "All regions" }), REGIONS.map((r) => el("option", { value: r.code, text: r.name })));
  nodes.countrySelect = el("select", { class: "select country-select", "aria-label": "Country", onchange: (e) => onCountry(e.target.value) });

  nodes.roleSelect = el("select", { class: "select role-select", "aria-label": "Acting role", onchange: (e) => setRole(e.target.value) },
    ROLES.map((r) => el("option", { value: r.code, text: r.name })));
  nodes.avatar = el("span", { class: "avatar", "aria-hidden": "true" });
  nodes.repInput = el("input", { class: "rep-name", type: "text", value: state.repName, "aria-label": "Representative name", spellcheck: "false",
    onchange: (e) => { state.repName = e.target.value.trim() || "Guest relations"; e.target.value = state.repName; saveState(state); updateUser(); } });

  const topbar = el("header", { class: "topbar" },
    el("div", { class: "topbar__context" },
      el("span", { class: "topbar__label" }, icon("globe", 14), "Scope"),
      el("div", { class: "segmented", role: "group", "aria-label": "Region" }, nodes.regionButtons),
      nodes.regionSelect,
      nodes.countrySelect),
    el("div", { class: "topbar__user" },
      el("label", { class: "role-field" }, el("span", { class: "topbar__label", text: "Acting as" }), nodes.roleSelect),
      el("div", { class: "rep" }, nodes.avatar, nodes.repInput)));

  nodes.view = el("main", { class: "view", id: "view", tabindex: "-1" });
  app.replaceChildren(sidebar, el("div", { class: "main" }, topbar, nodes.view));
  updateFilters();
  updateUser();
}

function updateFilters() {
  for (const button of nodes.regionButtons) {
    const active = (button.dataset.region || null) === state.region;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  }
  nodes.regionSelect.value = state.region || "";
  const scoped = state.region ? regions.filter((r) => r.code === state.region) : regions;
  const options = [el("option", { value: "", text: state.region ? `All of ${regionName(state.region)}` : "All countries" })];
  for (const r of scoped) {
    const items = (r.countries || []).map((c) => el("option", { value: c.code, text: `${c.flag || flag(c.code)}  ${c.name}` }));
    options.push(state.region ? items : el("optgroup", { label: r.name || regionName(r.code) }, items));
  }
  nodes.countrySelect.replaceChildren(...options.flat());
  nodes.countrySelect.value = state.countryCode || "";
  document.documentElement.dataset.region = state.region || "ALL";
}

function updateUser() {
  nodes.roleSelect.value = state.role;
  nodes.avatar.textContent = initials(state.repName);
  nodes.avatar.title = `${state.repName} · ${roleName(state.role)}`;
}

function onCountry(code) {
  if (!code) return setFilter(state.region, null);
  setFilter(ctx.regionOfCountry(code) || state.region, code);
}

function setFilter(region, countryCode) {
  if (region === state.region && countryCode === state.countryCode) return;
  state.region = region || null;
  state.countryCode = countryCode || null;
  saveState(state);
  updateFilters();
  refreshShell();
  renderRoute();
}

function setRole(role) {
  state.role = role;
  saveState(state);
  updateUser();
  renderRoute();
}

async function refreshShell() {
  const [cases, apiHealth, policyHealth] = await Promise.allSettled([
    refundApi.listCases({}), refundApi.health(), policyApi.health()
  ]);
  setDot(nodes.apiDot, apiHealth.status === "fulfilled" || cases.status === "fulfilled", "Refund API");
  setDot(nodes.policyDot, policyHealth.status === "fulfilled", "Policy service",
    policyHealth.status === "fulfilled" && policyHealth.value && policyHealth.value.searchConfigured === false ? "search not configured" : null);
  if (cases.status === "fulfilled" && Array.isArray(cases.value)) {
    const pending = cases.value.filter((c) => c.status === "PENDING_APPROVAL" && ctx.inScope(caseScope(c))).length;
    nodes.queueCount.textContent = String(pending);
    nodes.queueCount.hidden = pending === 0;
  } else {
    nodes.queueCount.hidden = true;
  }
}

function setDot(dot, ok, label, warning) {
  dot.classList.toggle("is-ok", ok && !warning);
  dot.classList.toggle("is-warn", ok && Boolean(warning));
  dot.classList.toggle("is-down", !ok);
  dot.title = `${label}: ${ok ? (warning || "online") : "unreachable"}`;
  dot.parentElement.title = dot.title;
}

export function caseScope(c) {
  const hotel = (c && c.reservation && c.reservation.hotel) || {};
  return { region: hotel.region, countryCode: hotel.countryCode, hotelId: hotel.hotelId };
}
ctx.caseScope = caseScope;

async function loadRegions() {
  try {
    const data = await refundApi.regions();
    if (Array.isArray(data) && data.length) {
      regions = data.map((r) => ({ ...r, countries: (r.countries || []).map((c) => ({ ...c, flag: c.flag || flag(c.code) })) }));
      updateFilters();
    }
  } catch { /* keep fallback */ }
}

// ---------- Router ----------

function parseHash() {
  const path = (location.hash || "").replace(/^#/, "") || "/queue";
  for (const route of ROUTES) {
    const match = route.pattern.exec(path);
    if (match) return { route, params: match.slice(1).map(decodeURIComponent) };
  }
  return null;
}

async function renderRoute() {
  const token = ++renderToken;
  const parsed = parseHash();
  if (!parsed) {
    location.replace("#/queue");
    return;
  }
  const { route, params } = parsed;
  const changedPage = !currentRoute || currentRoute.name !== route.name || currentRoute.key !== params.join("/");
  currentRoute = { name: route.name, key: params.join("/") };

  for (const link of nodes.navLinks) {
    const active = link.dataset.route === route.name || (route.name === "case" && link.dataset.route === "queue");
    link.classList.toggle("is-active", active);
    if (active) link.setAttribute("aria-current", "page"); else link.removeAttribute("aria-current");
  }
  document.title = `${route.title} · ReverieEscapes`;

  const container = el("div", { class: ["page", `page--${route.name}`, changedPage && "page--enter"] });
  if (!nodes.view.firstChild || changedPage) nodes.view.replaceChildren(el("div", { class: "page page--loading" }, spinner("Loading")));

  let module;
  try {
    module = await route.module();
  } catch (error) {
    if (token !== renderToken) return;
    nodes.view.replaceChildren(el("div", { class: "page" },
      errorState(`The ${route.title.toLowerCase()} view could not be loaded`, error, () => renderRoute())));
    console.error(error);
    return;
  }
  if (token !== renderToken) return;
  nodes.view.replaceChildren(container);
  if (changedPage) {
    window.scrollTo({ top: 0 });
    nodes.view.scrollTop = 0;
  }
  const viewCtx = Object.assign({}, ctx, { params, route: route.name });
  try {
    await module.render(container, viewCtx);
  } catch (error) {
    console.error(error);
    if (token === renderToken && container.isConnected) {
      container.replaceChildren(errorState("Something went wrong on this page", error, () => renderRoute()));
    }
  }
}

window.addEventListener("hashchange", renderRoute);

buildShell();
renderRoute();
loadRegions();
refreshShell();
setInterval(refreshShell, 30000);
