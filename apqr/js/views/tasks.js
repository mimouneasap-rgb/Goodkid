// Task register: every Scigeniq task, filterable, with an editor and bulk actions.

import { el, icon, fmtDate, download } from "../dom.js";
import { matchesQuery, sortRows, shortProduct, toCsv, nowStamp, DEPT_IDS, TASK_STAGES, UNASSIGNED } from "../model.js";
import { dataTable, nextSort, select, taskStateChip, who, searchBox, dueText } from "../ui.js";

export const title = () => "Task register";
export const crumbs = () => ["Scigeniq export · data collection and review tasks"];

const STATUS_FILTERS = [["", "All statuses"], ["open", "Open"], ["overdue", "Overdue (calculated)"], ["flag", "Scigeniq overdue flag"], ["done", "Completed"], ["cancelled", "Cancelled"]];

function uiState(ctx) {
  const u = (ctx.ui.tasks ??= { q: "", dept: "", status: "", stage: "", user: "", product: "", sort: { key: "due", dir: "asc" }, limit: 150, selected: new Set(), lastQuery: null });
  const qs = ctx.route.query.toString();
  if (qs !== u.lastQuery) {
    u.lastQuery = qs;
    if (qs) {
      const q = ctx.route.query;
      u.dept = q.get("dept") || "";
      u.stage = q.get("stage") || "";
      u.user = q.get("user") || "";
      u.product = q.get("product") || "";
      u.status = q.get("overdue") === "1" ? "overdue" : q.get("status") || "";
      u.q = "";
      u.selected.clear();
    }
  }
  return u;
}

function statusMatch(t, s) {
  if (!s) return true;
  if (s === "open") return t.open;
  if (s === "overdue") return t.overdue;
  if (s === "flag") return t.systemOverdue;
  if (s === "done") return t.done;
  if (s === "cancelled") return t.cancelled;
  return true;
}

export function render(ctx) {
  const u = uiState(ctx);
  const users = [...new Set(ctx.d.tasks.map((t) => t.user))].sort((a, b) => (a === UNASSIGNED ? -1 : b === UNASSIGNED ? 1 : a.localeCompare(b)));
  const rows = ctx.d.tasks.filter((t) => {
    if (u.dept && t.dept !== u.dept) return false;
    if (u.stage && t.stage !== u.stage) return false;
    if (u.user && t.user !== u.user) return false;
    if (u.product && t.productId !== u.product) return false;
    if (!statusMatch(t, u.status)) return false;
    return matchesQuery(u.q, t.ref, t.title, t.productName, t.code, t.user, t.dept, t.stream, t.stage);
  });
  const update = (patch) => { Object.assign(u, patch, { limit: 150 }); ctx.refresh(); };
  const product = u.product ? ctx.d.productById.get(u.product) : null;

  const columns = [
    { key: "ref", label: "Ref", render: (t) => el("span", { class: "mono nowrap" }, t.ref) },
    { key: "title", label: "Task", render: (t) => el("div", { class: "prod", style: { maxWidth: "240px" } }, el("span", { class: "clip", style: { display: "block" } }, t.title), el("span", { class: "sub" }, t.stream === t.dept ? t.type : `${t.stream} · ${t.type}`)) },
    { key: "productName", label: "Product", render: (t) => el("a", { href: `#/product/${encodeURIComponent(t.productId)}`, class: "nowrap", "data-tip": t.productName }, shortProduct(t.productName)) },
    { key: "state", label: "Status", render: (t) => taskStateChip(t) },
    { key: "due", label: "Due", render: (t) => (t.done ? el("span", { class: "muted nowrap" }, `Closed ${fmtDate(t.closedOn)}`) : dueText(t.due, t.daysToDue)) },
    { key: "user", label: "Assigned", render: (t) => who(t.user) },
    { key: "dept", label: "Dept", render: (t) => el("span", { class: "tag" }, t.dept) },
    { key: "stage", label: "Stage", render: (t) => el("span", { class: "nowrap muted" }, t.stage) },
    { key: "ageing", label: "Age", num: true, render: (t) => (t.ageing ?? "—") },
  ];
  const accessor = (r, key) => (key === "state" ? (r.overdue ? 0 : r.open ? 1 : r.done ? 2 : 3) : key === "due" ? (r.open ? r.due : "") : r[key]);
  const sorted = sortRows(rows, u.sort.key, u.sort.dir, accessor);
  const selectedRows = sorted.filter((t) => u.selected.has(t.id));

  return el("div", { class: "view" },
    product ? el("div", { class: "callout info" }, icon("pill"), el("span", {}, "Showing tasks for ", el("strong", {}, product.name), ". ",
      el("a", { href: `#/product/${encodeURIComponent(product.id)}` }, "Open product"), " · ",
      el("a", { href: "#/tasks", onclick: (e) => { e.preventDefault(); update({ product: "" }); } }, "Show all tasks"))) : null,
    el("div", { class: "toolbar" },
      searchBox(u.q, "Search tasks", "Search ref, task, product, person…", (v) => update({ q: v })),
      select(STATUS_FILTERS, u.status, (v) => update({ status: v }), { label: "Status" }),
      select([["", "All departments"], ...DEPT_IDS], u.dept, (v) => update({ dept: v }), { label: "Department" }),
      select([["", "All stages"], ...TASK_STAGES], u.stage, (v) => update({ stage: v }), { label: "Stage" }),
      select([["", "Anyone"], ...users], u.user, (v) => update({ user: v }), { label: "Assigned user" }),
      el("span", { class: "spacer" }),
      el("span", { class: "result-count" }, `${rows.length} of ${ctx.d.tasks.length} tasks`),
      el("button", { class: "btn", type: "button", onclick: () => exportCsv(sorted) }, icon("download", "sm"), "CSV"),
      el("button", { class: "btn primary", type: "button", onclick: () => ctx.newTask(u.product) }, icon("plus", "sm"), "New task")),
    el("section", { class: "card" }, dataTable(sorted, columns, {
      sort: u.sort,
      onSort: (key) => { u.sort = nextSort(u.sort, key, key === "ageing" ? "desc" : "asc"); ctx.refresh(); },
      onRow: (t) => ctx.openTask(t.id),
      rowClass: (t) => (t.cancelled ? "faint" : ""),
      limit: u.limit,
      onMore: () => { u.limit += 150; ctx.refresh(); },
      selectable: {
        selected: u.selected,
        id: (t) => t.id,
        onToggle: (id, on) => { on ? u.selected.add(id) : u.selected.delete(id); ctx.refresh(); },
        onAll: (on) => { sorted.forEach((t) => (on ? u.selected.add(t.id) : u.selected.delete(t.id))); ctx.refresh(); },
      },
      emptyTitle: "No tasks match",
    })),
    selectedRows.length ? bulkBar(ctx, u, selectedRows, users) : null,
  );
}

