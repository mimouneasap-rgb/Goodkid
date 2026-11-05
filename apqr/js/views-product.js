// Product page: everything about one review on its own page, with every
// editable field (assignee, data collection owner, reviewer, stage, status,
// closed date, owner, priority, notes, actions, plan details) changeable here.
import { esc, icon, fmtN, fmtPct, fmtDate, fmtMonth, fmtDays, ragPill, fqPill, movementBadge, slotChip, slotCls } from "./ui.js";
import { ring, deptColor, slotCells } from "./charts.js";
import { SLOTS, FQ_PREREQ, dayInt, ROLES } from "./engine.js";
import * as store from "./store.js";
import * as act from "./actions.js";
import { peopleSelect, listSelect } from "./lists.js";

let currentKey = null;
try { currentKey = sessionStorage.getItem("apqr-product"); } catch { /* ignore */ }

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

/** One editable task row. */
function taskRow(t, L, { first = "", firstSpan = 1 } = {}) {
  const closedOnInput = t.closed ? `<label style="display:flex;align-items:center;gap:6px;margin-top:4px;font-size:11px;color:var(--muted)">closed<input type="date" class="inline" data-task-field="closedOn|${esc(t.id)}" value="${esc((t.closedOn || "").slice(0, 10))}" aria-label="Closed on"></label>` : "";
  const assignee = /^unassigned$/i.test(t.assignee || "") ? "" : t.assignee;
  return `<tr>
    ${first ? `<td rowspan="${firstSpan}" style="vertical-align:top;min-width:118px;max-width:150px">${first}</td>` : ""}
    <td style="min-width:150px;max-width:220px"><b style="font-size:12.5px">${esc(t.title)}</b><br><small class="muted"><span class="mono">${esc(t.ref)}</span>${t.appChanged ? ' <span class="tag new">IN APP</span>' : ""}${t.overdue === "YES" ? ' <span class="tag crit">LATE</span>' : ""}</small></td>
    <td>${peopleSelect(L, assignee, { cls: "inline", attrs: `data-task-assignee="${esc(t.id)}" aria-label="Assigned to"`, empty: `— ${t.assigneeInferred ? t.assigneeName : "Unassigned"} —`, dept: t.isAnnex ? t.dept : "" })}</td>
    <td>${t.isData ? peopleSelect(L, t.collectorPerson || t.app?.collector ? t.collector : "", { cls: "inline", attrs: `data-task-person="collector|${esc(t.id)}" aria-label="Data collection owner"`, empty: "— same as assigned —", dept: t.isAnnex ? t.dept : "" }) : '<span class="muted">—</span>'}</td>
    <td>${t.isData ? peopleSelect(L, t.reviewer, { cls: "inline", attrs: `data-task-person="reviewer|${esc(t.id)}" aria-label="Data reviewer" style="${t.reviewer ? "" : "box-shadow:inset 0 0 0 1px var(--warn)"}"`, empty: "— not set —" }) : '<span class="muted">—</span>'}</td>
    <td>${act.stageSelect(t, "inline")}${closedOnInput}</td>
    <td>${listSelect(L, "statuses", t.status, { cls: "inline", attrs: `data-task-field="status|${esc(t.id)}" aria-label="Status"`, empty: null })}</td>
    <td><button class="icon-btn sm" data-task-edit="${esc(t.id)}" aria-label="Edit all fields">${icon("edit")}</button></td>
  </tr>`;
}
const HEAD = `<tr><th>Annexe</th><th>Task</th><th>Assigned to</th><th>Data collection owner</th><th>Data reviewer</th><th>Stage · closed on</th><th>Status</th><th></th></tr>`;

