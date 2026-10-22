// Pure APQR programme logic: dates, task and product evaluation, programme KPIs,
// numbering, filtering, CSV and import mapping. No DOM access, so it runs under
// `node --test` as well as in the browser.

import { DEPARTMENTS, PHASES, COMMITTEE, REQUIREMENTS } from "./sop.js";

export const DEPT_IDS = DEPARTMENTS.map((d) => d.id);
export const FORMS = ["Tablets", "Hard Capsule", "Liquid/Syrup", "Semi Solid"];
export const TASK_STAGES = ["Batches Selection", "Data Collection", "Collecting Data", "Data Review", "Completed"];
export const TASK_STATUSES = ["Open", "Overdue", "Completed", "Cancelled"];
export const RAG = ["COMPLETE", "ON TRACK", "DUE SOON", "OVERDUE"];
export const ROUTES = ["Scigeniq", "QMex"];
export const UNASSIGNED = "Unassigned";

export const DEFAULT_SETTINGS = {
  asOfMode: "snapshot", // "snapshot" | "today" | "custom"
  asOf: "2026-07-28",
  lagDays: 90, // SOPQA0021E §10.3.6: complete within 3 months of the period end
  dueSoonDays: 14,
  triggerWindowDays: 60,
  userName: "",
};

// ---------- dates (local calendar days; times are ignored for comparisons) ----------

const DAY = 86400000;

/** Whole-day number for "YYYY-MM-DD" or "YYYY-MM-DDTHH:mm" (or a Date), or null. */
export function dayNumber(value) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()) / DAY;
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value ?? ""));
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / DAY : null;
}

