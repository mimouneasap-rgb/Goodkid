// Export the tracker as an Excel workbook in the APQR Master Tracker v3 layout
// (header row 4, data from row 5, the same sheet and column names), so it
// opens like the workbook and can be imported back into the app.
import { writeXlsx, S } from "./xlsx.js";
import { DEPARTMENTS, SLOTS, MOVEMENT_METRICS, FINAL_QA_SIGNALS, monthLabel } from "./engine.js";

const h = (v) => ({ v, s: S.header });
const pct = (v) => ({ v, s: S.pct });
const d = (v) => (v ? { v: v.slice(0, 10), s: S.date } : "");
const dt = (v) => (v ? { v, s: v.length > 10 ? S.datetime : S.date } : "");
const title = (v) => ({ v, s: S.title });
const note = (v) => ({ v, s: S.note });
const bold = (v) => ({ v, s: S.bold });
const dmy = (iso) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "");

export async function buildWorkbook(state, model) {
  const k = model.kpi;
  const generated = new Date().toISOString().slice(0, 16).replace("T", " ");
  const bl = state.baseline;
  const prog = state.meta.programme || "APQR Master Tracker";

  const readMe = [
    [],
    ["", title(`READ ME - ${prog}`)],
    ["", note(`Exported from the APQR Master Tracker app on ${generated}. Values are calculated by the app; import this file back into the app to continue.`)],
    [],
    ["", bold("Source"), state.meta.source || "Entered in the app"],
    ["", bold("Report date"), d(model.report)],
    ["", bold("The ten required annexes"), "Compliance, IPC, Process, QA, QC, QC OOS/OOT, RA, Supplier Qualification, Validation Metrology and Validation Process. A slot is OK when at least one of its tasks is closed, open when raised but not closed, MISSING when never raised."],
    ["", bold("Shared QA stream"), "Scigeniq files several annexes under the task type \"QA Data Collection\". The task title names the owning department (CM = Compliance, Supplier = Supplier Qualification, VL = Validation Process, QC OOS/OOT = QC)."],
    ["", bold("Final QA compilation"), "Raised by the APQR Owner once all ten annexes are closed. A review is COMPLETE when its Final QA is closed."],
    ["", bold("Untriggered workload"), "A planned PQR with no workflow carries its workflow, ten annexes and Final QA at \"Not triggered\" (Record Source = Generated from plan), so totals cover the full required workload."],
    ["", bold("Planned PQR month"), "The month after the review period closes."],
    ["", bold("PQR overdue date"), `1st of the planned PQR month + ${model.settings.overdueMonths} months.`],
    ["", bold("RAG"), `Not triggered: NOT STARTED - overdue / Not yet due. Triggered: COMPLETE (Final QA closed) > OVERDUE (past the PQR overdue date) > DUE SOON (within ${model.settings.dueSoonDays} days) > ON TRACK.`],
  ];

  const dash = [
    [],
    ["", title(`${prog.toUpperCase()} - MASTER TRACKING DASHBOARD`)],
    ["", note(`${state.meta.organisation || ""}${state.meta.planRef ? `   -   APQR Plan (${state.meta.planRef})` : ""}   -   report date ${dmy(model.report)}`)],
    [],
    ["", "Report date (edit me)", { v: model.report, s: S.date }],
    ["", "PQR overdue after (months from start of planned month)", model.settings.overdueMonths],
    ["", '"Due soon" threshold (days)', model.settings.dueSoonDays],
    [],
    ["", h("PROGRAMME vs PLAN"), h(""), "", "", h("REQUIRED ANNEXE WORKLOAD"), h("")],
    ["", "Products in approved plan", k.planned, "", "", "Required annexes across the plan", k.requiredAnnexes],
    ["", "Workflows triggered", k.triggered, "", "", "Closed", k.annexClosed],
    ["", "Never triggered", k.notTriggered, "", "", "Open (raised, not closed)", k.annexOpen],
    ["", "% of plan triggered", pct(k.planTriggered), "", "", "Not yet raised (plan workload)", k.annexNotRaised],
    ["", "Never triggered & already overdue", k.notStartedOverdue, "", "", "Overall completion", pct(k.completion)],
    ["", "Products overdue (triggered)", k.productsOverdue, "", "", "Overdue annexes", k.overdueAnnexes],
    ["", "Products complete", k.productsComplete, "", "", "Unassigned annexes", k.unassignedAnnexes],
    [],
    ["", h("FINAL QA COMPILATION"), h(""), "", "", h("PARENT WORKFLOW"), h("")],
    ["", "Complete", k.fqComplete, "", "", "Closed out", k.closedOut],
    ["", "Raised, not complete", k.fqRaised, "", "", "In data collection", k.inDataCollection],
    ["", "DATA READY, NEVER RAISED", k.fqReady, "", "", "Never triggered", k.notTriggered],
    ["", "Waiting on data collection", k.fqWaiting, "", "", "Triggered, not yet data-complete", k.notDataComplete],
    ["", "Workflow not triggered at all", k.fqNotTriggered, "", "", "Final QA closed with an annexe gap", k.gaps],
    [],
    ["", h("REQUIRED ANNEXES BY DEPARTMENT"), h("Closed"), h("Open"), h("Not raised"), h("Required annexe"), h("OK"), h("open"), h("MISSING")],
  ];
  for (let i = 0; i < Math.max(DEPARTMENTS.length, SLOTS.length); i++) {
    const dep = model.byDept[i];
    const sl = model.bySlot[i];
    dash.push(["", dep ? dep.dept : "", dep ? dep.closed : "", dep ? dep.open : "", dep ? dep.notRaised : "", sl ? sl.label : "", sl ? sl.ok : "", sl ? sl.open : "", sl ? sl.missing : ""]);
  }
  dash.push([]);
  if (bl) {
    dash.push(["", h(`MOVEMENT SINCE PREVIOUS EXTRACT (${bl.label} -> ${dmy(model.report)})`), h(""), h(""), h("")]);
    dash.push(["", bold("Metric"), bold(bl.label), bold("Now"), bold("Change")]);
    for (const [key, label] of MOVEMENT_METRICS) {
      const b = bl.metrics?.[key];
      dash.push(["", label, b ?? "", model.movementCurrent[key], b === undefined ? "" : model.movementCurrent[key] - b]);
    }
    dash.push([]);
  }
  dash.push(["", h("PROGRESS BY PLANNED PQR MONTH"), h("Products planned"), h("Triggered"), h("Required annexes"), h("% complete"), h("Overdue from"), h("Status")]);
  for (const m of model.months) dash.push(["", d(m.month), m.planned, m.triggered, m.annexes, pct(m.pct), d(m.overdueFrom), m.status]);

  const trackerHdr = ["APQR Ref", "Product", "Dosage Form", "Site", "Triggered", "Workflow Stage", "APQR Owner", "Planned PQR Month", "PQR Overdue Date", "Days to Overdue", ...SLOTS.map((s) => s.short), "Annexes Complete", "% Annexes", "Open Annexes", "Final QA", "Final QA Signal", "Annexe Gap", "RAG Status", "Approvals", "In Plan", "Plan Review Start", "Plan Review End", "Workflow Refs", "QC Annexe Refs (QCTAB)", "Flags", `Prev % (${bl?.label || "baseline"})`, "QA Comments / Actions", "Priority"];
  const tracker = [
    [title(`MASTER APQR TRACKER - one row per planned product (data as at ${dmy(model.report)})`)],
    [note("The ten slot columns are the required departmental annexes: OK = closed, open = raised but not closed, MISSING = never raised. \"Final QA\" is the compilation the APQR Owner raises once all ten are closed.")],
    [],
    trackerHdr.map(h),
    ...model.products.map((p) => [
      p.ref, p.product, p.dosageForm, p.site, p.triggered ? "Yes" : "No", p.wfStage, p.owner, d(p.plannedMonth), d(p.overdueDate), p.daysToOverdue ?? "",
      ...SLOTS.map((s) => (p.slots[s.key].status === "Not triggered" ? "MISSING" : p.slots[s.key].status)),
      p.slotsOk, pct(p.pct), p.annexOpen, p.finalQa, p.fqSignal, p.gap ? "FINAL QA CLOSED WITH GAP" : "", p.rag, p.approvals, p.inPlan ? "Yes" : "No",
      p.reviewStart || "not in plan", p.reviewEnd || "not in plan", p.workflowRefs.join(" / "), p.qcRefs.join(" / "), p.flags.join(" "), p.prevPct === null ? "" : pct(p.prevPct), p.comments, p.priority,
    ]),
  ];

  const ready = model.products.filter((p) => p.fqSignal === "NOT TRIGGERED - data ready");
  const finalQa = [
    [title("FINAL QA DATA COLLECTION - the compilation step")],
    [note("Once all ten departmental annexes are closed, the APQR Owner compiles them into the Final QA Data Collection.")],
    [],
    ["", h("Final QA signal"), h("Products"), h("% of plan")],
    ...FINAL_QA_SIGNALS.map((sig) => ["", sig, model.fqCounts[sig], pct(model.products.length ? model.fqCounts[sig] / model.products.length : 0)]),
    [],
    ["", h("PRODUCTS WHERE DATA COLLECTION IS COMPLETE BUT FINAL QA WAS NEVER RAISED")],
    ["", h("APQR Ref"), h("Product"), h("Dosage Form"), h("Planned PQR Month"), h("PQR Overdue Date"), h("Days overdue"), h("APQR Owner")],
    ...ready.map((p) => ["", p.ref, p.product, p.dosageForm, d(p.plannedMonth), d(p.overdueDate), p.daysToOverdue === null ? "" : -p.daysToOverdue, p.owner]),
  ];

  const workflow = [
    [title("PARENT APQR WORKFLOW PROGRESS - where each product review stands")],
    [note("Lifecycle stage of the parent workflow across the plan and by planned PQR month, including planned PQRs never triggered.")],
    [],
    ["", h("Workflow stage"), h("Products"), h("% of plan")],
    ...model.workflowStages.map((x) => ["", x.stage, x.n, pct(model.plan.length ? x.n / model.plan.length : 0)]),
    [],
    ["", h("Planned month"), h("Planned"), h("Triggered"), h("Not triggered"), h("In data collection"), h("Closed"), h("% closed")],
    ...model.months.map((m) => ["", d(m.month), m.planned, m.triggered, m.planned - m.triggered, m.inDataCollection, m.closedOut, pct(m.planned ? m.closedOut / m.planned : 0)]),
  ];

  const annex = [[title("ACTUAL APQR ANNEXES PROGRESS - by planned PQR month and required department")], [note("The ten required annexes of the products planned for each month, by owning department and current stage, as % of each department's total. Untriggered PQRs are included at \"Not triggered\".")], []];
  for (const m of model.months) {
    const st = m.matrix.stages;
    annex.push(["", bold(`Actual APQR Annexes Progress for (${monthLabel(m.month)})`)]);
    annex.push(["", `Products planned: ${m.planned}     Workflows triggered: ${m.triggered}     Required annexes: ${m.annexes}     Overdue from: ${dmy(m.overdueFrom)}`]);
    annex.push(["", h("Department"), ...st.map(h), h("Total"), ...st.map((s) => h(`# ${s}`))]);
    for (const r of [...m.matrix.rows, { ...m.matrix.total, dept: "Total general" }]) {
      annex.push(["", r.dept === "Total general" ? bold(r.dept) : `${r.dept} Department`, ...st.map((s) => pct(r.total ? r.counts[s] / r.total : 0)), r.total, ...st.map((s) => r.counts[s])]);
    }
    annex.push([]);
  }

  const plan = [
    [title("APQR PLAN - approved product scope")],
    [note("Planned PQR Month = month after the review period closes. Overdue Date = 1st of that month + the overdue months setting.")],
    [],
    ["#", "Product", "Process", "Exec. Year", "Site", "Review Start", "Review End", "Period End (date)", "Planned PQR Month", "Overdue Date", "Plan Status", "Workflow Triggered?", "Required Annexes", "Annexes Closed", "% Complete", "Days to Overdue", "Tracking Status"].map(h),
    ...model.plan.map((p) => [p.no, p.product, p.process, p.execYear, p.site, p.reviewStart, p.reviewEnd, d(p.periodEnd), d(p.plannedMonth), d(p.overdueDate), p.planStatus, p.triggered ? "Yes" : "No", p.annexTotal, p.annexClosed, pct(p.pct), p.daysToOverdue ?? "", p.tracking]),
  ];

  const tasks = [
    [title("APQR TASK REGISTER - Scigeniq export plus the untriggered workload generated from the plan")],
    [note('"Task Role" separates the parent workflow, the ten departmental annexes and the Final QA compilation. "Annexe Slot" names which required annexe a task fills. "Record Source" says whether a row came from Scigeniq or was generated for a planned PQR not yet triggered.')],
    [],
    ["Reference ID", "Product", "Dosage Form", "Site", "Department", "Data Stream", "Task Class", "Task Role", "Annexe Slot", "Shared QA Stream", "Task Type", "Task Title", "Workflow Stage", "Status", "Assigned User", "Criticality", "Created", "Start", "Due (parent APQR)", "Closed On", "Closure", "Created By", "Record Source", "Days to Due", "Overdue?", "Ageing (days)", "Department (house)", "Planned PQR Month", "Task End Date (Scigeniq)"].map(h),
    ...model.tasks.map((t) => [t.ref, t.product, t.dosageForm, t.site, t.dept, t.stream, t.taskClass, t.role, t.slot, t.shared && t.isData ? "Yes" : "", t.taskType, t.title, t.stage, t.status, t.assignee, t.criticality, dt(t.created), dt(t.start), d(t.due), dt(t.closedOn), t.closure, t.createdBy, t.generated ? "Generated from plan" : "Scigeniq export", t.daysToDue ?? "", t.overdue, t.ageing ?? "", t.isAnnex ? `${t.dept} Department` : "", d(t.plannedMonth), dt(t.taskEnd)]),
  ];

  const workload = [
    [title("WORKLOAD BY ASSIGNED USER")],
    [note("Departmental annexes, Final QA compilations owned and approval signatures.")],
    [],
    ["Assigned User", "Annexes", "Closed", "Open", "Not raised", "Overdue", "% Complete", "Final QA owned", "Approvals", "Earliest Open Due Date", "Status"].map(h),
    ...model.workload.map((o) => [o.user, o.annexes, o.closed, o.open, o.notRaised, o.overdue, pct(o.pct), o.finalQa, o.approvals, d(o.earliestDue), o.status]),
  ];

  const actions = [
    [title("QA FOLLOW-UP ACTIONS")],
    [note("Actions recorded in the app against each product review.")],
    [],
    ["Product", "APQR Ref", "Action", "Owner", "Target date", "Done", "Raised", "Overdue?"].map(h),
    ...model.actions.map((a) => [a.product, a.ref, a.text, a.owner, d(a.due), a.done ? "Yes" : "No", d(a.created), a.overdue ? "YES" : ""]),
  ];

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
    { name: "Dashboard", rows: dash, widths: [2, 44, 14, 14, 14, 34, 14, 12, 12] },
    { name: "APQR Tracker", rows: tracker, widths: [14, 60, 13, 12, 9, 16, 18, 12, 12, 9, ...SLOTS.map(() => 8), 9, 9, 9, 8, 26, 24, 16, 9, 7, 11, 11, 30, 40, 30, 10, 50, 10], freeze: 5 },
    { name: "Final QA Progress", rows: finalQa, widths: [2, 30, 60, 14, 14, 14, 12, 20] },
    { name: "Workflow Progress", rows: workflow, widths: [2, 22, 10, 10, 12, 16, 10, 10] },
    { name: "Annexes Progress", rows: annex, widths: [2, 34, 14, 14, 14, 14, 14, 10, 10, 10, 10, 10] },
    { name: "APQR Plan 2026", rows: plan, widths: [6, 60, 13, 9, 12, 11, 11, 12, 12, 12, 11, 10, 10, 10, 10, 10, 26], freeze: 5 },
    { name: "Task Register", rows: tasks, widths: [14, 50, 12, 10, 18, 12, 14, 20, 20, 8, 26, 32, 14, 12, 20, 9, 16, 16, 12, 16, 10, 16, 18, 8, 8, 8, 26, 12, 16], freeze: 5 },
    { name: "Owner Workload", rows: workload, widths: [26, 10, 10, 8, 10, 8, 10, 12, 10, 14, 22], freeze: 5 },
    { name: "Actions", rows: actions, widths: [60, 14, 60, 20, 12, 8, 12, 10], freeze: 5 },
    { name: "Excluded Tasks", rows: excluded, widths: [14, 18, 14, 12, 40, 50, 20, 14, 30], freeze: 5 },
    { name: "Audit Trail", rows: audit, widths: [20, 18, 10, 50, 16, 24, 24], freeze: 5 },
  ]);
}

export function backupJson(state) {
  return new Blob([JSON.stringify({ app: "apqr-master-tracker", exportedAt: new Date().toISOString(), state }, null, 1)], { type: "application/json" });
}