export const productView = {
  id: "product",
  title: "Product file",
  sub: (m) => { const p = m.productByKey.get(currentKey); return p ? `${p.triggered ? p.ref : "Not triggered"} · ${p.dosageForm} · planned ${p.plannedMonth ? fmtMonth(p.plannedMonth) : "—"}` : "Choose a product"; },
  open(key) { currentKey = key; try { sessionStorage.setItem("apqr-product", key); } catch { /* ignore */ } },
  current: () => currentKey,
  render(m) {
    const p = m.productByKey.get(currentKey);
    if (!p) return `<div class="card"><p class="muted" style="margin:0 0 12px">No product selected.</p><a class="btn" href="#/tracker">${icon("tracker")}Open the APQR tracker</a></div>`;
    const s = store.getState();
    const L = store.lists();
    const idx = m.products.findIndex((x) => x.key === p.key);
    const prev = m.products[idx - 1], next = m.products[idx + 1];
    const plan = s.plan.find((x) => m.planByKey.get(p.key)?.id === x.id);
    const approvals = p.tasks.filter((t) => t.isApproval);
    const wfs = p.tasks.filter((t) => t.isWorkflow && !t.generated);
    const audit = s.audit.filter((a) => a.key === p.key).slice(0, 60);
    const lastClosed = p.tasks.filter((t) => t.isAnnex && FQ_PREREQ.includes(t.slot) && t.closedOn).map((t) => t.closedOn).sort().pop();

    // ten annexes table
    const annexRows = SLOTS.map((sl) => {
      const st = p.slots[sl.key];
      const label = `<div style="display:grid;gap:5px"><b style="font-size:13px"><i style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${deptColor(sl.dept)};margin-right:6px"></i>${esc(sl.label)}</b><small class="muted">${esc(sl.dept)}</small>${slotChip(st.status)}</div>`;
      if (st.tasks.length) return st.tasks.map((t, i) => taskRow(t, L, i === 0 ? { first: label, firstSpan: st.tasks.length } : {})).join("");
      if (st.status === "MISSING") return `<tr class="slot-missing-row"><td>${label}</td><td colspan="6"><span class="muted">Never raised in Scigeniq.</span></td><td><button class="btn btn-sm" data-add-task-slot="${esc(sl.key)}">${icon("plus")}Record</button></td></tr>`;
      const gen = p.tasks.find((t) => t.generated && t.slot === sl.key);
      return `<tr><td>${label}</td><td colspan="7"><span class="muted">${esc(gen?.title || "")} · workflow not triggered yet (assigned: ${esc(gen?.assigneeName || "")})</span></td></tr>`;
    }).join("");

    const fqHint = {
      "NOT TRIGGERED - data ready": `<div class="callout warn" style="margin-bottom:12px">${icon("alert")}<div><b>The five QA-stream annexes are closed${lastClosed ? ` (last on ${fmtDate(lastClosed)})` : ""}.</b> The Final QA Data Collection can be raised in Scigeniq today.</div></div>`,
      "Waiting on data collection": `<div class="callout" style="margin-bottom:12px">${icon("info")}<div>${p.fqPrereqOpen.length} of the five QA-stream annexes still to close before the Final QA can be raised: ${p.fqPrereqOpen.map((x) => esc(x)).join(", ")}.</div></div>`,
      "Not triggered": `<div class="callout" style="margin-bottom:12px">${icon("info")}<div>The APQR workflow has not been triggered in Scigeniq yet.</div></div>`,
    }[p.fqSignal] || "";

    return `
    <section class="dr-head phero reveal">
      <div class="phero-nav">
        ${prev ? `<button class="dr-back" data-open-product="${esc(prev.key)}" title="${esc(prev.product)}">${icon("back")}Previous</button>` : ""}
        ${next ? `<button class="dr-back" data-open-product="${esc(next.key)}" title="${esc(next.product)}">Next ${icon("arrowDown", "rot-270")}</button>` : ""}
        <span class="phero-count">${idx + 1} of ${m.products.length}</span>
      </div>
      <div class="eyebrow"><span class="mono">${esc(p.triggered ? p.ref : "Not triggered")}</span><span>·</span><span>${esc(p.dosageForm)}</span><span>·</span><span>${esc(p.site)}</span>${p.plannedMonth ? `<span>·</span><span>Planned ${fmtMonth(p.plannedMonth)}</span>` : ""}</div>
      <h2>${esc(p.product)}</h2>
      <div class="hstats">
        ${ring(p.pct, { size: 92, stroke: 9, label: "Annexes closed", color: p.pct === 1 ? "#5ee05e" : p.rag === "OVERDUE" ? "#ff8a8a" : "#5eead4" })}
        <div class="hstat"><div class="k">Annexes OK</div><div class="v">${p.slotsOk}<small>/ 10</small></div></div>
        <div class="hstat ${p.overdue && p.triggered ? "alert" : ""}"><div class="k">Open · late</div><div class="v">${p.annexOpen}<small>· ${p.overdue}</small></div></div>
        <div class="hstat ${p.fqSignal.startsWith("NOT TRIGGERED") ? "alert" : ""}"><div class="k">Final QA</div><div class="v" style="font-size:15px">${{ none: "Not raised", open: "Raised", done: "Closed" }[p.finalQa]}</div></div>
        <div class="hstat"><div class="k">PQR due</div><div class="v" style="font-size:15px">${p.overdueDate ? fmtDate(p.overdueDate) : "–"}</div><div class="d">${p.rag === "COMPLETE" ? "complete" : fmtDays(p.daysToOverdue)}</div></div>
        <div class="hstat"><div class="k">Status</div><div style="display:grid;gap:6px;margin-top:4px">${ragPill(p.rag)}${fqPill(p.fqSignal)}</div></div>
      </div>
    </section>

    <div class="grid g-12" style="margin-top:18px">
      <section class="card span-8 reveal">
        <div class="card-h"><div><h3>Status & timeline</h3><p>Calculated from the task register and the plan</p></div></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          ${p.flags.filter((f) => f !== "DATA READY").map((f) => `<span class="tag ${f === "DUPLICATE" || f === "MISSING ANNEXE" ? "warn" : "crit"}">${f}</span>`).join("")}
          ${p.prevPct !== null && s.baseline ? `<span class="muted" style="font-size:12.5px;display:inline-flex;align-items:center;gap:6px">${movementBadge(p.movement)} ${fmtPct(p.prevPct)} at baseline → <b style="color:var(--ink)">${fmtPct(p.pct)}</b> now</span>` : ""}
          ${p.bottleneck !== "-" ? `<span class="muted" style="font-size:12.5px">Bottleneck: <b style="color:var(--ink)">${esc(p.bottleneck)}</b></span>` : ""}
          <span class="muted" style="font-size:12.5px">Workflow stage: <b style="color:var(--ink)">${esc(p.wfStage)}</b></span>
        </div>
        ${timeline(p, m.report)}
      </section>
      <section class="card span-4 reveal">
        <div class="card-h"><div><h3>QA notes</h3><p>Kept across imports and published with the team version</p></div></div>
        <div class="form-grid" style="margin-bottom:12px">
          <label class="f">APQR owner${peopleSelect(L, s.products[p.key]?.owner || "", { attrs: 'data-pf="owner" id="pf-owner"', empty: `— ${p.scigeniqOwner || "Unassigned"} (Scigeniq) —` })}</label>
          <label class="f">Priority${listSelect(L, "priorities", p.priority || "", { attrs: 'data-pf="priority" id="pf-priority"', empty: "—" })}</label>
        </div>
        <label class="f">QA comments<textarea class="notes" data-pf="comments" id="pf-comments" placeholder="Decisions taken, deviations noted, who was contacted…">${esc(p.comments)}</textarea></label>
      </section>

      <section class="card span-12 table-card reveal">
        <div style="padding:20px 20px 0"><div class="card-h"><div><h3>The ten required annexes</h3><p>${p.triggered ? "Change any field and every figure updates. A slot is OK once one of its tasks is closed." : "Generated from the plan until the workflow is triggered in Scigeniq."}</p></div><div class="tools">${slotCells(p)}<a class="btn btn-sm btn-ghost" href="#/tasks?product=${encodeURIComponent(p.key)}&role=all">${icon("tasks")}Task register</a></div></div></div>
        <div class="table-wrap" style="max-height:none"><table class="data ptable"><thead>${HEAD}</thead><tbody>${annexRows}</tbody></table></div>
      </section>

      <section class="card span-12 table-card reveal">
        <div style="padding:20px 20px 0"><div class="card-h"><div><h3>Final QA compilation</h3><p>Raised by the APQR Owner once the five QA-stream annexes are closed (QA, QC OOS/OOT, Validation Process, Compliance, Supplier Qualification)</p></div><div class="tools">${fqPill(p.fqSignal)}${p.triggered && !p.finalQaTasks.length ? `<button class="btn btn-sm" data-add-final>${icon("plus")}Record the Final QA task</button>` : ""}</div></div>${fqHint}</div>
        ${p.finalQaTasks.length ? `<div class="table-wrap" style="max-height:none"><table class="data ptable"><thead>${HEAD.replace("<th>Annexe</th>", "")}</thead><tbody>${p.finalQaTasks.map((t) => taskRow(t, L)).join("")}</tbody></table></div>` : `<div style="height:8px"></div>`}
      </section>

      ${wfs.length || approvals.length ? `<section class="card span-12 table-card reveal">
        <div style="padding:20px 20px 0"><div class="card-h"><div><h3>Workflow & approvals</h3><p>The parent APQR workflow and its electronic signature records</p></div></div></div>
        <div class="table-wrap" style="max-height:none"><table class="data ptable"><thead>${HEAD.replace("<th>Annexe</th>", "")}</thead><tbody>${[...wfs, ...approvals].map((t) => taskRow(t, L)).join("")}</tbody></table></div>
      </section>` : ""}

      <section class="card span-6 reveal">
        <div class="card-h"><div><h3>Follow-up actions</h3><p>What has to happen next, who does it, by when</p></div><div class="tools"><button class="btn btn-sm btn-primary" data-add-action-here>${icon("plus")}Add action</button></div></div>
        <div style="display:grid;gap:8px">${p.actions.length ? p.actions.slice().sort((a, b) => Number(a.done) - Number(b.done) || String(a.due).localeCompare(String(b.due))).map((a) => `<div class="action-row ${a.done ? "done" : ""} ${a.overdue ? "late" : ""}"><input type="checkbox" data-paction-toggle="${esc(a.id)}" ${a.done ? "checked" : ""} aria-label="Mark done"><div style="min-width:0"><b>${esc(a.label)}</b><small>${esc(a.owner || "no owner")} · ${a.due ? `${a.overdue ? '<span style="color:var(--crit-ink);font-weight:700">' : ""}due ${fmtDate(a.due)}${a.overdue ? "</span>" : ""}` : "no target date"}</small></div><button class="icon-btn sm" data-paction-edit="${esc(a.id)}" aria-label="Edit action">${icon("edit")}</button></div>`).join("") : '<p class="muted" style="margin:0">No actions yet.</p>'}</div>
      </section>
      <section class="card span-6 reveal">
        <div class="card-h"><div><h3>Plan & references</h3><p>From the approved plan and Scigeniq</p></div><div class="tools">${plan ? `<button class="btn btn-sm" data-edit-plan="${esc(plan.id)}">${icon("edit")}Edit plan details</button>` : `<button class="btn btn-sm" data-add-plan>${icon("plus")}Add to plan</button>`}</div></div>
        <dl class="kv">
          <dt>Review period</dt><dd>${p.inPlan ? `${esc(p.reviewStart)} → ${esc(p.reviewEnd)}` : '<span class="tag info">NOT IN PLAN</span>'}</dd>
          <dt>Process · site</dt><dd>${esc(p.dosageForm || "–")} · ${esc(p.site || "–")}</dd>
          <dt>Plan # · status</dt><dd>${esc(plan?.no ?? "–")} · ${esc(plan?.planStatus || "–")}</dd>
          <dt>Current workflow</dt><dd class="mono">${esc(p.triggered ? p.ref : "—")}${p.wfDue ? ` · due ${fmtDate(p.wfDue)}` : ""}</dd>
          <dt>Workflow refs (${p.workflowRefs.length})</dt><dd class="mono">${esc(p.workflowRefs.join(" / ") || "–")}</dd>
          <dt>QC annexe refs</dt><dd class="mono">${esc(p.qcRefs.join(" / ") || "–")}</dd>
          <dt>Approvals</dt><dd>${p.approvalsSigned} signed${p.rejected ? ` · <b style="color:var(--crit-ink)">${p.rejected} rejected</b>` : ""}</dd>
        </dl>
      </section>

      <section class="card span-12 reveal">
        <div class="card-h"><div><h3>History</h3><p>Every change made in the app for this product</p></div></div>
        <div class="audit-list">${audit.map((a) => `<div class="a"><time>${esc(a.at.slice(0, 16).replace("T", " "))}</time><div><b>${esc(a.user)}</b> · ${esc(a.field)} <span class="muted">${esc(a.entity === "task" ? a.label : "")}</span><br><s>${esc(String(a.from ?? "").slice(0, 80))}</s> → <b>${esc(String(a.to ?? "").slice(0, 160))}</b></div></div>`).join("") || '<p class="muted" style="margin:0">No changes yet.</p>'}</div>
      </section>
    </div>`;
  },
  bind(root) {
    const p = () => store.getModel().productByKey.get(currentKey);
    root.addEventListener("change", (e) => {
      const t = e.target;
      const pr = p();
      if (!pr) return;
      if (t.dataset.pf) act.setProductField(pr.key, t.dataset.pf, t.value.trim(), pr.product);
      else if (t.dataset.pactionToggle) act.toggleAction(pr.key, t.dataset.pactionToggle, t.checked);
    });
    root.addEventListener("click", (e) => {
      const pr = p();
      if (!pr) return;
      const ed = e.target.closest("[data-task-edit]");
      if (ed) { act.editTask(store.getState().tasks.find((t) => t.id === ed.dataset.taskEdit)); return; }
      const sl = e.target.closest("[data-add-task-slot]");
      if (sl) { act.editTask(null, { product: pr.product, ref: pr.triggered ? pr.ref : "", dosageForm: pr.dosageForm, site: pr.site, taskRole: ROLES.ANNEX, annexSlot: sl.dataset.addTaskSlot, title: "" }); return; }
      if (e.target.closest("[data-add-final]")) { act.editTask(null, { product: pr.product, ref: pr.ref, dosageForm: pr.dosageForm, site: pr.site, taskRole: ROLES.FINAL, title: "Final QA Data Collection", taskType: "QA Data Collection" }); return; }
      if (e.target.closest("[data-add-action-here]")) { act.editAction(pr.key, null); return; }
      const ae = e.target.closest("[data-paction-edit]");
      if (ae) { act.editAction(pr.key, store.getState().products[pr.key]?.actions?.find((x) => x.id === ae.dataset.pactionEdit)); return; }
      const ep = e.target.closest("[data-edit-plan]");
      if (ep) { act.editPlan(store.getState().plan.find((x) => x.id === ep.dataset.editPlan)); return; }
      if (e.target.closest("[data-add-plan]")) act.editPlan(null, { product: pr.product, process: pr.dosageForm, site: pr.site });
    });
    // save notes when leaving the textarea (the store re-renders afterwards)
    root.querySelector("#pf-comments")?.addEventListener("blur", (e) => { const pr = p(); if (pr) act.setProductField(pr.key, "comments", e.target.value.trim(), pr.product); });
  },
};
