// Tests of the operational QA domains (training, calibration, validation, batches, WIP,
// 5S, QA-activity register, QMS metrics) on a small synthetic workspace (no confidential data).
import { test } from "node:test";
import assert from "node:assert/strict";
import SCHEMA from "../oncology/js/schema.js";
import { EXT_COLS } from "../oncology/js/schema-ext.js";
import { buildModel, toDay } from "../oncology/js/model.js";
import { buildDomains, metricValue, metricStatus, quarters, yearPeriod, isoWeek, assetKey, refsIn } from "../oncology/js/domain.js";
import { METRICS, QA_ACTIVITIES, FIVES_ITEMS } from "../oncology/js/catalogs.js";

const COLS = { ...SCHEMA.cols, ...EXT_COLS };
const table = (key, objs) => ({ cols: COLS[key], rows: objs.map((o) => COLS[key].map((c) => o[c] ?? null)) });
const empty = Object.fromEntries(Object.keys(COLS).map((k) => [k, table(k, [])]));
const scig = (o) => ({ "Created By": "QA", Folders: "-----", Zone: "-----", "Parent action": "-----", ...o });

const wb = {
  ...empty,
  meta: { asof: "2026-10-20", settings: {} },
  tr: SCHEMA.tr,
  mapGrid: [],
  crit: table("crit", [{ Level: "High", Weight: 3 }]),
  prio: table("prio", [{ Factor: "Major", Weight: 3 }, { Factor: "Minor", Weight: 1 }]),
  prod: table("prod", [{ "Search key": "ALPHA", Product: "ALPHA", API: "Alphatinib", Status: "Marketed" }, { "Search key": "BETA", Product: "BETA", API: "Betazole", Status: "Pipeline" }]),
  rooms: table("rooms", [{ Code: "R-1", Name: "Compression", Grade: "D", Criticality: "High" }]),
  equip: table("equip", [{ "Asset no": "EQ9100-Onc/01", Register: "AR1", "Room code": "R-1" }]),
  sop: table("sop", [{ Code: "SOP-1", Title: "Gowning", "Effective date": "2026-02-01", "Next review": "2028-02-01" }]),
  qe: table("qe", [
    scig({ "Creation Date": "10/02/2026 09:00 am", "Reference Id": "QE-KO-1", Type: "Quality Event", Title: "ALPHA granulation", Status: "Completed", "Closing date": "20/02/2026 09:00 am", "End Date": "28/02/2026 11:59 pm", "Final Event Classification": "Major", "Root Cause": "Equipment related" }),
    scig({ "Creation Date": "15/03/2026 09:00 am", "Reference Id": "QE-KO-2", Type: "Quality Event", Title: "ALPHA compression", Status: "Completed", "Closing date": "20/05/2026 09:00 am", "End Date": "30/04/2026 11:59 pm", "Final Event Classification": "Minor", "Root Cause": "Equipment related, Human Error" }),
  ]),
  find: table("find", [
    scig({ "Creation Date": "01/09/2026 09:00 am", "Reference Id": "FIND-KO-1", Type: "Audit Findings", Title: "Logbook gaps", Status: "Open", "End Date": "01/10/2026 11:59 pm", Classification: "Major", "Parent ID Reference": "AUDT-KO-3", "Audited Areas": "Warehouse" }),
  ]),
  actions: table("actions", [
    { "Creation Date": "01/09/2026 09:00 am", Type: "Actions", Title: "Retrain", "Reference Id": "ACTION-KO-1", Status: "Open", "End Date": "01/10/2026 11:59 pm", "Parent ID Reference": "FIND-KO-1", Department: "Warehouse" },
    { "Creation Date": "01/01/2026 09:00 am", Type: "Actions", Title: "Update SOP", "Reference Id": "ACTION-KO-2", Status: "Completed", "End Date": "01/02/2026 11:59 pm", "Closing date": "15/01/2026 09:00 am", "Parent ID Reference": "CC-KO-9", "Parent Type": "Change Control" },
  ]),
  training: table("training", [
    { "Training ID": "TR-1", Program: "GMP refresher", Type: "GMP", "Planned month": "2026-03", "Completion date": "2026-03-20", "Planned attendees": 10, "Trained attendees": 9 },
    { "Training ID": "TR-2", Program: "Gowning SOP", Type: "SOP", "Planned month": "2026-05" },
    { "Training ID": "TR-3", Program: "Data integrity", Type: "Quality system", "Planned month": "2026-10" },
    { "Training ID": "TR-4", Program: "HSE induction", Type: "HSE", "Planned month": "2026-12" },
    { "Training ID": "TR-5", Program: "Spill kit", Type: "HSE", "Planned month": "2026-06", Status: "Cancelled" },
  ]),
  calplan: table("calplan", [
    { Item: "EQ9100/Onc/01", Description: "Tablet press", Location: "R-1", "Planned start": "2026-03-01", "Planned end": "2026-03-05", "Frequency (months)": 12, Interval: "± 01 Month", "Calibrated on": "2026-03-10" },
    { Item: "MD0001/Onc", Description: "Force sensor", Parent: "EQ9100/Onc/01" },
    { Item: "EQ9200/Onc", Description: "Balance", "Planned start": "2026-10-25", "Frequency (months)": 6, Interval: "± 15 days" },
    { Item: "EQ9300/Onc", Description: "Oven", "Planned start": "2026-12-01", "Frequency (months)": 12 },
  ]),
  validation: table("validation", [
    { "Task ID": "VAL-E-01", Task: "Requalification press", Scope: "Equipment", "Frequency (years)": 1, "Planned start": "2026-02", "Planned finish": "2026-02", "Completion date": "2026-02-20" },
    { "Task ID": "VAL-E-02", Task: "Mapping freezer", Scope: "Equipment", "Frequency (years)": 1, "Planned start": "2026-04", "Planned finish": "2026-04" },
  ]),
  batches: table("batches", [
    { Product: "ALPHA 10 mg", "Batch no": "B1", "Batch type": "Validation", "Mfg date": "2026-02-05", "Manufacturing yield": 0.97, "End compression": "2026-02-08", "BMR handover": "2026-02-10", "End packaging": "2026-02-15", "BPR handover": "2026-02-18", "Physical release": "2026-02-25" },
    { Product: "ALPHA 10 mg", "Batch no": "B2", "Batch type": "Validation", "Mfg date": "2026-02-20", Deviation: "QE-KO-1" },
    { Product: "Alphatinb 10 mg", "Batch no": "B3", "Batch type": "Routine", "Mfg date": "2026-03-01" },
    { Product: "TOTAL", "Batch no": "3", "Mfg date": "2026-03-01" },
  ]),
  wip: table("wip", [
    { Product: "ALPHA 10 mg", Batch: "B2", "Next step": "BLISTER", Status: "Waiting", Quantity: 12.5, "Mfg date": "2026-02-20", "Time frame": "2026-09-30", "Deviation / CAPA": "QE-KO-1" },
    { Product: "ALPHA 10 mg", Batch: "B3", "Next step": "BLISTER", Status: "Rejection in progress", Quantity: 3, "Time frame": "2026-12-31" },
  ]),
  rejections: table("rejections", [{ "Report no": "RJ-26-01PF", Product: "ALPHA", Batch: "B2", Status: "In progress", Quantity: 1.5 }]),
  fives: table("fives", [
    { "Audit ID": "5S-2026-001", Date: "2026-10-14", Area: "R-1 · Compression", Scores: FIVES_ITEMS.map((_, i) => (i === 0 ? 0 : i === 19 ? "-" : 2)).join(","), Actions: "Remove forms", Due: "2026-10-01" },
  ]),
  qaact: table("qaact", [{ "Activity ID": "QA-35", "Last performed": "2026-10-01" }, { "Activity ID": "QA-90", Activity: "Site-specific walk", "Frequency (months)": 3 }]),
  metrics: table("metrics", [{ Metric: "em_alert", Period: "2026-Q1", Value: 2 }, { Metric: "rft", Period: "2026-Q2", Value: 95 }]),
};

