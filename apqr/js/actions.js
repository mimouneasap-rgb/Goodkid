// User actions shared by several views: editing tasks and plan rows, the
// import wizard, exports, demo data and baseline management.
import * as store from "./store.js";
import { compute, snapshotBaseline, productKey, dayInt, isoFromDay, CLASSES, STAGE_ORDER, monthYearToEnd, SLOTS, SLOT_BY_KEY, ROLES, classifyTask } from "./engine.js";
import { teamStatus, publishForTeam } from "./team.js";
import { listSelect, peopleSelect, titleSelect, typeOf } from "./lists.js";
import { readXlsx, parseCsv } from "./xlsx.js";
import { detect, importTrackerWorkbook, guessMapping, transformScigeniq, importPlanSheet, mergeTasks, SCIGENIQ_FIELDS, findHeaderRow, uid } from "./importers.js";
import { buildWorkbook, backupJson } from "./exporter.js";
import { demoState } from "./demo.js";
import { html, raw, esc, openDialog, confirmDialog, toast, download, fmtN, fmtDate, icon, $ } from "./ui.js";

const CLOSED_STAGES = new Set(["Completed", "Approved", "Closed", "Rejected"]);

/* ------------------------------------------------------------- tasks */

/** Set a task's stage and keep closure / status / closed date consistent. */
export function applyStage(t, stage, report) {
  t.stage = stage;
  if (CLOSED_STAGES.has(stage)) {
    t.closure = "Closed";
    t.status = "Completed";
    if (!t.closedOn) t.closedOn = report;
  } else {
    t.closure = "Not Closed";
    t.closedOn = "";
    if (t.status === "Completed" || !t.status) t.status = "Open";
  }
}

/** Record that a task was changed in the app, so Scigeniq refreshes keep the change. */
export function markApp(t, fields) {
  const s = store.getState();
  const app = { ...(t.app || {}) };
  for (const f of fields) app[f] = t[f];
  app.at = new Date().toISOString();
  app.by = s.meta.user || "local user";
  t.app = app;
}
const STAGE_FIELDS = ["stage", "closure", "status", "closedOn"];

export function setTaskStage(id, stage) {
  const s = store.getState();
  const t = s.tasks.find((x) => x.id === id);
  if (!t || t.stage === stage) return;
  const from = t.stage;
  store.update((st) => { const x = st.tasks.find((y) => y.id === id); applyStage(x, stage, store.getModel().report); markApp(x, STAGE_FIELDS); }, {
    audit: [{ entity: "task", key: productKey(t.product), label: `${t.ref} · ${t.title}`, field: "stage", from, to: stage }],
  });
}
export function setTaskAssignee(id, user) {
  user = user || "Unassigned";
  const t = store.getState().tasks.find((x) => x.id === id);
  if (!t || t.assignee === user) return;
  const from = t.assignee;
  store.update((st) => { const x = st.tasks.find((y) => y.id === id); x.assignee = user; const ty = typeOf(store.lists(), user); if (user !== "Unassigned" && ty !== "user") x.assigneeType = ty; else delete x.assigneeType; markApp(x, ["assignee", "assigneeType"]); }, {
    audit: [{ entity: "task", key: productKey(t.product), label: `${t.ref} · ${t.title}`, field: "assignee", from, to: user || "Unassigned" }],
  });
}

/** Set the data collection owner or data reviewer on one or many tasks. */
export function setTaskPerson(ids, field, name, type) {
  type = type || (name ? typeOf(store.lists(), String(name).trim()) : "user");
  const s = store.getState();
  const set = new Set(ids);
  const targets = s.tasks.filter((t) => set.has(t.id));
  if (!targets.length) return;
  const value = String(name || "").trim();
  const typeField = field === "collector" ? "collectorType" : "reviewerType";
  const audit = targets.filter((t) => (t[field] || "") !== value || (t[typeField] || "") !== (value ? type : "")).map((t) => ({ entity: "task", key: productKey(t.product), label: `${t.ref} · ${t.title}`, field: field === "collector" ? "data collection owner" : "data reviewer", from: t[field] || "", to: value ? `${value}${type !== "user" ? ` (${type})` : ""}` : "cleared" }));
  if (!audit.length) return;
  store.update((st) => {
    for (const t of st.tasks) if (set.has(t.id)) { if (value) { t[field] = value; t[typeField] = type; } else { delete t[field]; delete t[typeField]; } markApp(t, [field, typeField]); }
  }, { audit });
  if (targets.length > 1) toast(`${field === "collector" ? "Data collection owner" : "Reviewer"} set on ${fmtN(targets.length)} annexes`, { kind: "success" });
}

/**
 * Re-apply changes made in the app to freshly imported tasks: stage/closure,
 * assignee, owner and reviewer edits survive a Scigeniq refresh unless
 * Scigeniq has since closed the task itself; tasks added in the app are kept.
 */
export function preserveAppChanges(existing, incoming) {
  const norm = (x) => String(x || "").toLowerCase().replace(/\s+/g, " ").trim();
  const k = (t) => `${norm(t.ref)}|${norm(t.title)}|${productKey(t.product)}`;
  const byKey = new Map();
  for (const t of incoming) { const kk = k(t); if (!byKey.has(kk)) byKey.set(kk, []); byKey.get(kk).push(t); }
  let kept = 0, caughtUp = 0, added = 0;
  const out = [...incoming];
  for (const old of existing) {
    const has = old.app || old.source === "app" || old.collector || old.reviewer;
    if (!has) continue;
    const match = (byKey.get(k(old)) || []).shift();
    if (!match) {
      if (old.source === "app") { out.push(old); added++; }
      continue;
    }
    for (const f of ["collector", "collectorType", "reviewer", "reviewerType"]) if (old[f]) match[f] = old[f];
    if (old.app) {
      const app = { ...old.app };
      const scigeniqClosed = match.closure === "Closed";
      if ("stage" in app && scigeniqClosed && app.closure === "Closed") { for (const f of STAGE_FIELDS) delete app[f]; caughtUp++; }
      for (const f of Object.keys(app)) if (!["at", "by"].includes(f)) match[f] = app[f];
      if (Object.keys(app).some((f) => !["at", "by"].includes(f))) { match.app = app; kept++; }
    }
  }
  return { tasks: out, kept, caughtUp, added };
}

function stageOptions(current) {
  const names = store.lists().stages.map((x) => x.name).filter((n) => n !== "Not triggered");
  const opts = names.includes(current) || !current ? names : [current, ...names];
  return opts.map((s) => `<option value="${esc(s)}"${s === current ? " selected" : ""}>${esc(s)}${names.includes(s) ? "" : " (not in list)"}</option>`).join("");
}
export function stageSelect(t, cls = "") {
  return raw(`<select class="${cls}" data-task-stage="${esc(t.id)}" aria-label="Stage">${stageOptions(t.stage)}</select>`);
}

