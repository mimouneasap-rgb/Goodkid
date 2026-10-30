// Persistence for the two boards. Each tier is one JSON document in
// localStorage, seeded from the demo workbooks on first use. Every change is
// written to a small audit trail (what, which record, before → after).

import { DEMO_T1, DEMO_T2 } from "./demo-data.js";
import { REAL_T1, REAL_T2 } from "./real-data.js";
import { DEFAULT_ACTIVITIES } from "./engine.js";
import { ensureKeys, stateFrom } from "./sync.js";

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
export const HAS_REAL = !!(REAL_T1 && REAL_T2);

function fresh(tier, source = "real") {
  const real = source === "real" && HAS_REAL;
  const s = clone(tier === "t1" ? (real ? REAL_T1 : DEMO_T1) : (real ? REAL_T2 : DEMO_T2));
  s.audit = [];
  s.dataset = real ? "elkendi-2026-10-30" : "demo-2026-09";
  if (tier === "t2") {
    s.activities ??= clone(DEFAULT_ACTIVITIES).map((a) => (real ? { ...a, role: REAL_ROLES[a.role] ?? a.role } : a));
    if (!real) s.tasks ??= clone(DEMO_TASKS);
  }
  return seedLists(tier, s);
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

  load() {
    for (const tier of ["t1", "t2"]) {
      const saved = read(KEYS[tier]);
      // boards saved by an earlier version get the lists and registers added since
      this[tier] = ensureKeys(tier, saved ? seedLists(tier, { audit: [], ...saved }) : fresh(tier));
    }
    this.prefs = { ...this.prefs, ...(read(KEYS.prefs) || {}) };
  },
  save(tier) {
    if (tier) {
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
    if (upload) { sync.push("t1", this.t1); sync.push("t2", this.t2); }
  },
  /** A teammate changed something: rebuild that board from the shared copy. */
  applyRemote(tier) {
    if (tier === "audit") { this.listeners.forEach((fn) => fn(tier, "remote")); return; }
    if (!this.sync?.ready(tier)) return;
    const raw = stateFrom(tier, this.sync.remote[tier], this[tier]);
    this.sync.rebase(tier, raw);
    const next = seedLists(tier, raw);
    next.audit = this[tier]?.audit || [];
    this[tier] = ensureKeys(tier, next);
    write(KEYS[tier], this[tier]);
    this.sync.push(tier, this[tier]); // lists added by this version, if any
    this.listeners.forEach((fn) => fn(tier, "remote"));
  },
  onChange(fn) { this.listeners.add(fn); },

  log(tier, entry) {
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
    this[tier][reg].splice(index, 1);
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

  reset(tier, source = "real") { this[tier] = ensureKeys(tier, fresh(tier, source)); this.save(tier); },
  /** Empty registers, keeping setup, lists, KPI targets and roster. */
  blank(tier) {
    const s = fresh(tier, "real");
    const regs = tier === "t1" ? ["dl", "br", "fn", "ac", "hd", "tr"] : ["dev", "capa", "cc", "insp", "rel", "doc", "apqr", "trn", "esc", "tasks", "act"];
    for (const r of regs) s[r] = [];
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
