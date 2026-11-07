// Month-end close and the archive of month-end boards.
//
// The close is a guided checklist for the last working day: clear the data
// checks, complete the logs, set the as-of date, write the remarks, freeze the
// KPIs, make the monthly pack, export the charts, archive the boards, file
// the pack and roll the month. Each step shows whether the boards already
// show it done; the team's ticks are shared (t2 `close`).
//
// An archive is a frozen copy of both boards at month-end. On the shared
// board it is kept in the database (split into chunks under the document size
// limit) so anyone can re-open that month read-only later; it is also
// downloadable as JSON, and inside the month-end pack (ZIP: Word report +
// chart pictures + register CSVs + JSON + filing instructions).

import { store } from "./store.js";
import * as E from "./engine.js";
import { T1_REGISTERS, T2_REGISTERS, T1_ORDER, T2_ORDER } from "./schema.js";
import * as T1 from "./views-t1.js";
import * as T2 from "./views-t2.js";
import { renderPNG, saveFile, loadZip, slug, pngPrefs } from "./export.js";
import { periodOf, makeReport } from "./report.js";
import { esc, fmtDate, fmtLong, fmtMonth, pct, toast, confirmDialog, fresh, toCSV, today, $, $$ } from "./ui.js";
import { hasTier, ONE_TIER, MAIN_TIER, EDITION } from "./edition.js";

const CHUNK = 90000;
const LOCAL = "qaTiers.archive.";
const has = (v) => v !== "" && v != null;
const strip = (s) => { const c = JSON.parse(JSON.stringify(s)); delete c.audit; return c; };
const siteShort = () => (store[MAIN_TIER].setup.site || "site").split(/[—-]/)[0].trim().replace(/\W+/g, "_");
/** The month this app closes: Tier 2's reporting month, or the month of the Tier 1 board date. */
export const closeMonth = () => (MAIN_TIER === "t2" ? store.t2.setup.month : E.monthStart(store.t1.setup.selDate));
const dataDate = () => (MAIN_TIER === "t2" ? store.t2.setup.statusDate : store.t1.setup.selDate);

/** Headline figures kept with an archive, so the list can show them without loading it. */
function headline() {
  const s = store.t2, comp = hasTier("t2") ? E.t2Computed(s) : {};
  const pulse = hasTier("t2") ? E.t2Kpis(s, comp).pulse : { score: "" };
  const k1 = E.t1Kpis(E.t1Context(store.t1, store.t1.setup.selDate, "All team"));
  const overdue = Object.values(comp).reduce((a, c) => a + c.filter((x) => x.live === "Overdue").length, 0);
  const records = (hasTier("t2") ? T2_ORDER.reduce((a, r) => a + (s[r]?.length || 0), 0) : 0) + (hasTier("t1") ? T1_ORDER.reduce((a, r) => a + (store.t1[r]?.length || 0), 0) : 0);
  return { pulse: pulse.score, health: hasTier("t1") ? k1.health.score : "", overdue, records };
}

export function snapshot(month = closeMonth()) {
  return { app: "qa-tiers", kind: "month-end", version: 1, tiers: EDITION.tiers, month, created: new Date().toISOString(), site: store[MAIN_TIER].setup.site, statusDate: dataDate(), summary: headline(), t1: strip(store.t1), t2: strip(store.t2) };
}

/** Save the month's boards to the archive (shared database, else this browser). */
export async function saveArchive(month = closeMonth(), { note = "" } = {}) {
  const snap = snapshot(month);
  const text = JSON.stringify(snap);
  const m = month.slice(0, 7);
  const meta = { month: m, created: snap.created, site: snap.site, statusDate: snap.statusDate, summary: snap.summary, size: text.length, note };
  const db = store.db;
  if (db && store.sync && !store.sync.readOnly) {
    const parts = Math.ceil(text.length / CHUNK);
    const old = await db.collection("archive").doc(m).get().catch(() => null);
    for (let i = 0; i < parts; i++) await db.collection("archive-parts").doc(`${m}-${i}`).set({ m, i, d: text.slice(i * CHUNK, (i + 1) * CHUNK) });
    const oldParts = old?.exists ? +(old.data().parts || 0) : 0;
    for (let i = parts; i < oldParts; i++) await db.collection("archive-parts").doc(`${m}-${i}`).delete().catch(() => {});
    if (store.user) meta.by = await store.user.id().catch(() => null);
    await db.collection("archive").doc(m).set({ ...meta, parts });
    return { where: "shared", snap };
  }
  try { localStorage.setItem(LOCAL + m, text); return { where: "browser", snap }; }
  catch { return { where: "none", snap }; }
}

