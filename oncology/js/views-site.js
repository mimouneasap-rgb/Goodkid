// Facility map, Room explorer, Equipment & calibration and Product view.
import { h, card, kpi, viewHeader, select, segmented, dataTable, pill, fmtDate, fmtNum, fmtPct, defList, TYPE_COLOR, CAL_COLOR, empty } from "./ui.js";
import { hbars, stacks, columns } from "./charts.js";
import { t, tv } from "./i18n.js";
import { icon } from "./icons.js";
import * as M from "./model.js";
import { recordCols, recordSearch } from "./views-overview.js";

// ---------- FACILITY MAP ----------
const METRICS = [
  ["crit", "Criticality (1 low – 3 high)", (r) => r.critWeight || null],
  ["open", "Open or overdue quality records", (r) => r.openOrOverdue],
  ["rpn", "Max initial FMEA RPN", (r) => r.maxRpn],
  ["cal", "Overdue calibrations", (r) => r.overdueCals],
  ["assets", "Number of assets", (r) => r.equipment],
  ["press", "Pressure set-point (Pa)", (r) => r["Pressure set-point (Pa)"]],
  ["grade", "Grade (D = 2, CNC = 1)", (r) => (r.Grade === "D" ? 2 : r.Grade === "CNC" ? 1 : null)],
  ["all", "All quality records", (r) => r.qualityRecords],
  ["risk", "Room risk score", (r) => r.riskScore],
];
const METRIC_FR = {
  crit: "Criticité (1 bas – 3 élevé)", open: "Enregistrements ouverts ou en retard", rpn: "IPR AMDEC initial max", cal: "Étalonnages en retard",
  assets: "Nombre d’actifs", press: "Consigne de pression (Pa)", grade: "Classe (D = 2, CNC = 1)", all: "Tous les enregistrements qualité", risk: "Score de risque de la salle",
};
const metricLabel = (mm) => (t("col_month") === "Mois" ? METRIC_FR[mm[0]] : mm[1]);
const RAMP = ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95", "#0d366b"];
function rampColor(v, max) {
  if (v == null || v === 0 || !max) return null;
  return RAMP[Math.min(RAMP.length - 1, Math.floor((v / max) * (RAMP.length - 1e-9)))];
}

/** Outline path of the union of grid cells for one room. */
function outline(cells, s) {
  const set = new Set(cells.map(([r, c]) => `${r},${c}`));
  let d = "";
  for (const [r, c] of cells) {
    const x = c * s, y = r * s;
    if (!set.has(`${r - 1},${c}`)) d += `M${x},${y}h${s}`;
    if (!set.has(`${r + 1},${c}`)) d += `M${x},${y + s}h${s}`;
    if (!set.has(`${r},${c - 1}`)) d += `M${x},${y}v${s}`;
    if (!set.has(`${r},${c + 1}`)) d += `M${x + s},${y}v${s}`;
  }
  return d;
}

