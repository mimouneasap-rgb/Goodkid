// User actions shared by several views: editing tasks and plan rows, the
// import wizard, exports, demo data and baseline management.
import * as store from "./store.js";
import { compute, snapshotBaseline, productKey, dayInt, isoFromDay, DEPARTMENTS, CLASSES, STAGE_ORDER, monthYearToEnd } from "./engine.js";
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

export function setTaskStage(id, stage) {
  const s = store.getState();
  const t = s.tasks.find((x) => x.id === id);
  if (!t || t.stage === stage) return;
  const from = t.stage;
  store.update((st) => applyStage(st.tasks.find((x) => x.id === id), stage, store.getModel().report), {
    audit: [{ entity: "task", key: productKey(t.product), label: `${t.ref} · ${t.title}`, field: "stage", from, to: stage }],
  });
}
export function setTaskAssignee(id, user) {
  const t = store.getState().tasks.find((x) => x.id === id);
  if (!t || t.assignee === user) return;
  const from = t.assignee;
  store.update((st) => { st.tasks.find((x) => x.id === id).assignee = user || "Unassigned"; }, {
    audit: [{ entity: "task", key: productKey(t.product), label: `${t.ref} · ${t.title}`, field: "assignee", from, to: user || "Unassigned" }],
  });
}

function stageOptions(current) {
  const model = store.getModel();
  const set = new Set([...STAGE_ORDER, ...model.tasks.map((t) => t.stage).filter(Boolean)]);
  return [...set].map((s) => `<option${s === current ? " selected" : ""}>${esc(s)}</option>`).join("");
}
export function stageSelect(t, cls = "") {
  return raw(`<select class="${cls}" data-task-stage="${esc(t.id)}" aria-label="Stage">${stageOptions(t.stage)}</select>`);
}

