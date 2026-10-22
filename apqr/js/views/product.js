// Product dossier: everything about one product's APQR, editable in place.

import { el, icon, fmtDate, fmtMonth, fmtPct, relativeTime, fmtDateTime } from "../dom.js";
import { splitName, annexNumber, monthStart, monthEnd, dayNumber, shortProduct, todayIso, ROUTES } from "../model.js";
import { PHASES, DEPARTMENTS, REQUIREMENTS, REQUIREMENT_STATES, COMMITTEE, REPORT_SECTIONS, CAPABILITY_GUIDE } from "../sop.js";
import { evaluateStudy } from "../stats.js";
import { ringSvg } from "../charts.js";
import { cardHead, select, seg, ragChip, planChip, taskStateIcon, progress, toast } from "../ui.js";
import { productForm } from "./plan.js";

const DEPT_COLOR = { QA: "var(--s1)", QC: "var(--s2)", Production: "var(--s3)", RA: "var(--s4)", Validation: "var(--s5)" };

export function title(ctx) {
  const p = ctx.d.productById.get(ctx.route.param);
  return p ? shortProduct(p.name) : "Product not found";
}

export function crumbs(ctx) {
  return [el("a", { href: "#/plan" }, "Annual plan"), icon("chevronRight", "sm"), el("span", {}, ctx.d.productById.get(ctx.route.param)?.apqrNo || ctx.route.param)];
}

export function render(ctx) {
  const p = ctx.d.productById.get(ctx.route.param);
  if (!p) {
    return el("div", { class: "view" }, el("div", { class: "card" }, el("div", { class: "empty" }, icon("search"),
      el("h3", {}, "This product is not in the plan"), el("p", {}, el("a", { href: "#/plan" }, "Back to the annual plan")))));
  }
  const u = (ctx.ui.product ??= { tab: "summary", lastQuery: null });
  const qs = `${p.id}?${ctx.route.query}`;
  if (qs !== u.lastQuery) {
    u.lastQuery = qs;
    u.tab = ctx.route.query.get("tab") || "summary";
  }
  const tasks = (ctx.d.tasksByProduct.get(p.id) || []);
  const studies = p.studies.map((s) => ({ ...s, ev: evaluateStudy(s) }));
  const tabs = [
    ["summary", "Summary", null],
    ["data", "Data collection", tasks.filter((t) => !t.cancelled).length],
    ["requirements", "SOP requirements", `${p.reqProgress.done}/${p.reqProgress.applicable}`],
    ["statistics", "Statistics", studies.length],
    ["capa", "CAPA & approval", `${p.committeeProgress.approved}/${p.committeeProgress.total}`],
    ["report", "Report outline", null],
    ["history", "History", null],
  ];
  const setTab = (t) => { u.tab = t; ctx.refresh(); };
  const body = {
    summary: () => summaryTab(ctx, p),
    data: () => dataTab(ctx, p, tasks),
    requirements: () => requirementsTab(ctx, p),
    statistics: () => statisticsTab(ctx, p, studies),
    capa: () => capaTab(ctx, p, studies),
    report: () => reportTab(ctx, p, studies),
    history: () => historyTab(ctx, p, tasks),
  }[u.tab] || (() => summaryTab(ctx, p));

  return el("div", { class: "view" },
    el("div", { class: "print-head" }, el("span", {}, `APQR status report · ${p.apqrNo || p.id} · printed ${fmtDate(todayIso())}`),
      el("span", {}, "Tracking copy, not a controlled document. The official record is in Scigeniq.")),
    header(ctx, p),
    el("section", { class: "card no-print" }, stepper(p)),
    el("div", { class: "tabs", role: "tablist" }, tabs.map(([id, label, count]) =>
      el("button", { type: "button", role: "tab", "aria-selected": String(u.tab === id), onclick: () => setTab(id) }, label,
        count !== null && count !== undefined ? el("span", { class: "count" }, count) : null))),
    body(),
  );
}

// ---------- header ----------

