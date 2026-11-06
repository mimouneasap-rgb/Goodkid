// Tests of the 5S programme (area checklists, 0–3 scoring, risk-based schedule, findings), the APQR
// programme (plan ↔ Scigeniq ↔ tasks, RAG, phases, bottlenecks), process capability and the importers
// for both, on small synthetic data (no confidential data).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import SCHEMA from "../oncology/js/schema.js";
import { EXT_COLS } from "../oncology/js/schema-ext.js";
import { buildModel, toDay } from "../oncology/js/model.js";
import { buildDomains, normProduct, capability, metricValue, quarters } from "../oncology/js/domain.js";
import { fivesKey, fivesRating } from "../oncology/js/catalogs.js";

const COLS = { ...SCHEMA.cols, ...EXT_COLS };
const table = (key, objs) => ({ cols: COLS[key], rows: objs.map((o) => COLS[key].map((c) => o[c] ?? null)) });
const empty = Object.fromEntries(Object.keys(COLS).map((k) => [k, table(k, [])]));
const P = (n) => `PRODUCT${n} (Substance${n}) 10 mg F/C Tablets (30 TAB)`;
const task = (o) => ({ Site: "SITE", "Dosage Form": "Tablets", Created: "2026-07-01T10:00", Start: "2026-07-01T10:00", ...o });

const wb = {
  ...empty,
  meta: { asof: "2026-10-20", settings: {}, apqrAsOf: "2026-07-28" },
  tr: SCHEMA.tr,
  mapGrid: [],
  rooms: table("rooms", [{ Code: "R-1", Name: "Compression suite" }, { Code: "R-2", Name: "Raw material warehouse" }]),
  fivesAreas: table("fivesAreas", [
    { Area: "Compression", Code: "Compression", Risk: "Critical", Frequency: "Weekly" },
    { Area: "Warehouse", Code: "Warehouse", Risk: "Medium", Rooms: "R-2" },
  ]),
  fivesTpl: table("fivesTpl", ["Sort", "Set", "Shine", "Standardize", "Sustain"].map((c, i) => ({ Area: "Compression", No: i + 1, Category: c, Criterion: `Criterion ${i + 1}` }))),
  fives: table("fives", [{ "Audit ID": "5S-2026-001", Date: "2026-10-14", Area: "Compression", Checklist: "Compression", Scale: 3, Scores: "3,2,1,0,-" }]),
  fivesItems: table("fivesItems", [
    { "Audit ID": "5S-2026-001", Area: "Compression", No: 4, Category: "Standardize", Criterion: "Criterion 4", Score: 0, Priority: "High", Due: "2026-10-01", Status: "Open" },
    { "Audit ID": "5S-2026-001", Area: "Compression", No: 3, Category: "Shine", Criterion: "Criterion 3", Score: 1, Priority: "Medium", Due: "2026-11-13", Status: "Closed", "Closed on": "2026-10-16" },
  ]),
  apqrPlan: table("apqrPlan", [
    { Code: "TB901Z01", Product: P(1), "Dosage form": "Tablets", "Planned month": "2026-01", "Period start": "2025-01", "Period end": "2025-12" },
    { Code: "TB902Z01", Product: P(2), "Dosage form": "Tablets", "Planned month": "2026-03", "Period start": "2025-03", "Period end": "2026-02" },
    { Code: "TB903Z01", Product: P(3), "Dosage form": "Tablets", "Planned month": "2026-09", "Period start": "2025-09", "Period end": "2026-08" },
    { Code: "TB904Z01", Product: P(4), "Dosage form": "Tablets", "Planned month": "2026-06", "Period start": "2025-06", "Period end": "2026-05" },
    { Code: "CP905Z01", Product: P(5), "Dosage form": "Hard Capsule", "Planned month": "2026-02", "Period start": "2025-02", "Period end": "2026-01" },
  ]),
  apqrSys: table("apqrSys", [1, 2, 3, 4].map((n) => ({ Product: `${P(n)}-SITE`.replace("-SITE", "-ELKENDI"), Process: "Tablets", "Review start": "01/2025", "Review end": "12/2025", "Plan status": "Approved" }))),
  apqrTasks: table("apqrTasks", [
    task({ "Reference ID": "APQR-KE-1", Product: `${P(1)}-ELKENDI`, Department: "QA", "Data Stream": "APQR Workflow", "Task Type": "APQR", "Task Title": "APQR", "Workflow Stage": "Data Collection", Status: "Open", "Assigned User": "Owner A", Due: "2026-08-30T10:00", Closure: "Not Closed" }),
    task({ "Reference ID": "APQR-KE-1", Product: `${P(1)}-ELKENDI`, Department: "QC", "Data Stream": "QC", "Task Title": "QC data", "Workflow Stage": "Completed", Status: "Completed", "Assigned User": "Analyst", Due: "2026-08-01T10:00", "Closed On": "2026-07-20T10:00", Closure: "Closed" }),
    task({ "Reference ID": "APQR-KE-1", Product: `${P(1)}-ELKENDI`, Department: "Production", "Data Stream": "IPC", "Task Title": "IPC data", "Workflow Stage": "Collecting Data", Status: "Open", "Assigned User": "Unassigned", Due: "2026-07-01T10:00", Closure: "Not Closed" }),
    task({ "Reference ID": "APQR-KE-1", Product: `${P(1)}-ELKENDI`, Department: "Validation", "Data Stream": "Validation", "Task Title": "VL data", "Workflow Stage": "Data Review", Status: "Open", "Assigned User": "Engineer", Due: "2026-09-01T10:00", Closure: "Not Closed" }),
    task({ "Reference ID": "APQR-KE-1", Product: `${P(1)}-ELKENDI`, Department: "Validation", "Data Stream": "Validation", "Task Title": "VL process data", "Workflow Stage": "Collecting Data", Status: "Open", "Assigned User": "Engineer", Due: "2026-09-01T10:00", Closure: "Not Closed" }),
    task({ "Reference ID": "APQR-KE-9", Product: "OFFPLAN (Thing) 5 mg Tablet-OTHERSITE", Department: "QA", "Data Stream": "APQR Workflow", "Task Type": "APQR", "Task Title": "APQR", "Workflow Stage": "Data Collection", Status: "Open", "Assigned User": "Owner A", Due: "2026-09-30T10:00", Closure: "Not Closed" }),
  ]),
};
const today = toDay("2026-10-21");
const build = (w) => buildDomains(buildModel(w, { today }), w, null);
const m = build(wb);

