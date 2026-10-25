// Training by job position, as the site's training procedure sets it (pure, no DOM). Planned trainings are the
// department's annual plan; unplanned ones are everything outside it (a new or revised SOP, a quality circle, a deviation,
// OOS or complaint, an external course, a re-training, an induction or a new position…). The training matrix says which
// topics each job position must be trained on; attendance records make each employee's training card. From these: who is
// trained, who is not or on an old revision, who needs re-training, which new SOP revisions still need a training.
import { sopKey, SOP_DEPTS } from "./sopkit.js";

const DAY = 86400000;
export const PASS_MARK = 75; // below it, the trainee is re-trained
export const RETRAIN_WORKING_DAYS = 15; // re-training within 15 working days of the training
export const CARD_WORKING_DAYS = 7; // training cards updated within 7 working days
export const SOP_TRAINING_DAYS = 30; // a new or revised SOP is trained within one month
export const RU_LEVEL = 3; // read & understood from supervisor level up (1 manager … 5 officer)

/** Working days run Sunday to Thursday (Friday and Saturday are the weekend). */
export function addWorkingDays(ts, n) {
  let d = ts, k = 0;
  while (k < n) { d += DAY; const w = new Date(d).getUTCDay(); if (w !== 5 && w !== 6) k++; }
  return d;
}

const norm = (x) => String(x ?? "").toLowerCase().replace(/\s+/g, " ").trim();
/**
 * The positions or names in one cell: "A / B", "A; B", one per line — or, given the known names, those found in running
 * text ("QA Officer QA Senior officer" → both), in the order they appear. Unknown parts are kept as typed.
 */
export function listOf(text, known) {
  const s = String(text ?? "").trim();
  if (!s) return [];
  const parts = s.split(/\s*(?:\/|;|\n|,)\s*/).map((x) => x.trim()).filter(Boolean);
  if (!known?.length) return [...new Set(parts)];
  const K = [...new Set(known)].sort((a, b) => b.length - a.length);
  const out = [];
  for (const p of parts) {
    const exact = K.find((k) => norm(k) === norm(p));
    if (exact) { out.push(exact); continue; }
    let rest = norm(p);
    const found = [];
    for (const k of K) {
      const nk = norm(k);
      let i = rest.indexOf(nk);
      while (i >= 0) {
        const before = i === 0 || rest[i - 1] === " ", after = i + nk.length === rest.length || rest[i + nk.length] === " ";
        if (before && after) { found.push([i, k]); rest = rest.slice(0, i) + "\u0000".repeat(nk.length) + rest.slice(i + nk.length); break; }
        i = rest.indexOf(nk, i + 1);
      }
    }
    if (found.length) out.push(...found.sort((a, b) => a[0] - b[0]).map((x) => x[1])); else out.push(p);
  }
  return [...new Set(out)];
}
export const joinList = (xs) => [...new Set((xs ?? []).filter(Boolean))].join(" / ");
/** What a training is about, to match trainings, records and matrix topics: an SOP's key, else the topic's words. */
export const topicKey = (ref, title) => sopKey(ref) ?? (ref ? norm(ref) : norm(title)) ?? "";

const deptName = (code) => SOP_DEPTS[code]?.[0] ?? code ?? "";
const sameDept = (a, b) => Boolean(a && b) && (norm(a) === norm(b) || norm(deptName(a)) === norm(b) || norm(a) === norm(deptName(b)));
/** A result from what was recorded: the result given, else the score against the pass mark. */
export const resultOf = (r) => r.Result || (r.Score != null && r.Score !== "" ? (+r.Score >= PASS_MARK ? "Complying" : "Re-training") : "N/A");

/**
 * Everything the training pages need. Inputs are the table rows as objects; `dayOf` turns a stored date into a timestamp;
 * `sops` are the SOP library entries ({Code, key, Revision, eff, Title, Department}); `planned` the annual plan rows as the
 * domain builds them ({planned, done, status, Reference, "Attendee group", …}).
 */
