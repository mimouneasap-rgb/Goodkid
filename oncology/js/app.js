// App shell: routing, persistent state, drawers, search palette, tooltip, theme,
// language, data import and in-app editing. No sign-in: data lives in the
// artifact's shared workspace when hosted on claude.ai, otherwise in this browser.
import SCHEMA from "./schema.js";
import * as M from "./model.js";
import { openStore, applyEdits } from "./store.js";
import { rowForm, changeLine, tableLabel } from "./editing.js";
import { initI18n, setLang, getLang, t, tv } from "./i18n.js";
import { h, pill, typeTag, fmtDate, fmtNum, fmtPct, defList, dataTable } from "./ui.js";
import { icon } from "./icons.js";
import * as O from "./views-overview.js";
import * as S from "./views-site.js";
import * as Q from "./views-qms.js";
import { dataTables } from "./views-data.js";
import * as QV from "./views-quality.js";
import * as OP from "./views-ops.js";
import * as PE from "./views-people.js";
import { importFiles, COLS, emptyData } from "./importers.js";
import { buildDomains } from "./domain.js";

// ---------- per-viewer preferences (theme, language, filters) ----------
const KEY = "okqa.";
const prefs = {
  get(k, d) { try { const v = localStorage.getItem(KEY + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(KEY + k, JSON.stringify(v)); return true; } catch { return false; } },
  del(k) { try { localStorage.removeItem(KEY + k); } catch { /* ignore */ } },
};

// The workbook data holds confidential records, so it is never committed: a local
// js/workbook-data.js is used when present, otherwise people import the workbook here.
const bundled = await import("./workbook-data.js").then((mod) => mod.default).catch(() => null);
const state = prefs.get("state", {});
initI18n(SCHEMA.tr, prefs.get("lang", "EN"));
setLang(getLang());

let ws = null;          // workspace store (shared database or this browser)
let wsState = { base: null, edits: new Map(), review: null, ready: false };
let data = null;        // imported workbook with in-app edits applied
let model = null;
let me = null, userCap = null, isOwner = false;
const names = new Map(); // user id → display name, resolved on demand

function build() {
  if (!data) return null;
  const built = buildDomains(M.buildModel(data), data, wsState.review);
  document.getElementById("assets-dl")?.remove();
  document.body.append(h("datalist#assets-dl", built.equip.map((e) => h("option", { value: e["Asset no"] }))));
  return built;
}

/** Display name for a stored user id ("you" for this viewer, "this device" in browser mode). */
function who(id) {
  if (!id) return ws?.mode === "local" ? t("this_device") : t("someone");
  if (id === me) return t("you");
  if (names.has(id)) return names.get(id) || t("someone");
  names.set(id, "");
  userCap?.profiles?.([id]).then((ps) => { names.set(id, ps[id]?.name || ""); if (ps[id]?.name) ctx.rerender(); });
  return t("someone");
}

let renderQueued = false;
function onWorkspace(s) {
  wsState = s;
  data = s.base ? applyEdits(withAllTables(s.base), s.edits) : null;
  model = build();
  if (renderQueued) return;
  renderQueued = true;
  queueMicrotask(() => { renderQueued = false; refresh(); });
}
/** Re-render after a data change without stealing focus from someone typing. */
function refresh() {
  const a = document.activeElement;
  if (a && main.contains(a) && /INPUT|TEXTAREA|SELECT/.test(a.tagName)) { main.addEventListener("focusout", () => setTimeout(refresh, 0), { once: true }); return; }
  render({ keepScroll: true });
  refreshDrawer();
}
/** Tables added in later versions start empty in workspaces imported before them. */
function withAllTables(base) {
  const missing = Object.keys(COLS).filter((k) => !base[k]);
  return missing.length ? { ...base, ...Object.fromEntries(missing.map((k) => [k, { cols: COLS[k], rows: [] }])) } : base;
}

// ---------- routes ----------
const NAV = [
  ["nav_overview", [["home", "home", "home"], ["dashboard", "dashboard", "dash_title"], ["review", "review", "mr_title"], ["metrics", "target", "met_title"], ["spc", "spc", "spc_title"]]],
  ["nav_events", [["deviations", "deviation", "nav_dev_t"], ["capa", "capa", "nav_capa_t"], ["cc", "cc", "nav_cc_t"], ["findings", "flag", "nav_find_t"], ["actions", "tasks", "nav_actions_t"], ["records", "records", "qr_title"]]],
  ["nav_product", [["products", "product", "pv_title"], ["lifecycle", "cycle", "lc_title"], ["apqr", "report", "apqr_title"], ["wip", "layers", "wip_title"], ["suppliers", "truck", "sup_title"]]],
  ["nav_ops", [["map", "map", "map_title"], ["rooms", "room", "rx_title"], ["equipment", "equipment", "eq_title"], ["calibration", "thermo", "cal_title"], ["validation", "badge", "val_title"]]],
  ["nav_people", [["training", "cap", "trn_title"], ["fives", "sparkle", "fives_title"], ["activities", "calendar", "qaa_title"], ["sops", "sop", "sop_title"], ["fmea", "fmea", "fm_title"], ["improvements", "improve", "im_title"]]],
  ["nav_gov", [["data", "edit", "dt_title"], ["quality", "quality", "dq_title"]]],
];
const VIEWS = {
  home: O.home, dashboard: O.dashboard, review: O.review, metrics: PE.metricsView, spc: O.spc,
  deviations: QV.deviations, capa: QV.capaView, cc: QV.ccView, findings: QV.findings, actions: QV.actionsView, records: Q.records,
  products: S.products, lifecycle: OP.lifecycle, apqr: OP.apqrView, wip: OP.wipView, suppliers: OP.suppliersView,
  map: S.map, rooms: S.rooms, equipment: S.equipment, calibration: OP.calibration, validation: OP.validation,
  training: PE.trainingView, fives: PE.fivesView, activities: PE.activitiesView, sops: Q.sops, fmea: Q.fmea, improvements: Q.improvements,
  data: dataTables, quality: Q.quality,
};

function parseHash() {
  const [path, qs] = location.hash.replace(/^#\/?/, "").split("?");
  return { route: VIEWS[path] ? path : "home", params: Object.fromEntries(new URLSearchParams(qs ?? "")) };
}
function go(route, params) {
  const qs = params ? new URLSearchParams(Object.entries(params).filter(([, v]) => v != null)).toString() : "";
  const next = `#/${route}${qs ? "?" + qs : ""}`;
  if (location.hash === next) render(); else location.hash = next;
}

// ---------- context passed to views ----------
const ctx = {
  get m() { return model; },
  state,
  params: {},
  go,
  set(k, v) { state[k] = v; prefs.set("state", state); render({ keepScroll: true }); },
  rerender: () => render({ keepScroll: true }),
  // management-review details and decisions, shared through the workspace
  local: {
    get: (k) => wsState.review?.[k] ?? null,
    set: (k, v) => ws.saveReview({ ...(wsState.review ?? {}), [k]: v }).catch((e) => toast(e.message, "warn")),
  },
  get canEdit() { return Boolean(ws?.canWrite); },
  get data() { return data; },
  /** Change some fields of one row (e.g. move an improvement to the next stage). */
  update: async (table, key, patch) => {
    const tbl = data[table];
    const i = tbl.keys.indexOf(key);
    if (i < 0) return;
    const row = [...tbl.rows[i]];
    for (const [c, v] of Object.entries(patch)) row[tbl.cols.indexOf(c)] = v;
    try { await ws.saveRow(table, key, row, me, tbl.importId); toast(t("saved_ok")); } catch (e) { toast(e.message, "warn"); }
  },
  get edits() { return wsState.edits; },
  get workspace() { return { mode: ws?.mode, info: wsState }; },
  who: (id) => who(id),
  edit: (table, key, title) => openEditor(table, key, title),
  add: (table, title) => openEditor(table, null, title),
  /** New row with some fields filled in (e.g. a metric value for a given quarter). */
  addWith: (table, defaults, title) => openEditor(table, null, title, defaults),
  /** Save a row given as {column: value} (key null = new row); other columns are kept. */
  saveObj: (table, key, obj) => saveObj(table, key, obj),
  /** Apply the same change to several rows (e.g. record a calibration group as done). */
  bulkUpdate: async (table, keys, patch) => {
    try { for (const k of keys) await saveObj(table, k, patch, true); toast(t("saved_ok")); } catch (e) { toast(e.message, "warn"); }
  },
  openImport: () => openImport(),
  closeDrawer: () => closeDrawer(),
  open: {
    record: (ref) => openRecord(ref),
    risk: (id) => openRisk(id),
    risks: (title, list) => openList(title, list, "risk"),
    asset: (no) => openAsset(no),
    sop: (code) => openSop(code),
    list: (title, list) => openList(title, list, "record"),
    actions: (title, list) => openActions(title, list),
    action: (ref) => openAction(ref),
    table: (title, table, rows) => openTable(title, table, rows),
    /** A custom form in the drawer (not re-rendered by data refreshes while open). */
    drawer: (content) => { content.editor = true; showDrawer(content); },
  },
};

const newKey = () => `n-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
async function saveObj(table, key, obj, quiet) {
  const tbl = data[table];
  const i = key ? tbl.keys.indexOf(key) : -1;
  const row = i >= 0 ? [...tbl.rows[i]] : tbl.cols.map(() => null);
  for (const [c, v] of Object.entries(obj)) { const j = tbl.cols.indexOf(c); if (j >= 0) row[j] = v; }
  await ws.saveRow(table, i >= 0 ? key : newKey(), row, me, tbl.importId);
  if (!quiet) toast(t("saved_ok"));
}

// ---------- shell ----------
const root = document.getElementById("app");
const main = h("main.main", { id: "main", tabindex: "-1" });
const navEl = h("nav.nav", { "aria-label": "Modules" });
const sidebar = h("aside.sidebar",
  h("a.brand", { href: "#/home" },
    h("span.brand-mark", { html: '<svg viewBox="0 0 32 32" width="30" height="30" aria-hidden="true"><defs><linearGradient id="bm" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6fb6ff"/><stop offset="1" stop-color="#2fd3a8"/></linearGradient></defs><polygon points="16,2 28.1,9 28.1,23 16,30 3.9,23 3.9,9" fill="none" stroke="url(#bm)" stroke-width="2.2"/><polygon points="16,9 22.1,12.5 22.1,19.5 16,23 9.9,19.5 9.9,12.5" fill="url(#bm)" opacity=".9"/></svg>' }),
    h("span.brand-text", h("b", "El Kendi"), h("small", "Oncology QA"))),
  navEl,
  h("div.side-foot", { id: "side-foot" }));
const topbar = h("header.topbar");
const scrim = h("div.scrim", { onclick: () => document.body.classList.remove("nav-open") });
root.replaceChildren(sidebar, scrim, h("div.shell", topbar, main));

function renderNav(route) {
  navEl.replaceChildren(...NAV.map(([group, items]) => h("div.nav-group",
    h("span.nav-title", t(group)),
    items.map(([r, ic, key]) => h("a.nav-link", { href: `#/${r}`, class: r === route ? "active" : "", "aria-current": r === route ? "page" : null, onclick: () => document.body.classList.remove("nav-open") }, icon(ic, 18), h("span", t(key)))))));
  if (!model) { document.getElementById("side-foot").replaceChildren(h("span.side-k", t("data_source")), h("b", "—")); return; }
  const imported = data.meta?.importedAt ? `${t("imported")} ${fmtDate(M.toDay(String(data.meta.importedAt).slice(0, 10)))}` : t("bundled");
  const changes = wsState.edits.size;
  document.getElementById("side-foot").replaceChildren(
    h("span.side-k", t("data_source")),
    h("b.ws-mode", h(`i.${ws.mode}`), ws.mode === "shared" ? t("ws_shared") : t("ws_local")),
    h("small.side-sub", imported),
    h("span.side-k", t("last_refreshed")), h("b", fmtDate(model.asof)),
    ...(changes ? [h("a.side-link", { href: "#/data" }, `${fmtNum(changes)} ${t("changes_in_app")}`)] : []));
}

function renderTopbar() {
  const theme = prefs.get("theme", "system");
  topbar.replaceChildren(
    h("button.icon-btn.menu-btn", { type: "button", "aria-label": "Menu", onclick: () => document.body.classList.toggle("nav-open") }, icon("menu", 20)),
    h("button.search-trigger", { type: "button", onclick: openPalette, "aria-label": t("search_short") }, icon("search", 17), h("span", t("search")), h("kbd", "/")),
    h("div.top-actions",
      h("div.seg.small", { role: "radiogroup", "aria-label": "Language" }, ["EN", "FR"].map((l) => h("button", { type: "button", role: "radio", "aria-checked": String(getLang() === l), class: getLang() === l ? "on" : "", onclick: () => { setLang(l); prefs.set("lang", l); render({ keepScroll: true }); } }, l))),
      h("button.icon-btn", { type: "button", title: `${t("theme")}: ${t(theme)}`, "aria-label": t("theme"), onclick: () => { const next = { system: "light", light: "dark", dark: "system" }[theme]; prefs.set("theme", next); applyTheme(); renderTopbar(); } }, icon(theme === "dark" ? "moon" : theme === "light" ? "sun" : "globe", 18)),
      h("button.btn.primary.compact", { type: "button", onclick: openImport }, icon("upload", 16), h("span.hide-sm", t("update_data")))));
}

function applyTheme() {
  const th = prefs.get("theme", "system");
  if (th === "system") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.dataset.theme = th;
}

function render({ keepScroll } = {}) {
  const { route, params } = parseHash();
  ctx.params = params;
  const y = keepScroll ? window.scrollY : 0;
  renderNav(route);
  renderTopbar();
  document.body.classList.toggle("no-data", !model);
  if (!model) {
    main.replaceChildren(!wsState.ready || wsState.pending ? h("div.view.loading", h("span.spinner"), t("ws_loading")) : welcome());
    document.title = "El Kendi Oncology QA";
    return;
  }
  let view;
  try { view = VIEWS[route](ctx); } catch (e) { console.error(e); view = h("div.view", h("div.banner.warn", icon("alert", 18), String(e.message ?? e))); }
  view.append(h("footer.page-foot", `${t("print_footer")}QA-WB-ONC-001 · ${t("last_refreshed")} ${fmtDate(model.asof)}`));
  main.replaceChildren(view);
  document.title = `${t(NAV.flatMap((g) => g[1]).find((x) => x[0] === route)?.[2] ?? "home")} · El Kendi Oncology QA`;
  window.scrollTo(0, y);
  if (!keepScroll) main.focus({ preventScroll: true });
}
window.addEventListener("hashchange", () => { closeDrawer(); if (palette.open) palette.close(); render(); });

// ---------- drawer ----------
const drawer = h("aside.drawer", { role: "dialog", "aria-modal": "true", "aria-hidden": "true" });
const drawerScrim = h("div.drawer-scrim", { onclick: () => closeDrawer() });
document.body.append(drawerScrim, drawer);
const stack = [];
function refreshDrawer() {
  if (!stack.length || stack.at(-1).editor) return;
  const body = drawer.querySelector(".drawer-body");
  const y = body?.scrollTop ?? 0;
  showDrawer(stack.at(-1), false);
  drawer.querySelector(".drawer-body").scrollTop = y;
}
function showDrawer(content, push = true) {
  if (push) stack.push(content);
  drawer.replaceChildren(
    h("div.drawer-bar",
      stack.length > 1 ? h("button.icon-btn", { type: "button", "aria-label": "Back", onclick: () => { stack.pop(); showDrawer(stack.at(-1), false); } }, h("span.flip", icon("chevron", 18))) : h("span"),
      h("button.icon-btn", { type: "button", "aria-label": t("close"), onclick: closeDrawer }, icon("close", 18))),
    h("div.drawer-body", content()));
  drawer.setAttribute("aria-hidden", "false");
  document.body.classList.add("drawer-open");
  drawer.querySelector(".drawer-body").scrollTop = 0;
}
function closeDrawer() {
  stack.length = 0;
  drawer.setAttribute("aria-hidden", "true");
  document.body.classList.remove("drawer-open");
}
const linkBtn = (label, fn) => h("button.link", { type: "button", onclick: fn }, label);
const editBtn = (table, key, title) => (ws?.canWrite && key ? h("button.btn.compact", { type: "button", onclick: () => openEditor(table, key, title) }, icon("edit", 15), t("edit")) : null);

/** Lists of existing values offered as suggestions in the editor. */
function suggestionLists() {
  const vals = (k) => model.records.map((r) => r[k]).filter(Boolean);
  const y = new Date(model.now).getUTCFullYear();
  return {
    users: [...vals("owner"), ...model.actions.map((a) => a.owner).filter(Boolean)], depts: [...vals("department").filter((d) => !d.startsWith("(")), ...model.records.map((r) => r.raw["Responsible Department"]).filter((x) => x && x !== "-----")],
    locations: model.records.map((r) => r.raw.Location).filter((x) => x && x !== "-----"),
    scopes: vals("scope"), rootcauses: vals("rootCause"), stages: vals("stage"),
    refs: model.records.map((r) => r.ref), rooms: model.rooms.map((r) => r.Code), sops: model.sops.map((s) => s.Code),
    assets: model.equip.map((e) => e["Asset no"]), products: model.products.map((p) => p.Product),
    periods: [y - 1, y, y + 1].flatMap((yy) => [String(yy), ...[1, 2, 3, 4].map((q) => `${yy}-Q${q}`)]),
  };
}

/** Editor for one row of a workbook table (key null = new row). */
function openEditor(table, key, title, defaults) {
  const tbl = data[table];
  if (!tbl) return;
  const index = key ? tbl.keys.indexOf(key) : -1;
  const row = index >= 0 ? tbl.rows[index] : null;
  const content = () => [
    h("div.d-head",
      h("span.d-ref", `${tableLabel(table)}${key ? "" : " · " + t("new_row")}`),
      h("h2", key ? (title || t("edit")) : t("add_row_title", tableLabel(table).toLowerCase()))),
    ws.mode === "shared" ? h("p.fine", t("edit_shared_note")) : h("p.fine", t("edit_local_note")),
    rowForm({
      table, cols: tbl.cols, row, index, allRows: tbl.rows, lists: suggestionLists(), defaults,
      rooms: model.rooms.map((r) => [r.Code, r.Name]),
      onSave: async (values) => {
        const k = key ?? newKey();
        await ws.saveRow(table, k, values, me, tbl.importId);
        toast(t("saved_ok"));
        stack.pop();
        if (stack.length) showDrawer(stack.at(-1), false); else closeDrawer();
      },
      onDelete: key ? async () => {
        await ws.saveRow(table, key, null, me, tbl.importId);
        toast(t("deleted_ok"));
        closeDrawer();
      } : null,
      onCancel: () => { stack.pop(); if (stack.length) showDrawer(stack.at(-1), false); else closeDrawer(); },
    }),
  ];
  content.editor = true;
  showDrawer(content);
}

function openRecord(ref) {
  showDrawer(() => {
    const r = model.recordByRef.get(ref);
    if (!r) return h("p", t("none_found"));
    const children = model.records.filter((x) => x.parentRef === r.ref);
    const parent = r.parentRef ? model.recordByRef.get(r.parentRef) : null;
    const room = model.roomByCode.get(r.roomCode);
    const end = r.closed ?? model.now;
    const span = Math.max(1, (Math.max(end, r.due ?? 0) - (r.opened ?? end)));
    const at = (ts) => `${Math.max(0, Math.min(100, ((ts - r.opened) / span) * 100))}%`;
    const cw = model.prio.find((p) => p.Factor === r.classification)?.Weight ?? 1;
    const rw = model.crit.find((c) => c.Level === room?.Criticality)?.Weight ?? 1;
    return [
      h("div.d-head",
        h("div.d-tags", typeTag(r.type), pill(r.status), r.overdue && r.status === "Open" ? pill("Overdue") : null, r.classification !== "(Not classified)" ? h("span.tag", tv(r.classification)) : null),
        h("div.d-refrow", h("span.d-ref", r.ref), editBtn(r.srcTable, r.srcKey, `${r.ref} · ${r.title}`)),
        h("h2", r.title || "—"),
        changeLine(r.edit, who)),
      r.opened != null ? h("div.d-timeline",
        h("div.tl-bar",
          h("i.tl-fill", { class: r.overdue ? "late" : r.status === "Completed" ? "done" : "", style: { width: at(end) } }),
          r.due != null ? h("i.tl-due", { style: { left: at(r.due) }, title: t("col_due") }) : null),
        h("div.tl-labels",
          h("span", h("small", t("col_opened")), fmtDate(r.opened)),
          r.due != null ? h("span", h("small", t("col_due")), fmtDate(r.due)) : null,
          h("span", h("small", r.closed ? t("s_closed") : t("col_days")), r.closed ? fmtDate(r.closed) : `${fmtNum(r.daysOpen)} ${t("d")}`))) : null,
      r.isOpen ? h("div.d-prio",
        h("div", h("small", t("priority_score")), h("b", fmtNum(r.priority, 1))),
        h("p", `${cw} × ${rw} + ${fmtNum(Math.min(model.prioCap, r.daysLate / 30), 1)} ${t("col_late").toLowerCase()} + ${r.daysToDue != null && r.daysToDue >= 0 && r.daysToDue <= 14 ? model.prioSoon : 0} + ${r.type === "Deviation" ? model.prioDev : 0}`)) : null,
      h("h3", t("details")),
      defList([
        [t("col_stage"), r.stage], [t("col_dept"), tv(r.department)], [t("col_owner"), r.owner], [t("created_by"), r.createdBy],
        [t("col_late"), r.daysLate ? h("b.late", fmtNum(r.daysLate)) : null],
        [t("product"), r.productKey ? linkBtn(r.productKey, () => { closeDrawer(); go("products", { product: r.productKey }); }) : r.product || null],
        [t("col_batch"), r.batch], [t("root_cause"), r.rootCause], [t("scope"), r.scope], [t("source"), r.source],
        [t("eff_check"), r.effCheck], [t("capa_required"), r.capaRequired],
        ["Initial / final class", r.initialClass || r.finalClass ? `${r.initialClass || "—"} → ${r.finalClass || "—"}` : null],
        [t("parent"), r.parentRef ? (parent ? linkBtn(`${parent.ref} · ${parent.title}`, () => openRecord(parent.ref)) : r.parentRef) : null],
        [t("linked"), children.length ? h("div.chips", children.map((c) => linkBtn(c.ref, () => openRecord(c.ref)))) : null],
        [t("col_room"), r.roomCode ? h("span", linkBtn(`${r.roomCode} · ${room?.Name ?? ""}`, () => { closeDrawer(); go("rooms", { room: r.roomCode }); }), " ", h("span.tag", tv(r.roomLink))) : h("span.muted", tv("Missing"))],
        [t("col_asset"), r.assetNo ? linkBtn(r.assetNo, () => openAsset(r.assetNo)) : null],
        [t("folders"), r.folders],
        [t("flags"), r.classFlags.length ? h("span.warn-text", r.classFlags.join(" · ")) : null],
        ["Data quality", r.dataQuality.length ? h("span.warn-text", r.dataQuality.join(" · ")) : null],
        [t("approval"), r.approval || null],
      ]),
      r.actions?.length ? [h("h3", `${t("nav_actions")} · ${fmtNum(r.actions.filter((a) => a.isOpen).length)} ${t("s_open").toLowerCase()} / ${fmtNum(r.actions.length)}`), actionList(r.actions)] : null,
      r.current || r.proposed || r.justification ? [h("h3", t("cc_title")), defList([[t("current_state"), h("p.pre", r.current)], [t("proposed_state"), h("p.pre", r.proposed)], [t("justification"), h("p.pre", r.justification)]])] : null,
      linkForm(r),
      approvalForm(r),
    ];
  });
}

function linkForm(r) {
  return h("details.d-form",
    h("summary", t("confirm_link")),
    h("form", {
      onsubmit: (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const tbl = data.links;
        const at = tbl.rows.findIndex((x) => x[tbl.cols.indexOf("Ref ID")] === r.ref);
        const key = at >= 0 ? tbl.keys[at] : `n-${Date.now().toString(36)}`;
        const row = { "Ref ID": r.ref, "Room code": fd.get("room") || null, "Asset no": fd.get("asset") || null, "Confirmed by": fd.get("by") || null, Date: new Date().toISOString().slice(0, 10), Comment: null };
        ws.saveRow("links", key, tbl.cols.map((c) => row[c] ?? null), me, tbl.importId).then(() => toast(t("saved_ok")), (err) => toast(err.message, "warn"));
      },
    },
    h("label.field", h("span", t("col_room")), h("select", { name: "room" }, [["", "—"], ...model.rooms.map((x) => [x.Code, `${x.Code} · ${x.Name}`])].map(([v, l]) => h("option", { value: v, selected: v === r.roomCode ? true : null }, l)))),
    h("label.field", h("span", t("col_asset")), h("input", { name: "asset", value: r.assetNo, list: "assets-dl" })),
    h("label.field", h("span", t("your_name")), h("input", { name: "by" })),
    h("button.btn.primary", { type: "submit", disabled: ws.canWrite ? null : true }, t("save"))));
}
function approvalForm(r) {
  const log = model.approvals.filter((a) => a.Record === r.ref);
  return h("details.d-form",
    h("summary", t("record_action"), log.length ? h("span.tag", log.length) : null),
    log.length ? h("ul.log", log.map((a) => h("li", h("b", a.Action), ` · ${a.User ?? ""} · ${a["Date/time"] ?? ""}`, a.Comment ? h("p", a.Comment) : null))) : null,
    h("form", {
      onsubmit: (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const row = { "Date/time": new Date().toISOString().slice(0, 16).replace("T", " "), Record: r.ref, Action: fd.get("action"), User: fd.get("user"), Role: fd.get("role"), Comment: fd.get("comment") || null };
        ws.saveRow("appr", `n-${Date.now().toString(36)}`, data.appr.cols.map((c) => row[c] ?? null), me, data.appr.importId).then(() => toast(t("saved_ok")), (err) => toast(err.message, "warn"));
      },
    },
    h("label.field", h("span", t("approval")), h("select", { name: "action" }, ["Submitted", "Approved", "Rejected"].map((a) => h("option", a)))),
    h("label.field", h("span", t("your_name")), h("input", { name: "user", required: true })),
    h("label.field", h("span", t("role")), h("input", { name: "role" })),
    h("label.field", h("span", t("comment")), h("input", { name: "comment" })),
    h("button.btn.primary", { type: "submit", disabled: ws.canWrite ? null : true }, t("save"))));
}

function openRisk(id) {
  showDrawer(() => {
    const f = model.fmea.find((x) => x["Risk ID"] === id);
    if (!f) return h("p", t("none_found"));
    const score = (label, S_, O_, D_, rpn, level) => h("div.score",
      h("small", label),
      h("div.sod", [["S", S_], ["O", O_], ["D", D_]].map(([k, v]) => h("span", h("i", k), h("b", v ?? "—")))),
      h("div.score-r", h("b", fmtNum(rpn)), pill(level, "level")));
    return [
      h("div.d-head", h("div.d-tags", h("span.tag", f["Assessment ref"]), f["Room code"] ? h("span.tag", f["Room code"]) : h("span.tag", t("site_wide"))), h("div.d-refrow", h("span.d-ref", f["Risk ID"]), editBtn("fmea", f.__key, `${f["Risk ID"]} · ${f["Failure mode"] ?? ""}`)), h("h2", f["Failure mode"]), changeLine(f.__edit, who)),
      h("div.scores", score(t("initial"), f.S, f.O, f.D, f.rpn, f.level), h("span.score-arrow", icon("arrow", 20)), score(t("residual"), f.rS, f.rO, f.rD, f.rrpn, f.rlevel)),
      f.reduction != null ? h("p.reduction", `${t("col_rpn")} ↓ `, h("b", fmtPct(f.reduction))) : null,
      defList([
        [t("fm_assess"), f.Assessment], [t("col_step"), f["Process step"]], ["Function / item", f["Function or item"]],
        [t("effect"), f.Effect], [t("cause"), f.Cause], [t("controls"), f["Current controls"]], [t("action"), f.Action],
        [t("col_owner"), f.Owner], [t("col_due"), fmtDate(f.due)], [t("verification"), f.Verification], ["Post-mitigation acceptance", f["Post-mitigation acceptance"]],
        [t("col_room"), f["Room code"] ? linkBtn(`${f["Room code"]} · ${model.roomByCode.get(f["Room code"])?.Name ?? ""}`, () => { closeDrawer(); go("rooms", { room: f["Room code"] }); }) : f["Room link"]],
        ["RPN check", f.rpnCheck.length ? h("span.warn-text", f.rpnCheck.join(" · ")) : null],
        [t("source"), f["Source line"]],
      ]),
    ];
  });
}

function openAsset(no) {
  showDrawer(() => {
    const e = model.equip.find((x) => x["Asset no"] === no);
    if (!e) return h("p", t("none_found"));
    const recs = model.records.filter((r) => r.assetNo === no);
    return [
      h("div.d-head", h("div.d-tags", h("span.tag", e.Register), pill(e.calStatus, "cal"), e["GMP critical"] === "Y" ? h("span.tag", "GMP") : null), h("div.d-refrow", h("span.d-ref", e["Asset no"]), editBtn("equip", e.__key, `${e["Asset no"]} · ${e.Description ?? ""}`)), h("h2", e.Description), changeLine(e.__edit, who)),
      defList([
        [t("col_cat"), e.Category], [t("model"), e.Model], [t("serial"), e.Serial], [t("manufacturer"), e.Manufacturer],
        [t("col_room"), e["Room code"] ? linkBtn(`${e["Room code"]} · ${model.roomByCode.get(e["Room code"])?.Name ?? ""}`, () => { closeDrawer(); go("rooms", { room: e["Room code"] }); }) : null],
        ["Room (as registered)", e["Room (as registered)"]], [t("col_parent"), e["Parent asset"]], [t("col_qual"), e["Qualification status"]],
        ["Calibration frequency", e.freq != null ? `${e.freq} months` : null], ["Last calibration", fmtDate(e.last)], [t("col_next"), fmtDate(e.next)],
        [t("comments"), e.Comments], [t("known_issues"), e["Known issues"]], ["Field status", e["Field status"]],
        ["Data quality", e.dataQuality.length ? h("span.warn-text", e.dataQuality.join(" · ")) : null],
      ]),
      recs.length ? [h("h3", t("rx_k_qr")), recList(recs)] : null,
    ];
  });
}

function openSop(code) {
  showDrawer(() => {
    const s = model.sops.find((x) => x.Code === code);
    if (!s) return h("p", t("none_found"));
    return [
      h("div.d-head", h("div.d-tags", h("span.tag", s.Type), h("span.tag", tv(s.reviewStatus))), h("div.d-refrow", h("span.d-ref", s.Code), editBtn("sop", s.__key, `${s.Code} · ${s.Title ?? ""}`)), h("h2", s.Title), changeLine(s.__edit, who)),
      defList([[t("col_dept"), s.Department], ["Site", s.Site], ["Language", s.Language], [t("col_status"), s.Status], [t("col_rev"), s.Revision],
        ["Effective date", fmtDate(M.toDay(s["Effective date"]))], [t("col_nextrev"), fmtDate(s.next)], [t("col_owner"), s.Owner],
        ["Linked rooms", s["Linked rooms"]], ["Linked equipment", s["Linked equipment"]], [t("source"), s.Source],
        ["Data quality", s.dataQuality.length ? h("span.warn-text", s.dataQuality.join(" · ")) : null]]),
    ];
  });
}

const recList = (list) => h("div.d-list", list.map((r) => h("button.d-item", { type: "button", onclick: () => openRecord(r.ref) },
  typeTag(r.type), h("span.d-item-t", h("b", r.ref), h("span", r.title)), pill(r.overdue && r.status === "Open" ? "Overdue" : r.status))));

function openList(title, list, kind) {
  showDrawer(() => [
    h("div.d-head", h("span.d-ref", `${fmtNum(list.length)} ${t("rows")}`), h("h2", title)),
    kind === "risk"
      ? dataTable(S.fmeaCols().slice(0, 5).concat(S.fmeaCols().slice(7)), list, { pageSize: 30, onRow: (f) => openRisk(f["Risk ID"]) })
      : dataTable(O.recordCols(["ref", "type", "status", "due", "title"]), list, { pageSize: 30, onRow: (r) => openRecord(r.ref), searchText: O.recordSearch, exportName: "records" }),
  ]);
}

const actionList = (list) => h("div.d-list", list.map((a) => h("button.d-item", { type: "button", onclick: () => openAction(a.ref) },
  h("span.type-tag", { style: { "--dot": "var(--c4)" } }, "ACT"), h("span.d-item-t", h("b", a.ref), h("span", a.title)), pill(a.overdue && a.isOpen ? "Overdue" : a.status))));

function openActions(title, list) {
  showDrawer(() => [
    h("div.d-head", h("span.d-ref", `${fmtNum(list.length)} ${t("rows")}`), h("h2", title)),
    dataTable(QV.actionCols(), list, { pageSize: 30, onRow: (a) => openAction(a.ref), searchText: (a) => `${a.ref} ${a.title} ${a.parentRef} ${a.owner}`, exportName: "actions" }),
  ]);
}

function openAction(ref) {
  showDrawer(() => {
    const a = model.actions.find((x) => x.ref === ref);
    if (!a) return h("p", t("none_found"));
    const parent = a.parentRef ? model.recordByRef.get(a.parentRef) : null;
    const siblings = a.parentRef ? model.actions.filter((x) => x.parentRef === a.parentRef && x.ref !== a.ref) : [];
    return [
      h("div.d-head",
        h("div.d-tags", h("span.type-tag", { style: { "--dot": "var(--c4)" } }, "ACT"), pill(a.overdue && a.isOpen ? "Overdue" : a.status), a.tags ? h("span.tag", a.tags) : null),
        h("div.d-refrow", h("span.d-ref", a.ref), editBtn("actions", a.__key, `${a.ref} · ${a.title}`)),
        h("h2", a.title || "—"),
        changeLine(a.__edit, who)),
      a.description ? h("p.pre", a.description) : null,
      defList([
        [t("col_stage"), a.stage], [t("col_dept"), tv(a.department)], [t("col_owner"), a.owner],
        [t("col_opened"), fmtDate(a.opened)], [t("col_due"), fmtDate(a.due)], [t("s_closed"), fmtDate(a.closed)],
        [t("col_late"), a.daysLate ? h("b.late", fmtNum(a.daysLate)) : null], [t("ttc_lbl"), a.daysToClose != null ? `${fmtNum(a.daysToClose)} ${t("d")}` : null],
        [t("parent"), a.parentRef ? (parent ? linkBtn(`${parent.ref} · ${parent.title}`, () => openRecord(parent.ref)) : `${a.parentRef}${a.parentTitle ? " · " + a.parentTitle : ""}`) : t("standalone")],
        [t("col_type"), a.parentType || a.type], [t("source"), a.origin],
      ]),
      siblings.length ? [h("h3", t("sibling_actions")), actionList(siblings)] : null,
    ];
  });
}

// Columns shown when a list of rows from one of the operational tables opens in the drawer.
const DRAWER_COLS = {
  calplan: ["Item", "Description", "location", "start:date", "done:date", "status"],
  validation: ["Task ID", "Task", "Scope", "start:month", "done:date", "status"],
  training: ["Training ID", "Program", "Type", "planned:month", "done:date", "status"],
  wip: ["Product", "Batch", "Next step", "Status", "qty:num", "tf:date"],
  rejections: ["Report no", "Product", "Batch", "kind", "Status", "qty:num"],
  batches: ["Batch no", "productKey", "Batch type", "mfg:date", "stage", "release:date"],
  fives: ["Audit ID", "week", "Area", "Auditor", "total:pct", "Action status"],
  suppliers: ["API", "Manufacturer", "Finished product", "auditStatus"],
  apqr: ["Product", "Period", "due:date", "status"],
};
const DRAWER_LABEL = { location: "col_room", start: "planned_lbl", planned: "planned_lbl", done: "completed_on", status: "col_status", tf: "hold_limit", kind: "col_type", productKey: "product", mfg: "mfg_lbl", stage: "stage", release: "released_lbl", week: "week_lbl", total: "score_lbl", auditStatus: "audit_lbl", due: "col_due", qty: "qty_lbl" };
function openTable(title, table, rows) {
  const cols = (DRAWER_COLS[table] ?? Object.keys(rows[0] ?? {}).filter((k) => !k.startsWith("__")).slice(0, 6)).map((spec) => {
    const [key, kind] = spec.split(":");
    const render = kind === "date" ? (r) => fmtDate(r[key]) : kind === "month" ? (r) => (r[key] != null ? fmtDate(r[key]).slice(3) : "—") : kind === "pct" ? (r) => fmtPct(r[key]) : kind === "num" ? (r) => fmtNum(r[key], 2) : key === "status" || key === "stage" || key === "auditStatus" ? (r) => tv(r[key]) : null;
    return { key, label: DRAWER_LABEL[key] ? t(DRAWER_LABEL[key]) : key, cls: kind ? "num nowrap" : /ID|no$|Item|Batch/.test(key) ? "mono nowrap" : "wrap", render };
  });
  showDrawer(() => [
    h("div.d-head", h("span.d-ref", `${tableLabel(table)} · ${fmtNum(rows.length)} ${t("rows")}`), h("h2", title)),
    dataTable(cols, rows, { pageSize: 30, onRow: ws.canWrite ? (r) => openEditor(table, r.__key, title) : null, exportName: table }),
  ]);
}

// ---------- search palette ----------
const palette = h("dialog.palette", { "aria-label": t("search_short") });
document.body.append(palette);
function openPalette() {
  if (!model) { openImport(); return; }
  const input = h("input.palette-input", { type: "search", placeholder: t("search"), autocomplete: "off", "aria-label": t("search_short") });
  const results = h("div.palette-results", { role: "listbox" });
  let items = [], sel = 0;
  const viewsList = NAV.flatMap((g) => g[1]).map(([r, ic, key]) => ({ group: t("modules"), label: t(key), sub: "", icon: ic, act: () => go(r) }));
  function search(q) {
    q = q.trim().toLowerCase();
    const m = (s) => String(s ?? "").toLowerCase().includes(q);
    const out = [];
    const add = (group, list, n) => out.push(...list.slice(0, n).map((x) => ({ group, ...x })));
    if (!q) { add(t("modules"), viewsList, 15); return out; }
    add(t("modules"), viewsList.filter((v) => m(v.label)), 4);
    add(t("qr_title"), model.records.filter((r) => m(r.ref) || m(r.title) || m(r.owner)).map((r) => ({ label: `${r.ref} · ${r.title}`, sub: `${tv(r.type)} · ${tv(r.status)}`, icon: "records", act: () => openRecord(r.ref) })), 8);
    add(t("n_rooms"), model.rooms.filter((r) => m(r.Code) || m(r.Name)).map((r) => ({ label: `${r.Code} · ${r.Name}`, sub: r.Area, icon: "room", act: () => go("rooms", { room: r.Code }) })), 5);
    add(t("n_eq"), model.equip.filter((e) => m(e["Asset no"]) || m(e.Description) || m(e.Serial)).map((e) => ({ label: `${e["Asset no"]} · ${e.Description}`, sub: e["Room code"] ?? "", icon: "equipment", act: () => openAsset(e["Asset no"]) })), 5);
    add(t("n_fm"), model.fmea.filter((f) => m(f["Risk ID"]) || m(f["Failure mode"]) || m(f["Process step"])).map((f) => ({ label: `${f["Risk ID"]} · ${f["Failure mode"]}`, sub: `RPN ${f.rpn ?? "—"}`, icon: "fmea", act: () => openRisk(f["Risk ID"]) })), 5);
    add(t("n_sop"), model.sops.filter((s) => m(s.Code) || m(s.Title)).map((s) => ({ label: `${s.Code} · ${s.Title}`, sub: s.Department ?? "", icon: "sop", act: () => openSop(s.Code) })), 5);
    add(t("nav_actions"), model.actions.filter((a) => m(a.ref) || m(a.title) || m(a.parentRef)).map((a) => ({ label: `${a.ref} · ${a.title}`, sub: `${a.parentRef || t("standalone")} · ${tv(a.status)}`, icon: "tasks", act: () => openAction(a.ref) })), 5);
    add(t("batches_lbl"), model.x.batches.filter((b) => m(b["Batch no"]) || m(b.Product)).map((b) => ({ label: `${b["Batch no"]} · ${b.Product}`, sub: tv(b.stage), icon: "cycle", act: () => go("lifecycle") })), 4);
    add(t("trn_title"), model.x.training.filter((x) => m(x["Training ID"]) || m(x.Program) || m(x.Reference)).map((x) => ({ label: `${x["Training ID"] ?? ""} · ${x.Program}`, sub: tv(x.status), icon: "cap", act: () => go("training") })), 4);
    add(t("qaa_title"), model.x.qaact.filter((a) => m(a.id) || m(a.activity) || m(a.reference)).map((a) => ({ label: `${a.id} · ${a.activity}`, sub: a.reference, icon: "calendar", act: () => go("activities") })), 4);
    const prods = [...new Set(model.products.map((p) => p.Product))];
    add(t("pv_title"), model.products.filter((p) => m(p.Product) || m(p.API)).filter((p, i, a) => a.findIndex((x) => x.Product === p.Product) === i).map((p) => ({ label: p.Product, sub: p.API ?? "", icon: "product", act: () => go("products", { product: p.Product }) })), prods.length);
    return out;
  }
  function draw() {
    items = search(input.value);
    sel = Math.min(sel, Math.max(0, items.length - 1));
    let g = null;
    results.replaceChildren(...(items.length ? items.flatMap((it, i) => [
      it.group !== g ? ((g = it.group), h("div.palette-group", it.group)) : null,
      h("button.palette-item", { type: "button", role: "option", "aria-selected": String(i === sel), class: i === sel ? "on" : "", onclick: () => choose(i), onmousemove: () => { if (sel !== i) { sel = i; mark(); } } },
        icon(it.icon, 16), h("span.pi-l", it.label), h("span.pi-s", it.sub)),
    ].filter(Boolean)) : [h("div.empty", t("no_results"))]));
  }
  function mark() { results.querySelectorAll(".palette-item").forEach((el, i) => { el.classList.toggle("on", i === sel); el.setAttribute("aria-selected", String(i === sel)); }); results.querySelector(".palette-item.on")?.scrollIntoView({ block: "nearest" }); }
  function choose(i) { const it = items[i]; if (!it) return; palette.close(); it.act(); }
  input.addEventListener("input", () => { sel = 0; draw(); });
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { sel = Math.min(items.length - 1, sel + 1); mark(); e.preventDefault(); }
    else if (e.key === "ArrowUp") { sel = Math.max(0, sel - 1); mark(); e.preventDefault(); }
    else if (e.key === "Enter") { choose(sel); e.preventDefault(); }
    else if (e.key === "Escape") { palette.close(); e.preventDefault(); }
  });
  palette.replaceChildren(h("div.palette-head", icon("search", 18), input, h("kbd", "esc")), results);
  palette.onclick = (e) => { if (e.target === palette) palette.close(); };
  draw();
  palette.showModal();
  input.focus();
}

