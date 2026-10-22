// Hand-built SVG charts. Each builder returns an SVG string sized to `width`.
// Colours come from CSS classes so both themes work; hover targets carry
// `data-tip` (escaped text, lines separated by "\n", first line bold).

import { esc } from "./dom.js";

const tip = (...lines) => `data-tip="${esc(lines.filter((l) => l !== null && l !== undefined && l !== "").join("\n"))}"`;

function niceStep(max, target = 5) {
  const raw = Math.max(1e-9, max) / target;
  const pow = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw);
}

function ticks(min, max, target = 5) {
  const step = niceStep(max - min || Math.abs(max) || 1, target);
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const out = [];
  for (let v = lo; v <= hi + step / 2; v += step) out.push(Number(v.toFixed(10)));
  return { lo, hi, values: out, step };
}

const compact = (v) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(v % 1000 ? 1 : 0)}K` : String(Number(v.toFixed(4))));

/** Bar growing right with only the data end rounded. */
function hBar(x, y, w, h, r = 4) {
  if (w <= 0) return "";
  r = Math.min(r, w, h / 2);
  return `M${x},${y}H${x + w - r}A${r},${r} 0 0 1 ${x + w},${y + r}V${y + h - r}A${r},${r} 0 0 1 ${x + w - r},${y + h}H${x}Z`;
}

/** Column growing up with only the data end rounded. */
function vBar(x, y, w, h, r = 4) {
  if (h <= 0) return "";
  r = Math.min(r, h, w / 2);
  return `M${x},${y + h}V${y + r}A${r},${r} 0 0 1 ${x + r},${y}H${x + w - r}A${r},${r} 0 0 1 ${x + w},${y + r}V${y + h}Z`;
}

const truncate = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/**
 * Cumulative tasks created vs closed per week. Each week is a hover band that
 * shows a crosshair and both values.
 */
export function burnUpChart(points, width, fmtWeek) {
  if (!points.length) return "";
  const left = 40, right = 64, top = 12, bottom = 26;
  const height = 240;
  const plotW = Math.max(100, width - left - right);
  const plotH = height - top - bottom;
  const max = Math.max(...points.map((p) => p.created), 1);
  const t = ticks(0, max, 4);
  const x = (i) => left + (points.length === 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
  const y = (v) => top + plotH - (v / t.hi) * plotH;
  const parts = [];
  for (const v of t.values) {
    parts.push(`<line class="grid-line" x1="${left}" x2="${left + plotW}" y1="${y(v)}" y2="${y(v)}"/>`);
    parts.push(`<text x="${left - 8}" y="${y(v) + 4}" text-anchor="end" class="num">${compact(v)}</text>`);
  }
  parts.push(`<line class="axis-line" x1="${left}" x2="${left + plotW}" y1="${y(0)}" y2="${y(0)}"/>`);
  const every = Math.ceil(points.length / Math.max(2, Math.floor(plotW / 80)));
  points.forEach((p, i) => {
    if (i % every === 0 || i === points.length - 1) {
      parts.push(`<text x="${x(i)}" y="${height - 6}" text-anchor="middle">${esc(fmtWeek(p.week))}</text>`);
    }
  });
  const path = (key) => points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p[key]).toFixed(1)}`).join("");
  const area = `${path("closed")}L${x(points.length - 1)},${y(0)}L${x(0)},${y(0)}Z`;
  parts.push(`<path class="area s1" d="${area}"/>`);
  parts.push(`<path class="line s2" d="${path("created")}"/>`);
  parts.push(`<path class="line s1" d="${path("closed")}"/>`);
  const last = points.at(-1);
  const li = points.length - 1;
  // End labels; nudge apart only when they would overlap.
  let yc = y(last.created), yd = y(last.closed);
  if (Math.abs(yc - yd) < 14) { yc -= 7; yd += 7; }
  parts.push(`<circle class="pt" cx="${x(li)}" cy="${y(last.created)}" r="4" style="fill:var(--s2)"/>`);
  parts.push(`<circle class="pt" cx="${x(li)}" cy="${y(last.closed)}" r="4"/>`);
  parts.push(`<text class="value" x="${x(li) + 10}" y="${yc + 4}">${last.created}</text>`);
  parts.push(`<text class="value" x="${x(li) + 10}" y="${yd + 4}">${last.closed}</text>`);
  const band = points.length > 1 ? plotW / (points.length - 1) : plotW;
  points.forEach((p, i) => {
    const bx = Math.max(left, x(i) - band / 2);
    const bw = Math.min(left + plotW, x(i) + band / 2) - bx;
    parts.push(`<g class="band" ${tip(`Week of ${fmtWeek(p.week)}`, `Created: ${p.created}`, `Closed: ${p.closed}`, `Open: ${p.created - p.closed}`)}>` +
      `<rect class="hit" x="${bx}" y="${top}" width="${bw}" height="${plotH}"/>` +
      `<line class="crosshair band-x" x1="${x(i)}" x2="${x(i)}" y1="${top}" y2="${top + plotH}"/></g>`);
  });
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Cumulative tasks created and closed by week">${parts.join("")}</svg>`;
}

