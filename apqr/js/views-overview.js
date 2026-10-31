// Overview views: command centre, annexes progress, Final QA, workflow,
// workload and insights.
import { raw, esc, icon, fmtN, fmtPct, fmtDate, fmtMonth, fmtMonthShort, fmtDays, plural, ragPill, fqPill, trackingPill, tip, RAG_META, FQ_META, slotChip } from "./ui.js";
import { ring, segBar, hbars, columns, lineChart, deptColor, stageColor, progressBar, slotCells, slotHead, stackedColumns } from "./charts.js";
import { DEPARTMENTS, SLOTS, MOVEMENT_METRICS, UP_IS_BAD, FINAL_QA_SIGNALS, monthLabel, eomonth } from "./engine.js";
import * as store from "./store.js";

export const RAG_COLOR = { COMPLETE: "var(--good)", "ON TRACK": "var(--info)", "DUE SOON": "var(--warn)", OVERDUE: "var(--crit)", "NOT STARTED - overdue": "#8f1d1d", "Not yet due": "var(--slot-nt)", "No tasks": "var(--line-2)" };
export const FQ_COLOR = { Complete: "var(--good)", "Raised, not complete": "var(--info)", "NOT TRIGGERED - data ready": "var(--crit)", "Waiting on data collection": "var(--s1)", "Not triggered": "var(--slot-nt)" };
const RAG_ORDER = ["COMPLETE", "ON TRACK", "DUE SOON", "OVERDUE", "NOT STARTED - overdue", "Not yet due"];
const chartMode = {};
const toggle = (id, modes = ["chart", "table"]) => raw(`<div class="seg-toggle" role="group" aria-label="View as">${modes.map((m) => `<button type="button" data-chart-mode="${id}:${m}" class="${(chartMode[id] || modes[0]) === m ? "on" : ""}" aria-pressed="${(chartMode[id] || modes[0]) === m}">${icon(m === "table" ? "table" : "chart")}${m === "table" ? "Table" : "Chart"}</button>`).join("")}</div>`);
export function bindChartToggles(root, rerender) {
  root.addEventListener("click", (e) => {
    const b = e.target.closest("[data-chart-mode]");
    if (!b) return;
    const [id, m] = b.dataset.chartMode.split(":");
    chartMode[id] = m;
    rerender();
  });
}

function delta(key, now, base) {
  if (base === undefined || base === null) return "";
  const d = now - base;
  if (d === 0) return `<span class="delta flat">${icon("flat")}0</span>`;
  const bad = UP_IS_BAD.has(key) ? d > 0 : d < 0;
  return `<span class="delta ${bad ? "bad" : "good"}">${icon(d > 0 ? "arrowUp" : "arrowDown")}${d > 0 ? "+" : ""}${fmtN(d)}</span>`;
}

export function tableHtml(head, rows) {
  return `<div style="overflow:auto"><table class="data"><thead><tr>${head.map((h, i) => `<th class="${i ? "r" : ""}">${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c, i) => `<td class="${i ? "r num" : ""}">${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}

export function signalHtml(q) {
  const ic = { critical: "alert", serious: "alert", warning: "clock", info: "info" }[q.level];
  return `<a class="signal ${q.level}" href="#/insights" style="text-decoration:none"><span class="sic">${icon(ic)}</span><span><b>${esc(q.title)}</b><small>${esc(q.detail)}</small></span>${q.items.length ? `<span class="n">${fmtN(q.items.length)}</span>` : ""}</a>`;
}

/** The review pipeline: plan -> triggered -> data complete -> Final QA raised -> complete -> closed out. */
export function pipelineHtml(m) {
  const k = m.kpi;
  const raised = k.fqComplete + k.fqRaised;
  const steps = [
    { k: "Planned", v: k.planned, of: k.planned, href: "#/plan", c: `${fmtN(k.notTriggered)} not triggered` },
    { k: "Triggered", v: k.triggered, of: k.planned, href: "#/tracker?trig=yes", c: `<b>${fmtPct(k.planTriggered)}</b> of plan` },
    { k: "Data complete (10/10)", v: k.dataComplete, of: k.planned, href: "#/tracker?flag=DATACOMPLETE", c: `${fmtN(k.notDataComplete)} still collecting` },
    { k: "Final QA raised", v: raised, of: k.planned, href: "#/finalqa", c: k.fqReady ? `<b style="color:var(--crit-ink)">${fmtN(k.fqReady)} data-ready, not raised</b>` : "none waiting", alert: k.fqReady > 0 },
    { k: "Final QA complete", v: k.fqComplete, of: k.planned, href: "#/tracker?rag=COMPLETE", c: `${fmtN(k.fqRaised)} in compilation` },
    { k: "Workflow closed out", v: k.closedOut, of: k.planned, href: "#/workflow", c: `${fmtPct(k.planned ? k.closedOut / k.planned : 0)} of plan` },
  ];
  return `<div class="pipeline">${steps.map((s) => `<a class="pipe ${s.alert ? "alert" : ""}" href="${s.href}" style="text-decoration:none"><span class="pk">${esc(s.k)}</span><span class="pv">${fmtN(s.v)}<small>/ ${fmtN(s.of)}</small></span><span class="pbarv"><span style="width:${((s.v / Math.max(1, s.of)) * 100).toFixed(1)}%"></span></span><span class="pc">${s.c}</span></a>`).join("")}</div>`;
}

export const WF_COLOR = { "Not triggered": "var(--slot-nt)", "Collecting annexes": "var(--s1)", "Data complete": "var(--d7)", "Final QA done, not closed": "var(--warn)", Closed: "var(--good)" };
/** Parent APQR workflow progress by planned month (stacked columns). */
export function workflowMonthChart(m, height = 290, width = 760) {
  return stackedColumns(m.workflowByMonth.map((x) => ({ label: fmtMonthShort(x.month), sub: `${x.total} PQRs`, counts: x.counts, href: `#/annexes?month=${x.month}` })),
    m.WF_BUCKETS.map((b) => ({ key: b, label: b, color: WF_COLOR[b] })), { height, width, capLabel: (g, total) => `${Math.round(((g.counts.Closed || 0) / total) * 100)}% closed` });
}
/** Final QA compilation progress by planned month (stacked columns). */
export function finalQaMonthChart(m, height = 290, width = 760) {
  return stackedColumns(m.fqByMonth.map((x) => ({ label: fmtMonthShort(x.month), sub: `${x.total} PQRs`, counts: x.counts, href: `#/annexes?month=${x.month}` })),
    FINAL_QA_SIGNALS.map((sg) => ({ key: sg, label: FQ_META[sg].label, color: FQ_COLOR[sg] })), { height, width, capLabel: (g, total) => `${Math.round(((g.counts.Complete || 0) / total) * 100)}% done` });
}

