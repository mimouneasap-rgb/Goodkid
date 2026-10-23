// Reference knowledge used across the app: controlled vocabularies for the
// editors, the QMS metric catalogue (from the site's Quality Metrics Report),
// the GMP / ICH / PIC/S / ISPE QA-activity register, the 5S checklist and the
// APQR section list. Nothing here is site data.

// ---------- controlled vocabularies (predefined lists in every editor) ----------
export const VOCAB = {
  statuses: ["Open", "Overdue", "Completed", "Canceled"],
  departments: ["Engineering", "HSE", "IT", "Maintenance", "Manufacturing", "Packaging", "Procurement", "Quality Assurance", "Quality Control", "R&D", "Regulatory Affairs", "Supply Chain", "Validation and Qualification", "Warehouse", "Marketing"],
  rootCauses: ["Equipment related", "Material or Product related", "Procedure or instructions related", "Human Error", "Supply Chain issues", "production planning issue", "Facility / utility related", "Method / analytical related", "Environment related", "Under investigation"],
  ccStages: ["Open", "In Review", "QA Initial Approval", "Action Implementation", "Closed", "Canceled"],
  capaStages: ["Open", "In Review", "Action Implementation", "Effectiveness Check", "Completed", "Canceled"],
  qeStages: ["Open", "Investigation", "RCA and CAPA Planning", "QA Approval", "Completed", "Canceled"],
  findStages: ["Pending Response", "CAPA Planning", "Completed"],
  actionStages: ["In Progress", "QA Approval", "Completed", "Closed", "Canceled"],
  classes: ["Minor", "Major", "Critical"],
  qeClasses: ["Minor", "Major", "Critical", "Incident"],
  ccScopes: ["Product", "Equipment", "Packaging Material", "Raw Material", "Facility", "Documents", "System", "Standard Instrument/ Standard Weight", "Service Provider/Service"],
  ccCategories: ["Permanent", "Temporary"],
  capaSources: ["Audit Findings", "Standalone", "Quality Event", "APQR", "Complaint", "Management Review", "Self-inspection", "Risk Assessment"],
  findingTypes: ["Equipment and Facilities", "Documentation", "Data Integrity", "Material", "Production", "Quality Control", "Safety", "Training", "Process", "Other"],
  auditedAreas: ["Manufacturing", "Production, Secondary Packaging, Blister", "Quality Control, Microbiology", "Warehouse", "Engineering", "Validation", "IT Infrastructure", "Quality Assurance", "HSE"],
  actionTags: ["Document Revision", "Issue new document", "Update a Current Document", "Document Issuance", "Training", "Procure New Equipment", "Maintenance Activity", "Validation / Qualification", "ERP issue", "Other"],
  yesNo: ["Yes", "No"],
  yn: ["Y", "N"],
  grades: ["A", "B", "C", "D", "CNC"],
  criticality: ["High", "Medium", "Low"],
  qualification: ["DQ", "IQ", "OQ", "PQ", "Qualified", "In progress", "Not started", "Requalification due"],
  registers: ["AR001", "AR004", "AR005", "AR009", "AR010", "AR011", "AR013"],
  sopDepts: ["CM", "EN", "GS", "HSE", "PR", "QA", "QC", "RD", "SC", "VL", "WH"],
  sopSites: ["Oncology", "General", "Shared"],
  languages: ["EN", "FR", "EN/FR"],
  formTypes: ["Logbook", "Form", "Checklist", "Template"],
  improvementStages: ["Idea", "Assessed", "In progress", "Done"],
  benefits: ["Primary containment", "Mechanical & residue transfer", "Occupational exposure", "Loss of containment", "Personnel flow", "Compliance", "Efficiency", "Data integrity"],
  owners: ["Production", "Quality Assurance", "EHS", "Engineering", "IT", "Validation", "Quality Control", "Warehouse", "R&D"],
  approvalActions: ["Submitted", "Approved", "Rejected"],
  trainingTypes: ["SOP", "GMP", "HSE", "Quality system", "Technical", "Other"],
  trainingStatus: ["Planned", "Completed", "Rescheduled", "Cancelled"],
  effectiveness: ["Effective", "Not effective", "Pending", "Not required"],
  attendeeGroups: ["QA Documentation Officer / QA Documentation Senior Officer / QA Documentation Supervisor / QA Documentation Section Head / QA Officer / QA Senior officer / QA Section Head", "All oncology staff", "Production operators", "QC analysts", "Engineering technicians", "Warehouse staff"],
  calCategories: ["Equipment", "Instrument", "Balance", "Room / area", "Data logger", "Utility"],
  calFrequencies: [1, 3, 6, 12, 24],
  calIntervals: ["±01 Month", "±15 days", "±07 days"],
  calResults: ["Pass", "Pass after adjustment", "Fail", "Out of service"],
  valScopes: ["Utility", "Equipment", "Facility", "Computerized system", "Process", "Cleaning"],
  valCategories: ["HVAC System", "Monitoring Compressed air", "Mapping Study", "Requalification", "Mapping Studies", "Purified water", "Computerized system periodic review", "Cleaning validation", "Process validation"],
  valStatus: ["Planned", "In progress", "Completed", "Postponed", "Cancelled"],
  apiGrades: ["EP", "USP", "BP", "In-house", "Registration file"],
  supplierStatus: ["Approved", "Conditionally approved", "Under evaluation", "Disqualified"],
  auditTypes: ["On-site audit", "Paper audit (questionnaire)", "Remote audit", "Third-party audit"],
  wipSteps: ["PESEE", "GRANULATION", "SECHAGE", "CALIBRAGE", "MELANGE", "COMPRESSION", "MISE EN GELLULE", "PELLICULAGE", "BLISTER", "CONDITIONNEMENT PRIMAIRE", "CONDITIONNEMENT SECONDAIRE", "RETOUR VRAC", "REPROCESSING NON CONFORME", "ECHEC COMPRESSION", "QUARANTAINE PF"],
  wipStatus: ["In process", "Waiting blistering", "Waiting packaging", "On hold", "Under investigation", "Under Rejection", "CONFORME", "Released to next step"],
  responsibilities: ["Production", "RD", "QA", "QC", "Warehouse", "Engineering", "PRODUCTION", "REJECTION IN PROGRESS"],
  rejectionStatus: ["IN PROGRESS", "APPROVED", "DESTROYED", "CANCELLED"],
  batchPurpose: ["Registration", "Comercial", "Development", "Clinical"],
  batchScale: ["Pilote", "Industrial"],
  batchType: ["Validation", "Routine", "Reprocessing"],
  batchStatus: ["In manufacturing", "Manufactured", "Packed", "Released", "Rejected", "On hold", "Stability only"],
  apqrStatus: ["Planned", "Batches selection", "Data collection", "Statistical analysis", "CAPA planning", "Final review", "Approved", "Overdue"],
  fivesStatus: ["Open", "In progress", "Closed"],
  riskClasses: ["Critical", "High", "Medium", "Low"],
  fivesFrequencies: ["Weekly", "Bi-weekly", "Monthly", "Quarterly"],
  priorities: ["Critical", "High", "Medium", "Low"],
  fivesCategories: ["Sort", "Set", "Shine", "Standardize", "Sustain"],
  dosageForms: ["Tablets", "Hard Capsule", "Semi Solid", "Liquid/Syrup", "Injectable"],
  apqrDepartments: ["QA", "QC", "Production", "RA", "Validation", "CM"],
  apqrStreams: ["APQR Workflow", "QA", "Change Management", "Supplier", "QC", "IPC", "Process", "RA", "Validation"],
  apqrStages: ["Batches Selection", "Data Collection", "Collecting Data", "Data Review", "CAPA Planning", "Final Review", "Completed", "Closed"],
  apqrTaskStatus: ["Open", "Overdue", "Completed", "Closed (inferred)"],
  apqrSectionStatus: ["Not started", "In progress", "Complete", "Not applicable"],
  capaDecision: ["Yes", "No", "Not yet decided"],
  units: ["kg", "g", "units", "blisters", "boxes"],
};

