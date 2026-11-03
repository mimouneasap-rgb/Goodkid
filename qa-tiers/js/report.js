// The management report: a Word (.docx) document built in the browser from
// the live boards — executive summary, KPI tables with RAG colours, the charts
// as high-resolution images, every register's open and overdue items, QA
// load, the Tier 1 board and data quality. Uses the docx library (MIT),
// loaded from a CDN the first time a report is made.

import { store } from "./store.js";
import * as E from "./engine.js";
import { T1_REGISTERS, T2_REGISTERS } from "./schema.js";
import * as T1 from "./views-t1.js";
import * as T2 from "./views-t2.js";
import { renderPNG, saveFile } from "./export.js";
import { esc, fmtDate, fmtLong, fmtMonth, fmtKpi, pct, fmtNum, today, toast, fresh, $ } from "./ui.js";

const DOCX_URL = "https://cdn.jsdelivr.net/npm/docx@8.5.0/build/index.umd.js";
let loading = null;
function loadDocx() {
  if (window.docx) return Promise.resolve(window.docx);
  loading ??= new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = DOCX_URL;
    s.onload = () => (window.docx ? res(window.docx) : rej(new Error("docx library missing")));
    s.onerror = () => { loading = null; rej(new Error("The Word library could not be loaded — check the connection and try again.")); };
    document.head.append(s);
  });
  return loading;
}

export const SECTIONS = [
  { key: "summary", label: "Executive summary", hint: "Quality Pulse, board health, overdue items, remarks" },
  { key: "kpis", label: "Tier 2 KPIs", hint: "Actual vs target, RAG and trend for the 9 KPIs" },
  { key: "charts", label: "Charts", hint: "Q-calendar, the 8 analytics charts, SQDCP letters and daily activity as images" },
  { key: "dev", label: "Quality events (deviations)", hint: "Status mix and every open event" },
  { key: "capa", label: "CAPA", hint: "Status mix, overdue and open CAPA" },
  { key: "cc", label: "Change control", hint: "Status mix, overdue and open changes" },
  { key: "act", label: "eQMS actions", hint: "Overdue actions by owner and the overdue list" },
  { key: "rel", label: "Batch release", hint: "Release clock and batches not yet released" },
  { key: "apqr", label: "APQR", hint: "Programme status and overdue reviews" },
  { key: "load", label: "QA load", hint: "Capacity, calculated workload and delays per person" },
  { key: "t1", label: "Tier 1 huddle board", hint: "SQDCP day counts, 20 KPIs and team performance" },
  { key: "quality", label: "Data quality", hint: "Data-check flags per register" },
  { key: "appendix", label: "Definitions & sources", hint: "KPI definitions, targets and data sources" },
];

// colours of the report (Word wants hex without #)
const C = { navy: "0F2340", accent: "0C8F8A", ink: "1B2433", muted: "6B7689", line: "D6D9DF", head: "E8EDF6",
  G: "DCF2E6", A: "FDF1CF", R: "FBDFDF", N: "ECEEF2", Gt: "0F6B3F", At: "8A5F00", Rt: "A52222", Nt: "5D6878" };
const RAG_WORD = { G: "On target", A: "Watch", R: "Off target", N: "No data" };

/* ── building blocks ─────────────────────────────────────── */

