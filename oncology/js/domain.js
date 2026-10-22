// Calculations for the operational QA domains beyond the master workbook:
// training plan, calibration program, validation schedule, API suppliers, batch
// lifecycle and cycle times, WIP and rejections, APQR, 5S audits, the GMP activity
// register and the quarterly QMS metrics. Pure functions over the model + raw tables.
import { objects, clean, toDay, addMonths, monthStart, monthKey, daysBetween } from "./model.js";
import { METRICS, QA_ACTIVITIES, FIVES, FIVES_ITEMS } from "./catalogs.js";

const DAY = 86400000;
const num = (v) => (v == null || v === "" || isNaN(+v) ? null : +v);
const monthTs = (ym) => { const m = String(ym ?? "").match(/^(\d{4})-(\d{2})/); return m ? Date.UTC(+m[1], +m[2] - 1, 1) : null; };
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const REF_RE = /\b(QE|CAPA|CC|FIND|AUDT|OS|OOS)-KO-\d+\b/gi;
export const refsIn = (s) => [...new Set((String(s ?? "").match(REF_RE) ?? []).map((x) => x.toUpperCase()))];

/** Asset numbers in different registers ("EQ1234/Onc/01", "EQ1234-Onc/01") → "EQ1234/01". */
export function assetKey(s) {
  const t = String(s ?? "").toUpperCase().replace(/\s+/g, "");
  const m = t.match(/^([A-Z]{2}\d{3,5})[A-Z]?(?:[-/]ONC)?(?:\/(\d+))?/);
  return m ? (m[2] ? `${m[1]}/${m[2]}` : m[1]) : t;
}
/** First product of the catalogue whose search key appears in the text (workbook rule),
 *  else a catalogue product or API one or two letters away from the first word (typos such as "Gefetinib"). */
