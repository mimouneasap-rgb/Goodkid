// Application state: edits with a change history and undo, saved to browser
// storage. Every change goes through `commit`, which works out exactly which
// products and tasks changed; undo reverses only those, and an attached shared
// workspace (see sync.js) receives the same list of changes.

import { createState, DEFAULT_SETTINGS, diffFields, blankProductExtras } from "./model.js";
import { SEED_META, PRODUCT_FIELDS, PRODUCT_ROWS, TASK_FIELDS, TASK_ROWS } from "./seed-data.js";

const LOCAL_KEY = "goodkid.apqr.state.v1";
const SHARED_CACHE_KEY = "goodkid.apqr.shared-cache.v1";
const LOG_LIMIT = 5000;
const UNDO_LIMIT = 60;

export function seedState() {
  return createState({
    meta: SEED_META, productFields: PRODUCT_FIELDS, productRows: PRODUCT_ROWS, taskFields: TASK_FIELDS, taskRows: TASK_ROWS,
  });
}

export function upgradeProduct(p) {
  const extras = blankProductExtras();
  return {
    ...extras, ...p,
    capa: { ...extras.capa, ...(p.capa || {}) },
    committee: p.committee || {},
    requirements: p.requirements || {},
    studies: Array.isArray(p.studies) ? p.studies : [],
  };
}

/** Fill in fields added in later versions so older saved data keeps working. */
export function upgrade(state) {
  state.settings = { ...DEFAULT_SETTINGS, ...(state.settings || {}) };
  state.log = Array.isArray(state.log) ? state.log : [];
  state.products = (state.products || []).map(upgradeProduct);
  state.tasks = state.tasks || [];
  state.meta = state.meta || structuredClone(SEED_META);
  return state;
}

export const byPlanOrder = (a, b) => (a.planNo ?? Infinity) - (b.planNo ?? Infinity) || String(a.id).localeCompare(String(b.id));
export const byId = (a, b) => String(a.id).localeCompare(String(b.id));

/**
 * Records that differ between two versions of the products and tasks lists:
 * [{ kind: "product"|"task", id, before, after }], with null for a record that
 * did not exist on that side.
 */
export function diffRecords(before, after) {
  const out = [];
  for (const [kind, key] of [["product", "products"], ["task", "tasks"]]) {
    const a = new Map(before[key].map((r) => [r.id, r]));
    const b = new Map(after[key].map((r) => [r.id, r]));
    for (const [id, rec] of b) {
      const old = a.get(id);
      if (old === rec) continue;
      if (!old || JSON.stringify(old) !== JSON.stringify(rec)) out.push({ kind, id, before: old ?? null, after: rec });
    }
    for (const [id, old] of a) if (!b.has(id)) out.push({ kind, id, before: old, after: null });
  }
  return out;
}

/** Apply record changes ({ kind, id, after }) to the lists, keeping their order. */
export function applyRecords(state, changes) {
  const next = { products: [...state.products], tasks: [...state.tasks] };
  for (const c of changes) {
    const list = c.kind === "product" ? next.products : next.tasks;
    const i = list.findIndex((r) => r.id === c.id);
    if (c.after === null) { if (i >= 0) list.splice(i, 1); }
    else if (i >= 0) list[i] = c.after;
    else list.push(c.after);
  }
  next.products.sort(byPlanOrder);
  next.tasks.sort(byId);
  return next;
}

function load(key) {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return { state: upgrade(JSON.parse(raw)), restored: true };
  } catch { /* storage blocked or corrupt: start from the seed */ }
  return { state: seedState(), restored: false };
}

