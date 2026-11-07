// App shell: navigation rail, hash router and the home page (the Tier 1 →
// Tier 2 → Tier 3 cascade).

import { store, HAS_REAL, demoAllowed, REAL_INFO } from "./store.js";
import { EDITION, hasTier, ONE_TIER, MAIN_TIER } from "./edition.js";
import * as E from "./engine.js";
import { T1_REGISTERS, T2_REGISTERS, T1_ORDER, T2_ORDER } from "./schema.js";
import { ring } from "./charts.js";
import { renderRegister } from "./registers.js";
import * as T1 from "./views-t1.js";
import * as T2 from "./views-t2.js";
import { renderSetupT1, renderSetupT2, renderAudit } from "./setup.js";
import { renderLearnHome, renderModule, learnProgress, RHYTHM } from "./learn.js";
import { esc, pill, fmtLong, fmtMonth, closeDrawer, initTooltips, modal, toast, $, $$ } from "./ui.js";
import { createSync } from "./sync.js";
import { decorateCharts } from "./export.js";
import { renderReportPage } from "./report.js";
import { renderClose, renderArchive } from "./archive.js";
import { renderImport, pendingUpdate } from "./scigeniq.js";
import { renderStart, renderGuide, initGuides, startTour, tourFor, startProgress, endTour } from "./guides.js";

store.load();
E.linkTier1(() => (hasTier("t1") ? store.t1 : null)); // a Tier 2 app has no live Tier 1 log

/* ── Theme ─────────────────────────────────────────────── */
function applyTheme() {
  const t = store.prefs.theme || "system";
  if (t === "system") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.dataset.theme = t;
}
applyTheme();

/* ── Navigation ────────────────────────────────────────── */
function flagCounts() {
  const t2 = hasTier("t2") ? E.t2Computed(store.t2) : {};
  const t1 = hasTier("t1") ? E.t1Computed(store.t1, store.t1.setup.selDate) : {};
  const out = {};
  for (const [reg, c] of Object.entries(t2)) out[`t2/reg/${reg}`] = E.flagged(c) + c.filter((x) => x.live === "Overdue").length;
  for (const [reg, c] of Object.entries(t1)) out[`t1/reg/${reg}`] = E.flagged(c) + c.filter((x) => x.live === "Overdue").length;
  return out;
}

function navHTML() {
  const counts = flagCounts();
  const a = (href, ic, label, key) => `<a href="#/${href}" data-nav="${href}"><span class="ic">${ic}</span>${esc(label)}${counts[key || href] ? `<span class="badge" title="Overdue items and data-check flags">${counts[key || href]}</span>` : ""}</a>`;
  const lp = learnProgress();
  return `
    <a class="brand" href="#/home"><span class="brand-mark">${ONE_TIER === "t1" ? "T1" : ONE_TIER === "t2" ? "T2" : "QA"}</span><span><b>${ONE_TIER === "t1" ? "Tier 1 · Huddle" : ONE_TIER === "t2" ? "Tier 2 · Daily Mgmt" : "Tier Boards"}</b><small>${esc(String(store[MAIN_TIER].setup.site || "").split("—")[0].trim())}</small></span></a>
    <nav class="nav">
      ${a("home", "⌂", "Overview")}
      ${showStart() ? `<a href="#/start" data-nav="start"><span class="ic">①</span>Start here<span class="badge soft">${startProgress().done}/${startProgress().total}</span></a>` : ""}
      <a href="#/learn" data-nav="learn"><span class="ic">🎓</span>Masterclass<span class="badge soft">${lp.done}/${lp.total}</span></a>
      ${hasTier("t1") ? `<div class="nav-group"><div class="nav-title" style="--dot:var(--s2)"><i class="tier-dot"></i>Tier 1 · Huddle ${esc(store.t1.setup.huddleTime || "08:30")}</div>
        ${a("t1/board", "◫", "Huddle board")}
        ${T1_ORDER.map((r) => a(`t1/reg/${r}`, T1_REGISTERS[r].icon, T1_REGISTERS[r].short)).join("")}
        ${a("t1/skills", "▦", "Skills matrix")}
        ${a("t1/setup", "⚙", "Setup")}
      </div>` : ""}
      ${hasTier("t2") ? `<div class="nav-group"><div class="nav-title" style="--dot:var(--accent-2)"><i class="tier-dot"></i>Tier 2 · Stand-up ${esc(store.t2.setup.meetingTime || "10:30")}</div>
        ${a("t2/board", "◫", "Dashboard")}
        ${a("t2/calendar", "▣", "Daily Log")}
        ${T2_ORDER.filter((r) => r !== "t1e" || !hasTier("t1")).map((r) => a(`t2/reg/${r}`, T2_REGISTERS[r].no, T2_REGISTERS[r].short)).join("")}
        ${a("t2/trend", "↗", "KPI Trend")}
        ${a("t2/analytics", "◔", "Analytics")}
        ${a("t2/setup", "⚙", "Setup")}
      </div>` : ""}
      <div class="nav-group"><div class="nav-title">Reports & data</div>${hasTier("t2") ? a("import", "⤒", "Import from Scigeniq") : ""}${a("report", "⤓", "Reports centre")}${a("close", "✓", "Month-end close")}${a("archive", "🗄", "Archive")}${a("guide", "?", "How-to guides")}${a("audit", "⎘", "Change history")}</div>
    </nav>
    <div class="rail-foot">
      <div class="row" role="group" aria-label="Theme">${["system", "light", "dark"].map((t) => `<button class="rail-btn" data-theme-btn="${t}" aria-pressed="${(store.prefs.theme || "system") === t}">${t[0].toUpperCase() + t.slice(1)}</button>`).join("")}</div>
      <div data-team>${teamHTML()}</div>
      <span>The eQMS is the record of truth — this board mirrors it.</span>
    </div>`;
}

