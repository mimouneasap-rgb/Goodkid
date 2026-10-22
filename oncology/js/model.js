// Pure data model: rebuilds every calculated column of the El Kendi QA master
// workbook from its raw tables. Mirrors the Excel formulas (tQR, tEquip, tFMEA,
// tRooms, tSOP …) so the app and the workbook agree. No DOM access here.

const DAY = 86400000;
const DASH = "-----";

export const TYPES = ["Change Control", "CAPA", "Deviation", "Audit Finding"];
export const STATUSES = ["Open", "Overdue", "Completed", "Canceled"];
export const AGE_BUCKETS = ["0–30", "31–60", "61–90", ">90"];
export const TTC_BUCKETS = ["0–30", "31–60", "61–90", "91–180", ">180"];
export const CAL_STATUSES = ["Overdue", "Due ≤30 d", "Due 31–60 d", "Due 61–90 d", "In date", "Missing date", "No calibration data"];
export const CC_STAGES = ["Open", "In Review", "QA Initial Approval", "Action Implementation", "Closed", "Canceled"];
export const IMPR_STAGES = ["Idea", "Assessed", "In progress", "Done"];

// ---------- small helpers ----------

/** Turn {cols, rows} into an array of objects keyed by column name. */
export function objects(table) {
  if (!table) return [];
  return table.rows.map((r, n) => {
    const o = Object.fromEntries(table.cols.map((c, i) => [c, r[i] ?? null]));
    // row identity for in-app editing (see store.applyEdits): __key addresses the row, __edit is its last change
    o.__key = table.keys?.[n] ?? `i${n}`;
    o.__edit = table.edits?.[n] ?? null;
    return o;
  });
}

/** Scigeniq writes "-----" for empty fields; Excel's TRIM/SUBSTITUTE turns that into "". */
export function clean(v) {
  if (v == null) return "";
  const s = String(v).replace(/\s+/g, " ").trim();
  return s === DASH ? "" : s.replaceAll(DASH, "");
}

/** Midnight UTC timestamp for a Date, ISO string or "dd/mm/yyyy hh:mm am" string. */
export function toDay(v) {
  if (v == null || v === "") return null;
  if (v instanceof Date) return Date.UTC(v.getFullYear(), v.getMonth(), v.getDate());
  if (typeof v === "number") return v;
  const s = String(v).trim();
  let m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return Date.UTC(+m[3], +m[2] - 1, +m[1]);
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3]);
  return null;
}

export const daysBetween = (a, b) => Math.round((b - a) / DAY);

/** EDATE: same day n months later (clamped to month end, like Excel). */
export function addMonths(t, n) {
  const d = new Date(t);
  const y = d.getUTCFullYear(), m = d.getUTCMonth() + n, day = d.getUTCDate();
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return Date.UTC(y, m, Math.min(day, last));
}
export const monthStart = (t) => { const d = new Date(t); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1); };
export const monthKey = (t) => new Date(t).toISOString().slice(0, 7);
export const isoDay = (t) => (t == null ? "" : new Date(t).toISOString().slice(0, 10));

/** Case-insensitive substring test, like Excel SEARCH() without wildcards. */
const has = (hay, needle) => needle !== "" && hay.toLowerCase().includes(needle.toLowerCase());

/** First entry of `list` (in table order) whose key appears in `text` – the workbook's MAX(10000-ROW) trick. */
function firstMatch(list, keyOf, text) {
  if (!text) return null;
  const low = text.toLowerCase();
  for (const item of list) {
    const k = keyOf(item);
    if (k && low.includes(String(k).toLowerCase())) return item;
  }
  return null;
}

/** LOOKUP(value, Min, Level) – the band with the largest Min ≤ value. */
export function bandFor(bands, v) {
  if (v == null || v === "") return "";
  let level = "";
  for (const b of bands) if (v >= b.Min) level = b.Level;
  return level;
}

const num = (v) => (v == null || v === "" || isNaN(+v) ? null : +v);

/** Department named in free text (audited area, audit title, folders). */
export function deptFromText(s) {
  const t = String(s ?? "").toLowerCase();
  const map = [[/warehouse|magasin|stock/, "Warehouse"], [/engineering|maintenance|hvac|utilit/, "Engineering"], [/validation|qualification/, "Validation and Qualification"],
    [/quality control|microbio|laborator|\bqc\b/, "Quality Control"], [/packag|blister|conditionnement/, "Packaging"], [/production|manufactur|fabrication/, "Manufacturing"],
    [/\bit\b|informat|computer/, "IT"], [/hse|ehs|safety|environment/, "HSE"], [/r&d|research|development/, "R&D"], [/regulatory/, "Regulatory Affairs"],
    [/supply chain|procurement|purchas/, "Supply Chain"], [/quality assurance|\bqa\b|documentation|gmp gap|cgmp/, "Quality Assurance"]];
  return map.find(([re]) => re.test(t))?.[1] ?? "";
}

