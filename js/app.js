import {
  SEVERITY_LABELS, OCCURRENCE_LABELS, DETECTION_LABELS, STATUSES, CATEGORIES, LEVELS,
  evaluate, validateRisk, nextId, filterRisks, sortRisks, buildMatrix, summarize,
  riskLevel, rpn, toCsv, fromCsv, toIsoDate, levelBreakdown, reviewSchedule, rpnConcentration, describeChanges,
} from "./risk.js";
import { controlEffectChart, levelProfileChart, reviewScheduleChart } from "./charts.js";
import { SAMPLE_RISKS } from "./sample-data.js";

const STORAGE_KEY = "goodkid.qrm.risks.v1";
const THEME_KEY = "goodkid.qrm.theme";
const SCALES = [
  ["severity", "Severity", "How bad is the harm?", SEVERITY_LABELS],
  ["occurrence", "Occurrence", "How likely is it?", OCCURRENCE_LABELS],
  ["detection", "Detection", "How hard to detect?", DETECTION_LABELS],
];
const NUMERIC = ["severity", "occurrence", "detection", "residualSeverity", "residualOccurrence", "residualDetection"];
const VIEWS = {
  dashboard: ["Overview", "Risk posture"],
  register: ["Register", "Risk register"],
  matrix: ["Matrix", "Severity × occurrence"],
  analysis: ["Analysis", "Risk analytics"],
};
const LEVEL_GUIDANCE = {
  Critical: "Unacceptable. Act immediately and escalate to QA management.",
  High: "Not acceptable without risk controls and QA approval.",
  Medium: "Reduce as low as reasonably practicable.",
  Low: "Acceptable. Monitor through routine quality systems.",
};

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const state = {
  risks: loadRisks(),
  view: "dashboard",
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
    if (c !== null && c !== undefined && c !== false) node.append(c instanceof Node ? c : String(c));
  }
  return node;
}

const SVG_NS = "http://www.w3.org/2000/svg";
function svgEl(tag, attrs = {}, ...children) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const c of children) node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return node;
}

