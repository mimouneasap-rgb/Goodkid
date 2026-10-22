// Shared UI pieces: toasts, tooltips, modal dialogs, status chips, sortable tables.

import { el, icon, $, esc, initials, hueOf, fmtDate, fmtDays } from "./dom.js";

// ---------- toasts ----------

export function toast(message, action) {
  const host = $("#toasts");
  const node = el("div", { class: "toast" }, message);
  if (action) {
    node.append(el("button", { type: "button", onclick: () => { action.run(); node.remove(); } }, action.label));
  }
  host.append(node);
  while (host.children.length > 3) host.firstElementChild.remove();
  setTimeout(() => node.remove(), action ? 7000 : 3600);
}

// ---------- tooltip (one floating node; content from data-tip) ----------

export function installTooltips() {
  const tipNode = $("#tooltip");
  let current = null;
  const show = (target, x, y) => {
    const text = target.getAttribute("data-tip");
    if (!text) return;
    if (current !== target) {
      current = target;
      tipNode.replaceChildren();
      text.split("\n").forEach((line, i) => tipNode.append(i === 0 ? el("strong", {}, line) : el("div", {}, line)));
    }
    const pad = 14;
    const r = tipNode.getBoundingClientRect();
    let left = x + pad;
    let top = y + pad;
    if (left + r.width > window.innerWidth - 8) left = x - r.width - pad;
    if (top + r.height > window.innerHeight - 8) top = y - r.height - pad;
    tipNode.style.left = `${Math.max(8, left)}px`;
    tipNode.style.top = `${Math.max(8, top)}px`;
    tipNode.classList.add("show");
  };
  const hide = () => { current = null; tipNode.classList.remove("show"); };
  document.addEventListener("pointermove", (e) => {
    const t = e.target.closest?.("[data-tip]");
    if (t) show(t, e.clientX, e.clientY);
    else if (current) hide();
  });
  document.addEventListener("focusin", (e) => {
    const t = e.target.closest?.("[data-tip]");
    if (t) {
      const r = t.getBoundingClientRect();
      show(t, r.left + r.width / 2, r.bottom);
    }
  });
  document.addEventListener("focusout", hide);
  document.addEventListener("scroll", hide, true);
}

// ---------- modal dialogs ----------

/**
 * Open a modal. `build(close)` returns { title, subtitle, body, foot, wide }.
 * Resolves with whatever `close(value)` is called with (undefined on Escape).
 */
export function modal(build) {
  return new Promise((resolve) => {
    const dialog = el("dialog", { "aria-modal": "true" });
    let value;
    const close = (v) => { value = v; dialog.close(); };
    const spec = build(close);
    const body = el("div", { class: "modal-body" }, spec.body);
    dialog.append(el("div", { class: `modal${spec.wide ? " wide" : ""}` },
      el("div", { class: "modal-head" },
        el("div", {}, el("h2", {}, spec.title), spec.subtitle ? el("p", {}, spec.subtitle) : null),
        el("button", { class: "btn ghost icon-only", type: "button", "aria-label": "Close", onclick: () => close() }, icon("close"))),
      body,
      spec.foot ? el("div", { class: "modal-foot" }, spec.foot) : null));
    dialog.addEventListener("close", () => { dialog.remove(); resolve(value); });
    dialog.addEventListener("click", (e) => { if (e.target === dialog) close(); });
    document.body.append(dialog);
    dialog.showModal();
    const first = body.querySelector("[autofocus], input, select, textarea");
    if (first) first.focus();
  });
}

export function confirmDialog({ title, message, confirmLabel = "Confirm", danger = false }) {
  return modal((close) => ({
    title,
    body: el("p", { style: { color: "var(--ink-2)" } }, message),
    foot: [
      el("button", { class: "btn", type: "button", onclick: () => close(false) }, "Cancel"),
      el("button", { class: `btn ${danger ? "danger solid" : "primary"}`, type: "button", autofocus: true, onclick: () => close(true) }, confirmLabel),
    ],
  })).then(Boolean);
}

// ---------- chips ----------

const RAG_TONE = { COMPLETE: ["good", "checkCircle", "Complete"], "ON TRACK": ["info", "target", "On track"], "DUE SOON": ["warning", "clock", "Due soon"], OVERDUE: ["critical", "alert", "Overdue"] };

export function ragChip(rag) {
  if (!rag) return el("span", { class: "chip" }, icon("ban"), "Not triggered");
  const [tone, ic, label] = RAG_TONE[rag];
  return el("span", { class: `chip ${tone}` }, icon(ic), label);
}

const PLAN_TONE = {
  Closed: ["good", "checkCircle"], "In progress": ["info", "workflow"], "Past due": ["critical", "alert"],
  "Due ≤ 60 d": ["warning", "clock"], "Not triggered": ["", "calendar"],
};

export function planChip(status) {
  const [tone, ic] = PLAN_TONE[status] || ["", "info"];
  return el("span", { class: `chip ${tone}` }, icon(ic), status);
}

