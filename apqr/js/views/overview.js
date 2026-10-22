// Overview: the whole 2026 programme on one page.

import { el, icon, fmtDate, fmtMonth, fmtPct } from "../dom.js";
import {
  byDepartment, byStage, byForm, byPlannedMonth, planBucket, workload, burnUp, attentionItems, shortProduct, monthOf, RAG,
} from "../model.js";
import { PHASES, DEPARTMENTS } from "../sop.js";
import { burnUpChart, stageChart, workloadChart, coverageChart } from "../charts.js";
import { lazyChart, chartCard, legend, miniTable, meter, cardHead } from "../ui.js";

export const title = () => "Programme overview";

const BUCKETS = [
  ["closed", "Closed", "#22c55e"],
  ["live", "In workflow", "#60a5fa"],
  ["late", "Workflow with overdue tasks", "#fbbf24"],
  ["pastdue", "Past report due, not triggered", "#f87171"],
  ["waiting", "Not yet triggered", "rgba(255,255,255,.28)"],
];
const DEPT_COLOR = { QA: "var(--s1)", QC: "var(--s2)", Production: "var(--s3)", RA: "var(--s4)", Validation: "var(--s5)" };

export function render(ctx) {
  const { d, k } = ctx;
  const planned = d.products.filter((p) => p.planNo);
  return el("div", { class: "view" },
    hero(ctx, planned),
    kpiRow(ctx),
    el("div", { class: "grid g-12" },
      el("div", { class: "span-7" }, burnCard(ctx)),
      el("div", { class: "span-5" }, stageCard(ctx))),
    el("div", { class: "grid g-12" },
      el("div", { class: "span-6" }, deptCard(ctx)),
      el("div", { class: "span-6" }, ragCard(ctx))),
    el("div", { class: "grid g-12" },
      el("div", { class: "span-7" }, attentionCard(ctx)),
      el("div", { class: "span-5" }, workloadCard(ctx))),
    el("div", { class: "grid g-12" },
      el("div", { class: "span-7" }, phaseCard(ctx)),
      el("div", { class: "span-5" }, coverageCard(ctx))),
    el("p", { class: "muted", style: { fontSize: "12px" } },
      `Sources: ${ctx.state.meta.sources.join(" · ")}. Figures as of ${fmtDate(k.asOf)}.`),
  );
}

function hero(ctx, planned) {
  const { d, k } = ctx;
  const counts = Object.fromEntries(BUCKETS.map(([b]) => [b, planned.filter((p) => planBucket(p) === b).length]));
  const months = byPlannedMonth(planned).filter((m) => m.month.startsWith("2026"));
  const asOfMonth = monthOf(k.asOf);
  const started = planned.filter((p) => p.triggered || p.closed).length;
  const stat = (bucket, label, path) => el("button", { class: "hero-stat", type: "button", onclick: () => ctx.go(path) },
    el("div", { class: "v" }, counts[bucket] + (bucket === "live" ? counts.late : 0)),
    el("div", { class: "l" }, el("span", { class: "sw", style: { background: BUCKETS.find((b) => b[0] === bucket)[2] } }), label));
  return el("section", { class: "hero", "aria-label": "Plan at a glance" },
    el("div", {},
      el("div", { class: "hero-eyebrow" }, `${ctx.state.meta.programme} · ${ctx.state.meta.site}`),
      el("h1", {}, "Annual Product Quality Review"),
      el("div", { class: "hero-figure" }, el("span", { class: "big" }, started), el("span", { class: "of" }, `of ${k.planned} reviews started`)),
      el("p", { class: "hero-caption" }, `${fmtPct(started / Math.max(1, k.planned))} of the approved plan is in a Scigeniq workflow or closed. ${k.tasks} tasks, ${fmtPct(k.pctCompleted)} complete.`),
      el("div", { class: "hero-stats" },
        stat("closed", "Closed", "plan?bucket=closed"),
        stat("live", "In workflow", "workflows"),
        stat("pastdue", "Past due, not started", "plan?bucket=pastdue"),
        stat("waiting", "Waiting for trigger", "plan?bucket=waiting"))),
    el("div", {},
      el("div", { class: "hero-chart-head" },
        el("h2", {}, "Every planned product, by planned month"),
        el("div", { class: "hero-legend" }, BUCKETS.map(([, label, color]) => el("span", {}, el("i", { style: { background: color } }), label)))),
      el("div", { class: "units", role: "list" }, months.map((m) => el("div", { class: "units-col", role: "listitem" },
        el("div", { class: "units-count" }, m.products.length),
        el("div", { class: "units-stack" }, m.products.map((p) => el("button", {
          class: `unit b-${planBucket(p)}`, type: "button", "aria-label": `${p.name}: ${p.planStatus}`,
          "data-tip": [shortProduct(p.name), p.apqrNo || p.code, p.planStatus + (p.triggered ? ` · ${p.completed}/${p.total} tasks` : ""), p.reportDue ? `Report due ${fmtDate(p.reportDue)}` : ""].filter(Boolean).join("\n"),
          onclick: () => ctx.openProduct(p.id),
        }))),
        el("div", { class: `units-month ${m.month === asOfMonth ? "now" : ""}` }, fmtMonth(m.month, { year: false }))))),
      d.products.some((p) => p.planNo && !p.plannedMonth.startsWith("2026")) ? el("p", { class: "hero-caption" }, "Products planned outside 2026 are listed in the annual plan.") : null),
  );
}