const badge = (level) => (level ? el("span", { class: `badge ${level}` }, level) : "—");
const statusClass = { Open: "s-open", "In mitigation": "s-mitigation", Monitoring: "s-monitoring", Closed: "s-closed" };
const statusTag = (status) => el("span", { class: `status ${statusClass[status] || ""}` }, status || "—");
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Current risk = residual where controls have been assessed, otherwise initial. */
const currentRpn = (r) => (r.residualRpn ?? r.rpn);
const currentLevel = (r) => (r.residualLevel ?? r.level);

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function relativeTime(iso) {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.round(ms / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${plural(d, "day")} ago`;
  return formatDate(iso);
}

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
  toastTimer = setTimeout(() => t.classList.remove("show"), 2800);
}

function fillSelect(select, values) {
  for (const v of values) select.append(el("option", { value: v }, v));
}

// ---------- theme ----------

const hostTheme = document.documentElement.getAttribute("data-theme");
function applyTheme(mode) {
  const root = document.documentElement;
  if (mode === "system") {
    if (hostTheme) root.setAttribute("data-theme", hostTheme); else root.removeAttribute("data-theme");
  } else {
    root.setAttribute("data-theme", mode);
  }
  $("#theme-label").textContent = `Theme: ${mode}`;
}
function setupTheme() {
  let mode = "system";
  try { mode = localStorage.getItem(THEME_KEY) || "system"; } catch { /* ignore */ }
  applyTheme(mode);
  $("#theme-toggle").addEventListener("click", () => {
    mode = { system: "light", light: "dark", dark: "system" }[mode];
    applyTheme(mode);
    try { localStorage.setItem(THEME_KEY, mode); } catch { /* ignore */ }
  });
}

// ---------- navigation ----------

function showView(name) {
  state.view = name;
  $$("[data-view]").forEach((t) => t.classList.toggle("active", t.dataset.view === name));
  $$(".view").forEach((v) => v.classList.toggle("active", v.id === `view-${name}`));
  const [eyebrow, title] = VIEWS[name];
  $("#page-eyebrow").textContent = eyebrow;
  $("#page-title").textContent = title;
  if (name === "analysis") renderAnalysis(evaluated());
}

// ---------- overview ----------

function attentionItems(risks) {
  const items = [];
  for (const r of risks) {
    if (r.status === "Closed") continue;
    const reasons = [];
    let weight = 0;
    if (r.overdue) { reasons.push(["Review overdue", true]); weight += 3; }
    const lvl = currentLevel(r);
    if (lvl === "Critical") { reasons.push([r.residualLevel ? "Residual risk still critical" : "Critical, no controls verified", true]); weight += 4; }
    else if (lvl === "High" && r.residualRpn === null) { reasons.push(["High risk, residual not assessed", false]); weight += 2; }
    if (!r.owner) { reasons.push(["No owner", false]); weight += 1; }
    if (reasons.length) items.push({ risk: r, reasons, weight });
  }
  return items.sort((a, b) => b.weight - a.weight || currentRpn(b.risk) - currentRpn(a.risk));
}

function renderSpectrum(open) {
  const W = Math.max(300, Math.floor($("#spectrum").clientWidth || 640));
  const left = 18;
  const right = 18;
  const x = (v) => left + (v / 125) * (W - left - right);
  const pts = [...open].sort((a, b) => currentRpn(a) - currentRpn(b));
  // Stack marks into lanes so their ID labels never collide.
  const lanes = [];
  const placed = pts.map((r) => {
    const px = x(currentRpn(r));
    let lane = lanes.findIndex((end) => px - end > 62);
    if (lane === -1) { lane = lanes.length; lanes.push(-Infinity); }
    lanes[lane] = px;
    return { r, px, lane };
  });
  const laneH = 34;
  const top = 10;
  const base = top + Math.max(1, lanes.length) * laneH + 14;
  const H = base + 28;
  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: "img",
    "aria-label": `Current RPN of ${open.length} open risks on a scale from 1 to 125` });
  svg.append(svgEl("rect", { class: "sp-band", x: left, y: base - 6, width: W - left - right, height: 6, rx: 3 }));
  for (let v = 0; v <= 125; v += 25) {
    svg.append(svgEl("line", { class: "sp-tick", x1: x(v), x2: x(v), y1: base, y2: base + 6 }));
    svg.append(svgEl("text", { class: "sp-tick-label", x: x(v), y: base + 20, "text-anchor": "middle" }, v));
  }
  for (const { px, lane } of placed) {
    const cy = base - 20 - lane * laneH;
    svg.append(svgEl("line", { class: "sp-stem", x1: px, x2: px, y1: cy + 7, y2: base - 6 }));
  }
  const labels = [];
  for (const { r, px, lane } of placed) {
    const cy = base - 20 - lane * laneH;
    const level = currentLevel(r);
    const dot = svgEl("circle", {
      class: `sp-dot ${level}`, cx: px, cy, r: 7, tabindex: 0, role: "button",
      "aria-label": `${r.id}: current RPN ${currentRpn(r)}, ${level}`,
      "data-tip": `${r.id} · ${r.title}\nCurrent RPN ${currentRpn(r)} (${level})\n${r.residualRpn === null ? "Initial score, controls not verified" : `Reduced from ${r.rpn} by controls`}`,
      onclick: () => openEditor(r.id),
      onkeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openEditor(r.id); } },
    });
    svg.append(dot);
    const flip = px + 60 > W;
    labels.push(svgEl("text", { class: "sp-label", x: flip ? px - 11 : px + 11, y: cy + 4,
      "text-anchor": flip ? "end" : "start" }, r.id));
  }
  svg.append(...labels);
  $("#spectrum").replaceChildren(svg);
}

function renderDashboard(risks) {
  const s = summarize(risks);
  const open = risks.filter((r) => r.status !== "Closed");
  const attention = attentionItems(risks);
  const assessed = risks.filter((r) => r.residualRpn !== null);
  const before = assessed.reduce((t, r) => t + r.rpn, 0);
  const cut = before ? Math.round((s.rpnReduced / before) * 100) : 0;

  $("#hero-kicker").textContent = `As of ${formatDate(toIsoDate(new Date()))} · ${plural(s.total, "record")}`;
  const line = $("#hero-line");
  line.replaceChildren(`${plural(open.length, "open risk")}. `,
    attention.length ? el("em", {}, `${attention.length} need${attention.length === 1 ? "s" : ""} action.`) : "None need action.");
  $("#hero-sub").textContent = [
    assessed.length ? `Controls have removed ${cut}% of the RPN on ${plural(assessed.length, "assessed risk")}.` : "No residual assessments yet.",
    s.overdue ? `${plural(s.overdue, "review")} ${s.overdue === 1 ? "is" : "are"} overdue.` : "All reviews are on schedule.",
  ].join(" ");
  state.openForSpectrum = open;
  renderSpectrum(open);

  const kpis = [
    { label: "Open risks", value: s.open, small: `/ ${s.total}`, meter: s.total ? s.open / s.total : 0, foot: `${s.byStatus.Closed} closed` },
    { label: "High or critical", value: s.highOrCritical, meter: s.open ? s.highOrCritical / s.open : 0, alert: s.highOrCritical > 0, foot: "Initial level, open risks" },
    { label: "Overdue reviews", value: s.overdue, meter: s.open ? s.overdue / s.open : 0, alert: s.overdue > 0, foot: s.overdue ? "Past next review date" : "Nothing overdue" },
    { label: "Average RPN", value: s.averageRpn, small: "/ 125", meter: s.averageRpn / 125, foot: "Initial, all risks" },
    { label: "Reduced by controls", value: `${cut}%`, meter: cut / 100, good: true, foot: `${s.rpnReduced} RPN points removed` },
  ];
  $("#kpis").replaceChildren(...kpis.map((k) =>
    el("div", { class: `kpi${k.alert ? " alert" : ""}${k.good ? " good" : ""}` },
      el("span", { class: "label" }, k.label),
      el("span", { class: "value" }, k.value, k.small ? el("small", {}, k.small) : null),
      el("span", { class: "meter" }, el("i", { style: `width:${Math.min(100, Math.round(k.meter * 100))}%` })),
      el("span", { class: "foot" }, k.foot))));

  $("#attention-count").textContent = attention.length ? plural(attention.length, "item") : "";
  $("#attention").replaceChildren(...(attention.length
    ? attention.slice(0, 6).map(({ risk: r, reasons }) => el("li", {},
      el("div", { class: "att", role: "button", tabindex: 0, onclick: () => openEditor(r.id),
        onkeydown: (e) => { if (e.key === "Enter") openEditor(r.id); } },
        el("span", { class: `stripe ${currentLevel(r)}` }),
        el("div", { class: "att-main" },
          el("span", { class: "att-title" }, el("span", { class: "id" }, r.id), "  ", r.title),
          el("span", { class: "att-why" }, reasons.flatMap(([text, strong], i) =>
            [i ? " · " : "", strong ? el("b", {}, text) : text]), ` · ${r.owner || "Unassigned"}`)),
        el("div", { class: "att-rpn" }, el("span", { class: "mono" }, currentRpn(r)), badge(currentLevel(r))))))
    : [el("li", { class: "empty-note" }, "Nothing needs attention. Every open risk is controlled and on schedule.")]));

  renderActivity();
}

const ICONS = {
  created: "M9 3h2v6h6v2h-6v6H9v-6H3V9h6z",
  updated: "M13.6 3.3 16.7 6.4 7.1 16H4v-3.1zM12.2 6.1 6 12.3V14h1.7l6.2-6.2z",
  closed: "m8 13.2-3.6-3.6L3 11l5 5 9-9-1.4-1.4z",
  status: "M3 9h10.2l-3.6-3.6L11 4l6 6-6 6-1.4-1.4 3.6-3.6H3z",
};

function renderActivity() {
  const entries = [];
  for (const r of state.risks) {
    const history = r.history?.length ? r.history : [{ at: r.createdAt, kind: "created", text: "Created" }];
    for (const h of history) if (h.at) entries.push({ ...h, id: r.id, title: r.title });
  }
  entries.sort((a, b) => b.at.localeCompare(a.at));
  $("#activity").replaceChildren(...(entries.length ? entries.slice(0, 7).map((h) => el("li", { class: "act" },
    el("span", { class: `act-icon ${h.kind}` },
      svgEl("svg", { viewBox: "0 0 20 20", "aria-hidden": "true" }, svgEl("path", { d: ICONS[h.kind] || ICONS.updated }))),
    el("div", { class: "act-text" },
      el("a", { onclick: () => openEditor(h.id) }, h.id), " ", h.text,
      el("div", { class: "act-when" }, relativeTime(h.at)))))
    : [el("li", { class: "empty-note" }, "No activity yet.")]));
}

// ---------- register ----------

function renderRegister(risks) {
  const scoped = state.cell ? risks.filter((r) => matchesCell(r, state.cell)) : risks;
  const rows = sortRisks(filterRisks(scoped, state.filters), state.sort.key, state.sort.direction);
  $("#cell-chip").hidden = !state.cell;
  if (state.cell) {
    const { severity, occurrence, residual } = state.cell;
    $("#cell-chip-text").textContent = `${residual ? "Residual" : "Initial"} S${severity} × O${occurrence}`;
  }
  $("#register tbody").replaceChildren(...rows.map((r) => el("tr", { class: `lv-${r.level}`, onclick: () => openEditor(r.id) },
    el("td", { class: "id" }, r.id),
    el("td", { class: "risk" }, el("div", { class: "risk-title" }, r.title), el("div", { class: "risk-cat" }, r.category || "Uncategorised")),
    el("td", { class: "num" }, r.severity),
    el("td", { class: "num" }, r.occurrence),
    el("td", { class: "num" }, r.detection),
    el("td", {}, el("div", { class: "rpn-cell" }, el("span", {}, r.rpn),
      el("div", { class: "rpn-bar" }, el("i", { class: r.level, style: `width:${Math.round((r.rpn / 125) * 100)}%` })))),
    el("td", {}, badge(r.level)),
    el("td", { class: "residual" }, r.residualRpn === null
      ? el("span", { class: "none" }, "Not assessed")
      : [`${r.rpn} → `, el("b", {}, r.residualRpn)]),
    el("td", {}, r.owner || "—"),
    el("td", {}, statusTag(r.status)),
    el("td", { class: `date${r.overdue ? " overdue" : ""}` }, formatDate(r.reviewDate),
      r.overdue ? el("span", { class: "overdue-tag" }, "Overdue") : null))));
  $("#register-empty").hidden = rows.length > 0;
  const sortName = $(`#register th[data-sort="${state.sort.key}"]`)?.textContent || state.sort.key;
  $("#register-foot").textContent = `Showing ${rows.length} of ${plural(risks.length, "risk")} · sorted by ${sortName} (${state.sort.direction === "asc" ? "ascending" : "descending"})`;

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
    cells.push(el("div", { class: "m-label" }, el("b", {}, s), el("span", {}, SEVERITY_LABELS[s])));
    for (let o = 1; o <= 5; o++) {
      const count = grid[s - 1][o - 1];
      const level = riskLevel(s, o);
      const ids = risks.filter((r) => matchesCell(r, { severity: s, occurrence: o, residual })).map((r) => r.id);
      cells.push(el("button", {
        class: `cell ${level}${count ? " filled" : ""}`,
        "aria-label": `Severity ${s} ${SEVERITY_LABELS[s]}, occurrence ${o} ${OCCURRENCE_LABELS[o]}: ${level}, ${plural(count, "risk")}`,
        title: `${level} · S${s} × O${o} = ${s * o}`,
        onclick: () => drillDown(s, o, residual),
      },
      el("span", { class: "score" }, s * o),
      count ? el("span", { class: "count" }, count) : null,
      count ? el("span", { class: "ids" }, ids.slice(0, 3).join(" "), ids.length > 3 ? ` +${ids.length - 3}` : "") : null));
    }
  }
  cells.push(el("div"));
  for (let o = 1; o <= 5; o++) {
    cells.push(el("div", { class: "m-label col" }, el("b", {}, o), el("span", {}, OCCURRENCE_LABELS[o])));
  }
  $("#matrix").replaceChildren(...cells);

  const plotted = risks.filter((r) => (residual ? r.residualLevel : r.level));
  $("#legend-title").textContent = residual ? "Residual risk" : "Initial risk";
  $("#legend-sub").textContent = residual
    ? `${plural(plotted.length, "risk")} with a residual assessment, scored after controls.`
    : `${plural(plotted.length, "risk")}, scored before controls. Level = severity × occurrence.`;
  $("#legend").replaceChildren(...LEVELS.slice().reverse().map((l) => el("div", { class: "legend-item" },
    el("span", { class: "swatch", style: `background:var(--${l.toLowerCase()})` }),
    el("div", {}, el("strong", {}, l), el("div", { class: "hint" }, LEVEL_GUIDANCE[l])),
    el("span", { class: "n" }, plotted.filter((r) => (residual ? r.residualLevel : r.level) === l).length))));
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
  if (state.view !== "analysis") return;
  const a = state.analysis;
  const risks = all.filter((r) =>
    (a.scope === "all" || r.status !== "Closed") && (!a.category || r.category === a.category));
  $("#a-count").textContent = `${plural(risks.length, "risk")} in view`;

  const assessed = risks.filter((r) => r.residualRpn !== null);
  const reduced = assessed.reduce((s, r) => s + (r.rpn - r.residualRpn), 0);
  const before = assessed.reduce((s, r) => s + r.rpn, 0);
  const pareto = rpnConcentration(risks);
  $("#effect-sub").textContent = risks.length
    ? `${assessed.length} of ${plural(risks.length, "risk")} have a residual assessment` +
      (before ? `, with controls cutting their RPN by ${Math.round((reduced / before) * 100)}%. ` : ". ") +
      (pareto.open ? `${pareto.count} of ${pareto.open} open risks make up 80% of open RPN.` : "")
    : "No risks match the current selection.";
  $("#chart-effect").innerHTML = risks.length ? controlEffectChart(risks, chartWidth("#chart-effect")) : "";
  $("#table-effect").replaceChildren(table(
    ["ID", "Title", "Initial RPN", "Level", "Residual RPN", "Residual level", "Reduction"],
    sortRisks(risks, "rpn").map((r) => [r.id, r.title, r.rpn, r.level, r.residualRpn, r.residualLevel,
      r.residualRpn === null ? null : r.rpn - r.residualRpn])));

  const groupLabel = { category: "Category", owner: "Owner", status: "Status" }[a.group];
  const profile = levelBreakdown(risks, a.group);
  $("#profile-legend").replaceChildren(...LEVELS.slice().reverse().map((l) =>
    el("span", {}, el("span", { class: "swatch", style: `background:var(--${l.toLowerCase()})` }), l)));
  $("#chart-profile").innerHTML = profile.length ? levelProfileChart(profile, chartWidth("#chart-profile")) : "";
  $("#table-profile").replaceChildren(table([groupLabel, ...LEVELS.slice().reverse(), "Total"],
    profile.map((r) => [r.group, ...LEVELS.slice().reverse().map((l) => r[l]), r.total])));

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
  for (const scope of [$("#view-analysis"), $("#spectrum")]) {
    scope.addEventListener("pointermove", (e) => {
      const target = e.target.closest("[data-tip]");
      if (!target) { tip.hidden = true; return; }
      const [head, ...rest] = target.dataset.tip.split("\n");
      tip.replaceChildren(el("strong", {}, head), rest.join("\n"));
      tip.hidden = false;
      place(e);
    });
    scope.addEventListener("pointerleave", () => { tip.hidden = true; });
  }
  $("#view-analysis").addEventListener("click", (e) => {
    const target = e.target.closest("[data-id]");
    if (target) { tip.hidden = true; openEditor(target.dataset.id); }
  });
}