/** Tasks per workflow stage, ordered, on the validated ordinal ramp. */
export function stageChart(stages, width) {
  const labelW = width < 420 ? 112 : 136;
  const right = 52, rowH = 34, barH = 18, top = 4;
  const plotW = Math.max(80, width - labelW - right);
  const max = Math.max(...stages.map((s) => s.count), 1);
  const height = top + stages.length * rowH;
  const parts = stages.map((s, i) => {
    const y = top + i * rowH;
    const w = (s.count / max) * plotW;
    return `<g ${tip(s.stage, `${s.count} tasks`)} data-stage="${esc(s.stage)}">` +
      `<rect class="hit" x="0" y="${y}" width="${width}" height="${rowH}"/>` +
      `<text class="label" x="0" y="${y + rowH / 2 + 4}">${esc(s.stage)}</text>` +
      `<path class="mark o${i + 1}" d="${hBar(labelW, y + (rowH - barH) / 2, Math.max(w, s.count ? 3 : 0), barH)}"/>` +
      `<text class="value" x="${labelW + w + 8}" y="${y + rowH / 2 + 4}">${s.count}</text></g>`;
  });
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Tasks by workflow stage">${parts.join("")}</svg>`;
}

/** Open tasks per person: on-time portion then overdue portion, with a 2px gap. */
export function workloadChart(users, width) {
  const labelW = width < 420 ? 110 : 150;
  const right = 44, rowH = 30, barH = 16, top = 2;
  const plotW = Math.max(80, width - labelW - right);
  const max = Math.max(...users.map((u) => u.open), 1);
  const height = top + users.length * rowH;
  const parts = users.map((u, i) => {
    const y = top + i * rowH + (rowH - barH) / 2;
    const onTime = u.open - u.overdue;
    const w1 = (onTime / max) * plotW;
    const w2 = (u.overdue / max) * plotW;
    const gap = w1 > 0 && w2 > 0 ? 2 : 0;
    const marks = [];
    if (w2 > 0) {
      // The overdue segment carries the rounded data end.
      if (w1 > 0) marks.push(`<rect class="mark s1" x="${labelW}" y="${y}" width="${w1}" height="${barH}"/>`);
      marks.push(`<path class="mark st-critical" d="${hBar(labelW + w1 + gap, y, Math.max(w2, 3), barH)}"/>`);
    } else if (w1 > 0) {
      marks.push(`<path class="mark s1" d="${hBar(labelW, y, w1, barH)}"/>`);
    }
    return `<g ${tip(u.user, `${u.open} open`, `${u.overdue} overdue`, `${u.completed} completed of ${u.total}`)} data-user="${esc(u.user)}" style="cursor:pointer">` +
      `<rect class="hit" x="0" y="${top + i * rowH}" width="${width}" height="${rowH}"/>` +
      `<text class="label" x="0" y="${y + barH / 2 + 4}">${esc(truncate(u.user, width < 420 ? 15 : 22))}</text>` +
      marks.join("") +
      `<text class="value" x="${labelW + w1 + w2 + gap + 8}" y="${y + barH / 2 + 4}">${u.open}</text></g>`;
  });
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Open tasks per person">${parts.join("")}</svg>`;
}

