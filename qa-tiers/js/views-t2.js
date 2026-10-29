// Tier 2 — daily management board: dashboard, Q-calendar (Daily Log),
// 15-minute stand-up mode, KPI trend history and analytics.

import { store } from "./store.js";
import * as E from "./engine.js";
import { T2_REGISTERS, T2_DAILY_FIELDS } from "./schema.js";
import { hbars, stackedH, donut, ring, line, spark } from "./charts.js";
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
  return `<a class="kpi ${RAGCLS[k.rag]}" href="#/t2/reg/${KPI_LINKS[i]}" data-tip="${esc(tip)}" style="text-decoration:none;color:inherit">
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
  const t1 = store.t1;
  const ctx = E.t1Context(t1, t1.setup.selDate, "All team");
  return E.t1OpenActions(ctx).escalated;
}

/* ── Dashboard ──────────────────────────────────────────── */

export function renderBoard(root) {
  root = fresh(root);
  const s = S(), st = s.setup;
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
        <div class="row"><button class="btn primary" data-standup>▶ Run the 15-min stand-up</button></div>
      </div>
    </div>
  </section>

  <div class="grid split-pulse">
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
        <div class="card-head" style="margin:14px 0 8px"><h2>⇧ From Tier 1 <span class="sub">open huddle escalations</span></h2><a class="btn sm" href="#/t1/reg/ac">Actions ›</a></div>
        ${t1esc.length ? `<div class="urgent">${t1esc.map((a) => `<a href="#/t1/reg/ac?id=${encodeURIComponent(a.id)}"><span class="ref">${esc(a.id)}</span><span class="desc">${esc(a.desc)} (${esc(a.officer)})</span>${pill(E.dueLabel(a.due, store.t1.setup.selDate), a.due < store.t1.setup.selDate ? "R" : "A")}</a>`).join("")}</div>` : `<div class="empty">No open Tier 1 escalation</div>`}
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

  $("[data-asof]", root).onchange = (e) => { if (e.target.value) { store.patch("t2", ["setup", "statusDate"], e.target.value, "Status date"); renderBoard(root); } };
  $("[data-standup]", root).onclick = () => standup(() => renderBoard(root));
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
    const t1 = E.t1Kpis(E.t1Context(store.t1, store.t1.setup.selDate, "All team")).kpis;
    switch (step) {
      case 0: return `<div class="grid g3">${t1.slice(0, 4).map((k) => `<div class="kpi ${k.rag}"><div class="k-name">Tier 1 · ${esc(k.name)}</div><div class="k-val">${fmtKpi(k.actual, k.unit)}</div><div class="k-foot"><span>${esc(k.targetText)}</span></div></div>`).join("")}
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

