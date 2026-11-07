// The reports centre: a daily report (Tier 1 huddle + Tier 2 stand-up), a
// weekly review and the monthly management pack — each a Word (.docx)
// document built in the browser from the live boards, filtered by person,
// area, product… with the team's commentary, a sign-off block and document
// control, plus a plain-text summary ready to paste into an e-mail or chat
// and the routine checklist of the period. Uses the docx library (MIT),
// loaded from a CDN the first time a report is made.

import { store } from "./store.js";
import * as E from "./engine.js";
import { T1_REGISTERS, T2_REGISTERS } from "./schema.js";
import * as T1 from "./views-t1.js";
import * as T2 from "./views-t2.js";
import { renderPNG, saveFile, loadScript } from "./export.js";
import { applyFilters, filterControls, readControls, wireControls, describe, activeCount } from "./filters.js";
import { esc, fmtDate, fmtLong, fmtMonth, fmtKpi, pct, fmtNum, today, toast, fresh, $, $$ } from "./ui.js";
import { EDITION, hasTier, ONE_TIER, MAIN_TIER } from "./edition.js";

const DOCX_URL = "https://cdn.jsdelivr.net/npm/docx@8.5.0/build/index.umd.js";
const loadDocx = () => loadScript(DOCX_URL, "docx");
const has = (v) => v !== "" && v != null;

/* ── report types ────────────────────────────────────────── */

export const TYPES = {
  daily: {
    label: "Daily report", short: "Daily", icon: "☀",
    lead: "One or two pages after the 10:30 stand-up: today's SQDCP letters and Tier 1 tiles, the Q-calendar of the day, the Top 3 priorities, what was raised today, what is due and what is overdue.",
    sections: [
      ["t1day", "Tier 1 huddle — today", "SQDCP letters of the day, attendance, today's tiles, the huddle log", "t1"],
      ["t1actions", "Open actions & findings", "Tier 1 actions due or overdue, findings raised today", "t1"],
      ["t1esc", "Escalated to Tier 2", "Open huddle actions handed to the 10:30 stand-up", "t1"],
      ["t2day", "Tier 2 stand-up — today", "Q-calendar status per process, meeting, Top 3 priorities, remarks", "t2"],
      ["new", "Raised today", "Every record opened on the day, register by register", "t2"],
      ["due", "Due today & tomorrow", "Open items that fall due in the next two days", "t2"],
      ["overdue", "Overdue items", "Every overdue item, oldest first", "t2"],
      ["esc", "Escalations", "Escalations received from Tier 1 and raised to Tier 3", "t2"],
      ["charts", "Pictures", "The boards as images (Q-calendar · SQDCP letters)"],
      ["notes", "Commentary", "Key messages, decisions, support needed, focus"],
      ["signoff", "Sign-off", "Prepared / reviewed / approved"],
    ],
  },
  weekly: {
    label: "Weekly review", short: "Weekly", icon: "▦",
    lead: "The week in numbers for the weekly QA review: raised vs closed against last week, KPIs, the Q-calendar and SQDCP week, overdue items, what is due next week, QA load and escalations.",
    sections: [
      ["t1week", "SQDCP week & KPIs", "Letters of each day of the week, the 20 KPIs month to date", "t1"],
      ["t1team", "Team performance", "Each officer, month to date", "t1"],
      ["t1actions", "Open actions & findings", "Tier 1 actions due or overdue, findings raised this week", "t1"],
      ["t1esc", "Escalated to Tier 2", "Open huddle actions handed to the 10:30 stand-up", "t1"],
      ["glance", "The week in numbers", "Raised and closed per register vs the previous week, open and overdue", "t2"],
      ["kpis", "Tier 2 KPIs", "Actual vs target, RAG and trend", "t2"],
      ["qweek", "Q-calendar week", "Day-by-day status of the week", "t2"],
      ["overdue", "Overdue items", "Every overdue item, oldest first", "t2"],
      ["next7", "Due next 7 days", "Open items falling due in the coming week", "t2"],
      ["load", "QA load", "Calculated utilisation and delayed tasks per person", "t2"],
      ["esc", "Escalations", "Escalations received from Tier 1 and raised to Tier 3", "t2"],
      ["charts", "Charts", "The boards as images (analytics charts · SQDCP letters)"],
      ["notes", "Commentary", "Key messages, decisions, support needed, focus"],
      ["signoff", "Sign-off", "Prepared / reviewed / approved"],
    ],
  },
  monthly: {
    label: "Monthly management pack", short: "Monthly", icon: "▣",
    lead: "The full Tier 3 pack for the month: cover, document control, contents, executive summary, the month in numbers vs last month, KPIs, every chart, each register's open items, QA load, the Tier 1 board, data quality, commentary, sign-off and definitions.",
    sections: [
      ["t1summary", "Tier 1 summary", "Board health, red-letter days, KPIs off target, actions and findings", "t1"],
      ["summary", "Executive summary", "Quality Pulse, what is off target, overdue items, remarks", "t2"],
      ["month", "The month in numbers", "Raised and closed per register vs the previous month", "t2"],
      ["kpis", "Tier 2 KPIs", "Actual vs target, RAG and trend for the 9 KPIs", "t2"],
      ["charts", "Charts", "The boards as images (Q-calendar · analytics charts · SQDCP letters · daily activity)"],
      ["dev", "Quality events (deviations)", "Status mix and every open event", "t2"],
      ["capa", "CAPA", "Status mix, overdue and open CAPA", "t2"],
      ["cc", "Change control", "Status mix, overdue and open changes", "t2"],
      ["act", "eQMS actions", "Overdue actions by owner and the overdue list", "t2"],
      ["audits", "Audits & findings", "Audit programme status, findings by classification, open and overdue findings", "t2"],
      ["rel", "Batch release", "Release clock and batches not yet released", "t2"],
      ["rej", "Rejections", "Reject index: open, pending signature, quantity rejected by type", "t2"],
      ["apqr", "APQR", "Programme status and overdue reviews", "t2"],
      ["load", "QA load", "Capacity, calculated workload and delays per person", "t2"],
      ["t1", "Tier 1 huddle board", "SQDCP day counts, 20 KPIs and team performance", "t1"],
      ["t1actions", "Open actions & findings", "Tier 1 actions open at month-end, findings raised in the month", "t1"],
      ["quality", "Data quality", "Data-check flags per register"],
      ["notes", "Commentary", "Key messages, decisions, support needed, next month's focus"],
      ["signoff", "Sign-off", "Prepared / reviewed / approved"],
      ["appendix", "Definitions & sources", "Tier 2 KPI definitions, targets and data sources", "t2"],
      ["t1defs", "Tier 1 KPI definitions", "The 20 KPIs: definition, target, amber limit", "t1"],
    ],
  },
};

/** The sections a report offers in this app (a single-tier app reports its own tier only). */
export const sectionsOf = (T) => T.sections.filter((x) => !x[3] || hasTier(x[3]));
const TIER_WORD = ONE_TIER === "t1" ? "Tier 1 " : ONE_TIER === "t2" ? "Tier 2 " : "";
if (ONE_TIER === "t1") {
  TYPES.daily.lead = "One page after the 08:30 huddle: today's SQDCP letters and tiles, the huddle log, open actions and findings, and what goes to Tier 2.";
  TYPES.weekly.lead = "The week of the shop floor: the SQDCP letters of each day, the 20 KPIs, each officer's performance, open actions and findings, escalations to Tier 2.";
  TYPES.monthly.label = "Monthly report";
  TYPES.monthly.lead = "The Tier 1 month: board health, red-letter days per pillar, the 20 KPIs, team performance, actions and findings, data quality, commentary, sign-off and the KPI definitions.";
} else if (ONE_TIER === "t2") {
  TYPES.daily.lead = "One or two pages after the 10:30 stand-up: the Tier 1 headlines and escalations received, the Q-calendar of the day, the Top 3 priorities, what was raised today, what is due and what is overdue.";
}

const NOTES = [
  ["messages", "Key messages", "Count first, name the trend, say what changed since the last report."],
  ["decisions", "Decisions & actions agreed", "Action — owner — due date, one per line."],
  ["support", "Support needed from Tier 3", "Resources, decisions or budget the team cannot solve itself."],
  ["focus", "Focus for the next period", "Two or three priorities."],
];

const REGS = ["dev", "capa", "cc", "insp", "act", "find", "aud", "rej", "esc", "doc", "apqr", "rel", "tasks", "trn"];
const DATE_KEY = { rej: "opened", dev: "opened", capa: "opened", cc: "opened", insp: "opened", act: "opened", esc: "opened", doc: "opened", apqr: "opened", rel: "mfg", trn: "date", tasks: "opened", aud: "opened", find: "opened" };
const CLOSE_KEY = { rej: "closed", dev: "closed", capa: "closed", cc: "closed", insp: "closed", act: "closed", esc: "closed", doc: "closed", apqr: "closed", rel: "decision", tasks: "closed", aud: "closed", find: "closed" };
const OWNER_KEY = { rej: "owner", dev: "owner", capa: "owner", cc: "owner", insp: "owner", act: "owner", esc: "owner", doc: "owner", apqr: "owner", rel: "officer", tasks: "member", trn: "trainer", aud: "owner", find: "owner" };
const label = (reg) => T2_REGISTERS[reg]?.short || reg;
const descOf = (r) => r.desc || r.title || r.topic || r.product || "";

/* ── period & facts ──────────────────────────────────────── */

/** The dates a report covers. */
export function periodOf(type, p = {}) {
  const st = store.t2.setup;
  const day = MAIN_TIER === "t2" ? st.statusDate : store.t1.setup.selDate; // a Tier 1 app reports on its board date
  if (type === "daily") {
    const d = p.date || day;
    return { type, from: d, to: d, ref: d, month: E.monthStart(d), prevFrom: E.addDays(d, -1), prevTo: E.addDays(d, -1), key: `daily:${d}`, label: fmtLong(d), file: d };
  }
  if (type === "weekly") {
    const end = p.date || day, from = E.addDays(end, -6);
    return { type, from, to: end, ref: end, month: E.monthStart(end), prevFrom: E.addDays(from, -7), prevTo: E.addDays(from, -1), key: `weekly:${end}`, label: `${fmtDate(from)} – ${fmtDate(end)}`, file: `week-ending-${end}` };
  }
  const M = E.monthStart(p.month || (MAIN_TIER === "t2" ? st.month : day)), end = E.monthEnd(M);
  const ref = day < M ? M : day > end ? end : day;
  const pm = E.monthStart(E.addDays(M, -1));
  return { type: "monthly", from: M, to: end, ref, month: M, prevFrom: pm, prevTo: E.monthEnd(pm), key: `monthly:${M.slice(0, 7)}`, label: fmtMonth(M), file: M.slice(0, 7) };
}

/** Both boards as of the report date, filtered (person, area, product…). */
export function boardsFor(per, F = {}) {
  const dimsOnly = { ...F, period: "all" };
  const t2 = { ...store.t2, setup: { ...store.t2.setup, statusDate: per.ref, month: per.month } };
  const s2 = applyFilters("t2", t2, dimsOnly);
  const officer = F.owner && store.t1.roster.some((o) => o.name === F.owner) ? F.owner : "All team";
  const s1 = { ...store.t1, setup: { ...store.t1.setup, selDate: per.ref } };
  return { s2, s1, officer };
}

