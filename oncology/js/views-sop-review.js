// SOP review & revision workflow: the review plan month by month, requests tracked from "Requested" to "Closed" on a
// board, the SOPs that need a request now (and why), and on each SOP page its review status, open request and history.
// Closing a review restarts the SOP's review period ("No change"), records its new revision ("Revised") or retires it
// ("Withdrawn"); the SOP file in Drive is not changed.
import { h, card, kpi, select, segmented, dataTable, fmtDate, fmtNum, fmtPct } from "./ui.js";
import { vbars, ring } from "./charts.js";
import { t, tv, getLang } from "./i18n.js";
import { icon } from "./icons.js";
import { toDay } from "./model.js";
import { REVIEW_TYPES, REVIEW_STATUS, REVIEW_OUTCOMES, REVIEW_REASONS, reviewSuggestions, reviewPlan, nextReviewId } from "./sopwork.js";

const ALL = "__all";
const DAY = 86400000;
const isoToday = () => new Date().toISOString().slice(0, 10);
const isoOf = (ts) => (ts == null ? "" : new Date(ts).toISOString().slice(0, 10));
const short = (s, n = 60) => (String(s ?? "").length > n ? String(s).slice(0, n - 1) + "…" : String(s ?? ""));
const sopHref = (code) => `#/sops?code=${encodeURIComponent(code)}`;
export const RV_COLOR = { Requested: "var(--c7)", "In progress": "var(--c1)", "In approval": "var(--c4)", Closed: "var(--good)", Cancelled: "var(--muted-mark)" };
const OUT_COLOR = { "No change": "var(--good)", Revised: "var(--c1)", Withdrawn: "var(--muted-mark)" };
const LANES = ["Requested", "In progress", "In approval"];
const pill = (color, label) => h("span.pill", { style: { "--dot": color } }, h("i"), label);
const rvStatus = (r) => pill(RV_COLOR[r.status] ?? "var(--muted-mark)", r.overdue ? `${tv(r.status)} · ${t("rv_late", fmtNum(r.daysLate))}` : tv(r.status));
const reviewTypeName = (x) => (REVIEW_TYPES.includes(x) ? t(`rv_t_${REVIEW_TYPES.indexOf(x)}`) : tv(x ?? ""));
const why = ([k, v]) => t(`rv_w_${k}`, k === "overdue" || k === "due" ? fmtDate(v) || "—" : v ?? "");
const ownersOf = (X) => [...new Set([...X.list.map((s) => s.Owner), ...(X.reviews ?? []).flatMap((r) => [r.Owner, r["Requested by"]])].filter(Boolean))].sort();

