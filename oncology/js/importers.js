// File importers. Everything is read in the browser:
//  - the master workbook (.xlsx) and Scigeniq exports (CC, CAPA, Quality Event, Audit Findings, Actions)
//  - the batch tracker (.xlsm), the WIP workbook, the 5S area checklists and the APQR tracker / Scigeniq APQR export (.xlsx)
//  - the controlled Word forms (.docx): annual / monthly calibration programs, validation and
//    requalification schedules, annual training plans, the registered API supplier list and the APQR annual plan.
// Each importer writes whole tables into `next` and lists them in `replaced`.
import SCHEMA from "./schema.js";
import { EXT_COLS } from "./schema-ext.js";

export const COLS = { ...SCHEMA.cols, ...EXT_COLS };
export const emptyData = () => ({ meta: {}, mapGrid: [], ...Object.fromEntries(Object.entries(COLS).map(([k, cols]) => [k, { cols, rows: [] }])) });

let xlsxPromise = null;
export function loadXLSX() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  xlsxPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "vendor/xlsx.core.min.js"; // SheetJS 0.18.5 (Apache-2.0), loaded only when importing
    s.onload = () => resolve(window.XLSX);
    s.onerror = () => { xlsxPromise = null; reject(new Error("The spreadsheet reader could not be loaded")); };
    document.head.append(s);
  });
  return xlsxPromise;
}

// ---------- value helpers ----------
const pad = (n) => String(n).padStart(2, "0");
const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const cellVal = (v) => (v instanceof Date ? (v.getHours() || v.getMinutes() ? v.toISOString().slice(0, 16) : isoDate(v)) : typeof v === "string" ? (v.replace(/ /g, " ").trim() || null) : v ?? null);
const text = (v) => (v == null ? "" : String(v).replace(/ /g, " ").replace(/\s+/g, " ").trim());
/** "24/01/2026" → "2026-01-24"; a Date → ISO; anything else → null */
export function dmy(v) {
  if (v instanceof Date) return isoDate(v);
  const m = text(v).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? `${m[3]}-${pad(m[2])}-${pad(m[1])}` : null;
}
/** "02/2026" → "2026-02" */
export function my(v) {
  if (v instanceof Date) return isoDate(v).slice(0, 7);
  const m = text(v).match(/(\d{1,2})\s*\/\s*(\d{4})/);
  return m ? `${m[2]}-${pad(m[1])}` : null;
}
/** "9,2 Kg" → [9.2, "kg"]; "583,2 g" → [0.5832, "kg"]; "195g+39g+58,5g" → [0.2925, "kg"] */
export function qty(v) {
  if (typeof v === "number") return [v, "kg"];
  const s = text(v).toLowerCase();
  if (!s || /^n\/?a$/.test(s)) return [null, null];
  let kg = 0, any = false;
  for (const m of s.matchAll(/(\d+(?:[.,]\d+)?)\s*(kg|g)?/g)) { const n = parseFloat(m[1].replace(",", ".")); if (isNaN(n)) continue; kg += m[2] === "g" ? n / 1000 : n; any = true; }
  return any ? [Math.round(kg * 1000) / 1000, "kg"] : [null, null];
}
const months = (v) => { const m = text(v).match(/(\d+)/); return m ? +m[1] : null; };

// ---------- spreadsheet tables ----------
export function readTable(XLSX, ws, cols, headerRow, keep = () => true) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true, blankrows: true });
  let hr = headerRow;
  if (hr == null) hr = rows.findIndex((r) => r && r.includes(cols[0]) && r.includes(cols[1]));
  if (hr < 0) return null;
  const hdr = rows[hr].map((x) => (typeof x === "string" ? x.trim() : x));
  let start = hdr.findIndex((x, i) => x === cols[0] && (cols.length < 2 || hdr[i + 1] === cols[1]));
  if (start < 0) start = hdr.indexOf(cols[0]);
  if (start < 0) return null;
  const idx = cols.map((c) => hdr.indexOf(c, start));
  const out = [];
  for (const r of rows.slice(hr + 1)) {
    if (!r) continue;
    const rec = idx.map((i) => (i < 0 ? null : cellVal(r[i])));
    if (rec.some((x) => x != null) && keep(rec)) out.push(rec);
  }
  return { cols, rows: out };
}

/** Rows of a sheet as objects keyed by a header row found by its first cells. */
function sheetObjects(XLSX, ws, firstHeaders) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true, blankrows: false });
  const hr = rows.findIndex((r) => r && firstHeaders.every((h) => r.some((c) => text(c).toLowerCase() === h.toLowerCase())));
  if (hr < 0) return null;
  const hdr = rows[hr].map(text);
  return rows.slice(hr + 1).map((r) => {
    const o = {};
    hdr.forEach((h, i) => { if (h && !(h in o)) o[h] = r[i] ?? null; });
    return o;
  });
}

// ---------- master workbook ----------
const SHEETS = {
  rooms: "Rooms", adj: "Rooms", equip: "Equipment", sop: "SOP Library", forms: "Logbooks & Forms", ccp: "CCP",
  fmea: "FMEA", impr: "Improvements", appr: "Approvals Log", links: "Record Links", cc: "Import_CC", capa: "Import_CAPA", qe: "Import_QE",
};
const LISTS = { bands: 1, targets: 1, crit: 1, deptMap: 1, prio: 1, prod: 1 };
export const isMaster = (wb) => Boolean(wb.SheetNames?.includes("Import_CC") && wb.SheetNames?.includes("Rooms"));

