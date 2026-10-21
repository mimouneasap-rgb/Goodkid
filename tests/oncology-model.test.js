// Model tests on a small synthetic workbook (no confidential data).
import { test } from "node:test";
import assert from "node:assert/strict";
import SCHEMA from "../oncology/js/schema.js";
import {
  buildModel, reconciliation, kpis, scorecard, cChart, pChart, backlog, applyFilters,
  toDay, addMonths, bandFor, clean, rag, calCompliance,
} from "../oncology/js/model.js";

/** Build a {cols, rows} table from objects, using the workbook's column layout. */
const table = (key, objs) => ({ cols: SCHEMA.cols[key], rows: objs.map((o) => SCHEMA.cols[key].map((c) => o[c] ?? null)) });
const scig = (o) => ({ "Created By": "QA", Folders: "-----", Zone: "-----", "Parent action": "-----", ...o });

const wb = {
  meta: { asof: "2026-10-20", settings: {}, reconExpected: { "Scigeniq overview: CAPA “Overdue” (update yellow cell after each export)": 1 } },
  tr: SCHEMA.tr,
  mapGrid: [["R-1", "R-1", "R-2"]],
  bands: table("bands", [{ Level: "Low", Min: 1, Max: 15 }, { Level: "Medium", Min: 16, Max: 63 }, { Level: "High", Min: 64, Max: 125 }]),
  targets: table("targets", [{ KPI: "Closure rate ≥", Key: "closure", Target: 0.85, Warning: 0.75 }, { KPI: "Overdue ≤", Key: "overdue", Target: 0.05, Warning: 0.1 }]),
  crit: table("crit", [{ Level: "High", Weight: 3 }, { Level: "Medium", Weight: 2 }, { Level: "Low", Weight: 1 }]),
  deptMap: table("deptMap", [{ Alias: "Production", Department: "Manufacturing" }]),
  prio: table("prio", [{ Factor: "Major", Weight: 3 }, { Factor: "Minor", Weight: 1 }]),
  prod: table("prod", [{ "Search key": "ALPHA", Product: "ALPHA" }, { "Search key": "alphanib", Product: "ALPHA" }]),
  rooms: table("rooms", [{ Code: "R-1", Name: "Dispensing", Criticality: "High", Grade: "D", "OEB level": 5, "Pressure set-point (Pa)": 30 }, { Code: "R-2", Name: "Corridor", Criticality: "Low" }]),
  adj: table("adj", [{ Room: "R-1", "Adjacent room": "R-2", Gauge: "G1" }]),
  equip: table("equip", [
    { "Asset no": "EQ1-X", Register: "AR1", "Room code": "R-1", "Qualification status": "Qualified", "Calibration frequency (months)": 12, "Last calibration": "2025-09-01" },
    { "Asset no": "EQ2-X", Register: "AR1", "Room code": "R-1", "Calibration frequency (months)": 6 },
    { "Asset no": "EQ3-X", Register: "AR1" },
  ]),
  fmea: table("fmea", [
    { "Risk ID": "F-1", "Assessment ref": "A", "Room code": "R-1", S: 5, O: 4, D: 4, "Reported RPN": 60, "Residual S": 5, "Residual O": 1, "Residual D": 2 },
    { "Risk ID": "F-2", "Assessment ref": "A", S: 2, O: 2, D: 2, Due: "2026-01-01" },
  ]),
  sop: table("sop", [{ Code: "SOP-1", Title: "Gowning", "Linked rooms": "R-1", "Next review": "2026-11-01" }]),
  forms: table("forms", []), ccp: table("ccp", []), impr: table("impr", []), appr: table("appr", []), links: table("links", []),
  cc: table("cc", [
    scig({ "Creation Date": "01/03/2026 09:00 am", "Reference Id": "CC-1", Type: "Change Control", Title: "New balance in R-1", Status: "Open", "End Date": "01/04/2026 11:59 pm", Location: "Production", "CC Classification": "Major", "Change Scope": "Equipment" }),
    scig({ "Creation Date": "05/09/2026 09:00 am", "Reference Id": "CC-2", Type: "Change Control", Title: "ALPHA label update", Status: "Completed", "Closing date": "20/09/2026 10:00 am", "End Date": "30/09/2026 11:59 pm", Folders: "Validation and Qualification", "Change Scope": "Documents" }),
  ]),
  capa: table("capa", [
    scig({ "Creation Date": "10/01/2026 09:00 am", "Reference Id": "CAPA-1", Type: "CAPA", Title: "Fix EQ2 seal", Status: "Overdue", "End Date": "01/02/2026 11:59 pm", "Parent ID Reference": "QE-1", "Effectiveness Check required?": "Yes", "Responsible Department": "QC" }),
  ]),
  qe: table("qe", [
    scig({ "Creation Date": "02/01/2026 09:00 am", "Reference Id": "QE-1", Type: "Quality Event", Title: "alphanib OOS", Status: "Completed", "Closing date": "15/03/2026 10:00 am", "End Date": "01/03/2026 11:59 pm", "Initial QE Class": "Major", "Final Event Classification": "Minor", "CAPA Required_?": "Yes", "Root Cause": "Human Error" }),
  ]),
};

