// QMS metrics scorecard, training plan and the GMP QA-activity register.
import { h, card, kpi, viewHeader, select, dataTable, fmtDate, fmtNum, fmtPct, esc } from "./ui.js";
import { hbars, stacks, columns, gantt, lineChart, vbars } from "./charts.js";
import { t, tv, getLang } from "./i18n.js";
import { icon } from "./icons.js";
import * as M from "./model.js";
import { METRICS, METRIC_GROUPS } from "./catalogs.js";
import { quarters, yearPeriod, metricValue, metricStatus } from "./domain.js";
import { activitySops, sopHref } from "./views-sop.js";

const DAY = 86400000;
const ALL = M.ALL;
const FR = () => getLang() === "FR";
const by = (list, f) => [...M.countBy(list, f)].sort((a, b) => b[1] - a[1]);
const RAG_COLOR = ["var(--muted-mark)", "var(--critical)", "var(--warning)", "var(--good)"];
const ragLabel = (s) => [t("no_data"), t("st_action"), t("st_watch"), t("st_on")][s];
const isoToday = () => new Date().toISOString().slice(0, 10);
const statusPill = (s, colors) => h("span.pill", { style: { "--dot": colors[s] ?? "var(--muted-mark)" } }, h("i"), tv(s));
const emptyState = (ctx, msgKey) => h("div.banner.info", icon("upload", 18), h("span", t(msgKey), " ", ctx.canEdit ? h("button.link", { type: "button", onclick: () => ctx.openImport() }, t("update_data")) : null));

// ---------- QMS METRICS ----------
const digits = (def) => (def.unit === "%" ? (def.target > 0 && def.target < 0.01 ? 2 : 1) : def.unit === "d" ? 1 : 0);
export const fmtMetric = (def, v) => (v == null || isNaN(v) ? "—" : def.unit === "%" ? fmtPct(v, digits(def)) : def.unit === "d" ? `${fmtNum(v, 1)} ${t("d")}` : fmtNum(v, Number.isInteger(v) ? 0 : 1));
const dirLabel = (def) => (def.dir === "zero" ? "= 0" : def.dir === "max" ? `≥ ${fmtMetric(def, def.target)}` : `≤ ${fmtMetric(def, def.target)}`);

