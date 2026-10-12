import {
  SEVERITY_LABELS, OCCURRENCE_LABELS, DETECTION_LABELS, STATUSES, CATEGORIES, LEVELS,
  evaluate, validateRisk, nextId, filterRisks, sortRisks, buildMatrix, summarize,
  riskLevel, rpn, toCsv, fromCsv, toIsoDate,
} from "./risk.js";
import { levelBreakdown, reviewSchedule, rpnConcentration } from "./risk.js";
import { controlEffectChart, levelProfileChart, reviewScheduleChart } from "./charts.js";
import { SAMPLE_RISKS } from "./sample-data.js";

const STORAGE_KEY = "goodkid.qrm.risks.v1";
const SCALE_LABELS = { severity: SEVERITY_LABELS, occurrence: OCCURRENCE_LABELS, detection: DETECTION_LABELS };
const NUMERIC = ["severity", "occurrence", "detection", "residualSeverity", "residualOccurrence", "residualDetection"];

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const state = {
  risks: loadRisks(),
  sort: { key: "rpn", direction: "desc" },
  filters: { query: "", level: "", status: "", category: "" },
  matrixMode: "initial",
  cell: null,
  analysis: { scope: "all", category: "", group: "category", tables: new Set() },
  editingId: null,
};

// ---------- persistence ----------

function loadRisks() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* storage unavailable or corrupt: fall back to sample data */ }
  return structuredClone(SAMPLE_RISKS);
}

function saveRisks() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.risks));
  } catch {
    toast("Could not save to browser storage. Export a CSV to keep your changes.");
  }
}

// ---------- helpers ----------

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") node.className = v;
    else if (k === "dataset") Object.assign(node.dataset, v);
    else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null && v !== false) node.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c !== null && c !== undefined) node.append(c instanceof Node ? c : String(c));
  }
  return node;
}

const badge = (level) => (level ? el("span", { class: `badge ${level}` }, level) : "—");

function evaluated() {
  const today = new Date();
  return state.risks.map((r) => evaluate(r, today));
}

let toastTimer;
function toast(message) {
  const t = $("#toast");
  t.textContent = message;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2600);
}

function fillSelect(select, values, { blank } = {}) {
  if (blank !== undefined) select.append(el("option", { value: "" }, blank));
  for (const v of values) {
    if (typeof v === "object") select.append(el("option", { value: v.value }, v.label));
    else select.append(el("option", { value: v }, v));
  }
}

// ---------- navigation ----------

function showView(name) {
  $$(".tab").forEach((t) => t.classList.toggle("active", t.dataset.view === name));
  $$(".view").forEach((v) => v.classList.toggle("active", v.id === `view-${name}`));
}

// ---------- dashboard ----------

function renderBars(container, counts, colorFor) {
  const max = Math.max(1, ...Object.values(counts));
  container.replaceChildren(...Object.entries(counts).map(([label, count]) =>
    el("div", { class: "bar-row" },
      el("span", {}, label),
      el("div", { class: "bar-track" },
        el("div", { class: "bar-fill", style: `width:${(count / max) * 100}%;${colorFor ? `background:${colorFor(label)}` : ""}` })),
      el("span", { class: "bar-count" }, count))));
}

