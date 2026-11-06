// Audit trail: every change made in the app — who, when, which record, and each field's old and new value — for all
// tables, plus the same history on a record's own page. Entries are written by the app and never edited.
import { h, card, kpi, viewHeader, select, segmented, dataTable, fmtNum } from "./ui.js";
import { vbars, hbars, sparkline } from "./charts.js";
import { partName } from "./views-sop-edit.js";
import { t, tv } from "./i18n.js";
import { icon } from "./icons.js";
import { tableLabel } from "./editing.js";

const ALL = "__all";
const DAY = 86400000;
const OP_COLOR = { edit: "var(--c1)", add: "var(--good)", delete: "var(--critical)", bulk: "var(--c7)", replace: "var(--c4)", import: "var(--c5)" };
const when = (iso) => { const d = new Date(iso); return Number.isNaN(+d) ? "—" : `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`; };
const opPill = (op) => h("span.pill", { style: { "--dot": OP_COLOR[op] ?? "var(--muted-mark)" } }, h("i"), t(`aud_op_${op}`));
/** Why an automatic change happened (Drive read, Claude résumé, sync…) and, for a bulk change, how many rows. */
export const noteText = (e) => [e.note ? (t(`aud_n_${e.note}`) !== `aud_n_${e.note}` ? t(`aud_n_${e.note}`) : e.note) : null,
  e.added != null ? t("aud_n_bulk", fmtNum(e.added), fmtNum(e.updated ?? 0)) : null].filter(Boolean).join(" · ") || null;
const fieldName = (f) => String(f ?? "").replace(/^Summary · (\w+)/, (_, k) => `${t("sum_title")} · ${partName(k)}`).replace(/^Forms$/, t("frm_title"));

/** Open the record an entry is about (an SOP's page, else its row editor when the row still exists). */
function openRecord(ctx, e) {
  if (e.table === "sop" && e.ref) return ctx.go("sops", { code: e.ref });
  const tb = ctx.data?.[e.table];
  if (tb && e.key && tb.keys.includes(e.key) && ctx.canEdit) return ctx.edit(e.table, e.key, e.label ?? e.ref ?? "");
  return null;
}

