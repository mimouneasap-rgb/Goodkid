// Filters for every metric: a period (presets or a custom range, counted on
// the date a record was raised, was active, was closed or falls due) and the
// dimensions the registers record — person, area, product, classification,
// severity, type, source, department, root cause, status, register. A filter
// never changes the data: it builds a filtered copy of the board that every
// existing calculation (KPIs, charts, reports) runs on unchanged.

import { store } from "./store.js";
import * as E from "./engine.js";
import { T1_REGISTERS, T2_REGISTERS } from "./schema.js";
import { esc, fmtDate, $, $$ } from "./ui.js";

const has = (v) => v !== "" && v != null;

export const T2_REGS = ["dev", "capa", "cc", "insp", "rel", "doc", "apqr", "trn", "esc", "act", "tasks", "load"];
export const T1_REGS = ["dl", "br", "fn", "ac", "hd", "tr"];

/** Every filterable dimension: the record fields it reads. */
export const DIMS = {
  owner: { label: "Person", all: "Everyone", keys: ["owner", "officer", "member", "trainer", "inspector"] },
  area: { label: "Area", all: "All areas", keys: ["area"] },
  product: { label: "Product", all: "All products", keys: ["product"] },
  cls: { label: "Classification", all: "All classes", keys: ["cls"] },
  sev: { label: "Severity / category", all: "All severities", keys: ["sev", "cat"] },
  type: { label: "Type", all: "All types", keys: ["type", "ptype", "rtype"] },
  source: { label: "Source", all: "All sources", keys: ["source"] },
  dept: { label: "Department", all: "All departments", keys: ["dept", "initiator"] },
  root: { label: "Root cause", all: "All root causes", keys: ["root"] },
  state: { label: "Status", all: "Any status" },
  reg: { label: "Register", all: "All registers" },
};
export const STATES = [["open", "Open (not closed)"], ["overdue", "Overdue"], ["dueSoon", "Due within 7 days"], ["closed", "Closed / done"], ["flagged", "Data-check flag"]];

export const PERIODS = [
  ["all", "All dates"], ["today", "Today"], ["yesterday", "Yesterday"], ["week", "This week"], ["prevweek", "Last week"],
  ["last7", "Last 7 days"], ["month", "Reporting month"], ["prevmonth", "Previous month"], ["last30", "Last 30 days"],
  ["last90", "Last 90 days"], ["quarter", "This quarter"], ["ytd", "Year to date"], ["custom", "Custom range…"],
];
export const MODES = [["raised", "raised in the period"], ["active", "open at any time in the period"], ["closed", "closed in the period"], ["due", "due in the period"]];

export const EMPTY = Object.freeze({ period: "all", from: "", to: "", mode: "raised" });

/** First day of the week that holds `iso`: the day after the site's last weekend day. */
function weekStart(iso, setup) {
  const last = Math.max(E.WEEKDAYS.indexOf(setup.weekend1), E.WEEKDAYS.indexOf(setup.weekend2));
  const first = (last + 1) % 7; // weekend Friday + Saturday → weeks start on Sunday
  const back = (E.weekday(iso) - first + 7) % 7;
  return E.addDays(iso, -back);
}

/** The [from, to] dates of a filter's period, or null for "all dates". */
export function periodRange(F, ref = store.t2.setup.statusDate, setup = store.t2.setup) {
  const p = F?.period || "all";
  switch (p) {
    case "today": return [ref, ref];
    case "yesterday": { const d = E.addDays(ref, -1); return [d, d]; }
    case "week": return [weekStart(ref, setup), ref];
    case "prevweek": { const s = E.addDays(weekStart(ref, setup), -7); return [s, E.addDays(s, 6)]; }
    case "last7": return [E.addDays(ref, -6), ref];
    case "month": return [E.monthStart(setup.month), E.monthEnd(setup.month)];
    case "prevmonth": { const pm = E.monthStart(E.addDays(E.monthStart(setup.month), -1)); return [pm, E.monthEnd(pm)]; }
    case "last30": return [E.addDays(ref, -29), ref];
    case "last90": return [E.addDays(ref, -89), ref];
    case "quarter": { const q = Math.floor((+ref.slice(5, 7) - 1) / 3) * 3 + 1; return [`${ref.slice(0, 4)}-${String(q).padStart(2, "0")}-01`, ref]; }
    case "ytd": return [`${ref.slice(0, 4)}-01-01`, ref];
    case "custom": return F.from || F.to ? [F.from || "0000-01-01", F.to || "9999-12-31"] : null;
    default: return null;
  }
}