// ---------- the tab ----------
export function reviewsTab(ctx, X) {
  const now = ctx.m.now;
  const R = X.reviews ?? [];
  const L = X.list.filter((s) => s.reviewStatus !== "Obsolete");
  const f = ctx.state.rvF ?? {};
  const setF = (k, v) => ctx.set("rvF", { ...f, [k]: v });
  const unlisted = new Set(ctx.m.x.docx.unlisted.filter((d) => d.kind === "sop").map((d) => d.ref.key));
  const sugg = reviewSuggestions(L, { unlisted });
  const open = R.filter((r) => r.open);
  const year = new Date(now).getUTCFullYear();
  const closedYear = R.filter((r) => !r.open && r.closed != null && new Date(r.closed).getUTCFullYear() === year && r.status === "Closed");
  const onTime = closedYear.filter((r) => r.due != null);
  const dated = L.filter((s) => s.next != null);
  const plan = reviewPlan(L, now, 12);
  const overdue = L.filter((s) => s.reviewStatus === "Overdue"), due90 = L.filter((s) => s.reviewStatus === "Due ≤90 d");
  const covered = overdue.filter((s) => s.openReview).length;
  const owners = ownersOf(X);
  const qx = String(f.q ?? "").trim().toLowerCase();
  const F = R.filter((r) => (!f.status || f.status === ALL || (f.status === "open" ? r.open : f.status === "late" ? r.overdue : r.status === f.status))
    && (!f.type || f.type === ALL || r.Type === f.type) && (!f.owner || f.owner === ALL || r.Owner === f.owner)
    && (!qx || `${r["Review ID"] ?? ""} ${r.SOP ?? ""} ${r.sop?.Title ?? ""} ${r.Reason ?? ""} ${r.Comment ?? ""}`.toLowerCase().includes(qx)));
  const monthName = (k) => new Date(`${k}-01T00:00:00Z`).toLocaleDateString(getLang() === "FR" ? "fr-FR" : "en-GB", { month: "short", year: "2-digit", timeZone: "UTC" });
  const pm = f.month && plan.find((p) => p.month === f.month) ? plan.find((p) => p.month === f.month) : plan[0];
  return [
    h("section.sop-hero.rv-hero",
      h("div.sop-hero-text",
        h("span.eyebrow", t("rv_eyebrow")),
        h("h2", t("rv_hero", fmtNum(open.length))),
        h("p", t("rv_hero_sub", fmtNum(overdue.length), fmtNum(due90.length), fmtNum(closedYear.length), String(year))),
        h("div.hero-meta",
          ctx.canEdit ? h("button.chip.chip-glass", { type: "button", onclick: () => requestReview(ctx, X, null) }, icon("plus", 12), ` ${t("rv_request")}`) : null,
          h("button.chip.chip-glass", { type: "button", onclick: () => setF("status", "late") }, icon("alert", 12), ` ${t("rv_k_late")} · ${fmtNum(open.filter((r) => r.overdue).length)}`))),
      h("div.apqr-rings",
        h("div.hero-ring", ring(dated.length ? L.filter((s) => s.reviewStatus === "In date").length / dated.length : null, { size: 88, color: "#5fe0b0" }), h("span", t("sop_r_indate"))),
        h("div.hero-ring", ring(overdue.length ? covered / overdue.length : null, { size: 88, color: "#8fc1ff" }), h("span", t("rv_r_covered"))),
        h("div.hero-ring", ring(onTime.length ? onTime.filter((r) => r.closed <= r.due).length / onTime.length : null, { size: 88, color: "#ffd27a" }), h("span", t("rv_r_ontime"))))),
    h("div.kpi-grid.six",
      kpi({ label: t("sop_k_od"), value: fmtNum(overdue.length), status: overdue.length ? 1 : 3, hint: t("rv_k_od_h", fmtNum(covered)), onclick: () => { ctx.state.sopF = { status: "Overdue" }; ctx.set("sopTab", "library"); } }),
      kpi({ label: t("sop_k_90"), value: fmtNum(due90.length), accent: "var(--warning)" }),
      kpi({ label: t("rv_k_open"), value: fmtNum(open.length), accent: "var(--c1)", onclick: () => setF("status", "open") }),
      kpi({ label: t("rv_k_late"), value: fmtNum(open.filter((r) => r.overdue).length), status: open.some((r) => r.overdue) ? 1 : 3, onclick: () => setF("status", "late") }),
      kpi({ label: t("rv_k_closed", String(year)), value: fmtNum(closedYear.length), accent: "var(--good)", hint: onTime.length ? `${fmtPct(onTime.filter((r) => r.closed <= r.due).length / onTime.length)} ${t("rv_on_time")}` : null, onclick: () => setF("status", "Closed") }),
      kpi({ label: t("rv_k_sugg"), value: fmtNum(sugg.length), accent: "var(--c4)", hint: t("rv_k_sugg_h") })),
    h("div.grid.cols-3",
      card(t("rv_plan"), vbars(plan.map((p, i) => ({ label: i === 0 ? `${monthName(p.month)} (${t("rv_incl_overdue")})` : monthName(p.month), short: monthName(p.month), value: p.sops.length,
        color: i === 0 && p.sops.some((s) => s.reviewStatus === "Overdue") ? "var(--critical)" : p.month === pm.month ? "var(--c4)" : "var(--c1)", onclick: () => setF("month", p.month) })), { height: 130 }),
        { sub: t("rv_plan_sub"), span: 2 }),
      card(`${monthName(pm.month)} · ${fmtNum(pm.sops.length)}`, pm.sops.length ? h("ul.mini-codes.rv-month", pm.sops.sort((a, b) => (a.next ?? 0) - (b.next ?? 0)).slice(0, 40).map((s) => h("li",
        h("a", { href: sopHref(s.Code) }, h("b", s.Code), ` ${short(s.Title, 36)}`), h("small", ` · ${fmtDate(s.next)}`), s.openReview ? h("span.tag", s.openReview["Review ID"] ?? tv(s.openReview.status)) : null)))
        : h("p.muted", t("none_found")), { sub: t("rv_month_sub") })),
    h("div.kanban.rv-board", [...LANES.map((st) => {
      const xs = open.filter((r) => r.status === st || (st === "Requested" && !LANES.includes(r.status)));
      return h("div.lane", { "data-stage": st, style: { "--lane": RV_COLOR[st] } },
        h("header", h("span", tv(st)), h("b", fmtNum(xs.length))),
        xs.length ? xs.sort((a, b) => (a.due ?? 9e15) - (b.due ?? 9e15)).slice(0, 30).map((r) => reviewKcard(ctx, X, r)) : h("div.lane-empty", t("rv_lane_empty")));
    }), (() => {
      const recent = R.filter((r) => !r.open && r.closed != null && r.closed >= now - 90 * DAY).sort((a, b) => b.closed - a.closed);
      return h("div.lane", { "data-stage": "Closed", style: { "--lane": RV_COLOR.Closed } },
        h("header", h("span", t("rv_lane_closed")), h("b", fmtNum(recent.length))),
        recent.length ? recent.slice(0, 8).map((r) => reviewKcard(ctx, X, r)) : h("div.lane-empty", t("rv_lane_empty")));
    })()]),
    suggCard(ctx, X, sugg, f, setF),
    card(null, h("div.filters.sop-filters",
      h("label.field.grow", h("span", t("sop_find")), h("input", { type: "search", value: f.q ?? "", placeholder: t("rv_find_ph"), onchange: (e) => setF("q", e.target.value) })),
      select(t("col_status"), [[ALL, t("filter_all")], ["open", t("rv_k_open")], ["late", t("rv_k_late")], ...REVIEW_STATUS.map((s) => [s, tv(s)])], f.status ?? ALL, (v) => setF("status", v)),
      select(t("col_type"), [[ALL, t("filter_all")], ...REVIEW_TYPES.map((x) => [x, reviewTypeName(x)])], f.type ?? ALL, (v) => setF("type", v)),
      select(t("col_owner"), [[ALL, t("filter_all")], ...owners.map((x) => [x, x])], f.owner ?? ALL, (v) => setF("owner", v))), { cls: "filter-card" }),
    card(`${t("rv_requests")} · ${fmtNum(F.length)}`, R.length ? dataTable([
      { key: "Review ID", label: "ID", cls: "mono nowrap" },
      { key: "SOP", label: t("frm_owner"), cls: "mono nowrap", render: (r) => (r.sop ? h("a", { href: sopHref(r.sop.Code), onclick: (e) => e.stopPropagation() }, r.SOP) : r.SOP ?? "—") },
      { key: "title", label: t("col_title"), cls: "wrap", sort: (r) => r.sop?.Title ?? "", render: (r) => short(r.sop?.Title ?? "", 60) },
      { key: "Type", label: t("col_type"), render: (r) => reviewTypeName(r.Type) },
      { key: "Reason", label: t("rv_reason"), render: (r) => tv(r.Reason ?? "") },
      { key: "Owner", label: t("col_owner") },
      { key: "due", label: t("col_due"), cls: "nowrap", sort: (r) => r.due ?? 9e15, render: (r) => fmtDate(r.due) },
      { key: "status", label: t("col_status"), render: rvStatus },
      { key: "Outcome", label: t("rv_outcome"), render: (r) => (r.Outcome ? pill(OUT_COLOR[r.Outcome] ?? "var(--muted-mark)", tv(r.Outcome)) : "") },
      { key: "closed", label: t("rv_closed_on"), cls: "nowrap", sort: (r) => r.closed ?? 0, render: (r) => fmtDate(r.closed) },
    ], F, { pageSize: 30, onRow: (r) => openReview(ctx, X, r), searchText: (r) => `${r["Review ID"]} ${r.SOP} ${r.Reason ?? ""}`, exportName: "sop-reviews", sortKey: "due" })
      : h("div.empty", t("rv_none")), { sub: t("rv_requests_sub") }),
  ];
}

