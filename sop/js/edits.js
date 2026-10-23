// Where edits to the library are kept. Inside a claude.ai page with the `db`
// capability they are shared by everyone who opens the page; anywhere else they
// stay in this browser. Edits are patches against the library file (see
// applyEdits in model.js), plus a change log of who changed what and why.
import * as store from "./store.js";

const EDITS = "sopEdits";
const CHANGES = "sopChanges";

/** Local backend, always available. */
async function localBackend(onChange) {
  let edits = (await store.getValue("edits").catch(() => null)) || {};
  let changes = (await store.getValue("changes").catch(() => null)) || [];
  const persist = async () => {
    await store.setValue("edits", edits);
    await store.setValue("changes", changes);
    onChange();
  };
  return {
    mode: "local",
    canWrite: true,
    list: () => Object.values(edits),
    changes: () => changes,
    async save(edit, change) {
      edits = { ...edits, [edit.sopId]: edit };
      changes = [change, ...changes].slice(0, 2000);
      await persist();
    },
    async remove(sopId, change) {
      const { [sopId]: _gone, ...rest } = edits;
      edits = rest;
      changes = [change, ...changes].slice(0, 2000);
      await persist();
    },
    async clear() {
      edits = {};
      changes = [];
      await persist();
    },
  };
}

/** Shared backend on the page's database; null when this view has none. */
async function sharedBackend(onChange) {
  const use = globalThis.window?.claude?.use;
  if (!use) return null;
  const db = await window.claude.use("db").catch(() => null);
  if (!db) return null;
  const user = await window.claude.use("user").catch(() => null);
  const can = user ? await user.can("data.write").catch(() => null) : null;

  let edits = new Map();
  let changes = [];
  let ready = false;
  const backend = {
    mode: "shared",
    canWrite: can !== false,
    list: () => [...edits.values()],
    changes: () => changes,
    async save(edit, change) {
      await write(() => db.collection(EDITS).doc(edit.sopId).set(edit));
      await write(() => db.collection(CHANGES).add(change));
    },
    async remove(sopId, change) {
      await write(() => db.collection(EDITS).doc(sopId).delete());
      await write(() => db.collection(CHANGES).add(change));
    },
    async clear() {
      for (const id of [...edits.keys()]) await write(() => db.collection(EDITS).doc(id).delete());
    },
  };

  async function write(fn) {
    try {
      await fn();
    } catch (err) {
      if (err?.code === "unavailable") {
        await new Promise((r) => setTimeout(r, 400 + Math.random() * 600));
        await fn();
        return;
      }
      if (err?.code === "invalid_argument" || err?.code === "not_granted") backend.canWrite = false;
      throw err;
    }
  }

  db.collection(EDITS).onSnapshot((snap) => {
    edits = new Map(snap.docs.map((d) => [d.id, { ...d.data(), sopId: d.id }]));
    ready = true;
    onChange();
  }, () => { backend.canWrite = false; onChange(); });
  db.collection(CHANGES).orderBy("at", "desc").limit(500).onSnapshot((snap) => {
    changes = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (ready) onChange();
  }, () => {});
  return backend;
}

/** Shared storage when the page has it, otherwise this browser. */
export async function openEdits(onChange) {
  return (await sharedBackend(onChange)) || localBackend(onChange);
}
