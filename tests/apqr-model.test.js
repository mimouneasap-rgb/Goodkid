import { test } from "node:test";
import assert from "node:assert/strict";
import {
  dayNumber, daysBetween, addDays, monthEnd, addMonths, resolveAsOf, apqrNumber, annexNumber,
  normName, shortProduct, createState, evaluateTask, deriveProgramme, programmeKpis, byDepartment,
  byForm, byStage, workload, burnUp, planBucket, parseCsv, toCsv, importTasks, normaliseDateCell,
  sortRows, diffFields, nextTaskId,
} from "../apqr/js/model.js";
import { SEED_META, PRODUCT_FIELDS, PRODUCT_ROWS, TASK_FIELDS, TASK_ROWS } from "../apqr/js/seed-data.js";

const seedState = () => createState({
  meta: SEED_META, productFields: PRODUCT_FIELDS, productRows: PRODUCT_ROWS, taskFields: TASK_FIELDS, taskRows: TASK_ROWS,
});

test("date helpers work on calendar days and ignore times", () => {
  assert.equal(daysBetween("2026-07-28", "2026-10-08T15:56"), 72);
  assert.equal(daysBetween("2026-07-13T11:56", "2026-07-23T12:08"), 10);
  assert.equal(addDays("2026-11-30", 90), "2027-02-28");
  assert.equal(monthEnd("2026-02"), "2026-02-28");
  assert.equal(monthEnd("2024-02"), "2024-02-29");
  assert.equal(addMonths("2025-11", 3), "2026-02");
  assert.equal(dayNumber("not a date"), null);
  assert.equal(resolveAsOf({ asOfMode: "today", asOf: "2026-07-28" }, new Date(2026, 9, 22, 23, 30)), "2026-10-22");
  assert.equal(resolveAsOf({ asOfMode: "snapshot", asOf: "2026-07-28" }), "2026-07-28");
});

test("APQR and annex numbers follow SOPQA0021E §10.6 and §10.8.1", () => {
  const p = { code: "TB114P01", plannedMonth: "2023-03" };
  assert.equal(apqrNumber(p), "APQR/TB114P01/0323");
  assert.equal(annexNumber(p, "PR"), "TB114P01/0323/PR");
  assert.equal(apqrNumber({ code: "", plannedMonth: "2023-03" }), "");
});

test("product names match across the Word plan and the Scigeniq export", () => {
  assert.equal(
    normName("ACNESTOP (Clindamycin) 1% Gel (30 gm)-ELKENDI"),
    normName("ACNESTOP (Clindamycin) 1% Gel (30 gm)"),
  );
  assert.equal(normName("AMITRAL (Lamotrigine) 5 mg F/C"), normName("AMITRAL (Lamotrigine) 5 mg F/C"));
  assert.equal(shortProduct("CILAGRA (Sildenafil) 50 mg Tablets (2 TAB)"), "CILAGRA 50 mg");
  assert.equal(shortProduct("ACNAL (Adapalene) 0,1% Gel (30 gm)"), "ACNAL 0,1%");
});

test("task evaluation flags overdue only for open tasks past their due day", () => {
  const asOf = "2026-07-28";
  assert.equal(evaluateTask({ status: "Open", due: "2026-07-27T15:00", start: "2026-07-01" }, asOf).overdue, true);
  assert.equal(evaluateTask({ status: "Open", due: "2026-07-28T10:00", start: "2026-07-01" }, asOf).overdue, false);
  assert.equal(evaluateTask({ status: "Completed", due: "2026-07-01", start: "2026-06-01", closedOn: "2026-06-11" }, asOf).overdue, false);
  assert.equal(evaluateTask({ status: "Completed", due: "2026-07-01", start: "2026-06-01", closedOn: "2026-06-11" }, asOf).ageing, 10);
  assert.equal(evaluateTask({ status: "Cancelled", due: "2026-07-01" }, asOf).open, false);
});

