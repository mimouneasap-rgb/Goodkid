// Pure calculation engine for the Tier 1 huddle board and the Tier 2 daily
// management board. Every function mirrors a formula of the source workbooks
// (Engine / KPI Engine sheets), so the app shows the same numbers as Excel.
// Dates are ISO strings "YYYY-MM-DD"; differences are whole days.

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const MS_DAY = 86400000;
export const toDay = (iso) => (iso ? Math.round(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / MS_DAY) : null);
export const fromDay = (n) => new Date(n * MS_DAY).toISOString().slice(0, 10);
export const addDays = (iso, n) => fromDay(toDay(iso) + n);
export const diffDays = (a, b) => toDay(a) - toDay(b);
export const weekday = (iso) => new Date(toDay(iso) * MS_DAY).getUTCDay();
export const monthStart = (iso) => `${iso.slice(0, 7)}-01`;
export function monthEnd(iso) {
  const y = +iso.slice(0, 4), m = +iso.slice(5, 7);
  return fromDay(Math.round(Date.UTC(y, m, 0) / MS_DAY));
}
export function monthDays(iso) {
  const out = [];
  for (let d = toDay(monthStart(iso)), e = toDay(monthEnd(iso)); d <= e; d++) out.push(fromDay(d));
  return out;
}
export const isWeekend = (iso, setup) => [setup.weekend1, setup.weekend2].includes(WEEKDAYS[weekday(iso)]);
export const workingDays = (iso, setup) => monthDays(iso).filter((d) => !isWeekend(d, setup)).length;

const num = (v) => (v === "" || v == null || Number.isNaN(+v) ? 0 : +v);
const has = (v) => v !== "" && v != null;
const ratio = (a, b) => (b ? a / b : "");
const sum = (arr, f) => arr.reduce((s, r) => s + num(f(r)), 0);
const count = (arr, f) => arr.reduce((s, r) => s + (f(r) ? 1 : 0), 0);

/** RAG against a target: "G" | "A" | "R" | "N" (no data). */
export function rag(value, better, target, amber) {
  if (value === "" || value == null || Number.isNaN(value)) return "N";
  if (better === "Higher") return value >= target ? "G" : value >= amber ? "A" : "R";
  return value <= target ? "G" : value <= amber ? "A" : "R";
}
export const RAG_TEXT = { G: "On target", A: "Watch", R: "Off target", N: "No data" };

/** Board health / Quality Pulse = (G + ½A) ÷ (G + A + R). */
export function pulse(rags) {
  const g = count(rags, (r) => r === "G"), a = count(rags, (r) => r === "A"), r = count(rags, (x) => x === "R");
  const score = ratio(g + 0.5 * a, g + a + r);
  return { g, a, r, n: count(rags, (x) => x === "N"), score, rag: score === "" ? "N" : score >= 0.85 ? "G" : score >= 0.65 ? "A" : "R" };
}

export function targetText(k) {
  const v = k.unit === "%" ? `${Math.round(k.target * 100)}%` : k.target;
  return `${k.better === "Higher" ? "≥" : "≤"} ${v}`;
}

/** Increment the trailing number of the last id: DEV-26-063 → DEV-26-064. */
export function nextId(records, key = "id", fallback = "NEW-001") {
  const ids = records.map((r) => r[key]).filter((v) => typeof v === "string" && /\d+$/.test(v));
  if (!ids.length) return fallback;
  const last = ids[ids.length - 1];
  const prefix = last.replace(/\d+$/, "");
  const width = last.length - prefix.length;
  const max = Math.max(...ids.filter((v) => v.startsWith(prefix)).map((v) => +v.slice(prefix.length)));
  let n = max + 1, id;
  const taken = new Set(records.map((r) => r[key]));
  do { id = prefix + String(n++).padStart(width, "0"); } while (taken.has(id));
  return id;
}

/* ───────────────────────────── TIER 2 ───────────────────────────── */

/** Life-cycle columns of the Tier 2 registers that share the generic formulas. */
export const T2_FLOW = {
  dev: { done: ["Closed"] },
  capa: { done: ["Closed"] },
  cc: { done: ["Implemented", "Closed", "Rejected"] },
  insp: { done: ["Closed"] },
  doc: { done: ["Closed"] },
  apqr: { done: ["Closed"] },
  esc: { done: ["Resolved"] },
  tasks: { done: ["Done", "Cancelled"] },
};

/** ƒx columns of a generic Tier 2 register row (Live Status, Age, Days to Due, Closed On Time, Data Check). */
export function t2Row(reg, r, statusDate) {
  const flow = T2_FLOW[reg];
  const done = flow.done.includes(r.status);
  const live = !has(r.id) ? "" : !done && has(r.due) && r.due < statusDate ? "Overdue" : r.status || "";
  const age = has(r.opened) ? diffDays(has(r.closed) ? r.closed : statusDate, r.opened) : "";
  const toDue = has(r.id) && has(r.due) && done === false ? diffDays(r.due, statusDate) : "";
  const onTime = done && has(r.closed) && has(r.due) ? (r.closed <= r.due ? "Yes" : "No") : "";
  let check = "OK";
  if (!has(r.status)) check = "Status missing";
  else if (done && !has(r.closed)) check = "Completion date missing";
  else if (has(r.closed) && !done) check = "Date entered, status still open";
  else if (has(r.due) && has(r.opened) && r.due < r.opened) check = "Due date before open date";
  const out = { live, age, toDue, onTime, check, open: !done };
  if (reg === "apqr") out.effPct = r.status === "Closed" ? 1 : num(r.pct);
  return out;
}

