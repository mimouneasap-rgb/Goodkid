// Annual plan: every planned product as a 12-month calendar or a sortable table,
// with filters that the overview links into.

import { el, icon, fmtDate, fmtMonth, download } from "../dom.js";
import {
  byPlannedMonth, planBucket, matchesQuery, sortRows, shortProduct, splitName, FORMS, ROUTES, toCsv, monthOf,
  blankProductExtras, apqrNumber,
} from "../model.js";
import { PHASES } from "../sop.js";
import { dataTable, nextSort, select, seg, planChip, progress, toast, searchBox } from "../ui.js";

export const title = () => "Annual plan 2026";
export const crumbs = (ctx) => [`${ctx.state.meta.planTemplate} · Scigeniq ${ctx.state.meta.scigeniqPlan}`];

const BUCKET_LABEL = { closed: "Closed", live: "In workflow", late: "Workflow with overdue tasks", pastdue: "Past due, not triggered", waiting: "Not yet triggered" };
const PLAN_STATUSES = ["Closed", "In progress", "Past due", "Due ≤ 60 d", "Not triggered"];

function uiState(ctx) {
  const u = (ctx.ui.plan ??= { q: "", scope: "", form: "", month: "", status: "", phase: "", bucket: "", mode: "calendar", sort: { key: "planNo", dir: "asc" }, limit: 120, lastQuery: null });
  const qs = ctx.route.query.toString();
  if (qs !== u.lastQuery) {
    u.lastQuery = qs;
    if (qs) {
      for (const key of ["scope", "form", "month", "status", "phase", "bucket", "q"]) u[key] = ctx.route.query.get(key) || "";
      if (u.bucket || u.phase || u.status) u.mode = "table";
    }
  }
  return u;
}

function filterProducts(ctx, u) {
  return ctx.d.products.filter((p) => {
    if (u.scope === "scigeniq" && !p.scigeniqNo) return false;
    if (u.scope === "annual" && !(p.planNo && !p.scigeniqNo)) return false;
    if (u.scope === "unplanned" && p.planNo) return false;
    if (u.form && p.form !== u.form) return false;
    if (u.month && p.plannedMonth !== u.month) return false;
    if (u.status && p.planStatus !== u.status) return false;
    if (u.phase && p.phase !== u.phase) return false;
    if (u.bucket && planBucket(p) !== u.bucket) return false;
    return matchesQuery(u.q, p.name, p.code, p.apqrNo, p.refs.join(" "), p.prevReport, p.owner);
  });
}

export function render(ctx) {
  const u = uiState(ctx);
  const rows = filterProducts(ctx, u);
  const months = [...new Set(ctx.d.products.map((p) => p.plannedMonth).filter(Boolean))].sort();
  const update = (patch) => { Object.assign(u, patch, { limit: 120 }); ctx.refresh(); };
  const activeFilters = [
    u.bucket && ["bucket", BUCKET_LABEL[u.bucket]], u.phase && ["phase", PHASES.find((p) => p.id === u.phase)?.label],
  ].filter(Boolean);

  const toolbar = el("div", { class: "toolbar" },
    searchBox(u.q, "Search plan", "Search product, code, APQR no., ref…", (v) => update({ q: v })),
    select([["", "All products"], ["scigeniq", "In Scigeniq plan"], ["annual", "Annual plan only"], ["unplanned", "Not in plan"]], u.scope, (v) => update({ scope: v }), { label: "Scope" }),
    select([["", "All forms"], ...FORMS], u.form, (v) => update({ form: v }), { label: "Dosage form" }),
    select([["", "All months"], ...months.map((m) => [m, fmtMonth(m)])], u.month, (v) => update({ month: v }), { label: "Planned month" }),
    select([["", "Any status"], ...PLAN_STATUSES], u.status, (v) => update({ status: v }), { label: "Plan status" }),
    activeFilters.length ? el("div", { class: "filters-active" }, activeFilters.map(([key, label]) =>
      el("button", { class: "filter-pill", type: "button", onclick: () => update({ [key]: "" }), "aria-label": `Remove filter ${label}` }, label, icon("close", "sm")))) : null,
    el("span", { class: "spacer" }),
    el("span", { class: "result-count" }, `${rows.length} of ${ctx.d.products.length}`),
    seg([["calendar", "Calendar", "calendar"], ["table", "Table", "table"]], u.mode, (v) => update({ mode: v }), "Layout"),
    el("button", { class: "btn", type: "button", onclick: () => exportCsv(rows) }, icon("download", "sm"), "CSV"),
    el("button", { class: "btn primary", type: "button", onclick: () => addProduct(ctx) }, icon("plus", "sm"), "Add product"),
  );

  return el("div", { class: "view" },
    summaryStrip(ctx, rows),
    toolbar,
    u.mode === "calendar" ? calendar(ctx, rows) : table(ctx, rows, u),
  );
}

