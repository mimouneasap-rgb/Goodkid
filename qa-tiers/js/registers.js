// Generic register page + record editor for every register of both boards.
// Input columns come from schema.js; ƒx columns are recalculated live from
// engine.js exactly like the navy formula columns of the workbooks.

import { store } from "./store.js";
import * as E from "./engine.js";
import { T1_REGISTERS, T2_REGISTERS, LOCKED_LISTS } from "./schema.js";
import { stackedH } from "./charts.js";
import { esc, pill, fmtDate, pct, fmtNum, toast, confirmDialog, promptDialog, drawer, download, toCSV, $, $$, today } from "./ui.js";

const has = (v) => v !== "" && v != null;
export const schemaOf = (tier, reg) => (tier === "t1" ? T1_REGISTERS : T2_REGISTERS)[reg];

/* ── ƒx columns ─────────────────────────────────────────── */

const daysCell = (v) => (v === "" ? "" : `<span style="color:${v < 0 ? "var(--r)" : v <= 1 ? "var(--a-ink)" : "inherit"};font-weight:600">${v}</span>`);
const checkCell = (v) => (!v ? "" : v === "OK" ? `<span class="pill G">OK</span>` : `<span class="pill R">⚠ ${esc(v)}</span>`);

const FX = {
  generic: [
    { key: "live", label: "Live Status", cell: (c) => pill(c.live) },
    { key: "age", label: "Age / Cycle (d)", num: true, cell: (c) => c.age },
    { key: "toDue", label: "Days to Due", num: true, cell: (c) => daysCell(c.toDue) },
    { key: "onTime", label: "Closed On Time", cell: (c) => pill(c.onTime) },
    { key: "check", label: "Data Check", cell: (c) => checkCell(c.check) },
  ],
  rel: [
    { key: "target", label: "Target Release", cell: (c) => fmtDate(c.target) },
    { key: "lead", label: "Lead Time (d)", num: true, cell: (c) => c.lead },
    { key: "live", label: "Live Status", cell: (c) => pill(c.live) },
    { key: "late", label: "Released Late", cell: (c) => pill(c.late, c.late === "Yes" ? "R" : "G") },
    { key: "check", label: "Data Check", cell: (c) => checkCell(c.check) },
  ],
  trn2: [
    { key: "completion", label: "Completion %", num: true, cell: (c) => pct(c.completion) },
    { key: "live", label: "Live Status", cell: (c) => pill(c.live) },
    { key: "check", label: "Data Check", cell: (c) => checkCell(c.check) },
  ],
  load: [
    { key: "workDays", label: "Working Days", num: true, cell: (c) => c.workDays },
    { key: "absence", label: "Absence (d)", num: true, cell: (c) => `${fmtNum(c.absence)}${c.logged ? ` <span class="muted" title="${c.logged} day(s) from the Tier 1 daily log">(${c.logged} logged)</span>` : ""}` },
    { key: "available", label: "Available Days", num: true, cell: (c) => fmtNum(c.available) },
    { key: "workload", label: "Planned Workload (pd)", num: true, cell: (c) => `<b>${fmtNum(c.workload)}</b>` },
    { key: "util", label: "Utilisation", num: true, cell: (c) => pct(c.util) },
    { key: "delayed", label: "Delayed Tasks", num: true, cell: (c) => (c.delayed ? `<b style="color:var(--r)">${c.delayed}</b>` : "0") },
    { key: "status", label: "Load Status", cell: (c) => pill(c.status) },
    { key: "count", label: "Items", num: true, cell: (c) => c.count },
  ],
  tasks: [
    { key: "effort", label: "Effort (pd)", num: true, cell: (c) => (c.effort === "" ? "" : `${fmtNum(c.effort)}${c.std !== "" && c.effort !== c.std ? ` <span class="muted">(std ${fmtNum(c.std)})</span>` : ""}`) },
    { key: "live", label: "Live Status", cell: (c) => pill(c.live) },
    { key: "toDue", label: "Days to Due", num: true, cell: (c) => daysCell(c.toDue) },
    { key: "check", label: "Data Check", cell: (c) => checkCell(c.check) },
  ],
  dl: [
    { key: "act", label: "Total Activities", num: true, cell: (c) => c.act },
    { key: "check", label: "Data Check", cell: (c) => checkCell(c.check) },
  ],
  br: [
    { key: "lead", label: "Lead Time (d)", num: true, cell: (c) => c.lead },
    { key: "within", label: "Within Target", cell: (c) => pill(c.within) },
    { key: "rft", label: "Right First Time", cell: (c) => pill(c.rft) },
    { key: "live", label: "Live Status", cell: (c) => pill(c.live) },
    { key: "check", label: "Data Check", cell: (c) => checkCell(c.check) },
  ],
  fn: [
    { key: "live", label: "Live Status", cell: (c) => pill(c.live) },
    { key: "onTime", label: "Closed On Time", cell: (c) => pill(c.onTime) },
    { key: "daysOver", label: "Days Overdue", num: true, cell: (c) => (c.daysOver === "" ? "" : `<b style="color:var(--r)">${c.daysOver}</b>`) },
    { key: "check", label: "Data Check", cell: (c) => checkCell(c.check) },
  ],
  hd: [{ key: "check", label: "Data Check", cell: (c) => checkCell(c.check) }],
  tr1: [
    { key: "live", label: "Live Status", cell: (c) => pill(c.live) },
    { key: "check", label: "Data Check", cell: (c) => checkCell(c.check) },
  ],
};
FX.ac = FX.fn;
FX.apqr = [...FX.generic.slice(0, 1), { key: "effPct", label: "Effective %", num: true, cell: (c) => pct(c.effPct) }, ...FX.generic.slice(1)];

