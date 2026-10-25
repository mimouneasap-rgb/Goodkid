// Quality management review (QMR), as the site's procedure organises it (pure, no DOM). A review is held at least twice a
// year, within two months of the end of the 2nd and of the 4th quarter. It covers a fixed set of mandatory parameters,
// each collected by the department responsible for it, compared with at least two years of history and related to the
// volume produced. The meeting is documented in a numbered report (participants, the status of each parameter, the
// actions and decisions with who and when, the approvals); the minutes go to the participants and the signed report and
// presentation to corporate, each within one week of the meeting; the actions are followed up at the next review.
import { addMonths } from "./model.js";

const DAY = 86400000;
export const DUE_MONTHS = 2; // the review is held within 2 months of the end of the half-year
export const MINUTES_DAYS = 7; // minutes shared with the participants within a week of the meeting
export const REPORT_DAYS = 7; // signed report and presentation shared with corporate within a week of the meeting
export const HISTORY = 4; // previous half-years shown beside the reviewed one (two years of history)

export const QMR_DEPTS = ["Regulatory affairs", "Quality assurance", "Quality compliance", "Human resources", "Quality control", "Validation", "All departments"];

// The mandatory parameters in the procedure's order, the departments that collect each one and the figures they enter by
// hand (those the app cannot count from its own data). name: the area an action is filed under; titles and descriptions
// are in i18n.js (qp_<key>, qp_<key>_h, qf_<field>).
export const QMR_PARAMS = [
  { key: "regulations", name: "Regulations", ch: "10.3.4.1", depts: ["Regulatory affairs"], fields: [] },
  { key: "pqr", name: "Product quality reviews", ch: "10.3.4.2", depts: ["Quality assurance"], fields: [] },
  { key: "procedures", name: "Procedure reviews", ch: "10.3.4.3", depts: ["Quality assurance"], fields: ["policies", "policiesDone"] },
  { key: "suppliers", name: "Supplier qualification", ch: "10.3.4.4", depts: ["Quality assurance", "Quality compliance", "Quality control"], fields: ["supQualPlanned", "supQualDone", "supClaims"] },
  { key: "training", name: "GMP training", ch: "10.3.4.5", depts: ["Quality compliance"], fields: [] },
  { key: "resources", name: "QA / QC resources", ch: "10.3.4.6", depts: ["Human resources", "Quality control"], fields: ["siteStaff", "tempStaff", "qaStaff", "qcFte"] },
  { key: "deviations", name: "Deviations", ch: "10.3.4.7", depts: ["Quality assurance"], fields: [] },
  { key: "oos", name: "Out of specification", ch: "10.3.4.8", depts: ["Quality control"], fields: ["oosRaw", "oosBulk", "oosFinished", "oosStability", "oosConfirmed", "oosNotConfirmed"] },
  { key: "complaints", name: "Complaints and counterfeits", ch: "10.3.4.9", depts: ["Quality compliance"], fields: ["complaints", "complaintsValid", "complaintsTechnical", "counterfeits", "unitsDistributed"] },
  { key: "recalls", name: "Recalls", ch: "10.3.4.10", depts: ["Quality compliance"], fields: ["recalls", "recallsVoluntary", "recallsForced"] },
  { key: "manufacturing", name: "Manufacturing performance", ch: "10.3.4.11", depts: ["Quality assurance"], fields: ["reworked"] },
  { key: "vmp", name: "Validation master plan", ch: "10.3.4.12", depts: ["Validation"], fields: [] },
  { key: "stability", name: "Stability testing", ch: "10.3.4.13", depts: ["Quality control"], fields: ["stabStudies", "stabRegistered", "stabBacklog"] },
  { key: "changes", name: "Change controls", ch: "10.3.4.14", depts: ["Quality assurance"], fields: ["ccNotifications"] },
  { key: "risk", name: "Risk assessments", ch: "10.3.4.15", depts: ["Quality assurance", "All departments"], fields: ["raIssued", "raDue", "raReviewed", "raUpdate"] },
  { key: "audits", name: "Inspections and audits", ch: "10.3.4.16", depts: ["Quality compliance"], fields: ["inspections", "customerAudits", "commitments", "commitmentsOpen"] },
  { key: "actions", name: "Actions follow-up", ch: "10.3.4.17", depts: ["Quality compliance"], fields: [] },
  { key: "improvement", name: "Continuous improvement", ch: "10.3.4.18", depts: ["Quality assurance", "Quality compliance", "Quality control", "Validation"], fields: [] },
];
export const PARAM_BY = new Map(QMR_PARAMS.map((p) => [p.key, p]));
export const AREAS = [...QMR_PARAMS.map((p) => p.name), "Meeting", "Other"];
// Further topics a review may add (capacities, products and facilities, inventory turnover, cycle times, quality risks…)
export const OTHER_TOPICS = ["Capacities and capacity allocation", "Processes, products, facilities and logistics", "Target market", "Inventory turnover", "Change management effectiveness",
  "Quality and safety issues", "Throughput and cycle times", "Process delays", "Verbal comments of authorities", "Quality risks", "Effectiveness of process and product changes"];

