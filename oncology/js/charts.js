// Chart builders. Horizontal bars are HTML (crisp text, responsive); time series,
// control charts and gauges are SVG redrawn to the container width.
// Every mark carries data-tip for the shared hover tooltip (see app.js).
import { h, esc, fmtNum, fmtPct, fmtMonth } from "./ui.js";
import { t } from "./i18n.js";

/** Redraws draw(width) whenever the container is resized. */
function responsive(draw, minH = 200) {
  const box = h("div.chart", { style: { minHeight: minH + "px" } });
  let last = 0;
  const ro = new ResizeObserver(([e]) => {
    const w = Math.round(e.contentRect.width);
    if (w && Math.abs(w - last) > 2) { last = w; box.replaceChildren(draw(w)); }
  });
  ro.observe(box);
  return box;
}

export function legend(series) {
  return h("div.legend", series.map((s) => h("span.legend-item", h("i", { style: { background: s.color, borderRadius: s.line ? "2px" : null, height: s.line ? "3px" : null } }), s.label)));
}

const tip = (title, rows) => `<b>${esc(title)}</b>` + rows.map(([k, v, c]) => `<div class="tip-row">${c ? `<i style="background:${c}"></i>` : ""}<span>${esc(k)}</span><b>${esc(v)}</b></div>`).join("");

/** Horizontal bars. items: [{label, value, color?, sub?, onclick?, tipRows?}] */
export function hbars(items, { fmt = fmtNum, max, color = "var(--c1)", suffix } = {}) {
  if (!items.length) return h("div.empty", t("no_data"));
  const top = max ?? Math.max(1, ...items.map((i) => i.value));
  return h("div.hbars", items.map((i) => h(i.onclick ? "button.hbar" : "div.hbar", {
    type: i.onclick ? "button" : null, onclick: i.onclick,
    "data-tip": tip(i.label, i.tipRows ?? [[t("col_value"), fmt(i.value), i.color ?? color]]),
  },
  h("span.hbar-label", { title: i.label }, i.label, i.sub ? h("small", i.sub) : null),
  h("span.hbar-track", h("span.hbar-fill", { style: { width: `${Math.max(0, (i.value / top) * 100)}%`, background: i.color ?? color } })),
  h("span.hbar-value", fmt(i.value), suffix ? h("small", suffix(i)) : null))));
}

/** Horizontal 100%-or-absolute stacks. rows: [{label, parts:{key:value}, onclick?}], series: [{key,label,color}] */
export function stacks(rows, series, { absolute = true, showLegend = true } = {}) {
  if (!rows.length) return h("div.empty", t("no_data"));
  const top = Math.max(1, ...rows.map((r) => series.reduce((a, s) => a + (r.parts[s.key] ?? 0), 0)));
  return h("div",
    showLegend ? legend(series) : null,
    h("div.hbars.stacked", rows.map((r) => {
      const total = series.reduce((a, s) => a + (r.parts[s.key] ?? 0), 0);
      return h(r.onclick ? "button.hbar" : "div.hbar", {
        type: r.onclick ? "button" : null, onclick: r.onclick,
        "data-tip": tip(r.label, [...series.filter((s) => r.parts[s.key]).map((s) => [s.label, fmtNum(r.parts[s.key]), s.color]), [t("s_records"), fmtNum(total)]]),
      },
      h("span.hbar-label", { title: r.label }, r.label),
      h("span.hbar-track", h("span.stack", { style: { width: `${absolute ? (total / top) * 100 : 100}%` } },
        series.map((s) => (r.parts[s.key] ? h("span.seg-fill", { style: { flexGrow: r.parts[s.key], background: s.color } }) : null)))),
      h("span.hbar-value", fmtNum(total)));
    })));
}