function fxSpec(tier, reg) {
  if (tier === "t2") return reg === "rel" ? FX.rel : reg === "trn" ? FX.trn2 : reg === "load" ? FX.load : reg === "tasks" ? FX.tasks : reg === "apqr" ? FX.apqr : FX.generic;
  return reg === "tr" ? FX.tr1 : FX[reg];
}

/** ƒx values of every row of a register. */
export function computeAll(tier, reg) {
  const s = store[tier];
  if (tier === "t2") return E.t2Computed(s)[reg];
  return E.t1Computed(s, s.setup.selDate)[reg];
}

/** ƒx values of a single (draft) record. */
function computeOne(tier, reg, rec, index) {
  const s = store[tier];
  if (tier === "t2") {
    if (reg === "rel") return E.t2Release(rec, s.setup);
    if (reg === "trn") return E.t2Training(rec, s.setup);
    if (reg === "load") return E.t2Load(rec, s, store.t1);
    if (reg === "tasks") {
      const act = E.activityFor(s.activities || E.DEFAULT_ACTIVITIES, "tasks", rec);
      const std = act ? +act.effort : "";
      const c = E.t2Row("tasks", rec, s.setup.statusDate);
      return { ...c, std, effort: has(rec.effort) ? +rec.effort : std, check: c.check === "OK" && !act ? "Activity not in the catalogue" : c.check };
    }
    return E.t2Row(reg, rec, s.setup.statusDate);
  }
  const sel = s.setup.selDate;
  const rows = s[reg].slice();
  if (index == null) rows.push(rec); else rows[index] = rec;
  if (reg === "dl") return { act: E.t1Activities(rec), check: E.t1DailyCheck(rec, rows) };
  if (reg === "br") return E.t1Review(rec, s.setup, sel);
  if (reg === "fn") return E.t1Finding(rec, sel);
  if (reg === "ac") return E.t1Action(rec, sel);
  if (reg === "hd") return { check: E.t1HuddleCheck(rec, rows) };
  return E.t1Training(rec, sel);
}

/* ── Field rendering ────────────────────────────────────── */

export function optionsFor(tier, field) {
  const s = store[tier];
  if (field.type === "roster") return s.roster.map((r) => r.name);
  if (field.type === "activity") return (s.activities || E.DEFAULT_ACTIVITIES).filter((a) => a.reg === "task").map((a) => a.name);
  return s.lists[field.list] || [];
}

