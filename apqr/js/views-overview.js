// Overview views: command centre (dashboard), annexes progress, workload, insights.
import { html, raw, esc, icon, fmtN, fmtPct, fmtDate, fmtMonth, fmtMonthShort, fmtDays, plural, ragPill, trackingPill, tip, RAG_META } from "./ui.js";
import { ring, segBar, hbars, columns, lineChart, deptColor, stageColor, progressBar } from "./charts.js";
import { DEPARTMENTS, MOVEMENT_METRICS, UP_IS_BAD, monthLabel, eomonth } from "./engine.js";
import * as store from "./store.js";

const RAG_COLOR = { COMPLETE: "var(--good)", "ON TRACK": "var(--info)", "DUE SOON": "var(--warn)", OVERDUE: "var(--crit)", "No tasks": "var(--line-2)" };
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
  if (d === 0) return raw(`<span class="delta flat">${icon("flat")}0</span>`);
  const bad = UP_IS_BAD.has(key) ? d > 0 : d < 0;
  return raw(`<span class="delta ${bad ? "bad" : "good"}">${icon(d > 0 ? "arrowUp" : "arrowDown")}${d > 0 ? "+" : ""}${fmtN(d)}</span>`);
}

/* ================================================================ dashboard */

export const dashboard = {
  id: "dashboard",
  title: "Command centre",
  sub: (m) => `${store.getState().meta.organisation || store.getState().meta.programme} · data as at ${fmtDate(m.report)}`,
  render(m) {
    const s = store.getState();
    const k = m.kpi;
    const bl = s.baseline;
    const b = bl?.metrics || {};
    const reportMonth = eomonth(m.report, 0);
    const hd = (key, now) => { const v = b[key]; if (v === undefined) return ""; const d = now - v; if (!d) return `<div class="d">no change vs ${esc(bl.label)}</div>`; const bad = UP_IS_BAD.has(key) ? d > 0 : d < 0; return `<div class="d ${bad ? "down" : "up"}">${d > 0 ? "▲ +" : "▼ "}${fmtN(d)} vs ${esc(bl.label)}</div>`; };
    const ragParts = ["COMPLETE", "ON TRACK", "DUE SOON", "OVERDUE"].map((r) => ({ label: RAG_META[r].label, value: m.ragCounts[r], color: RAG_COLOR[r] }));
    const tile = (label, value, { sub = "", ic = "dot", href = "", tone = "", bar = null, d = "" } = {}) => {
      const tag = href ? "a" : "div";
      return `<${tag} class="kpi ${tone ? "tone-" + tone : ""}" ${href ? `href="${href}" style="text-decoration:none;color:inherit"` : ""}><div class="k">${icon(ic)}${esc(label)}</div><div class="v">${value}${sub ? `<small>${sub}</small>` : ""}</div>${d ? `<div class="d">${d}</div>` : '<div class="d">&nbsp;</div>'}${bar !== null ? `<div class="bar"><span style="width:${(Math.min(1, bar) * 100).toFixed(1)}%"></span></div>` : ""}</${tag}>`;
    };

    // burn-up: cumulative annexes raised vs closed by month
    const data = m.tasks.filter((t) => t.isData);
    const months = [];
    const firstCreated = data.map((t) => t.created).filter(Boolean).sort()[0];
    if (firstCreated) {
      let cur = eomonth(firstCreated, 0);
      while (cur <= reportMonth && months.length < 36) { months.push(cur.slice(0, 7)); cur = eomonth(cur, 1); }
    }
    const raised = months.map((mm) => ({ x: mm, y: data.filter((t) => t.created && t.created.slice(0, 7) <= mm).length }));
    const closed = months.map((mm) => ({ x: mm, y: data.filter((t) => t.closed && t.closedOn && t.closedOn.slice(0, 7) <= mm).length }));

    const deptRows = m.byDept.map((x) => ({ label: x.dept, attrs: `data-href="#/tasks?dept=${encodeURIComponent(x.dept)}&closure=open"`, segments: [{ key: "Completed", value: x.completed, color: deptColor(x.dept) }, { key: "Open", value: x.open, color: `color-mix(in srgb, ${deptColor(x.dept)} 28%, var(--surface-3))` }] }));
    const stageTotal = m.stages.reduce((n, x) => n + x.n, 0);
    const stageNames = m.stages.map((x) => x.stage);
    const top = m.workload.filter((o) => o.open > 0).slice(0, 8);

    return `
    <section class="hero reveal">
      <div class="grain"></div>
      <div>
        <div class="hero-eyebrow"><span class="live"></span>Live programme · ${esc(fmtDate(m.report))}</div>
        <h2>${esc(s.meta.programme || "APQR programme")}<br><span class="grad">${fmtPct(k.completion, 1)} of annexes collected</span></h2>
        <p class="lead">${fmtN(k.triggered)} of ${fmtN(k.planned)} planned products have a live Scigeniq workflow. ${fmtN(k.completed)} of ${fmtN(k.dataTasks)} data-collection annexes are closed, ${fmtN(k.overdueTasks)} are past their PQR due date.</p>
        <div class="hero-meta">${s.meta.planRef ? `<span>Plan ${esc(s.meta.planRef)}</span>` : ""}<span>Overdue = planned month + ${m.settings.overdueMonths} mo</span><span>Due soon ≤ ${m.settings.dueSoonDays} d</span>${bl ? `<span>Baseline ${esc(bl.label)}</span>` : ""}</div>
      </div>
      <div class="hero-ring">${ring(k.completion, { size: 184, stroke: 16, label: "Annexes complete", sub: "annexes complete", color: "#5eead4" })}</div>
      <div class="hero-stats">
        <a class="hstat" href="#/plan" style="color:inherit;text-decoration:none"><div class="k">Plan triggered</div><div class="v">${fmtN(k.triggered)}<small>/ ${fmtN(k.planned)}</small></div>${hd("triggered", k.triggered) || `<div class="d">${fmtPct(k.planTriggered)} of plan</div>`}</a>
        <a class="hstat" href="#/tasks?closure=closed" style="color:inherit;text-decoration:none"><div class="k">Annexes closed</div><div class="v">${fmtN(k.completed)}<small>/ ${fmtN(k.dataTasks)}</small></div>${hd("completed", k.completed) || `<div class="d">${fmtN(k.open)} open</div>`}</a>
        <a class="hstat ${k.overdueTasks ? "alert" : ""}" href="#/tasks?overdue=1" style="color:inherit;text-decoration:none"><div class="k">Overdue annexes</div><div class="v">${fmtN(k.overdueTasks)}</div>${hd("overdueTasks", k.overdueTasks) || `<div class="d">vs PQR due date</div>`}</a>
        <a class="hstat ${k.productsOverdue ? "alert" : ""}" href="#/tracker?rag=OVERDUE" style="color:inherit;text-decoration:none"><div class="k">Products overdue</div><div class="v">${fmtN(k.productsOverdue)}</div><div class="d">${fmtN(k.closedOut)} workflows closed out</div></a>
      </div>
      <div class="hero-rag">
        ${segBar(ragParts, { height: 12, title: "Products by RAG status" })}
        <div class="rag-legend">${["COMPLETE", "ON TRACK", "DUE SOON", "OVERDUE"].map((r) => `<button type="button" data-href="#/tracker?rag=${encodeURIComponent(r)}"><i style="background:${RAG_COLOR[r]}"></i>${RAG_META[r].label} <b>${fmtN(m.ragCounts[r])}</b></button>`).join("")}<span style="margin-left:auto;opacity:.8">${fmtN(m.products.length)} products under review</span></div>
      </div>
    </section>

    <div class="kpis reveal" style="animation-delay:.05s">
      ${tile("Plan coverage", fmtPct(k.planTriggered), { ic: "plan", href: "#/plan", bar: k.planTriggered, d: `${fmtN(k.notTriggered)} not yet triggered` })}
      ${tile("Open annexes", fmtN(k.open), { ic: "tasks", href: "#/tasks?closure=open", d: b.completed !== undefined ? `${fmtN(k.completed - b.completed)} closed since ${esc(bl.label)}` : `${fmtN(k.dataTasks)} raised in total` })}
      ${tile("Unassigned open", fmtN(k.unassignedOpen), { ic: "workload", href: "#/tasks?assignee=Unassigned&closure=open", tone: k.unassignedOpen ? "warn" : "", d: `${fmtPct(k.open ? k.unassignedOpen / k.open : 0)} of open annexes` })}
      ${tile("Products at 100%", fmtN(k.at100), { ic: "check", href: "#/tracker?rag=COMPLETE", bar: m.products.length ? k.at100 / m.products.length : 0, d: `${fmtN(k.closedOut)} workflows closed out` })}
      ${tile("Approvals signed", fmtN(k.approvalsSigned), { ic: "edit", href: "#/tasks?cls=Approval", d: k.rejected ? `${fmtN(k.rejected)} rejected` : "none rejected" })}
      ${tile("Not triggered · due", fmtN(k.notTriggeredPastDue + k.notTriggeredDueSoon), { ic: "clock", href: "#/plan?tracking=NOT", tone: k.notTriggeredPastDue ? "crit" : k.notTriggeredDueSoon ? "warn" : "", d: `${fmtN(k.notTriggeredPastDue)} past due · ${fmtN(k.notTriggeredDueSoon)} within ${m.settings.triggerWindowDays} d` })}
      ${tile("Duplicate workflows", fmtN(k.duplicates), { ic: "alert", href: "#/tracker?flag=DUPLICATE", tone: k.duplicates ? "warn" : "", d: k.closedWithOpen ? `${fmtN(k.closedWithOpen)} closed with open annexes` : "no closed-with-open" })}
    </div>

    <div class="section-title"><h2>Runway</h2><p>Progress by planned PQR month: the month after each product’s review period closes.</p></div>
    <div class="runway reveal" style="animation-delay:.1s">
      ${m.months.map((mo) => {
        const isCur = mo.month === reportMonth;
        return `<a class="month ${isCur ? "current" : ""}" href="#/annexes?month=${mo.month}" style="text-decoration:none">
          <div class="mh"><span class="mname">${fmtMonth(mo.month)}</span>${isCur ? '<span class="mtag">this month</span>' : ""}</div>
          <div class="mpct">${mo.annexes ? fmtPct(mo.pct) : "—"}<small>${mo.annexes ? "annexes done" : "no annexes"}</small></div>
          ${progressBar(mo.pct, { tone: mo.status === "Complete" ? "complete" : /OVERDUE|overdue/.test(mo.status) ? "overdue" : "" })}
          <div class="mrow"><span>Triggered</span><b>${mo.triggered} / ${mo.planned}</b></div>
          <div class="mrow"><span>Overdue from</span><b>${fmtDate(mo.overdueFrom)}</b></div>
          <div class="dots">${mo.products.map((p) => `<i class="${p.triggered ? RAG_META[p.rag]?.cls || "" : ""}" data-tip="${tip(p.product, [["Status", p.triggered ? RAG_META[p.rag]?.label || p.rag : "Not triggered"], ["Complete", fmtPct(p.pct)]], p.triggered ? RAG_COLOR[p.rag] : "var(--line-2)")}"></i>`).join("")}</div>
          ${trackingPill(mo.status)}
        </a>`;
      }).join("") || `<div class="card muted">Add products to the plan to see the runway.</div>`}
    </div>

    <div class="grid g-12" style="margin-top:18px">
      <section class="card span-7 reveal">
        <div class="card-h"><div><h3>Annex burn-up</h3><p>Cumulative data-collection annexes raised and closed, by month</p></div><div class="tools">${toggle("burn")}</div></div>
        ${chartMode.burn === "table" ? tableHtml(["Month", "Raised (cum.)", "Closed (cum.)", "Open"], months.map((mm, i) => [fmtMonthShort(mm + "-01"), fmtN(raised[i].y), fmtN(closed[i].y), fmtN(raised[i].y - closed[i].y)])) :
          months.length ? lineChart(months, [{ key: "Raised", color: "var(--d1)", points: raised }, { key: "Closed", color: "var(--good)", points: closed, area: true }], { height: 250 }) : `<p class="muted">No dated tasks yet.</p>`}
      </section>
      <section class="card span-5 reveal">
        <div class="card-h"><div><h3>Departments</h3><p>Data-collection annexes completed vs open</p></div><div class="tools">${toggle("dept")}</div></div>
        ${chartMode.dept === "table" ? tableHtml(["Department", "Completed", "Open", "Overdue", "% done"], m.byDept.map((x) => [x.dept, fmtN(x.completed), fmtN(x.open), fmtN(x.overdue), fmtPct(x.total ? x.completed / x.total : 0)])) :
          `<div class="legend"><span><i style="background:var(--ink-2)"></i>Completed (solid)</span><span><i style="background:color-mix(in srgb, var(--ink-2) 28%, var(--surface-3))"></i>Open (tint)</span></div>${hbars(deptRows, { labelWidth: 92, valueLabel: (r) => `${fmtPct(r.segments[0].value / Math.max(1, r.segments[0].value + r.segments[1].value))} <small>of ${fmtN(r.segments[0].value + r.segments[1].value)}</small>` })}`}
      </section>

      <section class="card span-4 reveal">
        <div class="card-h"><div><h3>Workflow stage</h3><p>Where open annexes sit right now</p></div></div>
        ${segBar(m.stages.map((x) => ({ label: x.stage, value: x.n, color: stageColor(x.stage, stageNames) })), { height: 16, title: "Annexes by stage" })}
        <div class="hbars" style="margin-top:16px">${m.stages.map((x) => `<div class="hbar-row" style="--lw:130px;grid-template-columns:130px 1fr 70px" data-href="#/tasks?stage=${encodeURIComponent(x.stage)}"><div class="hbar-label"><i style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${stageColor(x.stage, stageNames)};margin-right:8px"></i>${esc(x.stage)}</div><div></div><div class="hbar-val">${fmtN(x.n)} <small>${fmtPct(x.n / Math.max(1, stageTotal))}</small></div></div>`).join("")}</div>
      </section>
      <section class="card span-4 reveal">
        <div class="card-h"><div><h3>Plan coverage by dosage form</h3><p>Planned products with a live workflow</p></div></div>
        <div class="legend"><span><i style="background:var(--d1)"></i>Triggered</span><span><i style="background:color-mix(in srgb, var(--d1) 22%, var(--surface-3))"></i>Not yet triggered</span></div>
        ${hbars(m.forms.map((f) => ({ label: f.form, segments: [{ key: "Triggered", value: f.triggered, color: "var(--d1)" }, { key: "Not triggered", value: f.planned - f.triggered, color: "color-mix(in srgb, var(--d1) 22%, var(--surface-3))" }] })), { labelWidth: 100, valueLabel: (r) => `${r.segments[0].value}<small> / ${r.segments[0].value + r.segments[1].value}</small>` })}
      </section>
      <section class="card span-4 reveal">
        <div class="card-h"><div><h3>Top workloads</h3><p>Open annexes per assigned user</p></div><div class="tools"><a class="btn btn-sm btn-ghost" href="#/workload">All</a></div></div>
        <div class="legend"><span><i style="background:var(--d1)"></i>Open</span><span><i style="background:var(--crit)"></i>Overdue</span></div>
        ${top.length ? hbars(top.map((o) => ({ label: o.user, attrs: `data-href="#/tasks?assignee=${encodeURIComponent(o.user)}&closure=open"`, segments: [{ key: "Open (not overdue)", value: o.open - o.overdue, color: "var(--d1)" }, { key: "Overdue", value: o.overdue, color: "var(--crit)" }] })), { labelWidth: 120, valueLabel: (r) => `${r.segments[0].value + r.segments[1].value}${r.segments[1].value ? ` <small style="color:var(--crit-ink)">${r.segments[1].value} late</small>` : ""}` }) : '<p class="muted">No open annexes.</p>'}
      </section>

      <section class="card span-6 reveal">
        <div class="card-h"><div><h3>Movement</h3><p>${bl ? `Since ${esc(bl.label)}` : "Compare against a previous extract"}</p></div><div class="tools"><a class="btn btn-sm btn-ghost" href="#/data">${icon("history")}Baseline</a></div></div>
        ${bl ? `<table class="mtable"><thead><tr><th>Metric</th><th>${esc(bl.label)}</th><th>Now</th><th>Change</th></tr></thead><tbody>${MOVEMENT_METRICS.map(([key, label]) => `<tr><td>${esc(label)}</td><td>${b[key] === undefined ? "–" : fmtN(b[key])}</td><td><b>${fmtN(m.movementCurrent[key])}</b></td><td>${delta(key, m.movementCurrent[key], b[key])}</td></tr>`).join("")}</tbody></table>`
          : `<p class="muted" style="margin-top:0">No baseline yet. On the Data page, save today’s figures as a baseline (or let the next Scigeniq import do it), and this card will show what moved between extracts.</p><a class="btn btn-sm" href="#/data">${icon("history")}Set a baseline</a>`}
      </section>
      <section class="card span-6 reveal">
        <div class="card-h"><div><h3>Quality signals</h3><p>Data-quality and compliance observations to verify</p></div><div class="tools"><a class="btn btn-sm btn-ghost" href="#/insights">All</a></div></div>
        <div class="signals">${m.quality.slice(0, 5).map((q, i) => signalHtml(q, i)).join("") || `<p class="muted">Nothing flagged. ${icon("check")}</p>`}</div>
      </section>
    </div>`;
  },
};

export function signalHtml(q, i) {
  const ic = { critical: "alert", serious: "alert", warning: "clock", info: "info" }[q.level];
  return `<a class="signal ${q.level}" href="#/insights" data-signal="${i}" style="text-decoration:none"><span class="sic">${icon(ic)}</span><span><b>${esc(q.title)}</b><small>${esc(q.detail)}</small></span>${q.items.length ? `<span class="n">${fmtN(q.items.length)}</span>` : ""}</a>`;
}

export function tableHtml(head, rows) {
  return `<div style="overflow:auto"><table class="data"><thead><tr>${head.map((h, i) => `<th class="${i ? "r" : ""}">${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c, i) => `<td class="${i ? "r num" : ""}">${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}

/* ================================================================ annexes */

let annexMonth = null;
export const annexes = {
  id: "annexes",
  title: "Annexes progress",
  sub: () => "Department × current stage, as a share of each department’s annexes, by planned PQR month",
  params(p) { if (p.month) annexMonth = p.month; },
  render(m) {
    if (!m.months.length && !m.offPlan.length) return `<div class="card"><p class="muted">No planned months yet. Import the master tracker or add products to the plan.</p></div>`;
    const reportMonth = eomonth(m.report, 0);
    if (!annexMonth || (annexMonth !== "offplan" && !m.months.find((x) => x.month === annexMonth))) {
      annexMonth = (m.months.find((x) => x.month === reportMonth && x.annexes) || [...m.months].reverse().find((x) => x.annexes) || m.months[0])?.month || "offplan";
    }
    const mo = annexMonth === "offplan" ? { month: "", planned: 0, triggered: m.offPlan.length, annexes: m.offPlanMatrix.total.total, pct: 0, status: "Not in plan", products: [], matrix: m.offPlanMatrix } : m.months.find((x) => x.month === annexMonth);
    const mx = mo.matrix;
    const stages = mx.stages;
    const groups = [...mx.rows, mx.total].map((r) => ({ label: r.dept === "Total" ? "Total general" : `${r.dept}`, values: stages.map((st) => ({ key: st, value: r.total ? r.counts[st] / r.total : 0, count: r.counts[st], color: stageColor(st, stages) })) }));

    // heatmap: dept x month % complete
    const heat = `<div style="overflow:auto"><table class="data heat"><thead><tr><th>Department</th>${m.months.map((x) => `<th class="c">${fmtMonthShort(x.month)}</th>`).join("")}</tr></thead><tbody>${[...DEPARTMENTS, "All"].map((d) => `<tr><td><b>${d === "All" ? "All departments" : esc(d)}</b></td>${m.months.map((x) => {
      const r = d === "All" ? x.matrix.total : x.matrix.rows.find((y) => y.dept === d);
      const done = Object.entries(r.counts).filter(([s]) => /complet|approved|closed/i.test(s)).reduce((n, [, v]) => n + v, 0);
      const p = r.total ? done / r.total : null;
      const bg = p === null ? "transparent" : `color-mix(in srgb, var(--s-done) ${Math.round(12 + p * 78)}%, var(--surface))`;
      const fg = p !== null && p > 0.55 ? "#fff" : "var(--ink)";
      return `<td class="c" style="padding:4px"><a href="#/annexes?month=${x.month}" style="display:block;border-radius:8px;padding:7px 4px;background:${bg};color:${fg};font-weight:700;text-decoration:none;font-variant-numeric:tabular-nums;${x.month === annexMonth ? "outline:2px solid var(--accent);outline-offset:1px" : ""}" data-tip="${tip(`${d} · ${fmtMonth(x.month)}`, [["Complete", p === null ? "no annexes" : fmtPct(p, 1)], ["Annexes", fmtN(r.total)]])}">${p === null ? "·" : Math.round(p * 100) + "%"}</a></td>`;
    }).join("")}</tr>`).join("")}</tbody></table></div>`;

    return `
    <div class="chips" style="margin-bottom:16px">${m.months.map((x) => `<a class="chipf ${x.month === annexMonth ? "on" : ""}" href="#/annexes?month=${x.month}" style="text-decoration:none">${monthLabel(x.month)}<b>${x.annexes ? fmtPct(x.pct) : "—"}</b></a>`).join("")}${m.offPlan.length ? `<a class="chipf ${annexMonth === "offplan" ? "on" : ""}" href="#/annexes?month=offplan" style="text-decoration:none">Not in plan<b>${m.offPlan.length}</b></a>` : ""}</div>
    <div class="grid g-12">
      <section class="card span-8 reveal">
        <div class="card-h"><div><h3>Actual APQR Annexes Progress for (${mo.month ? monthLabel(mo.month) : "products not in plan"})</h3><p>% of each department’s annexes at each current stage</p></div></div>
        ${mo.annexes === 0 ? `<div class="callout ${mo.status.includes("overdue") ? "warn" : ""}">${icon(mo.status.includes("overdue") ? "alert" : "info")}<div>${mo.status === "Not yet due" ? `Not yet due. ${plural(mo.planned, "product")} planned; workflows are expected from ${fmtMonth(mo.month)}.` : mo.status.includes("overdue") ? `No workflow has been triggered for the ${plural(mo.planned, "product")} planned this month, although their PQR overdue date (${fmtDate(mo.overdueFrom)}) has passed.` : "No annexes raised yet for this month."}</div></div>` :
          columns(groups, { height: 300, series: stages.map((st) => ({ label: st, color: stageColor(st, stages) })) }) + `<div style="margin-top:18px">${matrixTable(mx)}</div>`}
      </section>
      <section class="card span-4 reveal">
        <div class="card-h"><div><h3>${mo.month ? fmtMonth(mo.month) : "Not in plan"}</h3><p>Plan position for the month</p></div></div>
        <div class="stat-grid">
          <div class="stat"><div class="k">Products planned</div><div class="v">${fmtN(mo.planned)}</div></div>
          <div class="stat"><div class="k">Workflows triggered</div><div class="v">${fmtN(mo.triggered)}</div></div>
          <div class="stat"><div class="k">Annexes raised</div><div class="v">${fmtN(mo.annexes)}</div></div>
          <div class="stat"><div class="k">Annexes complete</div><div class="v">${mo.annexes ? fmtPct(mo.pct, 1) : "—"}</div></div>
        </div>
        ${mo.month ? `<div style="display:flex;gap:8px;align-items:center;margin-top:14px;flex-wrap:wrap">${trackingPill(mo.status)}<span class="muted" style="font-size:12.5px">Overdue from ${fmtDate(mo.overdueFrom)}</span></div>` : ""}
        <div style="margin-top:16px;display:grid;grid-template-columns:minmax(0,1fr);gap:8px;max-height:340px;overflow:auto">
          ${(mo.month ? mo.products : m.offPlan.map((p) => ({ ...p, triggered: true }))).map((p) => `<button type="button" class="signal" style="padding:9px 10px" ${p.triggered ? `data-open-product="${esc(p.key)}"` : `data-href="#/plan?q=${encodeURIComponent(p.product)}"`}><span style="min-width:0;flex:1"><b style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:12.5px">${esc(p.product)}</b>${p.triggered ? progressBar(p.pct, { tone: p.rag === "COMPLETE" ? "complete" : p.rag === "OVERDUE" ? "overdue" : "" }) : '<small>Not triggered</small>'}</span><span class="n" style="font-size:13px">${p.triggered ? fmtPct(p.pct) : "—"}</span></button>`).join("")}
        </div>
      </section>
      <section class="card span-12 reveal">
        <div class="card-h"><div><h3>Completion heatmap</h3><p>Share of annexes completed, by department and planned PQR month. Click a cell to open that month.</p></div></div>
        ${heat}
      </section>
    </div>`;
  },
};

function matrixTable(mx) {
  const st = mx.stages;
  return `<div style="overflow:auto"><table class="data"><thead><tr><th>Department</th>${st.map((s) => `<th class="r">${esc(s)}</th>`).join("")}<th class="r">Total</th>${st.map((s) => `<th class="r"># ${esc(s)}</th>`).join("")}</tr></thead><tbody>${[...mx.rows, { ...mx.total, dept: "Total general" }].map((r) => `<tr${r.dept === "Total general" ? ' style="font-weight:800"' : ""}><td style="white-space:nowrap">${r.dept === "Total general" ? "Total general" : esc(r.dept)}</td>${st.map((s) => `<td class="r num">${fmtPct(r.total ? r.counts[s] / r.total : 0, 1)}</td>`).join("")}<td class="r num">${fmtN(r.total)}</td>${st.map((s) => `<td class="r num">${fmtN(r.counts[s])}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}

/* ================================================================ workload */

let wlSort = { key: "open", dir: -1 };
export const workload = {
  id: "workload",
  title: "Owner workload",
  sub: () => "Data-collection annexes per assigned user. Approval signatures are counted separately.",
  render(m) {
    const rows = [...m.workload].sort((a, b) => (a[wlSort.key] > b[wlSort.key] ? 1 : a[wlSort.key] < b[wlSort.key] ? -1 : 0) * wlSort.dir || a.user.localeCompare(b.user));
    const people = m.workload.filter((o) => o.user !== "Unassigned");
    const withOverdue = people.filter((o) => o.overdue > 0).length;
    const un = m.workload.find((o) => o.user === "Unassigned");
    const top = rows.filter((o) => o.dataTasks > 0).slice(0, 14);
    const th = (key, label, cls = "") => `<th data-wl-sort="${key}" data-sort class="${cls} ${wlSort.key === key ? "sorted" + (wlSort.dir > 0 ? " asc" : "") : ""}">${label}</th>`;
    return `
    <div class="kpis" style="margin-top:0">
      <div class="kpi"><div class="k">${icon("workload")}People with annexes</div><div class="v">${fmtN(people.filter((o) => o.dataTasks).length)}</div><div class="d">&nbsp;</div></div>
      <div class="kpi ${withOverdue ? "tone-crit" : ""}"><div class="k">${icon("alert")}With overdue items</div><div class="v">${fmtN(withOverdue)}</div><div class="d">&nbsp;</div></div>
      <a class="kpi ${un?.open ? "tone-warn" : ""}" href="#/tasks?assignee=Unassigned&closure=open" style="text-decoration:none;color:inherit"><div class="k">${icon("info")}Unassigned open</div><div class="v">${fmtN(un?.open || 0)}</div><div class="d">${fmtN(un?.overdue || 0)} overdue</div></a>
      <div class="kpi"><div class="k">${icon("edit")}Approvals signed</div><div class="v">${fmtN(m.kpi.approvals)}</div><div class="d">signature records</div></div>
    </div>
    <div class="grid g-12" style="margin-top:18px">
      <section class="card span-5 reveal">
        <div class="card-h"><div><h3>Load by person</h3><p>Completed, open and overdue annexes</p></div></div>
        <div class="legend"><span><i style="background:var(--s-done)"></i>Completed</span><span><i style="background:var(--s1)"></i>Open</span><span><i style="background:var(--crit)"></i>Overdue</span></div>
        ${hbars(top.map((o) => ({ label: o.user, sub: o.mainDept, attrs: `data-href="#/tasks?assignee=${encodeURIComponent(o.user)}"`, segments: [{ key: "Completed", value: o.completed, color: "var(--s-done)" }, { key: "Open", value: o.open - o.overdue, color: "var(--s1)" }, { key: "Overdue", value: o.overdue, color: "var(--crit)" }] })), { labelWidth: 130, valueLabel: (r) => `${fmtN(r.segments.reduce((s, x) => s + x.value, 0))}` })}
      </section>
      <section class="card span-7 table-card reveal">
        <div class="table-wrap" style="max-height:640px"><table class="data"><thead><tr>${th("user", "User")}${th("mainDept", "Main dept")}${th("dataTasks", "Annexes", "r")}${th("completed", "Done", "r")}${th("open", "Open", "r")}${th("overdue", "Overdue", "r")}${th("pct", "% complete")}${th("approvals", "Approvals", "r")}${th("earliestDue", "Earliest due")}<th>Status</th></tr></thead>
        <tbody>${rows.map((o) => `<tr data-href="#/tasks?assignee=${encodeURIComponent(o.user)}" style="cursor:pointer"><td style="white-space:nowrap"><b>${esc(o.user)}</b></td><td>${o.mainDept ? `<span style="display:inline-flex;align-items:center;gap:6px"><i style="width:8px;height:8px;border-radius:50%;background:${deptColor(o.mainDept)}"></i>${esc(o.mainDept)}</span>` : "–"}</td><td class="r num">${fmtN(o.dataTasks)}</td><td class="r num">${fmtN(o.completed)}</td><td class="r num">${fmtN(o.open)}</td><td class="r num" style="${o.overdue ? "color:var(--crit-ink);font-weight:800" : ""}">${fmtN(o.overdue)}</td><td><div class="pct-cell" style="min-width:120px"><b>${o.dataTasks ? fmtPct(o.pct) : "–"}</b>${progressBar(o.pct, { tone: o.pct === 1 ? "complete" : "" })}</div></td><td class="r num">${fmtN(o.approvals)}</td><td>${fmtDate(o.earliestDue)}</td><td>${o.status === "Clear" ? '<span class="pill pill-complete">' + icon("check") + "Clear</span>" : o.status.startsWith("ACTION") ? '<span class="pill pill-overdue">' + icon("alert") + "Overdue items</span>" : '<span class="pill pill-ontrack">' + icon("dot") + "In progress</span>"}</td></tr>`).join("")}</tbody></table></div>
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
        ${q.items.length ? `<div style="display:grid;gap:6px;max-height:260px;overflow:auto">${q.items.map((it) => `<button type="button" class="signal" style="padding:8px 10px" ${it.key && m.productByKey.has(it.key) ? `data-open-product="${esc(it.key)}"` : it.month ? `data-href="#/annexes?month=${it.month}"` : `data-href="#/plan?q=${encodeURIComponent(it.label)}"`}><span style="min-width:0;flex:1"><b style="font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(it.label)}</b><small>${esc(it.note || "")}</small></span></button>`).join("")}</div>` : ""}
      </section>`).join("") || `<section class="card span-12"><p class="muted">No data-quality observations. ${icon("check")}</p></section>`}
      <section class="card span-12 reveal">
        <div class="card-h"><div><h3>Excluded rows</h3><p>Rows in the Scigeniq export that are not APQR tasks (change controls, deviations…) or could not be linked to a product. Kept for traceability and excluded from every metric.</p></div><div class="tools"><span class="tag">${fmtN(s.excluded.length)}</span></div></div>
        ${s.excluded.length ? `<div class="table-wrap" style="max-height:420px"><table class="data"><thead><tr><th>Reference</th><th>Type</th><th>Stage</th><th>Title</th><th>Parent action</th><th>Reason</th></tr></thead><tbody>${s.excluded.map((x) => `<tr><td class="mono">${esc(x.ref)}</td><td>${esc(x.type)}</td><td>${esc(x.stage)}</td><td>${esc(x.title)}</td><td>${esc(x.parent)}</td><td><span class="tag">${esc(x.reason)}</span></td></tr>`).join("")}</tbody></table></div>` : '<p class="muted">No rows excluded.</p>'}
      </section>
    </div>`;
  },
};
