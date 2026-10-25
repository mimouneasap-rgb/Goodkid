// One APQR on its own page: the product's Scigeniq workflow and its data-collection tasks by department,
// the task timeline, the EU GMP Ch.1.10 review sections, the decision and the approval — all editable in the app.
import { h, card, kpi, segmented, dataTable, fmtDate, fmtNum, fmtPct, esc } from "./ui.js";
import { gantt, ring } from "./charts.js";
import { t, tv, getLang } from "./i18n.js";
import { icon } from "./icons.js";
import { APQR_SECTIONS, APQR_STREAMS } from "./catalogs.js";
import { APQR_DEPTS } from "./domain.js";
import { toDay } from "./model.js";
import { RAG_COLOR, TRACK_COLOR, STATE_COLOR, dot, pctBar, phaseStepper, phaseName, short, editRecord } from "./views-apqr.js";
import { openBulk } from "./bulk.js";

const DAY = 86400000;
const FR = () => getLang() === "FR";
const isoToday = () => new Date().toISOString().slice(0, 10);
const SECTION_COLOR = { Complete: "var(--good)", "In progress": "var(--c1)", "Not applicable": "var(--muted-mark)", "Not started": "var(--warning)" };
const taskColor = (x) => (x.done ? "var(--good)" : x.overdue ? "var(--critical)" : "var(--c1)");
const taskState = (x) => (x.inferred ? tv("Closed (inferred)") : x.done ? tv("Completed") : x.overdue ? tv("Overdue") : tv("Open"));
/** The owner's workflow task is titled "APQR , <product>": show it as the workflow. */
const taskTitle = (x) => (x.isWorkflow ? `${t("apqr_wf_task")}${x.dupFlag ? ` (${t("dup_short")})` : ""}` : x["Task Title"]);
const TABS = [["overview", "apqr_p_overview"], ["tasks", "apqr_tab_tasks"], ["sections", "apqr_p_sections"], ["decision", "apqr_p_decision"]];

/** Link to an APQR's page. */
export const apqrHref = (key) => `#/apqr?p=${encodeURIComponent(key)}`;

