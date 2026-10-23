// Pure library logic: indexing, linking, search, statistics and graph data.
// No DOM access here so it can be unit tested with `node --test`.

export const TYPE_META = {
  form: { label: "Form", plural: "Forms", short: "FRM" },
  template: { label: "Template", plural: "Templates", short: "TPL" },
  logbook: { label: "Logbook", plural: "Logbooks", short: "LOG" },
  annex: { label: "Annex", plural: "Annexes", short: "ANX" },
};
export const TYPES = Object.keys(TYPE_META);

export const LANGS = { E: "English", F: "Français" };
export const STATUS_META = {
  current: "Current",
  duplicate: "Duplicate file",
  superseded: "Superseded",
};

const DAY = 86400000;

// ---------- text helpers ----------

export function fold(s) {
  return String(s ?? "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

export function tokens(q) {
  return fold(q).split(/[^a-z0-9/.-]+/).filter((t) => t.length > 0);
}

/** Stable key for an attachment, independent of language letter and version: "QA0118/F02". */
export function attachmentKey(a) {
  const base = String(a.base || "").replace(/[EF]$/, "");
  return `${base}/${String(a.kind || "F")[0]}${String(a.num).padStart(2, "0")}`;
}

/** "SOPQA0118" family code of an SOP (department + number). */
export function familyCode(sop) {
  return sop.dept && sop.num ? `SOP${sop.dept}${sop.num}` : sop.code;
}

export function displayCode(sop) {
  const v = sop.version ? `/${sop.version}` : "";
  return `${sop.code}${sop.site === "Onc" ? "/Onc" : ""}${v}`;
}

// ---------- indexing ----------

/**
 * Validate a library file and build lookups. Throws on files that are not SOP libraries.
 * Returns { meta, sops, byId, families, attachments, attById, refsByFamily, issues }.
 */
export function indexLibrary(raw, today = new Date()) {
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.sops)) {
    throw new Error("This file is not an SOP library (missing \"sops\" list).");
  }
  const sops = raw.sops
    .filter((s) => s && s.id && (s.code || s.file))
    .map((s) => normalizeSop(s, today));
  const byId = new Map(sops.map((s) => [s.id, s]));

  // Families: all files of one SOP number (site versions, old versions, duplicates).
  const families = new Map();
  for (const s of sops) {
    const f = familyCode(s);
    if (!families.has(f)) families.set(f, []);
    families.get(f).push(s);
  }
  for (const list of families.values()) {
    list.sort((a, b) => rankSop(b) - rankSop(a));
  }

  // Resolve SOP → SOP references to the best matching library entry.
  for (const s of sops) {
    s.links = [];
    s.missing = [];
    const seen = new Set();
    for (const code of s.sopRefs || []) {
      const fam = families.get(code);
      if (fam) {
        const target = bestOf(fam, s.site);
        if (target && target.id !== s.id && !seen.has(target.id)) {
          seen.add(target.id);
          s.links.push(target.id);
        }
      } else if (!s.missing.includes(code)) {
        s.missing.push(code);
      }
    }
  }
  for (const s of sops) s.backlinks = [];
  for (const s of sops) {
    for (const id of s.links) byId.get(id)?.backlinks.push(s.id);
  }

  // Attachments owned by each SOP, plus cross references from other SOPs.
  const attachments = [];
  const attById = new Map();
  const ownersByKey = new Map();
  for (const s of sops) {
    for (const a of s.attachments || []) {
      if (!a.own) continue;
      const key = attachmentKey(a);
      const id = `${s.id}~${key}`;
      const entry = {
        id, key, sopId: s.id, code: a.code, title: a.title || "", type: a.type || "form",
        kind: a.kind, num: a.num, version: a.version || null, fields: a.fields || [],
        defined: !!a.defined, dept: s.dept, site: s.site, lang: s.lang, status: s.status,
        usedBy: [],
      };
      attachments.push(entry);
      attById.set(id, entry);
      if (!ownersByKey.has(key)) ownersByKey.set(key, []);
      ownersByKey.get(key).push(entry);
    }
  }
  for (const s of sops) {
    s.foreign = [];
    for (const a of s.attachments || []) {
      if (a.own) continue;
      const owners = ownersByKey.get(attachmentKey(a));
      const owner = owners && (owners.find((o) => o.site === s.site) || owners[0]);
      if (owner) {
        if (!owner.usedBy.includes(s.id)) owner.usedBy.push(s.id);
        s.foreign.push(owner.id);
      }
    }
  }

  const meta = {
    schema: raw.schema || "sop-library/1",
    generatedAt: raw.generatedAt || null,
    source: raw.source || {},
    departments: { ...DEFAULT_DEPARTMENTS, ...(raw.departments || {}) },
    demo: !!raw.demo,
  };
  const lib = { meta, sops, byId, families, attachments, attById };
  lib.issues = qualityIssues(lib);
  return lib;
}

