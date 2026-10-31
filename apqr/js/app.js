// App shell: routing, navigation, top bar, global search, drag-and-drop
// import, theme and the welcome screen.
import { inViewer, canRebuild } from "./team.js"; // first: captures the pristine page shell
import * as store from "./store.js";
import * as act from "./actions.js";
import { $, $$, esc, icon, fmtN, fmtPct, fmtDate, toast, initTooltip, ragPill } from "./ui.js";
import { dashboard, annexes, finalqa, workflow, workload, insights, bindChartToggles } from "./views-overview.js";
import { tracker, plan, tasks, actions, data } from "./views-registers.js";
import { initDrawer, openProduct, refreshDrawer, closeDrawer, isOpen } from "./drawer.js";
import { productKey, todayIso } from "./engine.js";

const VIEWS = { dashboard, tracker, plan, annexes, finalqa, workflow, tasks, workload, actions, insights, data };
const NAV = [
  { sec: "Overview" },
  { id: "dashboard", label: "Command centre", icon: "dashboard" },
  { id: "tracker", label: "APQR tracker", icon: "tracker", count: (m) => m.products.length },
  { id: "plan", label: "Plan", icon: "plan", count: (m) => m.plan.length },
  { id: "annexes", label: "Annexes progress", icon: "annexes" },
  { id: "finalqa", label: "Final QA", icon: "check", count: (m) => m.kpi.fqReady || "", alert: true },
  { id: "workflow", label: "Workflow", icon: "history" },
  { sec: "Execution" },
  { id: "tasks", label: "Task register", icon: "tasks", count: (m) => m.kpi.annexOpen },
  { id: "workload", label: "Workload", icon: "workload" },
  { id: "actions", label: "Actions", icon: "edit", count: (m) => m.kpi.openActions || "", alert: false },
  { sec: "Control" },
  { id: "insights", label: "Insights", icon: "insights", count: (m) => m.quality.filter((q) => q.level === "critical" || q.level === "serious").length || "", alert: true },
  { id: "data", label: "Data & settings", icon: "data" },
];

let current = "dashboard";

