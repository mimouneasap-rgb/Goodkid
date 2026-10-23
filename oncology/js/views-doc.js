// Document control beyond SOPs: the register of every controlled document found in the Drive library (batch records,
// orders, specifications, test methods, assessment records, registers), each product's document set, the master
// document indexes checked against Drive, and the map of the library's folders.
import { h, card, kpi, select, segmented, dataTable, fmtDate, fmtNum, fmtPct } from "./ui.js";
import { hbars, donut, stacks, ring } from "./charts.js";
import { t, tv, getLang } from "./i18n.js";
import { icon } from "./icons.js";
import { toDay } from "./model.js";
import { TYPE_BY_ID } from "./dockit.js";
import { SOP_DEPTS } from "./sopkit.js";
import { job, readIndexes, driveProblem } from "./sop-drive.js";

const FR = () => getLang() === "FR";
const ALL = "__all";
const short = (s, n = 60) => (String(s ?? "").length > n ? String(s).slice(0, n - 1) + "…" : String(s ?? ""));
const driveUrl = (id) => `https://drive.google.com/file/d/${encodeURIComponent(id)}/view`;
const sopHref = (code) => `#/sops?code=${encodeURIComponent(code)}`;
const dot = (color, label) => h("span.pill", { style: { "--dot": color } }, h("i"), label);
const deptName = (d) => SOP_DEPTS[d]?.[FR() ? 1 : 0] ?? d ?? "—";
export const typeName = (id) => TYPE_BY_ID.get(id)?.[FR() ? 2 : 1] ?? id ?? "—";
const GROUP_OF = { BMR: "batch", BPR: "batch", OF: "batch", OC: "batch", BOM: "batch", FPS: "spec", RMS: "spec", PMS: "spec", STM: "lab", STR: "lab", RMR: "lab", FPR: "lab",
  IND: "reg", AR: "reg", ICI: "reg", COD: "reg", LST: "reg", SMF: "reg", QM: "reg", TE: "reg", VMP: "val", PV: "val", CV: "val", HTS: "val" };
const GROUP_COLOR = { batch: "var(--c2)", spec: "var(--c3)", lab: "var(--c7)", reg: "var(--c4)", val: "var(--c5)" };
export const typeColor = (id) => GROUP_COLOR[GROUP_OF[id]] ?? "var(--muted-mark)";
export const ZONE_COLOR = { controlled: "var(--good)", obsolete: "var(--muted-mark)", uncontrolled: "var(--warning)" };
const STATUS_COLOR = { Effective: "var(--good)", Obsolete: "var(--muted-mark)", "Uncontrolled copy": "var(--warning)" };
export const STATE_COLOR = { match: "var(--good)", "drive-newer": "var(--warning)", "drive-older": "var(--critical)", missing: "var(--critical)", obsolete: "var(--muted-mark)", unlisted: "var(--c4)" };
const STATE_KEY = { match: "ix_s_match", "drive-newer": "ix_s_newer", "drive-older": "ix_s_older", missing: "ix_s_missing", obsolete: "ix_s_obsolete", unlisted: "ix_s_unlisted" };
export const stateLabel = (s) => t(STATE_KEY[s] ?? s);
const ANOMALY_KEY = { "same-date": "ix_a_same", period: "ix_a_period", future: "ix_a_future" };
const statusPill = (s) => dot(STATUS_COLOR[s] ?? "var(--muted-mark)", tv(s ?? "—"));
const docLink = (d) => (d?.kind === "sop" ? sopHref(d.code) : d?.ref?.["Drive ID"] ? driveUrl(d.ref["Drive ID"]) : null);