// Who takes part (defined by the site's organisation; corporate may join)
export const QMR_ROLES = ["Quality unit head / Quality director", "QA manager", "QC manager", "Validation manager", "Compliance manager", "Technical manager / Qualified person",
  "Production manager", "Supply chain manager", "Engineering manager", "Site head / General manager", "Executive VP Quality", "Corporate representative"];
export const INPUT_STATUS = ["Requested", "Collected", "Reviewed", "Not applicable"];
export const ASSESSMENTS = ["Satisfactory", "Needs improvement", "Unsatisfactory", "Not applicable"];
export const ATTENDANCE = ["Invited", "Present", "Excused", "Absent"];
export const ACTION_TYPES = ["Action", "Decision", "CAPA", "Improvement", "Resources / training", "Quality policy / objectives", "Escalation"];
export const ACTION_STATUS = ["Open", "In progress", "Done", "Cancelled"];
export const REG_STATUS = ["New", "Assessing", "Implementing", "Implemented", "Not applicable"];
export const REG_KINDS = ["New regulation", "Revised regulation", "Open issue (existing regulation)", "Export market requirement"];
export const REVIEW_STEPS = ["Planned", "Data collection", "Meeting scheduled", "Meeting held", "Minutes shared", "Closed"];

// ---------- half-year periods ----------
export const halfPeriod = (year, h) => ({ label: `${year}-H${h}`, year, h, start: Date.UTC(year, (h - 1) * 6, 1), end: Date.UTC(year, h * 6, 1) });
export const halfOf = (ts) => { const d = new Date(ts); return halfPeriod(d.getUTCFullYear(), d.getUTCMonth() < 6 ? 1 : 2); };
export const prevHalf = (p) => (p.h === 1 ? halfPeriod(p.year - 1, 2) : halfPeriod(p.year, 1));
export const nextHalf = (p) => (p.h === 2 ? halfPeriod(p.year + 1, 1) : halfPeriod(p.year, 2));
/** "2026-H1", "H1 2026", "S1 2026", "1st half 2026", or the period's own dates → the half-year. */
export function periodOf(label, start, end) {
  const s = String(label ?? "");
  const m = s.match(/(\d{4})\s*[-\s]?\s*[HS]([12])\b/i) ?? s.match(/\b[HS]([12])\s*[-\s/]?\s*(\d{4})/i);
  if (m) return /^\d{4}$/.test(m[1]) ? halfPeriod(+m[1], +m[2]) : halfPeriod(+m[2], +m[1]);
  if (start != null) {
    const p = halfOf(start);
    return end != null && end > p.end + DAY ? { label: s || p.label, year: p.year, h: p.h, start, end } : p;
  }
  return null;
}
/** The reviewed half-year and the ones before it, oldest first (two years of history by default). */
export const historyOf = (p, n = HISTORY) => { const out = [p]; for (let i = 0; i < n; i++) out.unshift(prevHalf(out[0])); return out; };
/** The review of a half-year is due by the end of the second month after it (31 August, end of February). */
export const dueByOf = (p) => addMonths(p.end, DUE_MONTHS) - DAY;

// ---------- report numbers: QMR-<site>-XX-YYYY, a two-digit serial within the year ----------
const NO_RE = /^(.*?)-(\d{1,2})-(\d{4})$/;
export const DEFAULT_PREFIX = "QMR-Onc";
export function nextReportNo(numbers, year) {
  const parsed = (numbers ?? []).map((n) => String(n ?? "").trim().match(NO_RE)).filter(Boolean);
  const prefix = parsed.at(-1)?.[1] || DEFAULT_PREFIX;
  const serial = Math.max(0, ...parsed.filter((x) => +x[3] === year).map((x) => +x[2])) + 1;
  return `${prefix}-${String(serial).padStart(2, "0")}-${year}`;
}

