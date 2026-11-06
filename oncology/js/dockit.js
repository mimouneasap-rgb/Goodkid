// Controlled documents beyond SOPs (pure, no DOM): the document types of the site's document system, where a Drive
// file sits (controlled, obsolete, uncontrolled copy), document codes and revisions from file names, the product a
// document belongs to, and the master document indexes (IndXX/Onc-…) read back into entries and checked against Drive.
import { sopKey, parseSopFileName, cleanTitle } from "./sopkit.js";

/**
 * Document types: [id, English, French, owning department, file-name test, folder-name test]. The first file-name match
 * wins (SOPs first); a file whose name carries no type takes the type of the nearest folder that names one.
 */
export const DOC_TYPES = [
  ["SOP", "Standard operating procedure", "Procédure opératoire normalisée", null, /^\s*SOP\s*[A-Z]{2,3}\s*\d/i, /\bSOPs?\b/i],
  ["IND", "Master document index", "Index de documents maître", "QA", /^\s*I?nd\s*[A-Z]{2,3}\s*[-\/]|\bINDEX\b/i, /\bindex\b/i],
  ["BMR", "Batch manufacturing record", "Dossier de lot de fabrication", "PR", /^\s*BMR\s*\d/i, /\bBMR\b/i],
  ["BPR", "Batch packaging record", "Dossier de lot de conditionnement", "PR", /^\s*BPR\s*\d/i, /\bBPR\b/i],
  ["OF", "Manufacturing order", "Ordre de fabrication", "PL", /^\s*OF\s*-?\s*ONC/i, /^OF$/i],
  ["OC", "Packaging order", "Ordre de conditionnement", "PL", /^\s*OC\s*-?\s*ONC/i, /^OC$/i],
  ["BOM", "Bill of materials", "Nomenclature", "PL", /^\s*BOM\b/i, /\bBOM\b/i],
  ["ICI", "Item code index", "Index des codes articles", "PL", /^\s*ICI\b|^\s*ICI\d/i, /item code index/i],
  ["COD", "Item code creation", "Création de code article", "PL", /^\s*cr[ée]ation\b/i, /cr[ée]ation code/i],
  ["FPS", "Finished product specification", "Spécification produit fini", "QC", /^\s*FPS\s*\d/i, null],
  ["RMS", "Raw material specification", "Spécification matière première", "QC", /^\s*RMS\s*\d/i, null],
  ["PMS", "Packaging material specification", "Spécification article de conditionnement", "QC", /^\s*PMS\s*\d/i, null],
  ["STM", "Standard test method", "Méthode d'analyse", "QC", /^\s*STM/i, /\bSTMs?\b/i],
  ["STR", "Stability batch assessment record", "Bulletin d'analyse de stabilité", "QC", /^\s*STR\s*\d/i, /stability/i],
  ["RMR", "Raw material batch assessment record", "Bulletin d'analyse matière première", "QC", /^\s*RMR\s*\d/i, null],
  ["FPR", "Finished product batch assessment record", "Bulletin d'analyse produit fini", "QC", /^\s*FPR\s*\d/i, null],
  ["AR", "Asset register", "Registre des équipements", "EN", /^\s*AR\s*\d/i, /asset/i],
  ["SMF", "Site master file", "Dossier permanent du site", "QA", /^\s*SMF/i, /site\s+master/i],
  ["QM", "Quality manual", "Manuel qualité", "QA", /^\s*(QM\s*\d|quality manual|manuel qualit)/i, /quality manual/i],
  ["VMP", "Validation master plan", "Plan directeur de validation", "VL", /^\s*VMP/i, /^VMP$/i],
  ["PV", "Process validation", "Validation de procédé", "VL", /^\s*PV\s*\d/i, /^PV$/i],
  ["CV", "Cleaning validation", "Validation de nettoyage", "VL", /^\s*CVP?\s*\d/i, /^CV$/i],
  ["HTS", "Hold-time study", "Étude de temps d'attente", "VL", /^\s*HTSP?\s*\d/i, /^HTSP?$/i],
  ["TE", "Form or template", "Formulaire ou modèle", null, /^\s*[A-Z]{2,3}\d{3,4}[EF]?\s*-\s*Onc\s*-\s*TE?\d/i, /templ|mod[eè]le/i],
  ["LST", "Product list", "Liste des produits", "QA", /^\s*list(e)?\b/i, /list of .*products/i],
  ["TRN", "Training plan and matrix", "Plan et matrice de formation", "GS", /plan de formation|training (matrix|plan)|risk assess?ment/i, /formation|training/i],
  ["RDF", "R&D formula", "Formule R&D", "RD", /^\s*RD\s*-?\s*ONC/i, /formul/i],
  ["SCAN", "Unnamed scan", "Scan non nommé", null, /^\s*SKM\b/i, null],
];
export const TYPE_BY_ID = new Map(DOC_TYPES.map((x) => [x[0], x]));
/** Files that are not documents (thumbnail caches, shortcuts, archives). */
export const isSystemFile = (name) => /^thumbs\.db$|\.(lnk|db|ini|tmp|zip)$|^~\$|^\.ds_store$/i.test(String(name ?? "").trim());

