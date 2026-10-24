// Training, as the site's training procedure organises it: planned trainings (each department's annual plan) and
// unplanned ones (a new or revised SOP, a quality circle, a deviation / OOS / complaint, an external course, a re-training,
// an induction or a new position), given by job position. The training matrix says what each position must know; the
// attendance recorded for each training fills every employee's training card, with the score and the re-training it calls for.
import { h, card, kpi, viewHeader, segmented, select, dataTable, fmtDate, fmtNum, fmtPct, esc } from "./ui.js";
import { hbars, stacks, columns, lineChart, gantt, ring, vbars } from "./charts.js";
import { t, tv } from "./i18n.js";
import { icon } from "./icons.js";
import * as M from "./model.js";
import { VOCAB as V } from "./catalogs.js";
import { fieldPicker } from "./editing.js";
import { sopKey } from "./sopkit.js";
import { PASS_MARK, RETRAIN_WORKING_DAYS, SOP_TRAINING_DAYS, addWorkingDays, joinList, monthlyAchievement, calendarOf, nextTrainingId, topicKey } from "./trainkit.js";

const ALL = "__all";
const DAY = 86400000;
const isoToday = () => new Date().toISOString().slice(0, 10);
const isoOf = (ts) => (ts == null ? "" : new Date(ts).toISOString().slice(0, 10));
const short = (s, n = 60) => (String(s ?? "").length > n ? String(s).slice(0, n - 1) + "…" : String(s ?? ""));
const sopHref = (code) => `#/sops?code=${encodeURIComponent(code)}`;
const norm = (x) => String(x ?? "").toLowerCase().replace(/\s+/g, " ").trim();
const dot = (color, label) => h("span.pill", { style: { "--dot": color } }, h("i"), label);
export const TR_COLOR = { Completed: "var(--good)", Overdue: "var(--critical)", "Due this month": "var(--warning)", Planned: "var(--c1)", Cancelled: "var(--muted-mark)", "Not scheduled": "var(--c7)",
  "To schedule": "var(--c4)", Scheduled: "var(--c1)" };
const PLANNED_ST = ["Completed", "Overdue", "Due this month", "Planned", "Not scheduled", "Cancelled"];
const UNPLANNED_ST = ["Overdue", "To schedule", "Scheduled", "Completed", "Cancelled"];
export const STATE_COLOR = { Trained: "var(--good)", "Not trained": "var(--critical)", "Old revision": "var(--warning)", "Re-training": "var(--c7)", Expired: "var(--c4)" };
const STATES = ["Trained", "Old revision", "Expired", "Re-training", "Not trained"];
const CAT_COLOR = { "New SOP": "var(--c1)", "Revised SOP": "var(--c3)", "Quality circle": "var(--c7)", "Deviation / OOS / complaint": "var(--critical)", "External training": "var(--c4)",
  "Re-training": "var(--warning)", "Induction / new position": "var(--c5)", "GMP chapter": "var(--c2)", Other: "var(--muted-mark)" };
const TABS = [["overview", "trn_t_overview"], ["planned", "trn_t_planned"], ["unplanned", "trn_t_unplanned"], ["positions", "trn_t_positions"], ["people", "trn_t_people"]];
const posChips = (xs, max = 4) => h("span.trn-pos", xs.slice(0, max).map((p) => h("span.tag", p)), xs.length > max ? h("span.tag", `+${xs.length - max}`) : null);
const pct = (v) => h("span.trn-bar", { title: v == null ? "" : fmtPct(v) }, h("i", { style: { width: `${Math.round((v ?? 0) * 100)}%`, background: v == null ? "var(--muted-mark)" : v >= 1 ? "var(--good)" : v >= 0.75 ? "var(--warning)" : "var(--critical)" } }), h("b", v == null ? "—" : fmtPct(v)));
const yearOf = (ts) => (ts == null ? null : new Date(ts).getUTCFullYear());

export function trainingView(ctx) {
  const X = ctx.m.x.trainingX;
  const tab = TABS.some(([k]) => k === ctx.state.trnTab) ? ctx.state.trnTab : "overview";
  const year = +(ctx.state.trnYear ?? new Date(ctx.m.now).getUTCFullYear());
  const add = {
    planned: ctx.canEdit ? h("button.btn.primary", { type: "button", onclick: () => ctx.addWith("training", { "Planned month": `${year}-${String(new Date(ctx.m.now).getUTCMonth() + 1).padStart(2, "0")}`, Status: "Planned" }) }, icon("plus", 16), t("trn_add_planned")) : null,
    unplanned: ctx.canEdit ? h("button.btn.primary", { type: "button", onclick: () => newUnplanned(ctx, X, {}) }, icon("plus", 16), t("trn_add_unplanned")) : null,
    positions: ctx.canEdit ? h("button.btn", { type: "button", onclick: () => ctx.add("positions") }, icon("plus", 16), t("trn_add_position")) : null,
    people: ctx.canEdit ? h("button.btn.primary", { type: "button", onclick: () => ctx.add("staff") }, icon("plus", 16), t("trn_add_person")) : null,
  };
  const body = { overview, planned, unplanned, positions: matrixTab, people: peopleTab }[tab](ctx, X, year);
  return h("div.view",
    viewHeader(t("trn_title"), t("trn_sub2"), h("div.sop-tabs", segmented(TABS.map(([k, l]) => [k, t(l)]), tab, (v) => ctx.set("trnTab", v), t("trn_title"))), add[tab] ?? (ctx.canEdit ? add.unplanned : null)),
    body);
}