test("seed data reproduces the master tracker workbook figures", () => {
  const state = seedState();
  assert.equal(state.products.length, 248);
  assert.equal(state.tasks.length, 784);
  const d = deriveProgramme(state);
  const k = programmeKpis(d.products, d.tasks, d.asOf);
  assert.equal(d.asOf, "2026-07-28");
  assert.equal(k.planned, 247);
  assert.equal(k.inScigeniqPlan, 199);
  assert.equal(k.annualOnly, 48);
  assert.equal(k.triggered, 68);
  assert.equal(k.plannedTriggered, 67);
  assert.equal(k.completed, 329);
  assert.equal(k.open, 455);
  assert.equal(k.systemOverdue, 12);
  assert.equal(k.overdue, 8);
  assert.equal(k.productsOverdue, 6);
  assert.equal(k.unassigned, 133);
  assert.equal(k.unassignedOpen, 131);
  assert.equal(k.duplicates, 6);
  assert.deepEqual(k.rag, { COMPLETE: 1, "ON TRACK": 61, "DUE SOON": 0, OVERDUE: 6 });

  const depts = Object.fromEntries(byDepartment(d.tasks).map((r) => [r.dept, [r.completed, r.open]]));
  assert.deepEqual(depts, { QA: [73, 210], QC: [90, 58], Production: [47, 95], RA: [62, 9], Validation: [57, 83] });
  const forms = Object.fromEntries(byForm(d.products.filter((p) => p.scigeniqNo)).map((r) => [r.form, [r.planned, r.triggered]]));
  assert.deepEqual(forms, { Tablets: [148, 52], "Hard Capsule": [23, 6], "Semi Solid": [14, 5], "Liquid/Syrup": [14, 4] });
  assert.deepEqual(byStage(d.tasks).map((s) => s.count), [4, 71, 190, 190, 329]);
});

test("tracker rows: ARTIZ drops carries three workflows and is overdue", () => {
  const d = deriveProgramme(seedState());
  const artiz = d.products.find((p) => p.name.startsWith("ARTIZ (Cetirizine dihydrochloride) 10 mg/ml"));
  assert.equal(artiz.refs.length, 3);
  assert.equal(artiz.primaryRef, "APQR-KE-19");
  assert.equal(artiz.total, 28);
  assert.equal(artiz.completed, 11);
  assert.equal(artiz.overdue, 2);
  assert.equal(artiz.rag, "OVERDUE");
  assert.equal(artiz.bottleneck, "QA");
  assert.equal(planBucket(artiz), "late");
  const acnestop = d.products.find((p) => p.name.startsWith("ACNESTOP"));
  assert.equal(acnestop.owner, "Abdurrahman Yous");
  assert.equal(acnestop.wfDaysToDue, 72);
  assert.equal(acnestop.phase, "collection");
  assert.equal(acnestop.apqrNo, `APQR/${acnestop.code}/${acnestop.plannedMonth.slice(5)}26`);
});

test("plan status and report due follow §10.3.6 (period end + 3 months)", () => {
  const d = deriveProgramme(seedState());
  const flumide = d.products.find((p) => p.code === "TB309P01");
  assert.equal(flumide.reportDue, "2027-02-28");
  assert.equal(flumide.planStatus, "Not triggered");
  const cilagra = d.products.find((p) => p.code === "TB040P02");
  assert.equal(cilagra.reportDue, "2026-03-31");
  assert.equal(cilagra.planStatus, "Past due");
  assert.equal(cilagra.route, "QMex");
  assert.ok(cilagra.flags.some((f) => f.kind === "scope") === false, "QMex-route products are not flagged as missing from Scigeniq");
});

test("closing via the committee or a manual phase changes the plan status", () => {
  const state = seedState();
  const p = state.products.find((x) => x.code === "TB040P02");
  p.phase = "closed";
  const d = deriveProgramme(state);
  assert.equal(d.productById.get("TB040P02").planStatus, "Closed");
  assert.equal(planBucket(d.productById.get("TB040P02")), "closed");
});

test("cancelling superseded workflow tasks removes them from the counts", () => {
  const state = seedState();
  const artizId = state.products.find((p) => p.name.startsWith("ARTIZ (Cetirizine dihydrochloride) 10 mg/ml")).id;
  for (const t of state.tasks) if (t.productId === artizId && t.ref !== "APQR-KE-19" && t.ref.startsWith("APQR")) t.status = "Cancelled";
  const p = deriveProgramme(state).productById.get(artizId);
  assert.equal(p.duplicate, false);
  assert.ok(p.total < 28);
});