function renderDashboard(risks) {
  const s = summarize(risks);
  const kpis = [
    ["Total risks", s.total],
    ["Open", s.open],
    ["Open high / critical", s.highOrCritical, s.highOrCritical > 0],
    ["Overdue reviews", s.overdue, s.overdue > 0],
    ["Average RPN", s.averageRpn],
    ["RPN reduced by controls", s.rpnReduced],
  ];
  $("#kpis").replaceChildren(...kpis.map(([label, value, alert]) =>
    el("div", { class: `kpi${alert ? " alert" : ""}` },
      el("div", { class: "value" }, value), el("div", { class: "label" }, label))));

  renderBars($("#level-bars"), s.byLevel, (l) => `var(--${l.toLowerCase()})`);
  renderBars($("#status-bars"), s.byStatus);

  const top = sortRisks(risks.filter((r) => r.status !== "Closed"), "rpn").slice(0, 5);
  $("#top-risks").replaceChildren(top.length
    ? el("div", { class: "table-wrap" }, el("table", {},
        el("thead", {}, el("tr", {}, ["ID", "Title", "RPN", "Level", "Owner", "Status"].map((h) => el("th", {}, h)))),
        el("tbody", {}, top.map((r) => el("tr", { onclick: () => openEditor(r.id) },
          el("td", {}, r.id), el("td", { class: "title" }, r.title), el("td", { class: "num" }, r.rpn),
          el("td", {}, badge(r.level)), el("td", {}, r.owner || "—"), el("td", { class: "status" }, r.status))))))
    : el("p", { class: "empty" }, "No open risks. 🎉"));
}

// ---------- register ----------

function renderRegister(risks) {
  const scoped = state.cell ? risks.filter((r) => matchesCell(r, state.cell)) : risks;
  const rows = sortRisks(filterRisks(scoped, state.filters), state.sort.key, state.sort.direction);
  const chip = $("#cell-chip");
  chip.hidden = !state.cell;
  if (state.cell) {
    const { severity, occurrence, residual } = state.cell;
    $("#cell-chip-text").textContent =
      `${residual ? "Residual" : "Initial"} cell: S${severity} × O${occurrence}`;
  }
  $("#register tbody").replaceChildren(...rows.map((r) => el("tr", { onclick: () => openEditor(r.id) },
    el("td", {}, r.id),
    el("td", { class: "title" }, r.title),
    el("td", {}, r.category || "—"),
    el("td", { class: "num" }, r.severity),
    el("td", { class: "num" }, r.occurrence),
    el("td", { class: "num" }, r.detection),
    el("td", { class: "num" }, el("strong", {}, r.rpn)),
    el("td", {}, badge(r.level)),
    el("td", {}, r.residualRpn === null ? "—" : [badge(r.residualLevel), ` ${r.residualRpn}`]),
    el("td", {}, r.owner || "—"),
    el("td", { class: "status" }, r.status),
    el("td", { class: r.overdue ? "overdue" : "" }, r.reviewDate || "—", r.overdue ? " (overdue)" : ""))));
  $("#register-empty").hidden = rows.length > 0;

  $$("#register th").forEach((th) => {
    const active = th.dataset.sort === state.sort.key;
    th.classList.toggle("sorted", active);
    th.classList.toggle("asc", active && state.sort.direction === "asc");
  });
}

// ---------- matrix ----------

function renderMatrix(risks) {
  const residual = state.matrixMode === "residual";
  const grid = buildMatrix(risks, { residual });
  const cells = [];
  for (let s = 5; s >= 1; s--) {
    cells.push(el("div", { class: "lbl", title: SEVERITY_LABELS[s] }, s));
    for (let o = 1; o <= 5; o++) {
      const count = grid[s - 1][o - 1];
      const level = riskLevel(s, o);
      cells.push(el("button", {
        class: `cell ${level}${count ? "" : " empty-cell"}`,
        title: `Severity ${s} (${SEVERITY_LABELS[s]}) × Occurrence ${o} (${OCCURRENCE_LABELS[o]}): ${level}, ${count} risk(s)`,
        onclick: () => drillDown(s, o, residual),
      }, count || "·"));
    }
  }
  cells.push(el("div"));
  for (let o = 1; o <= 5; o++) cells.push(el("div", { class: "lbl", title: OCCURRENCE_LABELS[o] }, o));
  $("#matrix").replaceChildren(...cells);

  const descriptions = {
    Low: "Acceptable. Monitor through routine quality systems.",
    Medium: "Reduce as low as reasonably practicable.",
    High: "Not acceptable without risk controls and QA approval.",
    Critical: "Unacceptable. Immediate action and escalation required.",
  };
  $("#legend").replaceChildren(
    el("h2", {}, residual ? "Residual risk (after controls)" : "Initial risk (before controls)"),
    ...LEVELS.slice().reverse().map((l) => el("div", { class: "legend-item" },
      el("span", { class: "swatch", style: `background:var(--${l.toLowerCase()})` }),
      el("div", {}, el("strong", {}, l), el("div", { class: "hint" }, descriptions[l])))));
}

