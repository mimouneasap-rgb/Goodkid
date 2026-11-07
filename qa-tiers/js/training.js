// Training hub (Tier 2 · register 09): the QA department training file in one
// place — the annual department plan (GS0024/Onc/T06), unplanned training (SOP
// revisions, new SOPs, quality circles, corporate, audit-driven, on the job,
// induction), external courses, and the sessions QA gives to other departments.
// Views: overview with the corporate monthly report, the plan by month, the
// team × topic matrix and each person's training card (GS0024/Onc/T03).

import { store } from "./store.js";
import * as E from "./engine.js";
import { openEditor } from "./registers.js";
import { hbars, columns } from "./charts.js";
import { esc, pill, fmtDate, fmtMonth, pct, toast, confirmDialog, $, $$, fresh } from "./ui.js";
import { saveFile, loadScript, slug, CHART_DATA, decorateCharts } from "./export.js";

const XLSX_URL = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const has = (v) => v !== "" && v != null;
const namesOf = (r) => String(r.attendees || "").split(",").map((x) => x.trim()).filter(Boolean);
const view = { tab: "overview", person: null, year: null, mxDue: false };

/** Every training with its computed columns and the month it belongs to. */
function rowsOf(s) {
  return (s.trn || []).map((r, i) => {
    const c = E.t2Training(r, s.setup);
    const when = E.trnCat(r) === "Planned" ? r.date : r.done || r.date;
    return { r, c, i, cat: E.trnCat(r), qa: E.trnQA(r), bucket: E.trnBucket(r), when: when || (r.year ? `${r.year}` : ""), names: namesOf(r) };
  });
}

/** The corporate department report: per month, Planned (P, E, to be trained, trained) and Unplanned (Quality Circle, SOP, Others) + External. */
export function monthlyReport(s, year) {
  const rows = rowsOf(s).filter((x) => x.qa);
  const ref = s.setup.statusDate;
  return MON.map((m, k) => {
    const ym = `${year}-${String(k + 1).padStart(2, "0")}`;
    const plan = rows.filter((x) => x.cat === "Planned" && x.r.status !== "Cancelled" && String(x.r.date || "").startsWith(ym));
    const past = `${ym}-01` <= ref;
    const un = rows.filter((x) => x.cat === "Unplanned" && String(x.when).startsWith(ym));
    const ext = rows.filter((x) => x.cat === "External" && String(x.when).startsWith(ym));
    const sum = (arr, f) => arr.reduce((a, x) => a + (+f(x) || 0), 0);
    return {
      ym, label: `${MON[k]} ${year}`, past,
      P: plan.length, E: past ? plan.filter((x) => E.trnDone(x.r)).length : null,
      toTrain: sum(plan, (x) => E.trnFigures(x.r, s).planned), trained: past ? sum(plan, (x) => E.trnFigures(x.r, s).trained) : null,
      qc: sum(un.filter((x) => x.bucket === "Quality Circle"), (x) => x.r.trained),
      sop: sum(un.filter((x) => x.bucket === "SOP Training"), (x) => x.r.trained),
      other: sum(un.filter((x) => x.bucket === "Others"), (x) => x.r.trained),
      ext: sum(ext, (x) => x.r.trained), sessions: un.length + ext.length,
    };
  });
}

/** The QA team: the QA load members, then anyone else trained with the QA department. */
function teamOf(s) {
  const group = new Set(E.planGroup(s));
  const members = (s.load || []).filter((r) => r.member).map((r) => ({ name: r.member, role: r.role || "", mandatory: group.has(r.member) }));
  const load = members.filter((x) => x.mandatory);
  const optional = members.filter((x) => !x.mandatory);
  const seen = new Set(members.map((x) => x.name));
  const extra = [];
  for (const x of rowsOf(s)) if (x.qa) for (const n of x.names) if (!seen.has(n)) { seen.add(n); extra.push({ name: n, role: "", mandatory: false }); }
  return { load, optional, extra };
}

const yearOf = (s) => +String(s.setup.statusDate || s.setup.month).slice(0, 4);

export function renderTraining(root) {
  root = fresh(root);
  const s = store.t2;
  view.year ??= yearOf(s);
  const Y = view.year, ref = s.setup.statusDate;
  const rows = rowsOf(s);
  const k = E.t2Kpis(s).kpis[8];
  const qa = rows.filter((x) => x.qa);
  const planned = qa.filter((x) => x.cat === "Planned" && String(x.r.date || "").startsWith(`${Y}`));
  const due = planned.filter((x) => x.r.date <= ref && x.r.status !== "Cancelled");
  const overdueTopics = planned.filter((x) => x.c.live === "Overdue");
  const unY = qa.filter((x) => x.cat === "Unplanned" && String(x.when).startsWith(`${Y}`));
  const extAll = qa.filter((x) => x.cat === "External");
  const given = rows.filter((x) => !x.qa && String(x.when).startsWith(`${Y}`));
  const years = [...new Set(rows.map((x) => +String(x.when).slice(0, 4)).filter((y) => y > 2000))].sort();
  const sumT = (arr) => arr.reduce((a, x) => a + (+x.r.trained || 0), 0);
  const tile = (label, value, sub, rag = "") => `<div class="kpi ${rag}"><div class="k-name">${esc(label)}</div><div class="k-val">${value}</div><div class="k-foot"><span>${sub}</span></div></div>`;

  const adh = k.actual === "" ? null : Math.max(0, Math.min(1, +k.actual));
  const RR = 52, CC = 2 * Math.PI * RR;
  const stat = (label, value, sub = "", cls = "") => `<div class="ths ${cls}"><dt>${esc(label)}</dt><dd>${value}${sub ? `<small>${sub}</small>` : ""}</dd></div>`;
  const TABS = [["overview", "▧", "Overview & monthly report"], ["plan", "▦", "Annual plan"], ["unplanned", "✚", `Unplanned · ${unY.length}`], ["external", "◇", `External · ${extAll.length}`], ["induction", "◎", `Induction · ${inductees(s).filter((p) => !p.m.ph2).length}`], ["matrix", "▤", "Team matrix"], ["cards", "▭", "Training cards"]];
  root.innerHTML = `
    <section class="hero trn-hero">
      <div class="trn-hero-grid">
        <div class="trn-hero-text">
          <div class="eyebrow">Tier 2 · Daily management · register 09</div>
          <h1>QA Training ${Y}</h1>
          <p>The department training file — annual plan, unplanned and external training, and the sessions QA gives to other departments.</p>
          <div class="hero-meta">
            <span class="chip">Plan template <b>GS0024/Onc/T06</b></span>
            <span class="chip">KPI <b>annual plan only</b></span>
            ${years.length > 1 ? `<label class="chip">Year <select data-year aria-label="Year">${years.map((y) => `<option ${y === Y ? "selected" : ""}>${y}</option>`).join("")}</select></label>` : ""}
          </div>
          <div class="row" style="margin-top:16px"><button class="btn primary" data-new>＋ New training</button><a class="btn on-dark" href="#/t2/reg/trn">Sessions register ›</a><button class="btn on-dark" data-xlsx>⤓ Department report</button></div>
        </div>
        <div class="trn-hero-kpi">
          <figure class="trn-ring" aria-label="Annual plan adherence ${adh == null ? "no data" : pct(adh)}">
            <svg viewBox="0 0 132 132" role="img"><circle cx="66" cy="66" r="${RR}" class="trk"/>${adh == null ? "" : `<circle cx="66" cy="66" r="${RR}" class="arc ${k.rag}" stroke-dasharray="${Math.max(0.01, adh) * CC} ${CC}" transform="rotate(-90 66 66)"/>`}
              <text x="66" y="70" text-anchor="middle" class="v">${adh == null ? "—" : `${Math.round(adh * 100)}%`}</text><text x="66" y="88" text-anchor="middle" class="l">adherence</text></svg>
            <figcaption>Annual plan<br><b>target ${esc(k.targetText)}</b></figcaption>
          </figure>
          <dl class="trn-hero-stats">
            ${stat("Plan topics executed", `${due.filter((x) => E.trnDone(x.r)).length}`, ` / ${due.length} due`)}
            ${stat("Plan topics overdue", String(overdueTopics.length), "", overdueTopics.length ? "bad" : "good")}
            ${stat("Unplanned", String(unY.length), ` · ${sumT(unY)} trained`)}
            ${stat("External courses", String(extAll.length), ` · ${sumT(extAll)} seats`)}
            ${stat("Given to other depts", String(given.length), ` · ${sumT(given)} trained`)}
            ${stat("New hires in induction", String(inductees(s).filter((p) => !p.m.ph2).length), ` · ${inductees(s).filter((p) => p.m.ph2).length} achieved`)}
          </dl>
        </div>
      </div>
    </section>
    <nav class="trn-tabs" role="tablist" aria-label="Training views">${TABS.map(([v, ic, l]) => `<button type="button" role="tab" data-tab="${v}" aria-selected="${view.tab === v}"><span>${ic}</span>${l}</button>`).join("")}</nav>
    <div data-tabbody></div>`;

  const body = $("[data-tabbody]", root);
  if (view.tab === "overview") overview(body, s, Y, rows);
  else if (view.tab === "plan") planView(body, s, Y, rows);
  else if (view.tab === "matrix") matrixView(body, s, Y, rows);
  else if (view.tab === "unplanned") unplannedView(body, s, Y, rows, () => redraw());
  else if (view.tab === "external") externalView(body, s, Y, rows, () => redraw());
  else if (view.tab === "induction") inductionView(body, s, Y, rows, () => redraw());
  else cardsView(body, s, rows);

  const redraw = () => { renderTraining(root); decorateCharts(root.parentElement || root); };
  $$("[data-tab]", root).forEach((b) => b.onclick = () => { view.tab = b.dataset.tab; redraw(); });
  $("[data-year]", root)?.addEventListener("change", (e) => { view.year = +e.target.value; redraw(); });
  $("[data-new]", root).onclick = () => openEditor({ tier: "t2", reg: "trn", prefill: { cat: "Unplanned", dept: "QA", status: "Completed", date: ref, done: ref }, onSaved: redraw });
  $("[data-xlsx]", root).onclick = (e) => busy(e.currentTarget, () => exportDeptReport(s, Y));
  root.addEventListener("click", (e) => {
    const t = e.target.closest("[data-open]");
    if (t) openEditor({ tier: "t2", reg: "trn", index: +t.dataset.open, onSaved: redraw });
  });
}