// ---------- overview: both kinds of training, the monthly report, the yearly deadlines, what needs doing ----------
function overview(ctx, X, year) {
  const now = ctx.m.now;
  const P = X.planned.filter((x) => yearOf(x.planned) === year);
  const U = X.unplanned.filter((x) => yearOf(x.date ?? x.due) === year || (x.date == null && x.due == null && !x.done));
  const due = P.filter((x) => x.planned != null && x.planned <= now && x.status !== "Cancelled");
  const exec = due.length ? due.filter((x) => x.done != null).length / due.length : null;
  const uDone = U.filter((x) => x.done), uTimed = uDone.filter((x) => x.onTime != null);
  const ppl = X.people.filter((p) => p.active && p.required);
  const comp = ppl.length ? ppl.reduce((a, p) => a + p.compliance, 0) / ppl.length : null;
  const monthly = monthlyAchievement(X, year);
  const cal = calendarOf(now);
  const todo = [
    ...X.sopNeeds.filter((n) => !n.covered).map((n) => ({ due: n.due, kind: n.category, ref: n.sop.Code, title: n.sop.Title, who: `${fmtNum(n.pending.length)} / ${fmtNum(n.people.length)}`, go: () => newUnplanned(ctx, X, fromNeed(X, n)) })),
    ...X.retraining.map((r) => ({ due: r.due, kind: "Re-training", ref: r.record.Reference ?? "", title: r.record.Title ?? "", who: r.record.emp, go: () => newUnplanned(ctx, X, fromRetraining(r)) })),
    ...X.unplanned.filter((x) => x.status === "Overdue").map((x) => ({ due: x.due, kind: x.Category, ref: x["Training ID"], title: x.title, who: x.positions.join(", "), go: () => openTraining(ctx, X, x) })),
    ...X.planned.filter((x) => x.status === "Overdue").map((x) => ({ due: x.plannedEnd, kind: "Planned", ref: x["Training ID"], title: x.title, who: x.positions.length ? x.positions.length + " " + t("trn_positions").toLowerCase() : "", go: () => openTraining(ctx, X, x) })),
  ].sort((a, b) => (a.due ?? 9e15) - (b.due ?? 9e15));
  const years = [...new Set([...X.planned.map((x) => yearOf(x.planned)), ...X.unplanned.map((x) => yearOf(x.date ?? x.due)), new Date(now).getUTCFullYear()].filter(Boolean))].sort();
  return [
    h("section.sop-hero.trn-hero",
      h("div.sop-hero-text",
        h("span.eyebrow", t("trn_eyebrow")),
        h("h2", t("trn_hero", fmtNum(P.length), fmtNum(U.length), String(year))),
        h("p", t("trn_hero_sub", fmtNum(X.people.filter((p) => p.active).length), fmtNum(X.positions.length), fmtNum(X.matrix.length))),
        h("div.hero-meta", years.map((y) => h("button.chip.chip-glass", { type: "button", class: y === year ? "on" : "", onclick: () => ctx.set("trnYear", y) }, String(y))))),
      h("div.apqr-rings",
        h("div.hero-ring", ring(exec, { size: 88, color: "#5fe0b0" }), h("span", t("trn_r_plan"))),
        h("div.hero-ring", ring(uTimed.length ? uTimed.filter((x) => x.onTime).length / uTimed.length : null, { size: 88, color: "#8fc1ff" }), h("span", t("trn_r_unplanned"))),
        h("div.hero-ring", ring(comp, { size: 88, color: "#ffd27a" }), h("span", t("trn_r_people"))))),
    !X.positions.length || !X.staff.length ? h("div.banner.info", icon("cap", 18), h("span", t("trn_setup"), " ", h("button.link", { type: "button", onclick: () => ctx.set("trnTab", "positions") }, t("trn_t_positions")), " · ",
      h("button.link", { type: "button", onclick: () => ctx.set("trnTab", "people") }, t("trn_t_people")))) : null,
    h("div.kpi-grid.six",
      kpi({ label: t("trn_k_planned"), value: fmtNum(P.filter((x) => x.status !== "Cancelled").length), hint: `${fmtNum(P.filter((x) => x.done != null).length)} ${t("done_lbl")}`, accent: "var(--c1)", onclick: () => ctx.set("trnTab", "planned") }),
      kpi({ label: t("trn_exec"), value: fmtPct(exec), status: exec == null ? 0 : exec >= 0.85 ? 3 : exec >= 0.75 ? 2 : 1, hint: `≥ 85 % · ${fmtNum(due.length)} ${t("due_lbl")}` }),
      kpi({ label: t("trn_k_unplanned"), value: fmtNum(U.length), hint: `${fmtNum(uDone.length)} ${t("done_lbl")}`, accent: "var(--c4)", onclick: () => ctx.set("trnTab", "unplanned") }),
      kpi({ label: t("trn_k_sop_needs"), value: fmtNum(X.sopNeeds.filter((n) => !n.covered).length), status: X.sopNeeds.some((n) => !n.covered && n.overdue) ? 1 : X.sopNeeds.some((n) => !n.covered) ? 2 : 3, hint: t("trn_k_sop_needs_h", SOP_TRAINING_DAYS) }),
      kpi({ label: t("trn_k_retrain"), value: fmtNum(X.retraining.length), status: X.retraining.some((r) => r.overdue) ? 1 : X.retraining.length ? 2 : 3, hint: t("trn_k_retrain_h", PASS_MARK, RETRAIN_WORKING_DAYS) }),
      kpi({ label: t("trn_k_people"), value: fmtPct(comp), hint: `${fmtNum(ppl.filter((p) => p.certificate).length)} / ${fmtNum(ppl.length)} ${t("trn_fully")}`, accent: "var(--c7)", onclick: () => ctx.set("trnTab", "people") })),
    h("div.grid.cols-3",
      card(t("trn_c_monthly", String(year)), columns(monthly, [{ key: "planned", label: t("trn_s_planned_due"), color: "var(--c1)" }, { key: "plannedDone", label: t("trn_s_planned_done"), color: "var(--good)" },
        { key: "unplannedDone", label: t("trn_s_unplanned_done"), color: "var(--c4)" }]), { span: 2, sub: t("trn_c_monthly_sub") }),
      card(t("trn_c_calendar"), h("ul.trn-cal", cal.map((c) => h("li", { class: c.days <= 30 ? "soon" : "" }, h("b", fmtDate(c.at).slice(0, 5)), h("span", t(`trn_cal_${c.key}`)), h("small", t("trn_in_days", fmtNum(c.days)))))), { sub: t("trn_c_calendar_sub") })),
    card(`${t("trn_c_todo")} · ${fmtNum(todo.length)}`, todo.length ? h("div.trn-todo", todo.slice(0, 14).map((x) => h("button.trn-todo-row", { type: "button", onclick: x.go },
      h("span.trn-todo-when", { class: x.due != null && x.due < now ? "late" : "" }, h("b", fmtDate(x.due) || "—"), h("small", x.due == null ? "" : x.due < now ? t("ck_late", fmtNum(Math.ceil((now - x.due) / DAY))) : t("ck_in", fmtNum(Math.ceil((x.due - now) / DAY))))),
      h("span.trn-todo-main", h("span", h("span.tag", { style: { "--tag": CAT_COLOR[x.kind] } }, tv(x.kind)), " ", h("b.mono", x.ref)), h("span.muted", short(x.title, 90))),
      h("span.trn-todo-who", x.who), icon("chevron", 15))), todo.length > 14 ? h("p.muted.center", t("sop_more", fmtNum(todo.length - 14))) : null)
      : h("p.ok-line", icon("check", 14), t("trn_todo_none")), { sub: t("trn_c_todo_sub") }),
    card(t("trn_c_month_table"), dataTable([
      { key: "month", label: t("month_lbl"), cls: "nowrap" }, { key: "planned", label: t("trn_s_planned_due"), cls: "num" }, { key: "plannedDone", label: t("trn_s_planned_done"), cls: "num" },
      { key: "rate", label: "%", cls: "num", sort: (r) => (r.planned ? r.plannedDone / r.planned : -1), render: (r) => (r.planned ? fmtPct(Math.min(1, r.plannedDone / r.planned)) : "—") },
      { key: "unplannedDone", label: t("trn_s_unplanned_done"), cls: "num" }, { key: "unplannedDue", label: t("trn_s_unplanned_due"), cls: "num" },
    ], monthly, { search: false, pageSize: 12, exportName: `training-monthly-${year}` }), { sub: t("trn_c_month_table_sub") }),
  ];
}

