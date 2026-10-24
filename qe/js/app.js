import {
  SCOPES, DEPARTMENTS, SIX_M, SIX_M_HINT, QE_STAGES, SEVERITY, OCCURRENCE, DETECTABILITY, CLASSES,
  MANDATORY_COLUMNS, ROOT_CAUSES, IMPACT_QUESTIONS, TASK_WORKFLOWS, NUMBERING,
  mandatoryFields, complianceCheck, trend, rpn, classify,
} from "./sop.js";
import { OOS_PHASES, METHODS, REFERENCES, INSPECTION_FINDINGS, EXHIBIT, DATA_ITEMS } from "./knowledge.js";
import { MODELS, DEFAULT_MODEL, EFFORTS, draft, serverStatus } from "./claude.js";
import { offlineAnalysis, offlineInvestigation } from "./drafts.js";
import {
  STATUSES, STATUS_LABEL, newRecord, applyAnalysis, applyInvestigation, summary, reportSections, exportText,
} from "./record.js";

const STORE_KEY = "goodkid.qe.records.v1";
const SETTINGS_KEY = "goodkid.qe.settings.v1";
const THEME_KEY = "goodkid.qrm.theme";
const INPUT_FIELDS = [
  "description", "title", "occurrenceDate", "detectionDate", "reportedDate", "number", "detectedBy", "department",
  "immediateActions", "area", "equipment", "product", "productCode", "batch", "rawMaterial", "packingMaterial",
  "semiFinished", "supplier", "computerizedSystem", "deviationValues", "relatedRecords", "otherDetails", "language",
];
const VIEWS = {
  new: ["New event", "Describe the deviation"],
  event: ["Current event", "Quality event"],
  register: ["Events", "Quality events register"],
  masterclass: ["Masterclass", "Investigation masterclass"],
};

const EXAMPLE = {
  title: "Compression failure Porenza 200 mg FC Tablets batch 261401",
  description: "During compression of Porenza 200 mg FC Tablets, 2nd batch 261401, in room FFO-09 on the IMA compression machine EQ0940-Onc, we could not obtain compliant tablets despite several adjustments since yesterday. Poor flow of the final blend although the batch followed the same manufacturing steps as the previous batch. Granulation yield was 103%. Compression settings were the same as previous batches. IPC hardness and disintegration results out of limits.",
  occurrenceDate: "2026-09-08", detectionDate: "2026-09-08", reportedDate: "2026-09-08",
  detectedBy: "Production team", department: "Manufacturing",
  immediateActions: "- Compression stopped.\n- QA informed.\n- R&D consulted for recommendations.",
  area: "FFO-09 compression room, Oncology production", equipment: "EQ0940-Onc compression machine IMA",
  product: "Porenza (Pazopanib) 200 mg FC Tablets B/30", productCode: "ONC-TB004P01", batch: "261401",
  deviationValues: "Granulation yield 103 % (expected ≤ 100 %); hardness and disintegration out of specification (values to attach)",
  otherDetails: "Second process optimisation batch. Same API lot as previous batch? to confirm. BMR recalculates the external phase only when yield is below 100 %.",
  scopes: ["pqi", "ipc", "mfg"], language: "en",
};

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") node.className = v;
    else if (k === "dataset") Object.assign(node.dataset, v);
    else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null && v !== false) node.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat()) {
    if (c !== null && c !== undefined && c !== false) node.append(c instanceof Node ? c : String(c));
  }
  return node;
}

const state = {
  records: load(STORE_KEY, []),
  settings: { mode: "server", apiKey: "", model: DEFAULT_MODEL, effort: "high", ...load(SETTINGS_KEY, {}) },
  server: { available: false },
  current: null,
  view: "new",
  tab: "workflow",
  editing: null,
  abort: null,
};

// Inside a published claude.ai artifact, `window.claude.use` reaches the viewer's
// own Claude account (sample), their private storage (db + user) and file saves
// (downloads). Elsewhere these stay null and the app uses its own connection modes.
const runtime = { inArtifact: typeof window.claude?.use === "function", sample: null, downloads: null, col: null };
const pendingWrites = new Map();

// ---------- persistence ----------

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw);
  } catch { /* storage unavailable or corrupt */ }
  return fallback;
}
function persist(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    toast("Could not save in this browser. Export a backup to keep your work.");
    return false;
  }
}
const saveRecords = () => persist(STORE_KEY, state.records);
const currentRecord = () => state.records.find((r) => r.uid === state.current) ?? null;

function upsert(record) {
  const i = state.records.findIndex((r) => r.uid === record.uid);
  record.updatedAt = new Date().toISOString();
  if (i >= 0) state.records[i] = record; else state.records.unshift(record);
  saveRecords();
  syncRecord(record);
}

// One debounced write per record to the viewer's private claude.ai storage.
function syncRecord(record) {
  if (!runtime.col) return;
  clearTimeout(pendingWrites.get(record.uid));
  pendingWrites.set(record.uid, setTimeout(() => {
    pendingWrites.delete(record.uid);
    runtime.col?.doc(record.uid).set({ json: JSON.stringify(record), updatedAt: record.updatedAt }).catch((err) => {
      if (err?.code === "quota_exceeded") return toast("Your saved events are full. Delete old events or export a backup.");
      // This viewer may not write here (e.g. view-only access): keep events in the browser from now on.
      if (err?.code === "invalid_argument" || err?.code === "revoked") runtime.col = null;
      toast("Could not save to your claude.ai storage. Events are kept in this browser.");
    });
  }, 800));
}

function unsyncRecord(uid) {
  if (!runtime.col) return;
  clearTimeout(pendingWrites.get(uid));
  pendingWrites.delete(uid);
  runtime.col.doc(uid).delete().catch(() => {});
}

// ---------- small UI helpers ----------

let toastTimer;
function toast(message) {
  const t = $("#toast");
  t.textContent = message;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 3600);
}