export function metricsView(ctx) {
  const { m } = ctx;
  const nowY = new Date(m.now).getUTCFullYear();
  const year = +(ctx.state.metYear ?? nowY);
  const group = ctx.state.metGroup ?? ALL;
  const Q = quarters(year);
  const Y = yearPeriod(year);
  const current = Q.filter((q) => q.start <= m.now);
  const focus = current.at(-1) ?? Q[0];
  const defs = METRICS.filter((d) => group === ALL || d.group === group);
  const rows = defs.map((def) => {
    const qs = Q.map((p) => (p.start > m.now ? { value: null, future: true } : metricValue(m, def.id, p)));
    const yr = metricValue(m, def.id, { ...Y, end: Math.min(Y.end, M.addMonths(M.monthStart(m.now), 1)) });
    return { def, qs, yr, status: qs.map((v) => metricStatus(def, v.value)), yStatus: metricStatus(def, yr.value) };
  });
  const fi = Q.indexOf(focus);
  const counts = [3, 2, 1, 0].map((s) => rows.filter((r) => r.status[fi] === s).length);
  const scored = counts[0] + counts[1] + counts[2];
  const manualEntries = m.x.metricValues.filter((v) => String(v.Period).startsWith(String(year)));
  const enter = (def, p, v) => {
    if (!ctx.canEdit) return null;
    return () => (v?.entry ? ctx.edit("metrics", v.entry.__key, `${def.name} · ${p.label}`) : ctx.addWith("metrics", { Metric: def.id, Period: p.label }));
  };
  const cell = (def, v, s, p) => {
    const fn = p && !v.future ? enter(def, p, v) : null;
    return h(fn ? "button.mcell" : "span.mcell", { type: fn ? "button" : null, onclick: fn, style: { "--dot": RAG_COLOR[s] }, title: v.num != null && v.den != null ? `${fmtNum(v.num)} / ${fmtNum(v.den)}` : v.comment || null, class: v.future ? "future" : "" },
      v.future ? "·" : [h("i"), fmtMetric(def, v.value), v.src === "manual" && v.entry ? h("sup", "M") : null]);
  };
  const statusByQ = Q.map((p, i) => ({ x: p.label, on: rows.filter((r) => r.status[i] === 3).length, watch: rows.filter((r) => r.status[i] === 2).length, action: rows.filter((r) => r.status[i] === 1).length, nd: rows.filter((r) => r.status[i] === 0 && !r.qs[i].future).length }));
  const pick = ctx.state.metPick && METRICS.some((d) => d.id === ctx.state.metPick) ? ctx.state.metPick : "dev_total";
  const pdef = METRICS.find((d) => d.id === pick);
  const months = M.lastMonths(m.now, 18);
  const monthly = months.map((mo) => ({ month: mo, v: metricValue(m, pick, { label: M.monthKey(mo), start: mo, end: M.addMonths(mo, 1) }).value }));
  return h("div.view",
    viewHeader(t("met_title"), t("met_sub"),
      select(t("year_lbl"), [nowY - 2, nowY - 1, nowY].map((y) => [y, String(y)]), year, (v) => ctx.set("metYear", v)),
      select(t("met_group"), [[ALL, t("filter_all")], ...METRIC_GROUPS.map((g) => [g, g])], group, (v) => ctx.set("metGroup", v))),
    h("div.kpi-grid",
      kpi({ label: `${t("st_on")} · ${focus.label}`, value: fmtNum(counts[0]), accent: "var(--good)", hint: scored ? fmtPct(counts[0] / scored) : "" }),
      kpi({ label: `${t("st_watch")} · ${focus.label}`, value: fmtNum(counts[1]), accent: "var(--warning)" }),
      kpi({ label: `${t("st_action")} · ${focus.label}`, value: fmtNum(counts[2]), accent: "var(--critical)" }),
      kpi({ label: t("met_nodata"), value: fmtNum(counts[3]), hint: t("met_nodata_hint") }),
      kpi({ label: t("met_auto"), value: fmtNum(defs.filter((d) => d.src === "auto").length), hint: `${fmtNum(defs.length)} ${t("met_total")}` }),
      kpi({ label: t("met_manual_entries"), value: fmtNum(manualEntries.length), hint: String(year) })),
    h("div.grid.cols-2",
      card(t("met_scorecard"), h("div.table-scroll", h("table.data.scorecard",
        h("thead", h("tr", h("th", t("met_metric")), h("th", t("target_lbl")), Q.map((p) => h("th.num", p.label.slice(5))), h("th.num", String(year)), h("th", t("source")))),
        h("tbody", METRIC_GROUPS.filter((g) => rows.some((r) => r.def.group === g)).flatMap((g) => [
          h("tr.group-row", h("th", { colspan: 8 }, g)),
          ...rows.filter((r) => r.def.group === g).map((r) => h("tr",
            h("td", h("span.metric-name", { title: r.def.def }, r.def.name)),
            h("td.nowrap.muted", dirLabel(r.def)),
            r.qs.map((v, i) => h("td.num", cell(r.def, v, r.status[i], Q[i]))),
            h("td.num", cell(r.def, r.yr, r.yStatus, null)),
            h("td", h(`span.src.${r.def.src}`, r.def.src === "auto" ? t("met_src_auto") : t("met_src_manual")))))])))),
      { span: 2, sub: ctx.canEdit ? t("met_scorecard_sub") : t("met_scorecard_ro") }),
      card(t("met_status_q"), columns(statusByQ, [{ key: "on", label: t("st_on"), color: "var(--good)" }, { key: "watch", label: t("st_watch"), color: "var(--warning)" }, { key: "action", label: t("st_action"), color: "var(--critical)" }, { key: "nd", label: t("no_data"), color: "var(--muted-mark)" }], { stacked: true, xFmt: (x) => x.replace("-", " "), height: 420 })),
      card(`${t("met_group_status")} · ${focus.label}`, stacks(METRIC_GROUPS.filter((g) => rows.some((r) => r.def.group === g)).map((g) => {
        const rs = rows.filter((r) => r.def.group === g);
        return { label: g, parts: { on: rs.filter((r) => r.status[fi] === 3).length, watch: rs.filter((r) => r.status[fi] === 2).length, action: rs.filter((r) => r.status[fi] === 1).length, nd: rs.filter((r) => r.status[fi] === 0).length }, onclick: () => ctx.set("metGroup", g) };
      }), [{ key: "on", label: t("st_on"), color: "var(--good)" }, { key: "watch", label: t("st_watch"), color: "var(--warning)" }, { key: "action", label: t("st_action"), color: "var(--critical)" }, { key: "nd", label: t("no_data"), color: "var(--muted-mark)" }])),
      card(t("met_explorer"), h("div",
        h("div.filters", select(t("met_metric"), METRICS.filter((d) => d.src === "auto").map((d) => [d.id, `${d.group} · ${d.name}`]), pick, (v) => ctx.set("metPick", v))),
        vbars(monthly.map((p) => ({ label: M.monthKey(p.month), short: M.monthKey(p.month).slice(5), value: p.v, color: RAG_COLOR[metricStatus(pdef, p.v)] })), { target: pdef.dir === "zero" ? null : pdef.target, fmt: (v) => fmtMetric(pdef, v), height: 170 }),
        h("p.fine", `${pdef.def} · ${t("target_lbl")} ${dirLabel(pdef)}`)), { span: 2, sub: t("met_explorer_sub") })),
    card(t("met_cards"), h("div.metric-cards", rows.map((r) => {
      const last = r.qs[fi];
      return h("div.metric-card", { style: { "--dot": RAG_COLOR[r.status[fi]] } },
        h("span.mc-group", r.def.group),
        h("div.mc-head", h("span.mc-name", r.def.name), h(`span.src.${r.def.src}`, { title: r.def.src === "auto" ? t("met_src_auto") : t("met_src_manual") }, r.def.src === "auto" ? "A" : "M")),
        h("div.mc-value", h("b", fmtMetric(r.def, last.value)), h("span.rag", { class: `rag-${r.status[fi]}` }, h("i"), ragLabel(r.status[fi]))),
        h("small.mc-target", `${t("target_lbl")} ${dirLabel(r.def)} · ${focus.label}`),
        vbars(Q.map((p, i) => ({ label: p.label, short: `Q${i + 1}`, value: r.qs[i].value, color: RAG_COLOR[r.status[i]], onclick: r.qs[i].future ? null : enter(r.def, p, r.qs[i]) })), { target: r.def.dir === "zero" ? null : r.def.target, fmt: (v) => fmtMetric(r.def, v), height: 74 }),
        h("p.mc-def", r.def.def));
    })), { sub: t("met_cards_sub") }),
    h("p.fine", t("met_refs")));
}

