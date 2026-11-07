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
import { esc, pill, fmtDate, fmtMonth, pct, toast, $, $$, fresh } from "./ui.js";
import { saveFile, loadScript, slug, CHART_DATA, decorateCharts } from "./export.js";

const XLSX_URL = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const has = (v) => v !== "" && v != null;
const namesOf = (r) => String(r.attendees || "").split(",").map((x) => x.trim()).filter(Boolean);
const view = { tab: "overview", person: null, year: null };

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
      P: plan.length, E: past ? plan.filter((x) => x.r.status === "Completed").length : null,
      toTrain: sum(plan, (x) => x.r.planned), trained: past ? sum(plan, (x) => x.r.trained) : null,
      qc: sum(un.filter((x) => x.bucket === "Quality Circle"), (x) => x.r.trained),
      sop: sum(un.filter((x) => x.bucket === "SOP Training"), (x) => x.r.trained),
      other: sum(un.filter((x) => x.bucket === "Others"), (x) => x.r.trained),
      ext: sum(ext, (x) => x.r.trained), sessions: un.length + ext.length,
    };
  });
}

/** The QA team: the QA load members, then anyone else trained with the QA department. */
function teamOf(s) {
  // the plan's attendee group: QA job titles (a member with another role counts once trained on the plan)
  const inPlan = new Set(rowsOf(s).filter((x) => x.cat === "Planned").flatMap((x) => x.names));
  const load = (s.load || []).map((r) => ({ name: r.member, role: r.role })).filter((x) => x.name && (/\bQA\b/i.test(x.role || "") || inPlan.has(x.name)));
  const seen = new Set(load.map((x) => x.name));
  const extra = [];
  for (const x of rowsOf(s)) if (x.qa) for (const n of x.names) if (!seen.has(n)) { seen.add(n); extra.push({ name: n, role: "" }); }
  return { load, extra };
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

  root.innerHTML = `
    <div class="reg-head">
      <div class="reg-no">09</div>
      <div><div class="eyebrow">Tier 2 · Daily management · training</div>
        <h1 style="font-size:28px;margin-top:4px">Training</h1>
        <p class="muted" style="margin:4px 0 0;max-width:820px">The QA department training file: the annual plan (GS0024/Onc/T06), unplanned training — SOP revisions, new SOPs, quality circles, corporate, audit-driven, on the job — external courses, and the sessions QA gives to other departments.</p>
        <div class="meta-row"><span>KPI <b>${esc(k.name)}</b> = annual plan only</span><span>Unplanned and external training are tracked, not targeted</span></div>
      </div>
      <div class="row">
        ${years.length > 1 ? `<label class="fctl" style="min-width:110px"><span>Year</span><select data-year>${years.map((y) => `<option ${y === Y ? "selected" : ""}>${y}</option>`).join("")}</select></label>` : ""}
        <a class="btn" href="#/t2/reg/trn">Sessions register ›</a>
        <button class="btn primary" data-new>＋ New training</button>
      </div>
    </div>
    <div class="row" style="margin:4px 0 16px"><div class="seg-ctl" role="group" aria-label="Training view">
      ${[["overview", "Overview & monthly report"], ["plan", "Annual plan"], ["matrix", "Team matrix"], ["cards", "Training cards"]].map(([v, l]) => `<button type="button" data-tab="${v}" aria-pressed="${view.tab === v}">${l}</button>`).join("")}
    </div><span class="spacer"></span><button class="btn" data-xlsx>⤓ Department report (xlsx)</button></div>
    <div class="kpi-grid" style="margin-bottom:16px">
      ${tile("Annual plan adherence", k.actual === "" ? "—" : pct(k.actual), `Target ${esc(k.targetText)} · ${E.RAG_TEXT[k.rag]}`, k.rag)}
      ${tile("Plan topics executed", `${due.filter((x) => x.r.status === "Completed").length} / ${due.length}`, `due to date · ${planned.length} planned in ${Y}`)}
      ${tile("Plan topics overdue", String(overdueTopics.length), overdueTopics.length ? "past their month, not completed" : "none", overdueTopics.length ? "R" : "G")}
      ${tile("Unplanned training", String(unY.length), `${sumT(unY)} employees trained in ${Y}`)}
      ${tile("External courses", String(extAll.length), `${sumT(extAll)} participations · ${[...new Set(extAll.map((x) => x.r.year || String(x.when).slice(0, 4)))].sort().join(", ")}`)}
      ${tile("Given by QA to other departments", String(given.length), `${sumT(given)} employees trained in ${Y}`)}
    </div>
    <div data-tabbody></div>`;

  const body = $("[data-tabbody]", root);
  if (view.tab === "overview") overview(body, s, Y, rows);
  else if (view.tab === "plan") planView(body, s, Y, rows);
  else if (view.tab === "matrix") matrixView(body, s, Y, rows);
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
  const trainers = Object.entries(rows.filter((x) => String(x.when).startsWith(`${Y}`) && x.r.trainer).reduce((m, x) => ((m[x.r.trainer] = (m[x.r.trainer] || 0) + 1), m), {})).sort((a, b) => b[1] - a[1]);
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
      <div class="card card-pad"><div class="card-head"><h2>Trainers <span class="sub">sessions delivered in ${Y}, other departments included</span></h2></div>${hbars(trainers.map(([label, value]) => ({ label, value, cls: "f-s3" })), { width: 560, labelW: 170 })}</div>
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
  const plan = rows.filter((x) => x.cat === "Planned" && String(x.r.date || "").startsWith(`${Y}`)).sort((a, b) => String(a.r.date).localeCompare(String(b.r.date)) || a.i - b.i);
  const months = MON.map((m, k) => ({ ym: `${Y}-${String(k + 1).padStart(2, "0")}`, label: `${fmtMonth(`${Y}-${String(k + 1).padStart(2, "0")}-01`)}` }))
    .map((m) => ({ ...m, items: plan.filter((x) => x.r.date.startsWith(m.ym)) })).filter((m) => m.items.length);
  const state = (x) => (x.r.status === "Cancelled" ? ["Cancelled", "N"] : x.r.status === "Completed" ? ["Completed", "G"] : x.c.live === "Overdue" ? ["Overdue", "R"] : x.r.status === "Rescheduled" || x.r.resched === "Yes" ? ["Rescheduled", "A"] : x.r.status === "In Progress" ? ["In progress", "A"] : ["Planned", "info"]);
  body.innerHTML = `
    <div class="plan-strip card card-pad">${MON.map((m, k) => {
      const ym = `${Y}-${String(k + 1).padStart(2, "0")}`, items = plan.filter((x) => x.r.date.startsWith(ym));
      return `<div class="ps-m ${ym === s.setup.statusDate.slice(0, 7) ? "cur" : ""}"><b>${m}</b><span>${items.map((x) => `<i class="d ${state(x)[1]}" title="${esc(`${x.r.sop || x.r.type}: ${x.r.topic} — ${state(x)[0]}`)}"></i>`).join("") || `<em>—</em>`}</span></div>`;
    }).join("")}</div>
    <div class="row" style="margin:14px 0 10px"><span class="muted" style="font-size:13px">${plan.length} topics · click a topic to record attendance, a new date (rescheduled) or the completion date.</span><span class="spacer"></span>
      <a class="btn sm" href="#/t2/reg/trn?new=1&prefill=${encodeURIComponent(JSON.stringify({ cat: "Planned", type: "SOP (annual plan)", dept: "QA", status: "Planned", resched: "No", planned: (s.load || []).length - 1 }))}">＋ Add a plan topic</a></div>
    <div class="stack">${months.map((m) => `<div class="card plan-month"><div class="pm-head"><b>${esc(m.label)}</b><span class="muted">${m.items.length} topic${m.items.length > 1 ? "s" : ""} · ${m.items.filter((x) => x.r.status === "Completed").length} completed</span></div>
      ${m.items.map((x) => { const [lbl, rag] = state(x); const p = +x.r.planned || 0, t = +x.r.trained || 0; return `<button type="button" class="pm-row" data-open="${x.i}">
        <span class="mono">${esc(x.r.sop || "—")}</span>
        <span class="pm-title">${esc(x.r.topic)}<small>${esc(x.r.type || "")}${x.r.trainer ? ` · ${esc(x.r.trainer)}` : ""}${x.r.done ? ` · held ${fmtDate(x.r.done)}` : ""}</small></span>
        <span class="pm-bar" title="${t} of ${p} trained"><i style="width:${p ? Math.min(100, (t / p) * 100) : 0}%" class="${rag}"></i></span><span class="num">${p ? `${t}/${p}` : ""}</span>${pill(lbl, rag)}</button>`; }).join("")}</div>`).join("") || `<div class="empty">No annual plan for ${Y} yet — add the topics of the department plan.</div>`}</div>`;
}

