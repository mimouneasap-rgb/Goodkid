// Tier 1 — shop-floor huddle board: SQDCP letter calendars, today tiles,
// 20 KPIs, team performance, open actions, today's huddle and the skills matrix.

import { store } from "./store.js";
import * as E from "./engine.js";
import { SKILL_LEVELS } from "./schema.js";
import { columns, hbars, ring } from "./charts.js";
import { openEditor } from "./registers.js";
import { esc, pill, fmtDate, fmtLong, fmtMonth, fmtKpi, pct, fmtNum, toast, $, $$ } from "./ui.js";

const has = (v) => v !== "" && v != null;

/** Day positions of the SQDCP letters (7 × 9 grid, filled in reading order), as drawn on the workbook board. */
const LETTERS = {
  S: [".#####.", "##...##", "##.....", "##.....", ".#####.", ".....##", ".....##", "##...##", ".#####."],
  Q: [".#####.", "##...##", "##...##", "##...##", "##...##", "##.#.##", "##..##.", ".#.....", "......."],
  D: ["#####..", "##..##.", "##...##", "##...##", "##...##", "##...##", "##...##", "##.....", "......."],
  C: ["..#####", ".######", "##.....", "##.....", "##.....", "##.....", "##.....", ".######", "..####."],
  P: ["######.", "##...##", "##...##", "##...##", "######.", "#####..", "##.....", ".......", "......."],
};
const HEADLINE = { S: 0, Q: 4, D: 8, C: 12, P: 16 };
const CODE_TXT = { 0: "Future", 1: "Green", 2: "Amber", 3: "Red", 7: "No data logged", 8: "Weekend" };

const view = { officer: "All team" };

function letterGrid(pillar, days) {
  const cells = [];
  let n = 0;
  LETTERS[pillar.key].forEach((row, r) => [...row].forEach((ch, c) => {
    if (ch !== "#") return;
    const d = days[n++];
    const style = `grid-row:${r + 1};grid-column:${c + 1}`;
    if (!d) { cells.push(`<span class="lcell c9" style="${style}"></span>`); return; }
    const code = d.codes[pillar.key];
    const ov = d.override?.[pillar.ov];
    const tip = `**${fmtLong(d.date)} · ${pillar.name}**\n${CODE_TXT[code]}${ov ? ` (huddle override: ${ov})` : ""}${d.auto ? `\nAutomatic: ${CODE_TXT[d.auto[pillar.key]]}` : ""}`;
    cells.push(`<button class="lcell c${code} ${d.selected ? "sel" : ""}" style="${style}" data-date="${d.date}" data-tip="${esc(tip)}">${d.day}</button>`);
  }));
  return `<div class="lgrid">${cells.join("")}</div>`;
}

