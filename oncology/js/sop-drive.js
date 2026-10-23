// Google Drive, as the viewer's own claude.ai connector (the page's `mcp` capability): list the SOP folders, read an
// SOP's text and search inside the SOPs. Nothing here needs a token; a view without the connector gets clear states.
import { groupSopFiles, driveRows, parseSopText, deptCodes, sopKey } from "./sopkit.js";

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

/** Every file directly in a folder (all pages), newest listing at most `maxAgeMs` old. */
export async function listFolder(folderId, { maxAgeMs = 60_000 } = {}) {
  const files = [];
  let token = null, guard = 0;
  do {
    const p = await call("search_files", { query: `parentId = '${q(folderId)}'`, pageSize: 100, excludeContentSnippets: true, ...(token ? { pageToken: token } : {}) },
      { staleTime: maxAgeMs, gcTime: Math.max(maxAgeMs, 300_000) });
    files.push(...(p?.files ?? []));
    token = p?.nextPageToken || null;
  } while (token && ++guard < 40);
  return files;
}

/** An SOP file's text as the connector renders it ({fileContent, title, viewUrl}); kept 12 h unless `fresh`. */
export function readFile(fileId, { fresh } = {}) {
  return call("read_file_content", { fileId }, { staleTime: 12 * 3600_000, gcTime: 7 * 24 * 3600_000, ...(fresh ? { refresh: true } : {}) });
}

/** Files of the source folders whose text contains `term`. */
export async function searchText(folderIds, term) {
  const parents = folderIds.map((id) => `parentId = '${q(id)}'`).join(" or ");
  const p = await call("search_files", { query: `(${parents}) and fullText contains '${q(term)}'`, pageSize: 60, excludeContentSnippets: true }, { staleTime: 5 * 60_000, gcTime: 30 * 60_000 });
  return p?.files ?? [];
}

/** Files of the source folders whose name contains `text` (an SOP's other revisions and copies). */
export async function filesNamed(folderIds, text) {
  const parents = folderIds.map((id) => `parentId = '${q(id)}'`).join(" or ");
  const p = await call("search_files", { query: `(${parents}) and title contains '${q(text)}'`, pageSize: 30, excludeContentSnippets: true }, { staleTime: 10 * 60_000, gcTime: 60 * 60_000 });
  return p?.files ?? [];
}

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

// ---------- sync and indexing (state shared by the views of this page load) ----------
export const job = { sync: null, index: null };

/** List every source folder, match its SOP files to the library and save the register. */
export async function syncLibrary(ctx, sources, onStep) {
  const all = [];
  for (const src of sources) {
    onStep?.(src.Name || src.folderId);
    const files = await listFolder(src.folderId, { maxAgeMs: 0 });
    all.push({ src, files, groups: groupSopFiles(files) });
  }
  const library = ctx.m.sops;
  const rows = all.flatMap(({ src, groups }) => driveRows(library, groups.sops, src.Name || "Drive"));
  // one row per SOP even when two folders hold it: the higher revision wins
  const best = new Map();
  for (const r of rows) { const k = sopKey(r.Code); const o = best.get(k); if (!o || +(r.Revision ?? 0) > +(o.Revision ?? 0)) best.set(k, r); }
  const res = await ctx.bulkUpsert("sop", [...best.values()], ["Code"]);
  const today = new Date().toISOString().slice(0, 10);
  for (const { src, files } of all) if (src.__key) await ctx.saveObj("sopSources", src.__key, { "Last sync": today, Files: files.length }, true);
  const keys = new Set(best.keys());
  return {
    at: Date.now(), files: all.reduce((n, x) => n + x.files.length, 0), sops: best.size, added: res.added, updated: res.updated,
    libraryOnly: library.filter((s) => !keys.has(sopKey(s.Code))).map((s) => s.Code),
    copies: all.flatMap((x) => x.groups.sops.filter((g) => g.files.length > 1).map((g) => ({ code: g.code, files: g.files.map((f) => f.title) }))),
    unnamed: all.flatMap((x) => x.groups.other.map((f) => f.title)),
  };
}

/** What reading one SOP's text tells the library. */
export function indexFields(s, doc, today) {
  const self = sopKey(s.Code);
  return {
    Code: s.Code, Purpose: doc.purpose ? doc.purpose.slice(0, 400) : s.Purpose ?? null, Distribution: deptCodes(doc.distribution).join(" ") || null,
    References: doc.refs.filter((c) => sopKey(c) !== self).join(" ") || null, "Change controls": doc.changes.join(" ") || null,
    "Effective date": doc.effective ?? s["Effective date"] ?? null, "Next review": doc.validity ?? s["Next review"] ?? null,
    Title: s.Title || doc.header?.title || null, Revision: s.Revision || doc.header?.rev || null, Indexed: s["Drive modified"] || today,
  };
}

/** Read every SOP whose Drive file changed since it was last read; saves the findings in batches. `stop()` ends it early. */
export async function indexLibrary(ctx, list, onProgress) {
  const todo = list.filter((s) => s["Drive ID"] && s.Indexed !== (s["Drive modified"] || null));
  const st = { total: todo.length, done: 0, failed: [], current: null, stopped: false, stop() { this.stopped = true; } };
  job.index = st;
  const today = new Date().toISOString().slice(0, 10);
  let batch = [];
  const flush = async () => { if (batch.length) { await ctx.bulkUpsert("sop", batch, ["Code"]); batch = []; } };
  for (const s of todo) {
    if (st.stopped) break;
    st.current = s.Code; onProgress?.(st);
    try {
      const p = await readFile(s["Drive ID"]);
      batch.push(indexFields(s, parseSopText(p?.fileContent ?? ""), today));
    } catch (e) {
      st.failed.push({ code: s.Code, problem: driveProblem(e), message: e?.message ?? "" });
      if (["drv_e_reauth", "drv_e_add", "drv_e_allow", "drv_e_none", "drv_e_policy", "drv_e_choose"].includes(driveProblem(e))) { st.stopped = true; st.fatal = driveProblem(e); }
    }
    st.done++;
    if (batch.length >= 40) await flush();
    onProgress?.(st);
  }
  await flush();
  st.current = null; st.finished = true; onProgress?.(st);
  return st;
}