// ---------- QMS metrics (Quality Metrics Report, SOPGS0010/Onc) ----------
// dir: "max" = higher is better (NLT), "min" = lower is better (NMT), "zero" = target 0.
// src: "auto" (computed from app data) or "manual" (entered per quarter on the QMS metrics page).
// unit: "%" ratio shown as percent, "n" count, "d" days.
export const METRICS = [
  { id: "dev_total", group: "Deviation", name: "Total deviation rate", target: 0.225, dir: "min", unit: "%", src: "auto", def: "Deviations opened ÷ batches manufactured in the period" },
  { id: "dev_critical", group: "Deviation", name: "Critical deviation rate", target: 0.001, dir: "min", unit: "%", src: "auto", def: "Critical deviations ÷ batches manufactured" },
  { id: "dev_major", group: "Deviation", name: "Major deviation rate", target: 0.05, dir: "min", unit: "%", src: "auto", def: "Major deviations ÷ batches manufactured" },
  { id: "dev_repeat", group: "Deviation", name: "Repeated deviation rate", target: 0.05, dir: "min", unit: "%", src: "auto", def: "Deviations repeating the root cause of a deviation in the previous 12 months ÷ deviations" },
  { id: "dev_ontime", group: "Deviation", name: "Deviations closed on time", target: 0.9, dir: "max", unit: "%", src: "auto", def: "Deviations closed by their due date ÷ deviations closed in the period" },
  { id: "batch_accept", group: "Batch acceptance", name: "Batch acceptance rate", target: 0.98, dir: "max", unit: "%", src: "auto", def: "Batches manufactured and not rejected ÷ batches manufactured" },
  { id: "rft", group: "Right first time", name: "Right first time (RFT)", target: 0.987, dir: "max", unit: "%", src: "auto", def: "Batches without deviation, OOS or rejection ÷ batches manufactured" },
  { id: "em_alert", group: "Environmental monitoring", name: "EM excursions above alert limits", target: 0, dir: "zero", unit: "n", src: "manual", def: "Number of EM results above alert limits" },
  { id: "em_action", group: "Environmental monitoring", name: "EM excursions above action limits", target: 0, dir: "zero", unit: "n", src: "manual", def: "Number of EM results above action limits" },
  { id: "capa_ontime", group: "CAPA", name: "CAPA completed on time", target: 0.95, dir: "max", unit: "%", src: "auto", def: "CAPAs completed by their due date ÷ CAPAs completed in the period" },
  { id: "capa_eff", group: "CAPA", name: "CAPA effectiveness rate", target: 0.95, dir: "max", unit: "%", src: "manual", def: "CAPAs judged effective ÷ effectiveness checks performed" },
  { id: "pqr_ontime", group: "Product quality review", name: "PQR completed on time", target: 0.95, dir: "max", unit: "%", src: "auto", def: "APQRs approved by their report due date ÷ APQRs due in the period" },
  { id: "apqr_tasks_ontime", group: "Product quality review", name: "APQR data-collection tasks on time", target: 0.9, dir: "max", unit: "%", src: "auto", def: "APQR workflow tasks closed by their due date ÷ APQR tasks closed in the period" },
  { id: "oos_release", group: "OOS / OOT", name: "Confirmed OOS rate – bulk & release", target: 0.004, dir: "min", unit: "%", src: "manual", def: "Confirmed OOS ÷ release and bulk tests" },
  { id: "oos_stab", group: "OOS / OOT", name: "Confirmed OOS rate – stability", target: 0.004, dir: "min", unit: "%", src: "manual", def: "Confirmed stability OOS ÷ stability tests" },
  { id: "oos_invalid", group: "OOS / OOT", name: "Unconfirmed / invalidated OOS rate", target: 0.0005, dir: "min", unit: "%", src: "manual", def: "Invalidated OOS ÷ total tests" },
  { id: "oot", group: "OOS / OOT", name: "Confirmed OOT rate", target: 0.01, dir: "min", unit: "%", src: "manual", def: "Confirmed OOT ÷ stability tests" },
  { id: "qc_rm_backlog", group: "QC backlog", name: "Raw & packaging material backlog", target: 0.01, dir: "min", unit: "%", src: "manual", def: "Lots pending analysis beyond lead time ÷ lots received" },
  { id: "qc_stab_backlog", group: "QC backlog", name: "Stability backlog (withdrawn points)", target: 0.01, dir: "min", unit: "%", src: "manual", def: "Stability points not tested on time ÷ points withdrawn" },
  { id: "complaint_rate", group: "Complaints & recalls", name: "Total complaint rate", target: 0.0002, dir: "min", unit: "%", src: "manual", def: "Product complaints ÷ batches (or units) distributed" },
  { id: "complaint_critical", group: "Complaints & recalls", name: "Critical complaints", target: 0, dir: "zero", unit: "n", src: "manual", def: "Critical complaints received" },
  { id: "recall_events", group: "Complaints & recalls", name: "Recall events", target: 0, dir: "zero", unit: "n", src: "manual", def: "Recall events" },
  { id: "recall_batches", group: "Complaints & recalls", name: "Recalled batches", target: 0, dir: "zero", unit: "n", src: "manual", def: "Batches recalled" },
  { id: "claims_ontime", group: "Supplier claims", name: "Supplier claims completed on time", target: 0.93, dir: "max", unit: "%", src: "manual", def: "Supplier claims closed on time ÷ claims due" },
  { id: "oos_incoming", group: "Supplier claims", name: "Confirmed OOS rate – incoming material", target: 0.001, dir: "min", unit: "%", src: "manual", def: "Confirmed OOS on incoming lots ÷ lots tested" },
  { id: "ha_notifications", group: "Health authority", name: "Health-authority notifications", target: 0, dir: "zero", unit: "n", src: "manual", def: "Field alerts / notifications to the authority" },
  { id: "ha_warnings", group: "Health authority", name: "Health-authority warnings", target: 0, dir: "zero", unit: "n", src: "manual", def: "Warning letters / injunctions" },
  { id: "inspection_pass", group: "Inspections & audits", name: "Inspection / audit passing rate", target: 1, dir: "max", unit: "%", src: "manual", def: "Inspections and audits passed ÷ held" },
  { id: "audit_internal", group: "Inspections & audits", name: "Internal audits completed on time", target: 1, dir: "max", unit: "%", src: "manual", def: "Self-inspections completed as planned ÷ planned" },
  { id: "audit_external", group: "Inspections & audits", name: "External (supplier) audits completed on time", target: 1, dir: "max", unit: "%", src: "manual", def: "Supplier audits completed ÷ planned" },
  { id: "find_ontime", group: "Inspections & audits", name: "Audit findings closed on time", target: 0.9, dir: "max", unit: "%", src: "auto", def: "Audit findings completed by their due date ÷ findings completed in the period" },
  { id: "sop_ontime", group: "SOPs", name: "SOPs reviewed on time", target: 0.98, dir: "max", unit: "%", src: "auto", def: "SOPs with a review date that are not overdue ÷ SOPs with a review date" },
  { id: "sop_overdue", group: "SOPs", name: "Overdue SOPs", target: 0, dir: "zero", unit: "n", src: "auto", def: "SOPs past their review date at period end" },
  { id: "cc_actions_ontime", group: "Change control", name: "Change-control actions completed on time", target: 0.85, dir: "max", unit: "%", src: "auto", def: "CC actions completed by their end date ÷ CC actions completed in the period" },
  { id: "cc_ontime", group: "Change control", name: "Change controls closed on time", target: 0.85, dir: "max", unit: "%", src: "auto", def: "Change controls closed by their due date ÷ closed in the period" },
  { id: "vmp", group: "Validation master plan", name: "Validation master plan execution", target: 0.9, dir: "max", unit: "%", src: "auto", def: "Requalifications completed ÷ requalifications planned up to period end" },
  { id: "cal_compliance", group: "Validation master plan", name: "Calibration program compliance", target: 0.95, dir: "max", unit: "%", src: "auto", def: "Calibrations recorded as done ÷ calibrations planned up to period end" },
  { id: "gmp_training", group: "Training", name: "GMP training rate", target: 1, dir: "max", unit: "%", src: "auto", def: "GMP / HSE trainings completed ÷ planned up to period end" },
  { id: "training_plan", group: "Training", name: "Annual training plan execution", target: 0.85, dir: "max", unit: "%", src: "auto", def: "Planned trainings completed ÷ planned up to period end" },
  { id: "quality_circle", group: "Training", name: "Quality circles held", target: 1, dir: "max", unit: "n", src: "manual", def: "Quality circle meetings held in the period" },
  { id: "ct_production", group: "Batch cycle time", name: "Production review (days)", target: 3, dir: "min", unit: "d", src: "auto", def: "Mean days from end of manufacturing to BMR hand-over" },
  { id: "ct_packaging", group: "Batch cycle time", name: "Packaging review (days)", target: 3, dir: "min", unit: "d", src: "auto", def: "Mean days from end of packaging to BPR hand-over" },
  { id: "ct_qc", group: "Batch cycle time", name: "QC release (days)", target: 5, dir: "min", unit: "d", src: "manual", def: "Mean days from sampling to QC release" },
  { id: "ct_qa", group: "Batch cycle time", name: "QA release (days)", target: 5, dir: "min", unit: "d", src: "auto", def: "Mean days from BPR hand-over to physical / ERP release" },
  { id: "batch_review_rft", group: "Batch cycle time", name: "Batch review right first time", target: 0.9, dir: "max", unit: "%", src: "manual", def: "Batch records reviewed without correction ÷ reviewed" },
  { id: "risk_review", group: "Risk management", name: "Risk assessments reviewed on time", target: 1, dir: "max", unit: "%", src: "manual", def: "Risk assessment reports reviewed on time ÷ due" },
  { id: "fives", group: "5S & workplace", name: "5S weekly audit score", target: 0.85, dir: "max", unit: "%", src: "auto", def: "Mean 5S audit score in the period" },
  { id: "wip_hold", group: "5S & workplace", name: "WIP lots beyond hold time", target: 0, dir: "zero", unit: "n", src: "auto", def: "WIP lots whose hold-time limit has passed at period end" },
];
export const METRIC_GROUPS = [...new Set(METRICS.map((m) => m.group))];

