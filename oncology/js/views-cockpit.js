// Cockpit: everything due across the site in one place — overdue first, then this week, this month and this quarter —
// with who carries it and which module it belongs to; each line opens its record or page.
import { h, card, kpi, viewHeader, select, segmented, dataTable, fmtDate, fmtNum } from "./ui.js";
import { vbars, stacks } from "./charts.js";
import { t, tv } from "./i18n.js";
import { icon } from "./icons.js";
import { dueItems, loadBy, BUCKETS, MODULES } from "./cockpit.js";

const ALL = "__all";
const DAY = 86400000;
export const BUCKET_COLOR = { overdue: "var(--critical)", week: "var(--warning)", month: "var(--c7)", quarter: "var(--c1)" };
const MOD_ICON = { review: "review", records: "deviation", actions: "tasks", sop: "sop", sopReview: "review", calibration: "thermo", validation: "badge", training: "cap", apqr: "report", fives: "sparkle",
  activities: "calendar", suppliers: "truck", documents: "layers", wip: "layers", fmea: "fmea", improvements: "improve" };
const modName = (k) => t(`ck_m_${k}`);
const when = (it) => (it.days < 0 ? t("ck_late", fmtNum(-it.days)) : it.days === 0 ? t("ck_today") : t("ck_in", fmtNum(it.days)));

/** Open what a line is about: its record or action drawer, else its page. */
export function openItem(ctx, it) {
  if (it.open?.kind === "record") return ctx.open.record(it.open.ref);
  if (it.open?.kind === "action") return ctx.open.action(it.open.ref);
  if (it.link?.state) for (const [k, v] of Object.entries(it.link.state)) ctx.state[k] = v;
  return ctx.go(it.link?.route ?? "home", it.link?.params ?? {});
}

