// Calculations for the operational QA domains beyond the master workbook:
// training plan, calibration program, validation schedule, API suppliers, batch
// lifecycle and cycle times, WIP and rejections, APQR, 5S audits, the GMP activity
// register and the quarterly QMS metrics. Pure functions over the model + raw tables.
import { objects, clean, toDay, addMonths, monthStart, monthKey, daysBetween, countBy } from "./model.js";
import { METRICS, QA_ACTIVITIES, FIVES, FIVES_ITEMS, fivesKey, fivesRating, RISK_FREQUENCY, FREQUENCY_DAYS, APQR_PHASES, APQR_STREAMS, APQR_SECTIONS, SOP_TOPICS } from "./catalogs.js";
import { sopKey, topicsOf } from "./sopkit.js";

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

  const fivesX = buildFives(m, wb);
  const fives = fivesX.audits;
  const apqrProg = buildApqrProgramme(m, wb, apqr);
  const sopx = buildSopLibrary(m, wb);

  // ----- GMP activity register (catalogue + entries recorded in the app) -----
  const latest = (xs) => xs.filter((x) => x != null).reduce((a, b) => Math.max(a, b), -Infinity);
  const lastBy = {
    review: toDay(review?.meeting?.date),
    apqr: latest([...apqr.map((a) => a.approved), ...apqrProg.tasks.map((t) => t.closed)]),
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

  m.x = { training, calplan, validation, suppliers, rejections, batches, wip, lifecycle, apqr, apqrProg, sopx, fives, fivesX, qaact, metricValues };
  return m;
}

// ---------- 5S audits ----------
const lc = (v) => String(v ?? "").trim().toLowerCase();
/** Generic checklist (catalogue) as items {no, key, category, criterion}. */
export const GENERIC_CHECKLIST = FIVES.flatMap(([key, en, fr, items], g) => items.map(([ien, ifr], i) => ({ no: g * items.length + i + 1, key, category: en, categoryFr: fr, criterion: ien, criterionFr: ifr })));
/** Area keywords used to find the rooms of an area when none are linked ("Compression" → rooms named "…compression…"). */
const areaWords = (name) => lc(name).split(/[^a-zà-ÿ]+/).filter((w) => w.length >= 5).map((w) => w.replace(/(es|s)$/, ""));