/** Hand-entered figures of one parameter: {"field": number}, stored as JSON. */
export function figuresOf(v) {
  if (v == null || v === "") return {};
  if (typeof v === "object") return v;
  try { const o = JSON.parse(v); return o && typeof o === "object" && !Array.isArray(o) ? o : {}; } catch { return {}; }
}
const n = (v) => (v == null || v === "" || isNaN(+v) ? null : +v);

// ---------- the register ----------
/**
 * Reviews, their parameters, participants, actions and the regulatory watch, with where each stands.
 * Rows are the workspace objects (each with __key); dayOf turns a stored date into a timestamp.
 */
export function buildQmr({ reviews = [], inputs = [], attendees = [], actions = [], regs = [], now, dayOf }) {
  const list = reviews.filter((r) => r["Report no"]).map((r) => {
    const period = periodOf(r.Period, dayOf(r["Period start"]), dayOf(r["Period end"]));
    const dueBy = dayOf(r["Due by"]) ?? (period ? dueByOf(period) : null);
    const meeting = dayOf(r["Meeting date"]), minutes = dayOf(r["Minutes shared on"]), report = dayOf(r["Report to corporate on"]);
    const ins = inputs.filter((x) => x["Report no"] === r["Report no"]);
    const insBy = new Map(ins.map((x) => [x.Parameter, x]));
    const mandatory = QMR_PARAMS.map((p) => insBy.get(p.key));
    const collected = mandatory.filter((x) => x && x.Status && x.Status !== "Requested").length;
    const reviewed = mandatory.filter((x) => x && (x.Status === "Reviewed" || x.Status === "Not applicable")).length;
    const ppl = attendees.filter((x) => x["Report no"] === r["Report no"]);
    const cancelled = /cancel/i.test(r.Status ?? "");
    const held = meeting != null && meeting <= now;
    const state = cancelled ? "Cancelled" : report != null ? "Closed" : minutes != null ? "Minutes shared" : held ? "Meeting held" : meeting != null ? "Meeting scheduled" : collected ? "Data collection" : "Planned";
    const minutesDue = held ? meeting + MINUTES_DAYS * DAY : null, reportDue = held ? meeting + REPORT_DAYS * DAY : null;
    const late = [];
    if (!cancelled && !held && dueBy != null && dueBy < now) late.push("meeting");
    if (held && minutes == null && minutesDue < now) late.push("minutes");
    if (held && report == null && reportDue < now) late.push("report");
    return {
      ...r, no: r["Report no"], period, label: period?.label ?? r.Period ?? "", dueBy, meeting, minutes, report, held, cancelled, state, late,
      meetingOnTime: meeting != null && dueBy != null ? meeting <= dueBy : null,
      minutesOnTime: minutes != null && meeting != null ? minutes - meeting <= MINUTES_DAYS * DAY : null,
      reportOnTime: report != null && meeting != null ? report - meeting <= REPORT_DAYS * DAY : null,
      minutesDue, reportDue, inputs: ins, inputBy: insBy, collected, reviewed, total: QMR_PARAMS.length, attendees: ppl,
      present: ppl.filter((x) => x.Attendance === "Present").length,
    };
  }).sort((a, b) => (b.period?.start ?? 0) - (a.period?.start ?? 0) || String(b.no).localeCompare(String(a.no)));
  const byNo = new Map(list.map((r) => [r.no, r]));

  const acts = actions.filter((a) => a.Action || a["Action ID"]).map((a) => {
    const due = dayOf(a.Due), closed = dayOf(a["Closed on"]);
    const done = /^(done|closed|completed)$/i.test(a.Status ?? ""), cancelled = /cancel/i.test(a.Status ?? "");
    const open = !done && !cancelled;
    const review = byNo.get(a["Report no"]) ?? null;
    return { ...a, due, closed, done, cancelled, open, overdue: open && due != null && due < now, review,
      state: cancelled ? "Cancelled" : done ? "Done" : due != null && due < now ? "Overdue" : a.Status || "Open",
      onTime: done && closed != null && due != null ? closed <= due : null };
  }).sort((a, b) => (a.open === b.open ? 0 : a.open ? -1 : 1) || (a.due ?? 9e15) - (b.due ?? 9e15));
  for (const r of list) r.actions = acts.filter((a) => a["Report no"] === r.no);

  const regList = regs.filter((x) => x.Regulation).map((x) => {
    const due = dayOf(x.Due), published = dayOf(x.Published);
    const closed = /^(implemented|not applicable)$/i.test(x.Status ?? "");
    return { ...x, due, published, closed, overdue: !closed && due != null && due < now };
  });

  // the reviews the procedure calls for: every half-year since the first review (or the last two years), up to the current one
  const nowHalf = halfOf(now);
  const first = list.map((r) => r.period).filter(Boolean).reduce((a, p) => (a == null || p.start < a.start ? p : a), null);
  let from = nowHalf;
  for (let i = 0; i < HISTORY; i++) from = prevHalf(from);
  const expected = [];
  for (let p = first && first.start < from.start ? halfPeriod(first.year, first.h) : from; p.start <= nowHalf.start; p = nextHalf(p)) {
    const r = list.find((x) => x.period?.label === p.label && !x.cancelled) ?? null;
    const dueBy = dueByOf(p);
    // (a half-year with no review in the app may have had one on paper: "Not recorded" until it is entered)
    expected.push({ period: p, dueBy, review: r, status: r?.held ? (r.meetingOnTime ? "Held on time" : "Held late") : r ? (dueBy < now ? "Overdue" : "Planned") : dueBy < now ? "Not recorded" : p.end > now ? "Period in progress" : "To plan" });
  }
  const open = list.filter((r) => !r.cancelled && r.state !== "Closed");
  const current = open.at(-1) ?? list.find((r) => !r.cancelled) ?? null; // the oldest review still open, else the latest
  const lastMeeting = list.filter((r) => r.held).reduce((a, r) => Math.max(a, r.meeting), -Infinity);
  // the next review to hold: the half-year just ended (even past its due date), else the one in progress
  const toPlan = expected.find((e) => !e.review && e.period.label === prevHalf(nowHalf).label) ?? expected.find((e) => !e.review && e.status === "Period in progress") ?? null;
  return { reviews: list, byNo, actions: acts, regs: regList, expected, current, toPlan, lastMeeting: Number.isFinite(lastMeeting) ? lastMeeting : null };
}

