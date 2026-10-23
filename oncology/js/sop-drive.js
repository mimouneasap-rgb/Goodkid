// Google Drive, as the viewer's own claude.ai connector (the page's `mcp` capability): crawl the library folder tree,
// read an SOP's or an index's text and search inside the documents. Nothing here needs a token; a view without the
// connector gets clear states.
import { driveRows, parseSopText, deptCodes, sopKey, sopDigest, sopForms, summaryOf } from "./sopkit.js";
export { summaryOf, formsOf } from "./sopkit.js";
import { groupDocs, docRows, zoneOf, isSystemFile, parseIndexText, currentIndexes } from "./dockit.js";

export const DRIVE = "Google Drive";
let mcpP = null;
/** The `mcp` namespace, or null when this view cannot reach connectors. */
export const driveMcp = () => (mcpP ??= Promise.resolve(window.claude?.use?.("mcp") ?? null).catch(() => null));

async function call(tool, input, cache) {
  const mcp = await driveMcp();
  if (!mcp) throw Object.assign(new Error("no mcp"), { code: "not_granted" });
  const r = await mcp.callTool(DRIVE, tool, input, cache === undefined ? undefined : { cache });
  return r?.payload ?? r;
}
const q = (s) => String(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
const isFolder = (f) => /folder/.test(f?.mimeType ?? "");

/** Every item directly in any of `parents` (all pages; one query for several folders). */
async function listChildren(parents, maxAgeMs) {
  const out = [];
  let token = null, guard = 0;
  const query = parents.map((id) => `parentId = '${q(id)}'`).join(" or ");
  do {
    const p = await call("search_files", { query, pageSize: 100, excludeContentSnippets: true, ...(token ? { pageToken: token } : {}) },
      { staleTime: maxAgeMs, gcTime: Math.max(maxAgeMs, 300_000) });
    out.push(...(p?.files ?? []));
    token = p?.nextPageToken || null;
  } while (token && ++guard < 60);
  return out;
}

/**
 * The whole tree under a folder: { files: [{…file, path}], folders: [{ id, path }] }, where `path` is the folder path
 * below the root ("QA Documents/QA SOP"; "" for the root itself). Folders are listed six at a time.
 */
export async function listTree(rootId, { maxAgeMs = 60_000, onProgress } = {}) {
  const paths = new Map([[rootId, ""]]);
  const files = new Map();
  const queue = [rootId];
  let guard = 0;
  while (queue.length && guard++ < 300) {
    const batch = queue.splice(0, 6);
    for (const f of await listChildren(batch, maxAgeMs)) {
      const parent = paths.get(f.parentId) ?? "";
      if (isFolder(f)) {
        if (paths.has(f.id)) continue;
        paths.set(f.id, parent ? `${parent}/${String(f.title ?? "").trim()}` : String(f.title ?? "").trim());
        queue.push(f.id);
      } else if (!files.has(f.id)) files.set(f.id, { ...f, path: parent });
    }
    onProgress?.(files.size, paths.size - 1);
  }
  return { files: [...files.values()], folders: [...paths].filter(([id]) => id !== rootId).map(([id, path]) => ({ id, path })) };
}

/** Every file directly in a folder (all pages), newest listing at most `maxAgeMs` old. */
export const listFolder = async (folderId, { maxAgeMs = 60_000 } = {}) => (await listChildren([folderId], maxAgeMs)).filter((f) => !isFolder(f));

/** A file's text as the connector renders it ({fileContent, title, viewUrl}); kept 12 h unless `fresh`. */
export function readFile(fileId, { fresh } = {}) {
  return call("read_file_content", { fileId }, { staleTime: 12 * 3600_000, gcTime: 7 * 24 * 3600_000, ...(fresh ? { refresh: true } : {}) });
}

/** The folders a search covers: each source's root and the subfolders its last sync found. */
export function sourceFolders(sources) {
  const ids = new Set();
  for (const s of sources ?? []) {
    if (s.folderId) ids.add(s.folderId);
    try { for (const [id] of JSON.parse(s.Folders || "[]")) ids.add(id); } catch { /* not synced yet */ }
  }
  return [...ids];
}
// Drive queries stay short: folders are searched 25 at a time and the results merged
async function inFolders(folderIds, clause, pageSize, cache) {
  const chunks = [];
  for (let i = 0; i < folderIds.length; i += 25) chunks.push(folderIds.slice(i, i + 25));
  const res = await Promise.all(chunks.map((ids) => call("search_files", { query: `(${ids.map((id) => `parentId = '${q(id)}'`).join(" or ")}) and ${clause}`, pageSize, excludeContentSnippets: true }, cache)));
  const seen = new Set();
  return res.flatMap((p) => p?.files ?? []).filter((f) => !isFolder(f) && !seen.has(f.id) && seen.add(f.id));
}
/** Files of the library whose text contains `term`. */
export const searchText = (folderIds, term) => inFolders(folderIds, `fullText contains '${q(term)}'`, 60, { staleTime: 5 * 60_000, gcTime: 30 * 60_000 });
/** Files of the library whose name contains `text` (a document's other revisions and copies). */
export const filesNamed = (folderIds, text) => inFolders(folderIds, `title contains '${q(text)}'`, 30, { staleTime: 10 * 60_000, gcTime: 60 * 60_000 });

/** The message key for a connector failure, one per distinct fix. */
export function driveProblem(e) {
  const code = e?.code ?? "upstream_error";
  if (code === "needs_reauth") return "drv_e_reauth";
  if (code === "server_not_connected" || code === "server_not_found") return "drv_e_add";
  if (code === "selection_required") return "drv_e_choose";
  if (code === "not_in_manifest" || code === "approval_required" || code === "consent_required") return "drv_e_allow";
  if (code === "blocked_by_policy") return "drv_e_policy";
  if (code === "not_granted" || code === "capability_disabled" || code === "capability_removed") return "drv_e_none";
  if (code === "server_unavailable" || code === "rate_limited") return "drv_e_busy";
  if (code === "tool_error") return "drv_e_tool";
  return "drv_e_other";
}
const FATAL = ["drv_e_reauth", "drv_e_add", "drv_e_allow", "drv_e_none", "drv_e_policy", "drv_e_choose"];

// ---------- sync and reading (state shared by the views of this page load) ----------
export const job = { sync: null, index: null, indexes: null };

/** Product search keys of the workbook's product list ([{ key, product }]). */
export function productKeys(data) {
  const t = data?.prod;
  if (!t) return [];
  const ki = t.cols.indexOf("Search key"), pi = t.cols.indexOf("Product"), ai = t.cols.indexOf("API");
  const out = [];
  for (const r of t.rows) {
    if (r[pi]) { out.push({ key: r[ki] ?? r[pi], product: r[pi] }); if (ai >= 0 && r[ai]) out.push({ key: String(r[ai]).split(/\s+/)[0], product: r[pi] }); }
  }
  return out;
}

/**
 * Crawl every source folder, sort its files into SOPs (matched to the library) and other controlled documents, note
 * obsolete and uncontrolled copies, and save the SOP register, the document register and each source's folder tree.
 */
export async function syncLibrary(ctx, sources, onStep) {
  const trees = [];
  for (const src of sources) {
    onStep?.(src.Name || src.folderId);
    const tree = await listTree(src.folderId, { maxAgeMs: 0, onProgress: (n, d) => onStep?.(`${src.Name || ""} · ${n} / ${d}`) });
    for (const f of tree.files) { f.source = src.Name || "Drive"; f.zone = zoneOf(f.path, f.title); }
    trees.push({ src, ...tree });
  }
  const files = trees.flatMap((x) => x.files);
  const system = files.filter((f) => isSystemFile(f.title));
  const groups = groupDocs(files);
  const sopGroups = groups.filter((g) => g.type === "SOP");
  const library = ctx.m.sops;
  onStep?.("SOP");
  const res = await ctx.bulkUpsert("sop", driveRows(library, sopGroups, trees[0]?.src.Name || "Drive"), ["Code"], null, "sync");
  // the document register is Drive's: rewritten whole, keeping the comments people added
  const comments = new Map((ctx.m.x?.docx?.list ?? []).filter((d) => d.Comment).map((d) => [d.Code, d.Comment]));
  const docs = docRows(groups.filter((g) => g.type !== "SOP"), productKeys(ctx.data)).map((r) => ({ ...r, Comment: comments.get(r.Code) ?? null }));
  onStep?.(`${docs.length}`);
  await ctx.replaceTable("docs", docs, null, "sync");
  const today = new Date().toISOString().slice(0, 10);
  for (const { src, files: fs, folders } of trees) {
    if (src.__key) await ctx.saveObj("sopSources", src.__key, { "Last sync": today, Files: fs.filter((f) => !isSystemFile(f.title)).length, Folders: JSON.stringify(folders.map((x) => [x.id, x.path])) }, true);
  }
  const keys = new Set(sopGroups.map((g) => g.key));
  const count = (xs, k) => xs.reduce((a, x) => ({ ...a, [k(x)]: (a[k(x)] ?? 0) + 1 }), {});
  return {
    at: Date.now(), files: files.length - system.length, folders: trees.reduce((n, x) => n + x.folders.length, 0), system: system.length,
    sops: sopGroups.length, docs: docs.length, added: res.added, updated: res.updated,
    zones: count(files.filter((f) => !isSystemFile(f.title)), (f) => f.zone), types: count(groups, (g) => g.type ?? "?"),
    libraryOnly: library.filter((s) => !keys.has(sopKey(s.Code))).map((s) => s.Code),
    copies: sopGroups.filter((g) => g.zones.controlled > 1).map((g) => ({ code: g.code, files: g.files.filter((f) => f.zone === "controlled").map((f) => `${f.path || "/"} · ${f.title}`) })),
    unnamed: groups.filter((g) => g.type === "SCAN" || !g.type).map((g) => g.current.title),
    indexes: currentIndexes(docs).length, docRows: docs,
  };
}

/** Read the current edition of every master index and save their entries (the register of what QA lists as effective). */
export async function readIndexes(ctx, docs, onProgress) {
  const list = currentIndexes(docs);
  const st = { total: list.length, done: 0, failed: [], read: [], current: null, stopped: false, stop() { this.stopped = true; } };
  job.indexes = st;
  const today = new Date().toISOString().slice(0, 10);
  const rows = [];
  for (const { row } of list) {
    if (st.stopped) break;
    st.current = row["Drive file"]; onProgress?.(st);
    try {
      const p = await readFile(row["Drive ID"]);
      const r = parseIndexText(p?.fileContent ?? "", row["Drive file"]);
      for (const e of r.entries) rows.push({ Index: r.id, Department: r.dept, Scope: r.scope, Year: r.year, Code: e.code, Revision: e.rev, "Effective date": e.effective, "Validity date": e.validity, "Index file": row["Drive ID"], "Read on": today });
      st.read.push({ id: r.id, file: row["Drive file"], n: r.entries.length, partial: r.partial });
    } catch (e) {
      st.failed.push({ code: row["Drive file"], problem: driveProblem(e), message: e?.message ?? "" });
      if (FATAL.includes(driveProblem(e))) { st.stopped = true; st.fatal = driveProblem(e); }
    }
    st.done++; onProgress?.(st);
  }
  if (rows.length && !st.fatal) await ctx.replaceTable("docIndex", rows, null, "index");
  st.current = null; st.finished = true; st.entries = rows.length; onProgress?.(st);
  return st;
}

/** What reading one SOP's text tells the library (`text`: the raw text, for its forms and attachments). */
export function indexFields(s, doc, today, text) {
  const self = sopKey(s.Code);
  const src = s["Drive modified"] || today;
  // a résumé people edited stays (the page flags it when the file changed since); so does one Claude wrote for this very
  // file; otherwise the app's own résumé of the text
  const kept = summaryOf(s);
  const history = doc.history.length ? doc.history.slice(-6).map((x) => ({ ver: x.ver, date: x.date, text: String(x.text ?? "").replace(/\s+/g, " ").slice(0, 160) })) : kept?.history ?? null;
  const summary = kept?.edited || (kept?.by === "claude" && kept.src === src) ? { ...kept, history }
    : { ...sopDigest(doc), history, lang: /French/i.test(s.Language ?? "") ? "FR" : "EN", src, rev: s.Revision ?? doc.header?.rev ?? null, at: today };
  const forms = text != null ? sopForms(text).map(({ key, code, title, kind, citedRev, attachedRev, rev, cited, attached, mentions, sections, fields, columns }) =>
    ({ key, code, title, kind, citedRev, attachedRev, rev, cited, attached, mentions, sections, fields, columns })) : null;
  return {
    Code: s.Code, Purpose: doc.purpose ? doc.purpose.slice(0, 400) : s.Purpose ?? null, Distribution: deptCodes(doc.distribution).join(" ") || null,
    References: doc.refs.filter((c) => sopKey(c) !== self).join(" ") || null, "Change controls": doc.changes.join(" ") || null,
    "Effective date": doc.effective ?? s["Effective date"] ?? null, "Next review": doc.validity ?? s["Next review"] ?? null,
    Title: s.Title || doc.header?.title || null, Revision: s.Revision || doc.header?.rev || null, Indexed: s["Drive modified"] || today,
    Summary: JSON.stringify(summary), ...(forms ? { Forms: JSON.stringify(forms) } : {}),
  };
}

/** Read every SOP whose Drive file changed since it was last read; saves the findings in batches. `stop()` ends it early. */
export async function indexLibrary(ctx, list, onProgress) {
  const todo = list.filter((s) => s["Drive ID"] && (s.Indexed !== (s["Drive modified"] || null) || !s.Summary) && !/obsolete/i.test(s.Status ?? ""));
  const st = { total: todo.length, done: 0, failed: [], current: null, stopped: false, stop() { this.stopped = true; } };
  job.index = st;
  const today = new Date().toISOString().slice(0, 10);
  let batch = [];
  const flush = async () => { if (batch.length) { await ctx.bulkUpsert("sop", batch, ["Code"], null, "read"); batch = []; } };
  for (const s of todo) {
    if (st.stopped) break;
    st.current = s.Code; onProgress?.(st);
    try {
      const p = await readFile(s["Drive ID"]);
      batch.push(indexFields(s, parseSopText(p?.fileContent ?? ""), today, p?.fileContent ?? ""));
    } catch (e) {
      st.failed.push({ code: s.Code, problem: driveProblem(e), message: e?.message ?? "" });
      if (FATAL.includes(driveProblem(e))) { st.stopped = true; st.fatal = driveProblem(e); }
    }
    st.done++;
    if (batch.length >= 40) await flush();
    onProgress?.(st);
  }
  await flush();
  st.current = null; st.finished = true; onProgress?.(st);
  return st;
}