export function buildFives(m, wb) {
  const now = m.now;
  const templates = new Map();
  for (const t of objects(wb.fivesTpl ?? { cols: [], rows: [] }).filter((t) => t.Area && t.Criterion)) {
    const k = lc(t.Area);
    if (!templates.has(k)) templates.set(k, []);
    templates.get(k).push({ no: num(t.No), key: fivesKey(t.Category), category: t.Category, criterion: t.Criterion });
  }
  for (const list of templates.values()) list.sort((a, b) => (a.no ?? 0) - (b.no ?? 0));
  const checklistOf = (name) => templates.get(lc(name)) ?? GENERIC_CHECKLIST;

  const areaRows = objects(wb.fivesAreas ?? { cols: [], rows: [] }).filter((a) => a.Area);
  const roomsOf = (a) => {
    const linked = String(a.Rooms ?? "").split(/[,;\s]+/).filter((c) => m.roomByCode.has(c));
    if (linked.length) return { codes: linked, auto: false };
    const words = areaWords(a.Area);
    return { codes: words.length ? m.rooms.filter((r) => words.some((w) => lc(r.Name).includes(w))).map((r) => r.Code) : [], auto: true };
  };
  const areaInfo = areaRows.map((a) => ({ ...a, key: lc(a.Area), ...(({ codes, auto }) => ({ rooms: codes, roomsAuto: auto }))(roomsOf(a)) }));
  // an audit belongs to the area it names, or to the area whose rooms include the room code it starts with
  const areaKeyOf = (name) => {
    const k = lc(name);
    if (areaInfo.some((a) => a.key === k)) return k;
    const code = String(name ?? "").split(/\s*·\s*|\s+/)[0];
    return areaInfo.find((a) => a.rooms.includes(code))?.key ?? k;
  };

  const audits = objects(wb.fives).filter((f) => f.Area || f["Audit ID"]).map((f) => {
    const scale = num(f.Scale) ?? 2;
    const scores = String(f.Scores ?? "").split(",").map((x) => (x.trim() === "" || x.trim() === "-" ? null : +x));
    const list = f.Checklist ? checklistOf(f.Checklist) : scores.length === GENERIC_CHECKLIST.length ? GENERIC_CHECKLIST : checklistOf(f.Area);
    const keyAt = (i) => list[i]?.key ?? FIVES_ITEMS[i] ?? null;
    const per = {};
    for (const [key] of FIVES) {
      const xs = scores.filter((v, i) => keyAt(i) === key && v != null && !isNaN(v));
      per[key] = xs.length ? xs.reduce((a, b) => a + b, 0) / (scale * xs.length) : null;
    }
    const all = scores.filter((v) => v != null && !isNaN(v));
    const total = all.length ? all.reduce((a, b) => a + b, 0) / (scale * all.length) : null;
    const date = toDay(f.Date);
    const due = toDay(f.Due);
    const open = Boolean(f.Actions) && !/closed|done/i.test(f["Action status"] ?? "");
    return { ...f, scale, scores, list, per, total, rating: fivesRating(total), date, due, areaKey: areaKeyOf(f.Area), answered: all.length,
      actionOpen: open, actionOverdue: open && due != null && due < now, week: f.Week || (date != null ? isoWeek(date) : "") };
  }).sort((a, b) => (b.date ?? 0) - (a.date ?? 0));

  const findings = objects(wb.fivesItems ?? { cols: [], rows: [] }).filter((i) => i["Audit ID"]).map((i) => {
    const due = toDay(i.Due);
    const open = !/closed|done|complete/i.test(i.Status ?? "");
    return { ...i, due, open, overdue: open && due != null && due < now, closedOn: toDay(i["Closed on"]), key: fivesKey(i.Category), score: num(i.Score), areaKey: areaKeyOf(i.Area),
      date: audits.find((a) => a["Audit ID"] === i["Audit ID"])?.date ?? null };
  });

  // schedule: the risk class sets the frequency; the next audit is due one interval after the last one
  const seen = new Set(areaInfo.map((a) => a.key));
  const extra = [...new Set(audits.map((a) => a.areaKey))].filter((k) => !seen.has(k)).map((k) => ({ Area: audits.find((a) => a.areaKey === k).Area, key: k, rooms: [], roomsAuto: true, extra: true }));
  const areas = [...areaInfo, ...extra].map((a) => {
    const frequency = a.Frequency || RISK_FREQUENCY[a.Risk] || "Monthly";
    const days = FREQUENCY_DAYS[frequency] ?? 30;
    const done = audits.filter((x) => x.areaKey === a.key);
    const last = done[0] ?? null;
    const next = last?.date != null ? last.date + days * DAY : null;
    const status = last?.date == null ? "Never audited" : next < now ? "Overdue" : next - now <= 7 * DAY ? "Due ≤7 d" : "Scheduled";
    const fs = findings.filter((x) => x.areaKey === a.key);
    return { ...a, frequency, days, audits: done, last, next, status, score: last?.total ?? null, rating: last?.rating ?? null,
      trend: done.slice(0, 10).map((x) => x.total).reverse(), checklist: checklistOf(a.Area), findings: fs, openFindings: fs.filter((x) => x.open) };
  });
  // room-level 5S figures for the facility map
  for (const r of m.rooms) { r.fivesScore = null; r.fivesOpen = 0; }
  for (const a of areas) for (const code of a.rooms) { const r = m.roomByCode.get(code); if (!r) continue; if (a.score != null && (r.fivesScore == null || a.score < r.fivesScore)) r.fivesScore = a.score; r.fivesOpen += a.openFindings.length; }
  return { audits, findings, areas, templates, checklistOf };
}

