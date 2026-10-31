// Unit tests for the APQR tracker's pure modules (no browser needed).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readXlsx, writeXlsx, parseCsv, serialToIso } from "../apqr/js/xlsx.js";
import { compute, eomonth, edate, monthYearToEnd, houseDept, productKey, snapshotBaseline, classifyTask } from "../apqr/js/engine.js";
import { parseDate, classifyDept, productFromParent, transformScigeniq, guessMapping, detect, importTrackerWorkbook, mergeTasks } from "../apqr/js/importers.js";
import { buildWorkbook } from "../apqr/js/exporter.js";
import { demoState } from "../apqr/js/demo.js";

const PRODUCT = "ALPHA (Testolol) 10 mg F/C Tablets (30 TAB)-SITE";

function task(over = {}) {
  return { id: Math.random().toString(36).slice(2), ref: "APQR-T-1", product: PRODUCT, dosageForm: "Tablets", site: "SITE", department: "QA", stream: "QA", taskClass: "Data Collection", taskType: "QA Data Collection", title: "QA Data Collection", stage: "Collecting Data", status: "Open", assignee: "Unassigned", criticality: "Low", created: "2026-05-04T10:00", start: "2026-05-04T10:00", closedOn: "", closure: "Not Closed", createdBy: "System", taskEnd: "2026-07-31", ...over };
}
function baseState(tasks, reportDate = "2026-10-30") {
  return {
    settings: { reportDate, useToday: false, overdueMonths: 3, dueSoonDays: 14, triggerWindowDays: 60 },
    plan: [{ id: "p1", no: 1, product: PRODUCT, process: "Tablets", execYear: 2026, site: "SITE", reviewStart: "05/2025", reviewEnd: "04/2026", periodEnd: "2026-04-30", planStatus: "Approved" }],
    tasks, products: {}, baseline: null, excluded: [], audit: [], meta: {},
  };
}

test("date helpers follow Excel EOMONTH / EDATE", () => {
  assert.equal(eomonth("2026-04-30", 1), "2026-05-31");
  assert.equal(eomonth("2026-01-15", 1), "2026-02-28");
  assert.equal(edate("2026-05-01", 3), "2026-08-01");
  assert.equal(edate("2026-01-31", 1), "2026-02-28");
  assert.equal(monthYearToEnd("11/2026"), "2026-11-30");
  assert.equal(serialToIso(46325), "2026-10-30");
});

test("planned PQR month is the month after review end; overdue = 1st + 3 months", () => {
  const m = compute(baseState([task()]));
  assert.equal(m.plan[0].plannedMonth, "2026-05-31");
  assert.equal(m.plan[0].overdueDate, "2026-08-01");
  assert.equal(m.tasks[0].due, "2026-08-01");
  assert.equal(m.tasks[0].overdue, "YES");
});

const SLOT_TITLES = ["CM Data Collection", "IPC Data Collection - Tablet", "Process Data Collection - Tablet", "QA Data Collection", "QC Data Collection - Tablet", "QC OOS/OOT Data Collection", "RA Data Collection", "Supplier Data Collection", "Validation Data Collection", "VL Process Data Collection"];
const closedTask = (title) => task({ title, stage: "Completed", status: "Completed", closure: "Closed", closedOn: "2026-06-01" });

test("RAG: complete needs the Final QA closed; overdue, due soon, on track", () => {
  const allTen = SLOT_TITLES.map(closedTask);
  const ready = compute(baseState(allTen));
  assert.equal(ready.products[0].slotsOk, 10);
  assert.equal(ready.products[0].fqSignal, "NOT TRIGGERED - data ready");
  assert.equal(ready.products[0].rag, "OVERDUE");
  const done = compute(baseState([...allTen, closedTask("Final QA Data Collection")]));
  assert.equal(done.products[0].rag, "COMPLETE");
  assert.equal(done.products[0].fqSignal, "Complete");
  const soon = compute(baseState([task()], "2026-07-25"));
  assert.equal(soon.products[0].rag, "DUE SOON");
  const ok = compute(baseState([task()], "2026-06-15"));
  assert.equal(ok.products[0].rag, "ON TRACK");
});

test("slots: OK when any task closed, open when raised, MISSING when never raised", () => {
  const m = compute(baseState([closedTask("CM Data Collection"), task({ title: "RA Data Collection" }), task({ title: "RA Data Collection", stage: "Completed", closure: "Closed" })], "2026-06-15"));
  const p = m.products[0];
  assert.equal(p.slots.Compliance.status, "OK");
  assert.equal(p.slots.RA.status, "OK");
  assert.equal(p.slots.QA.status, "MISSING");
  assert.equal(p.slotsOk, 2);
  assert.ok(p.flags.includes("MISSING ANNEXE"));
});

