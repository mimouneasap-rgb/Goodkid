// Import from Scigeniq: the "allTasks" Excel exports of the site eQMS read in
// the browser and merged into the Tier 2 registers — quality events →
// deviations, CAPA, change controls, actions (linked to their parent by title),
// audit plans & audits → audit programme, audit findings, APQR (+ the progress
// of their data-collection tasks). Every file is recognised by its content,
// whatever its number. Nothing changes until the preview is approved; then
// existing records are updated (Scigeniq is the record of truth for the fields
// it carries), new ones added, and records missing from the exports are kept.
// SheetJS (Apache-2.0) is loaded from a CDN the first time.

import { store } from "./store.js";
import * as E from "./engine.js";
import { T2_REGISTERS } from "./schema.js";
import { loadScript } from "./export.js";
import * as SITE from "./real-data.js";
import { esc, fmtDate, toast, fresh, confirmDialog, $, $$ } from "./ui.js";

const XLSX_URL = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
const has = (v) => v !== "" && v != null;

/* ── cleaning ────────────────────────────────────────────── */

const clean = (v) => {
  if (v == null) return null;
  if (v instanceof Date) return v;
  const s = String(v).replace(/[﻿​]/g, "").replace(/[ \t]+/g, " ").trim();
  return !s || s === "-----" || s === "Invalid date" || s.startsWith("${table:") ? null : s;
};
export const norm = (s) => String(s || "").replace(/[\ufeff\u200b\u200c\u200d\u00ad]/g, "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const pad = (n) => String(n).padStart(2, "0");
/** "05/11/2026 04:31 pm" → "2026-11-05" (also accepts real dates and ISO text). */
export function sdate(v) {
  if (v instanceof Date && !Number.isNaN(+v)) return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
  const s = String(v || "");
  let m = /(\d\d)\/(\d\d)\/(\d{4})/.exec(s);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  m = /(\d{4})-(\d\d)-(\d\d)/.exec(s);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}
const short = (t, n = 600) => { t = clean(t); return !t || t.length <= n ? t : `${t.slice(0, n - 1)}…`; };
const join = (parts, sep = " · ") => parts.filter(Boolean).join(sep) || null;
const prune = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => has(v)));

/** Person names written the way the boards already write them (accents, word order, case). */
function peopleIndex() {
  const s = store.t2;
  const names = new Set([...(s.lists.People || []), ...s.load.map((r) => r.member), ...store.t1.roster.map((o) => o.name)].filter(Boolean));
  const byNorm = new Map(), byWords = new Map();
  for (const n of names) { byNorm.set(norm(n), n); byWords.set(norm(n).split(" ").sort().join(" "), n); }
  return (v) => {
    const c = clean(v);
    if (!c || c === "System") return null;
    const k = norm(c);
    const w = k.split(" ").sort().join(" ");
    const hit = byNorm.get(k) || byWords.get(w);
    if (hit) return hit;
    const name = c.replace(/[\ufeff\u200b]/g, "").replace(/\b\w/g, (x) => x.toUpperCase());
    byNorm.set(k, name); byWords.set(w, name); // later spellings of the same person follow the first one
    return name;
  };
}

/* ── reading the files ───────────────────────────────────── */

const TYPE_KIND = { Actions: "act", "Standalone Actions": "act", "Quality Event": "qe", CAPA: "capa", "Change Control": "cc", "Audit Plan": "plan", Audit: "audit", "Audit Findings": "find", APQR: "apqr" };
const PREFIX_KIND = [["ACTION-", "act"], ["QE-", "qe"], ["CAPA-", "capa"], ["CC-", "cc"], ["AUDP-", "plan"], ["AUDT-", "audit"], ["FIND-", "find"], ["APQR-", "apqr"]];
export const KIND_LABEL = { act: "Actions", qe: "Quality events", capa: "CAPA", cc: "Change controls", plan: "Audit plans", audit: "Audits", find: "Audit findings", apqr: "APQR", apqrTask: "APQR data-collection tasks", other: "Not recognised" };

export function kindOf(r) {
  const t = clean(r.Type) || "";
  if (TYPE_KIND[t]) return TYPE_KIND[t];
  if (/data collection|apqr plan/i.test(t)) return "apqrTask";
  const id = String(r["Reference Id"] || "");
  return PREFIX_KIND.find(([p]) => id.startsWith(p))?.[1] || "other";
}

/** One export file → { name, generated, rows }. */
export async function readExport(file) {
  const XLSX = await loadScript(XLSX_URL, "XLSX");
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const sheetName = wb.SheetNames.find((n) => n === "Data") || wb.SheetNames.find((n) => {
    const first = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: false, defval: null })[0] || [];
    return first.some((h) => String(h || "").trim() === "Reference Id");
  });
  if (!sheetName) throw new Error(`${file.name}: no “Data” sheet with a Reference Id column — is it a Scigeniq allTasks export?`);
  const grid = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, raw: false, defval: null, blankrows: false });
  const head = (grid[0] || []).map((h) => (h == null ? "" : String(h).trim()));
  const rows = grid.slice(1).filter((r) => r.some((c) => has(c))).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]]).filter(([h]) => h)));
  let generated = null;
  const over = wb.Sheets["Over All"];
  if (over) for (const line of XLSX.utils.sheet_to_json(over, { header: 1, raw: false, defval: null }).flat()) { const m = /Generation Date\s*:\s*(.+)/i.exec(String(line || "")); if (m) generated = m[1].trim(); }
  return { name: file.name, generated, rows };
}

