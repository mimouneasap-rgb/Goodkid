// Setup pages of both boards: identity, rules, roster, KPI targets, the
// drop-down lists, the month-end roll-over and data backup.

import { store } from "./store.js";
import * as E from "./engine.js";
import { LOCKED_LISTS, LIST_LABELS, T1_REGISTERS, T2_REGISTERS } from "./schema.js";
import { freezeMonth } from "./views-t2.js";
import { esc, toast, confirmDialog, download, fmtMonth, today, fresh, $ } from "./ui.js";

/** One labelled input bound to a path of the tier document. */
function bound(tier, path, label, { type = "text", help = "", options = null, pctVal = false, readonly = false, full = false } = {}) {
  let obj = store[tier];
  for (const k of path) obj = obj?.[k];
  const v = obj ?? "";
  const attrs = `data-path="${path.join(".")}" data-kind="${pctVal ? "pct" : type}" ${readonly ? "disabled" : ""}`;
  let input;
  if (options) input = `<select ${attrs}><option value="">—</option>${options.map((o) => `<option ${o === v ? "selected" : ""}>${esc(o)}</option>`).join("")}</select>`;
  else if (type === "long") input = `<textarea ${attrs} rows="3">${esc(v)}</textarea>`;
  else if (pctVal) input = `<div class="suffix"><input type="number" step="1" ${attrs} value="${v === "" ? "" : Math.round(v * 100)}"><span>%</span></div>`;
  else input = `<input type="${type}" ${attrs} value="${esc(v)}">`;
  return `<label class="field ${full ? "full" : ""}" style="${full ? "grid-column:1/-1" : ""}"><span>${esc(label)}</span>${input}${help ? `<small>${esc(help)}</small>` : ""}</label>`;
}

function bindPaths(root, tier, after) {
  root.addEventListener("change", (e) => {
    const inp = e.target.closest("[data-path]");
    if (!inp) return;
    const path = inp.dataset.path.split(".").map((k) => (/^\d+$/.test(k) ? +k : k));
    const kind = inp.dataset.kind;
    let v = inp.value.trim();
    if (kind === "number") v = v === "" ? "" : +v;
    if (kind === "pct") v = v === "" ? "" : +v / 100;
    if (kind === "month") v = v ? `${v}-01` : "";
    if (path[path.length - 1] === "month" && !v) { toast("The reporting month cannot be empty"); return; }
    store.patch(tier, path, v, path.join(" · "));
    toast("Saved");
    after?.(path);
  });
}

/* ── Lists editor ───────────────────────────────────────── */

function usage(tier, listName, value) {
  const regs = tier === "t1" ? T1_REGISTERS : T2_REGISTERS;
  let n = 0;
  for (const [reg, sc] of Object.entries(regs)) {
    const keys = sc.fields.filter((f) => f.list === listName).map((f) => f.key);
    if (keys.length) n += store[tier][reg].filter((r) => keys.some((k) => r[k] === value)).length;
  }
  return n;
}

export function listsEditor(tier) {
  const lists = store[tier].lists;
  const names = Object.keys(lists).sort((a, b) => (LOCKED_LISTS.has(a) - LOCKED_LISTS.has(b)) || (LIST_LABELS[a] || a).localeCompare(LIST_LABELS[b] || b));
  return `<div class="grid lists-grid">${names.map((n) => {
    const locked = LOCKED_LISTS.has(n);
    return `<div class="card list-card" data-listcard="${esc(n)}"><h3>${locked ? "🔒" : "▾"} ${esc(LIST_LABELS[n] || n)} <span class="muted" style="font-weight:400;font-size:12px">${lists[n].length}</span></h3>
      <div class="chips">${lists[n].map((v, i) => `<span class="vchip ${locked ? "locked" : ""}">${esc(v)}${locked ? "" : `<button data-rm="${i}" aria-label="Remove ${esc(v)}" title="Remove">×</button>`}</span>`).join("")}</div>
      ${locked ? `<small class="muted">Status values are counted by name in the KPI formulas — never renamed or deleted.</small>` : `<form class="add-row" data-add><input class="input" name="v" placeholder="Add a value…" autocomplete="off"><button class="btn sm">Add</button></form>`}</div>`;
  }).join("")}</div>`;
}

