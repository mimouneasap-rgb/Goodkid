// 5S QA audits: programme dashboard, area profiles, risk-based audit schedule, findings tracker,
// audit history and the scored checklist form (area-specific checklists, 0–3 scale).
import { h, card, kpi, viewHeader, select, segmented, dataTable, fmtDate, fmtNum, fmtPct, esc } from "./ui.js";
import { hbars, stacks, donut, radar, ring, vbars, sparkline, legend } from "./charts.js";
import { t, tv, getLang } from "./i18n.js";
import { icon } from "./icons.js";
import * as M from "./model.js";
import { FIVES, FIVES_SCALE, VOCAB, PRIORITY_DAYS, fivesRating } from "./catalogs.js";
import { isoWeek, GENERIC_CHECKLIST } from "./domain.js";

const DAY = 86400000;
const ALL = M.ALL;
const FR = () => getLang() === "FR";
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const isoToday = () => new Date().toISOString().slice(0, 10);
const isoDay = (ts) => (ts == null ? null : new Date(ts).toISOString().slice(0, 10));
export const FIVES_COLOR = { sort: "var(--c1)", order: "var(--c3)", shine: "var(--c4)", standard: "var(--c7)", sustain: "var(--c2)" };
export const RATING_COLOR = { Excellent: "var(--good)", Good: "var(--c3)", Acceptable: "var(--warning)", "Needs improvement": "var(--critical)" };
const RISK_COLOR = { Critical: "var(--critical)", High: "var(--serious)", Medium: "var(--warning)", Low: "var(--c3)" };
const SCHED_COLOR = { Overdue: "var(--critical)", "Due ≤7 d": "var(--warning)", Scheduled: "var(--good)", "Never audited": "var(--c7)" };
const PRIO_COLOR = { Critical: "var(--critical)", High: "var(--serious)", Medium: "var(--warning)", Low: "var(--c1)" };
export const scoreColor = (v) => (v == null ? "var(--muted-mark)" : RATING_COLOR[fivesRating(v)]);
const sName = (key) => { const g = FIVES.find(([k]) => k === key); return g ? (FR() ? g[2] : g[1]) : key; };
const sShort = (key) => sName(key).split(" (")[0];
const dot = (color, label) => h("span.pill", { style: { "--dot": color ?? "var(--muted-mark)" } }, h("i"), label);
const weekKeys = (from, n) => Array.from({ length: n }, (_, i) => isoWeek(from + i * 7 * DAY));
const short = (s, n = 60) => (String(s ?? "").length > n ? String(s).slice(0, n - 1) + "…" : String(s ?? ""));

const TABS = [["dashboard", "fives_tab_dash"], ["areas", "fives_tab_areas"], ["schedule", "fives_tab_sched"], ["findings", "fives_tab_find"], ["audits", "fives_tab_audits"]];

export function fivesView(ctx) {
  const F = ctx.m.x.fivesX;
  const tab = TABS.some(([k]) => k === ctx.state.fivesTab) ? ctx.state.fivesTab : "dashboard";
  const body = { dashboard, areas: areasTab, schedule: scheduleTab, findings: findingsTab, audits: auditsTab }[tab](ctx, F);
  return h("div.view",
    viewHeader(t("fives_title"), t("fives_sub2"),
      segmented(TABS.map(([k, l]) => [k, t(l)]), tab, (v) => ctx.set("fivesTab", v), t("fives_title")),
      ctx.canEdit ? h("button.btn.primary", { type: "button", onclick: () => openAuditForm(ctx, null) }, icon("plus", 16), t("fives_start")) : null),
    F.areas.some((a) => !a.extra) ? null : h("div.banner.info", icon("sparkle", 18), h("span", t("fives_import_hint"), " ", ctx.canEdit ? h("button.link", { type: "button", onclick: () => ctx.openImport() }, t("update_data")) : null)),
    body);
}