function productOf(prod, s) {
  const low = String(s ?? "").toLowerCase();
  const hit = prod.find((p) => p["Search key"] && low.includes(String(p["Search key"]).toLowerCase()))?.Product;
  if (hit) return hit;
  const word = (low.match(/[a-z]{6,}/) ?? [])[0];
  if (!word) return "";
  return prod.find((p) => [p.Product, p.API, p["Search key"]].some((n) => n && editDistance(word, String(n).toLowerCase().split(/\s+/)[0]) <= 2))?.Product ?? "";
}
function editDistance(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 3;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

// ---------- quarters ----------
export function quarters(year) {
  return [1, 2, 3, 4].map((q) => ({ label: `${year}-Q${q}`, start: Date.UTC(year, (q - 1) * 3, 1), end: Date.UTC(year, q * 3, 1) }));
}
export const yearPeriod = (year) => ({ label: `${year}`, start: Date.UTC(year, 0, 1), end: Date.UTC(year + 1, 0, 1) });
const inP = (t, p) => t != null && t >= p.start && t < p.end;

// ---------- build ----------
export function buildDomains(m, wb, review) {
  const now = m.now;
  const prod = m.products;

  // actions ↔ records
  const actionsBy = new Map();
  for (const a of m.actions) { if (!a.parentRef) continue; if (!actionsBy.has(a.parentRef)) actionsBy.set(a.parentRef, []); actionsBy.get(a.parentRef).push(a); }
  for (const r of m.records) r.actions = actionsBy.get(r.ref) ?? [];

  // ----- training -----
  const training = objects(wb.training).filter((t) => t.Program).map((t) => {
    const planned = monthTs(t["Rescheduled to"]) ?? monthTs(t["Planned month"]);
    const plannedEnd = planned != null ? addMonths(planned, 1) - DAY : null;
    const done = toDay(t["Completion date"]);
    const cancelled = /cancel/i.test(t.Status ?? "");
    let status = done ? "Completed" : cancelled ? "Cancelled" : planned == null ? "Not scheduled" : plannedEnd < now ? "Overdue" : planned <= now ? "Due this month" : "Planned";
    const pl = num(t["Planned attendees"]), tr = num(t["Trained attendees"]);
    return { ...t, planned, plannedEnd, done, status, onTime: done != null && plannedEnd != null ? done <= plannedEnd + 15 * DAY : null, attendance: pl ? (tr ?? 0) / pl : null, rescheduled: Boolean(t["Rescheduled to"]) };
  });

  // ----- calibration program -----
  const calRaw = objects(wb.calplan).filter((c) => c.Item);
  const parents = new Map();
  const calplan = calRaw.map((c) => {
    const isParent = !c.Parent;
    const p = isParent ? null : parents.get(c.Parent) ?? null;
    const start = toDay(c["Planned start"]) ?? p?.start ?? null;
    const end = toDay(c["Planned end"]) ?? p?.end ?? start;
    const freq = num(c["Frequency (months)"]) ?? p?.freq ?? null;
    const tolDays = /15/.test(c.Interval ?? p?.interval ?? "") ? 15 : /07|7 d/.test(c.Interval ?? p?.interval ?? "") ? 7 : 31;
    const done = toDay(c["Calibrated on"]);
    let status;
    if (done) status = "Done";
    else if (start == null) status = "Not scheduled";
    else if (start + tolDays * DAY < now) status = "Overdue";
    else if (start - tolDays * DAY <= now) status = "Due now";
    else if (start - 30 * DAY <= now) status = "Due ≤30 d";
    else status = "Planned";
    const row = { ...c, isParent, start, end, freq, tolDays, done, status, location: c.Location ?? p?.location ?? null, key: assetKey(c.Item),
      onTime: done && start ? Math.abs(daysBetween(start, done)) <= tolDays : null, nextDue: done && freq ? addMonths(done, freq) : null, month: start != null ? monthKey(start) : "" };
    if (isParent) parents.set(c.Item, { start, end, freq, interval: c.Interval, location: c.Location });
    return row;
  });
  // feed the plan into the equipment register (which has no calibration dates of its own)
  const planByAsset = new Map();
  for (const c of calplan) if (c.start != null || c.done) { const k = c.key; if (!planByAsset.has(k) || (c.start ?? 0) > (planByAsset.get(k).start ?? 0)) planByAsset.set(k, c); }
  for (const e of m.equip) {
    const c = planByAsset.get(assetKey(e["Asset no"]));
    e.calPlan = c ?? null;
    if (!c || e.last != null) continue;
    e.freq ??= c.freq;
    e.last = c.done ?? null;
    e.next = c.done ? c.nextDue : c.start;
    e.daysToDue = e.next != null ? daysBetween(now, e.next) : null;
    e.calStatus = c.done ? (e.daysToDue < 0 ? "Overdue" : e.daysToDue <= 30 ? "Due ≤30 d" : e.daysToDue <= 60 ? "Due 31–60 d" : e.daysToDue <= 90 ? "Due 61–90 d" : "In date")
      : c.status === "Overdue" ? "Overdue" : e.daysToDue <= 30 ? "Due ≤30 d" : e.daysToDue <= 60 ? "Due 31–60 d" : e.daysToDue <= 90 ? "Due 61–90 d" : "In date";
    e.dueMonth = e.next != null ? monthStart(e.next) : null;
    e.dataQuality = e.dataQuality.filter((x) => !/calibration (frequency|date)/i.test(x));
  }

  // ----- validation / requalification schedule -----
  const validation = objects(wb.validation).filter((v) => v.Task).map((v) => {
    const start = monthTs(v["Planned start"]);
    const finish = monthTs(v["Planned finish"]) ?? start;
    const finishEnd = finish != null ? addMonths(finish, 1) - DAY : null;
    const done = toDay(v["Completion date"]) ?? (/complet/i.test(v.Status ?? "") ? finishEnd : null);
    const cancelled = /cancel|postpon/i.test(v.Status ?? "");
    const status = done ? "Completed" : cancelled ? v.Status : start == null ? "Not scheduled" : finishEnd < now ? "Overdue" : start <= now ? "In progress" : start - 31 * DAY <= now ? "Due next month" : "Planned";
    const freqY = num(v["Frequency (years)"]);
    const init = monthTs(v["Initial qualification"]);
    return { ...v, start, finish, finishEnd, done, status, freqY, init, eqKey: v.Equipment ? assetKey(v.Equipment) : null,
      nextDue: (done ?? start) != null && freqY ? addMonths(done ?? start, freqY * 12) : null, onTime: done && finishEnd ? done <= finishEnd : null, month: start != null ? monthKey(start) : "" };
  });

  // ----- API suppliers -----
  const suppliers = objects(wb.suppliers).filter((s) => s.API).map((s) => {
    const last = toDay(s["Last audit"]), next = toDay(s["Next audit"]) ?? (last ? addMonths(last, 36) : null);
    return { ...s, last, next, productKey: productOf(prod, `${s["Finished product"]} ${s.API}`), refs: refsIn(s["Change control"]),
      auditStatus: next == null ? "No audit date" : next < now ? "Audit overdue" : next - 90 * DAY < now ? "Audit due ≤90 d" : "In date" };
  });

  // ----- rejections, batches, WIP -----
  const rejections = objects(wb.rejections).filter((r) => r["Report no"]).map((r) => {
    const suffix = (String(r["Report no"]).match(/-\d{2}([A-Z]{2})$/) ?? [])[1] ?? "";
    const kind = { MP: "Raw material", PV: "Bulk product", PS: "Packed / semi-finished", PI: "Intermediate", PF: "Finished product" }[suffix] ?? "Other";
    return { ...r, kind, productKey: productOf(prod, r.Product), qty: num(r.Quantity), refs: refsIn(r["Deviation / CAPA"]), open: !/approved|destroy|cancel|closed/i.test(r.Status ?? "") };
  });
  const rejectedBatches = new Set(rejections.filter((r) => r.kind !== "Raw material").map((r) => String(r.Batch)));

  const ymd = (v) => toDay(v);
  const batches = objects(wb.batches).filter((b) => b.Product && b["Batch no"] && !/^\s*(sub-?)?total/i.test(b.Product)).map((b) => {
    const d = (k) => ymd(b[k]);
    const flag = (v) => { const s = String(v ?? "").trim(); return s && !/^(n\/?a|na|-|\s*)$/i.test(s) ? s : null; };
    const yieldOf = (k) => { const v = num(b[k]); return v != null && v > 0 && v <= 1.5 ? v : null; };
    const endMfg = d("End coating") ?? d("End compression") ?? d("End granulation");
    const release = d("Physical release") ?? d("ERP release");
    const rejected = rejectedBatches.has(String(b["Batch no"])) || /reject|rebut/i.test(b.Status ?? "");
    const mfg = d("Mfg date") ?? d("Start manufacturing");
    let stage = clean(b.Status) || (rejected ? "Rejected" : release ? "Released" : d("BPR handover") || d("End packaging") ? "Packed" : d("BMR handover") || endMfg ? "Manufactured" : d("Start manufacturing") ? "In manufacturing" : "Planned");
    const oos = flag(b.OOS), deviation = flag(b.Deviation);
    const span = (a, z) => (a != null && z != null && z >= a && z - a < 400 * DAY ? daysBetween(a, z) : null);
    return {
      ...b, productKey: productOf(prod, `${b.Product} ${b["Product code"] ?? ""}`) || clean(b.Product).split(/\s+/)[0].toUpperCase(),
      mfg, endMfg, release, stage, rejected, oos, deviation, refs: refsIn(`${b.OOS ?? ""} ${b.Deviation ?? ""} ${b["Change control"] ?? ""}`),
      yields: { granulation: yieldOf("Granulation yield"), compression: yieldOf("Compression yield"), manufacturing: yieldOf("Manufacturing yield"), packaging: yieldOf("Packaging yield") },
      ct: { production: span(endMfg, d("BMR handover")), packaging: span(d("End packaging"), d("BPR handover")), qa: span(d("BPR handover"), release), total: span(d("Start manufacturing"), release) },
      rft: !rejected && !oos && !deviation,
      isValidation: /valid/i.test(b["Batch type"] ?? ""), isCommercial: /comm?ercial|routine/i.test(`${b.Purpose ?? ""} ${b["Batch type"] ?? ""}`),
      month: mfg != null ? monthKey(mfg) : "",
    };
  });

  const wip = objects(wb.wip).filter((w) => w.Product).map((w) => {
    const tf = toDay(w["Time frame"]);
    const mfg = toDay(w["Mfg date"]);
    const st = `${w.Status ?? ""} ${w.Remark ?? ""}`;
    const cat = /reject/i.test(st) ? "Under rejection" : /capa|decision|investig|hold|attente/i.test(st) ? "On hold / investigation" : /waiting|attente/i.test(st) ? "Waiting next step" : /conforme|released/i.test(st) ? "Conforming – in process" : "In process";
    return { ...w, productKey: productOf(prod, w.Product) || clean(w.Product).split(/\s+/)[0].toUpperCase(), qty: num(w.Quantity), tf, mfg,
      daysToTf: tf != null ? daysBetween(now, tf) : null, exceeded: tf != null && tf < now, ageDays: mfg != null ? daysBetween(mfg, now) : null,
      refs: refsIn(`${w["Deviation / CAPA"] ?? ""} ${w.Remark ?? ""}`), cat };
  });

  // ----- product lifecycle -----
  const productNames = [...new Set([...prod.map((p) => p.Product), ...batches.map((b) => b.productKey)].filter(Boolean))];
  const lifecycle = productNames.map((name) => {
    const cat = prod.find((p) => p.Product === name) ?? {};
    const bs = batches.filter((b) => b.productKey === name).sort((a, b) => (a.mfg ?? 0) - (b.mfg ?? 0));
    const recs = m.records.filter((r) => r.productKey === name);
    const api = suppliers.filter((s) => s.productKey === name);
    const pv = bs.filter((b) => b.isValidation);
    let phase;
    if (bs.some((b) => b.isCommercial)) phase = "Commercial";
    else if (pv.length >= 3 && pv.every((b) => b.stage === "Released")) phase = "Process validated";
    else if (bs.length) phase = "Registration / validation batches";
    else if (/pipeline/i.test(cat.Status ?? "")) phase = "Pipeline";
    else if (/marketed/i.test(cat.Status ?? "")) phase = "Marketed – no batch recorded";
    else phase = "Pipeline";
    const ys = (k) => bs.map((b) => b.yields[k]).filter((v) => v != null);
    return {
      name, api: cat.API ?? api[0]?.API ?? "", strengths: cat.Strengths ?? "", form: cat["Dosage form"] ?? "", oeb: cat.OEB ?? null, catalogStatus: cat.Status ?? "",
      phase, batches: bs, pvBatches: pv.length, released: bs.filter((b) => b.stage === "Released").length, rejected: bs.filter((b) => b.rejected).length,
      first: bs[0]?.mfg ?? null, last: bs.at(-1)?.mfg ?? null, records: recs, registered: api.some((s) => s.Registered === "Yes"), suppliers: api,
      wip: wip.filter((w) => w.productKey === name), rejections: rejections.filter((r) => r.productKey === name),
      yield: { granulation: avg(ys("granulation")), compression: avg(ys("compression")), manufacturing: avg(ys("manufacturing")), packaging: avg(ys("packaging")) },
      rft: bs.length ? bs.filter((b) => b.rft).length / bs.length : null,
    };
  }).filter((p) => p.batches.length || p.catalogStatus || p.records.length);

  // ----- APQR schedule -----
  const apqr = objects(wb.apqr).filter((a) => a.Product).map((a) => {
    const due = toDay(a["Due date"]);
    const approved = toDay(a["Approved on"]);
    const status = approved ? "Approved" : due != null && due < now ? "Overdue" : a.Status || "Planned";
    return { ...a, due, approved, status, start: toDay(a["Period start"]), end: toDay(a["Period end"]), onTime: approved && due ? approved <= due : null };
  });

  // ----- 5S weekly audits -----
  const fives = objects(wb.fives).filter((f) => f.Area || f["Audit ID"]).map((f) => {
    const scores = String(f.Scores ?? "").split(",").map((x) => (x.trim() === "" || x.trim() === "-" ? null : +x));
    const per = {};
    for (const [key] of FIVES) {
      const xs = scores.filter((_, i) => FIVES_ITEMS[i] === key).filter((v) => v != null && !isNaN(v));
      per[key] = xs.length ? xs.reduce((a, b) => a + b, 0) / (2 * xs.length) : null;
    }
    const all = scores.filter((v) => v != null && !isNaN(v));
    const date = toDay(f.Date);
    const due = toDay(f.Due);
    return { ...f, scores, per, total: all.length ? all.reduce((a, b) => a + b, 0) / (2 * all.length) : null, date, due,
      actionOpen: Boolean(f.Actions) && !/closed|done/i.test(f["Action status"] ?? ""), actionOverdue: Boolean(f.Actions) && !/closed|done/i.test(f["Action status"] ?? "") && due != null && due < now,
      week: f.Week || (date != null ? isoWeek(date) : "") };
  }).sort((a, b) => (b.date ?? 0) - (a.date ?? 0));

  // ----- GMP activity register (catalogue + entries recorded in the app) -----
  const latest = (xs) => xs.filter((x) => x != null).reduce((a, b) => Math.max(a, b), -Infinity);
  const lastBy = {
    review: toDay(review?.meeting?.date),
    apqr: latest(apqr.map((a) => a.approved)),
    batches: latest(batches.map((b) => b.release)),
    deviations: latest(m.records.filter((r) => r.type === "Deviation").map((r) => r.closed)),
    capa: latest(m.records.filter((r) => r.type === "CAPA").map((r) => r.closed)),
    cc: latest(m.records.filter((r) => r.type === "Change Control").map((r) => r.closed)),
    audits: latest(m.records.filter((r) => r.type === "Audit Finding").map((r) => r.opened)),
    suppliers: latest(suppliers.map((s) => s.last)),
    training: latest(training.map((t) => t.done)),
    fives: latest(fives.map((f) => f.date)),
    calibration: latest(calplan.map((c) => c.done)),
    validation: latest(validation.map((v) => v.done)),
    wip: wip.length ? now : null,
    sops: latest(m.sops.map((s) => toDay(s["Effective date"]))),
  };
  const entries = objects(wb.qaact);
  const qaact = [...QA_ACTIVITIES.map(([id, activity, category, reference, freq, link]) => ({ id, activity, category, reference, freq, link, builtIn: true })),
    ...entries.filter((e) => e["Activity ID"] && !QA_ACTIVITIES.some((q) => q[0] === e["Activity ID"])).map((e) => ({ id: e["Activity ID"], activity: e.Activity, category: e.Category || "Other", reference: e.Reference, freq: num(e["Frequency (months)"]) ?? 12, link: null, builtIn: false }))]
    .map((a) => {
      const e = entries.find((x) => x["Activity ID"] === a.id);
      const recorded = toDay(e?.["Last performed"]);
      const auto = a.link && Number.isFinite(lastBy[a.link]) ? lastBy[a.link] : null;
      const last = recorded ?? auto ?? null;
      const freq = num(e?.["Frequency (months)"]) ?? a.freq;
      const nextDue = toDay(e?.["Next due"]) ?? (last != null && freq > 0 ? (freq < 1 ? last + Math.round(freq * 30.4) * DAY : addMonths(last, freq)) : null);
      const status = freq === 0 ? (last != null ? "Continuous" : "Not recorded") : last == null && nextDue == null ? "Not recorded" : nextDue != null && nextDue < now ? "Overdue" : nextDue != null && nextDue - 30 * DAY < now ? "Due ≤30 d" : "In date";
      return { ...a, activity: e?.Activity || a.activity, category: e?.Category || a.category, reference: e?.Reference || a.reference, owner: e?.Owner ?? "", evidence: e?.Evidence ?? "",
        comment: e?.Comment ?? "", freq, last, lastSource: recorded != null ? "recorded" : auto != null ? "auto" : null, nextDue, status, entry: e ?? null };
    });

  // ----- manual metric values -----
  const metricValues = objects(wb.metrics).filter((x) => x.Metric && x.Period);

  m.x = { training, calplan, validation, suppliers, rejections, batches, wip, lifecycle, apqr, fives, qaact, metricValues };
  return m;
}

export function isoWeek(ts) {
  const d = new Date(ts);
  const day = (d.getUTCDay() + 6) % 7;
  const th = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day + 3));
  const y = th.getUTCFullYear();
  const wk = 1 + Math.round(((th - Date.UTC(y, 0, 4)) / DAY - 3 + ((new Date(Date.UTC(y, 0, 4)).getUTCDay() + 6) % 7)) / 7);
  return `${y}-W${String(wk).padStart(2, "0")}`;
}