function kpiRow(ctx) {
  const { k } = ctx;
  const tile = (tone, ic, label, value, small, sub, path, bar) => el("button", { class: `kpi tone-${tone}`, type: "button", onclick: () => ctx.go(path) },
    el("span", { class: "kpi-icon" }, icon(ic)),
    el("div", { class: "kpi-label" }, label),
    el("div", { class: "kpi-value" }, value, small ? el("small", {}, small) : null),
    el("div", { class: "kpi-sub" }, sub),
    bar || null);
  return el("section", { class: "kpis", "aria-label": "Key figures" },
    tile("good", "checkCircle", "Tasks completed", k.completed, `/ ${k.tasks}`, `${fmtPct(k.pctCompleted)} of all tasks`, "tasks?status=done",
      meter([{ value: k.pctCompleted, color: "var(--good)" }])),
    tile("info", "clock", "Open tasks", k.open, null, `${k.systemOverdue} carry the Scigeniq overdue flag`, "tasks?status=open"),
    tile("critical", "alert", "Overdue tasks", k.overdue, null, `${k.productsOverdue} products affected`, "tasks?overdue=1"),
    tile("warning", "user", "Unassigned", k.unassignedOpen, null, "open tasks without an owner", "tasks?user=Unassigned&status=open"),
    tile("serious", "copy", "Duplicate workflows", k.duplicates, null, "products with >1 APQR workflow", "workflows?dup=1"),
    tile("serious", "calendar", "Past report due", k.pastDue, null, "planned, not triggered or closed", "plan?bucket=pastdue"),
  );
}

function burnCard(ctx) {
  const points = burnUp(ctx.d.tasks, ctx.k.asOf);
  const fmtWeek = (w) => fmtDate(w, { year: false });
  return chartCard({
    key: "burn", ui: ctx.ui, title: "Task burn-up",
    sub: "Cumulative Scigeniq tasks created and closed, by week",
    legend: legend([["Created", "var(--s2)", "line"], ["Closed", "var(--s1)", "line"]]),
    chart: () => lazyChart((w) => burnUpChart(points, w, fmtWeek), { label: "Task burn-up chart" }),
    table: () => miniTable(["Week of", "Created", "Closed", "Open"], points.map((p) => [fmtDate(p.week), p.created, p.closed, p.created - p.closed]).reverse()),
  });
}