function confirmBox(text, okLabel = "OK") {
  const dlg = $("#confirm");
  $("#confirm-text").textContent = text;
  $("#confirm-ok").textContent = okLabel;
  dlg.returnValue = "";
  dlg.showModal();
  return new Promise((resolve) => dlg.addEventListener("close", () => resolve(dlg.returnValue === "ok"), { once: true }));
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = el("textarea", { style: "position:fixed;opacity:0" }, text);
    document.body.append(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
  toast("Copied. Paste it into Scigeniq.");
}

function download(name, text, type) {
  if (runtime.downloads) {
    runtime.downloads.save({ filename: name, data: text }).then(
      () => toast(`Saved ${name}.`),
      (err) => { if (err?.code !== "declined") toast("This view cannot save files."); },
    );
    return;
  }
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = el("a", { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const icon = (path) => {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 20 20");
  svg.setAttribute("aria-hidden", "true");
  const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
  p.setAttribute("d", path);
  svg.append(p);
  return svg;
};
const ICON = {
  copy: "M7 3h8a2 2 0 0 1 2 2v8h-2V5H7zM3 7h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z",
  edit: "m13.6 2.6 3.8 3.8L7 16.8H3.2V13zM12 6.4 5 13.4V15h1.6l7-7z",
  print: "M5 2h10v4H5zM3 7h14a1 1 0 0 1 1 1v6h-3v4H5v-4H2V8a1 1 0 0 1 1-1zm4 6v3h6v-3z",
  sparkle: "m10 1 2.1 6.1L18 9l-5.9 1.9L10 17l-2.1-6.1L2 9l5.9-1.9z",
};

const classBadge = (cls) => (cls ? el("span", { class: `badge ${cls.level}` }, cls.name) : el("span", { class: "hint" }, "Not classified"));

// ---------- navigation ----------

function setView(view) {
  if (view === "event" && !currentRecord()) view = "new";
  state.view = view;
  $$(".view").forEach((v) => v.classList.toggle("active", v.id === `view-${view}`));
  $$("[data-view]").forEach((b) => b.classList.toggle("active", b.dataset.view === view));
  const [eyebrow, title] = VIEWS[view];
  $("#page-eyebrow").textContent = eyebrow;
  $("#page-title").textContent = view === "event" ? summary(currentRecord()).title : title;
  renderPageActions();
  if (view === "event") renderEvent();
  if (view === "register") renderRegister();
  if (view === "masterclass") renderMasterclass();
  if (location.hash.slice(1) !== view) history.replaceState(null, "", `#${view}`);
  window.scrollTo({ top: 0 });
}

function renderPageActions() {
  const box = $("#page-actions");
  box.replaceChildren();
  if (state.view === "event") {
    const rec = currentRecord();
    box.append(
      el("button", { class: "btn", type: "button", onclick: () => copy(exportText(rec)) }, icon(ICON.copy), "Copy all"),
      runtime.inArtifact
        ? el("button", { class: "btn", type: "button", onclick: () => download(`${fileStem(rec)}.html`, reportHtml(rec), "text/html") }, icon(ICON.print), "Download report")
        : el("button", { class: "btn", type: "button", onclick: () => printRecord(rec) }, icon(ICON.print), "Print / PDF"),
    );
  } else if (state.view !== "new") {
    box.append(el("button", { class: "btn primary", type: "button", onclick: () => { resetIntake(); setView("new"); } }, icon("M9 3h2v6h6v2h-6v6H9v-6H3V9h6z"), "New event"));
  }
}

function refreshNav() {
  $("#nav-count").textContent = state.records.length || "";
  $("#nav-event").disabled = !currentRecord();
  const s = state.settings;
  $("#doc-claude").textContent = s.mode === "account" ? (runtime.sample ? "Your Claude account" : "Connecting…") : s.mode === "browser"
    ? (s.apiKey ? `Browser key · ${modelName(s.model)}` : "Browser: no key")
    : state.server.available ? `Server · ${modelName(s.model)}` : "Not connected";
}
function modelName(id) {
  const known = MODELS.find(([m]) => m === id);
  return known ? known[1].replace(/ \(.*\)$/, "").replace("Claude ", "") : id;
}

function claudeReady() {
  if (state.settings.mode === "account") return Boolean(runtime.sample);
  return state.settings.mode === "browser" ? Boolean(state.settings.apiKey) : state.server.available;
}

// ---------- intake ----------

function setupIntake() {
  $("#in-department").append(el("option", { value: "" }, "—"), ...DEPARTMENTS.map((d) => el("option", { value: d }, d)));
  $("#in-scopes").append(...SCOPES.map((s) => el("label", { class: "scope" },
    el("input", { type: "checkbox", value: s.id, onchange: updateMandatoryNote }),
    el("span", {}, s.name))));
  updateMandatoryNote();
  $("#load-example").addEventListener("click", () => { fillIntake(EXAMPLE); toast("Example loaded. Press Analyse with Claude or Draft without AI."); });
  $("#intake").addEventListener("submit", (e) => { e.preventDefault(); startAnalysis(true); });
  $("#run-offline").addEventListener("click", () => startAnalysis(false));
}

function readIntake() {
  const input = {};
  for (const f of INPUT_FIELDS) input[f] = $(`#in-${f}`).value.trim();
  input.scopes = $$("#in-scopes input:checked").map((i) => i.value);
  return input;
}

function fillIntake(input) {
  for (const f of INPUT_FIELDS) $(`#in-${f}`).value = input[f] ?? (f === "language" ? "en" : "");
  $$("#in-scopes input").forEach((i) => { i.checked = (input.scopes ?? []).includes(i.value); });
  updateMandatoryNote();
}

function resetIntake() {
  $("#intake").reset();
  state.editing = null;
  updateMandatoryNote();
}

function updateMandatoryNote() {
  const scopes = $$("#in-scopes input:checked").map((i) => i.value);
  const fields = mandatoryFields(scopes);
  $("#mandatory-note").textContent = scopes.length
    ? (fields.length ? `Scigeniq will require: ${fields.map(([, l]) => l).join(", ")}.` : "No mandatory selections for this scope.")
    : "";
}

async function startAnalysis(useClaude) {
  const input = readIntake();
  if (!input.description) { toast("Describe the deviation first."); $("#in-description").focus(); return; }
  if (!input.detectionDate) { toast("Enter the detection date: it starts the SOP deadlines."); $("#in-detectionDate").focus(); return; }
  let record = state.editing ? { ...currentRecord(), input, number: input.number } : newRecord(input);
  if (useClaude && !claudeReady()) {
    if (runtime.inArtifact) {
      if (!(await confirmBox("Claude is not available in this view (sign in to claude.ai to use it). Make an offline draft from the SOP rules instead?", "Draft offline"))) return;
    } else if (!(await confirmBox("Claude is not connected yet. Open Settings to add an API key, or make an offline draft now from the SOP rules (you can run Claude later).", "Draft offline"))) {
      openSettings();
      return;
    }
    useClaude = false;
  }
  if (useClaude) {
    const res = await runClaude("analysis", record, "Claude is analysing the event and planning the investigation…");
    if (!res) return;
    record = applyAnalysis(record, res.result, { source: "claude", model: res.model });
  } else {
    record = applyAnalysis(record, offlineAnalysis(input), { source: "offline" });
  }
  upsert(record);
  state.current = record.uid;
  state.editing = null;
  state.tab = "workflow";
  refreshNav();
  setView("event");
  toast(useClaude ? "Draft ready. Review every field, then collect the investigation data." : "Offline draft ready. Complete the placeholders.");
}

async function runClaude(kind, record, text) {
  const dlg = $("#busy");
  $("#busy-text").textContent = text;
  const started = Date.now();
  const tick = setInterval(() => {
    const s = Math.floor((Date.now() - started) / 1000);
    $("#busy-time").textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  }, 500);
  state.abort = new AbortController();
  dlg.showModal();
  try {
    return await draft(kind, record, state.settings, { signal: state.abort.signal, sample: runtime.sample });
  } catch (err) {
    if (err.name === "AbortError" || state.abort.signal.aborted) toast("Cancelled.");
    else {
      dlg.close();
      const offline = await confirmBox(`${err.message}\n\nMake an offline draft instead?`, "Draft offline");
      if (offline) {
        return { result: kind === "analysis" ? offlineAnalysis(record.input) : offlineInvestigation(record), model: "offline", offline: true };
      }
    }
    return null;
  } finally {
    clearInterval(tick);
    $("#busy-time").textContent = "0:00";
    if (dlg.open) dlg.close();
    state.abort = null;
  }
}

// ---------- event view ----------

function renderEvent() {
  const rec = currentRecord();
  if (!rec) return;
  const s = summary(rec);
  $("#page-title").textContent = s.title;
  renderEventHead(rec, s);
  $$("#event-tabs .tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === state.tab));
  $$(".tab-panel").forEach((p) => p.classList.toggle("active", p.id === `tab-${state.tab}`));
  $("#tab-data-count").textContent = s.total ? `${s.collected}/${s.total}` : "";
  const checks = complianceCheck(rec);
  const issues = checks.filter((c) => c.level !== "info").length;
  $("#tab-check-count").textContent = issues || "";
  $("#tab-check-count").classList.toggle("alert", checks.some((c) => c.level === "error"));
  ({ workflow: renderWorkflow, data: renderData, insight: renderInsight, check: renderCheck })[state.tab](rec, s, checks);
}

function renderEventHead(rec, s) {
  const stageIndex = QE_STAGES.findIndex((st) => st.name === s.stage || (s.stage.startsWith("RCA") && st.id === "rca"));
  const source = rec.investigationMeta ?? rec.analysisMeta;
  const numberInput = el("input", {
    class: "qe-number mono", value: rec.number, placeholder: `${NUMBERING.event}…`, "aria-label": "Quality event number",
    onchange: (e) => { rec.number = e.target.value.trim(); upsert(rec); refreshNav(); },
  });
  $("#event-head").replaceChildren(
    el("div", { class: "eh-top" },
      el("div", { class: "eh-id" }, numberInput, classBadge(s.initialClass),
        s.initialRpn ? el("span", { class: "rpn-chip mono" }, `RPN ${s.initialRpn}`) : null,
        s.finalRpn ? el("span", { class: "rpn-chip mono final" }, `Final ${s.finalRpn}`) : null),
      el("div", { class: "eh-actions" },
        el("button", { class: "btn small", type: "button", onclick: () => editInput(rec) }, icon(ICON.edit), "Edit details"),
        el("button", { class: "btn small", type: "button", onclick: () => rerunAnalysis(rec) }, icon(ICON.sparkle), "Re-draft"),
        el("button", {
          class: "btn small", type: "button", onclick: () => {
            rec.closed = !rec.closed; upsert(rec); renderEvent();
            toast(rec.closed ? "Marked closed." : "Re-opened.");
          },
        }, rec.closed ? "Re-open" : "Mark closed"),
        el("button", { class: "btn small danger", type: "button", onclick: () => deleteRecord(rec) }, "Delete"))),
    el("ol", { class: "stepper" }, QE_STAGES.map((st, i) => el("li", {
      class: [i < stageIndex || rec.closed ? "done" : "", i === stageIndex && !rec.closed ? "now" : "", st.conditional ? "cond" : ""].join(" "),
      title: `${st.form} · ${st.owner}${st.conditional ? " (only if needed)" : ""}`,
    }, el("span", {}, st.name)))),
    el("dl", { class: "eh-facts" },
      fact("Detected", rec.input.detectionDate || "—"),
      fact("Log in Scigeniq by", s.deadlines.logBy || "—"),
      fact("Investigation due", s.deadlines.investigationDue || "—"),
      fact("Max. with 2 extensions", s.deadlines.secondExtensionDue || "—"),
      fact("Drafted by", source ? (source.source === "claude" ? modelName(source.model) : "Offline rules") : "—"),
      s.deadlines.quhNotification ? fact("QUH notification", s.deadlines.quhNotification, "warn") : null),
  );
}
const fact = (dt, dd, cls = "") => el("div", { class: cls }, el("dt", {}, dt), el("dd", {}, dd));

function editInput(rec) {
  fillIntake({ ...rec.input, number: rec.number });
  state.editing = rec.uid;
  setView("new");
  $("#page-title").textContent = "Edit event details";
  toast("Change the details, then draft again. Collected findings are kept.");
}

async function rerunAnalysis(rec) {
  const ok = await confirmBox("Draft the Open, In Review and Investigation Planning stages again from the event details? Your edits to those forms are replaced; collected findings are kept.", "Re-draft");
  if (!ok) return;
  if (claudeReady()) {
    const res = await runClaude("analysis", rec, "Claude is re-analysing the event…");
    if (!res) return;
    upsert(applyAnalysis(rec, res.result, { source: res.offline ? "offline" : "claude", model: res.model }));
  } else {
    upsert(applyAnalysis(rec, offlineAnalysis(rec.input), { source: "offline" }));
  }
  renderEvent();
}

async function deleteRecord(rec) {
  if (!(await confirmBox(`Delete "${summary(rec).title}" from this browser? This cannot be undone.`, "Delete"))) return;
  state.records = state.records.filter((r) => r.uid !== rec.uid);
  saveRecords();
  unsyncRecord(rec.uid);
  state.current = null;
  refreshNav();
  setView("register");
}

// ----- workflow tab

function getPath(obj, path) { return path.split(".").reduce((o, k) => o?.[k], obj); }
function setPath(obj, path, value) {
  const keys = path.split(".");
  const last = keys.pop();
  const target = keys.reduce((o, k) => (o[k] ??= {}), obj);
  target[last] = value;
}

// Direct text fields that can be edited in place: label → path in the record.
const EDITABLE = {
  open: {
    Title: "analysis.qe_form.title", "Where?": "analysis.qe_form.where", "What?": "analysis.qe_form.what",
    "Who?": "analysis.qe_form.who", "Why?": "analysis.qe_form.why", "Detected by": "analysis.qe_form.detected_by",
    "Description of failure": "analysis.qe_form.failure_description", "Immediate actions": "analysis.qe_form.immediate_actions",
    "Related record(s)": "analysis.qe_form.related_records", "Deviation values: parameter (unit) / result": "analysis.qe_form.deviation_values",
    "Product(s) affected": "analysis.qe_form.products_affected", "Batch number(s)": "analysis.qe_form.batches",
    "Equipment affected": "analysis.qe_form.equipment", Area: "analysis.qe_form.area",
  },
  review: { Comments: "analysis.qa_review.comments" },
  planning: { Justification: "analysis.investigation_planning.justification" },
  investigation: {
    Description: "investigation.investigation_form.description", Investigation: "investigation.investigation_form.investigation",
    "Immediate action": "investigation.investigation_form.immediate_action", "Numerical results": "investigation.investigation_form.numerical_results",
    "Action taken": "investigation.investigation_form.action_taken", "Investigation results": "investigation.investigation_form.investigation_results",
    Conclusion: "investigation.investigation_form.conclusion", "Supporting data": "investigation.investigation_form.supporting_data",
    "6M conclusion": "investigation.six_m_conclusion", "Human error justification": "investigation.human_error_justification",
  },
  rca: {
    "Possible extension": "investigation.possible_extension", Comments: "investigation.after_investigation_comments",
    "Effectiveness check": "investigation.capa.effectiveness_check", "Overall conclusion": "investigation.overall_conclusion",
    "Batch disposition": "investigation.batch_disposition", Comment: "investigation.impact_comment",
  },
  qam: { Comments: "investigation.qa_manager.comments" },
};

function renderWorkflow(rec) {
  const box = $("#tab-workflow");
  const sections = reportSections(rec);
  const cards = sections.map((sec) => {
    const editable = EDITABLE[sec.id] ?? {};
    const sectionText = sec.fields.map(([l, v]) => `${l}:\n${v}`).join("\n\n");
    return el("section", { class: "panel stage-card", id: `stage-${sec.id}` },
      el("header", { class: "stage-head" },
        el("div", {}, el("p", { class: "eyebrow" }, sec.stage), el("h2", {}, sec.form)),
        el("button", { class: "btn small", type: "button", onclick: () => copy(sectionText) }, icon(ICON.copy), "Copy form")),
      stageControls(rec, sec.id),
      el("dl", { class: "form-fields" }, sec.fields.map(([label, value]) => fieldRow(rec, label, value, editable[label]))));
  });
  if (rec.analysis && !rec.investigation) {
    cards.push(el("section", { class: "panel next-card" },
      el("div", {}, el("p", { class: "eyebrow" }, "Next"), el("h2", {}, "Collect the investigation data"),
        el("p", { class: "hint" }, "The RCA and CAPA Planning, Investigation Form and QA Manager stages are drafted from the evidence you record against the data plan.")),
      el("button", { class: "btn primary", type: "button", onclick: () => { state.tab = "data"; renderEvent(); } }, "Open the data plan")));
  }
  box.replaceChildren(...cards);
}

function fieldRow(rec, label, value, path) {
  const dd = el("dd", { class: /\[(TO COMPLETE|À COMPLÉTER)/.test(value) ? "todo" : "" }, value);
  const actions = el("span", { class: "field-actions" },
    el("button", { class: "icon-btn", type: "button", title: `Copy ${label}`, "aria-label": `Copy ${label}`, onclick: () => copy(String(value)) }, icon(ICON.copy)),
    path ? el("button", {
      class: "icon-btn", type: "button", title: `Edit ${label}`, "aria-label": `Edit ${label}`,
      onclick: () => {
        const ta = el("textarea", { class: "inline-edit", rows: Math.min(14, Math.max(3, String(value).split("\n").length + 1)) });
        ta.value = getPath(rec, path) ?? "";
        ta.addEventListener("blur", () => { setPath(rec, path, ta.value); upsert(rec); renderEvent(); });
        dd.replaceWith(ta);
        ta.focus();
      },
    }, icon(ICON.edit)) : null);
  return el("div", { class: "field-row" }, el("dt", {}, label, actions), dd);
}

function riskEditor(rec, base, title) {
  const risk = getPath(rec, base);
  const score = rpn(risk.severity, risk.occurrence, risk.detectability);
  const cls = classify(score);
  const row = (key, name, table) => el("div", { class: "rate-row" },
    el("span", { class: "rate-name" }, name),
    el("div", { class: "rate-scale", role: "radiogroup", "aria-label": `${title} ${name}` },
      [1, 2, 3, 4, 5].map((v) => el("button", {
        type: "button", role: "radio", "aria-checked": String(risk[key] === v), class: risk[key] === v ? "on" : "",
        title: table[v][1],
        onclick: () => { setPath(rec, `${base}.${key}`, v); upsert(rec); renderEvent(); },
      }, el("b", {}, v), el("span", {}, table[v][0])))));
  return el("div", { class: "risk-editor" },
    el("div", { class: "re-head" }, el("span", { class: "label" }, title),
      el("span", { class: "re-score" }, "RPN ", el("b", { class: "mono" }, score ?? "—"), " ", classBadge(cls))),
    row("severity", "Severity", SEVERITY), row("occurrence", "Occurrence", OCCURRENCE), row("detectability", "Detectability", DETECTABILITY));
}

function toggle(rec, path, label) {
  const on = Boolean(getPath(rec, path));
  return el("label", { class: "switch" },
    el("input", { type: "checkbox", checked: on, onchange: (e) => { setPath(rec, path, e.target.checked); upsert(rec); renderEvent(); } }),
    el("span", {}, label));
}
function select(rec, path, label, options) {
  return el("label", { class: "inline" }, label,
    el("select", { onchange: (e) => { setPath(rec, path, e.target.value); upsert(rec); renderEvent(); } },
      options.map((o) => el("option", { value: o, selected: getPath(rec, path) === o }, o))));
}

function stageControls(rec, id) {
  if (id === "review") {
    return el("div", { class: "stage-controls" },
      riskEditor(rec, "analysis.initial_risk", "Initial risk assessment"),
      el("div", { class: "control-row" },
        select(rec, "analysis.qa_review.decision", "QA decision", ["Approve", "More Information", "Cancel"]),
        toggle(rec, "analysis.historical_review.recurring", "Recurring event")));
  }
  if (id === "planning") {
    return el("div", { class: "stage-controls control-row" },
      toggle(rec, "analysis.investigation_planning.investigation_required", "Investigation required"),
      toggle(rec, "analysis.investigation_planning.lab_investigation_required", "Laboratory OOS investigation"),
      el("label", { class: "inline" }, "Extensions approved",
        el("input", { type: "number", min: 0, max: 3, value: rec.extensions ?? 0, class: "num",
          onchange: (e) => { rec.extensions = Number(e.target.value) || 0; upsert(rec); renderEvent(); } })));
  }
  if (id === "investigation") {
    return el("div", { class: "stage-controls control-row" },
      select(rec, "investigation.investigation_form.root_cause_category", "Root cause", ROOT_CAUSES),
      el("div", { class: "sixm-toggles" }, rec.investigation.six_m.map((m, i) =>
        toggle(rec, `investigation.six_m.${i}.contributing`, m.factor))));
  }
  if (id === "rca") {
    return el("div", { class: "stage-controls" },
      riskEditor(rec, "investigation.final_risk", "Final risk assessment"),
      el("div", { class: "control-row" },
        toggle(rec, "investigation.capa.required", "CAPA required"),
        toggle(rec, "investigation.capa.wait_for_capa", "Wait for CAPA before closure"),
        toggle(rec, "investigation.change_control.required", "Change control")),
      el("details", { class: "iaq" }, el("summary", {}, "Impact assessment questions"),
        el("ol", {}, IMPACT_QUESTIONS.map((q, i) => el("li", {},
          el("span", {}, q),
          el("select", { onchange: (e) => { rec.investigation.impact_questions[i].answer = e.target.value; upsert(rec); renderEvent(); } },
            ["Yes", "No", "N/A"].map((o) => el("option", { value: o, selected: rec.investigation.impact_questions[i].answer === o }, o))))))));
  }
  if (id === "qam") {
    return el("div", { class: "stage-controls control-row" },
      select(rec, "investigation.qa_manager.decision", "Decision", ["Approved", "Not Approved"]),
      select(rec, "investigation.qa_manager.second_approval", "Second approval", ["None", "QP Approval"]));
  }
  return null;
}

// ----- data tab

function renderData(rec, s) {
  const box = $("#tab-data");
  const items = rec.dataItems ?? {};
  const pct = s.total ? Math.round((s.collected / s.total) * 100) : 0;
  const groups = SIX_M.map((factor) => {
    const entries = Object.entries(items).filter(([, d]) => d.factor === factor)
      .sort(([, a], [, b]) => (a.origin === b.origin ? 0 : a.origin === "event" ? -1 : 1));
    const done = entries.filter(([, d]) => d.status !== "pending").length;
    const anomalies = entries.filter(([, d]) => d.status === "anomaly").length;
    const addInput = el("input", { placeholder: `Add a ${factor} item to collect…`, "aria-label": `Add ${factor} item` });
    const add = () => {
      if (!addInput.value.trim()) return;
      items[`user-${Date.now().toString(36)}`] = { factor, item: addInput.value.trim(), source: "", why: "", origin: "user", priority: "High", status: "pending", note: "" };
      rec.dataItems = items;
      upsert(rec);
      renderEvent();
    };
    addInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); add(); } });
    return el("details", { class: "panel m-group", open: true },
      el("summary", {},
        el("h2", {}, factor), el("span", { class: "hint m-hint" }, SIX_M_HINT[factor]),
        el("span", { class: "m-count mono" }, `${done}/${entries.length}`),
        anomalies ? el("span", { class: "badge High" }, `${anomalies} anomal${anomalies > 1 ? "ies" : "y"}`) : null),
      el("ul", { class: "data-list" }, entries.map(([key, d]) => dataRow(rec, key, d))),
      el("div", { class: "add-row" }, addInput, el("button", { class: "btn small", type: "button", onclick: add }, "Add")));
  });

  const notes = el("textarea", { rows: 4, placeholder: "Anything else found: interview outcomes, results received, timeline…" });
  notes.value = rec.investigatorNotes ?? "";
  notes.addEventListener("change", () => { rec.investigatorNotes = notes.value; upsert(rec); });

  const oos = (rec.analysis?.qe_form?.event_scopes ?? []).includes("oos") || rec.analysis?.investigation_planning?.lab_investigation_required;
  box.replaceChildren(
    el("div", { class: "panel data-intro" },
      el("div", {},
        el("h2", {}, "Evidence to collect"),
        el("p", { class: "hint" }, "Record what each check found. A factor is only ruled out with data: cite the record, value, limit and date. Items marked ", el("span", { class: "origin event" }, "event"), " were added for this specific deviation."),
        el("div", { class: "meter big" }, el("i", { style: `width:${pct}%` })),
        el("p", { class: "mono hint" }, `${s.collected} of ${s.total} items recorded · ${s.anomalies} anomalies`)),
      el("div", { class: "run-opts" },
        el("button", { class: "btn", type: "button", onclick: () => completeInvestigation(rec, false) }, "Draft without AI"),
        el("button", { class: "btn primary", type: "button", onclick: () => completeInvestigation(rec, true) }, icon(ICON.sparkle), rec.investigation ? "Re-draft investigation" : "Complete investigation with Claude"))),
    oos ? oosPanel() : null,
    ...groups,
    el("section", { class: "panel" }, el("h2", {}, "Investigator notes"), notes),
  );
}

function dataRow(rec, key, d) {
  const note = el("textarea", { rows: 2, placeholder: "Finding: record reviewed, value vs limit, date…" });
  note.value = d.note ?? "";
  note.addEventListener("change", () => { d.note = note.value; if (d.status === "pending" && d.note.trim()) d.status = "ok"; upsert(rec); renderEvent(); });
  return el("li", { class: `data-row st-${d.status}` },
    el("div", { class: "data-main" },
      el("p", { class: "data-item" }, d.origin !== "library" ? el("span", { class: `origin ${d.origin}` }, d.origin) : null, d.item),
      d.source || d.why ? el("p", { class: "hint" }, d.source ? `Source: ${d.source}` : "", d.source && d.why ? " · " : "", d.why || "") : null,
      note),
    el("div", { class: "seg-status", role: "radiogroup", "aria-label": "Status" }, STATUSES.map((st) => el("button", {
      type: "button", role: "radio", class: `seg ${d.status === st ? "on" : ""} s-${st}`, "aria-checked": String(d.status === st),
      onclick: () => { d.status = st; upsert(rec); renderEvent(); },
    }, STATUS_LABEL[st]))));
}

function oosPanel() {
  return el("details", { class: "panel oos-panel" },
    el("summary", {}, el("h2", {}, "OOS laboratory investigation checklists"), el("span", { class: "hint" }, "SOPQC0018/Onc · FDA OOS guidance")),
    OOS_PHASES.map((p) => el("div", { class: "oos-phase" },
      el("h3", {}, p.phase, el("span", { class: "hint" }, ` · ${p.owner}`)),
      Object.entries(p.groups).map(([g, qs]) => el("div", { class: "oos-group" }, el("p", { class: "label" }, g), el("ul", {}, qs.map((q) => el("li", {}, q))))))));
}

async function completeInvestigation(rec, useClaude) {
  if (rec.investigation && !(await confirmBox("Draft the investigation and closure stages again? Your edits to those forms are replaced.", "Re-draft"))) return;
  const s = summary(rec);
  if (!s.collected && !(await confirmBox("No findings are recorded yet. The draft will be mostly placeholders and hypotheses. Continue?", "Continue"))) return;
  let result, meta;
  if (useClaude && claudeReady()) {
    const res = await runClaude("investigation", rec, "Claude is writing the 6M investigation, root cause, CAPA and closure…");
    if (!res) return;
    result = res.result;
    meta = { source: res.offline ? "offline" : "claude", model: res.model };
  } else {
    if (useClaude && !(await confirmBox("Claude is not connected. Make an offline draft from your findings?", "Draft offline"))) return;
    result = offlineInvestigation(rec);
    meta = { source: "offline" };
  }
  upsert(applyInvestigation(rec, result, meta));
  state.tab = "workflow";
  renderEvent();
  $("#stage-investigation")?.scrollIntoView({ behavior: "smooth", block: "start" });
  toast("Investigation drafted. Check the compliance tab before submission.");
}

// ----- insight tab

function renderInsight(rec) {
  const a = rec.analysis, inv = rec.investigation;
  const panels = [];
  if (a?.hypotheses?.length) {
    panels.push(el("section", { class: "panel" }, el("div", { class: "panel-head" }, el("h2", {}, "Candidate causes"), el("span", { class: "panel-meta" }, "Confirm or refute each with evidence")),
      el("div", { class: "table-wrap" }, el("table", { class: "plain" },
        el("thead", {}, el("tr", {}, ["Cause", "6M", "Likelihood", "Confirm by", "Refute by"].map((h) => el("th", {}, h)))),
        el("tbody", {}, a.hypotheses.map((h) => el("tr", {},
          el("td", {}, el("strong", {}, h.cause), el("p", { class: "hint" }, h.rationale)),
          el("td", {}, h.factor), el("td", {}, el("span", { class: `badge ${{ High: "High", Medium: "Medium", Low: "Low" }[h.likelihood]}` }, h.likelihood)),
          el("td", {}, h.confirm_by), el("td", {}, h.refute_by))))))));
  }
  if (a?.interviews?.length) {
    panels.push(el("section", { class: "panel" }, el("h2", {}, "Interviews"),
      el("div", { class: "interviews" }, a.interviews.map((iv) => el("div", {}, el("p", { class: "label" }, iv.who), el("ol", {}, iv.questions.map((q) => el("li", {}, q))))))));
  }
  const lists = [
    ["Containment", a?.containment], ["Missing information", a?.missing_information],
    ["5 Whys", inv?.five_whys?.map((w, i) => `Why ${i + 1}: ${w}`)], ["Open points before submission", inv?.open_points],
  ].filter(([, v]) => v?.length);
  if (lists.length) {
    panels.push(el("div", { class: "grid-2" }, lists.map(([t, v]) => el("section", { class: "panel" }, el("h2", {}, t), el("ul", { class: "bullets" }, v.map((x) => el("li", {}, x)))))));
  }
  if (inv?.inspection_readiness?.length) {
    panels.push(el("section", { class: "panel" }, el("h2", {}, "What an inspector would challenge"),
      el("ul", { class: "challenge" }, inv.inspection_readiness.map((x) => el("li", {}, el("strong", {}, x.risk), el("p", {}, x.mitigation))))));
  }
  const refs = (a?.regulatory_focus ?? []).map((f) => ({ ...REFERENCES.find((r) => r.id === f.reference_id), why: f.why })).filter((r) => r.id);
  if (refs.length) {
    panels.push(el("section", { class: "panel" }, el("h2", {}, "Regulatory references for this event"),
      el("ul", { class: "refs" }, refs.map((r) => el("li", {}, el("p", {}, el("strong", {}, r.doc), el("span", { class: "mono hint" }, ` ${r.clause}`)), el("p", { class: "hint" }, r.text), el("p", { class: "why" }, r.why))))));
  }
  if (!panels.length) panels.push(el("p", { class: "empty-note" }, "Candidate causes, interviews and references appear here after a Claude draft."));
  $("#tab-insight").replaceChildren(...panels);
}

// ----- compliance tab

function renderCheck(rec, s, checks) {
  const label = { error: "Must fix", warning: "Review", info: "Note" };
  $("#tab-check").replaceChildren(
    el("section", { class: "panel" },
      el("div", { class: "panel-head" }, el("h2", {}, "Compliance check"), el("span", { class: "panel-meta" }, "SOPQA0015E/Onc, SOPQA0146E/Onc, EU GMP, ICH, 21 CFR 211")),
      el("ul", { class: "checks" }, checks.map((c) => el("li", { class: `check ${c.level}` },
        el("span", { class: "check-level" }, label[c.level]),
        el("div", {}, el("p", {}, c.message), el("p", { class: "mono hint" }, c.ref)))))),
    el("section", { class: "panel" }, el("h2", {}, "Common inspection findings on investigations"),
      el("ul", { class: "challenge" }, INSPECTION_FINDINGS.map((f) => el("li", {}, el("strong", {}, f.finding), el("p", {}, f.fix), el("p", { class: "mono hint" }, f.ref))))));
}

// ---------- print ----------

const fileStem = (rec) => (rec.number || `quality-event-${(rec.input.detectionDate || "draft")}`).replace(/[^\w.-]+/g, "-");

function printRecord(rec) {
  const root = $("#print-root") ?? document.body.appendChild(el("div", { id: "print-root" }));
  root.replaceChildren(...reportNodes(rec));
  window.print();
}

// A standalone, printable copy of the report (used where the page cannot print).
const REPORT_CSS = "body{font:11pt/1.45 system-ui,sans-serif;margin:24px auto;max-width:900px;padding:0 16px;color:#111;background:#fff}h1{font-size:18pt;margin:0 0 4pt}h2{font-size:13pt;margin:16pt 0 6pt;border-bottom:1px solid #999;padding-bottom:2pt}dl{display:grid;grid-template-columns:34% 66%;margin:0}dt{font-weight:600;padding:4pt 8pt 4pt 0;border-top:1px solid #ddd}dd{margin:0;padding:4pt 0;border-top:1px solid #ddd;white-space:pre-wrap}table{width:100%;border-collapse:collapse;font-size:9.5pt}th,td{border:1px solid #bbb;padding:3pt 5pt;text-align:left;vertical-align:top}.draft-note{font-weight:600;border:1px solid #000;padding:4pt 6pt}";
function reportHtml(rec) {
  const wrap = el("div", {}, ...reportNodes(rec));
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${wrap.querySelector("h1").innerHTML}</title><style>${REPORT_CSS}</style></head><body>${wrap.innerHTML}</body></html>`;
}

function reportNodes(rec) {
  const s = summary(rec);
  return [
    el("h1", {}, `${rec.number || "Quality event"} – ${s.title}`),
    el("p", {}, `Stage: ${s.stage} · Initial RPN ${s.initialRpn ?? "—"} ${s.initialClass ? `(${s.initialClass.name})` : ""}${s.finalRpn ? ` · Final RPN ${s.finalRpn} (${s.finalClass.name})` : ""} · Printed ${new Date().toISOString().slice(0, 10)}`),
    el("p", { class: "draft-note" }, "DRAFT prepared with QE Investigator. Not a GMP record until entered, reviewed and approved in Scigeniq."),
    ...reportSections(rec).map((sec) => el("section", {}, el("h2", {}, `${sec.stage} · ${sec.form}`),
      el("dl", {}, sec.fields.map(([l, v]) => [el("dt", {}, l), el("dd", {}, v)])))),
    el("section", {}, el("h2", {}, "Investigation data plan"),
      el("table", {}, el("thead", {}, el("tr", {}, ["6M", "Item", "Status", "Finding"].map((h) => el("th", {}, h)))),
        el("tbody", {}, Object.values(rec.dataItems ?? {}).map((d) => el("tr", {}, el("td", {}, d.factor), el("td", {}, d.item), el("td", {}, STATUS_LABEL[d.status]), el("td", {}, d.note || "")))))),
  ];
}

// ---------- register ----------

function renderRegister() {
  const table = $("#register");
  if (!state.records.length) {
    table.replaceChildren(el("tbody", {}, el("tr", {}, el("td", { class: "empty" }, el("strong", {}, "No events yet"), el("span", {}, "Create one from New event.")))));
  } else {
    table.replaceChildren(
      el("thead", {}, el("tr", {}, ["Event", "Class", "RPN", "Stage", "Detected", "Investigation due", "Data"].map((h) => el("th", {}, h)))),
      el("tbody", {}, state.records.map((r) => {
        const s = summary(r);
        const overdue = !r.closed && !r.investigation && s.deadlines.investigationDue && s.deadlines.investigationDue < new Date().toISOString().slice(0, 10);
        return el("tr", {
          class: `lv-${s.initialClass?.level ?? "none"}`, tabindex: 0,
          onclick: () => openRecord(r.uid), onkeydown: (e) => { if (e.key === "Enter") openRecord(r.uid); },
        },
        el("td", {}, el("div", { class: "risk-title" }, s.title), el("div", { class: "id" }, r.number || "number pending")),
        el("td", {}, classBadge(s.initialClass)),
        el("td", { class: "mono" }, s.initialRpn ?? "—", s.finalRpn ? ` → ${s.finalRpn}` : ""),
        el("td", {}, s.stage),
        el("td", { class: "mono" }, r.input.detectionDate || "—"),
        el("td", { class: `mono ${overdue ? "overdue" : ""}` }, s.deadlines.investigationDue || "—"),
        el("td", { class: "mono" }, s.total ? `${s.collected}/${s.total}` : "—"));
      })));
  }
  const { periods, table: t } = trend(state.records);
  const dims = [["classification", "By classification"], ["rootCause", "By root cause"], ["scope", "By scope (type)"], ["department", "By department"], ["status", "By status"]];
  $("#trend").replaceChildren(state.records.length
    ? el("div", { class: "trend-grid" }, dims.map(([key, title]) => el("div", { class: "table-wrap" }, el("table", { class: "plain small-table" },
      el("thead", {}, el("tr", {}, el("th", {}, title), periods.map((p) => el("th", { class: "mono" }, p)))),
      el("tbody", {}, Object.entries(t[key]).map(([k, counts]) => el("tr", {}, el("td", {}, k), periods.map((p) => el("td", { class: "mono" }, counts[p] ?? 0)))))))))
    : el("p", { class: "empty-note" }, "Trending appears once events are recorded. Compare each semester with the same semester of the previous year (e.g. H1/2026 vs H1/2025)."));
}

function openRecord(uid) {
  state.current = uid;
  state.tab = "workflow";
  refreshNav();
  setView("event");
}

// ---------- masterclass ----------

function renderMasterclass() {
  const box = $("#masterclass");
  if (box.childElementCount) return;
  const scaleTable = (title, table) => el("div", {}, el("p", { class: "label" }, title), el("table", { class: "plain small-table" },
    el("tbody", {}, Object.entries(table).map(([k, [n, d]]) => el("tr", {}, el("td", { class: "mono" }, k), el("td", {}, el("strong", {}, n)), el("td", {}, d))))));
  const steps = [
    ["Open · within 1 working day", "Log the event (title, assign to, associated users, site, description), then the Quality Event Form: occurrence date, Where/What/Who/Why, scope, department, detected by, detection date, failure description, immediate actions, related records, attachments. Quarantine affected batches (Note 04)."],
    ["In Review · QA", "Initial risk assessment S × O × D with justifications, historical review for recurrence, standalone actions if needed, decision Approve / More Information / Cancel."],
    ["Investigation Planning", "Investigation required? (mandatory for major and critical). Create one investigation task per department that must investigate and the standalone actions (R&D recommendation, sampling, analysis, stability, retraining, reworking/reprocessing template, change control). Set due dates."],
    ["Wait Investigation Implementation · ≤ 30 working days", "Each investigation form: description, approach, immediate action, numerical results, root cause, actions, results, conclusion, supporting data, and the 6M with an evidence-based assessment for every factor. Reviewed by the department, approved by QA. Up to two justified 30-day extensions (EC-KO)."],
    ["RCA and CAPA Planning", "Impact assessment (product, patient, other batches, validation status), possible extension, CAPA required and whether to wait, investigation summary, root cause category, the 13 impact assessment questions, final RPN, due-date change, overall conclusion."],
    ["Wait CAPA Implementation", "Only if CAPA is required and closure waits for it (SOPQA0026/Onc)."],
    ["QA Manager Approval → QP", "Approved / Not Approved (back to Investigation Planning). Decide whether a second QP approval is needed (e.g. commercial or validation batch, release decision)."],
  ];
  box.append(
    el("section", { class: "panel mc-hero" },
      el("h2", { class: "mc-title" }, "From deviation description to an inspection-ready investigation"),
      el("p", { class: "hint" }, "The site workflow, the scoring rules, the data to collect, the methods and the references, in one place. Everything here is also given to Claude when it drafts.")),
    el("section", { class: "panel" }, el("h2", {}, "The workflow, stage by stage"),
      el("ol", { class: "mc-steps" }, steps.map(([t, d]) => el("li", {}, el("strong", {}, t), el("p", {}, d)))),
      el("div", { class: "grid-2 mc-tasks" }, Object.entries(TASK_WORKFLOWS).map(([k, st]) => el("div", {}, el("p", { class: "label" }, `${k} task`), el("p", { class: "mono hint" }, st.join(" → ")))))),
    el("section", { class: "panel" }, el("h2", {}, "Risk Prioritization Number (QA0015E/Onc/AE07/02)"),
      el("div", { class: "grid-3" }, scaleTable("Severity", SEVERITY), scaleTable("Occurrence", OCCURRENCE), scaleTable("Detectability", DETECTABILITY)),
      el("div", { class: "class-strip" }, CLASSES.map((c) => el("div", { class: `cls ${c.level}` }, el("strong", {}, c.name), el("span", { class: "mono" }, c.code === "CR" ? `RPN ≥ ${c.min}` : `RPN ${c.min}–${c.max}`))))),
    details("Incident or deviation? (Exhibit AE08)", el("table", { class: "plain" }, el("thead", {}, el("tr", {}, ["Category", "Incident", "Deviation"].map((h) => el("th", {}, h)))),
      el("tbody", {}, EXHIBIT.map((e) => el("tr", {}, el("td", {}, el("strong", {}, e.category)), el("td", {}, e.incident), el("td", {}, e.deviation)))))),
    details("Mandatory selections by scope (AE05)", el("div", { class: "table-wrap" }, el("table", { class: "plain small-table matrix-table" },
      el("thead", {}, el("tr", {}, el("th", {}, "Scope"), MANDATORY_COLUMNS.map(([, l]) => el("th", {}, l)))),
      el("tbody", {}, SCOPES.map((s) => el("tr", {}, el("td", {}, s.name), s.mandatory.map((m) => el("td", { class: m ? "yes" : "no" }, m ? "Yes" : "–")))))))),
    details("Root cause methods", el("ul", { class: "refs" }, METHODS.map((m) => el("li", {}, el("p", {}, el("strong", {}, m.name)), el("p", {}, m.use), el("p", { class: "mono hint" }, m.ref))))),
    details("Data to collect, by 6M", el("div", { class: "grid-2" }, SIX_M.map((m) => el("div", {}, el("p", { class: "label" }, m), el("ul", { class: "bullets" },
      DATA_ITEMS.filter((d) => d.m === m).map((d) => el("li", {}, d.item, el("span", { class: "hint" }, ` (${d.source})`)))))))),
    details("OOS laboratory phases", OOS_PHASES.map((p) => el("div", { class: "oos-phase" }, el("h3", {}, p.phase),
      Object.entries(p.groups).map(([g, qs]) => el("div", { class: "oos-group" }, el("p", { class: "label" }, g), el("ul", {}, qs.map((q) => el("li", {}, q)))))))),
    details("What inspectors cite on investigations", el("ul", { class: "challenge" }, INSPECTION_FINDINGS.map((f) => el("li", {}, el("strong", {}, f.finding), el("p", {}, f.fix), el("p", { class: "mono hint" }, f.ref))))),
    details("Regulatory references", el("ul", { class: "refs" }, REFERENCES.map((r) => el("li", {}, el("p", {}, el("strong", {}, r.doc), el("span", { class: "mono hint" }, ` ${r.body} · ${r.clause}`)), el("p", { class: "hint" }, r.text))))),
  );
}
const details = (title, ...body) => el("details", { class: "panel mc-details" }, el("summary", {}, el("h2", {}, title)), ...body);

// ---------- settings ----------

function setupSettings() {
  $("#set-model").append(...MODELS.map(([id, name]) => el("option", { value: id }, name)));
  $("#set-effort").append(...EFFORTS.map((e) => el("option", { value: e }, e)));
  $("#set-mode").addEventListener("change", () => { $("#set-key-row").hidden = $("#set-mode").value !== "browser"; });
  $("#open-settings").addEventListener("click", openSettings);
  $("#settings").addEventListener("close", () => {
    if ($("#settings").returnValue !== "save") return;
    Object.assign(state.settings, {
      mode: runtime.sample ? "account" : $("#set-mode").value, apiKey: $("#set-key").value.trim(), model: $("#set-model").value, effort: $("#set-effort").value,
    });
    persist(SETTINGS_KEY, state.settings);
    refreshNav();
    updateRunHint();
    toast("Settings saved.");
  });
}

function openSettings() {
  const s = state.settings;
  $("#set-mode").value = s.mode;
  $("#set-key").value = s.apiKey;
  $("#set-model").value = s.model;
  $("#set-effort").value = s.effort;
  $("#set-key-row").hidden = s.mode !== "browser";
  const account = s.mode === "account";
  $("#set-mode").closest("label").hidden = account;
  $("#set-model").closest("label").hidden = account;
  $("#server-line").textContent = account
    ? "Drafts run on your own Claude account, using its most capable model. Claude asks your permission the first time this page uses it."
    : state.server.available
    ? "The local server has an API key configured: choose “Local server” to keep the key off this device."
    : "No local server key detected. Either run the app with `ANTHROPIC_API_KEY=… npm start`, or use your own key in this browser.";
  $("#settings").returnValue = "";
  $("#settings").showModal();
}

function updateRunHint() {
  $("#run-claude").disabled = false;
  $("#run-hint").textContent = claudeReady()
    ? "Claude drafts the Open, In Review and Investigation Planning stages, the hypotheses and the full data plan for the investigation."
    : "Claude is not connected (Settings). You can still make an offline draft from the SOP rules and the data library.";
}

// ---------- theme ----------

function applyTheme(theme) {
  if (theme === "system") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.dataset.theme = theme;
  $("#theme-label").textContent = `Theme: ${theme}`;
}
function setupTheme() {
  let theme = "system";
  try { theme = localStorage.getItem(THEME_KEY) || "system"; } catch { /* storage unavailable */ }
  applyTheme(theme);
  $("#theme-toggle").addEventListener("click", () => {
    theme = { system: "light", light: "dark", dark: "system" }[theme];
    try { localStorage.setItem(THEME_KEY, theme); } catch { /* storage unavailable */ }
    applyTheme(theme);
  });
}

// ---------- backup ----------

function setupBackup() {
  $("#export-json").addEventListener("click", () => {
    download(`quality-events-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ app: "qe-investigator", version: 1, records: state.records }, null, 2), "application/json");
  });
  $("#import-json").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const incoming = Array.isArray(data.records) ? data.records : [];
      if (!incoming.every((r) => r && r.uid && r.input)) throw new Error("not a QE Investigator backup");
      const known = new Set(state.records.map((r) => r.uid));
      const added = incoming.filter((r) => !known.has(r.uid));
      state.records = [...added, ...state.records];
      saveRecords();
      added.forEach(syncRecord);
      refreshNav();
      renderRegister();
      toast(`Imported ${added.length} event(s)${incoming.length > added.length ? `, ${incoming.length - added.length} already present` : ""}.`);
    } catch (err) {
      toast(`Could not import: ${err.message}.`);
    }
  });
}

