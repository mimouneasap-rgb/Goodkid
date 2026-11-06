// APQR: the annual programme (approved plan, Scigeniq plan, product workflows and their tasks) and
// the report builder that fills the EU GMP Ch.1.10 sections from the app data, with process statistics.
import { h, card, kpi, viewHeader, select, segmented, dataTable, fmtDate, fmtNum, fmtPct, esc } from "./ui.js";
import { hbars, stacks, columns, gantt, lineChart, donut, funnel, ring, legend } from "./charts.js";
import { t, tv, getLang } from "./i18n.js";
import { icon } from "./icons.js";
import * as M from "./model.js";
import { APQR_SECTIONS, APQR_PHASES, APQR_STREAMS, CPK_GUIDE } from "./catalogs.js";
import { APQR_DEPTS, apqrUsers, capability } from "./domain.js";
import { recordCols } from "./views-overview.js";
import { apqrPage } from "./views-apqr-item.js";
import { openBulk } from "./bulk.js";

const DAY = 86400000;
const ALL = M.ALL;
const FR = () => getLang() === "FR";
const by = (list, f) => [...M.countBy(list, f)].sort((a, b) => b[1] - a[1]);
const isoDay = (ts) => (ts == null ? null : new Date(ts).toISOString().slice(0, 10));
export const RAG_COLOR = { Complete: "var(--good)", "On track": "var(--c1)", "Due soon": "var(--warning)", Overdue: "var(--critical)", "No tasks": "var(--muted-mark)" };
export const TRACK_COLOR = {
  Approved: "var(--good)", "Data collection complete": "var(--c3)", "In progress": "var(--c1)", "Not yet triggered": "var(--c7)",
  "Not triggered – due ≤60 d": "var(--warning)", "Not triggered – past due": "var(--critical)", "Not in Scigeniq plan": "var(--muted-mark)",
};
const TRACKS = Object.keys(TRACK_COLOR);
export const STATE_COLOR = { done: "var(--good)", open: "var(--c1)", overdue: "var(--critical)" };
export const dot = (color, label) => h("span.pill", { style: { "--dot": color ?? "var(--muted-mark)" } }, h("i"), label);
export const phaseName = (i) => APQR_PHASES[i]?.[FR() ? 2 : 1] ?? "—";
export const short = (s, n = 34) => (String(s).length > n ? String(s).slice(0, n - 1) + "…" : String(s));
/** "BRAND (Molecule) 160 mg F/C Tablets (30 TAB)" → "BRAND 160 mg" */
const chipLabel = (name) => {
  const brand = String(name).split("(")[0].trim();
  const strength = (String(name).replace(/^[^)]*\)/, "").match(/\d+(?:[.,]\d+)?(?:\/\d+(?:[.,]\d+)?)*\s*(?:mg\/ml|mg\/5ml|mg|g|%|ml|µg)/i) ?? [])[0];
  return short(strength ? `${brand} ${strength}` : brand, 24);
};
export const pctBar = (v, color = "var(--c1)") => h("span.pct-bar", h("i", { style: { width: `${Math.round((v ?? 0) * 100)}%`, background: color } }), fmtPct(v));

const TABS = [["programme", "apqr_tab_prog"], ["plan", "apqr_tab_plan"], ["workflows", "apqr_tab_wf"], ["tasks", "apqr_tab_tasks"], ["report", "apqr_tab_report"]];

export function apqrView(ctx) {
  const all = ctx.m.x.apqrProg;
  if (ctx.params.p) return apqrPage(ctx, all, ctx.params.p);
  // the annual plan is the home site's: other sites' products (validation tasks done here) show under "All sites"
  const scope = ctx.state.apqrSite ?? "home";
  const X = scoped(all, scope);
  const has = X.products.length > 0;
  const tab = TABS.some(([k]) => k === ctx.state.apqrTab) ? ctx.state.apqrTab : has ? "programme" : "report";
  const body = { programme, plan: planTab, workflows: workflowsTab, tasks: tasksTab, report: reportBuilder }[tab](ctx, X);
  const stale = X.asOf != null && ctx.m.now - X.asOf > 30 * DAY;
  const others = all.sites.filter((s) => !HOME_SITES.includes(s));
  return h("div.view",
    viewHeader(t("apqr_title"), t("apqr_sub2"), segmented(TABS.map(([k, l]) => [k, t(l)]), tab, (v) => ctx.set("apqrTab", v), t("apqr_title"))),
    tab !== "report" && others.length ? h("div.scope-bar", h("span", t("site_lbl")), segmented([["home", t("apqr_site_home")], ["all", t("apqr_site_all")], ...others.map((s) => [s, s])], scope, (v) => ctx.set("apqrSite", v), t("site_lbl"))) : null,
    !has && tab !== "report" ? h("div.banner.info", icon("upload", 18), h("span", t("apqr_empty"), " ", ctx.canEdit ? h("button.link", { type: "button", onclick: () => ctx.openImport() }, t("update_data")) : null)) : null,
    has && stale && tab !== "report" ? h("div.banner.warn", icon("alert", 18), t("apqr_stale", fmtDate(X.asOf), fmtNum(Math.round((ctx.m.now - X.asOf) / DAY)))) : null,
    body);
}
const HOME_SITES = ["ELKENDI", "ELKENDI Oncology"];
function scoped(X, scope) {
  if (scope === "all") return X;
  const keep = (p) => (scope === "home" ? p.inPlan || p.inSys || !p.site || HOME_SITES.includes(p.site) : p.site === scope);
  const products = X.products.filter(keep);
  const keys = new Set(products.map((p) => p.key));
  const tasks = X.tasks.filter((t) => keys.has(t.key));
  return { ...X, products, tasks, dupTasks: X.dupTasks.filter((t) => keys.has(t.key)), users: apqrUsers(tasks), streams: X.streams.filter((st) => tasks.some((t) => t.stream === st)) };
}

