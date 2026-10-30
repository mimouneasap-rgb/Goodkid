// Team sync: when the page runs where a shared database is available (the
// published Artifact), both boards live in it and every open copy updates
// live. Without one (a local copy, a signed-out visitor) the app keeps its
// browser-only storage.
//
// Layout — one document per record, so two people editing different records
// never overwrite each other:
//   t1-dl/<key> … t2-esc/<key>   a register record (+ _o, its display order)
//   t1-meta/<part>, t2-meta/<part>  { v: … } setup, lists, KPI targets, roster…
//   t2-daily/<date>               a Daily Log (Q-calendar) day
//   audit/<date>                  that day's change history { day, entries }

export const REGS = {
  t1: ["dl", "br", "fn", "ac", "hd", "tr"],
  t2: ["dev", "capa", "cc", "insp", "rel", "doc", "load", "tasks", "apqr", "trn", "esc", "act"],
};
const LOCAL_ONLY = { t1: { setup: ["selDate"] }, t2: {} }; // per-viewer view state, never shared
const CONCURRENCY = 4;

const newKey = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const json = (v) => JSON.stringify(v);

/** Give every record a stable key and an order, so each can be its own document. */
export function ensureKeys(tier, state) {
  for (const reg of REGS[tier]) {
    (state[reg] || []).forEach((r, i) => {
      r._k ??= newKey();
      r._o ??= i;
    });
  }
  return state;
}

/** The documents that represent one board: Map<"collection/id", bodyJSON>. */
export function docsOf(tier, state) {
  const out = new Map(); // settings first: a board counts as set up once its setup document exists
  for (const [part, v] of Object.entries(state)) {
    if (REGS[tier].includes(part) || part === "audit" || part === "daily") continue;
    let value = v;
    const hide = LOCAL_ONLY[tier][part];
    if (hide) { value = { ...v }; hide.forEach((k) => delete value[k]); }
    out.set(`${tier}-meta/${part}`, json({ v: value }));
  }
  if (tier === "t2") for (const [date, log] of Object.entries(state.daily || {})) out.set(`t2-daily/${date}`, json(log));
  for (const reg of REGS[tier]) for (const r of state[reg] || []) out.set(`${tier}-${reg}/${r._k}`, json(r));
  return out;
}

/** Rebuild a board from its documents; `keep` supplies the per-viewer fields. */
export function stateFrom(tier, docs, keep) {
  const s = { audit: [] };
  for (const reg of REGS[tier]) s[reg] = [];
  if (tier === "t2") s.daily = {};
  for (const [path, body] of docs) {
    const [col, id] = path.split("/");
    const data = JSON.parse(body);
    if (col === `${tier}-meta`) s[id] = data.v;
    else if (col === "t2-daily") s.daily[id] = data;
    else {
      const reg = col.slice(3);
      if (s[reg]) s[reg].push(data);
    }
  }
  for (const reg of REGS[tier]) s[reg].sort((a, b) => (a._o ?? 0) - (b._o ?? 0) || String(a._k).localeCompare(String(b._k)));
  for (const [part, fields] of Object.entries(LOCAL_ONLY[tier])) {
    s[part] ??= {};
    for (const f of fields) if (keep?.[part]?.[f] !== undefined) s[part][f] = keep[part][f];
  }
  return s;
}

