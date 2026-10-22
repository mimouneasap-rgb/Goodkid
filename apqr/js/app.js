// App shell: navigation, routing, top bar, command palette, task editor and
// the shared context every view renders from.

import { el, $, $$, icon, iconSvg, fmtDate, debounce, relativeTime, platform } from "./dom.js";
import { createStore } from "./store.js";
import { connectShared } from "./sync.js";
import {
  deriveProgramme, programmeKpis, todayIso, TASK_STAGES, TASK_STATUSES, DEPT_IDS, UNASSIGNED, matchesQuery,
  shortProduct, nextTaskId, planBucket, nowStamp,
} from "./model.js";
import { toast, installTooltips, modal, confirmDialog, select, mountCharts } from "./ui.js";
import * as overview from "./views/overview.js";
import * as plan from "./views/plan.js";
import * as workflows from "./views/workflows.js";
import * as tasks from "./views/tasks.js";
import * as people from "./views/people.js";
import * as product from "./views/product.js";
import * as stats from "./views/statistics.js";
import * as sop from "./views/sop.js";
import * as data from "./views/data.js";

const THEME_KEY = "goodkid.apqr.theme";

const VIEWS = { overview, plan, workflows, tasks, people, product, stats, sop, data };
const NAV = [
  ["Programme", [["overview", "Overview", "overview"], ["plan", "Annual plan", "plan"], ["workflows", "Workflows", "workflow"], ["tasks", "Tasks", "tasks"], ["people", "People", "people"]]],
  ["Quality", [["stats", "Statistics lab", "stats"], ["sop", "SOP guide", "sop"]]],
  ["Workspace", [["data", "Data & settings", "data"]]],
];

// Running as a published claude.ai page: data is shared through the page's
// database when available, and the frame refuses printing and plain downloads.
const HOSTED = typeof window.claude?.use === "function" || window.self !== window.top;

const store = createStore({ shared: HOSTED });
platform.hosted = HOSTED;
platform.notify = (m) => toast(m);
const ui = {}; // per-view UI state (filters, sort, tabs), kept for the session
let derived = null;
let kpis = null;
let saveState = "saved";
// Shared workspace status: null (local app) or { state, canWrite, error }.
let shared = HOSTED ? { state: "connecting", canWrite: true } : null;
let sharedApi = null;
let names = new Map();

const ctx = {
  store,
  ui,
  get state() { return store.state; },
  get d() { return derived; },
  get k() { return kpis; },
  get asOf() { return derived.asOf; },
  route: { view: "overview", param: "", query: new URLSearchParams() },
  go,
  refresh: render,
  toast,
  confirm: confirmDialog,
  modal,
  openTask,
  newTask,
  openProduct: (id) => go(`product/${encodeURIComponent(id)}`),
  undoToast,
  hosted: HOSTED,
  canPrint: !HOSTED,
  get shared() { return shared; },
  get sharedApi() { return sharedApi; },
  nameOf: (entry) => entry.by || names.get(entry.uid) || "Someone",
  get users() {
    return [...new Set(store.state.tasks.map((t) => t.user).filter((u) => u && u !== UNASSIGNED))].sort((a, b) => a.localeCompare(b));
  },
};

function recompute() {
  derived = deriveProgramme(store.state);
  kpis = programmeKpis(derived.products, derived.tasks, derived.asOf);
}

// ---------- routing ----------

// Routes look like "plan", "tasks?user=X" or "product/TB040P02". Navigation is
// handled in the page, and mirrored to the address bar only in the standalone app.

