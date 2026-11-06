// FMEA, Improvements, Data quality and the all-records list.
import { h, card, kpi, viewHeader, select, segmented, dataTable, pill, typeTag, fmtDate, fmtNum, fmtPct, defList, STATUS_COLOR, LEVEL_COLOR, TYPE_COLOR } from "./ui.js";
import { hbars, stacks, heatmap, legend } from "./charts.js";
import { t, tv } from "./i18n.js";
import { icon } from "./icons.js";
import * as M from "./model.js";
import { recordCols, recordSearch } from "./views-overview.js";
import { equipCols, fmeaCols } from "./views-site.js";

const pctBar = (v) => h("span.pct-bar", h("i", { style: { width: `${Math.round((v ?? 0) * 100)}%` } }), fmtPct(v));

// ---------- FMEA ----------
export function fmea(ctx) {
  const { m } = ctx;
  const assess = ctx.state.fmAssess ?? M.ALL;
  const refs = [...new Set(m.fmea.map((f) => f["Assessment ref"]))];
  const F = m.fmea.filter((f) => assess === M.ALL || f["Assessment ref"] === assess);
  const cnt = (k, lvl) => F.filter((f) => f[k] === lvl).length;
  const red = F.filter((f) => f.reduction != null).map((f) => f.reduction);
  const heat = (sk, ok) => {
    const cells = Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => ({ n: 0, items: [] })));
    for (const f of F) if (f[sk] && f[ok]) { const c = cells[f[ok] - 1][f[sk] - 1]; c.n++; c.items.push(f); }
    return heatmap(cells, { onCell: (s, o, items) => ctx.open.risks(`S ${s} × O ${o}`, items) });
  };
  const steps = [...new Set(F.map((f) => f["Process step"]).filter(Boolean))];
  const stepRows = steps.map((s) => {
    const xs = F.filter((f) => f["Process step"] === s);
    const a = (k) => { const v = xs.filter((f) => f[k] != null).map((f) => f[k]); return v.length ? v.reduce((p, q) => p + q, 0) / v.length : 0; };
    return { s, i: a("rpn"), r: a("rrpn"), n: xs.length };
  }).sort((a, b) => b.i - a.i);
  const maxStep = Math.max(1, ...stepRows.map((x) => x.i));
  const assessName = new Map(m.fmea.map((f) => [f["Assessment ref"], f.Assessment]));

  return h("div.view",
    viewHeader(t("fm_title"), t("fm_sub"), ctx.canEdit ? h("button.btn.primary", { type: "button", onclick: () => ctx.add("fmea") }, icon("plus", 16), t("add_risk")) : null, select(t("fm_assess"), [[M.ALL, t("filter_all")], ...refs.map((r) => [r, `${r} · ${assessName.get(r) ?? ""}`])], assess, (v) => ctx.set("fmAssess", v))),
    h("div.kpi-grid",
      kpi({ label: t("fm_k_total"), value: fmtNum(F.length), accent: "var(--c1)" }),
      kpi({ label: t("fm_k_ih"), value: fmtNum(cnt("level", "High")), accent: "var(--critical)", onclick: () => ctx.open.risks(t("fm_k_ih"), F.filter((f) => f.level === "High")) }),
      kpi({ label: t("fm_k_im"), value: fmtNum(cnt("level", "Medium")), accent: "var(--warning)" }),
      kpi({ label: t("fm_k_rh"), value: fmtNum(cnt("rlevel", "High")), status: M.rag(cnt("rlevel", "High"), m.targets.res_high, false), accent: "var(--critical)" }),
      kpi({ label: t("fm_k_rm"), value: fmtNum(cnt("rlevel", "Medium")), accent: "var(--warning)" }),
      kpi({ label: t("fm_k_red"), value: fmtPct(red.length ? red.reduce((a, b) => a + b, 0) / red.length : null), accent: "var(--good)" }),
      kpi({ label: t("fm_k_od"), value: fmtNum(F.filter((f) => f.actionOverdue).length) }),
      kpi({ label: t("fm_k_mis"), value: fmtNum(F.filter((f) => f.rpnCheck.length).length), onclick: () => ctx.open.risks(t("fm_k_mis"), F.filter((f) => f.rpnCheck.length)) })),
    h("div.grid.cols-3",
      card(t("fm_hm_i"), heat("S", "O")),
      card(t("fm_hm_r"), heat("rS", "rO")),
      card(t("fm_bands"), h("div.bands", m.bands.map((b) => h("div.band", { style: { "--dot": LEVEL_COLOR[b.Level] } }, h("i"), h("b", `${tv(b.Level)} · ${b.Min}–${b.Max}`), h("p", b.Acceptance)))))),
    card(t("fm_c_steps"), h("div",
      legend([{ label: t("s_initial"), color: "var(--c2)" }, { label: t("s_residual"), color: "var(--c3)" }]),
      h("div.dumbbells", stepRows.map((x) => h("div.db-row", { "data-tip": `<b>${x.s}</b><div class="tip-row"><span>${t("s_initial")}</span><b>${fmtNum(x.i, 1)}</b></div><div class="tip-row"><span>${t("s_residual")}</span><b>${fmtNum(x.r, 1)}</b></div><div class="tip-row"><span>${t("s_count")}</span><b>${x.n}</b></div>` },
        h("span.db-label", x.s),
        h("span.db-track",
          h("i.db-line", { style: { left: `${(x.r / maxStep) * 100}%`, width: `${((x.i - x.r) / maxStep) * 100}%` } }),
          h("i.db-dot.res", { style: { left: `${(x.r / maxStep) * 100}%` } }),
          h("i.db-dot.ini", { style: { left: `${(x.i / maxStep) * 100}%` } })),
        h("span.db-val", `${fmtNum(x.i)} → ${fmtNum(x.r)}`)))))),
    h("div.grid.cols-2",
      card(t("fm_top"), dataTable(fmeaCols(), [...F].sort((a, b) => (b.rpn ?? 0) - (a.rpn ?? 0)), { pageSize: 10, onRow: (f) => ctx.open.risk(f["Risk ID"]), exportName: "fmea" }), { span: 2 }),
      card(t("fm_od_list"), dataTable([
        { key: "Risk ID", label: t("col_id"), cls: "mono" }, { key: "due", label: t("col_due"), render: (f) => fmtDate(f.due), cls: "num" }, { key: "Owner", label: t("col_owner") },
        { key: "rpn", label: t("col_rpn"), cls: "num" }, { key: "Action", label: t("col_desc"), cls: "wrap" },
      ], F.filter((f) => f.actionOverdue), { search: false, onRow: (f) => ctx.open.risk(f["Risk ID"]) })),
      card(t("fm_ccq"), h("div.table-scroll", h("table.data.compact",
        h("thead", h("tr", ["Area", "Total", tv("Low"), tv("Medium"), tv("High"), "Key medium-risk drivers"].map((x, i) => h("th", { class: i && i < 5 ? "num" : "" }, x)))),
        h("tbody", (m.meta.annex01 ?? []).map((r) => h("tr", h("td", r[0]), h("td.num", r[1]), h("td.num", r[2]), h("td.num", r[3] ? h("b.warn-text", r[3]) : r[3]), h("td.num", r[4]), h("td.wrap.muted", r[5])))))))));
}


