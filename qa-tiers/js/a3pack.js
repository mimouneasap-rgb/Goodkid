// A3 exports of Tier 2: one dialog for
//  1. the A3 board poster (one landscape page, poster.js),
//  2. the whole dashboard page as it looks in the app, 300 dpi on A3 pages
//     (portrait, landscape or one scaled sheet) — PDF or PNG pages in a ZIP,
//  3. the complete A3 data report: every Tier 2 page in vector tables
//     (dashboard, Daily Log, every register with its ƒx columns, training,
//     QA load & absence, KPI trend, overdue by owner).

import { store } from "./store.js";
import * as E from "./engine.js";
import { T2_REGISTERS, T2_ORDER, AUDIT_GROUP } from "./schema.js";
import { fxSpec } from "./registers.js";
import { renderBoard, newCounts } from "./views-t2.js";
import { monthlyReport, missingTraining } from "./training.js";
import { esc, fmtDate, fmtLong, fmtMonth, fmtKpi, pct, modal, toast } from "./ui.js";
import { saveFile, loadScript, loadZip, slug } from "./export.js";
import { JSPDF_URL } from "./poster.js";

const AUTOTABLE_URL = "https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js";
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const has = (v) => v !== "" && v != null;
const siteName = (st) => String(st.site || "Site").split("—")[0].trim();
const base = (kind) => { const st = store.t2.setup; return `QA_Tier2_${kind}_${slug(siteName(st)).replace(/-/g, "_")}_${st.statusDate}`; };

async function jsPDFLib() {
  const lib = await loadScript(JSPDF_URL, "jspdf");
  if (!lib.jsPDF.API.autoTable) {
    await new Promise((res, rej) => {
      const sc = document.createElement("script");
      sc.src = AUTOTABLE_URL;
      sc.onload = res; sc.onerror = () => rej(new Error("The PDF table library could not be loaded — check the connection."));
      document.head.append(sc);
    });
  }
  if (!lib.jsPDF.API.autoTable) throw new Error("The PDF table library is missing");
  return lib;
}

/* ═════════ 2 · the whole dashboard page ═════════ */

const PAGE = { portrait: { w: 297, h: 420 }, landscape: { w: 420, h: 297 } };
const M = 10, HEAD = 9, FOOT = 7; // mm: margin, header band, footer
let fontCSS = null;

/** The web fonts as data URLs (latin subsets), so the picture uses the app's own fonts. */
async function embeddedFonts() {
  if (fontCSS != null) return fontCSS;
  fontCSS = "";
  try {
    const link = [...document.querySelectorAll('link[rel="stylesheet"]')].find((l) => /fonts\.googleapis\.com/.test(l.href));
    if (!link) return fontCSS;
    const css = await (await fetch(link.href)).text();
    const blocks = css.match(/@font-face\s*{[^}]*}/g) || [];
    const keep = blocks.filter((b) => /unicode-range:[^;]*U\+0000-00FF/i.test(b) || /unicode-range:[^;]*U\+0100-02/i.test(b));
    const out = [];
    for (const b of keep) {
      const url = (b.match(/url\(([^)]+)\)/) || [])[1]?.replace(/["']/g, "");
      if (!url) continue;
      const buf = await (await fetch(url)).arrayBuffer();
      let bin = ""; const bytes = new Uint8Array(buf);
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      out.push(b.replace(/url\([^)]+\)/, `url(data:font/woff2;base64,${btoa(bin)})`));
    }
    fontCSS = out.join("\n");
  } catch { fontCSS = ""; } // fallback fonts: the picture is still complete
  return fontCSS;
}
function pageCSS() {
  let css = "";
  for (const sh of document.styleSheets) {
    try { for (const r of sh.cssRules) css += `${r.cssText}\n`; } catch { /* a cross-origin sheet (the font CSS): embedded separately */ }
  }
  return css;
}

/** Draw the dashboard off-screen at a fixed width, ready to be pictured. */
async function boardHost(width) {
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText = `position:absolute;left:-40000px;top:0;width:${width}px;pointer-events:none;background:var(--paper)`;
  host.innerHTML = `<div class="shell" style="display:block;min-height:0"><main class="main" style="width:${width}px;box-sizing:border-box;padding:26px 30px 30px"></main></div>`;
  document.body.append(host);
  renderBoard(host.querySelector("main"));
  const main = host.querySelector("main"); // the view swaps in a fresh container
  await new Promise((r) => setTimeout(r, 80));
  // the picture shows the data, not the controls
  main.querySelectorAll(".btn, [data-fbar], .backbar, [data-noexport], .filter-bar").forEach((n) => n.remove());
  main.querySelectorAll("input, select").forEach((n) => {
    const span = document.createElement("b");
    span.textContent = n.tagName === "SELECT" ? n.selectedOptions[0]?.textContent || "" : n.type === "date" ? fmtDate(n.value) : n.value;
    n.replaceWith(span);
  });
  await new Promise((r) => setTimeout(r, 30));
  return { host, main };
}