// ---------- TRAINING ----------
/** "SOPAB0001/Onc" → "SOP AB" (document type + department code). */
const docFamily = (x) => { const m = String(x.Reference ?? "").match(/^\s*([A-Z]{2,3}?)([A-Z]{2})\d/); return m ? `${m[1]} ${m[2]}` : x.Reference ? t("other_lbl") : t("no_reference"); };
const TR_COLOR = { Completed: "var(--good)", Overdue: "var(--critical)", "Due this month": "var(--warning)", Planned: "var(--c1)", Cancelled: "var(--muted-mark)", "Not scheduled": "var(--c7)" };
const TR_STATUSES = ["Completed", "Overdue", "Due this month", "Planned", "Not scheduled", "Cancelled"];
export function trainingView(ctx) {
  const { m } = ctx;
  const T = m.x.training;
  const f = ctx.state.trn ?? {};
  const setF = (k, v) => ctx.set("trn", { ...f, [k]: v });
  const yearOf = (x) => (x.planned != null ? new Date(x.planned).getUTCFullYear() : null);
  const years = [...new Set(T.map(yearOf).filter(Boolean))].sort();
  const year = +(f.year ?? (years.includes(new Date(m.now).getUTCFullYear()) ? new Date(m.now).getUTCFullYear() : years.at(-1) ?? new Date(m.now).getUTCFullYear()));
  const inYear = T.filter((x) => yearOf(x) === year || (x.planned == null && year === new Date(m.now).getUTCFullYear()));
  const L = inYear.filter((x) => (!f.dept || f.dept === ALL || x.Department === f.dept) && (!f.type || f.type === ALL || x.Type === f.type) && (!f.status || f.status === ALL || x.status === f.status));
  const due = L.filter((x) => x.planned != null && x.planned <= m.now && x.status !== "Cancelled");
  const done = L.filter((x) => x.done != null);
  const exec = due.length ? due.filter((x) => x.done != null).length / due.length : null;
  const timed = done.filter((x) => x.onTime != null);
  const att = L.filter((x) => x.attendance != null);
  const attRate = att.length ? att.reduce((a, x) => a + (+x["Trained attendees"] || 0), 0) / att.reduce((a, x) => a + (+x["Planned attendees"] || 0), 0) : null;
  const openList = (title, xs) => () => ctx.open.table(title, "training", xs);
  const months = Array.from({ length: 12 }, (_, i) => Date.UTC(year, i, 1));
  let cp = 0, cd = 0;
  const monthly = months.map((mo) => {
    const k = M.monthKey(mo);
    const planned = L.filter((x) => x.planned != null && M.monthKey(x.planned) === k && x.status !== "Cancelled").length;
    const completed = L.filter((x) => x.done != null && M.monthKey(x.done) === k).length;
    cp += planned; cd += completed;
    return { x: k, month: k, planned, completed, cumPlanned: cp, cumDone: mo <= m.now ? cd : null };
  });
  const types = [...new Set(T.map((x) => x.Type).filter(Boolean))];
  const depts = [...new Set(T.map((x) => x.Department).filter(Boolean))];
  const series = TR_STATUSES.map((s) => ({ key: s, label: tv(s), color: TR_COLOR[s] }));
  const upcoming = L.filter((x) => x.status !== "Completed" && x.status !== "Cancelled" && x.planned != null).sort((a, b) => a.planned - b.planned);
  const markDone = (x) => (ctx.canEdit && x.status !== "Completed" && x.status !== "Cancelled" ? h("button.btn.compact", { type: "button", title: t("mark_done_today"), onclick: (e) => { e.stopPropagation(); ctx.update("training", x.__key, { "Completion date": isoToday(), Status: "Completed" }); } }, icon("check", 14)) : null);
  const cols = [
    { key: "Training ID", label: t("col_id"), cls: "mono nowrap" }, { key: "Program", label: t("trn_program"), cls: "wrap" }, { key: "Reference", label: t("reference_lbl"), cls: "mono" },
    { key: "Type", label: t("col_type") }, { key: "Department", label: t("col_dept"), render: (x) => tv(x.Department) },
    { key: "planned", label: t("planned_lbl"), cls: "num nowrap", render: (x) => (x.planned != null ? fmtDate(x.planned).slice(3) : "—") },
    { key: "Rescheduled to", label: t("rescheduled_lbl"), cls: "num nowrap" }, { key: "done", label: t("completed_on"), cls: "num nowrap", render: (x) => fmtDate(x.done) },
    { key: "attendance", label: t("attendance_lbl"), cls: "num", render: (x) => (x.attendance == null ? "" : fmtPct(x.attendance)) },
    { key: "status", label: t("col_status"), render: (x) => statusPill(x.status, TR_COLOR) },
    { key: "act", label: "", render: markDone },
  ];
  return h("div.view",
    viewHeader(t("trn_title"), t("trn_sub"), ctx.canEdit ? h("button.btn.primary", { type: "button", onclick: () => ctx.addWith("training", { "Planned month": `${year}-${String(new Date(m.now).getUTCMonth() + 1).padStart(2, "0")}` }) }, icon("plus", 16), t("add_training")) : null),
    T.length ? null : emptyState(ctx, "trn_empty"),
    card(null, h("div.filters",
      select(t("year_lbl"), (years.length ? years : [year]).map((y) => [y, String(y)]), year, (v) => setF("year", v)),
      select(t("col_dept"), [[ALL, t("filter_all")], ...depts.map((d) => [d, tv(d)])], f.dept ?? ALL, (v) => setF("dept", v)),
      select(t("col_type"), [[ALL, t("filter_all")], ...types.map((d) => [d, d])], f.type ?? ALL, (v) => setF("type", v)),
      select(t("col_status"), [[ALL, t("filter_all")], ...TR_STATUSES.map((s) => [s, tv(s)])], f.status ?? ALL, (v) => setF("status", v))), { cls: "filter-card" }),
    h("div.kpi-grid",
      kpi({ label: t("trn_planned"), value: fmtNum(L.filter((x) => x.status !== "Cancelled").length), accent: "var(--c1)", onclick: openList(t("trn_planned"), L) }),
      kpi({ label: t("k_completed"), value: fmtNum(done.length), accent: "var(--good)", onclick: openList(t("k_completed"), done) }),
      kpi({ label: t("k_overdue"), value: fmtNum(L.filter((x) => x.status === "Overdue").length), accent: "var(--critical)", onclick: openList(t("k_overdue"), L.filter((x) => x.status === "Overdue")) }),
      kpi({ label: t("due_this_month"), value: fmtNum(L.filter((x) => x.status === "Due this month").length), accent: "var(--warning)", onclick: openList(t("due_this_month"), L.filter((x) => x.status === "Due this month")) }),
      kpi({ label: t("trn_exec"), value: fmtPct(exec), status: exec == null ? 0 : exec >= 0.85 ? 3 : exec >= 0.75 ? 2 : 1, hint: `≥ 85 % · ${fmtNum(due.length)} ${t("due_lbl")}` }),
      kpi({ label: t("cal_ontime"), value: timed.length ? fmtPct(timed.filter((x) => x.onTime).length / timed.length) : "—" }),
      kpi({ label: t("rescheduled_lbl"), value: fmtNum(L.filter((x) => x.rescheduled).length), onclick: openList(t("rescheduled_lbl"), L.filter((x) => x.rescheduled)) }),
      kpi({ label: t("attendance_lbl"), value: fmtPct(attRate), hint: att.length ? `${fmtNum(att.length)} ${t("sessions_lbl")}` : t("att_hint") })),
    h("div.grid.cols-2",
      card(t("trn_monthly"), columns(monthly, [{ key: "planned", label: t("planned_lbl"), color: "var(--c1)" }, { key: "completed", label: t("k_completed"), color: "var(--good)" }]), { span: 2 }),
      card(t("trn_cumulative"), lineChart(monthly, [{ key: "cumPlanned", label: t("planned_lbl"), color: "var(--c1)", area: true }, { key: "cumDone", label: t("k_completed"), color: "var(--good)" }])),
      card(t("trn_status_type"), stacks(types.map((ty) => ({ label: ty, parts: Object.fromEntries(TR_STATUSES.map((s) => [s, L.filter((x) => x.Type === ty && x.status === s).length])), onclick: () => setF("type", ty) })), series)),
      depts.length > 1 ? card(t("c_dept"), stacks(depts.map((d) => ({ label: tv(d), parts: Object.fromEntries(TR_STATUSES.map((s) => [s, inYear.filter((x) => x.Department === d && x.status === s).length])), onclick: () => setF("dept", d) })), series)) : null,
      card(t("by_status"), hbars(TR_STATUSES.map((s) => ({ label: tv(s), value: L.filter((x) => x.status === s).length, color: TR_COLOR[s], onclick: openList(tv(s), L.filter((x) => x.status === s)) })))),
      card(t("trn_by_ref"), hbars(by(L, docFamily).slice(0, 10).map(([r, n]) => ({ label: r, value: n, onclick: openList(r, L.filter((x) => docFamily(x) === r)) })))),
      card(t("trn_plan"), gantt(L.filter((x) => x.planned != null).map((x) => ({ label: x.Program, sub: [x["Training ID"], x.Reference].filter(Boolean).join(" · "), start: x.planned, end: x.plannedEnd, mark: x.done, color: TR_COLOR[x.status],
        tip: `<b>${esc(x.Program)}</b><div class="tip-row"><span>${esc(t("col_status"))}</span><b>${esc(tv(x.status))}</b></div>`, onclick: ctx.canEdit ? () => ctx.edit("training", x.__key, x.Program) : null })), { from: Date.UTC(year, 0, 1), months: 12, today: m.now }), { span: 2, sub: t("gantt_sub") }),
      card(t("trn_upcoming"), upcoming.length ? dataTable(cols.filter((c) => ["Training ID", "Program", "planned", "status", "act"].includes(c.key)), upcoming, { search: false, pageSize: 8, onRow: ctx.canEdit ? (x) => ctx.edit("training", x.__key, x.Program) : null }) : h("p.ok-line", icon("check", 14), t("none_found")), { span: 2 })),
    card(`${t("trn_title")} · ${fmtNum(L.length)}`, dataTable(cols, L, { pageSize: 25, onRow: ctx.canEdit ? (x) => ctx.edit("training", x.__key, x.Program) : null, exportName: "training-plan" })));
}