// ---------- GMP QA activity register ----------
// freq: months between occurrences (0.25 = weekly, 0 = per event / continuous). link: activity whose last date the app derives itself.
export const QA_ACTIVITIES = [
  ["QA-01", "Management review of the pharmaceutical quality system", "Pharmaceutical quality system", "ICH Q10 §4.1–4.2; EU GMP Ch.1.6; PIC/S PE 009 Ch.1", 6, "review"],
  ["QA-02", "Quality metrics report (QMS KPIs)", "Pharmaceutical quality system", "ICH Q10 §4.1, Annex 2; SOPGS0010/Onc", 3, "metrics"],
  ["QA-03", "Quality manual / site master file review", "Pharmaceutical quality system", "EU GMP Ch.1.3, Ch.4.5; PIC/S PE 008 (SMF)", 12, null],
  ["QA-04", "Product quality review (APQR) per product", "Product quality", "EU GMP Ch.1.10; ICH Q7 §2.5; 21 CFR 211.180(e)", 12, "apqr"],
  ["QA-05", "Continued / ongoing process verification", "Product quality", "EU GMP Annex 15 §5.28–5.32; ICH Q8(R2); ICH Q12", 12, null],
  ["QA-06", "Batch record review and certification / release", "Product quality", "EU GMP Annex 16; Ch.1.4(xv); Ch.4.20–4.21", 0, "batches"],
  ["QA-07", "Stability programme review and trending", "Product quality", "ICH Q1A(R2); EU GMP Ch.6.23–6.33", 6, null],
  ["QA-08", "Deviation management and trending", "Quality events", "EU GMP Ch.1.4(xiv), Ch.8; ICH Q10 §3.2.2", 1, "deviations"],
  ["QA-09", "CAPA effectiveness checks", "Quality events", "ICH Q10 §3.2.2; EU GMP Ch.1.4(xii)", 1, "capa"],
  ["QA-10", "Change-control board review", "Quality events", "ICH Q10 §3.2.3; EU GMP Annex 15 §11; ICH Q12", 1, "cc"],
  ["QA-11", "OOS / OOT investigations review", "Quality events", "EU GMP Ch.6.35; MHRA OOS guidance; FDA OOS guidance", 1, null],
  ["QA-12", "Complaint handling review", "Quality events", "EU GMP Ch.8.1–8.15", 3, null],
  ["QA-13", "Mock recall exercise", "Quality events", "EU GMP Ch.8.30 (effectiveness of recall arrangements)", 12, null],
  ["QA-14", "Self-inspection programme (all GMP areas)", "Audits & suppliers", "EU GMP Ch.9; PIC/S PE 009 Ch.9; ICH Q10 §2.6", 12, "audits"],
  ["QA-15", "Supplier / API manufacturer audits", "Audits & suppliers", "EU GMP Ch.5.29; ICH Q7 §13; EU GMP Part II", 36, "suppliers"],
  ["QA-16", "Approved supplier list re-evaluation", "Audits & suppliers", "EU GMP Ch.5.27–5.28; Ch.7 (outsourced activities)", 12, "suppliers"],
  ["QA-17", "Technical / quality agreements review", "Audits & suppliers", "EU GMP Ch.7.13–7.15", 24, null],
  ["QA-18", "Training needs analysis and annual training plan", "People", "EU GMP Ch.2.10–2.14; ICH Q10 §2.6", 12, "training"],
  ["QA-19", "GMP refresher and HSE periodic training", "People", "EU GMP Ch.2.11–2.13", 12, "training"],
  ["QA-20", "Training effectiveness evaluation", "People", "EU GMP Ch.2.11; ICH Q10 §2.6", 6, "training"],
  ["QA-21", "Gowning qualification of operators (OEB 4–5 areas)", "People", "EU GMP Ch.2.15–2.21; ISPE Risk-MaPP", 12, null],
  ["QA-22", "Weekly 5S / housekeeping QA walk", "Premises & equipment", "EU GMP Ch.3.1–3.2; site 5S standard", 0.25, "fives"],
  ["QA-23", "Calibration programme execution", "Premises & equipment", "EU GMP Ch.3.41; ISPE GPG Calibration Management", 1, "calibration"],
  ["QA-24", "Equipment requalification / periodic review", "Qualification & validation", "EU GMP Annex 15 §4.1–4.4; ISPE Baseline Guide Vol.5 (C&Q)", 12, "validation"],
  ["QA-25", "HVAC requalification and monitoring", "Qualification & validation", "EU GMP Annex 15; ISPE Good Practice Guide: HVAC", 12, "validation"],
  ["QA-26", "Compressed air / utilities requalification", "Qualification & validation", "EU GMP Annex 15; ISPE Good Practice Guide: Process Gases", 12, "validation"],
  ["QA-27", "Temperature mapping of storage areas and equipment", "Qualification & validation", "EU GMP Ch.3.19; WHO TRS 961 Annex 9; USP <1079>", 12, "validation"],
  ["QA-28", "Validation master plan review", "Qualification & validation", "EU GMP Annex 15 §2.5; PIC/S PI 006", 12, "validation"],
  ["QA-29", "Cleaning validation status and HBEL / PDE review", "Contamination control", "EU GMP Annex 15 §10; Ch.3.6, Ch.5.17–5.22; EMA HBEL guideline", 12, null],
  ["QA-30", "Cross-contamination risk assessment (shared / dedicated equipment)", "Contamination control", "EU GMP Ch.5.18–5.21; ISPE Baseline Guide Risk-MaPP (2nd ed.)", 12, "fmea"],
  ["QA-31", "Containment verification (SMEPAC / isolator integrity)", "Contamination control", "ISPE Good Practice Guide: Assessing the Particulate Containment Performance (SMEPAC)", 12, null],
  ["QA-32", "Environmental monitoring and pressure-cascade trend review", "Contamination control", "EU GMP Ch.3.12; ISPE Good Practice Guide: HVAC", 1, null],
  ["QA-33", "Pest control programme review", "Contamination control", "EU GMP Ch.3.4", 3, null],
  ["QA-34", "Computerized system periodic review", "Data integrity", "EU GMP Annex 11 §11; ISPE GAMP 5 (2nd ed.)", 12, null],
  ["QA-35", "Audit-trail review", "Data integrity", "EU GMP Annex 11 §9; PIC/S PI 041", 1, null],
  ["QA-36", "Backup / restore verification", "Data integrity", "EU GMP Annex 11 §7.2; ISPE GAMP 5", 12, null],
  ["QA-37", "Data-integrity risk assessment (ALCOA+)", "Data integrity", "PIC/S PI 041; MHRA GxP Data Integrity Guidance", 12, null],
  ["QA-38", "SOP periodic review", "Documentation", "EU GMP Ch.4.5; ICH Q10 §2.5", 1, "sops"],
  ["QA-39", "Logbook and form control review", "Documentation", "EU GMP Ch.4.31–4.32", 3, null],
  ["QA-40", "Retention / reference sample management and visual check", "Materials & products", "EU GMP Annex 19", 12, null],
  ["QA-41", "Starting-material sampling programme review", "Materials & products", "EU GMP Annex 8; Ch.5.30–5.36", 12, null],
  ["QA-42", "Hold-time and WIP status review", "Materials & products", "EU GMP Ch.5.39–5.41; ICH Q7 §8.2", 0.25, "wip"],
  ["QA-43", "Rejected / returned material disposition", "Materials & products", "EU GMP Ch.5.61–5.65", 1, "wip"],
  ["QA-44", "Quality risk management review (FMEA update)", "Risk management", "ICH Q9(R1); EU GMP Ch.1.12–1.13", 12, "fmea"],
  ["QA-45", "Inspection readiness review", "Pharmaceutical quality system", "SOPCM0011/Onc; PIC/S PE 009", 6, null],
  ["QA-46", "Quality culture / quality circle meetings", "People", "ICH Q10 §2.1; SOPGS0011/Onc", 3, null],
];

