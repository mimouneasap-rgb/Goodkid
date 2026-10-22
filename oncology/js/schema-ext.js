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
  // Progress of each EU GMP Ch.1.10 review section within one product's APQR
  apqrSections: ["Product", "Section", "Status", "Owner", "Due", "Evidence", "Comment", "Updated"],
  // QA activity register entries (override / extend the built-in GMP activity catalogue)
  qaact: ["Activity ID", "Activity", "Category", "Reference", "Frequency (months)", "Owner", "Last performed", "Next due", "Evidence", "Comment"],
  // Manually entered QMS metric values per quarter
  metrics: ["Metric", "Period", "Numerator", "Denominator", "Value", "Comment"],
};

export const EXT_TABLES = Object.keys(EXT_COLS);
