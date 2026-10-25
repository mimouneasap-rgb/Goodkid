// Everything due across the site in one list (pure, no DOM): open quality records and actions, SOP reviews and review
// requests, calibrations, qualifications, training, APQRs and their tasks, 5S audits and findings, GMP activities,
// supplier audits, controlled documents whose index validity ends, WIP hold times, FMEA and improvement actions.
import { toDay } from "./model.js";

const DAY = 86400000;
export const BUCKETS = ["overdue", "week", "month", "quarter"];
/** overdue · ≤7 d · ≤30 d · ≤90 d (null beyond the horizon). */
export const bucketOf = (days, horizon = 90) => (days < 0 ? "overdue" : days <= 7 ? "week" : days <= 30 ? "month" : days <= horizon ? "quarter" : null);
const ROUTE_OF_TYPE = { Deviation: "deviations", CAPA: "capa", "Change Control": "cc", "Audit Finding": "findings" };
export const MODULES = ["review", "records", "actions", "sop", "sopReview", "calibration", "validation", "training", "apqr", "fives", "activities", "suppliers", "documents", "wip", "fmea", "improvements"];

/**
 * The items due within `horizon` days (and all overdue ones), most urgent first:
 * {mod, kind, id, title, due, days, bucket, owner, dept, link: {route, params?, state?}, open?: {kind, ref}}.
 */