/** Planned products per dosage form (track) with the triggered share filled in. */
export function coverageChart(rows, width) {
  const labelW = 104, right = 70, rowH = 40, barH = 12, top = 2;
  const plotW = Math.max(80, width - labelW - right);
  const max = Math.max(...rows.map((r) => r.planned), 1);
  const height = top + rows.length * rowH;
  const parts = rows.map((r, i) => {
    const y = top + i * rowH + (rowH - barH) / 2;
    const wp = (r.planned / max) * plotW;
    const wt = (r.triggered / max) * plotW;
    return `<g ${tip(r.form, `${r.planned} planned`, `${r.triggered} triggered (${r.planned ? Math.round((r.triggered / r.planned) * 100) : 0}%)`, `${r.closed} closed`)}>` +
      `<rect class="hit" x="0" y="${top + i * rowH}" width="${width}" height="${rowH}"/>` +
      `<text class="label" x="0" y="${y + barH / 2 + 4}">${esc(r.form)}</text>` +
      `<path class="track" d="${hBar(labelW, y, Math.max(wp, 3), barH)}"/>` +
      (wt > 0 ? `<path class="mark s1" d="${hBar(labelW, y, wt, barH)}"/>` : "") +
      `<text class="value" x="${labelW + wp + 8}" y="${y + barH / 2 + 4}">${r.triggered}<tspan class="muted" style="fill:var(--muted);font-weight:500"> / ${r.planned}</tspan></text></g>`;
  });
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Plan coverage by dosage form">${parts.join("")}</svg>`;
}

/** Progress ring for the dark dossier header. */
export function ringSvg(fraction, label, sub) {
  const r = 52, c = 2 * Math.PI * r;
  const f = Math.max(0, Math.min(1, fraction || 0));
  return `<svg class="dossier-ring" viewBox="0 0 128 128" role="img" aria-label="${esc(label)} ${esc(sub)}">
    <circle cx="64" cy="64" r="${r}" fill="none" stroke="rgba(255,255,255,.12)" stroke-width="10"/>
    <circle cx="64" cy="64" r="${r}" fill="none" stroke="url(#ringGrad)" stroke-width="10" stroke-linecap="round"
      stroke-dasharray="${(c * f).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 64 64)"/>
    <defs><linearGradient id="ringGrad" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#818cf8"/><stop offset="1" stop-color="#22d3ee"/></linearGradient></defs>
    <text x="64" y="66" text-anchor="middle" fill="#fff" font-size="26" font-weight="800">${esc(label)}</text>
    <text x="64" y="86" text-anchor="middle" fill="#b8bfe6" font-size="11" font-weight="600">${esc(sub)}</text>
  </svg>`;
}

/**
 * Individuals control chart with centre line, ±3σ limits and optional spec limits.
 * Points flagged by a run rule get the critical colour.
 */