export function apqrPage(ctx, X, key) {
  const P = X.products.find((p) => p.key === key);
  const back = h("a.crumb", { href: "#/apqr" }, h("span.flip", icon("chevron", 15)), t("apqr_back"));
  if (!P) return h("div.view", h("nav.crumbs", back), h("div.banner.warn", icon("alert", 18), t("apqr_not_found")));
  const order = X.products.filter((p) => p.triggered || p.inPlan);
  const at = order.indexOf(P);
  const prev = at > 0 ? order[at - 1] : null, next = at >= 0 && at < order.length - 1 ? order[at + 1] : null;
  const tab = TABS.some(([k]) => k === ctx.state.apqrPTab) ? ctx.state.apqrPTab : "overview";
  const body = { overview, tasks: tasksTab, sections: sectionsTab, decision: decisionTab }[tab](ctx, X, P);
  const streamsDone = Object.values(P.streamState).filter((s) => s === "done").length, streamsAll = Object.values(P.streamState).filter(Boolean).length;
  const dueIn = P.daysToReportDue;
  return h("div.view.apqr-page",
    h("nav.crumbs", back, h("span.crumb-sep", "/"), h("span.crumb-here", short(P.name, 60)),
      h("span.spacer"),
      h("span.crumb-pos", at >= 0 ? `${fmtNum(at + 1)} / ${fmtNum(order.length)}` : ""),
      h("a.icon-btn", { href: prev ? apqrHref(prev.key) : null, "aria-disabled": prev ? null : "true", title: prev ? prev.name : "", "aria-label": t("previous") }, h("span.flip", icon("chevron", 17))),
      h("a.icon-btn", { href: next ? apqrHref(next.key) : null, "aria-disabled": next ? null : "true", title: next ? next.name : "", "aria-label": t("next") }, icon("chevron", 17))),
    h("section.apqr-hero.apqr-item-hero",
      h("div.apqr-hero-text",
        h("span.eyebrow", ["APQR", P.code, P.site].filter(Boolean).join(" · ")),
        h("h2", P.name),
        h("p", [P.form !== "—" ? P.form : null, P.period ? `${t("period_lbl")} ${P.period}` : null, P.refs.length ? `Scigeniq ${P.refs.join(" · ")}` : t("apqr_not_triggered")].filter(Boolean).join(" · ")),
        h("div.hero-meta",
          h("span.chip.chip-glass", { style: { "--dot": TRACK_COLOR[P.track] } }, h("i.dotc"), tv(P.track)),
          P.triggered ? h("span.chip.chip-glass", { style: { "--dot": RAG_COLOR[P.rag] } }, h("i.dotc"), tv(P.rag)) : null,
          P.owner ? h("span.chip.chip-glass", icon("badge", 13), P.owner) : null,
          P.duplicate ? h("span.chip.chip-glass.warn", t("dup_short")) : null,
          P.dupRefs.length ? h("span.chip.chip-glass.warn", `${t("apqr_dup_flagged")} ${P.dupRefs.join(" · ")}`) : null)),
      h("div.apqr-rings",
        h("div.hero-ring", ring(P.triggered ? P.pct : null, { size: 92, color: "#5fe0b0" }), h("span", t("apqr_k_task_done"))),
        h("div.hero-ring", ring(streamsAll ? streamsDone / streamsAll : null, { size: 92, color: "#8fc1ff" }), h("span", t("apqr_streams_done"))),
        h("div.hero-ring", ring(P.sectionsStarted ? P.sectionPct : null, { size: 92, color: "#ffd27a" }), h("span", t("apqr_p_sections"))),
        h("div.hero-count", { class: P.approved ? "ok" : dueIn != null && dueIn < 0 ? "late" : dueIn != null && dueIn <= 30 ? "soon" : "" },
          h("b", P.approved ? "✔" : dueIn == null ? "—" : fmtNum(Math.abs(dueIn))),
          h("span", P.approved ? `${t("approved_on")} ${fmtDate(P.approved)}` : dueIn == null ? t("apqr_report_due") : dueIn < 0 ? t("apqr_days_late") : t("apqr_days_to_due")),
          P.reportDue != null && !P.approved ? h("small", fmtDate(P.reportDue)) : null))),
    card(null, phaseStepper(null, null, P.phase), { cls: "stepper-card" }),
    h("div.apqr-page-bar",
      segmented(TABS.map(([k, l]) => [k, k === "tasks" ? `${t(l)} · ${fmtNum(P.total)}` : k === "sections" ? `${t(l)} · ${fmtNum(P.sections.filter((s) => /complete|not applicable/i.test(s.Status ?? "")).length)}/${APQR_SECTIONS.length}` : t(l)]), tab, (v) => ctx.set("apqrPTab", v), "APQR"),
      h("span.spacer"),
      ctx.canEdit ? h("button.btn.compact", { type: "button", onclick: () => addTask(ctx, P) }, icon("plus", 15), t("apqr_add_task")) : null,
      ctx.canEdit ? h("button.btn.compact", { type: "button", onclick: () => bulkTasks(ctx, P) }, icon("upload", 15), t("bulk_insert")) : null,
      ctx.canEdit ? h("button.btn.primary.compact", { type: "button", onclick: () => editRecord(ctx, P) }, icon(P.record ? "edit" : "check", 15), t("apqr_record")) : null),
    notices(ctx, X, P),
    body);
}

function notices(ctx, X, P) {
  return [
    P.dupTasks.length ? h("div.banner.warn", icon("alert", 18), h("span", t("apqr_dup_banner", P.dupRefs.join(" · ") || "—", fmtNum(P.dupTasks.filter((x) => x.open).length)))) : null,
    P.inferred ? h("div.banner.info", icon("check", 18), h("span", t("apqr_inferred_banner", fmtNum(P.inferred), fmtDate(Math.min(...P.tasks.filter((x) => x.inferred && x.lastSeen != null).map((x) => x.lastSeen))) || "—", fmtDate(X.asOf)))) : null,
    !P.triggered && P.inPlan ? h("div.banner.info", icon("calendar", 18), h("span", t("apqr_not_triggered_banner", P.planned != null ? fmtDate(P.planned).slice(3) : "—", fmtDate(P.reportDue) || "—"))) : null,
  ];
}