export function floorPlan(ctx, { metric, selected, onPick, compact }) {
  const { m } = ctx;
  const grid = m.mapGrid;
  const byRoom = new Map();
  grid.forEach((row, r) => row.forEach((code, c) => { if (code) { if (!byRoom.has(code)) byRoom.set(code, []); byRoom.get(code).push([r, c]); } }));
  const mm = METRICS.find((x) => x[0] === metric) ?? METRICS[0];
  const vals = new Map([...byRoom.keys()].map((code) => [code, m.roomByCode.get(code) ? mm[2](m.roomByCode.get(code)) : null]));
  const max = Math.max(0, ...[...vals.values()].filter((v) => v != null));
  const s = 10, W = grid[0].length * s, H = grid.length * s;
  const svg = h("svg", { viewBox: `-2 -2 ${W + 4} ${H + 4}`, class: `plan${compact ? " compact" : ""}`, role: "img", "aria-label": t("map_title") });
  for (const [code, cells] of byRoom) {
    const room = m.roomByCode.get(code);
    const v = vals.get(code);
    const fill = rampColor(v, max) ?? "var(--plan-empty)";
    const rs = Math.min(...cells.map((x) => x[0])), re = Math.max(...cells.map((x) => x[0]));
    const cs = Math.min(...cells.map((x) => x[1])), ce = Math.max(...cells.map((x) => x[1]));
    // label position: centre of the bounding box if it is inside the room, else the first cell
    const midR = Math.round((rs + re) / 2), midC = Math.round((cs + ce) / 2);
    const inside = cells.some(([r, c]) => r === midR && c === midC);
    const [lr, lc] = inside ? [(rs + re + 1) / 2, (cs + ce + 1) / 2] : [cells[Math.floor(cells.length / 2)][0] + 0.5, cells[Math.floor(cells.length / 2)][1] + 0.5];
    const g = h("g.plan-room", {
      tabindex: "0", role: "button", "aria-label": `${code} ${room?.Name ?? ""}`,
      class: code === selected ? "sel" : "",
      "data-tip": `<b>${code}</b> · ${room?.Name ?? ""}<div class="tip-row"><span>${metricLabel(mm)}</span><b>${v == null ? "—" : fmtNum(v)}</b></div>${room ? `<div class="tip-row"><span>${t("rx_grade")} · ${t("rx_crit")}</span><b>${room.Grade ?? "—"} · ${tv(room.Criticality) ?? "—"}</b></div>` : ""}`,
      onclick: () => onPick(code), onkeydown: (e) => { if (e.key === "Enter") onPick(code); },
    });
    g.append(h("path", { d: cells.map(([r, c]) => `M${c * s},${r * s}h${s}v${s}h${-s}z`).join(""), fill, class: "plan-fill" }));
    g.append(h("path", { d: outline(cells, s), class: "plan-edge" }));
    const dark = v != null && max && v / max > 0.45;
    const label = code.replace(/^FFO-/, "").replace(/^FF-/, "FF ");
    const area = cells.length;
    g.append(h("text.plan-label", { x: lc * s, y: lr * s + 3.5, "text-anchor": "middle", class: dark ? "on-dark" : "", "font-size": area < 12 ? 7 : area < 40 ? 9 : 11 }, label));
    svg.append(g);
  }
  return { svg, max, metric: mm };
}

export function map(ctx) {
  const { m } = ctx;
  const metric = ctx.state.mapMetric ?? "crit";
  const view = ctx.state.mapView ?? "schematic";
  const selected = ctx.state.room ?? m.rooms[0]?.Code;
  const { svg, max, metric: mm } = floorPlan(ctx, { metric, selected, onPick: (code) => ctx.go("rooms", { room: code }) });
  const ranked = m.rooms.map((r) => ({ r, v: mm[2](r) })).filter((x) => x.v != null && x.v !== 0).sort((a, b) => b.v - a.v);
  return h("div.view",
    viewHeader(t("map_title"), t("map_sub")),
    h("div.map-layout",
      card(null, [
        h("div.map-tools",
          select(t("map_metric"), METRICS.map((x) => [x[0], metricLabel(x)]), metric, (v) => ctx.set("mapMetric", v)),
          m.meta.drawing ? segmented([["schematic", t("schematic")], ["drawing", t("drawing")]], view, (v) => ctx.set("mapView", v), t("map_drawing")) : null),
        view === "drawing" && m.meta.drawing
          ? h("figure.drawing", h("img", { src: m.meta.drawing, alt: "ELK.DWG.048 v1.2 – oncology block layout", loading: "lazy" }), h("figcaption", t("map_drawing"), " · ELK.DWG.048 v1.2"))
          : h("div.plan-wrap", svg),
        view === "drawing" && m.meta.drawing ? null : h("div.ramp-legend", h("span", t("legend_low")), h("span.ramp", RAMP.map((c) => h("i", { style: { background: c } }))), h("span", `${t("legend_high")} (${fmtNum(max)})`), h("span.ramp-empty", h("i"), "0 / —")),
        h("p.fine", t("map_note"))], { cls: "map-card" }),
      card(t("map_table"), ranked.length ? hbars(ranked.map(({ r, v }) => ({ label: r.Code, sub: r.Name, value: v, color: rampColor(v, max), onclick: () => ctx.go("rooms", { room: r.Code }) }))) : h("div.empty", t("no_data")), { sub: metricLabel(mm) })));
}

