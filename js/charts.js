// Small hand-built SVG charts for the Analysis view. Each function returns an
// SVG string sized to `width`; colours come from CSS classes so both themes work.
// Hover targets carry `data-tip` (HTML-escaped text, lines separated by "\n").

import { LEVELS } from "./risk.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const truncate = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function niceStep(max, targetTicks = 5) {
  const raw = Math.max(1, max) / targetTicks;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw);
  return Number.isInteger(step) ? step : Math.ceil(step);
}

function ticks(max, targetTicks) {
  const step = niceStep(max, targetTicks);
  const top = Math.max(step, Math.ceil(max / step) * step);
  const out = [];
  for (let v = 0; v <= top; v += step) out.push(v);
  return { top, values: out };
}

/** Rect with only the right-hand (data) end rounded. */
function hBarPath(x, y, w, h, r = 4) {
  r = Math.min(r, w, h / 2);
  return `M${x},${y}H${x + w - r}A${r},${r} 0 0 1 ${x + w},${y + r}V${y + h - r}` +
    `A${r},${r} 0 0 1 ${x + w - r},${y + h}H${x}Z`;
}

/** Rect with only the top (data) end rounded. */
function vBarPath(x, y, w, h, r = 4) {
  r = Math.min(r, h, w / 2);
  return `M${x},${y + h}V${y + r}A${r},${r} 0 0 1 ${x + r},${y}H${x + w - r}` +
    `A${r},${r} 0 0 1 ${x + w},${y + r}V${y + h}Z`;
}

/**
 * Dumbbell chart: initial RPN (hollow magenta ring) to residual RPN (solid blue
 * dot) per risk. Risks without a residual assessment show the initial mark only.
 */
export function controlEffectChart(risks, width) {
  const rows = [...risks].sort((a, b) => b.rpn - a.rpn);
  const narrow = width < 560;
  const labelW = narrow ? 64 : 250;
  const right = 24;
  const top = 8;
  const rowH = 30;
  const axisH = 28;
  const plotW = Math.max(120, width - labelW - right);
  const { top: max, values } = ticks(Math.max(...rows.map((r) => r.rpn), 25), narrow ? 4 : 6);
  const x = (v) => labelW + (v / max) * plotW;
  const height = top + rows.length * rowH + axisH;
  const parts = [];

  for (const v of values) {
    parts.push(`<line class="grid" x1="${x(v)}" x2="${x(v)}" y1="${top}" y2="${top + rows.length * rowH}"/>`);
    parts.push(`<text class="tick" x="${x(v)}" y="${height - 8}" text-anchor="middle">${v}</text>`);
  }

  rows.forEach((r, i) => {
    const cy = top + i * rowH + rowH / 2;
    const label = narrow ? r.id : `${r.id}  ${truncate(r.title, 30)}`;
    const assessed = r.residualRpn !== null && r.residualRpn !== undefined;
    const tip = [
      `${r.id} · ${r.title}`,
      `Initial RPN ${r.rpn} (${r.level})`,
      assessed
        ? `Residual RPN ${r.residualRpn} (${r.residualLevel}) · ${r.rpn - r.residualRpn >= 0 ? "−" : "+"}${Math.abs(r.rpn - r.residualRpn)}`
        : "Residual risk not assessed",
      `Status: ${r.status}`,
    ].join("\n");
    parts.push(`<g class="hit" data-tip="${esc(tip)}" data-id="${esc(r.id)}">`);
    parts.push(`<rect class="hit-area" x="0" y="${cy - rowH / 2}" width="${width}" height="${rowH}"/>`);
    parts.push(`<text class="row-label" x="${labelW - 12}" y="${cy + 4}" text-anchor="end">${esc(label)}</text>`);
    if (assessed) {
      const x1 = x(r.residualRpn);
      const x0 = x(r.rpn);
      if (Math.abs(x0 - x1) > 12) {
        parts.push(`<line class="connector" x1="${Math.min(x0, x1) + 6}" x2="${Math.max(x0, x1) - 6}" y1="${cy}" y2="${cy}"/>`);
      }
      parts.push(`<circle class="mark-initial" cx="${x0}" cy="${cy}" r="5"/>`);
      parts.push(`<circle class="mark-residual" cx="${x1}" cy="${cy}" r="5"/>`);
    } else {
      parts.push(`<circle class="mark-initial" cx="${x(r.rpn)}" cy="${cy}" r="5"/>`);
      // Put the note on whichever side of the mark has room.
      const fitsRight = x(r.rpn) + 92 < width;
      parts.push(`<text class="note" x="${x(r.rpn) + (fitsRight ? 12 : -12)}" y="${cy + 4}"` +
        ` text-anchor="${fitsRight ? "start" : "end"}">not assessed</text>`);
    }
    parts.push("</g>");
  });

  parts.push(`<line class="baseline" x1="${labelW}" x2="${labelW + plotW}" y1="${top + rows.length * rowH}" y2="${top + rows.length * rowH}"/>`);
  return svg(width, height, "Initial versus residual RPN per risk", parts);
}