// ---------- the document register ----------
export function documents(ctx, D) {
  const L = D.list;
  const f = ctx.state.docF ?? {};
  const setF = (k, v) => ctx.set("docF", { ...f, [k]: v, show: k === "show" ? v : 48 });
  const qx = String(f.q ?? "").trim().toLowerCase();
  const F = L.filter((d) => (!f.type || f.type === ALL || d.Type === f.type) && (!f.dept || f.dept === ALL || d.Department === f.dept)
    && (!f.product || f.product === ALL || d.product === f.product) && (!f.status || f.status === ALL || d.Status === f.status)
    && (!qx || `${d.Code} ${d.Title ?? ""} ${d.product ?? ""} ${d.Folder ?? ""} ${d["Drive file"] ?? ""}`.toLowerCase().includes(qx)));
  if (!L.length) return [emptyState(ctx, t("doc_none"))];
  const types = [...D.byType.keys()].sort((a, b) => D.byType.get(b) - D.byType.get(a));
  const depts = [...new Set(L.map((d) => d.Department).filter(Boolean))].sort();
  const products = [...new Set(L.map((d) => d.product).filter(Boolean))].sort();
  const current = L.filter((d) => d.zone === "controlled");
  const productTypes = current.filter((d) => GROUP_OF[d.Type] === "batch" || d.Type === "FPS" || d.Type === "PMS" || d.Type === "STR");
  const listedKeys = new Set(D.checks.map((c) => c.key));
  const indexable = current.filter((d) => D.indexes.some((ix) => ix.dept === d.Department));
  const years = [...new Set(L.map((d) => (d.modified != null ? new Date(d.modified).getUTCFullYear() : null)).filter(Boolean))].sort();
  const tops = [...new Set(L.map((d) => String(d.Folder ?? "").split("/")[0] || "/"))];
  const show = +(f.show ?? 48);
  const by = (k) => L.filter((d) => d.Status === k).length;
  return [
    h("section.sop-hero.doc-hero",
      h("div.sop-hero-text",
        h("span.eyebrow", t("doc_eyebrow")),
        h("h2", `${fmtNum(L.length)} ${t("doc_documents")}`),
        h("p", t("doc_hero_sub", fmtNum(types.length), fmtNum(products.length), fmtNum(by("Obsolete") + by("Uncontrolled copy")))),
        h("div.hero-meta", types.slice(0, 8).map((x) => h("button.chip.chip-glass", { type: "button", onclick: () => setF("type", x) }, h("b", x), ` ${fmtNum(D.byType.get(x))}`)))),
      h("div.apqr-rings",
        h("div.hero-ring", ring(L.length ? current.length / L.length : null, { size: 88, color: "#5fe0b0" }), h("span", t("doc_r_current"))),
        h("div.hero-ring", ring(productTypes.length ? productTypes.filter((d) => d.product).length / productTypes.length : null, { size: 88, color: "#ffd27a" }), h("span", t("doc_r_product"))),
        h("div.hero-ring", ring(indexable.length ? indexable.filter((d) => listedKeys.has(d.key)).length / indexable.length : null, { size: 88, color: "#8fc1ff" }), h("span", t("doc_r_listed"))))),
    h("div.kpi-grid.six",
      kpi({ label: t("doc_k_n"), value: fmtNum(L.length), hint: `${fmtNum(types.length)} ${t("doc_types").toLowerCase()}`, accent: "var(--c1)", onclick: () => setF("type", ALL) }),
      kpi({ label: t("doc_k_batch"), value: fmtNum(L.filter((d) => GROUP_OF[d.Type] === "batch").length), hint: "OF · OC · BOM · BMR · BPR", accent: GROUP_COLOR.batch }),
      kpi({ label: t("doc_k_spec"), value: fmtNum(L.filter((d) => GROUP_OF[d.Type] === "spec").length), hint: "FPS · RMS · PMS", accent: GROUP_COLOR.spec }),
      kpi({ label: t("doc_k_lab"), value: fmtNum(L.filter((d) => GROUP_OF[d.Type] === "lab").length), hint: "STM · STR · RMR", accent: GROUP_COLOR.lab }),
      kpi({ label: t("doc_k_obsolete"), value: fmtNum(by("Obsolete")), accent: "var(--muted-mark)", onclick: () => setF("status", "Obsolete") }),
      kpi({ label: t("doc_k_uncontrolled"), value: fmtNum(by("Uncontrolled copy")), status: by("Uncontrolled copy") ? 2 : 3, onclick: () => setF("status", "Uncontrolled copy") })),
    h("div.grid.cols-3",
      card(t("doc_c_types"), hbars(types.map((x) => ({ label: `${x} · ${short(typeName(x), 34)}`, value: D.byType.get(x), color: typeColor(x), onclick: () => setF("type", x) }))), { sub: t("doc_c_types_sub") }),
      card(t("doc_c_dept"), donut(depts.map((x, i) => ({ label: deptName(x), value: L.filter((d) => d.Department === x).length, color: `var(--c${(i % 8) + 1})`, onclick: () => setF("dept", x) })), { center: fmtNum(depts.length), sub: t("doc_depts") })),
      card(t("doc_c_folders"), stacks(tops.map((x) => ({ label: x, parts: Object.fromEntries(["controlled", "obsolete", "uncontrolled"].map((z) => [z, L.filter((d) => (String(d.Folder ?? "").split("/")[0] || "/") === x && d.zone === z).length])) }))
        .sort((a, b) => Object.values(b.parts).reduce((s, v) => s + v, 0) - Object.values(a.parts).reduce((s, v) => s + v, 0)),
        ["controlled", "obsolete", "uncontrolled"].map((z) => ({ key: z, label: t(`zone_${z}`), color: ZONE_COLOR[z] }))), { sub: t("doc_c_folders_sub") }),
      years.length ? card(t("doc_c_years"), hbars(years.map((y) => ({ label: String(y), value: L.filter((d) => d.modified != null && new Date(d.modified).getUTCFullYear() === y).length, color: "var(--c1)" }))), { sub: t("doc_c_years_sub") }) : null),
    card(null, h("div.filters.sop-filters",
      h("label.field.grow", h("span", t("sop_find")), h("input", { type: "search", value: f.q ?? "", placeholder: t("doc_find_ph"), onchange: (e) => setF("q", e.target.value) })),
      select(t("col_type"), [[ALL, t("filter_all")], ...types.map((x) => [x, `${x} · ${typeName(x)}`])], f.type ?? ALL, (v) => setF("type", v)),
      select(t("col_dept"), [[ALL, t("filter_all")], ...depts.map((x) => [x, `${x} · ${deptName(x)}`])], f.dept ?? ALL, (v) => setF("dept", v)),
      select(t("doc_product"), [[ALL, t("filter_all")], ...products.map((x) => [x, x])], f.product ?? ALL, (v) => setF("product", v)),
      select(t("col_status"), [[ALL, t("filter_all")], ...["Effective", "Obsolete", "Uncontrolled copy"].map((x) => [x, tv(x)])], f.status ?? ALL, (v) => setF("status", v)),
      h("div.field", h("span", t("sop_view")), segmented([["cards", t("sop_cards")], ["table", t("sop_table")]], f.view ?? "cards", (v) => setF("view", v), t("sop_view")))), { cls: "filter-card" }),
    (f.view ?? "cards") === "table"
      ? card(`${t("doc_documents")} · ${fmtNum(F.length)}`, dataTable(docCols(), F, { pageSize: 40, onRow: (d) => openDoc(ctx, D, d), searchText: (d) => `${d.Code} ${d.Title ?? ""} ${d.product ?? ""}`, exportName: "documents" }))
      : h("div",
        h("p.sop-count", `${fmtNum(F.length)} ${t("doc_documents")}`),
        F.length ? h("div.sop-grid", F.slice(0, show).map((d, i) => docCard(ctx, D, d, i))) : h("div.empty", t("none_found")),
        F.length > show ? h("p.center", h("button.btn", { type: "button", onclick: () => setF("show", show + 96) }, t("sop_more", fmtNum(Math.min(96, F.length - show))))) : null),
  ];
}
function docCols() {
  return [
    { key: "Code", label: t("col_code"), cls: "mono nowrap" },
    { key: "Type", label: t("col_type"), render: (d) => h("span.tag", { style: { "--tag": typeColor(d.Type) }, title: typeName(d.Type) }, d.Type ?? "—") },
    { key: "Title", label: t("col_title"), cls: "wrap", render: (d) => (d.Title ? h("b", d.Title) : h("span.muted", d["Drive file"])) },
    { key: "product", label: t("doc_product"), render: (d) => d.product ?? "" },
    { key: "Strength", label: t("doc_strength"), cls: "nowrap" },
    { key: "Revision", label: t("col_rev"), cls: "num" },
    { key: "Status", label: t("col_status"), render: (d) => statusPill(d.Status) },
    { key: "Folder", label: t("doc_folder"), cls: "wrap", render: (d) => h("small.muted", d.Folder || "/") },
    { key: "modified", label: t("sop_drive_mod"), cls: "num nowrap", render: (d) => fmtDate(d.modified) },
    { key: "Drive ID", label: "Drive", render: (d) => (d["Drive ID"] ? h("a.icon-link", { href: driveUrl(d["Drive ID"]), target: "_blank", rel: "noopener", title: d["Drive file"], onclick: (e) => e.stopPropagation() }, icon("globe", 14)) : null) },
  ];
}
function docCard(ctx, D, d, i) {
  return h("button.sop-card.doc-card", { type: "button", style: { "--c": typeColor(d.Type), "--i": Math.min(i, 24) }, onclick: () => openDoc(ctx, D, d), class: d.zone !== "controlled" ? `zone-${d.zone}` : "" },
    h("header", h("span.sop-code", d.Code), d.Revision ? h("span.sop-rev", `rev ${d.Revision}`) : null, h("span.spacer"), h("span.doc-type", { title: typeName(d.Type) }, d.Type ?? "?")),
    h("h3", d.Title || h("span.muted", d["Drive file"])),
    h("p.sop-purpose", typeName(d.Type)),
    h("footer", d.zone !== "controlled" ? statusPill(d.Status) : h("small.muted", d.Folder || "/"), h("span.sop-tags", [d.product, d.Strength].filter(Boolean).map((x) => h("span.tag", x)))));
}