export function controlChart(study, ev, width) {
  const xs = ev.values;
  const left = 52, right = 72, top = 14, bottom = 28, height = 280;
  const plotW = Math.max(100, width - left - right);
  const plotH = height - top - bottom;
  const L = ev.limits;
  const spec = [study.lsl, study.usl].map((v) => (v === "" || v === null || v === undefined ? null : Number(v)));
  const vals = [...xs, L.ucl, L.lcl, ...spec.filter((v) => v !== null && Number.isFinite(v))];
  let lo = Math.min(...vals), hi = Math.max(...vals);
  const pad = (hi - lo) * 0.08 || 1;
  lo -= pad; hi += pad;
  const t = ticks(lo, hi, 5);
  lo = Math.min(lo, t.lo); hi = Math.max(hi, t.hi);
  const x = (i) => left + (xs.length === 1 ? plotW / 2 : (i / (xs.length - 1)) * plotW);
  const y = (v) => top + plotH - ((v - lo) / (hi - lo)) * plotH;
  const flagged = new Set(ev.rules.flatMap((r) => r.points));
  const parts = [];
  for (const v of t.values) {
    if (v < lo || v > hi) continue;
    parts.push(`<line class="grid-line" x1="${left}" x2="${left + plotW}" y1="${y(v)}" y2="${y(v)}"/>`);
    parts.push(`<text x="${left - 8}" y="${y(v) + 4}" text-anchor="end" class="num">${compact(v)}</text>`);
  }
  const refs = [
    [L.cl, "cl-line", `X̄ ${fmt(L.cl)}`], [L.ucl, "ctl-line", `UCL ${fmt(L.ucl)}`], [L.lcl, "ctl-line", `LCL ${fmt(L.lcl)}`],
    [spec[1], "spec-line", `USL ${fmt(spec[1])}`], [spec[0], "spec-line", `LSL ${fmt(spec[0])}`],
  ].filter(([v]) => v !== null && Number.isFinite(v)).map(([v, cls, label]) => ({ y: y(v), cls, label })).sort((a, b) => a.y - b.y);
  // Right-hand labels: keep at least 13px apart so close limits stay readable.
  let lastY = -Infinity;
  for (const r of refs) {
    parts.push(`<line class="${r.cls}" x1="${left}" x2="${left + plotW}" y1="${r.y}" y2="${r.y}"/>`);
    const ly = Math.max(r.y, lastY + 13);
    lastY = ly;
    parts.push(`<text class="label" x="${left + plotW + 8}" y="${ly + 4}">${esc(r.label)}</text>`);
  }
  parts.push(`<path class="line s1" d="${xs.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("")}"/>`);
  const every = Math.ceil(xs.length / Math.max(2, Math.floor(plotW / 44)));
  xs.forEach((v, i) => {
    if (i % every === 0 || i === xs.length - 1) parts.push(`<text x="${x(i)}" y="${height - 8}" text-anchor="middle">${i + 1}</text>`);
    const rules = ev.rules.filter((r) => r.points.includes(i)).map((r) => `Rule ${r.rule}: ${r.text}`);
    parts.push(`<g ${tip(`${study.batchLabels?.[i] || `Point ${i + 1}`}`, `Value: ${fmt(v)}`, ...rules)}>` +
      `<circle class="hit" cx="${x(i)}" cy="${y(v)}" r="12"/>` +
      `<circle class="pt mark${flagged.has(i) ? " bad" : ""}" cx="${x(i)}" cy="${y(v)}" r="${flagged.has(i) ? 5 : 4}"/></g>`);
  });
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Individuals control chart">${parts.join("")}</svg>`;
}

/** Histogram with specification limits and the fitted normal curve. */
export function histogramChart(study, ev, hist, width) {
  const left = 40, right = 16, top = 16, bottom = 28, height = 220;
  const plotW = Math.max(100, width - left - right);
  const plotH = height - top - bottom;
  const maxCount = Math.max(...hist.bins.map((b) => b.count), 1);
  const t = ticks(0, maxCount, 4);
  // Widen the domain so the fitted curve reaches its tails.
  const d = ev.describe;
  const span = hist.max - hist.min || 1;
  const lo = Math.min(hist.min - span * 0.04, d && d.sd > 0 ? d.mean - 3.5 * d.sd : Infinity);
  const hi = Math.max(hist.max + span * 0.04, d && d.sd > 0 ? d.mean + 3.5 * d.sd : -Infinity);
  const x = (v) => left + ((v - lo) / (hi - lo)) * plotW;
  const y = (c) => top + plotH - (c / t.hi) * plotH;
  const parts = [];
  for (const v of t.values) {
    parts.push(`<line class="grid-line" x1="${left}" x2="${left + plotW}" y1="${y(v)}" y2="${y(v)}"/>`);
    parts.push(`<text x="${left - 8}" y="${y(v) + 4}" text-anchor="end" class="num">${v}</text>`);
  }
  hist.bins.forEach((b) => {
    const bx = x(b.x0) + 1;
    const bw = Math.max(1, x(b.x1) - x(b.x0) - 2);
    parts.push(`<g ${tip(`${fmt(b.x0)} – ${fmt(b.x1)}`, `${b.count} values`)}>` +
      `<rect class="hit" x="${bx}" y="${top}" width="${bw}" height="${plotH}"/>` +
      `<path class="mark s1" d="${vBar(bx, y(b.count), bw, y(0) - y(b.count), 3)}"/></g>`);
  });
  if (d && d.sd > 0) {
    const pts = [];
    for (let i = 0; i <= 80; i++) {
      const v = lo + ((hi - lo) * i) / 80;
      const dens = Math.exp(-0.5 * ((v - d.mean) / d.sd) ** 2) / (d.sd * Math.sqrt(2 * Math.PI));
      pts.push(`${i ? "L" : "M"}${x(v).toFixed(1)},${y(dens * ev.n * hist.width).toFixed(1)}`);
    }
    parts.push(`<path class="line s2" d="${pts.join("")}"/>`);
  }
  for (const [v, name] of [[study.lsl, "LSL"], [study.usl, "USL"]]) {
    if (v === "" || v === null || v === undefined || !Number.isFinite(Number(v))) continue;
    const xv = x(Number(v));
    parts.push(`<line class="spec-line" x1="${xv}" x2="${xv}" y1="${top - 6}" y2="${top + plotH}"/>`);
    parts.push(`<text class="label" x="${xv}" y="${top - 8}" text-anchor="middle">${name}</text>`);
  }
  parts.push(`<line class="axis-line" x1="${left}" x2="${left + plotW}" y1="${y(0)}" y2="${y(0)}"/>`);
  const tx = ticks(lo, hi, Math.max(3, Math.floor(plotW / 90)));
  for (const v of tx.values) {
    if (v < lo || v > hi) continue;
    parts.push(`<text x="${x(v)}" y="${height - 8}" text-anchor="middle" class="num">${compact(v)}</text>`);
  }
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Histogram with specification limits">${parts.join("")}</svg>`;
}