function reviewKcard(ctx, X, r) {
  return h("button.kcard.rv-card", { type: "button", onclick: () => openReview(ctx, X, r) },
    h("div.kcard-top", h("b.mono", r.SOP ?? "—"), h("small", r["Review ID"] ?? "")),
    h("p", short(r.sop?.Title ?? r.Reason ?? "", 80)),
    h("div.kcard-meta", r.Outcome ? pill(OUT_COLOR[r.Outcome] ?? "var(--muted-mark)", tv(r.Outcome)) : h("span.tag", reviewTypeName(r.Type)),
      r.open && r.due != null ? h("span", { class: r.overdue ? "warn-mini" : "" }, `${t("col_due")} ${fmtDate(r.due)}`) : !r.open ? h("span", fmtDate(r.closed)) : null, r.Owner ? h("span", r.Owner) : null));
}

// the SOPs that need a request now, most urgent first, each with its reasons and a one-click request
function suggCard(ctx, X, sugg, f, setF) {
  const kinds = [["all", t("filter_all")], ["date", t("rv_s_date")], ["forms", t("rv_s_forms")]];
  const k = f.sugg ?? "all";
  const S = sugg.filter((x) => k === "all" || (k === "date" ? x.why.some(([w]) => w === "overdue" || w === "due") : x.why.some(([w]) => w === "forms")));
  const show = +(f.suggShow ?? 10);
  return card(`${t("rv_sugg")} · ${fmtNum(S.length)}`, S.length ? h("div.rv-sugg-list",
    S.slice(0, show).map((x) => h("div.rv-sugg-row",
      h("a.mono", { href: sopHref(x.sop.Code) }, h("b", x.sop.Code)),
      h("span.rv-sugg-main", h("span", short(x.sop.Title, 80)), h("span.rv-sugg-why", x.why.map((w) => h("span.tag", { class: w[0] === "overdue" ? "warn-tag" : "" }, why(w))))),
      ctx.canEdit ? h("button.btn.compact", { type: "button", onclick: () => requestReview(ctx, X, x.sop, { Type: x.type, Reason: x.why[0][0] === "forms" ? "Form update" : "Review date" }) }, icon("plus", 14), t("rv_request")) : h("span"))),
    S.length > show ? h("p.center", h("button.btn", { type: "button", onclick: () => setF("suggShow", show + 30) }, t("sop_more", fmtNum(Math.min(30, S.length - show))))) : null)
    : h("p.ok-line", icon("check", 14), t("rv_sugg_none")),
    { sub: t("rv_sugg_sub"), actions: h("div.seg-wrap", segmented(kinds, k, (v) => setF("sugg", v), t("rv_sugg"))) });
}

