// Column layouts of the tables added beyond the master workbook. Like schema.js
// these hold no records; data arrives through the importers or in-app editing.

const SCIG = ["Creation Date", "Type", "Stage", "Title", "Reference Id", "Status", "Closed", "Closing date", "Closed by", "Project", "Location", "Zone", "Asset", "Creating method", "Role", "Start Date", "End Date", "Assigned User", "Associated Users", "Critical Level", "Tags", "Created By", "Folders", "Parent action", "Duration"];

export const EXT_COLS = {
  // Scigeniq "Audit Findings" export
  find: [...SCIG, "Parent ID Reference", "Supplier Name", "Wait CAPA?", "Classification", "Finding Type", "Audited Areas"],
  // Scigeniq "Actions" exports (all-tasks and open-actions, merged by Reference Id); Folders dropped (it repeats the parent's)
  actions: ["Creation Date", "Type", "Stage", "Title", "Reference Id", "Status", "Closing date", "Location", "Role", "Start Date", "End Date", "Assigned User", "Tags", "Created By", "Parent action", "Parent ID Reference", "Description", "Parent Type", "Department", "Source", "Parent Parent Source"],
  // Annual department training plans (GS0024/Onc/T06)
  training: ["Training ID", "Program", "Reference", "Type", "Department", "Attendee group", "Planned month", "Status", "New", "Rescheduled to", "Completion date", "Trainer", "Planned attendees", "Trained attendees", "Effectiveness", "Comments"],
  // Annual / monthly calibration programs (VL0003E/Onc/FE03, FE01)
  calplan: ["Item", "Description", "Location", "Parent", "Category", "Duration", "Planned start", "Planned end", "Frequency (months)", "Interval", "Calibrated on", "Certificate", "Performed by", "Result", "Program", "Comment"],
  // Utility / equipment validation – periodic review – re-validation schedules (VL0002E/Onc/TE05–06)
  validation: ["Task ID", "Task", "Scope", "Category", "Equipment", "Frequency (years)", "Initial qualification", "Duration", "Planned start", "Planned finish", "Completion date", "Verified by", "Status", "Report ref", "Comment"],
  // Registered API list of manufacturers / suppliers (API/Onc)
  suppliers: ["API", "Grade", "CAS number", "Item code", "Manufacturer", "Plant address", "Supplier", "Finished product", "Registered", "Variation", "Change control", "Approval status", "Last audit", "Next audit", "Audit type", "Comment"],
  // Batch tracker (manufacturing → packaging → release)
  batches: ["Product", "Product code", "BMR no", "Purpose", "Scale", "Batch type", "PV ref", "Batch no", "Mfg date", "Exp date", "Start manufacturing", "End granulation", "Granulation yield", "Granulation hold limit", "Start compression", "End compression", "Compression yield", "Compression hold limit", "Start coating", "End coating", "Coating hold limit", "Manufacturing yield", "BMR handover", "Start packaging", "End packaging", "Packaging yield", "Physical release", "BPR handover", "Archiving", "ERP release", "Status", "Remark", "Change control", "OOS", "Deviation"],
  // WIP management (routine WIP lots)
  wip: ["S.N", "Product", "Batch", "Next step", "Status", "Mfg date", "Exp date", "Quantity", "Unit", "Deviation / CAPA", "Remark", "Responsibility", "Time frame", "Location", "Comment"],
  // Rejection reports in progress
  rejections: ["Report no", "Product", "Batch", "Item code", "Status", "Mfg date", "Exp date", "Quantity", "Unit", "Deviation / CAPA", "Reworks", "R&D recommendation", "QA comments", "Decision date"],
  // APQR record per product and period (conclusion, CAPA decision and approval)
  apqr: ["Product", "Period", "Period start", "Period end", "Due date", "Status", "Owner", "Approved on", "Report ref", "Conclusion", "Comment", "CAPA required", "Previous CAPA status"],
  // 5S QA audits. Scores: one value per checklist item ("-" = not applicable), comma separated, on a 0–Scale scale
  // (Scale 3 for the area-specific checklists; audits without a Scale use the 0–2 generic checklist). New columns go last.
  fives: ["Audit ID", "Week", "Date", "Area", "Auditor", "Scores", "Findings", "Actions", "Owner", "Due", "Action status", "Comment", "Supervisor", "Checklist", "Scale"],
  // 5S audit areas (risk class drives the audit frequency) and their area-specific checklists
  fivesAreas: ["Area", "Code", "Risk", "Frequency", "Key equipment", "Critical focus", "GMP requirements", "Common issues", "Rooms", "Owner"],
  fivesTpl: ["Area", "No", "Category", "Criterion"],
  // Items scored below compliant (or with an action) in a 5S audit, tracked to closure
  fivesItems: ["Audit ID", "Area", "No", "Category", "Criterion", "Score", "Comment", "Action", "Priority", "Owner", "Due", "Status", "Closed on"],
  // APQR programme: approved annual plan (QA0021E/TE02), the plan as entered in Scigeniq, and the Scigeniq APQR task export
  apqrPlan: ["Code", "Product", "Dosage form", "Planned month", "Previous report", "Period start", "Period end", "Comment"],
  apqrSys: ["Product", "Process", "Exec. year", "Site", "Review start", "Review end", "Period end", "Plan status"],
  // (Last seen: date of the latest Scigeniq export that listed the task; Comment is kept across re-imports)
  apqrTasks: ["Reference ID", "Product", "Dosage Form", "Site", "Department", "Data Stream", "Task Type", "Task Title", "Workflow Stage", "Status", "Assigned User", "Created", "Start", "Due", "Closed On", "Closure",
    "Critical level", "Created by", "Parent action", "Last seen", "Comment"],
  // SOP library: the workbook's columns, then the Drive file it is read from and what reading the SOP found
  // (Distribution: department codes; References: SOP codes it cites; Indexed: the Drive modified date that was read;
  // Folder: the current file's folder path; Revisions: every controlled revision found; Obsolete / Uncontrolled: copies found there;
  // Summary: the SOP's résumé as JSON — extracted by the app, or written by Claude; Forms: its forms, templates and attachments as JSON)
  sop: ["Code", "Title", "Department", "Site", "Language", "Type", "Status", "Revision", "Effective date", "Next review", "Owner", "Linked rooms", "Linked equipment", "Source",
    "Drive ID", "Drive file", "Drive modified", "Files", "Purpose", "Distribution", "References", "Change controls", "Indexed", "Folder", "Revisions", "Obsolete", "Uncontrolled",
    "Summary", "Forms"],
  // Controlled documents other than SOPs found in the Drive library (batch records, orders, specifications, test methods,
  // assessment records, registers, indexes…), one row per document code; Comment is kept across syncs
  docs: ["Code", "Type", "Title", "Product", "Strength", "Product code", "Department", "Site", "Language", "Revision", "Revisions", "Status", "Folder",
    "Drive ID", "Drive file", "Drive modified", "Files", "Obsolete", "Uncontrolled", "Comment"],
  // Entries of the master document indexes (IndXX/Onc-…) read from Drive: what QA lists as effective, with which revision and dates
  docIndex: ["Index", "Department", "Scope", "Year", "Code", "Revision", "Effective date", "Validity date", "Index file", "Read on"],
  // Google Drive folders the SOP library is synced from
  // (Folders: the folder tree found by the last sync, as JSON [[id, path], …], so searches reach every subfolder)
  sopSources: ["Folder", "Name", "Site", "Review years", "Last sync", "Files", "Comment", "Folders"],
  // Forms register: the workbook's columns, then corrections and additions made in the app (Owner SOP: the SOP the form
  // belongs to when its code does not say; Sections / Fields / Columns: one per line, "—" for none; Status "Removed" hides
  // a form wrongly found in an SOP file)
  forms: ["Form code", "Title", "Type", "Linked SOP", "Linked room", "Linked equipment", "Revision", "Status", "Source", "Owner SOP", "Sections", "Fields", "Columns", "Comment"],
  // SOP review and revision requests, tracked to closure (Outcome: No change — the review date moves on; Revised — the
  // new revision and its effective date; Withdrawn)
  sopReviews: ["Review ID", "SOP", "Type", "Reason", "Requested by", "Requested on", "Owner", "Due", "Change control", "Status", "Outcome", "New revision", "Effective on", "Closed on", "Comment"],
  // Module ↔ SOP links that override the automatic match on SOP titles
  sopLinks: ["Topic", "SOP", "Comment"],
  // Progress of each EU GMP Ch.1.10 review section within one product's APQR
  apqrSections: ["Product", "Section", "Status", "Owner", "Due", "Evidence", "Comment", "Updated"],
  // QA activity register entries (override / extend the built-in GMP activity catalogue)
  qaact: ["Activity ID", "Activity", "Category", "Reference", "Frequency (months)", "Owner", "Last performed", "Next due", "Evidence", "Comment"],
  // Manually entered QMS metric values per quarter
  metrics: ["Metric", "Period", "Numerator", "Denominator", "Value", "Comment"],
};

export const EXT_TABLES = Object.keys(EXT_COLS);
