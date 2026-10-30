// App shell: navigation rail, hash router and the home page (the Tier 1 →
// Tier 2 → Tier 3 cascade).

import { store, HAS_REAL } from "./store.js";
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

store.load();
E.linkTier1(() => store.t1);

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
      <a class="card card-pad" href="#/learn" style="text-decoration:none;color:var(--ink);display:grid;gap:8px;min-width:240px">
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
  const [a, b, c] = parts;
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
  else { renderHome(view); titles.push("Overview"); }
  document.title = `${titles[0]} · QA Tier Boards`;
  $(".topbar b").textContent = titles[0];
  markNav();
  if (soft) scrollTo(0, y); else if (!query.keep) scrollTo(0, 0);
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
      ${HAS_REAL ? `<button class="lcard" data-start="real" style="text-align:left;cursor:pointer"><b>The El Kendi data</b><span>Imported 30/10/2026: shop-floor batch records, sampling, line clearance and IPC, oncology deviations, the APQR programme and the QA personnel list.</span></button>` : ""}
      <button class="lcard" data-start="mine" style="text-align:left;cursor:pointer"><b>The boards in this browser</b><span>Everything you have entered or changed here so far.</span></button>
      <button class="lcard" data-start="demo" style="text-align:left;cursor:pointer"><b>The September 2026 demo</b><span>Made-up training data for the masterclass.</span></button>
      <button class="lcard" data-start="blank" style="text-align:left;cursor:pointer"><b>Empty registers</b><span>Keeps setup, targets, roster and lists; registers start empty.</span></button>
    </div><p class="muted" style="margin:0;font-size:12.5px">The first upload sends several hundred records; keep the page open until the status in the menu says “Shared with your team · live”.</p>`,
  { onClose: () => { setupDialog = null; } });
  setupDialog.el.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-start]");
    if (!b) return;
    setupDialog.el.querySelectorAll("button").forEach((x) => { x.disabled = true; });
    // someone else may have set it up meanwhile: join theirs instead
    if (await sync.probe().catch(() => false)) { setupDialog.close(); join(sync); toast("A teammate has already set up the shared board — you joined it"); return; }
    if (b.dataset.start === "demo") { store.reset("t1", "demo"); store.reset("t2", "demo"); }
    if (b.dataset.start === "real") { store.reset("t1", "real"); store.reset("t2", "real"); }
    if (b.dataset.start === "blank") { store.blank("t1"); store.blank("t2"); }
    store.attachSync(sync, { upload: true });
    team.mode = "live"; paintTeam();
    setupDialog.close();
    route({ soft: true });
    toast("Shared board created — your team now sees the same data");
  });
}

/** Switch this page to the shared copy that now exists. */
function join(sync) {
  if (store.sync) return;
  store.attachSync(sync);
  store.applyRemote("t1"); store.applyRemote("t2");
  team.mode = sync.readOnly ? "readonly" : "live"; paintTeam();
  route({ soft: true });
  if (HAS_REAL) offerRealData(); else offerDemo();
}

/** Once, to the owner: the shared board holds site data this version does not
 * include — return it to the September 2026 demo for everyone? */
async function offerDemo() {
  if (HAS_REAL || !store.t2.dataset || store.t2.dataset === "demo-2026-09" || store.prefs.demoOffered === store.t2.dataset) return;
  const owner = store.user ? await store.user.isOwner().catch(() => false) : false;
  if (!owner) return;
  const { el, close } = modal(`<div class="eyebrow">Demo version</div><h2>Return the shared board to the demo?</h2>
    <p style="margin:0">This version of the boards ships the September 2026 demo only, but the shared board still holds the site data loaded earlier. Returning it to the demo deletes the site records from the shared board <b>for everyone on the team</b> and loads the demo in their place.</p>
    <div class="actions"><button class="btn" data-later>Keep the site data</button><button class="btn primary" data-demo>Return to the demo for the team</button></div>`);
  el.querySelector("[data-later]").onclick = () => { store.prefs.demoOffered = store.t2.dataset; store.save(); close(); };
  el.querySelector("[data-demo]").onclick = () => {
    store.reset("t1", "demo"); store.reset("t2", "demo");
    store.save();
    close(); route({ soft: true });
    toast("Shared board returned to the demo — keep the page open until the status says live");
  };
}

/** Once, to the owner: the shared board still holds the demo — load the El Kendi data? */
async function offerRealData() {
  if (!HAS_REAL || store.t2.dataset === "elkendi-2026-10-30" || store.prefs.realOffered) return;
  const owner = store.user ? await store.user.isOwner().catch(() => false) : false;
  if (!owner) return;
  const { el, close } = modal(`<div class="eyebrow">El Kendi data available</div><h2>Replace the demo on the shared board?</h2>
    <p style="margin:0">The shared board still holds the September 2026 demo. The real El Kendi data imported on 30/10/2026 is ready: 11 QA staff from QA0007E/Onc/TE01, 359 officer-days of shop-floor activity, 51 batches, 75 batch-record reviews, 19 oncology deviations (QE-KO), 163 APQRs and 136 Scigeniq tasks.</p>
    <p style="margin:0">Loading it replaces the demo <b>for everyone on the team</b>. The settings your team changed (month, status date) are replaced too.</p>
    <div class="actions"><button class="btn" data-later>Not now</button><button class="btn primary" data-load>Load the El Kendi data for the team</button></div>`);
  el.querySelector("[data-later]").onclick = () => { store.prefs.realOffered = true; store.save(); close(); };
  el.querySelector("[data-load]").onclick = () => {
    store.reset("t1", "real"); store.reset("t2", "real");
    store.prefs.realOffered = true; store.save();
    close(); route({ soft: true });
    toast("El Kendi data loaded for the whole team — keep the page open until the status says live");
  };
}

async function connectTeam() {
  const api = window.claude?.use ? window.claude : null;
  const db = api ? await api.use("db").catch(() => null) : null;
  if (!db) { team.mode = "local"; paintTeam(); return; }
  const user = await api.use("user").catch(() => null);
  store.user = user;
  const dirty = new Set();
  let timer = null;
  const sync = createSync({
    db, user,
    onStatus: (st) => { team.pending = st.pending; team.failed = st.failed; if (st.readOnly) team.mode = "readonly"; paintTeam(); },
    onRemote: (tier) => {
      if (tier === "readonly") { team.mode = "readonly"; paintTeam(); toast("You can view the shared board but not change it"); return; }
      dirty.add(tier);
      clearTimeout(timer);
      // a burst of changes (a first upload, a reload of the demo) is applied once
      timer = setTimeout(() => {
        const tiers = [...dirty]; dirty.clear();
        if (!store.sync) {
          if (sync.ready("t1") && sync.ready("t2")) { setupDialog?.close(); join(sync); }
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
connectTeam();

if ("serviceWorker" in navigator && location.protocol.startsWith("http") && window.top === window) {
  addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}