const TOP_DEPT = [[/^QA\b/i, "QA"], [/^QC\b|quality control/i, "QC"], [/^PR\b|production/i, "PR"], [/^valid|^VL\b/i, "VL"], [/^EN\b|engineer|maint/i, "EN"], [/^RD\b|r&d/i, "RD"],
  [/^HSE\b/i, "HSE"], [/^GS\b/i, "GS"], [/^PL\b|planning/i, "PL"], [/^WH\b|warehouse/i, "WH"], [/^CM\b|compliance/i, "CM"], [/^order/i, "PL"]];
/** The department a folder path belongs to, from its top folder ("QC Documents/…" → QC). */
export const deptOfPath = (path) => { const top = String(path ?? "").split("/")[0]; return TOP_DEPT.find(([re]) => re.test(top))?.[1] ?? null; };

/** Where a file sits: "obsolete" (an obsolete folder or a file marked obsolete), "uncontrolled" (an uncontrolled-copy folder) or "controlled". */
export function zoneOf(path, name = "") {
  if (/obsol[eè]te/i.test(path ?? "") || /\bobsol[eè]te\b/i.test(name ?? "")) return "obsolete";
  if (/un\s*con?tr?ol+ed|uncotrolled|non[\s-]*contr[ôo]l/i.test(path ?? "")) return "uncontrolled";
  return "controlled";
}
export const ZONE_RANK = { controlled: 0, uncontrolled: 1, obsolete: 2 };

/** The document type of a file from its name, else from the nearest folder of its path that names one. */
export function docTypeOf(name, path = "") {
  const n = String(name ?? "");
  const byName = DOC_TYPES.find((x) => x[4].test(n));
  if (byName) return byName[0];
  for (const folder of String(path ?? "").split("/").reverse()) {
    const x = DOC_TYPES.find((d) => d[5] && d[5].test(folder.trim()));
    if (x) return x[0];
  }
  return null;
}

const SITE_TOKEN = /^(ONC|ONE|ON|0NC)$/i;
/** Identity of a document code across spellings: "FPS902-Onc-04", "FPS902/Onc/04" → "FPS902/ONC"; "OFONC-TB901" and "OF-ONC-TB901-01" → "OF/ONC/TB901". */
export function docKey(code) {
  if (/^\s*SOP/i.test(code ?? "")) return sopKey(code);
  const parts = splitCode(String(code ?? "")).parts;
  return parts.length ? parts.join("/") : null;
}
function splitCode(token) {
  let raw = token.replace(/^\s*(OF|OC|RD|BOM|ICI)\s*-?\s*(ONC)\b/i, "$1-$2").split(/[-_\/\s.]+/).filter(Boolean);
  let rev = null;
  if (raw.length >= 2 && /^\d{2}$/.test(raw.at(-1))) rev = raw.pop();
  const parts = raw.map((p, i) => {
    let u = p.toUpperCase();
    if (SITE_TOKEN.test(u)) return "ONC";
    if (i === 0) u = u.replace(/^([A-Z]+\d+)[EF]$/, "$1");
    return u.replace(/\d+/g, (d) => String(+d));
  });
  return { parts, rev, raw };
}

/**
 * "BMR0903F-Onc-02 DEMOXA 200 mg.pdf" → { type, key, code, rev, title, site, lang, ext }; SOP names go through
 * parseSopFileName. Names without a code keep their cleaned name as title and code (key from the name).
 */