export async function listArchives() {
  const out = [];
  const db = store.db;
  if (db) {
    try { (await db.collection("archive").get()).docs.forEach((d) => out.push({ ...d.data(), where: "shared" })); } catch { /* not readable */ }
  }
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k?.startsWith(LOCAL)) continue;
      const m = k.slice(LOCAL.length);
      if (out.some((x) => x.month === m)) continue;
      try { const s = JSON.parse(localStorage.getItem(k)); out.push({ month: m, created: s.created, site: s.site, statusDate: s.statusDate, summary: s.summary, size: localStorage.getItem(k).length, where: "browser" }); } catch { /* skip */ }
    }
  } catch { /* storage blocked */ }
  return out.sort((a, b) => b.month.localeCompare(a.month));
}

export async function loadArchive(month, where) {
  if (where === "browser") return JSON.parse(localStorage.getItem(LOCAL + month));
  const db = store.db;
  const meta = await db.collection("archive").doc(month).get();
  if (!meta.exists) throw new Error("This archive no longer exists");
  const n = +meta.data().parts;
  const parts = await Promise.all(Array.from({ length: n }, (_, i) => db.collection("archive-parts").doc(`${month}-${i}`).get()));
  return JSON.parse(parts.map((p) => p.data()?.d || "").join(""));
}

export async function deleteArchive(month, where) {
  if (where === "browser") { localStorage.removeItem(LOCAL + month); return; }
  const db = store.db;
  const meta = await db.collection("archive").doc(month).get();
  const n = meta.exists ? +meta.data().parts : 0;
  for (let i = 0; i < n; i++) await db.collection("archive-parts").doc(`${month}-${i}`).delete().catch(() => {});
  await db.collection("archive").doc(month).delete();
}

/** Show an archived month read-only. */
export function openSnapshot(snap, navigate) {
  if (!snap?.t1 || !snap?.t2) { toast("This file is not a QA Tier Boards archive"); return; }
  store.enterView(snap.t1, snap.t2, { kind: "archive", label: `Archive · ${fmtMonth(`${String(snap.month).slice(0, 7)}-01`)}`, month: snap.month });
  navigate(`#/${MAIN_TIER}/board`);
  toast(`Viewing the ${fmtMonth(`${String(snap.month).slice(0, 7)}-01`)} archive — read-only`);
}

/* ── the month-end pack ──────────────────────────────────── */

function registerCSV(tier, reg) {
  const sc = (tier === "t1" ? T1_REGISTERS : T2_REGISTERS)[reg];
  const s = store[tier];
  const comp = tier === "t1" ? E.t1Computed(s, s.setup.selDate)[reg] : E.t2Computed(s)[reg];
  const rows = s[reg] || [];
  return "﻿" + toCSV([[...sc.fields.map((f) => f.label), "ƒx Status (live)", "ƒx Data check"],
    ...rows.map((r, i) => [...sc.fields.map((f) => (f.type === "pct" && has(r[f.key]) ? `${Math.round(r[f.key] * 100)}%` : r[f.key] ?? "")), comp?.[i]?.live ?? "", comp?.[i]?.check ?? ""])]);
}

async function chartPictures(onStep) {
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText = "position:fixed;left:-30000px;top:0;width:940px;pointer-events:none";
  const css = document.createElement("style");
  css.textContent = ".pack-host .grid{display:flex!important;flex-direction:column;align-items:stretch}.pack-host .grid>*{height:auto!important}";
  host.className = "pack-host";
  host.append(css);
  document.body.append(host);
  const out = [];
  const p = pngPrefs();
  const grab = async (prefix, render) => {
    host.querySelectorAll(":scope > div").forEach((n) => n.remove());
    const v = document.createElement("div");
    host.append(v);
    render(v);
    await new Promise((r) => setTimeout(r, 60));
    const cards = [...host.querySelectorAll(".card")].filter((c) => c.querySelector("svg.chart, .qcal") && !c.closest("[data-export-block]"));
    const blocks = [...host.querySelectorAll("[data-export-block]")];
    for (const el of [...blocks, ...cards]) {
      const h2 = el.querySelector("h2")?.cloneNode(true);
      h2?.querySelectorAll(".sub, .mono").forEach((n) => n.remove());
      const title = (h2?.textContent || el.querySelector(".ring-label")?.textContent || "chart").trim();
      onStep?.(`Picture: ${title}`);
      out.push({ name: `${prefix}-${String(out.length + 1).padStart(2, "0")}-${slug(title)}.png`, blob: await renderPNG([el], { scale: p.scale, theme: "light", background: "card" }) });
    }
  };
  try {
    if (hasTier("t2")) await grab("tier2-dashboard", (v) => T2.renderBoard(v, { filters: { period: "all" } }));
    if (hasTier("t2")) await grab("tier2-analytics", (v) => T2.renderAnalytics(v, { filters: { period: "all" }, ownFilters: false }));
    if (hasTier("t1")) await grab("tier1-board", (v) => T1.renderBoard(v));
  } finally { host.remove(); }
  return out;
}

