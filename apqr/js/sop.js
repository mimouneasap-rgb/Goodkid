// Reference content transcribed from the two governing procedures:
//   SOPQA0021E Rev. 16 "Product Quality Review" (effective 29/01/2025)
//   SOPQA0152E-01 "Scigeniq Annual Product Quality Review System Module"
// Kept separate from the logic so the wording can be updated when the SOPs are revised.

export const SOP_REFS = {
  pqr: { id: "SOPQA0021E", rev: "16", title: "Product Quality Review", effective: "2025-01-29", validity: "2028-01-29" },
  scigeniq: { id: "SOPQA0152E", rev: "01", title: "Scigeniq Annual Product Quality Review System Module" },
};

/** Departments as they appear in the Scigeniq export, with the annex code from SOPQA0021E §10.8.1. */
export const DEPARTMENTS = [
  { id: "QA", label: "Quality Assurance", annexCode: "QA", annex: "Annex 3", template: "QA0021E/TE05/01" },
  { id: "QC", label: "Quality Control", annexCode: "QC", annex: "Annex 2", template: "QA0021E/TE04/02" },
  { id: "Production", label: "Production", annexCode: "PR", annex: "Annex 1", template: "QA0021E/TE03/03" },
  { id: "RA", label: "Regulatory Affairs", annexCode: "RA", annex: "Annex 5", template: "QA0021E/TE07/02" },
  { id: "Validation", label: "Validation", annexCode: "VL", annex: "Annex 4", template: "QA0021E/TE06/01" },
];

/** Lifecycle of one product's APQR, following the SOPQA0152E phases. */
export const PHASES = [
  { id: "planned", label: "Planned", short: "Planned", sop: "Phase 1–2 · Plan approved, review not yet triggered" },
  { id: "batches", label: "Batches selection", short: "Batches", sop: "Phase 3 · Production lists all batches of the period" },
  { id: "collection", label: "Data collection & review", short: "Data", sop: "Phase 4 · Departments submit data; heads review" },
  { id: "statistics", label: "Statistical analysis", short: "Stats", sop: "Phase 5 · Cpk/Ppk and control charts interpreted" },
  { id: "capa", label: "CAPA planning", short: "CAPA", sop: "Phase 6 · Previous CAPA status and CAPA decision" },
  { id: "final", label: "Final review", short: "Review", sop: "Phase 7 · APQR committee approval" },
  { id: "closed", label: "Closed", short: "Closed", sop: "Phase 8 · Report exported and archived" },
];

/** APQR committee members who sign the final review (SOPQA0152E §5, Final APQR Approver). */
export const COMMITTEE = [
  "QA Manager", "QC Manager", "Validation Manager", "Compliance Manager", "RA Manager",
  "Quality Unit", "Technical Director",
];