/** CC / CAPA / audit implementation actions (Scigeniq "Actions" export), linked to their parent record. */
export function buildActions(wb, now, deptMap = new Map(), recordByRef = new Map()) {
  return objects(wb.actions).filter((a) => clean(a["Reference Id"])).map((a) => {
    const status = clean(a.Status);
    const opened = toDay(clean(a["Creation Date"]));
    const due = toDay(clean(a["End Date"]));
    const closed = toDay(clean(a["Closing date"]));
    const isOpen = status === "Open" || status === "Overdue";
    const dRaw = clean(a.Department) || clean(a.Location);
    const parentRef = clean(a["Parent ID Reference"]);
    const parent = parentRef ? recordByRef.get(parentRef) : null;
    const parentType = clean(a["Parent Type"]) || clean(a.Source) || (parentRef.startsWith("CC-") ? "Change Control" : parentRef.startsWith("CAPA-") ? "CAPA" : "");
    return {
      ref: clean(a["Reference Id"]), title: clean(a.Title), description: clean(a.Description), stage: clean(a.Stage), status, type: clean(a.Type),
      opened, due, closed, owner: clean(a["Assigned User"]) || clean(a.Role),
      department: dRaw ? deptMap.get(dRaw) ?? dRaw : parent?.department ?? "(Unassigned)",
      parentRef, parentType, origin: clean(a["Parent Parent Source"]) || parentType, parentTitle: clean(a["Parent action"]).replace(/^Task\s*-\s*/i, ""),
      tags: clean(a.Tags), isOpen,
      daysLate: isOpen && due != null ? Math.max(0, daysBetween(due, now)) : 0,
      overdue: status === "Overdue" || (isOpen && due != null && due < now),
      daysToClose: closed != null && opened != null ? daysBetween(opened, closed) : null,
      closedLate: closed != null && due != null ? (closed > due ? 1 : 0) : null,
      month: opened == null ? "" : monthKey(opened),
      __key: a.__key, __edit: a.__edit,
    };
  });
}

// ---------- build ----------

/**
 * Build the full model from the raw workbook data.
 * @param {object} wb   raw tables as produced by tools/extract_workbook.py or the in-app importer
 * @param {object} opts today: timestamp (defaults to now); links/approvals: extra user-entered rows
 */