function header(ctx, p) {
  const { brand, rest } = splitName(p.name);
  const ringValue = p.total ? p.pct : p.reqProgress.pct;
  return el("section", { class: "dossier-head" },
    el("div", { style: { minWidth: 0 } },
      el("div", { class: "eyebrow" },
        p.apqrNo ? el("span", { class: "apqr-no" }, p.apqrNo,
          el("button", { class: "btn ghost sm icon-only no-print", type: "button", style: { color: "#fff", padding: "2px" }, "aria-label": "Copy APQR number",
            onclick: () => navigator.clipboard?.writeText(p.apqrNo).then(() => toast("APQR number copied")) }, icon("copy", "sm"))) : el("span", { class: "apqr-no" }, p.id),
        el("span", { class: "chip" }, p.form), el("span", { class: "chip" }, p.site),
        el("span", { class: "chip" }, p.route === "QMex" ? "QMex route" : "Scigeniq"),
        planChip(p.planStatus), p.triggered ? ragChip(p.rag) : null),
      el("h1", {}, brand),
      el("div", { class: "rest" }, rest),
      el("div", { class: "dossier-facts" },
        fact("Review period", p.periodStart ? `${fmtMonth(p.periodStart)} – ${fmtMonth(p.periodEnd)}` : "—", p.periodMonths ? `${p.periodMonths} months` : ""),
        fact("Planned report", fmtMonth(p.plannedMonth, { long: true }) || "—", p.prevReport ? `Previous ${p.prevReport}` : ""),
        fact("Report due", p.reportDue ? fmtDate(p.reportDue) : "—", p.closed ? `Closed ${fmtDate(p.closedOn)}` : p.daysToReportDue !== null ? (p.daysToReportDue < 0 ? `${-p.daysToReportDue} day${p.daysToReportDue === -1 ? "" : "s"} late` : `in ${p.daysToReportDue} day${p.daysToReportDue === 1 ? "" : "s"}`) : ""),
        fact("Workflow", p.triggered ? p.primaryRef : "Not triggered", p.triggered ? `${p.stage} · ${p.owner || "no owner"}` : p.scigeniqNo ? `Scigeniq plan #${p.scigeniqNo}` : "Not in Scigeniq plan")),
      el("div", { class: "no-print", style: { display: "flex", gap: "8px", marginTop: "16px", flexWrap: "wrap" } },
        el("button", { class: "btn sm", type: "button", onclick: () => editDetails(ctx, p) }, icon("edit", "sm"), "Edit details"),
        el("button", { class: "btn sm", type: "button", onclick: () => ctx.go(`tasks?product=${encodeURIComponent(p.id)}`) }, icon("tasks", "sm"), "Tasks"),
        el("button", { class: "btn sm", type: "button", onclick: () => { ctx.ui.product.tab = "report"; ctx.refresh(); setTimeout(() => window.print(), 250); } }, icon("print", "sm"), "Print status report"),
        el("button", { class: "btn sm danger", type: "button", onclick: () => deleteProduct(ctx, p) }, icon("trash", "sm"), "Delete"))),
    el("div", { html: ringSvg(ringValue, fmtPct(ringValue), p.total ? "tasks done" : "requirements") }),
  );
}

function fact(label, value, sub) {
  return el("div", { class: "fact" }, el("div", { class: "l" }, label), el("div", { class: "v" }, value), sub ? el("div", { class: "s" }, sub) : null);
}

function stepper(p) {
  return el("ol", { class: "stepper", style: { listStyle: "none", margin: 0 } }, PHASES.map((ph, i) => {
    const state = i < p.phaseIndex || (p.closed && i === p.phaseIndex) ? "done" : i === p.phaseIndex ? "current" : "";
    return el("li", { class: `step ${state}`, "data-tip": `${ph.label}\n${ph.sop}` },
      el("span", { class: "step-dot" }, state === "done" ? icon("check", "sm") : String(i + 1)),
      el("span", { class: "step-label" }, ph.label),
      el("span", { class: "step-sop" }, ph.sop.split(" · ")[0]));
  }));
}

// ---------- summary ----------