/** The dashboard pages: each part of the board on its own A3 sheet. */
const GROUPS = [
  ["Global board — Quality Pulse and KPIs", (el) => el.matches(".hero, .split-pulse")],
  ["Q-calendar, priorities, escalations and process registers", (el) => el.matches(".split-wide, .grid.g4")],
  ["Batches, daily and monthly — batch pipeline, new records, monthly summary", (el) => el.matches(".b-panel, .nw-panel, .sum-grid")],
];
function groupsOf(main) {
  const kids = [...main.children];
  const at = kids.map((el) => GROUPS.findIndex(([, m]) => m(el)));
  // a heading or note belongs with the panel after it; the last notes with the panel before
  for (let i = 0; i < at.length; i++) if (at[i] < 0) { const next = at.slice(i + 1).find((g) => g >= 0); at[i] = next ?? [...at.slice(0, i)].reverse().find((g) => g >= 0) ?? 0; }
  return GROUPS.map(([title], g) => ({ title, els: kids.filter((_, i) => at[i] === g) })).filter((x) => x.els.length);
}

/** The dashboard as A3 page canvases. mode: "auto" (best orientation per page) | "portrait" | "landscape" | "fit" (all on one sheet). */
export async function dashboardPages({ mode = "auto", dpi = 300, onStep = () => {} } = {}) {
  const W = 1280;
  onStep("Drawing the dashboard…");
  const { host, main } = await boardHost(W);
  try {
    onStep("Embedding the fonts…");
    const css = pageCSS() + (await embeddedFonts());
    const bodyCs = getComputedStyle(document.body);
    const px = (mm) => Math.round((mm / 25.4) * dpi);
    const st = store.t2.setup;
    const kids = [...main.children];
    const parts = mode === "fit" ? [{ title: "The whole dashboard", els: kids }] : groupsOf(main);
    // picture each part on its own: the other parts are hidden while it is measured and serialised
    const shots = parts.map((part) => {
      kids.forEach((el) => { el.style.display = part.els.includes(el) ? "" : "none"; });
      const first = part.els[0]; const mt = first.style.marginTop; first.style.marginTop = "0";
      const H = Math.ceil(main.getBoundingClientRect().height) + 12;
      const html = new XMLSerializer().serializeToString(host.querySelector(".shell"));
      first.style.marginTop = mt;
      return { ...part, H, html };
    });
    kids.forEach((el) => { el.style.display = ""; });
    const canvases = [], pages = [];
    for (let n = 0; n < shots.length; n++) {
      const { title, H, html } = shots[n];
      onStep(`Rendering page ${n + 1} of ${shots.length} at ${dpi} dpi…`);
      const fitK = (pg) => Math.min((pg.w - 2 * M) / W, (pg.h - 2 * M - HEAD - FOOT - 4) / H);
      const page = mode === "landscape" ? PAGE.landscape : mode === "portrait" ? PAGE.portrait : fitK(PAGE.landscape) >= fitK(PAGE.portrait) ? PAGE.landscape : PAGE.portrait;
      const k = fitK(page); // mm per css px: the whole part fits on the sheet
      const vw = Math.max(window.innerWidth, W);
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" data-theme="light" width="${vw}" height="${H}"><style>${css.replace(/<\/?style/gi, "")}</style><foreignObject x="0" y="0" width="${vw}" height="${H}"><div xmlns="http://www.w3.org/1999/xhtml" style="width:${W}px;font-family:${bodyCs.fontFamily.replace(/"/g, "'")};font-size:${bodyCs.fontSize};line-height:${bodyCs.lineHeight};color:#0e1a2b;background:#ffffff">${html}</div></foreignObject></svg>`;
      const img = new Image();
      const done = new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error("The page could not be rendered")); });
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
      await done;
      const c = document.createElement("canvas");
      c.width = px(page.w); c.height = px(page.h);
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, c.width, c.height);
      const mm = c.width / page.w;
      // header band: the part's title, the board and the date
      ctx.fillStyle = "#0f2340"; ctx.fillRect(M * mm, M * mm, (page.w - 2 * M) * mm, (HEAD - 2) * mm);
      ctx.fillStyle = "#7fe3dc"; ctx.font = `800 ${3.2 * mm}px "Archivo", Arial, sans-serif`; ctx.textBaseline = "middle";
      const lead = `${n + 1} / ${shots.length}`;
      ctx.fillText(lead, (M + 3) * mm, (M + (HEAD - 2) / 2) * mm);
      const lw = ctx.measureText(lead).width;
      ctx.fillStyle = "#ffffff"; ctx.font = `700 ${3.2 * mm}px "Archivo", Arial, sans-serif`;
      ctx.fillText(`${title}`, (M + 3) * mm + lw + 3 * mm, (M + (HEAD - 2) / 2) * mm);
      ctx.textAlign = "right"; ctx.font = `600 ${2.8 * mm}px "Source Sans 3", Arial, sans-serif`;
      ctx.fillText(`QA Tier 2 · ${siteName(st)} · as of ${fmtLong(st.statusDate)}`, (page.w - M - 3) * mm, (M + (HEAD - 2) / 2) * mm);
      ctx.textAlign = "left";
      const dw = W * k, room = page.h - 2 * M - HEAD - FOOT - 4 - H * k;
      const dx = (M + ((page.w - 2 * M) - dw) / 2) * mm, dy = (M + HEAD + 2 + Math.max(0, room / 2)) * mm; // centred on the sheet
      ctx.drawImage(img, 0, 0, W, H, dx, dy, dw * mm, H * k * mm);
      ctx.fillStyle = "#5e6a7e"; ctx.font = `400 ${2.4 * mm}px "Source Sans 3", Arial, sans-serif`;
      ctx.fillText(`${st.site || ""} · printed ${fmtDate(new Date().toISOString().slice(0, 10))} · A3 ${page.w > page.h ? "landscape" : "portrait"}, ${dpi} dpi`, M * mm, (page.h - M - 1.5) * mm);
      ctx.textAlign = "right"; ctx.fillText(`Page ${n + 1} / ${shots.length}`, (page.w - M) * mm, (page.h - M - 1.5) * mm); ctx.textAlign = "left";
      canvases.push(c); pages.push(page);
    }
    return { canvases, pages, mode, dpi };
  } finally { host.remove(); }
}

