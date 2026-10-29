// Hand-built SVG charts. Each builder returns an SVG string; colours come from
// CSS classes (f-G, f-s1 …) so light and dark themes both work. Hover targets
// carry data-tip (lines separated by "\n", **bold** allowed).

import { esc } from "./ui.js";

const trunc = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function niceMax(max, ticks = 4) {
  if (max <= 0) return { top: ticks, step: 1 };
  const raw = max / ticks;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw);
  return { top: Math.ceil(max / step) * step, step };
}

/** Horizontal bars: items [{label, value, cls, tip}] · opts {width, fmt, max, marks:[{v, cls, label}]} */
export function hbars(items, { width = 420, fmt = (v) => v, max, marks = [], labelW = 130, barH = 18, gap = 8 } = {}) {
  if (!items.length) return `<div class="empty">No data yet</div>`;
  const top = max ?? Math.max(1, ...items.map((i) => i.value), ...marks.map((m) => m.v));
  const plotW = width - labelW - 44;
  const h = items.length * (barH + gap) + 18;
  const x = (v) => labelW + (Math.max(0, v) / top) * plotW;
  let s = `<svg class="chart" viewBox="0 0 ${width} ${h}" role="img">`;
  items.forEach((it, i) => {
    const y = i * (barH + gap) + 4;
    const w = Math.max(it.value > 0 ? 3 : 0, x(it.value) - labelW);
    s += `<text class="lbl" x="${labelW - 8}" y="${y + barH / 2 + 4}" text-anchor="end">${esc(trunc(it.label, 20))}</text>`;
    s += `<rect x="${labelW}" y="${y}" width="${plotW}" height="${barH}" rx="5" class="f-N" opacity=".12"/>`;
    s += `<rect x="${labelW}" y="${y}" width="${w}" height="${barH}" rx="5" class="${it.cls || "f-s1"}" data-tip="${esc(it.tip || `**${it.label}**\n${fmt(it.value)}`)}"/>`;
    s += `<text class="val" x="${labelW + w + 6}" y="${y + barH / 2 + 4}">${esc(fmt(it.value))}</text>`;
  });
  for (const m of marks) {
    const mx = x(m.v);
    s += `<line x1="${mx}" x2="${mx}" y1="0" y2="${h - 14}" class="${m.cls || "target"}"/><text x="${mx}" y="${h - 2}" text-anchor="middle">${esc(m.label)}</text>`;
  }
  return `${s}</svg>`;
}

/** Stacked horizontal bars: rows [{label, parts:[{value, cls, name}]}] */
export function stackedH(rows, { width = 520, labelW = 120, barH = 20, gap = 9 } = {}) {
  const top = Math.max(1, ...rows.map((r) => r.parts.reduce((a, p) => a + p.value, 0)));
  const plotW = width - labelW - 36;
  const h = rows.length * (barH + gap) + 4;
  let s = `<svg class="chart" viewBox="0 0 ${width} ${h}" role="img">`;
  rows.forEach((r, i) => {
    const y = i * (barH + gap) + 2;
    let x = labelW;
    const total = r.parts.reduce((a, p) => a + p.value, 0);
    s += `<text class="lbl" x="${labelW - 8}" y="${y + barH / 2 + 4}" text-anchor="end">${esc(r.label)}</text>`;
    for (const p of r.parts) {
      if (!p.value) continue;
      const w = (p.value / top) * plotW;
      s += `<rect x="${x}" y="${y}" width="${Math.max(1, w - 1.5)}" height="${barH}" rx="4" class="${p.cls}" data-tip="**${esc(r.label)} · ${esc(p.name)}**\n${p.value} of ${total}"/>`;
      if (w > 18) s += `<text x="${x + w / 2}" y="${y + barH / 2 + 4}" text-anchor="middle" style="fill:#fff;font-weight:600">${p.value}</text>`;
      x += w;
    }
    s += `<text class="val" x="${x + 6}" y="${y + barH / 2 + 4}">${total}</text>`;
  });
  return `${s}</svg>`;
}