/** One document's facts in the drawer: where it sits, its product, its index entry, its other files. */
export function openDoc(ctx, D, d) {
  const check = D.checks.find((c) => c.key === d.key);
  ctx.open.drawer(() => [
    h("div.d-head", h("span.d-ref", `${d.Type ?? ""} · ${typeName(d.Type)}`), h("h2", `${d.Code}${d.Title ? ` · ${d.Title}` : ""}`)),
    h("div.form-actions",
      d["Drive ID"] ? h("a.btn.primary.compact", { href: driveUrl(d["Drive ID"]), target: "_blank", rel: "noopener" }, icon("globe", 15), t("sop_open_drive")) : null,
      ctx.canEdit && d.__key ? h("button.btn.compact", { type: "button", onclick: () => ctx.edit("docs", d.__key, d.Code) }, icon("edit", 15), t("edit")) : null),
    d.zone !== "controlled" ? h("div.banner.warn", icon("alert", 18), h("span", d.zone === "obsolete" ? t("doc_obsolete_note") : t("doc_uncontrolled_note"))) : null,
    h("dl.deflist", [[t("col_type"), typeName(d.Type)], [t("doc_product"), d.product], [t("doc_strength"), d.Strength], [t("col_dept"), d.Department ? `${d.Department} · ${deptName(d.Department)}` : null],
      [t("col_rev"), d.Revision], [t("doc_revisions"), d.Revisions], [t("col_status"), tv(d.Status ?? "")], [t("doc_folder"), d.Folder || "/"], [t("sop_drive_mod"), fmtDate(d.modified)],
      [t("sop_files_n"), d.Files], [t("doc_obsolete_n"), d.Obsolete], [t("doc_uncontrolled_n"), d.Uncontrolled], [t("doc_file"), d["Drive file"]], [t("comment"), d.Comment]]
      .filter(([, v]) => v != null && v !== "").flatMap(([k, v]) => [h("dt", k), h("dd", v)])),
    check ? h("div.doc-index-box", h("h4", t("ix_entry")), h("p", t("ix_entry_line", check.index, check.rev ?? "—", fmtDate(check.effective) || "—", fmtDate(check.validity) || "—")), dot(STATE_COLOR[check.state], stateLabel(check.state))) : null,
  ]);
}

