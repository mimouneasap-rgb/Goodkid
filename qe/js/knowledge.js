// Investigation knowledge base: the data an investigator has to collect for each
// 6M factor (filtered by event scope), the OOS laboratory phase checklists used on
// site, root cause methods, regulatory references and recurring inspection
// findings. Pure data plus small selectors, no DOM access.

import { SIX_M } from "./sop.js";

// `scopes: null` means the item applies to every event. Otherwise it applies when
// any of the listed scopes is selected.
const ALL = null;
const PROCESS = ["pqi", "yield", "ipc", "mfg", "bulk", "semi", "oos", "time"];
const PACK = ["packproc", "packmat"];

export const DATA_ITEMS = [
  // ----- Environment (milieu / mother nature)
  { m: "Environment", item: "Temperature, RH and differential pressure of every room used by the batch, for the whole period of the operation, with the limits", source: "EM / BMS records, room logbooks (SOPVL0010/Onc)", why: "Rules the environment in or out with data, not with a statement", scopes: ALL },
  { m: "Environment", item: "Alarms, excursions and HVAC/BMS events during the batch window", source: "BMS alarm log and audit trail, engineering work orders", why: "Short excursions are invisible in daily summaries", scopes: ALL },
  { m: "Environment", item: "Room / isolator status: cleaning status label, line clearance, previous product in the room and equipment", source: "Line clearance record, cleaning logbook, room status label", why: "Cross-contamination, foreign matter and mix-up hypotheses", scopes: [...PROCESS, ...PACK, "material", "equipment"] },
  { m: "Environment", item: "Isolator / containment integrity: glove checks, pressure decay or leak test, filter status", source: "Isolator logbook, glove integrity test records", why: "High-potent oncology containment (SOPHSE0004F/Onc) and foreign-matter entry", scopes: [...PROCESS, "equipment", "human"] },
  { m: "Environment", item: "Utilities quality at the time of use (compressed air, purified water, nitrogen, vacuum)", source: "Utility monitoring and QC results", why: "Utilities in direct product contact can be the hidden cause", scopes: [...PROCESS, "equipment"] },
  { m: "Environment", item: "Storage conditions and mapping of the warehouse / quarantine area for the materials and the batch", source: "Warehouse temperature records, mapping report", why: "Moisture or heat exposure before use", scopes: ["material", "bulk", "semi", "packmat", "oos", "pqi", "supplier"] },

  // ----- Man
  { m: "Man", item: "Names, roles and shift of every operator, supervisor and analyst involved at each step", source: "BMR/BPR signatures, attendance and shift roster", why: "Identifies who to interview and whether a shift change occurred", scopes: ALL },
  { m: "Man", item: "Training records for the applicable SOPs, BMR steps and equipment, with dates (before the event)", source: "Training matrix and training files (SOPGS0024/Onc)", why: "Impact question 1; inspectors check training was effective, not only signed", scopes: ALL },
  { m: "Man", item: "Qualification / habilitation for the task (e.g. isolator operation, HPAPI handling, analytical technique)", source: "Habilitation records, analyst qualification", why: "Competence, not only attendance", scopes: ALL },
  { m: "Man", item: "Interviews of the people involved (open questions, done promptly, documented and signed)", source: "Interview record", why: "Reconstructs the real sequence of events and the conditions", scopes: ALL },
  { m: "Man", item: "Workload, overtime, staffing level, concurrent tasks, interruptions and distractions at the time", source: "Planning, shift reports, interviews", why: "Impact question 2; performance shaping factors behind human error", scopes: ["human", "packproc", "doc", "mfg", "time", "yield"] },
  { m: "Man", item: "Previous events involving the same person, task or step", source: "Scigeniq search by person and step", why: "Separates an individual slip from a systemic task design issue", scopes: ["human", "doc", "packproc", "mfg"] },
  { m: "Man", item: "Supervision and second-person verification at the step (was a check required and performed?)", source: "BMR verification signatures", why: "Detectability and the barrier that failed", scopes: ["human", "doc", "packproc", "mfg", "yield"] },
  { m: "Man", item: "Human error classification: slip, lapse, mistake (rule- or knowledge-based) or violation, with the error-likely situation", source: "Human error evaluation form (as in QE-KO-26 supporting data)", why: "Each type needs a different CAPA; EU GMP Ch. 1 1.4(xiv) asks for justification", scopes: ["human", "doc", "packproc"] },

  // ----- Material
  { m: "Material", item: "Identity, batch numbers, quantities, retest/expiry dates of the API and every excipient used, versus the master formula", source: "OF / BMR dispensing record, labels (SOPQA0079/Onc)", why: "Wrong material, wrong quantity or expired material", scopes: [...PROCESS, "material", "human"] },
  { m: "Material", item: "CoA and QC release results of each material lot, and any trend versus earlier lots (PSD, bulk/tapped density, moisture, flowability)", source: "CoA, QC release records, supplier data", why: "Lot-to-lot variability is a frequent cause of flow, compression and uniformity failures", scopes: [...PROCESS, "material", "supplier"] },
  { m: "Material", item: "Other batches manufactured with the same material lots and their results", source: "Batch genealogy / ERP, QC results", why: "Extension to other batches (21 CFR 211.192) and confirms or excludes the material", scopes: [...PROCESS, "material", "supplier"] },
  { m: "Material", item: "Supplier qualification status, complaints and change notifications from the supplier", source: "Approved supplier list, supplier file, quality agreements", why: "Unnotified supplier change", scopes: ["material", "supplier", "packmat", "oos", "pqi"] },
  { m: "Material", item: "Packaging of the materials: bags, liners, ties/attaches, closures, and how they are opened and disposed of", source: "Material specification, dispensing SOP, photos", why: "Foreign matter and contamination hypotheses", scopes: ["pqi", "material", "mfg", "bulk", "human"] },
  { m: "Material", item: "Intermediate / bulk hold times and storage containers at each stage", source: "BMR time stamps, hold time validation", why: "Hold time exceedance can change moisture, flow or stability", scopes: ["bulk", "semi", "time", "pqi", "ipc", "oos"] },
  { m: "Material", item: "Packaging material lots, artwork version, text, code, and reconciliation of issued / used / destroyed", source: "BPR, artwork approval, label reconciliation", why: "Mix-up and labelling errors (21 CFR 211.125, 211.130)", scopes: PACK },

  // ----- Measurement
  { m: "Measurement", item: "Calibration and periodic check status of every instrument used for the measurement (balance, IPC tester, HPLC, LOD, probe)", source: "Calibration certificates, logbooks, labels", why: "A failed or out-of-calibration instrument creates false results", scopes: ALL },
  { m: "Measurement", item: "Raw data: chromatograms, printouts, IPC data, with audit trail review for the sequence", source: "CDS/LIMS audit trail, instrument printouts", why: "Data integrity (21 CFR 211.194, Annex 11 §9) and hidden reprocessing", scopes: ["oos", "qcna", "ipc", "csv", "pqi"] },
  { m: "Measurement", item: "Sampling plan, sampling tool, sample location and sampler, sample storage before analysis", source: "Sampling record, SOP", why: "Non-representative or mishandled samples", scopes: ["oos", "qcna", "ipc", "bulk", "pqi"] },
  { m: "Measurement", item: "IPC results through the run (hardness, thickness, weight, disintegration, friability, LOD) with trends and limits", source: "IPC sheets, IPQC printouts", why: "Shows when the drift started and its link to settings", scopes: ["ipc", "mfg", "pqi", "semi", "bulk"] },
  { m: "Measurement", item: "Method validation / verification status, system suitability results, standards and reagents lots", source: "Validation report, analysis sheet", why: "Phase 1 laboratory investigation", scopes: ["oos", "qcna"] },
  { m: "Measurement", item: "Yield calculation at each stage, theoretical vs actual, with limits", source: "BMR yield sections (21 CFR 211.103)", why: "Yield outside limits points to losses, mix-up or a wrong formula adjustment", scopes: ["yield", "mfg", "ipc", "bulk", "pqi"] },

  // ----- Method
  { m: "Method", item: "Version of the SOP, BMR/BPR and master formula in force, and whether the instruction actually covers the situation that occurred", source: "Document control (DMS), BMR", why: "Gaps in instructions are the most common true root cause behind 'human error'", scopes: ALL },
  { m: "Method", item: "Step-by-step reconstruction of the operation compared with the instruction (what was done, when, by whom)", source: "BMR, interviews, equipment data", why: "Is/Is-not and change analysis", scopes: ALL },
  { m: "Method", item: "Changes since the last good batch: process parameters, equipment, materials, suppliers, personnel, procedures (open or recent change controls)", source: "Change control log (SOPGS0026/Onc), BMR comparison", why: "Change analysis, the quickest way to a root cause", scopes: ALL },
  { m: "Method", item: "Process validation status of the product and of this batch (validation batch? registration batch?)", source: "Validation master plan, protocol", why: "Annex 15 deviation impact on validation status", scopes: [...PROCESS, "equipment"] },
  { m: "Method", item: "Critical process parameters and their recorded values against approved ranges", source: "BMR, equipment printouts, PLC data", why: "Ties the failure to a process parameter (ICH Q8 / Q9)", scopes: [...PROCESS, "equipment"] },
  { m: "Method", item: "Related deviations, OOS, complaints and CAPAs for the product or step (last 12–24 months)", source: "Scigeniq search, APR/PQR", why: "Historical review and recurrence (ICH Q10)", scopes: ALL },
  { m: "Method", item: "R&D / development knowledge: formulation rationale, known sensitivities, reprocessing / reworking options", source: "Development report, R&D recommendation", why: "Scientific justification of root cause and of any reprocessing", scopes: [...PROCESS, "material"] },
  { m: "Method", item: "Packaging line set-up, line clearance, in-process checks and challenge of the vision / code readers", source: "BPR, line clearance, challenge test records", why: "Barriers that should have detected the error", scopes: PACK },
  { m: "Method", item: "Good documentation practice review of the records involved (corrections, missing entries, contemporaneous recording)", source: "BMR / logbook review", why: "Documentation issues and data integrity (EU GMP Ch. 4)", scopes: ["doc", "human", "csv"] },

  // ----- Machine / Instrument
  { m: "Machine/Instrument", item: "Equipment ID, qualification status (IQ/OQ/PQ) and requalification due date", source: "Qualification reports, equipment master list", why: "Qualified state of the equipment train", scopes: [...PROCESS, "equipment", "packproc"] },
  { m: "Machine/Instrument", item: "Preventive maintenance status and maintenance/repair history (DT / work orders) before and after the event", source: "CMMS, DT, maintenance reports", why: "Confirms or excludes a mechanical cause", scopes: [...PROCESS, "equipment", "packproc"] },
  { m: "Machine/Instrument", item: "Equipment logbook entries for the batch: settings, adjustments, stoppages, alarms", source: "Equipment logbook, PLC / HMI alarm history", why: "Adjustments made during the run often explain the drift", scopes: [...PROCESS, "equipment", "packproc", "csv"] },
  { m: "Machine/Instrument", item: "Change parts, tooling, screens, sieves, punches/dies: identification, inspection and wear", source: "Tooling logbook, inspection records", why: "Worn or damaged parts, foreign matter, metal particles", scopes: ["ipc", "mfg", "pqi", "equipment", "packproc"] },
  { m: "Machine/Instrument", item: "Equipment cleaning records and cleaning status", source: "Cleaning logbook, cleaning validation", why: "Residues and cross-contamination", scopes: [...PROCESS, "equipment"] },
  { m: "Machine/Instrument", item: "Computerised system: validation status, version, configuration, audit trail, backup/restore and incident log", source: "CSV documentation, IT incident ticket", why: "Annex 11 and 21 CFR Part 11 expectations", scopes: ["csv", "equipment", "oos"] },
];