/* ================================================================ dashboard */

export const dashboard = {
  id: "dashboard",
  title: "Command centre",
  sub: (m) => `${store.getState().meta.organisation || store.getState().meta.programme} · report date ${fmtDate(m.report)}`,
  render(m) {
    const s = store.getState();
    const k = m.kpi;
    const bl = s.baseline;
    const b = bl?.metrics || {};
    const reportMonth = eomonth(m.report, 0);
    const hd = (key, now) => { const v = b[key]; if (v === undefined) return ""; const d = now - v; if (!d) return `<div class="d">no change vs ${esc(bl.label)}</div>`; const bad = UP_IS_BAD.has(key) ? d > 0 : d < 0; return `<div class="d ${bad ? "down" : "up"}">${d > 0 ? "▲ +" : "▼ "}${fmtN(d)} vs ${esc(bl.label)}</div>`; };
    const ragParts = RAG_ORDER.map((r) => ({ label: RAG_META[r].label, value: m.ragCounts[r], color: RAG_COLOR[r] }));
    const tile = (label, value, { sub = "", ic = "dot", href = "", tone = "", bar = null, d = "" } = {}) => `<a class="kpi ${tone ? "tone-" + tone : ""}" href="${href}" style="text-decoration:none;color:inherit"><div class="k">${icon(ic)}${esc(label)}</div><div class="v">${value}${sub ? `<small>${sub}</small>` : ""}</div><div class="d">${d || "&nbsp;"}</div>${bar !== null ? `<div class="bar"><span style="width:${(Math.min(1, bar) * 100).toFixed(1)}%"></span></div>` : ""}</a>`;

    // burn-up: cumulative annexes raised and closed, against the required workload
    const annexes = m.tasks.filter((t) => t.isAnnex && !t.generated);
    const months = [];
    const firstCreated = annexes.map((t) => t.created).filter(Boolean).sort()[0];
    if (firstCreated) { let cur = eomonth(firstCreated, 0); while (cur <= reportMonth && months.length < 36) { months.push(cur.slice(0, 7)); cur = eomonth(cur, 1); } }
    const raised = months.map((mm) => ({ x: mm, y: annexes.filter((t) => t.created && t.created.slice(0, 7) <= mm).length }));
    const closed = months.map((mm) => ({ x: mm, y: annexes.filter((t) => t.closed && t.closedOn && t.closedOn.slice(0, 7) <= mm).length }));

    const deptRows = m.byDept.map((x) => ({ label: x.dept, attrs: `data-href="#/tasks?dept=${encodeURIComponent(x.dept)}&closure=open"`, segments: [{ key: "Closed", value: x.closed, color: deptColor(x.dept) }, { key: "Open", value: x.open, color: `color-mix(in srgb, ${deptColor(x.dept)} 35%, var(--surface-3))` }, { key: "Not raised", value: x.notRaised, color: "var(--slot-nt)" }] }));
    const slotRows = m.bySlot.map((x) => ({ label: x.label, attrs: `data-href="#/tracker?slot=${encodeURIComponent(x.key)}"`, segments: [{ key: "OK", value: x.ok, color: "var(--slot-ok)" }, { key: "Open", value: x.open, color: "var(--slot-open)" }, { key: "Missing", value: x.missing, color: "var(--slot-missing)" }] }));
    const top = m.workload.filter((o) => o.open > 0).slice(0, 8);

    return `
    <section class="hero reveal">
      <div class="grain"></div>
      <div>
        <div class="hero-eyebrow"><span class="live"></span>${s.meta.publishedAt ? "Team version" : "Live programme"} · ${esc(fmtDate(m.report))}</div>
        <h2>${esc(s.meta.programme || "APQR programme")}<br><span class="grad">${fmtPct(k.completion, 1)} of the required annexes closed</span></h2>
        <p class="lead">${fmtN(k.annexClosed)} of ${fmtN(k.requiredAnnexes)} required departmental annexes are closed across ${fmtN(k.planned)} planned reviews. ${fmtN(k.productsComplete)} reviews are complete, ${fmtN(k.fqReady)} have all ten annexes closed and are waiting for Final QA, and ${fmtN(k.productsOverdue)} are past their PQR due date.</p>
        <div class="hero-meta">${s.meta.planRef ? `<span>Plan ${esc(s.meta.planRef)}</span>` : ""}<span>10 annexes + Final QA per product</span><span>Overdue = planned month + ${m.settings.overdueMonths} mo</span>${bl ? `<span>Baseline ${esc(bl.label)}</span>` : ""}</div>
      </div>
      <div class="hero-ring">${ring(k.completion, { size: 184, stroke: 16, label: "Required annexes closed", sub: "annexes closed", color: "#5eead4" })}</div>
      <div class="hero-stats">
        <a class="hstat" href="#/plan" style="color:inherit;text-decoration:none"><div class="k">Plan triggered</div><div class="v">${fmtN(k.triggered)}<small>/ ${fmtN(k.planned)}</small></div>${hd("triggered", k.triggered) || `<div class="d">${fmtN(k.notTriggered)} not triggered yet</div>`}</a>
        <a class="hstat" href="#/tasks" style="color:inherit;text-decoration:none"><div class="k">Annexes closed</div><div class="v">${fmtN(k.annexClosed)}<small>/ ${fmtN(k.requiredAnnexes)}</small></div>${hd("annexClosed", k.annexClosed) || `<div class="d">${fmtN(k.annexOpen)} open · ${fmtN(k.annexNotRaised)} not raised</div>`}</a>
        <a class="hstat" href="#/tracker?rag=COMPLETE" style="color:inherit;text-decoration:none"><div class="k">Reviews complete</div><div class="v">${fmtN(k.productsComplete)}</div>${hd("fqComplete", k.fqComplete) || `<div class="d">Final QA closed</div>`}</a>
        <a class="hstat ${k.productsOverdue ? "alert" : ""}" href="#/tracker?rag=OVERDUE" style="color:inherit;text-decoration:none"><div class="k">Reviews overdue</div><div class="v">${fmtN(k.productsOverdue)}</div><div class="d">${fmtN(k.overdueAnnexes)} overdue annexes</div></a>
      </div>
      <div class="hero-rag">
        ${segBar(ragParts, { height: 12, title: "Planned products by RAG status" })}
        <div class="rag-legend">${RAG_ORDER.filter((r) => m.ragCounts[r]).map((r) => `<button type="button" data-href="#/tracker?rag=${encodeURIComponent(r)}"><i style="background:${RAG_COLOR[r]}"></i>${RAG_META[r].label} <b>${fmtN(m.ragCounts[r])}</b></button>`).join("")}<span style="margin-left:auto;opacity:.8">${fmtN(m.products.length)} planned products</span></div>
      </div>
    </section>

    <div class="kpis reveal" style="animation-delay:.05s">
      ${tile("Data ready, raise Final QA", fmtN(k.fqReady), { ic: "alert", href: "#/finalqa", tone: k.fqReady ? "crit" : "", d: k.fqReady ? "blocked on the APQR Owner" : "nothing waiting" })}
      ${tile("Open annexes", fmtN(k.annexOpen), { ic: "tasks", href: "#/tasks?closure=open", d: `${fmtPct(k.raisedCompletion)} of raised closed` })}
      ${tile("Not yet raised", fmtN(k.annexNotRaised), { ic: "plan", href: "#/tasks?source=generated", d: `${fmtN(k.notTriggered)} untriggered PQRs` })}
      ${tile("Overdue annexes", fmtN(k.overdueAnnexes), { ic: "clock", href: "#/tasks?overdue=1", tone: k.overdueAnnexes ? "crit" : "", d: "vs PQR due date" })}
      ${tile("No named person", fmtN(k.unassignedOpen), { ic: "workload", href: "#/collection?missing=owner", tone: k.unassignedOpen ? "warn" : "", d: "open annexes on a group or role" })}
      ${tile("Final QA gaps", fmtN(k.gaps), { ic: "insights", href: "#/finalqa", tone: k.gaps ? "warn" : "", d: "closed with an annexe missing" })}
      ${tile("Open actions", fmtN(k.openActions), { ic: "check", href: "#/actions", tone: k.overdueActions ? "crit" : "", d: k.overdueActions ? `${fmtN(k.overdueActions)} past target date` : "QA follow-ups" })}
    </div>

    <section class="card reveal" style="margin-top:18px">
      <div class="card-h"><div><h3>Review pipeline</h3><p>Every planned review moves left to right: triggered in Scigeniq, ten annexes closed, Final QA raised and closed, workflow closed out.</p></div></div>
      ${pipelineHtml(m)}
    </section>

    <div class="grid g-12" style="margin-top:18px">
      <section class="card span-6 reveal">
        <div class="card-h"><div><h3>APQR workflow progress by month</h3><p>Parent APQR of each planned PQR, by planned month</p></div><div class="tools"><a class="btn btn-sm btn-ghost" href="#/workflow">Open</a></div></div>
        ${workflowMonthChart(m, 270)}
      </section>
      <section class="card span-6 reveal">
        <div class="card-h"><div><h3>Final QA progress by month</h3><p>Final QA compilation of each planned PQR, by planned month</p></div><div class="tools"><a class="btn btn-sm btn-ghost" href="#/finalqa">Open</a></div></div>
        ${finalQaMonthChart(m, 270)}
      </section>
    </div>

    <div class="section-title"><h2>Runway</h2><p>Progress by planned PQR month: share of the required annexes closed, including PQRs not triggered yet.</p></div>
    <div class="runway reveal">
      ${m.months.map((mo) => {
        const isCur = mo.month === reportMonth;
        return `<a class="month ${isCur ? "current" : ""}" href="#/annexes?month=${mo.month}" style="text-decoration:none">
          <div class="mh"><span class="mname">${fmtMonth(mo.month)}</span>${isCur ? '<span class="mtag">this month</span>' : ""}</div>
          <div class="mpct">${fmtPct(mo.pct)}<small>annexes closed</small></div>
          ${progressBar(mo.pct, { tone: mo.status === "Complete" ? "complete" : /OVERDUE|overdue/.test(mo.status) ? "overdue" : "" })}
          <div class="mrow"><span>Triggered</span><b>${mo.triggered} / ${mo.planned}</b></div>
          <div class="mrow"><span>Final QA done</span><b>${mo.fqComplete} / ${mo.planned}</b></div>
          <div class="mrow"><span>Overdue from</span><b>${fmtDate(mo.overdueFrom)}</b></div>
          <div class="dots">${mo.products.map((p) => `<i class="${RAG_META[p.rag]?.cls || ""}" style="${!p.triggered ? `background:${RAG_COLOR[p.rag]}` : ""}" data-tip="${tip(p.product, [["Status", RAG_META[p.rag]?.label || p.rag], ["Annexes", `${p.slotsOk}/10`], ["Final QA", FQ_META[p.fqSignal]?.label || p.fqSignal]], RAG_COLOR[p.rag])}"></i>`).join("")}</div>
          ${trackingPill(mo.status)}
        </a>`;
      }).join("") || `<div class="card muted">Add products to the plan to see the runway.</div>`}
    </div>

    <div class="grid g-12" style="margin-top:18px">
      <section class="card span-6 reveal">
        <div class="card-h"><div><h3>The ten required annexes</h3><p>Slot completeness across the ${fmtN(k.triggered)} triggered reviews</p></div><div class="tools">${toggle("slots")}</div></div>
        ${chartMode.slots === "table" ? tableHtml(["Annexe", "OK", "Open", "Missing", "% OK"], m.bySlot.map((x) => [x.label, fmtN(x.ok), fmtN(x.open), fmtN(x.missing), fmtPct(k.triggered ? x.ok / k.triggered : 0)])) :
          `<div class="legend"><span><i style="background:var(--slot-ok)"></i>OK (closed)</span><span><i style="background:var(--slot-open)"></i>Raised, open</span><span><i style="background:var(--slot-missing)"></i>Never raised</span></div>${hbars(slotRows, { labelWidth: 150, valueLabel: (r) => `${fmtPct(r.segments[0].value / Math.max(1, k.triggered))}` })}`}
      </section>
      <section class="card span-6 reveal">
        <div class="card-h"><div><h3>Departments</h3><p>Required annexes by owning department</p></div><div class="tools">${toggle("dept")}</div></div>
        ${chartMode.dept === "table" ? tableHtml(["Department", "Closed", "Open", "Not raised", "Overdue", "% closed"], m.byDept.map((x) => [x.dept, fmtN(x.closed), fmtN(x.open), fmtN(x.notRaised), fmtN(x.overdue), fmtPct(x.total ? x.closed / x.total : 0)])) :
          `<div class="legend"><span><i style="background:var(--ink-2)"></i>Closed (solid)</span><span><i style="background:color-mix(in srgb, var(--ink-2) 35%, var(--surface-3))"></i>Open (tint)</span><span><i style="background:var(--slot-nt)"></i>Not raised</span></div>${hbars(deptRows, { labelWidth: 150, valueLabel: (r) => `${fmtPct(r.segments[0].value / Math.max(1, r.segments.reduce((n, x) => n + x.value, 0)))} <small>of ${fmtN(r.segments.reduce((n, x) => n + x.value, 0))}</small>` })}`}
      </section>

      <section class="card span-7 reveal">
        <div class="card-h"><div><h3>Annexe burn-up</h3><p>Cumulative annexes raised and closed in Scigeniq, against the ${fmtN(k.requiredAnnexes)} required by the plan</p></div><div class="tools">${toggle("burn")}</div></div>
        ${chartMode.burn === "table" ? tableHtml(["Month", "Raised (cum.)", "Closed (cum.)", "Open"], months.map((mm, i) => [fmtMonthShort(mm + "-01"), fmtN(raised[i].y), fmtN(closed[i].y), fmtN(raised[i].y - closed[i].y)])) :
          months.length ? lineChart(months, [{ key: "Raised", color: "var(--d1)", points: raised }, { key: "Closed", color: "var(--good)", points: closed, area: true }], { height: 250, target: k.requiredAnnexes }) : `<p class="muted">No dated tasks yet.</p>`}
      </section>
      <section class="card span-5 reveal">
        <div class="card-h"><div><h3>Final QA compilation</h3><p>Where each planned review stands on the last step</p></div><div class="tools"><a class="btn btn-sm btn-ghost" href="#/finalqa">Open</a></div></div>
        ${segBar(FINAL_QA_SIGNALS.map((sig) => ({ label: FQ_META[sig].label, value: m.fqCounts[sig], color: FQ_COLOR[sig] })), { height: 16, title: "Final QA signal" })}
        <div class="hbars" style="margin-top:16px">${FINAL_QA_SIGNALS.map((sig) => `<div class="hbar-row" style="grid-template-columns:minmax(0,1fr) 80px" data-href="#/tracker?fq=${encodeURIComponent(sig)}"><div class="hbar-label"><i style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${FQ_COLOR[sig]};margin-right:8px"></i>${esc(FQ_META[sig].label)}</div><div class="hbar-val">${fmtN(m.fqCounts[sig])} <small>${fmtPct(m.fqCounts[sig] / Math.max(1, m.products.length))}</small></div></div>`).join("")}</div>
      </section>

      <section class="card span-4 reveal">
        <div class="card-h"><div><h3>Parent workflow stage</h3><p>Lifecycle of the APQR itself, across the plan</p></div><div class="tools"><a class="btn btn-sm btn-ghost" href="#/workflow">Open</a></div></div>
        ${hbars(m.workflowStages.filter((x) => x.n).map((x) => ({ label: x.stage, attrs: `data-href="#/tracker?stage=${encodeURIComponent(x.stage)}"`, segments: [{ key: "Products", value: x.n, color: x.stage === "Closed" ? "var(--good)" : x.stage === "Not triggered" ? "var(--slot-nt)" : "var(--d1)" }] })), { labelWidth: 120, max: m.plan.length })}
      </section>
      <section class="card span-4 reveal">
        <div class="card-h"><div><h3>Coverage by dosage form</h3><p>Planned, triggered and complete reviews</p></div></div>
        <div class="legend"><span><i style="background:var(--good)"></i>Complete</span><span><i style="background:var(--d1)"></i>Triggered</span><span><i style="background:var(--slot-nt)"></i>Not triggered</span></div>
        ${hbars(m.forms.map((f) => ({ label: f.form, segments: [{ key: "Complete", value: f.complete, color: "var(--good)" }, { key: "Triggered, in progress", value: f.triggered - f.complete, color: "var(--d1)" }, { key: "Not triggered", value: f.planned - f.triggered, color: "var(--slot-nt)" }] })), { labelWidth: 100, valueLabel: (r) => `${r.segments[0].value + r.segments[1].value}<small> / ${r.segments.reduce((n, x) => n + x.value, 0)}</small>` })}
      </section>
      <section class="card span-4 reveal">
        <div class="card-h"><div><h3>Top workloads</h3><p>Open annexes per assigned user</p></div><div class="tools"><a class="btn btn-sm btn-ghost" href="#/workload">All</a></div></div>
        <div class="legend"><span><i style="background:var(--d1)"></i>Open</span><span><i style="background:var(--crit)"></i>Overdue</span></div>
        ${top.length ? hbars(top.map((o) => ({ label: o.user, attrs: `data-href="#/tasks?assignee=${encodeURIComponent(o.user)}&closure=open"`, segments: [{ key: "Open (not overdue)", value: o.open - Math.min(o.open, o.overdue), color: "var(--d1)" }, { key: "Overdue", value: Math.min(o.open, o.overdue), color: "var(--crit)" }] })), { labelWidth: 120, valueLabel: (r) => `${r.segments[0].value + r.segments[1].value}${r.segments[1].value ? ` <small style="color:var(--crit-ink)">${r.segments[1].value} late</small>` : ""}` }) : '<p class="muted">No open annexes.</p>'}
      </section>

      <section class="card span-6 reveal">
        <div class="card-h"><div><h3>Movement</h3><p>${bl ? `Since ${esc(bl.label)}` : "Compare against a previous extract"}</p></div><div class="tools"><a class="btn btn-sm btn-ghost" href="#/data">${icon("history")}Baseline</a></div></div>
        ${bl ? `<table class="mtable"><thead><tr><th>Metric</th><th>${esc(bl.label)}</th><th>Now</th><th>Change</th></tr></thead><tbody>${MOVEMENT_METRICS.map(([key, label]) => `<tr><td>${esc(label)}</td><td>${b[key] === undefined ? "–" : fmtN(b[key])}</td><td><b>${fmtN(m.movementCurrent[key])}</b></td><td>${delta(key, m.movementCurrent[key], b[key])}</td></tr>`).join("")}</tbody></table>`
          : `<p class="muted" style="margin-top:0">No baseline yet. When you import next month’s Scigeniq export, tick “save the current figures as the baseline first” (or save one on the Data page) and this card shows what moved.</p><a class="btn btn-sm" href="#/data">${icon("history")}Set a baseline</a>`}
      </section>
      <section class="card span-6 reveal">
        <div class="card-h"><div><h3>Quality signals</h3><p>Observations to verify before figures go into a management review</p></div><div class="tools"><a class="btn btn-sm btn-ghost" href="#/insights">All</a></div></div>
        <div class="signals">${m.quality.slice(0, 5).map((q) => signalHtml(q)).join("") || `<p class="muted">Nothing flagged.</p>`}</div>
      </section>
    </div>`;
  },
};

/* ================================================================ annexes */

let annexMonth = null;
export const annexes = {
  id: "annexes",
  title: "Annexes progress",
  sub: () => "Suivi APQR method: the ten required annexes by owning department and current stage, for each planned PQR month",
  params(p) { if (p.month) annexMonth = p.month; },
  render(m) {
    if (!m.months.length) return `<div class="card"><p class="muted">No planned months yet. Import the master tracker or add products to the plan.</p></div>`;
    const reportMonth = eomonth(m.report, 0);
    if (!annexMonth || (annexMonth !== "offplan" && !m.months.find((x) => x.month === annexMonth))) annexMonth = (m.months.find((x) => x.month === reportMonth) || m.months[m.months.length - 1]).month;
    const mo = annexMonth === "offplan" ? { month: "", planned: 0, triggered: m.offPlan.length, annexes: m.offPlanMatrix.total.total, pct: 0, status: "Not in plan", products: m.offPlan, matrix: m.offPlanMatrix, fqComplete: 0 } : m.months.find((x) => x.month === annexMonth);
    const mx = mo.matrix;
    const stages = mx.stages;
    const groups = [...mx.rows, mx.total].map((r) => ({ label: r.dept === "Total" ? "Total general" : r.dept, values: stages.map((st) => ({ key: st, value: r.total ? r.counts[st] / r.total : 0, count: r.counts[st], color: stageColor(st, stages) })) }));

    const heat = `<div style="overflow:auto"><table class="data"><thead><tr><th>Department</th>${m.months.map((x) => `<th class="c">${fmtMonthShort(x.month)}</th>`).join("")}</tr></thead><tbody>${[...DEPARTMENTS, "All"].map((d) => `<tr><td style="white-space:nowrap"><b>${d === "All" ? "All departments" : esc(d)}</b></td>${m.months.map((x) => {
      const r = d === "All" ? x.matrix.total : x.matrix.rows.find((y) => y.dept === d);
      const done = Object.entries(r.counts).filter(([s]) => /complet|approved|closed/i.test(s)).reduce((n, [, v]) => n + v, 0);
      const p = r.total ? done / r.total : null;
      const bg = p === null ? "transparent" : `color-mix(in srgb, var(--s-done) ${Math.round(10 + p * 80)}%, var(--surface))`;
      const fg = p !== null && p > 0.55 ? "#fff" : "var(--ink)";
      return `<td class="c" style="padding:4px"><a href="#/annexes?month=${x.month}" style="display:block;border-radius:8px;padding:7px 4px;background:${bg};color:${fg};font-weight:700;text-decoration:none;font-variant-numeric:tabular-nums;${x.month === annexMonth ? "outline:2px solid var(--accent);outline-offset:1px" : ""}" data-tip="${tip(`${d} · ${fmtMonth(x.month)}`, [["Closed", p === null ? "no annexes" : fmtPct(p, 1)], ["Required annexes", fmtN(r.total)]])}">${p === null ? "·" : Math.round(p * 100) + "%"}</a></td>`;
    }).join("")}</tr>`).join("")}</tbody></table></div>`;

    return `
    <div class="chips" style="margin-bottom:16px">${m.months.map((x) => `<a class="chipf ${x.month === annexMonth ? "on" : ""}" href="#/annexes?month=${x.month}" style="text-decoration:none">${monthLabel(x.month)}<b>${fmtPct(x.pct)}</b></a>`).join("")}${m.offPlan.length ? `<a class="chipf ${annexMonth === "offplan" ? "on" : ""}" href="#/annexes?month=offplan" style="text-decoration:none">Not in plan<b>${m.offPlan.length}</b></a>` : ""}</div>
    <div class="grid g-12">
      <section class="card span-8 reveal">
        <div class="card-h"><div><h3>Actual APQR Annexes Progress for (${mo.month ? monthLabel(mo.month) : "products not in plan"})</h3><p>% of each department’s required annexes at each current stage; untriggered PQRs count as “Not triggered”</p></div></div>
        ${mo.annexes === 0 ? `<p class="muted">No annexes for this month.</p>` : columns(groups, { height: 300, series: stages.map((st) => ({ label: st, color: stageColor(st, stages) })) }) + `<div style="margin-top:18px">${matrixTable(mx)}</div>`}
      </section>
      <section class="card span-4 reveal">
        <div class="card-h"><div><h3>${mo.month ? fmtMonth(mo.month) : "Not in plan"}</h3><p>Plan position for the month</p></div></div>
        <div class="stat-grid">
          <div class="stat"><div class="k">Products planned</div><div class="v">${fmtN(mo.planned)}</div></div>
          <div class="stat"><div class="k">Workflows triggered</div><div class="v">${fmtN(mo.triggered)}</div></div>
          <div class="stat"><div class="k">Required annexes</div><div class="v">${fmtN(mo.annexes)}</div></div>
          <div class="stat"><div class="k">Annexes closed</div><div class="v">${fmtPct(mo.pct, 1)}</div></div>
          <div class="stat"><div class="k">Final QA complete</div><div class="v">${fmtN(mo.fqComplete)}</div></div>
        </div>
        ${mo.month ? `<div style="display:flex;gap:8px;align-items:center;margin-top:14px;flex-wrap:wrap">${trackingPill(mo.status)}<span class="muted" style="font-size:12.5px">Overdue from ${fmtDate(mo.overdueFrom)}</span></div>` : ""}
        <div style="margin-top:16px;display:grid;grid-template-columns:minmax(0,1fr);gap:8px;max-height:420px;overflow:auto">
          ${mo.products.map((p) => `<button type="button" class="signal" style="padding:9px 10px;display:grid;gap:6px" data-open-product="${esc(p.key)}"><span style="display:flex;gap:8px;align-items:center;min-width:0"><b style="flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:12.5px">${esc(p.product)}</b><span class="num" style="font-weight:800;font-size:12px">${p.slotsOk}/10</span></span>${slotCells(p)}</button>`).join("")}
        </div>
      </section>
      <section class="card span-12 reveal">
        <div class="card-h"><div><h3>Completion heatmap</h3><p>Share of required annexes closed, by department and planned PQR month. Click a cell to open that month.</p></div></div>
        ${heat}
      </section>
    </div>`;
  },
};

function matrixTable(mx) {
  const st = mx.stages;
  return `<div style="overflow:auto"><table class="data"><thead><tr><th>Department</th>${st.map((s) => `<th class="r">${esc(s)}</th>`).join("")}<th class="r">Total</th>${st.map((s) => `<th class="r"># ${esc(s)}</th>`).join("")}</tr></thead><tbody>${[...mx.rows, { ...mx.total, dept: "Total general" }].map((r) => `<tr${r.dept === "Total general" ? ' style="font-weight:800"' : ""}><td style="white-space:nowrap">${esc(r.dept)}</td>${st.map((s) => `<td class="r num">${fmtPct(r.total ? r.counts[s] / r.total : 0, 1)}</td>`).join("")}<td class="r num">${fmtN(r.total)}</td>${st.map((s) => `<td class="r num">${fmtN(r.counts[s])}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}

/* ================================================================ Final QA */

export const finalqa = {
  id: "finalqa",
  title: "Final QA compilation",
  sub: () => "Once all ten annexes are closed, the APQR Owner compiles them into the Final QA Data Collection",
  render(m) {
    const k = m.kpi;
    const ready = m.products.filter((p) => p.fqSignal === "NOT TRIGGERED - data ready").sort((a, b) => (a.daysToOverdue ?? 0) - (b.daysToOverdue ?? 0));
    const raisedList = m.products.filter((p) => p.fqSignal === "Raised, not complete");
    const gaps = m.products.filter((p) => p.gap);
    const near = m.products.filter((p) => p.fqSignal === "Waiting on data collection" && p.slotsOk >= 8).sort((a, b) => b.slotsOk - a.slotsOk || (a.daysToOverdue ?? 0) - (b.daysToOverdue ?? 0));
    const row = (p, extra = "") => `<tr data-key="${esc(p.key)}"><td class="mono" style="white-space:nowrap">${esc(p.ref)}</td><td class="prod"><b title="${esc(p.product)}">${esc(p.product)}</b><small>${esc(p.dosageForm)} · ${esc(p.owner)}</small></td><td style="white-space:nowrap">${monthLabel(p.plannedMonth)}</td><td style="white-space:nowrap">${fmtDate(p.overdueDate)}<br><small class="muted">${fmtDays(p.daysToOverdue)}</small></td>${extra}<td><button class="btn btn-sm" data-add-action="${esc(p.key)}">${icon("plus")}Action</button></td></tr>`;
    return `
    <div class="kpis" style="margin-top:0">
      ${FINAL_QA_SIGNALS.map((sig) => `<a class="kpi ${sig.startsWith("NOT TRIGGERED") && m.fqCounts[sig] ? "tone-crit" : ""}" href="#/tracker?fq=${encodeURIComponent(sig)}" style="text-decoration:none;color:inherit"><div class="k"><i style="width:10px;height:10px;border-radius:3px;background:${FQ_COLOR[sig]}"></i>${esc(FQ_META[sig].label)}</div><div class="v">${fmtN(m.fqCounts[sig])}</div><div class="d">${fmtPct(m.fqCounts[sig] / Math.max(1, m.products.length))} of plan</div></a>`).join("")}
    </div>
    <div class="grid g-12" style="margin-top:18px">
      <section class="card span-12 table-card reveal">
        <div style="padding:20px 20px 0"><div class="card-h"><div><h3>Data ready, Final QA never raised · ${fmtN(ready.length)}</h3><p>Every one of the ten annexes is closed, so the compilation can be raised today. These reviews are blocked on the APQR Owner.</p></div></div></div>
        ${ready.length ? `<div class="table-wrap" style="max-height:none"><table class="data"><thead><tr><th>APQR Ref</th><th>Product</th><th>Planned</th><th>PQR due</th><th>Last annexe closed</th><th></th></tr></thead><tbody>${ready.map((p) => row(p, `<td style="white-space:nowrap">${fmtDate(p.tasks.filter((t) => t.isAnnex && t.closedOn).map((t) => t.closedOn).sort().pop())}</td>`)).join("")}</tbody></table></div>` : `<p class="muted" style="padding:0 20px 20px">No review is waiting for its Final QA.</p>`}
      </section>
      <section class="card span-6 table-card reveal">
        <div style="padding:20px 20px 0"><div class="card-h"><div><h3>Final QA raised, not complete · ${fmtN(raisedList.length)}</h3><p>Compilation in progress</p></div></div></div>
        ${raisedList.length ? `<div class="table-wrap" style="max-height:360px"><table class="data"><thead><tr><th>Ref</th><th>Product</th><th>Planned</th><th>PQR due</th><th>Raised</th><th></th></tr></thead><tbody>${raisedList.map((p) => row(p, `<td style="white-space:nowrap">${fmtDate(p.finalQaTasks[0]?.created)}</td>`)).join("")}</tbody></table></div>` : `<p class="muted" style="padding:0 20px 20px">None.</p>`}
      </section>
      <section class="card span-6 table-card reveal">
        <div style="padding:20px 20px 0"><div class="card-h"><div><h3>Final QA closed with an annexe gap · ${fmtN(gaps.length)}</h3><p>Compilation closed while a required annexe is open or was never raised</p></div></div></div>
        ${gaps.length ? `<div class="table-wrap" style="max-height:360px"><table class="data"><thead><tr><th>Ref</th><th>Product</th><th>Planned</th><th>PQR due</th><th>Gap</th><th></th></tr></thead><tbody>${gaps.map((p) => row(p, `<td>${SLOTS.filter((s) => p.slots[s.key].status !== "OK").map((s) => `<span class="tag crit">${esc(s.short)}</span>`).join(" ")}</td>`)).join("")}</tbody></table></div>` : `<p class="muted" style="padding:0 20px 20px">None.</p>`}
      </section>
      <section class="card span-12 table-card reveal">
        <div style="padding:20px 20px 0"><div class="card-h"><div><h3>Close to data-ready · ${fmtN(near.length)}</h3><p>Eight or nine of the ten annexes closed. Chasing the last ones unlocks the Final QA.</p></div></div></div>
        ${near.length ? `<div class="table-wrap" style="max-height:420px"><table class="data"><thead><tr><th>Ref</th><th>Product</th><th>Planned</th><th>PQR due</th><th>Still open</th><th></th></tr></thead><tbody>${near.map((p) => row(p, `<td>${SLOTS.filter((s) => p.slots[s.key].status !== "OK").map((s) => `<span class="tag ${p.slots[s.key].status === "MISSING" ? "crit" : "info"}">${esc(s.label)}</span>`).join(" ")}</td>`)).join("")}</tbody></table></div>` : `<p class="muted" style="padding:0 20px 20px">None.</p>`}
      </section>
      <section class="card span-12 reveal">
        <div class="card-h"><div><h3>Final QA progress by planned month</h3><p>Complete, raised, data-ready, waiting and not-triggered reviews per planned PQR month. Click a month for its annexes.</p></div></div>
        ${finalQaMonthChart(m, 300, 1100)}
      </section>
    </div>`;
  },
};

/* ================================================================ workflow */

export const workflow = {
  id: "workflow",
  title: "Workflow progress",
  sub: () => "Lifecycle stage of the parent APQR workflow, across the plan and by planned PQR month",
  render(m) {
    const k = m.kpi;
    const stages = m.workflowStages;
    const stalled = m.products.filter((p) => p.triggered && p.wfStage !== "Closed" && p.daysToOverdue !== null && p.daysToOverdue < 0).sort((a, b) => a.daysToOverdue - b.daysToOverdue);
    return `
    <div class="kpis" style="margin-top:0">
      <a class="kpi" href="#/tracker?stage=Not%20triggered" style="text-decoration:none;color:inherit"><div class="k">${icon("plan")}Never triggered</div><div class="v">${fmtN(k.notTriggered)}</div><div class="d">${fmtN(k.notStartedOverdue)} already overdue</div></a>
      <a class="kpi" href="#/tracker?trig=yes" style="text-decoration:none;color:inherit"><div class="k">${icon("tasks")}In progress</div><div class="v">${fmtN(k.inDataCollection)}</div><div class="d">${fmtN(k.notDataComplete)} not yet data-complete</div></a>
      <a class="kpi" href="#/tracker?stage=Closed" style="text-decoration:none;color:inherit"><div class="k">${icon("check")}Closed out</div><div class="v">${fmtN(k.closedOut)}</div><div class="d">${fmtPct(k.planned ? k.closedOut / k.planned : 0)} of plan</div></a>
      <a class="kpi ${stalled.length ? "tone-crit" : ""}" href="#/tracker?rag=OVERDUE" style="text-decoration:none;color:inherit"><div class="k">${icon("alert")}Open past PQR due</div><div class="v">${fmtN(stalled.length)}</div><div class="d">triggered, not closed</div></a>
    </div>
    <div class="grid g-12" style="margin-top:18px">
      <section class="card span-12 reveal">
        <div class="card-h"><div><h3>Review pipeline</h3></div></div>
        ${pipelineHtml(m)}
      </section>
      <section class="card span-12 reveal">
        <div class="card-h"><div><h3>APQR workflow progress by planned month</h3><p>Where each parent APQR stands: not triggered, collecting the ten annexes, data complete, Final QA done but the workflow not closed, or closed out. Click a month for its annexes.</p></div></div>
        ${workflowMonthChart(m, 300, 1100)}
      </section>
      <section class="card span-5 reveal">
        <div class="card-h"><div><h3>Workflow stage across the plan</h3><p>${fmtN(m.plan.length)} planned products</p></div></div>
        ${segBar(stages.filter((x) => x.n).map((x) => ({ label: x.stage, value: x.n, color: x.stage === "Closed" ? "var(--good)" : x.stage === "Not triggered" ? "var(--slot-nt)" : "var(--d1)" })), { height: 16, title: "Workflow stage" })}
        <div style="margin-top:14px">${tableHtml(["Workflow stage", "Products", "% of plan"], stages.map((x) => [x.stage, fmtN(x.n), fmtPct(m.plan.length ? x.n / m.plan.length : 0, 1)]))}</div>
      </section>
      <section class="card span-7 reveal">
        <div class="card-h"><div><h3>Workflow stage by planned PQR month</h3></div></div>
        ${tableHtml(["Planned month", "Planned", "Triggered", "Not triggered", "In progress", "Closed", "% closed"], m.months.map((mo) => [fmtMonth(mo.month), fmtN(mo.planned), fmtN(mo.triggered), fmtN(mo.planned - mo.triggered), fmtN(mo.inDataCollection), fmtN(mo.closedOut), fmtPct(mo.planned ? mo.closedOut / mo.planned : 0)]))}
      </section>
      <section class="card span-12 table-card reveal">
        <div style="padding:20px 20px 0"><div class="card-h"><div><h3>Open workflows past their PQR due date · ${fmtN(stalled.length)}</h3><p>Triggered, not closed, and the PQR overdue date has passed</p></div></div></div>
        ${stalled.length ? `<div class="table-wrap" style="max-height:480px"><table class="data"><thead><tr><th>Ref</th><th>Product</th><th>Stage</th><th>Annexes</th><th>Final QA</th><th>PQR due</th></tr></thead><tbody>${stalled.map((p) => `<tr data-key="${esc(p.key)}"><td class="mono">${esc(p.ref)}</td><td class="prod"><b>${esc(p.product)}</b><small>${esc(p.owner)}</small></td><td>${esc(p.wfStage)}</td><td>${slotCells(p)}</td><td>${fqPill(p.fqSignal)}</td><td style="white-space:nowrap">${fmtDate(p.overdueDate)}<br><small class="muted">${fmtDays(p.daysToOverdue)}</small></td></tr>`).join("")}</tbody></table></div>` : `<p class="muted" style="padding:0 20px 20px">None.</p>`}
      </section>
    </div>`;
  },
};

/* ================================================================ workload */

let wlSort = { key: "open", dir: -1 };
export const workload = {
  id: "workload",
  title: "Owner workload",
  sub: () => "Departmental annexes per assigned user, Final QA compilations owned and approval signatures",
  render(m) {
    const rows = [...m.workload].sort((a, b) => (a[wlSort.key] > b[wlSort.key] ? 1 : a[wlSort.key] < b[wlSort.key] ? -1 : 0) * wlSort.dir || a.user.localeCompare(b.user));
    const people = m.workload.filter((o) => o.user !== "Unassigned");
    const withOverdue = people.filter((o) => o.overdue > 0).length;
    const un = m.workload.find((o) => o.user === "Unassigned");
    const top = rows.filter((o) => o.annexes - o.notRaised > 0).slice(0, 14);
    const th = (key, label, cls = "") => `<th data-wl-sort="${key}" data-sort class="${cls} ${wlSort.key === key ? "sorted" + (wlSort.dir > 0 ? " asc" : "") : ""}">${label}</th>`;
    return `
    <div class="kpis" style="margin-top:0">
      <div class="kpi"><div class="k">${icon("workload")}People with annexes</div><div class="v">${fmtN(people.filter((o) => o.annexes).length)}</div><div class="d">&nbsp;</div></div>
      <div class="kpi ${withOverdue ? "tone-crit" : ""}"><div class="k">${icon("alert")}With overdue items</div><div class="v">${fmtN(withOverdue)}</div><div class="d">&nbsp;</div></div>
      <a class="kpi ${m.kpi.unassignedOpen ? "tone-warn" : ""}" href="#/collection?missing=owner" style="text-decoration:none;color:inherit"><div class="k">${icon("info")}Open, group or role only</div><div class="v">${fmtN(m.kpi.unassignedOpen)}</div><div class="d">no named person yet</div></a>
      <div class="kpi"><div class="k">${icon("check")}Final QA owned</div><div class="v">${fmtN(m.workload.reduce((n, o) => n + (o.user === "Unassigned" ? 0 : o.finalQa), 0))}</div><div class="d">compilations with a named owner</div></div>
      <div class="kpi"><div class="k">${icon("edit")}Approvals signed</div><div class="v">${fmtN(m.kpi.approvalsSigned)}</div><div class="d">${fmtN(m.kpi.rejected)} rejected</div></div>
    </div>
    <div class="grid g-12" style="margin-top:18px">
      <section class="card span-5 reveal">
        <div class="card-h"><div><h3>Load by person</h3><p>Raised annexes: closed, open and overdue</p></div></div>
        <div class="legend"><span><i style="background:var(--s-done)"></i>Closed</span><span><i style="background:var(--s1)"></i>Open</span><span><i style="background:var(--crit)"></i>Overdue</span></div>
        ${hbars(top.map((o) => { const lateOpen = Math.min(o.open, o.overdue); return { label: o.user, sub: o.mainDept, attrs: `data-href="#/tasks?assignee=${encodeURIComponent(o.user)}"`, segments: [{ key: "Closed", value: o.closed, color: "var(--s-done)" }, { key: "Open", value: o.open - lateOpen, color: "var(--s1)" }, { key: "Overdue", value: lateOpen, color: "var(--crit)" }] }; }), { labelWidth: 130 })}
      </section>
      <section class="card span-7 table-card reveal">
        <div class="table-wrap" style="max-height:680px"><table class="data"><thead><tr>${th("user", "User")}${th("mainDept", "Main dept")}${th("annexes", "Annexes", "r")}${th("closed", "Closed", "r")}${th("open", "Open", "r")}${th("notRaised", "Not raised", "r")}${th("overdue", "Late", "r")}${th("pct", "% closed")}${th("finalQa", "Final QA", "r")}${th("approvals", "Approvals", "r")}${th("earliestDue", "Earliest due")}</tr></thead>
        <tbody>${rows.map((o) => `<tr data-href="#/tasks?assignee=${encodeURIComponent(o.user)}" style="cursor:pointer"><td style="white-space:nowrap"><b>${esc(o.user)}</b>${o.type && o.type !== "user" ? ` <span class="tag warn">${esc(o.type.toUpperCase())}</span>` : ""}</td><td style="white-space:nowrap">${o.mainDept ? `<span style="display:inline-flex;align-items:center;gap:6px"><i style="width:8px;height:8px;border-radius:50%;background:${deptColor(o.mainDept)}"></i>${esc(o.mainDept)}</span>` : "–"}</td><td class="r num">${fmtN(o.annexes)}</td><td class="r num">${fmtN(o.closed)}</td><td class="r num">${fmtN(o.open)}</td><td class="r num muted">${fmtN(o.notRaised)}</td><td class="r num" style="${o.overdue ? "color:var(--crit-ink);font-weight:800" : ""}">${fmtN(o.overdue)}</td><td><div class="pct-cell" style="min-width:120px"><b>${o.annexes ? fmtPct(o.pct) : "–"}</b>${progressBar(o.pct, { tone: o.pct === 1 ? "complete" : "" })}</div></td><td class="r num">${o.finalQa ? `${fmtN(o.finalQaDone)}/${fmtN(o.finalQa)}` : "–"}</td><td class="r num">${fmtN(o.approvals)}</td><td style="white-space:nowrap">${fmtDate(o.earliestDue)}</td></tr>`).join("")}</tbody></table></div>
      </section>
    </div>`;
  },
  bind(root, rerender) {
    root.querySelectorAll("[data-wl-sort]").forEach((th) => th.addEventListener("click", () => {
      const k = th.dataset.wlSort;
      wlSort = { key: k, dir: wlSort.key === k ? -wlSort.dir : k === "user" || k === "mainDept" || k === "earliestDue" ? 1 : -1 };
      rerender();
    }));
  },
};

/* ================================================================ insights */

export const insights = {
  id: "insights",
  title: "Insights & data quality",
  sub: () => "Observations to verify before figures go into a management review",
  render(m) {
    const s = store.getState();
    const levelName = { critical: "Critical", serious: "Serious", warning: "Warning", info: "Info" };
    return `
    <div class="grid g-12">
      ${m.quality.map((q) => `<section class="card span-6 reveal">
        <div class="card-h"><span class="signal ${q.level}" style="padding:0;border:0;background:none;width:auto;cursor:default"><span class="sic">${icon({ critical: "alert", serious: "alert", warning: "clock", info: "info" }[q.level])}</span></span><div><h3>${esc(q.title)}</h3><p>${levelName[q.level]} · ${esc(q.detail)}</p></div>${q.items.length ? `<div class="tools"><span class="tag ${q.level === "info" ? "info" : q.level === "warning" ? "warn" : "crit"}">${fmtN(q.items.length)}</span></div>` : ""}</div>
        ${q.items.length ? `<div style="display:grid;grid-template-columns:minmax(0,1fr);gap:6px;max-height:260px;overflow:auto">${q.items.map((it) => `<button type="button" class="signal" style="padding:8px 10px" ${it.key && m.productByKey.has(it.key) ? `data-open-product="${esc(it.key)}"` : it.month ? `data-href="#/annexes?month=${it.month}"` : `data-href="#/plan?q=${encodeURIComponent(it.label)}"`}><span style="min-width:0;flex:1"><b style="font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(it.label)}</b><small>${esc(it.note || "")}</small></span></button>`).join("")}</div>` : ""}
      </section>`).join("") || `<section class="card span-12"><p class="muted">No data-quality observations.</p></section>`}
      <section class="card span-12 reveal">
        <div class="card-h"><div><h3>Excluded rows</h3><p>Rows in a Scigeniq export that are not APQR tasks (change controls, deviations…) or could not be linked to a product. Kept for traceability and excluded from every metric.</p></div><div class="tools"><span class="tag">${fmtN(s.excluded.length)}</span></div></div>
        ${s.excluded.length ? `<div class="table-wrap" style="max-height:420px"><table class="data"><thead><tr><th>Reference</th><th>Type</th><th>Stage</th><th>Title</th><th>Parent action</th><th>Reason</th></tr></thead><tbody>${s.excluded.map((x) => `<tr><td class="mono">${esc(x.ref)}</td><td>${esc(x.type)}</td><td>${esc(x.stage)}</td><td>${esc(x.title)}</td><td>${esc(x.parent)}</td><td><span class="tag">${esc(x.reason)}</span></td></tr>`).join("")}</tbody></table></div>` : '<p class="muted">No rows excluded.</p>'}
      </section>
    </div>`;
  },
};