function bindLists(root, tier, rerender) {
  root.addEventListener("submit", (e) => {
    const f = e.target.closest("[data-add]");
    if (!f) return;
    e.preventDefault();
    const name = f.closest("[data-listcard]").dataset.listcard;
    const v = f.v.value.trim();
    if (!v) return;
    const list = store[tier].lists[name];
    if (list.includes(v)) { toast(`“${v}” is already in the list`); return; }
    list.push(v);
    store.log(tier, { reg: "lists", ref: name, action: "edit", changes: [{ field: "add", from: "", to: v }] });
    store.save(tier); rerender(); toast(`“${v}” added`);
  });
  root.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-rm]");
    if (!b) return;
    const name = b.closest("[data-listcard]").dataset.listcard;
    const list = store[tier].lists[name];
    const v = list[+b.dataset.rm];
    const n = usage(tier, name, v);
    const ok = await confirmDialog({ title: `Remove “${esc(v)}”?`, body: n ? `<p>${n} record${n > 1 ? "s" : ""} still use this value. They keep it, but it is no longer offered in the drop-down.</p>` : `<p>The value is no longer offered in the drop-down.</p>`, ok: "Remove", danger: true });
    if (!ok) return;
    list.splice(+b.dataset.rm, 1);
    store.log(tier, { reg: "lists", ref: name, action: "edit", changes: [{ field: "remove", from: v, to: "" }] });
    store.save(tier); rerender();
  });
}

/* ── KPI target table ───────────────────────────────────── */

function kpiTable(tier) {
  const kpis = store[tier].kpis;
  return `<div class="table-wrap"><table class="data"><thead><tr>${tier === "t1" ? "<th>Pillar</th>" : ""}<th>KPI</th><th>Definition</th><th>Unit</th><th>Better when</th><th class="num">Target</th><th class="num">Amber limit</th>${tier === "t2" ? "<th>Why it matters</th>" : ""}</tr></thead>
    <tbody>${kpis.map((k, i) => {
      const isPct = k.unit === "%";
      const num = (key) => `<input class="cell-in num" data-path="kpis.${i}.${key}" data-kind="${isPct ? "pct" : "number"}" value="${isPct ? Math.round(k[key] * 1000) / 10 : k[key]}" inputmode="decimal">${isPct ? " %" : ""}`;
      return `<tr style="cursor:default">${tier === "t1" ? `<td><b>${esc(k.pillar)}</b></td>` : ""}<td><b>${esc(k.name)}</b></td><td style="min-width:240px">${esc(k.def)}</td><td>${esc(k.unit)}</td>
        <td><select class="cell-in" data-path="kpis.${i}.better" data-kind="text">${["Higher", "Lower"].map((o) => `<option ${o === k.better ? "selected" : ""}>${o}</option>`).join("")}</select></td>
        <td class="num" style="white-space:nowrap">${num("target")}</td><td class="num" style="white-space:nowrap">${num("amber")}</td>${tier === "t2" ? `<td class="muted" style="min-width:220px;font-size:12.5px">${esc(k.why)}</td>` : ""}</tr>`;
    }).join("")}</tbody></table></div>
    <p class="muted" style="font-size:12.5px">RAG: ‘Higher’ KPIs are GREEN at or above Target, AMBER at or above the Amber limit, otherwise RED. ‘Lower’ KPIs the reverse. Targets are proposals — align them with the site Quality Manual and review them quarterly.</p>`;
}

/* ── Data & backup ──────────────────────────────────────── */

