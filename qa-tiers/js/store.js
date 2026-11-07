// Persistence for the two boards. Each tier is one JSON document in
// localStorage, seeded from the demo workbooks on first use. Every change is
// written to a small audit trail (what, which record, before → after).

import { DEMO_T1, DEMO_T2 } from "./demo-data.js";
import * as SITE from "./real-data.js";
const { REAL_T1, REAL_T2 } = SITE;
import { DEFAULT_ACTIVITIES, monthEnd, splitAuditCapa, PLAN_ROLES, normalizeTraining } from "./engine.js";
import { EDITION, hasTier } from "./edition.js";
import { ensureKeys, stateFrom, dedupe } from "./sync.js";

const KEYS = { t1: "qaTiers.t1.v1", t2: "qaTiers.t2.v1", prefs: "qaTiers.prefs.v1" };
const AUDIT_MAX = 300;

const clone = (o) => JSON.parse(JSON.stringify(o));
/** Planned QA work for the September 2026 demo (Task planner register). */
const DEMO_TASKS = [
  { id: "TSK-2609-01", member: "Release Officer", activity: "Batch record review (routine)", desc: "BMR / BPR review of the September oncology batches", opened: "2026-09-01", due: "2026-09-30", effort: 14, status: "In Progress" },
  { id: "TSK-2609-02", member: "Validation Specialist", activity: "Cleaning validation", desc: "Cleaning validation runs — OEB 5 compression isolator", opened: "2026-09-01", due: "2026-09-30", effort: 8, status: "In Progress" },
  { id: "TSK-2609-03", member: "Validation Specialist", activity: "Validation / qualification protocol review", link: "CC-26-030", desc: "OQ protocol review — capsule filler change parts (size 0)", opened: "2026-09-07", due: "2026-09-24", effort: 4, status: "Done", closed: "2026-09-23" },
  { id: "TSK-2609-04", member: "Validation Specialist", activity: "Validation / qualification protocol review", desc: "HVAC requalification report — warehouse quarantine zone", opened: "2026-09-21", due: "2026-10-09", effort: 5, status: "In Progress" },
  { id: "TSK-2609-05", member: "Documentation Officer", activity: "Document control & issuance (routine)", desc: "Issuance, retrieval and archiving of controlled copies", opened: "2026-09-01", due: "2026-09-30", effort: 8, status: "In Progress" },
  { id: "TSK-2609-06", member: "Documentation Officer", activity: "Other planned QA work", desc: "SOP periodic-review backlog clean-up (warehouse SOPs)", opened: "2026-09-08", due: "2026-09-25", effort: 5, status: "In Progress", comments: "Two SOPs still with reviewers" },
  { id: "TSK-2609-07", member: "QA Officer 1", activity: "Supplier audit", link: "CC-26-033", desc: "On-site audit of the secondary-packaging supplier", opened: "2026-09-21", due: "2026-09-23", status: "Done", closed: "2026-09-23" },
  { id: "TSK-2609-08", member: "QA Officer 2", activity: "Data-integrity / audit-trail review", desc: "Monthly HPLC and dissolution audit-trail review", opened: "2026-09-01", due: "2026-09-30", effort: 2, status: "In Progress" },
];

const uniq = (arr) => [...new Set(arr.filter((v) => v != null && v !== "" && v !== "—"))];