// ---------- APQR programme ----------
/** Product names across the annual plan, the Scigeniq plan and tasks ("… (30 TAB)-ELKENDI") → one key. */
export const normProduct = (s) => String(s ?? "").toUpperCase().replace(/\s*-\s*ELKENDI\s*$/, "").replace(/,/g, ".").replace(/[^A-Z0-9.%/]+/g, "");
const mmyyyy = (v) => { const x = String(v ?? "").match(/^(\d{1,2})\/(\d{4})$/); return x ? Date.UTC(+x[2], +x[1] - 1, 1) : monthTs(v); };
const monthEnd = (ts) => (ts == null ? null : addMonths(ts, 1) - DAY);
export const APQR_DEPTS = ["QA", "QC", "Production", "RA", "Validation"];

export function buildApqrProgramme(m, wb, records = [], { lagDays = 90 } = {}) {
  // task status is known as of the Scigeniq export, so overdue and due-soon are measured at that date (as the tracker does)
  const asOf = toDay(m.meta.apqrAsOf);
  const now = asOf != null ? Math.min(asOf, m.now) : m.now;
  const none = { cols: [], rows: [] };
  const plan = objects(wb.apqrPlan ?? none).filter((p) => p.Product).map((p) => ({ ...p, key: normProduct(p.Product), planned: monthTs(p["Planned month"]), start: monthTs(p["Period start"]), end: monthEnd(monthTs(p["Period end"])) }));
  const sys = objects(wb.apqrSys ?? none).filter((p) => p.Product).map((p) => ({ ...p, key: normProduct(p.Product), start: mmyyyy(p["Review start"]), end: toDay(p["Period end"]) ?? monthEnd(mmyyyy(p["Review end"])) }));
  const allTasks = objects(wb.apqrTasks ?? none).filter((t) => t["Reference ID"] && t.Product).map((t) => {
    const due = toDay(t.Due), created = toDay(t.Created), closed = toDay(t["Closed On"]);
    const done = /^closed$/i.test(t.Closure ?? "") || /^(completed|closed)/i.test(t.Status ?? "") || closed != null;
    const stream = t["Data Stream"] || "—";
    const isWorkflow = /apqr workflow/i.test(stream) || /^apqr$/i.test(t["Task Type"] ?? "");
    return { ...t, key: normProduct(t.Product), due, created, closed, done, open: !done, overdue: !done && due != null && due < now, sysOverdue: /overdue/i.test(t.Status ?? ""),
      stream, dept: t.Department || APQR_STREAMS[stream]?.[0] || "—", isWorkflow, inferred: /inferred/i.test(t.Status ?? ""), lastSeen: toDay(t["Last seen"]),
      // Scigeniq has no cancel: a duplicate workflow is renamed "Duplicated" and its tasks point to "Task - Duplicated"
      dupFlag: (isWorkflow && /^duplicat/i.test(t["Task Title"] ?? "")) || /duplicat/i.test(t["Parent action"] ?? ""),
      unassigned: !t["Assigned User"] || /unassigned/i.test(t["Assigned User"]), ageDays: !done && created != null ? daysBetween(created, now) : null,
      daysToDue: !done && due != null ? daysBetween(now, due) : null, onTime: done && due != null && closed != null ? closed <= due : null, month: due != null ? monthKey(due) : "" };
  });
  const dupRefs = new Set(allTasks.filter((t) => t.dupFlag && t.isWorkflow).map((t) => t["Reference ID"]));
  for (const t of allTasks) t.dupWf = t.dupFlag || dupRefs.has(t["Reference ID"]);
  // tasks of workflows flagged as duplicates are kept apart: they are cancelled work, not progress
  const tasks = allTasks.filter((t) => !t.dupWf), dupTasks = allTasks.filter((t) => t.dupWf);
  const sectionRows = objects(wb.apqrSections ?? none).filter((x) => x.Product && x.Section).map((x) => ({ ...x, key: normProduct(x.Product), sec: String(x.Section).trim().toLowerCase() }));
  const recs = records.map((r) => ({ ...r, key: normProduct(r.Product) }));
  const streams = [...new Set(tasks.map((t) => t.stream))].sort((a, b) => Object.keys(APQR_STREAMS).indexOf(a) - Object.keys(APQR_STREAMS).indexOf(b));
  const keys = [...new Set([...plan, ...sys, ...tasks, ...dupTasks].map((x) => x.key))];
  const products = keys.map((key) => {
    const p = plan.find((x) => x.key === key), s = sys.find((x) => x.key === key);
    const ts = tasks.filter((t) => t.key === key), dts = dupTasks.filter((t) => t.key === key);
    const wf = ts.filter((t) => t.isWorkflow);
    const refs = [...new Set(wf.map((t) => t["Reference ID"]))];
    const main = [...wf].sort((a, b) => (a.done - b.done) || (a.due ?? 9e15) - (b.due ?? 9e15))[0] ?? null;
    const start = p?.start ?? s?.start ?? null, end = p?.end ?? s?.end ?? null;
    const reportDue = end != null ? end + lagDays * DAY : null;
    const total = ts.length, completed = ts.filter((t) => t.done).length, overdue = ts.filter((t) => t.overdue).length;
    const pct = total ? completed / total : 0;
    const rec = recs.filter((r) => r.key === key).sort((a, b) => (b.approved ?? 0) - (a.approved ?? 0))[0] ?? null;
    const approved = rec?.approved ?? null;
    const dataTasks = ts.filter((t) => !t.isWorkflow);
    const dataDone = dataTasks.length > 0 && dataTasks.every((t) => t.done);
    const wfDue = main?.due ?? null;
    const rag = !total ? "No tasks" : pct === 1 ? "Complete" : overdue ? "Overdue" : wfDue != null && wfDue - now <= 14 * DAY ? "Due soon" : "On track";
    const track = approved ? "Approved" : !total ? (!s ? "Not in Scigeniq plan" : reportDue != null && reportDue < now ? "Not triggered – past due" : reportDue != null && reportDue - now <= 60 * DAY ? "Not triggered – due ≤60 d" : "Not yet triggered")
      : pct === 1 ? "Data collection complete" : "In progress";
    let phase = approved ? 7 : !total ? (s ? 1 : 0) : main?.done ? 7 : -1;
    if (phase < 0) {
      const stage = main?.["Workflow Stage"] ?? "";
      phase = APQR_PHASES.findIndex(([, , , re], i) => i >= 2 && i < 7 && re && re.test(stage));
      if (phase < 0) phase = 3;
      if (phase === 3 && dataDone) phase = 4;
    }
    // the owner's workflow task stays open until closure, so only data tasks count towards the bottleneck
    const openBy = Object.fromEntries(APQR_DEPTS.map((d) => [d, dataTasks.filter((t) => t.open && t.dept === d).length]));
    const top = Object.entries(openBy).sort((a, b) => b[1] - a[1])[0];
    const streamState = Object.fromEntries(streams.map((st) => { const xs = ts.filter((t) => t.stream === st); return [st, !xs.length ? null : xs.every((t) => t.done) ? "done" : xs.some((t) => t.overdue) ? "overdue" : "open"]; }));
    const name = (p?.Product ?? s?.Product ?? ts[0]?.Product ?? dts[0]?.Product ?? key).replace(/\s*-\s*ELKENDI\s*$/i, "");
    const sites = [...countBy(ts.concat(dts), (t) => t.Site || "")].filter(([x]) => x).sort((a, b) => b[1] - a[1]);
    // EU GMP Ch.1.10 sections (i–xii) as tracked in the app; the last saved entry of each section counts
    const secs = APQR_SECTIONS.map(([id]) => ({ id, ...(sectionRows.filter((x) => x.key === key && x.sec === id).at(-1) ?? {}) }));
    const secDone = secs.filter((x) => /complete|not applicable/i.test(x.Status ?? "")).length;
    return {
      key, name, code: p?.Code ?? null, form: p?.["Dosage form"] || s?.Process || ts[0]?.["Dosage Form"] || "—", inPlan: Boolean(p), inSys: Boolean(s), offPlan: !p && !s,
      planned: p?.planned ?? null, start, end, prevReport: p?.["Previous report"] ?? null, period: p ? `${p["Period start"] ?? "?"} → ${p["Period end"] ?? "?"}` : s ? `${s["Review start"]} → ${s["Review end"]}` : "",
      reportDue, daysToReportDue: reportDue != null ? daysBetween(now, reportDue) : null, tasks: ts, refs, duplicate: refs.length > 1, owner: main?.["Assigned User"] ?? null,
      stage: main?.["Workflow Stage"] ?? null, wfDue, wfCreated: main?.created ?? null, total, completed, open: total - completed, overdue, pct, rag, track, phase,
      openBy, bottleneck: top && top[1] > 0 ? top[0] : null, streamState, record: rec, approved, triggered: total > 0,
      site: sites[0]?.[0] ?? (p || s ? "ELKENDI" : null), sysStatus: s?.["Plan status"] ?? null, sysSite: s?.Site ?? null, planComment: p?.Comment ?? null,
      productLabel: ts[0]?.Product ?? dts[0]?.Product ?? p?.Product ?? s?.Product ?? name, mainRef: main?.["Reference ID"] ?? refs[0] ?? null, dupTasks: dts, dupRefs: [...new Set(dts.filter((t) => t.isWorkflow).map((t) => t["Reference ID"]))],
      inferred: ts.filter((t) => t.inferred).length, lastSeen: ts.reduce((a, t) => Math.max(a, t.lastSeen ?? -Infinity), -Infinity),
      sections: secs, sectionPct: secDone / APQR_SECTIONS.length, sectionsStarted: secs.some((x) => x.Status),
    };
  }).sort((a, b) => (a.planned ?? 9e15) - (b.planned ?? 9e15) || a.name.localeCompare(b.name));
  const users = apqrUsers(tasks);
  for (const p of products) if (!Number.isFinite(p.lastSeen)) p.lastSeen = null;
  const sites = [...countBy(tasks, (t) => t.Site || "")].filter(([x]) => x).sort((a, b) => b[1] - a[1]).map(([x]) => x);
  return { plan, sys, tasks, dupTasks, products, streams, users, sites, lagDays, asOf, refDate: now };
}