/** Stacked columns (daily activity): cols [{label, parts:[{value, cls, name}], tip}] */
export function columns(cols, { width = 640, height = 190, seriesNames = [] } = {}) {
  const totals = cols.map((c) => c.parts.reduce((a, p) => a + p.value, 0));
  const { top, step } = niceMax(Math.max(1, ...totals));
  const padL = 30, padB = 20, plotH = height - padB - 6, plotW = width - padL - 4;
  const bw = plotW / cols.length;
  let s = `<svg class="chart" viewBox="0 0 ${width} ${height}" role="img">`;
  for (let v = 0; v <= top; v += step) {
    const y = 6 + plotH - (v / top) * plotH;
    s += `<line x1="${padL}" x2="${width}" y1="${y}" y2="${y}" class="grid"/><text x="${padL - 6}" y="${y + 4}" text-anchor="end">${v}</text>`;
  }
  cols.forEach((c, i) => {
    let y = 6 + plotH;
    const x = padL + i * bw + bw * 0.16;
    const w = bw * 0.68;
    for (const p of c.parts) {
      if (!p.value) continue;
      const hh = (p.value / top) * plotH;
      y -= hh;
      s += `<rect x="${x}" y="${y}" width="${w}" height="${Math.max(1, hh - 1)}" rx="2" class="${p.cls}" data-tip="**${esc(c.label)} · ${esc(p.name)}**\n${p.value}"/>`;
    }
    if (cols.length <= 31 && (i % (cols.length > 16 ? 2 : 1) === 0)) s += `<text x="${x + w / 2}" y="${height - 5}" text-anchor="middle">${esc(c.short ?? c.label)}</text>`;
  });
  return `${s}</svg>`;
}

/** Donut: parts [{value, cls, name}] with centre text. */
export function donut(parts, { size = 170, thick = 24, center = "", sub = "" } = {}) {
  const total = parts.reduce((a, p) => a + p.value, 0);
  const r = (size - thick) / 2, c = size / 2, C = 2 * Math.PI * r;
  let off = 0;
  let s = `<svg class="chart" viewBox="0 0 ${size} ${size}" style="max-width:${size}px" role="img"><circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke-width="${thick}" class="ring-track"/>`;
  for (const p of parts) {
    if (!p.value) continue;
    const len = (p.value / total) * C;
    s += `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke-width="${thick}" class="${p.cls.replace("f-", "st-")}"
      stroke-dasharray="${Math.max(0, len - 2)} ${C}" stroke-dashoffset="${-off}" transform="rotate(-90 ${c} ${c})"
      data-tip="**${esc(p.name)}**\n${p.value} of ${total} (${Math.round((p.value / total) * 100)} %)"/>`;
    off += len;
  }
  s += `<text x="${c}" y="${c + 4}" text-anchor="middle" style="font:600 ${size / 6}px var(--font-display);fill:var(--ink)">${esc(center)}</text>`;
  if (sub) s += `<text x="${c}" y="${c + size / 9 + 4}" text-anchor="middle">${esc(sub)}</text>`;
  return `${s}</svg>`;
}

/** Score ring (0–1) coloured by RAG. */
export function ring(score, rag, { size = 132, thick = 12, label = "" } = {}) {
  const r = (size - thick) / 2, c = size / 2, C = 2 * Math.PI * r;
  const v = score === "" ? 0 : Math.max(0, Math.min(1, score));
  const txt = score === "" ? "—" : `${Math.round(v * 100)}%`;
  return `<svg class="chart" viewBox="0 0 ${size} ${size}" style="max-width:${size}px" role="img" aria-label="${esc(label)} ${txt}">
    <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke-width="${thick}" class="ring-track"/>
    <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke-width="${thick}" class="st-${rag}" stroke-linecap="round"
      stroke-dasharray="${v * C} ${C}" transform="rotate(-90 ${c} ${c})"/>
    <text class="ring-txt" x="${c}" y="${c + size / 14}" text-anchor="middle" style="font:600 ${size / 4.2}px var(--font-display)">${txt}</text></svg>`;
}