export function editTask(task, defaults = {}) {
  const model = store.getModel();
  const isNew = !task;
  const t = task ? { ...task } : { id: uid(), ref: "", product: "", dosageForm: "", site: "", department: "QA", stream: "QA", taskClass: "Data Collection", taskType: "", title: "", stage: "Collecting Data", status: "Open", assignee: "Unassigned", criticality: "Low", created: model.report, start: model.report, closedOn: "", closure: "Not Closed", createdBy: store.getState().meta.user || "", taskEnd: "", ...defaults };
  const products = [...new Set([...model.plan.map((p) => p.product), ...model.products.map((p) => p.product), t.product].filter(Boolean))].sort();
  const LISTS = store.lists();
  const ROLE0 = t.taskRole || classifyTask(t).role;
  const SLOT0 = t.annexSlot || classifyTask(t).slot || "";
  const titleSlot = (role, slot) => (role === ROLES.FINAL ? "Final QA" : role === ROLES.ANNEX ? slot : "__none__");
  const d = openDialog(html`<form method="dialog" class="modal-body" id="task-form">
    <h2 class="modal-title">${isNew ? "Add task" : "Edit task"}</h2>
    <div class="form-grid">
      <label class="f">Reference ID<input name="ref" value="${t.ref}" placeholder="APQR-KE-123" required><small>The Scigeniq reference of the task.</small></label>
      <label class="f">Assigned to${raw(peopleSelect(LISTS, t.assignee, { name: "assignee", empty: "— Unassigned —" }))}<small>Person, group or role, from the People list.</small></label>
      <label class="f full">Product${raw(`<select name="product" required><option value="">Choose a product…</option>${products.map((p) => `<option value="${esc(p)}"${p === t.product ? " selected" : ""}>${esc(p)}</option>`).join("")}</select>`)}</label>
      <label class="f">Role<select name="taskRole">${Object.values(ROLES).map((x) => raw(`<option${x === ROLE0 ? " selected" : ""}>${x}</option>`))}</select></label>
      <label class="f">Annexe slot<select name="annexSlot"><option value="">—</option>${SLOTS.map((x) => raw(`<option value="${esc(x.key)}"${x.key === SLOT0 ? " selected" : ""}>${esc(x.label)} (${esc(x.dept)})</option>`))}</select><small>Which of the ten required annexes this task fills.</small></label>
      <label class="f full" data-title-wrap>Title${raw(titleSelect(LISTS, titleSlot(ROLE0, SLOT0), t.title))}</label>
      <label class="f">Stage<select name="stage">${raw(stageOptions(t.stage))}</select></label>
      <label class="f">Status${raw(listSelect(LISTS, "statuses", t.status, { name: "status", empty: null }))}</label>
      <label class="f">Data collection owner${raw(peopleSelect(LISTS, t.collector || "", { name: "collector", empty: "— same as assigned —" }))}</label>
      <label class="f">Data reviewer${raw(peopleSelect(LISTS, t.reviewer || "", { name: "reviewer", empty: "— not set —" }))}</label>
      <label class="f">Criticality${raw(listSelect(LISTS, "criticality", t.criticality, { name: "criticality", empty: "—" }))}</label>
      <label class="f">Created<input type="date" name="created" value="${(t.created || "").slice(0, 10)}"></label>
      <label class="f">Closed on<input type="date" name="closedOn" value="${(t.closedOn || "").slice(0, 10)}"></label>
      <label class="f">Task end date (Scigeniq)<input type="date" name="taskEnd" value="${(t.taskEnd || "").slice(0, 10)}"></label>
    </div>
    <p class="muted" style="margin:0;font-size:12px">Missing an entry? Add it on the <a href="#/lists" data-close-dialog>Lists</a> page.</p>
    <div class="modal-actions">
      ${isNew ? "" : raw(`<button type="button" class="btn btn-ghost" data-act="delete" style="margin-right:auto;color:var(--crit-ink)">${icon("trash")}Delete</button>`)}
      <button type="button" class="btn btn-ghost" data-close>Cancel</button>
      <button class="btn btn-primary" value="ok">${isNew ? "Add task" : "Save changes"}</button>
    </div>
  </form>`, {
    onClose: (v) => {
      if (v !== "ok") return;
      const f = new FormData(d.querySelector("form"));
      const next = { ...t };
      for (const k of ["ref", "product", "title", "assignee", "status", "criticality", "taskRole", "annexSlot", "collector", "reviewer"]) next[k] = String(f.get(k) || "").trim();
      if (!next.title) next.title = t.title || (next.taskRole === ROLES.WORKFLOW ? `APQR , ${next.product}` : next.taskRole === ROLES.APPROVAL ? "Approval" : "");
      next.assigneeType = next.assignee ? typeOf(LISTS, next.assignee) : "";
      if (!next.assigneeType) delete next.assigneeType;
      if (!next.collector) { delete next.collector; delete next.collectorType; } else next.collectorType = typeOf(LISTS, next.collector);
      if (!next.reviewer) { delete next.reviewer; delete next.reviewerType; } else next.reviewerType = typeOf(LISTS, next.reviewer);
      if (next.taskRole === ROLES.APPROVAL) next.taskClass = "Approval";
      else if (next.taskRole === ROLES.WORKFLOW) next.taskClass = "Workflow";
      else next.taskClass = "Data Collection";
      if (next.taskRole !== ROLES.ANNEX) next.annexSlot = "";
      else if (!next.annexSlot) next.annexSlot = classifyTask(next).slot || "QA";
      next.department = next.taskRole === ROLES.ANNEX ? SLOT_BY_KEY[next.annexSlot].dept : next.taskRole === ROLES.APPROVAL ? "Approval" : "QA";
      next.assignee = next.assignee || "Unassigned";
      for (const k of ["created", "closedOn", "taskEnd"]) {
        const v2 = String(f.get(k) || "");
        next[k] = v2 && (t[k] || "").slice(0, 10) === v2 ? t[k] : v2;
      }
      next.start = t.start || next.created;
      next.stream = next.taskClass === "Approval" ? "Approval" : next.taskClass === "Workflow" ? "APQR Workflow" : next.annexSlot ? classifyTask({ title: next.title, taskClass: next.taskClass }).stream || next.department : "QA";
      applyStage(next, String(f.get("stage")), model.report);
      if (f.get("closedOn")) next.closedOn = next.closure === "Closed" ? (next.closedOn || String(f.get("closedOn"))) : "";
      const pl = model.planByKey.get(productKey(next.product));
      if (pl) { next.product = pl.product; next.dosageForm = next.dosageForm || pl.process; next.site = next.site || pl.site; }
      const changes = isNew ? [{ entity: "task", key: productKey(next.product), label: `${next.ref} · ${next.title}`, field: "created", from: "", to: "new task" }]
        : Object.keys(next).filter((k) => k !== "id" && String(next[k] ?? "") !== String(task[k] ?? "")).map((k) => ({ entity: "task", key: productKey(next.product), label: `${next.ref} · ${next.title}`, field: k, from: task[k], to: next[k] }));
      if (!changes.length) return;
      store.update((st) => {
        if (isNew) { next.source = "app"; st.tasks.push(next); }
        else { markApp(next, changes.map((c) => c.field).filter((f) => !["app", "id"].includes(f))); Object.assign(st.tasks.find((x) => x.id === t.id), next); }
      }, { audit: changes });
      toast(isNew ? "Task added" : "Task updated", { kind: "success" });
    },
  });
  d.querySelector("form").addEventListener("change", (e) => {
    if (e.target.name !== "taskRole" && e.target.name !== "annexSlot") return;
    const f = d.querySelector("form");
    const wrap = f.querySelector("[data-title-wrap]");
    const cur = f.elements.namedItem("title")?.value || "";
    wrap.innerHTML = `Title${titleSelect(LISTS, titleSlot(f.taskRole.value, f.annexSlot.value), cur)}`;
  });
  d.querySelector("[data-close-dialog]")?.addEventListener("click", () => d.close("cancel"));
  d.querySelector('[data-act="delete"]')?.addEventListener("click", async () => {
    d.close("cancel");
    if (await confirmDialog({ title: "Delete this task?", body: `${t.ref} · ${t.title} will be removed from the task register.`, confirm: "Delete", danger: true })) {
      store.update((st) => { st.tasks = st.tasks.filter((x) => x.id !== t.id); }, { undoable: true, audit: [{ entity: "task", key: productKey(t.product), label: `${t.ref} · ${t.title}`, field: "deleted", from: t.stage, to: "" }] });
      toast("Task deleted", { action: "Undo", onAction: () => store.undo() });
    }
  });
}

