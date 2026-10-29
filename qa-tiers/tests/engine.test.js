// The engine must reproduce the values Excel calculated in the demo workbooks
// (QA_Tier1_Huddle_Board_DEMO.xlsx, QA_Tier2_Daily_Management_DEMO.xlsx).
import test from "node:test";
import assert from "node:assert/strict";
import { DEMO_T1, DEMO_T2 } from "../js/demo-data.js";
import * as E from "../js/engine.js";

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≠ ${b}`);

test("Tier 2 KPI actuals match the KPI Engine sheet", () => {
  const { kpis, pulse } = E.t2Kpis(DEMO_T2);
  const expected = [1, 0.857142857142857, 0, 0.875, 0.888888888888889, 0, 0.892561983471074, 0, 0.955357142857143];
  kpis.forEach((k, i) => close(k.actual, expected[i]));
  assert.deepEqual(kpis.map((k) => k.rag), ["A", "A", "G", "A", "A", "G", "A", "G", "G"]);
  assert.equal(pulse.score, 0.75);
});

test("Tier 2 Q-calendar matches the Daily Log display codes (6–30 Sep)", () => {
  const codes = E.t2Calendar(DEMO_T2).slice(5).map((d) => (d.weekend ? 8 : d.code));
  assert.deepEqual(codes, [1, 2, 3, 1, 1, 8, 8, 2, 3, 1, 2, 2, 8, 8, 3, 2, 3, 2, 2, 8, 8, 2, 2, 3, 3]);
});

test("Tier 2 ƒx columns: overdue, data check, release clock", () => {
  const dev = E.t2Row("dev", { id: "X", opened: "2026-09-01", status: "Open", due: "2026-09-10" }, "2026-09-30");
  assert.equal(dev.live, "Overdue");
  assert.equal(dev.age, 29);
  assert.equal(E.t2Row("dev", { id: "X", status: "Closed" }, "2026-09-30").check, "Completion date missing");
  assert.equal(E.t2Row("cc", { id: "X", status: "Implemented", due: "2026-09-10", closed: "2026-09-12" }, "2026-09-30").onTime, "No");
  const rel = E.t2Release({ id: "B", mfg: "2026-10-12", status: "Released", decision: "2026-10-17" }, { brTarget: 10, statusDate: "2026-10-17" });
  assert.equal(rel.lead, 5);
  assert.equal(rel.late, "No");
});

test("Tier 1 KPIs match the Engine sheet (30 Sep 2026, all team)", () => {
  const ctx = E.t1Context(DEMO_T1, "2026-09-30", "All team");
  const { kpis, health } = E.t1Kpis(ctx);
  const expected = [21, 3, 1.44262295081967, 0, 0.988304093567252, 0.851851851851852, 0.197530864197531, 2, 0.888888888888889, 2,
    1.74074074074074, 0.728395061728395, 0.963503649635037, 0.976190476190476, 0.941176470588235, 2.49180327868852,
    0.984848484848485, 0.916666666666667, 19.2459016393443, 0.722222222222222];
  kpis.forEach((k, i) => assert.ok(Math.abs(k.actual - expected[i]) < 1e-9, `${k.name}: ${k.actual}`));
  close(health.score, 0.7);
});

test("Tier 1 SQDCP pillar day counts match the board", () => {
  const counts = E.t1PillarCounts(E.t1Days(E.t1Context(DEMO_T1, "2026-09-30", "All team")));
  assert.deepEqual(counts, {
    S: { g: 17, a: 4, r: 1, n: 0 }, Q: { g: 7, a: 12, r: 3, n: 0 }, D: { g: 13, a: 1, r: 8, n: 0 },
    C: { g: 17, a: 4, r: 1, n: 0 }, P: { g: 10, a: 11, r: 1, n: 0 },
  });
});

test("Tier 1 team table statuses and open escalations", () => {
  assert.deepEqual(E.t1Team(DEMO_T1, "2026-09-30").map((r) => r.status), ["G", "R", "R"]);
  const { escalated } = E.t1OpenActions(E.t1Context(DEMO_T1, "2026-09-30"));
  assert.deepEqual(escalated.map((a) => a.id), ["A-2609-903"]);
});

test("helpers: RAG rule, next id, working days", () => {
  assert.equal(E.rag(0.86, "Higher", 0.9, 0.8), "A");
  assert.equal(E.rag(2, "Lower", 0, 1), "R");
  assert.equal(E.nextId([{ id: "DEV-26-061" }, { id: "DEV-26-063" }]), "DEV-26-064");
  assert.equal(E.workingDays("2026-10-01", { weekend1: "Friday", weekend2: "Saturday" }), 21);
});
