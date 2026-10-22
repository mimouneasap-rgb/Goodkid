// Workflows: one row per product with a live Scigeniq APQR workflow, as in the
// "APQR Tracker" sheet: counts, RAG, open tasks per department and QA comments.

import { el, icon, fmtDate, download } from "../dom.js";
import { matchesQuery, sortRows, shortProduct, splitName, toCsv, DEPT_IDS, RAG, FORMS } from "../model.js";
import { DEPARTMENTS } from "../sop.js";
import { dataTable, nextSort, select, ragChip, progress, who, searchBox, dueText } from "../ui.js";

export const title = () => "Live workflows";
export const crumbs = () => ["Scigeniq APQR workflows · one row per product"];

function uiState(ctx) {
  const u = (ctx.ui.workflows ??= { q: "", rag: "", owner: "", form: "", bottleneck: "", dup: false, sort: { key: "rag", dir: "asc" }, lastQuery: null });
  const qs = ctx.route.query.toString();
  if (qs !== u.lastQuery) {
    u.lastQuery = qs;
    if (qs) {
      u.rag = ctx.route.query.get("rag") || "";
      u.dup = ctx.route.query.get("dup") === "1";
      u.owner = ctx.route.query.get("owner") || "";
    }
  }
  return u;
}

const RAG_ORDER = { OVERDUE: 0, "DUE SOON": 1, "ON TRACK": 2, COMPLETE: 3 };