function bulkBar(ctx, u, rows, users) {
  const ids = rows.map((t) => t.id);
  let assignee = "";
  let stage = "";
  const done = (msg) => { u.selected.clear(); ctx.undoToast(msg); };
  return el("div", { class: "bulkbar", role: "region", "aria-label": "Bulk actions" },
    el("strong", {}, `${rows.length} selected`),
    el("input", { class: "input sm", list: "bulk-users", placeholder: "Assign to…", style: { width: "180px" }, "aria-label": "Assign selected to", oninput: (e) => { assignee = e.target.value.trim(); } }),
    el("datalist", { id: "bulk-users" }, users.map((n) => el("option", { value: n }))),
    el("button", { class: "btn sm", type: "button", onclick: () => {
      if (!assignee) return ctx.toast("Type a name to assign");
      ctx.store.updateTasks(ids, { user: assignee }, `Reassign ${ids.length} tasks`);
      done(`${ids.length} tasks assigned to ${assignee}`);
    } }, "Assign"),
    select([["", "Set stage…"], ...TASK_STAGES], "", (v) => { stage = v; }, { label: "Set stage", size: "sm" }),
    el("button", { class: "btn sm", type: "button", onclick: () => {
      if (!stage) return ctx.toast("Choose a stage");
      ctx.store.updateTasks(ids, (t) => (stage === "Completed" ? { stage, status: "Completed", closedOn: t.closedOn || nowStamp() } : { stage }), `Move ${ids.length} tasks`);
      done(`${ids.length} tasks moved to ${stage}`);
    } }, "Apply"),
    el("button", { class: "btn sm", type: "button", onclick: () => {
      ctx.store.updateTasks(ids, (t) => (t.status === "Completed" ? {} : { status: "Completed", stage: "Completed", closedOn: nowStamp() }), `Complete ${ids.length} tasks`);
      done(`${ids.length} tasks completed`);
    } }, icon("check", "sm"), "Complete"),
    el("button", { class: "btn sm", type: "button", onclick: () => {
      ctx.store.updateTasks(ids, { status: "Cancelled" }, `Cancel ${ids.length} tasks`);
      done(`${ids.length} tasks cancelled`);
    } }, icon("ban", "sm"), "Cancel tasks"),
    el("button", { class: "btn sm ghost", type: "button", style: { color: "#fff" }, onclick: () => { u.selected.clear(); ctx.refresh(); } }, "Clear"),
  );
}

function exportCsv(rows) {
  const csv = toCsv(rows, [
    { label: "Reference ID", value: (t) => t.ref }, { label: "Product", value: (t) => t.productName }, { label: "Dosage Form", value: (t) => t.form },
    { label: "Department", value: (t) => t.dept }, { label: "Data Stream", value: (t) => t.stream }, { label: "Task Type", value: (t) => t.type },
    { label: "Task Title", value: (t) => t.title }, { label: "Workflow Stage", value: (t) => t.stage }, { label: "Status", value: (t) => t.status },
    { label: "Assigned User", value: (t) => t.user }, { label: "Created", value: (t) => t.created }, { label: "Start", value: (t) => t.start },
    { label: "Due", value: (t) => t.due }, { label: "Closed On", value: (t) => t.closedOn }, { label: "Days to Due", value: (t) => t.daysToDue ?? "" },
    { label: "Overdue?", value: (t) => (t.overdue ? "Yes" : "No") }, { label: "Ageing (days)", value: (t) => t.ageing ?? "" },
  ]);
  download("APQR-tasks.csv", `﻿${csv}`, "text/csv");
}