document.addEventListener("keydown", (e) => {
  const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName ?? "");
  if ((e.key === "/" && !typing) || (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey))) { e.preventDefault(); openPalette(); }
  else if (e.key === "Escape" && document.body.classList.contains("drawer-open") && !palette.open) closeDrawer();
});

// ---------- tooltip ----------
const tipEl = h("div.tip", { role: "tooltip" });
document.body.append(tipEl);
let tipTarget = null;
document.addEventListener("pointerover", (e) => {
  const el = e.target.closest?.("[data-tip]");
  if (el === tipTarget) return;
  tipTarget = el;
  if (!el) { tipEl.classList.remove("show"); return; }
  tipEl.innerHTML = el.getAttribute("data-tip");
  tipEl.classList.add("show");
  for (const n of document.querySelectorAll(".hover")) n.classList.remove("hover");
  el.classList.add("hover");
});
document.addEventListener("pointermove", (e) => {
  if (!tipTarget) return;
  const pad = 14, r = tipEl.getBoundingClientRect();
  let x = e.clientX + pad, y = e.clientY + pad;
  if (x + r.width > innerWidth - 8) x = e.clientX - r.width - pad;
  if (y + r.height > innerHeight - 8) y = e.clientY - r.height - pad;
  tipEl.style.transform = `translate(${Math.max(8, x)}px, ${Math.max(8, y)}px)`;
});
document.addEventListener("pointerout", (e) => { if (tipTarget && !e.relatedTarget?.closest?.("[data-tip]")) { tipTarget.classList.remove("hover"); tipTarget = null; tipEl.classList.remove("show"); } });
document.addEventListener("scroll", () => { tipTarget = null; tipEl.classList.remove("show"); }, true);