// ---------- SOPs governing each part of the app ----------
// [id, English, French, words in an SOP title that make it a governing procedure for that topic]
export const SOP_TOPICS = [
  ["review", "Management review", "Revue de direction", /management review|revue de direction/i],
  ["metrics", "Quality metrics", "Indicateurs qualité", /quality metrics|mesure du syst[eè]me qualit|kpi/i],
  ["pqs", "Quality system & site master file", "Système qualité et SMF", /quality unit|site master file|quality manual|manuel qualit/i],
  ["deviations", "Deviations / quality events", "Déviations / événements qualité", /quality events?|deviation|d[ée]viation/i],
  ["oos", "OOS / OOT", "OOS / OOT", /out of specification|out of trend|\boos\b|\boot\b/i],
  ["capa", "CAPA", "CAPA", /corrective action|preventive action|\bcapa\b/i],
  ["cc", "Change control", "Maîtrise des changements", /change control|\bccr\b|ma[iî]trise des changements/i],
  ["audits", "Audits & self-inspection", "Audits et auto-inspection", /internal audit|self.?inspection|audit interne|inspection readiness/i],
  ["complaints", "Complaints", "Réclamations", /complaint|r[ée]clamation|plainte/i],
  ["recall", "Recall", "Rappel", /\brecall\b|rappel/i],
  ["apqr", "Product quality review (APQR)", "Revue qualité produit (RQP)", /product quality review|\bapqr\b|\bpqr\b/i],
  ["batches", "Batch records & release", "Dossiers de lot et libération", /batch record|batch assessment|release|lib[ée]ration|dossiers? de lots?|numbering|repackaging|in.process.control|\bipc\b/i],
  ["lifecycle", "Product lifecycle & technology transfer", "Cycle de vie produit et transfert", /technology transfer|transfert de technologie|process validation prerequisites/i],
  ["wip", "Hold times, rework & reprocessing", "Délais, retraitement", /time frame|hold.?time|rework|reprocess/i],
  ["rejections", "Rejections", "Rejets", /\brejet|\breject/i],
  ["suppliers", "Suppliers & materials", "Fournisseurs et matières", /supplier|fournisseur|raw material|mati[eè]re premi[eè]re|reference samples|retest|specifications|quality agreement|technical agreement|r[ée]ception|reception of materials|articles de conditionnement|[ée]chantillonnage|outils de pr[ée]l[eè]vement|sampling activity/i],
  ["training", "Training", "Formation", /training|formation/i],
  ["gowning", "Containment, flows & gowning", "Confinement, flux et habillage", /habillage|gowning|hygi[eè]ne|protective equipment|containment|produits dangereux|highly potent|flux (personnel|mati[eè]res)|vide de (ligne|zone)|entr[ée]es et sorties/i],
  ["fives", "5S & housekeeping", "5S et rangement", /\b5s\b|housekeeping|nettoyage des (locaux|surfaces)|fr[ée]quences de nettoyage|cleaning of (the )?premises/i],
  ["calibration", "Calibration & metrology", "Étalonnage et métrologie", /calibration|calibrator|[ée]talonnage|v[ée]rification p[ée]riodique|m[ée]trolog|weights|instruments? de r[ée]f[ée]rence|balances?|operating procedure of|proc[ée]dure op[ée]ratoire|tachometer|flowmeter|d[ée]bitm[eè]tre|lux ?meter|punches/i],
  ["maintenance", "Preventive maintenance", "Maintenance préventive", /preventive maintenance|maintenance pr[ée]ventive/i],
  ["validation", "Qualification & validation", "Qualification et validation", /qualification|validation (practice|master|des temp|(du )?processus|du proc[ée]d[ée] de fabrication)|process validation|\burs\b|user requirement|acceptance (test|criteria)|\bfat\b|impact assessment|continued process verification|phasing.out|drawings/i],
  ["spc", "Statistical tools & trending", "Outils statistiques et tendances", /statistical|\btrend|tendance/i],
  ["cleaning", "Cleaning validation", "Validation du nettoyage", /cleaning (validation|analytical)|validation du proc[ée]d[ée] de nettoyage/i],
  ["environment", "Environmental monitoring & HVAC", "Surveillance environnementale et CTA", /hvac|temperature|humidity|humidit[ée]|pressure|particulate|airflow|air volume|hepa|compressed air|environment|cartographie|atmosph[eè]re|data logger|cleanroom|flux laminaire|water/i],
  ["csv", "Computerized systems & data integrity", "Systèmes informatisés et intégrité des données", /computeri[sz]ed|data integrity|int[ée]grit[ée] des donn[ée]es|audit trail|spreadsheet|excel|\bcsv\b/i],
  ["fmea", "Quality risk management", "Gestion du risque qualité", /quality risk|risk management|risk assessment|analyse de risque/i],
  ["sops", "Documents, SOPs & logbooks", "Documents, procédures et registres", /standard operating procedure|document control|document management|\bdms\b|archiv|logbook|signatures?|reference numbers|labell?ing|label/i],
  ["lab", "Laboratory practice", "Pratiques de laboratoire", /laboratory|laboratoire|analytical|method validation|stability|microbi|reagents|working standards|dissolution|columns|glassware|isolator|spectromet|ftir|incubator|pass.box|water bath|sampling|testing method|test method|\bstms?\b|quality control|operating and cleaning/i],
];
// Topics shown under each page header (route → topics)
export const ROUTE_TOPICS = {
  review: ["review", "pqs"], metrics: ["metrics"], dashboard: ["metrics"], deviations: ["deviations", "oos"], capa: ["capa"], cc: ["cc"], findings: ["audits"],
  actions: ["capa", "cc"], records: ["deviations", "capa", "cc"], products: ["batches"], lifecycle: ["batches", "lifecycle"], apqr: ["apqr", "spc"], wip: ["wip", "rejections"],
  suppliers: ["suppliers"], map: ["environment"], rooms: ["environment", "gowning"], equipment: ["calibration", "maintenance"], calibration: ["calibration", "maintenance"],
  validation: ["validation", "cleaning", "csv", "environment"], training: ["training"], fives: ["fives"], fmea: ["fmea"], improvements: ["capa"], quality: ["csv"], spc: ["spc"],
};
// GMP activity register → topics of its governing SOPs
export const ACTIVITY_TOPICS = {
  "QA-01": ["review"], "QA-02": ["metrics"], "QA-03": ["pqs"], "QA-04": ["apqr"], "QA-05": ["validation", "spc"], "QA-06": ["batches"], "QA-07": ["lab"], "QA-08": ["deviations"],
  "QA-09": ["capa"], "QA-10": ["cc"], "QA-11": ["oos"], "QA-12": ["complaints"], "QA-13": ["recall"], "QA-14": ["audits"], "QA-15": ["suppliers"], "QA-16": ["suppliers"],
  "QA-17": ["suppliers"], "QA-18": ["training"], "QA-19": ["training"], "QA-20": ["training"], "QA-21": ["gowning"], "QA-22": ["fives"], "QA-23": ["calibration"],
  "QA-24": ["validation"], "QA-25": ["environment"], "QA-26": ["environment"], "QA-27": ["environment"], "QA-28": ["validation"], "QA-29": ["cleaning"], "QA-30": ["cleaning"],
  "QA-31": ["gowning"], "QA-32": ["environment", "spc"], "QA-33": [], "QA-34": ["csv"], "QA-35": ["csv"], "QA-36": ["csv"], "QA-37": ["csv"], "QA-38": ["sops"], "QA-39": ["sops"],
  "QA-40": ["lab"], "QA-41": ["suppliers"], "QA-42": ["wip"], "QA-43": ["rejections"], "QA-44": ["fmea"], "QA-45": ["audits"], "QA-46": ["pqs"],
};