async function busy(btn, fn) {
  const t = btn.textContent; btn.disabled = true; btn.textContent = "Preparing…";
  try { await fn(); } catch (e) { toast(e.message || "Export failed"); } finally { btn.disabled = false; btn.textContent = t; }
}

/* ── overview ─────────────────────────────────────────── */
function overview(body, s, Y, rows) {
  const rep = monthlyReport(s, Y);
  const qa = rows.filter((x) => x.qa && String(x.when).startsWith(`${Y}`));
  const planCols = rep.map((m) => ({ label: m.label, short: m.label.slice(0, 3), parts: [
    { value: m.E ?? 0, cls: "f-G", name: "Executed" },
    { value: m.past ? m.P - (m.E || 0) : 0, cls: "f-R", name: "Not executed" },
    { value: m.past ? 0 : m.P, cls: "f-N", name: "Still to come" }] }));
  const unCols = rep.map((m) => ({ label: m.label, short: m.label.slice(0, 3), parts: [
    { value: m.sop, cls: "f-s1", name: "SOP training (revised / new SOP)" },
    { value: m.qc, cls: "f-s4", name: "Quality circle" },
    { value: m.other, cls: "f-s7", name: "Others (corporate, audit-driven, on the job, induction…)" },
    { value: m.ext, cls: "f-s5", name: "External" }] }));
  const byType = Object.entries(qa.reduce((m, x) => ((m[x.r.type || "—"] = (m[x.r.type || "—"] || 0) + 1), m), {})).sort((a, b) => b[1] - a[1]);
  const yr = rows.filter((x) => String(x.when).startsWith(`${Y}`));
  const trainers = Object.entries(yr.reduce((m, x) => { E.splitNames(x.r.trainer).forEach((t) => { m[t] = (m[t] || 0) + 1; }); return m; }, {})).sort((a, b) => b[1] - a[1]);
  const modeOf = (r) => (!r.mode ? "none" : /\+/.test(r.mode) ? "both" : E.trnSelf(r) ? "self" : "led");
  const modes = [["Trainer-led", yr.filter((x) => modeOf(x.r) === "led").length, "s3"], ["Read & understood", yr.filter((x) => modeOf(x.r) === "self").length, "s4"], ["Both", yr.filter((x) => modeOf(x.r) === "both").length, "s7"], ["Not recorded", yr.filter((x) => modeOf(x.r) === "none").length, "other"]].filter(([, n], i) => n || i < 3);
  CHART_DATA.set("trn-plan", { title: `Annual plan ${Y} — topics by month`, head: ["Month", "Planned (P)", "Executed (E)", "Employees to be trained", "Employees trained"], rows: rep.map((m) => [m.label, m.P, m.E ?? "", m.toTrain, m.trained ?? ""]) });
  CHART_DATA.set("trn-unplanned", { title: `Unplanned & external ${Y} — employees trained`, head: ["Month", "SOP training", "Quality circle", "Others", "External"], rows: rep.map((m) => [m.label, m.sop, m.qc, m.other, m.ext]) });
  const tot = (f) => rep.reduce((a, m) => a + (m[f] || 0), 0);
  const cell = (v, m) => (v == null ? `<td class="num muted">${m.past ? "0" : "—"}</td>` : `<td class="num">${v || ""}</td>`);
  body.innerHTML = `
    <div class="grid g2">
      <div class="card card-pad" data-chart="trn-plan"><div class="card-head"><h2>Annual plan ${Y} <span class="sub">topics planned (P) and executed (E) by month</span></h2></div>
        ${columns(planCols, { width: 640, height: 210 })}
        <div class="legend" style="margin-top:8px"><span><i class="bg-G"></i>Executed</span><span><i class="bg-R"></i>Not executed (month passed)</span><span><i class="bg-N"></i>Still to come</span></div></div>
      <div class="card card-pad" data-chart="trn-unplanned"><div class="card-head"><h2>Unplanned & external ${Y} <span class="sub">employees trained by month</span></h2></div>
        ${columns(unCols, { width: 640, height: 210 })}
        <div class="legend" style="margin-top:8px"><span><i class="bg-s1"></i>SOP training</span><span><i class="bg-s4"></i>Quality circle</span><span><i class="bg-s7"></i>Others</span><span><i class="bg-s5"></i>External</span></div></div>
      <div class="card card-pad"><div class="card-head"><h2>Training types <span class="sub">QA sessions in ${Y}</span></h2></div>${hbars(byType.map(([label, value]) => ({ label, value, cls: "f-s2" })), { width: 560, labelW: 170 })}</div>
      <div class="card card-pad"><div class="card-head"><h2>Trainers & delivery <span class="sub">sessions in ${Y}, other departments included — a session with two trainers counts for each</span></h2></div>
        <div class="mode-mix">${modes.map(([l, n, c]) => `<span><i class="bg-${c}"></i><b>${n}</b> ${esc(l)}</span>`).join("")}</div>
        ${hbars(trainers.map(([label, value]) => ({ label, value, cls: "f-s3" })), { width: 560, labelW: 170 })}</div>
    </div>
    <div class="card card-pad" style="margin-top:16px">
      <div class="card-head"><h2>Department training report ${Y} <span class="sub">QA_Onc row of the Departments Annual Oncology Training Plan — counts are employees, as in the corporate file</span></h2><button class="btn sm" data-xlsx2>⤓ xlsx</button></div>
      <div class="table-wrap"><table class="data trn-report">
        <thead><tr><th rowspan="2">Month</th><th colspan="4" class="grp">Planned training (annual plan)</th><th colspan="3" class="grp">Unplanned — employees trained</th><th rowspan="2" class="num">External</th></tr>
          <tr><th class="num">Topics P</th><th class="num">Executed E</th><th class="num">To be trained</th><th class="num">Trained</th><th class="num">Quality circle</th><th class="num">SOP training</th><th class="num">Others</th></tr></thead>
        <tbody>${rep.map((m) => `<tr class="${m.ym === s.setup.statusDate.slice(0, 7) ? "cur" : ""}"><td>${esc(m.label)}</td><td class="num">${m.P || ""}</td>${cell(m.E, m)}<td class="num">${m.toTrain || ""}</td>${cell(m.trained, m)}<td class="num">${m.qc || ""}</td><td class="num">${m.sop || ""}</td><td class="num">${m.other || ""}</td><td class="num">${m.ext || ""}</td></tr>`).join("")}</tbody>
        <tfoot><tr><td>Total ${Y}</td><td class="num">${tot("P")}</td><td class="num">${tot("E")}</td><td class="num">${tot("toTrain")}</td><td class="num">${tot("trained")}</td><td class="num">${tot("qc")}</td><td class="num">${tot("sop")}</td><td class="num">${tot("other")}</td><td class="num">${tot("ext")}</td></tr></tfoot>
      </table></div>
      <p class="muted" style="margin:10px 0 0;font-size:12.5px">Executed = topic completed (≥ 80 % of the group trained). Unplanned counts the QA team only; the sessions QA gives to other departments are counted in those departments' rows. External courses without an exact date count in their year, not in a month.</p>
    </div>`;
  $("[data-xlsx2]", body).onclick = (e) => busy(e.currentTarget, () => exportDeptReport(s, Y));
}