const today = toDay("2026-10-21");
const m = buildDomains(buildModel(wb, { today }), wb, { meeting: { date: "2026-07-01" } });
const X = m.x;
const Q = quarters(2026);

test("helpers: asset keys, record references, ISO weeks", () => {
  assert.equal(assetKey("EQ1234/Onc/01"), "EQ1234/01");
  assert.equal(assetKey("EQ1234-Onc/01"), "EQ1234/01");
  assert.equal(assetKey("MD0001/Onc"), "MD0001");
  assert.deepEqual(refsIn("see QE-KO-12 and capa-ko-3, QE-KO-12"), ["QE-KO-12", "CAPA-KO-3"]);
  assert.equal(isoWeek(Date.UTC(2026, 0, 1)), "2026-W01");
  assert.equal(isoWeek(Date.UTC(2026, 9, 21)), "2026-W43");
  assert.equal(isoWeek(Date.UTC(2027, 0, 1)), "2026-W53");
});

test("audit findings join the quality records and actions link to their parents", () => {
  const f = m.recordByRef.get("FIND-KO-1");
  assert.equal(f.type, "Audit Finding");
  assert.equal(f.classification, "Major");
  assert.equal(f.parentRef, "AUDT-KO-3");
  assert.equal(f.overdue, true);
  assert.equal(f.actions.length, 1);
  const a = m.actions.find((x) => x.ref === "ACTION-KO-2");
  assert.equal(a.closedLate, 0);
  assert.equal(a.parentType, "Change Control");
});

