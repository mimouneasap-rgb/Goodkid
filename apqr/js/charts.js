// Chart builders. Each returns an HTML/SVG string. Colours are CSS custom
// properties so light and dark themes swap in one place; every mark carries a
// data-tip for the shared hover tooltip.
import { esc, tip, fmtN, fmtPct, fmtMonthShort, icon, slotCls } from "./ui.js";
import { SLOTS } from "./engine.js";

export const DEPT_VAR = { Compliance: "--d1", Production: "--d2", QA: "--d3", QC: "--d4", RA: "--d5", "Supplier Qualification": "--d6", "Validation Metrology": "--d7", "Validation Process": "--d8" };
export const deptColor = (d) => `var(${DEPT_VAR[d] || "--muted"})`;
const STAGE_VARS = ["--s1", "--s2", "--s3", "--s4", "--s5"];
export function stageColor(stage, stages) {
  if (/complet|approved|closed/i.test(stage)) return "var(--s-done)";
  if (/not triggered/i.test(stage)) return "var(--slot-nt)";
  const i = stages.filter((s) => !/complet|approved|closed|not triggered/i.test(s)).indexOf(stage);
  return `var(${STAGE_VARS[Math.max(0, i)] || "--s1"})`;
}

/* ------------------------------------------------------------------- ring */

export function ring(value, { size = 160, stroke = 14, label = "", sub = "", color = "var(--ring)" } = {}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value || 0));
  return `<svg class="ring" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="${esc(label)} ${fmtPct(v, 1)}">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" style="stroke:var(--ring-track)" stroke-width="${stroke}"/>
    <circle class="ring-val" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" style="stroke:${color};--c:${c.toFixed(1)};--o:${(c * (1 - v)).toFixed(1)}" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${(c * (1 - v)).toFixed(1)}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
    <text x="50%" y="${size / 2 + (sub ? 2 : 8)}" text-anchor="middle" class="ring-num">${fmtPct(v, v > 0 && v < 0.995 ? 1 : 0)}</text>
    ${sub ? `<text x="50%" y="${size / 2 + 22}" text-anchor="middle" class="ring-sub">${esc(sub)}</text>` : ""}
  </svg>`;
}

/* ---------------------------------------------------------- segmented bar */

/** parts: [{ label, value, color, onClick? (data attrs string) }] */
export function segBar(parts, { height = 14, title = "" } = {}) {
  const total = parts.reduce((s, p) => s + p.value, 0) || 1;
  return `<div class="segbar" style="--h:${height}px" role="img" aria-label="${esc(title)}">${parts.filter((p) => p.value > 0).map((p) =>
    `<span class="seg" ${p.attrs || ""} style="flex:${p.value} 1 0;background:${p.color}" data-tip="${tip(p.label, [["Count", fmtN(p.value)], ["Share", fmtPct(p.value / total, 1)]], p.color)}"></span>`).join("")}</div>`;
}

/* -------------------------------------------------------- horizontal bars */

/**
 * rows: [{ label, sub?, segments: [{ key, value, color }], attrs? }]
 * Stacked horizontal bars against a shared max.
 */
export function hbars(rows, { max, valueLabel = (r) => fmtN(r.segments.reduce((s, x) => s + x.value, 0)), labelWidth = 120 } = {}) {
  const m = max || Math.max(1, ...rows.map((r) => r.segments.reduce((s, x) => s + x.value, 0)));
  return `<div class="hbars" style="--lw:${labelWidth}px">${rows.map((r) => {
    const tot = r.segments.reduce((s, x) => s + x.value, 0);
    return `<div class="hbar-row" ${r.attrs || ""}>
      <div class="hbar-label" title="${esc(r.label)}">${esc(r.label)}${r.sub ? `<small>${esc(r.sub)}</small>` : ""}</div>
      <div class="hbar-track"><div class="hbar-fill" style="width:${((tot / m) * 100).toFixed(2)}%">${r.segments.filter((s) => s.value > 0).map((s) =>
        `<span style="flex:${s.value} 1 0;background:${s.color}" data-tip="${tip(r.label, [[s.key, fmtN(s.value)], ["Total", fmtN(tot)]], s.color)}"></span>`).join("")}</div></div>
      <div class="hbar-val">${valueLabel(r)}</div>
    </div>`;
  }).join("")}</div>`;
}