async function importMaster(XLSX, wb, next, replaced) {
  let n = 0;
  for (const [key, sheet] of Object.entries(SHEETS)) {
    const ws = wb.Sheets[sheet];
    if (!ws) continue;
    const tbl = readTable(XLSX, ws, COLS[key], 2);
    if (tbl) { next[key] = tbl; n++; replaced.push(key); }
  }
  if (wb.Sheets.Lists) {
    for (const [key, need] of Object.entries(LISTS)) {
      const tbl = readTable(XLSX, wb.Sheets.Lists, COLS[key], 0, (r) => r[need] != null && (key === "prod" || key === "deptMap" || key === "targets" || typeof r[need] === "number"));
      if (tbl) { next[key] = tbl; n++; replaced.push(key); }
    }
  }
  next.meta = { ...next.meta, ...readMeta(wb) };
  next.mapGrid = readGrid(XLSX, wb.Sheets["Facility Map"]);
  next.meta.drawing = (await readDrawing(wb)) ?? next.meta.drawing ?? null;
  return `master workbook · ${n} tables`;
}

function readMeta(wb) {
  const v = (sheet, addr) => { const c = wb.Sheets[sheet]?.[addr]; return c == null || c.f ? null : cellVal(c.v); };
  const rows = (sheet, from, to, cols) => {
    const out = [];
    for (let r = from; r <= to; r++) { const row = cols.map((c) => v(sheet, c + r)); if (row[0] != null) out.push(row); }
    return out;
  };
  const settings = {};
  for (const [k, val] of rows("Lists", 2, 10, ["BK", "BL"])) if (val != null) settings[k] = val;
  return {
    asof: v("Home", "C6"), generated: v("Home", "C7"),
    docControl: rows("Home", 10, 16, ["H", "I"]),
    history: rows("Home", 61, 65, ["B", "C"]),
    assumptions: rows("Home", 39, 57, ["B", "C"]),
    inconsistencies: rows("Data Quality", 97, 109, ["B", "C"]),
    reconExpected: Object.fromEntries(rows("Data Quality", 24, 34, ["B", "K"])),
    reviewPeriod: v("Management Review", "D6"),
    annex01: rows("FMEA Risk", 84, 93, ["B", "E", "F", "G", "H", "I"]),
    settings,
  };
}
function readGrid(XLSX, ws) {
  if (!ws) return [];
  const out = [];
  for (let r = 4; r <= 72; r++) {
    const row = [];
    for (let c = 60; c <= 93; c++) row.push(String(ws[XLSX.utils.encode_cell({ r, c })]?.v ?? ""));
    out.push(row);
  }
  return out;
}
async function readDrawing(wb) {
  const key = Object.keys(wb.files ?? {}).find((k) => /xl\/media\/.+\.jpe?g$/i.test(k));
  const content = key && wb.files[key].content;
  if (!content) return null;
  return new Promise((resolve) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => resolve(null);
    fr.readAsDataURL(new Blob([new Uint8Array(content)], { type: "image/jpeg" }));
  });
}

// ---------- Scigeniq exports ----------
const SCIG_KEY = (type) => (/^change/i.test(type) ? "cc" : /^capa$/i.test(type) ? "capa" : /quality event|deviation/i.test(type) ? "qe" : /audit finding/i.test(type) ? "find" : /action/i.test(type) ? "actions" : null);

function importScigeniq(XLSX, wb, next, replaced, file) {
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    const probe = readTable(XLSX, ws, ["Creation Date", "Type"], null);
    if (!probe || !probe.rows.length) continue;
    const key = SCIG_KEY(String(probe.rows[0][1] ?? ""));
    if (!key) continue;
    const tbl = readTable(XLSX, ws, COLS[key], null);
    if (!tbl) continue;
    if (key === "actions") {
      // the all-tasks and open-actions exports carry different columns: merge them by Reference Id
      const id = COLS.actions.indexOf("Reference Id");
      const byId = new Map((next.actions?.rows ?? []).map((r) => [r[id], r]));
      for (const r of tbl.rows) {
        const old = byId.get(r[id]);
        byId.set(r[id], old ? old.map((v, i) => (r[i] != null ? r[i] : v)) : r);
      }
      next.actions = { cols: COLS.actions, rows: [...byId.values()] };
    } else next[key] = tbl;
    if (!replaced.includes(key)) replaced.push(key);
    next.meta.asof = new Date(file.lastModified).toISOString().slice(0, 10);
    return `Scigeniq ${probe.rows[0][1]} · ${tbl.rows.length} rows`;
  }
  return null;
}

// ---------- 5S area-specific checklists (.xlsx) ----------
const is5S = (XLSX, wb) => wb.SheetNames.some((n) => /5S AUDIT CHECKLIST/i.test(text(wb.Sheets[n]?.A1?.v)));