/** Data items relevant to the chosen scopes, grouped by 6M factor. */
export function dataRequirements(scopeIds = []) {
  const groups = Object.fromEntries(SIX_M.map((m) => [m, []]));
  DATA_ITEMS.forEach((d, i) => {
    if (d.scopes === null || d.scopes.some((s) => scopeIds.includes(s))) groups[d.m].push({ ...d, key: `lib-${i}` });
  });
  return groups;
}

// OOS laboratory investigation checklists as used on site (OS-KO-3 report).
export const OOS_PHASES = [
  {
    phase: "Phase 1a: laboratory checklist", owner: "Analyst + Lab supervisor / QC compliance",
    groups: {
      Materials: [
        "Was the sample stored in the appropriate conditions?",
        "Was sample integrity assured (not contaminated or degraded)?",
        "Was the correct sample used for the analysis?",
        "Sampling date and storage conditions recorded",
      ],
      Equipment: [
        "Was the periodic check carried out (date)?",
        "Was the external calibration carried out (next calibration date)?",
        "Is the equipment in full integrity (ID, status)?",
      ],
      Method: [
        "Was the analysis performed according to GMP and GLP?",
        "Was the correct technique / method used, compliant with the reference documents and followed without changes?",
        "Were the correct reagents and reference substances used?",
        "Were solution preparations (weighings, dilutions) and storage adequate?",
        "Were the filter type and column correct?",
        "Were calculations and data transcription correct?",
      ],
      Analyst: [
        "Was the chromatographic system bubble-free; was the vial adequately filled?",
        "Was glassware used according to procedure?",
        "Is the analyst trained in the technique and on the equipment?",
      ],
      "Chromatograms / UV": [
        "System suitability compliant (plates, symmetry, resolution, %RSD)?",
        "Chromatographic conditions, vial sequence numbering, stable retention times and pressure?",
        "No ghost peaks, interference discarded, blank coherent, calibration compliant, system conformity at end?",
      ],
    },
  },
  {
    phase: "Phase 1b: hypothesis testing", owner: "Analyst + Lab manager",
    groups: {
      Tests: [
        "Re-injection of the same vial",
        "Re-filter the same final solution and inject",
        "Re-dilute the mother solution and inject",
        "Sonicate / shake the mother solution, dilute and inject",
        "Inject non-filtered / centrifuged sample and reference solutions",
        "Use freshly prepared mobile phase, solvents and solutions",
        "Impurities: different/new column or equipment; identify solvent or mobile-phase peaks; prepare sample extemporaneously",
        "Retest in duplicate of the same sample (with documented justification)",
        "Test a batch declared as control",
      ],
      Conclusion: ["Was the root cause of the non-conformity determined? Summary of the OOS cause"],
    },
  },
  {
    phase: "Phase 2: QA manufacturing assessment", owner: "QA",
    groups: {
      Man: ["Operators trained and BMR followed?", "SOP / BMR followed properly?"],
      Method: [
        "Right, approved master formula / instructions used?", "Other OOS related to the batch?",
        "Is the process validated?", "Deviation related to the batch?", "Supplier claim on materials used?",
        "Change control related to the batch?", "Any change in process parameters?", "Any spillage during processing?",
      ],
      "Mother nature": [
        "Environmental conditions monitored and recorded?", "Product held within validated hold times at all stages?",
        "Containers stored at the designated place at each stage?",
      ],
      Measurement: [
        "Yield reconciliation at each stage?", "Line clearance followed for previous and next batch?",
        "In-process results within limits?", "All CPPs complied with approved limits?",
      ],
      Material: ["Materials from approved vendors?", "Storage conditions of sensitive materials maintained?", "Right material and quantity per master formula?"],
      Machine: [
        "Validated / calibrated equipment used?", "Power failure or maintenance issues?",
        "Right equipment per BMR?", "PM done for all equipment?", "Machine CPPs within approved limits?",
      ],
    },
  },
  {
    phase: "Phase 2: extended laboratory investigation", owner: "QC",
    groups: {
      "Original sample": [
        "Re-preparation from the original sample by up to three analysts",
        "Re-test of the original sample (different portion)", "Control sample (retained sample request)",
      ],
      "New sample": [
        "Re-preparation from a new sample", "Analysis of a control batch", "New mobile phase / solvents",
        "New column and/or equipment", "Evaluate other test results (appearance, assay, dissolution, mass uniformity)",
        "Placebo, API and excipient injections", "Stability: analyse a retained reference sample",
      ],
      Resampling: ["Resampling justified, sampler and analysts named, further testing required?"],
    },
  },
];

