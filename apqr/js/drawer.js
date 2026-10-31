// Product file: the slide-over panel with a product's timeline, annexes,
// notes and change history.
import { html, raw, esc, icon, fmtN, fmtPct, fmtDate, fmtMonth, fmtDays, ragPill, movementBadge, $ } from "./ui.js";
import { ring, deptColor, progressBar } from "./charts.js";
import { DEPARTMENTS, dayInt } from "./engine.js";
import * as store from "./store.js";
import * as act from "./actions.js";

let openKey = null;
let lastFocus = null;

export const isOpen = () => !!openKey;

export function openProduct(key) {
  if (!store.getModel().productByKey.has(key)) return;
  if (!openKey) lastFocus = document.activeElement;
  openKey = key;
  render();
  const d = $("#drawer");
  d.classList.add("open");
  d.setAttribute("aria-hidden", "false");
  $("#scrim").hidden = false;
  setTimeout(() => d.querySelector(".close")?.focus(), 50);
}

export function closeDrawer() {
  if (!openKey) return;
  openKey = null;
  const d = $("#drawer");
  d.classList.remove("open");
  d.setAttribute("aria-hidden", "true");
  $("#scrim").hidden = true;
  lastFocus?.focus?.();
}

export function refreshDrawer() {
  if (!openKey) return;
  if (!store.getModel().productByKey.has(openKey)) { closeDrawer(); return; }
  const body = $("#drawer .dr-body");
  const st = body?.scrollTop || 0;
  const active = document.activeElement?.closest?.("#drawer") ? document.activeElement : null;
  if (active?.tagName === "TEXTAREA") return; // don't clobber typing
  render();
  const nb = $("#drawer .dr-body");
  if (nb) nb.scrollTop = st;
}

function timeline(p, report) {
  const toDay = (iso) => dayInt(iso);
  const my = (s) => { const m = /^(\d{2})\/(\d{4})$/.exec(s || ""); return m ? `${m[2]}-${m[1]}-01` : ""; };
  const pts0 = [
    { k: "Review start", d: my(p.reviewStart) },
    { k: "Review end", d: p.reviewEnd ? my(p.reviewEnd) : "" },
    { k: "Planned PQR", d: p.plannedMonth ? p.plannedMonth.slice(0, 8) + "01" : "" },
    { k: "PQR overdue", d: p.overdueDate, cls: "due" },
    { k: "Today", d: report, cls: "today" },
  ].filter((x) => x.d);
  const pts = pts0.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
  if (pts.length < 2) return '<p class="muted" style="margin:0">Not in the plan, so there is no review period or PQR due date.</p>';
  const days = pts.map((x) => toDay(x.d));
  const min = Math.min(...days), max = Math.max(...days);
  const span = Math.max(1, max - min);
  const pos = (d) => 3 + ((toDay(d) - min) / span) * 94;
  const start = pts.find((x) => x.k === "Planned PQR"), end = pts.find((x) => x.k === "PQR overdue");
  return `<div class="timeline"><div class="tl-track">${start && end ? `<div class="tl-span" style="left:${pos(start.d)}%;width:${pos(end.d) - pos(start.d)}%"></div>` : ""}
    ${pts.map((x, i) => `<div class="tl-mark ${x.cls || ""} ${i % 2 ? "below" : ""} ${pos(x.d) < 12 ? "first" : pos(x.d) > 88 ? "last" : ""}" style="left:${pos(x.d)}%" title="${esc(x.k)}"><span class="lbl">${esc(x.k)}<small>${x.k.startsWith("Review") ? esc(x.d.slice(5, 7) + "/" + x.d.slice(0, 4)) : fmtDate(x.d)}</small></span></div>`).join("")}
  </div></div>`;
}

