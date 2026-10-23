// SOP résumés written by Claude (the page's `sample` capability, on the viewer's own Claude account): one SOP's text in,
// a short structured résumé out — purpose, who does what, the key steps, the critical points and the forms it uses —
// saved in the register so everyone reads it without the full SOP. Nothing runs without a click.
import { readFile, summaryOf, driveProblem } from "./sop-drive.js";
import { unfoldText, sopForms } from "./sopkit.js";

let sampleP = null;
/** The `sample` function, or null when this view cannot ask Claude. */
export const sampler = () => (sampleP ??= Promise.resolve(window.claude?.use?.("sample") ?? null).catch(() => null));

const MAX_TEXT = 90_000;
const str = (v, n) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, n) : "");
const arr = (v, n) => (Array.isArray(v) ? v.slice(0, n) : []);

/** The instruction, the SOP's identity and its text (English column of bilingual SOPs; long SOPs cut). */
export function summaryPrompt(s, text, lang) {
  const body = unfoldText(text);
  const cut = body.length > MAX_TEXT ? `${body.slice(0, MAX_TEXT)}\n[… the rest of the SOP is not shown]` : body;
  return [
    "You write the résumé of a GMP standard operating procedure (SOP) for the quality team of a pharmaceutical oncology site. People read it in an app instead of the full SOP, so keep only what someone needs to apply the SOP correctly: no revision history, no distribution list, no general boilerplate, no copied form contents.",
    `Write every text value in ${lang === "FR" ? "French" : "English"}, whatever the language of the SOP. Short and plain; steps are imperative. Keep exact numbers, limits, frequencies, time frames, room and equipment codes and form codes as the SOP writes them. Do not invent anything the SOP does not say.`,
    "Reply with only this JSON object:",
    '{"purpose": "1-2 sentences", "scope": "1 sentence", "trigger": "when the SOP applies or what starts it, 1 sentence, or empty", '
      + '"roles": [{"role": "who", "duties": "what they do, 1 sentence"}], '
      + '"steps": [{"phase": "short name of the stage, or empty", "do": "one action, imperative, at most 25 words", "who": "role, or empty", "records": ["codes of the forms filled at this step"]}], '
      + '"critical": ["a prohibition, limit, time frame, acceptance criterion or safety must, at most 25 words"], '
      + '"forms": [{"code": "form, template or annex code without its revision", "title": "its title", "use": "when it is filled and what it records, at most 15 words"}], '
      + '"training": "who must be trained, 1 sentence, or empty"}',
    "Give 2-6 roles, 5-14 steps in the order of the procedure, at most 8 critical points, and every form, template or annex the SOP uses.",
    `SOP ${s.Code}${s.Revision ? ` rev ${s.Revision}` : ""} — ${s.Title ?? ""}`,
    "--- SOP text ---",
    cut,
  ].join("\n\n");
}

/** Claude's answer reduced to the shape the app shows (types checked, lengths and counts bounded). */
export function cleanSummary(x) {
  const o = x && typeof x === "object" ? x : {};
  return {
    purpose: str(o.purpose, 400) || null, scope: str(o.scope, 300) || null, trigger: str(o.trigger, 300) || null, training: str(o.training, 300) || null,
    roles: arr(o.roles, 8).map((r) => ({ role: str(r?.role, 80), duties: str(r?.duties, 260) })).filter((r) => r.role && r.duties),
    steps: arr(o.steps, 18).map((p) => ({ phase: str(p?.phase, 80) || null, do: str(p?.do, 260), who: str(p?.who, 80) || null, records: arr(p?.records, 6).map((c) => str(c, 40)).filter(Boolean) })).filter((p) => p.do),
    critical: arr(o.critical, 10).map((c) => str(c, 260)).filter(Boolean),
    forms: arr(o.forms, 30).map((f) => ({ code: str(f?.code, 40), title: str(f?.title, 160), use: str(f?.use, 200) })).filter((f) => f.code || f.title),
  };
}

/** The message key for a failure to ask Claude (one per distinct fix), or a Drive problem when the SOP could not be read. */
export function aiProblem(e) {
  const c = e?.code;
  if (c === "not_granted" || c === "not_declared" || c === "capability_disabled" || c === "capability_removed") return "ai_e_allow";
  if (c === "sampling_disabled") return "ai_e_off";
  if (c === "rate_limited") return "ai_e_rate";
  if (c === "session_expired") return "ai_e_session";
  if (c === "prompt_too_large") return "ai_e_large";
  if (c === "invalid_json" || c === "empty_completion" || c === "refused") return "ai_e_answer";
  if (c === "empty_text") return "ai_e_empty";
  if (c === "cancelled") return "ai_e_cancelled";
  if (["needs_reauth", "server_not_connected", "server_not_found", "selection_required", "not_in_manifest", "approval_required", "consent_required", "blocked_by_policy", "tool_error", "server_unavailable"].includes(c)) return driveProblem(e);
  return "ai_e_other";
}
const STOPPERS = ["ai_e_allow", "ai_e_off", "ai_e_rate", "ai_e_session", "drv_e_reauth", "drv_e_add", "drv_e_allow", "drv_e_none", "drv_e_policy", "drv_e_choose"];

/**
 * Read one SOP from Drive and have Claude write its résumé. Returns the fields to save on the SOP: Summary (the résumé,
 * with the app's revision history kept), and Forms when the SOP had none yet.
 */
export async function summarizeSop(s, { lang = "EN", signal, onText } = {}) {
  const sample = await sampler();
  if (!sample) throw { code: "not_granted" };
  const p = await readFile(s["Drive ID"]);
  const text = p?.fileContent ?? "";
  if (!text.trim()) throw { code: "empty_text" };
  const out = await sample.json(summaryPrompt(s, text, lang), { signal, onText, cache: { gcTime: 24 * 3600_000 } });
  const before = summaryOf(s);
  const today = new Date().toISOString().slice(0, 10);
  const summary = { ...cleanSummary(out), history: before?.history ?? null, by: "claude", lang, src: s["Drive modified"] || null, rev: s.Revision ?? null, at: today };
  const patch = { Summary: JSON.stringify(summary) };
  if (!s.Forms) patch.Forms = JSON.stringify(sopForms(text));
  return patch;
}

// ---------- every SOP, one after the other (a viewer starts it; Stop ends it; a refusal or a usage limit stops it) ----------
export const aiJob = { run: null };
export async function summarizeAll(ctx, list, lang, onProgress) {
  const st = { total: list.length, done: 0, failed: [], current: null, stopped: false, ctl: null, stop() { this.stopped = true; this.ctl?.abort(); } };
  aiJob.run = st;
  for (const s of list) {
    if (st.stopped) break;
    st.current = s.Code; st.ctl = new AbortController(); onProgress?.(st);
    try {
      const patch = await summarizeSop(s, { lang, signal: st.ctl.signal });
      if (s.__key) await ctx.saveObj("sop", s.__key, patch, true);
    } catch (e) {
      const key = aiProblem(e);
      if (key !== "ai_e_cancelled") st.failed.push({ code: s.Code, problem: key });
      if (STOPPERS.includes(key)) { st.stopped = true; st.fatal = key; }
    }
    st.done++; onProgress?.(st);
  }
  st.current = null; st.finished = true; onProgress?.(st);
  return st;
}