async function dashboardPDF(res) {
  const lib = await loadScript(JSPDF_URL, "jspdf");
  const st = store.t2.setup;
  const ori = (pg) => (pg.w > pg.h ? "landscape" : "portrait");
  const doc = new lib.jsPDF({ orientation: ori(res.pages[0]), unit: "mm", format: "a3", compress: true });
  doc.setProperties({ title: `QA Tier 2 dashboard — ${fmtLong(st.statusDate)}`, subject: "Tier 2 dashboard page, A3", author: st.owner || "", creator: "QA Tier Boards" });
  res.canvases.forEach((c, i) => { const pg = res.pages[i]; if (i) doc.addPage("a3", ori(pg)); doc.addImage(c.toDataURL("image/jpeg", 0.94), "JPEG", 0, 0, pg.w, pg.h, undefined, "FAST"); });
  return doc.output("blob");
}
async function dashboardZip(res) {
  const Z = await loadZip();
  const zip = new Z();
  for (let i = 0; i < res.canvases.length; i++) {
    const b = await new Promise((r) => res.canvases[i].toBlob(r, "image/png"));
    zip.file(`${base("Dashboard_A3")}_p${i + 1}.png`, b);
  }
  return zip.generateAsync({ type: "blob" });
}

/* ═════════ 3 · the complete A3 data report ═════════ */

/** jsPDF's standard fonts speak Windows-1252: keep the text inside it. */
const SAFE = { "✓": "Yes", "✔": "Yes", "✕": "x", "✗": "x", "→": "->", "←": "<-", "↔": "<->", "≤": "<=", "≥": ">=", "≠": "!=", "×": "x", "−": "-", "⚠": "!", "▲": "up", "▼": "down", "▬": "=", "◌": "", "🔗": "", "★": "*", "½": "1/2", "·": "·", "ƒ": "f", "⇪": "", "⇧": "", "▶": ">", "…": "...", " ": " " };
const WIN = new Set([..."€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ"]);
const pdfSafe = (v) => String(v ?? "").replace(/[^\x00-\xff]/g, (ch) => (SAFE[ch] ?? (WIN.has(ch) ? ch : ""))).replace(/\s+/g, " ").trim();
const strip = (html) => { const d = document.createElement("div"); d.innerHTML = String(html ?? ""); return d.textContent.replace(/\s+/g, " ").trim(); };
const fval = (f, v) => (!has(v) ? "" : f.type === "date" ? fmtDate(v) : f.type === "pct" ? `${Math.round(+v * 100)} %` : String(v));

export const REPORT_SECTIONS = [
  ["dash", "Dashboard — KPIs, Quality Pulse, batch pipeline, monthly summary, priorities"],
  ["daily", "Daily Log — Q-calendar of the month"],
  ["regs", "Every register — all records, all fields and ƒx columns"],
  ["audits", "Audits — programme, findings, audit CAPA (tracking only)"],
  ["training", "Training — monthly department report, missing training per person"],
  ["owner", "Overdue by owner"],
  ["trend", "KPI trend — the year month by month"],
];