export function buildTraining({ positions = [], staff = [], matrix = [], planned = [], unplanned = [], records = [], sops = [], now, dayOf }) {
  const P = positions.filter((p) => p.Position).map((p) => ({ ...p, name: String(p.Position).trim(), level: +p.Level || null, people: [] }));
  const known = [...new Set([...P.map((p) => p.name), ...staff.map((s) => s.Position).filter(Boolean)])];
  for (const p of P) p.readUnderstood = /^y/i.test(p["Read & understood"] ?? "") || (p.level != null && p.level <= RU_LEVEL);
  const posBy = new Map(P.map((p) => [norm(p.name), p]));
  const S = staff.filter((s) => s.Name).map((s) => ({ ...s, name: String(s.Name).trim(), position: listOf(s.Position, known)[0] ?? null, active: !/^(left|long leave)/i.test(s.Status ?? ""),
    hired: dayOf(s["Hired on"]), since: dayOf(s["In position since"]) }));
  for (const s of S) { const p = posBy.get(norm(s.position)); if (p) p.people.push(s); s.pos = p ?? null; s.dept = s.Department || p?.Department || null; }
  const sopBy = new Map(sops.filter((s) => s.key).map((s) => [s.key, s]));

  const Mx = matrix.filter((x) => x.Topic || x.Reference).map((x) => ({ ...x, key: topicKey(x.Reference, x.Topic), sop: sopBy.get(sopKey(x.Reference)) ?? null,
    positions: listOf(x.Positions, known), refresh: +x["Refresh (months)"] || null }));
  const Pl = planned.map((x) => ({ ...x, plan: "Planned", key: topicKey(x.Reference, x.Program), positions: listOf(x["Attendee group"], known), title: x.Program }));
  const Un = unplanned.filter((x) => x.Title || x.Reference || x.Category).map((x) => {
    const sop = sopBy.get(sopKey(x.Reference)) ?? null;
    const date = dayOf(x.Date);
    const auto = /SOP/i.test(x.Category ?? "") && sop?.eff != null ? sop.eff + SOP_TRAINING_DAYS * DAY : null;
    const due = dayOf(x.Due) ?? auto;
    const st = x.Status ?? "";
    const done = /^complet/i.test(st);
    const status = done ? "Completed" : /^cancel/i.test(st) ? "Cancelled" : due != null && due < now ? "Overdue" : date != null && date >= now - DAY ? "Scheduled" : "To schedule";
    return { ...x, plan: "Unplanned", key: topicKey(x.Reference, x.Title), sop, title: x.Title || sop?.Title || x.Reference || "", positions: listOf(x.Positions, known), trainees: listOf(x.Trainees),
      date, due, dueAuto: dayOf(x.Due) == null && auto != null, done, status, onTime: done && due != null && date != null ? date <= due : null };
  });
  const R = records.filter((r) => r.Employee).map((r) => ({ ...r, emp: String(r.Employee).trim(), key: topicKey(r.Reference, r.Title), date: dayOf(r.Date), score: r.Score == null || r.Score === "" ? null : +r.Score, result: resultOf(r) }))
    .sort((a, b) => (a.date ?? 0) - (b.date ?? 0));

  // each person's requirements from the matrix, and where they stand on each
  const latest = new Map();
  for (const r of R) latest.set(`${norm(r.emp)}|${r.key}`, r);
  const people = S.map((s) => {
    const req = Mx.filter((x) => s.position && x.positions.some((p) => norm(p) === norm(s.position)));
    const items = req.map((x) => {
      const r = latest.get(`${norm(s.name)}|${x.key}`) ?? null;
      const rev = x.sop?.Revision;
      const state = !r ? "Not trained" : r.result === "Re-training" ? "Re-training"
        : rev != null && r.Revision != null && r.Revision !== "" && +r.Revision < +rev ? "Old revision"
        : x.refresh && r.date != null && r.date + x.refresh * 30.44 * DAY < now ? "Expired" : "Trained";
      return { topic: x, record: r, state };
    });
    const trained = items.filter((i) => i.state === "Trained").length;
    return { ...s, items, required: items.length, trained, compliance: items.length ? trained / items.length : null, card: R.filter((r) => norm(r.emp) === norm(s.name)).reverse(),
      certificate: items.length > 0 && trained === items.length };
  });
  const personBy = new Map(people.map((p) => [norm(p.name), p]));

  // re-training: an unsuccessful score not followed by a complying record on the same topic
  const retraining = R.filter((r) => r.result === "Re-training" && latest.get(`${norm(r.emp)}|${r.key}`) === r && r.date != null)
    .map((r) => ({ record: r, person: personBy.get(norm(r.emp)) ?? null, due: addWorkingDays(r.date, RETRAIN_WORKING_DAYS), overdue: addWorkingDays(r.date, RETRAIN_WORKING_DAYS) < now }));

  // SOP trainings still to give: SOPs effective in the last year (or about to be), for the positions that must know them
  const sopNeeds = [];
  for (const s of sops) {
    if (s.eff == null || s.eff < now - 365 * DAY || s.eff > now + 60 * DAY || /obsolete/i.test(s.Status ?? "")) continue;
    const mx = Mx.find((x) => x.key === s.key);
    const pos = mx ? mx.positions : P.filter((p) => sameDept(s.Department, p.Department)).map((p) => p.name);
    if (!pos.length) continue;
    const covered = Un.find((u) => u.key === s.key && u.status !== "Cancelled" && ((u.Revision != null && u.Revision !== "" && +u.Revision >= +(s.Revision ?? 0)) || (u.date != null && u.date >= s.eff - 30 * DAY) || (u.date == null && !u.done)))
      ?? Pl.find((p) => p.key === s.key && p.status !== "Cancelled" && p.planned != null && new Date(p.planned).getUTCFullYear() === new Date(s.eff).getUTCFullYear() && p.planned >= s.eff - 31 * DAY);
    const who = people.filter((p) => p.active && pos.some((x) => norm(x) === norm(p.position)));
    const pending = who.filter((p) => !R.some((r) => norm(r.emp) === norm(p.name) && r.key === s.key && r.result !== "Re-training" && (r.Revision == null || r.Revision === "" || +r.Revision >= +(s.Revision ?? 0))));
    if (covered && (covered.done || covered.status === "Completed") && !pending.length) continue;
    sopNeeds.push({ sop: s, category: +(s.Revision ?? 0) <= 1 ? "New SOP" : "Revised SOP", positions: pos, fromMatrix: Boolean(mx), people: who, pending, due: s.eff + SOP_TRAINING_DAYS * DAY,
      overdue: s.eff + SOP_TRAINING_DAYS * DAY < now, covered: covered ?? null });
  }
  sopNeeds.sort((a, b) => a.due - b.due);

  const byPosition = P.map((p) => {
    const ps = people.filter((x) => x.pos === p && x.active);
    const req = Mx.filter((x) => x.positions.some((n) => norm(n) === norm(p.name)));
    const c = ps.filter((x) => x.compliance != null);
    return { ...p, people: ps, required: req, compliance: c.length ? c.reduce((a, x) => a + x.compliance, 0) / c.length : null,
      planned: Pl.filter((x) => x.positions.some((n) => norm(n) === norm(p.name))), unplanned: Un.filter((x) => x.positions.some((n) => norm(n) === norm(p.name))) };
  });
  return { positions: P, known, staff: S, people, personBy, matrix: Mx, planned: Pl, unplanned: Un, records: R, retraining, sopNeeds, byPosition };
}