// ---------- overview: department lanes, timeline, streams, key dates ----------
function overview(ctx, X, P) {
  const T = P.tasks;
  const open = T.filter((x) => x.open), overdue = T.filter((x) => x.overdue);
  const depts = [...APQR_DEPTS, ...new Set(T.map((x) => x.dept))].filter((d, i, a) => a.indexOf(d) === i && T.some((x) => x.dept === d));
  const streams = [...new Set(T.map((x) => x.stream))].sort((a, b) => Object.keys(APQR_STREAMS).indexOf(a) - Object.keys(APQR_STREAMS).indexOf(b));
  const dated = T.filter((x) => x.created != null || x.due != null);
  const from = dated.length ? Math.min(...dated.map((x) => x.created ?? x.due)) : X.refDate;
  const to = Math.max(X.refDate, ...dated.map((x) => x.due ?? x.created), P.reportDue ?? 0);
  const months = Math.max(4, Math.min(16, Math.ceil((to - from) / (30.4 * DAY)) + 1));
  const lc = ctx.m.x.lifecycle.find((l) => P.name.toUpperCase().includes(l.name.toUpperCase()));
  return [
    h("div.kpi-grid.six",
      kpi({ label: t("apqr_k_tasks"), value: fmtNum(P.total), hint: `${fmtNum(P.completed)} ${t("closed_lbl").toLowerCase()}`, accent: "var(--c1)" }),
      kpi({ label: t("k_open"), value: fmtNum(open.length), hint: P.bottleneck ? `${t("apqr_bottleneck_short")}: ${P.bottleneck}` : null }),
      kpi({ label: t("k_overdue"), value: fmtNum(overdue.length), status: overdue.length ? 1 : 3 }),
      kpi({ label: t("apqr_k_unassigned"), value: fmtNum(open.filter((x) => x.unassigned).length), accent: "var(--warning)" }),
      kpi({ label: t("apqr_wf_due"), value: P.wfDue != null ? fmtDate(P.wfDue) : "—", hint: P.stage ?? phaseName(P.phase) }),
      kpi({ label: t("apqr_report_due"), value: P.reportDue != null ? fmtDate(P.reportDue) : "—", hint: P.daysToReportDue != null ? `${P.daysToReportDue >= 0 ? "+" : ""}${fmtNum(P.daysToReportDue)} ${t("d")}` : null, accent: P.daysToReportDue != null && P.daysToReportDue < 0 && !P.approved ? "var(--critical)" : "var(--c3)" })),
    T.length ? card(t("apqr_lanes"), h("div.dept-lanes", { style: { "--n": depts.length } }, depts.map((d) => {
      const xs = T.filter((x) => x.dept === d).sort((a, b) => (a.done - b.done) || (a.due ?? 9e15) - (b.due ?? 9e15));
      const done = xs.filter((x) => x.done).length;
      return h("section.lane",
        h("header", h("b", d), h("small", `${fmtNum(done)}/${fmtNum(xs.length)}`), h("i.lane-bar", h("i", { style: { width: `${(done / xs.length) * 100}%` } }))),
        h("div.lane-cards", xs.map((x) => taskCard(ctx, x))));
    })), { sub: t("apqr_lanes_sub") }) : null,
    T.length ? card(t("apqr_task_timeline"), gantt([...T].sort((a, b) => APQR_DEPTS.indexOf(a.dept) - APQR_DEPTS.indexOf(b.dept) || (a.created ?? 0) - (b.created ?? 0)).map((x) => ({
      label: short(taskTitle(x), 38), sub: `${x.dept} · ${x.unassigned ? t("unassigned") : x["Assigned User"]}`, start: x.created ?? x.due, end: x.closed ?? x.due ?? x.created, mark: x.closed, color: taskColor(x),
      tip: `<b>${esc(taskTitle(x))}</b><div class="tip-row"><span>${esc(t("col_due"))}</span><b>${fmtDate(x.due)}</b></div><div class="tip-row"><span>${esc(t("col_status"))}</span><b>${esc(taskState(x))}</b></div>`,
      onclick: ctx.canEdit ? () => editTask(ctx, x) : null })), { from: Date.UTC(new Date(from).getUTCFullYear(), new Date(from).getUTCMonth(), 1), months, today: X.refDate }), { sub: t("apqr_task_timeline_sub") }) : null,
    h("div.grid.cols-2",
      card(t("apqr_streams_title"), streams.length ? h("div.stream-cards", streams.map((st) => {
        const xs = T.filter((x) => x.stream === st);
        const state = P.streamState[st];
        return h("section.stream-card", { style: { "--c": STATE_COLOR[state] ?? "var(--muted-mark)" } },
          h("header", h("b", st), h("small", `${APQR_STREAMS[st]?.[0] ?? xs[0]?.dept ?? ""} · ${APQR_STREAMS[st]?.[1] ?? ""}`), APQR_STREAMS[st]?.[2]?.length ? h("span.tag", `§ ${APQR_STREAMS[st][2].join(", ")}`) : null),
          h("ul", xs.map((x) => h("li", dot(taskColor(x), taskTitle(x)), h("small", [x.unassigned ? t("unassigned") : x["Assigned User"], x["Workflow Stage"], x.done ? (x.inferred ? tv("Closed (inferred)") : `${t("s_closed")} ${fmtDate(x.closed)}`) : `${t("col_due")} ${fmtDate(x.due)}`].filter(Boolean).join(" · "))))));
      })) : h("div.empty", t("apqr_not_triggered")), { span: 2 }),
      card(t("apqr_key_facts"), h("dl.deflist",
        [[t("dosage_form"), P.form], [t("site_lbl"), P.site], [t("col_code"), P.code], [t("period_lbl"), P.period], [t("planned_lbl"), P.planned != null ? fmtDate(P.planned).slice(3) : null],
          [t("apqr_prev_report"), P.prevReport], [t("apqr_report_due"), fmtDate(P.reportDue)], ["Scigeniq", P.refs.join(" · ")], [t("apqr_sys_status"), P.sysStatus],
          [t("apqr_wf_created"), fmtDate(P.wfCreated)], [t("apqr_wf_due"), fmtDate(P.wfDue)], [t("apqr_owner"), P.owner], [t("apqr_last_seen"), fmtDate(P.lastSeen)], [t("comment"), P.planComment]]
          .filter(([, v]) => v != null && v !== "" && v !== "—").flatMap(([k, v]) => [h("dt", k), h("dd", v)]))),
      card(t("apqr_dept_progress"), h("div.dept-rings", depts.map((d) => {
        const xs = T.filter((x) => x.dept === d), done = xs.filter((x) => x.done).length, od = xs.filter((x) => x.overdue).length;
        return h("div.dept-ring", ring(xs.length ? done / xs.length : null, { size: 74, color: od ? "var(--critical)" : done === xs.length ? "var(--good)" : "var(--c1)" }), h("b", d), h("small", od ? h("span.late", `${fmtNum(od)} ${t("k_overdue").toLowerCase()}`) : `${fmtNum(done)}/${fmtNum(xs.length)}`));
      })), { sub: t("apqr_dept_progress_sub") })),
    P.dupTasks.length ? card(t("apqr_dup_tasks"), dataTable(cols(ctx, ["Reference ID", "dept", "Task Title", "status", "Assigned User", "due"]), P.dupTasks, { pageSize: 10, search: false }), { sub: t("apqr_dup_tasks_sub") }) : null,
    lc ? h("p", h("button.btn", { type: "button", onclick: () => { ctx.state.apqrProduct = lc.name; ctx.set("apqrTab", "report"); ctx.go("apqr"); } }, icon("report", 15), t("apqr_open_builder"))) : null,
  ];
}

