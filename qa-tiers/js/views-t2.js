// Tier 2 — daily management board: dashboard, Q-calendar (Daily Log),
// 15-minute stand-up mode, KPI trend history and analytics.

import { store } from "./store.js";
import * as E from "./engine.js";
import { T2_REGISTERS, T2_DAILY_FIELDS as ALL_DAILY } from "./schema.js";
import { hbars, stackedH, donut, ring, line, spark, columns } from "./charts.js";
import { applyFilters, merge, pageFilters, setPageFilters, chartFilters, setChartFilters, filterBar, wireControls, chipsHTML, describe, activeCount, openChartFilter, productName } from "./filters.js";
import { CHART_DATA, decorateCharts } from "./export.js";
import { hasTier } from "./edition.js";
/** Daily Log inputs: the Tier 1 headlines are typed here only in the separate Tier 2 app. */
const T2_DAILY_FIELDS = ALL_DAILY.filter((f) => !f.tierOnly || !hasTier("t1"));
import { openEditor, inputHTML, readField, wireInputs } from "./registers.js";
import { esc, pill, fmtDate, fmtLong, fmtMonth, fmtKpi, pct, fmtNum, toast, drawer, modal, fresh, $, $$, dow } from "./ui.js";

const has = (v) => v !== "" && v != null;
const S = () => store.t2;
const RAGCLS = { G: "G", A: "A", R: "R", N: "N" };
const KPI_LINKS = ["dev", "capa", "cc", "insp", "rel", "doc", "load", "apqr", "trn"];
const DAYCLS = { 1: "c1", 2: "c2", 3: "c3" };

function trendClass(k) {
  if (!k.trend) return "";
  return k.trendCode > 0 ? "up" : k.trendCode < 0 ? "down" : "flat";
}

export function kpiTile(k, i, s) {
  const series = s.trend.rows[i] ? s.trend.rows[i].slice() : [];
  const m = +s.setup.month.slice(5, 7) - 1;
  if (series.length) series[m] = k.actual === "" ? null : k.actual;
  const tip = `**${k.name}**\n${k.def}\nActual ${fmtKpi(k.actual, k.unit)} · target ${k.targetText} · amber ${k.unit === "%" ? pct(k.amber) : k.amber}\n${k.why || ""}${k.prev !== "" ? `\nLast month ${fmtKpi(k.prev, k.unit)}` : ""}`;
  return `<a class="kpi ${RAGCLS[k.rag]}" href="#/t2/${KPI_LINKS[i] === "trn" ? "training" : `reg/${KPI_LINKS[i]}`}" data-tip="${esc(tip)}" style="text-decoration:none;color:inherit">
    <div class="k-name">${esc(k.name)}<br><span style="font-weight:400">${esc(k.def.length > 46 ? k.def.slice(0, 44) + "…" : k.def)}</span></div>
    <div class="k-val">${fmtKpi(k.actual, k.unit)}<span class="k-trend ${trendClass(k)}">${k.trend}</span></div>
    ${spark(series, k.rag === "R" ? "st-R" : k.rag === "A" ? "st-A" : "st-s1", { current: m })}
    <div class="k-foot"><span>Target ${esc(k.targetText)}</span><span class="pill ${k.rag}">${E.RAG_TEXT[k.rag]}</span></div></a>`;
}

export function qCalendar(cal, { big = false } = {}) {
  const first = E.weekday(cal[0].date);
  const head = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => `<div class="dow">${d}</div>`).join("");
  const blanks = Array(first).fill(`<div></div>`).join("");
  const tiles = cal.map((d) => {
    const cls = d.weekend && !d.code ? "wk" : DAYCLS[d.code] || "";
    const dots = d.weekend || d.future ? "" : `<span class="dots">${d.procs.map((p) => `<i class="c${p.code}" title="${esc(p.label)}: ${esc(p.status)}"></i>`).join("")}</span>`;
    const ov = d.procs.some((p) => p.override) ? `<span class="ov" title="Manual override">✎</span>` : "";
    const prio = big && d.log.p1 ? `<span class="prio">${esc(d.log.p1)}</span>` : "";
    const tip = d.weekend ? `${fmtLong(d.date)}\nWeekend` : d.future ? `${fmtLong(d.date)}\nNot yet assessed` :
      `**${fmtLong(d.date)} · ${d.status}**\n${d.procs.map((p) => `${p.label}: ${p.status}${p.override ? " (override)" : ""}`).join("\n")}${d.log.p1 ? `\n① ${d.log.p1}` : ""}`;
    return `<button class="qtile ${cls} ${d.today ? "today" : ""}" data-day="${d.date}" data-tip="${esc(tip)}"><span class="d">${d.day}</span>${prio}${dots}${ov}</button>`;
  }).join("");
  return `<div class="qcal ${big ? "big" : ""}">${head}${blanks}${tiles}</div>
    <div class="legend" style="margin-top:10px"><span><i class="bg-G"></i>No issue</span><span><i class="bg-A"></i>In progress</span><span><i class="bg-R"></i>Critical</span><span><i class="bg-W"></i>Weekend</span><span><i style="border:1px solid var(--line-strong)"></i>Future</span><span>Dots: Deviation · CAPA · Change Ctrl · Inspection</span></div>`;
}

const urgentList = (items, reg, s) => items.length ? `<div class="urgent">${items.map(({ r, c }) => {
  const d = reg === "rel" ? c.toDue : c.toDue;
  const lbl = c.live === "Overdue" ? pill("Overdue", "R") : d === "" ? pill(r.status) : pill(d === 0 ? "Due today" : `${d} d`, d <= 1 ? "A" : "info");
  return `<a href="#/t2/reg/${reg}?id=${encodeURIComponent(r.id)}"><span class="ref">${esc(r.id)}</span><span class="desc" title="${esc(r.desc || r.title || "")}">${esc(r.desc || r.title || r.product || "")}</span>${lbl}</a>`;
}).join("")}</div>` : `<div class="empty">Nothing open 🎉</div>`;

/** Open Tier 1 actions escalated to Tier 2 (the bridge between the boards). */
export function tier1Escalations() {
  if (!hasTier("t1")) return [];
  const t1 = store.t1;
  const ctx = E.t1Context(t1, t1.setup.selDate, "All team");
  return E.t1OpenActions(ctx).escalated;
}

/** What the 08:30 huddle reported, as entered in the Tier 2 Daily Log (Tier 2 app). */
function t1Headlines(log, openEsc) {
  const red = String(log.t1red || "").trim();
  return `<div class="grid g3" style="margin-bottom:12px">
    <div class="kpi ${log.t1held === "Yes" ? "G" : log.t1held === "No" ? "R" : "N"}"><div class="k-name">Tier 1 huddle</div><div class="k-val" style="font-size:20px">${log.t1held === "Yes" ? "Held" : log.t1held === "No" ? "Not held" : "—"}</div><div class="k-foot"><span>Daily Log</span></div></div>
    <div class="kpi ${red ? "R" : log.t1held ? "G" : "N"}"><div class="k-name">Tier 1 red letters</div><div class="k-val" style="font-size:20px">${esc(red || (log.t1held ? "None" : "—"))}</div><div class="k-foot"><span>SQDCP</span></div></div>
    <div class="kpi ${log.t1safety ? "A" : "N"}"><div class="k-name">Tier 1 safety & containment</div><div class="k-val" style="font-size:14px;line-height:1.3">${esc(log.t1safety || "—")}</div><div class="k-foot"><span>${openEsc.length} open escalation${openEsc.length === 1 ? "" : "s"} from Tier 1</span></div></div>
  </div>${log.t1held ? "" : `<div class="callout" style="margin-bottom:12px">Ask the Tier 1 owner: huddle held? red letters? safety events? — and enter them in today's Daily Log (with any escalation in register 10·A).</div>`}`;
}