function renderNav() {
  const rail = $(".rail");
  const scroll = rail.scrollTop;
  rail.innerHTML = navHTML();
  rail.scrollTop = scroll;
  markNav();
}

function markNav() {
  const path = current.path;
  $$("[data-nav]").forEach((a) => {
    const n = a.dataset.nav;
    const on = path === n || (n === "learn" && path.startsWith("learn"));
    if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  });
}

/** "Start here" is offered while a board that began blank is being set up. */
function showStart() {
  const sp = startProgress();
  return hasTier("t2") && String(store.t2.dataset || "").startsWith("blank") && sp.done < sp.total;
}

/* ── Home ──────────────────────────────────────────────── */
function renderHome(root) {
  const t1 = store.t1, t2 = store.t2;
  const ctx = E.t1Context(t1, t1.setup.selDate, "All team");
  const { health } = E.t1Kpis(ctx);
  const day = E.t1Days(ctx).find((d) => d.date === t1.setup.selDate);
  const redLetters = day ? E.PILLARS.filter((p) => day.codes[p.key] === 3).map((p) => p.key) : [];
  const t1Today = E.t1Today(ctx);
  const t1esc = E.t1OpenActions(ctx).escalated;
  const comp = E.t2Computed(t2);
  const { pulse } = E.t2Kpis(t2, comp);
  const cal = E.t2Calendar(t2);
  const overdue2 = Object.values(comp).reduce((a, c) => a + c.filter((x) => x.live === "Overdue").length, 0);
  const openEsc = E.t2Top(t2, "esc", 5, comp);
  const flags = flagCounts();
  const lp = learnProgress();
  const attention = Object.entries(flags).filter(([, n]) => n).map(([k, n]) => {
    const [tier, , reg] = k.split("/");
    const sc = (tier === "t1" ? T1_REGISTERS : T2_REGISTERS)[reg];
    return `<a class="nav-tile card" href="#/${k}"><span class="no">${tier === "t1" ? "TIER 1" : "TIER 2"} · ${esc(sc.no)}</span><b>${esc(sc.short)}</b><span>${n} overdue item${n > 1 ? "s" : ""} or data-check flag${n > 1 ? "s" : ""}</span></a>`;
  }).join("");

  const sp = startProgress();
  const startCard = showStart() ? `<a class="card card-pad" href="#/start" style="display:flex;gap:16px;align-items:center;margin-bottom:16px;text-decoration:none;color:var(--ink);border-color:var(--accent)">
      <span class="brand-mark" style="width:44px;height:44px;font-size:18px">①</span><span style="flex:1"><b style="font:600 17px var(--font-display)">Start here — set up your ${esc(fmtMonth(t2.setup.month))} boards</b><br><span class="muted" style="font-size:13px">${sp.items.filter((x) => !x[2]).map((x) => x[1]).join(" · ")}</span></span>
      <span class="chip" style="color:var(--ink);background:var(--accent-soft)">${sp.done} / ${sp.total} done ›</span></a>` : "";
  root.innerHTML = `${startCard}
    <section class="hero" style="padding:26px 28px">
      <div class="hero-grid"><div>
        <div class="eyebrow">${esc(store[MAIN_TIER].setup.site)} · Quality Assurance</div>
        <h1>${ONE_TIER === "t1" ? "Tier 1 · the shop-floor huddle" : ONE_TIER === "t2" ? "Tier 2 · QA daily management" : "One team — one standard — zero compromise"}</h1>
        <p>${ONE_TIER === "t1" ? "The officers log the floor; the SQDCP letters, the 20 KPIs and the team performance build themselves. What the huddle cannot solve today goes to the Tier 2 stand-up." : ONE_TIER === "t2" ? "The registers build the 9 KPIs, the Q-calendar and the top 5 lists for the 10:30 stand-up; what Tier 2 cannot solve climbs to Tier 3 the same day." : "The Tier 1 huddle board and the Tier 2 daily management board, connected: officers log the floor, the boards build themselves, and what cannot be solved climbs a tier the same day."}</p>
        <div class="hero-meta">${hasTier("t1") ? `<span class="chip">Tier 1 date <b>${fmtLong(t1.setup.selDate)}</b></span>` : ""}${hasTier("t2") ? `<span class="chip">Tier 2 month <b>${fmtMonth(t2.setup.month)}</b> · as of <b>${fmtLong(t2.setup.statusDate)}</b></span>` : ""}</div>
      </div>
      <a class="card card-pad" href="#/learn" style="text-decoration:none;color:var(--ink);display:grid;gap:8px;min-width:240px">
        <span class="eyebrow">Masterclass</span><b style="font:600 18px var(--font-display)">Data entry, step by step</b>
        <div class="progress"><i style="width:${lp.pct * 100}%"></i></div><span class="muted" style="font-size:12.5px">${lp.done} of ${lp.total} modules completed ›</span></a></div>
    </section>

    <div class="cascade ${ONE_TIER ? `solo-${ONE_TIER}` : ""}">
      ${hasTier("t1") ? `<a class="card tier-card" href="#/t1/board">
        <div class="row"><span class="t-badge">TIER 1 · ${esc(t1.setup.huddleTime || "08:30")}</span><span class="spacer"></span>${ring(health.score, health.rag, { size: 64, thick: 7 })}</div>
        <h2>Shop-floor huddle</h2><span class="t-when">${esc(t1.setup.location)} · ${t1.roster.length} officers · SQDCP</span>
        <div class="t-stats"><div><b>${t1Today.present}/${t1Today.roster}</b><span>present</span></div><div><b style="color:${redLetters.length ? "var(--r)" : "var(--g)"}">${redLetters.length ? redLetters.join(" ") : "—"}</b><span>red letters today</span></div><div><b>${t1Today.overdue}</b><span>overdue actions</span></div></div>
        <span class="pill ${t1esc.length ? "A" : "G"}">${t1esc.length} open escalation${t1esc.length === 1 ? "" : "s"} to Tier 2</span>
      </a>` : ""}
      ${ONE_TIER ? "" : `<span class="cascade-arrow" style="left:33.33%">›</span>`}
      ${hasTier("t2") ? `<a class="card tier-card" href="#/t2/board">
        <div class="row"><span class="t-badge">TIER 2 · ${esc(t2.setup.meetingTime)}</span><span class="spacer"></span>${ring(pulse.score, pulse.rag, { size: 64, thick: 7 })}</div>
        <h2>QA daily management</h2><span class="t-when">${esc(t2.setup.location)} · owner ${esc(t2.setup.owner)}</span>
        <div class="t-stats"><div><b>${pulse.g}/${pulse.g + pulse.a + pulse.r}</b><span>KPIs on target</span></div><div><b style="color:${overdue2 ? "var(--r)" : "var(--g)"}">${overdue2}</b><span>overdue items</span></div><div><b>${cal.filter((d) => d.code === 3).length}</b><span>critical days</span></div></div>
        <span class="pill ${openEsc.length ? "A" : "G"}">${openEsc.length} open escalation${openEsc.length === 1 ? "" : "s"} to Tier 3</span>
      </a>` : ""}
      ${hasTier("t2") ? `<span class="cascade-arrow" style="left:${ONE_TIER ? 50 : 66.66}%">›</span>
      <a class="card tier-card" href="#/t2/reg/esc">
        <span class="t-badge">TIER 3 · SITE</span><h2>Site management</h2><span class="t-when">Decisions, resources, budget</span>
        ${openEsc.length ? `<div class="urgent">${openEsc.map(({ r, c }) => `<span class="u-item"><span class="ref">${esc(r.id)}</span><span class="desc">${esc(r.desc)}</span>${pill(c.live === "Overdue" ? "Overdue" : r.status)}</span>`).join("")}</div>` : `<div class="empty">No open escalation</div>`}
      </a>` : ""}
    </div>

    <div class="card-head" style="margin:22px 0 10px"><h2 style="font-size:15px;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-2)">The daily rhythm</h2><div class="legend">${hasTier("t1") ? `<span><i class="bg-s2"></i>Tier 1</span>` : ""}${hasTier("t2") ? `<span><i style="background:var(--accent)"></i>Tier 2</span>` : ""}</div></div>
    <div class="rhythm">${RHYTHM.filter((r) => !ONE_TIER || r.tier === ONE_TIER).map((r) => `<div class="${r.tier}"><b>${r.t}</b><strong>${esc(r.title)}</strong><span>${esc(r.text)}</span></div>`).join("")}</div>

    <div class="card-head" style="margin:22px 0 10px"><h2 style="font-size:15px;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-2)">Needs attention before the meetings</h2></div>
    ${attention ? `<div class="tiles">${attention}</div>` : `<div class="empty">Every register is consistent and nothing is overdue.</div>`}

    <div class="card-head" style="margin:22px 0 10px"><h2 style="font-size:15px;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-2)">Go to</h2></div>
    <div class="tiles">
      ${[["t1/board", "TIER 1", "Huddle board", "SQDCP letters · 20 KPIs"], ["t2/board", "TIER 2", "Dashboard", "Q-calendar · 9 KPIs · top 5"], ["t2/calendar", "TIER 2", "Daily Log", "Q-calendar engine & priorities"],
        ["t2/analytics", "TIER 2", "Analytics", "13 live charts · filters · exports"], ["t2/trend", "TIER 2", "KPI Trend", "12-month history"], ["t1/skills", "TIER 1", "Skills matrix", "Who can do what"],
        ["report", "REPORTS", "Reports centre", "Daily · weekly · monthly (Word)"], ["close", "MONTH-END", "Month-end close", "10 steps · pack · archive"], ["archive", "MONTH-END", "Archive", "Past month-end boards"],
        ["guide", "HELP", "How-to guides", "Every routine, step by step"], ["t2/setup", "TIER 2", "Setup", "Month, targets, lists"], ["learn", "LEARN", "Masterclass", "Modules · practice · quiz"]]
        .concat(hasTier("t1") && !hasTier("t2") ? [["t1/setup", "TIER 1", "Setup", "Roster, targets, lists"]] : [])
        .filter(([h]) => !(h.startsWith("t1/") && !hasTier("t1")) && !(h.startsWith("t2/") && !hasTier("t2")))
        .map(([h, n, b, s]) => `<a class="card nav-tile" href="#/${h}"><span class="no">${n}</span><b>${b}</b><span>${s}</span></a>`).join("")}
    </div>`;
}