export function parseDocName(name, path = "") {
  const full = String(name ?? "").trim();
  const type = docTypeOf(full, path);
  if (type === "SOP") {
    const p = parseSopFileName(full);
    if (p) return { ...p, type, key: p.key, lang: p.lang };
  }
  const ext = (full.match(/\.([A-Za-z0-9]{2,4})$/)?.[1] ?? "").toLowerCase();
  const base = full.replace(/\.[A-Za-z0-9]{2,4}$/, "").replace(/^\s*(OC|OF)\s+(ONC)\b/i, "$1-$2");
  const token = base.split(/\s+/)[0] ?? "";
  if (!/\d/.test(token) || type === "SCAN" || type === "IND") {
    const title = cleanTitle(base);
    return { type, key: `${type ?? "DOC"}:${title.toUpperCase()}`, code: title, rev: null, title, site: /\bonc/i.test(base) ? "Oncology" : null, lang: null, ext, coded: false };
  }
  const { parts, rev, raw } = splitCode(token.replace(/-+$/, ""));
  const code = raw.map((p) => (SITE_TOKEN.test(p) ? "Onc" : p)).join("-");
  const letter = raw[0]?.match(/\d([EF])$/i)?.[1]?.toUpperCase();
  const title = cleanTitle(base.slice(token.length));
  return { type, key: parts.join("/"), code, rev, title, site: parts.includes("ONC") ? "Oncology" : null, lang: letter === "E" ? "English" : letter === "F" ? "French" : null, ext, coded: true };
}

// ---------- products ----------
function lev(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (Math.abs(m - n) > 2) return 9;
  let prev = Array.from({ length: n + 1 }, (_, j) => j), pp = prev;
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) cur[j] = Math.min(cur[j], pp[j - 2] + 1); // swapped letters
    }
    pp = prev; prev = cur;
  }
  return prev[n];
}
const words = (s) => String(s ?? "").toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/[^A-Z]+/).filter((w) => w.length >= 5);
/**
 * The product a document is about, from the words of its name: product names and API names of the product list, allowing
 * one or two typing slips ("DMEOXA", "Demoxia" → DEMOXA). `products`: [{ key, product }] (search keys). Returns the product or null.
 */
export function productOf(text, products) {
  let best = null, bestD = 9;
  for (const w of words(text)) for (const p of products) {
    const k = String(p.key).toUpperCase();
    if (k.length < 5) continue;
    const d = w === k ? 0 : lev(w, k);
    const ok = d === 0 || (k.length >= 6 && d <= (k.length >= 8 ? 2 : 1));
    if (ok && d < bestD) { best = p.product; bestD = d; if (!d) break; }
  }
  return best;
}
/** "200 mg", "2,5mg" → "200 mg", "2.5 mg"; null when the name carries no strength. */
export function strengthOf(text) {
  const m = String(text ?? "").match(/(\d+(?:[.,]\d+)?)\s*mg\b/i);
  return m ? `${m[1].replace(",", ".")} mg` : null;
}
/** Product code written in a document code ("OF-ONC-TB912P-01" → "TB912", "BMR0914-ONC-CP901-01" → "CP901"). */
export const productCodeOf = (code) => String(code ?? "").toUpperCase().match(/\b(?:ONC-?)?(TB|CP|I)0*(\d{1,4})/)?.slice(1).join("") ?? null;

// ---------- grouping ----------
/**
 * Group files ({id, title, path, modifiedTime, …}) by document identity. Current = the best of: a controlled file before an
 * uncontrolled copy before an obsolete one, then the highest revision, a Word file before a PDF, the newest. Returns
 * [{ key, type, code, rev, title, current, files, zones: {controlled, obsolete, uncontrolled}, status }].
 */
export function groupDocs(files, { types } = {}) {
  const by = new Map(), seen = new Set();
  for (const f of files ?? []) {
    if (!f?.id || seen.has(f.id) || /folder/.test(f.mimeType ?? "") || isSystemFile(f.title ?? f.name)) continue;
    seen.add(f.id);
    const p = parseDocName(f.title ?? f.name, f.path);
    if (!p || (types && !types.includes(p.type))) continue;
    const zone = f.zone ?? zoneOf(f.path, f.title ?? f.name);
    if (!by.has(p.key)) by.set(p.key, []);
    by.get(p.key).push({ ...f, parsed: p, zone });
  }
  const rank = (f) => [-ZONE_RANK[f.zone], +(f.parsed.rev ?? -1), /pdf$/i.test(f.parsed.ext) ? 0 : 1, Date.parse(f.modifiedTime ?? 0) || 0];
  const cmp = (a, b) => { const x = rank(a), y = rank(b); for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return y[i] - x[i]; return 0; };
  return [...by.values()].map((list) => {
    list.sort(cmp);
    const cur = list[0];
    const titled = list.find((f) => f.parsed.title && f.parsed.rev === cur.parsed.rev) ?? list.find((f) => f.parsed.title) ?? cur;
    const zones = { controlled: 0, obsolete: 0, uncontrolled: 0 };
    for (const f of list) zones[f.zone]++;
    return { ...cur.parsed, title: titled.parsed.title, lang: cur.parsed.lang ?? titled.parsed.lang, current: cur, files: list, zones,
      status: zones.controlled ? "Effective" : zones.uncontrolled ? "Uncontrolled copy" : "Obsolete" };
  }).sort((a, b) => String(a.type).localeCompare(String(b.type)) || a.code.localeCompare(b.code, undefined, { numeric: true }));
}

