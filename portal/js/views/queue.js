// Refund queue: KPIs, regional breakdown and the case table, scoped by the region / country filter.
import {
  el, mount, icon, flag, regionName, languageName, formatMoney, formatNumber, relativeTime, formatRange, REGIONS,
  pageHeader, decisionBadge, statusBadge, approvalBadge, roleRank, emptyState, errorState, skeleton
} from "../ui.js";

const STATUS_FILTERS = [
  { code: "ALL", label: "All" },
  { code: "PENDING_APPROVAL", label: "Awaiting decision" },
  { code: "APPROVED", label: "Approved" },
  { code: "REJECTED", label: "Rejected" }
];

let statusFilter = "ALL";
let searchText = "";

const DAY = 24 * 60 * 60 * 1000;

export async function render(container, ctx) {
  const { refundApi } = ctx.api;
  const header = pageHeader({
    eyebrow: [icon("globe", 13), ctx.scopeLabel()],
    title: "Refund queue",
    subtitle: "Guest compensation requests assessed by the refund agent. Every refund is paid only after a person approves it.",
    actions: [el("a", { class: "btn btn--primary", href: "#/new" }, icon("plus"), "New request")]
  });
  const body = el("div", { class: "queue" },
    el("div", { class: "kpis" }, Array.from({ length: 4 }, () => el("div", { class: "kpi kpi--loading" }, skeleton(2)))),
    el("div", { class: "card" }, skeleton(6, "skeleton--table")));
  mount(container, header, body);

  let cases;
  try {
    cases = await refundApi.listCases({});
    if (!Array.isArray(cases)) cases = [];
  } catch (error) {
    mount(body, errorState("The refund queue could not be loaded", error, () => ctx.rerender()));
    return;
  }

  const scoped = cases.filter((c) => ctx.inScope(ctx.caseScope(c)));
  mount(body, 
    kpis(scoped, ctx),
    regionStrip(cases, ctx),
    caseTable(scoped, cases.length, ctx));
}

function isEscalation(c) {
  return c.status === "PENDING_APPROVAL" && c.proposal && roleRank(c.proposal.approvalLevel) > 0;
}

function approvedRecently(c) {
  if (c.status !== "APPROVED" || !c.decision) return false;
  const t = new Date(c.decision.decidedAt || c.updatedAt).getTime();
  return Date.now() - t <= 7 * DAY;
}

function refundedUsd(list) {
  return list
    .filter((c) => c.status === "APPROVED" && c.proposal && c.proposal.decision === "REFUND")
    .reduce((sum, c) => sum + (Number(c.proposal.refundAmountUsd) || 0), 0);
}

function kpis(list, ctx) {
  const pending = list.filter((c) => c.status === "PENDING_APPROVAL");
  const escalations = list.filter(isEscalation);
  const approved7 = list.filter(approvedRecently);
  const usd = refundedUsd(list);
  const overRole = escalations.filter((c) => roleRank(c.proposal.approvalLevel) > roleRank(ctx.state.role)).length;
  return el("section", { class: "kpis", "aria-label": "Queue summary" },
    kpi("Awaiting decision", formatNumber(pending.length), pending.length ? `Oldest ${relativeTime(oldest(pending))}` : "Queue is clear", "inbox", "gold",
      () => setStatus("PENDING_APPROVAL", ctx)),
    kpi("Needs escalation", formatNumber(escalations.length),
      escalations.length ? (overRole ? `${overRole} above your approval authority` : "Within your approval authority") : "All within representative limits",
      "shield", escalations.length ? "warning" : "neutral"),
    kpi("Approved · last 7 days", formatNumber(approved7.length), `${formatNumber(list.filter((c) => c.status === "APPROVED").length)} approved in total`, "check", "success",
      () => setStatus("APPROVED", ctx)),
    kpi("Total refunded", formatMoney(Math.round(usd), "USD").replace(/\.00$/, ""), "USD equivalent at policy reference rates", "sparkle", "ink"));
}

function oldest(list) {
  return list.map((c) => c.createdAt).sort()[0];
}

