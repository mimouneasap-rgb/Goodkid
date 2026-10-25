// Calibration program, validation schedule, WIP management, product lifecycle and API suppliers.
import { h, card, kpi, viewHeader, select, dataTable, fmtDate, fmtNum, fmtPct, STATUS_COLOR } from "./ui.js";
import { hbars, stacks, columns, matrix, gantt } from "./charts.js";
import { t, tv } from "./i18n.js";
import { icon } from "./icons.js";
import * as M from "./model.js";

const DAY = 86400000;
const ALL = M.ALL;
const by = (list, f) => [...M.countBy(list, f)].sort((a, b) => b[1] - a[1]);
const yearStart = (y) => Date.UTC(y, 0, 1);
const CAL_COLOR = { Done: "var(--good)", Overdue: "var(--critical)", "Due now": "var(--serious)", "Due ≤30 d": "var(--warning)", Planned: "var(--c1)", "Not scheduled": "var(--muted-mark)" };
const VAL_COLOR = { Completed: "var(--good)", Overdue: "var(--critical)", "In progress": "var(--serious)", "Due next month": "var(--warning)", Planned: "var(--c1)", "Not scheduled": "var(--muted-mark)", Postponed: "var(--c7)", Cancelled: "var(--muted-mark)" };
const statusPill = (s, colors) => h("span.pill", { style: { "--dot": colors[s] ?? "var(--muted-mark)" } }, h("i"), tv(s));
const emptyState = (ctx, msgKey) => h("div.banner.info", icon("upload", 18), h("span", t(msgKey), " ", ctx.canEdit ? h("button.link", { type: "button", onclick: () => ctx.openImport() }, t("update_data")) : null));