// ---------- programme dashboard ----------
function programme(ctx, X) {
  const { m } = ctx;
  const P = X.products, T = X.tasks;
  const inPlan = P.filter((p) => p.inPlan), trig = P.filter((p) => p.triggered);
  const complete = trig.filter((p) => p.pct === 1), approved = P.filter((p) => p.approved);
  const openT = T.filter((t) => t.open), overdueT = T.filter((t) => t.overdue);
  const list = (title, xs) => () => openProducts(ctx, title, xs);
  const tasksList = (title, xs) => () => openTasks(ctx, title, xs);
  const planYear = mostCommonYear(inPlan.map((p) => p.planned)) ?? new Date(m.now).getUTCFullYear();
  const months = Array.from({ length: 12 }, (_, i) => Date.UTC(planYear, i, 1));
  const monthPts = months.map((mo) => ({ x: M.monthKey(mo), ...Object.fromEntries(TRACKS.map((s) => [s, inPlan.filter((p) => p.planned === mo && p.track === s).length])) }));
  const phases = APQR_PHASES.map((_, i) => P.filter((p) => p.phase === i));
  const forms = [...new Set(P.map((p) => p.form))].filter((f) => f && f !== "—");
  const ragCounts = Object.keys(RAG_COLOR).map((k) => ({ label: tv(k), value: trig.filter((p) => p.rag === k).length, color: RAG_COLOR[k], onclick: list(tv(k), trig.filter((p) => p.rag === k)) }));
  const ref = X.refDate;
  const outlook = [{ x: t("overdue_short"), n: overdueT.length, color: "var(--critical)" }, ...Array.from({ length: 8 }, (_, i) => ({ x: `${t("week_short")}+${i + 1}`, n: openT.filter((t) => t.due != null && t.due >= ref + i * 7 * DAY && t.due < ref + (i + 1) * 7 * DAY).length }))];
  const ageB = [["0–30", 0, 30], ["31–60", 31, 60], ["61–90", 61, 90], [">90", 91, 1e9]];
  const timeline = trig.filter((p) => p.wfCreated != null).sort((a, b) => (a.wfDue ?? 9e15) - (b.wfDue ?? 9e15)).slice(0, 40);
  const from = timeline.length ? M.monthStart(Math.min(...timeline.map((p) => p.wfCreated))) : M.monthStart(ref);
  return [
    h("section.apqr-hero",
      h("div.apqr-hero-text",
        h("span.eyebrow", `${t("apqr_programme")} ${planYear}`),
        h("h2", `${fmtNum(inPlan.length || P.length)} ${t("apqr_products_planned")}`),
        h("p", t("apqr_hero_sub", fmtNum(trig.length), fmtNum(T.length), X.asOf != null ? fmtDate(X.asOf) : "—")),
        h("div.hero-meta", h("span.chip.chip-glass", h("i.live"), `${t("apqr_status_at")} ${fmtDate(ref)}`), h("span.chip.chip-glass", `${t("report_due_rule")} +${X.lagDays} ${t("d")}`), approved.length ? h("span.chip.chip-glass", `${fmtNum(approved.length)} ${t("apqr_approved").toLowerCase()}`) : null)),
      h("div.apqr-rings",
        heroRing(inPlan.length ? inPlan.filter((p) => p.triggered).length / inPlan.length : 0, t("apqr_k_triggered"), "#8fc1ff"),
        heroRing(T.length ? T.filter((x) => x.done).length / T.length : 0, t("apqr_k_task_done"), "#5fe0b0"),
        heroRing(trig.length ? complete.length / trig.length : 0, t("apqr_k_data_complete"), "#ffd27a"),
        heroRing(T.length ? 1 - overdueT.length / Math.max(1, openT.length) : 0, t("apqr_k_open_on_time"), "#ff9e9e"))),
    h("div.kpi-grid",
      kpi({ label: t("apqr_k_plan"), value: fmtNum(inPlan.length), hint: `${fmtNum(P.filter((p) => p.inSys).length)} ${t("apqr_in_scigeniq")}`, accent: "var(--c1)", onclick: list(t("apqr_k_plan"), inPlan) }),
      kpi({ label: t("apqr_k_wf"), value: fmtNum(trig.length), hint: inPlan.length ? `${fmtPct(inPlan.filter((p) => p.triggered).length / inPlan.length)} ${t("of_plan")}` : "", accent: "var(--c3)", onclick: list(t("apqr_k_wf"), trig) }),
      kpi({ label: t("apqr_k_past_due"), value: fmtNum(P.filter((p) => p.track === "Not triggered – past due").length), accent: "var(--critical)", onclick: list(t("apqr_k_past_due"), P.filter((p) => p.track === "Not triggered – past due")) }),
      kpi({ label: t("apqr_k_due60"), value: fmtNum(P.filter((p) => p.track === "Not triggered – due ≤60 d").length), accent: "var(--warning)", onclick: list(t("apqr_k_due60"), P.filter((p) => p.track === "Not triggered – due ≤60 d")) }),
      kpi({ label: t("apqr_k_tasks"), value: fmtNum(T.length), hint: `${fmtNum(T.filter((x) => x.done).length)} ${t("closed_lbl").toLowerCase()}`, onclick: tasksList(t("apqr_k_tasks"), T) }),
      kpi({ label: t("k_open"), value: fmtNum(openT.length), onclick: tasksList(t("k_open"), openT) }),
      kpi({ label: t("apqr_k_overdue_tasks"), value: fmtNum(overdueT.length), hint: `${fmtNum(T.filter((x) => x.sysOverdue).length)} ${t("apqr_sys_flag")}`, status: overdueT.length ? 1 : 3, onclick: tasksList(t("apqr_k_overdue_tasks"), overdueT) }),
      kpi({ label: t("apqr_k_unassigned"), value: fmtNum(T.filter((x) => x.open && x.unassigned).length), accent: "var(--warning)", onclick: tasksList(t("apqr_k_unassigned"), T.filter((x) => x.open && x.unassigned)) }),
      kpi({ label: t("apqr_k_prod_overdue"), value: fmtNum(trig.filter((p) => p.rag === "Overdue").length), accent: "var(--critical)", onclick: list(t("apqr_k_prod_overdue"), trig.filter((p) => p.rag === "Overdue")) }),
      kpi({ label: t("apqr_k_dupes"), value: fmtNum(P.filter((p) => p.duplicate).length), hint: t("apqr_dupes_hint"), onclick: list(t("apqr_k_dupes"), P.filter((p) => p.duplicate)) }),
      X.dupTasks.length ? kpi({ label: t("apqr_k_dup_flagged"), value: fmtNum(new Set(X.dupTasks.map((x) => x["Reference ID"])).size), hint: `${fmtNum(X.dupTasks.filter((x) => x.open).length)} ${t("apqr_tasks_to_cancel")}`, accent: "var(--warning)", onclick: tasksList(t("apqr_k_dup_flagged"), X.dupTasks) }) : null,
      T.some((x) => x.inferred) ? kpi({ label: t("apqr_k_inferred"), value: fmtNum(T.filter((x) => x.inferred).length), hint: t("apqr_inferred_hint"), accent: "var(--c3)", onclick: tasksList(t("apqr_k_inferred"), T.filter((x) => x.inferred)) }) : null,
      kpi({ label: t("apqr_approved"), value: fmtNum(approved.length), accent: "var(--good)", onclick: list(t("apqr_approved"), approved) })),
    card(t("apqr_phases"), phaseStepper(phases.map((xs) => xs.length), (i) => openProducts(ctx, phaseName(i), phases[i])), { sub: t("apqr_phases_sub") }),
    h("div.grid.cols-2",
      card(t("apqr_monthly_plan"), columns(monthPts, TRACKS.map((s) => ({ key: s, label: tv(s), color: TRACK_COLOR[s] })), { stacked: true, height: 280, onClick: (pt) => openProducts(ctx, pt.x, inPlan.filter((p) => p.planned != null && M.monthKey(p.planned) === pt.x)) }), { span: 2, sub: t("apqr_monthly_plan_sub") }),
      card(t("apqr_funnel"), funnel([
        { label: t("apqr_f_plan"), sub: "QA0021E/TE02", value: inPlan.length, color: "var(--c1)", onclick: list(t("apqr_f_plan"), inPlan) },
        { label: t("apqr_f_sys"), sub: "Scigeniq", value: P.filter((p) => p.inSys).length, color: "var(--c7)", onclick: list(t("apqr_f_sys"), P.filter((p) => p.inSys)) },
        { label: t("apqr_f_trig"), value: trig.length, color: "var(--c3)", onclick: list(t("apqr_f_trig"), trig) },
        { label: t("apqr_f_data"), value: complete.length, color: "var(--c4)", onclick: list(t("apqr_f_data"), complete) },
        { label: t("apqr_f_approved"), value: approved.length, color: "var(--good)", onclick: list(t("apqr_f_approved"), approved) },
      ]), { sub: t("apqr_funnel_sub") }),
      card(t("apqr_rag"), donut(ragCounts, { center: fmtNum(trig.length), sub: t("apqr_workflows_lbl") }), { sub: t("apqr_rag_sub") }),
      card(t("apqr_task_status"), donut([
        { label: t("s_completed"), value: T.filter((x) => x.done).length, color: "var(--good)", onclick: tasksList(t("s_completed"), T.filter((x) => x.done)) },
        { label: t("apqr_open_in_time"), value: openT.length - overdueT.length, color: "var(--c1)", onclick: tasksList(t("apqr_open_in_time"), openT.filter((x) => !x.overdue)) },
        { label: t("s_overdue"), value: overdueT.length, color: "var(--critical)", onclick: tasksList(t("s_overdue"), overdueT) },
      ], { center: fmtPct(T.length ? T.filter((x) => x.done).length / T.length : 0), sub: t("closed_lbl").toLowerCase() })),
      card(t("apqr_by_dept"), stacks(APQR_DEPTS.concat([...new Set(T.map((x) => x.dept))].filter((d) => !APQR_DEPTS.includes(d))).filter((d) => T.some((x) => x.dept === d)).map((d) => ({
        label: d, parts: { done: T.filter((x) => x.dept === d && x.done).length, open: T.filter((x) => x.dept === d && x.open && !x.overdue).length, od: T.filter((x) => x.dept === d && x.overdue).length },
        onclick: tasksList(d, T.filter((x) => x.dept === d)) })), [{ key: "done", label: t("s_completed"), color: "var(--good)" }, { key: "open", label: t("apqr_open_in_time"), color: "var(--c1)" }, { key: "od", label: t("s_overdue"), color: "var(--critical)" }])),
      card(t("apqr_by_stream"), stacks(X.streams.map((st) => ({
        label: st, parts: { done: T.filter((x) => x.stream === st && x.done).length, open: T.filter((x) => x.stream === st && x.open && !x.overdue).length, od: T.filter((x) => x.stream === st && x.overdue).length },
        onclick: tasksList(st, T.filter((x) => x.stream === st)) })), [{ key: "done", label: t("s_completed"), color: "var(--good)" }, { key: "open", label: t("apqr_open_in_time"), color: "var(--c1)" }, { key: "od", label: t("s_overdue"), color: "var(--critical)" }])),
      card(t("apqr_by_form"), stacks(forms.map((f) => ({
        label: f, parts: { notrig: P.filter((p) => p.form === f && !p.triggered).length, prog: P.filter((p) => p.form === f && p.triggered && p.pct < 1).length, done: P.filter((p) => p.form === f && p.triggered && p.pct === 1).length },
        onclick: list(f, P.filter((p) => p.form === f)) })), [{ key: "done", label: t("apqr_f_data"), color: "var(--good)" }, { key: "prog", label: tv("In progress"), color: "var(--c1)" }, { key: "notrig", label: t("apqr_not_triggered"), color: "var(--muted-mark)" }])),
      card(t("owner_load"), stacks(X.users.filter((u) => u.open).slice(0, 14).map((u) => ({ label: u.user, parts: { od: u.overdue, open: u.open - u.overdue }, onclick: tasksList(u.user, T.filter((x) => (x["Assigned User"] || "Unassigned") === u.user && x.open)) })), [{ key: "od", label: t("s_overdue"), color: "var(--critical)" }, { key: "open", label: t("apqr_open_in_time"), color: "var(--c1)" }]), { sub: t("apqr_owner_sub") }),
      card(t("due_outlook"), h("div.vcols", outlook.map((o) => h("div.vcol", { "data-tip": `<b>${esc(o.x)}</b><div class="tip-row"><span>${esc(t("apqr_k_tasks"))}</span><b>${o.n}</b></div>` },
        h("span.vcol-v", fmtNum(o.n)), h("span.vcol-bar", { style: { height: `${(o.n / Math.max(1, ...outlook.map((z) => z.n))) * 100}%`, background: o.color ?? "var(--c1)" } }), h("span.vcol-x", o.x)))), { sub: t("apqr_outlook_sub") }),
      card(t("apqr_ageing"), hbars(ageB.map(([lbl, a, z]) => ({ label: `${lbl} ${t("d")}`, value: openT.filter((x) => x.ageDays != null && x.ageDays >= a && x.ageDays <= z).length, color: z > 90 ? "var(--critical)" : z > 60 ? "var(--serious)" : "var(--c1)", onclick: tasksList(lbl, openT.filter((x) => x.ageDays != null && x.ageDays >= a && x.ageDays <= z)) })))),
      card(t("apqr_bottleneck"), hbars(by(trig.filter((p) => p.bottleneck), "bottleneck").map(([d, n]) => ({ label: d, value: n, color: "var(--c2)", onclick: list(`${t("apqr_bottleneck")} · ${d}`, trig.filter((p) => p.bottleneck === d)) }))), { sub: t("apqr_bottleneck_sub") }),
      card(t("apqr_readiness"), readiness(ctx, X, [...trig].sort((a, b) => a.pct - b.pct).slice(0, 18)), { span: 2, sub: t("apqr_readiness_sub") }),
      card(t("apqr_wf_timeline"), gantt(timeline.map((p) => ({ label: short(p.name, 40), sub: p.refs.join(" "), start: p.wfCreated, end: p.wfDue ?? p.wfCreated, color: RAG_COLOR[p.rag],
        tip: `<b>${esc(p.name)}</b><div class="tip-row"><span>${esc(t("col_due"))}</span><b>${fmtDate(p.wfDue)}</b></div><div class="tip-row"><span>%</span><b>${fmtPct(p.pct)}</b></div>`, onclick: () => openApqrProduct(ctx, p.key) })),
      { from, months: Math.max(6, Math.min(14, Math.ceil(((Math.max(...timeline.map((p) => p.wfDue ?? ref), ref) - from) / (30.4 * DAY))) + 1)), today: ref }), { span: 2, sub: t("apqr_gantt_sub") })),
    h("p.fine", t("apqr_prog_refs")),
  ];
}
function heroRing(v, label, color) {
  return h("div.hero-ring", ring(v, { size: 92, color, label }), h("span", label));
}
function mostCommonYear(ts) {
  const ys = ts.filter((x) => x != null).map((x) => new Date(x).getUTCFullYear());
  return ys.length ? +[...M.countBy(ys.map(String), (x) => x)].sort((a, b) => b[1] - a[1])[0][0] : null;
}