// ---------- planned: the annual department plans ----------
function planned(ctx, X, year0) {
  const { m } = ctx;
  const T = X.planned;
  const f = ctx.state.trn ?? {};
  const setF = (k, v) => ctx.set("trn", { ...f, [k]: v });
  const years = [...new Set(T.map((x) => yearOf(x.planned)).filter(Boolean))].sort();
  const year = years.includes(year0) ? year0 : years.at(-1) ?? year0;
  const inYear = T.filter((x) => yearOf(x.planned) === year || (x.planned == null && year === new Date(m.now).getUTCFullYear()));
  const positions = [...new Set(inYear.flatMap((x) => x.positions))];
  const L = inYear.filter((x) => (!f.dept || f.dept === ALL || x.Department === f.dept) && (!f.type || f.type === ALL || x.Type === f.type) && (!f.status || f.status === ALL || x.status === f.status)
    && (!f.pos || f.pos === ALL || x.positions.includes(f.pos)));
  const due = L.filter((x) => x.planned != null && x.planned <= m.now && x.status !== "Cancelled");
  const done = L.filter((x) => x.done != null);
  const exec = due.length ? due.filter((x) => x.done != null).length / due.length : null;
  const timed = done.filter((x) => x.onTime != null);
  const att = L.filter((x) => x.attendance != null);
  const attRate = att.length ? att.reduce((a, x) => a + (+x["Trained attendees"] || 0), 0) / att.reduce((a, x) => a + (+x["Planned attendees"] || 0), 0) : null;
  const openList = (title, xs) => () => ctx.open.table(title, "training", xs);
  let cp = 0, cd = 0;
  const monthly = Array.from({ length: 12 }, (_, i) => {
    const k = `${year}-${String(i + 1).padStart(2, "0")}`;
    const pl = L.filter((x) => x.planned != null && M.monthKey(x.planned) === k && x.status !== "Cancelled").length;
    const co = L.filter((x) => x.done != null && M.monthKey(x.done) === k).length;
    cp += pl; cd += co;
    return { x: k, month: k, planned: pl, completed: co, cumPlanned: cp, cumDone: Date.UTC(year, i, 1) <= m.now ? cd : null };
  });
  const types = [...new Set(T.map((x) => x.Type).filter(Boolean))];
  const depts = [...new Set(T.map((x) => x.Department).filter(Boolean))];
  const series = PLANNED_ST.map((s) => ({ key: s, label: tv(s), color: TR_COLOR[s] }));
  const cols = [
    { key: "Training ID", label: t("col_id"), cls: "mono nowrap" }, { key: "Program", label: t("trn_program"), cls: "wrap" },
    { key: "Reference", label: t("reference_lbl"), cls: "mono nowrap", render: (x) => (x.Reference && sopKey(x.Reference) ? h("a", { href: sopHref(x.Reference), onclick: (e) => e.stopPropagation() }, x.Reference) : x.Reference ?? "") },
    { key: "Type", label: t("col_type") }, { key: "positions", label: t("trn_positions"), sort: (x) => x.positions.length, render: (x) => posChips(x.positions, 2) },
    { key: "planned", label: t("planned_lbl"), cls: "num nowrap", render: (x) => (x.planned != null ? fmtDate(x.planned).slice(3) : "—") },
    { key: "Rescheduled to", label: t("rescheduled_lbl"), cls: "num nowrap" }, { key: "done", label: t("completed_on"), cls: "num nowrap", render: (x) => fmtDate(x.done) },
    { key: "attendance", label: t("attendance_lbl"), cls: "num", render: (x) => (x.attendance == null ? "" : fmtPct(x.attendance)) },
    { key: "status", label: t("col_status"), render: (x) => dot(TR_COLOR[x.status] ?? "var(--muted-mark)", tv(x.status)) },
  ];
  return [
    T.length ? null : h("div.banner.info", icon("upload", 18), h("span", t("trn_empty"), " ", ctx.canEdit ? h("button.link", { type: "button", onclick: () => ctx.openImport() }, t("update_data")) : null)),
    card(null, h("div.filters",
      select(t("year_lbl"), (years.length ? years : [year]).map((y) => [y, String(y)]), year, (v) => ctx.set("trnYear", +v)),
      select(t("col_dept"), [[ALL, t("filter_all")], ...depts.map((d) => [d, tv(d)])], f.dept ?? ALL, (v) => setF("dept", v)),
      select(t("trn_position"), [[ALL, t("filter_all")], ...positions.map((p) => [p, p])], f.pos ?? ALL, (v) => setF("pos", v)),
      select(t("col_type"), [[ALL, t("filter_all")], ...types.map((d) => [d, tv(d)])], f.type ?? ALL, (v) => setF("type", v)),
      select(t("col_status"), [[ALL, t("filter_all")], ...PLANNED_ST.map((s) => [s, tv(s)])], f.status ?? ALL, (v) => setF("status", v))), { cls: "filter-card" }),
    h("div.kpi-grid",
      kpi({ label: t("trn_planned"), value: fmtNum(L.filter((x) => x.status !== "Cancelled").length), accent: "var(--c1)", onclick: openList(t("trn_planned"), L) }),
      kpi({ label: t("k_completed"), value: fmtNum(done.length), accent: "var(--good)", onclick: openList(t("k_completed"), done) }),
      kpi({ label: t("k_overdue"), value: fmtNum(L.filter((x) => x.status === "Overdue").length), accent: "var(--critical)", onclick: openList(t("k_overdue"), L.filter((x) => x.status === "Overdue")) }),
      kpi({ label: t("due_this_month"), value: fmtNum(L.filter((x) => x.status === "Due this month").length), accent: "var(--warning)", onclick: openList(t("due_this_month"), L.filter((x) => x.status === "Due this month")) }),
      kpi({ label: t("trn_exec"), value: fmtPct(exec), status: exec == null ? 0 : exec >= 0.85 ? 3 : exec >= 0.75 ? 2 : 1, hint: `≥ 85 % · ${fmtNum(due.length)} ${t("due_lbl")}` }),
      kpi({ label: t("cal_ontime"), value: timed.length ? fmtPct(timed.filter((x) => x.onTime).length / timed.length) : "—" }),
      kpi({ label: t("rescheduled_lbl"), value: fmtNum(L.filter((x) => x.rescheduled).length), hint: t("trn_resched_h"), onclick: openList(t("rescheduled_lbl"), L.filter((x) => x.rescheduled)) }),
      kpi({ label: t("attendance_lbl"), value: fmtPct(attRate), hint: att.length ? `${fmtNum(att.length)} ${t("sessions_lbl")}` : t("trn_att_hint") })),
    h("div.grid.cols-2",
      card(t("trn_monthly"), columns(monthly, [{ key: "planned", label: t("planned_lbl"), color: "var(--c1)" }, { key: "completed", label: t("k_completed"), color: "var(--good)" }]), { span: 2 }),
      card(t("trn_cumulative"), lineChart(monthly, [{ key: "cumPlanned", label: t("planned_lbl"), color: "var(--c1)", area: true }, { key: "cumDone", label: t("k_completed"), color: "var(--good)" }])),
      card(t("trn_status_type"), stacks(types.map((ty) => ({ label: tv(ty), parts: Object.fromEntries(PLANNED_ST.map((s) => [s, L.filter((x) => x.Type === ty && x.status === s).length])), onclick: () => setF("type", ty) })), series)),
      positions.length ? card(t("trn_by_position"), stacks(positions.map((p) => ({ label: p, parts: Object.fromEntries(PLANNED_ST.map((s) => [s, inYear.filter((x) => x.positions.includes(p) && x.status === s).length])), onclick: () => setF("pos", p) })), series), { span: 2 }) : null,
      card(t("trn_plan"), gantt(L.filter((x) => x.planned != null).map((x) => ({ label: x.Program, sub: [x["Training ID"], x.Reference].filter(Boolean).join(" · "), start: x.planned, end: x.plannedEnd, mark: x.done, color: TR_COLOR[x.status],
        tip: `<b>${esc(x.Program)}</b><div class="tip-row"><span>${esc(t("col_status"))}</span><b>${esc(tv(x.status))}</b></div>`, onclick: () => openTraining(ctx, X, x) })), { from: Date.UTC(year, 0, 1), months: 12, today: m.now }), { span: 2, sub: t("trn_gantt_sub") })),
    card(`${t("trn_t_planned")} · ${fmtNum(L.length)}`, dataTable(cols, L, { pageSize: 25, onRow: (x) => openTraining(ctx, X, x), exportName: `training-plan-${year}` }), { sub: t("trn_planned_sub") }),
  ];
}