/** Line chart over 12 months: series [{name, values, cls}], target line optional. */
export function line(series, { labels, width = 640, height = 230, pctAxis = false, target = null, current = -1 } = {}) {
  const all = series.flatMap((s) => s.values.filter((v) => v != null && v !== ""));
  if (!all.length) return `<div class="empty">No history yet — freeze a month in KPI Trend</div>`;
  let lo = Math.min(...all, target ?? Infinity), hi = Math.max(...all, target ?? -Infinity);
  if (pctAxis) { lo = Math.max(0, Math.floor((lo - 0.05) * 10) / 10); hi = Math.min(1.1, Math.ceil((hi + 0.03) * 10) / 10); }
  else { lo = 0; hi = niceMax(Math.max(1, hi)).top; }
  if (hi === lo) hi = lo + 1;
  const padL = 40, padB = 22, padT = 10, plotW = width - padL - 10, plotH = height - padB - padT;
  const x = (i) => padL + (i + 0.5) * (plotW / labels.length);
  const y = (v) => padT + plotH - ((v - lo) / (hi - lo)) * plotH;
  const fmt = (v) => (pctAxis ? `${Math.round(v * 100)}%` : `${Math.round(v * 10) / 10}`);
  let s = `<svg class="chart" viewBox="0 0 ${width} ${height}" role="img">`;
  for (let k = 0; k <= 4; k++) {
    const v = lo + ((hi - lo) * k) / 4;
    s += `<line x1="${padL}" x2="${width - 10}" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="${padL - 6}" y="${y(v) + 4}" text-anchor="end">${fmt(v)}</text>`;
  }
  labels.forEach((l, i) => { s += `<text x="${x(i)}" y="${height - 6}" text-anchor="middle" ${i === current ? 'style="font-weight:700;fill:var(--ink)"' : ""}>${esc(l)}</text>`; });
  if (target != null) s += `<line x1="${padL}" x2="${width - 10}" y1="${y(target)}" y2="${y(target)}" class="target"/><text x="${width - 12}" y="${y(target) - 4}" text-anchor="end">target ${fmt(target)}</text>`;
  for (const se of series) {
    let d = "", pen = false;
    se.values.forEach((v, i) => {
      if (v == null || v === "") { pen = false; return; }
      d += `${pen ? "L" : "M"}${x(i)},${y(v)}`; pen = true;
    });
    s += `<path d="${d}" fill="none" stroke-width="2.4" class="${se.cls.replace("f-", "st-")}" stroke-linejoin="round" stroke-linecap="round"/>`;
    se.values.forEach((v, i) => {
      if (v == null || v === "") return;
      s += `<circle cx="${x(i)}" cy="${y(v)}" r="${i === current ? 5 : 3.5}" class="${se.cls}" stroke="var(--surface)" stroke-width="1.5" data-tip="**${esc(se.name)} · ${esc(labels[i])}**\n${fmt(v)}"/>`;
    });
  }
  return `${s}</svg>`;
}

/** Tiny sparkline for a KPI tile. */
export function spark(values, cls = "st-s1", { width = 160, height = 26, current = -1 } = {}) {
  const pts = values.map((v, i) => [i, v]).filter(([, v]) => v != null && v !== "");
  if (pts.length < 2) return "";
  const lo = Math.min(...pts.map((p) => p[1])), hi = Math.max(...pts.map((p) => p[1]));
  const x = (i) => 3 + (i / (values.length - 1)) * (width - 6);
  const y = (v) => (hi === lo ? height / 2 : 3 + (1 - (v - lo) / (hi - lo)) * (height - 6));
  const d = pts.map(([i, v], k) => `${k ? "L" : "M"}${x(i)},${y(v)}`).join("");
  const last = pts[pts.length - 1];
  return `<svg class="spark" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true"><path d="${d}" fill="none" stroke-width="1.6" class="${cls}" vector-effect="non-scaling-stroke"/>
    <circle cx="${x(last[0])}" cy="${y(last[1])}" r="2.6" class="${cls.replace("st-", "f-")}"/></svg>`;
}