/** The 8 phases of the APQR workflow as a stepper with the number of products in each. */
export function phaseStepper(counts, onPick, current) {
  return h("ol.stepper", APQR_PHASES.map((ph, i) => h("li", { class: [current === i ? "now" : "", current != null && i < current ? "past" : ""].filter(Boolean).join(" ") || null },
    h(onPick && counts?.[i] ? "button.step" : "div.step", { type: onPick && counts?.[i] ? "button" : null, onclick: onPick && counts?.[i] ? () => onPick(i) : null, style: { "--i": i } },
      h("span.step-n", i + 1), h("span.step-l", phaseName(i)), counts ? h("b.step-c", fmtNum(counts[i])) : null))));
}

/** Product × data-stream grid: done / open / overdue for each stream of each workflow. */
function readiness(ctx, X, products) {
  if (!products.length) return h("div.empty", t("no_data"));
  return h("div",
    legend([{ label: t("s_completed"), color: STATE_COLOR.done }, { label: t("apqr_open_in_time"), color: STATE_COLOR.open }, { label: t("s_overdue"), color: STATE_COLOR.overdue }, { label: t("apqr_no_task"), color: "var(--track)" }]),
    h("div.readiness-wrap", h("table.readiness",
      h("thead", h("tr", h("th", t("product")), X.streams.map((st) => h("th", { title: APQR_STREAMS[st]?.[1] ?? st }, h("span", st))), h("th.num", "%"))),
      h("tbody", products.map((p) => h("tr", { class: "clickable", onclick: () => openApqrProduct(ctx, p.key) },
        h("th", { title: p.name }, short(p.name, 44)),
        X.streams.map((st) => { const s = p.streamState[st]; return h("td", h("i.rd", { class: s ?? "none", "data-tip": `<b>${esc(st)}</b><div class="tip-row"><span>${esc(short(p.name, 40))}</span><b>${esc(s ? tv(s === "done" ? "Completed" : s === "overdue" ? "Overdue" : "Open") : "—")}</b></div>` })); }),
        h("td.num", pctBar(p.pct, RAG_COLOR[p.rag]))))))));
}