/* ------------------------------------------------------ clustered columns */

/**
 * groups: [{ label, values: [{ key, value (0..1 or count), count?, color }] }]
 * Draws clustered columns with % labels on the caps.
 */
export function columns(groups, { height = 260, yMax = 1, pct = true, series = [] } = {}) {
  const W = 760, H = height, padL = 40, padR = 8, padT = 22, padB = 46;
  const iw = W - padL - padR, ih = H - padT - padB;
  const n = groups.length || 1;
  const band = iw / n;
  const k = Math.max(1, ...groups.map((g) => g.values.length));
  const bw = Math.min(24, (band * 0.78) / k - 2);
  const y = (v) => padT + ih - (Math.min(v, yMax) / yMax) * ih;
  const ticks = pct ? [0, 0.25, 0.5, 0.75, 1].map((t) => t * yMax) : niceTicks(yMax);
  let s = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Clustered column chart">`;
  for (const t of ticks) s += `<line x1="${padL}" x2="${W - padR}" y1="${y(t)}" y2="${y(t)}" class="grid"/><text x="${padL - 6}" y="${y(t) + 4}" text-anchor="end" class="axis-t">${pct ? fmtPct(t) : fmtN(t)}</text>`;
  s += `<line x1="${padL}" x2="${W - padR}" y1="${y(0)}" y2="${y(0)}" class="baseline"/>`;
  groups.forEach((g, gi) => {
    const cx = padL + band * gi + band / 2;
    const totalW = k * bw + (k - 1) * 2;
    g.values.forEach((v, vi) => {
      const x = cx - totalW / 2 + vi * (bw + 2);
      const top = y(v.value), h = y(0) - top;
      if (v.value > 0) {
        const r = Math.min(4, h, bw / 2);
        s += `<path d="M${x},${y(0)} V${top + r} Q${x},${top} ${x + r},${top} H${x + bw - r} Q${x + bw},${top} ${x + bw},${top + r} V${y(0)} Z" style="fill:${v.color}" class="col" data-tip="${tip(g.label, [[v.key, pct ? fmtPct(v.value, 1) : fmtN(v.value)], ...(v.count !== undefined ? [["Annexes", fmtN(v.count)]] : [])], v.color)}"/>`;
        if (bw >= 10) s += `<text x="${x + bw / 2}" y="${top - 5}" text-anchor="middle" class="cap-t">${pct ? Math.round(v.value * 100) + "%" : fmtN(v.value)}</text>`;
      }
      s += `<rect x="${x - 1}" y="${padT}" width="${bw + 2}" height="${ih}" fill="transparent" data-tip="${tip(g.label, [[v.key, pct ? fmtPct(v.value, 1) : fmtN(v.value)], ...(v.count !== undefined ? [["Annexes", fmtN(v.count)]] : [])], v.color)}"/>`;
    });
    s += wrapLabel(g.label, cx, H - padB + 16);
  });
  s += `</svg>`;
  const legend = series.length ? `<div class="legend">${series.map((x) => `<span><i style="background:${x.color}"></i>${esc(x.label)}</span>`).join("")}</div>` : "";
  return legend + s;
}

function wrapLabel(label, x, y) {
  const words = String(label).split(" ");
  const lines = [];
  let cur = "";
  for (const w of words) { if ((cur + " " + w).trim().length > 14 && cur) { lines.push(cur); cur = w; } else cur = (cur + " " + w).trim(); }
  if (cur) lines.push(cur);
  return lines.slice(0, 2).map((l, i) => `<text x="${x}" y="${y + i * 13}" text-anchor="middle" class="axis-l">${esc(l)}</text>`).join("");
}

export function niceTicks(max, count = 4) {
  if (max <= 0) return [0];
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || raw;
  const out = [];
  for (let v = 0; v <= max + step * 0.01; v += step) out.push(Math.round(v * 1000) / 1000);
  if (out[out.length - 1] < max) out.push(out[out.length - 1] + step);
  return out;
}

/* ------------------------------------------------------------- burn-up */

