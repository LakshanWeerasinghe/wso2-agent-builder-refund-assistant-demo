// Shared DOM and formatting helpers. API data is only ever set through textContent / attributes.

const SVG_NS = "http://www.w3.org/2000/svg";

export const REGIONS = [
  { code: "EUROPE", name: "Europe" },
  { code: "AFRICA", name: "Africa" },
  { code: "AMERICAS", name: "Americas" },
  { code: "ASIA_PACIFIC", name: "Asia-Pacific" }
];

const LANGUAGES = {
  en: "English", fr: "Français", de: "Deutsch", es: "Español", ja: "日本語",
  it: "Italiano", pt: "Português", nl: "Nederlands", ar: "العربية", th: "ไทย"
};

export const ROLES = [
  { code: "REPRESENTATIVE", name: "Representative" },
  { code: "DUTY_MANAGER", name: "Duty manager" },
  { code: "REGIONAL_DIRECTOR", name: "Regional director" }
];

/**
 * Creates an element. attrs: class, text, on<Event> handlers, dataset, style (object or string),
 * boolean attributes, or any other attribute. children: nodes, strings, numbers, arrays or null.
 */
export function el(tag, attrs, ...children) {
  const node = document.createElement(tag);
  if (attrs && (typeof attrs !== "object" || attrs instanceof Node || Array.isArray(attrs))) {
    children.unshift(attrs);
    attrs = null;
  }
  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      if (value === undefined || value === null || value === false) continue;
      if (key === "class" || key === "className") {
        node.className = Array.isArray(value) ? value.filter(Boolean).join(" ") : value;
      } else if (key === "text") {
        node.textContent = String(value);
      } else if (key === "dataset") {
        Object.assign(node.dataset, value);
      } else if (key === "style" && typeof value === "object") {
        Object.assign(node.style, value);
      } else if (key.startsWith("on") && typeof value === "function") {
        node.addEventListener(key.slice(2).toLowerCase(), value);
      } else if (key === "value" && "value" in node) {
        node.value = value;
      } else if (key === "checked" || key === "selected" || key === "disabled") {
        node[key] = Boolean(value);
        if (value) node.setAttribute(key, "");
      } else if (value === true) {
        node.setAttribute(key, "");
      } else {
        node.setAttribute(key, String(value));
      }
    }
  }
  append(node, children);
  return node;
}

function append(node, children) {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    if (Array.isArray(child)) append(node, child);
    else if (child instanceof Node) node.appendChild(child);
    else node.appendChild(document.createTextNode(String(child)));
  }
}

// Line icons (static path data, 24px grid).
const ICONS = {
  queue: "M4 4h16v6H4zM4 14h16v6H4z M8 7h.01 M8 17h.01",
  inbox: "M22 12h-6l-2 3h-4l-2-3H2 M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z",
  plus: "M12 5v14 M5 12h14",
  book: "M4 19.5A2.5 2.5 0 0 1 6.5 17H20 M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z",
  globe: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z M2 12h20 M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z",
  arrowLeft: "M19 12H5 M12 19l-7-7 7-7",
  arrowRight: "M5 12h14 M12 5l7 7-7 7",
  file: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M8 13h8 M8 17h5",
  external: "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6 M15 3h6v6 M10 14 21 3",
  copy: "M9 9h11v11H9z M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1",
  check: "M20 6 9 17l-5-5",
  x: "M18 6 6 18 M6 6l12 12",
  refresh: "M21 12a9 9 0 1 1-2.64-6.36L21 8 M21 3v5h-5",
  alert: "M12 9v4 M12 17h.01 M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z",
  clock: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z M12 6v6l4 2",
  user: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z",
  search: "M11 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16z M21 21l-4.35-4.35",
  bolt: "M13 2 3 14h9l-1 8 10-12h-9l1-8z",
  shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
  layers: "M12 2 2 7l10 5 10-5-10-5z M2 17l10 5 10-5 M2 12l10 5 10-5",
  sparkle: "M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4z",
  bed: "M2 4v16 M2 8h18a2 2 0 0 1 2 2v10 M2 17h20 M6 8v9",
  message: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",
  phone: "M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z",
  star: "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z",
  calendar: "M3 5h18v16H3z M16 3v4 M8 3v4 M3 10h18",
  building: "M3 21h18 M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16 M9 7h2 M13 7h2 M9 11h2 M13 11h2 M9 15h2 M13 15h2",
  menu: "M3 6h18 M3 12h18 M3 18h18",
  link: "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71 M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71",
  send: "M22 2 11 13 M22 2l-7 20-4-9-9-4 20-7z",
  history: "M3 12a9 9 0 1 0 3-6.7L3 8 M3 3v5h5 M12 7v5l3 3"
};