// ---------- toast ----------
function toast(msg, kind = "ok") {
  const el = h(`div.toast.${kind}`, icon(kind === "ok" ? "check" : "alert", 16), msg);
  document.body.append(el);
  requestAnimationFrame(() => el.classList.add("show"));
  setTimeout(() => { el.classList.remove("show"); setTimeout(() => el.remove(), 400); }, 2600);
}

// ---------- import ----------
/** Drop zone + status line that load workbooks, exports and controlled Word forms into the app. */
function dropZone(onDone) {
  const input = h("input", { type: "file", accept: ".xlsx,.xlsm,.docx", multiple: true, hidden: true, onchange: (e) => handleFiles([...e.target.files]) });
  const drop = h("button.dropzone", { type: "button", onclick: () => input.click() }, icon("upload", 28), h("b", t("import_drop")), h("small", t("import_kinds")));
  drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("over"));
  drop.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("over"); handleFiles([...e.dataTransfer.files]); });
  const status = h("div.import-status");
  async function handleFiles(files) {
    if (!files.length) return;
    status.replaceChildren(h("span.spinner"), " …");
    try {
      // imports replace the imported tables (not the edited view of them); edits to replaced tables are dropped
      const { next, replaced, done } = await importFiles(files, wsState.base, { needMaster: wsState.base?.rooms?.rows?.length ? null : t("need_master") });
      const report = h("ul", done.map(([name, msg]) => h("li", { class: msg.startsWith("✘") ? "warn-text" : "" }, h("b", name), " · ", msg)));
      if (!replaced.length) { status.replaceChildren(h("div.warn-text", t("import_nothing")), report); return; }
      next.meta = { ...next.meta, importedAt: new Date().toISOString() };
      await ws.importBase(next, replaced, (n, total) => status.replaceChildren(h("span.spinner"), ` ${t("ws_saving")} ${n}/${total}`));
      status.replaceChildren(h("div.ok-line", icon("check", 16), t("import_done")), report);
      toast(t("import_done"));
      onDone?.(done.some(([, msg]) => msg.startsWith("✘")));
    } catch (err) {
      console.error(err);
      status.replaceChildren(h("div.warn-text", `${t("import_fail")}: ${err.message ?? err}`));
    }
  }
  return [drop, input, status];
}