function stageCard(ctx) {
  const stages = byStage(ctx.d.tasks);
  return chartCard({
    key: "stage", ui: ctx.ui, title: "Workflow stages", sub: "Where every task sits in the Scigeniq workflow",
    chart: () => lazyChart((w) => stageChart(stages, w), {
      label: "Tasks by stage",
      onClick: (e) => { const s = e.target.closest("[data-stage]"); if (s) ctx.go(`tasks?stage=${encodeURIComponent(s.dataset.stage)}`); },
    }),
    table: () => miniTable(["Stage", "Tasks"], stages.map((s) => [s.stage, s.count])),
  });
}

function deptCard(ctx) {
  const rows = byDepartment(ctx.d.tasks);
  return el("section", { class: "card" },
    cardHead("Departments", "Completed vs open data-collection tasks · click a row for its tasks"),
    el("div", { class: "card-body" },
      el("div", { class: "dept-rows" }, rows.map((r) => {
        const dep = DEPARTMENTS.find((x) => x.id === r.dept);
        const pct = r.total ? r.completed / r.total : 0;
        return el("div", { class: "dept-row", role: "button", tabindex: "0", onclick: () => ctx.go(`tasks?dept=${encodeURIComponent(r.dept)}&status=open`),
          onkeydown: (e) => { if (e.key === "Enter") ctx.go(`tasks?dept=${encodeURIComponent(r.dept)}&status=open`); },
          "data-tip": `${dep.label}\n${r.completed} completed\n${r.open} open\n${r.overdue} overdue\n${dep.annex} · ${dep.template}` },
        el("div", { class: "dept-name" }, el("span", { class: "dot", style: { background: DEPT_COLOR[r.dept] } }), r.dept),
        meter([{ value: pct, color: DEPT_COLOR[r.dept] }], "thick"),
        el("div", { class: "dept-figs" }, el("strong", {}, fmtPct(pct)), ` · ${r.open} open`));
      }))));
}

function ragCard(ctx) {
  const { k } = ctx;
  const total = Math.max(1, k.triggered);
  const tones = { COMPLETE: ["var(--good)", "checkCircle", "Complete"], "ON TRACK": ["var(--s1)", "target", "On track"], "DUE SOON": ["var(--warning)", "clock", "Due soon"], OVERDUE: ["var(--critical)", "alert", "Overdue"] };
  return el("section", { class: "card" },
    cardHead("Live workflow status", `${k.triggered} products with a Scigeniq workflow · RAG rule from the master tracker`),
    el("div", { class: "card-body" },
      el("div", { class: "statusbar", role: "img", "aria-label": RAG.map((r) => `${tones[r][2]} ${k.rag[r]}`).join(", ") },
        RAG.map((r) => (k.rag[r] ? el("span", { style: { width: `${(k.rag[r] / total) * 100}%`, background: tones[r][0] }, "data-tip": `${tones[r][2]}\n${k.rag[r]} workflows` }) : null))),
      el("div", { class: "status-legend" }, RAG.map((r) => el("button", { type: "button", onclick: () => ctx.go(`workflows?rag=${encodeURIComponent(r)}`) },
        el("div", { class: "v" }, k.rag[r]),
        el("span", { class: "chip", style: { background: "transparent", padding: 0, color: "var(--ink-2)" } }, el("span", { class: "dot", style: { background: tones[r][0] } }), icon(tones[r][1]), tones[r][2])))),
      el("p", { class: "muted", style: { fontSize: "12px", marginTop: "12px" } },
        "Complete = all tasks closed · Overdue = at least one task past due · Due soon = workflow due within ",
        String(ctx.state.settings.dueSoonDays), " days · On track = everything else.")));
}