// ---------- CALIBRATION PROGRAM ----------
export function calibration(ctx) {
  const { m } = ctx;
  const C = m.x.calplan;
  const f = ctx.state.cal ?? {};
  const setF = (k, v) => ctx.set("cal", { ...f, [k]: v });
  const year = +(f.year ?? new Date(m.now).getUTCFullYear());
  const yearsAvail = [...new Set(C.map((c) => (c.start != null ? new Date(c.start).getUTCFullYear() : null)).filter(Boolean))].sort();
  const inYear = C.filter((c) => c.start != null && new Date(c.start).getUTCFullYear() === year);
  const list = inYear.filter((c) => (!f.status || f.status === ALL || c.status === f.status) && (!f.cat || f.cat === ALL || c.Category === f.cat));
  const parents = inYear.filter((c) => c.isParent);
  const due = inYear.filter((c) => c.start <= m.now);
  const done = inYear.filter((c) => c.done != null);
  const compliance = due.length ? due.filter((c) => c.done != null).length / due.length : null;
  const statuses = ["Done", "Overdue", "Due now", "Due ≤30 d", "Planned"];
  const months = Array.from({ length: 12 }, (_, i) => Date.UTC(year, i, 1));
  const monthPts = months.map((mo) => ({ x: M.monthKey(mo), ...Object.fromEntries(statuses.map((s) => [s, inYear.filter((c) => c.month === M.monthKey(mo) && c.status === s).length])) }));
  const thisMonth = M.monthKey(M.monthStart(m.now));
  const monthGroup = inYear.filter((c) => c.month === (f.month ?? thisMonth));
  const openList = (title, xs) => () => ctx.open.table(title, "calplan", xs);
  const ganttItems = parents.filter((c) => !f.cat || f.cat === ALL || c.Category === f.cat).slice(0, 80).map((c) => ({
    label: c.Item, sub: c.Description, start: c.start, end: c.end ?? c.start, mark: c.done, color: CAL_COLOR[c.status],
    tip: `<b>${c.Item}</b> · ${c.Description ?? ""}<div class="tip-row"><span>${t("planned_lbl")}</span><b>${fmtDate(c.start)}</b></div><div class="tip-row"><span>${t("col_status")}</span><b>${tv(c.status)}</b></div>`,
    onclick: ctx.canEdit ? () => ctx.edit("calplan", c.__key, `${c.Item} · ${c.Description ?? ""}`) : null,
  }));
  const recordGroup = (p) => {
    const kids = C.filter((c) => c.Parent === p.Item && c.start === p.start);
    return ctx.canEdit ? h("form.inline-record", {
      onsubmit: async (e) => { e.preventDefault(); const d = new FormData(e.target).get("d"); if (!d) return; await ctx.bulkUpdate("calplan", [p, ...kids].map((x) => x.__key), { "Calibrated on": d }); },
    }, h("input", { type: "date", name: "d", value: new Date(Math.min(m.now, p.start ?? m.now)).toISOString().slice(0, 10), "aria-label": t("calibrated_on") }), h("button.btn.compact", { type: "submit" }, icon("check", 14), `${t("record_done")} (${kids.length + 1})`)) : null;
  };
  return h("div.view",
    viewHeader(t("cal_title"), t("cal_sub"), ctx.canEdit ? h("button.btn.primary", { type: "button", onclick: () => ctx.add("calplan") }, icon("plus", 16), t("add_row_title", t("calibration_lbl").toLowerCase())) : null),
    C.length ? null : emptyState(ctx, "cal_empty"),
    C.length && !done.length ? h("div.banner.warn", icon("alert", 18), t("cal_no_done", fmtNum(due.length))) : null,
    card(null, h("div.filters",
      select(t("year_lbl"), (yearsAvail.length ? yearsAvail : [year]).map((y) => [y, String(y)]), year, (v) => setF("year", v)),
      select(t("col_status"), [[ALL, t("filter_all")], ...statuses.map((s) => [s, tv(s)])], f.status ?? ALL, (v) => setF("status", v)),
      select(t("col_cat"), [[ALL, t("filter_all")], ...[...new Set(C.map((c) => c.Category).filter(Boolean))].map((c) => [c, c])], f.cat ?? ALL, (v) => setF("cat", v))), { cls: "filter-card" }),
    h("div.kpi-grid",
      kpi({ label: t("cal_lines"), value: fmtNum(inYear.length), hint: `${fmtNum(parents.length)} ${t("equip_systems")}`, accent: "var(--c1)", onclick: openList(t("cal_lines"), inYear) }),
      kpi({ label: t("cal_due_todate"), value: fmtNum(due.length), onclick: openList(t("cal_due_todate"), due) }),
      kpi({ label: t("cal_done"), value: fmtNum(done.length), accent: "var(--good)", onclick: openList(t("cal_done"), done) }),
      kpi({ label: t("k_overdue"), value: fmtNum(inYear.filter((c) => c.status === "Overdue").length), accent: "var(--critical)", onclick: openList(t("k_overdue"), inYear.filter((c) => c.status === "Overdue")) }),
      kpi({ label: t("due_now_30"), value: fmtNum(inYear.filter((c) => ["Due now", "Due ≤30 d"].includes(c.status)).length), accent: "var(--warning)", onclick: openList(t("due_now_30"), inYear.filter((c) => ["Due now", "Due ≤30 d"].includes(c.status))) }),
      kpi({ label: t("eq_k_comp"), value: fmtPct(compliance), status: compliance == null ? 0 : compliance >= (m.targets.cal?.target ?? 0.95) ? 3 : compliance >= (m.targets.cal?.warning ?? 0.9) ? 2 : 1, hint: `≥ ${fmtPct(m.targets.cal?.target ?? 0.95)}` }),
      kpi({ label: t("cal_ontime"), value: done.length ? fmtPct(done.filter((c) => c.onTime).length / done.length) : "—" })),
    h("div.grid.cols-2",
      card(t("cal_month_load"), columns(monthPts, statuses.map((s) => ({ key: s, label: tv(s), color: CAL_COLOR[s] })), { stacked: true, onClick: (p) => setF("month", p.x) }), { span: 2, sub: t("click_month") }),
      card(t("by_category"), stacks(by(inYear, "Category").map(([cat]) => ({ label: cat, parts: Object.fromEntries(statuses.map((s) => [s, inYear.filter((c) => c.Category === cat && c.status === s).length])), onclick: () => setF("cat", cat) })), statuses.map((s) => ({ key: s, label: tv(s), color: CAL_COLOR[s] })))),
      card(t("by_location"), hbars(by(inYear.filter((c) => c.location), "location").slice(0, 14).map(([l, n]) => ({ label: l, value: n, onclick: openList(l, inYear.filter((c) => c.location === l)) })))),
      card(`${t("month_program")} · ${f.month ?? thisMonth}`, monthGroup.filter((c) => c.isParent).length ? h("div.cal-groups", monthGroup.filter((c) => c.isParent).map((p) => {
        const kids = C.filter((c) => c.Parent === p.Item && c.start === p.start);
        return h("div.cal-group",
          h("div.cal-group-head", h("div", h("b.mono", p.Item), " ", p.Description, h("small", ` · ${p.location ?? ""} · ${fmtDate(p.start)}${p.end && p.end !== p.start ? " → " + fmtDate(p.end) : ""}`)), statusPill(p.status, CAL_COLOR)),
          kids.length ? h("ul.cal-kids", kids.map((k) => h("li", h("span.mono", k.Item), " ", k.Description, k.done ? h("small.good-text", ` ✔ ${fmtDate(k.done)}`) : null))) : null,
          p.done ? h("p.ok-line", icon("check", 14), `${t("calibrated_on")} ${fmtDate(p.done)}`) : recordGroup(p));
      })) : h("div.empty", t("no_data")), { span: 2, sub: t("month_program_sub") }),
      card(t("cal_gantt"), gantt(ganttItems, { from: yearStart(year), months: 12, today: m.now }), { span: 2, sub: t("gantt_sub") })),
    card(`${t("cal_lines")} · ${fmtNum(list.length)}`, dataTable([
      { key: "Item", label: t("col_asset"), cls: "mono nowrap" }, { key: "Description", label: t("col_desc"), cls: "wrap" }, { key: "Parent", label: t("parent"), cls: "mono" },
      { key: "Category", label: t("col_cat") }, { key: "location", label: t("col_room"), cls: "mono" }, { key: "start", label: t("planned_lbl"), cls: "num nowrap", render: (c) => fmtDate(c.start) },
      { key: "freq", label: t("freq_m"), cls: "num" }, { key: "done", label: t("calibrated_on"), cls: "num nowrap", render: (c) => fmtDate(c.done) }, { key: "status", label: t("col_status"), render: (c) => statusPill(c.status, CAL_COLOR) },
    ], list, { pageSize: 25, onRow: ctx.canEdit ? (c) => ctx.edit("calplan", c.__key, `${c.Item} · ${c.Description ?? ""}`) : null, exportName: "calibration-program" })));
}