// ---------- each product's documents ----------
export function productsTab(ctx, D) {
  const P = D.products;
  if (!D.list.length) return [emptyState(ctx, t("doc_none"))];
  const marketed = P.filter((p) => p.marketed);
  const complete = marketed.filter((p) => !p.missing.length);
  const notListed = P.filter((p) => !p.inList);
  const cols = D.dossierTypes;
  const cell = (p, tp) => {
    const xs = p.cells[tp];
    const need = p.marketed && D.required.includes(tp);
    if (!xs.length) return h("td.dos-cell", { class: need ? "miss" : "none", title: need ? t("dos_missing_t", typeName(tp)) : typeName(tp) }, need ? icon("alert", 13) : "·");
    const revs = xs.map((d) => d.Revision).filter(Boolean);
    return h("td.dos-cell.has", h("button", { type: "button", title: xs.map((d) => `${d.Code} ${d.Strength ?? ""}`).join("\n"),
      onclick: () => ctx.open.drawer(() => [h("div.d-head", h("span.d-ref", `${tp} · ${typeName(tp)}`), h("h2", p.name)), dataTable(docCols().slice(0, 8), xs, { search: false, pageSize: 30, onRow: (d) => openDoc(ctx, D, d) })]) },
      h("b", fmtNum(xs.length)), revs.length ? h("small", `r${revs.sort().at(-1)}`) : null));
  };
  return [
    h("div.kpi-grid",
      kpi({ label: t("dos_k_products"), value: fmtNum(P.filter((p) => p.docs.length).length), hint: `${fmtNum(marketed.length)} ${t("dos_marketed").toLowerCase()}`, accent: "var(--c1)" }),
      kpi({ label: t("dos_k_complete"), value: `${fmtNum(complete.length)} / ${fmtNum(marketed.length)}`, status: complete.length === marketed.length ? 3 : 2 }),
      kpi({ label: t("dos_k_gaps"), value: fmtNum(marketed.reduce((n, p) => n + p.missing.length, 0)), status: marketed.some((p) => p.missing.length) ? 1 : 3, hint: t("dos_k_gaps_h") }),
      kpi({ label: t("dos_k_notlisted"), value: fmtNum(notListed.length), status: notListed.length ? 2 : 3, hint: notListed.map((p) => p.name).join(" · ") || null })),
    notListed.length ? h("div.banner.info", icon("report", 18), h("span", t("dos_notlisted_note", notListed.map((p) => `${p.name}${p.code ? ` (${p.code})` : ""}`).join(", ")))) : null,
    card(t("dos_title"), h("div.table-scroll", h("table.data.dossier",
      h("thead", h("tr", h("th", t("doc_product")), cols.map((tp) => h("th.dos-h", { title: typeName(tp), style: { "--c": typeColor(tp) } }, tp)), h("th", t("dos_complete")))),
      h("tbody", P.map((p) => h("tr", { class: p.marketed ? "" : "dos-pipe" },
        h("th.dos-p", h("b", p.name), h("small", [p.api, p.inList ? (p.status ? short(p.status, 30) : null) : t("dos_not_in_list")].filter(Boolean).join(" · ")),
          p.strengths.length ? h("span.dos-str", p.strengths.map((x) => h("span.tag", x))) : null),
        cols.map((tp) => cell(p, tp)),
        h("td.dos-ring", p.complete != null ? ring(p.complete, { size: 44, color: p.complete === 1 ? "var(--good)" : "var(--warning)" }) : h("small.muted", t("dos_pipeline")))))))),
    { sub: t("dos_sub") }),
    h("div.legend-row", h("span", h("i.dos-key.has"), t("dos_l_has")), h("span", h("i.dos-key.miss"), t("dos_l_miss")), h("span", h("i.dos-key.none"), t("dos_l_none"))),
  ];
}