function import5S(XLSX, wb, next, replaced) {
  if (!is5S(XLSX, wb)) return null;
  const index = new Map(); // sheet name → { area, risk, frequency }
  for (const name of wb.SheetNames) {
    const objs = sheetObjects(XLSX, wb.Sheets[name], ["Sheet Name", "Area/Room"]);
    for (const o of objs ?? []) if (o["Sheet Name"]) index.set(text(o["Sheet Name"]), { area: text(o["Area/Room"]), risk: text(o["Risk Classification"]), frequency: text(o["Audit Frequency"]) });
  }
  const profile = new Map(); // area → comparison row
  for (const name of wb.SheetNames) {
    const objs = sheetObjects(XLSX, wb.Sheets[name], ["Area/Room", "Risk Class"]);
    for (const o of objs ?? []) if (o["Area/Room"]) profile.set(text(o["Area/Room"]).toLowerCase(), o);
  }
  const areaCols = COLS.fivesAreas, tplCols = COLS.fivesTpl;
  const old = new Map((next.fivesAreas?.rows ?? []).map((r) => [String(r[0]).toLowerCase(), r]));
  const areas = [], tpl = [], audits = [];
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    const title = text(ws?.A1?.v);
    if (!/5S AUDIT CHECKLIST/i.test(title)) continue;
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true, blankrows: false });
    const flat = rows.slice(0, 5).flat().map(text);
    const field = (label) => { const i = flat.findIndex((c) => c.toLowerCase().startsWith(label)); if (i < 0) return ""; const v = flat[i].slice(flat[i].indexOf(":") + 1).trim(); return v || (flat[i + 1] && !flat[i + 1].includes(":") ? flat[i + 1] : ""); };
    const idx = index.get(name) ?? {};
    const area = field("area:") || idx.area || title.replace(/^.*CHECKLIST\s*-\s*/i, "");
    const prof = profile.get(area.toLowerCase()) ?? {};
    const prev = old.get(area.toLowerCase());
    const rec = {
      Area: area, Code: name, Risk: field("risk:") || idx.risk || text(prof["Risk Class"]) || null, Frequency: field("frequency:") || idx.frequency || null,
      "Key equipment": text(prof["Key Equipment"]) || null, "Critical focus": text(prof["Critical 5S Focus"]) || null, "GMP requirements": text(prof["Unique GMP Requirements"]) || null,
      "Common issues": text(prof["Common Issues"]) || null, Rooms: prev?.[areaCols.indexOf("Rooms")] ?? null, Owner: prev?.[areaCols.indexOf("Owner")] ?? null,
    };
    areas.push(areaCols.map((c) => rec[c] ?? null));
    const hi = rows.findIndex((r) => r.some((c) => /5S Category/i.test(text(c))) && r.some((c) => /Criteria/i.test(text(c))));
    if (hi < 0) continue;
    const h = rows[hi].map(text);
    const ci = { no: h.findIndex((c) => /^No/i.test(c)), cat: h.findIndex((c) => /Category/i.test(c)), crit: h.findIndex((c) => /Criteria/i.test(c)), score: h.findIndex((c) => /^Score/i.test(c)),
      comment: h.findIndex((c) => /Comment/i.test(c)), action: h.findIndex((c) => /Action/i.test(c)), prio: h.findIndex((c) => /Priority/i.test(c)), due: h.findIndex((c) => /Due/i.test(c)) };
    const scores = [], found = [];
    for (const r of rows.slice(hi + 1)) {
      const no = r[ci.no];
      if (typeof no !== "number" || !text(r[ci.crit])) continue;
      tpl.push(tplCols.map((c) => ({ Area: area, No: no, Category: text(r[ci.cat]), Criterion: text(r[ci.crit]) })[c] ?? null));
      const sc = r[ci.score];
      scores.push(typeof sc === "number" ? sc : /^n\/?a$/i.test(text(sc)) ? "-" : "");
      if (typeof sc === "number" && (sc < 2 || text(r[ci.action]))) found.push({ no, cat: text(r[ci.cat]), crit: text(r[ci.crit]), score: sc, comment: text(r[ci.comment]), action: text(r[ci.action]), prio: text(r[ci.prio]), due: dmy(r[ci.due]) });
    }
    // a checklist that was filled in is also an audit
    if (scores.some((v) => typeof v === "number")) {
      const date = dmy(field("audit date:")) ?? null;
      const id = `5S-${(date ?? "").slice(0, 4) || "IMP"}-${name}`;
      audits.push({ "Audit ID": id, Date: date, Area: area, Auditor: field("auditor:") || null, Supervisor: field("supervisor:") || null, Checklist: area, Scale: 3, Scores: scores.map((v) => (v === "" ? "-" : v)).join(","), items: found });
    }
  }
  if (!areas.length) return null;
  const keepTpl = (next.fivesTpl?.rows ?? []).filter((r) => !areas.some((a) => a[0] === r[0]));
  next.fivesAreas = { cols: areaCols, rows: [...[...old.values()].filter((r) => !areas.some((a) => String(a[0]).toLowerCase() === String(r[0]).toLowerCase())), ...areas] };
  next.fivesTpl = { cols: tplCols, rows: [...keepTpl, ...tpl] };
  replaced.push("fivesAreas", "fivesTpl");
  if (audits.length) {
    const fc = COLS.fives, ic = COLS.fivesItems;
    next.fives = { cols: fc, rows: [...(next.fives?.rows ?? []), ...audits.map((a) => fc.map((c) => a[c] ?? null))] };
    next.fivesItems = { cols: ic, rows: [...(next.fivesItems?.rows ?? []), ...audits.flatMap((a) => a.items.map((it) => ic.map((c) => ({ "Audit ID": a["Audit ID"], Area: a.Area, No: it.no, Category: it.cat, Criterion: it.crit, Score: it.score, Comment: it.comment || null, Action: it.action || null, Priority: it.prio || null, Due: it.due, Status: "Open" })[c] ?? null)))] };
    replaced.push("fives", "fivesItems");
  }
  return `5S checklists · ${areas.length} areas · ${tpl.length} criteria${audits.length ? ` · ${audits.length} completed audits` : ""}`;
}