function dataCard(tier) {
  const label = tier === "t1" ? "Tier 1 board" : "Tier 2 board";
  return `<div class="card card-pad"><div class="card-head"><h2>Data & backup</h2></div>
    <p class="muted" style="margin:0 0 12px;font-size:13px">Data is saved in this browser. Export a backup regularly, or to move the boards to another device. The eQMS stays the GMP record of truth — this board mirrors it.</p>
    <div class="row"><button class="btn" data-export>⬇ Export backup (both tiers)</button>
    <label class="btn">⬆ Import backup<input type="file" accept=".json,application/json" data-import hidden></label>
    <button class="btn" data-reset>Reload the September demo</button><button class="btn danger" data-blank>Start a blank ${label}</button></div></div>`;
}

function bindData(root, tier, rerender) {
  $("[data-export]", root).onclick = () => download(`QA_Tier_Boards_backup_${today()}.json`, store.exportJSON(), "application/json");
  $("[data-import]", root).onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const ok = await confirmDialog({ title: "Replace both boards?", body: `<p>The data of <b>${esc(file.name)}</b> replaces the Tier 1 and Tier 2 boards in this browser.</p>`, ok: "Import" });
      if (ok) { store.importJSON(text); toast("Backup imported"); rerender(); }
    } catch (err) { toast(err.message || "Import failed"); }
    e.target.value = "";
  };
  $("[data-reset]", root).onclick = async () => {
    if (await confirmDialog({ title: "Reload the demo?", body: "<p>All entries of this board are replaced by the El Kendi September 2026 demo data.</p>", ok: "Reload demo", danger: true })) { store.reset(tier); toast("Demo reloaded"); rerender(); }
  };
  $("[data-blank]", root).onclick = async () => {
    if (await confirmDialog({ title: "Start a blank board?", body: "<p>Every register is emptied. Setup, targets, roster and drop-down lists are kept. Export a backup first if you need the current data.</p>", ok: "Empty the registers", danger: true })) { store.blank(tier); toast("Registers emptied"); rerender(); }
  };
}

/* ── Tier 2 setup ───────────────────────────────────────── */