// ---------- ROOM EXPLORER ----------
export function rooms(ctx) {
  const { m } = ctx;
  const code = ctx.params.room ?? ctx.state.room ?? m.rooms[0].Code;
  if (ctx.state.room !== code) ctx.state.room = code;
  const room = m.roomByCode.get(code) ?? m.rooms[0];
  const idx = m.rooms.indexOf(room);
  const go = (c) => ctx.go("rooms", { room: c });
  const has = (list, c) => String(list ?? "").split(/[;,]\s*/).some((x) => x.trim().startsWith(c));
  const eq = m.equip.filter((e) => e["Room code"] === room.Code);
  const qr = m.records.filter((r) => r.roomCode === room.Code);
  const fm = m.fmea.filter((f) => f["Room code"] === room.Code);
  const ccp = m.ccp.filter((c) => c.Room === room.Code);
  const sops = m.sops.filter((s) => has(s["Linked rooms"], room.Code));
  const forms = m.forms.filter((f) => has(f["Linked room"], room.Code));
  const impr = m.impr.filter((i) => i.Room === room.Code);
  const adj = m.adj.filter((a) => a.Room === room.Code || a["Adjacent room"] === room.Code).map((a) => {
    const flip = a.Room !== room.Code;
    return { neighbour: flip ? a.Room : a["Adjacent room"], gauge: a.Gauge, nsp: flip ? a.roomSp : a.adjSp, rsp: flip ? a.adjSp : a.roomSp, dp: a.dp == null ? null : flip ? -a.dp : a.dp };
  });
  const mini = floorPlan(ctx, { metric: "crit", selected: room.Code, onPick: go, compact: true }).svg;
  const critC = { High: "var(--critical)", Medium: "var(--warning)", Low: "var(--good)" }[room.Criticality];

  return h("div.view",
    viewHeader(t("rx_title"), t("rx_sub"),
      h("div.room-nav",
        h("button.icon-btn", { type: "button", title: t("rx_prev"), "aria-label": t("rx_prev"), disabled: idx <= 0 ? true : null, onclick: () => go(m.rooms[idx - 1].Code) }, h("span.flip", icon("chevron", 16))),
        select(t("rx_select"), m.rooms.map((r) => [r.Code, `${r.Code} · ${r.Name}`]), room.Code, go),
        h("button.icon-btn", { type: "button", title: t("rx_next"), "aria-label": t("rx_next"), disabled: idx >= m.rooms.length - 1 ? true : null, onclick: () => go(m.rooms[idx + 1].Code) }, icon("chevron", 16)))),
    h("div.room-hero",
      h("div.room-id",
        h("span.room-code", room.Code),
        h("h2", room.Name),
        h("p", room.Area),
        h("div.room-tags",
          room.Grade ? h("span.tag", `${t("rx_grade")} ${room.Grade}`) : null,
          room.Criticality ? h("span.tag", { style: { "--dot": critC } }, h("i"), `${t("rx_crit")} · ${tv(room.Criticality)}`) : null,
          room["OEB level"] != null ? h("span.tag", `OEB ${room["OEB level"]}`) : null,
          room["Pressure set-point (Pa)"] != null ? h("span.tag", `${room["Pressure set-point (Pa)"]} Pa`) : null,
          room["Activity type"] ? h("span.tag", room["Activity type"]) : null)),
      h("div.room-mini", mini)),
    h("div.kpi-grid.six",
      kpi({ label: t("rx_k_eq"), value: fmtNum(room.equipment) }),
      kpi({ label: t("rx_k_gmp"), value: fmtNum(room.gmpCritical) }),
      kpi({ label: t("rx_k_qr"), value: fmtNum(room.qualityRecords) }),
      kpi({ label: t("rx_k_open"), value: fmtNum(room.openOrOverdue), accent: room.openOrOverdue ? "var(--critical)" : null }),
      kpi({ label: t("rx_k_rpn"), value: fmtNum(room.maxRpn), accent: room.maxRpn >= 64 ? "var(--critical)" : null }),
      kpi({ label: t("rx_k_risk"), value: fmtNum(room.riskScore), hint: t("rx_score_note").split("(")[0] })),
    h("div.grid.cols-2",
      card(t("rx_profile"), defList([
        [t("rx_activity"), room["Activity type"]], [t("rx_rationale"), room["Criticality rationale"]],
        [t("rx_alarm"), room["Pressure alarm"]], [t("rx_adj"), room["Adjacent rooms"]], [t("rx_product"), room["Current product"]],
        [t("rx_clean"), [room["Cleaning status"], room["Cleaning expiry"]].filter(Boolean).join(" · ")],
        [t("rx_notes"), room.Notes], ["Data status", room["Data status"]],
        [t("flags"), room.dataGaps.length ? h("span.warn-text", room.dataGaps.join(" · ")) : null],
      ]), { span: 2 }),
      card(t("rx_l_eq"), dataTable(equipCols(["asset", "cat", "reg", "qual", "cal", "desc"]), eq, { onRow: (e) => ctx.open.asset(e["Asset no"]) }), { span: 2 }),
      card(t("rx_l_qr"), dataTable(recordCols(["ref", "type", "status", "cls", "opened", "due", "link", "title"]), qr, { onRow: (r) => ctx.open.record(r.ref) }), { span: 2 }),
      card(t("rx_l_fm"), dataTable(fmeaCols(), fm, { onRow: (f) => ctx.open.risk(f["Risk ID"]) }), { span: 2 }),
      card(t("rx_l_adj"), dataTable([
        { key: "neighbour", label: t("col_neigh"), cls: "mono", render: (a) => h("button.link", { type: "button", onclick: (e) => { e.stopPropagation(); go(a.neighbour); } }, a.neighbour) },
        { key: "gauge", label: t("col_gauge"), cls: "mono" }, { key: "nsp", label: t("col_spn"), cls: "num" }, { key: "rsp", label: t("col_spr"), cls: "num" }, { key: "dp", label: t("col_dp"), cls: "num" },
      ], adj, { search: false })),
      card(t("rx_l_ccp"), dataTable([
        { key: "CCP ID", label: t("col_id"), cls: "mono nowrap" }, { key: "Process step", label: t("col_step") }, { key: "Parameter", label: t("col_param"), cls: "wrap" },
        { key: "Limit", label: t("col_limit"), cls: "wrap" }, { key: "Frequency", label: t("col_freq") },
      ], ccp, { search: false })),
      card(t("rx_l_sop"), dataTable(sopCols(), sops, { search: false, onRow: (s) => ctx.open.sop(s.Code) })),
      card(t("rx_l_form"), dataTable([{ key: "Form code", label: t("col_code"), cls: "mono" }, { key: "Type", label: t("col_type") }, { key: "Linked SOP", label: t("col_linksop"), cls: "mono" }, { key: "Title", label: t("col_title"), cls: "wrap" }], forms, { search: false })),
      impr.length ? card(t("rx_l_imp"), dataTable([{ key: "ID", label: t("col_id"), cls: "mono" }, { key: "Stage", label: t("col_stage") }, { key: "Title", label: t("col_title"), cls: "wrap" }], impr, { search: false }), { span: 2 }) : null),
  );
}

