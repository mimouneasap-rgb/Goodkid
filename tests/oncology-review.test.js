// Tests of the quality management review: the half-year calendar and its due dates, report numbers, where each review
// stands (meeting, minutes and report within a week), the participants carried over, data collection by department, the
// figures of a parameter (history, per-batch rates, right first time, hand-entered figures) and escalations — on a small
// synthetic workspace (no confidential data).
import { test } from "node:test";
import assert from "node:assert/strict";
import SCHEMA from "../oncology/js/schema.js";
import { EXT_COLS } from "../oncology/js/schema-ext.js";
import { buildModel } from "../oncology/js/model.js";
import { buildDomains } from "../oncology/js/domain.js";
import { halfPeriod, halfOf, periodOf, dueByOf, historyOf, nextReportNo, buildQmr, newReview, collectionByDept, manualHistory, QMR_PARAMS, QMR_ROLES, figuresOf } from "../oncology/js/qmrkit.js";
import { paramData, escalations } from "../oncology/js/qmrdata.js";

const COLS = { ...SCHEMA.cols, ...EXT_COLS };
const table = (key, objs) => ({ cols: COLS[key], rows: objs.map((o) => COLS[key].map((c) => o[c] ?? null)) });
const empty = Object.fromEntries(Object.keys(COLS).map((k) => [k, table(k, [])]));
const scig = (o) => ({ "Created By": "QA", Folders: "-----", Zone: "-----", "Parent action": "-----", ...o });
const D = (s) => Date.parse(`${s}T00:00:00Z`);
const day = (s) => (s ? (/^\d{4}-\d{2}-\d{2}$/.test(String(s)) ? D(s) : Date.parse(s)) : null);
const NOW = D("2026-10-25");

test("half-years: labels, due dates (end of the 2nd month after), two years of history", () => {
  assert.deepEqual([halfPeriod(2026, 1).start, halfPeriod(2026, 1).end], [D("2026-01-01"), D("2026-07-01")]);
  assert.equal(halfOf(D("2026-07-01")).label, "2026-H2");
  assert.equal(new Date(dueByOf(halfPeriod(2026, 1))).toISOString().slice(0, 10), "2026-08-31");
  assert.equal(new Date(dueByOf(halfPeriod(2026, 2))).toISOString().slice(0, 10), "2027-02-28");
  assert.equal(new Date(dueByOf(halfPeriod(2027, 2))).toISOString().slice(0, 10), "2028-02-29");
  for (const s of ["2026-H1", "H1 2026", "S1 2026", "2026 S1"]) assert.equal(periodOf(s)?.label, "2026-H1", s);
  assert.equal(periodOf("", D("2025-07-01"), D("2025-12-31")).label, "2025-H2");
  assert.deepEqual(historyOf(halfPeriod(2026, 1)).map((p) => p.label), ["2024-H1", "2024-H2", "2025-H1", "2025-H2", "2026-H1"]);
});

test("report numbers: two-digit serial within the year, the site prefix kept", () => {
  assert.equal(nextReportNo([], 2026), "QMR-Onc-01-2026");
  assert.equal(nextReportNo(["QMR-XY-01-2025", "QMR-XY-02-2025"], 2026), "QMR-XY-01-2026");
  assert.equal(nextReportNo(["QMR-XY-01-2026"], 2026), "QMR-XY-02-2026");
});

const reviews = [
  { "Report no": "QMR-XY-02-2025", Period: "2025-H2", "Meeting date": "2026-02-20", "Minutes shared on": "2026-02-24", "Report to corporate on": "2026-03-05", Chair: "QA Demo Head" },
  { "Report no": "QMR-XY-01-2026", Period: "2026-H1", "Meeting date": "2026-09-10" },
];
const inputs = [
  { "Report no": "QMR-XY-02-2025", Parameter: "complaints", Status: "Reviewed", Figures: JSON.stringify({ complaintsValid: 3 }) },
  { "Report no": "QMR-XY-01-2026", Parameter: "deviations", Status: "Collected" },
  { "Report no": "QMR-XY-01-2026", Parameter: "complaints", Status: "Reviewed", Assessment: "Satisfactory", Figures: JSON.stringify({ complaints: 5, complaintsValid: 2, counterfeits: 0 }) },
];
const attendees = [
  { "Report no": "QMR-XY-02-2025", Role: "QA manager", Name: "QA Demo Manager", Attendance: "Present" },
  { "Report no": "QMR-XY-02-2025", Role: "QC manager", Name: "QC Demo Manager", Attendance: "Excused" },
  { "Report no": "QMR-XY-01-2026", Role: "QA manager", Name: "QA Demo Manager", Attendance: "Present" },
];
const actions = [
  { "Action ID": "QMRA-2026-1", "Report no": "QMR-XY-02-2025", Area: "Deviations", Action: "Trend root causes", Due: "2026-05-31", Status: "Done", "Closed on": "2026-06-15" },
  { "Action ID": "QMRA-2026-2", "Report no": "QMR-XY-02-2025", Area: "Recalls", Action: "Mock recall", Due: "2026-09-30", Status: "Open" },
  { "Action ID": "QMRA-2026-3", "Report no": "QMR-XY-01-2026", Area: "Meeting", Action: "Hire a QC analyst", Due: "2026-12-31", Status: "In progress" },
];