export function buildModel(wb, opts = {}) {
  const now = opts.today ?? toDay(new Date());

  const bands = objects(wb.bands).map((b) => ({ ...b, Min: +b.Min, Max: +b.Max }));
  const crit = objects(wb.crit);
  const critWeight = (level) => crit.find((c) => c.Level === level)?.Weight ?? null;
  const prioW = objects(wb.prio);
  const deptMap = new Map(objects(wb.deptMap).map((d) => [d.Alias, d.Department]));
  const prod = objects(wb.prod);
  const targets = Object.fromEntries(objects(wb.targets).map((t) => [t.Key, { label: t.KPI, target: +t.Target, warning: +t.Warning, note: t.Note }]));
  const st = wb.meta?.settings ?? {};
  const prioCap = num(st["Priority: max points for lateness (1 point / 30 days late)"]) ?? 12;
  const prioSoon = num(st["Priority: bonus if due within 14 days"]) ?? 2;
  const prioDev = num(st["Priority: bonus for deviations"]) ?? 1;

  // ----- rooms (inputs) -----
  const rooms = objects(wb.rooms).filter((r) => r.Code);
  const roomByCode = new Map(rooms.map((r) => [r.Code, r]));

  // ----- equipment -----
  const equipRaw = objects(wb.equip).filter((e) => e["Asset no"]);
  const assetCount = new Map();
  for (const e of equipRaw) assetCount.set(e["Asset no"], (assetCount.get(e["Asset no"]) ?? 0) + 1);
  const equip = equipRaw.map((e) => {
    const asset = String(e["Asset no"]);
    const cut = Math.min(...["-", "/"].map((c) => (asset.indexOf(c) >= 0 ? asset.indexOf(c) : 99)));
    const searchKey = cut < 99 ? asset.slice(0, cut) : asset;
    const freq = num(e["Calibration frequency (months)"]);
    const last = toDay(e["Last calibration"]);
    const next = freq != null && last != null ? addMonths(last, freq) : null;
    const daysToDue = next != null ? daysBetween(now, next) : null;
    let calStatus;
    if (freq == null) calStatus = "No calibration data";
    else if (last == null) calStatus = "Missing date";
    else if (daysToDue < 0) calStatus = "Overdue";
    else if (daysToDue <= 30) calStatus = "Due ≤30 d";
    else if (daysToDue <= 60) calStatus = "Due 31–60 d";
    else if (daysToDue <= 90) calStatus = "Due 61–90 d";
    else calStatus = "In date";
    const dq = [];
    if (!e["Room code"]) dq.push("No room code");
    if (assetCount.get(asset) > 1) dq.push("Duplicate asset no");
    if (!e["Qualification status"]) dq.push("No qualification status");
    if (freq == null) dq.push("No calibration frequency");
    else if (last == null) dq.push("No calibration date");
    if (e["Known issues"]) dq.push("Known issue");
    return { ...e, searchKey, freq, last, next, daysToDue, calStatus, dueMonth: next != null ? monthStart(next) : null, dataQuality: dq };
  });

  // ----- record links & approvals (workbook rows + rows confirmed in the app) -----
  const links = [...objects(wb.links), ...(opts.links ?? [])].filter((l) => l["Ref ID"]);
  const linkByRef = new Map();
  for (const l of links) linkByRef.set(l["Ref ID"], l); // later rows win
  const approvals = [...objects(wb.appr), ...(opts.approvals ?? [])].filter((a) => a.Record);

  // ----- quality records (tQR) -----
  const sources = [
    ["Change Control", objects(wb.cc)],
    ["CAPA", objects(wb.capa)],
    ["Deviation", objects(wb.qe)],
    ["Audit Finding", objects(wb.find)],
  ];
  const records = [];
  for (const [type, rows] of sources) {
    for (const r of rows) {
      if (!clean(r["Reference Id"])) continue;
      const isCC = type === "Change Control", isCAPA = type === "CAPA", isQE = type === "Deviation", isAF = type === "Audit Finding";
      let classRaw = "";
      if (isCC) classRaw = clean(r["CC Classification"]);
      else if (isQE) classRaw = clean(r["Final Event Classification"]) || clean(r["Initial QE Class"]);
      else if (isAF) classRaw = clean(r.Classification);
      let deptRaw = isCC ? clean(r.Department) || clean(r.Location) : isCAPA ? clean(r["Responsible Department"]) : isAF ? clean(r.Location) || deptFromText(`${clean(r["Audited Areas"])} ${clean(r["Parent action"])} ${clean(r.Folders)}`) : clean(r.Location);
      const deptFirst = deptRaw.split(",")[0].trim();
      const department = deptRaw === "" ? "(Unassigned)" : deptMap.get(deptFirst) ?? deptFirst;
      const rec = {
        ref: clean(r["Reference Id"]),
        type,
        title: clean(r.Title),
        stage: clean(r.Stage),
        status: clean(r.Status),
        classification: classRaw || "(Not classified)",
        department,
        product: clean(isCC ? r.Products : r["Product Record"]),
        batch: isQE ? clean(r["Product Batch No."]) : "",
        rootCause: isQE ? clean(r["Root Cause"]) : "",
        opened: toDay(clean(r["Creation Date"])),
        due: toDay(clean(r["End Date"])),
        closed: toDay(clean(r["Closing date"])),
        owner: clean(r["Assigned User"]) || clean(r.Role),
        parentRef: isCAPA || isAF ? clean(r["Parent ID Reference"]) : "",
        effCheck: isCAPA ? clean(r["Effectiveness Check required?"]) : "",
        capaRequired: isQE ? clean(r["CAPA Required_?"]) : "",
        scope: isCC ? clean(r["Change Scope"]) : isQE ? clean(r["Quality Event Scope"]) : isAF ? clean(r["Finding Type"]) : "",
        source: isCAPA ? clean(r.Source) : isAF ? clean(r["Audited Areas"]) : "",
        tags: clean(r.Tags),
        audit: isAF ? clean(r["Parent action"]).replace(/^Task\s*-\s*/i, "") : "",
        supplier: isAF ? clean(r["Supplier Name"]) : "",
        initialClass: isQE ? clean(r["Initial QE Class"]) : "",
        finalClass: isQE ? clean(r["Final Event Classification"]) : "",
        folders: clean(r.Folders),
        zone: clean(r.Zone),
        parentAction: clean(r["Parent action"]),
        proposed: isCC ? clean(r["Proposed State"]) : "",
        current: isCC ? clean(r["Current State"]) : "",
        justification: isCC ? clean(r.Justification) : "",
        createdBy: clean(r["Created By"]),
        raw: r,
        srcTable: { "Change Control": "cc", CAPA: "capa", Deviation: "qe", "Audit Finding": "find" }[type],
        srcKey: r.__key,
        edit: r.__edit,
      };
      const search = `${rec.title} | ${rec.zone} | ${rec.parentAction} | ${rec.proposed}`;
      const link = linkByRef.get(rec.ref);
      const sugRoom = firstMatch(rooms, (x) => x.Code, search);
      rec.roomCode = link?.["Room code"] || sugRoom?.Code || "";
      rec.roomLink = link?.["Room code"] ? "Confirmed" : rec.roomCode ? "Suggested" : "Missing";
      const sugAsset = firstMatch(equip, (x) => x.searchKey, search);
      rec.assetNo = link?.["Asset no"] || sugAsset?.["Asset no"] || "";
      rec.productKey = firstMatch(prod, (x) => x["Search key"], `${rec.title} ${rec.product}`)?.Product ?? "";
      const appr = approvals.filter((a) => a.Record === rec.ref).at(-1);
      rec.approval = appr?.Action ?? "";
      records.push(rec);
    }
  }

  // derived per-record fields
  const childCount = new Map();
  for (const r of records) if (r.parentRef) childCount.set(r.parentRef, (childCount.get(r.parentRef) ?? 0) + 1);
  for (const r of records) {
    r.isOpen = r.status === "Open" || r.status === "Overdue";
    r.daysOpen = r.opened == null ? null : daysBetween(r.opened, r.closed ?? now);
    r.daysToClose = r.status === "Completed" && r.closed != null && r.opened != null ? daysBetween(r.opened, r.closed) : null;
    r.daysLate = r.isOpen && r.due != null ? Math.max(0, daysBetween(r.due, now)) : 0;
    r.overdue = r.status === "Overdue" || r.daysLate > 0;
    r.ageBucket = !r.isOpen ? "" : r.daysOpen <= 30 ? "0–30" : r.daysOpen <= 60 ? "31–60" : r.daysOpen <= 90 ? "61–90" : ">90";
    const t = r.daysToClose;
    r.ttcBucket = t == null ? "" : t <= 30 ? "0–30" : t <= 60 ? "31–60" : t <= 90 ? "61–90" : t <= 180 ? "91–180" : ">180";
    r.year = r.opened == null ? null : new Date(r.opened).getUTCFullYear();
    r.month = r.opened == null ? "" : monthKey(r.opened);
    r.linkedCapas = r.type === "Deviation" || r.type === "Audit Finding" ? childCount.get(r.ref) ?? 0 : null;
    r.vqFolder = has(r.folders, "Validation and Qualification");
    r.daysToDue = r.isOpen && r.due != null ? daysBetween(now, r.due) : null;
    r.closedLate = r.closed != null && r.due != null ? (r.closed > r.due ? 1 : 0) : null;
    if (r.isOpen) {
      const cw = prioW.find((p) => p.Factor === r.classification)?.Weight ?? 1;
      const rw = critWeight(roomByCode.get(r.roomCode)?.Criticality) ?? 1;
      const soon = r.daysToDue != null && r.daysToDue >= 0 && r.daysToDue <= 14 ? prioSoon : 0;
      r.priority = Math.round((cw * rw + Math.min(prioCap, r.daysLate / 30) + soon + (r.type === "Deviation" ? prioDev : 0)) * 10) / 10;
    } else r.priority = null;
    r.classFlags = [];
    if (r.type === "Deviation") {
      if ((r.initialClass === "Major" || r.initialClass === "Critical") && r.capaRequired !== "Yes") r.classFlags.push("F1");
      if (r.finalClass && r.initialClass && r.finalClass !== r.initialClass) r.classFlags.push("F2");
      if (r.status === "Completed" && !r.initialClass && !r.finalClass) r.classFlags.push("F3");
      if (r.capaRequired === "Yes" && !r.linkedCapas) r.classFlags.push("F4");
    }
    r.vqGap = r.type === "Change Control" && r.status !== "Canceled" && !r.vqFolder && ["Equipment", "Facility", "System", "Instrument"].some((w) => has(r.scope, w));
    r.dataQuality = [];
    if (!r.roomCode) r.dataQuality.push("No room");
    if (r.department === "(Unassigned)") r.dataQuality.push("No department");
    if (r.classification === "(Not classified)") r.dataQuality.push("Not classified");
    if (r.due == null) r.dataQuality.push("No due date");
  }
  const recordByRef = new Map(records.map((r) => [r.ref, r]));

  // ----- FMEA -----
  const fmea = objects(wb.fmea).filter((f) => f["Risk ID"]).map((f) => {
    const S = num(f.S), O = num(f.O), D = num(f.D);
    const rS = num(f["Residual S"]), rO = num(f["Residual O"]), rD = num(f["Residual D"]);
    const rpn = S != null && O != null && D != null ? S * O * D : null;
    const rrpn = rS != null && rO != null && rD != null ? rS * rO * rD : null;
    const due = toDay(f.Due);
    const check = [];
    const rep = num(f["Reported RPN"]), repR = num(f["Reported residual RPN"]);
    if (rep != null && rpn != null && rep !== rpn) check.push(`Initial reported ${rep} ≠ ${rpn}`);
    if (repR != null && rrpn != null && repR !== rrpn) check.push(`Residual reported ${repR} ≠ ${rrpn}`);
    const dq = [];
    if (!f["Room code"]) dq.push("No room (site-wide)");
    if (rrpn == null) dq.push("Residual not scored");
    if (due == null) dq.push("No due date");
    return {
      ...f, S, O, D, rS, rO, rD, rpn, rrpn, due,
      level: bandFor(bands, rpn), rlevel: bandFor(bands, rrpn),
      reduction: rpn && rrpn != null ? 1 - rrpn / rpn : null,
      rpnCheck: check, actionOverdue: due != null && due < now && rrpn == null, dataQuality: dq,
    };
  });

  // ----- rooms (derived) -----
  for (const room of rooms) {
    const eq = equip.filter((e) => e["Room code"] === room.Code);
    const qr = records.filter((r) => r.roomCode === room.Code);
    const fm = fmea.filter((f) => f["Room code"] === room.Code && f.rpn != null);
    room.equipment = eq.length;
    room.gmpCritical = eq.filter((e) => e["GMP critical"] === "Y").length;
    room.qualityRecords = qr.length;
    room.openOrOverdue = qr.filter((r) => r.isOpen).length;
    room.maxRpn = fm.length ? Math.max(...fm.map((f) => f.rpn)) : 0;
    room.critWeight = critWeight(room.Criticality) ?? 0;
    room.riskScore = room.maxRpn * room.critWeight;
    room.overdueCals = eq.filter((e) => e.calStatus === "Overdue").length;
    room.dataGaps = [!room.Grade && "Grade", room["OEB level"] == null && "OEB", room["Pressure set-point (Pa)"] == null && "Pressure"].filter(Boolean);
  }
  const adj = objects(wb.adj).filter((a) => a.Room).map((a) => {
    const sp = num(roomByCode.get(a.Room)?.["Pressure set-point (Pa)"]);
    const asp = num(roomByCode.get(a["Adjacent room"])?.["Pressure set-point (Pa)"]);
    return { ...a, roomSp: sp, adjSp: asp, dp: sp != null && asp != null ? sp - asp : null };
  });

  // ----- SOPs & forms -----
  const sops = objects(wb.sop).filter((s) => s.Code).map((s) => {
    const next = toDay(s["Next review"]);
    const dtr = next != null ? daysBetween(now, next) : null;
    const reviewStatus = next == null ? "No review date" : dtr < 0 ? "Overdue" : dtr <= 90 ? "Due ≤90 d" : "In date";
    const dq = [];
    if (next == null) dq.push("No review date");
    if (!s["Linked rooms"] && !s["Linked equipment"]) dq.push("No linked room/equipment");
    if (!s.Language) dq.push("Language unknown");
    return { ...s, next, daysToReview: dtr, reviewStatus, dataQuality: dq };
  });
  const forms = objects(wb.forms).filter((f) => f["Form code"]).map((f) => ({
    ...f, dataQuality: [!f["Linked room"] && "No linked room", !f.Revision && "No revision"].filter(Boolean),
  }));

  return {
    now, asof: toDay(wb.meta?.asof), meta: wb.meta ?? {},
    bands, crit, targets, prio: prioW, products: prod, prioCap, prioSoon, prioDev,
    rooms, roomByCode, adj, equip, records, recordByRef, fmea, sops, forms,
    ccp: objects(wb.ccp).filter((c) => c["CCP ID"]),
    impr: objects(wb.impr).filter((i) => i.ID),
    approvals, links,
    mapGrid: wb.mapGrid ?? [],
    counts: { cc: sources[0][1].filter((r) => clean(r["Reference Id"])).length, capa: sources[1][1].filter((r) => clean(r["Reference Id"])).length, qe: sources[2][1].filter((r) => clean(r["Reference Id"])).length, find: sources[3][1].filter((r) => clean(r["Reference Id"])).length },
    actions: buildActions(wb, now, deptMap, recordByRef),
  };
}