function taskCard(ctx, x) {
  const late = x.overdue;
  return h(ctx.canEdit ? "button.task-card" : "div.task-card", { type: ctx.canEdit ? "button" : null, style: { "--c": taskColor(x) }, onclick: ctx.canEdit ? () => editTask(ctx, x) : null },
    h("span.tc-title", taskTitle(x)),
    h("span.tc-meta", h("span.tag", x.stream), x["Workflow Stage"] ? h("small", x["Workflow Stage"]) : null),
    h("span.tc-foot",
      x.unassigned ? h("span.warn-text", t("unassigned")) : h("span", x["Assigned User"]),
      h(late ? "b.late" : "small", x.done ? (x.inferred ? tv("Closed (inferred)") : `✔ ${fmtDate(x.closed)}`) : fmtDate(x.due))),
    x.Comment ? h("span.tc-note", x.Comment) : null);
}

// ---------- tasks: editable list, quick close, add and bulk insert ----------
function cols(ctx, keys) {
  const all = [
    { key: "Reference ID", label: t("col_ref"), cls: "mono nowrap" },
    { key: "dept", label: t("col_dept") },
    { key: "stream", label: t("apqr_stream") },
    { key: "Task Title", label: t("col_title"), cls: "wrap", render: (x) => h("span", taskTitle(x), x.Comment ? h("small.block.muted", x.Comment) : null) },
    { key: "Workflow Stage", label: t("col_stage") },
    { key: "status", label: t("col_status"), sort: (x) => (x.done ? 2 : x.overdue ? 0 : 1), render: (x) => dot(taskColor(x), taskState(x)) },
    { key: "Assigned User", label: t("col_owner"), cls: "nowrap", render: (x) => (x.unassigned ? h("span.warn-text", t("unassigned")) : x["Assigned User"]) },
    { key: "due", label: t("col_due"), cls: "num nowrap", render: (x) => (x.overdue ? h("b.late", fmtDate(x.due)) : fmtDate(x.due)) },
    { key: "daysToDue", label: t("days_left"), cls: "num", render: (x) => (x.daysToDue == null ? "" : x.daysToDue < 0 ? h("b.late", fmtNum(x.daysToDue)) : fmtNum(x.daysToDue)) },
    { key: "closed", label: t("s_closed"), cls: "num nowrap", render: (x) => fmtDate(x.closed) },
    { key: "act", label: "", render: (x) => (ctx.canEdit && x.open ? h("button.btn.compact.ghost", { type: "button", title: t("apqr_close_task"), onclick: (e) => { e.stopPropagation(); closeTask(ctx, x); } }, icon("check", 14)) : null) },
  ];
  return all.filter((c) => keys.includes(c.key));
}
function tasksTab(ctx, X, P) {
  const f = ctx.state.apqrPTaskF ?? "all";
  const L = P.tasks.filter((x) => f === "all" || (f === "open" ? x.open : f === "overdue" ? x.overdue : f === "unassigned" ? x.open && x.unassigned : x.done));
  return [
    h("div.filters-row", segmented([["all", `${t("filter_all")} · ${fmtNum(P.total)}`], ["open", `${t("k_open")} · ${fmtNum(P.open)}`], ["overdue", `${t("k_overdue")} · ${fmtNum(P.overdue)}`],
      ["unassigned", `${t("unassigned")} · ${fmtNum(P.tasks.filter((x) => x.open && x.unassigned).length)}`], ["closed", `${t("s_closed")} · ${fmtNum(P.completed)}`]], f, (v) => ctx.set("apqrPTaskF", v), t("col_status"))),
    card(`${t("apqr_tab_tasks")} · ${fmtNum(L.length)}`, P.tasks.length
      ? dataTable(cols(ctx, ["Reference ID", "dept", "stream", "Task Title", "Workflow Stage", "status", "Assigned User", "due", "daysToDue", "closed", "act"]),
        [...L].sort((a, b) => (a.done - b.done) || (a.due ?? 9e15) - (b.due ?? 9e15)), { pageSize: 40, onRow: ctx.canEdit ? (x) => editTask(ctx, x) : null, searchText: (x) => `${x["Task Title"]} ${x["Assigned User"]} ${x.dept} ${x.stream} ${x.Comment ?? ""}`, exportName: `apqr-${P.code ?? "tasks"}` })
      : h("div.empty", t("apqr_no_tasks_yet")), { sub: ctx.canEdit ? t("apqr_tasks_edit_sub") : null }),
  ];
}
function editTask(ctx, x) { ctx.edit("apqrTasks", x.__key, `${taskTitle(x)} · ${x["Reference ID"]}`); }
function closeTask(ctx, x) {
  ctx.saveObj("apqrTasks", x.__key, { Status: "Completed", Closure: "Closed", "Closed On": isoToday(), "Workflow Stage": x.isWorkflow ? x["Workflow Stage"] : "Completed" });
}
function taskDefaults(P) {
  return { "Reference ID": P.mainRef, Product: P.productLabel, "Dosage Form": P.form !== "—" ? P.form : null, Site: P.site, Status: "Open", Closure: "Not Closed", "Workflow Stage": "Collecting Data", Created: isoToday(), Start: isoToday() };
}
function addTask(ctx, P) { ctx.addWith("apqrTasks", taskDefaults(P), P.name); }
function bulkTasks(ctx, P) {
  openBulk(ctx, "apqrTasks", { title: `${t("bulk_insert")} · ${short(P.name, 40)}`, defaults: taskDefaults(P), keyCols: ["Reference ID", "Task Title"] });
}

