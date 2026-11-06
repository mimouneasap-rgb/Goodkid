// Tests of training by job position: positions found in running text, working-day deadlines, the training matrix and
// each person's state on it (trained, not trained, old revision, re-training), re-trainings due, SOP trainings still to
// give after a new revision, the monthly achievement and the yearly deadlines — synthetic names and codes only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { toDay } from "../oncology/js/model.js";
import { listOf, joinList, addWorkingDays, buildTraining, monthlyAchievement, calendarOf, nextTrainingId, resultOf, topicKey } from "../oncology/js/trainkit.js";
import { dueItems } from "../oncology/js/cockpit.js";
import { sopKey } from "../oncology/js/sopkit.js";

const DAY = 86400000;
const POS = ["Demo Officer", "Demo Senior Officer", "Demo Supervisor", "Demo Documentation Officer"];

test("positions in one cell: separators, or known names found in running text", () => {
  assert.deepEqual(listOf("Demo Officer / Demo Supervisor"), ["Demo Officer", "Demo Supervisor"]);
  assert.deepEqual(listOf("Demo Documentation Officer Demo Officer demo senior officer", POS), ["Demo Documentation Officer", "Demo Officer", "Demo Senior Officer"]);
  assert.deepEqual(listOf("Someone Else", POS), ["Someone Else"]);
  assert.equal(joinList(["A", "B", "A", null]), "A / B");
  assert.deepEqual([topicKey("SOPXY0003E/Onc", "x"), topicKey(null, " Basic  GMP ")], ["SOPXY3/ONC", "basic gmp"]);
});

test("working days skip Friday and Saturday; the score decides the result", () => {
  const thu = toDay("2026-10-22"); // a Thursday
  assert.equal(new Date(addWorkingDays(thu, 1)).toISOString().slice(0, 10), "2026-10-25"); // Sunday
  assert.equal(new Date(addWorkingDays(thu, 15)).toISOString().slice(0, 10), "2026-11-12");
  assert.deepEqual([resultOf({ Score: 74 }), resultOf({ Score: "75" }), resultOf({}), resultOf({ Score: 90, Result: "N/A" })], ["Re-training", "Complying", "N/A", "N/A"]);
  assert.equal(nextTrainingId(["UT-2026-002", "UT-2025-009"], "UT", "2026"), "UT-2026-003");
});

const now = toDay("2026-10-21");
const sops = [
  { Code: "SOPXY0003E/Onc", key: sopKey("SOPXY0003E/Onc"), Revision: "04", eff: toDay("2026-10-01"), Title: "Demo document control", Department: "QA" },
  { Code: "SOPXY0004/Onc", key: sopKey("SOPXY0004/Onc"), Revision: "02", eff: toDay("2024-01-10"), Title: "Demo GDP", Department: "QA" },
  { Code: "SOPXY0099/Onc", key: sopKey("SOPXY0099/Onc"), Revision: "01", eff: toDay("2026-09-15"), Title: "Demo new SOP", Department: "QA" },
];
const base = {
  positions: [{ Position: "Demo Officer", Department: "Quality Assurance", Level: 5 }, { Position: "Demo Supervisor", Department: "Quality Assurance", Level: 3 }],
  staff: [{ Name: "Alpha One", Position: "Demo Officer" }, { Name: "Beta Two", Position: "Demo Officer" }, { Name: "Gamma Three", Position: "Demo Supervisor" }, { Name: "Delta Four", Position: "Demo Officer", Status: "Left" }],
  matrix: [{ Topic: "Document control", Reference: "SOPXY0003E/Onc", Positions: "Demo Officer / Demo Supervisor" }, { Topic: "GDP", Reference: "SOPXY0004/Onc", Positions: "Demo Officer" }],
  planned: [{ Program: "SOPXY0004/Onc GDP", Reference: "SOPXY0004/Onc", "Attendee group": "Demo Officer Demo Supervisor", planned: toDay("2026-03-01"), done: toDay("2026-03-10"), status: "Completed" }],
  records: [
    { Employee: "Alpha One", Reference: "SOPXY0003E/Onc", Revision: "03", Date: "2026-01-05", Score: 90 },
    { Employee: "Alpha One", Reference: "SOPXY0004/Onc", Revision: "02", Date: "2026-03-10", Score: 80 },
    { Employee: "Beta Two", Reference: "SOPXY0004/Onc", Revision: "02", Date: "2026-03-10", Score: 60 },
    { Employee: "Gamma Three", Reference: "SOPXY0003E/Onc", Revision: "04", Date: "2026-10-05", Result: "N/A" },
  ],
  sops, now, dayOf: toDay,
};

