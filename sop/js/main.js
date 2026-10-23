// SOP Library app: routing, views, command palette, digital records and printing.
import {
  TYPE_META, TYPES, LANGS, STATUS_META, fold, tokens, attachmentKey, displayCode,
  indexLibrary, filterSops, filterAttachments, quickFind, sortSops, stats, reviewTimeline,
  graphData, layoutGraph, recordColumns, validateRecord, recordsToCsv, libraryToCsv, formatDate,
} from "./model.js";
import * as store from "./store.js";
import { DEMO_LIBRARY } from "./demo-data.js";

// ---------- DOM helpers ----------

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") node.className = v;
    else if (k === "dataset") Object.assign(node.dataset, v);
    else if (k === "style" && typeof v === "object") {
      for (const [sk, sv] of Object.entries(v)) {
        if (sk.startsWith("--")) node.style.setProperty(sk, sv);
        else node.style[sk] = sv;
      }
    }
    else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else if (k === "value") node.value = v;
    else if (k === "checked") node.checked = !!v;
    else if (v !== undefined && v !== null && v !== false) node.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c !== null && c !== undefined && c !== false) node.append(c instanceof Node ? c : String(c));
  }
  return node;
}

/** replaceChildren that skips null/false children (the native one prints "null"). */
function put(node, ...children) {
  node.replaceChildren(...children.flat(Infinity).filter((c) => c !== null && c !== undefined && c !== false));
  return node;
}

const SVG_NS = "http://www.w3.org/2000/svg";
function svgEl(tag, attrs = {}, ...children) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null) node.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c !== null && c !== undefined) node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

const ICON_PATHS = {
  overview: "M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z",
  library: "M4 5a2 2 0 0 1 2-2h4v18H6a2 2 0 0 1-2-2zM10 3h4v18h-4zM15 4.2l3.8-1 3.1 17-3.8 1z",
  records: "M9 4h6a1 1 0 0 1 1 1v1H8V5a1 1 0 0 1 1-1zM8 5H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M8 12h8M8 16h5",
  map: "M6 6m-2.5 0a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0M18 7m-2.5 0a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0M12 18m-2.5 0a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0M8.3 7.2l7.3-.2M7.3 8.2l3.5 7.6M16.8 9.3l-3.6 6.5",
  data: "M12 3c4.4 0 8 1.3 8 3s-3.6 3-8 3-8-1.3-8-3 3.6-3 8-3zM4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6",
  search: "M11 11m-7 0a7 7 0 1 0 14 0a7 7 0 1 0-14 0M20 20l-3.5-3.5",
  upload: "M12 15V3M7 8l5-5 5 5M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4",
  download: "M12 3v12M7 10l5 5 5-5M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4",
  print: "M7 9V3h10v6M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2M7 14h10v7H7z",
  external: "M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5",
  sun: "M12 12m-4 0a4 4 0 1 0 8 0a4 4 0 1 0-8 0M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
  moon: "M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z",
  auto: "M12 3a9 9 0 1 0 0 18zM12 3a9 9 0 0 1 0 18",
  plus: "M12 5v14M5 12h14",
  x: "M6 6l12 12M18 6L6 18",
  alert: "M12 3l9.5 17h-19zM12 10v4M12 17.5v.01",
  clock: "M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0-18 0M12 7v5l3 2",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  copy: "M9 9h11v11H9zM5 15H4V4h11v1",
  check: "M5 12l5 5 9-10",
  file: "M6 3h8l5 5v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM14 3v5h5",
  form: "M9 4h6a1 1 0 0 1 1 1v1H8V5a1 1 0 0 1 1-1zM8 5H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M8 11h2M12 11h4M8 15h2M12 15h4",
  template: "M4 4h16v16H4zM4 9h16M9 9v11",
  logbook: "M6 3h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM8 3v18M11 8h5M11 12h5",
  annex: "M15.5 7.5l-6.4 6.4a1.8 1.8 0 0 0 2.5 2.5l6.7-6.7a3.5 3.5 0 0 0-5-5L6.6 11.4a5.3 5.3 0 0 0 7.5 7.5L20 13",
  zoomIn: "M11 11m-7 0a7 7 0 1 0 14 0a7 7 0 1 0-14 0M20 20l-3.5-3.5M11 8v6M8 11h6",
  zoomOut: "M11 11m-7 0a7 7 0 1 0 14 0a7 7 0 1 0-14 0M20 20l-3.5-3.5M8 11h6",
  reset: "M4 12a8 8 0 1 0 2.3-5.7M4 4v4h4",
  grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  rows: "M4 6h16M4 12h16M4 18h16",
  trash: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
  arrow: "M5 12h14M13 6l6 6-6 6",
  back: "M15 18l-6-6 6-6",
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z",
  layers: "M12 3l9 5-9 5-9-5zM3 13l9 5 9-5",
  history: "M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2",
  book: "M4 5a2 2 0 0 1 2-2h13v15H6a2 2 0 0 0-2 2zM4 20a2 2 0 0 0 2 2h13v-4",
  user: "M12 8m-4 0a4 4 0 1 0 8 0a4 4 0 1 0-8 0M4 21a8 8 0 0 1 16 0",
  ban: "M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0-18 0M5.6 5.6l12.8 12.8",
};

function icon(name) {
  return svgEl("svg", { viewBox: "0 0 24 24", "aria-hidden": "true" }, svgEl("path", { d: ICON_PATHS[name] || ICON_PATHS.file }));
}

const btn = (label, onclick, opts = {}) => el("button", {
  class: `btn ${opts.cls || ""}`.trim(), type: "button", onclick, title: opts.title, "aria-label": opts.aria,
}, opts.icon ? icon(opts.icon) : null, label);

const DEPT_HUES = { QA: "var(--qa)", QC: "var(--qc)", VL: "var(--vl)" };
const deptClass = (d) => (DEPT_HUES[d] ? `dept-${d}` : "dept-other");
const deptColor = (d) => DEPT_HUES[d] || "var(--other)";
const TYPE_COLORS = { form: "var(--t-form)", template: "var(--t-template)", logbook: "var(--t-logbook)", annex: "var(--t-annex)" };
const REVIEW_META = {
  overdue: { label: "Review overdue", short: "Overdue" },
  due: { label: "Review due ≤ 90 days", short: "Due soon" },
  ok: { label: "In date", short: "In date" },
  pending: { label: "Revision pending", short: "Pending" },
  unknown: { label: "No review date", short: "No date" },
};

const deptBadge = (d) => el("span", { class: `badge dept ${deptClass(d)}` }, d || "—");
const typeBadge = (t) => el("span", { class: `badge type type-${t}` }, TYPE_META[t]?.label || t);
const typeIcon = (t) => el("span", { class: `type-icon type-${t}` }, icon(t));
const typeWord = (t, n) => (n === 1 ? TYPE_META[t].label : TYPE_META[t].plural).toLowerCase();
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Text with the query terms marked; matching ignores accents and case. */
function highlight(text, q) {
  const src = String(text ?? "");
  if (!q?.length || !src) return src;
  let folded = "";
  const map = [];
  for (let i = 0; i < src.length; i += 1) {
    const f = fold(src[i]);
    for (let j = 0; j < f.length; j += 1) map.push(i);
    folded += f;
  }
  const ranges = [];
  for (const t of q) {
    let from = 0;
    while (t && (from = folded.indexOf(t, from)) >= 0) {
      ranges.push([map[from], map[from + t.length - 1] + 1]);
      from += t.length;
    }
  }
  if (!ranges.length) return src;
  ranges.sort((a, b) => a[0] - b[0]);
  const frag = document.createDocumentFragment();
  let pos = 0;
  for (const [a, b] of ranges) {
    if (a < pos) continue;
    frag.append(src.slice(pos, a), el("mark", {}, src.slice(a, b)));
    pos = b;
  }
  frag.append(src.slice(pos));
  return frag;
}

function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove("show"), 2600);
}