function summaryTab(ctx, p) {
  const update = (patch, label) => ctx.store.updateProduct(p.id, patch, label);
  return el("div", { class: "grid g-12" },
    el("section", { class: "card span-12" }, cardHead("Milestones", "Review period and SOP time limits (SOPQA0021E AE02/08 and §10.3.6)"),
      el("div", { class: "card-body" }, timeline(ctx, p))),
    el("section", { class: "card span-7" }, cardHead("Review management", "Owner, batches and status for this APQR"),
      el("div", { class: "card-body" }, el("div", { class: "form-grid" },
        el("div", { class: "field" }, el("label", { for: "pd-owner" }, "APQR owner"),
          el("input", { id: "pd-owner", class: "input", list: "pd-users", value: p.owner, placeholder: "From the Scigeniq workflow", onchange: (e) => update({ owner: e.target.value.trim() }, "Set APQR owner") }),
          el("datalist", { id: "pd-users" }, ctx.users.map((n) => el("option", { value: n })))),
        el("div", { class: "field" }, el("label", { for: "pd-batches" }, "Batches in the review period"),
          el("input", { id: "pd-batches", class: "input", type: "number", min: "0", value: p.batches ?? "", placeholder: "From batch selection",
            onchange: (e) => update({ batches: e.target.value === "" ? null : Number(e.target.value) }, "Set batch count") }),
          el("span", { class: "hint" }, "Under 20: extend back up to 6 months or defer statistics (§10.3.5)")),
        el("div", { class: "field" }, el("label", {}, "Lifecycle phase"),
          select([["", `Automatic · ${PHASES[p.phaseIndex]?.label}`], ...PHASES.map((ph) => [ph.id, ph.label])], ctx.state.products.find((x) => x.id === p.id).phase, (v) => update({ phase: v }, "Set phase"), { label: "Lifecycle phase" }),
          el("span", { class: "hint" }, "Automatic follows the workflow, statistics, CAPA and committee status")),
        el("div", { class: "field" }, el("label", {}, "Route"),
          select(ROUTES, p.route, (v) => update({ route: v }, "Set route"), { label: "Route" }),
          el("span", { class: "hint" }, "Scigeniq workflow or a legacy QMex report")),
        el("div", { class: "field full" }, el("label", { for: "pd-comments" }, "QA comments / actions"),
          el("textarea", { id: "pd-comments", class: "textarea", placeholder: "Follow-ups, escalations, agreements…", onchange: (e) => update({ comments: e.target.value }, "Edit QA comment") }, p.comments || ""))))),
    el("div", { class: "span-5", style: { display: "flex", flexDirection: "column", gap: "20px" } },
      el("section", { class: "card" }, cardHead("Progress", null),
        el("div", { class: "card-body", style: { display: "flex", flexDirection: "column", gap: "12px" } },
          row("Scigeniq tasks", p.total ? progress(p.pct) : el("span", { class: "faint" }, "No tasks")),
          row("SOP requirements", progress(p.reqProgress.pct, "var(--o4)")),
          row("Committee approvals", progress(p.committeeProgress.approved / p.committeeProgress.total, "var(--good)")),
          p.triggered ? row("Overdue tasks", el("strong", { style: { color: p.overdue ? "var(--critical-ink)" : "inherit" } }, p.overdue)) : null,
          p.bottleneck ? row("Bottleneck", el("span", { class: "tag" }, p.bottleneck)) : null)),
      el("section", { class: "card" }, cardHead("Checks", p.flags.length ? `${p.flags.length} to review` : "Nothing to review"),
        el("div", { class: "card-body", style: { display: "flex", flexDirection: "column", gap: "8px" } },
          p.flags.length ? p.flags.map((f) => el("div", { class: `callout ${f.kind === "duplicate" || f.kind === "period" ? "warning" : "info"}` }, icon(f.kind === "duplicate" ? "copy" : "info"), el("span", {}, f.text),
            f.kind === "duplicate" ? el("button", { class: "btn sm", type: "button", style: { marginLeft: "auto" }, onclick: () => cancelSuperseded(ctx, p) }, "Resolve") : null))
            : el("div", { class: "callout good" }, icon("checkCircle"), "Plan data is consistent for this product.")))));
}

function row(label, value) {
  return el("div", { style: { display: "grid", gridTemplateColumns: "150px minmax(0,1fr)", alignItems: "center", gap: "10px" } }, el("span", { class: "muted", style: { fontSize: "12.5px" } }, label), value);
}

function timeline(ctx, p) {
  const ms = [];
  if (p.periodStart) ms.push(["Period start", monthStart(p.periodStart)]);
  if (p.periodEnd) ms.push(["Period end", monthEnd(p.periodEnd)]);
  if (p.plannedMonth) {
    ms.push(["Planned month", monthStart(p.plannedMonth)]);
    ms.push(["Annex data due", p.annexDue]);
    ms.push(["Final report due", p.finalDue]);
  }
  if (p.reportDue) ms.push(["Report due (§10.3.6)", p.reportDue]);
  if (p.closedOn) ms.push(["Closed", p.closedOn]);
  ms.push([ctx.state.settings.asOfMode === "today" ? "Today" : "Status date", ctx.asOf, "now"]);
  const days = ms.map((m) => dayNumber(m[1])).filter((d) => d !== null);
  if (days.length < 2) return el("p", { class: "muted" }, "Add a review period and planned month to see milestones.");
  const lo = Math.min(...days) - 12;
  const hi = Math.max(...days) + 12;
  const pos = (iso) => ((dayNumber(iso) - lo) / (hi - lo)) * 100;
  // Four label lanes (near/far, above/below the bar). Each label takes the first
  // lane where it clears the previous label by LABEL_SPAN percent.
  const LABEL_SPAN = 13;
  const laneEnd = [-100, -100, -100, -100];
  const marks = ms.map(([label, date, kind]) => ({ label, date, kind, x: pos(date) })).sort((a, b) => a.x - b.x).map((m) => {
    let lane = laneEnd.findIndex((end) => m.x - end >= LABEL_SPAN);
    if (lane < 0) lane = laneEnd.indexOf(Math.min(...laneEnd));
    laneEnd[lane] = m.x;
    return { ...m, lane };
  });
  const BAR = 74; // px from the top of the timeline to the bar
  const laneTop = [BAR - 44, BAR + 18, BAR - 80, BAR + 54];
  return el("div", { class: "milestones" }, el("div", { class: "timeline", style: { height: "170px" } },
    el("div", { class: "bar", style: { top: `${BAR}px` } }),
    p.periodStart && p.periodEnd ? el("div", { class: "period", style: { top: `${BAR}px`, left: `${pos(monthStart(p.periodStart))}%`, width: `${pos(monthEnd(p.periodEnd)) - pos(monthStart(p.periodStart))}%` }, "data-tip": `Review period\n${fmtMonth(p.periodStart)} – ${fmtMonth(p.periodEnd)}` }) : null,
    marks.map((m) => {
      const above = m.lane === 0 || m.lane === 2;
      const top = laneTop[m.lane];
      const align = m.x > 86 ? "right" : m.x < 14 ? "left" : "center";
      const shift = align === "right" ? "-100%" : align === "left" ? "0" : "-50%";
      const stemTop = above ? top + 34 : BAR + 10;
      const stemH = above ? BAR - stemTop : top - stemTop;
      return [
        el("span", { class: `ms-stem ${m.kind === "now" ? "now" : ""}`, style: { left: `${m.x}%`, top: `${stemTop}px`, height: `${Math.max(0, stemH)}px` } }),
        el("span", { class: `ms-dot ${m.kind === "now" ? "now" : ""}`, style: { left: `${m.x}%`, top: `${BAR - 2}px` } }),
        el("div", { class: `ms-label ${m.kind === "now" ? "now" : ""}`, style: { left: `${m.x}%`, top: `${top}px`, transform: `translateX(${shift})`, textAlign: align } },
          el("span", { class: "ml" }, m.label), el("span", { class: "md" }, fmtDate(m.date))),
      ];
    })));
}