export function auditView(ctx) {
  const A = ctx.audit;
  const f = ctx.state.audF ?? {};
  const setF = (k, v) => ctx.set("audF", { ...f, [k]: v });
  const now = Date.now();
  const days = f.period === "all" ? null : +(f.period ?? 30);
  const qx = String(f.q ?? "").trim().toLowerCase();
  const people = [...new Set(A.map((e) => e.by ?? "?"))];
  const tables = [...new Set(A.map((e) => e.table).filter(Boolean))].sort();
  const F = A.filter((e) => (days == null || now - Date.parse(e.at) <= days * DAY) && (!f.table || f.table === ALL || e.table === f.table)
    && (!f.by || f.by === ALL || (e.by ?? "?") === f.by) && (!f.op || f.op === ALL || e.op === f.op)
    && (!qx || `${e.label ?? ""} ${e.ref ?? ""} ${noteText(e) ?? ""} ${(e.changes ?? []).flat().join(" ")}`.toLowerCase().includes(qx)));
  // one line per changed field (an entry without field changes keeps one line)
  const lines = F.flatMap((e) => ((e.changes ?? []).length ? e.changes : [[null, null, null]]).map(([field, oldV, newV], i) => ({ e, i, field, oldV, newV, at: e.at })));
  const last30 = A.filter((e) => now - Date.parse(e.at) <= 30 * DAY);
  const byDay = Array.from({ length: 30 }, (_, i) => { const d0 = new Date(now - (29 - i) * DAY); const k = d0.toISOString().slice(0, 10); return { label: k, short: i % 5 === 4 ? k.slice(8) : "", value: last30.filter((e) => e.at.slice(0, 10) === k).length }; });
  const count = (fn) => [...last30.reduce((m, e) => { const k = fn(e); m.set(k, (m.get(k) ?? 0) + 1); return m; }, new Map())].sort((a, b) => b[1] - a[1]);
  return h("div.view",
    viewHeader(t("aud_title"), t("aud_sub")),
    h("div.kpi-grid",
      kpi({ label: t("aud_k_30"), value: fmtNum(last30.length), accent: "var(--c1)", spark: sparkline(byDay.map((x) => x.value)) }),
      kpi({ label: t("aud_k_people"), value: fmtNum(new Set(last30.map((e) => e.by)).size), accent: "var(--c7)" }),
      kpi({ label: t("aud_k_records"), value: fmtNum(new Set(last30.filter((e) => e.key).map((e) => `${e.table}~${e.key}`)).size), accent: "var(--c3)" }),
      kpi({ label: t("aud_k_auto"), value: fmtNum(last30.filter((e) => e.note || ["bulk", "replace", "import"].includes(e.op)).length), hint: t("aud_k_auto_h"), accent: "var(--c4)" })),
    A.length ? h("div.grid.cols-3",
      card(t("aud_c_days"), vbars(byDay, { height: 120 }), { sub: t("aud_c_days_sub"), span: 2 }),
      card(t("aud_c_tables"), hbars(count((e) => e.table).slice(0, 8).map(([k, v]) => ({ label: tableLabel(k) || k, value: v, onclick: () => setF("table", k) }))))) : null,
    card(null, h("div.filters",
      h("label.field.grow", h("span", t("sop_find")), h("input", { type: "search", value: f.q ?? "", placeholder: t("aud_find_ph"), onchange: (e) => setF("q", e.target.value) })),
      h("div.field", h("span", t("aud_period")), segmented([["7", "7 d"], ["30", "30 d"], ["90", "90 d"], ["all", t("filter_all")]], String(f.period ?? "30"), (v) => setF("period", v), t("aud_period"))),
      select(t("aud_table"), [[ALL, t("filter_all")], ...tables.map((k) => [k, tableLabel(k) || k])], f.table ?? ALL, (v) => setF("table", v)),
      select(t("aud_who"), [[ALL, t("filter_all")], ...people.map((p) => [p, ctx.who(p === "?" ? null : p)])], f.by ?? ALL, (v) => setF("by", v)),
      select(t("aud_action"), [[ALL, t("filter_all")], ...Object.keys(OP_COLOR).map((k) => [k, t(`aud_op_${k}`)])], f.op ?? ALL, (v) => setF("op", v))), { cls: "filter-card" }),
    card(`${t("aud_changes")} · ${fmtNum(F.length)}`, A.length ? dataTable([
      { key: "at", label: t("aud_when"), cls: "nowrap", sort: (x) => x.at, render: (x) => (x.i ? "" : h("div.aud-when", h("b", when(x.at)), h("small", ctx.who(x.e.by)))) },
      { key: "op", label: t("aud_action"), render: (x) => (x.i ? "" : opPill(x.e.op)) },
      { key: "label", label: t("aud_record"), cls: "wrap aud-rec", sort: (x) => `${x.e.table} ${x.e.label ?? ""}`, render: (x) => (x.i ? "" : h("div.aud-when", h("small", tableLabel(x.e.table) || x.e.table), h("span", x.e.label ?? x.e.ref ?? (x.e.n != null ? `${fmtNum(x.e.n)} ${t("rows")}` : "—")))) },
      { key: "field", label: t("aud_field"), cls: "nowrap", render: (x) => fieldName(x.field) || h("span.muted", noteText(x.e) ?? "—") },
      { key: "oldV", label: t("aud_old"), cls: "wrap aud-old", render: (x) => x.oldV ?? (x.field ? h("span.muted", "—") : "") },
      { key: "newV", label: t("aud_new"), cls: "wrap aud-new", render: (x) => x.newV ?? (x.field ? h("span.muted", "—") : "") },
    ], lines, { pageSize: 50, onRow: (x) => openRecord(ctx, x.e), searchText: (x) => `${x.e.label ?? ""} ${x.field ?? ""} ${x.oldV ?? ""} ${x.newV ?? ""}`, exportName: "audit-trail" })
      : h("div.empty", t("aud_none")), { sub: t("aud_table_sub") }));
}

/** A record's own history of changes (newest first), for its page or drawer. */
export function auditCard(ctx, entries, { title } = {}) {
  if (!entries.length) return null;
  const item = (e) => h("li",
    h("div.aud-head", opPill(e.op), h("b", ctx.who(e.by)), h("small", when(e.at)), noteText(e) ? h("span.tag", noteText(e)) : null),
    (e.changes ?? []).length ? h("ul.aud-changes", e.changes.slice(0, 6).map(([field, oldV, newV]) => h("li", h("span.aud-f", fieldName(field)), h("span.aud-old", oldV ?? "—"), h("span.aud-arrow", "→"), h("span.aud-new", newV ?? "—"))),
      e.changes.length > 6 ? h("li.muted", `+ ${fmtNum(e.changes.length - 6)}`) : null) : null);
  return card(title ?? t("aud_record_title"), h("ol.aud-list", entries.slice(0, 12).map(item),
    entries.length > 12 ? h("li", h("a.link", { href: "#/audit" }, t("aud_all", fmtNum(entries.length)))) : null), { sub: t("aud_record_sub") });
}
