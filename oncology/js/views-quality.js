// Separate dashboards for deviations, CAPA, change controls, audit findings and actions.
// One engine (typeView) draws the common analysis; each type adds its own charts.
import { h, card, kpi, viewHeader, select, dataTable, pill, fmtDate, fmtNum, fmtPct, TYPE_COLOR, STATUS_COLOR } from "./ui.js";
import { hbars, stacks, columns, lineChart, matrix, legend } from "./charts.js";
import { t, tv } from "./i18n.js";
import { icon } from "./icons.js";
import * as M from "./model.js";
import { recordCols, recordSearch } from "./views-overview.js";

const DAY = 86400000;
const ALL = M.ALL;
const by = (list, f) => [...M.countBy(list, f)].sort((a, b) => b[1] - a[1]);
const qOf = (ts) => { const d = new Date(ts); return `${d.getUTCFullYear()}-Q${Math.floor(d.getUTCMonth() / 3) + 1}`; };
const lastQuarters = (now, n) => { const out = []; for (let i = n - 1; i >= 0; i--) out.push(qOf(M.addMonths(now, -3 * i))); return [...new Set(out)]; };
const AGE_COLOR = { "0–30": "var(--c1)", "31–60": "var(--warning)", "61–90": "var(--serious)", ">90": "var(--critical)" };
const STATUS_SERIES = () => M.STATUSES.map((s) => ({ key: s, label: tv(s), color: STATUS_COLOR[s] }));

const TYPE_META = {
  "Change Control": { route: "cc", table: "cc", icon: "cc", title: "nav_cc_t", sub: "cc_sub", pareto: ["scope", "col_scope"], stages: ["Open", "In Review", "QA Initial Approval", "Action Implementation", "Closed", "Canceled"] },
  CAPA: { route: "capa", table: "capa", icon: "capa", title: "nav_capa_t", sub: "capa_sub", pareto: ["source", "col_source"], stages: ["Open", "In Review", "Action Implementation", "Effectiveness Check", "Completed", "Canceled"] },
  Deviation: { route: "deviations", table: "qe", icon: "alert", title: "nav_dev_t", sub: "dev_sub", pareto: ["rootCause", "root_cause"], stages: ["Open", "Investigation", "RCA and CAPA Planning", "QA Approval", "Completed", "Canceled"] },
  "Audit Finding": { route: "findings", table: "find", icon: "quality", title: "nav_find_t", sub: "find_sub", pareto: ["scope", "finding_type"], stages: ["Pending Response", "CAPA Planning", "Completed"] },
};

/** Common filters stored per page. */
function filterBar(ctx, key, list, opts = {}) {
  const f = ctx.state[key] ?? {};
  const set = (k, v) => ctx.set(key, { ...f, [k]: v });
  const uniq = (fn) => [...new Set(list.map(fn).filter((x) => x != null && x !== ""))].sort((a, b) => String(a).localeCompare(String(b)));
  const opt = (xs, fmt = tv) => [[ALL, t("filter_all")], ...xs.map((x) => [x, fmt(x)])];
  const active = Object.values(f).some((v) => v && v !== ALL);
  return {
    f,
    bar: card(null, h("div.filters",
      select(t("flt_year"), opt(uniq((r) => r.year ?? (r.opened != null ? new Date(r.opened).getUTCFullYear() : null)), String), f.year ?? ALL, (v) => set("year", v)),
      select(t("flt_status"), opt(M.STATUSES), f.status ?? ALL, (v) => set("status", v)),
      select(t("flt_dept"), opt(uniq((r) => r.department)), f.dept ?? ALL, (v) => set("dept", v)),
      opts.noClass ? null : select(t("flt_class"), opt(uniq((r) => r.classification)), f.cls ?? ALL, (v) => set("cls", v)),
      opts.extra ?? null,
      active ? h("button.btn.ghost", { type: "button", onclick: () => ctx.set(key, {}) }, t("reset")) : null), { cls: "filter-card" }),
    apply: (xs) => xs.filter((r) =>
      (!f.year || f.year === ALL || String(r.year ?? (r.opened != null ? new Date(r.opened).getUTCFullYear() : "")) === String(f.year)) &&
      (!f.status || f.status === ALL || (f.status === "Overdue" ? r.overdue : r.status === f.status)) &&
      (!f.dept || f.dept === ALL || r.department === f.dept) &&
      (!f.cls || f.cls === ALL || r.classification === f.cls)),
  };
}