export function inputHTML(tier, field, value, { name = field.key, cls = "" } = {}) {
  const v = value ?? "";
  if (field.type === "activity") {
    const acts = (store[tier].activities || E.DEFAULT_ACTIVITIES).filter((a) => a.reg === "task");
    const extra = has(v) && !acts.some((a) => a.name === v) ? `<option value="${esc(v)}" selected>${esc(v)} (not in catalogue)</option>` : "";
    return `<select name="${name}" class="${cls}"><option value="">—</option>${extra}${acts.map((a) => `<option value="${esc(a.name)}" ${a.name === v ? "selected" : ""}>${esc(a.name)} · ${a.effort} pd${a.role ? ` · ${esc(a.role)}` : ""}</option>`).join("")}</select>`;
  }
  if (field.type === "list" || field.type === "roster") {
    const opts = optionsFor(tier, field);
    const extra = has(v) && !opts.includes(v) ? `<option value="${esc(v)}" selected>${esc(v)} (not in list)</option>` : "";
    const canAdd = field.type === "list" && !LOCKED_LISTS.has(field.list);
    return `<select name="${name}" class="${cls}" data-list="${esc(field.list || "")}">
      <option value="">—</option>${extra}${opts.map((o) => `<option ${o === v ? "selected" : ""}>${esc(o)}</option>`).join("")}
      ${canAdd ? `<option value="__add__">＋ Add a value to this list…</option>` : ""}</select>`;
  }
  if (field.type === "long") return `<textarea name="${name}" class="${cls}" rows="2">${esc(v)}</textarea>`;
  if (field.type === "date") return `<div class="inline"><input type="date" name="${name}" class="${cls}" value="${esc(v)}"><button type="button" class="btn sm" data-today="${name}" title="Insert today's date">Today</button></div>`;
  if (field.type === "int" || field.type === "num") return `<input type="number" inputmode="decimal" min="0" step="${field.type === "int" ? 1 : 0.5}" name="${name}" class="${cls}" value="${esc(v)}">`;
  if (field.type === "pct") return `<div class="suffix"><input type="number" min="0" max="100" step="5" name="${name}" class="${cls}" value="${v === "" ? "" : Math.round(v * 100)}"><span>%</span></div>`;
  return `<input type="text" name="${name}" class="${cls}" value="${esc(v)}" autocomplete="off">`;
}

export function readField(field, raw) {
  if (raw === "" || raw == null) return undefined;
  if (field.type === "int" || field.type === "num") return Number(raw);
  if (field.type === "pct") return Math.max(0, Math.min(100, Number(raw))) / 100;
  return typeof raw === "string" ? raw.trim() || undefined : raw;
}

/** Wire "Today" buttons and "Add a value…" options inside a container. */
export function wireInputs(root, tier, fields, onChange) {
  root.addEventListener("click", (e) => {
    const b = e.target.closest("[data-today]");
    if (!b) return;
    const inp = root.querySelector(`[name="${b.dataset.today}"]`);
    inp.value = today();
    inp.dispatchEvent(new Event("change", { bubbles: true }));
  });
  root.addEventListener("change", async (e) => {
    const sel = e.target;
    if (sel.tagName === "SELECT" && sel.value === "__add__") {
      const listName = sel.dataset.list;
      const val = await promptDialog({ title: "Add a value", label: `New value for the list “${listName}”` });
      if (val) {
        const list = store[tier].lists[listName] ??= [];
        if (!list.includes(val)) list.push(val);
        store.log(tier, { reg: "lists", ref: listName, action: "edit", changes: [{ field: "value", from: "", to: val }] });
        store.save(tier);
        const opt = document.createElement("option");
        opt.textContent = val;
        sel.insertBefore(opt, sel.querySelector('option[value="__add__"]'));
        sel.value = val;
        toast(`“${val}” added to ${listName}`);
      } else sel.value = "";
    }
    onChange?.(e);
  });
}

/* ── Editor drawer ──────────────────────────────────────── */

