// Claude integration: the system prompt (built from the site SOP rules), the
// JSON schemas the two drafting steps must follow, request building and the two
// transports (the local server proxy, or the browser with the user's own key).
// Request building and response parsing are pure so they run under `node --test`.

import {
  SITE, SEVERITY, OCCURRENCE, DETECTABILITY, CLASSES, SCOPES, SCOPE_IDS, ROOT_CAUSES, SIX_M,
  IMPACT_QUESTIONS, MANDATORY_COLUMNS,
} from "./sop.js";
import { DATA_ITEMS, REFERENCES, METHODS, INSPECTION_FINDINGS, EXHIBIT } from "./knowledge.js";

export const MODELS = [
  ["claude-opus-5-5", "Claude Opus 5.5 (recommended)"],
  ["claude-sonnet-5-5", "Claude Sonnet 5.5 (faster)"],
  ["claude-fable-5-1", "Claude Fable 5.1 (most capable)"],
];
export const DEFAULT_MODEL = "claude-opus-5-5";
export const EFFORTS = ["medium", "high", "xhigh", "max"];
export const SDK_URL = "https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@1.3.0/+esm";

// ---------- schemas ----------

const str = { type: "string" };
const bool = { type: "boolean" };
const int = { type: "integer" };
const obj = (properties) => ({
  type: "object", properties, required: Object.keys(properties), additionalProperties: false,
});
const arr = (items) => ({ type: "array", items });
const oneOf = (values) => ({ type: "string", enum: values });

export const ANALYSIS_SCHEMA = obj({
  classification: obj({ type: oneOf(["Incident", "Deviation"]), exhibit_category: str, rationale: str }),
  qe_form: obj({
    title: str, where: str, what: str, who: str, why: str,
    event_scopes: arr(oneOf(SCOPE_IDS)), departments: arr(str), detected_by: str,
    failure_description: str, immediate_actions: str, related_records: str, deviation_values: str,
    products_affected: str, batches: str, equipment: str, area: str,
  }),
  missing_information: arr(str),
  initial_risk: obj({
    severity: int, severity_justification: str, occurrence: int, occurrence_justification: str,
    detectability: int, detectability_justification: str, rpn_comment: str,
  }),
  historical_review: obj({ recurring: bool, search_to_perform: str, details: str }),
  qa_review: obj({ decision: oneOf(["Approve", "More Information", "Cancel"]), comments: str }),
  containment: arr(str),
  investigation_planning: obj({
    investigation_required: bool, justification: str, lab_investigation_required: bool,
    investigations: arr(obj({ title: str, department: str, objective: str })),
    standalone_actions: arr(obj({ title: str, owner_department: str, description: str })),
    extension_expected: bool,
  }),
  hypotheses: arr(obj({
    cause: str, factor: oneOf(SIX_M), likelihood: oneOf(["High", "Medium", "Low"]),
    rationale: str, confirm_by: str, refute_by: str,
  })),
  data_requirements: arr(obj({
    factor: oneOf(SIX_M), item: str, source: str, purpose: str, priority: oneOf(["Critical", "High", "Medium"]),
  })),
  interviews: arr(obj({ who: str, questions: arr(str) })),
  regulatory_focus: arr(obj({ reference_id: oneOf(REFERENCES.map((r) => r.id)), why: str })),
});

const action = obj({ action: str, owner: str, due_working_days: int });
export const INVESTIGATION_SCHEMA = obj({
  investigation_form: obj({
    description: str, investigation: str, immediate_action: str, numerical_results: str,
    root_cause_category: oneOf(ROOT_CAUSES), action_taken: str, investigation_results: str,
    conclusion: str, supporting_data: str,
  }),
  six_m: arr(obj({ factor: oneOf(SIX_M), contributing: bool, assessment: str })),
  six_m_conclusion: str,
  five_whys: arr(str),
  root_cause_statement: str,
  root_cause_confidence: oneOf(["Confirmed", "Most probable", "Not determined"]),
  human_error_justification: str,
  impact_assessment: obj({ product: str, patient: str, other_batches: str, validation_status: str, stability_regulatory: str }),
  possible_extension: str,
  after_investigation_comments: str,
  capa: obj({
    required: bool, wait_for_capa: bool, justification: str,
    corrective_actions: arr(action), preventive_actions: arr(action), effectiveness_check: str,
  }),
  change_control: obj({ required: bool, description: str }),
  impact_questions: arr(obj({ answer: oneOf(["Yes", "No", "N/A"]), comment: str })),
  impact_comment: str,
  final_risk: obj({ severity: int, occurrence: int, detectability: int, justification: str }),
  overall_conclusion: str,
  batch_disposition: str,
  qa_manager: obj({ decision: oneOf(["Approved", "Not Approved"]), second_approval: oneOf(["None", "QP Approval"]), comments: str }),
  open_points: arr(str),
  inspection_readiness: arr(obj({ risk: str, mitigation: str })),
});