/* -------------------------------------------------------------- plan */

export function editPlan(row) {
  const isNew = !row;
  const s = store.getState();
  const p = row ? { ...row } : { id: uid(), no: (Math.max(0, ...s.plan.map((x) => +x.no || 0)) + 1), product: "", process: "Tablets", execYear: new Date().getFullYear(), site: "", reviewStart: "", reviewEnd: "", periodEnd: "", planStatus: "Approved" };
  const forms = [...new Set(["Tablets", "Hard Capsule", "Liquid/Syrup", "Semi Solid", ...s.plan.map((x) => x.process).filter(Boolean)])];
  const toMonthInput = (my) => { const m = /^(\d{2})\/(\d{4})$/.exec(my || ""); return m ? `${m[2]}-${m[1]}` : ""; };
  const d = openDialog(html`<form method="dialog" class="modal-body">
    <h2 class="modal-title">${isNew ? "Add planned product" : "Edit planned product"}</h2>
    <div class="form-grid">
      <label class="f full">Product<input name="product" value="${p.product}" required placeholder="Brand (Molecule) strength form (pack)-SITE"><small>Must match the product name used in Scigeniq (the text after “APQR ,” in the parent action).</small></label>
      <label class="f">Process / dosage form${raw(listSelect(store.lists(), "dosageForms", p.process, { name: "process", empty: "—" }))}</label>
      <label class="f">Site${raw(listSelect(store.lists(), "sites", p.site, { name: "site", empty: "—" }))}</label>
      <label class="f">Review start<input type="month" name="reviewStart" value="${toMonthInput(p.reviewStart)}"></label>
      <label class="f">Review end<input type="month" name="reviewEnd" value="${toMonthInput(p.reviewEnd)}" required><small>The planned PQR month is the month after this.</small></label>
      <label class="f">Plan #<input name="no" value="${p.no}"></label>
      <label class="f">Exec. year<select name="execYear">${[...new Set([String(p.execYear || ""), ...Array.from({ length: 9 }, (_, i) => String(new Date().getFullYear() - 3 + i))])].filter(Boolean).sort().map((y) => raw(`<option${String(p.execYear) === y ? " selected" : ""}>${y}</option>`))}</select></label>
      <label class="f">Plan status${raw(listSelect(store.lists(), "planStatuses", p.planStatus, { name: "planStatus", empty: null }))}</label>
    </div>
    <p class="muted" style="margin:0;font-size:12px">Process, site and plan status come from the Lists page.</p>
    <div class="modal-actions">
      ${isNew ? "" : raw(`<button type="button" class="btn btn-ghost" data-act="delete" style="margin-right:auto;color:var(--crit-ink)">${icon("trash")}Remove</button>`)}
      <button type="button" class="btn btn-ghost" data-close>Cancel</button>
      <button class="btn btn-primary" value="ok">${isNew ? "Add to plan" : "Save"}</button>
    </div></form>`, {
    onClose: (v) => {
      if (v !== "ok") return;
      const f = new FormData(d.querySelector("form"));
      const fromMonth = (x) => { const m = /^(\d{4})-(\d{2})$/.exec(String(x || "")); return m ? `${m[2]}/${m[1]}` : ""; };
      const next = { ...p, product: String(f.get("product")).trim(), process: String(f.get("process")).trim(), site: String(f.get("site")).trim(), reviewStart: fromMonth(f.get("reviewStart")), reviewEnd: fromMonth(f.get("reviewEnd")), no: String(f.get("no")).trim(), execYear: String(f.get("execYear")).trim(), planStatus: String(f.get("planStatus")) };
      next.periodEnd = monthYearToEnd(next.reviewEnd);
      if (!isNew && row.product !== next.product) {
        // keep annotations attached to the renamed product
        const oldK = productKey(row.product), newK = productKey(next.product);
        store.update((st) => { if (st.products[oldK] && !st.products[newK]) { st.products[newK] = st.products[oldK]; delete st.products[oldK]; } });
      }
      const changes = isNew ? [{ entity: "plan", key: productKey(next.product), label: next.product, field: "added", from: "", to: next.reviewEnd }]
        : ["product", "process", "site", "reviewStart", "reviewEnd", "no", "execYear", "planStatus"].filter((k) => String(next[k]) !== String(row[k])).map((k) => ({ entity: "plan", key: productKey(next.product), label: next.product, field: k, from: row[k], to: next[k] }));
      if (!changes.length) return;
      store.update((st) => { if (isNew) st.plan.push(next); else Object.assign(st.plan.find((x) => x.id === p.id), next); }, { audit: changes });
      toast(isNew ? "Added to plan" : "Plan updated", { kind: "success" });
    },
  });
  d.querySelector('[data-act="delete"]')?.addEventListener("click", async () => {
    d.close("cancel");
    if (await confirmDialog({ title: "Remove from plan?", body: `${p.product} will be removed from the plan. Its Scigeniq tasks stay in the task register.`, confirm: "Remove", danger: true })) {
      store.update((st) => { st.plan = st.plan.filter((x) => x.id !== p.id); }, { undoable: true, audit: [{ entity: "plan", key: productKey(p.product), label: p.product, field: "removed", from: p.reviewEnd, to: "" }] });
      toast("Removed from plan", { action: "Undo", onAction: () => store.undo() });
    }
  });
}

/* ---------------------------------------------------- product notes */

export function setProductField(key, field, value, label) {
  const s = store.getState();
  const from = s.products[key]?.[field] ?? "";
  if (String(from) === String(value ?? "")) return;
  store.update((st) => {
    st.products[key] = { ...(st.products[key] || {}), [field]: value };
    if (value === "" || value === null) delete st.products[key][field];
  }, { audit: [{ entity: "product", key, label, field, from, to: value }] });
}

/* ------------------------------------------------------- report date */

