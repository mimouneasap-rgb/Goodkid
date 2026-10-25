// Quality management review, as the site's procedure organises it: the reviews the procedure calls for (twice a year, each
// within two months of the end of the half-year), each review's mandatory parameters with the app's figures, two years of
// history and the volume produced, collected by department and assessed; the meeting, its participants and minutes; the
// actions and decisions followed up to closure; the regulatory watch; and the numbered report laid out as the template.
import { h, card, kpi, viewHeader, segmented, select, dataTable, fmtDate, fmtNum, fmtPct, fmtValue, esc } from "./ui.js";
import { hbars, vbars, ring, gauge } from "./charts.js";
import { t, tv, getLang } from "./i18n.js";
import { icon } from "./icons.js";
import * as M from "./model.js";
import { fieldPicker } from "./editing.js";
import { recordCols } from "./views-overview.js";
import {
  QMR_PARAMS, PARAM_BY, OTHER_TOPICS, QMR_ROLES, INPUT_STATUS, ASSESSMENTS, ATTENDANCE, ACTION_TYPES, ACTION_STATUS, MINUTES_DAYS, REPORT_DAYS, DUE_MONTHS,
  pickReview, newReview, collectionByDept, figuresOf, halfPeriod, nextHalf,
} from "./qmrkit.js";
import { paramData, escalations } from "./qmrdata.js";

const DAY = 86400000;
const ALL = "__all";
const isoToday = () => new Date().toISOString().slice(0, 10);
const short = (s, n = 70) => (String(s ?? "").length > n ? String(s).slice(0, n - 1) + "…" : String(s ?? ""));
const dot = (color, label) => h("span.pill", { style: { "--dot": color } }, h("i"), label);
const TABS = [["overview", "mr_t_overview"], ["report", "mr_t_report"], ["meeting", "mr_t_meeting"], ["actions", "mr_t_actions"], ["regs", "mr_t_regs"], ["print", "mr_t_print"]];
const STATE_COLOR = { Planned: "var(--c7)", "Data collection": "var(--c4)", "Meeting scheduled": "var(--c1)", "Meeting held": "var(--warning)", "Minutes shared": "var(--c3)", Closed: "var(--good)", Cancelled: "var(--muted-mark)" };
const CAL_COLOR = { "Held on time": "var(--good)", "Held late": "var(--warning)", Overdue: "var(--critical)", Planned: "var(--c1)", "Not recorded": "var(--muted-mark)", "Period in progress": "var(--c7)", "To plan": "var(--c4)" };
export const ASSESS_COLOR = { Satisfactory: "var(--good)", "Needs improvement": "var(--warning)", Unsatisfactory: "var(--critical)", "Not applicable": "var(--muted-mark)" };
const INPUT_COLOR = { Requested: "var(--muted-mark)", Collected: "var(--c1)", Reviewed: "var(--good)", "Not applicable": "var(--muted-mark)" };
const ACT_COLOR = { Open: "var(--c1)", "In progress": "var(--c4)", Overdue: "var(--critical)", Done: "var(--good)", Cancelled: "var(--muted-mark)" };
const ATT_COLOR = { Present: "var(--good)", Excused: "var(--warning)", Absent: "var(--critical)", Invited: "var(--muted-mark)" };
const HINT_ASSESS = [null, "Unsatisfactory", "Needs improvement", "Satisfactory"];
const TONE = [null, "var(--critical)", "var(--warning)", "var(--good)"];
const pName = (key, input) => (PARAM_BY.has(key) ? t(`qp_${key}`) : input?.Title || key);
export const periodName = (p) => (p ? t("mr_half", p.h === 1 ? t("mr_h1") : t("mr_h2"), String(p.year)) : "—");
const fmtFig = (f) => (f.v == null ? "—" : f.u === "%" ? fmtPct(f.v) : f.u === "r" ? `${(+f.v).toFixed(1)}` : f.u === "x" ? (+f.v).toFixed(1) : f.u === "d" ? `${(+f.v).toFixed(1)} d` : fmtNum(f.v));
const field = (label, el, wide) => h(`label.field${wide ? ".wide" : ""}`, { for: el.id || el.querySelector?.("input")?.id }, h("span", label), el);
const options = (list, value, name = (x) => tv(x)) => list.map((x) => h("option", { value: x, selected: x === value ? true : null }, name(x)));
let uid = 0;
const saveForm = (onSave, ctx, ...kids) => {
  const msg = h("p.form-msg", { role: "status" });
  const btn = h("button.btn.primary", { type: "submit" }, t("save"));
  return h("form.row-form.ed-form", { onsubmit: async (e) => {
    e.preventDefault(); btn.disabled = true; msg.className = "form-msg"; msg.textContent = t("ws_saving");
    try { const err = await onSave(); if (err) { msg.className = "form-msg warn-text"; msg.textContent = err; btn.disabled = false; } }
    catch (x) { msg.className = "form-msg warn-text"; msg.textContent = x.message ?? String(x); btn.disabled = false; }
  } }, ...kids, msg, h("div.form-actions", btn, h("button.btn.ghost", { type: "button", onclick: () => ctx.closeDrawer() }, t("cancel"))));
};

export function reviewView(ctx) {
  const Q = ctx.m.x.qmr;
  const tab = TABS.some(([k]) => k === ctx.state.mrTab) ? ctx.state.mrTab : "overview";
  const rv = pickReview(Q, ctx.state.mrNo);
  const body = { overview, report, meeting, actions: actionsTab, regs: regsTab, print: printTab }[tab](ctx, Q, rv);
  const head = tab === "regs" ? (ctx.canEdit ? h("button.btn.primary", { type: "button", onclick: () => ctx.add("qmrRegs") }, icon("plus", 16), t("mr_reg_add")) : null)
    : tab === "actions" && rv ? (ctx.canEdit ? h("button.btn.primary", { type: "button", onclick: () => addAction(ctx, rv, {}) }, icon("plus", 16), t("mr_act_add")) : null)
    : tab === "print" ? h("button.btn.primary", { type: "button", onclick: () => window.print() }, icon("print", 16), t("print"))
    : planButton(ctx, Q);
  return h("div.view.mr-view",
    viewHeader(t("mr_title"), t("mr_sub2"), h("div.sop-tabs", segmented(TABS.map(([k, l]) => [k, t(l)]), tab, (v) => ctx.set("mrTab", v), t("mr_title"))), head),
    tab !== "overview" && tab !== "regs" ? reviewBar(ctx, Q, rv) : null,
    body);
}

function planButton(ctx, Q) {
  if (!ctx.canEdit) return null;
  const e = Q.toPlan;
  return e ? h("button.btn.primary", { type: "button", onclick: () => planReview(ctx, Q, e.period) }, icon("plus", 16), t("mr_plan_for", periodName(e.period))) : null;
}