// ---------- editor ----------

function ratingGroup(name, label, help, labels, optional) {
  const scale = el("div", { class: `scale${optional ? " optional" : ""}`, role: "radiogroup", "aria-label": label });
  const options = optional ? [["", "—", "Not set"], ...Object.entries(labels).map(([v, l]) => [v, v, l])]
    : Object.entries(labels).map(([v, l]) => [v, v, l]);
  for (const [value, short, text] of options) {
    const id = `r-${name}-${value || "none"}`;
    scale.append(
      el("input", { type: "radio", name, id, value }),
      el("label", { for: id, title: text }, el("b", {}, short), el("span", {}, text)));
  }
  return el("div", { class: "rating" },
    el("div", { class: "rating-name" }, label, el("small", {}, help)), scale);
}

function setupEditor() {
  const form = $("#risk-form");
  for (const container of $$(".ratings", form)) {
    const residual = container.dataset.prefix === "residual";
    for (const [key, label, help, labels] of SCALES) {
      const name = residual ? `residual${key[0].toUpperCase()}${key.slice(1)}` : key;
      container.append(ratingGroup(name, label, help, labels, residual));
    }
  }
  fillSelect(form.elements.category, CATEGORIES);
  fillSelect(form.elements.status, STATUSES);

  form.addEventListener("input", updateLiveScores);
  form.addEventListener("change", updateLiveScores);
  form.addEventListener("submit", (e) => { e.preventDefault(); saveFromForm(); });
  $$("[data-close]", form).forEach((b) => b.addEventListener("click", () => $("#editor").close()));
  $("#delete-risk").addEventListener("click", deleteCurrent);
}