export function editReportDate() {
  const s = store.getState().settings;
  const d = openDialog(html`<form method="dialog" class="modal-body">
    <h2 class="modal-title">Report date</h2>
    <p class="muted" style="margin:0">Overdue flags, days-to-due and RAG status are judged against this date.</p>
    <label class="f check"><input type="checkbox" name="useToday" ${s.useToday ? "checked" : ""}> Always use today’s date</label>
    <label class="f">Fixed report date<input type="date" name="reportDate" value="${s.reportDate}"></label>
    <div class="form-grid">
      <label class="f">PQR overdue after (months)<select name="overdueMonths"><option value="1"${s.overdueMonths == 1 ? " selected" : ""}>1</option><option value="2"${s.overdueMonths == 2 ? " selected" : ""}>2</option><option value="3"${s.overdueMonths == 3 ? " selected" : ""}>3</option><option value="4"${s.overdueMonths == 4 ? " selected" : ""}>4</option><option value="5"${s.overdueMonths == 5 ? " selected" : ""}>5</option><option value="6"${s.overdueMonths == 6 ? " selected" : ""}>6</option><option value="7"${s.overdueMonths == 7 ? " selected" : ""}>7</option><option value="8"${s.overdueMonths == 8 ? " selected" : ""}>8</option><option value="9"${s.overdueMonths == 9 ? " selected" : ""}>9</option><option value="10"${s.overdueMonths == 10 ? " selected" : ""}>10</option><option value="11"${s.overdueMonths == 11 ? " selected" : ""}>11</option><option value="12"${s.overdueMonths == 12 ? " selected" : ""}>12</option></select><small>From the 1st of the planned PQR month.</small></label>
      <label class="f">“Due soon” threshold (days)<select name="dueSoonDays"><option value="0"${s.dueSoonDays == 0 ? " selected" : ""}>0</option><option value="7"${s.dueSoonDays == 7 ? " selected" : ""}>7</option><option value="10"${s.dueSoonDays == 10 ? " selected" : ""}>10</option><option value="14"${s.dueSoonDays == 14 ? " selected" : ""}>14</option><option value="21"${s.dueSoonDays == 21 ? " selected" : ""}>21</option><option value="30"${s.dueSoonDays == 30 ? " selected" : ""}>30</option><option value="45"${s.dueSoonDays == 45 ? " selected" : ""}>45</option><option value="60"${s.dueSoonDays == 60 ? " selected" : ""}>60</option></select></label>
    </div>
    <div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" value="ok">Apply</button></div>
  </form>`, {
    onClose: (v) => {
      if (v !== "ok") return;
      const f = new FormData(d.querySelector("form"));
      saveSettings({ useToday: !!f.get("useToday"), reportDate: String(f.get("reportDate") || s.reportDate), overdueMonths: +f.get("overdueMonths"), dueSoonDays: +f.get("dueSoonDays") });
    },
  });
}

export function saveSettings(patch) {
  const s = store.getState().settings;
  const changes = Object.entries(patch).filter(([k, v]) => s[k] !== v).map(([k, v]) => ({ entity: "settings", label: "Settings", field: k, from: s[k], to: v }));
  if (!changes.length) return;
  store.update((st) => Object.assign(st.settings, patch), { audit: changes });
  toast("Settings updated", { kind: "success" });
}
export function saveMeta(patch) {
  const m = store.getState().meta;
  const changes = Object.entries(patch).filter(([k, v]) => (m[k] || "") !== v).map(([k, v]) => ({ entity: "settings", label: "Programme", field: k, from: m[k], to: v }));
  if (!changes.length) return;
  store.update((st) => Object.assign(st.meta, patch), { audit: changes });
}

/* ---------------------------------------------------------- baseline */

export function takeBaseline(label) {
  const model = store.getModel();
  const lbl = label || fmtDate(model.report);
  store.update((st) => { st.baseline = snapshotBaseline(model, lbl); for (const k of Object.keys(st.products)) delete st.products[k].isNew; }, { undoable: true, audit: [{ entity: "baseline", label: "Baseline", field: "snapshot", from: store.getState().baseline?.label || "", to: lbl }] });
  toast(`Baseline set to ${lbl}. Movement is now measured from here.`, { kind: "success", action: "Undo", onAction: () => store.undo() });
}
export function clearBaseline() {
  store.update((st) => { st.baseline = null; for (const k of Object.keys(st.products)) delete st.products[k].isNew; }, { undoable: true, audit: [{ entity: "baseline", label: "Baseline", field: "cleared", from: store.getState().baseline?.label || "", to: "" }] });
  toast("Baseline cleared", { action: "Undo", onAction: () => store.undo() });
}

/* ----------------------------------------------------------- exports */

export async function exportExcel() {
  try {
    const blob = await buildWorkbook(store.getState(), store.getModel());
    const d = store.getModel().report.replaceAll("-", "");
    if (await download(blob, `APQR_Master_Tracker_${d}.xlsx`)) toast("Excel workbook exported", { kind: "success" });
  } catch (e) { console.error(e); toast(`Export failed: ${e.message}`, { kind: "error" }); }
}
export async function exportJson() {
  if (await download(backupJson(store.getState()), `APQR_Tracker_backup_${new Date().toISOString().slice(0, 10)}.json`)) toast("Backup saved", { kind: "success" });
}

/* ------------------------------------------------------- demo / reset */

export async function loadDemo() {
  if (store.hasData() && !(await confirmDialog({ title: "Replace your data with demo data?", body: "Everything currently in the app will be replaced by a fictional demo programme. Export a backup first if you want to keep it.", confirm: "Load demo", danger: true }))) return;
  const s = demoState();
  delete s._prevPct;
  // Baseline = the same programme 60 days ago, so movement figures show something.
  const R = dayInt(s.settings.reportDate);
  const past = isoFromDay(R - 60);
  const old = JSON.parse(JSON.stringify(s));
  old.tasks = old.tasks.filter((t) => (t.created || "") <= past).map((t) => (t.closedOn && t.closedOn > past ? { ...t, closure: "Not Closed", closedOn: "", stage: t.taskClass === "Approval" ? "Approved" : "Collecting Data" } : t)).filter((t) => !(t.taskClass === "Approval" && (t.closedOn || "") > past));
  old.settings = { ...old.settings, useToday: false, reportDate: past };
  s.baseline = snapshotBaseline(compute(old), fmtDate(past));
  s.products = {};
  store.replace(s, { label: "Load demo" });
  toast("Demo programme loaded (fictional data)", { kind: "success", action: "Undo", onAction: () => store.undo() });
}
export async function resetToSeed() {
  if (!(await confirmDialog({ title: "Go back to the published data?", body: "Your changes in this browser (stages, comments, imports, baseline) will be replaced by the data this page was published with.", confirm: "Reset", danger: true }))) return;
  store.replace(store.seedState(), { label: "Reset to published data", clean: true });
  toast("Published data restored", { kind: "success", action: "Undo", onAction: () => store.undo() });
}
export async function clearAll() {
  if (!(await confirmDialog({ title: "Clear all data?", body: "The plan, task register, comments, baseline and audit trail will be removed from this browser.", confirm: "Clear everything", danger: true }))) return;
  store.replace(store.emptyState(), { label: "Clear all" });
  toast("All data cleared", { action: "Undo", onAction: () => store.undo() });
}

/* ------------------------------------------------------------ import */

export function pickFile() { $("#file-input").click(); }