function render() {
  const m = store.getModel();
  const p = m.productByKey.get(openKey);
  if (!p) return;
  const s = store.getState();
  const data = p.tasks.filter((t) => t.isData);
  const approvals = p.tasks.filter((t) => t.taskClass === "Approval");
  const wfs = p.tasks.filter((t) => t.taskClass === "Workflow");
  const audit = s.audit.filter((a) => a.key === p.key).slice(0, 40);
  const byDept = DEPARTMENTS.map((d) => ({ d, list: data.filter((t) => t.dept === d) })).filter((x) => x.list.length);
  const other = data.filter((t) => !DEPARTMENTS.includes(t.dept));
  if (other.length) byDept.push({ d: "Other", list: other });

  const taskRow = (t) => `<div class="task ${t.closed ? "closed" : ""}"><span class="stripe" style="background:${t.isData ? deptColor(t.dept) : "var(--line-2)"}"></span>
    <div style="min-width:0"><b>${esc(t.title)}</b><small><span class="mono">${esc(t.ref)}</span> · ${esc(t.assignee)} · ${t.closed ? `closed ${fmtDate(t.closedOn)}` : `open ${t.ageing ?? "?"} d`}${t.overdue === "YES" ? ' · <span style="color:var(--crit-ink);font-weight:700">overdue</span>' : ""}</small></div>
    <div class="tright">${act.stageSelect(t)}<button class="icon-btn sm" data-task-edit="${esc(t.id)}" aria-label="Edit task">${icon("edit")}</button></div></div>`;

  $("#drawer").innerHTML = `
  <div class="dr-head">
    <button class="icon-btn close" data-drawer-close aria-label="Close">${icon("close")}</button>
    <div class="eyebrow"><span class="mono">${esc(p.ref)}</span><span>·</span><span>${esc(p.dosageForm)}</span><span>·</span><span>${esc(p.site)}</span>${p.plannedMonth ? `<span>·</span><span>Planned ${fmtMonth(p.plannedMonth)}</span>` : ""}</div>
    <h2>${esc(p.product)}</h2>
    <div class="hstats">
      ${ring(p.pct, { size: 92, stroke: 9, label: "Complete", color: p.rag === "COMPLETE" ? "#5ee05e" : p.rag === "OVERDUE" ? "#ff8a8a" : "#5eead4" })}
      <div class="hstat"><div class="k">Annexes</div><div class="v">${p.completed}<small>/ ${p.dataTasks}</small></div></div>
      <div class="hstat ${p.overdue ? "alert" : ""}"><div class="k">Overdue</div><div class="v">${p.overdue}</div></div>
      <div class="hstat"><div class="k">Approvals</div><div class="v">${p.approvals}${p.rejected ? `<small style="color:#fca5a5">${p.rejected} rej.</small>` : ""}</div></div>
      <div class="hstat"><div class="k">PQR due</div><div class="v" style="font-size:15px">${p.overdueDate ? fmtDate(p.overdueDate) : "–"}</div><div class="d">${p.rag === "COMPLETE" ? "complete" : fmtDays(p.daysToOverdue)}</div></div>
    </div>
  </div>
  <div class="dr-body">
    <section class="card">
      <div class="card-h"><div><h3>Status</h3><p>Calculated from the task register and the plan</p></div><div class="tools">${ragPill(p.rag)}</div></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px">
        ${p.flags.map((f) => `<span class="tag ${f === "DUPLICATE" ? "warn" : "crit"}">${f}</span>`).join("")}
        ${p.isNew ? '<span class="tag new">NEW SINCE BASELINE</span>' : ""}
        ${p.prevPct !== null ? `<span class="muted" style="font-size:12.5px;display:inline-flex;align-items:center;gap:6px">${movementBadge(p.movement)} ${fmtPct(p.prevPct)} at baseline → <b style="color:var(--ink)">${fmtPct(p.pct)}</b> now</span>` : ""}
        ${p.bottleneck !== "-" ? `<span class="muted" style="font-size:12.5px">Bottleneck: <b style="color:var(--ink)">${esc(p.bottleneck)}</b></span>` : ""}
      </div>
      ${timeline(p, m.report)}
    </section>

    <section class="card">
      <div class="card-h"><div><h3>QA follow-up</h3><p>Your notes, kept across imports and exported to the workbook</p></div></div>
      <div class="form-grid" style="margin-bottom:12px">
        <label class="f">APQR owner<input data-pf="owner" list="dl-drawer-owners" value="${esc(s.products[p.key]?.owner || "")}" placeholder="${esc(p.owner)} (from Scigeniq)"></label>
        <label class="f">Priority<select data-pf="priority">${["", "High", "Medium", "Low"].map((x) => `<option value="${x}"${(p.priority || "") === x ? " selected" : ""}>${x || "—"}</option>`).join("")}</select></label>
      </div>
      <label class="f">QA comments / actions<textarea class="notes" data-pf="comments" placeholder="e.g. Chase RA annex with regulatory affairs by Friday; confirm closure of APQR-KE-30 with QA head…">${esc(p.comments)}</textarea></label>
      <datalist id="dl-drawer-owners">${m.owners.map((u) => `<option value="${esc(u)}">`).join("")}</datalist>
    </section>

    <section class="card">
      <div class="card-h"><div><h3>Annexes</h3><p>${fmtN(data.length)} data-collection tasks. Change a stage here and every figure updates.</p></div><div class="tools"><a class="btn btn-sm btn-ghost" href="#/tasks?product=${encodeURIComponent(p.key)}&cls=all" data-drawer-close>${icon("tasks")}Task register</a><button class="btn btn-sm" data-add-task>${icon("plus")}Add</button></div></div>
      <div style="display:grid;gap:14px">
        ${byDept.map(({ d, list }) => {
          const done = list.filter((t) => t.closed).length;
          return `<div><div style="display:flex;align-items:center;gap:10px;margin-bottom:8px"><i style="width:10px;height:10px;border-radius:3px;background:${deptColor(d)}"></i><b style="font-size:13px">${esc(d)}</b><span class="muted" style="font-size:12px">${done}/${list.length} done</span><span style="flex:1;max-width:160px">${progressBar(list.length ? done / list.length : 0, { tone: done === list.length ? "complete" : "" })}</span></div><div class="task-list">${list.map(taskRow).join("")}</div></div>`;
        }).join("") || '<p class="muted">No data-collection tasks.</p>'}
      </div>
    </section>

    ${approvals.length || wfs.length ? `<section class="card"><div class="card-h"><div><h3>Workflow & approvals</h3><p>The APQR parent workflow and its electronic signature records</p></div></div><div class="task-list">${[...wfs, ...approvals].map(taskRow).join("")}</div></section>` : ""}

    <section class="card">
      <div class="card-h"><div><h3>References</h3></div></div>
      <dl class="kv">
        <dt>Current workflow</dt><dd class="mono">${esc(p.ref)}</dd>
        <dt>Workflow stage</dt><dd>${esc(p.wfStage || "–")} · ${esc(p.wfStatus || "–")}${p.wfDue ? ` · due ${fmtDate(p.wfDue)}` : ""}</dd>
        <dt>Workflow refs (${p.workflowRefs.length})</dt><dd class="mono">${esc(p.workflowRefs.join(" / ") || "–")}</dd>
        <dt>QC annexe refs</dt><dd class="mono">${esc(p.qcRefs.join(" / ") || "–")}</dd>
        <dt>Review period</dt><dd>${p.inPlan ? `${esc(p.reviewStart)} → ${esc(p.reviewEnd)}` : '<span class="tag info">NOT IN PLAN</span>'}</dd>
        <dt>Owner (Scigeniq)</dt><dd>${esc(p.tasks.find((t) => t.taskClass === "Workflow")?.assignee || "–")}</dd>
      </dl>
    </section>

    <section class="card">
      <div class="card-h"><div><h3>History</h3><p>Changes made in the app for this product</p></div></div>
      <div class="audit-list">${audit.map((a) => `<div class="a"><time>${esc(a.at.slice(0, 16).replace("T", " "))}</time><div><b>${esc(a.user)}</b> · ${esc(a.field)} <span class="muted">${esc(a.entity === "task" ? a.label : "")}</span><br><s>${esc(String(a.from ?? "").slice(0, 80))}</s> → <b>${esc(String(a.to ?? "").slice(0, 160))}</b></div></div>`).join("") || '<p class="muted" style="margin:0">No changes yet.</p>'}</div>
    </section>
  </div>`;
}

export function initDrawer() {
  const d = $("#drawer");
  $("#scrim").addEventListener("click", closeDrawer);
  d.addEventListener("click", (e) => {
    if (e.target.closest("[data-drawer-close]")) { closeDrawer(); return; }
    const ed = e.target.closest("[data-task-edit]");
    if (ed) { act.editTask(store.getState().tasks.find((t) => t.id === ed.dataset.taskEdit)); return; }
    if (e.target.closest("[data-add-task]")) { const p = store.getModel().productByKey.get(openKey); act.editTask(null, { product: p.product, ref: p.ref, dosageForm: p.dosageForm, site: p.site }); }
  });
  d.addEventListener("change", (e) => {
    const t = e.target;
    const p = store.getModel().productByKey.get(openKey);
    if (!p) return;
    if (t.dataset.pf) act.setProductField(p.key, t.dataset.pf, t.value.trim(), p.product);
  });
  d.addEventListener("focusout", (e) => { if (e.target.tagName === "TEXTAREA") setTimeout(refreshDrawer, 0); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && openKey && !document.querySelector("dialog[open]")) closeDrawer();
  });
}