// ---------- APQR programme (Scigeniq APQR export or the master APQR tracker) ----------
const APQR_TASK_ALIASES = { "Reference ID": ["Reference ID", "Reference Id", "Ref ID"], "Closed On": ["Closed On", "Closing date", "Closed on"], "Assigned User": ["Assigned User", "Assignee"], "Dosage Form": ["Dosage Form", "Process"] };
function importApqr(XLSX, wb, next, replaced, file) {
  const out = [];
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    const objs = sheetObjects(XLSX, ws, ["Workflow Stage", "Assigned User"]) ?? sheetObjects(XLSX, ws, ["Workflow Stage", "Assignee"]);
    if (!objs || !objs.length || !Object.keys(objs[0]).some((k) => /^ref/i.test(k))) continue;
    const pick = (o, col) => { for (const k of APQR_TASK_ALIASES[col] ?? [col]) if (o[k] != null) return o[k]; return null; };
    const cols = COLS.apqrTasks;
    const rows = objs.filter((o) => pick(o, "Reference ID") && o.Product).map((o) => cols.map((c) => cellVal(pick(o, c))));
    if (!rows.length) continue;
    next.apqrTasks = { cols, rows };
    replaced.push("apqrTasks");
    const dates = rows.flatMap((r) => [r[cols.indexOf("Created")], r[cols.indexOf("Closed On")]]).filter(Boolean).map(String).sort();
    const reportDate = cellVal(wb.Sheets.Dashboard?.C5?.v);
    next.meta = { ...next.meta, apqrAsOf: (typeof reportDate === "string" && /^\d{4}-/.test(reportDate) ? reportDate : null) ?? dates.at(-1)?.slice(0, 10) ?? new Date(file.lastModified).toISOString().slice(0, 10) };
    out.push(`${rows.length} APQR tasks`);
    break;
  }
  for (const name of wb.SheetNames) {
    const objs = sheetObjects(XLSX, wb.Sheets[name], ["Product", "Review Start"]);
    if (!objs?.length || !("Plan Status" in objs[0] || "Process" in objs[0])) continue;
    const cols = COLS.apqrSys;
    const map = { Product: "Product", Process: "Process", "Exec. year": "Exec. Year", Site: "Site", "Review start": "Review Start", "Review end": "Review End", "Period end": "Period End (date)", "Plan status": "Plan Status" };
    const rows = objs.filter((o) => text(o.Product)).map((o) => cols.map((c) => cellVal(o[map[c]] ?? null)));
    if (!rows.length) continue;
    next.apqrSys = { cols, rows };
    replaced.push("apqrSys");
    out.push(`Scigeniq APQR plan · ${rows.length} products`);
    break;
  }
  return out.length ? `APQR ${out.join(" · ")}` : null;
}

// ---------- batch tracker (.xlsm) ----------
const BATCH_MAP = {
  Product: "Product", "Product Code": "Product code", "BMR No.": "BMR no", "Registration/Comercial": "Purpose", "Pilote/Industrial": "Scale",
  "Validation/Routine": "Batch type", "PV Ref.": "PV ref", "Batch No.": "Batch no", "Date fabrication": "Mfg date", "Date d'exp": "Exp date",
  "Début de Fabrication": "Start manufacturing", "Fin Granulation": "End granulation", "Rendemnt Granulation": "Granulation yield",
  "Date limite de stockage, Granulation": "Granulation hold limit", "Debut Compression/Gelule": "Start compression", "Fin Compression/Gelule": "End compression",
  "Rendement Compression/Gelule": "Compression yield", "Date limite, Compression": "Compression hold limit", "Debut Pelliculage": "Start coating",
  "Fin de Pelliculage": "End coating", "date limite de stockage": "Coating hold limit", "Rendement Fabrication": "Manufacturing yield",
  "Date de remise BMR": "BMR handover", "Début de conditionnement": "Start packaging", "Fin de conditionnement": "End packaging",
  "Rendement Conditionnement": "Packaging yield", "Date de liberation physique": "Physical release", "Date remise BPR": "BPR handover",
  "Date Archivage": "Archiving", "Date release AX": "ERP release", Remarque: "Remark", "Change Control": "Change control", OOS: "OOS", Deviation: "Deviation",
};
function importBatches(XLSX, wb, next, replaced) {
  for (const name of wb.SheetNames) {
    const objs = sheetObjects(XLSX, wb.Sheets[name], ["Product", "Batch No."]);
    if (!objs) continue;
    const cols = COLS.batches;
    const rows = [];
    for (const o of objs) {
      const rec = cols.map(() => null);
      for (const [src, dst] of Object.entries(BATCH_MAP)) {
        const k = Object.keys(o).find((h) => h.toLowerCase() === src.toLowerCase());
        if (!k) continue;
        let v = cellVal(o[k]);
        if (dst === "Batch no" && v != null) v = String(v);
        if (dst === "Product" && v) v = text(v);
        if (["Purpose", "Scale", "Batch type"].includes(dst) && typeof v === "string") v = v.charAt(0).toUpperCase() + v.slice(1).trim();
        rec[cols.indexOf(dst)] = v;
      }
      if (rec[cols.indexOf("Product")] && rec[cols.indexOf("Batch no")]) rows.push(rec);
    }
    if (!rows.length) continue;
    next.batches = { cols, rows };
    replaced.push("batches");
    return `batch tracker · ${rows.length} batches`;
  }
  return null;
}