// ---------- QMS metrics ----------
const ratio = (num, den) => (den ? { value: num / den, num, den } : { value: null, num, den });

/** Value of one metric in a period. Returns { value, num, den, n?, src, comment }. */
export function metricValue(m, id, p) {
  const def = METRICS.find((x) => x.id === id);
  const x = m.x;
  const asOf = Math.min(p.end - DAY, m.now);
  const manual = x.metricValues.filter((v) => v.Metric === id && v.Period === p.label).at(-1);
  if (manual) {
    const n = num(manual.Numerator), d = num(manual.Denominator), v = num(manual.Value);
    return { value: v != null ? (def?.unit === "%" && v > 1 ? v / 100 : v) : d ? n / d : n, num: n, den: d, src: "manual", comment: manual.Comment ?? "", entry: manual };
  }
  if (def?.src === "manual") return { value: null, src: "manual", comment: "" };
  const devs = m.records.filter((r) => r.type === "Deviation" && inP(r.opened, p));
  const batchesP = x.batches.filter((b) => inP(b.mfg, p));
  const closedIn = (type) => m.records.filter((r) => r.type === type && r.status === "Completed" && inP(r.closed, p) && r.closedLate != null);
  const onTime = (list) => ratio(list.filter((r) => r.closedLate === 0).length, list.length);
  switch (id) {
    case "dev_total": return { ...ratio(devs.length, batchesP.length), src: "auto" };
    case "dev_critical": return { ...ratio(devs.filter((r) => r.classification === "Critical").length, batchesP.length), src: "auto" };
    case "dev_major": return { ...ratio(devs.filter((r) => r.classification === "Major").length, batchesP.length), src: "auto" };
    case "dev_repeat": {
      // a deviation repeats when it shares a root cause with one opened in the 12 months before it
      const causes = (r) => String(r.rootCause ?? "").toLowerCase().split(/\s*,\s*/).filter(Boolean);
      const all = m.records.filter((r) => r.type === "Deviation" && r.rootCause);
      const rep = devs.filter((r) => r.rootCause && all.some((o) => o !== r && o.opened != null && o.opened < r.opened && o.opened >= r.opened - 365 * DAY && causes(o).some((c) => causes(r).includes(c))));
      return { ...ratio(rep.length, devs.length), src: "auto" };
    }
    case "dev_ontime": return { ...onTime(closedIn("Deviation")), src: "auto" };
    case "batch_accept": return { ...ratio(batchesP.filter((b) => !b.rejected).length, batchesP.length), src: "auto" };
    case "rft": return { ...ratio(batchesP.filter((b) => b.rft).length, batchesP.length), src: "auto" };
    case "capa_ontime": return { ...onTime(closedIn("CAPA")), src: "auto" };
    case "cc_ontime": return { ...onTime(closedIn("Change Control")), src: "auto" };
    case "find_ontime": return { ...onTime(closedIn("Audit Finding")), src: "auto" };
    case "pqr_ontime": { const due = x.apqr.filter((a) => inP(a.due, p)); return { ...ratio(due.filter((a) => a.onTime).length, due.length), src: "auto" }; }
    case "sop_ontime": { const w = m.sops.filter((s) => s.next != null); return { ...ratio(w.filter((s) => s.next >= asOf).length, w.length), src: "auto" }; }
    case "sop_overdue": { const n = m.sops.filter((s) => s.next != null && s.next < asOf).length; return { value: n, num: n, src: "auto" }; }
    case "cc_actions_ontime": {
      const acts = m.actions.filter((a) => /change/i.test(a.parentType) && a.closed != null && inP(a.closed, p) && a.closedLate != null);
      return { ...ratio(acts.filter((a) => a.closedLate === 0).length, acts.length), src: "auto" };
    }
    case "vmp": { const due = x.validation.filter((v) => v.start != null && v.start <= asOf && !/cancel/i.test(v.status)); return { ...ratio(due.filter((v) => v.done != null).length, due.length), src: "auto" }; }
    case "cal_compliance": { const due = x.calplan.filter((c) => c.start != null && c.start <= asOf); return { ...ratio(due.filter((c) => c.done != null).length, due.length), src: "auto" }; }
    case "gmp_training": { const due = x.training.filter((t) => ["GMP", "HSE"].includes(t.Type) && t.planned != null && t.planned <= asOf && t.status !== "Cancelled"); return { ...ratio(due.filter((t) => t.done != null).length, due.length), src: "auto" }; }
    case "training_plan": { const due = x.training.filter((t) => t.planned != null && t.planned <= asOf && t.status !== "Cancelled"); return { ...ratio(due.filter((t) => t.done != null).length, due.length), src: "auto" }; }
    case "ct_production": case "ct_packaging": case "ct_qa": {
      const k = { ct_production: ["production", "BMR handover"], ct_packaging: ["packaging", "BPR handover"], ct_qa: ["qa", "release"] }[id];
      const xs = x.batches.filter((b) => b.ct[k[0]] != null && inP(k[1] === "release" ? b.release : toDay(b[k[1]]), p)).map((b) => b.ct[k[0]]);
      return { value: avg(xs), num: xs.length, src: "auto", n: xs.length };
    }
    case "fives": { const xs = x.fives.filter((f) => inP(f.date, p) && f.total != null).map((f) => f.total); return { value: avg(xs), num: xs.length, src: "auto", n: xs.length }; }
    case "wip_hold": { const n = x.wip.filter((w) => w.tf != null && w.tf < asOf).length; return { value: n, num: n, src: "auto" }; }
    default: return { value: null, src: def?.src ?? "auto" };
  }
}

/** 3 on target, 2 watch, 1 action, 0 no data. */
export function metricStatus(def, v) {
  if (v == null || isNaN(v)) return 0;
  const t = def.target;
  if (def.dir === "zero") return v <= 0 ? 3 : 1;
  if (def.dir === "max") return v >= t ? 3 : v >= t * 0.9 ? 2 : 1;
  return v <= t ? 3 : v <= (t === 0 ? 0 : t * 1.5) ? 2 : 1;
}
