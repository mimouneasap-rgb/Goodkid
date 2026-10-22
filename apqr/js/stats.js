// Statistics for the Annex 6 statistical study (SOPQA0021E QA0021E/TE08/02) and
// SOPQA0152E Phase 5: descriptive statistics, Anderson–Darling normality, I-MR
// control limits, run rules, and process capability (Cp/Cpk within, Pp/Ppk overall).

/** Parse pasted numbers: one per line, or separated by spaces, tabs, semicolons or commas. */
export function parseNumbers(text) {
  const s = String(text ?? "").trim();
  if (!s) return [];
  // "99,5" is a decimal comma when the text has other separators and no dots.
  const decimalComma = !s.includes(".") && /\d,\d/.test(s) && /[\s;]/.test(s);
  const tokens = s.split(decimalComma ? /[\s;]+/ : /[\s;,]+/);
  return tokens
    .map((t) => (decimalComma ? t.replace(",", ".") : t))
    .filter((t) => t !== "")
    .map(Number)
    .filter((n) => Number.isFinite(n));
}

export function mean(xs) {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN;
}

/** Sample standard deviation (n − 1). */
export function stdev(xs) {
  if (xs.length < 2) return NaN;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
}

export function quantile(xs, q) {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

export function movingRanges(xs) {
  const out = [];
  for (let i = 1; i < xs.length; i++) out.push(Math.abs(xs[i] - xs[i - 1]));
  return out;
}

const D2 = 1.128; // d2 for moving ranges of span 2
const D4 = 3.267;

/** Individuals (I-MR) chart limits. Sigma within = MR̄ / d2. */
export function imrLimits(xs) {
  const mr = movingRanges(xs);
  const mrBar = mean(mr);
  const cl = mean(xs);
  const sigma = mrBar / D2;
  return { cl, ucl: cl + 3 * sigma, lcl: cl - 3 * sigma, sigma, mrBar, mrUcl: D4 * mrBar, mr };
}

/** Standard normal CDF (Abramowitz & Stegun 7.1.26 via erf). */
export function normCdf(z) {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t *
    Math.exp(-(z * z) / 2);
  return z >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}

/** Anderson–Darling normality test with the Stephens small-sample adjustment. */
export function andersonDarling(xs) {
  const n = xs.length;
  if (n < 8) return null;
  const m = mean(xs);
  const s = stdev(xs);
  if (!(s > 0)) return null;
  const z = [...xs].sort((a, b) => a - b).map((x) => (x - m) / s);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const fi = Math.min(Math.max(normCdf(z[i]), 1e-12), 1 - 1e-12);
    const fr = Math.min(Math.max(normCdf(z[n - 1 - i]), 1e-12), 1 - 1e-12);
    sum += (2 * i + 1) * (Math.log(fi) + Math.log(1 - fr));
  }
  const a2 = -n - sum / n;
  const a = a2 * (1 + 0.75 / n + 2.25 / (n * n));
  let p;
  if (a >= 0.6) p = Math.exp(1.2937 - 5.709 * a + 0.0186 * a * a);
  else if (a >= 0.34) p = Math.exp(0.9177 - 4.279 * a - 1.38 * a * a);
  else if (a >= 0.2) p = 1 - Math.exp(-8.318 + 42.796 * a - 59.938 * a * a);
  else p = 1 - Math.exp(-13.436 + 101.14 * a - 223.73 * a * a);
  p = Math.min(1, Math.max(0, p));
  return { a2: a, p, normal: p >= 0.05 };
}

/**
 * Western Electric / Nelson run rules on an individuals chart.
 * Returns one entry per rule that fires, with the indices of the points involved.
 */
export function runRules(xs, cl, sigma) {
  const out = [];
  if (!(sigma > 0) || xs.length < 2) return out;
  const z = xs.map((x) => (x - cl) / sigma);
  const add = (rule, text, idx) => {
    let r = out.find((o) => o.rule === rule);
    if (!r) out.push((r = { rule, text, points: new Set() }));
    idx.forEach((i) => r.points.add(i));
  };
  z.forEach((v, i) => { if (Math.abs(v) > 3) add(1, "Point beyond the 3σ control limits", [i]); });
  for (let i = 8; i < z.length; i++) {
    const w = z.slice(i - 8, i + 1);
    if (w.every((v) => v > 0) || w.every((v) => v < 0)) add(2, "9 points in a row on one side of the centre line", range(i - 8, i));
  }
  for (let i = 5; i < xs.length; i++) {
    const w = xs.slice(i - 5, i + 1);
    const up = w.every((v, k) => k === 0 || v > w[k - 1]);
    const down = w.every((v, k) => k === 0 || v < w[k - 1]);
    if (up || down) add(3, "6 points in a row steadily increasing or decreasing", range(i - 5, i));
  }
  for (let i = 2; i < z.length; i++) {
    const w = z.slice(i - 2, i + 1);
    for (const sign of [1, -1]) {
      const hits = w.map((v, k) => (sign * v > 2 ? i - 2 + k : -1)).filter((k) => k >= 0);
      if (hits.length >= 2) add(5, "2 of 3 points beyond 2σ on the same side", hits);
    }
  }
  for (let i = 4; i < z.length; i++) {
    const w = z.slice(i - 4, i + 1);
    for (const sign of [1, -1]) {
      const hits = w.map((v, k) => (sign * v > 1 ? i - 4 + k : -1)).filter((k) => k >= 0);
      if (hits.length >= 4) add(6, "4 of 5 points beyond 1σ on the same side", hits);
    }
  }
  return out.map((r) => ({ ...r, points: [...r.points].sort((a, b) => a - b) }));
}