// ---------- WIP workbook ----------
function importWip(XLSX, wb, next, replaced) {
  const msgs = [];
  const wipSheet = wb.SheetNames.find((n) => /routine wip/i.test(n));
  if (wipSheet) {
    const objs = sheetObjects(XLSX, wb.Sheets[wipSheet], ["Product", "Status"]) ?? [];
    const cols = COLS.wip;
    const pick = (o, re) => o[Object.keys(o).find((k) => re.test(k))];
    const rows = [];
    for (const o of objs) {
      const product = text(pick(o, /^product/i));
      if (!product) continue;
      const [q, unit] = qty(pick(o, /^quantit/i));
      const tf = pick(o, /^time frame/i);
      const tfDate = dmy(tf) ?? (tf instanceof Date ? isoDate(tf) : null);
      const rec = {
        "S.N": pick(o, /^s\.?n/i), Product: product, Batch: text(pick(o, /lot/i)) || null, "Next step": text(pick(o, /suivante|next/i)) || null,
        Status: text(pick(o, /^status/i)) || null, "Mfg date": cellVal(pick(o, /^mfg/i)), "Exp date": cellVal(pick(o, /^exp/i)),
        Quantity: q, Unit: unit, "Deviation / CAPA": text(pick(o, /deviation/i)) || null, Remark: text(pick(o, /remarque|remark/i)) || null,
        Responsibility: text(pick(o, /responsib/i)) || null, "Time frame": tfDate, Comment: tf && !(tf instanceof Date) ? text(tf) : null,
      };
      rows.push(cols.map((c) => rec[c] ?? null));
    }
    next.wip = { cols, rows };
    replaced.push("wip");
    msgs.push(`WIP · ${rows.length} lots`);
  }
  const rejSheet = wb.SheetNames.find((n) => /rejection/i.test(n));
  if (rejSheet) {
    const objs = sheetObjects(XLSX, wb.Sheets[rejSheet], ["Product", "Status"]) ?? [];
    const cols = COLS.rejections;
    const pick = (o, re) => o[Object.keys(o).find((k) => re.test(k))];
    const rows = [];
    for (const o of objs) {
      const report = text(pick(o, /rapport|report/i));
      if (!report) continue;
      const [q, unit] = qty(pick(o, /^quantit/i));
      const rec = {
        "Report no": report, Product: text(pick(o, /^product/i)), Batch: text(pick(o, /batch/i)) || null, "Item code": text(pick(o, /code/i)) || null,
        Status: text(pick(o, /^status/i)) || null, "Mfg date": cellVal(pick(o, /^mfg/i)), "Exp date": cellVal(pick(o, /^exp/i)), Quantity: q, Unit: unit,
        "Deviation / CAPA": text(pick(o, /deviation/i)) || null, Reworks: cellVal(pick(o, /rework/i)), "R&D recommendation": text(pick(o, /r&d/i)) || null,
        "QA comments": text(pick(o, /qa comment/i)) || null,
      };
      rows.push(cols.map((c) => rec[c] ?? null));
    }
    next.rejections = { cols, rows };
    replaced.push("rejections");
    msgs.push(`rejections · ${rows.length} reports`);
  }
  return msgs.length ? msgs.join(" · ") : null;
}

// ---------- Word (.docx) forms ----------
const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

/** All top-level tables of a .docx as arrays of rows of cell strings (merged columns repeated, like Word's grid). */
export function docxTables(XLSX, buffer) {
  const zip = XLSX.CFB.read(new Uint8Array(buffer), { type: "array" });
  const file = XLSX.CFB.find(zip, "/word/document.xml");
  if (!file) throw new Error("Not a Word document");
  const xml = new DOMParser().parseFromString(new TextDecoder().decode(new Uint8Array(file.content)), "application/xml");
  const cellText = (tc) => [...tc.getElementsByTagNameNS(W, "p")].map((p) => [...p.getElementsByTagNameNS(W, "t")].map((t) => t.textContent).join("")).filter((s) => s.trim()).join("\n").trim();
  const nested = (el) => { for (let p = el.parentNode; p; p = p.parentNode) if (p.localName === "tc") return true; return false; };
  const tables = [...xml.getElementsByTagNameNS(W, "tbl")].filter((tbl) => !nested(tbl));
  const body = [...xml.getElementsByTagNameNS(W, "p")].map((p) => [...p.getElementsByTagNameNS(W, "t")].map((t) => t.textContent).join("")).join("\n");
  return {
    text: body,
    tables: tables.map((tbl) => [...tbl.children].filter((e) => e.localName === "tr").map((tr) => {
      const out = [];
      for (const tc of [...tr.children].filter((e) => e.localName === "tc")) {
        const span = +(tc.getElementsByTagNameNS(W, "gridSpan")[0]?.getAttributeNS(W, "val") ?? tc.getElementsByTagNameNS(W, "gridSpan")[0]?.getAttribute("w:val") ?? 1) || 1;
        const s = cellText(tc);
        for (let i = 0; i < span; i++) out.push(s);
      }
      return out;
    })),
  };
}

const findHeader = (rows, ...names) => rows.findIndex((r) => names.every((n) => r.some((c) => text(c).toLowerCase().includes(n.toLowerCase()))));
const colOf = (hdr, name) => hdr.findIndex((c) => text(c).toLowerCase().includes(name.toLowerCase()));

