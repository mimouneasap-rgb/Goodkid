// SOP library helpers (pure, no DOM): read SOP codes, revisions, site and language from file names, group a
// folder's revisions and copies per SOP, and turn an SOP's text (as the Drive connector returns it: one
// paragraph per line, tables as Markdown) into sections, tables, history, distribution and cross-references.

const CODE_RE = /^\s*(SOP|VMP|SMF|POL|WI)\s*([A-Z]{2,3})?\s*(\d{1,4})([A-Z])?/i;
const CODE_IN_TEXT = /\b(?:SOP[A-Z]{2,3}\d{3,4}[A-Z]?|VMP\d{3,4}|SMF\d{3,4})(?:\s?[\/-]\s?Onc)?\b/gi;
const FORM_IN_TEXT = /\b[A-Z]{2,3}\d{3,4}[A-Z]?\/(?:Onc\/)?[A-Z]{1,2}\d{2}(?:\/\d{2})?\b/g;
const CC_IN_TEXT = /\bCC(?:[-\/]?[A-Za-z0-9]+)*\d[A-Za-z0-9]*/g;
const unnumber = (s) => s.replace(/^\s*\d+(\.\d+)*\.?\s*/, "");
const DMY = /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/;

export const SOP_DEPTS = {
  QA: ["Quality Assurance", "Assurance Qualité"], QC: ["Quality Control", "Contrôle Qualité"], VL: ["Validation", "Validation"], PR: ["Production", "Production"],
  GS: ["Quality system", "Système qualité"], CM: ["Compliance", "Conformité"], WH: ["Warehouse", "Magasin"], HSE: ["Health & safety", "HSE"], EN: ["Engineering", "Technique"],
  RD: ["R&D", "R&D"], RA: ["Regulatory affairs", "Affaires réglementaires"], PL: ["Planning", "Planification"],
};

/** Identity of an SOP across spellings: "SOPAB0003E-Onc", "SOPAB0003E/Onc-04" and "SOPAB3/Onc" → "SOPAB3/ONC" (language letter ignored). */
export function sopKey(code) {
  const s = String(code ?? "");
  const m = s.match(CODE_RE);
  if (!m) return null;
  const onc = /^[\s\-\/_]*onc\b/i.test(s.slice(m[0].length));
  return `${m[1].toUpperCase()}${(m[2] ?? "").toUpperCase()}${+m[3]}${onc ? "/ONC" : ""}`;
}

/** Code as the library writes it: SOPAB0040F/Onc. */
export const sopCode = (p) => `${p.prefix}${p.dept ?? ""}${String(p.num).padStart(p.width ?? 4, "0")}${p.lang ?? ""}${p.site === "Oncology" ? "/Onc" : ""}`;

export const cleanTitle = (s) => String(s ?? "")
  .replace(/\s*-\s*copie\s*$/i, "").replace(/(\s*\(\d{1,3}\))+\s*$/g, "").replace(/\b(updated|final|draft)\s*$/i, "").replace(/[\s_]+\d{6,8}\s*$/, "")
  .replace(/^[\s\-_.:]+|[\s\-_.]+$/g, "").replace(/\s{2,}/g, " ").trim();
const FRENCH = /[éèêàçù]|\bproc[ée]dure\b|\b(des|du|les|et|de la|pour)\b/i;