// ---------- on the SOP page ----------
export function reviewCard(ctx, X, s) {
  const r = s.openReview;
  const past = (s.reviews ?? []).filter((x) => !x.open);
  const edit = ctx.canEdit;
  const body = h("div.rv-box",
    h("div.rv-now",
      h("div", h("small", t("col_nextrev")), h("b", fmtDate(s.next) || "—"), h("span", tv(s.reviewStatus))),
      h("div", h("small", t("rv_last")), h("b", fmtDate(s.reviewedOn ?? s.eff) || "—"), h("span", s.reviewedOn ? t("rv_last_review") : t("sop_effective")))),
    r ? h("button.rv-open", { type: "button", onclick: () => openReview(ctx, X, r) },
      h("span.rv-open-top", h("b", r["Review ID"] ?? t("rv_request")), rvStatus(r)),
      h("span", [reviewTypeName(r.Type), r.Reason ? tv(r.Reason) : null, r.Owner, r.due != null ? `${t("col_due")} ${fmtDate(r.due)}` : null].filter(Boolean).join(" · ")),
      icon("chevron", 15)) : null,
    edit ? h("div.rv-acts",
      !r ? h("button.btn.compact", { type: "button", onclick: () => requestReview(ctx, X, s) }, icon("plus", 14), t("rv_request")) : null,
      h("button.btn.compact.ghost", { type: "button", onclick: () => closeReview(ctx, X, r ?? null, s) }, icon("check", 14), r ? t("rv_close") : t("rv_record"))) : null,
    past.length ? h("ol.sop-history.rv-past", past.slice(0, 6).map((x) => h("li",
      h("b", x["Review ID"] ?? "—"), h("small", ` · ${fmtDate(x.closed) || "—"}`), " ", x.Outcome ? pill(OUT_COLOR[x.Outcome] ?? "var(--muted-mark)", tv(x.Outcome)) : h("span.muted", tv(x.status)),
      x["New revision"] ? h("small", ` · rev ${x["New revision"]}`) : null, x.Comment ? h("p", short(x.Comment, 140)) : null))) : null);
  return card(t("rv_card"), body, { sub: t("rv_card_sub") });
}