function kpi(label, value, note, iconName, tone, onClick) {
  const tag = onClick ? "button" : "div";
  return el(tag, { class: `kpi kpi--${tone}`, type: onClick ? "button" : undefined, onclick: onClick },
    el("div", { class: "kpi__top" }, el("span", { class: "kpi__label", text: label }), el("span", { class: "kpi__icon" }, icon(iconName, 16))),
    el("div", { class: "kpi__value", text: value }),
    el("div", { class: "kpi__note", text: note }));
}

function setStatus(code, ctx) {
  statusFilter = code;
  ctx.rerender();
}

function regionStrip(all, ctx) {
  const total = all.length || 1;
  const items = REGIONS.map((r) => {
    const list = all.filter((c) => ctx.caseScope(c).region === r.code);
    const pending = list.filter((c) => c.status === "PENDING_APPROVAL").length;
    const usd = refundedUsd(list);
    const active = ctx.state.region === r.code;
    const dimmed = ctx.state.region && !active;
    return el("button", {
      class: ["region-tile", active && "is-active", dimmed && "is-dimmed"], type: "button",
      "aria-pressed": String(active), title: active ? "Show all regions" : `Show ${r.name} only`,
      onclick: () => ctx.setFilter(active ? null : r.code, null)
    },
      el("div", { class: "region-tile__head" },
        el("span", { class: "region-tile__name", text: r.name }),
        el("span", { class: "region-tile__count", text: `${list.length} ${list.length === 1 ? "case" : "cases"}` })),
      el("div", { class: "region-tile__bar" }, el("span", { style: { width: `${Math.round((list.length / total) * 100)}%` } })),
      el("div", { class: "region-tile__meta" },
        el("span", null, el("strong", { text: String(pending) }), " awaiting"),
        el("span", null, el("strong", { text: formatMoney(Math.round(usd), "USD").replace(/\.00$/, "") }), " refunded")));
  });
  return el("section", { class: "region-strip", "aria-label": "Cases by region" }, items);
}

function caseTable(scoped, allCount, ctx) {
  const counts = Object.fromEntries(STATUS_FILTERS.map((f) => [f.code, f.code === "ALL" ? scoped.length : scoped.filter((c) => c.status === f.code).length]));
  const q = searchText.trim().toLowerCase();
  const rows = scoped
    .filter((c) => statusFilter === "ALL" || c.status === statusFilter)
    .filter((c) => !q || haystack(c).includes(q))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

  const tbody = el("tbody");
  const search = el("input", {
    class: "input input--search", type: "search", placeholder: "Search case, guest, hotel or reservation", value: searchText, "aria-label": "Search cases",
    oninput: (e) => { searchText = e.target.value; refreshRows(); }
  });

  const tabs = el("div", { class: "tabs", role: "tablist", "aria-label": "Status" },
    STATUS_FILTERS.map((f) => el("button", {
      class: ["tabs__item", statusFilter === f.code && "is-active"], type: "button", role: "tab",
      "aria-selected": String(statusFilter === f.code), onclick: () => setStatus(f.code, ctx)
    }, f.label, el("span", { class: "tabs__count", text: String(counts[f.code]) }))));

  const wrap = el("div", { class: "table-wrap" });
  function refreshRows() {
    const query = searchText.trim().toLowerCase();
    const visible = scoped
      .filter((c) => statusFilter === "ALL" || c.status === statusFilter)
      .filter((c) => !query || haystack(c).includes(query))
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    mount(tbody, ...visible.map((c) => row(c, ctx)));
    if (!visible.length) {
      mount(wrap, emptyFor(scoped, allCount, query, ctx));
    } else if (!wrap.contains(tbody)) {
      mount(wrap, table);
    }
  }

  const table = el("table", { class: "table table--cases" },
    el("thead", null, el("tr", null,
      el("th", { text: "Case" }), el("th", { text: "Guest" }), el("th", { text: "Hotel" }), el("th", { text: "Stay" }),
      el("th", { text: "Recommendation" }), el("th", { class: "col-approval", text: "Approval" }), el("th", { text: "Status" }))),
    tbody);
  mount(tbody, ...rows.map((c) => row(c, ctx)));
  mount(wrap, rows.length ? table : emptyFor(scoped, allCount, q, ctx));

  return el("section", { class: "card card--flush" },
    el("div", { class: "card__toolbar" }, tabs, el("div", { class: "search-field" }, icon("search", 15), search)),
    wrap);
}