// Links inside the app look like "#/tracker?rag=OVERDUE". The address bar
// only ever shows the plain view name ("#tracker"), because embedded viewers
// pass nothing but a plain #name; filter parameters stay in memory.
function parseHref(href) {
  const h = String(href || "").replace(/^#\/?/, "");
  const [path, query = ""] = h.split("?");
  const params = Object.fromEntries(new URLSearchParams(query));
  return { view: VIEWS[path] ? path : "dashboard", params };
}
let ownHash = null;

/* ------------------------------------------------------------ render */

function renderNav(m) {
  $("#nav").innerHTML = NAV.map((n) => {
    if (n.sec) return `<div class="nav-sec">${n.sec}</div>`;
    const c = store.hasData() && n.count ? n.count(m) : "";
    return `<a href="#${n.id}" class="${n.id === current ? "active" : ""}" ${n.id === current ? 'aria-current="page"' : ""}>${icon(n.icon)}<span>${n.label}</span>${c !== "" && c !== 0 ? `<span class="count ${n.alert ? "alert" : ""}">${fmtN(c)}</span>` : ""}</a>`;
  }).join("");
  const s = store.getState();
  $("#side-foot").innerHTML = store.hasData() ? `<div class="source-card"><b>${esc(s.meta.programme)}</b>${esc(s.meta.source || "Entered in the app")}
    <div class="row"><span>Report date</span><span>${fmtDate(m.report)}${s.settings.useToday ? " (today)" : ""}</span></div>
    <div class="row"><span>Tasks · plan</span><span>${fmtN(s.tasks.length)} · ${fmtN(s.plan.length)}</span></div>
    ${s.baseline ? `<div class="row"><span>Baseline</span><span>${esc(s.baseline.label)}</span></div>` : ""}</div>
    <div class="side-note">Stored in this browser only · export backups from Data &amp; settings.</div>` : `<div class="side-note">No data yet. Import your tracker or a Scigeniq export to begin.</div>`;
}

function renderTop(m) {
  const v = VIEWS[current];
  const s = store.getState();
  $("#page-title").textContent = store.hasData() ? v.title : "Welcome";
  $("#page-sub").textContent = store.hasData() ? (typeof v.sub === "function" ? v.sub(m) : v.sub) : "APQR Master Tracker";
  $("#report-chip").innerHTML = `${icon("clock")}<span>${fmtDate(m.report)}</span><small>${s.settings.useToday ? "today" : "report date"}</small>`;
  document.title = `${store.hasData() ? v.title + " · " : ""}APQR Master Tracker`;
}

function welcome() {
  return `<div class="welcome">
    <section class="hero reveal">
      <div class="grain"></div>
      <div>
        <div class="hero-eyebrow"><span class="live"></span>Annual Product Quality Review</div>
        <h2>Your APQR programme,<br><span class="grad">in one view.</span></h2>
        <p class="lead">Plan against execution, every annexe by department and stage, workload, overdue risk and data-quality signals. Calculated the same way as the master tracker workbook, and editable here.</p>
        <div class="welcome-steps">
          <div><b>1</b><span>Import the <strong>APQR master tracker</strong> workbook. It brings the plan, task register, QA comments and baseline.</span></div>
          <div><b>2</b><span>Each month, drop in the <strong>Scigeniq all-tasks export</strong> to refresh. Movement since the last extract is tracked for you.</span></div>
          <div><b>3</b><span>Update stages, owners and QA actions in the app, then export back to Excel for the management review.</span></div>
        </div>
      </div>
    </section>
    <section style="display:grid;gap:16px;align-content:start" class="reveal">
      <div class="dropzone" data-action="import" role="button" tabindex="0">
        <div class="dz-ic">${icon("upload")}</div>
        <h3>Import your tracker or Scigeniq export</h3>
        <p>Drop an .xlsx, .csv or .json backup anywhere on the page, or click here.</p>
        <div class="formats"><span class="tag info">Master tracker .xlsx</span><span class="tag info">Scigeniq export</span><span class="tag info">Plan sheet</span></div>
      </div>
      <div class="card" style="display:flex;align-items:center;gap:14px">
        <div style="flex:1"><b>Just looking?</b><div class="muted" style="font-size:13px">Explore every screen with a fictional demo programme.</div></div>
        <button class="btn" data-action="demo">${icon("sparkle")}Load demo</button>
      </div>
      <p class="muted" style="font-size:12px;margin:0 4px">Files are read in your browser and stored only on this device. Nothing is uploaded.</p>
    </section>
  </div>`;
}

function render() {
  const m = store.getModel();
  renderNav(m);
  renderTop(m);
  const host = $("#view");
  const v = VIEWS[current];
  const inner = document.createElement("div");
  try {
    inner.innerHTML = store.hasData() || current === "data" ? v.render(m) : welcome();
  } catch (e) {
    console.error(e);
    inner.innerHTML = `<div class="card"><div class="callout warn">${icon("alert")}<div>This view could not be drawn: ${esc(e.message)}</div></div></div>`;
  }
  host.replaceChildren(inner);
  if (store.hasData()) {
    const banner = teamBanner();
    if (banner) inner.insertAdjacentHTML("afterbegin", banner);
  }
  if ((store.hasData() || current === "data") && v.bind) v.bind(inner, render);
  bindChartToggles(inner, render);
}

function teamBanner() {
  if (store.hasNewerTeamVersion()) {
    const si = store.seedInfo();
    return `<div class="team-banner">${icon("info")}<span class="grow"><b>A newer team version is available</b>${si?.publishedAt ? ` (published ${fmtDate(si.publishedAt.slice(0, 10))}${si.publishedBy ? ` by ${esc(si.publishedBy)}` : ""})` : ""}. You have unpublished changes in this browser.</span><button class="btn btn-sm btn-primary" data-action="adopt-seed">Load team version</button><button class="btn btn-sm btn-ghost" data-action="dismiss-seed">Keep mine</button></div>`;
  }
  if (inViewer() && canRebuild() && store.isDirty() && current !== "data") {
    return `<div class="team-banner"><span class="team-dot"></span><span class="grow"><b>You have changes only you can see.</b> Publish them so everyone opening this tracker sees the same version.</span><button class="btn btn-sm btn-primary" data-action="publish-team">${icon("upload")}Publish for everyone</button><a class="btn btn-sm btn-ghost" href="#/data">Details</a></div>`;
  }
  return "";
}

/* ------------------------------------------------------------ routing */

function go(view, params = {}) {
  const changed = view !== current;
  current = view;
  VIEWS[view].params?.(params);
  const target = `#${view}`;
  if (location.hash !== target) {
    ownHash = target;
    try { history.replaceState(null, "", target); ownHash = null; } catch { location.hash = target; }
  }
  render();
  if (changed) { window.scrollTo(0, 0); $("#side").classList.remove("open"); }
  if (params.product && view !== "tasks") openProduct(params.product);
}
export function navigate(href) {
  const { view, params } = parseHref(href);
  go(view, params);
}
function route() {
  if (ownHash && location.hash === ownHash) { ownHash = null; return; }
  navigate(location.hash);
}

/* ------------------------------------------------------------ search */

function initSearch() {
  const input = $("#global-search");
  const pop = $("#search-pop");
  let sel = 0, items = [];
  const close = () => { pop.hidden = true; };
  const run = () => {
    const q = input.value.trim().toLowerCase();
    if (!q) { close(); return; }
    const m = store.getModel();
    const prods = m.products.filter((p) => `${p.product} ${p.ref} ${p.workflowRefs.join(" ")} ${p.qcRefs.join(" ")}`.toLowerCase().includes(q)).slice(0, 7);
    const planOnly = [];
    const people = m.workload.filter((o) => o.user.toLowerCase().includes(q)).slice(0, 4);
    const taskRef = m.tasks.filter((t) => t.ref.toLowerCase() === q).slice(0, 3);
    items = [
      ...prods.map((p) => ({ h: "Products", run: () => openProduct(p.key), html: `<span class="sp-main"><b>${esc(p.product)}</b><small class="mono">${esc(p.triggered ? p.ref : "not triggered")}</small> <small>· ${p.slotsOk}/10 annexes</small></span>${ragPill(p.rag)}` })),
      ...taskRef.filter((t) => !prods.find((p) => p.key === t.key)).map((t) => ({ h: "Tasks", run: () => openProduct(t.key), html: `<span class="sp-main"><b>${esc(t.ref)} · ${esc(t.title)}</b><small>${esc(t.product)}</small></span>` })),
      ...planOnly.map((p) => ({ h: "Planned, not triggered", run: () => { location.hash = `#/plan?q=${encodeURIComponent(p.product)}`; }, html: `<span class="sp-main"><b>${esc(p.product)}</b><small>Review ends ${esc(p.reviewEnd)} · ${esc(p.tracking)}</small></span>` })),
      ...people.map((o) => ({ h: "People", run: () => { location.hash = `#/tasks?assignee=${encodeURIComponent(o.user)}`; }, html: `<span class="sp-main"><b>${esc(o.user)}</b><small>${o.open} open · ${o.overdue} overdue</small></span>` })),
    ];
    sel = 0;
    let lastH = "";
    pop.innerHTML = items.map((it, i) => { const h = it.h !== lastH ? `<div class="sp-h">${it.h}</div>` : ""; lastH = it.h; return `${h}<button type="button" data-i="${i}" class="${i === sel ? "sel" : ""}">${it.html}</button>`; }).join("") || `<div class="sp-h">No matches</div>`;
    pop.hidden = false;
  };
  input.addEventListener("input", run);
  input.addEventListener("focus", run);
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      sel = (sel + (e.key === "ArrowDown" ? 1 : -1) + items.length) % Math.max(1, items.length);
      $$("button", pop).forEach((b) => b.classList.toggle("sel", +b.dataset.i === sel));
    } else if (e.key === "Enter" && items[sel]) { items[sel].run(); input.value = ""; close(); input.blur(); }
    else if (e.key === "Escape") { input.value = ""; close(); input.blur(); }
  });
  pop.addEventListener("mousedown", (e) => {
    const b = e.target.closest("button[data-i]");
    if (b) { e.preventDefault(); items[+b.dataset.i].run(); input.value = ""; close(); input.blur(); }
  });
  input.addEventListener("blur", () => setTimeout(close, 120));
  document.addEventListener("keydown", (e) => {
    if (e.key === "/" && !e.target.closest("input,textarea,select,[contenteditable]") && !document.querySelector("dialog[open]")) { e.preventDefault(); input.focus(); }
  });
}