// ---------- dashboard ----------
function dashboard(ctx, F) {
  const { m } = ctx;
  const A = F.audits, areas = F.areas.filter((a) => !a.extra || a.audits.length);
  const recent = A.filter((a) => a.date != null && a.date >= m.now - 84 * DAY && a.total != null);
  const before = A.filter((a) => a.date != null && a.date < m.now - 84 * DAY && a.date >= m.now - 168 * DAY && a.total != null);
  const avgRecent = avg(recent.map((a) => a.total));
  const perS = (xs) => FIVES.map(([k]) => avg(xs.map((a) => a.per[k]).filter((v) => v != null)));
  const open = F.findings.filter((f) => f.open);
  const due = areas.filter((a) => !a.extra);
  const onSchedule = due.filter((a) => a.status === "Scheduled" || a.status === "Due ≤7 d");
  const ranked = areas.filter((a) => a.score != null).sort((a, b) => b.score - a.score);
  const weeks = weekKeys(m.now - 15 * 7 * DAY, 16);
  const listAudits = (title, xs) => () => openAudits(ctx, title, xs);
  const listFindings = (title, xs) => () => openFindings(ctx, title, xs);
  // weakest criteria across the recent audits
  const crit = new Map();
  for (const a of recent) a.scores.forEach((v, i) => { if (v == null || isNaN(v)) return; const it = a.list[i]; if (!it) return; const k = `${a.areaKey}|${i}`; const c = crit.get(k) ?? { area: a.Area, it, xs: [], scale: a.scale }; c.xs.push(v / a.scale); crit.set(k, c); });
  const weakest = [...crit.values()].map((c) => ({ ...c, v: avg(c.xs) })).sort((a, b) => a.v - b.v).slice(0, 10);
  return [
    h("section.fives-hero",
      h("div.fives-hero-text",
        h("span.eyebrow", t("fives_programme")),
        h("div.fives-hero-score", h("b", avgRecent != null ? fmtPct(avgRecent) : "—"), avgRecent != null ? h("span.rating-chip", { style: { "--c": scoreColor(avgRecent) } }, tv(fivesRating(avgRecent))) : null),
        h("p", t("fives_hero_sub", fmtNum(recent.length), fmtNum(new Set(recent.map((a) => a.areaKey)).size), fmtNum(due.length))),
        h("div.hero-meta", A[0]?.date != null ? h("span.chip.chip-glass", `${t("fives_last")} ${fmtDate(A[0].date)} · ${A[0].Area}`) : null, h("span.chip.chip-glass", t("fives_scale_short")))),
      h("div.fives-rings", FIVES.map(([k]) => { const v = perS(recent)[FIVES.findIndex(([x]) => x === k)]; return h("div.hero-ring", ring(v ?? 0, { size: 78, color: v == null ? "rgba(255,255,255,.3)" : FIVES_COLOR[k] }), h("span", sShort(k))); }))),
    h("div.kpi-grid",
      kpi({ label: t("fives_audits_12w"), value: fmtNum(recent.length), hint: `${fmtNum(A.length)} ${t("total_lbl")}`, accent: "var(--c1)", onclick: listAudits(t("fives_audits_12w"), recent) }),
      kpi({ label: t("fives_avg12"), value: fmtPct(avgRecent), delta: avgRecent != null && before.length ? Math.round((avgRecent - avg(before.map((a) => a.total))) * 100) : null, deltaLabel: t("pts_vs_prev"), goodWhen: "up", status: avgRecent == null ? 0 : avgRecent >= 0.75 ? 3 : avgRecent >= 0.6 ? 2 : 1, hint: "≥ 75 %" }),
      kpi({ label: t("fives_sched_compliance"), value: due.length ? fmtPct(onSchedule.length / due.length) : "—", hint: `${fmtNum(onSchedule.length)} / ${fmtNum(due.length)} ${t("fives_areas_lbl")}`, status: !due.length ? 0 : onSchedule.length / due.length >= 0.9 ? 3 : onSchedule.length / due.length >= 0.75 ? 2 : 1 }),
      kpi({ label: t("fives_overdue_areas"), value: fmtNum(due.filter((a) => a.status === "Overdue").length), accent: "var(--critical)", onclick: () => ctx.set("fivesTab", "schedule") }),
      kpi({ label: t("fives_never"), value: fmtNum(due.filter((a) => a.status === "Never audited").length), accent: "var(--c7)", onclick: () => ctx.set("fivesTab", "schedule") }),
      kpi({ label: t("fives_open_findings"), value: fmtNum(open.length), hint: `${fmtNum(open.filter((f) => ["Critical", "High"].includes(f.Priority)).length)} ${t("fives_crit_high")}`, accent: "var(--warning)", onclick: listFindings(t("fives_open_findings"), open) }),
      kpi({ label: t("k_overdue"), value: fmtNum(open.filter((f) => f.overdue).length), status: open.some((f) => f.overdue) ? 1 : 3, onclick: listFindings(t("k_overdue"), open.filter((f) => f.overdue)) }),
      kpi({ label: t("fives_best"), value: ranked[0] ? fmtPct(ranked[0].score) : "—", hint: ranked[0]?.Area ?? "", accent: "var(--good)" }),
      kpi({ label: t("fives_lowest"), value: ranked.at(-1) ? fmtPct(ranked.at(-1).score) : "—", hint: ranked.at(-1)?.Area ?? "", accent: "var(--critical)" })),
    h("div.grid.cols-2",
      card(t("fives_weekly"), vbars(weeks.map((w) => { const xs = A.filter((a) => a.week === w && a.total != null); const v = avg(xs.map((a) => a.total)); return { label: w, short: w.slice(6), value: v, color: scoreColor(v), tip: `<div class="tip-row"><span>${esc(t("fives_audits"))}</span><b>${xs.length}</b></div>`, onclick: xs.length ? listAudits(w, xs) : null }; }), { target: 0.75, fmt: (v) => fmtPct(v), height: 190 }), { span: 2, sub: t("fives_weekly_sub2") }),
      card(t("fives_radar"), recent.length ? radar(FIVES.map(([k]) => sShort(k)), [
        { label: t("fives_last12"), color: "var(--c1)", values: perS(recent) },
        ...(before.length ? [{ label: t("fives_prev12"), color: "var(--ink-3)", values: perS(before), dash: true }] : []),
        { label: t("fives_target"), color: "var(--good)", values: FIVES.map(() => 0.75), dash: true },
      ]) : h("div.empty", t("no_data")), { sub: t("fives_radar_sub") }),
      card(t("fives_rating_mix"), donut(Object.keys(RATING_COLOR).map((r) => ({ label: tv(r), value: recent.filter((a) => a.rating === r).length, color: RATING_COLOR[r], onclick: listAudits(tv(r), recent.filter((a) => a.rating === r)) })), { sub: t("fives_audits") }), { sub: t("fives_rating_sub") }),
      card(t("fives_heat"), scoreHeat(ctx, areas), { span: 2, sub: t("fives_heat_sub2") }),
      card(t("fives_ranking"), ranked.length ? hbars(ranked.map((a) => ({ label: a.Area, sub: a.Risk ? tv(a.Risk) : null, value: Math.round(a.score * 1000) / 1000, color: scoreColor(a.score), onclick: () => openArea(ctx, a.key) })), { fmt: (v) => fmtPct(v), max: 1 }) : h("div.empty", t("no_data")), { sub: t("fives_ranking_sub") }),
      card(t("fives_schedule_status"), donut(Object.keys(SCHED_COLOR).map((s) => ({ label: tv(s), value: due.filter((a) => a.status === s).length, color: SCHED_COLOR[s], onclick: () => ctx.set("fivesTab", "schedule") })), { sub: t("fives_areas_lbl") })),
      card(t("fives_find_prio"), stacks(VOCAB.priorities.map((p) => ({ label: tv(p), parts: { open: F.findings.filter((f) => f.Priority === p && f.open && !f.overdue).length, od: F.findings.filter((f) => f.Priority === p && f.overdue).length, closed: F.findings.filter((f) => f.Priority === p && !f.open).length }, onclick: listFindings(tv(p), F.findings.filter((f) => f.Priority === p)) })),
        [{ key: "od", label: t("s_overdue"), color: "var(--critical)" }, { key: "open", label: t("s_open"), color: "var(--warning)" }, { key: "closed", label: t("closed_lbl"), color: "var(--good)" }])),
      card(t("fives_find_by_s"), hbars(FIVES.map(([k]) => ({ label: sName(k), value: open.filter((f) => f.key === k).length, color: FIVES_COLOR[k], onclick: listFindings(sName(k), open.filter((f) => f.key === k)) })))),
      card(t("fives_items"), weakest.length ? h("div.fives-items", weakest.map((c) => h("div.fi-row", h("span.fi-dot", { style: { background: FIVES_COLOR[c.it.key] ?? "var(--c1)" } }), h("span.fi-l", short(FR() && c.it.criterionFr ? c.it.criterionFr : c.it.criterion, 90), h("small", ` · ${c.area}`)), h("b", { style: { color: scoreColor(c.v) } }, fmtPct(c.v))))) : h("div.empty", t("no_data")), { span: 2, sub: t("fives_items_sub") })),
  ];
}