export function taskStateChip(t) {
  if (t.cancelled) return el("span", { class: "chip" }, icon("ban"), "Cancelled");
  if (t.done) return el("span", { class: "chip good" }, icon("checkCircle"), "Completed");
  if (t.overdue) return el("span", { class: "chip critical" }, icon("alert"), `${-t.daysToDue} d overdue`);
  if (t.systemOverdue) return el("span", { class: "chip serious" }, icon("alert"), "Overdue flag");
  if (t.daysToDue !== null && t.daysToDue <= 14) return el("span", { class: "chip warning" }, icon("clock"), fmtDays(t.daysToDue));
  return el("span", { class: "chip info" }, icon("clock"), "Open");
}

export function taskStateIcon(t) {
  if (t.done) return el("span", { class: "state-icon done", title: "Completed" }, icon("check"));
  if (t.cancelled) return el("span", { class: "state-icon off", title: "Cancelled" }, icon("ban"));
  if (t.overdue) return el("span", { class: "state-icon late", title: "Overdue" }, icon("alert"));
  return el("span", { class: "state-icon open", title: "Open" }, icon("clock"));
}

export function avatar(name, size = "") {
  const none = !name || name === "Unassigned";
  return el("span", { class: `avatar ${size} ${none ? "none" : ""}`.trim(), style: none ? null : { "--h": String(hueOf(name)) }, "aria-hidden": "true" }, initials(name));
}

export function who(name) {
  return el("span", { class: "who" }, avatar(name), el("span", {}, name || "Unassigned"));
}

export function meter(segments, cls = "") {
  return el("div", { class: `meter ${cls}`.trim() }, segments.filter((s) => s.value > 0).map((s) =>
    el("span", { style: { width: `${Math.max(0, Math.min(100, s.value * 100))}%`, background: s.color } })));
}

export function progress(fraction, color = "var(--s1)") {
  return el("div", { class: "progress" }, meter([{ value: fraction, color }]), el("span", { class: "pct" }, `${Math.round(fraction * 100)}%`));
}

// ---------- sortable table ----------

/**
 * columns: [{ key, label, sortable?, num?, center?, render(row) → Node|string, width? }]
 * opts: { sort: {key, dir}, onSort(key), onRow(row), rowClass(row), limit, onMore, selectable: {selected:Set, onToggle(id, on), onAll(on), id(row)} }
 */
export function dataTable(rows, columns, opts = {}) {
  const sel = opts.selectable;
  const shown = opts.limit ? rows.slice(0, opts.limit) : rows;
  const head = el("tr", {},
    sel ? el("th", { class: "center", style: { width: "36px" } },
      el("input", { type: "checkbox", "aria-label": "Select all", checked: rows.length > 0 && rows.every((r) => sel.selected.has(sel.id(r))),
        indeterminate: rows.some((r) => sel.selected.has(sel.id(r))) && !rows.every((r) => sel.selected.has(sel.id(r))),
        onchange: (e) => sel.onAll(e.target.checked) })) : null,
    columns.map((c) => {
      const active = opts.sort?.key === c.key;
      const th = el("th", {
        class: [c.sortable !== false && opts.onSort ? "sortable" : "", c.num ? "num" : "", c.center ? "center" : ""].join(" ").trim(),
        style: c.width ? { width: c.width } : null,
        "aria-sort": active ? (opts.sort.dir === "asc" ? "ascending" : "descending") : null,
        tabindex: c.sortable !== false && opts.onSort ? "0" : null,
      }, c.label, c.sortable !== false && opts.onSort ? el("span", { class: "arrow" }, active ? (opts.sort.dir === "asc" ? " ↑" : " ↓") : "") : null);
      if (c.sortable !== false && opts.onSort) {
        th.addEventListener("click", () => opts.onSort(c.key));
        th.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); opts.onSort(c.key); } });
      }
      return th;
    }));
  const body = el("tbody", {}, shown.map((r) => {
    const id = sel?.id(r);
    const tr = el("tr", { class: [opts.onRow ? "clickable" : "", sel?.selected.has(id) ? "selected" : "", opts.rowClass?.(r) || ""].join(" ").trim() },
      sel ? el("td", { class: "center", onclick: (e) => e.stopPropagation() },
        el("input", { type: "checkbox", "aria-label": "Select row", checked: sel.selected.has(id), onchange: (e) => sel.onToggle(id, e.target.checked) })) : null,
      columns.map((c) => el("td", { class: [c.num ? "num" : "", c.center ? "center" : "", c.cls || ""].join(" ").trim() }, c.render ? c.render(r) : r[c.key] ?? "")));
    if (opts.onRow) {
      tr.addEventListener("click", (e) => {
        if (e.target.closest("button, a, input, select, textarea, label")) return;
        opts.onRow(r);
      });
    }
    return tr;
  }));
  const wrap = el("div", { class: "table-wrap", style: opts.maxHeight ? { maxHeight: opts.maxHeight } : null },
    el("table", { class: "table" }, el("thead", {}, head), body));
  if (!rows.length) {
    return el("div", {}, wrap, el("div", { class: "empty" }, icon("search"), el("h3", {}, opts.emptyTitle || "Nothing matches"), el("p", {}, opts.emptyText || "Try clearing a filter.")));
  }
  if (opts.limit && rows.length > opts.limit) {
    return el("div", {}, wrap, el("div", { class: "table-more" },
      el("button", { class: "btn", type: "button", onclick: opts.onMore }, `Show ${Math.min(150, rows.length - opts.limit)} more`, el("span", { class: "muted" }, ` · ${rows.length - opts.limit} hidden`))));
  }
  return wrap;
}