/** "SOPAB0040F-Onc-01 Procédure de … (1).docx" → { key, code, prefix, dept, num, lang, site, rev, title, ext } or null. */
export function parseSopFileName(name) {
  const full = String(name ?? "").trim();
  const ext = (full.match(/\.([A-Za-z0-9]{2,4})$/)?.[1] ?? "").toLowerCase();
  const base = full.replace(/\.[A-Za-z0-9]{2,4}$/, "");
  const m = base.match(CODE_RE);
  if (!m) return null;
  let rest = base.slice(m[0].length);
  let site = "General";
  const onc = rest.match(/^\s*[-_\/ ]?\s*onc\b/i);
  if (onc) { site = "Oncology"; rest = rest.slice(onc[0].length); }
  let rev = null;
  const r = rest.match(/^\s*[-_.]\s*(\d{1,2})(?!\d)/);
  if (r) { rev = r[1].padStart(2, "0"); rest = rest.slice(r[0].length); }
  const title = cleanTitle(rest);
  const letter = (m[4] ?? "").toUpperCase();
  const lang = letter === "E" ? "English" : letter === "F" ? "French" : title ? (FRENCH.test(title) ? "French" : "English") : null;
  const p = { prefix: m[1].toUpperCase(), dept: m[2]?.toUpperCase() ?? null, num: +m[3], width: m[3].length >= 4 ? m[3].length : 4, letter, lang, site, rev, title, ext };
  p.key = `${p.prefix}${p.dept ?? ""}${p.num}${site === "Oncology" ? "/ONC" : ""}`;
  p.code = `${p.prefix}${p.dept ?? ""}${String(p.num).padStart(p.width, "0")}${letter}${site === "Oncology" ? "/Onc" : ""}`;
  return p;
}

/**
 * Group a folder listing ({id, title, mimeType, modifiedTime, viewUrl, fileSize}) by SOP. The highest revision is
 * current (a Word file before a PDF of the same revision, then the newest); the others are older revisions or copies.
 * Returns { sops: [{key, code, …parsed, current, files}], other: [files whose names carry no SOP code] }.
 */
export function groupSopFiles(files) {
  const seen = new Set(), by = new Map(), other = [];
  for (const f of files ?? []) {
    if (!f?.id || seen.has(f.id) || /folder/.test(f.mimeType ?? "")) continue;
    seen.add(f.id);
    const p = parseSopFileName(f.title ?? f.name);
    if (!p) { other.push(f); continue; }
    if (!by.has(p.key)) by.set(p.key, []);
    by.get(p.key).push({ ...f, parsed: p });
  }
  const rank = (f) => [+(f.parsed.rev ?? -1), /pdf$/i.test(f.parsed.ext) ? 0 : 1, Date.parse(f.modifiedTime ?? 0) || 0];
  const cmp = (a, b) => { const x = rank(a), y = rank(b); for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return y[i] - x[i]; return 0; };
  const sops = [...by.values()].map((list) => {
    list.sort(cmp);
    const cur = list[0];
    const titled = list.find((f) => f.parsed.title && f.parsed.rev === cur.parsed.rev) ?? list.find((f) => f.parsed.title) ?? cur;
    return { ...cur.parsed, title: titled.parsed.title, lang: cur.parsed.lang ?? titled.parsed.lang, current: cur, files: list };
  }).sort((a, b) => a.code.localeCompare(b.code));
  return { sops, other };
}

// ---------- SOP text → structure ----------
// Section headings of the site's SOP template (English and French) → section id
const HEADINGS = [
  ["intro", /^(introduction|généralités)$/i],
  ["purpose", /^(purpose|objective|objectives?|objet|objectifs?|but)$/i],
  ["scope", /^(scope|domaine d.application|champ d.application)$/i],
  ["safety", /^(health and safety|safety|hygi[eè]ne et s[ée]curit[ée]|s[ée]curit[ée]|hse)$/i],
  ["resp", /^(responsibilit(y|ies)|responsabilit[ée]s?)$/i],
  ["tools", /^(related tools( and instruments)?|tools( and instruments)?|outils( et instruments)?( associ[ée]s)?)$/i],
  ["materials", /^(related materials|materials|mat[ée]riels?( associ[ée]s)?|mati[eè]res?)$/i],
  ["glossary", /^(glossary|definitions?|abbreviations?|glossaire|d[ée]finitions?|abr[ée]viations?)$/i],
  ["related", /^(related documents|reference documents|documents (associ[ée]s|de r[ée]f[ée]rence|li[ée]s|connexes))$/i],
  ["procedure", /^(procedure|proc[ée]dure|mode op[ée]ratoire|description)$/i],
  ["distribution", /^(distribution( list)?|liste de (diffusion|distribution)|diffusion)$/i],
  ["training", /^(training|formation)$/i],
  ["references", /^(references?|r[ée]f[ée]rences?( bibliographiques)?)$/i],
  ["history", /^(sop history|history|revision history|historique( des r[ée]visions| de la proc[ée]dure| de la sop)?)$/i],
  ["annex", /^(annex(es)?|appendi(x|ces)|attachments?|annexes?|pi[eè]ces jointes)$/i],
];
export const SECTION_IDS = HEADINGS.map(([id]) => id);
const headingOf = (line) => {
  const s = line.replace(/^\s*\d+(\.\d+)*\.?\s*/, "").replace(/[\s:¶]+$/, "").trim();
  return s.length <= 60 ? HEADINGS.find(([, re]) => re.test(s))?.[0] ?? null : null;
};
const tableCells = (line) => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());