export function openEditor({ tier, reg, index = null, prefill = null, onSaved }) {
  const sc = schemaOf(tier, reg);
  const s = store[tier];
  const idKey = sc.idKey || "id";
  const isNew = index == null;
  const rec = isNew ? { ...(prefill || {}) } : { ...s[reg][index] };
  if (isNew && idKey === "id" && !rec.id) rec.id = E.nextId(s[reg], "id", sc.idHint || "NEW-001");
  const label = (r) => (idKey === "date" ? `${fmtDate(r.date)}${r.officer ? ` · ${r.officer}` : ""}` : r[idKey] || "new record");

  let groups = "", lastGroup = null;
  for (const f of sc.fields) {
    if (f.group && f.group !== lastGroup) { groups += `<div class="form-group-title">${esc(f.group)}</div>`; lastGroup = f.group; }
    const full = f.type === "long" ? " full" : "";
    groups += `<label class="field${full}" data-f="${f.key}"><span>${esc(f.label)}${f.req ? '<i class="req">*</i>' : ""}</span>
      ${inputHTML(tier, f, rec[f.key])}${f.help ? `<small>${esc(f.help)}</small>` : ""}</label>`;
  }
  const body = `<div data-fx></div><div data-flag></div><form class="form-grid" autocomplete="off">${groups}</form>${reg === "load" ? `<div data-breakdown style="margin-top:18px"></div>` : ""}`;
  const footer = `${isNew ? "" : `<button class="btn danger" data-del>Delete</button><button class="btn" data-dup>Duplicate</button>`}
    <span class="spacer"></span><span class="muted" style="font-size:12px">Ctrl + Enter saves</span><button class="btn" data-cancel>Cancel</button><button class="btn primary" data-save>${isNew ? "Add record" : "Save changes"}</button>`;
  const sub = `<div class="meta-row"><span>${esc(sc.no)} · ${esc(sc.title)}</span>${sc.source ? `<span>Source: <b>${esc(sc.source)}</b></span>` : ""}<span>Cream = you type · ƒx = automatic</span></div>`;
  const { el, close } = drawer({ title: isNew ? `New · ${esc(sc.title)}` : `Edit · ${esc(label(rec))}`, sub, body, footer, wide: reg === "load" });
  const form = $("form", el);

  const read = () => {
    const out = {};
    for (const f of sc.fields) {
      const v = readField(f, form.elements[f.key].value);
      if (v !== undefined) out[f.key] = v;
    }
    return out;
  };
  const refresh = () => {
    const draft = read();
    const c = computeOne(tier, reg, draft, index);
    const items = fxSpec(tier, reg).filter((x) => x.key !== "check").map((x) => `<div class="fxi"><small>ƒx ${esc(x.label)}</small><b>${x.cell(c) || "—"}</b></div>`).join("");
    $("[data-fx]", el).innerHTML = items ? `<div class="fx-panel">${items}</div>` : "";
    const flag = c.check && c.check !== "OK" ? `<div class="flag-msg">⚠ Data check: ${esc(c.check)}</div>` : c.check === "OK" ? `<div class="ok-msg">✓ Data check: record consistent</div>` : "";
    $("[data-flag]", el).innerHTML = flag;
    if (reg === "load") $("[data-breakdown]", el).innerHTML = breakdownHTML(c, s.setup);
  };
  wireInputs(el, tier, sc.fields, refresh);
  form.addEventListener("input", refresh);
  refresh();

  const save = () => {
    const draft = read();
    const missing = sc.fields.filter((f) => f.req && !has(draft[f.key]));
    $$(".field.err", el).forEach((x) => x.classList.remove("err"));
    if (missing.length) {
      missing.forEach((f) => $(`[data-f="${f.key}"]`, el).classList.add("err"));
      toast(`Fill the required field${missing.length > 1 ? "s" : ""}: ${missing.map((f) => f.label).join(", ")}`);
      return;
    }
    if (idKey === "id" && s[reg].some((r, i) => i !== index && r.id === draft.id)) {
      $(`[data-f="id"]`, el).classList.add("err");
      toast(`${draft.id} already exists — one record, one row`);
      return;
    }
    const i = store.upsert(tier, reg, index, draft, label(draft));
    close();
    toast(isNew ? `${label(draft)} added` : `${label(draft)} saved`);
    onSaved?.(i);
  };
  $("[data-save]", el).onclick = save;
  $("[data-cancel]", el).onclick = close;
  el.addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) save(); });
  $("[data-dup]", el)?.addEventListener("click", () => {
    const copy = read();
    if (idKey === "id") copy.id = E.nextId(s[reg], "id");
    for (const k of ["closed", "done", "decision"]) delete copy[k];
    close();
    openEditor({ tier, reg, prefill: copy, onSaved });
  });
  $("[data-del]", el)?.addEventListener("click", async () => {
    const ok = await confirmDialog({
      title: `Delete ${esc(label(rec))}?`,
      body: `<p>The record leaves the register and every KPI is recalculated. Registers normally stay cumulative — closed records remain for traceability and trending. Delete only an entry made by mistake.</p>`,
      ok: "Delete record", danger: true,
    });
    if (!ok) return;
    const removed = s[reg][index];
    store.remove(tier, reg, index, label(rec));
    close();
    onSaved?.(null);
    toast(`${label(rec)} deleted`, { label: "Undo", run: () => { store.upsert(tier, reg, null, removed, label(removed)); onSaved?.(null); } });
  });
  setTimeout(() => form.querySelector("input,select,textarea")?.focus(), 50);
}

