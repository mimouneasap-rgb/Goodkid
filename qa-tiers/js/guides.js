// Guidance: the "Start here" page for a blank board (identity, team,
// products, targets, first records — with live progress), the written
// how-to guides for every routine (daily, weekly, month-end, exports), and
// guided tours that walk through the real screens, highlighting each control.

import { store } from "./store.js";
import { EDITION, hasTier, ONE_TIER } from "./edition.js";
import * as E from "./engine.js";
import { T1_ORDER, T2_ORDER } from "./schema.js";
import { esc, fmtLong, fmtMonth, toast, fresh, today, $, $$ } from "./ui.js";

const has = (v) => v !== "" && v != null;
let nav = (h) => { location.hash = h; };
export function initGuides(navigate) { nav = navigate; }

/* ── guided tours ────────────────────────────────────────── */

export const TOURS = {
  start: { title: "Start from a blank board", steps: [
    { route: "#/start", sel: "[data-ob=identity]", title: "1 · Name the boards", text: "Type the site, the department and the board owner. They appear on every page, report and picture." },
    { route: "#/start", sel: "[data-ob=team]", title: "2 · Add the team", text: "One line per person: name and position. Tick “Tier 1 officer” for the shop-floor officers — they join the huddle roster. Each person is added to every owner drop-down and to the QA load register." },
    { route: "#/start", sel: "[data-ob=products]", title: "3 · Add the products", text: "The products you make. They feed the product drop-downs of both boards and the product filters." },
    { route: "#/t2/setup", sel: "[data-path='setup.month']", title: "4 · Check the reporting month", text: `The board starts in ${EDITION.label}. At each month-end the close rolls it to the next month.` },
    { route: "#/t2/setup", sel: ".card:nth-of-type(3)", title: "5 · Review the KPI targets", text: "Targets and amber limits drive every RAG colour. Align them with the site Quality Manual." },
    { route: "#/start", sel: "[data-ob=first]", title: "6 · Enter the first records", text: "Start with today's events: the Tier 1 daily log of each officer, then deviations, CAPA and changes as they arrive in the eQMS." },
    { route: "#/guide", sel: "[data-guide=daily]", title: "7 · Then follow the daily routine", text: "This guide lists what to enter, when, and who does it — every day, every week and at month-end." },
  ] },
  daily: { title: "The daily routine", steps: [
    { route: "#/t1/reg/dl", sel: "[data-new]", title: "08:00 · Tier 1 daily log", text: "Each officer adds one line for the day: shift, attendance and the counts of line clearances, IPC, AQL, records, Gemba, findings." },
    { route: "#/t1/board", sel: "[data-export-block]", title: "08:30 · Tier 1 huddle", text: "The SQDCP letters colour themselves from the logs. Red letter → an action with an owner and a due date." },
    { route: "#/t2/board", sel: ".kpi-grid", title: "10:30 · Tier 2 dashboard", text: "Nine KPIs, the Quality Pulse and the Q-calendar recalculate from the registers. Hover a tile for its formula." },
    { route: "#/t2/board", sel: "[data-standup]", title: "Run the stand-up", text: "15 minutes, seven agenda steps with the live data of each; the Top 3 priorities are saved to today's Daily Log." },
    { route: "#/t2/board", sel: "[data-fbar]", title: "Filter the board", text: "One person's board, one product's or one area's: every KPI and list recalculates on the records that pass." },
    { route: "#/report", sel: "[data-type=daily]", title: "After the stand-up · daily report", text: "A one-click Word report and a summary to paste into an e-mail or chat. Tick the daily routine as you go." },
  ] },
  weekly: { title: "The weekly review", steps: [
    { route: "#/t2/analytics", sel: "[data-fbar]", title: "Filters for every metric", text: "Filter the whole page by period, person, area, product, classification, type, source, department, root cause, recorded status, risk, effectiveness or register — or one chart with its own ⚲ Filter." },
    { route: "#/t2/analytics", sel: "[data-chart=flow]", title: "Raised vs closed", text: "Is the backlog growing? Two lines, twelve weeks, ending on the as-of date." },
    { route: "#/t2/analytics", sel: "[data-chart=ageing]", title: "Ageing", text: "How old the open items are, register by register — dark blue is over 90 days." },
    { route: "#/t2/analytics", sel: "[data-chart=overdueowner]", title: "Overdue by person", text: "Who needs support this week. Hover a bar for the registers behind it." },
    { route: "#/report", sel: "[data-type=weekly]", title: "The weekly review report", text: "The week in numbers vs last week, KPIs, Q-calendar and SQDCP week, overdue and next-week items, QA load and escalations." },
  ] },
  monthend: { title: "Month-end close & storage", steps: [
    { route: "#/close", sel: ".steps", title: "Ten steps, in order", text: "Each step shows whether the boards already show it done. Tick the others when they are." },
    { route: "#/close", sel: "[data-step=freeze]", title: "Freeze the KPIs", text: "Copies the live KPIs into the month column of KPI Trend — the history and next month's arrows come from it." },
    { route: "#/close", sel: "[data-step=report]", title: "The monthly management pack", text: "Cover, document control, contents, executive summary, KPIs, every chart, every register, QA load, Tier 1, data quality, commentary and sign-off." },
    { route: "#/close", sel: "[data-step=archive]", title: "Archive the boards", text: "A frozen copy of both boards, kept in the shared archive: anyone can re-open this month read-only later." },
    { route: "#/close", sel: "[data-step=file]", title: "File the pack", text: "One ZIP for the controlled folder: Word pack, chart pictures, every register as CSV, the boards snapshot and the filing instructions." },
    { route: "#/archive", sel: "[data-list]", title: "Look back any time", text: "Open an archived month read-only, download its JSON, or open a filed pack's JSON." },
  ] },
  exports: { title: "Filters & exports", steps: [
    { route: "#/t2/analytics", sel: "[data-png]", title: "Export a chart", text: "PNG at 2×, 3× or 4× (print), in the light print colours or as on screen, on its card, white or transparent; copy it to the clipboard; or take the SVG vector or the CSV figures." },
    { route: "#/t2/analytics", sel: "[data-export-all]", title: "Every chart at once", text: "One ZIP with every chart of the page as PNG plus the CSV tables behind them." },
    { route: "#/t2/reg/dev", sel: "[data-moref]", title: "Register filters", text: "Every drop-down field and a date range; the quick buttons show open, overdue, due within 7 days or raised this month. CSV exports what the filters show." },
  ] },
};