function attentionCard(ctx) {
  const items = attentionItems(ctx.d.products, ctx.d.tasks, ctx.k);
  const icons = { critical: "alert", serious: "alert", warning: "clock", info: "info" };
  const act = (it) => {
    if (it.kind === "task") ctx.openTask(it.id);
    else if (it.productId) ctx.openProduct(it.productId);
    else if (it.kind === "pastdue") ctx.go("plan?bucket=pastdue");
    else if (it.kind === "duplicates") ctx.go("workflows?dup=1");
    else if (it.kind === "duesoon") ctx.go("plan?status=Due%20%E2%89%A4%2060%20d");
    else if (it.kind === "unassigned") ctx.go("tasks?user=Unassigned&status=open");
    else if (it.kind === "scope") ctx.go("plan?scope=annual");
    else if (it.kind === "mismatch") ctx.go("sop?section=quality");
  };
  return el("section", { class: "card" },
    cardHead("Needs attention", `${items.length} items, most urgent first`),
    el("div", { class: "attn", style: { marginTop: "10px" } }, items.length ? items.map((it) =>
      el("button", { class: "attn-item", type: "button", onclick: () => act(it) },
        el("span", { class: `attn-icon ${it.level}` }, icon(icons[it.level])),
        el("span", {}, el("div", { class: "attn-title" }, it.title), el("div", { class: "attn-detail" }, it.detail)))) :
      el("div", { class: "empty" }, icon("checkCircle"), el("h3", {}, "All clear"), el("p", {}, "Nothing overdue or unassigned."))));
}

function workloadCard(ctx) {
  const users = workload(ctx.d.tasks).filter((u) => u.open > 0).sort((a, b) => b.open - a.open || b.overdue - a.overdue).slice(0, 10);
  return chartCard({
    key: "workload", ui: ctx.ui, title: "Top workloads", sub: "Open tasks per person, overdue part in red",
    legend: legend([["Open, on time", "var(--s1)"], ["Overdue", "var(--critical)"]]),
    actions: [el("button", { class: "btn sm ghost", type: "button", onclick: () => ctx.go("people") }, "All people", icon("chevronRight", "sm"))],
    chart: () => lazyChart((w) => workloadChart(users, w), {
      label: "Open tasks per person",
      onClick: (e) => { const g = e.target.closest("[data-user]"); if (g) ctx.go(`tasks?user=${encodeURIComponent(g.dataset.user)}&status=open`); },
    }),
    table: () => miniTable(["Person", "Open", "Overdue", "Completed"], users.map((u) => [u.user, u.open, u.overdue, u.completed])),
  });
}

function phaseCard(ctx) {
  const { k } = ctx;
  const total = Math.max(1, ctx.d.products.length);
  return el("section", { class: "card" },
    cardHead("APQR lifecycle", "Products per SOPQA0152E phase · click a phase to list them"),
    el("div", { class: "card-body" },
      el("div", { style: { display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: "8px" } }, PHASES.map((ph, i) =>
        el("button", { type: "button", class: "kpi", style: { padding: "12px 10px", textAlign: "center" }, onclick: () => ctx.go(`plan?phase=${ph.id}`), "data-tip": `${ph.label}\n${ph.sop}\n${k.phases[ph.id]} products` },
          el("div", { style: { height: "4px", borderRadius: "2px", marginBottom: "10px", background: i === 6 ? "var(--good)" : i === 0 ? "var(--line-strong)" : `var(--o${Math.min(5, i)})` } }),
          el("div", { class: "kpi-value", style: { fontSize: "22px", marginTop: 0 } }, k.phases[ph.id]),
          el("div", { class: "kpi-sub", style: { whiteSpace: "normal", fontSize: "11.5px", lineHeight: 1.3 } }, ph.short)))),
      el("div", { style: { marginTop: "14px" } },
        meter(PHASES.map((ph, i) => ({ value: k.phases[ph.id] / total, color: i === 6 ? "var(--good)" : i === 0 ? "var(--line-strong)" : `var(--o${Math.min(5, i)})` })), "thick"))));
}

function coverageCard(ctx) {
  const rows = byForm(ctx.d.products);
  return chartCard({
    key: "coverage", ui: ctx.ui, title: "Plan coverage by dosage form", sub: "Triggered of planned products",
    chart: () => lazyChart((w) => coverageChart(rows, w), { label: "Coverage by dosage form" }),
    table: () => miniTable(["Dosage form", "Planned", "Triggered", "Closed"], rows.map((r) => [r.form, r.planned, r.triggered, r.closed])),
  });
}