// ---------- EU GMP Ch.1.10 review sections ----------
function sectionsTab(ctx, X, P) {
  const streamsFor = (id) => Object.entries(APQR_STREAMS).filter(([, v]) => v[2].includes(id)).map(([k]) => k);
  const lang = FR() ? 2 : 1;
  const done = P.sections.filter((s) => /complete|not applicable/i.test(s.Status ?? "")).length;
  return [
    h("div.section-progress", h("b", `${fmtNum(done)} / ${APQR_SECTIONS.length}`), h("span", t("apqr_sections_done")), pctBar(done / APQR_SECTIONS.length, "var(--good)")),
    h("div.section-grid", APQR_SECTIONS.map((sct, i) => {
      const s = P.sections.find((x) => x.id === sct[0]) ?? {};
      const st = s.Status ?? "Not started";
      const ev = streamsFor(sct[0]).map((k) => [k, P.streamState[k]]).filter(([, v]) => v);
      return h("section.sec-card", { style: { "--c": SECTION_COLOR[st] ?? "var(--muted-mark)", "--i": i } },
        h("header", h("span.sec-n", sct[0]), h("b", sct[lang])),
        ev.length ? h("div.sec-ev", ev.map(([k, v]) => dot(STATE_COLOR[v], `${k} · ${tv(v === "done" ? "Completed" : v === "overdue" ? "Overdue" : "Open")}`))) : h("small.muted", t("apqr_sec_no_stream")),
        h("div.sec-status", ["Not started", "In progress", "Complete", "Not applicable"].map((v) => h(ctx.canEdit ? "button.s-pick" : "span.s-pick", {
          type: ctx.canEdit ? "button" : null, class: v === st ? "on" : "", style: { "--c": SECTION_COLOR[v] },
          onclick: ctx.canEdit && v !== st ? () => saveSection(ctx, P, sct[0], s, { Status: v }) : null }, tv(v)))),
        s.Owner || s.Comment || s.Evidence || s.Due ? h("dl.deflist.compact", [[t("col_owner"), s.Owner], [t("col_due"), fmtDate(toDay(s.Due))], [t("apqr_evidence"), s.Evidence], [t("comment"), s.Comment]]
          .filter(([, v]) => v).flatMap(([k, v]) => [h("dt", k), h("dd", v)])) : null,
        h("footer", s.Updated ? h("small.muted", `${t("updated_lbl")} ${fmtDate(toDay(s.Updated))}`) : h("span"),
          ctx.canEdit ? h("button.btn.compact.ghost", { type: "button", onclick: () => (s.__key ? ctx.edit("apqrSections", s.__key, `(${sct[0]}) ${P.name}`) : ctx.addWith("apqrSections", { Product: P.name, Section: sct[0], Status: st, Updated: isoToday() }, `(${sct[0]}) ${P.name}`)) }, icon("edit", 14), t("edit")) : null));
    })),
    ctx.canEdit ? h("p.fine", t("apqr_sections_note")) : null,
  ];
}
function saveSection(ctx, P, id, s, patch) {
  ctx.saveObj("apqrSections", s.__key ?? null, { Product: P.name, Section: id, ...patch, Updated: isoToday() });
}