// ---------- unplanned: everything outside the annual plan ----------
function unplanned(ctx, X, year) {
  const now = ctx.m.now;
  const f = ctx.state.trnU ?? {};
  const setF = (k, v) => ctx.set("trnU", { ...f, [k]: v });
  const U = X.unplanned.filter((x) => f.year === "all" || yearOf(x.date ?? x.due) === year || (x.date == null && x.due == null) || (!x.done && x.status !== "Cancelled"));
  const qx = String(f.q ?? "").trim().toLowerCase();
  const F = U.filter((x) => (!f.cat || f.cat === ALL || x.Category === f.cat) && (!f.status || f.status === ALL || x.status === f.status)
    && (!qx || `${x["Training ID"]} ${x.title} ${x.Reference ?? ""} ${x.Trigger ?? ""} ${x.positions.join(" ")} ${x.trainees.join(" ")}`.toLowerCase().includes(qx)));
  const cats = V.unplannedCategories.filter((c) => U.some((x) => x.Category === c));
  const done = U.filter((x) => x.done), timed = done.filter((x) => x.onTime != null);
  const needs = X.sopNeeds.filter((n) => !n.covered);
  const monthly = monthlyAchievement(X, year);
  return [
    h("div.kpi-grid.six",
      kpi({ label: t("trn_k_unplanned"), value: fmtNum(U.length), accent: "var(--c4)", onclick: () => setF("status", ALL) }),
      kpi({ label: t("k_completed"), value: fmtNum(done.length), accent: "var(--good)", onclick: () => setF("status", "Completed") }),
      kpi({ label: t("k_overdue"), value: fmtNum(U.filter((x) => x.status === "Overdue").length), status: U.some((x) => x.status === "Overdue") ? 1 : 3, onclick: () => setF("status", "Overdue") }),
      kpi({ label: t("trn_to_schedule"), value: fmtNum(U.filter((x) => x.status === "To schedule").length), accent: "var(--c4)", onclick: () => setF("status", "To schedule") }),
      kpi({ label: t("cal_ontime"), value: timed.length ? fmtPct(timed.filter((x) => x.onTime).length / timed.length) : "—", hint: t("trn_ontime_h", SOP_TRAINING_DAYS) }),
      kpi({ label: t("trn_k_sop_needs"), value: fmtNum(needs.length), status: needs.some((n) => n.overdue) ? 1 : needs.length ? 2 : 3, hint: t("trn_k_sop_needs_h", SOP_TRAINING_DAYS) })),
    needs.length || X.retraining.length ? card(t("trn_c_needs"), h("div.trn-needs",
      needs.slice(0, 12).map((n) => h("div.trn-need",
        h("span.trn-need-main", h("span", h("span.tag", { style: { "--tag": CAT_COLOR[n.category] } }, tv(n.category)), " ", h("a.mono", { href: sopHref(n.sop.Code) }, h("b", n.sop.Code)), ` rev ${n.sop.Revision ?? "—"}`),
          h("span", short(n.sop.Title, 90)),
          h("small.muted", t("trn_need_line", fmtDate(n.sop.eff) || "—", fmtDate(n.due), fmtNum(n.pending.length), fmtNum(n.people.length)), n.fromMatrix ? "" : ` · ${t("trn_need_dept")}`),
          posChips(n.positions, 3)),
        h("span", { class: n.overdue ? "warn-mini" : "" }, n.overdue ? t("ck_late", fmtNum(Math.ceil((now - n.due) / DAY))) : t("ck_in", fmtNum(Math.ceil((n.due - now) / DAY)))),
        ctx.canEdit ? h("button.btn.compact", { type: "button", onclick: () => newUnplanned(ctx, X, fromNeed(X, n)) }, icon("plus", 14), t("trn_create")) : null)),
      X.retraining.slice(0, 12).map((r) => h("div.trn-need",
        h("span.trn-need-main", h("span", h("span.tag", { style: { "--tag": CAT_COLOR["Re-training"] } }, tv("Re-training")), " ", h("b", r.record.emp)),
          h("span", short(r.record.Reference && !String(r.record.Title ?? "").includes(r.record.Reference) ? `${r.record.Reference} ${r.record.Title ?? ""}` : r.record.Title ?? "", 90)), h("small.muted", t("trn_retrain_line", fmtDate(r.record.date), r.record.score ?? "—", fmtDate(r.due)))),
        h("span", { class: r.overdue ? "warn-mini" : "" }, r.overdue ? t("ck_late", fmtNum(Math.ceil((now - r.due) / DAY))) : t("ck_in", fmtNum(Math.ceil((r.due - now) / DAY)))),
        ctx.canEdit ? h("button.btn.compact", { type: "button", onclick: () => newUnplanned(ctx, X, fromRetraining(r)) }, icon("plus", 14), t("trn_create")) : null))), { sub: t("trn_c_needs_sub", SOP_TRAINING_DAYS, PASS_MARK, RETRAIN_WORKING_DAYS) }) : null,
    h("div.grid.cols-3",
      card(t("trn_c_categories"), U.length ? hbars(V.unplannedCategories.map((c) => ({ label: tv(c), value: U.filter((x) => x.Category === c).length, color: CAT_COLOR[c], onclick: () => setF("cat", c) })).filter((x) => x.value)) : h("p.muted", t("none_found"))),
      card(t("trn_c_unplanned_month", String(year)), vbars(monthly.map((x) => ({ label: x.month, short: x.month.slice(5), value: x.unplannedDone, color: "var(--c4)" })), { height: 130 }), { span: 2, sub: t("trn_c_unplanned_month_sub") })),
    card(null, h("div.filters",
      h("label.field.grow", h("span", t("sop_find")), h("input", { type: "search", value: f.q ?? "", placeholder: t("trn_find_ph"), onchange: (e) => setF("q", e.target.value) })),
      select(t("trn_category"), [[ALL, t("filter_all")], ...V.unplannedCategories.map((c) => [c, tv(c)])], f.cat ?? ALL, (v) => setF("cat", v)),
      select(t("col_status"), [[ALL, t("filter_all")], ...UNPLANNED_ST.map((s) => [s, tv(s)])], f.status ?? ALL, (v) => setF("status", v)),
      h("div.field", h("span", t("year_lbl")), segmented([[String(year), String(year)], ["all", t("filter_all")]], f.year === "all" ? "all" : String(year), (v) => setF("year", v), t("year_lbl")))), { cls: "filter-card" }),
    card(`${t("trn_t_unplanned")} · ${fmtNum(F.length)}`, X.unplanned.length ? dataTable([
      { key: "Training ID", label: t("col_id"), cls: "mono nowrap" },
      { key: "Category", label: t("trn_category"), render: (x) => h("span.tag", { style: { "--tag": CAT_COLOR[x.Category] } }, tv(x.Category ?? "")) },
      { key: "title", label: t("col_title"), cls: "wrap", render: (x) => h("div.trn-cell", h("b", short(x.title, 70)), x.Reference ? h("small.mono", `${x.Reference}${x.Revision ? ` · rev ${x.Revision}` : ""}`) : null) },
      { key: "positions", label: t("trn_positions"), sort: (x) => x.positions.length, render: (x) => posChips(x.positions, 2) },
      { key: "due", label: t("col_due"), cls: "nowrap", sort: (x) => x.due ?? 9e15, render: (x) => h("span", { title: x.dueAuto ? t("trn_due_auto", SOP_TRAINING_DAYS) : "" }, fmtDate(x.due), x.dueAuto ? " *" : "") },
      { key: "date", label: t("trn_date"), cls: "nowrap", sort: (x) => x.date ?? 0, render: (x) => fmtDate(x.date) },
      { key: "status", label: t("col_status"), render: (x) => dot(TR_COLOR[x.status] ?? "var(--muted-mark)", tv(x.status)) },
    ], F, { pageSize: 25, onRow: (x) => openTraining(ctx, X, x), exportName: "training-unplanned" }) : h("div.empty", t("trn_unplanned_none")), { sub: t("trn_unplanned_sub") }),
  ];
}

