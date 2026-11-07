// The Tier 2 daily dashboard as an A3 board to print and present: drawn
// straight onto a 300 dpi canvas (4961 × 3508 px, landscape) in the app's own
// fonts, then saved as an A3 PDF (for the printer) or a PNG tagged 300 dpi.
// The layout is fixed in millimetres, so every export looks the same whatever
// the screen it was made on.

import { store } from "./store.js";
import * as E from "./engine.js";
import { T2_REGISTERS } from "./schema.js";
import { applyFilters, pageFilters, describe, activeCount } from "./filters.js";
import { hasTier } from "./edition.js";
import { esc, fmtLong, fmtMonth, fmtKpi, fmtNum, pct, modal, toast } from "./ui.js";
import { saveFile, loadScript, slug } from "./export.js";

export const JSPDF_URL = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
const A3 = { w: 420, h: 297 }; // mm, landscape
const PT = 0.3528; // 1 pt in mm

// print palette: white paper, the board's navy and teal, the RAG colours of the app
const C = {
  ink: "#0e1a2b", ink2: "#2f3d55", muted: "#5e6a7e", line: "#d5dce5", panel: "#f5f7fa", paper: "#ffffff",
  navy: "#0f2340", navy2: "#16305a", teal: "#0c8f8a", tealLight: "#7fe3dc", heroText: "#b8c7e0",
  G: "#0ca30c", A: "#e9a100", R: "#d03b3b", N: "#a3adbb",
  Gbg: "#dcf2e6", Abg: "#fdf1cf", Rbg: "#fbdfdf", Nbg: "#eceef2",
  Gink: "#0f6b3f", Aink: "#8a5f00", Rink: "#a52222", Nink: "#5d6878",
  day1: "#cdeedb", day2: "#fde6a8", day3: "#f6c4c4", week: "#e3e7ec", track: "#e6ebf1",
};
const FAM = { display: '"Archivo", "Helvetica Neue", Arial, sans-serif', body: '"Source Sans 3", "Segoe UI", Arial, sans-serif', mono: '"JetBrains Mono", Consolas, monospace' };

/** Wait for the web fonts the board is drawn in (the canvas uses them only once loaded). */
async function fontsReady() {
  const want = ['800 20px "Archivo"', '700 20px "Archivo"', '600 20px "Archivo"', '400 20px "Source Sans 3"', '600 20px "Source Sans 3"', '700 20px "Source Sans 3"', 'italic 400 20px "Source Sans 3"', '500 20px "JetBrains Mono"'];
  await Promise.all(want.map((f) => document.fonts?.load(f).catch(() => null)));
}

function painter(ctx) {
  const set = (fam, pt, w = 400, { stretch = "normal", italic = false, spacing = 0 } = {}) => {
    ctx.font = `${italic ? "italic " : ""}${w} ${pt * PT}px ${FAM[fam]}`;
    if ("fontStretch" in ctx) ctx.fontStretch = stretch;
    if ("letterSpacing" in ctx) ctx.letterSpacing = `${spacing}px`;
  };
  const fit = (s, max) => {
    s = String(s ?? "");
    if (ctx.measureText(s).width <= max) return s;
    let lo = 0, hi = s.length;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (ctx.measureText(s.slice(0, mid) + "…").width <= max) lo = mid; else hi = mid - 1; }
    return s.slice(0, lo).trimEnd() + "…";
  };
  const wrap = (s, max, lines = 2) => {
    const words = String(s ?? "").split(/\s+/).filter(Boolean), out = [];
    let cur = "";
    for (let i = 0; i < words.length; i++) {
      const t = cur ? `${cur} ${words[i]}` : words[i];
      if (ctx.measureText(t).width <= max || !cur) { cur = t; continue; }
      out.push(cur); cur = words[i];
      if (out.length === lines - 1) { cur = words.slice(i).join(" "); break; }
    }
    if (cur) out.push(out.length === lines - 1 ? fit(cur, max) : cur);
    return out.slice(0, lines);
  };
  const text = (s, x, y, { color = C.ink, align = "left", base = "alphabetic", max = 0 } = {}) => {
    ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = base;
    const str = max ? fit(s, max) : String(s ?? "");
    ctx.fillText(str, x, y);
    return ctx.measureText(str).width;
  };
  const rr = (x, y, w, h, r) => { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); };
  const box = (x, y, w, h, { r = 3, fill = C.paper, stroke = C.line, lw = 0.25 } = {}) => {
    rr(x, y, w, h, r);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
  };
  /** A status pill; `right` anchors its right edge at x. Returns its width. */
  const pill = (label, x, y, rag = "N", { pt = 6.2, right = false, h = 3.9 } = {}) => {
    set("body", pt, 700);
    const w = ctx.measureText(label).width + 3.2;
    const x0 = right ? x - w : x;
    rr(x0, y, w, h, h / 2); ctx.fillStyle = C[`${rag}bg`] || C.Nbg; ctx.fill();
    text(label, x0 + w / 2, y + h / 2 + 0.1, { color: C[`${rag}ink`] || C.Nink, align: "center", base: "middle" });
    return w;
  };
  /** A panel: white card, an uppercase title and an optional note on its right. */
  const panel = (x, y, w, h, title, note = "") => {
    box(x, y, w, h, { r: 3, fill: C.paper, stroke: C.line, lw: 0.3 });
    set("display", 8.2, 700, { stretch: "semi-expanded", spacing: 0.35 });
    const tw = text(title.toUpperCase(), x + 4, y + 6.4, { color: C.ink });
    if (note) { set("body", 7, 400); text(note, x + 4 + tw + 2.5, y + 6.4, { color: C.muted, max: w - tw - 10 }); }
  };
  return { set, fit, wrap, text, rr, box, pill, panel };
}