/** Extra drop-down lists that the workbooks kept as free text. */
function seedLists(tier, s) {
  if (tier === "t2") {
    const pick = (regs, keys) => regs.flatMap((r) => s[r].flatMap((row) => keys.map((k) => row[k])));
    s.lists.People ??= uniq([
      ...s.load.map((r) => r.member),
      ...pick(["dev", "capa", "cc", "insp", "doc", "apqr", "esc"], ["owner"]),
      ...pick(["insp"], ["inspector"]), ...pick(["trn"], ["trainer"]), ...pick(["rel"], ["officer"]),
    ]);
    s.lists.Departments ??= uniq([...pick(["cc"], ["initiator"]), ...pick(["doc"], ["dept"])]);
    s.lists.Products ??= uniq([...pick(["rel", "apqr"], ["product"])]);
    s.lists.Roles ??= uniq([...s.load.map((r) => r.role), "QA Inspector"]);
    s.lists.TaskStatus ??= ["Planned", "In Progress", "Done", "Cancelled"];
    s.activities ??= clone(DEFAULT_ACTIVITIES);
    // a stored demo gets the demo planner; any other board starts with an empty one
    s.tasks ??= /El Kendi/.test(s.setup.site) && s.setup.month === "2026-09-01" ? clone(DEMO_TASKS) : [];
    s.activities = s.activities.concat(DEFAULT_ACTIVITIES.filter((a) => !s.activities.some((x) => x.name === a.name)).map((a) => ({ ...a, role: REAL_ROLES[a.role] ?? a.role })));
    s.act ??= [];
    s.aud ??= []; s.find ??= []; s.rej ??= []; s.t1e ??= []; s.acapa ??= [];
    splitAuditCapa(s);
    s.lists.AudStandard ??= uniq(["GMP", "GDP", "GLP", "ISO 9001", "ICH Q10", ...(s.aud || []).map((r) => r.standard)]);
    s.lists.AuditAreas ??= uniq(["Quality Assurance", "Quality Control", "Manufacturing", "Packaging", "Warehouse", "Engineering", "IT Infrastructure", ...(s.aud || []).map((r) => r.areas), ...(s.find || []).map((r) => r.area)]);
    s.lists.BatchType ??= uniq(["Industrial", "Registration", "Validation", "Pilot", "Commercial", ...(s.rej || []).map((r) => String(r.btype ?? "").trim()).filter((v) => /[a-z]/i.test(v))]);
    const TR_TYPES = ["SOP (annual plan)", "GMP chapter", "HSE periodic topic", "Basic GMP", "Environment (ISO 14001)", "Revised SOP", "New SOP", "Quality Circle", "Corporate", "Audit / CAPA driven", "On the job", "Induction / New Hire", "External course", "Other"];
    s.lists.TrType = uniq([...TR_TYPES, ...(s.lists.TrType || []).filter((t) => !["GMP", "SOP", "Containment / HSE", "Data Integrity", "Technical", "Induction / New Hire"].includes(t) || (s.trn || []).some((r) => r.type === t))]);
    s.lists.TrCat = ["Planned", "Unplanned", "External"];
    s.lists.TrStatus = uniq(["Planned", "Rescheduled", "In Progress", "Completed", "Cancelled", ...(s.lists.TrStatus || [])]);
    s.lists.TrAudience ??= ["QA", "Other departments"];
    s.lists.TrPlanRoles ??= [...PLAN_ROLES];
    s.lists.BRStatus = uniq([...(s.lists.BRStatus || ["Waiting", "Under Review", "On Hold", "Released", "Rejected"]), "Not for release"]);
    s.lists.LotType ??= ["Commercial", "Registration"];
    s.lists.WipStatus ??= ["Conform", "Non conform", "Under CAPA — waiting decision", "Under rejection"];
    s.lists.WipSteps ??= ["Dispensing", "Granulation", "Blending", "Compression", "Coating", "Encapsulation", "Packaging"];
    s.lists.WipResp ??= ["Production", "R&D", "QA", "QC"];
    // the values the WIP master uses are always in the lists
    s.lists.WipSteps = uniq([...s.lists.WipSteps, ...s.rel.map((r) => r.wipStep)]);
    s.lists.WipResp = uniq([...s.lists.WipResp, ...s.rel.map((r) => r.wipResp)]);
    s.lists.TrMode ??= ["Trainer-led", "Read & understood", "Trainer-led + read & understood"];
    normalizeTraining(s);
    if (s.kpis?.[8] && /sessions due to date/.test(s.kpis[8].def || "")) s.kpis[8] = { ...s.kpis[8], def: "Annual plan: employees trained ÷ to be trained (topics due to date)" };
    s.lists.T1EStatus ??= ["Open", "In Progress", "Resolved", "Escalated to Tier 3"];
    s.lists.Pillars ??= ["S · Safety", "Q · Quality", "D · Delivery", "C · Compliance", "P · People"];
    s.lists.RejStatus ??= ["Open", "In Progress", "Pending Signature", "Closed"];
    s.lists.RejType ??= ["Raw material", "Packaging material", "Intermediate / bulk", "Validation batch", "Finished product"];
    s.lists.AudKind ??= ["Plan", "Audit"];
    s.lists.AudType ??= ["Internal", "Supplier", "External Authority"];
    s.lists.AudRisk ??= ["Low Risk", "Moderate Risk", "High Risk", "N/A"];
    s.lists.AudStatus ??= ["Open", "Preparation", "Findings In Progress", "Pending Approval", "Completed", "Canceled"];
    s.lists.FindType ??= ["Documentation", "Equipment and Facilities", "Material", "Production", "Quality Assurance", "Quality Control", "Data Integrity", "Environmental Monitoring", "Safety", "Personnel / training", "Other"];
    s.lists.FindStatus ??= ["Open", "Pending Response", "Completed", "Canceled"];
    for (const [l, v] of [["DevStatus", "Canceled"], ["CAPAStatus", "Canceled"], ["CCStatus", "Canceled"], ["ActParent", "Audit"], ["ActParent", "APQR"], ["ActParent", "Standalone"]]) if (s.lists[l] && !s.lists[l].includes(v)) s.lists[l].push(v);
    s.lists.ActStatus ??= ["Open", "In Progress", "QA Approval", "Done", "Cancelled"];
    s.lists.ActParent ??= ["Quality Event", "CAPA", "Change Control"];
    s.lists.Tier3 ??= uniq(["Site Quality Head", "Plant Management", ...pick(["esc"], ["to"])]);
  } else {
    s.lists.Owners ??= uniq(s.fn.map((r) => r.owner));
    s.lists.Products ??= uniq(s.br.map((r) => r.product));
  }
  return s;
}

