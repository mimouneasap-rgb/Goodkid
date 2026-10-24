// Offline drafts: the same result shapes Claude returns, filled from the event
// details, the SOP rules and the knowledge base, with placeholders where a person
// must supply facts. Used when no Claude connection is configured, and as the
// starting point the user edits. Pure functions.

import { SIX_M, IMPACT_QUESTIONS, QUESTION_FACTOR, classify, rpn } from "./sop.js";
import { referencesFor } from "./knowledge.js";

const T = {
  en: {
    todo: (what) => `[TO COMPLETE: ${what}]`,
    tbd: "To be determined by the investigation.",
    approve: "Approved for investigation. Initial risk assessment performed with the RPN matrix (QA0015E/Onc/AE07/02).",
    invRequired: "A formal investigation is required to determine the root cause, assess the impact on the batch and on other batches, and define CAPA.",
    invMandatory: (cls) => `The event is classified as ${cls}; a formal investigation is mandatory (SOPQA0015E Note 07).`,
    invOptional: "Low-risk incident. Investigation not required; the cause and the correction are documented in the event form.",
    quarantine: (b) => `Place batch ${b} in quarantine / QA hold and tag it until the deviation is closed (SOPQA0015E Note 04).`,
    otherBatches: "Identify other batches manufactured with the same materials, equipment or process step and assess them.",
    inform: "Inform QA and the department manager; record any verbal instruction (SOPQA0015E Note 05).",
    search: "Search Scigeniq for events on the same product, step, equipment and root cause over the last 24 months.",
    noRecurrence: "No similar event identified at this stage.",
    sev: "Severity based on the potential impact on product quality and patient (AE07).",
    occ: "Occurrence based on the history of similar events and the robustness of the process.",
    det: "Detectability based on the controls that detected the event.",
    contributing: "Contributing factor:",
    ruledOut: "Not a contributing factor:",
    noData: (m) => `[TO COMPLETE: evidence reviewed for ${m}: records, values, limits, dates]`,
  },
  fr: {
    todo: (what) => `[À COMPLÉTER : ${what}]`,
    tbd: "À déterminer par l'investigation.",
    approve: "Approuvé pour investigation. Évaluation initiale du risque réalisée avec la matrice RPN (QA0015E/Onc/AE07/02).",
    invRequired: "Une investigation formelle est nécessaire afin de déterminer la cause racine, d'évaluer l'impact sur le lot et sur les autres lots, et de définir les CAPA.",
    invMandatory: (cls) => `L'événement est classé ${cls} ; une investigation formelle est obligatoire (SOPQA0015E Note 07).`,
    invOptional: "Incident à faible risque. Investigation non requise ; la cause et la correction sont documentées dans le formulaire.",
    quarantine: (b) => `Placer le lot ${b} en quarantaine / statut HOLD et l'étiqueter jusqu'à la clôture de la déviation (SOPQA0015E Note 04).`,
    otherBatches: "Identifier les autres lots fabriqués avec les mêmes matières, équipements ou étapes et évaluer leur impact.",
    inform: "Informer l'AQ et le responsable du département ; documenter toute instruction verbale (SOPQA0015E Note 05).",
    search: "Rechercher dans Scigeniq les événements sur le même produit, étape, équipement et cause racine sur les 24 derniers mois.",
    noRecurrence: "Aucun événement similaire identifié à ce stade.",
    sev: "Sévérité selon l'impact potentiel sur la qualité du produit et le patient (AE07).",
    occ: "Occurrence selon l'historique des événements similaires et la robustesse du procédé.",
    det: "Détectabilité selon les contrôles qui ont détecté l'événement.",
    contributing: "Facteur contributif :",
    ruledOut: "Facteur non contributif :",
    noData: (m) => `[À COMPLÉTER : preuves revues pour ${m} : enregistrements, valeurs, limites, dates]`,
  },
};
const tr = (lang) => T[lang] ?? T.en;

// Investigation tasks by scope, as created on site records.
const TASKS = {
  oos: [["QC lab investigation (Phase 1a/1b/2)", "Quality Control"], ["QA investigation", "Quality Assurance"], ["Production investigation", "Manufacturing"]],
  qcna: [["QC investigation", "Quality Control"]],
  equipment: [["Engineering investigation", "Engineering"], ["Qualification / metrology technical assessment", "Validation and Qualification"]],
  csv: [["IT / CSV investigation", "IT"]],
  supplier: [["Supplier investigation", "Supply Chain"]],
  material: [["Material investigation", "Quality Control"]],
  packproc: [["Packaging investigation", "Packaging"]],
  packmat: [["Packaging material investigation", "Supply Chain"]],
};
const ACTIONS = {
  oos: [["R&D recommendations", "R&D"]],
  pqi: [["R&D recommendations", "R&D"], ["Sampling and analysis of the batch", "Quality Control"]],
  ipc: [["R&D recommendations", "R&D"], ["Sampling and analysis of the batch", "Quality Control"]],
  mfg: [["R&D recommendations", "R&D"]],
  yield: [["Yield and reconciliation review", "Manufacturing"]],
  bulk: [["Sampling and analysis of the bulk", "Quality Control"]],
  semi: [["Sampling and analysis of the semi-finished product", "Quality Control"]],
  human: [["Personnel retraining as per SOPGS0024/Onc (after root cause confirmation)", "Manufacturing"]],
};

