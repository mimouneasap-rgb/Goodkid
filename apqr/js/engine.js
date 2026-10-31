// APQR calculation engine (workbook v3 model). Pure functions only.
//
// The v3 model, as defined in the APQR Master Tracker v3:
//  - every planned product owes TEN departmental annexes (the "slots"), then the
//    Final QA compilation raised by the APQR Owner once all ten are closed
//  - Scigeniq files several annexes under the shared "QA Data Collection" type;
//    the task TITLE names the owning department, and every figure uses it
//  - a planned PQR with no workflow still owes the same work: the engine
//    generates its workflow, ten annexes and Final QA at "Not triggered"
//  - planned PQR month = month after the review period ends; PQR overdue date
//    = 1st of that month + N months (default 3); every task of a product shares it
//  - RAG: untriggered -> NOT STARTED - overdue / Not yet due;
//    triggered -> COMPLETE (Final QA closed) > OVERDUE > DUE SOON > ON TRACK

export const DEPARTMENTS = ["Compliance", "Production", "QA", "QC", "RA", "Supplier Qualification", "Validation Metrology", "Validation Process"];
export const DEPT_SHORT = { Compliance: "CM", Production: "Prod", QA: "QA", QC: "QC", RA: "RA", "Supplier Qualification": "Supp", "Validation Metrology": "V-Met", "Validation Process": "V-Proc" };

/** The ten required departmental annexes, in workbook order. */
export const SLOTS = [
  { key: "Compliance", short: "CM", label: "Compliance", dept: "Compliance" },
  { key: "IPC", short: "IPC", label: "IPC", dept: "Production" },
  { key: "Process", short: "Proc", label: "Process", dept: "Production" },
  { key: "QA", short: "QA", label: "QA", dept: "QA" },
  { key: "QC main", short: "QC", label: "QC", dept: "QC" },
  { key: "QC OOS/OOT", short: "OOS", label: "QC OOS/OOT", dept: "QC" },
  { key: "RA", short: "RA", label: "RA", dept: "RA" },
  { key: "Supplier Qualification", short: "Supp", label: "Supplier Qualification", dept: "Supplier Qualification" },
  { key: "Validation Metrology", short: "V-Met", label: "Validation Metrology", dept: "Validation Metrology" },
  { key: "Validation Process", short: "V-Proc", label: "Validation Process", dept: "Validation Process" },
];
export const SLOT_KEYS = SLOTS.map((s) => s.key);
export const SLOT_BY_KEY = Object.fromEntries(SLOTS.map((s) => [s.key, s]));

export const ROLES = { WORKFLOW: "Parent workflow", ANNEX: "Departmental annexe", FINAL: "Final QA compilation", APPROVAL: "Approval" };
export const RAG = ["COMPLETE", "ON TRACK", "DUE SOON", "OVERDUE"];
export const RAG_ALL = ["OVERDUE", "DUE SOON", "ON TRACK", "COMPLETE", "NOT STARTED - overdue", "Not yet due"];
export const WORKFLOW_STAGES = ["Not triggered", "Batches Selection", "Data Collection", "Collecting Data", "Data Review", "CAPA Planning", "Final Review", "Closed"];
export const STAGE_ORDER = ["Not triggered", "Batches Selection", "Data Collection", "Collecting Data", "Data Review", "CAPA Planning", "Final Review", "Completed", "Approved", "Closed", "Rejected"];
export const FINAL_QA_SIGNALS = ["Complete", "Raised, not complete", "NOT TRIGGERED - data ready", "Waiting on data collection", "Not triggered"];
export const CLASSES = ["Data Collection", "Approval", "Workflow"];

/* ------------------------------------------------------------------ dates */