// ---------- annual plan ----------
function planTab(ctx, X) {
  const { m } = ctx;
  const f = ctx.state.apqrPlanF ?? {};
  const setF = (k, v) => ctx.set("apqrPlanF", { ...f, [k]: v });
  const P = X.products.filter((p) => p.inPlan || p.inSys);
  const L = P.filter((p) => (!f.form || f.form === ALL || p.form === f.form) && (!f.track || f.track === ALL || p.track === f.track));
  const planYear = mostCommonYear(P.map((p) => p.planned)) ?? new Date(m.now).getUTCFullYear();
  const months = Array.from({ length: 12 }, (_, i) => Date.UTC(planYear, i, 1));
  const thisMonth = M.monthStart(m.now);
  const notInSys = X.products.filter((p) => p.inPlan && !p.inSys), offPlan = X.products.filter((p) => p.offPlan), dupes = X.products.filter((p) => p.duplicate);
  const recordBtn = (p) => (ctx.canEdit ? h("button.btn.compact", { type: "button", title: t("apqr_record"), onclick: (e) => { e.stopPropagation(); editRecord(ctx, p); } }, icon(p.record ? "edit" : "plus", 14)) : null);
  return [
    card(null, h("div.filters",
      select(t("dosage_form"), [[ALL, t("filter_all")], ...[...new Set(P.map((p) => p.form))].map((x) => [x, x])], f.form ?? ALL, (v) => setF("form", v)),
      select(t("col_status"), [[ALL, t("filter_all")], ...TRACKS.map((s) => [s, tv(s)])], f.track ?? ALL, (v) => setF("track", v))), { cls: "filter-card" }),
    card(`${t("apqr_calendar")} ${planYear}`, h("div.plan-board", months.map((mo, i) => {
      const xs = L.filter((p) => p.planned === mo);
      return h("section.plan-month", { class: mo === thisMonth ? "now" : mo < thisMonth ? "past" : "", style: { "--i": i } },
        h("header", h("span", new Date(mo).toLocaleString(FR() ? "fr-FR" : "en-GB", { month: "long", timeZone: "UTC" })), h("b", fmtNum(xs.length)),
          xs.length ? h("i.plan-prog", h("i", { style: { width: `${(xs.filter((p) => p.pct === 1 || p.approved).length / xs.length) * 100}%` } })) : null),
        h("div.plan-chips", xs.map((p) => h("button.plan-chip", { type: "button", style: { "--dot": TRACK_COLOR[p.track] }, title: `${p.name} · ${tv(p.track)}`, onclick: () => openApqrProduct(ctx, p.key) },
          h("i"), h("span", chipLabel(p.name)), p.triggered ? h("small", fmtPct(p.pct)) : null))));
    })), { sub: t("apqr_calendar_sub") }),
    h("div.grid.cols-3",
      card(t("apqr_recon_nosys"), notInSys.length ? h("div.mini-list", notInSys.slice(0, 60).map((p) => h("button.mini-item", { type: "button", onclick: () => openApqrProduct(ctx, p.key) }, h("span", p.name), h("small", p.planned != null ? fmtDate(p.planned).slice(3) : "")))) : h("p.ok-line", icon("check", 14), t("none_found")), { sub: `${fmtNum(notInSys.length)} · ${t("apqr_recon_nosys_sub")}` }),
      card(t("apqr_recon_offplan"), offPlan.length ? h("div.mini-list", offPlan.map((p) => h("button.mini-item", { type: "button", onclick: () => openApqrProduct(ctx, p.key) }, h("span", p.name), h("small", p.refs.join(" "))))) : h("p.ok-line", icon("check", 14), t("none_found")), { sub: t("apqr_recon_offplan_sub") }),
      card(t("apqr_k_dupes"), dupes.length ? h("div.mini-list", dupes.map((p) => h("button.mini-item", { type: "button", onclick: () => openApqrProduct(ctx, p.key) }, h("span", p.name), h("small", p.refs.join(" · "))))) : h("p.ok-line", icon("check", 14), t("none_found")), { sub: t("apqr_dupes_hint") })),
    card(`${t("apqr_tab_plan")} · ${fmtNum(L.length)}`, dataTable([
      { key: "code", label: t("col_code"), cls: "mono nowrap" },
      { key: "name", label: t("product"), cls: "wrap", render: (p) => h("b", p.name) },
      { key: "form", label: t("dosage_form") },
      { key: "planned", label: t("planned_lbl"), cls: "num nowrap", render: (p) => (p.planned != null ? fmtDate(p.planned).slice(3) : "—") },
      { key: "period", label: t("period_lbl"), cls: "nowrap" },
      { key: "prevReport", label: t("apqr_prev_report"), cls: "mono nowrap" },
      { key: "inSys", label: "Scigeniq", render: (p) => (p.inSys ? "✔" : h("span.warn-text", "✘")) },
      { key: "pct", label: t("apqr_tasks_pct"), cls: "num", render: (p) => (p.triggered ? pctBar(p.pct, RAG_COLOR[p.rag]) : "—") },
      { key: "reportDue", label: t("apqr_report_due"), cls: "num nowrap", render: (p) => (p.daysToReportDue != null && p.daysToReportDue < 0 && !p.approved ? h("b.late", fmtDate(p.reportDue)) : fmtDate(p.reportDue)) },
      { key: "track", label: t("col_status"), render: (p) => dot(TRACK_COLOR[p.track], tv(p.track)) },
      { key: "act", label: "", render: recordBtn },
    ], L, { pageSize: 40, onRow: (p) => openApqrProduct(ctx, p.key), searchText: (p) => `${p.name} ${p.code} ${p.refs.join(" ")}`, exportName: "apqr-plan" }), {
      actions: ctx.canEdit ? [
        h("button.btn.compact", { type: "button", onclick: () => ctx.add("apqrPlan") }, icon("plus", 14), t("apqr_add_plan")),
        h("button.btn.compact", { type: "button", onclick: () => openBulk(ctx, "apqrPlan", { title: `${t("bulk_insert")} · ${t("apqr_tab_plan")}` }) }, icon("upload", 14), t("bulk_insert")),
        h("button.btn.compact.ghost", { type: "button", onclick: () => openBulk(ctx, "apqrSys", { title: `${t("bulk_insert")} · ${t("apqr_f_sys")}` }) }, icon("upload", 14), "Scigeniq")] : null }),
  ];
}