test("Final QA closed with fewer than ten annexes is flagged as a gap", () => {
  const m = compute(baseState([closedTask("CM Data Collection"), closedTask("Final QA Data Collection")]));
  assert.equal(m.products[0].gap, true);
  assert.equal(m.kpi.gaps, 1);
});

test("approvals, workflow and Final QA don't count as annexes", () => {
  const m = compute(baseState([
    closedTask("QA Data Collection"),
    task({ title: "Approval", taskClass: "Approval", stage: "Approved", closure: "Closed", ref: "APV-T-1", taskType: "Approval" }),
    task({ title: `APQR , ${PRODUCT}`, taskClass: "Workflow", taskType: "APQR", stage: "Data Collection" }),
    task({ title: "Final QA Data Collection" }),
  ], "2026-06-15"));
  assert.equal(m.products[0].annexTotal, 1);
  assert.equal(m.products[0].approvals, 1);
  assert.equal(m.products[0].fqSignal, "Raised, not complete");
});

test("untriggered planned products carry ten generated annexes and a Final QA", () => {
  const s = baseState([]);
  s.plan.push({ ...s.plan[0], id: "p2", product: "BETA 5 mg Capsules-SITE", process: "Hard Capsule", reviewEnd: "10/2026", periodEnd: "2026-10-31" });
  const m = compute(s);
  assert.equal(m.kpi.triggered, 0);
  assert.equal(m.kpi.requiredAnnexes, 20);
  assert.equal(m.kpi.annexNotRaised, 20);
  assert.equal(m.generatedTasks.length, 24);
  assert.equal(m.plan[1].tracking, "Not yet triggered");
  assert.equal(m.plan[0].tracking, "NOT TRIGGERED - past due");
  const beta = m.productByKey.get(productKey("BETA 5 mg Capsules-SITE"));
  assert.equal(beta.rag, "Not yet due");
  assert.equal(m.productByKey.get(productKey(PRODUCT)).rag, "NOT STARTED - overdue");
  assert.ok(m.generatedTasks.some((t) => t.title === "Hard Capsule Data Collection"));
});

test("classification: owning department from the title, slot by annexe", () => {
  const c = (title, type = "QA Data Collection", department = "") => classifyTask({ title, type, department });
  assert.deepEqual([c("CM Data Collection").slot, c("CM Data Collection").dept, c("CM Data Collection").shared], ["Compliance", "Compliance", true]);
  assert.equal(c("Supplier Data Collection").dept, "Supplier Qualification");
  assert.equal(c("VL Process Data Collection").slot, "Validation Process");
  assert.equal(c("VL Data Collection").slot, "Validation Process");
  assert.equal(c("Validation Data Collection", "Validation Data Collection").slot, "Validation Metrology");
  assert.equal(c("QC Data Collection - Tablet", "QC Data Collection - Tablet").slot, "QC main");
  assert.equal(c("QC OOS/OOT Data Collection").slot, "QC OOS/OOT");
  assert.equal(c("QC Data Collection").slot, "QC OOS/OOT");
  assert.equal(c("Hard Capsule Data Collection", "Process Data Collection - Hard Capsule").slot, "Process");
  assert.equal(c("IPC Data Collection - Tablet", "IPC Data Collection - Tablet").dept, "Production");
  assert.equal(c("Final QA Data Collection").role, "Final QA compilation");
  assert.equal(classifyTask({ title: "Approval", type: "Approval", ref: "APV-KE-1" }).role, "Approval");
  assert.equal(classifyTask({ title: "APQR , X", type: "APQR" }).role, "Parent workflow");
  assert.deepEqual(classifyDept("Supplier Data Collection", "QA Data Collection"), ["Supplier Qualification", "Supplier"]);
  assert.equal(houseDept("Validation Metrology"), "Validation Metrology");
  assert.equal(houseDept("Supplier Qualification"), "Supplier Qualification");
});

test("parseDate handles Scigeniq text dates and ISO", () => {
  assert.equal(parseDate("29/10/2026 07:58 pm"), "2026-10-29T19:58");
  assert.equal(parseDate("05/03/2026"), "2026-03-05");
  assert.equal(parseDate("05/03/2026", "MDY"), "2026-05-03");
  assert.equal(parseDate("2026-08-01"), "2026-08-01");
  assert.equal(parseDate("-----"), "");
});

test("productFromParent strips the APQR prefix", () => {
  assert.equal(productFromParent("APQR , ALPHA 10 mg-SITE"), "ALPHA 10 mg-SITE");
  assert.equal(productFromParent("APQR /ONC-TB001P01/0326 CLAMUDEX 50 mg"), "CLAMUDEX 50 mg");
});