/** Monthly columns (one or two series side by side) plus an optional line, one shared axis. */
export function columns(points, series, { line, height = 240, xFmt = fmtMonth, stacked, target, fmt = fmtNum, onClick } = {}) {
  if (stacked) return stackedColumns(points, series, { height, xFmt, target, fmt, onClick });
  return h("div", legend([...series, ...(line ? [{ ...line, line: true }] : [])]), responsive((W) => {
    const H = height, L = 34, R = 8, T = 12, B = 28;
    const iw = W - L - R, ih = H - T - B;
    const max = niceMax(Math.max(1, ...points.flatMap((p) => [...series.map((s) => p[s.key] ?? 0), line ? p[line.key] ?? 0 : 0])));
    const y = (v) => T + ih - (v / max) * ih;
    const band = iw / points.length;
    const gap = Math.max(1, Math.min(2, band * 0.08));
    const bw = Math.max(1.5, (band * 0.72 - gap * (series.length - 1)) / series.length);
    const svg = h("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: "svg-chart", role: "img" });
    for (const v of ticks(max)) {
      svg.append(h("line.grid", { x1: L, x2: W - R, y1: y(v), y2: y(v) }), h("text.tick", { x: L - 6, y: y(v) + 4, "text-anchor": "end" }, fmtNum(v)));
    }
    const every = Math.ceil(points.length / Math.max(2, Math.floor(iw / 56)));
    points.forEach((p, i) => {
      const x0 = L + i * band + (band - (bw * series.length + gap * (series.length - 1))) / 2;
      series.forEach((s, j) => {
        const v = p[s.key] ?? 0;
        if (v > 0) svg.append(h("path", { d: roundTop(x0 + j * (bw + gap), y(v), bw, T + ih - y(v), Math.min(3, bw / 2)), fill: s.color }));
      });
      svg.append(h("rect.hit", {
        x: L + i * band, y: T, width: band, height: ih, fill: "transparent",
        "data-tip": tip(xFmt(p.x), [...series.map((s) => [s.label, fmtNum(p[s.key] ?? 0), s.color]), ...(line ? [[line.label, fmtNum(p[line.key], 1), line.color]] : [])]),
      }));
      if (i % every === 0) svg.append(h("text.tick", { x: L + i * band + band / 2, y: H - 8, "text-anchor": "middle" }, xFmt(p.x)));
    });
    if (line) {
      const pts = points.map((p, i) => [L + i * band + band / 2, y(p[line.key] ?? 0)]);
      svg.append(h("polyline", { points: pts.map((q) => q.join(",")).join(" "), fill: "none", stroke: line.color, "stroke-width": 2, "stroke-linejoin": "round", "pointer-events": "none" }));
    }
    svg.append(h("line.axis", { x1: L, x2: W - R, y1: T + ih, y2: T + ih }));
    return svg;
  }, height));
}

/** Stacked monthly / quarterly columns with an optional dashed target line. */
function stackedColumns(points, series, { height, xFmt, target, fmt, onClick }) {
  return h("div", legend([...series, ...(target != null ? [{ label: target.label, color: "var(--critical)", line: true }] : [])]), responsive((W) => {
    const H = height, L = 38, R = 8, T = 12, B = 28;
    const iw = W - L - R, ih = H - T - B;
    const tot = (p) => series.reduce((a, s) => a + (p[s.key] ?? 0), 0);
    const max = target?.pct ? 1 : niceMax(Math.max(1, ...points.map(tot), target?.value ?? 0));
    const y = (v) => T + ih - (v / max) * ih;
    const band = iw / points.length;
    const bw = Math.max(2, Math.min(46, band * 0.62));
    const svg = h("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: "svg-chart", role: "img" });
    for (const v of ticks(max, target?.pct)) svg.append(h("line.grid", { x1: L, x2: W - R, y1: y(v), y2: y(v) }), h("text.tick", { x: L - 6, y: y(v) + 4, "text-anchor": "end" }, target?.pct ? fmtPct(v) : fmtNum(v)));
    const every = Math.ceil(points.length / Math.max(2, Math.floor(iw / 56)));
    points.forEach((p, i) => {
      const x = L + i * band + (band - bw) / 2;
      let acc = 0;
      const visible = series.filter((s) => (p[s.key] ?? 0) > 0);
      series.forEach((s) => {
        const v = p[s.key] ?? 0;
        if (v <= 0) return;
        const top = s === visible.at(-1);
        const y0 = y(acc), y1 = y(acc + v);
        svg.append(h("path", { d: top ? roundTop(x, y1, bw, y0 - y1 - (acc ? 1 : 0), Math.min(3, bw / 2)) : `M${x},${y0}H${x + bw}V${y1 + 1}H${x}Z`, fill: s.color }));
        acc += v;
      });
      svg.append(h("rect.hit", {
        x: L + i * band, y: T, width: band, height: ih, fill: "transparent", style: onClick ? { cursor: "pointer" } : null, onclick: onClick ? () => onClick(p) : null,
        "data-tip": tip(xFmt(p.x), [...series.map((s) => [s.label, fmt(p[s.key] ?? 0), s.color]), ...(series.length > 1 ? [[t("s_records"), fmt(tot(p))]] : [])]),
      }));
      if (i % every === 0) svg.append(h("text.tick", { x: L + i * band + band / 2, y: H - 8, "text-anchor": "middle" }, xFmt(p.x)));
    });
    if (target?.value != null) svg.append(h("line", { x1: L, x2: W - R, y1: y(target.value), y2: y(target.value), stroke: "var(--critical)", "stroke-width": 1.5, "stroke-dasharray": "5 4" }));
    svg.append(h("line.axis", { x1: L, x2: W - R, y1: T + ih, y2: T + ih }));
    return svg;
  }, height));
}

/**
 * Heat matrix: rows × columns of counts (HTML table). cell(r, c) → number; onCell(r, c) optional.
 */
export function matrix(rows, cols, cell, { onCell, rowLabel = (r) => r, colLabel = (c) => c, color = "var(--c1)" } = {}) {
  const vals = rows.flatMap((r) => cols.map((c) => cell(r, c)));
  const max = Math.max(1, ...vals);
  return h("div.matrix-wrap", h("table.matrix",
    h("thead", h("tr", h("th"), cols.map((c) => h("th", colLabel(c))), h("th.num", "Σ"))),
    h("tbody", rows.map((r) => {
      const sum = cols.reduce((a, c) => a + cell(r, c), 0);
      return h("tr", h("th", { title: rowLabel(r) }, rowLabel(r)), cols.map((c) => {
        const v = cell(r, c);
        return h("td", {
          class: v ? "on" : "", style: { "--a": v ? 0.12 + 0.88 * (v / max) : 0, "--mc": color },
          "data-tip": v ? tip(`${rowLabel(r)} · ${colLabel(c)}`, [[t("s_count"), fmtNum(v)]]) : null,
          onclick: v && onCell ? () => onCell(r, c) : null,
        }, v || "");
      }), h("td.num.sum", fmtNum(sum)));
    }))));
}

/**
 * Month-grid plan: items [{label, sub, start, end, color, status, tip, onclick}] over `months` from `from`.
 */
export function gantt(items, { from, months = 12, today } = {}) {
  const ms = Array.from({ length: months }, (_, i) => { const d = new Date(from); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + i, 1); });
  const end = (() => { const d = new Date(ms.at(-1)); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1); })();
  const pos = (ts) => Math.max(0, Math.min(100, ((ts - ms[0]) / (end - ms[0])) * 100));
  const names = t("col_month") === "Mois" ? ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"] : ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
  const now = today != null && today >= ms[0] && today < end ? h("i.gantt-now", { style: { left: `${pos(today)}%` } }) : null;
  if (!items.length) return h("div.empty", t("no_data"));
  return h("div.gantt", { style: { "--cols": months } },
    h("div.gantt-row.gantt-head", h("span"), h("div.gantt-months", ms.map((m) => h("span", names[new Date(m).getUTCMonth()] + (new Date(m).getUTCMonth() === 0 || m === ms[0] ? ` ${String(new Date(m).getUTCFullYear()).slice(2)}` : ""))), now?.cloneNode())),
    items.map((it) => {
      const s = it.start ?? it.end, e = Math.max(it.end ?? s, s) + 86400000 * 3;
      const visible = s != null && e >= ms[0] && s < end;
      return h(it.onclick ? "button.gantt-row" : "div.gantt-row", { type: it.onclick ? "button" : null, onclick: it.onclick },
        h("span.gantt-label", { title: it.label }, it.label, it.sub ? h("small", it.sub) : null),
        h("div.gantt-track",
          now?.cloneNode(),
          visible ? h("i.gantt-bar", { style: { left: `${pos(s)}%`, width: `${Math.max(1.2, pos(e) - pos(s))}%`, background: it.color }, "data-tip": it.tip ?? `<b>${esc(it.label)}</b>` }) : null,
          it.mark != null && it.mark >= ms[0] && it.mark < end ? h("i.gantt-mark", { style: { left: `${pos(it.mark)}%` }, title: "✔" }) : null));
    }));
}