// ---------- VALIDATION & QUALIFICATION ----------
export function validation(ctx) {
  const { m } = ctx;
  const V = m.x.validation;
  const f = ctx.state.val ?? {};
  const setF = (k, v) => ctx.set("val", { ...f, [k]: v });
  const list = V.filter((v) => (!f.scope || f.scope === ALL || v.Scope === f.scope) && (!f.status || f.status === ALL || v.status === f.status));
  const due = V.filter((v) => v.start != null && v.start <= m.now && !/cancel/i.test(v.status));
  const vmp = due.length ? due.filter((v) => v.done != null).length / due.length : null;
  const statuses = ["Completed", "Overdue", "In progress", "Due next month", "Planned"];
  const year = new Date(m.now).getUTCFullYear();
  const years = [...new Set(V.map((v) => (v.start != null ? new Date(v.start).getUTCFullYear() : null)).filter(Boolean))];
  const from = yearStart(years.length ? Math.min(...years) : year);
  const openList = (title, xs) => () => ctx.open.table(title, "validation", xs);
  const next12 = V.filter((v) => v.nextDue != null && v.nextDue >= m.now && v.nextDue < M.addMonths(m.now, 12)).sort((a, b) => a.nextDue - b.nextDue);
  return h("div.view",
    viewHeader(t("val_title"), t("val_sub"), ctx.canEdit ? h("button.btn.primary", { type: "button", onclick: () => ctx.add("validation") }, icon("plus", 16), t("add_row_title", t("qual_task").toLowerCase())) : null),
    V.length ? null : emptyState(ctx, "val_empty"),
    card(null, h("div.filters",
      select(t("scope"), [[ALL, t("filter_all")], ...[...new Set(V.map((v) => v.Scope))].map((s) => [s, s])], f.scope ?? ALL, (v) => setF("scope", v)),
      select(t("col_status"), [[ALL, t("filter_all")], ...statuses.map((s) => [s, tv(s)])], f.status ?? ALL, (v) => setF("status", v))), { cls: "filter-card" }),
    h("div.kpi-grid",
      kpi({ label: t("val_tasks"), value: fmtNum(V.length), accent: "var(--c1)", onclick: openList(t("val_tasks"), V) }),
      kpi({ label: t("cal_due_todate"), value: fmtNum(due.length), onclick: openList(t("cal_due_todate"), due) }),
      kpi({ label: t("k_completed"), value: fmtNum(V.filter((v) => v.done).length), accent: "var(--good)" }),
      kpi({ label: t("k_overdue"), value: fmtNum(V.filter((v) => v.status === "Overdue").length), accent: "var(--critical)", onclick: openList(t("k_overdue"), V.filter((v) => v.status === "Overdue")) }),
      kpi({ label: t("vmp_exec"), value: fmtPct(vmp), status: vmp == null ? 0 : vmp >= 0.9 ? 3 : vmp >= 0.8 ? 2 : 1, hint: "≥ 90 %" }),
      kpi({ label: t("requal_next12"), value: fmtNum(next12.length), onclick: openList(t("requal_next12"), next12) })),
    h("div.grid.cols-2",
      card(t("val_gantt"), gantt(list.map((v) => ({ label: v.Task, sub: v.Category, start: v.start, end: v.finishEnd ?? v.start, mark: v.done, color: VAL_COLOR[v.status], tip: `<b>${v.Task}</b><div class="tip-row"><span>${t("col_status")}</span><b>${tv(v.status)}</b></div><div class="tip-row"><span>${t("freq_y")}</span><b>${v.freqY ?? "—"}</b></div>`, onclick: ctx.canEdit ? () => ctx.edit("validation", v.__key, v.Task) : null })), { from, months: 12, today: m.now }), { span: 2, sub: t("gantt_sub") }),
      card(t("by_category"), stacks(by(V, (v) => v.Category ?? "—").map(([c]) => ({ label: c, parts: Object.fromEntries(statuses.map((s) => [s, V.filter((v) => (v.Category ?? "—") === c && v.status === s).length])), onclick: openList(c, V.filter((v) => (v.Category ?? "—") === c)) })), statuses.map((s) => ({ key: s, label: tv(s), color: VAL_COLOR[s] })))),
      card(t("val_month_load"), columns(Array.from({ length: 12 }, (_, i) => { const mo = M.addMonths(from, i); const k = M.monthKey(mo); return { x: k, ...Object.fromEntries(statuses.map((s) => [s, V.filter((v) => v.month === k && v.status === s).length])) }; }), statuses.map((s) => ({ key: s, label: tv(s), color: VAL_COLOR[s] })), { stacked: true })),
      card(t("requal_next12"), next12.length ? dataTable([{ key: "Task", label: t("val_task"), cls: "wrap" }, { key: "freqY", label: t("freq_y"), cls: "num" }, { key: "nextDue", label: t("next_due"), cls: "num nowrap", render: (v) => fmtDate(v.nextDue) }], next12, { search: false, pageSize: 10 }) : h("div.empty", t("no_data")), { span: 2 })),
    card(`${t("val_tasks")} · ${fmtNum(list.length)}`, dataTable([
      { key: "Task ID", label: t("col_id"), cls: "mono nowrap" }, { key: "Task", label: t("val_task"), cls: "wrap" }, { key: "Scope", label: t("scope") }, { key: "Category", label: t("col_cat") },
      { key: "freqY", label: t("freq_y"), cls: "num" }, { key: "Initial qualification", label: t("initial_qual"), cls: "num" }, { key: "start", label: t("planned_lbl"), cls: "num nowrap", render: (v) => (v.start ? fmtDate(v.start).slice(3) : "—") },
      { key: "done", label: t("completed_on"), cls: "num nowrap", render: (v) => fmtDate(v.done) }, { key: "status", label: t("col_status"), render: (v) => statusPill(v.status, VAL_COLOR) },
    ], list, { pageSize: 25, onRow: ctx.canEdit ? (v) => ctx.edit("validation", v.__key, v.Task) : null, exportName: "validation-schedule" })));
}