/** Typical roles of the effort catalogue, in the job titles of the QA personnel list. */
const REAL_ROLES = {
  "QA Officer — oncology line": "QA Officer", "Senior QA Officer — board owner": "QA Senior Officer",
  "QA Batch Release": "QA Officer", "QA Validation": "QA Section Head", "QA Documentation": "QA Documentation Officer",
};

/** A new board: the imported El Kendi data (default) or the September 2026 demo. */
/** Whether this copy of the app carries site data (see real-data.js). */
const realOf = (tier) => (tier === "t1" ? REAL_T1 : REAL_T2);
/** This copy ships site data for every tier it shows (a single-tier app ships only its own tier). */
export const HAS_REAL = EDITION.tiers.every((t) => !!realOf(t));
/** Whether the boards hold site data — shipped with this copy, or already on the shared board.
 * A real board never offers the demo, whichever copy of the app opens it. */
/** The site data this copy ships: its dataset id, name, date and what it holds. */
export const REAL_INFO = {
  dataset: "elkendi-2026-10-30", label: "The El Kendi data", date: "30/10/2026",
  sources: "shop-floor batch records, sampling, line clearance and IPC, oncology deviations, the APQR programme and the QA personnel list",
  summary: "11 QA staff from QA0007E/Onc/TE01, 359 officer-days of shop-floor activity, 51 batches, 75 batch-record reviews, 19 oncology deviations (QE-KO), 163 APQRs and 136 Scigeniq tasks",
  ...(SITE.REAL_META || {}),
};
export const isRealBoard = () => HAS_REAL || EDITION.tiers.some((t) => String(store[t]?.dataset || "").startsWith("elkendi"));
/** The September 2026 demo is offered only by a demo edition on a board without site data. */
export const demoAllowed = () => !isRealBoard() && EDITION.start === "demo";
/** Where a new board starts when nothing says otherwise. */
export const DEFAULT_SOURCE = HAS_REAL ? "real" : EDITION.start;

const T1_REGS = ["dl", "br", "fn", "ac", "hd", "tr"];
const T2_REGS = ["dev", "capa", "cc", "insp", "rel", "doc", "load", "apqr", "trn", "esc", "tasks", "act", "aud", "find", "rej", "t1e", "acapa"];
const isoToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

/** An empty board for the edition's reporting month: the standard lists,
 * KPI targets, skills and QA activity catalogue, no records, no people. */