function parseRoute(raw) {
  const [path, qs = ""] = String(raw || "").replace(/^#\/?/, "").split("?");
  const [view, ...rest] = path.split("/");
  return { view: VIEWS[view] ? view : "overview", param: decodeURIComponent(rest.join("/")), query: new URLSearchParams(qs) };
}

function go(path) {
  ctx.route = parseRoute(path);
  if (!HOSTED && location.hash !== `#/${path}`) history.pushState(null, "", `#/${path}`);
  document.body.classList.remove("nav-open");
  render({ scroll: true });
}

document.addEventListener("click", (e) => {
  const a = e.target.closest?.('a[href^="#/"]');
  if (!a || e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  go(a.getAttribute("href").slice(2));
});

window.addEventListener("popstate", () => {
  ctx.route = parseRoute(location.hash);
  render({ scroll: true });
});

// ---------- theme ----------

function currentTheme() {
  return document.documentElement.dataset.theme || "system";
}

function setTheme(t) {
  if (t === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
  try { t === "system" ? localStorage.removeItem(THEME_KEY) : localStorage.setItem(THEME_KEY, t); } catch { /* ignore */ }
  renderRail();
}

// ---------- shell ----------

function renderRail() {
  const k = kpis;
  const total = Math.max(1, k.planned);
  const bucketCount = (b) => derived.products.filter((p) => p.planNo && planBucket(p) === b).length;
  const rail = $("#rail");
  rail.replaceChildren(
    el("a", { class: "brand", href: "#/overview", "aria-label": "APQR Command Center home", style: { color: "inherit", textDecoration: "none" } },
      el("span", { class: "brand-mark", html: iconSvg("shield") }),
      el("span", {}, el("div", { class: "brand-name" }, "APQR"), el("div", { class: "brand-sub" }, "Command Center"))),
    el("div", { class: "programme" },
      el("div", { class: "programme-title" }, store.state.meta.programme),
      el("div", { class: "programme-meta" }, `${store.state.meta.site} · ${store.state.meta.planTemplate} · ${store.state.meta.scigeniqPlan}`),
      el("div", { class: "programme-bar", "data-tip": `Plan progress\n${bucketCount("closed")} closed\n${bucketCount("live") + bucketCount("late")} in workflow\n${bucketCount("pastdue")} past due, not triggered\n${bucketCount("waiting")} waiting` },
        [["closed", "#22c55e"], ["live", "#60a5fa"], ["late", "#fbbf24"], ["pastdue", "#f87171"]].map(([b, c]) =>
          el("span", { style: { width: `${(bucketCount(b) / total) * 100}%`, background: c } })))),
    el("nav", { class: "nav" }, NAV.map(([group, items]) => [
      el("div", { class: "nav-label" }, group),
      items.map(([id, label, ic]) => {
        const badge = id === "tasks" && k.overdue ? el("span", { class: "badge alert", title: "Overdue tasks" }, k.overdue)
          : id === "workflows" ? el("span", { class: "badge" }, k.triggered)
            : id === "plan" ? el("span", { class: "badge" }, k.planned) : null;
        const current = ctx.route.view === id || (id === "plan" && ctx.route.view === "product");
        return el("a", { href: `#/${id}`, "aria-current": current ? "page" : null }, icon(ic), label, badge);
      }),
    ])),
    el("div", { class: "rail-foot" },
      el("div", { class: "theme-switch", role: "group", "aria-label": "Theme" },
        [["light", "sun", "Light"], ["system", "monitor", "Auto"], ["dark", "moon", "Dark"]].map(([t, ic, l]) =>
          el("button", { type: "button", "aria-pressed": String(currentTheme() === t), onclick: () => setTheme(t), title: `${l} theme` }, icon(ic, "sm"), l))),
      el("div", { class: "rail-doc" },
        el("strong", {}, "SOPQA0021E"), " Rev. 16 · Product Quality Review", el("br"),
        el("strong", {}, "SOPQA0152E"), "-01 · Scigeniq APQR module")),
  );
}

function renderTopbar(view) {
  const live = store.state.settings.asOfMode === "today";
  const crumbs = view.crumbs?.(ctx) || null;
  $("#topbar").replaceChildren(
    el("button", { class: "btn ghost icon-only mobile-bar", type: "button", "aria-label": "Open menu", onclick: () => document.body.classList.add("nav-open") }, icon("menu")),
    el("div", { class: "topbar-title" },
      crumbs ? el("div", { class: "crumbs" }, crumbs) : null,
      el("h1", { class: "page-title" }, view.title(ctx))),
    el("div", { class: "topbar-actions" },
      el("button", { class: "search-btn", type: "button", onclick: openPalette, "aria-label": "Search products, workflows and people" },
        icon("search", "sm"), el("span", { class: "label" }, "Search products, refs, people…"), el("kbd", {}, "Ctrl K")),
      el("button", { class: `asof ${live ? "live" : ""}`, type: "button", onclick: asOfDialog, "data-tip": live ? "Status calculated against today's date" : "Status calculated against the data snapshot date. Click to change." },
        el("span", { class: "dot" }), el("span", { class: "label" }, live ? "Live · " : "As of "), fmtDate(derived.asOf)),
      el("button", { class: "btn ghost icon-only", type: "button", "aria-label": store.canUndo ? `Undo ${store.lastUndo}` : "Nothing to undo", "data-tip": store.canUndo ? `Undo: ${store.lastUndo}` : "Nothing to undo", disabled: !store.canUndo, onclick: doUndo }, icon("undo")),
      saveBadge()),
  );
}

function saveBadge() {
  const [cls, ic, label, tip] = !shared
    ? saveState === "error"
      ? ["error", "alert", "Not saved", "Browser storage is full or blocked. Export a backup from Data & settings."]
      : ["", "checkCircle", "Saved", "Changes are saved in this browser"]
    : {
      connecting: ["", "clock", "Connecting…", "Opening the shared workspace"],
      live: ["live", "people", "Shared · live", "Everyone with access sees the same data. Changes save as you make them."],
      empty: ["", "data", "Not set up", "The shared workspace has no data yet"],
      readonly: ["", "shield", "View only", shared.error || "You can look but not change data on this page"],
      error: ["error", "alert", "Not saved", shared.error || "A change could not be saved"],
      local: ["", "checkCircle", "Saved", "Changes are saved in this browser"],
    }[shared.state] || ["", "checkCircle", "Saved", ""];
  return el("span", { class: `save-state ${cls}`, "data-tip": tip }, icon(ic, "sm"), label);
}

function renderTabbar() {
  const items = [["overview", "Overview", "overview"], ["plan", "Plan", "plan"], ["workflows", "Workflows", "workflow"], ["tasks", "Tasks", "tasks"]];
  $("#tabbar").replaceChildren(
    ...items.map(([id, l, ic]) => el("a", { href: `#/${id}`, "aria-current": ctx.route.view === id ? "page" : null }, icon(ic), l)),
    el("button", { type: "button", onclick: () => document.body.classList.add("nav-open") }, icon("more"), "More"),
  );
}

let lastView = null;
let deferred = false;

/** True while someone is typing in the page or a dialog is open: live updates wait. */
function busy() {
  const a = document.activeElement;
  return Boolean(document.querySelector("dialog[open]")) || Boolean(a && a.closest?.("#content") && a.matches?.("input:not([type=checkbox]):not([type=radio]), textarea, select"));
}

function flushDeferred() {
  if (deferred && !busy()) { deferred = false; render(); }
}
document.addEventListener("focusout", () => setTimeout(flushDeferred, 0));
document.addEventListener("close", () => setTimeout(flushDeferred, 0), true);

function render({ scroll = false } = {}) {
  recompute();
  const view = VIEWS[ctx.route.view];
  const content = $("#content");
  const keepScroll = !scroll && lastView === ctx.route.view + ctx.route.param ? window.scrollY : 0;
  renderRail();
  renderTopbar(view);
  renderTabbar();
  content.replaceChildren(sharedBanner(), view.render(ctx));
  mountCharts(content);
  document.title = `${view.title(ctx)} · APQR Command Center`;
  if (scroll || lastView !== ctx.route.view + ctx.route.param) {
    window.scrollTo(0, 0);
  } else {
    window.scrollTo(0, keepScroll);
  }
  lastView = ctx.route.view + ctx.route.param;
}

function sharedBanner() {
  if (!shared || !(shared.state === "empty" || shared.state === "error" || shared.state === "readonly")) return "";
  if (shared.state === "empty") {
    return el("div", { class: "callout info no-print", style: { marginBottom: "18px", alignItems: "center" } }, icon("data"),
      el("span", { style: { flex: 1 } }, el("strong", {}, "The shared workspace is empty. "),
        shared.canWrite ? "Load the 2026 plan and the Scigeniq export into it so everyone with access works on the same data. Until then you are looking at the source data, and changes stay in this browser."
          : "The owner has not loaded the data yet. You are looking at the source data."),
      shared.canWrite ? el("button", { class: "btn primary sm", type: "button", onclick: async (e) => {
        e.currentTarget.disabled = true;
        try { await sharedApi.seed(store.state); toast("Shared workspace ready"); } catch { toast("Could not set up the shared workspace. Try again."); e.currentTarget.disabled = false; }
      } }, "Load source data") : null);
  }
  return el("div", { class: `callout ${shared.state === "error" ? "critical" : "info"} no-print`, style: { marginBottom: "18px" } },
    icon(shared.state === "error" ? "alert" : "shield"), el("span", {}, shared.error || (shared.state === "readonly" ? "You have view-only access, so changes are not saved." : "")));
}

// ---------- undo ----------

function doUndo() {
  const what = store.undo();
  if (what) toast(`Undone: ${what}`);
}

function undoToast(message) {
  toast(message, { label: "Undo", run: doUndo });
}

// ---------- as-of dialog ----------

function asOfDialog() {
  const s = store.state.settings;
  let mode = s.asOfMode;
  let date = s.asOf;
  modal((close) => {
    const dateInput = el("input", { class: "input", type: "date", value: date, onchange: (e) => { date = e.target.value; mode = "custom"; sync(); } });
    const opts = el("div", { style: { display: "flex", flexDirection: "column", gap: "8px" } });
    const sync = () => {
      opts.replaceChildren(...[
        ["snapshot", "Data snapshot", `Scigeniq export of ${fmtDate(store.state.meta.snapshot)}. Reproduces the master tracker workbook.`],
        ["today", "Today (live)", `Use the current date (${fmtDate(todayIso())}). Choose this once you keep the data up to date here.`],
        ["custom", "A specific date", "For a management review or an audit cut-off."],
      ].map(([v, l, d]) => el("label", { class: "check", style: { alignItems: "flex-start", padding: "10px 12px", border: "1px solid var(--line)", borderRadius: "10px", background: mode === v ? "var(--accent-soft)" : "transparent" } },
        el("input", { type: "radio", name: "asof", value: v, checked: mode === v, onchange: () => { mode = v; if (v === "snapshot") date = store.state.meta.snapshot; sync(); } }),
        el("span", {}, el("strong", {}, l), el("br"), el("span", { class: "muted", style: { fontSize: "12.5px" } }, d)))));
      dateInput.value = mode === "today" ? todayIso() : date;
      dateInput.disabled = mode !== "custom";
    };
    sync();
    return {
      title: "Status date",
      subtitle: "Overdue, due-soon and report-due figures are calculated against this date.",
      body: [opts, el("div", { class: "field" }, el("label", {}, "Date"), dateInput)],
      foot: [
        el("button", { class: "btn", type: "button", onclick: () => close() }, "Cancel"),
        el("button", { class: "btn primary", type: "button", onclick: () => {
          store.setSettings({ asOfMode: mode, asOf: mode === "snapshot" ? store.state.meta.snapshot : mode === "custom" ? date : s.asOf }, "Change status date");
          close();
        } }, "Apply"),
      ],
    };
  });
}

// ---------- task editor ----------

const TASK_FIELDS_EDITABLE = ["ref", "productId", "dept", "stream", "type", "title", "stage", "status", "user", "created", "start", "due", "closedOn"];

function taskForm(task, { isNew }) {
  const draft = { ...task };
  const users = ctx.users;
  const dateField = (key, label) => el("div", { class: "field" }, el("label", { for: `tf-${key}` }, label),
    el("input", { id: `tf-${key}`, class: "input", type: "date", value: String(draft[key] || "").slice(0, 10),
      onchange: (e) => {
        const v = e.target.value;
        const time = String(task[key] || "").slice(10) || "T00:00";
        draft[key] = v ? `${v}${String(task[key] || "").slice(0, 10) === v ? time : "T00:00"}` : "";
      } }));
  const text = (key, label, attrs = {}) => el("div", { class: `field ${attrs.full ? "full" : ""}` }, el("label", { for: `tf-${key}` }, label),
    el("input", { id: `tf-${key}`, class: "input", value: draft[key] || "", list: attrs.list, oninput: (e) => { draft[key] = e.target.value; } }));
  const sel = (key, label, options) => el("div", { class: "field" }, el("label", {}, label),
    select(options, draft[key], (v) => { draft[key] = v; }, { label }));
  const products = [...derived.products].sort((a, b) => a.name.localeCompare(b.name)).map((p) => [p.id, `${p.code ? `${p.code} · ` : ""}${p.name}`]);
  const body = el("div", { class: "form-grid" },
    el("div", { class: "field full" }, el("label", {}, "Product"), select(products, draft.productId, (v) => { draft.productId = v; }, { label: "Product" })),
    text("title", "Task title", { full: true }),
    text("ref", "Scigeniq reference"),
    sel("dept", "Department", DEPT_IDS),
    text("stream", "Data stream"),
    text("type", "Task type"),
    sel("stage", "Workflow stage", TASK_STAGES),
    sel("status", "Status", TASK_STATUSES),
    el("div", { class: "field full" }, el("label", { for: "tf-user" }, "Assigned user"),
      el("input", { id: "tf-user", class: "input", list: "user-list", value: draft.user === UNASSIGNED ? "" : draft.user, placeholder: "Unassigned",
        oninput: (e) => { draft.user = e.target.value.trim() || UNASSIGNED; } }),
      el("datalist", { id: "user-list" }, users.map((u) => el("option", { value: u })))),
    dateField("start", "Start"),
    dateField("due", "Due"),
    dateField("created", "Created"),
    dateField("closedOn", "Closed on"),
  );
  return { draft, body };
}

function openTask(id) {
  const task = store.state.tasks.find((t) => t.id === id);
  if (!task) return;
  const ev = derived.tasks.find((t) => t.id === id);
  const history = store.state.log.filter((e) => e.kind === "task" && e.id === id).slice(0, 8);
  modal((close) => {
    const { draft, body } = taskForm(task, { isNew: false });
    return {
      title: task.title,
      subtitle: `${task.ref} · ${shortProduct(ev.productName)} · ${task.dept}`,
      wide: false,
      body: [
        body,
        history.length ? el("div", {}, el("div", { class: "field-label", style: { marginBottom: "6px" } }, "Recent changes"),
          el("div", { class: "log-changes" }, history.map((h) => el("div", {}, `${relativeTime(h.ts)} · ${h.by}: `,
            (h.changes || []).map((c) => `${c.field} ${c.from || "—"} → ${c.to || "—"}`).join("; "))))) : null,
      ],
      foot: [
        el("button", { class: "btn danger left", type: "button", onclick: async () => {
          close();
          if (await confirmDialog({ title: "Delete this task?", message: `${task.ref} · ${task.title} will be removed from the register. You can undo this.`, confirmLabel: "Delete", danger: true })) {
            store.commit("Delete task", (s) => { s.tasks = s.tasks.filter((t) => t.id !== id); return [{ kind: "task", id, label: `${task.ref} · ${task.title}`, changes: [{ field: "deleted", from: "", to: "yes" }] }]; });
            undoToast("Task deleted");
          }
        } }, icon("trash", "sm"), "Delete"),
        !ev.done ? el("button", { class: "btn", type: "button", onclick: () => {
          store.updateTasks([id], { ...draft, status: "Completed", stage: "Completed", closedOn: draft.closedOn || nowStamp() }, "Complete task");
          close();
          undoToast("Task marked completed");
        } }, icon("check", "sm"), "Mark completed") : null,
        el("button", { class: "btn primary", type: "button", onclick: () => {
          const patch = Object.fromEntries(TASK_FIELDS_EDITABLE.map((f) => [f, draft[f]]));
          if (patch.status === "Completed" && !patch.closedOn) patch.closedOn = nowStamp();
          if (patch.status === "Completed") patch.stage = "Completed";
          const changed = store.updateTasks([id], patch, "Edit task");
          close();
          if (changed.length) undoToast("Task saved");
        } }, "Save"),
      ],
    };
  });
}

function newTask(productId = "") {
  const p = productId ? store.state.products.find((x) => x.id === productId) : null;
  const ev = productId ? derived.productById.get(productId) : null;
  const today = nowStamp();
  const blank = {
    id: nextTaskId(store.state.tasks), ref: ev?.primaryRef || "", productId: productId || store.state.products[0].id,
    dept: "QA", stream: "", type: "QA Data Collection", title: "", stage: "Collecting Data", status: "Open", user: UNASSIGNED,
    created: today, start: today, due: "", closedOn: "",
  };
  modal((close) => {
    const { draft, body } = taskForm(blank, { isNew: true });
    return {
      title: "New task",
      subtitle: p ? p.name : "Add a data collection or follow-up task",
      body,
      foot: [
        el("button", { class: "btn", type: "button", onclick: () => close() }, "Cancel"),
        el("button", { class: "btn primary", type: "button", onclick: () => {
          if (!draft.title.trim()) { toast("Give the task a title"); return; }
          store.commit("Add task", (s) => {
            const t = { ...draft, id: nextTaskId(s.tasks) };
            s.tasks.push(t);
            return [{ kind: "task", id: t.id, label: `${t.ref} · ${t.title}`, changes: [{ field: "created", from: "", to: t.title }] }];
          });
          close();
          undoToast("Task added");
        } }, "Add task"),
      ],
    };
  });
}

// ---------- command palette ----------

function openPalette() {
  if ($("dialog.palette-dialog")) return;
  const dialog = el("dialog", { class: "palette-dialog", "aria-label": "Search" });
  const input = el("input", { type: "search", placeholder: "Product, code, Scigeniq ref, person or page…", "aria-label": "Search", autocomplete: "off" });
  const list = el("div", { class: "palette-list", role: "listbox" });
  let items = [];
  let active = 0;
  const pages = NAV.flatMap(([, it]) => it).map(([id, label, ic]) => ({ group: "Pages", title: label, sub: "Go to page", ic, run: () => go(id) }));
  const people = workloadNames();
  const build = () => {
    const q = input.value.trim();
    const prods = derived.products.filter((p) => matchesQuery(q, p.name, p.code, p.apqrNo, p.refs.join(" "), p.form, p.owner))
      .slice(0, q ? 12 : 6)
      .map((p) => ({ group: "Products", title: p.name, sub: [p.apqrNo || p.id, p.primaryRef, p.planStatus].filter(Boolean).join(" · "), ic: "pill", run: () => ctx.openProduct(p.id) }));
    const ppl = people.filter((u) => matchesQuery(q, u)).slice(0, q ? 6 : 3)
      .map((u) => ({ group: "People", title: u, sub: "Open their tasks", ic: "user", run: () => go(`tasks?user=${encodeURIComponent(u)}`) }));
    const pg = pages.filter((x) => matchesQuery(q, x.title));
    items = [...pg.slice(0, q ? 8 : 0), ...prods, ...ppl, ...(q ? [] : pg)];
    active = Math.min(active, Math.max(0, items.length - 1));
    let group = "";
    list.replaceChildren(...items.flatMap((it, i) => {
      const out = [];
      if (it.group !== group) { group = it.group; out.push(el("div", { class: "palette-group" }, group)); }
      out.push(el("button", { class: "palette-item", type: "button", role: "option", "aria-selected": String(i === active),
        onclick: () => { dialog.close(); it.run(); }, onmousemove: () => { if (active !== i) { active = i; mark(); } } },
      icon(it.ic), el("span", { class: "pi-main" }, el("div", { class: "pi-title" }, it.title), el("div", { class: "pi-sub" }, it.sub))));
      return out;
    }));
    if (!items.length) list.append(el("div", { class: "empty" }, "No matches"));
  };
  const mark = () => $$(".palette-item", list).forEach((b, i) => {
    b.setAttribute("aria-selected", String(i === active));
    if (i === active) b.scrollIntoView({ block: "nearest" });
  });
  input.addEventListener("input", () => { active = 0; build(); });
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); active = Math.min(items.length - 1, active + 1); mark(); }
    if (e.key === "ArrowUp") { e.preventDefault(); active = Math.max(0, active - 1); mark(); }
    if (e.key === "Enter" && items[active]) { e.preventDefault(); dialog.close(); items[active].run(); }
  });
  dialog.append(el("div", { class: "palette" },
    el("div", { class: "palette-input" }, icon("search"), input),
    list,
    el("div", { class: "palette-foot" }, el("span", {}, el("kbd", {}, "↑↓"), " move"), el("span", {}, el("kbd", {}, "Enter"), " open"), el("span", {}, el("kbd", {}, "Esc"), " close"))));
  dialog.addEventListener("close", () => dialog.remove());
  dialog.addEventListener("click", (e) => { if (e.target === dialog) dialog.close(); });
  document.body.append(dialog);
  build();
  dialog.showModal();
  input.focus();
}