export function t2Release(r, setup) {
  const target = has(r.mfg) ? addDays(r.mfg, num(setup.brTarget)) : "";
  const lead = has(r.mfg) ? diffDays(has(r.decision) ? r.decision : setup.statusDate, r.mfg) : "";
  const final = r.status === "Released" || r.status === "Rejected";
  const live = !has(r.id) ? "" : final ? r.status : target && setup.statusDate > target ? "Overdue" : r.status || "";
  const late = r.status === "Released" && has(r.decision) && target ? (r.decision > target ? "Yes" : "No") : "";
  let check = "OK";
  if (!has(r.status)) check = "Status missing";
  else if (final && !has(r.decision)) check = "Decision date missing";
  else if (has(r.decision) && !final) check = "Date entered, status still open";
  return { target, lead, live, late, check, open: !final, toDue: !final && target ? diffDays(target, setup.statusDate) : "" };
}

export function t2Training(r, setup) {
  const completion = num(r.planned) > 0 ? Math.min(1, num(r.trained) / num(r.planned)) : "";
  const closed = r.status === "Completed" || r.status === "Cancelled";
  const live = !has(r.id) ? "" : !closed && has(r.date) && r.date < setup.statusDate ? "Overdue" : r.status || "";
  let check = "OK";
  if (!has(r.status)) check = "Status missing";
  else if (has(r.trained) && has(r.planned) && +r.trained > +r.planned) check = "Trained exceeds planned";
  else if (r.status === "Completed" && !has(r.trained)) check = "Participants trained missing";
  return { completion, live, check, open: !closed };
}

/* ── QA load: workload calculated from the registers ─────────────────── */

/** Standard effort catalogue (person-days). `reg` is the source register,
 * `field`/`value` pick a sub-type; reg "task" rows are the activities the
 * Task planner assigns. Editable in Setup. */
export const DEFAULT_ACTIVITIES = [
  { name: "Deviation investigation · Minor", reg: "dev", field: "cls", value: "Minor", effort: 1, role: "QA Officer — oncology line" },
  { name: "Deviation investigation · Major", reg: "dev", field: "cls", value: "Major", effort: 2.5, role: "QA Officer — oncology line" },
  { name: "Deviation investigation · Critical", reg: "dev", field: "cls", value: "Critical", effort: 5, role: "Senior QA Officer — board owner" },
  { name: "CAPA action", reg: "capa", effort: 1, role: "QA Officer — oncology line" },
  { name: "Change control · Minor", reg: "cc", field: "cat", value: "Minor", effort: 0.5, role: "QA Officer — oncology line" },
  { name: "Change control · Major", reg: "cc", field: "cat", value: "Major", effort: 1.5, role: "QA Officer — oncology line" },
  { name: "Change control · Critical", reg: "cc", field: "cat", value: "Critical", effort: 3, role: "Senior QA Officer — board owner" },
  { name: "Gemba finding follow-up", reg: "insp", effort: 0.25, role: "QA Officer — oncology line" },
  { name: "Batch disposition (BMR review + release)", reg: "rel", effort: 1, role: "QA Batch Release" },
  { name: "Document · New", reg: "doc", field: "action", value: "New", effort: 2, role: "QA Documentation" },
  { name: "Document · Revision", reg: "doc", field: "action", value: "Revision", effort: 1.5, role: "QA Documentation" },
  { name: "Document · Periodic review", reg: "doc", field: "action", value: "Periodic Review", effort: 0.75, role: "QA Documentation" },
  { name: "Document · Withdrawal", reg: "doc", field: "action", value: "Withdrawal", effort: 0.25, role: "QA Documentation" },
  { name: "APQR preparation", reg: "apqr", effort: 8, role: "Senior QA Officer — board owner" },
  { name: "Training session delivery", reg: "trn", effort: 1, role: "Senior QA Officer — board owner" },
  { name: "Tier 3 escalation follow-up", reg: "esc", effort: 0.5, role: "Senior QA Officer — board owner" },
  { name: "Tier 1 action", reg: "t1ac", effort: 0.25, role: "QA Officer — oncology line" },
  { name: "Batch record review (routine)", reg: "task", effort: 1, role: "QA Batch Release" },
  { name: "Gemba walks & line support (routine)", reg: "task", effort: 1, role: "QA Officer — oncology line" },
  { name: "Internal audit / self-inspection", reg: "task", effort: 4, role: "Senior QA Officer — board owner" },
  { name: "Supplier audit", reg: "task", effort: 3, role: "Senior QA Officer — board owner" },
  { name: "Validation / qualification protocol review", reg: "task", effort: 2, role: "QA Validation" },
  { name: "Cleaning validation", reg: "task", effort: 5, role: "QA Validation" },
  { name: "Complaint investigation", reg: "task", effort: 3, role: "QA Officer — oncology line" },
  { name: "Data-integrity / audit-trail review", reg: "task", effort: 1, role: "QA Officer — oncology line" },
  { name: "eQMS administration", reg: "task", effort: 1, role: "Senior QA Officer — board owner" },
  { name: "Management review / KPI reporting", reg: "task", effort: 2, role: "Senior QA Officer — board owner" },
  { name: "Document control & issuance (routine)", reg: "task", effort: 1, role: "QA Documentation" },
  { name: "Other planned QA work", reg: "task", effort: 1, role: "" },
];