// ---------- drawers ----------
/** One review request: where it stands, and moving it on. */
export function openReview(ctx, X, r) {
  const s = r.sop;
  const step = (status, label, ic) => h("button.btn.compact", { type: "button", onclick: async () => { await ctx.saveObj("sopReviews", r.__key, { Status: status }); ctx.closeDrawer(); ctx.rerender(); } }, icon(ic, 14), label);
  ctx.open.drawer(() => [
    h("div.d-head", h("span.d-ref", `${t("rv_card")} · ${r["Review ID"] ?? ""}`), h("h2", s ? `${s.Code} · ${s.Title ?? ""}` : r.SOP ?? "—"), h("div.d-tags", rvStatus(r), h("span.tag", reviewTypeName(r.Type)), r.Outcome ? pill(OUT_COLOR[r.Outcome], tv(r.Outcome)) : null)),
    h("div.rv-steps", REVIEW_STATUS.slice(0, 4).map((st, i) => h("span", { class: REVIEW_STATUS.indexOf(r.status) >= i && r.status !== "Cancelled" ? "on" : "" }, h("i", String(i + 1)), tv(st)))),
    ctx.canEdit ? h("div.form-actions.rv-moves",
      r.open && r.status === "Requested" ? step("In progress", t("rv_start"), "arrow") : null,
      r.open && r.status !== "In approval" ? step("In approval", t("rv_to_approval"), "badge") : null,
      r.open ? h("button.btn.compact.primary", { type: "button", onclick: () => closeReview(ctx, X, r, s) }, icon("check", 14), t("rv_close")) : null,
      h("button.btn.compact.ghost", { type: "button", onclick: () => ctx.edit("sopReviews", r.__key, `${r["Review ID"] ?? ""} · ${r.SOP ?? ""}`) }, icon("edit", 14), t("edit")),
      r.open ? step("Cancelled", t("rv_cancel"), "close") : null) : null,
    h("dl.deflist", [[t("rv_reason"), tv(r.Reason ?? "")], [t("rv_requested"), [r["Requested by"], fmtDate(r.opened)].filter(Boolean).join(" · ")], [t("col_owner"), r.Owner], [t("col_due"), fmtDate(r.due)],
      [t("rv_cc"), r["Change control"]], [t("rv_outcome"), tv(r.Outcome ?? "")], [t("rv_new_rev"), r["New revision"]], [t("rv_effective_on"), fmtDate(toDay(r["Effective on"]))], [t("rv_closed_on"), fmtDate(r.closed)], [t("rv_comment"), r.Comment]]
      .filter(([, v]) => v != null && v !== "").flatMap(([k, v]) => [h("dt", k), h("dd", v)])),
    s ? h("p", h("a.btn.compact", { href: sopHref(s.Code), onclick: () => ctx.closeDrawer() }, icon("sop", 14), s.Code)) : null,
  ]);
}