function kit(d) {
  const { Paragraph, TextRun, Table, TableRow, TableCell, WidthType, ShadingType, AlignmentType, HeadingLevel, BorderStyle, TableLayoutType } = d;
  const P = (text, o = {}) => new Paragraph({ spacing: { after: 120 }, ...o, children: (Array.isArray(text) ? text : [text]).map((t) => (typeof t === "string" ? new TextRun({ text: t }) : t)) });
  const H = (text, level = 1) => new Paragraph({ heading: [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3][level - 1], spacing: { before: level === 1 ? 360 : 240, after: 120 }, children: [new TextRun({ text })] });
  const B = (text) => new Paragraph({ bullet: { level: 0 }, spacing: { after: 60 }, children: (Array.isArray(text) ? text : [text]).map((t) => (typeof t === "string" ? new TextRun({ text: t }) : t)) });
  const thin = { style: BorderStyle.SINGLE, size: 4, color: C.line };
  const borders = { top: thin, bottom: thin, left: thin, right: thin, insideHorizontal: thin, insideVertical: thin };
  const cell = (v, o = {}) => new TableCell({
    shading: o.fill ? { type: ShadingType.CLEAR, color: "auto", fill: o.fill } : undefined,
    margins: { top: 60, bottom: 60, left: 90, right: 90 },
    children: [new Paragraph({ alignment: o.right ? AlignmentType.RIGHT : AlignmentType.LEFT, children: [new TextRun({ text: v == null || v === "" ? "—" : String(v), bold: !!o.bold, color: o.color, size: o.size || 18 })] })],
  });
  /** rows: arrays of cells (string, or {v, rag, right, bold}) */
  const PAGE = 9900; // A4 text width in twips with the report's margins
  const T = (head, rows, { right = [], widths = null } = {}) => new Table({
    width: { size: 100, type: WidthType.PERCENTAGE }, borders,
    ...(widths ? { layout: TableLayoutType.FIXED, columnWidths: widths.map((w) => Math.round((w / widths.reduce((a, b) => a + b, 0)) * PAGE)) } : {}),
    rows: [
      new TableRow({ tableHeader: true, children: head.map((h, i) => cell(h, { bold: true, fill: C.head, color: C.navy, right: right.includes(i) })) }),
      ...rows.map((r) => new TableRow({ children: r.map((v, i) => {
        const o = v && typeof v === "object" ? v : { v };
        const rag = o.rag && RAG_WORD[o.rag] ? o.rag : null;
        return cell(o.v, { fill: rag ? C[rag] : undefined, color: rag ? C[`${rag}t`] : undefined, bold: o.bold || !!rag, right: right.includes(i) });
      }) })),
    ],
  });
  return { P, H, B, T, TextRun: d.TextRun };
}

/** An image paragraph from a PNG Blob, sized to the page width. */
async function picture(d, blob, caption) {
  const buf = await blob.arrayBuffer();
  const v = new DataView(buf);
  const w = v.getUint32(16), h = v.getUint32(20);
  const width = 620, height = Math.round((h / w) * width);
  return [
    new d.Paragraph({ alignment: d.AlignmentType.CENTER, spacing: { before: 120, after: 60 }, children: [new d.ImageRun({ data: buf, transformation: { width, height } })] }),
    new d.Paragraph({ alignment: d.AlignmentType.CENTER, spacing: { after: 240 }, children: [new d.TextRun({ text: caption, italics: true, size: 16, color: C.muted })] }),
  ];
}

/** Render a view off-screen and turn its chart cards into PNG images. */
async function captureCharts(onStep) {
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.className = "report-host";
  host.style.cssText = "position:fixed;left:-30000px;top:0;width:940px;pointer-events:none";
  // one chart per row, at its natural height
  const css = document.createElement("style");
  css.textContent = ".report-host .grid{display:flex!important;flex-direction:column;align-items:stretch}.report-host .grid>*{height:auto!important}";
  host.append(css);
  document.body.append(host);
  const shots = [];
  const grab = async (render, pick) => {
    host.querySelectorAll(":scope > div").forEach((n) => n.remove());
    const view = document.createElement("div");
    host.append(view);
    render(view);
    await new Promise((r) => setTimeout(r, 60));
    for (const [el, caption] of pick(host)) {
      if (!el) continue;
      onStep?.(caption);
      shots.push({ caption, blob: await renderPNG([el], { scale: 2.4, background: getComputedStyle(document.documentElement).getPropertyValue("--surface").trim() || "#ffffff" }) });
    }
  };
  try {
    await grab((v) => T2.renderBoard(v), (h) => [[[...h.querySelectorAll(".card")].find((c) => c.querySelector(".qcal")), "Tier 2 Q-calendar — worst status of the day across deviation, CAPA, change control and inspection"]]);
    await grab((v) => T2.renderAnalytics(v), (h) => [...h.querySelectorAll(".card")].filter((c) => c.querySelector("svg.chart")).map((c) => [c, c.querySelector("h2")?.textContent.replace(/^\d+\s*/, "").trim() || "Chart"]));
    await grab((v) => T1.renderBoard(v), (h) => [
      [h.querySelector("[data-export-block]"), "Tier 1 SQDCP letters — day-by-day status of each pillar this month"],
      [[...h.querySelectorAll(".card")].find((c) => /Daily activity/i.test(c.textContent) && c.querySelector("svg.chart")), "Tier 1 daily activity — whole team"],
    ]);
  } finally { host.remove(); }
  return shots;
}