/* ── Router ────────────────────────────────────────────── */
// In-page router. Links keep the readable form "#/t2/reg/dev?id=…", but the
// address bar only ever shows a plain name ("#t2-reg-dev"): hosts such as the
// Artifact viewer pass plain #names only, so a click never relies on the
// browser following "#/…" links. Query parameters live in memory.
let current = { path: "home", query: {} };

function fromHash() {
  const raw = decodeURIComponent(location.hash.slice(1));
  if (raw.startsWith("/")) {
    const [p, qs = ""] = raw.slice(1).split("?");
    return { path: p || "home", query: Object.fromEntries(new URLSearchParams(qs)) };
  }
  return { path: raw.replace(/-/g, "/") || "home", query: {} };
}

function navigate(href) {
  const [p, qs = ""] = href.replace(/^#\/?/, "").split("?");
  current = { path: p || "home", query: Object.fromEntries(new URLSearchParams(qs)) };
  const name = `#${current.path.replace(/\//g, "-")}`;
  try { if (location.hash !== name) history.pushState(null, "", name); } catch { /* history may be blocked */ }
  route();
}

function parse() {
  return { parts: current.path.split("/"), query: current.query };
}

function route({ soft = false } = {}) {
  const y = scrollY;
  if (!soft) {
    closeDrawer();
    $$(".overlay, .dialog").forEach((x) => x.remove());
    document.body.classList.remove("nav-open");
  }
  const main = $("#main");
  main.innerHTML = "";
  const view = document.createElement("div");
  main.append(view);
  const { parts } = parse();
  const query = soft ? {} : parse().query;
  let [a, b, c] = parts;
  if ((a === "t1" && !hasTier("t1")) || (a === "t2" && !hasTier("t2")) || (a === "import" && !hasTier("t2"))) a = "home";
  const titles = [];
  if (a === "home") { renderHome(view); titles.push("Overview"); }
  else if (a === "learn") { if (b) renderModule(view, b); else renderLearnHome(view); titles.push("Masterclass"); }
  else if (a === "t1" && b === "board") { T1.renderBoard(view); titles.push("Tier 1 huddle board"); }
  else if (a === "t1" && b === "skills") { T1.renderSkills(view); titles.push("Skills matrix"); }
  else if (a === "t1" && b === "setup") { renderSetupT1(view); titles.push("Tier 1 setup"); }
  else if (a === "t1" && b === "reg" && T1_REGISTERS[c]) { renderRegister(view, { tier: "t1", reg: c, query }); titles.push(T1_REGISTERS[c].title); }
  else if (a === "t2" && b === "board") { T2.renderBoard(view); titles.push("Tier 2 dashboard"); }
  else if (a === "t2" && b === "calendar") { T2.renderCalendar(view); titles.push("Daily Log"); if (query.day) T2.dayEditor(query.day, () => { current.query = {}; route(); }); }
  else if (a === "t2" && b === "trend") { T2.renderTrend(view); titles.push("KPI Trend"); }
  else if (a === "t2" && b === "analytics") { T2.renderAnalytics(view); titles.push("Analytics"); }
  else if (a === "t2" && b === "setup") { renderSetupT2(view); titles.push("Tier 2 setup"); }
  else if (a === "t2" && b === "reg" && T2_REGISTERS[c]) { renderRegister(view, { tier: "t2", reg: c, query }); titles.push(T2_REGISTERS[c].title); }
  else if (a === "audit") { renderAudit(view); titles.push("Change history"); }
  else if (a === "report") { renderReportPage(view, { type: query.type }); titles.push("Reports centre"); }
  else if (a === "import") { renderImport(view); titles.push("Import from Scigeniq"); }
  else if (a === "close") { renderClose(view, { navigate }); titles.push("Month-end close"); }
  else if (a === "archive") { renderArchive(view, { navigate }); titles.push("Archive"); }
  else if (a === "start") { renderStart(view); titles.push("Start here"); }
  else if (a === "guide") { renderGuide(view); titles.push("How-to guides"); }
  else { renderHome(view); titles.push("Overview"); }
  document.title = `${titles[0]} · ${EDITION.name}`;
  $(".topbar b").textContent = titles[0];
  markNav();
  paintViewBar();
  decorateCharts($("#main")); // views may swap their own container while drawing
  if (soft) scrollTo(0, y); else if (!query.keep) scrollTo(0, 0);
}

/** The banner of a read-only view (an archived month, the practice sandbox). */
function paintViewBar() {
  const main = $("#main");
  main.querySelector(":scope > .viewbar")?.remove();
  const v = store.viewing;
  if (!v) return;
  const bar = document.createElement("div");
  bar.className = "viewbar";
  bar.innerHTML = `<span>${v.kind === "practice" ? "🎓" : "🗄"}</span><span><b>${esc(v.label)}</b> · read-only — ${v.kind === "practice" ? "practice on the September 2026 demo; nothing is saved" : "nothing can be changed while you look; reports and exports use this archive"}</span><span class="spacer"></span><button class="btn sm" data-exitview>Return to the live board</button>`;
  bar.querySelector("[data-exitview]").onclick = () => { store.exitView(); navigate(v.kind === "practice" ? "#/learn/practice" : "#/archive"); };
  main.prepend(bar);
}

/* ── Team sync ─────────────────────────────────────────── */
// "local" (this browser only) · "connecting" · "live" · "readonly" · "empty"
let team = { mode: "connecting", pending: 0, failed: false };
let redrawPending = false;

function teamHTML() {
  const m = team.mode;
  const dot = m === "live" ? (team.failed ? "var(--r)" : "var(--g)") : m === "readonly" ? "var(--a)" : "var(--navy-muted)";
  const text = m === "live" ? (team.failed ? "Shared · some changes not saved — reload" : team.pending ? `Shared · saving ${team.pending} change${team.pending > 1 ? "s" : ""}…` : "Shared with your team · live")
    : m === "readonly" ? "Shared · view only (ask the owner for Contributor access)"
    : m === "empty" ? "Shared board not set up yet"
    : m === "connecting" ? "Connecting to the shared board…" : "Saved in this browser only";
  return `<span style="display:flex;gap:6px;align-items:center;color:var(--navy-ink)"><i style="width:8px;height:8px;border-radius:50%;background:${dot};flex:none"></i>${esc(text)}</span>`;
}
function paintTeam() { const el = $("[data-team]"); if (el) el.innerHTML = teamHTML(); }

/** Redraw after a teammate's change, unless the viewer is typing or has a form open. */
function softRedraw() {
  const busy = $("aside.drawer, .dialog") || document.activeElement?.closest?.("#main input, #main textarea, #main select");
  if (busy) { redrawPending = true; return; }
  redrawPending = false;
  route({ soft: true });
}
new MutationObserver(() => { if (redrawPending && !$("aside.drawer, .dialog")) softRedraw(); }).observe(document.body, { childList: true });
document.addEventListener("focusout", () => setTimeout(() => { if (redrawPending) softRedraw(); }, 50));

let setupDialog = null;

function firstRun(sync) {
  setupDialog = modal(`<div class="eyebrow">Share with your team</div><h2>Set up the shared board</h2>
    <p style="margin:0">From now on everyone who opens this page works on the same Tier 1 and Tier 2 boards, and sees each other's changes live. Choose what the team starts from:</p>
    <div class="lcards">
      ${HAS_REAL ? `<button class="lcard" data-start="real" style="text-align:left;cursor:pointer"><b>${esc(REAL_INFO.label)} (recommended)</b><span>Imported ${esc(REAL_INFO.date)}: ${esc(REAL_INFO.sources)}.</span></button>` : ""}
      <button class="lcard" data-start="mine" style="text-align:left;cursor:pointer"><b>The boards in this browser</b><span>Everything you have entered or changed here so far.</span></button>
      ${demoAllowed() ? `<button class="lcard" data-start="demo" style="text-align:left;cursor:pointer"><b>The September 2026 demo</b><span>Made-up training data for the masterclass.</span></button>` : ""}
      <button class="lcard" data-start="blank" style="text-align:left;cursor:pointer;${EDITION.start === "blank" && !HAS_REAL ? "border-color:var(--accent);background:var(--accent-soft)" : ""}"><b>${EDITION.start === "blank" && !HAS_REAL ? `A blank ${esc(EDITION.label)} board (recommended)` : "Empty registers"}</b><span>${EDITION.start === "blank" && !HAS_REAL ? "Empty registers for the month, with the standard lists, KPI targets and QA activity catalogue. Then follow Start here." : "Keeps setup, targets, roster and lists; registers start empty."}</span></button>
    </div><p class="muted" style="margin:0;font-size:12.5px">The first upload sends several hundred records; keep the page open until the status in the menu says “Shared with your team · live”.</p>`,
  { onClose: () => { setupDialog = null; } });
  setupDialog.el.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-start]");
    if (!b) return;
    setupDialog.el.querySelectorAll("button").forEach((x) => { x.disabled = true; });
    // someone else may have set it up meanwhile: join theirs instead
    if (await sync.probe().catch(() => false)) { setupDialog.close(); join(sync); toast("A teammate has already set up the shared board — you joined it"); return; }
    for (const t of EDITION.tiers) {
      if (b.dataset.start === "demo") store.reset(t, "demo");
      if (b.dataset.start === "real") store.reset(t, "real");
      if (b.dataset.start === "blank") store.blank(t);
    }
    store.attachSync(sync, { upload: true });
    team.mode = "live"; paintTeam();
    setupDialog.close();
    route({ soft: true });
    toast("Shared board created — your team now sees the same data");
    if (b.dataset.start === "blank") navigate("#/start");
  });
}

