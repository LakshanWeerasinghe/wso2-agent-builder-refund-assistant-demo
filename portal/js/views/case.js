// Refund case: the stay and its incident records, the agent's recommendation, the policy stack and the decision.
import {
  el, mount, icon, flag, regionName, languageName, roleName, roleRank, formatMoney, formatNumber, formatDate, formatDateTime,
  formatTime, formatRange, relativeTime, badge, scopeBadge, languageBadge, decisionBadge, statusBadge, approvalBadge,
  tierBadge, clauseChip, openModal, openPdfViewer, toast, emptyState, errorState, skeleton, spinner, pageHeader, initials,
  copyText, busyOverlay, INCIDENT_LABELS, CAUSE_LABELS, CATEGORY_LABELS, CHANNEL_LABELS
} from "../ui.js";

// Unsaved decision drafts survive re-renders (role or region switch) for the current proposal.
const drafts = new Map();

export async function render(container, ctx) {
  const { refundApi } = ctx.api;
  const id = ctx.params[0];
  mount(container, 
    el("div", { class: "page-header" }, skeleton(3)),
    el("div", { class: "case-layout" },
      el("div", { class: "case-main" }, el("div", { class: "card" }, skeleton(5)), el("div", { class: "card" }, skeleton(8))),
      el("div", { class: "case-side" }, el("div", { class: "card" }, skeleton(7)))));

  let data;
  try {
    data = await refundApi.getCase(id);
  } catch (error) {
    mount(container, error.status === 404
      ? emptyState("Case not found", `There is no refund case with the id “${id}”. It may belong to an earlier demo run — cases are kept in memory.`,
        el("a", { class: "btn btn--ghost", href: "#/queue" }, icon("arrowLeft"), "Back to the queue"))
      : errorState("This case could not be loaded", error, () => ctx.rerender()));
    return;
  }
  draw(container, ctx, data);
}

function draw(container, ctx, c) {
  const r = c.reservation || {};
  const hotel = r.hotel || {};
  const guest = r.guest || {};
  const p = c.proposal || {};
  const policies = [...(c.applicablePolicies || [])].sort((a, b) => (b.precedence || 0) - (a.precedence || 0));
  const cited = citedClauses(p);
  const pending = c.status === "PENDING_APPROVAL";

  const header = pageHeader({
    back: { href: "#/queue", label: "Refund queue" },
    eyebrow: [el("span", { class: "flag", text: flag(hotel.countryCode) }), `${hotel.name || ""} · ${regionName(hotel.region)}`],
    title: [el("span", { text: c.caseNumber || c.id }), statusBadge(c.status)],
    subtitle: [
      `Logged ${formatDateTime(c.createdAt)} (${relativeTime(c.createdAt)}) by ${c.createdBy || "—"}`,
      c.channel ? ` via ${(CHANNEL_LABELS[c.channel] || c.channel).toLowerCase()}` : "",
      ` · ${c.reservationId}`
    ].join(""),
    actions: pending ? [reassessButton(ctx, c)] : []
  });

  const scopeNotice = !ctx.inScope(ctx.caseScope(c))
    ? el("div", { class: "callout callout--info scope-notice" }, icon("globe"),
      el("span", null, `This case belongs to ${regionName(hotel.region)} (${flag(hotel.countryCode)} ${hotel.countryName || hotel.countryCode}), outside your current scope: ${ctx.scopeLabel()}.`),
      el("button", { class: "btn btn--ghost btn--sm", type: "button", onclick: () => ctx.setFilter(hotel.region, null) }, `Switch to ${regionName(hotel.region)}`))
    : null;

  const loyaltySlot = el("div", { class: "loyalty-slot" }, el("span", { class: "muted", text: "Loading loyalty…" }));

  mount(container, 
    header,
    scopeNotice,
    el("div", { class: "case-layout" },
      el("div", { class: "case-main" },
        complaintCard(c, r),
        recommendationCard(ctx, c, p, policies),
        pending ? decisionPanel(ctx, c, p, policies, cited) : outcomePanel(ctx, c, p, policies)),
      el("aside", { class: "case-side" },
        guestStayCard(r, hotel, guest, loyaltySlot),
        policyStackCard(ctx, policies, cited))));

  loadLoyalty(ctx, guest, loyaltySlot);
}

