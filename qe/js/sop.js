// Site rules for quality events, taken from SOPQA0015E/Onc ver. 04 "Handling of
// Quality Events" and SOPQA0146E/Onc ver. 02 "Scigeniq QMS Quality Events
// Management Module". Pure functions, no DOM access, so the same module runs in
// the browser and under `node --test`.

export const SITE = {
  name: "El Kendi Pharmaceutical Manufacturing Company, Oncology site",
  code: "KO",
  system: "Scigeniq QMS, Quality Events module",
};

// QA0015E/Onc/AE07/02: Risk Prioritization Number. Severity, occurrence and
// detectability are each ranked 1–5, RPN = S × O × D.
export const SEVERITY = {
  1: ["Very Low", "Non-compliance that is not related to GMP, no possible impact on the patient, yield or production capability"],
  2: ["Low", "Minor GMP non-compliance, no possible impact on the patient, yield or production capability"],
  3: ["Middle", "Significant GMP non-compliance, possible impact on patient, but moderate impact on yield or production capability"],
  4: ["High", "Major GMP non-compliance, probable impact on patient, high impact on yield or production capability"],
  5: ["Very High", "Serious GMP non-compliance, probable serious harm or death, impact on yield or production capability"],
};
export const OCCURRENCE = {
  1: ["Very Low", "Highly improbable to occur"],
  2: ["Low", "Improbable to occur"],
  3: ["Middle", "Probable to occur"],
  4: ["High", "Highly probable to occur"],
  5: ["Very High", "Very highly probable to occur"],
};
export const DETECTABILITY = {
  1: ["Very High", "Control systems in place have a very high probability of detecting the defect or its effects"],
  2: ["High", "Control systems in place have a high probability of detecting the defect or its effects"],
  3: ["Middle", "Control systems in place could detect the defect or its effects"],
  4: ["Low", "Control systems in place have a low probability of detecting the defect or its effects"],
  5: ["Very Low", "There is no control system to detect the effect"],
};

// Deviation classes (SOP 10.3.1.3 and AE07). `level` reuses the app's colour scale.
export const CLASSES = [
  { code: "IN", name: "Incident", min: 1, max: 5, level: "Low" },
  { code: "MI", name: "Minor deviation", min: 6, max: 12, level: "Medium" },
  { code: "MA", name: "Major deviation", min: 13, max: 32, level: "High" },
  { code: "CR", name: "Critical deviation", min: 33, max: 125, level: "Critical" },
];

const isRank = (v) => Number.isInteger(v) && v >= 1 && v <= 5;

/** RPN = severity × occurrence × detectability, or null if any rank is missing. */
export function rpn(s, o, d) {
  return [s, o, d].every(isRank) ? s * o * d : null;
}

/** Deviation class for an RPN score (null when the score is missing). */
export function classify(score) {
  if (!Number.isInteger(score) || score < 1) return null;
  return CLASSES.find((c) => score >= c.min && score <= c.max) ?? CLASSES[CLASSES.length - 1];
}

// SOP 10.2.1.3: event scope (type), and QA0015E/Onc/AE05/02: the selections the
// system makes mandatory for each scope.
export const MANDATORY_COLUMNS = [
  ["area", "Area"],
  ["rawMaterial", "Raw material"],
  ["equipment", "Equipment"],
  ["product", "Product"],
  ["packingMaterial", "Packing material"],
  ["semiFinished", "Semi-finished production"],
  ["supplier", "Company (supplier)"],
  ["computerizedSystem", "Computerized system"],
  ["batch", "Batch N°"],
];