const iso = (m) => (m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : null);

/**
 * The document header, when the text carries one: the document-system banner of PDF exports ("Document Nr SOPAB0085E
 * Rev.: 3 Document Name … Effective Date dd/mm/yyyy Validity Date dd/mm/yyyy") or a header table in a Word file
 * ("SOP No.: | … | Revision No.: | … ", "Title: | …"). Returns { code, rev, title, effective, validity } (fields may be null) or null.
 */
export function sopHeader(text) {
  const t = String(text ?? "");
  const banner = t.match(/Document\s+Nr\s+([A-Z][\w\/-]*\d[\w\/-]*)\s+Rev\.?\s*:?\s*(\d{1,2})\s+Document\s+Name\s+(.+?)\s+Document\s+Name\s+Other/i);
  const dates = t.match(/Effective\s+Date\s+(\d{1,2})\/(\d{1,2})\/(\d{4})\s+Validity\s+Date\s+(\d{1,2})\/(\d{1,2})\/(\d{4})/i);
  if (banner || dates) return {
    code: banner?.[1] ?? null, rev: banner ? banner[2].padStart(2, "0") : null, title: banner?.[3].trim() ?? null,
    effective: dates ? iso([0, dates[1], dates[2], dates[3]]) : null, validity: dates ? iso([0, dates[4], dates[5], dates[6]]) : null,
  };
  // a header table before the first section
  const head = t.split(/\n\s*(?:\d+\\?\.\s*)?(?:Introduction|Purpose|Objet|Objectif)\s*\n/i)[0];
  const cells = [...head.matchAll(/^\|(.*)\|\s*$/gm)].map((m) => m[1].split("|").map((c) => c.trim()));
  if (!cells.length) return null;
  const after = (re) => { for (const r of cells) { const i = r.findIndex((c) => re.test(c)); if (i >= 0) { const v = r.slice(i + 1).find((c) => c); if (v) return v; } } return null; };
  const out = { code: after(/^(sop|document)\s*(no|n°|nr|number)\.?\s*:?$/i), rev: after(/^rev(ision)?\.?\s*(no|n°)?\.?\s*:?$/i)?.replace(/\D/g, "").padStart(2, "0") || null,
    title: after(/^(title|titre)\s*:?$/i), effective: iso(after(/^(effective|date d.application|date d.effet)/i)?.match(DMY)), validity: iso(after(/^(review|validity|next review|date de r[ée]vision)/i)?.match(DMY)) };
  return Object.values(out).some(Boolean) ? out : null;
}

// page furniture repeated by document-system PDF exports
const NOISE = [/^QMex\s*\|/i, /^Document Type & Name/i, /^Document Nr\s+Document Name/i, /^Rev\.?:\s*\d+\s+NA\b/i, /^Effective$/i, /^Page \d+ of \d+$/i];

/**
 * SOP text → { sections: [{id, title, blocks: [{type: "p"|"h"|"table", text?, rows?}]}], header, purpose, scope, distribution,
 * related: [{code, title}], history: [{ver, date, text}], effective, refs: [codes], forms, changes, glossary, words }.
 */