// ---------- workflows ----------
function workflowsTab(ctx, X) {
  const W = X.products.filter((p) => p.triggered);
  const f = ctx.state.apqrWfF ?? {};
  const setF = (k, v) => ctx.set("apqrWfF", { ...f, [k]: v });
  const L = W.filter((p) => (!f.rag || f.rag === ALL || p.rag === f.rag) && (!f.owner || f.owner === ALL || p.owner === f.owner) && (!f.form || f.form === ALL || p.form === f.form));
  return [
    card(null, h("div.filters",
      select("RAG", [[ALL, t("filter_all")], ...Object.keys(RAG_COLOR).map((k) => [k, tv(k)])], f.rag ?? ALL, (v) => setF("rag", v)),
      select(t("apqr_owner"), [[ALL, t("filter_all")], ...[...new Set(W.map((p) => p.owner).filter(Boolean))].map((x) => [x, x])], f.owner ?? ALL, (v) => setF("owner", v)),
      select(t("dosage_form"), [[ALL, t("filter_all")], ...[...new Set(W.map((p) => p.form))].map((x) => [x, x])], f.form ?? ALL, (v) => setF("form", v))), { cls: "filter-card" }),
    h("div.rag-strip", Object.keys(RAG_COLOR).map((k) => h("button.rag-tile", { type: "button", style: { "--c": RAG_COLOR[k] }, class: f.rag === k ? "on" : "", onclick: () => setF("rag", f.rag === k ? ALL : k) },
      h("b", fmtNum(W.filter((p) => p.rag === k).length)), h("span", tv(k))))),
    card(`${t("apqr_tab_wf")} · ${fmtNum(L.length)}`, dataTable([
      { key: "refs", label: t("col_ref"), cls: "mono nowrap", sort: (p) => p.refs.join(" "), render: (p) => h("span", p.refs.join(" · "), p.duplicate ? h("span.tag.warn-tag", t("dup_short")) : null) },
      { key: "name", label: t("product"), cls: "wrap", render: (p) => h("b", p.name) },
      { key: "owner", label: t("apqr_owner"), cls: "nowrap" },
      { key: "stage", label: t("col_stage"), sort: (p) => p.phase, render: (p) => h("span", { title: phaseName(p.phase) }, p.stage ?? phaseName(p.phase)) },
      { key: "wfDue", label: t("col_due"), cls: "num nowrap", render: (p) => fmtDate(p.wfDue) },
      { key: "total", label: t("apqr_k_tasks"), cls: "num" },
      { key: "open", label: t("k_open"), cls: "num" },
      { key: "overdue", label: t("k_overdue"), cls: "num", render: (p) => (p.overdue ? h("b.late", p.overdue) : "0") },
      { key: "pct", label: "%", cls: "num", render: (p) => pctBar(p.pct, RAG_COLOR[p.rag]) },
      { key: "rag", label: "RAG", render: (p) => dot(RAG_COLOR[p.rag], tv(p.rag)) },
      { key: "bottleneck", label: t("apqr_bottleneck_short"), render: (p) => p.bottleneck ?? "—" },
      ...APQR_DEPTS.map((d) => ({ key: `ob_${d}`, label: d, cls: "num", sort: (p) => p.openBy[d], render: (p) => (p.openBy[d] ? h("span.cnt", { class: p.bottleneck === d ? "hot" : "" }, p.openBy[d]) : "·") })),
    ], [...L].sort((a, b) => b.overdue - a.overdue || a.pct - b.pct), { pageSize: 30, onRow: (p) => openApqrProduct(ctx, p.key), searchText: (p) => `${p.name} ${p.refs.join(" ")} ${p.owner}`, exportName: "apqr-workflows" })),
    card(t("apqr_readiness"), readiness(ctx, X, [...L].sort((a, b) => a.pct - b.pct)), { sub: t("apqr_readiness_sub") }),
  ];
}

