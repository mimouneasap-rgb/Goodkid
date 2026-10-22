// Shared workspace: when the app runs as a published claude.ai page with the
// `db` capability, products, tasks and the change history live in a shared
// database so everyone with access sees the same data, live.
//
// Layout (kept small so concurrent edits rarely touch the same document):
//   plan/<planned month or "unplanned">  { items: { <productId>: product | null } }
//   tasks/<productId>                    { items: { <taskId>: task | null } }
//   log/<id>                             { ts, by, uid, entries: [...] }
// A null item is a deletion. Writes use `update`, which merges `items` key by
// key, so two people editing different products of the same month don't clash.

import { byPlanOrder, byId } from "./store.js";

const LOG_WINDOW = 150;
const LOG_ENTRIES_PER_DOC = 60;

export const planGroup = (p) => (/^\d{4}-\d{2}$/.test(p?.plannedMonth || "") ? p.plannedMonth : "unplanned");
export const taskGroup = (t) => String(t?.productId || "unassigned").replace(/[^A-Za-z0-9_\-.~:@+]/g, "-") || "unassigned";

/** Group a full state into the documents written when seeding the workspace. */
export function seedDocuments(state) {
  const docs = new Map();
  const put = (path, id, value) => {
    if (!docs.has(path)) docs.set(path, { items: {} });
    docs.get(path).items[id] = value;
  };
  state.products.forEach((p) => put(`plan/${planGroup(p)}`, p.id, p));
  state.tasks.forEach((t) => put(`tasks/${taskGroup(t)}`, t.id, t));
  return docs;
}

/** Turn record changes into per-document item patches (moves write null to the old group). */
export function changesToPatches(changes) {
  const patches = new Map();
  const put = (path, id, value) => {
    if (!patches.has(path)) patches.set(path, {});
    patches.get(path)[id] = value;
  };
  for (const c of changes) {
    const group = c.kind === "product" ? planGroup : taskGroup;
    const col = c.kind === "product" ? "plan" : "tasks";
    if (c.before && (!c.after || group(c.before) !== group(c.after))) put(`${col}/${group(c.before)}`, c.id, null);
    if (c.after) put(`${col}/${group(c.after)}`, c.id, c.after);
  }
  return patches;
}