export function equipCols(keys) {
  const all = {
    asset: { key: "Asset no", label: t("col_asset"), cls: "mono nowrap" },
    cat: { key: "Category", label: t("col_cat") },
    reg: { key: "Register", label: t("col_register"), cls: "mono" },
    qual: { key: "Qualification status", label: t("col_qual") },
    cal: { key: "calStatus", label: t("col_cal"), render: (e) => pill(e.calStatus, "cal") },
    next: { key: "next", label: t("col_next"), render: (e) => fmtDate(e.next), cls: "num nowrap", date: true },
    desc: { key: "Description", label: t("col_desc"), cls: "wrap" },
    room: { key: "Room code", label: t("col_room"), cls: "mono nowrap" },
    parent: { key: "Parent asset", label: t("col_parent"), cls: "mono" },
    dq: { key: "dq", label: t("col_issue"), sort: (e) => e.dataQuality.join("; "), render: (e) => h("span.warn-text", e.dataQuality.join(" · ")) },
  };
  return keys.map((k) => all[k]);
}
export function fmeaCols() {
  return [
    { key: "Risk ID", label: t("col_id"), cls: "mono nowrap" },
    { key: "Process step", label: t("col_step") },
    { key: "Assessment ref", label: t("fm_assess"), cls: "mono" },
    { key: "rpn", label: t("col_rpn"), cls: "num", render: (f) => h("b", fmtNum(f.rpn)) },
    { key: "level", label: t("col_level"), render: (f) => pill(f.level, "level") },
    { key: "rrpn", label: t("col_rrpn"), cls: "num" },
    { key: "rlevel", label: t("col_level"), render: (f) => pill(f.rlevel, "level") },
    { key: "Failure mode", label: t("col_fail"), cls: "wrap" },
  ];
}
export function sopCols() {
  return [
    { key: "Code", label: t("col_code"), cls: "mono nowrap" },
    { key: "Department", label: t("col_dept") },
    { key: "Revision", label: t("col_rev"), cls: "num" },
    { key: "reviewStatus", label: t("col_review"), render: (s) => tv(s.reviewStatus) },
    { key: "Title", label: t("col_title"), cls: "wrap" },
  ];
}

