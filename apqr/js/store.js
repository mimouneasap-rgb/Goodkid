// Application state: load/save to localStorage, edits with an audit trail, and undo.
// Every change goes through `commit`, which records who changed what and when.

import { createState, DEFAULT_SETTINGS, diffFields, blankProductExtras } from "./model.js";
import { SEED_META, PRODUCT_FIELDS, PRODUCT_ROWS, TASK_FIELDS, TASK_ROWS } from "./seed-data.js";

const STORAGE_KEY = "goodkid.apqr.state.v1";
const LOG_LIMIT = 5000;
const UNDO_LIMIT = 60;

export function seedState() {
  return createState({
    meta: SEED_META, productFields: PRODUCT_FIELDS, productRows: PRODUCT_ROWS, taskFields: TASK_FIELDS, taskRows: TASK_ROWS,
  });
}

/** Fill in fields added in later versions so older saved data keeps working. */
export function upgrade(state) {
  state.settings = { ...DEFAULT_SETTINGS, ...(state.settings || {}) };
  state.log = Array.isArray(state.log) ? state.log : [];
  const extras = blankProductExtras();
  state.products = (state.products || []).map((p) => ({
    ...extras, ...p,
    capa: { ...extras.capa, ...(p.capa || {}) },
    committee: p.committee || {},
    requirements: p.requirements || {},
    studies: Array.isArray(p.studies) ? p.studies : [],
  }));
  state.tasks = state.tasks || [];
  return state;
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { state: upgrade(JSON.parse(raw)), restored: true };
  } catch { /* storage blocked or corrupt: start from the seed */ }
  return { state: seedState(), restored: false };
}

export function createStore() {
  const loaded = load();
  let state = loaded.state;
  const undoStack = [];
  const listeners = new Set();
  let saveTimer = null;
  let saveError = null;

  const persist = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        saveError = null;
      } catch (err) {
        saveError = err;
      }
      listeners.forEach((fn) => fn({ saved: !saveError }));
    }, 150);
  };

  const emit = (info) => listeners.forEach((fn) => fn(info));

  const log = (entry) => {
    state.log.unshift({ ts: new Date().toISOString(), by: state.settings.userName || "Anonymous", ...entry });
    if (state.log.length > LOG_LIMIT) state.log.length = LOG_LIMIT;
  };

  /**
   * Apply a change. `mutate(state)` edits the draft in place and returns a list of
   * { kind, id, label, changes } describing what changed (changes may be computed
   * by the caller with `diffFields`). Snapshots of the touched collections make undo exact.
   */
  function commit(description, mutate, { undoable = true } = {}) {
    const before = { products: state.products, tasks: state.tasks, meta: state.meta };
    const draft = {
      ...state,
      products: structuredClone(state.products),
      tasks: structuredClone(state.tasks),
      settings: { ...state.settings },
      meta: structuredClone(state.meta),
    };
    const entries = mutate(draft) || [];
    const meaningful = entries.filter((e) => !e.changes || e.changes.length);
    state = { ...draft, log: state.log };
    if (meaningful.length) {
      for (const e of meaningful) log({ action: description, ...e });
    }
    if (undoable) {
      undoStack.push({ description, before });
      if (undoStack.length > UNDO_LIMIT) undoStack.shift();
    }
    persist();
    emit({ changed: true, description });
    return meaningful;
  }

  function undo() {
    const last = undoStack.pop();
    if (!last) return null;
    state = { ...state, ...last.before };
    log({ action: `Undo: ${last.description}`, kind: "undo" });
    persist();
    emit({ changed: true, description: `Undo ${last.description}` });
    return last.description;
  }

  /** Update one product's fields. */
  function updateProduct(id, patch, description = "Edit product") {
    return commit(description, (s) => {
      const p = s.products.find((x) => x.id === id);
      if (!p) return [];
      const before = structuredClone(p);
      Object.assign(p, patch);
      return [{ kind: "product", id, label: p.name, changes: diffFields(before, p, Object.keys(patch)) }];
    });
  }

  /** Update several tasks with the same patch (or a per-task function). */
  function updateTasks(ids, patch, description = "Edit task") {
    const set = new Set(ids);
    return commit(description, (s) => {
      const out = [];
      for (const t of s.tasks) {
        if (!set.has(t.id)) continue;
        const before = { ...t };
        Object.assign(t, typeof patch === "function" ? patch(t) : patch);
        out.push({ kind: "task", id: t.id, label: `${t.ref} · ${t.title}`, changes: diffFields(before, t) });
      }
      return out;
    });
  }

  function replaceState(next, description) {
    commit(description, (s) => {
      s.products = next.products;
      s.tasks = next.tasks;
      s.meta = next.meta;
      s.settings = { ...s.settings, ...next.settings };
      return [{ kind: "data", label: description }];
    });
  }

  return {
    get state() { return state; },
    get canUndo() { return undoStack.length > 0; },
    get lastUndo() { return undoStack.at(-1)?.description ?? ""; },
    get saveError() { return saveError; },
    restored: loaded.restored,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    commit, undo, updateProduct, updateTasks, replaceState,
    setSettings(patch, description = "Change settings") {
      return commit(description, (s) => {
        const before = { ...s.settings };
        Object.assign(s.settings, patch);
        return [{ kind: "settings", label: "Settings", changes: diffFields(before, s.settings, Object.keys(patch)) }];
      }, { undoable: false });
    },
    reset() {
      const fresh = seedState();
      fresh.settings = { ...fresh.settings, userName: state.settings.userName };
      replaceState(fresh, "Reset to source data");
    },
    clearLog() {
      state = { ...state, log: [] };
      persist();
      emit({ changed: true });
    },
  };
}
