// Quality event records: creation, applying drafts, investigation data
// checklist, and the stage-by-stage report (the same sections feed the screen,
// the text export and the printout). Pure functions.

import {
  SIX_M, IMPACT_QUESTIONS, ROOT_CAUSES, SEVERITY, OCCURRENCE, DETECTABILITY,
  rpn, classify, deadlines, scopeName, mandatoryFields,
} from "./sop.js";
import { dataRequirements, REFERENCES } from "./knowledge.js";

export const STATUSES = ["pending", "ok", "anomaly", "na"];
export const STATUS_LABEL = { pending: "To collect", ok: "Checked: compliant", anomaly: "Anomaly found", na: "Not applicable" };

let counter = 0;
const uid = () => `r${Date.now().toString(36)}${(counter++).toString(36)}`;
const clampRank = (v) => (Number.isFinite(Number(v)) ? Math.min(5, Math.max(1, Math.round(Number(v)))) : null);

export function newRecord(input, now = new Date()) {
  const stamp = now.toISOString();
  return {
    uid: uid(), number: input.number?.trim() || "", input: { ...input }, createdAt: stamp, updatedAt: stamp,
    analysis: null, analysisMeta: null, dataItems: {}, investigatorNotes: "",
    investigation: null, investigationMeta: null, extensions: 0, closed: false,
  };
}

/** Builds the data checklist: library items for the scopes plus the event-specific ones, keeping entered findings. */
export function buildDataItems(scopes, aiItems = [], existing = {}) {
  const items = {};
  for (const [factor, list] of Object.entries(dataRequirements(scopes))) {
    for (const d of list) items[d.key] = { factor, item: d.item, source: d.source, why: d.why, origin: "library", priority: "High" };
  }
  aiItems.forEach((d, i) => {
    if (!SIX_M.includes(d.factor) || !d.item) return;
    items[`ai-${i}`] = { factor: d.factor, item: d.item, source: d.source ?? "", why: d.purpose ?? "", origin: "event", priority: d.priority ?? "High" };
  });
  for (const [key, d] of Object.entries(items)) {
    // Keep findings already recorded against the same item text.
    const prev = existing[key]?.item === d.item ? existing[key] : Object.values(existing).find((e) => e.item === d.item);
    d.status = prev?.status ?? "pending";
    d.note = prev?.note ?? "";
  }
  // Findings on items no longer generated are kept, so nothing typed is lost.
  for (const [key, e] of Object.entries(existing)) {
    if ((e.status !== "pending" || e.note) && !Object.values(items).some((d) => d.item === e.item)) items[key] = e;
  }
  return items;
}

export function applyAnalysis(record, result, meta = {}) {
  const analysis = structuredClone(result);
  for (const k of ["severity", "occurrence", "detectability"]) analysis.initial_risk[k] = clampRank(analysis.initial_risk[k]);
  const scopes = analysis.qe_form?.event_scopes?.length ? analysis.qe_form.event_scopes : record.input.scopes ?? [];
  return {
    ...record,
    analysis,
    analysisMeta: { ...meta, at: meta.at ?? new Date().toISOString() },
    dataItems: buildDataItems(scopes, analysis.data_requirements ?? [], record.dataItems),
    updatedAt: new Date().toISOString(),
  };
}

export function applyInvestigation(record, result, meta = {}) {
  const inv = structuredClone(result);
  const byFactor = new Map((inv.six_m ?? []).map((m) => [m.factor, m]));
  inv.six_m = SIX_M.map((factor) => byFactor.get(factor) ?? { factor, contributing: false, assessment: "" });
  inv.impact_questions = IMPACT_QUESTIONS.map((_, i) => inv.impact_questions?.[i] ?? { answer: "N/A", comment: "" });
  if (!ROOT_CAUSES.includes(inv.investigation_form?.root_cause_category)) inv.investigation_form.root_cause_category = "Not determined";
  for (const k of ["severity", "occurrence", "detectability"]) inv.final_risk[k] = clampRank(inv.final_risk[k]);
  return { ...record, investigation: inv, investigationMeta: { ...meta, at: meta.at ?? new Date().toISOString() }, updatedAt: new Date().toISOString() };
}