export function fromDayNumber(n) {
  const d = new Date(n * DAY);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

export function todayIso(now = new Date()) {
  return fromDayNumber(dayNumber(now));
}

/** Local "YYYY-MM-DDTHH:mm" for the current moment. */
export function nowStamp(now = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${todayIso(now)}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

export function addDays(iso, n) {
  const d = dayNumber(iso);
  return d === null ? "" : fromDayNumber(d + n);
}

/** Days from `a` to `b` (positive when b is later), or null if either is missing. */
export function daysBetween(a, b) {
  const x = dayNumber(a);
  const y = dayNumber(b);
  return x === null || y === null ? null : y - x;
}

const isMonth = (ym) => /^\d{4}-\d{2}$/.test(String(ym ?? ""));

export function monthStart(ym) {
  return isMonth(ym) ? `${ym}-01` : "";
}

export function monthEnd(ym) {
  if (!isMonth(ym)) return "";
  const [y, m] = ym.split("-").map(Number);
  return fromDayNumber(Date.UTC(y, m, 1) / DAY - 1);
}

export function monthOf(iso) {
  return /^\d{4}-\d{2}/.test(String(iso ?? "")) ? String(iso).slice(0, 7) : "";
}

export function addMonths(ym, n) {
  if (!isMonth(ym)) return "";
  const [y, m] = ym.split("-").map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
}

export function monthsBetween(a, b) {
  if (!isMonth(a) || !isMonth(b)) return null;
  const [ya, ma] = a.split("-").map(Number);
  const [yb, mb] = b.split("-").map(Number);
  return (yb * 12 + mb) - (ya * 12 + ma);
}

/** Resolve the "as of" day used for every overdue / due-soon calculation. */
export function resolveAsOf(settings, now = new Date()) {
  if (settings.asOfMode === "today") return todayIso(now);
  return dayNumber(settings.asOf) === null ? todayIso(now) : String(settings.asOf).slice(0, 10);
}

// ---------- numbering (SOPQA0021E §10.6 and §10.8.1) ----------

export function mmyy(ym) {
  return isMonth(ym) ? `${ym.slice(5, 7)}${ym.slice(2, 4)}` : "";
}

/** APQR/<final product code>/<MMYY of the planned report month>. */
export function apqrNumber(product) {
  return product.code && isMonth(product.plannedMonth) ? `APQR/${product.code}/${mmyy(product.plannedMonth)}` : "";
}

/** <final product code>/<MMYY>/<PR|QC|QA|VL|RA|SR>. */
export function annexNumber(product, annexCode) {
  return product.code && isMonth(product.plannedMonth) ? `${product.code}/${mmyy(product.plannedMonth)}/${annexCode}` : "";
}

// ---------- names ----------

/** Normalised product name used to match Scigeniq exports to the plan. */
export function normName(s) {
  return String(s ?? "")
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/-\s*(ELKENDI|MSPS)\s*$/, "")
    .replace(/,/g, ".")
    .replace(/\bF\/C\b/g, "FC")
    .replace(/[^A-Z0-9.%/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** "CILAGRA (Sildenafil) 50 mg Tablets (2 TAB)" → { brand: "CILAGRA", rest: "(Sildenafil) 50 mg Tablets (2 TAB)" }. */
export function splitName(name) {
  const m = /^([^(]+?)\s*(\(.*)$/.exec(String(name ?? ""));
  return m ? { brand: m[1].trim(), rest: m[2] } : { brand: String(name ?? ""), rest: "" };
}

// ---------- state construction ----------

export function rowsToObjects(fields, rows) {
  return rows.map((r) => Object.fromEntries(fields.map((f, i) => [f, r[i]])));
}

export function blankProductExtras() {
  return {
    owner: "", route: "", phase: "", batches: null, comments: "", conclusion: "", closedOn: "",
    statsDone: false, studies: [],
    capa: { previous: "", required: "", refs: "", conclusion: "" },
    committee: {}, requirements: {},
  };
}

export function createState({ meta, productFields, productRows, taskFields, taskRows }) {
  const products = rowsToObjects(productFields, productRows).map((p) => ({
    ...p, ...blankProductExtras(), route: p.scigeniqNo ? "Scigeniq" : p.planNo ? "QMex" : "Scigeniq",
  }));
  const tasks = rowsToObjects(taskFields, taskRows).map((t, i) => ({ id: `T${String(i + 1).padStart(4, "0")}`, ...t }));
  return { version: 1, meta: structuredClone(meta), settings: { ...DEFAULT_SETTINGS, asOf: meta.snapshot || DEFAULT_SETTINGS.asOf }, products, tasks, log: [] };
}

// ---------- evaluation ----------

export function isDone(task) {
  return task.status === "Completed";
}

export function evaluateTask(task, asOf) {
  const done = isDone(task);
  const cancelled = task.status === "Cancelled";
  const open = !done && !cancelled;
  const dueDays = daysBetween(asOf, task.due);
  return {
    ...task,
    done, cancelled, open,
    overdue: open && dueDays !== null && dueDays < 0,
    systemOverdue: task.status === "Overdue",
    daysToDue: open ? dueDays : null,
    ageing: daysBetween(task.start || task.created, done ? (task.closedOn || asOf) : asOf),
    unassigned: !task.user || task.user === UNASSIGNED,
  };
}

const committeeApproved = (p) => COMMITTEE.every((r) => p.committee?.[r]?.decision === "Approved");

export function committeeProgress(p) {
  const approved = COMMITTEE.filter((r) => p.committee?.[r]?.decision === "Approved").length;
  const returned = COMMITTEE.some((r) => p.committee?.[r]?.decision === "Returned");
  return { approved, total: COMMITTEE.length, returned };
}

export function requirementProgress(p) {
  let done = 0, na = 0, progress = 0;
  for (const r of REQUIREMENTS) {
    const s = p.requirements?.[r.id]?.status || "";
    if (s === "done") done++;
    else if (s === "na") na++;
    else if (s === "progress") progress++;
  }
  const applicable = REQUIREMENTS.length - na;
  return { done, na, progress, applicable, pct: applicable ? done / applicable : 1 };
}

function derivePhase(p, ev) {
  if (p.phase) return p.phase;
  if (p.closedOn || committeeApproved(p)) return "closed";
  if (!ev.triggered) return "planned";
  if (ev.stage === "Completed") return "closed";
  if (ev.stage === "Batches Selection") return "batches";
  if (ev.dataOpen > 0) return "collection";
  if (p.capa?.required) return "final";
  if (p.statsDone) return "capa";
  return "statistics";
}

/**
 * Evaluate one product against its tasks. `tasks` are already evaluated and belong
 * to this product. Mirrors the "APQR Tracker" and "APQR Plan 2026" sheets of the
 * master tracker workbook, plus the SOP milestones.
 */
export function evaluateProduct(p, tasks, settings, asOf) {
  const active = tasks.filter((t) => !t.cancelled);
  const wfTasks = active.filter((t) => t.type === "APQR").sort((a, b) => String(b.created).localeCompare(String(a.created)));
  const primary = wfTasks[0] || null;
  const refs = [...new Set(wfTasks.map((t) => t.ref))];
  const data = active.filter((t) => t.type !== "APQR");
  const completed = active.filter((t) => t.done).length;
  const open = active.filter((t) => t.open).length;
  const overdue = active.filter((t) => t.overdue).length;
  const deptOpen = Object.fromEntries(DEPT_IDS.map((d) => [d, 0]));
  const deptTotal = Object.fromEntries(DEPT_IDS.map((d) => [d, 0]));
  for (const t of active) {
    if (t.dept in deptTotal) deptTotal[t.dept]++;
    if (t.open && t.dept in deptOpen) deptOpen[t.dept]++;
  }
  let bottleneck = "";
  let max = 0;
  for (const d of DEPT_IDS) if (deptOpen[d] > max) { max = deptOpen[d]; bottleneck = d; }

  const triggered = active.length > 0;
  const wfDue = primary?.due || "";
  const wfDaysToDue = primary && primary.open ? daysBetween(asOf, wfDue) : null;

  const ev = {
    triggered, refs, primaryRef: primary?.ref || refs[0] || (active[0]?.ref ?? ""),
    duplicate: refs.length > 1,
    owner: p.owner || primary?.user || "",
    stage: primary?.stage || (triggered ? "Not in export" : ""),
    wfStatus: primary?.status || "",
    wfDue, wfDaysToDue,
    total: active.length, completed, open, overdue,
    dataOpen: data.filter((t) => t.open).length,
    pct: active.length ? completed / active.length : 0,
    deptOpen, deptTotal, bottleneck,
    systemOverdue: active.filter((t) => t.systemOverdue).length,
    unassigned: active.filter((t) => t.open && t.unassigned).length,
  };

  let rag = null;
  if (triggered) {
    if (open === 0) rag = "COMPLETE";
    else if (overdue > 0) rag = "OVERDUE";
    else if (wfDaysToDue !== null && wfDaysToDue <= settings.dueSoonDays) rag = "DUE SOON";
    else rag = "ON TRACK";
  }

  const phase = derivePhase(p, ev);
  const reportDue = p.periodEnd ? addDays(monthEnd(p.periodEnd), settings.lagDays) : "";
  const annexDue = p.plannedMonth ? addDays(monthStart(p.plannedMonth), 30) : "";
  const finalDue = p.plannedMonth ? addDays(monthStart(p.plannedMonth), 90) : "";
  const daysToReportDue = reportDue ? daysBetween(asOf, reportDue) : null;
  const closed = phase === "closed";

  let planStatus;
  if (closed) planStatus = "Closed";
  else if (triggered) planStatus = "In progress";
  else if (daysToReportDue !== null && daysToReportDue < 0) planStatus = "Past due";
  else if (daysToReportDue !== null && daysToReportDue <= settings.triggerWindowDays) planStatus = "Due ≤ 60 d";
  else planStatus = "Not triggered";

  const periodMonths = p.periodStart && p.periodEnd ? monthsBetween(p.periodStart, p.periodEnd) + 1 : null;
  const flags = [];
  if (ev.duplicate) flags.push({ kind: "duplicate", text: `${refs.length} APQR workflows in Scigeniq (${refs.join(", ")})` });
  if (periodMonths !== null && periodMonths < 1) flags.push({ kind: "period", text: `Review period ends before it starts (${p.periodStart} → ${p.periodEnd})` });
  else if (periodMonths !== null && periodMonths > 18) flags.push({ kind: "period", text: `Review period spans ${periodMonths} months; SOP allows 12, extendable by 6 for campaigns` });
  if (p.scigeniqStart && (p.scigeniqStart !== p.periodStart || p.scigeniqEnd !== p.periodEnd)) {
    flags.push({ kind: "mismatch", text: `Scigeniq plan period ${p.scigeniqStart} → ${p.scigeniqEnd} differs from the annual plan ${p.periodStart} → ${p.periodEnd}` });
  }
  if (!p.planNo) flags.push({ kind: "unplanned", text: "Has Scigeniq tasks but is not in the 2026 annual plan" });
  else if (!p.scigeniqNo && p.route !== "QMex") flags.push({ kind: "scope", text: "In the annual plan but not in the Scigeniq plan PQRP-KE-1" });
  if (Number.isFinite(p.batches) && p.batches < 20) {
    flags.push({ kind: "batches", text: `${p.batches} batches: under 20, extend back up to 6 months or defer statistics (§10.3.5)` });
  }

  return {
    ...p,
    ...ev,
    apqrNo: apqrNumber(p),
    rag, phase, phaseIndex: PHASES.findIndex((x) => x.id === phase),
    closed, planStatus, reportDue, annexDue, finalDue, daysToReportDue, periodMonths, flags,
    committee: p.committee || {},
    reqProgress: requirementProgress(p),
    committeeProgress: committeeProgress(p),
  };
}

/** Evaluate everything once per render. */
export function deriveProgramme(state, now = new Date()) {
  const asOf = resolveAsOf(state.settings, now);
  const tasks = state.tasks.map((t) => evaluateTask(t, asOf));
  const tasksByProduct = new Map();
  for (const t of tasks) {
    if (!tasksByProduct.has(t.productId)) tasksByProduct.set(t.productId, []);
    tasksByProduct.get(t.productId).push(t);
  }
  const products = state.products.map((p) => evaluateProduct(p, tasksByProduct.get(p.id) || [], state.settings, asOf));
  const productById = new Map(products.map((p) => [p.id, p]));
  for (const t of tasks) {
    const p = productById.get(t.productId);
    t.productName = p?.name ?? t.productId;
    t.form = p?.form ?? "";
    t.code = p?.code ?? "";
  }
  return { asOf, tasks, products, productById, tasksByProduct };
}

// ---------- programme KPIs ----------

export function inScope(p, scope) {
  if (scope === "scigeniq") return Boolean(p.scigeniqNo);
  if (scope === "annual") return Boolean(p.planNo) && !p.scigeniqNo;
  return true;
}

export function programmeKpis(products, tasks, asOf) {
  const planned = products.filter((p) => p.planNo);
  const live = products.filter((p) => p.triggered);
  const count = (arr, fn) => arr.reduce((n, x) => n + (fn(x) ? 1 : 0), 0);
  const activeTasks = tasks.filter((t) => !t.cancelled);
  const k = {
    asOf,
    products: products.length,
    planned: planned.length,
    inScigeniqPlan: count(products, (p) => p.scigeniqNo),
    annualOnly: count(products, (p) => p.planNo && !p.scigeniqNo),
    triggered: live.length,
    plannedTriggered: count(planned, (p) => p.triggered),
    closed: count(products, (p) => p.closed),
    notTriggered: count(planned, (p) => !p.triggered && !p.closed),
    pastDue: count(products, (p) => p.planStatus === "Past due"),
    dueSoon: count(products, (p) => p.planStatus === "Due ≤ 60 d"),
    duplicates: count(products, (p) => p.duplicate),
    productsOverdue: count(products, (p) => p.overdue > 0),
    tasks: activeTasks.length,
    completed: count(activeTasks, (t) => t.done),
    open: count(activeTasks, (t) => t.open),
    overdue: count(activeTasks, (t) => t.overdue),
    systemOverdue: count(activeTasks, (t) => t.systemOverdue),
    unassignedOpen: count(activeTasks, (t) => t.open && t.unassigned),
    unassigned: count(activeTasks, (t) => t.unassigned),
    cancelled: count(tasks, (t) => t.cancelled),
  };
  k.pctTriggered = k.planned ? k.plannedTriggered / k.planned : 0;
  k.pctCompleted = k.tasks ? k.completed / k.tasks : 0;
  k.rag = Object.fromEntries(RAG.map((r) => [r, count(live, (p) => p.rag === r)]));
  k.phases = Object.fromEntries(PHASES.map((ph) => [ph.id, count(products, (p) => p.phase === ph.id)]));
  return k;
}

export function byDepartment(tasks) {
  return DEPT_IDS.map((d) => {
    const rows = tasks.filter((t) => t.dept === d && !t.cancelled);
    return {
      dept: d,
      total: rows.length,
      completed: rows.filter((t) => t.done).length,
      open: rows.filter((t) => t.open).length,
      overdue: rows.filter((t) => t.overdue).length,
    };
  });
}

export function byStage(tasks) {
  return TASK_STAGES.map((stage) => ({ stage, count: tasks.filter((t) => t.stage === stage && !t.cancelled).length }));
}

export function byForm(products) {
  return FORMS.map((form) => {
    const rows = products.filter((p) => p.form === form && p.planNo);
    return { form, planned: rows.length, triggered: rows.filter((p) => p.triggered).length, closed: rows.filter((p) => p.closed).length };
  });
}

/** Plan months (YYYY-MM) with their products in plan order, for the calendar and unit chart. */
export function byPlannedMonth(products) {
  const months = new Map();
  for (const p of products) {
    if (!p.plannedMonth) continue;
    if (!months.has(p.plannedMonth)) months.set(p.plannedMonth, []);
    months.get(p.plannedMonth).push(p);
  }
  return [...months.entries()].sort(([a], [b]) => a.localeCompare(b))
    .map(([month, rows]) => ({ month, products: rows.sort((a, b) => (a.planNo ?? 1e9) - (b.planNo ?? 1e9)) }));
}

/** Status bucket of a product for the plan unit chart and calendar. */
export function planBucket(p) {
  if (p.closed) return "closed";
  if (p.triggered) return p.overdue > 0 ? "late" : "live";
  if (p.planStatus === "Past due") return "pastdue";
  return "waiting";
}

export function workload(tasks) {
  const users = new Map();
  for (const t of tasks) {
    if (t.cancelled) continue;
    const name = t.user || UNASSIGNED;
    if (!users.has(name)) users.set(name, { user: name, total: 0, completed: 0, open: 0, overdue: 0, earliestDue: "", depts: {}, products: new Set() });
    const u = users.get(name);
    u.total++;
    u.depts[t.dept] = (u.depts[t.dept] || 0) + 1;
    u.products.add(t.productId);
    if (t.done) u.completed++;
    if (t.open) {
      u.open++;
      if (t.due && (!u.earliestDue || t.due < u.earliestDue)) u.earliestDue = t.due;
    }
    if (t.overdue) u.overdue++;
  }
  return [...users.values()].map((u) => ({
    ...u,
    products: u.products.size,
    pct: u.total ? u.completed / u.total : 0,
    mainDept: Object.entries(u.depts).sort((a, b) => b[1] - a[1])[0]?.[0] || "",
    status: u.overdue ? "Overdue items" : u.open ? "In progress" : "Clear",
  }));
}

/** Weekly cumulative created vs closed counts for the burn-up chart. */
export function burnUp(tasks, asOf) {
  const rows = tasks.filter((t) => !t.cancelled);
  const created = rows.map((t) => dayNumber(t.created || t.start)).filter((d) => d !== null);
  if (!created.length) return [];
  const end = dayNumber(asOf);
  const first = Math.min(...created);
  // Weeks start on Monday: day 0 (1970-01-01) was a Thursday.
  const start = first - ((first + 3) % 7);
  const closedDays = rows.filter((t) => t.done).map((t) => dayNumber(t.closedOn)).filter((d) => d !== null);
  const points = [];
  for (let d = start; d <= end + 6; d += 7) {
    const cut = Math.min(d + 6, end);
    points.push({
      week: fromDayNumber(d),
      created: created.filter((x) => x <= cut).length,
      closed: closedDays.filter((x) => x <= cut).length,
    });
    if (cut === end) break;
  }
  return points;
}

/** Prioritised list of things QA should act on. */
export function attentionItems(products, tasks, k) {
  const items = [];
  const overdueTasks = tasks.filter((t) => t.overdue).sort((a, b) => a.daysToDue - b.daysToDue);
  for (const t of overdueTasks.slice(0, 6)) {
    items.push({ level: "critical", kind: "task", id: t.id, productId: t.productId,
      title: `${t.title} · ${shortProduct(t.productName)}`, detail: `${-t.daysToDue} d overdue · ${t.user} · ${t.dept}` });
  }
  const dups = products.filter((x) => x.duplicate);
  if (dups.length === 1) {
    const p = dups[0];
    items.push({ level: "serious", kind: "duplicate", productId: p.id,
      title: `Duplicate workflows · ${shortProduct(p.name)}`, detail: `${p.refs.join(", ")}: cancel the superseded ones in Scigeniq` });
  } else if (dups.length > 1) {
    items.push({ level: "serious", kind: "duplicates", title: `${dups.length} products have duplicate APQR workflows`,
      detail: `${dups.map((p) => shortProduct(p.name)).join(", ")}: cancel the superseded ones` });
  }
  if (k.pastDue) {
    items.push({ level: "serious", kind: "pastdue", title: `${k.pastDue} planned APQRs past report due and not triggered`,
      detail: "Report due = end of review period + 3 months (§10.3.6)" });
  }
  if (k.dueSoon) {
    items.push({ level: "warning", kind: "duesoon", title: `${k.dueSoon} APQRs reach report due within 60 days`, detail: "Trigger the review in Scigeniq" });
  }
  if (k.unassignedOpen) {
    items.push({ level: "warning", kind: "unassigned", title: `${k.unassignedOpen} open tasks have no assignee`, detail: "Assign a data collection owner" });
  }
  const annualOnly = products.filter((p) => p.planNo && !p.scigeniqNo && !p.closed && !p.triggered);
  if (annualOnly.length) {
    items.push({ level: "warning", kind: "scope", title: `${annualOnly.length} annual-plan products are not in the Scigeniq plan`,
      detail: "Confirm whether they were issued in QMex and record their closure" });
  }
  const mismatches = products.filter((p) => p.flags.some((f) => f.kind === "mismatch" || f.kind === "period"));
  if (mismatches.length) {
    items.push({ level: "info", kind: "mismatch", title: `${mismatches.length} review periods to check`, detail: "Annual plan differs from Scigeniq plan PQRP-KE-1, or the period is not 12 months" });
  }
  return items;
}

export function shortProduct(name) {
  const { brand, rest } = splitName(name);
  const strength = /\)\s*([^()]*?\d[^()]*?)(?:\s+(?:F\/C|Tablets?|Capsules?|Gel|Cream|Ointment|Syrup|Oral|Scored|Sustained|Extended|Dispersible|Oro|Chewable)|\s*\(|$)/i.exec(rest);
  return strength ? `${brand} ${strength[1].trim()}` : brand;
}

// ---------- generic helpers ----------

export function compareValues(a, b) {
  const empty = (v) => v === null || v === undefined || v === "";
  if (empty(a) && empty(b)) return 0;
  if (empty(a)) return 1;
  if (empty(b)) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

export function sortRows(rows, key, direction = "asc", accessor = (r, k) => r[k]) {
  const dir = direction === "desc" ? -1 : 1;
  return [...rows].sort((a, b) => {
    const va = accessor(a, key);
    const vb = accessor(b, key);
    const empty = (v) => v === null || v === undefined || v === "";
    if (empty(va) !== empty(vb)) return empty(va) ? 1 : -1; // blanks last either way
    return dir * compareValues(va, vb);
  });
}

export function matchesQuery(query, ...fields) {
  const q = String(query ?? "").trim().toLowerCase();
  if (!q) return true;
  const hay = fields.join(" ").toLowerCase();
  return q.split(/\s+/).every((w) => hay.includes(w));
}

// ---------- CSV ----------

export function toCsv(rows, columns) {
  const cell = (v) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n\r]/.test(s) || /^[=+\-@]/.test(s) ? `"${(/^[=+\-@]/.test(s) ? "'" : "") + s.replace(/"/g, '""')}"` : s;
  };
  const lines = [columns.map((c) => cell(c.label)).join(",")];
  for (const r of rows) lines.push(columns.map((c) => cell(c.value(r))).join(","));
  return lines.join("\r\n");
}

export function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  const s = String(text ?? "").replace(/^﻿/, "");
  const delimiter = (s.split(/\r?\n/, 1)[0].match(/;/g) || []).length > (s.split(/\r?\n/, 1)[0].match(/,/g) || []).length ? ";" : ",";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === delimiter) { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((v) => String(v).trim() !== ""));
}

// ---------- Scigeniq task import ----------

const TASK_HEADERS = {
  ref: ["reference id", "reference", "ref", "reference no", "apqr ref"],
  product: ["product", "product name"],
  form: ["dosage form", "process", "form"],
  site: ["site"],
  dept: ["department", "dept"],
  stream: ["data stream", "stream", "sub process", "category"],
  type: ["task type", "type"],
  title: ["task title", "title", "task"],
  stage: ["workflow stage", "stage", "current stage"],
  status: ["status", "task status"],
  user: ["assigned user", "assigned to", "assignee", "user"],
  created: ["created", "created on", "creation date"],
  start: ["start", "start date"],
  due: ["due", "due date"],
  closedOn: ["closed on", "closed", "closure date"],
};

const headerKey = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Find the header row and map columns. Returns null when the sheet is not a task export. */
export function mapTaskHeader(rows) {
  for (let r = 0; r < Math.min(rows.length, 15); r++) {
    const cells = rows[r].map(headerKey);
    const map = {};
    for (const [field, names] of Object.entries(TASK_HEADERS)) {
      const idx = cells.findIndex((c) => names.includes(c));
      if (idx >= 0) map[field] = idx;
    }
    if ("ref" in map && "product" in map && "status" in map && ("dept" in map || "title" in map)) return { headerRow: r, map };
  }
  return null;
}

/** Normalise a spreadsheet date cell (Date, Excel serial, dd/mm/yyyy[ hh:mm] or ISO) to "YYYY-MM-DDTHH:mm". */
export function normaliseDateCell(v) {
  if (v === null || v === undefined || v === "") return "";
  const pad = (n) => String(n).padStart(2, "0");
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}T${pad(v.getHours())}:${pad(v.getMinutes())}`;
  }
  if (typeof v === "number" && v > 20000 && v < 80000) {
    const ms = Math.round((v - 25569) * DAY);
    const d = new Date(ms);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
  }
  const s = String(v).trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2}))?/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}T${pad(m[4] ?? 0)}:${m[5] ?? "00"}`;
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?:\s+(\d{1,2}):(\d{2}))?/.exec(s);
  if (m) return `${m[3]}-${pad(m[2])}-${pad(m[1])}T${pad(m[4] ?? 0)}:${m[5] ?? "00"}`;
  return "";
}

const FORM_ALIASES = [[/tab/i, "Tablets"], [/caps/i, "Hard Capsule"], [/liquid|syrup|solution|drop|suspension/i, "Liquid/Syrup"], [/semi|gel|cream|ointment/i, "Semi Solid"]];

/**
 * Convert spreadsheet rows (array of arrays) to task records linked to products.
 * Products not found by normalised name are returned in `newProducts`.
 */
export function importTasks(rows, products) {
  const header = mapTaskHeader(rows);
  if (!header) return { error: "No task table found. The sheet needs columns such as Reference ID, Product, Department, Status and Due." };
  const { headerRow, map } = header;
  const index = new Map();
  for (const p of products) {
    index.set(normName(p.name), p.id);
    if (p.scigeniqName) index.set(normName(p.scigeniqName), p.id);
  }
  const newProducts = new Map();
  const tasks = [];
  const get = (row, f) => (f in map ? row[map[f]] : "");
  for (const row of rows.slice(headerRow + 1)) {
    const ref = String(get(row, "ref") ?? "").trim();
    const product = String(get(row, "product") ?? "").trim();
    if (!ref || !product) continue;
    const key = normName(product);
    let productId = index.get(key);
    if (!productId) {
      const site = String(get(row, "site") || (/-\s*(\w+)\s*$/.exec(product)?.[1] ?? "ELKENDI")).trim();
      productId = `${key.split(" ")[0]}-${site}`.replace(/[^A-Z0-9-]+/gi, "-").toUpperCase();
      if (!newProducts.has(productId)) {
        const formRaw = String(get(row, "form") ?? "");
        newProducts.set(productId, {
          id: productId, code: "", name: product.replace(/-\s*(ELKENDI|MSPS)\s*$/, "").trim(),
          form: FORMS.includes(formRaw) ? formRaw : (FORM_ALIASES.find(([re]) => re.test(formRaw))?.[1] ?? formRaw),
          site, plannedMonth: "", prevReport: "", periodStart: "", periodEnd: "", planNo: null,
          scigeniqNo: null, scigeniqName: product, scigeniqStart: "", scigeniqEnd: "",
          ...blankProductExtras(), route: "Scigeniq",
        });
      }
      index.set(key, productId);
    }
    const type = String(get(row, "type") ?? "").trim();
    const status = String(get(row, "status") ?? "").trim();
    tasks.push({
      ref, productId,
      dept: String(get(row, "dept") ?? "").trim(),
      stream: String(get(row, "stream") ?? "").trim(),
      type,
      title: type === "APQR" ? "APQR workflow" : String(get(row, "title") ?? "").trim(),
      stage: String(get(row, "stage") ?? "").trim(),
      status: TASK_STATUSES.includes(status) ? status : /complet|closed/i.test(status) ? "Completed" : /overdue/i.test(status) ? "Overdue" : "Open",
      user: String(get(row, "user") ?? "").trim() || UNASSIGNED,
      created: normaliseDateCell(get(row, "created")),
      start: normaliseDateCell(get(row, "start")),
      due: normaliseDateCell(get(row, "due")),
      closedOn: normaliseDateCell(get(row, "closedOn")),
    });
  }
  if (!tasks.length) return { error: "The task table has a header but no rows." };
  return { tasks: tasks.map((t, i) => ({ id: `T${String(i + 1).padStart(4, "0")}`, ...t })), newProducts: [...newProducts.values()] };
}

/** Field-level differences between two flat records (used for the audit trail). */
export function diffFields(before, after, fields) {
  const out = [];
  for (const f of fields ?? new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])) {
    const a = before?.[f];
    const b = after?.[f];
    if (JSON.stringify(a ?? "") !== JSON.stringify(b ?? "")) out.push({ field: f, from: a ?? "", to: b ?? "" });
  }
  return out;
}

export function nextTaskId(tasks) {
  const max = tasks.reduce((m, t) => Math.max(m, Number(/^T(\d+)$/.exec(t.id)?.[1] ?? 0)), 0);
  return `T${String(max + 1).padStart(4, "0")}`;
}