export const LOAD_SOURCES = {
  dev: "Deviations", capa: "CAPA", cc: "Change control", insp: "Inspections", rel: "Batch release", doc: "Documentation",
  apqr: "APQR", trn: "Training", esc: "Escalations", tasks: "Task planner", t1ac: "Tier 1 actions",
};

/** Who does the QA work on a record, and over which dates. */
const LOAD_MAP = {
  dev: { who: "owner" }, capa: { who: "owner" }, cc: { who: "owner" }, insp: { who: "inspector" },
  doc: { who: "owner" }, apqr: { who: "owner" }, esc: { who: "owner" },
  rel: { who: "officer", start: (r) => r.bmr || r.mfg, end: (r) => r.decision, due: (r, s) => (has(r.mfg) ? addDays(r.mfg, num(s.brTarget)) : ""), done: ["Released", "Rejected"] },
  trn: { who: "trainer", start: (r) => r.date, end: (r) => r.date, due: (r) => r.date, done: ["Completed"], skip: ["Cancelled"] },
  tasks: { who: "member", done: ["Done"], skip: ["Cancelled"] },
  t1ac: { who: "officer", done: ["Done"], skip: ["Cancelled"] },
};

export function activityFor(activities, reg, r) {
  if (reg === "tasks") return activities.find((a) => a.reg === "task" && a.name === r.activity) || null;
  return activities.find((a) => a.reg === reg && (!a.field || r[a.field] === a.value)) || activities.find((a) => a.reg === reg && !a.field) || null;
}

/** Every piece of work one team member carries in the reporting month. */
export function workloadItems(state, member, t1 = null) {
  const s = state.setup;
  const mS = toDay(monthStart(s.month)), mE = toDay(monthEnd(s.month)), now = s.statusDate;
  const acts = state.activities || DEFAULT_ACTIVITIES;
  const regs = [...Object.keys(LOAD_MAP).filter((k) => k !== "t1ac").map((k) => [k, state[k] || []]), ["t1ac", t1 ? t1.ac : []]];
  const out = [];
  for (const [reg, rows] of regs) {
    const m = LOAD_MAP[reg];
    const doneList = m.done || T2_FLOW[reg].done;
    for (const r of rows) {
      if (!member || r[m.who] !== member || (m.skip || []).includes(r.status)) continue;
      const start = m.start ? m.start(r) : r.opened;
      if (!has(start)) continue;
      const done = doneList.includes(r.status);
      const due = m.due ? m.due(r, s) : r.due;
      const closeDate = m.end ? m.end(r) : r.closed;
      const endIso = done ? closeDate || due || start : [due || start, now].sort().pop();
      const a = toDay(start), b = Math.max(a, toDay(endIso));
      const overlap = Math.min(b, mE) - Math.max(a, mS) + 1;
      const act = activityFor(acts, reg, r);
      const effort = reg === "tasks" && has(r.effort) ? +r.effort : act ? num(act.effort) : 0;
      const share = overlap > 0 ? overlap / (b - a + 1) : 0;
      const overdue = !done && has(due) && due < now && start <= now;
      if (share <= 0 && !overdue) continue;
      out.push({ reg, source: LOAD_SOURCES[reg], ref: r.id || "", desc: r.desc || r.title || r.topic || r.product || "", activity: act ? act.name : "—",
        effort, share, days: effort * share, start, end: fromDay(b), due: due || "", overdue, done });
    }
  }
  return out.sort((x, y) => y.days - x.days);
}

/** Absence days logged on the Tier 1 daily log (leave, training, absent) in the month. */
export function loggedAbsence(state, member, t1) {
  if (!t1) return 0;
  const mS = monthStart(state.setup.month), mE = monthEnd(state.setup.month);
  return t1.dl.filter((r) => r.officer === member && r.date >= mS && r.date <= mE && ["Leave", "Training", "Absent"].includes(r.att)).length;
}

export function t2Load(r, state, t1 = null) {
  const s = state.setup;
  const wd = workingDays(s.month, s);
  const logged = loggedAbsence(state, r.member, t1);
  const absence = num(r.absence) + logged;
  const available = wd - absence;
  const items = workloadItems(state, r.member, t1);
  const workload = Math.round(items.reduce((a, x) => a + x.days, 0) * 10) / 10;
  const delayed = items.filter((x) => x.overdue).length;
  const util = available > 0 ? workload / available : "";
  const status = util === "" ? "" : util > s.overLoad ? "Overloaded" : util >= s.highLoad ? "High load" : "Normal";
  return { workDays: wd, logged, absence, available, items, workload, delayed, util, status, count: items.length, check: has(r.member) ? "OK" : "Member missing" };
}

/** The Tier 1 board feeding Tier 2 (its actions and attendance count in QA load). */
let tier1Source = () => null;
export function linkTier1(getter) { tier1Source = getter; }

/** All computed columns for every Tier 2 register. */
export function t2Computed(state) {
  const s = state.setup, out = {};
  for (const reg of Object.keys(T2_FLOW)) out[reg] = (state[reg] || []).map((r) => t2Row(reg, r, s.statusDate));
  out.rel = state.rel.map((r) => t2Release(r, s));
  out.trn = state.trn.map((r) => t2Training(r, s));
  const t1 = tier1Source();
  out.load = state.load.map((r) => t2Load(r, state, t1));
  out.tasks = (state.tasks || []).map((r, i) => {
    const act = activityFor(state.activities || DEFAULT_ACTIVITIES, "tasks", r);
    const std = act ? num(act.effort) : "";
    const effort = has(r.effort) ? +r.effort : std;
    const c = out.tasks[i];
    return { ...c, std, effort, check: c.check === "OK" && !act ? "Activity not in the catalogue" : c.check };
  });
  return out;
}