const RAG_OF = { 1: "G", 2: "A", 3: "R" };
const dueLabel = (c) => (c.live === "Overdue" ? ["Overdue", "R"] : c.toDue === "" || c.toDue == null ? [c.live || "Open", "N"] : c.toDue === 0 ? ["Due today", "A"] : [`${c.toDue} d`, c.toDue <= 1 ? "A" : "N"]);

/** Draw the board for the current state (and the dashboard filters) on a canvas. */
export async function drawA3Board({ dpi = 300, filters = pageFilters("board") } = {}) {
  await fontsReady();
  const base = store.t2;
  const s = applyFilters("t2", base, filters), st = s.setup;
  const comp = E.t2Computed(s);
  const { kpis, other, pulse } = E.t2Kpis(s, comp);
  const cal = E.t2Calendar(s);
  const sum = E.t2Summary(s, comp);
  const log = s.daily[st.statusDate] || {};
  const elapsed = cal.filter((d) => !d.weekend && !d.future);
  const held = elapsed.filter((d) => d.log.held === "Yes").length;
  const att = elapsed.map((d) => d.log.attendees).filter((v) => v !== "" && v != null);
  const critDays = cal.filter((d) => d.code === 3).length;

  const px = (mm) => Math.round((mm / 25.4) * dpi);
  const canvas = document.createElement("canvas");
  canvas.width = px(A3.w); canvas.height = px(A3.h);
  const ctx = canvas.getContext("2d");
  ctx.scale(canvas.width / A3.w, canvas.height / A3.h);
  const P = painter(ctx);
  const { set, text, box, pill, panel, wrap, fit, rr } = P;
  ctx.fillStyle = C.paper; ctx.fillRect(0, 0, A3.w, A3.h);

  /* ── header band ── */
  const H = { x: 10, y: 10, w: 400, h: 37 };
  rr(H.x, H.y, H.w, H.h, 4);
  const g = ctx.createLinearGradient(H.x, 0, H.x + H.w, 0);
  g.addColorStop(0, C.navy); g.addColorStop(0.6, "#132c52"); g.addColorStop(1, "#0d2a3f");
  ctx.fillStyle = g; ctx.fill();
  ctx.save(); rr(H.x, H.y, H.w, H.h, 4); ctx.clip();
  const glow = ctx.createRadialGradient(H.x + H.w * 0.86, H.y - 8, 2, H.x + H.w * 0.86, H.y - 8, 120);
  glow.addColorStop(0, "rgba(25,179,171,.42)"); glow.addColorStop(1, "rgba(25,179,171,0)");
  ctx.fillStyle = glow; ctx.fillRect(H.x, H.y, H.w, H.h);
  ctx.strokeStyle = "rgba(255,255,255,.07)"; ctx.lineWidth = 0.2;
  for (let x = H.x + 200; x < H.x + H.w; x += 6) { ctx.beginPath(); ctx.moveTo(x, H.y); ctx.lineTo(x, H.y + H.h); ctx.stroke(); }
  for (let y = H.y + 3; y < H.y + H.h; y += 6) { ctx.beginPath(); ctx.moveTo(H.x + 200, y); ctx.lineTo(H.x + H.w, y); ctx.stroke(); }
  ctx.restore();
  set("display", 7.6, 700, { stretch: "expanded", spacing: 0.55 });
  text(`QUALITY ASSURANCE · ${String(st.boardLevel || "Tier 2 — Daily management").toUpperCase()}`, H.x + 7, H.y + 8.6, { color: C.tealLight, max: 230 });
  set("display", 30, 800, { stretch: "semi-expanded", spacing: -0.1 });
  text("QA Tier 2 Daily Management", H.x + 7, H.y + 20.5, { color: "#ffffff", max: 240 });
  set("body", 10, 400);
  text(`${st.site || ""}${st.department ? ` · ${st.department}` : ""}`, H.x + 7, H.y + 26.6, { color: C.heroText, max: 240 });
  // chips
  let cx = H.x + 7;
  const chip = (label, value) => {
    set("body", 7.4, 400); const lw = ctx.measureText(label + " ").width;
    set("body", 7.4, 700); const vw = ctx.measureText(value).width;
    const w = lw + vw + 5;
    rr(cx, H.y + 29.2, w, 5, 2.5); ctx.fillStyle = "rgba(255,255,255,.10)"; ctx.fill(); ctx.strokeStyle = "rgba(255,255,255,.18)"; ctx.lineWidth = 0.2; ctx.stroke();
    set("body", 7.4, 400); text(label, cx + 2.5, H.y + 32.7, { color: "#cfdbee" });
    set("body", 7.4, 700); text(value, cx + 2.5 + lw, H.y + 32.7, { color: "#ffffff" });
    cx += w + 2.5;
  };
  chip("Month", fmtMonth(st.month));
  if (st.meetingTime) chip("Stand-up", `${st.meetingTime}${st.location ? ` · ${st.location}` : ""}`);
  if (st.owner) chip("Owner", `${st.owner}${st.ownerRole ? ` · ${st.ownerRole}` : ""}`);
  // the date block and the tier ladder
  const rx = H.x + H.w - 7;
  set("display", 7.6, 700, { stretch: "expanded", spacing: 0.55 });
  text("BOARD AS OF", rx, H.y + 8.6, { color: C.tealLight, align: "right" });
  const [wd, ...rest] = fmtLong(st.statusDate).split(" ");
  set("display", 23, 800, { stretch: "semi-expanded" });
  text(rest.join(" "), rx, H.y + 18.8, { color: "#ffffff", align: "right" });
  set("body", 10, 600);
  text(wd, rx, H.y + 24.6, { color: C.heroText, align: "right" });
  const tiers = [["Tier 1", "08:30 huddle"], ["Tier 2", "you are here"], ["Tier 3", "site management"]];
  const lw = 21, lx = rx - lw * 3;
  tiers.forEach(([t, sub], i) => {
    const x = lx + i * lw;
    rr(x, H.y + 27.6, lw - 0.6, 7, 1.6); ctx.fillStyle = i === 1 ? "rgba(25,179,171,.42)" : "rgba(255,255,255,.07)"; ctx.fill();
    set("display", 6.4, 700, { stretch: "semi-expanded" }); text(t, x + (lw - 0.6) / 2, H.y + 31, { color: "#ffffff", align: "center" });
    set("body", 5.2, 400); text(sub, x + (lw - 0.6) / 2, H.y + 33.6, { color: "#c4d2ea", align: "center" });
  });

  /* ── row 1: quality pulse + KPI tiles ── */
  const R1 = { y: 52, h: 66 };
  panel(10, R1.y, 66, R1.h, "Quality pulse");
  const ringC = { x: 43, y: R1.y + 31, r: 15 };
  ctx.lineCap = "round";
  ctx.lineWidth = 4.6; ctx.strokeStyle = C.track;
  ctx.beginPath(); ctx.arc(ringC.x, ringC.y, ringC.r, 0, Math.PI * 2); ctx.stroke();
  const score = pulse.score === "" || pulse.score == null ? null : +pulse.score;
  if (score != null) {
    ctx.strokeStyle = C[pulse.rag] || C.N;
    ctx.beginPath(); ctx.arc(ringC.x, ringC.y, ringC.r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0.005, Math.min(1, score))); ctx.stroke();
  }
  ctx.lineCap = "butt";
  set("display", 19, 800, { stretch: "semi-expanded" });
  text(score == null ? "—" : `${Math.round(score * 100)}%`, ringC.x, ringC.y + 0.4, { color: C.ink, align: "center", base: "middle" });
  const kpiN = pulse.g + pulse.a + pulse.r;
  set("body", 7, 700);
  const pl = `${pulse.g} of ${kpiN} KPIs on target`;
  const pw = ctx.measureText(pl).width + 4;
  pill(pl, ringC.x - pw / 2, R1.y + 51, pulse.rag, { pt: 7, h: 4.6 });
  set("body", 7, 600);
  const leg = [["G", pulse.g, "on target"], ["A", pulse.a, "watch"], ["R", pulse.r, "off target"]];
  let lgx = 15;
  for (const [k, n, l] of leg) {
    ctx.fillStyle = C[k]; ctx.beginPath(); ctx.arc(lgx + 1.1, R1.y + 61.2, 1.1, 0, Math.PI * 2); ctx.fill();
    set("body", 6.6, 700); const w1 = text(String(n), lgx + 3, R1.y + 62.2, { color: C.ink });
    set("body", 6.6, 400); const w2 = text(l, lgx + 4 + w1, R1.y + 62.2, { color: C.muted });
    lgx += w1 + w2 + 7.5;
  }
  const tiles = [...kpis.map((k) => ({ name: k.name, def: k.def, value: fmtKpi(k.actual, k.unit), target: `Target ${k.targetText}`, rag: k.rag, trend: k.trend, trendCode: k.trendCode })),
    { name: "Other points", def: other.name, value: other.actual || "—", target: "Manual", rag: other.rag, small: true }];
  const KG = { x: 81, w: 329, cols: 5, gap: 3.2 };
  const rows = Math.ceil(tiles.length / KG.cols);
  const tw = (KG.w - (KG.cols - 1) * KG.gap) / KG.cols, th = (R1.h - (rows - 1) * KG.gap) / rows;
  tiles.forEach((t, i) => {
    const x = KG.x + (i % KG.cols) * (tw + KG.gap), y = R1.y + Math.floor(i / KG.cols) * (th + KG.gap);
    const tint = t.rag === "N" ? C.paper : C[`${t.rag}bg`];
    const grad = ctx.createLinearGradient(0, y, 0, y + th);
    grad.addColorStop(0, tint); grad.addColorStop(0.75, C.paper);
    box(x, y, tw, th, { r: 3, fill: grad, stroke: t.rag === "N" ? C.line : C[t.rag], lw: t.rag === "N" ? 0.3 : 0.35 });
    set("display", 8.2, 700, { stretch: "semi-expanded" });
    text(t.name, x + 3.5, y + 6, { color: C.ink, max: tw - 7 });
    set("body", 6.4, 400);
    wrap(t.def, tw - 7, 2).forEach((ln, j) => text(ln, x + 3.5, y + 9.6 + j * 2.7, { color: C.muted }));
    const vColor = t.rag === "R" ? C.Rink : t.rag === "A" ? C.Aink : C.ink;
    set("display", t.small ? 12 : 21, 800, { stretch: "semi-expanded" });
    const vw = text(t.value, x + 3.5, y + th - 7.4, { color: vColor, max: tw - 12 });
    if (t.trend) { set("body", 8, 700); text(t.trend, x + 5 + vw, y + th - 7.6, { color: t.trendCode > 0 ? C.G : t.trendCode < 0 ? C.R : C.muted }); }
    set("body", 6.3, 400);
    text(t.target, x + 3.5, y + th - 2.6, { color: C.muted, max: tw - 26 });
    pill(E.RAG_TEXT[t.rag], x + tw - 3, y + th - 5.6, t.rag, { right: true, pt: 6 });
  });

  /* ── row 2: Q-calendar · today's focus · escalations ── */
  const R2 = { y: 123, h: 86 };
  panel(10, R2.y, 152, R2.h, `Q-calendar · ${fmtMonth(st.month)}`, `${critDays} critical day${critDays === 1 ? "" : "s"} · ${held} stand-up${held === 1 ? "" : "s"} held`);
  const first = E.weekday(cal[0].date);
  const weeks = Math.ceil((first + cal.length) / 7);
  const QG = { x: 14, y: R2.y + 13.5, w: 144, gap: 1.3 };
  const cw = (QG.w - 6 * QG.gap) / 7, chh = Math.min(10.2, (R2.h - 13.5 - 4 - 9 - (weeks - 1) * QG.gap) / weeks);
  set("display", 6.2, 700, { stretch: "semi-expanded", spacing: 0.3 });
  ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"].forEach((d, i) => text(d, QG.x + i * (cw + QG.gap) + cw / 2, QG.y - 1.2, { color: C.muted, align: "center" }));
  cal.forEach((d, i) => {
    const pos = first + i, col = pos % 7, row = Math.floor(pos / 7);
    const x = QG.x + col * (cw + QG.gap), y = QG.y + 1 + row * (chh + QG.gap);
    const fill = d.weekend && !d.code ? C.week : d.future ? C.paper : C[`day${d.code}`] || C.paper;
    box(x, y, cw, chh, { r: 1.6, fill, stroke: d.today ? C.navy : d.future ? C.line : null, lw: d.today ? 0.7 : 0.25 });
    set("display", 7, 700, { stretch: "semi-expanded" });
    text(String(d.day), x + 1.8, y + 3.6, { color: d.weekend ? C.muted : C.ink });
    if (!d.weekend && !d.future) d.procs.forEach((p, j) => { ctx.fillStyle = C[RAG_OF[p.code]] || C.N; ctx.beginPath(); ctx.arc(x + 2.3 + j * 2.5, y + chh - 2, 0.85, 0, Math.PI * 2); ctx.fill(); });
    if (d.log.p1 && !d.weekend) { ctx.fillStyle = C.navy; ctx.beginPath(); ctx.arc(x + cw - 2, y + 2.3, 0.7, 0, Math.PI * 2); ctx.fill(); }
  });
  const ly = R2.y + R2.h - 4.2;
  let lx2 = 14;
  for (const [fill, label] of [[C.day1, "No issue"], [C.day2, "In progress"], [C.day3, "Critical"], [C.week, "Weekend"]]) {
    box(lx2, ly - 2.4, 3, 3, { r: 0.6, fill, stroke: null });
    set("body", 6.3, 400); lx2 += 4.2 + text(label, lx2 + 4, ly, { color: C.muted }) + 3.5;
  }
  set("body", 6.3, 400);
  text("Dots: Deviation · CAPA · Change control · Inspection · ● navy = priority logged", lx2, ly, { color: C.muted, max: 158 - lx2 });

  // today's focus
  const F = { x: 166, w: 118 };
  panel(F.x, R2.y, F.w, R2.h, "Today's focus", fmtLong(st.statusDate));
  const prios = [log.p1, log.p2, log.p3].filter(Boolean);
  let fy = R2.y + 13;
  if (!prios.length) { set("body", 8, 400, { italic: true }); text("No priorities logged for this day yet", F.x + 4, fy + 2, { color: C.muted }); fy += 8; }
  prios.forEach((p, i) => {
    ctx.fillStyle = C.navy; ctx.beginPath(); ctx.arc(F.x + 6.5, fy + 1.4, 2.6, 0, Math.PI * 2); ctx.fill();
    set("display", 7.4, 800); text(String(i + 1), F.x + 6.5, fy + 1.5, { color: "#ffffff", align: "center", base: "middle" });
    set("body", 8.4, 600);
    const lines = wrap(p, F.w - 15, 2);
    lines.forEach((ln, j) => text(ln, F.x + 11, fy + 2.6 + j * 3.6, { color: C.ink }));
    fy += 4 + lines.length * 3.6;
  });
  // stand-up line + tier 1 headline + message
  fy = Math.max(fy + 1, R2.y + 44);
  ctx.strokeStyle = C.line; ctx.lineWidth = 0.25; ctx.beginPath(); ctx.moveTo(F.x + 4, fy); ctx.lineTo(F.x + F.w - 4, fy); ctx.stroke();
  const stat = (label, value, x, y, rag = null) => {
    set("display", 6, 700, { stretch: "semi-expanded", spacing: 0.3 }); text(label.toUpperCase(), x, y, { color: C.muted });
    set("display", 13, 800, { stretch: "semi-expanded" }); text(value, x, y + 5.6, { color: rag ? C[`${rag}ink`] : C.ink });
  };
  const wdays = elapsed.filter((d) => !d.weekend).length;
  stat("Stand-ups held", `${held} / ${wdays}`, F.x + 4, fy + 5);
  stat("Avg attendees", att.length ? fmtNum(att.reduce((a, b) => a + b, 0) / att.length) : "—", F.x + 34, fy + 5);
  stat("Today", log.held === "Yes" ? "Held" : log.held === "No" ? "Not held" : "—", F.x + 64, fy + 5, log.held === "Yes" ? "G" : log.held === "No" ? "R" : null);
  stat("Critical days", String(critDays), F.x + 90, fy + 5, critDays ? "R" : null);
  fy += 14;
  if (!hasTier("t1") && (log.t1held || log.t1red || log.t1safety)) {
    set("body", 7.2, 700); const w0 = text("Tier 1 huddle:", F.x + 4, fy + 2, { color: C.ink });
    set("body", 7.2, 400);
    text(`${log.t1held === "Yes" ? "held" : log.t1held === "No" ? "not held" : "—"} · red letters ${log.t1red || "none"}${log.t1safety ? ` · safety: ${log.t1safety}` : ""}`, F.x + 5.5 + w0, fy + 2, { color: C.ink2, max: F.w - 10 - w0 });
    fy += 5.5;
  }
  if (st.message) {
    box(F.x + 4, fy, F.w - 8, R2.y + R2.h - fy - 4, { r: 2, fill: C.panel, stroke: null });
    ctx.fillStyle = C.teal; ctx.fillRect(F.x + 4, fy, 0.8, R2.y + R2.h - fy - 4);
    set("body", 8, 400, { italic: true });
    wrap(`“${st.message}”`, F.w - 16, Math.max(1, Math.floor((R2.y + R2.h - fy - 7) / 3.6))).forEach((ln, j) => text(ln, F.x + 8, fy + 5 + j * 3.6, { color: C.ink2 }));
  }

  // escalations
  const X = { x: 288, w: 122 };
  panel(X.x, R2.y, X.w, R2.h, "Escalations");
  const listRows = (items, x, y, w, n, { empty = "Nothing open" } = {}) => {
    if (!items.length) { set("body", 7.4, 400, { italic: true }); text(empty, x, y + 3, { color: C.muted }); return y + 6; }
    items.slice(0, n).forEach(({ id, desc, label, rag }, i) => {
      const yy = y + i * 5.6;
      if (i % 2 === 0) box(x - 1.5, yy - 0.4, w + 3, 5.2, { r: 1.2, fill: C.panel, stroke: null });
      set("mono", 6.4, 500); const iw = text(fit(id, 26), x, yy + 3.3, { color: C.teal });
      const pw2 = pill(label, x + w, yy + 0.25, rag, { right: true, pt: 5.8, h: 3.7 });
      set("body", 7.2, 400); text(desc, x + Math.max(iw, 22) + 2, yy + 3.3, { color: C.ink, max: w - Math.max(iw, 22) - pw2 - 4 });
    });
    return y + Math.min(n, items.length) * 5.6 + 1;
  };
  const toRows = (arr) => arr.map(({ r, c }) => { const [label, rag] = dueLabel(c); return { id: r.id, desc: r.desc || r.title || r.product || "", label, rag }; });
  set("display", 6.4, 700, { stretch: "semi-expanded", spacing: 0.3 });
  text("⇪ ESCALATED TO TIER 3", X.x + 4, R2.y + 13.4, { color: C.ink2 });
  let ey = listRows(toRows(E.t2Top(s, "esc", 6, comp)), X.x + 4, R2.y + 15.2, X.w - 8, 6, { empty: "No open escalation to Tier 3" });
  set("display", 6.4, 700, { stretch: "semi-expanded", spacing: 0.3 });
  text("⇧ FROM TIER 1", X.x + 4, ey + 4.6, { color: C.ink2 });
  let t1rows;
  if (hasTier("t1")) {
    const t1 = store.t1, ctx1 = E.t1Context(t1, t1.setup.selDate, "All team");
    t1rows = E.t1OpenActions(ctx1).escalated.map((a) => ({ id: a.id, desc: `${a.desc}${a.officer ? ` (${a.officer})` : ""}`, label: E.dueLabel(a.due, t1.setup.selDate), rag: a.due < t1.setup.selDate ? "R" : "A" }));
  } else t1rows = toRows(E.t2Top(s, "t1e", 6, comp));
  listRows(t1rows, X.x + 4, ey + 6.4, X.w - 8, Math.max(1, Math.floor((R2.y + R2.h - ey - 9) / 5.6)), { empty: "No open escalation from Tier 1" });

  /* ── row 3: the four process registers ── */
  const R3 = { y: 214, h: 50 };
  const regs = ["dev", "capa", "cc", "insp"], rw = (400 - 3 * 4) / 4;
  regs.forEach((reg, i) => {
    const x = 10 + i * (rw + 4), sc = T2_REGISTERS[reg];
    const open = comp[reg].filter((c) => c.open).length, od = comp[reg].filter((c) => c.live === "Overdue").length;
    panel(x, R3.y, rw, R3.h, `${sc.no} ${sc.title}`, `${open} open${od ? ` · ${od} overdue` : ""}`);
    if (od) pill(`${od} overdue`, x + rw - 4, R3.y + 3.3, "R", { right: true, pt: 6 });
    listRows(toRows(E.t2Top(s, reg, 6, comp)), x + 4, R3.y + 10, rw - 8, 6, { empty: "Nothing open" });
  });

  /* ── row 4: monthly summary strip ── */
  const R4 = { y: 268, h: 18 };
  const sregs = ["dev", "capa", "cc", "insp", "rel", "doc", "load", "apqr", "trn", "esc"];
  const sw = (400 - 9 * 2.4) / sregs.length;
  sregs.forEach((reg, i) => {
    const x = 10 + i * (sw + 2.4), sc = T2_REGISTERS[reg], v = sum[reg];
    const k = sc.kpi != null ? kpis[sc.kpi] : null;
    box(x, R4.y, sw, R4.h, { r: 2.4, fill: C.panel, stroke: C.line, lw: 0.25 });
    set("mono", 6, 500); text(sc.no, x + 2.6, R4.y + 4.6, { color: C.teal });
    if (k) { ctx.fillStyle = C[k.rag]; ctx.beginPath(); ctx.arc(x + sw - 3.2, R4.y + 3.6, 1.3, 0, Math.PI * 2); ctx.fill(); }
    set("display", 6.8, 700, { stretch: "semi-expanded" }); text(sc.short, x + 2.6, R4.y + 8.6, { color: C.ink, max: sw - 5 });
    set("display", 12, 800, { stretch: "semi-expanded" }); const bw = text(String(v.total), x + 2.6, R4.y + 15.4, { color: C.ink });
    set("body", 6.2, 400); text(`+${v.new} ${v.newLabel || "new"}`, x + 4 + bw, R4.y + 15.2, { color: C.muted, max: sw - bw - 7 });
  });

  /* ── footer ── */
  const fl = activeCount(filters) ? ` · Filters: ${describe(filters).join(" · ")}` : "";
  const now = new Date();
  const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  set("body", 6.4, 400);
  text(`${st.site || ""} · QA Tier 2 Daily Management · board as of ${fmtLong(st.statusDate)} · exported ${stamp} · A3 landscape, ${dpi} dpi${fl}`, 10, 291.6, { color: C.muted, max: 300 });
  text("The eQMS is the record of truth — this board mirrors it.", 410, 291.6, { color: C.muted, align: "right" });
  return canvas;
}