function drillDown(severity, occurrence, residual) {
  const inCell = evaluated().filter((r) => matchesCell(r, { severity, occurrence, residual }));
  if (!inCell.length) { toast("No risks in this cell."); return; }
  if (inCell.length === 1) { openEditor(inCell[0].id); return; }
  state.filters = { query: "", level: "", status: "", category: "" };
  state.cell = { severity, occurrence, residual };
  syncFilterInputs();
  showView("register");
  render();
}

function matchesCell(r, { severity, occurrence, residual }) {
  return residual
    ? r.residualSeverity === severity && r.residualOccurrence === occurrence
    : r.severity === severity && r.occurrence === occurrence;
}

// ---------- analysis ----------

function table(headers, rows) {
  return el("table", {},
    el("thead", {}, el("tr", {}, headers.map((h) => el("th", {}, h)))),
    el("tbody", {}, rows.map((cells) => el("tr", {}, cells.map((c) =>
      el("td", { class: typeof c === "number" ? "num" : "" }, c ?? "—"))))));
}

function chartWidth(id) {
  return Math.floor($(id).clientWidth || $(id).parentElement.clientWidth || 600);
}

function renderAnalysis(all) {
  if (!$("#view-analysis").classList.contains("active")) return;
  const a = state.analysis;
  const risks = all.filter((r) =>
    (a.scope === "all" || r.status !== "Closed") && (!a.category || r.category === a.category));
  $("#a-count").textContent = `${risks.length} risk(s) in view`;

  // Control effect (dumbbell)
  const assessed = risks.filter((r) => r.residualRpn !== null);
  const reduced = assessed.reduce((s, r) => s + (r.rpn - r.residualRpn), 0);
  const before = assessed.reduce((s, r) => s + r.rpn, 0);
  const pareto = rpnConcentration(risks);
  $("#effect-sub").textContent = risks.length
    ? `${assessed.length} of ${risks.length} risks have a residual assessment` +
      (before ? `, with controls cutting their RPN by ${Math.round((reduced / before) * 100)}%. ` : ". ") +
      (pareto.open ? `${pareto.count} of ${pareto.open} open risks make up 80% of open RPN.` : "")
    : "No risks match the current selection.";
  $("#chart-effect").innerHTML = risks.length ? controlEffectChart(risks, chartWidth("#chart-effect")) : "";
  $("#table-effect").replaceChildren(table(
    ["ID", "Title", "Initial RPN", "Level", "Residual RPN", "Residual level", "Reduction"],
    sortRisks(risks, "rpn").map((r) => [r.id, r.title, r.rpn, r.level, r.residualRpn, r.residualLevel,
      r.residualRpn === null ? null : r.rpn - r.residualRpn])));

  // Risk profile (stacked bars)
  const groupLabel = { category: "Category", owner: "Owner", status: "Status" }[a.group];
  const profile = levelBreakdown(risks, a.group);
  $("#profile-legend").replaceChildren(...LEVELS.slice().reverse().map((l) =>
    el("span", {}, el("span", { class: "swatch", style: `background:var(--${l.toLowerCase()})` }), l)));
  $("#chart-profile").innerHTML = profile.length ? levelProfileChart(profile, chartWidth("#chart-profile")) : "";
  $("#table-profile").replaceChildren(table([groupLabel, ...LEVELS.slice().reverse(), "Total"],
    profile.map((r) => [r.group, ...LEVELS.slice().reverse().map((l) => r[l]), r.total])));

  // Review schedule (bars)
  const schedule = reviewSchedule(risks, new Date());
  $("#chart-schedule").innerHTML = reviewScheduleChart(schedule, chartWidth("#chart-schedule"));
  $("#table-schedule").replaceChildren(table(["Due", "Reviews", "Risks"],
    schedule.map((b) => [b.label, b.count, b.ids.join(", ") || null])));

  for (const name of ["effect", "profile", "schedule"]) {
    const shown = a.tables.has(name);
    $(`#table-${name}`).hidden = !shown;
    $(`[data-table-toggle="${name}"]`).textContent = shown ? "Hide table" : "Show table";
  }
}