/* ── mapping to the registers ────────────────────────────── */

const ROOT = [["human", "Human error"], ["procedure", "Method / procedure"], ["instruction", "Method / procedure"], ["equipment", "Equipment"], ["material", "Material"], ["product", "Material"],
  ["planning", "Planning / supply chain"], ["supply", "Planning / supply chain"], ["environment", "Environment / facility"], ["facility", "Environment / facility"], ["measure", "Measurement"]];
const CAPA_SRC = { "Audit Findings": "Audit", "Quality Event": "Deviation", Complaint: "Complaint", "Change Control": "Change Control", APQR: "APQR", Standalone: "Other" };
const CCT = [["document", "Document"], ["equipment", "Equipment"], ["standard instrument", "Equipment"], ["facility", "Facility"], ["system", "System / IT"], ["service provider", "Supplier"],
  ["packaging material", "Material"], ["raw material", "Material"], ["product", "Product"]];
const ACT_STAGE = { Completed: "Done", Closed: "Done", Canceled: "Cancelled", Cancelled: "Cancelled", "QA Approval": "QA Approval", "In Progress": "In Progress", Open: "Open" };
const PTYPE = { qe: "Quality Event", capa: "CAPA", cc: "Change Control", plan: "Audit", audit: "Audit", find: "Audit", apqr: "APQR" };
const CLS3 = (v) => (["Minor", "Major", "Critical"].includes(v) ? v : null);
const stage3 = (st) => ({ Closed: "Closed", Canceled: "Canceled", Cancelled: "Canceled", Open: "Open" })[st] || "In Progress";
const audStatus = (st = "") => (/cancel/i.test(st) ? "Canceled" : /^(completed|closed)$/i.test(st) ? "Completed" : /prepar/i.test(st) ? "Preparation" : /finding/i.test(st) ? "Findings In Progress" : /pending|approval|closure|review/i.test(st) ? "Pending Approval" : "Open");
const parentTitle = (v) => norm(String(clean(v) || "").replace(/^(Task|Row)\s*-\s*/i, ""));
const productKey = (v) => norm(String(v || "").replace(/-\s*ELKENDI.*$/i, "").replace(/\((?:\d+\s*(?:TAB|CPS?|ML)[^)]*)\)/gi, ""));

