// The DMS export (SeedDMS / Scigeniq "Metadata" .xls) → SOP master list records.
// Only the data the board needs: SOP No., title, revision, DMS No., DMS status,
// effective date, periodic review date, document owner (= the uploader of the
// version) and the change control(s) behind the revision. No e-mail address is kept.

const norm = (v) => String(v ?? "").replace(/\s+/g, " ").trim();
const fold = (v) => norm(v).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** "ayman.salem@x.com (Ayman Salem-QA Senior Officer)" → "Ayman Salem"; "AMICHI AMINE" → "Amichi Amine". */
export function personName(v) {
  let s = norm(v);
  const at = s.indexOf("@"), open = s.indexOf("(");
  if (at >= 0 && open > at && s.endsWith(")")) s = s.slice(open + 1, -1); // "mail (Name-Role)" → "Name-Role"
  s = s.replace(/\S+@\S+/g, "").replace(/\s*\(.*?\)\s*/g, " ").replace(/\s*-\s*(QA|QC|VL|RA|Corporate|Quality|Production|R&D)\b.*$/i, "").trim();
  if (s === s.toUpperCase() || s === s.toLowerCase()) s = s.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase());
  return s;
}

const dist1 = (a, b) => {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1 || Math.min(a.length, b.length) < 4) return false;
  let i = 0, j = 0, e = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++e > 1) return false;
    if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
  }
  return e + (a.length - i) + (b.length - j) <= 1;
};
/** The board's own spelling of a name: same words in any order, one letter of difference allowed (Ayman / Aymen). */
export function matchPerson(name, team = [], others = []) {
  const t = fold(name).split(/[\s-]+/).filter(Boolean).sort();
  if (!t.length) return "";
  const words = (p) => fold(p).split(/[\s-]+/).filter(Boolean).sort();
  // the QA team first (its spelling wins), then everybody else on the board
  for (const list of [team, others]) {
    for (const p of list) if (words(p).join(" ") === t.join(" ")) return p;
    for (const p of list) { const u = words(p); if (u.length === t.length && u.every((w, i) => dist1(w, t[i]))) return p; }
  }
  return name;
}

const isoOf = (v) => {
  const s = norm(v);
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{2})-(\d{2})-(\d{2})\b/); // 21-06-29 GMT+1 → 2029-06-21
  if (m) return `20${m[3]}-${m[2]}-${m[1]}`;
  return "";
};
const RANK = { effective: 4, released: 3, draft: 2, rejected: 1 };

/** Rows of the first sheet (array of arrays, header first) → { sops, skipped }. */
export function dmsToSops(aoa, team = [], others = []) {
  const head = (aoa[0] || []).map(fold);
  const col = (...names) => { for (const n of names) { const i = head.indexOf(fold(n)); if (i >= 0) return i; } return -1; };
  const C = {
    no: col("Document no"), name: col("Document name"), file: col("File name"), state: col("State"), effStatus: col("Effective Status"),
    eff: col("Effective Date"), exp: col("Expiry Date"), exp2: col("Document Expiry Date"), up: col("Uploader"), owner: col("Owner"),
    legacy: col("Legacy Reference"), lver: col("Legacy Version"), comment: col("Document Version Comment"),
  };
  if (C.no < 0 || C.name < 0) throw new Error("This is not a DMS export: the columns “Document no” and “Document name” are missing.");
  const get = (r, i) => (i >= 0 ? norm(r[i]) : "");
  const byId = new Map();
  let skipped = 0;
  for (const r of aoa.slice(1)) {
    if (!get(r, C.no)) continue; // a reviewer / approver line of the document above
    const file = get(r, C.file);
    const code = (get(r, C.legacy).match(/^[A-Z]{3,}\d{3,}[A-Z]?\/[A-Za-z]+$/) || [])[0]
      || (file.match(/([A-Z]{3,}\d{3,}[A-Z]?)-(Onc|ONC)\b/) || []).slice(1, 3).join("/").replace(/\/ONC$/, "/Onc") || "";
    if (!code) { skipped++; continue; }
    const rev = (file.match(/-(?:Onc|ONC)-(\d{2})\b/) || [])[1] || (get(r, C.lver).match(/^\d{1,2}$/) ? get(r, C.lver).padStart(2, "0") : "");
    const title = get(r, C.name).replace(/^[A-Z]{3,}\d{3,}[A-Z]?(?:[/-]Onc)?(?:-\d{2})?\s*[:\-–]?\s*/i, "") || get(r, C.name);
    const st = get(r, C.effStatus) || get(r, C.state);
    const ccs = [...new Set((get(r, C.comment).match(/CC[-‐ ]?KO[-‐ ]?\d+|CC\d{4}\/\d{4}/gi) || []).map((x) => x.toUpperCase().replace(/[‐ ]/g, "-").replace(/^CC-?KO-?/, "CC-KO-")))];
    const rec = {
      id: code, title, rev, dms: get(r, C.no), state: st ? st[0].toUpperCase() + st.slice(1).toLowerCase() : "",
      eff: isoOf(get(r, C.eff)), expiry: isoOf(get(r, C.exp)) || isoOf(get(r, C.exp2)),
      owner: matchPerson(personName(get(r, C.up) || get(r, C.owner)), team, others), cc: ccs.join(", "),
    };
    for (const k of Object.keys(rec)) if (rec[k] === "") delete rec[k];
    const prev = byId.get(code);
    // one line per SOP: the version in force wins over a draft or a rejected revision
    if (!prev || (RANK[fold(rec.state)] || 0) > (RANK[fold(prev.state)] || 0)) byId.set(code, rec);
  }
  return { sops: [...byId.values()].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true })), skipped };
}