// ---------- EQUIPMENT ----------
export function equipment(ctx) {
  const { m } = ctx;
  const E = m.equip;
  const by = (s) => E.filter((e) => e.calStatus === s).length;
  const withFreq = E.filter((e) => e.freq != null).length;
  const noDates = !E.some((e) => e.last != null);
  const regs = [...new Set(E.map((e) => e.Register))].sort();
  const series = M.CAL_STATUSES.map((s) => ({ key: s, label: tv(s), color: CAL_COLOR[s] }));
  const regRows = regs.map((r) => ({ label: r, parts: Object.fromEntries(M.CAL_STATUSES.map((s) => [s, E.filter((e) => e.Register === r && e.calStatus === s).length])) }));
  const roomRows = [...M.countBy(E.filter((e) => e["Room code"]), "Room code")].sort((a, b) => b[1] - a[1]).slice(0, 10)
    .map(([code, n]) => ({ label: code, sub: m.roomByCode.get(code)?.Name, value: n, onclick: () => ctx.go("rooms", { room: code }) }));
  const upcoming = E.filter((e) => e.next != null && e.daysToDue <= 365).sort((a, b) => a.next - b.next).slice(0, 40);
  const f = ctx.state.eq ?? {};
  const setF = (k, v) => ctx.set("eq", { ...f, [k]: v });
  const cats = [...new Set(E.map((e) => e.Category).filter(Boolean))].sort();
  const list = E.filter((e) => (!f.reg || f.reg === M.ALL || e.Register === f.reg) && (!f.cat || f.cat === M.ALL || e.Category === f.cat) && (!f.cal || f.cal === M.ALL || e.calStatus === f.cal));

  return h("div.view",
    viewHeader(t("eq_title"), t("eq_sub")),
    noDates ? h("div.banner.warn", icon("alert", 18), t("eq_nodates")) : null,
    h("div.kpi-grid",
      kpi({ label: t("eq_k_all"), value: fmtNum(E.length), accent: "var(--c1)" }),
      kpi({ label: t("eq_k_freq"), value: fmtNum(withFreq) }),
      kpi({ label: t("eq_k_over"), value: fmtNum(by("Overdue")), accent: "var(--critical)" }),
      kpi({ label: t("eq_k_30"), value: fmtNum(by("Due ≤30 d")) }),
      kpi({ label: t("eq_k_60"), value: fmtNum(by("Due 31–60 d")) }),
      kpi({ label: t("eq_k_90"), value: fmtNum(by("Due 61–90 d")) }),
      kpi({ label: t("eq_k_missing"), value: fmtNum(by("Missing date")), accent: "var(--c7)" }),
      kpi({ label: t("eq_k_comp"), value: fmtPct(M.calCompliance(E)), status: M.rag(M.calCompliance(E), m.targets.cal, true), hint: `≥ ${fmtPct(m.targets.cal?.target)}` })),
    h("div.grid.cols-2",
      card(t("eq_by_reg"), stacks(regRows, series)),
      card(t("eq_by_room"), hbars(roomRows)),
      card(t("eq_gantt"), upcoming.length ? timeline(upcoming, m.now) : h("div.empty", t("eq_nodates")), { span: 2 }),
      card(t("equipment_list"), dataTable(equipCols(["asset", "room", "cat", "reg", "qual", "cal", "desc"]), list, {
        pageSize: 20, onRow: (e) => ctx.open.asset(e["Asset no"]), exportName: "equipment",
        searchText: (e) => `${e.Model ?? ""} ${e.Serial ?? ""} ${e.Manufacturer ?? ""} ${e["Room (as registered)"] ?? ""}`,
        tools: h("div.inline-filters",
          select(t("col_register"), [[M.ALL, t("filter_all")], ...regs], f.reg ?? M.ALL, (v) => setF("reg", v)),
          select(t("col_cat"), [[M.ALL, t("filter_all")], ...cats], f.cat ?? M.ALL, (v) => setF("cat", v)),
          select(t("col_cal"), [[M.ALL, t("filter_all")], ...M.CAL_STATUSES.map((s) => [s, tv(s)])], f.cal ?? M.ALL, (v) => setF("cal", v))),
      }), { span: 2 })));
}