// ---------- system prompt ----------

const scale = (t) => Object.entries(t).map(([k, [n, d]]) => `  ${k} = ${n}: ${d}`).join("\n");

/** The system prompt. Built only from constants so it is byte-stable and caches well. */
export function systemPrompt() {
  const scopes = SCOPES.map((s) => {
    const req = MANDATORY_COLUMNS.filter((_, i) => s.mandatory[i]).map(([, l]) => l).join(", ") || "none";
    return `  - ${s.id}: ${s.name} (mandatory selections: ${req})`;
  }).join("\n");
  const library = DATA_ITEMS.map((d) => `  - [${d.m}] ${d.item} (source: ${d.source})`).join("\n");
  const refs = REFERENCES.map((r) => `  - ${r.id}: ${r.doc}, ${r.clause}. ${r.text}`).join("\n");
  const findings = INSPECTION_FINDINGS.map((f) => `  - ${f.finding} Expectation: ${f.fix}`).join("\n");
  const methods = METHODS.map((m) => `  - ${m.name}: ${m.use}`).join("\n");
  const exhibit = EXHIBIT.map((e) => `  - ${e.category}. Incident: ${e.incident} Deviation: ${e.deviation}`).join("\n");

  return `You are the quality-events investigation expert for ${SITE.name}. You draft the records of the ${SITE.system} for QA, the way a senior GMP investigator would, and you coach the user to an inspection-ready investigation.

# The site procedure (SOPQA0015E/Onc ver. 04 and SOPQA0146E/Onc ver. 02)
- A quality event is logged in Scigeniq within 1 working day of detection (numbering QE-KO-n; investigations INVIS-KO-n; standalone actions ACTION-KO-n; due date changes EC-KO-n). The quality event form is completed within 1 working day.
- Case description answers four questions: Where (area, room, equipment), What (nature of the event and key facts), Who (people, departments, product/batch involved or affected), Why (preliminary cause, if known; otherwise state that it is to be determined by the investigation).
- Affected batches are immediately quarantined, tagged and withheld until the deviation is resolved, unless the SQU head directs otherwise (Note 04). Verbal instructions for immediate action are documented (Note 05).
- QA performs the initial risk assessment with the RPN matrix (QA0015E/Onc/AE07/02), reviews historical trends for recurrence, may request standalone actions, and decides Approve / More Information / Cancel.
- Severity (S):
${scale(SEVERITY)}
- Occurrence (O), likelihood of recurrence:
${scale(OCCURRENCE)}
- Detectability (D), effectiveness of existing controls:
${scale(DETECTABILITY)}
- RPN = S × O × D. Classes: ${CLASSES.map((c) => `${c.name} (${c.code}) ${c.min}–${c.code === "CR" ? "125" : c.max}`).join("; ")}. Major and critical deviations require a formal investigation (Note 07). A critical deviation is notified to the Quality Unit Head within 24 h of approval.
- Incident vs deviation examples (QA0015E/Onc/AE08/02):
${exhibit}
- Event scopes (use these ids):
${scopes}
- The investigation uses the 6M method (Environment, Man, Material, Measurement, Method, Machine/Instrument) or SOPQA0143/Onc Failure Investigation, is approved by the responsible department then QA, within 30 working days of the event form; up to two extensions of 30 working days, justified with a status update and approved before the due date; beyond that, escalation to the Quality Unit Head.
- OOS/OOT results first go through the phased laboratory investigation (SOPQC0018/Onc, SOPQC0034E/Onc micro, SOPQC0131E/Onc OOT): Phase 1a checklist, Phase 1b hypothesis tests, Phase 2 QA manufacturing assessment and extended laboratory investigation, then the deviation.
- After investigation, QA decides whether CAPA is required (SOPQA0026/Onc), selects the root cause category from: ${ROOT_CAUSES.join(", ")}. If "Not determined", a risk assessment per SOPQA0140/Onc is mandatory (Note 08). QA answers the impact assessment questions and performs the final RPN. The QA Manager approves closure and decides whether a second (QP) approval is needed; "Not Approved" returns the record to Investigation Planning.
- Impact assessment questions (answer Yes / No / N/A, in this order):
${IMPACT_QUESTIONS.map((q, i) => `  ${i + 1}. ${q}`).join("\n")}

# Baseline investigation data library (tailor it; add event-specific items)
${library}

# Root cause methods
${methods}

# Regulatory references you may cite (use the id)
${refs}

# Recurring inspection findings to pre-empt
${findings}

# How to write
- Write in the language requested in the user message. Use the site's terminology (BMR/OF, BPR, DT, logbook, IPC, CoA, CLL, line clearance) and equipment/room codes as given.
- Never invent facts, results, values, dates, names or record numbers. When information is needed but not provided, write a placeholder in square brackets that says exactly what to insert, e.g. "[TO COMPLETE: hardness results of the 10 IPC checks]" (French: "[À COMPLÉTER: …]"), and list it in missing_information or open_points.
- Separate facts from hypotheses. A hypothesis is phrased as such until evidence confirms it.
- Each 6M factor gets an assessment that cites the evidence (record, value, limit, date) whether the factor is contributing or ruled out. Do not dismiss a factor with a bare statement.
- Human error is never accepted at face value: identify the error type and the conditions (instruction clarity, task design, workload, distractions, second check). Prefer the system cause (procedure, design) when the evidence supports it. Human error as a root cause needs a formal justification.
- Keep the impact questions consistent with the 6M conclusion (a factor marked contributing is answered "Yes" in its question, and vice versa).
- Scores must follow the scale definitions above; justify each score in one or two sentences, as on the site's event approval forms.
- Always consider other batches and products possibly affected, the validation or registration status of the batch, stability and patient impact.
- CAPA: corrective actions address the root cause of this event; preventive actions prevent recurrence elsewhere; each has an owner department and a realistic due date in working days; define an effectiveness check with a measurable criterion.
- Field text is pasted into Scigeniq: plain text, short paragraphs or "- " bullet lines, no Markdown headings or bold.`;
}

