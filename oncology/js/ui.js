// DOM helpers and reusable UI components (cards, KPI tiles, pills, data tables).
import { t, tv, getLang } from "./i18n.js";
import { isoDay } from "./model.js";

/** Hyperscript: h("div.card#id", {onclick, class, style, …}, children…). Strings are text nodes. */
export function h(sel, attrs, ...kids) {
  if (attrs == null || typeof attrs !== "object" || attrs instanceof Node || Array.isArray(attrs)) {
    if (attrs != null) kids.unshift(attrs);
    attrs = {};
  }
  const [, tag = "div", rest = ""] = sel.match(/^([a-z0-9-]*)(.*)$/i);
  const el = /^(svg|path|rect|circle|line|g|text|polyline|polygon|title|defs|linearGradient|stop|clipPath|tspan)$/.test(tag)
    ? document.createElementNS("http://www.w3.org/2000/svg", tag)
    : document.createElement(tag || "div");
  for (const m of rest.matchAll(/([.#])([\w-]+)/g)) {
    if (m[1] === ".") el.classList.add(m[2]); else el.id = m[2];
  }
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
    else if (k === "class") el.classList.add(...String(v).split(/\s+/).filter(Boolean));
    else if (k === "style" && typeof v === "object") {
      for (const [prop, val] of Object.entries(v)) {
        if (val == null) continue;
        if (prop.startsWith("--")) el.style.setProperty(prop, val); else el.style[prop] = val;
      }
    }
    else if (k === "html") el.innerHTML = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  append(el, kids);
  return el;
}
function append(el, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false) continue;
    el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
}

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// ---------- formatting ----------
export const fmtDate = (ts) => {
  if (ts == null) return "";
  const s = isoDay(ts);
  return `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;
};
export const fmtNum = (n, d = 0) => (n == null || isNaN(n) ? "—" : Number(n).toLocaleString(getLang() === "FR" ? "fr-FR" : "en-GB", { maximumFractionDigits: d, minimumFractionDigits: d }));
export const fmtPct = (n, d = 0) => (n == null || isNaN(n) ? "—" : `${fmtNum(n * 100, d)} %`.replace(" %", getLang() === "FR" ? " %" : "%"));
export function fmtMonth(key) {
  const [y, m] = key.split("-");
  const names = getLang() === "FR"
    ? ["janv", "févr", "mars", "avr", "mai", "juin", "juil", "août", "sept", "oct", "nov", "déc"]
    : ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${names[+m - 1]} ${y.slice(2)}`;
}
export const fmtValue = (v, unit) => (unit === "%" ? fmtPct(v) : unit === "d" ? (v == null ? "—" : `${fmtNum(v)} ${t("d")}`) : fmtNum(v));

// ---------- semantic colours ----------
export const TYPE_COLOR = { "Change Control": "var(--c1)", CAPA: "var(--c2)", Deviation: "var(--c3)" };
export const STATUS_COLOR = { Open: "var(--c1)", Overdue: "var(--critical)", Completed: "var(--good)", Canceled: "var(--muted-mark)" };
export const LEVEL_COLOR = { Low: "var(--good)", Medium: "var(--warning)", High: "var(--critical)" };
export const CAL_COLOR = {
  Overdue: "var(--critical)", "Due ≤30 d": "var(--serious)", "Due 31–60 d": "var(--warning)", "Due 61–90 d": "var(--c4)",
  "In date": "var(--good)", "Missing date": "var(--c7)", "No calibration data": "var(--muted-mark)",
};

/** A small status pill with a coloured dot (colour is never the only cue – text is always present). */
export function pill(value, kind = "status") {
  const map = kind === "type" ? TYPE_COLOR : kind === "level" ? LEVEL_COLOR : kind === "cal" ? CAL_COLOR : STATUS_COLOR;
  const color = map[value] ?? "var(--muted-mark)";
  if (!value) return h("span.muted", "—");
  return h("span.pill", { style: { "--dot": color } }, h("i"), tv(value));
}
export function typeTag(type) {
  const short = { "Change Control": "CC", CAPA: "CAPA", Deviation: "DEV" }[type] ?? type;
  return h("span.type-tag", { style: { "--dot": TYPE_COLOR[type] }, title: tv(type) }, short);
}

// ---------- layout pieces ----------
export function viewHeader(title, sub, ...actions) {
  return h("header.view-head",
    h("div",
      h("h1", title),
      sub ? h("p.sub", sub) : null),
    h("div.view-actions", actions));
}

export function card(title, body, opts = {}) {
  return h(`section.card${opts.span ? ".span-" + opts.span : ""}${opts.cls ? "." + opts.cls : ""}`,
    title || opts.actions ? h("div.card-head",
      h("div", h("h2", title), opts.sub ? h("p.card-sub", opts.sub) : null),
      opts.actions ? h("div.card-actions", opts.actions) : null) : null,
    h("div.card-body", body));
}

/** KPI tile. delta: number (+/-), goodWhen: "up" | "down"; status: 0–3 RAG */
export function kpi({ label, value, unit, delta, deltaLabel, goodWhen = "up", status, hint, onclick, spark, accent }) {
  let deltaEl = null;
  if (delta != null) {
    const dir = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
    const good = dir === "flat" ? "flat" : (dir === goodWhen ? "good" : "bad");
    deltaEl = h(`span.delta.${good}`, dir === "up" ? "▲ +" : dir === "down" ? "▼ " : "► ", fmtNum(delta), deltaLabel ? h("span.delta-l", " ", deltaLabel) : null);
  }
  const statusEl = status ? h(`span.rag.rag-${status}`, h("i"), [null, t("st_action"), t("st_watch"), t("st_on")][status]) : null;
  return h(`${onclick ? "button" : "div"}.kpi${accent ? ".kpi-accent" : ""}`, { onclick, type: onclick ? "button" : null, style: accent ? { "--accent": accent } : null },
    h("span.kpi-label", label),
    h("span.kpi-value", value, unit ? h("small", unit) : null),
    h("span.kpi-foot", deltaEl, statusEl, hint ? h("span.kpi-hint", hint) : null),
    spark ?? null);
}

export function segmented(options, value, onChange, label) {
  return h("div.seg", { role: "radiogroup", "aria-label": label },
    options.map(([v, l]) => h("button", { type: "button", role: "radio", "aria-checked": String(v === value), class: v === value ? "on" : "", onclick: () => onChange(v) }, l)));
}

export function select(label, options, value, onChange) {
  const id = "s" + Math.random().toString(36).slice(2, 8);
  return h("label.field", { for: id },
    h("span", label),
    h("select", { id, onchange: (e) => onChange(e.target.value) },
      options.map((o) => {
        const [v, l] = Array.isArray(o) ? o : [o, o];
        return h("option", { value: v, selected: String(v) === String(value) ? true : null }, l);
      })));
}

export const empty = (msg) => h("div.empty", h("span.empty-ico", "◌"), msg ?? t("none_found"));

/**
 * Sortable, searchable, paged table.
 * cols: [{key, label, render?(row), sort?(row), cls?, width?}]
 */
export function dataTable(cols, rows, opts = {}) {
  const pageSize = opts.pageSize ?? 15;
  let sortKey = opts.sortKey ?? null, dir = opts.sortDir ?? 1, q = "", limit = pageSize;
  const wrap = h("div.table-wrap");
  const tools = h("div.table-tools");
  const body = h("div.table-scroll");
  const foot = h("div.table-foot");

  const search = opts.search !== false && rows.length > 8
    ? h("input.table-search", { type: "search", placeholder: t("search_short") + "…", "aria-label": t("search_short"), oninput: (e) => { q = e.target.value.toLowerCase(); limit = pageSize; draw(); } })
    : null;
  if (search || opts.tools) tools.append(...[search, opts.tools].filter(Boolean));

  function value(c, r) { return c.sort ? c.sort(r) : r[c.key]; }
  function draw() {
    let list = rows;
    if (q) list = list.filter((r) => cols.some((c) => String(value(c, r) ?? "").toLowerCase().includes(q)) || (opts.searchText && opts.searchText(r).toLowerCase().includes(q)));
    if (sortKey) {
      const c = cols.find((x) => x.key === sortKey);
      list = [...list].sort((a, b) => {
        const va = value(c, a), vb = value(c, b);
        if (va == null || va === "") return 1;
        if (vb == null || vb === "") return -1;
        return (typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb), undefined, { numeric: true })) * dir;
      });
    }
    const shown = list.slice(0, limit);
    const table = h("table.data",
      h("thead", h("tr", cols.map((c) => h("th", {
        class: [c.cls, sortKey === c.key ? (dir > 0 ? "asc" : "desc") : ""].filter(Boolean).join(" "),
        style: c.width ? { width: c.width } : null,
        "aria-sort": sortKey === c.key ? (dir > 0 ? "ascending" : "descending") : null,
      }, h("button", { type: "button", onclick: () => { if (sortKey === c.key) dir = -dir; else { sortKey = c.key; dir = 1; } draw(); } }, c.label))))),
      h("tbody", shown.length ? shown.map((r) => h("tr", {
        class: [opts.onRow ? "clickable" : "", opts.rowCls ? opts.rowCls(r) : ""].filter(Boolean).join(" "),
        tabindex: opts.onRow ? "0" : null,
        onclick: opts.onRow ? () => opts.onRow(r) : null,
        onkeydown: opts.onRow ? (e) => { if (e.key === "Enter") opts.onRow(r); } : null,
      }, cols.map((c) => h("td", { class: c.cls }, c.render ? c.render(r) : (r[c.key] ?? ""))))) : h("tr", h("td.empty-cell", { colspan: cols.length }, empty()))));
    body.replaceChildren(table);
    foot.replaceChildren(...[
      h("span", `${t("showing")} ${fmtNum(shown.length)} ${t("of")} ${fmtNum(list.length)}`),
      list.length > shown.length ? h("button.link", { type: "button", onclick: () => { limit += pageSize * 2; draw(); } }, getLang() === "FR" ? "Afficher plus" : "Show more") : null,
      opts.exportName ? h("button.link", { type: "button", onclick: () => downloadCSV(opts.exportName, cols, list) }, t("export_csv")) : null].filter(Boolean));
  }
  draw();
  wrap.append(tools.childElementCount ? tools : "", body, foot);
  return wrap;
}

export function downloadCSV(name, cols, rows) {
  const cell = (v) => { const s = String(v ?? ""); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const text = [cols.map((c) => cell(c.label)).join(","), ...rows.map((r) => cols.map((c) => {
    const v = c.csv ? c.csv(r) : c.sort ? c.sort(r) : r[c.key];
    return cell(typeof v === "number" && c.date ? fmtDate(v) : v);
  }).join(","))].join("\n");
  const a = h("a", { href: URL.createObjectURL(new Blob(["﻿" + text], { type: "text/csv" })), download: `${name}.csv` });
  document.body.append(a); a.click(); a.remove();
}

/** Two-column definition list, skipping empty values. */
export function defList(pairs) {
  return h("dl.deflist", pairs.filter(([, v]) => v != null && v !== "" && !(Array.isArray(v) && !v.length)).map(([k, v]) => [h("dt", k), h("dd", v)]));
}