/** The board records the exports describe: { dev, capa, cc, act, aud, find, apqr } plus what was not mapped. */
export function mapExports(files) {
  const who = peopleIndex();
  const rows = files.flatMap((f) => f.rows.map((r) => ({ r, kind: kindOf(r), file: f.name })));
  const by = (k) => rows.filter((x) => x.kind === k).map((x) => x.r);
  const owner = (r) => who(r["Assigned User"]) || clean(r.Department)?.split(",")[0].trim() || (clean(r.Role) ? "QA" : null);
  const people = new Set();
  const out = { dev: [], capa: [], cc: [], act: [], aud: [], find: [], apqr: [], apqrTasks: 0, skipped: rows.filter((x) => x.kind === "other").length, people };
  const seen = (reg, rec) => { if (rec.owner && /\s/.test(rec.owner) && rec.owner !== "QA") people.add(rec.owner); out[reg].push(prune(rec)); };
  // the same record can come in several files (e.g. an APQR with and without its columns): merge, keeping every value
  const dedupe = (list) => {
    const m = new Map();
    for (const r of list) {
      const id = r["Reference Id"], prev = m.get(id);
      if (!prev) { m.set(id, { ...r }); continue; }
      for (const [k, v] of Object.entries(r)) if (clean(v) != null && clean(prev[k]) == null) prev[k] = v;
    }
    return [...m.values()];
  };

  // titles of every parent record, to link actions (they carry "Task - <parent title>")
  const titles = new Map();
  const addTitle = (t, id, kind) => { const k = norm(t); if (k && !titles.has(k)) titles.set(k, { id, kind }); };
  for (const k of ["qe", "capa", "cc", "plan", "audit", "find", "apqr"]) for (const r of by(k)) addTitle(r.Title, r["Reference Id"], k);
  const s = store.t2;
  for (const [reg, kind] of [["dev", "qe"], ["capa", "capa"], ["cc", "cc"], ["find", "find"]]) for (const r of s[reg] || []) addTitle(String(r.desc || "").split(" — ")[0], r.id, kind);
  for (const r of s.aud || []) addTitle(r.desc, r.id, r.kind === "Plan" ? "plan" : "audit");
  const findParent = (v) => {
    const k = parentTitle(v);
    if (!k) return null;
    if (titles.has(k)) return titles.get(k);
    if (k.length >= 25) for (const [t, x] of titles) if (t.startsWith(k) || k.startsWith(t)) return x;
    return null;
  };

  // quality events → deviations
  for (const r of dedupe(by("qe"))) {
    const stage = clean(r.Stage), status = stage3(stage);
    const clsRaw = clean(r["Final Event Classification"]) || clean(r["Initial QE Class"]);
    const rc = clean(r["Root Cause"]);
    const root = ROOT.find(([k]) => rc && rc.toLowerCase().includes(k))?.[1] || (status === "Open" || status === "In Progress" ? "Under investigation" : null);
    const prod = clean(r["Finished Products"]) || clean(r["Semi-Finished Product"]) || clean(r["Bulk Product"]);
    const bat = clean(r["Product Batch No."]);
    seen("dev", { id: r["Reference Id"], opened: sdate(r["Creation Date"]), desc: clean(r.Title),
      product: join([prod ? prod.split(",").slice(1).join(",").trim() || prod : null, bat ? bat.replace(/;/g, ", ") : null], " / "),
      cls: CLS3(clsRaw), root, owner: owner(r), status, due: sdate(r["End Date"]), capa: ({ Yes: "Yes", No: "No" })[clean(r["CAPA Required_?"])] || null,
      closed: status === "Closed" || status === "Canceled" ? sdate(r["Closing date"]) : null,
      comments: join([`Scigeniq stage: ${stage}`, clsRaw && !CLS3(clsRaw) ? `class: ${clsRaw}` : null, sdate(r["Date of Occurrence"]) ? `occurred ${sdate(r["Date of Occurrence"])}` : null,
        clean(r["Quality Event Scope"]) ? `scope: ${clean(r["Quality Event Scope"])}` : null, rc ? `root cause: ${rc}` : null, clean(r["Require_Investigation ?"]) ? `investigation: ${clean(r["Require_Investigation ?"])}` : null]) });
  }
  // CAPA
  for (const r of dedupe(by("capa"))) {
    const stage = clean(r.Stage);
    const status = /effectiveness/i.test(stage || "") ? "Effectiveness Check" : stage3(stage);
    seen("capa", { id: r["Reference Id"], opened: sdate(r["Creation Date"]), source: CAPA_SRC[clean(r.Source)] || (clean(r.Source) ? "Other" : null), link: clean(r["Parent ID Reference"]),
      desc: clean(r.Title), owner: owner(r), status, due: sdate(r["End Date"]),
      eff: clean(r["Effectiveness Check required?"]) === "Yes" && status !== "Closed" ? "Pending" : null,
      closed: status === "Closed" || status === "Canceled" ? sdate(r["Closing date"]) : null,
      comments: join([`Scigeniq stage: ${stage}`, clean(r["Responsible Department"]) ? `responsible: ${clean(r["Responsible Department"])}` : null,
        clean(r["Parent action"]) ? `from: ${String(clean(r["Parent action"])).replace(/^Task\s*-\s*/, "")}` : null, clean(r["Effectiveness Check required?"]) ? `effectiveness check required: ${clean(r["Effectiveness Check required?"])}` : null]) });
  }
  // change control
  for (const r of dedupe(by("cc"))) {
    const stage = clean(r.Stage), status = stage3(stage);
    const scope = clean(r["Change Scope"]);
    const subject = clean(r.Subject);
    const dep = clean(r.Department);
    seen("cc", { id: r["Reference Id"], opened: sdate(r["Creation Date"]), desc: join([clean(r.Title), subject], " — "),
      type: CCT.find(([k]) => scope && scope.toLowerCase().split(",")[0].trim().startsWith(k))?.[1] || null,
      cat: CLS3(clean(r["CC Classification"])), initiator: dep ? dep.split(",")[0].trim() : null, owner: owner(r), status, due: sdate(r["End Date"]),
      closed: status === "Closed" || status === "Canceled" ? sdate(r["Closing date"]) : null,
      comments: short(join([`Scigeniq stage: ${stage}`, clean(r["CC Category"]) ? `category: ${clean(r["CC Category"])}` : null, scope ? `scope: ${scope}` : null,
        who(r["Created By"]) ? `raised by ${who(r["Created By"])}` : null, clean(r["Current State"]) ? `from: ${clean(r["Current State"])}` : null,
        clean(r["Proposed State"]) ? `to: ${clean(r["Proposed State"])}` : null, clean(r.Justification) ? `why: ${clean(r.Justification)}` : null]), 900) });
  }
  // audit plans and audits → audit programme
  for (const r of dedupe(by("plan"))) {
    const stage = clean(r.Stage), status = audStatus(stage);
    seen("aud", { id: r["Reference Id"], kind: "Plan", desc: clean(r.Title), type: clean(r["Audit Type"]), owner: owner(r), opened: sdate(r["Creation Date"]), due: sdate(r["End Date"]), status,
      closed: status === "Completed" || status === "Canceled" ? sdate(r["Closing date"]) : null,
      comments: join([`Scigeniq stage: ${stage}`, clean(r["Associated Users"]) ? `team: ${clean(r["Associated Users"])}` : null, clean(r["Audits Completed ?"]) ? `audits completed: ${clean(r["Audits Completed ?"])}` : null]) });
  }
  for (const r of dedupe(by("audit"))) {
    const stage = clean(r.Stage), status = audStatus(stage);
    seen("aud", { id: r["Reference Id"], kind: "Audit", plan: clean(r["Parent ID Reference"]), desc: clean(r.Title), type: clean(r["Audit Type"]), standard: clean(r["Audit Standard"]),
      risk: clean(r["Audit Risk"]), areas: join([clean(r["Audited Areas"]), clean(r["Audited Areas (if Other)"])], ", "), owner: owner(r), opened: sdate(r["Creation Date"]), due: sdate(r["End Date"]), status,
      closed: status === "Completed" || status === "Canceled" ? sdate(r["Closing date"]) : null,
      comments: join([`Scigeniq stage: ${stage}`, clean(r["Audit Plan Name"]) ? `plan: ${clean(r["Audit Plan Name"])}` : null, clean(r["Associated Users"]) ? `team: ${clean(r["Associated Users"])}` : null]) });
  }
  // audit findings
  for (const r of dedupe(by("find"))) {
    const stage = clean(r.Stage);
    const status = /cancel/i.test(stage || "") ? "Canceled" : /^(completed|closed)$/i.test(stage || "") ? "Completed" : /pending/i.test(stage || "") ? "Pending Response" : "Open";
    seen("find", { id: r["Reference Id"], audit: clean(r["Parent ID Reference"]), desc: clean(r.Title), cls: CLS3(clean(r.Classification)), ftype: clean(r["Finding Type"])?.replace(/\.$/, ""),
      area: clean(r["Audited Areas"]), owner: owner(r), opened: sdate(r["Creation Date"]), due: sdate(r["End Date"]), status,
      closed: status === "Completed" || status === "Canceled" ? sdate(r["Closing date"]) : null, waitCapa: ({ Yes: "Yes", No: "No" })[clean(r["Wait CAPA?"])] || null,
      comments: join([`Scigeniq stage: ${stage}`, clean(r["Supplier Name"]) ? `supplier: ${clean(r["Supplier Name"])}` : null]) });
  }
  // actions, linked to their parent
  for (const r of dedupe(by("act"))) {
    const p = clean(r["Parent ID Reference"]) ? { id: clean(r["Parent ID Reference"]), kind: PREFIX_KIND.find(([x]) => clean(r["Parent ID Reference"]).startsWith(x))?.[1] } : findParent(r["Parent action"]);
    const status = ACT_STAGE[clean(r.Stage)] || "In Progress";
    seen("act", { id: r["Reference Id"], parent: p?.id || null, ptype: p ? PTYPE[p.kind] : clean(r.Type) === "Standalone Actions" ? "Standalone" : clean(r["Parent Type"]) || null,
      desc: clean(r.Title), owner: owner(r), dept: clean(r.Department), opened: sdate(r["Creation Date"]) || sdate(r["Start Date"]), due: sdate(r["End Date"]), status,
      closed: status === "Done" || status === "Cancelled" ? sdate(r["Closing date"]) : null,
      comments: join([short(r.Description), clean(r.Tags) ? `tag: ${clean(r.Tags)}` : null, !p && clean(r["Parent action"]) ? `parent: ${String(clean(r["Parent action"])).replace(/^Task\s*-\s*/, "")}` : null]) });
  }
  // APQR and the progress of their data-collection tasks
  const tasks = by("apqrTask");
  out.apqrTasks = tasks.length;
  const groups = new Map();
  for (const t of tasks) { const k = parentTitle(t["Parent action"]); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(t); }
  const progress = (title, product) => {
    const k = norm(title), pk = productKey(product);
    const list = groups.get(k) || [...groups.entries()].find(([g]) => (k && (g.startsWith(k) || k.startsWith(g))) || (pk && g.includes(pk)))?.[1];
    if (!list) return null;
    const done = list.filter((t) => /completed|closed|approved/i.test(clean(t.Stage) || ""));
    const open = list.filter((t) => !done.includes(t));
    return { pct: list.length ? done.length / list.length : null, text: `Scigeniq data tasks: ${done.length}/${list.length} completed${open.length ? ` · open: ${open.map((t) => `${clean(t.Title)}${who(t["Assigned User"]) ? ` (${who(t["Assigned User"])})` : ""}`).join("; ")}` : ""}` };
  };
  for (const r of dedupe(by("apqr"))) {
    const stage = clean(r.Stage) || "";
    const status = /closed|approved/i.test(stage) ? "Closed" : /review|approval/i.test(stage) ? "In Review" : "In Progress";
    const pr = progress(r.Title, r["Product Name"]);
    const y = /(\d\d)\/(\d{4})/.exec(String(clean(r.Year) || ""));
    out.apqr.push(prune({ id: r["Reference Id"], product: clean(r["Product Name"]), period: y ? `${clean(r["APQR Process"]) ? `${clean(r["APQR Process"])} · ` : ""}APQR ${y[1]}/${y[2]}` : null,
      owner: owner(r), opened: sdate(r["Creation Date"]), due: sdate(r["End Date"]), status, pct: status === "Closed" ? 1 : pr?.pct ?? null,
      closed: status === "Closed" ? sdate(r["Closing date"]) : null, findings: pr?.text || null, comments: `Scigeniq ${r["Reference Id"]} · stage: ${stage}`, _title: clean(r.Title) }));
  }
  // data tasks of APQRs that are only on the board (from the APQR tracker): progress update
  out.apqrProgress = [];
  for (const [g, list] of groups) {
    if (out.apqr.some((a) => norm(a._title) === g || (g.length >= 25 && norm(a._title).startsWith(g)))) continue;
    const done = list.filter((t) => /completed|closed|approved/i.test(clean(t.Stage) || "")).length;
    out.apqrProgress.push({ title: g, pct: done / list.length, text: `Scigeniq data tasks: ${done}/${list.length} completed`, tasks: list });
  }
  return out;
}