/* ── the annual plan, month by month ──────────────────── */
function planView(body, s, Y, rows) {
  const g = E.planGroupOn(s, s.setup.statusDate);
  const plan = rows.filter((x) => x.cat === "Planned" && String(x.r.date || "").startsWith(`${Y}`)).sort((a, b) => String(a.r.date).localeCompare(String(b.r.date)) || a.i - b.i);
  const months = MON.map((m, k) => ({ ym: `${Y}-${String(k + 1).padStart(2, "0")}`, label: `${fmtMonth(`${Y}-${String(k + 1).padStart(2, "0")}-01`)}` }))
    .map((m) => ({ ...m, items: plan.filter((x) => x.r.date.startsWith(m.ym)) })).filter((m) => m.items.length);
  const state = (x) => (x.r.status === "Cancelled" ? ["Cancelled", "N"] : E.trnDone(x.r) ? ["Completed", "G"] : x.c.live === "Overdue" ? ["Overdue", "R"] : x.r.status === "Rescheduled" || x.r.resched === "Yes" ? ["Rescheduled", "A"] : x.r.status === "In Progress" ? ["In progress", "A"] : ["Planned", "info"]);
  body.innerHTML = `
    <div class="plan-strip card card-pad">${MON.map((m, k) => {
      const ym = `${Y}-${String(k + 1).padStart(2, "0")}`, items = plan.filter((x) => x.r.date.startsWith(ym));
      return `<div class="ps-m ${ym === s.setup.statusDate.slice(0, 7) ? "cur" : ""}"><b>${m}</b><span>${items.map((x) => `<i class="d ${state(x)[1]}" title="${esc(`${x.r.sop || x.r.type}: ${x.r.topic} — ${state(x)[0]}`)}"></i>`).join("") || `<em>—</em>`}</span></div>`;
    }).join("")}</div>
    <div class="legend" style="margin-top:10px"><span><i class="bg-G"></i>Completed</span><span><i class="bg-A"></i>In progress / rescheduled</span><span><i class="bg-R"></i>Overdue</span><span><i style="background:var(--accent)"></i>Planned</span><span><i class="bg-N"></i>Cancelled</span></div>
    <div class="row" style="margin:14px 0 10px"><span class="muted" style="font-size:13px">${plan.length} topics · click a topic to record attendance, a new date (rescheduled) or the completion date.</span><span class="spacer"></span>
      <a class="btn sm" href="#/t2/reg/trn?new=1&prefill=${encodeURIComponent(JSON.stringify({ cat: "Planned", type: "SOP (annual plan)", dept: "QA", status: "Planned", resched: "No", planned: g.length }))}">＋ Add a plan topic</a></div>
    <div class="stack">${months.map((m) => `<div class="card plan-month"><div class="pm-head"><b>${esc(m.label)}</b><span class="muted">${m.items.length} topic${m.items.length > 1 ? "s" : ""} · ${m.items.filter((x) => E.trnDone(x.r)).length} completed</span></div>
      ${m.items.map((x) => { const [lbl, rag] = state(x); const { planned: p, trained: t } = E.trnFigures(x.r, s); return `<button type="button" class="pm-row" data-open="${x.i}">
        <span class="mono">${esc(x.r.sop || "—")}</span>
        <span class="pm-title">${esc(x.r.topic)}<small>${esc(x.r.type || "")}${deliveryHTML(x.r)}${x.r.done ? ` · held ${fmtDate(x.r.done)}` : ""}</small></span>
        <span class="pm-bar" title="${t} of the ${p} people of the plan group trained"><i style="width:${p ? Math.min(100, (t / p) * 100) : 0}%" class="${rag}"></i></span><span class="num">${p ? `${t}/${p}` : ""}</span>${pill(lbl, rag)}</button>`; }).join("")}</div>`).join("") || `<div class="empty">No annual plan for ${Y} yet — add the topics of the department plan.</div>`}</div>`;
}

/** " · trainers" and a read & understood tag, for the lists. */
function deliveryHTML(r) {
  const t = E.splitNames(r.trainer);
  return `${t.length ? ` · ${esc(t.join(", "))}` : ""}${E.trnSelf(r) ? ` <span class="ru-tag" title="${esc(r.mode)}">${t.length ? "+ " : ""}Read & understood</span>` : ""}`;
}

