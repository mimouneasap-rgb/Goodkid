// Register views: APQR tracker, plan, task register and the data/settings page.
import { html, raw, esc, icon, fmtN, fmtPct, fmtDate, fmtMonth, fmtDays, ragPill, trackingPill, movementBadge, tip, RAG_META, debounce, download } from "./ui.js";
import { deptCells, progressBar, deptColor } from "./charts.js";
import { DEPARTMENTS, DEPT_SHORT, monthLabel, CLASSES } from "./engine.js";
import * as store from "./store.js";
import * as act from "./actions.js";

const RAG_COLOR = { COMPLETE: "var(--good)", "ON TRACK": "var(--info)", "DUE SOON": "var(--warn)", OVERDUE: "var(--crit)" };
const RAG_RANK = { OVERDUE: 0, "DUE SOON": 1, "ON TRACK": 2, COMPLETE: 3, "No tasks": 4 };
const cmp = (a, b) => (a === b ? 0 : a === null || a === undefined || a === "" ? 1 : b === null || b === undefined || b === "" ? -1 : a > b ? 1 : -1);
const opt = (v, label, sel) => `<option value="${esc(v)}"${String(v) === String(sel) ? " selected" : ""}>${esc(label)}</option>`;

function csv(rows) {
  return new Blob(["﻿" + rows.map((r) => r.map((c) => { const s = String(c ?? ""); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(",")).join("\r\n")], { type: "text/csv" });
}

/* ================================================================ tracker */

const tv = { q: "", rag: "", month: "", form: "", bottleneck: "", flag: "", sort: "rag", dir: 1 };
function trackerRows(m) {
  const q = tv.q.toLowerCase();
  let rows = m.products.filter((p) => {
    if (tv.rag && p.rag !== tv.rag) return false;
    if (tv.month && p.plannedMonth !== tv.month) return false;
    if (tv.form && p.dosageForm !== tv.form) return false;
    if (tv.bottleneck && p.bottleneck !== tv.bottleneck) return false;
    if (tv.flag === "DUPLICATE" && !p.flags.includes("DUPLICATE")) return false;
    if (tv.flag === "CLOSED" && !p.flags.includes("CLOSED w/ OPEN")) return false;
    if (tv.flag === "NEW" && !p.isNew) return false;
    if (tv.flag === "COMMENTS" && !p.comments) return false;
    if (tv.flag === "OFFPLAN" && p.inPlan) return false;
    if (tv.flag === "OVERDUE_TASKS" && !p.overdue) return false;
    if (tv.flag === "PRIORITY" && !p.priority) return false;
    if (q && !(`${p.product} ${p.ref} ${p.owner} ${p.workflowRefs.join(" ")} ${p.qcRefs.join(" ")} ${p.comments}`.toLowerCase().includes(q))) return false;
    return true;
  });
  const key = tv.sort;
  rows.sort((a, b) => {
    let r;
    if (key === "rag") r = RAG_RANK[a.rag] - RAG_RANK[b.rag] || cmp(a.daysToOverdue, b.daysToOverdue);
    else r = cmp(a[key], b[key]);
    return r * tv.dir || a.product.localeCompare(b.product);
  });
  return rows;
}

export const tracker = {
  id: "tracker",
  title: "APQR tracker",
  sub: (m) => `${fmtN(m.products.length)} products with a live Scigeniq workflow · % complete counts data-collection annexes only`,
  params(p) {
    if (Object.keys(p).length) Object.assign(tv, { rag: "", month: "", form: "", bottleneck: "", flag: "", q: "" }, p);
  },
  render(m) {
    const months = [...new Set(m.products.map((p) => p.plannedMonth).filter(Boolean))].sort();
    const forms = [...new Set(m.products.map((p) => p.dosageForm).filter(Boolean))].sort();
    return `
    <div class="toolbar">
      <label class="field search-f">${icon("search")}<input data-tv="q" type="search" placeholder="Filter products, refs, notes…" value="${esc(tv.q)}"></label>
      <div class="chips">${["", "OVERDUE", "DUE SOON", "ON TRACK", "COMPLETE"].map((r) => `<button type="button" class="chipf ${tv.rag === r ? "on" : ""}" data-tv-rag="${r}">${r ? `<i style="background:${RAG_COLOR[r]}"></i>${RAG_META[r].label}` : "All"}<b>${fmtN(r ? m.ragCounts[r] : m.products.length)}</b></button>`).join("")}</div>
    </div>
    <div class="toolbar">
      <label class="field">${icon("plan")}<select data-tv="month" aria-label="Planned month">${opt("", "All planned months", tv.month)}${months.map((x) => opt(x, fmtMonth(x), tv.month)).join("")}</select></label>
      <label class="field"><select data-tv="form" aria-label="Dosage form">${opt("", "All dosage forms", tv.form)}${forms.map((x) => opt(x, x, tv.form)).join("")}</select></label>
      <label class="field"><select data-tv="bottleneck" aria-label="Bottleneck">${opt("", "Any bottleneck", tv.bottleneck)}${[...DEPARTMENTS, "several"].map((x) => opt(x, x === "several" ? "Several departments" : `${x} bottleneck`, tv.bottleneck)).join("")}</select></label>
      <label class="field">${icon("filter")}<select data-tv="flag" aria-label="Flag">${[["", "No flag filter"], ["OVERDUE_TASKS", "Has overdue annexes"], ["DUPLICATE", "Duplicate workflows"], ["CLOSED", "Closed with open annexes"], ["NEW", "New since baseline"], ["COMMENTS", "Has QA comments"], ["PRIORITY", "Has priority"], ["OFFPLAN", "Not in plan"]].map(([v, l]) => opt(v, l, tv.flag)).join("")}</select></label>
      <span class="grow"></span>
      <button class="btn btn-sm" data-tv-export>${icon("download")}CSV</button>
    </div>
    <section class="card table-card" data-region="table">${this.table(m)}</section>`;
  },
  table(m) {
    const rows = trackerRows(m);
    const th = (key, label, cls = "") => `<th data-sort="${key}" class="${cls} ${tv.sort === key ? "sorted" + (tv.dir > 0 ? " asc" : "") : ""}">${label}</th>`;
    return `<div class="table-wrap"><table class="data"><thead><tr>
      ${th("ref", "Ref")}${th("product", "Product")}${th("rag", "RAG")}${th("pct", "Progress")}<th class="c" title="Movement since baseline">Δ</th>${th("open", "Open", "r")}${th("overdue", "Late", "r")}
      <th><div class="dhead">${DEPARTMENTS.map((d) => `<span title="${d}">${DEPT_SHORT[d]}</span>`).join("")}</div></th>${th("bottleneck", "Bottleneck")}${th("plannedMonth", "Planned")}${th("daysToOverdue", "PQR due")}<th class="c" title="QA comments">✎</th>
    </tr></thead><tbody>
    ${rows.map((p) => `<tr data-key="${esc(p.key)}">
      <td class="mono" style="white-space:nowrap">${esc(p.ref)}</td>
      <td class="prod"><b title="${esc(p.product)}">${esc(p.product)}</b><small>${esc(p.dosageForm)}<span>·</span>${esc(p.owner)}${p.flags.map((f) => `<span class="tag ${f === "DUPLICATE" ? "warn" : "crit"}">${f}</span>`).join("")}${p.priority ? `<span class="tag crit">${esc(p.priority)}</span>` : ""}${!p.inPlan ? '<span class="tag info">NOT IN PLAN</span>' : ""}</small></td>
      <td>${ragPill(p.rag)}</td>
      <td><div class="pct-cell"><b>${fmtPct(p.pct)}</b>${progressBar(p.pct, { tone: p.rag === "COMPLETE" ? "complete" : p.rag === "OVERDUE" ? "overdue" : p.rag === "DUE SOON" ? "duesoon" : "" })}<small class="muted num" style="white-space:nowrap">${p.completed}/${p.dataTasks}</small></div></td>
      <td class="c">${movementBadge(p.movement)}</td>
      <td class="r num">${fmtN(p.open)}</td>
      <td class="r num" style="${p.overdue ? "color:var(--crit-ink);font-weight:800" : "color:var(--faint)"}">${fmtN(p.overdue)}</td>
      <td>${deptCells(p.openByDept, DEPARTMENTS)}</td>
      <td>${p.bottleneck === "-" ? '<span class="muted">–</span>' : p.bottleneck === "several" ? '<span class="muted">several</span>' : `<span style="display:inline-flex;align-items:center;gap:6px;font-weight:700"><i style="width:8px;height:8px;border-radius:50%;background:${deptColor(p.bottleneck)}"></i>${esc(p.bottleneck)}</span>`}</td>
      <td style="white-space:nowrap">${p.plannedMonth ? monthLabel(p.plannedMonth) : "–"}</td>
      <td style="white-space:nowrap">${p.overdueDate ? `${fmtDate(p.overdueDate)}<br><small class="muted">${p.rag === "COMPLETE" ? "done" : fmtDays(p.daysToOverdue)}</small>` : '<span class="muted">–</span>'}</td>
      <td class="c">${p.comments ? `<span class="comment-dot" data-tip="${tip("QA comments", [[p.comments.slice(0, 120), ""]])}"></span>` : ""}</td>
    </tr>`).join("") || `<tr><td colspan="12" class="empty-row">No products match these filters.</td></tr>`}
    </tbody></table></div>
    <div class="table-foot"><span>Showing <b>${fmtN(rows.length)}</b> of ${fmtN(m.products.length)} products</span><span class="grow"></span><span>Click a row for the product file: annexes, timeline, comments and history.</span></div>`;
  },
  bind(root, rerender) {
    const region = () => { const r = root.querySelector('[data-region="table"]'); if (r) r.innerHTML = this.table(store.getModel()); };
    root.querySelector('[data-tv="q"]').addEventListener("input", debounce((e) => { tv.q = e.target.value; region(); }, 120));
    root.querySelectorAll("select[data-tv]").forEach((s) => s.addEventListener("change", () => { tv[s.dataset.tv] = s.value; region(); }));
    root.querySelectorAll("[data-tv-rag]").forEach((b) => b.addEventListener("click", () => { tv.rag = b.dataset.tvRag; rerender(); }));
    root.addEventListener("click", (e) => {
      const th = e.target.closest("th[data-sort]");
      if (th && root.contains(th)) { const k = th.dataset.sort; tv.dir = tv.sort === k ? -tv.dir : k === "pct" || k === "open" || k === "overdue" ? -1 : 1; tv.sort = k; region(); }
    });
    root.querySelector("[data-tv-export]").addEventListener("click", () => {
      const rows = trackerRows(store.getModel());
      download(csv([["APQR Ref", "Product", "Dosage form", "Owner", "Planned PQR month", "Data tasks", "Completed", "Open", "Overdue", "% complete", "Prev %", "Movement", "RAG", "Bottleneck", ...DEPARTMENTS.map((d) => `Open ${d}`), "PQR overdue date", "Days to overdue", "Flags", "Priority", "QA comments"], ...rows.map((p) => [p.ref, p.product, p.dosageForm, p.owner, monthLabel(p.plannedMonth), p.dataTasks, p.completed, p.open, p.overdue, (p.pct * 100).toFixed(1) + "%", p.prevPct === null ? "" : (p.prevPct * 100).toFixed(1) + "%", p.movement, p.rag, p.bottleneck, ...DEPARTMENTS.map((d) => p.openByDept[d]), p.overdueDate, p.daysToOverdue ?? "", p.flags.join(" "), p.priority, p.comments])]), "APQR_tracker_view.csv");
    });
  },
};

/* ================================================================ plan */

const pv = { q: "", tracking: "", form: "" };
export const plan = {
  id: "plan",
  title: "APQR plan",
  sub: (m) => `${fmtN(m.plan.length)} approved products · execution against plan, grouped by planned PQR month`,
  params(p) { if (Object.keys(p).length) Object.assign(pv, { q: "", tracking: "", form: "" }, p); },
  render(m) {
    const forms = [...new Set(m.plan.map((p) => p.process).filter(Boolean))].sort();
    const statuses = ["NOT", "NOT TRIGGERED - past due", "NOT TRIGGERED - due soon", "Not yet triggered", "In progress", "OVERDUE - in progress", "Data collection complete"];
    return `
    <div class="toolbar">
      <label class="field search-f">${icon("search")}<input data-pv="q" type="search" placeholder="Filter planned products…" value="${esc(pv.q)}"></label>
      <label class="field"><select data-pv="tracking" aria-label="Tracking status">${opt("", "All tracking statuses", pv.tracking)}${statuses.map((x) => opt(x, x === "NOT" ? "Not triggered (any)" : x, pv.tracking)).join("")}</select></label>
      <label class="field"><select data-pv="form" aria-label="Process">${opt("", "All processes", pv.form)}${forms.map((x) => opt(x, x, pv.form)).join("")}</select></label>
      <span class="grow"></span>
      <button class="btn btn-sm btn-primary" data-plan-add>${icon("plus")}Add product</button>
    </div>
    <section class="card table-card" data-region="table">${this.table(m)}</section>`;
  },
  table(m) {
    const q = pv.q.toLowerCase();
    const rows = m.plan.filter((p) => (!q || p.product.toLowerCase().includes(q)) && (!pv.form || p.process === pv.form) && (!pv.tracking || (pv.tracking === "NOT" ? !p.triggered : p.tracking === pv.tracking)));
    const groups = new Map();
    for (const p of rows) { const k = p.plannedMonth || "none"; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(p); }
    const keys = [...groups.keys()].sort();
    return `<div class="table-wrap"><table class="data"><thead><tr><th>#</th><th>Product</th><th>Process</th><th>Review period</th><th>Workflow</th><th>Progress</th><th>PQR overdue</th><th>Tracking</th><th></th></tr></thead><tbody>
    ${keys.map((k) => {
      const list = groups.get(k).sort((a, b) => a.product.localeCompare(b.product));
      const mo = m.months.find((x) => x.month === k);
      return `<tr class="group"><td colspan="9">${k === "none" ? "No review end date" : fmtMonth(k)}<span class="muted">${list.length} shown · ${mo ? `${mo.triggered}/${mo.planned} triggered · ${mo.annexes ? fmtPct(mo.pct) + " annexes done" : "no annexes"}` : ""}</span>${mo ? `<span style="float:right">${trackingPill(mo.status)}</span>` : ""}</td></tr>` +
        list.map((p) => `<tr ${p.triggered ? `data-key="${esc(p.key)}"` : `data-plan-id="${esc(p.id)}" style="cursor:pointer"`}>
          <td class="muted num">${esc(p.no)}</td>
          <td class="prod"><b title="${esc(p.product)}">${esc(p.product)}</b><small>${esc(p.site)}${p.planStatus !== "Approved" ? ` · <span class="tag">${esc(p.planStatus)}</span>` : ""}</small></td>
          <td>${esc(p.process)}</td>
          <td style="white-space:nowrap">${esc(p.reviewStart || "?")} → ${esc(p.reviewEnd || "?")}</td>
          <td>${p.triggered ? `<span class="tag info">${icon("check", "")}LIVE</span>` : '<span class="tag">NOT TRIGGERED</span>'}</td>
          <td><div class="pct-cell" style="min-width:130px"><b>${p.triggered ? fmtPct(p.pct) : "–"}</b>${progressBar(p.pct, { tone: p.pct === 1 ? "complete" : "" })}</div></td>
          <td style="white-space:nowrap">${fmtDate(p.overdueDate)}<br><small class="muted">${p.tracking === "Data collection complete" ? "done" : fmtDays(p.daysToOverdue)}</small></td>
          <td>${trackingPill(p.tracking)}</td>
          <td><button class="icon-btn sm" data-plan-edit="${esc(p.id)}" aria-label="Edit ${esc(p.product)}">${icon("edit")}</button></td>
        </tr>`).join("");
    }).join("") || `<tr><td colspan="9" class="empty-row">${m.plan.length ? "No planned products match." : "The plan is empty. Import the master tracker or a plan sheet, or add products here."}</td></tr>`}
    </tbody></table></div><div class="table-foot"><span>${fmtN(rows.length)} of ${fmtN(m.plan.length)} planned products</span><span class="grow"></span><span>Planned PQR month = the month after the review period ends · overdue ${m.settings.overdueMonths} months after its 1st day</span></div>`;
  },
  bind(root) {
    const region = () => { root.querySelector('[data-region="table"]').innerHTML = this.table(store.getModel()); };
    root.querySelector('[data-pv="q"]').addEventListener("input", debounce((e) => { pv.q = e.target.value; region(); }, 120));
    root.querySelectorAll("select[data-pv]").forEach((s) => s.addEventListener("change", () => { pv[s.dataset.pv] = s.value; region(); }));
    root.querySelector("[data-plan-add]").addEventListener("click", () => act.editPlan(null));
    root.addEventListener("click", (e) => {
      const ed = e.target.closest("[data-plan-edit]");
      const row = e.target.closest("[data-plan-id]");
      const id = ed?.dataset.planEdit || row?.dataset.planId;
      if (id) { e.stopPropagation(); act.editPlan(store.getState().plan.find((p) => p.id === id)); }
    }, true);
  },
};

/* ================================================================ tasks */

const PAGE = 100;
const tk = { q: "", cls: "Data Collection", dept: "", stage: "", closure: "", overdue: "", assignee: "", month: "", product: "", page: 0, sort: "created", dir: -1 };
function taskRows(m) {
  const q = tk.q.toLowerCase();
  const rows = m.tasks.filter((t) => {
    if (tk.cls && t.taskClass !== tk.cls) return false;
    if (tk.dept && t.dept !== tk.dept) return false;
    if (tk.stage && t.stage !== tk.stage) return false;
    if (tk.closure === "open" && t.closed) return false;
    if (tk.closure === "closed" && !t.closed) return false;
    if (tk.overdue && t.overdue !== "YES") return false;
    if (tk.assignee && t.assignee !== tk.assignee) return false;
    if (tk.month && t.plannedMonth !== tk.month) return false;
    if (tk.product && t.key !== tk.product) return false;
    if (q && !`${t.ref} ${t.product} ${t.title} ${t.assignee} ${t.stage}`.toLowerCase().includes(q)) return false;
    return true;
  });
  rows.sort((a, b) => cmp(a[tk.sort], b[tk.sort]) * tk.dir || a.ref.localeCompare(b.ref));
  return rows;
}

export const tasks = {
  id: "tasks",
  title: "Task register",
  sub: (m) => `${fmtN(m.tasks.length)} Scigeniq tasks · “Due” is the parent APQR’s PQR overdue date`,
  params(p) {
    if (!Object.keys(p).length) return;
    Object.assign(tk, { q: "", cls: "Data Collection", dept: "", stage: "", closure: "", overdue: "", assignee: "", month: "", product: "", page: 0 }, p);
    if (p.cls === "all") tk.cls = "";
  },
  render(m) {
    const stages = [...new Set(m.tasks.map((t) => t.stage).filter(Boolean))].sort();
    const months = [...new Set(m.tasks.map((t) => t.plannedMonth).filter(Boolean))].sort();
    const prodName = tk.product ? m.productByKey.get(tk.product)?.product : "";
    return `
    <div class="toolbar">
      <label class="field search-f">${icon("search")}<input data-tk="q" type="search" placeholder="Filter refs, products, titles, people…" value="${esc(tk.q)}"></label>
      <div class="seg-toggle">${[["Data Collection", "Annexes"], ["Approval", "Approvals"], ["Workflow", "Workflows"], ["", "All"]].map(([v, l]) => `<button type="button" class="${tk.cls === v ? "on" : ""}" data-tk-cls="${v}">${l}</button>`).join("")}</div>
      <span class="grow"></span>
      <button class="btn btn-sm" data-tk-export>${icon("download")}CSV</button>
      <button class="btn btn-sm btn-primary" data-tk-add>${icon("plus")}Add task</button>
    </div>
    <div class="toolbar">
      <label class="field"><select data-tk="closure" aria-label="Open or closed">${opt("", "Open & closed", tk.closure)}${opt("open", "Open only", tk.closure)}${opt("closed", "Closed only", tk.closure)}</select></label>
      <label class="field"><select data-tk="overdue" aria-label="Overdue">${opt("", "Any due state", tk.overdue)}${opt("1", "Overdue vs PQR date", tk.overdue)}</select></label>
      <label class="field"><select data-tk="dept" aria-label="Department">${opt("", "All departments", tk.dept)}${DEPARTMENTS.map((d) => opt(d, d, tk.dept)).join("")}</select></label>
      <label class="field"><select data-tk="stage" aria-label="Stage">${opt("", "All stages", tk.stage)}${stages.map((s) => opt(s, s, tk.stage)).join("")}</select></label>
      <label class="field"><select data-tk="assignee" aria-label="Assigned user">${opt("", "Everyone", tk.assignee)}${m.owners.map((u) => opt(u, u, tk.assignee)).join("")}</select></label>
      <label class="field"><select data-tk="month" aria-label="Planned month">${opt("", "All planned months", tk.month)}${months.map((x) => opt(x, fmtMonth(x), tk.month)).join("")}</select></label>
      ${prodName ? `<button type="button" class="chipf on" data-tk-clear-product title="Clear product filter">${esc(prodName.slice(0, 40))} ✕</button>` : ""}
    </div>
    <section class="card table-card" data-region="table">${this.table(m)}</section>
    <datalist id="dl-owners">${m.owners.map((u) => `<option value="${esc(u)}">`).join("")}</datalist>`;
  },
  table(m) {
    const rows = taskRows(m);
    const pages = Math.max(1, Math.ceil(rows.length / PAGE));
    tk.page = Math.min(tk.page, pages - 1);
    const view = rows.slice(tk.page * PAGE, tk.page * PAGE + PAGE);
    const th = (key, label, cls = "") => `<th data-sort="${key}" class="${cls} ${tk.sort === key ? "sorted" + (tk.dir > 0 ? " asc" : "") : ""}">${label}</th>`;
    return `<div class="table-wrap"><table class="data"><thead><tr>${th("ref", "Ref")}${th("product", "Product")}${th("dept", "Dept")}${th("title", "Title")}${th("stage", "Stage")}${th("assignee", "Assigned")}${th("created", "Created")}${th("closedOn", "Closed")}${th("due", "Due (PQR)")}${th("ageing", "Age", "r")}<th></th></tr></thead><tbody>
    ${view.map((t) => `<tr data-task-row="${esc(t.id)}">
      <td class="mono" style="white-space:nowrap">${esc(t.ref)}</td>
      <td class="prod"><b title="${esc(t.product)}" style="max-width:240px">${esc(t.product)}</b></td>
      <td style="white-space:nowrap">${t.dept && DEPARTMENTS.includes(t.dept) ? `<span style="display:inline-flex;align-items:center;gap:6px"><i style="width:8px;height:8px;border-radius:50%;background:${deptColor(t.dept)}"></i>${esc(t.dept)}</span>` : esc(t.dept || t.department)}</td>
      <td style="max-width:230px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${esc(t.title)}">${esc(t.title)}</td>
      <td>${act.stageSelect(t, "inline")}</td>
      <td><input class="inline" data-task-assignee="${esc(t.id)}" list="dl-owners" value="${esc(t.assignee)}" aria-label="Assigned user" style="${t.assignee === "Unassigned" ? "color:var(--muted)" : ""}"></td>
      <td style="white-space:nowrap">${fmtDate(t.created)}</td>
      <td style="white-space:nowrap">${t.closed ? fmtDate(t.closedOn) : '<span class="muted">open</span>'}</td>
      <td style="white-space:nowrap">${t.due ? fmtDate(t.due) : "–"}${t.overdue === "YES" ? ' <span class="tag crit">LATE</span>' : ""}</td>
      <td class="r num">${t.ageing ?? "–"}</td>
      <td><button class="icon-btn sm" data-task-edit="${esc(t.id)}" aria-label="Edit task">${icon("edit")}</button></td>
    </tr>`).join("") || `<tr><td colspan="11" class="empty-row">No tasks match these filters.</td></tr>`}
    </tbody></table></div>
    <div class="table-foot"><span><b>${fmtN(rows.length)}</b> tasks${rows.length > PAGE ? ` · page ${tk.page + 1} of ${pages}` : ""}</span><span class="grow"></span>
      ${rows.length > PAGE ? `<button class="btn btn-sm" data-tk-page="-1" ${tk.page === 0 ? "disabled" : ""}>Previous</button><button class="btn btn-sm" data-tk-page="1" ${tk.page >= pages - 1 ? "disabled" : ""}>Next</button>` : ""}</div>`;
  },
  bind(root, rerender) {
    const region = () => { root.querySelector('[data-region="table"]').innerHTML = this.table(store.getModel()); };
    root.querySelector('[data-tk="q"]').addEventListener("input", debounce((e) => { tk.q = e.target.value; tk.page = 0; region(); }, 120));
    root.querySelectorAll("select[data-tk]").forEach((s) => s.addEventListener("change", () => { tk[s.dataset.tk] = s.value; tk.page = 0; region(); }));
    root.querySelectorAll("[data-tk-cls]").forEach((b) => b.addEventListener("click", () => { tk.cls = b.dataset.tkCls; tk.page = 0; rerender(); }));
    root.querySelector("[data-tk-add]").addEventListener("click", () => act.editTask(null, tk.product ? { product: store.getModel().productByKey.get(tk.product)?.product || "" } : {}));
    root.querySelector("[data-tk-clear-product]")?.addEventListener("click", () => { tk.product = ""; rerender(); });
    root.querySelector("[data-tk-export]").addEventListener("click", () => {
      const rows = taskRows(store.getModel());
      download(csv([["Reference ID", "Product", "Department", "Task class", "Title", "Stage", "Status", "Assigned user", "Created", "Closed on", "Closure", "Due (parent APQR)", "Overdue?", "Ageing (days)", "Planned PQR month"], ...rows.map((t) => [t.ref, t.product, t.dept, t.taskClass, t.title, t.stage, t.status, t.assignee, t.created, t.closedOn, t.closure, t.due, t.overdue, t.ageing ?? "", t.plannedMonth])]), "APQR_tasks_view.csv");
    });
    root.addEventListener("click", (e) => {
      const th = e.target.closest("th[data-sort]");
      if (th) { const k = th.dataset.sort; tk.dir = tk.sort === k ? -tk.dir : k === "created" || k === "ageing" ? -1 : 1; tk.sort = k; region(); return; }
      const pg = e.target.closest("[data-tk-page]");
      if (pg) { tk.page += +pg.dataset.tkPage; region(); root.querySelector(".table-wrap").scrollTop = 0; return; }
      const ed = e.target.closest("[data-task-edit]");
      if (ed) { act.editTask(store.getState().tasks.find((t) => t.id === ed.dataset.taskEdit)); return; }
    });
    root.addEventListener("dblclick", (e) => {
      const row = e.target.closest("[data-task-row]");
      if (row && !e.target.closest("select,input,button")) act.editTask(store.getState().tasks.find((t) => t.id === row.dataset.taskRow));
    });
  },
};

/* ================================================================ data */

export const data = {
  id: "data",
  title: "Data & settings",
  sub: () => "Import, export, baseline, settings and audit trail. Data is stored in this browser only.",
  render(m) {
    const s = store.getState();
    const bl = s.baseline;
    return `
    <div class="grid g-12">
      <section class="span-12 reveal">
        <div class="dropzone" data-action="import" role="button" tabindex="0">
          <div class="dz-ic">${icon("upload")}</div>
          <h3>Drop a file here, or click to browse</h3>
          <p>The app recognises the file type and shows a preview before anything changes. Re-importing the same kind of file refreshes the data; your comments, baseline and audit trail are kept.</p>
          <div class="formats"><span class="tag info">APQR master tracker .xlsx</span><span class="tag info">Scigeniq eQMS export .xlsx / .csv</span><span class="tag info">Plan sheet .xlsx</span><span class="tag info">App backup .json</span></div>
        </div>
      </section>
      <section class="card span-12 reveal">
        <div class="source-tiles">
          <div class="source-tile"><b>${icon("tracker")}APQR master tracker</b><p>The workbook with “APQR Plan”, “Task Register”, “APQR Tracker” and “Dashboard” sheets, including files exported from this app. Brings in the plan, every task, QA comments, the previous-extract baseline and the report-date inputs.</p></div>
          <div class="source-tile"><b>${icon("data")}Scigeniq all-tasks export</b><p>One row per task (Reference ID, Type, Stage, Status, Title, Parent action, Assigned user, dates). Products come from the parent action; CM tasks map to Compliance; approvals and the parent workflow are counted separately; non-APQR rows are set aside. Use it for the monthly refresh.</p></div>
          <div class="source-tile"><b>${icon("plan")}APQR plan</b><p>A sheet with Product, Process, Review Start and Review End. The planned PQR month and the overdue date are derived from the review end.</p></div>
        </div>
      </section>

      <section class="card span-6 reveal">
        <div class="card-h"><div><h3>Export</h3><p>Take the tracker to Excel, a backup or a printed review</p></div></div>
        <div style="display:grid;gap:10px">
          <button class="btn" data-action="export-xlsx" style="justify-content:flex-start;white-space:normal;height:auto;min-height:40px;padding:9px 14px;text-align:left">${icon("download")}Excel workbook (.xlsx): Dashboard, Tracker, Plan, Task Register, Workload, Annexes, Audit Trail</button>
          <button class="btn" data-action="export-json" style="justify-content:flex-start;white-space:normal;height:auto;min-height:40px;padding:9px 14px;text-align:left">${icon("download")}Full backup (.json), to restore later or move to another computer</button>
          ${window.claude ? "" : `<button class="btn" data-action="print" style="justify-content:flex-start">${icon("print")}Print / save the current page as PDF</button>`}
        </div>
        <p class="muted" style="font-size:12px;margin:14px 0 0">Source: <b>${esc(s.meta.source || "none")}</b>${s.meta.importedAt ? ` · imported ${fmtDate(s.meta.importedAt.slice(0, 10))}` : ""}</p>
      </section>

      <section class="card span-6 reveal">
        <div class="card-h"><div><h3>Comparison baseline</h3><p>The figures the movement block and per-product Δ compare against</p></div></div>
        ${bl ? `<div class="stat-grid" style="margin-bottom:14px"><div class="stat"><div class="k">Baseline</div><div class="v" style="font-size:17px">${esc(bl.label)}</div></div><div class="stat"><div class="k">Products with previous %</div><div class="v">${fmtN(Object.keys(bl.prevPct || {}).length)}</div></div><div class="stat"><div class="k">Annexes then</div><div class="v">${bl.metrics?.dataTasks === undefined ? "–" : fmtN(bl.metrics.dataTasks)}</div></div></div>` : '<p class="muted" style="margin-top:0">No baseline set.</p>'}
        <form class="toolbar" data-baseline-form style="margin:0">
          <label class="field" style="flex:1">Label<input name="label" value="${esc(fmtDate(m.report))}" style="flex:1"></label>
          <button class="btn btn-sm btn-primary">${icon("history")}Save current figures as baseline</button>
          ${bl ? `<button type="button" class="btn btn-sm btn-ghost" data-baseline-clear>Clear</button>` : ""}
        </form>
        <p class="muted" style="font-size:12px;margin:10px 0 0">Tip: when you import a new Scigeniq export, tick “save the current figures as the baseline first”. Each refresh then shows what moved since the previous extract.</p>
      </section>

      <section class="card span-6 reveal">
        <div class="card-h"><div><h3>Programme & rules</h3><p>Shown in the header and used by every calculation</p></div></div>
        <form class="form-grid" data-settings-form>
          <label class="f full">Programme name<input name="programme" value="${esc(s.meta.programme)}"></label>
          <label class="f">Organisation / site<input name="organisation" value="${esc(s.meta.organisation)}"></label>
          <label class="f">Plan reference<input name="planRef" value="${esc(s.meta.planRef)}" placeholder="PQRP-KE-1"></label>
          <label class="f">Your name (for the audit trail)<input name="user" value="${esc(s.meta.user)}" placeholder="e.g. QA reviewer"></label>
          <label class="f">Report date<input type="date" name="reportDate" value="${esc(s.settings.reportDate)}" ${s.settings.useToday ? "disabled" : ""}></label>
          <label class="f check full"><input type="checkbox" name="useToday" ${s.settings.useToday ? "checked" : ""}> Always use today’s date as the report date</label>
          <label class="f">PQR overdue after (months)<input type="number" min="0" max="24" name="overdueMonths" value="${s.settings.overdueMonths}"><small>From the 1st of the planned PQR month</small></label>
          <label class="f">“Due soon” threshold (days)<input type="number" min="0" max="365" name="dueSoonDays" value="${s.settings.dueSoonDays}"></label>
          <label class="f">“Not triggered – due soon” window (days)<input type="number" min="0" max="365" name="triggerWindowDays" value="${s.settings.triggerWindowDays}"></label>
          <div class="full" style="display:flex;justify-content:flex-end"><button class="btn btn-primary btn-sm">${icon("check")}Save settings</button></div>
        </form>
      </section>

      <section class="card span-6 reveal">
        <div class="card-h"><div><h3>Audit trail</h3><p>Every change made in the app: who, when, what (latest 60)</p></div><div class="tools"><span class="tag">${fmtN(s.audit.length)}</span></div></div>
        <div class="audit-list" style="max-height:420px;overflow:auto">${s.audit.slice(0, 60).map((a) => `<div class="a"><time>${esc(a.at.slice(0, 16).replace("T", " "))}</time><div><b>${esc(a.user)}</b> · ${esc(a.entity)} <span class="muted">${esc(a.label || "")}</span><br>${esc(a.field || "")}: <s>${esc(String(a.from ?? "").slice(0, 80))}</s> → <b>${esc(String(a.to ?? "").slice(0, 120))}</b></div></div>`).join("") || '<p class="muted">No changes recorded yet.</p>'}</div>
      </section>

      <section class="card span-12 reveal">
        <div class="card-h"><div><h3>Demo & reset</h3><p>Data lives only in this browser (local storage). Export a backup regularly.</p></div></div>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          ${store.hasSeed() ? `<button class="btn" data-action="reset-seed">${icon("undo")}Reset to the published data</button>` : ""}
          <button class="btn" data-action="demo">${icon("sparkle")}Load demo programme</button>
          <button class="btn btn-ghost" data-action="clear" style="color:var(--crit-ink)">${icon("trash")}Clear all data</button>
        </div>
        <p class="muted" style="font-size:12px;margin:14px 0 0">For GxP records, Scigeniq remains the system of record. This tracker is a monitoring tool: it doesn’t provide user authentication or electronic signatures (21 CFR Part 11 / EU Annex 11).</p>
      </section>
    </div>`;
  },
  bind(root) {
    const sf = root.querySelector("[data-settings-form]");
    sf.useToday.addEventListener("change", () => { sf.reportDate.disabled = sf.useToday.checked; });
    sf.addEventListener("submit", (e) => {
      e.preventDefault();
      const f = new FormData(sf);
      act.saveMeta({ programme: String(f.get("programme") || "").trim() || "APQR Master Tracker", organisation: String(f.get("organisation") || "").trim(), planRef: String(f.get("planRef") || "").trim(), user: String(f.get("user") || "").trim() });
      act.saveSettings({ useToday: !!f.get("useToday"), reportDate: String(f.get("reportDate") || store.getState().settings.reportDate), overdueMonths: +f.get("overdueMonths"), dueSoonDays: +f.get("dueSoonDays"), triggerWindowDays: +f.get("triggerWindowDays") });
    });
    root.querySelector("[data-baseline-form]").addEventListener("submit", (e) => { e.preventDefault(); act.takeBaseline(new FormData(e.target).get("label")); });
    root.querySelector("[data-baseline-clear]")?.addEventListener("click", () => act.clearBaseline());
    root.querySelector(".dropzone").addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); act.pickFile(); } });
  },
};