const Y = true, N = false;
export const SCOPES = [
  { id: "oos", name: "Confirmed OOS/OOT results", mandatory: [Y, Y, Y, Y, Y, Y, Y, Y, Y] },
  { id: "pqi", name: "Product quality issue", mandatory: [Y, Y, Y, Y, Y, Y, Y, N, Y] },
  { id: "qcna", name: "QC Non-Acceptance Results", mandatory: [Y, Y, Y, Y, N, N, N, N, Y] },
  { id: "yield", name: "Yield/accountability deviation", mandatory: [Y, Y, Y, Y, N, Y, N, N, Y] },
  { id: "time", name: "Exceeding time limitations", mandatory: [Y, N, N, N, N, N, N, N, Y] },
  { id: "ipc", name: "In-process testing failure", mandatory: [Y, Y, Y, Y, N, Y, N, Y, Y] },
  { id: "packproc", name: "Packaging procedures deviation", mandatory: [Y, N, Y, Y, Y, N, N, N, Y] },
  { id: "human", name: "Human error", mandatory: [Y, N, N, N, N, N, N, N, Y] },
  { id: "doc", name: "Documentation issue", mandatory: [N, N, N, N, N, N, N, N, N] },
  { id: "mfg", name: "Manufacturing process deviation", mandatory: [Y, Y, Y, Y, N, N, N, N, Y] },
  { id: "csv", name: "Computerized system failure", mandatory: [N, N, N, N, N, N, N, Y, Y] },
  { id: "material", name: "Material issues", mandatory: [Y, Y, N, Y, N, N, Y, N, Y] },
  { id: "equipment", name: "Equipment failure", mandatory: [Y, N, Y, N, N, N, N, Y, Y] },
  { id: "supplier", name: "Supplier-related issue", mandatory: [N, N, N, N, N, N, Y, N, Y] },
  { id: "bulk", name: "Bulk material deviation", mandatory: [Y, Y, N, N, N, N, N, N, Y] },
  { id: "semi", name: "Semi-finished product issue", mandatory: [Y, N, N, N, N, Y, N, N, Y] },
  { id: "packmat", name: "Packaging material deviation", mandatory: [N, N, N, N, Y, N, N, N, Y] },
];
export const SCOPE_IDS = SCOPES.map((s) => s.id);
export const scopeName = (id) => SCOPES.find((s) => s.id === id)?.name ?? id;

/** Union of the mandatory selections for the chosen scopes, as [key, label] pairs. */
export function mandatoryFields(scopeIds = []) {
  const chosen = SCOPES.filter((s) => scopeIds.includes(s.id));
  return MANDATORY_COLUMNS.filter((_, i) => chosen.some((s) => s.mandatory[i]));
}

// SOP 10.5.2: root cause categories offered by the system.
export const ROOT_CAUSES = [
  "Supply chain issues",
  "Procedure or instruction-related",
  "Reprocessing-related",
  "Supplier-related",
  "System-related",
  "Human error",
  "Equipment-related",
  "Material/product-related",
  "Facility-related",
  "Not determined",
  "Environmental factors",
];

// The six investigation factors as the investigation form names them.
export const SIX_M = ["Environment", "Man", "Material", "Measurement", "Method", "Machine/Instrument"];
export const SIX_M_HINT = {
  Environment: "Milieu / mother nature: temperature, RH, ΔP, classification, EM, utilities",
  Man: "Main-d'œuvre: training, qualification, workload, shift, behaviour, supervision",
  Material: "Matière: API, excipients, packaging, intermediates, suppliers, storage",
  Measurement: "Mesure: instruments, calibration, methods, sampling, data, IPC",
  Method: "Méthode: SOP, BMR/BPR, master formula, process parameters, validation",
  "Machine/Instrument": "Matériel: equipment, qualification, maintenance, alarms, settings",
};