/* ── Dashboard ──────────────────────────────────────────── */

export function renderBoard(root, { filters = null } = {}) {
  root = fresh(root);
  const boardF = filters || pageFilters("board");
  const s = applyFilters("t2", S(), boardF), st = s.setup;
  const comp = E.t2Computed(s);
  const { kpis, other, pulse } = E.t2Kpis(s, comp);
  const cal = E.t2Calendar(s);
  const sum = E.t2Summary(s, comp);
  const todayLog = s.daily[st.statusDate] || {};
  const elapsed = cal.filter((d) => !d.weekend && !d.future);
  const held = elapsed.filter((d) => d.log.held === "Yes").length;
  const att = elapsed.map((d) => d.log.attendees).filter(has);
  const esc3 = E.t2Top(s, "esc", 3, comp);
  const t1esc = tier1Escalations();
  const critDays = cal.filter((d) => d.code === 3).length;

  root.innerHTML = `
  <section class="hero">
    <div class="hero-grid">
      <div>
        <div class="eyebrow">${esc(st.department)} · ${esc(st.boardLevel)}</div>
        <h1>QA Tier 2 Daily Management</h1>
        <p>${esc(st.site)} · one team — one standard — zero compromise</p>
        <div class="hero-meta">
          <span class="chip">Month <b>${fmtMonth(st.month)}</b></span>
          <label class="chip">As of <input type="date" value="${st.statusDate}" data-asof aria-label="Status date"></label>
          <span class="chip">⏱ <b>${esc(st.meetingTime)}</b> · ${esc(st.location)}</span>
          <span class="chip">Owner <b>${esc(st.owner)}</b> · ${esc(st.ownerRole)}</span>
        </div>
      </div>
      <div style="display:grid;gap:10px;justify-items:end">
        <div class="ladder"><div>Tier 1<small>08:30 huddle</small></div><div class="on">Tier 2<small>you are here</small></div><div>Tier 3<small>site management</small></div></div>
        <div class="row"><button class="btn primary" data-standup>▶ Run the 15-min stand-up</button><button class="btn" data-a3 title="The dashboard on one A3 landscape page, 300 dpi — PDF or PNG">⎙ A3 board</button><a class="btn" href="#/report">⤓ Word report</a></div>
      </div>
    </div>
  </section>

  ${filters ? "" : filterBar(boardF, { title: "Filter the board", period: false, dims: ["owner", "area", "product", "cls", "sev", "type", "source", "dept", "rstatus", "state"], note: "Every KPI, the Q-calendar and the lists below recalculate on the records that pass — e.g. one person's board, or one product's. Registers that do not record a field are counted unfiltered." })}
  <div class="grid split-pulse" style="margin-top:14px">
    <div class="card card-pad ring-wrap" data-tip="${esc(`**Quality Pulse** = (G + ½A) ÷ (G + A + R)\n= (${pulse.g} + ${pulse.a / 2}) ÷ ${pulse.g + pulse.a + pulse.r}\n≥ 85 % green · ≥ 65 % amber · below that red`)}">
      <div class="ring-label">Quality Pulse</div>
      ${ring(pulse.score, pulse.rag, { size: 150, label: "Quality pulse" })}
      <div class="ring-legend"><span><i class="dot G"></i>${pulse.g}</span><span><i class="dot A"></i>${pulse.a}</span><span><i class="dot R"></i>${pulse.r}</span></div>
      <span class="pill ${pulse.rag}">${pulse.g} of ${pulse.g + pulse.a + pulse.r} KPIs on target</span>
    </div>
    <div class="kpi-grid">${kpis.map((k, i) => kpiTile(k, i, s)).join("")}
      <a class="kpi ${other.rag}" href="#/t2/setup" style="text-decoration:none;color:inherit" data-tip="Manual indicator — set in Setup § 2">
        <div class="k-name">Other points<br><span style="font-weight:400">${esc(other.name)}</span></div>
        <div class="k-val" style="font-size:20px">${esc(other.actual)}</div><div class="k-foot"><span>Manual</span><span class="pill ${other.rag}">${E.RAG_TEXT[other.rag]}</span></div></a>
    </div>
  </div>

  <div class="grid split-wide" style="margin-top:16px">
    <div class="card card-pad">
      <div class="card-head"><h2>Q-calendar <span class="sub">${fmtMonth(st.month)} · ${critDays} critical day${critDays === 1 ? "" : "s"} · click a day to log the stand-up</span></h2><a class="btn sm" href="#/t2/calendar">Open Daily Log ›</a></div>
      ${qCalendar(cal)}
    </div>
    <div class="stack">
      <div class="card card-pad">
        <div class="card-head"><h2>Top 3 priorities <span class="sub">${fmtLong(st.statusDate)}</span></h2><button class="btn sm" data-day="${st.statusDate}">Edit</button></div>
        ${todayLog.p1 || todayLog.p2 || todayLog.p3 ? `<ol class="prio-list">${[todayLog.p1, todayLog.p2, todayLog.p3].filter(Boolean).map((p) => `<li>${esc(p)}</li>`).join("")}</ol>` : `<div class="empty">No priorities logged for this day yet</div>`}
      </div>
      <div class="card card-pad">
        <div class="card-head"><h2>Stand-up</h2><span class="muted" style="font-size:12.5px">${held} / ${elapsed.filter((d) => !d.weekend).length} meetings held · avg ${att.length ? fmtNum(att.reduce((a, b) => a + b, 0) / att.length) : "—"} attendees</span></div>
        <div class="quote">“${esc(st.message)}”</div>
      </div>
      <div class="card card-pad">
        <div class="card-head"><h2>⇪ Escalated to Tier 3</h2><a class="btn sm" href="#/t2/reg/esc">Register 10 ›</a></div>
        ${urgentList(esc3, "esc", s)}
        <div class="card-head" style="margin:14px 0 8px"><h2>⇧ From Tier 1 <span class="sub">open huddle escalations</span></h2>${hasTier("t1") ? `<a class="btn sm" href="#/t1/reg/ac">Actions ›</a>` : `<a class="btn sm" href="#/t2/reg/t1e">Register 10·A ›</a>`}</div>
        ${!hasTier("t1") ? urgentList(E.t2Top(s, "t1e", 5, comp), "t1e", s) : t1esc.length ? `<div class="urgent">${t1esc.map((a) => `<a href="#/t1/reg/ac?id=${encodeURIComponent(a.id)}"><span class="ref">${esc(a.id)}</span><span class="desc">${esc(a.desc)} (${esc(a.officer)})</span>${pill(E.dueLabel(a.due, store.t1.setup.selDate), a.due < store.t1.setup.selDate ? "R" : "A")}</a>`).join("")}</div>` : `<div class="empty">No open Tier 1 escalation</div>`}
      </div>
    </div>
  </div>

  <div class="grid g4" style="margin-top:16px">
    ${["dev", "capa", "cc", "insp"].map((reg) => {
      const sc = T2_REGISTERS[reg];
      return `<div class="card card-pad"><div class="card-head"><h2><span class="mono" style="color:var(--accent)">${sc.no}</span> ${esc(sc.title)}</h2><a class="btn sm ghost" href="#/t2/reg/${reg}">›</a></div>${urgentList(E.t2Top(s, reg, 5, comp), reg, s)}</div>`;
    }).join("")}
  </div>

  <div class="card-head" style="margin:22px 0 10px"><h2 style="font-size:15px;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-2)">Monthly summary <span class="sub" style="font:400 12.5px var(--font-body);text-transform:none;letter-spacing:0;color:var(--muted)">cumulative registers · RAG of the matching KPI</span></h2></div>
  <div class="sum-grid">
    ${["dev", "capa", "cc", "insp", "rel", "doc", "load", "apqr", "trn", "esc"].map((reg) => {
      const sc = T2_REGISTERS[reg], x = sum[reg];
      const k = sc.kpi != null ? kpis[sc.kpi] : null;
      const fmtL = (label, v) => (/Utilisation|Completion/.test(label) ? pct(v) : typeof v === "number" ? fmtNum(v) : v === "" ? "—" : v);
      return `<a class="card sum" href="#/t2/reg/${reg}"><div class="s-top"><span class="s-no">${sc.no}</span>${k ? `<span class="pill ${k.rag}">${E.RAG_TEXT[k.rag]}</span>` : `<span class="pill info">Log</span>`}</div>
        <div class="s-title">${esc(sc.short)}</div><div class="s-big">${x.total}<small>+${x.new} ${esc(x.newLabel || "new")}</small></div>
        <dl>${x.lines.map(([l, v]) => `<dt>${esc(l)}</dt><dd>${fmtL(l, v)}</dd>`).join("")}</dl></a>`;
    }).join("")}
  </div>

  <div class="card card-pad" style="margin-top:16px">
    <div class="card-head"><h2>Monthly remarks</h2><a class="btn sm" href="#/t2/setup">Edit in Setup</a></div>
    <p style="margin:0;color:var(--ink-2)">${esc(st.remarks || "—")}</p>
    <p class="muted" style="margin:10px 0 0;font-size:12px">Escalation rule: ${esc(st.escalationRule)} · Board review ${fmtDate(st.reviewDate)}</p>
  </div>`;

  const fb = $("[data-fbar]", root);
  if (fb) {
    wireControls(fb, (F) => { setPageFilters("board", F); renderBoard(root); decorateCharts(root.parentElement || root); });
    $("[data-freset]", fb)?.addEventListener("click", (e) => { e.preventDefault(); setPageFilters("board", {}); renderBoard(root); decorateCharts(root.parentElement || root); });
  }
  $("[data-asof]", root).onchange = (e) => { if (e.target.value) { store.patch("t2", ["setup", "statusDate"], e.target.value, "Status date"); renderBoard(root); } };
  $("[data-standup]", root).onclick = () => standup(() => renderBoard(root));
  $("[data-a3]", root).onclick = () => import("./poster.js").then((m) => m.openA3Export()).catch(() => toast("The A3 export could not be loaded — check the connection"));
  root.addEventListener("click", (e) => {
    const b = e.target.closest("[data-day]");
    if (b) dayEditor(b.dataset.day, () => renderBoard(root));
  });
}

