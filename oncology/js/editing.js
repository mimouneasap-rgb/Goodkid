// Row editor: which fields each table shows, how values convert between the
// stored workbook / Scigeniq formats and form inputs, and the form itself.
import { h, fmtDate } from "./ui.js";
import { t, tv, getLang } from "./i18n.js";
import { STATUSES, CC_STAGES, IMPR_STAGES, toDay } from "./model.js";
import { VOCAB as V, METRICS, APQR_SECTIONS } from "./catalogs.js";

const FR = () => getLang() === "FR";
const YN = ["Yes", "No"];
const CLASSES = ["Minor", "Major", "Critical", "Incident"];
const SCORES = ["1", "2", "3", "4", "5"];

// [column, type, options?]. Types: text, long, number, date (yyyy-mm-dd), sdate (Scigeniq dd/mm/yyyy),
// status / pick (fixed list), suggest (free text with suggestions), room, score.
export const SPECS = {
  cc: {
    label: ["Change control", "Maîtrise des changements"], id: "Reference Id", title: "Title", prefix: "CC-KO-",
    defaults: () => ({ Type: "Change Control", Status: "Open", Stage: "Open", Project: "ELKENDI Oncology", "Creation Date": sToday() }),
    fields: [["Reference Id", "text"], ["Title", "long"], ["Status", "status"], ["Stage", "pick", V.ccStages], ["CC Classification", "pick", V.classes],
      ["Change Scope", "suggest", V.ccScopes], ["CC Category", "pick", V.ccCategories], ["Department", "pick", V.departments], ["Location", "suggest", "locations"], ["Assigned User", "suggest", "users"],
      ["Creation Date", "sdate"], ["End Date", "sdate"], ["Closing date", "sdate"], ["Products", "text"],
      ["Current State", "long"], ["Proposed State", "long"], ["Justification", "long"], ["Folders", "text"]],
  },
  capa: {
    label: ["CAPA", "CAPA"], id: "Reference Id", title: "Title", prefix: "CAPA-KO-",
    defaults: () => ({ Type: "CAPA", Status: "Open", Stage: "Open", Project: "ELKENDI Oncology", "Creation Date": sToday() }),
    fields: [["Reference Id", "text"], ["Title", "long"], ["Status", "status"], ["Stage", "suggest", V.capaStages], ["Source", "pick", V.capaSources],
      ["Parent ID Reference", "suggest", "refs"], ["Effectiveness Check required?", "pick", YN], ["Responsible Department", "pick", V.departments], ["Assigned User", "suggest", "users"],
      ["Creation Date", "sdate"], ["End Date", "sdate"], ["Closing date", "sdate"], ["Product Record", "text"], ["Folders", "text"]],
  },
  qe: {
    label: ["Deviation", "Déviation"], id: "Reference Id", title: "Title", prefix: "QE-KO-",
    defaults: () => ({ Type: "Quality Event", Status: "Open", Stage: "Open", Project: "ELKENDI Oncology", "Creation Date": sToday() }),
    fields: [["Reference Id", "text"], ["Title", "long"], ["Status", "status"], ["Stage", "suggest", V.qeStages], ["Initial QE Class", "pick", V.qeClasses], ["Final Event Classification", "pick", V.qeClasses],
      ["CAPA Required_?", "pick", YN], ["Require_Investigation ?", "pick", YN], ["Root Cause", "pick", V.rootCauses], ["Quality Event Scope", "suggest", "col"], ["Location", "suggest", V.departments],
      ["Product Record", "text"], ["Product Batch No.", "text"], ["Assigned User", "suggest", "users"],
      ["Creation Date", "sdate"], ["Date of Occurrence", "sdate"], ["End Date", "sdate"], ["Closing date", "sdate"], ["Folders", "text"]],
  },
  equip: {
    label: ["Asset", "Actif"], id: "Asset no", title: "Description",
    defaults: () => ({ "GMP critical": "Y" }),
    fields: [["Asset no", "text"], ["Description", "text"], ["Room code", "room"], ["Register", "pick", V.registers], ["Category", "suggest", "col"],
      ["Last calibration", "date"], ["Calibration frequency (months)", "pick", V.calFrequencies.map(String)], ["Qualification status", "pick", V.qualification], ["GMP critical", "pick", ["Y", "N"]],
      ["Model", "text"], ["Serial", "text"], ["Manufacturer", "suggest", "col"], ["Parent asset", "text"], ["Comments", "long"], ["Known issues", "long"]],
  },
  fmea: {
    label: ["FMEA risk", "Risque AMDEC"], id: "Risk ID", title: "Failure mode",
    fields: [["Risk ID", "text"], ["Assessment ref", "suggest", "col"], ["Assessment", "suggest", "col"], ["Room code", "room"], ["Process step", "suggest", "col"], ["Function or item", "text"],
      ["Failure mode", "long"], ["Effect", "long"], ["Cause", "long"], ["Current controls", "long"],
      ["S", "score"], ["O", "score"], ["D", "score"], ["Action", "long"], ["Owner", "suggest", "col"], ["Due", "date"],
      ["Residual S", "score"], ["Residual O", "score"], ["Residual D", "score"], ["Verification", "long"], ["Post-mitigation acceptance", "pick", YN]],
  },
  rooms: {
    label: ["Room", "Salle"], id: "Code", title: "Name",
    fields: [["Code", "text"], ["Name", "text"], ["Area", "suggest", "col"], ["Grade", "pick", V.grades], ["Activity type", "suggest", "col"], ["Criticality", "pick", V.criticality],
      ["Criticality rationale", "long"], ["OEB level", "number"], ["Pressure set-point (Pa)", "number"], ["Pressure alarm", "text"], ["Adjacent rooms", "text"],
      ["Cleaning status", "suggest", "col"], ["Cleaning expiry", "date"], ["Current product", "text"], ["Notes", "long"], ["Data status", "text"]],
  },
  sop: {
    label: ["SOP", "Procédure"], id: "Code", title: "Title",
    fields: [["Code", "text"], ["Title", "text"], ["Department", "pick", V.sopDepts], ["Site", "pick", V.sopSites], ["Language", "pick", V.languages], ["Type", "suggest", "col"],
      ["Status", "suggest", "col"], ["Revision", "text"], ["Effective date", "date"], ["Next review", "date"], ["Owner", "suggest", "col"],
      ["Linked rooms", "text"], ["Linked equipment", "text"], ["Source", "text"]],
  },
  impr: {
    label: ["Improvement", "Amélioration"], id: "ID", title: "Title", prefix: "IMP-",
    defaults: () => ({ Stage: "Idea" }),
    fields: [["ID", "text"], ["Title", "long"], ["Stage", "pick", IMPR_STAGES], ["Benefit", "pick", V.benefits], ["Owner", "pick", V.owners], ["Room", "room"],
      ["Target date", "date"], ["Source", "text"], ["Comment", "long"]],
  },
  ccp: { label: ["Critical control point", "Point critique"], id: "CCP ID", title: "Parameter",
    fields: [["CCP ID", "text"], ["Room", "suggest", "rooms"], ["Process step", "suggest", "col"], ["Parameter", "text"], ["Limit", "long"], ["Monitoring method", "long"], ["Frequency", "suggest", "col"], ["Responsible", "pick", V.owners], ["Linked SOP", "suggest", "sops"], ["Source", "text"]] },
  forms: { label: ["Logbook / form", "Registre / formulaire"], id: "Form code", title: "Title",
    fields: [["Form code", "text"], ["Title", "long"], ["Type", "pick", V.formTypes], ["Linked SOP", "suggest", "sops"], ["Linked room", "room"], ["Linked equipment", "suggest", "assets"], ["Revision", "text"], ["Status", "suggest", "col"], ["Source", "text"]] },
  find: {
    label: ["Audit finding", "Constat d’audit"], id: "Reference Id", title: "Title", prefix: "FIND-KO-",
    defaults: () => ({ Type: "Audit Findings", Status: "Open", Stage: "Pending Response", Project: "ELKENDI Oncology", "Creation Date": sToday() }),
    fields: [["Reference Id", "text"], ["Title", "long"], ["Status", "status"], ["Stage", "pick", V.findStages], ["Classification", "pick", V.classes], ["Finding Type", "pick", V.findingTypes],
      ["Audited Areas", "suggest", V.auditedAreas], ["Parent ID Reference", "suggest", "col"], ["Parent action", "suggest", "col"], ["Supplier Name", "text"], ["Wait CAPA?", "pick", YN],
      ["Assigned User", "suggest", "users"], ["Location", "pick", V.departments], ["Tags", "suggest", "col"], ["Creation Date", "sdate"], ["End Date", "sdate"], ["Closing date", "sdate"]],
  },
  actions: {
    label: ["Action", "Action"], id: "Reference Id", title: "Title", prefix: "ACTION-KO-",
    defaults: () => ({ Type: "Actions", Status: "Open", Stage: "In Progress", "Creation Date": sToday() }),
    fields: [["Reference Id", "text"], ["Title", "long"], ["Description", "long"], ["Status", "status"], ["Stage", "pick", V.actionStages], ["Parent ID Reference", "suggest", "refs"],
      ["Parent Type", "pick", ["Change Control", "CAPA"]], ["Parent Parent Source", "pick", ["Change Control", "CAPA", "Audit Findings", "Quality Event"]], ["Department", "pick", V.departments],
      ["Assigned User", "suggest", "users"], ["Tags", "pick", V.actionTags], ["Creation Date", "sdate"], ["Start Date", "sdate"], ["End Date", "sdate"], ["Closing date", "sdate"]],
  },
  training: {
    label: ["Training", "Formation"], id: "Training ID", title: "Program", prefix: "TR-",
    defaults: () => ({ Status: "Planned", Department: "Quality Assurance", Type: "SOP" }),
    fields: [["Training ID", "text"], ["Program", "long"], ["Reference", "suggest", "sops"], ["Type", "pick", V.trainingTypes], ["Department", "pick", V.departments],
      ["Attendee group", "suggest", V.attendeeGroups], ["Planned month", "month"], ["Status", "pick", V.trainingStatus], ["Rescheduled to", "month"], ["Completion date", "date"],
      ["Trainer", "suggest", "col"], ["Planned attendees", "number"], ["Trained attendees", "number"], ["Effectiveness", "pick", V.effectiveness], ["Comments", "long"]],
  },
  calplan: {
    label: ["Calibration", "Étalonnage"], id: "Item", title: "Description",
    fields: [["Item", "suggest", "assets"], ["Description", "text"], ["Parent", "suggest", "col"], ["Category", "pick", V.calCategories], ["Location", "suggest", "rooms"],
      ["Planned start", "date"], ["Planned end", "date"], ["Frequency (months)", "pick", V.calFrequencies.map(String)], ["Interval", "pick", V.calIntervals], ["Duration", "text"],
      ["Calibrated on", "date"], ["Certificate", "text"], ["Performed by", "suggest", "col"], ["Result", "pick", V.calResults], ["Program", "text"], ["Comment", "long"]],
  },
  validation: {
    label: ["Qualification task", "Tâche de qualification"], id: "Task ID", title: "Task", prefix: "VAL-",
    defaults: () => ({ Status: "Planned" }),
    fields: [["Task ID", "text"], ["Task", "long"], ["Scope", "pick", V.valScopes], ["Category", "suggest", V.valCategories], ["Equipment", "suggest", "assets"],
      ["Frequency (years)", "pick", ["1", "2", "3", "5"]], ["Initial qualification", "month"], ["Duration", "text"], ["Planned start", "month"], ["Planned finish", "month"],
      ["Completion date", "date"], ["Verified by", "suggest", "users"], ["Status", "pick", V.valStatus], ["Report ref", "text"], ["Comment", "long"]],
  },
  suppliers: {
    label: ["API supplier", "Fournisseur de PA"], id: "API", title: "Manufacturer",
    fields: [["API", "text"], ["Grade", "suggest", V.apiGrades], ["CAS number", "text"], ["Item code", "text"], ["Manufacturer", "suggest", "col"], ["Plant address", "long"],
      ["Supplier", "suggest", "col"], ["Finished product", "suggest", "products"], ["Registered", "pick", YN], ["Variation", "pick", YN], ["Change control", "suggest", "refs"],
      ["Approval status", "pick", V.supplierStatus], ["Last audit", "date"], ["Next audit", "date"], ["Audit type", "pick", V.auditTypes], ["Comment", "long"]],
  },
  batches: {
    label: ["Batch", "Lot"], id: "Batch no", title: "Product",
    fields: [["Product", "suggest", "col"], ["Product code", "suggest", "col"], ["Batch no", "text"], ["BMR no", "text"], ["Purpose", "pick", V.batchPurpose], ["Scale", "pick", V.batchScale],
      ["Batch type", "pick", V.batchType], ["PV ref", "text"], ["Status", "pick", V.batchStatus], ["Mfg date", "date"], ["Exp date", "date"],
      ["Start manufacturing", "date"], ["End granulation", "date"], ["Granulation yield", "number"], ["Start compression", "date"], ["End compression", "date"], ["Compression yield", "number"],
      ["Start coating", "date"], ["End coating", "date"], ["Manufacturing yield", "number"], ["BMR handover", "date"], ["Start packaging", "date"], ["End packaging", "date"],
      ["Packaging yield", "number"], ["BPR handover", "date"], ["Physical release", "date"], ["ERP release", "date"], ["Archiving", "date"],
      ["Change control", "suggest", "refs"], ["OOS", "text"], ["Deviation", "suggest", "refs"], ["Remark", "long"]],
  },
  wip: {
    label: ["WIP lot", "Lot en cours"], id: "Batch", title: "Product",
    defaults: () => ({ Unit: "kg", Status: "In process" }),
    fields: [["Product", "suggest", "col"], ["Batch", "text"], ["Next step", "pick", V.wipSteps], ["Status", "suggest", V.wipStatus], ["Mfg date", "date"], ["Exp date", "date"],
      ["Quantity", "number"], ["Unit", "pick", V.units], ["Time frame", "date"], ["Deviation / CAPA", "suggest", "refs"], ["Responsibility", "pick", V.responsibilities],
      ["Location", "room"], ["Remark", "long"], ["Comment", "long"]],
  },
  rejections: {
    label: ["Rejection report", "Rapport de rejet"], id: "Report no", title: "Product",
    fields: [["Report no", "text"], ["Product", "suggest", "col"], ["Batch", "text"], ["Item code", "text"], ["Status", "pick", V.rejectionStatus], ["Mfg date", "date"], ["Exp date", "date"],
      ["Quantity", "number"], ["Unit", "pick", V.units], ["Deviation / CAPA", "suggest", "refs"], ["Reworks", "number"], ["R&D recommendation", "long"], ["QA comments", "long"], ["Decision date", "date"]],
  },
  apqr: {
    label: ["APQR record", "Enregistrement RQP"], id: "Product", title: "Period",
    defaults: () => ({ Status: "Planned" }),
    fields: [["Product", "suggest", "products"], ["Period", "text"], ["Period start", "date"], ["Period end", "date"], ["Due date", "date"], ["Status", "pick", V.apqrStatus],
      ["Owner", "suggest", "users"], ["Previous CAPA status", "long"], ["CAPA required", "pick", V.capaDecision], ["Conclusion", "long"], ["Approved on", "date"], ["Report ref", "text"], ["Comment", "long"]],
  },
  fives: {
    label: ["5S audit", "Audit 5S"], id: "Audit ID", title: "Area", prefix: "5S-",
    fields: [["Audit ID", "text"], ["Area", "suggest", "areas"], ["Date", "date"], ["Week", "text"], ["Auditor", "suggest", "users"], ["Supervisor", "suggest", "users"], ["Checklist", "suggest", "areas"],
      ["Scale", "pick", ["2", "3"]], ["Scores", "long"], ["Findings", "text"], ["Actions", "long"], ["Owner", "suggest", "users"], ["Due", "date"], ["Action status", "pick", V.fivesStatus], ["Comment", "long"]],
  },
  fivesAreas: {
    label: ["5S area", "Zone 5S"], id: "Area", title: "Area",
    fields: [["Area", "text"], ["Code", "text"], ["Risk", "pick", V.riskClasses], ["Frequency", "pick", V.fivesFrequencies], ["Rooms", "suggest", "rooms"], ["Owner", "suggest", "users"],
      ["Key equipment", "long"], ["Critical focus", "long"], ["GMP requirements", "long"], ["Common issues", "long"]],
  },
  fivesTpl: {
    label: ["5S criterion", "Critère 5S"], id: "No", title: "Criterion",
    fields: [["Area", "suggest", "areas"], ["No", "number"], ["Category", "pick", V.fivesCategories], ["Criterion", "long"]],
  },
  fivesItems: {
    label: ["5S finding", "Constat 5S"], id: "Audit ID", title: "Criterion",
    defaults: () => ({ Status: "Open", Priority: "Medium" }),
    fields: [["Audit ID", "text"], ["Area", "suggest", "areas"], ["No", "number"], ["Category", "pick", V.fivesCategories], ["Criterion", "long"], ["Score", "pick", ["0", "1", "2", "3"]],
      ["Comment", "long"], ["Action", "long"], ["Priority", "pick", V.priorities], ["Owner", "suggest", "users"], ["Due", "date"], ["Status", "pick", V.fivesStatus], ["Closed on", "date"]],
  },
  apqrPlan: {
    label: ["APQR plan line", "Ligne du plan RQP"], id: "Code", title: "Product",
    fields: [["Code", "text"], ["Product", "long"], ["Dosage form", "pick", V.dosageForms], ["Planned month", "month"], ["Previous report", "text"], ["Period start", "month"], ["Period end", "month"], ["Comment", "long"]],
  },
  apqrSys: {
    label: ["Scigeniq APQR plan line", "Ligne du plan RQP Scigeniq"], id: "Product", title: "Product",
    fields: [["Product", "long"], ["Process", "pick", V.dosageForms], ["Exec. year", "number"], ["Site", "text"], ["Review start", "text"], ["Review end", "text"], ["Period end", "date"], ["Plan status", "suggest", "col"]],
  },
  apqrTasks: {
    label: ["APQR task", "Tâche RQP"], id: "Reference ID", title: "Task Title",
    fields: [["Reference ID", "text"], ["Product", "suggest", "col"], ["Dosage Form", "pick", V.dosageForms], ["Department", "pick", V.apqrDepartments], ["Data Stream", "pick", V.apqrStreams], ["Task Type", "suggest", "col"],
      ["Task Title", "long"], ["Workflow Stage", "pick", V.apqrStages], ["Status", "pick", V.apqrTaskStatus], ["Assigned User", "suggest", "col"], ["Created", "date"], ["Start", "date"], ["Due", "date"], ["Closed On", "date"], ["Closure", "pick", ["Closed", "Not Closed"]],
      ["Site", "suggest", "col"], ["Critical level", "pick", ["Low", "Medium", "High", "Emergency"]], ["Created by", "suggest", "col"], ["Parent action", "long"], ["Last seen", "date"], ["Comment", "long"]],
  },
  apqrSections: {
    label: ["APQR review section", "Section de revue RQP"], id: "Section", title: "Product",
    defaults: () => ({ Status: "Not started", Updated: isoToday() }),
    fields: [["Product", "suggest", "products"], ["Section", "pick", APQR_SECTIONS.map(([id]) => id)], ["Status", "pick", V.apqrSectionStatus], ["Owner", "suggest", "users"], ["Due", "date"],
      ["Evidence", "long"], ["Comment", "long"], ["Updated", "date"]],
  },
  qaact: {
    label: ["QA activity", "Activité AQ"], id: "Activity ID", title: "Activity", prefix: "QA-",
    fields: [["Activity ID", "text"], ["Activity", "long"], ["Category", "suggest", "col"], ["Reference", "long"], ["Frequency (months)", "pick", ["0", "0.25", "1", "3", "6", "12", "24", "36"]],
      ["Owner", "pick", V.owners], ["Last performed", "date"], ["Next due", "date"], ["Evidence", "text"], ["Comment", "long"]],
  },
  metrics: {
    label: ["Metric value", "Valeur d’indicateur"], id: "Metric", title: "Period",
    fields: [["Metric", "pick", METRICS.map((m) => m.id)], ["Period", "suggest", "periods"], ["Numerator", "number"], ["Denominator", "number"], ["Value", "number"], ["Comment", "long"]],
  },
  adj: { label: ["Pressure cascade link", "Lien de cascade de pression"], id: "Room", title: "Adjacent room" },
  targets: { label: ["KPI target", "Cible d’indicateur"], id: "Key", title: "KPI" },
  bands: { label: ["RPN band", "Seuil d’IPR"], id: "Level", title: "Acceptance" },
  crit: { label: ["Criticality weight", "Poids de criticité"], id: "Level", title: "Definition" },
  prio: { label: ["Priority weight", "Poids de priorité"], id: "Factor", title: "Note" },
  prod: { label: ["Product", "Produit"], id: "Search key", title: "Product" },
  deptMap: { label: ["Department alias", "Alias de département"], id: "Alias", title: "Department" },
  links: { label: ["Record link", "Lien d’enregistrement"], id: "Ref ID", title: "Room code" },
  appr: { label: ["Approval", "Approbation"], id: "Record", title: "Action" },
};
export const tableLabel = (key) => (SPECS[key]?.label ?? [key, key])[FR() ? 1 : 0];