/** Horizontal stacked bars: risk count per group, split by level. */
export function levelProfileChart(rows, width) {
  const narrow = width < 560;
  const labelW = narrow ? 104 : 170;
  const right = 36;
  const top = 8;
  const barH = 20;
  const rowH = 32;
  const axisH = 28;
  const plotW = Math.max(120, width - labelW - right);
  const { top: max, values } = ticks(Math.max(...rows.map((r) => r.total), 1), narrow ? 3 : 5);
  const x = (v) => labelW + (v / max) * plotW;
  const height = top + rows.length * rowH + axisH;
  const parts = [];

  for (const v of values) {
    parts.push(`<line class="grid" x1="${x(v)}" x2="${x(v)}" y1="${top}" y2="${top + rows.length * rowH}"/>`);
    parts.push(`<text class="tick" x="${x(v)}" y="${height - 8}" text-anchor="middle">${v}</text>`);
  }

  rows.forEach((row, i) => {
    const y = top + i * rowH + (rowH - barH) / 2;
    const tip = [row.group, ...LEVELS.slice().reverse().filter((l) => row[l]).map((l) => `${l}: ${row[l]}`),
      `Total: ${row.total}`].join("\n");
    parts.push(`<g class="hit" data-tip="${esc(tip)}">`);
    parts.push(`<rect class="hit-area" x="0" y="${top + i * rowH}" width="${width}" height="${rowH}"/>`);
    parts.push(`<text class="row-label" x="${labelW - 12}" y="${y + barH / 2 + 4}" text-anchor="end">${esc(truncate(row.group, narrow ? 13 : 22))}</text>`);
    let acc = 0;
    const present = LEVELS.filter((l) => row[l] > 0);
    present.forEach((level, j) => {
      const x0 = x(acc);
      const w = x(acc + row[level]) - x0;
      acc += row[level];
      const last = j === present.length - 1;
      // 2px surface gap between adjacent segments.
      const drawW = last ? w : Math.max(1, w - 2);
      parts.push(last
        ? `<path class="fill-${level}" d="${hBarPath(x0, y, drawW, barH)}"/>`
        : `<rect class="fill-${level}" x="${x0}" y="${y}" width="${drawW}" height="${barH}"/>`);
    });
    parts.push(`<text class="value" x="${x(row.total) + 8}" y="${y + barH / 2 + 4}">${row.total}</text>`);
    parts.push("</g>");
  });

  parts.push(`<line class="baseline" x1="${labelW}" x2="${labelW}" y1="${top}" y2="${top + rows.length * rowH}"/>`);
  return svg(width, height, "Risk count per group split by risk level", parts);
}

/** Vertical bars: open-risk reviews that are overdue or due per month. */
export function reviewScheduleChart(buckets, width) {
  const narrow = width < 560;
  const left = 32;
  const right = 8;
  const top = 22;
  const plotH = 170;
  const axisH = narrow ? 44 : 30;
  const plotW = Math.max(160, width - left - right);
  const slot = plotW / buckets.length;
  const barW = Math.min(44, slot - 8);
  const { top: max, values } = ticks(Math.max(...buckets.map((b) => b.count), 1), 4);
  const y = (v) => top + plotH - (v / max) * plotH;
  const height = top + plotH + axisH;
  const parts = [];

  for (const v of values) {
    parts.push(`<line class="grid" x1="${left}" x2="${left + plotW}" y1="${y(v)}" y2="${y(v)}"/>`);
    parts.push(`<text class="tick" x="${left - 8}" y="${y(v) + 4}" text-anchor="end">${v}</text>`);
  }

  buckets.forEach((b, i) => {
    const cx = left + slot * i + slot / 2;
    const kind = b.key === "overdue" ? "overdue" : b.key === "none" ? "unset" : "due";
    const tip = [b.label, `${b.count} review(s)${b.key === "overdue" ? " overdue" : ""}`,
      ...(b.ids.length ? [b.ids.join(", ")] : [])].join("\n");
    parts.push(`<g class="hit" data-tip="${esc(tip)}">`);
    parts.push(`<rect class="hit-area" x="${left + slot * i}" y="${top - 20}" width="${slot}" height="${plotH + 20}"/>`);
    if (b.count > 0) {
      const h = plotH - (y(b.count) - top);
      parts.push(`<path class="bar-${kind}" d="${vBarPath(cx - barW / 2, y(b.count), barW, h)}"/>`);
      parts.push(`<text class="value${kind === "overdue" ? " value-alert" : ""}" x="${cx}" y="${y(b.count) - 6}" text-anchor="middle">${b.count}</text>`);
    }
    if (narrow) {
      // Two short lines per slot so labels never collide at phone width.
      const [first, second = ""] = b.key === "overdue" ? ["Over-", "due"]
        : /^\d{4}-/.test(b.key) ? [b.label.slice(0, 3), `’${b.label.slice(-2)}`]
        : b.label.split(" ");
      const cls = `tick${kind === "overdue" ? " tick-alert" : ""}`;
      parts.push(`<text class="${cls}" x="${cx}" y="${top + plotH + 16}" text-anchor="middle">${esc(first)}</text>`);
      if (second) parts.push(`<text class="${cls}" x="${cx}" y="${top + plotH + 30}" text-anchor="middle">${esc(second)}</text>`);
    } else {
      parts.push(`<text class="tick${kind === "overdue" ? " tick-alert" : ""}" x="${cx}" y="${top + plotH + 18}" text-anchor="middle">${esc(narrow ? truncate(b.label, 7) : b.label)}</text>`);
    }
    parts.push("</g>");
  });

  parts.push(`<line class="baseline" x1="${left}" x2="${left + plotW}" y1="${top + plotH}" y2="${top + plotH}"/>`);
  return svg(width, height, "Number of open-risk reviews overdue and due per month", parts);
}

function svg(width, height, label, parts) {
  return `<svg class="chart" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(label)}">${parts.join("")}</svg>`;
}