// ---------- analytics ----------

export const ALL = "(All)";

/** Dashboard filter (InFilter column). */
export function applyFilters(records, f = {}) {
  return records.filter((r) =>
    (!f.type || f.type === ALL || r.type === f.type) &&
    (!f.status || f.status === ALL || r.status === f.status) &&
    (!f.dept || f.dept === ALL || r.department === f.dept) &&
    (!f.cls || f.cls === ALL || r.classification === f.cls) &&
    (!f.room || f.room === ALL || r.roomCode === f.room) &&
    (!f.year || f.year === ALL || r.year === +f.year) &&
    (!f.from || f.from === ALL || (r.opened ?? 0) >= toDay(f.from + "-01")) &&
    (!f.to || f.to === ALL || (r.opened ?? 0) < addMonths(toDay(f.to + "-01"), 1)));
}

export const countBy = (arr, key) => {
  const m = new Map();
  for (const x of arr) { const k = typeof key === "function" ? key(x) : x[key]; m.set(k, (m.get(k) ?? 0) + 1); }
  return m;
};
const ratio = (a, b) => (b ? a / b : 0);
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** Was the record open (opened, not yet closed) at the end of day t? */
export function openAt(r, t) {
  if (r.opened == null || r.opened > t) return false;
  if (r.closed != null) return r.closed > t;
  return r.isOpen;
}