/* ── report sections ─────────────────────────────────────── */

const daysLate = (due, ref) => (due ? E.diffDays(ref, due) : "");

function openTable(k, reg, rows, comp, ref, limit, cols) {
  const list = rows.map((r, i) => ({ r, c: comp[i] })).filter((x) => x.c.open)
    .sort((a, b) => (a.c.live === "Overdue" ? 0 : 1) - (b.c.live === "Overdue" ? 0 : 1) || String(a.r.due || "9").localeCompare(String(b.r.due || "9")));
  const shown = limit ? list.slice(0, limit) : list;
  const out = [k.T(cols.map((c) => c[0]), shown.map(({ r, c }) => cols.map((col) => col[1](r, c))), { right: cols.map((c, i) => (c[2] ? i : -1)), widths: cols.map((c) => c[3] || 10) })];
  if (list.length > shown.length) out.push(k.P(new k.TextRun({ text: `… and ${list.length - shown.length} more open records (see the register in the app).`, italics: true, color: C.muted, size: 18 })));
  return out;
}

function statusMix(rows, comp) {
  const m = {};
  rows.forEach((r, i) => { const s = comp[i].live || r.status || "—"; m[s] = (m[s] || 0) + 1; });
  return Object.entries(m).sort((a, b) => b[1] - a[1]).map(([s, n]) => `${s} ${n}`).join(" · ");
}