export function renderSetupT2(root) {
  root = fresh(root);
  const s = store.t2, st = s.setup;
  const wd = E.workingDays(st.month, st);
  const m = +st.month.slice(5, 7) - 1;
  const next = E.addDays(E.monthEnd(st.month), 1);
  root.innerHTML = `
    <div class="page-head"><div><div class="eyebrow">Tier 2 · Setup</div><h1>Board parameters & KPI targets</h1>
      <p>Change the reporting month here each month — the calendar, the Daily Log and every ‘this month’ count follow automatically. Edit rights: Senior QA (board owner).</p></div></div>
    <div class="stack">
      <div class="card card-pad"><div class="card-head"><h2>1 · Board identity & reporting period</h2></div><div class="setup-grid">
        ${bound("t2", ["setup", "site"], "Site / facility", { help: "Shown on the dashboard header" })}
        ${bound("t2", ["setup", "department"], "Department")}
        ${bound("t2", ["setup", "boardLevel"], "Board level")}
        <label class="field"><span>Reporting month</span><input type="month" data-path="setup.month" data-kind="month" value="${st.month.slice(0, 7)}"><small>Always the 1st of the month · ${fmtMonth(st.month)}</small></label>
        <label class="field"><span>Data as of (status date)</span><div class="inline"><input type="date" data-path="setup.statusDate" data-kind="date" value="${st.statusDate}"><button class="btn sm" data-todaydate>Today</button></div><small>Today for live use; a fixed date only to replay a past board</small></label>
        ${bound("t2", ["setup", "weekend1"], "Weekend day 1", { options: E.WEEKDAYS, help: "Greyed on the calendar, skipped by the auto-status" })}
        ${bound("t2", ["setup", "weekend2"], "Weekend day 2", { options: E.WEEKDAYS })}
        <label class="field"><span>ƒx Working days in month</span><input disabled value="${wd}"><small>Counted from the calendar — check it, never type it</small></label>
        ${bound("t2", ["setup", "soon"], "Due-soon window (days)", { type: "number", help: "A day turns amber when an item is due within this window" })}
        ${bound("t2", ["setup", "brTarget"], "Batch release target lead time (days)", { type: "number", help: "Manufacture completion → QA disposition" })}
        ${bound("t2", ["setup", "highLoad"], "High-load threshold", { pctVal: true, help: "Utilisation at or above = High load" })}
        ${bound("t2", ["setup", "overLoad"], "Overload threshold", { pctVal: true, help: "Above = Overloaded" })}
        ${bound("t2", ["setup", "meetingTime"], "Daily Tier 2 meeting time")}
        ${bound("t2", ["setup", "location"], "Meeting location")}
        ${bound("t2", ["setup", "escalationRule"], "Escalation rule", { type: "long", full: true })}
      </div></div>
      <div class="card card-pad"><div class="card-head"><h2>2 · Board owner & monthly inputs</h2></div><div class="setup-grid">
        ${bound("t2", ["setup", "owner"], "Board owner — name", { options: s.lists.People })}
        ${bound("t2", ["setup", "ownerRole"], "Board owner — role")}
        ${bound("t2", ["setup", "reviewDate"], "Board review date", { type: "date" })}
        ${bound("t2", ["setup", "message"], "Quality message", { help: "Rotate monthly — shown on the board" })}
        ${bound("t2", ["setup", "otherDesc"], "Other points — description", { help: "A tenth indicator you track by hand" })}
        ${bound("t2", ["setup", "otherStatus"], "Other points — status", { options: s.lists.ManualKPI })}
        ${bound("t2", ["setup", "remarks"], "Monthly remarks", { type: "long", full: true, help: "Count first · name the trend · state what was escalated and why · end with next month's focus" })}
      </div></div>
      <div class="card card-pad"><div class="card-head"><h2>3 · KPI targets & thresholds</h2></div>${kpiTable("t2")}</div>
      <div class="card card-pad"><div class="card-head"><h2>Month-end roll-over <span class="sub">last working day of ${fmtMonth(st.month)}</span></h2></div>
        <div class="lcards">
          <div class="lcard"><span class="n">1</span><b>Print the board</b><span>Dashboard → Print A3 → save as PDF for the Tier 3 pack.</span><a class="btn sm" href="#/t2/board" style="justify-self:start">Open dashboard</a></div>
          <div class="lcard"><span class="n">2</span><b>Freeze the KPIs</b><span>Copy every Live value into the ${E.MONTHS[m]} column of KPI Trend.</span><button class="btn sm" data-freeze style="justify-self:start">❄ Freeze ${E.MONTHS[m]}</button></div>
          <div class="lcard"><span class="n">3</span><b>Roll the month</b><span>Set the reporting month to ${fmtMonth(next)}. Update the remarks.</span><button class="btn sm" data-roll style="justify-self:start">→ ${fmtMonth(next)}</button></div>
          <div class="lcard"><span class="n">4</span><b>Clear the Daily Log</b><span>Only the cream cells of the new month: overrides, priorities, remarks, attendees.</span><button class="btn sm" data-clearlog style="justify-self:start">Clear ${fmtMonth(st.month)} log</button></div>
          <div class="lcard"><span class="n">5</span><b>Keep the registers</b><span>Never clear registers — closed records stay for traceability and trending.</span></div>
          <div class="lcard"><span class="n">6</span><b>Save a version</b><span>Export a backup named for the month and file it in the controlled folder.</span><button class="btn sm" data-version style="justify-self:start">⬇ Save version</button></div>
        </div></div>
      <div class="card card-pad"><div class="card-head"><h2>Drop-down lists <span class="sub">every list field of the registers offers these values</span></h2></div>${listsEditor("t2")}</div>
      ${dataCard("t2")}
    </div>`;
  const rerender = () => renderSetupT2(root);
  bindPaths(root, "t2", (path) => { if (["month", "weekend1", "weekend2"].includes(path[path.length - 1])) rerender(); });
  bindLists(root, "t2", rerender);
  bindData(root, "t2", rerender);
  $("[data-todaydate]", root).onclick = () => { store.patch("t2", ["setup", "statusDate"], today(), "Status date"); rerender(); };
  $("[data-freeze]", root).onclick = () => freezeMonth();
  $("[data-roll]", root).onclick = async () => {
    if (!await confirmDialog({ title: `Roll to ${fmtMonth(next)}?`, body: `<p>Freeze ${E.MONTHS[m]} in KPI Trend first. The calendar, the Daily Log and every ‘this month’ count move to ${fmtMonth(next)}.</p>`, ok: "Roll the month" })) return;
    store.patch("t2", ["setup", "month"], next, "Reporting month");
    if (+next.slice(0, 4) !== s.trend.year && next.slice(5, 7) === "01") { s.trend.year = +next.slice(0, 4); s.trend.rows = s.trend.rows.map(() => Array(12).fill(null)); store.save("t2"); }
    toast(`Reporting month: ${fmtMonth(next)}`); rerender();
  };
  $("[data-clearlog]", root).onclick = async () => {
    const days = E.monthDays(st.month).filter((d) => s.daily[d]);
    if (!await confirmDialog({ title: `Clear the ${fmtMonth(st.month)} Daily Log?`, body: `<p>${days.length} logged day${days.length === 1 ? "" : "s"} lose their meeting data, overrides, priorities and remarks. The registers are not touched.</p>`, ok: "Clear", danger: true })) return;
    days.forEach((d) => delete s.daily[d]);
    store.log("t2", { reg: "daily", ref: fmtMonth(st.month), action: "delete", changes: [] });
    store.save("t2"); toast("Daily Log cleared");
  };
  $("[data-version]", root).onclick = () => download(`QA_Tier2_${st.month.slice(0, 7)}.json`, store.exportJSON(), "application/json");
}