function timeline(items, now) {
  const months = M.lastMonths(M.addMonths(now, 11), 12);
  const start = months[0], end = M.addMonths(months[11], 1);
  const pos = (ts) => `${Math.max(0, Math.min(100, ((ts - start) / (end - start)) * 100))}%`;
  return h("div.timeline",
    h("div.tl-head", h("span"), h("div.tl-months", months.map((mm) => h("span", fmtDate(mm).slice(3))))),
    items.map((e) => h("div.tl-row", h("span.mono", e["Asset no"]), h("div.tl-track", h("i.tl-dot", { style: { left: pos(e.next), background: CAL_COLOR[e.calStatus] }, "data-tip": `<b>${e["Asset no"]}</b><div class="tip-row"><span>${t("col_next")}</span><b>${fmtDate(e.next)}</b></div>` })))));
}

// ---------- PRODUCT VIEW ----------
export function products(ctx) {
  const { m } = ctx;
  const prods = [];
  for (const p of m.products) if (!prods.some((x) => x.Product === p.Product)) prods.push(p);
  const sel = ctx.params.product ?? ctx.state.product ?? prods[0].Product;
  ctx.state.product = sel;
  const P = prods.find((p) => p.Product === sel) ?? prods[0];
  const recs = m.records.filter((r) => r.productKey === P.Product);
  const of = (ty) => recs.filter((r) => r.type === ty);
  const matrix = prods.map((p) => {
    const rr = m.records.filter((r) => r.productKey === p.Product);
    return { ...p, cc: rr.filter((r) => r.type === "Change Control").length, capa: rr.filter((r) => r.type === "CAPA").length, dev: rr.filter((r) => r.type === "Deviation").length, open: rr.filter((r) => r.isOpen).length, od: rr.filter((r) => r.overdue).length, last: Math.max(0, ...rr.map((r) => r.opened ?? 0)) || null, total: rr.length };
  });
  // quarters spanning the product's records (last 8 quarters)
  const qOf = (ts) => { const d = new Date(ts); return `${d.getUTCFullYear()}-Q${Math.floor(d.getUTCMonth() / 3) + 1}`; };
  const qs = [];
  for (let i = 7; i >= 0; i--) qs.push(qOf(M.addMonths(m.now, -3 * i)));
  const qPts = qs.map((q) => ({ x: q, ...Object.fromEntries(M.TYPES.map((ty) => [ty, recs.filter((r) => r.opened != null && qOf(r.opened) === q && r.type === ty).length])) }));
  const tseries = M.TYPES.map((ty) => ({ key: ty, label: tv(ty), color: TYPE_COLOR[ty] }));
  const pick = (p) => ctx.go("products", { product: p });

  return h("div.view",
    viewHeader(t("pv_title"), t("pv_sub"), select(t("pv_sel"), prods.map((p) => [p.Product, `${p.Product}${p.API ? " · " + p.API : ""}`]), P.Product, pick)),
    h("div.product-hero",
      h("div.product-id",
        h("span.eyebrow", t("pv_card")),
        h("h2", P.Product),
        h("p", [P.API, P.Strengths, P["Dosage form"]].filter(Boolean).join(" · ")),
        h("div.room-tags",
          P.OEB != null ? h("span.tag", `OEB ${P.OEB}`) : null,
          P.Status ? h("span.tag", P.Status) : null,
          P["Released batches (SMF Att. 1)"] ? h("span.tag", `${t("pv_batches")}: ${P["Released batches (SMF Att. 1)"]}`) : null)),
      h("div.kpi-grid.six.flat",
        kpi({ label: t("pv_k_all"), value: fmtNum(recs.length) }),
        kpi({ label: t("pv_k_dev"), value: fmtNum(of("Deviation").length), accent: TYPE_COLOR.Deviation }),
        kpi({ label: t("pv_k_cc"), value: fmtNum(of("Change Control").length), accent: TYPE_COLOR["Change Control"] }),
        kpi({ label: t("pv_k_capa"), value: fmtNum(of("CAPA").length), accent: TYPE_COLOR.CAPA }),
        kpi({ label: t("pv_k_open"), value: fmtNum(recs.filter((r) => r.isOpen).length) }),
        kpi({ label: t("pv_k_od"), value: fmtNum(recs.filter((r) => r.overdue).length), accent: "var(--critical)" }))),
    h("p.fine", t("pv_note")),
    h("div.grid.cols-2",
      card(t("pv_c_q"), columns(qPts, tseries, { xFmt: (x) => x.replace("-", " ") })),
      card(t("pv_c_all"), stacks(matrix.filter((p) => p.total).sort((a, b) => b.total - a.total).map((p) => ({ label: p.Product, parts: { "Change Control": p.cc, CAPA: p.capa, Deviation: p.dev }, onclick: () => pick(p.Product) })), tseries)),
      card(t("pv_matrix"), dataTable([
        { key: "Product", label: t("product"), render: (p) => h("b", p.Product) },
        { key: "API", label: t("pv_api") },
        { key: "Status", label: t("pv_status"), cls: "wrap" },
        { key: "OEB", label: "OEB", cls: "num" },
        { key: "cc", label: t("pv_k_cc"), cls: "num" }, { key: "capa", label: t("pv_k_capa"), cls: "num" }, { key: "dev", label: t("pv_k_dev"), cls: "num" },
        { key: "open", label: t("pv_k_open"), cls: "num" }, { key: "od", label: t("pv_k_od"), cls: "num", render: (p) => (p.od ? h("b.late", p.od) : "0") },
        { key: "last", label: t("col_last"), cls: "num nowrap", render: (p) => fmtDate(p.last) },
      ], matrix, { pageSize: 25, search: false, onRow: (p) => pick(p.Product), rowCls: (p) => (p.Product === P.Product ? "selected" : "") }), { span: 2 }),
      card(t("pv_l_dev"), dataTable(recordCols(["ref", "status", "opened", "batch", "cls", "title"]), of("Deviation"), { onRow: (r) => ctx.open.record(r.ref) }), { span: 2 }),
      card(t("pv_l_cc"), dataTable(recordCols(["ref", "status", "opened", "stage", "cls", "title"]), of("Change Control"), { onRow: (r) => ctx.open.record(r.ref) })),
      card(t("pv_l_capa"), dataTable(recordCols(["ref", "status", "opened", "due", "source", "title"]), of("CAPA"), { onRow: (r) => ctx.open.record(r.ref) }))));
}

export { recordSearch, empty };