function emptyFor(scoped, allCount, query, ctx) {
  if (!allCount) {
    return emptyState("No refund requests yet", "When a guest raises a complaint, log it as a new request and the refund agent will assess it against the policies in force.",
      el("a", { class: "btn btn--primary", href: "#/new" }, icon("plus"), "Log the first request"));
  }
  if (!scoped.length) {
    return emptyState(`No refund requests in ${ctx.scopeLabel()}`, "There are cases elsewhere in the network. Widen the scope to see them.",
      el("button", { class: "btn btn--ghost", type: "button", onclick: () => ctx.setFilter(null, null) }, icon("globe"), "Show all regions"));
  }
  return emptyState(query ? "No cases match your search" : "Nothing here", query ? `Nothing matches “${query}”.` : "No cases with this status in the current scope.");
}

function haystack(c) {
  const r = c.reservation || {};
  return [c.caseNumber, c.reservationId, r.guest && r.guest.name, r.hotel && r.hotel.name, r.hotel && r.hotel.city, r.hotel && r.hotel.countryName]
    .filter(Boolean).join(" ").toLowerCase();
}

function row(c, ctx) {
  const r = c.reservation || {};
  const hotel = r.hotel || {};
  const guest = r.guest || {};
  const p = c.proposal || {};
  const overRole = c.status === "PENDING_APPROVAL" && roleRank(p.approvalLevel) > roleRank(ctx.state.role);
  const href = `#/cases/${encodeURIComponent(c.id)}`;
  return el("tr", { class: ["case-row", c.status === "PENDING_APPROVAL" && "is-pending"], tabindex: "0",
    onclick: (e) => { if (!e.target.closest("a")) ctx.navigate(href); },
    onkeydown: (e) => { if (e.key === "Enter") ctx.navigate(href); } },
    el("td", null,
      el("a", { class: "case-number", href, text: c.caseNumber || c.id }),
      el("div", { class: "cell-sub", text: `${relativeTime(c.createdAt)}${c.channel ? ` · ${c.channel.replace("_", " ").toLowerCase()}` : ""}` })),
    el("td", null,
      el("div", { class: "cell-main", text: guest.name || "—" }),
      el("div", { class: "cell-sub" }, el("span", { class: "lang-code", text: (guest.preferredLanguage || "").toUpperCase() }), languageName(guest.preferredLanguage))),
    el("td", null,
      el("div", { class: "cell-main cell-hotel" }, el("span", { class: "flag", text: flag(hotel.countryCode) }), shortHotel(hotel.name)),
      el("div", { class: "cell-sub", text: [hotel.city, regionName(hotel.region)].filter(Boolean).join(" · ") })),
    el("td", null,
      el("div", { class: "cell-main", text: formatRange(r.checkIn, r.checkOut) }),
      el("div", { class: "cell-sub", text: r.nights ? `${r.nights} ${r.nights === 1 ? "night" : "nights"} · ${c.reservationId}` : c.reservationId })),
    el("td", null,
      decisionBadge(p.decision),
      el("div", { class: "cell-amount", text: p.decision === "REFUND" ? formatMoney(p.refundAmount, p.currency) : "—" }),
      el("div", { class: "cell-approval-inline" }, approvalBadge(p.approvalLevel))),
    el("td", { class: "col-approval" },
      approvalBadge(p.approvalLevel),
      overRole ? el("div", { class: "cell-sub cell-sub--warn" }, icon("shield", 12), "Above your authority") : null),
    el("td", null, statusBadge(c.status)));
}

export function shortHotel(name) {
  return String(name || "—").replace(/^ReverieEscapes\s+/, "");
}