// ---------- by position: the training matrix ----------
function matrixTab(ctx, X) {
  const f = ctx.state.trnM ?? {};
  const setF = (k, v) => ctx.set("trnM", { ...f, [k]: v });
  const depts = [...new Set([...X.positions.map((p) => p.Department), ...X.matrix.map((m) => m.Department)].filter(Boolean))];
  const dept = f.dept && (f.dept === ALL || depts.includes(f.dept)) ? f.dept : depts[0] ?? ALL;
  const P = X.byPosition.filter((p) => dept === ALL || p.Department === dept).sort((a, b) => (a.level ?? 9) - (b.level ?? 9) || a.name.localeCompare(b.name));
  const qx = String(f.q ?? "").trim().toLowerCase();
  const rows = X.matrix.filter((m) => (dept === ALL || !m.Department || m.Department === dept) && (!qx || `${m.Topic ?? ""} ${m.Reference ?? ""}`.toLowerCase().includes(qx)))
    .sort((a, b) => String(a.Kind ?? "").localeCompare(String(b.Kind ?? "")) || String(a.Reference ?? a.Topic).localeCompare(String(b.Reference ?? b.Topic), undefined, { numeric: true }));
  // each cell: required? and how many of the position's people are trained on it
  const cell = (m, p) => {
    const on = m.positions.some((x) => norm(x) === norm(p.name));
    const ppl = X.people.filter((x) => x.active && norm(x.position) === norm(p.name));
    const tr = ppl.filter((x) => x.items.some((i) => i.topic === m && i.state === "Trained")).length;
    const color = !on ? null : !ppl.length ? "var(--muted-mark)" : tr === ppl.length ? "var(--good)" : tr ? "var(--warning)" : "var(--critical)";
    return h(ctx.canEdit ? "button.mx-cell" : "span.mx-cell", { type: ctx.canEdit ? "button" : null, class: on ? "on" : "", style: color ? { "--c": color } : null,
      title: on ? `${p.name}: ${fmtNum(tr)} / ${fmtNum(ppl.length)} ${t("trn_trained").toLowerCase()}` : ctx.canEdit ? t("trn_mx_add", p.name) : "",
      onclick: ctx.canEdit ? () => ctx.saveObj("trainingMatrix", m.__key, { Positions: joinList(on ? m.positions.filter((x) => norm(x) !== norm(p.name)) : [...m.positions, p.name]) }, true) : null },
    on ? "X" : "");
  };
  const planRefs = X.planned.filter((x) => (dept === ALL || x.Department === dept) && x.positions.length && !X.matrix.some((m) => m.key === x.key));
  const fromPlan = [...new Map(planRefs.map((x) => [x.key, x])).values()];
  return [
    h("div.trn-positions", P.length ? P.map((p) => h("button.trn-posc", { type: "button", onclick: () => (ctx.canEdit ? ctx.edit("positions", p.__key, p.name) : null) },
      h("span.trn-posc-top", h("b", p.name), p.Code ? h("span.tag.mono", p.Code) : null),
      h("small", [p.Section, p.level ? t("trn_level", p.level) : null, p.readUnderstood ? t("trn_ru") : null].filter(Boolean).join(" · ")),
      h("span.trn-posc-people", p.people.length ? p.people.map((x) => x.name).join(", ") : h("span.muted", t("trn_nobody"))),
      h("span.trn-posc-foot", h("span", `${fmtNum(p.required.length)} ${t("trn_topics")}`), pct(p.compliance))))
      : h("div.empty", t("trn_no_positions"))),
    card(null, h("div.filters",
      select(t("col_dept"), [[ALL, t("filter_all")], ...depts.map((d) => [d, tv(d)])], dept, (v) => setF("dept", v)),
      h("label.field.grow", h("span", t("sop_find")), h("input", { type: "search", value: f.q ?? "", placeholder: t("trn_mx_find"), onchange: (e) => setF("q", e.target.value) })),
      ctx.canEdit ? h("div.field", h("span", " "), h("button.btn", { type: "button", onclick: () => ctx.addWith("trainingMatrix", { Department: dept === ALL ? null : dept }) }, icon("plus", 15), t("trn_mx_add_topic"))) : null,
      ctx.canEdit && fromPlan.length ? h("div.field", h("span", " "), h("button.btn.ghost", { type: "button", onclick: async () => {
        await ctx.bulkUpsert("trainingMatrix", fromPlan.map((x) => ({ Topic: x.Program, Reference: x.Reference, Kind: x.Type, Department: x.Department, Positions: joinList(x.positions) })), ["Topic"], null, "plan");
        ctx.rerender();
      } }, icon("cycle", 15), t("trn_mx_from_plan", fmtNum(fromPlan.length)))) : null), { cls: "filter-card" }),
    card(`${t("trn_matrix")} · ${fmtNum(rows.length)}`, rows.length && P.length ? h("div.mx-wrap", h("table.mx",
      h("thead", h("tr", h("th.mx-topic", t("trn_topic")), P.map((p) => h("th.mx-pos", { title: p.name }, h("span", p.Code || p.name))), h("th", ""))),
      h("tbody", rows.map((m) => h("tr",
        h("td.mx-topic", h("div.mx-tc", h("div", m.Reference ? (m.sop ? h("a.mono", { href: sopHref(m.sop.Code) }, m.Reference) : h("span.mono", m.Reference)) : null, m.Kind ? h("span.tag", tv(m.Kind)) : null),
          h("span", short(m.Topic ?? m.sop?.Title ?? "", 80)), m.refresh ? h("small.muted", t("trn_refresh", m.refresh)) : null)),
        P.map((p) => h("td.mx-c", cell(m, p))),
        h("td", ctx.canEdit ? h("button.icon-btn.mini", { type: "button", title: t("edit"), "aria-label": t("edit"), onclick: () => ctx.edit("trainingMatrix", m.__key, m.Topic ?? m.Reference) }, icon("edit", 13)) : null))))))
      : h("div.empty", P.length ? t("trn_mx_empty") : t("trn_no_positions")), { sub: t("trn_matrix_sub") }),
  ];
}