/** Switch this page to the shared copy that now exists. */
function join(sync) {
  if (store.sync) return;
  store.attachSync(sync);
  for (const t of EDITION.tiers) store.applyRemote(t);
  team.mode = sync.readOnly ? "readonly" : "live"; paintTeam();
  route({ soft: true });
  if (HAS_REAL) offerRealData(); else if (EDITION.start === "demo") offerDemo();
  offerUpdate();
}

/** Once, to the owner: the shared board holds site data this version does not
 * include — return it to the September 2026 demo for everyone? */
async function offerDemo() {
  if (!demoAllowed() || !store.t2.dataset || store.t2.dataset === "demo-2026-09" || store.prefs.demoOffered === store.t2.dataset) return;
  const owner = store.user ? await store.user.isOwner().catch(() => false) : false;
  if (!owner) return;
  const { el, close } = modal(`<div class="eyebrow">Demo version</div><h2>Return the shared board to the demo?</h2>
    <p style="margin:0">This version of the boards ships the September 2026 demo only, but the shared board still holds the site data loaded earlier. Returning it to the demo deletes the site records from the shared board <b>for everyone on the team</b> and loads the demo in their place.</p>
    <div class="actions"><button class="btn" data-later>Keep the site data</button><button class="btn primary" data-demo>Return to the demo for the team</button></div>`);
  el.querySelector("[data-later]").onclick = () => { store.prefs.demoOffered = store.t2.dataset; store.save(); close(); };
  el.querySelector("[data-demo]").onclick = () => {
    for (const t of EDITION.tiers) store.reset(t, "demo");
    store.save();
    close(); route({ soft: true });
    toast("Shared board returned to the demo — keep the page open until the status says live");
  };
}