export function editTask(task, defaults = {}) {
  const model = store.getModel();
  const isNew = !task;
  const t = task ? { ...task } : { id: uid(), ref: "", product: "", dosageForm: "", site: "", department: "QA", stream: "QA", taskClass: "Data Collection", taskType: "", title: "", stage: "Collecting Data", status: "Open", assignee: "Unassigned", criticality: "Low", created: model.report, start: model.report, closedOn: "", closure: "Not Closed", createdBy: store.getState().meta.user || "", taskEnd: "", ...defaults };
  const products = [...new Set([...model.plan.map((p) => p.product), ...model.products.map((p) => p.product)])].sort();
  const d = openDialog(html`<form method="dialog" class="modal-body" id="task-form">
    <h2 class="modal-title">${isNew ? "Add task" : "Edit task"}</h2>
    <div class="form-grid">
      <label class="f">Reference ID<input name="ref" value="${t.ref}" placeholder="APQR-KE-123" required></label>
      <label class="f">Task class<select name="taskClass">${CLASSES.map((c) => raw(`<option${c === t.taskClass ? " selected" : ""}>${c}</option>`))}</select></label>
      <label class="f full">Product<input name="product" list="dl-products" value="${t.product}" required></label>
      <label class="f full">Title<input name="title" value="${t.title}" placeholder="QC Data Collection - Tablet"></label>
      <label class="f">Department<select name="department">${[...DEPARTMENTS, "Approval"].map((x) => raw(`<option${x === t.department ? " selected" : ""}>${x}</option>`))}</select></label>
      <label class="f">Stage<select name="stage">${raw(stageOptions(t.stage))}</select></label>
      <label class="f">Assigned user<input name="assignee" list="dl-users" value="${t.assignee}"></label>
      <label class="f">Status<input name="status" value="${t.status}" list="dl-status"></label>
      <label class="f">Created<input type="date" name="created" value="${(t.created || "").slice(0, 10)}"></label>
      <label class="f">Closed on<input type="date" name="closedOn" value="${(t.closedOn || "").slice(0, 10)}"></label>
      <label class="f">Task end date (Scigeniq)<input type="date" name="taskEnd" value="${(t.taskEnd || "").slice(0, 10)}"></label>
      <label class="f">Criticality<select name="criticality">${["Low", "Medium", "High"].map((x) => raw(`<option${x === t.criticality ? " selected" : ""}>${x}</option>`))}</select></label>
    </div>
    <datalist id="dl-products">${products.map((p) => raw(`<option value="${esc(p)}">`))}</datalist>
    <datalist id="dl-users">${model.owners.map((p) => raw(`<option value="${esc(p)}">`))}</datalist>
    <datalist id="dl-status"><option value="Open"><option value="Overdue"><option value="Completed"></datalist>
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
      for (const k of ["ref", "product", "title", "department", "assignee", "status", "taskClass", "criticality"]) next[k] = String(f.get(k) || "").trim();
      next.assignee = next.assignee || "Unassigned";
      for (const k of ["created", "closedOn", "taskEnd"]) {
        const v2 = String(f.get(k) || "");
        next[k] = v2 && (t[k] || "").slice(0, 10) === v2 ? t[k] : v2;
      }
      next.start = t.start || next.created;
      next.stream = next.taskClass === "Approval" ? "Approval" : next.taskClass === "Workflow" ? "APQR Workflow" : next.department === t.department ? t.stream || next.department : next.department;
      if (next.taskClass === "Approval") next.department = "Approval";
      applyStage(next, String(f.get("stage")), model.report);
      if (f.get("closedOn")) next.closedOn = next.closure === "Closed" ? (next.closedOn || String(f.get("closedOn"))) : "";
      const pl = model.planByKey.get(productKey(next.product));
      if (pl) { next.product = pl.product; next.dosageForm = next.dosageForm || pl.process; next.site = next.site || pl.site; }
      const changes = isNew ? [{ entity: "task", key: productKey(next.product), label: `${next.ref} · ${next.title}`, field: "created", from: "", to: "new task" }]
        : Object.keys(next).filter((k) => k !== "id" && String(next[k] ?? "") !== String(task[k] ?? "")).map((k) => ({ entity: "task", key: productKey(next.product), label: `${next.ref} · ${next.title}`, field: k, from: task[k], to: next[k] }));
      if (!changes.length) return;
      store.update((st) => {
        if (isNew) st.tasks.push(next);
        else Object.assign(st.tasks.find((x) => x.id === t.id), next);
      }, { audit: changes });
      toast(isNew ? "Task added" : "Task updated", { kind: "success" });
    },
  });
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
      <label class="f">Process / dosage form<input name="process" list="dl-forms" value="${p.process}"></label>
      <label class="f">Site<input name="site" value="${p.site}"></label>
      <label class="f">Review start<input type="month" name="reviewStart" value="${toMonthInput(p.reviewStart)}"></label>
      <label class="f">Review end<input type="month" name="reviewEnd" value="${toMonthInput(p.reviewEnd)}" required><small>The planned PQR month is the month after this.</small></label>
      <label class="f">Plan #<input name="no" value="${p.no}"></label>
      <label class="f">Exec. year<input name="execYear" value="${p.execYear}"></label>
      <label class="f">Plan status<select name="planStatus">${["Approved", "Draft", "Cancelled"].map((x) => raw(`<option${x === p.planStatus ? " selected" : ""}>${x}</option>`))}</select></label>
    </div>
    <datalist id="dl-forms">${forms.map((x) => raw(`<option value="${esc(x)}">`))}</datalist>
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
      <label class="f">PQR overdue after (months)<input type="number" min="0" max="24" name="overdueMonths" value="${s.overdueMonths}"><small>From the 1st of the planned PQR month.</small></label>
      <label class="f">“Due soon” threshold (days)<input type="number" min="0" max="365" name="dueSoonDays" value="${s.dueSoonDays}"></label>
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
    download(blob, `APQR_Master_Tracker_${d}.xlsx`);
    toast("Excel workbook exported", { kind: "success" });
  } catch (e) { console.error(e); toast(`Export failed: ${e.message}`, { kind: "error" }); }
}
export function exportJson() {
  download(backupJson(store.getState()), `APQR_Tracker_backup_${new Date().toISOString().slice(0, 10)}.json`);
  toast("Backup saved", { kind: "success" });
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
        settings, plan: imp.plan, tasks: imp.tasks, products, excluded: imp.excluded, baseline: imp.baseline,
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
    store.update((st) => {
      if (snapshot && hadTasks) { st.baseline = snapshotBaseline(before, label || fmtDate(before.report)); for (const k of Object.keys(st.products)) delete st.products[k].isNew; }
      if (mode === "replace") { st.tasks = res.tasks; st.excluded = res.excluded; }
      else { const m = mergeTasks(st.tasks, res.tasks); st.tasks = m.tasks; st.excluded = [...st.excluded, ...res.excluded]; }
      st.meta.source = fileName;
      st.meta.sourceDate = new Date().toISOString().slice(0, 10);
      st.meta.importedAt = new Date().toISOString();
    }, { undoable: true, label: "Scigeniq import", audit: [{ entity: "data", label: fileName, field: "import", from: "", to: `Scigeniq (${mode}): ${res.stats.tasks} tasks, ${res.stats.excluded} excluded` }] });
    toast(`Imported ${fmtN(res.stats.tasks)} Scigeniq tasks${snapshot && hadTasks ? " · baseline saved" : ""}`, { kind: "success", action: "Undo", onAction: () => store.undo() });
  });
}