const FORM_FIELDS = ["title", "category", "owner", "hazard", "cause", "effect", ...NUMERIC, "controls", "status", "reviewDate"];

function readForm() {
  const form = $("#risk-form");
  const data = {};
  for (const name of FORM_FIELDS) {
    const raw = form.elements.namedItem(name)?.value ?? "";
    data[name] = NUMERIC.includes(name) ? (raw === "" ? null : Number(raw)) : raw.trim();
  }
  return data;
}

function scorePill(target, s, o, d, compareTo) {
  const value = rpn(s, o, d);
  if (value === null) { target.replaceChildren(); return; }
  const level = riskLevel(s, o);
  target.replaceChildren("RPN ", el("b", {}, value),
    compareTo ? ` (${value <= compareTo ? "−" : "+"}${Math.abs(compareTo - value)})` : "", " ", badge(level));
}

function updateLiveScores() {
  const d = readForm();
  const initial = rpn(d.severity, d.occurrence, d.detection);
  scorePill($("#initial-score"), d.severity, d.occurrence, d.detection);
  scorePill($("#residual-score"), d.residualSeverity, d.residualOccurrence, d.residualDetection, initial);
}

function openEditor(id = null) {
  const form = $("#risk-form");
  const risk = id ? state.risks.find((r) => r.id === id) : null;
  state.editingId = risk ? risk.id : null;
  form.reset();
  $("#form-errors").hidden = true;
  $("#editor-eyebrow").textContent = risk ? `${risk.id} · ${risk.category || "Uncategorised"}` : "New record";
  $("#editor-title").textContent = risk ? risk.title : "New risk";
  $("#delete-risk").hidden = !risk;

  const values = risk || { severity: 3, occurrence: 3, detection: 3, status: "Open", category: CATEGORIES[0] };
  for (const name of FORM_FIELDS) {
    const field = form.elements.namedItem(name);
    if (!field) continue;
    const v = values[name];
    field.value = v === null || v === undefined ? "" : String(v);
  }

  const history = risk?.history?.length ? risk.history : risk?.createdAt ? [{ at: risk.createdAt, text: "Created" }] : [];
  $("#history-section").hidden = !history.length;
  $("#history").replaceChildren(...history.slice().reverse().map((h) =>
    el("li", {}, el("time", { datetime: h.at }, formatDate(h.at)), el("span", {}, h.text))));

  updateLiveScores();
  $("#editor").showModal();
  $(".form-body", form).scrollTop = 0;
  if (!risk) form.elements.title.focus();
}