function workloadNames() {
  return [...new Set(derived.tasks.map((t) => t.user))].sort((a, b) => a.localeCompare(b));
}

// ---------- global events ----------

document.addEventListener("keydown", (e) => {
  const typing = e.target.closest?.("input, textarea, select, [contenteditable]");
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); openPalette(); return; }
  if (typing || document.querySelector("dialog[open]")) return;
  if (e.key === "/") { e.preventDefault(); openPalette(); }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); doUndo(); }
});

$("#scrim").addEventListener("click", () => document.body.classList.remove("nav-open"));

let lastWidth = window.innerWidth;
window.addEventListener("resize", debounce(() => {
  if (Math.abs(window.innerWidth - lastWidth) < 24) return;
  lastWidth = window.innerWidth;
  render();
}, 180));

store.subscribe((info) => {
  if (info.saved === false) saveState = "error";
  else if (info.saved === true) saveState = "saved";
  if (info.blocked) toast(shared?.error || "You have view-only access, so this change was not saved.");
  if (info.changed) {
    // Someone else's change: wait until this viewer finishes typing.
    if (info.remote && busy()) { deferred = true; renderTopbar(VIEWS[ctx.route.view]); return; }
    render();
  } else if ("saved" in info) {
    renderTopbar(VIEWS[ctx.route.view]);
  }
});

installTooltips();
ctx.route = parseRoute(location.hash);
render({ scroll: true });

if (HOSTED) {
  connectShared(store, {
    onStatus: (s) => {
      const before = shared?.state;
      shared = s;
      if (before !== s.state) render(); else renderTopbar(VIEWS[ctx.route.view]);
    },
    onNames: (n) => { names = n; if (ctx.route.view === "data" || ctx.route.view === "product") render(); },
  }).then((api) => {
    sharedApi = api;
    if (!api) { shared = { state: "local", canWrite: true }; renderTopbar(VIEWS[ctx.route.view]); }
  }).catch(() => { shared = { state: "local", canWrite: true }; renderTopbar(VIEWS[ctx.route.view]); });
  window.claude?.use?.("downloads").then((d) => { platform.downloads = d; }).catch(() => { /* exports stay hidden */ });
} else {
  if (!store.restored) {
    setTimeout(() => toast(`Loaded ${store.state.products.length} products and ${store.state.tasks.length} tasks from the 2026 plan and Scigeniq export. Edits save in this browser.`), 600);
  }
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => { /* offline support is optional */ }));
  }
}