function download(name, content, type = "text/csv;charset=utf-8") {
  const blob = new Blob([type.startsWith("text/csv") ? "﻿" : "", content], { type });
  const a = el("a", { href: URL.createObjectURL(blob), download: name });
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

const safeName = (s) => String(s).replace(/[^\w.-]+/g, "_").replace(/_+/g, "_");
const todayIso = () => new Date().toISOString().slice(0, 10);

// ---------- state ----------

const state = {
  lib: null,
  origin: "demo",            // demo | imported | hosted
  records: new Map(),        // attKey → records[]
  route: { view: "overview", parts: [] },
  library: { query: "", dept: "", lang: "", site: "", status: "current", review: "", has: "", sort: "code", dir: "asc", view: store.pref("libView", "cards"), fullText: true, month: "" },
  hub: { type: "", query: "", dept: "", site: "", withFields: false, limit: 60 },
  sopTab: "overview",
  map: { dept: "", site: "", connectedOnly: true, query: "", selected: null, zoom: 1, panX: 0, panY: 0 },
  user: store.pref("user", ""),
};

const recordKey = (att) => `${att.site}:${att.key}`;
const recordsOf = (att) => state.records.get(recordKey(att)) || [];

async function loadRecords() {
  state.records = new Map();
  for (const r of await store.allRecords()) {
    if (!state.records.has(r.attKey)) state.records.set(r.attKey, []);
    state.records.get(r.attKey).push(r);
  }
}

function setLibrary(raw, origin) {
  state.lib = indexLibrary(raw);
  state.origin = origin;
  state.map.selected = null;
  graphCache = null;
}

// ---------- routing ----------

const NAV = [
  { view: "overview", label: "Overview", icon: "overview" },
  { view: "library", label: "Library", icon: "library", count: () => state.lib.sops.filter((s) => s.status === "current").length },
  { view: "records", label: "Forms & Records", icon: "records", count: () => state.lib.attachments.length },
  { view: "map", label: "Relationship Map", icon: "map" },
  { view: "data", label: "Library Data", icon: "data" },
];

function go(hash) {
  if (location.hash === hash) route();
  else location.hash = hash;
}

function parseHash() {
  const raw = decodeURIComponent(location.hash.replace(/^#\/?/, ""));
  const [view, ...parts] = raw.split("/");
  return { view: view || "overview", parts };
}

function route() {
  if (!state.lib) return;
  const r = parseHash();
  const views = { overview: renderOverview, library: renderLibrary, sop: renderSop, records: renderRecords, att: renderAtt, map: renderMap, data: renderData };
  if (!views[r.view]) { go("#/overview"); return; }
  const changed = r.view !== state.route.view || r.parts.join("/") !== state.route.parts.join("/");
  state.route = r;
  document.querySelectorAll(".view").forEach((v) => v.classList.toggle("active", v.id === `view-${r.view}`));
  renderNav();
  views[r.view]();
  if (changed) window.scrollTo({ top: 0 });
}

function setTitle(eyebrow, title) {
  document.getElementById("page-eyebrow").textContent = eyebrow;
  document.getElementById("page-title").textContent = title;
  document.title = title === "SOP Library" ? title : `${title} · SOP Library`;
}

function mount(id, ...children) {
  const v = document.getElementById(`view-${id}`);
  put(v, ...children.flat());
  return v;
}

// ---------- rail ----------

function renderNav() {
  const active = { sop: "library", att: "records" }[state.route.view] || state.route.view;
  put(document.getElementById("nav"), ...NAV.map((n) => {
    const c = n.count?.();
    return el("a", { class: `nav-item${active === n.view ? " active" : ""}`, href: `#/${n.view}`, "aria-current": active === n.view ? "page" : null },
      icon(n.icon), n.label, c ? el("span", { class: "nav-count" }, c) : null);
  }));
}

function renderRail() {
  const st = stats(state.lib);
  const max = Math.max(1, ...Object.values(st.byDept));
  const depts = Object.entries(st.byDept).sort((a, b) => b[1] - a[1]);
  put(document.getElementById("rail-depts"), ...depts.map(([d, n]) => el("button", {
    class: "rail-dept", type: "button", title: state.lib.meta.departments[d] || d,
    onclick: () => { Object.assign(state.library, { dept: d, query: "", month: "" }); go("#/library"); },
  }, el("span", {}, d), el("span", { class: "bar" }, el("i", { style: { width: `${(n / max) * 100}%`, background: deptColor(d) } })), el("b", {}, n))));

  const m = state.lib.meta;
  const card = document.getElementById("source-card");
  put(card, 
    el("span", { class: "label" }, "Library source"),
    m.demo ? el("span", { class: "demo-flag" }, icon("alert"), "Demo data") : null,
    el("span", { class: "source-name" }, m.source?.name || "Imported library"),
    el("span", { class: "source-meta" }, `${st.total} files · ${m.generatedAt ? formatDate(m.generatedAt) : "—"}`),
  );
  card.onclick = () => go("#/data");
  card.style.cursor = "pointer";
}

// ---------- theme ----------

const THEMES = ["system", "light", "dark"];
function applyTheme(t) {
  if (t === "system") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", t);
  const b = document.getElementById("theme-btn");
  put(b, icon({ system: "auto", light: "sun", dark: "moon" }[t]), `Theme: ${t[0].toUpperCase()}${t.slice(1)}`);
}
function cycleTheme() {
  const next = THEMES[(THEMES.indexOf(store.pref("theme", "system")) + 1) % THEMES.length];
  store.setPref("theme", next);
  applyTheme(next);
  if (state.route.view === "map") renderMap();
}

// ---------- overview ----------

function demoBanner() {
  if (!state.lib.meta.demo) return null;
  return el("div", { class: "demo-banner" }, icon("alert"),
    el("p", {}, el("b", {}, "You are looking at fictional demo data. "),
      "Import your SOP library file (sop-library.json) to see your own SOPs and their forms, templates and logbooks. The file stays on this device."),
    btn("Import library", () => pickFile(), { cls: "primary", icon: "upload" }));
}

function renderOverview() {
  setTitle(state.lib.meta.demo ? "Demo library" : state.lib.meta.source?.name || "Library", "Overview");
  const lib = state.lib;
  const st = stats(lib);
  const T = (t) => st.byType[t] || 0;
  const kpi = (v, k, color, onclick) => el("button", { class: "kpi", type: "button", onclick },
    el("i", { class: "kd", style: { background: color } }), el("span", { class: "v" }, v), el("span", { class: "k" }, k));
  const deptTotal = Object.values(st.byDept).reduce((a, b) => a + b, 0) || 1;
  const depts = Object.entries(st.byDept).sort((a, b) => b[1] - a[1]);

  const hero = el("div", { class: "hero" },
    el("div", { class: "hero-top" },
      el("div", { class: "hero-title" },
        el("span", { class: "eyebrow" }, lib.meta.source?.name || "SOP library"),
        el("h2", {}, "Every SOP, linked to the forms, templates and logbooks it controls"),
        el("p", {}, `${st.current} current SOPs across ${depts.length} departments, with ${st.attachments} controlled attachments and ${st.links} cross references between procedures.`)),
      el("div", { class: "hero-actions" },
        btn("Browse library", () => go("#/library"), { cls: "primary", icon: "library" }),
        btn("Forms & logbooks", () => go("#/records"), { icon: "records" }),
        btn("Map", () => go("#/map"), { icon: "map" }))),
    el("div", { class: "kpis" },
      kpi(st.current, "Current SOPs", "linear-gradient(90deg,var(--qa),var(--qc))", () => { resetLibraryFilters(); go("#/library"); }),
      kpi(T("form"), "Forms", TYPE_COLORS.form, () => openHub("form")),
      kpi(T("template"), "Templates", TYPE_COLORS.template, () => openHub("template")),
      kpi(T("logbook"), "Logbooks", TYPE_COLORS.logbook, () => openHub("logbook")),
      kpi(T("annex"), "Annexes", TYPE_COLORS.annex, () => openHub("annex")),
      kpi(st.overdue + st.dueSoon, "Reviews overdue or due", "var(--overdue)", () => { resetLibraryFilters(); state.library.sort = "review"; go("#/library"); })),
    el("div", { class: "dept-strip" }, depts.map(([d, n]) => el("i", { style: { width: `${(n / deptTotal) * 100}%`, background: deptColor(d) }, title: `${d}: ${n}` }))),
    el("div", { class: "dept-legend" }, depts.map(([d, n]) => el("span", {}, el("i", { class: "dot", style: { color: deptColor(d) } }),
      lib.meta.departments[d] || d, el("b", {}, n)))));

  // Attachments by department × type
  const matrixRows = depts.map(([d]) => {
    const atts = lib.attachments.filter((a) => a.dept === d && a.status === "current");
    const total = atts.length;
    return el("div", { class: "mrow" },
      el("span", { class: "name" }, deptBadge(d), el("span", { class: "muted", style: { fontSize: "12.5px" } }, plural(st.byDept[d], "SOP"))),
      el("div", { class: "stack" }, TYPES.map((t) => {
        const n = atts.filter((a) => a.type === t).length;
        if (!n) return null;
        return el("i", { style: { width: `${(n / Math.max(total, 1)) * 100}%`, background: TYPE_COLORS[t] }, title: `${d} ${TYPE_META[t].plural}: ${n}`,
          onclick: () => openHub(t, d) }, el("span", {}, n));
      })),
      el("span", { class: "total" }, total));
  });
  const matrix = el("div", { class: "panel span-7" },
    el("div", { class: "panel-head" }, el("h2", {}, "Controlled attachments by department"), el("span", { class: "hint" }, "Click a segment to open the list")),
    el("div", { class: "matrix" }, matrixRows),
    el("div", { class: "legend" }, TYPES.map((t) => el("span", {}, el("i", { style: { background: TYPE_COLORS[t] } }), TYPE_META[t].plural))));

  // Attention list
  const attention = [
    { n: st.overdue, t: "Reviews overdue", s: "Review date has passed", ic: "alert", cls: "state-overdue", go: () => { resetLibraryFilters(); state.library.review = "overdue"; go("#/library"); } },
    { n: st.dueSoon, t: "Reviews due in 90 days", s: "Plan the periodic review", ic: "clock", cls: "state-due", go: () => { resetLibraryFilters(); state.library.review = "due"; go("#/library"); } },
    { n: st.pending, t: "Revisions pending", s: "History shows a version not yet effective", ic: "history", cls: "state-pending", go: () => { resetLibraryFilters(); state.library.review = "pending"; go("#/library"); } },
    { n: st.duplicates, t: "Duplicate files", s: "Same SOP and version stored twice", ic: "copy", cls: "state-unknown", go: () => { resetLibraryFilters(); state.library.status = "duplicate"; go("#/library"); } },
    { n: st.missingRefs, t: "Referenced SOPs not in library", s: "Cross references that cannot be opened", ic: "link", cls: "state-unknown", go: () => go("#/data") },
  ].filter((a) => a.n);
  const attentionPanel = el("div", { class: "panel span-5" },
    el("div", { class: "panel-head" }, el("h2", {}, "Needs attention")),
    attention.length ? el("div", { class: "attention" }, attention.map((a) => el("button", { class: "att-row", type: "button", onclick: a.go },
      el("span", { class: `ic ${a.cls}` }, icon(a.ic)), el("span", {}, el("div", { class: "t" }, a.t), el("div", { class: "s" }, a.s)),
      el("span", { class: `n ${a.cls}` }, a.n))))
      : el("p", { class: "hint" }, "Nothing needs attention. All dated SOPs are in date."));

  // Review calendar
  const timeline = reviewTimeline(lib, new Date(), 18);
  const calendar = el("div", { class: "panel span-8" },
    el("div", { class: "panel-head" }, el("h2", {}, "Periodic review calendar"),
      el("span", { class: "hint" }, `${lib.sops.filter((s) => s.status === "current" && s.reviewDate).length} SOPs with a review date · next 18 months`)),
    timelineChart(timeline));

  const rankPanel = (title, rows, hint) => el("div", { class: "panel span-4" },
    el("div", { class: "panel-head" }, el("h2", {}, title), hint ? el("span", { class: "hint" }, hint) : null),
    rows.length ? el("div", { class: "rank" }, rows) : el("p", { class: "hint" }, "No data yet."));
  const maxRef = Math.max(1, ...st.mostReferenced.map((s) => s.backlinks.length));
  const referenced = rankPanel("Most referenced SOPs", st.mostReferenced.map((s) => el("button", { class: `rank-row ${deptClass(s.dept)}`, type: "button", onclick: () => go(`#/sop/${s.id}`) },
    el("span", { class: "title" }, el("span", { class: "code" }, s.code), " ", s.title),
    el("span", { class: "meter" }, el("i", { style: { width: `${(s.backlinks.length / maxRef) * 60}px` } }), s.backlinks.length))), "Cited by other SOPs");

  const maxAtt = Math.max(1, ...st.richest.map((r) => r.n));
  const richest = el("div", { class: "panel span-6" },
    el("div", { class: "panel-head" }, el("h2", {}, "SOPs with the most records"), el("span", { class: "hint" }, "Forms, templates, logbooks and annexes")),
    el("div", { class: "rank" }, st.richest.filter((r) => r.n).map(({ s, n }) => el("button", { class: `rank-row ${deptClass(s.dept)}`, type: "button", onclick: () => go(`#/sop/${s.id}/forms`) },
      el("span", { class: "title" }, el("span", { class: "code" }, s.code), " ", s.title),
      el("span", { class: "meter" }, el("i", { style: { width: `${(n / maxAtt) * 80}px` } }), n)))));

  const recent = [...state.records.values()].flat().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 7);
  const activity = el("div", { class: "panel span-6" },
    el("div", { class: "panel-head" }, el("h2", {}, "Latest digital entries"), el("span", { class: "hint" }, "Stored on this device")),
    recent.length ? el("div", { class: "activity" }, recent.map((r) => {
      const att = findAttByRecordKey(r.attKey);
      return el("div", { class: "activity-row", onclick: () => att && go(`#/att/${att.id}`) },
        typeIcon(att?.type || "form"),
        el("span", {}, el("div", { style: { fontWeight: 500 } }, att?.title || r.attCode), el("div", { class: "hint" }, `${r.attCode} · ${r.by || "—"}`)),
        el("span", { class: "hint mono" }, formatDate(r.createdAt)));
    }))
      : el("div", { class: "hint" }, "No entries yet. Open any form or logbook and record the first entry; it can be printed or exported to CSV."));

  mount("overview", demoBanner(), hero,
    el("div", { class: "grid cols-12", style: { marginTop: "18px" } }, matrix, attentionPanel, calendar, referenced, richest, activity));
}

function timelineChart({ buckets, overdue }) {
  const W = 760, H = 190, padL = 26, padB = 26, padT = 14;
  const cols = [{ key: "Overdue", sops: [], overdue: true, n: overdue }, ...buckets.map((b) => ({ ...b, n: b.sops.length }))];
  const max = Math.max(1, ...cols.map((c) => c.n));
  const bw = (W - padL) / cols.length;
  const y = (v) => H - padB - (v / max) * (H - padB - padT);
  const svg = svgEl("svg", { class: "timeline-chart", viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: "none", role: "img", "aria-label": "Review dates per month" });
  for (let g = 0; g <= max; g += Math.max(1, Math.ceil(max / 4))) {
    svg.append(svgEl("line", { x1: padL, x2: W, y1: y(g), y2: y(g), stroke: "var(--line)", "stroke-dasharray": g ? "3 4" : null }),
      svgEl("text", { x: 0, y: y(g) + 4 }, g));
  }
  cols.forEach((c, i) => {
    const x = padL + i * bw + bw * 0.18;
    const w = bw * 0.64;
    if (c.overdue) {
      if (c.n) svg.append(svgEl("rect", { class: "bar", x, y: y(c.n), width: w, height: H - padB - y(c.n), rx: 3, fill: "var(--overdue)",
        onclick: () => { resetLibraryFilters(); state.library.review = "overdue"; go("#/library"); } }, svgEl("title", {}, `${c.n} overdue`)));
      svg.append(svgEl("text", { x: x + w / 2, y: H - 8, "text-anchor": "middle", fill: "var(--overdue)" }, "Late"));
      return;
    }
    // stack by department
    const byDept = {};
    for (const id of c.sops) { const d = state.lib.byId.get(id).dept; byDept[d] = (byDept[d] || 0) + 1; }
    let acc = 0;
    for (const [d, n] of Object.entries(byDept)) {
      svg.append(svgEl("rect", { class: "bar", x, y: y(acc + n), width: w, height: y(acc) - y(acc + n), rx: 2, fill: deptColor(d),
        onclick: () => { resetLibraryFilters(); state.library.month = c.key; go("#/library"); } },
      svgEl("title", {}, `${c.key}: ${n} ${d} review${n > 1 ? "s" : ""}`)));
      acc += n;
    }
    const m = c.date.getMonth();
    if (i === 1 || m === 0 || i % 3 === 1) {
      svg.append(svgEl("text", { x: x + w / 2, y: H - 8, "text-anchor": "middle" },
        m === 0 || i === 1 ? `${c.date.toLocaleString("en-GB", { month: "short" })} ${String(c.date.getFullYear()).slice(2)}` : c.date.toLocaleString("en-GB", { month: "short" })));
    }
  });
  return svg;
}

function openHub(type = "", dept = "") {
  Object.assign(state.hub, { type, dept, query: "", site: "", withFields: false, limit: 60 });
  go("#/records");
}

function resetLibraryFilters() {
  Object.assign(state.library, { query: "", dept: "", lang: "", site: "", status: "current", review: "", has: "", month: "", sort: "code", dir: "asc" });
}

function findAttByRecordKey(k) {
  return state.lib.attachments.find((a) => recordKey(a) === k);
}

// ---------- library ----------

function renderLibrary() {
  setTitle(state.lib.meta.source?.name || "Library", "SOP Library");
  const f = state.library;
  const lib = state.lib;
  const current = lib.sops.filter((s) => f.status === "all" || s.status === (f.status || "current"));
  const deptCounts = {};
  for (const s of current) deptCounts[s.dept] = (deptCounts[s.dept] || 0) + 1;

  const select = (key, options, label) => el("select", { "aria-label": label, onchange: (e) => { f[key] = e.target.value; renderLibrary(); } },
    options.map(([v, t]) => el("option", { value: v, selected: f[key] === v }, t)));
  const search = el("input", { type: "search", placeholder: "Search code, title, purpose, forms, full text…", value: f.query,
    oninput: debounce((e) => { f.query = e.target.value; renderResults(); }, 140) });

  const toolbar = el("div", { class: "toolbar" },
    el("label", { class: "search-box" }, icon("search"), search),
    select("lang", [["", "All languages"], ...Object.entries(LANGS)], "Language"),
    select("site", [["", "All sites"], ["Onc", "Oncology (Onc)"], ["General", "General"]], "Site"),
    select("review", [["", "Any review state"], ...Object.entries(REVIEW_META).map(([k, v]) => [k, v.label])], "Review state"),
    select("has", [["", "Any attachment"], ...TYPES.map((t) => [t, `Has ${TYPE_META[t].plural.toLowerCase()}`])], "Attachment type"),
    select("status", [["current", "Current files"], ["all", "All files"], ["duplicate", "Duplicates only"]], "File status"),
    el("div", { class: "seg", role: "group", "aria-label": "Layout" },
      el("button", { type: "button", class: f.view === "cards" ? "on" : "", title: "Cards", onclick: () => { f.view = "cards"; store.setPref("libView", "cards"); renderLibrary(); } }, icon("grid")),
      el("button", { type: "button", class: f.view === "table" ? "on" : "", title: "Table", onclick: () => { f.view = "table"; store.setPref("libView", "table"); renderLibrary(); } }, icon("rows"))));

  const chips = el("div", { class: "filter-row" },
    el("div", { class: "chips" },
      el("button", { type: "button", class: `chip-btn${!f.dept ? " on" : ""}`, onclick: () => { f.dept = ""; renderLibrary(); } }, "All departments", el("span", { class: "n" }, current.length)),
      Object.entries(deptCounts).sort((a, b) => b[1] - a[1]).map(([d, n]) => el("button", {
        type: "button", class: `chip-btn ${deptClass(d)}${f.dept === d ? " on" : ""}`, onclick: () => { f.dept = f.dept === d ? "" : d; renderLibrary(); },
      }, el("i", { class: "sw" }), lib.meta.departments[d] || d, el("span", { class: "n" }, n)))),
    el("span", { class: "spacer" }),
    el("label", { class: "toggle" }, el("input", { type: "checkbox", checked: f.fullText, onchange: (e) => { f.fullText = e.target.checked; renderResults(); } }), "Search full text"));

  const meta = el("div", { class: "result-meta" });
  const results = el("div");

  function renderResults() {
    const q = tokens(f.query);
    let rows = filterSops(lib, { ...f, status: f.status === "all" ? "" : f.status });
    if (f.month) rows = rows.filter((r) => (r.sop.reviewDate || "").startsWith(f.month));
    if (!q.length) rows = sortSops(rows, f.sort, f.dir);
    put(meta, 
      el("b", { style: { color: "var(--ink)" } }, plural(rows.length, "SOP")),
      q.length ? el("span", {}, `matching “${f.query}”`) : null,
      f.month ? el("span", { class: "chip" }, `Review in ${f.month}`, el("button", { class: "btn ghost sm icon-btn", type: "button", "aria-label": "Clear month", onclick: () => { f.month = ""; renderResults(); } }, icon("x"))) : null,
      el("span", { class: "spacer" }),
      !q.length ? el("select", { "aria-label": "Sort", style: { width: "auto", minHeight: "32px", padding: "4px 10px" },
        onchange: (e) => { const [k, d] = e.target.value.split(":"); f.sort = k; f.dir = d; renderResults(); } },
      [["code:asc", "Sort: code"], ["title:asc", "Sort: title"], ["review:asc", "Sort: review date"], ["links:desc", "Sort: most attachments"], ["version:desc", "Sort: version"]]
        .map(([v, t]) => el("option", { value: v, selected: `${f.sort}:${f.dir}` === v }, t))) : null,
      btn("Export CSV", () => download(`sop-library-${todayIso()}.csv`, libraryToCsv({ ...lib, sops: rows.map((r) => r.sop) })), { cls: "sm", icon: "download" }));
    if (!rows.length) {
      put(results, el("div", { class: "empty" }, icon("search"), el("h3", {}, "No SOP matches"),
        el("p", {}, "Try fewer words, another department, or switch on full-text search."),
        btn("Clear filters", () => { resetLibraryFilters(); renderLibrary(); }, { cls: "sm" })));
      return;
    }
    put(results, f.view === "table" ? libraryTable(rows, q) : el("div", { class: "cards" }, rows.map((r) => sopCard(r, q))));
  }

  mount("library", demoBanner(), toolbar, chips, meta, results);
  renderResults();
  if (f.query) { search.focus(); search.setSelectionRange(search.value.length, search.value.length); }
}

function attCounts(s) {
  const own = (s.attachments || []).filter((a) => a.own);
  return TYPES.map((t) => [t, own.filter((a) => a.type === t).length]).filter(([, n]) => n);
}

function sopCard({ sop: s, snippet }, q) {
  return el("a", { class: `sop-card ${deptClass(s.dept)}`, href: `#/sop/${s.id}` },
    el("div", { class: "card-top" },
      deptBadge(s.dept),
      el("span", { class: "code" }, highlight(displayCode(s), q)),
      el("span", { class: "lang" }, s.lang || "—"),
      s.status !== "current" ? el("span", { class: "chip" }, STATUS_META[s.status]) : null,
      el("span", { class: "spacer" }),
      s.reviewState !== "unknown" ? el("span", { class: `state-${s.reviewState}`, title: REVIEW_META[s.reviewState].label }, el("i", { class: "dot" })) : null),
    el("h3", {}, highlight(s.title || s.file, q)),
    el("p", { class: "desc" }, snippet ? highlight(snippet, q) : s.purpose || s.scope || el("span", { class: "muted" }, "No purpose statement extracted.")),
    el("div", { class: "card-foot" },
      attCounts(s).map(([t, n]) => el("span", { class: `count type-${t}`, title: TYPE_META[t].plural }, el("i"), el("b", {}, n), typeWord(t, n))),
      el("span", { class: "spacer" }),
      s.links.length || s.backlinks.length ? el("span", { class: "count", title: "Linked SOPs" }, icon("link"), el("b", {}, s.links.length + s.backlinks.length)) : null,
      s.effectiveDate ? el("span", { class: "mono" }, formatDate(s.effectiveDate)) : null));
}

function libraryTable(rows, q) {
  const f = state.library;
  const th = (key, label) => el("th", { class: f.sort === key ? "sorted" : "", onclick: () => {
    if (q.length) return;
    f.dir = f.sort === key && f.dir === "asc" ? "desc" : "asc";
    f.sort = key;
    renderLibrary();
  } }, label, f.sort === key && !q.length ? (f.dir === "asc" ? " ↑" : " ↓") : "");
  return el("div", { class: "table-wrap" }, el("table", { class: "data" },
    el("thead", {}, el("tr", {}, th("code", "Code"), th("title", "Title"), th("dept", "Dept"), el("th", {}, "Lang"), th("version", "Ver"),
      TYPES.map((t) => el("th", { title: TYPE_META[t].plural }, TYPE_META[t].short)), th("review", "Review"), el("th", {}, "Links"))),
    el("tbody", {}, rows.map(({ sop: s }) => {
      const own = (s.attachments || []).filter((a) => a.own);
      return el("tr", { onclick: () => go(`#/sop/${s.id}`) },
        el("td", {}, el("span", { class: "code" }, highlight(displayCode(s), q))),
        el("td", {}, highlight(s.title || s.file, q), s.status !== "current" ? el("span", { class: "chip", style: { marginLeft: "6px" } }, STATUS_META[s.status]) : null),
        el("td", {}, deptBadge(s.dept)), el("td", {}, el("span", { class: "lang" }, s.lang || "—")),
        el("td", { class: "num" }, s.version || "—"),
        TYPES.map((t) => { const n = own.filter((a) => a.type === t).length; return el("td", { class: "num", style: { color: n ? TYPE_COLORS[t] : "var(--muted)" } }, n || "·"); }),
        el("td", {}, s.reviewDate ? el("span", { class: `state-${s.reviewState}`, style: { whiteSpace: "nowrap" } }, el("i", { class: "dot" }), " ", formatDate(s.reviewDate)) : el("span", { class: "muted" }, "—")),
        el("td", { class: "num" }, s.links.length + s.backlinks.length || "·"));
    }))));
}

// ---------- SOP detail ----------

function renderSop() {
  const lib = state.lib;
  const [id, tab] = state.route.parts;
  const s = lib.byId.get(id);
  if (!s) {
    setTitle("Library", "SOP not found");
    mount("sop", el("div", { class: "empty" }, icon("file"), el("h3", {}, "This SOP is not in the loaded library"),
      el("p", {}, "It may belong to another library file."), btn("Back to library", () => go("#/library"), { cls: "primary" })));
    return;
  }
  state.sopTab = tab || "overview";
  setTitle(lib.meta.departments[s.dept] || s.dept, displayCode(s));
  const own = (s.attachments || []).filter((a) => a.own).map((a) => lib.attById.get(`${s.id}~${attachmentKey(a)}`)).filter(Boolean);
  const foreign = s.foreign.map((fid) => lib.attById.get(fid)).filter(Boolean);
  const family = (lib.families.get(s.family ? `SOP${s.family}` : `SOP${s.dept}${s.num}`) || lib.families.get(`SOP${s.dept}${s.num}`) || []).filter((x) => x.id !== s.id);
  const linked = new Set([...s.links, ...s.backlinks]);

  const facts = [
    ["Version", s.version || "—"],
    ["Effective", s.effectiveDate ? formatDate(s.effectiveDate)
      : s.lastEffectiveDate ? el("span", { title: "This version's date is not written in the file (set in the eDMS)" }, el("span", { class: "muted" }, "Previous: "), formatDate(s.lastEffectiveDate)) : "—"],
    ["Next review", s.reviewDate ? el("span", { class: `state-${s.reviewState}` }, el("i", { class: "dot" }), ` ${formatDate(s.reviewDate)}${s.reviewEstimated ? " (est.)" : ""}`) : REVIEW_META[s.reviewState].short],
    ["Language", LANGS[s.lang] || "—"],
    ["Site", s.site === "Onc" ? "Oncology" : s.site],
    ["Attachments", own.length],
    ["Linked SOPs", linked.size],
  ];

  const head = el("div", { class: `detail-head ${deptClass(s.dept)}` },
    el("div", { class: "card-top" }, deptBadge(s.dept), el("span", { class: "code" }, displayCode(s)),
      s.status !== "current" ? el("span", { class: "chip" }, STATUS_META[s.status]) : el("span", { class: "chip state-ok" }, el("i", { class: "dot" }), "Current file"),
      s.pendingRevision ? el("span", { class: "chip state-pending" }, el("i", { class: "dot" }), `Revision ${s.pendingRevision} pending`) : null,
      s.extraction === "metadata" ? el("span", { class: "chip state-due" }, "Content not extracted") : null),
    el("h2", {}, s.title || s.file),
    s.purpose ? el("p", { class: "purpose" }, s.purpose) : null,
    el("div", { class: "detail-actions" },
      s.driveUrl ? el("a", { class: "btn primary", href: s.driveUrl, target: "_blank", rel: "noopener" }, icon("external"), "Open source document") : null,
      btn("Print summary", () => printSopSummary(s, own), { icon: "print" }),
      own.length ? btn(`Print all blank forms (${own.length})`, () => printBlank(own), { icon: "print" }) : null,
      btn("Copy link", () => copyLink(), { icon: "link", cls: "ghost" })),
    el("dl", { class: "facts" }, facts.map(([k, v]) => el("div", { class: "fact" }, el("dt", { class: "label" }, k), el("dd", { class: "v", style: { margin: 0 } }, v)))));

  const tabs = [
    ["overview", "Overview", null],
    ["forms", "Forms & records", own.length + foreign.length],
    ["links", "Linked SOPs", linked.size + s.missing.length],
    ["procedure", "Procedure outline", s.outline.length],
    ["history", "History", s.history.length],
    ["glossary", "Glossary", s.glossary.length],
    ["text", "Full text", s.text ? null : 0],
  ];
  if (!tabs.some(([k]) => k === state.sopTab)) state.sopTab = "overview";
  const body = el("div");
  const tabBar = el("div", { class: "tabs", role: "tablist" }, tabs.map(([k, label, n]) => el("button", {
    class: `tab${state.sopTab === k ? " on" : ""}`, type: "button", role: "tab", "aria-selected": state.sopTab === k ? "true" : "false",
    onclick: () => { state.sopTab = k; history.replaceState(null, "", `#/sop/${s.id}/${k}`); state.route.parts = [s.id, k]; renderSop(); },
  }, label, n !== null && n !== undefined ? el("span", { class: "n" }, n) : null)));

  const sections = {
    overview: () => sopOverview(s, own, family),
    forms: () => sopForms(s, own, foreign),
    links: () => sopLinks(s),
    procedure: () => s.outline.length ? el("div", { class: "panel" }, el("div", { class: "panel-head" }, el("h2", {}, "Procedure outline"),
      el("span", { class: "hint" }, "Main steps and headings of the procedure")), el("ol", { class: "steps" }, s.outline.map((o) => el("li", {}, o))))
      : emptyNote("No procedure outline was extracted from this file."),
    history: () => sopHistory(s),
    glossary: () => s.glossary.length ? el("dl", { class: "gloss" }, s.glossary.map((g) => el("div", {}, el("dt", {}, g.term), el("dd", {}, g.def))))
      : emptyNote("No definitions section in this SOP."),
    text: () => sopText(s),
  };
  body.append(sections[state.sopTab]());

  mount("sop",
    el("nav", { class: "crumbs", "aria-label": "Breadcrumb" }, el("a", { href: "#/library" }, "Library"), "›",
      el("a", { href: "#/library", onclick: () => { resetLibraryFilters(); state.library.dept = s.dept; } }, lib.meta.departments[s.dept] || s.dept), "›",
      el("span", {}, displayCode(s))),
    el("div", { class: deptClass(s.dept) }, head, tabBar, body));
}

const emptyNote = (text) => el("div", { class: "empty" }, icon("file"), el("p", {}, text));

function sopOverview(s, own, family) {
  const block = (title, content) => content && (!Array.isArray(content) || content.length)
    ? el("div", { class: "panel" }, el("div", { class: "panel-head" }, el("h2", {}, title)),
      Array.isArray(content) ? el("ul", { class: "list" }, content.map((c) => el("li", {}, c))) : el("div", { class: "prose" }, el("p", {}, content)))
    : null;
  const left = [
    block("Scope", s.scope), s.intro && s.intro !== s.purpose ? block("Introduction", s.intro) : null,
    block("Responsibilities", s.responsibilities), block("Health, safety & environment", s.hse),
    block("Training", s.training), block("References", s.references),
  ].filter(Boolean);
  const right = [];
  if (own.length) {
    right.push(el("div", { class: "panel" }, el("div", { class: "panel-head" }, el("h2", {}, "Controlled attachments"),
      el("a", { class: "btn ghost sm", href: `#/sop/${s.id}/forms` }, "Open all")),
    el("div", { class: "link-list" }, own.map((a) => el("a", { class: `link-row type-${a.type}`, href: `#/att/${a.id}` },
      typeIcon(a.type), el("span", { class: "title" }, el("span", { class: "code" }, a.code), " ", a.title || el("i", { class: "muted" }, "Untitled")),
      recordsOf(a).length ? el("span", { class: "badge mono" }, recordsOf(a).length) : el("span", { class: "muted" }, icon("arrow")))))));
  }
  right.push(block("Tools & equipment", s.tools), block("Materials", s.materials), block("Distribution", s.distribution));
  if (family.length) {
    right.push(el("div", { class: "panel" }, el("div", { class: "panel-head" }, el("h2", {}, "Other files of this SOP"), el("span", { class: "hint" }, "Site and language versions")),
      el("div", { class: "link-list" }, family.map((x) => el("a", { class: "link-row", href: `#/sop/${x.id}` },
        el("span", { class: "code" }, displayCode(x)), el("span", { class: "title" }, x.title),
        el("span", { class: "chip" }, x.status === "current" ? LANGS[x.lang] || x.site : STATUS_META[x.status]))))));
  }
  const src = el("div", { class: "panel" }, el("div", { class: "panel-head" }, el("h2", {}, "Source file")),
    el("dl", { class: "kv" },
      el("dt", {}, "File"), el("dd", { style: { overflowWrap: "anywhere" } }, s.file),
      el("dt", {}, "Format"), el("dd", {}, (s.fileType || "—").toUpperCase()),
      el("dt", {}, "Read from"), el("dd", {}, { docx: "Word document", pdf: "PDF text", curated: "Scanned PDF (OCR, reviewed)", metadata: "File name only" }[s.extraction] || "—"),
      s.issueDate ? [el("dt", {}, "Issued"), el("dd", {}, formatDate(s.issueDate))] : null,
      s.preparedBy ? [el("dt", {}, "Prepared by"), el("dd", {}, s.preparedBy)] : null,
      s.approvedBy ? [el("dt", {}, "Approved by"), el("dd", {}, s.approvedBy)] : null));
  right.push(src);
  if (!left.length) left.push(emptyNote(s.extraction === "metadata" ? "This file was too large to read. Open the source document for its content." : "No scope or responsibilities were extracted."));
  return el("div", { class: "grid cols-12" },
    el("div", { class: "grid span-7", style: { alignContent: "start" } }, left),
    el("div", { class: "grid span-5", style: { alignContent: "start" } }, right.filter(Boolean)));
}

function attCard(a, opts = {}) {
  const sop = state.lib.byId.get(a.sopId);
  const n = recordsOf(a).length;
  const shown = a.fields.slice(0, 7);
  return el("article", { class: `att-card type-${a.type}` },
    el("div", { class: "head" }, typeIcon(a.type), typeBadge(a.type), el("span", { class: "code" }, a.code),
      n ? el("span", { class: "badge mono", title: "Digital entries" }, plural(n, "entry", "entries")) : null),
    el("h4", {}, a.title || el("span", { class: "muted" }, "Untitled attachment")),
    opts.showParent !== false && sop ? el("a", { class: "parent", href: `#/sop/${sop.id}` }, "From ", el("b", {}, sop.code), ` · ${sop.title}`) : null,
    a.fields.length ? el("div", { class: "fields" }, shown.map((f) => el("span", { title: f }, f)),
      a.fields.length > shown.length ? el("span", { class: "more" }, `+${a.fields.length - shown.length} fields`) : null)
      : el("p", { class: "hint" }, "No fields listed in the SOP; a generic record layout is used."),
    a.usedBy.length ? el("p", { class: "hint" }, `Also used by ${plural(a.usedBy.length, "other SOP")}`) : null,
    el("div", { class: "actions" },
      el("a", { class: "btn sm primary", href: `#/att/${a.id}` }, icon(a.type === "logbook" ? "logbook" : "form"), a.type === "logbook" ? "Open logbook" : "Fill in"),
      btn("Print blank", () => printBlank([a]), { cls: "sm", icon: "print" })));
}

function sopForms(s, own, foreign) {
  if (!own.length && !foreign.length) return emptyNote("This SOP does not list forms, templates, logbooks or annexes.");
  const groups = TYPES.map((t) => [t, own.filter((a) => a.type === t)]).filter(([, l]) => l.length);
  return el("div", { class: "grid" },
    groups.map(([t, list]) => el("section", { class: "grid", style: { gap: "12px" } },
      el("div", { class: "panel-head", style: { margin: 0 } }, typeIcon(t), el("h2", {}, `${TYPE_META[t].plural}`), el("span", { class: "badge mono" }, list.length)),
      el("div", { class: "att-grid" }, list.map((a) => attCard(a, { showParent: false }))))),
    foreign.length ? el("section", { class: "grid", style: { gap: "12px" } },
      el("div", { class: "panel-head", style: { margin: 0 } }, icon("link"), el("h2", {}, "Records from other SOPs used here"), el("span", { class: "badge mono" }, foreign.length)),
      el("div", { class: "att-grid" }, foreign.map((a) => attCard(a)))) : null);
}

function sopLinks(s) {
  const lib = state.lib;
  const row = (id) => {
    const t = lib.byId.get(id);
    return el("a", { class: `link-row ${deptClass(t.dept)}`, href: `#/sop/${t.id}` },
      deptBadge(t.dept), el("span", { class: "title" }, el("span", { class: "code" }, t.code), " ", t.title), icon("arrow"));
  };
  const related = (s.related || []).filter((r) => /^SOP/i.test(r.code));
  return el("div", { class: "grid" },
    s.links.length + s.backlinks.length ? el("div", { class: "panel" }, el("div", { class: "panel-head" }, el("h2", {}, "Reference network"),
      el("span", { class: "hint" }, "Right: SOPs this one refers to · Left: SOPs that refer to it")), egoGraph(s)) : null,
    el("div", { class: "links-grid" },
      el("div", { class: "panel" }, el("div", { class: "panel-head" }, el("h2", {}, "Refers to"), el("span", { class: "badge mono" }, s.links.length + s.missing.length)),
        el("div", { class: "link-list" }, s.links.map(row),
          s.missing.map((c) => el("div", { class: "link-row missing", title: "Not in the loaded library" }, el("span", { class: "code" }, c),
            el("span", { class: "title" }, related.find((r) => r.code.replace(/[EF]?(\/.*)?$/, "").startsWith(c))?.title || "Not in this library"), icon("ban"))),
          !s.links.length && !s.missing.length ? el("p", { class: "hint" }, "No references to other SOPs.") : null)),
      el("div", { class: "panel" }, el("div", { class: "panel-head" }, el("h2", {}, "Referenced by"), el("span", { class: "badge mono" }, s.backlinks.length)),
        el("div", { class: "link-list" }, s.backlinks.map(row), !s.backlinks.length ? el("p", { class: "hint" }, "No other SOP refers to this one.") : null))));
}

function egoGraph(s) {
  const lib = state.lib;
  const W = 900, H = 320, cx = W / 2, cy = H / 2;
  const svg = svgEl("svg", { class: "ego", viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Reference network" });
  const place = (ids, side) => ids.slice(0, 12).map((id, i, arr) => {
    const spread = Math.min(1, arr.length / 6);
    const a = arr.length === 1 ? 0 : (-0.5 + i / (arr.length - 1)) * Math.PI * 0.8 * spread;
    return { id, x: cx + side * Math.cos(a) * 330, y: cy + Math.sin(a) * 125 };
  });
  const out = place(s.links, 1);
  const inn = place(s.backlinks.filter((id) => !s.links.includes(id)), -1);
  const both = new Set(s.links.filter((id) => s.backlinks.includes(id)));
  for (const p of [...out, ...inn]) {
    const t = lib.byId.get(p.id);
    const mx = (cx + p.x) / 2;
    svg.append(svgEl("path", { d: `M${cx},${cy} C${mx},${cy} ${mx},${p.y} ${p.x},${p.y}`, fill: "none",
      stroke: deptColor(t.dept), "stroke-width": both.has(p.id) ? 2.4 : 1.4, opacity: 0.55, "stroke-dasharray": inn.includes(p) ? "5 4" : null }));
  }
  for (const p of [...out, ...inn]) {
    const t = lib.byId.get(p.id);
    const right = p.x > cx;
    const g = svgEl("g", { style: "cursor:pointer", onclick: () => go(`#/sop/${t.id}`) },
      svgEl("title", {}, `${t.code} · ${t.title}`),
      svgEl("circle", { cx: p.x, cy: p.y, r: 7, fill: deptColor(t.dept), stroke: "var(--surface)", "stroke-width": 2 }),
      svgEl("text", { x: p.x + (right ? 12 : -12), y: p.y + 4, "text-anchor": right ? "start" : "end", "font-family": "var(--font-mono)", "font-size": 11.5, fill: "var(--ink-2)" }, t.code));
    svg.append(g);
  }
  svg.append(svgEl("circle", { cx, cy, r: 30, fill: deptColor(s.dept), opacity: 0.15 }),
    svgEl("circle", { cx, cy, r: 18, fill: deptColor(s.dept) }),
    svgEl("text", { x: cx, y: cy + 46, "text-anchor": "middle", "font-family": "var(--font-mono)", "font-size": 12.5, "font-weight": 600, fill: "var(--ink)" }, s.code));
  if (s.links.length > 12 || s.backlinks.length > 12) {
    svg.append(svgEl("text", { x: W - 8, y: H - 8, "text-anchor": "end", "font-size": 11, fill: "var(--muted)" }, "Showing the first 12 on each side"));
  }
  return svg;
}

function sopHistory(s) {
  const hist = s.history || [];
  if (!hist.length) return emptyNote("No revision history in this file.");
  const sorted = [...hist].reverse();
  return el("div", { class: "panel" }, el("div", { class: "panel-head" }, el("h2", {}, "Revision history"),
    s.lastEffectiveDate ? el("span", { class: "hint" }, `Last effective version: ${formatDate(s.lastEffectiveDate)}`) : null),
  el("ol", { class: "history" }, sorted.map((h) => {
    const pending = s.pendingRevision && h.ver === s.pendingRevision;
    return el("li", { class: pending ? "pending" : "" }, el("span", { class: "node" }),
      el("div", { class: "when" }, el("span", { class: "code" }, `v${h.ver}`), el("b", {}, h.date ? formatDate(h.date) : "Date not recorded"),
        pending ? el("span", { class: "chip state-pending" }, "Not yet effective") : null,
        h.ver === s.version && !pending ? el("span", { class: "chip state-ok" }, "This file") : null),
      el("p", { class: "sum" }, h.summary || "—"));
  })));
}

function sopText(s) {
  if (!s.text) return emptyNote(s.extraction === "metadata" ? "This file was too large to read here. Open the source document." : "The full text was not stored for this file (scanned document). The structured sections hold the reviewed content.");
  const pre = el("div", { class: "fulltext" });
  const input = el("input", { type: "search", placeholder: "Find in this SOP…", value: state.library.query,
    oninput: debounce(() => paint(), 120) });
  const count = el("span", { class: "hint" });
  function paint() {
    const q = tokens(input.value);
    put(pre, highlight(s.text, q));
    const n = pre.querySelectorAll("mark").length;
    count.textContent = q.length ? `${n} match${n === 1 ? "" : "es"}` : `${s.text.length.toLocaleString()} characters`;
    pre.querySelector("mark")?.scrollIntoView({ block: "center" });
  }
  paint();
  return el("div", { class: "grid", style: { gap: "12px" } },
    el("div", { class: "toolbar", style: { margin: 0 } }, el("label", { class: "search-box" }, icon("search"), input), count,
      btn("Copy text", async () => { await navigator.clipboard?.writeText(s.text); toast("Text copied"); }, { cls: "sm", icon: "copy" })), pre);
}

async function copyLink() {
  try {
    await navigator.clipboard.writeText(location.href);
    toast("Link copied. It opens on devices that have this library loaded.");
  } catch {
    toast(location.href);
  }
}

// ---------- forms & records hub ----------

function renderRecords() {
  setTitle("Forms, templates, logbooks & annexes", "Forms & Records");
  const h = state.hub;
  const lib = state.lib;
  const base = lib.attachments.filter((a) => a.status === "current");
  const countBy = (t) => base.filter((a) => !t || a.type === t).length;
  const tab = (t, label) => el("button", { type: "button", class: `type-tab${t ? ` type-${t}` : ""}${h.type === t ? " on" : ""}`,
    onclick: () => { h.type = t; h.limit = 60; renderRecords(); } },
  el("span", { class: "v", style: t ? { color: "var(--t)" } : {} }, countBy(t)), el("span", { class: "k" }, label));

  const search = el("input", { type: "search", placeholder: "Search form code, title, field or parent SOP…", value: h.query,
    oninput: debounce((e) => { h.query = e.target.value; h.limit = 60; paint(); }, 140) });
  const depts = [...new Set(base.map((a) => a.dept))].sort();
  const toolbar = el("div", { class: "toolbar" },
    el("label", { class: "search-box" }, icon("search"), search),
    el("select", { "aria-label": "Department", onchange: (e) => { h.dept = e.target.value; paint(); } },
      el("option", { value: "" }, "All departments"), depts.map((d) => el("option", { value: d, selected: h.dept === d }, lib.meta.departments[d] || d))),
    el("select", { "aria-label": "Site", onchange: (e) => { h.site = e.target.value; paint(); } },
      [["", "All sites"], ["Onc", "Oncology (Onc)"], ["General", "General"]].map(([v, t]) => el("option", { value: v, selected: h.site === v }, t))),
    el("label", { class: "toggle" }, el("input", { type: "checkbox", checked: h.withFields, onchange: (e) => { h.withFields = e.target.checked; paint(); } }), "With listed fields"));

  const meta = el("div", { class: "result-meta" });
  const grid = el("div");

  const recent = [...state.records.entries()].filter(([, r]) => r.length).map(([k, r]) => ({ att: findAttByRecordKey(k), n: r.length, last: r[r.length - 1] }))
    .filter((x) => x.att).sort((a, b) => String(b.last.createdAt).localeCompare(String(a.last.createdAt))).slice(0, 6);
  const activeRecords = recent.length ? el("div", { class: "panel", style: { marginBottom: "18px" } },
    el("div", { class: "panel-head" }, el("h2", {}, "In use on this device"), el("span", { class: "hint" }, "Records with digital entries")),
    el("div", { class: "link-list", style: { gridTemplateColumns: "repeat(auto-fill,minmax(320px,1fr))" } }, recent.map(({ att, n, last }) => el("a", { class: `link-row type-${att.type}`, href: `#/att/${att.id}` },
      typeIcon(att.type), el("span", { class: "title" }, el("b", {}, att.title || att.code), el("div", { class: "hint" }, `${att.code} · last ${formatDate(last.createdAt)}`)),
      el("span", { class: "badge mono" }, n))))) : null;

  function paint() {
    const list = filterAttachments({ ...lib, attachments: base }, h);
    put(meta, el("b", { style: { color: "var(--ink)" } }, plural(list.length, h.type ? TYPE_META[h.type].label.toLowerCase() : "attachment")),
      h.query ? el("span", {}, `matching “${h.query}”`) : null);
    if (!list.length) {
      put(grid, el("div", { class: "empty" }, icon("records"), el("h3", {}, "Nothing matches"), el("p", {}, "Change the search or filters.")));
      return;
    }
    const q = tokens(h.query);
    const cards = list.slice(0, h.limit).map((a) => {
      const c = attCard(a);
      if (q.length) put(c.querySelector("h4"), highlight(a.title || a.code, q));
      return c;
    });
    put(grid, el("div", { class: "att-grid" }, cards),
      list.length > h.limit ? el("div", { style: { display: "grid", placeItems: "center", marginTop: "18px" } },
        btn(`Show more (${list.length - h.limit} left)`, () => { h.limit += 90; paint(); })) : null);
  }

  mount("records", demoBanner(),
    el("div", { class: "type-tabs" }, tab("", "All attachments"), TYPES.map((t) => tab(t, TYPE_META[t].plural))),
    activeRecords, toolbar, meta, grid);
  paint();
}

// ---------- single attachment: digital record ----------

function renderAtt() {
  const lib = state.lib;
  const id = state.route.parts.join("/");
  const a = lib.attById.get(id);
  if (!a) {
    setTitle("Forms & Records", "Record not found");
    mount("att", el("div", { class: "empty" }, icon("records"), el("h3", {}, "This form is not in the loaded library"),
      btn("Back to forms", () => go("#/records"), { cls: "primary" })));
    return;
  }
  const sop = lib.byId.get(a.sopId);
  const cols = recordColumns(a);
  const records = recordsOf(a);
  setTitle(`${TYPE_META[a.type].label} · ${sop.code}`, a.code);

  const head = el("div", { class: `detail-head type-${a.type}`, style: { "--d": "var(--t)" } },
    el("div", { class: "card-top" }, typeIcon(a.type), typeBadge(a.type), el("span", { class: "code" }, a.code),
      a.version ? el("span", { class: "chip" }, `Version ${a.version}`) : null, deptBadge(a.dept)),
    el("h2", {}, a.title || "Untitled attachment"),
    el("p", { class: "purpose" }, "Controlled by ", el("a", { href: `#/sop/${sop.id}` }, el("b", {}, displayCode(sop)), ` · ${sop.title}`)),
    el("div", { class: "detail-actions" },
      btn("Print blank", () => printBlank([a]), { cls: "primary", icon: "print" }),
      records.length ? btn("Print with entries", () => printFilled(a, cols, records), { icon: "print" }) : null,
      records.length ? btn("Export CSV", () => download(`${safeName(a.code)}-${todayIso()}.csv`, recordsToCsv(a, cols, records)), { icon: "download" }) : null,
      sop.driveUrl ? el("a", { class: "btn ghost", href: sop.driveUrl, target: "_blank", rel: "noopener" }, icon("external"), "Source SOP") : null));

  const fieldsPanel = el("div", { class: "panel" },
    el("div", { class: "panel-head" }, el("h2", {}, "Fields"), el("span", { class: "hint" }, a.fields.length ? "As listed in the SOP" : "Generic layout")),
    el("ol", { class: "field-list" }, cols.map((c) => el("li", {}, el("span", {}, c.label), el("span", { class: "kind" }, c.kind)))));
  const used = a.usedBy.map((uid) => lib.byId.get(uid)).filter(Boolean);
  const usedPanel = el("div", { class: "panel" }, el("div", { class: "panel-head" }, el("h2", {}, "Used by")),
    el("div", { class: "link-list" },
      el("a", { class: `link-row ${deptClass(sop.dept)}`, href: `#/sop/${sop.id}` }, deptBadge(sop.dept), el("span", { class: "title" }, el("b", {}, sop.code), " owner"), icon("arrow")),
      used.map((u) => el("a", { class: `link-row ${deptClass(u.dept)}`, href: `#/sop/${u.id}` }, deptBadge(u.dept), el("span", { class: "title" }, el("span", { class: "code" }, u.code), " ", u.title), icon("arrow")))));

  // entry form
  const inputs = new Map();
  const formEl = el("div", { class: "entry-form" }, cols.map((c) => {
    let input;
    if (c.kind === "text") input = el("textarea", { rows: 2 });
    else if (c.kind === "date") input = el("input", { type: "date", value: todayIso() });
    else if (c.kind === "time") input = el("input", { type: "time" });
    else if (c.kind === "number") input = el("input", { type: "text", inputmode: "decimal" });
    else if (c.kind === "choice") input = el("input", { type: "text", list: "choice-list" });
    else input = el("input", { type: "text", value: /(sign|visa|by\b|par\b|done|performed|effectu|verifi|checked|initial|operator|operateur|name|nom)/i.test(c.label) ? state.user : "" });
    inputs.set(c.id, input);
    return el("label", { class: `field${c.kind === "text" ? " wide" : ""}` }, el("span", {}, c.label), input);
  }), el("datalist", { id: "choice-list" }, ["Conform", "Not conform", "Yes", "No", "N/A", "Conforme", "Non conforme", "Oui", "Non"].map((o) => el("option", { value: o }))));
  const who = el("input", { type: "text", value: state.user, placeholder: "Name or initials", style: { width: "220px" } });
  const save = async () => {
    const values = Object.fromEntries([...inputs].map(([k, i]) => [k, i.value.trim()]));
    const errs = validateRecord(values, cols);
    if (errs.length) { toast(errs[0]); return; }
    if (!who.value.trim()) { toast("Enter your name or initials first."); who.focus(); return; }
    state.user = who.value.trim();
    store.setPref("user", state.user);
    const rec = { id: `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`, attKey: recordKey(a), attCode: a.code, sopCode: sop.code,
      values, by: state.user, createdAt: new Date().toISOString() };
    await store.putRecord(rec);
    await loadRecords();
    toast("Entry recorded");
    renderAtt();
  };
  const entryPanel = el("div", { class: "panel" },
    el("div", { class: "panel-head" }, el("h2", {}, a.type === "logbook" ? "New logbook entry" : a.type === "template" ? "Fill in a copy" : "New entry"),
      el("span", { class: "hint" }, `Entry ${records.length + 1}`)),
    formEl,
    el("div", { class: "entry-actions" },
      el("label", { class: "field", style: { gridAutoFlow: "column", alignItems: "center", gap: "8px" } }, el("span", {}, "Recorded by"), who),
      el("span", { class: "spacer" }),
      btn("Clear", () => { for (const i of inputs.values()) i.value = ""; }, { cls: "ghost" }),
      btn("Record entry", save, { cls: "primary", icon: "check" })),
    el("p", { class: "signature-note", style: { marginTop: "12px" } }, icon("shield"),
      "Entries are kept on this device with time and author, and are voided with a reason instead of deleted. This is a working aid, not a validated 21 CFR Part 11 system: the signed paper or validated record stays the GMP record."));

  const table = records.length ? el("div", { class: "table-wrap" }, el("table", { class: "data records-table" },
    el("thead", {}, el("tr", {}, el("th", {}, "#"), el("th", {}, "Recorded"), cols.map((c) => el("th", {}, c.label)), el("th", {}, ""))),
    el("tbody", {}, records.map((r, i) => el("tr", { style: { cursor: "default" } },
      el("td", { class: "num" }, i + 1),
      el("td", { class: "who" }, formatDate(r.createdAt), el("br"), new Date(r.createdAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }), " · ", r.by || "—",
        r.voided ? el("div", { style: { color: "var(--danger)" } }, `Voided: ${r.voided.reason} (${r.voided.by})`) : null),
      cols.map((c) => el("td", { class: r.voided ? "void" : "" }, r.values?.[c.id] || "")),
      el("td", {}, r.voided ? null : el("button", { class: "btn ghost sm", type: "button", title: "Void entry", onclick: () => voidRecord(r) }, icon("ban"), "Void"))))))) : null;

  const entries = el("div", { class: "panel" },
    el("div", { class: "panel-head" }, el("h2", {}, "Entries"), el("span", { class: "badge mono" }, records.length),
      el("span", { class: "hint" }, records.length ? "Newest last, like a paper logbook" : "")),
    table || el("p", { class: "hint" }, "No entries yet. Record the first one above, or print the blank form."));

  mount("att",
    el("nav", { class: "crumbs", "aria-label": "Breadcrumb" }, el("a", { href: "#/records" }, "Forms & Records"), "›",
      el("a", { href: `#/sop/${sop.id}` }, sop.code), "›", el("span", {}, a.code)),
    el("div", { class: `type-${a.type}` }, head),
    el("div", { class: "record-layout", style: { marginTop: "18px" } },
      el("div", { class: "grid", style: { alignContent: "start" } }, fieldsPanel, usedPanel),
      el("div", { class: "grid", style: { alignContent: "start" } }, entryPanel, entries)));
}

async function voidRecord(r) {
  const reason = await ask({ title: "Void this entry", text: "The entry stays visible, struck through, with your reason. Give the reason for voiding:", input: "Reason", confirm: "Void entry", danger: true });
  if (!reason) return;
  r.voided = { reason, by: state.user || "—", at: new Date().toISOString() };
  await store.putRecord(r);
  await loadRecords();
  toast("Entry voided");
  renderAtt();
}

// ---------- relationship map ----------

let graphCache = null;

function renderMap() {
  setTitle("How SOPs reference each other", "Relationship Map");
  const m = state.map;
  const lib = state.lib;
  const key = `${m.dept}|${m.site}|${m.connectedOnly}`;
  if (!graphCache || graphCache.key !== key) {
    const g = graphData(lib, { dept: m.dept, site: m.site, connectedOnly: m.connectedOnly });
    const W = 1200, H = 800;
    graphCache = { key, g, pos: layoutGraph(g, W, H), W, H };
  }
  const { g, pos, W, H } = graphCache;
  const depts = [...new Set(lib.sops.filter((s) => s.status === "current").map((s) => s.dept))].sort();

  const toolbar = el("div", { class: "toolbar" },
    el("div", { class: "chips" },
      el("button", { type: "button", class: `chip-btn${!m.dept ? " on" : ""}`, onclick: () => { m.dept = ""; m.selected = null; renderMap(); } }, "All"),
      depts.map((d) => el("button", { type: "button", class: `chip-btn ${deptClass(d)}${m.dept === d ? " on" : ""}`, onclick: () => { m.dept = m.dept === d ? "" : d; m.selected = null; renderMap(); } },
        el("i", { class: "sw" }), d))),
    el("select", { "aria-label": "Site", style: { width: "auto" }, onchange: (e) => { m.site = e.target.value; m.selected = null; renderMap(); } },
      [["", "All sites"], ["Onc", "Oncology (Onc)"], ["General", "General"]].map(([v, t]) => el("option", { value: v, selected: m.site === v }, t))),
    el("label", { class: "toggle" }, el("input", { type: "checkbox", checked: m.connectedOnly, onchange: (e) => { m.connectedOnly = e.target.checked; m.selected = null; renderMap(); } }), "Linked SOPs only"),
    el("span", { class: "spacer" }),
    el("label", { class: "search-box", style: { maxWidth: "280px" } }, icon("search"),
      el("input", { type: "search", placeholder: "Highlight code or title…", value: m.query, oninput: debounce((e) => { m.query = e.target.value; paintHighlight(); }, 120) })));

  const svg = svgEl("svg", { class: "map-svg", viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "SOP reference map" });
  const view = svgEl("g", {});
  svg.append(view);
  const edgeEls = g.edges.map((e) => {
    const a = pos.get(e.source), b = pos.get(e.target);
    const line = svgEl("line", { class: "edge", x1: a.x, y1: a.y, x2: b.x, y2: b.y });
    line.dataset.s = e.source; line.dataset.t = e.target;
    view.append(line);
    return line;
  });
  const nodeEls = new Map();
  // Label only the hubs on a large map; the rest show their code on hover.
  const labelMin = g.nodes.length < 40 ? 0 : [...g.nodes].map((n) => n.degree).sort((a, b) => b - a)[Math.min(45, g.nodes.length - 1)];
  for (const n of g.nodes) {
    const p = pos.get(n.id);
    const r = 5 + Math.min(14, Math.sqrt(n.degree) * 2.6);
    const node = svgEl("g", { class: "node", transform: `translate(${p.x},${p.y})` },
      svgEl("title", {}, `${n.code} · ${n.title}\n${n.degree} links · ${n.atts} attachments`),
      svgEl("circle", { r, fill: deptColor(n.dept) }),
      n.degree >= labelMin ? svgEl("text", { x: r + 3, y: 3.5 }, n.code.replace(/^SOP/, "").replace(/[EF]$/, "")) : null);
    node.addEventListener("click", (ev) => { ev.stopPropagation(); m.selected = m.selected === n.id ? null : n.id; paintHighlight(); paintSide(); });
    node.addEventListener("dblclick", () => go(`#/sop/${n.id}`));
    nodeEls.set(n.id, node);
    view.append(node);
  }

  // zoom & pan
  const applyView = () => view.setAttribute("transform", `translate(${m.panX},${m.panY}) scale(${m.zoom})`);
  applyView();
  const zoomAt = (factor, cx = W / 2, cy = H / 2) => {
    const z = Math.max(0.4, Math.min(5, m.zoom * factor));
    m.panX = cx - ((cx - m.panX) * z) / m.zoom;
    m.panY = cy - ((cy - m.panY) * z) / m.zoom;
    m.zoom = z;
    applyView();
  };
  // viewBox is fitted with "meet": one scale for both axes, centred.
  const fit = () => {
    const r = svg.getBoundingClientRect();
    const k = Math.min(r.width / W, r.height / H) || 1;
    return { r, k, ox: (r.width - W * k) / 2, oy: (r.height - H * k) / 2 };
  };
  const toSvg = (ev) => {
    const { r, k, ox, oy } = fit();
    return { x: (ev.clientX - r.left - ox) / k, y: (ev.clientY - r.top - oy) / k };
  };
  svg.addEventListener("wheel", (ev) => { ev.preventDefault(); const p = toSvg(ev); zoomAt(ev.deltaY < 0 ? 1.15 : 1 / 1.15, p.x, p.y); }, { passive: false });
  let drag = null;
  svg.addEventListener("pointerdown", (ev) => {
    if (ev.target.closest(".node")) return;
    drag = { x: ev.clientX, y: ev.clientY, px: m.panX, py: m.panY, moved: false };
    svg.setPointerCapture(ev.pointerId);
    svg.classList.add("dragging");
  });
  svg.addEventListener("pointermove", (ev) => {
    if (!drag) return;
    const { k } = fit();
    const dx = (ev.clientX - drag.x) / k, dy = (ev.clientY - drag.y) / k;
    if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
    m.panX = drag.px + dx; m.panY = drag.py + dy;
    applyView();
  });
  const end = () => {
    if (drag && !drag.moved && m.selected) { m.selected = null; paintHighlight(); paintSide(); }
    drag = null;
    svg.classList.remove("dragging");
  };
  svg.addEventListener("pointerup", end);
  svg.addEventListener("pointercancel", end);

  const side = el("aside", { class: "map-side", hidden: true });
  function paintHighlight() {
    const q = tokens(m.query);
    const sel = m.selected;
    const neigh = new Set();
    if (sel) for (const e of g.edges) { if (e.source === sel) neigh.add(e.target); if (e.target === sel) neigh.add(e.source); }
    for (const n of g.nodes) {
      const nodeEl = nodeEls.get(n.id);
      const match = q.length && q.every((t) => fold(`${n.code} ${n.title}`).includes(t));
      const dim = sel ? n.id !== sel && !neigh.has(n.id) : q.length ? !match : false;
      nodeEl.classList.toggle("dim", dim);
      nodeEl.classList.toggle("sel", n.id === sel || !!match);
    }
    for (const e of edgeEls) {
      const hot = sel && (e.dataset.s === sel || e.dataset.t === sel);
      e.classList.toggle("hot", !!hot);
      e.classList.toggle("dim", (!!sel && !hot) || (!sel && q.length > 0));
    }
  }
  function paintSide() {
    const s = m.selected && lib.byId.get(m.selected);
    side.hidden = !s;
    if (!s) return;
    const row = (id) => { const t = lib.byId.get(id); return el("button", { class: "link-row", type: "button", onclick: () => { m.selected = id; paintHighlight(); paintSide(); } },
      el("i", { class: "dot", style: { color: deptColor(t.dept) } }), el("span", { class: "title" }, el("span", { class: "mono" }, t.code), " ", t.title), icon("arrow")); };
    put(side, 
      el("div", { class: "card-top" }, deptBadge(s.dept), el("span", { class: "code" }, displayCode(s)), el("span", { class: "spacer" }),
        el("button", { class: "btn ghost sm icon-btn", type: "button", "aria-label": "Close", onclick: () => { m.selected = null; paintHighlight(); paintSide(); } }, icon("x"))),
      el("h3", {}, s.title),
      el("div", { class: "card-foot", style: { borderTop: 0, paddingTop: 0 } }, attCounts(s).map(([t, n]) => el("span", { class: `count type-${t}` }, el("i"), el("b", {}, n), typeWord(t, n)))),
      s.links.length ? el("span", { class: "label" }, `Refers to (${s.links.length})`) : null, el("div", { class: "link-list" }, s.links.map(row)),
      s.backlinks.length ? el("span", { class: "label" }, `Referenced by (${s.backlinks.length})`) : null, el("div", { class: "link-list" }, s.backlinks.map(row)),
      el("a", { class: "btn primary", href: `#/sop/${s.id}` }, "Open SOP", icon("arrow")));
  }

  const legend = el("div", { class: "map-legend" }, depts.filter((d) => !m.dept || d === m.dept).map((d) => el("span", {}, el("i", { style: { background: deptColor(d) } }), d)),
    el("span", { class: "muted" }, `${g.nodes.length} SOPs · ${g.edges.length} links`));
  const tools = el("div", { class: "map-tools" },
    btn("", () => zoomAt(1.3), { cls: "sm icon-btn", icon: "zoomIn", aria: "Zoom in" }),
    btn("", () => zoomAt(1 / 1.3), { cls: "sm icon-btn", icon: "zoomOut", aria: "Zoom out" }),
    btn("", () => { m.zoom = 1; m.panX = 0; m.panY = 0; applyView(); }, { cls: "sm icon-btn", icon: "reset", aria: "Reset view" }));

  mount("map", toolbar,
    g.nodes.length ? el("div", { class: "map-wrap" }, svg, legend, tools, side)
      : el("div", { class: "empty" }, icon("map"), el("h3", {}, "No links to show"), el("p", {}, "No SOP in this selection references another one.")),
    el("p", { class: "hint", style: { marginTop: "10px" } }, "Node size shows how connected an SOP is. Click a node to see its links, double-click to open it. Scroll to zoom, drag to move."));
  paintHighlight();
  paintSide();
}

// ---------- data: import, export, quality ----------

function renderData() {
  setTitle("Import, export and data quality", "Library Data");
  const lib = state.lib;
  const st = stats(lib);
  const m = lib.meta;
  const totalRecords = [...state.records.values()].reduce((n, r) => n + r.length, 0);

  const drop = el("label", { class: "dropzone" }, icon("upload"),
    el("h3", {}, m.demo ? "Load your SOP library" : "Replace the library"),
    el("p", {}, "Drop sop-library.json here or click to choose it. It is stored in this browser only; nothing is uploaded."),
    el("span", { class: "btn primary" }, icon("upload"), "Choose file"));
  drop.addEventListener("click", (e) => { e.preventDefault(); pickFile(); });
  drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("over"));
  drop.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("over"); const f = e.dataTransfer.files[0]; if (f) importFile(f); });

  const current = el("div", { class: "panel" },
    el("div", { class: "panel-head" }, el("h2", {}, "Loaded library"), m.demo ? el("span", { class: "chip state-due" }, "Demo data") : el("span", { class: "chip state-ok" }, el("i", { class: "dot" }), "On this device")),
    el("dl", { class: "kv" },
      el("dt", {}, "Source"), el("dd", {}, m.source?.url ? el("a", { href: m.source.url, target: "_blank", rel: "noopener" }, m.source.name || m.source.url) : m.source?.name || "—"),
      el("dt", {}, "Built"), el("dd", {}, m.generatedAt ? new Date(m.generatedAt).toLocaleString("en-GB") : "—"),
      el("dt", {}, "Loaded from"), el("dd", {}, { demo: "Built-in demo", imported: "Imported file", hosted: "data/sop-library.json next to the app" }[state.origin]),
      el("dt", {}, "Files"), el("dd", {}, `${st.total} (${st.current} current, ${st.duplicates} duplicates)`),
      el("dt", {}, "Attachments"), el("dd", {}, `${st.attachments} · ${st.fieldCount} fields`),
      el("dt", {}, "Digital entries"), el("dd", {}, totalRecords)),
    el("div", { class: "detail-actions" },
      btn("Library CSV", () => download(`sop-library-${todayIso()}.csv`, libraryToCsv(lib)), { cls: "sm", icon: "download" }),
      btn("Forms index CSV", () => download(`sop-forms-${todayIso()}.csv`, formsCsv(lib)), { cls: "sm", icon: "download" }),
      !m.demo && state.origin === "imported" ? btn("Remove library", removeLibrary, { cls: "sm danger", icon: "trash" }) : null));

  const recordsPanel = el("div", { class: "panel" },
    el("div", { class: "panel-head" }, el("h2", {}, "Digital entries backup")),
    el("p", { class: "hint" }, "Entries live in this browser. Export a backup regularly and import it on another device to continue there."),
    el("div", { class: "detail-actions" },
      btn("Export entries (JSON)", exportRecords, { cls: "sm", icon: "download" }),
      btn("Import entries", importRecordsPick, { cls: "sm", icon: "upload" })));

  const build = el("div", { class: "panel" },
    el("div", { class: "panel-head" }, el("h2", {}, "Build the library file from your SOP folder")),
    el("p", { class: "hint", style: { marginBottom: "10px" } }, "Download the SOP folder (Word and PDF files), then run the extraction script from this repository. It reads codes, sections, history, forms, templates, logbooks and their fields, and writes one JSON file:"),
    el("pre", { class: "cmd" }, "python3 sop/tools/build_library.py \"SOP folder\" -o sop-library.json \\\n    --source-name \"SOP's 1\" --source-url \"https://drive.google.com/…\""),
    el("p", { class: "hint", style: { marginTop: "10px" } }, "Needs Python 3 and, for PDFs, pdftotext (poppler). Keep the JSON private: it contains your procedures. To serve it to a team, place it at sop/data/sop-library.json on a private server; that path is ignored by git."));

  const groups = {
    overdue: ["Review overdue", "alert", "state-overdue"], missing: ["Referenced SOP not in library", "link", "state-due"],
    duplicate: ["Duplicate files", "copy", "state-unknown"], untitled: ["Attachments without a title", "records", "state-unknown"],
    unread: ["Content not extracted", "file", "state-unknown"],
  };
  const issues = el("div", { class: "panel" },
    el("div", { class: "panel-head" }, el("h2", {}, "Data quality"), el("span", { class: "hint" }, `${lib.issues.length} findings`)),
    lib.issues.length ? Object.entries(groups).map(([k, [label, ic, cls]]) => {
      const list = lib.issues.filter((i) => i.kind === k);
      if (!list.length) return null;
      return el("details", { class: "issue-group" },
        el("summary", {}, el("span", { class: cls }, icon(ic)), label, el("span", { class: "n" }, list.length)),
        list.slice(0, 200).map((i) => {
          const s = lib.byId.get(i.sopId);
          return el("div", { class: "issue-row", onclick: () => go(i.attId ? `#/att/${i.attId}` : `#/sop/${i.sopId}`) },
            el("span", { class: "code" }, s?.code || "—"), el("span", {}, i.text));
        }));
    }) : el("p", { class: "hint" }, "No findings."));

  mount("data", el("div", { class: "grid cols-12" },
    el("div", { class: "grid span-7", style: { alignContent: "start" } }, drop, current, build),
    el("div", { class: "grid span-5", style: { alignContent: "start" } },
      el("div", { class: "panel" }, el("div", { class: "panel-head" }, el("span", { class: "state-ok" }, icon("shield")), el("h2", {}, "Privacy")),
        el("p", { class: "hint" }, "The app has no server and no account. Your library and entries are stored in this browser (IndexedDB) and work offline. Clearing site data removes them.")),
      recordsPanel, issues)));
}

