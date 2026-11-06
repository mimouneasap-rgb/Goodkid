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
  text = unfoldText(text);
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

// ---------- bilingual SOPs: a two-column English | French table whose cells hold whole sections ----------
const GLUED_HEADINGS = /(^|[.:;)\]a-z])(Introduction|Purpose|Objectives?|Scope|Health and Safety|Responsibilities|Related Tools(?: and Instruments)?|Related Materials|Glossary|Definitions|Related Documents|Associated Documents|Procedure|Distribution List|Training|References|SOP History|Annex(?:es)?)(?=[A-Z])/g;
/** The English column of a bilingual SOP as paragraphs: headings and sentences that the export glued together are split again. */
export function unfoldText(text) {
  const out = [];
  for (const line of String(text ?? "").replace(/\r/g, "").split("\n")) {
    if (!(line.startsWith("|") && line.length > 600)) { out.push(line); continue; }
    const cells = tableCells(line);
    const main = cells.find((c) => c.length > 200) ?? cells.reduce((a, c) => (c.length > a.length ? c : a), "");
    const x = main.replace(/\\\./g, ".").replace(GLUED_HEADINGS, "$1\n$2\n").replace(/([a-z0-9)\]%»"])([.:;])(?=[A-ZÉ])/g, "$1$2\n")
      .replace(/(?<=[a-z]{3})(?=[A-Z][a-z]{2,}[\s:])/g, "\n"); // "two years periodData shall…"
    out.push("", ...x.split("\n").map((l) => l.trim()).filter(Boolean).flatMap((l) => [l, ""]));
  }
  return out.join("\n");
}

// ---------- forms, templates and attachments of an SOP ----------
// "AB0002F/Onc/FF01/02", "AB0001/Onc/T01/01", "AB0027/Onc/F01", also "AB0002F/FF01/Onc/02" as typed in some SOPs
const FORM_CODE = /\b([A-Z]{2,3})(\d{3,4})([EF])?\s*\/\s*(?:(?:Onc|One)\s*\/\s*)?([A-Z]{1,3}\d{2})(?:\s*\/\s*(?:(?:Onc|One)\s*\/\s*)?(\d{2}))?(?![\w\/])/g;
const ATTACH_HEAD = /^(fiche|form(ulaire)?|template|mod[eè]le|attach?ement|annex(e)?|appendix|logbook)\b[^|]{0,12}$/i;
const PLACEHOLDER = /^[\s.…\/_☐-]*$|^(oui|non|yes|no|n\/a|na)$/i;
/** Identity of a form across spellings and revisions: "AB0002F/Onc/FF01/03" → "AB2/FF01". */
export const formKey = (code) => { const m = [...String(code ?? "").matchAll(FORM_CODE)][0]; return m ? `${m[1]}${+m[2]}/${m[4]}` : null; };
/** What a form code is: an attachment (A01), a template (T01, TE01), a logbook or checklist (from its title), otherwise a form. */
export function formKind(no, title = "") {
  if (/log ?book|registre|journal/i.test(title)) return "logbook";
  if (/check-?list|liste de (contr[ôo]le|v[ée]rification)/i.test(title)) return "checklist";
  if (/^A\d/.test(no)) return "attachment";
  if (/^TE?\d/.test(no)) return "template";
  return "form";
}
const cleanLabel = (s) => String(s ?? "").replace(/\s*[:：]\s*$/, "").replace(/\s+/g, " ").trim();
const titleAfter = (s) => s.match(/^\s*(?:\)|»)?\s*[:–-]?\s*[«"“]?\s*([^»"”\n|]{4,90}?)\s*(?:[»"”]|[.;]\s|$)/)?.[1]?.trim() ?? null;

/**
 * The forms, templates and attachments an SOP uses: the ones its related-documents table lists ("cited", with their
 * titles and revisions), the ones attached at the end of the SOP file ("attached": a "Fiche Nr / Form Nr / Template No. /
 * Attachment No." header then the code, followed by the form itself, of which the section titles, field labels and table
 * columns are kept), and codes mentioned in the text. Returns [{ key, code, title, kind, citedRev, attachedRev, rev, cited,
 * attached, mentions, sections, fields, columns }] in order of first appearance.
 */
export function sopForms(text) {
  const lines = unfoldText(text).split("\n");
  const by = new Map();
  const get = (m) => {
    const key = `${m[1]}${+m[2]}/${m[4]}`;
    if (!by.has(key)) by.set(key, { key, code: `${m[1]}${m[2]}${m[3] ?? ""}/Onc/${m[4]}`, title: null, kind: null, citedRev: null, attachedRev: null, cited: false, attached: false, mentions: 0, sections: [], fields: [], columns: [] });
    return by.get(key);
  };
  const codeOnly = (c) => { const m = [...c.matchAll(FORM_CODE)]; return m.length === 1 && c.replace(m[0][0], "").replace(/[\s|]/g, "").length === 0 ? m[0] : null; };
  let current = null, prev = null;
  const addTo = (list, v, max) => { const x = cleanLabel(v); if (x && x.length <= 70 && !PLACEHOLDER.test(x) && !list.includes(x) && list.length < max) list.push(x); };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { prev = null; continue; }
    if (line.startsWith("|")) {
      const cells = tableCells(line);
      if (cells.every((c) => /^:?-*:?$/.test(c))) continue;
      const filled = cells.filter((c) => c && !PLACEHOLDER.test(c));
      const first = codeOnly(cells[0] ?? "");
      // "| Fiche Nr | Avis de réception |" then "| AB0002F/Onc/FF01/03 |  |": the start of an attached form
      if (first && prev && ATTACH_HEAD.test(prev[0] ?? "")) {
        current = get(first);
        current.attached = true; current.attachedRev = first[5] ?? current.attachedRev;
        current.title = prev[1] && !codeOnly(prev[1]) ? cleanLabel(prev[1]) : current.title ?? (cells[1] ? cleanLabel(cells[1]) : null);
        prev = cells; continue;
      }
      // "| AB0002F/Onc/FF01/02 | Avis de réception |": a related-documents row
      if (first && cells[1] && !codeOnly(cells[1]) && !ATTACH_HEAD.test(prev?.[0] ?? "")) {
        const f = get(first);
        f.cited = true; f.citedRev = first[5] ?? f.citedRev; f.citedTitle ??= cleanLabel(cells[1]);
        prev = cells; continue;
      }
      if (current && !ATTACH_HEAD.test(cells[0] ?? "")) {
        const tableStart = !prev || prev.every((c) => !c || /^:?-*:?$/.test(c));
        if (filled.length === 1 && filled[0].length <= 90) addTo(current.sections, filled[0], 10);
        else if (filled.length >= (tableStart ? 2 : 3) && filled.every((c) => c.length <= 80 && !/:\s*$/.test(c)) && !current.columns.length) current.columns = filled.slice(0, 14).map(cleanLabel);
        else for (const c of cells) if (/[:：]\s*$/.test(c) && c.length <= 60) addTo(current.fields, c, 18);
      }
      for (const m of line.matchAll(FORM_CODE)) get(m).mentions++;
      prev = cells;
      continue;
    }
    prev = null;
    if (current && line.length <= 80 && /[:：]$/.test(line)) addTo(current.sections, line, 10);
    for (const m of line.matchAll(FORM_CODE)) {
      const f = get(m);
      f.mentions++;
      f.mentionTitle ??= titleAfter(line.slice(m.index + m[0].length));
    }
  }
  return [...by.values()].map((f) => {
    const title = f.title || f.citedTitle || f.mentionTitle || null;
    const revs = [f.citedRev, f.attachedRev].filter(Boolean).sort();
    const { citedTitle, mentionTitle, ...rest } = f;
    return { ...rest, title, kind: formKind(f.key.split("/")[1], title ?? ""), rev: revs.at(-1) ?? null };
  });
}

// ---------- the résumé of an SOP, extracted from its text ----------
const ACTION = /^(?:v[ée]rifier|effectuer|utiliser|signaler|d[ée]charger|proc[ée]der|renseigner|transf[ée]rer|respecter|appliquer|attribuer|codifier|nettoyer|enregistrer|remplir|signer|s['’]assurer|assurer|contr[ôo]ler|pr[ée]lever|peser|identifier|[ée]tiqueter|documenter|informer|archiver|calibrer|[ée]talonner|mettre|placer|ranger|stocker|isoler|lancer|valider|approuver|cr[ée]er|r[ée]diger|envoyer|transmettre|ouvrir|fermer|ne pas|ne jamais|check|ensure|verify|record|fill|sign|clean|transfer|perform|use|inform|document|label|weigh|sample|review|approve|archive|calibrate|collect|send|open|close|register|store|update|prepare|complete|notify|submit|issue|assign|evaluate|investigate|define|identify|monitor|report|escalate|attach|retain|do not|never)\b/i;
const OBLIGATION = /\b(doit|doivent|must|shall|is required|est tenu)\b/i;
const CRITICAL = /\b(interdit|ne jamais|ne pas|never|must not|shall not|prohibited|not allowed|imm[ée]diatement|immediately|au plus tard|d[ée]lai|within|maximum|minimum|au moins|at least|no later than|ne doit)\b|\d+\s*(jours?|days?|h\b|heures?|hours?|min\b|minutes?|°C|%|mois|months?|ans\b|years?|ouvrables|working)/i;
const clip = (s, n) => { const x = String(s ?? "").replace(/\s+/g, " ").trim(); return x.length > n ? `${x.slice(0, n - 1).replace(/\s+\S*$/, "")}…` : x; };
// sentence ends, but not after an abbreviation ("réf. AB0002F…", "No. 3", "e.g. …")
const SENTENCE_END = /(?<!\b(?:r[ée]f|ref|no|n°|nr|e\.g|i\.e|etc|vs|cf|art|fig|ex|approx)\.)(?<=[.!?;])\s+(?=[A-ZÉÀ«"(])/i;
const firstSentence = (s) => String(s ?? "").split(SENTENCE_END)[0];

/** Who does what, from a responsibilities paragraph ("Il est de la responsabilité du X de …", "The X is responsible for …", "X: …"). */
function roleOf(p, next) {
  const s = String(p).replace(/\s+/g, " ").trim();
  const more = (d) => (/:\s*$/.test(d) && next ? `${d} ${firstSentence(next)}` : d);
  let m = s.match(/^il est de la responsabilit[ée] (?:du|de la|de l['’]|des|d['’])\s*(.+?)\s+(?:de|d['’])\s*((?:s['’]|se\s)?[a-zéèêàâîôûç]+(?:er|ir|re|oir)\b.*)$/i);
  if (m) return { role: clip(m[1], 60), duties: clip(more(m[2]), 170) };
  m = s.match(/^(?:the\s+)?(.{3,60}?)\s+(?:is|are)\s+responsible\s+(?:for|to)\s+(.+)$/i) ?? s.match(/^(?:le|la|les|l['’])\s*(.{3,60}?)\s+(?:est|sont)\s+responsables?\s+(?:de|du|des|d['’])\s*(.+)$/i);
  if (m) return { role: clip(m[1], 60), duties: clip(m[2], 170) };
  m = s.match(/^(?:le|la|les|l['’]|the\s+)?\s*([A-ZÉ][^:]{2,60}?)\s+(?:doit|doivent|shall|must|should)\s+(.+)$/);
  if (m) return { role: clip(m[1], 60), duties: clip(m[2], 170) };
  m = s.match(/^([^:]{3,60}):\s*(.*)$/);
  if (m && !/\d/.test(m[1])) return { role: clip(m[1], 60), duties: clip(m[2] || firstSentence(next ?? ""), 170) };
  return null;
}

/**
 * A short résumé of an SOP from its parsed text (parseSopText): purpose, scope, who does what, the key steps (grouped by
 * the procedure's sub-headings, actions only) and the critical points (prohibitions, limits, time frames). Never the full text.
 */
export function sopDigest(doc) {
  const sec = (id) => doc.sections.find((s) => s.id === id);
  const paras = (id) => (sec(id)?.blocks ?? []).filter((b) => b.type !== "table").map((b) => unnumber(b.text)).filter(Boolean);
  // paragraphs joined: a lead-in ("Cette procédure est pour but de", "The purpose is to:") runs on into what follows
  const join = (xs, n) => { let s = ""; for (const x of xs) { if (s.length >= n) break; s = s ? `${s}${/[.;]$/.test(s) || /(?:\b(?:de|du|des|à|pour|to|of|is|are|est|sont)|:)$/i.test(s) ? " " : " — "}${x}` : x; } return s ? clip(s, n + 80) : null; };
  const resp = paras("resp");
  const roles = [];
  for (let i = 0; i < resp.length && roles.length < 6; i++) {
    const r = roleOf(resp[i], resp[i + 1]);
    if (r && r.duties) roles.push(r);
    if (r && /:\s*$/.test(resp[i])) i++;
  }
  const steps = [];
  let phase = null;
  const perPhase = new Map();
  for (const b of sec("procedure")?.blocks ?? []) {
    if (steps.length >= 14) break;
    if (b.type === "h") { phase = clip(unnumber(b.text), 60); continue; }
    if (b.type !== "p") continue;
    const t = unnumber(b.text);
    if (t.length <= 60 && /:\s*$/.test(t)) { phase = clip(cleanLabel(t), 60); continue; } // "Meeting Frequency:" heads what follows
    if (!(ACTION.test(t) || OBLIGATION.test(t)) || t.length < 12) continue;
    const n = perPhase.get(phase) ?? 0;
    if (n >= 4 || steps.some((x) => x.do.slice(0, 45) === clip(firstSentence(t), 170).slice(0, 45))) continue;
    perPhase.set(phase, n + 1);
    steps.push({ phase, do: clip(firstSentence(t), 170), records: [...new Set([...t.matchAll(FORM_CODE)].map((m) => `${m[1]}${m[2]}${m[3] ?? ""}/Onc/${m[4]}`))] });
  }
  const critical = [];
  const inSteps = (c) => steps.some((x) => x.do.slice(0, 40) === c.slice(0, 40));
  for (const id of ["procedure", "safety", "scope"]) for (const p of paras(id)) {
    if (critical.length >= 6) break;
    for (const s of p.split(SENTENCE_END)) if (CRITICAL.test(s) && s.length >= 20 && critical.length < 6 && !inSteps(clip(s, 180)) && !critical.some((c) => c.slice(0, 40) === clip(s, 180).slice(0, 40))) critical.push(clip(s, 180));
  }
  return { by: "app", purpose: join(paras("purpose"), 220), scope: join(paras("scope"), 160), roles, steps, critical };
}

/** The stored résumé of an SOP (JSON in its Summary column), or null. */
export const summaryOf = (s) => { try { const x = JSON.parse(s?.Summary || "null"); return x && typeof x === "object" ? x : null; } catch { return null; } };
/** The stored forms of an SOP (JSON in its Forms column). */
export const formsOf = (s) => { try { const x = JSON.parse(s?.Forms || "[]"); return Array.isArray(x) ? x : []; } catch { return []; } };

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