const schemaOf = (tier, reg) => (tier === "t1" ? T1_REGISTERS : T2_REGISTERS)[reg];
const dateKeyOf = (sc) => {
  const k = Object.fromEntries(sc.fields.map((f) => [f.key, 1]));
  return sc.dateKey || (k.opened ? "opened" : k.date ? "date" : k.mfg ? "mfg" : k.recv ? "recv" : k.assigned ? "assigned" : null);
};
const closedKeyOf = (sc) => { const k = sc.fields.map((f) => f.key); return k.includes("closed") ? "closed" : k.includes("decision") ? "decision" : k.includes("done") ? "done" : null; };
const dueKeyOf = (sc) => (sc.fields.some((f) => f.key === "due") ? "due" : null);
/** Products are often "NAME 50 mg / batch": filter on the name before the slash. */
export const productName = (v) => String(v || "").split(" / ")[0].trim();

function fieldFor(sc, dim) {
  const keys = DIMS[dim]?.keys;
  if (!keys) return null;
  return keys.find((k) => sc.fields.some((f) => f.key === k)) || null;
}

/** Whether a register records the dimension (so the filter can apply to it). */
export function regHas(tier, reg, dim) {
  if (dim === "state" || dim === "reg") return true;
  const sc = schemaOf(tier, reg);
  return !!(sc && fieldFor(sc, dim));
}

/** Count of active filters. */
export function activeCount(F) {
  if (!F) return 0;
  return Object.keys(DIMS).filter((d) => has(F[d])).length + ((F.period || "all") !== "all" ? 1 : 0);
}

/** Merge a chart's own filters over the page filters. */
export function merge(base, own) {
  const out = { ...EMPTY, ...(base || {}) };
  for (const [k, v] of Object.entries(own || {})) if (has(v) && !(k === "period" && v === "inherit")) out[k] = v;
  if (own?.period && own.period !== "inherit") { out.from = own.from || ""; out.to = own.to || ""; out.mode = own.mode || out.mode; }
  return out;
}

/** A filtered copy of a board: every register keeps only the records that pass. */
export function applyFilters(tier, s, F, { ref, comp: pre } = {}) {
  if (!activeCount(F)) return s;
  ref ??= tier === "t2" ? s.setup.statusDate : s.setup.selDate;
  const comp = pre || (tier === "t2" ? E.t2Computed(s) : E.t1Computed(s, ref));
  const range = periodRange(F, tier === "t2" ? s.setup.statusDate : ref, tier === "t2" ? s.setup : store.t2.setup);
  const out = { ...s };
  for (const reg of tier === "t2" ? T2_REGS : T1_REGS) {
    const sc = schemaOf(tier, reg);
    if (!sc || !Array.isArray(s[reg])) continue;
    if (has(F.reg) && F.reg !== reg && reg !== "load") { out[reg] = []; continue; }
    const dk = dateKeyOf(sc), ck = closedKeyOf(sc), uk = dueKeyOf(sc);
    const c = comp[reg] || [];
    out[reg] = s[reg].filter((r, i) => {
      const x = c[i] || {};
      for (const dim of Object.keys(DIMS)) {
        if (dim === "state" || dim === "reg" || !has(F[dim])) continue;
        const key = fieldFor(sc, dim);
        if (!key) continue; // the register does not record it: unaffected
        const v = dim === "product" ? productName(r[key]) : r[key];
        if (String(v ?? "") !== String(F[dim])) return false;
      }
      if (has(F.state) && reg !== "load") {
        const open = x.open !== undefined ? !!x.open : ck ? !has(r[ck]) : true;
        if (F.state === "open" && !open) return false;
        if (F.state === "closed" && open) return false;
        if (F.state === "overdue" && x.live !== "Overdue") return false;
        if (F.state === "flagged" && !(x.check && x.check !== "OK")) return false;
        if (F.state === "dueSoon" && !(open && uk && has(r[uk]) && E.diffDays(r[uk], ref) >= 0 && E.diffDays(r[uk], ref) <= 7)) return false;
      }
      if (range && reg !== "load") {
        const [a, b] = range;
        const inR = (d) => has(d) && d >= a && d <= b;
        const mode = F.mode || "raised";
        if (mode === "raised") { if (dk && !inR(r[dk])) return false; }
        else if (mode === "closed") { if (ck && !inR(r[ck])) return false; if (!ck && dk && !inR(r[dk])) return false; }
        else if (mode === "due") { if (uk && !inR(r[uk])) return false; if (!uk && dk && !inR(r[dk])) return false; }
        else if (mode === "active") {
          const start = dk ? r[dk] : null, end = ck ? r[ck] : null;
          if (has(start) && start > b) return false;
          if (has(end) && end < a) return false;
        }
      }
      return true;
    });
  }
  return out;
}

