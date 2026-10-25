// Where the workbook and in-app changes live.
//
// Two backends with one interface:
// - SharedStore: the claude.ai artifact database (`db` capability). Everyone the
//   app is shared with sees the same data, live. The imported workbook is kept in
//   size-limited chunk documents; every in-app change is its own document, so two
//   people editing different rows never overwrite each other.
// - LocalStore: this browser's localStorage (GitHub Pages, local server, or when
//   the database is unavailable). Same model, one device.
//
// State handed to onChange: { base, edits, review, ready }.
//   base   – workbook data as imported ({cols, rows} tables, meta, mapGrid), or null
//   edits  – Map "table~key" → { table, key, row (array in column order) | null, at, by, base }
//            `base` is the import id of the table the edit was made against: after a table is
//            re-imported, older edits no longer apply (their row positions mean something else).
//   review – { meeting, decisions } for the management review
//   audit  – the latest audit-trail entries, newest first: { id, at, by, op, table, key, ref, label, changes: [[field, old, new]], n, note }

const CHUNK_BYTES = 180_000; // documents are capped at 256 KiB
const TABLE_KEYS = (data) => Object.keys(data).filter((k) => data[k] && Array.isArray(data[k].rows) && Array.isArray(data[k].cols));

const LS = "okqa.";
const ls = {
  get(k, d) { try { const v = localStorage.getItem(LS + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(LS + k, JSON.stringify(v)); return true; } catch { return false; } },
  del(k) { try { localStorage.removeItem(LS + k); } catch { /* ignore */ } },
};

export const editId = (table, key) => `${table}~${key}`;
const auditId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const newImportId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/** Split a JSON-able list into pieces whose serialized size stays under `limit`. */
function chunkRows(rows, limit = CHUNK_BYTES) {
  const out = [];
  let cur = [], size = 0;
  for (const r of rows) {
    const s = JSON.stringify(r).length + 1;
    if (cur.length && size + s > limit) { out.push(cur); cur = []; size = 0; }
    cur.push(r); size += s;
  }
  if (cur.length || !out.length) out.push(cur);
  return out;
}

// ---------------------------------------------------------------------------
class LocalStore {
  constructor(bundled) {
    this.mode = "local";
    this.canWrite = true;
    this.bundled = bundled;
    this.listeners = [];
    addEventListener("storage", (e) => { if (e.key?.startsWith(LS)) this.emit(); });
  }
  state() {
    const edits = new Map(Object.entries(ls.get("edits", {})));
    const review = ls.get("review", null) ?? { meeting: ls.get("u.meeting", null), decisions: ls.get("u.decisions", []) };
    return { base: ls.get("data", null) ?? this.bundled ?? null, edits, review, audit: ls.get("audit", []), ready: true };
  }
  onChange(fn) { this.listeners.push(fn); fn(this.state()); }
  emit() { const s = this.state(); for (const fn of this.listeners) fn(s); }
  async importBase(data, replaced) {
    const id = newImportId();
    for (const key of replaced) if (data[key]) data[key] = { ...data[key], importId: id };
    if (!ls.set("data", data)) throw new Error("This browser would not store the data (storage full or blocked).");
    const edits = ls.get("edits", {});
    for (const [id, e] of Object.entries(edits)) if (replaced.includes(e.table)) delete edits[id];
    ls.set("edits", edits);
    this.emit();
  }
  async saveRow(table, key, row, by, base) {
    const edits = ls.get("edits", {});
    edits[editId(table, key)] = { table, key, row, at: new Date().toISOString(), by, base: base ?? null };
    if (!ls.set("edits", edits)) throw new Error("This browser would not store the change (storage full or blocked).");
    this.emit();
  }
  async saveReview(review) { ls.set("review", review); this.emit(); }
  /** Append one audit-trail entry (kept: the latest 3000). */
  async audit(entry) {
    const list = ls.get("audit", []);
    list.unshift({ id: auditId(), ...entry });
    ls.set("audit", list.slice(0, 3000));
    this.emit();
  }
  async clear() { ls.del("data"); ls.del("edits"); this.emit(); }
  localData() { return null; }
}

// ---------------------------------------------------------------------------
class SharedStore {
  constructor(db, user) {
    this.mode = "shared";
    this.db = db;
    this.user = user;
    this.canWrite = true; // refined by permissions(); a refused write also turns it off
    this.listeners = [];
    this.info = undefined; // undefined = not loaded yet, null = empty store
    this.chunks = new Map();
    this.edits = new Map();
    this.review = null;
    this.auditLog = [];
    this.loaded = { info: false, chunks: false, edits: false };
    this.cache = null;
  }
  async permissions() {
    const can = await this.user?.can?.("data.write");
    if (can === false) this.canWrite = false;
  }
  start() {
    const err = (e) => console.warn("Shared data subscription ended:", e?.code, e?.message);
    this.db.doc("base/info").onSnapshot((s) => { this.info = s.exists ? s.data() : null; this.loaded.info = true; this.cache = null; this.emit(); }, err);
    this.db.collection("chunks").onSnapshot((q) => {
      this.chunks = new Map(q.docs.map((d) => [d.id, d.data()]));
      this.loaded.chunks = true; this.cache = null; this.emit();
    }, err);
    this.db.collection("edits").onSnapshot((q) => {
      this.edits = new Map(q.docs.map((d) => [d.id, d.data()]));
      this.loaded.edits = true; this.emit();
    }, err);
    this.db.doc("review/current").onSnapshot((s) => { this.review = s.exists ? s.data() : null; this.emit(); }, err);
    // the audit trail: the latest 1000 entries live (older ones stay in the database)
    this.db.collection("audit").orderBy("at", "desc").limit(1000).onSnapshot((q) => { this.auditLog = q.docs.map((d) => ({ id: d.id, ...d.data() })); this.emit(); }, err);
  }
  /** Reassemble the imported workbook from its chunks (only when every chunk of the current import has arrived). */
  base() {
    if (!this.info) return null;
    if (this.cache?.importId === this.info.importId) return this.cache.data;
    const { importId, tables, drawingParts, meta, mapGrid } = this.info;
    const data = { meta: { ...meta, importedAt: this.info.importedAt }, mapGrid: mapGrid ?? [] };
    for (const [key, { cols, parts, importId: tableId }] of Object.entries(tables ?? {})) {
      const rows = [];
      for (let i = 0; i < parts; i++) {
        const c = this.chunks.get(`${key}-${i}`);
        if (!c || c.importId !== importId) return this.cache?.data ?? null; // a new import is still arriving
        rows.push(...c.rows);
      }
      data[key] = { cols, rows, importId: tableId ?? importId };
    }
    if (drawingParts) {
      let url = "";
      for (let i = 0; i < drawingParts; i++) {
        const c = this.chunks.get(`drawing-${i}`);
        if (!c || c.importId !== importId) { url = ""; break; }
        url += c.part;
      }
      data.meta.drawing = url || null;
    }
    this.cache = { importId, data };
    return data;
  }
  state() {
    const ready = this.loaded.info && this.loaded.chunks && this.loaded.edits;
    return { base: ready ? this.base() : null, edits: this.edits, review: this.review, audit: this.auditLog, ready, pending: ready && this.info && !this.base() };
  }
  onChange(fn) { this.listeners.push(fn); fn(this.state()); }
  emit() { const s = this.state(); for (const fn of this.listeners) fn(s); }

  async write(ref, body) {
    try { await ref.set(body); }
    catch (e) {
      if (e?.code === "unavailable") { await new Promise((r) => setTimeout(r, 400 + Math.random() * 600)); return ref.set(body); }
      if (e?.code === "invalid_argument") this.canWrite = false;
      throw explain(e);
    }
  }
  async remove(ref) { try { await ref.delete(); } catch (e) { throw explain(e); } }

  /** Write a full import: chunks first, then the info document that points at them, then tidy up. */
  async importBase(data, replaced, progress = () => {}) {
    const importId = newImportId();
    const { meta = {}, mapGrid = [] } = data;
    const { drawing, ...metaRest } = meta;
    const tables = {};
    const writes = [];
    for (const key of TABLE_KEYS(data)) {
      if (key === "tr") continue; // translations ship with the app
      const parts = chunkRows(data[key].rows);
      // a table not in this import keeps its id, so the edits made to it stay valid
      const tableId = replaced.includes(key) ? importId : (this.info?.tables?.[key]?.importId ?? this.info?.importId ?? importId);
      tables[key] = { cols: data[key].cols, parts: parts.length, importId: tableId };
      parts.forEach((rows, i) => writes.push([`${key}-${i}`, { importId, key, i, rows }]));
    }
    let drawingParts = 0;
    if (typeof drawing === "string" && drawing.startsWith("data:")) {
      const parts = drawing.match(/[\s\S]{1,200000}/g) ?? [];
      drawingParts = parts.length;
      parts.forEach((part, i) => writes.push([`drawing-${i}`, { importId, i, part }]));
    }
    let n = 0;
    for (const [id, body] of writes) { progress(++n, writes.length + 1); await this.write(this.db.collection("chunks").doc(id), body); }
    await this.write(this.db.doc("base/info"), { importId, importedAt: new Date().toISOString(), tables, drawingParts, meta: metaRest, mapGrid });
    progress(writes.length + 1, writes.length + 1);
    const keep = new Set(writes.map(([id]) => id));
    for (const id of [...this.chunks.keys()]) if (!keep.has(id)) await this.remove(this.db.collection("chunks").doc(id));
    for (const [id, e] of [...this.edits]) if (replaced.includes(e.table)) await this.remove(this.db.collection("edits").doc(id));
  }
  async saveRow(table, key, row, by, base) {
    await this.write(this.db.collection("edits").doc(editId(table, key)), { table, key, row, at: new Date().toISOString(), by: by ?? null, base: base ?? null });
  }
  async saveReview(review) { await this.write(this.db.doc("review/current"), review); }
  /** Append one audit-trail entry; entries are never changed or deleted by the app. */
  async audit(entry) { await this.write(this.db.collection("audit").doc(auditId()), entry); }
  async clear() {
    await this.remove(this.db.doc("base/info"));
    for (const id of [...this.chunks.keys()]) await this.remove(this.db.collection("chunks").doc(id));
    for (const id of [...this.edits.keys()]) await this.remove(this.db.collection("edits").doc(id));
  }
  /** Workbook loaded into this browser by an earlier, device-only version of the app. */
  localData() { return ls.get("data", null); }
}

function explain(e) {
  const code = e?.code;
  const msg = code === "quota_exceeded" ? "The shared workspace is full; delete unused rows or re-import a smaller workbook."
    : code === "invalid_argument" ? "You can view this workspace but not change it. Ask the owner for Contributor access."
    : code === "resource_exhausted" ? "Too many changes at once; wait a moment and try again."
    : code === "revoked" ? "Access to the shared workspace was withdrawn. Reload the page."
    : e?.message ?? String(e);
  const err = new Error(msg);
  err.code = code;
  return err;
}

/**
 * Pick the backend: the shared database when the page runs inside a viewer that
 * grants it, otherwise this browser. Resolves { store, user, me }.
 */
export async function openStore(bundled) {
  const claude = window.claude;
  if (claude?.use) {
    try {
      const [db, user] = await Promise.all([claude.use("db"), claude.use("user")]);
      if (db) {
        const store = new SharedStore(db, user);
        await store.permissions();
        store.start();
        const me = (await user?.id?.()) ?? null;
        return { store, user, me };
      }
    } catch (e) {
      console.warn("Shared workspace unavailable, using this browser:", e);
    }
  }
  return { store: new LocalStore(bundled), user: null, me: null };
}

/**
 * Apply in-app edits to the imported tables. Base rows are addressed by their
 * position in the import ("i<n>"), new rows by a generated key ("n-…").
 * Returns new {cols, rows, keys} tables; `keys[i]` identifies each row for editing.
 */
export function applyEdits(base, edits) {
  const out = { ...base };
  const byTable = new Map();
  for (const e of edits.values()) {
    if (!byTable.has(e.table)) byTable.set(e.table, []);
    byTable.get(e.table).push(e);
  }
  for (const key of TABLE_KEYS(base)) {
    const t = base[key];
    const list = (byTable.get(key) ?? []).filter((e) => e.base == null || t.importId == null || e.base === t.importId);
    const over = new Map(list.map((e) => [e.key, e]));
    const rows = [], keys = [], editedAt = [];
    t.rows.forEach((r, i) => {
      const e = over.get(`i${i}`);
      if (e && e.row == null) return;
      rows.push(e ? fit(e.row, t.cols.length) : r); keys.push(`i${i}`); editedAt.push(e ? e : null);
    });
    for (const e of list.filter((x) => !x.key.startsWith("i") && x.row != null).sort((a, b) => String(a.at).localeCompare(String(b.at)))) {
      rows.push(fit(e.row, t.cols.length)); keys.push(e.key); editedAt.push(e);
    }
    out[key] = { cols: t.cols, rows, keys, edits: editedAt, importId: t.importId ?? null };
  }
  return out;
}
const fit = (row, n) => Array.from({ length: n }, (_, i) => row?.[i] ?? null);