// ---------- IMPROVEMENTS ----------
export function improvements(ctx) {
  const { m } = ctx;
  const I = m.impr;
  const colKey = { Idea: "im_idea", Assessed: "im_assessed", "In progress": "im_inprog", Done: "im_done" };
  const ben = [...M.countBy(I, "Benefit")].sort((a, b) => b[1] - a[1]).map(([b, n]) => ({ label: b, value: n, color: "var(--c7)" }));
  const own = [...M.countBy(I.filter((i) => i.Stage !== "Done"), "Owner")].sort((a, b) => b[1] - a[1]).map(([b, n]) => ({ label: b, value: n }));
  return h("div.view",
    viewHeader(t("im_title"), t("im_sub"), ctx.canEdit ? h("button.btn.primary", { type: "button", onclick: () => ctx.add("impr") }, icon("plus", 16), t("add_improvement")) : null),
    h("div.banner.info", icon("improve", 18), t("im_note")),
    h("div.kanban", M.IMPR_STAGES.map((s) => {
      const items = I.filter((i) => i.Stage === s);
      return h("section.lane", { "data-stage": s },
        h("header", h("span", t(colKey[s])), h("b", items.length)),
        items.length ? items.map((i) => h("article.kcard", { class: ctx.canEdit ? "editable" : "" },
          h("div.kcard-top", h("span.mono", i.ID), i.Room ? h("span.tag", i.Room) : null,
            ctx.canEdit ? h("span.kcard-tools",
              h("button.icon-btn.mini", { type: "button", title: t("edit"), "aria-label": `${t("edit")} ${i.ID}`, onclick: () => ctx.edit("impr", i.__key, `${i.ID} · ${i.Title ?? ""}`) }, icon("edit", 13)),
              M.IMPR_STAGES.indexOf(s) < M.IMPR_STAGES.length - 1 ? h("button.icon-btn.mini", { type: "button", title: `→ ${t(colKey[M.IMPR_STAGES[M.IMPR_STAGES.indexOf(s) + 1]])}`, "aria-label": `${i.ID} → ${t(colKey[M.IMPR_STAGES[M.IMPR_STAGES.indexOf(s) + 1]])}`, onclick: () => ctx.update("impr", i.__key, { Stage: M.IMPR_STAGES[M.IMPR_STAGES.indexOf(s) + 1] }) }, icon("arrow", 13)) : null) : null),
          h("p", i.Title),
          h("div.kcard-meta", h("span.tag", { style: { "--dot": "var(--c7)" } }, h("i"), i.Benefit), h("span", i.Owner)),
          i.Comment ? h("small", i.Comment) : null)) : h("div.lane-empty", "—"));
    })),
    h("div.grid.cols-2", card(t("im_c_benefit"), hbars(ben)), card(t("im_c_owner"), hbars(own))));
}