export function t2Kpis(state, comp = t2Computed(state)) {
  const s = state.setup;
  const overdue = (reg) => count(comp[reg], (c) => c.live === "Overdue");
  const onTimeRate = (reg) => ratio(count(comp[reg], (c) => c.onTime === "Yes"),
    count(state[reg], (r) => r.status === "Closed") + overdue(reg));
  const released = count(state.rel, (r) => r.status === "Released");
  const loadAvail = sum(comp.load, (c) => c.available);
  const trnRows = state.trn.filter((r) => has(r.date) && r.date <= s.statusDate && r.status !== "Cancelled");
  const actuals = [
    overdue("dev"),
    onTimeRate("capa"),
    overdue("cc"),
    onTimeRate("insp"),
    ratio(count(comp.rel, (c) => c.late === "No"), released),
    overdue("doc"),
    ratio(sum(comp.load, (c) => c.workload), loadAvail),
    overdue("apqr"),
    ratio(sum(trnRows, (r) => r.trained), sum(trnRows, (r) => r.planned)),
  ];
  const m = +s.month.slice(5, 7);
  const kpis = state.kpis.map((k, i) => {
    const actual = actuals[i];
    const prevRaw = m > 1 && state.trend.rows[i] ? state.trend.rows[i][m - 2] : null;
    const prev = has(prevRaw) ? prevRaw : "";
    let trend = "", trendCode = 0;
    if (prev !== "" && actual !== "") {
      trend = actual > prev ? "▲" : actual < prev ? "▼" : "▬";
      trendCode = actual === prev ? 0 : (actual - prev) * (k.better === "Higher" ? 1 : -1) > 0 ? 1 : -1;
    }
    return { ...k, actual, rag: rag(actual, k.better, k.target, k.amber), prev, trend, trendCode, targetText: targetText(k) };
  });
  const otherRag = { "On target": "G", Watch: "A", "Off target": "R" }[s.otherStatus] || "N";
  const other = { name: s.otherDesc || "Other points", actual: s.otherStatus || "—", rag: otherRag, unit: "manual", targetText: "Manual" };
  return { kpis, other, pulse: pulse([...kpis.map((k) => k.rag), otherRag]) };
}

const T2_DAY = ["", "No issue", "In progress", "Critical"];
export const T2_PROCESSES = [
  { key: "dev", label: "Deviation", ov: "ovDev", raisedCritical: (r) => r.cls === "Critical", raisedWatch: (r) => r.cls === "Major" },
  { key: "capa", label: "CAPA", ov: "ovCapa", raisedCritical: () => false, raisedWatch: () => false },
  { key: "cc", label: "Change Ctrl", ov: "ovCc", raisedCritical: () => false, raisedWatch: (r) => r.cat === "Major" },
  { key: "insp", label: "Inspection", ov: "ovInsp", raisedCritical: (r) => r.sev === "High", raisedWatch: (r) => r.sev === "Medium" },
];

/** Auto status of one process on one day, plus the records that caused it. */
export function t2DayAuto(state, proc, date) {
  const soonEnd = addDays(date, num(state.setup.soon));
  const openOn = (r) => has(r.opened) && r.opened <= date && (!has(r.closed) || r.closed > date);
  const overdue = [], raisedC = [], raisedW = [], dueSoon = [];
  for (const r of state[proc.key]) {
    if (openOn(r) && has(r.due) && r.due < date) overdue.push(r);
    if (r.opened === date && proc.raisedCritical(r)) raisedC.push(r);
    if (r.opened === date && proc.raisedWatch(r)) raisedW.push(r);
    if (openOn(r) && has(r.due) && r.due >= date && r.due <= soonEnd) dueSoon.push(r);
  }
  const code = overdue.length + raisedC.length ? 3 : raisedW.length + dueSoon.length ? 2 : 1;
  return { code, status: T2_DAY[code], overdue, raisedC, raisedW, dueSoon };
}

/** The Q-calendar: one entry per day of the reporting month. */
export function t2Calendar(state) {
  const s = state.setup;
  return monthDays(s.month).map((date) => {
    const weekend = isWeekend(date, s);
    const future = date > s.statusDate;
    const log = state.daily[date] || {};
    const procs = T2_PROCESSES.map((p) => {
      const auto = weekend || future ? null : t2DayAuto(state, p, date);
      const override = log[p.ov] || "";
      const code = override ? T2_DAY.indexOf(override) : auto ? auto.code : 0;
      return { key: p.key, label: p.label, auto, override, code, status: T2_DAY[code] || "" };
    });
    const code = Math.max(...procs.map((p) => p.code));
    return { date, day: +date.slice(8), weekend, future, today: date === s.statusDate, log, procs, code, status: T2_DAY[code] || "" };
  });
}