function summaryStrip(ctx, rows) {
  const n = (fn) => rows.filter(fn).length;
  const items = [
    ["Planned", n((p) => p.planNo), "var(--ink-2)"],
    ["In Scigeniq plan", n((p) => p.scigeniqNo), "var(--s1)"],
    ["Triggered", n((p) => p.triggered), "var(--o3)"],
    ["Closed", n((p) => p.closed), "var(--good)"],
    ["Past due", n((p) => p.planStatus === "Past due"), "var(--critical)"],
    ["Due ≤ 60 d", n((p) => p.planStatus === "Due ≤ 60 d"), "var(--warning)"],
  ];
  return el("div", { class: "kpis" }, items.map(([l, v, c]) => el("div", { class: "kpi", style: { cursor: "default" } },
    el("div", { class: "kpi-label" }, el("span", { class: "dot", style: { background: c } }), l), el("div", { class: "kpi-value" }, v))));
}

function calendar(ctx, rows) {
  const months = byPlannedMonth(rows);
  const asOfMonth = monthOf(ctx.asOf);
  const unplanned = rows.filter((p) => !p.plannedMonth);
  if (!months.length && !unplanned.length) return el("div", { class: "card" }, el("div", { class: "empty" }, icon("search"), el("h3", {}, "No products match"), el("p", {}, "Clear a filter to see the plan.")));
  return el("div", {},
    el("div", { class: "legend", style: { marginBottom: "14px" } }, Object.entries(BUCKET_LABEL).map(([b, l]) => el("span", {}, el("i", { class: `bucket b-${b}` }), l))),
    el("div", { class: "calendar" }, [...months, ...(unplanned.length ? [{ month: "", products: unplanned }] : [])].map((m) => {
      const closed = m.products.filter((p) => p.closed).length;
      const live = m.products.filter((p) => p.triggered && !p.closed).length;
      return el("section", { class: `month ${m.month === asOfMonth ? "now" : ""}` },
        el("div", { class: "month-head" },
          el("div", {}, el("div", { class: "month-name" }, m.month ? fmtMonth(m.month, { long: true }) : "Not in plan"),
            el("div", { class: "month-count" }, `${m.products.length} product${m.products.length === 1 ? "" : "s"}${m.month === asOfMonth ? " · status month" : ""}`)),
          el("div", { class: "meter", style: { flex: 1 }, "data-tip": `${closed} closed\n${live} in workflow\n${m.products.length - closed - live} not started` },
            closed ? el("span", { style: { width: `${(closed / m.products.length) * 100}%`, background: "var(--good)" } }) : null,
            live ? el("span", { style: { width: `${(live / m.products.length) * 100}%`, background: "var(--s1)" } }) : null)),
        el("div", { class: "month-list" }, m.products.map((p) => el("button", {
          class: "pchip", type: "button", onclick: () => ctx.openProduct(p.id),
          "data-tip": [p.name, p.apqrNo, `${p.planStatus}${p.triggered ? ` · ${p.completed}/${p.total} tasks · ${p.stage}` : ""}`, p.reportDue ? `Report due ${fmtDate(p.reportDue)}` : ""].filter(Boolean).join("\n"),
        }, el("span", { class: `bucket b-${planBucket(p)}` }), el("span", { class: "nm" }, shortProduct(p.name)), el("span", { class: "cd" }, p.code || p.site)))));
    })));
}

