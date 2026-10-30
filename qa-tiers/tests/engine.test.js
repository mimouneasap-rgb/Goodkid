// The engine must reproduce the values Excel calculated in the demo workbooks
// (QA_Tier1_Huddle_Board_DEMO.xlsx, QA_Tier2_Daily_Management_DEMO.xlsx).
import test from "node:test";
import assert from "node:assert/strict";
import { DEMO_T1, DEMO_T2 } from "../js/demo-data.js";
import * as E from "../js/engine.js";

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≠ ${b}`);

test("Tier 2 KPI actuals match the KPI Engine sheet", () => {
  // QA load (index 6) is now calculated from the registers — tested below.
  const { kpis } = E.t2Kpis(DEMO_T2);
  const expected = [1, 0.857142857142857, 0, 0.875, 0.888888888888889, 0, null, 0, 0.955357142857143];
  kpis.forEach((k, i) => expected[i] !== null && close(k.actual, expected[i]));
  assert.deepEqual(kpis.map((k) => k.rag).filter((_, i) => i !== 6), ["A", "A", "G", "A", "A", "G", "G", "G"]);
});

test("QA load: workload, delays and absence come from the data", () => {
  E.linkTier1(() => DEMO_T1);
  const state = { ...DEMO_T2, activities: E.DEFAULT_ACTIVITIES, tasks: [
    { id: "T1", member: "Validation Specialist", activity: "Cleaning validation", opened: "2026-09-01", due: "2026-09-30", status: "In Progress" },
    { id: "T2", member: "Validation Specialist", activity: "Supplier audit", opened: "2026-09-21", due: "2026-09-25", status: "In Progress" },
    { id: "T3", member: "Validation Specialist", activity: "Supplier audit", opened: "2026-09-01", due: "2026-09-10", effort: 9, status: "Cancelled" },
  ] };
  const comp = E.t2Computed(state);
  const vs = comp.load[state.load.findIndex((r) => r.member === "Validation Specialist")];
  close(vs.workload, 8);               // 5 d cleaning validation + 3 d audit; the cancelled task carries no load
  assert.equal(vs.delayed, 1);         // the audit was due 25-Sep and is still open on 30-Sep
  const o1 = comp.load[state.load.findIndex((r) => r.member === "QA Officer 1")];
  assert.equal(o1.logged, 1);          // one Leave/Training/Absent day in the Tier 1 log
  assert.equal(o1.absence, 3);         // + 2 days typed as planned leave
  assert.ok(o1.items.some((x) => x.reg === "t1ac") && o1.items.some((x) => x.reg === "dev"));
  // an item spread over two months only counts its September share
  const apqr = o1.items.find((x) => x.reg === "apqr");
  assert.ok(apqr.share > 0 && apqr.share < 1);
  E.linkTier1(() => null);
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

// Site data is not in the repository (see js/real-data.js): these tests run
// against the generated file of a published board and are skipped here.
const SITE = await import("../js/real-data.js");
const site = SITE.REAL_T1 ? test : test.skip;

site("imported site data: people, shop floor, release, APQR", async () => {
  const { REAL_T1, REAL_T2, REAL_PEOPLE } = SITE;
  assert.equal(REAL_PEOPLE.length, 11);
  assert.equal(REAL_T1.roster.length, 3);
  // every officer named in the shop-floor data is on the roster (spellings and initials resolved)
  const roster = new Set(REAL_T1.roster.map((o) => o.name));
  assert.ok(REAL_T1.dl.every((r) => roster.has(r.officer)) && REAL_T1.br.every((r) => roster.has(r.officer)));
  assert.ok(REAL_T1.dl.every((r) => r.date <= "2026-10-30"), "no future-dated activity");
  assert.equal(REAL_T2.load.length, 11);
  assert.ok(REAL_T2.dev.every((d) => d.id.startsWith("QE-KO-")));
  assert.equal(REAL_T2.dev.length, 29);
  assert.equal(REAL_T2.cc.length, 191);
  assert.ok(REAL_T2.capa.length >= 122);
  // no employee code or hiring date anywhere in the data
  assert.ok(!/"(code|hired)"/.test(JSON.stringify([REAL_T1, REAL_T2, REAL_PEOPLE])));
  // every action points at a record that exists
  const refs = new Set([...REAL_T2.dev, ...REAL_T2.capa, ...REAL_T2.cc].map((r) => r.id));
  assert.ok(REAL_T2.act.length > 1000 && REAL_T2.act.filter((a) => a.parent && !refs.has(a.parent)).length === 0);
  assert.equal(REAL_T2.rel.filter((r) => r.status === "Released").length, 25);
  assert.equal(REAL_T2.apqr.length, 163);
  // planner tasks: the Scigeniq tasks of the oncology QA staff, none flagged
  E.linkTier1(() => REAL_T1);
  const comp = E.t2Computed({ ...REAL_T2, activities: E.DEFAULT_ACTIVITIES });
  assert.equal(comp.tasks.filter((c) => c.check !== "OK").length, 0);
  E.linkTier1(() => null);
});

site("KPIs without source data read as no data, not as on target", async () => {
  const { REAL_T1, REAL_T2 } = SITE;
  const k2 = E.t2Kpis({ ...REAL_T2, activities: E.DEFAULT_ACTIVITIES }).kpis;
  assert.equal(typeof k2[2].actual, "number"); // change control: 191 records from Scigeniq
  assert.equal(k2[5].rag, "N");      // documentation register empty
  const k1 = E.t1Kpis(E.t1Context(REAL_T1, REAL_T1.setup.selDate)).kpis;
  for (const i of [0, 1, 2, 3, 5, 6, 7, 9, 15]) assert.equal(k1[i].rag, "N", k1[i].name);
  assert.equal(k1[4].rag, "G");      // line clearance right first time is tracked
});

test("a batch record marked Completed without a date is closed, and flagged", () => {
  const r = E.t1Review({ id: "B1", recv: "2026-10-01", officer: "X", status: "Completed", errors: 0 }, { brTarget: 2 }, "2026-10-20");
  assert.equal(r.live, "Completed");
  assert.equal(r.open, false);
  assert.equal(r.check, "Completion date missing");
});