/** Offline draft of the Open, In Review and Investigation Planning stages. */
export function offlineAnalysis(input) {
  const t = tr(input.language);
  const scopes = input.scopes ?? [];
  const has = (v) => typeof v === "string" && v.trim() !== "";
  const fill = (v, what) => (has(v) ? v.trim() : t.todo(what));
  // Conservative starting scores for QA to confirm: product-facing scopes start at "Middle" severity.
  const sev = scopes.some((s) => ["oos", "pqi", "packmat", "packproc"].includes(s)) ? 3 : 2;
  const risk = { severity: sev, occurrence: 2, detectability: 2 };
  const cls = classify(rpn(risk.severity, risk.occurrence, risk.detectability));
  const deviation = cls.code !== "IN";
  const invRequired = ["MA", "CR"].includes(cls.code) || deviation;

  const investigations = [];
  const actions = [];
  for (const s of scopes) {
    for (const [title, department] of TASKS[s] ?? []) if (!investigations.some((i) => i.title === title)) investigations.push({ title, department, objective: t.tbd });
    for (const [title, owner] of ACTIONS[s] ?? []) if (!actions.some((a) => a.title === title)) actions.push({ title, owner_department: owner, description: t.tbd });
  }
  if (invRequired && !investigations.some((i) => i.department === "Quality Assurance")) {
    investigations.unshift({ title: "QA investigation", department: "Quality Assurance", objective: t.tbd });
  }
  if (invRequired && input.department && !investigations.some((i) => i.department === input.department)) {
    investigations.push({ title: `${input.department} investigation`, department: input.department, objective: t.tbd });
  }

  const containment = [t.inform];
  if (has(input.batch)) containment.unshift(t.quarantine(input.batch.trim()));
  containment.push(t.otherBatches);

  return {
    classification: {
      type: deviation ? "Deviation" : "Incident",
      exhibit_category: t.todo("Exhibit category (QA0015E/Onc/AE08/02)"),
      rationale: t.todo("why the event is an incident or a deviation"),
    },
    qe_form: {
      title: fill(input.title, "short title with product and batch"),
      where: fill(input.area, "area / room / equipment"),
      what: fill(input.description, "what happened"),
      who: fill([input.product, input.batch && `lot ${input.batch}`].filter(Boolean).join(", "), "people, departments, product and batch"),
      why: t.tbd,
      event_scopes: scopes,
      departments: input.department ? [input.department] : [],
      detected_by: fill(input.detectedBy, "who detected the event"),
      failure_description: fill(input.description, "description of failure"),
      immediate_actions: fill(input.immediateActions, "immediate actions taken"),
      related_records: fill(input.relatedRecords, "related records, or N/A"),
      deviation_values: fill(input.deviationValues, "parameter (unit) / result / limit, or N/A"),
      products_affected: fill([input.product, input.productCode].filter(Boolean).join(" , "), "product and code"),
      batches: fill(input.batch, "batch number(s)"),
      equipment: fill(input.equipment, "equipment ID(s), or N/A"),
      area: fill(input.area, "area"),
    },
    missing_information: [],
    initial_risk: {
      ...risk,
      severity_justification: t.sev, occurrence_justification: t.occ, detectability_justification: t.det,
      rpn_comment: `RPN ${rpn(risk.severity, risk.occurrence, risk.detectability)} (${cls.name}). ${t.todo("confirm the scores")}`,
    },
    historical_review: { recurring: false, search_to_perform: t.search, details: t.noRecurrence },
    qa_review: { decision: "Approve", comments: t.approve },
    containment,
    investigation_planning: {
      investigation_required: invRequired,
      justification: ["MA", "CR"].includes(cls.code) ? t.invMandatory(cls.name) : invRequired ? t.invRequired : t.invOptional,
      lab_investigation_required: scopes.includes("oos") || scopes.includes("qcna"),
      investigations,
      standalone_actions: actions,
      extension_expected: false,
    },
    hypotheses: [],
    data_requirements: [],
    interviews: [],
    regulatory_focus: referencesFor(scopes).slice(0, 6).map((r) => ({ reference_id: r.id, why: r.clause })),
  };
}