/** Monthly summary cards and chart data (KPI Engine § status mix). */
export function t2Summary(state, comp = t2Computed(state)) {
  const s = state.setup, mS = monthStart(s.month), mE = monthEnd(s.month);
  const inMonth = (d) => has(d) && d >= mS && d <= mE;
  const st = (reg, ...v) => count(state[reg], (r) => v.includes(r.status));
  const od = (reg) => count(comp[reg], (c) => c.live === "Overdue");
  const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : "");
  return {
    dev: { total: state.dev.length, new: count(state.dev, (r) => inMonth(r.opened)), lines: [["Open", st("dev", "Open")], ["In progress", st("dev", "In Progress")], ["Closed", st("dev", "Closed")], ["Overdue", od("dev")]] },
    capa: { total: state.capa.length, new: count(state.capa, (r) => inMonth(r.opened)), lines: [["Open", st("capa", "Open")], ["In progress", st("capa", "In Progress", "Effectiveness Check")], ["Closed", st("capa", "Closed")], ["Avg closure (d)", avg(state.capa.map((r, i) => (r.status === "Closed" ? comp.capa[i].age : null)).filter((v) => v !== null && v !== ""))]] },
    cc: { total: state.cc.length, new: count(state.cc, (r) => inMonth(r.opened)), lines: [["Open", st("cc", "Open")], ["In progress", st("cc", "In Progress")], ["Implemented", st("cc", "Implemented")], ["Closed", st("cc", "Closed")]] },
    insp: { total: state.insp.length, new: count(state.insp, (r) => inMonth(r.opened)), lines: [["Open", st("insp", "Open")], ["In progress", st("insp", "In Progress")], ["Closed", st("insp", "Closed")], ["Overdue", od("insp")]] },
    rel: { total: state.rel.length, new: count(state.rel, (r) => inMonth(r.mfg)), lines: [["Waiting / review", st("rel", "Waiting", "Under Review", "On Hold")], ["Released", st("rel", "Released")], ["Released late", count(comp.rel, (c) => c.late === "Yes")], ["Overdue", od("rel")]] },
    doc: { total: state.doc.length, new: count(state.doc, (r) => inMonth(r.opened)), lines: [["Open", st("doc", "Open")], ["In course", st("doc", "In Course", "In Approval")], ["Closed", st("doc", "Closed")], ["Avg revision (d)", avg(state.doc.map((r, i) => (r.status === "Closed" ? comp.doc[i].age : null)).filter((v) => v !== null && v !== ""))]] },
    load: { total: state.load.length, new: workingDays(s.month, s), newLabel: "working days", lines: [["Absence (days)", sum(comp.load, (c) => c.absence)], ["High load (n)", count(comp.load, (c) => c.status === "High load" || c.status === "Overloaded")], ["Delayed tasks", sum(comp.load, (c) => c.delayed)], ["Utilisation", ratio(sum(comp.load, (c) => c.workload), sum(comp.load, (c) => c.available))]] },
    apqr: { total: state.apqr.length, new: count(state.apqr, (r) => inMonth(r.opened)), lines: [["Not started", st("apqr", "Not Started")], ["In progress", st("apqr", "In Progress", "In Review")], ["Closed", st("apqr", "Closed")], ["Completion", avg(comp.apqr.map((c) => c.effPct))]] },
    trn: { total: state.trn.length, new: count(state.trn, (r) => inMonth(r.date)), lines: [["Completed", st("trn", "Completed")], ["Planned / ongoing", st("trn", "Planned", "In Progress")], ["New hires trained", sum(state.trn, (r) => r.newhires)], ["Overdue", od("trn")]] },
    esc: { total: state.esc.length, new: count(state.esc, (r) => inMonth(r.opened)), lines: [["Open", st("esc", "Open")], ["In progress", st("esc", "In Progress")], ["Resolved", st("esc", "Resolved")], ["Overdue", od("esc")]] },
  };
}

/** Most urgent open items of a register (dashboard top 5): open, sorted by due date. */
export function t2Top(state, reg, n = 5, comp = t2Computed(state)) {
  return state[reg]
    .map((r, i) => ({ r, c: comp[reg][i], i }))
    .filter(({ r, c }) => has(r.id) && c.open)
    .sort((a, b) => (a.r.due || "9999").localeCompare(b.r.due || "9999") || a.i - b.i)
    .slice(0, n);
}

/** Data-check counts per register. */
export function flagged(comp) {
  return comp.filter((c) => c.check && c.check !== "OK").length;
}

/* ───────────────────────────── TIER 1 ───────────────────────────── */

export const PILLARS = [
  { key: "S", name: "Safety", tag: "people & containment first", ov: "ovS" },
  { key: "Q", name: "Quality", tag: "right first time, every time", ov: "ovQ" },
  { key: "D", name: "Delivery", tag: "reviews & actions on time", ov: "ovD" },
  { key: "C", name: "Compliance", tag: "rounds & reviews completed", ov: "ovC" },
  { key: "P", name: "People", tag: "present, trained, skilled", ov: "ovP" },
];
const T1_OV = { Green: 1, Amber: 2, Red: 3 };
const PRESENT = (r) => r.att === "Present" || r.att === "Remote";

export function t1Activities(r) {
  return ["lc", "ipc", "aql", "gd", "logb", "atd", "samp", "cont", "docs"].reduce((s, k) => s + num(r[k]), 0);
}

export function t1DailyCheck(r, all) {
  if (!has(r.officer)) return "Officer missing";
  if (!has(r.att)) return "Attendance missing";
  if (all.filter((x) => x.date === r.date && x.officer === r.officer).length > 1) return "Duplicate officer / date";
  if (num(r.gd) > num(r.gp)) return "Gemba done > planned";
  if (num(r.atd) > num(r.atp)) return "Audit-trail done > planned";
  if (num(r.lcf) > num(r.lc)) return "LC failures > clearances";
  const act = t1Activities(r);
  if (r.att === "Absent" && act > 0) return "Activity logged while absent";
  if (PRESENT(r) && act === 0) return "No activity logged";
  return "OK";
}