test("checklist categories map to the five S and scores to ratings", () => {
  assert.deepEqual(["Sort", "Set", "Shine", "Standardize", "Sustain", "Seiton", "Ranger"].map(fivesKey), ["sort", "order", "shine", "standard", "sustain", "order", "order"]);
  assert.deepEqual([0.95, 0.8, 0.65, 0.4, null].map(fivesRating), ["Excellent", "Good", "Acceptable", "Needs improvement", null]);
});

test("5S audits use the area checklist and its 0–3 scale", () => {
  const a = m.x.fivesX.audits[0];
  assert.equal(a.list.length, 5);
  assert.equal(a.total, 6 / 12); // 3+2+1+0 over 4 applicable items × 3
  assert.equal(a.rating, "Needs improvement");
  assert.deepEqual(Object.values(a.per), [1, 2 / 3, 1 / 3, 0, null]);
  assert.equal(a.week, "2026-W42");
});

test("5S schedule follows risk class and frequency; rooms link areas to the map", () => {
  const [comp, wh] = m.x.fivesX.areas;
  assert.equal(comp.frequency, "Weekly");
  assert.equal(comp.next, toDay("2026-10-21"));
  assert.equal(comp.status, "Due ≤7 d");
  assert.deepEqual(comp.rooms, ["R-1"]); // matched by name
  assert.equal(comp.roomsAuto, true);
  assert.equal(wh.frequency, "Monthly"); // Medium risk
  assert.equal(wh.status, "Never audited");
  assert.deepEqual(wh.rooms, ["R-2"]);
  assert.equal(wh.roomsAuto, false);
  assert.equal(m.roomByCode.get("R-1").fivesScore, 0.5);
  assert.equal(m.roomByCode.get("R-1").fivesOpen, 1);
});