export const DEFAULT_DEPARTMENTS = {
  QA: "Quality Assurance", QC: "Quality Control", VL: "Validation", GS: "General System",
  HSE: "Health, Safety & Environment", PR: "Production", WH: "Warehouse", EN: "Engineering",
  CM: "Compliance", RD: "Research & Development", IT: "Information Technology",
};

function normalizeSop(s, today) {
  const out = {
    title: "", purpose: "", scope: "", intro: "", hse: "", training: "",
    responsibilities: [], tools: [], materials: [], glossary: [], related: [], outline: [],
    distribution: [], references: [], history: [], attachments: [], sopRefs: [], text: "",
    site: "General", status: "current",
    ...s,
  };
  out.code = out.code || out.file;
  out.version = out.version || null;
  // Review state is recomputed against today's date so the file does not go stale.
  if (out.reviewDate && out.status === "current") {
    const days = Math.round((Date.parse(out.reviewDate) - today.getTime()) / DAY);
    out.reviewDays = days;
    out.reviewState = days < 0 ? "overdue" : days <= 90 ? "due" : "ok";
  } else {
    out.reviewState = out.pendingRevision ? "pending" : "unknown";
    out.reviewDays = null;
  }
  out._search = fold([
    out.code, displayCode(out), out.title, out.file, out.purpose, out.scope,
    (out.attachments || []).map((a) => `${a.code} ${a.title}`).join(" "),
  ].join(" \n "));
  out._text = fold(out.text || "");
  return out;
}

function rankSop(s) {
  return (s.status === "current" ? 1000 : 0) + (s.site === "Onc" ? 100 : 0) + Number(s.version || 0);
}

function bestOf(family, preferredSite) {
  const current = family.filter((s) => s.status === "current");
  const pool = current.length ? current : family;
  return pool.find((s) => s.site === preferredSite) || pool[0];
}

// ---------- quality checks ----------

export function qualityIssues(lib) {
  const issues = [];
  for (const s of lib.sops) {
    if (s.status === "duplicate") {
      issues.push({ kind: "duplicate", sopId: s.id, text: `Duplicate file of ${s.code} v${s.version}` });
    }
    if (s.reviewState === "overdue") {
      issues.push({ kind: "overdue", sopId: s.id, text: `Review date passed (${s.reviewDate})` });
    }
    if (s.extraction === "metadata") {
      issues.push({ kind: "unread", sopId: s.id, text: "Content not extracted; open the source file" });
    }
    for (const code of s.missing || []) {
      issues.push({ kind: "missing", sopId: s.id, ref: code, text: `References ${code}, which is not in the library` });
    }
  }
  for (const a of lib.attachments) {
    if (!a.title) issues.push({ kind: "untitled", sopId: a.sopId, attId: a.id, text: `${a.code} has no title in the SOP` });
  }
  return issues;
}

// ---------- filtering & search ----------

export function filterSops(lib, f = {}) {
  const q = tokens(f.query || "");
  const list = lib.sops.filter((s) => {
    if (f.dept && s.dept !== f.dept) return false;
    if (f.lang && s.lang !== f.lang) return false;
    if (f.site && s.site !== f.site) return false;
    if (f.status === "current" && s.status !== "current") return false;
    if (f.status === "duplicate" && s.status !== "duplicate") return false;
    if (f.review && s.reviewState !== f.review) return false;
    if (f.has && !(s.attachments || []).some((a) => a.own && a.type === f.has)) return false;
    return true;
  });
  if (!q.length) return list.map((s) => ({ sop: s, score: 0, snippet: "" }));
  const results = [];
  for (const s of list) {
    const r = scoreSop(s, q, f.fullText !== false);
    if (r) results.push({ sop: s, ...r });
  }
  results.sort((a, b) => b.score - a.score || a.sop.code.localeCompare(b.sop.code));
  return results;
}