/* ── Day editor (Daily Log row) ─────────────────────────── */

export function dayEditor(date, onSaved) {
  const s = S();
  const log = { ...(s.daily[date] || {}) };
  const weekend = E.isWeekend(date, s.setup);
  const future = date > s.setup.statusDate;
  const procs = E.T2_PROCESSES.map((p) => ({ p, auto: weekend || future ? null : E.t2DayAuto(s, p, date) }));
  const why = procs.map(({ p, auto }) => {
    if (!auto) return `<tr><td>${esc(p.label)}</td><td colspan="2" class="muted">${weekend ? "Weekend — no auto status" : "Future date — not yet assessed"}</td></tr>`;
    const reasons = [
      ...auto.overdue.map((r) => `${r.id} overdue (due ${fmtDate(r.due)})`),
      ...auto.raisedC.map((r) => `${r.id} raised ${p.key === "insp" ? "High" : "Critical"}`),
      ...auto.raisedW.map((r) => `${r.id} raised ${p.key === "insp" ? "Medium" : "Major"}`),
      ...auto.dueSoon.map((r) => `${r.id} due ${fmtDate(r.due)}`),
    ];
    return `<tr><td>${esc(p.label)}</td><td>${pill(auto.status, auto.code === 3 ? "R" : auto.code === 2 ? "A" : "G")}</td><td class="muted" style="font-size:12px">${esc(reasons.join(" · ") || "Nothing open, due or raised")}</td></tr>`;
  }).join("");
  const fields = T2_DAILY_FIELDS.map((f) => `<label class="field ${f.type === "long" || /^p\d/.test(f.key) ? "full" : ""}"><span>${esc(f.label)}</span>${inputHTML("t2", f, log[f.key])}${f.help ? `<small>${esc(f.help)}</small>` : ""}</label>`).join("");
  const { el, close } = drawer({
    title: `${dow(date)} ${fmtDate(date)}`,
    sub: `<div class="meta-row"><span>Daily Log · Q-calendar engine</span><span>${weekend ? "Weekend day" : "Working day"}</span></div>`,
    body: `<div class="card-head"><h2>ƒx Auto status from the registers</h2></div>
      <table class="plain" style="margin-bottom:16px"><tbody>${why}</tbody></table>
      <div class="callout" style="margin-bottom:14px">CRITICAL = an item overdue that day, or a Critical deviation / High finding raised · IN PROGRESS = due within the ${s.setup.soon}-day window, or a Major deviation / Major change / Medium finding raised. Override only when the team decides otherwise, and say why in Remarks.</div>
      <form class="form-grid">${fields}</form>`,
    footer: `<button class="btn" data-clear>Clear this day</button><span class="spacer"></span><button class="btn" data-cancel>Cancel</button><button class="btn primary" data-save>Save day</button>`,
  });
  const form = $("form", el);
  wireInputs(el, "t2", T2_DAILY_FIELDS);
  $("[data-cancel]", el).onclick = close;
  $("[data-clear]", el).onclick = () => {
    delete s.daily[date];
    store.log("t2", { reg: "daily", ref: date, action: "delete", changes: [] });
    store.save("t2"); close(); onSaved?.(); toast(`${fmtDate(date)} cleared`);
  };
  $("[data-save]", el).onclick = () => {
    const out = {};
    for (const f of T2_DAILY_FIELDS) { const v = readField(f, form.elements[f.key].value); if (v !== undefined) out[f.key] = v; }
    const changes = T2_DAILY_FIELDS.filter((f) => String(log[f.key] ?? "") !== String(out[f.key] ?? "")).map((f) => ({ field: f.key, from: log[f.key] ?? "", to: out[f.key] ?? "" }));
    if (Object.keys(out).length) s.daily[date] = out; else delete s.daily[date];
    if (changes.length) store.log("t2", { reg: "daily", ref: date, action: "edit", changes });
    store.save("t2"); close(); onSaved?.(); toast(`Daily Log ${fmtDate(date)} saved`);
  };
}

/* ── Daily Log page ─────────────────────────────────────── */