// ---------- tasks ----------
export function taskCols() {
  return [
    { key: "Reference ID", label: t("col_ref"), cls: "mono nowrap" },
    { key: "Product", label: t("product"), cls: "wrap", render: (x) => short(x.Product.replace(/\s*-\s*ELKENDI\s*$/i, ""), 46) },
    { key: "dept", label: t("col_dept") },
    { key: "stream", label: t("apqr_stream") },
    { key: "Task Title", label: t("col_title"), cls: "wrap" },
    { key: "Workflow Stage", label: t("col_stage") },
    { key: "status", label: t("col_status"), sort: (x) => (x.done ? 2 : x.overdue ? 0 : 1), render: (x) => dot(x.done ? "var(--good)" : x.overdue ? "var(--critical)" : "var(--c1)", x.inferred ? tv("Closed (inferred)") : x.done ? tv("Completed") : x.overdue ? tv("Overdue") : tv("Open")) },
    { key: "Assigned User", label: t("col_owner"), cls: "nowrap", render: (x) => (x.unassigned ? h("span.warn-text", t("unassigned")) : x["Assigned User"]) },
    { key: "due", label: t("col_due"), cls: "num nowrap", render: (x) => (x.overdue ? h("b.late", fmtDate(x.due)) : fmtDate(x.due)) },
    { key: "daysToDue", label: t("days_left"), cls: "num", render: (x) => (x.daysToDue == null ? "" : x.daysToDue < 0 ? h("b.late", fmtNum(x.daysToDue)) : fmtNum(x.daysToDue)) },
    { key: "closed", label: t("s_closed"), cls: "num nowrap", render: (x) => fmtDate(x.closed) },
  ];
}
function tasksTab(ctx, X) {
  const T = X.tasks;
  const f = ctx.state.apqrTaskF ?? {};
  const setF = (k, v) => ctx.set("apqrTaskF", { ...f, [k]: v });
  const st = (x) => (x.done ? "Completed" : x.overdue ? "Overdue" : "Open");
  const L = T.filter((x) => (!f.dept || f.dept === ALL || x.dept === f.dept) && (!f.stream || f.stream === ALL || x.stream === f.stream) && (!f.user || f.user === ALL || (x["Assigned User"] || "Unassigned") === f.user)
    && (!f.status || f.status === ALL || (f.status === "Unassigned" ? x.unassigned && x.open : st(x) === f.status)));
  return [
    card(null, h("div.filters",
      select(t("col_dept"), [[ALL, t("filter_all")], ...[...new Set(T.map((x) => x.dept))].map((x) => [x, x])], f.dept ?? ALL, (v) => setF("dept", v)),
      select(t("apqr_stream"), [[ALL, t("filter_all")], ...X.streams.map((x) => [x, x])], f.stream ?? ALL, (v) => setF("stream", v)),
      select(t("col_status"), [[ALL, t("filter_all")], ...["Open", "Overdue", "Completed"].map((s) => [s, tv(s)]), ["Unassigned", t("unassigned")]], f.status ?? ALL, (v) => setF("status", v)),
      select(t("col_owner"), [[ALL, t("filter_all")], ...X.users.map((u) => [u.user, u.user])], f.user ?? ALL, (v) => setF("user", v))), { cls: "filter-card" }),
    h("div.kpi-grid.six",
      kpi({ label: t("apqr_k_tasks"), value: fmtNum(L.length), accent: "var(--c1)" }),
      kpi({ label: t("s_completed"), value: fmtNum(L.filter((x) => x.done).length), accent: "var(--good)" }),
      kpi({ label: t("k_open"), value: fmtNum(L.filter((x) => x.open).length) }),
      kpi({ label: t("k_overdue"), value: fmtNum(L.filter((x) => x.overdue).length), accent: "var(--critical)" }),
      kpi({ label: t("ontime_closure"), value: (() => { const c = L.filter((x) => x.onTime != null); return c.length ? fmtPct(c.filter((x) => x.onTime).length / c.length) : "—"; })() }),
      kpi({ label: t("apqr_k_unassigned"), value: fmtNum(L.filter((x) => x.open && x.unassigned).length), accent: "var(--warning)" })),
    card(`${t("apqr_tab_tasks")} · ${fmtNum(L.length)}`, dataTable(taskCols(), [...L].sort((a, b) => (a.done - b.done) || (a.due ?? 9e15) - (b.due ?? 9e15)), { pageSize: 30, onRow: (x) => openApqrProduct(ctx, x.key), searchText: (x) => `${x["Reference ID"]} ${x.Product} ${x["Task Title"]} ${x["Assigned User"]}`, exportName: "apqr-tasks" }),
      { sub: t("apqr_tasks_open_sub"), actions: ctx.canEdit ? [h("button.btn.compact", { type: "button", onclick: () => openBulk(ctx, "apqrTasks", { title: `${t("bulk_insert")} · ${t("apqr_tab_tasks")}` }) }, icon("upload", 14), t("bulk_insert")),
        h("button.btn.compact.ghost", { type: "button", onclick: () => ctx.openImport() }, icon("upload", 14), t("apqr_import_sci"))] : null }),
    card(t("apqr_workload"), dataTable([
      { key: "user", label: t("col_owner"), render: (u) => h("b", u.user) }, { key: "total", label: t("apqr_k_tasks"), cls: "num" }, { key: "completed", label: t("s_completed"), cls: "num" },
      { key: "open", label: t("k_open"), cls: "num" }, { key: "overdue", label: t("k_overdue"), cls: "num", render: (u) => (u.overdue ? h("b.late", u.overdue) : "0") },
      { key: "pct", label: "%", cls: "num", render: (u) => pctBar(u.pct, "var(--good)") }, { key: "earliest", label: t("apqr_earliest_due"), cls: "num nowrap", render: (u) => fmtDate(u.earliest) },
      { key: "st", label: t("col_status"), sort: (u) => (u.overdue ? 0 : u.open ? 1 : 2), render: (u) => dot(u.overdue ? "var(--critical)" : u.open ? "var(--c1)" : "var(--good)", u.overdue ? t("apqr_action_overdue") : u.open ? tv("In progress") : t("apqr_clear")) },
    ], X.users, { pageSize: 15, onRow: (u) => setF("user", u.user), exportName: "apqr-workload" }), { sub: t("apqr_workload_sub") }),
  ];
}

// ---------- drawers ----------
function openProducts(ctx, title, list) {
  ctx.open.drawer(() => [
    h("div.d-head", h("span.d-ref", `${fmtNum(list.length)} ${t("rows")}`), h("h2", title)),
    dataTable([
      { key: "name", label: t("product"), cls: "wrap", render: (p) => h("b", p.name) },
      { key: "planned", label: t("planned_lbl"), cls: "num nowrap", render: (p) => (p.planned != null ? fmtDate(p.planned).slice(3) : "—") },
      { key: "pct", label: "%", cls: "num", render: (p) => (p.triggered ? pctBar(p.pct, RAG_COLOR[p.rag]) : "—") },
      { key: "track", label: t("col_status"), render: (p) => dot(TRACK_COLOR[p.track], tv(p.track)) },
    ], list, { pageSize: 30, onRow: (p) => openApqrProduct(ctx, p.key), exportName: "apqr-products" }),
  ]);
}
function openTasks(ctx, title, list) {
  ctx.open.drawer(() => [
    h("div.d-head", h("span.d-ref", `${fmtNum(list.length)} ${t("rows")}`), h("h2", title)),
    dataTable(taskCols().filter((c) => ["Reference ID", "Product", "stream", "status", "Assigned User", "due"].includes(c.key)), list, { pageSize: 30, onRow: (x) => openApqrProduct(ctx, x.key), exportName: "apqr-tasks" }),
  ]);
}

/** Record the APQR decision for a programme product (period, CAPA decision, conclusion, approval). */
export function editRecord(ctx, p) {
  if (p.record?.__key) return ctx.edit("apqr", p.record.__key, `${p.name} · ${p.record.Period ?? ""}`);
  ctx.addWith("apqr", { Product: p.name, Period: p.period, "Period start": isoDay(p.start), "Period end": isoDay(p.end), "Due date": isoDay(p.reportDue), Owner: p.owner, Status: p.pct === 1 ? "Statistical analysis" : p.triggered ? "Data collection" : "Planned" }, p.name);
}

