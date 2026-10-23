// SOP library: the site's procedures as one register synced from Google Drive, each SOP on its own page read live
// from Drive (sections, history, distribution, the SOPs it cites and is cited by), search inside every SOP, which SOPs
// govern each page of the app, and the Drive sync that keeps the register and its review dates current.
import { h, card, kpi, viewHeader, segmented, select, dataTable, fmtDate, fmtNum, fmtPct } from "./ui.js";
import { stacks, donut, hbars, ring } from "./charts.js";
import { t, tv, getLang } from "./i18n.js";
import { icon } from "./icons.js";
import { toDay } from "./model.js";
import { SOP_TOPICS, ROUTE_TOPICS, ACTIVITY_TOPICS, QA_ACTIVITIES } from "./catalogs.js";
import { SOP_DEPTS, sopKey, parseSopText, parseSopFileName, matchesIn, deptCodes, formKey } from "./sopkit.js";
import { sampler, summarizeSop, summarizeAll, aiProblem, aiJob } from "./sop-ai.js";
import { driveMcp, readFile, searchText, filesNamed, driveProblem, syncLibrary, indexLibrary, indexFields, readIndexes, sourceFolders, job } from "./sop-drive.js";
import { documents, productsTab, indexTab, folderMap, typeName, openDoc, STATE_COLOR, stateLabel } from "./views-doc.js";

const FR = () => getLang() === "FR";
const ALL = "__all";
const DEPT_COLOR = { QA: "var(--c1)", QC: "var(--c3)", VL: "var(--c7)", PR: "var(--c2)", GS: "var(--c4)", CM: "var(--c5)", WH: "var(--c6)", HSE: "var(--c8)" };
export const REVIEW_COLOR = { Overdue: "var(--critical)", "Due ≤90 d": "var(--warning)", "In date": "var(--good)", "No review date": "var(--muted-mark)", Obsolete: "var(--muted-mark)" };
const deptName = (d) => SOP_DEPTS[d]?.[FR() ? 1 : 0] ?? d ?? "—";
const topicName = (id) => { const x = SOP_TOPICS.find(([k]) => k === id); return x ? x[FR() ? 2 : 1] : id; };
const short = (s, n = 60) => (String(s ?? "").length > n ? String(s).slice(0, n - 1) + "…" : String(s ?? ""));
const driveUrl = (id) => `https://drive.google.com/file/d/${encodeURIComponent(id)}/view`;
const isoToday = () => new Date().toISOString().slice(0, 10);
export const sopHref = (code) => `#/sops?code=${encodeURIComponent(code)}`;
const dot = (color, label) => h("span.pill", { style: { "--dot": color } }, h("i"), label);
const reviewPill = (s) => dot(REVIEW_COLOR[s.reviewStatus] ?? "var(--muted-mark)", s.next != null ? `${tv(s.reviewStatus)} · ${fmtDate(s.next)}` : tv(s.reviewStatus));
const ROUTES_OF = Object.entries(ROUTE_TOPICS).reduce((a, [r, ts]) => { for (const x of ts) (a[x] ??= []).push(r); return a; }, {});
const ROUTE_LABEL = { review: "mr_title", metrics: "met_title", dashboard: "dash_title", deviations: "nav_dev_t", capa: "nav_capa_t", cc: "nav_cc_t", findings: "nav_find_t", actions: "nav_actions_t",
  records: "qr_title", products: "pv_title", lifecycle: "lc_title", apqr: "apqr_title", wip: "wip_title", suppliers: "sup_title", map: "map_title", rooms: "rx_title", equipment: "eq_title",
  calibration: "cal_title", validation: "val_title", training: "trn_title", fives: "fives_title", fmea: "fm_title", improvements: "im_title", quality: "dq_title", spc: "spc_title" };

const TABS = [["library", "sop_t_library"], ["forms", "sop_t_forms"], ["documents", "sop_t_docs"], ["products", "sop_t_products"], ["index", "sop_t_index"], ["search", "sop_t_search"], ["modules", "sop_t_modules"], ["drive", "sop_t_drive"]];
const state = { drive: undefined, aiAvailable: undefined, docs: new Map(), ai: new Map(), search: { q: "", status: "idle", files: [], error: null, matches: new Map() } };
// whether this view can reach Google Drive and ask Claude (resolved once per page load)
driveMcp().then((m) => { state.drive = Boolean(m); });
sampler().then((x) => { state.aiAvailable = Boolean(x); });

export function sopsView(ctx) {
  if (ctx.params.code) return sopPage(ctx, ctx.params.code);
  const X = ctx.m.x.sopx;
  const tab = TABS.some(([k]) => k === ctx.state.sopTab) ? ctx.state.sopTab : "library";
  const D = ctx.m.x.docx;
  const body = { library, forms: () => formsTab(ctx, X), documents: () => documents(ctx, D), products: () => productsTab(ctx, D), index: () => indexTab(ctx, D), search, modules, drive }[tab](ctx, X);
  return h("div.view",
    viewHeader(t("sop_title"), t("sop_sub3"), h("div.sop-tabs", segmented(TABS.map(([k, l]) => [k, t(l)]), tab, (v) => ctx.set("sopTab", v), t("sop_title"))),
      ctx.canEdit ? h("button.btn", { type: "button", onclick: () => ctx.add("sop") }, icon("plus", 16), t("add_sop")) : null),
    body);
}