export function renderCalendar(root) {
  const s = S(), st = s.setup;
  const cal = E.t2Calendar(s);
  const counts = [1, 2, 3].map((c) => cal.filter((d) => d.code === c).length);
  const rows = cal.map((d) => `<tr data-day="${d.date}" style="cursor:pointer">
    <td class="num">${d.day}</td><td>${dow(d.date)}</td><td>${d.weekend ? '<span class="pill">Weekend</span>' : "Working"}</td>
    <td>${esc(d.log.held || "")}</td><td class="num">${esc(d.log.attendees ?? "")}</td>
    ${d.procs.map((p) => `<td class="fx">${p.status ? pill(p.status + (p.override ? " ✎" : ""), p.code === 3 ? "R" : p.code === 2 ? "A" : "G") : ""}</td>`).join("")}
    <td class="fx">${d.status ? pill(d.status, d.code === 3 ? "R" : d.code === 2 ? "A" : "G") : ""}</td>
    <td class="wrap"><div class="clip">${[d.log.p1, d.log.p2, d.log.p3].filter(Boolean).map(esc).join(" · ")}</div></td>
    <td>${esc(d.log.escalated || "")}</td><td class="wrap"><div class="clip">${esc(d.log.remarks || "")}</div></td></tr>`).join("");
  root.innerHTML = `
    <div class="page-head"><div><div class="eyebrow">Tier 2 · Daily Log</div><h1>Q-calendar engine · ${fmtMonth(st.month)}</h1>
      <p>One row per day. Status is derived automatically from the registers — use the manual override only when the team decides otherwise. Click any day to log the meeting, attendees, top 3 priorities and escalations.</p></div>
      <div class="row"><span class="pill G">${counts[0]} no-issue days</span><span class="pill A">${counts[1]} in progress</span><span class="pill R">${counts[2]} critical</span></div></div>
    <div class="card card-pad">${qCalendar(cal, { big: true })}</div>
    <div class="table-wrap" style="margin-top:16px"><table class="data"><thead><tr>
      <th class="num">Day</th><th>Wkday</th><th>Day type</th><th>Tier 2 held</th><th class="num">Attendees</th>
      <th class="fx">ƒx Deviation</th><th class="fx">ƒx CAPA</th><th class="fx">ƒx Change ctrl</th><th class="fx">ƒx Inspection</th><th class="fx">ƒx Overall</th>
      <th>Top 3 priorities</th><th>Escalated</th><th>Remarks</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  root.onclick = (e) => {
    const b = e.target.closest("[data-day]");
    if (b) dayEditor(b.dataset.day, () => renderCalendar(root));
  };
}

/* ── Stand-up mode ──────────────────────────────────────── */

const AGENDA = [
  { t: "00–02", title: "Safety & containment first", q: "Any exposure, spill, near-miss or containment breach since yesterday?" },
  { t: "02–05", title: "Deviations", q: "What is new, what is critical, what is overdue — and who owns it today?" },
  { t: "05–07", title: "CAPA", q: "Which actions are due this week? Any effectiveness check pending?" },
  { t: "07–09", title: "Change control", q: "Which implementations are due? Any validation or regulatory impact?" },
  { t: "09–11", title: "Daily inspection (Gemba)", q: "What did we see on the floor yesterday, and is it fixed?" },
  { t: "11–13", title: "Batch release · documents", q: "Which batches are blocked and why? Which SOPs are overdue?" },
  { t: "13–15", title: "Priorities · load · escalation", q: "What are today's 3 priorities? What do we escalate to Tier 3?" },
];

function standup(onDone) {
  const s = S(), st = s.setup;
  let step = 0, secs = 15 * 60, timer = null;
  const { el, close } = modal(`<div class="row"><div><div class="eyebrow">Tier 2 stand-up · ${esc(st.meetingTime)} · ${esc(st.location)}</div><h2>15 minutes, standing, at the board</h2></div>
    <span class="spacer"></span><div class="timer" data-timer>15:00</div><button class="btn" data-play>Start</button><button class="btn ghost" data-x aria-label="Close">✕</button></div>
    <div class="standup"><ol>${AGENDA.map((a, i) => `<li><button data-step="${i}"><small>${a.t} min</small><b>${esc(a.title)}</b></button></li>`).join("")}</ol><div data-content></div></div>
    <div class="row"><span class="muted" style="font-size:12.5px">← → to move between agenda items</span><span class="spacer"></span><button class="btn" data-prev>‹ Previous</button><button class="btn primary" data-next>Next ›</button></div>`,
  { onClose: () => { clearInterval(timer); document.removeEventListener("keydown", keys); onDone?.(); } });

  const comp = () => E.t2Computed(s);
  const list = (rows, cols) => rows.length ? `<table class="plain"><tbody>${rows.map((r) => `<tr>${cols.map((c) => `<td>${c(r)}</td>`).join("")}</tr>`).join("")}</tbody></table>` : `<div class="empty">Nothing to discuss</div>`;
  const open = (reg) => s[reg].map((r, i) => ({ r, c: comp()[reg][i] })).filter((x) => x.c.open);
  const within = (d, n) => has(d) && E.diffDays(d, st.statusDate) <= n;
  const ref = (reg, r) => `<a class="mono" href="#/t2/reg/${reg}?id=${encodeURIComponent(r.id)}">${esc(r.id)}</a>`;

  const content = () => {
    const yesterday = E.addDays(st.statusDate, -1);
    const t1 = hasTier("t1") ? E.t1Kpis(E.t1Context(store.t1, store.t1.setup.selDate, "All team")).kpis : [];
    switch (step) {
      case 0: return `${hasTier("t1") ? "" : t1Headlines(s.daily[st.statusDate] || {}, open("t1e"))}<div class="grid g3">${t1.slice(0, 4).map((k) => `<div class="kpi ${k.rag}"><div class="k-name">Tier 1 · ${esc(k.name)}</div><div class="k-val">${fmtKpi(k.actual, k.unit)}</div><div class="k-foot"><span>${esc(k.targetText)}</span></div></div>`).join("")}
        <div class="kpi ${E.t2Kpis(s).other.rag}"><div class="k-name">${esc(st.otherDesc)}</div><div class="k-val" style="font-size:20px">${esc(st.otherStatus)}</div></div></div>
        <div class="callout warn" style="margin-top:12px">Yesterday's remarks: ${esc(s.daily[yesterday]?.remarks || "none logged")}</div>`;
      case 1: return list(open("dev").sort((a, b) => (a.r.due || "").localeCompare(b.r.due || "")), [(x) => ref("dev", x.r), (x) => esc(x.r.desc), (x) => pill(x.r.cls), (x) => esc(x.r.owner), (x) => x.c.live === "Overdue" ? pill("Overdue", "R") : `due ${fmtDate(x.r.due)}`]);
      case 2: return `${list(open("capa").filter((x) => within(x.r.due, 7) || x.c.live === "Overdue"), [(x) => ref("capa", x.r), (x) => esc(x.r.desc), (x) => esc(x.r.owner), (x) => pill(x.c.live)])}
        <h3 style="margin:14px 0 6px;font-size:14px">Effectiveness check pending</h3>${list(s.capa.filter((r) => r.status === "Effectiveness Check" || (r.status === "Closed" && r.eff === "Pending")), [(r) => ref("capa", r), (r) => esc(r.desc), (r) => pill(r.eff || "Pending")])}`;
      case 3: return list(open("cc").filter((x) => within(x.r.due, 14) || x.c.live === "Overdue" || x.r.reg === "Yes" || x.r.reg === "TBD"), [(x) => ref("cc", x.r), (x) => esc(x.r.desc), (x) => pill(x.r.cat), (x) => `Reg. impact ${esc(x.r.reg || "—")}`, (x) => pill(x.c.live)]);
      case 4: return list(s.insp.map((r, i) => ({ r, c: comp().insp[i] })).filter((x) => x.r.opened >= yesterday || x.c.open), [(x) => ref("insp", x.r), (x) => esc(x.r.area), (x) => esc(x.r.desc), (x) => pill(x.r.sev), (x) => pill(x.c.live)]);
      case 5: return `${list(open("rel"), [(x) => ref("rel", x.r), (x) => esc(x.r.product), (x) => pill(x.c.live), (x) => `lead ${x.c.lead} d`, (x) => esc(x.r.comments || "")])}
        <h3 style="margin:14px 0 6px;font-size:14px">Documents overdue or due within 7 days</h3>${list(open("doc").filter((x) => within(x.r.due, 7)), [(x) => ref("doc", x.r), (x) => esc(x.r.title), (x) => pill(x.c.live)])}`;
      default: {
        const log = s.daily[st.statusDate] || {};
        const load = s.load.map((r, i) => ({ r, c: comp().load[i] })).filter((x) => x.c.status !== "Normal");
        return `<form class="form-grid" data-prio>${["p1", "p2", "p3"].map((k, i) => `<label class="field full"><span>Priority ${i + 1}</span><input name="${k}" value="${esc(log[k] || "")}" placeholder="Verb + object + owner"></label>`).join("")}
          <label class="field"><span>Escalated to Tier 3</span><select name="escalated"><option></option>${["Yes", "No"].map((v) => `<option ${log.escalated === v ? "selected" : ""}>${v}</option>`).join("")}</select></label>
          <div class="field" style="align-self:end"><button type="submit" class="btn primary">Save to today's Daily Log</button></div></form>
          <h3 style="margin:14px 0 6px;font-size:14px">QA load at or above threshold</h3>${list(load, [(x) => esc(x.r.member), (x) => pct(x.c.util), (x) => pill(x.c.status)])}`;
      }
    }
  };
  const draw = () => {
    $$("[data-step]", el).forEach((b) => { if (+b.dataset.step !== step) b.removeAttribute("aria-current"); else b.setAttribute("aria-current", "step"); });
    const a = AGENDA[step];
    $("[data-content]", el).innerHTML = `<div class="eyebrow">${a.t} min</div><h2 style="margin:4px 0 2px">${esc(a.title)}</h2><p class="muted" style="margin:0 0 14px">${esc(a.q)}</p>${content()}`;
    const f = $("[data-prio]", el);
    if (f) f.onsubmit = (e) => {
      e.preventDefault();
      const cur = { ...(s.daily[st.statusDate] || {}) };
      for (const k of ["p1", "p2", "p3", "escalated"]) { const v = f.elements[k].value.trim(); if (v) cur[k] = v; else delete cur[k]; }
      s.daily[st.statusDate] = cur;
      store.log("t2", { reg: "daily", ref: st.statusDate, action: "edit", changes: [{ field: "priorities", from: "", to: [cur.p1, cur.p2, cur.p3].filter(Boolean).join(" | ") }] });
      store.save("t2"); toast("Priorities saved to today's Daily Log");
    };
  };
  const tick = () => {
    secs--;
    const t = $("[data-timer]", el);
    const a = Math.abs(secs);
    t.textContent = `${secs < 0 ? "+" : ""}${String(Math.floor(a / 60)).padStart(2, "0")}:${String(a % 60).padStart(2, "0")}`;
    t.classList.toggle("over", secs < 0);
  };
  const keys = (e) => { if (e.target.closest("input,select,textarea")) return; if (e.key === "ArrowRight") { step = Math.min(6, step + 1); draw(); } if (e.key === "ArrowLeft") { step = Math.max(0, step - 1); draw(); } };
  document.addEventListener("keydown", keys);
  $("[data-x]", el).onclick = close;
  $("[data-play]", el).onclick = (e) => {
    if (timer) { clearInterval(timer); timer = null; e.target.textContent = "Resume"; }
    else { timer = setInterval(tick, 1000); e.target.textContent = "Pause"; }
  };
  $("[data-prev]", el).onclick = () => { step = Math.max(0, step - 1); draw(); };
  $("[data-next]", el).onclick = () => { if (step === 6) close(); else { step++; draw(); } };
  el.addEventListener("click", (e) => { const b = e.target.closest("[data-step]"); if (b) { step = +b.dataset.step; draw(); } if (e.target.closest("a[href^='#']")) close(); });
  draw();
}

