// Core quality-risk logic (FMEA / ICH Q9 style). Pure functions, no DOM access,
// so the same module runs in the browser and under `node --test`.

export const SCALE_MIN = 1;
export const SCALE_MAX = 5;

export const SEVERITY_LABELS = {
  1: "Negligible", 2: "Minor", 3: "Moderate", 4: "Major", 5: "Critical",
};
export const OCCURRENCE_LABELS = {
  1: "Rare", 2: "Unlikely", 3: "Possible", 4: "Likely", 5: "Frequent",
};
export const DETECTION_LABELS = {
  1: "Almost certain", 2: "High", 3: "Moderate", 4: "Low", 5: "Undetectable",
};

export const STATUSES = ["Open", "In mitigation", "Monitoring", "Closed"];
export const CATEGORIES = [
  "Product", "Process", "Supplier", "Equipment", "Facility",
  "Documentation", "Personnel", "IT / Data integrity", "Regulatory",
];
export const LEVELS = ["Low", "Medium", "High", "Critical"];

const isScaleValue = (v) =>
  Number.isInteger(v) && v >= SCALE_MIN && v <= SCALE_MAX;

/** Risk Priority Number: severity × occurrence × detection (1–125). */
export function rpn(severity, occurrence, detection) {
  if (![severity, occurrence, detection].every(isScaleValue)) return null;
  return severity * occurrence * detection;
}

/** Severity × occurrence, the score plotted on the risk matrix (1–25). */
export function matrixScore(severity, occurrence) {
  if (!isScaleValue(severity) || !isScaleValue(occurrence)) return null;
  return severity * occurrence;
}

/** Classifies a severity/occurrence pair into an acceptability level. */
export function riskLevel(severity, occurrence) {
  const score = matrixScore(severity, occurrence);
  if (score === null) return null;
  if (score >= 20) return "Critical";
  if (score >= 10) return "High";
  if (score >= 5) return "Medium";
  return "Low";
}

function hasResidual(risk) {
  return [risk.residualSeverity, risk.residualOccurrence, risk.residualDetection]
    .every(isScaleValue);
}

/** Adds derived fields (RPN, level, residual values, overdue flag). */
export function evaluate(risk, today = new Date()) {
  const residual = hasResidual(risk);
  const todayIso = toIsoDate(today);
  return {
    ...risk,
    rpn: rpn(risk.severity, risk.occurrence, risk.detection),
    level: riskLevel(risk.severity, risk.occurrence),
    residualRpn: residual
      ? rpn(risk.residualSeverity, risk.residualOccurrence, risk.residualDetection)
      : null,
    residualLevel: residual
      ? riskLevel(risk.residualSeverity, risk.residualOccurrence)
      : null,
    overdue: Boolean(risk.reviewDate) && risk.status !== "Closed" &&
      risk.reviewDate < todayIso,
  };
}

/** Returns a list of human-readable validation errors (empty when valid). */
export function validateRisk(risk) {
  const errors = [];
  if (!risk.title || !String(risk.title).trim()) errors.push("Title is required.");
  if (!risk.hazard || !String(risk.hazard).trim()) {
    errors.push("Failure mode / hazard is required.");
  }
  for (const [key, label] of [
    ["severity", "Severity"], ["occurrence", "Occurrence"], ["detection", "Detection"],
  ]) {
    if (!isScaleValue(risk[key])) {
      errors.push(`${label} must be a whole number from ${SCALE_MIN} to ${SCALE_MAX}.`);
    }
  }
  const residual = [risk.residualSeverity, risk.residualOccurrence, risk.residualDetection];
  const given = residual.filter((v) => v !== null && v !== undefined && v !== "");
  if (given.length > 0 && !(given.length === 3 && residual.every(isScaleValue))) {
    errors.push("Residual severity, occurrence and detection must all be set (1–5) or all left blank.");
  }
  if (risk.status && !STATUSES.includes(risk.status)) {
    errors.push(`Status must be one of: ${STATUSES.join(", ")}.`);
  }
  if (risk.reviewDate && !/^\d{4}-\d{2}-\d{2}$/.test(risk.reviewDate)) {
    errors.push("Review date must be in YYYY-MM-DD format.");
  }
  if (risk.status === "Closed" && !hasResidual(risk)) {
    errors.push("A risk can only be closed once its residual risk has been assessed.");
  }
  return errors;
}