function importTrainingPlan(doc, next, replaced) {
  const all = doc.tables.flat();
  const tbl = doc.tables.find((t) => findHeader(t, "Description of Training") >= 0);
  if (!tbl) return null;
  const yearRow = doc.tables.find((t) => findHeader(t, "Plan of Year") >= 0);
  const year = yearRow ? text(yearRow[findHeader(yearRow, "Plan of Year") + 1]?.[0]) : "";
  const dept = yearRow ? text(yearRow[findHeader(yearRow, "Plan of Year") + 1]?.[1]) : "";
  const abbr = (dept.match(/\b[A-Z]/g) ?? []).join("") || "DEP";
  const hi = findHeader(tbl, "Description of Training");
  const hdr = tbl[hi];
  const c = { prog: colOf(hdr, "Description"), group: colOf(hdr, "Job Description"), planned: colOf(hdr, "Planned"), isNew: colOf(hdr, "New"), resched: colOf(hdr, "Rescheduled"), done: colOf(hdr, "Completion"), comment: colOf(hdr, "Comment") };
  const cols = COLS.training;
  const rows = [];
  let n = 0;
  for (const r of tbl.slice(hi + 1)) {
    const program = text(r[c.prog]);
    if (!program) continue;
    const ref = (program.match(/^(SOP[A-Z0-9]+[A-Z]?\/Onc)/i) ?? [])[1] ?? null;
    const type = /^SOP/i.test(program) ? "SOP" : /HSE/i.test(program) ? "HSE" : /GMP|chapitre|chapter|general chapters/i.test(program) ? "GMP" : /ISO|environ/i.test(program) ? "Quality system" : "Other";
    const done = dmy(r[c.done]) ?? (my(r[c.done]) ? my(r[c.done]) + "-01" : null);
    const resched = my(r[c.resched]);
    const rec = {
      "Training ID": `TR-${year || "YYYY"}-${abbr}-${pad(++n)}`, Program: program, Reference: ref, Type: type, Department: dept || null,
      "Attendee group": text(r[c.group]).replace(/\s*\n\s*/g, " / ") || null, "Planned month": my(r[c.planned]),
      Status: done ? "Completed" : resched ? "Rescheduled" : "Planned", New: text(r[c.isNew]) || null, "Rescheduled to": resched,
      "Completion date": done, Comments: text(r[c.comment]) || null,
    };
    rows.push(cols.map((k) => rec[k] ?? null));
  }
  // a department's plan for a year replaces only that plan; other departments' plans stay
  const keep = (next.training?.rows ?? []).filter((r) => !(r[cols.indexOf("Department")] === (dept || null) && String(r[cols.indexOf("Planned month")] ?? "").startsWith(year)));
  next.training = { cols, rows: [...keep, ...rows] };
  replaced.push("training");
  return `training plan ${dept} ${year} · ${rows.length} trainings`;
}

function calCategory(item, desc) {
  if (/^MD/i.test(item)) return /logger/i.test(desc) ? "Data logger" : "Instrument";
  if (/^BL/i.test(item)) return "Balance";
  if (/^EQ/i.test(item)) return /AHU|BIBO|compress|water|HVAC/i.test(desc) ? "Utility" : "Equipment";
  if (/^(F|T|S|B)F?O?-?\d|^BF/i.test(item)) return "Room / area";
  if (/logger/i.test(item + desc)) return "Data logger";
  return "Equipment";
}

function importCalibration(doc, next, replaced, monthly) {
  const tbl = doc.tables.find((t) => findHeader(t, "Equipment/", "Calibration") >= 0);
  if (!tbl) return null;
  const hi = findHeader(tbl, "Equipment/", "Calibration");
  const hdr = tbl[hi];
  const c = { item: 0, desc: colOf(hdr, "Description"), loc: colOf(hdr, "Location"), dur: colOf(hdr, "Duration"), start: colOf(hdr, "Start"), end: colOf(hdr, "End"), freq: colOf(hdr, "Frequency"), int: colOf(hdr, "Interval"), on: colOf(hdr, "Calibrated") };
  const title = text(doc.tables.flat().flat().find((s) => /calibration program/i.test(s)) ?? "");
  const program = title || (monthly ? "Monthly calibration program" : "Annual calibration program");
  const cols = COLS.calplan;
  const rows = [];
  let parent = null;
  for (const r of tbl.slice(hi + 1)) {
    const item = text(r[c.item]), desc = text(r[c.desc]);
    if (!item && !desc) continue;
    const start = dmy(r[c.start]), freq = months(r[c.freq]);
    const isParent = Boolean(start || freq);
    if (isParent) parent = item || desc;
    const rec = {
      Item: item || desc, Description: desc || null, Location: text(r[c.loc]) || null, Parent: isParent ? null : parent,
      Category: calCategory(item, desc), Duration: text(r[c.dur]) || null, "Planned start": start, "Planned end": dmy(r[c.end]),
      "Frequency (months)": freq, Interval: text(r[c.int]) || null, "Calibrated on": c.on >= 0 ? dmy(r[c.on]) : null, Program: program,
    };
    rows.push(cols.map((k) => rec[k] ?? null));
  }
  const I = (k) => cols.indexOf(k);
  const old = next.calplan?.rows ?? [];
  if (!monthly) {
    // keep completion details already recorded for the same item and planned date
    const done = new Map(old.filter((r) => r[I("Calibrated on")] || r[I("Certificate")] || r[I("Result")]).map((r) => [`${r[I("Item")]}|${r[I("Planned start")]}|${r[I("Parent")]}`, r]));
    for (const r of rows) {
      const o = done.get(`${r[I("Item")]}|${r[I("Planned start")]}|${r[I("Parent")]}`);
      if (o) for (const k of ["Calibrated on", "Certificate", "Performed by", "Result", "Comment"]) r[I(k)] = o[I(k)];
    }
    next.calplan = { cols, rows };
  } else {
    // monthly program: update the matching annual entries (same item, same month), add the others
    const merged = old.map((r) => [...r]);
    for (const r of rows) {
      const month = String(r[I("Planned start")] ?? "").slice(0, 7);
      const hit = merged.find((o) => o[I("Item")] === r[I("Item")] && o[I("Parent")] === r[I("Parent")] && (!month || String(o[I("Planned start")] ?? "").slice(0, 7) === month || (!r[I("Planned start")] && !o[I("Planned start")])));
      if (hit) { for (const k of ["Planned start", "Planned end", "Calibrated on", "Location", "Duration"]) if (r[I(k)] != null) hit[I(k)] = r[I(k)]; }
      else merged.push(r);
    }
    next.calplan = { cols, rows: merged };
  }
  replaced.push("calplan");
  return `${monthly ? "monthly" : "annual"} calibration program · ${rows.length} lines`;
}

