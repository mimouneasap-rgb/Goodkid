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