const pad = (n) => String(n).padStart(2, "0");
export function dayNum(iso) {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(iso);
  if (!m) return null;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0)) / 86400000;
}
export const dayInt = (iso) => { const d = dayNum(iso); return d === null ? null : Math.floor(d); };
export function isoFromDay(d) {
  const x = new Date(Math.round(d * 86400000));
  return `${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())}`;
}
export function eomonth(iso, n = 0) {
  const m = /^(\d{4})-(\d{2})/.exec(iso || "");
  if (!m) return "";
  return isoFromDay(Date.UTC(+m[1], +m[2] - 1 + n + 1, 0) / 86400000);
}
export function edate(iso, n) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
  if (!m) return "";
  const y = +m[1], mo = +m[2] - 1 + n, day = +m[3];
  const last = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
  return isoFromDay(Date.UTC(y, mo, Math.min(day, last)) / 86400000);
}
export const firstOfMonth = (iso) => (iso ? iso.slice(0, 7) + "-01" : "");
export function monthYearToEnd(s) {
  const m = /^(\d{1,2})\s*[/.-]\s*(\d{4})$/.exec(String(s || "").trim());
  return m ? eomonth(`${m[2]}-${pad(+m[1])}-01`, 0) : "";
}
export const monthLabel = (iso) => (iso ? `${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "");
export const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

/* -------------------------------------------------------------- normalise */

export const productKey = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9%.]+/g, " ").trim();
export const refNum = (ref) => { const m = /(\d+)\s*$/.exec(ref || ""); return m ? +m[1] : 0; };
const byRef = (a, b) => { const pa = a.replace(/\d+\s*$/, ""), pb = b.replace(/\d+\s*$/, ""); return pa < pb ? -1 : pa > pb ? 1 : refNum(a) - refNum(b); };
export const isClosed = (t) => t.closure === "Closed";

/** Normalise a department name to one of the eight owning departments. */
export function houseDept(dept) {
  const d = String(dept || "").trim();
  if (!d) return "";
  if (DEPARTMENTS.includes(d)) return d;
  const l = d.toLowerCase();
  if (l === "approval") return "Approval";
  if (/^cm\b|compliance/.test(l)) return "Compliance";
  if (/metrolog/.test(l)) return "Validation Metrology";
  if (/valid|^vl\b/.test(l)) return "Validation Process";
  if (/supplier/.test(l)) return "Supplier Qualification";
  if (/^qa\b|quality assurance/.test(l)) return "QA";
  if (/^qc\b|quality control|laborator/.test(l)) return "QC";
  if (/prod|manufactur|ipc|process/.test(l)) return "Production";
  if (/^ra\b|regulat/.test(l)) return "RA";
  return d;
}

const isDup = (s) => /^task\s*-\s*duplicated$|^duplicated$/i.test(String(s || "").trim());
function slotFromText(s) {
  const t = String(s || "");
  if (!t || isDup(t)) return null;
  if (/^\s*CM\b|compliance/i.test(t)) return "Compliance";
  if (/\bVL\b|validation process/i.test(t)) return "Validation Process";
  if (/validation|metrolog/i.test(t)) return "Validation Metrology";
  if (/\bQC\b|\bOO[ST]+\b|OOS|OOT|stabilit|RM\s*\/\s*PM|analytical|retens/i.test(t)) return /^\s*QC Data Collection\s*-\s*\S/i.test(t) ? "QC main" : "QC OOS/OOT";
  if (/\bIPC\b|in.process control/i.test(t)) return "IPC";
  if (/process|hard capsule data|semi solid data|liquid\/syrup data/i.test(t)) return "Process";
  if (/supplier/i.test(t)) return "Supplier Qualification";
  if (/\bRA\b|regulator/i.test(t)) return "RA";
  if (/\bQA\b|quality assurance/i.test(t)) return "QA";
  return null;
}

/**
 * Classify a Scigeniq task: role (workflow / annexe / Final QA / approval),
 * annexe slot, owning department, data stream and whether it arrives through
 * the shared "QA Data Collection" stream.
 */
export function classifyTask({ title = "", type = "", department = "", ref = "", taskClass = "" } = {}) {
  const shared = /^qa data collection$/i.test(String(type).trim());
  if (taskClass === "Approval" || /approv/i.test(type) || /^APV-/i.test(ref)) return { role: ROLES.APPROVAL, slot: "", dept: "Approval", stream: "Approval", shared: false };
  if (taskClass === "Workflow" || /^apqr$/i.test(String(type).trim()) || (/^APQR\s*[,/]/i.test(title) && !/data\s*collection/i.test(title))) return { role: ROLES.WORKFLOW, slot: "", dept: "QA", stream: "APQR Workflow", shared: false };
  if (/final\s*qa|qa\s*final/i.test(title)) return { role: ROLES.FINAL, slot: "", dept: "QA", stream: "QA", shared };
  let slot = slotFromText(title);
  if (!slot) {
    slot = slotFromText(type);
    if (slot === "QC main" && isDup(title)) slot = "QC OOS/OOT";
  }
  if (!slot) {
    const d = houseDept(department);
    slot = { Compliance: "Compliance", QA: "QA", QC: "QC OOS/OOT", RA: "RA", "Supplier Qualification": "Supplier Qualification", "Validation Metrology": "Validation Metrology", "Validation Process": "Validation Process", Production: "Process" }[d] || "QA";
  }
  const stream = { Compliance: "Compliance", IPC: "IPC", Process: "Process", QA: "QA", "QC main": "QC", "QC OOS/OOT": "QC", RA: "RA", "Supplier Qualification": "Supplier", "Validation Metrology": "Validation", "Validation Process": "Validation" }[slot];
  return { role: ROLES.ANNEX, slot, dept: SLOT_BY_KEY[slot].dept, stream, shared };
}

/** Title Scigeniq uses for each slot, by dosage form (used for generated rows). */
export function slotTitle(slot, form) {
  const f = String(form || "");
  const sfx = /capsule/i.test(f) ? "Capsule" : /liquid|syrup/i.test(f) ? "Liquid" : /semi/i.test(f) ? "Semi Solid" : "Tablet";
  switch (slot) {
    case "Compliance": return "CM Data Collection";
    case "IPC": return `IPC Data Collection - ${sfx}`;
    case "Process": return sfx === "Capsule" ? "Hard Capsule Data Collection" : sfx === "Liquid" ? "Process Data Collection -Liquid/Syrup" : sfx === "Semi Solid" ? "Semi Solid Data Collection" : "Process Data Collection - Tablet";
    case "QA": return "QA Data Collection";
    case "QC main": return `QC Data Collection - ${sfx}`;
    case "QC OOS/OOT": return "QC OOS/OOT Data Collection";
    case "RA": return "RA Data Collection";
    case "Supplier Qualification": return "Supplier Data Collection";
    case "Validation Metrology": return "Validation Data Collection";
    case "Validation Process": return "VL Process Data Collection";
    default: return slot;
  }
}

/* ------------------------------------------------------------ assignment */

export const ASSIGNEE_TYPES = ["user", "role", "group"];
const UNASSIGNED = (v) => !v || /^unassigned$/i.test(String(v).trim()) || /^-+$/.test(String(v).trim());
/** Name of the department group an annexe is assigned to when Scigeniq shows no user. */
export const groupName = (dept) => `${dept} group`;
export const ROLE_APQR_OWNER = "APQR Owner (QA)";
export const ROLE_APPROVER = "Approver";
const looksLikeGroup = (v) => /\b(group|team|department|dept|role|owner|approver|reviewer)\b|\(.*\)/i.test(String(v || ""));

/**
 * Who a task is assigned to. Scigeniq can assign a task to a user, a role or a
 * group; its export only names users, so role/group assignments arrive as
 * "Unassigned". Those resolve to the owning department's group (annexes) or
 * the role that acts on them (workflow / Final QA / approval), marked inferred.
 */
export function resolveAssignee(t, role, dept) {
  if (!UNASSIGNED(t.assignee)) {
    const type = t.assigneeType && ASSIGNEE_TYPES.includes(t.assigneeType) ? t.assigneeType : looksLikeGroup(t.assignee) ? "group" : "user";
    return { name: String(t.assignee).trim(), type, inferred: false };
  }
  if (role === ROLES.ANNEX) return { name: groupName(dept), type: "group", inferred: true };
  if (role === ROLES.APPROVAL) return { name: ROLE_APPROVER, type: "role", inferred: true };
  return { name: ROLE_APQR_OWNER, type: "role", inferred: true };
}

function mode(values) {
  const c = new Map();
  let best = null, n = 0;
  for (const v of values) { if (!v) continue; const k = (c.get(v) || 0) + 1; c.set(v, k); if (k > n) { n = k; best = v; } }
  return best;
}
const stageIdx = (s) => { const i = STAGE_ORDER.indexOf(s); return i < 0 ? 50 : i; };

/* ---------------------------------------------------------------- compute */

export function effectiveReportDate(settings) {
  return settings.useToday ? todayIso() : settings.reportDate || todayIso();
}

export function compute(state) {
  const settings = { overdueMonths: 3, dueSoonDays: 14, triggerWindowDays: 60, ...state.settings };
  const report = effectiveReportDate(settings);
  const R = dayInt(report);
  const ann = state.products || {};
  const prevPct = state.baseline?.prevPct || {};
  const hasBaseline = !!state.baseline && Object.keys(prevPct).length > 0;

  /* --- plan --- */
  const planByKey = new Map();
  const plan = state.plan.map((p) => {
    const periodEnd = p.periodEnd || monthYearToEnd(p.reviewEnd);
    const plannedMonth = periodEnd ? eomonth(periodEnd, 1) : "";
    const overdueDate = plannedMonth ? edate(firstOfMonth(plannedMonth), settings.overdueMonths) : "";
    const row = { ...p, key: productKey(p.product), periodEnd, plannedMonth, overdueDate };
    if (!planByKey.has(row.key)) planByKey.set(row.key, row);
    return row;
  });

  /* --- real tasks with derived columns --- */
  const derive = (t, generated = false) => {
    const key = productKey(t.product);
    const pl = planByKey.get(key);
    const cls = classifyTask(t);
    const role = t.taskRole || cls.role;
    const slot = role === ROLES.ANNEX ? (t.annexSlot && SLOT_BY_KEY[t.annexSlot] ? t.annexSlot : cls.slot) : "";
    const dept = role === ROLES.ANNEX ? SLOT_BY_KEY[slot].dept : role === ROLES.APPROVAL ? "Approval" : "QA";
    const closed = isClosed(t);
    const due = pl ? pl.overdueDate : "";
    const D = dayInt(due);
    const asg = resolveAssignee(t, role, dept);
    const collectorStored = !UNASSIGNED(t.collector);
    const collector = collectorStored ? String(t.collector).trim() : asg.name;
    const collectorType = collectorStored ? (t.collectorType || (looksLikeGroup(t.collector) ? "group" : "user")) : asg.type;
    const reviewer = UNASSIGNED(t.reviewer) ? "" : String(t.reviewer).trim();
    const reviewerType = reviewer ? (t.reviewerType || (looksLikeGroup(reviewer) ? "group" : "user")) : "";
    return {
      ...t, key, role, slot, dept, generated,
      assigneeName: asg.name, assigneeType: asg.type, assigneeInferred: asg.inferred,
      collector, collectorType, collectorPerson: collectorType === "user",
      reviewer, reviewerType, reviewerPerson: reviewerType === "user",
      appChanged: !!t.app || t.source === "app",
      shared: cls.shared,
      closed,
      due,
      daysToDue: closed || D === null ? null : D - R,
      overdue: closed ? "No" : D === null ? "n/a" : D < R ? "YES" : "No",
      ageing: generated ? null : (() => { const s = dayInt(t.start || t.created); if (s === null) return null; return closed ? (dayInt(t.closedOn) ?? R) - s : R - s; })(),
      plannedMonth: pl ? pl.plannedMonth : "",
      isAnnex: role === ROLES.ANNEX,
      isFinal: role === ROLES.FINAL,
      isWorkflow: role === ROLES.WORKFLOW,
      isApproval: role === ROLES.APPROVAL,
      isData: role === ROLES.ANNEX || role === ROLES.FINAL,
    };
  };
  const real = state.tasks.map((t) => derive(t));
  const realByKey = new Map();
  for (const t of real) { if (!t.key) continue; if (!realByKey.has(t.key)) realByKey.set(t.key, []); realByKey.get(t.key).push(t); }

  /* --- generated workload for planned PQRs never triggered --- */
  const generated = [];
  for (const p of plan) {
    if (realByKey.has(p.key)) continue;
    const base = { product: p.product, dosageForm: p.process, site: p.site, criticality: "", created: "", start: "", closedOn: "", closure: "Not Closed", createdBy: "—", assignee: "Unassigned", stage: "Not triggered", status: "Not triggered", taskEnd: "", ref: "(not triggered)" };
    generated.push(derive({ ...base, id: `gen:${p.id}:wf`, taskClass: "Workflow", taskRole: ROLES.WORKFLOW, taskType: "APQR", title: `APQR , ${p.product}`, department: "QA", stream: "APQR Workflow" }, true));
    for (const s of SLOTS) generated.push(derive({ ...base, id: `gen:${p.id}:${s.key}`, taskClass: "Data Collection", taskRole: ROLES.ANNEX, annexSlot: s.key, taskType: "", title: slotTitle(s.key, p.process), department: s.dept, stream: s.dept }, true));
    generated.push(derive({ ...base, id: `gen:${p.id}:final`, taskClass: "Data Collection", taskRole: ROLES.FINAL, taskType: "QA Data Collection", title: "Final QA Data Collection", department: "QA", stream: "QA" }, true));
  }
  const tasks = [...real, ...generated];
  const tasksByKey = new Map();
  for (const t of tasks) { if (!t.key) continue; if (!tasksByKey.has(t.key)) tasksByKey.set(t.key, []); tasksByKey.get(t.key).push(t); }

  /* --- products: every planned product plus any off-plan product with tasks --- */
  const keys = [...new Set([...plan.map((p) => p.key), ...realByKey.keys()])];
  const products = keys.map((key) => {
    const pl = planByKey.get(key);
    const list = tasksByKey.get(key) || [];
    const realList = realByKey.get(key) || [];
    const a = ann[key] || {};
    const triggered = realList.length > 0;
    const wfs = realList.filter((t) => t.isWorkflow).sort((x, y) => (dayNum(y.created) || 0) - (dayNum(x.created) || 0));
    const wf = wfs[0];
    const annexes = list.filter((t) => t.isAnnex);
    const realAnnex = realList.filter((t) => t.isAnnex);
    const finals = realList.filter((t) => t.isFinal);
    const slots = {};
    for (const s of SLOTS) {
      const ts = realAnnex.filter((t) => t.slot === s.key);
      const status = !triggered ? "Not triggered" : !ts.length ? "MISSING" : ts.some((t) => t.closed) ? "OK" : "open";
      slots[s.key] = { status, tasks: ts };
    }
    const slotsOk = SLOTS.filter((s) => slots[s.key].status === "OK").length;
    const slotsMissing = SLOTS.filter((s) => slots[s.key].status === "MISSING").length;
    const annexClosed = annexes.filter((t) => t.closed).length;
    const annexOpen = realAnnex.filter((t) => !t.closed).length;
    const annexNotRaised = annexes.filter((t) => t.generated).length;
    const overdue = annexes.filter((t) => !t.closed && t.overdue === "YES").length;
    const finalQa = !finals.length ? "none" : finals.some((t) => t.closed) ? "done" : "open";
    const fqSignal = !triggered ? "Not triggered" : finalQa === "done" ? "Complete" : finalQa === "open" ? "Raised, not complete" : slotsOk >= 10 ? "NOT TRIGGERED - data ready" : "Waiting on data collection";
    const gap = finalQa === "done" && slotsOk < 10;
    const AE = pl ? pl.overdueDate : "";
    const AF = AE ? dayInt(AE) - R : null;
    let rag;
    if (!triggered) rag = AE && dayInt(AE) < R ? "NOT STARTED - overdue" : "Not yet due";
    else if (fqSignal === "Complete") rag = "COMPLETE";
    else if (AE && dayInt(AE) < R) rag = "OVERDUE";
    else if (AF !== null && AF <= settings.dueSoonDays) rag = "DUE SOON";
    else rag = "ON TRACK";
    const openByDept = Object.fromEntries(DEPARTMENTS.map((d) => [d, realAnnex.filter((t) => !t.closed && t.dept === d).length]));
    const max = Math.max(...Object.values(openByDept));
    const bottleneck = max === 0 ? "-" : Object.values(openByDept).filter((v) => v === max).length > 1 ? "several" : DEPARTMENTS.find((d) => openByDept[d] === max);
    const wfRefs = [...new Set([...realList.filter((t) => /^APQR/i.test(t.ref)).map((t) => t.ref), ...(a.workflowRefs || [])])].sort(byRef);
    const qcRefs = [...new Set([...realList.filter((t) => /^QCTAB/i.test(t.ref)).map((t) => t.ref), ...(a.qcRefs || [])])].sort(byRef);
    const nWorkflows = Math.max(wfRefs.length, wfs.length, a.nWorkflows || 0);
    const wfStage = triggered ? wf?.stage || "Data Collection" : "Not triggered";
    const flags = [];
    if (nWorkflows > 1) flags.push("DUPLICATE");
    if (wfStage === "Closed" && annexOpen > 0) flags.push("CLOSED w/ OPEN");
    if (gap) flags.push("FINAL QA GAP");
    if (fqSignal === "NOT TRIGGERED - data ready") flags.push("DATA READY");
    if (triggered && slotsMissing) flags.push("MISSING ANNEXE");
    const pct = slotsOk / 10;
    const prev = prevPct[key];
    const actions = (a.actions || []).map((x) => ({ ...x, key, overdue: !x.done && x.due && dayInt(x.due) < R }));
    return {
      key,
      product: pl?.product || realList[0]?.product || key,
      ref: wf?.ref || wfRefs[wfRefs.length - 1] || (triggered ? realList[0].ref : "(not triggered)"),
      dosageForm: pl?.process || mode(realList.map((t) => t.dosageForm)) || "",
      site: pl?.site || mode(realList.map((t) => t.site)) || "",
      triggered,
      owner: a.owner || wf?.assignee || "Unassigned",
      scigeniqOwner: wf?.assignee || "",
      wfStage, wfStatus: wf?.status || (triggered ? "" : "Not triggered"), wfDue: wf?.taskEnd || "",
      nWorkflows, flags,
      slots, slotsOk, slotsMissing, pct,
      annexTotal: annexes.length, annexClosed, annexOpen, annexNotRaised, overdue,
      finalQa, finalQaTasks: finals, fqSignal, gap,
      rag,
      openByDept, bottleneck,
      approvals: realList.filter((t) => t.isApproval).length,
      approvalsSigned: realList.filter((t) => t.isApproval && t.stage === "Approved").length,
      rejected: realList.filter((t) => t.stage === "Rejected").length,
      plannedMonth: pl?.plannedMonth || "",
      overdueDate: AE,
      daysToOverdue: AF,
      reviewStart: pl ? pl.reviewStart : "",
      reviewEnd: pl ? pl.reviewEnd : "",
      inPlan: !!pl,
      planNo: pl?.no ?? "",
      workflowRefs: wfRefs, qcRefs,
      comments: a.comments || "",
      priority: a.priority || "",
      actions,
      prevPct: prev ?? null,
      isNew: a.isNew !== undefined ? a.isNew : hasBaseline ? prev === undefined || prev === null : false,
      movement: prev === undefined || prev === null ? "new" : pct > prev + 1e-9 ? "UP" : pct < prev - 1e-9 ? "DOWN" : "flat",
      tasks: list,
    };
  });
  products.sort((x, y) => x.product.localeCompare(y.product));
  const productByKey = new Map(products.map((p) => [p.key, p]));

  /* --- plan execution columns --- */
  for (const p of plan) {
    const pr = productByKey.get(p.key);
    p.triggered = pr.triggered;
    p.annexTotal = pr.annexTotal;
    p.annexClosed = pr.annexClosed;
    p.pct = pr.annexTotal ? pr.annexClosed / pr.annexTotal : 0;
    p.slotsOk = pr.slotsOk;
    p.rag = pr.rag;
    p.fqSignal = pr.fqSignal;
    p.daysToOverdue = p.overdueDate ? dayInt(p.overdueDate) - R : null;
    const P = p.daysToOverdue;
    if (!p.triggered) p.tracking = P !== null && P < 0 ? "NOT TRIGGERED - past due" : P !== null && P <= settings.triggerWindowDays ? "NOT TRIGGERED - due soon" : "Not yet triggered";
    else p.tracking = pr.fqSignal === "Complete" ? "Complete" : pr.slotsOk === 10 ? "Data collection complete" : P !== null && P < 0 ? "OVERDUE - in progress" : "In progress";
  }

  /* --- KPIs --- */
  const annexAll = tasks.filter((t) => t.isAnnex);
  const annexReal = annexAll.filter((t) => !t.generated);
  const triggeredProducts = products.filter((p) => p.triggered);
  const sigCount = (s) => products.filter((p) => p.fqSignal === s).length;
  const kpi = {
    planned: plan.length,
    triggered: plan.filter((p) => p.triggered).length,
    productsLive: triggeredProducts.length,
    requiredAnnexes: annexAll.length,
    annexClosed: annexAll.filter((t) => t.closed).length,
    annexOpen: annexReal.filter((t) => !t.closed).length,
    annexNotRaised: annexAll.filter((t) => t.generated).length,
    overdueAnnexes: annexAll.filter((t) => t.overdue === "YES").length,
    unassignedAnnexes: annexAll.filter((t) => UNASSIGNED(t.assignee)).length,
    unassignedOpen: annexReal.filter((t) => !t.closed && t.assigneeType !== "user").length,
    noCollector: annexReal.filter((t) => !t.closed && !t.collectorPerson).length,
    noReviewer: annexReal.filter((t) => !t.closed && !t.reviewerPerson).length,
    appChanged: real.filter((t) => t.appChanged).length,
    productsOverdue: products.filter((p) => p.rag === "OVERDUE").length,
    productsComplete: products.filter((p) => p.rag === "COMPLETE").length,
    notStartedOverdue: products.filter((p) => p.rag === "NOT STARTED - overdue").length,
    fqComplete: sigCount("Complete"),
    fqRaised: sigCount("Raised, not complete"),
    fqReady: sigCount("NOT TRIGGERED - data ready"),
    fqWaiting: sigCount("Waiting on data collection"),
    fqNotTriggered: sigCount("Not triggered"),
    closedOut: products.filter((p) => p.wfStage === "Closed").length,
    inDataCollection: products.filter((p) => p.triggered && p.wfStage !== "Closed").length,
    notDataComplete: triggeredProducts.filter((p) => p.slotsOk < 10).length,
    dataComplete: triggeredProducts.filter((p) => p.slotsOk === 10).length,
    gaps: products.filter((p) => p.gap).length,
    duplicates: products.filter((p) => p.flags.includes("DUPLICATE")).length,
    closedWithOpen: products.filter((p) => p.flags.includes("CLOSED w/ OPEN")).length,
    missingSlots: triggeredProducts.reduce((n, p) => n + p.slotsMissing, 0),
    approvals: real.filter((t) => t.isApproval).length,
    approvalsSigned: real.filter((t) => t.isApproval && t.stage === "Approved").length,
    rejected: real.filter((t) => t.stage === "Rejected").length,
    newSince: products.filter((p) => p.isNew).length,
    notTriggeredPastDue: plan.filter((p) => p.tracking === "NOT TRIGGERED - past due").length,
    notTriggeredDueSoon: plan.filter((p) => p.tracking === "NOT TRIGGERED - due soon").length,
    openActions: 0,
    overdueActions: 0,
  };
  kpi.notTriggered = kpi.planned - kpi.triggered;
  kpi.completion = kpi.requiredAnnexes ? kpi.annexClosed / kpi.requiredAnnexes : 0;
  kpi.raisedCompletion = annexReal.length ? kpi.annexClosed / annexReal.length : 0;
  kpi.planTriggered = kpi.planned ? kpi.triggered / kpi.planned : 0;
  const actions = products.flatMap((p) => p.actions.map((x) => ({ ...x, product: p.product, ref: p.ref, rag: p.rag })));
  kpi.openActions = actions.filter((x) => !x.done).length;
  kpi.overdueActions = actions.filter((x) => x.overdue).length;

  const movementCurrent = {
    triggered: kpi.triggered,
    requiredAnnexes: kpi.requiredAnnexes,
    annexClosed: kpi.annexClosed,
    annexOpen: kpi.annexOpen,
    overdueAnnexes: kpi.overdueAnnexes,
    unassignedOpen: kpi.unassignedOpen,
    fqComplete: kpi.fqComplete,
    closedOut: kpi.closedOut,
  };

  const ragCounts = Object.fromEntries([...RAG_ALL, "No tasks"].map((r) => [r, products.filter((p) => p.rag === r).length]));
  const fqCounts = Object.fromEntries(FINAL_QA_SIGNALS.map((s) => [s, sigCount(s)]));

  /* --- departments, slots, stages --- */
  const byDept = DEPARTMENTS.map((d) => {
    const ts = annexAll.filter((t) => t.dept === d);
    return { dept: d, closed: ts.filter((t) => t.closed).length, open: ts.filter((t) => !t.closed && !t.generated).length, notRaised: ts.filter((t) => t.generated).length, overdue: ts.filter((t) => t.overdue === "YES").length, total: ts.length };
  });
  const bySlot = SLOTS.map((s) => {
    const st = triggeredProducts.map((p) => p.slots[s.key].status);
    return { ...s, ok: st.filter((x) => x === "OK").length, open: st.filter((x) => x === "open").length, missing: st.filter((x) => x === "MISSING").length, notTriggered: kpi.notTriggered };
  });
  const count = (arr, f) => { const m = new Map(); for (const x of arr) { const k = f(x); m.set(k, (m.get(k) || 0) + 1); } return m; };
  const annexStages = [...count(annexAll, (t) => t.stage || "—")].sort((a, b) => stageIdx(a[0]) - stageIdx(b[0])).map(([stage, n]) => ({ stage, n }));
  const statusSplit = count(annexReal, (t) => t.status || "—");
  const workflowStages = WORKFLOW_STAGES.map((s) => ({ stage: s, n: products.filter((p) => p.inPlan && p.wfStage === s).length }));
  for (const p of products) if (p.inPlan && !WORKFLOW_STAGES.includes(p.wfStage)) { const row = workflowStages.find((x) => x.stage === p.wfStage); if (row) row.n++; else workflowStages.push({ stage: p.wfStage, n: 1 }); }
  const forms = [...new Set(plan.map((p) => p.process).filter(Boolean))].map((f) => ({ form: f, planned: plan.filter((p) => p.process === f).length, triggered: plan.filter((p) => p.process === f && p.triggered).length, complete: plan.filter((p) => p.process === f && p.rag === "COMPLETE").length })).sort((a, b) => b.planned - a.planned);

  /* --- owner workload --- */
  const owners = new Map();
  const ow = (u, type = "user") => { if (!owners.has(u)) owners.set(u, { user: u, type, annexes: 0, closed: 0, open: 0, notRaised: 0, overdue: 0, finalQa: 0, finalQaDone: 0, approvals: 0, earliestDue: "", depts: {}, products: new Set() }); return owners.get(u); };
  for (const t of tasks) {
    if (t.isWorkflow) continue;
    const o = ow(t.assigneeName, t.assigneeType);
    if (t.isApproval) { o.approvals++; continue; }
    if (t.isFinal) { o.finalQa++; if (t.closed) o.finalQaDone++; continue; }
    o.annexes++;
    o.products.add(t.key);
    o.depts[t.dept] = (o.depts[t.dept] || 0) + 1;
    if (t.closed) o.closed++;
    else {
      if (t.generated) o.notRaised++; else o.open++;
      if (t.overdue === "YES") o.overdue++;
      if (!t.generated && t.due && (!o.earliestDue || t.due < o.earliestDue)) o.earliestDue = t.due;
    }
  }
  const workload = [...owners.values()].map((o) => ({
    ...o,
    products: o.products.size,
    pct: o.annexes ? o.closed / o.annexes : 0,
    status: o.overdue > 0 ? "ACTION - overdue items" : o.open + o.notRaised === 0 ? "Clear" : "In progress",
    mainDept: Object.entries(o.depts).sort((a, b) => b[1] - a[1])[0]?.[0] || "",
  })).sort((a, b) => b.open - a.open || b.overdue - a.overdue || a.user.localeCompare(b.user));

  /* --- months --- */
  const monthKeys = [...new Set(plan.map((p) => p.plannedMonth).filter(Boolean))].sort();
  const months = monthKeys.map((m) => {
    const rows = plan.filter((p) => p.plannedMonth === m);
    const prods = rows.map((p) => productByKey.get(p.key));
    const keySet = new Set(rows.map((p) => p.key));
    const annexes = annexAll.filter((t) => keySet.has(t.key));
    const done = annexes.filter((t) => t.closed).length;
    const triggered = rows.filter((p) => p.triggered).length;
    const overdueFrom = edate(firstOfMonth(m), settings.overdueMonths);
    const pct = annexes.length ? done / annexes.length : 0;
    let status;
    if (triggered === 0) status = dayInt(overdueFrom) <= R ? "NOT STARTED - overdue" : dayInt(firstOfMonth(m)) > R ? "Not yet due" : "Not started";
    else if (triggered < rows.length) status = "Partly triggered";
    else if (annexes.length && pct === 1) status = "Complete";
    else if (dayInt(overdueFrom) <= R) status = "OVERDUE - in progress";
    else status = "In progress";
    return {
      month: m, planned: rows.length, triggered, annexes: annexes.length, completed: done, pct, overdueFrom, status, products: prods,
      fqComplete: prods.filter((p) => p.fqSignal === "Complete").length,
      fqReady: prods.filter((p) => p.fqSignal === "NOT TRIGGERED - data ready").length,
      closedOut: prods.filter((p) => p.wfStage === "Closed").length,
      inDataCollection: prods.filter((p) => p.triggered && p.wfStage !== "Closed").length,
      matrix: annexMatrix(annexes),
    };
  });
  const offPlan = products.filter((p) => !p.inPlan);
  const offPlanMatrix = annexMatrix(annexAll.filter((t) => !planByKey.has(t.key)));

  /* --- data quality signals --- */
  const quality = [];
  const push = (level, title, detail, items = [], id = "") => quality.push({ level, title, detail, items, id });
  const ready = products.filter((p) => p.fqSignal === "NOT TRIGGERED - data ready").sort((a, b) => (a.daysToOverdue ?? 0) - (b.daysToOverdue ?? 0));
  if (ready.length) push("critical", "Data ready, Final QA never raised", "All ten departmental annexes are closed but the APQR Owner has not raised the Final QA compilation. These reviews can move today.", ready.map((p) => ({ key: p.key, label: `${p.ref} · ${p.product}`, note: p.daysToOverdue < 0 ? `${-p.daysToOverdue} d past PQR due` : `due ${p.overdueDate}` })), "ready");
  const gaps = products.filter((p) => p.gap);
  if (gaps.length) push("serious", "Final QA closed with an annexe gap", "The compilation was closed although one or more of the ten required annexes is not closed or was never raised.", gaps.map((p) => ({ key: p.key, label: `${p.ref} · ${p.product}`, note: `${p.slotsOk}/10 annexes OK` })), "gap");
  const notClosedOut = products.filter((p) => p.fqSignal === "Complete" && p.wfStage !== "Closed");
  if (notClosedOut.length) push("warning", "Final QA closed, workflow still open", "The compilation is closed but the parent APQR workflow has not been closed out in Scigeniq.", notClosedOut.map((p) => ({ key: p.key, label: `${p.ref} · ${p.product}`, note: `stage ${p.wfStage}` })), "notclosed");
  const closedOpen = products.filter((p) => p.flags.includes("CLOSED w/ OPEN"));
  if (closedOpen.length) push("serious", "Workflows closed with open annexes", "The APQR is closed in Scigeniq while annexes beneath it are still open.", closedOpen.map((p) => ({ key: p.key, label: `${p.ref} · ${p.product}`, note: `${p.annexOpen} open` })), "closedopen");
  const missing = triggeredProducts.filter((p) => p.slotsMissing);
  if (missing.length) push("warning", "Required annexes never raised", "Triggered workflows where one of the ten required annexes does not exist in Scigeniq.", missing.map((p) => ({ key: p.key, label: `${p.ref} · ${p.product}`, note: SLOTS.filter((s) => p.slots[s.key].status === "MISSING").map((s) => s.label).join(", ") })), "missing");
  const rej = real.filter((t) => t.stage === "Rejected");
  if (rej.length) push("serious", "Rejected approvals", "Approval signatures rejected at departmental or final review.", rej.map((t) => ({ key: t.key, label: `${t.ref} · ${t.product}`, note: t.closedOn ? `closed ${t.closedOn.slice(0, 10)}` : "" })), "rejected");
  const lateMonths = months.filter((m) => m.status === "NOT STARTED - overdue");
  if (lateMonths.length) push("critical", "Planned months with no workflow triggered", "Review periods have closed and the PQR overdue date has passed, but no workflow has been started.", lateMonths.map((m) => ({ month: m.month, label: monthLabel(m.month), note: `${m.planned} products` })), "latemonths");
  const pastDue = plan.filter((p) => p.tracking === "NOT TRIGGERED - past due");
  if (pastDue.length) push("critical", "Planned products past due and not triggered", "Past their PQR overdue date with no workflow in Scigeniq.", pastDue.map((p) => ({ key: p.key, label: p.product, note: `overdue since ${p.overdueDate}` })), "pastdue");
  const soon = plan.filter((p) => p.tracking === "NOT TRIGGERED - due soon");
  if (soon.length) push("warning", `Not triggered, due within ${settings.triggerWindowDays} days`, "Workflows that should be started soon to meet the PQR commitment.", soon.map((p) => ({ key: p.key, label: p.product, note: `due ${p.overdueDate}` })), "soon");
  const dups = products.filter((p) => p.flags.includes("DUPLICATE"));
  if (dups.length) push("warning", "Duplicate workflows", "Products carrying more than one APQR workflow reference.", dups.map((p) => ({ key: p.key, label: p.product, note: p.workflowRefs.join(" / ") })), "dups");
  if (kpi.unassignedOpen) push("info", "Open annexes assigned to a group or role", `${kpi.unassignedOpen} open annexes show no named user in Scigeniq, so they are assigned to the owning department's group or role. Name a person on the Data collection page.`, [], "unassigned");
  if (offPlan.length) push("info", "Products with tasks but not in the plan", "Check the product name matches the plan exactly.", offPlan.map((p) => ({ key: p.key, label: p.product, note: `${p.annexTotal} annexes` })), "offplan");
  const sysOverdue = annexReal.filter((t) => !t.closed && /overdue/i.test(t.status)).length;
  const calcOverdue = annexReal.filter((t) => t.overdue === "YES").length;
  if (sysOverdue !== calcOverdue) push("info", "Overdue: system flag vs PQR due date", `Scigeniq flags ${sysOverdue} open annexes as Overdue against their own end date; ${calcOverdue} are overdue against the parent PQR due date used here.`, [], "reconcile");
  if (kpi.overdueActions) push("warning", "QA follow-up actions past their target date", `${kpi.overdueActions} follow-up actions are overdue.`, actions.filter((x) => x.overdue).map((x) => ({ key: x.key, label: x.text, note: `${x.product} · due ${x.due}` })), "actions");

  /* --- groups / roles and their members (named users seen on that work) --- */
  const groups = new Map();
  const addGroup = (name, type, dept) => { if (!groups.has(name)) groups.set(name, { name, type, dept, members: new Map(), open: 0, total: 0 }); return groups.get(name); };
  for (const d of DEPARTMENTS) addGroup(groupName(d), "group", d);
  addGroup(ROLE_APQR_OWNER, "role", "QA");
  addGroup(ROLE_APPROVER, "role", "");
  for (const t of real) {
    if (t.isAnnex && t.assigneeType === "user") { const g = groups.get(groupName(t.dept)); g.members.set(t.assigneeName, (g.members.get(t.assigneeName) || 0) + 1); }
    if ((t.isWorkflow || t.isFinal) && t.assigneeType === "user") { const g = groups.get(ROLE_APQR_OWNER); g.members.set(t.assigneeName, (g.members.get(t.assigneeName) || 0) + 1); }
    if (t.isApproval && t.assigneeType === "user") { const g = groups.get(ROLE_APPROVER); g.members.set(t.assigneeName, (g.members.get(t.assigneeName) || 0) + 1); }
    const g = groups.get(t.assigneeName);
    if (g) { g.total++; if (!t.closed) g.open++; }
  }
  const groupList = [...groups.values()].map((g) => ({ ...g, members: [...g.members.entries()].sort((a, b) => b[1] - a[1]).map(([name, n]) => ({ name, n })) }));
  const people = [...new Set([...real.filter((t) => t.assigneeType === "user").map((t) => t.assigneeName), ...real.map((t) => t.collectorPerson ? t.collector : "").filter(Boolean), ...real.map((t) => t.reviewerPerson ? t.reviewer : "").filter(Boolean)])].sort();

  /* --- data collection (annexes): progress by month, owners and reviewers --- */
  const COLL_STAGES = ["Not triggered", "Collecting Data", "Data Review", "Completed"];
  const collStage = (t) => t.generated ? "Not triggered" : t.closed ? "Completed" : /review/i.test(t.stage) ? "Data Review" : "Collecting Data";
  const collection = {
    stages: COLL_STAGES,
    stageOf: collStage,
    byMonth: months.map((mo) => {
      const keySet = new Set(mo.products.map((p) => p.key));
      const ts = annexAll.filter((t) => keySet.has(t.key));
      return { month: mo.month, counts: Object.fromEntries(COLL_STAGES.map((st) => [st, ts.filter((t) => collStage(t) === st).length])), total: ts.length, tasks: ts };
    }),
    byCollector: [],
    byReviewer: [],
  };
  const tally = (keyFn, kindFn) => {
    const mp = new Map();
    for (const t of annexReal) {
      const k = keyFn(t) || "Reviewer not set";
      if (!mp.has(k)) mp.set(k, { name: k, kind: kindFn(t), counts: Object.fromEntries(COLL_STAGES.map((st) => [st, 0])), total: 0, open: 0, overdue: 0 });
      const r = mp.get(k);
      r.counts[collStage(t)]++; r.total++;
      if (!t.closed) { r.open++; if (t.overdue === "YES") r.overdue++; }
    }
    return [...mp.values()].sort((a, b) => b.open - a.open || b.total - a.total || a.name.localeCompare(b.name));
  };
  collection.byCollector = tally((t) => t.collector, (t) => t.collectorType);
  collection.byReviewer = tally((t) => t.reviewer, (t) => (t.reviewer ? t.reviewerType : "missing"));

  /* --- workflow stage and Final QA signal by planned month (for the charts) --- */
  const wfBucket = (p) => !p.triggered ? "Not triggered" : p.wfStage === "Closed" ? "Closed" : p.fqSignal === "Complete" ? "Final QA done, not closed" : p.slotsOk === 10 ? "Data complete" : "Collecting annexes";
  const WF_BUCKETS = ["Not triggered", "Collecting annexes", "Data complete", "Final QA done, not closed", "Closed"];
  const workflowByMonth = months.map((mo) => ({ month: mo.month, counts: Object.fromEntries(WF_BUCKETS.map((b) => [b, mo.products.filter((p) => wfBucket(p) === b).length])), total: mo.planned }));
  const fqByMonth = months.map((mo) => ({ month: mo.month, counts: Object.fromEntries(FINAL_QA_SIGNALS.map((sg) => [sg, mo.products.filter((p) => p.fqSignal === sg).length])), total: mo.planned }));

  return {
    groups: groupList, people, collection, workflowByMonth, fqByMonth, WF_BUCKETS,
    report, settings, plan, tasks, realTasks: real, generatedTasks: generated, products, productByKey, planByKey, kpi, movementCurrent,
    statusSplit, ragCounts, fqCounts, byDept, bySlot, annexStages, workflowStages, forms, workload, months, offPlan, offPlanMatrix, quality, actions,
    owners: [...new Set(real.map((t) => t.assigneeType === "user" ? t.assigneeName : "").filter(Boolean))].sort(),
  };
}