export function icon(name, size = 16) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.6");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("icon");
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", ICONS[name] || ICONS.file);
  svg.appendChild(path);
  return svg;
}

export function flag(countryCode) {
  if (!countryCode || !/^[A-Za-z]{2}$/.test(countryCode)) return "🏳️";
  return String.fromCodePoint(...countryCode.toUpperCase().split("").map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

export function regionName(code) {
  const region = REGIONS.find((r) => r.code === code);
  return region ? region.name : code || "—";
}

export function languageName(code) {
  return LANGUAGES[code] || (code ? code.toUpperCase() : "—");
}

export function roleName(code) {
  const role = ROLES.find((r) => r.code === code);
  return role ? role.name : code || "—";
}

export function roleRank(code) {
  return ROLES.findIndex((r) => r.code === code);
}

function toNumber(amount) {
  if (amount === null || amount === undefined || amount === "") return null;
  const n = typeof amount === "number" ? amount : Number(amount);
  return Number.isFinite(n) ? n : null;
}

export function formatMoney(amount, currency) {
  const n = toNumber(amount);
  if (n === null) return "—";
  if (!currency) return new Intl.NumberFormat("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
  try {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency, currencyDisplay: "code" })
      .format(n).replace(/ /g, " ");
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

export function formatNumber(n) {
  const v = toNumber(n);
  return v === null ? "—" : new Intl.NumberFormat("en-GB").format(v);
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export function formatDate(isoDate) {
  if (!isoDate) return "—";
  const d = DATE_ONLY.test(isoDate) ? new Date(`${isoDate}T00:00:00Z`) : new Date(isoDate);
  if (Number.isNaN(d.getTime())) return String(isoDate);
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric", month: "short", year: "numeric", timeZone: DATE_ONLY.test(isoDate) ? "UTC" : undefined
  }).format(d);
}

export function formatDateTime(iso) {
  if (!iso) return "—";
  // Local wall-clock times without a zone (e.g. hotel-local incident times) are shown as written.
  const local = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(iso);
  const d = new Date(local ? `${iso}Z` : iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
    timeZone: local ? "UTC" : undefined
  }).format(d);
}

export function formatTime(iso) {
  if (!iso) return "";
  const m = /T(\d{2}:\d{2})/.exec(iso);
  return m ? m[1] : "";
}

export function relativeTime(iso) {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "yesterday" : `${d} days ago`;
}

export function badge(text, variant = "neutral") {
  return el("span", { class: `badge badge--${variant}`, text });
}

const SCOPE_LABEL = { GLOBAL: "Global", REGION: "Region", COUNTRY: "Country", HOTEL: "Hotel" };

export function scopeLabel(policy) {
  if (!policy) return "—";
  switch (policy.scope) {
    case "GLOBAL": return "Global";
    case "REGION": return `Region · ${regionName(policy.region)}`;
    case "COUNTRY": return `Country · ${flag(policy.countryCode)} ${policy.countryCode}`;
    case "HOTEL": return `Hotel · ${policy.hotelId}`;
    default: return SCOPE_LABEL[policy.scope] || policy.scope || "—";
  }
}

export function scopeBadge(policy) {
  const variant = { GLOBAL: "neutral", REGION: "info", COUNTRY: "info", HOTEL: "gold" }[policy && policy.scope] || "neutral";
  const node = badge(scopeLabel(policy), variant);
  node.classList.add("badge--scope");
  return node;
}

export function languageBadge(code) {
  const node = el("span", { class: "badge badge--lang", title: languageName(code) },
    el("span", { class: "badge__code", text: (code || "?").toUpperCase() }), languageName(code));
  return node;
}

let modalDepth = 0;

export function openModal({ title, body, wide = false, actions = [], subtitle } = {}) {
  const previousFocus = document.activeElement;
  const closeBtn = el("button", { class: "icon-btn", type: "button", "aria-label": "Close" }, icon("x", 18));
  const dialog = el("div", { class: ["modal", wide && "modal--wide"], role: "dialog", "aria-modal": "true", "aria-label": title || "Dialog", tabindex: "-1" },
    el("header", { class: "modal__header" },
      el("div", { class: "modal__titles" },
        el("h2", { class: "modal__title", text: title || "" }),
        subtitle ? el("p", { class: "modal__subtitle", text: subtitle }) : null),
      closeBtn),
    el("div", { class: "modal__body" }, body || null),
    actions && actions.length ? el("footer", { class: "modal__footer" }, actions) : null);
  const overlay = el("div", { class: "modal-overlay" }, dialog);
  let closed = false;

  function onKey(event) {
    if (event.key === "Escape" && overlay === document.querySelector(".modal-overlay:last-of-type")) close();
  }
  function close() {
    if (closed) return;
    closed = true;
    document.removeEventListener("keydown", onKey);
    overlay.classList.add("is-leaving");
    setTimeout(() => overlay.remove(), 160);
    modalDepth -= 1;
    if (modalDepth <= 0) document.body.classList.remove("has-modal");
    if (previousFocus && previousFocus.focus) previousFocus.focus();
  }
  closeBtn.addEventListener("click", close);
  overlay.addEventListener("mousedown", (event) => { if (event.target === overlay) close(); });
  document.addEventListener("keydown", onKey);
  document.body.appendChild(overlay);
  document.body.classList.add("has-modal");
  modalDepth += 1;
  requestAnimationFrame(() => dialog.focus());
  return { close, element: dialog };
}

export function openPdfViewer({ title, url, subtitle }) {
  const frame = el("iframe", { class: "pdf-frame", src: url, title: title || "Policy document" });
  const open = el("a", { class: "btn btn--ghost", href: url, target: "_blank", rel: "noopener" }, icon("external"), "Open in new tab");
  const body = el("div", { class: "pdf-viewer" }, frame);
  return openModal({ title, subtitle, body, wide: true, actions: [open] });
}

let toastHost = null;

export function toast(message, variant = "neutral") {
  if (!toastHost || !toastHost.isConnected) {
    toastHost = el("div", { class: "toasts", role: "status", "aria-live": "polite" });
    document.body.appendChild(toastHost);
  }
  const iconName = { success: "check", danger: "alert", warning: "alert" }[variant] || "sparkle";
  const node = el("div", { class: `toast toast--${variant}` }, icon(iconName), el("span", { text: message }));
  toastHost.appendChild(node);
  setTimeout(() => { node.classList.add("is-leaving"); setTimeout(() => node.remove(), 250); }, variant === "danger" ? 6500 : 3800);
  return node;
}

export function emptyState(title, text, ...actions) {
  return el("div", { class: "empty" },
    el("div", { class: "empty__mark", "aria-hidden": "true" }, el("span", { text: "R" })),
    el("h3", { class: "empty__title", text: title }),
    text ? el("p", { class: "empty__text", text }) : null,
    actions.length ? el("div", { class: "empty__actions" }, actions) : null);
}

export function errorState(title, error, onRetry) {
  return el("div", { class: "empty empty--error" },
    el("div", { class: "empty__mark", "aria-hidden": "true" }, icon("alert", 22)),
    el("h3", { class: "empty__title", text: title }),
    el("p", { class: "empty__text", text: error && error.message ? error.message : String(error || "") }),
    onRetry ? el("div", { class: "empty__actions" },
      el("button", { class: "btn btn--ghost", type: "button", onclick: onRetry }, icon("refresh"), "Try again")) : null);
}

export function spinner(label) {
  return el("div", { class: "spinner", role: "status" },
    el("span", { class: "spinner__ring", "aria-hidden": "true" }),
    label ? el("span", { class: "spinner__label", text: label }) : null);
}

export function skeleton(lines = 3, className = "") {
  return el("div", { class: ["skeleton", className], "aria-hidden": "true" },
    Array.from({ length: lines }, (_, i) => el("span", { class: "skeleton__line", style: { width: `${92 - (i % 3) * 17}%` } })));
}

export function initials(name) {
  return String(name || "?").replace(/\(.*?\)/g, "").trim().split(/\s+/).slice(0, 2).map((p) => p[0] || "").join("").toUpperCase();
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast("Link copied to clipboard", "success");
  } catch {
    toast("Could not copy — select the link and copy it manually", "warning");
  }
}