function trendPoints(list, now, n = 24) {
  return M.lastMonths(now, n).map((m) => {
    const end = M.addMonths(m, 1);
    const inM = (x) => x != null && x >= m && x < end;
    return { x: M.monthKey(m), opened: list.filter((r) => inM(r.opened)).length, closed: list.filter((r) => inM(r.closed)).length,
      ma3: Math.round((list.filter((r) => r.opened != null && r.opened >= M.addMonths(m, -2) && r.opened < end).length / 3) * 10) / 10 };
  });
}
function onTimeByQuarter(list, now) {
  return lastQuarters(now, 8).map((q) => {
    const xs = list.filter((r) => r.closed != null && r.closedLate != null && qOf(r.closed) === q);
    return { x: q, ontime: xs.filter((r) => r.closedLate === 0).length, late: xs.filter((r) => r.closedLate === 1).length };
  });
}
function dueOutlook(list, now) {
  return Array.from({ length: 8 }, (_, i) => {
    const a = now + i * 7 * DAY, z = a + 7 * DAY;
    return { x: `+${i + 1}`, due: list.filter((r) => r.isOpen && r.due != null && r.due >= a && r.due < z).length };
  });
}

/** Shared dashboard for one quality-record type. */
export function typeView(ctx, type) {
  const meta = TYPE_META[type];
  const { m } = ctx;
  const all = m.records.filter((r) => r.type === type);
  const { bar, apply } = filterBar(ctx, `f_${meta.route}`, all);
  const R = apply(all);
  const k = M.kpis(R, m.now);
  const open = R.filter((r) => r.isOpen);
  const nonCanceled = R.filter((r) => r.status !== "Canceled");
  const closedTimed = R.filter((r) => r.closedLate != null);
  const onTime = closedTimed.length ? closedTimed.filter((r) => r.closedLate === 0).length / closedTimed.length : null;
  const list = (title, xs) => () => ctx.open.list(title, xs);
  const color = TYPE_COLOR[type];
  const tgt = m.targets;

  // type-specific KPI
  let special = null;
  if (type === "Deviation") {
    const req = R.filter((r) => r.capaRequired === "Yes");
    special = kpi({ label: t("cd_k_link"), value: req.length ? fmtPct(req.filter((r) => r.linkedCapas > 0).length / req.length) : "—", onclick: list(t("cd_k_link"), req), status: req.length ? M.rag(req.filter((r) => r.linkedCapas > 0).length / req.length, tgt.link, true) : 0 });
  } else if (type === "CAPA") {
    special = kpi({ label: t("cd_k_ec"), value: nonCanceled.length ? fmtPct(nonCanceled.filter((r) => r.effCheck === "Yes").length / nonCanceled.length) : "—", status: nonCanceled.length ? M.rag(nonCanceled.filter((r) => r.effCheck === "Yes").length / nonCanceled.length, tgt.capa_ec, true) : 0, onclick: list(t("k_capanoec"), nonCanceled.filter((r) => r.effCheck !== "Yes")) });
  } else if (type === "Change Control") {
    special = kpi({ label: t("cc_k_noval"), value: fmtNum(R.filter((r) => r.vqGap).length), status: M.rag(R.filter((r) => r.vqGap).length, tgt.ccvq, false), onclick: list(t("cc_noval"), R.filter((r) => r.vqGap)) });
  } else if (type === "Audit Finding") {
    const withCapa = R.filter((r) => r.linkedCapas > 0);
    special = kpi({ label: t("find_with_capa"), value: fmtNum(withCapa.length), hint: R.length ? fmtPct(withCapa.length / R.length) : "", onclick: list(t("find_with_capa"), withCapa) });
  }
  const majorOpen = open.filter((r) => r.classification === "Major" || r.classification === "Critical");
  const actions = R.flatMap((r) => r.actions ?? []);

  const tiles = h("div.kpi-grid",
    kpi({ label: t("k_total"), value: fmtNum(k.total), accent: color, onclick: list(t(meta.title), R), spark: null }),
    kpi({ label: t("k_open"), value: fmtNum(k.isOpen), delta: k.delta.open, deltaLabel: t("t_vs30ago"), goodWhen: "down", onclick: list(t("k_open"), open) }),
    kpi({ label: t("k_overdue"), value: fmtNum(k.overdue), delta: k.delta.overdue, deltaLabel: t("t_vs30ago"), goodWhen: "down", status: M.rag(k.overdueRate, tgt.overdue, false), accent: "var(--critical)", onclick: list(t("k_overdue"), R.filter((r) => r.overdue)) }),
    kpi({ label: t("k_completed"), value: fmtNum(k.completed), delta: k.delta.completed, deltaLabel: t("t_vs30"), goodWhen: "up", accent: "var(--good)", onclick: list(t("k_completed"), R.filter((r) => r.status === "Completed")) }),
    kpi({ label: t("k_closure"), value: fmtPct(k.closure), status: M.rag(k.closure, tgt.closure, true), hint: `≥ ${fmtPct(tgt.closure?.target)}` }),
    kpi({ label: t("ontime_closure"), value: fmtPct(onTime), status: onTime == null ? 0 : onTime >= 0.85 ? 3 : onTime >= 0.75 ? 2 : 1, hint: `${fmtNum(closedTimed.length)} ${t("closed_with_due")}` }),
    kpi({ label: t("k_avgdays"), value: k.avgDays == null ? "—" : fmtNum(k.avgDays), unit: ` ${t("d")}` }),
    kpi({ label: t("open_gt_90"), value: fmtNum(open.filter((r) => r.daysOpen > 90).length), onclick: list(t("open_gt_90"), open.filter((r) => r.daysOpen > 90)) }),
    kpi({ label: t("major_open"), value: fmtNum(majorOpen.length), accent: "var(--c2)", onclick: list(t("major_open"), majorOpen) }),
    special,
    actions.length ? kpi({ label: t("actions_done"), value: fmtPct(actions.filter((a) => a.status === "Completed").length / actions.length), hint: `${fmtNum(actions.length)} ${t("nav_actions").toLowerCase()}`, onclick: () => ctx.open.actions(t("nav_actions"), actions) }) : null);

  // charts
  const tr = trendPoints(R, m.now);
  const bl = M.backlog(R, m.now, ALL);
  const years = [...new Set(R.map((r) => r.year).filter(Boolean))].sort();
  const statusByYear = years.map((y) => ({ label: String(y), parts: Object.fromEntries(M.STATUSES.map((s) => [s, R.filter((r) => r.year === y && r.status === s).length])), onclick: () => ctx.open.list(`${t(meta.title)} · ${y}`, R.filter((r) => r.year === y)) }));
  const clsRows = by(R, "classification").map(([c, n]) => ({ label: tv(c), value: n, color: c === "Critical" ? "var(--critical)" : c === "Major" ? "var(--serious)" : c === "Minor" ? "var(--c1)" : "var(--muted-mark)", onclick: list(tv(c), R.filter((r) => r.classification === c)) }));
  const deptRows = by(R, "department").slice(0, 12).map(([d]) => ({ label: tv(d), parts: Object.fromEntries(M.STATUSES.map((s) => [s, R.filter((r) => r.department === d && (s === "Overdue" ? r.overdue && r.isOpen : r.status === s && !(s === "Open" && r.overdue))).length])), onclick: list(tv(d), R.filter((r) => r.department === d)) }));
  const months12 = M.lastMonths(m.now, 12).map(M.monthKey);
  const topDepts = by(R, "department").slice(0, 10).map(([d]) => d);
  const stageCounts = [...meta.stages, ...[...new Set(R.map((r) => r.stage))].filter((s) => s && !meta.stages.includes(s))].map((s) => [s, R.filter((r) => r.stage === s).length]).filter(([, n]) => n);
  const ages = M.AGE_BUCKETS.map((b) => ({ label: `${b} ${t("d")}`, value: open.filter((r) => r.ageBucket === b).length, color: AGE_COLOR[b], onclick: list(`${t("c_age")} · ${b}`, open.filter((r) => r.ageBucket === b)) }));
  const ttc = M.TTC_BUCKETS.map((b) => ({ label: `${b} ${t("d")}`, value: R.filter((r) => r.ttcBucket === b).length, color: color }));
  const owners = by(open, "owner").slice(0, 12).map(([o]) => ({ label: o || "—", parts: { od: open.filter((r) => r.owner === o && r.overdue).length, ok: open.filter((r) => r.owner === o && !r.overdue).length }, onclick: list(o, open.filter((r) => r.owner === o)) }));
  const [pKey, pLabel] = meta.pareto;
  // root causes can be several per record ("Equipment related, Human Error"): count each one
  const pVals = (r) => (pKey === "rootCause" ? String(r[pKey] ?? "").split(/\s*,\s*/).filter(Boolean) : r[pKey] ? [r[pKey]] : []);
  const pareto = [...M.countBy(R.flatMap((r) => pVals(r).map((v) => ({ v }))), "v")].sort((a, b) => b[1] - a[1]);
  const pTotal = pareto.reduce((a, b) => a + b[1], 0);
  let cum = 0;
  const products = by(R.filter((r) => r.productKey), "productKey").slice(0, 12).map(([p, n]) => ({ label: p, value: n, color, onclick: list(p, R.filter((r) => r.productKey === p)) }));
  const roomsTop = by(R.filter((r) => r.roomCode), "roomCode").slice(0, 10).map(([c, n]) => ({ label: c, sub: m.roomByCode.get(c)?.Name, value: n, color, onclick: () => ctx.go("rooms", { room: c }) }));

  const charts = [
    card(t("c_trend"), columns(tr, [{ key: "opened", label: t("s_opened"), color }, { key: "closed", label: t("s_closed"), color: type === "Deviation" ? "var(--c1)" : "var(--good)" }], { line: { key: "ma3", label: t("s_ma3"), color: type === "CAPA" ? "var(--c7)" : "var(--c2)" } }), { span: 2 }),
    card(t("spc_bl"), lineChart(bl, [{ key: "open", label: t("s_openall"), color, area: true }, { key: "overdue", label: t("s_overdue"), color: "var(--critical)" }])),
    card(t("ontime_by_quarter"), columns(onTimeByQuarter(R, m.now), [{ key: "ontime", label: t("on_time"), color: "var(--good)" }, { key: "late", label: t("late_lbl"), color: "var(--critical)" }], { stacked: true, xFmt: (x) => x.replace("-", " ") })),
    card(t("stage_pipeline"), h("div.pipeline", stageCounts.map(([s, n], i) => h("button.pipe", { type: "button", onclick: list(s, R.filter((r) => r.stage === s)), style: { "--c": /cancel/i.test(s) ? "var(--muted-mark)" : /complet|closed/i.test(s) ? "var(--good)" : color, "--i": i } }, h("b", fmtNum(n)), h("span", s)))), { span: 2 }),
    card(t("status_by_year"), stacks(statusByYear, STATUS_SERIES())),
    card(t("by_class"), hbars(clsRows)),
    card(t("c_dept"), stacks(deptRows, STATUS_SERIES())),
    card(t("dept_month_heat"), matrix(topDepts, months12, (d, mo) => R.filter((r) => r.department === d && r.month === mo).length, { rowLabel: tv, colLabel: (x) => x.slice(5) + "/" + x.slice(2, 4), color, onCell: (d, mo) => ctx.open.list(`${tv(d)} · ${mo}`, R.filter((r) => r.department === d && r.month === mo)) }), { span: 2 }),
    card(`${t("pareto_of")} ${t(pLabel).toLowerCase()}`, pareto.length ? hbars(pareto.map(([lbl, n]) => { cum += n; return { label: lbl, value: n, color, cum: cum / pTotal, onclick: list(lbl, R.filter((r) => pVals(r).includes(lbl))) }; }), { suffix: (i) => ` · ${fmtPct(i.cum)}` }) : h("div.empty", t("no_data")), { sub: t("pareto_note") }),
    card(t("c_age"), hbars(ages)),
    card(t("cd_c_ttc"), hbars(ttc)),
    card(t("due_outlook"), columns(dueOutlook(R, m.now), [{ key: "due", label: t("due_next_weeks"), color }], { xFmt: (x) => `${t("week_short")}${x}` })),
    card(t("owner_load"), owners.length ? stacks(owners, [{ key: "od", label: t("s_overdue"), color: "var(--critical)" }, { key: "ok", label: t("s_open"), color }]) : h("div.empty", t("no_data"))),
    products.length ? card(t("by_product"), hbars(products)) : null,
    roomsTop.length ? card(t("by_room"), hbars(roomsTop)) : null,
  ];

  // type-specific analysis
  const extra = [];
  if (type === "Deviation") {
    const ic = ["Minor", "Major", "Critical", "Incident"];
    extra.push(card(t("class_shift"), matrix(ic, ic, (a, b) => R.filter((r) => r.initialClass === a && r.finalClass === b).length, { rowLabel: (x) => `${t("initial")}: ${tv(x)}`, colLabel: (x) => `${t("final_lbl")}: ${tv(x)}`, color })));
    const flagged = R.filter((r) => r.classFlags.length);
    extra.push(card(t("cd_flags"), h("div", h("div.flag-sum", ["F1", "F2", "F3", "F4"].map((f) => h("button.flag", { type: "button", onclick: list(f, flagged.filter((r) => r.classFlags.includes(f))) }, h("b", fmtNum(flagged.filter((r) => r.classFlags.includes(f)).length)), h("span", `${f} · ${t("cd_" + f.toLowerCase())}`)))))));
    extra.push(card(t("capa_required_split"), stacks(["Yes", "No", ""].map((v) => ({ label: v ? tv(v) : "—", parts: { linked: R.filter((r) => (r.capaRequired || "") === v && r.linkedCapas > 0).length, none: R.filter((r) => (r.capaRequired || "") === v && !r.linkedCapas).length } })), [{ key: "linked", label: t("with_capa"), color: "var(--good)" }, { key: "none", label: t("without_capa"), color: "var(--muted-mark)" }])));
  }
  if (type === "CAPA") {
    const parentKind = (r) => (r.parentRef.startsWith("QE-") ? t("nav_dev") : r.parentRef.startsWith("FIND-") ? t("nav_find") : r.parentRef.startsWith("CC-") ? t("nav_cc") : r.parentRef ? r.parentRef.split("-")[0] : t("standalone"));
    extra.push(card(t("capa_origin"), hbars(by(R, parentKind).map(([lbl, n]) => ({ label: lbl, value: n, color, onclick: list(lbl, R.filter((r) => parentKind(r) === lbl)) })))));
    extra.push(card(t("cd_k_ec"), stacks(["Yes", "No", ""].map((v) => ({ label: v ? tv(v) : "—", parts: Object.fromEntries(M.STATUSES.map((s) => [s, R.filter((r) => (r.effCheck || "") === v && r.status === s).length])) })), STATUS_SERIES())));
  }
  if (type === "Change Control") {
    extra.push(card(t("cc_c_scope"), stacks(by(R, (r) => r.scope || "—").slice(0, 12).map(([s]) => ({ label: s, parts: Object.fromEntries(M.STATUSES.map((st) => [st, R.filter((r) => (r.scope || "—") === s && r.status === st).length])), onclick: list(s, R.filter((r) => (r.scope || "—") === s)) })), STATUS_SERIES()), { span: 2 }));
    const cat = (r) => r.raw["CC Category"] && r.raw["CC Category"] !== "-----" ? r.raw["CC Category"] : "—";
    extra.push(card(t("cc_category"), hbars(by(R, cat).map(([c, n]) => ({ label: c, value: n, color })))));
    extra.push(card(t("cc_noval"), dataTable(recordCols(["ref", "status", "opened", "stage", "scope", "title"]), R.filter((r) => r.vqGap), { onRow: (r) => ctx.open.record(r.ref), search: false, pageSize: 8 })));
  }
  if (type === "Audit Finding") {
    const audits = by(R, (r) => r.parentRef || "—").map(([a]) => {
      const xs = R.filter((r) => (r.parentRef || "—") === a);
      return { label: `${a} · ${xs[0]?.audit ?? ""}`, parts: Object.fromEntries(["Critical", "Major", "Minor"].map((c) => [c, xs.filter((r) => r.classification === c).length])), onclick: list(a, xs) };
    });
    extra.push(card(t("findings_by_audit"), stacks(audits, [{ key: "Critical", label: tv("Critical"), color: "var(--critical)" }, { key: "Major", label: tv("Major"), color: "var(--serious)" }, { key: "Minor", label: tv("Minor"), color: "var(--c1)" }]), { span: 2 }));
    const areas = by(R, (r) => r.department).map(([a]) => a);
    extra.push(card(t("area_class_heat"), matrix(areas, ["Critical", "Major", "Minor"], (a, c) => R.filter((r) => r.department === a && r.classification === c).length, { rowLabel: tv, colLabel: tv, color: "var(--c7)", onCell: (a, c) => ctx.open.list(`${tv(a)} · ${tv(c)}`, R.filter((r) => r.department === a && r.classification === c)) })));
    extra.push(card(t("audit_closure"), dataTable([
      { key: "ref", label: t("audit_lbl"), cls: "mono nowrap" }, { key: "title", label: t("col_title"), cls: "wrap" }, { key: "n", label: t("findings_lbl"), cls: "num" },
      { key: "open", label: t("k_open"), cls: "num" }, { key: "od", label: t("k_overdue"), cls: "num", render: (x) => (x.od ? h("b.late", x.od) : "0") }, { key: "pct", label: t("k_closure"), cls: "num", render: (x) => fmtPct(x.pct) },
    ], by(R, (r) => r.parentRef || "—").map(([a]) => { const xs = R.filter((r) => (r.parentRef || "—") === a); return { ref: a, title: xs[0]?.audit ?? "", n: xs.length, open: xs.filter((r) => r.isOpen).length, od: xs.filter((r) => r.overdue).length, pct: xs.filter((r) => r.status === "Completed").length / xs.length, xs }; }), { onRow: (x) => ctx.open.list(x.ref, x.xs), search: false }), { span: 2 }));
  }

  const cols = type === "Deviation" ? ["ref", "status", "cls", "dept", "opened", "due", "late", "owner", "title"]
    : type === "CAPA" ? ["ref", "status", "source", "dept", "opened", "due", "late", "owner", "title"]
      : type === "Change Control" ? ["ref", "status", "stage", "cls", "scope", "opened", "due", "owner", "title"]
        : ["ref", "status", "cls", "dept", "opened", "due", "late", "owner", "title"];
  return h("div.view",
    viewHeader(t(meta.title), t(meta.sub), ctx.canEdit ? h("button.btn.primary", { type: "button", onclick: () => ctx.add(meta.table) }, icon("plus", 16), t("new_record")) : null),
    bar, tiles,
    h("div.grid.cols-2", charts, extra),
    card(`${t(meta.title)} · ${fmtNum(R.length)}`, dataTable(recordCols(cols), [...R].sort((a, b) => (b.opened ?? 0) - (a.opened ?? 0)), { pageSize: 20, onRow: (r) => ctx.open.record(r.ref), searchText: recordSearch, exportName: meta.route })));
}

