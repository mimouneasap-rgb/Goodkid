// Data collection panel: progress of the departmental annexes by planned
// month, by data collection owner and by data reviewer, with the list of
// annexes still missing a named person and bulk assignment.
import { esc, icon, fmtN, fmtPct, fmtDate, fmtMonth, fmtMonthShort, tip, debounce, download } from "./ui.js";
import { hbars, stackedColumns, deptColor } from "./charts.js";
import { DEPARTMENTS, SLOTS, monthLabel } from "./engine.js";
import * as store from "./store.js";
import * as act from "./actions.js";
import { csv } from "./views-registers.js";

const STAGE_COLOR = { "Not triggered": "var(--slot-nt)", "Collecting Data": "var(--s1)", "Data Review": "var(--d7)", Completed: "var(--good)" };
const PAGE = 100;
const cv = { scope: "", dept: "", month: "", q: "", missing: "", stage: "open", page: 0, sel: new Set() };
const opt = (v, label, sel) => `<option value="${esc(v)}"${String(v) === String(sel) ? " selected" : ""}>${esc(label)}</option>`;

function inScope(t) {
  if (!t.isAnnex) return false;
  if (cv.scope === "shared" && !t.shared) return false;
  if (cv.dept && t.dept !== cv.dept) return false;
  if (cv.month && t.plannedMonth !== cv.month) return false;
  return true;
}
function listRows(m) {
  const q = cv.q.toLowerCase();
  const stageOf = m.collection.stageOf;
  return m.realTasks.filter((t) => {
    if (!inScope(t)) return false;
    if (cv.stage === "open" && t.closed) return false;
    if (cv.stage && cv.stage !== "open" && stageOf(t) !== cv.stage) return false;
    if (cv.missing === "owner" && t.collectorPerson) return false;
    if (cv.missing === "reviewer" && t.reviewerPerson) return false;
    if (cv.missing === "any" && t.collectorPerson && t.reviewerPerson) return false;
    if (q && !`${t.ref} ${t.product} ${t.title} ${t.collector} ${t.reviewer} ${t.slot}`.toLowerCase().includes(q)) return false;
    return true;
  }).sort((a, b) => (a.plannedMonth || "9").localeCompare(b.plannedMonth || "9") || a.product.localeCompare(b.product) || a.slot.localeCompare(b.slot));
}

function personTag(name, type) {
  if (!name) return '<span class="tag crit">NOT SET</span>';
  if (type === "user") return esc(name);
  return `${esc(name)} <span class="tag warn">${esc(type.toUpperCase())}</span>`;
}