test("Scigeniq export: products, classes, exclusions and duplicated parents", () => {
  const rows = [
    ["Reference ID", "Type", "Stage", "Status", "Title", "Parent action", "Assigned User", "Creation date", "Closing date"],
    ["APQR-T-1", "APQR", "Data Collection", "Open", `APQR , ${PRODUCT}`, "", "", "04/05/2026 10:00", ""],
    ["APQR-T-1", "QA Data Collection", "Completed", "Completed", "CM Data Collection", `APQR , ${PRODUCT}`, "K. B", "04/05/2026 10:00", "01/06/2026 12:00"],
    ["QCTAB-T-9", "QC Data Collection - Tablet", "Collecting Data", "Open", "QC Data Collection - Tablet", `APQR , ${PRODUCT}`, "", "04/05/2026 10:00", ""],
    ["QCTAB-T-9", "QA Data Collection", "Collecting Data", "Open", "QC OOS/OOT Data Collection", "Task - Duplicated", "", "04/05/2026 10:00", ""],
    ["APV-T-100", "Approval", "Approved", "Completed", "Approval", `APQR , ${PRODUCT}`, "A. S", "02/06/2026", "02/06/2026"],
    ["CC-T-1", "Change Control", "Open", "Open", "Change of supplier", "CC , supplier", "", "01/09/2026", ""],
  ];
  const mapping = guessMapping(rows[0]);
  const res = transformScigeniq(rows, { mapping, headerRow: 0, plan: baseState([]).plan });
  assert.equal(res.stats.tasks, 5);
  assert.equal(res.stats.excluded, 1);
  assert.equal(res.stats.resolvedDup, 1);
  const byTitle = Object.fromEntries(res.tasks.map((t) => [t.title, t]));
  assert.equal(byTitle["CM Data Collection"].department, "Compliance");
  assert.equal(byTitle["CM Data Collection"].annexSlot, "Compliance");
  assert.equal(byTitle["QC OOS/OOT Data Collection"].annexSlot, "QC OOS/OOT");
  assert.equal(byTitle["CM Data Collection"].closure, "Closed");
  assert.equal(byTitle["Approval"].taskClass, "Approval");
  assert.equal(byTitle[`APQR , ${PRODUCT}`].taskClass, "Workflow");
  assert.equal(byTitle["QC OOS/OOT Data Collection"].product, PRODUCT);
  assert.equal(byTitle["QC Data Collection - Tablet"].dosageForm, "Tablets");
  assert.equal(byTitle["QC Data Collection - Tablet"].assignee, "Unassigned");
});

test("xlsx writer and reader round-trip strings, numbers and dates", async () => {
  const blob = await writeXlsx([{ name: "S1", rows: [["Text & <ok>", 12.5, "2026-10-30", "2026-10-30T07:58"], [null, true]] }]);
  const wb = await readXlsx(new Uint8Array(await blob.arrayBuffer()));
  assert.deepEqual(wb.sheets[0].rows[0], ["Text & <ok>", 12.5, "2026-10-30", "2026-10-30T07:58"]);
  assert.equal(wb.sheets[0].rows[1][1], true);
});

test("CSV parsing detects the delimiter and handles quotes", () => {
  assert.deepEqual(parseCsv('a;b;c\n1;"x;y";3\n'), [["a", "b", "c"], ["1", "x;y", "3"]]);
});

test("exported workbook re-imports with identical figures (demo data)", async () => {
  const s = demoState();
  s.settings.useToday = false;
  s.products[productKey(s.plan[0].product)] = { comments: "Follow up" };
  const m1 = compute(s);
  s.baseline = snapshotBaseline(m1, "01/01/2026");
  const m2 = compute(s);
  const blob = await buildWorkbook({ ...s, excluded: [], audit: [] }, m2);
  const wb = await readXlsx(new Uint8Array(await blob.arrayBuffer()));
  assert.equal(detect(wb).kind, "tracker");
  const imp = importTrackerWorkbook(wb);
  const m3 = compute({ ...s, plan: imp.plan, tasks: imp.tasks, products: imp.products, baseline: imp.baseline, settings: { ...s.settings, ...imp.settings, useToday: false } });
  assert.deepEqual(m3.kpi, m2.kpi);
  assert.equal(imp.baseline.label, "01/01/2026");
  assert.equal(Object.values(imp.products).filter((a) => a.comments).length, 1);
});

test("merge updates matching tasks and adds new ones", () => {
  const a = task({ ref: "APQR-T-1", title: "QA Data Collection" });
  const out = mergeTasks([a], [{ ...a, id: "new", stage: "Completed" }, task({ ref: "APQR-T-2" })]);
  assert.equal(out.updated, 1);
  assert.equal(out.added, 1);
  assert.equal(out.tasks[0].stage, "Completed");
  assert.equal(out.tasks[0].id, a.id);
});