/** Area × S table coloured by score (latest audit of each area). */
function scoreHeat(ctx, areas) {
  const rows = areas.filter((a) => a.last);
  if (!rows.length) return h("div.empty", t("no_data"));
  const cell = (v) => h("td", { class: v == null ? "" : "on", style: { "--c": scoreColor(v) } }, v == null ? "·" : fmtPct(v));
  return h("div.matrix-wrap", h("table.score-heat",
    h("thead", h("tr", h("th", t("area_lbl")), FIVES.map(([k]) => h("th", sShort(k))), h("th", t("score_lbl")), h("th", t("fives_last")))),
    h("tbody", rows.sort((a, b) => (a.score ?? 0) - (b.score ?? 0)).map((a) => h("tr", { class: "clickable", onclick: () => openArea(ctx, a.key) },
      h("th", a.Area, a.Risk ? h("small", ` · ${tv(a.Risk)}`) : null), FIVES.map(([k]) => cell(a.last.per[k])), cell(a.score), h("td.muted", fmtDate(a.last.date)))))));
}

// ---------- areas ----------
function areasTab(ctx, F) {
  const f = ctx.state.fivesAreaF ?? {};
  const setF = (k, v) => ctx.set("fivesAreaF", { ...f, [k]: v });
  const L = F.areas.filter((a) => (!f.risk || f.risk === ALL || a.Risk === f.risk) && (!f.status || f.status === ALL || a.status === f.status));
  return [
    card(null, h("div.filters",
      select(t("fives_risk"), [[ALL, t("filter_all")], ...VOCAB.riskClasses.map((r) => [r, tv(r)])], f.risk ?? ALL, (v) => setF("risk", v)),
      select(t("col_status"), [[ALL, t("filter_all")], ...Object.keys(SCHED_COLOR).map((s) => [s, tv(s)])], f.status ?? ALL, (v) => setF("status", v))), { cls: "filter-card" }),
    L.length ? h("div.area-grid", L.map((a, i) => h("article.area-card", { style: { "--i": i, "--risk": RISK_COLOR[a.Risk] ?? "var(--muted-mark)" } },
      h("header",
        h("div", h("h3", a.Area), h("div.area-tags", a.Risk ? dot(RISK_COLOR[a.Risk], tv(a.Risk)) : null, h("span.tag", tv(a.frequency)), a.checklist !== GENERIC_CHECKLIST ? h("span.tag", `${a.checklist.length} ${t("fives_criteria")}`) : null)),
        h("div.area-ring", ring(a.score ?? 0, { size: 64, color: a.score == null ? "var(--muted-mark)" : scoreColor(a.score) }))),
      h("div.area-meta",
        h("span", a.rating ? h("b", { style: { color: scoreColor(a.score) } }, tv(a.rating)) : h("span.muted", t("fives_never_short"))),
        a.trend.filter((v) => v != null).length > 1 ? sparkline(a.trend.filter((v) => v != null), { color: scoreColor(a.score), w: 90, hgt: 24 }) : null),
      h("dl.area-dl",
        h("dt", t("fives_last")), h("dd", a.last?.date != null ? `${fmtDate(a.last.date)}${a.last.Auditor ? " · " + a.last.Auditor : ""}` : "—"),
        h("dt", t("next_due")), h("dd", dot(SCHED_COLOR[a.status], a.next != null ? `${tv(a.status)} · ${fmtDate(a.next)}` : tv(a.status))),
        a["Critical focus"] ? [h("dt", t("fives_focus")), h("dd", a["Critical focus"])] : null,
        a["Key equipment"] ? [h("dt", t("fives_equipment")), h("dd", a["Key equipment"])] : null),
      a.rooms.length ? h("div.chips", a.rooms.slice(0, 6).map((c) => h("span.tag.mono", c)), a.rooms.length > 6 ? h("span.tag", `+${a.rooms.length - 6}`) : null, a.roomsAuto ? h("small.muted", t("fives_rooms_auto")) : null) : null,
      h("footer",
        a.openFindings.length ? h("span.warn-text", `${fmtNum(a.openFindings.length)} ${t("fives_open_findings").toLowerCase()}`) : h("span.good-text", t("fives_no_open")),
        h("span.spacer"),
        h("button.btn.compact.ghost", { type: "button", onclick: () => openArea(ctx, a.key) }, t("details")),
        ctx.canEdit ? h("button.btn.compact", { type: "button", onclick: () => openAuditForm(ctx, null, a.Area) }, icon("plus", 14), t("audit_lbl")) : null)))) : h("div.empty", t("no_data")),
  ];
}

