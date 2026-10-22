// File import/export: Scigeniq task exports (.xlsx/.csv), JSON backups, and the
// multi-sheet Excel workbook. Excel files go through the built-in reader/writer.

import { parseCsv, importTasks, DEPT_IDS, workload } from "./model.js";
import { evaluateStudy } from "./stats.js";
import { upgrade } from "./store.js";
import { readXlsx, writeXlsx } from "./xlsx.js";
import { download } from "./dom.js";

/** Read any supported file into a typed result the Data view can preview. */
export async function readImportFile(file, state) {
  const name = file.name.toLowerCase();
  if (name.endsWith(".json")) {
    let parsed;
    try { parsed = JSON.parse(await file.text()); } catch { throw new Error("This file is not valid JSON."); }
    if (!Array.isArray(parsed.products) || !Array.isArray(parsed.tasks)) throw new Error("This JSON file is not an APQR Command Center backup.");
    return { kind: "backup", state: upgrade(parsed) };
  }
  let sheets;
  if (name.endsWith(".csv") || name.endsWith(".txt")) {
    sheets = [{ name: file.name, rows: parseCsv(await file.text()) }];
  } else if (/\.xls[xm]$/.test(name)) {
    sheets = await readXlsx(await file.arrayBuffer());
  } else if (name.endsWith(".xls")) {
    throw new Error("Old .xls files are not supported. Save the file as .xlsx or .csv and try again.");
  } else {
    throw new Error("Use an .xlsx, .csv or .json file.");
  }
  // Prefer the task sheet of the master tracker or the Scigeniq "Data" sheet.
  const order = (s) => (/task register/i.test(s.name) ? 0 : /^data$/i.test(s.name) ? 1 : 2);
  for (const sheet of [...sheets].sort((a, b) => order(a) - order(b))) {
    const result = importTasks(sheet.rows, state.products);
    if (!result.error) return { kind: "tasks", sheet: sheet.name, ...result };
  }
  throw new Error("No task table found. The file needs columns such as Reference ID, Product, Department, Status and Due.");
}

/** Build and download the multi-sheet Excel workbook. */
export async function exportWorkbook(ctx) {
  const { d, k } = ctx;
  const sheets = [];
  const add = (name, rows) => {
    if (!rows.length) return;
    const columns = Object.keys(rows[0]);
    sheets.push({ name, columns, rows: rows.map((r) => columns.map((c) => r[c])) });
  };
  add("Summary", [
    ["Programme", ctx.state.meta.programme], ["Status date", k.asOf], ["Products in annual plan", k.planned],
    ["In Scigeniq plan", k.inScigeniqPlan], ["Workflows triggered", k.triggered], ["Closed", k.closed],
    ["Past report due, not triggered", k.pastDue], ["Tasks", k.tasks], ["Completed", k.completed], ["Open", k.open],
    ["Overdue (calculated)", k.overdue], ["Scigeniq overdue flag", k.systemOverdue], ["Unassigned open", k.unassignedOpen],
    ["Duplicate workflows", k.duplicates],
  ].map(([Metric, Value]) => ({ Metric, Value })));
  add("Annual Plan", d.products.map((p) => ({
    "Sr. No.": p.planNo ?? "", "Final product code": p.code, Product: p.name, "Dosage form": p.form, Site: p.site,
    "Planned month": p.plannedMonth, "APQR no.": p.apqrNo, "Previous report": p.prevReport, "Review start": p.periodStart,
    "Review end": p.periodEnd, "Report due": p.reportDue, "Scigeniq plan no.": p.scigeniqNo ?? "", Route: p.route,
    Phase: p.phase, "Plan status": p.planStatus, "APQR owner": p.owner, Batches: p.batches ?? "",
    "Requirements complete": `${p.reqProgress.done}/${p.reqProgress.applicable}`, "CAPA required": p.capa.required,
    "Committee approvals": `${p.committeeProgress.approved}/${p.committeeProgress.total}`, "Closed on": p.closedOn,
    "QA comments": p.comments, Conclusion: p.conclusion,
  })));
  add("APQR Tracker", d.products.filter((p) => p.triggered).map((p) => ({
    "APQR Ref": p.primaryRef, "All refs": p.refs.join(" "), Product: p.name, "Dosage Form": p.form, Site: p.site, "APQR Owner": p.owner,
    "Workflow Stage": p.stage, "Workflow Due": p.wfDue, "Total Tasks": p.total, Completed: p.completed, Open: p.open, Overdue: p.overdue,
    "% Complete": Math.round(p.pct * 100), "Days to Due": p.wfDaysToDue ?? "", "RAG Status": p.rag,
    ...Object.fromEntries(DEPT_IDS.map((dep) => [`Open ${dep}`, p.deptOpen[dep]])), Bottleneck: p.bottleneck, "QA Comments": p.comments,
  })));
  add("Task Register", d.tasks.map((t) => ({
    "Reference ID": t.ref, Product: t.productName, "Dosage Form": t.form, Department: t.dept, "Data Stream": t.stream,
    "Task Type": t.type, "Task Title": t.title, "Workflow Stage": t.stage, Status: t.status, "Assigned User": t.user,
    Created: t.created, Start: t.start, Due: t.due, "Closed On": t.closedOn, "Days to Due": t.daysToDue ?? "",
    "Overdue?": t.overdue ? "Yes" : "No", "Ageing (days)": t.ageing ?? "",
  })));
  add("Owner Workload", workload(d.tasks).sort((a, b) => b.open - a.open).map((u) => ({
    "Assigned User": u.user, "Total Tasks": u.total, Completed: u.completed, Open: u.open, Overdue: u.overdue,
    "% Complete": Math.round(u.pct * 100), "Earliest Open Due Date": u.earliestDue, Status: u.status,
  })));
  add("Statistics", d.products.flatMap((p) => p.studies.map((s) => {
    const ev = evaluateStudy(s);
    return {
      Product: p.name, "APQR no.": p.apqrNo, Attribute: s.attribute, Stage: s.stage, Unit: s.unit, LSL: s.lsl, USL: s.usl, n: ev.n,
      Mean: ev.describe?.mean ?? "", Cpk: ev.cpk ?? "", Ppk: ev.ppk ?? "", "In control": ev.inControl === null ? "" : ev.inControl ? "Yes" : "No",
      Band: ev.band ?? "", Values: (s.values || []).join(" "),
    };
  })));
  add("Change History", ctx.state.log.map((e) => ({
    Time: e.ts, By: e.by, Action: e.action, Record: e.label ?? "",
    Changes: (e.changes || []).map((c) => `${c.field}: ${JSON.stringify(c.from)} → ${JSON.stringify(c.to)}`).join("; "),
  })));
  download(`APQR-Command-Center-${k.asOf}.xlsx`, await writeXlsx(sheets));
}