// ---------- library ----------
function library(ctx, X) {
  const L = X.list;
  const f = ctx.state.sopF ?? {};
  const D = ctx.m.x.docx;
  const unlisted = new Set(D.unlisted.filter((d) => d.kind === "sop").map((d) => d.ref.key));
  const setF = (k, v) => ctx.set("sopF", { ...f, [k]: v, show: k === "show" ? v : 48 });
  const qx = String(f.q ?? "").trim().toLowerCase();
  const F = L.filter((s) => (!f.dept || f.dept === ALL || s.Department === f.dept) && (!f.site || f.site === ALL || s.Site === f.site) && (!f.lang || f.lang === ALL || s.Language === f.lang)
    && (!f.status || f.status === ALL || (f.status === "drive" ? s.inDrive : f.status === "nodrive" ? !s.inDrive : f.status === "unread" ? s.inDrive && !s.indexed
      : f.status === "ix-newer" ? s.idx?.state === "drive-newer" : f.status === "ix-listed" ? Boolean(s.idx) : f.status === "ix-unlisted" ? unlisted.has(s.key) : s.reviewStatus === f.status))
    && (!f.topic || f.topic === ALL || s.topics.includes(f.topic))
    && (!qx || `${s.Code} ${s.Title ?? ""} ${s.Purpose ?? ""} ${s["Drive file"] ?? ""}`.toLowerCase().includes(qx)));
  const depts = [...new Set(L.map((s) => s.Department).filter(Boolean))].sort((a, b) => L.filter((s) => s.Department === b).length - L.filter((s) => s.Department === a).length);
  const sites = [...new Set(L.map((s) => s.Site).filter(Boolean))];
  const langs = [...new Set(L.map((s) => s.Language).filter(Boolean))];
  const inDrive = L.filter((s) => s.inDrive), indexed = L.filter((s) => s.indexed), dated = L.filter((s) => s.next != null);
  const by = (k) => L.filter((s) => s.reviewStatus === k);
  const show = +(f.show ?? 48);
  const years = [...new Set(L.map((s) => (s.eff != null ? new Date(s.eff).getUTCFullYear() : null)).filter(Boolean))].sort();
  const linked = L.filter((s) => s.topics.length);
  return [
    h("section.sop-hero",
      h("div.sop-hero-text",
        h("span.eyebrow", t("sop_eyebrow")),
        h("h2", `${fmtNum(L.length)} ${t("sop_procedures")}`),
        h("p", t("sop_hero_sub", fmtNum(inDrive.length), fmtNum(depts.length), fmtNum(indexed.length))),
        h("div.hero-meta",
          ...X.sources.map((src) => h("a.chip.chip-glass", { href: `https://drive.google.com/drive/folders/${encodeURIComponent(src.folderId)}`, target: "_blank", rel: "noopener" }, icon("globe", 13), src.Name || "Drive",
            src["Last sync"] ? h("small", ` · ${t("sop_synced")} ${fmtDate(toDay(src["Last sync"]))}`) : null)),
          !X.sources.length ? h("span.chip.chip-glass", t("sop_no_source")) : null)),
      h("div.apqr-rings",
        h("div.hero-ring", ring(dated.length ? by("In date").length / dated.length : null, { size: 88, color: "#5fe0b0" }), h("span", t("sop_r_indate"))),
        h("div.hero-ring", ring(inDrive.length ? indexed.length / inDrive.length : null, { size: 88, color: "#8fc1ff" }), h("span", t("sop_r_read"))),
        h("div.hero-ring", ring(L.length ? linked.length / L.length : null, { size: 88, color: "#ffd27a" }), h("span", t("sop_r_linked"))))),
    inDrive.some((s) => !s.summary) ? h("div.banner.info", icon("report", 18), h("span", t("sop_index_hint2", fmtNum(inDrive.filter((s) => !s.summary).length)), " ", h("button.link", { type: "button", onclick: () => ctx.set("sopTab", "drive") }, t("sop_t_drive")))) : null,
    h("div.kpi-grid.six",
      kpi({ label: t("sop_k_n"), value: fmtNum(L.length), hint: `${fmtNum(L.filter((s) => s.Site === "Oncology").length)} ${t("sop_onc").toLowerCase()} · ${fmtNum(L.filter((s) => s.Site !== "Oncology").length)} ${t("sop_general").toLowerCase()}`, accent: "var(--c1)", onclick: () => setF("status", ALL) }),
      kpi({ label: t("sop_k_drive"), value: fmtNum(inDrive.length), hint: `${fmtNum(L.length - inDrive.length)} ${t("sop_k_nodrive").toLowerCase()}`, accent: "var(--c7)", onclick: () => setF("status", "drive") }),
      kpi({ label: t("sop_k_read"), value: fmtNum(indexed.length), hint: inDrive.length ? `${fmtPct(indexed.length / inDrive.length)} ${t("sop_of_drive")}` : null, accent: "var(--c3)", onclick: () => setF("status", "unread") }),
      kpi({ label: t("sop_k_od"), value: fmtNum(by("Overdue").length), status: by("Overdue").length ? 1 : dated.length ? 3 : 0, onclick: () => setF("status", "Overdue") }),
      kpi({ label: t("sop_k_90"), value: fmtNum(by("Due ≤90 d").length), accent: "var(--warning)", onclick: () => setF("status", "Due ≤90 d") }),
      kpi({ label: t("sop_k_nodate"), value: fmtNum(by("No review date").length), accent: "var(--muted-mark)", onclick: () => setF("status", "No review date") })),
    D.indexes.length ? h("div.ix-strip",
      h("span.sop-strip-k", icon("report", 14), t("sop_ix_strip")),
      [["ix-listed", L.filter((s) => s.idx).length, "var(--c1)", t("sop_f_listed")], ["ix-newer", L.filter((s) => s.idx?.state === "drive-newer").length, STATE_COLOR["drive-newer"], t("sop_f_newer")],
        ["ix-unlisted", unlisted.size, STATE_COLOR.unlisted, t("sop_f_unlisted")]].map(([k, n, c, l]) => h("button.sop-chip", { type: "button", style: { "--dot": c }, onclick: () => setF("status", k) }, h("i"), h("b", fmtNum(n)), h("span", l))),
      h("button.link", { type: "button", onclick: () => ctx.set("sopTab", "index") }, t("sop_t_index"), " →")) : null,
    h("div.grid.cols-3",
      card(t("sop_c_dept"), stacks(depts.map((d) => ({ label: `${d} · ${deptName(d)}`, parts: Object.fromEntries(sites.map((st) => [st, L.filter((s) => s.Department === d && s.Site === st).length])), onclick: () => setF("dept", d) })),
        sites.map((st, i) => ({ key: st, label: st === "Oncology" ? t("sop_onc") : st === "General" ? t("sop_general") : st, color: ["var(--c1)", "var(--c4)", "var(--c3)"][i % 3] })))),
      card(t("sop_c_review"), donut(Object.keys(REVIEW_COLOR).map((k) => ({ label: tv(k), value: by(k).length, color: REVIEW_COLOR[k], onclick: () => setF("status", k) })), { center: fmtNum(L.length), sub: t("sop_procedures") }), { sub: t("sop_c_review_sub") }),
      card(t("sop_c_lang"), donut(langs.map((l, i) => ({ label: tv(l), value: L.filter((s) => s.Language === l).length, color: ["var(--c1)", "var(--c2)", "var(--c3)"][i % 3], onclick: () => setF("lang", l) })), { center: fmtNum(langs.length), sub: t("sop_languages") })),
      years.length ? card(t("sop_c_years"), hbars(years.map((y) => ({ label: String(y), value: L.filter((s) => s.eff != null && new Date(s.eff).getUTCFullYear() === y).length, color: y <= new Date().getUTCFullYear() - 3 ? "var(--critical)" : "var(--c1)" }))), { sub: t("sop_c_years_sub") }) : null,
      L.some((s) => s.citedBy.length) ? card(t("sop_c_cited"), hbars([...L].filter((s) => s.citedBy.length).sort((a, b) => b.citedBy.length - a.citedBy.length).slice(0, 10).map((s) => ({ label: `${s.Code} · ${short(s.Title, 34)}`, value: s.citedBy.length, color: DEPT_COLOR[s.Department] ?? "var(--c1)", onclick: () => ctx.go("sops", { code: s.Code }) }))), { sub: t("sop_c_cited_sub") }) : null,
      card(t("sop_c_topics"), hbars(SOP_TOPICS.map(([id]) => ({ label: topicName(id), value: X.byTopic.get(id)?.length ?? 0, color: (X.byTopic.get(id)?.length ?? 0) ? "var(--c3)" : "var(--critical)", onclick: () => setF("topic", id) })).sort((a, b) => b.value - a.value).slice(0, 12)), { sub: t("sop_c_topics_sub") })),
    card(null, h("div.filters.sop-filters",
      h("label.field.grow", h("span", t("sop_find")), h("input", { type: "search", value: f.q ?? "", placeholder: t("sop_find_ph"), onchange: (e) => setF("q", e.target.value) })),
      select(t("col_dept"), [[ALL, t("filter_all")], ...depts.map((d) => [d, `${d} · ${deptName(d)}`])], f.dept ?? ALL, (v) => setF("dept", v)),
      select("Site", [[ALL, t("filter_all")], ...sites.map((x) => [x, x === "Oncology" ? t("sop_onc") : x === "General" ? t("sop_general") : x])], f.site ?? ALL, (v) => setF("site", v)),
      select(t("sop_lang"), [[ALL, t("filter_all")], ...langs.map((x) => [x, tv(x)])], f.lang ?? ALL, (v) => setF("lang", v)),
      select(t("col_status"), [[ALL, t("filter_all")], ...Object.keys(REVIEW_COLOR).map((k) => [k, tv(k)]), ["drive", t("sop_k_drive")], ["nodrive", t("sop_k_nodrive")], ["unread", t("sop_unread")],
        ...(D.indexes.length ? [["ix-listed", t("sop_f_listed")], ["ix-newer", t("sop_f_newer")], ["ix-unlisted", t("sop_f_unlisted")]] : [])], f.status ?? ALL, (v) => setF("status", v)),
      select(t("sop_topic"), [[ALL, t("filter_all")], ...SOP_TOPICS.map(([id]) => [id, topicName(id)])], f.topic ?? ALL, (v) => setF("topic", v)),
      h("div.field", h("span", t("sop_view")), segmented([["cards", t("sop_cards")], ["table", t("sop_table")]], f.view ?? "cards", (v) => setF("view", v), t("sop_view")))), { cls: "filter-card" }),
    (f.view ?? "cards") === "table"
      ? card(`${t("sop_procedures")} · ${fmtNum(F.length)}`, dataTable(sopTableCols(), F, { pageSize: 40, onRow: (s) => ctx.go("sops", { code: s.Code }), searchText: (s) => `${s.Code} ${s.Title} ${s.Purpose ?? ""}`, exportName: "sop-library" }))
      : h("div",
        h("p.sop-count", `${fmtNum(F.length)} ${t("sop_procedures")}`),
        F.length ? h("div.sop-grid", F.slice(0, show).map((s, i) => sopCard(ctx, s, i))) : h("div.empty", t("none_found")),
        F.length > show ? h("p.center", h("button.btn", { type: "button", onclick: () => setF("show", show + 96) }, t("sop_more", fmtNum(Math.min(96, F.length - show))))) : null),
  ];
}
export function sopTableCols() {
  return [
    { key: "Code", label: t("col_code"), cls: "mono nowrap" },
    { key: "Title", label: t("col_title"), cls: "wrap", render: (s) => (s.Title ? h("b", s.Title) : h("span.muted", short(s.Purpose ?? "—", 80))) },
    { key: "Department", label: t("col_dept") },
    { key: "Site", label: "Site" },
    { key: "Language", label: t("sop_lang"), render: (s) => tv(s.Language ?? "") },
    { key: "Revision", label: t("col_rev"), cls: "num" },
    { key: "eff", label: t("sop_effective"), cls: "num nowrap", render: (s) => fmtDate(s.eff) },
    { key: "next", label: t("col_nextrev"), cls: "nowrap", sort: (s) => s.next ?? 9e15, render: reviewPill },
    { key: "inDrive", label: "Drive", render: (s) => (s.inDrive ? h("a.icon-link", { href: driveUrl(s["Drive ID"]), target: "_blank", rel: "noopener", title: s["Drive file"], onclick: (e) => e.stopPropagation() }, icon("globe", 14)) : h("span.muted", "—")) },
    { key: "topics", label: t("sop_used_in"), render: (s) => s.topics.slice(0, 2).map(topicName).join(" · ") },
  ];
}
function sopCard(ctx, s, i) {
  return h("a.sop-card", { href: sopHref(s.Code), style: { "--c": DEPT_COLOR[s.Department] ?? "var(--c1)", "--i": Math.min(i, 24) }, class: /obsolete/i.test(s.Status ?? "") ? "zone-obsolete" : "" },
    h("header", h("span.sop-code", s.Code), s.Revision ? h("span.sop-rev", `rev ${s.Revision}`) : null, s.Language ? h("span.sop-lang", s.Language === "French" ? "FR" : s.Language === "English" ? "EN" : s.Language.slice(0, 2).toUpperCase()) : null,
      h("span.spacer"), s.forms?.length ? h("span.sop-badge", { title: `${fmtNum(s.forms.length)} ${t("frm_short")}` }, icon("edit", 11), fmtNum(s.forms.length)) : null,
      s.summary ? h("span.sop-badge", { class: s.summary.by === "claude" ? "ai" : "", title: s.summary.by === "claude" ? t("sum_badge_ai") : t("sum_badge_app") }, icon(s.summary.by === "claude" ? "sparkle" : "report", 11)) : null,
      s.idx ? h("span.sop-ix", { title: `${s.idx.index} · rev ${s.idx.rev} · ${stateLabel(s.idx.state)}`, style: { "--dot": STATE_COLOR[s.idx.state] } }, h("i")) : null,
      s.inDrive ? h("span.sop-drive", { title: s.indexed ? t("sop_read_ok") : t("sop_in_drive") }, icon(s.indexed ? "check" : "globe", 13)) : null),
    h("h3", s.Title || h("span.muted", t("sop_untitled"))),
    s.summary?.purpose || s.Purpose ? h("p.sop-purpose", s.summary?.purpose || s.Purpose) : null,
    h("footer", reviewPill(s), h("span.sop-tags", s.topics.slice(0, 2).map((x) => h("span.tag", topicName(x))))));
}