/** Register rows (docs table) from grouped documents; `products` as for productOf. */
export function docRows(groups, products = []) {
  return groups.filter((g) => g.type !== "SOP").map((g) => {
    const f = g.current;
    const name = `${g.title ?? ""} ${f.title ?? ""}`;
    return {
      Code: g.code, Type: g.type, Title: g.title || null, Product: productOf(name, products), Strength: strengthOf(name), "Product code": productCodeOf(g.code),
      Department: TYPE_BY_ID.get(g.type)?.[3] ?? deptOfPath(f.path), Site: g.site ?? (/onc/i.test(f.path ?? "") ? "Oncology" : null), Language: g.lang ?? null,
      Revision: g.rev ?? null, Status: g.status, Folder: f.path || null, "Drive ID": f.id, "Drive file": f.title ?? f.name, "Drive modified": (f.modifiedTime ?? "").slice(0, 10) || null,
      Files: g.files.length, Obsolete: g.zones.obsolete || null, Uncontrolled: g.zones.uncontrolled || null,
    };
  });
}

// ---------- master document indexes ----------
// document numbers as scanned: "SOPAB0015E/Onc/02", "SOPAB0044F/One/01", "SOPABO148F/Onc/01" (letter O for a zero)
const IDX_CODE = /\b([A-Z]{2,6}[0-9O]?\d{2,4}[A-Z]?)\s*\/\s*(?:Onc[e]?|One|0nc|Ono|On)\s*\/\s*(\d{1,2})\b/gi;
const IDX_DATE = /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g;
const IDX_NA = /\bN\/?A\b/g;
const isoOf = (d, m, y) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const days = (a, b) => (Date.parse(b) - Date.parse(a)) / 86400000;
const fixO = (c) => c.replace(/^([A-Z]+?)O(\d)/, (m, a, d) => (/^(SOP[A-Z]{2,3}|[A-Z]{2,5})$/.test(a) ? `${a}0${d}` : m));

/** Identity of an index across its yearly editions: "IndAB-ONC-SOP25.pdf" → { dept: "AB", scope: "SOP", year: 2025 }. */
export function indexIdOf(name, text = "") {
  const fromText = String(text).match(/\bInd\s*([A-Z]{2,3})\s*\/\s*On[ce]\s*-\s*([A-Z]+?)\s*(\d{2})\b/i);
  const fromName = String(name ?? "").match(/^\s*I?nd\s*([A-Z]{2,3})\s*-\s*(?:On[ce]\s*-\s*)?([A-Z]*?)\s*(\d{2})\b/i);
  const enName = String(name ?? "").match(/^\s*([A-Z]{2,3})\s*-\s*INDEX\s*-\s*(\d{2,4})/i);
  const scope = (s) => { const u = String(s || "SOP").toUpperCase(); return /^SOP/.test(u) ? "SOP" : u; };
  if (fromName || fromText) {
    const n = fromName ?? fromText;
    return { dept: n[1].toUpperCase(), scope: scope(fromName?.[2] || fromText?.[2]), year: 2000 + (+(fromText ?? n)[3] % 100) };
  }
  if (enName) return { dept: enName[1].toUpperCase(), scope: "SOP", year: 2000 + (+enName[2] % 100) };
  return null;
}

/**
 * A master document index as the Drive connector reads it (scanned and OCR'd: cells come one per line, roughly in
 * reading order) → { id, dept, scope, year, entries: [{ code, key, rev, effective, validity }], anomalies, partial }.
 * Document numbers are taken before the index's revision history and put in number order (the table's order); dates
 * keep their reading order and may run past the history, where OCR sometimes drops the last rows. When the index
 * carries validity dates (about two dates per document), each effective date takes the next date 10 months to 6 years
 * later (an "N/A" between them is a comment cell) or the same date written twice; otherwise each date is one row.
 */