// ---------- start ----------

function init() {
  setupTheme();
  setupIntake();
  setupSettings();
  setupBackup();
  $$("[data-view]").forEach((b) => b.addEventListener("click", () => setView(b.dataset.view)));
  $$("#event-tabs .tab").forEach((t) => t.addEventListener("click", () => { state.tab = t.dataset.tab; renderEvent(); }));
  $("#busy-cancel").addEventListener("click", () => state.abort?.abort());
  $("#busy").addEventListener("cancel", (e) => { e.preventDefault(); state.abort?.abort(); });
  state.current = state.records[0]?.uid ?? null;
  refreshNav();
  updateRunHint();
  const start = location.hash.slice(1);
  setView(VIEWS[start] ? start : "new");
  if (runtime.inArtifact) {
    $$('a.nav-item[href="../"]').forEach((a) => { a.hidden = true; });
    state.settings.mode = "account";
    connectRuntime();
    return;
  }
  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
    navigator.serviceWorker.register("../sw.js").catch(() => {});
  }
  serverStatus().then((s) => {
    state.server = s;
    if (!s.available && state.settings.mode === "server" && state.settings.apiKey) state.settings.mode = "browser";
    refreshNav();
    updateRunHint();
  });
}

async function connectRuntime() {
  const [sample, db, user, downloads] = await Promise.all(
    ["sample", "db", "user", "downloads"].map((name) => window.claude.use(name).catch(() => null)),
  );
  runtime.sample = sample;
  runtime.downloads = downloads;
  const id = user ? await user.id().catch(() => null) : null;
  if (db && id) {
    try {
      const col = db.collection(`data/users/${id}`);
      const snap = await col.get();
      runtime.col = col;
      const byUid = new Map(state.records.map((r) => [r.uid, r]));
      const remote = new Set();
      for (const doc of snap.docs) {
        let r = null;
        try { r = JSON.parse(doc.data()?.json ?? "null"); } catch { /* skip an unreadable document */ }
        if (!r?.uid) continue;
        remote.add(r.uid);
        const local = byUid.get(r.uid);
        if (!local || (r.updatedAt ?? "") >= (local.updatedAt ?? "")) byUid.set(r.uid, r);
        else syncRecord(local);
      }
      for (const r of byUid.values()) if (!remote.has(r.uid)) syncRecord(r);
      state.records = [...byUid.values()].sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
      saveRecords();
      state.current ??= state.records[0]?.uid ?? null;
    } catch { /* storage unavailable: events stay in this browser */ }
  }
  refreshNav();
  updateRunHint();
  if (state.view === "event") renderEvent();
  if (state.view === "register") renderRegister();
}

init();