export function openArea(ctx, key) {
  ctx.open.drawer(() => {
    const { m } = ctx;
    const a = m.x.fivesX.areas.find((x) => x.key === key);
    if (!a) return h("p", t("none_found"));
    const [last, prev] = a.audits;
    const recs = m.records.filter((r) => r.isOpen && a.rooms.includes(r.roomCode));
    return [
      h("div.d-head",
        h("div.d-tags", a.Risk ? dot(RISK_COLOR[a.Risk], tv(a.Risk)) : null, h("span.tag", tv(a.frequency)), dot(SCHED_COLOR[a.status], tv(a.status)), a.rating ? dot(RATING_COLOR[a.rating], tv(a.rating)) : null),
        h("div.d-refrow", h("span.d-ref", a.Code ?? t("area_lbl")), h("span.row-btns",
          ctx.canEdit && a.__key ? h("button.btn.compact", { type: "button", onclick: () => ctx.edit("fivesAreas", a.__key, a.Area) }, icon("edit", 15), t("edit")) : null,
          ctx.canEdit ? h("button.btn.compact.primary", { type: "button", onclick: () => openAuditForm(ctx, null, a.Area) }, icon("plus", 15), t("audit_lbl")) : null)),
        h("h2", a.Area)),
      last ? h("div.area-top", radar(FIVES.map(([k]) => sShort(k)), [{ label: fmtDate(last.date), color: scoreColor(last.total), values: FIVES.map(([k]) => last.per[k]) }, ...(prev ? [{ label: fmtDate(prev.date), color: "var(--ink-3)", values: FIVES.map(([k]) => prev.per[k]), dash: true }] : [])], { size: 260 }),
        h("div.area-score", h("small", t("score_lbl")), h("b", { style: { color: scoreColor(last.total) } }, fmtPct(last.total)), h("span", tv(last.rating)), prev ? h("small.muted", `${t("fives_prev_audit")} ${fmtPct(prev.total)}`) : null)) : h("p.muted", t("fives_never_short")),
      h("dl.deflist", [[t("fives_equipment"), a["Key equipment"]], [t("fives_focus"), a["Critical focus"]], [t("fives_gmp"), a["GMP requirements"]], [t("fives_issues"), a["Common issues"]], [t("col_owner"), a.Owner], [t("next_due"), a.next != null ? fmtDate(a.next) : null]]
        .filter(([, v]) => v).flatMap(([k, v]) => [h("dt", k), h("dd", v)])),
      h("h3", `${t("fives_rooms")} ${a.roomsAuto && a.rooms.length ? `(${t("fives_rooms_auto")})` : ""}`),
      a.rooms.length ? h("div.chips", a.rooms.map((c) => h("button.link.mono", { type: "button", onclick: () => { ctx.closeDrawer(); ctx.go("rooms", { room: c }); } }, `${c} · ${m.roomByCode.get(c)?.Name ?? ""}`))) : h("p.muted", t("fives_no_rooms")),
      recs.length ? [h("h3", `${t("fives_qe_in_area")} · ${fmtNum(recs.length)}`), h("div.d-list", recs.slice(0, 12).map((r) => h("button.d-item", { type: "button", onclick: () => ctx.open.record(r.ref) }, h("span.type-tag", r.type === "Deviation" ? "DEV" : r.type === "CAPA" ? "CAPA" : r.type === "Audit Finding" ? "AF" : "CC"), h("span.d-item-t", h("b", r.ref), h("span", r.title)), dot(r.overdue ? "var(--critical)" : "var(--c1)", tv(r.overdue ? "Overdue" : r.status)))))] : null,
      a.openFindings.length ? [h("h3", `${t("fives_open_findings")} · ${fmtNum(a.openFindings.length)}`), findingList(ctx, a.openFindings)] : null,
      a.audits.length ? [h("h3", `${t("fives_audits")} · ${fmtNum(a.audits.length)}`), h("div.d-list", a.audits.slice(0, 12).map((x) => h("button.d-item", { type: "button", onclick: () => openAudit(ctx, x["Audit ID"]) }, h("span.score-chip", { style: { "--c": scoreColor(x.total) } }, fmtPct(x.total)), h("span.d-item-t", h("b", fmtDate(x.date)), h("span", [x.Auditor, x.week].filter(Boolean).join(" · "))), dot(RATING_COLOR[x.rating], tv(x.rating)))))] : null,
      h("details.d-form", h("summary", `${t("fives_checklist")} · ${a.checklist.length} ${t("fives_criteria")}`), checklistPreview(a.checklist)),
    ];
  });
}
function checklistPreview(list) {
  return h("div.checklist-preview", FIVES.map(([k]) => {
    const xs = list.filter((it) => it.key === k);
    return xs.length ? h("div", h("b", { style: { color: FIVES_COLOR[k] } }, sName(k)), h("ol", { start: xs[0].no ?? 1 }, xs.map((it) => h("li", FR() && it.criterionFr ? it.criterionFr : it.criterion)))) : null;
  }));
}

// ---------- schedule ----------
function scheduleTab(ctx, F) {
  const { m } = ctx;
  const areas = [...F.areas].sort((a, b) => ["Overdue", "Never audited", "Due ≤7 d", "Scheduled"].indexOf(a.status) - ["Overdue", "Never audited", "Due ≤7 d", "Scheduled"].indexOf(b.status) || (a.next ?? 0) - (b.next ?? 0));
  const start = m.now - 4 * 7 * DAY;
  const weeks = weekKeys(start, 13);
  const thisWeek = isoWeek(m.now);
  const planned = (a) => {
    const out = new Set();
    let next = a.next != null && a.next >= m.now ? a.next : m.now; // overdue or never audited: due now
    for (let i = 0; i < 20 && next < start + 13 * 7 * DAY; i++) { out.add(isoWeek(next)); next += a.days * DAY; }
    return out;
  };
  const dueNow = areas.filter((a) => ["Overdue", "Never audited", "Due ≤7 d"].includes(a.status));
  return [
    h("div.kpi-grid.six",
      Object.keys(SCHED_COLOR).map((s) => kpi({ label: tv(s), value: fmtNum(areas.filter((a) => a.status === s).length), accent: SCHED_COLOR[s] })),
      kpi({ label: t("fives_due_this_week"), value: fmtNum(dueNow.length), hint: thisWeek })),
    card(t("fives_plan_grid"), h("div",
      legend([{ label: t("fives_done"), color: "var(--good)" }, { label: t("fives_planned"), color: "var(--c1)" }, { label: tv("Overdue"), color: "var(--critical)" }]),
      h("div.matrix-wrap", h("table.sched-grid",
        h("thead", h("tr", h("th", t("area_lbl")), h("th", t("fives_freq")), weeks.map((w) => h("th", { class: w === thisWeek ? "now" : "" }, w.slice(6))))),
        h("tbody", areas.map((a) => {
          const plan = planned(a);
          return h("tr",
            h("th", h("button.link", { type: "button", onclick: () => openArea(ctx, a.key) }, a.Area), a.Risk ? h("small", ` · ${tv(a.Risk)}`) : null),
            h("td.muted.nowrap", tv(a.frequency)),
            weeks.map((w) => {
              const done = a.audits.filter((x) => x.week === w);
              const isPlan = plan.has(w);
              const late = isPlan && w === thisWeek && (a.status === "Overdue" || a.status === "Never audited");
              const cls = done.length ? "sg-done" : late ? "sg-late" : isPlan ? "sg-plan" : "";
              return h("td", { class: [cls, w === thisWeek ? "now" : ""].filter(Boolean).join(" ") || null, "data-tip": done.length ? `<b>${esc(a.Area)}</b><div class="tip-row"><span>${w}</span><b>${fmtPct(done[0].total)}</b></div>` : isPlan ? `<b>${esc(a.Area)}</b><div class="tip-row"><span>${w}</span><b>${esc(t("fives_planned"))}</b></div>` : null,
                onclick: done.length ? () => openAudit(ctx, done[0]["Audit ID"]) : isPlan && ctx.canEdit ? () => openAuditForm(ctx, null, a.Area) : null },
              done.length ? h("i", { style: { background: scoreColor(done[0].total) } }) : isPlan ? h("i") : null);
            }));
        }))))), { sub: t("fives_plan_grid_sub") }),
    card(t("fives_due_list"), dueNow.length ? dataTable([
      { key: "Area", label: t("area_lbl"), render: (a) => h("b", a.Area) }, { key: "Risk", label: t("fives_risk"), render: (a) => (a.Risk ? dot(RISK_COLOR[a.Risk], tv(a.Risk)) : "—") },
      { key: "frequency", label: t("fives_freq"), render: (a) => tv(a.frequency) }, { key: "last", label: t("fives_last"), cls: "num nowrap", sort: (a) => a.last?.date, render: (a) => fmtDate(a.last?.date) },
      { key: "next", label: t("next_due"), cls: "num nowrap", render: (a) => (a.status === "Overdue" ? h("b.late", fmtDate(a.next)) : fmtDate(a.next)) }, { key: "status", label: t("col_status"), render: (a) => dot(SCHED_COLOR[a.status], tv(a.status)) },
      { key: "act", label: "", render: (a) => (ctx.canEdit ? h("button.btn.compact", { type: "button", onclick: (e) => { e.stopPropagation(); openAuditForm(ctx, null, a.Area); } }, icon("plus", 14), t("audit_lbl")) : null) },
    ], dueNow, { search: false, pageSize: 25, onRow: (a) => openArea(ctx, a.key) }) : h("p.ok-line", icon("check", 14), t("fives_all_in_date"))),
  ];
}