function importValidation(doc, next, replaced) {
  const scope = /utility/i.test(doc.tables.flat().flat().join(" ")) ? "Utility" : "Equipment";
  const cols = COLS.validation;
  const rows = [];
  let n = 0;
  for (const tbl of doc.tables) {
    const hi = findHeader(tbl, "Task Name", "Requalification");
    if (hi < 0) continue;
    const hdr = tbl[hi];
    const c = { task: colOf(hdr, "Task Name"), freq: colOf(hdr, "Requalification"), init: colOf(hdr, "Initial"), dur: colOf(hdr, "Duration"), start: colOf(hdr, "Start"), finish: colOf(hdr, "Finish"), done: colOf(hdr, "Completion"), by: colOf(hdr, "Verified") };
    let category = null;
    for (const r of tbl.slice(hi + 1)) {
      const cells = r.map(text);
      if (!cells.some(Boolean)) continue;
      if (new Set(cells.filter(Boolean)).size === 1 && !cells[c.freq]?.match(/year/i)) { category = cells.find(Boolean); if (/checked by/i.test(category)) break; continue; }
      const task = cells[c.task];
      if (!task || /checked by|approved by/i.test(task)) continue;
      const eq = (task.match(/^(EQ\d+[A-Z]?\/Onc)/i) ?? [])[1] ?? null;
      const done = dmy(cells[c.done]) ?? (my(cells[c.done]) ? my(cells[c.done]) + "-01" : null);
      const rec = {
        "Task ID": `VAL-${scope[0]}-${pad(++n)}`, Task: task, Scope: scope, Category: category, Equipment: eq, "Frequency (years)": months(cells[c.freq]),
        "Initial qualification": my(cells[c.init]), Duration: cells[c.dur] || null, "Planned start": my(cells[c.start]), "Planned finish": my(cells[c.finish]),
        "Completion date": done, "Verified by": cells[c.by] || null, Status: done ? "Completed" : "Planned",
      };
      rows.push(cols.map((k) => rec[k] ?? null));
    }
  }
  if (!rows.length) return null;
  const I = (k) => cols.indexOf(k);
  // keep completion data already recorded in the app for the same task
  const old = next.validation?.rows ?? [];
  for (const r of rows) {
    const o = old.find((x) => x[I("Task")] === r[I("Task")] && x[I("Planned start")] === r[I("Planned start")]);
    if (o) for (const k of ["Completion date", "Verified by", "Status", "Report ref", "Comment"]) if (o[I(k)] != null && r[I(k)] == null) r[I(k)] = o[I(k)];
  }
  next.validation = { cols, rows: [...old.filter((r) => r[I("Scope")] !== scope), ...rows] };
  replaced.push("validation");
  return `${scope.toLowerCase()} validation schedule · ${rows.length} tasks`;
}