export async function handleFile(file) {
  if (!file) return;
  try {
    const name = file.name.toLowerCase();
    if (name.endsWith(".json")) return importJson(await file.text());
    let wb;
    if (name.endsWith(".csv") || name.endsWith(".txt")) wb = { sheets: [{ name: file.name.replace(/\.\w+$/, ""), rows: parseCsv(await file.text()) }] };
    else if (name.endsWith(".xls")) throw new Error("Old .xls files aren’t supported. Open the file in Excel and save it as an Excel Workbook (.xlsx).");
    else wb = await readXlsx(await file.arrayBuffer());
    const kind = detect(wb);
    if (kind.kind === "tracker") return previewTracker(wb, file.name);
    if (kind.kind === "plan") return previewPlan(wb, kind, file.name);
    return scigeniqWizard(wb, kind, file.name);
  } catch (e) {
    console.error(e);
    toast(e.message || "That file could not be read", { kind: "error", timeout: 8000 });
  }
}

function importJson(text) {
  let data;
  try { data = JSON.parse(text); } catch { throw new Error("This JSON file could not be parsed."); }
  const st = data.state || data;
  if (!Array.isArray(st.tasks) || !Array.isArray(st.plan)) throw new Error("This JSON file is not an APQR tracker backup.");
  confirmDialog({ title: "Restore this backup?", body: `${fmtN(st.plan.length)} planned products and ${fmtN(st.tasks.length)} tasks will replace the data in the app.`, confirm: "Restore" }).then((ok) => {
    if (!ok) return;
    store.replace(st, { label: "Restore backup" });
    toast("Backup restored", { kind: "success", action: "Undo", onAction: () => store.undo() });
  });
}

function previewTracker(wb, fileName) {
  const imp = importTrackerWorkbook(wb);
  const current = store.getState();
  const comments = Object.values(imp.products).filter((a) => a.comments).length;
  const localComments = Object.values(current.products).filter((a) => a.comments).length;
  const d = openDialog(html`<form method="dialog" class="modal-body">
    <h2 class="modal-title">Import APQR master tracker</h2>
    <p class="muted" style="margin:0">${fileName}</p>
    <div class="preview-stats">
      <div class="stat"><div class="k">Planned products</div><div class="v">${fmtN(imp.plan.length)}</div></div>
      <div class="stat"><div class="k">Task register rows</div><div class="v">${fmtN(imp.tasks.length)}</div></div>
      <div class="stat"><div class="k">Tracker comments</div><div class="v">${fmtN(comments)}</div></div>
      <div class="stat"><div class="k">Report date</div><div class="v" style="font-size:16px">${imp.settings.reportDate ? fmtDate(imp.settings.reportDate) : "–"}</div></div>
    </div>
    ${imp.baseline ? raw(`<div class="callout">${icon("history")}<div>The workbook carries a comparison baseline (<b>${esc(imp.baseline.label)}</b>) with previous % complete for ${fmtN(Object.keys(imp.baseline.prevPct).length)} products. It will be used for the movement figures.</div></div>`) : ""}
    ${imp.warnings.length ? raw(`<div class="callout warn">${icon("alert")}<div>${imp.warnings.map(esc).join("<br>")}</div></div>`) : ""}
    <label class="f check"><input type="checkbox" name="useFileDate" ${imp.settings.reportDate ? "checked" : ""}> Use the workbook’s report date (${imp.settings.reportDate ? fmtDate(imp.settings.reportDate) : "none"}) instead of today</label>
    ${current.tasks.some((t) => t.app || t.source === "app") ? raw(`<label class="f check"><input type="checkbox" name="keepApp" checked> Keep the ${current.tasks.filter((t) => t.app || t.source === "app").length} task change(s) made in the app (closures, owners, reviewers, added tasks)</label>`) : ""}
    ${localComments ? raw(`<label class="f check"><input type="checkbox" name="keepComments" checked> Keep the ${localComments} comment(s) already entered in the app where the workbook has none</label>`) : ""}
    ${store.hasData() ? raw(`<div class="callout warn">${icon("alert")}<div>This replaces the plan and task register currently in the app. You can undo straight after.</div></div>`) : ""}
    <div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" value="ok">${icon("upload")}Import</button></div>
  </form>`, {
    onClose: (v) => {
      if (v !== "ok") return;
      const f = new FormData(d.querySelector("form"));
      const products = { ...imp.products };
      if (f.get("keepComments")) for (const [k, a] of Object.entries(current.products)) if (a.comments && !products[k]?.comments) products[k] = { ...(products[k] || {}), comments: a.comments, ...(a.priority ? { priority: a.priority } : {}), ...(a.owner ? { owner: a.owner } : {}) };
      const settings = { ...current.settings, ...imp.settings };
      if (f.get("useFileDate") && imp.settings.reportDate) settings.useToday = false; else settings.useToday = true;
      const prog = (imp.programme || "").split("|")[0].trim();
      store.replace({
        ...current,
        meta: { ...current.meta, programme: current.meta.programme && current.meta.programme !== "APQR Master Tracker" ? current.meta.programme : prog ? `${prog.charAt(0)}${prog.slice(1).toLowerCase()} APQR programme` : "APQR Master Tracker", organisation: current.meta.organisation || imp.organisation || "", planRef: current.meta.planRef || imp.planRef || "", source: fileName, sourceDate: imp.settings.reportDate || "", importedAt: new Date().toISOString() },
        lists: imp.lists || current.lists,
        settings, plan: imp.plan, tasks: f.get("keepApp") ? preserveAppChanges(current.tasks, imp.tasks).tasks : imp.tasks, products, excluded: imp.excluded, baseline: imp.baseline,
        audit: [{ at: new Date().toISOString(), user: current.meta.user || "local user", entity: "data", label: fileName, field: "import", from: "", to: `master tracker: ${imp.plan.length} plan rows, ${imp.tasks.length} tasks` }, ...current.audit],
      }, { label: "Import tracker" });
      toast(`Imported ${fmtN(imp.tasks.length)} tasks and ${fmtN(imp.plan.length)} planned products`, { kind: "success", action: "Undo", onAction: () => store.undo() });
    },
  });
}

function previewPlan(wb, kind, fileName) {
  const rows = wb.sheets.find((s) => s.name === kind.sheet).rows;
  const plan = importPlanSheet(rows, kind.headerRow);
  const d = openDialog(html`<form method="dialog" class="modal-body">
    <h2 class="modal-title">Import APQR plan</h2>
    <p class="muted" style="margin:0">${fileName} · sheet “${kind.sheet}”</p>
    <div class="preview-stats"><div class="stat"><div class="k">Products</div><div class="v">${fmtN(plan.length)}</div></div><div class="stat"><div class="k">With review end</div><div class="v">${fmtN(plan.filter((p) => p.periodEnd).length)}</div></div></div>
    <label class="f">How should these rows be applied?<select name="mode"><option value="replace">Replace the plan</option><option value="merge">Add new products, update existing ones</option></select></label>
    <div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" value="ok">${icon("upload")}Import plan</button></div>
  </form>`, {
    onClose: (v) => {
      if (v !== "ok") return;
      const mode = new FormData(d.querySelector("form")).get("mode");
      store.update((st) => {
        if (mode === "replace") st.plan = plan;
        else {
          const byKey = new Map(st.plan.map((p) => [productKey(p.product), p]));
          for (const p of plan) { const hit = byKey.get(productKey(p.product)); if (hit) Object.assign(hit, { ...p, id: hit.id }); else st.plan.push(p); }
        }
      }, { undoable: true, audit: [{ entity: "data", label: fileName, field: "import", from: "", to: `plan (${mode}): ${plan.length} rows` }] });
      toast(`Plan imported: ${fmtN(plan.length)} products`, { kind: "success", action: "Undo", onAction: () => store.undo() });
    },
  });
}