test("each person on the training matrix: trained, old revision, re-training, not trained", () => {
  const T = buildTraining(base);
  const by = (n) => T.people.find((p) => p.name === n);
  assert.deepEqual(by("Alpha One").items.map((i) => [i.topic.Reference, i.state]), [["SOPXY0003E/Onc", "Old revision"], ["SOPXY0004/Onc", "Trained"]]);
  assert.deepEqual(by("Beta Two").items.map((i) => i.state), ["Not trained", "Re-training"]);
  assert.deepEqual([by("Gamma Three").compliance, by("Gamma Three").certificate], [1, true]);
  assert.equal(by("Delta Four").active, false);
  assert.equal(T.planned[0].positions.length, 2);
  // the supervisor level may use read & understood
  assert.deepEqual(T.positions.map((p) => p.readUnderstood), [false, true]);
  // re-training: 15 working days after the unsuccessful training
  assert.deepEqual(T.retraining.map((r) => [r.record.emp, new Date(r.due).toISOString().slice(0, 10), r.overdue]), [["Beta Two", "2026-03-31", true]]);
  const pos = T.byPosition.find((p) => p.name === "Demo Officer");
  assert.deepEqual([pos.people.length, pos.required.length, Math.round(pos.compliance * 100)], [2, 2, 25]);
});

test("SOP trainings still to give after a new revision; an unplanned training covers one", () => {
  const T = buildTraining(base);
  const need = (code) => T.sopNeeds.find((n) => n.sop.Code === code);
  const n3 = need("SOPXY0003E/Onc");
  assert.deepEqual([n3.category, n3.fromMatrix, n3.pending.map((p) => p.name), new Date(n3.due).toISOString().slice(0, 10), n3.covered], ["Revised SOP", true, ["Alpha One", "Beta Two"], "2026-10-31", null]);
  // not in the matrix: the positions of its department; first issue = new SOP
  const n99 = need("SOPXY0099/Onc");
  assert.deepEqual([n99.category, n99.fromMatrix, n99.positions, n99.overdue], ["New SOP", false, ["Demo Officer", "Demo Supervisor"], true]);
  assert.equal(need("SOPXY0004/Onc"), undefined); // effective long ago
  const T2 = buildTraining({ ...base, unplanned: [{ "Training ID": "UT-2026-001", Category: "Revised SOP", Reference: "SOPXY0003E/Onc", Revision: "04", Status: "To schedule" }] });
  const u = T2.unplanned[0];
  assert.deepEqual([u.status, new Date(u.due).toISOString().slice(0, 10), u.dueAuto], ["To schedule", "2026-10-31", true]);
  assert.ok(T2.sopNeeds.find((n) => n.sop.Code === "SOPXY0003E/Onc").covered);
  const late = buildTraining({ ...base, unplanned: [{ Category: "Quality circle", Title: "Demo circle", Due: "2026-10-01" }, { Category: "External training", Title: "Done", Due: "2026-10-01", Date: "2026-09-20", Status: "Completed" }] });
  assert.deepEqual(late.unplanned.map((x) => [x.status, x.onTime]), [["Overdue", null], ["Completed", true]]);
});

test("monthly achievement, yearly deadlines and the cockpit", () => {
  const T = buildTraining({ ...base, unplanned: [{ Category: "External training", Title: "Done", Date: "2026-03-20", Status: "Completed" }] });
  const mo = monthlyAchievement(T, 2026);
  assert.deepEqual([mo[2].planned, mo[2].plannedDone, mo[2].unplannedDone], [1, 1, 1]);
  const cal = calendarOf(toDay("2026-11-20"));
  assert.deepEqual(cal.slice(0, 3).map((c) => [c.key, new Date(c.at).toISOString().slice(0, 10)]), [["matrix", "2026-12-01"], ["risk", "2026-12-15"], ["plan", "2026-12-31"]]);
  const D = dueItems({ records: [], actions: [], fmea: [], impr: [], x: { trainingX: T, sopx: { list: [], reviews: [] } } }, now);
  assert.ok(D.some((x) => x.kind === "Revised SOP training" && x.id === "SOPXY0003E/Onc"));
  assert.ok(D.some((x) => x.kind === "Re-training" && x.bucket === "overdue"));
});