/** Create the review of a half-year: number, dates, and the participants of the last review in the same roles. */
async function planReview(ctx, Q, period) {
  const { row, people } = newReview(Q, period, { site: t("brand_site") });
  // a role nobody held at the last review: the employee whose job position is that role (e.g. the QA manager)
  const staff = ctx.m.x.trainingX.staff.filter((s) => s.active);
  for (const x of people) if (!x.Name) { const s = staff.find((y) => String(y.position ?? "").toLowerCase() === x.Role.toLowerCase()); if (s) { x.Name = s.name; x.Title = s.position; } }
  try {
    await ctx.saveObj("qmr", null, row, true);
    await ctx.bulkUpsert("qmrAttendees", people, ["Report no", "Role"], null, "plan");
    ctx.toast(t("mr_planned", row["Report no"]));
    ctx.state.mrNo = row["Report no"];
    ctx.set("mrTab", "report");
  } catch (e) { ctx.toast(e.message, "warn"); }
}

// ---------- the review bar: which review, where it stands ----------
function reviewBar(ctx, Q, rv) {
  if (!Q.reviews.length) return h("div.banner.info", icon("review", 18), h("span", t("mr_none"), " "), Q.toPlan && ctx.canEdit ? h("button.link", { type: "button", onclick: () => planReview(ctx, Q, Q.toPlan.period) }, t("mr_plan_for", periodName(Q.toPlan.period))) : null);
  const steps = rv ? stepsOf(rv, ctx.m.now) : [];
  return h("section.mr-bar",
    h("div.mr-bar-pick", select(t("mr_review"), Q.reviews.map((r) => [r.no, `${r.no} · ${periodName(r.period)}`]), rv?.no ?? "", (v) => ctx.set("mrNo", v)),
      rv ? h("div.mr-bar-meta", dot(STATE_COLOR[rv.state], tv(rv.state)), h("span", t("mr_due_by", fmtDate(rv.dueBy) || "—")), rv.late.length ? h("span.warn-mini", rv.late.map((k) => t(`mr_late_${k}`)).join(" · ")) : null,
        ctx.canEdit ? h("button.icon-btn.mini", { type: "button", title: t("edit"), "aria-label": t("edit"), onclick: () => ctx.edit("qmr", rv.__key, rv.no) }, icon("edit", 13)) : null) : null),
    rv ? h("ol.mr-steps", steps.map((s) => h("li", { class: `${s.done ? "done" : ""} ${s.late ? "late" : ""}` }, h("i", s.done ? icon("check", 12) : null), h("b", s.label), h("small", s.sub)))) : null);
}
function stepsOf(rv, now) {
  const dd = (ts) => fmtDate(ts) || "—";
  return [
    { label: t("mr_s_planned"), done: true, sub: rv.no },
    { label: t("mr_s_data"), done: rv.collected === rv.total, sub: `${fmtNum(rv.collected)} / ${fmtNum(rv.total)}` },
    { label: t("mr_s_meeting"), done: rv.held, late: rv.late.includes("meeting") || rv.meetingOnTime === false, sub: rv.meeting ? `${dd(rv.meeting)}${rv.meetingOnTime === false ? ` · ${t("mr_held_late")}` : ""}` : t("mr_by", dd(rv.dueBy)) },
    { label: t("mr_s_minutes"), done: rv.minutes != null, late: rv.late.includes("minutes") || rv.minutesOnTime === false, sub: rv.minutes ? dd(rv.minutes) : rv.minutesDue ? t("mr_by", dd(rv.minutesDue)) : t("mr_within", MINUTES_DAYS) },
    { label: t("mr_s_report"), done: rv.report != null, late: rv.late.includes("report") || rv.reportOnTime === false, sub: rv.report ? dd(rv.report) : rv.reportDue ? t("mr_by", dd(rv.reportDue)) : t("mr_within", REPORT_DAYS) },
  ];
}