/** Open an APQR on its own page. */
export function openApqrProduct(ctx, key) {
  ctx.closeDrawer();
  ctx.go("apqr", { p: key });
}
// ---------- report builder (oncology products with batch data) ----------
function reportBuilder(ctx) {
  const { m } = ctx;
  const L = m.x.lifecycle;
  const A = m.x.apqr;
  const year = +(ctx.state.apqrYear ?? new Date(m.now).getUTCFullYear() - 1);
  const products = L.filter((p) => p.batches.length || /marketed/i.test(p.catalogStatus)).map((p) => p.name);
  const inYear = (p) => L.find((x) => x.name === p).batches.filter((b) => b.mfg != null && new Date(b.mfg).getUTCFullYear() === year).length;
  const sel = ctx.state.apqrProduct && products.includes(ctx.state.apqrProduct) ? ctx.state.apqrProduct : [...products].sort((a, b) => inYear(b) - inYear(a))[0];
  const P = L.find((p) => p.name === sel);
  const pStart = Date.UTC(year, 0, 1), pEnd = Date.UTC(year + 1, 0, 1);
  const inP = (ts) => ts != null && ts >= pStart && ts < pEnd;
  const row = A.find((a) => a.Product === sel && String(a.Period) === String(year));
  const schedule = products.map((p) => A.find((a) => a.Product === p && String(a.Period) === String(year)) ?? { Product: p, Period: String(year), status: "Not scheduled", missing: true });
  const B = (P?.batches ?? []).filter((b) => inP(b.mfg));
  const R = (P?.records ?? []).filter((r) => inP(r.opened));
  const devs = R.filter((r) => r.type === "Deviation"), ccs = R.filter((r) => r.type === "Change Control"), capas = R.filter((r) => r.type === "CAPA");
  const variations = ccs.filter((r) => /variation|registration|ra notification|ma\b|amm/i.test(`${r.title} ${r.folders}`));
  const stats = (k) => { const xs = B.map((b) => b.yields[k]).filter((v) => v != null); if (!xs.length) return null; const mean = xs.reduce((a, b) => a + b, 0) / xs.length; const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, xs.length - 1)); return { n: xs.length, mean, min: Math.min(...xs), max: Math.max(...xs), sd }; };
  const failing = B.filter((b) => b.rejected || b.oos);
  const eqStatus = m.x.validation;
  const lang = FR() ? 2 : 1;
  const sectionBody = {
    i: h("div", P?.suppliers.length ? dataTable([{ key: "API", label: "API" }, { key: "Manufacturer", label: t("manufacturer") }, { key: "Supplier", label: t("supplier_lbl") }, { key: "Approval status", label: t("col_status") }, { key: "Change control", label: "CC", cls: "mono" }], P.suppliers, { search: false }) : h("p.muted", t("no_supplier")),
      h("p.fine", `${t("material_ccs")}: ${ccs.filter((r) => /raw material|packaging material/i.test(r.scope)).map((r) => r.ref).join(", ") || "—"}`)),
    ii: h("div", B.length ? [h("div.table-scroll", h("table.data.compact", h("thead", h("tr", ["", "n", t("mean_lbl"), "min", "max", "SD"].map((x) => h("th", x)))), h("tbody", [["granulation", "y_gran"], ["compression", "y_comp"], ["manufacturing", "y_mfg"], ["packaging", "y_pack"]].map(([k, lbl]) => { const s = stats(k); return h("tr", h("td", t(lbl)), h("td.num", s?.n ?? "—"), h("td.num", fmtPct(s?.mean, 1)), h("td.num", fmtPct(s?.min, 1)), h("td.num", fmtPct(s?.max, 1)), h("td.num", s ? fmtNum(s.sd * 100, 1) + " pt" : "—")); })))),
      h("p.fine", `${fmtNum(B.length)} ${t("batches_lbl").toLowerCase()} · ${t("released_lbl")}: ${fmtNum(B.filter((b) => b.release).length)}`)] : h("p.muted", t("no_batches_period"))),
    iii: !B.length ? h("p.muted", t("no_batches_period")) : failing.length ? dataTable([{ key: "Batch no", label: t("col_batch"), cls: "mono" }, { key: "stage", label: t("stage") }, { key: "oos", label: "OOS" }, { key: "deviation", label: t("nav_dev") }], failing, { search: false }) : h("p.ok-line", icon("check", 14), t("none_failing")),
    iv: h("div", h("p", `${fmtNum(devs.length)} ${t("nav_dev").toLowerCase()} · ${["Critical", "Major", "Minor"].map((c) => `${tv(c)} ${devs.filter((r) => r.classification === c).length}`).join(" · ")}`), devs.length ? dataTable(recordCols(["ref", "status", "cls", "opened", "title"]), devs, { search: false, onRow: (r) => ctx.open.record(r.ref) }) : null),
    v: ccs.length ? dataTable(recordCols(["ref", "status", "scope", "opened", "title"]), ccs, { search: false, onRow: (r) => ctx.open.record(r.ref) }) : h("p.muted", t("no_data")),
    vi: variations.length ? dataTable(recordCols(["ref", "status", "opened", "title"]), variations, { search: false, onRow: (r) => ctx.open.record(r.ref) }) : h("p.muted", t("no_variation")),
    vii: h("p.muted", t("manual_section")),
    viii: h("p.muted", t("manual_complaints")),
    ix: capas.length ? h("div", h("p", `${fmtNum(capas.length)} CAPA · ${t("k_completed")} ${capas.filter((r) => r.status === "Completed").length} · ${t("cd_k_ec")} ${fmtPct(capas.filter((r) => r.effCheck === "Yes").length / capas.length)}`), dataTable(recordCols(["ref", "status", "due", "title"]), capas, { search: false, onRow: (r) => ctx.open.record(r.ref) })) : h("p.muted", t("no_data")),
    x: h("p.muted", t("manual_section")),
    xi: h("div", h("p", `${t("requal_status")}: ${["Completed", "Overdue", "Planned", "In progress"].map((s) => `${tv(s)} ${eqStatus.filter((v) => v.status === s).length}`).join(" · ")}`), h("p.fine", t("requal_note"))),
    xii: h("p.muted", t("manual_section")),
  };
  return [
    card(null, h("div.filters",
      select(t("year_lbl"), [year - 2, year - 1, year, year + 1].map((y) => [y, String(y)]), year, (v) => ctx.set("apqrYear", v)),
      select(t("pv_sel"), products.map((p) => [p, p]), sel, (v) => ctx.set("apqrProduct", v))), { cls: "filter-card", sub: null }),
    h("div.kpi-grid",
      kpi({ label: t("apqr_products"), value: fmtNum(products.length), accent: "var(--c1)" }),
      kpi({ label: t("apqr_scheduled"), value: fmtNum(schedule.filter((s) => !s.missing).length) }),
      kpi({ label: t("apqr_approved"), value: fmtNum(schedule.filter((s) => s.status === "Approved").length), accent: "var(--good)" }),
      kpi({ label: t("k_overdue"), value: fmtNum(schedule.filter((s) => s.status === "Overdue").length), accent: "var(--critical)" }),
      kpi({ label: t("not_scheduled"), value: fmtNum(schedule.filter((s) => s.missing).length), accent: "var(--warning)" })),
    card(`${t("apqr_schedule")} ${year}`, dataTable([
      { key: "Product", label: t("product"), render: (s) => h("b", s.Product) }, { key: "Period", label: t("period_lbl") },
      { key: "due", label: t("col_due"), cls: "num nowrap", render: (s) => fmtDate(s.due) }, { key: "status", label: t("col_status"), render: (s) => dot(s.status === "Approved" ? "var(--good)" : s.status === "Overdue" ? "var(--critical)" : s.missing ? "var(--warning)" : "var(--c1)", tv(s.status)) },
      { key: "Owner", label: t("col_owner") }, { key: "approved", label: t("approved_on"), cls: "num nowrap", render: (s) => fmtDate(s.approved) },
      { key: "act", label: "", render: (s) => (ctx.canEdit ? h("button.btn.compact", { type: "button", onclick: (e) => { e.stopPropagation(); s.missing ? ctx.addWith("apqr", { Product: s.Product, Period: String(year), "Period start": `${year}-01-01`, "Period end": `${year}-12-31`, "Due date": `${year + 1}-03-31`, Status: "Planned" }) : ctx.edit("apqr", s.__key, `${s.Product} · ${s.Period}`); } }, s.missing ? t("schedule_btn") : t("edit")) : null) },
    ], schedule, { search: false, onRow: (s) => ctx.set("apqrProduct", s.Product) }), { sub: t("apqr_schedule_sub") }),
    P ? h("div.apqr-head", h("div", h("span.eyebrow", `APQR ${year}`), h("h2", P.name), h("p", [P.api, P.strengths, P.form].filter(Boolean).join(" · "))),
      h("div.apqr-meta", row ? [dot(row.status === "Approved" ? "var(--good)" : "var(--c1)", tv(row.status)), row["Report ref"] ? h("span.tag", row["Report ref"]) : null] : h("span.tag", t("not_scheduled")),
        row?.Conclusion ? h("p", h("b", `${t("conclusion_lbl")}: `), row.Conclusion) : null)) : null,
    P ? statistics(ctx, P, B) : null,
    P ? h("div.apqr-sections", APQR_SECTIONS.map((sct) => card(`(${sct[0]}) ${sct[lang]}`, sectionBody[sct[0]]))) : null,
    h("p.fine", t("apqr_refs")),
  ];
}