export const deviations = (ctx) => typeView(ctx, "Deviation");
export const capaView = (ctx) => typeView(ctx, "CAPA");
export const ccView = (ctx) => typeView(ctx, "Change Control");
export const findings = (ctx) => typeView(ctx, "Audit Finding");

// ---------- ACTIONS ----------
export function actionCols() {
  return [
    { key: "ref", label: t("col_ref"), cls: "mono nowrap" },
    { key: "status", label: t("col_status"), render: (a) => pill(a.overdue && a.isOpen ? "Overdue" : a.status) },
    { key: "parentRef", label: t("parent"), cls: "mono nowrap" },
    { key: "department", label: t("col_dept"), render: (a) => tv(a.department) },
    { key: "due", label: t("col_due"), cls: "num nowrap", render: (a) => fmtDate(a.due) },
    { key: "daysLate", label: t("col_late"), cls: "num", render: (a) => (a.daysLate ? h("b.late", fmtNum(a.daysLate)) : "") },
    { key: "owner", label: t("col_owner"), cls: "nowrap" },
    { key: "title", label: t("col_title"), cls: "wrap", render: (a) => h("span.title-cell", a.title) },
  ];
}
export function actionsView(ctx) {
  const { m } = ctx;
  const all = m.actions.map((a) => ({ ...a, year: a.opened != null ? new Date(a.opened).getUTCFullYear() : null }));
  const { bar, apply } = filterBar(ctx, "f_actions", all, { noClass: true });
  const A = apply(all);
  const open = A.filter((a) => a.isOpen);
  const done = A.filter((a) => a.closed != null && a.closedLate != null);
  const onTime = done.length ? done.filter((a) => a.closedLate === 0).length / done.length : null;
  const ttc = done.map((a) => a.daysToClose).filter((x) => x != null);
  const list = (title, xs) => () => ctx.open.actions(title, xs);
  const origins = by(A, (a) => a.origin || "—").map(([o]) => o);
  const color = "var(--c4)";
  const odDept = by(open.filter((a) => a.overdue), "department").map(([d, n]) => ({ label: tv(d), value: n, color: "var(--critical)", onclick: list(`${t("k_overdue")} · ${tv(d)}`, open.filter((a) => a.overdue && a.department === d)) }));
  const deptRows = by(A, "department").slice(0, 14).map(([d]) => ({ label: tv(d), parts: { od: A.filter((a) => a.department === d && a.overdue && a.isOpen).length, open: A.filter((a) => a.department === d && a.isOpen && !a.overdue).length, done: A.filter((a) => a.department === d && a.status === "Completed").length }, onclick: list(tv(d), A.filter((a) => a.department === d)) }));
  const parents = by(open, "parentRef").slice(0, 15).map(([p, n]) => ({ label: p || "—", sub: open.find((a) => a.parentRef === p)?.parentTitle, value: n, color, onclick: () => (m.recordByRef.get(p) ? ctx.open.record(p) : ctx.open.actions(p, open.filter((a) => a.parentRef === p))) }));
  const ages = M.AGE_BUCKETS.map((b) => ({ label: `${b} ${t("d")}`, value: open.filter((a) => { const d = a.opened != null ? (m.now - a.opened) / DAY : null; return d != null && (b === "0–30" ? d <= 30 : b === "31–60" ? d > 30 && d <= 60 : b === "61–90" ? d > 60 && d <= 90 : d > 90); }).length, color: AGE_COLOR[b] }));
  return h("div.view",
    viewHeader(t("nav_actions_t"), t("actions_sub"), ctx.canEdit ? h("button.btn.primary", { type: "button", onclick: () => ctx.add("actions") }, icon("plus", 16), t("new_record")) : null),
    bar,
    A.length ? null : h("div.banner.info", icon("alert", 18), t("actions_empty")),
    h("div.kpi-grid",
      kpi({ label: t("k_total"), value: fmtNum(A.length), accent: color, onclick: list(t("nav_actions"), A) }),
      kpi({ label: t("k_open"), value: fmtNum(open.length), onclick: list(t("k_open"), open) }),
      kpi({ label: t("k_overdue"), value: fmtNum(open.filter((a) => a.overdue).length), accent: "var(--critical)", onclick: list(t("k_overdue"), open.filter((a) => a.overdue)) }),
      kpi({ label: t("k_completed"), value: fmtNum(A.filter((a) => a.status === "Completed").length), accent: "var(--good)" }),
      kpi({ label: t("ontime_closure"), value: fmtPct(onTime), status: onTime == null ? 0 : onTime >= 0.85 ? 3 : onTime >= 0.75 ? 2 : 1, hint: `≥ 85 %` }),
      kpi({ label: t("k_avgdays"), value: ttc.length ? fmtNum(ttc.reduce((a, b) => a + b, 0) / ttc.length) : "—", unit: ` ${t("d")}` }),
      kpi({ label: t("qa_approval_wait"), value: fmtNum(A.filter((a) => /qa approval/i.test(a.stage)).length), onclick: list(t("qa_approval_wait"), A.filter((a) => /qa approval/i.test(a.stage))) })),
    h("div.grid.cols-2",
      card(t("c_trend"), columns(trendPoints(A, m.now), [{ key: "opened", label: t("s_opened"), color }, { key: "closed", label: t("s_closed"), color: "var(--good)" }], { line: { key: "ma3", label: t("s_ma3"), color: "var(--c2)" } }), { span: 2 }),
      card(t("od_by_dept"), odDept.length ? hbars(odDept) : h("div.empty", t("no_data")), { sub: t("od_by_dept_sub") }),
      card(t("by_origin"), stacks(origins.map((o) => ({ label: o, parts: { od: A.filter((a) => (a.origin || "—") === o && a.overdue && a.isOpen).length, open: A.filter((a) => (a.origin || "—") === o && a.isOpen && !a.overdue).length, done: A.filter((a) => (a.origin || "—") === o && a.status === "Completed").length }, onclick: list(o, A.filter((a) => (a.origin || "—") === o)) })), [{ key: "od", label: t("s_overdue"), color: "var(--critical)" }, { key: "open", label: t("s_open"), color: "var(--c1)" }, { key: "done", label: t("s_completed"), color: "var(--good)" }])),
      card(t("c_dept"), stacks(deptRows, [{ key: "od", label: t("s_overdue"), color: "var(--critical)" }, { key: "open", label: t("s_open"), color: "var(--c1)" }, { key: "done", label: t("s_completed"), color: "var(--good)" }]), { span: 2 }),
      card(t("ontime_by_quarter"), columns(onTimeByQuarter(A, m.now), [{ key: "ontime", label: t("on_time"), color: "var(--good)" }, { key: "late", label: t("late_lbl"), color: "var(--critical)" }], { stacked: true, xFmt: (x) => x.replace("-", " ") })),
      card(t("c_age"), hbars(ages)),
      card(t("parents_most_open"), parents.length ? hbars(parents) : h("div.empty", t("no_data"))),
      card(t("by_tag"), hbars(by(A.filter((a) => a.tags), "tags").slice(0, 12).map(([g, n]) => ({ label: g, value: n, color, onclick: list(g, A.filter((a) => a.tags === g)) })))),
      card(t("owner_load"), stacks(by(open, "owner").slice(0, 12).map(([o]) => ({ label: o || "—", parts: { od: open.filter((a) => a.owner === o && a.overdue).length, ok: open.filter((a) => a.owner === o && !a.overdue).length }, onclick: list(o, open.filter((a) => a.owner === o)) })), [{ key: "od", label: t("s_overdue"), color: "var(--critical)" }, { key: "ok", label: t("s_open"), color }]), { span: 2 })),
    card(`${t("nav_actions_t")} · ${fmtNum(A.length)}`, dataTable(actionCols(), [...A].sort((a, b) => (a.overdue === b.overdue ? (a.due ?? 9e15) - (b.due ?? 9e15) : a.overdue ? -1 : 1)), { pageSize: 25, onRow: (a) => ctx.open.action(a.ref), searchText: (a) => `${a.ref} ${a.title} ${a.parentRef} ${a.parentTitle} ${a.owner}`, exportName: "actions" })));
}
