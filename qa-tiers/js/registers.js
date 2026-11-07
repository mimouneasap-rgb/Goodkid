// Generic register page + record editor for every register of both boards.
// Input columns come from schema.js; ƒx columns are recalculated live from
// engine.js exactly like the navy formula columns of the workbooks.

import { store } from "./store.js";
import * as E from "./engine.js";
import { T1_REGISTERS, T2_REGISTERS, LOCKED_LISTS } from "./schema.js";
import { stackedH } from "./charts.js";
import { PRACTICE } from "./learn.js";
import { saveFile, decorateCharts } from "./export.js";
import { registerCharts } from "./regcharts.js";
import { DEMO_T1, DEMO_T2 } from "./demo-data.js";
import { esc, pill, fmtDate, pct, fmtNum, toast, confirmDialog, promptDialog, drawer, download, toCSV, $, $$, today } from "./ui.js";

const has = (v) => v !== "" && v != null;
export const schemaOf = (tier, reg) => (tier === "t1" ? T1_REGISTERS : T2_REGISTERS)[reg];

/* ── ƒx columns ─────────────────────────────────────────── */

const daysCell = (v) => (v === "" ? "" : `<span style="color:${v < 0 ? "var(--r)" : v <= 1 ? "var(--a-ink)" : "inherit"};font-weight:600">${v}</span>`);
const checkCell = (v) => (!v ? "" : v === "OK" ? `<span class="pill G">OK</span>` : `<span class="pill R">⚠ ${esc(v)}</span>`);

const actionsCell = (c) => (!c.actions ? "" : `${c.actions.open ? `<b>${c.actions.open}</b> open` : "all done"}${c.actions.overdue ? ` · <b style="color:var(--r)">${c.actions.overdue} overdue</b>` : ""} <span class="muted">/ ${c.actions.total}</span>`);

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
  if (tier === "t2" && ["dev", "capa", "acapa", "cc", "find"].includes(reg)) return [...FX.generic.slice(0, 3), { key: "actions", label: "Actions", cell: actionsCell }, ...(reg === "find" ? [{ key: "capa", label: "CAPA", cell: (c) => (c.capa ? esc(c.capa.join(", ")) : "") }] : []), ...FX.generic.slice(3)];
  if (tier === "t2" && reg === "aud") return [...FX.generic.slice(0, 3), { key: "findings", label: "Findings", cell: (c) => (c.findings ? `${c.findings.open} open / ${c.findings.total}${c.findings.overdue ? ` · <b style="color:var(--r)">${c.findings.overdue} overdue</b>` : ""}` : "") }, { key: "actions", label: "Actions", cell: actionsCell }, ...FX.generic.slice(3)];
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
    const c = E.t2Row(reg, rec, s.setup.statusDate);
    if (["dev", "capa", "acapa", "cc", "aud", "find"].includes(reg) && index != null) { const x = E.t2Computed(s)[reg][index]; c.actions = x?.actions || null; c.findings = x?.findings || null; c.capa = x?.capa || null; }
    return c;
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

/** The records a reference field can point to, register by register. */
export function refOptions(tier, field) {
  const R = tier === "t1" ? T1_REGISTERS : T2_REGISTERS;
  return field.refs.filter((g) => R[g] && Array.isArray(store[tier][g])).map((g) => {
    const idKey = R[g].idKey || "id";
    let rows = store[tier][g].filter((x) => has(x[idKey]));
    if (field.refWhere) rows = rows.filter((x) => Object.entries(field.refWhere).every(([k, v]) => x[k] === v));
    rows = rows.slice().sort((a, b) => String(b[idKey]).localeCompare(String(a[idKey]), undefined, { numeric: true }));
    return { reg: g, short: R[g].short, rows: rows.map((x) => ({ id: String(x[idKey]), label: String(x.desc || x.title || x.product || x.topic || x.member || "").replace(/\s+/g, " ").slice(0, 70) })) };
  });
}
/** The register a reference points into. */
export function regOfRef(tier, field, id) {
  if (!has(id)) return null;
  const R = tier === "t1" ? T1_REGISTERS : T2_REGISTERS;
  return field.refs.find((g) => R[g] && (store[tier][g] || []).some((x) => String(x[R[g].idKey || "id"]) === String(id))) || null;
}

