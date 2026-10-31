// APQR calculation engine. Pure functions only: no DOM and no storage.
//
// Reproduces the logic of the APQR Master Tracker workbook:
//  - a product's planned PQR month is the month after its review period ends
//  - its PQR overdue date is the 1st of that month plus N months (default 3)
//  - every annexe (data-collection task) of a product shares that due date
//  - % complete counts data-collection tasks only (approvals are counted separately)
//  - RAG: COMPLETE > OVERDUE > DUE SOON > ON TRACK

export const DEPARTMENTS = ["QA", "QC", "Production", "RA", "Validation", "Compliance"];
export const DEPT_SHORT = { QC: "QC", Production: "Prod", QA: "QA", RA: "RA", Validation: "Val", Compliance: "Comp" };
export const RAG = ["COMPLETE", "ON TRACK", "DUE SOON", "OVERDUE"];
export const STAGE_ORDER = ["Batches Selection", "Data Collection", "Collecting Data", "Data Review", "Completed", "Approved", "Closed", "Rejected"];
export const CLASSES = ["Data Collection", "Approval", "Workflow"];

/* ------------------------------------------------------------------ dates */

const pad = (n) => String(n).padStart(2, "0");
/** ISO date or datetime -> UTC day number (integer part = calendar day). */
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
/** Excel EOMONTH: last day of the month `n` months from iso. */
export function eomonth(iso, n = 0) {
  const m = /^(\d{4})-(\d{2})/.exec(iso || "");
  if (!m) return "";
  const d = new Date(Date.UTC(+m[1], +m[2] - 1 + n + 1, 0));
  return isoFromDay(d.getTime() / 86400000);
}
/** Excel EDATE: same day `n` months later (clamped to month end). */
export function edate(iso, n) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
  if (!m) return "";
  const y = +m[1], mo = +m[2] - 1 + n, day = +m[3];
  const last = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
  return isoFromDay(Date.UTC(y, mo, Math.min(day, last)) / 86400000);
}
export const firstOfMonth = (iso) => (iso ? iso.slice(0, 7) + "-01" : "");
/** "MM/YYYY" -> last day of that month as ISO. */
export function monthYearToEnd(s) {
  const m = /^(\d{1,2})\s*[/.-]\s*(\d{4})$/.exec(String(s || "").trim());
  return m ? eomonth(`${m[2]}-${pad(+m[1])}-01`, 0) : "";
}
export const monthLabel = (iso) => (iso ? `${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "");
export const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

/* -------------------------------------------------------------- normalise */

/** Key used to join plan rows, tasks and annotations on product name. */
export const productKey = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9%.]+/g, " ").trim();

export function houseDept(dept) {
  const d = String(dept || "").trim();
  if (!d) return "";
  if (DEPARTMENTS.includes(d)) return d;
  const l = d.toLowerCase();
  if (l === "approval") return "Approval";
  if (/^cm\b|compliance/.test(l)) return "Compliance";
  if (/valid|metrolog|^vl\b/.test(l)) return "Validation";
  if (/supplier|^qa\b|quality assurance/.test(l)) return "QA";
  if (/^qc\b|quality control|laborator/.test(l)) return "QC";
  if (/prod|manufactur|ipc/.test(l)) return "Production";
  if (/^ra\b|regulat/.test(l)) return "RA";
  return d;
}

export const isClosed = (t) => t.closure === "Closed";
export const refNum = (ref) => { const m = /(\d+)\s*$/.exec(ref || ""); return m ? +m[1] : 0; };
const byRef = (a, b) => (a.replace(/\d+\s*$/, "") < b.replace(/\d+\s*$/, "") ? -1 : a.replace(/\d+\s*$/, "") > b.replace(/\d+\s*$/, "") ? 1 : refNum(a) - refNum(b));

function mode(values) {
  const c = new Map();
  let best = null, n = 0;
  for (const v of values) { if (!v) continue; const k = (c.get(v) || 0) + 1; c.set(v, k); if (k > n) { n = k; best = v; } }
  return best;
}

/* ---------------------------------------------------------------- compute */

export function effectiveReportDate(settings) {
  return settings.useToday ? todayIso() : settings.reportDate || todayIso();
}

/**
 * Compute every derived table from the stored state. Returns a model object
 * the UI renders from; nothing in it is persisted.
 */
export function compute(state) {
  const settings = { overdueMonths: 3, dueSoonDays: 14, triggerWindowDays: 60, ...state.settings };
  const report = effectiveReportDate(settings);
  const R = dayInt(report);
  const ann = state.products || {};
  const prevPct = state.baseline?.prevPct || {};
  const hasBaseline = !!state.baseline && Object.keys(prevPct).length > 0;

  /* --- tasks grouped by product --- */
  const tasksByProduct = new Map();
  for (const t of state.tasks) {
    const k = productKey(t.product);
    if (!k) continue;
    if (!tasksByProduct.has(k)) tasksByProduct.set(k, []);
    tasksByProduct.get(k).push(t);
  }

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

  /* --- tasks (derived columns) --- */
  const tasks = state.tasks.map((t) => {
    const key = productKey(t.product);
    const pl = planByKey.get(key);
    const due = pl ? pl.overdueDate : "";
    const closed = isClosed(t);
    const dept = houseDept(t.department);
    const D = dayInt(due);
    return {
      ...t,
      key,
      dept,
      closed,
      due,
      daysToDue: closed || D === null ? null : D - R,
      overdue: closed ? "No" : D === null ? "n/a" : D < R ? "YES" : "No",
      ageing: (() => { const s = dayInt(t.start || t.created); if (s === null) return null; return closed ? (dayInt(t.closedOn) ?? R) - s : R - s; })(),
      plannedMonth: pl ? pl.plannedMonth : "",
      isData: t.taskClass === "Data Collection",
    };
  });
  const tasksByKey = new Map();
  for (const t of tasks) { if (!tasksByKey.has(t.key)) tasksByKey.set(t.key, []); tasksByKey.get(t.key).push(t); }

  /* --- products (tracker rows) --- */
  const products = [];
  for (const [key, list] of tasksByKey) {
    const a = ann[key] || {};
    const pl = planByKey.get(key);
    const wfs = list.filter((t) => t.taskClass === "Workflow").sort((x, y) => (dayNum(y.created) || 0) - (dayNum(x.created) || 0));
    const wf = wfs[0];
    const data = list.filter((t) => t.isData);
    const done = data.filter((t) => t.closed).length;
    const open = data.length - done;
    const overdue = data.filter((t) => !t.closed && t.due && dayInt(t.due) < R).length;
    const openByDept = Object.fromEntries(DEPARTMENTS.map((d) => [d, data.filter((t) => !t.closed && t.dept === d).length]));
    const max = Math.max(...Object.values(openByDept));
    const bottleneck = max === 0 ? "-" : Object.values(openByDept).filter((v) => v === max).length > 1 ? "several" : DEPARTMENTS.find((d) => openByDept[d] === max);
    const wfRefs = [...new Set([...list.filter((t) => /^APQR/i.test(t.ref)).map((t) => t.ref), ...(a.workflowRefs || [])])].sort(byRef);
    const qcRefs = [...new Set([...list.filter((t) => /^QCTAB/i.test(t.ref)).map((t) => t.ref), ...(a.qcRefs || [])])].sort(byRef);
    const pct = data.length ? done / data.length : 0;
    const prev = prevPct[key];
    const wfStage = wf?.stage || "";
    const wfDue = wf?.taskEnd || "";
    const S = wfDue ? dayInt(wfDue) - R : null;
    const AE = pl ? pl.overdueDate : "";
    const AF = AE ? dayInt(AE) - R : null;
    let rag;
    if (data.length === 0 && !AE) rag = "No tasks";
    else if (wfStage === "Closed" || (data.length > 0 && pct === 1)) rag = "COMPLETE";
    else if (overdue > 0 || (AE && dayInt(AE) < R)) rag = "OVERDUE";
    else if ((S !== null && S <= settings.dueSoonDays) || (AF !== null && AF <= settings.dueSoonDays)) rag = "DUE SOON";
    else rag = "ON TRACK";
    const nWorkflows = Math.max(wfRefs.length, wfs.length, a.nWorkflows || 0);
    const flags = [];
    if (nWorkflows > 1) flags.push("DUPLICATE");
    if (wfStage === "Closed" && open > 0) flags.push("CLOSED w/ OPEN");
    const approvals = list.filter((t) => t.taskClass === "Approval" && t.stage === "Approved").length;
    const rejected = list.filter((t) => t.stage === "Rejected").length;
    const isNew = a.isNew !== undefined ? a.isNew : hasBaseline ? prev === undefined || prev === null : false;
    products.push({
      key,
      product: pl?.product || list[0].product,
      ref: wf?.ref || wfRefs[wfRefs.length - 1] || list[0].ref,
      dosageForm: pl?.process || mode(list.map((t) => t.dosageForm)) || "",
      site: mode(list.map((t) => t.site)) || pl?.site || "",
      owner: a.owner || wf?.assignee || "Unassigned",
      wfStage,
      wfStatus: wf?.status || "",
      wfDue,
      nWorkflows,
      flags,
      isNew,
      dataTasks: data.length,
      completed: done,
      open,
      overdue,
      pct,
      prevPct: prev ?? null,
      movement: prev === undefined || prev === null ? "new" : pct > prev + 1e-9 ? "UP" : pct < prev - 1e-9 ? "DOWN" : "flat",
      daysToDue: S,
      rag,
      openByDept,
      bottleneck,
      approvals,
      rejected,
      plannedMonth: pl?.plannedMonth || "",
      overdueDate: AE,
      daysToOverdue: AF,
      reviewStart: pl ? pl.reviewStart : "",
      reviewEnd: pl ? pl.reviewEnd : "",
      inPlan: !!pl,
      workflowRefs: wfRefs,
      qcRefs,
      comments: a.comments || "",
      priority: a.priority || "",
      tasks: list,
    });
  }
  products.sort((x, y) => x.product.localeCompare(y.product));
  const productByKey = new Map(products.map((p) => [p.key, p]));

  /* --- plan execution columns --- */
  for (const p of plan) {
    const pr = productByKey.get(p.key);
    p.triggered = !!pr;
    p.dataTasks = pr ? pr.dataTasks : 0;
    p.completed = pr ? pr.completed : 0;
    p.pct = pr ? pr.pct : 0;
    p.rag = pr ? pr.rag : "";
    p.daysToOverdue = p.overdueDate ? dayInt(p.overdueDate) - R : null;
    const P = p.daysToOverdue;
    if (!p.triggered) p.tracking = P !== null && P < 0 ? "NOT TRIGGERED - past due" : P !== null && P <= settings.triggerWindowDays ? "NOT TRIGGERED - due soon" : "Not yet triggered";
    else p.tracking = p.pct === 1 ? "Data collection complete" : P !== null && P < 0 ? "OVERDUE - in progress" : "In progress";
  }

  /* --- headline KPIs --- */
  const dataTasks = tasks.filter((t) => t.isData);
  const approvalsAll = tasks.filter((t) => t.taskClass === "Approval");
  const sum = (arr, f) => arr.reduce((s, x) => s + f(x), 0);
  const kpi = {
    planned: plan.length,
    triggered: plan.filter((p) => p.triggered).length,
    productsLive: products.length,
    dataTasks: dataTasks.length,
    completed: dataTasks.filter((t) => t.closed).length,
    overdueTasks: sum(products, (p) => p.overdue),
    unassigned: dataTasks.filter((t) => !t.assignee || t.assignee === "Unassigned").length,
    unassignedOpen: dataTasks.filter((t) => !t.closed && (!t.assignee || t.assignee === "Unassigned")).length,
    productsOverdue: products.filter((p) => p.rag === "OVERDUE").length,
    productsWithOverdueTasks: products.filter((p) => p.overdue > 0).length,
    duplicates: products.filter((p) => p.flags.includes("DUPLICATE")).length,
    closedOut: products.filter((p) => p.wfStage === "Closed").length,
    at100: products.filter((p) => p.dataTasks > 0 && p.pct === 1).length,
    newSince: products.filter((p) => p.isNew).length,
    oncology: products.filter((p) => /oncolog/i.test(p.site)).length,
    elevatedCriticality: tasks.filter((t) => t.criticality && !/^low$/i.test(t.criticality)).length,
    closedWithOpen: products.filter((p) => p.flags.includes("CLOSED w/ OPEN")).length,
    approvals: approvalsAll.length,
    approvalsSigned: approvalsAll.filter((t) => t.stage === "Approved").length,
    rejected: tasks.filter((t) => t.stage === "Rejected").length,
    notTriggeredPastDue: plan.filter((p) => p.tracking === "NOT TRIGGERED - past due").length,
    notTriggeredDueSoon: plan.filter((p) => p.tracking === "NOT TRIGGERED - due soon").length,
  };
  kpi.notTriggered = kpi.planned - kpi.triggered;
  kpi.open = kpi.dataTasks - kpi.completed;
  kpi.completion = kpi.dataTasks ? kpi.completed / kpi.dataTasks : 0;
  kpi.planTriggered = kpi.planned ? kpi.triggered / kpi.planned : 0;

  const movementCurrent = {
    productsLive: kpi.productsLive,
    triggered: kpi.triggered,
    dataTasks: kpi.dataTasks,
    completed: kpi.completed,
    overdueTasks: kpi.overdueTasks,
    unassigned: kpi.unassigned,
    closedOut: kpi.closedOut,
  };

  const count = (arr, f) => { const m = new Map(); for (const x of arr) { const k = f(x); m.set(k, (m.get(k) || 0) + 1); } return m; };
  const statusSplit = count(dataTasks, (t) => t.status || "—");
  const ragCounts = Object.fromEntries([...RAG, "No tasks"].map((r) => [r, products.filter((p) => p.rag === r).length]));
  const byDept = DEPARTMENTS.map((d) => {
    const ts = dataTasks.filter((t) => t.dept === d);
    const c = ts.filter((t) => t.closed).length;
    return { dept: d, completed: c, open: ts.length - c, total: ts.length, overdue: ts.filter((t) => t.overdue === "YES").length };
  });
  const otherDept = dataTasks.filter((t) => !DEPARTMENTS.includes(t.dept));
  const stages = [...count(dataTasks, (t) => t.stage || "—")].sort((a, b) => stageIdx(a[0]) - stageIdx(b[0])).map(([stage, n]) => ({ stage, n }));
  const forms = [...new Set(plan.map((p) => p.process).filter(Boolean))].map((f) => ({ form: f, planned: plan.filter((p) => p.process === f).length, triggered: plan.filter((p) => p.process === f && p.triggered).length })).sort((a, b) => b.planned - a.planned);

  /* --- owner workload --- */
  const owners = new Map();
  for (const t of tasks) {
    if (t.taskClass === "Workflow") continue;
    const u = t.assignee || "Unassigned";
    if (!owners.has(u)) owners.set(u, { user: u, dataTasks: 0, completed: 0, open: 0, overdue: 0, approvals: 0, earliestDue: "", depts: {} });
    const o = owners.get(u);
    if (t.taskClass === "Approval") { o.approvals++; continue; }
    if (!t.isData) continue;
    o.dataTasks++;
    o.depts[t.dept] = (o.depts[t.dept] || 0) + 1;
    if (t.closed) o.completed++;
    else {
      o.open++;
      if (t.overdue === "YES") o.overdue++;
      if (t.due && (!o.earliestDue || t.due < o.earliestDue)) o.earliestDue = t.due;
    }
  }
  const workload = [...owners.values()].map((o) => ({
    ...o,
    pct: o.dataTasks ? o.completed / o.dataTasks : 0,
    status: o.overdue > 0 ? "ACTION - overdue items" : o.open === 0 ? "Clear" : "In progress",
    mainDept: Object.entries(o.depts).sort((a, b) => b[1] - a[1])[0]?.[0] || "",
  })).sort((a, b) => b.open - a.open || b.overdue - a.overdue || a.user.localeCompare(b.user));

  /* --- months (planned PQR month) --- */
  const monthKeys = [...new Set(plan.map((p) => p.plannedMonth).filter(Boolean))].sort();
  const months = monthKeys.map((m) => {
    const rows = plan.filter((p) => p.plannedMonth === m);
    const keys = new Set(rows.map((p) => p.key));
    const annexes = dataTasks.filter((t) => keys.has(t.key));
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
    return { month: m, planned: rows.length, triggered, annexes: annexes.length, completed: done, pct, overdueFrom, status, products: rows, matrix: annexMatrix(annexes) };
  });
  const offPlan = products.filter((p) => !p.inPlan);
  const offPlanMatrix = annexMatrix(dataTasks.filter((t) => !planByKey.has(t.key)));

  /* --- data quality signals --- */
  const quality = [];
  const push = (level, title, detail, items = []) => quality.push({ level, title, detail, items });
  const closedOpen = products.filter((p) => p.flags.includes("CLOSED w/ OPEN"));
  if (closedOpen.length) push("serious", "Workflows closed with open annexes", "The APQR is closed in Scigeniq while data-collection annexes beneath it are still open. Confirm before relying on these reviews.", closedOpen.map((p) => ({ key: p.key, label: `${p.ref} · ${p.product}`, note: `${p.open} of ${p.dataTasks} open` })));
  const dups = products.filter((p) => p.flags.includes("DUPLICATE"));
  if (dups.length) push("warning", "Duplicate workflows", "Products carrying more than one APQR workflow. Superseded workflows inflate overdue counts; consider cancelling them in Scigeniq.", dups.map((p) => ({ key: p.key, label: p.product, note: p.workflowRefs.join(" / ") })));
  const rej = tasks.filter((t) => t.stage === "Rejected");
  if (rej.length) push("serious", "Rejected approvals", "Approval signatures rejected at departmental or final review.", rej.map((t) => ({ key: t.key, label: `${t.ref} · ${t.product}`, note: t.closedOn ? `closed ${t.closedOn.slice(0, 10)}` : "" })));
  const lateMonths = months.filter((m) => m.status === "NOT STARTED - overdue");
  if (lateMonths.length) push("critical", "Planned months with no workflow triggered", "Review periods have closed and the PQR overdue date has passed, but no workflow has been started.", lateMonths.map((m) => ({ month: m.month, label: monthLabel(m.month), note: `${m.planned} products` })));
  const pastDue = plan.filter((p) => p.tracking === "NOT TRIGGERED - past due");
  if (pastDue.length) push("critical", "Planned products past due and not triggered", "In the approved plan, past their PQR overdue date, with no workflow in Scigeniq.", pastDue.map((p) => ({ key: p.key, label: p.product, note: `overdue since ${p.overdueDate}` })));
  const soon = plan.filter((p) => p.tracking === "NOT TRIGGERED - due soon");
  if (soon.length) push("warning", `Not triggered, due within ${settings.triggerWindowDays} days`, "Workflows that should be started soon to meet the PQR commitment.", soon.map((p) => ({ key: p.key, label: p.product, note: `due ${p.overdueDate}` })));
  if (offPlan.length) push("info", "Products with tasks but not in the plan", "These carry Scigeniq tasks but have no row in the approved plan, so they have no planned month or due date. Check the product name matches the plan exactly.", offPlan.map((p) => ({ key: p.key, label: p.product, note: `${p.dataTasks} annexes` })));
  if (kpi.unassignedOpen) push("warning", "Open annexes with no assigned user", `${kpi.unassignedOpen} open data-collection tasks are unassigned.`, []);
  const sysOverdue = dataTasks.filter((t) => !t.closed && /overdue/i.test(t.status)).length;
  const calcOverdue = dataTasks.filter((t) => t.overdue === "YES").length;
  if (sysOverdue !== calcOverdue) push("info", "Overdue: system flag vs PQR due date", `Scigeniq flags ${sysOverdue} open annexes as Overdue against their own task end date; ${calcOverdue} are overdue against the parent PQR due date used here. Reconcile before quoting figures.`, []);
  if (otherDept.length) push("info", "Tasks with an unrecognised department", `${otherDept.length} data tasks could not be mapped to QA, QC, Production, RA, Validation or Compliance.`, []);

  return {
    report, settings, plan, tasks, products, productByKey, planByKey, kpi, movementCurrent,
    statusSplit, ragCounts, byDept, stages, forms, workload, months, offPlan, offPlanMatrix, quality,
    owners: [...new Set(tasks.map((t) => t.assignee).filter(Boolean))].sort(),
  };
}

function stageIdx(s) { const i = STAGE_ORDER.indexOf(s); return i < 0 ? 99 : i; }

/** Department x stage counts for a set of annexes, with "Total general" row. */
export function annexMatrix(annexes) {
  const stages = [...new Set(annexes.map((t) => t.stage || "—"))].sort((a, b) => stageIdx(a) - stageIdx(b));
  if (!stages.length) stages.push("Collecting Data", "Data Review", "Completed");
  const rows = DEPARTMENTS.map((d) => {
    const ts = annexes.filter((t) => t.dept === d);
    const counts = Object.fromEntries(stages.map((s) => [s, ts.filter((t) => (t.stage || "—") === s).length]));
    return { dept: d, counts, total: ts.length };
  });
  const totalCounts = Object.fromEntries(stages.map((s) => [s, rows.reduce((n, r) => n + r.counts[s], 0)]));
  return { stages, rows, total: { dept: "Total", counts: totalCounts, total: rows.reduce((n, r) => n + r.total, 0) } };
}

export const MOVEMENT_METRICS = [
  ["productsLive", "Products with a live workflow"],
  ["triggered", "Workflows triggered vs plan"],
  ["dataTasks", "Data-collection tasks"],
  ["completed", "Tasks completed"],
  ["overdueTasks", "Overdue tasks"],
  ["unassigned", "Unassigned tasks"],
  ["closedOut", "Workflows closed out"],
];
/** For these metrics a rise is bad news. */
export const UP_IS_BAD = new Set(["overdueTasks", "unassigned"]);

/** Snapshot the current figures as the comparison baseline. */
export function snapshotBaseline(model, label) {
  return {
    label,
    date: model.report,
    metrics: { ...model.movementCurrent },
    prevPct: Object.fromEntries(model.products.map((p) => [p.key, p.pct])),
  };
}