/** To anyone who can edit: the site data of this version carries a Scigeniq update the board has not applied. */
async function offerUpdate() {
  const u = pendingUpdate();
  if (!u || store.prefs.updateOffered === u.id) return;
  const can = store.user ? await store.user.can("data.write").catch(() => null) : true;
  if (can === false) return;
  store.prefs.updateOffered = u.id; store.save();
  toast(`Scigeniq update of ${u.generated} ready to apply`, { label: "Review", run: () => navigate("#/import") });
}

/** Once, to the owner: the shared board holds other data than the site data of this copy — load it? */
async function offerRealData() {
  if (!HAS_REAL || store[MAIN_TIER].dataset === REAL_INFO.dataset || store.prefs.realOffered === REAL_INFO.dataset) return;
  const owner = store.user ? await store.user.isOwner().catch(() => false) : false;
  if (!owner) return;
  const ds = String(store[MAIN_TIER].dataset || "");
  const was = ds.startsWith("demo") ? "the September 2026 demo" : ds.startsWith("blank") ? "a blank board" : "earlier data";
  const { el, close } = modal(`<div class="eyebrow">Site data available</div><h2>Load ${esc(REAL_INFO.label)} for the team?</h2>
    <p style="margin:0">The shared board holds ${was}. ${esc(REAL_INFO.label)} (${esc(REAL_INFO.date)}) is ready: ${esc(REAL_INFO.summary)}.</p>
    <p style="margin:0">Loading it replaces what the shared board holds now <b>for everyone on the team</b>, settings included.</p>
    <div class="actions"><button class="btn" data-later>Not now</button><button class="btn primary" data-load>Load it for the team</button></div>`);
  el.querySelector("[data-later]").onclick = () => { store.prefs.realOffered = REAL_INFO.dataset; store.save(); close(); };
  el.querySelector("[data-load]").onclick = () => {
    for (const t of EDITION.tiers) store.reset(t, "real");
    store.prefs.realOffered = REAL_INFO.dataset; store.save();
    close(); route({ soft: true });
    toast(`${REAL_INFO.label} loaded for the whole team — keep the page open until the status says live`);
  };
}

