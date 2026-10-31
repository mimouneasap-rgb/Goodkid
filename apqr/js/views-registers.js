// Register views: APQR tracker, plan, task register, follow-up actions and
// the data/settings page.
import { esc, icon, fmtN, fmtPct, fmtDate, fmtMonth, fmtDays, ragPill, fqPill, trackingPill, movementBadge, tip, RAG_META, FQ_META, debounce, download } from "./ui.js";
import { progressBar, deptColor, slotCells, slotHead } from "./charts.js";
import { DEPARTMENTS, SLOTS, ROLES, FINAL_QA_SIGNALS, WORKFLOW_STAGES, monthLabel } from "./engine.js";
import * as store from "./store.js";
import * as act from "./actions.js";
import { RAG_COLOR, FQ_COLOR } from "./views-overview.js";
import { teamStatus, inViewer, canRebuild } from "./team.js";

const RAG_RANK = { OVERDUE: 0, "NOT STARTED - overdue": 1, "DUE SOON": 2, "ON TRACK": 3, COMPLETE: 4, "Not yet due": 5, "No tasks": 6 };
const cmp = (a, b) => (a === b ? 0 : a === null || a === undefined || a === "" ? 1 : b === null || b === undefined || b === "" ? -1 : a > b ? 1 : -1);
const opt = (v, label, sel) => `<option value="${esc(v)}"${String(v) === String(sel) ? " selected" : ""}>${esc(label)}</option>`;