/** Everything for the controlled folder in one ZIP. */
export async function monthPack(month = closeMonth(), onStep = () => {}) {
  const JSZip = await loadZip();
  const zip = new JSZip();
  const m = month.slice(0, 7);
  const per = periodOf("monthly", { month });
  onStep("Monthly management pack (Word)…");
  const rep = await makeReport(null, { type: "monthly", per });
  if (rep) zip.file(`01_${rep.name}`, rep.blob);
  const pics = await chartPictures(onStep);
  const dir = zip.folder("02_Charts");
  pics.forEach((x) => dir.file(x.name, x.blob));
  onStep("Register tables (CSV)…");
  const regs = zip.folder("03_Registers");
  if (hasTier("t2")) T2_ORDER.forEach((r, i) => regs.file(`T2-${String(i + 1).padStart(2, "0")}-${slug(T2_REGISTERS[r].title)}.csv`, registerCSV("t2", r)));
  if (hasTier("t1")) T1_ORDER.forEach((r) => regs.file(`T1-${T1_REGISTERS[r].no}-${slug(T1_REGISTERS[r].title)}.csv`, registerCSV("t1", r)));
  zip.file(`04_Boards_snapshot_${m}.json`, JSON.stringify(snapshot(month), null, 1));
  const st = { ...store[MAIN_TIER].setup, statusDate: dataDate() }, y = m.slice(0, 4);
  zip.file("00_README.txt", [
    `QA TIER BOARDS — MONTH-END PACK — ${fmtMonth(`${m}-01`).toUpperCase()}`,
    `${st.site || ""} · data as of ${st.statusDate} · prepared ${today()}`, "",
    "CONTENTS",
    `  01  ${rep?.name || "(the Word report could not be created)"} — the monthly management pack. Print, sign the sign-off table, scan to PDF.`,
    `  02  Charts/ — ${pics.length} pictures (PNG, high resolution): Tier 2 dashboard, analytics, Tier 1 board.`,
    "  03  Registers/ — every register as a CSV table (opens in Excel), with the live status and data check.",
    "  04  Boards snapshot (JSON) — the complete boards at month-end. Re-open read-only in the app: Archive → Open a file;",
    "      or restore: Setup → Import backup.", "",
    "WHERE TO FILE IT",
    `  Controlled folder → QA Tier Boards → ${y} → ${m} ${fmtMonth(`${m}-01`).split(" ")[0]}`,
    "  Keep the signed PDF of the report next to this pack. Do not edit the files after filing: re-issue a new version instead.", "",
    "RETENTION & RECORD STATUS",
    "  Keep the pack for the period of the site's document-retention SOP. The boards are a visual-management aid:",
    "  the eQMS (deviations, CAPA, change control, actions) remains the GMP record of truth.", "",
  ].join("\r\n"));
  onStep("Compressing…");
  const blob = await zip.generateAsync({ type: "blob" });
  const name = `QA_MonthEnd_Pack_${siteShort()}_${m}.zip`;
  return { name, blob };
}

/* ── the close page ──────────────────────────────────────── */

function lastWorkingDay(month, setup) {
  let d = E.monthEnd(month);
  while (E.isWeekend(d, setup) && d > month) d = E.addDays(d, -1);
  return d;
}