async function connectTeam() {
  const api = window.claude?.use ? window.claude : null;
  const db = api ? await api.use("db").catch(() => null) : null;
  if (!db) { team.mode = "local"; paintTeam(); return; }
  const user = await api.use("user").catch(() => null);
  store.user = user;
  store.db = db;
  const dirty = new Set();
  let timer = null;
  const sync = createSync({
    db, user, tiers: EDITION.tiers,
    onStatus: (st) => { team.pending = st.pending; team.failed = st.failed; if (st.readOnly) team.mode = "readonly"; paintTeam(); },
    onRemote: (tier) => {
      if (tier === "readonly") { team.mode = "readonly"; paintTeam(); toast("You can view the shared board but not change it"); return; }
      dirty.add(tier);
      clearTimeout(timer);
      // a burst of changes (a first upload, a reload of the demo) is applied once
      timer = setTimeout(() => {
        const tiers = [...dirty]; dirty.clear();
        if (!store.sync) {
          if (EDITION.tiers.every((t) => sync.ready(t))) { setupDialog?.close(); join(sync); }
          return;
        }
        for (const t of tiers) store.applyRemote(t);
        softRedraw();
      }, 150);
    },
  });
  let exists;
  try { exists = await sync.probe(); } catch { team.mode = "local"; paintTeam(); return; }
  sync.listen();
  if (exists) return; // join() runs once both boards have arrived
  const canWrite = user ? await user.can("data.write") : null;
  team.mode = "empty"; paintTeam();
  if (canWrite !== false) firstRun(sync);
}