/** Lines over months, optional control limits and signal markers. */
export function lineChart(points, series, { height = 260, limits, fmt = fmtNum, yMax, pct } = {}) {
  const f = pct ? (v) => fmtPct(v) : fmt;
  return h("div", legend([...series.map((s) => ({ ...s, line: true })), ...(limits ? [{ label: t("s_cl"), color: "var(--ink-3)", line: true }, { label: `${t("s_ucl")} / ${t("s_lcl")}`, color: "var(--critical)", line: true }, { label: t("s_sig"), color: "var(--critical)" }] : [])]), responsive((W) => {
    const H = height, L = pct ? 42 : 34, R = 10, T = 12, B = 28;
    const iw = W - L - R, ih = H - T - B;
    const vals = points.flatMap((p) => [...series.map((s) => p[s.key]), ...(limits ? [p.ucl] : [])]).filter((v) => v != null);
    const max = yMax ?? niceMax(Math.max(pct ? 0.1 : 1, ...vals), pct);
    const step = iw / Math.max(1, points.length - 1);
    const x = (i) => L + i * step;
    const y = (v) => T + ih - (Math.min(v, max) / max) * ih;
    const svg = h("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: "svg-chart", role: "img" });
    for (const v of ticks(max, pct)) svg.append(h("line.grid", { x1: L, x2: W - R, y1: y(v), y2: y(v) }), h("text.tick", { x: L - 6, y: y(v) + 4, "text-anchor": "end" }, f(v)));
    const every = Math.ceil(points.length / Math.max(2, Math.floor(iw / 56)));
    points.forEach((p, i) => { if (i % every === 0) svg.append(h("text.tick", { x: x(i), y: H - 8, "text-anchor": "middle" }, fmtMonth(p.month))); });
    const path = (key, stroke, dash, w = 2) => {
      let d = "", pen = false;
      points.forEach((p, i) => {
        if (p[key] == null) { pen = false; return; }
        d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(p[key]).toFixed(1)}`; pen = true;
      });
      if (d) svg.append(h("path", { d, fill: "none", stroke, "stroke-width": w, "stroke-dasharray": dash, "stroke-linejoin": "round", "stroke-linecap": "round" }));
    };
    if (limits) { path("ucl", "var(--critical)", "5 4", 1.5); path("lcl", "var(--critical)", "5 4", 1.5); path("cl", "var(--ink-3)", "2 3", 1.5); }
    series.forEach((s) => path(s.key, s.color));
    if (series[0].area) {
      const s = series[0];
      const d = points.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p[s.key] ?? 0)}`).join("") + `L${x(points.length - 1)},${T + ih}L${x(0)},${T + ih}Z`;
      svg.prepend(h("defs", h("linearGradient", { id: "ag" + s.key, x1: 0, x2: 0, y1: 0, y2: 1 }, h("stop", { offset: "0", "stop-color": s.color, "stop-opacity": 0.22 }), h("stop", { offset: "1", "stop-color": s.color, "stop-opacity": 0 }))));
      svg.insertBefore(h("path", { d, fill: `url(#ag${s.key})` }), svg.querySelector("path"));
    }
    points.forEach((p, i) => {
      series.forEach((s, j) => {
        if (p[s.key] == null) return;
        const sig = j === 0 && p.signals?.length;
        if (sig) svg.append(h("circle", { cx: x(i), cy: y(p[s.key]), r: 5.5, fill: "var(--critical)", stroke: "var(--surface)", "stroke-width": 2 }));
        else if (points.length <= 30) svg.append(h("circle", { cx: x(i), cy: y(p[s.key]), r: 2.6, fill: s.color }));
      });
      const rows = series.map((s) => [s.label, p[s.key] == null ? "—" : f(p[s.key]), s.color]);
      if (limits) rows.push([t("s_cl"), f(p.cl)], [t("s_ucl"), p.ucl == null ? "—" : f(p.ucl)], [t("s_lcl"), p.lcl == null ? "—" : f(p.lcl)]);
      if (p.n != null) rows.push([t("col_n"), fmtNum(p.n)]);
      if (p.signals?.length) rows.push([t("s_sig"), p.signals.join(" "), "var(--critical)"]);
      svg.append(h("rect.hit", { x: x(i) - step / 2, y: T, width: Math.max(step, 6), height: ih, fill: "transparent", "data-tip": tip(fmtMonth(p.month), rows) }));
    });
    svg.append(h("line.axis", { x1: L, x2: W - R, y1: T + ih, y2: T + ih }));
    return svg;
  }, height));
}

/** 5×5 severity × occurrence heat map (HTML grid). counts[o][s] = {n, items} */
export function heatmap(cells, { onCell } = {}) {
  const max = Math.max(1, ...cells.flat().map((c) => c.n));
  const grid = h("div.heat");
  grid.append(h("span.heat-corner", t("fm_occ")));
  for (let s = 1; s <= 5; s++) grid.append(h("span.heat-h", s));
  for (let o = 5; o >= 1; o--) {
    grid.append(h("span.heat-h", o));
    for (let s = 1; s <= 5; s++) {
      const c = cells[o - 1][s - 1];
      const zone = s * o >= 15 ? "hi" : s * o >= 6 ? "mid" : "lo";
      grid.append(h(`button.heat-cell.z-${zone}`, {
        type: "button", disabled: c.n ? null : true,
        style: { "--a": c.n ? 0.18 + 0.82 * (c.n / max) : 0 },
        "data-tip": tip(`S ${s} × O ${o}`, [[t("s_count"), fmtNum(c.n)]]),
        onclick: c.n && onCell ? () => onCell(s, o, c.items) : null,
      }, c.n || ""));
    }
  }
  return h("div.heat-wrap", grid, h("div.heat-axis", t("fm_sev")));
}

/** Semicircle gauge 0–100 % with action / watch / target bands. */
export function gauge(value, { target, warning, label, sub }) {
  const W = 220, H = 150, cx = 110, cy = 104, r = 86;
  const ang = (v) => Math.PI * (1 - Math.max(0, Math.min(1, v)));
  const pt = (v, rr = r) => [cx + rr * Math.cos(ang(v)), cy - rr * Math.sin(ang(v))];
  const arc = (a, b, color) => {
    const [x1, y1] = pt(a), [x2, y2] = pt(b);
    return h("path", { d: `M${x1},${y1} A${r},${r} 0 0 1 ${x2},${y2}`, stroke: color, "stroke-width": 14, fill: "none" });
  };
  const v = value ?? 0;
  const [nx, ny] = pt(v, r - 26);
  const status = v >= target ? 3 : v >= warning ? 2 : 1;
  return h("div.gauge",
    h("svg", { viewBox: `0 0 ${W} ${H}`, class: "svg-gauge", role: "img", "aria-label": `${label}: ${fmtPct(v)}` },
      arc(0, warning, "var(--g-action)"), arc(warning, target, "var(--g-watch)"), arc(target, 1, "var(--g-on)"),
      h("line", { x1: cx, y1: cy, x2: nx, y2: ny, stroke: "var(--ink)", "stroke-width": 3, "stroke-linecap": "round" }),
      h("circle", { cx, cy, r: 6, fill: "var(--ink)" }),
      h("text.gauge-v", { x: cx, y: cy + 38, "text-anchor": "middle" }, fmtPct(v))),
    h("div.gauge-l", label),
    h("div.gauge-s", h(`span.rag.rag-${status}`, h("i"), [null, t("st_action"), t("st_watch"), t("st_on")][status]), " ", sub));
}

/** Progress ring for a single share. */
export function ring(value, { size = 64, color = "var(--c1)", label } = {}) {
  const r = size / 2 - 5, c = 2 * Math.PI * r, v = Math.max(0, Math.min(1, value ?? 0));
  return h("svg", { viewBox: `0 0 ${size} ${size}`, width: size, height: size, class: "ring", role: "img", "aria-label": label ?? fmtPct(v) },
    h("circle", { cx: size / 2, cy: size / 2, r, fill: "none", stroke: "var(--track)", "stroke-width": 7 }),
    h("circle", { cx: size / 2, cy: size / 2, r, fill: "none", stroke: color, "stroke-width": 7, "stroke-linecap": "round", "stroke-dasharray": `${c * v} ${c}`, transform: `rotate(-90 ${size / 2} ${size / 2})` }),
    h("text", { x: size / 2, y: size / 2 + 4, "text-anchor": "middle", class: "ring-t" }, fmtPct(v)));
}

/** Tiny trend line for KPI tiles. */
export function sparkline(values, { color = "var(--c1)", w = 120, hgt = 30 } = {}) {
  if (!values.length) return null;
  const max = Math.max(1, ...values), step = w / Math.max(1, values.length - 1);
  const pts = values.map((v, i) => `${(i * step).toFixed(1)},${(hgt - 3 - (v / max) * (hgt - 6)).toFixed(1)}`);
  return h("svg.spark", { viewBox: `0 0 ${w} ${hgt}`, preserveAspectRatio: "none", "aria-hidden": "true" },
    h("path", { d: `M0,${hgt} L${pts.join(" L")} L${w},${hgt} Z`, fill: color, opacity: 0.12 }),
    h("polyline", { points: pts.join(" "), fill: "none", stroke: color, "stroke-width": 1.6, "vector-effect": "non-scaling-stroke" }));
}

// ---------- scales ----------
function niceMax(v, pct) {
  if (pct) return Math.min(1, Math.ceil(v * 10) / 10 || 0.1);
  if (v <= 4) return 4; // whole-number ticks for small counts
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 1.2, 1.6, 2, 2.4, 3, 4, 6, 8, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}
function ticks(max, pct) {
  const n = 4, out = [];
  for (let i = 0; i <= n; i++) out.push(pct ? Math.round((max * i) / n * 100) / 100 : Math.round((max * i) / n * 10) / 10);
  return [...new Set(out)];
}
function roundTop(x, y, w, hgt, r) {
  if (hgt <= 0) return "";
  r = Math.min(r, hgt);
  return `M${x},${y + hgt}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + hgt}Z`;
}