// ---------- 5S weekly QA audit checklist ----------
export const FIVES = [
  ["sort", "Sort (Seiri)", "Trier (Seiri)", [
    ["Only items needed for current operations are present", "Seuls les éléments nécessaires aux opérations en cours sont présents"],
    ["No obsolete documents, forms or labels in the area", "Aucun document, formulaire ou étiquette obsolète dans la zone"],
    ["No unused equipment, tools or materials", "Aucun équipement, outil ou matériel inutilisé"],
    ["Rejected / quarantine items segregated and identified", "Articles rejetés / en quarantaine séparés et identifiés"]]],
  ["order", "Set in order (Seiton)", "Ranger (Seiton)", [
    ["Every item has a defined, labelled location", "Chaque élément a un emplacement défini et étiqueté"],
    ["Status labels (clean, in use, calibration) present and current", "Étiquettes de statut (propre, en cours, étalonnage) présentes et à jour"],
    ["Floor markings and storage zones respected", "Marquages au sol et zones de stockage respectés"],
    ["Documents and logbooks at point of use and in order", "Documents et registres au poste de travail et en ordre"]]],
  ["shine", "Shine (Seiso)", "Nettoyer (Seiso)", [
    ["Floors, walls and ceilings clean and intact", "Sols, murs et plafonds propres et intacts"],
    ["Equipment surfaces clean, no product residue or powder", "Surfaces d’équipement propres, sans résidu ni poudre"],
    ["Cleaning logbooks completed and up to date", "Registres de nettoyage complétés et à jour"],
    ["Cytotoxic waste bins emptied, closed and identified", "Poubelles de déchets cytotoxiques vidées, fermées et identifiées"]]],
  ["standard", "Standardize (Seiketsu)", "Standardiser (Seiketsu)", [
    ["SOPs and visual standards displayed and current", "Procédures et standards visuels affichés et à jour"],
    ["Gowning and PPE comply with the area requirements", "Habillage et EPI conformes aux exigences de la zone"],
    ["Pressure differentials / HVAC readings within limits and recorded", "Différentiels de pression / relevés CTA dans les limites et enregistrés"],
    ["5S board and previous actions displayed", "Tableau 5S et actions précédentes affichés"]]],
  ["sustain", "Sustain (Shitsuke)", "Maintenir (Shitsuke)", [
    ["Previous audit actions closed on time", "Actions de l’audit précédent clôturées à temps"],
    ["Staff can explain the 5S standard of their area", "Le personnel sait expliquer le standard 5S de sa zone"],
    ["GMP records completed in real time (ALCOA+)", "Enregistrements BPF complétés en temps réel (ALCOA+)"],
    ["No repeat findings from the previous audit", "Aucune observation répétée de l’audit précédent"]]],
];
export const FIVES_ITEMS = FIVES.flatMap(([key, , , items]) => items.map(() => key));