/* ── Tier 1 setup ───────────────────────────────────────── */

export function renderSetupT1(root) {
  root = fresh(root);
  const s = store.t1;
  const roster = Array.from({ length: 6 }, (_, i) => s.roster[i] || {});
  root.innerHTML = `
    <div class="page-head"><div><div class="eyebrow">Tier 1 · Setup</div><h1>Board identity, team roster & targets</h1>
      <p>Team names entered here feed every officer drop-down. The date and officer shown on the board are picked on the board itself.</p></div></div>
    <div class="stack">
      <div class="card card-pad"><div class="card-head"><h2>1 · Board identity & rules</h2></div><div class="setup-grid">
        ${bound("t1", ["setup", "title"], "Board title")}
        ${bound("t1", ["setup", "subtitle"], "Subtitle")}
        ${bound("t1", ["setup", "site"], "Site / line")}
        ${bound("t1", ["setup", "huddleTime"], "Daily huddle time")}
        ${bound("t1", ["setup", "location"], "Huddle location")}
        ${bound("t1", ["setup", "owner"], "Board owner", { help: "Supervisor who runs the huddle" })}
        ${bound("t1", ["setup", "weekend1"], "Weekend day 1", { options: E.WEEKDAYS })}
        ${bound("t1", ["setup", "weekend2"], "Weekend day 2", { options: E.WEEKDAYS })}
        ${bound("t1", ["setup", "brTarget"], "Record review target (days)", { type: "number", help: "BMR / BPR received → review completed" })}
        ${bound("t1", ["setup", "minStaff"], "Minimum QA staff present", { type: "number", help: "Team view turns P red when fewer officers are present" })}
        ${bound("t1", ["setup", "lastIncident"], "Last safety incident before this log", { type: "date", help: "Baseline for ‘days without incident’" })}
        ${bound("t1", ["setup", "selDate"], "Selected date (board)", { type: "date" })}
        ${bound("t1", ["setup", "escalationRule"], "Escalation rule", { type: "long", full: true })}
      </div></div>
      <div class="card card-pad"><div class="card-head"><h2>2 · Team roster <span class="sub">up to 6 people · type each name exactly once</span></h2></div>
        <div class="table-wrap" style="border:0"><table class="plain"><thead><tr><th>Slot</th><th>Name (as used in every register)</th><th>Role</th><th>Shift</th></tr></thead><tbody>
        ${roster.map((o, i) => `<tr><td>Officer ${i + 1}</td><td><input class="cell-in wide" data-roster="${i}" data-k="name" value="${esc(o.name || "")}"></td><td><input class="cell-in wide" data-roster="${i}" data-k="role" value="${esc(o.role || "")}"></td>
          <td><select class="cell-in" data-roster="${i}" data-k="shift"><option></option>${(s.lists.Shifts || []).map((x) => `<option ${x === o.shift ? "selected" : ""}>${esc(x)}</option>`).join("")}</select></td></tr>`).join("")}
        </tbody></table></div><p class="muted" style="font-size:12.5px">Renaming a person here does not rename their past entries.</p></div>
      <div class="card card-pad"><div class="card-head"><h2>3 · KPI targets & RAG thresholds <span class="sub">20 KPIs, 4 per SQDCP pillar</span></h2></div>${kpiTable("t1")}</div>
      <div class="card card-pad"><div class="card-head"><h2>Drop-down lists</h2></div>${listsEditor("t1")}</div>
      ${dataCard("t1")}
    </div>`;
  const rerender = () => renderSetupT1(root);
  bindPaths(root, "t1");
  bindLists(root, "t1", rerender);
  bindData(root, "t1", rerender);
  root.addEventListener("change", (e) => {
    const inp = e.target.closest("[data-roster]");
    if (!inp) return;
    const i = +inp.dataset.roster, k = inp.dataset.k;
    const rows = Array.from({ length: 6 }, (_, j) => ({ ...(s.roster[j] || {}) }));
    const old = rows[i][k] || "";
    rows[i][k] = inp.value.trim() || undefined;
    const names = rows.map((r) => r.name).filter(Boolean);
    if (new Set(names).size !== names.length) { toast("Each name only once"); inp.value = old; return; }
    s.roster = rows.filter((r) => r.name);
    if (k === "name" && old && rows[i].name) {
      const sk = s.skills.find((x) => x.officer === old);
      if (sk) sk.officer = rows[i].name;
    }
    store.log("t1", { reg: "roster", ref: `Officer ${i + 1}`, action: "edit", changes: [{ field: k, from: old, to: inp.value.trim() }] });
    store.save("t1"); toast("Roster saved");
  });
}