/* ── comparing with the board ────────────────────────────── */

const REGS = ["dev", "capa", "acapa", "cc", "act", "aud", "find", "apqr"];
const DONE = (reg, st) => (E.T2_FLOW[reg]?.done || []).includes(st);

/** Find the board APQR an imported APQR (or a group of data tasks) belongs to. */
function apqrMatch(rows, rec) {
  let i = rows.findIndex((r) => r.id === rec.id);
  if (i < 0 && rec.id) i = rows.findIndex((r) => String(r.comments || "").includes(rec.id) || String(r.findings || "").includes(rec.id));
  if (i < 0 && rec.product) { const k = productKey(rec.product); i = rows.findIndex((r) => productKey(r.product) === k && (!rec.period || !r.closed || r.status !== "Closed")); }
  return i;
}

export function planImport(mapped, { update = true, add = true } = {}) {
  const s = store.t2;
  // CAPA from audits go to the Audit CAPA register (an older export or update has them under capa)
  const allCapa = [...(mapped.capa || []), ...(mapped.acapa || [])];
  mapped = { ...mapped, capa: allCapa.filter((r) => !E.isAuditCapa(r)), acapa: allCapa.filter(E.isAuditCapa) };
  const plan = {};
  for (const reg of REGS) {
    const rows = s[reg] || [];
    const index = new Map(rows.map((r, i) => [r.id, i]));
    const p = { add: [], upd: [], same: 0, missing: 0 };
    const touched = new Set();
    for (const rec0 of mapped[reg]) {
      const rec = { ...rec0 }; delete rec._title;
      let i = reg === "apqr" ? apqrMatch(rows, rec) : index.has(rec.id) ? index.get(rec.id) : -1;
      if (i < 0) { if (add) p.add.push(rec); continue; }
      touched.add(i);
      const before = rows[i];
      const after = { ...before, ...rec };
      if (reg === "apqr" && before.id !== rec.id) { after.id = before.id; after.comments = join([before.comments, `Scigeniq ${rec.id}`]); }
      if (!DONE(reg, after.status) && !has(rec.closed)) delete after.closed;
      const changes = Object.keys({ ...before, ...after }).filter((k) => !k.startsWith("_") && String(before[k] ?? "") !== String(after[k] ?? ""));
      if (!changes.length) { p.same++; continue; }
      if (update) p.upd.push({ i, before, after, changes });
    }
    // APQR progress from data tasks of APQRs that are only on the board
    if (reg === "apqr") for (const g of mapped.apqrProgress || []) {
      const i = rows.findIndex((r) => g.title.includes(productKey(r.product)) && productKey(r.product).length > 6 && r.status !== "Closed");
      if (i < 0 || touched.has(i)) continue;
      const before = rows[i];
      const after = { ...before, pct: Math.max(+before.pct || 0, g.pct), findings: join([String(before.findings || "").replace(/\s*·?\s*Scigeniq data tasks: [^·]*/g, "").trim() || null, g.text]) };
      const changes = ["pct", "findings"].filter((k) => String(before[k] ?? "") !== String(after[k] ?? ""));
      if (changes.length && update) p.upd.push({ i, before, after, changes });
    }
    p.missing = rows.length - touched.size - p.upd.filter((u) => !touched.has(u.i)).length;
    plan[reg] = p;
  }
  const known = new Set([...(s.lists.People || [])]);
  plan.people = [...mapped.people].filter((n) => !known.has(n)).sort();
  return plan;
}