test("training plan status, execution and attendance", () => {
  const s = Object.fromEntries(X.training.map((x) => [x["Training ID"], x.status]));
  assert.deepEqual(s, { "TR-1": "Completed", "TR-2": "Overdue", "TR-3": "Due this month", "TR-4": "Planned", "TR-5": "Cancelled" });
  assert.equal(X.training[0].onTime, true);
  assert.equal(X.training[0].attendance, 0.9);
  // GMP + HSE due by end of Q1: TR-1 done → 100 %; plan execution by end of Q2: 1 of 2 (TR-5 cancelled)
  assert.equal(metricValue(m, "gmp_training", Q[0]).value, 1);
  assert.equal(metricValue(m, "training_plan", Q[1]).value, 0.5);
});

test("calibration program: children inherit the parent window, tolerance drives status, plan feeds the register", () => {
  const [press, sensor, balance, oven] = X.calplan;
  assert.equal(press.status, "Done");
  assert.equal(press.onTime, true); // 9 days after start, within ± 1 month
  assert.equal(sensor.start, press.start);
  assert.equal(sensor.status, "Overdue"); // the child has no completion of its own
  assert.equal(balance.status, "Due now"); // within ± 15 days of 25/10
  assert.equal(oven.status, "Planned");
  const eq = m.equip.find((e) => e["Asset no"] === "EQ9100-Onc/01");
  assert.equal(eq.last, toDay("2026-03-10"));
  assert.equal(eq.next, toDay("2027-03-10"));
  assert.equal(eq.calStatus, "In date");
  assert.equal(metricValue(m, "cal_compliance", Q[0]).value, 0.5); // press done, sensor not
});

test("validation schedule status and VMP execution", () => {
  assert.deepEqual(X.validation.map((v) => v.status), ["Completed", "Overdue"]);
  assert.equal(X.validation[0].nextDue, toDay("2027-02-20"));
  assert.equal(metricValue(m, "vmp", Q[1]).value, 0.5);
});

test("batches: product matching tolerates typos, totals are skipped, yields and cycle times", () => {
  assert.equal(X.batches.length, 3);
  assert.deepEqual(X.batches.map((b) => b.productKey), ["ALPHA", "ALPHA", "ALPHA"]);
  const [b1, b2] = X.batches;
  assert.equal(b1.stage, "Released");
  assert.deepEqual(b1.ct, { production: 2, packaging: 3, qa: 7, total: null });
  assert.equal(b1.rft, true);
  assert.equal(b2.rft, false); // deviation recorded
  assert.equal(b2.rejected, true); // rejection report on the batch
  const alpha = X.lifecycle.find((p) => p.name === "ALPHA");
  assert.equal(alpha.phase, "Commercial");
  assert.equal(alpha.pvBatches, 2);
  assert.equal(X.lifecycle.find((p) => p.name === "BETA").phase, "Pipeline");
});

