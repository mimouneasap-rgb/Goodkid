// Home, Dashboard, Management review and SPC & trends.
import { h, card, kpi, viewHeader, select, segmented, dataTable, pill, typeTag, fmtDate, fmtNum, fmtPct, fmtValue, TYPE_COLOR, STATUS_COLOR, defList } from "./ui.js";
import { hbars, stacks, columns, lineChart, gauge, sparkline, legend, ring } from "./charts.js";
import { t, tv } from "./i18n.js";
import { icon } from "./icons.js";
import * as M from "./model.js";
import { METRICS } from "./catalogs.js";
import { dueItems } from "./cockpit.js";
import { cockpitTile } from "./views-cockpit.js";

const DAY = 86400000;

// ---------- shared record columns ----------
export function recordCols(extra = []) {
  const base = {
    ref: { key: "ref", label: t("col_ref"), cls: "mono nowrap" },
    type: { key: "type", label: t("col_type"), render: (r) => typeTag(r.type) },
    status: { key: "status", label: t("col_status"), render: (r) => pill(r.overdue && r.status === "Open" ? "Overdue" : r.status) },
    cls: { key: "classification", label: t("flt_class"), render: (r) => tv(r.classification) },
    opened: { key: "opened", label: t("col_opened"), render: (r) => fmtDate(r.opened), cls: "nowrap num", date: true },
    due: { key: "due", label: t("col_due"), render: (r) => fmtDate(r.due), cls: "nowrap num", date: true },
    late: { key: "daysLate", label: t("col_late"), cls: "num", render: (r) => (r.daysLate ? h("b.late", fmtNum(r.daysLate)) : "") },
    dtd: { key: "daysToDue", label: t("col_dtd"), cls: "num" },
    title: { key: "title", label: t("col_title"), cls: "wrap", render: (r) => h("span.title-cell", r.title) },
    owner: { key: "owner", label: t("col_owner"), cls: "nowrap" },
    dept: { key: "department", label: t("col_dept"), render: (r) => tv(r.department) },
    room: { key: "roomCode", label: t("col_room"), cls: "mono nowrap" },
    prio: { key: "priority", label: t("col_prio"), cls: "num", render: (r) => h("b.prio", fmtNum(r.priority, 1)) },
    days: { key: "daysOpen", label: t("col_days"), cls: "num" },
    stage: { key: "stage", label: t("col_stage") },
    scope: { key: "scope", label: t("col_scope") },
    source: { key: "source", label: t("col_source") },
    batch: { key: "batch", label: t("col_batch"), cls: "mono" },
    link: { key: "roomLink", label: t("col_link"), render: (r) => tv(r.roomLink) },
  };
  return extra.map((k) => base[k]);
}
export const recordSearch = (r) => `${r.ref} ${r.title} ${r.owner} ${r.department} ${r.roomCode} ${r.product}`;