/** Write the plan into the board in one save, with one change-history entry per register. */
export function applyImport(plan, { files = [], generated = null, addPeople = true, id = null } = {}) {
  if (store.viewing) throw new Error("Return to the live board first — an archive is read-only");
  const s = store.t2;
  const counts = {};
  for (const reg of REGS) {
    const p = plan[reg];
    if (!p) continue;
    s[reg] ??= [];
    for (const u of p.upd) s[reg][u.i] = { ...u.after, _k: u.before._k, _o: u.before._o };
    let o = s[reg].length ? Math.max(...s[reg].map((r) => r._o ?? 0)) + 1 : 0;
    for (const r of p.add) s[reg].push({ ...r, _o: o++ });
    counts[reg] = { add: p.add.length, upd: p.upd.length };
    if (p.add.length || p.upd.length) store.log("t2", { reg, ref: `Scigeniq import${generated ? ` · ${generated}` : ""}`, action: "edit", changes: [{ field: "new records", from: "", to: p.add.length }, { field: "updated records", from: "", to: p.upd.length }] });
  }
  // list values the records now use
  const L = s.lists;
  const addTo = (list, v) => { if (has(v) && L[list] && !L[list].includes(v)) L[list].push(v); };
  if (addPeople) plan.people.forEach((n) => addTo("People", n));
  for (const r of s.find) addTo("FindType", r.ftype);
  for (const r of s.aud) { addTo("AudType", r.type); addTo("AudRisk", r.risk); addTo("AudStandard", r.standard); addTo("AuditAreas", r.areas); }
  for (const r of s.find) addTo("AuditAreas", r.area);
  for (const r of s.act) addTo("Departments", r.dept);
  for (const r of s.cc) addTo("Departments", r.initiator);
  s.imports = [{ at: new Date().toISOString(), files, generated, counts, ...(id ? { id } : {}) }, ...(s.imports || [])].slice(0, 30);
  store.save("t2");
  return counts;
}