function scoreSop(s, q, fullText) {
  let score = 0;
  const code = fold(displayCode(s));
  const title = fold(s.title);
  for (const t of q) {
    let hit = 0;
    if (code.includes(t)) hit = 40;
    else if (title.includes(t)) hit = 18;
    else if (s._search.includes(t)) hit = 8;
    else if (fullText && s._text.includes(t)) hit = 3;
    if (!hit) return null;   // every term must match somewhere
    score += hit;
  }
  if (title.startsWith(q[0])) score += 6;
  return { score, snippet: snippet(s, q) };
}

/** Short excerpt of the SOP text around the first matching term. */
export function snippet(s, q, width = 150) {
  const sources = [s.purpose, s.scope, s.text];
  for (const src of sources) {
    if (!src) continue;
    const f = fold(src);
    for (const t of q) {
      const i = f.indexOf(t);
      if (i >= 0) {
        const start = Math.max(0, i - width / 3);
        const raw = src.slice(start, start + width).replace(/\s+/g, " ").trim();
        return (start > 0 ? "…" : "") + raw + (start + width < src.length ? "…" : "");
      }
    }
  }
  return "";
}

export function filterAttachments(lib, f = {}) {
  const q = tokens(f.query || "");
  return lib.attachments.filter((a) => {
    if (f.type && a.type !== f.type) return false;
    if (f.dept && a.dept !== f.dept) return false;
    if (f.site && a.site !== f.site) return false;
    if (f.withFields && !a.fields.length) return false;
    if (!q.length) return true;
    const sop = lib.byId.get(a.sopId);
    const hay = fold(`${a.code} ${a.title} ${a.fields.join(" ")} ${sop?.code} ${sop?.title}`);
    return q.every((t) => hay.includes(t));
  }).sort((a, b) => a.code.localeCompare(b.code));
}

/** Quick-jump entries for the command palette. */
export function quickFind(lib, query, limit = 12) {
  const q = tokens(query);
  if (!q.length) return [];
  const out = [];
  for (const s of lib.sops) {
    const hay = fold(`${displayCode(s)} ${s.title}`);
    if (q.every((t) => hay.includes(t))) {
      // "QA0001" and "SOPQA0001" both count as typing the SOP's code
      const exact = fold(s.code).replace(/^sop/, "").startsWith(q[0].replace(/^sop/, "")) ? 20 : 0;
      out.push({ kind: "sop", id: s.id, label: s.title, code: displayCode(s), score: exact + (s.status === "current" ? 5 : 0) });
    }
  }
  for (const a of lib.attachments) {
    const hay = fold(`${a.code} ${a.title}`);
    if (q.every((t) => hay.includes(t))) {
      out.push({ kind: "att", id: a.id, label: a.title || a.code, code: a.code, type: a.type, score: fold(a.code).startsWith(q[0]) ? 15 : 2 });
    }
  }
  return out.sort((a, b) => b.score - a.score || a.code.localeCompare(b.code)).slice(0, limit);
}

// ---------- sorting ----------

export function sortSops(list, key = "code", dir = "asc") {
  const m = dir === "desc" ? -1 : 1;
  const get = {
    code: (s) => s.code,
    title: (s) => fold(s.title),
    dept: (s) => s.dept || "",
    version: (s) => Number(s.version || 0),
    review: (s) => s.reviewDate || "9999",
    links: (s) => (s.attachments || []).filter((a) => a.own).length,
  }[key] || ((s) => s.code);
  return [...list].sort((a, b) => {
    const x = get(a.sop || a), y = get(b.sop || b);
    return (x < y ? -1 : x > y ? 1 : 0) * m;
  });
}

// ---------- statistics ----------