/** SOPQA0021E §10.4.1: the data every APQR report must cover, with who supplies it. */
export const REQUIREMENTS = [
  { id: "1", title: "Manufactured batches", text: "List of all batches manufactured during the 12-month reporting period.", depts: ["Production"], annex: "Annex 1" },
  { id: "2", title: "Starting & packaging materials", text: "Batches of starting and packaging materials used and their approval status; supplier/manufacturer summary (2.1); supplier CoA results where release relies on them (2.2); significant deviations such as rejected vendor lots (2.3).", depts: ["QC"], annex: "Annex 2" },
  { id: "3", title: "Critical IPC & finished-product results", text: "Statistical analysis, trends and appropriateness of limits for in-process controls (3.1, Annex 1) and finished-product tests such as dissolution, impurities and assay (3.2, Annex 2). Statistical study per Annex 6.", depts: ["Production", "QC"], annex: "Annex 1, 2, 6" },
  { id: "4", title: "Out-of-specification batches", text: "All batches that failed specification and their investigations.", depts: ["QC"], annex: "Annex 2" },
  { id: "5", title: "Deviations & CAPA", text: "All significant (major or critical) deviations, investigations and CAPA effectiveness; deviations trended by cause (5.1); CAPA compilation (5.2).", depts: ["QA"], annex: "Annex 3" },
  { id: "6", title: "Changes", text: "Regulatory-relevant and other changes to processes (6.1) or analytical methods (6.2), and their impact on product quality (6.3).", depts: ["Validation"], annex: "Annex 4" },
  { id: "7", title: "Marketing authorisation variations", text: "Variations submitted, approved or refused, including third-country (export only) dossiers.", depts: ["RA"], annex: "Annex 5" },
  { id: "8", title: "Stability programme", text: "Stability monitoring results and adverse trends, with a statement reconfirming release/shelf-life specifications and test methods.", depts: ["QC"], annex: "Annex 2" },
  { id: "9", title: "Returns, complaints & recalls", text: "Quality-related returns, complaints and recalls, the investigations and the adequacy of CAPA.", depts: ["QA"], annex: "Annex 3" },
  { id: "10", title: "Previous corrective actions", text: "Adequacy of any previous process or equipment corrective actions.", depts: ["QA"], annex: "Annex 3" },
  { id: "11", title: "Post-marketing commitments", text: "For new marketing authorisations and variations, a review of post-marketing commitments.", depts: ["RA"], annex: "Annex 5" },
  { id: "12", title: "Equipment & utilities qualification", text: "Qualification status of relevant equipment and utilities (HVAC, water, compressed gases).", depts: ["Validation"], annex: "Annex 4" },
  { id: "13", title: "Contractual agreements", text: "Contractual agreements reviewed to ensure they are up to date.", depts: ["QA"], annex: "Annex 3" },
  { id: "14", title: "Summarised evaluation", text: "Statement on whether processes and product quality are appropriate and whether CAPA should be undertaken.", depts: ["Production", "QA", "Validation"], annex: "Report" },
];

export const REQUIREMENT_STATES = [
  { id: "", label: "Not started" },
  { id: "progress", label: "In progress" },
  { id: "done", label: "Complete" },
  { id: "na", label: "Not applicable" },
];

/** Sections of the report template QA0021E/TE01/11, mapped to the requirement that feeds each. */
export const REPORT_SECTIONS = [
  ["1", "Purpose", null], ["2", "Scope", null], ["3", "Manufacturing diagram", "1"],
  ["4", "Marketing authorization", "7"], ["5", "Post-marketing commitments", "11"],
  ["6", "Contractual agreements", "13"], ["7", "Review of starting and packaging materials", "2"],
  ["8", "Suppliers/manufacturers summary", "2"], ["9", "Manufactured batches", "1"],
  ["10", "Batches of API used in manufacturing", "1"], ["11", "Product and materials specifications", "2"],
  ["12", "Critical in-process control (IPC)", "3"], ["13", "Analytical results", "3"],
  ["14", "Stability and retention samples", "8"], ["15", "Change control", "6"],
  ["16", "Product returns", "9"], ["17", "Product complaints", "9"], ["18", "Product recalls", "9"],
  ["19", "Process validation", "6"], ["20", "Cleaning validation", "12"],
  ["21", "Equipment and utilities qualification status", "12"], ["22", "Environmental monitoring", "12"],
  ["23", "Reworking, reprocessing, recovery and repacking", "10"], ["24", "Rejects", "2"],
  ["25", "Out of specifications (OOS)", "4"], ["26", "Out of trends (OOT)", "4"], ["27", "CAPA", "5"],
  ["28", "Product GMP deviations", "5"], ["29", "Statistical analysis", "3"],
  ["30", "Recommendations and conclusions", "14"], ["31", "Related documents", null],
  ["32", "Distribution list", null],
];