/** Workload per assignee over a list of APQR tasks, most overdue first. */
export function apqrUsers(tasks) {
  return [...new Set(tasks.map((t) => t["Assigned User"] || "Unassigned"))].map((u) => {
    const xs = tasks.filter((t) => (t["Assigned User"] || "Unassigned") === u);
    const open = xs.filter((t) => t.open);
    return { user: u, total: xs.length, completed: xs.length - open.length, open: open.length, overdue: xs.filter((t) => t.overdue).length, pct: xs.length ? (xs.length - open.length) / xs.length : 0,
      earliest: open.map((t) => t.due).filter((d) => d != null).sort((a, b) => a - b)[0] ?? null };
  }).sort((a, b) => b.overdue - a.overdue || b.open - a.open);
}

// ---------- SOP library ----------
/** Drive folder id from a folder URL ("…/drive/folders/<id>") or the id itself. */
export const folderIdOf = (v) => String(v ?? "").match(/folders\/([\w-]{10,})/)?.[1] ?? (String(v ?? "").trim().match(/^[\w-]{10,}$/)?.[0] ?? null);

/**
 * The SOP library with what the app knows about each SOP: the topics (pages) it governs — from its title, or from an
 * explicit link — the SOPs it cites and is cited by, its departments, and its Drive file. Returns
 * { list, byKey, byTopic: Map(topic → SOPs), sources, links }.
 */