export function inputHTML(tier, field, value, { name = field.key, cls = "", reg = null } = {}) {
  const v = value ?? "";
  if (field.type === "ref") {
    const groups = refOptions(tier, field);
    const known = groups.some((g) => g.rows.some((x) => x.id === String(v)));
    return `<div class="inline"><select name="${name}" class="${cls}" data-ref="${field.key}"><option value="">— none —</option>${has(v) && !known ? `<option value="${esc(v)}" selected>${esc(v)} (not on the board)</option>` : ""}
      ${groups.map((g) => `<optgroup label="${esc(g.short)} (${g.rows.length})" data-reg="${g.reg}">${g.rows.map((x) => `<option value="${esc(x.id)}" ${x.id === String(v) ? "selected" : ""}>${esc(x.id)} — ${esc(x.label)}</option>`).join("")}</optgroup>`).join("")}</select>
      <a class="btn sm" data-reflink="${field.key}" hidden title="Open the linked record (save first)">Open ›</a></div>`;
  }
  if (field.type === "text" && reg && field.key !== "id") {
    // free text that proposes the values already used (and the list it names)
    const vals = new Set((field.suggest ? store[tier].lists[field.suggest] || [] : []));
    for (const x of store[tier][reg] || []) if (has(x[field.key])) vals.add(String(x[field.key]));
    if (vals.size) return `<input type="text" name="${name}" class="${cls}" value="${esc(v)}" autocomplete="off" list="sg-${reg}-${field.key}"><datalist id="sg-${reg}-${field.key}">${[...vals].slice(0, 300).map((x) => `<option value="${esc(x)}">`).join("")}</datalist>`;
  }
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
  if (field.type === "people") {
    // tick the people: the team list first, then any other name already on the record; free names can be added
    const chosen = String(v || "").split(",").map((x) => x.trim()).filter(Boolean);
    const team = optionsFor(tier, { type: "list", list: "People" });
    const loadNames = (store[tier].load || []).map((r) => r.member).filter(Boolean);
    const first = [...new Set([...loadNames, ...chosen])];
    const rest = team.filter((p) => !first.includes(p));
    const box = (p) => `<label class="pp ${chosen.includes(p) ? "on" : ""}"><input type="checkbox" value="${esc(p)}" ${chosen.includes(p) ? "checked" : ""}> ${esc(p)}</label>`;
    return `<div class="people-pick ${cls}" data-people="${name}"${field.countInto ? ` data-count="${field.countInto}"` : ""}>
      <input type="hidden" name="${name}" value="${esc(chosen.join(", "))}">
      <div class="pp-head"><b data-ppn>${chosen.length}</b> selected <span class="spacer"></span><button type="button" class="btn sm ghost" data-ppall>QA team</button><button type="button" class="btn sm ghost" data-ppnone>None</button></div>
      <div class="pp-list">${first.map(box).join("")}</div>
      ${rest.length ? `<details class="pp-more"><summary>Other people (${rest.length})</summary><div class="pp-list">${rest.map(box).join("")}</div></details>` : ""}
      <div class="inline" style="margin-top:6px"><input type="text" data-ppadd placeholder="Add a name (e.g. a trainee from another department)" autocomplete="off"><button type="button" class="btn sm" data-ppaddbtn>Add</button></div>
    </div>`;
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
  // reference fields: the parent registers allowed by the type field, and a link to the chosen record
  const refFields = (fields || []).filter((f) => f.type === "ref");
  const syncRefs = (e) => {
    for (const f of refFields) {
      const sel = root.querySelector(`[data-ref="${f.key}"]`);
      if (!sel) continue;
      if (f.refBy) {
        const by = root.querySelector(`[name="${f.refBy.field}"]`)?.value;
        const allowed = f.refBy.map[by];
        sel.querySelectorAll("optgroup").forEach((g) => { g.hidden = !!allowed && !allowed.includes(g.dataset.reg); });
        // the type was just changed: a record of another register no longer fits
        if (e?.target?.name === f.refBy.field && sel.selectedOptions[0]?.parentElement?.hidden) sel.value = "";
      }
      const link = root.querySelector(`[data-reflink="${f.key}"]`);
      const g = regOfRef(tier, f, sel.value);
      if (link) { link.hidden = !g; if (g) link.href = `#/${tier}/reg/${g}?id=${encodeURIComponent(sel.value)}`; }
    }
  };
  if (refFields.length) { syncRefs(); root.addEventListener("change", syncRefs); }
  // people pickers: the hidden value, the count, and the number field it fills
  root.querySelectorAll("[data-people]").forEach((pp) => {
    const team = (store[tier].load || []).filter((r) => /\bQA\b/i.test(r.role || "")).map((r) => r.member).filter(Boolean);
    const sync = () => {
      const names = [...pp.querySelectorAll("input[type=checkbox]:checked")].map((c) => c.value);
      pp.querySelector("input[type=hidden]").value = names.join(", ");
      pp.querySelector("[data-ppn]").textContent = names.length;
      pp.querySelectorAll("label.pp").forEach((l) => l.classList.toggle("on", l.querySelector("input").checked));
      const target = pp.dataset.count && root.querySelector(`[name="${pp.dataset.count}"]`);
      if (target) target.value = names.length || "";
    };
    pp.addEventListener("change", (e) => { if (e.target.matches("input[type=checkbox]")) sync(); });
    pp.querySelector("[data-ppall]").onclick = () => { pp.querySelectorAll("input[type=checkbox]").forEach((c) => { if (team.includes(c.value)) c.checked = true; }); sync(); };
    pp.querySelector("[data-ppnone]").onclick = () => { pp.querySelectorAll("input[type=checkbox]").forEach((c) => { c.checked = false; }); sync(); };
    const add = () => {
      const inp = pp.querySelector("[data-ppadd]"), n = inp.value.trim();
      if (!n) return;
      const exist = [...pp.querySelectorAll("input[type=checkbox]")].find((c) => c.value.toLowerCase() === n.toLowerCase());
      if (exist) exist.checked = true;
      else pp.querySelector(".pp-list").insertAdjacentHTML("beforeend", `<label class="pp on"><input type="checkbox" value="${esc(n)}" checked> ${esc(n)}</label>`);
      inp.value = ""; sync();
    };
    pp.querySelector("[data-ppaddbtn]").onclick = add;
    pp.querySelector("[data-ppadd]").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); add(); } });
  });
  // a date that closes the record (e.g. a training's completion date) sets the status with it
  for (const f of (fields || []).filter((x) => x.setsStatus)) {
    root.addEventListener("change", (e) => {
      if (e.target.name !== f.key || !e.target.value) return;
      const st = root.querySelector('[name="status"]');
      if (st && !["Completed", "Cancelled", f.setsStatus].includes(st.value)) {
        st.value = f.setsStatus;
        st.dispatchEvent(new Event("change", { bubbles: true }));
        st.classList.add("flash"); setTimeout(() => st.classList.remove("flash"), 1200);
      }
    });
  }
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

