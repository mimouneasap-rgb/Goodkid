// FMEA, CAPA & deviations, Change control, Improvements, SOP library, Data quality, Quality records.
import { h, card, kpi, viewHeader, select, segmented, dataTable, pill, typeTag, fmtDate, fmtNum, fmtPct, defList, STATUS_COLOR, LEVEL_COLOR, TYPE_COLOR } from "./ui.js";
import { hbars, stacks, heatmap, legend } from "./charts.js";
import { t, tv } from "./i18n.js";
import { icon } from "./icons.js";
import * as M from "./model.js";
import { recordCols, recordSearch } from "./views-overview.js";
import { equipCols, fmeaCols, sopCols } from "./views-site.js";

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

// ---------- CAPA & DEVIATIONS ----------
export function capa(ctx) {
  const { m } = ctx;
  const R = m.records;
  const capas = R.filter((r) => r.type === "CAPA" && r.status !== "Canceled");
  const devs = R.filter((r) => r.type === "Deviation" && r.status !== "Canceled");
  const capaOpen = R.filter((r) => r.type === "CAPA" && r.isOpen);
  const capaOd = R.filter((r) => r.type === "CAPA" && r.overdue);
  const ttc = capas.filter((r) => r.daysToClose != null).map((r) => r.daysToClose);
  const devReq = R.filter((r) => r.type === "Deviation" && r.capaRequired === "Yes");
  const flagged = R.filter((r) => r.classFlags.length);
  const statusSeries = ["Open", "Overdue", "Completed"].map((s) => ({ key: s, label: tv(s), color: STATUS_COLOR[s] }));
  const deptRows = [...M.countBy(capas, "department")].sort((a, b) => b[1] - a[1]).map(([d]) => ({
    label: tv(d), parts: Object.fromEntries(["Open", "Overdue", "Completed"].map((s) => [s, capas.filter((r) => r.department === d && r.status === s).length])),
    onclick: () => ctx.open.list(`CAPA · ${tv(d)}`, capas.filter((r) => r.department === d)),
  }));
  const srcRows = [...M.countBy(capas, (r) => r.source || "—")].sort((a, b) => b[1] - a[1]).map(([s, n]) => ({ label: s, value: n, color: "var(--c2)", onclick: () => ctx.open.list(`CAPA · ${s}`, capas.filter((r) => (r.source || "—") === s)) }));
  const rcRows = [...M.countBy(devs, (r) => r.rootCause || "(Not recorded)")].sort((a, b) => b[1] - a[1]).map(([s, n]) => ({ label: s, value: n, color: "var(--c3)" }));
  const roomRows = [...M.countBy(devs.filter((r) => r.roomCode), "roomCode")].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([s, n]) => ({ label: s, sub: m.roomByCode.get(s)?.Name, value: n, color: "var(--c3)", onclick: () => ctx.go("rooms", { room: s }) }));
  const ttcRows = M.TTC_BUCKETS.map((b) => ({ label: `${b} ${t("d")}`, parts: Object.fromEntries(M.TYPES.map((ty) => [ty, R.filter((r) => r.ttcBucket === b && r.type === ty).length])) }));
  const owners = [...new Set(R.filter((r) => r.owner).map((r) => r.owner))].map((o) => {
    const xs = R.filter((r) => r.owner === o);
    const open = xs.filter((r) => r.isOpen).length, od = xs.filter((r) => r.overdue).length;
    return { owner: o, open, od, done: xs.filter((r) => r.status === "Completed").length, pct: open ? od / open : 0 };
  }).filter((x) => x.open || x.od).sort((a, b) => b.od - a.od || b.open - a.open);
  const flagLabel = { F1: t("cd_f1"), F2: t("cd_f2"), F3: t("cd_f3"), F4: t("cd_f4") };

  return h("div.view",
    viewHeader(t("cd_title"), t("cd_sub")),
    h("div.kpi-grid",
      kpi({ label: t("cd_k_capa"), value: fmtNum(capas.length), accent: TYPE_COLOR.CAPA, onclick: () => ctx.open.list(t("cd_k_capa"), capas) }),
      kpi({ label: t("cd_k_capaod"), value: fmtNum(capaOd.length), accent: "var(--critical)", onclick: () => ctx.open.list(t("cd_k_capaod"), capaOd) }),
      kpi({ label: t("cd_k_capaodp"), value: fmtPct(capaOpen.length ? capaOd.length / capaOpen.length : 0), status: M.rag(capaOpen.length ? capaOd.length / capaOpen.length : 0, m.targets.overdue, false) }),
      kpi({ label: t("cd_k_ec"), value: fmtPct(capas.length ? capas.filter((r) => r.effCheck === "Yes").length / capas.length : 0), status: M.rag(capas.length ? capas.filter((r) => r.effCheck === "Yes").length / capas.length : 0, m.targets.capa_ec, true) }),
      kpi({ label: t("cd_k_ttc"), value: ttc.length ? fmtNum(ttc.reduce((a, b) => a + b, 0) / ttc.length) : "—", unit: ` ${t("d")}` }),
      kpi({ label: t("cd_k_dev"), value: fmtNum(devs.length), accent: TYPE_COLOR.Deviation, onclick: () => ctx.open.list(t("cd_k_dev"), devs) }),
      kpi({ label: t("cd_k_link"), value: devReq.length ? fmtPct(devReq.filter((r) => r.linkedCapas > 0).length / devReq.length) : "—", status: devReq.length ? M.rag(devReq.filter((r) => r.linkedCapas > 0).length / devReq.length, m.targets.link, true) : 0 }),
      kpi({ label: t("cd_k_incons"), value: fmtNum(flagged.length), accent: flagged.length ? "var(--warning)" : null })),
    h("p.fine", t("cd_ec_note")),
    h("div.grid.cols-2",
      card(t("cd_c_dept"), stacks(deptRows, statusSeries)),
      card(t("cd_c_src"), hbars(srcRows)),
      card(t("cd_c_rc"), hbars(rcRows)),
      card(t("cd_c_room"), roomRows.length ? hbars(roomRows) : h("div.empty", t("no_data"))),
      card(t("cd_c_ttc"), stacks(ttcRows, M.TYPES.map((ty) => ({ key: ty, label: tv(ty), color: TYPE_COLOR[ty] })))),
      card(t("cd_flags"), h("div", h("div.flag-sum", ["F1", "F2", "F3", "F4"].map((f) => h("div.flag", h("b", fmtNum(flagged.filter((r) => r.classFlags.includes(f)).length)), h("span", `${f} · ${flagLabel[f]}`)))),
        dataTable([...recordCols(["ref", "status", "cls"]), { key: "classFlags", label: t("flags"), sort: (r) => r.classFlags.join(" "), render: (r) => r.classFlags.join(" · ") }, ...recordCols(["title"])], flagged, { search: false, onRow: (r) => ctx.open.record(r.ref) }))),
      card(t("cd_owner"), dataTable([
        { key: "owner", label: t("col_owner") }, { key: "open", label: t("k_open"), cls: "num" }, { key: "od", label: t("k_overdue"), cls: "num", render: (x) => (x.od ? h("b.late", x.od) : "0") },
        { key: "done", label: t("col_completed"), cls: "num" }, { key: "pct", label: t("col_odpct"), render: (x) => pctBar(x.pct) },
      ], owners, { pageSize: 12, onRow: (x) => ctx.open.list(x.owner, R.filter((r) => r.owner === x.owner && r.isOpen)) }), { span: 2 })));
}