// ---------- data collection ----------

function dataTab(ctx, p, tasks) {
  const active = tasks.filter((t) => !t.cancelled);
  const cancelled = tasks.filter((t) => t.cancelled);
  const wf = active.filter((t) => t.type === "APQR");
  return el("div", { style: { display: "flex", flexDirection: "column", gap: "20px" } },
    p.duplicate ? el("div", { class: "callout warning" }, icon("copy"),
      el("span", {}, el("strong", {}, `${p.refs.length} APQR workflows exist for this product. `), `The most recent (${p.primaryRef}) is kept as primary; the others usually sit in Batches Selection and inflate the overdue count.`),
      el("button", { class: "btn sm", type: "button", style: { marginLeft: "auto" }, onclick: () => cancelSuperseded(ctx, p) }, "Cancel superseded")) : null,
    wf.length ? el("section", { class: "card" }, cardHead("APQR workflow", "The parent workflow task assigned to the APQR owner"),
      el("div", { class: "card-body", style: { display: "flex", flexDirection: "column", gap: "6px" } }, wf.map((t) => taskLine(ctx, t, true)))) : null,
    el("div", { class: "section-head" }, el("h2", {}, "Departmental data collection"),
      el("p", {}, "Phase 4: each department submits its annex; the department head reviews it."),
      el("button", { class: "btn sm primary", type: "button", style: { marginLeft: "auto" }, onclick: () => ctx.newTask(p.id) }, icon("plus", "sm"), "Add task")),
    el("div", { class: "dept-cards" }, DEPARTMENTS.map((dep) => {
      const rows = active.filter((t) => t.dept === dep.id && t.type !== "APQR");
      const done = rows.filter((t) => t.done).length;
      return el("section", { class: "dept-card" },
        el("div", { class: "dept-card-head" }, el("span", { class: "sw", style: { background: DEPT_COLOR[dep.id] } }), el("h3", {}, dep.label),
          el("span", { class: "annex", "data-tip": `${dep.annex} · ${dep.template}` }, annexNumber(p, dep.annexCode) || dep.annex)),
        rows.length ? progress(done / rows.length, DEPT_COLOR[dep.id]) : null,
        rows.length ? rows.map((t) => taskLine(ctx, t)) : el("p", { class: "muted", style: { fontSize: "12.5px" } }, p.triggered ? "No task for this department." : "Created when the review is triggered."));
    })),
    cancelled.length ? el("details", { class: "card card-pad" }, el("summary", { style: { cursor: "pointer", fontWeight: 650 } }, `${cancelled.length} cancelled tasks`),
      el("div", { style: { display: "flex", flexDirection: "column", gap: "6px", marginTop: "12px" } }, cancelled.map((t) => taskLine(ctx, t)))) : null,
  );
}

function taskLine(ctx, t, showDept = false) {
  return el("button", { class: "task-line", type: "button", onclick: () => ctx.openTask(t.id) },
    taskStateIcon(t),
    el("span", { style: { minWidth: 0 } }, el("div", { class: "t" }, t.title), el("div", { class: "m" }, `${t.user} · ${t.stage}${showDept ? ` · ${t.ref}` : ""}`)),
    el("span", { class: "m nowrap", style: t.overdue ? { color: "var(--critical-ink)", fontWeight: 700 } : null },
      t.done ? `Closed ${fmtDate(t.closedOn, { year: false })}` : t.due ? `Due ${fmtDate(t.due, { year: false })}` : ""));
}

function cancelSuperseded(ctx, p) {
  const superseded = p.refs.filter((r) => r !== p.primaryRef);
  const ids = ctx.state.tasks.filter((t) => t.productId === p.id && superseded.includes(t.ref) && t.status !== "Completed" && t.status !== "Cancelled").map((t) => t.id);
  ctx.confirm({
    title: "Cancel superseded workflows?",
    message: `${ids.length} open tasks under ${superseded.join(", ")} will be marked Cancelled and dropped from the counts. ${p.primaryRef} stays as the primary workflow. Cancel the same workflows in Scigeniq too.`,
    confirmLabel: `Cancel ${ids.length} tasks`,
  }).then((ok) => {
    if (!ok) return;
    ctx.store.updateTasks(ids, { status: "Cancelled" }, `Cancel superseded workflows of ${shortProduct(p.name)}`);
    ctx.undoToast(`${ids.length} superseded tasks cancelled`);
  });
}