// ---------- WIP MANAGEMENT ----------
export function wipView(ctx) {
  const { m } = ctx;
  const W = m.x.wip, RJ = m.x.rejections;
  const kg = (xs) => xs.reduce((a, w) => a + (w.qty ?? 0), 0);
  const cats = ["In process", "Conforming – in process", "Waiting next step", "On hold / investigation", "Under rejection"];
  const catColor = { "In process": "var(--c1)", "Conforming – in process": "var(--good)", "Waiting next step": "var(--warning)", "On hold / investigation": "var(--serious)", "Under rejection": "var(--critical)" };
  const exceeded = W.filter((w) => w.exceeded);
  const soon = W.filter((w) => w.daysToTf != null && w.daysToTf >= 0 && w.daysToTf <= 14);
  const linked = W.filter((w) => w.refs.length);
  const openRJ = RJ.filter((r) => r.open);
  const openList = (title, xs) => () => ctx.open.table(title, "wip", xs);
  const ageB = (d) => (d == null ? "—" : d <= 30 ? "0–30" : d <= 90 ? "31–90" : d <= 180 ? "91–180" : d <= 365 ? "181–365" : ">365");
  const ageBuckets = ["0–30", "31–90", "91–180", "181–365", ">365", "—"];
  return h("div.view",
    viewHeader(t("wip_title"), t("wip_sub"), ctx.canEdit ? h("div.add-group", h("button.btn.primary", { type: "button", onclick: () => ctx.add("wip") }, icon("plus", 16), t("add_wip")), h("button.btn", { type: "button", onclick: () => ctx.add("rejections") }, icon("plus", 16), t("add_rejection"))) : null),
    W.length || RJ.length ? null : emptyState(ctx, "wip_empty"),
    h("div.kpi-grid",
      kpi({ label: t("wip_lots"), value: fmtNum(W.length), hint: `${fmtNum(kg(W), 1)} kg`, accent: "var(--c1)", onclick: openList(t("wip_lots"), W) }),
      kpi({ label: t("under_rejection"), value: fmtNum(W.filter((w) => w.cat === "Under rejection").length), hint: `${fmtNum(kg(W.filter((w) => w.cat === "Under rejection")), 1)} kg`, accent: "var(--critical)", onclick: openList(t("under_rejection"), W.filter((w) => w.cat === "Under rejection")) }),
      kpi({ label: t("hold_exceeded"), value: fmtNum(exceeded.length), status: exceeded.length ? 1 : 3, onclick: openList(t("hold_exceeded"), exceeded) }),
      kpi({ label: t("hold_14"), value: fmtNum(soon.length), accent: "var(--warning)", onclick: openList(t("hold_14"), soon) }),
      kpi({ label: t("on_hold"), value: fmtNum(W.filter((w) => w.cat === "On hold / investigation").length), accent: "var(--serious)" }),
      kpi({ label: t("wip_linked"), value: fmtNum(linked.length), onclick: openList(t("wip_linked"), linked) }),
      kpi({ label: t("rej_open"), value: fmtNum(openRJ.length), hint: `${fmtNum(openRJ.reduce((a, r) => a + (r.qty ?? 0), 0), 1)} kg`, onclick: () => ctx.open.table(t("rej_open"), "rejections", openRJ) })),
    h("div.grid.cols-2",
      card(t("wip_by_step"), stacks(by(W, (w) => w["Next step"] ?? "—").map(([s]) => ({ label: s, parts: Object.fromEntries(cats.map((c) => [c, W.filter((w) => (w["Next step"] ?? "—") === s && w.cat === c).length])), onclick: openList(s, W.filter((w) => (w["Next step"] ?? "—") === s)) })), cats.map((c) => ({ key: c, label: t("wipcat_" + cats.indexOf(c)), color: catColor[c] }))), { span: 2 }),
      card(t("wip_by_product"), hbars(by(W, "productKey").sort((a, b) => kg(W.filter((w) => w.productKey === b[0])) - kg(W.filter((w) => w.productKey === a[0]))).map(([p]) => ({ label: p, value: Math.round(kg(W.filter((w) => w.productKey === p)) * 100) / 100, tipRows: [[t("lots_lbl"), fmtNum(W.filter((w) => w.productKey === p).length)], ["kg", fmtNum(kg(W.filter((w) => w.productKey === p)), 2)]], onclick: openList(p, W.filter((w) => w.productKey === p)) })), { fmt: (v) => `${fmtNum(v, 1)} kg` })),
      card(t("wip_age"), hbars(ageBuckets.map((b) => ({ label: b === "—" ? "—" : `${b} ${t("d")}`, value: W.filter((w) => ageB(w.ageDays) === b).length, color: b === ">365" || b === "181–365" ? "var(--critical)" : "var(--c1)" })))),
      card(t("hold_countdown"), dataTable([
        { key: "Product", label: t("product"), cls: "wrap" }, { key: "Batch", label: t("col_batch"), cls: "mono" },
        { key: "tf", label: t("hold_limit"), cls: "num nowrap", render: (w) => fmtDate(w.tf) }, { key: "daysToTf", label: t("days_left"), cls: "num", render: (w) => (w.daysToTf == null ? "—" : w.daysToTf < 0 ? h("b.late", fmtNum(w.daysToTf)) : fmtNum(w.daysToTf)) },
      ], W.filter((w) => w.tf != null).sort((a, b) => a.daysToTf - b.daysToTf), { search: false, pageSize: 10, onRow: ctx.canEdit ? (w) => ctx.edit("wip", w.__key, `${w.Product} · ${w.Batch ?? ""}`) : null })),
      card(t("by_responsibility"), hbars(by(W, (w) => w.Responsibility ?? "—").map(([r, n]) => ({ label: r, value: n })))),
      card(t("rej_by_kind"), stacks(by(RJ, "kind").map(([k]) => ({ label: k, parts: { open: RJ.filter((r) => r.kind === k && r.open).length, closed: RJ.filter((r) => r.kind === k && !r.open).length } })), [{ key: "open", label: t("s_open"), color: "var(--critical)" }, { key: "closed", label: t("closed_lbl"), color: "var(--good)" }])),
      card(t("rej_by_product"), hbars(by(RJ, "productKey").map(([p, n]) => ({ label: p || "—", value: n, color: "var(--critical)" }))))),
    card(`${t("wip_lots")} · ${fmtNum(W.length)}`, dataTable([
      { key: "Product", label: t("product"), cls: "wrap" }, { key: "Batch", label: t("col_batch"), cls: "mono" }, { key: "Next step", label: t("next_step") },
      { key: "cat", label: t("col_status"), render: (w) => h("span.pill", { style: { "--dot": catColor[w.cat] } }, h("i"), w.Status ?? t("wipcat_" + cats.indexOf(w.cat))) },
      { key: "qty", label: "kg", cls: "num", render: (w) => fmtNum(w.qty, 2) }, { key: "mfg", label: t("mfg_lbl"), cls: "num nowrap", render: (w) => fmtDate(w.mfg) },
      { key: "tf", label: t("hold_limit"), cls: "num nowrap", render: (w) => (w.exceeded ? h("b.late", fmtDate(w.tf)) : fmtDate(w.tf)) },
      { key: "Deviation / CAPA", label: t("refs_lbl"), render: (w) => h("span.chips", w.refs.map((r) => (m.recordByRef.get(r) ? h("button.link.mono", { type: "button", onclick: (e) => { e.stopPropagation(); ctx.open.record(r); } }, r) : h("span.mono", r)))) },
      { key: "Remark", label: t("remark_lbl"), cls: "wrap" },
    ], W, { pageSize: 25, onRow: ctx.canEdit ? (w) => ctx.edit("wip", w.__key, `${w.Product} · ${w.Batch ?? ""}`) : null, exportName: "wip" })),
    card(`${t("rejection_reports")} · ${fmtNum(RJ.length)}`, dataTable([
      { key: "Report no", label: t("report_no"), cls: "mono nowrap" }, { key: "Product", label: t("product"), cls: "wrap" }, { key: "Batch", label: t("col_batch"), cls: "mono" }, { key: "kind", label: t("col_type") },
      { key: "Status", label: t("col_status") }, { key: "qty", label: "kg", cls: "num", render: (r) => fmtNum(r.qty, 3) }, { key: "QA comments", label: t("qa_comments"), cls: "wrap" },
    ], RJ, { pageSize: 15, onRow: ctx.canEdit ? (r) => ctx.edit("rejections", r.__key, r["Report no"]) : null, exportName: "rejections" })));
}