// ---------- overview: the reviews the procedure calls for, where the current one stands, the quality KPIs ----------
function overview(ctx, Q, rv) {
  const { m } = ctx, now = m.now;
  const held = Q.expected.filter((e) => e.review?.held);
  const dueGone = Q.expected.filter((e) => e.dueBy < now && e.status !== "Not recorded");
  const onTime = dueGone.length ? dueGone.filter((e) => e.status === "Held on time").length / dueGone.length : null;
  const openActs = Q.actions.filter((a) => a.open), lateActs = openActs.filter((a) => a.overdue);
  const closedActs = Q.actions.filter((a) => !a.cancelled);
  const esc0 = rv ? escalations(m, rv) : [];
  const next = rv && !rv.held ? rv : null;
  const daysTo = next?.dueBy != null ? Math.ceil((next.dueBy - now) / DAY) : null;
  return [
    h("section.sop-hero.mr-hero",
      h("div.sop-hero-text",
        h("span.eyebrow", t("mr_eyebrow")),
        h("h2", next ? t("mr_hero_next", next.no, periodName(next.period), fmtDate(next.dueBy)) : rv ? t("mr_hero_last", rv.no, periodName(rv.period), tv(rv.state)) : Q.toPlan ? t("mr_hero_plan", periodName(Q.toPlan.period), fmtDate(Q.toPlan.dueBy)) : t("mr_title")),
        h("p", t("mr_hero_sub", DUE_MONTHS, MINUTES_DAYS, REPORT_DAYS)),
        h("div.hero-meta", Q.expected.map((e) => h("button.chip.chip-glass", { type: "button", class: e.review && e.review === rv ? "on" : "", title: tv(e.status),
          onclick: () => (e.review ? (ctx.set("mrNo", e.review.no), ctx.set("mrTab", "report")) : ctx.canEdit && e.status !== "Period in progress" ? planReview(ctx, Q, e.period) : null) },
        h("i.cal-dot", { style: { background: CAL_COLOR[e.status] } }), e.period.label)))),
      h("div.apqr-rings",
        h("div.hero-ring", ring(rv ? rv.collected / rv.total : null, { size: 88, color: "#8fc1ff" }), h("span", t("mr_r_data"))),
        h("div.hero-ring", ring(closedActs.length ? closedActs.filter((a) => a.done).length / closedActs.length : null, { size: 88, color: "#5fe0b0" }), h("span", t("mr_r_actions"))),
        h("div.hero-ring", ring(onTime, { size: 88, color: "#ffd27a" }), h("span", t("mr_r_ontime"))))),
    esc0.length ? h("div.banner.warn", icon("alert", 18), h("span", h("b", t("mr_escalate", fmtNum(esc0.length))), " ", esc0.map((x) => `${tv(x.type)} ${x.ref || x.title}`).join(" · "), " — ", t("mr_escalate_h"))) : null,
    h("div.kpi-grid.six",
      kpi({ label: t("mr_k_next"), value: next ? fmtDate(next.dueBy) : Q.toPlan ? fmtDate(Q.toPlan.dueBy) : "—", hint: next ? (daysTo < 0 ? t("ck_late", fmtNum(-daysTo)) : t("ck_in", fmtNum(daysTo))) : Q.toPlan ? t("mr_to_plan") : "",
        status: daysTo == null ? 0 : daysTo < 0 ? 1 : daysTo <= 30 ? 2 : 3 }),
      kpi({ label: t("mr_k_ontime"), value: fmtPct(onTime), hint: t("mr_k_ontime_h", fmtNum(held.length)), status: onTime == null ? 0 : onTime >= 1 ? 3 : 1 }),
      kpi({ label: t("mr_k_data"), value: rv ? `${fmtNum(rv.collected)} / ${fmtNum(rv.total)}` : "—", hint: rv ? rv.no : "", accent: "var(--c1)", onclick: () => ctx.set("mrTab", "report") }),
      kpi({ label: t("mr_k_actions"), value: fmtNum(openActs.length), hint: `${fmtNum(lateActs.length)} ${t("k_overdue").toLowerCase()}`, status: lateActs.length ? 1 : openActs.length ? 2 : 3, onclick: () => ctx.set("mrTab", "actions") }),
      kpi({ label: t("mr_k_regs"), value: fmtNum(Q.regs.filter((r) => !r.closed).length), hint: `${fmtNum(Q.regs.filter((r) => r.overdue).length)} ${t("k_overdue").toLowerCase()}`, accent: "var(--c4)", onclick: () => ctx.set("mrTab", "regs") }),
      kpi({ label: t("mr_k_escalations"), value: fmtNum(esc0.length), hint: t("mr_k_escalations_h"), status: esc0.length ? 1 : 3 })),
    h("div.grid.cols-3",
      card(t("mr_c_calendar"), h("ul.mr-cal", Q.expected.slice().reverse().map((e) => h("li",
        h("span.mr-cal-p", h("b", periodName(e.period)), h("small", t("mr_due_by", fmtDate(e.dueBy)))),
        e.review ? h("button.link.mono", { type: "button", onclick: () => { ctx.set("mrNo", e.review.no); ctx.set("mrTab", "report"); } }, e.review.no) : h("span.muted", "—"),
        h("span", e.review?.meeting ? fmtDate(e.review.meeting) : ""),
        dot(CAL_COLOR[e.status], tv(e.status)),
        !e.review && ctx.canEdit && e.status !== "Period in progress" ? h("button.btn.compact", { type: "button", onclick: () => planReview(ctx, Q, e.period) }, icon("plus", 13), e.status === "Not recorded" ? t("mr_record") : t("mr_plan")) : null))),
      { span: 2, sub: t("mr_c_calendar_sub") }),
      card(t("mr_c_rules"), h("ul.mr-rules",
        h("li", icon("calendar", 15), t("mr_rule_freq", DUE_MONTHS)),
        h("li", icon("layers", 15), t("mr_rule_data")),
        h("li", icon("tasks", 15), t("mr_rule_minutes", MINUTES_DAYS)),
        h("li", icon("upload", 15), t("mr_rule_report", REPORT_DAYS)),
        h("li", icon("alert", 15), t("mr_rule_escalate")),
        h("li", icon("badge", 15), t("mr_rule_confidential"))), { sub: t("mr_c_rules_sub") })),
    Q.reviews.length ? card(`${t("mr_c_register")} · ${fmtNum(Q.reviews.length)}`, dataTable([
      { key: "no", label: t("mr_report_no"), cls: "mono nowrap" }, { key: "label", label: t("mr_period"), render: (r) => periodName(r.period) },
      { key: "dueBy", label: t("mr_due"), cls: "nowrap", render: (r) => fmtDate(r.dueBy) }, { key: "meeting", label: t("mr_date"), cls: "nowrap", render: (r) => fmtDate(r.meeting) },
      { key: "state", label: t("col_status"), render: (r) => dot(STATE_COLOR[r.state], tv(r.state)) },
      { key: "collected", label: t("mr_k_data"), cls: "num", render: (r) => `${r.collected} / ${r.total}` },
      { key: "acts", label: t("mr_t_actions"), cls: "num", sort: (r) => r.actions.filter((a) => a.open).length, render: (r) => `${r.actions.filter((a) => a.open).length} / ${r.actions.length}` },
      { key: "minutesOnTime", label: t("mr_minutes"), render: (r) => onTimeMark(r.minutesOnTime, r.minutes) }, { key: "reportOnTime", label: t("mr_report_corp"), render: (r) => onTimeMark(r.reportOnTime, r.report) },
    ], Q.reviews, { pageSize: 10, onRow: (r) => { ctx.set("mrNo", r.no); ctx.set("mrTab", "report"); }, exportName: "management-reviews" })) : null,
    kpiCards(ctx),
  ];
}
const onTimeMark = (ok, at) => (at == null ? h("span.muted", "—") : h("span", { class: ok === false ? "warn-mini" : "" }, `${fmtDate(at)}${ok === false ? " ⚠" : ""}`));

/** The site's quality KPIs against target (ICH Q10 scorecard), for the meeting. */
function kpiCards(ctx) {
  const { m } = ctx;
  const sc = M.scorecard(m), v = sc.values, T = m.targets;
  const statusChip = (s) => (s ? h(`span.rag.rag-${s}`, h("i"), [null, t("st_action"), t("st_watch"), t("st_on")][s]) : h("span.muted", "–"));
  const counts = [1, 2, 3].map((s) => sc.rows.filter((r) => r.status === s).length);
  const open = m.records.filter((r) => r.isOpen).sort((a, b) => b.priority - a.priority);
  return [
    card(t("mr_glance"), h("div.gauges",
      gauge(v.clos, { ...T.closure, label: t("g_closure"), sub: `${t("mr_target")} ≥ ${fmtPct(T.closure.target)}` }),
      gauge(1 - v.odr, { target: 1 - T.overdue.target, warning: 1 - T.overdue.warning, label: t("g_ontime"), sub: `${t("mr_target")} ≥ ${fmtPct(1 - T.overdue.target)}` }),
      gauge(v.ec, { ...T.capa_ec, label: t("g_ec"), sub: `${t("mr_target")} ≥ ${fmtPct(T.capa_ec.target)}` }),
      gauge(v.cal, { ...T.cal, label: t("g_cal"), sub: `${t("mr_target")} ≥ ${fmtPct(T.cal.target)}` }))),
    card(t("mr_score"), [
      h("div.rag-summary", [3, 2, 1].map((s) => h(`span.rag.rag-${s}.big`, h("i"), `${counts[s - 1]} · ${[null, t("st_action"), t("st_watch"), t("st_on")][s]}`))),
      h("div.table-scroll", h("table.data.scorecard",
        h("thead", h("tr", [t("mr_kpi"), t("mr_area"), t("mr_actual"), t("mr_target"), t("mr_status")].map((x) => h("th", x)))),
        h("tbody", sc.rows.map((r) => h(`tr.st-${r.status}`, h("td", t(r.key)), h("td.muted", t(r.area)), h("td.num", h("b", fmtValue(r.value, r.unit))),
          h("td.num.muted", r.target ? `${r.hib ? "≥" : "≤"} ${fmtValue(r.target.target, r.unit)}` : "—"), h("td", statusChip(r.status)))))))]),
    card(t("mr_act"), dataTable(recordCols(["ref", "type", "prio", "late", "due", "title", "owner"]), open, { pageSize: 8, onRow: (r) => ctx.open.record(r.ref), exportName: "priority-list" }), { sub: t("mr_prio_note") }),
  ];
}