// ---------- SOP requirements ----------

function requirementsTab(ctx, p) {
  const src = ctx.state.products.find((x) => x.id === p.id);
  const setReq = (id, patch) => ctx.store.updateProduct(p.id, { requirements: { ...src.requirements, [id]: { ...(src.requirements[id] || {}), ...patch } } }, `Requirement ${id}`);
  return el("section", { class: "card" },
    cardHead("APQR content requirements", "SOPQA0021E §10.4.1 · what the report must cover and who supplies it",
      el("button", { class: "btn sm", type: "button", onclick: () => {
        const all = Object.fromEntries(REQUIREMENTS.map((r) => [r.id, { ...(src.requirements[r.id] || {}), status: "done" }]));
        ctx.store.updateProduct(p.id, { requirements: all }, "Mark all requirements complete");
        ctx.undoToast("All requirements marked complete");
      } }, icon("check", "sm"), "Mark all complete")),
    el("div", { class: "card-body", style: { paddingBottom: "4px" } }, progress(p.reqProgress.pct, "var(--good)")),
    el("div", { class: "req-list" }, REQUIREMENTS.map((r) => {
      const st = src.requirements[r.id] || {};
      return el("div", { class: `req ${st.status || ""}` },
        el("span", { class: "req-no" }, st.status === "done" ? icon("check", "sm") : r.id),
        el("div", { style: { minWidth: 0 } },
          el("div", { class: "req-title" }, r.title),
          el("div", { class: "req-text" }, r.text),
          el("div", { class: "req-meta" }, r.depts.map((d) => el("span", { class: "tag" }, d)), el("span", { class: "chip outline" }, r.annex)),
          el("input", { class: "input sm", value: st.note || "", placeholder: "Reference, conclusion or note…", "aria-label": `Note for requirement ${r.id}`,
            onchange: (e) => setReq(r.id, { note: e.target.value }) })),
        select(REQUIREMENT_STATES.map((s) => [s.id, s.label]), st.status || "", (v) => setReq(r.id, { status: v }), { label: `Status of requirement ${r.id}` }));
    })));
}

// ---------- statistics ----------

function statisticsTab(ctx, p, studies) {
  const src = ctx.state.products.find((x) => x.id === p.id);
  const lowBatches = Number.isFinite(p.batches) && p.batches < 20;
  return el("div", { style: { display: "flex", flexDirection: "column", gap: "20px" } },
    lowBatches ? el("div", { class: "callout warning" }, icon("alert"), `${p.batches} batches in the period. With fewer than 20, go back up to 6 months; if still not enough, leave the statistical evaluation for a later PQR (§10.3.5).`) : null,
    el("section", { class: "card" },
      cardHead("Statistical study", "Annex 6 · capability and control of critical IPC, yield and analytical results",
        el("label", { class: "check" }, el("input", { type: "checkbox", checked: src.statsDone, onchange: (e) => ctx.store.updateProduct(p.id, { statsDone: e.target.checked }, "Statistical evaluation status") }), "Evaluation complete"),
        el("button", { class: "btn sm primary", type: "button", onclick: () => ctx.go(`stats?product=${encodeURIComponent(p.id)}&study=new`) }, icon("plus", "sm"), "New study")),
      studies.length ? el("div", { class: "table-wrap", style: { marginTop: "14px" } }, el("table", { class: "table" },
        el("thead", {}, el("tr", {}, ["Attribute", "Stage", "n", "Cpk", "Ppk", "Control", "Interpretation"].map((h, i) => el("th", { class: i >= 2 && i <= 4 ? "num" : "" }, h)))),
        el("tbody", {}, studies.map((s) => el("tr", { class: "clickable", onclick: () => ctx.go(`stats?product=${encodeURIComponent(p.id)}&study=${encodeURIComponent(s.id)}`) },
          el("td", { class: "prod" }, s.attribute || "Untitled", el("span", { class: "sub" }, [s.unit, s.lsl !== "" && s.lsl !== undefined ? `LSL ${s.lsl}` : "", s.usl !== "" && s.usl !== undefined ? `USL ${s.usl}` : ""].filter(Boolean).join(" · "))),
          el("td", {}, s.stage || "—"),
          el("td", { class: "num" }, s.ev.n || "—"),
          el("td", { class: "num" }, s.ev.cpk !== null ? s.ev.cpk.toFixed(2) : "—"),
          el("td", { class: "num" }, s.ev.ppk !== null ? s.ev.ppk.toFixed(2) : "—"),
          el("td", {}, s.ev.inControl === null ? el("span", { class: "faint" }, "—") : s.ev.inControl ? el("span", { class: "chip good" }, icon("check"), "In control") : el("span", { class: "chip critical" }, icon("alert"), "Out of control")),
          el("td", {}, bandChip(s.ev.band))))))) :
        el("div", { class: "empty" }, icon("flask"), el("h3", {}, "No statistical studies yet"), el("p", {}, "Add the CQAs and CPPs to analyse: assay, dissolution, hardness, weight variation, yield…"))),
    guideCard());
}