const today = toDay("2026-10-21");
const m = buildModel(wb, { today });
const rec = (ref) => m.recordByRef.get(ref);

test("dates, EDATE and Scigeniq blanks", () => {
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

test("quality records are built from the three Scigeniq exports", () => {
  assert.equal(m.records.length, 4);
  assert.equal(rec("QE-1").type, "Deviation");
  assert.equal(rec("QE-1").classification, "Minor"); // final class wins over initial
  assert.deepEqual(rec("QE-1").classFlags, ["F2"]); // initial ≠ final; CAPA required and linked
  assert.equal(rec("QE-1").linkedCapas, 1);
  assert.equal(rec("CC-1").department, "Manufacturing"); // Location alias mapped
  assert.equal(rec("CC-1").roomCode, "R-1");
  assert.equal(rec("CC-1").roomLink, "Suggested");
  assert.equal(rec("CAPA-1").assetNo, "EQ2-X"); // search key = asset no before "-"
  assert.equal(rec("CC-2").productKey, "ALPHA");
  assert.equal(rec("QE-1").productKey, "ALPHA"); // matched on the active substance
  assert.equal(rec("CC-1").vqGap, true);
  assert.equal(rec("CC-2").vqGap, false);
});

test("overdue, days late and priority score", () => {
  const cc1 = rec("CC-1");
  assert.equal(cc1.daysLate, 203);
  assert.equal(cc1.overdue, true);
  // Major (3) × High room (3) + min(12, 203/30) = 9 + 6.77 → 15.8
  assert.equal(cc1.priority, 15.8);
  assert.equal(rec("CAPA-1").overdue, true);
  assert.equal(rec("CC-2").priority, null);
  assert.equal(rec("CC-2").daysToClose, 15);
  assert.equal(rec("CC-2").closedLate, 0);
  assert.equal(rec("QE-1").closedLate, 1);
});

test("record links confirmed in the app override suggestions", () => {
  const linked = buildModel(wb, { today, links: [{ "Ref ID": "CC-1", "Room code": "R-2" }] });
  assert.equal(linked.recordByRef.get("CC-1").roomCode, "R-2");
  assert.equal(linked.recordByRef.get("CC-1").roomLink, "Confirmed");
});

test("equipment calibration status and compliance", () => {
  const [a, b, c] = m.equip;
  assert.equal(a.calStatus, "Overdue"); // 2025-09-01 + 12 months < today
  assert.equal(b.calStatus, "Missing date");
  assert.equal(c.calStatus, "No calibration data");
  assert.equal(calCompliance(m.equip), 0);
});

test("FMEA RPN, residual band, mismatch flag and overdue action", () => {
  const [f1, f2] = m.fmea;
  assert.equal(f1.rpn, 80);
  assert.equal(f1.level, "High");
  assert.equal(f1.rrpn, 10);
  assert.equal(f1.rlevel, "Low");
  assert.deepEqual(f1.rpnCheck, ["Initial reported 60 ≠ 80"]);
  assert.equal(f2.actionOverdue, true);
});

test("room roll-ups and pressure cascade", () => {
  const r1 = m.roomByCode.get("R-1");
  assert.equal(r1.equipment, 2);
  assert.equal(r1.qualityRecords, 1);
  assert.equal(r1.maxRpn, 80);
  assert.equal(r1.riskScore, 240);
  assert.equal(r1.overdueCals, 1);
  assert.deepEqual(m.roomByCode.get("R-2").dataGaps, ["Grade", "OEB", "Pressure"]);
  assert.equal(m.adj[0].roomSp, 30);
});

test("KPIs, filters, RAG and scorecard", () => {
  const k = kpis(m.records, today);
  assert.equal(k.total, 4);
  assert.equal(k.completed, 2);
  assert.equal(k.overdue, 2);
  assert.equal(k.closure, 0.5);
  assert.equal(applyFilters(m.records, { type: "CAPA" }).length, 1);
  assert.equal(applyFilters(m.records, { from: "2026-09", to: "2026-09" }).map((r) => r.ref).join(), "CC-2");
  assert.equal(rag(0.9, { target: 0.85, warning: 0.75 }, true), 3);
  assert.equal(rag(0.1, { target: 0.05, warning: 0.1 }, false), 2);
  assert.equal(scorecard(m).rows.length, 16);
});

test("reconciliation checks", () => {
  const checks = reconciliation(m);
  assert.ok(checks.every((c) => c.ok), JSON.stringify(checks.filter((c) => !c.ok)));
  assert.ok(checks.some((c) => c.label.includes("CAPA “Overdue”")));
});

test("SPC charts span 24 months", () => {
  const c = cChart(m.records, today);
  assert.equal(c.points.length, 24);
  assert.ok(c.ucl >= c.cl && c.cl >= c.lcl);
  const p = pChart(m.records, today);
  assert.equal(p.n, 2);
  assert.equal(p.x, 1);
  assert.equal(backlog(m.records, today).at(-1).open, 2);
});

test("in-app edits change, delete and add rows on top of the import", async () => {
  const { applyEdits } = await import("../oncology/js/store.js");
  const eqCols = SCHEMA.cols.equip;
  const lastCal = eqCols.indexOf("Last calibration");
  const changed = [...wb.equip.rows[1]];
  changed[lastCal] = "2026-06-01"; // EQ2-X calibrated; 6-month frequency → due 2026-12-01
  const added = eqCols.map((c) => ({ "Asset no": "EQ9-X", "Room code": "R-2" })[c] ?? null);
  const edits = new Map([
    ["equip~i1", { table: "equip", key: "i1", row: changed, at: "2026-10-21T10:00:00Z", by: "u1" }],
    ["equip~i2", { table: "equip", key: "i2", row: null, at: "2026-10-21T10:01:00Z", by: "u1" }],
    ["equip~n-1", { table: "equip", key: "n-1", row: added, at: "2026-10-21T10:02:00Z", by: "u2" }],
  ]);
  const data = applyEdits(wb, edits);
  assert.deepEqual(data.equip.keys, ["i0", "i1", "n-1"]);
  assert.equal(data.cc.rows.length, 2); // untouched tables pass through
  const em = buildModel(data, { today });
  const eq2 = em.equip.find((e) => e["Asset no"] === "EQ2-X");
  assert.equal(eq2.calStatus, "Due 31–60 d"); // 41 days after 2026-10-21
  assert.equal(eq2.__key, "i1");
  assert.equal(eq2.__edit.by, "u1");
  assert.ok(!em.equip.some((e) => e["Asset no"] === "EQ3-X"));
  assert.equal(em.roomByCode.get("R-2").equipment, 1);
  // a record keeps its source table and key for editing
  assert.equal(em.recordByRef.get("CC-1").srcTable, "cc");
  assert.equal(em.recordByRef.get("CC-1").srcKey, "i0");
});

test("edits made against an older import of a table are ignored", async () => {
  const { applyEdits } = await import("../oncology/js/store.js");
  const base = { ...wb, cc: { ...wb.cc, importId: "new" }, capa: { ...wb.capa, importId: "keep" } };
  const status = SCHEMA.cols.cc.indexOf("Status");
  const ccRow = [...wb.cc.rows[0]]; ccRow[status] = "Canceled";
  const capaRow = [...wb.capa.rows[0]]; capaRow[SCHEMA.cols.capa.indexOf("Status")] = "Completed";
  const edits = new Map([
    ["cc~i0", { table: "cc", key: "i0", row: ccRow, base: "old" }],          // stale: cc was re-imported
    ["capa~i0", { table: "capa", key: "i0", row: capaRow, base: "keep" }],   // still valid
  ]);
  const em = buildModel(applyEdits(base, edits), { today });
  assert.equal(em.recordByRef.get("CC-1").status, "Open");
  assert.equal(em.recordByRef.get("CAPA-1").status, "Completed");
});