function table(ctx, rows, u) {
  const columns = [
    { key: "planNo", label: "#", num: true, render: (p) => p.planNo ?? "—" },
    { key: "name", label: "Product", render: (p) => el("div", { class: "prod" }, splitName(p.name).brand, el("span", { class: "sub" }, `${splitName(p.name).rest} · ${p.form}`)) },
    { key: "apqrNo", label: "APQR no.", render: (p) => (p.apqrNo ? el("span", { class: "mono nowrap" }, p.apqrNo) : el("span", { class: "faint" }, p.code || "—")) },
    { key: "plannedMonth", label: "Planned", render: (p) => el("span", { class: "nowrap" }, fmtMonth(p.plannedMonth) || "—") },
    { key: "periodEnd", label: "Review period", render: (p) => el("span", { class: "nowrap muted" }, p.periodStart ? `${fmtMonth(p.periodStart)} – ${fmtMonth(p.periodEnd)}` : "—") },
    { key: "reportDue", label: "Report due", render: (p) => (p.reportDue ? el("span", { class: "nowrap", style: p.daysToReportDue < 0 && !p.closed ? { color: "var(--critical-ink)", fontWeight: 650 } : null }, fmtDate(p.reportDue)) : "—") },
    { key: "primaryRef", label: "Workflow", render: (p) => (p.triggered ? el("div", {}, el("span", { class: "mono" }, p.primaryRef), el("div", { class: "muted", style: { fontSize: "12px" } }, p.stage)) : el("span", { class: "faint" }, p.route === "QMex" ? "QMex route" : "—")) },
    { key: "pct", label: "Tasks", render: (p) => (p.total ? progress(p.pct) : el("span", { class: "faint" }, "—")) },
    { key: "planStatus", label: "Status", render: (p) => planChip(p.planStatus) },
  ];
  const accessor = (r, key) => (key === "reportDue" ? r.reportDue : r[key]);
  const sorted = sortRows(rows, u.sort.key, u.sort.dir, accessor);
  return el("section", { class: "card" }, dataTable(sorted, columns, {
    sort: u.sort,
    onSort: (key) => { u.sort = nextSort(u.sort, key); ctx.refresh(); },
    onRow: (p) => ctx.openProduct(p.id),
    limit: u.limit,
    onMore: () => { u.limit += 150; ctx.refresh(); },
    maxHeight: "none",
  }));
}

function exportCsv(rows) {
  const csv = toCsv(rows, [
    { label: "Sr. No.", value: (p) => p.planNo ?? "" }, { label: "Final product code", value: (p) => p.code },
    { label: "Product", value: (p) => p.name }, { label: "Dosage form", value: (p) => p.form },
    { label: "Planned month", value: (p) => p.plannedMonth }, { label: "APQR no.", value: (p) => p.apqrNo },
    { label: "Previous report", value: (p) => p.prevReport }, { label: "Review start", value: (p) => p.periodStart },
    { label: "Review end", value: (p) => p.periodEnd }, { label: "Report due", value: (p) => p.reportDue },
    { label: "Scigeniq plan no.", value: (p) => p.scigeniqNo ?? "" }, { label: "Route", value: (p) => p.route },
    { label: "Workflow ref", value: (p) => p.primaryRef }, { label: "Stage", value: (p) => p.stage },
    { label: "Tasks", value: (p) => p.total }, { label: "Completed", value: (p) => p.completed },
    { label: "% complete", value: (p) => (p.total ? Math.round(p.pct * 100) : "") }, { label: "Phase", value: (p) => p.phase },
    { label: "Plan status", value: (p) => p.planStatus }, { label: "Comments", value: (p) => p.comments },
  ]);
  download(`APQR-plan-2026.csv`, `﻿${csv}`, "text/csv");
}