/** Department x stage counts for a set of annexes, with a "Total" row. */
export function annexMatrix(annexes) {
  const stages = [...new Set(annexes.map((t) => t.stage || "—"))].sort((a, b) => stageIdx(a) - stageIdx(b));
  if (!stages.length) stages.push("Not triggered", "Collecting Data", "Data Review", "Completed");
  const rows = DEPARTMENTS.map((d) => {
    const ts = annexes.filter((t) => t.dept === d);
    return { dept: d, counts: Object.fromEntries(stages.map((s) => [s, ts.filter((t) => (t.stage || "—") === s).length])), total: ts.length };
  });
  const totalCounts = Object.fromEntries(stages.map((s) => [s, rows.reduce((n, r) => n + r.counts[s], 0)]));
  return { stages, rows, total: { dept: "Total", counts: totalCounts, total: rows.reduce((n, r) => n + r.total, 0) } };
}

export const MOVEMENT_METRICS = [
  ["triggered", "Workflows triggered"],
  ["requiredAnnexes", "Required annexes"],
  ["annexClosed", "Annexes closed"],
  ["annexOpen", "Annexes open (raised)"],
  ["overdueAnnexes", "Overdue annexes"],
  ["unassignedOpen", "Unassigned open annexes"],
  ["fqComplete", "Final QA complete"],
  ["closedOut", "Workflows closed out"],
];
export const UP_IS_BAD = new Set(["overdueAnnexes", "unassignedOpen", "annexOpen"]);

export function snapshotBaseline(model, label) {
  return { label, date: model.report, metrics: { ...model.movementCurrent }, prevPct: Object.fromEntries(model.products.map((p) => [p.key, p.pct])) };
}