export function facts(per, F = {}) {
  const { s2, s1, officer } = boardsFor(per, F);
  const comp = E.t2Computed(s2);
  const { kpis, other, pulse } = E.t2Kpis(s2, comp);
  const cal = E.t2Calendar(s2);
  const ctx = E.t1Context(s1, per.ref, officer);
  const k1 = E.t1Kpis(ctx);
  const inR = (d, a, b) => has(d) && d >= a && d <= b;
  const tally = (key, a, b) => Object.fromEntries(REGS.filter((r) => s2[r]).map((reg) => [reg, (s2[reg] || []).filter((r) => inR(r[key[reg]], a, b)).length]));
  const raised = tally(DATE_KEY, per.from, per.to), closed = tally(CLOSE_KEY, per.from, per.to);
  const raisedPrev = tally(DATE_KEY, per.prevFrom, per.prevTo), closedPrev = tally(CLOSE_KEY, per.prevFrom, per.prevTo);
  const items = REGS.flatMap((reg) => (s2[reg] || []).map((r, i) => ({ reg, r, c: comp[reg][i] })));
  const open = Object.fromEntries(REGS.filter((r) => s2[r]).map((reg) => [reg, items.filter((x) => x.reg === reg && x.c.open).length]));
  const overdueN = Object.fromEntries(REGS.filter((r) => s2[r]).map((reg) => [reg, items.filter((x) => x.reg === reg && x.c.live === "Overdue").length]));
  const dueOf = (x) => x.r.due || x.c.target || "";
  const overdue = items.filter((x) => x.c.live === "Overdue").sort((a, b) => String(dueOf(a)).localeCompare(String(dueOf(b))));
  const dueWithin = (n0, n1) => items.filter((x) => x.c.open && x.c.live !== "Overdue" && has(dueOf(x)) && E.diffDays(dueOf(x), per.ref) >= n0 && E.diffDays(dueOf(x), per.ref) <= n1)
    .sort((a, b) => String(dueOf(a)).localeCompare(String(dueOf(b))));
  const raisedList = items.filter((x) => inR(x.r[DATE_KEY[x.reg]], per.from, per.to));
  const t1days = E.t1Days(ctx);
  const t1esc = hasTier("t1") ? E.t1OpenActions(ctx).escalated
    : (s2.t1e || []).filter((r, i) => comp.t1e?.[i]?.open).map((r) => ({ id: r.id, officer: r.raisedBy || r.owner, desc: r.desc, due: r.due }));
  const c1 = E.t1Computed(s1, per.ref);
  const flags1 = Object.entries(c1).reduce((a, [reg, c]) => a + (T1_REGISTERS[reg] ? E.flagged(c) : 0), 0);
  const t1open = E.t1OpenActions(ctx).open;
  const esc3 = s2.esc.map((r, i) => ({ reg: "esc", r, c: comp.esc[i] })).filter((x) => x.c.open);
  const flags = Object.entries(comp).reduce((a, [reg, c]) => a + (T2_REGISTERS[reg] && !T2_REGISTERS[reg].trackOnly ? E.flagged(c) : 0), 0);
  const util = (() => { const w = comp.load.reduce((a, c) => a + c.workload, 0), av = comp.load.reduce((a, c) => a + c.available, 0); return av ? w / av : ""; })();
  return { per, F, s2, s1, comp, kpis, other, pulse, cal, ctx, k1, raised, closed, raisedPrev, closedPrev, open, overdueN, overdue, dueToday: dueWithin(0, 1), dueNext: dueWithin(0, 7), raisedList, t1days, t1esc, esc3, flags, flags1, t1open, util, dueOf, officer };
}

/* ── docx building blocks ────────────────────────────────── */

// colours of the report (Word wants hex without #)
const C = { navy: "0F2340", accent: "0C8F8A", ink: "1B2433", muted: "6B7689", line: "D6D9DF", head: "E8EDF6", band: "0F2340",
  G: "DCF2E6", A: "FDF1CF", R: "FBDFDF", N: "ECEEF2", Gt: "0F6B3F", At: "8A5F00", Rt: "A52222", Nt: "5D6878" };
const RAG_WORD = { G: "On target", A: "Watch", R: "Off target", N: "No data" };
const PILLAR_RAG = { 1: "G", 2: "A", 3: "R" };

function kit(d) {
  const { Paragraph, TextRun, Table, TableRow, TableCell, WidthType, ShadingType, AlignmentType, HeadingLevel, BorderStyle, TableLayoutType } = d;
  const runs = (text) => (Array.isArray(text) ? text : [text]).map((t) => (typeof t === "string" ? new TextRun({ text: t }) : t));
  const P = (text, o = {}) => new Paragraph({ spacing: { after: 120 }, ...o, children: runs(text) });
  const H = (text, level = 1) => new Paragraph({ heading: [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3][level - 1], spacing: { before: level === 1 ? 360 : 240, after: 120 }, keepNext: true, children: [new TextRun({ text })] });
  const B = (text) => new Paragraph({ bullet: { level: 0 }, spacing: { after: 60 }, children: runs(text) });
  const thin = { style: BorderStyle.SINGLE, size: 4, color: C.line };
  const none = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
  const borders = { top: thin, bottom: thin, left: thin, right: thin, insideHorizontal: thin, insideVertical: thin };
  const cell = (v, o = {}) => new TableCell({
    shading: o.fill ? { type: ShadingType.CLEAR, color: "auto", fill: o.fill } : undefined,
    margins: { top: 60, bottom: 60, left: 90, right: 90 },
    columnSpan: o.span,
    children: String(v ?? "").split("\n").map((line) => new Paragraph({ alignment: o.right ? AlignmentType.RIGHT : o.center ? AlignmentType.CENTER : AlignmentType.LEFT, children: [new TextRun({ text: line === "" && v != null && v !== "" ? " " : line || (v == null || v === "" ? "—" : ""), bold: !!o.bold, color: o.color, size: o.size || 18 })] })),
  });
  const PAGE = 9900; // A4 text width in twips with the report's margins
  /** rows: arrays of cells (string, or {v, rag, right, bold, fill}) */
  const T = (head, rows, { right = [], widths = null, center = [] } = {}) => new Table({
    width: { size: 100, type: WidthType.PERCENTAGE }, borders,
    ...(widths ? { layout: TableLayoutType.FIXED, columnWidths: widths.map((w) => Math.round((w / widths.reduce((a, b) => a + b, 0)) * PAGE)) } : {}),
    rows: [
      ...(head ? [new TableRow({ tableHeader: true, children: head.map((h, i) => cell(h, { bold: true, fill: C.head, color: C.navy, right: right.includes(i), center: center.includes(i) })) })] : []),
      ...rows.map((r) => new TableRow({ cantSplit: true, children: r.map((v, i) => {
        const o = v && typeof v === "object" ? v : { v };
        const rag = o.rag && RAG_WORD[o.rag] ? o.rag : null;
        return cell(o.v, { fill: o.fill || (rag ? C[rag] : undefined), color: o.color || (rag ? C[`${rag}t`] : undefined), bold: o.bold || !!rag, right: right.includes(i), center: center.includes(i), size: o.size });
      }) })),
    ],
  });
  /** A navy title band (daily and weekly reports). */
  const band = (title, sub) => new Table({
    width: { size: 100, type: WidthType.PERCENTAGE }, borders: { top: none, bottom: none, left: none, right: none, insideHorizontal: none, insideVertical: none },
    rows: [new TableRow({ children: [new TableCell({ shading: { type: ShadingType.CLEAR, color: "auto", fill: C.band }, margins: { top: 200, bottom: 200, left: 240, right: 240 },
      children: [new Paragraph({ children: [new TextRun({ text: title, bold: true, size: 36, color: "FFFFFF" })] }), new Paragraph({ children: [new TextRun({ text: sub, size: 20, color: "C9D6EA" })] })] })] })],
  });
  return { P, H, B, T, band, TextRun, d };
}

/** An image paragraph from a PNG Blob, sized to the page width. */
async function picture(d, blob, caption) {
  const buf = await blob.arrayBuffer();
  const v = new DataView(buf);
  const w = v.getUint32(16), h = v.getUint32(20);
  const width = 620, height = Math.round((h / w) * width);
  return [
    new d.Paragraph({ alignment: d.AlignmentType.CENTER, spacing: { before: 120, after: 60 }, keepNext: true, children: [new d.ImageRun({ data: buf, transformation: { width, height } })] }),
    new d.Paragraph({ alignment: d.AlignmentType.CENTER, spacing: { after: 240 }, children: [new d.TextRun({ text: caption, italics: true, size: 16, color: C.muted })] }),
  ];
}

/** Render views off-screen on the report's boards and turn chart cards into PNG images. */
async function captureCharts(per, F, which, onStep) {
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.className = "report-host";
  host.style.cssText = "position:fixed;left:-30000px;top:0;width:940px;pointer-events:none";
  const css = document.createElement("style"); // one chart per row, at its natural height
  css.textContent = ".report-host .grid{display:flex!important;flex-direction:column;align-items:stretch}.report-host .grid>*{height:auto!important}.report-host .fbar{display:none}";
  host.append(css);
  document.body.append(host);
  const { s2, s1 } = boardsFor(per, F);
  const shots = [];
  const grab = async (render, pick) => {
    host.querySelectorAll(":scope > div").forEach((n) => n.remove());
    const view = document.createElement("div");
    host.append(view);
    const keep = { t1: store.t1, t2: store.t2 };
    store.t2 = s2; store.t1 = s1; // drawn synchronously on the report's boards
    try { render(view); } finally { store.t2 = keep.t2; store.t1 = keep.t1; }
    await new Promise((r) => setTimeout(r, 60));
    for (const [el, caption] of pick(host)) {
      if (!el) continue;
      onStep?.(caption);
      shots.push({ caption, blob: await renderPNG([el], { scale: 2.4, theme: "light", background: "card" }) });
    }
  };
  const dimF = { ...F, period: "all" };
  try {
    if (which.qcal) await grab((v) => T2.renderBoard(v, { filters: { period: "all" } }), (h) => [[[...h.querySelectorAll(".card")].find((c) => c.querySelector(".qcal")), `Tier 2 Q-calendar — ${fmtMonth(per.month)} — worst status of the day across deviation, CAPA, change control and inspection`]]);
    if (which.charts) await grab((v) => T2.renderAnalytics(v, { filters: dimF, only: which.charts === true ? null : which.charts, ownFilters: false }), (h) => [...h.querySelectorAll(".card")].filter((c) => c.querySelector("svg.chart")).map((c) => [c, c.querySelector("h2")?.textContent.replace(/^\d+\s*/, "").trim() || "Chart"]));
    if (which.t1) await grab((v) => T1.renderBoard(v), (h) => [
      [h.querySelector("[data-export-block]"), "Tier 1 SQDCP letters — day-by-day status of each pillar this month"],
      ...(which.t1activity ? [[[...h.querySelectorAll(".card")].find((c) => /Daily activity/i.test(c.textContent) && c.querySelector("svg.chart")), "Tier 1 daily activity — whole team"]] : []),
    ]);
  } finally { host.remove(); }
  return shots;
}

const daysLate = (due, ref) => (due ? E.diffDays(ref, due) : "");