/** One row per study: Cpk on a 0–2 scale with the SOP bands at 1.00 and 1.33. */
export function cpkStripChart(rows, width) {
  const labelW = width < 480 ? 130 : 230, right = 50, rowH = 30, top = 22;
  const plotW = Math.max(100, width - labelW - right);
  const maxV = Math.max(2, ...rows.map((r) => r.cpk ?? 0));
  const x = (v) => labelW + (Math.min(v, maxV) / maxV) * plotW;
  const height = top + rows.length * rowH + 6;
  const parts = [];
  parts.push(`<rect x="${labelW}" y="${top - 4}" width="${x(1) - labelW}" height="${rows.length * rowH + 4}" style="fill:var(--critical-bg)"/>`);
  parts.push(`<rect x="${x(1)}" y="${top - 4}" width="${x(1.33) - x(1)}" height="${rows.length * rowH + 4}" style="fill:var(--warning-bg)"/>`);
  parts.push(`<rect x="${x(1.33)}" y="${top - 4}" width="${labelW + plotW - x(1.33)}" height="${rows.length * rowH + 4}" style="fill:var(--good-bg)"/>`);
  for (const [v, l] of [[0, "0"], [1, "1.00"], [1.33, "1.33"], [maxV, maxV.toFixed(1)]]) {
    parts.push(`<text x="${x(v)}" y="${top - 9}" text-anchor="middle" class="num">${l}</text>`);
  }
  rows.forEach((r, i) => {
    const y = top + i * rowH + rowH / 2;
    parts.push(`<g ${tip(r.title, r.cpk === null ? "No Cpk yet" : `Cpk ${r.cpk.toFixed(2)}`, r.bandLabel)} data-study="${esc(r.key)}" style="cursor:pointer">` +
      `<rect class="hit" x="0" y="${y - rowH / 2}" width="${width}" height="${rowH}"/>` +
      `<text class="label" x="0" y="${y + 4}">${esc(truncate(r.title, width < 480 ? 18 : 34))}</text>` +
      (r.cpk === null ? `<text x="${labelW + 6}" y="${y + 4}">no data</text>` :
        `<line class="grid-line" x1="${labelW}" x2="${x(r.cpk)}" y1="${y}" y2="${y}" style="stroke:var(--axis)"/>` +
        `<circle class="mark pt" cx="${x(r.cpk)}" cy="${y}" r="6" style="fill:var(--ink)"/>` +
        `<text class="value" x="${x(r.cpk) + 11}" y="${y + 4}">${r.cpk.toFixed(2)}</text>`) +
      `</g>`);
  });
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Process capability by study">${parts.join("")}</svg>`;
}

function fmt(v) {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  const a = Math.abs(v);
  return a >= 100 ? v.toFixed(2) : a >= 1 ? v.toFixed(3) : v.toPrecision(3);
}