export function renderBoard(root) {
  const s = store.t1, st = s.setup;
  if (view.officer !== "All team" && !s.roster.some((o) => o.name === view.officer)) view.officer = "All team";
  const ctx = E.t1Context(s, st.selDate, view.officer);
  const { kpis, health } = E.t1Kpis(ctx);
  const days = E.t1Days(ctx);
  const counts = E.t1PillarCounts(days);
  const t = E.t1Today(ctx);
  const team = E.t1Team(s, st.selDate);
  const { open, escalated } = E.t1OpenActions(ctx);
  const hd = s.hd.find((h) => h.date === st.selDate);
  const hdIndex = s.hd.findIndex((h) => h.date === st.selDate);
  const working = E.workingDays(st.selDate, st);
  const daysWithout = kpis[0];

  const tile = (label, value, sub, rag) => `<div class="ttile ${rag}"><span class="t-l">${label}</span><span class="t-v">${value}</span><span class="t-s">${sub}</span></div>`;
  const kRag = (i) => kpis[i].rag;

  // Daily activity (stacked columns) for the month so far
  const mdays = E.monthDays(st.selDate).filter((d) => d <= st.selDate && !E.isWeekend(d, st));
  const act = mdays.map((d) => {
    const rows = ctx.dl.filter((r) => r.date === d);
    const sumk = (...ks) => rows.reduce((a, r) => a + ks.reduce((b, k) => b + (+r[k] || 0), 0), 0);
    return { label: fmtDate(d), short: String(+d.slice(8)), parts: [
      { value: sumk("lc"), cls: "f-s1", name: "Line clearances" },
      { value: ctx.br.filter((r) => r.done === d).length, cls: "f-s2", name: "Records reviewed" },
      { value: sumk("ipc", "aql"), cls: "f-s3", name: "IPC + AQL checks" },
      { value: sumk("gd"), cls: "f-s4", name: "Gemba rounds" },
      { value: sumk("logb", "atd", "docs"), cls: "f-s5", name: "Reviews (logbook, AT, docs)" },
    ] };
  });
  const fnTypes = (s.lists.FnTypes || []).map((ty) => ({ label: ty, value: ctx.fn.filter((r) => ctx.mtd(r.opened) && r.type === ty).length, cls: ty === "Containment / HSE" ? "f-R" : "f-s2" })).filter((x) => x.value);

  root.innerHTML = `
  <section class="hero">
    <div class="hero-grid">
      <div>
        <div class="eyebrow">${esc(st.site)}</div>
        <h1>${esc(st.title)}</h1>
        <p>${esc(st.subtitle)}</p>
        <div class="hero-meta">
          <label class="ctl">Selected date<input type="date" value="${st.selDate}" data-sel></label>
          <label class="ctl">Officer<select data-officer><option>All team</option>${s.roster.map((o) => `<option ${o.name === view.officer ? "selected" : ""}>${esc(o.name)}</option>`).join("")}</select></label>
          <span class="chip">Month to date <b>1–${+st.selDate.slice(8)} ${fmtMonth(st.selDate).split(" ")[0].slice(0, 3)}</b> · ${working} working days</span>
          <span class="chip">Today on the floor <b>${t.present} of ${t.roster}</b> present</span>
        </div>
      </div>
      <div style="display:grid;gap:10px;justify-items:end">
        <div class="ladder"><div class="on">Tier 1<small>you are here</small></div><div>Tier 2<small>${esc(store.t2.setup.meetingTime)}</small></div><div>Tier 3<small>site</small></div></div>
        <div class="chip" style="max-width:360px">⏱ Huddle <b>${esc(st.huddleTime)}</b> · ${esc(st.location)}</div>
      </div>
    </div>
  </section>

  <div class="grid split-side" style="align-items:start">
    <div>
      <div class="card-head"><h2 style="font-size:14px;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-2)">SQDCP · day-by-day — ${view.officer === "All team" ? "whole QA team" : esc(view.officer)} · ${fmtMonth(st.selDate)}</h2>
        <span class="muted" style="font-size:12px">automatic from the logs · the huddle can override any day · click a day to select it</span></div>
      <div class="letters">${E.PILLARS.map((p) => {
        const k = kpis[HEADLINE[p.key]];
        const c = counts[p.key];
        return `<div class="card letter-card"><header><b>${p.name}</b><small>${esc(p.tag)}</small></header>${letterGrid(p, days)}
          <div class="lcounts"><span><i class="dot G"></i>${c.g}</span><span><i class="dot A"></i>${c.a}</span><span><i class="dot R"></i>${c.r}</span>${c.n ? `<span><i class="dot N"></i>${c.n}</span>` : ""}</div>
          <div class="lhead" data-tip="${esc(`**${k.name}**\n${k.def}\nTarget ${k.targetText}`)}"><span class="v"><i class="dot ${k.rag}"></i>${fmtKpi(k.actual, k.unit)}</span><small>${esc(k.name)}</small></div></div>`;
      }).join("")}</div>
    </div>
    <div class="card card-pad ring-wrap" data-tip="${esc(`**Tier 1 board health** = (G + ½A) ÷ (G + A + R)\n${health.g} green · ${health.a} amber · ${health.r} red of 20 KPIs\n≥ 85 % green · ≥ 65 % amber`)}">
      <div class="ring-label">Board health</div>${ring(health.score, health.rag, { size: 140 })}
      <div class="ring-legend"><span><i class="dot G"></i>${health.g}</span><span><i class="dot A"></i>${health.a}</span><span><i class="dot R"></i>${health.r}</span></div>
      <span class="pill ${health.rag}">${health.g} of 20 KPIs green</span>
    </div>
  </div>

  <div class="card-head" style="margin:20px 0 10px"><h2 style="font-size:14px;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-2)">Today · ${fmtLong(st.selDate)} · ${view.officer === "All team" ? "whole team" : esc(view.officer)}</h2>
    <div class="legend"><span><i class="bg-G"></i>green</span><span><i class="bg-A"></i>amber</span><span><i class="bg-R"></i>red</span><span><i class="bg-N"></i>no data</span><span><i class="bg-W"></i>weekend</span></div></div>
  <div class="today-grid">
    ${tile("Present today", `${t.present} / ${t.roster}`, "officers on the floor", t.present >= Math.min(t.roster, +st.minStaff || 0) ? "G" : "R")}
    ${tile("Line clearances", t.lc, t.lcf ? `${t.lcf} not right first time` : "all right first time", t.lcf ? "R" : t.lc ? "G" : "N")}
    ${tile("Records reviewed", t.reviewed, "BMR / BPR completed", t.reviewed ? "G" : "N")}
    ${tile("Review backlog", t.backlog, `${t.backlogLate} beyond ${st.brTarget}-day target`, t.backlogLate ? "R" : "G")}
    ${tile("Gemba rounds", `${t.gd} / ${t.gp}`, "done vs planned", t.gp && t.gd < t.gp ? "A" : t.gp ? "G" : "N")}
    ${tile("Findings raised", t.findings, `${t.findingsHigh} high severity`, t.findingsHigh ? "R" : "G")}
    ${tile("Overdue actions", t.overdue, `${t.dueToday} more due today`, t.overdue ? "R" : t.dueToday ? "A" : "G")}
    ${tile("Days without incident", fmtKpi(daysWithout.actual, "n"), "since last safety incident", daysWithout.rag)}
  </div>

  <div class="pillars" style="margin-top:16px">${E.PILLARS.map((p) => `<div class="card pillar"><h3><span class="L">${p.key}</span>${p.name} <span class="muted" style="font:400 11px var(--font-body);letter-spacing:0;text-transform:none">KPIs month to date</span></h3>
    ${kpis.filter((k) => k.pillar === p.key).map((k) => `<div class="pk" data-tip="${esc(`**${k.name}**\n${k.def}\nTarget ${k.targetText} · amber limit ${k.unit === "%" ? pct(k.amber) : k.amber}`)}"><span class="nm">${esc(k.name)}</span><span class="av">${fmtKpi(k.actual, k.unit)}</span><i class="dot ${k.rag}"></i><span class="tg">target ${esc(k.targetText)}</span></div>`).join("")}</div>`).join("")}</div>

  <div class="grid split-wide" style="margin-top:16px">
    <div class="card card-pad">
      <div class="card-head"><h2>◆ Team performance <span class="sub">month to date · every officer · click a name to filter the board</span></h2></div>
      <div class="table-wrap" style="border:0"><table class="plain"><thead><tr><th>Officer</th><th class="num">Days</th><th class="num">Attend.</th><th class="num">LCs</th><th class="num">LC RFT</th><th class="num">Rec.</th><th class="num">Rec. RFT</th><th class="num">Lead d</th><th class="num">Gemba</th><th class="num">Find.</th><th class="num">Open</th><th class="num">Late</th><th class="num">Training</th><th class="num">Act/d</th><th class="num">Skills</th><th>Status</th></tr></thead>
      <tbody>${team.map((r) => `<tr class="${r.name === view.officer ? "hl" : ""}"><td><a href="#" data-pick="${esc(r.name)}"><b>${esc(r.name)}</b></a></td><td class="num">${r.days}</td><td class="num">${pct(r.attendance)}</td><td class="num">${r.lc}</td><td class="num">${pct(r.lcRft)}</td><td class="num">${r.records}</td><td class="num">${pct(r.recRft)}</td><td class="num">${fmtNum(r.lead)}</td><td class="num">${pct(r.gemba)}</td><td class="num">${r.findings}</td><td class="num">${r.open}</td><td class="num" style="${r.late ? "color:var(--r);font-weight:700" : ""}">${r.late}</td><td class="num">${pct(r.training)}</td><td class="num">${fmtNum(r.perDay)}</td><td class="num">${pct(r.skills)}</td>
        <td>${pill(r.status === "G" ? "● On track" : r.status === "A" ? "● Watch" : "● Action needed", r.status)}</td></tr>`).join("")}</tbody></table></div>
    </div>
    <div class="card card-pad">
      <div class="card-head"><h2>◎ Open actions <span class="sub">most urgent first</span></h2><button class="btn sm" data-newaction>＋ Action</button></div>
      ${open.length ? `<div class="urgent">${open.slice(0, 7).map((a) => `<a href="#/t1/reg/ac?id=${encodeURIComponent(a.id)}"><span class="ref">${esc(a.id)}</span><span class="desc" title="${esc(a.desc)}">${esc(a.desc)} <span class="muted">· ${esc(a.officer)}</span></span>${pill(E.dueLabel(a.due, st.selDate), has(a.due) && a.due < st.selDate ? "R" : a.due === st.selDate ? "A" : "info")}</a>`).join("")}</div>` : `<div class="empty">No open action</div>`}
      ${open.length > 7 ? `<p class="muted" style="font-size:12px;margin:8px 0 0">+ ${open.length - 7} more in the Action tracker</p>` : ""}
    </div>
  </div>

  <div class="grid split-3" style="margin-top:16px">
    <div class="card card-pad"><div class="card-head"><h2>▮ Daily activity <span class="sub">${view.officer === "All team" ? "whole team" : esc(view.officer)}</span></h2></div>
      ${columns(act, { width: 560, height: 200 })}
      <div class="chart-legend"><span><i class="bg-s1"></i>Line clearances</span><span><i class="bg-s2"></i>Records reviewed</span><span><i class="bg-s3"></i>IPC + AQL</span><span><i class="bg-s4"></i>Gemba</span><span><i class="bg-s5"></i>Reviews</span></div></div>
    <div class="card card-pad"><div class="card-head"><h2>▤ Findings by type <span class="sub">month to date</span></h2></div>${hbars(fnTypes, { width: 380, labelW: 120 })}</div>
    <div class="card card-pad">
      <div class="card-head"><h2>☀ Today's huddle</h2><button class="btn sm" data-huddle>${hd ? "Edit" : "＋ Log huddle"}</button></div>
      ${hd ? `<ol class="prio-list">${[hd.p1, hd.p2, hd.p3].filter(Boolean).map((p) => `<li>${esc(p)}</li>`).join("")}</ol>
        ${hd.safety ? `<div class="quote" style="margin-top:12px">⛑ ${esc(hd.safety)}</div>` : ""}` : `<div class="empty">No huddle logged for ${fmtDate(st.selDate)}</div>`}
      <h3 style="font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin:14px 0 6px">⇪ Escalated to Tier 2 (open)</h3>
      ${escalated.length ? escalated.map((a) => `<div style="font-size:13px;margin-bottom:4px"><span class="mono">${esc(a.id)}</span> · ${esc(a.desc)} <span class="muted">(${esc(a.officer)})</span></div>`).join("") : `<span class="muted" style="font-size:13px">Nothing escalated</span>`}
      <p class="muted" style="font-size:12px;margin:12px 0 0">Huddle held: ${esc(hd?.held || "—")} · attendees: ${esc(hd?.attendees ?? "—")} · owner: ${esc(st.owner)}</p>
    </div>
  </div>
  <p class="muted" style="font-size:12px;margin-top:14px">S Safety › Q Quality › D Delivery › C Compliance › P People — every figure comes from the Daily Log, Batch Reviews, Findings, Actions, Training, Huddle and Skills Matrix registers. ${esc(st.escalationRule)}</p>`;

  const rerender = () => renderBoard(root);
  $("[data-sel]", root).onchange = (e) => { if (e.target.value) { store.patch("t1", ["setup", "selDate"], e.target.value, "Selected date"); rerender(); } };
  $("[data-officer]", root).onchange = (e) => { view.officer = e.target.value; rerender(); };
  $$("[data-date]", root).forEach((b) => b.onclick = () => { store.patch("t1", ["setup", "selDate"], b.dataset.date, "Selected date"); rerender(); });
  $$("[data-pick]", root).forEach((a) => a.onclick = (e) => { e.preventDefault(); view.officer = view.officer === a.dataset.pick ? "All team" : a.dataset.pick; rerender(); });
  $("[data-newaction]", root).onclick = () => openEditor({ tier: "t1", reg: "ac", prefill: { id: E.nextId(s.ac), opened: st.selDate, status: "Open", source: "Huddle", esc: "No", officer: view.officer !== "All team" ? view.officer : undefined }, onSaved: rerender });
  $("[data-huddle]", root).onclick = () => openEditor({ tier: "t1", reg: "hd", index: hdIndex >= 0 ? hdIndex : null, prefill: hdIndex >= 0 ? null : { date: st.selDate, held: "Yes" }, onSaved: rerender });
}