function welcome() {
  return h("div.view.welcome",
    h("section.hero.hero-welcome",
      h("div.hero-art", { "aria-hidden": "true", html: O.heroArt() }),
      h("div.hero-text",
        h("span.eyebrow", "El Kendi · Oncology · ICH Q10"),
        h("h1", t("home_title")),
        h("p", t("home_sub")),
        h("p.welcome-lead", ws.canWrite ? t("welcome_lead") : t("welcome_readonly"))),
      ws.canWrite ? h("div.welcome-drop",
        dropZone(),
        ws.localData() ? h("button.btn.glass", { type: "button", onclick: (e) => useDeviceData(e.currentTarget) }, icon("upload", 16), t("use_device_data")) : null,
        h("p.welcome-privacy", icon("quality", 16), ws.mode === "shared" ? t("welcome_privacy_shared") : t("welcome_privacy"))) : null),
    h("div.welcome-grid", [["dashboard", "dash_title", "m_dash"], ["deviation", "nav_dev_t", "m_dev"], ["target", "met_title", "m_met"], ["cap", "trn_title", "m_trn"], ["cycle", "lc_title", "m_lc"], ["sparkle", "fives_title", "m_5s"]]
      .map(([ic, title, desc], i) => h("div.module.static", { style: { "--i": i } }, h("span.module-ico", icon(ic, 22)), h("span.module-t", t(title)), h("span.module-d", t(desc))))));
}