function setupTooltips() {
  const tip = $("#viz-tip");
  const view = $("#view-analysis");
  const place = (e) => {
    const pad = 14;
    const { width, height } = tip.getBoundingClientRect();
    let x = e.clientX + pad;
    let y = e.clientY + pad;
    if (x + width > innerWidth - 8) x = e.clientX - width - pad;
    if (y + height > innerHeight - 8) y = e.clientY - height - pad;
    tip.style.left = `${Math.max(8, x)}px`;
    tip.style.top = `${Math.max(8, y)}px`;
  };
  view.addEventListener("pointermove", (e) => {
    const target = e.target.closest("[data-tip]");
    if (!target) { tip.hidden = true; return; }
    const [head, ...rest] = target.dataset.tip.split("\n");
    tip.replaceChildren(el("strong", {}, head), rest.join("\n"));
    tip.hidden = false;
    place(e);
  });
  view.addEventListener("pointerleave", () => { tip.hidden = true; });
  view.addEventListener("click", (e) => {
    const target = e.target.closest("[data-id]");
    if (target) { tip.hidden = true; openEditor(target.dataset.id); }
  });
}

// ---------- editor ----------

function setupEditor() {
  const form = $("#risk-form");
  for (const select of $$("select[data-scale]", form)) {
    const labels = SCALE_LABELS[select.dataset.scale];
    fillSelect(select, Object.entries(labels).map(([v, l]) => ({ value: v, label: `${v} – ${l}` })),
      select.hasAttribute("data-optional") ? { blank: "Not assessed" } : {});
  }
  fillSelect(form.elements.category, CATEGORIES);
  fillSelect(form.elements.status, STATUSES);

  form.addEventListener("input", updateLiveScores);
  form.addEventListener("submit", (e) => { e.preventDefault(); saveFromForm(); });
  $$("[data-close]", form).forEach((b) => b.addEventListener("click", () => $("#editor").close()));
  $("#delete-risk").addEventListener("click", deleteCurrent);
}

function readForm() {
  const form = $("#risk-form");
  const data = Object.fromEntries(new FormData(form));
  for (const key of NUMERIC) data[key] = data[key] === "" || data[key] === undefined ? null : Number(data[key]);
  for (const key of Object.keys(data)) if (typeof data[key] === "string") data[key] = data[key].trim();
  return data;
}

function scoreText(s, o, d) {
  const value = rpn(s, o, d);
  return value === null ? "" : `RPN ${value} · ${riskLevel(s, o)}`;
}

function updateLiveScores() {
  const d = readForm();
  $("#initial-score").textContent = scoreText(d.severity, d.occurrence, d.detection);
  $("#residual-score").textContent = scoreText(d.residualSeverity, d.residualOccurrence, d.residualDetection);
}

function openEditor(id = null) {
  const form = $("#risk-form");
  const risk = id ? state.risks.find((r) => r.id === id) : null;
  state.editingId = risk ? risk.id : null;
  form.reset();
  $("#form-errors").hidden = true;
  $("#editor-title").textContent = risk ? `Edit ${risk.id}` : "New risk";
  $("#delete-risk").hidden = !risk;

  const values = risk || { severity: 3, occurrence: 3, detection: 3, status: "Open", category: CATEGORIES[0] };
  for (const el of form.elements) {
    if (!el.name) continue;
    const v = values[el.name];
    el.value = v === null || v === undefined ? "" : v;
  }
  updateLiveScores();
  $("#editor").showModal();
  form.elements.title.focus();
}