// ---------- master indexes checked against Drive ----------
export function indexTab(ctx, D) {
  const st = job.indexes;
  const docs = D.list;
  const canRead = ctx.canEdit && docs.some((d) => d.Type === "IND");
  const busy = st && !st.finished;
  const start = async () => { try { await readIndexes(ctx, docs, () => ctx.rerender()); } catch (e) { job.indexes = { ...(job.indexes ?? {}), error: e, finished: true }; } ctx.rerender(); };
  const reader = h("div.sop-job",
    st ? h("div.sop-progress", h("i", { style: { width: `${st.total ? (st.done / st.total) * 100 : 100}%` } })) : null,
    st ? h("p", st.finished ? (st.fatal ? h("span.warn-text", t(st.fatal)) : h("span.ok-line", icon("check", 14), t("ix_read_done", fmtNum(st.read?.length ?? 0), fmtNum(st.entries ?? 0)))) : `${fmtNum(st.done)} / ${fmtNum(st.total)} · ${st.current ?? ""}`) : null,
    st?.error ? h("p.warn-text", t(driveProblem(st.error))) : null,
    h("div.form-actions", h("button.btn.primary", { type: "button", disabled: busy || !canRead ? true : null, onclick: start }, icon("report", 15), D.indexes.length ? t("ix_reread") : t("ix_read"))));
  if (!D.indexes.length) return [card(t("ix_title"), h("div", h("p", t("ix_empty")), reader), { sub: t("ix_sub") })];
  const C = D.checks;
  const f = ctx.state.ixF ?? {};
  const setF = (k, v) => ctx.set("ixF", { ...f, [k]: v });
  const count = (s) => C.filter((c) => c.state === s).length;
  const anomalies = C.filter((c) => c.anomalies.length);
  const due = C.filter((c) => c.review === "Overdue" || c.review === "Due ≤90 d");
  const rows = [
    ...C.map((c) => ({ ...c, kind: "entry" })),
    ...D.unlisted.map((d) => ({ index: null, dept: d.dept, code: d.code, key: null, rev: null, effective: null, validity: null, doc: d, state: "unlisted", anomalies: [], review: null, kind: "unlisted" })),
  ];
  const view = f.state ?? "issues";
  const F = rows.filter((r) => (!f.index || f.index === ALL || r.index === f.index) && (view === "all" ? true : view === "issues" ? r.state !== "match" || r.anomalies.length
    : view === "anomalies" ? r.anomalies.length : view === "review" ? r.review === "Overdue" || r.review === "Due ≤90 d" : r.state === view));
  return [
    h("section.sop-hero.ix-hero",
      h("div.sop-hero-text",
        h("span.eyebrow", t("ix_eyebrow")),
        h("h2", t("ix_hero", fmtNum(D.indexes.length), fmtNum(C.length))),
        h("p", t("ix_hero_sub", fmtNum(count("match")), fmtNum(count("drive-newer")), fmtNum(count("missing")), fmtNum(D.unlisted.length))),
        h("div.hero-meta", h("span.chip.chip-glass", t("ix_read_on", fmtDate(D.editions.map((e) => e.readOn).filter(Boolean).sort().at(-1)) || "—")))),
      h("div.apqr-rings",
        h("div.hero-ring", ring(C.length ? count("match") / C.length : null, { size: 88, color: "#5fe0b0" }), h("span", t("ix_r_match"))),
        h("div.hero-ring", ring(C.length ? (C.length - count("missing")) / C.length : null, { size: 88, color: "#8fc1ff" }), h("span", t("ix_r_file"))),
        h("div.hero-ring", ring(C.length + D.unlisted.length ? C.filter((c) => c.state !== "missing").length / (C.filter((c) => c.state !== "missing").length + D.unlisted.length) : null, { size: 88, color: "#ffd27a" }), h("span", t("ix_r_listed"))))),
    h("div.kpi-grid.six",
      kpi({ label: stateLabel("match"), value: fmtNum(count("match")), accent: STATE_COLOR.match, onclick: () => setF("state", "match") }),
      kpi({ label: stateLabel("drive-newer"), value: fmtNum(count("drive-newer")), accent: STATE_COLOR["drive-newer"], hint: t("ix_newer_h"), onclick: () => setF("state", "drive-newer") }),
      kpi({ label: stateLabel("missing"), value: fmtNum(count("missing")), status: count("missing") ? 1 : 3, hint: t("ix_missing_h"), onclick: () => setF("state", "missing") }),
      kpi({ label: stateLabel("unlisted"), value: fmtNum(D.unlisted.length), accent: STATE_COLOR.unlisted, hint: t("ix_unlisted_h"), onclick: () => setF("state", "unlisted") }),
      kpi({ label: t("ix_anomalies"), value: fmtNum(anomalies.length), status: anomalies.length ? 2 : 3, onclick: () => setF("state", "anomalies") }),
      kpi({ label: t("ix_review"), value: fmtNum(due.length), status: due.some((c) => c.review === "Overdue") ? 1 : due.length ? 2 : 3, hint: t("ix_review_h"), onclick: () => setF("state", "review") })),
    h("div.ix-grid", D.indexes.map((ix) => {
      const n = ix.entries.length;
      return h("button.ix-card", { type: "button", class: f.index === ix.id ? "on" : "", onclick: () => setF("index", f.index === ix.id ? ALL : ix.id) },
        h("header", h("b", ix.id), h("span.spacer"), h("small", ix.year ?? "")),
        h("span.ix-dept", `${deptName(ix.dept)} · ${typeName(ix.scope === "SOP" ? "SOP" : ix.scope === "CVP" ? "CV" : ix.scope === "FPRFP" ? "FPR" : ix.scope.replace(/^STM.*/, "STM"))}`),
        h("div.ix-bar", Object.entries(ix.counts).filter(([, v]) => v).map(([k, v]) => h("i", { style: { flex: v, background: STATE_COLOR[k] }, title: `${stateLabel(k)} · ${v}` }))),
        h("footer", h("span", `${fmtNum(n)} ${t("ix_entries")}`), h("span", `${fmtPct(n ? ix.counts.match / n : 0)} ${t("ix_match_short")}`)));
    })),
    card(t("ix_check"), h("div",
      h("div.ix-tabs", segmented([["issues", t("ix_v_issues")], ["missing", stateLabel("missing")], ["drive-newer", stateLabel("drive-newer")], ["drive-older", stateLabel("drive-older")], ["unlisted", stateLabel("unlisted")],
        ["anomalies", t("ix_anomalies")], ["review", t("ix_review")], ["all", t("filter_all")]], view, (v) => setF("state", v), t("ix_check")),
        f.index && f.index !== ALL ? h("button.chip", { type: "button", onclick: () => setF("index", ALL) }, f.index, " ×") : null),
      dataTable(ixCols(), F, { pageSize: 30, onRow: (r) => { const href = docLink(r.doc); if (r.doc?.kind === "doc") openDoc(ctx, D, r.doc.ref); else if (href) location.hash = href.slice(1); },
        searchText: (r) => `${r.code} ${r.doc?.title ?? ""} ${r.index ?? ""}`, exportName: "index-check" })), { sub: t("ix_check_sub") }),
    card(t("ix_reader"), reader, { sub: t("ix_reader_sub") }),
  ];
}
function ixCols() {
  return [
    { key: "code", label: t("col_code"), cls: "mono nowrap" },
    { key: "title", label: t("col_title"), cls: "wrap", sort: (r) => r.doc?.title ?? "", render: (r) => (r.doc?.title ? h("b", short(r.doc.title, 70)) : h("span.muted", r.doc ? "—" : t("ix_no_file"))) },
    { key: "index", label: t("ix_index"), cls: "nowrap", render: (r) => r.index ?? h("span.muted", "—") },
    { key: "rev", label: t("ix_rev"), cls: "num" },
    { key: "drive", label: t("ix_drive_rev"), cls: "num nowrap", sort: (r) => +(r.doc?.rev ?? -1), render: (r) => (r.doc ? [r.doc.rev ?? "—", r.doc.revs?.length > 1 ? h("small.muted", ` (${r.doc.revs.join(" ")})`) : null] : "—") },
    { key: "effective", label: t("sop_effective"), cls: "num nowrap", render: (r) => fmtDate(r.effective) },
    { key: "validity", label: t("ix_validity"), cls: "nowrap", sort: (r) => r.validity ?? 9e15, render: (r) => (r.validity != null ? dot(r.review === "Overdue" ? "var(--critical)" : r.review === "Due ≤90 d" ? "var(--warning)" : "var(--good)", fmtDate(r.validity)) : "—") },
    { key: "state", label: t("col_status"), render: (r) => [dot(STATE_COLOR[r.state], stateLabel(r.state)), ...r.anomalies.map((a) => h("span.tag.warn", t(ANOMALY_KEY[a] ?? a))), r.state === "drive-newer" && !r.hasListedRev ? h("span.tag.warn", t("ix_no_listed_rev")) : null] },
  ];
}