// ---------- one SOP: its résumé, its forms and attachments and where it stands — the full text stays in Drive ----------
export const KIND_COLOR = { form: "var(--c1)", logbook: "var(--c7)", checklist: "var(--c3)", template: "var(--c4)", attachment: "var(--c5)" };
export const KIND_ICON = { form: "edit", logbook: "report", checklist: "check", template: "sop", attachment: "layers" };
const kindName = (k) => t(`frm_k_${k ?? "form"}`);

function sopPage(ctx, code) {
  const X = ctx.m.x.sopx;
  const s = X.byKey.get(sopKey(code)) ?? X.list.find((x) => x.Code === code);
  const back = h("a.crumb", { href: "#/sops" }, h("span.flip", icon("chevron", 15)), t("sop_title"));
  if (!s) return h("div.view", h("nav.crumbs", back), h("div.banner.warn", icon("alert", 18), t("sop_not_found", code)));
  const at = X.list.indexOf(s), prev = X.list[at - 1], next = X.list[at + 1];
  const fileId = s["Drive ID"];
  const sum = s.summary;
  // the résumé and the forms come from reading the file once; an editor's visit reads it when they are missing or out of date
  const stale = fileId && (!sum || !s.Forms || (s["Drive modified"] && sum.src && sum.src !== s["Drive modified"] && sum.by !== "claude"));
  let d = fileId ? state.docs.get(fileId) : null;
  if (stale && ctx.canEdit && !d && state.drive !== false) { d = { status: "loading" }; state.docs.set(fileId, d); loadDoc(ctx, s, d); }
  const doc = d?.doc;
  const flags = [];
  if (doc?.header?.code && sopKey(doc.header.code) && sopKey(doc.header.code).replace("/ONC", "") !== s.key.replace("/ONC", "")) flags.push(t("sop_flag_header", doc.header.code));
  if (doc?.header?.rev && s.Revision && doc.header.rev !== s.Revision) flags.push(t("sop_flag_rev", doc.header.rev, s.Revision));
  if (!s.Title) flags.push(t("sop_flag_title"));
  if (s.next == null && !/obsolete/i.test(s.Status ?? "")) flags.push(t("sop_flag_review"));
  if (s.files > 1) flags.push(t("sop_flag_copies", fmtNum(s.files)));
  if (/obsolete/i.test(s.Status ?? "")) flags.push(t("sop_flag_obsolete"));
  if (+s.Uncontrolled) flags.push(t("sop_flag_uncontrolled", fmtNum(+s.Uncontrolled)));
  const ix = s.idx;
  if (ix?.state === "drive-newer") flags.push(t("sop_flag_newer", s.Revision, ix.index, ix.rev) + (ix.hasListedRev ? "" : ` ${t("sop_flag_nolisted", ix.rev)}`));
  if (ix?.state === "drive-older") flags.push(t("sop_flag_older", ix.index, ix.rev, s.Revision));
  if (!ix && s.inDrive && ctx.m.x.docx.unlisted.some((x) => x.kind === "sop" && x.ref === s)) flags.push(t("sop_flag_unlisted"));
  const forms = sopFormsOf(X, s);
  const mism = forms.filter((f) => f.mismatch);
  if (mism.length) flags.push(t("frm_flag_mismatch", mism.map((f) => `${f.code} (${f.citedRev} ≠ ${f.attachedRev})`).join(", ")));
  const activities = QA_ACTIVITIES.filter(([id]) => (ACTIVITY_TOPICS[id] ?? []).some((x) => s.topics.includes(x)));
  const history = sum?.history ?? doc?.history ?? [];
  return h("div.view.sop-page",
    h("nav.crumbs", back, h("span.crumb-sep", "/"), h("span.crumb-here", s.Code), h("span.spacer"),
      h("span.crumb-pos", `${fmtNum(at + 1)} / ${fmtNum(X.list.length)}`),
      h("a.icon-btn", { href: prev ? sopHref(prev.Code) : null, "aria-disabled": prev ? null : "true", title: prev?.Code ?? "", "aria-label": t("previous") }, h("span.flip", icon("chevron", 17))),
      h("a.icon-btn", { href: next ? sopHref(next.Code) : null, "aria-disabled": next ? null : "true", title: next?.Code ?? "", "aria-label": t("next") }, icon("chevron", 17))),
    h("section.sop-page-hero", { style: { "--c": DEPT_COLOR[s.Department] ?? "var(--c1)" } },
      h("div",
        h("span.eyebrow", [s.Code, s.Revision ? `rev ${s.Revision}` : null, deptName(s.Department)].filter(Boolean).join(" · ")),
        h("h2", s.Title || doc?.header?.title || t("sop_untitled")),
        sum?.purpose || s.Purpose ? h("p", short(sum?.purpose || s.Purpose, 260)) : null,
        h("div.hero-meta",
          h("span.chip.chip-glass", s.Site === "Oncology" ? t("sop_onc") : s.Site === "General" ? t("sop_general") : s.Site ?? "—"),
          s.Language ? h("span.chip.chip-glass", tv(s.Language)) : null,
          s.Status ? h("span.chip.chip-glass", tv(s.Status)) : null,
          forms.length ? h("span.chip.chip-glass", icon("edit", 12), ` ${fmtNum(forms.length)} ${t("frm_short")}`) : null,
          ...s.topics.map((x) => h("span.chip.chip-glass", topicName(x))))),
      h("div.sop-review", { class: (s.reviewStatus ?? "").replace(/\W+/g, "-").toLowerCase() },
        h("small", t("sop_effective")), h("b", fmtDate(s.eff) || "—"),
        h("small", t("col_nextrev")), h("b", fmtDate(s.next) || "—"),
        h("span", tv(s.reviewStatus), s.nextFromEffective ? h("small", ` · ${t("sop_next_rule")}`) : s.datesFromIndex ? h("small", ` · ${t("sop_from_index")}`) : null))),
    h("div.sop-actions",
      fileId ? h("a.btn.primary.compact", { href: driveUrl(fileId), target: "_blank", rel: "noopener" }, icon("globe", 15), t("sop_open_full")) : null,
      fileId && ctx.canEdit ? aiButton(ctx, s) : null,
      fileId && ctx.canEdit ? h("button.btn.compact", { type: "button", title: t("sop_reread_t"), onclick: () => { const nd = { status: "loading" }; state.docs.set(fileId, nd); loadDoc(ctx, s, nd, true, true); ctx.rerender(); } }, icon("cycle", 15), t("sop_reread")) : null,
      ctx.canEdit ? h("button.btn.compact", { type: "button", onclick: () => ctx.edit("sop", s.__key, `${s.Code} · ${s.Title ?? ""}`) }, icon("edit", 15), t("edit")) : null),
    flags.length ? h("div.banner.warn", icon("alert", 18), h("span", flags.join(" · "))) : null,
    h("div.sop-layout",
      h("div.sop-main",
        resumeCard(ctx, X, s, sum, d),
        formsCard(ctx, X, s, forms, d)),
      h("aside.sop-side",
        card(t("sop_facts"), h("dl.deflist.compact",
          [[t("col_dept"), deptName(s.Department)], ["Site", s.Site], [t("sop_lang"), tv(s.Language ?? "")], [t("col_type"), s.Type], [t("col_status"), tv(s.Status ?? "")], [t("col_rev"), s.Revision],
            [t("sop_effective"), fmtDate(s.eff)], [t("col_nextrev"), fmtDate(s.next)], [t("col_owner"), s.Owner], [t("sop_drive_mod"), fmtDate(toDay(s["Drive modified"]))],
            [t("sop_read_on"), s.Indexed ? fmtDate(toDay(s.Indexed)) : null], [t("source"), s.Source], [t("doc_folder"), s.inDrive ? s.Folder || "/" : null], [t("doc_revisions"), s.Revisions],
            [t("doc_obsolete_n"), s.Obsolete], [t("doc_uncontrolled_n"), s.Uncontrolled], [t("sop_rooms"), s["Linked rooms"]], [t("sop_equipment"), s["Linked equipment"]]]
            .filter(([, v]) => v != null && v !== "").flatMap(([k, v]) => [h("dt", k), h("dd", v)]))),
        ix ? card(t("ix_entry"), h("div.doc-index-box",
          h("p", t("ix_entry_line", ix.index, ix.rev ?? "—", fmtDate(ix.effective) || "—", fmtDate(ix.validity) || "—")),
          h("p", dot(STATE_COLOR[ix.state], stateLabel(ix.state)), s.Revisions ? h("small.muted", ` · ${t("doc_revisions")}: ${s.Revisions}`) : null),
          ix.anomalies.length ? h("p.warn-text", ix.anomalies.map((a) => t(`ix_a_${a === "same-date" ? "same" : a}`)).join(" · ")) : null), { sub: t("ix_entry_sub") }) : null,
        card(t("sop_used_in"), s.topics.length ? h("div.sop-uses",
          s.topics.map((x) => h("div.sop-use", h("b", topicName(x)), h("span", (ROUTES_OF[x] ?? []).map((r) => h("a.tag", { href: `#/${r}` }, t(ROUTE_LABEL[r] ?? r)))))),
          activities.length ? h("p.fine", `${t("qaa_title")}: `, activities.map(([id, name]) => h("span.tag", { title: name }, id))) : null)
          : h("p.muted", t("sop_no_topic")), { sub: ctx.canEdit ? t("sop_used_sub") : null }),
        (s.dist.length || doc?.distribution?.length) ? card(t("sop_distribution"), h("div.sop-chips", (s.dist.length ? s.dist : deptCodes(doc.distribution)).map((x) => h("span.tag", `${x} · ${deptName(x)}`))), { sub: t("sop_distribution_sub") }) : null,
        card(t("sop_links"), h("div.sop-linklists",
          h("div", h("h4", `${t("sop_cites")} · ${fmtNum((s.refKeys.length ? s.refKeys : (doc?.refs ?? []).map(sopKey)).filter((k) => k && k !== s.key).length)}`),
            codeList(ctx, X, s.refKeys.length ? s.refKeys : [...new Set((doc?.refs ?? []).map(sopKey).filter((k) => k && k !== s.key))])),
          h("div", h("h4", `${t("sop_cited_by")} · ${fmtNum(s.citedBy.length)}`), s.citedBy.length ? h("ul.mini-codes", s.citedBy.map((x) => h("li", h("a", { href: sopHref(x.Code) }, h("b", x.Code), ` ${short(x.Title, 40)}`)))) : h("p.muted", s.indexed ? t("none_found") : t("sop_cited_wait"))))),
        (s.changes.length || doc?.changes?.length) ? card(t("sop_changes"), h("div.sop-chips", (s.changes.length ? s.changes : doc.changes).map((c) => h("span.tag.mono", c)))) : null,
        history.length ? card(t("sop_history"), h("ol.sop-history", [...history].reverse().map((x) => h("li", h("b", `rev ${x.ver}`), x.date ? h("small", ` · ${fmtDate(toDay(x.date))}`) : null, x.text ? h("p", short(x.text, 140)) : null)))) : null,
        fileId ? card(t("sop_files"), filesView(ctx, X, s)) : null)));
}