/** The month-end close of a Tier 1 app. */
function closeStepsT1() {
  const s = store.t1, st = s.setup, M = E.monthStart(st.selDate);
  const c1 = E.t1Computed(s, st.selDate);
  const flags1 = Object.entries(c1).reduce((a, [r, c]) => a + (T1_REGISTERS[r] ? E.flagged(c) : 0), 0);
  const lwd = lastWorkingDay(M, st);
  const work = E.monthDays(M).filter((d) => d <= st.selDate && !E.isWeekend(d, st));
  const logDays = new Set(s.dl.filter((r) => r.date >= M && r.date <= E.monthEnd(M)).map((r) => r.date));
  const hdDays = new Set(s.hd.filter((h) => h.date >= M && h.date <= E.monthEnd(M) && h.held).map((h) => h.date));
  let next = E.addDays(E.monthEnd(M), 1);
  while (E.isWeekend(next, st)) next = E.addDays(next, 1);
  const ticks = s.close?.[M.slice(0, 7)] || {};
  return { M, next, lwd, ticks, list: [
    { key: "flags", title: "Clear the data-check flags", text: "Open each register with a ⚠ flag and complete the missing status, closure date or date order. A KPI is only as good as its records.", auto: flags1 === 0, info: `${flags1} record(s) flagged`, acts: `<a class="btn sm" href="#/home">See the flagged registers</a>` },
    { key: "logs", title: "Complete the daily logs and the huddle log", text: "Every working day of the month: one daily-log line per officer present, and the huddle (held, attendees, 3 priorities, escalation).", auto: work.length > 0 && work.every((d) => logDays.has(d)) && work.every((d) => hdDays.has(d)), info: `Daily log: ${work.filter((d) => logDays.has(d)).length}/${work.length} working days · huddle log: ${work.filter((d) => hdDays.has(d)).length}/${work.length}`, acts: `<a class="btn sm" href="#/t1/reg/dl">Daily log</a><a class="btn sm" href="#/t1/reg/hd">Huddle log</a>` },
    { key: "actions", title: "Review the open actions and findings", text: "Every open action has an owner and a realistic due date; overdue ones are re-planned or escalated to Tier 2.", auto: null, info: `${E.t1OpenActions(E.t1Context(s, st.selDate, "All team")).open.length} open action(s)`, acts: `<a class="btn sm" href="#/t1/reg/ac">Actions</a><a class="btn sm" href="#/t1/reg/fn">Findings</a>` },
    { key: "asof", title: `Set the board date to the last working day (${fmtDate(lwd)})`, text: "The month-to-date KPIs, the SQDCP letters and the team table are read on this date.", auto: st.selDate === lwd, info: `Now: ${fmtLong(st.selDate)}`, acts: st.selDate === lwd ? "" : `<button class="btn sm" data-asof="${lwd}">Set ${fmtDate(lwd)}</button>` },
    { key: "report", title: "Create the monthly report (Word)", text: "Cover, document control, Tier 1 summary, SQDCP pictures, the board (letters, 20 KPIs, team), actions and findings, data quality, commentary, sign-off, KPI definitions.", auto: null, acts: `<button class="btn sm primary" data-report>⤓ Create the Word report</button><a class="btn sm" href="#/report">Settings & commentary</a>` },
    { key: "charts", title: "Export the board pictures", text: "SQDCP letters, the 20 KPIs and the daily activity as high-resolution PNG.", auto: null, acts: `<a class="btn sm" href="#/t1/board">Huddle board ›</a>` },
    { key: "archive", title: `Archive the ${fmtMonth(M)} board`, text: store.db ? "A frozen, read-only copy of the board is kept in the shared archive — anyone in the team can re-open this month later." : "A frozen copy is kept in this browser's archive; download the JSON too.", auto: null, acts: `<button class="btn sm primary" data-archive>🗄 Archive now</button><a class="btn sm" href="#/archive">Archive</a>` },
    { key: "file", title: "File the month-end pack in the controlled folder", text: "One ZIP: the Word report, the board pictures, every register as CSV, the board snapshot and the filing instructions. Sign the printed report and keep the PDF beside it.", auto: null, acts: `<button class="btn sm primary" data-pack>⤓ Month-end pack (ZIP)</button>`,
      list: [`Folder: Controlled folder → QA Tier 1 Huddle → ${M.slice(0, 4)} → ${M.slice(0, 7)} ${fmtMonth(M).split(" ")[0]}`, "Signed PDF of the report next to the ZIP", "Never edit a filed pack — issue a new version (v1.1) instead"] },
    { key: "roll", title: `Move the board to ${fmtMonth(next)}`, text: "Sets the board date to the first working day of the new month: the letters, KPIs and team table start the month afresh. Registers are never cleared.", auto: st.selDate >= next, acts: `<button class="btn sm" data-roll>→ ${fmtDate(next)}</button>` },
  ] };
}