function scigeniqWizard(wb, kind, fileName) {
  const sheets = wb.sheets.filter((s) => s.rows?.length);
  if (!sheets.length) throw new Error("The file has no data.");
  let sheetName = kind.sheet || sheets.sort((a, b) => b.rows.length - a.rows.length)[0].name;
  const state = store.getState();
  const hadTasks = state.tasks.length > 0;
  let headerRow, mapping;
  const setup = () => {
    const rows = wb.sheets.find((s) => s.name === sheetName).rows;
    const hr = kind.sheet === sheetName && kind.headerRow >= 0 ? kind.headerRow : findHeaderRow(rows, SCIGENIQ_FIELDS.flatMap((f) => f.names)).row;
    headerRow = Math.max(0, hr);
    mapping = guessMapping(rows[headerRow] || []);
  };
  setup();
  const d = openDialog(`<form method="dialog" class="modal-body" id="sci-form"></form>`, { wide: true });
  const form = d.querySelector("form");
  let dateOrder = "DMY", mode = "replace", snapshot = hadTasks, label = state.meta.sourceDate ? fmtDate(state.meta.sourceDate) : fmtDate(store.getModel().report);

  const draw = () => {
    const rows = wb.sheets.find((s) => s.name === sheetName).rows;
    const header = Array.from(rows[headerRow] || []);
    const sample = rows.slice(headerRow + 1, headerRow + 40).find((r) => r && r.filter(Boolean).length > 3) || [];
    let result = null, err = "";
    const missing = SCIGENIQ_FIELDS.filter((f) => f.required && !(mapping[f.key] >= 0));
    if (!missing.length) {
      try { result = transformScigeniq(rows, { mapping, headerRow, dateOrder, plan: state.plan }); } catch (e) { err = e.message; }
    }
    const planKeys = new Set(state.plan.map((p) => productKey(p.product)));
    const prodKeys = result ? [...new Set(result.tasks.map((t) => productKey(t.product)))] : [];
    const matched = prodKeys.filter((k) => planKeys.has(k)).length;
    const colOpts = (sel) => `<option value="-1">— not in file —</option>` + header.map((h, i) => (h !== undefined && h !== "" ? `<option value="${i}"${i === sel ? " selected" : ""}>${esc(h)}</option>` : "")).join("");
    form.innerHTML = String(html`
      <h2 class="modal-title">Import Scigeniq eQMS export</h2>
      <p class="muted" style="margin:-8px 0 0">${fileName} — each row is one Scigeniq task. Check the column mapping, then import.</p>
      <div class="form-grid">
        <label class="f">Sheet<select name="sheet">${sheets.map((s) => raw(`<option${s.name === sheetName ? " selected" : ""}>${esc(s.name)}</option>`))}</select></label>
        <label class="f">Header row<input type="number" name="headerRow" min="1" value="${headerRow + 1}"></label>
      </div>
      <div style="max-height:300px;overflow:auto;border:1px solid var(--line);border-radius:12px">
        <table class="map-table"><tbody>${SCIGENIQ_FIELDS.map((f) => raw(`<tr><td>${esc(f.label)}${f.required ? ' <span style="color:var(--crit-ink)">*</span>' : ""}</td><td><select data-map="${f.key}">${colOpts(mapping[f.key])}</select></td><td class="sample">${mapping[f.key] >= 0 ? esc(sample[mapping[f.key]] ?? "") : ""}</td></tr>`))}</tbody></table>
      </div>
      <div class="form-grid">
        <label class="f">Dates in text cells are<select name="dateOrder"><option value="DMY"${dateOrder === "DMY" ? " selected" : ""}>day/month/year</option><option value="MDY"${dateOrder === "MDY" ? " selected" : ""}>month/day/year</option></select></label>
        <label class="f">Apply as<select name="mode"><option value="replace"${mode === "replace" ? " selected" : ""}>Replace the task register (monthly refresh)</option><option value="merge"${mode === "merge" ? " selected" : ""}>Merge: update matching tasks, add new ones</option></select></label>
        ${hadTasks ? raw(`<label class="f check full"><input type="checkbox" name="snapshot"${snapshot ? " checked" : ""}> Save the current figures as the comparison baseline first, labelled <input name="label" value="${esc(label)}" style="height:30px;width:130px;margin-left:6px"></label>`) : ""}
      </div>
      ${missing.length ? raw(`<div class="callout warn">${icon("alert")}<div>Map the required column(s): ${missing.map((f) => esc(f.label)).join(", ")}.</div></div>`) : ""}
      ${err ? raw(`<div class="callout warn">${icon("alert")}<div>${esc(err)}</div></div>`) : ""}
      ${result ? raw(`<div class="preview-stats">
        <div class="stat"><div class="k">Rows read</div><div class="v">${fmtN(result.stats.rows)}</div></div>
        <div class="stat"><div class="k">APQR tasks</div><div class="v">${fmtN(result.stats.tasks)}</div></div>
        <div class="stat"><div class="k">Excluded (non-APQR)</div><div class="v">${fmtN(result.stats.excluded)}</div></div>
        <div class="stat"><div class="k">Products</div><div class="v">${fmtN(result.stats.products)}</div></div>
        <div class="stat"><div class="k">Matched to plan</div><div class="v">${state.plan.length ? `${fmtN(matched)}<small class="muted" style="font-size:12px"> / ${fmtN(prodKeys.length)}</small>` : "–"}</div></div>
      </div>
      ${state.tasks.some((t) => t.app || t.source === "app") ? `<div class="callout">${icon("check")}<div>${fmtN(state.tasks.filter((t) => t.app || t.source === "app").length)} task(s) were changed or added in the app. Those changes are kept unless Scigeniq has since closed the task itself.</div></div>` : ""}
      ${result.stats.resolvedDup ? `<div class="callout">${icon("info")}<div>${fmtN(result.stats.resolvedDup)} task(s) with a “Task - Duplicated” parent were matched back to their product through their APQR reference or creation batch.</div></div>` : ""}
      ${!state.plan.length ? `<div class="callout warn">${icon("alert")}<div>No APQR plan is loaded yet, so planned months and PQR due dates can’t be calculated. Import the master tracker or a plan sheet as well, or add products on the Plan page.</div></div>` : prodKeys.length - matched > 0 ? `<div class="callout warn">${icon("alert")}<div>${fmtN(prodKeys.length - matched)} product name(s) don’t match the plan. They’ll show under “Not in plan” on the Insights page.</div></div>` : ""}`) : ""}
      <div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" value="ok" ${result ? "" : "disabled"}>${icon("upload")}Import ${result ? fmtN(result.stats.tasks) : ""} tasks</button></div>`);
    form.querySelector("[data-close]").addEventListener("click", () => d.close("cancel"));
    form._result = result;
  };
  form.addEventListener("change", (e) => {
    const t = e.target;
    if (t.name === "sheet") { sheetName = t.value; kind = {}; setup(); }
    else if (t.name === "headerRow") { headerRow = Math.max(0, (+t.value || 1) - 1); mapping = guessMapping(wb.sheets.find((s) => s.name === sheetName).rows[headerRow] || []); }
    else if (t.dataset.map) mapping[t.dataset.map] = +t.value;
    else if (t.name === "dateOrder") dateOrder = t.value;
    else if (t.name === "mode") mode = t.value;
    else if (t.name === "snapshot") { snapshot = t.checked; return; }
    else if (t.name === "label") { label = t.value; return; }
    draw();
  });
  form.addEventListener("input", (e) => { if (e.target.name === "label") label = e.target.value; });
  draw();
  d.addEventListener("close", () => {
    if (d.returnValue !== "ok" || !form._result) return;
    const res = form._result;
    const before = store.getModel();
    let preserved = null;
    store.update((st) => {
      if (snapshot && hadTasks) { st.baseline = snapshotBaseline(before, label || fmtDate(before.report)); for (const k of Object.keys(st.products)) delete st.products[k].isNew; }
      if (mode === "replace") { const pr = preserveAppChanges(st.tasks, res.tasks); st.tasks = pr.tasks; st.excluded = res.excluded; preserved = pr; }
      else { const snap = JSON.parse(JSON.stringify(st.tasks)); const m = mergeTasks(st.tasks, res.tasks); const pr = preserveAppChanges(snap, m.tasks); st.tasks = pr.tasks; st.excluded = [...st.excluded, ...res.excluded]; preserved = pr; }
      store.syncLists(st);
      st.meta.source = fileName;
      st.meta.sourceDate = new Date().toISOString().slice(0, 10);
      st.meta.importedAt = new Date().toISOString();
    }, { undoable: true, label: "Scigeniq import", audit: [{ entity: "data", label: fileName, field: "import", from: "", to: `Scigeniq (${mode}): ${res.stats.tasks} tasks, ${res.stats.excluded} excluded` }] });
    toast(`Imported ${fmtN(res.stats.tasks)} Scigeniq tasks${preserved && (preserved.kept + preserved.added) ? ` · ${fmtN(preserved.kept + preserved.added)} app changes kept` : ""}${snapshot && hadTasks ? " · baseline saved" : ""}`, { kind: "success", action: "Undo", onAction: () => store.undo() });
  });
}