export const METHODS = [
  { name: "Is / Is-not analysis", use: "First step: what, where, when and how much the problem is and is not. Narrows the search to what is different.", ref: "Kepner-Tregoe; ICH Q9(R1) Annex I" },
  { name: "Change analysis", use: "Compare the failing batch with the last good batch: materials, parameters, people, equipment, documents. Every difference is a candidate cause.", ref: "ICH Q9(R1) Annex I" },
  { name: "Ishikawa / 6M", use: "Structure candidate causes under Man, Machine, Method, Material, Measurement, Environment. Required by SOPQA0015E 10.4.2.1. Document every factor, including those ruled out, with the evidence reviewed.", ref: "SOPQA0015E 10.4.2; ICH Q9(R1) Annex I.1" },
  { name: "5 Whys", use: "Ask why from the confirmed failure until you reach a cause that, if corrected, prevents recurrence. Stop at a process, procedure or system cause, not at a person.", ref: "SOPQA0015E glossary (Root Cause Analysis)" },
  { name: "Fault tree analysis", use: "For complex failures with several possible paths (e.g. contamination). Works top-down from the event with AND/OR gates.", ref: "ICH Q9(R1) Annex I.5" },
  { name: "FMEA / RPN", use: "Scores S × O × D for the initial and final risk assessment (QA0015E/Onc/AE07/02) and for CAPA prioritisation.", ref: "ICH Q9(R1) Annex I.2; SOPQA0140/Onc" },
  { name: "Human error analysis", use: "Classify the error (slip, lapse, mistake, violation), then look for the error-likely conditions: unclear instruction, poor design, workload, distractions, no second check. Retraining alone does not fix those.", ref: "EU GMP Ch. 1 1.4(xiv); PIC/S PE 009 Ch. 1" },
  { name: "Hypothesis testing", use: "Each candidate cause is confirmed or refuted by a test, data review or experiment. Record the result. A root cause is 'confirmed' only when evidence supports it and alternatives are excluded.", ref: "FDA OOS Guidance (2006, Rev. 1 2022)" },
];