test("5S findings: open, overdue and closed", () => {
  const [open, closed] = m.x.fivesX.findings;
  assert.equal(open.open, true);
  assert.equal(open.overdue, true);
  assert.equal(open.key, "standard");
  assert.equal(closed.open, false);
  assert.equal(closed.closedOn, toDay("2026-10-16"));
  assert.equal(metricValue(m, "fives", quarters(2026)[3]).value, 0.5);
});

test("APQR product names match across the plan, Scigeniq and tasks", () => {
  assert.equal(normProduct("DEMOZINE (Cetirizine) 10 mg/ml Drops (30 ml)-ELKENDI"), normProduct("DEMOZINE (Cetirizine) 10 mg/ml Drops (30 ml)"));
  assert.equal(normProduct("DEMOMIDE 1,5 mg Tablet"), normProduct("DEMOMIDE 1.5 mg  Tablet"));
  const X = m.x.apqrProg;
  assert.equal(X.products.length, 6);
  assert.equal(X.products.filter((p) => p.inPlan).length, 5);
  assert.equal(X.products.filter((p) => p.inSys).length, 4);
  assert.equal(X.products.filter((p) => p.offPlan).length, 1);
  assert.equal(X.refDate, toDay("2026-07-28")); // statuses are measured at the export date
});

test("APQR workflow: progress, RAG, phase, bottleneck and stream readiness", () => {
  const p = m.x.apqrProg.products.find((x) => x.code === "TB901Z01");
  assert.deepEqual([p.total, p.completed, p.overdue], [5, 1, 1]);
  assert.equal(p.pct, 0.2);
  assert.equal(p.rag, "Overdue");
  assert.equal(p.track, "In progress");
  assert.equal(p.phase, 3);
  assert.equal(p.owner, "Owner A");
  assert.equal(p.bottleneck, "Validation"); // the owner's workflow task does not count
  assert.deepEqual(p.streamState, { "APQR Workflow": "open", QC: "done", IPC: "overdue", Validation: "open" });
  const u = m.x.apqrProg.users.find((x) => x.user === "Unassigned");
  assert.equal(u.overdue, 1);
});

test("APQR plan tracking before the review is triggered", () => {
  const byCode = Object.fromEntries(m.x.apqrProg.products.filter((p) => p.code).map((p) => [p.code, p]));
  assert.equal(byCode.TB902Z01.track, "Not triggered – past due"); // period end 02/2026 + 90 d < 28/07
  assert.equal(byCode.TB904Z01.track, "Not triggered – due ≤60 d");
  assert.equal(byCode.TB903Z01.track, "Not yet triggered");
  assert.equal(byCode.CP905Z01.track, "Not in Scigeniq plan");
  assert.deepEqual([byCode.CP905Z01.phase, byCode.TB903Z01.phase], [0, 1]);
  assert.equal(byCode.TB902Z01.reportDue, toDay("2026-02-28") + 90 * 86400000);
});

test("an approved APQR record closes the product and feeds the on-time metric", () => {
  const w = { ...wb, apqr: table("apqr", [{ Product: P(2), Period: "2025-03 → 2026-02", "Due date": "2026-05-29", "Approved on": "2026-05-20", Status: "Approved" }]) };
  const p = build(w).x.apqrProg.products.find((x) => x.code === "TB902Z01");
  assert.equal(p.track, "Approved");
  assert.equal(p.phase, 7);
  const mm = build(w);
  assert.equal(metricValue(mm, "pqr_ontime", quarters(2026)[1]).value, 0.5); // CP905Z01 was also due in Q2 and is not approved
  assert.equal(metricValue(mm, "apqr_tasks_ontime", quarters(2026)[2]).value, 1);
});

test("process capability and control-chart signals", () => {
  const xs = [0.98, 0.99, 1.0, 0.99, 0.98, 1.0, 0.99, 0.98];
  const c = capability(xs, 0.95, 1.02);
  assert.equal(c.n, 8);
  assert.ok(Math.abs(c.mean - 0.98875) < 1e-9);
  assert.ok(c.cpk > 1 && c.cpk < 1.33); // σ within = MR̄ / 1.128 ≈ 0.0101 → Cpk ≈ 1.03: monitor
  assert.ok(c.ppk > c.cpk);
  assert.equal(c.signals.flat().length, 0);
  const drift = capability([1, 1.01, 1.02, 1.03, 1.04, 1.05, 1.06, 1.07], 0.95, 1.05);
  assert.ok(drift.signals.some((s) => s.includes("3"))); // six rising
  assert.ok(drift.cpk < 1);
  assert.equal(capability([1], 0, 2), null);
  assert.equal(capability([1, 2, 3]).cpk, null); // no limits, no capability
});