export function dueItems(m, now, { horizon = 90 } = {}) {
  const out = [];
  const x = m.x ?? {};
  const add = (it) => {
    if (it.due == null || !Number.isFinite(it.due)) return;
    const days = Math.floor((it.due - now) / DAY);
    const bucket = bucketOf(days, horizon);
    if (!bucket) return;
    out.push({ owner: null, dept: null, ...it, days, bucket });
  };
  // management review: the meeting due by the end of the 2nd month after the half-year, then the minutes and the report
  // within a week of it, and the actions and regulations followed up to closure
  const Q = x.qmr;
  const qlink = (no, tab) => ({ route: "review", state: { mrNo: no, mrTab: tab } });
  for (const r of Q?.reviews ?? []) {
    if (r.cancelled || r.state === "Closed") continue;
    if (!r.held) add({ mod: "review", kind: "Management review", id: r.no, title: r.Period ?? "", due: r.dueBy, owner: r.Chair, link: qlink(r.no, "report") });
    else {
      if (r.minutes == null) add({ mod: "review", kind: "Review minutes", id: r.no, title: r.Period ?? "", due: r.minutesDue, owner: r["Prepared by"], link: qlink(r.no, "meeting") });
      if (r.report == null) add({ mod: "review", kind: "Review report to corporate", id: r.no, title: r.Period ?? "", due: r.reportDue, owner: r["Prepared by"], link: qlink(r.no, "meeting") });
    }
  }
  if (Q?.toPlan && !Q.reviews.some((r) => r.period?.label === Q.toPlan.period.label)) add({ mod: "review", kind: "Management review", id: Q.toPlan.period.label, title: "", due: Q.toPlan.dueBy, link: { route: "review" } });
  for (const a of Q?.actions ?? []) if (a.open) add({ mod: "review", kind: "Review action", id: a["Action ID"] ?? a["Report no"], title: a.Action ?? "", due: a.due, owner: a.Responsible, link: qlink(a["Report no"], "actions") });
  for (const g of Q?.regs ?? []) if (!g.closed) add({ mod: "review", kind: "Regulation", id: g["Reg ID"] ?? "", title: g.Regulation ?? "", due: g.due, owner: g.Owner, link: { route: "review", state: { mrTab: "regs" } } });
  for (const r of m.records ?? []) if (r.isOpen) add({ mod: "records", kind: r.type, id: r.ref, title: r.title, due: r.due, owner: r.owner, dept: r.department, link: { route: ROUTE_OF_TYPE[r.type] ?? "records" }, open: { kind: "record", ref: r.ref } });
  for (const a of m.actions ?? []) if (a.isOpen) add({ mod: "actions", kind: "Action", id: a.ref, title: a.title, due: a.due, owner: a.owner, dept: a.department, link: { route: "actions" }, open: { kind: "action", ref: a.ref } });
  const sx = x.sopx;
  for (const s of sx?.list ?? []) {
    if (s.reviewStatus === "Obsolete" || s.openReview) continue; // an open request carries its own due date
    add({ mod: "sop", kind: "SOP review", id: s.Code, title: s.Title ?? "", due: s.next, owner: s.Owner, dept: s.Department, link: { route: "sops", params: { code: s.Code } } });
  }
  for (const r of sx?.reviews ?? []) if (r.open) add({ mod: "sopReview", kind: r.Type ?? "Periodic review", id: r["Review ID"] ?? r.SOP, title: `${r.SOP ?? ""} · ${r.sop?.Title ?? ""}`, due: r.due, owner: r.Owner, dept: r.sop?.Department, link: { route: "sops", params: { code: r.SOP } } });
  const parents = new Set((x.calplan ?? []).filter((c) => !c.isParent).map((c) => c.Parent));
  for (const c of x.calplan ?? []) if (!c.done && !(c.isParent && parents.has(c.Item))) add({ mod: "calibration", kind: "Calibration", id: c.Item, title: c.Description ?? "", due: c.start, owner: c["Performed by"], dept: c.location, link: { route: "calibration" } });
  for (const v of x.validation ?? []) if (!v.done && !/cancel|postpon/i.test(v.Status ?? "")) add({ mod: "validation", kind: "Qualification", id: v["Task ID"] ?? v.Equipment, title: v.Task ?? "", due: v.finishEnd ?? v.start, owner: v["Verified by"], dept: v.Scope, link: { route: "validation" } });
  for (const tr of x.training ?? []) if (!tr.done && tr.status !== "Cancelled") add({ mod: "training", kind: "Planned training", id: tr["Training ID"] ?? tr.Reference, title: tr.Program ?? "", due: tr.plannedEnd, owner: tr.Trainer, dept: tr.Department, link: { route: "training", state: { trnTab: "planned" } } });
  const tx = x.trainingX;
  const unplannedLink = { route: "training", state: { trnTab: "unplanned" } };
  for (const u of tx?.unplanned ?? []) if (!u.done && u.status !== "Cancelled") add({ mod: "training", kind: "Unplanned training", id: u["Training ID"] ?? u.Reference, title: u.title, due: u.due, owner: u.Trainer, dept: u.Department, link: unplannedLink });
  for (const n of tx?.sopNeeds ?? []) if (!n.covered) add({ mod: "training", kind: `${n.category} training`, id: n.sop.Code, title: n.sop.Title ?? "", due: n.due, dept: n.people[0]?.dept ?? null, link: unplannedLink });
  for (const r of tx?.retraining ?? []) add({ mod: "training", kind: "Re-training", id: r.record.emp, title: [r.record.Reference, r.record.Title].filter(Boolean).join(" · "), due: r.due, owner: r.record.emp, dept: r.record.Department, link: unplannedLink });
  for (const a of x.apqr ?? []) if (!a.approved) add({ mod: "apqr", kind: "APQR", id: a.Product, title: `${a.Product} · ${a.Period ?? ""}`, due: a.due, owner: a.Owner, link: { route: "apqr" } });
  for (const tk of x.apqrProg?.tasks ?? []) if (tk.open) add({ mod: "apqr", kind: "APQR task", id: tk["Reference ID"], title: `${tk.Product} · ${tk["Task Title"] ?? tk.stream}`, due: tk.due, owner: tk["Assigned User"], dept: tk.dept, link: { route: "apqr" } });
  for (const f of x.fivesX?.findings ?? []) if (f.open) add({ mod: "fives", kind: "5S finding", id: `${f["Audit ID"]} #${f.No ?? ""}`, title: `${f.Area ?? ""} · ${f.Action || f.Criterion || ""}`, due: f.due, owner: f.Owner, dept: f.Area, link: { route: "fives" } });
  for (const a of x.fivesX?.areas ?? []) add({ mod: "fives", kind: "5S audit", id: a.Code ?? a.Area, title: a.Area, due: a.next, owner: a.Owner, dept: a.Area, link: { route: "fives" } });
  for (const q of x.qaact ?? []) if (q.status !== "Continuous" && q.freq !== 0) add({ mod: "activities", kind: "GMP activity", id: q.id, title: q.activity, due: q.nextDue, owner: q.owner, link: { route: "activities" } });
  for (const s of x.suppliers ?? []) add({ mod: "suppliers", kind: "Supplier audit", id: s.API, title: `${s.Manufacturer ?? ""} · ${s.API}`, due: s.next, link: { route: "suppliers" } });
  for (const c of x.docx?.checks ?? []) if (c.doc && c.doc.kind !== "sop" && c.state !== "obsolete") add({ mod: "documents", kind: c.doc.type ?? "Document", id: c.code, title: c.doc.title ?? "", due: c.validity, dept: c.dept, link: { route: "sops", state: { sopTab: "index" } } });
  for (const w of x.wip ?? []) if (w.tf != null && !/released|closed|destroy/i.test(w.Status ?? "")) add({ mod: "wip", kind: "WIP hold time", id: `${w.Product} · ${w.Batch ?? ""}`, title: w["Next step"] ?? w.Status ?? "", due: w.tf, owner: w.Responsibility, dept: w.Location, link: { route: "wip" } });
  for (const f of m.fmea ?? []) if (f.Action && f.due != null && !f.Verification && !/^y/i.test(f["Post-mitigation acceptance"] ?? "")) add({ mod: "fmea", kind: "FMEA action", id: f["Risk ID"], title: f.Action, due: f.due, owner: f.Owner, dept: f["Room code"], link: { route: "fmea" } });
  for (const i of m.impr ?? []) if (!/done/i.test(i.Stage ?? "")) add({ mod: "improvements", kind: "Improvement", id: i.ID, title: i.Title ?? "", due: toDay(i["Target date"]), owner: i.Owner, dept: i.Room, link: { route: "improvements" } });
  return out.sort((a, b) => a.due - b.due || String(a.id).localeCompare(String(b.id)));
}

/** Counts per key (owner, department, module), with how many are overdue: [{key, n, overdue}] most loaded first. */
export function loadBy(items, keyOf) {
  const m = new Map();
  for (const it of items) { const k = keyOf(it) || "—"; const e = m.get(k) ?? { key: k, n: 0, overdue: 0 }; e.n++; if (it.bucket === "overdue") e.overdue++; m.set(k, e); }
  return [...m.values()].sort((a, b) => b.overdue - a.overdue || b.n - a.n);
}