// ---------- the library's folders ----------
export function folderMap(ctx, D) {
  const F = D.folders;
  if (!F.length) return h("p.muted", t("lmap_none"));
  const open = ctx.state.mapOpen ?? {};
  const toggle = (p) => ctx.set("mapOpen", { ...open, [p]: !open[p] });
  const visible = F.filter((f) => f.depth === 0 || f.path.split("/").slice(0, -1).every((_, i, a) => open[a.slice(0, i + 1).join("/")]));
  return h("div.folder-map",
    h("div.fm-row.root", icon("globe", 14), h("b", t("lmap_root")), h("span.spacer"), h("span.fm-n", fmtNum(D.rootDocs))),
    visible.map((f) => {
      const kids = F.some((x) => x.path.startsWith(`${f.path}/`));
      return h("div.fm-row", { style: { "--d": f.depth }, class: `zone-${f.zone}` },
        kids ? h("button.fm-tog", { type: "button", "aria-expanded": String(Boolean(open[f.path])), onclick: () => toggle(f.path) }, h("span", { class: open[f.path] ? "rot" : "" }, icon("chevron", 13))) : h("span.fm-tog"),
        h("a", { href: `https://drive.google.com/drive/folders/${encodeURIComponent(f.id)}`, target: "_blank", rel: "noopener" }, f.name),
        f.zone !== "controlled" ? h("span.tag", { style: { "--tag": ZONE_COLOR[f.zone] } }, t(`zone_${f.zone}`)) : null,
        h("span.spacer"), h("span.fm-n", { title: t("lmap_n_t") }, f.total !== f.docs ? `${fmtNum(f.docs)} · ${fmtNum(f.total)}` : fmtNum(f.docs)));
    }));
}

function emptyState(ctx, text) {
  return h("div.empty.big", h("p", text), h("button.btn", { type: "button", onclick: () => ctx.set("sopTab", "drive") }, icon("cycle", 15), t("sop_t_drive")));
}