// ---------- value conversion ----------
const pad = (n) => String(n).padStart(2, "0");
function sToday() { const d = new Date(); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} 12:00 am`; }
const isoToday = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

/** Stored value → input value. */
function toInput(type, v) {
  if (v == null || v === "-----") return "";
  if (type === "date" || type === "sdate") { const ts = toDay(v); return ts == null ? "" : new Date(ts).toISOString().slice(0, 10); }
  if (type === "month") { const m = String(v).match(/^(\d{4})-(\d{2})/); return m ? `${m[1]}-${m[2]}` : ""; }
  return String(v);
}
/** Input value → stored value (keeps the original when the date did not change, so Scigeniq times survive). */
function fromInput(type, s, original) {
  s = s.trim();
  if (s === "") return null;
  if (type === "number" || type === "score" || (type === "pick" && /^\d+(\.\d+)?$/.test(s))) { const n = Number(s.replace(",", ".")); return isNaN(n) ? s : n; }
  if (type === "date" || type === "month") return s;
  if (type === "sdate") {
    if (toInput("sdate", original) === s) return original;
    const [y, m, d] = s.split("-");
    return `${d}/${m}/${y} 12:00 am`;
  }
  return s;
}

/** Next free id like CC-KO-189 from the ids already in a column. */
export function nextId(values, prefix) {
  let pre = prefix, width = 0, max = 0;
  if (!pre) {
    const last = [...values].reverse().find((v) => /\d+$/.test(String(v ?? "")));
    if (!last) return "";
    pre = String(last).replace(/\d+$/, "");
  }
  for (const v of values) {
    const s = String(v ?? "");
    if (!s.startsWith(pre)) continue;
    const m = s.slice(pre.length).match(/^(\d+)$/);
    if (m) { max = Math.max(max, +m[1]); width = Math.max(width, m[1].length); }
  }
  return pre + String(max + 1).padStart(width || 1, "0");
}

/** Guess a field type for tables without a spec. */
function inferType(col, values) {
  if (/date|^due$|review|expiry/i.test(col)) return ["date"];
  if (values.some((v) => typeof v === "number") && values.every((v) => v == null || typeof v === "number")) return ["number"];
  if (values.some((v) => typeof v === "string" && v.length > 80)) return ["long"];
  const distinct = new Set(values.filter((v) => v != null && v !== ""));
  return distinct.size > 0 && distinct.size <= 40 ? ["suggest", "col"] : ["text"];
}

/**
 * The edit form for one row.
 * @param {object} o table key, cols, row (array or null for new), allRows (for suggestions / ids),
 *   rooms ([[code,name]]), lists ({users, depts, …}), onSave(rowArray), onDelete(), onCancel()
 */
export function rowForm(o) {
  const spec = SPECS[o.table] ?? {};
  const cols = o.cols;
  const isNew = !o.row;
  const base = o.row ? [...o.row] : cols.map((c) => null);
  if (isNew) {
    const defs = { ...(spec.defaults?.() ?? {}), ...(o.defaults ?? {}) };
    cols.forEach((c, i) => { if (defs[c] != null) base[i] = defs[c]; });
    if (spec.id) {
      const idx = cols.indexOf(spec.id);
      const id = nextId(o.allRows.map((r) => r[idx]), spec.prefix);
      if (id && base[idx] == null) base[idx] = id;
    }
  }
  const colValues = (c) => o.allRows.map((r) => r[cols.indexOf(c)]);
  const fields = (spec.fields ?? cols.map((c) => [c, ...inferType(c, colValues(c))])).filter(([c]) => cols.includes(c));
  const inputs = new Map();
  let lists = 0;
  const dl = (values) => {
    const id = `dl-${o.table}-${++lists}`;
    return [id, h("datalist", { id }, [...new Set(values.filter((v) => v != null && v !== "" && v !== "-----").map(String))].sort().slice(0, 400).map((v) => h("option", { value: v })))];
  };

  const fieldEls = fields.map(([col, type, opt]) => {
    const i = cols.indexOf(col);
    const id = `f-${o.table}-${i}`;
    const value = toInput(type, base[i]);
    let input, extra = null;
    if (type === "long") input = h("textarea", { id, rows: col === "Title" ? 2 : 3 }, value);
    else if (type === "status" || type === "pick" || type === "score" || type === "room") {
      const options = type === "status" ? STATUSES.map((s) => [s, tv(s)]) : type === "score" ? SCORES.map((s) => [s, s])
        : type === "room" ? o.rooms.map(([c, n]) => [c, `${c} · ${n}`]) : opt.map((s) => [s, tv(s)]);
      if (value && !options.some(([v]) => v === value)) options.unshift([value, value]);
      input = h("select", { id }, h("option", { value: "" }, "—"), options.map(([v, l]) => h("option", { value: v, selected: v === value ? true : null }, l)));
    } else {
      const attrs = { id, value, type: type === "number" ? "text" : type === "date" || type === "sdate" ? "date" : type === "month" ? "month" : "text", inputmode: type === "number" ? "decimal" : null, placeholder: type === "month" ? "yyyy-mm" : null };
      if (type === "suggest") {
        const values = Array.isArray(opt) ? opt : opt === "col" ? colValues(col) : o.lists?.[opt] ?? colValues(col);
        const [lid, list] = dl(values);
        attrs.list = lid; extra = list;
      }
      input = h("input", attrs);
    }
    inputs.set(i, [type, input]);
    const wide = type === "long" || col === spec.title;
    return h(`label.field${wide ? ".wide" : ""}`, { for: id }, h("span", col), input, extra);
  });

  const msg = h("p.form-msg", { role: "status" });
  const status = inputs.get(cols.indexOf("Status"))?.[1];
  const closing = inputs.get(cols.indexOf("Closing date"))?.[1];
  status?.addEventListener("change", () => {
    if (status.value === "Completed" && closing && !closing.value) { closing.value = isoToday(); msg.textContent = FR() ? "Date de clôture fixée à aujourd’hui." : "Closing date set to today."; }
  });

  const form = h("form.row-form", {
    onsubmit: async (e) => {
      e.preventDefault();
      const row = [...base];
      for (const [i, [type, el]] of inputs) row[i] = fromInput(type, el.value, base[i]);
      if (spec.id) {
        const idx = cols.indexOf(spec.id);
        if (row[idx] == null) { msg.textContent = FR() ? `« ${spec.id} » est obligatoire.` : `“${spec.id}” is required.`; msg.className = "form-msg warn-text"; return; }
        const clash = o.allRows.some((r, n) => n !== o.index && String(r[idx]) === String(row[idx]));
        if (clash && !form.dataset.ack && ["cc", "capa", "qe", "fmea", "rooms", "impr"].includes(o.table)) {
          form.dataset.ack = "1";
          msg.textContent = FR() ? `${row[idx]} existe déjà. Enregistrer à nouveau pour confirmer.` : `${row[idx]} already exists. Save again to keep the duplicate.`;
          msg.className = "form-msg warn-text"; return;
        }
      }
      saveBtn.disabled = true; msg.className = "form-msg"; msg.textContent = FR() ? "Enregistrement…" : "Saving…";
      try { await o.onSave(row); }
      catch (err) { msg.className = "form-msg warn-text"; msg.textContent = err.message ?? String(err); saveBtn.disabled = false; }
    },
  });
  const saveBtn = h("button.btn.primary", { type: "submit" }, t("save"));
  let armed = false;
  const delBtn = !isNew && o.onDelete ? h("button.btn.danger", {
    type: "button",
    onclick: async () => {
      if (!armed) { armed = true; delBtn.textContent = FR() ? "Confirmer la suppression" : "Click again to delete"; setTimeout(() => { armed = false; delBtn.textContent = t("delete"); }, 4000); return; }
      delBtn.disabled = true;
      try { await o.onDelete(); } catch (err) { msg.className = "form-msg warn-text"; msg.textContent = err.message ?? String(err); delBtn.disabled = false; }
    },
  }, t("delete")) : null;
  form.append(
    h("div.form-grid", fieldEls),
    msg,
    h("div.form-actions", saveBtn, h("button.btn.ghost", { type: "button", onclick: o.onCancel }, t("cancel")), h("span.spacer"), delBtn));
  return form;
}

/** "Changed 21/10/2026 by Name" line for a row's last in-app change. */
export function changeLine(edit, who) {
  if (!edit) return null;
  const when = fmtDate(toDay(String(edit.at).slice(0, 10)));
  const verb = edit.key?.startsWith("n-") ? t("added_in_app") : t("changed_in_app");
  return h("p.changed", h("i"), `${verb} ${when} · ${who(edit.by)}`);
}