// ---------- user messages ----------

const LANG = { en: "English", fr: "French (as written on site records)" };

export function analysisMessage(input, today) {
  return `Task: draft the Open, In Review and Investigation Planning stages of a quality event and the investigation data plan.
Output language: ${LANG[input.language] ?? LANG.en}. Today's date: ${today}.

Return:
- qe_form: the Quality Event Form fields, rewritten clearly from the event details (event_scopes from the allowed ids; title concise, product and batch included).
- classification: incident or deviation, the Exhibit category that matches, and why.
- initial_risk: S, O, D (integers 1–5) with justifications in the style of the site's event approval form, and a comment on the RPN.
- historical_review: whether the details already show a recurrence, what to search in Scigeniq, and the details text.
- qa_review: the QA decision you recommend now and the comment text (if More Information, list exactly what is missing).
- containment: immediate and containment actions to record or still to take (batch status, other batches, segregation, notifications).
- investigation_planning: whether an investigation is required with the justification text; the investigation tasks to create (one per department that must investigate, e.g. Production, QA, Validation, QC, Engineering) and the standalone actions (e.g. R&D recommendation, sampling, analysis, stability study, retraining, reworking/reprocessing template, change control initiation), as seen on site records; whether a lab investigation is needed; whether an extension is likely.
- hypotheses: every credible candidate cause, ranked, each with the evidence that would confirm it and the evidence that would refute it.
- data_requirements: the complete list of data and records the investigator must collect for this specific event, beyond the generic library: name the specific records, rooms, equipment IDs, parameters, time windows, batches and comparisons. Mark priority.
- interviews: who to interview and the questions to ask.
- regulatory_focus: the references most relevant to this event and why.

Event details (JSON, entered by the user):
${JSON.stringify(input, null, 2)}`;
}