// ---------- people: each employee and their training card ----------
function peopleTab(ctx, X) {
  const f = ctx.state.trnP ?? {};
  const setF = (k, v) => ctx.set("trnP", { ...f, [k]: v });
  const qx = String(f.q ?? "").trim().toLowerCase();
  const L = X.people.filter((p) => (f.status === "all" || p.active) && (!f.pos || f.pos === ALL || p.position === f.pos) && (!qx || `${p.name} ${p.position ?? ""} ${p.Section ?? ""}`.toLowerCase().includes(qx)));
  const act = X.people.filter((p) => p.active && p.required);
  const items = act.flatMap((p) => p.items);
  const positions = [...new Set(X.people.map((p) => p.position).filter(Boolean))];
  return [
    h("div.kpi-grid.six",
      kpi({ label: t("trn_k_staff"), value: fmtNum(X.people.filter((p) => p.active).length), accent: "var(--c1)" }),
      kpi({ label: t("trn_k_people"), value: fmtPct(act.length ? act.reduce((a, p) => a + p.compliance, 0) / act.length : null), accent: "var(--c7)" }),
      kpi({ label: t("trn_k_certified"), value: fmtNum(act.filter((p) => p.certificate).length), hint: t("trn_k_certified_h"), accent: "var(--good)" }),
      ...["Not trained", "Old revision", "Re-training"].map((s) => kpi({ label: tv(s), value: fmtNum(items.filter((i) => i.state === s).length), accent: STATE_COLOR[s], hint: t("trn_k_items") }))),
    card(null, h("div.filters",
      h("label.field.grow", h("span", t("sop_find")), h("input", { type: "search", value: f.q ?? "", placeholder: t("trn_people_ph"), onchange: (e) => setF("q", e.target.value) })),
      select(t("trn_position"), [[ALL, t("filter_all")], ...positions.map((p) => [p, p])], f.pos ?? ALL, (v) => setF("pos", v)),
      h("div.field", h("span", t("col_status")), segmented([["active", t("trn_active")], ["all", t("filter_all")]], f.status === "all" ? "all" : "active", (v) => setF("status", v), t("col_status")))), { cls: "filter-card" }),
    card(`${t("trn_t_people")} · ${fmtNum(L.length)}`, X.people.length ? dataTable([
      { key: "name", label: t("trn_name"), cls: "nowrap", render: (p) => h("b", p.name) },
      { key: "position", label: t("trn_position"), cls: "wrap" },
      { key: "Section", label: t("trn_section") },
      { key: "Status", label: t("col_status"), render: (p) => tv(p.Status ?? "Active") },
      { key: "compliance", label: t("trn_compliance"), sort: (p) => p.compliance ?? -1, render: (p) => (p.required ? pct(p.compliance) : h("span.muted", t("trn_no_matrix"))) },
      { key: "gaps", label: t("trn_gaps"), cls: "num", sort: (p) => p.required - p.trained, render: (p) => (p.required ? fmtNum(p.required - p.trained) : "") },
      { key: "last", label: t("trn_last"), cls: "nowrap", sort: (p) => p.card[0]?.date ?? 0, render: (p) => fmtDate(p.card[0]?.date) },
      { key: "cert", label: "", render: (p) => (p.certificate ? h("span.ok-mini", { title: t("trn_certificate") }, icon("badge", 14)) : "") },
    ], L, { pageSize: 30, onRow: (p) => openPerson(ctx, X, p), exportName: "training-people" }) : h("div.empty", t("trn_no_people")), { sub: t("trn_people_sub") }),
  ];
}