export function buildSopLibrary(m, wb) {
  const none = { cols: [], rows: [] };
  const links = objects(wb.sopLinks ?? none).filter((l) => l.Topic && l.SOP);
  const sources = objects(wb.sopSources ?? none).filter((x) => x.Folder).map((x) => ({ ...x, folderId: folderIdOf(x.Folder) }));
  const words = (v) => String(v ?? "").split(/[\s,;]+/).filter(Boolean);
  const LANG = { EN: "English", ENG: "English", FR: "French", FRA: "French", AR: "Arabic" };
  const list = m.sops.map((x) => {
    const s = { ...x, Language: LANG[String(x.Language ?? "").toUpperCase()] ?? x.Language };
    const key = sopKey(s.Code);
    const refs = words(s.References);
    return { ...s, key, topics: topicsOf(s.Title, SOP_TOPICS), refs, refKeys: [...new Set(refs.map(sopKey).filter((k) => k && k !== key))], dist: words(s.Distribution),
      changes: words(s["Change controls"]), inDrive: Boolean(s["Drive ID"]), indexed: Boolean(s.Indexed), files: +s.Files || (s["Drive ID"] ? 1 : 0), citedBy: [] };
  }).sort((a, b) => a.Code.localeCompare(b.Code));
  const byKey = new Map();
  for (const s of list) if (s.key && !byKey.has(s.key)) byKey.set(s.key, s);
  for (const s of list) for (const k of s.refKeys) byKey.get(k)?.citedBy.push(s);
  // an explicit link replaces the title match for its topic
  const linked = new Map();
  for (const l of links) { const s = byKey.get(sopKey(l.SOP)) ?? list.find((x) => x.Code === l.SOP); if (s) { if (!linked.has(l.Topic)) linked.set(l.Topic, []); linked.get(l.Topic).push({ sop: s, link: l }); } }
  const byTopic = new Map(SOP_TOPICS.map(([id]) => [id, linked.has(id) ? linked.get(id).map((x) => x.sop) : list.filter((s) => s.topics.includes(id))]));
  for (const [id, xs] of linked) for (const { sop } of xs) if (!sop.topics.includes(id)) sop.topics = [...sop.topics, id];
  const rank = (s) => (s.Site === "Oncology" ? 0 : 1) * 2 + (s.inDrive ? 0 : 1);
  for (const xs of byTopic.values()) xs.sort((a, b) => rank(a) - rank(b) || a.Code.localeCompare(b.Code));
  return { list, byKey, byTopic, sources, links, linkedTopics: new Set(linked.keys()) };
}