export function bandChip(band) {
  if (!band) return el("span", { class: "faint" }, "No Cpk");
  const g = CAPABILITY_GUIDE.find((x) => x.band === band);
  const tone = { excellent: "good", acceptable: "warning", poor: "critical" }[band];
  return el("span", { class: `chip ${tone}` }, icon(band === "excellent" ? "checkCircle" : "alert"), `${g.label} · ${g.range}`);
}

function guideCard() {
  return el("section", { class: "card" }, cardHead("Interpretation guideline", "SOPQA0152E Phase 5"),
    el("div", { class: "card-body" }, el("div", { class: "grid g-3" }, CAPABILITY_GUIDE.map((g) =>
      el("div", { class: `cpk-badge ${g.band}`, style: { width: "100%" } }, el("span", { class: "l" }, g.label), el("span", { class: "v", style: { fontSize: "18px" } }, g.range),
        el("span", { style: { fontSize: "12.5px", marginTop: "6px" } }, g.meaning), el("strong", { style: { fontSize: "12.5px", marginTop: "4px" } }, g.action))))));
}

// ---------- CAPA & committee ----------

function capaTab(ctx, p, studies) {
  const src = ctx.state.products.find((x) => x.id === p.id);
  const setCapa = (patch, label) => ctx.store.updateProduct(p.id, { capa: { ...src.capa, ...patch } }, label);
  const setMember = (role, patch) => ctx.store.updateProduct(p.id, { committee: { ...src.committee, [role]: { ...(src.committee[role] || {}), ...patch } } }, `Committee: ${role}`);
  const mandatory = studies.filter((s) => s.ev.capaRequired);
  return el("div", { class: "grid g-12" },
    el("section", { class: "card span-6" }, cardHead("CAPA planning", "Phase 6 · APQR CAPA Plan Review form"),
      el("div", { class: "card-body", style: { display: "flex", flexDirection: "column", gap: "14px" } },
        mandatory.length ? el("div", { class: "callout critical" }, icon("alert"), el("span", {}, el("strong", {}, "CAPA is mandatory: "), `Cpk < 1.00 for ${mandatory.map((s) => s.attribute).join(", ")}.`)) : null,
        el("div", { class: "field" }, el("label", { for: "capa-prev" }, "Status of CAPAs from the previous APQR"),
          el("textarea", { id: "capa-prev", class: "textarea", placeholder: "e.g. CAPA-KE-0123 closed, effective…", onchange: (e) => setCapa({ previous: e.target.value }, "Previous CAPA status") }, src.capa.previous || "")),
        el("div", { class: "field" }, el("span", { class: "field-label" }, "Is a CAPA required for this APQR?"),
          seg([["Yes", "Yes"], ["No", "No"], ["", "Not decided"]], src.capa.required || "", (v) => setCapa({ required: v }, "CAPA decision"), "CAPA required")),
        el("div", { class: "field" }, el("label", { for: "capa-refs" }, "CAPA references"),
          el("input", { id: "capa-refs", class: "input mono", value: src.capa.refs || "", placeholder: "CAPA numbers raised", onchange: (e) => setCapa({ refs: e.target.value }, "CAPA references") })),
        el("div", { class: "field" }, el("label", { for: "capa-conc" }, "Conclusion"),
          el("textarea", { id: "capa-conc", class: "textarea", placeholder: "Final conclusion statement…", onchange: (e) => setCapa({ conclusion: e.target.value }, "CAPA conclusion") }, src.capa.conclusion || "")))),
    el("section", { class: "card span-6" }, cardHead("Recommendations & conclusion", "Report section 30 · reviewed against last year's recommendations (§10.8.6)"),
      el("div", { class: "card-body", style: { display: "flex", flexDirection: "column", gap: "14px" } },
        el("textarea", { class: "textarea", style: { minHeight: "220px" }, "aria-label": "Recommendations and conclusion", placeholder: "Are processes and product quality appropriate? Trends, recommendations, effectiveness of previous actions…",
          onchange: (e) => ctx.store.updateProduct(p.id, { conclusion: e.target.value }, "Edit conclusion") }, src.conclusion || ""))),
    el("section", { class: "card span-12" },
      cardHead("APQR committee final review", "Phase 7 · every member approves; any member can return the APQR to CAPA planning or data collection",
        p.closed ? el("button", { class: "btn sm", type: "button", onclick: () => {
          ctx.store.updateProduct(p.id, { closedOn: "", phase: "" }, "Reopen APQR");
          ctx.undoToast("APQR reopened");
        } }, icon("undo", "sm"), "Reopen") :
          el("button", { class: "btn sm primary", type: "button", onclick: () => closeApqr(ctx, p) }, icon("checkCircle", "sm"), "Close APQR")),
      el("div", { class: "card-body" },
        el("div", { class: "committee" }, COMMITTEE.map((role) => {
          const m = src.committee[role] || {};
          return el("div", { class: `member ${m.decision === "Approved" ? "approved" : m.decision === "Returned" ? "returned" : ""}` },
            el("div", { class: "member-role" }, m.decision === "Approved" ? el("span", { class: "state-icon done" }, icon("check")) : m.decision === "Returned" ? el("span", { class: "state-icon late" }, icon("undo")) : el("span", { class: "state-icon off" }, icon("user")), role),
            select([["", "Pending"], ["Approved", "Approved"], ["Returned", "Returned"]], m.decision || "", (v) => setMember(role, { decision: v, date: v ? (m.date || todayIso()) : "" }), { label: `${role} decision`, size: "sm" }),
            el("input", { class: "input sm", value: m.name || "", placeholder: "Name", "aria-label": `${role} name`, onchange: (e) => setMember(role, { name: e.target.value }) }),
            el("input", { class: "input sm", type: "date", value: m.date || "", "aria-label": `${role} date`, onchange: (e) => setMember(role, { date: e.target.value }) }),
            el("input", { class: "input sm", value: m.comment || "", placeholder: "Comment", "aria-label": `${role} comment`, onchange: (e) => setMember(role, { comment: e.target.value }) }));
        })),
        el("p", { class: "muted", style: { fontSize: "12px", marginTop: "12px" } },
          "This tracker records decisions for follow-up only. The legally binding digital signatures are applied in Scigeniq (21 CFR Part 11)."))));
}