// ---------- decision and approval ----------
function decisionTab(ctx, X, P) {
  const r = P.record;
  const dataDone = P.tasks.filter((x) => !x.isWorkflow).length > 0 && P.tasks.filter((x) => !x.isWorkflow).every((x) => x.done);
  const secsDone = P.sections.every((s) => /complete|not applicable/i.test(s.Status ?? ""));
  const checks = [
    [t("apqr_chk_data"), dataDone, `${fmtNum(P.tasks.filter((x) => !x.isWorkflow && x.done).length)}/${fmtNum(P.tasks.filter((x) => !x.isWorkflow).length)}`],
    [t("apqr_chk_sections"), secsDone, `${fmtNum(P.sections.filter((s) => /complete|not applicable/i.test(s.Status ?? "")).length)}/${APQR_SECTIONS.length}`],
    [t("apqr_chk_capa"), Boolean(r?.["CAPA required"] && r["CAPA required"] !== "Not yet decided"), r?.["CAPA required"] ? tv(r["CAPA required"]) : "—"],
    [t("apqr_chk_prev_capa"), Boolean(r?.["Previous CAPA status"]), r?.["Previous CAPA status"] ? short(r["Previous CAPA status"], 40) : "—"],
    [t("apqr_chk_conclusion"), Boolean(r?.Conclusion), r?.Conclusion ? short(r.Conclusion, 40) : "—"],
    [t("apqr_chk_report"), Boolean(r?.["Report ref"]), r?.["Report ref"] ?? "—"],
  ];
  const ready = checks.every(([, ok]) => ok);
  const history = [...P.tasks, ...P.dupTasks, ...P.sections.filter((s) => s.__key), ...(r ? [r] : [])].filter((x) => x.__edit).sort((a, b) => String(b.__edit.at).localeCompare(String(a.__edit.at))).slice(0, 25);
  let armed = false;
  const approveBtn = ctx.canEdit && r?.__key && !P.approved ? h("button.btn.primary", {
    type: "button",
    onclick: () => {
      if (!armed) { armed = true; approveBtn.textContent = t("apqr_approve_confirm"); setTimeout(() => { armed = false; approveBtn.textContent = t("apqr_approve_today"); }, 4000); return; }
      ctx.saveObj("apqr", r.__key, { Status: "Approved", "Approved on": isoToday() });
    },
  }, t("apqr_approve_today")) : null;
  return h("div.grid.cols-2",
    card(t("apqr_readiness_check"), h("div",
      h("ul.check-list", checks.map(([label, ok, v]) => h("li", { class: ok ? "ok" : "" }, h("i", ok ? "✔" : "•"), h("span", label), h("small", v)))),
      h("p", { class: `cap-verdict ${P.approved ? "ok" : ready ? "ok" : "watch"}` }, P.approved ? `${t("apqr_approved")} · ${fmtDate(P.approved)}` : ready ? t("apqr_ready") : t("apqr_not_ready")),
      h("div.form-actions", ctx.canEdit ? h("button.btn", { type: "button", onclick: () => editRecord(ctx, P) }, icon(r ? "edit" : "plus", 15), r ? t("apqr_edit_record") : t("apqr_create_record")) : null, approveBtn)), { sub: t("apqr_readiness_check_sub") }),
    card(t("apqr_record"), r ? h("dl.deflist",
      [[t("col_status"), tv(r.status ?? r.Status)], [t("period_lbl"), r.Period], [t("col_due"), fmtDate(r.due)], [t("col_owner"), r.Owner], [t("capa_required"), r["CAPA required"] ? tv(r["CAPA required"]) : null], [t("apqr_prev_capa"), r["Previous CAPA status"]],
        [t("conclusion_lbl"), r.Conclusion], [t("approved_on"), fmtDate(r.approved)], ["Report", r["Report ref"]], [t("comment"), r.Comment]]
        .filter(([, v]) => v).flatMap(([k, v]) => [h("dt", k), h("dd", v)])) : h("div.empty", t("apqr_no_record")), { sub: t("apqr_record_sub") }),
    card(t("recent_changes"), history.length ? h("ul.changes", history.map((x) => h("li",
      h(`span.chg.${x.__edit.row == null ? "deleted" : x.__edit.key?.startsWith("n-") ? "added" : "changed"}`, t(x.__edit.row == null ? "chg_deleted" : x.__edit.key?.startsWith("n-") ? "chg_added" : "chg_changed")),
      h("div", h("span", x["Task Title"] != null ? taskTitle(x) : (x.Section ? `(${x.Section}) ${tv(x.Status ?? "")}` : t("apqr_record"))), h("small", x["Reference ID"] ?? "")),
      h("small.muted", `${fmtDate(toDay(String(x.__edit.at).slice(0, 10)))} · ${ctx.who(x.__edit.by)}`)))) : h("div.empty", t("no_changes")), { span: 2 }));
}
