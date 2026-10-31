// App state: load/save to localStorage, recompute the model on every change,
// keep an audit trail of edits and one level of undo for bulk operations.
//
// A published copy of the page carries its data in <script id="apqr-seed">.
// Each viewer works on a local copy; meta.basedOn records which published
// version it started from and meta.dirty whether it has unpublished changes.
// When a newer version is published, a clean local copy follows it
// automatically; one with changes keeps them and offers the newer version.
import { compute, todayIso } from "./engine.js";

const KEY = "apqr-master-tracker-v1";
const AUDIT_MAX = 3000;

export function emptyState() {
  return {
    version: 3,
    meta: { programme: "APQR Master Tracker", organisation: "", planRef: "", source: "", sourceDate: "", importedAt: "", user: "", publishedAt: "", publishedBy: "", basedOn: "", dirty: false },
    settings: { reportDate: todayIso(), useToday: true, overdueMonths: 3, dueSoonDays: 14, triggerWindowDays: 60 },
    baseline: null,
    plan: [],
    tasks: [],
    products: {},
    excluded: [],
    audit: [],
  };
}

function merge(base, s) {
  return { ...base, ...s, meta: { ...base.meta, ...s.meta }, settings: { ...base.settings, ...s.settings } };
}

/** Data embedded in the page (a published copy carries the user's tracker). */
function readSeed() {
  try {
    const el = typeof document !== "undefined" && document.getElementById("apqr-seed");
    return el ? JSON.parse(el.textContent) : null;
  } catch { return null; }
}
const seedId = (seed) => seed?.meta?.publishedAt || seed?.meta?.importedAt || "";
export const hasSeed = () => !!readSeed();
export function seedState() {
  const seed = readSeed();
  if (!seed) return emptyState();
  const s = merge(emptyState(), seed);
  s.meta.basedOn = seedId(seed);
  s.meta.dirty = false;
  return s;
}
export function seedInfo() {
  const seed = readSeed();
  return seed ? { id: seedId(seed), publishedAt: seed.meta?.publishedAt || "", publishedBy: seed.meta?.publishedBy || "", importedAt: seed.meta?.importedAt || "", source: seed.meta?.source || "" } : null;
}

let newerSeed = false;
let state = load();
let model = compute(state);
let undoSnapshot = null;
const listeners = new Set();

function load() {
  let local = null;
  try {
    const s = localStorage.getItem(KEY);
    if (s) local = merge(emptyState(), JSON.parse(s));
  } catch { /* storage unavailable or corrupt */ }
  const seed = readSeed();
  if (!local) return seedState();
  if (seed && seedId(seed) && local.meta.basedOn !== seedId(seed)) {
    if (!local.meta.dirty) return seedState();
    newerSeed = true;
  }
  return local;
}

let saveTimer;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (e) { listeners.forEach((fn) => fn({ type: "save-error", error: e })); }
  }, 120);
}
/** Write immediately (before the page reloads after a team publish). */
export function flush() {
  clearTimeout(saveTimer);
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ignore */ }
}

export const getState = () => state;
export const getModel = () => model;
export const hasData = () => state.plan.length > 0 || state.tasks.length > 0;
export const canUndo = () => !!undoSnapshot;
export const isDirty = () => !!state.meta.dirty;
export const hasNewerTeamVersion = () => newerSeed;

export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit(detail) { model = compute(state); listeners.forEach((fn) => fn(detail || { type: "change" })); }

/**
 * Change state. `fn` mutates the draft. `audit` is an array of
 * { entity, key, label, field, from, to } entries to append to the trail.
 */
export function update(fn, { audit = [], undoable = false, label, clean = false } = {}) {
  if (undoable) undoSnapshot = { json: JSON.stringify(state), label };
  fn(state);
  if (audit.length) {
    const at = new Date().toISOString();
    const user = state.meta.user || "local user";
    for (const a of audit) state.audit.unshift({ at, user, ...a });
    if (state.audit.length > AUDIT_MAX) state.audit.length = AUDIT_MAX;
  }
  if (!clean) state.meta.dirty = true;
  persist();
  emit();
}

export function replace(next, { label = "Replace data", clean = false } = {}) {
  undoSnapshot = { json: JSON.stringify(state), label };
  state = merge(emptyState(), next);
  state.meta.dirty = !clean;
  persist();
  emit({ type: "replace" });
}

/** Take the published version, discarding local changes. */
export function adoptSeed() {
  undoSnapshot = { json: JSON.stringify(state), label: "Load team version" };
  state = seedState();
  newerSeed = false;
  persist();
  emit({ type: "replace" });
}
export function dismissNewer() { newerSeed = false; emit(); }

/** Record that the current state is now the published team version. */
export function markPublished({ at, by }) {
  state.meta.publishedAt = at;
  state.meta.publishedBy = by;
  state.meta.basedOn = at;
  state.meta.dirty = false;
  newerSeed = false;
  flush();
}

export function undo() {
  if (!undoSnapshot) return false;
  state = JSON.parse(undoSnapshot.json);
  undoSnapshot = null;
  persist();
  emit({ type: "replace" });
  return true;
}

export const refresh = () => emit();
