// Turn spreadsheets into app state.
//
// Three sources are recognised:
//  1. The APQR Master Tracker workbook (sheets "Task Register", "APQR Plan 2026",
//     "APQR Tracker", "Dashboard", "Excluded Tasks"), including files this app exports.
//  2. A Scigeniq eQMS task export (one row per task: Reference ID, Type, Stage,
//     Status, Title, Parent action, Assigned User, dates...). Columns are matched
//     by header name, and the caller can override the mapping.
//  3. A plan-only sheet (Product, Process, Review Start, Review End...).
import { productKey, houseDept, monthYearToEnd, refNum } from "./engine.js";

/* ------------------------------------------------------------------ helpers */

export const norm = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9%#]+/g, " ").trim();
const str = (v) => (v === null || v === undefined ? "" : String(v).trim());
const pad = (n) => String(n).padStart(2, "0");

/**
 * Parse a date from a cell: ISO strings (from the xlsx reader), Excel serials,
 * "dd/mm/yyyy [hh:mm [am|pm]]" (or mm/dd with order "MDY") and "yyyy-mm-dd".
 */
export function parseDate(v, order = "DMY") {
  if (v === null || v === undefined || v === "") return "";
  if (typeof v === "number") {
    if (v > 20000 && v < 80000) {
      const d = new Date(Math.round((v - 25569) * 86400000));
      const day = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
      return d.getUTCHours() || d.getUTCMinutes() ? `${day}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}` : day;
    }
    return "";
  }
  const s = String(v).trim();
  if (!s || /^-+$/.test(s)) return "";
  let m = /^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{1,2}):(\d{2}))?/.exec(s);
  if (m) return m[4] ? `${m[1]}-${m[2]}-${m[3]}T${pad(+m[4])}:${m[5]}` : `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})(?:[\sT,]+(\d{1,2}):(\d{2})(?::\d{2})?\s*([ap]\.?m\.?)?)?/i.exec(s);
  if (m) {
    let a = +m[1], b = +m[2];
    let y = +m[3];
    if (y < 100) y += 2000;
    let day = order === "MDY" ? b : a, mon = order === "MDY" ? a : b;
    if (mon > 12 && day <= 12) [day, mon] = [mon, day];
    if (mon < 1 || mon > 12 || day < 1 || day > 31) return "";
    const date = `${y}-${pad(mon)}-${pad(day)}`;
    if (!m[4]) return date;
    let h = +m[4];
    const ap = (m[6] || "").toLowerCase();
    if (ap.startsWith("p") && h < 12) h += 12;
    if (ap.startsWith("a") && h === 12) h = 0;
    return `${date}T${pad(h)}:${m[5]}`;
  }
  const t = Date.parse(s);
  if (!Number.isNaN(t)) { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
  return "";
}

function toMonthYear(v) {
  if (!v) return "";
  if (typeof v === "string" && /^\d{1,2}\s*\/\s*\d{4}$/.test(v.trim())) { const [m, y] = v.split("/"); return `${pad(+m)}/${y.trim()}`; }
  const iso = parseDate(v);
  return iso ? `${iso.slice(5, 7)}/${iso.slice(0, 4)}` : str(v);
}

/** Find the header row (first 20 rows) that matches the most of `wanted` names. */
export function findHeaderRow(rows, wanted) {
  const w = wanted.map(norm);
  let best = -1, score = 0;
  for (let r = 0; r < Math.min(rows.length, 20); r++) {
    const row = rows[r];
    if (!row) continue;
    const cells = Array.from(row, norm);
    const s = w.filter((x) => cells.includes(x)).length;
    if (s > score) { score = s; best = r; }
  }
  return { row: best, score };
}

function headerIndex(row) {
  const idx = {};
  Array.from(row || []).forEach((h, i) => { const k = norm(h); if (k && idx[k] === undefined) idx[k] = i; });
  return idx;
}
function pick(idx, ...names) {
  for (const n of names) {
    const k = norm(n);
    if (idx[k] !== undefined) return idx[k];
  }
  for (const n of names) {
    const k = norm(n);
    const hit = Object.keys(idx).find((h) => h.startsWith(k));
    if (hit) return idx[hit];
  }
  return -1;
}
const cell = (row, i) => (i >= 0 && row ? row[i] : undefined);

/* ------------------------------------------------------------- detect kind */

export function detect(workbook) {
  const names = workbook.sheets.map((s) => s.name);
  if (names.some((n) => /task register/i.test(n)) && names.some((n) => /plan/i.test(n))) return { kind: "tracker" };
  let best = null;
  for (const s of workbook.sheets) {
    if (!s.rows?.length) continue;
    const sci = findHeaderRow(s.rows, ["Reference ID", "Reference", "Type", "Stage", "Status", "Title", "Parent action", "Assigned User", "Closing date"]);
    const plan = findHeaderRow(s.rows, ["Product", "Process", "Review Start", "Review End", "Exec. Year", "Site", "Period End (date)"]);
    if (sci.score >= 4 && (!best || sci.score > best.score)) best = { kind: "scigeniq", sheet: s.name, headerRow: sci.row, score: sci.score };
    if (plan.score >= 3 && (!best || plan.score > best.score)) best = { kind: "plan", sheet: s.name, headerRow: plan.row, score: plan.score };
  }
  return best || { kind: "unknown" };
}

/* --------------------------------------------------- master tracker workbook */

export function importTrackerWorkbook(workbook) {
  const sheet = (re) => workbook.sheets.find((s) => re.test(s.name))?.rows || [];
  const warnings = [];

  // Plan
  const planRows = sheet(/plan/i);
  const ph = findHeaderRow(planRows, ["#", "Product", "Process", "Exec. Year", "Site", "Review Start", "Review End"]);
  const plan = [];
  if (ph.row >= 0) {
    const idx = headerIndex(planRows[ph.row]);
    const c = { no: pick(idx, "#", "No"), product: pick(idx, "Product"), process: pick(idx, "Process", "Dosage Form"), year: pick(idx, "Exec. Year", "Year"), site: pick(idx, "Site"), rs: pick(idx, "Review Start"), re: pick(idx, "Review End"), pe: pick(idx, "Period End (date)", "Period End"), status: pick(idx, "Plan Status") };
    for (let r = ph.row + 1; r < planRows.length; r++) {
      const row = planRows[r];
      const product = str(cell(row, c.product));
      if (!product) continue;
      const reviewEnd = toMonthYear(cell(row, c.re));
      plan.push({
        id: uid(),
        no: cell(row, c.no) ?? plan.length + 1,
        product,
        process: str(cell(row, c.process)),
        execYear: cell(row, c.year) ?? "",
        site: str(cell(row, c.site)),
        reviewStart: toMonthYear(cell(row, c.rs)),
        reviewEnd,
        periodEnd: parseDate(cell(row, c.pe)) || monthYearToEnd(reviewEnd),
        planStatus: str(cell(row, c.status)) || "Approved",
      });
    }
  } else warnings.push("No plan sheet with a Product / Review End header was found.");

  // Tasks
  const taskRows = sheet(/task register/i);
  const th = findHeaderRow(taskRows, ["Reference ID", "Product", "Department", "Task Class", "Workflow Stage", "Closure"]);
  const tasks = [];
  if (th.row >= 0) {
    const idx = headerIndex(taskRows[th.row]);
    const c = {
      ref: pick(idx, "Reference ID"), product: pick(idx, "Product"), form: pick(idx, "Dosage Form"), site: pick(idx, "Site"),
      dept: pick(idx, "Department"), stream: pick(idx, "Data Stream"), cls: pick(idx, "Task Class"), type: pick(idx, "Task Type"),
      title: pick(idx, "Task Title"), stage: pick(idx, "Workflow Stage"), status: pick(idx, "Status"), user: pick(idx, "Assigned User"),
      crit: pick(idx, "Criticality"), created: pick(idx, "Created"), start: pick(idx, "Start"), closedOn: pick(idx, "Closed On"),
      closure: pick(idx, "Closure"), by: pick(idx, "Created By"), end: pick(idx, "Task End Date (Scigeniq)", "Task End Date", "End Date"),
    };
    for (let r = th.row + 1; r < taskRows.length; r++) {
      const row = taskRows[r];
      const ref = str(cell(row, c.ref));
      const product = str(cell(row, c.product));
      if (!ref && !product) continue;
      tasks.push({
        id: uid(), ref, product,
        dosageForm: str(cell(row, c.form)), site: str(cell(row, c.site)),
        department: str(cell(row, c.dept)), stream: str(cell(row, c.stream)), taskClass: str(cell(row, c.cls)) || "Data Collection",
        taskType: str(cell(row, c.type)), title: str(cell(row, c.title)), stage: str(cell(row, c.stage)), status: str(cell(row, c.status)),
        assignee: str(cell(row, c.user)) || "Unassigned", criticality: str(cell(row, c.crit)),
        created: parseDate(cell(row, c.created)), start: parseDate(cell(row, c.start)), closedOn: parseDate(cell(row, c.closedOn)),
        closure: normClosure(cell(row, c.closure), cell(row, c.stage), cell(row, c.status), cell(row, c.closedOn)),
        createdBy: str(cell(row, c.by)), taskEnd: parseDate(cell(row, c.end)),
      });
    }
  } else warnings.push("No Task Register header row was found.");

  // Tracker annotations: comments, previous %, owner, references
  const trRows = sheet(/tracker/i);
  const trh = findHeaderRow(trRows, ["APQR Ref", "Product", "Dosage Form", "APQR Owner", "Workflow Stage"]);
  const products = {};
  const prevPct = {};
  let prevLabel = "";
  if (trh.row >= 0) {
    const hdr = trRows[trh.row];
    const idx = headerIndex(hdr);
    const c = { product: pick(idx, "Product"), owner: pick(idx, "APQR Owner"), isNew: pick(idx, "New Since"), prev: pick(idx, "Prev %"), wf: pick(idx, "Workflow Refs"), qc: pick(idx, "QC Annexe Refs"), comments: pick(idx, "QA Comments / Actions", "QA Comments", "Comments"), n: pick(idx, "# Work-flows", "# Workflows"), priority: pick(idx, "Priority") };
    if (c.prev >= 0) prevLabel = (/\(([^)]+)\)/.exec(str(hdr[c.prev])) || [])[1] || "";
    for (let r = trh.row + 1; r < trRows.length; r++) {
      const row = trRows[r];
      const product = str(cell(row, c.product));
      if (!product) continue;
      const key = productKey(product);
      const a = {};
      const comments = str(cell(row, c.comments));
      if (comments) a.comments = comments;
      const priority = str(cell(row, c.priority));
      if (priority) a.priority = priority;
      const splitRefs = (v) => str(v).split(/\s*[/,;]\s*/).filter((x) => /^[A-Z]+-[A-Z]+-\d+$/i.test(x));
      const wf = splitRefs(cell(row, c.wf));
      const qc = splitRefs(cell(row, c.qc));
      if (wf.length) a.workflowRefs = wf;
      if (qc.length) a.qcRefs = qc;
      const n = Number(cell(row, c.n));
      if (n > 1) a.nWorkflows = n;
      if (c.isNew >= 0) a.isNew = /new/i.test(str(cell(row, c.isNew)));
      const prev = cell(row, c.prev);
      if (typeof prev === "number") prevPct[key] = prev;
      if (Object.keys(a).length) products[key] = a;
    }
  }

  // Dashboard inputs and baseline figures
  const dash = sheet(/dashboard/i);
  const settings = {};
  const baselineMetrics = {};
  let baselineLabel = prevLabel;
  const metricMap = [
    [/live workflow/i, "productsLive"], [/triggered vs plan/i, "triggered"], [/data.collection tasks/i, "dataTasks"],
    [/tasks completed/i, "completed"], [/overdue tasks/i, "overdueTasks"], [/unassigned/i, "unassigned"], [/closed out/i, "closedOut"],
  ];
  let inMovement = false;
  let programme = "", organisation = "", planRef = "";
  for (let r = 0; r < dash.length; r++) {
    const row = dash[r];
    if (!row) continue;
    for (let ci = 0; ci < row.length; ci++) {
      const v = row[ci];
      if (typeof v !== "string") continue;
      if (!programme && /ANNUAL PRODUCT QUALITY REVIEW|APQR/i.test(v) && r < 4) programme = v;
      else if (programme && r < 5 && !organisation && /\s-\s/.test(v)) {
        organisation = v.split(/\s+-\s+/)[0].trim();
        const pr = /\(([A-Z]{2,}-[A-Z]{1,4}-\d+)\)/.exec(v);
        if (pr) planRef = pr[1];
      }
      if (/^report date/i.test(v)) { const d = parseDate(row[ci + 1]); if (d) settings.reportDate = d; }
      else if (/overdue after/i.test(v) && typeof row[ci + 1] === "number") settings.overdueMonths = row[ci + 1];
      else if (/due soon.*threshold/i.test(v) && typeof row[ci + 1] === "number") settings.dueSoonDays = row[ci + 1];
      else if (/^MOVEMENT SINCE/i.test(v)) { inMovement = true; const m = /\((\d{2}\/\d{2}\/\d{4})/.exec(v); if (m) baselineLabel = m[1]; }
    }
    if (inMovement && typeof row[1] === "string" && typeof row[2] === "number") {
      const hit = metricMap.find(([re]) => re.test(row[1]));
      if (hit && baselineMetrics[hit[1]] === undefined) baselineMetrics[hit[1]] = row[2];
    }
    if (inMovement && typeof row[1] === "string" && /^(TASK STATUS|QUALITY SIGNALS|PRODUCTS BY)/i.test(row[1])) inMovement = false;
  }

  // Excluded tasks
  const exRows = sheet(/excluded/i);
  const eh = findHeaderRow(exRows, ["Reference ID", "Type", "Stage", "Status", "Title", "Parent action"]);
  const excluded = [];
  if (eh.row >= 0) {
    const idx = headerIndex(exRows[eh.row]);
    const c = { ref: pick(idx, "Reference ID"), type: pick(idx, "Type"), stage: pick(idx, "Stage"), status: pick(idx, "Status"), title: pick(idx, "Title"), parent: pick(idx, "Parent action"), user: pick(idx, "Assigned User"), closed: pick(idx, "Closing date"), reason: pick(idx, "Reason") };
    for (let r = eh.row + 1; r < exRows.length; r++) {
      const row = exRows[r];
      if (!str(cell(row, c.ref)) && !str(cell(row, c.title))) continue;
      excluded.push({ ref: str(cell(row, c.ref)), type: str(cell(row, c.type)), stage: str(cell(row, c.stage)), status: str(cell(row, c.status)), title: str(cell(row, c.title)), parent: str(cell(row, c.parent)), assignee: str(cell(row, c.user)), closingDate: parseDate(cell(row, c.closed)), reason: str(cell(row, c.reason)) || "Not an APQR task" });
    }
  }

  const hasBaseline = Object.keys(prevPct).length || Object.keys(baselineMetrics).length;
  return {
    plan, tasks, products, excluded, settings, warnings,
    programme, organisation, planRef,
    baseline: hasBaseline ? { label: baselineLabel || "previous extract", metrics: baselineMetrics, prevPct } : null,
  };
}

function normClosure(closure, stage, status, closedOn) {
  const c = norm(closure);
  if (c === "closed" || c === "yes" || c === "true") return "Closed";
  if (c === "not closed" || c === "open" || c === "no" || c === "false") return "Not Closed";
  const s = norm(stage), st = norm(status);
  if (["completed", "approved", "closed", "rejected", "cancelled", "canceled"].includes(s) || ["completed", "closed"].includes(st)) return "Closed";
  if (closedOn) return "Closed";
  return "Not Closed";
}

/* --------------------------------------------------------- Scigeniq export */

/** Target fields for a Scigeniq task export, with header synonyms. */
export const SCIGENIQ_FIELDS = [
  { key: "ref", label: "Reference ID", required: true, names: ["Reference ID", "Reference", "Ref", "Reference No", "Ref ID", "Serial No", "ID"] },
  { key: "type", label: "Type", names: ["Type", "Task Type", "Action Type", "Task type name"] },
  { key: "stage", label: "Stage", names: ["Stage", "Workflow Stage", "Current Stage", "Step", "Current Step"] },
  { key: "status", label: "Status", names: ["Status", "State", "Task Status"] },
  { key: "title", label: "Title", required: true, names: ["Title", "Task Title", "Subject", "Task Name", "Name", "Description"] },
  { key: "parent", label: "Parent action", names: ["Parent action", "Parent", "Parent Action Title", "Parent Title", "Related Action", "Source"] },
  { key: "product", label: "Product", names: ["Product", "Product Name"] },
  { key: "department", label: "Department", names: ["Department", "Dept", "Assigned Department"] },
  { key: "assignee", label: "Assigned user", names: ["Assigned User", "Assigned To", "Assignee", "Responsible", "Owner", "Assigned"] },
  { key: "criticality", label: "Criticality", names: ["Criticality", "Priority", "Risk"] },
  { key: "created", label: "Creation date", names: ["Creation date", "Created", "Created Date", "Created On", "Date Created", "Created At", "Creation"] },
  { key: "start", label: "Start date", names: ["Start date", "Start", "Start Date Time", "Planned Start"] },
  { key: "end", label: "End / due date", names: ["End date", "Due date", "End", "Deadline", "Target date", "Due"] },
  { key: "closedOn", label: "Closing date", names: ["Closing date", "Closed On", "Closed date", "Closure date", "Completion date", "Close date", "Closed at"] },
  { key: "closure", label: "Closure", names: ["Closure", "Closed", "Is Closed", "Closure Status"] },
  { key: "createdBy", label: "Created by", names: ["Created by", "Creator", "Initiator", "Initiated By"] },
  { key: "project", label: "Project / site", names: ["Project", "Site", "Plant", "Facility"] },
  { key: "dosageForm", label: "Dosage form", names: ["Dosage Form", "Process", "Form", "Pharmaceutical Form"] },
];

/** Guess the column for each field from a header row. */
export function guessMapping(headerRow) {
  const idx = headerIndex(headerRow);
  const used = new Set();
  const mapping = {};
  for (const f of SCIGENIQ_FIELDS) {
    let hit = -1;
    for (const n of f.names) { const i = idx[norm(n)]; if (i !== undefined && !used.has(i)) { hit = i; break; } }
    if (hit < 0) {
      for (const n of f.names) {
        const k = norm(n);
        if (k.length < 4) continue;
        const h = Object.keys(idx).find((x) => x.startsWith(k) && !used.has(idx[x]));
        if (h) { hit = idx[h]; break; }
      }
    }
    if (hit >= 0) used.add(hit);
    mapping[f.key] = hit;
  }
  return mapping;
}

/** Product name from a Scigeniq "Parent action" (or a workflow title). */
export function productFromParent(s) {
  let p = str(s);
  if (!p) return "";
  p = p.replace(/^APQR\s*[,:–-]\s*/i, "");
  p = p.replace(/^APQR\s*\/\s*\S+\s+/i, "");
  p = p.replace(/^APQR\s+(?=\S)/i, "");
  return p.trim();
}
const isDuplicated = (s) => /^task\s*-\s*duplicated$|^duplicated$/i.test(str(s));

/** Department + data stream of a data-collection task from its title / type. */
export function classifyDept(title, type, rawDept) {
  const tryText = (t) => {
    const s = str(t);
    if (!s || isDuplicated(s)) return null;
    if (/^\s*CM\b|compliance/i.test(s)) return ["Compliance", "Compliance"];
    if (/\bVL\b|validation|metrolog/i.test(s)) return ["Validation", "Validation"];
    if (/\bQC\b|\bOO[ST]+\b|OOS|OOT|stabilit|RM\s*\/\s*PM|analytical|retens/i.test(s)) return ["QC", "QC"];
    if (/\bIPC\b|in.process control/i.test(s)) return ["Production", "IPC"];
    if (/process|hard capsule data|semi solid data|liquid\/syrup data|production/i.test(s)) return ["Production", "Process"];
    if (/supplier/i.test(s)) return ["QA", "Supplier"];
    if (/\bRA\b|regulator/i.test(s)) return ["RA", "RA"];
    if (/\bQA\b|quality assurance/i.test(s)) return ["QA", "QA"];
    return null;
  };
  const byTitle = tryText(title);
  if (byTitle) return byTitle;
  const d = houseDept(rawDept);
  if (d && d !== "Approval" && d !== rawDept?.trim?.()) return [d, d === "QA" && /supplier/i.test(rawDept) ? "Supplier" : d];
  if (["QA", "QC", "Production", "RA", "Validation", "Compliance"].includes(d)) return [d, d];
  return tryText(type) || ["QA", "QA"];
}

function formFromText(s) {
  const t = str(s).toLowerCase();
  if (/tablet|\btab\b/.test(t)) return "Tablets";
  if (/capsule|\bcap\b/.test(t)) return "Hard Capsule";
  if (/semi.?solid|cream|gel\b|ointment|pommade/.test(t)) return "Semi Solid";
  if (/liquid|syrup|drops|solution|suspension|\bml\b/.test(t)) return "Liquid/Syrup";
  return "";
}

/**
 * Transform Scigeniq export rows into tasks and excluded rows.
 * opts: { mapping, headerRow, dateOrder, plan }
 */
export function transformScigeniq(rows, { mapping, headerRow, dateOrder = "DMY", plan = [] }) {
  const get = (row, k) => (mapping[k] >= 0 ? row[mapping[k]] : undefined);
  const planByKey = new Map(plan.map((p) => [productKey(p.product), p]));
  const raw = [];
  for (let r = headerRow + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row) continue;
    const ref = str(get(row, "ref"));
    const title = str(get(row, "title"));
    if (!ref && !title) continue;
    raw.push({
      ref, title,
      type: str(get(row, "type")), stage: str(get(row, "stage")), status: str(get(row, "status")),
      parent: str(get(row, "parent")), product: str(get(row, "product")), department: str(get(row, "department")),
      assignee: str(get(row, "assignee")), criticality: str(get(row, "criticality")),
      created: parseDate(get(row, "created"), dateOrder), start: parseDate(get(row, "start"), dateOrder),
      end: parseDate(get(row, "end"), dateOrder), closedOn: parseDate(get(row, "closedOn"), dateOrder),
      closure: get(row, "closure"), createdBy: str(get(row, "createdBy")), project: str(get(row, "project")),
      dosageForm: str(get(row, "dosageForm")),
    });
  }

  const classOf = (x) => {
    if (/approv/i.test(x.type) || /^APV\b|^APV-/i.test(x.ref)) return "Approval";
    if (norm(x.type) === "apqr" || (/^APQR\b/i.test(x.title) && !/data\s*collection/i.test(x.title) && norm(x.type) !== "qa data collection" && !x.parent)) return "Workflow";
    return "Data Collection";
  };
  const isApqrRef = (ref) => /^(APQR|QCTAB)-/i.test(ref);
  const mentionsApqr = (s) => /\bAPQR\b/i.test(s);

  // Pass 1: product from the explicit column, the parent action or the workflow title.
  for (const x of raw) {
    x.taskClass = classOf(x);
    let p = x.product;
    if (!p && x.parent && !isDuplicated(x.parent)) p = productFromParent(x.parent);
    if (!p && x.taskClass === "Workflow") p = productFromParent(x.title);
    x.productGuess = p;
    x.apqr = isApqrRef(x.ref) || mentionsApqr(x.parent) || (x.taskClass === "Workflow" && mentionsApqr(x.title)) || (!!x.product && !/^APV/i.test(x.ref) && !x.parent);
  }
  // Pass 2: resolve "Task - Duplicated" parents through the reference, then the creation batch.
  const refToProduct = new Map();
  const batchToProduct = new Map();
  for (const x of raw) {
    if (!x.productGuess || !x.apqr) continue;
    if (x.ref && !refToProduct.has(x.ref)) refToProduct.set(x.ref, x.productGuess);
    if (x.created) {
      const b = x.created.slice(0, 16);
      if (!batchToProduct.has(b)) batchToProduct.set(b, new Set());
      batchToProduct.get(b).add(x.productGuess);
    }
  }
  const tasks = [];
  const excluded = [];
  let resolvedDup = 0;
  for (const x of raw) {
    let product = x.productGuess;
    const dup = !product && (isDuplicated(x.parent) || isDuplicated(x.title));
    if (!product && dup) {
      if (x.taskClass !== "Approval" && refToProduct.has(x.ref)) product = refToProduct.get(x.ref);
      else if (x.taskClass !== "Approval" && x.created && batchToProduct.get(x.created.slice(0, 16))?.size === 1) product = [...batchToProduct.get(x.created.slice(0, 16))][0];
      if (product) { resolvedDup++; x.apqr = true; }
    }
    if (!x.apqr || !product) {
      excluded.push({ ref: x.ref, type: x.type, stage: x.stage, status: x.status, title: x.title, parent: x.parent, assignee: x.assignee, closingDate: x.closedOn, reason: !x.apqr ? "Not an APQR task" : dup ? "Duplicated parent could not be matched to a product" : "No product could be identified" });
      continue;
    }
    // Snap to the plan's spelling when the names match loosely.
    const pk = productKey(product);
    if (planByKey.has(pk)) product = planByKey.get(pk).product;
    let department, stream;
    if (x.taskClass === "Approval") { department = "Approval"; stream = "Approval"; }
    else if (x.taskClass === "Workflow") { department = "QA"; stream = "APQR Workflow"; }
    else [department, stream] = classifyDept(x.title, x.type, x.department);
    tasks.push({
      id: uid(), ref: x.ref, product, dosageForm: x.dosageForm, site: x.project,
      department, stream, taskClass: x.taskClass, taskType: x.type, title: x.title,
      stage: x.stage, status: x.status, assignee: x.assignee && !/^-+$/.test(x.assignee) ? x.assignee : "Unassigned",
      criticality: x.criticality, created: x.created, start: x.start || x.created, closedOn: x.closedOn,
      closure: normClosure(x.closure, x.stage, x.status, x.closedOn), createdBy: x.createdBy, taskEnd: x.end,
    });
  }

  // Product-level attributes: dosage form and site.
  const byProduct = new Map();
  for (const t of tasks) { const k = productKey(t.product); if (!byProduct.has(k)) byProduct.set(k, []); byProduct.get(k).push(t); }
  for (const [k, list] of byProduct) {
    const pl = planByKey.get(k);
    const form = pl?.process || mostCommon(list.map((t) => t.dosageForm).filter(Boolean)) || mostCommon(list.map((t) => formFromText(t.taskType)).filter(Boolean)) || formFromText(list[0].product);
    const projects = list.map((t) => t.site).filter((s) => s && !/^-+$/.test(s));
    const onc = /oncolog/i.test(list[0].product) || projects.filter((s) => /oncolog/i.test(s)).length > projects.length / 2;
    const suffix = (/-\s*([A-Z][A-Za-z ]+)$/.exec(list[0].product) || [])[1];
    const site = onc ? (mostCommon(projects.filter((s) => /oncolog/i.test(s))) || "Oncology") : pl?.site || mostCommon(projects.filter((s) => !/oncolog/i.test(s))) || suffix || "";
    for (const t of list) { t.dosageForm = form || ""; t.site = site; }
  }
  return { tasks, excluded, stats: { rows: raw.length, tasks: tasks.length, excluded: excluded.length, resolvedDup, products: byProduct.size } };
}

function mostCommon(arr) {
  const m = new Map();
  let best = "", n = 0;
  for (const v of arr) { const c = (m.get(v) || 0) + 1; m.set(v, c); if (c > n) { n = c; best = v; } }
  return best;
}

/* -------------------------------------------------------------- plan sheet */

export function importPlanSheet(rows, headerRow) {
  const idx = headerIndex(rows[headerRow]);
  const c = { no: pick(idx, "#", "No", "N°"), product: pick(idx, "Product", "Product Name"), process: pick(idx, "Process", "Dosage Form"), year: pick(idx, "Exec. Year", "Year"), site: pick(idx, "Site"), rs: pick(idx, "Review Start", "Start"), re: pick(idx, "Review End", "End"), pe: pick(idx, "Period End (date)", "Period End"), status: pick(idx, "Plan Status", "Status") };
  const plan = [];
  for (let r = headerRow + 1; r < rows.length; r++) {
    const row = rows[r];
    const product = str(cell(row, c.product));
    if (!product) continue;
    const reviewEnd = toMonthYear(cell(row, c.re));
    plan.push({ id: uid(), no: cell(row, c.no) ?? plan.length + 1, product, process: str(cell(row, c.process)) || formFromText(product), execYear: cell(row, c.year) ?? "", site: str(cell(row, c.site)), reviewStart: toMonthYear(cell(row, c.rs)), reviewEnd, periodEnd: parseDate(cell(row, c.pe)) || monthYearToEnd(reviewEnd), planStatus: str(cell(row, c.status)) || "Approved" });
  }
  return plan;
}

/* ------------------------------------------------------------------- merge */

/** Merge imported tasks into existing ones by Reference ID + Title (+ created). */
export function mergeTasks(existing, incoming) {
  const key = (t) => `${t.ref}|${norm(t.title)}|${t.created || ""}`;
  const loose = (t) => `${t.ref}|${norm(t.title)}`;
  const map = new Map(existing.map((t) => [key(t), t]));
  const looseMap = new Map();
  for (const t of existing) { const k = loose(t); looseMap.set(k, looseMap.has(k) ? null : t); }
  let updated = 0, added = 0;
  const out = [...existing];
  for (const t of incoming) {
    const hit = map.get(key(t)) || looseMap.get(loose(t));
    if (hit) { Object.assign(hit, { ...t, id: hit.id }); updated++; }
    else { out.push(t); added++; }
  }
  return { tasks: out, updated, added };
}

export function uid() {
  return (globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2) + Date.now().toString(36)).slice(0, 12);
}
export { refNum };