// ---------- findings ----------
function findingCols(ctx) {
  return [
    { key: "Audit ID", label: t("col_id"), cls: "mono nowrap" },
    { key: "Area", label: t("area_lbl") },
    { key: "key", label: "5S", render: (f) => (f.key ? h("span.s-chip", { style: { "--c": FIVES_COLOR[f.key] } }, sShort(f.key)) : f.Category) },
    { key: "Criterion", label: t("fives_criterion"), cls: "wrap", render: (f) => short(f.Criterion, 110) },
    { key: "score", label: t("score_lbl"), cls: "num", render: (f) => (f.score == null ? "—" : h("span.score-chip", { style: { "--c": f.score === 0 ? "var(--critical)" : "var(--warning)" } }, f.score)) },
    { key: "Action", label: t("action"), cls: "wrap", render: (f) => f.Action || f.Comment || "" },
    { key: "Priority", label: t("priority_lbl"), render: (f) => (f.Priority ? dot(PRIO_COLOR[f.Priority], tv(f.Priority)) : "—") },
    { key: "Owner", label: t("col_owner") },
    { key: "due", label: t("col_due"), cls: "num nowrap", render: (f) => (f.overdue ? h("b.late", fmtDate(f.due)) : fmtDate(f.due)) },
    { key: "status", label: t("col_status"), sort: (f) => (f.open ? (f.overdue ? 0 : 1) : 2), render: (f) => dot(!f.open ? "var(--good)" : f.overdue ? "var(--critical)" : "var(--warning)", !f.open ? `${tv("Closed")} ${fmtDate(f.closedOn)}` : f.overdue ? tv("Overdue") : tv(f.Status || "Open")) },
    { key: "act", label: "", render: (f) => (ctx.canEdit && f.open && f.__key ? h("button.btn.compact", { type: "button", title: t("close_action"), onclick: (e) => { e.stopPropagation(); ctx.update("fivesItems", f.__key, { Status: "Closed", "Closed on": isoToday() }); } }, icon("check", 14)) : null) },
  ];
}
function findingList(ctx, xs) {
  return dataTable(findingCols(ctx).filter((c) => !["Audit ID", "Area"].includes(c.key)), xs, { search: false, pageSize: 10, onRow: ctx.canEdit ? (f) => f.__key && ctx.edit("fivesItems", f.__key, short(f.Criterion, 60)) : null });
}
function findingsTab(ctx, F) {
  const f = ctx.state.fivesFindF ?? { status: "open" };
  const setF = (k, v) => ctx.set("fivesFindF", { ...f, [k]: v });
  const L = F.findings.filter((x) => (f.status === "all" || (f.status === "closed" ? !x.open : f.status === "overdue" ? x.overdue : x.open))
    && (!f.prio || f.prio === ALL || x.Priority === f.prio) && (!f.area || f.area === ALL || x.areaKey === f.area) && (!f.s || f.s === ALL || x.key === f.s));
  const closed = F.findings.filter((x) => !x.open && x.closedOn != null && x.due != null);
  return [
    card(null, h("div.filters",
      select(t("col_status"), [["open", tv("Open")], ["overdue", tv("Overdue")], ["closed", tv("Closed")], ["all", t("filter_all")]], f.status ?? "open", (v) => setF("status", v)),
      select(t("priority_lbl"), [[ALL, t("filter_all")], ...VOCAB.priorities.map((p) => [p, tv(p)])], f.prio ?? ALL, (v) => setF("prio", v)),
      select(t("area_lbl"), [[ALL, t("filter_all")], ...F.areas.map((a) => [a.key, a.Area])], f.area ?? ALL, (v) => setF("area", v)),
      select("5S", [[ALL, t("filter_all")], ...FIVES.map(([k]) => [k, sName(k)])], f.s ?? ALL, (v) => setF("s", v))), { cls: "filter-card" }),
    h("div.kpi-grid.six",
      kpi({ label: t("fives_findings_total"), value: fmtNum(F.findings.length), accent: "var(--c1)" }),
      kpi({ label: t("s_open"), value: fmtNum(F.findings.filter((x) => x.open).length), accent: "var(--warning)" }),
      kpi({ label: t("k_overdue"), value: fmtNum(F.findings.filter((x) => x.overdue).length), accent: "var(--critical)" }),
      kpi({ label: t("fives_k_crit_high"), value: fmtNum(F.findings.filter((x) => x.open && ["Critical", "High"].includes(x.Priority)).length), accent: "var(--serious)" }),
      kpi({ label: t("closed_lbl"), value: fmtNum(F.findings.filter((x) => !x.open).length), accent: "var(--good)" }),
      kpi({ label: t("ontime_closure"), value: closed.length ? fmtPct(closed.filter((x) => x.closedOn <= x.due).length / closed.length) : "—" })),
    card(`${t("fives_findings")} · ${fmtNum(L.length)}`, L.length ? dataTable(findingCols(ctx), [...L].sort((a, b) => (b.overdue - a.overdue) || ["Critical", "High", "Medium", "Low"].indexOf(a.Priority) - ["Critical", "High", "Medium", "Low"].indexOf(b.Priority) || (a.due ?? 9e15) - (b.due ?? 9e15)),
      { pageSize: 25, onRow: ctx.canEdit ? (x) => x.__key && ctx.edit("fivesItems", x.__key, short(x.Criterion, 60)) : null, exportName: "5s-findings" }) : h("p.ok-line", icon("check", 14), t("none_found")), { sub: t("fives_findings_sub") }),
  ];
}
function openFindings(ctx, title, xs) {
  ctx.open.drawer(() => [h("div.d-head", h("span.d-ref", `${fmtNum(xs.length)} ${t("rows")}`), h("h2", title)), dataTable(findingCols(ctx), xs, { pageSize: 30, onRow: ctx.canEdit ? (x) => x.__key && ctx.edit("fivesItems", x.__key, short(x.Criterion, 60)) : null })]);
}