// ---------- GMP QA ACTIVITY REGISTER ----------
const ACT_COLOR = { Overdue: "var(--critical)", "Due ≤30 d": "var(--warning)", "In date": "var(--good)", Continuous: "var(--c3)", "Not recorded": "var(--muted-mark)" };
const ACT_STATUSES = ["Overdue", "Due ≤30 d", "In date", "Continuous", "Not recorded"];
const LINK_ROUTE = { review: "review", metrics: "metrics", apqr: "apqr", batches: "lifecycle", deviations: "deviations", capa: "capa", cc: "cc", audits: "findings", suppliers: "suppliers", training: "training", fives: "fives", calibration: "calibration", validation: "validation", fmea: "fmea", sops: "sops", wip: "wip" };
export const freqLabel = (f) => (f === 0 ? t("freq_event") : f === 0.25 ? t("freq_weekly") : f === 1 ? t("freq_monthly") : f === 3 ? t("freq_quarterly") : f === 6 ? t("freq_6m") : f === 12 ? t("freq_annual") : f && f % 12 === 0 ? t("freq_years", f / 12) : f ? `${fmtNum(f, 2)} ${t("months_lbl")}` : "—");
const GUIDES = [["ICH Q7", /ICH Q7/], ["ICH Q8", /ICH Q8/], ["ICH Q9", /ICH Q9/], ["ICH Q10", /ICH Q10/], ["ICH Q12", /ICH Q12/], ["ICH Q1A", /ICH Q1A/], ["EU GMP Part I", /EU GMP Ch/], ["EU GMP Annex 11", /Annex 11/], ["EU GMP Annex 15", /Annex 15/], ["EU GMP Annex 16 / 19 / 8", /Annex (16|19|8)\b/], ["PIC/S", /PIC\/S/], ["ISPE", /ISPE/], ["WHO / USP", /WHO|USP/], ["MHRA / FDA / CFR", /MHRA|FDA|CFR/], ["Site SOP", /SOP/]];