function closeSteps() {
  if (ONE_TIER === "t1") return closeStepsT1();
  const s = store.t2, st = s.setup, M = st.month;
  const comp = E.t2Computed(s);
  const c1 = E.t1Computed(store.t1, store.t1.setup.selDate);
  const flags2 = Object.entries(comp).reduce((a, [r, c]) => a + (T2_REGISTERS[r] ? E.flagged(c) : 0), 0);
  const flags1 = hasTier("t1") ? Object.entries(c1).reduce((a, [r, c]) => a + (T1_REGISTERS[r] ? E.flagged(c) : 0), 0) : 0;
  const cal = E.t2Calendar(s);
  const work = cal.filter((d) => !d.weekend && !d.future);
  const logged = work.filter((d) => d.log.held).length;
  const t1days = new Set(store.t1.dl.filter((r) => r.date >= M && r.date <= E.monthEnd(M)).map((r) => r.date)).size;
  const lwd = lastWorkingDay(M, st);
  const m = +M.slice(5, 7) - 1;
  const { kpis } = E.t2Kpis(s, comp);
  const withData = kpis.filter((k) => k.actual !== "");
  const frozen = withData.length > 0 && withData.every((k, i) => s.trend.rows[kpis.indexOf(k)]?.[m] != null);
  const next = E.addDays(E.monthEnd(M), 1);
  const ticks = s.close?.[M.slice(0, 7)] || {};
  return { M, next, lwd, ticks, list: [
    { key: "flags", title: "Clear the data-check flags", text: `Open each register with a ⚠ flag and complete the missing status, closure date or date order. A KPI is only as good as its records.`, auto: flags1 + flags2 === 0, info: hasTier("t1") ? `${flags2} Tier 2 · ${flags1} Tier 1 record(s) flagged` : `${flags2} record(s) flagged`, acts: `<a class="btn sm" href="#/home">See the flagged registers</a>` },
    hasTier("t1") ? { key: "logs", title: "Complete the Daily Log and the Tier 1 logs", text: "Every working day of the month: Tier 2 meeting held / attendees / Top 3, and the Tier 1 daily activity log of each officer.", auto: work.length > 0 && logged === work.length, info: `Tier 2: ${logged}/${work.length} working days logged · Tier 1: ${t1days} day(s) with entries`, acts: `<a class="btn sm" href="#/t2/calendar">Daily Log</a><a class="btn sm" href="#/t1/reg/dl">Tier 1 log</a>` }
      : { key: "logs", title: "Complete the Daily Log", text: "Every working day of the month: meeting held, attendees, Top 3 priorities and the Tier 1 headlines (huddle held, red letters, safety); every escalation from Tier 1 in register 10·A.", auto: work.length > 0 && logged === work.length, info: `${logged}/${work.length} working days logged`, acts: `<a class="btn sm" href="#/t2/calendar">Daily Log</a><a class="btn sm" href="#/t2/reg/t1e">Register 10·A</a>` },
    { key: "asof", title: `Set the as-of date to the last working day (${fmtDate(lwd)})`, text: "Every overdue count, KPI and the Q-calendar are calculated as of this date.", auto: st.statusDate === lwd, info: `Now: ${fmtLong(st.statusDate)}`, acts: st.statusDate === lwd ? "" : `<button class="btn sm" data-asof="${lwd}">Set ${fmtDate(lwd)}</button>` },
    { key: "remarks", title: "Write the monthly remarks", text: "Count first · name the trend · state what was escalated and why · end with next month's focus. They open the executive summary of the pack.", auto: has(st.remarks), info: "", body: `<textarea class="input" data-remarks rows="3" style="width:100%;margin-top:8px" placeholder="e.g. November: 6 new deviations (1 major) …">${esc(st.remarks || "")}</textarea>` },
    { key: "freeze", title: `Freeze the KPIs into ${E.MONTHS[m]}`, text: "Copies every live KPI into its month column of KPI Trend — the 12-month history and next month's trend arrows come from here.", auto: frozen, info: withData.length ? `${withData.length} KPI(s) with data` : "No KPI has data yet", acts: `<button class="btn sm" data-freeze>❄ Freeze ${E.MONTHS[m]}</button><a class="btn sm" href="#/t2/trend">KPI Trend</a>` },
    { key: "report", title: "Create the monthly management pack (Word)", text: "Cover, document control, executive summary, the month in numbers, KPIs, every chart, the registers, QA load, Tier 1, data quality, commentary and sign-off.", auto: null, acts: `<button class="btn sm primary" data-report>⤓ Create the Word pack</button><a class="btn sm" href="#/report">Settings & commentary</a>` },
    { key: "charts", title: "Export the chart pictures", text: `Every chart of the dashboard${hasTier("t1") ? ", Analytics and the Tier 1 board" : " and Analytics"} as high-resolution PNG for the Tier 3 slides.`, auto: null, acts: `<a class="btn sm" href="#/t2/analytics">Analytics (ZIP)</a>` },
    { key: "archive", title: `Archive the ${fmtMonth(M)} boards`, text: store.db ? "A frozen, read-only copy of both boards is kept in the shared archive — anyone in the team can re-open this month later." : "A frozen copy is kept in this browser's archive; download the JSON too.", auto: null, acts: `<button class="btn sm primary" data-archive>🗄 Archive now</button><a class="btn sm" href="#/archive">Archive</a>` },
    { key: "file", title: "File the month-end pack in the controlled folder", text: "One ZIP with everything: the Word pack, the chart pictures, every register as CSV, the boards snapshot and filing instructions. Sign the printed report and keep the PDF beside it.", auto: null, acts: `<button class="btn sm primary" data-pack>⤓ Month-end pack (ZIP)</button>`,
      list: [`Folder: Controlled folder → ${ONE_TIER === "t2" ? "QA Tier 2 Daily Management" : "QA Tier Boards"} → ${M.slice(0, 4)} → ${M.slice(0, 7)} ${fmtMonth(M).split(" ")[0]}`, "Signed PDF of the report next to the ZIP", "Never edit a filed pack — issue a new version (v1.1) instead", "The eQMS stays the GMP record of truth"] },
    { key: "roll", title: `Roll the board to ${fmtMonth(next)}`, text: "The calendar, the Daily Log and every ‘this month’ count move to the new month. Registers are never cleared: closed records stay for traceability and trending.", auto: st.month > M, acts: `<button class="btn sm" data-roll>→ ${fmtMonth(next)}</button>` },
  ] };
}