export async function buildReport(opts, onStep = () => {}) {
  onStep("Loading the Word library…");
  const d = await loadDocx();
  const k = kit(d);
  const s2 = store.t2, st = s2.setup, s1 = store.t1;
  const ref = st.statusDate;
  const comp = E.t2Computed(s2);
  const { kpis, other, pulse } = E.t2Kpis(s2, comp);
  const ctx = E.t1Context(s1, s1.setup.selDate, "All team");
  const k1 = E.t1Kpis(ctx);
  const on = (key) => opts.sections.includes(key);
  const lim = opts.limit;
  const body = [];

  // cover
  body.push(
    new d.Paragraph({ spacing: { before: 2400, after: 120 }, children: [new d.TextRun({ text: "QA DAILY MANAGEMENT REPORT", bold: true, size: 22, color: C.accent, characterSpacing: 60 })] }),
    new d.Paragraph({ spacing: { after: 120 }, children: [new d.TextRun({ text: "Tier 1 huddle board · Tier 2 daily management", bold: true, size: 48, color: C.navy })] }),
    new d.Paragraph({ spacing: { after: 480 }, children: [new d.TextRun({ text: st.site || "", size: 28, color: C.ink })] }),
    k.T(["", ""], [
      ["Reporting month", fmtMonth(st.month)], ["Data as of", fmtLong(ref)], ["Tier 1 board date", fmtLong(s1.setup.selDate)],
      ["Board owner", `${st.owner || "—"}${st.ownerRole ? ` — ${st.ownerRole}` : ""}`], ["Generated", `${fmtLong(today())} ${new Date().toTimeString().slice(0, 5)}`],
    ]),
    new d.Paragraph({ spacing: { before: 480 }, children: [new d.TextRun({ text: "A visual-management report: the eQMS remains the GMP record of truth.", italics: true, color: C.muted, size: 18 })] }),
    new d.Paragraph({ children: [new d.PageBreak()] }),
  );

  if (on("summary")) {
    onStep("Executive summary…");
    const over = (reg) => (comp[reg] || []).filter((c) => c.live === "Overdue").length;
    const flags = Object.entries(comp).reduce((a, [reg, c]) => a + (T2_REGISTERS[reg] ? E.flagged(c) : 0), 0);
    const teamUtil = (() => { const w = comp.load.reduce((a, c) => a + c.workload, 0), av = comp.load.reduce((a, c) => a + c.available, 0); return av ? w / av : ""; })();
    const reds = kpis.filter((x) => x.rag === "R");
    body.push(k.H("1 · Executive summary"),
      k.P([new k.TextRun({ text: "Quality Pulse ", bold: true }), new k.TextRun({ text: `${pulse.score === "" ? "—" : pct(pulse.score)} — ${pulse.g} KPIs on target, ${pulse.a} on watch, ${pulse.r} off target${pulse.n ? `, ${pulse.n} without data` : ""}.` })]),
      k.P([new k.TextRun({ text: "Tier 1 board health ", bold: true }), new k.TextRun({ text: `${k1.health.score === "" ? "—" : pct(k1.health.score)} — ${k1.health.g} green, ${k1.health.a} amber, ${k1.health.r} red of 20 KPIs.` })]),
      ...(reds.length ? [k.P([new k.TextRun({ text: "Off target: ", bold: true }), new k.TextRun({ text: reds.map((x) => `${x.name} ${fmtKpi(x.actual, x.unit)} (target ${x.targetText})`).join("; ") + "." })])] : []),
      k.H("Overdue today", 2),
      ...[["dev", "quality events"], ["capa", "CAPA"], ["cc", "change controls"], ["act", "eQMS actions"], ["rel", "batches past the release target"], ["apqr", "APQRs"], ["doc", "documents"], ["insp", "inspection findings"]]
        .filter(([r]) => comp[r]).map(([r, label]) => k.B(`${over(r)} ${label} overdue (of ${(s2[r] || []).filter((_, i) => comp[r][i].open).length} open)`)),
      k.B(`QA team utilisation ${teamUtil === "" ? "—" : pct(teamUtil)} — ${comp.load.reduce((a, c) => a + c.delayed, 0)} delayed tasks.`),
      k.B(`${flags} record${flags === 1 ? "" : "s"} flagged by the data check.`),
      ...(st.remarks ? [k.H("Monthly remarks", 2), k.P(st.remarks)] : []),
    );
  }

  if (on("kpis")) {
    body.push(k.H("2 · Tier 2 KPIs"),
      k.T(["KPI", "Definition", "Actual", "Target", "Status", "vs last month"],
        [...kpis.map((x) => [{ v: x.name, bold: true }, x.def, fmtKpi(x.actual, x.unit), x.targetText, { v: RAG_WORD[x.rag], rag: x.rag }, x.trend ? `${x.trend} ${x.trendCode > 0 ? "better" : x.trendCode < 0 ? "worse" : "same"}` : "—"]),
          [{ v: "Other points", bold: true }, other.name, other.actual, "Manual", { v: RAG_WORD[other.rag], rag: other.rag }, "—"]], { right: [2] }));
  }

  if (on("charts")) {
    const shots = await captureCharts((c) => onStep(`Rendering chart: ${c}`));
    body.push(k.H("3 · Charts"));
    for (const sh of shots) body.push(...(await picture(d, sh.blob, sh.caption)));
  }

  const regSection = (no, key, title, cols) => {
    const rows = s2[key] || [], c = comp[key] || [];
    return [k.H(`${no} · ${title}`), k.P([new k.TextRun({ text: `${rows.length} records · `, bold: true }), new k.TextRun({ text: statusMix(rows, c) })]), ...openTable(k, key, rows, c, ref, lim, cols)];
  };
  const late = (r, c) => (c.live === "Overdue" ? { v: `${daysLate(r.due, ref)} d late`, rag: "R" } : c.toDue === "" ? "—" : `in ${c.toDue} d`);
  let no = 4;
  if (on("dev")) body.push(...regSection(no++, "dev", "Quality events (deviations)", [["Ref.", (r) => r.id], ["Opened", (r) => fmtDate(r.opened)], ["Event", (r) => r.desc, false, 30], ["Class", (r) => r.cls], ["Owner", (r) => r.owner], ["Status", (r) => r.status], ["Due", (r) => fmtDate(r.due)], ["Overdue", late], ["Actions", (r, c) => (c.actions ? `${c.actions.open} open / ${c.actions.total}` : "—")]]));
  if (on("capa")) body.push(...regSection(no++, "capa", "CAPA", [["Ref.", (r) => r.id], ["Opened", (r) => fmtDate(r.opened)], ["CAPA", (r) => r.desc, false, 30], ["Source", (r) => r.source], ["Owner", (r) => r.owner], ["Status", (r) => r.status], ["Due", (r) => fmtDate(r.due)], ["Overdue", late], ["Actions", (r, c) => (c.actions ? `${c.actions.open} open / ${c.actions.total}` : "—")]]));
  if (on("cc")) body.push(...regSection(no++, "cc", "Change control", [["Ref.", (r) => r.id], ["Raised", (r) => fmtDate(r.opened)], ["Change", (r) => r.desc, false, 30], ["Type", (r) => r.type], ["Class", (r) => r.cat], ["Owner", (r) => r.owner], ["Status", (r) => r.status], ["Target", (r) => fmtDate(r.due)], ["Overdue", late]]));
  if (on("act") && s2.act?.length) {
    const rows = s2.act, c = comp.act;
    const byOwner = {};
    rows.forEach((r, i) => { if (!c[i].open) return; const o = r.owner || "—"; byOwner[o] ??= { open: 0, over: 0 }; byOwner[o].open++; if (c[i].live === "Overdue") byOwner[o].over++; });
    body.push(k.H(`${no++} · eQMS actions`), k.P([new k.TextRun({ text: `${rows.length} actions · `, bold: true }), new k.TextRun({ text: statusMix(rows, c) })]),
      k.H("Open actions by owner", 2),
      k.T(["Owner", "Open", "Overdue"], Object.entries(byOwner).sort((a, b) => b[1].over - a[1].over || b[1].open - a[1].open).slice(0, lim || 999).map(([o, x]) => [o, x.open, x.over ? { v: x.over, rag: "R" } : 0]), { right: [1, 2] }),
      k.H("Overdue actions", 2),
      ...openTable(k, "act", rows.filter((_, i) => c[i].live === "Overdue"), c.filter((x) => x.live === "Overdue"), ref, lim, [["Action", (r) => r.id], ["Parent", (r) => r.parent], ["Action", (r) => r.desc, false, 34], ["Owner", (r) => r.owner], ["Due", (r) => fmtDate(r.due)], ["Overdue", late]]));
  }
  if (on("rel")) {
    const rows = s2.rel, c = comp.rel, released = rows.filter((r) => r.status === "Released").length;
    body.push(k.H(`${no++} · Batch release`), k.P(`${rows.length} batches · ${released} released · ${c.filter((x) => x.late === "Yes").length} released late · ${c.filter((x) => x.live === "Overdue").length} past the ${st.brTarget}-day target without a decision.`),
      ...openTable(k, "rel", rows, c, ref, lim, [["Batch", (r) => r.id], ["Product", (r) => r.product, false, 24], ["Mfg completion", (r) => fmtDate(r.mfg)], ["Target", (r, x) => fmtDate(x.target)], ["Status", (r, x) => (x.live === "Overdue" ? { v: "Overdue", rag: "R" } : r.status)], ["Lead (d)", (r, x) => x.lead, true]]));
  }
  if (on("apqr")) {
    const rows = s2.apqr, c = comp.apqr;
    body.push(k.H(`${no++} · APQR`), k.P(`${rows.length} products · ${statusMix(rows, c)} · average completion ${pct(c.reduce((a, x) => a + x.effPct, 0) / (c.length || 1))}.`),
      ...openTable(k, "apqr", rows.filter((_, i) => c[i].live === "Overdue"), c.filter((x) => x.live === "Overdue"), ref, lim, [["APQR", (r) => r.id], ["Product", (r) => r.product, false, 24], ["Period", (r) => r.period], ["Due", (r) => fmtDate(r.due)], ["% complete", (r) => pct(r.pct), true], ["Overdue", late]]));
  }
  if (on("load")) {
    body.push(k.H(`${no++} · QA load — ${fmtMonth(st.month)}`),
      k.P("Workload is calculated: the standard effort of every record each person owns, spread over its dates, counted for the month."),
      k.T(["Team member", "Position", "Available (d)", "Workload (pd)", "Utilisation", "Delayed", "Status"],
        s2.load.map((r, i) => { const c = comp.load[i]; return [{ v: r.member, bold: true }, r.role, fmtNum(c.available), fmtNum(c.workload), pct(c.util), c.delayed, { v: c.status || "—", rag: c.status === "Overloaded" ? "R" : c.status === "High load" ? "A" : c.status ? "G" : "N" }]; }), { right: [2, 3, 4, 5] }));
  }
  if (on("t1")) {
    const counts = E.t1PillarCounts(E.t1Days(ctx));
    const team = E.t1Team(s1, s1.setup.selDate);
    body.push(k.H(`${no++} · Tier 1 huddle board — ${fmtLong(s1.setup.selDate)}`),
      k.H("SQDCP days this month", 2),
      k.T(["Pillar", "Green", "Amber", "Red", "No data"], E.PILLARS.map((p) => [{ v: `${p.key} · ${p.name}`, bold: true }, counts[p.key].g, counts[p.key].a, counts[p.key].r ? { v: counts[p.key].r, rag: "R" } : 0, counts[p.key].n]), { right: [1, 2, 3, 4] }),
      k.H("KPIs month to date", 2),
      k.T(["Pillar", "KPI", "Actual", "Target", "Status"], k1.kpis.map((x) => [x.pillar, x.name, fmtKpi(x.actual, x.unit), x.targetText, { v: RAG_WORD[x.rag], rag: x.rag }]), { right: [2] }),
      k.H("Team performance", 2),
      k.T(["Officer", "Days", "Line clear.", "Records", "Lead (d)", "Findings", "Open actions", "Overdue", "Status"],
        team.map((r) => [{ v: r.name, bold: true }, r.days, r.lc, r.records, fmtNum(r.lead), r.findings, r.open, r.late, { v: r.status === "G" ? "On track" : r.status === "A" ? "Watch" : "Action needed", rag: r.status }]), { right: [1, 2, 3, 4, 5, 6, 7] }));
  }
  if (on("quality")) {
    const c1 = E.t1Computed(s1, s1.setup.selDate);
    const rows = [...Object.entries(comp).filter(([r]) => T2_REGISTERS[r]).map(([r, c]) => ["Tier 2", T2_REGISTERS[r].title, (s2[r] || []).length, E.flagged(c)]),
      ...Object.entries(c1).filter(([r]) => T1_REGISTERS[r]).map(([r, c]) => ["Tier 1", T1_REGISTERS[r].title, (s1[r] || []).length, E.flagged(c)])];
    body.push(k.H(`${no++} · Data quality`), k.P("Records the data check flags (a missing status, closure date or a date order problem). A KPI is only as good as these records."),
      k.T(["Tier", "Register", "Records", "Flagged"], rows.map(([t, n, total, f]) => [t, n, total, f ? { v: f, rag: "R" } : { v: 0, rag: "G" }]), { right: [2, 3] }));
  }
  if (on("appendix")) {
    body.push(k.H(`${no++} · Definitions & sources`),
      k.T(["Tier 2 KPI", "Definition", "Target", "Amber limit"], s2.kpis.map((x) => [x.name, x.def, E.targetText(x), x.unit === "%" ? pct(x.amber) : x.amber])),
      k.P(""), k.P("RAG: ‘Higher’ KPIs are green at or above target, amber at or above the amber limit, otherwise red; ‘Lower’ KPIs the reverse. Quality Pulse and board health = (green + ½ amber) ÷ (green + amber + red). A KPI with no source data reads ‘No data’."),
      k.P(`Data as of ${fmtLong(ref)}. Registers mirror the eQMS and the site's own exports; the eQMS remains the GMP record.`));
  }

  onStep("Writing the document…");
  const doc = new d.Document({
    creator: "QA Tier Boards", title: `QA daily management report ${ref}`, description: st.site,
    styles: {
      default: { document: { run: { font: "Calibri", size: 20, color: C.ink } } },
      paragraphStyles: [
        { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", run: { size: 32, bold: true, color: C.navy }, paragraph: { spacing: { before: 360, after: 120 } } },
        { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", run: { size: 24, bold: true, color: C.accent }, paragraph: { spacing: { before: 240, after: 100 } } },
      ],
    },
    sections: [{
      properties: { page: { margin: { top: 1000, bottom: 1000, left: 1000, right: 1000 } } },
      headers: { default: new d.Header({ children: [new d.Paragraph({ alignment: d.AlignmentType.RIGHT, children: [new d.TextRun({ text: `${st.site || ""} · QA daily management report · ${fmtDate(ref)}`, size: 16, color: C.muted })] })] }) },
      footers: { default: new d.Footer({ children: [new d.Paragraph({ alignment: d.AlignmentType.CENTER, children: [new d.TextRun({ children: ["Page ", d.PageNumber.CURRENT, " of ", d.PageNumber.TOTAL_PAGES], size: 16, color: C.muted })] })] }) },
      children: body,
    }],
  });
  return d.Packer.toBlob(doc);
}

/* ── report page ─────────────────────────────────────────── */

const prefs = () => store.prefs.report || { sections: SECTIONS.map((x) => x.key), limit: 40 };

export function renderReportPage(root) {
  root = fresh(root);
  const p = prefs();
  const st = store.t2.setup;
  root.innerHTML = `
    <section class="hero"><div class="hero-grid"><div>
      <div class="eyebrow">Reporting</div><h1>Management report (Word)</h1>
      <p>A complete .docx built from the live boards, as of ${fmtLong(st.statusDate)}: summary, KPI tables with RAG colours, the charts as high-resolution images and every register's open and overdue items. Make one before each Tier 3 review, or any time.</p></div>
      <button class="btn primary" data-make style="font-size:15px;padding:10px 18px">⤓ Create the Word report</button></div></section>
    <div class="grid split-wide">
      <div class="card card-pad"><div class="card-head"><h2>Sections</h2><div class="row"><button class="btn sm" data-all>All</button><button class="btn sm" data-none>None</button></div></div>
        <div class="lcards">${SECTIONS.map((x) => `<label class="lcard" style="cursor:pointer"><span class="row" style="gap:8px"><input type="checkbox" data-sec="${x.key}" ${p.sections.includes(x.key) ? "checked" : ""}><b>${esc(x.label)}</b></span><span>${esc(x.hint)}</span></label>`).join("")}</div></div>
      <div class="stack">
        <div class="card card-pad"><div class="card-head"><h2>Tables</h2></div>
          <label class="field"><span>Rows per table</span><select data-limit>${[[15, "15 most urgent"], [40, "40 most urgent"], [100, "100"], [0, "All records"]].map(([v, l]) => `<option value="${v}" ${+p.limit === v ? "selected" : ""}>${l}</option>`).join("")}</select><small>Open items, overdue first.</small></label></div>
        <div class="card card-pad"><div class="card-head"><h2>What goes in</h2></div>
          <p class="muted" style="margin:0;font-size:13px">Tier 2 as of <b>${fmtLong(st.statusDate)}</b> (${fmtMonth(st.month)}) and Tier 1 as of <b>${fmtLong(store.t1.setup.selDate)}</b>. Change these dates on the boards or in Setup before making the report.</p>
          <div data-progress class="callout" style="margin-top:12px" hidden></div></div>
      </div>
    </div>`;
  const save = () => {
    store.prefs.report = { sections: [...root.querySelectorAll("[data-sec]:checked")].map((x) => x.dataset.sec), limit: +$("[data-limit]", root).value };
    store.save();
  };
  root.addEventListener("change", save);
  $("[data-all]", root).onclick = () => { root.querySelectorAll("[data-sec]").forEach((x) => { x.checked = true; }); save(); };
  $("[data-none]", root).onclick = () => { root.querySelectorAll("[data-sec]").forEach((x) => { x.checked = false; }); save(); };
  $("[data-make]", root).onclick = () => makeReport(root);
}

export async function makeReport(root) {
  const p = prefs();
  if (!p.sections.length) { toast("Pick at least one section"); return; }
  const btn = root ? $("[data-make]", root) : null;
  const prog = root ? $("[data-progress]", root) : null;
  const step = (t) => { if (prog) { prog.hidden = false; prog.textContent = t; } };
  if (btn) btn.disabled = true;
  try {
    const blob = await buildReport(p, step);
    const name = `QA_Report_${(store.t2.setup.site || "site").split(/[—-]/)[0].trim().replace(/\W+/g, "_")}_${store.t2.setup.statusDate}.docx`;
    step(`Report ready: ${name} (${Math.round(blob.size / 1024)} KB)`);
    await saveFile(name, blob);
  } catch (e) {
    step(e.message || "The report could not be created");
    toast(e.message || "The report could not be created");
  } finally { if (btn) btn.disabled = false; }
}