function formsCsv(lib) {
  const esc = (v) => { const s = String(v ?? ""); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const head = ["Code", "Type", "Title", "Version", "SOP", "SOP title", "Department", "Site", "Fields", "Used by"];
  const rows = lib.attachments.map((a) => { const s = lib.byId.get(a.sopId); return [a.code, a.type, a.title, a.version, s.code, s.title, a.dept, a.site, a.fields.join(" | "), a.usedBy.map((u) => lib.byId.get(u)?.code).join(" ")]; });
  return [head, ...rows].map((r) => r.map(esc).join(",")).join("\r\n");
}

function pickFile() {
  const input = document.getElementById("file-input");
  input.onchange = () => { const f = input.files[0]; input.value = ""; if (f) importFile(f); };
  input.click();
}

async function importFile(file) {
  try {
    const raw = JSON.parse(await file.text());
    if (raw.schema === "sop-records/1") { await importRecords(raw); return; }
    const lib = indexLibrary(raw);   // validates before anything is stored
    await store.setValue("library", raw);
    await store.setValue("origin", "imported");
    store.persistent();
    setLibrary(raw, "imported");
    renderRail();
    toast(`Library loaded: ${lib.sops.length} SOP files, ${lib.attachments.length} attachments`);
    go("#/overview");
  } catch (err) {
    toast(`Could not load this file: ${err.message}`);
  }
}

async function removeLibrary() {
  const ok = await ask({ title: "Remove the library from this device?", text: "The SOP library file is removed from this browser and the demo returns. Digital entries are kept.", confirm: "Remove", danger: true });
  if (!ok) return;
  await store.deleteValue("library");
  await store.deleteValue("origin");
  setLibrary(DEMO_LIBRARY, "demo");
  renderRail();
  toast("Library removed");
  go("#/overview");
}

async function exportRecords() {
  const records = await store.allRecords();
  download(`sop-entries-${todayIso()}.json`, JSON.stringify({ schema: "sop-records/1", exportedAt: new Date().toISOString(), records }, null, 1), "application/json");
}

function importRecordsPick() {
  const input = document.getElementById("file-input");
  input.onchange = async () => {
    const f = input.files[0]; input.value = "";
    if (!f) return;
    try { await importRecords(JSON.parse(await f.text())); } catch (err) { toast(`Could not read entries: ${err.message}`); }
  };
  input.click();
}

async function importRecords(raw) {
  if (raw.schema !== "sop-records/1" || !Array.isArray(raw.records)) throw new Error("not an entries backup");
  let n = 0;
  for (const r of raw.records) {
    if (r && r.id && r.attKey && r.values) { await store.putRecord(r); n += 1; }
  }
  await loadRecords();
  toast(`${n} entries imported`);
  route();
}

// ---------- printing ----------

function printHead(title, code, sub) {
  return el("div", { class: "ps-head" },
    el("div", {}, el("small", {}, "Controlled document"), el("b", {}, state.lib.meta.source?.name || "SOP Library")),
    el("div", { class: "t" }, title),
    el("div", {}, el("small", {}, "Reference"), el("b", {}, code), sub ? el("div", {}, sub) : null));
}
const printFoot = (sop) => el("div", { class: "ps-foot" },
  el("span", {}, `Controlled by ${sop ? displayCode(sop) : "—"}. Check that this is the current version before use.`),
  el("span", {}, `Printed ${new Date().toLocaleString("en-GB")}`));

function blankSheet(a) {
  const sop = state.lib.byId.get(a.sopId);
  const cols = recordColumns(a);
  const tabular = a.type === "logbook" || a.type === "template" || cols.length > 9;
  const body = tabular
    ? el("table", { class: "ps-table" }, el("thead", {}, el("tr", {}, el("th", { style: { width: "6%" } }, "No."), cols.map((c) => el("th", {}, c.label)))),
      el("tbody", {}, Array.from({ length: cols.length > 8 ? 14 : 18 }, (_, i) => el("tr", {}, el("td", { class: "blank" }, i + 1), cols.map(() => el("td", { class: "blank" }))))))
    : el("table", { class: "ps-table ps-kv" }, el("tbody", {}, cols.map((c) => el("tr", {}, el("td", {}, c.label), el("td", {})))));
  return el("section", { class: tabular && cols.length > 7 ? "ps-wide" : "", style: { breakAfter: "page" } },
    printHead(a.title || a.code, a.code, a.version ? `Version ${a.version}` : TYPE_META[a.type].label),
    body,
    !tabular ? el("table", { class: "ps-table ps-sign" }, el("tbody", {}, el("tr", {}, ["Done by / date", "Checked by / date", "Approved by (QA) / date"].map((l) => el("td", { style: { height: "16mm" } }, el("small", {}, l)))))) : null,
    printFoot(sop));
}

function doPrint(...nodes) {
  const area = document.getElementById("print-area");
  put(area, ...nodes);
  requestAnimationFrame(() => window.print());
}

function printBlank(atts) {
  doPrint(...atts.map(blankSheet));
}

function printFilled(a, cols, records) {
  const sop = state.lib.byId.get(a.sopId);
  doPrint(el("section", { class: cols.length > 6 ? "ps-wide" : "" },
    printHead(a.title || a.code, a.code, `${records.length} entries`),
    el("table", { class: "ps-table" },
      el("thead", {}, el("tr", {}, el("th", {}, "No."), el("th", {}, "Recorded"), cols.map((c) => el("th", {}, c.label)))),
      el("tbody", {}, records.map((r, i) => el("tr", {}, el("td", {}, i + 1),
        el("td", {}, `${new Date(r.createdAt).toLocaleString("en-GB")} · ${r.by || ""}${r.voided ? ` — VOID: ${r.voided.reason}` : ""}`),
        cols.map((c) => el("td", { style: r.voided ? { textDecoration: "line-through" } : {} }, r.values?.[c.id] || "")))))),
    printFoot(sop)));
}

function printSopSummary(s, own) {
  const sec = (title, content) => (content && (!Array.isArray(content) || content.length)
    ? el("div", { class: "ps-section" }, el("h3", {}, title), Array.isArray(content) ? el("ul", {}, content.map((c) => el("li", {}, c))) : el("p", {}, content)) : null);
  doPrint(el("section", {},
    printHead(s.title, displayCode(s), `Effective ${formatDate(s.effectiveDate)}`),
    sec("Purpose", s.purpose), sec("Scope", s.scope), sec("Responsibilities", s.responsibilities), sec("Procedure outline", s.outline),
    own.length ? el("div", { class: "ps-section" }, el("h3", {}, "Forms, templates, logbooks and annexes"),
      el("table", { class: "ps-table" }, el("thead", {}, el("tr", {}, el("th", {}, "Code"), el("th", {}, "Type"), el("th", {}, "Title"))),
        el("tbody", {}, own.map((a) => el("tr", {}, el("td", {}, a.code), el("td", {}, TYPE_META[a.type].label), el("td", {}, a.title)))))) : null,
    s.links.length ? sec("Related SOPs", s.links.map((id) => { const t = state.lib.byId.get(id); return `${t.code} — ${t.title}`; })) : null,
    printFoot(s)));
}

// ---------- dialog ----------

function ask({ title, text, input, confirm = "OK", danger = false }) {
  const dlg = document.getElementById("dialog");
  return new Promise((resolve) => {
    const field = input ? el("input", { type: "text", placeholder: input, required: true }) : null;
    const done = (v) => { dlg.close(); resolve(v); };
    put(dlg, el("form", { method: "dialog", onsubmit: (e) => { e.preventDefault(); if (field && !field.value.trim()) { field.focus(); return; } done(field ? field.value.trim() : true); } },
      el("div", { class: "dialog-body" }, el("h2", {}, title), text ? el("p", { class: "hint" }, text) : null, field),
      el("div", { class: "dialog-actions" },
        el("button", { class: "btn ghost", type: "button", onclick: () => done(null) }, "Cancel"),
        el("button", { class: `btn ${danger ? "danger" : "primary"}`, type: "submit" }, confirm))));
    dlg.onclose = () => resolve(null);
    dlg.showModal();
    (field || dlg.querySelector("button[type=submit]")).focus();
  });
}

// ---------- command palette ----------

const COMMANDS = [
  { label: "Go to overview", hash: "#/overview", icon: "overview" },
  { label: "Browse the SOP library", hash: "#/library", icon: "library" },
  { label: "All forms", run: () => openHub("form"), icon: "form" },
  { label: "All logbooks", run: () => openHub("logbook"), icon: "logbook" },
  { label: "All templates", run: () => openHub("template"), icon: "template" },
  { label: "All annexes", run: () => openHub("annex"), icon: "annex" },
  { label: "Relationship map", hash: "#/map", icon: "map" },
  { label: "Import a library file", run: () => pickFile(), icon: "upload" },
  { label: "Library data & quality", hash: "#/data", icon: "data" },
  { label: "Change theme", run: () => cycleTheme(), icon: "auto" },
];

function openPalette() {
  const root = document.getElementById("palette-root");
  if (root.firstChild) return;
  let items = [];
  let sel = 0;
  const input = el("input", { type: "text", placeholder: "Type an SOP code, title, form or logbook…", "aria-label": "Search", autocomplete: "off" });
  const list = el("div", { class: "palette-list", role: "listbox" });
  const close = () => put(root);
  const choose = (it) => {
    close();
    if (!it) return;
    if (it.kind === "sop") go(`#/sop/${it.id}`);
    else if (it.kind === "att") go(`#/att/${it.id}`);
    else if (it.kind === "search") { resetLibraryFilters(); state.library.query = it.query; go("#/library"); }
    else if (it.hash) go(it.hash);
    else it.run?.();
  };
  const paint = () => {
    const q = input.value.trim();
    const qt = tokens(q);
    const found = quickFind(state.lib, q, 14);
    const cmds = COMMANDS.filter((c) => !qt.length || qt.every((t) => fold(c.label).includes(t))).map((c) => ({ ...c, kind: "cmd" }));
    items = [...found, ...(q ? [{ kind: "search", query: q, label: `Search full text for “${q}”` }] : []), ...cmds.slice(0, q ? 3 : 10)];
    sel = Math.min(sel, Math.max(0, items.length - 1));
    put(list, ...(items.length ? items.map((it, i) => {
      const s = it.kind === "sop" ? state.lib.byId.get(it.id) : null;
      const a = it.kind === "att" ? state.lib.attById.get(it.id) : null;
      const lead = s ? deptBadge(s.dept) : a ? typeIcon(a.type) : el("span", { class: "type-icon", style: { background: "var(--surface-3)", color: "var(--ink-2)" } }, icon(it.icon || "search"));
      const row = el("div", { class: `palette-item${i === sel ? " on" : ""}`, role: "option", "aria-selected": i === sel ? "true" : "false",
        onmousemove: () => { if (sel !== i) { sel = i; paint(); } }, onclick: () => choose(it) },
      lead,
      el("span", { class: "title" }, s || a ? el("span", { class: "code", style: { marginRight: "8px" } }, highlight(it.code, qt)) : null, highlight(it.label, qt),
        a ? el("span", { class: "hint" }, ` · ${state.lib.byId.get(a.sopId)?.code}`) : null),
      el("span", { class: "hint" }, s ? "SOP" : a ? TYPE_META[a.type].label : it.kind === "search" ? "Search" : "Action"));
      return row;
    }) : [el("div", { class: "hint", style: { padding: "14px" } }, "No match.")]));
    list.querySelector(".on")?.scrollIntoView({ block: "nearest" });
  };
  input.addEventListener("input", () => { sel = 0; paint(); });
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); sel = (sel + 1) % Math.max(items.length, 1); paint(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); sel = (sel - 1 + items.length) % Math.max(items.length, 1); paint(); }
    else if (e.key === "Enter") { e.preventDefault(); choose(items[sel]); }
    else if (e.key === "Escape") close();
  });
  const back = el("div", { class: "palette-back", onclick: (e) => { if (e.target === back) close(); } },
    el("div", { class: "palette", role: "dialog", "aria-label": "Quick find" },
      el("div", { class: "palette-input" }, icon("search"), input, el("kbd", {}, "Esc")),
      list,
      el("div", { class: "palette-foot" }, el("span", {}, el("kbd", {}, "↑"), " ", el("kbd", {}, "↓"), " move"), el("span", {}, el("kbd", {}, "Enter"), " open"),
        el("span", { class: "spacer" }), el("span", {}, `${state.lib.sops.length} SOP files · ${state.lib.attachments.length} attachments`))));
  put(root, back);
  paint();
  input.focus();
}

