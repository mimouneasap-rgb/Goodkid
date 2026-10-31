// Product file: the slide-over panel with a review's ten annexes, Final QA,
// timeline, follow-up actions, notes and change history.
import { esc, icon, fmtN, fmtPct, fmtDate, fmtMonth, fmtDays, ragPill, fqPill, movementBadge, slotChip, slotCls, $ } from "./ui.js";
import { ring, deptColor, slotCells } from "./charts.js";
import { SLOTS, dayInt } from "./engine.js";
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
  const active = document.activeElement?.closest?.("#drawer") ? document.activeElement : null;
  if (active?.tagName === "TEXTAREA") return; // don't clobber typing
  const st = $("#drawer .dr-body")?.scrollTop || 0;
  render();
  const nb = $("#drawer .dr-body");
  if (nb) nb.scrollTop = st;
}

function timeline(p, report) {
  const my = (s) => { const m = /^(\d{2})\/(\d{4})$/.exec(s || ""); return m ? `${m[2]}-${m[1]}-01` : ""; };
  const pts = [
    { k: "Review start", d: my(p.reviewStart) },
    { k: "Review end", d: my(p.reviewEnd) },
    { k: "Planned PQR", d: p.plannedMonth ? p.plannedMonth.slice(0, 8) + "01" : "" },
    { k: "PQR overdue", d: p.overdueDate, cls: "due" },
    { k: "Today", d: report, cls: "today" },
  ].filter((x) => x.d).sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
  if (pts.length < 2) return '<p class="muted" style="margin:0">Not in the plan, so there is no review period or PQR due date.</p>';
  const days = pts.map((x) => dayInt(x.d));
  const min = Math.min(...days), span = Math.max(1, Math.max(...days) - min);
  const pos = (d) => 3 + ((dayInt(d) - min) / span) * 94;
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
  const approvals = p.tasks.filter((t) => t.isApproval);
  const wfs = p.tasks.filter((t) => t.isWorkflow && !t.generated);
  const audit = s.audit.filter((a) => a.key === p.key).slice(0, 40);
  const lastClosed = p.tasks.filter((t) => t.isAnnex && t.closedOn).map((t) => t.closedOn).sort().pop();

  const who = (t) => `${esc(t.collector)}${t.collectorType !== "user" ? ` <span class="tag warn">${esc(t.collectorType)}</span>` : ""}`;
  const taskLine = (t) => `<div class="row"><span title="${esc(t.title)} · owner ${esc(t.collector)}${t.reviewer ? ` · reviewer ${esc(t.reviewer)}` : ""}">${who(t)}${t.reviewer ? ` → ${esc(t.reviewer)}` : ""}${t.appChanged ? ' <span class="tag new">IN APP</span>' : ""}${t.overdue === "YES" ? ' · <b style="color:var(--crit-ink)">late</b>' : ""}</span>${act.stageSelect(t)}</div>`;
  const slotCard = (sl) => {
    const st = p.slots[sl.key];
    return `<div class="slot-card ${slotCls(st.status)}">
      <div class="sc-h"><div><b>${esc(sl.label)}</b><br><small><i style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${deptColor(sl.dept)};margin-right:5px"></i>${esc(sl.dept)}</small></div>${slotChip(st.status)}</div>
      ${st.tasks.length ? `<div class="sc-t">${st.tasks.map(taskLine).join("")}</div>` : st.status === "MISSING" ? `<small class="muted">Never raised in Scigeniq.</small> <button class="btn btn-sm" data-add-task-slot="${esc(sl.key)}">${icon("plus")}Record task</button>` : `<small class="muted">Workflow not triggered yet.</small>`}
    </div>`;
  };
  const task = (t) => `<div class="task ${t.closed ? "closed" : ""}"><span class="stripe" style="background:${t.isFinal ? "var(--accent)" : "var(--line-2)"}"></span>
    <div style="min-width:0"><b>${esc(t.title)}${t.appChanged ? ' <span class="tag new">IN APP</span>' : ""}</b><small><span class="mono">${esc(t.ref)}</span> · ${esc(t.assigneeName)}${t.assigneeType !== "user" ? ` (${esc(t.assigneeType)})` : ""} · ${t.closed ? `closed ${fmtDate(t.closedOn)}` : t.generated ? "not triggered" : `open ${t.ageing ?? "?"} d`}</small></div>
    <div class="tright">${t.generated ? "" : `${act.stageSelect(t)}<button class="icon-btn sm" data-task-edit="${esc(t.id)}" aria-label="Edit task">${icon("edit")}</button>`}</div></div>`;
  const fqHint = {
    "NOT TRIGGERED - data ready": `<div class="callout warn">${icon("alert")}<div><b>All ten annexes are closed${lastClosed ? ` (last on ${fmtDate(lastClosed)})` : ""}.</b> The Final QA Data Collection can be raised in Scigeniq today.</div></div>`,
    "Waiting on data collection": `<div class="callout">${icon("info")}<div>${10 - p.slotsOk} of the ten annexes still to close before the Final QA can be raised: ${SLOTS.filter((x) => p.slots[x.key].status !== "OK").map((x) => esc(x.label)).join(", ")}.</div></div>`,
    "Not triggered": `<div class="callout">${icon("info")}<div>The APQR workflow has not been triggered in Scigeniq yet. Its ten annexes and the Final QA are counted as “Not triggered”.</div></div>`,
  }[p.fqSignal] || "";

  $("#drawer").innerHTML = `
  <div class="dr-head">
    <button class="icon-btn close" data-drawer-close aria-label="Close">${icon("close")}</button>
    <button class="dr-back" data-drawer-close title="Back (Esc)">${icon("back")}Back</button>
    <div class="eyebrow"><span class="mono">${esc(p.triggered ? p.ref : "Not triggered")}</span><span>·</span><span>${esc(p.dosageForm)}</span><span>·</span><span>${esc(p.site)}</span>${p.plannedMonth ? `<span>·</span><span>Planned ${fmtMonth(p.plannedMonth)}</span>` : ""}</div>
    <h2>${esc(p.product)}</h2>
    <div class="hstats">
      ${ring(p.pct, { size: 92, stroke: 9, label: "Annexes closed", color: p.pct === 1 ? "#5ee05e" : p.rag === "OVERDUE" ? "#ff8a8a" : "#5eead4" })}
      <div class="hstat"><div class="k">Annexes OK</div><div class="v">${p.slotsOk}<small>/ 10</small></div></div>
      <div class="hstat ${p.overdue && p.triggered ? "alert" : ""}"><div class="k">Open · late</div><div class="v">${p.annexOpen}<small>· ${p.overdue}</small></div></div>
      <div class="hstat ${p.fqSignal.startsWith("NOT TRIGGERED") ? "alert" : ""}"><div class="k">Final QA</div><div class="v" style="font-size:15px">${{ none: "Not raised", open: "Raised", done: "Closed" }[p.finalQa]}</div></div>
      <div class="hstat"><div class="k">PQR due</div><div class="v" style="font-size:15px">${p.overdueDate ? fmtDate(p.overdueDate) : "–"}</div><div class="d">${p.rag === "COMPLETE" ? "complete" : fmtDays(p.daysToOverdue)}</div></div>
    </div>
  </div>
  <div class="dr-body">
    <section class="card">
      <div class="card-h"><div><h3>Status</h3><p>Calculated from the task register and the plan</p></div><div class="tools">${ragPill(p.rag)}${fqPill(p.fqSignal)}</div></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:6px">
        ${p.flags.filter((f) => f !== "DATA READY").map((f) => `<span class="tag ${f === "DUPLICATE" || f === "MISSING ANNEXE" ? "warn" : "crit"}">${f}</span>`).join("")}
        ${p.prevPct !== null && s.baseline ? `<span class="muted" style="font-size:12.5px;display:inline-flex;align-items:center;gap:6px">${movementBadge(p.movement)} ${fmtPct(p.prevPct)} at baseline → <b style="color:var(--ink)">${fmtPct(p.pct)}</b> now</span>` : ""}
        ${p.bottleneck !== "-" ? `<span class="muted" style="font-size:12.5px">Bottleneck: <b style="color:var(--ink)">${esc(p.bottleneck)}</b></span>` : ""}
        <span class="muted" style="font-size:12.5px">Workflow stage: <b style="color:var(--ink)">${esc(p.wfStage)}</b></span>
      </div>
      ${timeline(p, m.report)}
    </section>

    <section class="card">
      <div class="card-h"><div><h3>The ten required annexes</h3><p>${p.triggered ? "Change a stage here and every figure updates. A slot is OK once one of its tasks is closed." : "Generated from the plan until the workflow is triggered."}</p></div><div class="tools"><a class="btn btn-sm btn-ghost" href="#/tasks?product=${encodeURIComponent(p.key)}&role=all">${icon("tasks")}Task register</a></div></div>
      ${slotCells(p)}
      <div class="slot-grid" style="margin-top:12px">${SLOTS.map(slotCard).join("")}</div>
    </section>

    <section class="card">
      <div class="card-h"><div><h3>Final QA compilation</h3><p>Raised by the APQR Owner once all ten annexes are closed</p></div><div class="tools">${fqPill(p.fqSignal)}</div></div>
      ${fqHint}
      ${p.finalQaTasks.length ? `<div class="task-list" style="margin-top:10px">${p.finalQaTasks.map(task).join("")}</div>` : p.triggered ? `<div style="margin-top:10px"><button class="btn btn-sm" data-add-final>${icon("plus")}Record the Final QA task</button></div>` : ""}
    </section>

    <section class="card">
      <div class="card-h"><div><h3>Follow-up actions</h3><p>What has to happen next, who does it, by when</p></div><div class="tools"><button class="btn btn-sm btn-primary" data-add-action>${icon("plus")}Add action</button></div></div>
      <div style="display:grid;gap:8px">${p.actions.length ? p.actions.slice().sort((a, b) => Number(a.done) - Number(b.done) || String(a.due).localeCompare(String(b.due))).map((a) => `<div class="action-row ${a.done ? "done" : ""} ${a.overdue ? "late" : ""}"><input type="checkbox" data-action-toggle="${esc(a.id)}" ${a.done ? "checked" : ""} aria-label="Mark done"><div style="min-width:0"><b>${esc(a.text)}</b><small>${esc(a.owner || "no owner")} · ${a.due ? `${a.overdue ? '<span style="color:var(--crit-ink);font-weight:700">' : ""}due ${fmtDate(a.due)}${a.overdue ? "</span>" : ""}` : "no target date"}</small></div><button class="icon-btn sm" data-action-edit="${esc(a.id)}" aria-label="Edit action">${icon("edit")}</button></div>`).join("") : '<p class="muted" style="margin:0">No actions yet.</p>'}</div>
    </section>

    <section class="card">
      <div class="card-h"><div><h3>QA notes</h3><p>Kept across imports, exported to the workbook and published with the team version</p></div></div>
      <div class="form-grid" style="margin-bottom:12px">
        <label class="f">APQR owner<input data-pf="owner" id="pf-owner" list="dl-drawer-owners" value="${esc(s.products[p.key]?.owner || "")}" placeholder="${esc(p.scigeniqOwner || "Unassigned")} (from Scigeniq)"></label>
        <label class="f">Priority<select data-pf="priority" id="pf-priority">${["", "High", "Medium", "Low"].map((x) => `<option value="${x}"${(p.priority || "") === x ? " selected" : ""}>${x || "—"}</option>`).join("")}</select></label>
      </div>
      <label class="f">QA comments<textarea class="notes" data-pf="comments" id="pf-comments" placeholder="Context for the review: decisions taken, deviations noted, who was contacted…">${esc(p.comments)}</textarea></label>
      <datalist id="dl-drawer-owners">${m.owners.map((u) => `<option value="${esc(u)}">`).join("")}</datalist>
    </section>

    ${approvals.length || wfs.length ? `<section class="card"><div class="card-h"><div><h3>Workflow & approvals</h3><p>The APQR parent workflow and its electronic signature records</p></div></div><div class="task-list">${[...wfs, ...approvals].map(task).join("")}</div></section>` : ""}

    <section class="card">
      <div class="card-h"><div><h3>References</h3></div></div>
      <dl class="kv">
        <dt>Current workflow</dt><dd class="mono">${esc(p.triggered ? p.ref : "—")}</dd>
        <dt>Workflow stage</dt><dd>${esc(p.wfStage)}${p.wfStatus ? ` · ${esc(p.wfStatus)}` : ""}${p.wfDue ? ` · due ${fmtDate(p.wfDue)}` : ""}</dd>
        <dt>Workflow refs (${p.workflowRefs.length})</dt><dd class="mono">${esc(p.workflowRefs.join(" / ") || "–")}</dd>
        <dt>QC annexe refs</dt><dd class="mono">${esc(p.qcRefs.join(" / ") || "–")}</dd>
        <dt>Review period</dt><dd>${p.inPlan ? `${esc(p.reviewStart)} → ${esc(p.reviewEnd)} · plan #${esc(p.planNo)}` : '<span class="tag info">NOT IN PLAN</span>'}</dd>
        <dt>Approvals</dt><dd>${p.approvalsSigned} signed${p.rejected ? ` · <b style="color:var(--crit-ink)">${p.rejected} rejected</b>` : ""}</dd>
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
    const p = store.getModel().productByKey.get(openKey);
    if (!p) return;
    const ed = e.target.closest("[data-task-edit]");
    if (ed) { act.editTask(store.getState().tasks.find((t) => t.id === ed.dataset.taskEdit)); return; }
    const sl = e.target.closest("[data-add-task-slot]");
    if (sl) { const slot = sl.dataset.addTaskSlot; act.editTask(null, { product: p.product, ref: p.ref, dosageForm: p.dosageForm, site: p.site, taskRole: "Departmental annexe", annexSlot: slot, title: "" }); return; }
    if (e.target.closest("[data-add-final]")) { act.editTask(null, { product: p.product, ref: p.ref, dosageForm: p.dosageForm, site: p.site, taskRole: "Final QA compilation", title: "Final QA Data Collection", taskType: "QA Data Collection" }); return; }
    if (e.target.closest("[data-add-action]")) { act.editAction(p.key, null); return; }
    const ae = e.target.closest("[data-action-edit]");
    if (ae) { act.editAction(p.key, store.getState().products[p.key]?.actions?.find((x) => x.id === ae.dataset.actionEdit)); }
  });
  d.addEventListener("change", (e) => {
    const t = e.target;
    const p = store.getModel().productByKey.get(openKey);
    if (!p) return;
    if (t.dataset.pf) act.setProductField(p.key, t.dataset.pf, t.value.trim(), p.product);
    else if (t.dataset.actionToggle) act.toggleAction(p.key, t.dataset.actionToggle, t.checked);
  });
  d.addEventListener("focusout", (e) => { if (e.target.tagName === "TEXTAREA") setTimeout(refreshDrawer, 0); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && openKey && !document.querySelector("dialog[open]")) closeDrawer();
  });
}