// ---------- statistical analysis: individuals control chart and process capability ----------
const PARAMS = [["manufacturing", "y_mfg"], ["packaging", "y_pack"], ["granulation", "y_gran"], ["compression", "y_comp"]];
function statistics(ctx, P, B) {
  const key = ctx.state.apqrParam ?? "manufacturing";
  const lim = ctx.state.apqrLimits?.[`${P.name}|${key}`] ?? {};
  const setLim = (k, v) => ctx.set("apqrLimits", { ...(ctx.state.apqrLimits ?? {}), [`${P.name}|${key}`]: { ...lim, [k]: v === "" ? null : +String(v).replace(",", ".") / 100 } });
  const pts = (B.length >= 2 ? B : P.batches).filter((b) => b.yields[key] != null);
  const xs = pts.map((b) => b.yields[key]);
  const c = capability(xs, lim.lsl ?? null, lim.usl ?? null);
  const guide = c?.cpk != null ? CPK_GUIDE.find(([min]) => c.cpk >= min) : null;
  const out = c ? c.signals.filter((s) => s.length).length : 0;
  const pctIn = (v) => (v == null ? "" : String(Math.round(v * 1000) / 10));
  return card(t("apqr_stats"), h("div.stats-grid",
    h("div",
      h("div.filters",
        select(t("apqr_param"), PARAMS.map(([k, l]) => [k, t(l)]), key, (v) => ctx.set("apqrParam", v)),
        h("label.field", h("span", "LSL (%)"), h("input", { type: "text", inputmode: "decimal", value: pctIn(lim.lsl), placeholder: "95", onchange: (e) => setLim("lsl", e.target.value) })),
        h("label.field", h("span", "USL (%)"), h("input", { type: "text", inputmode: "decimal", value: pctIn(lim.usl), placeholder: "102", onchange: (e) => setLim("usl", e.target.value) }))),
      c ? lineChart(pts.map((b, i) => ({ month: String(b["Batch no"]), v: xs[i], cl: c.mean, ucl: c.ucl, lcl: c.lcl, signals: c.signals[i] })), [{ key: "v", label: t(PARAMS.find(([k]) => k === key)[1]), color: "var(--c1)" }],
        { limits: true, pct: true, fmt: (v) => fmtPct(v, 1), xFmt: (x) => x, yMin: Math.max(0, Math.floor((Math.min(c.lcl, ...xs) - 0.01) * 50) / 50), yMax: Math.ceil((Math.max(c.ucl, ...xs) + 0.01) * 50) / 50 })
        : h("div.empty", t("apqr_stats_need"))),
    h("div.cap-panel",
      h("div.cap-big", h("small", "Cpk"), h("b", { style: { color: c?.cpk == null ? null : c.cpk >= 1.33 ? "var(--good-ink)" : c.cpk >= 1 ? "var(--warning-ink)" : "var(--critical-ink)" } }, c?.cpk != null ? fmtNum(c.cpk, 2) : "—")),
      h("dl.deflist.compact",
        h("dt", "n"), h("dd", c ? fmtNum(c.n) : "—"),
        h("dt", t("mean_lbl")), h("dd", c ? fmtPct(c.mean, 2) : "—"),
        h("dt", "σ (MR/1.128)"), h("dd", c ? `${fmtNum(c.sw * 100, 2)} pt` : "—"),
        h("dt", "σ overall"), h("dd", c ? `${fmtNum(c.sd * 100, 2)} pt` : "—"),
        h("dt", "Ppk"), h("dd", c?.ppk != null ? fmtNum(c.ppk, 2) : "—"),
        h("dt", "UCL / LCL"), h("dd", c ? `${fmtPct(c.ucl, 1)} / ${fmtPct(c.lcl, 1)}` : "—"),
        h("dt", t("apqr_signals")), h("dd", c ? (out ? h("b.late", fmtNum(out)) : h("span.good-text", "0")) : "—")),
      guide ? h("p", { class: `cap-verdict ${guide[0] >= 1.33 ? "ok" : guide[0] >= 1 ? "watch" : "bad"}` }, FR() ? guide[2] : guide[1]) : h("p.fine", t("apqr_enter_limits")),
      h("p.fine", t("apqr_stats_rules")))), { sub: t("apqr_stats_sub", fmtNum(pts.length)) });
}