export function investigationMessage(record, today) {
  const findings = Object.values(record.dataItems ?? {})
    .filter((d) => d.status && d.status !== "pending")
    .map((d) => ({ factor: d.factor, item: d.item, status: d.status, finding: d.note || "" }));
  return `Task: draft the investigation report (Investigation Form with the 6M analysis), the After Investigation Details (RCA and CAPA Planning) and the QA Manager approval comment.
Output language: ${LANG[record.input?.language] ?? LANG.en}. Today's date: ${today}.

Use the collected findings as the evidence. "anomaly" means the check found a problem; "ok" means it was checked and found compliant; "na" means not applicable. Where evidence is missing for a conclusion, keep the conclusion as a hypothesis and put a placeholder plus an open point.

Return:
- investigation_form: Description, Investigation (scope and approach), Immediate action, Numerical results, Root cause category, Action taken, Investigation results, Conclusion, Supporting data (list the records to attach).
- six_m: all six factors in the order ${SIX_M.join(", ")}, each with contributing true/false and an evidence-based assessment.
- six_m_conclusion, five_whys (from the problem to the root cause), root_cause_statement and confidence.
- human_error_justification: if human error is involved, the formal justification (error type, conditions, why system causes are excluded or what system weakness allowed it); otherwise "N/A".
- impact_assessment, possible_extension, after_investigation_comments.
- capa: required or not, whether to wait for CAPA before closing, justification, actions with owners and working-day due dates, effectiveness check.
- change_control: whether a change control is needed (e.g. BMR, SOP, process or equipment change) and what it covers.
- impact_questions: exactly ${IMPACT_QUESTIONS.length} answers in the order of the site questions, consistent with six_m. impact_comment.
- final_risk: S, O, D after the investigation and actions, with justification.
- overall_conclusion and batch_disposition recommendation (release / reject / rework / reprocess / pending, with conditions).
- qa_manager: recommended decision, whether a second (QP) approval is needed, and the comment text.
- open_points: what must still be collected or done before submission.
- inspection_readiness: the weaknesses an inspector would challenge in this file and how to close each one.

Record (JSON):
${JSON.stringify({ input: record.input, analysis: record.analysis, findings, notes: record.investigatorNotes ?? "" }, null, 2)}`;
}

// ---------- requests ----------

/** Messages API parameters for one drafting step. */
export function buildRequest(kind, record, settings = {}, today = new Date().toISOString().slice(0, 10)) {
  const schema = kind === "analysis" ? ANALYSIS_SCHEMA : INVESTIGATION_SCHEMA;
  const content = kind === "analysis" ? analysisMessage(record.input, today) : investigationMessage(record, today);
  const model = MODELS.some(([id]) => id === settings.model) ? settings.model : DEFAULT_MODEL;
  return {
    model,
    max_tokens: 64000,
    // Server-side refusal fallback: if a safety classifier declines, the API retries
    // on a fallback model chosen by refusal category, within the same call.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    thinking: { type: "adaptive" },
    output_config: {
      effort: EFFORTS.includes(settings.effort) ? settings.effort : "high",
      format: { type: "json_schema", schema },
    },
    system: [{ type: "text", text: systemPrompt(), cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content }],
  };
}

export class ClaudeError extends Error {}

/** Extracts the JSON result from a Messages API response, or throws a readable error. */
export function parseResponse(message) {
  if (!message || !Array.isArray(message.content)) throw new ClaudeError("Empty response from Claude.");
  if (message.stop_reason === "refusal") {
    const why = message.stop_details?.explanation ? ` (${message.stop_details.explanation})` : "";
    throw new ClaudeError(`Claude declined this request${why}. Rephrase the event details and try again.`);
  }
  if (message.stop_reason === "max_tokens") throw new ClaudeError("The response was cut off before it was complete. Try again, or lower the effort.");
  const text = message.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  try {
    return JSON.parse(text);
  } catch {
    throw new ClaudeError("Claude's response was not valid JSON. Try again.");
  }
}