export function stats(lib) {
  const current = lib.sops.filter((s) => s.status === "current");
  const count = (arr, fn) => arr.reduce((acc, x) => {
    const k = fn(x) ?? "—";
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});
  const byType = count(lib.attachments, (a) => a.type);
  const fieldCount = lib.attachments.reduce((n, a) => n + a.fields.length, 0);
  const mostReferenced = [...current]
    .sort((a, b) => b.backlinks.length - a.backlinks.length)
    .filter((s) => s.backlinks.length)
    .slice(0, 8);
  const richest = [...current]
    .map((s) => ({ s, n: (s.attachments || []).filter((a) => a.own).length }))
    .sort((a, b) => b.n - a.n)
    .slice(0, 8);
  return {
    total: lib.sops.length,
    current: current.length,
    byDept: count(current, (s) => s.dept),
    byLang: count(current, (s) => s.lang),
    bySite: count(current, (s) => s.site),
    byType,
    attachments: lib.attachments.length,
    fieldCount,
    digitizable: lib.attachments.filter((a) => a.fields.length >= 2).length,
    pending: current.filter((s) => s.pendingRevision).length,
    overdue: current.filter((s) => s.reviewState === "overdue").length,
    dueSoon: current.filter((s) => s.reviewState === "due").length,
    duplicates: lib.sops.filter((s) => s.status === "duplicate").length,
    links: lib.sops.reduce((n, s) => n + s.links.length, 0),
    missingRefs: new Set(lib.sops.flatMap((s) => s.missing)).size,
    mostReferenced,
    richest,
  };
}

/** Review dates bucketed by month for the next `months` months (overdue in bucket 0). */
export function reviewTimeline(lib, today = new Date(), months = 18) {
  const start = new Date(today.getFullYear(), today.getMonth(), 1);
  const buckets = Array.from({ length: months }, (_, i) => {
    const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
    return { key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, date: d, sops: [] };
  });
  let overdue = 0;
  for (const s of lib.sops) {
    if (s.status !== "current" || !s.reviewDate) continue;
    const d = new Date(s.reviewDate);
    if (d < start) { overdue += 1; continue; }
    const idx = (d.getFullYear() - start.getFullYear()) * 12 + d.getMonth() - start.getMonth();
    if (idx >= 0 && idx < months) buckets[idx].sops.push(s.id);
  }
  return { buckets, overdue };
}

// ---------- relationship graph ----------

/** Nodes and edges for the SOP reference map. */
export function graphData(lib, f = {}) {
  const pick = lib.sops.filter((s) => s.status === "current"
    && (!f.dept || s.dept === f.dept)
    && (!f.site || s.site === f.site));
  const ids = new Set(pick.map((s) => s.id));
  const edges = [];
  for (const s of pick) {
    for (const t of s.links) if (ids.has(t)) edges.push({ source: s.id, target: t });
  }
  const degree = new Map();
  for (const e of edges) {
    degree.set(e.source, (degree.get(e.source) || 0) + 1);
    degree.set(e.target, (degree.get(e.target) || 0) + 1);
  }
  const nodes = pick
    .filter((s) => !f.connectedOnly || degree.get(s.id))
    .map((s) => ({ id: s.id, code: s.code, title: s.title, dept: s.dept, degree: degree.get(s.id) || 0,
      atts: (s.attachments || []).filter((a) => a.own).length }));
  const kept = new Set(nodes.map((n) => n.id));
  return { nodes, edges: edges.filter((e) => kept.has(e.source) && kept.has(e.target)) };
}