export function renderClose(root, { navigate } = {}) {
  root = fresh(root);
  const { M, next, list, ticks } = closeSteps();
  const doneN = list.filter((x) => x.auto === true || ticks[x.key]).length;
  root.innerHTML = `
    <section class="hero"><div class="hero-grid"><div>
      <div class="eyebrow">Month-end close · last working day</div><h1>Close ${fmtMonth(M)}</h1>
      <p>${list.length} steps, in order. Each shows whether the board already shows it done; tick the others when they are. The ticks are shared with the team. When every step is green, the month is closed and stored.</p></div>
      <div style="display:grid;gap:8px;justify-items:end"><span class="chip">${doneN} of ${list.length} steps done</span><div class="progress" style="width:220px"><i style="width:${(doneN / list.length) * 100}%"></i></div><a class="btn" href="#/archive">🗄 Archive ›</a></div></div></section>
    <div data-closeprog class="callout" hidden style="margin-bottom:12px"></div>
    <div class="steps">${list.map((x, i) => {
      const done = x.auto === true || !!ticks[x.key];
      return `<div class="step ${done ? "done" : i === list.findIndex((y) => !(y.auto === true || ticks[y.key])) ? "todo" : x.auto === false ? "warn" : ""}" data-step="${x.key}">
        <span class="num">${done ? "✓" : i + 1}</span>
        <div><h3>${esc(x.title)}</h3><p>${esc(x.text)}</p>${x.info ? `<p class="muted" style="font-size:12px;margin-top:4px">${esc(x.info)}${x.auto === true ? " · ✓ the boards show it is done" : ""}</p>` : ""}
          ${x.list ? `<ul>${x.list.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>` : ""}${x.body || ""}
          ${x.auto === true ? "" : `<label class="row" style="gap:6px;margin-top:8px;font-size:12.5px"><input type="checkbox" data-tick="${x.key}" ${ticks[x.key] ? "checked" : ""}> Done${ticks[x.key] ? ` · ${esc(String(ticks[x.key]).slice(0, 16).replace("T", " "))}` : ""}</label>`}</div>
        <div class="acts">${x.acts || ""}</div></div>`;
    }).join("")}</div>`;

  const m7 = M.slice(0, 7);
  const tick = (key, on = true) => store.patch(MAIN_TIER, ["close", m7, key], on ? new Date().toISOString() : "", `Month-end ${m7}`);
  const prog = $("[data-closeprog]", root);
  const step = (t) => { prog.hidden = false; prog.textContent = t; };
  const rerender = () => renderClose(root, { navigate });
  root.addEventListener("change", (e) => {
    if (e.target.matches("[data-tick]")) { tick(e.target.dataset.tick, e.target.checked); rerender(); }
    if (e.target.matches("[data-remarks]")) { store.patch("t2", ["setup", "remarks"], e.target.value.trim(), "Monthly remarks"); toast("Remarks saved"); rerender(); }
  });
  root.addEventListener("click", async (e) => {
    const b = e.target.closest("button");
    if (!b || !root.contains(b)) return;
    if (b.dataset.asof) { if (MAIN_TIER === "t2") store.patch("t2", ["setup", "statusDate"], b.dataset.asof, "Status date"); else store.patch("t1", ["setup", "selDate"], b.dataset.asof, "Board date"); rerender(); }
    if (b.hasAttribute("data-freeze")) { T2.freezeMonth(rerender); }
    if (b.hasAttribute("data-report")) {
      b.disabled = true;
      const rep = await makeReport(null, { type: "monthly", per: periodOf("monthly", { month: M }) }).catch(() => null);
      if (rep && await saveFile(rep.name, rep.blob)) tick("report");
      b.disabled = false; rerender();
    }
    if (b.hasAttribute("data-archive")) {
      b.disabled = true; step("Archiving the boards…");
      try {
        const r = await saveArchive(M);
        if (r.where === "none") { step("This browser has no room for the archive — download the JSON instead."); await saveFile(`QA_Boards_archive_${m7}.json`, new Blob([JSON.stringify(r.snap)], { type: "application/json" })); }
        else { tick("archive"); toast(r.where === "shared" ? `${fmtMonth(M)} archived for the whole team` : `${fmtMonth(M)} archived in this browser`); rerender(); }
      } catch (err) { step(`The archive could not be saved: ${err?.message || err}`); }
      b.disabled = false;
    }
    if (b.hasAttribute("data-pack")) {
      b.disabled = true;
      try {
        const { name, blob } = await monthPack(M, step);
        step(`Pack ready: ${name} (${Math.round(blob.size / 1024)} KB)`);
        if (await saveFile(name, blob)) tick("file");
      } catch (err) { step(err?.message || "The pack could not be created"); }
      b.disabled = false;
    }
    if (b.hasAttribute("data-roll") && MAIN_TIER === "t1") {
      if (!await confirmDialog({ title: `Move the board to ${fmtMonth(next)}?`, body: `<p>Archive the ${fmtMonth(M)} board first. The board date moves to ${fmtLong(next)}. Registers are kept.</p>`, ok: "Move the board" })) return;
      tick("roll");
      store.patch("t1", ["setup", "selDate"], next, "Board date");
      toast(`Board date: ${fmtLong(next)}`);
      navigate?.("#/close");
      return;
    }
    if (b.hasAttribute("data-roll")) {
      if (!await confirmDialog({ title: `Roll to ${fmtMonth(next)}?`, body: `<p>Freeze ${E.MONTHS[+M.slice(5, 7) - 1]} and archive the boards first. The calendar, the Daily Log and every ‘this month’ count move to ${fmtMonth(next)}. Registers are kept.</p>`, ok: "Roll the month" })) return;
      const s = store.t2;
      tick("roll");
      store.patch("t2", ["setup", "month"], next, "Reporting month");
      if (next.slice(5, 7) === "01") { s.trend.year = +next.slice(0, 4); s.trend.rows = s.trend.rows.map(() => Array(12).fill(null)); store.save("t2"); }
      if (store.t2.setup.statusDate < next) store.patch("t2", ["setup", "statusDate"], next > today() ? next : today() <= E.monthEnd(next) ? today() : next, "Status date");
      toast(`Reporting month: ${fmtMonth(next)}`);
      navigate?.("#/close");
    }
  });
}