test("importing a department's training matrix and annual plan (synthetic documents)", async () => {
  const { importTrainingMatrix, importTrainingPlan, matrixTopic, COLS } = await import("../oncology/js/importers.js");
  assert.deepEqual(matrixTopic("SOPXY0004EOnc : Demo guidance"), ["SOPXY0004E/Onc", "Demo guidance"]);
  assert.deepEqual(matrixTopic("SOPXY0014E/ Onc : Demo check"), ["SOPXY0014E/Onc", "Demo check"]);
  assert.deepEqual(matrixTopic("ICH Q9 : Quality risk management"), [null, "ICH Q9 : Quality risk management"]);
  const table = (cols, objs) => ({ cols, rows: objs.map((o) => cols.map((c) => o[c] ?? null)) });
  const current = {
    positions: table(COLS.positions, [{ Position: "QA Demo Officer", Code: "O", Department: "Quality Assurance" }, { Position: "QA Demo Manager", Code: "M", Department: "Quality Assurance" }]),
    trainingMatrix: table(COLS.trainingMatrix, [{ Topic: "Old", Reference: "SOPXY0001E/Onc", Department: "Quality Assurance", "Refresh (months)": 24 }, { Topic: "Other dept", Department: "Quality Control" }]),
    training: table(COLS.training, [{ "Training ID": "TR-2026-QA-01", Program: "SOPXY0001E/Onc : Demo  procedure", Department: "Quality Assurance", "Planned month": "2026-02", Status: "Completed", "Completion date": "2026-02-25", Trainer: "Demo Trainer" },
      { "Training ID": "TR-2026-QA-02", Program: "Dropped topic", Department: "Quality Assurance", "Planned month": "2026-03", Status: "Planned" },
      { "Training ID": "TR-2026-QC-01", Program: "Kept QC plan", Department: "Quality Control", "Planned month": "2026-03", Status: "Planned" }]),
  };
  const mdoc = { text: "O: Officer; SS: Senior Supervisor; M: Manager.\nRemark:", tables: [[
    ["Sr. No.", "SOP/Document", "QA Department", "QA Department", "QA Department"],
    ["Sr. No.", "Number & Title (Numéro et Titre)", "O", "SS", "M"],
    ["", "SOPXY0001E/Onc : Demo procedure", "X", "", "X"],
    ["", "SOPXY0002/Onc : Not for QA", "", "", ""],
    ["", "ICH Q9 : Quality risk management", "X", "X", "X"],
  ]] };
  const next = { positions: current.positions, trainingMatrix: current.trainingMatrix, training: current.training }, replaced = [];
  const msg = importTrainingMatrix(mdoc, next, replaced, current);
  assert.match(msg, /2 of 3 topics required · 3 job positions \(1 added\)/);
  const mx = next.trainingMatrix.rows.map((r) => Object.fromEntries(COLS.trainingMatrix.map((c, i) => [c, r[i]])));
  assert.deepEqual(mx.map((r) => [r.Reference, r.Kind, r.Positions, r.Department, r["Refresh (months)"]]), [
    [null, null, null, "Quality Control", null],
    ["SOPXY0001E/Onc", "SOP", "QA Demo Officer / QA Demo Manager", "Quality Assurance", 24],
    [null, "GMP", "QA Demo Officer / QA Senior Supervisor / QA Demo Manager", "Quality Assurance", null]]);
  assert.ok(replaced.includes("positions") && next.positions.rows.some((r) => r[0] === "QA Senior Supervisor" && r[1] === "SS"));
  // the annual plan: same trainings keep what was recorded; dropped ones go; other plans stay
  const pdoc = { text: "", tables: [
    [["Plan of Year (plan de l’année)", "Department (Département)"], ["2026", "Quality Assurance"]],
    [["Description of Training Program", "Job Descriptions of Attendee Group", "Planned Training Date", "New", "Rescheduled", "Completion date", "Comments"],
      ["SOPXY0001E/Onc : Demo procedure", "QA Demo Officer\nQA Demo Manager", "02/2026", "", "", "", ""],
      ["New topic", "QA Demo Officer", "05/2026", "", "", "", ""]]] };
  const msg2 = importTrainingPlan(pdoc, next, replaced, current);
  assert.match(msg2, /2 trainings · 1 keep what was recorded/);
  const tr = next.training.rows.map((r) => Object.fromEntries(COLS.training.map((c, i) => [c, r[i]])));
  assert.deepEqual(tr.map((r) => [r["Training ID"], r.Program, r.Status, r["Completion date"], r.Trainer, r["Attendee group"]]), [
    ["TR-2026-QC-01", "Kept QC plan", "Planned", null, null, null],
    ["TR-2026-QA-01", "SOPXY0001E/Onc : Demo procedure", "Completed", "2026-02-25", "Demo Trainer", "QA Demo Officer / QA Demo Manager"],
    ["TR-2026-QA-02", "New topic", "Planned", null, null, "QA Demo Officer"]]);
});