// ---------- HOME ----------
export function home(ctx) {
  const { m } = ctx;
  const sc = M.scorecard(m);
  const v = sc.values;
  const k = sc.kpis;
  const capaOd = m.records.filter((r) => r.type === "CAPA" && r.overdue).length;
  const glance = [
    ["gl_open", fmtNum(v.open), "records", "var(--c1)"],
    ["gl_od", fmtNum(k.overdue), "records", "var(--critical)", { status: "Overdue" }],
    ["gl_clos", fmtPct(v.clos), "dashboard", "var(--good)"],
    ["gl_capaod", fmtNum(capaOd), "capa", "var(--c2)"],
    ["gl_rh", fmtNum(v.rh), "fmea", "var(--c7)"],
    ["gl_cal", fmtPct(v.cal), "equipment", "var(--c3)"],
  ];
  const X = m.x;
  const typeCount = (ty, f) => m.records.filter((r) => r.type === ty && f(r)).length;
  const fivesAvg = (() => { const xs = X.fives.filter((x) => x.date != null && x.date >= m.now - 84 * 86400000 && x.total != null).map((x) => x.total); return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null; })();
  const trnDue = X.training.filter((x) => x.planned != null && x.planned <= m.now && x.status !== "Cancelled");
  const due = dueItems(m, m.now, { horizon: 30 });
  const modules = [
    ["cockpit", "calendar", "ck_title", "ck_m_desc", `${fmtNum(due.filter((x) => x.bucket === "overdue").length)} ${t("s_overdue").toLowerCase()} · ${fmtNum(due.filter((x) => x.bucket === "week").length)} ${t("ck_b_week").toLowerCase()}`],
    ["dashboard", "dashboard", "dash_title", "m_dash", `${fmtNum(k.total)} ${t("s_records").toLowerCase()}`],
    ["review", "review", "mr_title", "m_mr", `${sc.rows.filter((r) => r.status === 1).length} × ${t("st_action")}`],
    ["metrics", "target", "met_title", "m_met", `${fmtNum(METRICS.length)} KPI`],
    ["deviations", "deviation", "nav_dev_t", "m_dev", `${fmtNum(typeCount("Deviation", (r) => r.isOpen))} ${t("s_open").toLowerCase()}`],
    ["capa", "capa", "nav_capa_t", "m_cd", `${fmtNum(capaOd)} ${t("s_overdue").toLowerCase()}`],
    ["cc", "cc", "nav_cc_t", "m_cc", `${fmtNum(v.cc90)} > 90 ${t("d")}`],
    ["findings", "flag", "nav_find_t", "m_find", `${fmtNum(typeCount("Audit Finding", (r) => r.isOpen))} ${t("s_open").toLowerCase()}`],
    ["actions", "tasks", "nav_actions_t", "m_act", `${fmtNum(m.actions.filter((a) => a.overdue && a.isOpen).length)} ${t("s_overdue").toLowerCase()}`],
    ["training", "cap", "trn_title", "m_trn", trnDue.length ? `${fmtPct(trnDue.filter((x) => x.done != null).length / trnDue.length)} ${t("done_lbl")}` : `${fmtNum(X.training.length)}`],
    ["fives", "sparkle", "fives_title", "m_5s", fivesAvg != null ? fmtPct(fivesAvg) : t("fives_start")],
    ["activities", "calendar", "qaa_title", "m_qaa", `${fmtNum(X.qaact.filter((a) => a.status === "Overdue").length)} ${t("s_overdue").toLowerCase()}`],
    ["lifecycle", "cycle", "lc_title", "m_lc", `${fmtNum(X.batches.length)} ${t("batches_lbl").toLowerCase()}`],
    ["apqr", "report", "apqr_title", "m_apqr", X.apqrProg.products.length ? `${fmtNum(X.apqrProg.products.filter((p) => p.triggered).length)} / ${fmtNum(X.apqrProg.products.filter((p) => p.inPlan).length)} ${t("apqr_k_triggered").toLowerCase()}` : "EU GMP 1.10"],
    ["wip", "layers", "wip_title", "m_wip", `${fmtNum(X.wip.length)} ${t("lots_lbl")}`],
    ["calibration", "thermo", "cal_title", "m_cal", `${fmtNum(X.calplan.filter((c) => c.status === "Overdue").length)} ${t("s_overdue").toLowerCase()}`],
    ["validation", "badge", "val_title", "m_val", `${fmtNum(X.validation.length)}`],
    ["suppliers", "truck", "sup_title", "m_sup", `${fmtNum(new Set(X.suppliers.map((s) => s.API)).size)} API`],
    ["spc", "spc", "spc_title", "m_spc", "c · p · run"],
    ["products", "product", "pv_title", "m_pv", `${new Set(m.products.map((p) => p.Product)).size} ${t("product").toLowerCase()}s`],
    ["rooms", "room", "rx_title", "m_rx", `${m.rooms.length} ${t("n_rooms").toLowerCase()}`],
    ["map", "map", "map_title", "m_map", "FFO-01 → FFO-35"],
    ["equipment", "equipment", "eq_title", "m_eq", `${fmtNum(m.equip.length)} ${t("n_eq").toLowerCase()}`],
    ["fmea", "fmea", "fm_title", "m_fm", `${m.fmea.length} ${t("n_fm").toLowerCase()}`],
    ["improvements", "improve", "im_title", "m_im", `${m.impr.length} ${t("n_imp").toLowerCase()}`],
    ["sops", "sop", "sop_title", "m_sop", `${m.sops.length} ${t("n_sop")}${X.docx.list.length ? ` · ${fmtNum(X.docx.list.length)} ${t("doc_documents")}` : ""}`],
    ["audit", "history", "aud_title", "aud_m_desc", `${fmtNum((ctx.audit ?? []).filter((e) => Date.parse(e.at) >= Date.now() - 30 * 86400000).length)} / 30 ${t("d")}`],
    ["quality", "quality", "dq_title", "m_dq", `${M.reconciliation(m).filter((c) => c.ok).length}/${M.reconciliation(m).length} ✔`],
    ["records", "records", "qr_title", "qr_sub", `${fmtNum(m.records.length)}`],
  ];
  const counts = [
    ["n_rooms", m.rooms.length, "rooms"], ["n_eq", m.equip.length, "equipment"], ["n_qr", m.records.length, "records"],
    ["n_fm", m.fmea.length, "fmea"], ["n_sop", m.sops.length, "sops"], ["n_forms", m.forms.length, "sops"],
    ["n_ccp", m.ccp.length, "rooms"], ["n_imp", m.impr.length, "improvements"],
    ["n_actions", m.actions.length, "actions"], ["n_batches", m.x.batches.length, "lifecycle"], ["n_training", m.x.training.length, "training"],
    ["n_cal", m.x.calplan.length, "calibration"], ["n_val", m.x.validation.length, "validation"], ["n_wip", m.x.wip.length, "wip"],
    ["n_fives", m.x.fives.length, "fives"], ["n_qaa", m.x.qaact.length, "activities"],
  ];
  const trendVals = M.trend(m.records, m.now, 12).map((p) => p.opened);
  return h("div.view.home",
    h("section.hero",
      h("div.hero-art", { "aria-hidden": "true", html: heroArt() }),
      h("div.hero-text",
        h("span.eyebrow", "El Kendi · Oncology · ICH Q10"),
        h("h1", t("home_title")),
        h("p", t("home_sub")),
        h("div.hero-meta",
          h("span.chip.chip-glass", h("i.live"), `${t("last_refreshed")} ${fmtDate(m.asof)}`),
          h("span.chip.chip-glass", `${m.meta.docControl?.[0]?.[1] ?? ""}`),
          h("span.chip.chip-glass", `${m.meta.docControl?.[1]?.[1] ?? ""}`))),
      h("div.hero-glance",
        h("div.glance-title", t("h_glance")),
        h("div.glance-grid", glance.map(([key, val, route, color, params]) => h("button.glance", { type: "button", style: { "--accent": color }, onclick: () => ctx.go(route, params) },
          h("span.glance-v", val), h("span.glance-l", t(key))))),
        h("div.glance-spark", h("span", `${t("s_opened")} · 12 ${getMonthsWord()}`), sparkline(trendVals, { color: "#8fc1ff", w: 260, hgt: 36 })))),
    pulse(ctx),
    cockpitTile(ctx),
    h("div.section-title", h("h2", t("h_menu")), h("p", t("everything"))),
    h("div.module-grid", modules.map(([route, ic, title, desc, metric], i) => h("button.module", { type: "button", style: { "--i": i }, onclick: () => ctx.go(route) },
      h("span.module-ico", icon(ic, 22)),
      h("span.module-t", t(title)),
      h("span.module-d", t(desc)),
      h("span.module-m", metric, icon("arrow", 15))))),
    h("div.grid.cols-3",
      card(t("h_counts"), h("div.count-list", counts.map(([key, n, route]) => h("button.count", { type: "button", onclick: () => ctx.go(route) }, h("span", t(key)), h("b", fmtNum(n)))))),
      card(t("h_version"), defList((m.meta.docControl ?? []).map(([a, b]) => [a, b ?? "—"]))),
      card(t("h_history"), h("ol.history", (m.meta.history ?? []).map(([a, b]) => h("li", h("b", a), h("p", b)))))),
    card(t("h_gaps"), h("div.notes", (m.meta.assumptions ?? []).filter(([type]) => type !== "Limitation").map(([type, text]) => h("div.note", h(`span.note-tag.${type.split(" ")[0].toLowerCase()}`, type), h("p", text)))), { sub: t("provisional") }),
    card(t("h_guide"), h("ol.guide", ["ag1", "ag2", "ag3", "ag4", "ag5"].filter((g) => !(window.OKQA_EMBED && g === "ag5")).map((g) => h("li", guideText(g))))),
  );
}
/** One ring per operational programme, each opening its page. */
function pulse(ctx) {
  const { m } = ctx, X = m.x;
  const share = (xs, f) => (xs.length ? xs.filter(f).length / xs.length : null);
  const plan = X.apqrProg.products.filter((p) => p.inPlan);
  const recent5s = X.fives.filter((a) => a.date != null && a.date >= m.now - 84 * 86400000 && a.total != null);
  const trnDue = X.training.filter((x) => x.planned != null && x.planned <= m.now && x.status !== "Cancelled");
  const calDue = X.calplan.filter((c) => c.start != null && c.start <= m.now);
  const capas = m.records.filter((r) => r.type === "CAPA" && r.closedLate != null);
  const acts = X.qaact;
  const items = [
    ["apqr", "apqr_title", share(plan, (p) => p.triggered), "var(--c1)", plan.length ? `${fmtNum(plan.filter((p) => p.triggered).length)}/${fmtNum(plan.length)}` : null],
    ["fives", "fives_title", recent5s.length ? recent5s.reduce((a, b) => a + b.total, 0) / recent5s.length : null, "var(--c3)", recent5s.length ? `${fmtNum(recent5s.length)} · ${t("fives_audits_12w")}` : null],
    ["training", "trn_title", share(trnDue, (x) => x.done != null), "var(--c4)", trnDue.length ? `${fmtNum(trnDue.filter((x) => x.done != null).length)}/${fmtNum(trnDue.length)}` : null],
    ["calibration", "cal_title", share(calDue, (c) => c.done != null), "var(--c7)", calDue.length ? `${fmtNum(calDue.filter((c) => c.done != null).length)}/${fmtNum(calDue.length)}` : null],
    ["capa", "nav_capa_t", share(capas, (r) => r.closedLate === 0), "var(--c2)", capas.length ? t("on_time") : null],
    ["activities", "qaa_title", share(acts, (a) => ["In date", "Due ≤30 d", "Continuous"].includes(a.status)), "var(--good)", t("in_date_lbl")],
  ];
  return card(t("h_pulse"), h("div.pulse", items.map(([route, key, v, color, sub], i) => h("button.pulse-item", { type: "button", style: { "--i": i }, onclick: () => ctx.go(route) },
    ring(v, { size: 84, color: v == null ? "var(--muted-mark)" : color }), h("b", t(key)), h("small", v == null ? t("no_data") : sub ?? "")))), { sub: t("h_pulse_sub") });
}
const getMonthsWord = () => (t("col_month") === "Mois" ? "mois" : "months");
function guideText(key) {
  const s = t(key);
  const i = s.indexOf(" – ");
  return i > 0 ? [h("b", s.slice(0, i)), " ", s.slice(i + 3)] : s;
}
export function heroArt() {
  // A quiet hexagonal lattice (benzene-ring motif) drawn in SVG.
  let paths = "";
  const r = 26, w = Math.sqrt(3) * r;
  for (let row = 0; row < 9; row++) for (let col = 0; col < 16; col++) {
    const cx = col * w + (row % 2 ? w / 2 : 0), cy = row * r * 1.5;
    const pts = Array.from({ length: 6 }, (_, k) => { const a = Math.PI / 6 + (k * Math.PI) / 3; return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`; }).join(" ");
    const o = ((row * 7 + col * 13) % 10) / 10;
    paths += `<polygon points="${pts}" fill="none" stroke="rgba(160,200,255,${(0.05 + o * 0.12).toFixed(2)})" stroke-width="1"/>`;
    if ((row * 5 + col * 3) % 11 === 0) paths += `<circle cx="${cx.toFixed(1)}" cy="${(cy - r).toFixed(1)}" r="2.4" fill="rgba(140,220,255,.55)"/>`;
  }
  return `<svg viewBox="0 0 720 320" preserveAspectRatio="xMidYMid slice" width="100%" height="100%">${paths}</svg>`;
}

// ---------- DASHBOARD ----------
export function dashboard(ctx) {
  const { m } = ctx;
  const f = ctx.state.dash ?? {};
  const setF = (k, v) => ctx.set("dash", { ...f, [k]: v });
  const R = M.applyFilters(m.records, f);
  const k = M.kpis(R, m.now);
  const T = m.targets;
  const uniq = (key) => [...new Set(m.records.map((r) => r[key]).filter((x) => x != null && x !== ""))].sort((a, b) => String(a).localeCompare(String(b)));
  const months = [...new Set(m.records.map((r) => r.month).filter(Boolean))].sort();
  const ALL = M.ALL;
  const opt = (list, fmt = tv) => [[ALL, t("filter_all")], ...list.map((x) => [x, fmt(x)])];
  const active = Object.values(f).some((v) => v && v !== ALL);

  const filters = h("div.filters",
    select(t("flt_type"), opt(M.TYPES), f.type ?? ALL, (v) => setF("type", v)),
    select(t("flt_status"), opt(M.STATUSES), f.status ?? ALL, (v) => setF("status", v)),
    select(t("flt_dept"), opt(uniq("department")), f.dept ?? ALL, (v) => setF("dept", v)),
    select(t("flt_class"), opt(uniq("classification")), f.cls ?? ALL, (v) => setF("cls", v)),
    select(t("flt_room"), opt(uniq("roomCode"), String), f.room ?? ALL, (v) => setF("room", v)),
    select(t("flt_year"), opt(uniq("year"), String), f.year ?? ALL, (v) => setF("year", v)),
    select(t("flt_from"), opt(months, String), f.from ?? ALL, (v) => setF("from", v)),
    select(t("flt_to"), opt(months, String), f.to ?? ALL, (v) => setF("to", v)),
    active ? h("button.btn.ghost", { type: "button", onclick: () => ctx.set("dash", {}) }, t("reset")) : null);

  const tr = M.trend(R, m.now, 24);
  const listOf = (title, pred) => () => ctx.open.list(title, R.filter(pred));
  const tiles = h("div.kpi-grid",
    kpi({ label: t("k_total"), value: fmtNum(k.total), delta: k.delta.total, deltaLabel: t("t_vs30"), goodWhen: "down", onclick: listOf(t("k_total"), () => true), spark: sparkline(tr.map((p) => p.opened)), accent: "var(--c1)" }),
    kpi({ label: t("k_open"), value: fmtNum(k.open), delta: k.delta.open, deltaLabel: t("t_vs30ago"), goodWhen: "down", onclick: listOf(t("k_open"), (r) => r.status === "Open"), accent: "var(--c1)" }),
    kpi({ label: t("k_overdue"), value: fmtNum(k.overdue), delta: k.delta.overdue, deltaLabel: t("t_vs30ago"), goodWhen: "down", onclick: listOf(t("k_overdue"), (r) => r.overdue), status: M.rag(k.overdueRate, T.overdue, false), accent: "var(--critical)" }),
    kpi({ label: t("k_completed"), value: fmtNum(k.completed), delta: k.delta.completed, deltaLabel: t("t_vs30"), goodWhen: "up", onclick: listOf(t("k_completed"), (r) => r.status === "Completed"), spark: sparkline(tr.map((p) => p.closed), { color: "var(--good)" }), accent: "var(--good)" }),
    kpi({ label: t("k_major"), value: fmtNum(k.major), delta: k.delta.major, deltaLabel: t("t_vs30"), goodWhen: "down", onclick: listOf(t("k_major"), (r) => r.classification === "Major" || r.classification === "Critical"), accent: "var(--c2)" }),
    kpi({ label: t("k_closure"), value: fmtPct(k.closure), status: M.rag(k.closure, T.closure, true), hint: `≥ ${fmtPct(T.closure?.target)}` }),
    kpi({ label: t("k_avgdays"), value: k.avgDays == null ? "—" : fmtNum(k.avgDays), unit: ` ${t("d")}`, status: M.rag(k.avgDays, T.days_close, false), hint: `≤ ${fmtNum(T.days_close?.target)} ${t("d")}` }),
    kpi({ label: t("k_devnocapa"), value: fmtNum(k.devNoCapa), onclick: listOf(t("k_devnocapa"), (r) => r.type === "Deviation" && r.capaRequired === "Yes" && r.linkedCapas === 0) }),
    kpi({ label: t("k_capanoec"), value: fmtNum(k.capaNoEc), onclick: listOf(t("k_capanoec"), (r) => r.type === "CAPA" && r.status !== "Canceled" && r.effCheck !== "Yes") }),
    kpi({ label: t("k_cc90"), value: fmtNum(k.cc90), status: M.rag(k.cc90, T.cc90, false), onclick: listOf(t("k_cc90"), (r) => r.type === "Change Control" && r.isOpen && r.daysOpen > 90) }));

  // insights
  const overdue = R.filter((r) => r.overdue);
  const byDept = [...M.countBy(overdue, "department")].sort((a, b) => b[1] - a[1]);
  const oldest = [...overdue].filter((r) => r.due != null).sort((a, b) => a.due - b.due)[0];
  const rc = [...M.countBy(R.filter((r) => r.type === "Deviation" && r.rootCause), "rootCause")].sort((a, b) => b[1] - a[1]);
  const vqGaps = R.filter((r) => r.vqGap).length;
  const ins = [
    overdue.length ? t("ins1", fmtNum(overdue.length), fmtPct(k.overdueRate), `${k.overdueRate >= k.overdueRateThen ? "+" : ""}${fmtNum((k.overdueRate - k.overdueRateThen) * 100)} pt`) : t("ins2n"),
    byDept.length ? t("ins2", tv(byDept[0][0]), fmtNum(byDept[0][1])) : t("ins2n"),
    oldest ? t("ins3", `${oldest.ref} ${oldest.title}`, fmtNum(oldest.daysLate), oldest.owner || "—") : t("ins3n"),
    t("ins4", fmtNum(k.cc90), fmtNum(vqGaps)),
    rc.length ? t("ins5", rc[0][0], fmtNum(rc[0][1])) : t("ins5n"),
    t("ins6", fmtPct(k.closure), fmtPct(T.closure?.target), k.avgDays == null ? "—" : fmtNum(k.avgDays)),
  ];
  const sev = [k.overdue ? "bad" : "good", byDept.length ? "warn" : "good", oldest ? "bad" : "good", k.cc90 ? "warn" : "good", "info", k.closure >= (T.closure?.target ?? 0) ? "good" : "warn"];

  // charts
  const statusSeries = M.STATUSES.map((s) => ({ key: s, label: tv(s), color: STATUS_COLOR[s] }));
  const byType = M.TYPES.map((ty) => ({ label: tv(ty), parts: Object.fromEntries(M.STATUSES.map((s) => [s, R.filter((r) => r.type === ty && r.status === s).length])), onclick: () => setF("type", ty) }));
  const deptRows = [...M.countBy(R, "department")].sort((a, b) => b[1] - a[1]).slice(0, 10)
    .map(([d, n]) => { const od = R.filter((r) => r.department === d && r.overdue).length; return { label: tv(d), parts: { od, ok: n - od }, onclick: () => setF("dept", d) }; });
  const rcAll = [...M.countBy(R.filter((r) => r.type === "Deviation"), (r) => r.rootCause || "(Not recorded)")].sort((a, b) => b[1] - a[1]);
  const rcTotal = rcAll.reduce((a, b) => a + b[1], 0);
  let cum = 0;
  const ages = M.AGE_BUCKETS.map((b) => ({ label: `${b} ${t("d")}`, value: R.filter((r) => r.ageBucket === b).length, color: b === ">90" ? "var(--critical)" : b === "61–90" ? "var(--serious)" : b === "31–60" ? "var(--warning)" : "var(--c1)" }));

  return h("div.view",
    viewHeader(t("dash_title"), t("dash_sub")),
    card(null, [filters, h("p.fine", t("flt_note"))], { cls: "filter-card" }),
    tiles,
    card(t("sec_insights"), h("ul.insights", ins.map((s, i) => h(`li.${sev[i]}`, s)))),
    h("div.grid.cols-2",
      card(t("c_trend"), columns(tr.map((p) => ({ ...p, x: p.month })), [{ key: "opened", label: t("s_opened"), color: "var(--c1)" }, { key: "closed", label: t("s_closed"), color: "var(--c3)" }], { line: { key: "ma3", label: t("s_ma3"), color: "var(--c2)" } }), { span: 2 }),
      card(t("c_status"), stacks(byType, statusSeries)),
      card(t("c_dept"), stacks(deptRows, [{ key: "od", label: t("s_overdue"), color: "var(--critical)" }, { key: "ok", label: t("s_records"), color: "var(--c1)" }])),
      card(t("c_pareto"), hbars(rcAll.map(([label, n]) => { cum += n; return { label, value: n, color: "var(--c3)", cum: cum / rcTotal }; }), { suffix: (i) => ` · ${fmtPct(i.cum)}` }), { sub: t("pareto_note") }),
      card(t("c_age"), hbars(ages))),
    card(t("sec_watch"), dataTable(recordCols(["ref", "type", "due", "late", "title", "owner", "dept"]), overdue.sort((a, b) => (a.due ?? 0) - (b.due ?? 0)), { onRow: (r) => ctx.open.record(r.ref), searchText: recordSearch, exportName: "overdue-watch-list" })),
  );
}

// ---------- MANAGEMENT REVIEW ----------
export function review(ctx) {
  const { m } = ctx;
  const sc = M.scorecard(m);
  const v = sc.values, T = m.targets;
  const meet = ctx.local.get("meeting") ?? { period: m.meta.reviewPeriod ?? "", date: "", chair: "", attendees: "" };
  const saveMeet = (k, val) => ctx.local.set("meeting", { ...meet, [k]: val });
  const decisions = structuredClone(ctx.local.get("decisions") ?? []); // shared data arrives frozen
  const field = (label, key, type = "text") => h("label.field", h("span", label), h("input", { type, value: meet[key] ?? "", onchange: (e) => saveMeet(key, e.target.value) }));

  // trend vs 30 days ago for open / overdue rate
  const ago = m.now - 30 * DAY;
  const openThen = m.records.filter((r) => r.status !== "Canceled" && M.openAt(r, ago)).length;
  const trendFor = (key) => key === "mk_open" ? v.open - openThen : key === "mk_odr" ? Math.round((v.odr - sc.kpis.overdueRateThen) * 100) : null;
  const statusChip = (s) => (s ? h(`span.rag.rag-${s}`, h("i"), [null, t("st_action"), t("st_watch"), t("st_on")][s]) : h("span.muted", "–"));
  const counts = [1, 2, 3].map((s) => sc.rows.filter((r) => r.status === s).length);

  const open = m.records.filter((r) => r.isOpen).sort((a, b) => b.priority - a.priority);
  const due30 = m.records.filter((r) => r.daysToDue != null && r.daysToDue >= 0 && r.daysToDue <= 30).sort((a, b) => a.daysToDue - b.daysToDue);

  const decTable = h("div.decisions",
    decisions.length ? h("table.data.compact", h("thead", h("tr", ["#", t("mr_comment"), t("mr_owner"), t("mr_duec"), t("col_status"), ""].map((x) => h("th", x)))),
      h("tbody", decisions.map((d, i) => h("tr",
        h("td.num", i + 1), h("td.wrap", d.text), h("td", d.owner), h("td.nowrap", d.due ? fmtDate(M.toDay(d.due)) : ""),
        h("td", h("select.inline", { onchange: (e) => { decisions[i].status = e.target.value; ctx.local.set("decisions", decisions); } }, ["Open", "In progress", "Done", "Cancelled"].map((s) => h("option", { selected: s === d.status ? true : null, value: s }, tv(s))))),
        h("td", h("button.icon-btn", { type: "button", title: t("cancel"), "aria-label": "Remove", onclick: () => { decisions.splice(i, 1); ctx.local.set("decisions", decisions); ctx.rerender(); } }, icon("close", 14))))))) : null,
    h("form.dec-form", {
      onsubmit: (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        if (!fd.get("text")) return;
        decisions.push({ text: fd.get("text"), owner: fd.get("owner"), due: fd.get("due"), status: "Open" });
        ctx.local.set("decisions", decisions); ctx.rerender();
      },
    },
    h("input", { name: "text", placeholder: t("mr_comment"), required: true }),
    h("input", { name: "owner", placeholder: t("mr_owner") }),
    h("input", { name: "due", type: "date", "aria-label": t("mr_duec") }),
    h("button.btn.primary", { type: "submit" }, t("decision_add"))),
    h("p.fine", ctx.workspace.mode === "shared" ? t("shared_note") : t("local_note")));

  return h("div.view",
    viewHeader(t("mr_title"), t("mr_sub"), window.OKQA_EMBED ? null : h("button.btn", { type: "button", onclick: () => window.print() }, icon("print", 16), t("print"))),
    card(t("mr_meet"), h("div.meet-grid", field(t("mr_period"), "period"), field(t("mr_date"), "date", "date"), field(t("mr_chair"), "chair"), field(t("mr_att"), "attendees"))),
    card(t("mr_glance"), h("div.gauges",
      gauge(v.clos, { ...T.closure, label: t("g_closure"), sub: `${t("mr_target")} ≥ ${fmtPct(T.closure.target)}` }),
      gauge(1 - v.odr, { target: 1 - T.overdue.target, warning: 1 - T.overdue.warning, label: t("g_ontime"), sub: `${t("mr_target")} ≥ ${fmtPct(1 - T.overdue.target)}` }),
      gauge(v.ec, { ...T.capa_ec, label: t("g_ec"), sub: `${t("mr_target")} ≥ ${fmtPct(T.capa_ec.target)}` }),
      gauge(v.cal, { ...T.cal, label: t("g_cal"), sub: `${t("mr_target")} ≥ ${fmtPct(T.cal.target)}` }))),
    card(t("mr_score"), [
      h("div.rag-summary", [3, 2, 1].map((s) => h(`span.rag.rag-${s}.big`, h("i"), `${counts[s - 1]} · ${[null, t("st_action"), t("st_watch"), t("st_on")][s]}`))),
      h("div.table-scroll", h("table.data.scorecard",
        h("thead", h("tr", [t("mr_kpi"), t("mr_area"), t("mr_actual"), t("mr_target"), t("mr_status"), t("mr_trend")].map((x) => h("th", x)))),
        h("tbody", sc.rows.map((r) => {
          const tr = trendFor(r.key);
          return h(`tr.st-${r.status}`,
            h("td", t(r.key)), h("td.muted", t(r.area)),
            h("td.num", h("b", fmtValue(r.value, r.unit))),
            h("td.num.muted", r.target ? `${r.hib ? "≥" : "≤"} ${fmtValue(r.target.target, r.unit)}` : "—"),
            h("td", statusChip(r.status)),
            h("td.num", tr == null ? "" : tr === 0 ? "► 0" : tr > 0 ? `▲ +${tr}${r.unit === "%" ? " pt" : ""}` : `▼ ${tr}${r.unit === "%" ? " pt" : ""}`));
        }))))]),
    h("div.grid.cols-2",
      card(t("mr_act"), dataTable(recordCols(["ref", "type", "prio", "late", "due", "title", "owner", "room"]), open, { pageSize: 15, onRow: (r) => ctx.open.record(r.ref), searchText: recordSearch, exportName: "priority-list" }), { span: 2, sub: t("mr_prio_note") }),
      card(t("mr_due30"), dataTable(recordCols(["ref", "type", "due", "dtd", "title", "owner"]), due30, { onRow: (r) => ctx.open.record(r.ref) }), { span: 2 })),
    card(t("mr_dec"), decTable),
  );
}

// ---------- SPC ----------
export function spc(ctx) {
  const { m } = ctx;
  const s = ctx.state.spc ?? { type: M.ALL, baseline: "all" };
  const set = (k, val) => ctx.set("spc", { ...s, [k]: val });
  const c = M.cChart(m.records, m.now, s);
  const p = M.pChart(m.records, m.now, s);
  const bl = M.backlog(m.records, m.now, s.type);
  const sigs = (pts) => pts.filter((x) => x.signals.length);
  const reading = (pts, rows) => h("div.reading",
    defList(rows),
    sigs(pts).length
      ? h("div.signal-list", sigs(pts).map((x) => h("span.signal", h("b", x.month), " ", x.signals.join(" · "))))
      : h("p.ok-line", icon("check", 16), t("spc_none")));

  return h("div.view",
    viewHeader(t("spc_title"), t("spc_sub")),
    card(null, h("div.filters",
      h("div.field", h("span", t("spc_type")), segmented([[M.ALL, t("filter_all")], ...M.TYPES.map((x) => [x, tv(x)])], s.type, (val) => set("type", val), t("spc_type"))),
      h("div.field", h("span", t("spc_base")), segmented([["all", t("last24")], ["phase1", t("phase1")]], s.baseline, (val) => set("baseline", val), t("spc_base")))), { cls: "filter-card" }),
    h("div.grid.cols-3",
      card(t("spc_c"), lineChart(c.points, [{ key: "value", label: t("s_count"), color: "var(--c1)", area: true }], { limits: true }), { span: 2 }),
      card(t("spc_read"), reading(c.points, [[t("col_cl"), fmtNum(c.cl, 2)], [t("col_ucl"), fmtNum(c.ucl, 2)], [t("col_lcl"), fmtNum(c.lcl, 2)], [t("spc_signals"), fmtNum(sigs(c.points).length)]])),
      card(t("spc_p"), lineChart(p.points, [{ key: "value", label: t("s_p"), color: "var(--c2)" }], { limits: true, pct: true }), { span: 2 }),
      card(t("spc_read"), reading(p.points, [[t("col_pbar"), fmtPct(p.pbar, 1)], [t("col_n"), fmtNum(p.n)], [t("col_x"), fmtNum(p.x)], [t("spc_signals"), fmtNum(sigs(p.points).length)], [t("mr_target"), `≤ ${fmtPct(m.targets.late?.target)}`]])),
      card(t("spc_bl"), lineChart(bl, [{ key: "open", label: t("s_openall"), color: "var(--c1)", area: true }, { key: "overdue", label: t("s_overdue"), color: "var(--critical)" }]), { span: 2 }),
      card(t("spc_method"), h("div.method", ["spc_m1", "spc_m2", "spc_m3", "spc_m4"].map((k) => h("p", t(k).split(/ (Hidden|Les colonnes masquées)/)[0]))))),
  );
}