function closeApqr(ctx, p) {
  const pending = COMMITTEE.length - p.committeeProgress.approved;
  ctx.confirm({
    title: "Close this APQR?",
    message: pending ? `${pending} committee members have not approved yet. Close it anyway with today's date?` : "All committee members approved. The APQR will be marked closed today.",
    confirmLabel: "Close APQR",
  }).then((ok) => {
    if (!ok) return;
    ctx.store.updateProduct(p.id, { closedOn: todayIso() }, "Close APQR");
    ctx.undoToast("APQR closed");
  });
}

// ---------- report outline ----------

function reportTab(ctx, p, studies) {
  const src = ctx.state.products.find((x) => x.id === p.id);
  const reqState = (id) => (id ? src.requirements[id]?.status || "" : "");
  const label = { "": "Not started", progress: "In progress", done: "Complete", na: "N/A" };
  const tone = { "": "", progress: "info", done: "good", na: "" };
  return el("div", { class: "grid g-12" },
    el("section", { class: "card span-7" },
      cardHead("APQR report outline", "Template QA0021E/TE01/11 · status from the SOP requirements"),
      el("div", { class: "table-wrap", style: { marginTop: "12px" } }, el("table", { class: "table" },
        el("thead", {}, el("tr", {}, el("th", { class: "num" }, "§"), el("th", {}, "Section"), el("th", {}, "Source"), el("th", {}, "Status"))),
        el("tbody", {}, REPORT_SECTIONS.map(([no, name, req]) => {
          const st = reqState(req);
          const r = REQUIREMENTS.find((x) => x.id === req);
          return el("tr", {},
            el("td", { class: "num muted" }, no),
            el("td", { style: { fontWeight: 600 } }, name),
            el("td", { class: "muted", style: { fontSize: "12px" } }, r ? `Req. ${r.id} · ${r.annex}` : "Report"),
            el("td", {}, r ? el("span", { class: `chip ${tone[st]}` }, label[st]) : el("span", { class: "faint" }, "—")));
        }))))),
    el("div", { class: "span-5", style: { display: "flex", flexDirection: "column", gap: "20px" } },
      el("section", { class: "card" }, cardHead("Numbering", "SOPQA0021E §10.6 and §10.8.1"),
        el("div", { class: "card-body" }, el("dl", { class: "kv" },
          el("dt", {}, "Report"), el("dd", { class: "mono" }, p.apqrNo || "Needs a product code and planned month"),
          ...DEPARTMENTS.flatMap((d) => [el("dt", {}, `${d.annex} · ${d.annexCode}`), el("dd", { class: "mono" }, annexNumber(p, d.annexCode) || "—")]),
          el("dt", {}, "Annex 6 · SR"), el("dd", { class: "mono" }, annexNumber(p, "SR") || "—"),
          el("dt", {}, "Previous report"), el("dd", { class: "mono" }, p.prevReport || "—")))),
      el("section", { class: "card" }, cardHead("Status summary", `Generated ${fmtDateTime(new Date().toISOString().slice(0, 16))}`),
        el("div", { class: "card-body" }, el("dl", { class: "kv" },
          el("dt", {}, "Product"), el("dd", {}, p.name),
          el("dt", {}, "Review period"), el("dd", {}, p.periodStart ? `${fmtMonth(p.periodStart)} – ${fmtMonth(p.periodEnd)}` : "—"),
          el("dt", {}, "Phase"), el("dd", {}, PHASES[p.phaseIndex]?.label),
          el("dt", {}, "Plan status"), el("dd", {}, p.planStatus),
          el("dt", {}, "Workflow"), el("dd", {}, p.triggered ? `${p.primaryRef} · ${p.completed}/${p.total} tasks` : "Not triggered"),
          el("dt", {}, "Batches"), el("dd", {}, p.batches ?? "—"),
          el("dt", {}, "Statistics"), el("dd", {}, studies.length ? studies.map((s) => `${s.attribute}: Cpk ${s.ev.cpk !== null ? s.ev.cpk.toFixed(2) : "—"}`).join("; ") : "None recorded"),
          el("dt", {}, "CAPA required"), el("dd", {}, src.capa.required || "Not decided"),
          el("dt", {}, "Committee"), el("dd", {}, `${p.committeeProgress.approved} of ${p.committeeProgress.total} approved`),
          el("dt", {}, "Conclusion"), el("dd", { style: { fontWeight: 400 } }, src.conclusion || src.capa.conclusion || "—")))),
      el("button", { class: "btn primary no-print", type: "button", onclick: () => window.print() }, icon("print", "sm"), "Print or save as PDF")));
}