/** The values a dimension can take on a board (for its drop-down). */
export function options(tier, dim, s = store[tier]) {
  if (dim === "state") return STATES;
  if (dim === "reg") return (tier === "t2" ? T2_REGS.filter((r) => r !== "load") : T1_REGS).map((r) => [r, schemaOf(tier, r).short]);
  const vals = new Set();
  const lists = s.lists || {};
  if (dim === "owner") { (tier === "t2" ? lists.People : (s.roster || []).map((o) => o.name))?.forEach((v) => vals.add(v)); (lists.Owners || []).forEach((v) => vals.add(v)); }
  if (dim === "area") (lists.Areas || []).forEach((v) => vals.add(v));
  if (dim === "cls") (lists.DevClass || []).forEach((v) => vals.add(v));
  if (dim === "root") (lists.RootCause || []).forEach((v) => vals.add(v));
  for (const reg of tier === "t2" ? T2_REGS : T1_REGS) {
    const sc = schemaOf(tier, reg);
    const key = sc && fieldFor(sc, dim);
    if (!key) continue;
    for (const r of s[reg] || []) { const v = dim === "product" ? productName(r[key]) : r[key]; if (has(v)) vals.add(String(v)); }
  }
  return [...vals].sort((a, b) => String(a).localeCompare(String(b))).map((v) => [v, v]);
}

/** Short words for the active filters ("Person: Amina · Last 7 days, raised"). */
export function describe(F, tier = "t2") {
  if (!activeCount(F)) return [];
  const out = [];
  if ((F.period || "all") !== "all") {
    const r = periodRange(F);
    const p = PERIODS.find(([k]) => k === F.period)?.[1] || F.period;
    const mode = MODES.find(([k]) => k === (F.mode || "raised"))?.[1] || "";
    out.push(`${p === "Custom range…" ? "Period" : p}${r ? ` (${fmtDate(r[0])} – ${fmtDate(r[1])})` : ""}, ${mode}`);
  }
  for (const [d, def] of Object.entries(DIMS)) {
    if (!has(F[d])) continue;
    const label = d === "state" ? STATES.find(([k]) => k === F[d])?.[1] : d === "reg" ? schemaOf(tier, F[d])?.short : F[d];
    out.push(`${def.label}: ${label}`);
  }
  return out;
}

export const chipsHTML = (F, tier = "t2") => {
  const d = describe(F, tier);
  return d.length ? `<div class="fchips" data-fchips>${d.map((x) => `<span class="fchip">${esc(x)}</span>`).join("")}</div>` : "";
};