/** The forms an SOP owns or uses, from the register (its own record first). */
export function sopFormsOf(X, s) {
  const seen = new Set();
  return (s.forms ?? []).map((f) => X.formsByKey?.get(f.key) ?? f).filter((f) => f?.key && !seen.has(f.key) && seen.add(f.key));
}

// the SOP's résumé: purpose, who does what, the key steps, the critical points — written by Claude or extracted by the app
function resumeCard(ctx, X, s, sum, d) {
  const job = state.ai.get(s.Code);
  const reading = d?.status === "loading";
  const by = sum?.by === "claude" ? t("sum_by_claude", fmtDate(toDay(sum.at)) || "—", sum.rev ?? "—") : sum ? t("sum_by_app", sum.rev ?? s.Revision ?? "—") : null;
  const formLink = (c) => { const k = formKey(c); const f = k && X.formsByKey?.get(k); return h("button.form-chip", { type: "button", title: f?.title ?? c, onclick: () => (f ? openForm(ctx, X, f) : null) }, icon("edit", 11), c.replace(/\/Onc/, "")); };
  let body;
  if (job?.status === "running") body = h("div.sum-wait", h("span.spinner"), h("div", h("b", t("sum_writing")), h("p.muted", t("sum_writing_sub"))), h("button.btn.compact.ghost", { type: "button", onclick: () => job.ctl?.abort() }, t("sop_stop")));
  else if (!sum) body = h("div.sum-empty",
    reading ? h("p", h("span.spinner"), ` ${t("sum_reading")}`) : h("p.muted", s["Drive ID"] ? t("sum_none") : t("sop_no_file")),
    d?.status === "error" ? h("p.warn-text", t(driveProblem(d.error))) : null,
    s["Drive ID"] ? h("a.btn.compact", { href: driveUrl(s["Drive ID"]), target: "_blank", rel: "noopener" }, icon("globe", 14), t("sop_open_full")) : null);
  else {
    const phases = [];
    for (const st of sum.steps ?? []) { const last = phases.at(-1); if (last && last.phase === (st.phase || null)) last.steps.push(st); else phases.push({ phase: st.phase || null, steps: [st] }); }
    let n = 0;
    body = h("div.sum",
      h("div.sum-what",
        sum.purpose ? h("div", h("small", t("sum_purpose")), h("p", sum.purpose)) : null,
        sum.scope ? h("div", h("small", t("sum_scope")), h("p", sum.scope)) : null,
        sum.trigger ? h("div", h("small", t("sum_trigger")), h("p", sum.trigger)) : null),
      sum.roles?.length ? h("div.sum-block", h("h4", icon("cap", 15), t("sum_roles")), h("div.sum-roles", sum.roles.map((r) => h("div.sum-role", h("b", r.role), h("span", r.duties))))) : null,
      phases.length ? h("div.sum-block", h("h4", icon("tasks", 15), t("sum_steps")), h("div.sum-steps", phases.map((ph) => h("div.sum-phase",
        ph.phase ? h("h5", ph.phase) : null,
        h("ol", ph.steps.map((st) => { n++; return h("li", { "data-n": n },
          h("span.sum-do", st.do),
          st.who ? h("span.sum-who", st.who) : null,
          (st.records ?? []).length ? h("span.sum-recs", st.records.map(formLink)) : null); })))))) : null,
      sum.critical?.length ? h("div.sum-block.crit", h("h4", icon("alert", 15), t("sum_critical")), h("ul", sum.critical.map((c) => h("li", c)))) : null,
      sum.training ? h("p.sum-training", icon("cap", 14), ` ${sum.training}`) : null);
  }
  return card(t("sum_title"), body, { cls: "sum-card", sub: by,
    actions: s["Drive ID"] ? h("a.link", { href: driveUrl(s["Drive ID"]), target: "_blank", rel: "noopener" }, t("sum_full_drive"), " ↗") : null });
}