/* ── unplanned and external training: add and edit ───── */
const UN_TYPES = [["Revised SOP", "SOP revision"], ["New SOP", "New SOP"], ["Quality Circle", "Quality circle"], ["Corporate", "Corporate"], ["Audit / CAPA driven", "Audit / CAPA"], ["On the job", "On the job"], ["Basic GMP", "Basic GMP"], ["Induction / New Hire", "Induction"], ["Other", "Other"]];
/** The next free ID with a prefix (TU-26-041, TX-26-10…). */
function nextTrnId(s, prefix) {
  const n = Math.max(0, ...(s.trn || []).map((r) => String(r.id || "")).filter((id) => id.startsWith(prefix)).map((id) => +id.slice(prefix.length) || 0));
  const width = Math.max(2, ...(s.trn || []).map((r) => String(r.id || "")).filter((id) => id.startsWith(prefix)).map((id) => id.length - prefix.length));
  return prefix + String(n + 1).padStart(width, "0");
}
const avatars = (names, max = 5) => `<span class="av-stack" title="${esc(names.join(", "))}">${names.slice(0, max).map((n) => `<span class="av sm">${esc(initials(n))}</span>`).join("")}${names.length > max ? `<span class="av sm more">+${names.length - max}</span>` : ""}</span>`;

function unplannedView(body, s, Y, rows, redraw) {
  const ref = s.setup.statusDate, yy = String(Y).slice(2);
  view.unType ??= ""; view.unDept ??= "QA"; view.unQ ??= "";
  const all = rows.filter((x) => x.cat === "Unplanned" && String(x.when).startsWith(`${Y}`));
  const inDept = all.filter((x) => (view.unDept === "all" ? true : view.unDept === "QA" ? x.qa : !x.qa));
  const q = view.unQ.toLowerCase();
  const list = inDept.filter((x) => (!view.unType || x.r.type === view.unType) && (!q || [x.r.id, x.r.sop, x.r.topic, x.r.trainer, x.r.attendees].join(" ").toLowerCase().includes(q)))
    .sort((a, b) => String(b.when).localeCompare(String(a.when)) || b.i - a.i);
  const count = (t) => inDept.filter((x) => x.r.type === t).length;
  const months = [];
  for (const x of list) { const m = String(x.when).slice(0, 7); if (!months.length || months[months.length - 1].m !== m) months.push({ m, items: [] }); months[months.length - 1].items.push(x); }
  const people = list.reduce((a, x) => a + (+x.r.trained || x.names.length || 0), 0);
  body.innerHTML = `
    <div class="card card-pad un-head">
      <div class="card-head"><h2>Unplanned training ${Y} <span class="sub">SOP revisions, new SOPs, quality circles, corporate, audit-driven, on the job, induction — not in the annual plan, not in the KPI</span></h2></div>
      <div class="un-add"><span class="un-add-l">＋ Add</span>${UN_TYPES.map(([t, l]) => `<button type="button" class="btn sm" data-addun="${esc(t)}">${esc(l)}</button>`).join("")}</div>
      <div class="un-filters">
        <div class="seg-ctl" role="group" aria-label="Department">${[["QA", "QA team"], ["other", "Given to other departments"], ["all", "All"]].map(([v, l]) => `<button type="button" data-undept="${v}" aria-pressed="${view.unDept === v}">${l}</button>`).join("")}</div>
        <div class="un-chips">${[["", `All types · ${inDept.length}`], ...UN_TYPES.filter(([t]) => count(t)).map(([t, l]) => [t, `${l} · ${count(t)}`])].map(([t, l]) => `<button type="button" class="chip-btn ${view.unType === t ? "on" : ""}" data-untype="${esc(t)}">${esc(l)}</button>`).join("")}</div>
        <input type="search" data-unq placeholder="Search SOP, title, trainer, name…" value="${esc(view.unQ)}" aria-label="Search unplanned training">
      </div>
      <p class="muted" style="margin:10px 0 0;font-size:13px">${list.length} session${list.length === 1 ? "" : "s"} · ${people} employee${people === 1 ? "" : "s"} trained · click a session to edit it, change the people trained or delete it.</p>
    </div>
    <div class="stack" style="margin-top:14px">${months.map((g) => `<div class="card plan-month"><div class="pm-head"><b>${esc(fmtMonth(`${g.m}-01`))}</b><span class="muted">${g.items.length} session${g.items.length > 1 ? "s" : ""} · ${g.items.reduce((a, x) => a + (+x.r.trained || 0), 0)} trained</span></div>
      ${g.items.map((x) => `<button type="button" class="un-row" data-open="${x.i}">
        <span class="un-date">${x.r.done || x.r.date ? fmtDate(x.r.done || x.r.date) : "—"}</span>
        <span class="mono">${esc(x.r.sop || "—")}</span>
        <span class="pm-title">${esc(x.r.topic || "")}<small><span class="type-tag t-${slug(x.r.type || "other")}">${esc(x.r.type || "Other")}</span>${deliveryHTML(x.r)}${x.r.link ? ` · ${esc(x.r.link)}` : ""}${!x.qa ? ` · <b>given to another department</b>` : ""}</small></span>
        ${avatars(x.names)}<span class="num">${x.r.trained || x.names.length || ""}</span>${x.r.eff ? pill(x.r.eff) : `<span class="muted">—</span>`}</button>`).join("")}</div>`).join("") || `<div class="card card-pad"><div class="empty">No unplanned training matches${view.unType || view.unQ ? " these filters" : ` in ${Y}`} — add one with the buttons above.</div></div>`}</div>`;
  $$("[data-addun]", body).forEach((b) => b.onclick = () => {
    const other = view.unDept === "other";
    openEditor({ tier: "t2", reg: "trn", prefill: { id: nextTrnId(s, other ? `TD-${yy}-` : `TU-${yy}-`), cat: "Unplanned", type: b.dataset.addun, dept: other ? "Other departments" : "QA", audience: other ? "Other departments" : "QA team", status: "Completed", date: ref, done: ref }, onSaved: redraw });
  });
  $$("[data-undept]", body).forEach((b) => b.onclick = () => { view.unDept = b.dataset.undept; view.unType = ""; unplannedView(body, s, Y, rows, redraw); });
  $$("[data-untype]", body).forEach((b) => b.onclick = () => { view.unType = b.dataset.untype; unplannedView(body, s, Y, rows, redraw); });
  const qi = $("[data-unq]", body);
  qi.oninput = () => { view.unQ = qi.value; const pos = qi.selectionStart; unplannedView(body, s, Y, rows, redraw); const n = $("[data-unq]", body); n.focus(); n.setSelectionRange(pos, pos); };
}