/* ── the update shipped with the site data ───────────────── */

/** The Scigeniq update that ships with this copy, if the board has not applied it yet. */
export function pendingUpdate() {
  const u = SITE.REAL_UPDATE;
  if (!u || !store.t2 || store.viewing) return null;
  if ((store.t2.imports || []).some((h) => h.id === u.id)) return null;
  if (!String(store.t2.dataset || "").startsWith("elkendi")) return null;
  return u;
}
function sessionFromUpdate(u) {
  const mapped = { ...u.mapped, people: new Set(u.mapped.people || []) };
  return { files: [{ name: `Scigeniq exports of ${u.generated}`, generated: u.generated, rows: [] }], mapped, opts: { update: true, add: true, people: true }, updateId: u.id, updateFiles: u.files || [] };
}

/* ── the page ────────────────────────────────────────────── */

let session = null; // files read on this page: { files, mapped, plan, opts }

const EXPORTS = [
  ["Actions (all)", "Tasks → All tasks → Type: Actions + Standalone Actions", "03·A eQMS actions — linked to their quality event, CAPA, change or audit"],
  ["Quality events", "Type: Quality Event", "01 Deviations"],
  ["CAPA", "Type: CAPA", "02 CAPA"],
  ["Change control", "Type: Change Control", "03 Change control"],
  ["Audit plans · Audits", "Type: Audit Plan, Audit", "11 Audit programme"],
  ["Audit findings", "Type: Audit Findings", "12 Audit findings"],
  ["APQR (+ data collection)", "Type: APQR and its data-collection tasks", "08 APQR — status and % complete"],
];