// Regulatory references. Section numbers are given only where the text is cited.
export const REFERENCES = [
  { id: "EU-GMP-C1", body: "EU / PIC/S", doc: "EU GMP Part I, Chapter 1: Pharmaceutical Quality System (2013); PIC/S PE 009", clause: "1.4(xiv)", text: "Deviations, suspected product defects and other problems are reported, investigated and recorded. An appropriate level of root cause analysis is applied. Where human error is suspected or identified as the cause, this should be formally justified, with care to ensure that process, procedural or system-based errors are not overlooked. Appropriate CAPAs are identified and taken, and their effectiveness monitored and evaluated in line with QRM.", tags: ["all", "human"] },
  { id: "EU-GMP-C8", body: "EU / PIC/S", doc: "EU GMP Part I, Chapter 8: Complaints, Quality Defects and Product Recalls", clause: "Investigation and decision-making", text: "Investigations should identify root causes or the most likely cause; if human error is suspected it should be formally justified. Investigation should consider other batches potentially affected.", tags: ["pqi", "human"] },
  { id: "EU-GMP-C5", body: "EU / PIC/S", doc: "EU GMP Part I, Chapter 5: Production", clause: "General", text: "Any deviation from instructions or procedures should be avoided as far as possible. If a deviation occurs, it should be approved in writing by a competent person, with the involvement of QC when appropriate. Yields and reconciliation of quantities should be checked.", tags: ["mfg", "yield", "time", "packproc"] },
  { id: "EU-GMP-C6", body: "EU / PIC/S", doc: "EU GMP Part I, Chapter 6: Quality Control", clause: "Testing; on-going stability", text: "Out of specification or significant atypical trends should be investigated. Results should be recorded and checked for consistency.", tags: ["oos", "qcna"] },
  { id: "EU-GMP-A11", body: "EU / PIC/S", doc: "EU GMP Annex 11: Computerised Systems", clause: "Audit trails; incident management", text: "Incidents, not only system failures and data errors, should be reported and assessed; root cause of a critical incident should be identified and form the basis of CAPA. Audit trails should be available and reviewed.", tags: ["csv", "oos"] },
  { id: "EU-GMP-A15", body: "EU / PIC/S", doc: "EU GMP Annex 15: Qualification and Validation (2015)", clause: "Process validation; deviations", text: "Deviations during validation should be documented, justified and their impact on the validation conclusion assessed.", tags: ["mfg", "equipment", "pqi", "ipc"] },
  { id: "EU-GMP-A16", body: "EU / PIC/S", doc: "EU GMP Annex 16: Certification by a QP and Batch Release", clause: "Section 3: handling of unexpected deviations", text: "A batch with an unexpected deviation may be certified only if registered specifications are met, the impact is assessed under QRM, and the QP is satisfied there is no adverse impact on quality, safety or efficacy.", tags: ["all"] },
  { id: "ICH-Q7", body: "ICH / PIC/S Part II", doc: "ICH Q7 GMP for APIs (PIC/S PE 009 Part II)", clause: "2.16; 11.15", text: "Any deviation from established procedures should be documented and explained. Critical deviations should be investigated and the investigation and its conclusions documented (2.16). OOS results should be investigated and documented according to a procedure (11.15).", tags: ["all", "oos"] },
  { id: "ICH-Q9", body: "ICH", doc: "ICH Q9(R1) Quality Risk Management (2023)", clause: "Principles; Annex I tools", text: "Risk evaluation based on scientific knowledge and linked to patient protection; formality and documentation commensurate with the level of risk; manage subjectivity in risk scoring.", tags: ["all"] },
  { id: "ICH-Q10", body: "ICH", doc: "ICH Q10 Pharmaceutical Quality System", clause: "3.2.2 CAPA system", text: "A structured approach to investigation should be used with the objective of determining the root cause. Effort, formality and documentation should be commensurate with risk. CAPA effectiveness should be evaluated.", tags: ["all"] },
  { id: "CFR-211-192", body: "US FDA", doc: "21 CFR 211.192 Production record review", clause: "211.192", text: "Any unexplained discrepancy or failure of a batch or its components to meet specifications shall be thoroughly investigated, whether or not the batch has been distributed. The investigation shall extend to other batches of the same product and other products that may have been associated with the failure. A written record shall include the conclusions and follow-up.", tags: ["all"] },
  { id: "CFR-211-100", body: "US FDA", doc: "21 CFR 211.100 Written procedures; deviations", clause: "211.100(b)", text: "Written production and process control procedures shall be followed and documented at the time of performance. Any deviation shall be recorded and justified.", tags: ["mfg", "human", "doc", "time", "yield"] },
  { id: "CFR-211-22", body: "US FDA", doc: "21 CFR 211.22 Responsibilities of the quality control unit", clause: "211.22(a)", text: "The QCU reviews production records to assure that no errors have occurred or, if errors have occurred, that they have been fully investigated.", tags: ["all"] },
  { id: "CFR-211-25", body: "US FDA", doc: "21 CFR 211.25 Personnel qualifications", clause: "211.25(a)", text: "Personnel shall have the education, training and experience to perform their functions; training in CGMP shall be conducted by qualified individuals with sufficient frequency.", tags: ["human"] },
  { id: "CFR-211-68", body: "US FDA", doc: "21 CFR 211.67 / 211.68 Equipment cleaning, maintenance and automatic equipment", clause: "211.67, 211.68", text: "Equipment shall be cleaned and maintained at appropriate intervals; automatic, mechanical and electronic equipment shall be routinely calibrated, inspected or checked.", tags: ["equipment", "csv"] },
  { id: "CFR-211-103", body: "US FDA", doc: "21 CFR 211.103 Calculation of yield", clause: "211.103", text: "Actual yields and percentages of theoretical yield shall be determined at the conclusion of each appropriate phase of manufacturing.", tags: ["yield"] },
  { id: "CFR-211-125", body: "US FDA", doc: "21 CFR 211.125 / 211.130 Labeling issuance and packaging operations", clause: "211.125, 211.130", text: "Labeling materials issued shall be reconciled; discrepancies outside limits shall be investigated. Packaging operations shall prevent mix-ups.", tags: ["packproc", "packmat"] },
  { id: "CFR-211-111", body: "US FDA", doc: "21 CFR 211.111 Time limitations on production", clause: "211.111", text: "Time limits for the completion of each phase of production shall be established; deviations shall be justified and documented.", tags: ["time"] },
  { id: "FDA-OOS", body: "US FDA", doc: "Guidance: Investigating Out-of-Specification Test Results for Pharmaceutical Production (2006, Rev. 1 May 2022)", clause: "Phase I laboratory; Phase II full-scale", text: "An OOS result can be invalidated only with an assignable laboratory cause. Retesting and resampling must be justified and planned; averaging and 'testing into compliance' are not acceptable. A full-scale investigation covers manufacturing and other batches.", tags: ["oos", "qcna"] },
  { id: "FDA-QS", body: "US FDA", doc: "Guidance: Quality Systems Approach to Pharmaceutical CGMP Regulations (2006)", clause: "CAPA", text: "Investigations should determine root cause; CAPA should be verified for effectiveness.", tags: ["all"] },
  { id: "FDA-DI", body: "US FDA", doc: "Guidance: Data Integrity and Compliance with Drug CGMP, Questions and Answers (2018)", clause: "Audit trail review", text: "Audit trails of data relevant to the result should be reviewed; data must be attributable, legible, contemporaneous, original and accurate (ALCOA).", tags: ["csv", "oos", "doc"] },
  { id: "MHRA-DI", body: "UK MHRA", doc: "GXP Data Integrity Guidance and Definitions (March 2018)", clause: "ALCOA+", text: "Data governance should ensure data are complete, consistent and accurate throughout the lifecycle.", tags: ["doc", "csv", "oos"] },
  { id: "PICS-041", body: "PIC/S", doc: "PI 041-1 Good Practices for Data Management and Integrity (2021)", clause: "Data integrity", text: "Expectations for data governance, audit trail review and handling of data integrity failures.", tags: ["doc", "csv", "oos"] },
  { id: "WHO-986", body: "WHO", doc: "WHO TRS 986 Annex 2: GMP for pharmaceutical products, main principles (2014)", clause: "Quality management; deviations", text: "Deviations are recorded and investigated, with corrective and preventive actions.", tags: ["all"] },
  { id: "WHO-DEV", body: "WHO", doc: "WHO: Deviation handling and quality risk management (July 2013), as cited by SOPQA0015E", clause: "Deviation handling", text: "Risk-based classification of deviations and proportionate investigation.", tags: ["all"] },
];