/** Dashboard KPI block for a (filtered) set of records. */
export function kpis(recs, now) {
  const total = recs.length;
  const canceled = recs.filter((r) => r.status === "Canceled").length;
  const completed = recs.filter((r) => r.status === "Completed").length;
  const open = recs.filter((r) => r.status === "Open").length;
  const overdue = recs.filter((r) => r.overdue).length;
  const major = recs.filter((r) => r.classification === "Major" || r.classification === "Critical").length;
  const ttc = recs.filter((r) => r.status === "Completed" && r.daysToClose != null).map((r) => r.daysToClose);
  const ago = now - 30 * DAY, ago2 = now - 60 * DAY;
  const inWin = (t, a, b) => t != null && t > a && t <= b;
  const openedLast = recs.filter((r) => inWin(r.opened, ago, now)).length;
  const openedPrev = recs.filter((r) => inWin(r.opened, ago2, ago)).length;
  const closedLast = recs.filter((r) => r.status === "Completed" && inWin(r.closed, ago, now)).length;
  const closedPrev = recs.filter((r) => r.status === "Completed" && inWin(r.closed, ago2, ago)).length;
  const majorLast = recs.filter((r) => (r.classification === "Major" || r.classification === "Critical") && inWin(r.opened, ago, now)).length;
  const majorPrev = recs.filter((r) => (r.classification === "Major" || r.classification === "Critical") && inWin(r.opened, ago2, ago)).length;
  const openThen = recs.filter((r) => r.status !== "Canceled" && openAt(r, ago)).length;
  const overdueThen = recs.filter((r) => r.status !== "Canceled" && openAt(r, ago) && r.due != null && r.due < ago).length;
  const isOpenN = recs.filter((r) => r.isOpen).length;
  return {
    total, open, overdue, completed, canceled, major, isOpen: isOpenN,
    closure: ratio(completed, total - canceled),
    avgDays: ttc.length ? Math.round(avg(ttc)) : null,
    devNoCapa: recs.filter((r) => r.type === "Deviation" && r.capaRequired === "Yes" && r.linkedCapas === 0).length,
    capaNoEc: recs.filter((r) => r.type === "CAPA" && r.status !== "Canceled" && r.effCheck !== "Yes").length,
    cc90: recs.filter((r) => r.type === "Change Control" && r.isOpen && r.daysOpen > 90).length,
    overdueRate: ratio(overdue, isOpenN),
    delta: {
      total: openedLast - openedPrev,
      open: isOpenN - openThen,
      overdue: overdue - overdueThen,
      completed: closedLast - closedPrev,
      major: majorLast - majorPrev,
    },
    overdueRateThen: ratio(overdueThen, openThen),
  };
}