export function createSync({ db, user, onRemote, onStatus }) {
  const remote = { t1: new Map(), t2: new Map() };   // the shared copy, as last seen (+ our writes in flight)
  const base = { t1: new Map(), t2: new Map() };     // this page's board as of its last sync: changes are measured from here
  const chains = new Map();                          // one write at a time per document
  const pending = new Map();                         // collection → Map(path → queued body not yet confirmed; null = delete)
  const ids = new Map();                             // collection → Set of document ids as last delivered
  const bodies = new WeakMap();                      // delivered snapshot data → its JSON (unchanged documents keep their object)
  const bodyOf = (o) => { let b = bodies.get(o); if (b === undefined) { b = json(o); bodies.set(o, b); } return b; };
  const colOf = (path) => path.slice(0, path.indexOf("/"));
  const setPending = (path, body) => { const c = colOf(path); if (!pending.has(c)) pending.set(c, new Map()); pending.get(c).set(path, body); };
  const delivered = { t1: new Set(), t2: new Set() };
  const queue = [];
  let running = 0, failed = false, readOnly = false;
  const auditDays = new Map();
  const unsubs = [];

  const status = () => onStatus({ pending: queue.length + running, failed, readOnly });

  function pump() {
    while (running < CONCURRENCY && queue.length) {
      const job = queue.shift();
      running++;
      const prev = chains.get(job.path) || Promise.resolve();
      const p = prev.then(() => attempt(job)).finally(() => {
        const p_ = pending.get(colOf(job.path));
        if (p_ && p_.get(job.path) === job.body) p_.delete(job.path);
        running--; status(); pump();
      });
      chains.set(job.path, p.catch(() => {}));
    }
    status();
  }

  async function attempt(job, tries = 0) {
    const [col, id] = job.path.split("/");
    const ref = db.collection(col).doc(id);
    try {
      if (job.body === null) await ref.delete(); else await ref.set(JSON.parse(job.body));
    } catch (e) {
      if (e?.code === "invalid_argument" && !readOnly) { readOnly = true; queue.length = 0; status(); onRemote("readonly"); return; }
      if ((e?.code === "resource_exhausted" || e?.code === "unavailable") && tries < 6) {
        await new Promise((r) => setTimeout(r, 800 * 2 ** tries + Math.random() * 400));
        return attempt(job, tries + 1);
      }
      failed = true;
      status();
    }
  }

  /** Send what this page changed on one board since its last sync — never
   * what it merely has not received yet, so a teammate's newer change is
   * never undone. */
  function push(tier, state) {
    if (readOnly) return 0;
    const next = docsOf(tier, ensureKeys(tier, state));
    const prev = base[tier], shared = remote[tier];
    let n = 0;
    for (const [path, body] of next) if (prev.get(path) !== body) { queue.push({ path, body }); setPending(path, body); shared.set(path, body); n++; }
    for (const path of prev.keys()) if (!next.has(path)) { queue.push({ path, body: null }); setPending(path, null); shared.delete(path); n++; }
    base[tier] = next;
    if (n) pump();
    return n;
  }

  /** The page now shows the shared copy: measure later changes from it. */
  function rebase(tier, state) { base[tier] = docsOf(tier, state); }

  /** Add entries to today's shared change history. */
  async function pushAudit(entries) {
    if (!db) return;
    if (readOnly || !entries.length) return;
    const by = user ? await user.id().catch(() => null) : null;
    const day = new Date().toISOString().slice(0, 10);
    const list = [...(auditDays.get(day) || []), ...entries.map((e) => ({ ...e, by }))].slice(-400);
    auditDays.set(day, list);
    queue.push({ path: `audit/${day}`, body: json({ day, entries: list }) });
    pump();
  }

  /** Subscribe to every collection; `onRemote(tier)` fires after each change. */
  function listen() {
    const watch = (tier, col) => {
      const un = db.collection(col).onSnapshot((snap) => {
        const map = remote[tier];
        const known = ids.get(col);
        const changes = known && typeof snap.docChanges === "function" ? snap.docChanges() : null;
        if (changes) {
          // apply only what changed: a large switch delivers many small snapshots
          for (const ch of changes) {
            const key = `${col}/${ch.doc.id}`;
            if (ch.type === "removed") { map.delete(key); known.delete(ch.doc.id); }
            else { map.set(key, bodyOf(ch.doc.data())); known.add(ch.doc.id); }
          }
        } else {
          for (const id of known || []) map.delete(`${col}/${id}`);
          const now = new Set();
          for (const d of snap.docs) { map.set(`${col}/${d.id}`, bodyOf(d.data())); now.add(d.id); }
          ids.set(col, now);
        }
        // our own writes still on their way win over the older server copy
        for (const [path, body] of pending.get(col) || []) {
          if (body === null) map.delete(path); else map.set(path, body);
        }
        delivered[tier].add(col);
        onRemote(tier, { col, fromCache: snap.metadata.fromCache });
      }, (e) => { if (e?.code !== "revoked") failed = true; status(); });
      unsubs.push(un);
    };
    for (const tier of ["t1", "t2"]) {
      for (const reg of REGS[tier]) watch(tier, `${tier}-${reg}`);
      watch(tier, `${tier}-meta`);
    }
    watch("t2", "t2-daily");
    unsubs.push(db.collection("audit").orderBy("day", "desc").limit(31).onSnapshot((snap) => {
      for (const d of snap.docs) auditDays.set(d.id, d.data().entries || []);
      onRemote("audit");
    }, () => {}));
  }

  /** One read of the whole store: is the shared board set up yet? */
  async function probe() {
    const snap = await db.collection("t2-meta").get();
    return snap.docs.some((d) => d.id === "setup");
  }

  const auditEntries = () => [...auditDays.values()].flat();

  return {
    remote, push, rebase, pushAudit, listen, probe, auditEntries,
    /** A board can be rebuilt once every one of its collections has arrived. */
    ready: (tier) => delivered[tier].size >= REGS[tier].length + (tier === "t2" ? 2 : 1) && remote[tier].has(`${tier}-meta/setup`),
    get readOnly() { return readOnly; },
    stop() { unsubs.forEach((u) => u()); },
  };
}