// ---------- report: the mandatory parameters, collected by department and assessed ----------
function report(ctx, Q, rv) {
  if (!rv) return [];
  const { m } = ctx;
  const f = ctx.state.mrF ?? {};
  const setF = (k, v) => ctx.set("mrF", { ...f, [k]: v });
  const depts = collectionByDept(rv);
  const dept = depts.some((d) => d.dept === f.dept) ? f.dept : ALL;
  const st = INPUT_STATUS.includes(f.status) ? f.status : ALL;
  const statusOf = (key) => rv.inputBy.get(key)?.Status || "Requested";
  const params = QMR_PARAMS.filter((p) => (dept === ALL || p.depts.includes(dept)) && (st === ALL || statusOf(p.key) === st));
  const others = rv.inputs.filter((x) => String(x.Parameter ?? "").startsWith("other-"));
  const frozen = rv.inputs.some((x) => x.Snapshot);
  const assessed = QMR_PARAMS.map((p) => rv.inputBy.get(p.key)?.Assessment).filter(Boolean);
  return [
    h("div.grid.cols-3",
      card(t("mr_c_collect"), h("div.mr-depts", depts.map((d) => h("button.mr-dept", { type: "button", class: dept === d.dept ? "on" : "", onclick: () => setF("dept", dept === d.dept ? ALL : d.dept) },
        h("b", tv(d.dept)), h("span.trn-bar", h("i", { style: { width: `${Math.round((d.done / d.total) * 100)}%`, background: d.done === d.total ? "var(--good)" : "var(--c1)" } }), h("b", `${d.done} / ${d.total}`)),
        h("small", d.params.filter((x) => !x.input || x.input.Status === "Requested").map((x) => t(`qp_${x.p.key}`)).join(" · ") || t("mr_all_in"))))), { span: 2, sub: t("mr_c_collect_sub") }),
      card(t("mr_c_assess"), h("div.mr-assess",
        ASSESSMENTS.map((a) => h("div", dot(ASSESS_COLOR[a], tv(a)), h("b", fmtNum(assessed.filter((x) => x === a).length)))),
        h("div", dot("var(--muted-mark)", t("mr_not_assessed")), h("b", fmtNum(QMR_PARAMS.length - assessed.length))),
        frozen ? h("p.fine", icon("check", 13), t("mr_frozen_note")) : null,
        ctx.canEdit ? h("button.btn.compact", { type: "button", onclick: () => freeze(ctx, Q, rv) }, icon("cycle", 14), frozen ? t("mr_refreeze") : t("mr_freeze")) : null), { sub: t("mr_c_assess_sub") })),
    card(null, h("div.filters",
      select(t("mr_dept"), [[ALL, t("filter_all")], ...depts.map((d) => [d.dept, tv(d.dept)])], dept, (v) => setF("dept", v)),
      select(t("col_status"), [[ALL, t("filter_all")], ...INPUT_STATUS.map((s) => [s, tv(s)])], st, (v) => setF("status", v)),
      dept !== ALL || st !== ALL ? h("div.field", h("span", " "), h("button.btn.ghost", { type: "button", onclick: () => ctx.set("mrF", {}) }, icon("close", 15), t("trn_clear_filters"))) : null), { cls: "filter-card" }),
    h("div.qp-list", params.map((p) => paramCard(ctx, Q, rv, p.key)),
      params.length ? null : h("div.empty", t("none_found"))),
    card(t("mr_c_other"), [
      others.length ? h("div.qp-list", others.map((x) => paramCard(ctx, Q, rv, x.Parameter))) : h("p.muted", t("mr_other_none")),
      ctx.canEdit ? h("div.mr-other-add", OTHER_TOPICS.filter((o) => !others.some((x) => x.Title === o)).slice(0, 12).map((o) => h("button.chip", { type: "button", onclick: () => addOther(ctx, rv, o) }, icon("plus", 12), tv(o))),
        h("button.chip", { type: "button", onclick: () => addOther(ctx, rv, "") }, icon("plus", 12), t("mr_other_free"))) : null], { sub: t("mr_c_other_sub") }),
  ];
}

function paramCard(ctx, Q, rv, key) {
  const { m } = ctx;
  const P = PARAM_BY.get(key);
  const input = rv.inputBy.get(key) ?? null;
  const d = P ? paramData(m, Q, rv, key) : { figs: [], hint: 0 };
  const snap = input?.Snapshot ? figuresOf(input.Snapshot) : null;
  const figs = snap?.figs?.length ? snap.figs : d.figs;
  const status = input?.Status || "Requested";
  const sugg = HINT_ASSESS[d.hint];
  if (d.trend && !d.trend.points.some((pt) => pt.value != null)) d.trend = null;
  const fmt = d.trend?.u === "%" ? fmtPct : d.trend?.u === "r" || d.trend?.u === "x" ? (v) => (+v).toFixed(1) : fmtNum;
  const link = d.link ? h("a.link", { href: `#/${d.link}` }, t("mr_open_module"), " ", icon("chevron", 12)) : d.src === "regs" ? h("button.link", { type: "button", onclick: () => ctx.set("mrTab", "regs") }, t("mr_t_regs")) : d.src === "actions" ? h("button.link", { type: "button", onclick: () => ctx.set("mrTab", "actions") }, t("mr_t_actions")) : null;
  return h("article.qp-card", { class: `st-${status.replace(/\s+/g, "-").toLowerCase()}` },
    h("header.qp-head",
      h("span.qp-no", P ? P.ch : "+"),
      h("div.qp-title", h("h3", pName(key, input)), P ? h("small", t(`qp_${key}_h`)) : input?.Data ? h("small", short(input.Data, 140)) : null,
        h("div.qp-tags", (P?.depts ?? [input?.Department].filter(Boolean)).map((x) => h("span.tag", tv(x))))),
      h("div.qp-state", dot(INPUT_COLOR[status], tv(status)),
        input?.Assessment ? dot(ASSESS_COLOR[input.Assessment], tv(input.Assessment)) : sugg ? h("span.qp-sugg", { title: t("mr_suggested_h") }, t("mr_suggested"), " ", dot(ASSESS_COLOR[sugg], tv(sugg))) : null)),
    figs.length ? h("div.qp-figs", figs.map((f) => h("div.qp-fig", { class: f.v == null ? "none" : "", style: f.tone ? { "--tone": TONE[f.tone] } : null },
      h("small", t(f.k)), h("b", fmtFig(f)), f.sub ? h("em", f.sub) : null))) : null,
    snap?.at ? h("p.fine", icon("check", 12), t("mr_frozen_on", fmtDate(Date.parse(snap.at)))) : null,
    d.trend || d.bars ? h("div.qp-charts",
      d.trend ? h("div.qp-chart", h("small", `${t(d.trend.k)} · ${t("mr_two_years")}`), vbars(d.trend.points.map((pt, i, a) => ({ label: pt.x, short: pt.x.slice(2), value: pt.value,
        color: i === a.length - 1 ? "var(--c1)" : "var(--muted-mark)", tip: pt.n != null ? `<div class="tip-row"><span>${esc(t("qf_batches"))}</span><b>${esc(fmtNum(pt.n))}</b></div>` : "" })), { height: 84, fmt })) : null,
      d.bars ? h("div.qp-chart", h("small", t(d.bars.k)), hbars(d.bars.items.slice(0, 6).map((b) => ({ label: tv(b.label), value: b.value, sub: b.sub ?? null })))) : null) : null,
    d.rows?.items.length ? h("details.qp-rows", h("summary", `${t(d.rows.k)} · ${fmtNum(d.rows.items.length)}`),
      h("ul", d.rows.items.slice(0, 30).map((r) => h("li", r.record ? h("button.link.mono", { type: "button", onclick: () => ctx.open.record(r.ref) }, r.ref) : h("b.mono", r.ref ?? ""), h("span", short(r.title, 90)),
        h("small.muted", [r.extra, r.who, tv(r.status ?? ""), r.due ? fmtDate(r.due) : null].filter(Boolean).join(" · ")))))) : null,
    input?.Data && P ? h("p.qp-note", h("b", t("mr_data_notes")), " ", input.Data) : null,
    input?.Conclusion ? h("p.qp-concl", h("b", t("mr_conclusion")), " ", input.Conclusion) : null,
    h("footer.qp-foot",
      ctx.canEdit ? h("button.btn.compact", { type: "button", onclick: () => openParam(ctx, Q, rv, key, d) }, icon("edit", 13), input ? t("mr_assess") : t("mr_enter")) : null,
      ctx.canEdit ? h("button.btn.compact.ghost", { type: "button", onclick: () => addAction(ctx, rv, { Area: P?.name ?? "Other" }) }, icon("plus", 13), t("mr_act_add")) : null,
      h("span.qp-acts", (() => { const n = rv.actions.filter((a) => a.Area === (P?.name ?? "Other")).length; return n ? `${fmtNum(n)} ${t("mr_t_actions").toLowerCase()}` : ""; })()),
      link));
}