/** SOPQA0021E attachment QA0021E/AE02/08: time limits of the process flow. */
export const PROCESS_FLOW = [
  { step: "Annual plan", who: "Quality department; approved by QA manager", limit: "First two weeks of the year", ref: "§10.3.9" },
  { step: "Annex data", who: "PR, RA, QC, QA and VL staff collect and prepare annexes per the annual plan", limit: "30 days from the start of the planned month", ref: "AE02/08" },
  { step: "Data approval", who: "Department managers review and approve collected data", limit: "Within the annex window", ref: "AE02/08" },
  { step: "Final report", who: "APQR officer compiles all data and runs the statistics when enough batches exist", limit: "90 days from the start of the planned month", ref: "AE02/08" },
  { step: "Committee", who: "APQR committee reviews and approves the conclusion", limit: "Within 3 months of the end of the reporting period", ref: "§10.3.6" },
  { step: "Approval & follow-up", who: "QA manager and delegates approve the final report and follow up CAPA", limit: "After committee approval", ref: "AE02/08" },
];

/** SOPQA0152E §10 Phase 5: interpretation of capability and control charts. */
export const CAPABILITY_GUIDE = [
  { band: "excellent", range: "Cpk > 1.33", label: "Excellent", meaning: "The process is highly capable and robust.", action: "No action required." },
  { band: "acceptable", range: "1.00 ≤ Cpk ≤ 1.33", label: "Acceptable", meaning: "Capable of meeting specifications but may be sensitive to shifts.", action: "Monitor closely; a monitoring recommendation may be included in the PQR conclusion." },
  { band: "poor", range: "Cpk < 1.00", label: "Not capable", meaning: "Not capable of consistently meeting specifications.", action: "CAPA is mandatory to investigate the root cause and improve the process." },
];

export const KEY_RULES = [
  { ref: "§10.2.1", text: "Reporting period is 12 consecutive months, repeating every year. Campaign manufacturing may extend it by up to 6 months." },
  { ref: "§10.3.5", text: "With fewer than 20 batches in the period, go back up to 6 months. If that is still not enough, leave the statistical evaluation out and include it in a later PQR." },
  { ref: "§10.3.6", text: "PQRs are completed (reviewed and approved) within 3 months after the end of the reporting period." },
  { ref: "§10.3.8", text: "The annual plan prioritises products with the most batches, problematic products and reworked/reprocessed products. Zero-batch and newly introduced products are included too." },
  { ref: "§10.3.9", text: "The annual plan is reviewed by the quality department and approved by the QA manager within the first two weeks of the year." },
  { ref: "§10.6", text: "Report number: APQR/<final product code>/<MMYY of the planned month>, e.g. APQR/TB114P01/0323." },
  { ref: "§10.8.1", text: "Annex number: <final product code>/<MMYY>/<department>, with PR, QC, QA, VL, RA and SR (statistical report)." },
  { ref: "§10.8.6", text: "The previous year's recommendations and their effectiveness are reviewed and reflected in the conclusion." },
];

/** SOPQA0152E §5 roles. */
export const ROLES = [
  { role: "APQR Owner", who: "Quality Assurance", duties: "Initiates, plans and manages the APQR end to end; assigns tasks and monitors progress; interprets statistics, assesses CAPA need and writes the conclusion." },
  { role: "APQR Plan Reviewer", who: "QA Manager or designee", duties: "Reviews and approves the annual plan: scope, product selection and data requirements." },
  { role: "Batch Selection", who: "Production", duties: "Lists every batch manufactured in the review period with batch size and final yield." },
  { role: "Data Collection Owners", who: "QA, QC, Compliance, Validation, Production, RA", duties: "Enter their department's data in Scigeniq and sign the Data Collection Form with a summary conclusion." },
  { role: "Data Reviewer", who: "Department head or designee", duties: "Reviews and approves the department's data for accuracy, completeness and integrity." },
  { role: "Final APQR Approver", who: "APQR committee (QA, QC, VL, CM, RA managers, Quality Unit, Technical Director)", duties: "Holistic review of the final report, trends, conclusions and CAPA; final approval signature closes the cycle." },
];