/* ── Skills matrix ──────────────────────────────────────── */

export function renderSkills(root) {
  const s = store.t1;
  const names = s.skillNames;
  // keep the matrix in step with the roster
  for (const o of s.roster) if (!s.skills.some((k) => k.officer === o.name)) s.skills.push({ officer: o.name, levels: names.map(() => 0), assessed: "" });
  const rows = s.skills.filter((k) => s.roster.some((o) => o.name === k.officer));
  const qualified = names.map((_, j) => rows.filter((r) => r.levels[j] != null && +r.levels[j] >= 3).length);
  root.innerHTML = `
    <div class="page-head"><div><div class="eyebrow">Tier 1 · People</div><h1>Skills matrix · who can do what on the line</h1>
      <p>Level 0 not trained · 1 in training · 2 qualified under supervision · 3 qualified · 4 qualified trainer. Coverage (level ≥ 3) feeds the People pillar. A red count means fewer than two qualified people — a single point of failure: plan cross-training at the next huddle.</p></div></div>
    <div class="table-wrap"><table class="data"><thead><tr><th>Officer</th>${names.map((n) => `<th style="white-space:normal;min-width:84px">${esc(n)}</th>`).join("")}<th class="fx num">ƒx Coverage ≥ 3</th><th class="fx num">ƒx Trainers</th><th>Last assessed</th></tr></thead>
      <tbody>${rows.map((r) => `<tr style="cursor:default"><td><b>${esc(r.officer)}</b></td>${r.levels.map((v, j) => `<td><select class="skill-sel ${v == null ? "" : `lv${v}`}" data-o="${esc(r.officer)}" data-j="${j}" aria-label="${esc(r.officer)} — ${esc(names[j])}"><option value="" ${v == null ? "selected" : ""} title="Not assessed yet">—</option>${SKILL_LEVELS.map((l) => `<option value="${l.v}" ${v != null && +v === l.v ? "selected" : ""} title="${esc(l.label)}">${l.v}</option>`).join("")}</select></td>`).join("")}
        <td class="fx num"><b>${pct(E.skillCoverage(r.levels))}</b></td><td class="fx num">${r.levels.filter((v) => v != null && +v === 4).length}</td>
        <td><input type="date" class="cell-in" data-assessed="${esc(r.officer)}" value="${esc(r.assessed || "")}"></td></tr>`).join("")}
        <tr style="cursor:default"><td class="fx"><b>ƒx People qualified (≥ 3)</b></td>${qualified.map((q) => `<td class="fx num"><span class="pill ${q < 2 ? "R" : "G"}">${q}</span></td>`).join("")}<td class="fx num"><b>${pct(E.skillCoverage(rows.flatMap((r) => r.levels)))}</b></td><td class="fx"></td><td class="fx"></td></tr>
      </tbody></table></div>
    <div class="legend" style="margin-top:12px">${SKILL_LEVELS.map((l) => `<span><i class="lv${l.v}" style="width:16px;height:16px;border-radius:4px"></i>${esc(l.label)}</span>`).join("")}</div>`;
  root.querySelector("tbody").addEventListener("change", (e) => {
    const sel = e.target.closest("[data-j]");
    const rec = sel ? s.skills.find((k) => k.officer === sel.dataset.o) : null;
    if (rec) {
      const j = +sel.dataset.j, old = rec.levels[j];
      rec.levels[j] = sel.value === "" ? null : +sel.value;
      store.log("t1", { reg: "skills", ref: rec.officer, action: "edit", changes: [{ field: names[j], from: old ?? "", to: sel.value }] });
      store.save("t1"); renderSkills(root); toast(`${rec.officer} · ${names[j]} → level ${sel.value}`);
      return;
    }
    const d = e.target.closest("[data-assessed]");
    if (d) {
      const r2 = s.skills.find((k) => k.officer === d.dataset.assessed);
      store.log("t1", { reg: "skills", ref: r2.officer, action: "edit", changes: [{ field: "assessed", from: r2.assessed || "", to: d.value }] });
      r2.assessed = d.value; store.save("t1");
    }
  });
}