/** References relevant to the selected scopes (general ones first). */
export function referencesFor(scopeIds = []) {
  const all = REFERENCES.filter((r) => r.tags.includes("all"));
  const specific = REFERENCES.filter((r) => !r.tags.includes("all") && r.tags.some((t) => scopeIds.includes(t)));
  return [...all, ...specific];
}

// Recurring inspection findings on deviation investigations (FDA 483s and warning
// letters, EU/PIC/S inspection reports). These are general themes, not citations
// of specific letters.
export const INSPECTION_FINDINGS = [
  { finding: "Root cause concluded as 'human error' or 'analyst error' without evidence that procedural, design or system causes were excluded.", fix: "Justify human error formally (impact questions 1–5, error type, conditions) and look for the system weakness that allowed it.", ref: "EU GMP Ch. 1 1.4(xiv); 21 CFR 211.192" },
  { finding: "Investigation not extended to other batches or products made with the same material, equipment or process.", fix: "State which batches/products were assessed and why others are not affected.", ref: "21 CFR 211.192" },
  { finding: "OOS invalidated or retested into compliance without an assignable laboratory cause.", fix: "Follow the phased OOS procedure; justify every retest; never average to hide an OOS.", ref: "FDA OOS Guidance; United States v. Barr Laboratories (1993)" },
  { finding: "CAPA limited to retraining, with no effectiveness check and recurrence of the same event.", fix: "Pair corrective and preventive actions with a measurable effectiveness criterion and a review date.", ref: "ICH Q10 3.2.2" },
  { finding: "Investigations not completed within the procedure's timeline, extensions without justification.", fix: "Respect the 30 working days, request extensions before the due date with a status update.", ref: "SOPQA0015E 10.4.3" },
  { finding: "Root cause 'not determined' closed without a risk assessment of the batch and of recurrence.", fix: "Initiate a QRM assessment (SOPQA0140/Onc) and record the most probable cause and the controls.", ref: "SOPQA0015E Note 08; ICH Q9(R1)" },
  { finding: "6M factors dismissed with statements ('equipment OK') rather than the data reviewed.", fix: "Cite the record, value, limit and date for each factor ruled out.", ref: "ICH Q10; EU GMP Ch. 1" },
  { finding: "Data in the investigation inconsistent with the source records (dates, values, conclusions).", fix: "Cross-check every number against the source; keep dates and conclusions consistent across forms.", ref: "MHRA DI 2018; PIC/S PI 041-1" },
  { finding: "Lack of trending, so recurring deviations are treated one by one.", fix: "Semi-annual trending by class, root cause, scope and department (SOPQA0015E 10.10).", ref: "ICH Q10; EU GMP Ch. 1 (PQR)" },
];