// ---------- PRODUCT LIFECYCLE ----------
const PHASES = ["Pipeline", "Registration / validation batches", "Process validated", "Commercial", "Marketed – no batch recorded"];
const STAGE_COLOR = { Released: "var(--good)", Packed: "var(--c3)", Manufactured: "var(--c1)", "In manufacturing": "var(--warning)", Rejected: "var(--critical)", Planned: "var(--muted-mark)" };
export function lifecycle(ctx) {
  const { m } = ctx;
  const L = m.x.lifecycle;
  const B = m.x.batches;
  const sel = ctx.state.lcProduct && L.some((p) => p.name === ctx.state.lcProduct) ? ctx.state.lcProduct : L.filter((p) => p.batches.length).sort((a, b) => b.batches.length - a.batches.length)[0]?.name ?? L[0]?.name;
  const P = L.find((p) => p.name === sel);
  const stages = ["Planned", "In manufacturing", "Manufactured", "Packed", "Released", "Rejected"];
  const pct = (v) => (v == null ? null : Math.round(v * 1000) / 10);
  const yearsB = [...new Set(B.map((b) => (b.mfg != null ? new Date(b.mfg).getUTCFullYear() : null)).filter(Boolean))].sort();
  return h("div.view",
    viewHeader(t("lc_title"), t("lc_sub")),
    B.length ? null : emptyState(ctx, "lc_empty"),
    card(t("lc_board"), h("div.lc-board", PHASES.map((ph, i) => h("section.lc-lane", { style: { "--i": i } },
      h("header", h("span", t("phase_" + i)), h("b", L.filter((p) => p.phase === ph).length)),
      L.filter((p) => p.phase === ph).map((p) => h("button.lc-card", { type: "button", class: p.name === sel ? "on" : "", onclick: () => ctx.set("lcProduct", p.name) },
        h("b", p.name), h("small", [p.api, p.strengths].filter(Boolean).join(" · ")),
        h("span.lc-stats", h("span", `${p.batches.length} ${t("batches_lbl").toLowerCase()}`), p.pvBatches ? h("span", `PV ${p.pvBatches}`) : null, p.registered ? h("span.tag", "R") : null, p.oeb ? h("span", `OEB ${p.oeb}`) : null)))))), { sub: t("lc_board_sub") }),
    h("div.grid.cols-2",
      card(t("batches_per_month"), columns(M.lastMonths(m.now, 30).map((mo) => { const k = M.monthKey(mo); return { x: k, ...Object.fromEntries(["Validation", "Routine", "Other"].map((ty) => [ty, B.filter((b) => b.month === k && (ty === "Other" ? !/valid|routine/i.test(b["Batch type"] ?? "") : (b["Batch type"] ?? "").toLowerCase() === ty.toLowerCase())).length])) }; }), [{ key: "Validation", label: t("validation_batches"), color: "var(--c7)" }, { key: "Routine", label: t("routine_batches"), color: "var(--c3)" }, { key: "Other", label: t("other_lbl"), color: "var(--muted-mark)" }], { stacked: true }), { span: 2 }),
      card(t("stage_by_product"), matrix(L.filter((p) => p.batches.length).map((p) => p.name), stages, (p, s) => B.filter((b) => b.productKey === p && b.stage === s).length, { colLabel: tv, color: "var(--c3)", onCell: (p, s) => ctx.open.table(`${p} · ${s}`, "batches", B.filter((b) => b.productKey === p && b.stage === s)) }), { span: 2 })),
    P ? [
      h("div.product-hero",
        h("div.product-id", h("span.eyebrow", t("phase_" + PHASES.indexOf(P.phase))), h("h2", P.name), h("p", [P.api, P.strengths, P.form].filter(Boolean).join(" · ")),
          h("div.room-tags", P.oeb ? h("span.tag", `OEB ${P.oeb}`) : null, P.catalogStatus ? h("span.tag", P.catalogStatus) : null, P.registered ? h("span.tag", t("api_registered")) : null,
            select(t("pv_sel"), L.map((p) => [p.name, p.name]), sel, (v) => ctx.set("lcProduct", v)))),
        h("div.kpi-grid.six.flat",
          kpi({ label: t("batches_lbl"), value: fmtNum(P.batches.length) }),
          kpi({ label: t("released_lbl"), value: fmtNum(P.released), accent: "var(--good)" }),
          kpi({ label: t("pv_batches"), value: fmtNum(P.pvBatches), accent: "var(--c7)" }),
          kpi({ label: "RFT", value: fmtPct(P.rft) }),
          kpi({ label: t("rejected_lbl"), value: fmtNum(P.rejected), hint: P.rejections.length ? `${fmtNum(P.rejections.length)} ${t("rejection_reports").toLowerCase()}` : null, accent: P.rejected ? "var(--critical)" : null }),
          kpi({ label: t("pv_k_all"), value: fmtNum(P.records.length), onclick: () => ctx.open.list(P.name, P.records) }))),
      h("div.grid.cols-2",
        card(t("yield_trend"), P.batches.some((b) => Object.values(b.yields).some((v) => v != null))
          ? columns(P.batches.map((b) => ({ x: String(b["Batch no"]), gran: pct(b.yields.granulation), comp: pct(b.yields.compression), mfg: pct(b.yields.manufacturing), pack: pct(b.yields.packaging) })),
            [{ key: "gran", label: t("y_gran"), color: "var(--c1)" }, { key: "comp", label: t("y_comp"), color: "var(--c3)" }, { key: "mfg", label: t("y_mfg"), color: "var(--c7)" }, { key: "pack", label: t("y_pack"), color: "var(--c2)" }], { xFmt: (x) => x, height: 260 })
          : h("div.empty", t("no_data")), { span: 2, sub: t("yield_sub") }),
        card(t("cycle_times"), P.batches.some((b) => b.ct.production != null || b.ct.packaging != null || b.ct.qa != null)
          ? columns(P.batches.map((b) => ({ x: String(b["Batch no"]), production: b.ct.production ?? 0, packaging: b.ct.packaging ?? 0, qa: b.ct.qa ?? 0 })), [{ key: "production", label: t("ct_prod"), color: "var(--c1)" }, { key: "packaging", label: t("ct_pack"), color: "var(--c3)" }, { key: "qa", label: t("ct_qa"), color: "var(--c2)" }], { stacked: true, xFmt: (x) => x })
          : h("div.empty", t("no_data")), { sub: t("cycle_sub") }),
        card(t("records_by_type"), stacks(M.TYPES.map((ty) => ({ label: tv(ty), parts: Object.fromEntries(M.STATUSES.map((s) => [s, P.records.filter((r) => r.type === ty && r.status === s).length])), onclick: () => ctx.open.list(`${P.name} · ${tv(ty)}`, P.records.filter((r) => r.type === ty)) })), M.STATUSES.map((s) => ({ key: s, label: tv(s), color: STATUS_COLOR[s] })))),
        card(t("batch_timeline"), gantt(P.batches.map((b) => ({ label: String(b["Batch no"]), sub: `${b.Purpose ?? ""} ${b["Batch type"] ?? ""}`, start: toTs(b["Start manufacturing"]) ?? b.mfg, end: b.release ?? toTs(b["BPR handover"]) ?? toTs(b["End packaging"]) ?? b.endMfg ?? b.mfg, mark: b.release, color: STAGE_COLOR[b.stage] }))
          , { from: P.batches[0]?.mfg ? M.monthStart(P.batches[0].mfg) : M.addMonths(m.now, -11), months: Math.min(36, Math.max(12, P.batches.length ? Math.ceil(((P.batches.at(-1).release ?? m.now) - (P.batches[0].mfg ?? m.now)) / (30.4 * DAY)) + 2 : 12)), today: m.now }), { span: 2 })),
      card(`${t("batches_lbl")} · ${P.name}`, batchTable(ctx, P.batches))] : null,
    card(`${t("all_batches")} · ${fmtNum(B.length)}`, batchTable(ctx, B)));
}
const toTs = (v) => M.toDay(v);
function batchTable(ctx, B) {
  return dataTable([
    { key: "Batch no", label: t("col_batch"), cls: "mono nowrap" }, { key: "productKey", label: t("product") }, { key: "Purpose", label: t("purpose_lbl") }, { key: "Batch type", label: t("col_type") },
    { key: "mfg", label: t("mfg_lbl"), cls: "num nowrap", render: (b) => fmtDate(b.mfg) }, { key: "stage", label: t("stage"), render: (b) => h("span.pill", { style: { "--dot": STAGE_COLOR[b.stage] ?? "var(--muted-mark)" } }, h("i"), tv(b.stage)) },
    { key: "mfgYield", label: t("y_mfg"), cls: "num", sort: (b) => b.yields.manufacturing, render: (b) => fmtPct(b.yields.manufacturing) },
    { key: "packYield", label: t("y_pack"), cls: "num", sort: (b) => b.yields.packaging, render: (b) => fmtPct(b.yields.packaging) },
    { key: "release", label: t("released_lbl"), cls: "num nowrap", render: (b) => fmtDate(b.release) },
    { key: "flags", label: t("flags"), sort: (b) => `${b.oos ?? ""}${b.deviation ?? ""}`, render: (b) => h("span.warn-text", [b.oos ? `OOS: ${b.oos}` : null, b.deviation ? `${t("nav_dev")}: ${b.deviation}` : null].filter(Boolean).join(" · ")) },
  ], B, { pageSize: 15, onRow: ctx.canEdit ? (b) => ctx.edit("batches", b.__key, `${b.Product} · ${b["Batch no"]}`) : null, exportName: "batches" });
}