export function parseIndexText(text, name = "") {
  const all = String(text ?? "");
  const cutAt = all.search(/Index\s+revision\s+History|Historique\s+de\s+la\s+r[ée]vision/i);
  const cut = cutAt > 0 ? cutAt : all.length;
  const toks = [];
  for (const m of all.slice(0, cut).matchAll(IDX_CODE)) toks.push({ at: m.index, kind: "code", code: fixO(m[1].toUpperCase()), rev: m[2].padStart(2, "0") });
  for (const m of all.matchAll(IDX_DATE)) if (+m[2] >= 1 && +m[2] <= 12 && +m[1] >= 1 && +m[1] <= 31 && +m[3] >= 1990 && +m[3] <= 2099) toks.push({ at: m.index, kind: "date", iso: isoOf(m[1], m[2], m[3]) });
  for (const m of all.matchAll(IDX_NA)) toks.push({ at: m.index, kind: "na" });
  toks.sort((a, b) => a.at - b.at);
  const num = (c) => +(c.match(/\d+/)?.[0] ?? 0);
  const seenCode = new Set();
  const codes = toks.filter((x) => x.kind === "code" && /\d{3}/.test(x.code) && !seenCode.has(x.code) && seenCode.add(x.code))
    .sort((a, b) => a.code.replace(/\d.*$/, "").localeCompare(b.code.replace(/\d.*$/, "")) || num(a.code) - num(b.code));
  const dates = toks.filter((x) => x.kind === "date");
  const paired = dates.filter((x) => x.at < cut).length >= 1.6 * codes.length;
  const rows = [];
  for (let i = 0; i < toks.length; i++) {
    if (toks[i].kind !== "date") continue;
    const e = toks[i].iso;
    if (paired) {
      let j = i + 1;
      while (toks[j]?.kind === "na") j++;
      const nx = toks[j];
      const gap = nx?.kind === "date" ? days(e, nx.iso) : null;
      if (gap != null && ((gap >= 300 && gap <= 6 * 366) || (gap === 0 && j === i + 1))) { rows.push({ effective: e, validity: nx.iso }); i = j; continue; }
    }
    rows.push({ effective: e, validity: null });
  }
  const id = indexIdOf(name, all);
  const entries = codes.map((c, i) => ({ code: `${c.code}/Onc`, key: docKey(`${c.code}/Onc`), rev: c.rev, effective: rows[i]?.effective ?? null, validity: rows[i]?.validity ?? null })).filter((e) => e.key);
  const anomalies = entries.flatMap((e) => entryAnomalies(e, id?.scope, id?.year).map((kind) => ({ code: e.code, kind })));
  return { ...(id ?? { dept: null, scope: null, year: null }), id: id ? `Ind${id.dept}/Onc-${id.scope}${String(id.year).slice(2)}` : String(name ?? "").replace(/\.[a-z]+$/i, ""), entries, anomalies, partial: rows.length < codes.length };
}

/** What looks wrong in one index entry: "same-date" (validity = effective), "period" (an SOP valid other than 3 years), "future" (effective after the index's year). */
export function entryAnomalies(e, scope, year) {
  const out = [];
  if (e.validity && e.validity === e.effective) out.push("same-date");
  else if (e.validity && e.effective && scope === "SOP" && Math.abs(days(e.effective, e.validity) - 3 * 365.25) > 2) out.push("period");
  if (e.effective && year && +String(e.effective).slice(0, 4) > +year + 1) out.push("future");
  return out;
}

/**
 * The current edition of each master index (one per department and scope: the latest year, then the newest file) among
 * register rows of type IND that are not obsolete. Returns [{ row, dept, scope, year }].
 */
export function currentIndexes(rows) {
  const best = new Map();
  for (const r of rows ?? []) {
    if (r.Type !== "IND" || /obsolete/i.test(r.Status ?? "") || !r["Drive ID"]) continue;
    const id = indexIdOf(r["Drive file"] ?? r.Code);
    if (!id) continue;
    const k = `${id.dept}/${id.scope}`, o = best.get(k);
    if (!o || id.year > o.year || (id.year === o.year && String(r["Drive modified"] ?? "") > String(o.row["Drive modified"] ?? ""))) best.set(k, { row: r, ...id });
  }
  return [...best.values()].sort((a, b) => a.dept.localeCompare(b.dept) || a.scope.localeCompare(b.scope));
}

/**
 * Check an index's entries against the documents found in Drive (`byKey`: key → { rev, status }). Each entry gets a state:
 * "match", "drive-newer" (Drive holds a later revision than the index lists), "drive-older" (the index lists a revision
 * Drive does not hold yet), "obsolete" (only obsolete copies in Drive) or "missing" (no file).
 */
export function checkEntry(e, doc) {
  if (!doc) return "missing";
  if (doc.status === "Obsolete") return "obsolete";
  if (doc.rev == null || e.rev == null) return "match";
  return +doc.rev === +e.rev ? "match" : +doc.rev > +e.rev ? "drive-newer" : "drive-older";
}