test("workload and burn-up summarise tasks", () => {
  const d = deriveProgramme(seedState());
  const yous = workload(d.tasks).find((u) => u.user === "Abdurrahman Yous");
  assert.equal(yous.open, 80);
  assert.equal(yous.overdue, 6);
  assert.equal(yous.status, "Overdue items");
  const burn = burnUp(d.tasks, d.asOf);
  assert.equal(burn.at(-1).created, 784);
  assert.equal(burn.at(-1).closed, 329);
  assert.ok(burn.every((p, i) => i === 0 || p.closed >= burn[i - 1].closed));
});

test("CSV round trip handles quotes, commas, semicolons and formula prefixes", () => {
  const rows = [{ a: 'He said "hi", ok', b: "=SUM(A1)" }];
  const csv = toCsv(rows, [{ label: "A", value: (r) => r.a }, { label: "B", value: (r) => r.b }]);
  const back = parseCsv(csv);
  assert.deepEqual(back[1], ['He said "hi", ok', "'=SUM(A1)"]);
  assert.deepEqual(parseCsv("x;y\n1;2"), [["x", "y"], ["1", "2"]]);
});

test("Scigeniq export import maps headers, dates and new products", () => {
  const state = seedState();
  const rows = [
    ["APQR TASK REGISTER"],
    [],
    ["Reference ID", "Product", "Dosage Form", "Site", "Department", "Data Stream", "Task Type", "Task Title", "Workflow Stage", "Status", "Assigned User", "Created", "Start", "Due", "Closed On"],
    ["APQR-KE-62", "ACNESTOP (Clindamycin) 1% Gel (30 gm)-ELKENDI", "Semi Solid", "ELKENDI", "QA", "QA", "QA Data Collection", "QA Data Collection", "Collecting Data", "Open", "", "13/07/2026 11:56", "13/07/2026 11:56", 46278.5, ""],
    ["APQR-KE-99", "NEWPROD (Thing) 5 mg Tablets (30 TAB)-ELKENDI", "Tablets", "ELKENDI", "QC", "QC", "QC Data Collection - Tablet", "QC Data Collection - Tablet", "Completed", "Completed", "Ilhem Faci", "2026-07-01", "2026-07-01", "2026-08-01", "2026-07-20"],
  ];
  const out = importTasks(rows, state.products);
  assert.equal(out.tasks.length, 2);
  assert.equal(out.tasks[0].productId, state.products.find((p) => p.name.startsWith("ACNESTOP")).id);
  assert.equal(out.tasks[0].user, "Unassigned");
  assert.equal(out.tasks[0].created, "2026-07-13T11:56");
  assert.equal(out.tasks[0].due, "2026-09-13T12:00");
  assert.equal(out.newProducts.length, 1);
  assert.equal(out.newProducts[0].name, "NEWPROD (Thing) 5 mg Tablets (30 TAB)");
  assert.ok(importTasks([["a", "b"], [1, 2]], state.products).error);
});

test("date cells normalise from several spreadsheet formats", () => {
  assert.equal(normaliseDateCell("2026-07-13T11:56"), "2026-07-13T11:56");
  assert.equal(normaliseDateCell("13/07/2026"), "2026-07-13T00:00");
  assert.equal(normaliseDateCell(""), "");
  assert.equal(normaliseDateCell("n/a"), "");
});

test("sorting keeps blanks last in both directions; diff and ids", () => {
  const rows = [{ v: 2 }, { v: "" }, { v: 10 }];
  assert.deepEqual(sortRows(rows, "v", "asc").map((r) => r.v), [2, 10, ""]);
  assert.deepEqual(sortRows(rows, "v", "desc").map((r) => r.v), [10, 2, ""]);
  assert.deepEqual(diffFields({ a: 1, b: 2 }, { a: 1, b: 3 }, ["a", "b"]), [{ field: "b", from: 2, to: 3 }]);
  assert.equal(nextTaskId([{ id: "T0009" }, { id: "T0784" }]), "T0785");
});