/* ── KPI Trend ──────────────────────────────────────────── */

let trendSel = 1;
export function renderTrend(root) {
  const s = S();
  const { kpis } = E.t2Kpis(s);
  const m = +s.setup.month.slice(5, 7) - 1;
  const head = E.MONTHS.map((mn, i) => `<th class="num" ${i === m ? 'style="background:var(--accent-soft)"' : ""}>${mn}</th>`).join("");
  const rows = kpis.map((k, i) => `<tr><td><b>${esc(k.name)}</b><br><span class="muted" style="font-size:12px">${esc(k.unit)} · ${esc(k.better)} is better · target ${esc(k.targetText)}</span></td>
    ${s.trend.rows[i].map((v, j) => `<td class="num"><input class="cell-in num" style="max-width:74px" data-r="${i}" data-c="${j}" value="${v == null ? "" : k.unit === "%" ? Math.round(v * 1000) / 10 : v}" inputmode="decimal" aria-label="${esc(k.name)} ${E.MONTHS[j]}"></td>`).join("")}
    <td class="fx num"><b>${fmtKpi(k.actual, k.unit)}</b></td></tr>`).join("");
  const sel = kpis[trendSel];
  const series = [{ name: sel.name, values: s.trend.rows[trendSel].map((v, j) => (j === m && sel.actual !== "" ? sel.actual : v)), cls: "f-s1" }];
  root.innerHTML = `
    <div class="page-head"><div><div class="eyebrow">Tier 2 · KPI Trend</div><h1>12-month KPI history · ${s.trend.year}</h1>
      <p>At each month-end the live value is frozen into its month column. Percent KPIs are typed as numbers (e.g. 86 for 86 %). The trend arrows on the board compare the live value with last month.</p></div>
      <button class="btn primary" data-freeze>❄ Freeze ${E.MONTHS[m]} — copy Live into the month</button></div>
    <div class="table-wrap"><table class="data"><thead><tr><th>KPI</th>${head}<th class="fx num">ƒx Live</th></tr></thead><tbody>${rows}</tbody></table></div>
    <div class="card card-pad" style="margin-top:16px">
      <div class="card-head"><h2>Trend</h2><select data-kpi class="input">${kpis.map((k, i) => `<option value="${i}" ${i === trendSel ? "selected" : ""}>${esc(k.name)}</option>`).join("")}</select></div>
      ${line(series, { labels: E.MONTHS, pctAxis: sel.unit === "%", target: sel.target, current: m })}
    </div>`;
  root.querySelector("tbody").addEventListener("change", (e) => {
    const inp = e.target.closest("[data-r]");
    if (!inp) return;
    const i = +inp.dataset.r, j = +inp.dataset.c;
    const raw = inp.value.trim().replace(",", ".");
    const v = raw === "" ? null : kpis[i].unit === "%" ? +raw / 100 : +raw;
    if (raw !== "" && Number.isNaN(v)) { toast("Type a number"); return; }
    const old = s.trend.rows[i][j];
    s.trend.rows[i][j] = v;
    store.log("t2", { reg: "trend", ref: `${kpis[i].name} · ${E.MONTHS[j]}`, action: "edit", changes: [{ field: E.MONTHS[j], from: old ?? "", to: v ?? "" }] });
    store.save("t2");
    renderTrend(root);
  });
  $("[data-kpi]", root).onchange = (e) => { trendSel = +e.target.value; renderTrend(root); };
  $("[data-freeze]", root).onclick = () => freezeMonth(() => renderTrend(root));
}

