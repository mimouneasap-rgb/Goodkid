// Export the tracker as an Excel workbook laid out like the master tracker
// (header row 4, data from row 5, the same sheet and column names), so the
// file opens cleanly in Excel and can be imported back into the app.
import { writeXlsx, S } from "./xlsx.js";
import { DEPARTMENTS, DEPT_SHORT, MOVEMENT_METRICS, monthLabel } from "./engine.js";

const h = (v) => ({ v, s: S.header });
const pct = (v) => ({ v, s: S.pct });
const d = (v) => (v ? { v: v.slice(0, 10), s: S.date } : "");
const dt = (v) => (v ? { v, s: v.length > 10 ? S.datetime : S.date } : "");
const title = (v) => ({ v, s: S.title });
const note = (v) => ({ v, s: S.note });
const bold = (v) => ({ v, s: S.bold });

export async function buildWorkbook(state, model) {
  const k = model.kpi;
  const generated = new Date().toISOString().slice(0, 16).replace("T", " ");
  const bl = state.baseline;
  const prog = state.meta.programme || "APQR Master Tracker";

  const readMe = [
    [],
    ["", title(`READ ME - ${prog}`)],
    ["", note(`Exported from the APQR Master Tracker web app on ${generated}. Values are calculated by the app; re-import this file into the app to continue editing.`)],
    [],
    ["", bold("Source"), state.meta.source || "Entered in the app"],
    ["", bold("Report date"), d(model.report)],
    ["", bold("Planned PQR month"), "The month after a product's review period closes (APQR plan)."],
    ["", bold("PQR overdue date"), `1st of the planned PQR month + ${model.settings.overdueMonths} months. Every annexe of a product shares this due date.`],
    ["", bold("% complete"), "Closed data-collection tasks / all data-collection tasks. Approval signatures and the parent workflow are counted separately."],
    ["", bold("RAG"), `COMPLETE = workflow closed or all data tasks closed; OVERDUE = an overdue data task or the PQR overdue date has passed; DUE SOON = workflow due date or PQR overdue date within ${model.settings.dueSoonDays} days; ON TRACK = everything else.`],
  ];

  const dash = [
    [],
    ["", title(`${prog.toUpperCase()} - MASTER TRACKING DASHBOARD`)],
    ["", note(`${state.meta.organisation || ""}${state.meta.planRef ? "  -  Plan " + state.meta.planRef : ""}  -  data as at ${monthLabel(model.report) && model.report.split("-").reverse().join("/")}`)],
    [],
    ["", "Report date (edit me)", { v: model.report, s: S.date }],
    ["", "PQR overdue after (months from start of planned month)", model.settings.overdueMonths],
    ["", '"Due soon" threshold (days)', model.settings.dueSoonDays],
    [],
    ["", h("PROGRAMME vs PLAN"), h(""), "", "", h("EXECUTION (data-collection tasks)"), h("")],
    ["", "Products in approved plan", k.planned, "", "", "Data-collection tasks", k.dataTasks],
    ["", "Workflows triggered in Scigeniq", k.triggered, "", "", "Completed (closed)", k.completed],
    ["", "Not yet triggered", k.notTriggered, "", "", "Open", k.open],
    ["", "% of plan triggered", pct(k.planTriggered), "", "", "Overall completion", pct(k.completion)],
    ["", "Not triggered & past report due", k.notTriggeredPastDue, "", "", "Overdue tasks", k.overdueTasks],
    ["", `Not triggered & due within ${model.settings.triggerWindowDays} d`, k.notTriggeredDueSoon, "", "", "Unassigned tasks", k.unassigned],
    ["", "Duplicate workflows still open", k.duplicates, "", "", "Products with overdue tasks", k.productsOverdue],
    [],
  ];
  if (bl) {
    dash.push(["", h(`MOVEMENT SINCE PREVIOUS EXTRACT (${bl.label} -> ${model.report.split("-").reverse().join("/")})`), h(""), h(""), h("")]);
    dash.push(["", bold("Metric"), bold(bl.label), bold("Now"), bold("Change")]);
    for (const [key, label] of MOVEMENT_METRICS) {
      const b = bl.metrics?.[key];
      dash.push(["", label, b ?? "", model.movementCurrent[key], b === undefined ? "" : model.movementCurrent[key] - b]);
    }
    dash.push([]);
  }
  dash.push(["", h("QUALITY SIGNALS"), h("")]);
  for (const [label, v] of [["Approval signatures recorded", k.approvals], ["Approvals rejected", k.rejected], ["Workflows closed out (complete)", k.closedOut], ["Products at 100% data collection", k.at100], ["Products new since baseline", k.newSince], ["Oncology-site products in scope", k.oncology], ["Tasks flagged Medium/High criticality", k.elevatedCriticality], ["Workflows closed with open annexes", k.closedWithOpen]]) dash.push(["", label, v]);
  dash.push([]);
  dash.push(["", h("PRODUCTS BY RAG STATUS"), h("")]);
  for (const r of ["COMPLETE", "ON TRACK", "DUE SOON", "OVERDUE"]) dash.push(["", r, model.ragCounts[r]]);
  dash.push([]);
  dash.push(["", h("DATA TASKS BY DEPARTMENT"), h("Completed"), h("Open"), h("Overdue")]);
  for (const x of model.byDept) dash.push(["", x.dept, x.completed, x.open, x.overdue]);
  dash.push([]);
  dash.push(["", h("PROGRESS BY PLANNED PQR MONTH"), h("Products planned"), h("Workflows triggered"), h("Annexes raised"), h("% annexes complete"), h("Overdue from"), h("Status")]);
  for (const m of model.months) dash.push(["", d(m.month), m.planned, m.triggered, m.annexes, pct(m.pct), d(m.overdueFrom), m.status]);

  const trackerHdr = ["APQR Ref", "Product", "Dosage Form", "Site", "APQR Owner", "Workflow Stage", "Workflow Status", "Workflow Due", "# Work-flows", "Flag", "New Since Baseline", "Data Tasks", "Com-pleted", "Open", "Over-due", "% Complete", `Prev % (${bl?.label || "baseline"})`, "Move-ment", "Days to Due", "RAG Status", ...DEPARTMENTS.map((x) => DEPT_SHORT[x]), "Bottleneck", "Approvals Signed", "Re-jected", "Planned PQR Month", "PQR Overdue Date", "Days to Overdue", "Plan Review Start", "Plan Review End", "Workflow Refs", "QC Annexe Refs (QCTAB)", "QA Comments / Actions", "Priority"];
  const tracker = [
    [title("MASTER APQR TRACKER - one row per product under review")],
    [note("Exported from the APQR Master Tracker web app. % Complete counts data-collection tasks only.")],
    [],
    trackerHdr.map(h),
    ...model.products.map((p) => [
      p.ref, p.product, p.dosageForm, p.site, p.owner, p.wfStage, p.wfStatus, dt(p.wfDue), p.nWorkflows, p.flags.join(" "), p.isNew ? "NEW" : "",
      p.dataTasks, p.completed, p.open, p.overdue, pct(p.pct), p.prevPct === null ? "" : pct(p.prevPct), p.movement, p.daysToDue ?? "", p.rag,
      ...DEPARTMENTS.map((x) => p.openByDept[x]), p.bottleneck === "-" || p.bottleneck === "several" ? p.bottleneck : DEPT_SHORT[p.bottleneck], p.approvals, p.rejected,
      d(p.plannedMonth), d(p.overdueDate), p.daysToOverdue ?? "", p.reviewStart || "not in plan", p.reviewEnd || "not in plan", p.workflowRefs.join(" / "), p.qcRefs.join(" / "), p.comments, p.priority,
    ]),
  ];

  const plan = [
    [title("APQR PLAN - approved product scope")],
    [note("Planned PQR Month = month after the review period closes. Overdue Date = 1st of that month + the overdue months setting.")],
    [],
    ["#", "Product", "Process", "Exec. Year", "Site", "Review Start", "Review End", "Period End (date)", "Planned PQR Month", "Plan Status", "Workflow Triggered?", "Data Tasks", "Completed", "% Complete", "Overdue Date", "Days to Overdue", "Tracking Status"].map(h),
    ...model.plan.map((p) => [p.no, p.product, p.process, p.execYear, p.site, p.reviewStart, p.reviewEnd, d(p.periodEnd), d(p.plannedMonth), p.planStatus, p.triggered ? "Yes" : "No", p.dataTasks, p.completed, pct(p.pct), d(p.overdueDate), p.daysToOverdue ?? "", p.tracking]),
  ];

  const tasks = [
    [title("APQR TASK REGISTER - source data")],
    [note('"Due" is the parent APQR\'s due date; the task\'s own Scigeniq end date is kept in the last column.')],
    [],
    ["Reference ID", "Product", "Dosage Form", "Site", "Department", "Data Stream", "Task Class", "Task Type", "Task Title", "Workflow Stage", "Status", "Assigned User", "Criticality", "Created", "Start", "Due (parent APQR)", "Closed On", "Closure", "Created By", "Days to Due", "Overdue?", "Ageing (days)", "Department (house)", "Planned PQR Month", "Task End Date (Scigeniq)"].map(h),
    ...model.tasks.map((t) => [t.ref, t.product, t.dosageForm, t.site, t.department, t.stream, t.taskClass, t.taskType, t.title, t.stage, t.status, t.assignee, t.criticality, dt(t.created), dt(t.start), d(t.due), dt(t.closedOn), t.closure, t.createdBy, t.daysToDue ?? "", t.overdue, t.ageing ?? "", t.isData ? `${t.dept} Department` : "", d(t.plannedMonth), dt(t.taskEnd)]),
  ];

  const workload = [
    [title("WORKLOAD BY ASSIGNED USER")],
    [note("Data-collection tasks only; approval signatures are counted separately.")],
    [],
    ["Assigned User", "Data Tasks", "Completed", "Open", "Overdue", "% Complete", "Approvals Signed", "Earliest Open Due Date", "Status"].map(h),
    ...model.workload.map((o) => [o.user, o.dataTasks, o.completed, o.open, o.overdue, pct(o.pct), o.approvals, d(o.earliestDue), o.status]),
  ];

  const annex = [[title("ACTUAL APQR ANNEXES PROGRESS - by planned PQR month")], [note("Department x current stage, as % of each department's own total.")], []];
  for (const m of model.months) {
    const st = m.matrix.stages;
    annex.push(["", bold(`Actual APQR Annexes Progress for (${monthLabel(m.month)})`)]);
    annex.push(["", "Products planned", m.planned, "Workflows triggered", m.triggered, "Annexes raised", m.annexes, "Overdue from", d(m.overdueFrom), m.status]);
    annex.push(["", h("Department"), ...st.map(h), h("Total"), ...st.map((s) => h(`# ${s}`))]);
    for (const r of [...m.matrix.rows, { ...m.matrix.total, dept: "Total general" }]) {
      annex.push(["", r.dept === "Total general" ? bold(r.dept) : `${r.dept} Department`, ...st.map((s) => pct(r.total ? r.counts[s] / r.total : 0)), r.total, ...st.map((s) => r.counts[s])]);
    }
    annex.push([]);
  }

  const excluded = [
    [title("NON-APQR TASKS PRESENT IN THE EXPORT (excluded from all APQR metrics)")], [], [],
    ["Reference ID", "Type", "Stage", "Status", "Title", "Parent action", "Assigned User", "Closing date", "Reason"].map(h),
    ...state.excluded.map((x) => [x.ref, x.type, x.stage, x.status, x.title, x.parent, x.assignee, dt(x.closingDate), x.reason]),
  ];

  const audit = [
    [title("AUDIT TRAIL - changes made in the app")], [], [],
    ["When (UTC)", "User", "Entity", "Item", "Field", "From", "To"].map(h),
    ...state.audit.map((a) => [a.at.replace("T", " ").slice(0, 19), a.user, a.entity, a.label || a.key || "", a.field || "", String(a.from ?? ""), String(a.to ?? "")]),
  ];

  return writeXlsx([
    { name: "Read Me", rows: readMe, widths: [2, 28, 120] },
    { name: "Dashboard", rows: dash, widths: [2, 44, 14, 14, 14, 34, 14, 22] },
    { name: "APQR Tracker", rows: tracker, widths: [14, 60, 13, 12, 18, 16, 14, 16, 8, 16, 10, 8, 8, 8, 8, 10, 10, 9, 9, 12, 6, 6, 6, 6, 6, 6, 11, 9, 8, 12, 12, 10, 11, 11, 30, 40, 50, 10], freeze: 5 },
    { name: "APQR Plan 2026", rows: plan, widths: [6, 60, 13, 9, 12, 11, 11, 12, 12, 11, 10, 9, 9, 10, 12, 10, 26], freeze: 5 },
    { name: "Task Register", rows: tasks, widths: [14, 50, 12, 10, 12, 12, 14, 26, 32, 14, 10, 20, 9, 16, 16, 12, 16, 10, 16, 8, 8, 8, 20, 12, 16], freeze: 5 },
    { name: "Owner Workload", rows: workload, widths: [26, 10, 10, 8, 8, 10, 12, 14, 22], freeze: 5 },
    { name: "Annexes Progress", rows: annex, widths: [2, 30, 14, 14, 14, 14, 14, 14, 14, 22] },
    { name: "Excluded Tasks", rows: excluded, widths: [14, 18, 14, 12, 40, 50, 20, 14, 30], freeze: 5 },
    { name: "Audit Trail", rows: audit, widths: [20, 18, 10, 50, 16, 24, 24], freeze: 5 },
  ]);
}

export function backupJson(state) {
  return new Blob([JSON.stringify({ app: "apqr-master-tracker", exportedAt: new Date().toISOString(), state }, null, 1)], { type: "application/json" });
}