export function activitiesView(ctx) {
  const { m } = ctx;
  const A = m.x.qaact;
  const f = ctx.state.qaa ?? {};
  const setF = (k, v) => ctx.set("qaa", { ...f, [k]: v });
  const cats = [...new Set(A.map((a) => a.category))];
  const L = A.filter((a) => (!f.cat || f.cat === ALL || a.category === f.cat) && (!f.status || f.status === ALL || a.status === f.status) && (!f.guide || f.guide === ALL || GUIDES.find((g) => g[0] === f.guide)?.[1].test(a.reference ?? "")));
  const tracked = A.filter((a) => a.status !== "Not recorded");
  const ok = A.filter((a) => ["In date", "Due ≤30 d", "Continuous"].includes(a.status));
  const series = ACT_STATUSES.map((s) => ({ key: s, label: tv(s), color: ACT_COLOR[s] }));
  const next12 = L.filter((a) => a.nextDue != null && a.nextDue < M.addMonths(m.now, 12)).sort((a, b) => a.nextDue - b.nextDue);
  const nextId = () => `QA-${String(Math.max(0, ...A.map((a) => +String(a.id).replace(/\D/g, "") || 0)) + 1).padStart(2, "0")}`;
  const record = (a) => (a.entry
    ? ctx.update("qaact", a.entry.__key, { "Last performed": isoToday(), "Next due": null })
    : ctx.saveObj("qaact", null, { "Activity ID": a.id, Activity: a.activity, Category: a.category, Reference: a.reference, "Frequency (months)": a.freq, "Last performed": isoToday() }));
  const editA = (a) => (a.entry ? ctx.edit("qaact", a.entry.__key, `${a.id} · ${a.activity}`) : ctx.addWith("qaact", { "Activity ID": a.id, Activity: a.activity, Category: a.category, Reference: a.reference, "Frequency (months)": a.freq }));
  const cols = [
    { key: "id", label: t("col_id"), cls: "mono nowrap" },
    { key: "activity", label: t("activity_lbl"), cls: "wrap", render: (a) => h("span", h("b", a.activity), a.link && LINK_ROUTE[a.link] ? h("button.link.small", { type: "button", onclick: (e) => { e.stopPropagation(); ctx.go(LINK_ROUTE[a.link]); } }, " → ", t("open_view")) : null) },
    { key: "category", label: t("col_cat") },
    { key: "reference", label: t("guideline_ref"), cls: "wrap small-text" },
    { key: "sops", label: t("site_sop"), cls: "wrap", sort: (a) => activitySops(ctx, a.id).length, render: (a) => { const xs = activitySops(ctx, a.id); return xs.length
      ? h("span.sop-mini", xs.slice(0, 3).map((x) => h("a.tag.mono", { href: sopHref(x.Code), title: x.Title ?? "", onclick: (e) => e.stopPropagation() }, x.Code)), xs.length > 3 ? h("small.muted", ` +${xs.length - 3}`) : null)
      : h("span.muted", "—"); } },
    { key: "freq", label: t("freq_lbl"), cls: "nowrap", render: (a) => freqLabel(a.freq) },
    { key: "last", label: t("last_performed"), cls: "num nowrap", render: (a) => (a.last != null ? h("span", fmtDate(a.last), a.lastSource === "auto" ? h("sup.src-auto", { title: t("auto_from_data") }, "A") : null) : "—") },
    { key: "nextDue", label: t("next_due"), cls: "num nowrap", render: (a) => (a.status === "Overdue" ? h("b.late", fmtDate(a.nextDue)) : fmtDate(a.nextDue)) },
    { key: "status", label: t("col_status"), render: (a) => statusPill(a.status, ACT_COLOR) },
    { key: "owner", label: t("col_owner") },
    { key: "act", label: "", render: (a) => (ctx.canEdit ? h("span.row-btns",
      h("button.btn.compact", { type: "button", title: t("record_today"), onclick: (e) => { e.stopPropagation(); record(a); } }, icon("check", 14)),
      h("button.btn.compact", { type: "button", title: t("edit"), onclick: (e) => { e.stopPropagation(); editA(a); } }, icon("edit", 14))) : null) },
  ];
  return h("div.view",
    viewHeader(t("qaa_title"), t("qaa_sub"), ctx.canEdit ? h("button.btn.primary", { type: "button", onclick: () => ctx.addWith("qaact", { "Activity ID": nextId(), "Frequency (months)": 12 }) }, icon("plus", 16), t("add_activity")) : null),
    card(null, h("div.filters",
      select(t("col_cat"), [[ALL, t("filter_all")], ...cats.map((c) => [c, c])], f.cat ?? ALL, (v) => setF("cat", v)),
      select(t("col_status"), [[ALL, t("filter_all")], ...ACT_STATUSES.map((s) => [s, tv(s)])], f.status ?? ALL, (v) => setF("status", v)),
      select(t("guideline_ref"), [[ALL, t("filter_all")], ...GUIDES.map((g) => [g[0], g[0]])], f.guide ?? ALL, (v) => setF("guide", v))), { cls: "filter-card" }),
    h("div.kpi-grid",
      kpi({ label: t("qaa_total"), value: fmtNum(A.length), hint: `${fmtNum(cats.length)} ${t("categories_lbl")}`, accent: "var(--c1)" }),
      kpi({ label: t("qaa_compliance"), value: fmtPct(A.length ? ok.length / A.length : null), status: !A.length ? 0 : ok.length / A.length >= 0.9 ? 3 : ok.length / A.length >= 0.75 ? 2 : 1, hint: t("qaa_compliance_hint") }),
      kpi({ label: t("k_overdue"), value: fmtNum(A.filter((a) => a.status === "Overdue").length), accent: "var(--critical)", onclick: () => setF("status", "Overdue") }),
      kpi({ label: t("due_30"), value: fmtNum(A.filter((a) => a.status === "Due ≤30 d").length), accent: "var(--warning)", onclick: () => setF("status", "Due ≤30 d") }),
      kpi({ label: t("qaa_auto"), value: fmtNum(A.filter((a) => a.lastSource === "auto").length), hint: t("auto_from_data") }),
      kpi({ label: t("not_recorded"), value: fmtNum(A.length - tracked.length), accent: "var(--muted-mark)", onclick: () => setF("status", "Not recorded") })),
    h("div.grid.cols-2",
      card(t("qaa_by_cat"), stacks(cats.map((c) => ({ label: c, parts: Object.fromEntries(ACT_STATUSES.map((s) => [s, A.filter((a) => a.category === c && a.status === s).length])), onclick: () => setF("cat", c) })), series), { span: 2 }),
      card(t("qaa_coverage"), hbars(GUIDES.map(([g, re]) => ({ label: g, value: A.filter((a) => re.test(a.reference ?? "")).length, color: "var(--c7)", onclick: () => setF("guide", g) })).filter((x) => x.value)), { sub: t("qaa_coverage_sub") }),
      card(t("qaa_due_month"), columns(Array.from({ length: 12 }, (_, i) => { const mo = M.addMonths(M.monthStart(m.now), i); const k = M.monthKey(mo); return { x: k, n: A.filter((a) => a.nextDue != null && M.monthKey(Math.max(a.nextDue, M.monthStart(m.now))) === k).length }; }), [{ key: "n", label: t("due_lbl"), color: "var(--c1)" }])),
      card(t("qaa_calendar"), next12.length ? gantt(next12.slice(0, 40).map((a) => ({ label: `${a.id} · ${a.activity}`, sub: freqLabel(a.freq), start: Math.max(a.nextDue, M.monthStart(m.now)), end: Math.max(a.nextDue, M.monthStart(m.now)) + 4 * DAY, color: ACT_COLOR[a.status], mark: a.last,
        tip: `<b>${esc(a.activity)}</b><div class="tip-row"><span>${esc(t("next_due"))}</span><b>${fmtDate(a.nextDue)}</b></div><div class="tip-row"><span>${esc(t("guideline_ref"))}</span><b>${esc(a.reference)}</b></div>`, onclick: ctx.canEdit ? () => editA(a) : null })), { from: M.monthStart(m.now), months: 12, today: m.now }) : h("div.empty", t("no_data")), { span: 2, sub: t("qaa_calendar_sub") })),
    card(`${t("qaa_title")} · ${fmtNum(L.length)}`, dataTable(cols, L, { pageSize: 50, onRow: (a) => (a.link && LINK_ROUTE[a.link] ? ctx.go(LINK_ROUTE[a.link]) : ctx.canEdit ? editA(a) : null), searchText: (a) => `${a.id} ${a.activity} ${a.reference} ${a.category} ${activitySops(ctx, a.id).map((x) => x.Code).join(" ")}`, exportName: "qa-activity-register" }), { sub: t("qaa_table_sub") }),
    h("p.fine", t("qaa_refs")));
}