function saveFromForm() {
  const data = readForm();
  const errors = validateRisk(data);
  const box = $("#form-errors");
  if (errors.length) {
    box.replaceChildren(el("ul", {}, errors.map((e) => el("li", {}, e))));
    box.hidden = false;
    box.scrollIntoView({ block: "nearest", behavior: "smooth" });
    return;
  }
  const now = new Date().toISOString();
  if (state.editingId) {
    const i = state.risks.findIndex((r) => r.id === state.editingId);
    const before = state.risks[i];
    const change = describeChanges(before, data);
    if (!change) { $("#editor").close(); toast("No changes to save."); return; }
    const history = [...(before.history?.length ? before.history : [{ at: before.createdAt || now, kind: "created", text: "Created" }]),
      { at: now, ...change }];
    state.risks[i] = { ...before, ...data, updatedAt: now, history };
    toast(`${state.editingId} saved.`);
  } else {
    const id = nextId(state.risks);
    state.risks.push({ id, ...data, createdAt: now, updatedAt: now,
      history: [{ at: now, kind: "created", text: `Created at RPN ${rpn(data.severity, data.occurrence, data.detection)}` }] });
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
  const ok = await choose(`Delete ${id}?`, "The risk and its history are removed from the register. This cannot be undone.", [
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
  if (download.href.startsWith("blob:")) URL.revokeObjectURL(download.href);
  download.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  download.download = `quality-risks-${toIsoDate(new Date())}.csv`;
  $("#export-count").textContent = plural(state.risks.length, "record");
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
      `Import ${plural(valid.length, "risk")}`,
      (rejected.length ? `${plural(rejected.length, "row")} rejected. First problem: ${rejected[0]}\n\n` : "") +
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
      const entry = { at: now, kind: "updated", text: "Imported from CSV" };
      if (existing >= 0) {
        const prev = state.risks[existing];
        state.risks[existing] = { ...prev, ...r, updatedAt: now, history: [...(prev.history || []), entry] };
      } else {
        state.risks.push({ ...r, id: r.id || nextId(state.risks), createdAt: r.createdAt || now, updatedAt: now,
          history: [{ ...entry, kind: "created" }] });
      }
    }
    saveRisks();
    render();
    toast(`Imported ${plural(valid.length, "risk")}.${rejected.length ? ` ${rejected.length} rejected.` : ""}`);
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

function renderChrome() {
  $("#nav-count").textContent = state.risks.length;
  $("#doc-records").textContent = plural(state.risks.length, "risk");
  const last = state.risks.map((r) => r.updatedAt || r.createdAt || "").sort().pop();
  $("#doc-updated").textContent = last ? formatDate(last) : "—";
}

function render() {
  const risks = evaluated();
  renderChrome();
  renderDashboard(risks);
  renderRegister(risks);
  renderMatrix(risks);
  renderAnalysis(risks);
}

function isTyping(e) {
  const t = e.target;
  return t instanceof HTMLElement && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName));
}

function init() {
  setupTheme();
  fillSelect($("#f-level"), LEVELS);
  fillSelect($("#f-status"), STATUSES);
  fillSelect($("#f-category"), CATEGORIES);
  fillSelect($("#a-category"), CATEGORIES);
  setupEditor();
  setupTooltips();

  $$("[data-view]").forEach((t) => t.addEventListener("click", () => {
    showView(t.dataset.view);
    if (t.dataset.view === "dashboard" && state.openForSpectrum) renderSpectrum(state.openForSpectrum);
  }));
  $("#add-risk").addEventListener("click", () => openEditor());

  for (const [id, key] of [["#f-query", "query"], ["#f-level", "level"], ["#f-status", "status"], ["#f-category", "category"]]) {
    $(id).addEventListener("input", (e) => { state.filters[key] = e.target.value; renderRegister(evaluated()); });
  }
  $$("#register th[data-sort]").forEach((th) => th.addEventListener("click", () => {
    const key = th.dataset.sort;
    state.sort = state.sort.key === key
      ? { key, direction: state.sort.direction === "asc" ? "desc" : "asc" }
      : { key, direction: ["rpn", "residualRpn", "severity", "occurrence", "detection"].includes(key) ? "desc" : "asc" };
    renderRegister(evaluated());
  }));
  $("#cell-chip").addEventListener("click", () => { state.cell = null; renderRegister(evaluated()); });
  $$(".seg").forEach((b) => b.addEventListener("click", () => {
    state.matrixMode = b.dataset.matrix;
    $$(".seg").forEach((x) => x.classList.toggle("active", x === b));
    renderMatrix(evaluated());
  }));

  for (const [id, key] of [["#a-scope", "scope"], ["#a-category", "category"], ["#a-group", "group"]]) {
    $(id).addEventListener("input", (e) => { state.analysis[key] = e.target.value; renderAnalysis(evaluated()); });
  }
  $$("[data-table-toggle]").forEach((b) => b.addEventListener("click", () => {
    const t = state.analysis.tables;
    const name = b.dataset.tableToggle;
    if (t.has(name)) t.delete(name); else t.add(name);
    renderAnalysis(evaluated());
  }));
  let lastWidth = 0;
  new ResizeObserver(([entry]) => {
    const w = Math.round(entry.contentRect.width);
    if (w !== lastWidth) {
      lastWidth = w;
      if (state.openForSpectrum) renderSpectrum(state.openForSpectrum);
      renderAnalysis(evaluated());
    }
  }).observe($("main"));

  $("#export-csv").addEventListener("click", exportCsv);
  $("#export-copy").addEventListener("click", copyExport);
  $$("#export-dialog [data-close]").forEach((b) => b.addEventListener("click", () => $("#export-dialog").close()));
  $("#import-csv").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) importCsv(file);
    e.target.value = "";
  });

  document.addEventListener("keydown", (e) => {
    if (isTyping(e) || e.metaKey || e.ctrlKey || e.altKey || document.querySelector("dialog[open]")) return;
    if (e.key === "n" || e.key === "N") { e.preventDefault(); openEditor(); }
    if (e.key === "/") { e.preventDefault(); showView("register"); $("#f-query").focus(); }
  });

  render();
}

init();