// ---------- importers (SheetJS under Node) ----------
vm.runInThisContext(fs.readFileSync(new URL("../oncology/vendor/xlsx.core.min.js", import.meta.url), "utf8"));
globalThis.window = globalThis;
const { importFiles, monthYear } = await import("../oncology/js/importers.js");
const XLSX = globalThis.XLSX;
const fileOf = (name, sheets) => {
  const book = XLSX.utils.book_new();
  for (const [n, aoa] of Object.entries(sheets)) XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(aoa), n);
  return new File([XLSX.write(book, { type: "array", bookType: "xlsx" })], name);
};

test("French plan months parse", () => {
  assert.deepEqual(["janv.-26", "févr.-26", "juil-26", "août-26", "déc.-26", "Sep-2026"].map(monthYear), ["2026-01", "2026-02", "2026-07", "2026-08", "2026-12", "2026-09"]);
});

test("5S checklist workbook: areas, criteria and a filled-in checklist as an audit", async () => {
  const f = fileOf("5s.xlsx", {
    Index: [["5S checklists"], [], ["Sheet Name", "Area/Room", "Primary Function", "Risk Classification", "Audit Frequency"], ["Compression", "Compression", "x", "Critical", "Weekly"]],
    "Area Comparison": [["Summary"], [], ["Area/Room", "Risk Class", "Key Equipment", "Critical 5S Focus", "Unique GMP Requirements", "Common Issues"], ["Compression", "Critical", "Presses", "Tooling", "Weight control", "Tool wear"]],
    Compression: [["5S AUDIT CHECKLIST - COMPRESSION"], ["Risk: Critical", null, null, "Frequency: Weekly", null, "Area: Compression"], [], ["Audit Date: 14/10/2026", null, null, "Auditor: QA one"], [],
      ["No.", "5S Category", "Detailed Audit Criteria", "Score (0-3)", "Comments", "Action Required", "Priority", "Due Date"], ["Sort"],
      [1, "Sort", "Only needed items", 3], [2, "Set", "Labelled locations", 1, "Missing labels", "Label all", "High", "21/10/2026"], ["Shine"], [3, "Shine", "Clean surfaces", "N/A"]],
  });
  const { next, done } = await importFiles([f], null, {});
  assert.match(done[0][1], /1 areas · 3 criteria · 1 completed audits/);
  const area = Object.fromEntries(next.fivesAreas.cols.map((c, i) => [c, next.fivesAreas.rows[0][i]]));
  assert.deepEqual([area.Area, area.Risk, area.Frequency, area["Key equipment"]], ["Compression", "Critical", "Weekly", "Presses"]);
  const audit = Object.fromEntries(next.fives.cols.map((c, i) => [c, next.fives.rows[0][i]]));
  assert.deepEqual([audit.Date, audit.Auditor, audit.Scale, audit.Scores], ["2026-10-14", "QA one", 3, "3,1,-"]);
  const item = Object.fromEntries(next.fivesItems.cols.map((c, i) => [c, next.fivesItems.rows[0][i]]));
  assert.deepEqual([item.No, item.Score, item.Action, item.Priority, item.Due], [2, 1, "Label all", "High", "2026-10-21"]);
});