/** Months (timestamps of the 1st) ending with the current month. */
export function lastMonths(now, n) {
  const start = monthStart(now);
  return Array.from({ length: n }, (_, i) => addMonths(start, i - n + 1));
}

/** Opened / closed per month with 3-month moving average (Dashboard trend). */
export function trend(recs, now, n = 24) {
  return lastMonths(now, n).map((m) => {
    const end = addMonths(m, 1);
    const inM = (t, a, b) => t != null && t >= a && t < b;
    return {
      month: monthKey(m),
      opened: recs.filter((r) => inM(r.opened, m, end)).length,
      closed: recs.filter((r) => inM(r.closed, m, end)).length,
      ma3: Math.round((recs.filter((r) => inM(r.opened, addMonths(m, -2), end)).length / 3) * 10) / 10,
    };
  });
}

/** Status of a KPI against its target: 3 on target, 2 watch, 1 action. */
export function rag(value, t, higherIsBetter) {
  if (value == null || t == null || isNaN(value)) return 0;
  if (higherIsBetter) return value >= t.target ? 3 : value >= t.warning ? 2 : 1;
  return value <= t.target ? 3 : value <= t.warning ? 2 : 1;
}

/** Calibration compliance = (with frequency − overdue − missing date) / with frequency. */
export function calCompliance(equip) {
  const withFreq = equip.filter((e) => e.freq != null).length;
  const bad = equip.filter((e) => e.calStatus === "Overdue" || e.calStatus === "Missing date").length;
  return ratio(withFreq - bad, withFreq);
}