function externalView(body, s, Y, rows, redraw) {
  const ref = s.setup.statusDate, yy = String(Y).slice(2);
  const list = rows.filter((x) => x.cat === "External").sort((a, b) => String(b.r.done || b.r.date || b.r.year || "").localeCompare(String(a.r.done || a.r.date || a.r.year || "")) || b.i - a.i);
  const years = [...new Set(list.map((x) => String(x.r.done || x.r.date || x.r.year || "").slice(0, 4) || "—"))];
  const seats = list.reduce((a, x) => a + (+x.r.trained || x.names.length || 0), 0);
  body.innerHTML = `
    <div class="card card-pad un-head">
      <div class="card-head"><h2>External training <span class="sub">courses given by an outside provider — tracked, not in the KPI</span></h2><button class="btn sm primary" data-addext>＋ Add an external course</button></div>
      <p class="muted" style="margin:0;font-size:13px">${list.length} course${list.length === 1 ? "" : "s"} · ${seats} participation${seats === 1 ? "" : "s"} · enter the date when known, otherwise the year.</p>
    </div>
    <div class="stack" style="margin-top:14px">${years.map((y) => { const items = list.filter((x) => (String(x.r.done || x.r.date || x.r.year || "").slice(0, 4) || "—") === y); return `<div class="card plan-month"><div class="pm-head"><b>${esc(y)}</b><span class="muted">${items.length} course${items.length > 1 ? "s" : ""}</span></div>
      ${items.map((x) => `<button type="button" class="un-row ext" data-open="${x.i}">
        <span class="un-date">${x.r.done || x.r.date ? fmtDate(x.r.done || x.r.date) : esc(String(x.r.year || "—"))}</span>
        <span class="pm-title">${esc(x.r.topic || "")}<small>${esc(x.r.provider || "External provider")}</small></span>
        ${avatars(x.names)}<span class="num">${x.r.trained || x.names.length || ""}</span>${x.r.eff ? pill(x.r.eff) : `<span class="muted">—</span>`}</button>`).join("")}</div>`; }).join("") || `<div class="card card-pad"><div class="empty">No external course recorded yet.</div></div>`}</div>`;
  $("[data-addext]", body).onclick = () => openEditor({ tier: "t2", reg: "trn", prefill: { id: nextTrnId(s, `TX-${yy}-`), cat: "External", type: "External course", dept: "QA", audience: "QA team", status: "Completed", done: ref, date: ref, year: Y }, onSaved: redraw });
}

/* ── induction of new hires (SOPGS0024) ──────────────── */
/** QA team members flagged as new hires, with their induction milestones. */
function inductees(s) {
  return (s.load || []).map((m, i) => ({ m, i })).filter(({ m }) => m.member && (m.newHire === "Yes" || has(m.ph1) || has(m.ph2)));
}
function inductionView(body, s, Y, rows, redraw) {
  const ref = s.setup.statusDate;
  const list = inductees(s).sort((a, b) => (a.m.ph2 ? 1 : 0) - (b.m.ph2 ? 1 : 0) || String(a.m.member).localeCompare(String(b.m.member)));
  const others = (s.load || []).map((m, i) => ({ m, i })).filter(({ m }) => m.member && !list.some((x) => x.i === m.i));
  const stage = (m) => (m.ph2 ? ["Phase 2 achieved", "G"] : !m.ph1 ? ["Phase 1 in progress", "info"] : has(m.ph2Due) && m.ph2Due < ref ? ["Phase 2 overdue", "R"] : ["Phase 2 in progress", "A"]);
  const card = ({ m, i }) => {
    const [lbl, rag] = stage(m);
    // induction trainings: typed so, or held between phase 1 and phase 2
    const ind = rows.filter((x) => x.names.includes(m.member) && x.cat !== "Planned" && (x.r.type === "Induction / New Hire" || (has(m.ph1) && String(x.when) >= m.ph1 && (!m.ph2 || String(x.when) < m.ph2)))).sort((a, b) => String(a.when).localeCompare(String(b.when)));
    const excused = rows.filter((x) => x.cat === "Planned" && x.qa && x.r.status !== "Cancelled" && !E.splitNames(x.r.toTrain).length && E.inInduction(s, m.member, x.r.date)).length;
    const step = (n, title, date, sub, on) => `<li class="${on ? "on" : ""}"><b>${n}</b><span>${esc(title)}<small>${date ? fmtDate(date) : esc(sub)}</small></span></li>`;
    return `<article class="card ind-card ${rag}">
      <header><span class="av">${esc(initials(m.member))}</span><div><h3>${esc(m.member)}</h3><span class="muted">${esc(m.role || "")}${m.tutor ? ` · tutor ${esc(m.tutor)}` : ""}</span></div>${pill(lbl, rag)}</header>
      <ol class="ind-steps">${step(1, "Phase 1 — general induction", m.ph1, "pending", !!m.ph1)}${step(2, "Phase 2 — job-specific", m.ph2, m.ph2Due ? `due ${fmtDate(m.ph2Due)}` : "pending", !!m.ph2)}${step(3, "Joins the annual plan", m.ph2, "after phase 2", !!m.ph2)}</ol>
      <div class="ind-facts"><span><b>${ind.length}</b> induction trainings</span><span><b>${excused}</b> plan topic${excused === 1 ? "" : "s"} excused</span></div>
      ${ind.length ? `<ul class="ind-list">${ind.slice(-6).map((x) => `<li data-open="${x.i}"><span>${x.r.done || x.r.date ? fmtDate(x.r.done || x.r.date) : "—"}</span><span class="mono">${esc(x.r.sop || "—")}</span><span>${esc(x.r.topic || "")}</span></li>`).join("")}${ind.length > 6 ? `<li class="muted">… ${ind.length - 6} earlier</li>` : ""}</ul>` : `<p class="muted" style="margin:0;font-size:13px">No induction training recorded yet.</p>`}
      ${m.indNote ? `<p class="ind-note">${esc(m.indNote)}</p>` : ""}
      <footer><button class="btn sm" data-indedit="${i}">Edit induction</button><button class="btn sm" data-indtrn="${esc(m.member)}">＋ Induction training</button>${m.ph2 ? "" : `<button class="btn sm primary" data-indph2="${i}">Phase 2 achieved · ${fmtDate(ref)}</button>`}</footer>
    </article>`;
  };
  body.innerHTML = `
    <div class="card card-pad un-head">
      <div class="card-head"><h2>Induction of new hires <span class="sub">SOPGS0024 — a new hire joins the annual training plan once induction phase 2 is achieved; plan topics dated before that are excused</span></h2></div>
      <div class="row"><select data-indwho aria-label="Team member"><option value="">— choose a team member —</option>${others.map(({ m, i }) => `<option value="${i}">${esc(m.member)}${m.role ? ` · ${esc(m.role)}` : ""}</option>`).join("")}</select><button class="btn sm primary" data-indstart>Start an induction</button><span class="muted" style="font-size:12.5px">Not in the QA team yet? Add the person in QA load first (Team Member + role).</span></div>
    </div>
    <div class="ind-grid">${list.map(card).join("") || `<div class="card card-pad"><div class="empty">No new hire in induction — choose a team member above to start one.</div></div>`}</div>`;
  const save = (i, patch, msg) => { const rec = { ...s.load[i], ...patch }; store.upsert("t2", "load", i, rec, rec.member); toast(msg); redraw(); };
  $("[data-indstart]", body).onclick = () => { const v = $("[data-indwho]", body).value; if (v === "") return toast("Choose a team member first"); save(+v, { newHire: "Yes" }, `${s.load[+v].member}: induction started`); };
  $$("[data-indedit]", body).forEach((b) => b.onclick = () => openEditor({ tier: "t2", reg: "load", index: +b.dataset.indedit, onSaved: redraw }));
  $$("[data-indph2]", body).forEach((b) => b.onclick = async () => {
    const m = s.load[+b.dataset.indph2];
    if (!await confirmDialog({ title: `Induction phase 2 achieved for ${m.member}?`, body: `<p>From ${fmtDate(ref)} ${esc(m.member)} joins the annual training plan: the topics dated from that day count in the plan figures; earlier topics stay excused.</p>`, ok: "Confirm phase 2" })) return;
    save(+b.dataset.indph2, { ph2: ref, ...(m.ph1 ? {} : { ph1: ref }) }, `${m.member}: phase 2 achieved — now in the annual plan`);
  });
  $$("[data-indtrn]", body).forEach((b) => b.onclick = () => openEditor({ tier: "t2", reg: "trn", prefill: { id: nextTrnId(s, `TU-${String(Y).slice(2)}-`), cat: "Unplanned", type: "Induction / New Hire", dept: "QA", audience: "New hire", status: "Completed", date: ref, done: ref, attendees: b.dataset.indtrn, trained: 1, planned: 1 }, onSaved: redraw }));
}