/** Where a team member's workload comes from (QA Load form). */
function breakdownHTML(c, setup) {
  if (!c.items?.length) return `<div class="empty">No record is assigned to this name in ${esc(setup.month.slice(0, 7))}. Assign work in the registers (Owner, Inspector, Trainer, Releasing Officer) or in the Task planner.</div>`;
  const bySrc = {};
  for (const it of c.items) bySrc[it.source] = (bySrc[it.source] || 0) + it.days;
  return `<div class="card-head"><h2>ƒx Workload breakdown <span class="sub">${c.count} items · ${fmtNum(c.workload)} person-days this month</span></h2></div>
    <div class="chips" style="margin-bottom:10px">${Object.entries(bySrc).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<span class="pill info">${esc(k)} · ${fmtNum(Math.round(v * 10) / 10)} pd</span>`).join("")}</div>
    <div class="table-wrap"><table class="plain"><thead><tr><th>Source</th><th>Ref.</th><th>Activity</th><th class="num">Std effort</th><th class="num">In month</th><th class="num">This month (pd)</th><th></th></tr></thead><tbody>
    ${c.items.map((it) => `<tr><td>${esc(it.source)}</td><td class="mono">${esc(it.ref)}</td><td>${esc(it.activity)}<br><span class="muted" style="font-size:12px">${esc(it.desc)}</span></td><td class="num">${fmtNum(it.effort)}</td><td class="num">${pct(it.share)}</td><td class="num"><b>${fmtNum(Math.round(it.days * 100) / 100, 2)}</b></td><td>${it.overdue ? pill("Overdue", "R") : it.done ? pill("Done", "G") : ""}</td></tr>`).join("")}
    </tbody></table></div>
    <p class="muted" style="font-size:12px;margin:8px 0 0">Each record's standard effort (Setup › QA activities) is spread evenly from its start to its closure — or to its due date / the as-of date while open — and only the part falling in this month counts. Delayed tasks = open items past their due date.</p>`;
}

/** Team workload chart above the QA Load register. */
function loadPanel(comp, setup) {
  const sources = Object.values(E.LOAD_SOURCES);
  const cls = ["f-R", "f-s3", "f-s4", "f-s2", "f-s1", "f-s5", "f-s6", "f-A", "f-N", "f-s7", "f-s8"];
  const rows = store.t2.load.map((r, i) => {
    const by = {};
    for (const it of comp[i].items) by[it.source] = (by[it.source] || 0) + it.days;
    return { label: r.member, parts: sources.map((src, k) => ({ name: src, value: Math.round((by[src] || 0) * 10) / 10, cls: cls[k] })) };
  });
  const used = sources.map((src, k) => ({ src, k })).filter(({ src }) => rows.some((r) => r.parts.find((p) => p.name === src).value));
  return `<div class="card card-pad" style="margin-bottom:14px"><div class="card-head"><h2>Planned workload by source <span class="sub">person-days in ${esc(setup.month.slice(0, 7))} · click a member below for the detail</span></h2><a class="btn sm" href="#/t2/setup">Effort catalogue ›</a></div>
    ${stackedH(rows, { width: 720, labelW: 150 })}
    <div class="chart-legend">${used.map(({ src, k }) => `<span><i class="bg-${cls[k].slice(2)}"></i>${esc(src)}</span>`).join("")}</div></div>`;
}