/** Month by month for one year: planned trainings due and done, unplanned ones done (the monthly achievement report). */
export function monthlyAchievement(T, year) {
  const mk = (ts) => (ts == null ? "" : new Date(ts).toISOString().slice(0, 7));
  return Array.from({ length: 12 }, (_, i) => {
    const k = `${year}-${String(i + 1).padStart(2, "0")}`;
    return { month: k, x: k, planned: T.planned.filter((x) => mk(x.planned) === k && x.status !== "Cancelled").length, plannedDone: T.planned.filter((x) => mk(x.done) === k).length,
      unplannedDone: T.unplanned.filter((x) => x.done && mk(x.date) === k).length, unplannedDue: T.unplanned.filter((x) => mk(x.due) === k && x.status !== "Cancelled").length };
  });
}

/** The yearly training deadlines (month, day): training matrix, risk assessment, annual plan and its approval, basic GMP, lists. */
export const TRAINING_CALENDAR = [["matrix", 12, 1], ["risk", 12, 15], ["plan", 12, 31], ["gmpTopics", 1, 15], ["approval", 1, 31], ["gmpPlan", 1, 31], ["lists", 1, 31]];
export function calendarOf(now) {
  const y = new Date(now).getUTCFullYear();
  return TRAINING_CALENDAR.map(([key, mo, d]) => {
    let at = Date.UTC(y, mo - 1, d);
    if (at < now - DAY) at = Date.UTC(y + 1, mo - 1, d);
    return { key, at, days: Math.ceil((at - now) / DAY) };
  }).sort((a, b) => a.at - b.at);
}

/** Next free id with a prefix and a year: UT-2026-001… */
export function nextTrainingId(ids, prefix, year) {
  const pre = `${prefix}-${year}-`;
  const n = ids.map((x) => String(x ?? "")).filter((x) => x.startsWith(pre)).map((x) => +x.slice(pre.length) || 0);
  return `${pre}${String(Math.max(0, ...n) + 1).padStart(3, "0")}`;
}