// The impact assessment questions of the "After investigation details" form
// (QA0015E/Onc templates, "Impact Assessment Questions Part 1").
export const IMPACT_QUESTIONS = [
  "Was the mistake due to a lack of training or competence? (for Human Mistake deviation)",
  "Were there any distractions or external factors that may have contributed to the mistake? (for Human Mistake deviation)",
  "Were there any issues with equipment or tools that may have played a role in the mistake? (for Human Mistake deviation)",
  "Was the mistake detected and corrected in a timely manner? (for Human Mistake deviation)",
  "Was the mistake occurred in Shift A / Shift B or Shift C? (for Human Mistake deviation)",
  "Does it affect the product quality attributes?",
  "Does it contradict with applicable GMP requirement?",
  "Does the deviation occur due to material factor?",
  "Does the deviation occur due to mother nature factor?",
  "Does the deviation occur due to machine factor?",
  "Does the deviation occur due to man factor?",
  "Does the deviation occur due to measurement factor?",
  "Does the deviation occur due to method factor?",
];
// Question index (0-based) → the 6M factor it asks about.
export const QUESTION_FACTOR = {
  7: "Material", 8: "Environment", 9: "Machine/Instrument", 10: "Man", 11: "Measurement", 12: "Method",
};

export const DEPARTMENTS = [
  "Manufacturing", "Packaging", "Quality Assurance", "Quality Control", "Microbiology", "R&D",
  "Validation and Qualification", "Engineering", "Warehouse", "Supply Chain", "IT", "HSE",
  "Regulatory Affairs", "Planning",
];

// Workflow of the Quality Event record (SOPQA0146E/Onc sections 4–7 and the
// stages printed on the system reports).
export const QE_STAGES = [
  { id: "open", name: "Open", form: "Quality Event Form", owner: "Initiator / QE owner" },
  { id: "review", name: "In Review", form: "Event Approval Form (initial risk assessment)", owner: "QA" },
  { id: "planning", name: "Investigation Planning", form: "Investigation Details", owner: "QE owner / QA" },
  { id: "wait-inv", name: "Wait Investigation Implementation", form: "Investigation and action tasks", owner: "Task owners" },
  { id: "rca", name: "RCA and CAPA Planning", form: "After Investigation Details (Deviation Flow)", owner: "QA" },
  { id: "wait-capa", name: "Wait CAPA Implementation", form: "CAPA (SOPQA0026/Onc)", owner: "CAPA owner", conditional: true },
  { id: "qam", name: "Pending QA Manager Approval", form: "QA Manager Approval Form", owner: "QA Manager" },
  { id: "qp", name: "Second Approval (QP)", form: "Second Approval Form", owner: "QP", conditional: true },
  { id: "closed", name: "Closed", form: "—", owner: "System" },
];

export const TASK_WORKFLOWS = {
  investigation: ["Investigation in Progress", "In Review (assigned approver)", "QA Approval", "Close"],
  action: ["In Progress (Action Completion)", "QA Approval", "Closed"],
  extension: ["In Review", "Approved / Rejected / More Info"],
  lab: [
    "Open (Lab Investigation Form)", "Lab Supervisor / QC Compliance Approval", "QA Awareness",
    "Phase 1a: laboratory checklist", "Phase 1b: hypothesis testing", "Phase 2: QA manufacturing assessment",
    "Phase 2: extended laboratory investigation", "RCA and CAPA Planning", "Deviation Planning (QE created)",
    "QA Manager Approval", "QP / Quality Director Approval", "Closed",
  ],
};

// SOP section 10.8: numbering. The temporary number applies during system downtime (10.11).
export const NUMBERING = {
  event: "QE-KO-",
  action: "ACTION-KO-",
  investigation: "INVIS-KO-",
  extension: "EC-KO-",
  temporary: "TQE-KO-",
};

// ---------- dates ----------

// Weekend days (0 = Sunday … 6 = Saturday). The site works Sunday to Thursday.
export const DEFAULT_WEEKEND = [5, 6];

export function parseDate(iso) {
  if (typeof iso !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCMonth() === m - 1 ? date : null;
}
export const isoDate = (date) => date.toISOString().slice(0, 10);

/** Adds working days to an ISO date, skipping the weekend days. */
export function addBusinessDays(iso, days, weekend = DEFAULT_WEEKEND) {
  const date = parseDate(iso);
  if (!date) return null;
  let left = days;
  while (left > 0) {
    date.setUTCDate(date.getUTCDate() + 1);
    if (!weekend.includes(date.getUTCDay())) left--;
  }
  return isoDate(date);
}

/** Working days from one ISO date to a later one (0 when same day or earlier). */
export function businessDaysBetween(fromIso, toIso, weekend = DEFAULT_WEEKEND) {
  const from = parseDate(fromIso), to = parseDate(toIso);
  if (!from || !to || to <= from) return 0;
  let n = 0;
  for (const d = new Date(from); d < to;) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (!weekend.includes(d.getUTCDay())) n++;
  }
  return n;
}