// ---------- APQR content (EU GMP Ch.1.10, ICH Q7 §2.5, 21 CFR 211.180(e)) ----------
export const APQR_SECTIONS = [
  ["i", "Starting materials and packaging materials, especially from new sources; supply-chain traceability of APIs", "Matières premières et articles de conditionnement, notamment nouvelles sources ; traçabilité des PA"],
  ["ii", "Critical in-process controls and finished-product results (yields)", "Contrôles en cours critiques et résultats produit fini (rendements)"],
  ["iii", "Batches failing specification and their investigation", "Lots non conformes aux spécifications et leurs investigations"],
  ["iv", "Significant deviations and non-conformances, investigations and CAPA effectiveness", "Déviations et non-conformités significatives, investigations et efficacité des CAPA"],
  ["v", "Changes to processes or analytical methods", "Changements de procédés ou de méthodes analytiques"],
  ["vi", "Marketing-authorisation variations submitted, granted or refused", "Variations d’AMM soumises, accordées ou refusées"],
  ["vii", "Stability monitoring programme results and adverse trends", "Résultats du programme de stabilité et tendances défavorables"],
  ["viii", "Quality-related returns, complaints and recalls", "Retours, réclamations et rappels liés à la qualité"],
  ["ix", "Adequacy of previous corrective actions", "Adéquation des actions correctives précédentes"],
  ["x", "Post-marketing commitments (new authorisations and variations)", "Engagements post-AMM (nouvelles AMM et variations)"],
  ["xi", "Qualification status of relevant equipment and utilities (HVAC, water, compressed air)", "Statut de qualification des équipements et utilités (CTA, eau, air comprimé)"],
  ["xii", "Contractual / technical arrangements", "Accords contractuels / techniques"],
];