/** Generates the next sequential ID such as "QR-007". */
export function nextId(risks) {
  const max = risks.reduce((m, r) => {
    const n = Number(String(r.id || "").replace(/^QR-/, ""));
    return Number.isFinite(n) && n > m ? n : m;
  }, 0);
  return `QR-${String(max + 1).padStart(3, "0")}`;
}

/** Filters evaluated risks by free-text query, level, status and category. */
export function filterRisks(risks, { query = "", level = "", status = "", category = "" } = {}) {
  const q = query.trim().toLowerCase();
  return risks.filter((r) => {
    if (level && r.level !== level) return false;
    if (status && r.status !== status) return false;
    if (category && r.category !== category) return false;
    if (!q) return true;
    return [r.id, r.title, r.hazard, r.cause, r.effect, r.controls, r.owner, r.category]
      .some((f) => String(f || "").toLowerCase().includes(q));
  });
}

/** Returns a new array sorted by the given key; nulls always sort last. */
export function sortRisks(risks, key = "rpn", direction = "desc") {
  const sign = direction === "asc" ? 1 : -1;
  return [...risks].sort((a, b) => {
    const av = a[key];
    const bv = b[key];
    if (av === bv) return 0;
    if (av === null || av === undefined || av === "") return 1;
    if (bv === null || bv === undefined || bv === "") return -1;
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * sign;
    return String(av).localeCompare(String(bv)) * sign;
  });
}

/** 5×5 grid of risk counts: grid[severity-1][occurrence-1]. */
export function buildMatrix(risks, { residual = false } = {}) {
  const grid = Array.from({ length: SCALE_MAX }, () => Array(SCALE_MAX).fill(0));
  for (const r of risks) {
    const s = residual ? r.residualSeverity : r.severity;
    const o = residual ? r.residualOccurrence : r.occurrence;
    if (isScaleValue(s) && isScaleValue(o)) grid[s - 1][o - 1] += 1;
  }
  return grid;
}

/** Aggregate figures for the dashboard. Expects evaluated risks. */
export function summarize(risks) {
  const byLevel = Object.fromEntries(LEVELS.map((l) => [l, 0]));
  const byStatus = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  let rpnTotal = 0;
  let reduced = 0;
  let assessed = 0;
  for (const r of risks) {
    if (r.level) byLevel[r.level] += 1;
    if (r.status in byStatus) byStatus[r.status] += 1;
    rpnTotal += r.rpn || 0;
    if (r.residualRpn !== null && r.residualRpn !== undefined) {
      assessed += 1;
      reduced += Math.max(0, r.rpn - r.residualRpn);
    }
  }
  const open = risks.filter((r) => r.status !== "Closed");
  return {
    total: risks.length,
    open: open.length,
    highOrCritical: open.filter((r) => r.level === "High" || r.level === "Critical").length,
    overdue: risks.filter((r) => r.overdue).length,
    averageRpn: risks.length ? Math.round(rpnTotal / risks.length) : 0,
    rpnReduced: reduced,
    residualAssessed: assessed,
    byLevel,
    byStatus,
  };
}

export const CSV_FIELDS = [
  "id", "title", "category", "hazard", "cause", "effect",
  "severity", "occurrence", "detection", "controls",
  "residualSeverity", "residualOccurrence", "residualDetection",
  "owner", "status", "reviewDate", "createdAt", "updatedAt",
];
const NUMERIC_FIELDS = new Set([
  "severity", "occurrence", "detection",
  "residualSeverity", "residualOccurrence", "residualDetection",
]);