export function productForm(initial, products) {
  const draft = { ...initial };
  const field = (key, label, attrs = {}) => el("div", { class: `field ${attrs.full ? "full" : ""}` }, el("label", { for: `pf-${key}` }, label),
    el("input", { id: `pf-${key}`, class: `input ${attrs.mono ? "mono" : ""}`, type: attrs.type || "text", value: draft[key] ?? "", placeholder: attrs.placeholder,
      oninput: (e) => { draft[key] = attrs.type === "number" ? (e.target.value === "" ? null : Number(e.target.value)) : e.target.value; } }),
    attrs.hint ? el("span", { class: "hint" }, attrs.hint) : null);
  const body = el("div", { class: "form-grid" },
    field("name", "Product name", { full: true, placeholder: "BRAND (INN) strength form (pack)" }),
    field("code", "Final product code", { mono: true, placeholder: "TB040P01", hint: "Per SOPPL0013F; used in the APQR number" }),
    el("div", { class: "field" }, el("label", {}, "Dosage form"), select(FORMS, draft.form, (v) => { draft.form = v; }, { label: "Dosage form" })),
    field("plannedMonth", "Planned month", { type: "month" }),
    field("prevReport", "Previous report", { mono: true, placeholder: "APQR/TB040P01/0125" }),
    field("periodStart", "Review period start", { type: "month" }),
    field("periodEnd", "Review period end", { type: "month", hint: "12 consecutive months (§10.2.1)" }),
    el("div", { class: "field" }, el("label", {}, "Route"), select(ROUTES, draft.route, (v) => { draft.route = v; }, { label: "Route" }), el("span", { class: "hint" }, "Scigeniq workflow or legacy QMex report")),
    field("site", "Site"),
  );
  const validate = () => {
    if (!String(draft.name || "").trim()) return "Enter a product name.";
    if (draft.code && products.some((p) => p.code === draft.code && p.id !== initial.id)) return `Code ${draft.code} is already in the plan.`;
    return "";
  };
  return { draft, body, validate };
}

function addProduct(ctx) {
  const products = ctx.state.products;
  const nextNo = Math.max(0, ...products.map((p) => p.planNo || 0)) + 1;
  const initial = {
    id: "", code: "", name: "", form: "Tablets", site: ctx.state.meta.site, plannedMonth: "", prevReport: "", periodStart: "", periodEnd: "",
    planNo: nextNo, scigeniqNo: null, scigeniqName: "", scigeniqStart: "", scigeniqEnd: "", ...blankProductExtras(), route: "Scigeniq",
  };
  ctx.modal((close) => {
    const { draft, body, validate } = productForm(initial, products);
    return {
      title: "Add product to the plan",
      subtitle: "Newly introduced and zero-batch products are included too (SOPQA0021E §10.3.8, Note 01).",
      body,
      foot: [
        el("button", { class: "btn", type: "button", onclick: () => close() }, "Cancel"),
        el("button", { class: "btn primary", type: "button", onclick: () => {
          const err = validate();
          if (err) { toast(err); return; }
          const id = draft.code || `P-${Date.now().toString(36).toUpperCase()}`;
          ctx.store.commit("Add product", (s) => {
            s.products.push({ ...draft, id });
            return [{ kind: "product", id, label: draft.name, changes: [{ field: "added", from: "", to: apqrNumber(draft) || draft.name }] }];
          });
          close();
          ctx.undoToast("Product added to the plan");
          ctx.openProduct(id);
        } }, "Add product"),
      ],
    };
  });
}
