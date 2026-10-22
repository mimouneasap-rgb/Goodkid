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
  // APQR schedule per product
  apqr: ["Product", "Period", "Period start", "Period end", "Due date", "Status", "Owner", "Approved on", "Report ref", "Conclusion", "Comment"],
  // 5S weekly QA audits (Scores: 20 values 0/1/2 or "-" for not applicable, comma separated)
  fives: ["Audit ID", "Week", "Date", "Area", "Auditor", "Scores", "Findings", "Actions", "Owner", "Due", "Action status", "Comment"],
  // QA activity register entries (override / extend the built-in GMP activity catalogue)
  qaact: ["Activity ID", "Activity", "Category", "Reference", "Frequency (months)", "Owner", "Last performed", "Next due", "Evidence", "Comment"],
  // Manually entered QMS metric values per quarter
  metrics: ["Metric", "Period", "Numerator", "Denominator", "Value", "Comment"],
};

export const EXT_TABLES = Object.keys(EXT_COLS);