/* ── Audit trail ────────────────────────────────────────── */

export function renderAudit(root) {
  const rows = [...store.t1.audit.map((a) => ({ ...a, tier: "Tier 1" })), ...store.t2.audit.map((a) => ({ ...a, tier: "Tier 2" }))].sort((a, b) => b.ts.localeCompare(a.ts));
  const fmt = (v) => (v === "" || v == null ? "∅" : typeof v === "number" && v < 1 && v > 0 ? `${Math.round(v * 1000) / 10} %` : String(v));
  root.innerHTML = `
    <div class="page-head"><div><div class="eyebrow">Data integrity</div><h1>Change history</h1>
      <p>Every entry made in this browser — what changed, from what to what, and when. A visual-management aid: the eQMS audit trail remains the GMP record.</p></div></div>
    ${rows.length ? `<div class="audit">${rows.slice(0, 400).map((a) => `<div class="a-row"><span class="when">${a.ts.slice(0, 16).replace("T", " ")}</span><span>${a.tier}</span>
      <span><b>${esc(a.action)}</b> · ${esc(a.reg)} · <span class="mono">${esc(a.ref || "")}</span>${a.changes?.length ? `<br><span class="muted">${a.changes.slice(0, 8).map((c) => `${esc(c.field)}: ${esc(fmt(c.from))} → ${esc(fmt(c.to))}`).join(" · ")}${a.changes.length > 8 ? " …" : ""}</span>` : ""}</span></div>`).join("")}</div>`
      : `<div class="empty">No change recorded yet. Edit any record and it appears here.</div>`}`;
}