export async function dataReport({ sections = REPORT_SECTIONS.map((x) => x[0]), closed = true, onStep = () => {} } = {}) {
  onStep("Loading the PDF library…");
  const lib = await jsPDFLib();
  const s = store.t2, st = s.setup;
  const comp = E.t2Computed(s);
  const { kpis, other, pulse } = E.t2Kpis(s, comp);
  const doc = new lib.jsPDF({ orientation: "landscape", unit: "mm", format: "a3", compress: true });
  doc.setProperties({ title: `QA Tier 2 — complete data report — ${fmtLong(st.statusDate)}`, subject: "Tier 2 data report, A3", author: st.owner || "", creator: "QA Tier Boards" });
  const W = 420, Hh = 297, L = 12;
  const NAVY = [15, 35, 64], TEAL = [12, 143, 138], INK = [14, 26, 43], MUTED = [94, 106, 126], LINE = [213, 220, 229];
  const RAG = { G: [12, 163, 12], A: [233, 161, 0], R: [208, 59, 59], N: [163, 173, 187] };
  const RAGBG = { G: [220, 242, 230], A: [253, 241, 207], R: [251, 223, 223], N: [236, 238, 242] };
  const toc = [];
  let y = 0;
  const T = (t) => pdfSafe(t);
  const newPage = () => { doc.addPage("a3", "landscape"); y = 24; };
  const ensure = (need) => { if (y + need > Hh - 16) newPage(); };
  const h1 = (title, sub = "") => {
    newPage();
    toc.push([title, doc.getNumberOfPages()]);
    doc.setFillColor(...NAVY); doc.roundedRect(L, 14, W - 2 * L, 16, 2, 2, "F");
    doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(17); doc.text(T(title), L + 6, 24.5);
    if (sub) { doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(184, 199, 224); doc.text(T(sub), W - L - 6, 24.5, { align: "right" }); }
    y = 38;
  };
  const h2 = (title, sub = "") => {
    ensure(26);
    doc.setDrawColor(...TEAL); doc.setLineWidth(0.8); doc.line(L, y, L + 8, y);
    doc.setTextColor(...INK); doc.setFont("helvetica", "bold"); doc.setFontSize(12.5); doc.text(T(title), L, y + 6);
    if (sub) { doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(...MUTED); doc.text(doc.splitTextToSize(T(sub), W - 2 * L), L, y + 11.5); y += 5 * Math.min(3, doc.splitTextToSize(T(sub), W - 2 * L).length); }
    y += 12;
  };
  const para = (t, size = 9.5) => {
    doc.setFont("helvetica", "normal"); doc.setFontSize(size); doc.setTextColor(...INK);
    const lines = doc.splitTextToSize(T(t), W - 2 * L);
    ensure(lines.length * size * 0.42 + 4);
    doc.text(lines, L, y); y += lines.length * size * 0.42 + 4;
  };
  const stats = (items) => {
    ensure(20);
    const w = Math.min(62, (W - 2 * L - (items.length - 1) * 4) / items.length);
    items.forEach(([label, value, rag], i) => {
      const x = L + i * (w + 4);
      doc.setFillColor(...(rag ? RAGBG[rag] : [245, 247, 250])); doc.setDrawColor(...(rag ? RAG[rag] : LINE)); doc.setLineWidth(0.3);
      doc.roundedRect(x, y, w, 15, 1.6, 1.6, "FD");
      doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(...MUTED); doc.text(T(label).toUpperCase(), x + 3, y + 5);
      doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor(...INK); doc.text(T(value), x + 3, y + 12);
    });
    y += 20;
  };
  const table = (head, body, opts = {}) => {
    if (!body.length) { para(opts.empty || "No record.", 9); return; }
    const many = head.length > 14;
    doc.autoTable({
      startY: y, head: [head.map(T)], body: body.map((r) => r.map((v) => (typeof v === "object" && v && "content" in v ? { ...v, content: T(v.content) } : T(v)))),
      margin: { left: L, right: L, top: 24, bottom: 16 }, theme: "grid",
      styles: { font: "helvetica", fontSize: opts.fontSize || (many ? 6.4 : 7.6), cellPadding: many ? 1.1 : 1.5, textColor: INK, lineColor: LINE, lineWidth: 0.15, overflow: "linebreak", valign: "top" },
      headStyles: { fillColor: [230, 236, 243], textColor: INK, fontStyle: "bold", lineColor: LINE },
      alternateRowStyles: { fillColor: [250, 251, 253] },
      columnStyles: opts.columnStyles || {},
      didParseCell: opts.didParseCell,
      rowPageBreak: "avoid",
    });
    y = doc.lastAutoTable.finalY + 8;
  };
  const ragCell = (data, col) => {
    if (data.section !== "body" || data.column.index !== col) return;
    const v = String(data.cell.raw || "");
    const k = /^(On target|Green|G)$/i.test(v) ? "G" : /^(Watch|Amber|A)$/i.test(v) ? "A" : /^(Off target|Red|R)$/i.test(v) ? "R" : null;
    if (k) { data.cell.styles.fillColor = RAGBG[k]; data.cell.styles.textColor = RAG[k]; data.cell.styles.fontStyle = "bold"; }
  };
  const liveCell = (col) => (data) => {
    if (data.section !== "body" || data.column.index !== col) return;
    const v = String(data.cell.raw || "");
    if (/overdue|missing|overloaded/i.test(v)) { data.cell.styles.textColor = RAG.R; data.cell.styles.fontStyle = "bold"; }
  };

  /* cover */
  const cover = () => {
    doc.setFillColor(...NAVY); doc.rect(0, 0, W, 120, "F");
    doc.setFillColor(...TEAL); doc.rect(0, 120, W, 3, "F");
    doc.setTextColor(127, 227, 220); doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.text("QA TIER 2 · DAILY MANAGEMENT", L + 8, 40);
    doc.setTextColor(255, 255, 255); doc.setFontSize(34); doc.text("Complete data report", L + 8, 62);
    doc.setFont("helvetica", "normal"); doc.setFontSize(15); doc.setTextColor(184, 199, 224);
    doc.text(T(`${st.site || ""}`), L + 8, 76);
    doc.text(T(`${fmtMonth(st.month)} · data as of ${fmtLong(st.statusDate)}`), L + 8, 86);
    doc.setFontSize(11); doc.text(T(`Board owner: ${st.owner || "—"}${st.ownerRole ? ` · ${st.ownerRole}` : ""} · stand-up ${st.meetingTime || ""} · ${st.location || ""}`), L + 8, 100);
    y = 136;
    doc.setTextColor(...INK); doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.text("Headline", L + 8, y); y += 8;
    const tiles = [["Quality Pulse", pulse.score === "" ? "—" : pct(pulse.score), pulse.rag], ["KPIs on target", `${pulse.g} / ${pulse.g + pulse.a + pulse.r}`, null], ...kpis.slice(0, 4).map((k) => [k.name, fmtKpi(k.actual, k.unit), k.rag])];
    const keep = y; y = keep; stats(tiles);
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(...MUTED);
    doc.text(T("A3 landscape · print at 100 % (actual size). Generated from the live Tier 2 board — every figure is calculated by the app from its registers."), L + 8, Hh - 14);
  };
  cover();

  /* dashboard */
  if (sections.includes("dash")) {
    h1("Dashboard", `${fmtMonth(st.month)} · as of ${fmtDate(st.statusDate)}`);
    h2("KPIs", `Quality Pulse ${pulse.score === "" ? "—" : pct(pulse.score)} = (G + 1/2 A) / (G + A + R) · ${pulse.g} green · ${pulse.a} amber · ${pulse.r} red`);
    table(["No.", "KPI", "Definition", "Actual", "Target", "Status", "Trend", "Previous"], [
      ...kpis.map((k, i) => [i + 1, k.name, k.def || "", fmtKpi(k.actual, k.unit), k.targetText || "", E.RAG_TEXT[k.rag] || k.rag, k.trend || "", k.prev == null ? "" : fmtKpi(k.prev, k.unit)]),
      ["—", `Other points · ${other.name || ""}`, "Manual indicator", other.actual || "", "", E.RAG_TEXT[other.rag] || "", "", ""],
    ], { columnStyles: { 0: { cellWidth: 12 }, 1: { cellWidth: 70, fontStyle: "bold" }, 2: { cellWidth: 150 } }, didParseCell: (d) => ragCell(d, 5), fontSize: 8.6 });
    // batch pipeline (commercial lots)
    const lots = s.rel.map((r, i) => ({ r, c: comp.rel[i] })).filter((x) => has(x.r.id) && !E.lotTracking(x.r));
    h2("Batch pipeline", "commercial lots of the release register · registration lots are tracking only");
    table(["Stage", "Lots", "Batches"], E.BATCH_STAGES.map(([k, label]) => { const xs = lots.filter((x) => x.c.stage === k); return [label, xs.length, xs.map((x) => `${x.r.id}${x.r.product ? ` (${String(x.r.product).split(/\s+/).slice(0, 2).join(" ")})` : ""}${x.c.partial ? " partial rej." : ""}`).join(", ")]; }).filter((r) => r[1]),
      { columnStyles: { 0: { cellWidth: 70, fontStyle: "bold" }, 1: { cellWidth: 16, halign: "right" } }, fontSize: 8.4 });
    const sum = E.t2Summary(s, comp);
    h2("Monthly summary", "every register: records, new this month and the key lines");
    table(["No.", "Register", "Records", "New", "Key figures"], ["dev", "capa", "cc", "act", "insp", "rel", "doc", "load", "apqr", "trn", "esc"].filter((r) => sum[r]).map((reg) => { const x = sum[reg]; return [T2_REGISTERS[reg].no, T2_REGISTERS[reg].title, x.total, `${x.new} ${x.newLabel || ""}`, x.lines.map(([l, v]) => `${l}: ${/Utilisation|Completion/.test(l) ? pct(v) : v === "" ? "—" : v}`).join("  ·  ")]; }),
      { columnStyles: { 0: { cellWidth: 14 }, 1: { cellWidth: 60, fontStyle: "bold" }, 2: { cellWidth: 20, halign: "right" }, 3: { cellWidth: 34 } }, fontSize: 8.4 });
    h2("Raised today and this month");
    table(["Register", "New today", "New this month"], T2_ORDER.map((reg) => { const n = newCounts(s, reg); return n ? [T2_REGISTERS[reg].title, n.day, n.month] : null; }).filter((r) => r && (r[1] || r[2])), { columnStyles: { 0: { cellWidth: 80 } }, fontSize: 8.4 });
    const log = s.daily[st.statusDate] || {};
    h2(`Top 3 priorities · ${fmtLong(st.statusDate)}`);
    para([log.p1, log.p2, log.p3].filter(Boolean).map((p, i) => `${i + 1}. ${p}`).join("    ") || "No priority logged for the day.");
    h2("Open escalations to Tier 3");
    table(["No.", "Issue", "Owner", "Due", "Status"], E.t2Top(s, "esc", 50, comp).map(({ r, c }) => [r.id, r.desc || "", r.owner || "", fmtDate(r.due), c.live]), { columnStyles: { 1: { cellWidth: 200 } }, empty: "No open escalation." });
    h2("Monthly remarks"); para(st.remarks || "—");
  }

  /* Daily Log */
  if (sections.includes("daily")) {
    const cal = E.t2Calendar(s);
    h1("Daily Log — Q-calendar", fmtMonth(st.month));
    const procs = cal[0]?.procs.map((p) => p.label) || [];
    stats([["Critical days", String(cal.filter((d) => d.code === 3).length), "R"], ["In-progress days", String(cal.filter((d) => d.code === 2).length), "A"], ["Normal days", String(cal.filter((d) => d.code === 1).length), "G"], ["Meetings held", String(cal.filter((d) => d.log.held === "Yes").length), null]]);
    table(["Date", "Day", "Held", "Att.", ...procs, "Day status", "Top 3 priorities", "Escalated", "Absent", "Remarks"], cal.map((d) => [fmtDate(d.date), ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(`${d.date}T00:00:00Z`).getUTCDay()], d.weekend ? "weekend" : d.log.held || "", d.log.attendees ?? "", ...d.procs.map((p) => `${p.status}${p.override ? " (override)" : ""}`), d.status, [d.log.p1, d.log.p2, d.log.p3].filter(Boolean).join(" | "), d.log.escalated || "", d.log.absent || "", d.log.remarks || ""]),
      { didParseCell: (data) => { if (data.section === "body") { const v = String(data.cell.raw || ""); if (/^CRITICAL/i.test(v)) data.cell.styles.textColor = RAG.R; else if (/^IN PROGRESS/i.test(v)) data.cell.styles.textColor = RAG.A; } }, columnStyles: { [procs.length + 5]: { cellWidth: 90 }, [procs.length + 8]: { cellWidth: 60 } } });
  }

  /* registers */
  const regsOf = (group) => T2_ORDER.filter((r) => (group === "audits" ? AUDIT_GROUP.includes(r) : !AUDIT_GROUP.includes(r)));
  for (const group of ["regs", "audits"]) {
    if (!sections.includes(group)) continue;
    for (const reg of regsOf(group)) {
      const sc = T2_REGISTERS[reg], rows = s[reg] || [], cc = comp[reg] || [];
      onStep(`Writing ${sc.title}…`);
      const fx = fxSpec("t2", reg);
      const list = rows.map((r, i) => ({ r, c: cc[i] || {} })).filter((x) => closed || x.c.open !== false);
      const mS = E.monthStart(st.month), mE = E.monthEnd(st.month), dk = sc.dateKey || (sc.fields.some((f) => f.key === "opened") ? "opened" : null);
      h1(`${sc.no} · ${sc.title}`, `${rows.length} record${rows.length === 1 ? "" : "s"}${closed ? "" : ` · ${list.length} open shown`}`);
      if (sc.lead) para(sc.lead, 9.5);
      const open = cc.filter((c) => c.open).length, od = cc.filter((c) => c.live === "Overdue").length, flagged = cc.filter((c) => c.check && c.check !== "OK").length;
      stats([["Records", String(rows.length), null], ["Open", String(open), null], ["Overdue", String(od), od ? "R" : "G"], ...(dk ? [["New this month", String(rows.filter((r) => has(r[dk]) && r[dk] >= mS && r[dk] <= mE).length), null]] : []), ["Data check flags", String(flagged), flagged ? "A" : null]]);
      const fields = sc.fields;
      const head = [...fields.map((f) => f.label), ...fx.map((x) => `f ${x.label}`)];
      const body = list.map(({ r, c }) => [...fields.map((f) => fval(f, r[f.key])), ...fx.map((x) => { try { return strip(x.cell(c, r)); } catch { return ""; } })]);
      const cs = {};
      fields.forEach((f, i) => { if (f.type === "long") cs[i] = { cellWidth: head.length > 18 ? 42 : 60 }; else if (f.type === "people") cs[i] = { cellWidth: 40 }; else if (f.key === "id") cs[i] = { fontStyle: "bold", minCellWidth: 16 }; else if (f.type === "list" || f.type === "date") cs[i] = { minCellWidth: 14 }; });
      fx.forEach((_, j) => { cs[fields.length + j] = { minCellWidth: 13 }; });
      const liveIdx = head.findIndex((h) => /Live Status/i.test(h));
      table(head, body, { columnStyles: cs, didParseCell: liveIdx >= 0 ? liveCell(liveIdx) : undefined, empty: "No record in this register." });
    }
  }

  /* training */
  if (sections.includes("training")) {
    const Y = +String(st.statusDate).slice(0, 4);
    onStep("Writing training…");
    h1(`Training ${Y}`, "annual department plan, unplanned and external training");
    const rep = monthlyReport(s, Y);
    h2("Monthly department report", "Planned: topics planned (P), executed (E), employees to be trained, trained · Unplanned: employees trained (quality circle, SOP, others) · External");
    table(["Month", "P", "E", "To be trained", "Trained", "Quality circle", "SOP training", "Others", "External"], rep.map((m) => [m.label, m.P || "", m.P ? m.E ?? "" : "", m.toTrain || "", m.P ? m.trained ?? "" : "", m.qc || "", m.sop || "", m.other || "", m.ext || ""]), { fontSize: 8.6 });
    const people = missingTraining(s, Y);
    h2("Missing training per person per month", "number of annual-plan topics due and not attended · (n) = session not held yet · Yes = all attended");
    table(["Person", "Job title", ...MON, "Missing", "Due", "Plan %"], people.map((p) => [p.name, p.role, ...p.months.map((m) => (!m.req ? "" : m.missed.length ? (m.absent ? String(m.missed.length) : `(${m.missed.length})`) : m.due ? "Yes" : "to come")), p.missed.length, p.due, p.due ? pct((p.due - p.missed.length) / p.due) : "—"]),
      { didParseCell: (d) => { if (d.section === "body" && d.column.index >= 2 && d.column.index < 14) { const v = String(d.cell.raw); if (/^\d+$/.test(v)) { d.cell.styles.fillColor = RAGBG.R; d.cell.styles.textColor = RAG.R; } else if (/^\(\d+\)$/.test(v)) { d.cell.styles.fillColor = RAGBG.A; } else if (v === "Yes") { d.cell.styles.fillColor = RAGBG.G; } d.cell.styles.halign = "center"; } }, columnStyles: { 0: { cellWidth: 46, fontStyle: "bold" }, 1: { cellWidth: 46 } } });
    h2("Missing training — list");
    table(["Person", "Month", "Document No.", "Training title", "Reason"], people.flatMap((p) => p.missed.map((t) => [p.name, fmtMonth(t.r.date), t.r.sop || "", t.r.topic || "", t.held ? "Absent from the session" : "Session not held yet"])), { columnStyles: { 3: { cellWidth: 190 } }, empty: "No missing training." });
  }

  /* overdue by owner */
  if (sections.includes("owner")) {
    h1("Overdue by owner", "every open record past its due date, all registers");
    const OWN = { insp: "inspector", rel: "officer", load: "member", tasks: "member", trn: "trainer" };
    const regs = T2_ORDER.filter((r) => !AUDIT_GROUP.includes(r) && r !== "load" && r !== "abs");
    const m = new Map();
    for (const reg of regs) (s[reg] || []).forEach((r, i) => { if (comp[reg]?.[i]?.live !== "Overdue") return; const o = r[OWN[reg] || "owner"] || "No owner"; if (!m.has(o)) m.set(o, {}); m.get(o)[reg] = (m.get(o)[reg] || 0) + 1; });
    const used = regs.filter((r) => [...m.values()].some((x) => x[r]));
    table(["Owner", ...used.map((r) => T2_REGISTERS[r].short), "Total"], [...m].map(([o, x]) => [o, ...used.map((r) => x[r] || ""), used.reduce((a, r) => a + (x[r] || 0), 0)]).sort((a, b) => b[b.length - 1] - a[a.length - 1]), { columnStyles: { 0: { cellWidth: 70, fontStyle: "bold" } }, empty: "No overdue record." });
  }

  /* KPI trend */
  if (sections.includes("trend")) {
    h1(`KPI trend ${s.trend?.year || ""}`, "monthly actuals as frozen at each month-end");
    table(["KPI", "Target", ...MON], kpis.map((k, i) => [k.name, k.targetText || "", ...MON.map((_, j) => { const v = s.trend?.rows?.[i]?.[j]; return v == null ? "" : fmtKpi(v, k.unit); })]), { columnStyles: { 0: { cellWidth: 70, fontStyle: "bold" } }, fontSize: 8.6 });
  }

  /* contents on the cover, then header & footer on every page */
  doc.setPage(1);
  let ty = 176;
  doc.setTextColor(...INK); doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.text("Contents", L + 8, ty); ty += 7;
  doc.setFont("helvetica", "normal"); doc.setFontSize(10);
  const col = Math.ceil(toc.length / 2);
  toc.forEach(([t, p], i) => { const x = L + 8 + (i >= col ? 200 : 0), yy = ty + (i % col) * 5.6; doc.setTextColor(...INK); doc.text(T(t), x, yy); doc.setTextColor(...MUTED); doc.text(String(p), x + 180, yy, { align: "right" }); });
  const n = doc.getNumberOfPages();
  for (let p = 1; p <= n; p++) {
    doc.setPage(p);
    doc.setDrawColor(...LINE); doc.setLineWidth(0.3); doc.line(L, Hh - 11, W - L, Hh - 11);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...MUTED);
    doc.text(T(`${st.site || ""} · QA Tier 2 complete data report · data as of ${fmtDate(st.statusDate)} · generated ${fmtDate(new Date().toISOString().slice(0, 10))}`), L, Hh - 6.5);
    doc.text(`Page ${p} / ${n}`, W - L, Hh - 6.5, { align: "right" });
    if (p > 1) { doc.setFontSize(8); doc.setTextColor(...TEAL); doc.text(T(`QA TIER 2 · ${siteName(st).toUpperCase()}`), L, 9); }
  }
  onStep("Saving…");
  return { blob: doc.output("blob"), pages: n };
}