// ---------- CHANGE CONTROL ----------
export function cc(ctx) {
  const { m } = ctx;
  const C = m.records.filter((r) => r.type === "Change Control");
  const open = C.filter((r) => r.isOpen);
  const stageRows = M.CC_STAGES.map((s) => ({ label: s, value: C.filter((r) => r.stage === s).length, color: s === "Canceled" ? "var(--muted-mark)" : s === "Closed" ? "var(--good)" : "var(--c1)", onclick: () => ctx.open.list(`${t("cc_c_stage")} · ${s}`, C.filter((r) => r.stage === s)) }));
  const others = C.filter((r) => !M.CC_STAGES.includes(r.stage));
  if (others.length) stageRows.push({ label: "Other", value: others.length, color: "var(--muted-mark)" });
  const ageRows = M.AGE_BUCKETS.map((b) => ({ label: `${b} ${t("d")}`, value: open.filter((r) => r.ageBucket === b).length, color: b === ">90" ? "var(--critical)" : "var(--c1)", onclick: () => ctx.open.list(`${t("cc_c_age")} · ${b}`, open.filter((r) => r.ageBucket === b)) }));
  const scopes = [...M.countBy(C, (r) => r.scope || "—")].sort((a, b) => b[1] - a[1]).map(([s]) => ({
    label: s, parts: { o: C.filter((r) => (r.scope || "—") === s && r.isOpen).length, c: C.filter((r) => (r.scope || "—") === s && r.status === "Completed").length },
    onclick: () => ctx.open.list(`${t("col_scope")} · ${s}`, C.filter((r) => (r.scope || "—") === s)),
  }));
  const impacted = [...M.countBy(C.filter((r) => r.roomCode), "roomCode")].sort((a, b) => b[1] - a[1]).map(([code, n]) => ({ code, n, open: C.filter((r) => r.roomCode === code && r.isOpen).length, name: m.roomByCode.get(code)?.Name }));
  const assets = [...M.countBy(C.filter((r) => r.assetNo), "assetNo")].sort((a, b) => b[1] - a[1]);
  return h("div.view",
    viewHeader(t("cc_title"), t("cc_sub")),
    h("div.kpi-grid.six",
      kpi({ label: t("cc_k_total"), value: fmtNum(C.length), accent: TYPE_COLOR["Change Control"] }),
      kpi({ label: t("cc_k_open"), value: fmtNum(open.length), onclick: () => ctx.open.list(t("cc_k_open"), open) }),
      kpi({ label: t("cc_k_od"), value: fmtNum(C.filter((r) => r.overdue).length), accent: "var(--critical)", onclick: () => ctx.open.list(t("cc_k_od"), C.filter((r) => r.overdue)) }),
      kpi({ label: t("cc_k_90"), value: fmtNum(open.filter((r) => r.daysOpen > 90).length), status: M.rag(open.filter((r) => r.daysOpen > 90).length, m.targets.cc90, false), onclick: () => ctx.open.list(t("cc_k_90"), open.filter((r) => r.daysOpen > 90)) }),
      kpi({ label: t("cc_k_major"), value: fmtNum(open.filter((r) => r.classification === "Major").length), accent: "var(--c2)" }),
      kpi({ label: t("cc_k_noval"), value: fmtNum(C.filter((r) => r.vqGap).length), status: M.rag(C.filter((r) => r.vqGap).length, m.targets.ccvq, false) })),
    card(t("cc_c_stage"), h("div.pipeline", stageRows.map((s, i) => h("button.pipe", { type: "button", onclick: s.onclick, style: { "--c": s.color, "--i": i } }, h("b", fmtNum(s.value)), h("span", s.label))))),
    h("div.grid.cols-2",
      card(t("cc_c_age"), hbars(ageRows)),
      card(t("cc_c_scope"), stacks(scopes, [{ key: "o", label: t("s_open"), color: "var(--c1)" }, { key: "c", label: t("s_completed"), color: "var(--good)" }])),
      card(t("cc_rooms"), dataTable([
        { key: "code", label: t("col_room"), cls: "mono" }, { key: "name", label: t("col_name") }, { key: "n", label: t("col_count"), cls: "num" }, { key: "open", label: t("s_open"), cls: "num" },
      ], impacted, { search: false, onRow: (x) => ctx.go("rooms", { room: x.code }) }), {
        sub: assets.length ? `${t("col_asset")}: ${assets.slice(0, 6).map(([a, n]) => `${a} (${n})`).join(", ")}` : null,
      }),
      card(t("cc_oldest"), dataTable(recordCols(["ref", "stage", "opened", "days", "title"]), [...open].sort((a, b) => b.daysOpen - a.daysOpen), { pageSize: 10, onRow: (r) => ctx.open.record(r.ref) })),
      card(t("cc_noval"), dataTable(recordCols(["ref", "status", "opened", "stage", "scope", "title"]), C.filter((r) => r.vqGap), { onRow: (r) => ctx.open.record(r.ref), exportName: "cc-without-vq" }), { span: 2 })));
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
export function sops(ctx) {
  const { m } = ctx;
  const S = m.sops;
  const by = (s) => S.filter((x) => x.reviewStatus === s).length;
  const depts = [...M.countBy(S, (s) => s.Department || "—")].sort((a, b) => b[1] - a[1]).map(([d]) => ({
    label: d, parts: Object.fromEntries([...new Set(S.map((s) => s.Site || "—"))].map((site) => [site, S.filter((s) => (s.Department || "—") === d && (s.Site || "—") === site).length])),
  }));
  const sites = [...new Set(S.map((s) => s.Site || "—"))].map((site, i) => ({ key: site, label: site, color: `var(--c${[1, 2, 3, 7][i % 4]})` }));
  const langs = [...M.countBy(S, (s) => s.Language || "Unknown")].map(([l, n]) => ({ label: l, value: n, color: l === "Unknown" ? "var(--muted-mark)" : "var(--c1)" }));
  return h("div.view",
    viewHeader(t("sop_title"), t("sop_sub"), ctx.canEdit ? h("button.btn.primary", { type: "button", onclick: () => ctx.add("sop") }, icon("plus", 16), t("add_sop")) : null),
    h("div.banner.warn", icon("alert", 18), t("sop_banner")),
    h("div.kpi-grid",
      kpi({ label: t("sop_k_n"), value: fmtNum(S.length), accent: "var(--c1)" }),
      kpi({ label: t("sop_k_onc"), value: fmtNum(S.filter((s) => /Onc/i.test(s.Code) || s.Site === "Oncology").length) }),
      kpi({ label: t("sop_k_od"), value: fmtNum(by("Overdue")), status: M.rag(by("Overdue"), m.targets.sop_od, false) }),
      kpi({ label: t("sop_k_90"), value: fmtNum(by("Due ≤90 d")) }),
      kpi({ label: t("sop_k_nodate"), value: fmtNum(by("No review date")), accent: "var(--muted-mark)" }),
      kpi({ label: t("sop_k_nolink"), value: fmtNum(S.filter((s) => !s["Linked rooms"] && !s["Linked equipment"]).length) }),
      kpi({ label: t("sop_k_forms"), value: fmtNum(m.forms.length) })),
    h("div.grid.cols-2",
      card(t("sop_c_dept"), stacks(depts, sites)),
      card(t("sop_c_lang"), hbars(langs)),
      card(t("sop_due"), dataTable(sopCols(), S.filter((s) => s.reviewStatus === "Overdue" || s.reviewStatus === "Due ≤90 d"), { search: false, onRow: (s) => ctx.open.sop(s.Code) }), { span: 2 }),
      card(t("n_sop"), dataTable([...sopCols(), { key: "Type", label: t("col_type") }, { key: "Site", label: "Site" }, { key: "Source", label: t("source"), cls: "muted" }], S, { pageSize: 20, onRow: (s) => ctx.open.sop(s.Code), exportName: "sop-library" }), { span: 2 }),
      card(t("n_forms"), dataTable([{ key: "Form code", label: t("col_code"), cls: "mono" }, { key: "Type", label: t("col_type") }, { key: "Linked SOP", label: t("col_linksop"), cls: "mono" }, { key: "Linked room", label: t("col_room"), cls: "mono" }, { key: "Status", label: t("col_status") }, { key: "Title", label: t("col_title"), cls: "wrap" }], m.forms, { search: false }), { span: 2 })));
}

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
      [["cc", "Change Control"], ["capa", "CAPA"], ["qe", "Deviation"]].map(([k, ty]) => h("button.btn", { type: "button", style: { "--dot": TYPE_COLOR[ty] }, onclick: () => ctx.add(k) }, h("i.dot"), tv(ty)))) : null),
    h("div.type-switch", types.map(([v, l]) => h("button", { type: "button", class: (f.type ?? M.ALL) === v ? "on" : "", style: { "--dot": TYPE_COLOR[v] ?? "var(--ink)" }, onclick: () => setF("type", v) },
      h("i"), l, h("b", fmtNum(v === M.ALL ? m.records.length : counts[v]))))),
    card(null, dataTable(recordCols(["ref", "type", "status", "cls", "dept", "opened", "due", "late", "owner", "room", "title"]), list, {
      pageSize: 25, onRow: (r) => ctx.open.record(r.ref), searchText: recordSearch, sortKey: "opened", sortDir: -1, exportName: "quality-records",
      tools: h("div.inline-filters",
        select(t("flt_status"), [[M.ALL, t("filter_all")], ...M.STATUSES.map((s) => [s, tv(s)])], f.status ?? M.ALL, (v) => setF("status", v)),
        select(t("flt_dept"), [[M.ALL, t("filter_all")], ...[...new Set(m.records.map((r) => r.department))].sort().map((d) => [d, tv(d)])], f.dept ?? M.ALL, (v) => setF("dept", v))),
    })));
}