// ---------- utilities ----------

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

// ---------- startup ----------

async function fetchHosted() {
  try {
    const res = await fetch("data/sop-library.json", { cache: "no-store" });
    if (!res.ok || !(res.headers.get("content-type") || "").includes("json")) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function start() {
  applyTheme(store.pref("theme", "system"));
  document.getElementById("theme-btn").addEventListener("click", cycleTheme);
  document.getElementById("search-trigger").addEventListener("click", openPalette);
  if (!/Mac|iPhone|iPad/.test(navigator.platform)) document.getElementById("kbd-hint").textContent = "Ctrl K";
  else document.getElementById("kbd-hint").textContent = "⌘K";
  document.addEventListener("keydown", (e) => {
    if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) { e.preventDefault(); openPalette(); }
    else if (e.key === "/" && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || "") && !document.getElementById("dialog").open) { e.preventDefault(); openPalette(); }
  });
  // Drop a library file anywhere on the page.
  document.addEventListener("dragover", (e) => { if ([...(e.dataTransfer?.types || [])].includes("Files")) e.preventDefault(); });
  document.addEventListener("drop", (e) => {
    if (e.target.closest?.(".dropzone")) return;
    const f = e.dataTransfer?.files?.[0];
    if (f) { e.preventDefault(); importFile(f); }
  });

  let raw = null;
  let origin = "demo";
  try {
    raw = await store.getValue("library");
    origin = (await store.getValue("origin")) || "imported";
  } catch { raw = null; }
  if (!raw || origin === "hosted") {
    const hosted = await fetchHosted();
    if (hosted && Array.isArray(hosted.sops)) {
      if (!raw || raw.generatedAt !== hosted.generatedAt) {
        raw = hosted;
        await store.setValue("library", hosted).catch(() => {});
        await store.setValue("origin", "hosted").catch(() => {});
      }
      origin = "hosted";
    }
  }
  try {
    setLibrary(raw || DEMO_LIBRARY, raw ? origin : "demo");
  } catch (err) {
    console.warn("Stored library could not be read; showing the demo.", err);
    setLibrary(DEMO_LIBRARY, "demo");
  }
  await loadRecords();
  document.getElementById("loading").remove();
  renderRail();
  window.addEventListener("hashchange", route);
  route();

  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}

start();