// "Write the résumé with Claude" (editors; only where this view can ask Claude)
function aiButton(ctx, s) {
  if (state.ai.get("__none")) return null;
  const job = state.ai.get(s.Code);
  const has = s.summary?.by === "claude";
  const lang = getLang() === "FR" ? "FR" : "EN";
  const run = async () => {
    const st = { status: "running", ctl: new AbortController() };
    state.ai.set(s.Code, st); ctx.rerender();
    try {
      const patch = await summarizeSop(s, { lang, signal: st.ctl.signal });
      await ctx.saveObj("sop", s.__key, patch, true);
      state.ai.set(s.Code, { status: "ok" });
    } catch (e) {
      const key = aiProblem(e);
      state.ai.set(s.Code, { status: key === "ai_e_cancelled" ? "idle" : "error", problem: key });
      if (key === "ai_e_allow" || key === "ai_e_off") state.ai.set("__none", true);
      if (key !== "ai_e_cancelled") ctx.toast?.(t(key), "warn");
    }
    ctx.rerender();
  };
  return h("button.btn.compact.ai-btn", { type: "button", disabled: job?.status === "running" || state.aiAvailable === false ? true : null, title: t("sum_ai_t"), onclick: run },
    icon("sparkle", 15), job?.status === "running" ? t("sum_writing") : has ? t("sum_ai_again") : t("sum_ai"));
}

// forms, templates and attachments of the SOP, each with what it records; forms of other SOPs it uses; separate files in Drive
function formsCard(ctx, X, s, forms, d) {
  const own = forms.filter((f) => !f.owner || f.owner === s);
  const other = forms.filter((f) => f.owner && f.owner !== s);
  const files = ctx.m.x.docx.list.filter((x) => x.Type === "TE" && String(x.Code).replace(/-/g, "/").startsWith(s.Code.replace(/^SOP/, "").replace(/\/Onc$/i, "").replace(/[EF]$/, "")));
  const row = (f) => h("button.form-row", { type: "button", style: { "--c": KIND_COLOR[f.kind] ?? "var(--c1)" }, onclick: () => openForm(ctx, X, f) },
    h("span.form-ic", icon(KIND_ICON[f.kind] ?? "edit", 16)),
    h("span.form-main",
      h("span.form-top", h("b.mono", f.code.replace(/\/Onc/, "")), h("span.tag", kindName(f.kind)), f.rev ? h("span.sop-rev", `rev ${f.rev}`) : null,
        f.mismatch ? h("span.tag.warn", t("frm_rev_mismatch", f.citedRev, f.attachedRev)) : null),
      h("span.form-title", f.title || h("span.muted", t("frm_untitled"))),
      h("span.form-meta",
        f.attached ? h("span.ok-mini", icon("check", 12), ` ${t("frm_attached")}`) : h("span.warn-mini", t("frm_listed_only")),
        f.steps?.length ? h("span", ` · ${t("frm_in_steps", f.steps.map((x) => x.n).join(", "))}`) : null,
        f.fields?.length || f.columns?.length || f.sections?.length ? h("span", ` · ${fmtNum((f.sections?.length ?? 0) + (f.fields?.length ?? 0) + (f.columns?.length ?? 0))} ${t("frm_items")}`) : null,
        f.usedBy?.length ? h("span", ` · ${t("frm_used_by_n", fmtNum(f.usedBy.length))}`) : null)),
    h("span.form-go", icon("chevron", 15)));
  const body = !forms.length && !files.length
    ? h("p.muted", s.Forms ? t("frm_none") : d?.status === "loading" ? t("sum_reading") : t("frm_unknown"))
    : h("div.form-list",
      own.length ? own.map(row) : null,
      other.length ? [h("h5.form-sub", t("frm_other_sops")), ...other.map((f) => h("div.form-other", row(f), h("a.tag", { href: sopHref(f.owner.Code) }, f.owner.Code)))] : null,
      files.length ? [h("h5.form-sub", t("frm_files")), ...files.map((x) => h("a.form-file", { href: driveUrl(x["Drive ID"]), target: "_blank", rel: "noopener" }, icon("globe", 13), h("b", x.Code), ` ${short(x.Title, 60)}`))] : null);
  return card(t("frm_title"), body, { sub: forms.length ? t("frm_sub", fmtNum(forms.filter((f) => f.attached).length), fmtNum(forms.length)) : null });
}

/** One form in the drawer: what it is, what it records, its revisions, the SOP that owns it and the SOPs and steps that use it. */
export function openForm(ctx, X, f) {
  const owner = f.owner;
  ctx.open.drawer(() => [
    h("div.d-head", h("span.d-ref", `${kindName(f.kind)} · ${f.code.replace(/\/Onc/, "/Onc")}`), h("h2", f.title || f.code)),
    h("div.form-actions",
      owner?.["Drive ID"] ? h("a.btn.primary.compact", { href: driveUrl(owner["Drive ID"]), target: "_blank", rel: "noopener" }, icon("globe", 15), f.attached ? t("frm_open_in_sop") : t("sop_open_full")) : null,
      f.file?.["Drive ID"] ? h("a.btn.compact", { href: driveUrl(f.file["Drive ID"]), target: "_blank", rel: "noopener" }, icon("globe", 15), t("frm_open_file")) : null,
      owner ? h("a.btn.compact", { href: sopHref(owner.Code), onclick: () => ctx.closeDrawer() }, icon("sop", 15), owner.Code) : null),
    f.mismatch ? h("div.banner.warn", icon("alert", 18), h("span", t("frm_mismatch_long", f.citedRev, f.attachedRev))) : null,
    !f.attached ? h("div.banner.info", icon("report", 18), h("span", t("frm_not_attached_long"))) : null,
    h("dl.deflist", [[t("col_type"), kindName(f.kind)], [t("frm_owner"), owner ? `${owner.Code} · ${short(owner.Title, 60)}` : t("frm_no_owner")], [t("frm_rev_listed"), f.citedRev], [t("frm_rev_attached"), f.attachedRev],
      [t("frm_register"), f.register ? [f.register.Type, f.register.Status, f.register["Linked room"], f.register["Linked equipment"]].filter(Boolean).join(" · ") : null]]
      .filter(([, v]) => v != null && v !== "").flatMap(([k, v]) => [h("dt", k), h("dd", v)])),
    f.sections?.length ? h("div.form-prev", h("h4", t("frm_sections")), h("ol", f.sections.map((x) => h("li", x)))) : null,
    f.fields?.length ? h("div.form-prev", h("h4", t("frm_fields")), h("div.sop-chips", f.fields.map((x) => h("span.tag", x)))) : null,
    f.columns?.length ? h("div.form-prev", h("h4", t("frm_columns")), h("div.form-cols", f.columns.map((x) => h("span", x)))) : null,
    !f.sections?.length && !f.fields?.length && !f.columns?.length ? h("p.muted", t("frm_no_preview")) : null,
    f.steps?.length ? h("div.form-prev", h("h4", t("frm_steps")), h("ol", f.steps.map((x) => h("li", { value: x.n }, x.do)))) : null,
    f.usedBy?.length ? h("div.form-prev", h("h4", t("frm_used_by")), h("ul.mini-codes", f.usedBy.map((x) => h("li", h("a", { href: sopHref(x.Code), onclick: () => ctx.closeDrawer() }, h("b", x.Code), ` ${short(x.Title, 50)}`))))) : null,
  ]);
}

async function loadDoc(ctx, s, d, fresh, force) {
  try {
    const p = await readFile(s["Drive ID"], { fresh });
    d.status = "ok"; d.doc = parseSopText(p?.fileContent ?? "");
    // reading an SOP keeps the register current: résumé, forms, purpose, references (editors only)
    if (ctx.canEdit && s.__key && (force || s.Indexed !== (s["Drive modified"] || null) || !s.Summary || !s.Forms)) {
      const patch = indexFields(s, d.doc, isoToday(), p?.fileContent ?? "");
      delete patch.Code;
      ctx.saveObj("sop", s.__key, patch, true).catch(() => {});
    }
  } catch (e) { d.status = "error"; d.error = e; }
  ctx.rerender();
}