export function t1Review(r, setup, sel) {
  const lead = has(r.recv) ? diffDays(has(r.done) ? r.done : sel, r.recv) : "";
  const within = has(r.done) && has(r.recv) ? (diffDays(r.done, r.recv) <= num(setup.brTarget) ? "Yes" : "No") : "";
  const rft = has(r.done) ? (num(r.errors) === 0 ? "Yes" : "No") : "";
  const live = !has(r.id) ? "" : has(r.done) ? "Completed" : has(r.recv) && diffDays(sel, r.recv) > num(setup.brTarget) ? "Overdue" : r.status || "Pending";
  let check = "OK";
  if (!has(r.officer)) check = "Reviewer missing";
  else if (has(r.done) && !has(r.errors)) check = "Error count missing";
  else if (has(r.done) && r.status !== "Completed" && r.status !== "Returned") check = "Date entered, status open";
  else if (r.status === "Completed" && !has(r.done)) check = "Completion date missing";
  else if (has(r.done) && r.done < r.recv) check = "Completed before received";
  return { lead, within, rft, live, check, open: !has(r.done) };
}

export function t1Finding(r, sel) {
  const live = !has(r.id) ? "" : !has(r.closed) && has(r.due) && r.due < sel && r.status !== "Closed" ? "Overdue" : r.status || "";
  const onTime = has(r.closed) && has(r.due) ? (r.closed <= r.due ? "Yes" : "No") : "";
  const daysOver = has(r.id) && has(r.opened) && has(r.due) && r.opened <= sel && r.due < sel && (!has(r.closed) || r.closed > sel) ? diffDays(sel, r.due) : "";
  let check = "OK";
  if (!has(r.officer)) check = "Officer missing";
  else if (!has(r.status)) check = "Status missing";
  else if (r.status === "Closed" && !has(r.closed)) check = "Closure date missing";
  else if (has(r.closed) && r.status !== "Closed") check = "Date entered, status still open";
  else if (has(r.due) && has(r.opened) && r.due < r.opened) check = "Due date before open date";
  return { live, onTime, daysOver, check, open: r.status !== "Closed" };
}

export function t1Action(r, sel) {
  const done = r.status === "Done" || r.status === "Cancelled";
  const live = !has(r.id) ? "" : !has(r.closed) && has(r.due) && r.due < sel && !done ? "Overdue" : r.status || "";
  const onTime = has(r.closed) && has(r.due) && r.status !== "Cancelled" ? (r.closed <= r.due ? "Yes" : "No") : "";
  const daysOver = has(r.id) && has(r.opened) && has(r.due) && r.opened <= sel && r.due < sel && (!has(r.closed) || r.closed > sel) ? diffDays(sel, r.due) : "";
  let check = "OK";
  if (!has(r.officer)) check = "Officer missing";
  else if (!has(r.status)) check = "Status missing";
  else if (done && !has(r.closed)) check = "Closure date missing";
  else if (has(r.closed) && !done) check = "Date entered, status still open";
  else if (has(r.due) && has(r.opened) && r.due < r.opened) check = "Due date before open date";
  return { live, onTime, daysOver, check, open: !done };
}

export function t1Training(r, sel) {
  const live = !has(r.id) ? "" : has(r.closed) ? "Completed" : has(r.due) && r.due < sel ? "Overdue" : "Pending";
  const check = !has(r.officer) ? "Officer missing" : !has(r.due) ? "Due date missing" : "OK";
  return { live, check, open: !has(r.closed) };
}

export function t1HuddleCheck(r, all) {
  return all.filter((x) => x.date === r.date).length > 1 ? "Duplicate date" : "OK";
}

export function t1Computed(state, sel = state.setup.selDate) {
  return {
    dl: state.dl.map((r) => ({ act: t1Activities(r), check: t1DailyCheck(r, state.dl) })),
    br: state.br.map((r) => t1Review(r, state.setup, sel)),
    fn: state.fn.map((r) => t1Finding(r, sel)),
    ac: state.ac.map((r) => t1Action(r, sel)),
    hd: state.hd.map((r) => ({ check: t1HuddleCheck(r, state.hd) })),
    tr: state.tr.map((r) => t1Training(r, sel)),
  };
}

export function skillCoverage(levels) {
  const nums = levels.filter((v) => has(v));
  return nums.length ? nums.filter((v) => +v >= 3).length / nums.length : "";
}

/** Context for the Tier 1 board: selected date and officer filter. */
export function t1Context(state, sel = state.setup.selDate, officer = "All team") {
  const setup = state.setup;
  const start = monthStart(sel);
  const mine = (r) => officer === "All team" || r.officer === officer;
  const comp = t1Computed(state, sel);
  const dl = state.dl.filter(mine), br = state.br.map((r, i) => ({ ...r, ...comp.br[i] })).filter(mine);
  const fn = state.fn.map((r, i) => ({ ...r, ...comp.fn[i] })).filter(mine);
  const ac = state.ac.map((r, i) => ({ ...r, ...comp.ac[i] })).filter(mine);
  const tr = state.tr.filter(mine);
  const mtd = (d) => has(d) && d >= start && d <= sel;
  return { state, setup, sel, officer, start, dl, br, fn, ac, tr, mtd, comp };
}