export function csv(rows) {
  return new Blob(["﻿" + rows.map((r) => r.map((c) => { const s = String(c ?? ""); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(",")).join("\r\n")], { type: "text/csv" });
}

/* ================================================================ tracker */

const TV0 = { q: "", rag: "", month: "", form: "", fq: "", trig: "", slot: "", slotState: "", stage: "", flag: "" };
const tv = { ...TV0, sort: "rag", dir: 1 };
function trackerRows(m) {
  const q = tv.q.toLowerCase();
  const rows = m.products.filter((p) => {
    if (tv.rag && p.rag !== tv.rag) return false;
    if (tv.month && p.plannedMonth !== tv.month) return false;
    if (tv.form && p.dosageForm !== tv.form) return false;
    if (tv.fq && p.fqSignal !== tv.fq) return false;
    if (tv.trig === "yes" && !p.triggered) return false;
    if (tv.trig === "no" && p.triggered) return false;
    if (tv.stage && p.wfStage !== tv.stage) return false;
    if (tv.slot) {
      const st = p.slots[tv.slot]?.status;
      if (!p.triggered) return false;
      if (tv.slotState ? st !== tv.slotState : st === "OK") return false;
    }
    switch (tv.flag) {
      case "DUPLICATE": case "CLOSED w/ OPEN": case "FINAL QA GAP": case "DATA READY": case "MISSING ANNEXE": if (!p.flags.includes(tv.flag)) return false; break;
      case "DATACOMPLETE": if (p.slotsOk < 10) return false; break;
      case "OVERDUE_ANNEX": if (!p.overdue || !p.triggered) return false; break;
      case "COMMENTS": if (!p.comments) return false; break;
      case "ACTIONS": if (!p.actions.some((a) => !a.done)) return false; break;
      case "PRIORITY": if (!p.priority) return false; break;
      case "OFFPLAN": if (p.inPlan) return false; break;
      default: break;
    }
    if (q && !`${p.product} ${p.ref} ${p.owner} ${p.workflowRefs.join(" ")} ${p.qcRefs.join(" ")} ${p.comments}`.toLowerCase().includes(q)) return false;
    return true;
  });
  const key = tv.sort;
  rows.sort((a, b) => {
    const r = key === "rag" ? RAG_RANK[a.rag] - RAG_RANK[b.rag] || cmp(a.daysToOverdue, b.daysToOverdue) : cmp(a[key], b[key]);
    return r * tv.dir || a.product.localeCompare(b.product);
  });
  return rows;
}

export const tracker = {
  id: "tracker",
  title: "APQR tracker",
  sub: (m) => `${fmtN(m.products.length)} planned products · ten required annexes and the Final QA compilation per review`,
  params(p) { if (Object.keys(p).length) Object.assign(tv, TV0, p); },
  render(m) {
    const months = [...new Set(m.products.map((p) => p.plannedMonth).filter(Boolean))].sort();
    const forms = [...new Set(m.products.map((p) => p.dosageForm).filter(Boolean))].sort();
    const ragChips = ["", "OVERDUE", "DUE SOON", "ON TRACK", "COMPLETE", "Not yet due", "NOT STARTED - overdue"].filter((r) => !r || m.ragCounts[r]);
    return `
    <div class="toolbar">
      <label class="field search-f">${icon("search")}<input data-tv="q" type="search" placeholder="Filter products, refs, notes…" value="${esc(tv.q)}" aria-label="Filter products"></label>
      <div class="chips">${ragChips.map((r) => `<button type="button" class="chipf ${tv.rag === r ? "on" : ""}" data-tv-rag="${esc(r)}">${r ? `<i style="background:${RAG_COLOR[r]}"></i>${RAG_META[r].label}` : "All"}<b>${fmtN(r ? m.ragCounts[r] : m.products.length)}</b></button>`).join("")}</div>
    </div>
    <div class="toolbar">
      <label class="field">${icon("plan")}<select data-tv="month" aria-label="Planned month">${opt("", "All planned months", tv.month)}${months.map((x) => opt(x, fmtMonth(x), tv.month)).join("")}</select></label>
      <label class="field"><select data-tv="fq" aria-label="Final QA">${opt("", "Any Final QA status", tv.fq)}${FINAL_QA_SIGNALS.map((x) => opt(x, FQ_META[x].label, tv.fq)).join("")}</select></label>
      <label class="field"><select data-tv="slot" aria-label="Annexe">${opt("", "Any annexe", tv.slot)}${SLOTS.map((s) => opt(s.key, `${s.label} not closed`, tv.slot)).join("")}</select></label>
      <label class="field"><select data-tv="form" aria-label="Dosage form">${opt("", "All dosage forms", tv.form)}${forms.map((x) => opt(x, x, tv.form)).join("")}</select></label>
      <label class="field">${icon("filter")}<select data-tv="flag" aria-label="Flag">${[["", "No flag filter"], ["DATA READY", "Data ready, Final QA not raised"], ["FINAL QA GAP", "Final QA closed with gap"], ["MISSING ANNEXE", "Required annexe never raised"], ["DATACOMPLETE", "All ten annexes closed"], ["OVERDUE_ANNEX", "Has overdue annexes"], ["CLOSED w/ OPEN", "Closed with open annexes"], ["DUPLICATE", "Duplicate workflows"], ["ACTIONS", "Has open actions"], ["COMMENTS", "Has QA comments"], ["PRIORITY", "Has priority"], ["OFFPLAN", "Not in plan"]].map(([v, l]) => opt(v, l, tv.flag)).join("")}</select></label>
      ${tv.stage || tv.trig ? `<button type="button" class="chipf on" data-tv-clear="stage">${esc(tv.stage || (tv.trig === "yes" ? "Triggered" : "Not triggered"))} ✕</button>` : ""}
      <span class="grow"></span>
      <button class="btn btn-sm" data-tv-export>${icon("download")}CSV</button>
    </div>
    <section class="card table-card" data-region="table">${this.table(m)}</section>`;
  },
  table(m) {
    const rows = trackerRows(m);
    const th = (key, label, cls = "") => `<th data-sort="${key}" class="${cls} ${tv.sort === key ? "sorted" + (tv.dir > 0 ? " asc" : "") : ""}">${label}</th>`;
    return `<div class="table-wrap"><table class="data"><thead><tr>
      ${th("product", "Product")}${th("rag", "RAG")}<th title="The ten required annexes">${slotHead()}</th>${th("slotsOk", "Annexes", "r")}${th("fqSignal", "Final QA")}${th("plannedMonth", "Planned")}${th("daysToOverdue", "PQR due")}<th class="c" title="QA comments and open actions">✎</th>
    </tr></thead><tbody>
    ${rows.map((p) => `<tr data-key="${esc(p.key)}">
      <td class="prod"><b title="${esc(p.product)}">${esc(p.product)}</b><small>${p.triggered ? `<span class="mono">${esc(p.ref)}</span><span>·</span>` : ""}${esc(p.dosageForm)}<span>·</span>${esc(p.triggered ? p.owner : "not triggered")}${p.flags.filter((f) => f !== "DATA READY").map((f) => `<span class="tag ${f === "DUPLICATE" || f === "MISSING ANNEXE" ? "warn" : "crit"}">${f}</span>`).join("")}${p.priority ? `<span class="tag crit">${esc(p.priority)}</span>` : ""}${!p.inPlan ? '<span class="tag info">NOT IN PLAN</span>' : ""}</small></td>
      <td>${ragPill(p.rag)}</td>
      <td>${slotCells(p)}</td>
      <td class="r num" style="white-space:nowrap"><b>${p.slotsOk}</b><span class="muted">/10</span> ${store.getState().baseline && p.triggered ? movementBadge(p.movement) : ""}</td>
      <td>${fqPill(p.fqSignal)}</td>
      <td style="white-space:nowrap">${p.plannedMonth ? monthLabel(p.plannedMonth) : "–"}</td>
      <td style="white-space:nowrap">${p.overdueDate ? `${fmtDate(p.overdueDate)}<br><small class="muted">${p.rag === "COMPLETE" ? "complete" : fmtDays(p.daysToOverdue)}</small>` : '<span class="muted">–</span>'}</td>
      <td class="c">${p.comments ? `<span class="comment-dot" data-tip="${tip("QA comments", [[p.comments.slice(0, 120), ""]])}"></span>` : ""}${p.actions.some((a) => !a.done) ? ` <span class="tag ${p.actions.some((a) => a.overdue) ? "crit" : "info"}">${p.actions.filter((a) => !a.done).length}</span>` : ""}</td>
    </tr>`).join("") || `<tr><td colspan="8" class="empty-row">No products match these filters.</td></tr>`}
    </tbody></table></div>
    <div class="table-foot"><span>Showing <b>${fmtN(rows.length)}</b> of ${fmtN(m.products.length)} products</span><span class="grow"></span><span class="slot-legend"><span><i class="slot ok"></i>Closed</span><span><i class="slot open"></i>Open</span><span><i class="slot missing"></i>Never raised</span><span><i class="slot nt"></i>Not triggered</span></span></div>`;
  },
  bind(root, rerender) {
    const region = () => { const r = root.querySelector('[data-region="table"]'); if (r) r.innerHTML = this.table(store.getModel()); };
    root.querySelector('[data-tv="q"]').addEventListener("input", debounce((e) => { tv.q = e.target.value; region(); }, 120));
    root.querySelectorAll("select[data-tv]").forEach((s) => s.addEventListener("change", () => { tv[s.dataset.tv] = s.value; if (s.dataset.tv === "slot") tv.slotState = ""; region(); }));
    root.querySelectorAll("[data-tv-rag]").forEach((b) => b.addEventListener("click", () => { tv.rag = b.dataset.tvRag; rerender(); }));
    root.querySelector("[data-tv-clear]")?.addEventListener("click", () => { tv.stage = ""; tv.trig = ""; rerender(); });
    root.addEventListener("click", (e) => {
      const th = e.target.closest("th[data-sort]");
      if (th && root.contains(th)) { const k = th.dataset.sort; tv.dir = tv.sort === k ? -tv.dir : k === "slotsOk" ? -1 : 1; tv.sort = k; region(); }
    });
    root.querySelector("[data-tv-export]").addEventListener("click", () => {
      const rows = trackerRows(store.getModel());
      download(csv([["APQR Ref", "Product", "Dosage form", "Triggered", "Workflow stage", "APQR owner", "Planned PQR month", "PQR overdue date", "Days to overdue", ...SLOTS.map((s) => s.label), "Annexes complete", "Open annexes", "Final QA signal", "RAG", "Flags", "Priority", "QA comments", "Open actions"], ...rows.map((p) => [p.ref, p.product, p.dosageForm, p.triggered ? "Yes" : "No", p.wfStage, p.owner, monthLabel(p.plannedMonth), p.overdueDate, p.daysToOverdue ?? "", ...SLOTS.map((s) => p.slots[s.key].status), p.slotsOk, p.annexOpen, p.fqSignal, p.rag, p.flags.join(" "), p.priority, p.comments, p.actions.filter((a) => !a.done).map((a) => a.text).join(" | ")])]), "APQR_tracker_view.csv");
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
    const statuses = ["NOT", "NOT TRIGGERED - past due", "NOT TRIGGERED - due soon", "Not yet triggered", "In progress", "OVERDUE - in progress", "Data collection complete", "Complete"];
    return `
    <div class="toolbar">
      <label class="field search-f">${icon("search")}<input data-pv="q" type="search" placeholder="Filter planned products…" value="${esc(pv.q)}" aria-label="Filter planned products"></label>
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
    return `<div class="table-wrap"><table class="data"><thead><tr><th>#</th><th>Product</th><th>Process</th><th>Review period</th><th>Annexes</th><th>Final QA</th><th>PQR overdue</th><th>Tracking</th><th></th></tr></thead><tbody>
    ${keys.map((k) => {
      const list = groups.get(k).sort((a, b) => a.product.localeCompare(b.product));
      const mo = m.months.find((x) => x.month === k);
      return `<tr class="group"><td colspan="9">${k === "none" ? "No review end date" : fmtMonth(k)}<span class="muted">${list.length} shown · ${mo ? `${mo.triggered}/${mo.planned} triggered · ${fmtPct(mo.pct)} of annexes closed · ${mo.fqComplete} complete` : ""}</span>${mo ? `<span style="float:right">${trackingPill(mo.status)}</span>` : ""}</td></tr>` +
        list.map((p) => {
          const pr = m.productByKey.get(p.key);
          return `<tr data-key="${esc(p.key)}">
          <td class="muted num">${esc(p.no)}</td>
          <td class="prod"><b title="${esc(p.product)}">${esc(p.product)}</b><small>${esc(p.site)}${p.planStatus !== "Approved" ? ` · <span class="tag">${esc(p.planStatus)}</span>` : ""}</small></td>
          <td>${esc(p.process)}</td>
          <td style="white-space:nowrap">${esc(p.reviewStart || "?")} → ${esc(p.reviewEnd || "?")}</td>
          <td>${slotCells(pr)}</td>
          <td>${fqPill(p.fqSignal)}</td>
          <td style="white-space:nowrap">${fmtDate(p.overdueDate)}<br><small class="muted">${p.tracking === "Complete" ? "complete" : fmtDays(p.daysToOverdue)}</small></td>
          <td>${trackingPill(p.tracking)}</td>
          <td><button class="icon-btn sm" data-plan-edit="${esc(p.id)}" aria-label="Edit ${esc(p.product)}">${icon("edit")}</button></td>
        </tr>`;
        }).join("");
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
      if (ed) { e.stopPropagation(); act.editPlan(store.getState().plan.find((p) => p.id === ed.dataset.planEdit)); }
    }, true);
  },
};

/* ================================================================ tasks */

const PAGE = 100;
const TK0 = { q: "", role: ROLES.ANNEX, dept: "", slot: "", stage: "", closure: "", overdue: "", assignee: "", month: "", product: "", source: "", page: 0 };
const tk = { ...TK0, sort: "created", dir: -1 };
function taskRows(m) {
  const q = tk.q.toLowerCase();
  const rows = m.tasks.filter((t) => {
    if (tk.role && t.role !== tk.role) return false;
    if (tk.source === "scigeniq" && t.generated) return false;
    if (tk.source === "generated" && !t.generated) return false;
    if (tk.dept && t.dept !== tk.dept) return false;
    if (tk.slot && t.slot !== tk.slot) return false;
    if (tk.stage && t.stage !== tk.stage) return false;
    if (tk.closure === "open" && (t.closed || t.generated)) return false;
    if (tk.closure === "closed" && !t.closed) return false;
    if (tk.overdue && t.overdue !== "YES") return false;
    if (tk.assignee && t.assigneeName !== tk.assignee && t.assignee !== tk.assignee) return false;
    if (tk.month && t.plannedMonth !== tk.month) return false;
    if (tk.product && t.key !== tk.product) return false;
    if (q && !`${t.ref} ${t.product} ${t.title} ${t.assignee} ${t.stage} ${t.slot}`.toLowerCase().includes(q)) return false;
    return true;
  });
  rows.sort((a, b) => cmp(a[tk.sort], b[tk.sort]) * tk.dir || a.ref.localeCompare(b.ref));
  return rows;
}

export const tasks = {
  id: "tasks",
  title: "Task register",
  sub: (m) => `${fmtN(m.realTasks.length)} Scigeniq tasks + ${fmtN(m.generatedTasks.length)} generated for untriggered PQRs · “Due” is the parent PQR’s overdue date`,
  params(p) {
    if (!Object.keys(p).length) return;
    Object.assign(tk, TK0, p);
    if (p.role === "all" || p.cls === "all") tk.role = "";
    if (p.cls === "Approval") tk.role = ROLES.APPROVAL;
    if (p.source === "generated" && !p.role) tk.role = "";
  },
  render(m) {
    const stages = [...new Set(m.tasks.map((t) => t.stage).filter(Boolean))].sort();
    const months = [...new Set(m.tasks.map((t) => t.plannedMonth).filter(Boolean))].sort();
    const prodName = tk.product ? m.productByKey.get(tk.product)?.product : "";
    return `
    <div class="toolbar">
      <label class="field search-f">${icon("search")}<input data-tk="q" type="search" placeholder="Filter refs, products, titles, people…" value="${esc(tk.q)}" aria-label="Filter tasks"></label>
      <div class="seg-toggle">${[[ROLES.ANNEX, "Annexes"], [ROLES.FINAL, "Final QA"], [ROLES.WORKFLOW, "Workflows"], [ROLES.APPROVAL, "Approvals"], ["", "All"]].map(([v, l]) => `<button type="button" class="${tk.role === v ? "on" : ""}" data-tk-role="${esc(v)}">${l}</button>`).join("")}</div>
      <span class="grow"></span>
      <button class="btn btn-sm" data-tk-export>${icon("download")}CSV</button>
      <button class="btn btn-sm btn-primary" data-tk-add>${icon("plus")}Add task</button>
    </div>
    <div class="toolbar">
      <label class="field"><select data-tk="source" aria-label="Record source">${opt("", "Scigeniq + not triggered", tk.source)}${opt("scigeniq", "Scigeniq export only", tk.source)}${opt("generated", "Not triggered (generated)", tk.source)}</select></label>
      <label class="field"><select data-tk="closure" aria-label="Open or closed">${opt("", "Open & closed", tk.closure)}${opt("open", "Open (raised)", tk.closure)}${opt("closed", "Closed", tk.closure)}</select></label>
      <label class="field"><select data-tk="overdue" aria-label="Overdue">${opt("", "Any due state", tk.overdue)}${opt("1", "Overdue vs PQR date", tk.overdue)}</select></label>
      <label class="field"><select data-tk="slot" aria-label="Annexe slot">${opt("", "All annexes", tk.slot)}${SLOTS.map((s) => opt(s.key, s.label, tk.slot)).join("")}</select></label>
      <label class="field"><select data-tk="dept" aria-label="Department">${opt("", "All departments", tk.dept)}${DEPARTMENTS.map((d) => opt(d, d, tk.dept)).join("")}</select></label>
      <label class="field"><select data-tk="stage" aria-label="Stage">${opt("", "All stages", tk.stage)}${stages.map((s) => opt(s, s, tk.stage)).join("")}</select></label>
      <label class="field"><select data-tk="assignee" aria-label="Assigned to">${opt("", "Everyone", tk.assignee)}<optgroup label="Groups and roles">${m.groups.filter((g) => g.total).map((g) => opt(g.name, `${g.name} (${g.type})`, tk.assignee)).join("")}</optgroup><optgroup label="People">${m.owners.map((u) => opt(u, u, tk.assignee)).join("")}</optgroup></select></label>
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
    return `<div class="table-wrap"><table class="data"><thead><tr>${th("ref", "Ref")}${th("product", "Product")}${th("slot", "Annexe")}${th("title", "Title")}${th("stage", "Stage")}${th("assignee", "Assigned")}${th("created", "Created")}${th("closedOn", "Closed")}${th("due", "Due (PQR)")}${th("ageing", "Age", "r")}<th></th></tr></thead><tbody>
    ${view.map((t) => `<tr data-task-row="${esc(t.id)}" ${t.generated ? `data-key="${esc(t.key)}"` : ""}>
      <td class="mono" style="white-space:nowrap">${t.generated ? '<span class="tag">NOT TRIGGERED</span>' : esc(t.ref)}${t.appChanged ? ' <span class="tag new" title="Changed or added in the app; kept on Scigeniq refresh">IN APP</span>' : ""}</td>
      <td class="prod"><b title="${esc(t.product)}" style="max-width:240px">${esc(t.product)}</b></td>
      <td style="white-space:nowrap">${t.isAnnex ? `<span style="display:inline-flex;align-items:center;gap:6px"><i style="width:8px;height:8px;border-radius:50%;background:${deptColor(t.dept)}"></i>${esc(t.slot)}</span>` : `<span class="muted">${esc(t.role)}</span>`}${t.shared && t.isData ? ' <span class="tag" title="Arrives through the shared QA Data Collection stream">QA</span>' : ""}</td>
      <td style="max-width:220px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${esc(t.title)}">${esc(t.title)}</td>
      <td>${t.generated ? '<span class="muted">Not triggered</span>' : act.stageSelect(t, "inline")}</td>
      <td>${t.generated ? `<span class="muted">${esc(t.assigneeName)}</span>` : `<input class="inline" data-task-assignee="${esc(t.id)}" list="dl-owners" value="${t.assigneeType === "user" ? esc(t.assignee) : ""}" placeholder="${esc(t.assigneeName)} (${esc(t.assigneeType)})" aria-label="Assigned to">`}</td>
      <td style="white-space:nowrap">${fmtDate(t.created)}</td>
      <td style="white-space:nowrap">${t.closed ? fmtDate(t.closedOn) : '<span class="muted">open</span>'}</td>
      <td style="white-space:nowrap">${t.due ? fmtDate(t.due) : "–"}${t.overdue === "YES" ? ' <span class="tag crit">LATE</span>' : ""}</td>
      <td class="r num">${t.ageing ?? "–"}</td>
      <td>${t.generated ? "" : `<button class="icon-btn sm" data-task-edit="${esc(t.id)}" aria-label="Edit task">${icon("edit")}</button>`}</td>
    </tr>`).join("") || `<tr><td colspan="11" class="empty-row">No tasks match these filters.</td></tr>`}
    </tbody></table></div>
    <div class="table-foot"><span><b>${fmtN(rows.length)}</b> tasks${rows.length > PAGE ? ` · page ${tk.page + 1} of ${pages}` : ""}</span><span class="grow"></span>
      ${rows.length > PAGE ? `<button class="btn btn-sm" data-tk-page="-1" ${tk.page === 0 ? "disabled" : ""}>Previous</button><button class="btn btn-sm" data-tk-page="1" ${tk.page >= pages - 1 ? "disabled" : ""}>Next</button>` : ""}</div>`;
  },
  bind(root, rerender) {
    const region = () => { root.querySelector('[data-region="table"]').innerHTML = this.table(store.getModel()); };
    root.querySelector('[data-tk="q"]').addEventListener("input", debounce((e) => { tk.q = e.target.value; tk.page = 0; region(); }, 120));
    root.querySelectorAll("select[data-tk]").forEach((s) => s.addEventListener("change", () => { tk[s.dataset.tk] = s.value; tk.page = 0; region(); }));
    root.querySelectorAll("[data-tk-role]").forEach((b) => b.addEventListener("click", () => { tk.role = b.dataset.tkRole; tk.page = 0; rerender(); }));
    root.querySelector("[data-tk-add]").addEventListener("click", () => { const p = tk.product ? store.getModel().productByKey.get(tk.product) : null; act.editTask(null, p ? { product: p.product, ref: p.triggered ? p.ref : "" } : {}); });
    root.querySelector("[data-tk-clear-product]")?.addEventListener("click", () => { tk.product = ""; rerender(); });
    root.querySelector("[data-tk-export]").addEventListener("click", () => {
      const rows = taskRows(store.getModel());
      download(csv([["Reference ID", "Product", "Task role", "Annexe slot", "Department", "Title", "Stage", "Status", "Assigned user", "Created", "Closed on", "Closure", "Record source", "Due (parent APQR)", "Overdue?", "Ageing (days)", "Planned PQR month"], ...rows.map((t) => [t.ref, t.product, t.role, t.slot, t.dept, t.title, t.stage, t.status, t.assignee, t.created, t.closedOn, t.closure, t.generated ? "Generated from plan" : "Scigeniq export", t.due, t.overdue, t.ageing ?? "", t.plannedMonth])]), "APQR_tasks_view.csv");
    });
    root.addEventListener("click", (e) => {
      const th = e.target.closest("th[data-sort]");
      if (th) { const k = th.dataset.sort; tk.dir = tk.sort === k ? -tk.dir : k === "created" || k === "ageing" ? -1 : 1; tk.sort = k; region(); return; }
      const pg = e.target.closest("[data-tk-page]");
      if (pg) { tk.page += +pg.dataset.tkPage; region(); root.querySelector(".table-wrap").scrollTop = 0; return; }
      const ed = e.target.closest("[data-task-edit]");
      if (ed) act.editTask(store.getState().tasks.find((t) => t.id === ed.dataset.taskEdit));
    });
    root.addEventListener("dblclick", (e) => {
      const row = e.target.closest("[data-task-row]");
      if (row && !e.target.closest("select,input,button")) { const t = store.getState().tasks.find((x) => x.id === row.dataset.taskRow); if (t) act.editTask(t); }
    });
  },
};

/* ================================================================ actions */

const av = { q: "", state: "open", owner: "" };
export const actions = {
  id: "actions",
  title: "QA follow-up actions",
  sub: (m) => `${fmtN(m.kpi.openActions)} open · ${fmtN(m.kpi.overdueActions)} past target date`,
  params(p) { if (Object.keys(p).length) Object.assign(av, { q: "", state: "open", owner: "" }, p); },
  render(m) {
    const owners = [...new Set(m.actions.map((a) => a.owner).filter(Boolean))].sort();
    return `
    <div class="toolbar">
      <label class="field search-f">${icon("search")}<input data-av="q" type="search" placeholder="Filter actions or products…" value="${esc(av.q)}" aria-label="Filter actions"></label>
      <div class="seg-toggle">${[["open", "Open"], ["late", "Overdue"], ["done", "Done"], ["", "All"]].map(([v, l]) => `<button type="button" class="${av.state === v ? "on" : ""}" data-av-state="${v}">${l}</button>`).join("")}</div>
      <label class="field"><select data-av="owner" aria-label="Owner">${opt("", "Any owner", av.owner)}${owners.map((u) => opt(u, u, av.owner)).join("")}</select></label>
      <span class="grow"></span>
      <button class="btn btn-sm" data-av-export>${icon("download")}CSV</button>
      <button class="btn btn-sm btn-primary" data-av-add>${icon("plus")}Add action</button>
    </div>
    <section class="card" data-region="list">${this.list(m)}</section>`;
  },
  rows(m) {
    const q = av.q.toLowerCase();
    return m.actions.filter((a) => (av.state === "open" ? !a.done : av.state === "late" ? a.overdue : av.state === "done" ? a.done : true) && (!av.owner || a.owner === av.owner) && (!q || `${a.text} ${a.product} ${a.ref} ${a.owner}`.toLowerCase().includes(q)))
      .sort((a, b) => Number(a.done) - Number(b.done) || cmp(a.due, b.due) || a.product.localeCompare(b.product));
  },
  list(m) {
    const rows = this.rows(m);
    if (!m.actions.length) return `<div style="display:grid;gap:10px;justify-items:start"><b>No follow-up actions yet</b><p class="muted" style="margin:0">Record what needs to happen to move a review forward: chase an annexe, raise the Final QA, confirm a closure. Each action has an owner and a target date, and shows here and in the product file.</p><button class="btn btn-sm btn-primary" data-av-add>${icon("plus")}Add the first action</button></div>`;
    return `<div style="display:grid;gap:8px">${rows.map((a) => `<div class="action-row ${a.done ? "done" : ""} ${a.overdue ? "late" : ""}">
      <input type="checkbox" data-action-toggle="${esc(a.key)}|${esc(a.id)}" ${a.done ? "checked" : ""} aria-label="Mark done">
      <div style="min-width:0"><b>${esc(a.text)}</b><small><a href="#" data-open-product="${esc(a.key)}">${esc(a.product)}</a> · ${esc(a.owner || "no owner")} · ${a.due ? `${a.overdue ? '<span style="color:var(--crit-ink);font-weight:700">' : ""}due ${fmtDate(a.due)}${a.overdue ? "</span>" : ""}` : "no target date"}${a.done && a.doneAt ? ` · done ${fmtDate(a.doneAt)}` : ""}</small></div>
      <div style="display:flex;gap:6px;align-items:center">${ragPill(a.rag)}<button class="icon-btn sm" data-action-edit="${esc(a.key)}|${esc(a.id)}" aria-label="Edit action">${icon("edit")}</button></div>
    </div>`).join("") || '<p class="muted">No actions match.</p>'}</div>`;
  },
  bind(root, rerender) {
    const region = () => { root.querySelector('[data-region="list"]').innerHTML = this.list(store.getModel()); };
    root.querySelector('[data-av="q"]').addEventListener("input", debounce((e) => { av.q = e.target.value; region(); }, 120));
    root.querySelector('[data-av="owner"]').addEventListener("change", (e) => { av.owner = e.target.value; region(); });
    root.querySelectorAll("[data-av-state]").forEach((b) => b.addEventListener("click", () => { av.state = b.dataset.avState; rerender(); }));
    root.addEventListener("click", (e) => {
      if (e.target.closest("[data-av-add]")) { act.editAction(null, null); return; }
      const ed = e.target.closest("[data-action-edit]");
      if (ed) { const [key, id] = ed.dataset.actionEdit.split("|"); act.editAction(key, store.getState().products[key]?.actions?.find((x) => x.id === id)); }
    });
    root.addEventListener("change", (e) => {
      const t = e.target.closest("[data-action-toggle]");
      if (t) { const [key, id] = t.dataset.actionToggle.split("|"); act.toggleAction(key, id, t.checked); }
    });
    root.querySelector("[data-av-export]").addEventListener("click", () => {
      download(csv([["Product", "APQR Ref", "Action", "Owner", "Target date", "Done", "Overdue"], ...this.rows(store.getModel()).map((a) => [a.product, a.ref, a.text, a.owner, a.due, a.done ? "Yes" : "No", a.overdue ? "YES" : ""])]), "APQR_actions.csv");
    });
  },
};

/* ================================================================ data */

export const data = {
  id: "data",
  title: "Data & settings",
  sub: () => "Import, export, team publishing, baseline, settings and audit trail",
  render(m) {
    const s = store.getState();
    const bl = s.baseline;
    const viewer = inViewer() && canRebuild();
    return `
    <div class="grid g-12">
      ${viewer ? `<section class="card span-12 reveal" id="team-card">
        <div class="card-h"><div><h3>${icon("workload")} Team version</h3><p>Everyone who opens this tracker sees the version last published here. Your own changes stay in this browser until you publish them.</p></div></div>
        <div style="display:flex;flex-wrap:wrap;gap:14px;align-items:center">
          <div class="stat-grid" style="flex:1;min-width:260px">
            <div class="stat"><div class="k">Published version</div><div class="v" style="font-size:15px">${s.meta.publishedAt ? fmtDate(s.meta.publishedAt.slice(0, 10), false) + " " + s.meta.publishedAt.slice(11, 16) : "Original"}</div></div>
            <div class="stat"><div class="k">Published by</div><div class="v" style="font-size:15px">${esc(s.meta.publishedBy || "—")}</div></div>
            <div class="stat"><div class="k">This browser</div><div class="v" style="font-size:15px"><span class="team-dot ${store.isDirty() ? "" : "synced"}"></span> ${store.isDirty() ? "Unpublished changes" : "Same as team version"}</div></div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-primary" data-action="publish-team" id="publish-team-btn">${icon("upload")}Publish for everyone</button>${store.hasSeed() ? `<button class="btn" data-action="reset-seed">${icon("undo")}Discard my changes</button>` : ""}</div>
        </div>
        <p class="muted" style="font-size:12px;margin:12px 0 0" id="team-note">Set your name below so the audit trail and the published version show who made each change.</p>
      </section>` : ""}
      <section class="span-12 reveal">
        <div class="dropzone" data-action="import" role="button" tabindex="0">
          <div class="dz-ic">${icon("upload")}</div>
          <h3>Drop a file here, or click to browse</h3>
          <p>The app recognises the file type and shows a preview before anything changes. Your comments, actions, baseline and audit trail are kept.</p>
          <div class="formats"><span class="tag info">APQR master tracker .xlsx (v2 or v3)</span><span class="tag info">Scigeniq all-tasks export .xlsx / .csv</span><span class="tag info">Plan sheet .xlsx</span><span class="tag info">App backup .json</span></div>
        </div>
      </section>
      <section class="card span-12 reveal">
        <div class="source-tiles">
          <div class="source-tile"><b>${icon("tracker")}APQR master tracker</b><p>The workbook with “APQR Plan”, “Task Register”, “APQR Tracker” and “Dashboard” sheets, including files exported from this app. Brings in the plan, every Scigeniq task with its role and annexe slot, QA comments, actions and the report-date inputs. Generated “Not triggered” rows are skipped: the app rebuilds them from the plan.</p></div>
          <div class="source-tile"><b>${icon("data")}Scigeniq all-tasks export</b><p>The monthly refresh. Products come from the parent action. Each task is classified into its role and one of the ten annexe slots by title, so shared “QA Data Collection” tasks land in the right department. Non-APQR rows are set aside.</p></div>
          <div class="source-tile"><b>${icon("plan")}APQR plan</b><p>A sheet with Product, Process, Review Start and Review End. The planned PQR month, the overdue date and the untriggered workload are derived from it.</p></div>
        </div>
      </section>

      <section class="card span-6 reveal">
        <div class="card-h"><div><h3>Export</h3><p>Take the tracker to Excel or keep a backup</p></div></div>
        <div style="display:grid;gap:10px">
          <button class="btn" data-action="export-xlsx" style="justify-content:flex-start;white-space:normal;height:auto;min-height:40px;padding:9px 14px;text-align:left">${icon("download")}Excel workbook (.xlsx) in the v3 layout: Dashboard, Tracker, Final QA, Workflow, Annexes, Plan, Task Register, Workload, Actions, Audit Trail</button>
          <button class="btn" data-action="export-json" style="justify-content:flex-start;white-space:normal;height:auto;min-height:40px;padding:9px 14px;text-align:left">${icon("download")}Full backup (.json), to restore later or move to another computer</button>
          ${inViewer() ? "" : `<button class="btn" data-action="print" style="justify-content:flex-start">${icon("print")}Print / save the current page as PDF</button>`}
        </div>
        <p class="muted" style="font-size:12px;margin:14px 0 0">Source: <b>${esc(s.meta.source || "none")}</b>${s.meta.importedAt ? ` · imported ${fmtDate(s.meta.importedAt.slice(0, 10))}` : ""}</p>
      </section>

      <section class="card span-6 reveal">
        <div class="card-h"><div><h3>Comparison baseline</h3><p>The figures the movement block and per-product Δ compare against</p></div></div>
        ${bl ? `<div class="stat-grid" style="margin-bottom:14px"><div class="stat"><div class="k">Baseline</div><div class="v" style="font-size:17px">${esc(bl.label)}</div></div><div class="stat"><div class="k">Products with previous %</div><div class="v">${fmtN(Object.keys(bl.prevPct || {}).length)}</div></div><div class="stat"><div class="k">Annexes closed then</div><div class="v">${bl.metrics?.annexClosed === undefined ? "–" : fmtN(bl.metrics.annexClosed)}</div></div></div>` : '<p class="muted" style="margin-top:0">No baseline set.</p>'}
        <form class="toolbar" data-baseline-form style="margin:0">
          <label class="field" style="flex:1">Label<input name="label" value="${esc(fmtDate(m.report))}" style="flex:1"></label>
          <button class="btn btn-sm btn-primary">${icon("history")}Save current figures as baseline</button>
          ${bl ? `<button type="button" class="btn btn-sm btn-ghost" data-baseline-clear>Clear</button>` : ""}
        </form>
        <p class="muted" style="font-size:12px;margin:10px 0 0">When you import next month’s Scigeniq export, tick “save the current figures as the baseline first”. Each refresh then shows what moved since the previous extract.</p>
      </section>

      <section class="card span-6 reveal">
        <div class="card-h"><div><h3>Programme & rules</h3><p>Shown in the header and used by every calculation</p></div></div>
        <form class="form-grid" data-settings-form>
          <label class="f full">Programme name<input name="programme" id="set-programme" value="${esc(s.meta.programme)}"></label>
          <label class="f">Organisation / site<input name="organisation" id="set-org" value="${esc(s.meta.organisation)}"></label>
          <label class="f">Plan reference<input name="planRef" id="set-planref" value="${esc(s.meta.planRef)}" placeholder="PQRP-KE-1"></label>
          <label class="f">Your name (for the audit trail)<input name="user" id="set-user" value="${esc(s.meta.user)}" placeholder="e.g. QA reviewer"></label>
          <label class="f">Report date<input type="date" name="reportDate" id="set-date" value="${esc(s.settings.reportDate)}" ${s.settings.useToday ? "disabled" : ""}></label>
          <label class="f check full"><input type="checkbox" name="useToday" id="set-today" ${s.settings.useToday ? "checked" : ""}> Always use today’s date as the report date</label>
          <label class="f">PQR overdue after (months)<input type="number" min="0" max="24" name="overdueMonths" id="set-months" value="${s.settings.overdueMonths}"><small>From the 1st of the planned PQR month. Confirm against SOPQA0021E.</small></label>
          <label class="f">“Due soon” threshold (days)<input type="number" min="0" max="365" name="dueSoonDays" id="set-soon" value="${s.settings.dueSoonDays}"></label>
          <label class="f">“Not triggered – due soon” window (days)<input type="number" min="0" max="365" name="triggerWindowDays" id="set-window" value="${s.settings.triggerWindowDays}"></label>
          <div class="full" style="display:flex;justify-content:flex-end"><button class="btn btn-primary btn-sm">${icon("check")}Save settings</button></div>
        </form>
      </section>

      <section class="card span-6 reveal">
        <div class="card-h"><div><h3>Audit trail</h3><p>Every change made in the app: who, when, what (latest 60)</p></div><div class="tools"><span class="tag">${fmtN(s.audit.length)}</span></div></div>
        <div class="audit-list" style="max-height:440px;overflow:auto">${s.audit.slice(0, 60).map((a) => `<div class="a"><time>${esc(a.at.slice(0, 16).replace("T", " "))}</time><div><b>${esc(a.user)}</b> · ${esc(a.entity)} <span class="muted">${esc(a.label || "")}</span><br>${esc(a.field || "")}: <s>${esc(String(a.from ?? "").slice(0, 80))}</s> → <b>${esc(String(a.to ?? "").slice(0, 120))}</b></div></div>`).join("") || '<p class="muted">No changes recorded yet.</p>'}</div>
      </section>

      <section class="card span-12 reveal">
        <div class="card-h"><div><h3>Demo & reset</h3><p>Data is kept in this browser. Export a backup regularly${viewer ? ", or publish for the team" : ""}.</p></div></div>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          ${store.hasSeed() && !viewer ? `<button class="btn" data-action="reset-seed">${icon("undo")}Reset to the published data</button>` : ""}
          <button class="btn" data-action="demo">${icon("sparkle")}Load demo programme</button>
          <button class="btn btn-ghost" data-action="clear" style="color:var(--crit-ink)">${icon("trash")}Clear all data</button>
        </div>
        <p class="muted" style="font-size:12px;margin:14px 0 0">Scigeniq remains the system of record. This tracker is a monitoring tool: it doesn’t provide electronic signatures (21 CFR Part 11 / EU Annex 11).</p>
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
    const btn = root.querySelector("#publish-team-btn");
    if (btn) teamStatus().then((st) => {
      const note = root.querySelector("#team-note");
      if (!st.available) { btn.disabled = true; if (note) note.textContent = "Publishing isn’t available in this view."; }
      else if (st.canEdit === false) { btn.disabled = true; if (note) note.textContent = "You have view access, so you can explore and export but not publish. Ask the owner for edit access."; }
    });
  },
};