function saveFromForm() {
  const data = readForm();
  const errors = validateRisk(data);
  const box = $("#form-errors");
  if (errors.length) {
    box.replaceChildren(el("ul", {}, errors.map((e) => el("li", {}, e))));
    box.hidden = false;
    box.scrollIntoView({ block: "nearest" });
    return;
  }
  const now = new Date().toISOString();
  if (state.editingId) {
    const i = state.risks.findIndex((r) => r.id === state.editingId);
    state.risks[i] = { ...state.risks[i], ...data, updatedAt: now };
    toast(`${state.editingId} updated.`);
  } else {
    const id = nextId(state.risks);
    state.risks.push({ id, ...data, createdAt: now, updatedAt: now });
    toast(`${id} created.`);
  }
  saveRisks();
  $("#editor").close();
  render();
}

/**
 * In-page replacement for confirm(): shows #choice with the given buttons and
 * resolves to the chosen button's value, or null when dismissed.
 */
function choose(title, message, buttons) {
  const dialog = $("#choice");
  $("#choice-title").textContent = title;
  $("#choice-message").textContent = message;
  return new Promise((resolve) => {
    let result = null;
    $("#choice-buttons").replaceChildren(...buttons.map((b) =>
      el("button", { type: "button", class: `btn ${b.kind || ""}`, onclick: () => { result = b.value; dialog.close(); } }, b.label)));
    dialog.addEventListener("close", () => resolve(result), { once: true });
    dialog.showModal();
  });
}

async function deleteCurrent() {
  const id = state.editingId;
  if (!id) return;
  const ok = await choose(`Delete ${id}?`, "The risk is removed from the register. This cannot be undone.", [
    { label: "Cancel", value: false },
    { label: "Delete risk", value: true, kind: "danger" },
  ]);
  if (!ok) return;
  state.risks = state.risks.filter((r) => r.id !== id);
  saveRisks();
  $("#editor").close();
  render();
  toast(`${id} deleted.`);
}

// ---------- import / export ----------

function exportCsv() {
  const csv = toCsv(state.risks);
  const text = $("#export-text");
  text.value = csv;
  const download = $("#export-download");
  URL.revokeObjectURL(download.href);
  download.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  download.download = `quality-risks-${toIsoDate(new Date())}.csv`;
  $("#export-count").textContent = `${state.risks.length} risk(s)`;
  $("#export-dialog").showModal();
  text.focus();
  text.select();
}

async function copyExport() {
  const text = $("#export-text");
  try {
    await navigator.clipboard.writeText(text.value);
    toast("CSV copied. Paste it into a spreadsheet or text file.");
  } catch {
    text.focus();
    text.select();
    toast("Press Ctrl+C (or ⌘C) to copy the selected CSV.");
  }
}