/**
 * Offline draft of the investigation and closure from the collected findings:
 * a factor is contributing when any of its checks found an anomaly.
 */
export function offlineInvestigation(record) {
  const t = tr(record.input?.language);
  const items = Object.values(record.dataItems ?? {});
  const six_m = SIX_M.map((factor) => {
    const mine = items.filter((d) => d.factor === factor && d.status && d.status !== "pending" && d.status !== "na");
    const anomalies = mine.filter((d) => d.status === "anomaly");
    const lines = mine.map((d) => `- ${d.item}: ${d.note?.trim() || (d.status === "ok" ? "compliant" : "anomaly")}`);
    const lead = anomalies.length ? t.contributing : mine.length ? t.ruledOut : "";
    return {
      factor,
      contributing: anomalies.length > 0,
      assessment: mine.length ? `${lead}\n${lines.join("\n")}` : t.noData(factor),
    };
  });
  const contributing = six_m.filter((m) => m.contributing).map((m) => m.factor);
  const category = contributing.includes("Method") ? "Procedure or instruction-related"
    : contributing.includes("Machine/Instrument") ? "Equipment-related"
      : contributing.includes("Material") ? "Material/product-related"
        : contributing.includes("Environment") ? "Environmental factors"
          : contributing.includes("Man") ? "Human error"
            : contributing.includes("Measurement") ? "System-related"
              : "Not determined";
  const impact_questions = IMPACT_QUESTIONS.map((_, i) => {
    const factor = QUESTION_FACTOR[i];
    if (factor) return { answer: contributing.includes(factor) ? "Yes" : "No", comment: "" };
    if (i < 5) return { answer: category === "Human error" ? t.todo("Yes/No") : "N/A", comment: "" };
    return { answer: "No", comment: t.todo("justify") };
  }).map((q) => (q.answer.startsWith("[") ? { answer: "N/A", comment: q.answer } : q));
  const initial = record.analysis?.initial_risk ?? { severity: 2, occurrence: 2, detectability: 2 };

  return {
    investigation_form: {
      description: record.analysis?.qe_form?.failure_description ?? t.todo("description"),
      investigation: t.todo("scope and approach of the investigation (6M, Is/Is-not, change analysis)"),
      immediate_action: record.analysis?.qe_form?.immediate_actions ?? t.todo("immediate action"),
      numerical_results: t.todo("numerical results, or N/A"),
      root_cause_category: category,
      action_taken: t.todo("actions taken"),
      investigation_results: t.todo("investigation results"),
      conclusion: t.todo("conclusion"),
      supporting_data: t.todo("records attached (BMR/OF, logbooks, EM data, training records, results)"),
    },
    six_m,
    six_m_conclusion: contributing.length ? `${t.contributing} ${contributing.join(", ")}.` : t.todo("6M conclusion"),
    five_whys: [t.todo("why 1"), t.todo("why 2"), t.todo("why 3"), t.todo("why 4"), t.todo("why 5")],
    root_cause_statement: t.todo("root cause statement"),
    root_cause_confidence: category === "Not determined" ? "Not determined" : "Most probable",
    human_error_justification: category === "Human error" ? t.todo("error type, conditions, why system causes are excluded") : "N/A",
    impact_assessment: {
      product: t.todo("impact on product quality"), patient: t.todo("impact on patient"),
      other_batches: t.todo("other batches / products assessed"), validation_status: t.todo("validation / registration status"),
      stability_regulatory: t.todo("stability / regulatory impact"),
    },
    possible_extension: t.todo("possible extension to other batches, products or areas"),
    after_investigation_comments: "",
    capa: {
      required: category !== "Not determined" && contributing.length > 0,
      wait_for_capa: false,
      justification: t.todo("CAPA decision"),
      corrective_actions: [], preventive_actions: [],
      effectiveness_check: t.todo("effectiveness criterion and review date"),
    },
    change_control: { required: contributing.includes("Method"), description: contributing.includes("Method") ? t.todo("document / process change") : "" },
    impact_questions,
    impact_comment: "",
    final_risk: { severity: initial.severity, occurrence: Math.max(1, (initial.occurrence ?? 2) - 1), detectability: initial.detectability, justification: t.todo("final risk justification") },
    overall_conclusion: t.todo("overall conclusion"),
    batch_disposition: t.todo("batch disposition"),
    qa_manager: { decision: "Approved", second_approval: "None", comments: t.todo("QA manager comments") },
    open_points: [],
    inspection_readiness: [],
  };
}