export function renderImport(root) {
  root = fresh(root);
  const s = store.t2;
  const hist = s.imports || [];
  root.innerHTML = `
    <section class="hero"><div class="hero-grid"><div>
      <div class="eyebrow">Data · eQMS</div><h1>Import from Scigeniq</h1>
      <p>Drop the “allTasks” Excel exports of Scigeniq: the app recognises each file by its content, shows what will be added and updated, and changes nothing until you approve. Scigeniq stays the record of truth — re-import whenever you want the boards up to date.</p></div>
      <div class="row"><a class="btn" href="#/guide">How-to guides ›</a></div></div></section>
    ${store.viewing ? `<div class="callout bad" style="margin-bottom:14px">You are looking at a read-only copy — return to the live board to import.</div>` : ""}
    <div class="grid split-wide">
      <div class="stack">
        <label class="card card-pad dropzone" data-drop>
          <input type="file" accept=".xlsx,.xls" multiple hidden data-files>
          <b style="font:600 18px var(--font-display)">⤒ Drop the Scigeniq exports here</b>
          <span class="muted">or click to choose them · several files at once · .xlsx</span>
        </label>
        <div data-result></div>
      </div>
      <div class="stack">
        <div class="card card-pad"><div class="card-head"><h2>What each export feeds</h2></div>
          <table class="plain"><thead><tr><th>Export</th><th>In Scigeniq</th><th>Register</th></tr></thead><tbody>${EXPORTS.map(([a, b, c]) => `<tr><td><b>${esc(a)}</b></td><td class="muted" style="font-size:12.5px">${esc(b)}</td><td style="font-size:12.5px">${esc(c)}</td></tr>`).join("")}</tbody></table>
          <p class="muted" style="font-size:12.5px;margin:8px 0 0">Export each list with all its columns (Tasks → filter by Type → Export → Excel). The file names do not matter. Records already on the board and missing from an export are kept.</p></div>
        <div class="card card-pad"><div class="card-head"><h2>Import history</h2></div>
          ${hist.length ? `<table class="plain"><tbody>${hist.slice(0, 8).map((h) => `<tr><td style="white-space:nowrap">${esc(h.at.slice(0, 16).replace("T", " "))}</td><td class="muted" style="font-size:12px">${h.generated ? `export of ${esc(h.generated)} · ` : ""}${Object.entries(h.counts || {}).filter(([, c]) => c.add || c.upd).map(([r, c]) => `${esc(T2_REGISTERS[r]?.short || r)} +${c.add}/${c.upd}↻`).join(" · ") || "no change"}</td></tr>`).join("")}</tbody></table>`
            : `<div class="empty">No import yet.</div>`}</div>
      </div>
    </div>`;
  const input = $("[data-files]", root), drop = $("[data-drop]", root);
  const go = (list) => read(root, [...list].filter((f) => /\.xlsx?$/i.test(f.name)));
  input.onchange = () => { go(input.files); input.value = ""; };
  drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("on"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("on"));
  drop.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("on"); go(e.dataTransfer.files); });
  const up = pendingUpdate();
  if (up && !session) {
    const card = document.createElement("div");
    card.className = "card card-pad";
    card.style.borderColor = "var(--accent)";
    card.innerHTML = `<div class="card-head"><h2>Site update ready <span class="sub">Scigeniq exports of ${esc(up.generated)}</span></h2></div>
      <p style="margin:0 0 10px;color:var(--ink-2);font-size:13.5px">This version of the boards carries the ${esc(String((up.files || []).length || ""))} Scigeniq exports of ${esc(up.generated)}. Preview what they change on the board, then apply — records the team has added are kept.</p>
      <button class="btn primary" data-upd>Preview the update</button>`;
    $("[data-result]", root).before(card);
    $("[data-upd]", card).onclick = () => { session = sessionFromUpdate(up); session.plan = planImport(session.mapped, session.opts); card.remove(); drawPlan(root); };
  }
  if (session) drawPlan(root);
}

async function read(root, files) {
  if (!files.length) { toast("Choose the .xlsx exports of Scigeniq"); return; }
  const box = $("[data-result]", root);
  box.innerHTML = `<div class="callout">Reading ${files.length} file${files.length > 1 ? "s" : ""}…</div>`;
  try {
    const read = [];
    for (const f of files) { box.innerHTML = `<div class="callout">Reading ${esc(f.name)}…</div>`; read.push(await readExport(f)); }
    session = { files: read, opts: { update: true, add: true, people: true } };
    session.mapped = mapExports(read);
    session.plan = planImport(session.mapped, session.opts);
    drawPlan(root);
  } catch (e) { box.innerHTML = `<div class="callout bad">${esc(e.message || "The files could not be read")}</div>`; }
}