/* ── Boot ──────────────────────────────────────────────── */
// Mount next to whatever the host put in <body> (a publish step may place the
// page's <style> there), never over it.
const mount = document.createElement("div");
mount.id = "app";
document.body.append(mount);
mount.innerHTML = `
  <div class="topbar"><button aria-label="Open menu" data-menu>☰</button><b>QA Tier Boards</b></div>
  <div class="scrim" data-scrim></div>
  <div class="shell"><aside class="rail" aria-label="Navigation"></aside><main class="main" id="main"></main></div>`;
renderNav();
initTooltips();
current = fromHash();
const onHash = () => {
  const next = fromHash();
  if (next.path === current.path && !Object.keys(next.query).length) return;
  current = next; route();
};
addEventListener("hashchange", onHash);
addEventListener("popstate", onHash);
document.addEventListener("click", (e) => {
  const a = e.target.closest('a[href^="#/"]');
  if (!a || e.ctrlKey || e.metaKey || e.shiftKey) return;
  e.preventDefault();
  navigate(a.getAttribute("href"));
}, true);
store.onChange((tier, kind) => {
  if (kind === "blocked") { toast(store.viewing?.kind === "practice" ? "Practice mode — nothing is saved" : "Read-only archive — return to the live board to make changes"); return; }
  renderNav();
  if (kind === "view") route({ soft: true });
});
initGuides(navigate);
const help = document.createElement("button");
help.className = "help-fab";
help.type = "button";
help.title = "Help: a guided tour of this page, or the how-to guides";
help.textContent = "?";
help.onclick = () => {
  const { el, close } = modal(`<div class="row"><div><div class="eyebrow">Help</div><h2>What do you want to do?</h2></div><span class="spacer"></span><button class="btn ghost" data-x aria-label="Close">✕</button></div>
    <div class="lcards">
      <button class="lcard" data-h="tour" style="text-align:left;cursor:pointer"><b>▶ Guided tour of this page</b><span>Each control highlighted, step by step.</span></button>
      <button class="lcard" data-h="#/guide" style="text-align:left;cursor:pointer"><b>How-to guides</b><span>Every routine: daily, weekly, month-end, exports.</span></button>
      ${hasTier("t2") ? `<button class="lcard" data-h="#/start" style="text-align:left;cursor:pointer"><b>Start here</b><span>Set up a blank board: identity, team, products, targets.</span></button>` : ""}
      <button class="lcard" data-h="#/learn" style="text-align:left;cursor:pointer"><b>Masterclass</b><span>Every register and column explained, practice and quiz.</span></button>
    </div>`);
  el.querySelector("[data-x]").onclick = close;
  el.addEventListener("click", (e) => {
    const b = e.target.closest("[data-h]");
    if (!b) return;
    close();
    if (b.dataset.h === "tour") startTour(tourFor(current.path)); else navigate(b.dataset.h);
  });
};
document.body.append(help);
document.addEventListener("click", (e) => {
  if (e.target.closest("[data-menu]")) document.body.classList.add("nav-open");
  if (e.target.closest("[data-scrim]")) document.body.classList.remove("nav-open");
  const t = e.target.closest("[data-theme-btn]");
  if (t) { store.prefs.theme = t.dataset.themeBtn; store.save(); applyTheme(); }
});
document.addEventListener("keydown", (e) => {
  if (e.key === "/" && !e.target.closest("input,textarea,select")) {
    const s = $('#main input[type="search"]');
    if (s) { e.preventDefault(); s.focus(); }
  }
});
route();
connectTeam();

if ("serviceWorker" in navigator && location.protocol.startsWith("http") && window.top === window) {
  addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}