/* ---------------------------------------------------- follow-up actions */

export function editAction(productKeyArg, action) {
  const model = store.getModel();
  const isNew = !action;
  const a = action ? { ...action } : { id: uid(), text: "", owner: "", due: "", done: false, created: model.report };
  const products = model.products.map((p) => ({ key: p.key, label: p.product }));
  let key = productKeyArg || "";
  const d = openDialog(html`<form method="dialog" class="modal-body">
    <h2 class="modal-title">${isNew ? "Add follow-up action" : "Edit follow-up action"}</h2>
    <div class="form-grid">
      ${key ? raw(`<div class="f full">Product<b style="font-size:13.5px;color:var(--ink)">${esc(model.productByKey.get(key)?.product || "")}</b></div>`) : raw(`<label class="f full">Product<select name="product" required><option value="">Choose a product…</option>${products.map((p) => `<option value="${esc(p.key)}">${esc(p.label)}</option>`).join("")}</select></label>`)}
      <label class="f full">Action${raw(listSelect(store.lists(), "actionTypes", a.type || "", { name: "type", empty: "Choose an action…", attrs: "required" }))}</label>
      <label class="f full">Details <small>(optional)</small><textarea name="text" placeholder="Anything specific: which annexe, who was contacted…">${a.type ? a.text : a.text}</textarea></label>
      <label class="f">Owner${raw(peopleSelect(store.lists(), a.owner, { name: "owner", empty: "— no owner —" }))}</label>
      <label class="f">Target date<input type="date" name="due" value="${a.due}"></label>
      <label class="f check full"><input type="checkbox" name="done" ${a.done ? "checked" : ""}> Done</label>
    </div>

    <div class="modal-actions">
      ${isNew ? "" : raw(`<button type="button" class="btn btn-ghost" data-act="delete" style="margin-right:auto;color:var(--crit-ink)">${icon("trash")}Delete</button>`)}
      <button type="button" class="btn btn-ghost" data-close>Cancel</button>
      <button class="btn btn-primary" value="ok">${isNew ? "Add action" : "Save"}</button>
    </div></form>`, {
    onClose: (v) => {
      if (v !== "ok") return;
      const f = new FormData(d.querySelector("form"));
      key = key || String(f.get("product") || "");
      if (!key) return;
      const next = { ...a, type: String(f.get("type") || ""), text: String(f.get("text") || "").trim(), owner: String(f.get("owner") || "").trim(), due: String(f.get("due") || ""), done: !!f.get("done") };
      if (!next.type && !next.text) return;
      if (next.done && !a.done) next.doneAt = model.report;
      const label = model.productByKey.get(key)?.product || key;
      store.update((st) => {
        st.products[key] = st.products[key] || {};
        const list = st.products[key].actions = st.products[key].actions || [];
        const i = list.findIndex((x) => x.id === next.id);
        if (i >= 0) list[i] = next; else list.push(next);
      }, { audit: [{ entity: "action", key, label, field: isNew ? "added" : "updated", from: isNew ? "" : a.text, to: `${next.type || next.text}${next.due ? ` (due ${next.due})` : ""}${next.done ? " [done]" : ""}` }] });
      toast(isNew ? "Action added" : "Action updated", { kind: "success" });
    },
  });
  d.querySelector('[data-act="delete"]')?.addEventListener("click", () => {
    d.close("cancel");
    const label = model.productByKey.get(key)?.product || key;
    store.update((st) => { st.products[key].actions = (st.products[key].actions || []).filter((x) => x.id !== a.id); }, { undoable: true, audit: [{ entity: "action", key, label, field: "deleted", from: a.text, to: "" }] });
    toast("Action deleted", { action: "Undo", onAction: () => store.undo() });
  });
}

export function toggleAction(key, id, done) {
  const st0 = store.getState();
  const a = st0.products[key]?.actions?.find((x) => x.id === id);
  if (!a) return;
  store.update((st) => { const x = st.products[key].actions.find((y) => y.id === id); x.done = done; x.doneAt = done ? store.getModel().report : ""; },
    { audit: [{ entity: "action", key, label: store.getModel().productByKey.get(key)?.product || key, field: done ? "done" : "reopened", from: a.text, to: done ? "done" : "open" }] });
}

/* ----------------------------------------------------- team publishing */

