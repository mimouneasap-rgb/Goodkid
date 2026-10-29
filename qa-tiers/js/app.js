// App shell: navigation rail, hash router and the home page (the Tier 1 →
// Tier 2 → Tier 3 cascade).

import { store } from "./store.js";
import * as E from "./engine.js";
import { T1_REGISTERS, T2_REGISTERS, T1_ORDER, T2_ORDER } from "./schema.js";
import { ring } from "./charts.js";
import { renderRegister } from "./registers.js";
import * as T1 from "./views-t1.js";
import * as T2 from "./views-t2.js";
import { renderSetupT1, renderSetupT2, renderAudit } from "./setup.js";
import { renderLearnHome, renderModule, learnProgress, RHYTHM } from "./learn.js";
import { esc, pill, fmtLong, fmtMonth, closeDrawer, initTooltips, $, $$ } from "./ui.js";

store.load();

/* ── Theme ─────────────────────────────────────────────── */
function applyTheme() {
  const t = store.prefs.theme || "system";
  if (t === "system") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.dataset.theme = t;
}
applyTheme();

/* ── Navigation ────────────────────────────────────────── */
function flagCounts() {
  const t2 = E.t2Computed(store.t2);
  const t1 = E.t1Computed(store.t1, store.t1.setup.selDate);
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
    <a class="brand" href="#/home"><span class="brand-mark">QA</span><span><b>Tier Boards</b><small>${esc(store.t2.setup.site.split("—")[0].trim())}</small></span></a>
    <nav class="nav">
      ${a("home", "⌂", "Overview")}
      <a href="#/learn" data-nav="learn"><span class="ic">🎓</span>Masterclass<span class="badge soft">${lp.done}/${lp.total}</span></a>
      <div class="nav-group"><div class="nav-title" style="--dot:var(--s2)"><i class="tier-dot"></i>Tier 1 · Huddle 08:30</div>
        ${a("t1/board", "◫", "Huddle board")}
        ${T1_ORDER.map((r) => a(`t1/reg/${r}`, T1_REGISTERS[r].icon, T1_REGISTERS[r].short)).join("")}
        ${a("t1/skills", "▦", "Skills matrix")}
        ${a("t1/setup", "⚙", "Setup")}
      </div>
      <div class="nav-group"><div class="nav-title" style="--dot:var(--accent-2)"><i class="tier-dot"></i>Tier 2 · Stand-up 10:30</div>
        ${a("t2/board", "◫", "Dashboard")}
        ${a("t2/calendar", "▣", "Daily Log")}
        ${T2_ORDER.map((r) => a(`t2/reg/${r}`, T2_REGISTERS[r].no, T2_REGISTERS[r].short)).join("")}
        ${a("t2/trend", "↗", "KPI Trend")}
        ${a("t2/analytics", "◔", "Analytics")}
        ${a("t2/setup", "⚙", "Setup")}
      </div>
      <div class="nav-group"><div class="nav-title">Data integrity</div>${a("audit", "⎘", "Change history")}</div>
    </nav>
    <div class="rail-foot">
      <div class="row" role="group" aria-label="Theme">${["system", "light", "dark"].map((t) => `<button class="rail-btn" data-theme-btn="${t}" aria-pressed="${(store.prefs.theme || "system") === t}">${t[0].toUpperCase() + t.slice(1)}</button>`).join("")}</div>
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
  const path = location.hash.replace(/^#\/?/, "").split("?")[0] || "home";
  $$("[data-nav]").forEach((a) => {
    const n = a.dataset.nav;
    const on = path === n || (n === "learn" && path.startsWith("learn"));
    if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  });
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

  root.innerHTML = `
    <section class="hero" style="padding:26px 28px">
      <div class="hero-grid"><div>
        <div class="eyebrow">${esc(t2.setup.site)} · Quality Assurance</div>
        <h1>One team — one standard — zero compromise</h1>
        <p>The Tier 1 huddle board and the Tier 2 daily management board, connected: officers log the floor, the boards build themselves, and what cannot be solved climbs a tier the same day.</p>
        <div class="hero-meta"><span class="chip">Tier 1 date <b>${fmtLong(t1.setup.selDate)}</b></span><span class="chip">Tier 2 month <b>${fmtMonth(t2.setup.month)}</b> · as of <b>${fmtLong(t2.setup.statusDate)}</b></span></div>
      </div>
      <a class="card card-pad" href="#/learn" style="text-decoration:none;color:inherit;display:grid;gap:8px;min-width:240px">
        <span class="eyebrow">Masterclass</span><b style="font:600 18px var(--font-display)">Data entry, step by step</b>
        <div class="progress"><i style="width:${lp.pct * 100}%"></i></div><span class="muted" style="font-size:12.5px">${lp.done} of ${lp.total} modules completed ›</span></a></div>
    </section>

    <div class="cascade">
      <a class="card tier-card" href="#/t1/board">
        <div class="row"><span class="t-badge">TIER 1 · 08:30</span><span class="spacer"></span>${ring(health.score, health.rag, { size: 64, thick: 7 })}</div>
        <h2>Shop-floor huddle</h2><span class="t-when">${esc(t1.setup.location)} · ${t1.roster.length} officers · SQDCP</span>
        <div class="t-stats"><div><b>${t1Today.present}/${t1Today.roster}</b><span>present</span></div><div><b style="color:${redLetters.length ? "var(--r)" : "var(--g)"}">${redLetters.length ? redLetters.join(" ") : "—"}</b><span>red letters today</span></div><div><b>${t1Today.overdue}</b><span>overdue actions</span></div></div>
        <span class="pill ${t1esc.length ? "A" : "G"}">${t1esc.length} open escalation${t1esc.length === 1 ? "" : "s"} to Tier 2</span>
      </a>
      <span class="cascade-arrow" style="left:33.33%">›</span>
      <a class="card tier-card" href="#/t2/board">
        <div class="row"><span class="t-badge">TIER 2 · ${esc(t2.setup.meetingTime)}</span><span class="spacer"></span>${ring(pulse.score, pulse.rag, { size: 64, thick: 7 })}</div>
        <h2>QA daily management</h2><span class="t-when">${esc(t2.setup.location)} · owner ${esc(t2.setup.owner)}</span>
        <div class="t-stats"><div><b>${pulse.g}/${pulse.g + pulse.a + pulse.r}</b><span>KPIs on target</span></div><div><b style="color:${overdue2 ? "var(--r)" : "var(--g)"}">${overdue2}</b><span>overdue items</span></div><div><b>${cal.filter((d) => d.code === 3).length}</b><span>critical days</span></div></div>
        <span class="pill ${openEsc.length ? "A" : "G"}">${openEsc.length} open escalation${openEsc.length === 1 ? "" : "s"} to Tier 3</span>
      </a>
      <span class="cascade-arrow" style="left:66.66%">›</span>
      <a class="card tier-card" href="#/t2/reg/esc">
        <span class="t-badge">TIER 3 · SITE</span><h2>Site management</h2><span class="t-when">Decisions, resources, budget</span>
        ${openEsc.length ? `<div class="urgent">${openEsc.map(({ r, c }) => `<span class="u-item"><span class="ref">${esc(r.id)}</span><span class="desc">${esc(r.desc)}</span>${pill(c.live === "Overdue" ? "Overdue" : r.status)}</span>`).join("")}</div>` : `<div class="empty">No open escalation</div>`}
      </a>
    </div>

    <div class="card-head" style="margin:22px 0 10px"><h2 style="font-size:15px;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-2)">The daily rhythm</h2><div class="legend"><span><i class="bg-s2"></i>Tier 1</span><span><i style="background:var(--accent)"></i>Tier 2</span></div></div>
    <div class="rhythm">${RHYTHM.map((r) => `<div class="${r.tier}"><b>${r.t}</b><strong>${esc(r.title)}</strong><span>${esc(r.text)}</span></div>`).join("")}</div>

    <div class="card-head" style="margin:22px 0 10px"><h2 style="font-size:15px;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-2)">Needs attention before the meetings</h2></div>
    ${attention ? `<div class="tiles">${attention}</div>` : `<div class="empty">Every register is consistent and nothing is overdue.</div>`}

    <div class="card-head" style="margin:22px 0 10px"><h2 style="font-size:15px;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-2)">Go to</h2></div>
    <div class="tiles">
      ${[["t1/board", "TIER 1", "Huddle board", "SQDCP letters · 20 KPIs"], ["t2/board", "TIER 2", "Dashboard", "Q-calendar · 9 KPIs · top 5"], ["t2/calendar", "TIER 2", "Daily Log", "Q-calendar engine & priorities"],
        ["t2/analytics", "TIER 2", "Analytics", "8 live charts"], ["t2/trend", "TIER 2", "KPI Trend", "12-month history"], ["t1/skills", "TIER 1", "Skills matrix", "Who can do what"],
        ["t2/setup", "TIER 2", "Setup", "Month, targets, lists"], ["learn", "LEARN", "Masterclass", "8 modules · practice · quiz"]]
        .map(([h, n, b, s]) => `<a class="card nav-tile" href="#/${h}"><span class="no">${n}</span><b>${b}</b><span>${s}</span></a>`).join("")}
    </div>`;
}

/* ── Router ────────────────────────────────────────────── */
function parse() {
  const raw = location.hash.replace(/^#\/?/, "");
  const [path, qs = ""] = raw.split("?");
  const query = Object.fromEntries(new URLSearchParams(qs));
  return { parts: (path || "home").split("/"), query };
}

function route() {
  closeDrawer();
  $$(".overlay, .dialog").forEach((x) => x.remove());
  document.body.classList.remove("nav-open");
  const main = $("#main");
  main.innerHTML = "";
  const view = document.createElement("div");
  main.append(view);
  const { parts, query } = parse();
  const [a, b, c] = parts;
  const titles = [];
  if (a === "home") { renderHome(view); titles.push("Overview"); }
  else if (a === "learn") { if (b) renderModule(view, b); else renderLearnHome(view); titles.push("Masterclass"); }
  else if (a === "t1" && b === "board") { T1.renderBoard(view); titles.push("Tier 1 huddle board"); }
  else if (a === "t1" && b === "skills") { T1.renderSkills(view); titles.push("Skills matrix"); }
  else if (a === "t1" && b === "setup") { renderSetupT1(view); titles.push("Tier 1 setup"); }
  else if (a === "t1" && b === "reg" && T1_REGISTERS[c]) { renderRegister(view, { tier: "t1", reg: c, query }); titles.push(T1_REGISTERS[c].title); }
  else if (a === "t2" && b === "board") { T2.renderBoard(view); titles.push("Tier 2 dashboard"); }
  else if (a === "t2" && b === "calendar") { T2.renderCalendar(view); titles.push("Daily Log"); if (query.day) T2.dayEditor(query.day, () => route()); }
  else if (a === "t2" && b === "trend") { T2.renderTrend(view); titles.push("KPI Trend"); }
  else if (a === "t2" && b === "analytics") { T2.renderAnalytics(view); titles.push("Analytics"); }
  else if (a === "t2" && b === "setup") { renderSetupT2(view); titles.push("Tier 2 setup"); }
  else if (a === "t2" && b === "reg" && T2_REGISTERS[c]) { renderRegister(view, { tier: "t2", reg: c, query }); titles.push(T2_REGISTERS[c].title); }
  else if (a === "audit") { renderAudit(view); titles.push("Change history"); }
  else { renderHome(view); titles.push("Overview"); }
  document.title = `${titles[0]} · QA Tier Boards`;
  $(".topbar b").textContent = titles[0];
  markNav();
  if (!query.keep) scrollTo(0, 0);
}

/* ── Boot ──────────────────────────────────────────────── */
document.body.innerHTML = `
  <div class="topbar"><button aria-label="Open menu" data-menu>☰</button><b>QA Tier Boards</b></div>
  <div class="scrim" data-scrim></div>
  <div class="shell"><aside class="rail" aria-label="Navigation"></aside><main class="main" id="main"></main></div>`;
renderNav();
initTooltips();
addEventListener("hashchange", route);
store.onChange(() => renderNav());
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

if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}