/** The review the page opens on: the one asked for, else the current one. */
export const pickReview = (Q, no) => (no && Q.byNo.get(no)) || Q.current || Q.reviews[0] || null;

/** A new review of a half-year: its number, dates and participants (same people in the same roles as the last review). */
export function newReview(Q, period, { site = "", location = "" } = {}) {
  const last = Q.reviews.find((r) => !r.cancelled) ?? null;
  const no = nextReportNo(Q.reviews.map((r) => r.no).reverse(), period.year);
  const row = { "Report no": no, Period: period.label, "Period start": iso(period.start), "Period end": iso(period.end - DAY), "Due by": iso(dueByOf(period)),
    Site: last?.Site || site || null, Location: last?.Location || location || null, Chair: last?.Chair ?? null };
  const people = QMR_ROLES.map((role) => {
    const prev = last?.attendees.find((a) => a.Role === role);
    return { "Report no": no, Role: role, Name: prev?.Name ?? null, Title: prev?.Title ?? null, Attendance: "Invited" };
  });
  return { row, people };
}
const iso = (ts) => (ts == null ? null : new Date(ts).toISOString().slice(0, 10));

/** Data-collection progress per department (who still owes which parameter). */
export function collectionByDept(review) {
  return QMR_DEPTS.map((d) => {
    const ps = QMR_PARAMS.filter((p) => p.depts.includes(d));
    const state = ps.map((p) => ({ p, input: review?.inputBy.get(p.key) ?? null }));
    const done = state.filter((s) => s.input && s.input.Status && s.input.Status !== "Requested");
    return { dept: d, params: state, done: done.length, total: ps.length };
  }).filter((d) => d.total);
}

/** Hand-entered value of one field for a review (null when not entered). */
export const manualOf = (review, key, field) => n(figuresOf(review?.inputBy.get(key)?.Figures)[field]);

/** The same hand-entered field in earlier reviews, oldest first, for the two-year comparison. */
export function manualHistory(Q, review, key, field) {
  if (!review?.period) return [];
  return historyOf(review.period).map((p) => {
    const r = Q.reviews.find((x) => x.period?.label === p.label && !x.cancelled);
    return { x: p.label, value: r ? manualOf(r, key, field) : null };
  });
}