export function createStore({ shared = false } = {}) {
  const storageKey = shared ? SHARED_CACHE_KEY : LOCAL_KEY;
  const loaded = load(storageKey);
  let state = loaded.state;
  const undoStack = [];
  const listeners = new Set();
  let saveTimer = null;
  let saveError = null;
  let remote = null; // { push(changes), log(entries) } while a shared workspace is attached
  let readOnly = false;

  const persist = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(storageKey, JSON.stringify(state));
        saveError = null;
      } catch (err) {
        saveError = err;
      }
      listeners.forEach((fn) => fn({ saved: !saveError }));
    }, 150);
  };

  const emit = (info) => listeners.forEach((fn) => fn(info));

  const record = (entries) => {
    if (!entries.length) return;
    const ts = new Date().toISOString();
    const by = state.settings.userName || (remote ? "" : "Anonymous");
    const stamped = entries.map((e) => ({ ts, by, uid: remote?.uid || undefined, ...e }));
    state.log = [...stamped, ...state.log].slice(0, LOG_LIMIT);
    remote?.log(stamped);
  };

  /**
   * Apply a change. `mutate(draft)` edits a copy of the state in place and
   * returns [{ kind, id, label, changes }] for the change history.
   */
  function commit(description, mutate, { undoable = true, local = false } = {}) {
    if (readOnly && !local) {
      emit({ blocked: true });
      return [];
    }
    const draft = {
      ...state,
      products: structuredClone(state.products),
      tasks: structuredClone(state.tasks),
      settings: { ...state.settings },
      meta: structuredClone(state.meta),
    };
    const entries = mutate(draft) || [];
    const changes = local ? [] : diffRecords(state, draft);
    state = { ...draft, log: state.log };
    record(entries.filter((e) => !e.changes || e.changes.length).map((e) => ({ action: description, ...e })));
    if (undoable && changes.length) {
      undoStack.push({ description, changes });
      if (undoStack.length > UNDO_LIMIT) undoStack.shift();
    }
    if (changes.length) remote?.push(changes);
    persist();
    emit({ changed: true, description });
    return entries.filter((e) => !e.changes || e.changes.length);
  }

  /** Reverse the last change, touching only the records it changed. */
  function undo() {
    if (readOnly) { emit({ blocked: true }); return null; }
    const last = undoStack.pop();
    if (!last) return null;
    const current = new Map([...state.products.map((r) => [`product|${r.id}`, r]), ...state.tasks.map((r) => [`task|${r.id}`, r])]);
    const inverse = last.changes.map((c) => ({ kind: c.kind, id: c.id, before: current.get(`${c.kind}|${c.id}`) ?? null, after: c.before }));
    state = { ...state, ...applyRecords(state, inverse) };
    record([{ action: `Undo: ${last.description}`, kind: "undo" }]);
    remote?.push(inverse);
    persist();
    emit({ changed: true, description: `Undo ${last.description}` });
    return last.description;
  }

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
      s.products = next.products.map(upgradeProduct).sort(byPlanOrder);
      s.tasks = [...next.tasks].sort(byId);
      s.meta = next.meta;
      s.settings = { ...s.settings, ...next.settings };
      return [{ kind: "data", label: description }];
    });
  }

  return {
    get state() { return state; },
    get canUndo() { return undoStack.length > 0 && !readOnly; },
    get lastUndo() { return undoStack.at(-1)?.description ?? ""; },
    get saveError() { return saveError; },
    get readOnly() { return readOnly; },
    get shared() { return Boolean(remote); },
    restored: loaded.restored,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    commit, undo, updateProduct, updateTasks, replaceState,
    setSettings(patch, description = "Change settings") {
      // Settings belong to this viewer: never shared, never blocked.
      return commit(description, (s) => {
        Object.assign(s.settings, patch);
        return [];
      }, { undoable: false, local: true });
    },
    reset() {
      const fresh = seedState();
      fresh.settings = { ...state.settings };
      replaceState(fresh, "Reset to source data");
    },
    clearLog() {
      state = { ...state, log: [] };
      persist();
      emit({ changed: true });
    },

    // ---------- shared workspace ----------

    /** Route future changes to a shared workspace. */
    attachRemote(r) { remote = r; undoStack.length = 0; },
    setReadOnly(on) { readOnly = on; emit({ changed: true }); },
    /** Replace products, tasks and history with the shared workspace's copy. */
    applyRemote({ products, tasks, log }) {
      const next = { ...state };
      let changed = false;
      if (products && JSON.stringify(products) !== JSON.stringify(state.products)) { next.products = products.map(upgradeProduct); changed = true; }
      if (tasks && JSON.stringify(tasks) !== JSON.stringify(state.tasks)) { next.tasks = tasks; changed = true; }
      if (log) { next.log = log; changed = true; }
      if (!changed) return;
      state = next;
      persist();
      emit({ changed: true, remote: true });
    },
  };
}