function range(a, b) {
  const out = [];
  for (let i = a; i <= b; i++) out.push(i);
  return out;
}

const num = (v) => (v === "" || v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Number(v));

/** Capability against one- or two-sided specification limits. */
export function capability(xs, { lsl, usl } = {}) {
  const L = num(lsl);
  const U = num(usl);
  const m = mean(xs);
  const sdOverall = stdev(xs);
  const { sigma: sdWithin } = imrLimits(xs);
  const idx = (sd) => {
    if (!(sd > 0)) return { c: null, ck: null, upper: null, lower: null };
    const upper = U !== null ? (U - m) / (3 * sd) : null;
    const lower = L !== null ? (m - L) / (3 * sd) : null;
    const c = U !== null && L !== null ? (U - L) / (6 * sd) : null;
    const ck = [upper, lower].filter((v) => v !== null);
    return { c, ck: ck.length ? Math.min(...ck) : null, upper, lower };
  };
  const within = idx(sdWithin);
  const overall = idx(sdOverall);
  const outOfSpec = xs.filter((x) => (L !== null && x < L) || (U !== null && x > U)).length;
  return {
    n: xs.length, mean: m, sdOverall, sdWithin,
    cp: within.c, cpk: within.ck, cpu: within.upper, cpl: within.lower,
    pp: overall.c, ppk: overall.ck,
    outOfSpec,
  };
}

/** SOPQA0152E Phase 5 bands. */
export function classifyCpk(cpk) {
  if (cpk === null || cpk === undefined || !Number.isFinite(cpk)) return null;
  if (cpk > 1.33) return "excellent";
  if (cpk >= 1) return "acceptable";
  return "poor";
}

/** Bins span the data; the domain also covers `extra` values such as spec limits. */
export function histogram(xs, extra = []) {
  if (!xs.length) return { bins: [], min: 0, max: 0, width: 1 };
  let lo = Math.min(...xs);
  let hi = Math.max(...xs);
  if (lo === hi) { lo -= 0.5; hi += 0.5; }
  const k = Math.max(5, Math.min(20, Math.ceil(Math.log2(xs.length) + 1)));
  const width = (hi - lo) / k;
  const bins = Array.from({ length: k }, (_, i) => ({ x0: lo + i * width, x1: lo + (i + 1) * width, count: 0 }));
  for (const x of xs) bins[Math.min(k - 1, Math.max(0, Math.floor((x - lo) / width)))].count++;
  const ends = extra.filter((v) => Number.isFinite(v));
  return { bins, min: Math.min(lo, ...ends), max: Math.max(hi, ...ends), width };
}

/**
 * Full evaluation of a study: descriptive statistics, normality, control chart,
 * run rules, capability and the SOP interpretation. Falls back to manually
 * entered Cpk/control status when there are too few values.
 */
export function evaluateStudy(study) {
  const xs = Array.isArray(study.values) ? study.values.filter((v) => Number.isFinite(v)) : [];
  const enough = xs.length >= 2;
  const limits = enough ? imrLimits(xs) : null;
  const cap = enough ? capability(xs, study) : null;
  const rules = enough ? runRules(xs, limits.cl, limits.sigma) : [];
  const normality = andersonDarling(xs);
  const cpk = cap?.cpk ?? num(study.cpkManual);
  const ppk = cap?.ppk ?? num(study.ppkManual);
  const band = classifyCpk(cpk);
  const inControl = enough ? rules.length === 0 : study.controlManual === "in" ? true : study.controlManual === "out" ? false : null;
  const actions = [];
  if (band === "poor") actions.push("CAPA is mandatory: investigate the root cause and improve the process.");
  if (band === "acceptable") actions.push("Monitor closely; include a monitoring recommendation in the PQR conclusion.");
  if (inControl === false) actions.push("Investigate the trend or special cause and discuss it in the report summary, even if all results are within specification.");
  if (enough && xs.length < 20) actions.push("Fewer than 20 values: extend back up to 6 months or defer the statistical evaluation (§10.3.5).");
  if (normality && !normality.normal) actions.push("Data do not look normal (Anderson–Darling p < 0.05): treat Cpk with caution or use a non-normal capability analysis.");
  return {
    n: xs.length, values: xs, enough, limits, cap, rules, normality,
    cpk, ppk, band, inControl,
    capaRequired: band === "poor",
    actions,
    describe: enough ? { mean: mean(xs), sd: stdev(xs), min: Math.min(...xs), max: Math.max(...xs), median: quantile(xs, 0.5) } : null,
  };
}