function importApiList(doc, next, replaced) {
  const tbl = doc.tables.find((t) => findHeader(t, "API Name") >= 0);
  if (!tbl) return null;
  const hi = findHeader(tbl, "API Name");
  const hdr = tbl[hi];
  const c = { api: colOf(hdr, "API Name"), code: colOf(hdr, "Item Code"), mfr: colOf(hdr, "Manufacturer Name"), addr: colOf(hdr, "Adress") >= 0 ? colOf(hdr, "Adress") : colOf(hdr, "Address"), sup: colOf(hdr, "Supplier"), prod: colOf(hdr, "Finished"), r: hdr.findIndex((x) => text(x) === "R"), v: hdr.findIndex((x) => text(x) === "V"), obs: colOf(hdr, "Observation") };
  const cols = COLS.suppliers;
  const rows = [];
  for (const r of tbl.slice(hi + 1)) {
    const raw = String(r[c.api] ?? "");
    if (!raw.trim()) continue;
    const parts = raw.split(/\n|\//).map(text).filter(Boolean);
    const cas = (raw.match(/\d{2,7}-\d{2}-\d/) ?? [])[0] ?? null;
    const grade = parts.filter((p) => /EP|USP|BP|registration/i.test(p)).join(" / ") || null;
    const rec = {
      API: parts[0], Grade: grade, "CAS number": cas, "Item code": text(r[c.code]) || null, Manufacturer: text(r[c.mfr]) || null,
      "Plant address": text(r[c.addr]) || null, Supplier: text(r[c.sup]) || null, "Finished product": text(r[c.prod]) || null,
      Registered: c.r >= 0 && text(r[c.r]) ? "Yes" : null, Variation: c.v >= 0 && text(r[c.v]) ? "Yes" : null,
      "Change control": text(r[c.obs]) || null, "Approval status": c.r >= 0 && text(r[c.r]) ? "Approved" : null,
    };
    rows.push(cols.map((k) => rec[k] ?? null));
  }
  // keep audit dates already entered for the same manufacturer / API
  const I = (k) => cols.indexOf(k);
  for (const r of rows) {
    const o = (next.suppliers?.rows ?? []).find((x) => x[I("API")] === r[I("API")] && x[I("Manufacturer")] === r[I("Manufacturer")]);
    if (o) for (const k of ["Last audit", "Next audit", "Audit type", "Comment"]) if (o[I(k)] != null) r[I(k)] = o[I(k)];
  }
  next.suppliers = { cols, rows };
  replaced.push("suppliers");
  return `registered API list · ${rows.length} entries`;
}

const FR_MONTHS = { jan: 1, janv: 1, fev: 2, fevr: 2, feb: 2, mar: 3, mars: 3, avr: 4, apr: 4, mai: 5, may: 5, juin: 6, jun: 6, juil: 7, jul: 7, aou: 8, aout: 8, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
/** "janv.-26", "juil-26", "Sep-2026" → "2026-01" … */
export function monthYear(v) {
  if (v instanceof Date) return isoDate(v).slice(0, 7);
  const s = text(v).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const m = s.match(/([a-z]+)\.?\s*[-/ ]\s*(\d{2,4})/);
  if (!m || !FR_MONTHS[m[1]]) return my(v);
  const y = m[2].length === 2 ? 2000 + +m[2] : +m[2];
  return `${y}-${pad(FR_MONTHS[m[1]])}`;
}
const FORM_BY_CODE = { TB: "Tablets", CP: "Hard Capsule", LQ: "Liquid/Syrup", SS: "Semi Solid" };
function importApqrPlan(doc, next, replaced) {
  const tbl = doc.tables.find((t) => findHeader(t, "Planned product") >= 0);
  if (!tbl) return null;
  const hi = findHeader(tbl, "Planned product");
  const h = tbl[hi];
  const c = { code: colOf(h, "product code"), product: colOf(h, "Planned product"), month: colOf(h, "Planned Month"), prev: colOf(h, "Previous"), period: colOf(h, "Current report period") };
  const cols = COLS.apqrPlan;
  const rows = [];
  for (const r of tbl.slice(hi + 1)) {
    const product = text(r[c.product]);
    if (!product) continue;
    const [, a, b] = text(r[c.period]).match(/(\d{1,2}\/\d{2,4}).*?(\d{1,2}\/\d{2,4})/) ?? [];
    const ym = (x) => { const m = String(x ?? "").match(/(\d{1,2})\/(\d{2,4})/); return m ? `${m[2].length === 2 ? "20" + m[2] : m[2]}-${pad(m[1])}` : null; };
    const code = text(r[c.code]);
    const rec = { Code: code || null, Product: product, "Dosage form": FORM_BY_CODE[code.slice(0, 2).toUpperCase()] ?? null, "Planned month": monthYear(r[c.month]), "Previous report": text(r[c.prev]) || null, "Period start": ym(a), "Period end": ym(b) };
    rows.push(cols.map((k) => rec[k] ?? null));
  }
  next.apqrPlan = { cols, rows };
  replaced.push("apqrPlan");
  return `APQR annual plan · ${rows.length} products`;
}

function importDocx(XLSX, buffer, next, replaced) {
  const doc = docxTables(XLSX, buffer);
  const all = [doc.text, ...doc.tables.flat().flat()].join(" ");
  // the metrics report also mentions training and calibration, so it is recognised first
  if (/Quality Metrics Report/i.test(all)) return "quality metrics report · metric definitions and targets are built into the QMS metrics page; enter quarterly values there";
  if (/Planned product/i.test(all) && /Final product code/i.test(all)) return importApqrPlan(doc, next, replaced);
  if (/Annual Product Quality Review/i.test(all) && /APQR Owner/i.test(all)) return "APQR procedure · its workflow phases, departmental data streams and Cpk guidance are built into the APQR page";
  if (/Description of Training/i.test(all)) return importTrainingPlan(doc, next, replaced);
  if (/Monthly Calibration Program/i.test(all)) return importCalibration(doc, next, replaced, true);
  if (/Calibration Program/i.test(all)) return importCalibration(doc, next, replaced, false);
  if (/Re-?validation Schedule|Requalification Frequency/i.test(all)) return importValidation(doc, next, replaced);
  if (/API Name|Registered API list/i.test(all)) return importApiList(doc, next, replaced);
  return null;
}

/**
 * Import files into a copy of `base`. Master workbooks go first so exports dropped together
 * replace their lists afterwards. Returns { next, replaced, done: [[file, message]] }.
 */
export async function importFiles(files, base, { needMaster } = {}) {
  const XLSX = await loadXLSX();
  const items = [];
  for (const file of files) {
    const buf = await file.arrayBuffer();
    const ext = file.name.toLowerCase().split(".").pop();
    if (ext === "docx") items.push({ file, buf, kind: "docx", order: 3 });
    else if (["xlsx", "xlsm", "xls"].includes(ext)) {
      const wb = XLSX.read(buf, { cellDates: true, bookFiles: true });
      items.push({ file, wb, kind: "xlsx", order: isMaster(wb) ? 0 : 1 });
    } else items.push({ file, kind: ext === "pptx" ? "slides" : "other", order: 9 });
  }
  items.sort((a, b) => a.order - b.order);
  const next = structuredClone(base ?? emptyData());
  delete next.tr;
  for (const [k, cols] of Object.entries(COLS)) if (!next[k]) next[k] = { cols, rows: [] };
  next.meta ??= {};
  const replaced = [], done = [];
  for (const it of items) {
    let msg = null;
    try {
      if (it.kind === "xlsx") {
        if (isMaster(it.wb)) msg = await importMaster(XLSX, it.wb, next, replaced);
        else msg = import5S(XLSX, it.wb, next, replaced) ?? importApqr(XLSX, it.wb, next, replaced, it.file) ?? importScigeniq(XLSX, it.wb, next, replaced, it.file) ?? importWip(XLSX, it.wb, next, replaced) ?? importBatches(XLSX, it.wb, next, replaced);
      } else if (it.kind === "docx") msg = importDocx(XLSX, it.buf, next, replaced);
      else if (it.kind === "slides") msg = "presentation · nothing to import; quarterly metric values are entered on the QMS metrics page";
      else msg = null;
    } catch (e) { console.error(e); msg = `✘ ${e.message ?? e}`; }
    done.push([it.file.name, msg ?? "✘ not recognised (supported: master workbook, Scigeniq exports, APQR tracker, 5S checklists, batch tracker, WIP workbook, calibration / validation / training / API / APQR plan Word forms)"]);
  }
  if (needMaster && !next.rooms?.rows?.length) throw new Error(needMaster);
  return { next, replaced: [...new Set(replaced)], done };
}