/** Derived figures shown across the app. */
export function summary(record) {
  const r = record.analysis?.initial_risk;
  const initial = r ? rpn(r.severity, r.occurrence, r.detectability) : null;
  const f = record.investigation?.final_risk;
  const final = f ? rpn(f.severity, f.occurrence, f.detectability) : null;
  const cls = classify(initial);
  const items = Object.values(record.dataItems ?? {});
  const collected = items.filter((d) => d.status !== "pending").length;
  const stage = record.closed ? "Closed"
    : record.investigation ? "RCA and CAPA Planning"
      : record.analysis ? (collected ? "Wait Investigation Implementation" : "Investigation Planning")
        : "Open";
  return {
    title: record.analysis?.qe_form?.title || record.input?.title || "Untitled event",
    initialRpn: initial, initialClass: cls, finalRpn: final, finalClass: classify(final),
    stage, collected, total: items.length, anomalies: items.filter((d) => d.status === "anomaly").length,
    deadlines: deadlines({ detectionDate: record.input?.detectionDate, reportedDate: record.input?.reportedDate, eventClass: cls?.code }),
  };
}

// ---------- report ----------

const list = (v) => (Array.isArray(v) ? v.filter(Boolean).map((x) => `- ${x}`).join("\n") : v ?? "");
const yesNo = (b) => (b ? "Yes" : "No");
const rank = (table, v) => (table[v] ? `${v} – ${table[v][0]}` : "");

/**
 * The record as Scigeniq stages and forms: `[{ id, stage, form, fields: [[label, value]] }]`.
 * Empty stages are left out.
 */
export function reportSections(record) {
  const a = record.analysis, inv = record.investigation, input = record.input ?? {};
  const s = summary(record);
  const out = [];
  if (!a) return out;
  const f = a.qe_form;
  out.push({
    id: "open", stage: "Open", form: "Quality Event Form",
    fields: [
      ["Title", f.title],
      ["Date of occurrence", input.occurrenceDate],
      ["Where?", f.where], ["What?", f.what], ["Who?", f.who], ["Why?", f.why],
      ["Event scope", (f.event_scopes ?? []).map(scopeName).join(", ")],
      ["Department", (f.departments ?? []).join(", ")],
      ["Detected by", f.detected_by], ["Detection date", input.detectionDate],
      ["Description of failure", f.failure_description],
      ["Immediate actions", f.immediate_actions],
      ["Related record(s)", f.related_records],
      ["Deviation values: parameter (unit) / result", f.deviation_values],
      ["Product(s) affected", f.products_affected], ["Batch number(s)", f.batches],
      ["Equipment affected", f.equipment], ["Area", f.area],
      ["Mandatory selections for the scope (AE05)", mandatoryFields(f.event_scopes ?? []).map(([, l]) => l).join(", ") || "None"],
    ],
  });
  const r = a.initial_risk;
  out.push({
    id: "review", stage: "In Review", form: "Event Approval Form",
    fields: [
      ["Classification", `${a.classification.type}${a.classification.exhibit_category ? ` (Exhibit: ${a.classification.exhibit_category})` : ""}. ${a.classification.rationale}`],
      ["Severity", `${rank(SEVERITY, r.severity)}\n${r.severity_justification}`],
      ["Occurrence", `${rank(OCCURRENCE, r.occurrence)}\n${r.occurrence_justification}`],
      ["Detectability", `${rank(DETECTABILITY, r.detectability)}\n${r.detectability_justification}`],
      ["RPN (score)", s.initialRpn ? `${s.initialRpn} – ${s.initialClass.name}. ${r.rpn_comment}` : ""],
      ["Recurring event?", yesNo(a.historical_review.recurring)],
      ["Historical review details", `${a.historical_review.details}\nSearch: ${a.historical_review.search_to_perform}`],
      ["Decision", a.qa_review.decision], ["Comments", a.qa_review.comments],
      ["Containment / actions to record", list(a.containment)],
    ],
  });
  const p = a.investigation_planning;
  out.push({
    id: "planning", stage: "Investigation Planning", form: "Investigation Details",
    fields: [
      ["Investigation required?", yesNo(p.investigation_required)],
      ["Justification", p.justification],
      ["Investigation tasks (INVIS-KO)", list(p.investigations.map((i) => `${i.title} – ${i.department}: ${i.objective}`))],
      ["Standalone actions (ACTION-KO)", list(p.standalone_actions.map((x) => `${x.title} – ${x.owner_department}: ${x.description}`))],
      ["Laboratory OOS investigation required?", yesNo(p.lab_investigation_required)],
      ["Investigation due (30 working days)", s.deadlines.investigationDue ?? ""],
      ["Extension likely?", yesNo(p.extension_expected)],
    ],
  });
  if (inv) {
    const form = inv.investigation_form;
    out.push({
      id: "investigation", stage: "Wait Investigation Implementation", form: "Investigation Form (INVIS-KO)",
      fields: [
        ["Description", form.description], ["Investigation", form.investigation],
        ["Immediate action", form.immediate_action], ["Numerical results", form.numerical_results],
        ["Root cause", form.root_cause_category], ["Action taken", form.action_taken],
        ["Investigation results", form.investigation_results], ["Conclusion", form.conclusion],
        ["Supporting data", form.supporting_data],
        ...inv.six_m.map((m) => [`6M – ${m.factor}`, `${yesNo(m.contributing)}\n${m.assessment}`]),
        ["6M conclusion", inv.six_m_conclusion],
        ["5 Whys", (inv.five_whys ?? []).map((w, i) => `Why ${i + 1}: ${w}`).join("\n")],
        ["Root cause statement", `${inv.root_cause_statement} (${inv.root_cause_confidence})`],
        ["Human error justification", inv.human_error_justification],
      ],
    });
    const capa = inv.capa;
    const actions = (xs) => list((xs ?? []).map((x) => `${x.action} – ${x.owner}, ${x.due_working_days} working days`));
    out.push({
      id: "rca", stage: "RCA and CAPA Planning", form: "After Investigation Details (Deviation Flow)",
      fields: [
        ["Impact assessment", [
          `Product: ${inv.impact_assessment.product}`, `Patient: ${inv.impact_assessment.patient}`,
          `Other batches / products: ${inv.impact_assessment.other_batches}`,
          `Validation / registration status: ${inv.impact_assessment.validation_status}`,
          `Stability / regulatory: ${inv.impact_assessment.stability_regulatory}`,
        ].join("\n")],
        ["Possible extension", inv.possible_extension],
        ["Comments", inv.after_investigation_comments],
        ["CAPA required?", `${yesNo(capa.required)}${capa.required ? `, ${capa.wait_for_capa ? "wait for CAPA before closure" : "do not wait for CAPA"}` : ""}\n${capa.justification}`],
        ["Corrective actions", actions(capa.corrective_actions)],
        ["Preventive actions", actions(capa.preventive_actions)],
        ["Effectiveness check", capa.effectiveness_check],
        ["Change control", inv.change_control.required ? inv.change_control.description : "Not required"],
        ["Investigation summary", inv.root_cause_statement],
        ["Root cause", inv.investigation_form.root_cause_category],
        ...IMPACT_QUESTIONS.map((q, i) => [q, `${inv.impact_questions[i].answer}${inv.impact_questions[i].comment ? ` – ${inv.impact_questions[i].comment}` : ""}`]),
        ["Comment", inv.impact_comment],
        ["Final risk assessment", s.finalRpn ? `S ${rank(SEVERITY, inv.final_risk.severity)}, O ${rank(OCCURRENCE, inv.final_risk.occurrence)}, D ${rank(DETECTABILITY, inv.final_risk.detectability)} → RPN ${s.finalRpn} (${s.finalClass.name})\n${inv.final_risk.justification}` : ""],
        ["Overall conclusion", inv.overall_conclusion],
        ["Batch disposition", inv.batch_disposition],
      ],
    });
    out.push({
      id: "qam", stage: "Pending QA Manager Approval", form: "QA Manager Approval Form",
      fields: [
        ["Decision", inv.qa_manager.decision], ["Second approval", inv.qa_manager.second_approval],
        ["Comments", inv.qa_manager.comments],
      ],
    });
  }
  return out.map((sec) => ({ ...sec, fields: sec.fields.filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== "") }));
}