const field = (label, el, wide) => h(`label.field${wide ? ".wide" : ""}`, { for: el.id }, h("span", label), el);
let uid = 0;
const options = (list, value, name = (x) => tv(x)) => list.map((x) => h("option", { value: x, selected: x === value ? true : null }, name(x)));
const saveForm = (onSave, ...kids) => {
  const msg = h("p.form-msg", { role: "status" });
  const btn = h("button.btn.primary", { type: "submit" }, t("save"));
  return h("form.row-form.ed-form", { onsubmit: async (e) => {
    e.preventDefault(); btn.disabled = true; msg.className = "form-msg"; msg.textContent = t("ws_saving");
    try { const err = await onSave(); if (err) { msg.className = "form-msg warn-text"; msg.textContent = err; btn.disabled = false; } }
    catch (x) { msg.className = "form-msg warn-text"; msg.textContent = x.message ?? String(x); btn.disabled = false; }
  } }, ...kids, msg, h("div.form-actions", btn, h("button.btn.ghost", { type: "button", onclick: () => { /* closes */ } }, t("cancel"))));
};

/** Ask for a review or revision of an SOP (any SOP when `s` is null). */
export function requestReview(ctx, X, s, preset = {}) {
  const n = ++uid;
  const now = ctx.m.now;
  const due0 = s?.next != null && s.next > now ? s.next : now + 30 * DAY;
  const sop = h("input.mono", { id: `rq${n}-sop`, value: s?.Code ?? "", list: `rq${n}-sops`, required: true });
  const type = h("select", { id: `rq${n}-type` }, options(REVIEW_TYPES, preset.Type ?? (s?.idx?.state === "drive-newer" ? "Revision" : "Periodic review"), reviewTypeName));
  const reason = h("select", { id: `rq${n}-reason` }, options(REVIEW_REASONS, preset.Reason ?? "Review date"));
  const owner = h("input", { id: `rq${n}-owner`, value: s?.Owner ?? "", list: `rq${n}-owners` });
  const asker = h("input", { id: `rq${n}-by`, value: ctx.myName ?? "", list: `rq${n}-owners` });
  const due = h("input", { id: `rq${n}-due`, type: "date", value: isoOf(due0) });
  const cc = h("input", { id: `rq${n}-cc`, value: "" });
  const note = h("textarea", { id: `rq${n}-note`, rows: 3 });
  const form = saveForm(async () => {
    const code = sop.value.trim();
    if (!X.list.some((x) => x.Code === code)) return t("fe_owner_bad", code || "—");
    const rows = (X.reviews ?? []);
    await ctx.saveObj("sopReviews", null, { "Review ID": nextReviewId(rows, new Date(now).getUTCFullYear()), SOP: code, Type: type.value, Reason: reason.value, "Requested by": asker.value.trim() || null,
      "Requested on": isoToday(), Owner: owner.value.trim() || null, Due: due.value || null, "Change control": cc.value.trim() || null, Status: "Requested", Comment: note.value.trim() || null });
    ctx.closeDrawer(); ctx.rerender();
    return null;
  },
    h("div.form-grid", field(t("frm_owner"), sop), field(t("col_type"), type), field(t("rv_reason"), reason), field(t("rv_requested_by"), asker), field(t("col_owner"), owner), field(t("col_due"), due), field(t("rv_cc"), cc), field(t("rv_comment"), note, true)),
    h("datalist", { id: `rq${n}-sops` }, X.list.map((x) => h("option", { value: x.Code }, x.Title ?? ""))),
    h("datalist", { id: `rq${n}-owners` }, ownersOf(X).map((x) => h("option", { value: x }))));
  form.querySelector(".form-actions .ghost").onclick = () => ctx.closeDrawer();
  ctx.open.drawer(() => [
    h("div.d-head", h("span.d-ref", t("rv_card")), h("h2", s ? t("rv_request_for", s.Code) : t("rv_request"))),
    h("p.fine", t("rv_request_note")),
    form,
  ], { form: true });
}