export function freezeMonth(after) {
  const s = S();
  const { kpis } = E.t2Kpis(s);
  const m = +s.setup.month.slice(5, 7) - 1;
  kpis.forEach((k, i) => { s.trend.rows[i][m] = k.actual === "" ? null : k.actual; });
  store.log("t2", { reg: "trend", ref: `Freeze ${E.MONTHS[m]}`, action: "edit", changes: kpis.map((k) => ({ field: k.name, from: "", to: k.actual })) });
  store.save("t2");
  toast(`${E.MONTHS[m]} frozen — live values pasted into KPI Trend`);
  after?.();
}

/* ── Analytics ──────────────────────────────────────────── */

const IN_PROGRESS = ["In Progress", "Effectiveness Check", "In Course", "In Approval", "In Review", "Under Review", "On Hold", "QA Approval"];
/** One fixed colour per register, the same in every chart (colour follows the entity). */
export const REG_SLOT = { act: "f-s1", dev: "f-s2", capa: "f-s3", cc: "f-s4", rel: "f-s5", apqr: "f-s6", tasks: "f-s7", find: "f-s8" };
const slotOf = (reg) => REG_SLOT[reg] || "f-other";
const QMS = ["dev", "capa", "cc", "insp", "act", "find", "aud", "esc", "doc"];
const DATE_KEY = { rej: "opened", dev: "opened", capa: "opened", cc: "opened", insp: "opened", act: "opened", esc: "opened", doc: "opened", apqr: "opened", rel: "mfg", trn: "date", tasks: "opened", aud: "opened", find: "opened" };
const CLOSE_KEY = { rej: "closed", dev: "closed", capa: "closed", cc: "closed", insp: "closed", act: "closed", esc: "closed", doc: "closed", apqr: "closed", rel: "decision", tasks: "closed", aud: "closed", find: "closed" };
const OWNER_KEY = { rej: "owner", dev: "owner", capa: "owner", cc: "owner", insp: "owner", act: "owner", esc: "owner", doc: "owner", apqr: "owner", rel: "officer", tasks: "member", trn: "trainer", aud: "owner", find: "owner" };
const legend = (items) => `<div class="chart-legend">${items.map(([cls, name]) => `<span><i class="bg-${cls.slice(2)}"></i>${esc(name)}</span>`).join("")}</div>`;
const regLabel = (reg) => T2_REGISTERS[reg]?.short || reg;

/** The analytics charts. Each declares the filters that make sense for it and
 * returns its SVG plus the table behind it (for the CSV export). */