test("APQR tracker workbook: task register, Scigeniq plan and export date", async () => {
  const hdr = ["Reference ID", "Product", "Dosage Form", "Site", "Department", "Data Stream", "Task Type", "Task Title", "Workflow Stage", "Status", "Assigned User", "Created", "Start", "Due", "Closed On", "Closure", "Days to Due"];
  const f = fileOf("tracker.xlsx", {
    Dashboard: [[], [null, "TITLE"], [], [], [null, "Report date", new Date(Date.UTC(2026, 6, 28))]],
    "Task Register": [["APQR TASK REGISTER"], ["note"], [], hdr, ["APQR-KE-1", `${P(1)}-ELKENDI`, "Tablets", "SITE", "QC", "QC", "QC Data Collection", "QC data", "Completed", "Completed", "Analyst", "2026-07-01", "2026-07-01", "2026-08-01", "2026-07-20", "Closed", ""]],
    "APQR Plan 2026": [["PLAN"], ["note"], [], ["#", "Product", "Process", "Exec. Year", "Site", "Review Start", "Review End", "Period End (date)", "Plan Status"], [1, `${P(1)}-ELKENDI`, "Tablets", 2026, "SITE", "12/2025", "11/2026", "2026-11-30", "Approved"]],
  });
  const { next, done, replaced } = await importFiles([f], null, {});
  assert.match(done[0][1], /1 APQR tasks · Scigeniq APQR plan · 1 products/);
  assert.deepEqual(replaced.sort(), ["apqrSys", "apqrTasks"]);
  assert.equal(next.meta.apqrAsOf, "2026-07-28");
  assert.equal(next.apqrTasks.rows[0][next.apqrTasks.cols.indexOf("Data Stream")], "QC");
  assert.equal(next.apqrSys.rows[0][next.apqrSys.cols.indexOf("Review start")], "12/2025");
});

// ---------- Scigeniq all-tasks report → APQR task list ----------
const { dmyTime, apqrTaskClass, dosageFormOf, mergeApqrTasks, parseDelimited, matchColumns, upsertRows, prepBulkRow } = await import("../oncology/js/importers.js");
const SCIG_HDR = ["Creation Date", "Type", "Stage", "Title", "Reference Id", "Status", "Closed", "Closing date", "Closed by", "Project", "Location", "Zone", "Asset", "Creating method", "Role",
  "Start Date", "End Date", "Assigned User", "Associated Users", "Critical Level", "Tags", "Created By", "Folders", "Parent action", "Duration"];
const scig = (o) => SCIG_HDR.map((c) => o[c] ?? "-----");
const DEMO = "DEMOLOL (Demolol) 10 mg F/C Tablets (30 TAB)-ELKENDI";

test("Scigeniq task fields: dates, department and stream, dosage form", () => {
  assert.equal(dmyTime("22/10/2026 04:11 pm"), "2026-10-22T16:11");
  assert.equal(dmyTime("07/01/2027 12:05 am"), "2027-01-07T00:05");
  assert.equal(dmyTime("15/12/2026"), "2026-12-15");
  assert.deepEqual([["APQR", "x"], ["IPC Data Collection - Tablet", "x"], ["Process Data Collection - Hard Capsule", "x"], ["QC Data Collection - liquid", "x"], ["RA Data Collection", "x"],
    ["QA Data Collection", "CM Data Collection"], ["QA Data Collection", "Supplier Data Collection"], ["QA Data Collection", "VL Process Data Collection"], ["QA Data Collection", "QC OOS/OOT Data Collection"],
    ["QA Data Collection", "Compliance Data Collection"]].map(([a, b]) => apqrTaskClass(a, b).join("/")),
  ["QA/APQR Workflow", "Production/IPC", "Production/Process", "QC/QC", "RA/RA", "QA/Change Management", "QA/Supplier", "Validation/Validation", "QC/QC", "QA/QA"]);
  assert.deepEqual(["X 20 mg Capsules (30 CAP)", "X 1% Gel (30 gm)", "X Syrup (100 ml)", "X 5 mg Tablets (30 TAB)", "X 10 mg/ml Injectable", "Shampoo"].map(dosageFormOf),
    ["Hard Capsule", "Semi Solid", "Liquid/Syrup", "Tablets", "Injectable", null]);
});

