import { test } from "node:test";
import assert from "node:assert/strict";
import {
  rpn, matrixScore, riskLevel, evaluate, validateRisk, nextId,
  filterRisks, sortRisks, buildMatrix, summarize, toCsv, fromCsv, parseCsvRows,
} from "../js/risk.js";

const base = {
  id: "QR-001", title: "Tablet weight variation", hazard: "Out-of-spec fill weight",
  category: "Process", severity: 4, occurrence: 3, detection: 2, status: "Open",
  owner: "QA", reviewDate: "2026-01-01",
};

test("rpn multiplies the three factors and rejects out-of-range values", () => {
  assert.equal(rpn(4, 3, 2), 24);
  assert.equal(rpn(5, 5, 5), 125);
  assert.equal(rpn(0, 3, 2), null);
  assert.equal(rpn(6, 3, 2), null);
  assert.equal(rpn(2.5, 3, 2), null);
});

test("riskLevel bands follow severity × occurrence", () => {
  assert.equal(matrixScore(2, 2), 4);
  assert.equal(riskLevel(1, 4), "Low");
  assert.equal(riskLevel(1, 5), "Medium");
  assert.equal(riskLevel(3, 3), "Medium");
  assert.equal(riskLevel(2, 5), "High");
  assert.equal(riskLevel(4, 4), "High");
  assert.equal(riskLevel(4, 5), "Critical");
  assert.equal(riskLevel(null, 5), null);
});

test("evaluate derives residual values and overdue flag", () => {
  const today = new Date(2026, 5, 1);
  const r = evaluate({ ...base, residualSeverity: 4, residualOccurrence: 1, residualDetection: 1 }, today);
  assert.equal(r.rpn, 24);
  assert.equal(r.level, "High");
  assert.equal(r.residualRpn, 4);
  assert.equal(r.residualLevel, "Low");
  assert.equal(r.overdue, true);

  assert.equal(evaluate({ ...base, status: "Closed" }, today).overdue, false);
  assert.equal(evaluate({ ...base, reviewDate: "2027-01-01" }, today).overdue, false);
  assert.equal(evaluate(base, today).residualRpn, null);
});

test("validateRisk reports missing and inconsistent fields", () => {
  assert.deepEqual(validateRisk(base), []);
  const errors = validateRisk({ severity: 9, occurrence: 1, detection: 1 });
  assert.ok(errors.some((e) => e.startsWith("Title")));
  assert.ok(errors.some((e) => e.startsWith("Failure mode")));
  assert.ok(errors.some((e) => e.startsWith("Severity")));
  assert.ok(validateRisk({ ...base, residualSeverity: 2 }).some((e) => e.startsWith("Residual")));
  assert.ok(validateRisk({ ...base, status: "Closed" }).some((e) => e.includes("closed")));
  assert.deepEqual(validateRisk({
    ...base, status: "Closed", residualSeverity: 2, residualOccurrence: 1, residualDetection: 1,
  }), []);
  assert.ok(validateRisk({ ...base, reviewDate: "01/02/2026" }).length === 1);
});

test("nextId continues the highest existing number", () => {
  assert.equal(nextId([]), "QR-001");
  assert.equal(nextId([{ id: "QR-002" }, { id: "QR-010" }, { id: "x" }]), "QR-011");
});

test("filterRisks and sortRisks", () => {
  const risks = [
    evaluate(base),
    evaluate({ ...base, id: "QR-002", title: "Supplier change", category: "Supplier", severity: 2, occurrence: 1 }),
    evaluate({ ...base, id: "QR-003", title: "Sterility breach", severity: 5, occurrence: 4, detection: 4 }),
  ];
  assert.deepEqual(filterRisks(risks, { query: "supplier" }).map((r) => r.id), ["QR-002"]);
  assert.deepEqual(filterRisks(risks, { level: "Critical" }).map((r) => r.id), ["QR-003"]);
  assert.deepEqual(filterRisks(risks, { category: "Process" }).length, 2);
  assert.deepEqual(sortRisks(risks, "rpn").map((r) => r.id), ["QR-003", "QR-001", "QR-002"]);
  assert.deepEqual(sortRisks(risks, "title", "asc").map((r) => r.id), ["QR-003", "QR-002", "QR-001"]);
});

test("buildMatrix counts risks per cell", () => {
  const grid = buildMatrix([base, base, { ...base, severity: 1, occurrence: 1 }]);
  assert.equal(grid[3][2], 2);
  assert.equal(grid[0][0], 1);
  const residual = buildMatrix([{ ...base, residualSeverity: 2, residualOccurrence: 2 }], { residual: true });
  assert.equal(residual[1][1], 1);
});

test("summarize aggregates totals", () => {
  const today = new Date(2026, 5, 1);
  const risks = [
    evaluate(base, today),
    evaluate({ ...base, id: "QR-002", status: "Closed", residualSeverity: 4, residualOccurrence: 1, residualDetection: 1 }, today),
  ];
  const s = summarize(risks);
  assert.equal(s.total, 2);
  assert.equal(s.open, 1);
  assert.equal(s.highOrCritical, 1);
  assert.equal(s.overdue, 1);
  assert.equal(s.averageRpn, 24);
  assert.equal(s.rpnReduced, 20);
  assert.equal(s.byStatus.Closed, 1);
});

test("CSV round-trips values containing commas, quotes and newlines", () => {
  const risk = { ...base, controls: 'In-process check, "IPC"\nevery 30 min', residualSeverity: null };
  const parsed = fromCsv(toCsv([risk]));
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].controls, risk.controls);
  assert.equal(parsed[0].severity, 4);
  assert.equal(parsed[0].residualSeverity, null);
  assert.deepEqual(parseCsvRows("a,b\n\n1,2"), [["a", "b"], ["1", "2"]]);
  assert.throws(() => fromCsv("name\nx"), /title/);
});

test("sample data passes validation", async () => {
  const { SAMPLE_RISKS } = await import("../js/sample-data.js");
  for (const r of SAMPLE_RISKS) assert.deepEqual(validateRisk(r), [], r.id);
  assert.equal(new Set(SAMPLE_RISKS.map((r) => r.id)).size, SAMPLE_RISKS.length);
});