export function nextSort(sort, key, defaultDir = "asc") {
  return sort.key === key ? { key, dir: sort.dir === "asc" ? "desc" : "asc" } : { key, dir: defaultDir };
}

export function select(options, value, onChange, props = {}) {
  return el("select", { class: `select ${props.size || ""}`.trim(), "aria-label": props.label, onchange: (e) => onChange(e.target.value), ...props.attrs },
    options.map((o) => {
      const [v, l] = Array.isArray(o) ? o : [o, o];
      return el("option", { value: v, selected: String(v) === String(value ?? "") }, l);
    }));
}

export function seg(options, value, onChange, label) {
  return el("div", { class: "seg", role: "group", "aria-label": label }, options.map(([v, l, ic]) =>
    el("button", { type: "button", "aria-pressed": String(v === value), onclick: () => onChange(v) }, ic ? icon(ic, "sm") : null, l)));
}

export function cardHead(title, sub, ...actions) {
  return el("div", { class: "card-head" },
    el("div", { style: { minWidth: 0 } }, el("h3", { class: "card-title" }, title), sub ? el("p", { class: "card-sub" }, sub) : null),
    actions.length ? el("div", { class: "card-actions" }, actions) : null);
}

/** A chart drawn after insertion, at the width of its container. */
export function lazyChart(build, { onClick, label } = {}) {
  const box = el("div", { class: "chart", role: label ? "figure" : null, "aria-label": label });
  box._build = build;
  if (onClick) box.addEventListener("click", onClick);
  return box;
}

export function mountCharts(root) {
  for (const box of root.querySelectorAll(".chart")) {
    if (!box._build) continue;
    const width = Math.max(240, Math.floor(box.clientWidth || box.parentElement?.clientWidth || 600));
    box.innerHTML = box._build(width);
  }
}

/**
 * Card holding a chart with a Chart/Table switch (the table is the accessible
 * reading of the same numbers). `key` remembers the choice for the session.
 */
export function chartCard({ key, title, sub, legend, chart, table, actions = [], ui, cls = "" }) {
  ui.chartTables ??= new Set();
  const showTable = ui.chartTables.has(key);
  const card = el("section", { class: `card ${cls}`.trim() });
  const toggle = seg([["chart", "Chart"], ["table", "Table"]], showTable ? "table" : "chart", (v) => {
    if (v === "table") ui.chartTables.add(key); else ui.chartTables.delete(key);
    const body = card.querySelector(".card-body");
    body.replaceChildren(...renderBody(v === "table"));
    card.querySelectorAll(".seg button").forEach((b) => b.setAttribute("aria-pressed", String((b.textContent === "Table") === (v === "table"))));
    mountCharts(card);
  }, `${title} view`);
  const renderBody = (asTable) => asTable ? [table()] : [legend ? legend : null, chart()].filter(Boolean);
  card.append(cardHead(title, sub, ...actions, toggle), el("div", { class: "card-body" }, renderBody(showTable)));
  return card;
}

export function legend(items) {
  return el("div", { class: "legend" }, items.map(([label, color, kind]) =>
    el("span", {}, el("i", { class: kind === "line" ? "line" : "", style: { background: color } }), label)));
}

export function miniTable(headers, rows) {
  return el("div", { class: "table-wrap", style: { borderRadius: "10px", border: "1px solid var(--line)" } },
    el("table", { class: "table" },
      el("thead", {}, el("tr", {}, headers.map((h, i) => el("th", { class: i ? "num" : "" }, h)))),
      el("tbody", {}, rows.map((r) => el("tr", {}, r.map((c, i) => el("td", { class: i ? "num" : "" }, c)))))));
}

export function dueText(iso, days) {
  if (!iso) return el("span", { class: "faint" }, "—");
  return el("span", { class: "nowrap" }, fmtDate(iso), days !== null && days !== undefined ? el("span", { class: days < 0 ? "" : "muted", style: days < 0 ? { color: "var(--critical-ink)", fontWeight: 650 } : null }, ` · ${fmtDays(days)}`) : null);
}

/**
 * Search input that filters as you type. The view re-renders on change, so the
 * new input takes focus and caret position from the old one.
 */
export function searchBox(value, label, placeholder, onChange) {
  let t;
  const input = el("input", { class: "input", type: "search", placeholder, value, "aria-label": label,
    oninput: (e) => {
      clearTimeout(t);
      const v = e.target.value;
      const pos = e.target.selectionStart;
      t = setTimeout(() => {
        onChange(v);
        const next = document.querySelector(`input[type="search"][aria-label="${label}"]`);
        if (next && next !== document.activeElement) { next.focus(); next.setSelectionRange(pos, pos); }
      }, 200);
    } });
  return el("label", { class: "search" }, icon("search"), input);
}

export { esc };
