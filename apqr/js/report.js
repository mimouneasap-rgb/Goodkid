// Detailed APQR programme report as a Word document, generated in the browser
// from the live data: cover, contents, executive summary, KPI tiles, every
// key chart (rendered off-screen and embedded as high-resolution PNG), tables,
// risks, workload, actions, changes made in the app and a full register.
import * as store from "./store.js";
import { Docx } from "./docx.js";
import { elementToPng } from "./snap.js";
import { esc, fmtN, fmtPct, fmtDate, fmtMonth, fmtMonthShort, RAG_META, FQ_META, download, toast, openDialog, icon } from "./ui.js";
import { segBar, hbars, lineChart, stackedColumns, columns, deptColor, stageColor, LC } from "./charts.js";
import { SLOTS, FINAL_QA_SIGNALS, DEPARTMENTS, eomonth, annexMatrix } from "./engine.js";
import { workflowMonthChart, finalQaMonthChart, RAG_COLOR, FQ_COLOR } from "./views-overview.js";

const RAG_ORDER = ["COMPLETE", "ON TRACK", "DUE SOON", "OVERDUE", "NOT STARTED - overdue", "Not yet due"];
const RAG_CELL = { COMPLETE: ["E3F5E3", "0A6B0A"], "ON TRACK": ["E3EEFB", "1D5AA6"], "DUE SOON": ["FFF3D6", "8A5A00"], OVERDUE: ["FDE5E5", "A52020"], "NOT STARTED - overdue": ["F9D3D3", "7A1515"], "Not yet due": ["EEF0F5", "5A607A"], "No tasks": ["EEF0F5", "5A607A"] };
const FQ_CELL = { Complete: ["E3F5E3", "0A6B0A"], "Raised, not complete": ["E3EEFB", "1D5AA6"], "NOT TRIGGERED - data ready": ["FDE5E5", "A52020"], "Waiting on data collection": ["FFF3D6", "8A5A00"], "Not triggered": ["EEF0F5", "5A607A"] };
const ragCell = (r) => ({ text: RAG_META[r]?.label || r, fill: RAG_CELL[r]?.[0], color: RAG_CELL[r]?.[1], bold: true });
const fqCell = (s) => ({ text: FQ_META[s]?.label || s, fill: FQ_CELL[s]?.[0], color: FQ_CELL[s]?.[1], bold: true });
const SECTIONS = [
  ["summary", "Executive summary and KPIs", "Headline figures, RAG status, key messages"],
  ["progress", "Programme progress by planned month", "Workflow chart and the month table"],
  ["finalqa", "Final QA compilation", "Final QA chart, signals and reviews ready to compile"],
  ["annexes", "Annexes and departments", "Ten required annexes, departments, burn-up, dosage forms"],
  ["collection", "Data collection", "Stages by month, owners and reviewers, missing names"],
  ["deptcollect", "Data collection by department", "Stage mix, month heat-map, owners and reviewers per department"],
  ["workload", "Workload by person", "Open, overdue and closed per person or group"],
  ["risks", "Overdue reviews and quality signals", "Reviews past their PQR due date, data-quality findings"],
  ["actions", "QA actions", "Open and completed follow-up actions"],
  ["changes", "Changes made in the app", "Edits recorded in the audit trail"],
  ["register", "Appendix — full APQR register", "Every planned product (landscape)"],
  ["method", "Appendix — method and definitions", "How the figures are calculated"],
];
let lastChoice = Object.fromEntries(SECTIONS.map(([k]) => [k, true]));

/* ------------------------------------------------------------------ dialog */

export function openReportDialog() {
  const m = store.getModel();
  if (!store.hasData()) { toast("Import data first."); return; }
  const dlg = openDialog(`<div class="modal-body">
    <h3 class="modal-title">${icon("word")} Word report</h3>
    <p class="muted" style="margin:0">A detailed programme report built from the data as it is now (report date ${esc(fmtDate(m.report))}). Charts are embedded as high-resolution images; tables stay editable in Word.</p>
    <div class="rep-opts">${SECTIONS.map(([k, l, d]) => `<label><input type="checkbox" data-rep="${k}" ${lastChoice[k] ? "checked" : ""}><span>${esc(l)}<small>${esc(d)}</small></span></label>`).join("")}</div>
    <div class="modal-actions"><button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" data-go>${icon("download")}Create report</button></div>
  </div>`, { wide: true });
  dlg.querySelector("[data-close]").addEventListener("click", () => dlg.close());
  dlg.querySelector("[data-go]").addEventListener("click", () => {
    lastChoice = Object.fromEntries(SECTIONS.map(([k]) => [k, dlg.querySelector(`[data-rep="${k}"]`).checked]));
    dlg.close();
    buildReport(lastChoice);
  });
}

/* ------------------------------------------------------------ busy overlay */

function busy() {
  const el = document.createElement("div");
  el.className = "report-busy";
  el.innerHTML = `<div><span>Building the Word report…</span><div class="bar"><span></span></div><small>Rendering charts</small></div>`;
  document.body.append(el);
  return { set(p, msg) { el.querySelector(".bar span").style.width = `${Math.round(p * 100)}%`; if (msg) el.querySelector("small").textContent = msg; }, done() { el.remove(); } };
}

/* ------------------------------------------------------------- chart HTML */

const card = (title, sub, inner) => `<section class="card"><div class="card-h"><div><h3>${esc(title)}</h3>${sub ? `<p>${esc(sub)}</p>` : ""}</div></div>${inner}</section>`;
const legend = (items) => `<div class="legend">${items.map(([l, c]) => `<span><i style="background:${c}"></i>${esc(l)}</span>`).join("")}</div>`;