/** Plain-text report for pasting into Scigeniq or e-mail. */
export function exportText(record) {
  const s = summary(record);
  const lines = [
    `${record.number || "QE (number pending)"} – ${s.title}`,
    `Stage: ${s.stage}. Initial RPN: ${s.initialRpn ?? "—"}${s.initialClass ? ` (${s.initialClass.name})` : ""}${s.finalRpn ? `. Final RPN: ${s.finalRpn} (${s.finalClass.name})` : ""}.`,
    "",
  ];
  for (const sec of reportSections(record)) {
    lines.push(`=== ${sec.stage} · ${sec.form} ===`);
    for (const [label, value] of sec.fields) lines.push(`${label}:`, String(value), "");
  }
  const items = Object.values(record.dataItems ?? {});
  if (items.length) {
    lines.push("=== Investigation data plan ===");
    for (const factor of SIX_M) {
      const mine = items.filter((d) => d.factor === factor);
      if (!mine.length) continue;
      lines.push(`${factor}:`);
      for (const d of mine) lines.push(`- [${STATUS_LABEL[d.status] ?? d.status}] ${d.item} (${d.source})${d.note ? ` → ${d.note}` : ""}`);
      lines.push("");
    }
  }
  const refs = record.analysis?.regulatory_focus ?? [];
  if (refs.length) {
    lines.push("=== References ===");
    for (const ref of refs) {
      const r = REFERENCES.find((x) => x.id === ref.reference_id);
      if (r) lines.push(`- ${r.doc}, ${r.clause}: ${ref.why}`);
    }
  }
  return lines.join("\n").trim() + "\n";
}