/** Enter one parameter's data and assess it: status, hand-entered figures, notes, conclusion. */
function openParam(ctx, Q, rv, key, d) {
  const n = ++uid;
  const P = PARAM_BY.get(key);
  const input = rv.inputBy.get(key) ?? null;
  const figs0 = figuresOf(input?.Figures);
  const status = h("select", { id: `qp${n}-st` }, options(INPUT_STATUS, input?.Status && input.Status !== "Requested" ? input.Status : "Collected"));
  const assess = h("select", { id: `qp${n}-as` }, h("option", { value: "" }, "—"), options(ASSESSMENTS, input?.Assessment ?? HINT_ASSESS[d?.hint] ?? ""));
  const title = P ? null : h("input", { id: `qp${n}-ti`, value: input?.Title ?? "" });
  const nums = (P?.fields ?? []).map((f) => [f, h("input", { id: `qp${n}-${f}`, type: "number", step: "any", min: "0", inputmode: "decimal", value: figs0[f] ?? "" })]);
  const data = h("textarea", { id: `qp${n}-da`, rows: 3, placeholder: t("mr_data_ph") }, input?.Data ?? "");
  const concl = h("textarea", { id: `qp${n}-co`, rows: 3, placeholder: t("mr_concl_ph") }, input?.Conclusion ?? "");
  const form = saveForm(async () => {
    const figs = Object.fromEntries(nums.filter(([, el]) => el.value !== "").map(([f, el]) => [f, +el.value]));
    const obj = { "Report no": rv.no, Parameter: key, Department: input?.Department ?? P?.depts[0] ?? null, Status: status.value, Assessment: assess.value || null,
      Figures: Object.keys(figs).length ? JSON.stringify(figs) : null, Data: data.value.trim() || null, Conclusion: concl.value.trim() || null, "Updated by": ctx.myName, "Updated on": isoToday() };
    if (title) obj.Title = title.value.trim() || input?.Title || null;
    await ctx.saveObj("qmrInputs", input?.__key ?? null, obj);
    ctx.closeDrawer(); ctx.rerender();
    return null;
  }, ctx,
  h("div.form-grid", title ? field(t("mr_topic"), title, true) : null, field(t("col_status"), status), field(t("mr_assessment"), assess),
    ...nums.map(([f, el]) => field(t(`qf_${f}`), el)), field(t("mr_data_notes"), data, true), field(t("mr_conclusion"), concl, true)));
  ctx.open.drawer(() => [
    h("div.d-head", h("span.d-ref", `${rv.no} · ${P ? P.ch : t("mr_c_other")}`), h("h2", pName(key, input))),
    P ? h("p.fine", t(`qp_${key}_h`)) : null,
    d?.figs?.length ? h("div.qp-figs.small", d.figs.filter((f) => !(P?.fields ?? []).includes(f.k.replace(/^qf_/, ""))).map((f) => h("div.qp-fig", { class: f.v == null ? "none" : "" }, h("small", t(f.k)), h("b", fmtFig(f))))) : null,
    d?.hint ? h("p.fine", t("mr_suggested"), " ", dot(ASSESS_COLOR[HINT_ASSESS[d.hint]], tv(HINT_ASSESS[d.hint])), " — ", t("mr_suggested_h")) : null,
    form,
  ], { form: true });
}

async function addOther(ctx, rv, title) {
  const n = rv.inputs.filter((x) => String(x.Parameter ?? "").startsWith("other-")).length + 1;
  const key = `other-${String(n).padStart(2, "0")}`;
  if (!title) return openParam(ctx, null, rv, key, null);
  await ctx.saveObj("qmrInputs", null, { "Report no": rv.no, Parameter: key, Title: title, Status: "Requested", "Updated by": ctx.myName, "Updated on": isoToday() });
}

/** Keep the figures as they were at the review: each parameter's figures are stored with the review. */
async function freeze(ctx, Q, rv) {
  const at = new Date().toISOString();
  const objs = QMR_PARAMS.map((p) => {
    const d = paramData(ctx.m, Q, rv, p.key);
    const input = rv.inputBy.get(p.key);
    return { "Report no": rv.no, Parameter: p.key, Department: input?.Department ?? p.depts[0], Status: input?.Status ?? "Requested",
      Snapshot: JSON.stringify({ at, figs: d.figs.map((f) => ({ k: f.k, v: f.v, u: f.u, sub: f.sub ?? null, tone: f.tone ?? null })) }) };
  });
  try { await ctx.bulkUpsert("qmrInputs", objs, ["Report no", "Parameter"], null, "snapshot"); ctx.toast(t("mr_frozen_ok")); } catch (e) { ctx.toast(e.message, "warn"); }
}