/* ── team × topic matrix ──────────────────────────────── */
const initials = (n) => String(n).split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
const shortLabel = (x) => {
  const t = x.r.sop ? x.r.sop.replace(/\/Onc$/i, "") : String(x.r.topic).replace(/^Chapitre\s*(\d+)\s*:\s*«?\s*/i, "Ch. $1 · ").replace(/\s*»\s*$/, "");
  return t.length > 24 ? `${t.slice(0, 23).trim()}…` : t;
};
function personPlan(rows, name, ref, Y, mandatory = true, s = store.t2) {
  if (!mandatory) {
    const done = rows.filter((x) => x.cat === "Planned" && x.qa && String(x.r.date || "").startsWith(`${Y}`) && x.names.includes(name)).length;
    return { due: 0, done, rate: null, optional: true };
  }
  const topics = rows.filter((x) => x.cat === "Planned" && x.qa && x.r.status !== "Cancelled" && String(x.r.date || "").startsWith(`${Y}`));
  const due = topics.filter((x) => x.r.date <= ref && E.trnRequired(x.r, s).includes(name));
  const done = due.filter((x) => x.names.includes(name)).length;
  return { due: due.length, done, rate: due.length ? done / due.length : null, induction: E.inInduction(s, name, ref) };
}
const rateCls = (r) => (r == null ? "N" : r >= 0.95 ? "G" : r >= 0.9 ? "A" : "R");