/* ── team × topic matrix ──────────────────────────────── */
function matrixView(body, s, Y, rows) {
  const ref = s.setup.statusDate;
  const topics = rows.filter((x) => x.cat === "Planned" && x.qa && x.r.status !== "Cancelled" && String(x.r.date || "").startsWith(`${Y}`)).sort((a, b) => String(a.r.date).localeCompare(String(b.r.date)) || a.i - b.i);
  const { load, extra } = teamOf(s);
  const team = [...load, ...extra.filter((p) => topics.some((x) => x.names.includes(p.name)))];
  const un = (n) => rows.filter((x) => x.qa && x.cat === "Unplanned" && String(x.when).startsWith(`${Y}`) && x.names.includes(n)).length;
  const ex = (n) => rows.filter((x) => x.qa && x.cat === "External" && x.names.includes(n)).length;
  const csv = [["Person", "Role", ...topics.map((x) => `${x.r.date.slice(0, 7)} ${x.r.sop || x.r.topic}`), "Plan done", "Plan due", "Unplanned", "External"]];
  const body2 = team.map((p) => {
    let done = 0, dueN = 0;
    const cells = topics.map((x) => {
      const ok = x.names.includes(p.name), isDue = x.r.date <= ref;
      if (isDue) dueN++; if (ok) done++;
      return ok ? `<td class="mx ok" title="${esc(`${p.name} · ${x.r.topic}: trained`)}">✓</td>` : isDue ? `<td class="mx no" title="${esc(`${p.name} · ${x.r.topic}: not trained`)}">✕</td>` : `<td class="mx fut" title="${esc(`${x.r.topic}: ${fmtMonth(x.r.date)}`)}">·</td>`;
    });
    csv.push([p.name, p.role, ...topics.map((x) => (x.names.includes(p.name) ? "Trained" : x.r.date <= ref ? "Not trained" : "Planned")), done, dueN, un(p.name), ex(p.name)]);
    const r = dueN ? done / dueN : null;
    return `<tr><th class="mx-name">${esc(p.name)}<small>${esc(p.role || "")}</small></th>${cells.join("")}<td class="num"><b class="${r == null ? "" : r >= 0.95 ? "g" : r >= 0.9 ? "a" : "r"}">${r == null ? "—" : pct(r)}</b></td><td class="num">${un(p.name)}</td><td class="num">${ex(p.name)}</td></tr>`;
  }).join("");
  body.innerHTML = `<div class="card card-pad">
    <div class="card-head"><h2>Team × annual plan ${Y} <span class="sub">✓ trained · ✕ due, not trained · · still to come</span></h2><button class="btn sm" data-mxcsv>⤓ CSV</button></div>
    <div class="table-wrap matrix-wrap"><table class="data matrix"><thead><tr><th class="mx-name">Person</th>${topics.map((x) => `<th class="mx-h" title="${esc(`${x.r.sop || ""} ${x.r.topic}`)}"><span>${esc(MON[+x.r.date.slice(5, 7) - 1])} · ${esc(x.r.sop ? x.r.sop.replace(/\/Onc$/i, "") : x.r.topic.slice(0, 26))}</span></th>`).join("")}<th class="num">Plan %</th><th class="num">Unplanned</th><th class="num">External</th></tr></thead>
    <tbody>${body2}</tbody></table></div>
    <p class="muted" style="margin:10px 0 0;font-size:12.5px">Plan % = topics trained ÷ topics due to date for that person. Tick names on a topic (Annual plan tab) to update the matrix.</p></div>`;
  $("[data-mxcsv]", body).onclick = () => saveFile(`QA_Training_Matrix_${Y}.csv`, new Blob(["﻿" + csv.map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n")], { type: "text/csv" }));
}

/* ── training cards (GS0024/Onc/T03) ──────────────────── */
function cardRows(rows, name) {
  return rows.filter((x) => x.names.includes(name) && x.r.status !== "Cancelled").map((x) => ({
    date: x.r.done || (x.cat !== "Planned" ? x.r.date : "") || "", month: !x.r.done && x.cat === "Planned" ? x.r.date || "" : "", year: x.r.year || "", title: x.r.topic || "", doc: x.r.sop || (x.cat === "External" ? "N/A" : "NA"),
    rev: x.r.version || "", trainer: x.r.trainer || x.r.provider || "", type: `${x.cat}${x.r.type ? ` · ${x.r.type}` : ""}`, eff: x.r.eff || "", i: x.i,
  })).sort((a, b) => String(a.date || a.month || a.year).localeCompare(String(b.date || b.month || b.year)));
}
function cardsView(body, s, rows) {
  const { load, extra } = teamOf(s);
  const people = [...load, ...extra];
  view.person = people.some((p) => p.name === view.person) ? view.person : people[0]?.name || null;
  const p = people.find((x) => x.name === view.person);
  const lines = p ? cardRows(rows, p.name) : [];
  body.innerHTML = `<div class="grid split-wide">
    <div class="card card-pad tcard">
      <div class="card-head"><h2>Employee training card <span class="sub">template GS0024/Onc/T03</span></h2>
        <div class="row"><select data-person aria-label="Person">${people.map((x) => `<option ${x.name === view.person ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select><button class="btn sm" data-card>⤓ This card (xlsx)</button><button class="btn sm" data-cards>⤓ All cards</button></div></div>
      ${p ? `<dl class="tc-id"><dt>Employee name</dt><dd>${esc(p.name)}</dd><dt>Department</dt><dd>Quality Assurance</dd><dt>Title</dt><dd>${esc(p.role || "—")}</dd></dl>
      <div class="table-wrap"><table class="data"><thead><tr><th class="num">No.</th><th>Training date</th><th>Training name</th><th>Document No.</th><th>Rev.</th><th>Trainer</th><th>Training type</th><th>Effectiveness</th></tr></thead>
      <tbody>${lines.map((l, n) => `<tr data-open="${l.i}"><td class="num">${n + 1}</td><td style="white-space:nowrap">${l.date ? fmtDate(l.date) : l.month ? `<span title="Exact date not recorded">${esc(fmtMonth(l.month))}</span>` : esc(String(l.year || "—"))}</td><td class="wrap"><div class="clip">${esc(l.title)}</div></td><td class="mono">${esc(l.doc)}</td><td>${esc(l.rev)}</td><td>${esc(l.trainer)}</td><td>${esc(l.type)}</td><td>${l.eff ? pill(l.eff) : ""}</td></tr>`).join("") || `<tr><td colspan="8"><div class="empty">No training recorded for ${esc(p.name)} yet</div></td></tr>`}</tbody></table></div>
      <p class="muted" style="margin:10px 0 0;font-size:12.5px">The card is built from the training register: every session where the person is ticked as trained. No employee code or hiring date is kept.</p>` : `<div class="empty">No QA team member yet — fill the QA load register.</div>`}
    </div>
    <div class="stack">${p ? (() => {
      const by = lines.reduce((m, l) => ((m[l.type.split(" · ")[0]] = (m[l.type.split(" · ")[0]] || 0) + 1), m), {});
      return `<div class="card card-pad"><div class="card-head"><h2>${esc(p.name.split(" ")[0])} at a glance</h2></div>
        <div class="glance">${["Planned", "Unplanned", "External"].map((c) => `<div><b>${by[c] || 0}</b><span>${c}</span></div>`).join("")}</div>
        <p class="muted" style="margin:12px 0 0;font-size:13px">${lines.length} trainings on the card · last on ${lines.filter((l) => l.date).slice(-1)[0] ? fmtDate(lines.filter((l) => l.date).slice(-1)[0].date) : "—"}</p></div>`;
    })() : ""}</div></div>`;
  $("[data-person]", body)?.addEventListener("change", (e) => { view.person = e.target.value; cardsView(body, s, rows); });
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
      ["Sr. No.", "Training Date (Date de la formation)", "Training Name (Titre de la formation)", "Document Number (Numéro du Document)", "Revision Number", "Trainer Name (nom du formateur)", "Training Type (Type de formation)", "Effectiveness / Evaluation / Result"],
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
  const head = ["Training ID", "Category", "Training type", "Document No.", "Revision", "Training title", "Trained department", "Planned date", "Rescheduled", "Completion date", "Trainer", "External provider", "Year", "Status", "Employees to be trained", "Employees trained", "Names", "Effectiveness", "Comments"];
  const keys = ["id", "cat", "type", "sop", "version", "topic", "dept", "date", "resched", "done", "trainer", "provider", "year", "status", "planned", "trained", "attendees", "eff", "comments"];
  const ws3 = X.utils.aoa_to_sheet([head, ...(s.trn || []).map((r) => keys.map((k) => (["date", "done"].includes(k) && r[k] ? new Date(`${r[k]}T00:00:00Z`) : r[k] ?? "")))], { cellDates: true, dateNF: "dd/mm/yyyy" });
  ws3["!cols"] = keys.map((k) => ({ wch: k === "topic" ? 50 : k === "attendees" || k === "comments" ? 40 : 14 }));
  X.utils.book_append_sheet(wb, ws3, "Training register");
  const out = X.write(wb, { type: "array", bookType: "xlsx" });
  await saveFile(`QA_Onc_Department_Training_Report_${Y}_${s.setup.statusDate}.xlsx`, new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
}