function itemsTable(k, list, ref, limit, { due = true } = {}) {
  const shown = limit ? list.slice(0, limit) : list;
  if (!list.length) return [k.P(new k.TextRun({ text: "None.", italics: true, color: C.muted }))];
  const out = [k.T(["Register", "Ref.", "Item", "Owner", "Status", ...(due ? ["Due", "Overdue"] : ["Raised"])],
    shown.map((x) => {
      const d = x.r.due || x.c.target || "";
      return [label(x.reg), x.r.id || x.r.member || "", descOf(x.r), x.r[OWNER_KEY[x.reg]] || "—", x.c.live === "Overdue" ? { v: "Overdue", rag: "R" } : x.r.status || x.c.live || "—",
        ...(due ? [fmtDate(d), x.c.live === "Overdue" ? { v: `${daysLate(d, ref)} d`, rag: "R" } : "—"] : [fmtDate(x.r[DATE_KEY[x.reg]])])];
    }), { widths: due ? [12, 12, 36, 14, 12, 10, 9] : [12, 12, 40, 16, 12, 10] })];
  if (list.length > shown.length) out.push(k.P(new k.TextRun({ text: `… and ${list.length - shown.length} more (see the registers in the app).`, italics: true, color: C.muted, size: 18 })));
  return out;
}

function openTable(k, rows, comp, ref, limit, cols) {
  const list = rows.map((r, i) => ({ r, c: comp[i] })).filter((x) => x.c.open)
    .sort((a, b) => (a.c.live === "Overdue" ? 0 : 1) - (b.c.live === "Overdue" ? 0 : 1) || String(a.r.due || "9").localeCompare(String(b.r.due || "9")));
  const shown = limit ? list.slice(0, limit) : list;
  if (!list.length) return [k.P(new k.TextRun({ text: "No open record.", italics: true, color: C.muted }))];
  const out = [k.T(cols.map((c) => c[0]), shown.map(({ r, c }) => cols.map((col) => col[1](r, c))), { right: cols.map((c, i) => (c[2] ? i : -1)), widths: cols.map((c) => c[3] || 10) })];
  if (list.length > shown.length) out.push(k.P(new k.TextRun({ text: `… and ${list.length - shown.length} more open records (see the register in the app).`, italics: true, color: C.muted, size: 18 })));
  return out;
}

function statusMix(rows, comp) {
  const m = {};
  rows.forEach((r, i) => { const s = comp[i].live || r.status || "—"; m[s] = (m[s] || 0) + 1; });
  return Object.entries(m).sort((a, b) => b[1] - a[1]).map(([s, n]) => `${s} ${n}`).join(" · ") || "no record";
}

const arrow = (now, prev) => (now > prev ? `▲ ${now - prev}` : now < prev ? `▼ ${prev - now}` : "=");

function numbersTable(k, f, prevLabel) {
  const regs = REGS.filter((r) => f.s2[r] && (f.s2[r].length || f.raised[r] || f.closed[r]));
  if (!regs.length) return [k.P(new k.TextRun({ text: "No record yet.", italics: true, color: C.muted }))];
  return [k.T(["Register", "Raised", `Raised ${prevLabel}`, "Closed", `Closed ${prevLabel}`, "Open now", "Overdue now"],
    regs.map((r) => [{ v: label(r), bold: true }, f.raised[r], arrow(f.raised[r], f.raisedPrev[r]), f.closed[r], arrow(f.closed[r], f.closedPrev[r]), f.open[r], f.overdueN[r] ? { v: f.overdueN[r], rag: "R" } : { v: 0, rag: "G" }]),
    { right: [1, 2, 3, 4, 5, 6], widths: [22, 10, 14, 10, 14, 12, 12] }),
    k.P(new k.TextRun({ text: `▲ / ▼ compare with ${prevLabel === "prev." ? "the previous period" : prevLabel}. Closed = closure, decision or completion date in the period.`, italics: true, size: 16, color: C.muted }))];
}

function kpiTable(k, f) {
  return k.T(["KPI", "Definition", "Actual", "Target", "Status", "vs last month"],
    [...f.kpis.map((x) => [{ v: x.name, bold: true }, x.def, fmtKpi(x.actual, x.unit), x.targetText, { v: RAG_WORD[x.rag], rag: x.rag }, x.trend ? `${x.trend} ${x.trendCode > 0 ? "better" : x.trendCode < 0 ? "worse" : "same"}` : "—"]),
      [{ v: "Other points", bold: true }, f.other.name, f.other.actual, "Manual", { v: RAG_WORD[f.other.rag], rag: f.other.rag }, "—"]], { right: [2], widths: [20, 34, 11, 11, 12, 12] });
}

function lettersTable(k, f, days) {
  const list = days.filter((d) => d.type !== "Future");
  return k.T(["Date", ...E.PILLARS.map((p) => p.key)], list.map((d) => [fmtDate(d.date), ...E.PILLARS.map((p) => {
    const c = d.codes[p.key];
    return c === 8 ? { v: "W", fill: "E3E5E9", color: C.Nt } : c === 7 ? { v: "—", fill: C.N, color: C.Nt } : PILLAR_RAG[c] ? { v: p.key, rag: PILLAR_RAG[c] } : "";
  })]), { center: [1, 2, 3, 4, 5] });
}

function notesBlocks(k, notes, focusLabel = "Focus for the next period") {
  const out = [];
  for (const [key, title] of NOTES) {
    const v = (notes?.[key] || "").trim();
    if (!v) continue;
    out.push(k.H(key === "focus" ? focusLabel : title, 2), ...v.split("\n").filter((l) => l.trim()).map((l) => (/^[-•*]/.test(l.trim()) || v.includes("\n") ? k.B(l.replace(/^[-•*]\s*/, "")) : k.P(l))));
  }
  return out.length ? out : [k.P(new k.TextRun({ text: "No commentary written for this report.", italics: true, color: C.muted }))];
}

function signoff(k, sign) {
  const rows = [["Prepared by", sign?.prepared, sign?.preparedRole], ["Reviewed by", sign?.reviewed, sign?.reviewedRole], ["Approved by", sign?.approved, sign?.approvedRole]];
  return [k.T(["", "Name", "Position", "Signature", "Date"], rows.map(([r, n, role]) => [{ v: r, bold: true }, n || "", role || "", { v: "\n\n" }, ""]), { widths: [16, 24, 24, 22, 14] }),
    k.P(new k.TextRun({ text: "Sign on the printed copy, or attach the signed PDF to the eQMS / controlled folder.", italics: true, size: 16, color: C.muted }))];
}

/* ── the document ────────────────────────────────────────── */