/* ── Register page ──────────────────────────────────────── */

const viewState = {};

export function renderRegister(root, { tier, reg, query = {} }) {
  const sc = schemaOf(tier, reg);
  const s = store[tier];
  const key = `${tier}.${reg}`;
  const vs = viewState[key] ??= { q: "", status: "", officer: "", flagged: false, sort: null, dir: 1, limit: 80 };
  if (query.flag) vs.flagged = true;
  const fx = fxSpec(tier, reg);
  const fieldsByKey = Object.fromEntries(sc.fields.map((f) => [f.key, f]));
  const dateKey = sc.dateKey || (fieldsByKey.opened ? "opened" : fieldsByKey.date ? "date" : fieldsByKey.mfg ? "mfg" : null);

  const draw = () => {
    const comp = computeAll(tier, reg);
    const rows = s[reg].map((r, i) => ({ r, c: comp[i], i }));
    const ref = tier === "t2" ? s.setup.statusDate : s.setup.selDate;
    const mS = tier === "t2" ? E.monthStart(s.setup.month) : E.monthStart(ref);
    const mE = tier === "t2" ? E.monthEnd(s.setup.month) : ref;
    const total = rows.length;
    const active = rows.filter((x) => x.c.open).length;
    const overdue = rows.filter((x) => x.c.live === "Overdue").length;
    const fresh = dateKey ? rows.filter((x) => has(x.r[dateKey]) && x.r[dateKey] >= mS && x.r[dateKey] <= mE).length : null;
    const flaggedN = rows.filter((x) => x.c.check && x.c.check !== "OK").length;
    const liveValues = [...new Set(rows.map((x) => x.c.live || x.c.status || x.r.status || x.r.att).filter(Boolean))];

    let list = rows;
    if (vs.q) {
      const q = vs.q.toLowerCase();
      list = list.filter((x) => Object.values(x.r).some((v) => String(v).toLowerCase().includes(q)));
    }
    if (vs.status) list = list.filter((x) => (x.c.live || x.c.status || x.r.status || x.r.att) === vs.status);
    if (vs.officer) list = list.filter((x) => x.r.officer === vs.officer);
    if (vs.flagged) list = list.filter((x) => x.c.check && x.c.check !== "OK");
    const sortKey = vs.sort ?? (sc.sortDesc ? dateKey : null);
    const dir = vs.sort ? vs.dir : sc.sortDesc ? -1 : 1;
    if (sortKey) {
      list = list.slice().sort((a, b) => {
        const av = a.r[sortKey] ?? a.c[sortKey] ?? "", bv = b.r[sortKey] ?? b.c[sortKey] ?? "";
        const cmp = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv), undefined, { numeric: true });
        return cmp * dir || a.i - b.i;
      });
    }
    const shown = list.slice(0, vs.limit);

    const cols = sc.table.map((k) => fieldsByKey[k]);
    const arrow = (k) => (sortKey === k ? `<span class="arr">${dir > 0 ? "▲" : "▼"}</span>` : "");
    const head = cols.map((f) => `<th data-sort="${f.key}" class="${["int", "num", "pct"].includes(f.type) ? "num" : ""}">${esc(f.label)}${arrow(f.key)}</th>`).join("")
      + fx.map((x) => `<th class="fx ${x.num ? "num" : ""}" data-sort="${x.key}">ƒx ${esc(x.label)}${arrow(x.key)}</th>`).join("");
    const cell = (f, v) => {
      if (!has(v)) return `<td></td>`;
      if (f.type === "date") return `<td style="white-space:nowrap">${fmtDate(v)}</td>`;
      if (f.type === "pct") return `<td class="num">${pct(v)}</td>`;
      if (f.type === "int" || f.type === "num") return `<td class="num">${fmtNum(v)}</td>`;
      if (f.type === "long" || f.key === "desc" || f.key === "title" || f.key === "topic" || /^p\d$/.test(f.key)) return `<td class="wrap"><div class="clip">${esc(v)}</div></td>`;
      if (f.key === "status" || f.key === "att" || f.list === "DayStatus" || f.list === "Severity" || f.list === "DevClass") return `<td>${pill(v)}</td>`;
      if (f.key === (sc.idKey || "id")) return `<td class="mono" style="white-space:nowrap">${esc(v)}</td>`;
      return `<td>${esc(v)}</td>`;
    };
    const body = shown.map(({ r, c, i }) => `<tr data-i="${i}" class="${c.check && c.check !== "OK" ? "flag" : ""}">${cols.map((f) => cell(f, r[f.key])).join("")}${fx.map((x) => `<td class="fx ${x.num ? "num" : ""}">${x.cell(c) ?? ""}</td>`).join("")}</tr>`).join("");

    const loadTotal = (k) => rows.reduce((a, x) => a + (+x.c[k] || 0), 0);
    const teamUtil = loadTotal("available") > 0 ? loadTotal("workload") / loadTotal("available") : "";
    const stats = reg === "load" ? [
      ["Team members", total, ""], ["Planned workload (pd)", fmtNum(Math.round(loadTotal("workload") * 10) / 10), ""],
      ["Available (pd)", fmtNum(loadTotal("available")), ""],
      ["Team utilisation", pct(teamUtil), teamUtil === "" ? "" : teamUtil > s.setup.overLoad ? "R" : teamUtil >= s.setup.highLoad ? "A" : "G"],
      ["Delayed tasks", loadTotal("delayed"), loadTotal("delayed") ? "R" : "G"],
    ] : [
      ["Total", total, ""], ["Active", active, ""],
      ...(reg === "load" || reg === "dl" || reg === "hd" ? [] : [["Overdue", overdue, overdue ? "R" : "G"]]),
      ...(fresh != null ? [[tier === "t1" ? "Month to date" : "New this month", fresh, ""]] : []),
    ];
    const officers = tier === "t1" && fieldsByKey.officer ? s.roster.map((o) => o.name) : [];
    root.innerHTML = `
      <div class="reg-head">
        <div class="reg-no">${esc(sc.no)}</div>
        <div><div class="eyebrow">${tier === "t1" ? "Tier 1 · Huddle board" : "Tier 2 · Daily management"} · register</div>
          <h1 style="font-size:28px;margin-top:4px">${esc(sc.title)}</h1>
          <p class="muted" style="margin:4px 0 0;max-width:780px">${esc(sc.lead)}</p>
          <div class="meta-row">${sc.source ? `<span>Source <b>${esc(sc.source)}</b></span>` : ""}<span>Collected by <b>${esc(sc.who)}</b></span><span>When <b>${esc(sc.when)}</b></span>
          ${sc.lifecycle?.length ? `<span class="lifecycle">${sc.lifecycle.map((x) => `<span>${esc(x)}</span>`).join("<i>→</i>")}</span>` : ""}</div>
        </div>
        <div class="row"><button class="btn" data-csv>Export CSV</button><button class="btn primary" data-new>＋ New record</button></div>
      </div>
      <div class="strip">
        ${stats.map(([l, v, c]) => `<div class="stat ${c}"><div class="s-l">${l}</div><div class="s-v">${v}</div></div>`).join("")}
        ${fx.some((x) => x.key === "check") ? `<button class="check-strip ${flaggedN ? "bad" : "ok"}" data-flagbtn>${flaggedN ? `⚠ Data check: ${flaggedN} record${flaggedN > 1 ? "s" : ""} need attention — ${vs.flagged ? "show all" : "show them"}` : "✓ Data check: all records consistent"}</button>` : ""}
      </div>
      ${tier === "t2" && reg === "load" ? loadPanel(comp, s.setup) : ""}
      <div class="toolbar">
        <input type="search" placeholder="Search this register…" value="${esc(vs.q)}" data-q aria-label="Search">
        <select data-status aria-label="Filter by status"><option value="">All statuses</option>${liveValues.map((v) => `<option ${v === vs.status ? "selected" : ""}>${esc(v)}</option>`).join("")}</select>
        ${officers.length ? `<select data-officer aria-label="Filter by officer"><option value="">All officers</option>${officers.map((o) => `<option ${o === vs.officer ? "selected" : ""}>${esc(o)}</option>`).join("")}</select>` : ""}
        <label class="row" style="gap:6px;font-size:13px"><input type="checkbox" data-flagged ${vs.flagged ? "checked" : ""}> Flagged only</label>
        <span class="spacer"></span><span class="muted" style="font-size:12.5px">${list.length} of ${total} shown · click a row to edit · ƒx columns are automatic</span>
      </div>
      <div class="table-wrap"><table class="data"><thead><tr>${head}</tr></thead><tbody>${body || `<tr><td colspan="${cols.length + fx.length}"><div class="empty">No record matches — clear the filters or add a new record.</div></td></tr>`}</tbody></table></div>
      ${list.length > vs.limit ? `<div style="text-align:center;margin-top:12px"><button class="btn" data-more>Show all ${list.length} records</button></div>` : ""}`;

    $("[data-q]", root).oninput = (e) => { vs.q = e.target.value; const pos = e.target.selectionStart; draw(); const inp = $("[data-q]", root); inp.focus(); inp.setSelectionRange(pos, pos); };
    $("[data-status]", root).onchange = (e) => { vs.status = e.target.value; draw(); };
    $("[data-officer]", root)?.addEventListener("change", (e) => { vs.officer = e.target.value; draw(); });
    $("[data-flagged]", root).onchange = (e) => { vs.flagged = e.target.checked; draw(); };
    $("[data-flagbtn]", root)?.addEventListener("click", () => { if (flaggedN || vs.flagged) { vs.flagged = !vs.flagged; draw(); } });
    $("[data-more]", root)?.addEventListener("click", () => { vs.limit = Infinity; draw(); });
    $("[data-new]", root).onclick = () => openEditor({ tier, reg, onSaved: draw });
    $("[data-csv]", root).onclick = () => {
      const comp2 = computeAll(tier, reg);
      const csv = toCSV([[...sc.fields.map((f) => f.label), ...fx.map((x) => `fx ${x.label}`)],
        ...s[reg].map((r, i) => [...sc.fields.map((f) => (f.type === "pct" && has(r[f.key]) ? Math.round(r[f.key] * 100) + "%" : r[f.key] ?? "")), ...fx.map((x) => comp2[i][x.key] ?? "")])]);
      download(`${tier.toUpperCase()}_${sc.title.replace(/\W+/g, "_")}.csv`, csv, "text/csv");
    };
    $$("th[data-sort]", root).forEach((th) => th.onclick = () => {
      const k = th.dataset.sort;
      if (vs.sort === k) vs.dir = -vs.dir; else { vs.sort = k; vs.dir = 1; }
      draw();
    });
    $("tbody", root).onclick = (e) => {
      const tr = e.target.closest("tr[data-i]");
      if (tr) openEditor({ tier, reg, index: +tr.dataset.i, onSaved: draw });
    };
  };
  draw();

  if (query.id) {
    const idKey = sc.idKey || "id";
    const i = s[reg].findIndex((r) => r[idKey] === query.id);
    if (i >= 0) openEditor({ tier, reg, index: i, onSaved: draw });
  }
  if (query.new) {
    let prefill = null;
    try { prefill = query.prefill ? JSON.parse(decodeURIComponent(query.prefill)) : null; } catch { prefill = null; }
    openEditor({ tier, reg, prefill, onSaved: draw });
  }
}