// ---------- audits ----------
function auditCols() {
  return [
    { key: "Audit ID", label: t("col_id"), cls: "mono nowrap" }, { key: "week", label: t("week_lbl"), cls: "mono" }, { key: "date", label: t("col_date"), cls: "num nowrap", render: (a) => fmtDate(a.date) },
    { key: "Area", label: t("area_lbl"), cls: "wrap" }, { key: "Auditor", label: t("auditor_lbl") },
    { key: "total", label: t("score_lbl"), cls: "num", render: (a) => h("span.score-chip", { style: { "--c": scoreColor(a.total) } }, fmtPct(a.total)) },
    { key: "rating", label: t("fives_rating"), render: (a) => (a.rating ? dot(RATING_COLOR[a.rating], tv(a.rating)) : "—") },
    ...FIVES.map(([k]) => ({ key: k, label: sShort(k), cls: "num", sort: (a) => a.per[k], render: (a) => fmtPct(a.per[k]) })),
    { key: "answered", label: t("fives_items_scored"), cls: "num", render: (a) => `${a.answered}/${a.list.length}` },
  ];
}
function auditsTab(ctx, F) {
  return [card(`${t("fives_audits")} · ${fmtNum(F.audits.length)}`, F.audits.length ? dataTable(auditCols(), F.audits, { pageSize: 25, onRow: (a) => openAudit(ctx, a["Audit ID"]), exportName: "5s-audits" }) : h("div.empty", t("fives_empty")))];
}
function openAudits(ctx, title, xs) {
  ctx.open.drawer(() => [h("div.d-head", h("span.d-ref", `${fmtNum(xs.length)} ${t("rows")}`), h("h2", title)), dataTable(auditCols().slice(0, 7), xs, { pageSize: 30, onRow: (a) => openAudit(ctx, a["Audit ID"]) })]);
}
export function openAudit(ctx, id) {
  ctx.open.drawer(() => {
    const F = ctx.m.x.fivesX;
    const a = F.audits.find((x) => x["Audit ID"] === id);
    if (!a) return h("p", t("none_found"));
    const fs = F.findings.filter((x) => x["Audit ID"] === id);
    return [
      h("div.d-head",
        h("div.d-tags", h("span.tag", a.week), a.rating ? dot(RATING_COLOR[a.rating], tv(a.rating)) : null, h("span.tag", a.list === GENERIC_CHECKLIST ? t("fives_generic") : `${a.list.length} ${t("fives_criteria")}`)),
        h("div.d-refrow", h("span.d-ref", a["Audit ID"]), ctx.canEdit ? h("span.row-btns", h("button.btn.compact", { type: "button", onclick: () => openAuditForm(ctx, a) }, icon("edit", 15), t("fives_edit_scores")), a.__key ? h("button.btn.compact.ghost", { type: "button", onclick: () => ctx.edit("fives", a.__key, a["Audit ID"]) }, t("edit_raw")) : null) : null),
        h("h2", a.Area),
        h("p.fine", [fmtDate(a.date), a.Auditor, a.Supervisor ? `${t("fives_supervisor")}: ${a.Supervisor}` : null].filter(Boolean).join(" · "))),
      h("div.area-top", radar(FIVES.map(([k]) => sShort(k)), [{ label: a["Audit ID"], color: scoreColor(a.total), values: FIVES.map(([k]) => a.per[k]) }], { size: 240 }),
        h("div.area-score", h("small", t("score_lbl")), h("b", { style: { color: scoreColor(a.total) } }, fmtPct(a.total)), h("span", tv(a.rating)), h("small.muted", `${a.answered}/${a.list.length} ${t("fives_items_scored").toLowerCase()} · 0–${a.scale}`))),
      fs.length ? [h("h3", `${t("fives_findings")} · ${fmtNum(fs.length)}`), findingList(ctx, fs)] : null,
      h("h3", t("fives_checklist")),
      h("div.audit-items", FIVES.map(([k]) => {
        const idx = a.list.map((it, i) => [it, i]).filter(([it]) => it.key === k);
        return idx.length ? h("section", h("header", h("b", { style: { color: FIVES_COLOR[k] } }, sName(k)), h("span", fmtPct(a.per[k]))),
          idx.map(([it, i]) => h("div.audit-item", h("span.score-chip", { style: { "--c": a.scores[i] == null ? "var(--muted-mark)" : a.scores[i] / a.scale >= 0.66 ? "var(--good)" : a.scores[i] / a.scale >= 0.33 ? "var(--warning)" : "var(--critical)" } }, a.scores[i] ?? "—"), h("span", FR() && it.criterionFr ? it.criterionFr : it.criterion)))) : null;
      })),
    ];
  });
}