// ---------- process statistics (APQR) ----------
/** Individuals control chart and capability: mean, sigma within (MR̄/1.128) and overall, Cpk / Ppk against optional limits, Nelson-type signals. */
export function capability(xs, lsl, usl) {
  const n = xs.length;
  if (n < 2) return null;
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1));
  const mr = xs.slice(1).map((v, i) => Math.abs(v - xs[i]));
  const sw = mr.reduce((a, b) => a + b, 0) / mr.length / 1.128; // within-subgroup sigma from the average moving range
  const k = (s) => (s > 0 ? Math.min(usl != null ? (usl - mean) / (3 * s) : Infinity, lsl != null ? (mean - lsl) / (3 * s) : Infinity) : null);
  const cpk = lsl == null && usl == null ? null : k(sw), ppk = lsl == null && usl == null ? null : k(sd);
  const ucl = mean + 3 * sw, lcl = mean - 3 * sw;
  // signals: beyond the limits, 8 in a row on one side of the mean, 6 rising or falling in a row
  const sig = xs.map(() => []);
  xs.forEach((v, i) => { if (v > ucl || v < lcl) sig[i].push("1"); });
  for (let i = 7; i < n; i++) { const w = xs.slice(i - 7, i + 1); if (w.every((v) => v > mean) || w.every((v) => v < mean)) sig[i].push("2"); }
  for (let i = 5; i < n; i++) { const w = xs.slice(i - 5, i + 1); const up = w.every((v, j) => !j || v > w[j - 1]), dn = w.every((v, j) => !j || v < w[j - 1]); if (up || dn) sig[i].push("3"); }
  return { n, mean, sd, sw, ucl, lcl, cpk: Number.isFinite(cpk) ? cpk : null, ppk: Number.isFinite(ppk) ? ppk : null, signals: sig };
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
    case "pqr_ontime": {
      const prog = x.apqrProg.products.filter((q) => q.inPlan && inP(q.reportDue, p) && q.reportDue <= asOf);
      if (prog.length) return { ...ratio(prog.filter((q) => q.approved != null && q.approved <= q.reportDue).length, prog.length), src: "auto" };
      const due = x.apqr.filter((a) => inP(a.due, p));
      return { ...ratio(due.filter((a) => a.onTime).length, due.length), src: "auto" };
    }
    case "apqr_tasks_ontime": { const xs = x.apqrProg.tasks.filter((t) => t.done && inP(t.closed, p) && t.onTime != null); return { ...ratio(xs.filter((t) => t.onTime).length, xs.length), src: "auto" }; }
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