async function loadLoyalty(ctx, guest, slot) {
  if (!guest.guestId) { mount(slot, tierBadge(null)); return; }
  try {
    const profile = await ctx.api.guestApi.loyalty(guest.guestId);
    mount(slot, 
      tierBadge(profile.tier),
      el("span", { class: "muted", text: `${formatNumber(profile.pointsBalance)} pts · member since ${formatDate(profile.memberSince)}` }));
  } catch {
    mount(slot, el("span", { class: "muted", text: "Reverie Circle profile unavailable" }));
  }
}

function citedClauses(p) {
  const map = new Map();
  for (const ci of p.citations || []) {
    if (!map.has(ci.documentId)) map.set(ci.documentId, []);
    map.get(ci.documentId).push(ci.clauseId);
  }
  return map;
}

function policyFor(policies, documentId) {
  return policies.find((x) => x.documentId === documentId) || null;
}

function pdfUrl(ctx, policy, documentId) {
  return policy && policy.documentUrl ? ctx.api.policyApi.absoluteUrl(policy.documentUrl) : ctx.api.policyApi.documentUrl(documentId);
}

function viewPdf(ctx, policy, documentId) {
  openPdfViewer({
    title: policy ? policy.title : documentId,
    subtitle: policy ? [documentId, `v${policy.version}`, languageName(policy.language), policy.titleEnglish !== policy.title ? policy.titleEnglish : null].filter(Boolean).join(" · ") : documentId,
    url: pdfUrl(ctx, policy, documentId)
  });
}

// ---------- Complaint & incidents ----------

function complaintCard(c, r) {
  const incidents = [...(r.incidents || [])].sort((a, b) => String(a.startedAt).localeCompare(String(b.startedAt)));
  return el("section", { class: "card" },
    el("div", { class: "card__header" },
      el("h2", { class: "card__title", text: "The guest’s complaint" }),
      el("span", { class: "card__meta" }, icon(c.channel === "PHONE" ? "phone" : "message", 14), CHANNEL_LABELS[c.channel] || c.channel || "")),
    el("blockquote", { class: "complaint", text: c.complaint || "—" }),
    el("div", { class: "subhead" },
      el("h3", { class: "subhead__title", text: "Incident records for this stay" }),
      el("span", { class: "subhead__meta", text: incidents.length ? `${incidents.length} logged by the property` : "None logged" })),
    incidents.length
      ? el("ol", { class: "timeline" }, incidents.map(incidentItem))
      : el("div", { class: "callout callout--warning" }, icon("alert"),
        el("span", { text: "The property’s maintenance and incident logs contain nothing for this stay. Under the global policy only verified incidents are compensated." })));
}