/** Deterministic force layout (no randomness, so the map is stable between visits). */
export function layoutGraph(graph, width, height, iterations = 260) {
  const n = graph.nodes.length;
  const pos = new Map();
  const golden = Math.PI * (3 - Math.sqrt(5));
  graph.nodes.forEach((node, i) => {
    const r = Math.sqrt((i + 0.5) / Math.max(n, 1)) * Math.min(width, height) * 0.45;
    pos.set(node.id, { x: width / 2 + r * Math.cos(i * golden), y: height / 2 + r * Math.sin(i * golden), vx: 0, vy: 0 });
  });
  const area = width * height;
  const k = Math.sqrt(area / Math.max(n, 1)) * 0.8;
  const list = graph.nodes.map((nd) => pos.get(nd.id));
  for (let it = 0; it < iterations; it += 1) {
    const temp = (1 - it / iterations) * k * 0.6;
    for (let i = 0; i < n; i += 1) {
      const a = list[i];
      a.vx = 0; a.vy = 0;
      for (let j = 0; j < n; j += 1) {
        if (i === j) continue;
        const b = list[j];
        let dx = a.x - b.x, dy = a.y - b.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 0.01) { dx = 0.1 * (i - j); dy = 0.1; d2 = dx * dx + dy * dy; }
        const f = (k * k) / d2;
        a.vx += dx * f; a.vy += dy * f;
      }
    }
    for (const e of graph.edges) {
      const a = pos.get(e.source), b = pos.get(e.target);
      const dx = a.x - b.x, dy = a.y - b.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 0.1;
      const f = d / k;
      a.vx -= dx * f; a.vy -= dy * f;
      b.vx += dx * f; b.vy += dy * f;
    }
    for (const p of list) {
      // gentle pull to the centre keeps unconnected nodes on screen
      p.vx += (width / 2 - p.x) * 0.006 * k;
      p.vy += (height / 2 - p.y) * 0.006 * k;
      const v = Math.sqrt(p.vx * p.vx + p.vy * p.vy) || 1;
      p.x += (p.vx / v) * Math.min(v, temp);
      p.y += (p.vy / v) * Math.min(v, temp);
      p.x = Math.max(24, Math.min(width - 24, p.x));
      p.y = Math.max(24, Math.min(height - 24, p.y));
    }
  }
  return pos;
}

// ---------- records (digital forms & logbooks) ----------

/** Column definitions for a digital record, derived from the attachment's fields. */
export function recordColumns(att) {
  const fields = (att.fields || []).filter(Boolean);
  const cols = fields.length ? fields : ["Date", "Description", "Done by", "Checked by"];
  return cols.slice(0, 16).map((label, i) => ({ id: `f${i}`, label, kind: fieldKind(label) }));
}

export function fieldKind(label) {
  const f = fold(label);
  if (/\b(date|datum|le)\b/.test(f) && !/(signature|initial|by|par)\b/.test(f)) return "date";
  if (/(heure|time|hh:mm)/.test(f) && !/date/.test(f)) return "time";
  if (/(comment|remark|observation|description|reason|raison|summary|resume|justification|statement)/.test(f)) return "text";
  if (/(temperature|humidit|quantity|quantite|weight|masse|poids|pressure|pression|ecart|value|valeur|volume|count|n°|no\.)/.test(f)
    && !/(id|ref|batch|lot|serial|serie|code|asset)/.test(f)) return "number";
  if (/(yes\/no|oui\/non|conform|comply|pass|status|statut|decision)/.test(f)) return "choice";
  return "short";
}

export function validateRecord(values, columns) {
  const filled = columns.filter((c) => String(values[c.id] ?? "").trim() !== "");
  return filled.length ? [] : ["Fill at least one field."];
}