test("the register: where each review stands, its timelines, the calendar the procedure calls for", () => {
  const Q = buildQmr({ reviews, inputs, attendees, actions, regs: [{ Regulation: "Demo GMP decree", Status: "Assessing", Due: "2026-09-01" }], now: NOW, dayOf: day });
  const [r1, r0] = Q.reviews; // newest first
  assert.equal(r1.no, "QMR-XY-01-2026");
  assert.equal(r1.state, "Meeting held");
  assert.equal(r1.meetingOnTime, false); // held 10 Sep, due 31 Aug
  assert.deepEqual(r1.late, ["minutes", "report"]); // neither shared a week after the meeting
  assert.equal(r1.collected, 2);
  assert.equal(r0.state, "Closed");
  assert.equal(r0.minutesOnTime, true); // 4 days
  assert.equal(r0.reportOnTime, false); // 13 days
  assert.equal(r0.present, 1);
  // actions: done late, open overdue, open in time
  const [a1, a2, a3] = ["QMRA-2026-1", "QMRA-2026-2", "QMRA-2026-3"].map((id) => Q.actions.find((a) => a["Action ID"] === id));
  assert.equal(a1.onTime, false);
  assert.equal(a2.overdue, true);
  assert.equal(a3.overdue, false);
  assert.equal(Q.regs[0].overdue, true);
  // calendar: two years back, the 2nd half 2025 held late (due end of February), H1 2026 late too, H2 2026 in progress
  const cal = Object.fromEntries(Q.expected.map((e) => [e.period.label, e.status]));
  assert.deepEqual(cal, { "2024-H2": "Not recorded", "2025-H1": "Not recorded", "2025-H2": "Held on time", "2026-H1": "Held late", "2026-H2": "Period in progress" });
  assert.equal(Q.current.no, "QMR-XY-01-2026");
  assert.equal(Q.toPlan.period.label, "2026-H2");
  assert.equal(Q.lastMeeting, D("2026-09-10"));
  // without reviews, the half-year just ended comes first even past its due date
  assert.equal(buildQmr({ now: NOW, dayOf: day }).toPlan.period.label, "2026-H1");
  assert.equal(buildQmr({ now: D("2026-08-10"), dayOf: day }).expected.find((e) => e.period.label === "2026-H1").status, "To plan");
});

test("a new review: number, dates, every role, the same people as last time", () => {
  const Q = buildQmr({ reviews, inputs, attendees, actions, now: NOW, dayOf: day });
  const { row, people } = newReview(Q, halfPeriod(2026, 2));
  assert.equal(row["Report no"], "QMR-XY-02-2026");
  assert.deepEqual([row.Period, row["Period start"], row["Period end"], row["Due by"]], ["2026-H2", "2026-07-01", "2026-12-31", "2027-02-28"]);
  assert.equal(people.length, QMR_ROLES.length);
  assert.equal(people.find((p) => p.Role === "QA manager").Name, "QA Demo Manager");
  assert.ok(people.every((p) => p.Attendance === "Invited"));
});

test("data collection by department follows who collects each parameter", () => {
  const Q = buildQmr({ reviews, inputs, attendees, actions, now: NOW, dayOf: day });
  const by = Object.fromEntries(collectionByDept(Q.byNo.get("QMR-XY-01-2026")).map((d) => [d.dept, `${d.done}/${d.total}`]));
  assert.equal(by["Quality assurance"], `1/${QMR_PARAMS.filter((p) => p.depts.includes("Quality assurance")).length}`);
  assert.equal(by["Quality compliance"], `1/${QMR_PARAMS.filter((p) => p.depts.includes("Quality compliance")).length}`);
  assert.equal(by["Regulatory affairs"], "0/1");
  assert.deepEqual(figuresOf('{"a":1}'), { a: 1 });
  assert.deepEqual(figuresOf("not json"), {});
});