export function parseSopText(text) {
  const header = sopHeader(text);
  const banner = header?.title ? new RegExp(`^.{0,40}${header.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+\\d{2}\\/\\d{2}\\/\\d{4}$`) : null;
  const lines = String(text ?? "").replace(/\r/g, "").replace(/\\\./g, ".").split("\n").filter((l) => !NOISE.some((re) => re.test(l.trim())) && !(banner && banner.test(l.trim())));
  const sections = [{ id: "head", title: "", blocks: [] }];
  let table = null;
  const flush = () => { if (table) { const rows = table.filter((r) => !r.every((c) => /^:?-*:?$/.test(c))); if (rows.length) sections.at(-1).blocks.push({ type: "table", rows }); table = null; } };
  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith("|")) { (table ??= []).push(tableCells(line)); continue; }
    flush();
    if (!line) continue;
    const id = headingOf(line);
    if (id) { sections.push({ id, title: line.replace(/[\s:¶]+$/, ""), blocks: [] }); continue; }
    sections.at(-1).blocks.push({ type: "p", text: line });
  }
  flush();
  const secs = sections.filter((s) => s.id !== "head" || s.blocks.length);
  // short lines without closing punctuation inside the procedure are its sub-headings
  for (const s of secs) if (s.id === "procedure" || s.id === "resp" || s.id === "annex") {
    s.blocks.forEach((b, i) => { if (b.type === "p" && b.text.length <= 90 && !/[.:;,!?)]$/.test(b.text) && /^[\p{Lu}\d]/u.test(b.text) && s.blocks[i + 1]) b.type = "h"; });
  }
  const sec = (id) => secs.find((s) => s.id === id);
  const paras = (id) => (sec(id)?.blocks ?? []).filter((b) => b.type !== "table").map((b) => unnumber(b.text)).filter(Boolean);
  const rowsOf = (id) => (sec(id)?.blocks ?? []).filter((b) => b.type === "table").flatMap((b) => b.rows).filter((r) => r.some((c) => c));
  const related = rowsOf("related").filter((r) => /[A-Z]{2,}.*\d/.test(r[0]) && !/document\s*no/i.test(r[0])).map((r) => ({ code: r[0].replace(/\s+/g, ""), title: r.slice(1).find((c) => c) ?? "" }));
  // history written as lines ("01 22/02/2022 1. First issue") rather than a table
  const historyLines = (sec("history")?.blocks ?? []).filter((b) => b.type !== "table").map((b) => b.text).map((p) => p.match(/^(\d{1,2})\s+(\d{1,2})\/(\d{1,2})\/(\d{4})\s*(.*)$/)).filter(Boolean)
    .map((m) => ({ ver: m[1].padStart(2, "0"), date: iso([0, m[2], m[3], m[4]]), text: m[5] }));
  const historyRows = rowsOf("history").filter((r) => /^\d{1,2}$/.test(r[0].replace(/\D/g, "")) && /\d/.test(r[0]) && !/ver/i.test(r[0])).map((r) => {
    const cells = r.slice(1).filter((c) => c);
    const dateCell = cells.find((c) => DMY.test(c));
    const m = dateCell?.match(DMY);
    return { ver: r[0].replace(/\D/g, "").padStart(2, "0"), date: m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : null, text: cells.filter((c) => c !== dateCell).join(" · ") || (dateCell && !/^\s*\d{1,2}\/\d{1,2}\/\d{4}\s*$/.test(dateCell) ? dateCell : "") };
  });
  const history = historyRows.length ? historyRows : historyLines;
  const dated = history.filter((x) => x.date).sort((a, b) => b.ver.localeCompare(a.ver));
  const all = String(text ?? "");
  const uniq = (xs) => [...new Set(xs)];
  return {
    sections: secs, header,
    purpose: paras("purpose")[0] ?? null,
    scope: paras("scope")[0] ?? null,
    distribution: paras("distribution").map((s) => s.replace(/[.;]\s*$/, "").trim()).filter((s) => s && s.length < 80),
    related, history, effective: header?.effective ?? dated[0]?.date ?? null, effectiveVer: header?.rev ?? dated[0]?.ver ?? null, validity: header?.validity ?? null,
    refs: uniq((all.match(CODE_IN_TEXT) ?? []).map((c) => c.replace(/\s+/g, ""))),
    forms: uniq(all.match(FORM_IN_TEXT) ?? []),
    changes: uniq((rowsOf("history").flat().join(" ").match(CC_IN_TEXT) ?? [])),
    glossary: paras("glossary").map((p) => { const i = p.indexOf(":"); return i > 0 && i < 90 ? { term: p.slice(0, i).trim(), def: p.slice(i + 1).trim() } : null; }).filter(Boolean),
    words: all.split(/\s+/).filter(Boolean).length,
  };
}