// ---------- 5S scoring ----------
// Area-specific checklists score each criterion 0–3; the generic checklist above uses the same scale for new audits.
export const FIVES_SCALE = [[0, "Non-compliant", "Non conforme"], [1, "Partial", "Partiel"], [2, "Compliant", "Conforme"], [3, "Exceeds", "Au-delà"]];
export const FIVES_RATINGS = [[0.9, "Excellent"], [0.75, "Good"], [0.6, "Acceptable"], [0, "Needs improvement"]];
export const fivesRating = (v) => (v == null ? null : FIVES_RATINGS.find(([min]) => v >= min)[1]);
// Risk class sets the audit frequency (critical areas weekly, high bi-weekly, medium monthly, low quarterly).
export const RISK_FREQUENCY = { Critical: "Weekly", High: "Bi-weekly", Medium: "Monthly", Low: "Quarterly" };
export const FREQUENCY_DAYS = { Weekly: 7, "Bi-weekly": 14, Monthly: 30, Quarterly: 91 };
// Days allowed to close a 5S finding by priority (critical: immediately).
export const PRIORITY_DAYS = { Critical: 1, High: 7, Medium: 30, Low: 90 };
/** Checklist category label ("Set", "Set in order", "Seiton"…) → 5S key. */
export function fivesKey(category) {
  const c = String(category ?? "").toLowerCase();
  return /sort|seiri|tri/.test(c) ? "sort" : /set|order|seiton|rang/.test(c) ? "order" : /shine|seiso|nettoy/.test(c) ? "shine" : /standard|seiketsu/.test(c) ? "standard" : /sustain|shitsuke|mainten/.test(c) ? "sustain" : null;
}