/** Mark a practice entry against its answer key. */
function checkPractice(expect, draft, sc) {
  return Object.entries(expect).map(([key, m]) => {
    const f = sc.fields.find((x) => x.key === key);
    const v = draft[key];
    const ok = m.any ? has(v) : m.empty ? !has(v) : m.has ? has(v) && String(v).toLowerCase().includes(m.has.toLowerCase()) : String(v ?? "") === String(m.eq);
    const want = m.any ? "any value" : m.empty ? "left blank" : m.has ? `contains “${m.has}”` : f?.type === "date" ? fmtDate(m.eq) : String(m.eq);
    return { key, label: f?.label || key, ok, want, got: has(v) ? (f?.type === "date" ? fmtDate(v) : String(v)) : "—" };
  });
}

export function openEditor({ tier, reg, index = null, prefill = null, onSaved, practice = null }) {
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
      ${inputHTML(tier, f, rec[f.key], { reg })}${f.help ? `<small>${esc(f.help)}</small>` : ""}</label>`;
  }
  const body = `${practice ? `<div class="callout" style="margin-bottom:12px"><b>Practice · event ${practice.n + 1}.</b> ${esc(practice.text)}</div><div data-practice></div>` : ""}<div data-fx></div><div data-flag></div><form class="form-grid" autocomplete="off">${groups}</form>${reg === "load" ? `<div data-breakdown style="margin-top:18px"></div>` : ""}${isNew ? "" : linksHTML(tier, reg, rec)}`;
  const footer = practice
    ? `<span class="pill info">Practice mode — nothing is saved</span><span class="spacer"></span><button class="btn" data-cancel>Close</button><button class="btn primary" data-check>✓ Check my entry</button>`
    : `${isNew ? "" : `<button class="btn danger" data-del>Delete</button><button class="btn" data-dup>Duplicate</button>`}
    <span class="spacer"></span><span class="muted" style="font-size:12px">Ctrl + Enter saves</span><button class="btn" data-cancel>Cancel</button><button class="btn primary" data-save>${isNew ? "Add record" : "Save changes"}</button>`;
  const sub = `<div class="meta-row"><span>${esc(sc.no)} · ${esc(sc.title)}</span>${sc.source ? `<span>Source: <b>${esc(sc.source)}</b></span>` : ""}<span>Cream = you type · ƒx = automatic</span></div>`;
  const { el, close } = drawer({ title: `${practice ? "Practice · " : ""}${isNew ? `New · ${esc(sc.title)}` : `Edit · ${esc(label(rec))}`}`, sub, body, footer, wide: reg === "load", onClose: practice && store.viewing?.kind === "practice" ? () => store.exitView() : undefined });
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
  if (practice) {
    $("[data-check]", el).onclick = () => {
      const res = checkPractice(practice.expect, read(), sc);
      const right = res.filter((r) => r.ok).length;
      $$(".field.err", el).forEach((x) => x.classList.remove("err"));
      res.filter((r) => !r.ok).forEach((r) => $(`[data-f="${r.key}"]`, el)?.classList.add("err"));
      $("[data-practice]", el).innerHTML = `<div class="${right === res.length ? "ok-msg" : "flag-msg"}">${right === res.length ? "✓ Correct — every field matches the answer key. In real life this record is ready to save." : `${right} of ${res.length} fields right — fix the fields marked in red.`}</div>
        <table class="plain" style="margin-bottom:12px"><thead><tr><th>Field</th><th>Your entry</th><th>Expected</th><th></th></tr></thead><tbody>${res.map((r) => `<tr><td>${esc(r.label)}</td><td>${esc(r.got)}</td><td class="muted">${esc(r.want)}</td><td>${r.ok ? pill("✓", "G") : pill("✗", "R")}</td></tr>`).join("")}</tbody></table>`;
      $(".body", el).scrollTop = 0;
    };
    $("[data-cancel]", el).onclick = close;
    setTimeout(() => form.querySelector("input,select,textarea")?.focus(), 50);
    return;
  }
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

/** The eQMS actions raised under a quality event, CAPA or change control. */
/** Linked records of a record: its parents (reference fields) and every record that points to it. */
function linksHTML(tier, reg, rec) {
  const R = tier === "t1" ? T1_REGISTERS : T2_REGISTERS;
  const s = store[tier];
  const sc = R[reg];
  const id = rec[sc.idKey || "id"];
  if (!has(id)) return "";
  const parents = sc.fields.filter((f) => f.type === "ref" && has(rec[f.key])).map((f) => ({ f, g: regOfRef(tier, f, rec[f.key]), id: rec[f.key] }));
  const kids = [];
  for (const [g, csc] of Object.entries(R)) {
    for (const f of csc.fields.filter((x) => x.type === "ref" && x.refs.includes(reg))) {
      const rows = (s[g] || []).map((x, i) => ({ x, i })).filter(({ x }) => String(x[f.key] ?? "") === String(id));
      kids.push({ g, f, csc, rows });
    }
  }
  const any = parents.length || kids.some((k) => k.rows.length);
  const newBtn = ({ g, f, csc }) => {
    const pre = { [f.key]: id, opened: today() };
    if (csc.fields.some((x) => x.key === "status")) pre.status = (csc.lifecycle?.[0]) || "Open";
    if (f.refBy) { const k = Object.entries(f.refBy.map).find(([, regs]) => regs.includes(reg)); if (k) pre[f.refBy.field] = k[0]; }
    return `<a class="btn sm" href="#/${tier}/reg/${g}?new=1&prefill=${encodeURIComponent(JSON.stringify(pre))}">＋ ${esc(csc.short)}</a>`;
  };
  const live = (g, i) => { try { return computeAll(tier, g)[i]?.live || ""; } catch { return ""; } };
  return `<div class="links-panel"><div class="card-head"><h2>Linked records</h2><div class="row">${kids.map(newBtn).join("")}</div></div>
    ${parents.map(({ f, g, id: pid }) => `<div class="link-row"><span class="muted">${esc(f.label)}</span>${g ? `<a href="#/${tier}/reg/${g}?id=${encodeURIComponent(pid)}"><b class="mono">${esc(pid)}</b> · ${esc(R[g].short)} ›</a>` : `<span class="mono">${esc(pid)}</span> <span class="muted">(not on the board)</span>`}</div>`).join("")}
    ${kids.filter((k) => k.rows.length).map(({ g, csc, rows }) => `<div class="link-group"><b>${esc(csc.short)}</b> <span class="muted">· ${rows.length}</span>
      <div class="urgent">${rows.slice(0, 40).map(({ x, i }) => `<a href="#/${tier}/reg/${g}?id=${encodeURIComponent(x[csc.idKey || "id"])}"><span class="ref">${esc(x[csc.idKey || "id"])}</span><span class="desc" title="${esc(x.desc || "")}">${esc(x.desc || x.title || x.product || "")} <span class="muted">· ${esc(x.owner || x.officer || x.member || "—")}</span></span>${pill(live(g, i) || x.status)}</a>`).join("")}${rows.length > 40 ? `<span class="muted" style="font-size:12px">… and ${rows.length - 40} more</span>` : ""}</div></div>`).join("")}
    ${any ? "" : `<div class="empty">No linked record yet — link one with the buttons above.</div>`}</div>`;
}

function linkedActionsHTML(ref) {
  const s = store.t2;
  if (!ref || !s.act?.length) return "";
  const comp = E.t2Computed(s).act;
  const rows = s.act.map((a, i) => ({ a, c: comp[i] })).filter(({ a }) => a.parent === ref);
  if (!rows.length) return `<div class="empty" style="margin-top:18px">No eQMS action linked to ${esc(ref)}.</div>`;
  return `<div style="margin-top:18px"><div class="card-head"><h2>Linked actions <span class="sub">${rows.length} · ${rows.filter(({ c }) => c.open).length} open</span></h2>
    <a class="btn sm" href="#/t2/reg/act?new=1&prefill=${encodeURIComponent(JSON.stringify({ parent: ref, ptype: ref.startsWith("QE") ? "Quality Event" : ref.startsWith("CAPA") ? "CAPA" : "Change Control", status: "Open", opened: today() }))}">＋ Action</a></div>
    <div class="urgent">${rows.map(({ a, c }) => `<a href="#/t2/reg/act?id=${encodeURIComponent(a.id)}"><span class="ref">${esc(a.id)}</span><span class="desc" title="${esc(a.desc)}">${esc(a.desc)} <span class="muted">· ${esc(a.owner || "—")}</span></span>${pill(c.live)}</a>`).join("")}</div></div>`;
}
function parentLinkHTML(ref) {
  const reg = ref.startsWith("QE") ? "dev" : ref.startsWith("CAPA") ? ((store.t2.acapa || []).some((r) => r.id === ref) ? "acapa" : "capa") : ref.startsWith("CC") ? "cc" : null;
  return reg ? `<div style="margin-top:16px"><a class="btn sm" href="#/t2/reg/${reg}?id=${encodeURIComponent(ref)}">Open ${esc(ref)} ›</a></div>` : "";
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
  // a fixed colour per source on every chart (8 validated slots); the smallest sources share "Other"
  const SLOT = { act: "f-s1", dev: "f-s2", capa: "f-s3", cc: "f-s4", rel: "f-s5", apqr: "f-s6", tasks: "f-s7", t1ac: "f-s8" };
  const OTHER = ["insp", "doc", "trn", "esc"];
  const keys = [...Object.keys(SLOT), "other"];
  const sources = keys.map((k) => (k === "other" ? `Other (${OTHER.map((o) => E.LOAD_SOURCES[o].toLowerCase()).join(", ")})` : E.LOAD_SOURCES[k]));
  const cls = keys.map((k) => SLOT[k] || "f-other");
  const keyOf = Object.fromEntries(Object.entries(E.LOAD_SOURCES).map(([k, v]) => [v, SLOT[k] ? v : sources[sources.length - 1]]));
  const rows = store.t2.load.map((r, i) => {
    const by = {};
    for (const it of comp[i].items) by[keyOf[it.source]] = (by[keyOf[it.source]] || 0) + it.days;
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
  // practice events are written for the September 2026 demo: a board holding
  // other data practises in a read-only sandbox of the demo
  if (query.practice != null && PRACTICE[+query.practice] && !store.viewing && store.t2.dataset !== "demo-2026-09") {
    store.enterView(JSON.parse(JSON.stringify(DEMO_T1)), JSON.parse(JSON.stringify(DEMO_T2)), { kind: "practice", label: "Practice sandbox · September 2026 demo" }, { silent: true });
  }
  const sc = schemaOf(tier, reg);
  const s = store[tier];
  const key = `${tier}.${reg}`;
  const vs = viewState[key] ??= { q: "", status: "", officer: "", flagged: false, sort: null, dir: 1, limit: 80, by: {}, from: "", to: "", quick: "", view: "table", sel: new Set() };
  vs.sel ??= new Set();
  if (query.flag) vs.flagged = true;
  if (query.quick != null) vs.quick = query.quick; // e.g. from the dashboard's "new today" panel
  const fx = fxSpec(tier, reg);
  const fieldsByKey = Object.fromEntries(sc.fields.map((f) => [f.key, f]));
  const dateKey = sc.dateKey || (fieldsByKey.opened ? "opened" : fieldsByKey.date ? "date" : fieldsByKey.mfg ? "mfg" : null);

  const officersFilter = tier === "t1" && !!fieldsByKey.officer;
  const closeKey = ["closed", "decision", "done"].find((k) => fieldsByKey[k]) || null;
  const ownerKey = ["owner", "officer", "member", "trainer", "inspector"].find((k) => fieldsByKey[k]) || null;
  const bulkFields = sc.fields.filter((f) => ["list", "roster", "ref", "date", "activity"].includes(f.type) && f.key !== (sc.idKey || "id") && f.key !== dateKey);
  const draw = () => {
    const comp = computeAll(tier, reg);
    for (const i of vs.sel) if (i >= s[reg].length) vs.sel.delete(i);
    const rows = s[reg].map((r, i) => ({ r, c: comp[i], i }));
    const ref = tier === "t2" ? s.setup.statusDate : s.setup.selDate;
    const mS = tier === "t2" ? E.monthStart(s.setup.month) : E.monthStart(ref);
    const mE = tier === "t2" ? E.monthEnd(s.setup.month) : ref;
    const total = rows.length;
    const active = rows.filter((x) => x.c.open).length;
    const overdue = rows.filter((x) => x.c.live === "Overdue").length;
    const fresh = dateKey ? rows.filter((x) => has(x.r[dateKey]) && x.r[dateKey] >= mS && x.r[dateKey] <= mE).length : null;
    const freshToday = dateKey ? rows.filter((x) => x.r[dateKey] === ref).length : null;
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
    for (const [k, v] of Object.entries(vs.by)) if (v) list = list.filter((x) => String(x.r[k] ?? "") === v);
    if (dateKey && vs.from) list = list.filter((x) => has(x.r[dateKey]) && x.r[dateKey] >= vs.from);
    if (dateKey && vs.to) list = list.filter((x) => has(x.r[dateKey]) && x.r[dateKey] <= vs.to);
    if (vs.quick === "open") list = list.filter((x) => x.c.open);
    if (vs.quick === "overdue") list = list.filter((x) => x.c.live === "Overdue");
    if (vs.quick === "today" && dateKey) list = list.filter((x) => x.r[dateKey] === ref);
    if (vs.quick === "month" && dateKey) list = list.filter((x) => has(x.r[dateKey]) && x.r[dateKey] >= mS && x.r[dateKey] <= mE);
    if (vs.quick === "soon") list = list.filter((x) => x.c.open && has(x.r.due) && E.diffDays(x.r.due, ref) >= 0 && E.diffDays(x.r.due, ref) <= 7);
    const moreN = Object.values(vs.by).filter(Boolean).length + (vs.from ? 1 : 0) + (vs.to ? 1 : 0);
    const listFields = sc.fields.filter((f) => (f.list || f.type === "roster") && f.key !== "status" && !(f.key === "officer" && officersFilter));
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
      if (f.type === "ref") { const g = regOfRef(tier, f, v); return `<td class="mono" style="white-space:nowrap">${g ? `<a href="#/${tier}/reg/${g}?id=${encodeURIComponent(v)}" data-noedit>${esc(v)}</a>` : esc(v)}</td>`; }
      if (f.type === "date") return `<td style="white-space:nowrap">${fmtDate(v)}</td>`;
      if (f.type === "people") { const n = String(v).split(",").filter((x) => x.trim()).length; return `<td class="wrap"><div class="clip" title="${esc(v)}"><b>${n}</b> · ${esc(v)}</div></td>`; }
      if (f.type === "pct") return `<td class="num">${pct(v)}</td>`;
      if (f.type === "int" || f.type === "num") return `<td class="num">${fmtNum(v)}</td>`;
      if (f.type === "long" || f.key === "desc" || f.key === "title" || f.key === "topic" || /^p\d$/.test(f.key)) return `<td class="wrap"><div class="clip">${esc(v)}</div></td>`;
      if (f.key === "status" || f.key === "att" || f.list === "DayStatus" || f.list === "Severity" || f.list === "DevClass") return `<td>${pill(v)}</td>`;
      if (f.key === (sc.idKey || "id")) return `<td class="mono" style="white-space:nowrap">${esc(v)}</td>`;
      return `<td>${esc(v)}</td>`;
    };
    const bulkOn = reg !== "load" && bulkFields.length;
    const body = shown.map(({ r, c, i }) => `<tr data-i="${i}" class="${c.check && c.check !== "OK" ? "flag" : ""} ${vs.sel.has(i) ? "selrow" : ""}">${bulkOn ? `<td class="selcell" data-noedit><input type="checkbox" data-sel="${i}" ${vs.sel.has(i) ? "checked" : ""} aria-label="Select"></td>` : ""}${cols.map((f) => cell(f, r[f.key])).join("")}${fx.map((x) => `<td class="fx ${x.num ? "num" : ""}">${x.cell(c) ?? ""}</td>`).join("")}</tr>`).join("");

    const loadTotal = (k) => rows.reduce((a, x) => a + (+x.c[k] || 0), 0);
    const teamUtil = loadTotal("available") > 0 ? loadTotal("workload") / loadTotal("available") : "";
    const stats = reg === "load" ? [
      ["Team members", total, ""], ["Planned workload (pd)", fmtNum(Math.round(loadTotal("workload") * 10) / 10), ""],
      ["Available (pd)", fmtNum(loadTotal("available")), ""],
      ["Team utilisation", pct(teamUtil), teamUtil === "" ? "" : teamUtil > s.setup.overLoad ? "R" : teamUtil >= s.setup.highLoad ? "A" : "G"],
      ["Delayed tasks", loadTotal("delayed"), loadTotal("delayed") ? "R" : "G"],
    ] : [
      ["Total", total, "", ""], ["Active", active, "", "open"],
      ...(reg === "load" || reg === "dl" || reg === "hd" ? [] : [["Overdue", overdue, overdue ? "R" : "G", "overdue"]]),
      ...(freshToday != null ? [[`New today · ${fmtDate(ref)}`, freshToday, freshToday ? "new" : "", "today"]] : []),
      ...(fresh != null ? [[tier === "t1" ? "Month to date" : "New this month", fresh, fresh ? "new" : "", "month"]] : []),
    ];
    const officers = officersFilter ? s.roster.map((o) => o.name) : [];
    const valuesOf = (k) => [...new Set(rows.map((x) => x.r[k]).filter(has).map(String))].sort((a, b) => a.localeCompare(b));
    const quick = [["", "All"], ["open", "Open"], ["overdue", "Overdue"], ...(fieldsByKey.due ? [["soon", "Due ≤ 7 days"]] : []), ...(dateKey ? [["today", tier === "t1" ? "Today" : "Raised today"], ["month", tier === "t1" ? "This month" : "Raised this month"]] : [])];
    root.innerHTML = `
      <div class="reg-head">
        <div class="reg-no">${esc(sc.no)}</div>
        <div><div class="eyebrow">${tier === "t1" ? "Tier 1 · Huddle board" : sc.trackOnly ? "Audits · tracking only" : ["aud", "find"].includes(reg) ? "Tier 2 · Audits" : "Tier 2 · Daily management"} · register</div>
          <h1 style="font-size:28px;margin-top:4px">${esc(sc.title)}</h1>
          <p class="muted" style="margin:4px 0 0;max-width:780px">${esc(sc.lead)}</p>
          ${tier === "t2" && sc.trackOnly ? `<span class="track-note">◌ Tracking only — not counted in the QA KPIs, Q-calendar or QA load</span>` : ""}
          <div class="meta-row">${sc.source ? `<span>Source <b>${esc(sc.source)}</b></span>` : ""}<span>Collected by <b>${esc(sc.who)}</b></span><span>When <b>${esc(sc.when)}</b></span>
          ${sc.lifecycle?.length ? `<span class="lifecycle">${sc.lifecycle.map((x) => `<span>${esc(x)}</span>`).join("<i>→</i>")}</span>` : ""}</div>
        </div>
        <div class="row">${tier === "t2" && reg === "trn" ? `<a class="btn" href="#/t2/training">◂ Training overview</a>` : ""}<div class="seg-ctl" role="group" aria-label="View"><button type="button" data-view="table" aria-pressed="${vs.view !== "charts"}">▤ Table</button><button type="button" data-view="charts" aria-pressed="${vs.view === "charts"}">◔ Charts</button></div><button class="btn" data-csv>Export CSV</button><button class="btn primary" data-new>＋ New record</button></div>
      </div>
      <div class="strip">
        ${stats.map(([l, v, c, q]) => q && reg !== "load" ? `<button type="button" class="stat click ${c} ${vs.quick === q ? "on" : ""}" data-quick="${vs.quick === q ? "" : q}" title="Show ${esc(l.toLowerCase())}">${`<div class="s-l">${esc(l)}</div><div class="s-v">${v}</div>`}</button>` : `<div class="stat ${c}"><div class="s-l">${esc(l)}</div><div class="s-v">${v}</div></div>`).join("")}
        ${fx.some((x) => x.key === "check") ? `<button class="check-strip ${flaggedN ? "bad" : "ok"}" data-flagbtn>${flaggedN ? `⚠ Data check: ${flaggedN} record${flaggedN > 1 ? "s" : ""} need attention — ${vs.flagged ? "show all" : "show them"}` : "✓ Data check: all records consistent"}</button>` : ""}
      </div>
      ${tier === "t2" && reg === "load" ? loadPanel(comp, s.setup) : ""}
      <div class="toolbar">
        <input type="search" placeholder="Search this register…" value="${esc(vs.q)}" data-q aria-label="Search">
        <select data-status aria-label="Filter by status"><option value="">All statuses</option>${liveValues.map((v) => `<option ${v === vs.status ? "selected" : ""}>${esc(v)}</option>`).join("")}</select>
        ${officers.length ? `<select data-officer aria-label="Filter by officer"><option value="">All officers</option>${officers.map((o) => `<option ${o === vs.officer ? "selected" : ""}>${esc(o)}</option>`).join("")}</select>` : ""}
        <label class="row" style="gap:6px;font-size:13px"><input type="checkbox" data-flagged ${vs.flagged ? "checked" : ""}> Flagged only</label>
        ${reg === "load" ? "" : `<div class="seg-ctl" role="group" aria-label="Quick filter">${quick.map(([v, l]) => `<button type="button" data-quick="${v}" aria-pressed="${vs.quick === v}">${l}</button>`).join("")}</div>`}
        <span class="spacer"></span><span class="muted" style="font-size:12.5px">${list.length} of ${total} shown · ${vs.view === "charts" ? "click a bar to filter" : "click a row to edit · ƒx columns are automatic"}</span>
      </div>
      ${listFields.length || dateKey ? `<details class="fbar card" data-moref ${moreN ? "open" : ""} style="margin-bottom:12px"><summary><span class="fbar-t">⚲ More filters</span>${moreN ? `<span class="badge">${moreN}</span><span class="spacer"></span><button class="btn sm ghost" type="button" data-moreclear>Clear</button>` : `<span class="muted" style="font-size:12.5px">every drop-down field and the date range</span>`}</summary>
        <div class="fgrid">
          ${dateKey ? `<label class="fctl"><span>${esc(fieldsByKey[dateKey]?.label || "Date")} from</span><input type="date" data-from value="${esc(vs.from)}"></label><label class="fctl"><span>to</span><input type="date" data-to value="${esc(vs.to)}"></label>` : ""}
          ${listFields.map((f) => { const vals = valuesOf(f.key); return vals.length ? `<label class="fctl"><span>${esc(f.label)}</span><select data-by="${f.key}"><option value="">All</option>${vals.map((v) => `<option ${vs.by[f.key] === v ? "selected" : ""}>${esc(v)}</option>`).join("")}</select></label>` : ""; }).join("")}
        </div></details>` : ""}
      ${vs.view === "charts" ? (() => { const ch = registerCharts({ tier, reg, sc, list, ref, dateKey, closeKey, ownerKey }); return `${ch.tiles}<div data-regcharts>${ch.html}</div>`; })() : `
      ${bulkOn && vs.sel.size ? `<div class="bulkbar card" data-bulk><b>${vs.sel.size} selected</b><span>Set</span>
        <select data-bulkf>${bulkFields.map((f) => `<option value="${f.key}" ${vs.bulkf === f.key ? "selected" : ""}>${esc(f.label)}</option>`).join("")}</select><span>to</span>
        <span data-bulkv>${inputHTML(tier, fieldsByKey[vs.bulkf] || bulkFields[0], "", { name: "bulkv", reg })}</span>
        <button class="btn sm primary" data-bulkapply>Apply to ${vs.sel.size}</button><button class="btn sm ghost" data-bulkclear>Clear selection</button></div>` : ""}
      <div class="table-wrap"><table class="data"><thead><tr>${bulkOn ? `<th class="selcell"><input type="checkbox" data-selall aria-label="Select all shown" ${shown.length && shown.every((x) => vs.sel.has(x.i)) ? "checked" : ""}></th>` : ""}${head}</tr></thead><tbody>${body || `<tr><td colspan="${cols.length + fx.length + 1}"><div class="empty">No record matches — clear the filters or add a new record.</div></td></tr>`}</tbody></table></div>
      ${list.length > vs.limit ? `<div style="text-align:center;margin-top:12px"><button class="btn" data-more>Show all ${list.length} records</button></div>` : ""}`}`;

    $("[data-q]", root).oninput = (e) => { vs.q = e.target.value; const pos = e.target.selectionStart; draw(); const inp = $("[data-q]", root); inp.focus(); inp.setSelectionRange(pos, pos); };
    $("[data-status]", root).onchange = (e) => { vs.status = e.target.value; draw(); };
    $("[data-officer]", root)?.addEventListener("change", (e) => { vs.officer = e.target.value; draw(); });
    $("[data-flagged]", root).onchange = (e) => { vs.flagged = e.target.checked; draw(); };
    $$("[data-quick]", root).forEach((b) => b.onclick = () => { vs.quick = b.dataset.quick; draw(); });
    $("[data-moref]", root)?.addEventListener("change", (e) => {
      const t = e.target;
      if (t.dataset.by) vs.by[t.dataset.by] = t.value;
      if (t.matches("[data-from]")) vs.from = t.value;
      if (t.matches("[data-to]")) vs.to = t.value;
      draw();
    });
    $("[data-moreclear]", root)?.addEventListener("click", (e) => { e.preventDefault(); vs.by = {}; vs.from = ""; vs.to = ""; draw(); });
    $("[data-flagbtn]", root)?.addEventListener("click", () => { if (flaggedN || vs.flagged) { vs.flagged = !vs.flagged; draw(); } });
    $("[data-more]", root)?.addEventListener("click", () => { vs.limit = Infinity; draw(); });
    $("[data-new]", root).onclick = () => openEditor({ tier, reg, onSaved: draw });
    $("[data-csv]", root).onclick = () => {
      const comp2 = computeAll(tier, reg);
      const csv = toCSV([[...sc.fields.map((f) => f.label), ...fx.map((x) => `fx ${x.label}`)],
        ...list.map(({ r, i }) => [...sc.fields.map((f) => (f.type === "pct" && has(r[f.key]) ? Math.round(r[f.key] * 100) + "%" : r[f.key] ?? "")), ...fx.map((x) => comp2[i][x.key] ?? "")])]);
      saveFile(`${tier.toUpperCase()}_${sc.title.replace(/\W+/g, "_")}_${today()}.csv`, new Blob(["\ufeff" + csv], { type: "text/csv" }));
    };
    $$("th[data-sort]", root).forEach((th) => th.onclick = () => {
      const k = th.dataset.sort;
      if (vs.sort === k) vs.dir = -vs.dir; else { vs.sort = k; vs.dir = 1; }
      draw();
    });
    $$("[data-view]", root).forEach((b) => b.onclick = () => { vs.view = b.dataset.view; draw(); });
    const charts = $("[data-regcharts]", root);
    if (charts) {
      decorateCharts(root);
      charts.addEventListener("click", (e) => {
        const t = e.target.closest("[data-fby], [data-fstatus], [data-fq]");
        if (!t) return;
        if (t.dataset.fby) vs.by[t.dataset.fby] = t.dataset.fv;
        if (t.dataset.fstatus) vs.status = t.dataset.fstatus;
        if (t.dataset.fq) vs.q = t.dataset.fq;
        draw();
      });
    }
    $("tbody", root)?.addEventListener("click", (e) => {
      if (e.target.closest("[data-noedit], a")) return;
      const tr = e.target.closest("tr[data-i]");
      if (tr) openEditor({ tier, reg, index: +tr.dataset.i, onSaved: draw });
    });
    // on elements rebuilt by every draw, so the handler never stacks up
    const onSel = (e) => {
      const t = e.target;
      if (t.matches("[data-sel]")) { const i = +t.dataset.sel; if (t.checked) vs.sel.add(i); else vs.sel.delete(i); draw(); }
      if (t.matches("[data-selall]")) { shown.forEach((x) => (t.checked ? vs.sel.add(x.i) : vs.sel.delete(x.i))); draw(); }
      if (t.matches("[data-bulkf]")) { vs.bulkf = t.value; draw(); }
    };
    $(".table-wrap", root)?.addEventListener("change", onSel);
    $("[data-bulk]", root)?.addEventListener("change", onSel);
    const bulk = $("[data-bulk]", root);
    if (bulk) {
      const bf = fieldsByKey[vs.bulkf] || bulkFields[0];
      wireInputs(bulk, tier, [bf]);
      $("[data-bulkclear]", bulk).onclick = () => { vs.sel.clear(); draw(); };
      $("[data-bulkapply]", bulk).onclick = async () => {
        const raw = bulk.querySelector("[name=bulkv]").value;
        const v = readField(bf, raw);
        if (!await confirmDialog({ title: `Set ${bf.label} on ${vs.sel.size} records?`, body: `<p>${esc(bf.label)} becomes <b>${esc(v ?? "— (cleared)")}</b> on the ${vs.sel.size} selected records${store.sync ? " — for everyone on the team" : ""}. Each change is in Change history.</p>`, ok: "Apply" })) return;
        const done = (tier === "t2" ? E.T2_FLOW[reg]?.done : null) || ["Closed", "Done", "Completed", "Released", "Rejected", "Resolved"];
        let n = 0;
        for (const i of vs.sel) {
          const rec = { ...s[reg][i] };
          if (v === undefined) delete rec[bf.key]; else rec[bf.key] = v;
          if (bf.key === "status" && closeKey && done.includes(v) && !has(rec[closeKey])) rec[closeKey] = ref <= today() ? ref : today();
          s[reg][i] = rec; n++;
        }
        store.log(tier, { reg, ref: `${n} records (bulk)`, action: "edit", changes: [{ field: bf.key, from: "", to: v ?? "" }] });
        store.save(tier);
        vs.sel.clear();
        toast(`${bf.label} set on ${n} records`);
        draw();
      };
    }
  };
  draw();

  if (query.id) {
    const idKey = sc.idKey || "id";
    const i = s[reg].findIndex((r) => r[idKey] === query.id);
    if (i >= 0) openEditor({ tier, reg, index: i, onSaved: draw });
  }
  if (query.practice != null && PRACTICE[+query.practice]) {
    const p = PRACTICE[+query.practice];
    const comp = computeAll(tier, reg);
    const index = p.edit === "firstOpen" ? s[reg].findIndex((r, i) => comp[i].open) : p.edit === "first" ? (s[reg].length ? 0 : -1) : null;
    if (index === -1) toast("This register has no record to practise on");
    else openEditor({ tier, reg, index, practice: { ...p, n: +query.practice } });
  }
  if (query.new) {
    let prefill = null;
    try { prefill = query.prefill ? JSON.parse(decodeURIComponent(query.prefill)) : null; } catch { prefill = null; }
    openEditor({ tier, reg, prefill, onSaved: draw });
  }
}