/** Close a review (or record one done without a request): outcome, new revision, dates. */
export function closeReview(ctx, X, r, s) {
  const n = ++uid;
  const sop = s ?? r?.sop;
  const outcome = h("select", { id: `cl${n}-out` }, options(REVIEW_OUTCOMES, r?.Type === "Revision" ? "Revised" : r?.Type === "Withdrawal" ? "Withdrawn" : "No change"));
  const rev = h("input", { id: `cl${n}-rev`, value: sop?.Revision ? String(+sop.Revision + 1).padStart(2, "0") : "", inputmode: "numeric" });
  const eff = h("input", { id: `cl${n}-eff`, type: "date", value: isoToday() });
  const closed = h("input", { id: `cl${n}-closed`, type: "date", value: isoToday() });
  const cc = h("input", { id: `cl${n}-cc`, value: r?.["Change control"] ?? "" });
  const note = h("textarea", { id: `cl${n}-note`, rows: 3 }, r?.Comment ?? "");
  const revF = field(t("rv_new_rev"), rev), effF = field(t("rv_effective_on"), eff);
  const sync = () => { const v = outcome.value === "Revised"; revF.hidden = !v; effF.hidden = !v; };
  outcome.addEventListener("change", sync); sync();
  const form = saveForm(async () => {
    if (!closed.value) return t("rv_need_date");
    if (outcome.value === "Revised" && !rev.value.trim()) return t("rv_need_rev");
    const patch = { Status: "Closed", Outcome: outcome.value, "Closed on": closed.value, "New revision": outcome.value === "Revised" ? rev.value.trim() : null,
      "Effective on": outcome.value === "Revised" ? eff.value || closed.value : null, "Change control": cc.value.trim() || null, Comment: note.value.trim() || null };
    if (r) await ctx.saveObj("sopReviews", r.__key, patch);
    else await ctx.saveObj("sopReviews", null, { "Review ID": nextReviewId(X.reviews ?? [], new Date(ctx.m.now).getUTCFullYear()), SOP: sop.Code, Type: outcome.value === "Revised" ? "Revision" : outcome.value === "Withdrawn" ? "Withdrawal" : "Periodic review",
      Reason: "Review date", "Requested by": ctx.myName, "Requested on": closed.value, Owner: sop.Owner ?? null, ...patch });
    ctx.closeDrawer(); ctx.rerender();
    return null;
  },
    h("div.form-grid", field(t("rv_outcome"), outcome), field(t("rv_closed_on"), closed), revF, effF, field(t("rv_cc"), cc), field(t("rv_comment"), note, true)));
  form.querySelector(".form-actions .ghost").onclick = () => ctx.closeDrawer();
  ctx.open.drawer(() => [
    h("div.d-head", h("span.d-ref", `${t("rv_card")}${r?.["Review ID"] ? ` · ${r["Review ID"]}` : ""}`), h("h2", r ? t("rv_close_title", sop?.Code ?? r.SOP ?? "") : t("rv_record_title", sop?.Code ?? ""))),
    h("p.fine", t("rv_close_note")),
    form,
  ], { form: true });
}
