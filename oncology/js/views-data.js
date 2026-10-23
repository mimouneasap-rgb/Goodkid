// Data tables: browse and edit every workbook table in the app, and see recent changes.
import { h, card, viewHeader, dataTable, fmtDate, fmtNum } from "./ui.js";
import { t } from "./i18n.js";
import { icon } from "./icons.js";
import { toDay } from "./model.js";
import { SPECS, tableLabel } from "./editing.js";
import { openBulk } from "./bulk.js";

const GROUPS = [
  ["dt_quality", ["cc", "capa", "qe", "find", "actions", "links", "appr"]],
  ["dt_apqr", ["apqrTasks", "apqrPlan", "apqrSys", "apqr", "apqrSections"]],
  ["dt_programmes", ["training", "calplan", "validation", "fives", "fivesItems", "fivesAreas", "fivesTpl", "qaact", "metrics"]],
  ["dt_product", ["batches", "wip", "rejections", "suppliers"]],
  ["dt_site", ["rooms", "adj", "equip", "ccp"]],
  ["dt_docs", ["sop", "sopSources", "sopLinks", "forms", "fmea", "impr"]],
  ["dt_settings", ["targets", "bands", "crit", "prio", "prod", "deptMap"]],
];

export function dataTables(ctx) {
  const d = ctx.data;
  const sel = ctx.state.dtTable && d[ctx.state.dtTable] ? ctx.state.dtTable : "cc";
  const tbl = d[sel];
  const spec = SPECS[sel] ?? {};
  const edits = [...ctx.edits.values()];
  const changedIn = (key) => edits.filter((e) => e.table === key).length;

  // show the identifying columns first, then the spec's leading fields
  const lead = [spec.id, spec.title, ...(spec.fields ?? []).map((f) => f[0])].filter((c, i, a) => c && a.indexOf(c) === i && tbl.cols.includes(c));
  const shown = (lead.length ? lead : tbl.cols).slice(0, 6);
  const rows = tbl.rows.map((r, i) => ({ __i: i, __key: tbl.keys[i], __edit: tbl.edits[i], ...Object.fromEntries(tbl.cols.map((c, j) => [c, r[j]])) }));
  const cols = [
    { key: "__edit", label: "", sort: (r) => (r.__edit ? 1 : 0), render: (r) => (r.__edit ? h("i.edit-dot", { title: t("changed_in_app") }) : ""), width: "18px" },
    ...shown.map((c) => ({ key: c, label: c, cls: c === spec.id ? "mono nowrap" : c === spec.title ? "wrap" : "", render: (r) => cell(r[c]) })),
  ];
  const title = (r) => [r[spec.id], r[spec.title]].filter(Boolean).join(" · ");

  const recent = edits.sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 60);
  const recentRow = (e) => {
    const tb = d[e.table];
    const i = tb?.keys.indexOf(e.key) ?? -1;
    const sp = SPECS[e.table] ?? {};
    const r = e.row ?? (i >= 0 ? tb.rows[i] : null);
    const name = r && tb ? [r[tb.cols.indexOf(sp.id)], r[tb.cols.indexOf(sp.title)]].filter((x) => x != null && x !== "").join(" · ") : e.key;
    const kind = e.row == null ? "deleted" : e.key.startsWith("n-") ? "added" : "changed";
    return { ...e, name, kind, open: i >= 0 && e.row != null };
  };

  return h("div.view",
    viewHeader(t("dt_title"), t("dt_sub"),
      ctx.canEdit ? h("button.btn", { type: "button", onclick: () => openBulk(ctx, sel) }, icon("upload", 16), t("bulk_insert")) : null,
      ctx.canEdit ? h("button.btn.primary", { type: "button", onclick: () => ctx.add(sel) }, icon("plus", 16), t("add_row_title", tableLabel(sel).toLowerCase())) : null),
    h("div.ws-banner", { class: ctx.workspace.mode },
      icon(ctx.workspace.mode === "shared" ? "globe" : "records", 18),
      h("div", h("b", ctx.workspace.mode === "shared" ? t("ws_shared") : t("ws_local")), h("p", ctx.workspace.mode === "shared" ? t("ws_shared_note") : t("ws_local_note"))),
      ctx.canEdit ? null : h("span.tag", t("read_only"))),
    h("div.dt-layout",
      h("nav.dt-tables", { "aria-label": t("dt_title") }, GROUPS.map(([g, keys]) => h("div.dt-group",
        h("span.nav-title", t(g)),
        keys.filter((k) => d[k]).map((k) => h("button.dt-table", { type: "button", class: k === sel ? "on" : "", onclick: () => ctx.set("dtTable", k) },
          h("span", tableLabel(k)), h("b", fmtNum(d[k].rows.length)), changedIn(k) ? h("i.edit-dot", { title: `${changedIn(k)} ${t("changes_in_app")}` }) : null))))),
      h("div.dt-main",
        card(`${tableLabel(sel)} · ${fmtNum(tbl.rows.length)} ${t("rows")}`,
          dataTable(cols, rows, {
            pageSize: 25, search: true,
            searchText: (r) => tbl.cols.map((c) => r[c] ?? "").join(" "),
            onRow: ctx.canEdit ? (r) => ctx.edit(sel, r.__key, title(r)) : null,
          }), { sub: ctx.canEdit ? t("dt_click_edit") : null }),
        card(t("recent_changes"), recent.length ? h("ul.changes", recent.map(recentRow).map((e) => h("li",
          h(`span.chg.${e.kind}`, t(`chg_${e.kind}`)),
          h("div", h(e.open ? "button.link" : "span", { type: e.open ? "button" : null, onclick: e.open ? () => ctx.edit(e.table, e.key, e.name) : null }, e.name || "—"), h("small", tableLabel(e.table))),
          h("small.muted", `${fmtDate(toDay(String(e.at).slice(0, 10)))} · ${ctx.who(e.by)}`)))) : h("div.empty", t("no_changes"))))));
}

function cell(v) {
  if (v == null || v === "-----") return h("span.muted", "—");
  const s = String(v);
  return s.length > 90 ? s.slice(0, 88) + "…" : s;
}