// ---------- history ----------

function historyTab(ctx, p, tasks) {
  const ids = new Set(tasks.map((t) => t.id));
  const entries = ctx.state.log.filter((e) => (e.kind === "product" && e.id === p.id) || (e.kind === "task" && ids.has(e.id))).slice(0, 200);
  return el("section", { class: "card" }, cardHead("Change history", "Every edit to this product and its tasks, newest first"),
    entries.length ? el("div", { class: "log", style: { marginTop: "10px" } }, entries.map((e) => logItem(e))) :
      el("div", { class: "empty" }, icon("history"), el("h3", {}, "No changes yet"), el("p", {}, "Edits made here are recorded with your name and the time.")));
}

export function logItem(e) {
  return el("div", { class: "log-item" },
    el("span", { class: "avatar", style: { "--h": "230" } }, (e.by || "?").slice(0, 1).toUpperCase()),
    el("div", { style: { minWidth: 0 } },
      el("div", { class: "log-what" }, el("strong", {}, e.by), ` · ${e.action}`, e.label ? el("span", { class: "muted" }, ` · ${e.label}`) : null),
      e.changes?.length ? el("div", { class: "log-changes" }, e.changes.slice(0, 6).flatMap((c) => describeChange(c))) : null),
    el("span", { class: "log-time", title: e.ts }, relativeTime(e.ts)));
}

function describeChange(c) {
  const show = (v) => (v === "" || v === null || v === undefined ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v));
  if (c.from && c.to && typeof c.from === "object" && typeof c.to === "object") {
    const keys = [...new Set([...Object.keys(c.from), ...Object.keys(c.to)])].filter((k) => JSON.stringify(c.from[k]) !== JSON.stringify(c.to[k]));
    return keys.map((k) => el("div", {}, `${c.field}.${k}: `, el("del", {}, show(c.from[k])), " → ", el("ins", {}, show(c.to[k]))));
  }
  return [el("div", {}, `${c.field}: `, el("del", {}, show(c.from)), " → ", el("ins", {}, show(c.to)))];
}

// ---------- edit / delete ----------

function editDetails(ctx, p) {
  const src = ctx.state.products.find((x) => x.id === p.id);
  ctx.modal((close) => {
    const { draft, body, validate } = productForm(src, ctx.state.products);
    return {
      title: "Edit plan details",
      subtitle: src.name,
      body,
      foot: [
        el("button", { class: "btn", type: "button", onclick: () => close() }, "Cancel"),
        el("button", { class: "btn primary", type: "button", onclick: () => {
          const err = validate();
          if (err) { toast(err); return; }
          const keys = ["name", "code", "form", "plannedMonth", "prevReport", "periodStart", "periodEnd", "route", "site"];
          ctx.store.updateProduct(p.id, Object.fromEntries(keys.map((k) => [k, draft[k]])), "Edit plan details");
          close();
          ctx.undoToast("Plan details saved");
        } }, "Save"),
      ],
    };
  });
}

function deleteProduct(ctx, p) {
  const n = ctx.state.tasks.filter((t) => t.productId === p.id).length;
  ctx.confirm({
    title: "Delete this product?",
    message: `${p.name} will be removed from the plan${n ? ` together with its ${n} tasks` : ""}. You can undo this.`,
    confirmLabel: "Delete product", danger: true,
  }).then((ok) => {
    if (!ok) return;
    ctx.store.commit("Delete product", (s) => {
      s.products = s.products.filter((x) => x.id !== p.id);
      s.tasks = s.tasks.filter((t) => t.productId !== p.id);
      return [{ kind: "product", id: p.id, label: p.name, changes: [{ field: "deleted", from: "", to: "yes" }] }];
    });
    ctx.go("plan");
    ctx.undoToast("Product deleted");
  });
}