/** Site-level management-review scorecard (ICH Q10). */
export function scorecard(m) {
  const R = m.records, now = m.now, T = m.targets;
  const k = kpis(R, now);
  const closedLate = R.filter((r) => r.closedLate != null);
  const capaOpen = R.filter((r) => r.type === "CAPA" && r.isOpen).length;
  const capaNC = R.filter((r) => r.type === "CAPA" && r.status !== "Canceled");
  const devReq = R.filter((r) => r.type === "Deviation" && r.capaRequired === "Yes");
  const v = {
    open: k.isOpen,
    odr: k.overdueRate,
    clos: k.closure,
    days: k.avgDays,
    late: ratio(closedLate.filter((r) => r.closedLate === 1).length, closedLate.length),
    due30: R.filter((r) => r.daysToDue != null && r.daysToDue >= 0 && r.daysToDue <= 30).length,
    capaod: ratio(R.filter((r) => r.type === "CAPA" && r.overdue).length, capaOpen),
    ec: ratio(capaNC.filter((r) => r.effCheck === "Yes").length, capaNC.length),
    link: devReq.length ? ratio(devReq.filter((r) => r.linkedCapas > 0).length, devReq.length) : null,
    dev90: R.filter((r) => r.type === "Deviation" && r.opened != null && r.opened >= now - 90 * DAY).length,
    cc90: k.cc90,
    ccvq: R.filter((r) => r.vqGap).length,
    cal: calCompliance(m.equip),
    rh: m.fmea.filter((f) => f.rlevel === "High").length,
    sop: m.sops.filter((s) => s.reviewStatus === "Overdue").length,
    dq: ratio(R.filter((r) => r.roomCode).length, R.length),
  };
  const rows = [
    ["mk_open", "ar_qms", v.open, null, null, "n"],
    ["mk_odr", "ar_qms", v.odr, T.overdue, false, "%"],
    ["mk_clos", "ar_qms", v.clos, T.closure, true, "%"],
    ["mk_days", "ar_qms", v.days, T.days_close, false, "d"],
    ["mk_late", "ar_qms", v.late, T.late, false, "%"],
    ["mk_due30", "ar_qms", v.due30, null, null, "n"],
    ["mk_capaod", "ar_capa", v.capaod, T.overdue, false, "%"],
    ["mk_ec", "ar_capa", v.ec, T.capa_ec, true, "%"],
    ["mk_link", "ar_dev", v.link, T.link, true, "%"],
    ["mk_dev90", "ar_dev", v.dev90, null, null, "n"],
    ["mk_cc90", "ar_cc", v.cc90, T.cc90, false, "n"],
    ["mk_ccvq", "ar_cc", v.ccvq, T.ccvq, false, "n"],
    ["mk_cal", "ar_eq", v.cal, T.cal, true, "%"],
    ["mk_rh", "ar_risk", v.rh, T.res_high, false, "n"],
    ["mk_sop", "ar_doc", v.sop, T.sop_od, false, "n"],
    ["mk_dq", "ar_di", v.dq, T.dq_room, true, "%"],
  ].map(([key, area, value, target, hib, unit]) => ({ key, area, value, target, hib, unit, status: target ? rag(value, target, hib) : 0 }));
  return { values: v, rows, kpis: k };
}

/** c-chart of records opened per month, with WE/Nelson rule signals. */
export function cChart(records, now, { type = ALL, baseline = "all" } = {}) {
  const recs = type === ALL ? records : records.filter((r) => r.type === type);
  const months = lastMonths(now, 24);
  const counts = months.map((m) => recs.filter((r) => r.opened != null && r.opened >= m && r.opened < addMonths(m, 1)).length);
  const base = baseline === "phase1" ? counts.slice(0, 12) : counts;
  const cl = Math.round(avg(base) * 100) / 100;
  const ucl = Math.round((cl + 3 * Math.sqrt(cl)) * 100) / 100;
  const lcl = Math.round(Math.max(0, cl - 3 * Math.sqrt(cl)) * 100) / 100;
  const pts = months.map((m, i) => ({ month: monthKey(m), value: counts[i], cl, ucl, lcl, signals: [] }));
  markSignals(pts, (p) => p.value > p.ucl || (p.lcl > 0 && p.value < p.lcl));
  return { points: pts, cl, ucl, lcl };
}

