// Checks against the real master workbook. Its data file is confidential and git-ignored, so these
// tests only run where it exists (python3 tools/extract_workbook.py <workbook.xlsx> oncology/js/workbook-data.js).
import { test as nodeTest } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import {
  buildModel, reconciliation, kpis, scorecard, cChart, pChart, backlog, applyFilters,
  toDay, addMonths, bandFor, clean, rag, calCompliance,
} from "../oncology/js/model.js";

const file = new URL("../oncology/js/workbook-data.js", import.meta.url);
const present = existsSync(file);
const test = (name, fn) => nodeTest(name, { skip: present ? false : "workbook data not present" }, fn);
const wb = present ? (await import(file)).default : null;
const today = toDay("2026-10-21");
const m = present ? buildModel(wb, { today }) : null;

test("dates parse from Scigeniq and ISO formats", () => {
  assert.equal(toDay("20/10/2026 10:22 am"), Date.UTC(2026, 9, 20));
  assert.equal(toDay("2026-10-20T23:19"), Date.UTC(2026, 9, 20));
  assert.equal(toDay("-----"), null);
  assert.equal(clean("-----"), "");
  assert.equal(addMonths(toDay("2026-01-31"), 1), Date.UTC(2026, 1, 28));
});

test("RPN bands follow LOOKUP on the band minimum", () => {
  assert.equal(bandFor(m.bands, 15), "Low");
  assert.equal(bandFor(m.bands, 16), "Medium");
  assert.equal(bandFor(m.bands, 64), "High");
  assert.equal(bandFor(m.bands, null), "");
});

test("every reconciliation check of the Data Quality sheet passes", () => {
  const failed = reconciliation(m).filter((c) => !c.ok);
  assert.deepEqual(failed, []);
  assert.equal(m.records.length, 350);
});

test("quality records keep the workbook's type, status and classification rules", () => {
  const qe = m.records.filter((r) => r.type === "Deviation");
  assert.equal(qe.length, 29);
  assert.ok(m.records.every((r) => ["Open", "Overdue", "Completed", "Canceled"].includes(r.status)));
  const r = m.recordByRef.get("CC-KO-188");
  assert.equal(r.type, "Change Control");
  assert.equal(r.department, "Manufacturing"); // Location "Production" mapped through tDeptMap
  assert.equal(r.scope, "Equipment");
  assert.equal(r.roomCode, ""); // "FFO-34" is only in Current State, which the workbook does not search
  const linked = m.recordByRef.get("CC-KO-14"); // title names FFO-01 and FFO-23: the first room in table order wins
  assert.equal(linked.roomCode, "FFO-01");
  assert.equal(linked.roomLink, "Suggested");
});

test("open record priority = class weight × room weight + lateness + due-soon + deviation bonus", () => {
  for (const r of m.records.filter((x) => x.isOpen)) {
    assert.ok(r.priority >= 1, `${r.ref} priority ${r.priority}`);
    assert.ok(r.priority <= 5 * 3 + 12 + 2 + 1);
  }
  assert.ok(m.records.filter((x) => !x.isOpen).every((r) => r.priority === null));
});

test("FMEA RPN = S × O × D and mismatches against the reported RPN are flagged", () => {
  for (const f of m.fmea) if (f.S && f.O && f.D) assert.equal(f.rpn, f.S * f.O * f.D);
  const mism = m.fmea.filter((f) => f.rpnCheck.length);
  assert.equal(mism.length, 4); // "4 initial and 1 residual line" per the workbook notes (one line has both)
});

test("room roll-ups count equipment, records and the max RPN", () => {
  const r = m.roomByCode.get("FFO-01");
  assert.equal(r.equipment, m.equip.filter((e) => e["Room code"] === "FFO-01").length);
  assert.equal(r.maxRpn, 100);
  assert.equal(r.riskScore, 300); // High criticality weight 3
});

test("KPIs and filters", () => {
  const k = kpis(m.records, today);
  assert.equal(k.total, 350);
  assert.equal(k.completed + k.canceled + k.open + m.records.filter((r) => r.status === "Overdue").length, 350);
  assert.equal(applyFilters(m.records, { type: "CAPA" }).length, 133);
  assert.equal(applyFilters(m.records, { from: "2026-10", to: "2026-10" }).every((r) => r.month === "2026-10"), true);
  assert.equal(calCompliance(m.equip), 0); // no calibration dates supplied
  assert.equal(rag(0.9, { target: 0.85, warning: 0.75 }, true), 3);
  assert.equal(rag(0.1, { target: 0.05, warning: 0.1 }, false), 2);
  const sc = scorecard(m);
  assert.equal(sc.rows.length, 16);
});

test("SPC charts produce 24 months with limits and signals", () => {
  const c = cChart(m.records, today);
  assert.equal(c.points.length, 24);
  assert.ok(c.ucl > c.cl && c.cl >= c.lcl);
  assert.ok(c.points.some((p) => p.signals.includes("R1")));
  const p = pChart(m.records, today);
  assert.ok(p.pbar > 0 && p.pbar < 1);
  const b = backlog(m.records, today);
  assert.equal(b.at(-1).open, m.records.filter((r) => r.isOpen && r.opened <= today).length);
});