// ---------- meeting: date, participants, minutes, timelines, approvals ----------
function meeting(ctx, Q, rv) {
  if (!rv) return [];
  const now = ctx.m.now;
  const edit = (k) => (ctx.canEdit ? () => ctx.edit("qmr", rv.__key, rv.no) : null);
  const stamp = (col, label) => (ctx.canEdit && !rv[col] ? h("button.btn.compact", { type: "button", onclick: () => ctx.saveObj("qmr", rv.__key, { [col]: isoToday() }) }, icon("check", 13), label) : null);
  const ppl = rv.attendees.slice().sort((a, b) => QMR_ROLES.indexOf(a.Role) - QMR_ROLES.indexOf(b.Role));
  const named = ppl.filter((p) => p.Name || p.Attendance === "Present");
  const actsCur = rv.actions;
  const minutesItems = [
    [t("mr_m_period"), true, periodName(rv.period)],
    [t("mr_m_participants"), named.length > 0, `${fmtNum(rv.present)} / ${fmtNum(ppl.length)}`],
    [t("mr_m_summary"), Boolean(rv.Summary), ""],
    [t("mr_m_actions"), actsCur.length > 0, fmtNum(actsCur.filter((a) => a.Type !== "CAPA").length)],
    [t("mr_m_capa"), actsCur.some((a) => a.Type === "CAPA") || /no capa|aucune capa/i.test(rv.Summary ?? ""), fmtNum(actsCur.filter((a) => a.Type === "CAPA").length)],
    [t("mr_m_improve"), Boolean(rv.Improvements), ""],
    [t("mr_m_resources"), Boolean(rv.Resources), ""],
    [t("mr_m_policy"), Boolean(rv["Policy & objectives"]), ""],
  ];
  const textBlock = (col, label, ph) => {
    const ta = h("textarea", { rows: 4, placeholder: ph, disabled: ctx.canEdit ? null : true }, rv[col] ?? "");
    return h("label.field.mr-text", h("span", label), ta,
      ctx.canEdit ? h("button.btn.compact", { type: "button", onclick: async () => { await ctx.saveObj("qmr", rv.__key, { [col]: ta.value.trim() || null }); } }, t("save")) : null);
  };
  return [
    h("div.grid.cols-3",
      card(t("mr_c_meeting"), [
        h("dl.mr-dl",
          h("dt", t("mr_report_no")), h("dd.mono", rv.no), h("dt", t("mr_period")), h("dd", `${periodName(rv.period)} (${fmtDate(rv.period?.start)} – ${fmtDate(rv.period ? rv.period.end - DAY : null)})`),
          h("dt", t("mr_due")), h("dd", fmtDate(rv.dueBy)), h("dt", t("mr_invite")), h("dd", fmtDate(M.toDay(rv["Invitation sent"])) || "—"),
          h("dt", t("mr_date")), h("dd", rv.meeting ? fmtDate(rv.meeting) : "—", rv.meetingOnTime === false ? h("span.warn-mini", " ", t("mr_held_late")) : null),
          h("dt", t("mr_venue")), h("dd", rv.Venue ?? "—"), h("dt", t("mr_chair")), h("dd", rv.Chair ?? "—"), h("dt", t("mr_site")), h("dd", [rv.Site, rv.Location].filter(Boolean).join(" · ") || "—")),
        h("div.mr-btns", ctx.canEdit ? h("button.btn.compact", { type: "button", onclick: edit() }, icon("edit", 13), t("edit")) : null, stamp("Invitation sent", t("mr_invite_today")), stamp("Meeting date", t("mr_held_today")))], { sub: t("mr_c_meeting_sub") }),
      card(t("mr_c_timeline"), h("ol.mr-timeline", stepsOf(rv, now).map((s) => h("li", { class: `${s.done ? "done" : ""} ${s.late ? "late" : ""}` }, h("b", s.label), h("span", s.sub)))),
        { sub: t("mr_c_timeline_sub", MINUTES_DAYS, REPORT_DAYS) }),
      card(t("mr_c_minutes_check"), h("ul.mr-check", minutesItems.map(([label, ok, val]) => h("li", { class: ok ? "ok" : "" }, h("i", ok ? icon("check", 12) : null), h("span", label), h("small", val)))),
        { sub: t("mr_c_minutes_check_sub") })),
    card(`${t("mr_c_people")} · ${fmtNum(rv.present)} ${t("mr_present").toLowerCase()} / ${fmtNum(ppl.length)}`, [
      h("div.table-scroll", h("table.data.compact.mr-people",
        h("thead", h("tr", [t("mr_role"), t("col_name"), t("mr_title_col"), t("mr_attendance"), t("mr_signed"), ""].map((x) => h("th", x)))),
        h("tbody", ppl.map((p) => h("tr",
          h("td", tv(p.Role ?? "")), h("td", h("b", p.Name ?? "—")), h("td.muted", p.Title ?? ""),
          h("td", ctx.canEdit ? h("select.inline", { onchange: (e) => ctx.saveObj("qmrAttendees", p.__key, { Attendance: e.target.value }, true) }, options(ATTENDANCE, p.Attendance ?? "Invited")) : dot(ATT_COLOR[p.Attendance], tv(p.Attendance ?? ""))),
          h("td", ctx.canEdit ? h("select.inline", { onchange: (e) => ctx.saveObj("qmrAttendees", p.__key, { Signed: e.target.value || null }, true) }, h("option", { value: "" }, "—"), options(["Yes", "No"], p.Signed)) : tv(p.Signed ?? "")),
          h("td", ctx.canEdit ? h("button.icon-btn.mini", { type: "button", title: t("edit"), "aria-label": t("edit"), onclick: () => ctx.edit("qmrAttendees", p.__key, p.Role) }, icon("edit", 13)) : null)))))),
      ctx.canEdit ? h("div.mr-btns", h("button.btn.compact", { type: "button", onclick: () => ctx.addWith("qmrAttendees", { "Report no": rv.no, Attendance: "Invited" }) }, icon("plus", 13), t("mr_add_person")),
        rv.meeting ? h("button.btn.compact.ghost", { type: "button", onclick: () => ctx.bulkUpdate("qmrAttendees", ppl.filter((p) => p.Name && p.Attendance === "Invited").map((p) => p.__key), { Attendance: "Present" }) }, icon("check", 13), t("mr_all_present")) : null) : null],
    { sub: t("mr_c_people_sub") }),
    card(t("mr_c_minutes"), h("div.form-grid.mr-minutes",
      textBlock("Summary", t("mr_m_summary"), t("mr_summary_ph")),
      textBlock("Improvements", t("mr_m_improve"), t("mr_improve_ph")),
      textBlock("Resources", t("mr_m_resources"), t("mr_resources_ph")),
      textBlock("Policy & objectives", t("mr_m_policy"), t("mr_policy_ph")),
      textBlock("Escalations", t("mr_m_escalations"), t("mr_escalations_ph"))), { sub: t("mr_c_minutes_sub") }),
    h("div.grid.cols-2",
      card(t("mr_c_share"), [
        h("dl.mr-dl", h("dt", t("mr_minutes")), h("dd", rv.minutes ? fmtDate(rv.minutes) : rv.minutesDue ? t("mr_by", fmtDate(rv.minutesDue)) : "—", rv.minutesOnTime === false ? h("span.warn-mini", " ⚠") : null),
          h("dt", t("mr_report_corp")), h("dd", rv.report ? fmtDate(rv.report) : rv.reportDue ? t("mr_by", fmtDate(rv.reportDue)) : "—", rv.reportOnTime === false ? h("span.warn-mini", " ⚠") : null),
          h("dt", t("mr_file")), h("dd", rv["File ref"] ?? "—")),
        h("div.mr-btns", rv.meeting ? stamp("Minutes shared on", t("mr_minutes_today")) : null, rv.meeting ? stamp("Report to corporate on", t("mr_report_today")) : null),
        h("p.fine", t("mr_file_h"))]),
      card(t("mr_c_approval"), [
        h("dl.mr-dl", h("dt", t("mr_prepared")), h("dd", rv["Prepared by"] ?? "—"), h("dt", t("mr_approved")), h("dd", rv["Approved by"] ?? "—"), h("dt", t("mr_approved")), h("dd", rv["Approved by (2)"] ?? "—")),
        ctx.canEdit ? h("div.mr-btns", h("button.btn.compact", { type: "button", onclick: edit() }, icon("edit", 13), t("edit"))) : null])),
  ];
}