// ---------- API SUPPLIERS ----------
export function suppliersView(ctx) {
  const { m } = ctx;
  const S = m.x.suppliers;
  const country = (s) => (/india/i.test(s["Plant address"] ?? "") ? "India" : /china/i.test(s["Plant address"] ?? "") ? "China" : /algeri/i.test(s["Plant address"] ?? "") ? "Algeria" : "—");
  const AUD = { "In date": "var(--good)", "Audit due ≤90 d": "var(--warning)", "Audit overdue": "var(--critical)", "No audit date": "var(--muted-mark)" };
  const byApi = by(S, "API");
  return h("div.view",
    viewHeader(t("sup_title"), t("sup_sub"), ctx.canEdit ? h("button.btn.primary", { type: "button", onclick: () => ctx.add("suppliers") }, icon("plus", 16), t("add_row_title", t("supplier_lbl").toLowerCase())) : null),
    S.length ? null : emptyState(ctx, "sup_empty"),
    h("div.kpi-grid",
      kpi({ label: t("api_count"), value: fmtNum(new Set(S.map((s) => s.API)).size), accent: "var(--c1)" }),
      kpi({ label: t("manufacturers"), value: fmtNum(new Set(S.map((s) => s.Manufacturer)).size) }),
      kpi({ label: t("products_covered"), value: fmtNum(new Set(S.map((s) => s["Finished product"])).size) }),
      kpi({ label: t("single_source"), value: fmtNum(byApi.filter(([api]) => new Set(S.filter((s) => s.API === api).map((s) => s.Manufacturer)).size === 1).length), hint: t("single_source_hint") }),
      kpi({ label: t("audit_overdue"), value: fmtNum(S.filter((s) => s.auditStatus === "Audit overdue").length), accent: "var(--critical)" }),
      kpi({ label: t("no_audit_date"), value: fmtNum(S.filter((s) => s.auditStatus === "No audit date").length), accent: "var(--muted-mark)" })),
    h("div.grid.cols-2",
      card(t("by_manufacturer"), hbars(by(S, "Manufacturer").map(([x, n]) => ({ label: x, value: n, color: "var(--c1)" })))),
      card(t("by_country"), hbars(by(S, country).map(([x, n]) => ({ label: x, value: n, color: "var(--c3)" })))),
      card(t("audit_status"), hbars(Object.keys(AUD).map((k) => ({ label: tv(k), value: S.filter((s) => s.auditStatus === k).length, color: AUD[k] }))))),
    card(t("api_list"), dataTable([
      { key: "API", label: "API", render: (s) => h("b", s.API) }, { key: "CAS number", label: "CAS", cls: "mono" }, { key: "Item code", label: t("col_code"), cls: "mono" }, { key: "Grade", label: t("grade_lbl"), cls: "wrap" },
      { key: "Manufacturer", label: t("manufacturer") }, { key: "country", label: t("country_lbl"), sort: country, render: country }, { key: "Finished product", label: t("product"), cls: "wrap" },
      { key: "Registered", label: "R" }, { key: "Change control", label: "CC", render: (s) => h("span.chips", s.refs.map((r) => (m.recordByRef.get(r) ? h("button.link.mono", { type: "button", onclick: (e) => { e.stopPropagation(); ctx.open.record(r); } }, r) : h("span.mono", r)))) },
      { key: "auditStatus", label: t("audit_lbl"), render: (s) => h("span.pill", { style: { "--dot": AUD[s.auditStatus] } }, h("i"), tv(s.auditStatus)) },
    ], S, { onRow: ctx.canEdit ? (s) => ctx.edit("suppliers", s.__key, `${s.API} · ${s.Manufacturer ?? ""}`) : null, exportName: "api-suppliers" })));
}