/* ------------------------------------------------------------ theme */

function applyThemeIcon() {
  const dark = document.documentElement.dataset.theme === "dark" || (!document.documentElement.dataset.theme && matchMedia("(prefers-color-scheme: dark)").matches);
  $("#theme-btn").innerHTML = String(icon(dark ? "sun" : "moon"));
  $("#theme-btn").setAttribute("aria-label", dark ? "Switch to light theme" : "Switch to dark theme");
  document.querySelector('meta[name="theme-color"]').content = dark ? "#050817" : "#0a1230";
}
function toggleTheme() {
  const dark = document.documentElement.dataset.theme === "dark" || (!document.documentElement.dataset.theme && matchMedia("(prefers-color-scheme: dark)").matches);
  const next = dark ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem("apqr-theme", next); } catch { /* ignore */ }
  applyThemeIcon();
}

/* ------------------------------------------------------------ global events */

function initGlobal() {
  document.addEventListener("click", (e) => {
    const a = e.target.closest("[data-action]");
    if (a) {
      const fn = { import: act.pickFile, "export-xlsx": act.exportExcel, "export-json": act.exportJson, demo: act.loadDemo, clear: act.clearAll, "reset-seed": act.resetToSeed, "publish-team": act.publishTeam, "adopt-seed": () => { store.adoptSeed(); toast("Team version loaded", { kind: "success", action: "Undo", onAction: () => store.undo() }); }, "dismiss-seed": store.dismissNewer, print: () => window.print(), "report-date": act.editReportDate }[a.dataset.action];
      if (fn) { e.preventDefault(); fn(); }
      return;
    }
    const aa = e.target.closest("#view [data-add-action]");
    if (aa && aa.dataset.addAction) { e.stopPropagation(); act.editAction(aa.dataset.addAction, null); return; }
    const op = e.target.closest("[data-open-product]");
    if (op) { openProduct(op.dataset.openProduct); return; }
    const link = e.target.closest('a[href^="#"]');
    if (link && !e.ctrlKey && !e.metaKey) { e.preventDefault(); if (link.closest("#drawer")) closeDrawer(); navigate(link.getAttribute("href")); return; }
    if (e.target.closest("select,input,textarea,button:not([data-href]),a[href]")) return;
    const row = e.target.closest("#view tr[data-key]");
    if (row) { openProduct(row.dataset.key); return; }
    const href = e.target.closest("[data-href]");
    if (href) navigate(href.dataset.href);
  });
  document.addEventListener("change", (e) => {
    const t = e.target;
    if (t.dataset.taskStage) act.setTaskStage(t.dataset.taskStage, t.value);
    else if (t.dataset.taskAssignee !== undefined) act.setTaskAssignee(t.dataset.taskAssignee, t.value.trim());
  });
  $("#file-input").addEventListener("change", (e) => { const f = e.target.files[0]; e.target.value = ""; act.handleFile(f); });
  $("#import-btn").innerHTML = `${icon("upload")}<span>Import</span>`;
  $("#import-btn").addEventListener("click", act.pickFile);
  $("#report-chip").addEventListener("click", act.editReportDate);
  $("#theme-btn").addEventListener("click", toggleTheme);
  $("#menu-btn").innerHTML = String(icon("menu"));
  $("#menu-btn").addEventListener("click", () => $("#side").classList.toggle("open"));
  $("#search-ic").innerHTML = String(icon("search"));
  $("#dropveil-ic").innerHTML = String(icon("upload"));

  // drag & drop anywhere
  let depth = 0;
  const veil = $("#dropveil");
  const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes("Files");
  window.addEventListener("dragenter", (e) => { if (!hasFiles(e)) return; e.preventDefault(); depth++; veil.hidden = false; });
  window.addEventListener("dragover", (e) => { if (hasFiles(e)) e.preventDefault(); });
  window.addEventListener("dragleave", (e) => { if (!hasFiles(e)) return; depth = Math.max(0, depth - 1); if (!depth) veil.hidden = true; });
  window.addEventListener("drop", (e) => { if (!hasFiles(e)) return; e.preventDefault(); depth = 0; veil.hidden = true; act.handleFile(e.dataTransfer.files[0]); });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && $("#side").classList.contains("open")) $("#side").classList.remove("open");
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !e.target.closest("input,textarea") && store.canUndo()) { e.preventDefault(); store.undo(); toast("Undone"); }
  });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applyThemeIcon);
}

/* ------------------------------------------------------------ boot */

store.subscribe((ev) => {
  if (ev.type === "save-error") { toast("Couldn’t save to browser storage (it may be full or blocked). Export a backup to keep your changes.", { kind: "error", timeout: 9000 }); return; }
  render();
  refreshDrawer();
});

initTooltip();
initGlobal();
initDrawer();
initSearch();
applyThemeIcon();
window.addEventListener("hashchange", route);
route();

// Recompute at midnight when the report date follows today.
setInterval(() => { if (store.getState().settings.useToday && store.getModel().report !== todayIso()) store.refresh(); }, 60000);

if ("serviceWorker" in navigator && location.protocol !== "file:" && !window.claude) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

// Debug handle for the console.
window.apqr = { store, productKey };