/** Department names in a distribution list → the app's department codes. */
export function deptCodes(names) {
  const out = new Set();
  for (const n of names ?? []) {
    const s = String(n).toLowerCase();
    if (/assurance|\bqa\b/.test(s)) out.add("QA");
    if (/quality control|contr[ôo]le qualit|\bqc\b|laboratoire/.test(s)) out.add("QC");
    if (/validation|\bvl\b/.test(s)) out.add("VL");
    if (/production|fabrication|conditionnement|ordering/.test(s)) out.add("PR");
    if (/compliance|conformit/.test(s)) out.add("CM");
    if (/warehouse|magasin|stock/.test(s)) out.add("WH");
    if (/engineering|technique|maintenance/.test(s)) out.add("EN");
    if (/research|r&d|d[ée]veloppement/.test(s)) out.add("RD");
    if (/regulatory|r[ée]glementaire/.test(s)) out.add("RA");
    if (/planning|planification/.test(s)) out.add("PL");
    if (/hse|health|s[ée]curit/.test(s)) out.add("HSE");
  }
  return [...out];
}

/** Topics of the app an SOP governs, from its title (rules in SOP_TOPICS). */
export const topicsOf = (title, topics) => topics.filter(([, , , re]) => re.test(String(title ?? ""))).map(([id]) => id);

/** Sentences of an SOP's text that contain a term (for search results), at most `max`. */
export function matchesIn(text, term, max = 3) {
  const q = String(term ?? "").trim().toLowerCase();
  if (!q) return [];
  const out = [];
  for (const para of String(text ?? "").split(/\n+/)) {
    if (para.startsWith("|") || !para.toLowerCase().includes(q)) continue;
    for (const sent of para.split(/(?<=[.!?])\s+/)) if (sent.toLowerCase().includes(q)) { out.push(sent.trim().slice(0, 260)); if (out.length >= max) return out; }
  }
  return out;
}

/**
 * Library rows from a Drive folder grouped with groupSopFiles: one {column: value} object per SOP, matched to the existing
 * library by code identity (so "SOPAB0003E-Onc" in the library takes "SOPAB0003E-Onc-04.docx"). Curated titles and
 * statuses are kept; revision, file and dates come from Drive.
 */
export function driveRows(library, groups, folderName) {
  const lib = new Map(library.filter((r) => r.Code).map((r) => [sopKey(r.Code), r]));
  return groups.map((g) => {
    const r = lib.get(g.key);
    // where the files sit (groups from dockit's groupDocs carry zones; plain folder groups are all controlled)
    const zone = (f) => f.zone ?? "controlled";
    const drive = g.status && g.status !== "Effective" ? g.status : null;
    const revs = [...new Set(g.files.filter((f) => zone(f) === "controlled" && f.parsed.rev).map((f) => f.parsed.rev))].sort();
    return {
      Code: r?.Code ?? g.code, Title: r?.Title || g.title || null, Department: r?.Department || g.dept, Site: r?.Site || g.site, Language: r?.Language || g.lang,
      Type: r?.Type || (g.prefix === "VMP" ? "Validation master plan" : g.prefix === "SMF" ? "Site master file" : "SOP"),
      Status: drive ?? (r?.Status && !/^(listed|cited|obsolete|uncontrolled copy)$/i.test(r.Status) ? r.Status : "Effective"),
      Revision: g.rev ?? r?.Revision ?? null, "Drive ID": g.current.id, "Drive file": g.current.title ?? g.current.name, "Drive modified": (g.current.modifiedTime ?? "").slice(0, 10) || null,
      Files: g.files.length, Source: r?.Source && !/^drive/i.test(r.Source) ? r.Source : `Drive · ${g.current.source ?? folderName}`,
      Folder: g.current.path || null, Revisions: revs.join(" ") || null,
      Obsolete: g.files.filter((f) => zone(f) === "obsolete").length || null, Uncontrolled: g.files.filter((f) => zone(f) === "uncontrolled").length || null,
    };
  });
}