export const CHARTS = [
  { id: "mix", title: "Workload by process", q: "Where is work starting but not finishing?", dims: ["owner", "area", "product", "reg"],
    build({ s, comp }) {
      const rows = ["dev", "capa", "cc", "act", "find", "aud", "rej", "insp", "rel", "doc", "apqr", "esc"].filter((reg) => s[reg]).map((reg) => {
        const g = { o: 0, p: 0, c: 0, x: 0 };
        s[reg].forEach((r, i) => { const c = comp[reg][i]; if (c.live === "Overdue") g.x++; else if (!c.open) g.c++; else if (IN_PROGRESS.includes(r.status)) g.p++; else g.o++; });
        return { reg, g };
      });
      return {
        body: stackedH(rows.map(({ reg, g }) => ({ label: regLabel(reg), parts: [{ value: g.o, cls: "f-s1", name: "Open / not started" }, { value: g.p, cls: "f-A", name: "In progress" }, { value: g.x, cls: "f-R", name: "Overdue" }, { value: g.c, cls: "f-G", name: "Closed / done" }] }))),
        extra: legend([["f-s1", "Open / not started"], ["f-A", "In progress"], ["f-R", "Overdue"], ["f-G", "Closed / done"]]),
        data: { head: ["Process", "Open / not started", "In progress", "Overdue", "Closed / done", "Total"], rows: rows.map(({ reg, g }) => [regLabel(reg), g.o, g.p, g.x, g.c, g.o + g.p + g.x + g.c]) },
      };
    } },
  { id: "devcls", title: "Deviations by classification", q: "Is the severity mix shifting?", dims: ["owner", "area", "product", "root", "state"],
    build({ s }) {
      const order = s.lists.DevClass || ["Minor", "Major", "Critical"];
      const m = new Map(order.map((k) => [k, 0]));
      s.dev.forEach((r) => { if (has(r.cls)) m.set(r.cls, (m.get(r.cls) || 0) + 1); });
      const cls = [...m.entries()];
      const C = { Minor: "f-q1", Major: "f-q2", Critical: "f-q3" }; // ordered severity: one hue, light → dark
      return {
        body: `<div class="row" style="justify-content:space-around">${donut(cls.map(([n, v]) => ({ name: n, value: v, cls: C[n] || "f-other" })), { center: String(s.dev.length), sub: "deviations" })}
          <div class="chart-legend" style="display:grid">${cls.map(([n, v]) => `<span><i class="bg-${(C[n] || "f-other").slice(2)}"></i>${esc(n)} · <b>${v}</b></span>`).join("")}</div></div>`,
        data: { head: ["Classification", "Deviations"], rows: cls },
      };
    } },
  { id: "devwhere", title: "Deviations by area", q: "Which area — or product — generates the events?", dims: ["owner", "cls", "product", "root", "state"],
    build({ s }) {
      const byArea = s.dev.some((r) => r.area);
      const m = {};
      s.dev.forEach((r) => {
        let k;
        if (byArea) k = r.area || "No area";
        else { const full = productName(r.product); k = (full.match(/^(.*?\d+(?:[.,]\d+)?\s*mg)/i)?.[1] || full).replace(/\s+/g, " ") || "No product"; }
        m[k] = (m[k] || 0) + 1;
      });
      const none = byArea ? "No area" : "No product";
      const pairs = Object.entries(m).sort((a, b) => (a[0] === none) - (b[0] === none) || b[1] - a[1]);
      return {
        title: byArea ? "Deviations by area" : "Deviations by product",
        body: hbars(pairs.map(([label, value]) => ({ label, value, cls: label === none ? "f-other" : "f-s2" }))),
        data: { head: [byArea ? "Area" : "Product", "Deviations"], rows: pairs },
      };
    } },
  { id: "qdays", title: "Q-calendar days by status", q: "How many days carried an overdue item?", dims: ["owner", "area", "product"],
    build({ s }) {
      const cal = E.t2Calendar(s);
      const days = [1, 2, 3].map((c) => cal.filter((d) => d.code === c).length);
      return {
        body: `<div class="row" style="justify-content:space-around">${donut([{ name: "No issue", value: days[0], cls: "f-G" }, { name: "In progress", value: days[1], cls: "f-A" }, { name: "Critical", value: days[2], cls: "f-R" }], { center: String(days[0] + days[1] + days[2]), sub: "days assessed" })}
          <div class="chart-legend" style="display:grid"><span><i class="bg-G"></i>No issue · <b>${days[0]}</b></span><span><i class="bg-A"></i>In progress · <b>${days[1]}</b></span><span><i class="bg-R"></i>Critical · <b>${days[2]}</b></span></div></div>`,
        data: { head: ["Date", "Status", ...E.T2_PROCESSES.map((p) => p.label)], rows: cal.filter((d) => d.status).map((d) => [d.date, d.status, ...d.procs.map((p) => p.status || "")]) },
      };
    } },
  { id: "trend", title: "KPI trend, 12 months", q: "Are the % KPIs improving over 3 months?", dims: [],
    build({ s, comp }) {
      const { kpis } = E.t2Kpis(s, comp);
      const m = +s.setup.month.slice(5, 7) - 1;
      const pctK = kpis.map((k, i) => ({ k, i })).filter(({ k }) => k.unit === "%");
      const series = pctK.map(({ k, i }, n) => ({ name: k.name, cls: `f-s${(n % 8) + 1}`, values: s.trend.rows[i].map((v, j) => (j === m && k.actual !== "" ? k.actual : v)) }));
      return {
        body: line(series, { labels: E.MONTHS, pctAxis: true, current: m, empty: "No KPI history yet — the live month appears once its KPIs have data, and each month-end freeze adds a point" }),
        extra: legend(series.map((x) => [x.cls, x.name])),
        data: { head: ["KPI", ...E.MONTHS], rows: series.map((x) => [x.name, ...x.values.map((v) => (v == null || v === "" ? "" : Math.round(v * 1000) / 10 + " %"))]) },
      };
    } },
  { id: "util", title: "QA team utilisation", q: "Who is above the load threshold?", dims: ["owner"],
    build({ s, comp }) {
      const load = s.load.map((r, i) => ({ label: r.member, value: comp.load[i].util || 0, cls: comp.load[i].status === "Overloaded" ? "f-R" : comp.load[i].status === "High load" ? "f-A" : "f-G", tip: `**${r.member}**\n${fmtNum(comp.load[i].workload)} planned (calculated) ÷ ${comp.load[i].available} available = ${pct(comp.load[i].util)}\n${comp.load[i].status}` }));
      return {
        body: s.load.length ? hbars(load, { fmt: (v) => pct(v), max: Math.max(1.1, ...load.map((l) => l.value)), marks: [{ v: s.setup.highLoad, cls: "thr-a", label: pct(s.setup.highLoad) }, { v: s.setup.overLoad, cls: "thr-r", label: pct(s.setup.overLoad) }] }) : `<div class="empty">Add the team in register 07 · QA load</div>`,
        data: { head: ["Team member", "Role", "Workload (pd)", "Available (d)", "Utilisation", "Delayed", "Status"], rows: s.load.map((r, i) => [r.member, r.role || "", fmtNum(comp.load[i].workload), comp.load[i].available, pct(comp.load[i].util), comp.load[i].delayed, comp.load[i].status]) },
      };
    } },
  { id: "capasrc", title: "CAPA by source", q: "What feeds the CAPA system?", dims: ["owner", "type", "rstatus", "eff", "state"],
    build({ s }) {
      const m = new Map((s.lists.CAPASource || []).map((k) => [k, 0]));
      s.capa.forEach((r) => { if (has(r.source)) m.set(r.source, (m.get(r.source) || 0) + 1); });
      const pairs = [...m.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
      return { body: hbars(pairs.map(([label, value]) => ({ label, value, cls: "f-s3" }))), data: { head: ["Source", "CAPA"], rows: pairs } };
    } },
  { id: "root", title: "Root-cause categories", q: "Which cause needs a trend CAPA?", dims: ["owner", "area", "product", "cls", "state"],
    build({ s }) {
      const m = new Map((s.lists.RootCause || []).map((k) => [k, 0]));
      s.dev.forEach((r) => { if (has(r.root)) m.set(r.root, (m.get(r.root) || 0) + 1); });
      const pairs = [...m.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
      return { body: hbars(pairs.map(([label, value]) => ({ label, value, cls: "f-s2" }))), data: { head: ["Root cause", "Deviations"], rows: pairs } };
    } },
  { id: "flow", title: "Raised vs closed, 12 weeks", q: "Is the backlog growing or shrinking week by week?", dims: ["reg", "owner", "area", "product"],
    build({ s }) {
      const ref = s.setup.statusDate;
      const weeks = Array.from({ length: 12 }, (_, k) => { const end = E.addDays(ref, -7 * (11 - k)); return [E.addDays(end, -6), end]; });
      const regs = QMS.filter((r) => s[r]);
      const count = (key) => weeks.map(([a, b]) => regs.reduce((n, reg) => n + s[reg].filter((r) => has(r[key[reg]]) && r[key[reg]] >= a && r[key[reg]] <= b).length, 0));
      const raised = count(DATE_KEY), closed = count(CLOSE_KEY);
      const labels = weeks.map(([, b]) => fmtDate(b).slice(0, 6));
      const series = [{ name: "Raised", cls: "f-s1", values: raised }, { name: "Closed", cls: "f-s3", values: closed }];
      return {
        body: line(series, { labels, empty: "Nothing raised or closed in the last 12 weeks" }),
        extra: legend([["f-s1", "Raised"], ["f-s3", "Closed"]]) + `<p class="muted" style="margin:6px 0 0;font-size:12px">Weeks end on the as-of date. Registers: ${regs.map(regLabel).join(", ")}.</p>`,
        data: { head: ["Week from", "Week to", "Raised", "Closed", "Net change"], rows: weeks.map(([a, b], i) => [a, b, raised[i], closed[i], raised[i] - closed[i]]) },
      };
    } },
  { id: "ageing", title: "Ageing of open items", q: "How old is the open backlog, register by register?", dims: ["reg", "owner", "area", "product"],
    build({ s, comp }) {
      const ref = s.setup.statusDate;
      const B = [["0–30 d", "f-a1"], ["31–60 d", "f-a2"], ["61–90 d", "f-a3"], ["> 90 d", "f-a4"]];
      const rows = [...QMS, "apqr", "rej"].filter((r) => s[r]?.length).map((reg) => {
        const g = [0, 0, 0, 0];
        s[reg].forEach((r, i) => {
          if (!comp[reg][i].open || !has(r[DATE_KEY[reg]])) return;
          const age = E.diffDays(ref, r[DATE_KEY[reg]]);
          g[age <= 30 ? 0 : age <= 60 ? 1 : age <= 90 ? 2 : 3]++;
        });
        return { reg, g };
      }).filter((x) => x.g.some(Boolean));
      return {
        body: rows.length ? stackedH(rows.map(({ reg, g }) => ({ label: regLabel(reg), parts: g.map((v, k) => ({ value: v, cls: B[k][1], name: B[k][0] })) }))) : `<div class="empty">No open item</div>`,
        extra: legend(B.map(([n, c]) => [c, n])) + `<p class="muted" style="margin:6px 0 0;font-size:12px">Age = as-of date − date raised.</p>`,
        data: { head: ["Register", ...B.map((b) => b[0]), "Open"], rows: rows.map(({ reg, g }) => [regLabel(reg), ...g, g.reduce((a, b) => a + b, 0)]) },
      };
    } },
  { id: "overdueowner", title: "Overdue items by person", q: "Who needs support to clear the overdue items?", dims: ["reg", "area", "product"],
    build({ s, comp }) {
      const m = {};
      for (const reg of [...QMS, "apqr", "rel", "tasks"]) (s[reg] || []).forEach((r, i) => {
        if (comp[reg]?.[i]?.live !== "Overdue") return;
        const o = r[OWNER_KEY[reg]] || "No owner";
        m[o] ??= { n: 0, by: {} }; m[o].n++; m[o].by[reg] = (m[o].by[reg] || 0) + 1;
      });
      const pairs = Object.entries(m).sort((a, b) => b[1].n - a[1].n).slice(0, 14);
      return {
        body: hbars(pairs.map(([label, x]) => ({ label, value: x.n, cls: "f-R", tip: `**${label}** · ${x.n} overdue\n${Object.entries(x.by).map(([r, n]) => `${regLabel(r)} ${n}`).join(" · ")}` })), { labelW: 150 }),
        data: { head: ["Person", "Overdue", ...[...QMS, "apqr", "rel", "tasks"].map(regLabel)], rows: pairs.map(([o, x]) => [o, x.n, ...[...QMS, "apqr", "rel", "tasks"].map((r) => x.by[r] || 0)]) },
      };
    } },
  { id: "ontime", title: "On-time closure by register", q: "Of the items closed, how many met their due date?", dims: ["owner", "area", "product"],
    build({ s }) {
      const rows = [...QMS, "apqr", "tasks"].filter((r) => s[r]?.length).map((reg) => {
        const closed = s[reg].filter((r) => has(r[CLOSE_KEY[reg]]) && has(r.due));
        const ok = closed.filter((r) => r[CLOSE_KEY[reg]] <= r.due).length;
        return { reg, n: closed.length, ok, v: closed.length ? ok / closed.length : null };
      }).filter((x) => x.n);
      return {
        body: hbars(rows.map((x) => ({ label: regLabel(x.reg), value: x.v, cls: x.v >= 0.9 ? "f-G" : x.v >= 0.75 ? "f-A" : "f-R", tip: `**${regLabel(x.reg)}**\n${x.ok} of ${x.n} closed on or before the due date (${pct(x.v)})` })), { fmt: (v) => pct(v), max: 1, marks: [{ v: 0.9, cls: "thr-a", label: "90 %" }] }),
        extra: `<p class="muted" style="margin:6px 0 0;font-size:12px">Green ≥ 90 % · amber ≥ 75 % · red below. Counts closed items that carry a due date.</p>`,
        data: { head: ["Register", "Closed with a due date", "On time", "On-time rate"], rows: rows.map((x) => [regLabel(x.reg), x.n, x.ok, pct(x.v)]) },
      };
    } },
  { id: "intake", title: "Records raised per month", q: "Which months bring the most new work?", dims: ["owner", "area", "product"],
    build({ s }) {
      const y = String(s.trend.year || s.setup.month.slice(0, 4));
      const regs = ["dev", "capa", "cc", "act"].filter((r) => s[r]);
      const other = ["insp", "esc", "doc", "find", "aud"].filter((r) => s[r]);
      const cols = E.MONTHS.map((mn, j) => {
        const mm = `${y}-${String(j + 1).padStart(2, "0")}`;
        const n = (reg) => s[reg].filter((r) => String(r[DATE_KEY[reg]] || "").startsWith(mm)).length;
        return { label: `${mn} ${y}`, short: mn, parts: [...regs.map((reg) => ({ value: n(reg), cls: slotOf(reg), name: regLabel(reg) })), { value: other.reduce((a, r) => a + n(r), 0), cls: "f-other", name: "Other (inspections, escalations, documents, audits, findings)" }] };
      });
      return {
        body: columns(cols, { height: 210 }),
        extra: legend([...regs.map((r) => [slotOf(r), regLabel(r)]), ["f-other", "Other"]]),
        data: { head: ["Month", ...regs.map(regLabel), "Other"], rows: cols.map((c) => [c.label, ...c.parts.map((p) => p.value)]) },
      };
    } },
];

/** Render one chart on a filtered board, with a cache shared by the page. */
function chartCard(spec, no, pageF, cache, ownFilters = true) {
  const own = ownFilters ? chartFilters(spec.id) : {};
  const F = merge(pageF, own);
  const key = JSON.stringify(F);
  let hit = cache.get(key);
  if (!hit) { const s = applyFilters("t2", S(), F, { comp: cache.baseComp }); hit = { s, comp: s === S() ? cache.baseComp : E.t2Computed(s) }; cache.set(key, hit); }
  const out = spec.build(hit);
  CHART_DATA.set(spec.id, { title: out.title || spec.title, ...out.data, filters: describe(F) });
  const ownN = activeCount({ ...own, period: own.period === "inherit" ? "all" : own.period });
  return `<div class="card card-pad" data-chart="${spec.id}"><div class="card-head"><h2><span class="mono" style="color:var(--accent)">${no}</span> ${esc(out.title || spec.title)}</h2>
      ${spec.dims.length ? `<button class="btn sm ghost cf-btn ${ownN ? "on" : ""}" type="button" data-cfilter="${spec.id}" title="Filter this chart">⚲ Filter${ownN ? ` · ${ownN}` : ""}</button>` : ""}</div>
    <p class="muted" style="margin:-6px 0 8px;font-size:12.5px">${esc(spec.q)}</p>${chipsHTML(F)}${out.body}${out.extra || ""}</div>`;
}

export function renderAnalytics(root, { filters = null, only = null, ownFilters = true } = {}) {
  const pageF = filters || pageFilters("analytics");
  const cache = new Map();
  cache.baseComp = E.t2Computed(S());
  const n = activeCount(pageF);
  const interactive = !filters;
  root.innerHTML = `
    <div class="page-head"><div><div class="eyebrow">Tier 2 · Analytics</div><h1>${CHARTS.length} live charts</h1><p>Every chart is recalculated from the registers. Filter the whole page, or one chart with its ⚲ Filter button; hover any bar or point for the figures; ⤓ exports a chart as PNG, SVG or CSV.</p></div>
      ${interactive ? `<div class="row"><button class="btn" data-export-all title="Every chart of this page in one ZIP file">⤓ All charts (ZIP)</button></div>` : ""}</div>
    ${interactive ? filterBar(pageF, { title: "Page filters", dims: ["owner", "area", "product", "cls", "sev", "type", "source", "dept", "root", "rstatus", "risk", "eff", "btype", "esc", "state", "reg"], note: "A filter applies to the registers that record that field; the others are counted unfiltered. Period: records raised (or active, closed, due) in the period." }) : ""}
    <div class="grid g2" style="margin-top:${interactive ? 14 : 0}px">${CHARTS.map((c, i) => (!only || only.includes(c.id) ? chartCard(c, i + 1, pageF, cache, ownFilters) : "")).join("")}</div>`;
  if (!interactive) return;
  const fbar = $("[data-fbar]", root);
  wireControls(fbar, (F) => { setPageFilters("analytics", F); renderAnalytics(root); decorateCharts(root); });
  $("[data-freset]", root)?.addEventListener("click", (e) => { e.preventDefault(); setPageFilters("analytics", {}); renderAnalytics(root); decorateCharts(root); });
  root.addEventListener("click", (e) => {
    const b = e.target.closest("[data-cfilter]");
    if (!b || !root.contains(b)) return;
    const spec = CHARTS.find((c) => c.id === b.dataset.cfilter);
    const card = b.closest(".card");
    const open = (card) => openChartFilter(card, { id: spec.id, dims: spec.dims, onApply: (F, close) => {
      setChartFilters(spec.id, F);
      const tmp = document.createElement("div");
      tmp.innerHTML = chartCard(spec, CHARTS.indexOf(spec) + 1, pageFilters("analytics"), Object.assign(new Map(), { baseComp: E.t2Computed(S()) }));
      const next = tmp.firstElementChild;
      card.replaceWith(next);
      decorateCharts(next.parentElement);
      if (!close) open(next);
    } });
    open(b.closest(".card"));
  });
}