/* ── files ─────────────────────────────────────────────── */

const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (bytes) => { let c = 0xffffffff; for (const b of bytes) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

/** Tag a PNG with its print resolution (pHYs chunk), so it prints at A3. */
async function withDpi(blob, dpi) {
  const buf = new Uint8Array(await blob.arrayBuffer());
  const ppm = Math.round(dpi / 0.0254);
  const chunk = new Uint8Array(21), dv = new DataView(chunk.buffer);
  dv.setUint32(0, 9); chunk.set([0x70, 0x48, 0x59, 0x73], 4); dv.setUint32(8, ppm); dv.setUint32(12, ppm); chunk[16] = 1;
  dv.setUint32(17, crc32(chunk.subarray(4, 17)));
  const at = 33; // after the signature (8) and IHDR (25)
  return new Blob([buf.subarray(0, at), chunk, buf.subarray(at)], { type: "image/png" });
}

const fileBase = () => {
  const st = store.t2.setup;
  return `QA_Tier2_Daily_Board_A3_${slug(String(st.site || "site").split("—")[0]).replace(/-/g, "_")}_${st.statusDate}`;
};

export async function a3PNG(canvas, dpi) {
  const blob = await new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("export failed"))), "image/png"));
  return withDpi(blob, dpi);
}

export async function a3PDF(canvas) {
  const lib = await loadScript(JSPDF_URL, "jspdf");
  const st = store.t2.setup;
  const doc = new lib.jsPDF({ orientation: "landscape", unit: "mm", format: "a3", compress: true });
  doc.setProperties({ title: `QA Tier 2 Daily Management — ${fmtLong(st.statusDate)}`, subject: "Tier 2 daily dashboard, A3", author: st.owner || "", creator: "QA Tier Boards" });
  doc.addImage(canvas.toDataURL("image/jpeg", 0.95), "JPEG", 0, 0, A3.w, A3.h, undefined, "FAST");
  return doc.output("blob");
}