let tour = null;
const stepShown = (st) => !(/^#\/t1\//.test(st.route) && !hasTier("t1")) && !(/^#\/(t2\/|import|start)/.test(st.route) && !hasTier("t2")) && !(st.sel === "[data-step=freeze]" && !hasTier("t2"));
const tourOf = (id) => { const t = TOURS[id]; return t && { ...t, steps: t.steps.filter(stepShown) }; };
export function startTour(id) {
  const t = tourOf(id);
  if (!t?.steps.length) return;
  endTour();
  tour = { id, i: 0, t };
  showStep();
}
export function endTour() {
  document.querySelectorAll(".tour-hole, .tour-pop").forEach((n) => n.remove());
  removeEventListener("resize", place); removeEventListener("scroll", place, true);
  document.removeEventListener("keydown", keys);
  tour = null;
}
const keys = (e) => { if (!tour) return; if (e.key === "Escape") endTour(); if (e.key === "ArrowRight") go(1); if (e.key === "ArrowLeft") go(-1); };
function go(d) { if (!tour) return; const n = tour.i + d; if (n < 0) return; if (n >= tour.t.steps.length) { endTour(); toast("Tour finished — the guides page lists every routine step by step"); return; } tour.i = n; showStep(); }

let target = null;
function place() {
  const hole = $(".tour-hole"), pop = $(".tour-pop");
  if (!pop) return;
  if (!target || !document.contains(target)) { if (hole) hole.style.display = "none"; pop.style.left = `${(innerWidth - pop.offsetWidth) / 2}px`; pop.style.top = `${Math.max(16, (innerHeight - pop.offsetHeight) / 2)}px`; return; }
  const r = target.getBoundingClientRect();
  const pad = 6;
  Object.assign(hole.style, { display: "block", left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${Math.min(r.height, innerHeight - 40) + pad * 2}px` });
  const below = r.bottom + 14 + pop.offsetHeight < innerHeight;
  const top = below ? r.bottom + 14 : Math.max(12, r.top - pop.offsetHeight - 14);
  pop.style.top = `${top}px`;
  pop.style.left = `${Math.max(12, Math.min(innerWidth - pop.offsetWidth - 12, r.left))}px`;
}

async function showStep() {
  const st = tour.t.steps[tour.i];
  const cur = location.hash.replace(/^#\/?/, "").replace(/\//g, "-");
  const want = st.route.replace(/^#\/?/, "").replace(/\//g, "-");
  if (st.route && cur !== want) nav(st.route);
  let el = null;
  for (let k = 0; k < 25 && !el; k++) { el = st.sel ? document.querySelector(`#main ${st.sel}`) : null; if (!el) await new Promise((r) => setTimeout(r, 80)); }
  if (!tour) return;
  target = el;
  el?.scrollIntoView({ block: "center", behavior: "instant" });
  document.querySelectorAll(".tour-hole, .tour-pop").forEach((n) => n.remove());
  const hole = document.createElement("div"); hole.className = "tour-hole";
  const pop = document.createElement("div"); pop.className = "tour-pop"; pop.setAttribute("role", "dialog");
  pop.innerHTML = `<span class="prog">${esc(tour.t.title)} · step ${tour.i + 1} of ${tour.t.steps.length}</span><h3>${esc(st.title)}</h3><p>${esc(st.text)}</p>${el ? "" : `<p class="muted" style="font-size:12px">(This part of the page is not shown right now.)</p>`}
    <div class="row"><button class="btn sm ghost" data-tend>End tour</button><span class="spacer"></span><button class="btn sm" data-tprev ${tour.i ? "" : "disabled"}>‹ Back</button><button class="btn sm primary" data-tnext>${tour.i === tour.t.steps.length - 1 ? "Finish" : "Next ›"}</button></div>`;
  document.body.append(hole, pop);
  pop.querySelector("[data-tend]").onclick = endTour;
  pop.querySelector("[data-tprev]").onclick = () => go(-1);
  pop.querySelector("[data-tnext]").onclick = () => go(1);
  addEventListener("resize", place); addEventListener("scroll", place, true);
  document.addEventListener("keydown", keys);
  place();
  pop.querySelector("[data-tnext]").focus();
}

/** The tour that fits a page, for the help button. */
export function tourFor(path) {
  if (path.startsWith("start")) return "start";
  if (path.startsWith("t2/analytics")) return "weekly";
  if (path.startsWith("close") || path.startsWith("archive")) return "monthend";
  if (path.startsWith("t1") || path.startsWith("t2/board") || path === "report") return "daily";
  if (path.startsWith("t2/reg")) return "exports";
  return "start";
}

/* ── Start here (blank board onboarding) ─────────────────── */

export function startProgress() {
  const t1 = store.t1, t2 = store.t2;
  const records = T2_ORDER.filter((r) => r !== "load").some((r) => t2[r]?.length) || T1_ORDER.some((r) => t1[r]?.length);
  const items = [
    ["identity", "Name the boards", has(t2.setup.owner) && has(t2.setup.site)],
    ["team", "Add the team", t2.load.length > 0 && t1.roster.length > 0],
    ["products", "Add the products", (t2.lists.Products || []).length > 0],
    ["targets", "Review the KPI targets", !!t2.routine?.start?.targets],
    ["first", "Enter the first records", records],
    ["daily", "Log the first stand-up", Object.keys(t2.daily || {}).length > 0 || t1.hd.length > 0],
    ["share", "Invite the team", !!t2.routine?.start?.share],
  ];
  return { items, done: items.filter((x) => x[2]).length, total: items.length };
}

export function renderStart(root) {
  root = fresh(root);
  const t1 = store.t1, t2 = store.t2, st = t2.setup;
  const pr = startProgress();
  const ok = Object.fromEntries(pr.items.map(([k, , v]) => [k, v]));
  const people = t2.load.map((r) => ({ name: r.member, role: r.role, t1: t1.roster.some((o) => o.name === r.member) }));
  const inp = (tier, path, label, o = {}) => {
    let v = store[tier]; for (const k of path) v = v?.[k];
    return `<label class="field"><span>${esc(label)}</span>${o.options ? `<select data-ob-path="${tier}:${path.join(".")}"><option value="">—</option>${o.options.map((x) => `<option ${x === v ? "selected" : ""}>${esc(x)}</option>`).join("")}</select>` : `<input data-ob-path="${tier}:${path.join(".")}" value="${esc(v ?? "")}" ${o.type ? `type="${o.type}"` : ""} placeholder="${esc(o.ph || "")}">`}${o.help ? `<small>${esc(o.help)}</small>` : ""}</label>`;
  };
  const stepHead = (key, n, title, sub) => `<div class="card-head"><h2><span class="lcard-n ${ok[key] ? "ok" : ""}">${ok[key] ? "✓" : n}</span> ${esc(title)} <span class="sub">${esc(sub)}</span></h2></div>`;
  root.innerHTML = `
    <section class="hero"><div class="hero-grid"><div>
      <div class="eyebrow">Start here · ${esc(fmtMonth(st.month))} board</div><h1>Set up your boards in seven steps</h1>
      <p>The boards start empty for ${esc(fmtMonth(st.month))}: the registers, drop-down lists, KPI targets and the QA activity catalogue are ready — add your site, your team and your products, then enter the first records. About 20 minutes.</p></div>
      <div style="display:grid;gap:8px;justify-items:end"><span class="chip">${pr.done} of ${pr.total} done</span><div class="progress" style="width:220px"><i style="width:${(pr.done / pr.total) * 100}%"></i></div><button class="btn primary" data-tour="start">▶ Guided tour</button></div></div></section>
    <div class="stack">
      <div class="card card-pad" data-ob="identity">${stepHead("identity", 1, "Name the boards", "shown on every page, report and picture")}
        <div class="setup-grid">
          ${inp("t2", ["setup", "site"], "Site", { ph: "e.g. Laboratoire … — Oncology OSD site" })}
          ${inp("t2", ["setup", "department"], "Department")}
          ${inp("t2", ["setup", "owner"], "Tier 2 board owner", { ph: "Name" })}
          ${inp("t2", ["setup", "ownerRole"], "Owner's position", { ph: "e.g. Senior QA Officer" })}
          ${inp("t2", ["setup", "meetingTime"], "Tier 2 stand-up time")}
          ${inp("t2", ["setup", "location"], "Stand-up location")}
          ${inp("t1", ["setup", "owner"], "Tier 1 huddle owner", { ph: "Supervisor who runs the huddle" })}
          ${inp("t1", ["setup", "huddleTime"], "Tier 1 huddle time")}
          ${inp("t2", ["setup", "weekend1"], "Weekend day 1", { options: E.WEEKDAYS })}
          ${inp("t2", ["setup", "weekend2"], "Weekend day 2", { options: E.WEEKDAYS })}
        </div></div>
      <div class="card card-pad" data-ob="team">${stepHead("team", 2, "Add the team", `${people.length} people · ${t1.roster.length} Tier 1 officers (up to 6)`)}
        <form class="add-row" data-addperson style="flex-wrap:wrap;gap:8px">
          <input class="input" name="name" placeholder="Full name" required style="min-width:200px">
          <input class="input" name="role" placeholder="Position, e.g. QA Officer" list="ob-roles" style="min-width:200px"><datalist id="ob-roles">${(t2.lists.Roles || []).map((r) => `<option>${esc(r)}</option>`).join("")}</datalist>
          <label class="row" style="gap:6px;font-size:13px"><input type="checkbox" name="t1" checked> Tier 1 officer</label>
          <select class="input" name="shift"><option value="">Shift</option>${(t1.lists.Shifts || []).map((x) => `<option>${esc(x)}</option>`).join("")}</select>
          <button class="btn primary">＋ Add</button></form>
        ${people.length ? `<table class="plain" style="margin-top:10px"><thead><tr><th>Name</th><th>Position</th><th>Tier 1 roster</th><th></th></tr></thead><tbody>${people.map((p) => `<tr><td><b>${esc(p.name)}</b></td><td>${esc(p.role || "")}</td><td>${p.t1 ? "✓ officer" : "—"}</td><td><a class="btn sm ghost" href="#/t2/reg/load?id=${encodeURIComponent(p.name)}">QA load ›</a></td></tr>`).join("")}</tbody></table>` : `<div class="empty" style="margin-top:10px">Nobody yet — add yourself first.</div>`}
        <p class="muted" style="font-size:12.5px;margin:8px 0 0">Each person goes into the People drop-down (owner of every record), the QA load register (their capacity) and, for officers, the Tier 1 roster. Rename or remove people later in Setup.</p></div>
      <div class="card card-pad" data-ob="products">${stepHead("products", 3, "Add the products", `${(t2.lists.Products || []).length} products`)}
        <form class="add-row" data-addproduct><input class="input" name="p" placeholder="Product name and strength, e.g. PRODUCT 400 mg FC tablets" required><button class="btn primary">＋ Add</button></form>
        <div class="chips" style="margin-top:10px">${(t2.lists.Products || []).map((p) => `<span class="vchip">${esc(p)}</span>`).join("") || `<span class="muted" style="font-size:12.5px">None yet.</span>`}</div>
        <p class="muted" style="font-size:12.5px;margin:8px 0 0">Areas, departments, root causes and every other list are ready to use — adjust them in <a href="#/t2/setup">Tier 2 Setup</a> and <a href="#/t1/setup">Tier 1 Setup</a>.</p></div>
      <div class="card card-pad" data-ob="targets">${stepHead("targets", 4, "Review the KPI targets", "9 Tier 2 KPIs · 20 Tier 1 KPIs")}
        <p style="margin:0 0 10px;color:var(--ink-2);font-size:13.5px">Every RAG colour comes from a target and an amber limit. The proposals follow common practice — align them with your Quality Manual before the first month-end.</p>
        <div class="row"><a class="btn" href="#/t2/setup">Tier 2 targets ›</a><a class="btn" href="#/t1/setup">Tier 1 targets ›</a><label class="row" style="gap:6px;font-size:13px"><input type="checkbox" data-obtick="targets" ${ok.targets ? "checked" : ""}> Reviewed</label></div></div>
      <div class="card card-pad" data-ob="first">${stepHead("first", 5, "Enter the first records", `reporting month ${fmtMonth(st.month)} · as of ${fmtLong(st.statusDate)}`)}
        <div class="lcards">
          <a class="lcard" href="#/t1/reg/dl?new=1"><b>Tier 1 daily log</b><span>One line per officer per day — the SQDCP letters come from it.</span></a>
          <a class="lcard" href="#/t2/reg/dev?new=1"><b>Deviation</b><span>Copy the eQMS reference, date, description, class and owner.</span></a>
          <a class="lcard" href="#/t2/reg/capa?new=1"><b>CAPA</b><span>Link it to its deviation, audit or complaint.</span></a>
          <a class="lcard" href="#/t2/reg/cc?new=1"><b>Change control</b><span>Type, class, owner and target date.</span></a>
          <a class="lcard" href="#/t2/reg/rel?new=1"><b>Batch release</b><span>Manufacturing completion starts the release clock.</span></a>
          <a class="lcard" href="#/t2/reg/act?new=1"><b>eQMS action</b><span>Actions of deviations, CAPA and changes.</span></a>
        </div>
        <div class="row" style="margin-top:10px"><button class="btn sm" data-today>Set the as-of date to today (${fmtLong(today())})</button><a class="btn sm" href="#/learn/enter">How to fill each column ›</a></div></div>
      <div class="card card-pad" data-ob="daily">${stepHead("daily", 6, "Log the first stand-up", "Daily Log · Top 3 priorities")}
        <p style="margin:0 0 10px;color:var(--ink-2);font-size:13.5px">After the first 10:30 stand-up, open today in the Daily Log: meeting held, attendees, Top 3 priorities. From then on the dashboard's ▶ stand-up mode saves the priorities for you.</p>
        <div class="row"><a class="btn" href="#/t2/calendar?day=${st.statusDate}">Log today ›</a><a class="btn" href="#/guide">The daily routine ›</a></div></div>
      <div class="card card-pad" data-ob="share">${stepHead("share", 7, "Invite the team", "everyone works on the same live board")}
        <p style="margin:0 0 10px;color:var(--ink-2);font-size:13.5px">Share this page's link from its Share menu. Teammates with edit access see every change live; viewers can read and export. Every change is recorded in Change history.</p>
        <label class="row" style="gap:6px;font-size:13px"><input type="checkbox" data-obtick="share" ${ok.share ? "checked" : ""}> The team has the link</label></div>
    </div>`;

  root.addEventListener("change", (e) => {
    const p = e.target.dataset.obPath;
    if (p) {
      const [tier, path] = p.split(":");
      const keys = path.split(".");
      store.patch(tier, keys, e.target.value.trim(), keys.join(" · "));
      if (tier === "t2" && ["site", "weekend1", "weekend2"].includes(keys[1])) store.patch("t1", ["setup", keys[1]], e.target.value.trim(), keys.join(" · "));
      toast("Saved"); renderStart(root);
    }
    if (e.target.dataset.obtick) { store.patch("t2", ["routine", "start", e.target.dataset.obtick], e.target.checked ? new Date().toISOString() : "", "Start here"); renderStart(root); }
  });
  root.addEventListener("submit", (e) => {
    e.preventDefault();
    const f = e.target;
    if (f.matches("[data-addperson]")) {
      const name = f.name.value.trim(), role = f.role.value.trim();
      if (!name) return;
      if (t2.load.some((r) => r.member === name)) { toast(`${name} is already in the team`); return; }
      if (f.t1.checked && t1.roster.length >= 6) { toast("The Tier 1 roster holds up to 6 officers — untick “Tier 1 officer”"); return; }
      const L = t2.lists;
      if (!L.People.includes(name)) L.People.push(name);
      if (role && !(L.Roles || []).includes(role)) (L.Roles ??= []).push(role);
      store.upsert("t2", "load", null, { member: name, role, absence: 0 }, name);
      if (f.t1.checked) {
        t1.roster.push({ name, role, shift: f.shift.value || undefined });
        if (!t1.lists.Owners.includes(name)) t1.lists.Owners.push(name);
        store.log("t1", { reg: "roster", ref: name, action: "create", changes: [{ field: "name", from: "", to: name }] });
        store.save("t1");
      }
      toast(`${name} added`); renderStart(root); $("[data-addperson] [name=name]")?.focus();
    }
    if (f.matches("[data-addproduct]")) {
      const v = f.p.value.trim();
      if (!v) return;
      if ((t2.lists.Products || []).includes(v)) { toast("Already in the list"); return; }
      (t2.lists.Products ??= []).push(v);
      store.log("t2", { reg: "lists", ref: "Products", action: "edit", changes: [{ field: "add", from: "", to: v }] });
      store.save("t2");
      if (!(t1.lists.Products || []).includes(v)) { (t1.lists.Products ??= []).push(v); store.save("t1"); }
      toast(`${v} added`); renderStart(root); $("[data-addproduct] [name=p]")?.focus();
    }
  });
  $("[data-today]", root).onclick = () => { store.patch("t2", ["setup", "statusDate"], today(), "Status date"); store.patch("t1", ["setup", "selDate"], today(), "Selected date"); renderStart(root); };
  $("[data-tour]", root).onclick = () => startTour("start");
}

/* ── How-to guides ───────────────────────────────────────── */

const GUIDES = [
  { id: "start", tour: "start", icon: "①", title: "Start from a blank board", when: "Once, before the first day", steps: [
    ["Name the boards", "Start here → step 1: site, department, board owners, meeting times, weekend days."],
    ["Add the team", "One line per person with their position. Tick Tier 1 officer for shop-floor officers (up to 6). Each person becomes an owner in every drop-down and a line of the QA load."],
    ["Add the products", "Product name and strength — used by batch reviews, batch release, deviations, APQR and the product filters."],
    ["Check the lists", "Setup → Drop-down lists: areas, departments, root causes, sources. Status lists are locked (the KPI formulas count them by name)."],
    ["Review the KPI targets", "Setup → KPI targets & RAG thresholds. Write down who approved them."],
    ["Set the as-of date", "Tier 2 Setup → Data as of → Today. Every overdue count is calculated as of this date."],
    ["Load the eQMS records", "Import from Scigeniq: drop the allTasks exports (quality events, CAPA, change control, actions, audits, findings, APQR) — every record comes in with its owner, dates and status. Enter by hand only what Scigeniq does not hold."],
    ["Share the link", "Share menu of the page. Everyone with edit access works on the same live board."],
  ] },
  { id: "daily", tour: "daily", icon: "☀", title: "Every day", when: "08:00 → 16:00", steps: [
    ["08:00 · Update the registers", "Each owner enters yesterday's and this morning's events: new deviations, CAPA, changes, actions, batch-release steps."],
    ["10:30 · Tier 1 headlines", "At the start of the stand-up the Tier 1 owner reports the huddle: held, red letters, safety events. Enter them in today's Daily Log; each escalation goes into register 10·A with a Tier 2 owner.", "t2solo"],
    ["08:00–08:25 · Tier 1 daily log", "Each officer: one line — shift, attendance, line clearances (and failures), IPC, AQL, Gemba, records, findings.", "t1"],
    ["08:30 · Tier 1 huddle (10 min)", "Huddle board: SQDCP letters, red KPIs, open actions. Red letter → action with owner and due date. Log the huddle (register E): held, attendees, 3 priorities, escalation to Tier 2.", "t1"],
    ["09:30 · Clear the data checks", "Every ⚠ flag on a register strip: fix the status, closure date or date order."],
    ["10:00 · Cut-off", "The data is frozen for the stand-up; late changes wait until 10:45."],
    ["10:30 · Tier 2 stand-up (15 min)", "Dashboard → ▶ Run the 15-min stand-up: safety, deviations, CAPA, changes, Gemba, release & documents, priorities & escalation."],
    ["10:45 · Daily Log", "Click today on the Q-calendar: meeting held, attendees, overrides (with the reason in remarks), Top 3, escalated to Tier 3."],
    ["11:00 · Daily report", "Reports → Daily: copy the summary into an e-mail or chat, or create the Word report. Tick the daily routine."],
    ["16:00 · Close the day", "Enter the afternoon's status changes so tomorrow starts clean."],
  ] },
  { id: "weekly", tour: "weekly", icon: "▦", title: "Every week", when: "Last working day of the week", steps: [
    ["Clear every flag", "Data-check flags at zero in every register."],
    ["Review the backlog", "Analytics → Raised vs closed (is the backlog growing?) and Ageing (what is older than 60 / 90 days?)."],
    ["Support the owners", "Analytics → Overdue items by person: agree a new date or an escalation with each owner."],
    ["Look ahead", "Reports → Weekly → Due in the next 7 days: confirm each item with its owner."],
    ["Balance the load", "Register 07 · QA load: reassign work for anyone above the high-load threshold."],
    ["Report", "Reports → Weekly review: commentary (key messages, decisions, support, focus), sign-off, Word document; send the summary."],
  ] },
  { id: "monthend", tour: "monthend", icon: "▣", title: "Month-end close & storage", when: "Last working day of the month", steps: [
    ["Open the month-end close", "Month-end close page: ten steps, each showing whether the boards already show it done."],
    ["Clean the data", "Clear the flags; complete the Daily Log and the Tier 1 logs for every working day."],
    ["Fix the date", "Set the as-of date to the last working day."],
    ["Write the remarks", "Count first · name the trend · say what was escalated and why · end with next month's focus."],
    ["Freeze the KPIs", "Copies the live values into the month column of KPI Trend."],
    ["Make the monthly pack", "Reports → Monthly management pack: commentary and sign-off names first, then Create — cover, document control, contents, executive summary, KPIs, charts, registers, QA load, Tier 1, data quality, sign-off."],
    ["Archive the boards", "Close step 8: a frozen read-only copy of both boards in the shared archive."],
    ["File the pack", "Close step 9 downloads one ZIP: Word pack, chart PNGs, every register as CSV, the JSON snapshot, a README. Store it in Controlled folder → QA Tier Boards → YYYY → YYYY-MM; print and sign the report, keep the signed PDF beside it. Never edit a filed pack: issue v1.1 instead."],
    ["Roll the month", "Close step 10: the calendar and every ‘this month’ count move to the next month. Registers are never cleared."],
    ["Look back", "Archive page: open any archived month read-only, or open a filed pack's JSON."],
  ] },
  { id: "exports", tour: "exports", icon: "⤓", title: "Filters & exports", when: "Any time", steps: [
    ["Filter a page", "Analytics and the dashboard: page filters — period (today … year to date, or a custom range; counting records raised, active, closed or due in it), person, area, product, classification, severity, source, department, status, register."],
    ["Filter one chart", "⚲ Filter in the chart's title bar: its own filters on top of the page filters. The chips under the title say what is shown — they are in the exported picture too."],
    ["Filter a register", "Quick buttons (open, overdue, due ≤ 7 days, raised this month) and ⚲ More filters: every drop-down field and the date range. Export CSV exports what is shown."],
    ["Chart a register", "◔ Charts at the top of any register: status, one chart per drop-down field (CAPA source, change type, department, owner…), raised vs closed, age, due horizon, overdue by person, on-time closure, cycle time. Click a bar to filter the register on it."],
    ["Link a record to its parent", "Linked fields are drop-down lists of the records on the board (a CAPA's source record, an action's parent, a finding's audit). The type field narrows the list; Open › jumps to the parent. Each record's Linked records panel lists its children and ＋ creates one already linked."],
    ["Update many records at once", "Tick the rows (or the header box for all shown) → Set <field> to <value> → Apply. Done statuses fill the closure date; Change history records the bulk edit."],
    ["Export a chart", "⤓ Export: PNG 2× / 3× / 4× (print), light print colours or as on screen, card / page / white / transparent background, footer on or off; Copy picture; SVG vector; CSV data."],
    ["Export every chart", "Analytics → ⤓ All charts (ZIP): every chart as PNG plus its CSV."],
    ["Report", "Reports centre: daily, weekly and monthly Word documents with the same filters, commentary and sign-off; a text summary to paste."],
  ] },
  { id: "training", tour: null, icon: "✎", title: "Training — plan, unplanned, external", when: "After each session · month-end report", steps: [
    ["Annual plan", "Training → Annual plan: the topics of the department plan (GS0024/Onc/T06) by month. Click a topic, tick the people trained (the count follows), set the completion date and status. Moving a topic: Rescheduled = Yes and a new planned date."],
    ["Unplanned training", "＋ New training, category Unplanned: Revised SOP, New SOP, Quality circle, Corporate, Audit / CAPA driven (link the audit or CAPA), On the job, Induction. Trained department = Other departments when QA trains another department."],
    ["External training", "Category External: the course, the provider, the people who attended and the date (or the year when the date is not known)."],
    ["KPI", "The Training KPI counts the annual plan only: employees trained ÷ employees to be trained on the topics due to date. A topic is executed when at least 80 % of the group is trained. Unplanned and external training are tracked, not targeted."],
    ["Month-end report", "Training → ⤓ Department report (xlsx): the QA_Onc row of the corporate file — Planned (P, E, to be trained, trained) and Unplanned (quality circle, SOP, others) — plus the register."],
    ["Training cards", "Training → Training cards: each person's card in the GS0024/Onc/T03 layout, built from the register; ⤓ one card or all cards. No employee code or hiring date."],
  ] },
  { id: "import", tour: null, icon: "⤒", title: "Update from Scigeniq", when: "Weekly — or before any review", steps: [
    ["Export from Scigeniq", "Tasks → All tasks → filter by Type → Export → Excel, once per list: actions (Actions + Standalone Actions), Quality Event, CAPA, Change Control, Audit Plan, Audit, Audit Findings, APQR (+ its data-collection tasks). File names do not matter."],
    ["Drop them in the app", "Import from Scigeniq → drop every file at once. Each file is recognised by its content."],
    ["Check the preview", "Per register: new, updated, unchanged, only on the board. Open “see the changes” for each field before → after."],
    ["Apply", "One click updates the shared board for the whole team; Change history records it, the import history keeps the export date."],
    ["Audit CAPA apart", "CAPA whose source is Audit or Self-inspection (or that answer an audit finding) land in Audits → Audit CAPA: tracked for follow-up, not counted in the QA KPIs, Q-calendar or QA load. Change a CAPA's source and it moves register by itself."],
    ["What is kept", "Records missing from an export stay on the board; fields Scigeniq does not carry (area, comments you typed on other fields) are kept."],
  ] },
  { id: "team", tour: null, icon: "⎘", title: "Sharing & data integrity", when: "Always", steps: [
    ["One live board", "Everyone with edit access works on the same boards; changes appear on every screen within seconds."],
    ["Attributable", "Every change is recorded in Change history: who, what, from what to what, when."],
    ["Record of truth", "The eQMS stays the GMP record. The boards mirror it for daily management — never replace it."],
    ["ALCOA+", "Owner always filled · plain descriptions · enter the day it happens · references copied exactly · no blank status · monthly pack filed."],
  ] },
];

/** The guides of a separate Tier 1 app. */
const GUIDES_T1 = [
  { id: "daily", tour: "daily", icon: "☀", title: "Every day — the huddle", when: "08:00 → 08:45", steps: [
    ["08:00–08:25 · Daily log", "Each officer adds one line: shift, attendance, line clearances (and failures), IPC, AQL, sampling, Gemba, records reviewed, findings."],
    ["Batch records", "Each BMR / BPR received and reviewed goes into Batch reviews: received, reviewed, errors, returned."],
    ["Findings", "Every finding of the floor with its severity, owner and due date — High severity the same day."],
    ["08:30 · Huddle (10 min)", "Huddle board: SQDCP letters, red KPIs, open actions. Every red letter gets an action with an owner and a due date."],
    ["Huddle log", "Held, attendees, 3 priorities; tick the actions to escalate to Tier 2 — the huddle owner presents them at the 10:30 stand-up."],
    ["Daily report", "Reports → Daily: the SQDCP letters, tiles, open actions and the summary to paste for the QA manager."],
  ] },
  { id: "weekly", tour: null, icon: "▦", title: "Every week", when: "Last working day of the week", steps: [
    ["Clear every flag", "Data-check flags at zero in every register."],
    ["Review the actions", "Every open action has an owner and a realistic date; overdue ones are re-planned or escalated to Tier 2."],
    ["Read the week", "Reports → Weekly: the SQDCP letters of each day, the 20 KPIs, each officer's performance."],
    ["Skills", "Skills matrix: training gaps planned in register F."],
  ] },
  { id: "monthend", tour: "monthend", icon: "▣", title: "Month-end close & storage", when: "Last working day of the month", steps: [
    ["Clean the data", "Clear the flags; complete the daily log and the huddle log for every working day."],
    ["Fix the date", "Set the board date to the last working day."],
    ["Make the monthly report", "Reports → Monthly: commentary and sign-off names first, then Create."],
    ["Archive & file", "Close: archive the board, then the month-end pack (ZIP) for the controlled folder; sign the printed report."],
    ["Move on", "Move the board to the first working day of the new month. Registers are never cleared."],
  ] },
  { id: "exports", tour: null, icon: "⤓", title: "Exports", when: "Any time", steps: [
    ["Pictures", "⤓ Export on the SQDCP letters, the KPI cards and the daily activity: PNG 2× / 3× / 4×, copy, SVG."],
    ["Registers", "Quick buttons and ⚲ More filters on every register; Export CSV exports what is shown."],
    ["Reports", "Daily, weekly and monthly Word reports, filtered by officer, with commentary and sign-off."],
  ] },
  { id: "team", tour: null, icon: "⎘", title: "Sharing & data integrity", when: "Always", steps: [
    ["One live board", "Everyone with edit access works on the same board; changes appear on every screen within seconds."],
    ["Attributable", "Every change is recorded in Change history."],
    ["ALCOA+", "Officer always filled · plain descriptions · enter the day it happens · no blank status."],
  ] },
];

export function renderGuide(root) {
  root = fresh(root);
  root.innerHTML = `
    <div class="page-head"><div><div class="eyebrow">How-to guides</div><h1>Every routine, step by step</h1>
      <p>Written steps for each routine, and a guided tour that walks you through the real screens with each control highlighted. Use ← → to move through a tour.</p></div></div>
    <div class="grid g2">${(ONE_TIER === "t1" ? GUIDES_T1 : GUIDES.map((g) => ({ ...g, steps: g.steps.filter((st) => !st[2] || (st[2] === "t2solo" ? ONE_TIER === "t2" : hasTier(st[2]))) }))).map((g) => `<div class="card card-pad guide" data-guide="${g.id}"><div class="card-head"><h2>${g.icon} ${esc(g.title)} <span class="sub">${esc(g.when)}</span></h2>${g.tour && tourOf(g.tour)?.steps.length ? `<button class="btn sm primary" data-tour="${g.tour}">▶ Guided tour</button>` : ""}</div>
      <ol>${g.steps.map(([t, x]) => `<li><b>${esc(t)}</b> — ${esc(x)}</li>`).join("")}</ol></div>`).join("")}</div>`;
  $$("[data-tour]", root).forEach((b) => b.onclick = () => startTour(b.dataset.tour));
}
