// App state: load/save to localStorage, recompute the model on every change,
// keep an audit trail of edits and one level of undo for bulk operations.
import { compute, todayIso } from "./engine.js";

const KEY = "apqr-master-tracker-v1";
const AUDIT_MAX = 3000;

export function emptyState() {
  return {
    version: 1,
    meta: { programme: "APQR Master Tracker", organisation: "", planRef: "", source: "", sourceDate: "", importedAt: "", user: "" },
    settings: { reportDate: todayIso(), useToday: true, overdueMonths: 3, dueSoonDays: 14, triggerWindowDays: 60 },
    baseline: null,
    plan: [],
    tasks: [],
    products: {},
    excluded: [],
    audit: [],
  };
}

let state = load();
let model = compute(state);
let undoSnapshot = null;
const listeners = new Set();

function load() {
  try {
    const s = localStorage.getItem(KEY);
    if (s) {
      const parsed = JSON.parse(s);
      const base = emptyState();
      return { ...base, ...parsed, meta: { ...base.meta, ...parsed.meta }, settings: { ...base.settings, ...parsed.settings } };
    }
  } catch { /* storage unavailable or corrupt: start empty */ }
  return emptyState();
}

let saveTimer;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (e) { listeners.forEach((fn) => fn({ type: "save-error", error: e })); }
  }, 120);
}

export const getState = () => state;
export const getModel = () => model;
export const hasData = () => state.plan.length > 0 || state.tasks.length > 0;
export const canUndo = () => !!undoSnapshot;

export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit(detail) { model = compute(state); listeners.forEach((fn) => fn(detail || { type: "change" })); }

/**
 * Change state. `fn` mutates the draft. `audit` is an array of
 * { entity, key, label, field, from, to } entries to append to the trail.
 */
export function update(fn, { audit = [], undoable = false, label } = {}) {
  if (undoable) undoSnapshot = { json: JSON.stringify(state), label };
  fn(state);
  if (audit.length) {
    const at = new Date().toISOString();
    const user = state.meta.user || "local user";
    for (const a of audit) state.audit.unshift({ at, user, ...a });
    if (state.audit.length > AUDIT_MAX) state.audit.length = AUDIT_MAX;
  }
  persist();
  emit();
}

export function replace(next, { label = "Replace data" } = {}) {
  undoSnapshot = { json: JSON.stringify(state), label };
  const base = emptyState();
  state = { ...base, ...next, meta: { ...base.meta, ...next.meta }, settings: { ...base.settings, ...next.settings } };
  persist();
  emit({ type: "replace" });
}

export function undo() {
  if (!undoSnapshot) return false;
  state = JSON.parse(undoSnapshot.json);
  undoSnapshot = null;
  persist();
  emit({ type: "replace" });
  return true;
}

/** Recompute without changing state (e.g. when "use today" crosses midnight). */
export const refresh = () => emit();