function drawPlan(root) {
  const box = $("[data-result]", root);
  const { files, mapped, plan, opts } = session;
  const kinds = files.map((f) => { const c = {}; f.rows.forEach((r) => { const k = kindOf(r); c[k] = (c[k] || 0) + 1; }); return { f, c }; });
  const total = REGS.reduce((a, r) => a + plan[r].add.length + plan[r].upd.length, 0);
  const FIELD = (reg, k) => T2_REGISTERS[reg]?.fields.find((x) => x.key === k)?.label || k;
  const fmt = (v) => (v == null || v === "" ? "∅" : /^\d{4}-\d\d-\d\d$/.test(v) ? fmtDate(v) : typeof v === "number" && v <= 1 && v > 0 ? `${Math.round(v * 100)} %` : String(v).length > 70 ? `${String(v).slice(0, 68)}…` : String(v));
  box.innerHTML = `
    <div class="card card-pad"><div class="card-head"><h2>Files read <span class="sub">${files.length}</span></h2><button class="btn sm ghost" data-clearimp>Start again</button></div>
      ${session.updateId ? `<p style="margin:0;font-size:13px">Shipped with the site data: ${esc((session.updateFiles || []).join(", ") || files[0].name)}</p>` : ""}
      <table class="plain"><tbody>${kinds.filter(({ f }) => f.rows.length).map(({ f, c }) => `<tr><td><b>${esc(f.name.replace(/^[0-9a-f]{8}-/, ""))}</b><br><span class="muted" style="font-size:12px">${f.generated ? `generated ${esc(f.generated)}` : ""}</span></td><td style="font-size:12.5px">${Object.entries(c).map(([k, n]) => `${n} ${esc(KIND_LABEL[k] || k)}`).join(" · ")}</td></tr>`).join("")}</tbody></table>
      ${mapped.skipped ? `<p class="muted" style="font-size:12.5px">${mapped.skipped} row(s) of a type the boards do not track were skipped.</p>` : ""}</div>
    <div class="card card-pad"><div class="card-head"><h2>What will change <span class="sub">${total} record${total === 1 ? "" : "s"}</span></h2></div>
      <div class="row" style="gap:14px;margin-bottom:10px;font-size:13px"><label class="row" style="gap:6px"><input type="checkbox" data-opt="add" ${opts.add ? "checked" : ""}> Add new records</label><label class="row" style="gap:6px"><input type="checkbox" data-opt="update" ${opts.update ? "checked" : ""}> Update existing records</label><label class="row" style="gap:6px"><input type="checkbox" data-opt="people" ${opts.people ? "checked" : ""}> Add ${plan.people.length} new name${plan.people.length === 1 ? "" : "s"} to the People list</label></div>
      <table class="plain"><thead><tr><th>Register</th><th class="num">New</th><th class="num">Updated</th><th class="num">Unchanged</th><th class="num">Only on the board</th></tr></thead><tbody>
        ${REGS.map((r) => { const p = plan[r]; return `<tr><td><a href="#/t2/reg/${r}"><b>${esc(T2_REGISTERS[r].no)} ${esc(T2_REGISTERS[r].short)}</b></a></td><td class="num">${p.add.length ? `<b style="color:var(--g-ink)">+${p.add.length}</b>` : 0}</td><td class="num">${p.upd.length ? `<b>${p.upd.length}</b>` : 0}</td><td class="num muted">${p.same}</td><td class="num muted">${Math.max(0, p.missing)}</td></tr>`; }).join("")}
      </tbody></table>
      ${mapped.act.length ? `<p class="muted" style="font-size:12.5px;margin:8px 0 0">${mapped.act.filter((a) => a.parent).length} of ${mapped.act.length} actions linked to their parent record.${mapped.apqrTasks ? ` ${mapped.apqrTasks} APQR data-collection tasks turned into % complete.` : ""}</p>` : ""}
      ${REGS.filter((r) => plan[r].upd.length || plan[r].add.length).map((r) => `<details class="imp-det"><summary><b>${esc(T2_REGISTERS[r].short)}</b> — see the changes</summary>
        ${plan[r].upd.length ? `<table class="plain"><thead><tr><th>Ref.</th><th>Change</th></tr></thead><tbody>${plan[r].upd.slice(0, 40).map((u) => `<tr><td class="mono" style="white-space:nowrap">${esc(u.after.id)}</td><td style="font-size:12px">${u.changes.slice(0, 5).map((k) => `${esc(FIELD(r, k))}: <span class="muted">${esc(fmt(u.before[k]))}</span> → <b>${esc(fmt(u.after[k]))}</b>`).join("<br>")}${u.changes.length > 5 ? "<br>…" : ""}</td></tr>`).join("")}</tbody></table>${plan[r].upd.length > 40 ? `<p class="muted" style="font-size:12px">… and ${plan[r].upd.length - 40} more updates</p>` : ""}` : ""}
        ${plan[r].add.length ? `<p style="font-size:12.5px;margin:8px 0 4px"><b>New:</b> ${plan[r].add.slice(0, 30).map((x) => esc(x.id)).join(", ")}${plan[r].add.length > 30 ? ` … +${plan[r].add.length - 30}` : ""}</p>` : ""}</details>`).join("")}
      ${plan.people.length ? `<p class="muted" style="font-size:12.5px">New names: ${plan.people.slice(0, 40).map(esc).join(", ")}${plan.people.length > 40 ? " …" : ""}</p>` : ""}
      <div class="row" style="margin-top:12px"><span class="muted" style="font-size:12.5px">${store.sync ? "The change applies to the shared board — for the whole team." : "The change applies to this browser's board."}</span><span class="spacer"></span><button class="btn primary" data-apply ${total || (opts.people && plan.people.length) ? "" : "disabled"}>✓ Apply the import</button></div></div>`;
  $("[data-clearimp]", box).onclick = () => { session = null; renderImport(root); };
  box.addEventListener("change", (e) => {
    const o = e.target.dataset.opt;
    if (!o) return;
    opts[o] = e.target.checked;
    session.plan = planImport(mapped, opts);
    drawPlan(root);
  });
  $("[data-apply]", box).onclick = async () => {
    if (!await confirmDialog({ title: "Apply the Scigeniq import?", body: `<p>${REGS.map((r) => (plan[r].add.length || plan[r].upd.length ? `${T2_REGISTERS[r].short}: +${plan[r].add.length} new, ${plan[r].upd.length} updated` : "")).filter(Boolean).join("<br>") || "Only the People list changes."}</p><p>${store.sync ? "<b>For everyone on the team.</b> " : ""}Every change is recorded in Change history.</p>`, ok: "Apply" })) return;
    try {
      const gen = files.map((f) => f.generated).filter(Boolean).sort().pop() || null;
      applyImport(session.plan, { files: session.updateFiles?.length ? session.updateFiles : files.map((f) => f.name.replace(/^[0-9a-f]{8}-/, "")), generated: gen, addPeople: opts.people, id: session.updateId || null });
      toast("Import applied — the boards are up to date with Scigeniq");
      session = null;
      renderImport(root);
    } catch (e) { toast(e.message || "The import could not be applied"); }
  };
}