// QA0015E/Onc/AE08/02 "Exhibit": examples used to tell incidents from deviations.
export const EXHIBIT = [
  { category: "Documentation", incident: "Typos or formatting issues not affecting data integrity; discrepancies easily corrected from source documents; recoverable missing non-original documents.", deviation: "Errors in batch records or SOPs affecting CQAs/CPPs; unrecoverable loss of original data; incorrect entries that cannot be verified." },
  { category: "Manufacturing", incident: "Minor EM excursions within acceptable limits; calibration delays on equipment not in use; slight variations of non-critical parameters.", deviation: "OOS results; yield outside limits; labeling mix-ups; unexpected equipment malfunctions or SOP deviations that could compromise quality." },
  { category: "Quality Control", incident: "Small lab errors not impacting results; temporary malfunction of non-essential lab equipment; sample handling deviations corrected immediately.", deviation: "Testing deviations affecting validity; calculation errors on critical results; incorrect interpretation of results." },
  { category: "Automated systems", incident: "Low-level alerts with no product impact; short unplanned downtime of non-critical systems.", deviation: "Critical alarms (HVAC, critical equipment); system failures during production affecting critical controls." },
  { category: "Environmental controls", incident: "Brief excursions within acceptable ranges; humidity deviations corrected promptly.", deviation: "Temperature excursions beyond limits affecting stability; HVAC failures giving uncontrolled conditions." },
  { category: "Training", incident: "Missed session rescheduled before critical tasks; minor gaps without non-compliance.", deviation: "Inadequate training leading to errors or SOP non-compliance." },
  { category: "Packaging", incident: "Minor errors caught before release; deviations not affecting identification, stability or compliance.", deviation: "Labeling errors (identity, expiry, batch); incorrect packaging material or configuration." },
  { category: "Cleaning & sanitization", incident: "Minor delays in routine cleaning; minor deviations corrected promptly.", deviation: "Incomplete cleaning; deviation from validated cleaning processes." },
];