/** p-chart of the share of records closed after their due date, by month of closure. */
export function pChart(records, now, { type = ALL, baseline = "all" } = {}) {
  const recs = (type === ALL ? records : records.filter((r) => r.type === type)).filter((r) => r.closedLate != null);
  const months = lastMonths(now, 24);
  const raw = months.map((m) => {
    const inM = recs.filter((r) => r.closed >= m && r.closed < addMonths(m, 1));
    return { month: monthKey(m), n: inM.length, x: inM.filter((r) => r.closedLate === 1).length };
  });
  const base = baseline === "phase1" ? raw.slice(0, 12) : raw;
  const sn = base.reduce((a, b) => a + b.n, 0), sx = base.reduce((a, b) => a + b.x, 0);
  const pbar = ratio(sx, sn);
  const pts = raw.map((p) => {
    if (!p.n) return { ...p, value: null, cl: pbar, ucl: null, lcl: null, signals: [] };
    const s = 3 * Math.sqrt((pbar * (1 - pbar)) / p.n);
    return { ...p, value: p.x / p.n, cl: pbar, ucl: Math.min(1, pbar + s), lcl: Math.max(0, pbar - s), signals: [] };
  });
  markSignals(pts, (p) => p.value != null && (p.value > p.ucl || p.value < p.lcl));
  return { points: pts, pbar, n: raw.reduce((a, b) => a + b.n, 0), x: raw.reduce((a, b) => a + b.x, 0) };
}

/** R1 beyond limits; R2 8 in a row on one side of CL; R3 6 steadily rising/falling. */
function markSignals(pts, beyond) {
  const valid = pts.filter((p) => p.value != null);
  for (const p of valid) if (beyond(p)) p.signals.push("R1");
  for (let i = 7; i < valid.length; i++) {
    const run = valid.slice(i - 7, i + 1);
    if (run.every((p) => p.value > p.cl) || run.every((p) => p.value < p.cl)) for (const p of run) if (!p.signals.includes("R2")) p.signals.push("R2");
  }
  for (let i = 5; i < valid.length; i++) {
    const run = valid.slice(i - 5, i + 1);
    const up = run.every((p, j) => j === 0 || p.value > run[j - 1].value);
    const down = run.every((p, j) => j === 0 || p.value < run[j - 1].value);
    if (up || down) for (const p of run) if (!p.signals.includes("R3")) p.signals.push("R3");
  }
}

/** Open and overdue backlog at each month-end. */
export function backlog(records, now, type = ALL) {
  const recs = type === ALL ? records : records.filter((r) => r.type === type);
  return lastMonths(now, 24).map((m) => {
    const end = Math.min(addMonths(m, 1) - DAY, now);
    const open = recs.filter((r) => r.opened != null && r.opened <= end && ((r.closed == null && r.isOpen) || (r.closed != null && r.closed > end)));
    return { month: monthKey(m), open: open.length, overdue: open.filter((r) => r.due != null && r.due < end).length };
  });
}

/** Reconciliation checks from the Data Quality sheet. */
export function reconciliation(m) {
  const R = m.records;
  const by = (type, status) => R.filter((r) => r.type === type && (!status || r.status === status)).length;
  const rows = [
    ["Import_CC rows = Change Control rows in Quality Records", m.counts.cc, by("Change Control")],
    ["Import_CAPA rows = CAPA rows in Quality Records", m.counts.capa, by("CAPA")],
    ["Import_QE rows = Deviation rows in Quality Records", m.counts.qe, by("Deviation")],
    ...(m.counts.find ? [["Audit Findings export rows = Audit Finding rows in Quality Records", m.counts.find, by("Audit Finding")]] : []),
    ["Open + Overdue + Completed + Canceled = all records", R.length, STATUSES.reduce((a, s) => a + R.filter((r) => r.status === s).length, 0)],
    ["Equipment room codes all exist in Rooms", 0, m.equip.filter((e) => e["Room code"] && !m.roomByCode.has(e["Room code"])).length],
    ["FMEA room codes all exist in Rooms", 0, m.fmea.filter((f) => f["Room code"] && !m.roomByCode.has(f["Room code"])).length],
  ];
  const exp = m.meta.reconExpected ?? {};
  for (const [label, expected] of Object.entries(exp)) {
    const mm = label.match(/: (Change Control|CAPA|Deviation) “(\w+)”/);
    if (mm) rows.push([`Scigeniq overview: ${mm[1]} “${mm[2]}”`, expected, by(mm[1], mm[2])]);
  }
  return rows.map(([label, expected, actual]) => ({ label, expected, actual, ok: expected === actual }));
}