// ---------- actions and decisions, followed up to closure ----------
function addAction(ctx, rv, preset) {
  ctx.addWith("qmrActions", { "Report no": rv.no, Type: "Action", Status: "Open", ...preset });
}
function actionsTab(ctx, Q, rv) {
  const f = ctx.state.mrA ?? {};
  const setF = (k, v) => ctx.set("mrA", { ...f, [k]: v });
  const scope = ["review", "open", "all"].includes(f.scope) ? f.scope : "review";
  const L = Q.actions.filter((a) => (scope === "all" || (scope === "open" ? a.open : a.review === rv || (a.open && a.review && rv?.period && a.review.period?.start < rv.period.start)))
    && (!ACTION_TYPES.includes(f.type) || a.Type === f.type));
  const legacy = ctx.local.get("decisions") ?? [];
  const done = Q.actions.filter((a) => a.done), timed = done.filter((a) => a.onTime != null);
  return [
    h("div.kpi-grid.six",
      kpi({ label: t("mr_k_actions"), value: fmtNum(Q.actions.filter((a) => a.open).length), accent: "var(--c1)", onclick: () => setF("scope", "open") }),
      kpi({ label: t("k_overdue"), value: fmtNum(Q.actions.filter((a) => a.overdue).length), status: Q.actions.some((a) => a.overdue) ? 1 : 3 }),
      kpi({ label: t("k_completed"), value: fmtNum(done.length), accent: "var(--good)" }),
      kpi({ label: t("cal_ontime"), value: timed.length ? fmtPct(timed.filter((a) => a.onTime).length / timed.length) : "—" }),
      kpi({ label: t("mr_k_this"), value: fmtNum(rv?.actions.length ?? 0), hint: rv?.no ?? "" }),
      kpi({ label: t("mr_k_carried"), value: fmtNum(Q.actions.filter((a) => a.open && a.review && rv?.period && a.review.period?.start < rv.period.start).length), hint: t("mr_k_carried_h") })),
    card(null, h("div.filters",
      h("div.field", h("span", t("mr_scope")), segmented([["review", t("mr_scope_review")], ["open", t("mr_scope_open")], ["all", t("filter_all")]], scope, (v) => setF("scope", v), t("mr_scope"))),
      select(t("col_type"), [[ALL, t("filter_all")], ...ACTION_TYPES.map((x) => [x, tv(x)])], ACTION_TYPES.includes(f.type) ? f.type : ALL, (v) => setF("type", v))), { cls: "filter-card" }),
    card(`${t("mr_c_outcome")} · ${fmtNum(L.length)}`, L.length ? dataTable([
      { key: "Action ID", label: t("col_id"), cls: "mono nowrap" }, { key: "Report no", label: t("mr_review"), cls: "mono nowrap" },
      { key: "Area", label: t("mr_area_col"), render: (a) => tv(a.Area ?? "") }, { key: "Type", label: t("col_type"), render: (a) => tv(a.Type ?? "") },
      { key: "Action", label: t("mr_action_col"), cls: "wrap", render: (a) => h("div.trn-cell", h("b", short(a.Action, 110)), a["Linked record"] ? h("small.mono", a["Linked record"]) : null) },
      { key: "Responsible", label: t("mr_responsible") }, { key: "due", label: t("col_due"), cls: "nowrap", sort: (a) => a.due ?? 9e15, render: (a) => fmtDate(a.due) },
      { key: "state", label: t("col_status"), render: (a) => ctx.canEdit ? h("select.inline", { onclick: (e) => e.stopPropagation(), onchange: (e) => ctx.saveObj("qmrActions", a.__key, { Status: e.target.value, "Closed on": e.target.value === "Done" ? (a["Closed on"] ?? isoToday()) : a["Closed on"] ?? null }, true) },
        options(ACTION_STATUS, a.Status || "Open")) : dot(ACT_COLOR[a.state], tv(a.state)) },
      { key: "flag", label: "", render: (a) => (a.overdue ? h("span.warn-mini", t("k_overdue")) : a.done && a.onTime === false ? h("span.muted", t("mr_closed_late")) : "") },
    ], L, { pageSize: 25, onRow: ctx.canEdit ? (a) => ctx.edit("qmrActions", a.__key, a["Action ID"]) : null, exportName: "qmr-actions" }) : h("div.empty", t("mr_act_none")), { sub: t("mr_c_outcome_sub") }),
    legacy.length ? card(t("mr_c_legacy"), [
      h("ul.mr-legacy", legacy.map((d) => h("li", h("b", d.text), h("small.muted", [d.owner, d.due, tv(d.status ?? "")].filter(Boolean).join(" · "))))),
      ctx.canEdit && rv ? h("button.btn.compact", { type: "button", onclick: async () => {
        for (const d of legacy) await ctx.saveObj("qmrActions", null, { "Action ID": null, "Report no": rv.no, Area: "Meeting", Type: "Decision", Action: d.text, Responsible: d.owner || null, Due: d.due || null,
          Status: d.status === "Done" ? "Done" : d.status === "Cancelled" ? "Cancelled" : d.status === "In progress" ? "In progress" : "Open" }, true, "legacy");
        ctx.local.set("decisions", []);
        ctx.toast(t("mr_legacy_moved", rv.no));
      } }, icon("cycle", 13), t("mr_legacy_move", rv.no)) : null], { sub: t("mr_c_legacy_sub") }) : null,
  ];
}

// ---------- regulatory watch ----------
function regsTab(ctx, Q) {
  const R = Q.regs;
  const REG_COLOR = { New: "var(--c1)", Assessing: "var(--c4)", Implementing: "var(--warning)", Implemented: "var(--good)", "Not applicable": "var(--muted-mark)" };
  return [
    h("div.kpi-grid",
      kpi({ label: t("mr_reg_total"), value: fmtNum(R.length), accent: "var(--c1)" }),
      kpi({ label: t("mr_reg_open"), value: fmtNum(R.filter((r) => !r.closed).length), accent: "var(--c4)" }),
      kpi({ label: t("k_overdue"), value: fmtNum(R.filter((r) => r.overdue).length), status: R.some((r) => r.overdue) ? 1 : 3 }),
      kpi({ label: t("mr_reg_done"), value: fmtNum(R.filter((r) => /implemented/i.test(r.Status ?? "")).length), accent: "var(--good)" })),
    card(`${t("mr_t_regs")} · ${fmtNum(R.length)}`, R.length ? dataTable([
      { key: "Reg ID", label: t("col_id"), cls: "mono nowrap" }, { key: "Regulation", label: t("mr_regulation"), cls: "wrap", render: (r) => h("div.trn-cell", h("b", short(r.Regulation, 110)), r.Impact ? h("small", short(r.Impact, 140)) : null) },
      { key: "Kind", label: t("col_type"), render: (r) => tv(r.Kind ?? "") }, { key: "Authority / market", label: t("mr_authority") },
      { key: "published", label: t("mr_published"), cls: "nowrap", render: (r) => fmtDate(r.published) }, { key: "Owner", label: t("col_owner") },
      { key: "due", label: t("col_due"), cls: "nowrap", render: (r) => h("span", { class: r.overdue ? "warn-mini" : "" }, fmtDate(r.due)) },
      { key: "Status", label: t("col_status"), render: (r) => dot(REG_COLOR[r.Status] ?? "var(--muted-mark)", tv(r.Status ?? "New")) },
    ], R, { pageSize: 25, onRow: ctx.canEdit ? (r) => ctx.edit("qmrRegs", r.__key, r["Reg ID"]) : null, exportName: "regulatory-watch" }) : h("div.empty", t("mr_reg_none")), { sub: t("mr_regs_sub") }),
  ];
}