function codeList(ctx, X, keys) {
  if (!keys.length) return h("p.muted", t("none_found"));
  return h("ul.mini-codes", keys.map((k) => { const x = X.byKey.get(k); return h("li", x ? h("a", { href: sopHref(x.Code) }, h("b", x.Code), ` ${short(x.Title, 40)}`) : h("span.muted", k, ` · ${t("sop_not_in_library")}`)); }));
}

function filesView(ctx, X, s) {
  const box = h("div.sop-files", h("button.btn.compact.ghost", { type: "button", onclick: async () => {
    box.replaceChildren(h("span.spinner"));
    const base = s.Code.match(/^[A-Z]+\d+/)?.[0] ?? s.Code;
    try {
      const files = await filesNamed(sourceFolders(X.sources), base);
      box.replaceChildren(files.length ? h("ul.mini-codes", files.map((f) => { const p = parseSopFileName(f.title); return h("li", { class: f.id === s["Drive ID"] ? "current" : "" },
        h("a", { href: driveUrl(f.id), target: "_blank", rel: "noopener" }, h("b", p?.code ?? f.title), p?.rev ? ` rev ${p.rev}` : "", f.id === s["Drive ID"] ? ` · ${t("sop_current")}` : ""), h("small", ` ${fmtDate(toDay(String(f.modifiedTime ?? "").slice(0, 10)))}`)); })) : h("p.muted", t("none_found")));
    } catch (e) { box.replaceChildren(h("p.warn-text", t(driveProblem(e)))); }
  } }, icon("search", 14), t("sop_files_show")));
  return box;
}

// ---------- search inside SOPs ----------
function search(ctx, X) {
  const S = state.search;
  const folders = sourceFolders(X.sources);
  const run = async (term) => {
    S.q = term; S.status = "loading"; S.error = null; S.matches = new Map(); ctx.rerender();
    try { S.files = await searchText(folders, term); S.status = "ok"; } catch (e) { S.status = "error"; S.error = e; }
    ctx.rerender();
  };
  const input = h("input", { type: "search", value: S.q, placeholder: t("sop_search_ph"), required: true });
  const local = S.q ? X.list.filter((s) => `${s.Code} ${s.Title ?? ""} ${s.Purpose ?? ""}`.toLowerCase().includes(S.q.toLowerCase())) : [];
  const showMatches = async (f) => {
    S.matches.set(f.id, { status: "loading" }); ctx.rerender();
    try { const p = await readFile(f.id); S.matches.set(f.id, { status: "ok", lines: matchesIn(p?.fileContent ?? "", S.q, 4) }); } catch (e) { S.matches.set(f.id, { status: "error", error: e }); }
    ctx.rerender();
  };
  return [
    card(null, h("form.sop-search", { onsubmit: (e) => { e.preventDefault(); const v = input.value.trim(); if (v) run(v); } },
      icon("search", 18), input, h("button.btn.primary", { type: "submit", disabled: !folders.length ? true : null }, t("sop_search_btn"))),
      { sub: folders.length ? t("sop_search_sub", fmtNum(folders.length)) : t("sop_no_source") }),
    S.status === "loading" ? h("div.sop-loading", h("span.spinner"), t("sop_searching")) : null,
    S.status === "error" ? h("div.banner.warn", icon("alert", 18), t(driveProblem(S.error))) : null,
    S.status === "ok" ? card(`${t("sop_search_hits")} · ${fmtNum(S.files.length)}`, S.files.length ? h("div.sop-hits", S.files.map((f) => {
      const p = parseSopFileName(f.title);
      const x = p ? X.byKey.get(p.key) : null;
      const m = S.matches.get(f.id);
      return h("article.sop-hit",
        h("header", h("a", { href: x ? sopHref(x.Code) : driveUrl(f.id), target: x ? null : "_blank" }, h("b", x?.Code ?? p?.code ?? f.title), ` ${x?.Title || p?.title || ""}`),
          h("span.spacer"), p?.rev ? h("span.sop-rev", `rev ${p.rev}`) : null, h("a.icon-link", { href: driveUrl(f.id), target: "_blank", rel: "noopener", title: f.title }, icon("globe", 14))),
        !m ? h("button.link", { type: "button", onclick: () => showMatches(f) }, t("sop_show_matches"))
          : m.status === "loading" ? h("span.spinner") : m.status === "error" ? h("p.warn-text", t(driveProblem(m.error)))
          : m.lines.length ? h("ul.sop-lines", m.lines.map((l) => h("li", ...highlight(l, S.q)))) : h("p.muted", t("sop_match_title")));
    })) : h("div.empty", t("none_found"))) : null,
    S.q && local.length ? card(`${t("sop_search_local")} · ${fmtNum(local.length)}`, dataTable(sopTableCols().slice(0, 4), local, { search: false, pageSize: 15, onRow: (s) => ctx.go("sops", { code: s.Code }) })) : null,
  ];
}
function highlight(text, term) {
  const i = text.toLowerCase().indexOf(term.toLowerCase());
  return i < 0 ? [text] : [text.slice(0, i), h("mark", text.slice(i, i + term.length)), text.slice(i + term.length)];
}

// ---------- which SOPs govern each page ----------
function modules(ctx, X) {
  const rows = SOP_TOPICS.map(([id]) => ({ id, name: topicName(id), sops: X.byTopic.get(id) ?? [], routes: ROUTES_OF[id] ?? [], linked: X.linkedTopics.has(id),
    acts: QA_ACTIVITIES.filter(([a]) => (ACTIVITY_TOPICS[a] ?? []).includes(id)).map(([a]) => a) }));
  const covered = rows.filter((r) => r.sops.length);
  return [
    h("div.kpi-grid",
      kpi({ label: t("sop_m_topics"), value: `${fmtNum(covered.length)} / ${fmtNum(rows.length)}`, accent: "var(--c3)" }),
      kpi({ label: t("sop_m_gaps"), value: fmtNum(rows.length - covered.length), status: rows.length - covered.length ? 2 : 3 }),
      kpi({ label: t("sop_m_linked"), value: fmtNum(X.list.filter((s) => s.topics.length).length), hint: `${fmtPct(X.list.length ? X.list.filter((s) => s.topics.length).length / X.list.length : 0)} ${t("sop_of_library")}` }),
      kpi({ label: t("sop_m_overrides"), value: fmtNum(X.links.length), accent: "var(--c7)" })),
    card(t("sop_t_modules"), h("div.sop-modules", rows.map((r) => h("section.sop-module", { class: r.sops.length ? "" : "gap" },
      h("header", h("b", r.name), r.linked ? h("span.tag", t("sop_m_manual")) : null, h("span.spacer"),
        ctx.canEdit ? h("button.btn.compact.ghost", { type: "button", onclick: () => ctx.addWith("sopLinks", { Topic: r.id }, r.name) }, icon("plus", 13), t("sop_m_link")) : null),
      h("div.sop-module-pages", r.routes.map((x) => h("a.tag", { href: `#/${x}` }, t(ROUTE_LABEL[x] ?? x))), r.acts.length ? h("span.muted", ` ${r.acts.join(" ")}`) : null),
      r.sops.length ? h("ul.mini-codes", r.sops.slice(0, 8).map((s) => h("li", h("a", { href: sopHref(s.Code) }, h("b", s.Code), ` ${short(s.Title, 54)}`), h("small", ` ${tv(s.reviewStatus)}`))),
        r.sops.length > 8 ? h("li.muted", `+ ${fmtNum(r.sops.length - 8)}`) : null) : h("p.warn-text", t("sop_m_none"))))), { sub: t("sop_m_sub") }),
    X.links.length ? card(t("sop_m_overrides"), dataTable([{ key: "Topic", label: t("sop_topic"), render: (l) => topicName(l.Topic) }, { key: "SOP", label: "SOP", cls: "mono" }, { key: "Comment", label: t("comment") }], X.links,
      { search: false, onRow: ctx.canEdit ? (l) => ctx.edit("sopLinks", l.__key, topicName(l.Topic)) : null })) : null,
  ];
}