function matrixView(body, s, Y, rows) {
  const ref = s.setup.statusDate;
  let topics = rows.filter((x) => x.cat === "Planned" && x.qa && x.r.status !== "Cancelled" && String(x.r.date || "").startsWith(`${Y}`)).sort((a, b) => String(a.r.date).localeCompare(String(b.r.date)) || a.i - b.i);
  if (view.mxDue) topics = topics.filter((x) => x.r.date <= ref);
  const { load, optional, extra } = teamOf(s);
  const opt = [...optional.filter((p) => topics.some((x) => x.names.includes(p.name)) || /\b(QA|Quality)\b/i.test(p.role)), ...extra.filter((p) => topics.some((x) => x.names.includes(p.name)))];
  const team = [...load, ...opt];
  const un = (n) => rows.filter((x) => x.qa && x.cat === "Unplanned" && String(x.when).startsWith(`${Y}`) && x.names.includes(n)).length;
  const ex = (n) => rows.filter((x) => x.qa && x.cat === "External" && x.names.includes(n)).length;
  const months = [];
  topics.forEach((x, j) => { const m = x.r.date.slice(0, 7); if (!months.length || months[months.length - 1].m !== m) months.push({ m, n: 0, start: j }); months[months.length - 1].n++; });
  const starts = new Set(months.map((g) => g.start));
  const csv = [["Person", "Role", ...topics.map((x) => `${x.r.date.slice(0, 7)} ${x.r.sop || x.r.topic}`), "Plan done", "Plan due", "Unplanned", "External"]];
  const cur = ref.slice(0, 7);
  const bodyRows = team.map((p, ix) => {
    const pp = personPlan(rows, p.name, ref, Y, p.mandatory, s);
    const cells = topics.map((x, j) => {
      const ok = x.names.includes(p.name), isDue = x.r.date <= ref;
      const req = p.mandatory && E.trnRequired(x.r, s).includes(p.name);
      const why = !p.mandatory ? "Not required by the plan" : E.inInduction(s, p.name, x.r.date) ? "New hire — induction phase 2 not achieved by then" : "Not on the list of people to train for this topic";
      const st = ok ? "ok" : !req ? "na" : isDue ? "no" : "fut";
      const tip = `${p.name}\n${x.r.sop ? `${x.r.sop} · ` : ""}${x.r.topic}\n${ok ? `Trained${x.r.done ? ` · ${fmtDate(x.r.done)}` : ""}` : !req ? why : isDue ? `Not trained — due ${fmtMonth(x.r.date)}` : `Planned ${fmtMonth(x.r.date)}`}`;
      return `<td class="mx ${st} ${starts.has(j) ? "ms" : ""}" data-open="${x.i}" title="${esc(tip)}"><i>${ok ? "✓" : st === "no" ? "✕" : ""}</i></td>`;
    });
    csv.push([p.name, p.role, ...topics.map((x) => (x.names.includes(p.name) ? "Trained" : x.r.date <= ref ? "Not trained" : "Planned")), pp.done, pp.due, un(p.name), ex(p.name)]);
    const sep = !p.mandatory && (ix === 0 || team[ix - 1].mandatory) ? `<tr class="mx-sep"><th class="mx-name" scope="rowgroup"><span class="nm">Not required by the plan<small>may attend — not in the plan figures</small></span></th><td colspan="${topics.length + 3}"></td></tr>` : "";
    return `${sep}<tr class="${p.mandatory ? "" : "optional"}"><th class="mx-name" scope="row"><span class="av">${esc(initials(p.name))}</span><span class="nm">${esc(p.name)}<small>${esc(p.role || "")}${pp.induction ? ` · <b class="ind-tag">in induction</b>` : ""}</small></span></th>
      <td class="mx-sum">${pp.optional ? `<span class="opt-tag">Optional</span><small>${pp.done} plan topic${pp.done === 1 ? "" : "s"} attended</small>` : `<div class="mx-rate ${rateCls(pp.rate)}"><span><i style="width:${pp.rate == null ? 0 : Math.round(pp.rate * 100)}%"></i></span><b>${pp.rate == null ? "—" : pct(pp.rate)}</b></div><small>${pp.done} / ${pp.due} due</small>`}</td>
      <td class="mx-cnt">${un(p.name) || "—"}</td><td class="mx-cnt last">${ex(p.name) || "—"}</td>${cells.join("")}</tr>`;
  }).join("");
  const foot = topics.map((x, j) => {
    const fg = E.trnFigures(x.r, s), n = fg.trained, r = fg.planned ? n / fg.planned : 0, isDue = x.r.date <= ref;
    return `<td class="mx-foot ${starts.has(j) ? "ms" : ""}" title="${esc(`${x.r.topic}: ${n} of the ${fg.planned} people to train`)}"><span class="${isDue ? rateCls(r) : "N"}">${n}</span></td>`;
  }).join("");
  body.innerHTML = `<div class="card card-pad mx-card">
    <div class="card-head"><h2>Team × annual plan ${Y} <span class="sub">${load.length} people in the plan group · ${topics.length} topics · click a cell to record attendance</span></h2>
      <div class="row"><label class="row" style="gap:6px;font-size:13px"><input type="checkbox" data-mxdue ${view.mxDue ? "checked" : ""}> Topics due only</label><button class="btn sm" data-mxcsv>⤓ CSV</button></div></div>
    <div class="mx-legend"><span><i class="mx-key ok">✓</i>Trained</span><span><i class="mx-key no">✕</i>Due, not trained</span><span><i class="mx-key fut"></i>Still to come</span><span><i class="mx-key na"></i>Not required (new hire in induction, or not on the topic's list)</span><span class="muted">Plan = topics trained ÷ topics due, for the job titles of the plan · bottom row = plan group trained per topic</span></div>
    <div class="matrix-wrap"><table class="matrix">
      <thead><tr class="mx-months"><th class="mx-name corner" rowspan="2" scope="col">Person</th><th class="mx-sum" rowspan="2" scope="col">Plan</th><th class="mx-cnt" rowspan="2" scope="col" title="Unplanned trainings in ${Y}">Unpl.</th><th class="mx-cnt last" rowspan="2" scope="col" title="External courses (all years)">Ext.</th>
        ${months.map((g) => `<th colspan="${g.n}" class="mx-month ms ${g.m === cur ? "cur" : g.m < cur ? "past" : ""}" scope="colgroup">${MON[+g.m.slice(5, 7) - 1]}</th>`).join("")}</tr>
        <tr>${topics.map((x, j) => `<th class="mx-h ${starts.has(j) ? "ms" : ""}" scope="col" title="${esc(`${x.r.sop ? `${x.r.sop} · ` : ""}${x.r.topic} — ${fmtMonth(x.r.date)}`)}"><span>${esc(shortLabel(x))}</span></th>`).join("")}</tr></thead>
      <tbody>${bodyRows || `<tr><td colspan="${topics.length + 4}"><div class="empty">No QA team member yet — fill the QA load register.</div></td></tr>`}</tbody>
      <tfoot><tr><th class="mx-name" scope="row"><span class="nm">Trained per topic<small>of the people each topic must train</small></span></th><td class="mx-sum"></td><td class="mx-cnt"></td><td class="mx-cnt last"></td>${foot}</tr></tfoot>
    </table></div></div>`;
  $("[data-mxdue]", body).onchange = (e) => { view.mxDue = e.target.checked; matrixView(body, s, Y, rows); };
  $("[data-mxcsv]", body).onclick = () => saveFile(`QA_Training_Matrix_${Y}.csv`, new Blob(["﻿" + csv.map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n")], { type: "text/csv" }));
}

/* ── training cards (GS0024/Onc/T03) ──────────────────── */
function cardRows(rows, name) {
  return rows.filter((x) => x.names.includes(name) && x.r.status !== "Cancelled").map((x) => ({
    date: x.r.done || (x.cat !== "Planned" ? x.r.date : "") || "", month: !x.r.done && x.cat === "Planned" ? x.r.date || "" : "", year: x.r.year || "",
    title: x.r.topic || "", doc: x.r.sop || "NA", rev: x.r.version || "", trainer: [E.splitNames(x.r.trainer).join(" · ") || x.r.provider || "", E.trnSelf(x.r) ? "Read & understood" : ""].filter(Boolean).join(" + "),
    cat: x.cat, ttype: x.r.type || "", type: `${x.cat}${x.r.type ? ` · ${x.r.type}` : ""}`, eff: x.r.eff || "", i: x.i,
  })).sort((a, b) => String(a.date || a.month || a.year).localeCompare(String(b.date || b.month || b.year)));
}
function cardsView(body, s, rows) {
  const { load, optional, extra } = teamOf(s);
  const people = [...load, ...optional, ...extra];
  const Y = view.year, ref = s.setup.statusDate;
  view.person = people.some((p) => p.name === view.person) ? view.person : people[0]?.name || null;
  const p = people.find((x) => x.name === view.person);
  const lines = p ? cardRows(rows, p.name) : [];
  const pp = p ? personPlan(rows, p.name, ref, Y, p.mandatory, s) : null;
  const by = (c) => lines.filter((l) => l.cat === c).length;
  const last = lines.filter((l) => l.date).slice(-1)[0];
  body.innerHTML = `
    <div class="card card-pad">
      <div class="card-head"><h2>Employee training cards <span class="sub">template GS0024/Onc/T03 · built from the register · no employee code or hiring date</span></h2>
        <div class="row"><button class="btn sm" data-card ${p ? "" : "disabled"}>⤓ This card (xlsx)</button><button class="btn sm" data-cards ${people.length ? "" : "disabled"}>⤓ All ${people.length} cards</button></div></div>
      <div class="tc-people" role="tablist" aria-label="Person">${people.map((x) => { const q = personPlan(rows, x.name, ref, Y, x.mandatory, s); return `<button type="button" role="tab" class="tc-person" data-person="${esc(x.name)}" aria-selected="${x.name === view.person}">
        <span class="av ${rateCls(q.rate)}">${esc(initials(x.name))}</span><span class="nm">${esc(x.name)}<small>${q.optional ? `optional · ${q.done} plan topic${q.done === 1 ? "" : "s"}` : q.due ? `${q.done}/${q.due} plan · ${pct(q.rate)}` : "no plan topic due"}</small></span></button>`; }).join("")}</div>
    </div>
    ${p ? `<article class="card tc-doc">
      <header class="tc-docbar">
        <div class="tc-who"><span class="av big ${rateCls(pp.rate)}">${esc(initials(p.name))}</span><div><div class="eyebrow">Employee training card · Quality Assurance</div><h2>${esc(p.name)}</h2><div class="muted">${esc(p.role || "—")}</div></div></div>
        <dl class="tc-stats">
          <div class="${rateCls(pp.rate)}"><dt>Annual plan ${Y}</dt><dd ${pp.optional ? 'class="sm"' : ""}>${pp.optional ? "Optional" : pp.rate == null ? "—" : pct(pp.rate)}</dd><small>${pp.optional ? `not in the plan group · ${pp.done} attended` : `${pp.done} of ${pp.due} topics due`}</small></div>
          <div><dt>Planned</dt><dd>${by("Planned")}</dd><small>sessions attended</small></div>
          <div><dt>Unplanned</dt><dd>${by("Unplanned")}</dd><small>SOP, induction, other</small></div>
          <div><dt>External</dt><dd>${by("External")}</dd><small>courses</small></div>
          <div><dt>Last training</dt><dd class="sm">${last ? fmtDate(last.date) : "—"}</dd><small>${lines.length} on the card</small></div>
        </dl>
      </header>
      <div class="tc-table"><table class="data tc">
        <colgroup><col style="width:46px"><col style="width:98px"><col><col style="width:142px"><col style="width:52px"><col style="width:124px"><col style="width:168px"><col style="width:140px"></colgroup>
        <thead><tr><th class="num">No.</th><th>Date</th><th>Training name</th><th>Document No.</th><th class="num">Rev.</th><th>Trainer(s) / delivery</th><th>Training type</th><th>Effectiveness</th></tr></thead>
        <tbody>${lines.map((l, n) => `<tr data-open="${l.i}"><td class="num muted">${n + 1}</td><td>${l.date ? fmtDate(l.date) : l.month ? `<span class="muted" title="Exact date not recorded">${esc(fmtMonth(l.month))}</span>` : esc(String(l.year || "—"))}</td>
          <td class="tc-title">${esc(l.title)}</td><td class="mono">${esc(l.doc)}</td><td class="num">${esc(l.rev)}</td><td>${esc(l.trainer)}</td>
          <td><span class="cat-pill ${l.cat}">${esc(l.cat)}</span><small class="tc-type">${esc(l.ttype)}</small></td><td>${l.eff ? pill(l.eff) : `<span class="muted">—</span>`}</td></tr>`).join("") || `<tr><td colspan="8"><div class="empty">No training recorded for ${esc(p.name)} yet</div></td></tr>`}</tbody>
      </table></div>
    </article>` : `<div class="card card-pad"><div class="empty">No QA team member yet — fill the QA load register.</div></div>`}`;
  $$("[data-person]", body).forEach((b) => b.onclick = () => { view.person = b.dataset.person; cardsView(body, s, rows); });
  $("[data-card]", body)?.addEventListener("click", (e) => busy(e.currentTarget, () => exportCards(s, rows, [p])));
  $("[data-cards]", body)?.addEventListener("click", (e) => busy(e.currentTarget, () => exportCards(s, rows, people)));
}

/* ── xlsx exports ─────────────────────────────────────── */
const siteSlug = (s) => slug(String(s.setup.site || "site").split("—")[0]).replace(/-/g, "_");

async function exportCards(s, rows, people) {
  const X = await loadScript(XLSX_URL, "XLSX");
  const wb = X.utils.book_new();
  for (const p of people) {
    const lines = cardRows(rows, p.name);
    const aoa = [
      ["Employee Training Card (Carte de formation de l'employé)", "", "", "", "", "", "", "Template GS0024/Onc/T03"], [],
      ["Employee Name (nom de l'employé)", "", p.name], ["Department (Département)", "", "Quality Assurance"], ["Title (Titre de la fonction)", "", p.role || ""], [],
      ["Sr. No.", "Training Date (Date de la formation)", "Training Name (Titre de la formation)", "Document Number (Numéro du Document)", "Revision Number", "Trainer Name (nom du formateur) / delivery", "Training Type (Type de formation)", "Effectiveness / Evaluation / Result"],
      ...lines.map((l, n) => [n + 1, l.date ? new Date(`${l.date}T00:00:00Z`) : l.month ? fmtMonth(l.month) : l.year ? String(l.year) : "", l.title, l.doc, l.rev, l.trainer, l.type, l.eff]),
    ];
    const ws = X.utils.aoa_to_sheet(aoa, { cellDates: true, dateNF: "dd/mm/yyyy" });
    ws["!cols"] = [{ wch: 7 }, { wch: 14 }, { wch: 60 }, { wch: 22 }, { wch: 9 }, { wch: 22 }, { wch: 30 }, { wch: 18 }];
    ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 6 } }];
    X.utils.book_append_sheet(wb, ws, p.name.replace(/[\\/?*[\]:]/g, " ").slice(0, 31));
  }
  const out = X.write(wb, { type: "array", bookType: "xlsx" });
  const name = people.length === 1 ? `Training_Card_${people[0].name.replace(/\s+/g, "_")}.xlsx` : `QA_Training_Cards_${siteSlug(s)}_${s.setup.statusDate}.xlsx`;
  await saveFile(name, new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
}

/** The department report in the corporate layout (Planned + UnPlanned sheets, QA_Onc row), plus the register. */
export async function exportDeptReport(s, Y = yearOf(s)) {
  const X = await loadScript(XLSX_URL, "XLSX");
  const rep = monthlyReport(s, Y);
  const wb = X.utils.book_new();
  const months = rep.map((m) => m.label);
  // Planned Oncology Training
  const p1 = ["", "period", ...months.flatMap((m) => [m, "", "", ""])];
  const p2 = ["Sr No.:", "Department", ...months.flatMap(() => ["Number of topic planned (P)", "Number of topic executed (E)", "Employee to be trained", "Employee trained (training done)"])];
  const p3 = [5, "QA_Onc", ...rep.flatMap((m) => [m.P || "", m.P ? m.E ?? "" : "", m.toTrain || "", m.P ? m.trained ?? "" : ""])];
  const ws1 = X.utils.aoa_to_sheet([p1, p2, p3]);
  ws1["!merges"] = rep.map((_, k) => ({ s: { r: 0, c: 2 + k * 4 }, e: { r: 0, c: 5 + k * 4 } }));
  ws1["!cols"] = [{ wch: 7 }, { wch: 16 }, ...rep.flatMap(() => [{ wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }])];
  X.utils.book_append_sheet(wb, ws1, "Planned Oncology Training");
  // UnPlanned Oncology Training
  const u1 = ["", "period", ...months.flatMap((m) => [m, "", ""])];
  const u2 = ["Sr No.:", "Department", ...months.flatMap(() => ["Employee trained  (Quality Circle)", "Employee trained  (SOP Training)", "Employee trained  (Others)"])];
  const u3 = [5, "QA_Onc", ...rep.flatMap((m) => [m.qc || "", m.sop || "", m.other || ""])];
  const ws2 = X.utils.aoa_to_sheet([u1, u2, u3]);
  ws2["!merges"] = rep.map((_, k) => ({ s: { r: 0, c: 2 + k * 3 }, e: { r: 0, c: 4 + k * 3 } }));
  ws2["!cols"] = [{ wch: 7 }, { wch: 16 }, ...rep.flatMap(() => [{ wch: 12 }, { wch: 12 }, { wch: 12 }])];
  X.utils.book_append_sheet(wb, ws2, "UnPlanned Oncology Training");
  // the register behind it
  const head = ["Training ID", "Category", "Training type", "Document No.", "Revision", "Training title", "Trained department", "Planned date", "Rescheduled", "Completion date", "Delivery", "Trainer(s)", "External provider", "Year", "Status", "Employees to be trained", "Employees trained", "Names", "Effectiveness", "Comments"];
  const keys = ["id", "cat", "type", "sop", "version", "topic", "dept", "date", "resched", "done", "mode", "trainer", "provider", "year", "status", "planned", "trained", "attendees", "eff", "comments"];
  const ws3 = X.utils.aoa_to_sheet([head, ...(s.trn || []).map((r) => keys.map((k) => (["date", "done"].includes(k) && r[k] ? new Date(`${r[k]}T00:00:00Z`) : r[k] ?? "")))], { cellDates: true, dateNF: "dd/mm/yyyy" });
  ws3["!cols"] = keys.map((k) => ({ wch: k === "topic" ? 50 : k === "attendees" || k === "comments" ? 40 : 14 }));
  X.utils.book_append_sheet(wb, ws3, "Training register");
  const out = X.write(wb, { type: "array", bookType: "xlsx" });
  await saveFile(`QA_Onc_Department_Training_Report_${Y}_${s.setup.statusDate}.xlsx`, new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
}