/** Move a workbook loaded by the earlier, device-only version into the shared workspace. */
async function useDeviceData(btn) {
  btn.disabled = true;
  try {
    const local = ws.localData();
    const next = { ...local, meta: { ...local.meta, importedAt: new Date().toISOString() } };
    delete next.tr;
    await ws.importBase(next, Object.keys(COLS).filter((k) => next[k]), (n, total) => { btn.textContent = `${t("ws_saving")} ${n}/${total}`; });
    toast(t("import_done"));
  } catch (err) { toast(err.message, "warn"); btn.disabled = false; }
}

const importDlg = h("dialog.modal");
document.body.append(importDlg);
function openImport() {
  if (!ws) return;
  importDlg.replaceChildren(
    h("div.modal-head", h("h2", t("import_title")), h("button.icon-btn", { type: "button", "aria-label": t("close"), onclick: () => importDlg.close() }, icon("close", 18))),
    h("p", t("import_body")),
    h("ul.import-kinds", ["imp_k1", "imp_k2", "imp_k3", "imp_k4", "imp_k5"].map((k) => h("li", t(k)))),
    wsState.edits.size ? h("p.banner.info", icon("alert", 16), t("import_replaces_edits", fmtNum(wsState.edits.size))) : null,
    ...(ws.canWrite ? dropZone((failed) => { if (!failed) setTimeout(() => importDlg.close(), 1400); }) : [h("p.warn-text", t("welcome_readonly"))]),
    h("div.modal-foot", clearButton(), h("span")));
  importDlg.onclick = (e) => { if (e.target === importDlg) importDlg.close(); };
  importDlg.showModal();
}

/** Remove all data (two clicks). In the shared workspace only the owner sees it. */
function clearButton() {
  if (!wsState.base || !ws.canWrite || (ws.mode === "shared" && !isOwner)) return h("span");
  let armed = false;
  const btn = h("button.btn.ghost.danger-text", {
    type: "button",
    onclick: async () => {
      if (!armed) { armed = true; btn.textContent = t("clear_confirm"); setTimeout(() => { armed = false; btn.textContent = t("clear_data"); }, 4000); return; }
      btn.disabled = true;
      try { await ws.clear(); importDlg.close(); toast(t("cleared")); } catch (err) { toast(err.message, "warn"); btn.disabled = false; }
    },
  }, ws.mode === "shared" ? t("clear_data") : t("clear_data"));
  return btn;
}

applyTheme();
render(); // loading state until the workspace answers
({ store: ws, user: userCap, me } = await openStore(bundled));
isOwner = ws.mode === "shared" ? Boolean(await userCap?.isOwner?.()) : true;
ws.onChange(onWorkspace);