export async function buildReport(opts, onStep = () => {}) {
  onStep("Loading the Word library…");
  const d = await loadDocx();
  const k = kit(d);
  const type = opts.type || "monthly";
  const T = TYPES[type];
  const per = opts.per || periodOf(type, opts);
  const F = opts.filters || {};
  onStep("Reading the boards…");
  const f = facts(per, F);
  const st = f.s2.setup, s1 = f.s1, ref = per.ref;
  const shown = new Set(sectionsOf(T).map(([key]) => key));
  const on = (key) => opts.sections.includes(key) && shown.has(key);
  const lim = +opts.limit || 0;
  const fdesc = describe({ ...F, period: "all" });
  const docNo = (opts.docNo || "").trim();
  const body = [];
  const titles = sectionsOf(T).filter(([key]) => on(key)).map(([, l]) => l);
  const site = (MAIN_TIER === "t1" ? s1.setup.site : st.site) || "";
  const none = () => k.P(new k.TextRun({ text: "None.", italics: true, color: C.muted }));
  const inPer = (dt) => has(dt) && dt >= per.from && dt <= per.to;
  const redDays = f.t1days.filter((x) => inPer(x.date)).reduce((a, x) => a + E.PILLARS.filter((p) => x.codes[p.key] === 3).length, 0);
  const t1overdue = f.t1open.filter((a) => has(a.due) && a.due < ref);
  let no = 1;
  const sec = (title) => k.H(`${no++} · ${title}`);

  // ── title / cover
  if (type === "monthly") {
    body.push(
      new d.Paragraph({ spacing: { before: 1800, after: 120 }, children: [new d.TextRun({ text: ONE_TIER === "t1" ? "QA TIER 1 MONTHLY REPORT" : ONE_TIER === "t2" ? "QA TIER 2 MONTHLY MANAGEMENT PACK" : "QA MONTHLY MANAGEMENT PACK", bold: true, size: 22, color: C.accent, characterSpacing: 60 })] }),
      new d.Paragraph({ spacing: { after: 120 }, children: [new d.TextRun({ text: fmtMonth(per.month), bold: true, size: 56, color: C.navy })] }),
      new d.Paragraph({ spacing: { after: 120 }, children: [new d.TextRun({ text: ONE_TIER === "t1" ? "Shop-floor QA huddle board · SQDCP" : ONE_TIER === "t2" ? "QA daily management board" : "Tier 1 huddle board · Tier 2 daily management", size: 28, color: C.ink })] }),
      new d.Paragraph({ spacing: { after: 480 }, children: [new d.TextRun({ text: site, size: 24, color: C.muted })] }),
      k.H("Document control", 2),
      k.T(null, [
        [{ v: "Document no.", bold: true }, docNo || "—"], [{ v: "Version", bold: true }, opts.version || "1.0"], [{ v: "Classification", bold: true }, opts.classification || "Internal"],
        [{ v: "Reporting month", bold: true }, fmtMonth(per.month)], [{ v: "Data as of", bold: true }, fmtLong(ref)],
        [{ v: "Board owner", bold: true }, MAIN_TIER === "t1" ? s1.setup.owner || "—" : `${st.owner || "—"}${st.ownerRole ? ` — ${st.ownerRole}` : ""}`],
        ...(fdesc.length ? [[{ v: "Filters", bold: true }, fdesc.join(" · ")]] : []),
        [{ v: "Generated", bold: true }, `${fmtLong(today())} ${new Date().toTimeString().slice(0, 5)} · ${EDITION.name}`],
      ], { widths: [28, 72] }),
      k.H("Contents", 2),
      ...titles.map((t, i) => new d.Paragraph({ spacing: { after: 40 }, children: [new d.TextRun({ text: `${i + 1}   ${t}`, size: 20 })] })),
      new d.Paragraph({ spacing: { before: 360 }, children: [new d.TextRun({ text: "A visual-management report: the eQMS remains the GMP record of truth.", italics: true, color: C.muted, size: 18 })] }),
      new d.Paragraph({ children: [new d.PageBreak()] }),
    );
  } else {
    const sub = [site, hasTier("t1") ? `Tier 1 ${s1.setup.huddleTime || "08:30"} huddle` : null, hasTier("t2") ? `Tier 2 ${st.meetingTime || "10:30"} stand-up` : null].filter(Boolean).join(" · ");
    const health = { v: "Tier 1 health", bold: true }, healthV = f.k1.health.score === "" ? "—" : pct(f.k1.health.score);
    body.push(k.band(type === "daily" ? `QA ${TIER_WORD}Daily Report — ${fmtLong(ref)}` : `QA ${TIER_WORD}Weekly Review — ${per.label}`, sub),
      new d.Paragraph({ spacing: { after: 80 }, children: [] }),
      k.T(null, [ONE_TIER === "t1"
        ? [health, healthV, { v: type === "daily" ? "Red letters today" : "Red letters (week)", bold: true }, redDays ? { v: String(redDays), rag: "R" } : { v: "0", rag: "G" }]
        : [{ v: "Quality Pulse", bold: true }, f.pulse.score === "" ? "—" : `${pct(f.pulse.score)} (${f.pulse.g} G · ${f.pulse.a} A · ${f.pulse.r} R)`, ...(hasTier("t1") ? [health, healthV] : [{ v: "From Tier 1", bold: true }, `${f.t1esc.length} open escalation${f.t1esc.length === 1 ? "" : "s"}`])],
        [{ v: ONE_TIER === "t1" ? "Actions overdue" : "Overdue items", bold: true }, (ONE_TIER === "t1" ? t1overdue.length : f.overdue.length) ? { v: String(ONE_TIER === "t1" ? t1overdue.length : f.overdue.length), rag: "R" } : { v: "0", rag: "G" }, { v: "Document", bold: true }, `${docNo || "—"} · v${opts.version || "1.0"} · ${opts.classification || "Internal"}`],
        ...(fdesc.length ? [[{ v: "Filters", bold: true }, { v: fdesc.join(" · ") }, "", ""]] : [])], { widths: [18, 32, 18, 32] }));
  }

  // ── daily
  if (type === "daily") {
    if (on("t1day")) {
      onStep("Tier 1…");
      const day = f.t1days.find((x) => x.date === ref);
      const t = E.t1Today(f.ctx);
      body.push(sec(`Tier 1 huddle — ${fmtLong(ref)}`),
        k.T(E.PILLARS.map((p) => `${p.key} · ${p.name}`), [E.PILLARS.map((p) => { const c = day?.codes[p.key]; return c === 8 ? "Weekend" : c === 7 ? "No data" : PILLAR_RAG[c] ? { v: RAG_WORD[PILLAR_RAG[c]], rag: PILLAR_RAG[c] } : "—"; })], { center: [0, 1, 2, 3, 4] }),
        k.P(""),
        k.T(["Present", "Line clearances", "Records reviewed", "Review backlog", "Findings raised", "Actions overdue", "Actions due today"],
          [[`${t.present}/${t.roster}`, `${t.lc}${t.lcf ? ` (${t.lcf} failed)` : ""}`, t.reviewed, `${t.backlog}${t.backlogLate ? ` (${t.backlogLate} late)` : ""}`, `${t.findings}${t.findingsHigh ? ` (${t.findingsHigh} high)` : ""}`, t.overdue ? { v: t.overdue, rag: "R" } : 0, t.dueToday]], { center: [0, 1, 2, 3, 4, 5, 6] }));
      const hd = s1.hd.find((h) => h.date === ref);
      if (hd) body.push(k.P([new k.TextRun({ text: "Huddle: ", bold: true }), new k.TextRun({ text: `${hd.held === "Yes" ? "held" : "not held"}${hd.attendees ? ` · ${hd.attendees} attendees` : ""}${[hd.p1, hd.p2, hd.p3].filter(Boolean).length ? ` · priorities: ${[hd.p1, hd.p2, hd.p3].filter(Boolean).join("; ")}` : ""}${hd.escl ? ` · escalated: ${hd.escl}` : ""}` })]));
    }
    if (on("t2day")) {
      const day = f.cal.find((x) => x.date === ref);
      const log = f.s2.daily[ref] || {};
      body.push(sec(`Tier 2 stand-up — ${fmtLong(ref)}`),
        day && !day.weekend ? k.T(["Process", "Status", "Why"], day.procs.map((p) => {
          const a = p.auto;
          const why = a ? [...a.overdue.map((r) => `${r.id} overdue`), ...a.raisedC.map((r) => `${r.id} raised critical`), ...a.raisedW.map((r) => `${r.id} raised major`), ...a.dueSoon.map((r) => `${r.id} due ${fmtDate(r.due)}`)].join(" · ") : "";
          return [p.label, { v: p.status || "—", rag: p.code === 3 ? "R" : p.code === 2 ? "A" : p.code === 1 ? "G" : "N" }, `${p.override ? "Manual override. " : ""}${why || "Nothing open, due or raised"}`];
        }), { widths: [22, 16, 62] }) : k.P("Weekend or future day — no Q-calendar status."),
        k.P([new k.TextRun({ text: "Meeting: ", bold: true }), new k.TextRun({ text: `${log.held === "Yes" ? "held" : log.held === "No" ? "not held" : "not logged"}${log.attendees ? ` · ${log.attendees} attendees` : ""}${log.escalated ? ` · escalated to Tier 3: ${log.escalated}` : ""}` })]),
        k.H("Top 3 priorities", 2), ...([log.p1, log.p2, log.p3].filter(Boolean).length ? [log.p1, log.p2, log.p3].filter(Boolean).map((p, i) => k.P(`${i + 1}. ${p}`)) : [k.P(new k.TextRun({ text: "No priority logged.", italics: true, color: C.muted }))]),
        ...(log.remarks ? [k.H("Remarks", 2), k.P(log.remarks)] : []));
    }
    if (on("new")) { body.push(sec("Raised today")); body.push(...itemsTable(k, f.raisedList, ref, lim, { due: false })); }
    if (on("due")) { body.push(sec("Due today & tomorrow")); body.push(...itemsTable(k, f.dueToday, ref, lim)); }
  }


  // ── Tier 1 sections
  const t1ActionsBlocks = () => {
    const fn = f.s1.fn.filter((x) => inPer(x.opened));
    return [k.H("Open actions", 2),
      f.t1open.length ? k.T(["Action", "Officer", "Item", "Priority", "Due"], f.t1open.slice(0, lim || 999).map((a) => [a.id, a.officer || "—", a.desc || "", a.prio || "—", has(a.due) && a.due < ref ? { v: E.dueLabel(a.due, ref), rag: "R" } : E.dueLabel(a.due, ref)]), { widths: [12, 18, 46, 10, 14] }) : none(),
      k.H(`Findings raised (${fn.length})`, 2),
      fn.length ? k.T(["Finding", "Date", "Area", "Finding", "Severity", "Owner", "Status"], fn.slice(0, lim || 999).map((x) => [x.id, fmtDate(x.opened), x.area || "—", x.desc || "", x.sev === "High" ? { v: "High", rag: "R" } : x.sev || "—", x.owner || "—", x.status || "—"]), { widths: [10, 10, 14, 34, 10, 12, 10] }) : none()];
  };
  const t1EscBlock = () => (f.t1esc.length ? k.T(["Action", "Officer", "Item", "Due"], f.t1esc.map((a) => [a.id, a.officer || "—", a.desc || "", { v: E.dueLabel(a.due, ref), rag: a.due < ref ? "R" : "A" }]), { widths: [14, 18, 50, 18] }) : none());
  const t1KpiTable = () => k.T(["Pillar", "KPI", "Actual", "Target", "Status"], f.k1.kpis.map((x) => [x.pillar, x.name, fmtKpi(x.actual, x.unit), x.targetText, { v: RAG_WORD[x.rag], rag: x.rag }]), { right: [2] });
  const t1TeamTable = () => { const team = E.t1Team(s1, ref); return team.length ? k.T(["Officer", "Days", "Line clear.", "Records", "Lead (d)", "Findings", "Open actions", "Overdue", "Status"],
    team.map((x) => [{ v: x.name, bold: true }, x.days, x.lc, x.records, fmtNum(x.lead), x.findings, x.open, x.late, { v: x.status === "G" ? "On track" : x.status === "A" ? "Watch" : "Action needed", rag: x.status }]), { right: [1, 2, 3, 4, 5, 6, 7] }) : k.P("No officer in the Tier 1 roster yet."); };
  if (on("t1summary")) {
    const counts = E.t1PillarCounts(f.t1days);
    const reds = f.k1.kpis.filter((x) => x.rag === "R");
    body.push(sec("Tier 1 summary"),
      k.P([new k.TextRun({ text: "Board health ", bold: true }), new k.TextRun({ text: `${f.k1.health.score === "" ? "—" : pct(f.k1.health.score)} — ${f.k1.health.g} green, ${f.k1.health.a} amber, ${f.k1.health.r} red of 20 KPIs.` })]),
      k.P([new k.TextRun({ text: "Red-letter days: ", bold: true }), new k.TextRun({ text: E.PILLARS.map((p) => `${p.key} ${counts[p.key].r}`).join(" · ") + "." })]),
      ...(reds.length ? [k.P([new k.TextRun({ text: "Off target: ", bold: true }), new k.TextRun({ text: reds.map((x) => `${x.name} ${fmtKpi(x.actual, x.unit)} (target ${x.targetText})`).join("; ") + "." })])] : []),
      k.B(`${f.t1open.length} open action${f.t1open.length === 1 ? "" : "s"}, ${t1overdue.length} overdue · ${f.t1esc.length} escalated to Tier 2.`),
      k.B(`${f.s1.fn.filter((x) => inPer(x.opened)).length} findings raised in the month · ${f.flags1} record${f.flags1 === 1 ? "" : "s"} flagged by the data check.`));
  }
  if (type !== "monthly" && on("t1week") && type === "weekly") body.push(sec(`SQDCP week — ${per.label}`), lettersTable(k, f, f.t1days.filter((x) => inPer(x.date))), k.H("KPIs month to date", 2), t1KpiTable());
  if (type === "weekly" && on("t1team")) body.push(sec("Team performance (month to date)"), t1TeamTable());
  if (type !== "monthly" && on("t1actions")) body.push(sec("Open actions & findings"), ...t1ActionsBlocks());
  if (on("t1esc")) body.push(sec("Escalated to Tier 2"), t1EscBlock());

  // ── weekly
  if (type === "weekly") {
    if (on("glance")) body.push(sec(`The week in numbers — ${per.label}`), ...numbersTable(k, f, "last week"));
    if (on("kpis")) body.push(sec("Tier 2 KPIs (month to date)"), kpiTable(k, f));
    if (on("qweek")) {
      const days = f.cal.filter((x) => x.date >= per.from && x.date <= per.to);
      const t1w = f.t1days.filter((x) => x.date >= per.from && x.date <= per.to);
      body.push(sec("Q-calendar & SQDCP week"),
        k.T(["Date", ...E.T2_PROCESSES.map((p) => p.label), "Overall"], days.map((x) => [fmtDate(x.date), ...x.procs.map((p) => (x.weekend ? "W" : { v: p.status || "—", rag: p.code === 3 ? "R" : p.code === 2 ? "A" : p.code === 1 ? "G" : "N" })), x.weekend ? "Weekend" : { v: x.status || "—", rag: x.code === 3 ? "R" : x.code === 2 ? "A" : x.code === 1 ? "G" : "N" }])),
        k.P(days.length < 7 ? "Days of the week outside the reporting month are not shown on the Q-calendar." : ""),
        ...(hasTier("t1") ? [k.H("Tier 1 SQDCP letters", 2), lettersTable(k, f, t1w)] : []));
    }
    if (on("next7")) { /* placed after overdue below */ }
  }

  // ── shared: overdue, due next 7, load, escalations
  if ((type === "daily" || type === "weekly") && on("overdue")) { body.push(sec("Overdue items")); body.push(...itemsTable(k, f.overdue, ref, lim)); }
  if (type === "weekly" && on("next7")) { body.push(sec("Due in the next 7 days")); body.push(...itemsTable(k, f.dueNext, ref, lim)); }
  if (type === "weekly" && on("load")) body.push(sec(`QA load — ${fmtMonth(per.month)}`), loadTable(k, f));
  if ((type === "daily" || type === "weekly") && on("esc")) {
    body.push(sec("Escalations"), k.H("Tier 2 → Tier 3 (register 10)", 2), ...itemsTable(k, f.esc3, ref, lim),
      k.H(hasTier("t1") ? "Tier 1 → Tier 2 (huddle actions)" : "Tier 1 → Tier 2 (register 10·A)", 2), t1EscBlock());
  }

  // ── monthly
  if (type === "monthly") {
    if (on("summary")) {
      onStep("Executive summary…");
      const reds = f.kpis.filter((x) => x.rag === "R");
      body.push(sec("Executive summary"),
        k.P([new k.TextRun({ text: "Quality Pulse ", bold: true }), new k.TextRun({ text: `${f.pulse.score === "" ? "—" : pct(f.pulse.score)} — ${f.pulse.g} KPIs on target, ${f.pulse.a} on watch, ${f.pulse.r} off target${f.pulse.n ? `, ${f.pulse.n} without data` : ""}.` })]),
        ...(hasTier("t1") ? [k.P([new k.TextRun({ text: "Tier 1 board health ", bold: true }), new k.TextRun({ text: `${f.k1.health.score === "" ? "—" : pct(f.k1.health.score)} — ${f.k1.health.g} green, ${f.k1.health.a} amber, ${f.k1.health.r} red of 20 KPIs.` })])] : [k.P([new k.TextRun({ text: "From Tier 1 ", bold: true }), new k.TextRun({ text: `${f.t1esc.length} open escalation${f.t1esc.length === 1 ? "" : "s"} (register 10·A).` })])]),
        ...(reds.length ? [k.P([new k.TextRun({ text: "Off target: ", bold: true }), new k.TextRun({ text: reds.map((x) => `${x.name} ${fmtKpi(x.actual, x.unit)} (target ${x.targetText})`).join("; ") + "." })])] : []),
        k.H("Overdue as of the report date", 2),
        ...REGS.filter((r) => f.s2[r]?.length).map((r) => k.B(`${f.overdueN[r]} ${label(r)} overdue (of ${f.open[r]} open)`)),
        k.B(`QA team utilisation ${f.util === "" ? "—" : pct(f.util)} — ${f.comp.load.reduce((a, c) => a + c.delayed, 0)} delayed tasks.`),
        k.B(`${f.flags} record${f.flags === 1 ? "" : "s"} flagged by the data check.`),
        ...(st.remarks ? [k.H("Monthly remarks", 2), k.P(st.remarks)] : []));
    }
    if (on("month")) body.push(sec(`The month in numbers — ${fmtMonth(per.month)}`), ...numbersTable(k, f, fmtMonth(per.prevFrom)));
    if (on("kpis")) body.push(sec("Tier 2 KPIs"), kpiTable(k, f));
  }

  if (on("charts")) {
    const t2 = hasTier("t2"), t1 = hasTier("t1");
    const which = type === "daily" ? { qcal: t2, t1 } : type === "weekly" ? { qcal: t2, charts: t2 ? ["flow", "ageing", "overdueowner", "mix"] : null, t1 } : { qcal: t2, charts: t2, t1, t1activity: t1 };
    const shots = await captureCharts(per, F, which, (c) => onStep(`Rendering chart: ${c}`));
    body.push(sec(type === "daily" ? "Pictures of the boards" : "Charts"));
    for (const sh of shots) body.push(...(await picture(d, sh.blob, sh.caption)));
  }

  if (type === "monthly") {
    const s2 = f.s2, comp = f.comp;
    const regSection = (key, title, cols) => {
      const rows = s2[key] || [], c = comp[key] || [];
      return [sec(title), k.P([new k.TextRun({ text: `${rows.length} records · `, bold: true }), new k.TextRun({ text: statusMix(rows, c) })]), ...openTable(k, rows, c, ref, lim, cols)];
    };
    const late = (r, c) => (c.live === "Overdue" ? { v: `${daysLate(r.due, ref)} d late`, rag: "R" } : c.toDue === "" ? "—" : `in ${c.toDue} d`);
    if (on("dev")) body.push(...regSection("dev", "Quality events (deviations)", [["Ref.", (r) => r.id], ["Opened", (r) => fmtDate(r.opened)], ["Event", (r) => r.desc, false, 30], ["Class", (r) => r.cls], ["Owner", (r) => r.owner], ["Status", (r) => r.status], ["Due", (r) => fmtDate(r.due)], ["Overdue", late], ["Actions", (r, c) => (c.actions ? `${c.actions.open} open / ${c.actions.total}` : "—")]]));
    if (on("capa")) body.push(...regSection("capa", "CAPA", [["Ref.", (r) => r.id], ["Opened", (r) => fmtDate(r.opened)], ["CAPA", (r) => r.desc, false, 30], ["Source", (r) => r.source], ["Owner", (r) => r.owner], ["Status", (r) => r.status], ["Due", (r) => fmtDate(r.due)], ["Overdue", late], ["Actions", (r, c) => (c.actions ? `${c.actions.open} open / ${c.actions.total}` : "—")]]));
    if (on("cc")) body.push(...regSection("cc", "Change control", [["Ref.", (r) => r.id], ["Raised", (r) => fmtDate(r.opened)], ["Change", (r) => r.desc, false, 30], ["Type", (r) => r.type], ["Class", (r) => r.cat], ["Owner", (r) => r.owner], ["Status", (r) => r.status], ["Target", (r) => fmtDate(r.due)], ["Overdue", late]]));
    if (on("act") && !s2.act?.length) body.push(sec("eQMS actions"), k.P(new k.TextRun({ text: "No eQMS action recorded.", italics: true, color: C.muted })));
    if (on("act") && s2.act?.length) {
      const rows = s2.act, c = comp.act;
      const byOwner = {};
      rows.forEach((r, i) => { if (!c[i].open) return; const o = r.owner || "—"; byOwner[o] ??= { open: 0, over: 0 }; byOwner[o].open++; if (c[i].live === "Overdue") byOwner[o].over++; });
      body.push(sec("eQMS actions"), k.P([new k.TextRun({ text: `${rows.length} actions · `, bold: true }), new k.TextRun({ text: statusMix(rows, c) })]),
        k.H("Open actions by owner", 2),
        k.T(["Owner", "Open", "Overdue"], Object.entries(byOwner).sort((a, b) => b[1].over - a[1].over || b[1].open - a[1].open).slice(0, lim || 999).map(([o, x]) => [o, x.open, x.over ? { v: x.over, rag: "R" } : 0]), { right: [1, 2] }),
        k.H("Overdue actions", 2),
        ...openTable(k, rows.filter((_, i) => c[i].live === "Overdue"), c.filter((x) => x.live === "Overdue"), ref, lim, [["Action", (r) => r.id], ["Parent", (r) => r.parent], ["Action", (r) => r.desc, false, 34], ["Owner", (r) => r.owner], ["Due", (r) => fmtDate(r.due)], ["Overdue", late]]));
    }
    if (on("audits")) {
      const A = s2.aud || [], Fd = s2.find || [], ca = comp.aud || [], cf = comp.find || [];
      const audits = A.filter((r) => r.kind !== "Plan");
      const byCls = ["Critical", "Major", "Minor"].map((cl) => { const rows = Fd.map((r, i) => ({ r, c: cf[i] })).filter((x) => x.r.cls === cl); return [cl, rows.length, rows.filter((x) => x.c.open).length, rows.filter((x) => x.c.live === "Overdue").length]; });
      body.push(sec("Audits & findings"),
        k.P(`${A.filter((r) => r.kind === "Plan").length} audit plans · ${audits.length} audits (${statusMix(audits, ca.filter((_, i) => A[i].kind !== "Plan"))}) · ${Fd.length} findings.`),
        k.H("Findings by classification", 2),
        k.T(["Classification", "Findings", "Open", "Overdue"], byCls.map(([cl, n, o, x]) => [{ v: cl, bold: true }, n, o, x ? { v: x, rag: "R" } : 0]), { right: [1, 2, 3] }),
        k.H("Open audits", 2),
        ...openTable(k, audits, ca.filter((_, i) => A[i].kind !== "Plan"), ref, lim, [["Audit", (r) => r.id], ["Type", (r) => r.type], ["Auditee / scope", (r) => r.desc, false, 30], ["Lead", (r) => r.owner], ["Status", (r) => r.status], ["Due", (r) => fmtDate(r.due)], ["Findings", (r, c) => (c.findings ? `${c.findings.open} open / ${c.findings.total}` : "—")]]),
        k.H("Open findings", 2),
        ...openTable(k, Fd, cf, ref, lim, [["Finding", (r) => r.id], ["Audit", (r) => r.audit], ["Finding", (r) => r.desc, false, 32], ["Class", (r) => r.cls], ["Owner", (r) => r.owner], ["Due", (r) => fmtDate(r.due)], ["Overdue", late], ["CAPA", (r, c) => (c.capa ? c.capa.join(", ") : "—")]]));
    }
    if (on("rel")) {
      const rows = s2.rel, c = comp.rel, released = rows.filter((r) => r.status === "Released").length;
      body.push(sec("Batch release"), k.P(`${rows.length} batches · ${released} released · ${c.filter((x) => x.late === "Yes").length} released late · ${c.filter((x) => x.live === "Overdue").length} past the ${st.brTarget}-day target without a decision.`),
        ...openTable(k, rows, c, ref, lim, [["Batch", (r) => r.id], ["Product", (r) => r.product, false, 24], ["Mfg completion", (r) => fmtDate(r.mfg)], ["Target", (r, x) => fmtDate(x.target)], ["Status", (r, x) => (x.live === "Overdue" ? { v: "Overdue", rag: "R" } : r.status)], ["Lead (d)", (r, x) => x.lead, true]]));
    }
    if (on("rej")) {
      const rows = s2.rej || [], c = comp.rej || [];
      const byType = {};
      rows.forEach((r) => { const t = r.ptype || "—"; byType[t] ??= { n: 0, kg: 0, open: 0 }; byType[t].n++; byType[t].kg += +r.kg || 0; if (r.status !== "Closed") byType[t].open++; });
      body.push(sec("Rejections"), k.P(`${rows.length} rejection reports · ${statusMix(rows, c)} · ${fmtNum(rows.reduce((a, r) => a + (+r.kg || 0), 0))} kg rejected in all.`),
        k.T(["Type", "Reports", "Not closed", "Quantity (kg)"], Object.entries(byType).sort((a, b) => b[1].n - a[1].n).map(([t, x]) => [{ v: t, bold: true }, x.n, x.open ? { v: x.open, rag: "A" } : 0, fmtNum(x.kg)]), { right: [1, 2, 3] }),
        k.H("Not closed", 2),
        ...openTable(k, rows, c, ref, lim, [["Report", (r) => r.id], ["Product / material", (r) => r.product, false, 26], ["Batch", (r) => r.batch], ["Qty", (r) => r.qty], ["Reason", (r) => r.reason, false, 22], ["Status", (r) => r.status], ["Raised", (r) => fmtDate(r.opened)]]));
    }
    if (on("apqr")) {
      const rows = s2.apqr, c = comp.apqr;
      body.push(sec("APQR"), k.P(`${rows.length} products · ${statusMix(rows, c)} · average completion ${pct(c.reduce((a, x) => a + x.effPct, 0) / (c.length || 1))}.`),
        ...openTable(k, rows.filter((_, i) => c[i].live === "Overdue"), c.filter((x) => x.live === "Overdue"), ref, lim, [["APQR", (r) => r.id], ["Product", (r) => r.product, false, 24], ["Period", (r) => r.period], ["Due", (r) => fmtDate(r.due)], ["% complete", (r) => pct(r.pct), true], ["Overdue", late]]));
    }
    if (on("load")) body.push(sec(`QA load — ${fmtMonth(per.month)}`), k.P("Workload is calculated: the standard effort of every record each person owns, spread over its dates, counted for the month."), loadTable(k, f));
    if (on("t1actions")) body.push(sec("Open actions & findings"), ...t1ActionsBlocks());
    if (on("t1")) {
      const counts = E.t1PillarCounts(f.t1days);
      const team = E.t1Team(s1, ref);
      body.push(sec(`Tier 1 huddle board — ${fmtLong(ref)}`),
        k.H("SQDCP days this month", 2),
        k.T(["Pillar", "Green", "Amber", "Red", "No data"], E.PILLARS.map((p) => [{ v: `${p.key} · ${p.name}`, bold: true }, counts[p.key].g, counts[p.key].a, counts[p.key].r ? { v: counts[p.key].r, rag: "R" } : 0, counts[p.key].n]), { right: [1, 2, 3, 4] }),
        k.H("KPIs month to date", 2),
        k.T(["Pillar", "KPI", "Actual", "Target", "Status"], f.k1.kpis.map((x) => [x.pillar, x.name, fmtKpi(x.actual, x.unit), x.targetText, { v: RAG_WORD[x.rag], rag: x.rag }]), { right: [2] }),
        k.H("Team performance", 2),
        team.length ? k.T(["Officer", "Days", "Line clear.", "Records", "Lead (d)", "Findings", "Open actions", "Overdue", "Status"],
          team.map((r) => [{ v: r.name, bold: true }, r.days, r.lc, r.records, fmtNum(r.lead), r.findings, r.open, r.late, { v: r.status === "G" ? "On track" : r.status === "A" ? "Watch" : "Action needed", rag: r.status }]), { right: [1, 2, 3, 4, 5, 6, 7] }) : k.P("No officer in the Tier 1 roster yet."));
    }
    if (on("quality")) {
      const c1 = E.t1Computed(s1, ref);
      const rows = [...Object.entries(hasTier("t2") ? f.comp : {}).filter(([r]) => T2_REGISTERS[r]).map(([r, c]) => ["Tier 2", T2_REGISTERS[r].title, (f.s2[r] || []).length, E.flagged(c)]),
        ...Object.entries(hasTier("t1") ? c1 : {}).filter(([r]) => T1_REGISTERS[r]).map(([r, c]) => ["Tier 1", T1_REGISTERS[r].title, (s1[r] || []).length, E.flagged(c)])];
      body.push(sec("Data quality"), k.P("Records the data check flags (a missing status, closure date or a date order problem). A KPI is only as good as these records."),
        k.T(["Tier", "Register", "Records", "Flagged"], rows.map(([t, n, total, fl]) => [t, n, total, fl ? { v: fl, rag: "R" } : { v: 0, rag: "G" }]), { right: [2, 3] }));
    }
  }

  if (on("notes")) body.push(sec("Commentary"), ...notesBlocks(k, opts.notes, type === "monthly" ? "Focus for next month" : type === "weekly" ? "Focus for next week" : "Focus for tomorrow"));
  if (on("signoff")) body.push(sec("Sign-off"), ...signoff(k, opts.sign));
  if (type === "monthly" && on("appendix")) {
    body.push(sec("Definitions & sources"),
      k.T(["Tier 2 KPI", "Definition", "Target", "Amber limit"], f.s2.kpis.map((x) => [x.name, x.def, E.targetText(x), x.unit === "%" ? pct(x.amber) : x.amber])),
      k.P(""), k.P("RAG: ‘Higher’ KPIs are green at or above target, amber at or above the amber limit, otherwise red; ‘Lower’ KPIs the reverse. Quality Pulse and board health = (green + ½ amber) ÷ (green + amber + red). A KPI with no source data reads ‘No data’."),
      k.P(`Data as of ${fmtLong(ref)}. Registers mirror the eQMS and the site's own exports; the eQMS remains the GMP record.`));
  }
  if (type === "monthly" && on("t1defs")) {
    body.push(sec("Tier 1 KPI definitions"),
      k.T(["Pillar", "KPI", "Definition", "Target", "Amber limit"], s1.kpis.map((x) => [x.pillar, x.name, x.def, E.targetText(x), x.unit === "%" ? pct(x.amber) : x.amber]), { widths: [10, 24, 40, 13, 13] }),
      k.P(""), k.P("SQDCP letters: each day, each pillar is green, amber or red from the officers' daily log; the huddle can override a day. Board health = (green + ½ amber) ÷ (green + amber + red) of the 20 KPIs."),
      k.P(`Data as of ${fmtLong(ref)}, from the officers' daily log, batch-record reviews, findings, actions, the huddle log and training.`));
  }

  onStep("Writing the document…");
  const headerText = `${site} · ${TIER_WORD}${T.label} · ${per.label}${docNo ? ` · ${docNo}` : ""}`;
  const doc = new d.Document({
    creator: EDITION.name, title: `${TIER_WORD}${T.label} ${per.label}`, description: site,
    styles: {
      default: { document: { run: { font: "Calibri", size: 20, color: C.ink } } },
      paragraphStyles: [
        { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", run: { size: 30, bold: true, color: C.navy }, paragraph: { spacing: { before: 360, after: 120 } } },
        { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", run: { size: 23, bold: true, color: C.accent }, paragraph: { spacing: { before: 240, after: 100 } } },
      ],
    },
    sections: [{
      properties: { page: { margin: { top: 1000, bottom: 1000, left: 1000, right: 1000 } } },
      headers: { default: new d.Header({ children: [new d.Paragraph({ alignment: d.AlignmentType.RIGHT, children: [new d.TextRun({ text: headerText, size: 16, color: C.muted })] })] }) },
      footers: { default: new d.Footer({ children: [new d.Paragraph({ alignment: d.AlignmentType.CENTER, children: [new d.TextRun({ children: [`${opts.classification || "Internal"} · v${opts.version || "1.0"} · Page `, d.PageNumber.CURRENT, " of ", d.PageNumber.TOTAL_PAGES], size: 16, color: C.muted })] })] }) },
      children: body,
    }],
  });
  return d.Packer.toBlob(doc);
}

function loadTable(k, f) {
  if (!f.s2.load.length) return k.P(new k.TextRun({ text: "No team member in register 07 · QA load yet.", italics: true, color: C.muted }));
  return k.T(["Team member", "Position", "Available (d)", "Workload (pd)", "Utilisation", "Delayed", "Status"],
    f.s2.load.map((r, i) => { const c = f.comp.load[i]; return [{ v: r.member, bold: true }, r.role, fmtNum(c.available), fmtNum(c.workload), pct(c.util), c.delayed, { v: c.status || "—", rag: c.status === "Overloaded" ? "R" : c.status === "High load" ? "A" : c.status ? "G" : "N" }]; }), { right: [2, 3, 4, 5] });
}

/* ── plain-text summary (e-mail, Teams, WhatsApp) ────────── */

export function textSummary(type, per, F = {}, notes = {}) {
  if (ONE_TIER === "t1") return textSummaryT1(type, per, F, notes);
  const f = facts(per, F);
  const st = f.s2.setup;
  const L = [];
  const list = (arr, n = 8) => arr.slice(0, n).map((x) => `  • ${x.r.id || x.r.member || label(x.reg)} (${label(x.reg)}) — ${descOf(x.r).slice(0, 80)}${x.r[OWNER_KEY[x.reg]] ? ` — ${x.r[OWNER_KEY[x.reg]]}` : ""}${has(f.dueOf(x)) ? ` — due ${fmtDate(f.dueOf(x))}` : ""}`).concat(arr.length > n ? [`  • … and ${arr.length - n} more`] : []);
  const fd = describe({ ...F, period: "all" });
  L.push(`${TYPES[type].label.toUpperCase()} — ${per.label}`, `${st.site || ""}${fd.length ? ` · ${fd.join(" · ")}` : ""}`, "");
  L.push(`Quality Pulse ${f.pulse.score === "" ? "—" : pct(f.pulse.score)} (${f.pulse.g} on target · ${f.pulse.a} watch · ${f.pulse.r} off target)${hasTier("t1") ? ` · Tier 1 health ${f.k1.health.score === "" ? "—" : pct(f.k1.health.score)}` : ""}`);
  if (type === "daily") {
    const day = f.t1days.find((x) => x.date === per.ref);
    const t = E.t1Today(f.ctx);
    const lg = f.s2.daily[per.ref] || {};
    if (!hasTier("t1") && (lg.t1held || lg.t1red || lg.t1safety)) L.push(`Tier 1 huddle: ${lg.t1held === "Yes" ? "held" : lg.t1held === "No" ? "not held" : "—"} · red letters ${lg.t1red || "none"}${lg.t1safety ? ` · safety: ${lg.t1safety}` : ""}`);
    if (day && hasTier("t1")) L.push(`Tier 1 SQDCP: ${E.PILLARS.map((p) => `${p.key} ${({ 1: "🟢", 2: "🟡", 3: "🔴", 7: "⚪", 8: "—" })[day.codes[p.key]] || "·"}`).join("  ")} · present ${t.present}/${t.roster} · actions overdue ${t.overdue}`);
    const c = f.cal.find((x) => x.date === per.ref);
    if (c && !c.weekend) L.push(`Tier 2 Q-calendar: ${c.status || "—"} (${c.procs.map((p) => `${p.label} ${p.status || "—"}`).join(" · ")})`);
    const log = f.s2.daily[per.ref] || {};
    const top = [log.p1, log.p2, log.p3].filter(Boolean);
    L.push("", "Top 3 priorities:", ...(top.length ? top.map((p, i) => `  ${i + 1}. ${p}`) : ["  (none logged)"]));
    L.push("", `Raised today (${f.raisedList.length}):`, ...(f.raisedList.length ? list(f.raisedList) : ["  none"]));
    L.push("", `Due today & tomorrow (${f.dueToday.length}):`, ...(f.dueToday.length ? list(f.dueToday) : ["  none"]));
  } else {
    L.push("", `${type === "weekly" ? "This week" : "This month"} — raised / closed (previous):`);
    for (const r of REGS.filter((x) => f.s2[x]?.length || f.raised[x])) L.push(`  • ${label(r)}: ${f.raised[r]} raised (${f.raisedPrev[r]}) · ${f.closed[r]} closed (${f.closedPrev[r]}) · ${f.open[r]} open · ${f.overdueN[r]} overdue`);
    const reds = f.kpis.filter((x) => x.rag === "R");
    if (reds.length) L.push("", "Off-target KPIs:", ...reds.map((x) => `  • ${x.name}: ${fmtKpi(x.actual, x.unit)} vs ${x.targetText}`));
    if (type === "weekly") L.push("", `Due in the next 7 days (${f.dueNext.length}):`, ...(f.dueNext.length ? list(f.dueNext) : ["  none"]));
  }
  L.push("", `Overdue (${f.overdue.length}):`, ...(f.overdue.length ? list(f.overdue, 10) : ["  none 🎉"]));
  if (f.esc3.length || f.t1esc.length) L.push("", `Escalations: ${f.esc3.length} open to Tier 3 · ${f.t1esc.length} open from Tier 1`);
  for (const [key, title] of NOTES) if ((notes[key] || "").trim()) L.push("", `${title}:`, ...notes[key].trim().split("\n").map((l) => `  ${l.replace(/^[-•*]\s*/, "• ")}`));
  L.push("", `— ${EDITION.name} · data as of ${fmtDate(per.ref)} · the eQMS remains the record of truth`);
  return L.join("\n");
}

/** The summary of a Tier 1 app: the shop floor only. */
function textSummaryT1(type, per, F = {}, notes = {}) {
  const f = facts(per, F);
  const s1 = f.s1, L = [];
  const inPer = (dt) => has(dt) && dt >= per.from && dt <= per.to;
  const dot = { 1: "🟢", 2: "🟡", 3: "🔴", 7: "⚪", 8: "—" };
  L.push(`QA TIER 1 · ${TYPES[type].label.toUpperCase()} — ${per.label}`, `${s1.setup.site || ""}${f.officer !== "All team" ? ` · ${f.officer}` : ""}`, "");
  L.push(`Board health ${f.k1.health.score === "" ? "—" : pct(f.k1.health.score)} (${f.k1.health.g} green · ${f.k1.health.a} amber · ${f.k1.health.r} red of 20 KPIs)`);
  if (type === "daily") {
    const day = f.t1days.find((x) => x.date === per.ref);
    const t = E.t1Today(f.ctx);
    if (day) L.push(`SQDCP today: ${E.PILLARS.map((p) => `${p.key} ${dot[day.codes[p.key]] || "·"}`).join("  ")}`);
    L.push(`Present ${t.present}/${t.roster} · line clearances ${t.lc}${t.lcf ? ` (${t.lcf} failed)` : ""} · records reviewed ${t.reviewed} · findings ${t.findings} · actions overdue ${t.overdue} · due today ${t.dueToday}`);
    const hd = s1.hd.find((h) => h.date === per.ref);
    if (hd) L.push("", "Huddle priorities:", ...[hd.p1, hd.p2, hd.p3].filter(Boolean).map((p, i) => `  ${i + 1}. ${p}`));
  } else {
    const days = f.t1days.filter((x) => inPer(x.date));
    L.push(`Red-letter days: ${E.PILLARS.map((p) => `${p.key} ${days.filter((x) => x.codes[p.key] === 3).length}`).join(" · ")}`);
    const reds = f.k1.kpis.filter((x) => x.rag === "R");
    if (reds.length) L.push("", "Off-target KPIs:", ...reds.map((x) => `  • ${x.pillar} · ${x.name}: ${fmtKpi(x.actual, x.unit)} vs ${x.targetText}`));
  }
  const over = f.t1open.filter((a) => has(a.due) && a.due < per.ref);
  L.push("", `Open actions (${f.t1open.length}, ${over.length} overdue):`, ...(f.t1open.length ? f.t1open.slice(0, 10).map((a) => `  • ${a.id} — ${String(a.desc || "").slice(0, 80)} — ${a.officer || "—"} — ${E.dueLabel(a.due, per.ref)}`) : ["  none 🎉"]));
  if (f.t1esc.length) L.push("", `Escalated to Tier 2 (${f.t1esc.length}):`, ...f.t1esc.map((a) => `  • ${a.id} — ${String(a.desc || "").slice(0, 80)} — ${a.officer || "—"}`));
  const fn = s1.fn.filter((x) => inPer(x.opened));
  if (fn.length) L.push("", `Findings raised (${fn.length}):`, ...fn.slice(0, 8).map((x) => `  • ${x.id} — ${String(x.desc || "").slice(0, 70)}${x.sev ? ` — ${x.sev}` : ""}`));
  for (const [key, title] of NOTES) if ((notes[key] || "").trim()) L.push("", `${title}:`, ...notes[key].trim().split("\n").map((l) => `  ${l.replace(/^[-•*]\s*/, "• ")}`));
  L.push("", `— ${EDITION.name} · data as of ${fmtDate(per.ref)}`);
  return L.join("\n");
}

/* ── routine checklists (shared with the team) ───────────── */

export const ROUTINES = {
  daily: [
    ["t1log", "Tier 1 daily log entered for every officer present", "08:00–08:25 · register A", (f) => f.s1.dl.filter((r) => r.date === f.per.ref).length >= Math.max(1, f.s1.roster.length), "t1"],
    ["huddle", "Tier 1 huddle held and logged", "08:30 · register E", (f) => f.s1.hd.some((h) => h.date === f.per.ref && h.held === "Yes"), "t1"],
    ["reds", "Every red letter has an action with an owner and a due date", "Tier 1 actions register", null, "t1"],
    ["t1esc", "What the huddle cannot solve handed to the 10:30 stand-up", "Tier 1 actions · escalated to Tier 2", null, "t1"],
    ["t1in", "Tier 1 headlines and escalations entered", "Daily Log (huddle held, red letters, safety) · register 10·A", (f) => !!(f.s2.daily[f.per.ref] || {}).t1held, "t2solo"],
    ["t2log", "Tier 2 Daily Log: meeting, attendees and Top 3 priorities", "10:30 · Daily Log", (f) => { const l = f.s2.daily[f.per.ref] || {}; return !!(l.held && l.p1); }, "t2"],
    ["registers", "New events of the day entered in the registers", "Deviations, CAPA, changes, inspections, actions", null, "t2"],
    ["overrides", "Every manual Q-calendar override justified in the remarks", "Daily Log", null, "t2"],
    ["escal", "Escalations to Tier 3 raised the same day", "Register 10", null, "t2"],
    ["sent", "Daily report or summary sent to the QA manager", "Reports → Daily", null],
  ],
  weekly: [
    ["import", "Latest Scigeniq exports imported", "Import from Scigeniq", (f) => { const h = store.t2.imports?.[0]; return !!h && E.diffDays(f.per.ref, h.at.slice(0, 10)) <= 7; }, "t2"],
    ["flags", "Data-check flags cleared in every register", "Each register's ⚠ strip", (f) => (hasTier("t2") ? f.flags : 0) + (hasTier("t1") ? f.flags1 : 0) === 0],
    ["actions", "Every open Tier 1 action reviewed — overdue ones re-planned", "Tier 1 actions register", (f) => !f.t1open.some((a) => has(a.due) && a.due < f.per.ref), "t1"],
    ["findings", "Findings of the week closed or actioned", "Tier 1 findings register", null, "t1"],
    ["overdue", "Every overdue item reviewed with its owner — new date or escalation", "Analytics → Overdue items by person", (f) => f.overdue.length === 0, "t2"],
    ["next", "Items due next week confirmed with their owners", "Reports → Weekly → Due next 7 days", null, "t2"],
    ["load", "QA load reviewed — work reassigned above the threshold", "Register 07 · QA load", null, "t2"],
    ["trend", "Raised vs closed and ageing reviewed — backlog trend named", "Analytics charts 9 and 10", null, "t2"],
    ["skills", "Tier 1 skills / training gaps reviewed", "Skills matrix", null, "t1"],
    ["sent", "Weekly review filed and sent", "Reports → Weekly", null],
  ],
};

const routineShown = (tier) => !tier || (tier === "t2solo" ? ONE_TIER === "t2" : hasTier(tier));
function routineHTML(type, per, f) {
  const done = store[MAIN_TIER].routine?.[per.key] || {};
  return `<div class="check-list">${ROUTINES[type].filter((x) => routineShown(x[4])).map(([key, text, where, auto]) => {
    const a = auto ? auto(f) : null;
    const on = !!done[key];
    return `<label class="check-item ${on ? "on" : ""}"><input type="checkbox" data-routine="${key}" ${on ? "checked" : ""}><span>${esc(text)}<small>${esc(where)}${a === true ? " · ✓ the boards show it is done" : a === false ? " · not yet visible on the boards" : ""}${on ? ` · ticked ${esc(String(done[key]).slice(0, 16).replace("T", " "))}` : ""}</small></span></label>`;
  }).join("")}</div>`;
}

/* ── the page ────────────────────────────────────────────── */

const DEF_SIGN = { prepared: "", preparedRole: "", reviewed: "", reviewedRole: "", approved: "", approvedRole: "" };
export function reportPrefs() {
  const p = store.prefs.reports || {};
  const sec = Object.fromEntries(Object.entries(TYPES).map(([t, T]) => [t, p.sections?.[t] || sectionsOf(T).map(([k]) => k)]));
  return { type: p.type || "daily", date: p.date || "", month: p.month || "", limit: p.limit ?? 40, sections: sec, filters: p.filters || {}, sign: { ...DEF_SIGN, ...(p.sign || {}) }, docNo: p.docNo ?? `QA-${MAIN_TIER.toUpperCase()}-{TYPE}-{PERIOD}`, version: p.version || "1.0", classification: p.classification || "Internal — confidential" };
}
const savePrefs = (p) => { store.prefs.reports = p; store.save(); };
const notesOf = (key) => store.prefs.reportNotes?.[key] || {};
const saveNotes = (key, n) => { store.prefs.reportNotes = { ...(store.prefs.reportNotes || {}), [key]: n }; store.save(); };
export const docNoFor = (p, per) => (p.docNo || "").replace("{TYPE}", { daily: "DR", weekly: "WR", monthly: "MR" }[per.type]).replace("{PERIOD}", per.file.replace(/^week-ending-/, "W"));
export const fileName = (per, site = store[MAIN_TIER].setup.site) => `QA_${ONE_TIER ? `${ONE_TIER === "t1" ? "Tier1" : "Tier2"}_` : ""}${TYPES[per.type].short}_Report_${(site || "site").split(/[—-]/)[0].trim().replace(/\W+/g, "_")}_${per.file}.docx`;

export function renderReportPage(root, { type: forced } = {}) {
  root = fresh(root);
  const p = reportPrefs();
  if (forced && TYPES[forced]) p.type = forced;
  const type = p.type;
  const T = TYPES[type];
  const per = periodOf(type, { date: p.date, month: p.month });
  const f = facts(per, p.filters);
  const notes = notesOf(per.key);
  const over = f.overdue.length;
  const raisedN = Object.values(f.raised).reduce((a, b) => a + b, 0), closedN = Object.values(f.closed).reduce((a, b) => a + b, 0);
  const dateCtl = type === "monthly"
    ? `<label class="fctl"><span>Month</span><input type="month" data-pmonth value="${per.month.slice(0, 7)}"></label>`
    : `<label class="fctl"><span>${type === "daily" ? "Day" : "Week ending on"}</span><input type="date" data-pdate value="${per.ref}"></label>`;
  root.innerHTML = `
    <section class="hero"><div class="hero-grid"><div>
      <div class="eyebrow">Reports centre</div><h1>Daily, weekly & monthly reporting</h1>
      <p>Pick the report, the period and the filters; write the commentary; then create the Word document, copy the summary for an e-mail or chat, and tick the routine of the period. Everything is built from the live boards.</p></div>
      <div class="row"><a class="btn" href="#/close">Month-end close ›</a><a class="btn" href="#/guide">How-to guides ›</a></div></div></section>
    <div class="tabs" role="tablist">${Object.entries(TYPES).map(([t, x]) => `<button role="tab" data-type="${t}" aria-selected="${t === type}">${x.icon} ${x.label}</button>`).join("")}</div>
    <p class="muted" style="margin:-6px 0 14px;max-width:900px">${esc(T.lead)}</p>
    <div class="grid split-wide">
      <div class="stack">
        <div class="card card-pad"><div class="card-head"><h2>Period & filters <span class="sub">${esc(per.label)}</span></h2></div>
          <div class="fgrid" data-rfilters>${dateCtl}${MAIN_TIER === "t1" ? filterControls(p.filters, { tier: "t1", dims: ["owner"], period: false }) : filterControls(p.filters, { dims: ["owner", "area", "product", "cls", "source", "dept"], period: false })}</div>
          <p class="muted" style="margin:8px 0 0;font-size:12px">${type === "monthly" ? `Data as of ${fmtLong(per.ref)} (the ${MAIN_TIER === "t1" ? "board" : "status"} date, kept inside the month).` : `Counted as of ${fmtLong(per.ref)}.`} ${MAIN_TIER === "t1" ? "Pick one officer for that officer's report." : "A filter applies to the registers that record that field."}</p></div>
        <div class="card card-pad"><div class="card-head"><h2>At a glance</h2></div>
          <div class="glance">${ONE_TIER === "t1" ? glanceT1(type, per, f) : `
            <div class="${f.pulse.rag}"><b>${f.pulse.score === "" ? "—" : pct(f.pulse.score)}</b><span>Quality Pulse</span></div>
            ${hasTier("t1") ? `<div class="${f.k1.health.rag}"><b>${f.k1.health.score === "" ? "—" : pct(f.k1.health.score)}</b><span>Tier 1 board health</span></div>` : `<div class="${f.t1esc.length ? "A" : ""}"><b>${f.t1esc.length}</b><span>open escalations from Tier 1</span></div>`}
            <div><b>${raisedN}</b><span>raised ${type === "daily" ? "today" : type === "weekly" ? "this week" : "this month"}</span></div>
            <div><b>${closedN}</b><span>closed ${type === "daily" ? "today" : type === "weekly" ? "this week" : "this month"}</span></div>
            <div class="${over ? "R" : "G"}"><b>${over}</b><span>overdue now</span></div>
            <div><b>${type === "weekly" ? f.dueNext.length : f.dueToday.length}</b><span>${type === "weekly" ? "due next 7 days" : "due today / tomorrow"}</span></div>`}
          </div></div>
        <div class="card card-pad"><div class="card-head"><h2>Commentary <span class="sub">goes into the report and the summary · saved for this period</span></h2></div>
          <div class="form-grid" data-notes>${NOTES.map(([key, title, help]) => `<label class="field full"><span>${esc(key === "focus" ? `Focus for ${type === "monthly" ? "next month" : type === "weekly" ? "next week" : "tomorrow"}` : title)}</span><textarea name="${key}" rows="3" placeholder="${esc(help)}">${esc(notes[key] || "")}</textarea></label>`).join("")}</div></div>
        <div class="card card-pad"><div class="card-head"><h2>Summary to paste <span class="sub">e-mail · Teams · WhatsApp</span></h2><div class="row"><button class="btn sm" data-copytext>⧉ Copy</button><button class="btn sm" data-savetext>⤓ .txt</button></div></div>
          <textarea class="input summary-text" readonly data-summary>${esc(textSummary(type, per, p.filters, notes))}</textarea></div>
      </div>
      <div class="stack">
        <div class="card card-pad" style="border-color:var(--accent)"><div class="card-head"><h2>Word document</h2></div>
          <button class="btn primary" data-make style="font-size:15px;padding:10px 18px;width:100%">⤓ Create the ${esc(T.label.toLowerCase())}</button>
          <div data-progress class="callout" style="margin-top:10px" hidden></div>
          <p class="muted" style="margin:10px 0 0;font-size:12px">File name: <span class="mono">${esc(fileName(per))}</span></p></div>
        ${type === "daily" && MAIN_TIER === "t2" ? `<div class="card card-pad"><div class="card-head"><h2>A3 daily board <span class="sub">print & present</span></h2></div>
          <p class="muted" style="margin:0 0 10px;font-size:13px">Today's dashboard on one A3 landscape page at 300 dpi — for the board wall, the stand-up screen or the Tier 3 meeting.</p>
          <button class="btn" data-a3 style="width:100%">⎙ A3 board — PDF or PNG</button></div>` : ""}
        <div class="card card-pad"><div class="card-head"><h2>Sections</h2><div class="row"><button class="btn sm" data-all>All</button><button class="btn sm" data-none>None</button></div></div>
          <div class="check-list">${sectionsOf(T).map(([key, l, hint]) => `<label class="check-item ${p.sections[type].includes(key) ? "on" : ""}"><input type="checkbox" data-sec="${key}" ${p.sections[type].includes(key) ? "checked" : ""}><span><b>${esc(l)}</b><small>${esc(hint)}</small></span></label>`).join("")}</div>
          <label class="field" style="margin-top:10px"><span>Rows per table</span><select data-limit>${[[15, "15 most urgent"], [40, "40 most urgent"], [100, "100"], [0, "All records"]].map(([v, l]) => `<option value="${v}" ${+p.limit === v ? "selected" : ""}>${l}</option>`).join("")}</select></label></div>
        <div class="card card-pad"><div class="card-head"><h2>Sign-off & document control</h2></div>
          <div class="form-grid" data-sign>
            ${[["prepared", "Prepared by"], ["reviewed", "Reviewed by"], ["approved", "Approved by"]].map(([key, l]) => `<label class="field"><span>${l}</span><input name="${key}" value="${esc(p.sign[key])}" placeholder="Name"></label><label class="field"><span>Position</span><input name="${key}Role" value="${esc(p.sign[`${key}Role`])}" placeholder="e.g. QA Section Head"></label>`).join("")}
            <label class="field"><span>Document no.</span><input name="docNo" value="${esc(p.docNo)}"><small>{TYPE} and {PERIOD} are filled in · now: ${esc(docNoFor(p, per))}</small></label>
            <label class="field"><span>Version</span><input name="version" value="${esc(p.version)}"></label>
            <label class="field full"><span>Classification</span><input name="classification" value="${esc(p.classification)}"></label>
          </div></div>
        ${type === "monthly" ? `<div class="card card-pad"><div class="card-head"><h2>Month-end</h2></div><p class="muted" style="margin:0 0 10px;font-size:13px">${MAIN_TIER === "t1" ? "The monthly report is a step of the month-end close: complete the logs, make this report, archive the board and file the pack." : "The monthly pack is step 6 of the month-end close: freeze the KPIs, make this report, export the charts, archive the boards and roll the month."}</p><a class="btn" href="#/close">Open the month-end close ›</a></div>`
          : `<div class="card card-pad"><div class="card-head"><h2>${type === "daily" ? "Daily" : "Weekly"} routine <span class="sub">shared with the team · ${esc(per.label)}</span></h2></div>${routineHTML(type, per, f)}</div>`}
      </div>
    </div>`;

  const rerender = () => renderReportPage(root);
  $$("[data-type]", root).forEach((b) => b.onclick = () => { const q = reportPrefs(); q.type = b.dataset.type; savePrefs(q); rerender(); });
  const rf = $("[data-rfilters]", root);
  wireControls(rf, (F) => { const q = reportPrefs(); q.filters = F; savePrefs(q); rerender(); });
  $("[data-pdate]", root)?.addEventListener("change", (e) => { const q = reportPrefs(); q.date = e.target.value; savePrefs(q); rerender(); });
  $("[data-pmonth]", root)?.addEventListener("change", (e) => { const q = reportPrefs(); q.month = e.target.value ? `${e.target.value}-01` : ""; savePrefs(q); rerender(); });
  const readNotes = () => Object.fromEntries(NOTES.map(([key]) => [key, $(`[data-notes] [name=${key}]`, root).value]));
  $("[data-notes]", root).addEventListener("input", () => { saveNotes(per.key, readNotes()); $("[data-summary]", root).value = textSummary(type, per, p.filters, readNotes()); });
  $("[data-sign]", root).addEventListener("change", (e) => { const q = reportPrefs(); const n = e.target.name; if (n in q.sign) q.sign[n] = e.target.value.trim(); else q[n] = e.target.value.trim(); savePrefs(q); });
  root.addEventListener("change", (e) => {
    if (e.target.matches("[data-sec], [data-limit]")) {
      const q = reportPrefs();
      q.sections[type] = $$("[data-sec]:checked", root).map((x) => x.dataset.sec);
      q.limit = +$("[data-limit]", root).value;
      savePrefs(q);
      e.target.closest(".check-item")?.classList.toggle("on", e.target.checked);
    }
    if (e.target.matches("[data-routine]")) {
      const key = e.target.dataset.routine;
      store.patch(MAIN_TIER, ["routine", per.key, key], e.target.checked ? new Date().toISOString() : "", `Routine ${per.key}`);
      rerender();
    }
  });
  $("[data-all]", root).onclick = () => { const q = reportPrefs(); q.sections[type] = sectionsOf(T).map(([k2]) => k2); savePrefs(q); rerender(); };
  $("[data-none]", root).onclick = () => { const q = reportPrefs(); q.sections[type] = []; savePrefs(q); rerender(); };
  $("[data-copytext]", root).onclick = () => {
    const t = $("[data-summary]", root);
    navigator.clipboard?.writeText(t.value).then(() => toast("Summary copied — paste it into the e-mail or chat"), () => { t.select(); toast("Press Ctrl + C to copy"); });
  };
  $("[data-savetext]", root).onclick = () => saveFile(fileName(per).replace(/\.docx$/, ".txt"), new Blob([$("[data-summary]", root).value], { type: "text/plain" }));
  $("[data-make]", root).onclick = () => makeReport(root, { type, per });
  $("[data-a3]", root)?.addEventListener("click", () => import("./poster.js").then((m) => m.openA3Export()).catch(() => toast("The A3 export could not be loaded — check the connection")));
}

/** The "at a glance" figures of a Tier 1 app. */
function glanceT1(type, per, f) {
  const inPer = (dt) => has(dt) && dt >= per.from && dt <= per.to;
  const days = f.t1days.filter((x) => inPer(x.date));
  const red = days.reduce((a, x) => a + E.PILLARS.filter((p) => x.codes[p.key] === 3).length, 0);
  const over = f.t1open.filter((a) => has(a.due) && a.due < per.ref).length;
  const logs = f.s1.dl.filter((r) => inPer(r.date)).length;
  return `<div class="${f.k1.health.rag}"><b>${f.k1.health.score === "" ? "—" : pct(f.k1.health.score)}</b><span>board health</span></div>
    <div class="${red ? "R" : "G"}"><b>${red}</b><span>red letters ${type === "daily" ? "today" : type === "weekly" ? "this week" : "this month"}</span></div>
    <div><b>${logs}</b><span>officer-days logged</span></div>
    <div><b>${f.t1open.length}</b><span>open actions</span></div>
    <div class="${over ? "R" : "G"}"><b>${over}</b><span>actions overdue</span></div>
    <div class="${f.t1esc.length ? "A" : ""}"><b>${f.t1esc.length}</b><span>escalated to Tier 2</span></div>`;
}

/** Build and save the report of a type and period with the viewer's settings. */
export async function makeReport(root, { type, per } = {}) {
  const p = reportPrefs();
  type ??= p.type;
  per ??= periodOf(type, { date: p.date, month: p.month });
  if (!p.sections[type].length) { toast("Pick at least one section"); return null; }
  const btn = root ? $("[data-make]", root) : null;
  const prog = root ? $("[data-progress]", root) : null;
  const step = (t) => { if (prog) { prog.hidden = false; prog.textContent = t; } };
  if (btn) btn.disabled = true;
  try {
    const blob = await buildReport({ type, per, sections: p.sections[type], limit: p.limit, filters: p.filters, notes: notesOf(per.key), sign: p.sign, docNo: docNoFor(p, per), version: p.version, classification: p.classification }, step);
    const name = fileName(per);
    step(`Report ready: ${name} (${Math.round(blob.size / 1024)} KB)`);
    if (root) await saveFile(name, blob);
    return { name, blob };
  } catch (e) {
    step(e.message || "The report could not be created");
    toast(e.message || "The report could not be created");
    return null;
  } finally { if (btn) btn.disabled = false; }
}