// ---------- transports ----------

/** Whether the local server has an API key configured. */
export async function serverStatus() {
  try {
    const res = await fetch("/api/claude", { method: "GET" });
    if (!res.ok) return { available: false };
    return await res.json();
  } catch {
    return { available: false };
  }
}

async function viaServer(params, signal) {
  const res = await fetch("/api/claude", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(params), signal,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ClaudeError(body.error || `Server error ${res.status}`);
  return body;
}

let sdkPromise = null;
async function viaBrowser(params, apiKey, signal) {
  if (!apiKey) throw new ClaudeError("Add your Anthropic API key in Settings, or run the app with the local server.");
  sdkPromise ??= import(/* @vite-ignore */ SDK_URL).catch((err) => {
    sdkPromise = null;
    throw new ClaudeError(`Could not load the Anthropic SDK (${err.message}). Check the internet connection.`);
  });
  const { default: Anthropic } = await sdkPromise;
  // The key is the user's own, kept in this browser only. Running the local server
  // keeps it off the device instead.
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  try {
    return await client.beta.messages.stream(params, { signal }).finalMessage();
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) throw new ClaudeError("The API key was rejected. Check it in Settings.");
    if (err instanceof Anthropic.RateLimitError) throw new ClaudeError("Rate limited by the API. Wait a minute and try again.");
    if (err instanceof Anthropic.APIError) throw new ClaudeError(`Claude API error ${err.status ?? ""}: ${err.message}`);
    throw err;
  }
}

const SAMPLE_ERRORS = {
  not_granted: "Claude was not allowed for this page. Allow it from the page's permissions to draft with Claude.",
  sampling_disabled: "Claude is not available for this account.",
  rate_limited: "Too many Claude requests, or your usage limit is reached. Try again later.",
  session_expired: "Your session expired. Sign in to claude.ai again.",
  refused: "Claude declined this request. Rephrase the event details and try again.",
  invalid_json: "Claude's answer could not be read as a complete form. Try again.",
  prompt_too_large: "The record is too long to send. Shorten the notes and findings.",
};

/** Prompt for the in-claude.ai mode, where the page has no system prompt or schema option. */
export function accountPrompt(params) {
  return `${params.system[0].text}

---

${params.messages[0].content}

Reply with only one JSON object, no other text. It must match this JSON Schema exactly: every property present, no extra properties, enums spelled as given.
${JSON.stringify(params.output_config.format.schema)}`;
}

// Inside a published claude.ai artifact: the `sample` capability runs the call on
// the viewer's own Claude account, so no API key is involved.
async function viaAccount(sample, params, settings, signal) {
  const effort = { medium: "medium", high: "high", xhigh: "high", max: "high" }[settings.effort] ?? "high";
  try {
    return await sample.json(accountPrompt(params), { modelTier: "complex", effort, signal, cache: false });
  } catch (err) {
    if (err?.code === "cancelled") throw Object.assign(new Error("Cancelled"), { name: "AbortError" });
    throw new ClaudeError(SAMPLE_ERRORS[err?.code] ?? "Claude could not finish the draft. Try again in a moment.");
  }
}

/** Runs one drafting step and returns the parsed JSON result plus the model used. */
export async function draft(kind, record, settings, { signal, sample } = {}) {
  const params = buildRequest(kind, record, settings);
  if (settings.mode === "account") {
    if (!sample) throw new ClaudeError("Claude is not available on this page.");
    const result = await viaAccount(sample, params, settings, signal);
    // Here nothing enforces the schema, so check the sections the app reads.
    const schema = params.output_config.format.schema;
    const complete = result && typeof result === "object" && !Array.isArray(result)
      && schema.required.every((k) => k in result && (schema.properties[k].type !== "object" || (result[k] && typeof result[k] === "object")));
    if (!complete) throw new ClaudeError(SAMPLE_ERRORS.invalid_json);
    return { result, model: "Your Claude account", usage: null };
  }
  const message = settings.mode === "browser"
    ? await viaBrowser(params, settings.apiKey, signal)
    : await viaServer(params, signal);
  return { result: parseResponse(message), model: message.model ?? params.model, usage: message.usage ?? null };
}
