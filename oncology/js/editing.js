// Row editor: which fields each table shows, how values convert between the
// stored workbook / Scigeniq formats and form inputs, and the form itself.
import { h, fmtDate } from "./ui.js";
import { t, tv, getLang } from "./i18n.js";
import { STATUSES, CC_STAGES, IMPR_STAGES, toDay } from "./model.js";

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
    fields: [["Reference Id", "text"], ["Title", "long"], ["Status", "status"], ["Stage", "suggest", CC_STAGES], ["CC Classification", "suggest", ["Minor", "Major"]],
      ["Change Scope", "suggest", "scopes"], ["Department", "suggest", "depts"], ["Location", "suggest", "locations"], ["Assigned User", "suggest", "users"],
      ["Creation Date", "sdate"], ["End Date", "sdate"], ["Closing date", "sdate"], ["Products", "text"],
      ["Current State", "long"], ["Proposed State", "long"], ["Justification", "long"], ["Folders", "text"]],
  },
  capa: {
    label: ["CAPA", "CAPA"], id: "Reference Id", title: "Title", prefix: "CAPA-KO-",
    defaults: () => ({ Type: "CAPA", Status: "Open", Stage: "Open", Project: "ELKENDI Oncology", "Creation Date": sToday() }),
    fields: [["Reference Id", "text"], ["Title", "long"], ["Status", "status"], ["Stage", "suggest", "stages"], ["Source", "suggest", ["Audit Findings", "Standalone", "Quality Event", "APQR"]],
      ["Parent ID Reference", "text"], ["Effectiveness Check required?", "pick", YN], ["Responsible Department", "suggest", "depts"], ["Assigned User", "suggest", "users"],
      ["Creation Date", "sdate"], ["End Date", "sdate"], ["Closing date", "sdate"], ["Product Record", "text"], ["Folders", "text"]],
  },
  qe: {
    label: ["Deviation", "Déviation"], id: "Reference Id", title: "Title", prefix: "QE-KO-",
    defaults: () => ({ Type: "Quality Event", Status: "Open", Stage: "Open", Project: "ELKENDI Oncology", "Creation Date": sToday() }),
    fields: [["Reference Id", "text"], ["Title", "long"], ["Status", "status"], ["Stage", "suggest", "stages"], ["Initial QE Class", "suggest", CLASSES], ["Final Event Classification", "suggest", CLASSES],
      ["CAPA Required_?", "pick", YN], ["Root Cause", "suggest", "rootcauses"], ["Quality Event Scope", "text"], ["Location", "suggest", "locations"],
      ["Product Record", "text"], ["Product Batch No.", "text"], ["Assigned User", "suggest", "users"],
      ["Creation Date", "sdate"], ["Date of Occurrence", "sdate"], ["End Date", "sdate"], ["Closing date", "sdate"], ["Folders", "text"]],
  },
  equip: {
    label: ["Asset", "Actif"], id: "Asset no", title: "Description",
    defaults: () => ({ "GMP critical": "Y" }),
    fields: [["Asset no", "text"], ["Description", "text"], ["Room code", "room"], ["Register", "suggest", "col"], ["Category", "suggest", "col"],
      ["Last calibration", "date"], ["Calibration frequency (months)", "number"], ["Qualification status", "suggest", "col"], ["GMP critical", "pick", ["Y", "N"]],
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
    fields: [["Code", "text"], ["Name", "text"], ["Area", "suggest", "col"], ["Grade", "suggest", "col"], ["Activity type", "suggest", "col"], ["Criticality", "pick", ["High", "Medium", "Low"]],
      ["Criticality rationale", "long"], ["OEB level", "number"], ["Pressure set-point (Pa)", "number"], ["Pressure alarm", "text"], ["Adjacent rooms", "text"],
      ["Cleaning status", "suggest", "col"], ["Cleaning expiry", "date"], ["Current product", "text"], ["Notes", "long"], ["Data status", "text"]],
  },
  sop: {
    label: ["SOP", "Procédure"], id: "Code", title: "Title",
    fields: [["Code", "text"], ["Title", "text"], ["Department", "suggest", "col"], ["Site", "suggest", "col"], ["Language", "suggest", ["EN", "FR", "EN/FR"]], ["Type", "suggest", "col"],
      ["Status", "suggest", "col"], ["Revision", "text"], ["Effective date", "date"], ["Next review", "date"], ["Owner", "suggest", "col"],
      ["Linked rooms", "text"], ["Linked equipment", "text"], ["Source", "text"]],
  },
  impr: {
    label: ["Improvement", "Amélioration"], id: "ID", title: "Title", prefix: "IMP-",
    defaults: () => ({ Stage: "Idea" }),
    fields: [["ID", "text"], ["Title", "long"], ["Stage", "pick", IMPR_STAGES], ["Benefit", "suggest", "col"], ["Owner", "suggest", "col"], ["Room", "room"],
      ["Target date", "date"], ["Source", "text"], ["Comment", "long"]],
  },
  ccp: { label: ["Critical control point", "Point critique"], id: "CCP ID", title: "Parameter" },
  forms: { label: ["Logbook / form", "Registre / formulaire"], id: "Form code", title: "Title" },
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
  return String(v);
}
/** Input value → stored value (keeps the original when the date did not change, so Scigeniq times survive). */
function fromInput(type, s, original) {
  s = s.trim();
  if (s === "") return null;
  if (type === "number" || type === "score") { const n = Number(s.replace(",", ".")); return isNaN(n) ? s : n; }
  if (type === "date") return s;
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
  if (/date|^due$|review|expiry/i.test(col)) return "date";
  if (values.some((v) => typeof v === "number") && values.every((v) => v == null || typeof v === "number")) return "number";
  if (values.some((v) => typeof v === "string" && v.length > 80)) return "long";
  return "text";
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
    const defs = spec.defaults?.() ?? {};
    cols.forEach((c, i) => { if (defs[c] != null) base[i] = defs[c]; });
    if (spec.id) {
      const idx = cols.indexOf(spec.id);
      const id = nextId(o.allRows.map((r) => r[idx]), spec.prefix);
      if (id && base[idx] == null) base[idx] = id;
    }
  }
  const colValues = (c) => o.allRows.map((r) => r[cols.indexOf(c)]);
  const fields = (spec.fields ?? cols.map((c) => [c, inferType(c, colValues(c))])).filter(([c]) => cols.includes(c));
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
      const attrs = { id, value, type: type === "number" ? "text" : type === "date" || type === "sdate" ? "date" : "text", inputmode: type === "number" ? "decimal" : null };
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