// ---------- drawers ----------
/** One employee: what their position requires and where they stand, and their training card. */
export function openPerson(ctx, X, p0) {
  ctx.open.drawer(() => {
    const p = ctx.m.x.trainingX.personBy.get(norm(p0.name)) ?? p0;
    return [
      h("div.d-head", h("span.d-ref", [p.position, p.Section, p.dept].filter(Boolean).join(" · ")), h("h2", p.name), p.certificate ? h("div.d-tags", h("span.tag", { style: { "--tag": "var(--good)" } }, icon("badge", 12), ` ${t("trn_certificate")}`)) : null),
      h("div.form-actions.rv-moves",
        ctx.canEdit && p.__key ? h("button.btn.compact", { type: "button", onclick: () => ctx.edit("staff", p.__key, p.name) }, icon("edit", 14), t("edit")) : null,
        ctx.canEdit ? h("button.btn.compact", { type: "button", onclick: () => ctx.addWith("trainingRecords", { Employee: p.name, Position: p.position, Department: p.dept, Date: isoToday(), Plan: "Unplanned" }) }, icon("plus", 14), t("trn_add_record")) : null),
      p.required ? h("div.trn-person-k", h("div", h("small", t("trn_compliance")), pct(p.compliance)), h("div", h("small", t("trn_required")), h("b", fmtNum(p.required))), h("div", h("small", t("trn_trained")), h("b", fmtNum(p.trained)))) : h("p.muted", t("trn_no_matrix_long")),
      p.items.length ? h("div.form-prev", h("h4", t("trn_requirements")), h("ul.trn-req", p.items.sort((a, b) => STATES.indexOf(b.state) - STATES.indexOf(a.state)).map((i) => h("li",
        dot(STATE_COLOR[i.state], tv(i.state)), h("span", i.topic.Reference ? h("b.mono", `${i.topic.Reference} `) : null, short(i.topic.Topic ?? i.topic.sop?.Title ?? "", 70)),
        h("small.muted", i.record ? `${fmtDate(i.record.date)}${i.record.Revision ? ` · rev ${i.record.Revision}` : ""}${i.state === "Old revision" && i.topic.sop ? ` → rev ${i.topic.sop.Revision}` : ""}` : "—"))))) : null,
      h("div.form-prev", h("h4", `${t("trn_card")} · ${fmtNum(p.card.length)}`), p.card.length ? dataTable([
        { key: "date", label: t("trn_date"), cls: "nowrap", render: (r) => fmtDate(r.date) },
        { key: "Title", label: t("col_title"), cls: "wrap", render: (r) => h("div.trn-cell", h("b", short(r.Title ?? "", 60)), r.Reference ? h("small.mono", `${r.Reference}${r.Revision ? ` · rev ${r.Revision}` : ""}`) : null) },
        { key: "Plan", label: t("trn_plan_type"), render: (r) => tv(r.Plan ?? "") },
        { key: "Trainer", label: t("trn_trainer") },
        { key: "result", label: t("trn_result"), render: (r) => dot(r.result === "Complying" ? "var(--good)" : r.result === "Re-training" ? "var(--critical)" : "var(--muted-mark)", `${tv(r.result)}${r.score != null ? ` · ${r.score}` : ""}`) },
      ], p.card, { search: false, pageSize: 12, onRow: ctx.canEdit ? (r) => ctx.edit("trainingRecords", r.__key, `${r.emp} · ${r.Title ?? ""}`) : null, exportName: `training-card` }) : h("p.muted", t("trn_card_empty"))),
    ];
  });
}

/** One training (planned or unplanned): what, for whom, its attendance and results. */
export function openTraining(ctx, X0, x0) {
  ctx.open.drawer(() => {
    const X = ctx.m.x.trainingX;
    const x = (x0.plan === "Planned" ? X.planned : X.unplanned).find((y) => y.__key === x0.__key) ?? x0;
    const id = x["Training ID"];
    const recs = X.records.filter((r) => id && r["Training ID"] === id);
    const ppl = X.people.filter((p) => p.active && x.positions.some((n) => norm(n) === norm(p.position)));
    const table = x.plan === "Planned" ? "training" : "trainingUnplanned";
    return [
      h("div.d-head", h("span.d-ref", `${tv(x.plan)} · ${id ?? ""}`), h("h2", x.title || "—"),
        h("div.d-tags", dot(TR_COLOR[x.status] ?? "var(--muted-mark)", tv(x.status)), x.Category ? h("span.tag", tv(x.Category)) : null, x.Type ? h("span.tag", tv(x.Type)) : null)),
      ctx.canEdit ? h("div.form-actions.rv-moves",
        x.status !== "Cancelled" ? h("button.btn.compact.primary", { type: "button", onclick: () => recordAttendance(ctx, X, x) }, icon("check", 14), t("trn_record")) : null,
        h("button.btn.compact", { type: "button", onclick: () => ctx.edit(table, x.__key, x.title) }, icon("edit", 14), t("edit"))) : null,
      h("dl.deflist", [[t("reference_lbl"), x.Reference ? (x.sop || sopKey(x.Reference) ? h("a", { href: sopHref(x.Reference), onclick: () => ctx.closeDrawer() }, `${x.Reference}${x.Revision ? ` · rev ${x.Revision}` : ""}`) : x.Reference) : null],
        [t("trn_trigger"), x.Trigger], [t("col_dept"), tv(x.Department ?? "")], [t("planned_lbl"), x.planned != null ? fmtDate(x.planned).slice(3) : null], [t("col_due"), fmtDate(x.due)],
        [t("trn_date"), fmtDate(x.date ?? x.done)], [t("trn_trainer"), x.Trainer], [t("trn_delivery"), tv(x.Delivery ?? "")], [t("trn_evaluation"), tv(x.Evaluation ?? "")], [t("trn_org"), x.Organisation],
        [t("rescheduled_lbl"), x["Rescheduled to"]], [t("rv_comment"), x.Comment ?? x.Comments]]
        .filter(([, v]) => v != null && v !== "").flatMap(([k, v]) => [h("dt", k), h("dd", v)])),
      x.positions.length ? h("div.form-prev", h("h4", `${t("trn_positions")} · ${fmtNum(x.positions.length)}`), h("div.sop-chips", x.positions.map((p) => h("span.tag", p))),
        ppl.length ? h("p.fine", t("trn_people_in", fmtNum(ppl.length), ppl.map((p) => p.name).join(", "))) : null) : null,
      x.trainees?.length ? h("div.form-prev", h("h4", t("trn_trainees")), h("div.sop-chips", x.trainees.map((p) => h("span.tag", p)))) : null,
      h("div.form-prev", h("h4", `${t("trn_attendance")} · ${fmtNum(recs.length)}`), recs.length ? h("ul.trn-req", recs.map((r) => h("li",
        dot(r.result === "Complying" ? "var(--good)" : r.result === "Re-training" ? "var(--critical)" : "var(--muted-mark)", tv(r.result)), h("span", h("b", r.emp), r.Position ? ` · ${r.Position}` : ""),
        h("small.muted", `${fmtDate(r.date)}${r.score != null ? ` · ${r.score}/100` : ""}`)))) : h("p.muted", t("trn_no_attendance"))),
    ];
  });
}