// ---------- Portal-specific helpers (not part of the shared contract, safe to use) ----------

export function pageHeader({ eyebrow, title, subtitle, actions, back }) {
  return el("header", { class: "page-header" },
    el("div", { class: "page-header__text" },
      back ? el("a", { class: "page-header__back", href: back.href }, icon("arrowLeft", 14), back.label) : null,
      eyebrow ? el("div", { class: "eyebrow" }, eyebrow) : null,
      el("h1", { class: "page-title" }, title),
      subtitle ? el("p", { class: "page-subtitle" }, subtitle) : null),
    actions && actions.length ? el("div", { class: "page-header__actions" }, actions) : null);
}

export function formatRange(checkIn, checkOut) {
  if (!checkIn || !checkOut) return formatDate(checkIn || checkOut);
  const a = new Date(`${checkIn}T00:00:00Z`);
  const b = new Date(`${checkOut}T00:00:00Z`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return `${checkIn} – ${checkOut}`;
  const day = (d) => d.getUTCDate();
  const mon = (d) => new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" }).format(d);
  if (a.getUTCFullYear() === b.getUTCFullYear()) {
    if (a.getUTCMonth() === b.getUTCMonth()) return `${day(a)}–${day(b)} ${mon(b)} ${b.getUTCFullYear()}`;
    return `${day(a)} ${mon(a)} – ${day(b)} ${mon(b)} ${b.getUTCFullYear()}`;
  }
  return `${formatDate(checkIn)} – ${formatDate(checkOut)}`;
}

export function decisionBadge(decision) {
  const map = {
    REFUND: ["Refund", "success"], NO_REFUND: ["No refund", "danger"], NEEDS_MORE_INFO: ["Needs more info", "warning"]
  };
  const [text, variant] = map[decision] || [decision || "—", "neutral"];
  const node = badge(text, variant);
  node.classList.add("badge--pill");
  return node;
}

export function statusBadge(status) {
  const map = { PENDING_APPROVAL: ["Awaiting decision", "gold"], APPROVED: ["Approved", "success"], REJECTED: ["Rejected", "danger"] };
  const [text, variant] = map[status] || [status || "—", "neutral"];
  const node = badge(text, variant);
  node.classList.add("badge--dot");
  return node;
}

export function approvalBadge(level) {
  const variant = { REPRESENTATIVE: "neutral", DUTY_MANAGER: "warning", REGIONAL_DIRECTOR: "danger" }[level] || "neutral";
  return badge(roleName(level), variant);
}

export function tierBadge(tier) {
  if (!tier) return badge("Tier unavailable", "neutral");
  const node = el("span", { class: `tier tier--${String(tier).toLowerCase()}` }, icon("star", 12), tier.charAt(0) + tier.slice(1).toLowerCase());
  return node;
}

export const INCIDENT_LABELS = {
  AIR_CONDITIONING: "Air conditioning", HEATING: "Heating", HOT_WATER: "Hot water", NOISE: "Noise", POWER: "Power",
  FACILITY_CLOSURE: "Facility closure", WEATHER: "Weather", CLEANLINESS: "Cleanliness"
};

export const CAUSE_LABELS = {
  HOTEL_EQUIPMENT: "Hotel equipment", HOTEL_WORKS: "Hotel works", HOTEL_EVENT: "Hotel event", HOTEL_MAINTENANCE: "Hotel maintenance",
  EXTERNAL_GRID: "External grid", EXTERNAL_STORM: "External storm", WEATHER_WARNING: "Weather warning"
};

export const CATEGORY_LABELS = { CITY: "City", RESORT: "Resort", SAFARI_LODGE: "Safari lodge", RYOKAN: "Ryokan" };

export const CHANNEL_LABELS = { PHONE: "Phone", EMAIL: "Email", FRONT_DESK: "Front desk", CHAT: "Chat" };

export function clauseChip(clauseId) {
  return el("span", { class: "clause-chip", text: clauseId || "—" });
}

// Full-screen progress for long agent calls. steps: optional list of messages shown in turn.
export function busyOverlay(title, text, steps = []) {
  const stepList = steps.length ? el("ol", { class: "busy__steps" }, steps.map((s) => el("li", { text: s }))) : null;
  const node = el("div", { class: "busy", role: "alertdialog", "aria-live": "polite", "aria-label": title },
    el("div", { class: "busy__card" },
      el("div", { class: "busy__mark", "aria-hidden": "true" }, el("span"), el("span"), el("span")),
      el("h2", { class: "busy__title", text: title }),
      text ? el("p", { class: "busy__text", text }) : null,
      stepList,
      el("div", { class: "busy__elapsed", text: "0 s" })));
  const started = Date.now();
  const elapsed = node.querySelector(".busy__elapsed");
  const items = stepList ? [...stepList.children] : [];
  const tick = () => {
    const seconds = Math.round((Date.now() - started) / 1000);
    elapsed.textContent = `${seconds} s elapsed`;
    // Advance through the steps roughly every 7 s, holding on the last one.
    const current = Math.min(items.length - 1, Math.floor(seconds / 7));
    items.forEach((item, i) => {
      item.classList.toggle("is-done", i < current);
      item.classList.toggle("is-active", i === current);
    });
  };
  tick();
  const timer = setInterval(tick, 1000);
  document.body.appendChild(node);
  document.body.classList.add("has-modal");
  return {
    element: node,
    close() {
      clearInterval(timer);
      node.remove();
      if (!document.querySelector(".modal-overlay")) document.body.classList.remove("has-modal");
    }
  };
}

// Replaces a node's children using el()'s child rules (null skipped, arrays flattened, strings as text).
export function mount(node, ...children) {
  node.replaceChildren();
  append(node, children);
  return node;
}