function incidentItem(i) {
  const day = i.date ? new Date(`${i.date}T00:00:00Z`) : null;
  const sameDay = i.startedAt && i.endedAt && i.startedAt.slice(0, 10) === i.endedAt.slice(0, 10);
  const range = `${formatTime(i.startedAt)} → ${sameDay ? "" : `${formatDate(i.endedAt.slice(0, 10)).replace(/ \d{4}$/, "")}, `}${formatTime(i.endedAt)}`;
  const external = /^EXTERNAL|WEATHER/.test(i.cause || "");
  return el("li", { class: ["timeline__item", `timeline__item--${String(i.category || "").toLowerCase()}`] },
    el("div", { class: "timeline__date" },
      el("span", { class: "timeline__day", text: day ? String(day.getUTCDate()) : "—" }),
      el("span", { class: "timeline__month", text: day ? new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" }).format(day) : "" })),
    el("div", { class: "timeline__body" },
      el("div", { class: "timeline__head" },
        el("strong", { text: INCIDENT_LABELS[i.category] || i.category }),
        badge(CAUSE_LABELS[i.cause] || i.cause, external ? "info" : "neutral"),
        el("span", { class: "timeline__time" }, icon("clock", 12), `${range} · ${formatNumber(i.durationHours)} h`)),
      el("p", { class: "timeline__text", text: i.description || "" }),
      el("div", { class: "timeline__meta" },
        i.verifiedBy ? el("span", { class: "meta-ok" }, icon("check", 12), `Verified · ${i.verifiedBy}`) : el("span", { class: "meta-warn" }, icon("alert", 12), "Not verified"),
        el("span", { class: i.reportedByGuest ? "meta-ok" : "meta-muted" }, icon(i.reportedByGuest ? "check" : "x", 12), i.reportedByGuest ? "Reported by guest" : "Not reported by guest"),
        i.guestMoved ? el("span", { class: "meta-muted" }, icon("bed", 12), "Guest moved") : null,
        el("span", { class: "meta-id", text: i.incidentId }))));
}

// ---------- Recommendation ----------

function reassessButton(ctx, c) {
  const button = el("button", { class: "btn btn--ghost", type: "button" }, icon("refresh"), "Re-assess with latest policies");
  button.addEventListener("click", () => reassess(ctx, c, button));
  return button;
}

async function reassess(ctx, c, button) {
  const before = c.proposal || {};
  button.disabled = true;
  const busy = busyOverlay("Re-assessing with the latest policies", "The agent re-reads the reservation and retrieves the policy clauses in force today. This usually takes 20–60 seconds.");
  try {
    const updated = await ctx.api.refundApi.reassess(c.id);
    const after = updated.proposal || {};
    const changed = String(before.refundAmount) !== String(after.refundAmount) || before.decision !== after.decision;
    toast(changed
      ? `Re-assessed: ${formatMoney(before.refundAmount, before.currency)} → ${formatMoney(after.refundAmount, after.currency)}`
      : "Re-assessed — the recommendation is unchanged", changed ? "success" : "neutral");
    ctx.refreshShell();
    ctx.rerender();
  } catch (error) {
    toast(`Re-assessment failed: ${error.message}`, "danger");
    button.disabled = false;
  } finally {
    busy.close();
  }
}

function recommendationCard(ctx, c, p, policies) {
  const affectedNights = new Set((p.lines || []).filter((l) => Number(l.percentage) > 0).map((l) => l.date)).size;
  const amountText = formatMoney(p.refundAmount, p.currency);
  const hero = el("div", { class: ["reco", `reco--${String(p.decision || "").toLowerCase()}`] },
    el("div", { class: "reco__main" },
      el("div", { class: "reco__label" }, icon("sparkle", 14), "Agent recommendation", decisionBadge(p.decision)),
      el("div", { class: "reco__amount" },
        el("span", { class: "reco__currency", text: p.currency || "" }),
        el("span", { class: "reco__figure", text: amountText.replace(/^[A-Z]{3}\s?/, "") })),
      el("div", { class: "reco__usd", text: p.currency && p.currency !== "USD" ? `≈ ${formatMoney(p.refundAmountUsd, "USD")} at policy reference rates` : "Booking currency" })),
    el("dl", { class: "reco__stats" },
      stat("Reverie Circle points", formatNumber(p.bonusPoints)),
      stat("Approval level", approvalBadge(p.approvalLevel)),
      stat("Compensated nights", affectedNights ? String(affectedNights) : "—"),
      stat("Policies applied", String((p.citations || []).length ? new Set(p.citations.map((x) => x.documentId)).size : 0))));

  const history = (c.proposalHistory || []).length ? historyBlock(c) : null;

  return el("section", { class: "card card--reco" },
    el("div", { class: "card__header" },
      el("h2", { class: "card__title", text: "Recommendation" }),
      el("span", { class: "card__meta", text: c.updatedAt ? `Assessed ${relativeTime(lastAssessed(c))}` : "" })),
    hero,
    history,
    el("div", { class: "subhead" }, el("h3", { class: "subhead__title", text: "Calculation" }),
      el("span", { class: "subhead__meta", text: "Percentages apply to the nightly room rate, excluding taxes and fees" })),
    linesTable(p),
    el("div", { class: "subhead" }, el("h3", { class: "subhead__title", text: "Reasoning" }),
      el("span", { class: "subhead__meta", text: "For the representative · English" })),
    reasoningBlock(p.reasoning),
    el("div", { class: "subhead" }, el("h3", { class: "subhead__title", text: "Clauses cited" }),
      el("span", { class: "subhead__meta", text: `${(p.citations || []).length} clauses · original language is authoritative` })),
    citationsList(ctx, p, policies));
}

function lastAssessed(c) {
  return c.updatedAt || c.createdAt;
}

function stat(label, value) {
  return el("div", { class: "stat" }, el("dt", { text: label }), el("dd", null, value));
}

function linesTable(p) {
  const lines = p.lines || [];
  if (!lines.length) {
    return el("div", { class: "callout callout--neutral" }, icon("file"),
      el("span", { text: p.decision === "REFUND" ? "No calculation lines were returned." : "No compensable nights — nothing to calculate." }));
  }
  return el("div", { class: "table-wrap" },
    el("table", { class: "table table--lines" },
      el("thead", null, el("tr", null,
        el("th", { text: "Date" }), el("th", { text: "Item" }), el("th", { text: "Clause" }),
        el("th", { class: "num", text: "Rate" }), el("th", { class: "num", text: "Amount" }))),
      el("tbody", null, lines.map((l) => el("tr", null,
        el("td", { class: "nowrap", text: formatDate(l.date).replace(/ \d{4}$/, "") }),
        el("td", { text: l.description || "" }),
        el("td", null, clauseChip(l.clauseId)),
        el("td", { class: "num", text: Number(l.percentage) > 0 ? `${formatNumber(l.percentage)}%` : "Fixed" }),
        el("td", { class: "num strong", text: formatMoney(l.amount, p.currency) })))),
      el("tfoot", null, el("tr", null,
        el("td", { colspan: "4", text: "Total refund" }),
        el("td", { class: "num total", text: formatMoney(p.refundAmount, p.currency) })))));
}

function reasoningBlock(text) {
  const paragraphs = String(text || "No reasoning was provided.").split(/\n{2,}|\n(?=[-•*]\s)/).map((s) => s.trim()).filter(Boolean);
  const body = el("div", { class: "reasoning" }, paragraphs.map((s) => el("p", { text: s })));
  if (String(text || "").length < 600) return body;
  body.classList.add("is-clamped");
  const toggle = el("button", { class: "link-btn", type: "button", text: "Read the full reasoning" });
  toggle.addEventListener("click", () => {
    const clamped = body.classList.toggle("is-clamped");
    toggle.textContent = clamped ? "Read the full reasoning" : "Show less";
  });
  return el("div", null, body, toggle);
}

function citationsList(ctx, p, policies) {
  const citations = p.citations || [];
  if (!citations.length) return el("p", { class: "muted", text: "No clauses were cited." });
  return el("ul", { class: "citations" }, citations.map((ci) => {
    const policy = policyFor(policies, ci.documentId);
    return el("li", { class: "citation" },
      el("div", { class: "citation__chip" }, clauseChip(ci.clauseId)),
      el("div", { class: "citation__body" },
        el("div", { class: "citation__doc" },
          el("span", { class: "citation__title", text: policy ? policy.title : ci.documentId }),
          policy && policy.titleEnglish && policy.titleEnglish !== policy.title ? el("span", { class: "citation__en", text: policy.titleEnglish }) : null),
        el("p", { class: "citation__summary", text: ci.summary || "" }),
        el("div", { class: "citation__badges" },
          languageBadge(ci.language || (policy && policy.language)),
          policy ? scopeBadge(policy) : null,
          policy && policy.policyType === "SEASONAL" ? badge("Seasonal", "seasonal") : null,
          el("span", { class: "meta-id", text: ci.documentId }))),
      el("button", { class: "btn btn--ghost btn--sm", type: "button", onclick: () => viewPdf(ctx, policy, ci.documentId) }, icon("file", 14), "View PDF"));
  }));
}

function historyBlock(c) {
  const entries = [...(c.proposalHistory || [])].sort((a, b) => String(a.assessedAt).localeCompare(String(b.assessedAt)));
  const current = c.proposal || {};
  const rows = entries.map((h) => {
    const hp = h.proposal || {};
    return el("li", { class: "history__item" },
      el("span", { class: "history__when", text: formatDateTime(h.assessedAt) }),
      decisionBadge(hp.decision),
      el("span", { class: "history__amount is-old", text: formatMoney(hp.refundAmount, hp.currency) }),
      el("span", { class: "history__meta", text: `${formatNumber(hp.bonusPoints)} pts · ${roleName(hp.approvalLevel)}` }));
  });
  rows.push(el("li", { class: "history__item is-current" },
    el("span", { class: "history__when", text: `Current · ${formatDateTime(lastAssessed(c))}` }),
    decisionBadge(current.decision),
    el("span", { class: "history__amount", text: formatMoney(current.refundAmount, current.currency) }),
    el("span", { class: "history__meta", text: `${formatNumber(current.bonusPoints)} pts · ${roleName(current.approvalLevel)}` })));
  return el("div", { class: "history" },
    el("div", { class: "history__head" }, icon("history", 14), `Assessment history · ${entries.length + 1} assessments`),
    el("ol", { class: "history__list" }, rows));
}

// ---------- Side: guest & stay, policy stack ----------

function guestStayCard(r, hotel, guest, loyaltySlot) {
  const fees = r.fees || [];
  return el("section", { class: "card card--side" },
    el("div", { class: "guest" },
      el("span", { class: "avatar avatar--lg", text: initials(guest.name) }),
      el("div", { class: "guest__text" },
        el("div", { class: "guest__name", text: guest.name || "—" }),
        el("div", { class: "guest__email", text: guest.email || "" }))),
    loyaltySlot,
    el("dl", { class: "facts" },
      fact("Preferred language", languageBadge(guest.preferredLanguage)),
      fact("Home country", guest.homeCountry ? `${flag(guest.homeCountry)} ${guest.homeCountry}` : "—")),
    el("div", { class: "divider" }),
    el("div", { class: "stay" },
      el("div", { class: "stay__hotel" }, el("span", { class: "flag flag--lg", text: flag(hotel.countryCode) }),
        el("div", null,
          el("div", { class: "stay__name", text: hotel.name || "—" }),
          el("div", { class: "muted", text: [hotel.city, hotel.countryName, CATEGORY_LABELS[hotel.category]].filter(Boolean).join(" · ") })))),
    el("dl", { class: "facts" },
      fact("Room", `${r.roomNumber || "—"} · ${r.roomType || ""}`),
      fact("Stay", `${formatRange(r.checkIn, r.checkOut)}`),
      fact("Nights", String(r.nights ?? "—")),
      fact("Nightly rate", formatMoney(r.nightlyRate, r.currency)),
      fact("Room charges", formatMoney(r.totalRoomCharge, r.currency)),
      fact("Rate · channel", `${titleCase(r.rateType)} · ${titleCase(r.bookedVia)}`),
      fact("Status", titleCase(r.status))),
    fees.length ? el("div", { class: "fees" },
      el("div", { class: "fees__title", text: "Taxes and fees" }),
      fees.map((f) => el("div", { class: "fees__row" },
        el("span", { class: "fees__label", text: f.label || f.code }),
        el("span", { class: "fees__amount", text: formatMoney(f.amount, r.currency) })))) : null);
}

function fact(label, value) {
  return el("div", { class: "fact" }, el("dt", { text: label }), el("dd", null, value));
}

function titleCase(s) {
  return s ? String(s).toLowerCase().replace(/_/g, " ").replace(/^\w/, (x) => x.toUpperCase()) : "—";
}

function policyStackCard(ctx, policies, cited) {
  const languages = new Set(policies.map((x) => x.language));
  return el("section", { class: "card card--side" },
    el("div", { class: "card__header" },
      el("h2", { class: "card__title" }, icon("layers", 16), "Policy stack"),
      el("span", { class: "card__meta", text: `${policies.length} documents · ${languages.size} ${languages.size === 1 ? "language" : "languages"}` })),
    el("p", { class: "card__lede", text: "Most specific first. Seasonal documents apply only to nights inside their window." }),
    policies.length ? el("ol", { class: "ladder" }, policies.map((policy) => ladderRung(ctx, policy, cited))) :
      el("p", { class: "muted", text: "No applicable policies were recorded for this case." }));
}

function ladderRung(ctx, policy, cited) {
  const clauses = cited.get(policy.documentId) || [];
  const seasonal = policy.policyType === "SEASONAL";
  const rung = el("li", { class: ["rung", seasonal && "rung--seasonal", clauses.length && "rung--cited"] },
    el("button", { class: "rung__btn", type: "button", title: `View ${policy.documentId} (PDF)` },
      el("div", { class: "rung__level" },
        el("span", { text: policy.level || policy.scope }),
        clauses.length ? el("span", { class: "rung__cited" }, icon("check", 11), `Cited · ${clauses.join(", ")}`) : null),
      el("div", { class: "rung__title", text: policy.title }),
      policy.titleEnglish && policy.titleEnglish !== policy.title ? el("div", { class: "rung__en", text: policy.titleEnglish }) : null,
      el("div", { class: "rung__meta" },
        el("span", { class: "lang-code", text: (policy.language || "").toUpperCase() }),
        el("span", { text: `${policy.documentId} · v${policy.version}` }),
        seasonal ? el("span", { class: "rung__window" }, icon("calendar", 11), `${formatDate(policy.effectiveFrom).replace(/ \d{4}$/, "")} – ${policy.effectiveTo ? formatDate(policy.effectiveTo) : "open"}`) : null)));
  rung.querySelector(".rung__btn").addEventListener("click", () => viewPdf(ctx, policy, policy.documentId));
  return rung;
}

// ---------- Decision ----------

function draftFor(c) {
  const key = `${c.id}:${(c.proposalHistory || []).length}`;
  if (!drafts.has(key)) {
    const p = c.proposal || {};
    const citedIds = new Set((p.citations || []).map((x) => x.documentId));
    drafts.set(key, {
      note: "",
      subject: (p.guestMessage && p.guestMessage.subject) || "",
      body: (p.guestMessage && p.guestMessage.body) || "",
      share: new Set((c.applicablePolicies || []).filter((x) => citedIds.has(x.documentId)).map((x) => x.documentId))
    });
  }
  return drafts.get(key);
}

function decisionPanel(ctx, c, p, policies, cited) {
  const draft = draftFor(c);
  const role = ctx.state.role;
  const required = p.approvalLevel || "REPRESENTATIVE";
  const canApprove = roleRank(role) >= roleRank(required);
  const message = p.guestMessage || {};
  const lang = message.language || (c.reservation && c.reservation.guest && c.reservation.guest.preferredLanguage) || "en";

  const note = el("textarea", { class: "textarea", rows: "2", placeholder: "Optional note for the case file (internal)", oninput: (e) => { draft.note = e.target.value; } });
  note.value = draft.note;

  const shareList = el("ul", { class: "share-list" }, policies.map((policy) => {
    const box = el("input", { type: "checkbox", checked: draft.share.has(policy.documentId),
      onchange: (e) => { if (e.target.checked) draft.share.add(policy.documentId); else draft.share.delete(policy.documentId); updateShareCount(); } });
    const isCited = cited.has(policy.documentId);
    return el("li", null, el("label", { class: ["share-item", isCited && "is-cited"] },
      box,
      el("span", { class: "share-item__text" },
        el("span", { class: "share-item__title", text: policy.title }),
        el("span", { class: "share-item__meta", text: `${policy.documentId} · ${languageName(policy.language)}${isCited ? " · cited" : ""}` }))));
  }));
  const shareCount = el("span", { class: "subhead__meta" });
  function updateShareCount() { shareCount.textContent = `${draft.share.size} of ${policies.length} selected`; }
  updateShareCount();

  const subject = el("input", { class: "input", type: "text", lang, "aria-label": "Message subject", oninput: (e) => { draft.subject = e.target.value; } });
  subject.value = draft.subject;
  const bodyInput = el("textarea", { class: "textarea textarea--message", rows: "11", lang, "aria-label": "Message body", oninput: (e) => { draft.body = e.target.value; } });
  bodyInput.value = draft.body;

  const approveLabel = p.decision === "REFUND" ? `Approve ${formatMoney(p.refundAmount, p.currency)} refund`
    : p.decision === "NO_REFUND" ? "Confirm no refund" : "Approve recommendation";
  const approveBtn = el("button", { class: "btn btn--primary btn--lg", type: "button", disabled: !canApprove,
    title: canApprove ? "" : `Requires ${roleName(required)} approval` }, icon("check"), approveLabel);
  const rejectBtn = el("button", { class: "btn btn--danger-ghost btn--lg", type: "button" }, icon("x"), "Reject recommendation");

  approveBtn.addEventListener("click", () => confirmDecision(ctx, c, p, policies, draft, true));
  rejectBtn.addEventListener("click", () => confirmDecision(ctx, c, p, policies, draft, false));

  const authority = canApprove
    ? el("div", { class: "callout callout--success" }, icon("shield"),
      el("span", null, `You are acting as ${roleName(role)}. This recommendation needs `, el("strong", { text: roleName(required) }), " approval or higher — you may approve it."))
    : el("div", { class: "callout callout--warning" }, icon("shield"),
      el("span", null, "This recommendation needs ", el("strong", { text: roleName(required) }), ` approval. You are acting as ${roleName(role)}, so you can reject it or re-assess, but approval must come from a ${roleName(required).toLowerCase()} or above. Change “Acting as” in the top bar to continue as that role.`));

  return el("section", { class: "card card--decision", id: "decision" },
    el("div", { class: "card__header" },
      el("h2", { class: "card__title", text: "Decision" }),
      el("span", { class: "card__meta" }, icon("user", 14), `${ctx.state.repName} · ${roleName(role)}`)),
    authority,
    el("div", { class: "decision-grid" },
      el("div", { class: "decision-col" },
        el("div", { class: "subhead" }, el("h3", { class: "subhead__title", text: "Share with guest" }), shareCount),
        el("p", { class: "field-hint", text: "The guest receives a private link to these documents. Cited documents are pre-selected." }),
        shareList,
        el("label", { class: "field" }, el("span", { class: "field__label", text: "Internal note" }), note)),
      el("div", { class: "decision-col" },
        el("div", { class: "subhead" },
          el("h3", { class: "subhead__title", text: "Message to the guest" }),
          el("span", { class: "subhead__meta" }, languageBadge(lang))),
        el("p", { class: "field-hint", text: `Drafted by the agent in ${languageName(lang)}, the guest’s preferred language. Edit before sending.` }),
        el("label", { class: "field" }, el("span", { class: "field__label", text: "Subject" }), subject),
        el("label", { class: "field" }, el("span", { class: "field__label", text: "Message" }), bodyInput))),
    el("div", { class: "decision-actions" }, rejectBtn, approveBtn));
}

function confirmDecision(ctx, c, p, policies, draft, approved) {
  const guest = (c.reservation && c.reservation.guest) || {};
  const shareIds = policies.filter((x) => draft.share.has(x.documentId)).map((x) => x.documentId);
  const notify = el("input", { type: "checkbox" });
  const summary = approved
    ? el("div", { class: "confirm" },
      el("p", { class: "confirm__lede", text: p.decision === "REFUND"
        ? `Refund ${formatMoney(p.refundAmount, p.currency)} to the original payment method and post ${formatNumber(p.bonusPoints)} Reverie Circle points.`
        : "Confirm that no refund is due for this stay." }),
      el("ul", { class: "confirm__list" },
        el("li", { text: `Guest: ${guest.name || "—"} (${guest.email || "no email"})` }),
        el("li", { text: `Documents shared: ${shareIds.length ? shareIds.join(", ") : "none"}` }),
        el("li", { text: `Message in ${languageName((p.guestMessage && p.guestMessage.language) || guest.preferredLanguage)}: “${draft.subject || "(no subject)"}”` }),
        el("li", { text: `Decided by ${ctx.state.repName} as ${roleName(ctx.state.role)}` })),
      p.decision === "REFUND" ? el("p", { class: "field-hint", text: "The refund is paid by the integration once you confirm. This cannot be undone from the portal." }) : null)
    : el("div", { class: "confirm" },
      el("p", { class: "confirm__lede", text: "Reject the agent’s recommendation. No refund is paid and the case is closed as rejected." }),
      el("label", { class: "check-row" }, notify,
        el("span", null, el("strong", { text: "Send the guest an update" }),
          el("span", { class: "field-hint", text: " — the guest page will show the case as under review, with the message and documents selected." }))));

  const confirm = el("button", { class: approved ? "btn btn--primary" : "btn btn--danger", type: "button" },
    icon(approved ? "check" : "x"), approved ? "Confirm decision" : "Reject");
  const cancel = el("button", { class: "btn btn--ghost", type: "button", text: "Cancel" });
  const modal = openModal({ title: approved ? "Confirm approval" : "Reject recommendation", body: summary, actions: [cancel, confirm] });
  cancel.addEventListener("click", () => modal.close());
  confirm.addEventListener("click", async () => {
    confirm.disabled = true;
    cancel.disabled = true;
    mount(confirm, spinner(), approved ? "Submitting…" : "Rejecting…");
    const includeMessage = approved || notify.checked;
    try {
      await ctx.api.refundApi.decide(c.id, {
        approved,
        decidedBy: ctx.state.repName,
        role: ctx.state.role,
        note: draft.note.trim() || undefined,
        sharePolicyIds: includeMessage ? shareIds : [],
        guestMessage: includeMessage ? { subject: draft.subject, body: draft.body } : undefined
      });
      modal.close();
      toast(approved ? (p.decision === "REFUND" ? "Refund approved — guest notification queued" : "Decision confirmed — guest notification queued") : "Recommendation rejected", approved ? "success" : "neutral");
      ctx.refreshShell();
      ctx.rerender();
    } catch (error) {
      confirm.disabled = false;
      cancel.disabled = false;
      mount(confirm, icon(approved ? "check" : "x"), approved ? "Confirm decision" : "Reject");
      toast(error.status === 403 ? error.message : `Decision failed: ${error.message}`, "danger");
    }
  });
}

function outcomePanel(ctx, c, p, policies) {
  const d = c.decision || {};
  const approved = c.status === "APPROVED";
  const share = c.guestShare;
  const title = approved ? (p.decision === "REFUND" ? "Refund approved" : "No-refund decision confirmed") : "Recommendation rejected";
  const lede = approved
    ? (p.decision === "REFUND" ? `${formatMoney(p.refundAmount, p.currency)} returned to the original payment method · ${formatNumber(p.bonusPoints)} points posted` : "No refund is due under the policies in force.")
    : "No refund was paid. The case is closed as rejected.";

  let guestBlock = el("p", { class: "muted", text: "Nothing was shared with the guest." });
  if (share) {
    const url = share.url;
    const sharedDocs = (share.policyIds || []).map((id) => policyFor(policies, id) || { documentId: id, title: id, language: "" });
    const linkInput = el("input", { class: "input input--mono", type: "text", readonly: true, value: url, "aria-label": "Guest page link", onfocus: (e) => e.target.select() });
    guestBlock = el("div", { class: "share-result" },
      el("div", { class: "share-result__link" },
        linkInput,
        el("a", { class: "btn btn--ghost", href: url, target: "_blank", rel: "noopener" }, icon("external"), "Open"),
        el("button", { class: "btn btn--ghost", type: "button", onclick: () => copyText(url) }, icon("copy"), "Copy")),
      el("div", { class: "share-result__meta", text: [
        `Shared ${formatDateTime(share.sharedAt)}`,
        `message in ${languageName(share.message && share.message.language)}`,
        approved ? null : "the guest sees the case as under review"
      ].filter(Boolean).join(" · ") }),
      share.message ? el("details", { class: "share-message" },
        el("summary", { text: share.message.subject || "Message" }),
        el("p", { class: "share-message__body", lang: share.message.language, text: share.message.body || "" })) : null,
      sharedDocs.length ? el("ul", { class: "shared-docs" }, sharedDocs.map((x) =>
        el("li", null, icon("file", 13), el("span", { text: x.title }), el("span", { class: "lang-code", text: (x.language || "").toUpperCase() })))) : null);
  }

  return el("section", { class: ["card", "card--outcome", approved ? "is-approved" : "is-rejected"] },
    el("div", { class: "outcome" },
      el("span", { class: "outcome__icon" }, icon(approved ? "check" : "x", 22)),
      el("div", null,
        el("h2", { class: "outcome__title", text: title }),
        el("p", { class: "outcome__lede", text: lede }))),
    el("dl", { class: "facts facts--inline" },
      fact("Decided by", `${d.decidedBy || "—"} · ${roleName(d.role)}`),
      fact("Decided", formatDateTime(d.decidedAt)),
      c.refundId ? fact("Refund id", el("span", { class: "clause-chip clause-chip--ink", text: c.refundId })) : null,
      d.note ? fact("Note", d.note) : null),
    el("div", { class: "subhead" }, el("h3", { class: "subhead__title", text: "Guest page" })),
    guestBlock);
}