export function recordsToCsv(att, columns, records) {
  const esc = (v) => {
    const s = String(v ?? "");
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = ["Entry", "Recorded at", "Recorded by", ...columns.map((c) => c.label)];
  const rows = records.map((r, i) => [i + 1, r.createdAt, r.by || "", ...columns.map((c) => r.values?.[c.id] ?? "")]);
  return [head, ...rows].map((r) => r.map(esc).join(",")).join("\r\n");
}

export function libraryToCsv(lib) {
  const head = ["Code", "Version", "Site", "Department", "Language", "Title", "Status", "Effective", "Review",
    "Forms", "Templates", "Logbooks", "Annexes", "References", "Referenced by", "Source file"];
  const esc = (v) => {
    const s = String(v ?? "");
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = lib.sops.map((s) => {
    const own = (s.attachments || []).filter((a) => a.own);
    const n = (t) => own.filter((a) => a.type === t).length;
    return [s.code, s.version, s.site, s.dept, s.lang, s.title, s.status, s.effectiveDate, s.reviewDate,
      n("form"), n("template"), n("logbook"), n("annex"), s.links.length, s.backlinks.length, s.file];
  });
  return [head, ...rows].map((r) => r.map(esc).join(",")).join("\r\n");
}

export function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

// ---------- editing ----------

/** Fields the editor may change; anything else in a patch is ignored. */
export const EDITABLE_FIELDS = [
  "code", "dept", "num", "lang", "site", "version", "title", "status", "effectiveDate", "reviewDate", "issueDate",
  "purpose", "scope", "intro", "hse", "training", "responsibilities", "tools", "materials", "outline",
  "distribution", "references", "glossary", "history", "sopRefs", "attachments", "preparedBy", "approvedBy",
];

const SOP_CODE_RE = /^SOP([A-Z]{2,3})(\d{4})([EF]?)$/;
const ATT_CODE_RE = /^([A-Z]{2,3}\d{4}[EF]?)(\/Onc)?\/([A-Z]{1,2})(\d{1,2})(?:\/(\d{2}))?$/i;

/** Split "SOPQA0016E" into department, number and language. */
export function parseSopCode(code) {
  const m = String(code || "").trim().toUpperCase().match(SOP_CODE_RE);
  return m ? { code: m[0], dept: m[1], num: m[2], lang: m[3] || null } : null;
}

/** Read an attachment code such as "QA0016/Onc/AF01/02"; null if it is not one. */
export function parseAttachmentCode(code) {
  const m = String(code || "").trim().match(ATT_CODE_RE);
  if (!m) return null;
  const [base, kind, num, version] = [m[1].toUpperCase(), m[3].toUpperCase(), Number(m[4]), m[5] || null];
  const canonical = `${base}${m[2] ? "/Onc" : ""}/${kind}${String(num).padStart(2, "0")}${version ? `/${version}` : ""}`;
  return { code: canonical, base, site: m[2] ? "Onc" : null, kind, num, version };
}

/** Attachment type from its kind letters (F form, T template, A annex) and title. */
export function attachmentType(kind, title = "") {
  if (/\b(log ?book|registre|register|log)\b/i.test(title)) return "logbook";
  return { T: "template", A: "annex" }[String(kind || "F")[0]] || "form";
}

/** Family codes ("SOPQA0001") from free text listing SOP codes. */
export function sopRefsFrom(text) {
  const out = [];
  for (const m of String(text || "").toUpperCase().matchAll(/SOP\s?([A-Z]{2,3})\s?(\d{4})/g)) {
    const code = `SOP${m[1]}${m[2]}`;
    if (!out.includes(code)) out.push(code);
  }
  return out;
}

export const linesToList = (text) => String(text || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

/** "Term: definition" per line. */
export function parseGlossary(text) {
  return linesToList(text).map((l) => {
    const i = l.search(/\s*[:=–—]\s/);
    return i > 0 ? { term: l.slice(0, i).trim(), def: l.slice(i).replace(/^\s*[:=–—]\s*/, "").trim() } : { term: l, def: "" };
  });
}
export const glossaryToText = (g) => (g || []).map((x) => (x.def ? `${x.term}: ${x.def}` : x.term)).join("\n");

/** "ver | yyyy-mm-dd | summary" per line; the date may be empty. */
export function parseHistory(text) {
  return linesToList(text).map((l) => {
    const [ver, date, ...rest] = l.split("|").map((x) => x.trim());
    const v = String(ver || "").replace(/^v/i, "");
    return { ver: /^\d+$/.test(v) ? v.padStart(2, "0") : v, date: /^\d{4}-\d{2}-\d{2}$/.test(date || "") ? date : null, summary: rest.join(" | ") };
  });
}
export const historyToText = (h) => (h || []).map((x) => `${x.ver} | ${x.date || ""} | ${x.summary || ""}`).join("\n");

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Problems that block saving an edited SOP. */
export function validateSop(s) {
  const errors = [];
  if (!parseSopCode(s.code)) errors.push("Code must look like SOPQA0016E (SOP, department, four digits, optional E/F).");
  if (!String(s.title || "").trim()) errors.push("Give the SOP a title.");
  if (s.version && !/^\d{1,3}$/.test(s.version)) errors.push("Version is a number, for example 02.");
  for (const k of ["effectiveDate", "reviewDate", "issueDate"]) {
    if (s[k] && !ISO_DATE.test(s[k])) errors.push(`${k} must be a date.`);
  }
  const seen = new Set();
  for (const a of (s.attachments || []).filter((x) => x.own)) {
    if (!parseAttachmentCode(a.code)) errors.push(`Attachment code "${a.code || "(empty)"}" must look like QA0016/Onc/FE01/02.`);
    else {
      const key = attachmentKey(a);
      if (seen.has(key)) errors.push(`Two attachments share the number ${a.code}.`);
      seen.add(key);
    }
  }
  return errors;
}

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * The patch that turns `base` into `edited`: only editable fields that differ.
 * Patches are always relative to the original file, so dropping one reverts the SOP.
 */
export function diffSop(base, edited) {
  const patch = {};
  for (const k of EDITABLE_FIELDS) {
    const b = base ? base[k] : undefined;
    const e = edited[k];
    const empty = (v) => v === undefined || v === null || v === "" || (Array.isArray(v) && !v.length);
    if (empty(b) && empty(e)) continue;
    if (!same(b, e)) patch[k] = e;
  }
  return patch;
}

/** Human labels for changed fields in the change log. */
export const FIELD_LABELS = {
  code: "Code", dept: "Department", num: "Number", lang: "Language", site: "Site", version: "Version", title: "Title",
  status: "File status", effectiveDate: "Effective date", reviewDate: "Review date", issueDate: "Issue date",
  purpose: "Purpose", scope: "Scope", intro: "Introduction", hse: "HSE", training: "Training",
  responsibilities: "Responsibilities", tools: "Tools", materials: "Materials", outline: "Procedure outline",
  distribution: "Distribution", references: "References", glossary: "Glossary", history: "History",
  sopRefs: "Referenced SOPs", attachments: "Attachments", preparedBy: "Prepared by", approvedBy: "Approved by",
};

/**
 * Library with edits applied. `edits` is a list of
 * { sopId, patch, deleted?, created?, updatedAt?, updatedBy? }.
 */
export function applyEdits(raw, edits = []) {
  const byId = new Map();
  for (const e of edits) if (e && e.sopId) byId.set(e.sopId, e);
  if (!byId.size) return raw;
  const sops = [];
  for (const s of raw.sops || []) {
    const e = byId.get(s.id);
    if (!e) { sops.push(s); continue; }
    byId.delete(s.id);
    if (e.deleted) continue;
    sops.push(mergePatch(s, e));
  }
  for (const e of byId.values()) {
    if (e.created && !e.deleted) sops.push(mergePatch({ id: e.sopId, status: "current", site: "General", attachments: [], sopRefs: [], extraction: "manual" }, e));
  }
  return { ...raw, sops };
}

function mergePatch(s, e) {
  const patch = {};
  for (const k of EDITABLE_FIELDS) if (k in (e.patch || {})) patch[k] = e.patch[k];
  const out = { ...s, ...patch, _edited: true, _created: !!e.created, _editedAt: e.updatedAt || null, _editedBy: e.updatedBy || null };
  if ("dept" in patch || "num" in patch) out.family = `${out.dept}${out.num}`;
  if ("history" in patch && !("effectiveDate" in patch)) {
    const dated = (out.history || []).filter((h) => h.date);
    if (dated.length) out.lastEffectiveDate = dated[dated.length - 1].date;
  }
  return out;
}

/** The SOP minus derived and private fields, as written back to a library file. */
export function exportableSop(s) {
  const out = {};
  for (const [k, v] of Object.entries(s)) {
    if (k.startsWith("_") || ["links", "missing", "backlinks", "foreign", "reviewState", "reviewDays"].includes(k)) continue;
    out[k] = v;
  }
  return out;
}

export function changesToCsv(changes) {
  const esc = (v) => {
    const s = String(v ?? "");
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = ["When", "By", "SOP", "Action", "Fields", "Reason"];
  const rows = changes.map((c) => [c.at, c.by, c.code, c.action, (c.fields || []).map((f) => FIELD_LABELS[f] || f).join(" | "), c.reason]);
  return [head, ...rows].map((r) => r.map(esc).join(",")).join("\r\n");
}