/* ═════════ the dialog ═════════ */

export async function openA3Center() {
  const { el, close } = modal(`<div class="row"><div><div class="eyebrow">Print & present · A3</div><h2>A3 downloads</h2></div><span class="spacer"></span><button class="btn ghost" data-x aria-label="Close">✕</button></div>
    <div class="a3c-grid">
      <section class="a3c-card">
        <div class="a3c-ic">▣</div><h3>Board poster</h3>
        <p class="muted">The daily board on one A3 landscape page — KPIs, Quality Pulse, Q-calendar, priorities, escalations, the process registers.</p>
        <button class="btn" data-poster>Open the poster ›</button>
      </section>
      <section class="a3c-card">
        <div class="a3c-ic">⎙</div><h3>Full dashboard page</h3>
        <p class="muted">Every part of the dashboard on its own A3 sheet, scaled to fit — nothing cut: ① the global board (Quality Pulse, KPIs) ② the Q-calendar, priorities, escalations and process registers ③ batches, new records today and this month, the monthly summary.</p>
        <label class="fctl"><span>Layout</span><select data-dmode><option value="auto" selected>One part per A3 page — best orientation for each (3 pages)</option><option value="portrait">One part per A3 page — all portrait</option><option value="landscape">One part per A3 page — all landscape</option><option value="fit">The whole dashboard on one A3 sheet</option></select></label>
        <label class="fctl"><span>Resolution</span><select data-ddpi><option value="300" selected>300 dpi — print</option><option value="400">400 dpi — fine print</option><option value="200">200 dpi — screen & e-mail</option></select></label>
        <div class="row"><button class="btn primary" data-dpdf>⤓ A3 PDF</button><button class="btn" data-dzip>⤓ PNG pages (ZIP)</button></div>
      </section>
      <section class="a3c-card">
        <div class="a3c-ic">▤</div><h3>Complete data report</h3>
        <p class="muted">Every Tier 2 page as data tables on A3 landscape — sharp vector text, every record, every field and ƒx column.</p>
        <div class="a3c-checks">${REPORT_SECTIONS.map(([k, l]) => `<label><input type="checkbox" data-sec="${k}" checked> ${esc(l)}</label>`).join("")}
          <label class="sep"><input type="checkbox" data-closed checked> Include closed and completed records</label></div>
        <button class="btn primary" data-rpdf>⤓ A3 data report (PDF)</button>
      </section>
    </div>
    <div class="a3c-status muted" data-status aria-live="polite"></div>`);
  el.classList.add("a3c");
  el.querySelector("[data-x]").onclick = close;
  const status = (t) => { el.querySelector("[data-status]").textContent = t; };
  const run = async (btn, fn) => {
    const all = el.querySelectorAll("button.btn:not([data-x])");
    const t = btn.textContent; all.forEach((b) => { b.disabled = true; }); btn.textContent = "Working…";
    try { await fn(); } catch (e) { status(""); toast(e.message || "Export failed"); } finally { all.forEach((b) => { b.disabled = false; }); btn.textContent = t; }
  };
  el.querySelector("[data-poster]").onclick = () => { close(); import("./poster.js").then((m) => m.openA3Export()); };
  const dash = async (kind) => {
    const mode = el.querySelector("[data-dmode]").value, dpi = +el.querySelector("[data-ddpi]").value;
    const res = await dashboardPages({ mode, dpi, onStep: status });
    status(`Saving ${res.canvases.length} page${res.canvases.length > 1 ? "s" : ""}…`);
    if (kind === "pdf") await saveFile(`${base("Dashboard_A3")}.pdf`, await dashboardPDF(res));
    else await saveFile(`${base("Dashboard_A3")}_PNG.zip`, await dashboardZip(res));
    status(`Dashboard saved — ${res.canvases.length} A3 page${res.canvases.length > 1 ? "s" : ""} at ${dpi} dpi.`);
  };
  el.querySelector("[data-dpdf]").onclick = (e) => run(e.currentTarget, () => dash("pdf"));
  el.querySelector("[data-dzip]").onclick = (e) => run(e.currentTarget, () => dash("zip"));
  el.querySelector("[data-rpdf]").onclick = (e) => run(e.currentTarget, async () => {
    const sections = [...el.querySelectorAll("[data-sec]:checked")].map((c) => c.dataset.sec);
    if (!sections.length) throw new Error("Tick at least one section");
    const { blob, pages } = await dataReport({ sections, closed: el.querySelector("[data-closed]").checked, onStep: status });
    await saveFile(`${base("Data_Report_A3")}.pdf`, blob);
    status(`Data report saved — ${pages} A3 pages.`);
  });
}
