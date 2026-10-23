// Audit trail helpers (pure, no DOM): what changed between two versions of a record, field by field.

const AUDIT_JSON = new Set(["Summary", "Forms", "Folders"]);
const META = new Set(["at", "src", "editedAt", "editedBy", "edited", "by", "lang", "history"]);
const clipV = (v) => { if (v == null || v === "") return null; const x = typeof v === "string" ? v : JSON.stringify(v); return x.length > 400 ? `${x.slice(0, 399)}…` : x; };
const parseJ = (v) => { try { const x = JSON.parse(v); return x && typeof x === "object" ? x : null; } catch { return null; } };
/** One item of a résumé list as a person reads it. */
function itemText(x) {
  if (x == null) return null;
  if (typeof x !== "object") return String(x);
  if ("do" in x) return `${x.phase ? `${x.phase} › ` : ""}${x.do ?? ""}${x.who ? ` — ${x.who}` : ""}${x.records?.length ? ` [${x.records.join(", ")}]` : ""}`;
  if ("role" in x) return `${x.role ?? ""}: ${x.duties ?? ""}`;
  if ("code" in x) return `${x.code}${x.title ? ` ${x.title}` : ""}`;
  return JSON.stringify(x);
}
const listText = (xs) => clipV((xs ?? []).map(itemText).join(" · "));
/** A list changed: item by item when both versions have items (at most 8 lines), else the whole list. */
function diffList(name, a, b, out) {
  a = Array.isArray(a) ? a : []; b = Array.isArray(b) ? b : [];
  if (!a.length || !b.length) { out.push([name, listText(a), listText(b)]); return; }
  const lines = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) if (JSON.stringify(a[i] ?? null) !== JSON.stringify(b[i] ?? null)) lines.push([`${name} ${i + 1}`, clipV(itemText(a[i])), clipV(itemText(b[i]))]);
  out.push(...lines.slice(0, 8));
  if (lines.length > 8) out.push([name, `${a.length}`, `${b.length} (+${lines.length - 8})`]);
}
/** The fields that differ between two rows: [[field, old, new]]; an SOP's résumé part by part, its lists item by item. */
export function diffRows(cols, before, after) {
  const out = [];
  cols.forEach((c, j) => {
    const a = before?.[j] ?? null, b = after?.[j] ?? null;
    if (String(a ?? "") === String(b ?? "")) return;
    const ja = AUDIT_JSON.has(c) ? parseJ(a) : null, jb = AUDIT_JSON.has(c) ? parseJ(b) : null;
    if (jb && !Array.isArray(jb) && (!a || (ja && !Array.isArray(ja)))) {
      for (const k of new Set([...Object.keys(ja ?? {}), ...Object.keys(jb)])) {
        if (META.has(k) || JSON.stringify(ja?.[k] ?? null) === JSON.stringify(jb[k] ?? null)) continue;
        if (Array.isArray(ja?.[k]) || Array.isArray(jb[k])) diffList(`${c} · ${k}`, ja?.[k], jb[k], out);
        else out.push([`${c} · ${k}`, clipV(ja?.[k]), clipV(jb[k])]);
      }
    } else if (Array.isArray(jb) && (!a || Array.isArray(ja))) {
      // a list of forms: which codes came and went
      const ka = (ja ?? []).map((x) => x?.code ?? x?.[1] ?? itemText(x)), kb = jb.map((x) => x?.code ?? x?.[1] ?? itemText(x));
      const gone = clipV(ka.filter((x) => !kb.includes(x)).join(", ")), came = clipV(kb.filter((x) => !ka.includes(x)).join(", "));
      out.push(gone || came ? [c, gone, came] : [c, `${ka.length}`, `${kb.length}`]);
    } else out.push([c, clipV(a), clipV(b)]);
  });
  return out;
}

/** Audit entries about one record (table + its id value, e.g. an SOP code), newest first. */
export const auditOf = (entries, table, ref) => (entries ?? []).filter((e) => e.table === table && e.ref != null && String(e.ref) === String(ref));