function csvCell(value) {
  if (value === null || value === undefined) return "";
  const s = String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(risks) {
  const lines = [CSV_FIELDS.join(",")];
  for (const r of risks) lines.push(CSV_FIELDS.map((f) => csvCell(r[f])).join(","));
  return lines.join("\r\n") + "\r\n";
}

/** Parses RFC 4180 CSV text into an array of string arrays. */
export function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(cell); cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else {
      cell += ch;
    }
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/** Converts CSV text (with a header row) back into risk objects. */
export function fromCsv(text) {
  const [header, ...rows] = parseCsvRows(text.replace(/^﻿/, ""));
  if (!header) return [];
  const columns = header.map((h) => h.trim());
  if (!columns.includes("title")) throw new Error('CSV must contain a "title" column.');
  return rows.map((cells) => {
    const risk = {};
    columns.forEach((col, i) => {
      if (!CSV_FIELDS.includes(col)) return;
      const raw = (cells[i] ?? "").trim();
      risk[col] = NUMERIC_FIELDS.has(col) ? (raw === "" ? null : Number(raw)) : raw;
    });
    return risk;
  });
}

export function toIsoDate(date) {
  const d = date instanceof Date ? date : new Date(date);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Counts risks per group (e.g. category or owner) broken down by level.
 * Rows are sorted by total, then by the number of critical/high risks.
 */
export function levelBreakdown(risks, key) {
  const groups = new Map();
  for (const r of risks) {
    const name = String(r[key] || "").trim() || "Unassigned";
    if (!groups.has(name)) {
      groups.set(name, { group: name, total: 0, ...Object.fromEntries(LEVELS.map((l) => [l, 0])) });
    }
    const row = groups.get(name);
    if (r.level) row[r.level] += 1;
    row.total += 1;
  }
  return [...groups.values()].sort((a, b) =>
    b.total - a.total || b.Critical - a.Critical || b.High - a.High || a.group.localeCompare(b.group));
}

/**
 * Buckets open (non-closed) risks by review date: overdue, each of the next
 * `months` calendar months starting with the current one, later, and not set.
 */
export function reviewSchedule(risks, today = new Date(), months = 6) {
  const todayIso = toIsoDate(today);
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const buckets = [{ key: "overdue", label: "Overdue", count: 0, ids: [] }];
  for (let i = 0; i < months; i++) {
    const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    buckets.push({ key, label: `${monthNames[d.getMonth()]} ${d.getFullYear()}`, count: 0, ids: [] });
  }
  buckets.push({ key: "later", label: "Later", count: 0, ids: [] });
  buckets.push({ key: "none", label: "Not set", count: 0, ids: [] });
  const byKey = new Map(buckets.map((b) => [b.key, b]));
  const lastMonth = buckets[months].key;
  for (const r of risks) {
    if (r.status === "Closed") continue;
    let bucket;
    if (!r.reviewDate) bucket = byKey.get("none");
    else if (r.reviewDate < todayIso) bucket = byKey.get("overdue");
    else {
      const month = r.reviewDate.slice(0, 7);
      bucket = month > lastMonth ? byKey.get("later") : byKey.get(month);
    }
    bucket.count += 1;
    bucket.ids.push(r.id);
  }
  return buckets;
}

/**
 * How few open risks account for `share` of the total open RPN (Pareto view).
 * Expects evaluated risks.
 */
export function rpnConcentration(risks, share = 0.8) {
  const open = risks.filter((r) => r.status !== "Closed" && r.rpn).sort((a, b) => b.rpn - a.rpn);
  const total = open.reduce((s, r) => s + r.rpn, 0);
  let running = 0;
  let count = 0;
  for (const r of open) {
    if (running >= total * share) break;
    running += r.rpn;
    count += 1;
  }
  return { count, open: open.length, totalRpn: total, share };
}

/** Text fields tracked in a risk's change history, with their display names. */
const FIELD_NAMES = {
  title: "title", category: "category", owner: "owner", hazard: "hazard", cause: "cause", effect: "effect",
  controls: "controls", reviewDate: "review date",
};

/** Describes what changed between two versions of a risk, for the history log. */
export function describeChanges(before, after) {
  const changes = [];
  let kind = "updated";
  if (before.status !== after.status) {
    changes.push(`status ${before.status} → ${after.status}`);
    kind = after.status === "Closed" ? "closed" : "status";
  }
  const oldRpn = rpn(before.severity, before.occurrence, before.detection);
  const newRpn = rpn(after.severity, after.occurrence, after.detection);
  if (oldRpn !== newRpn) changes.push(`initial RPN ${oldRpn} → ${newRpn}`);
  const oldRes = rpn(before.residualSeverity, before.residualOccurrence, before.residualDetection);
  const newRes = rpn(after.residualSeverity, after.residualOccurrence, after.residualDetection);
  if (oldRes !== newRes) changes.push(oldRes === null ? `residual assessed at RPN ${newRes}` : newRes === null ? "residual assessment cleared" : `residual RPN ${oldRes} → ${newRes}`);
  const edited = Object.keys(FIELD_NAMES).filter((k) => (before[k] || "") !== (after[k] || ""));
  if (edited.length) changes.push(`edited ${edited.map((k) => FIELD_NAMES[k]).join(", ")}`);
  if (!changes.length) return null;
  const text = changes.join("; ");
  return { kind, text: text[0].toUpperCase() + text.slice(1) };
}