test("WIP hold times and categories", () => {
  const [w1, w2] = X.wip;
  assert.equal(w1.exceeded, true);
  assert.deepEqual(w1.refs, ["QE-KO-1"]);
  assert.equal(w2.cat, "Under rejection");
  assert.equal(X.rejections[0].kind, "Finished product");
  assert.equal(metricValue(m, "wip_hold", Q[3]).value, 1);
});

test("5S audit scoring ignores N/A items and flags overdue actions", () => {
  const a = X.fives[0];
  assert.equal(a.week, "2026-W42");
  assert.equal(a.total, 36 / 38); // 18 items at 2, one at 0, one N/A
  assert.equal(a.per.sort, 6 / 8);
  assert.equal(a.per.sustain, 1);
  assert.equal(a.actionOverdue, true);
  assert.equal(metricValue(m, "fives", Q[3]).value, 36 / 38);
});

test("QA activity register: recorded and derived last dates, custom activities", () => {
  assert.equal(X.qaact.length, QA_ACTIVITIES.length + 1);
  const byId = Object.fromEntries(X.qaact.map((a) => [a.id, a]));
  assert.equal(byId["QA-35"].lastSource, "recorded");
  assert.equal(byId["QA-35"].status, "Due ≤30 d"); // monthly, last 01/10
  assert.equal(byId["QA-01"].last, toDay("2026-07-01")); // management review meeting
  assert.equal(byId["QA-01"].status, "In date");
  assert.equal(byId["QA-23"].last, toDay("2026-03-10")); // last calibration recorded
  assert.equal(byId["QA-23"].status, "Overdue");
  assert.equal(byId["QA-38"].last, toDay("2026-02-01")); // latest SOP effective date
  assert.equal(byId["QA-06"].status, "Continuous");
  assert.equal(byId["QA-90"].status, "Not recorded");
});

test("QMS metrics: automatic rates, manual entries, percent input and RAG status", () => {
  // Q1: 2 deviations for 3 batches; one major
  assert.equal(metricValue(m, "dev_total", Q[0]).value, 2 / 3);
  assert.equal(metricValue(m, "dev_major", Q[0]).value, 1 / 3);
  // QE-KO-2 repeats the "Equipment related" root cause of QE-KO-1 within 12 months
  assert.equal(metricValue(m, "dev_repeat", Q[0]).value, 0.5);
  // closed on time: QE-KO-1 (Q1) on time, QE-KO-2 (Q2) late
  assert.equal(metricValue(m, "dev_ontime", Q[0]).value, 1);
  assert.equal(metricValue(m, "dev_ontime", Q[1]).value, 0);
  assert.equal(metricValue(m, "batch_accept", Q[0]).value, 2 / 3);
  assert.equal(metricValue(m, "ct_qa", Q[0]).value, 7);
  assert.equal(metricValue(m, "cc_actions_ontime", Q[0]).value, 1);
  const em = metricValue(m, "em_alert", Q[0]);
  assert.equal(em.src, "manual");
  assert.equal(em.value, 2);
  assert.equal(metricValue(m, "em_alert", Q[1]).value, null);
  assert.equal(metricValue(m, "rft", Q[1]).value, 0.95); // "95" entered for a percent metric
  const def = (id) => METRICS.find((d) => d.id === id);
  assert.equal(metricStatus(def("dev_total"), 0.2), 3);
  assert.equal(metricStatus(def("dev_total"), 0.3), 2);
  assert.equal(metricStatus(def("dev_total"), 0.5), 1);
  assert.equal(metricStatus(def("rft"), 0.99), 3);
  assert.equal(metricStatus(def("rft"), 0.9), 2);
  assert.equal(metricStatus(def("em_alert"), 1), 1);
  assert.equal(metricStatus(def("em_alert"), null), 0);
  assert.equal(yearPeriod(2026).label, "2026");
});