function blankState(tier) {
  const s = seedLists(tier, clone(tier === "t1" ? DEMO_T1 : DEMO_T2));
  const m = EDITION.month, end = monthEnd(m), t = isoToday();
  const day = t >= m && t <= end ? t : m;
  if (tier === "t2") {
    for (const r of T2_REGS) s[r] = [];
    s.daily = {};
    s.trend = { year: +m.slice(0, 4), rows: s.trend.rows.map(() => Array(12).fill(null)) };
    Object.assign(s.setup, { month: m, statusDate: day, reviewDate: end, owner: "", ownerRole: "", remarks: "", otherStatus: "" });
    s.lists.People = []; s.lists.Products = [];
    s.activities = clone(DEFAULT_ACTIVITIES);
    s.tasks = [];
  } else {
    for (const r of T1_REGS) s[r] = [];
    s.roster = []; s.skills = [];
    Object.assign(s.setup, { selDate: day, lastIncident: "", owner: "" });
    s.lists.Owners = []; s.lists.Products = [];
  }
  s.close = {}; s.routine = {};
  s.audit = [];
  s.dataset = `blank-${m.slice(0, 7)}`;
  return s;
}

function fresh(tier, source = DEFAULT_SOURCE) {
  // a tier this copy has no site data for (e.g. the other tier of a single-tier app) starts blank
  if (source === "blank" || (source === "real" && !realOf(tier) && (EDITION.start === "blank" || !hasTier(tier)))) return blankState(tier);
  const real = source === "real" && !!realOf(tier);
  const s = clone(tier === "t1" ? (real ? REAL_T1 : DEMO_T1) : (real ? REAL_T2 : DEMO_T2));
  s.audit = [];
  s.dataset = real ? REAL_INFO.dataset : "demo-2026-09";
  if (tier === "t2") {
    s.activities ??= clone(DEFAULT_ACTIVITIES).map((a) => (real ? { ...a, role: REAL_ROLES[a.role] ?? a.role } : a));
    if (!real) s.tasks ??= clone(DEMO_TASKS);
  }
  return seedLists(tier, s);
}

/** Records of the site data this copy ships that the shared board lacks — an
 * upload cut short when the page closed. Only on a board loaded from that same
 * site data, never for records deleted on purpose. Returns how many were added. */
const siteCache = {};
function fillFromSite(tier, s) {
  const src = realOf(tier);
  if (!src || s.dataset !== REAL_INFO.dataset || s.fill === "off") return 0;
  const site = (siteCache[tier] ??= (() => { const x = clone(src); if (tier === "t2") splitAuditCapa(x); return x; })());
  const gone = new Set(s.removed || []);
  const idOf = (r) => r?.id ?? r?.member;
  const regs = Object.keys(site).filter((k) => Array.isArray(site[k]) && Array.isArray(s[k]) && site[k].some((r) => r && typeof r === "object" && idOf(r) != null));
  const capaIds = new Set([...(s.capa || []), ...(s.acapa || [])].map(idOf));
  let n = 0;
  // fields the site data gained since the board was loaded (batch steps): filled where empty, never overwritten
  const ADD = { rel: ["lotType", "fabStart", "mfgEnd", "packStart", "mfg", "bmr", "bpr", "wipStep", "wipStatus", "wipResp", "tf", "qty", "relQty", "rejQty", "rejRef"] };
  for (const [reg, keys] of Object.entries(ADD)) {
    const byId = new Map((site[reg] || []).map((r) => [idOf(r), r]));
    for (const r of s[reg] || []) {
      const src = byId.get(idOf(r));
      if (!src) continue;
      for (const k of keys) if ((r[k] == null || r[k] === "") && src[k] != null && src[k] !== "" && !(r._cleared || []).includes(k)) { r[k] = src[k]; n++; }
    }
  }
  for (const reg of regs) {
    const have = reg === "capa" || reg === "acapa" ? capaIds : new Set(s[reg].map(idOf));
    let o = s[reg].length ? Math.max(...s[reg].map((r) => r._o ?? 0)) + 1 : 0;
    for (const r of site[reg]) {
      const id = idOf(r);
      if (id == null || id === "" || have.has(id) || gone.has(`${reg}/${id}`) || (reg === "capa" || reg === "acapa") && gone.has(`capa/${id}`)) continue;
      s[reg].push({ ...r, _o: o++ }); have.add(id); n++;
    }
  }
  return n;
}