/** Is an item open on day d (opened on/before d and not closed by d)? */
const openOn = (r, d, openKey, closeKey) => has(r[openKey]) && r[openKey] <= d && (!has(r[closeKey]) || r[closeKey] > d);

export function t1Kpis(ctx) {
  const { state, setup, sel, officer, dl, br, fn, ac, tr, mtd } = ctx;
  const dlM = dl.filter((r) => mtd(r.date));
  const present = count(dlM, PRESENT);
  const brM = br.filter((r) => mtd(r.done));
  const lc = sum(dlM, (r) => r.lc);
  const incDates = dl.filter((r) => num(r.inc) > 0 && r.date <= sel).map((r) => r.date).sort();
  const lastInc = incDates.length ? incDates[incDates.length - 1] : "";
  const base = [setup.lastIncident, lastInc].filter(has).sort().pop();
  const acClosed = ac.filter((r) => mtd(r.closed));
  const fnClosed = fn.filter((r) => mtd(r.closed));
  const trDue = tr.filter((r) => has(r.due) && r.due <= sel);
  const skillRows = officer === "All team" ? state.skills : state.skills.filter((s) => s.officer === officer);
  const allLevels = skillRows.flatMap((s) => s.levels);
  const actuals = [
    base ? diffDays(sel, base) : "",
    sum(dlM, (r) => r.nm),
    ratio(sum(dlM, (r) => r.cont), present),
    count(fn, (r) => r.type === "Containment / HSE" && openOn(r, sel, "opened", "closed")),
    ratio(lc - sum(dlM, (r) => r.lcf), lc),
    ratio(count(brM, (r) => num(r.errors) === 0), brM.length),
    ratio(sum(brM, (r) => r.errors), brM.length),
    count(fn, (r) => mtd(r.opened) && r.sev === "High"),
    ratio(count(acClosed, (r) => r.onTime === "Yes"), count(acClosed, (r) => r.onTime === "Yes" || r.onTime === "No")),
    count(ac, (r) => has(r.due) && r.due < sel && r.status !== "Cancelled" && openOn(r, sel, "opened", "closed")),
    brM.length ? sum(brM, (r) => r.lead) / brM.length : "",
    ratio(count(brM, (r) => r.within === "Yes"), brM.length),
    ratio(sum(dlM, (r) => r.gd), sum(dlM, (r) => r.gp)),
    ratio(sum(dlM, (r) => r.atd), sum(dlM, (r) => r.atp)),
    ratio(count(fnClosed, (r) => r.onTime === "Yes"), fnClosed.length),
    ratio(sum(dlM, (r) => r.logb), present),
    dlM.length ? 1 - count(dlM, (r) => r.att === "Absent") / dlM.length : "",
    ratio(count(trDue, (r) => has(r.closed) && r.closed <= sel), trDue.length),
    ratio(sum(dlM, (r) => t1Activities(r)), present),
    skillCoverage(allLevels),
  ];
  const kpis = state.kpis.map((k, i) => ({ ...k, actual: actuals[i], rag: rag(actuals[i], k.better, k.target, k.amber), targetText: targetText(k) }));
  return { kpis, health: pulse(kpis.map((k) => k.rag)) };
}

/** Auto colour (1 green · 2 amber · 3 red) of every SQDCP pillar for one day. */
export function t1DayAuto(ctx, date) {
  const { setup, dl, br, fn, ac, tr, officer } = ctx;
  const day = dl.filter((r) => r.date === date);
  const fnDay = fn.filter((r) => r.opened === date);
  const hse = (sev) => count(fnDay, (r) => r.type === "Containment / HSE" && r.sev === sev);
  const other = (sev) => count(fnDay, (r) => r.type !== "Containment / HSE" && r.sev === sev);
  const S = sum(day, (r) => r.inc) + hse("High") > 0 ? 3 : sum(day, (r) => r.nm) + hse("Medium") > 0 ? 2 : 1;
  const Q = sum(day, (r) => r.lcf) + other("High") > 0 ? 3 : count(br, (r) => r.done === date && num(r.errors) > 0) + other("Medium") > 0 ? 2 : 1;
  const late = count(ac, (r) => has(r.due) && r.due < date && r.status !== "Cancelled" && openOn(r, date, "opened", "closed"))
    + count(br, (r) => has(r.recv) && r.recv < addDays(date, -num(setup.brTarget)) && (!has(r.done) || r.done > date));
  const dueToday = count(ac, (r) => r.due === date && r.status !== "Cancelled" && (!has(r.closed) || r.closed > date));
  const D = late > 0 ? 3 : dueToday > 0 ? 2 : 1;
  const missed = Math.max(0, sum(day, (r) => r.gp) - sum(day, (r) => r.gd)) + Math.max(0, sum(day, (r) => r.atp) - sum(day, (r) => r.atd));
  const C = missed >= 2 ? 3 : missed === 1 ? 2 : 1;
  const presentN = count(day, PRESENT);
  const overdueTr = count(tr, (r) => has(r.due) && r.due < date && (!has(r.closed) || r.closed > date));
  const P = count(day, (r) => r.att === "Absent") > 0 || (officer === "All team" && presentN < num(setup.minStaff)) ? 3
    : count(day, (r) => r.att === "Leave" || r.att === "Training") + overdueTr > 0 ? 2 : 1;
  return { S, Q, D, C, P };
}