// ---------- audit form ----------
/** Scored checklist for one audit: new (area optional) or an existing audit to review / correct. */
export function openAuditForm(ctx, existing, presetArea) {
  const F = ctx.m.x.fivesX;
  const areaNames = F.areas.filter((a) => !a.extra).map((a) => a.Area);
  const st = {
    area: existing?.Area ?? presetArea ?? areaNames[0] ?? "",
    scores: existing ? [...existing.scores] : null,
    notes: new Map(F.findings.filter((x) => existing && x["Audit ID"] === existing["Audit ID"]).map((x) => [+x.No, { comment: x.Comment ?? "", action: x.Action ?? "", prio: x.Priority ?? "", due: x.Due ?? "", owner: x.Owner ?? "", existing: x }])),
  };
  const content = () => {
    const list = () => (existing ? existing.list : F.checklistOf(st.area));
    const totalEl = h("b.fives-total"), ratingEl = h("span.rating-chip"), countEl = h("small");
    const perEls = Object.fromEntries(FIVES.map(([k]) => [k, h("b")]));
    const scale = existing?.scale ?? 3;
    const recalc = () => {
      const L = list();
      const vals = st.scores.filter((v) => v != null && v !== "-" && !isNaN(v));
      const tot = vals.length ? vals.reduce((a, b) => a + b, 0) / (scale * vals.length) : null;
      totalEl.textContent = fmtPct(tot); totalEl.style.color = scoreColor(tot);
      ratingEl.textContent = tot == null ? "—" : tv(fivesRating(tot)); ratingEl.style.setProperty("--c", scoreColor(tot));
      countEl.textContent = `${st.scores.filter((v) => v !== undefined).length}/${L.length} ${t("fives_items_scored").toLowerCase()}`;
      for (const [k] of FIVES) {
        const xs = st.scores.filter((v, i) => L[i]?.key === k && v != null && v !== "-" && !isNaN(v));
        perEls[k].textContent = xs.length ? fmtPct(xs.reduce((a, b) => a + b, 0) / (scale * xs.length)) : "—";
      }
    };
    const noteFor = (no, score) => {
      if (!st.notes.has(no)) st.notes.set(no, { comment: "", action: "", prio: score === 0 ? "High" : "Medium", due: "", owner: "" });
      return st.notes.get(no);
    };
    const dueFrom = (prio, date) => { const d = M.toDay(date) ?? Date.now(); return isoDay(d + (PRIORITY_DAYS[prio] ?? 30) * DAY); };
    const itemRow = (it, i) => {
      const no = it.no ?? i + 1;
      const extra = h("div.fives-note");
      const drawNote = () => {
        const v = st.scores[i];
        if (!(typeof v === "number" && v <= 1)) { extra.replaceChildren(); return; }
        const n = noteFor(no, v);
        if (!n.due) n.due = dueFrom(n.prio, dateIn.value);
        const dueIn = h("input", { type: "date", value: n.due, onchange: (e) => { n.due = e.target.value; } });
        extra.replaceChildren(
          h("input", { placeholder: t("comment"), value: n.comment, oninput: (e) => { n.comment = e.target.value; } }),
          h("input", { placeholder: t("fives_action_ph"), value: n.action, oninput: (e) => { n.action = e.target.value; } }),
          h("select", { "aria-label": t("priority_lbl"), onchange: (e) => { n.prio = e.target.value; n.due = dueFrom(n.prio, dateIn.value); dueIn.value = n.due; } }, VOCAB.priorities.map((p) => h("option", { value: p, selected: n.prio === p ? true : null }, tv(p)))),
          h("input", { placeholder: t("col_owner"), value: n.owner, list: "fives-owners", oninput: (e) => { n.owner = e.target.value; } }),
          dueIn);
      };
      const opts = [...FIVES_SCALE.map(([v, en, fr]) => [String(v), String(v), FR() ? fr : en]), ["-", "N/A", t("fives_na")]].filter(([v]) => v === "-" || +v <= scale);
      const row = h("div.fives-item",
        h("span.fives-no", no),
        h("span.fives-q", FR() && it.criterionFr ? it.criterionFr : it.criterion),
        h("div.fives-opts", { role: "radiogroup", "aria-label": it.criterion }, opts.map(([v, l, title]) => h("label.fives-opt", { class: `o${v === "-" ? "na" : v}`, title },
          h("input", { type: "radio", name: `s${i}`, value: v, checked: (v === "-" ? st.scores[i] === null : String(st.scores[i]) === v) ? true : null,
            onchange: () => { st.scores[i] = v === "-" ? null : +v; recalc(); drawNote(); updateGroups(); } }),
          h("span", l)))),
        extra);
      drawNote();
      return row;
    };
    const groups = [];
    const updateGroups = () => groups.forEach((g) => g());
    const checklist = h("div.fives-checklist");
    const drawChecklist = () => {
      const L = list();
      if (!st.scores || st.scores.length !== L.length) st.scores = L.map(() => undefined);
      groups.length = 0;
      checklist.replaceChildren(...FIVES.map(([k], gi) => {
        const idx = L.map((it, i) => [it, i]).filter(([it]) => it.key === k);
        if (!idx.length) return null;
        const prog = h("small.fives-prog");
        groups.push(() => { prog.textContent = `${idx.filter(([, i]) => st.scores[i] !== undefined).length}/${idx.length}`; });
        return h("details.fives-group", { open: gi === 0 || existing ? true : null, style: { "--c": FIVES_COLOR[k] } },
          h("summary", h("span", sName(k)), perEls[k], prog,
            h("button.btn.compact.ghost", { type: "button", title: t("fives_fill_hint"), onclick: (e) => { e.preventDefault(); idx.forEach(([, i]) => { if (st.scores[i] === undefined) st.scores[i] = 2; }); drawChecklist(); recalc(); } }, t("fives_fill_2"))),
          idx.map(([it, i]) => itemRow(it, i)));
      }));
      updateGroups();
      recalc();
    };
    const rooms = ctx.m.rooms.map((r) => `${r.Code} · ${r.Name}`);
    const users = [...new Set([...F.audits.map((x) => x.Auditor), ...ctx.m.records.map((r) => r.owner)].filter(Boolean))];
    const dateIn = h("input", { type: "date", required: true, value: existing?.date != null ? isoDay(existing.date) : isoToday() });
    const auditorIn = h("input", { list: "fives-users", value: existing?.Auditor ?? "" });
    const supIn = h("input", { list: "fives-users", value: existing?.Supervisor ?? "" });
    const areaSel = existing ? h("input", { value: existing.Area, disabled: true }) : h("select", {
      onchange: (e) => { st.area = e.target.value; st.scores = null; st.notes = new Map(); otherIn.hidden = st.area !== "__other"; drawChecklist(); },
    }, areaNames.map((a) => h("option", { value: a, selected: a === st.area ? true : null }, a)), h("option", { value: "__other", selected: areaNames.length && !areaNames.includes(st.area) ? true : null }, t("fives_other_area")));
    const otherIn = h("input", { list: "fives-rooms", placeholder: t("fives_other_ph"), hidden: !existing && areaNames.includes(st.area) ? true : null, value: !existing && !areaNames.includes(st.area) ? st.area : "" });
    if (!existing && !areaNames.length) { st.area = "__other"; otherIn.hidden = false; }
    const comment = h("textarea", { rows: 2 }, existing?.Comment ?? "");
    const msg = h("p.form-msg", { role: "status" });
    const save = async (e) => {
      e.preventDefault();
      const L = list();
      const answered = st.scores.filter((v) => v !== undefined).length;
      if (!answered) { msg.className = "form-msg warn-text"; msg.textContent = t("fives_need_score"); return; }
      const area = existing ? existing.Area : st.area === "__other" ? otherIn.value.trim() : st.area;
      if (!area) { msg.className = "form-msg warn-text"; msg.textContent = t("fives_need_area"); return; }
      const ts = M.toDay(dateIn.value);
      const year = new Date(ts ?? ctx.m.now).getUTCFullYear();
      const ids = F.audits.map((x) => x["Audit ID"]).filter(Boolean);
      const n = Math.max(0, ...ids.filter((x) => String(x).startsWith(`5S-${year}-`)).map((x) => +String(x).split("-").pop() || 0)) + 1;
      const id = existing?.["Audit ID"] ?? `5S-${year}-${String(n).padStart(3, "0")}`;
      const vals = st.scores.filter((v) => v != null && v !== "-" && !isNaN(v));
      const tot = vals.length ? vals.reduce((a, b) => a + b, 0) / (scale * vals.length) : null;
      const findings = L.map((it, i) => [it, i]).filter(([it, i]) => (typeof st.scores[i] === "number" && st.scores[i] <= 1) || st.notes.get(it.no ?? i + 1)?.action);
      const obj = {
        "Audit ID": id, Week: ts != null ? isoWeek(ts) : "", Date: dateIn.value, Area: area, Auditor: auditorIn.value.trim() || null, Supervisor: supIn.value.trim() || null,
        Checklist: existing?.Checklist ?? (L === GENERIC_CHECKLIST ? null : area), Scale: scale, Scores: st.scores.map((v) => (v === undefined ? "" : v === null ? "-" : v)).join(","),
        Findings: findings.length ? `${findings.length} · ${tv(fivesRating(tot))}` : null, Comment: comment.value.trim() || null,
      };
      msg.className = "form-msg"; msg.textContent = t("saving");
      try {
        await ctx.saveObj("fives", existing?.__key ?? null, obj, true);
        for (const [it, i] of findings) {
          const no = it.no ?? i + 1;
          const nt = st.notes.get(no) ?? { prio: st.scores[i] === 0 ? "High" : "Medium" };
          const row = { "Audit ID": id, Area: area, No: no, Category: it.category, Criterion: it.criterion, Score: st.scores[i], Comment: nt.comment || null, Action: nt.action || null,
            Priority: nt.prio || null, Owner: nt.owner || null, Due: nt.due || dueFrom(nt.prio, dateIn.value), Status: nt.existing?.Status ?? "Open" };
          await ctx.saveObj("fivesItems", nt.existing?.__key ?? null, row, true);
        }
        ctx.toast(t("fives_saved", fmtPct(tot), fmtNum(findings.length)));
        ctx.closeDrawer();
      } catch (err) { msg.className = "form-msg warn-text"; msg.textContent = err.message ?? String(err); }
    };
    drawChecklist();
    return [
      h("div.d-head", h("span.d-ref", existing?.["Audit ID"] ?? t("fives_new")), h("h2", t("fives_form_title2")), h("p.fine", t("fives_form_sub2"))),
      h("form.row-form.fives-form", { onsubmit: save },
        h("datalist", { id: "fives-rooms" }, rooms.map((v) => h("option", { value: v }))),
        h("datalist", { id: "fives-users" }, users.map((v) => h("option", { value: v }))),
        h("datalist", { id: "fives-owners" }, [...VOCAB.owners, ...users].map((v) => h("option", { value: v }))),
        h("div.form-grid",
          h("label.field.wide", h("span", t("area_lbl")), areaSel, otherIn),
          h("label.field", h("span", t("auditor_lbl")), auditorIn),
          h("label.field", h("span", t("fives_supervisor")), supIn),
          h("label.field", h("span", t("col_date")), dateIn)),
        h("div.fives-legend", FIVES_SCALE.filter(([v]) => v <= scale).map(([v, en, fr]) => h("span", h("b", v), ` ${FR() ? fr : en}`)), h("span", h("b", "N/A"), ` ${t("fives_na")}`)),
        checklist,
        h("label.field.wide", h("span", t("comment")), comment),
        msg,
        h("div.fives-footer",
          h("div.fives-score", t("score_lbl"), " ", totalEl, ratingEl, countEl),
          h("span.spacer"),
          h("button.btn.ghost", { type: "button", onclick: () => ctx.closeDrawer() }, t("cancel")),
          ctx.canEdit ? h("button.btn.primary", { type: "submit" }, icon("check", 15), t("save")) : null)),
    ];
  };
  ctx.open.drawer(content, { form: true });
}