// ---------- APQR programme ----------
// Phases of an electronic APQR workflow, from the annual plan to the archived report. `stage` matches workflow stage names.
export const APQR_PHASES = [
  ["plan", "Annual plan", "Plan annuel", null],
  ["trigger", "Plan approved – review to trigger", "Plan approuvé – revue à déclencher", null],
  ["batches", "Batches selection", "Sélection des lots", /batch/i],
  ["data", "Departmental data collection & review", "Collecte et revue des données", /data|collect/i],
  ["stats", "Statistical analysis", "Analyse statistique", /statist|analysis/i],
  ["capa", "CAPA planning", "Planification CAPA", /capa/i],
  ["final", "Final committee review", "Revue finale du comité", /final|review committee|approval/i],
  ["closed", "Closed & archived", "Clôturée et archivée", /closed|complete|archiv/i],
];
// Data streams of an APQR workflow: owning department and the EU GMP Ch.1.10 sections they feed.
export const APQR_STREAMS = {
  "APQR Workflow": ["QA", "Owner workflow", []],
  QA: ["QA", "Deviations, CAPA, contracts, rejections", ["iv", "ix", "xii"]],
  "Change Management": ["QA", "Change controls", ["v"]],
  Supplier: ["QA", "Suppliers and starting materials", ["i"]],
  QC: ["QC", "Materials, results, OOS/OOT, stability", ["i", "ii", "iii", "vii"]],
  IPC: ["Production", "In-process controls", ["ii"]],
  Process: ["Production", "Batches and process parameters", ["ii"]],
  RA: ["RA", "Variations and post-marketing commitments", ["vi", "x"]],
  Validation: ["Validation", "Qualification, process and cleaning validation", ["xi"]],
  Complaints: ["CM", "Returns, complaints and recalls", ["viii"]],
};
// Process capability guidance (Cpk / Ppk).
export const CPK_GUIDE = [[1.33, "Capable", "Capable"], [1, "Monitor", "À surveiller"], [-Infinity, "Not capable – CAPA", "Non capable – CAPA"]];