/** The filter controls. `dims` lists which dimensions to offer. */
export function filterControls(F, { tier = "t2", dims = Object.keys(DIMS), period = true, inherit = false, s = store[tier] } = {}) {
  F = { ...EMPTY, ...(F || {}) };
  const sel = (name, opts, cur, all) => `<label class="fctl"><span>${esc(DIMS[name]?.label || name)}</span><select data-f="${name}"><option value="">${esc(all)}</option>${opts.map(([v, l]) => `<option value="${esc(v)}" ${String(cur) === String(v) ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></label>`;
  const per = period ? `<label class="fctl"><span>Period</span><select data-f="period">${inherit ? `<option value="inherit" ${F.period === "inherit" ? "selected" : ""}>Same as the page</option>` : ""}${PERIODS.map(([v, l]) => `<option value="${v}" ${F.period === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>
    <label class="fctl" ${F.period === "custom" ? "" : "hidden"} data-custom><span>From</span><input type="date" data-f="from" value="${esc(F.from)}"></label>
    <label class="fctl" ${F.period === "custom" ? "" : "hidden"} data-custom><span>To</span><input type="date" data-f="to" value="${esc(F.to)}"></label>
    <label class="fctl" ${(F.period || "all") === "all" || F.period === "inherit" ? "hidden" : ""} data-mode><span>Count records</span><select data-f="mode">${MODES.map(([v, l]) => `<option value="${v}" ${F.mode === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>` : "";
  const dimsHTML = dims.filter((d) => DIMS[d]).map((d) => {
    const opts = options(tier, d, s);
    return d === "state" || d === "reg" || opts.length ? sel(d, opts, F[d] ?? "", DIMS[d].all) : "";
  }).join("");
  return `${per}${dimsHTML}`;
}

/** Read the controls of a container back into a filter object. */
export function readControls(el) {
  const F = {};
  $$("[data-f]", el).forEach((x) => { if (x.value !== "") F[x.dataset.f] = x.value; });
  if (F.period !== "custom") { delete F.from; delete F.to; }
  return F;
}

/** Wire a container of controls: `onChange(F)` after every change. */
export function wireControls(el, onChange) {
  el.addEventListener("change", (e) => {
    if (!e.target.closest("[data-f]")) return;
    const per = $("[data-f=period]", el)?.value;
    $$("[data-custom]", el).forEach((n) => { n.hidden = per !== "custom"; });
    const m = $("[data-mode]", el); if (m) m.hidden = !per || per === "all" || per === "inherit";
    onChange(readControls(el));
  });
}

/** The page filter bar (Analytics, dashboard, reports): controls + reset + chips. */
export function filterBar(F, { tier = "t2", dims, title = "Filters", note = "", period = true } = {}) {
  const n = activeCount(F);
  return `<details class="fbar card" ${n ? "open" : ""} data-fbar>
    <summary><span class="fbar-t">⚲ ${esc(title)}</span>${n ? `<span class="badge">${n}</span>` : `<span class="muted" style="font-size:12.5px">none — showing everything</span>`}<span class="spacer"></span>${n ? `<button class="btn sm ghost" data-freset type="button">Clear all</button>` : ""}</summary>
    <div class="fgrid">${filterControls(F, { tier, dims, period })}</div>
    ${note ? `<p class="muted" style="margin:8px 0 0;font-size:12px">${note}</p>` : ""}
  </details>`;
}

/** Page filters kept per viewer (they are a view, not data). */
export function pageFilters(key) { return { ...EMPTY, ...(store.prefs.filters?.[key] || {}) }; }
export function setPageFilters(key, F) {
  store.prefs.filters = { ...(store.prefs.filters || {}), [key]: F };
  store.save();
}
export function chartFilters(id) { return store.prefs.chartFilters?.[id] || {}; }
export function setChartFilters(id, F) {
  store.prefs.chartFilters = { ...(store.prefs.chartFilters || {}), [id]: F };
  store.save();
}

/** A chart's own filter panel, opened under its title. `onApply(F)` saves it. */
export function openChartFilter(card, { id, dims, tier = "t2", onApply }) {
  card.querySelector(".cfilter-pop")?.remove();
  const own = { period: "inherit", ...chartFilters(id) };
  const pop = document.createElement("div");
  pop.className = "cfilter-pop";
  pop.dataset.noexport = "";
  pop.innerHTML = `<div class="row" style="margin-bottom:8px"><b style="font-size:13px">Filter this chart</b><span class="spacer"></span><span class="muted" style="font-size:12px">applies on top of the page filters</span></div>
    <div class="fgrid">${filterControls(own, { tier, dims, inherit: true })}</div>
    <div class="row" style="margin-top:10px"><button class="btn sm" data-cclear type="button">Clear this chart's filters</button><span class="spacer"></span><button class="btn sm primary" data-cdone type="button">Done</button></div>`;
  const head = card.querySelector(".card-head");
  head.after(pop);
  wireControls(pop, (F) => onApply(F, false));
  pop.querySelector("[data-cclear]").onclick = () => { onApply({}, true); };
  pop.querySelector("[data-cdone]").onclick = () => { pop.remove(); };
  pop.querySelector("select,input")?.focus();
}