/** Record who attended a training, with their score: one training-card line each; the training is then completed. */
export function recordAttendance(ctx, X, x) {
  const ppl = X.people.filter((p) => p.active && (x.positions.some((n) => norm(n) === norm(p.position)) || x.trainees?.some((n) => norm(n) === norm(p.name))));
  const others = X.people.filter((p) => p.active && !ppl.includes(p));
  const opts = ctx.options;
  const date = h("input", { id: "ra-date", type: "date", value: isoOf(x.date && x.date <= ctx.m.now ? x.date : ctx.m.now) });
  const trainer = fieldPicker("person", opts, x.Trainer ?? "", "ra-trainer");
  const evalSel = h("select", { id: "ra-eval" }, V.evaluations.map((e) => h("option", { value: e, selected: e === (x.Evaluation || "Written exam") ? true : null }, tv(e))));
  // the revision trained: the training's, else the SOP's current one in the library
  const sopNow = x.sop ?? (x.Reference ? ctx.m.x.sopx.byKey.get(sopKey(x.Reference)) : null);
  const rev = h("input", { id: "ra-rev", value: x.Revision ?? sopNow?.Revision ?? "", inputmode: "numeric" });
  const lines = [];
  const list = h("div.ra-list");
  const addLine = (p, checked) => {
    const ck = h("input", { type: "checkbox", checked: checked ? true : null, "aria-label": p.name });
    const score = h("input.ra-score", { type: "number", min: "0", max: "100", step: "1", placeholder: "/100", "aria-label": `${t("trn_score")} · ${p.name}` });
    const res = h("span.ra-res");
    const upd = () => { const v = score.value === "" ? null : +score.value; res.textContent = noScore() ? tv("N/A") : v == null ? "" : v >= PASS_MARK ? tv("Complying") : tv("Re-training"); res.className = `ra-res ${v != null && v < PASS_MARK && !noScore() ? "bad" : ""}`; };
    score.addEventListener("input", upd);
    lines.push({ p, ck, score, upd });
    list.append(h("label.ra-line", ck, h("span", h("b", p.name), h("small", p.position ?? "")), score, res));
  };
  const noScore = () => /notification|read & understood/i.test(evalSel.value);
  evalSel.addEventListener("change", () => { for (const l of lines) { l.score.disabled = noScore(); l.upd(); } });
  for (const p of ppl) addLine(p, true);
  const more = others.length ? fieldPicker("people", { people: others.map((p) => [p.name, p.name, p.position ?? ""]) }, "", "ra-more") : null;
  const msg = h("p.form-msg", { role: "status" });
  const save = h("button.btn.primary", { type: "submit" }, t("trn_record_save"));
  const form = h("form.row-form.ed-form", {
    onsubmit: async (e) => {
      e.preventDefault();
      if (more) for (const n of more.values) { const p = others.find((o) => o.name === n); if (p && !lines.some((l) => l.p === p)) addLine(p, true); }
      const chosen = lines.filter((l) => l.ck.checked);
      if (!date.value) { msg.className = "form-msg warn-text"; msg.textContent = t("rv_need_date"); return; }
      if (!chosen.length) { msg.className = "form-msg warn-text"; msg.textContent = t("trn_need_trainee"); return; }
      save.disabled = true; msg.className = "form-msg"; msg.textContent = t("ws_saving");
      const yr = date.value.slice(0, 4);
      const ids = X.records.map((r) => r["Record ID"]);
      const rows = chosen.map((l) => {
        const id = nextTrainingId(ids, "TRC", yr); ids.push(id);
        const sc = noScore() || l.score.value === "" ? null : +l.score.value;
        return { "Record ID": id, "Training ID": x["Training ID"] ?? null, Plan: x.plan, Date: date.value, Employee: l.p.name, Position: l.p.position, Department: l.p.dept ?? x.Department ?? null,
          Title: x.title, Reference: x.Reference ?? null, Revision: rev.value.trim() || null, Trainer: trainer.value || null, Evaluation: evalSel.value, Score: sc,
          Result: noScore() ? "N/A" : sc == null ? null : sc >= PASS_MARK ? "Complying" : "Re-training" };
      });
      try {
        await ctx.bulkUpsert("trainingRecords", rows, ["Record ID"], null, "attendance");
        const failed = rows.filter((r) => r.Result === "Re-training").length;
        if (x.plan === "Planned") await ctx.saveObj("training", x.__key, { "Completion date": date.value, Status: "Completed", "Trained attendees": rows.length, "Planned attendees": x["Planned attendees"] ?? (ppl.length || rows.length), Trainer: trainer.value || x.Trainer || null,
          Effectiveness: noScore() ? "Not required" : failed ? "Not effective" : "Effective" }, true);
        else await ctx.saveObj("trainingUnplanned", x.__key, { Date: date.value, Status: "Completed", Trainer: trainer.value || x.Trainer || null, Evaluation: evalSel.value, Revision: rev.value.trim() || x.Revision || null,
          Trainees: joinList([...(x.trainees ?? []), ...rows.map((r) => r.Employee)]) }, true);
        ctx.toast(failed ? t("trn_saved_retrain", fmtNum(rows.length), fmtNum(failed), fmtDate(addWorkingDays(Date.parse(date.value), RETRAIN_WORKING_DAYS))) : t("trn_saved_n", fmtNum(rows.length)), failed ? "warn" : undefined);
        ctx.closeDrawer(); ctx.rerender();
      } catch (err) { msg.className = "form-msg warn-text"; msg.textContent = err.message ?? String(err); save.disabled = false; }
    },
  },
    h("div.form-grid", h("label.field", { for: "ra-date" }, h("span", t("trn_date")), date), h("label.field", { for: "ra-trainer" }, h("span", t("trn_trainer")), trainer),
      h("label.field", { for: "ra-eval" }, h("span", t("trn_evaluation")), evalSel), h("label.field", { for: "ra-rev" }, h("span", t("trn_revision")), rev)),
    h("div.ed-block", h("h3", t("trn_trainees")), h("p.fine", t("trn_record_note", PASS_MARK, RETRAIN_WORKING_DAYS)), ppl.length ? list : h("p.muted", t("trn_no_people_pos")),
      more ? h("label.field.wide", { for: "ra-more" }, h("span", t("trn_add_others")), more) : null),
    msg,
    h("div.form-actions", save, h("button.btn.ghost", { type: "button", onclick: () => ctx.closeDrawer() }, t("cancel"))));
  ctx.open.drawer(() => [
    h("div.d-head", h("span.d-ref", `${tv(x.plan)} · ${x["Training ID"] ?? ""}`), h("h2", t("trn_record_title")), h("p", x.title)),
    form,
  ], { form: true });
}

/** A new unplanned training (prefilled from a need: a new SOP revision, a re-training). */
export function newUnplanned(ctx, X, preset) {
  ctx.addWith("trainingUnplanned", { Status: "To schedule", Department: "Quality Assurance", Delivery: "Classroom", ...preset }, preset.Title ?? t("trn_add_unplanned"));
}
export function fromNeed(X, n) {
  return { Category: n.category, Title: n.sop.Title ?? n.sop.Code, Reference: n.sop.Code, Revision: n.sop.Revision ?? null, Positions: joinList(n.positions), Trainees: joinList(n.pending.map((p) => p.name)),
    Due: isoOf(n.due), Department: n.people[0]?.dept ?? null };
}
function fromRetraining(r) {
  return { Category: "Re-training", Title: r.record.Title ?? r.record.Reference ?? "", Reference: r.record.Reference ?? null, Revision: r.record.Revision ?? null, Trainees: r.record.emp,
    Positions: r.record.Position ?? null, Due: isoOf(r.due), Trigger: r.record["Record ID"] ?? null, Department: r.record.Department ?? null };
}

/** Trainings and people for one SOP (its page): the positions that must know it, who is trained on its current revision. */
export function sopTraining(X, s) {
  const key = s.key ?? sopKey(s.Code);
  const mx = X.matrix.find((m) => m.key === key) ?? null;
  const people = X.people.filter((p) => p.active && mx?.positions.some((n) => norm(n) === norm(p.position)));
  const trained = people.filter((p) => p.items.some((i) => i.topic === mx && i.state === "Trained"));
  return { matrix: mx, people, trained, need: X.sopNeeds.find((n) => n.sop.key === key) ?? null,
    planned: X.planned.filter((x) => x.key === key), unplanned: X.unplanned.filter((x) => x.key === key), records: X.records.filter((r) => r.key === key) };
}
export { topicKey };