// ---------- Drive sources, sync and reading ----------
function drive(ctx, X) {
  const sync = job.sync, idx = job.index;
  const inDrive = X.list.filter((s) => s.inDrive);
  const toRead = inDrive.filter((s) => (s.Indexed !== (s["Drive modified"] || null) || !s.Summary) && !/obsolete/i.test(s.Status ?? ""));
  const libOnly = X.list.filter((s) => !s.inDrive);
  const copies = X.list.filter((s) => s.files > 1);
  const startSync = async () => {
    job.sync = { status: "running", step: "" }; ctx.rerender();
    try { job.sync = { status: "ok", ...(await syncLibrary(ctx, X.sources, (step) => { job.sync.step = step; ctx.rerender(); })) }; }
    catch (e) { job.sync = { status: "error", error: e }; }
    ctx.rerender();
    // then read the current master indexes the sync found
    if (job.sync.status === "ok" && job.sync.indexes) { try { await readIndexes(ctx, job.sync.docRows, () => ctx.rerender()); } catch { /* shown on the index tab */ } ctx.rerender(); }
  };
  const startIndex = async () => {
    try { await indexLibrary(ctx, X.list, () => ctx.rerender()); } catch (e) { job.index = { ...(job.index ?? {}), error: e, finished: true }; }
    ctx.rerender();
  };
  const busy = sync?.status === "running" || (idx && !idx.finished);
  return [
    state.drive === false ? h("div.banner.warn", icon("alert", 18), t("drv_e_none")) : null,
    card(t("sop_sources"), h("div.sop-sources",
      X.sources.length ? X.sources.map((src) => h("article.sop-source",
        h("header", icon("globe", 16), h("b", src.Name || src.folderId), h("span.spacer"), ctx.canEdit ? h("button.btn.compact.ghost", { type: "button", onclick: () => ctx.edit("sopSources", src.__key, src.Name) }, icon("edit", 13)) : null),
        h("dl.deflist.compact", [[t("sop_folder"), h("a", { href: `https://drive.google.com/drive/folders/${encodeURIComponent(src.folderId ?? "")}`, target: "_blank", rel: "noopener" }, short(src.folderId, 24))],
          ["Site", src.Site], [t("sop_review_years"), src["Review years"]], [t("sop_last_sync"), src["Last sync"] ? fmtDate(toDay(src["Last sync"])) : "—"], [t("sop_files_n"), src.Files]]
          .filter(([, v]) => v != null && v !== "").flatMap(([k, v]) => [h("dt", k), h("dd", v)]))))
        : h("p.muted", t("sop_no_source")),
      ctx.canEdit ? h("button.btn.compact", { type: "button", onclick: () => ctx.addWith("sopSources", { "Review years": 3, Site: "Oncology" }, t("sop_add_source")) }, icon("plus", 14), t("sop_add_source")) : null),
    { sub: t("sop_sources_sub") }),
    h("div.grid.cols-2",
      card(t("sop_sync"), h("div.sop-job",
        h("p", t("sop_sync_body")),
        sync?.status === "running" ? h("p", h("span.spinner"), ` ${t("sop_syncing")} ${sync.step ?? ""}`) : null,
        sync?.status === "error" ? h("p.warn-text", t(driveProblem(sync.error))) : null,
        sync?.status === "ok" ? h("p.ok-line", icon("check", 14), t("sop_sync_done2", fmtNum(sync.files), fmtNum(sync.folders), fmtNum(sync.sops), fmtNum(sync.docs), fmtNum(sync.added), fmtNum(sync.updated))) : null,
        sync?.status === "ok" ? h("p.fine", t("sop_sync_zones", fmtNum(sync.zones.controlled ?? 0), fmtNum(sync.zones.obsolete ?? 0), fmtNum(sync.zones.uncontrolled ?? 0), fmtNum(sync.system))) : null,
        job.indexes && !job.indexes.finished ? h("p", h("span.spinner"), ` ${t("ix_reading")} ${fmtNum(job.indexes.done)} / ${fmtNum(job.indexes.total)}`) : null,
        h("div.form-actions", h("button.btn.primary", { type: "button", disabled: busy || !ctx.canEdit || !X.sources.length ? true : null, onclick: startSync }, icon("cycle", 15), t("sop_sync_btn"))))),
      card(t("sop_index"), h("div.sop-job",
        h("p", t("sop_index_body", fmtNum(toRead.length), fmtNum(inDrive.length))),
        idx ? h("div.sop-progress", h("i", { style: { width: `${idx.total ? (idx.done / idx.total) * 100 : 100}%` } })) : null,
        idx ? h("p", idx.finished ? h("span.ok-line", icon("check", 14), t("sop_index_done", fmtNum(idx.done - idx.failed.length), fmtNum(idx.failed.length))) : `${fmtNum(idx.done)} / ${fmtNum(idx.total)} · ${idx.current ?? ""}`) : null,
        idx?.fatal ? h("p.warn-text", t(idx.fatal)) : null,
        idx?.failed?.length ? h("details", h("summary", `${fmtNum(idx.failed.length)} ${t("sop_index_failed")}`), h("ul.mini-codes", idx.failed.map((x) => h("li", h("b", x.code), ` ${t(x.problem)}`)))) : null,
        h("div.form-actions",
          h("button.btn.primary", { type: "button", disabled: busy || !ctx.canEdit || !toRead.length ? true : null, onclick: startIndex }, icon("report", 15), t("sop_index_btn", fmtNum(toRead.length))),
          idx && !idx.finished ? h("button.btn.ghost", { type: "button", onclick: () => idx.stop() }, t("sop_stop")) : null)), { sub: t("sop_index_sub") })),
    card(t("lmap_title"), folderMap(ctx, ctx.m.x.docx), { sub: t("lmap_sub") }),
    ctx.canEdit && state.aiAvailable !== false ? aiJobCard(ctx, X) : null,
    sync?.status === "ok" && (sync.copies.length || sync.unnamed.length) ? card(t("sop_sync_notes"), h("div.grid.cols-2",
      sync.copies.length ? h("div", h("h4", `${t("sop_copies")} · ${fmtNum(sync.copies.length)}`), capped(sync.copies.map((c) => h("li", h("b", c.code), h("small", ` ${c.files.join(" · ")}`))))) : null,
      sync.unnamed.length ? h("div", h("h4", `${t("sop_unnamed")} · ${fmtNum(sync.unnamed.length)}`), capped(sync.unnamed.map((n) => h("li", n)))) : null)) : null,
    h("div.grid.cols-2",
      card(`${t("sop_k_nodrive")} · ${fmtNum(libOnly.length)}`, libOnly.length ? capped(libOnly.map((s) => h("li", h("a", { href: sopHref(s.Code) }, h("b", s.Code), ` ${short(s.Title, 54)}`)))) : h("p.ok-line", icon("check", 14), t("none_found")), { sub: t("sop_nodrive_sub") }),
      card(`${t("sop_copies")} · ${fmtNum(copies.length)}`, copies.length ? capped(copies.map((s) => h("li", h("a", { href: sopHref(s.Code) }, h("b", s.Code), ` ${short(s.Title, 54)}`), h("small", ` · ${fmtNum(s.files)} ${t("sop_files_n").toLowerCase()}${s.Revisions ? ` · rev ${s.Revisions}` : ""}`)))) : h("p.ok-line", icon("check", 14), t("none_found")), { sub: t("sop_copies_sub") })),
  ];
}

