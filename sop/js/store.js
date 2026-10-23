// Device-local persistence. The SOP library (several MB) and the digital records
// live in IndexedDB; small preferences live in localStorage. Nothing leaves the browser.

const DB_NAME = "goodkid-sop-library";
const DB_VERSION = 1;
let dbPromise = null;
const memory = { kv: new Map(), records: new Map() };   // fallback when IndexedDB is blocked

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    let req;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      resolve(null);
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");
      if (!db.objectStoreNames.contains("records")) {
        const s = db.createObjectStore("records", { keyPath: "id" });
        s.createIndex("attKey", "attKey");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  });
  return dbPromise;
}

function tx(db, store, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const request = fn(t.objectStore(store));
    t.oncomplete = () => resolve(request ? request.result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export async function getValue(key) {
  const db = await openDb();
  if (!db) return memory.kv.get(key);
  return tx(db, "kv", "readonly", (s) => s.get(key));
}

export async function setValue(key, value) {
  const db = await openDb();
  if (!db) { memory.kv.set(key, value); return; }
  await tx(db, "kv", "readwrite", (s) => s.put(value, key));
}

export async function deleteValue(key) {
  const db = await openDb();
  if (!db) { memory.kv.delete(key); return; }
  await tx(db, "kv", "readwrite", (s) => s.delete(key));
}

export async function listRecords(attKey) {
  const db = await openDb();
  if (!db) return [...memory.records.values()].filter((r) => r.attKey === attKey).sort(byDate);
  const rows = await tx(db, "records", "readonly", (s) => s.index("attKey").getAll(attKey));
  return (rows || []).sort(byDate);
}

export async function allRecords() {
  const db = await openDb();
  if (!db) return [...memory.records.values()].sort(byDate);
  return ((await tx(db, "records", "readonly", (s) => s.getAll())) || []).sort(byDate);
}

export async function putRecord(record) {
  const db = await openDb();
  if (!db) { memory.records.set(record.id, record); return; }
  await tx(db, "records", "readwrite", (s) => s.put(record));
}

export async function deleteRecord(id) {
  const db = await openDb();
  if (!db) { memory.records.delete(id); return; }
  await tx(db, "records", "readwrite", (s) => s.delete(id));
}

export async function clearAll() {
  const db = await openDb();
  if (!db) { memory.kv.clear(); memory.records.clear(); return; }
  await tx(db, "kv", "readwrite", (s) => s.clear());
  await tx(db, "records", "readwrite", (s) => s.clear());
}

export async function persistent() {
  try {
    return navigator.storage?.persist ? await navigator.storage.persist() : false;
  } catch {
    return false;
  }
}

export function pref(key, fallback = null) {
  try {
    const v = localStorage.getItem(`goodkid.sop.${key}`);
    return v === null ? fallback : JSON.parse(v);
  } catch {
    return fallback;
  }
}

export function setPref(key, value) {
  try {
    localStorage.setItem(`goodkid.sop.${key}`, JSON.stringify(value));
  } catch { /* preferences are a convenience only */ }
}

function byDate(a, b) {
  return String(a.createdAt).localeCompare(String(b.createdAt));
}