export async function publishTeam() {
  const status = await teamStatus();
  if (!status.available) { toast("Publishing for the team works in the claude.ai copy of this page.", { kind: "error" }); return; }
  if (status.canEdit === false) { toast("You can view this tracker but not publish it. Ask the owner for edit access.", { kind: "error" }); return; }
  const s = store.getState();
  const m = store.getModel();
  const ok = await confirmDialog({
    title: "Publish for everyone?",
    body: `Everyone who opens this tracker will see the data as it is now: ${fmtN(m.kpi.planned)} planned products, ${fmtN(s.tasks.length)} Scigeniq tasks, your comments and actions. Open copies reload to the new version.`,
    confirm: "Publish",
  });
  if (!ok) return;
  const prev = { publishedAt: s.meta.publishedAt, publishedBy: s.meta.publishedBy, basedOn: s.meta.basedOn, dirty: s.meta.dirty };
  const at = new Date().toISOString();
  const by = s.meta.user || "";
  s.audit.unshift({ at, user: by || "local user", entity: "data", label: "Team version", field: "published", from: prev.publishedAt || "", to: at });
  store.markPublished({ at, by });
  const published = { ...store.getState(), meta: { ...store.getState().meta, user: "", dirty: false } };
  toast("Publishing…");
  try {
    await publishForTeam(published);
    toast("Published. Everyone now sees this version.", { kind: "success" });
  } catch (e) {
    Object.assign(store.getState().meta, prev);
    store.getState().audit.shift();
    store.flush();
    const code = e?.code;
    if (code === "conflict") toast("Someone published a newer version first. The page is reloading to it.", { kind: "error", timeout: 8000 });
    else if (code === "not_writer" || code === "not_granted") toast("This view is read-only, so it can’t publish. Ask the owner for edit access.", { kind: "error", timeout: 8000 });
    else if (code === "rate_limited") toast("Too many publishes in a short time. Wait a minute and try again.", { kind: "error" });
    else toast(`Publishing failed${code ? ` (${code})` : ""}. Your changes are still saved in this browser.`, { kind: "error", timeout: 8000 });
    store.refresh();
  }
}

/* ----------------------------------------------------------- managed lists */

import { LIST_BY_KEY, isLocked, usageCount, replaceEverywhere, getLists, addMissingFromData } from "./lists.js";

const itemKey = (def, x) => (def.kind === "titles" ? `${x.slot}|${x.name}` : x.name);

export function addListItem(key, item) {
  const def = LIST_BY_KEY[key];
  const name = String(item.name || "").trim();
  if (!name) { toast("Type a value first.", { kind: "error" }); return false; }
  const cur = getLists(store.getState())[key];
  if (cur.some((x) => itemKey(def, x) === itemKey(def, { ...item, name }))) { toast(`“${name}” is already in the list.`, { kind: "error" }); return false; }
  store.update((st) => { st.lists = getLists(st); st.lists[key] = [...st.lists[key], { ...item, name }]; }, { audit: [{ entity: "list", label: def.label, field: "added", from: "", to: name }] });
  toast(`Added “${name}” to ${def.label}`, { kind: "success" });
  return true;
}

export async function renameListItem(key, index, newName) {
  const def = LIST_BY_KEY[key];
  const st0 = store.getState();
  const cur = getLists(st0)[key];
  const old = cur[index];
  const name = String(newName || "").trim();
  if (!old || !name || name === old.name) return false;
  if (isLocked(key, old.name)) { toast("This entry is built in and can’t be renamed.", { kind: "error" }); return false; }
  if (cur.some((x, i) => i !== index && itemKey(def, x) === itemKey(def, { ...old, name }))) { toast(`“${name}” is already in the list.`, { kind: "error" }); return false; }
  const n = usageCount(st0, key, old.name);
  if (n && key !== "taskTitles" && !(await confirmDialog({ title: `Rename “${old.name}”?`, body: `It becomes “${name}” in the list and in the ${fmtN(n)} record(s) that use it.`, confirm: "Rename" }))) return false;
  store.update((st) => {
    st.lists = getLists(st);
    const changed = replaceEverywhere(st, key, old.name, name);
    st.lists[key] = st.lists[key].map((x, i) => (i === index ? { ...x, name } : x));
    void changed;
  }, { undoable: true, audit: [{ entity: "list", label: def.label, field: "renamed", from: old.name, to: `${name}${n && key !== "taskTitles" ? ` (${n} records)` : ""}` }] });
  toast(`Renamed to “${name}”${n && key !== "taskTitles" ? ` in ${fmtN(n)} records` : ""}`, { kind: "success", action: "Undo", onAction: () => store.undo() });
  return true;
}

export function updateListItem(key, index, patch) {
  const def = LIST_BY_KEY[key];
  const old = getLists(store.getState())[key][index];
  if (!old) return;
  const changes = Object.entries(patch).filter(([k, v]) => (old[k] || "") !== v);
  if (!changes.length) return;
  store.update((st) => { st.lists = getLists(st); st.lists[key] = st.lists[key].map((x, i) => (i === index ? { ...x, ...patch } : x)); },
    { audit: changes.map(([k, v]) => ({ entity: "list", label: `${def.label} · ${old.name}`, field: k, from: old[k] || "", to: v })) });
}

export function deleteListItem(key, index) {
  const def = LIST_BY_KEY[key];
  const st0 = store.getState();
  const cur = getLists(st0)[key];
  const old = cur[index];
  if (!old) return;
  if (isLocked(key, old.name)) { toast("This entry is built in and can’t be deleted.", { kind: "error" }); return; }
  const n = key === "taskTitles" ? 0 : usageCount(st0, key, old.name);
  const others = cur.filter((_, i) => i !== index && (def.kind !== "people" || true));
  const d = openDialog(`<form method="dialog" class="modal-body">
    <h2 class="modal-title">Delete “${esc(old.name)}”?</h2>
    ${n ? `<p class="muted" style="margin:0">It is used in <b>${fmtN(n)}</b> record(s). Choose what those records should show instead.</p>
    <label class="f">Replace with<select name="replace"><option value="__keep">Keep the current value in those records</option><option value="">Clear the value</option>${others.map((x) => `<option value="${esc(x.name)}">${esc(x.name)}</option>`).join("")}</select></label>` : `<p class="muted" style="margin:0">It isn’t used by any record.</p>`}
    <div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-danger" value="ok">Delete</button></div>
  </form>`, {
    onClose: (v) => {
      if (v !== "ok") return;
      const rep = n ? new FormData(d.querySelector("form")).get("replace") : "__keep";
      store.update((st) => {
        st.lists = getLists(st);
        if (rep !== "__keep") replaceEverywhere(st, key, old.name, rep);
        st.lists[key] = st.lists[key].filter((_, i) => i !== index);
      }, { undoable: true, audit: [{ entity: "list", label: def.label, field: "deleted", from: old.name, to: rep === "__keep" ? (n ? `kept in ${n} records` : "") : rep ? `replaced by ${rep} in ${n} records` : `cleared in ${n} records` }] });
      toast(`Deleted “${old.name}”`, { action: "Undo", onAction: () => store.undo() });
    },
  });
}

export function moveListItem(key, index, dir) {
  const cur = getLists(store.getState())[key];
  const j = index + dir;
  if (j < 0 || j >= cur.length) return;
  store.update((st) => { st.lists = getLists(st); const a = [...st.lists[key]]; [a[index], a[j]] = [a[j], a[index]]; st.lists[key] = a; });
}

export function addMissingListValues() {
  let added = 0;
  store.update((st) => { added = addMissingFromData(st); }, { audit: [{ entity: "list", label: "Lists", field: "added from data", from: "", to: "values found in the data" }] });
  toast(added ? `Added ${fmtN(added)} value(s) found in the data` : "Every value in the data is already in the lists", { kind: "success" });
}