// ---------- forms, templates and attachments of every SOP ----------
function formsTab(ctx, X) {
  const F0 = X.forms ?? [];
  const f = ctx.state.frmF ?? {};
  const setF = (k, v) => ctx.set("frmF", { ...f, [k]: v });
  const qx = String(f.q ?? "").trim().toLowerCase();
  const read = X.list.filter((s) => s.inDrive && s.Forms).length, inDrive = X.list.filter((s) => s.inDrive).length;
  if (!F0.length) return [h("div.empty.big", h("p", t("frm_empty", fmtNum(read), fmtNum(inDrive))), h("button.btn", { type: "button", onclick: () => ctx.set("sopTab", "drive") }, icon("report", 15), t("sop_t_drive")))];
  const kinds = Object.keys(KIND_COLOR).filter((k) => F0.some((x) => x.kind === k));
  const depts = [...new Set(F0.map((x) => x.dept).filter(Boolean))].sort();
  const F = F0.filter((x) => (!f.kind || f.kind === ALL || x.kind === f.kind) && (!f.dept || f.dept === ALL || x.dept === f.dept)
    && (!f.state || f.state === ALL || (f.state === "attached" ? x.attached : f.state === "listed" ? !x.attached : f.state === "mismatch" ? x.mismatch : f.state === "shared" ? x.usedBy.length > 0 : !x.owner))
    && (!qx || `${x.code} ${x.title ?? ""} ${x.owner?.Code ?? ""} ${(x.fields ?? []).join(" ")} ${(x.columns ?? []).join(" ")}`.toLowerCase().includes(qx)));
  const n = (fn) => F0.filter(fn).length;
  return [
    h("section.sop-hero.frm-hero",
      h("div.sop-hero-text",
        h("span.eyebrow", t("frm_eyebrow")),
        h("h2", `${fmtNum(F0.length)} ${t("frm_forms")}`),
        h("p", t("frm_hero_sub", fmtNum(new Set(F0.map((x) => x.owner).filter(Boolean)).size), fmtNum(read), fmtNum(inDrive))),
        h("div.hero-meta", kinds.map((k) => h("button.chip.chip-glass", { type: "button", onclick: () => setF("kind", k) }, icon(KIND_ICON[k], 12), ` ${kindName(k)} · ${fmtNum(n((x) => x.kind === k))}`)))),
      h("div.apqr-rings",
        h("div.hero-ring", ring(F0.length ? n((x) => x.attached) / F0.length : null, { size: 88, color: "#5fe0b0" }), h("span", t("frm_r_attached"))),
        h("div.hero-ring", ring(F0.length ? n((x) => x.fields.length || x.columns.length || x.sections.length) / F0.length : null, { size: 88, color: "#8fc1ff" }), h("span", t("frm_r_preview"))),
        h("div.hero-ring", ring(inDrive ? read / inDrive : null, { size: 88, color: "#ffd27a" }), h("span", t("frm_r_read"))))),
    h("div.kpi-grid.six",
      kpi({ label: t("frm_k_n"), value: fmtNum(F0.length), accent: "var(--c1)", onclick: () => setF("state", ALL) }),
      kpi({ label: t("frm_k_attached"), value: fmtNum(n((x) => x.attached)), accent: "var(--good)", onclick: () => setF("state", "attached") }),
      kpi({ label: t("frm_k_listed"), value: fmtNum(n((x) => !x.attached)), status: n((x) => !x.attached) ? 2 : 3, hint: t("frm_k_listed_h"), onclick: () => setF("state", "listed") }),
      kpi({ label: t("frm_k_mismatch"), value: fmtNum(n((x) => x.mismatch)), status: n((x) => x.mismatch) ? 1 : 3, hint: t("frm_k_mismatch_h"), onclick: () => setF("state", "mismatch") }),
      kpi({ label: t("frm_k_shared"), value: fmtNum(n((x) => x.usedBy.length)), accent: "var(--c7)", hint: t("frm_k_shared_h"), onclick: () => setF("state", "shared") }),
      kpi({ label: t("frm_k_orphan"), value: fmtNum(n((x) => !x.owner)), accent: "var(--muted-mark)", hint: t("frm_k_orphan_h"), onclick: () => setF("state", "orphan") })),
    card(null, h("div.filters.sop-filters",
      h("label.field.grow", h("span", t("sop_find")), h("input", { type: "search", value: f.q ?? "", placeholder: t("frm_find_ph"), onchange: (e) => setF("q", e.target.value) })),
      select(t("col_type"), [[ALL, t("filter_all")], ...kinds.map((k) => [k, kindName(k)])], f.kind ?? ALL, (v) => setF("kind", v)),
      select(t("col_dept"), [[ALL, t("filter_all")], ...depts.map((x) => [x, `${x} · ${deptName(x)}`])], f.dept ?? ALL, (v) => setF("dept", v)),
      select(t("col_status"), [[ALL, t("filter_all")], ["attached", t("frm_attached")], ["listed", t("frm_listed_only")], ["mismatch", t("frm_k_mismatch")], ["shared", t("frm_k_shared")], ["orphan", t("frm_k_orphan")]], f.state ?? ALL, (v) => setF("state", v))), { cls: "filter-card" }),
    card(`${t("frm_forms")} · ${fmtNum(F.length)}`, dataTable([
      { key: "code", label: t("col_code"), cls: "mono nowrap", render: (x) => x.code.replace(/\/Onc/, "") },
      { key: "title", label: t("col_title"), cls: "wrap", render: (x) => (x.title ? h("b", x.title) : h("span.muted", t("frm_untitled"))) },
      { key: "kind", label: t("col_type"), render: (x) => h("span.tag", { style: { "--tag": KIND_COLOR[x.kind] } }, kindName(x.kind)) },
      { key: "owner", label: t("frm_owner"), cls: "nowrap", sort: (x) => x.owner?.Code ?? "~", render: (x) => (x.owner ? h("a", { href: sopHref(x.owner.Code), onclick: (e) => e.stopPropagation() }, x.owner.Code) : h("span.muted", "—")) },
      { key: "rev", label: t("col_rev"), cls: "num" },
      { key: "attached", label: t("frm_in_file"), render: (x) => (x.attached ? dot("var(--good)", t("frm_attached")) : dot("var(--warning)", t("frm_listed_only"))) },
      { key: "mismatch", label: "≠", render: (x) => (x.mismatch ? h("span.tag.warn", `${x.citedRev} ≠ ${x.attachedRev}`) : "") },
      { key: "usedBy", label: t("frm_used_by"), cls: "num", sort: (x) => x.usedBy.length, render: (x) => (x.usedBy.length ? fmtNum(x.usedBy.length) : "") },
    ], F, { pageSize: 40, onRow: (x) => openForm(ctx, X, x), searchText: (x) => `${x.code} ${x.title ?? ""}`, exportName: "forms" }), { sub: t("frm_table_sub") }),
  ];
}

// Claude writes the résumé of every SOP that has none yet (or only the app's), one after the other
function aiJobCard(ctx, X) {
  const st = aiJob.run;
  const lang = getLang() === "FR" ? "FR" : "EN";
  const todo = X.list.filter((s) => s["Drive ID"] && !/obsolete/i.test(s.Status ?? "") && s.summary?.by !== "claude");
  const busy = st && !st.finished;
  return card(t("ai_job"), h("div.sop-job",
    h("p", t("ai_job_body", fmtNum(todo.length))),
    st ? h("div.sop-progress", h("i", { style: { width: `${st.total ? (st.done / st.total) * 100 : 100}%` } })) : null,
    st ? h("p", st.finished ? h("span.ok-line", icon("check", 14), t("ai_job_done", fmtNum(st.done - st.failed.length), fmtNum(st.failed.length))) : `${fmtNum(st.done)} / ${fmtNum(st.total)} · ${st.current ?? ""}`) : null,
    st?.fatal ? h("p.warn-text", t(st.fatal)) : null,
    st?.failed?.length ? h("details", h("summary", `${fmtNum(st.failed.length)} ${t("sop_index_failed")}`), h("ul.mini-codes", st.failed.map((x) => h("li", h("b", x.code), ` ${t(x.problem)}`)))) : null,
    h("div.form-actions",
      h("button.btn.primary", { type: "button", disabled: busy || !todo.length ? true : null, onclick: async () => { await summarizeAll(ctx, todo, lang, () => ctx.rerender()); ctx.rerender(); } }, icon("sparkle", 15), t("ai_job_btn", fmtNum(todo.length))),
      busy ? h("button.btn.ghost", { type: "button", onclick: () => st.stop() }, t("sop_stop")) : null)), { sub: t("ai_job_sub") });
}

/** A long list: the first 12 lines, the rest behind "show all". */
function capped(items, n = 12) {
  if (items.length <= n) return h("ul.mini-codes", items);
  return h("div", h("ul.mini-codes", items.slice(0, n)), h("details.more-list", h("summary", t("sop_more", fmtNum(items.length - n))), h("ul.mini-codes", items.slice(n))));
}

// ---------- the procedures strip under each page header ----------
/** "Procedures:" chips for the SOPs governing a page (null when the page has no topic). */
export function sopStrip(ctx, route) {
  const topics = ROUTE_TOPICS[route];
  const X = ctx.m?.x?.sopx;
  if (!topics || !X) return null;
  const seen = new Set();
  const sops = topics.flatMap((x) => X.byTopic.get(x) ?? []).filter((s) => !seen.has(s.key) && seen.add(s.key));
  const top = sops.filter((s) => s.Site === "Oncology").concat(sops.filter((s) => s.Site !== "Oncology")).slice(0, 6);
  return h("div.sop-strip",
    h("span.sop-strip-k", icon("sop", 14), t("sop_strip")),
    top.length ? top.map((s) => h("a.sop-chip", { href: sopHref(s.Code), title: s.Title ?? "", style: { "--dot": REVIEW_COLOR[s.reviewStatus] } }, h("i"), h("b", s.Code), h("span", short(s.Title, 38))))
      : h("span.muted", t("sop_strip_none")),
    sops.length > top.length ? h("a.sop-more", { href: "#/sops", onclick: () => ctx.set("sopF", { topic: topics[0] }) }, `+${fmtNum(sops.length - top.length)}`) : null);
}

/** The SOP codes governing a GMP activity (for the activity register). */
export function activitySops(ctx, id) {
  const X = ctx.m?.x?.sopx;
  if (!X) return [];
  const seen = new Set();
  return (ACTIVITY_TOPICS[id] ?? []).flatMap((x) => X.byTopic.get(x) ?? []).filter((s) => !seen.has(s.key) && seen.add(s.key));
}