// ---------- SOP LIBRARY ----------
// ---------- DATA QUALITY ----------
export function quality(ctx) {
  const { m } = ctx;
  const R = m.records, E = m.equip, Ro = m.rooms;
  const share = (xs, pred) => (xs.length ? xs.filter(pred).length / xs.length : 0);
  const dups = new Set(E.filter((e) => e.dataQuality.includes("Duplicate asset no")).map((e) => e["Asset no"])).size;
  const ind = [
    [t("dq_k_qrroom"), share(R, (r) => r.roomCode)], [t("dq_k_qrdept"), share(R, (r) => r.department !== "(Unassigned)")],
    [t("dq_k_eqroom"), share(E, (e) => e["Room code"])], [t("dq_k_eqcal"), share(E, (e) => e.last != null)],
    [t("dq_k_grade"), share(Ro, (r) => r.Grade)], [t("dq_k_oeb"), share(Ro, (r) => r["OEB level"] != null)], [t("dq_k_press"), share(Ro, (r) => r["Pressure set-point (Pa)"] != null)],
  ];
  const index = ind.reduce((a, b) => a + b[1], 0) / ind.length;
  const recon = M.reconciliation(m);
  return h("div.view",
    viewHeader(t("dq_title"), t("dq_sub")),
    h("div.dq-top",
      h("div.dq-index", h("span.eyebrow", t("dq_k_index")), h("b", fmtPct(index)), h("div.dq-meter", h("i", { style: { width: `${index * 100}%` } }))),
      h("div.dq-bars", ind.map(([l, v]) => h("div.dq-bar", h("span", l), pctBar(v))), h("div.dq-bar", h("span", t("dq_k_dups")), h("b", dups ? h("span.late", dups) : "0")))),
    card(t("dq_recon"), h("div.recon", recon.map((c) => h(`div.recon-row.${c.ok ? "ok" : "bad"}`, h("span.recon-ico", c.ok ? "✔" : "✘"), h("span", c.label), h("span.num.muted", `${t("dq_expected")} ${fmtNum(c.expected)}`), h("b.num", fmtNum(c.actual)))))),
    h("div.grid.cols-2",
      card(t("dq_gap_qr").replace(" – click to open the row", "").replace(" (first 25)", ""), dataTable(recordCols(["ref", "type", "status", "title"]), R.filter((r) => !r.roomCode), { onRow: (r) => ctx.open.record(r.ref), exportName: "records-without-room" })),
      card(t("dq_gap_eq").replace(" (first 25)", ""), dataTable(equipCols(["asset", "room", "dq"]), E.filter((e) => e.dataQuality.length), { onRow: (e) => ctx.open.asset(e["Asset no"]) })),
      card(t("dq_gap_room"), dataTable([{ key: "Code", label: t("col_room"), cls: "mono" }, { key: "Name", label: t("col_name") }, { key: "dataGaps", label: t("col_issue"), sort: (r) => r.dataGaps.join(";"), render: (r) => h("span.warn-text", r.dataGaps.join(" · ")) }], Ro.filter((r) => r.dataGaps.length), { onRow: (r) => ctx.go("rooms", { room: r.Code }) })),
      card(t("dq_gap_fm"), dataTable([{ key: "Risk ID", label: t("col_id"), cls: "mono" }, { key: "Process step", label: t("col_step") }, { key: "rpnCheck", label: t("col_issue"), sort: (f) => f.rpnCheck.join(";"), render: (f) => h("span.warn-text", f.rpnCheck.join(" · ")) }], m.fmea.filter((f) => f.rpnCheck.length), { search: false, onRow: (f) => ctx.open.risk(f["Risk ID"]) })),
      card(t("dq_src"), h("div.notes", (m.meta.inconsistencies ?? []).map(([s, text]) => h("div.note", h("span.note-tag", s), h("p", text)))), { span: 2 })));
}