function chartDefs(m) {
  const k = m.kpi;
  const annexes = m.tasks.filter((t) => t.isAnnex && !t.generated);
  const reportMonth = eomonth(m.report, 0);
  const months = [];
  const firstCreated = annexes.map((t) => t.created).filter(Boolean).sort()[0];
  if (firstCreated) { let cur = eomonth(firstCreated, 0); while (cur <= reportMonth && months.length < 36) { months.push(cur.slice(0, 7)); cur = eomonth(cur, 1); } }
  const raised = months.map((mm) => ({ x: mm, y: annexes.filter((t) => t.created && t.created.slice(0, 7) <= mm).length }));
  const closed = months.map((mm) => ({ x: mm, y: annexes.filter((t) => t.closed && t.closedOn && t.closedOn.slice(0, 7) <= mm).length }));

  const stageOf = m.collection.stageOf;
  const real = m.tasks.filter((t) => t.isAnnex && !t.generated);
  const tally = (keyFn, typeFn) => {
    const mp = new Map();
    for (const t of real) {
      const key = keyFn(t) || "Reviewer not set";
      if (!mp.has(key)) mp.set(key, { name: key, type: typeFn(t), c: { "Collecting Data": 0, "Data Review": 0, Completed: 0 }, open: 0, overdue: 0 });
      const r = mp.get(key);
      r.c[stageOf(t)] = (r.c[stageOf(t)] || 0) + 1;
      if (!t.closed) { r.open++; if (t.overdue === "YES") r.overdue++; }
    }
    return [...mp.values()].sort((a, b) => b.open - a.open || b.c.Completed - a.c.Completed || a.name.localeCompare(b.name));
  };
  const stageRows = (list) => list.map((r) => ({ label: r.name, sub: r.type === "user" ? `${r.open} open${r.overdue ? ` · ${r.overdue} late` : ""}` : r.type === "missing" ? "no reviewer named" : `${r.type} · no person named`, segments: [{ key: "Collecting", value: r.c["Collecting Data"] || 0, color: LC.collect }, { key: "In review", value: r.c["Data Review"] || 0, color: LC.review }, { key: "Completed", value: r.c.Completed || 0, color: LC.done }] }));
  const owners = tally((t) => t.collector, (t) => t.collectorType).slice(0, 16);
  const reviewers = tally((t) => t.reviewer, (t) => (t.reviewer ? t.reviewerType : "missing")).slice(0, 16);
  const stLegend = legend([["Collecting", LC.collect], ["In review", LC.review], ["Completed", LC.done]]);
  const top = m.workload.filter((o) => o.open > 0 || o.closed > 0).slice(0, 16);

  const planned = m.tasks.filter((t) => t.isAnnex && m.planByKey.has(t.key));
  const mx = annexMatrix(planned);
  const dgroups = [...mx.rows, mx.total].map((r) => ({ label: r.dept === "Total" ? "Total general" : r.dept, values: mx.stages.map((st) => ({ key: st, value: r.total ? r.counts[st] / r.total : 0, count: r.counts[st], color: stageColor(st) })) }));
  const deptStageRows = DEPARTMENTS.map((dp) => { const ts = planned.filter((t) => t.dept === dp); const c = (st) => ts.filter((t) => stageOf(t) === st).length; return { label: dp, sub: `${fmtN(ts.length)} required`, segments: [{ key: "Completed", value: c("Completed"), color: LC.done }, { key: "In data review", value: c("Data Review"), color: LC.review }, { key: "Collecting data", value: c("Collecting Data"), color: LC.collect }, { key: "Not triggered", value: c("Not triggered"), color: LC.nt }] }; });

  return {
    deptStages: card("Actual APQR annexes progress by department (all planned months)", "% of each department’s required annexes at each current stage; untriggered PQRs count as “Not triggered”", columns(dgroups, { height: 300, series: mx.stages.map((st) => ({ label: st, color: stageColor(st) })) })),
    deptStack: card("Data collection stage by department", "Required annexes of the plan by current stage", legend([["Completed", LC.done], ["In data review", LC.review], ["Collecting data", LC.collect], ["Not triggered", LC.nt]]) + hbars(deptStageRows, { labelWidth: 190, valueLabel: (r) => `${fmtPct(r.segments[0].value / Math.max(1, r.segments.reduce((n, s) => n + s.value, 0)))} <small>done</small>` })),
    rag: card("RAG status of the planned reviews", `${fmtN(m.products.length)} planned products`, segBar(RAG_ORDER.map((r) => ({ label: RAG_META[r].label, value: m.ragCounts[r] || 0, color: RAG_COLOR[r] })), { height: 18 }) + `<div style="height:14px"></div>` + hbars(RAG_ORDER.filter((r) => m.ragCounts[r]).map((r) => ({ label: RAG_META[r].label, segments: [{ key: "Products", value: m.ragCounts[r], color: RAG_COLOR[r] }] })), { labelWidth: 170, max: m.products.length, valueLabel: (r) => `${fmtN(r.segments[0].value)} <small>${fmtPct(r.segments[0].value / Math.max(1, m.products.length))}</small>` })),
    workflow: card("APQR workflow progress by planned month", "Parent APQR of each planned PQR, by planned month", workflowMonthChart(m, 300, 960)),
    finalqa: card("Final QA progress by planned month", "Final QA compilation of each planned PQR", finalQaMonthChart(m, 300, 960)),
    fqsignal: card("Final QA compilation signal", "Where each planned review stands on the last step", segBar(FINAL_QA_SIGNALS.map((s) => ({ label: FQ_META[s].label, value: m.fqCounts[s], color: FQ_COLOR[s] })), { height: 18 }) + `<div style="height:14px"></div>` + hbars(FINAL_QA_SIGNALS.filter((s) => m.fqCounts[s]).map((s) => ({ label: FQ_META[s].label, segments: [{ key: "Products", value: m.fqCounts[s], color: FQ_COLOR[s] }] })), { labelWidth: 200, max: m.products.length })),
    slots: card("The ten required annexes", `Slot completeness across the ${fmtN(k.triggered)} triggered reviews`, legend([["OK (closed)", "var(--slot-ok)"], ["Raised, open", "var(--slot-open)"], ["Never raised", "var(--slot-missing)"]]) + hbars(m.bySlot.map((x) => ({ label: x.label, segments: [{ key: "OK", value: x.ok, color: "var(--slot-ok)" }, { key: "Open", value: x.open, color: "var(--slot-open)" }, { key: "Missing", value: x.missing, color: "var(--slot-missing)" }] })), { labelWidth: 170, valueLabel: (r) => fmtPct(r.segments[0].value / Math.max(1, k.triggered)) })),
    dept: card("Departments", "Required annexes by owning department", legend([["Closed (solid)", "var(--ink-2)"], ["Open (tint)", "color-mix(in srgb, var(--ink-2) 35%, var(--surface-3))"], ["Not raised", "var(--slot-nt)"]]) + hbars(m.byDept.map((x) => ({ label: x.dept, segments: [{ key: "Closed", value: x.closed, color: deptColor(x.dept) }, { key: "Open", value: x.open, color: `color-mix(in srgb, ${deptColor(x.dept)} 35%, var(--surface-3))` }, { key: "Not raised", value: x.notRaised, color: "var(--slot-nt)" }] })), { labelWidth: 170, valueLabel: (r) => `${fmtPct(r.segments[0].value / Math.max(1, r.segments.reduce((n, s) => n + s.value, 0)))} <small>of ${fmtN(r.segments.reduce((n, s) => n + s.value, 0))}</small>` })),
    burn: months.length ? card("Annexe burn-up", `Cumulative annexes raised and closed in Scigeniq against the ${fmtN(k.requiredAnnexes)} required`, lineChart(months, [{ key: "Raised", color: LC.collect, points: raised }, { key: "Closed", color: LC.done, points: closed }], { height: 270, target: k.requiredAnnexes })) : "",
    forms: card("Coverage by dosage form", "Planned, triggered and complete reviews", legend([["Complete", LC.done], ["Triggered, in progress", LC.collect], ["Not triggered", LC.nt]]) + hbars(m.forms.map((f) => ({ label: f.form, segments: [{ key: "Complete", value: f.complete, color: LC.done }, { key: "In progress", value: f.triggered - f.complete, color: LC.collect }, { key: "Not triggered", value: f.planned - f.triggered, color: LC.nt }] })), { labelWidth: 150, valueLabel: (r) => `${r.segments[0].value + r.segments[1].value}<small> / ${r.segments.reduce((n, s) => n + s.value, 0)}</small>` })),
    collection: card("Data collection progress by planned month", "Annexes of the PQRs planned each month, by data collection stage", stackedColumns(m.collection.byMonth.map((x) => ({ label: fmtMonthShort(x.month), sub: `${fmtN(x.total)} annexes`, counts: x.counts })), m.collection.stages.map((st) => ({ key: st, label: st === "Collecting Data" ? "Collecting data" : st === "Data Review" ? "In data review" : st, color: stageColor(st) })), { height: 300, width: 960, capLabel: (g, total) => fmtPct((g.counts.Completed || 0) / total) })),
    owners: card("Workload by data collection owner", "Raised annexes per owner (groups and roles mean no person is named yet)", stLegend + hbars(stageRows(owners), { labelWidth: 190, valueLabel: (r) => `${r.segments[0].value + r.segments[1].value}<small> open</small>` })),
    reviewers: card("Workload by data reviewer", "Raised annexes per reviewer", stLegend + hbars(stageRows(reviewers), { labelWidth: 190, valueLabel: (r) => `${r.segments[0].value + r.segments[1].value}<small> open</small>` })),
    people: card("Load by person or group", "Raised annexes: closed, open and overdue", legend([["Closed", LC.done], ["Open", LC.collect], ["Overdue", "var(--crit)"]]) + hbars(top.map((o) => { const late = Math.min(o.open, o.overdue); return { label: o.user, sub: `${o.type === "user" ? "" : o.type + " · "}${o.mainDept || ""}`, segments: [{ key: "Closed", value: o.closed, color: LC.done }, { key: "Open", value: o.open - late, color: LC.collect }, { key: "Overdue", value: late, color: "var(--crit)" }] }; }), { labelWidth: 190 })),
  };
}