export function cockpitView(ctx) {
  const now = ctx.m.now;
  const f = ctx.state.ckF ?? {};
  const setF = (k, v) => ctx.set("ckF", { ...f, [k]: v });
  const horizon = +(f.horizon ?? 90);
  const all = dueItems(ctx.m, now, { horizon });
  const qx = String(f.q ?? "").trim().toLowerCase();
  const pick = (it, skip) => (skip === "mod" || !f.mod || f.mod === ALL || it.mod === f.mod) && (skip === "owner" || !f.owner || f.owner === ALL || (it.owner || "—") === f.owner)
    && (skip === "dept" || !f.dept || f.dept === ALL || (it.dept || "—") === f.dept) && (skip === "bucket" || !f.bucket || f.bucket === ALL || it.bucket === f.bucket)
    && (!qx || `${it.id} ${it.title} ${it.owner ?? ""} ${it.dept ?? ""} ${it.kind}`.toLowerCase().includes(qx));
  const F = all.filter((it) => pick(it));
  const nb = (b) => all.filter((it) => pick(it, "bucket") && it.bucket === b).length;
  const mods = MODULES.filter((k) => all.some((it) => it.mod === k));
  const owners = loadBy(all.filter((it) => pick(it, "owner")), (it) => it.owner);
  const depts = loadBy(all.filter((it) => pick(it, "dept")), (it) => it.dept);
  // the next 13 weeks, overdue gathered in the first bar
  const weeks = Array.from({ length: 13 }, (_, i) => ({ i, from: now + i * 7 * DAY }));
  const wk = weeks.map(({ i, from }) => ({ label: i === 0 ? t("ck_this_week") : fmtDate(from), short: i % 2 ? "" : fmtDate(from).slice(0, 5),
    value: F.filter((it) => (i === 0 ? it.due < from + 7 * DAY : it.due >= from && it.due < from + 7 * DAY)).length,
    color: i === 0 && F.some((it) => it.bucket === "overdue") ? "var(--critical)" : "var(--c1)" }));
  const groups = BUCKETS.map((b) => [b, F.filter((it) => it.bucket === b)]).filter(([, xs]) => xs.length);
  const show = +(f.show ?? 15);
  const line = (it) => h("button.ck-line", { type: "button", style: { "--c": BUCKET_COLOR[it.bucket] }, onclick: () => openItem(ctx, it) },
    h("span.ck-when", h("b", fmtDate(it.due)), h("small", when(it))),
    h("span.ck-ic", { title: modName(it.mod) }, icon(MOD_ICON[it.mod] ?? "records", 16)),
    h("span.ck-main", h("span.ck-top", h("b.mono", it.id), h("span.tag", tv(it.kind))), h("span.ck-title", it.title || "—")),
    h("span.ck-who", it.owner ? h("b", it.owner) : h("span.muted", t("ck_no_owner")), it.dept ? h("small", it.dept) : null),
    h("span.ck-go", icon("chevron", 15)));
  return h("div.view",
    viewHeader(t("ck_title"), t("ck_sub"), h("div.field", segmented([["30", "30 d"], ["90", "90 d"], ["365", "1 y"]], String(horizon), (v) => setF("horizon", v), t("ck_horizon")))),
    h("div.kpi-grid",
      BUCKETS.map((b) => kpi({ label: t(`ck_b_${b}`), value: fmtNum(nb(b)), accent: BUCKET_COLOR[b], status: b === "overdue" ? (nb(b) ? 1 : 3) : undefined, hint: t(`ck_b_${b}_h`),
        onclick: () => setF("bucket", f.bucket === b ? ALL : b) }))),
    h("div.grid.cols-3",
      card(t("ck_c_weeks"), vbars(wk, { height: 130 }), { sub: t("ck_c_weeks_sub"), span: 2 }),
      card(t("ck_c_mods"), stacks(mods.map((k) => ({ label: modName(k), parts: Object.fromEntries(BUCKETS.map((b) => [b, F.filter((it) => it.mod === k && it.bucket === b).length])), onclick: () => setF("mod", f.mod === k ? ALL : k) }))
        .filter((r) => Object.values(r.parts).some(Boolean)), BUCKETS.map((b) => ({ key: b, label: t(`ck_b_${b}`), color: BUCKET_COLOR[b] }))), { sub: t("ck_c_mods_sub") })),
    h("div.grid.cols-2",
      card(t("ck_c_owners"), owners.length ? h("div.ck-load", owners.slice(0, 12).map((o) => h("button.ck-load-row", { type: "button", class: f.owner === o.key ? "on" : "", onclick: () => setF("owner", f.owner === o.key ? ALL : o.key) },
        h("span", o.key === "—" ? t("ck_no_owner") : o.key), h("span.ck-bar", h("i", { style: { width: `${(o.n / owners[0].n) * 100}%` } }), o.overdue ? h("i.late", { style: { width: `${(o.overdue / owners[0].n) * 100}%` } }) : null),
        h("b", fmtNum(o.n)), o.overdue ? h("small.warn-mini", `${fmtNum(o.overdue)} ${t("ck_late_short")}`) : h("small"))))
        : h("p.muted", t("none_found")), { sub: t("ck_c_owners_sub") }),
      card(t("ck_c_depts"), depts.length ? h("div.ck-load", depts.slice(0, 12).map((o) => h("button.ck-load-row", { type: "button", class: f.dept === o.key ? "on" : "", onclick: () => setF("dept", f.dept === o.key ? ALL : o.key) },
        h("span", tv(o.key)), h("span.ck-bar", h("i", { style: { width: `${(o.n / depts[0].n) * 100}%` } }), o.overdue ? h("i.late", { style: { width: `${(o.overdue / depts[0].n) * 100}%` } }) : null),
        h("b", fmtNum(o.n)), o.overdue ? h("small.warn-mini", `${fmtNum(o.overdue)} ${t("ck_late_short")}`) : h("small"))))
        : h("p.muted", t("none_found")), { sub: t("ck_c_depts_sub") })),
    card(null, h("div.filters",
      h("label.field.grow", h("span", t("sop_find")), h("input", { type: "search", value: f.q ?? "", placeholder: t("ck_find_ph"), onchange: (e) => setF("q", e.target.value) })),
      select(t("ck_module"), [[ALL, t("filter_all")], ...mods.map((k) => [k, modName(k)])], f.mod ?? ALL, (v) => setF("mod", v)),
      select(t("col_owner"), [[ALL, t("filter_all")], ...owners.map((o) => [o.key, o.key === "—" ? t("ck_no_owner") : `${o.key} · ${fmtNum(o.n)}`])], f.owner ?? ALL, (v) => setF("owner", v)),
      select(t("col_dept"), [[ALL, t("filter_all")], ...depts.map((o) => [o.key, `${tv(o.key)} · ${fmtNum(o.n)}`])], f.dept ?? ALL, (v) => setF("dept", v)),
      select(t("ck_when"), [[ALL, t("filter_all")], ...BUCKETS.map((b) => [b, t(`ck_b_${b}`)])], f.bucket ?? ALL, (v) => setF("bucket", v)),
      h("div.field", h("span", t("sop_view")), segmented([["list", t("ck_list")], ["table", t("sop_table")]], f.view ?? "list", (v) => setF("view", v), t("sop_view")))), { cls: "filter-card" }),
    (f.view ?? "list") === "table"
      ? card(`${t("ck_items")} · ${fmtNum(F.length)}`, dataTable([
        { key: "due", label: t("col_due"), cls: "nowrap", render: (it) => fmtDate(it.due) },
        { key: "days", label: t("ck_days"), cls: "num", render: (it) => h("span", { style: { color: it.days < 0 ? "var(--critical-ink, var(--critical))" : null } }, fmtNum(it.days)) },
        { key: "mod", label: t("ck_module"), sort: (it) => modName(it.mod), render: (it) => modName(it.mod) },
        { key: "kind", label: t("col_type"), render: (it) => tv(it.kind) },
        { key: "id", label: "ID", cls: "mono nowrap" },
        { key: "title", label: t("col_title"), cls: "wrap" },
        { key: "owner", label: t("col_owner") },
        { key: "dept", label: t("col_dept"), render: (it) => tv(it.dept ?? "") },
      ], F, { pageSize: 50, onRow: (it) => openItem(ctx, it), searchText: (it) => `${it.id} ${it.title} ${it.owner ?? ""}`, exportName: "due-cockpit" }), { sub: t("ck_table_sub") })
      : F.length ? h("div.ck-groups", groups.map(([b, xs]) => {
        const shown = xs.slice(0, show);
        return h("section.ck-group", { style: { "--c": BUCKET_COLOR[b] } },
          h("h3", h("i"), t(`ck_b_${b}`), h("b", fmtNum(xs.length))),
          h("div.ck-list", shown.map(line)),
          xs.length > shown.length ? h("p.center", h("button.btn", { type: "button", onclick: () => setF("show", show + 60) }, t("sop_more", fmtNum(Math.min(60, xs.length - shown.length))))) : null);
      }))
        : h("div.empty.big", h("p", h("span.ok-mini", icon("check", 16)), ` ${t("ck_none")}`)));
}

/** Small cockpit summary for the home page: counts per bucket, and the most urgent lines. */
export function cockpitTile(ctx) {
  const all = dueItems(ctx.m, ctx.m.now, { horizon: 30 });
  const nb = (b) => all.filter((it) => it.bucket === b).length;
  return card(t("ck_title"), h("div.ck-tile",
    h("div.ck-tile-k", ["overdue", "week", "month"].map((b) => h("button", { type: "button", style: { "--c": BUCKET_COLOR[b] }, onclick: () => { ctx.state.ckF = { bucket: b }; ctx.go("cockpit"); } }, h("b", fmtNum(nb(b))), h("small", t(`ck_b_${b}`))))),
    h("ul.ck-tile-list", all.slice(0, 5).map((it) => h("li", h("button.link", { type: "button", onclick: () => openItem(ctx, it) }, h("b.mono", it.id), ` ${String(it.title ?? "").slice(0, 46)}`), h("small", { style: { color: it.days < 0 ? "var(--critical)" : null } }, ` · ${when(it)}`))))),
    { sub: t("ck_tile_sub"), actions: h("a.link", { href: "#/cockpit" }, t("ck_open"), " →") });
}