export function render(ctx) {
  const u = uiState(ctx);
  const live = ctx.d.products.filter((p) => p.triggered);
  const owners = [...new Set(live.map((p) => p.owner).filter(Boolean))].sort();
  const rows = live.filter((p) => {
    if (u.rag && p.rag !== u.rag) return false;
    if (u.owner && p.owner !== u.owner) return false;
    if (u.form && p.form !== u.form) return false;
    if (u.bottleneck && p.bottleneck !== u.bottleneck) return false;
    if (u.dup && !p.duplicate) return false;
    return matchesQuery(u.q, p.name, p.code, p.refs.join(" "), p.owner, p.stage, p.comments);
  });
  const update = (patch) => { Object.assign(u, patch); ctx.refresh(); };

  const columns = [
    { key: "primaryRef", label: "Ref", render: (p) => el("div", {}, el("span", { class: "mono nowrap" }, p.primaryRef),
      p.duplicate ? el("div", {}, el("span", { class: "chip serious", "data-tip": `Duplicate workflows\n${p.refs.join("\n")}` }, icon("copy"), `${p.refs.length} workflows`)) : null) },
    { key: "name", label: "Product", render: (p) => el("div", { class: "prod" }, splitName(p.name).brand, el("span", { class: "sub" }, `${splitName(p.name).rest} · ${p.form}`)) },
    { key: "rag", label: "RAG", render: (p) => ragChip(p.rag) },
    { key: "pct", label: "Tasks", render: (p) => el("div", { "data-tip": `${p.completed} of ${p.total} tasks completed\n${p.open} open` }, progress(p.pct, p.rag === "OVERDUE" ? "var(--critical)" : "var(--s1)")) },
    { key: "overdue", label: "Overdue", num: true, render: (p) => (p.overdue ? el("strong", { style: { color: "var(--critical-ink)" } }, p.overdue) : el("span", { class: "faint" }, "0")) },
    { key: "wfDue", label: "Workflow due", render: (p) => dueText(p.wfDue, p.wfDaysToDue) },
    { key: "deptOpen", label: "Open by department", sortable: false, render: (p) => el("div", { class: "dept-cells" }, DEPT_IDS.map((d) => {
      const n = p.deptOpen[d];
      const dep = DEPARTMENTS.find((x) => x.id === d);
      return el("span", { class: `dept-cell ${n ? `h${Math.min(5, n)}` : ""}`, "data-tip": `${dep.label}\n${n} open of ${p.deptTotal[d]}` }, n ? n : dep.annexCode);
    })) },
    { key: "bottleneck", label: "Bottleneck", render: (p) => (p.bottleneck ? el("span", { class: "tag" }, p.bottleneck) : el("span", { class: "faint" }, "—")) },
    { key: "owner", label: "APQR owner", render: (p) => who(p.owner) },
    { key: "stage", label: "Stage", render: (p) => el("span", { class: "tag" }, p.stage) },
    { key: "comments", label: "QA comments / actions", sortable: false, render: (p) => el("input", {
      class: "input sm", value: p.comments || "", placeholder: "Add a comment…", "aria-label": `QA comment for ${shortProduct(p.name)}`, style: { minWidth: "150px" },
      onchange: (e) => ctx.store.updateProduct(p.id, { comments: e.target.value }, "Edit QA comment"),
      onkeydown: (e) => { if (e.key === "Enter") e.target.blur(); },
    }) },
  ];
  const accessor = (r, key) => (key === "rag" ? RAG_ORDER[r.rag] : r[key]);
  const sorted = sortRows(rows, u.sort.key, u.sort.dir, accessor);

  return el("div", { class: "view" },
    el("div", { class: "toolbar" },
      searchBox(u.q, "Search workflows", "Search product, ref, owner, comment…", (v) => update({ q: v })),
      select([["", "Any RAG"], ...RAG.map((r) => [r, r.charAt(0) + r.slice(1).toLowerCase()])], u.rag, (v) => update({ rag: v }), { label: "RAG status" }),
      select([["", "Any owner"], ...owners], u.owner, (v) => update({ owner: v }), { label: "APQR owner" }),
      select([["", "All forms"], ...FORMS], u.form, (v) => update({ form: v }), { label: "Dosage form" }),
      select([["", "Any bottleneck"], ...DEPT_IDS], u.bottleneck, (v) => update({ bottleneck: v }), { label: "Bottleneck department" }),
      el("label", { class: "check" }, el("input", { type: "checkbox", checked: u.dup, onchange: (e) => update({ dup: e.target.checked }) }), "Duplicates only"),
      el("span", { class: "spacer" }),
      el("span", { class: "result-count" }, `${rows.length} of ${live.length} workflows`),
      el("button", { class: "btn", type: "button", onclick: () => exportCsv(sorted) }, icon("download", "sm"), "CSV")),
    el("section", { class: "card" }, dataTable(sorted, columns, {
      sort: u.sort,
      onSort: (key) => { u.sort = nextSort(u.sort, key, key === "overdue" || key === "pct" ? "desc" : "asc"); ctx.refresh(); },
      onRow: (p) => ctx.openProduct(p.id),
      emptyTitle: "No workflows match",
    })),
    el("p", { class: "muted", style: { fontSize: "12px" } },
      "Department cells show open tasks: QA, QC, PR (Production), RA and VL (Validation). The bottleneck is the department holding most open tasks. ",
      "Products with several APQR workflows keep the most recently triggered one as primary; open the product to cancel the superseded ones."),
  );
}

function exportCsv(rows) {
  const csv = toCsv(rows, [
    { label: "APQR ref", value: (p) => p.primaryRef }, { label: "All refs", value: (p) => p.refs.join(" ") },
    { label: "Product", value: (p) => p.name }, { label: "Dosage form", value: (p) => p.form }, { label: "Site", value: (p) => p.site },
    { label: "APQR owner", value: (p) => p.owner }, { label: "Workflow stage", value: (p) => p.stage }, { label: "Workflow status", value: (p) => p.wfStatus },
    { label: "Workflow due", value: (p) => fmtDate(p.wfDue) }, { label: "Total tasks", value: (p) => p.total }, { label: "Completed", value: (p) => p.completed },
    { label: "Open", value: (p) => p.open }, { label: "Overdue", value: (p) => p.overdue }, { label: "% complete", value: (p) => Math.round(p.pct * 100) },
    { label: "Days to due", value: (p) => p.wfDaysToDue ?? "" }, { label: "RAG", value: (p) => p.rag },
    ...DEPT_IDS.map((d) => ({ label: `Open ${d}`, value: (p) => p.deptOpen[d] })),
    { label: "Bottleneck", value: (p) => p.bottleneck }, { label: "QA comments", value: (p) => p.comments },
  ]);
  download("APQR-workflows.csv", `﻿${csv}`, "text/csv");
}