/** Render chart cards off-screen (light theme, no animation) and return PNG bytes per key. */
async function renderCharts(m, keys, progress) {
  const defs = chartDefs(m);
  const root = document.documentElement;
  const prevTheme = root.dataset.theme;
  root.dataset.theme = "light";
  const host = document.createElement("div");
  host.className = "offscreen-render no-anim";
  host.innerHTML = keys.filter((k) => defs[k]).map((k) => `<div data-chart="${k}">${defs[k]}</div>`).join("");
  document.body.append(host);
  const out = {};
  try {
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const list = [...host.querySelectorAll("[data-chart]")];
    for (let i = 0; i < list.length; i++) {
      const el = list[i].querySelector(".card");
      progress((i + 0.5) / list.length, `Rendering chart ${i + 1} of ${list.length}`);
      const { blob, width, height } = await elementToPng(el, { scale: 2, pad: 14, background: "#ffffff" });
      out[list[i].dataset.chart] = { png: new Uint8Array(await blob.arrayBuffer()), width, height };
    }
  } finally {
    host.remove();
    if (prevTheme) root.dataset.theme = prevTheme; else delete root.dataset.theme;
  }
  return out;
}

/* ------------------------------------------------------------------ report */

export async function buildReport(choice = lastChoice) {
  const m = store.getModel();
  const s = store.getState();
  const k = m.kpi;
  const b = busy();
  try {
    const want = (x) => choice[x] !== false;
    const chartKeys = [
      ...(want("summary") ? ["rag"] : []), ...(want("progress") ? ["workflow"] : []), ...(want("finalqa") ? ["finalqa", "fqsignal"] : []),
      ...(want("annexes") ? ["slots", "dept", "burn", "forms"] : []), ...(want("collection") ? ["collection", "owners", "reviewers"] : []), ...(want("deptcollect") ? ["deptStages", "deptStack"] : []), ...(want("workload") ? ["people"] : []),
    ];
    const img = await renderCharts(m, chartKeys, (p, msg) => b.set(p * 0.8, msg));
    b.set(0.85, "Writing the document");
    const programme = s.meta.programme || "APQR programme";
    const org = s.meta.organisation || "";
    const d = new Docx({ title: `APQR programme report — ${fmtDate(m.report)}`, header: `${programme}${org ? " · " + org : ""}`, footer: `Generated by the APQR Master Tracker on ${fmtDate(new Date().toISOString().slice(0, 10))} · source: Scigeniq export and APQR plan` });
    const put = (key, caption) => { const c = img[key]; if (c) d.image(c.png, c.width, c.height, { caption }); };
    const ORDER = ["summary", "progress", "finalqa", "annexes", "collection", "deptcollect", "workload", "risks", "actions", "changes"];
    const num = {};
    let secN = 0;
    for (const key of ORDER) if (want(key)) num[key] = ++secN;
    const secRef = (key) => (num[key] ? `section ${num[key]}` : "the tracker");
    let fig = 0;
    const figCap = (t) => `Figure ${++fig} — ${t}`;
    let tab = 0;
    const tabCap = (t) => d.p(`Table ${++tab} — ${t}`, { bold: true, color: "13315C", size: 18, keepNext: true, before: 120, after: 60 });

    /* ---------------- cover */
    d.p("", { after: 600 });
    d.band([
      { text: "APQR PROGRAMME REPORT", size: 20, bold: true, color: "9FD8D2", after: 160 },
      { text: programme, size: 52, bold: true, after: 60 },
      { text: "Annual Product Quality Review — status, progress and risks", size: 28, bold: true, color: "C9D8F0", after: 200 },
      { text: `Report date ${fmtDate(m.report)}  ·  Plan ${s.meta.planRef || "—"}  ·  ${fmtN(m.products.length)} planned products`, size: 20, color: "DCE5F5", after: 0 },
    ]);
    d.tiles([
      { label: "Required annexes closed", value: fmtPct(k.completion, 1), sub: `${fmtN(k.annexClosed)} of ${fmtN(k.requiredAnnexes)}`, color: "0F766E", fill: "E6F6F3" },
      { label: "Plan triggered", value: `${fmtN(k.triggered)}`, sub: `of ${fmtN(k.planned)} planned (${fmtPct(k.planTriggered)})`, color: "1D5AA6", fill: "E7F0FC" },
      { label: "Reviews complete", value: fmtN(k.productsComplete), sub: "Final QA closed", color: "0A6B0A", fill: "E3F5E3" },
      { label: "Reviews overdue", value: fmtN(k.productsOverdue), sub: "past the PQR due date", color: "A52020", fill: "FDE5E5" },
    ]);
    d.table(["Item", "Value"], [
      ["Organisation", org || "—"],
      ["Programme", programme],
      ["Report date", `${fmtDate(m.report)}${s.settings.useToday ? " (today)" : ""}`],
      ["Data source", `${s.meta.source || "—"}${s.meta.sourceDate ? ` (${fmtDate(s.meta.sourceDate)})` : ""}`],
      ["Team version", s.meta.publishedAt ? `published ${fmtDate(s.meta.publishedAt.slice(0, 10))}${s.meta.publishedBy ? ` by ${s.meta.publishedBy}` : ""}` : "not published"],
      ["Records", `${fmtN(s.plan.length)} plan rows · ${fmtN(s.tasks.length)} Scigeniq tasks · ${fmtN(k.appChanged)} records changed in the app`],
      ["Rules", `PQR overdue date = 1st day of the planned month + ${s.settings.overdueMonths} months · due soon = ${s.settings.dueSoonDays} days`],
    ], [26, 74], { first: true, zebra: false });
    d.pageBreak();
    d.toc();
    d.pageBreak();

    /* ---------------- 1 summary */
    if (want("summary")) {
      d.h1(`${num.summary}. Executive summary`);
      const msgs = [
        `**${fmtPct(k.completion, 1)}** of the ${fmtN(k.requiredAnnexes)} required departmental annexes are closed (${fmtN(k.annexClosed)}); ${fmtN(k.annexOpen)} are open and ${fmtN(k.annexNotRaised)} not yet raised, mostly in the ${fmtN(k.notTriggered)} reviews not triggered yet.`,
        `**${fmtN(k.triggered)} of ${fmtN(k.planned)}** planned reviews are triggered in Scigeniq (${fmtPct(k.planTriggered)}); **${fmtN(k.productsComplete)}** are complete (Final QA closed) and **${fmtN(k.closedOut)}** workflows are closed out.`,
        k.productsOverdue ? `**${fmtN(k.productsOverdue)} reviews are past their PQR due date** and not complete; ${fmtN(k.overdueAnnexes)} open annexes are overdue.` : "No review is past its PQR due date.",
        k.fqReady ? `**${fmtN(k.fqReady)} reviews have all ten annexes closed but the Final QA compilation has not been raised** — they can move today (${secRef("finalqa")}).` : "Every review with complete data has its Final QA compilation raised.",
        `${fmtN(k.unassignedOpen)} open annexes have no named data collection owner (assigned to a group or role) and ${fmtN(k.noReviewer)} have no named data reviewer.`,
        k.openActions ? `${fmtN(k.openActions)} QA follow-up actions are open${k.overdueActions ? `, ${fmtN(k.overdueActions)} overdue` : ""}.` : "No QA follow-up action is open.",
      ];
      msgs.forEach((t) => d.bullet(t));
      if (k.fqReady || k.productsOverdue) d.callout("Priority this month", [k.fqReady ? `Raise the Final QA compilation for the ${fmtN(k.fqReady)} data-ready reviews.` : "", k.productsOverdue ? `Recover the ${fmtN(k.productsOverdue)} overdue reviews: chase the open annexes listed in ${secRef("risks")}.` : "", k.noReviewer ? `Name the missing data reviewers (${fmtN(k.noReviewer)} open annexes).` : ""].filter(Boolean), { fill: "FFF3D6", color: "8A5A00" });
      d.h2("Key performance indicators");
      tabCap("Programme KPIs");
      d.table(["Indicator", "Value", "Definition"], [
        ["Plan coverage", `${fmtN(k.triggered)} / ${fmtN(k.planned)}`, "Planned reviews triggered in Scigeniq"],
        ["Required annexes closed", `${fmtN(k.annexClosed)} / ${fmtN(k.requiredAnnexes)} (${fmtPct(k.completion, 1)})`, "Ten annexes per planned product"],
        ["Raised annexes closed", fmtPct(k.raisedCompletion, 1), "Closed / raised (excludes not-raised)"],
        ["Open annexes", fmtN(k.annexOpen), "Raised, not closed"],
        ["Overdue annexes", { text: fmtN(k.overdueAnnexes), color: k.overdueAnnexes ? "A52020" : undefined, bold: true }, "Open past the PQR due date"],
        ["Reviews complete", fmtN(k.productsComplete), "Final QA compilation closed"],
        ["Reviews overdue", { text: fmtN(k.productsOverdue), color: k.productsOverdue ? "A52020" : undefined, bold: true }, "Not complete, past the PQR due date"],
        ["Data ready, Final QA not raised", { text: fmtN(k.fqReady), color: k.fqReady ? "A52020" : undefined, bold: true }, "Ten slots OK, Final QA never raised"],
        ["Final QA raised, open", fmtN(k.fqRaised), "Compilation in progress"],
        ["Workflows closed out", fmtN(k.closedOut), "Parent APQR closed"],
        ["Open annexes without named owner", fmtN(k.unassignedOpen), "Assigned to a group or role"],
        ["Open annexes without reviewer", fmtN(k.noReviewer), "To name in the app"],
        ["Approvals signed", `${fmtN(k.approvalsSigned)} / ${fmtN(k.approvals)}${k.rejected ? ` · ${fmtN(k.rejected)} rejected` : ""}`, "Electronic approval tasks"],
        ["Records changed in the app", fmtN(k.appChanged), "Must be mirrored in Scigeniq"],
      ], [32, 22, 46], { first: true });
      d.h2("RAG status");
      put("rag", figCap("RAG status of the planned reviews"));
      tabCap("RAG distribution");
      d.table(["Status", "Products", "Share"], RAG_ORDER.map((r) => [ragCell(r), fmtN(m.ragCounts[r] || 0), fmtPct((m.ragCounts[r] || 0) / Math.max(1, m.products.length), 1)]), [50, 25, 25], { align: ["left", "right", "right"], zebra: false });
    }

    /* ---------------- 2 progress */
    if (want("progress")) {
      d.pageBreak();
      d.h1(`${num.progress}. Programme progress by planned month`);
      d.p("Each planned review is due in the month after its review period ends. The chart shows where the parent APQR workflow of every planned review stands; the table gives the month-by-month figures.");
      put("workflow", figCap("APQR workflow progress by planned month"));
      tabCap("Progress by planned month");
      d.table(["Planned month", "Planned", "Triggered", "Annexes", "Closed", "% closed", "Final QA done", "Overdue from", "Status"], m.months.map((mo) => [fmtMonth(mo.month), fmtN(mo.planned), fmtN(mo.triggered), fmtN(mo.annexes), fmtN(mo.completed), fmtPct(mo.pct), fmtN(mo.fqComplete ?? 0), fmtDate(mo.overdueFrom), { text: mo.status, color: /overdue/i.test(mo.status) ? "A52020" : mo.status === "Complete" ? "0A6B0A" : undefined, bold: true }]), [14, 9, 9, 9, 9, 9, 11, 12, 18], { align: ["left", "right", "right", "right", "right", "right", "right", "left", "left"], size: 16 });
    }

    /* ---------------- 3 final QA */
    if (want("finalqa")) {
      d.pageBreak();
      d.h1(`${num.finalqa}. Final QA compilation`);
      put("finalqa", figCap("Final QA progress by planned month"));
      put("fqsignal", figCap("Final QA compilation signal"));
      tabCap("Final QA signal");
      d.table(["Signal", "Products", "Share"], FINAL_QA_SIGNALS.map((sg) => [fqCell(sg), fmtN(m.fqCounts[sg]), fmtPct(m.fqCounts[sg] / Math.max(1, m.products.length), 1)]), [50, 25, 25], { align: ["left", "right", "right"], zebra: false });
      const ready = m.products.filter((p) => p.fqSignal === "NOT TRIGGERED - data ready").sort((a, b) => (a.daysToOverdue ?? 0) - (b.daysToOverdue ?? 0));
      d.h2(`Data ready — Final QA not raised (${fmtN(ready.length)})`);
      if (ready.length) { tabCap("Reviews ready for the Final QA compilation"); d.table(["APQR ref", "Product", "Planned", "PQR due", "Days", "Owner"], ready.map((p) => [p.ref, p.product, fmtMonth(p.plannedMonth), fmtDate(p.overdueDate), { text: p.daysToOverdue < 0 ? `${-p.daysToOverdue} late` : `${p.daysToOverdue} left`, color: p.daysToOverdue < 0 ? "A52020" : undefined, bold: p.daysToOverdue < 0 }, p.owner]), [12, 42, 11, 11, 9, 15], { size: 16 }); }
      else d.p("None.");
    }

    /* ---------------- 4 annexes */
    if (want("annexes")) {
      d.pageBreak();
      d.h1(`${num.annexes}. Annexes and departments`);
      d.h2("The ten required annexes");
      put("slots", figCap("Slot completeness of the ten required annexes"));
      tabCap("Annexe slots");
      d.table(["Annexe", "Department", "OK (closed)", "Open", "Missing", "Not triggered", "% OK"], m.bySlot.map((x) => [x.label, x.dept, fmtN(x.ok), fmtN(x.open), { text: fmtN(x.missing), color: x.missing ? "A52020" : undefined }, fmtN(x.notTriggered), fmtPct(k.triggered ? x.ok / k.triggered : 0)]), [20, 20, 12, 10, 10, 14, 14], { align: ["left", "left", "right", "right", "right", "right", "right"], size: 16 });
      d.h2("Departments");
      put("dept", figCap("Required annexes by owning department"));
      tabCap("Departments");
      d.table(["Department", "Closed", "Open", "Not raised", "Overdue", "Total", "% closed"], m.byDept.map((x) => [x.dept, fmtN(x.closed), fmtN(x.open), fmtN(x.notRaised), { text: fmtN(x.overdue), color: x.overdue ? "A52020" : undefined, bold: !!x.overdue }, fmtN(x.total), fmtPct(x.total ? x.closed / x.total : 0)]), [26, 12, 12, 12, 12, 12, 14], { align: ["left", "right", "right", "right", "right", "right", "right"], size: 16 });
      if (img.burn) { d.h2("Burn-up"); put("burn", figCap("Cumulative annexes raised and closed")); }
      d.h2("Coverage by dosage form");
      put("forms", figCap("Planned, triggered and complete reviews by dosage form"));
      tabCap("Dosage forms");
      d.table(["Dosage form", "Planned", "Triggered", "Complete", "% complete"], m.forms.map((f) => [f.form, fmtN(f.planned), fmtN(f.triggered), fmtN(f.complete), fmtPct(f.planned ? f.complete / f.planned : 0)]), [34, 16, 16, 16, 18], { align: ["left", "right", "right", "right", "right"] });
    }

    /* ---------------- 5 collection */
    if (want("collection")) {
      d.pageBreak();
      d.h1(`${num.collection}. Data collection`);
      put("collection", figCap("Data collection progress by planned month"));
      put("owners", figCap("Workload by data collection owner"));
      put("reviewers", figCap("Workload by data reviewer"));
      const open = m.tasks.filter((t) => t.isAnnex && !t.generated && !t.closed);
      const byDept = [...new Set(open.map((t) => t.dept))].sort().map((dp) => { const ts = open.filter((t) => t.dept === dp); return [dp, fmtN(ts.length), { text: fmtN(ts.filter((t) => !t.collectorPerson).length), color: ts.some((t) => !t.collectorPerson) ? "8A5A00" : undefined }, { text: fmtN(ts.filter((t) => !t.reviewerPerson).length), color: ts.some((t) => !t.reviewerPerson) ? "8A5A00" : undefined }, fmtN(ts.filter((t) => t.overdue === "YES").length)]; });
      tabCap("Open annexes: named people by department");
      d.table(["Department", "Open annexes", "No named owner", "No reviewer", "Overdue"], byDept, [32, 17, 17, 17, 17], { align: ["left", "right", "right", "right", "right"] });
    }

    /* ---------------- data collection by department */
    if (want("deptcollect")) {
      d.pageBreak();
      d.h1(`${num.deptcollect}. Data collection by department`);
      const stageOf = m.collection.stageOf;
      const planned = m.tasks.filter((t) => t.isAnnex && m.planByKey.has(t.key));
      d.p("Required annexes of the approved plan (ten per planned product) by owning department and current data collection stage. Untriggered reviews count as “Not triggered”. Owners and reviewers are the named data collection owner and data reviewer of each raised annexe.");
      put("deptStages", figCap("Actual APQR annexes progress by department, all planned months"));
      put("deptStack", figCap("Data collection stage by department"));
      const rows = DEPARTMENTS.map((dp) => {
        const ts = planned.filter((t) => t.dept === dp);
        const c = (st) => ts.filter((t) => stageOf(t) === st).length;
        const open = ts.filter((t) => !t.generated && !t.closed);
        return { dp, nt: c("Not triggered"), col: c("Collecting Data"), rev: c("Data Review"), done: c("Completed"), total: ts.length, open: open.length, late: open.filter((t) => t.overdue === "YES").length, noOwner: open.filter((t) => !t.collectorPerson).length, noRev: open.filter((t) => !t.reviewerPerson).length };
      });
      const tot = rows.reduce((a, r) => { for (const key of ["nt", "col", "rev", "done", "total", "open", "late", "noOwner", "noRev"]) a[key] = (a[key] || 0) + r[key]; return a; }, { dp: "Total" });
      const warn = (n, c = "8A5A00") => ({ text: fmtN(n), color: n ? c : undefined, bold: !!n });
      tabCap("Data collection summary by department");
      d.table(["Department", "Not triggered", "Collecting", "In review", "Completed", "Total", "% completed", "Open", "Overdue", "No owner", "No reviewer"], [...rows, tot].map((r) => [{ text: r.dp, bold: r.dp === "Total" }, fmtN(r.nt), fmtN(r.col), fmtN(r.rev), fmtN(r.done), fmtN(r.total), { text: fmtPct(r.total ? r.done / r.total : 0, 1), bold: true }, fmtN(r.open), warn(r.late, "A52020"), warn(r.noOwner), warn(r.noRev)]), [17, 9, 8, 8, 9, 7, 9, 7, 8, 8, 10], { size: 15, align: ["left", "right", "right", "right", "right", "right", "right", "right", "right", "right", "right"] });
      // heat-map: % completed by department and planned month
      const heat = (p) => { if (p === null) return {}; const t = Math.max(0, Math.min(1, p)); const mix = (a, b) => Math.round(a + (b - a) * t).toString(16).padStart(2, "0"); return { fill: `${mix(0xee, 0x00)}${mix(0xf3, 0x83)}${mix(0xf8, 0x00)}`, color: t > 0.55 ? "FFFFFF" : "1A2233", bold: true }; };
      const mcell = (r) => { if (!r || !r.total) return { text: "–" }; const done = Object.entries(r.counts).filter(([st]) => /complet|approved|closed/i.test(st)).reduce((n, [, v]) => n + v, 0); const p = done / r.total; return { text: fmtPct(p), align: "center", ...heat(p) }; };
      tabCap("% of required annexes completed, by department and planned month");
      d.table(["Department", ...m.months.map((x) => fmtMonthShort(x.month)), "All"], [...DEPARTMENTS, "All"].map((dp) => [{ text: dp === "All" ? "All departments" : dp, bold: dp === "All" }, ...m.months.map((x) => mcell(dp === "All" ? x.matrix.total : x.matrix.rows.find((y) => y.dept === dp))), mcell(dp === "All" ? annexMatrix(planned).total : annexMatrix(planned).rows.find((y) => y.dept === dp))]), [20, ...m.months.map(() => 8), 9], { size: 15, zebra: false, align: ["left", ...m.months.map(() => "center"), "center"] });
      // owners and reviewers per department
      d.h2("Owners and reviewers by department");
      const real = planned.filter((t) => !t.generated);
      for (const dp of DEPARTMENTS) {
        const ts = real.filter((t) => t.dept === dp);
        if (!ts.length) continue;
        const tally = (keyFn, typeFn) => {
          const mp = new Map();
          for (const t of ts) {
            const key = keyFn(t) || "— not set —";
            if (!mp.has(key)) mp.set(key, { name: key, type: typeFn(t), col: 0, rev: 0, done: 0, late: 0 });
            const r = mp.get(key);
            const st = stageOf(t);
            if (st === "Completed") r.done++; else if (st === "Data Review") r.rev++; else r.col++;
            if (!t.closed && t.overdue === "YES") r.late++;
          }
          return [...mp.values()].sort((a, b) => (b.col + b.rev) - (a.col + a.rev) || b.done - a.done || a.name.localeCompare(b.name)).slice(0, 10);
        };
        const owners = tally((t) => t.collector, (t) => t.collectorType || "");
        const reviewers = tally((t) => t.reviewer, (t) => (t.reviewer ? t.reviewerType || "" : "missing"));
        const r = rows.find((x) => x.dp === dp);
        d.h3(`${dp} — ${fmtN(r.total)} required · ${fmtPct(r.total ? r.done / r.total : 0)} completed · ${fmtN(r.open)} open${r.late ? ` · ${fmtN(r.late)} overdue` : ""}`);
        const prow = (role) => (x) => [role, { text: x.type && x.type !== "user" ? `${x.name} (${x.type === "missing" ? "missing" : x.type})` : x.name, color: x.type === "missing" || (x.type && x.type !== "user") ? "8A5A00" : undefined }, fmtN(x.col), fmtN(x.rev), fmtN(x.done), { text: fmtN(x.late), color: x.late ? "A52020" : undefined, bold: !!x.late }];
        d.table(["Role", "Person / group", "Collecting", "In review", "Completed", "Overdue"], [...owners.map(prow("Owner")), ...reviewers.map(prow("Reviewer"))], [12, 40, 12, 12, 12, 12], { size: 15, align: ["left", "left", "right", "right", "right", "right"] });
      }
    }

    /* ---------------- 6 workload */
    if (want("workload")) {
      d.pageBreak();
      d.h1(`${num.workload}. Workload by person`);
      put("people", figCap("Load by person or group"));
      tabCap("Workload (people and groups with raised annexes)");
      d.table(["Person or group", "Type", "Main department", "Raised", "Closed", "Open", "Overdue", "Final QA", "% closed"], m.workload.filter((o) => o.annexes || o.finalQa).slice(0, 60).map((o) => [o.user, o.type, o.mainDept || "", fmtN(o.annexes), fmtN(o.closed), fmtN(o.open), { text: fmtN(o.overdue), color: o.overdue ? "A52020" : undefined, bold: !!o.overdue }, fmtN(o.finalQa), fmtPct(o.pct)]), [24, 9, 17, 8, 8, 8, 9, 8, 9], { align: ["left", "left", "left", "right", "right", "right", "right", "right", "right"], size: 15 });
    }

    /* ---------------- 7 risks */
    if (want("risks")) {
      d.pageBreak();
      d.h1(`${num.risks}. Overdue reviews and quality signals`);
      const overdue = m.products.filter((p) => p.rag === "OVERDUE" || p.rag === "NOT STARTED - overdue").sort((a, b) => (a.daysToOverdue ?? 0) - (b.daysToOverdue ?? 0));
      d.h2(`Reviews past their PQR due date (${fmtN(overdue.length)})`);
      if (overdue.length) { tabCap("Overdue reviews"); d.table(["APQR ref", "Product", "Planned", "Days late", "Annexes", "Final QA", "Bottleneck"], overdue.map((p) => [p.ref, p.product, fmtMonth(p.plannedMonth), { text: fmtN(-(p.daysToOverdue ?? 0)), color: "A52020", bold: true }, `${p.slotsOk}/10`, fqCell(p.fqSignal), p.bottleneck === "-" ? "" : p.bottleneck]), [11, 38, 11, 8, 8, 13, 11], { size: 15 }); }
      else d.p("None.");
      d.h2("Quality signals");
      if (m.quality.length) {
        tabCap("Quality signals");
        const L = { critical: ["FDE5E5", "A52020", "Critical"], serious: ["FDEBE2", "A8461E", "Serious"], warning: ["FFF3D6", "8A5A00", "Warning"], info: ["E3EEFB", "1D5AA6", "Info"] };
        d.table(["Level", "Signal", "Detail", "Items"], m.quality.map((q) => [{ text: L[q.level]?.[2] || q.level, fill: L[q.level]?.[0], color: L[q.level]?.[1], bold: true }, { text: q.title, bold: true }, q.detail, fmtN(q.items?.length || 0)]), [11, 26, 53, 10], { size: 16, zebra: false });
      } else d.p("No quality signal.");
    }

    /* ---------------- 8 actions */
    if (want("actions")) {
      d.pageBreak();
      d.h1(`${num.actions}. QA actions`);
      const acts = m.actions.slice().sort((a, b) => Number(a.done) - Number(b.done) || String(a.due).localeCompare(String(b.due)));
      if (acts.length) { tabCap("Follow-up actions"); d.table(["APQR ref", "Product", "Action", "Owner", "Target", "Status"], acts.map((a) => [a.ref, a.product, a.text, a.owner || "", fmtDate(a.due), a.done ? { text: `Done ${fmtDate(a.doneAt)}`, color: "0A6B0A" } : a.overdue ? { text: "Overdue", color: "A52020", bold: true } : "Open"]), [11, 30, 27, 13, 9, 10], { size: 15 }); }
      else d.p("No action recorded.");
    }

    /* ---------------- 9 changes */
    if (want("changes")) {
      d.pageBreak();
      d.h1(`${num.changes}. Changes made in the app`);
      const edits = s.audit.filter((a) => a.entity !== "data");
      d.p(`${fmtN(k.appChanged)} records carry a change made in the app (stage, assignee, data collection owner or reviewer, closure). These changes must be mirrored in Scigeniq by the person who made them. ${fmtN(edits.length)} edits are recorded in the audit trail.`);
      const byField = {};
      for (const a of edits) byField[a.field || "other"] = (byField[a.field || "other"] || 0) + 1;
      tabCap("Edits by field");
      d.table(["Field", "Edits"], Object.entries(byField).sort((a, b) => b[1] - a[1]).map(([f, n]) => [f, fmtN(n)]), [70, 30], { align: ["left", "right"] });
      if (edits.length) { tabCap("Latest 40 edits"); d.table(["When", "By", "Record", "Field", "From", "To"], edits.slice(0, 40).map((a) => [fmtDate(a.at.slice(0, 10)), a.user || "", (a.label || "").slice(0, 70), a.field || "", String(a.from ?? "").slice(0, 30), String(a.to ?? "").slice(0, 40)]), [11, 13, 34, 12, 14, 16], { size: 14 }); }
    }

    /* ---------------- appendix register */
    if (want("register")) {
      d.orientation(true);
      d.h1("Appendix A — Full APQR register", { pageBreakBefore: false });
      d.p(`${fmtN(m.products.length)} planned products, sorted by planned month. Annexes = required annexes closed out of ten.`);
      const prods = m.products.slice().sort((a, b) => String(a.plannedMonth).localeCompare(String(b.plannedMonth)) || a.product.localeCompare(b.product));
      d.table(["APQR ref", "Product", "Form", "Planned", "Workflow stage", "Annexes", "Open", "Final QA", "RAG", "PQR due", "APQR owner"], prods.map((p) => [p.ref, p.product, p.dosageForm || "", fmtMonthShort(p.plannedMonth), p.wfStage, `${p.slotsOk}/10`, fmtN(p.annexOpen), fqCell(p.fqSignal), ragCell(p.rag), fmtDate(p.overdueDate), p.owner]), [9, 30, 8, 7, 10, 6, 5, 10, 8, 8, 10], { size: 13, align: ["left", "left", "left", "left", "left", "center", "right", "left", "left", "left", "left"] });
      d.orientation(false);
    }

    /* ---------------- appendix method */
    if (want("method")) {
      d.h1(`Appendix ${want("register") ? "B" : "A"} — Method and definitions`, { pageBreakBefore: !want("register") });
      d.table(["Term", "Rule"], [
        ["Planned PQR month", "The month following the end of the review period of the product (end of month)."],
        ["PQR overdue date", `1st day of the planned month + ${s.settings.overdueMonths} months (SOPQA0021E: completed within 3 months after the end of the reporting period).`],
        ["Ten required annexes", SLOTS.map((x) => x.label).join(", ") + ". A slot is OK when one of its tasks is closed, open when raised but not closed, MISSING when never raised."],
        ["Shared QA Data Collection stream", "Annexes filed under the Scigeniq task type “QA Data Collection” are attributed to a department by their title (CM, Supplier, QC OOS/OOT, VL Process, QA)."],
        ["RAG", `COMPLETE = Final QA closed · OVERDUE = past the PQR overdue date · DUE SOON = within ${s.settings.dueSoonDays} days · ON TRACK otherwise · Not yet due / NOT STARTED – overdue for untriggered reviews.`],
        ["Final QA signal", "Complete · Raised, not complete · NOT TRIGGERED – data ready (all ten slots OK, Final QA never raised) · Waiting on data collection · Not triggered."],
        ["Untriggered workload", "A planned product without a workflow still owes its parent workflow, ten annexes and Final QA; they count as not raised."],
        ["User, role or group", "Tasks assigned to a role or group have no named person; the tracker attributes them to the owning department’s group or to the acting role."],
        ["Changed in app", "A record edited in the tracker; the change must be mirrored in Scigeniq, which stays the system of record."],
        ["Colour code", "Lifecycle: blue = collecting, magenta = in review / data complete, amber = Final QA / waiting, green = completed / closed, hatched grey = not triggered. Status (RAG) colours are reserved: green complete, blue on track, amber due soon, red overdue."],
      ], [26, 74], { first: true, size: 16 });
    }

    const blob = await d.build();
    b.set(1, "Saving");
    const name = `APQR_Programme_Report_${m.report}.docx`;
    const ok = await download(blob, name);
    if (ok) toast(`Word report created (${Math.round(blob.size / 1024)} KB).`, { kind: "success" });
  } catch (e) {
    console.error(e);
    toast(`The report couldn’t be created: ${e.message}`, { kind: "error", timeout: 9000 });
  } finally { b.done(); }
}
