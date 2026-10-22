// People: workload per assigned user (the "Owner Workload" sheet), as cards or a table.

import { el, icon, fmtDate, fmtPct, download } from "../dom.js";
import { workload, matchesQuery, sortRows, toCsv, DEPT_IDS, daysBetween } from "../model.js";
import { avatar, dataTable, nextSort, select, seg, searchBox, meter, who } from "../ui.js";

export const title = () => "People & workload";
export const crumbs = () => ["Assigned users across all APQR tasks"];

const DEPT_COLOR = { QA: "var(--s1)", QC: "var(--s2)", Production: "var(--s3)", RA: "var(--s4)", Validation: "var(--s5)" };

export function render(ctx) {
  const u = (ctx.ui.people ??= { q: "", dept: "", mode: "cards", sort: { key: "open", dir: "desc" }, hideClear: true });
  const all = workload(ctx.d.tasks);
  const rows = all.filter((p) => (!u.dept || p.depts[u.dept]) && (!u.hideClear || p.open > 0) && matchesQuery(u.q, p.user, Object.keys(p.depts).join(" ")));
  const sorted = sortRows(rows, u.sort.key, u.sort.dir);
  const update = (patch) => { Object.assign(u, patch); ctx.refresh(); };
  const open = (name) => ctx.go(`tasks?user=${encodeURIComponent(name)}&status=open`);

  const totals = { people: all.filter((p) => p.user !== "Unassigned").length, busy: all.filter((p) => p.open > 0 && p.user !== "Unassigned").length, overdue: all.filter((p) => p.overdue > 0).length };

  return el("div", { class: "view" },
    el("div", { class: "kpis", style: { gridTemplateColumns: "repeat(4, minmax(0, 1fr))" } },
      kpi("People with tasks", totals.people), kpi("With open tasks", totals.busy), kpi("With overdue tasks", totals.overdue, "critical"),
      kpi("Unassigned open tasks", all.find((p) => p.user === "Unassigned")?.open ?? 0, "warning")),
    el("div", { class: "toolbar" },
      searchBox(u.q, "Search people", "Search a person or department…", (v) => update({ q: v })),
      select([["", "All departments"], ...DEPT_IDS], u.dept, (v) => update({ dept: v }), { label: "Department" }),
      el("label", { class: "check" }, el("input", { type: "checkbox", checked: u.hideClear, onchange: (e) => update({ hideClear: e.target.checked }) }), "Only people with open tasks"),
      select([["open", "Most open"], ["overdue", "Most overdue"], ["pct", "Completion"], ["user", "Name"]], u.sort.key, (v) => update({ sort: { key: v, dir: v === "user" ? "asc" : "desc" } }), { label: "Sort" }),
      el("span", { class: "spacer" }),
      el("span", { class: "result-count" }, `${rows.length} people`),
      seg([["cards", "Cards", "grid"], ["table", "Table", "table"]], u.mode, (v) => update({ mode: v }), "Layout"),
      el("button", { class: "btn", type: "button", onclick: () => exportCsv(sorted) }, icon("download", "sm"), "CSV")),
    u.mode === "cards" ? el("div", { class: "people-grid" }, sorted.map((p) => card(ctx, p, open))) :
      el("section", { class: "card" }, dataTable(sorted, [
        { key: "user", label: "Person", render: (p) => who(p.user) },
        { key: "mainDept", label: "Main dept", render: (p) => el("span", { class: "tag" }, p.mainDept) },
        { key: "products", label: "Products", num: true },
        { key: "total", label: "Total", num: true },
        { key: "completed", label: "Completed", num: true },
        { key: "open", label: "Open", num: true },
        { key: "overdue", label: "Overdue", num: true, render: (p) => (p.overdue ? el("strong", { style: { color: "var(--critical-ink)" } }, p.overdue) : "0") },
        { key: "pct", label: "% complete", render: (p) => el("div", { class: "progress" }, meter([{ value: p.pct, color: "var(--good)" }]), el("span", { class: "pct" }, fmtPct(p.pct))) },
        { key: "earliestDue", label: "Earliest open due", render: (p) => (p.earliestDue ? fmtDate(p.earliestDue) : "—") },
      ], { sort: u.sort, onSort: (key) => { u.sort = nextSort(u.sort, key, "desc"); ctx.refresh(); }, onRow: (p) => open(p.user) })),
  );
}

function kpi(label, value, tone) {
  return el("div", { class: "kpi", style: { cursor: "default" } },
    el("div", { class: "kpi-label" }, tone ? el("span", { class: "dot", style: { background: `var(--${tone})` } }) : null, label),
    el("div", { class: "kpi-value" }, value));
}

function card(ctx, p, open) {
  const deptEntries = Object.entries(p.depts).sort((a, b) => b[1] - a[1]);
  const nextDue = p.earliestDue ? daysBetween(ctx.asOf, p.earliestDue) : null;
  return el("button", { class: "person", type: "button", onclick: () => open(p.user), "aria-label": `${p.user}: ${p.open} open tasks` },
    el("div", { class: "person-head" }, avatar(p.user, "lg"),
      el("div", { style: { minWidth: 0 } }, el("div", { class: "person-name" }, p.user),
        el("div", { class: "person-meta" }, `${p.mainDept} · ${p.products} product${p.products === 1 ? "" : "s"}`)),
      p.overdue ? el("span", { class: "chip critical", style: { marginLeft: "auto" } }, icon("alert"), p.overdue) : null),
    el("div", { class: "person-figs" },
      el("div", {}, el("div", { class: "v" }, p.open), el("div", { class: "l" }, "Open")),
      el("div", {}, el("div", { class: "v" }, p.completed), el("div", { class: "l" }, "Completed")),
      el("div", {}, el("div", { class: "v" }, fmtPct(p.pct)), el("div", { class: "l" }, "Done"))),
    el("div", { "data-tip": deptEntries.map(([d, n]) => `${d}: ${n}`).join("\n") },
      meter(deptEntries.map(([d, n]) => ({ value: n / p.total, color: DEPT_COLOR[d] || "var(--faint)" })))),
    el("div", { class: "person-meta" }, p.earliestDue ? `Next due ${fmtDate(p.earliestDue)}${nextDue !== null ? (nextDue < 0 ? ` · ${-nextDue} d late` : ` · in ${nextDue} d`) : ""}` : "No open tasks"));
}

function exportCsv(rows) {
  const csv = toCsv(rows, [
    { label: "Assigned User", value: (p) => p.user }, { label: "Main department", value: (p) => p.mainDept },
    { label: "Total Tasks", value: (p) => p.total }, { label: "Completed", value: (p) => p.completed }, { label: "Open", value: (p) => p.open },
    { label: "Overdue", value: (p) => p.overdue }, { label: "% Complete", value: (p) => Math.round(p.pct * 100) },
    { label: "Earliest Open Due Date", value: (p) => p.earliestDue }, { label: "Status", value: (p) => p.status },
  ]);
  download("APQR-workload.csv", `﻿${csv}`, "text/csv");
}
