// Person workload: for each person, what they own as data collection owner,
// as data reviewer and across all their tasks, split into completed, in
// progress, pending and overdue.
import { esc, icon, fmtN, fmtPct, fmtMonth, tip, debounce, download } from "./ui.js";
import { hbars, deptColor } from "./charts.js";
import { DEPARTMENTS } from "./engine.js";
const csv = (rows) => new Blob(["\uFEFF" + rows.map((r) => r.map((c) => { const s = String(c ?? ""); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(",")).join("\r\n")], { type: "text/csv" });

export const ROLE_DEFS = [
  { key: "dc", label: "Data collection", who: "as data collection owner", help: "Annexes and Final QA tasks where the person is the data collection owner. Completed = data collected (sent to review or closed). In progress = collecting now. Pending = not started yet (workflow not triggered or not begun). Overdue = data collection not finished and the PQR due date has passed." },
  { key: "dr", label: "Data review", who: "as data reviewer", help: "Tasks where the person is the data reviewer. Completed = reviewed and closed. In progress = in Data Review now. Pending = waiting for the data collection to finish. Overdue = not closed and the PQR due date has passed." },
  { key: "all", label: "All tasks", who: "in any role", help: "Every task the person appears on (assigned to, data collection owner or reviewer), counted once. Completed = closed. In progress = their part is active now. Pending = waiting on someone else or not started. Overdue = not closed and past the PQR due date." },
];
const STATES = [
  { key: "completed", label: "Completed", color: "var(--lc-done)" },
  { key: "inProgress", label: "In progress", color: "var(--lc-collect)" },
  { key: "pending", label: "Pending", color: "var(--lc-review)" },
];
const pv = { role: "dc", month: "", dept: "", groups: false, q: "", sort: "open" };
const blank = () => ({ completed: 0, inProgress: 0, pending: 0, overdue: 0, total: 0 });
const opt = (v, label, sel) => `<option value="${esc(v)}"${String(v) === String(sel) ? " selected" : ""}>${esc(label)}</option>`;

/** Count every person's tasks by role and state (respecting the month / department filters). */
export function personLoad(m, { month = "", dept = "" } = {}) {
  const people = new Map();
  const get = (name, type) => {
    if (!people.has(name)) people.set(name, { name, type, dc: blank(), dr: blank(), all: blank(), depts: {} });
    return people.get(name);
  };
  for (const t of m.tasks) {
    if (month && t.plannedMonth !== month) continue;
    if (dept && t.dept !== dept) continue;
    const review = !t.closed && !t.generated && /review/i.test(t.stage);
    const notStarted = t.generated || /^(not triggered|batches selection)$/i.test(t.stage || "");
    const late = !t.closed && t.overdue === "YES";
    const seen = new Map(); // name -> state for "all"
    const mark = (name, type, state) => {
      if (!name) return;
      const prev = seen.get(name);
      const rank = { inProgress: 3, pending: 2, completed: 1 };
      if (!prev || rank[state] > rank[prev.state]) seen.set(name, { type, state });
    };
    if (t.isData) {
      // data collection owner
      const c = get(t.collector, t.collectorType);
      const dcState = t.closed || review ? "completed" : notStarted ? "pending" : "inProgress";
      c.dc[dcState]++; c.dc.total++;
      if (late && !review) c.dc.overdue++;
      if (t.dept) c.depts[t.dept] = (c.depts[t.dept] || 0) + 1;
      mark(t.collector, t.collectorType, t.closed ? "completed" : review ? "pending" : dcState);
      // reviewer
      if (t.reviewer) {
        const r = get(t.reviewer, t.reviewerType);
        const drState = t.closed ? "completed" : review ? "inProgress" : "pending";
        r.dr[drState]++; r.dr.total++;
        if (late) r.dr.overdue++;
        mark(t.reviewer, t.reviewerType, drState);
      }
      // assignee, when it is someone else
      if (t.assigneeName && t.assigneeName !== t.collector && t.assigneeName !== t.reviewer) mark(t.assigneeName, t.assigneeType, t.closed ? "completed" : notStarted ? "pending" : "inProgress");
    } else if (!t.generated) {
      mark(t.assigneeName, t.assigneeType, t.closed ? "completed" : notStarted ? "pending" : "inProgress");
    }
    for (const [name, { type, state }] of seen) {
      const p = get(name, type);
      p.all[state]++; p.all.total++;
      if (late) p.all.overdue++;
    }
  }
  return [...people.values()].map((p) => ({ ...p, mainDept: Object.entries(p.depts).sort((a, b) => b[1] - a[1])[0]?.[0] || "" }));
}

export function personWorkloadSection(m) {
  const all = personLoad(m, { month: pv.month, dept: pv.dept });
  const q = pv.q.toLowerCase();
  const rows = all.filter((p) => (pv.groups || p.type === "user") && (!q || p.name.toLowerCase().includes(q)) && p[pv.role].total > 0);
  const sortKey = { open: (p) => p[pv.role].inProgress + p[pv.role].pending, completed: (p) => p[pv.role].completed, overdue: (p) => p[pv.role].overdue, total: (p) => p[pv.role].total, name: null }[pv.sort];
  rows.sort((a, b) => (sortKey ? sortKey(b) - sortKey(a) : 0) || a.name.localeCompare(b.name));
  const role = ROLE_DEFS.find((r) => r.key === pv.role);
  const tot = rows.reduce((s, p) => { for (const k of Object.keys(s)) s[k] += p[pv.role][k]; return s; }, blank());
  const groupOnly = all.filter((p) => p.type !== "user").reduce((n, p) => n + p[pv.role].total, 0);
  const chartRows = rows.slice(0, 25).map((p) => ({
    label: p.name,
    sub: `${p.type !== "user" ? `${p.type} · ` : ""}${p[pv.role].overdue ? `${p[pv.role].overdue} overdue` : p.mainDept || ""}`,
    attrs: `data-href="#/collection?q=${encodeURIComponent(p.name)}"`,
    segments: STATES.map((s) => ({ key: s.label, value: p[pv.role][s.key], color: s.color })),
  }));
  const cell = (v, cls = "") => `<td class="r num ${cls}">${v ? fmtN(v) : '<span class="muted">·</span>'}</td>`;
  const roleCols = (x) => `${cell(x.completed)}${cell(x.inProgress)}${cell(x.pending)}${cell(x.overdue, x.overdue ? "late" : "")}${cell(x.total, "tot")}`;
  return `
  <section class="card span-12 reveal" id="person-workload">
    <div class="card-h"><div><h3>Person workload</h3><p>What each person has completed, has in progress, has pending and has overdue: ${esc(role.who)}.</p></div>
      <div class="tools"><button class="btn btn-sm" data-pw-export>${icon("download")}CSV</button></div></div>
    <div class="toolbar">
      <div class="seg-toggle">${ROLE_DEFS.map((r) => `<button type="button" class="${pv.role === r.key ? "on" : ""}" data-pw-role="${r.key}">${r.label}</button>`).join("")}</div>
      <label class="field">${icon("plan")}<select data-pw="month" aria-label="Planned month">${opt("", "All planned months", pv.month)}${m.months.map((x) => opt(x.month, fmtMonth(x.month), pv.month)).join("")}</select></label>
      <label class="field"><select data-pw="dept" aria-label="Department">${opt("", "All departments", pv.dept)}${DEPARTMENTS.map((d) => opt(d, d, pv.dept)).join("")}</select></label>
      <label class="field"><select data-pw="sort" aria-label="Sort">${opt("open", "Most open work", pv.sort)}${opt("overdue", "Most overdue", pv.sort)}${opt("completed", "Most completed", pv.sort)}${opt("total", "Most tasks", pv.sort)}${opt("name", "Name A–Z", pv.sort)}</select></label>
      <label class="f check" style="font-size:12.5px"><input type="checkbox" data-pw-groups ${pv.groups ? "checked" : ""}> Show groups & roles (no person named yet)</label>
      <label class="field search-f" style="max-width:220px;min-width:160px">${icon("search")}<input data-pw-q type="search" placeholder="Find a person…" value="${esc(pv.q)}" aria-label="Find a person"></label>
    </div>
    <div class="kpis" style="margin:0 0 16px">
      ${STATES.map((s) => `<div class="kpi"><div class="k"><i style="width:10px;height:10px;border-radius:3px;background:${s.color}"></i>${s.label}</div><div class="v">${fmtN(tot[s.key])}</div><div class="d">${fmtPct(tot.total ? tot[s.key] / tot.total : 0)} of ${esc(role.label.toLowerCase())}</div></div>`).join("")}
      <div class="kpi ${tot.overdue ? "tone-crit" : ""}"><div class="k">${icon("alert")}Overdue</div><div class="v">${fmtN(tot.overdue)}</div><div class="d">past the PQR due date</div></div>
      <div class="kpi"><div class="k">${icon("tasks")}Total</div><div class="v">${fmtN(tot.total)}</div><div class="d">${fmtN(rows.length)} ${pv.groups ? "people, groups & roles" : "people"}${!pv.groups && groupOnly ? ` · ${fmtN(groupOnly)} on groups/roles` : ""}</div></div>
    </div>
    <p class="muted" style="font-size:12px;margin:0 0 12px">${esc(role.help)}</p>
    <div class="grid g-12">
      <div class="span-12">
        <div class="legend">${STATES.map((s) => `<span><i style="background:${s.color}"></i>${s.label}</span>`).join("")}<span><b style="color:var(--crit-ink)">n late</b> = overdue</span></div>
        ${chartRows.length ? (() => {
          const max = Math.max(1, ...chartRows.map((r) => r.segments.reduce((n, x) => n + x.value, 0)));
          const vl = (r) => { const p = rows.find((x) => x.name === r.label); const x = p[pv.role]; return `${fmtN(x.total)}${x.overdue ? ` <small style="color:var(--crit-ink)">${x.overdue} late</small>` : ""}`; };
          const half = Math.ceil(chartRows.length / 2);
          return chartRows.length > 10 ? `<div class="pw-cols">${hbars(chartRows.slice(0, half), { labelWidth: 150, max, valueLabel: vl })}${hbars(chartRows.slice(half), { labelWidth: 150, max, valueLabel: vl })}</div>` : hbars(chartRows, { labelWidth: 150, max, valueLabel: vl });
        })() : `<p class="muted">${pv.groups ? "Nothing in this selection." : "No named person has tasks in this selection yet. Tick “Show groups & roles”, or name people on the Data collection page."}</p>`}
        ${rows.length > 25 ? `<p class="muted" style="font-size:12px">Top 25 shown in the graph; all ${fmtN(rows.length)} are in the table.</p>` : ""}
      </div>
      <div class="span-12">
        <div class="table-wrap" style="max-height:640px;border:1px solid var(--line);border-radius:14px"><table class="data pw-table">
          <thead>
            <tr><th rowspan="2">Person</th>${ROLE_DEFS.map((r) => `<th colspan="5" class="c grp ${r.key === pv.role ? "on" : ""}">${r.label}</th>`).join("")}</tr>
            <tr>${ROLE_DEFS.map(() => `<th class="r" title="Completed">Done</th><th class="r" title="In progress">In prog.</th><th class="r" title="Pending">Pend.</th><th class="r" title="Overdue">Late</th><th class="r" title="Total">Total</th>`).join("")}</tr>
          </thead>
          <tbody>${rows.map((p) => `<tr data-href="#/collection?q=${encodeURIComponent(p.name)}" style="cursor:pointer"><td style="white-space:nowrap"><b>${esc(p.name)}</b>${p.type !== "user" ? ` <span class="tag warn">${esc(p.type.toUpperCase())}</span>` : p.mainDept ? `<br><small class="muted"><i style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${deptColor(p.mainDept)};margin-right:4px"></i>${esc(p.mainDept)}</small>` : ""}</td>${ROLE_DEFS.map((r) => roleCols(p[r.key])).join("")}</tr>`).join("") || '<tr><td colspan="16" class="empty-row">No people in this selection.</td></tr>'}</tbody>
        </table></div>
      </div>
    </div>
  </section>`;
}

export function bindPersonWorkload(root, rerender) {
  const sec = root.querySelector("#person-workload");
  if (!sec) return;
  sec.querySelectorAll("[data-pw-role]").forEach((b) => b.addEventListener("click", () => { pv.role = b.dataset.pwRole; rerender(); }));
  sec.querySelectorAll("select[data-pw]").forEach((s) => s.addEventListener("change", () => { pv[s.dataset.pw] = s.value; rerender(); }));
  sec.querySelector("[data-pw-groups]").addEventListener("change", (e) => { pv.groups = e.target.checked; rerender(); });
  sec.querySelector("[data-pw-q]").addEventListener("input", debounce((e) => { pv.q = e.target.value; rerender(); setTimeout(() => { const i = document.querySelector("[data-pw-q]"); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 0); }, 250));
  sec.querySelector("[data-pw-export]").addEventListener("click", () => {
    const m = window.apqr?.store?.getModel?.();
    if (!m) return;
    const rows = personLoad(m, { month: pv.month, dept: pv.dept }).filter((p) => pv.groups || p.type === "user");
    download(csv([["Person", "Type", "Main department", ...ROLE_DEFS.flatMap((r) => ["Completed", "In progress", "Pending", "Overdue", "Total"].map((s) => `${r.label} - ${s}`))], ...rows.map((p) => [p.name, p.type, p.mainDept, ...ROLE_DEFS.flatMap((r) => [p[r.key].completed, p[r.key].inProgress, p[r.key].pending, p[r.key].overdue, p[r.key].total])])]), "APQR_person_workload.csv");
  });
}