// ---------- the report, laid out as the template: header, participants, parameters, outcome and monitoring, approvals ----------
function printTab(ctx, Q, rv) {
  if (!rv) return [];
  const { m } = ctx;
  const sop = (m.x.sopx.byTopic.get("review") ?? []).find((s) => s.Site === "Oncology") ?? (m.x.sopx.byTopic.get("review") ?? [])[0] ?? null;
  const tpl = sop?.formList?.find((e) => e.kind === "template") ?? null;
  const ppl = rv.attendees.filter((p) => p.Name).sort((a, b) => QMR_ROLES.indexOf(a.Role) - QMR_ROLES.indexOf(b.Role));
  const statusLine = (key) => {
    const input = rv.inputBy.get(key);
    const d = paramData(m, Q, rv, key);
    const snap = input?.Snapshot ? figuresOf(input.Snapshot).figs : null;
    const figs = (snap?.length ? snap : d.figs).filter((f) => f.v != null).slice(0, 6);
    return [input?.Assessment ? h("b", tv(input.Assessment)) : h("span.muted", tv(input?.Status ?? "Requested")),
      figs.length ? h("div.pr-figs", figs.map((f) => `${t(f.k)}: ${fmtFig(f)}`).join(" · ")) : null,
      d.trend?.points.some((pt) => pt.value != null) ? h("div.pr-figs", `${t(d.trend.k)} · ${t("mr_two_years")}: `, d.trend.points.map((pt) => `${pt.x} ${pt.value == null ? "—" : fmtFig({ v: pt.value, u: d.trend.u })}`).join(" → ")) : null,
      input?.Conclusion ? h("div", input.Conclusion) : null];
  };
  const others = rv.inputs.filter((x) => String(x.Parameter ?? "").startsWith("other-"));
  const sign = (label, name) => h("tr", h("td", label), h("td", name ?? ""), h("td", ""), h("td.pr-sign", ""));
  return [
    h("p.fine.no-print", t("mr_print_note")),
    h("article.qmr-print",
      h("table.pr-head", h("tr", h("td.pr-tpl", h("small", t("mr_tpl_no")), h("b.mono", tpl ? `${tpl.code}${tpl.rev ? `/${tpl.rev}` : ""}` : "—")), h("td", h("h1", t("mr_report_title"))))),
      h("table.pr-meta", h("tr", h("td", h("small", t("mr_site")), h("b", rv.Site ?? t("brand_site"))), h("td", h("small", t("mr_location")), h("b", rv.Location ?? "")),
        h("td", h("small", t("mr_date")), h("b", fmtDate(rv.meeting) || "")), h("td", h("small", t("mr_report_no")), h("b.mono", rv.no)))),
      h("p.pr-period", t("mr_m_period"), ": ", h("b", `${periodName(rv.period)} (${fmtDate(rv.period?.start)} – ${fmtDate(rv.period ? rv.period.end - DAY : null)})`), sop ? ` · ${sop.Code}${sop.Revision ? ` rev ${sop.Revision}` : ""}` : ""),
      h("h2", t("mr_c_people")),
      h("table.pr-table", h("thead", h("tr", h("th", t("col_name")), h("th", t("mr_title_col")), h("th", t("mr_attendance")), h("th", t("mr_signature")))),
        h("tbody", (ppl.length ? ppl : QMR_ROLES.map((r) => ({ Role: r }))).map((p) => h("tr", h("td", p.Name ?? ""), h("td", p.Title || tv(p.Role ?? "")), h("td", tv(p.Attendance ?? "")), h("td.pr-sign", ""))))),
      h("h2", t("mr_parameters")),
      h("table.pr-table", h("thead", h("tr", h("th", "#"), h("th", t("mr_parameter")), h("th", t("col_status")))),
        h("tbody", QMR_PARAMS.map((p, i) => h("tr", h("td.num", String(i + 1)), h("td", h("b", t(`qp_${p.key}`)), h("small", ` ${p.ch}`)), h("td", statusLine(p.key)))),
          others.map((x, i) => h("tr", h("td.num", String(QMR_PARAMS.length + i + 1)), h("td", h("b", x.Title ?? "")), h("td", x.Assessment ? h("b", tv(x.Assessment)) : null, x.Conclusion ? h("div", x.Conclusion) : null))))),
      rv.Summary ? [h("h2", t("mr_m_summary")), h("p.pr-text", rv.Summary)] : null,
      [["Improvements", "mr_m_improve"], ["Resources", "mr_m_resources"], ["Policy & objectives", "mr_m_policy"], ["Escalations", "mr_m_escalations"]].filter(([c]) => rv[c]).map(([c, k]) => [h("h3", t(k)), h("p.pr-text", rv[c])]),
      h("h2", t("mr_c_outcome")),
      h("table.pr-table", h("thead", h("tr", ["N°", t("mr_area_col"), t("mr_action_col"), t("mr_responsible"), t("col_due"), t("mr_comments")].map((x) => h("th", x)))),
        h("tbody", rv.actions.length ? rv.actions.map((a, i) => h("tr", h("td.num", String(i + 1)), h("td", a.Area ? tv(a.Area) : "—"), h("td", a.Action, a.Type && a.Type !== "Action" ? h("small", ` (${tv(a.Type)})`) : null),
          h("td", a.Responsible ?? ""), h("td.nowrap", fmtDate(a.due)), h("td", [a.Comments, a["Linked record"], a.done ? tv("Done") : null].filter(Boolean).join(" · ")))) : h("tr", h("td", { colspan: 6 }, h("span.muted", t("mr_act_none")))))),
      h("h2", t("mr_c_approval")),
      h("table.pr-table", h("thead", h("tr", h("th", ""), h("th", t("col_name")), h("th", t("mr_title_col")), h("th", t("mr_signature")))),
        h("tbody", sign(t("mr_prepared"), rv["Prepared by"]), sign(t("mr_approved"), rv["Approved by"]), sign(t("mr_approved"), rv["Approved by (2)"]))),
      h("p.pr-foot", t("mr_rule_confidential"))),
  ];
}