/* ── the archive page ────────────────────────────────────── */

export async function renderArchive(root, { navigate } = {}) {
  root = fresh(root);
  root.innerHTML = `<div class="page-head"><div><div class="eyebrow">Month-end boards</div><h1>Archive</h1>
      <p>Every archived month-end: both boards frozen as they stood at the close. Open one read-only to look back, compare or re-make its report; download it as JSON for the controlled folder.</p></div>
      <div class="row"><label class="btn">📂 Open a file (.json)<input type="file" accept=".json,application/json" data-file hidden></label><a class="btn primary" href="#/close">Month-end close ›</a></div></div>
    <div data-list><div class="empty">Loading the archive…</div></div>
    <div class="card card-pad" style="margin-top:16px"><div class="card-head"><h2>How month-end boards are stored</h2></div>
      <div class="guide"><ol>
        <li><b>In the app</b> — “Archive now” (close step 8) keeps a frozen copy ${store.db ? "in the shared archive: the whole team sees it here" : "in this browser"}.</li>
        <li><b>In the controlled folder</b> — the month-end pack (close step 9) is one ZIP: Word report, chart pictures, every register as CSV, the boards snapshot (JSON) and a README with the filing path.</li>
        <li><b>Re-open later</b> — click “Open read-only” below, or “Open a file” with the JSON of a pack. Nothing can be changed while you look; “Return to the live board” ends the view.</li>
        <li><b>Restore</b> (rare, e.g. a lost board) — Setup → Data & backup → Import backup with the JSON. It replaces the live boards for everyone.</li>
      </ol></div></div>`;
  const listEl = $("[data-list]", root);
  const draw = async () => {
    const list = await listArchives();
    listEl.innerHTML = list.length ? `<div class="arch-list">${list.map((a) => `<div class="arch"><span class="m">${esc(fmtMonth(`${a.month}-01`))}</span>
        <div><b>${esc(a.site || "")}</b><div class="muted" style="font-size:12.5px">Data as of ${esc(fmtDate(a.statusDate))} · archived ${esc(String(a.created || "").slice(0, 16).replace("T", " "))} · ${a.where === "shared" ? "shared with the team" : "this browser only"} · ${Math.round((a.size || 0) / 1024)} KB</div>
          ${a.summary ? `<div class="row" style="gap:6px;margin-top:6px"><span class="pill info">Quality Pulse ${a.summary.pulse === "" ? "—" : pct(a.summary.pulse)}</span><span class="pill info">Tier 1 health ${a.summary.health === "" ? "—" : pct(a.summary.health)}</span><span class="pill ${a.summary.overdue ? "R" : "G"}">${a.summary.overdue} overdue</span><span class="pill">${a.summary.records} records</span></div>` : ""}</div>
        <div class="row"><button class="btn sm primary" data-open="${esc(a.month)}" data-where="${a.where}">Open read-only</button><button class="btn sm" data-json="${esc(a.month)}" data-where="${a.where}">⤓ JSON</button><button class="btn sm ghost" data-del="${esc(a.month)}" data-where="${a.where}" title="Delete this archive">✕</button></div></div>`).join("")}</div>`
      : `<div class="empty">No month archived yet. At month-end, the close (step 8) archives the boards.</div>`;
  };
  await draw();
  root.addEventListener("click", async (e) => {
    const b = e.target.closest("button[data-open], button[data-json], button[data-del]");
    if (!b) return;
    const m = b.dataset.open || b.dataset.json || b.dataset.del, where = b.dataset.where;
    try {
      if (b.dataset.open) openSnapshot(await loadArchive(m, where), navigate);
      if (b.dataset.json) { const snap = await loadArchive(m, where); await saveFile(`QA_Boards_archive_${m}.json`, new Blob([JSON.stringify(snap, null, 1)], { type: "application/json" })); }
      if (b.dataset.del && await confirmDialog({ title: `Delete the ${fmtMonth(`${m}-01`)} archive?`, body: `<p>The frozen copy is removed ${where === "shared" ? "for the whole team" : "from this browser"}. A pack already filed in the controlled folder is not affected.</p>`, ok: "Delete", danger: true })) { await deleteArchive(m, where); toast("Archive deleted"); await draw(); }
    } catch (err) { toast(err?.message || "The archive could not be read"); }
  });
  $("[data-file]", root).onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (data.app !== "qa-tiers") throw new Error("This file is not a QA Tier Boards archive or backup");
      openSnapshot({ ...data, month: data.month || data.t2?.setup?.month || "archive" }, navigate);
    } catch (err) { toast(err.message || "The file could not be read"); }
    e.target.value = "";
  };
}