test("parameter figures: per 100 batches, history, right first time, hand-entered figures, escalation", () => {
  const wb = {
    ...empty, meta: { asof: "2026-10-20", settings: {} }, tr: SCHEMA.tr, mapGrid: [],
    prod: table("prod", [{ "Search key": "ALPHA", Product: "ALPHA" }]),
    qe: table("qe", [
      scig({ "Creation Date": "10/02/2026 09:00 am", "Reference Id": "QE-XY-1", Type: "Quality Event", Title: "ALPHA granulation", Status: "Completed", "Final Event Classification": "Major", "Root Cause": "Equipment related", "Product Batch No.": "B2" }),
      scig({ "Creation Date": "15/03/2026 09:00 am", "Reference Id": "QE-XY-2", Type: "Quality Event", Title: "ALPHA label", Status: "Open", "End Date": "30/11/2026 11:59 pm", "Final Event Classification": "Minor", "Root Cause": "Human Error" }),
      scig({ "Creation Date": "20/04/2026 09:00 am", "Reference Id": "QE-XY-3", Type: "Quality Event", Title: "ALPHA sterility", Status: "Open", "End Date": "30/11/2026 11:59 pm", "Final Event Classification": "Critical", "Root Cause": "Equipment related, Procedure or instructions related" }),
      scig({ "Creation Date": "10/09/2025 09:00 am", "Reference Id": "QE-XY-4", Type: "Quality Event", Title: "ALPHA older", Status: "Completed", "Final Event Classification": "Major", "Root Cause": "Human Error" }),
    ]),
    batches: table("batches", [
      { Product: "ALPHA 10 mg", "Batch no": "B1", "Mfg date": "2026-02-05" },
      { Product: "ALPHA 10 mg", "Batch no": "B2", "Mfg date": "2026-02-20" },
      { Product: "ALPHA 10 mg", "Batch no": "B3", "Mfg date": "2026-03-01" },
      { Product: "ALPHA 10 mg", "Batch no": "B4", "Mfg date": "2026-05-01", Status: "Rejected" },
      { Product: "ALPHA 10 mg", "Batch no": "B0", "Mfg date": "2025-09-01" },
      { Product: "ALPHA 10 mg", "Batch no": "B00", "Mfg date": "2025-10-01" },
    ]),
    qmr: table("qmr", reviews),
    qmrInputs: table("qmrInputs", inputs),
  };
  const m = buildModel(wb, { today: NOW });
  buildDomains(m, wb, null);
  const Q = m.x.qmr;
  const rv = Q.byNo.get("QMR-XY-01-2026");
  const d = paramData(m, Q, rv, "deviations");
  const f = Object.fromEntries(d.figs.map((x) => [x.k, x.v]));
  assert.equal(f.qf_batches, 4);
  assert.equal(f.qf_dev_total, 3);
  assert.equal(f.qf_dev_critical, 1);
  assert.equal(f.qf_dev_major, 1);
  assert.equal(f.qf_dev_mc_rate, 50); // 2 major + critical for 4 batches
  assert.equal(d.hint, 1); // a critical deviation
  assert.deepEqual(d.trend.points.map((p) => p.x), ["2024-H1", "2024-H2", "2025-H1", "2025-H2", "2026-H1"]);
  assert.equal(d.trend.points[3].value, 50); // 1 major for 2 batches in the 2nd half 2025
  assert.equal(d.bars.items[0].label, "Equipment related");
  // right first time as the procedure defines it: no major or critical deviation (B2), not rejected (B4)
  const mf = Object.fromEntries(paramData(m, Q, rv, "manufacturing").figs.map((x) => [x.k, x.v]));
  assert.equal(mf.qf_rft, 0.5);
  assert.equal(mf.qf_rejected, 1);
  // hand-entered complaints, and the same figure in the previous review for the comparison
  const c = Object.fromEntries(paramData(m, Q, rv, "complaints").figs.map((x) => [x.k, x.v]));
  assert.equal(c.qf_complaints, 5);
  assert.equal(c.qf_complaints_valid_share, 0.4);
  assert.equal(c.qf_complaints_rate, 50);
  assert.deepEqual(manualHistory(Q, rv, "complaints", "complaintsValid").slice(-2).map((p) => p.value), [3, 2]);
  // the critical deviation of the period is escalated
  assert.deepEqual(escalations(m, rv).map((x) => x.ref), ["QE-XY-3"]);
  // every parameter computes on this workspace
  for (const p of QMR_PARAMS) assert.ok(Array.isArray(paramData(m, Q, rv, p.key).figs), p.key);
});