function flatten(docs) {
  const out = [];
  for (const d of docs) {
    const items = d.data()?.items || {};
    for (const [id, v] of Object.entries(items)) if (v && typeof v === "object") out.push({ ...v, id: v.id ?? id });
  }
  return out;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Connect the store to the shared workspace. Resolves null when this view has
 * no shared database (local app, signed-out viewer, capability not granted).
 * `onStatus({ state, canWrite, error })` reports "connecting", "live", "empty",
 * "readonly" or "error".
 */
export async function connectShared(store, { onStatus, onNames } = {}) {
  if (typeof window.claude?.use !== "function") return null;
  const [db, user] = await Promise.all([window.claude.use("db"), window.claude.use("user").catch(() => null)]);
  if (!db) return null;

  let canWrite = true;
  try {
    const can = await user?.can?.("data.write");
    if (can === false) canWrite = false;
  } catch { /* unknown: keep inputs and let a refused write decide */ }
  const uid = await user?.id?.().catch(() => null) ?? null;

  const status = (state, extra = {}) => onStatus?.({ state, canWrite, ...extra });
  status("connecting");

  // ---- writes: one in flight per document, later changes coalesced ----
  const queues = new Map(); // path -> { running, patch }
  const pending = new Map(); // "path|id" -> value not yet confirmed
  let lastError = "";

  async function writeItems(path, items) {
    const ref = db.doc(path);
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await ref.update({ items });
        return;
      } catch (e) {
        if (e?.code === "invalid_argument") {
          // update() requires the document; create the group on first use.
          const snap = await ref.get();
          if (!snap.exists) { await ref.set({ items }); return; }
          throw e;
        }
        if (e?.code === "unavailable" && attempt === 0) { await sleep(400 + Math.random() * 600); continue; }
        throw e;
      }
    }
  }

  async function drain(path, q) {
    q.running = true;
    while (Object.keys(q.patch).length) {
      const items = q.patch;
      q.patch = {};
      try {
        await writeItems(path, items);
        lastError = "";
      } catch (e) {
        if (e?.code === "invalid_argument" || e?.code === "not_granted") {
          canWrite = false;
          store.setReadOnly(true);
          lastError = "Your access to this page is view-only, so changes are not saved.";
        } else {
          lastError = e?.code === "quota_exceeded" ? "The shared workspace is full, so the change was not saved." : "A change could not be saved. Check your connection and try again.";
        }
      } finally {
        for (const [id, v] of Object.entries(items)) if (pending.get(`${path}|${id}`) === v) pending.delete(`${path}|${id}`);
      }
    }
    q.running = false;
    // Show the server's copy again: confirmed writes are in it, refused ones roll back.
    rebuild();
  }

  function push(changes) {
    for (const [path, items] of changesToPatches(changes)) {
      let q = queues.get(path);
      if (!q) queues.set(path, (q = { running: false, patch: {} }));
      for (const [id, v] of Object.entries(items)) {
        q.patch[id] = v;
        pending.set(`${path}|${id}`, v);
      }
      if (!q.running) drain(path, q);
    }
  }

  function writeLog(entries) {
    const docId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const slim = entries.slice(0, LOG_ENTRIES_PER_DOC).map(({ ts, by, uid: u, ...e }) => ({ ...e, changes: (e.changes || []).slice(0, 8) }));
    const first = entries[0];
    db.collection("log").doc(docId).set({
      ts: first.ts, by: first.by || "", uid: first.uid || uid || "", entries: slim,
      more: Math.max(0, entries.length - LOG_ENTRIES_PER_DOC),
    }).catch(() => { /* the edit itself is saved; a lost history line is not fatal */ });
  }

  // ---- reads: three live queries rebuild the store ----
  let planDocs = null, taskDocs = null, logDocs = [];
  let definitive = false;
  let empty = false;
  const names = new Map();

  function overlay(list, col, groupOf) {
    const byKey = new Map(list.map((r) => [r.id, r]));
    for (const [key, v] of pending) {
      const [path, id] = key.split("|");
      if (!path.startsWith(`${col}/`)) continue;
      if (v === null) { if (byKey.get(id) && `${col}/${groupOf(byKey.get(id))}` === path) byKey.delete(id); }
      else byKey.set(id, v);
    }
    return [...byKey.values()];
  }

  function rebuild() {
    if (!planDocs || !taskDocs) return;
    const products = overlay(flatten(planDocs), "plan", planGroup).sort(byPlanOrder);
    const tasks = overlay(flatten(taskDocs), "tasks", taskGroup).sort(byId);
    const log = logDocs.flatMap((d) => {
      const body = d.data() || {};
      return (body.entries || []).map((e) => ({ ...e, ts: body.ts, by: body.by, uid: body.uid }));
    });
    if (!products.length && !tasks.length) {
      if (definitive) { empty = true; status("empty"); }
      return;
    }
    empty = false;
    store.applyRemote({ products, tasks, log });
    status(!canWrite ? "readonly" : lastError ? "error" : "live", { error: lastError });
    resolveNames(log);
  }

  async function resolveNames(log) {
    if (!user?.profiles) return;
    const missing = [...new Set(log.map((e) => e.uid).filter((u) => u && !names.has(u)))].slice(0, 64);
    if (!missing.length) return;
    try {
      const ps = await user.profiles(missing);
      for (const id of missing) names.set(id, ps?.[id]?.name || "");
      onNames?.(names);
    } catch { /* names are a nicety */ }
  }

  const onError = (e) => status("error", { error: e?.code === "revoked" ? "Access to the shared workspace ended." : "Lost the connection to the shared workspace." });
  db.collection("plan").onSnapshot((snap) => { planDocs = snap.docs; definitive = definitive || !snap.metadata.fromCache; rebuild(); }, onError);
  db.collection("tasks").onSnapshot((snap) => { taskDocs = snap.docs; rebuild(); }, onError);
  db.collection("log").orderBy("ts", "desc").limit(LOG_WINDOW).onSnapshot((snap) => { logDocs = snap.docs; rebuild(); }, () => { /* history is optional */ });

  store.attachRemote({ push, log: writeLog, uid });
  if (!canWrite) store.setReadOnly(true);

  return {
    get empty() { return empty; },
    get canWrite() { return canWrite; },
    names,
    /** Write a full state into an empty workspace (owner's explicit action). */
    async seed(state) {
      const docs = seedDocuments(state);
      status("connecting");
      for (const [path, body] of docs) {
        await db.doc(path).set(body);
      }
    },
  };
}