// ---------- QUALITY RECORDS ----------
export function records(ctx) {
  const { m } = ctx;
  const f = { ...(ctx.state.rec ?? {}), ...(ctx.params.status ? { status: ctx.params.status } : {}), ...(ctx.params.type ? { type: ctx.params.type } : {}) };
  const setF = (k, v) => { ctx.params = {}; ctx.set("rec", { ...f, [k]: v }); };
  let list = M.applyFilters(m.records, { type: f.type, dept: f.dept, room: f.room });
  if (f.status && f.status !== M.ALL) list = f.status === "Overdue" ? list.filter((r) => r.overdue) : list.filter((r) => r.status === f.status);
  const types = [[M.ALL, t("filter_all")], ...M.TYPES.map((x) => [x, tv(x)])];
  const counts = Object.fromEntries(M.TYPES.map((ty) => [ty, m.records.filter((r) => r.type === ty).length]));
  return h("div.view",
    viewHeader(t("qr_title"), t("qr_sub"), ctx.canEdit ? h("div.add-group",
      h("span", t("new_record")),
      [["cc", "Change Control"], ["capa", "CAPA"], ["qe", "Deviation"], ["find", "Audit Finding"]].map(([k, ty]) => h("button.btn", { type: "button", style: { "--dot": TYPE_COLOR[ty] }, onclick: () => ctx.add(k) }, h("i.dot"), tv(ty)))) : null),
    h("div.type-switch", types.map(([v, l]) => h("button", { type: "button", class: (f.type ?? M.ALL) === v ? "on" : "", style: { "--dot": TYPE_COLOR[v] ?? "var(--ink)" }, onclick: () => setF("type", v) },
      h("i"), l, h("b", fmtNum(v === M.ALL ? m.records.length : counts[v]))))),
    card(null, dataTable(recordCols(["ref", "type", "status", "cls", "dept", "opened", "due", "late", "owner", "room", "title"]), list, {
      pageSize: 25, onRow: (r) => ctx.open.record(r.ref), searchText: recordSearch, sortKey: "opened", sortDir: -1, exportName: "quality-records",
      tools: h("div.inline-filters",
        select(t("flt_status"), [[M.ALL, t("filter_all")], ...M.STATUSES.map((s) => [s, tv(s)])], f.status ?? M.ALL, (v) => setF("status", v)),
        select(t("flt_dept"), [[M.ALL, t("filter_all")], ...[...new Set(m.records.map((r) => r.department))].sort().map((d) => [d, tv(d)])], f.dept ?? M.ALL, (v) => setF("dept", v))),
    })));
}