export const collection = {
  id: "collection",
  title: "Data collection",
  sub: () => "Annexe data collection by planned month, data collection owner and data reviewer",
  params(p) { if (Object.keys(p).length) Object.assign(cv, { scope: "", dept: "", month: "", q: "", missing: "", stage: "open", page: 0 }, p); },
  render(m) {
    const stageOf = m.collection.stageOf;
    const all = m.tasks.filter(inScope);
    const real = all.filter((t) => !t.generated);
    const count = (st) => all.filter((t) => stageOf(t) === st).length;
    const openReal = real.filter((t) => !t.closed);
    const noOwner = openReal.filter((t) => !t.collectorPerson).length;
    const noRev = openReal.filter((t) => !t.reviewerPerson).length;

    const months = m.months.map((mo) => {
      const ts = all.filter((t) => t.plannedMonth === mo.month);
      const counts = Object.fromEntries(m.collection.stages.map((st) => [st, ts.filter((t) => stageOf(t) === st).length]));
      return { label: fmtMonthShort(mo.month), sub: `${mo.planned} PQRs`, counts, href: `#/collection?month=${mo.month}` };
    });
    const tallyBy = (keyFn, typeFn) => {
      const mp = new Map();
      for (const t of real) {
        const k = keyFn(t) || "Reviewer not set";
        if (!mp.has(k)) mp.set(k, { name: k, type: typeFn(t), c: { "Collecting Data": 0, "Data Review": 0, Completed: 0 }, open: 0, overdue: 0 });
        const r = mp.get(k);
        r.c[stageOf(t)]++;
        if (!t.closed) { r.open++; if (t.overdue === "YES") r.overdue++; }
      }
      return [...mp.values()].sort((a, b) => b.open - a.open || (b.c.Completed - a.c.Completed) || a.name.localeCompare(b.name));
    };
    const owners = tallyBy((t) => t.collector, (t) => t.collectorType).slice(0, 18);
    const reviewers = tallyBy((t) => t.reviewer, (t) => (t.reviewer ? t.reviewerType : "missing")).slice(0, 18);
    const rowsFor = (list, kind) => list.map((r) => ({
      label: r.type === "user" ? r.name : r.type === "missing" ? "Reviewer not set" : `${r.name}`,
      sub: r.type === "user" ? `${r.open} open${r.overdue ? ` · ${r.overdue} late` : ""}` : r.type === "missing" ? "name a reviewer below" : `${r.type} · name a person`,
      attrs: `data-coll-person="${esc(kind)}|${esc(r.type === "missing" ? "" : r.name)}"`,
      segments: [{ key: "Collecting data", value: r.c["Collecting Data"], color: STAGE_COLOR["Collecting Data"] }, { key: "In review", value: r.c["Data Review"], color: STAGE_COLOR["Data Review"] }, { key: "Completed", value: r.c.Completed, color: STAGE_COLOR.Completed }],
    }));
    const deptOpts = DEPARTMENTS.map((d) => opt(d, d, cv.dept)).join("");
    return `
    <div class="toolbar">
      <div class="seg-toggle">${[["", "All annexes"], ["shared", "QA Data Collection stream"]].map(([v, l]) => `<button type="button" class="${cv.scope === v ? "on" : ""}" data-cv-scope="${v}" title="${v ? "Annexes Scigeniq files under the shared “QA Data Collection” type" : ""}">${l}</button>`).join("")}</div>
      <label class="field"><select data-cv="dept" aria-label="Department">${opt("", "All departments", cv.dept)}${deptOpts}</select></label>
      <label class="field">${icon("plan")}<select data-cv="month" aria-label="Planned month">${opt("", "All planned months", cv.month)}${m.months.map((x) => opt(x.month, fmtMonth(x.month), cv.month)).join("")}</select></label>
    </div>
    <div class="kpis" style="margin-top:0">
      <div class="kpi"><div class="k">${icon("tasks")}Annexes in scope</div><div class="v">${fmtN(all.length)}</div><div class="d">${fmtN(count("Not triggered"))} not triggered</div></div>
      <div class="kpi"><div class="k"><i style="width:10px;height:10px;border-radius:3px;background:${STAGE_COLOR["Collecting Data"]}"></i>Collecting data</div><div class="v">${fmtN(count("Collecting Data"))}</div><div class="d">with the data collection owner</div></div>
      <div class="kpi"><div class="k"><i style="width:10px;height:10px;border-radius:3px;background:${STAGE_COLOR["Data Review"]}"></i>In data review</div><div class="v">${fmtN(count("Data Review"))}</div><div class="d">with the reviewer</div></div>
      <div class="kpi"><div class="k"><i style="width:10px;height:10px;border-radius:3px;background:${STAGE_COLOR.Completed}"></i>Completed</div><div class="v">${fmtN(count("Completed"))}</div><div class="d">${fmtPct(all.length ? count("Completed") / all.length : 0)} of scope</div></div>
      <a class="kpi ${noOwner ? "tone-warn" : ""}" href="#/collection?missing=owner" style="text-decoration:none;color:inherit"><div class="k">${icon("workload")}Open, no named owner</div><div class="v">${fmtN(noOwner)}</div><div class="d">assigned to a group or role</div></a>
      <a class="kpi ${noRev ? "tone-warn" : ""}" href="#/collection?missing=reviewer" style="text-decoration:none;color:inherit"><div class="k">${icon("edit")}Open, no reviewer</div><div class="v">${fmtN(noRev)}</div><div class="d">to fill in the app</div></a>
    </div>
    <div class="grid g-12" style="margin-top:18px">
      <section class="card span-12 reveal">
        <div class="card-h"><div><h3>Data collection progress by planned month</h3><p>Annexes of the PQRs planned each month, by data collection stage. Cap = annexes completed.</p></div></div>
        ${stackedColumns(months, m.collection.stages.map((st) => ({ key: st, label: st === "Collecting Data" ? "Collecting data" : st === "Data Review" ? "In data review" : st, color: STAGE_COLOR[st] })), { height: 300, width: 1100, capLabel: (g, total) => fmtPct((g.counts.Completed || 0) / total) })}
      </section>
      <section class="card span-6 reveal">
        <div class="card-h"><div><h3>Workload by data collection owner</h3><p>Raised annexes per owner. Groups and roles mean no person is named yet.</p></div></div>
        <div class="legend"><span><i style="background:${STAGE_COLOR["Collecting Data"]}"></i>Collecting</span><span><i style="background:${STAGE_COLOR["Data Review"]}"></i>In review</span><span><i style="background:${STAGE_COLOR.Completed}"></i>Completed</span></div>
        ${owners.length ? hbars(rowsFor(owners, "owner"), { labelWidth: 170, valueLabel: (r) => `${r.segments[0].value + r.segments[1].value}<small> open</small>` }) : '<p class="muted">No annexes in scope.</p>'}
      </section>
      <section class="card span-6 reveal">
        <div class="card-h"><div><h3>Workload by data reviewer</h3><p>Raised annexes per reviewer. Fill in missing reviewers in the list below.</p></div></div>
        <div class="legend"><span><i style="background:${STAGE_COLOR["Collecting Data"]}"></i>Collecting</span><span><i style="background:${STAGE_COLOR["Data Review"]}"></i>In review</span><span><i style="background:${STAGE_COLOR.Completed}"></i>Completed</span></div>
        ${reviewers.length ? hbars(rowsFor(reviewers, "reviewer"), { labelWidth: 170, valueLabel: (r) => `${r.segments[0].value + r.segments[1].value}<small> open</small>` }) : '<p class="muted">No annexes in scope.</p>'}
      </section>
      <section class="card span-12 table-card reveal">
        <div style="padding:16px 16px 0">
          <div class="toolbar">
            <label class="field search-f">${icon("search")}<input data-cv="q" type="search" placeholder="Filter products, annexes, people…" value="${esc(cv.q)}" aria-label="Filter annexes"></label>
            <label class="field"><select data-cv="stage" aria-label="Stage">${opt("open", "Open (collecting or in review)", cv.stage)}${opt("Collecting Data", "Collecting data", cv.stage)}${opt("Data Review", "In data review", cv.stage)}${opt("Completed", "Completed", cv.stage)}${opt("", "All raised annexes", cv.stage)}</select></label>
            <label class="field">${icon("filter")}<select data-cv="missing" aria-label="Missing person">${opt("", "Any assignment", cv.missing)}${opt("owner", "No named owner", cv.missing)}${opt("reviewer", "No reviewer", cv.missing)}${opt("any", "Owner or reviewer missing", cv.missing)}</select></label>
            <span class="grow"></span>
            <button class="btn btn-sm" data-cv-export>${icon("download")}CSV</button>
          </div>
          <div class="toolbar" data-cv-bulk style="background:var(--surface-2);border:1px solid var(--line);border-radius:12px;padding:8px">
            <b style="font-size:12.5px" data-cv-selcount>${cv.sel.size} selected</b>
            <button class="btn btn-sm btn-ghost" data-cv-selall>Select all shown</button>
            <button class="btn btn-sm btn-ghost" data-cv-selnone>Clear</button>
            <span class="grow"></span>
            <label class="field">Owner<input id="cv-owner" list="dl-people" placeholder="Name" style="width:150px"></label>
            <button class="btn btn-sm" data-cv-apply="collector">Set owner</button>
            <label class="field">Reviewer<input id="cv-reviewer" list="dl-people" placeholder="Name" style="width:150px"></label>
            <button class="btn btn-sm" data-cv-apply="reviewer">Set reviewer</button>
            <button class="btn btn-sm btn-ghost" data-cv-apqr-owner title="Use each product's APQR owner as the data reviewer">Reviewer = APQR owner</button>
          </div>
        </div>
        <div data-region="list">${this.list(m)}</div>
      </section>
    </div>
    <datalist id="dl-people">${m.people.map((u) => `<option value="${esc(u)}">`).join("")}</datalist>`;
  },
  list(m) {
    const rows = listRows(m);
    const pages = Math.max(1, Math.ceil(rows.length / PAGE));
    cv.page = Math.min(cv.page, pages - 1);
    const view = rows.slice(cv.page * PAGE, cv.page * PAGE + PAGE);
    const stageOf = m.collection.stageOf;
    return `<div class="table-wrap" style="max-height:640px"><table class="data"><thead><tr><th style="width:34px"></th><th>Product</th><th>Annexe</th><th>Planned</th><th>Stage</th><th>Data collection owner</th><th>Data reviewer</th><th>PQR due</th></tr></thead><tbody>
      ${view.map((t) => `<tr data-coll-row="${esc(t.id)}">
        <td><input type="checkbox" data-cv-sel="${esc(t.id)}" ${cv.sel.has(t.id) ? "checked" : ""} aria-label="Select"></td>
        <td class="prod"><b title="${esc(t.product)}" style="max-width:260px;cursor:pointer" data-open-product="${esc(t.key)}">${esc(t.product)}</b><small><span class="mono">${esc(t.ref)}</span>${t.shared ? '<span class="tag" title="Shared QA Data Collection stream">QA STREAM</span>' : ""}${t.appChanged ? '<span class="tag new">IN APP</span>' : ""}</small></td>
        <td style="white-space:nowrap"><span style="display:inline-flex;align-items:center;gap:6px"><i style="width:8px;height:8px;border-radius:50%;background:${deptColor(t.dept)}"></i>${esc(SLOTS.find((s) => s.key === t.slot)?.label || t.slot)}</span></td>
        <td style="white-space:nowrap">${monthLabel(t.plannedMonth) || "–"}</td>
        <td style="white-space:nowrap"><span class="pill" style="background:color-mix(in srgb, ${STAGE_COLOR[stageOf(t)]} 18%, var(--surface));color:var(--ink)">${esc(stageOf(t) === "Data Review" ? "In review" : stageOf(t) === "Collecting Data" ? "Collecting" : stageOf(t))}</span></td>
        <td><div style="display:grid;gap:3px"><input class="inline" data-cv-person="collector|${esc(t.id)}" list="dl-people" value="${t.collectorPerson ? esc(t.collector) : ""}" placeholder="Name a person" aria-label="Data collection owner" style="max-width:190px">${t.collectorPerson ? "" : `<small class="muted">${personTag(t.collector, t.collectorType)}</small>`}</div></td>
        <td><input class="inline" data-cv-person="reviewer|${esc(t.id)}" list="dl-people" value="${esc(t.reviewer)}" placeholder="not set" aria-label="Data reviewer" style="max-width:190px;${t.reviewer ? "" : "box-shadow:inset 0 0 0 1px var(--warn)"}"></td>
        <td style="white-space:nowrap">${fmtDate(t.due)}${t.overdue === "YES" ? ' <span class="tag crit">LATE</span>' : ""}</td>
      </tr>`).join("") || '<tr><td colspan="8" class="empty-row">No annexes match.</td></tr>'}
    </tbody></table></div>
    <div class="table-foot"><span><b>${fmtN(rows.length)}</b> annexes${rows.length > PAGE ? ` · page ${cv.page + 1} of ${pages}` : ""}</span><span class="grow"></span>${rows.length > PAGE ? `<button class="btn btn-sm" data-cv-page="-1" ${cv.page === 0 ? "disabled" : ""}>Previous</button><button class="btn btn-sm" data-cv-page="1" ${cv.page >= pages - 1 ? "disabled" : ""}>Next</button>` : ""}</div>`;
  },
  bind(root, rerender) {
    const region = () => { root.querySelector('[data-region="list"]').innerHTML = this.list(store.getModel()); updateSel(); };
    const updateSel = () => { const el = root.querySelector("[data-cv-selcount]"); if (el) el.textContent = `${cv.sel.size} selected`; };
    root.querySelectorAll("[data-cv-scope]").forEach((b) => b.addEventListener("click", () => { cv.scope = b.dataset.cvScope; cv.page = 0; rerender(); }));
    root.querySelectorAll("select[data-cv]").forEach((s) => s.addEventListener("change", () => { cv[s.dataset.cv] = s.value; cv.page = 0; if (s.dataset.cv === "dept" || s.dataset.cv === "month") rerender(); else region(); }));
    root.querySelector('[data-cv="q"]').addEventListener("input", debounce((e) => { cv.q = e.target.value; cv.page = 0; region(); }, 140));
    root.addEventListener("change", (e) => {
      const sel = e.target.closest("[data-cv-sel]");
      if (sel) { if (sel.checked) cv.sel.add(sel.dataset.cvSel); else cv.sel.delete(sel.dataset.cvSel); updateSel(); return; }
      const per = e.target.closest("[data-cv-person]");
      if (per) { const [field, id] = per.dataset.cvPerson.split("|"); act.setTaskPerson([id], field, per.value, "user"); }
    });
    root.addEventListener("click", (e) => {
      if (e.target.closest("[data-cv-selall]")) { for (const t of listRows(store.getModel())) cv.sel.add(t.id); region(); return; }
      if (e.target.closest("[data-cv-selnone]")) { cv.sel.clear(); region(); return; }
      const pg = e.target.closest("[data-cv-page]");
      if (pg) { cv.page += +pg.dataset.cvPage; region(); return; }
      const ap = e.target.closest("[data-cv-apply]");
      if (ap) {
        const field = ap.dataset.cvApply;
        const name = root.querySelector(field === "collector" ? "#cv-owner" : "#cv-reviewer").value.trim();
        if (!cv.sel.size) return import("./ui.js").then(({ toast }) => toast("Select annexes in the list first.", { kind: "error" }));
        if (!name) return import("./ui.js").then(({ toast }) => toast("Type a name first.", { kind: "error" }));
        act.setTaskPerson([...cv.sel], field, name, "user");
        cv.sel.clear();
        return;
      }
      if (e.target.closest("[data-cv-apqr-owner]")) {
        const m = store.getModel();
        const ids = cv.sel.size ? [...cv.sel] : listRows(m).filter((t) => !t.reviewerPerson).map((t) => t.id);
        const byOwner = new Map();
        for (const id of ids) { const t = m.realTasks.find((x) => x.id === id); const p = t && m.productByKey.get(t.key); if (p && p.owner && p.owner !== "Unassigned") { if (!byOwner.has(p.owner)) byOwner.set(p.owner, []); byOwner.get(p.owner).push(id); } }
        for (const [owner, list] of byOwner) act.setTaskPerson(list, "reviewer", owner, "user");
        cv.sel.clear();
        return;
      }
      const pr = e.target.closest("[data-coll-person]");
      if (pr) { const [kind, name] = pr.dataset.collPerson.split("|"); cv.q = name; cv.missing = !name ? "reviewer" : ""; cv.stage = "open"; region(); root.querySelector('[data-cv="q"]').value = name; root.querySelector('[data-region="list"]').scrollIntoView({ behavior: "smooth", block: "start" }); void kind; }
    });
    root.querySelector("[data-cv-export]").addEventListener("click", () => {
      const m = store.getModel();
      download(csv([["Reference ID", "Product", "Annexe", "Department", "Planned PQR month", "Stage", "Data collection owner", "Owner type", "Data reviewer", "PQR due", "Overdue?"], ...listRows(m).map((t) => [t.ref, t.product, t.slot, t.dept, monthLabel(t.plannedMonth), m.collection.stageOf(t), t.collector, t.collectorType, t.reviewer, t.due, t.overdue])]), "APQR_data_collection.csv");
    });
  },
};