/**
 * series: [{ key, color, points: [{ x: 'YYYY-MM', y }] , area? }]
 * One shared y-axis (counts). Crosshair handled by the caller via data-col.
 */
export function lineChart(xKeys, series, { height = 240, target } = {}) {
  const W = 760, H = height, padL = 46, padR = 16, padT = 16, padB = 30;
  const iw = W - padL - padR, ih = H - padT - padB;
  const yMaxRaw = Math.max(1, target || 0, ...series.flatMap((s) => s.points.map((p) => p.y)));
  const ticks = niceTicks(yMaxRaw);
  const yMax = ticks[ticks.length - 1];
  const n = xKeys.length;
  const x = (i) => padL + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw);
  const y = (v) => padT + ih - (v / yMax) * ih;
  let s = `<svg class="chart line-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Line chart">`;
  for (const t of ticks) s += `<line x1="${padL}" x2="${W - padR}" y1="${y(t)}" y2="${y(t)}" class="grid"/><text x="${padL - 6}" y="${y(t) + 4}" text-anchor="end" class="axis-t">${fmtN(t)}</text>`;
  const every = Math.ceil(n / 9);
  xKeys.forEach((k, i) => { if (i % every === 0 || i === n - 1) s += `<text x="${x(i)}" y="${H - 10}" text-anchor="middle" class="axis-t">${fmtMonthShort(k + "-01")}</text>`; });
  if (target) s += `<line x1="${padL}" x2="${W - padR}" y1="${y(target)}" y2="${y(target)}" class="target"/><text x="${W - padR}" y="${y(target) - 6}" text-anchor="end" class="axis-t">Annexes raised ${fmtN(target)}</text>`;
  for (const se of series) {
    const pts = se.points.map((p, i) => `${x(i).toFixed(1)},${y(p.y).toFixed(1)}`);
    if (se.area) s += `<path d="M${x(0)},${y(0)} L${pts.join(" L")} L${x(n - 1)},${y(0)} Z" style="fill:${se.color};opacity:.1"/>`;
    s += `<polyline points="${pts.join(" ")}" fill="none" style="stroke:${se.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
    const last = se.points[n - 1];
    if (last) s += `<circle cx="${x(n - 1)}" cy="${y(last.y)}" r="4.5" style="fill:${se.color};stroke:var(--surface)" stroke-width="2"/>`;
  }
  // hover columns
  xKeys.forEach((k, i) => {
    const rows = series.map((se) => [se.key, fmtN(se.points[i]?.y ?? 0)]);
    const w = n <= 1 ? iw : iw / (n - 1);
    s += `<g class="hover-col"><line x1="${x(i)}" x2="${x(i)}" y1="${padT}" y2="${padT + ih}" class="crosshair"/>${series.map((se) => `<circle cx="${x(i)}" cy="${y(se.points[i]?.y ?? 0)}" r="4" style="fill:${se.color};stroke:var(--surface)" stroke-width="2" class="cross-dot"/>`).join("")}<rect x="${x(i) - w / 2}" y="${padT}" width="${w}" height="${ih}" fill="transparent" data-tip="${tip(fmtMonthShort(k + "-01"), rows)}"/></g>`;
  });
  s += `</svg>`;
  return `<div class="legend">${series.map((se) => `<span><i style="background:${se.color}"></i>${esc(se.key)}</span>`).join("")}</div>` + s;
}

/* -------------------------------------------------------- mini dept cells */

export function deptCells(openByDept, depts) {
  return `<div class="dcells">${depts.map((d) => {
    const v = openByDept[d] || 0;
    return `<span class="dcell${v ? " on" : ""}" style="--c:${deptColor(d)}" data-tip="${tip(d, [["Open annexes", String(v)]], deptColor(d))}">${v || ""}</span>`;
  }).join("")}</div>`;
}

export function progressBar(pct, { tone = "" } = {}) {
  const p = Math.max(0, Math.min(1, pct || 0));
  return `<div class="pbar ${tone}"><span style="width:${(p * 100).toFixed(1)}%"></span></div>`;
}

/** The ten annexe slots of a product as a row of status cells. */
export function slotCells(p) {
  return `<div class="slots">${SLOTS.map((s) => {
    const st = p.slots[s.key].status;
    const n = p.slots[s.key].tasks.length;
    const glyph = st === "OK" ? icon("check") : st === "MISSING" ? "!" : st === "open" ? (n > 1 ? n : "") : "";
    return `<span class="slot ${slotCls(st)}" data-tip="${tip(s.label, [["Status", st === "open" ? "Raised, not closed" : st === "OK" ? "Closed" : st === "MISSING" ? "Never raised" : "Not triggered"], ["Tasks", String(n)]])}">${glyph}</span>`;
  }).join("")}</div>`;
}
export const slotHead = () => `<div class="slot-head">${SLOTS.map((s) => `<span title="${esc(s.label)}">${esc(s.short)}</span>`).join("")}</div>`;

/**
 * Stacked columns: one column per group (e.g. planned month), segments in
 * series order from the baseline up, total on the cap, 2px surface gaps.
 * groups: [{ label, sub?, counts: {seriesKey: n}, href? }]
 * series: [{ key, label, color }]
 */
export function stackedColumns(groups, series, { height = 280, width = 760, capLabel = (g, total) => fmtN(total) } = {}) {
  const W = width, H = height, padL = 40, padR = 8, padT = 24, padB = 44;
  const iw = W - padL - padR, ih = H - padT - padB;
  const totals = groups.map((g) => series.reduce((n, s) => n + (g.counts[s.key] || 0), 0));
  const ticks = niceTicks(Math.max(1, ...totals));
  const yMax = ticks[ticks.length - 1];
  const band = iw / Math.max(1, groups.length);
  const bw = Math.min(46, band * 0.62);
  const y = (v) => padT + ih - (v / yMax) * ih;
  let s = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Stacked column chart">`;
  for (const t of ticks) s += `<line x1="${padL}" x2="${W - padR}" y1="${y(t)}" y2="${y(t)}" class="grid"/><text x="${padL - 6}" y="${y(t) + 4}" text-anchor="end" class="axis-t">${fmtN(t)}</text>`;
  s += `<line x1="${padL}" x2="${W - padR}" y1="${y(0)}" y2="${y(0)}" class="baseline"/>`;
  groups.forEach((g, gi) => {
    const x = padL + band * gi + (band - bw) / 2;
    let acc = 0;
    if (g.href) s += `<a href="${esc(g.href)}">`;
    const visible = series.filter((se) => (g.counts[se.key] || 0) > 0);
    visible.forEach((se, si) => {
      const v = g.counts[se.key];
      const y0 = y(acc), y1 = y(acc + v);
      const gap = si < visible.length - 1 ? 2 : 0;
      const top = y1 + (si === 0 ? 0 : 0);
      const h = Math.max(0, y0 - top - (si > 0 ? 2 : 0));
      const isTop = si === visible.length - 1;
      const r = isTop ? Math.min(4, h, bw / 2) : 0;
      const yb = y0 - (si > 0 ? 2 : 0);
      s += `<path d="M${x},${yb} V${top + r} ${r ? `Q${x},${top} ${x + r},${top} H${x + bw - r} Q${x + bw},${top} ${x + bw},${top + r}` : `H${x + bw}`} V${yb} Z" style="fill:${se.color}" class="col" data-tip="${tip(g.label, [[se.label, fmtN(v)], ["Share", fmtPct(v / Math.max(1, totals[gi]))], ["Total", fmtN(totals[gi])]], se.color)}"/>`;
      void gap;
      acc += v;
    });
    if (g.href) s += `</a>`;
    if (totals[gi]) s += `<text x="${x + bw / 2}" y="${y(totals[gi]) - 6}" text-anchor="middle" class="cap-t">${capLabel(g, totals[gi])}</text>`;
    s += `<text x="${x + bw / 2}" y="${H - padB + 16}" text-anchor="middle" class="axis-l">${esc(g.label)}</text>`;
    if (g.sub) s += `<text x="${x + bw / 2}" y="${H - padB + 30}" text-anchor="middle" class="axis-t">${esc(g.sub)}</text>`;
  });
  s += `</svg>`;
  return `<div class="legend">${series.map((se) => `<span><i style="background:${se.color}"></i>${esc(se.label)}</span>`).join("")}</div>${s}`;
}