test("Scigeniq all-tasks report merges into the APQR tasks: update, add, infer closure, flag duplicates", async () => {
  const rows = [
    scig({ "Creation Date": "01/10/2026 09:00 am", Type: "APQR", Stage: "Data Collection", Title: `APQR , ${DEMO}`, "Reference Id": "APQR-KE-50", Status: "Open", Closed: "Not Closed", "End Date": "01/01/2027 09:00 am", "Assigned User": "Owner A", "Critical Level": "Low", "Parent action": `Row - ${DEMO}(Tablets)` }),
    scig({ "Creation Date": "02/10/2026 09:00 am", Type: "QA Data Collection", Stage: "Collecting Data", Title: "Supplier Data Collection", "Reference Id": "APQR-KE-50", Status: "Overdue", Closed: "Not Closed", "End Date": "10/10/2026 09:00 am", "Parent action": `Task - APQR , ${DEMO}` }),
    scig({ "Creation Date": "02/10/2026 09:00 am", Type: "QC Data Collection - Tablet", Stage: "Collecting Data", Title: "QC Data Collection - Tablet", "Reference Id": "QCTAB-KE-50", Status: "Open", Closed: "Not Closed", "End Date": "02/01/2027 09:00 am", "Parent action": `Task - APQR , ${DEMO}` }),
    scig({ "Creation Date": "03/09/2026 09:00 am", Type: "APQR", Stage: "Data Collection", Title: "Duplicated", "Reference Id": "APQR-KE-49", Status: "Overdue", Closed: "Not Closed", "End Date": "01/10/2026 09:00 am", "Parent action": `Row - ${DEMO}(Tablets)` }),
    scig({ "Creation Date": "03/09/2026 09:00 am", Type: "RA Data Collection", Stage: "Collecting Data", Title: "RA Data Collection", "Reference Id": "APQR-KE-49", Status: "Overdue", Closed: "Not Closed", "End Date": "01/10/2026 09:00 am", "Parent action": "Task - Duplicated" }),
    scig({ "Creation Date": "04/10/2026 09:00 am", Type: "Approval", Stage: "In Progress", Title: "Area Manager Approval", "Reference Id": "APV-KE-9", Status: "Open", Closed: "Not Closed" }),
  ];
  // padding rows so the export qualifies as a full list of open tasks
  for (let i = 0; i < 50; i++) rows.push(scig({ "Creation Date": "05/10/2026 09:00 am", Type: "Validation Data Collection", Stage: "Collecting Data", Title: `Validation Data Collection ${i}`, "Reference Id": `APQR-KE-${100 + i}`, Status: i % 2 ? "Open" : "Overdue", Closed: "Not Closed", "End Date": "05/11/2026 09:00 am", "Parent action": `Task - APQR , OTHER${i} 5 mg Tablets (30 TAB)-ELKENDI` }));
  const f = fileOf("allTasks_report.xlsx", { "Over All": [["", "scigeniq"], ["", "Overview"], [null, "Generation Date : 22/10/2026 06:06 pm"], [null, " # Open : 30"]], Data: [SCIG_HDR, ...rows] });
  const cols = COLS.apqrTasks;
  const current = { cols, rows: [
    // still open → updated, the comment typed in the app is kept
    cols.map((c) => ({ "Reference ID": "APQR-KE-50", Product: DEMO, "Task Title": "Supplier Data Collection", Status: "Open", Closure: "Not Closed", Comment: "chased by mail" })[c] ?? null),
    // open before, missing now → closed in Scigeniq meanwhile
    cols.map((c) => ({ "Reference ID": "APQR-KE-50", Product: DEMO, "Task Title": "RA Data Collection", Status: "Open", Closure: "Not Closed" })[c] ?? null),
    // other workflow family absent from the export → left alone
    cols.map((c) => ({ "Reference ID": "APQR-PS-1", Product: "OTHER SITE PRODUCT", "Task Title": "Validation Data Collection", Status: "Open", Closure: "Not Closed" })[c] ?? null),
  ] };
  const base = { meta: { apqrAsOf: "2026-07-28" }, apqrTasks: current };
  const { next, done, replaced } = await importFiles([f], base, { current: base });
  assert.match(done[0][1], /Scigeniq APQR tasks of 22\/10\/2026 · 55 tasks in 2 workflows · 54 new, 1 updated, 1 no longer open \(marked closed\) · 1 non-APQR tasks ignored/);
  assert.deepEqual(replaced, ["apqrTasks"]);
  assert.equal(next.meta.apqrAsOf, "2026-10-22");
  const objs = next.apqrTasks.rows.map((r) => Object.fromEntries(cols.map((c, i) => [c, r[i]])));
  const sup = objs.find((o) => o["Task Title"] === "Supplier Data Collection");
  assert.deepEqual([sup.Status, sup.Comment, sup.Department, sup["Data Stream"], sup["Dosage Form"], sup.Site, sup.Due, sup["Last seen"]], ["Overdue", "chased by mail", "QA", "Supplier", "Tablets", "ELKENDI", "2026-10-10T09:00", "2026-10-22"]);
  const ra = objs.find((o) => o["Reference ID"] === "APQR-KE-50" && o["Task Title"] === "RA Data Collection");
  assert.deepEqual([ra.Status, ra.Closure, ra["Last seen"]], ["Closed (inferred)", "Closed", "2026-07-28"]);
  assert.equal(objs.find((o) => o["Reference ID"] === "APQR-PS-1").Status, "Open");
  const dupTask = objs.find((o) => o["Reference ID"] === "APQR-KE-49" && o["Task Title"] === "RA Data Collection");
  assert.equal(dupTask.Product, DEMO); // taken from the duplicated workflow's row
  // in the programme: the duplicate workflow and its tasks are kept apart, the inferred closure counts as done
  const w = { ...wb, meta: { ...wb.meta, apqrAsOf: "2026-10-22" }, apqrTasks: next.apqrTasks,
    apqrSections: table("apqrSections", [{ Product: DEMO, Section: "i", Status: "Complete" }, { Product: DEMO, Section: "ii", Status: "Not applicable" }, { Product: DEMO, Section: "iii", Status: "In progress" }]) };
  const p = build(w).x.apqrProg.products.find((x) => x.key === normProduct(DEMO));
  assert.deepEqual(p.refs, ["APQR-KE-50"]);
  assert.deepEqual(p.dupRefs, ["APQR-KE-49"]);
  assert.equal(p.dupTasks.length, 2);
  assert.equal(p.duplicate, false);
  assert.equal(p.inferred, 1);
  assert.equal(p.total, 4); // workflow, supplier, QC tablet, inferred RA
  assert.equal(p.sectionPct, 2 / 12);
  assert.equal(p.mainRef, "APQR-KE-50");
});