/**
 * Deadlines the SOP sets, counted from the detection date and the date the
 * event form was issued: log + complete the form within 1 working day (10.1.1,
 * 10.2.1), investigation approved within 30 working days (10.4.3.1), at most two
 * 30-day extensions (10.4.3.2), QUH notified within 24 h of a critical approval.
 */
export function deadlines({ detectionDate, reportedDate, eventClass } = {}, weekend = DEFAULT_WEEKEND) {
  const issued = reportedDate || detectionDate;
  const out = {
    logBy: detectionDate ? addBusinessDays(detectionDate, 1, weekend) : null,
    investigationDue: issued ? addBusinessDays(issued, 30, weekend) : null,
    firstExtensionDue: issued ? addBusinessDays(issued, 60, weekend) : null,
    secondExtensionDue: issued ? addBusinessDays(issued, 90, weekend) : null,
    quhNotification: eventClass === "CR" ? "Within 24 h of critical deviation approval" : null,
  };
  return out;
}

// ---------- compliance check ----------

const blank = (v) => v === undefined || v === null || String(v).trim() === "" || /^\[(to complete|à compléter)/i.test(String(v).trim());

/**
 * Checks a record against the SOP and the main regulatory expectations.
 * Returns findings `{ level: "error"|"warning"|"info", rule, message, ref }`.
 */
export function complianceCheck(record, today = new Date()) {
  const out = [];
  const add = (level, rule, message, ref) => out.push({ level, rule, message, ref });
  const input = record?.input ?? {};
  const analysis = record?.analysis ?? null;
  const inv = record?.investigation ?? null;
  const form = analysis?.qe_form ?? {};

  // Dates and timeliness
  const occ = parseDate(input.occurrenceDate), det = parseDate(input.detectionDate);
  if (!det) add("error", "detection-date", "Detection date is missing. It starts every SOP deadline.", "SOPQA0015E 10.1.1");
  if (occ && det && det < occ) {
    add("error", "date-order", `Detection date (${input.detectionDate}) is before the date of occurrence (${input.occurrenceDate}). Check for a typing error before submission.`, "ALCOA+ (accurate): MHRA DI 2018, PIC/S PI 041-1");
  }
  if (det && input.reportedDate) {
    const late = businessDaysBetween(input.detectionDate, input.reportedDate);
    if (late > 1) add("warning", "late-logging", `Event logged ${late} working days after detection; the SOP requires 1 working day. Record the reason for the delay.`, "SOPQA0015E 10.1.1 (audit AUDP-KO-14)");
  }

  // Case description
  for (const [key, label] of [["where", "Where?"], ["what", "What?"], ["who", "Who?"], ["why", "Why?"]]) {
    if (analysis && blank(form[key])) add("error", `case-${key}`, `Case description "${label}" is empty.`, "SOPQA0015E 10.2.1.2");
  }

  // Mandatory selections per scope (AE05)
  const scopes = form.event_scopes?.length ? form.event_scopes : input.scopes ?? [];
  if (!scopes.length) add("error", "scope", "No event scope selected.", "SOPQA0015E 10.2.1.3");
  const values = {
    area: input.area || form.area, equipment: input.equipment || form.equipment,
    product: input.product || form.products_affected, batch: input.batch || form.batches,
    rawMaterial: input.rawMaterial, packingMaterial: input.packingMaterial, semiFinished: input.semiFinished,
    supplier: input.supplier, computerizedSystem: input.computerizedSystem,
  };
  for (const [key, label] of mandatoryFields(scopes)) {
    if (blank(values[key])) add("error", `mandatory-${key}`, `"${label}" is mandatory for the selected scope(s).`, "QA0015E/Onc/AE05/02");
  }

  // Containment
  const hasBatch = !blank(values.batch);
  const actions = `${input.immediateActions ?? ""} ${form.immediate_actions ?? ""} ${(analysis?.containment ?? []).join(" ")}`;
  if (hasBatch && !/quarant|hold|bloqu|isol|segreg|statut/i.test(actions)) {
    add("warning", "quarantine", "A batch is affected but quarantine / QA hold is not recorded in the immediate actions.", "SOPQA0015E Note 04; 21 CFR 211.22(a)");
  }

  // Risk and investigation decision
  const risk = analysis?.initial_risk;
  const score = risk ? rpn(risk.severity, risk.occurrence, risk.detectability) : null;
  const cls = classify(score);
  if (analysis && !cls) add("error", "rpn", "Initial risk assessment (S, O, D) is incomplete.", "QA0015E/Onc/AE07/02");
  const planning = analysis?.investigation_planning;
  if (cls && ["MA", "CR"].includes(cls.code) && planning && !planning.investigation_required) {
    add("error", "investigation-mandatory", `${cls.name} (RPN ${score}): a formal investigation is mandatory.`, "SOPQA0015E Note 07; ICH Q7 2.16");
  }
  if (planning && !planning.investigation_required && blank(planning.justification)) {
    add("error", "no-investigation-justification", "Investigation not required but no justification is documented.", "SOPQA0015E 10.3.2.1");
  }
  if (cls?.code === "CR") add("warning", "quh-24h", "Critical deviation: notify the Quality Unit Head within 24 h of approval.", "SOPQA0015E glossary: critical deviations");
  if (risk && risk.detectability >= 4 && cls && cls.code !== "IN") {
    add("info", "detection-gap", "Low detectability: the investigation should explain why existing controls did not detect the event and the CAPA should strengthen them.", "ICH Q9(R1); EU GMP Ch. 1 1.4(xiv)");
  }
  if ((scopes.includes("oos")) && analysis && !planning?.lab_investigation_required) {
    add("warning", "oos-phase", "OOS/OOT scope: a phased laboratory investigation (Phase 1a/1b/2) must precede the manufacturing investigation.", "SOPQC0018/Onc; FDA OOS Guidance (2006, Rev. 1 2022)");
  }

  // Timeline
  const due = deadlines({ detectionDate: input.detectionDate, reportedDate: input.reportedDate });
  const ext = Number(record?.extensions ?? 0);
  if (ext > 2) add("error", "extensions", "More than two extensions: escalate to the Quality Unit Head.", "SOPQA0015E 10.4.3.2.2");
  if (due.investigationDue && !inv && isoDate(today) > due.investigationDue && ext === 0) {
    add("warning", "overdue", `Investigation due ${due.investigationDue} (30 working days) and no extension is recorded.`, "SOPQA0015E 10.4.3.1");
  }

  // Investigation outcome
  if (inv) {
    const cause = inv.investigation_form?.root_cause_category;
    if (!cause) add("error", "root-cause", "Root cause category is not selected.", "SOPQA0015E 10.6.2");
    if (cause === "Not determined") {
      add("error", "not-determined", "Root cause not determined: a risk assessment report must be initiated and its conclusion recorded.", "SOPQA0015E Note 08; SOPQA0140/Onc");
    }
    if (cause === "Human error") {
      const answered = (inv.impact_questions ?? []).slice(0, 5).every((q) => q && q.answer && q.answer !== "N/A");
      if (!answered) add("error", "human-error-questions", "Root cause is human error: answer impact questions 1–5 (training, distractions, tools, timely detection, shift).", "SOPQA0015E impact assessment part 1");
      if (blank(inv.human_error_justification) || /^n\/?a$/i.test(String(inv.human_error_justification).trim())) {
        add("error", "human-error-justification", "Human error must be formally justified, showing that process, procedural or system causes were ruled out.", "EU GMP Ch. 1 1.4(xiv); EU GMP Ch. 8");
      }
      if (!inv.capa?.required) add("warning", "human-error-capa", "Human error closed without CAPA. Retraining alone is rarely accepted as an effective preventive action by inspectors.", "ICH Q10 3.2.2; FDA 483 trends (211.192)");
    }
    const contributing = new Set((inv.six_m ?? []).filter((m) => m.contributing).map((m) => m.factor));
    for (const [idx, factor] of Object.entries(QUESTION_FACTOR)) {
      const answer = inv.impact_questions?.[idx]?.answer;
      if (contributing.has(factor) && answer === "No") {
        add("warning", `iaq-${factor}`, `6M marks ${factor} as contributing but impact question ${Number(idx) + 1} answers "No". Make them consistent.`, "Data consistency, ALCOA+");
      }
      if (!contributing.has(factor) && answer === "Yes" && (inv.six_m ?? []).length) {
        add("warning", `iaq-${factor}-rev`, `Impact question ${Number(idx) + 1} answers "Yes" for ${factor} but the 6M analysis rules it out.`, "Data consistency, ALCOA+");
      }
    }
    if ((inv.six_m ?? []).some((m) => blank(m.assessment))) {
      add("warning", "6m-blank", "Every 6M factor needs a documented assessment with the evidence reviewed, including those ruled out.", "SOPQA0015E 10.4.2.1");
    }
    if (blank(inv.impact_assessment?.other_batches)) {
      add("warning", "other-batches", "The investigation must state whether other batches or products could be affected.", "21 CFR 211.192");
    }
    if (analysis?.historical_review?.recurring && !inv.capa?.required) {
      add("warning", "recurring-capa", "Recurring event closed without CAPA.", "ICH Q10 3.2.2; SOPQA0026/Onc");
    }
    if (inv.capa?.required && blank(inv.capa?.effectiveness_check)) {
      add("warning", "capa-effectiveness", "CAPA defined without an effectiveness check.", "ICH Q10 3.2.2; EU GMP Ch. 1 1.4(xiv)");
    }
    const final = inv.final_risk;
    if (final && !classify(rpn(final.severity, final.occurrence, final.detectability))) {
      add("error", "final-rpn", "Final risk assessment (S, O, D) is incomplete.", "SOPQA0015E 10.6.3");
    }
  }

  if (!out.length) add("info", "clean", "No SOP or regulatory gaps detected in the data entered.", "SOPQA0015E");
  const order = { error: 0, warning: 1, info: 2 };
  return out.sort((a, b) => order[a.level] - order[b.level]);
}

// ---------- trending (SOP 10.10) ----------

export const semesterOf = (iso) => (iso && /^\d{4}-\d{2}/.test(iso) ? `H${Number(iso.slice(5, 7)) <= 6 ? 1 : 2}/${iso.slice(0, 4)}` : "—");

/** Counts events by classification, root cause, scope, department and status for each semester. */
export function trend(records) {
  const table = { classification: {}, rootCause: {}, scope: {}, department: {}, status: {} };
  const periods = new Set();
  const bump = (dim, key, period) => {
    table[dim][key] ??= {};
    table[dim][key][period] = (table[dim][key][period] ?? 0) + 1;
  };
  for (const r of records) {
    const period = semesterOf(r.input?.detectionDate);
    periods.add(period);
    const risk = r.analysis?.initial_risk;
    const final = r.investigation?.final_risk;
    const cls = classify(rpn(final?.severity, final?.occurrence, final?.detectability))
      ?? classify(rpn(risk?.severity, risk?.occurrence, risk?.detectability));
    bump("classification", cls?.name ?? "Not classified", period);
    bump("rootCause", r.investigation?.investigation_form?.root_cause_category ?? "Open", period);
    for (const s of r.analysis?.qe_form?.event_scopes ?? r.input?.scopes ?? []) bump("scope", scopeName(s), period);
    bump("department", r.input?.department || "—", period);
    bump("status", r.closed ? "Closed" : "Not closed", period);
  }
  return { periods: [...periods].sort(), table };
}