function read(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}
function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}

export const store = {
  t1: null,
  t2: null,
  prefs: { theme: "system", learned: {}, quiz: {} },
  listeners: new Set(),
  /** The team sync, once the shared database is connected (see sync.js). */
  sync: null,
  /** Read-only view of another copy of the boards (an archived month, the
   * practice sandbox): { kind, label }. The live boards wait in `live`. */
  viewing: null,
  live: null,

  load() {
    for (const tier of ["t1", "t2"]) {
      const saved = read(KEYS[tier]);
      // boards saved by an earlier version get the lists and registers added since
      this[tier] = ensureKeys(tier, saved ? seedLists(tier, { audit: [], ...saved }) : fresh(tier));
    }
    this.prefs = { ...this.prefs, ...(read(KEYS.prefs) || {}) };
  },
  save(tier) {
    if (tier && this.viewing) { this.listeners.forEach((fn) => fn(tier, "blocked")); return; }
    if (tier) {
      if (tier === "t2") { splitAuditCapa(this.t2); normalizeTraining(this.t2); } // audit CAPA to their register; plan topics on the mandatory group
      ensureKeys(tier, this[tier]);
      write(KEYS[tier], this[tier]);
      this.sync?.push(tier, this[tier]);
    }
    write(KEYS.prefs, this.prefs);
    this.listeners.forEach((fn) => fn(tier, "local"));
  },
  /** Start sharing: `upload` sends this browser's boards to an empty store. */
  attachSync(sync, { upload = false } = {}) {
    this.sync = sync;
    if (upload) for (const t of ["t1", "t2"]) if (hasTier(t)) sync.push(t, this[t]);
  },
  /** A teammate changed something: rebuild that board from the shared copy. */
  applyRemote(tier) {
    if (tier === "audit") { this.listeners.forEach((fn) => fn(tier, "remote")); return; }
    if (!hasTier(tier)) return; // the other tier lives in its own app
    if (!this.sync?.ready(tier)) return;
    const host = this.viewing ? this.live : this; // a teammate's change lands on the live board, not on the view
    const raw = stateFrom(tier, this.sync.remote[tier], host[tier]);
    this.sync.rebase(tier, raw);
    const next = seedLists(tier, raw);
    const copies = dedupe(tier, next); // copies left by a double upload: removed for everyone by the push below
    if (copies) this.listeners.forEach((fn) => fn(tier, "deduped", copies));
    const filled = fillFromSite(tier, next); // records of the site data an interrupted upload never sent
    if (filled) this.listeners.forEach((fn) => fn(tier, "filled", filled));
    next.audit = host[tier]?.audit || [];
    host[tier] = ensureKeys(tier, next);
    write(KEYS[tier], host[tier]);
    this.sync.push(tier, host[tier]); // lists added by this version, if any
    if (!this.viewing) this.listeners.forEach((fn) => fn(tier, "remote"));
  },
  onChange(fn) { this.listeners.add(fn); },

  /** Show another copy of the boards, read-only. */
  enterView(t1, t2, info, { silent = false } = {}) {
    if (!this.viewing) this.live = { t1: this.t1, t2: this.t2 };
    this.t1 = seedLists("t1", t1); this.t2 = seedLists("t2", t2);
    this.viewing = info;
    if (!silent) this.listeners.forEach((fn) => fn(null, "view"));
  },
  /** Back to the live boards (with any teammate changes that arrived meanwhile). */
  exitView() {
    if (!this.viewing) return;
    this.t1 = this.live.t1; this.t2 = this.live.t2;
    this.viewing = null; this.live = null;
    this.listeners.forEach((fn) => fn(null, "view"));
  },

  log(tier, entry) {
    if (this.viewing) return;
    const a = this[tier].audit;
    const row = { ts: new Date().toISOString(), ...entry };
    a.unshift(row);
    this.sync?.pushAudit([{ tier, ...row }]);
    if (a.length > AUDIT_MAX) a.length = AUDIT_MAX;
  },

  /** Insert or replace record `index` of a register; returns the index. */
  upsert(tier, reg, index, record, label) {
    const rows = this[tier][reg];
    const before = index == null ? null : rows[index];
    // keep the record's identity (shared-document key and display order)
    record._k = before?._k ?? record._k;
    record._o = before?._o ?? (rows.length ? Math.max(...rows.map((r) => r._o ?? 0)) + 1 : 0);
    if (index == null) delete record._k;
    const changes = diff(before || {}, record);
    if (index == null) { rows.push(record); index = rows.length - 1; }
    else rows[index] = record;
    if (changes.length || !before) this.log(tier, { reg, ref: label, action: before ? "edit" : "create", changes });
    this.save(tier);
    return index;
  },
  remove(tier, reg, index, label) {
    const [gone] = this[tier][reg].splice(index, 1);
    // remembered, so the site-data repair never brings a deleted record back
    const id = gone?.id ?? gone?.member;
    if (id != null && id !== "") this[tier].removed = [...new Set([...(this[tier].removed || []), `${reg}/${id}`])].slice(-2000);
    this.log(tier, { reg, ref: label, action: "delete", changes: [] });
    this.save(tier);
  },
  patch(tier, path, value, label) {
    let obj = this[tier];
    for (const k of path.slice(0, -1)) obj = obj[k] ??= {};
    const key = path[path.length - 1];
    const old = obj[key];
    if (old === value || ((old == null || old === "") && (value == null || value === ""))) return;
    if (value === "" || value == null) delete obj[key]; else obj[key] = value;
    if (tier === "t1" && key === "selDate") { this.save(tier); return; } // a personal view setting, not a change to the board
    this.log(tier, { reg: path[0], ref: label, action: "edit", changes: [{ field: key, from: old ?? "", to: value ?? "" }] });
    this.save(tier);
  },

  reset(tier, source = DEFAULT_SOURCE) { this[tier] = ensureKeys(tier, fresh(tier, source)); this.save(tier); },
  /** Empty registers, keeping setup, lists, KPI targets and roster. */
  blank(tier) {
    if (EDITION.start === "blank" && !HAS_REAL) { // a clean start for the edition month, keeping this board's setup
      const keep = this[tier];
      const s = blankState(tier);
      for (const k of ["setup", "lists", "kpis", "roster", "activities", "skillNames"]) if (keep?.[k] !== undefined) s[k] = clone(keep[k]);
      if (tier === "t2") s.trend.year = keep?.trend?.year ?? s.trend.year;
      this[tier] = s; this.save(tier); return;
    }
    const s = fresh(tier, "real");
    const regs = tier === "t1" ? ["dl", "br", "fn", "ac", "hd", "tr"] : ["dev", "capa", "cc", "insp", "rel", "doc", "apqr", "trn", "esc", "tasks", "act", "aud", "find", "rej", "t1e", "acapa"];
    for (const r of regs) s[r] = [];
    s.fill = "off"; // emptied on purpose: never refilled from the site data
    if (tier === "t2") { s.daily = {}; s.trend.rows = s.trend.rows.map(() => Array(12).fill(null)); }
    this[tier] = s; this.save(tier);
  },
  exportJSON() {
    return JSON.stringify({ app: "qa-tiers", version: 1, exported: new Date().toISOString(), t1: this.t1, t2: this.t2 }, null, 1);
  },
  importJSON(text) {
    const data = JSON.parse(text);
    if (data.app !== "qa-tiers" || !data.t1 || !data.t2) throw new Error("This file is not a QA Tier Boards backup.");
    this.t1 = seedLists("t1", data.t1); this.t2 = seedLists("t2", data.t2);
    this.t1.audit ??= []; this.t2.audit ??= [];
    this.save("t1"); this.save("t2");
  },
};

function diff(a, b) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const out = [];
  for (const k of keys) {
    if (k.startsWith("_")) continue;
    const x = a[k] ?? "", y = b[k] ?? "";
    if (String(x) !== String(y)) out.push({ field: k, from: x, to: y });
  }
  return out;
}