async function importCsv(file) {
  try {
    const incoming = fromCsv(await file.text());
    const valid = [];
    const rejected = [];
    for (const [i, r] of incoming.entries()) {
      r.status ||= "Open";
      const errors = validateRisk(r);
      if (errors.length) rejected.push(`Row ${i + 2}: ${errors[0]}`);
      else valid.push(r);
    }
    if (!valid.length) { toast(rejected[0] || "No risks found in file."); return; }
    const mode = await choose(
      `Import ${valid.length} risk(s)`,
      (rejected.length ? `${rejected.length} row(s) were rejected. First problem: ${rejected[0]}\n\n` : "") +
        "Merge adds new risks and updates risks with matching IDs. Replace discards the current register.",
      [
        { label: "Cancel", value: null },
        { label: "Replace register", value: "replace", kind: "danger" },
        { label: "Merge", value: "merge", kind: "primary" },
      ]);
    if (!mode) return;
    const now = new Date().toISOString();
    if (mode === "replace") state.risks = [];
    for (const r of valid) {
      const existing = r.id ? state.risks.findIndex((x) => x.id === r.id) : -1;
      if (existing >= 0) state.risks[existing] = { ...state.risks[existing], ...r, updatedAt: now };
      else state.risks.push({ ...r, id: r.id || nextId(state.risks), createdAt: r.createdAt || now, updatedAt: now });
    }
    saveRisks();
    render();
    toast(`Imported ${valid.length} risk(s).${rejected.length ? ` ${rejected.length} rejected.` : ""}`);
  } catch (err) {
    toast(`Import failed: ${err.message}`);
  }
}

// ---------- wiring ----------

function syncFilterInputs() {
  $("#f-query").value = state.filters.query;
  $("#f-level").value = state.filters.level;
  $("#f-status").value = state.filters.status;
  $("#f-category").value = state.filters.category;
}

function render() {
  const risks = evaluated();
  renderDashboard(risks);
  renderRegister(risks);
  renderMatrix(risks);
  renderAnalysis(risks);
}

function init() {
  fillSelect($("#f-level"), LEVELS);
  fillSelect($("#f-status"), STATUSES);
  fillSelect($("#f-category"), CATEGORIES);
  setupEditor();

  $$(".tab").forEach((t) => t.addEventListener("click", () => {
    showView(t.dataset.view);
    if (t.dataset.view === "analysis") renderAnalysis(evaluated());
  }));
  fillSelect($("#a-category"), CATEGORIES);
  for (const [id, key] of [["#a-scope", "scope"], ["#a-category", "category"], ["#a-group", "group"]]) {
    $(id).addEventListener("input", (e) => { state.analysis[key] = e.target.value; renderAnalysis(evaluated()); });
  }
  $$("[data-table-toggle]").forEach((b) => b.addEventListener("click", () => {
    const t = state.analysis.tables;
    const name = b.dataset.tableToggle;
    if (t.has(name)) t.delete(name); else t.add(name);
    renderAnalysis(evaluated());
  }));
  setupTooltips();
  let lastWidth = 0;
  new ResizeObserver(([entry]) => {
    const w = Math.round(entry.contentRect.width);
    if (w !== lastWidth) { lastWidth = w; renderAnalysis(evaluated()); }
  }).observe($("#view-analysis"));
  $("#add-risk").addEventListener("click", () => openEditor());

  for (const [id, key] of [["#f-query", "query"], ["#f-level", "level"], ["#f-status", "status"], ["#f-category", "category"]]) {
    $(id).addEventListener("input", (e) => { state.filters[key] = e.target.value; render(); });
  }
  $$("#register th[data-sort]").forEach((th) => th.addEventListener("click", () => {
    const key = th.dataset.sort;
    state.sort = state.sort.key === key
      ? { key, direction: state.sort.direction === "asc" ? "desc" : "asc" }
      : { key, direction: ["rpn", "residualRpn", "severity", "occurrence", "detection"].includes(key) ? "desc" : "asc" };
    render();
  }));
  $$(".seg").forEach((b) => b.addEventListener("click", () => {
    state.matrixMode = b.dataset.matrix;
    $$(".seg").forEach((x) => x.classList.toggle("active", x === b));
    render();
  }));
  $("#cell-chip").addEventListener("click", () => { state.cell = null; render(); });
  $("#export-csv").addEventListener("click", exportCsv);
  $("#export-copy").addEventListener("click", copyExport);
  $$("#export-dialog [data-close]").forEach((b) => b.addEventListener("click", () => $("#export-dialog").close()));
  $("#import-csv").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) importCsv(file);
    e.target.value = "";
  });

  render();
}

init();