test("merge without an open-only export never infers closures", () => {
  const cols = ["Reference ID", "Task Title", "Status", "Closure", "Closed On", "Last seen"];
  const cur = { cols, rows: [["APQR-KE-1", "A", "Open", "Not Closed", null, null]] };
  const res = mergeApqrTasks(cols, cur, [{ "Reference ID": "APQR-KE-2", "Task Title": "B", Status: "Open" }], { openOnly: false });
  assert.deepEqual([res.added, res.inferred, res.rows[0][2]], [1, 0, "Open"]);
});

test("bulk insert: pasted rows, column matching and upsert", () => {
  assert.deepEqual(parseDelimited("A\tB\n1\t2\n\n3\t4\n"), [["A", "B"], ["1", "2"], ["3", "4"]]);
  assert.deepEqual(parseDelimited('Code;Product\nX1;"Name; with ""quotes"""\n'), [["Code", "Product"], ["X1", 'Name; with "quotes"']]);
  assert.deepEqual(parseDelimited("a,b\n1,2"), [["a", "b"], ["1", "2"]]);
  assert.deepEqual(matchColumns(["reference id", "Title", "End Date", "assigned user", "Nonsense", "Task Title"], COLS.apqrTasks, "apqrTasks"),
    ["Reference ID", "Task Title", "Due", "Assigned User", null, null]); // a column is filled once
  const cols = ["Code", "Product", "Comment"];
  const res = upsertRows(cols, [["X1", "Old", "keep"], ["X2", "Two", null]], [{ Code: "x1", Product: "New" }, { Code: "X3", Product: "Three" }, { Code: "X2", Product: "Two" }, { Product: "No code" }], ["Code"]);
  assert.deepEqual(res.rows, [["X1", "New", "keep"], ["X2", "Two", null], ["X3", "Three", null], [null, "No code", null]]);
  assert.deepEqual([res.added, res.updated, res.unchanged, res.changed], [2, 1, 1, [0, 2, 3]]);
  const x = prepBulkRow("apqrTasks", { "Reference ID": "APQR-KE-7", "Task Title": "CM Data Collection", "Task Type": "QA Data Collection", Product: "DEMO 5 mg Capsules (30 CAP)-ELKENDI", Due: "15/12/2026 05:00 pm" });
  assert.deepEqual([x.Department, x["Data Stream"], x["Dosage Form"], x.Site, x.Due, x.Closure], ["QA", "Change Management", "Hard Capsule", "ELKENDI", "2026-12-15T17:00", "Not Closed"]);
});