/** The export dialog: a preview of the A3 board, then PDF and/or PNG. */
export async function openA3Export() {
  const F = pageFilters("board");
  const { el, close } = modal(`<div class="row"><div><div class="eyebrow">Print & present</div><h2>A3 daily board</h2></div><span class="spacer"></span><button class="btn ghost" data-x aria-label="Close">✕</button></div>
    <p class="muted" style="margin:0">Today's Tier 2 dashboard on one A3 landscape page (420 × 297 mm) — KPIs and Quality Pulse, Q-calendar, today's priorities, escalations, the four process registers and the monthly summary.${activeCount(F) ? ` <b>Board filters apply:</b> ${esc(describe(F).join(" · "))}.` : ""}</p>
    <div class="a3-preview" data-a3prev><div class="empty">Drawing the board…</div></div>
    <div class="row" style="justify-content:space-between">
      <label class="fctl" style="min-width:200px"><span>Resolution</span><select data-a3dpi><option value="300" selected>300 dpi — print (4961 × 3508 px)</option><option value="200">200 dpi — screen & e-mail</option><option value="400">400 dpi — fine print (6614 × 4677 px)</option></select></label>
      <div class="row"><button class="btn" data-a3png disabled>⤓ PNG</button><button class="btn primary" data-a3pdf disabled>⤓ A3 PDF</button></div>
    </div>
    <p class="muted" style="margin:0;font-size:12.5px">Print at 100 % ("actual size") on A3 landscape. The PDF holds the 300 dpi image on an A3 page; the PNG carries its 300 dpi resolution for print shops.</p>`);
  el.querySelector("[data-x]").onclick = close;
  let canvas = null, dpi = 300;
  const btns = () => el.querySelectorAll("[data-a3png], [data-a3pdf]");
  const draw = async () => {
    btns().forEach((b) => { b.disabled = true; });
    el.querySelector("[data-a3prev]").innerHTML = `<div class="empty">Drawing the board at ${dpi} dpi…</div>`;
    try {
      canvas = await drawA3Board({ dpi, filters: F });
      const prev = document.createElement("canvas");
      prev.width = 1400; prev.height = Math.round(1400 * A3.h / A3.w);
      prev.getContext("2d").drawImage(canvas, 0, 0, prev.width, prev.height);
      prev.setAttribute("role", "img"); prev.setAttribute("aria-label", "Preview of the A3 board");
      el.querySelector("[data-a3prev]").replaceChildren(prev);
      btns().forEach((b) => { b.disabled = false; });
    } catch (e) { el.querySelector("[data-a3prev]").innerHTML = `<div class="callout bad">The board could not be drawn: ${esc(e.message)}</div>`; }
  };
  el.querySelector("[data-a3dpi]").onchange = (e) => { dpi = +e.target.value; draw(); };
  const busy = async (btn, fn) => { const t = btn.textContent; btn.disabled = true; btn.textContent = "Saving…"; try { await fn(); } catch (e) { toast(e.message || "Export failed"); } finally { btn.disabled = false; btn.textContent = t; } };
  el.querySelector("[data-a3png]").onclick = (e) => busy(e.currentTarget, async () => saveFile(`${fileBase()}.png`, await a3PNG(canvas, dpi)));
  el.querySelector("[data-a3pdf]").onclick = (e) => busy(e.currentTarget, async () => saveFile(`${fileBase()}.pdf`, await a3PDF(canvas)));
  await draw();
}