export function renderAnalytics(root) {
  const s = S();
  const comp = E.t2Computed(s);
  const cal = E.t2Calendar(s);
  const IN_PROGRESS = ["In Progress", "Effectiveness Check", "In Course", "In Approval", "In Review", "Under Review", "On Hold"];
  const mix = ["dev", "capa", "cc", "insp", "rel", "doc", "apqr", "esc"].map((reg) => {
    const g = { o: 0, p: 0, c: 0, x: 0 };
    s[reg].forEach((r, i) => {
      const c = comp[reg][i];
      if (c.live === "Overdue") g.x++; else if (!c.open) g.c++; else if (IN_PROGRESS.includes(r.status)) g.p++; else g.o++;
    });
    return { label: T2_REGISTERS[reg].short, parts: [{ value: g.o, cls: "f-s2", name: "Open / not started" }, { value: g.p, cls: "f-A", name: "In progress" }, { value: g.x, cls: "f-R", name: "Overdue" }, { value: g.c, cls: "f-G", name: "Closed / done" }] };
  });
  const countBy = (reg, key, order) => {
    const m = new Map((order || []).map((k) => [k, 0]));
    s[reg].forEach((r) => { if (has(r[key])) m.set(r[key], (m.get(r[key]) || 0) + 1); });
    return [...m.entries()];
  };
  const cls = countBy("dev", "cls", s.lists.DevClass);
  const clsCls = { Minor: "f-G", Major: "f-A", Critical: "f-R" };
  const days = [1, 2, 3].map((c) => cal.filter((d) => d.code === c).length);
  const { kpis } = E.t2Kpis(s, comp);
  const m = +s.setup.month.slice(5, 7) - 1;
  const pctK = kpis.map((k, i) => ({ k, i })).filter(({ k }) => k.unit === "%");
  const palette = ["f-s1", "f-s2", "f-s3", "f-s4", "f-s5"];
  const series = pctK.map(({ k, i }, n) => ({ name: k.name, cls: palette[n % 5], values: s.trend.rows[i].map((v, j) => (j === m && k.actual !== "" ? k.actual : v)) }));
  const load = s.load.map((r, i) => ({ label: r.member, value: comp.load[i].util || 0, cls: comp.load[i].status === "Overloaded" ? "f-R" : comp.load[i].status === "High load" ? "f-A" : "f-G", tip: `**${r.member}**\n${fmtNum(comp.load[i].workload)} planned (calculated) ÷ ${comp.load[i].available} available = ${pct(comp.load[i].util)}\n${comp.load[i].status}` }));
  const bars = (pairs, c = "f-s1") => hbars(pairs.filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value, cls: c })));
  const card = (no, title, q, body, extra = "") => `<div class="card card-pad"><div class="card-head"><h2><span class="mono" style="color:var(--accent)">${no}</span> ${esc(title)}</h2></div><p class="muted" style="margin:-6px 0 12px;font-size:12.5px">${esc(q)}</p>${body}${extra}</div>`;

  root.innerHTML = `
    <div class="page-head"><div><div class="eyebrow">Tier 2 · Analytics</div><h1>Eight live charts</h1><p>Every chart is recalculated from the registers. Hover any bar or point for the figures.</p></div></div>
    <div class="grid g2">
      ${card(1, "Workload by process", "Where is work starting but not finishing?", stackedH(mix),
        `<div class="chart-legend"><span><i class="bg-s2"></i>Open / not started</span><span><i class="bg-A"></i>In progress</span><span><i class="bg-R"></i>Overdue</span><span><i class="bg-G"></i>Closed / done</span></div>`)}
      ${card(2, "Deviations by classification", "Is the severity mix shifting?", `<div class="row" style="justify-content:space-around">${donut(cls.map(([n, v]) => ({ name: n, value: v, cls: clsCls[n] || "f-s2" })), { center: String(s.dev.length), sub: "deviations" })}
        <div class="chart-legend" style="display:grid">${cls.map(([n, v]) => `<span><i class="bg-${(clsCls[n] || "f-s2").slice(2)}"></i>${esc(n)} · <b>${v}</b></span>`).join("")}</div></div>`)}
      ${card(3, "Deviations by area", "Which area generates the events?", bars(countBy("dev", "area", s.lists.Areas), "f-s2"))}
      ${card(4, "Q-calendar days by status", "How many days carried an overdue item?", `<div class="row" style="justify-content:space-around">${donut([{ name: "No issue", value: days[0], cls: "f-G" }, { name: "In progress", value: days[1], cls: "f-A" }, { name: "Critical", value: days[2], cls: "f-R" }], { center: String(days[0] + days[1] + days[2]), sub: "days assessed" })}
        <div class="chart-legend" style="display:grid"><span><i class="bg-G"></i>No issue · <b>${days[0]}</b></span><span><i class="bg-A"></i>In progress · <b>${days[1]}</b></span><span><i class="bg-R"></i>Critical · <b>${days[2]}</b></span></div></div>`)}
      ${card(5, "KPI trend, 12 months", "Are the % KPIs improving over 3 months?", line(series, { labels: E.MONTHS, pctAxis: true, current: m }),
        `<div class="chart-legend">${series.map((x) => `<span><i class="bg-${x.cls.slice(2)}"></i>${esc(x.name)}</span>`).join("")}</div>`)}
      ${card(6, "QA team utilisation", "Who is above the load threshold?", hbars(load, { fmt: (v) => pct(v), max: Math.max(1.1, ...load.map((l) => l.value)), marks: [{ v: s.setup.highLoad, cls: "thr-a", label: pct(s.setup.highLoad) }, { v: s.setup.overLoad, cls: "thr-r", label: pct(s.setup.overLoad) }] }))}
      ${card(7, "CAPA by source", "What feeds the CAPA system?", bars(countBy("capa", "source", s.lists.CAPASource), "f-s4"))}
      ${card(8, "Root-cause categories", "Which cause needs a trend CAPA?", bars(countBy("dev", "root", s.lists.RootCause), "f-s5"))}
    </div>`;
}