/** Day-by-day SQDCP codes: 1 G · 2 A · 3 R · 7 no data · 8 weekend · 0 future. */
export function t1Days(ctx) {
  const { state, setup, sel } = ctx;
  return monthDays(sel).map((date) => {
    let type = date > sel ? "Future" : isWeekend(date, setup) ? "Weekend" : ctx.dl.some((r) => r.date === date) ? "Day" : "NoData";
    const auto = type === "Day" ? t1DayAuto(ctx, date) : null;
    const hd = state.hd.find((h) => h.date === date) || {};
    const codes = {};
    for (const p of PILLARS) {
      const ov = T1_OV[hd[p.ov]];
      codes[p.key] = type === "Future" ? 0 : type === "Weekend" ? 8 : ov || (type === "NoData" ? 7 : auto[p.key]);
    }
    return { date, day: +date.slice(8), type, auto, override: hd, codes, selected: date === sel };
  });
}

export function t1PillarCounts(days) {
  return Object.fromEntries(PILLARS.map((p) => [p.key, {
    g: count(days, (d) => d.codes[p.key] === 1), a: count(days, (d) => d.codes[p.key] === 2),
    r: count(days, (d) => d.codes[p.key] === 3), n: count(days, (d) => d.codes[p.key] === 7),
  }]));
}

export function t1Today(ctx) {
  const { setup, sel, dl, br, fn, ac, officer, state } = ctx;
  const day = dl.filter((r) => r.date === sel);
  const backlog = br.filter((r) => has(r.recv) && r.recv <= sel && (!has(r.done) || r.done > sel));
  return {
    present: count(day, PRESENT),
    roster: officer === "All team" ? state.roster.length : 1,
    lc: sum(day, (r) => r.lc), lcf: sum(day, (r) => r.lcf),
    reviewed: count(br, (r) => r.done === sel),
    backlog: backlog.length,
    backlogLate: count(backlog, (r) => r.recv < addDays(sel, -num(setup.brTarget))),
    gd: sum(day, (r) => r.gd), gp: sum(day, (r) => r.gp),
    findings: count(fn, (r) => r.opened === sel), findingsHigh: count(fn, (r) => r.opened === sel && r.sev === "High"),
    overdue: count(ac, (r) => has(r.due) && r.due < sel && r.status !== "Cancelled" && openOn(r, sel, "opened", "closed")),
    dueToday: count(ac, (r) => r.due === sel && r.status !== "Cancelled" && (!has(r.closed) || r.closed > sel)),
    checks: sum(day, (r) => r.ipc) + sum(day, (r) => r.aql),
    activities: sum(day, (r) => t1Activities(r)),
  };
}

/** Team table: every roster officer, month to date (ignores the officer filter). */
export function t1Team(state, sel) {
  const kp = Object.fromEntries(state.kpis.map((k) => [k.name, k]));
  return state.roster.map((o) => {
    const ctx = t1Context(state, sel, o.name);
    const { kpis } = t1Kpis(ctx);
    const get = (name) => kpis.find((k) => k.name === name).actual;
    const dlM = ctx.dl.filter((r) => ctx.mtd(r.date));
    const brM = ctx.br.filter((r) => ctx.mtd(r.done));
    const row = {
      name: o.name, role: o.role, days: dlM.length,
      attendance: get("Attendance (no unplanned absence)"),
      lc: sum(dlM, (r) => r.lc), lcRft: get("Line clearance right first time"),
      records: brM.length, recRft: get("Batch records right first time"),
      lead: get("Average review lead time (days)"), gemba: get("Gemba rounds done vs planned"),
      findings: count(ctx.fn, (r) => ctx.mtd(r.opened)),
      open: count(ctx.ac, (r) => r.status !== "Cancelled" && openOn(r, sel, "opened", "closed")),
      late: get("Overdue actions"), training: get("Training compliance"),
      perDay: get("Activities / officer-day"), skills: get("Skills coverage (level ≥ 3)"),
    };
    const below = (v, k, lim) => typeof v === "number" && v < kp[k][lim];
    const red = ["amber"].some((lim) => below(row.attendance, "Attendance (no unplanned absence)", lim) || below(row.lcRft, "Line clearance right first time", lim)
      || below(row.recRft, "Batch records right first time", lim) || below(row.gemba, "Gemba rounds done vs planned", lim) || below(row.training, "Training compliance", lim)) || row.late > 0;
    const amber = below(row.attendance, "Attendance (no unplanned absence)", "target") || below(row.lcRft, "Line clearance right first time", "target")
      || below(row.recRft, "Batch records right first time", "target") || below(row.gemba, "Gemba rounds done vs planned", "target") || below(row.training, "Training compliance", "target");
    row.status = red ? "R" : amber ? "A" : "G";
    return row;
  });
}

/** Open actions, most urgent first, plus the open ones escalated to Tier 2. */
export function t1OpenActions(ctx) {
  const open = ctx.ac
    .map((r, i) => ({ ...r, _i: i }))
    .filter((r) => has(r.id) && has(r.opened) && r.opened <= ctx.sel && (!has(r.closed) || r.closed > ctx.sel) && r.status !== "Cancelled")
    .sort((a, b) => (a.due || "9999").localeCompare(b.due || "9999") || a._i - b._i);
  return { open, escalated: open.filter((r) => r.esc === "Yes") };
}

export function dueLabel(due, sel) {
  if (!has(due)) return "No due date";
  const d = diffDays(due, sel);
  return d < 0 ? `Overdue ${-d} d` : d === 0 ? "Due today" : `Due in ${d} d`;
}
