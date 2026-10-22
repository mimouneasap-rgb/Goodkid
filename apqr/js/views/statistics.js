// Statistics lab: Annex 6 statistical study. Paste results, get capability,
// control chart, run rules, normality and the SOPQA0152E interpretation, then
// save the study to the product's APQR.

import { el, icon, fmtNum } from "../dom.js";
import { shortProduct } from "../model.js";
import { CAPABILITY_GUIDE } from "../sop.js";
import { evaluateStudy, parseNumbers, histogram } from "../stats.js";
import { controlChart, histogramChart, cpkStripChart } from "../charts.js";
import { cardHead, select, lazyChart, mountCharts, legend, toast } from "../ui.js";
import { bandChip } from "./product.js";

export const title = () => "Statistics lab";
export const crumbs = () => ["Annex 6 statistical study · SOPQA0152E Phase 5"];

const STAGES = ["Finished product", "In-process control", "Yield", "Stability", "Raw material", "Other"];

const EXAMPLE = {
  attribute: "Assay (example data)", stage: "Finished product", unit: "% of label claim", lsl: "95", target: "100", usl: "105",
  valuesText: "101.7 100.9 102.6 102.3 101.4 102 103.1 100.6 101.8 102.4 101.3 102.8 101.6 101.1 102.2 103.4 101.9 100.8 102.1 102.7 101.45 101.65 102.05 102.35 102.85 103.25 101.7 101.2 102.4 102.9",
  batchText: "", cpkManual: "", ppkManual: "", controlManual: "", note: "",
};

function blankDraft() {
  return { id: "", attribute: "", stage: "Finished product", unit: "", lsl: "", target: "", usl: "", valuesText: "", batchText: "", cpkManual: "", ppkManual: "", controlManual: "", note: "" };
}

function draftFrom(study) {
  return { ...blankDraft(), ...study, valuesText: (study.values || []).join("\n"), batchText: (study.batchLabels || []).join("\n") };
}

function toStudy(draft) {
  const values = parseNumbers(draft.valuesText);
  const batchLabels = draft.batchText.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  const { valuesText, batchText, ...rest } = draft;
  return { ...rest, values, batchLabels };
}

function uiState(ctx) {
  const u = (ctx.ui.stats ??= { productId: "", draft: blankDraft(), lastQuery: null });
  const qs = ctx.route.query.toString();
  if (qs !== u.lastQuery) {
    u.lastQuery = qs;
    const pid = ctx.route.query.get("product");
    const sid = ctx.route.query.get("study");
    if (pid) {
      u.productId = pid;
      const p = ctx.state.products.find((x) => x.id === pid);
      const s = p?.studies.find((x) => x.id === sid);
      u.draft = s ? draftFrom(s) : blankDraft();
    }
  }
  return u;
}

export function render(ctx) {
  const u = uiState(ctx);
  const products = [...ctx.d.products].sort((a, b) => a.name.localeCompare(b.name));
  const product = u.productId ? ctx.state.products.find((p) => p.id === u.productId) : null;
  const results = el("div", { style: { display: "flex", flexDirection: "column", gap: "20px", minWidth: 0 } });
  const refresh = () => {
    results.replaceChildren(...resultsPanel(toStudy(u.draft)));
    mountCharts(results);
  };
  const set = (key) => (e) => { u.draft[key] = e.target.value; refresh(); };
  const field = (key, label, attrs = {}) => el("div", { class: `field ${attrs.full ? "full" : ""}` }, el("label", { for: `st-${key}` }, label),
    el("input", { id: `st-${key}`, class: "input", value: u.draft[key], placeholder: attrs.placeholder, inputmode: attrs.numeric ? "decimal" : null, oninput: set(key) }));

  const form = el("section", { class: "card" },
    cardHead("Study", product ? `Saved to ${shortProduct(product.name)}` : "Choose a product to save the study to its APQR"),
    el("div", { class: "card-body", style: { display: "flex", flexDirection: "column", gap: "14px" } },
      el("div", { class: "field" }, el("label", {}, "Product"),
        select([["", "Scratch pad (not saved)"], ...products.map((p) => [p.id, `${p.code ? `${p.code} · ` : ""}${shortProduct(p.name)}`])], u.productId, (v) => {
          u.productId = v; u.draft = blankDraft(); ctx.refresh();
        }, { label: "Product" })),
      product && product.studies.length ? el("div", { class: "field" }, el("label", {}, "Study"),
        select([["", "New study"], ...product.studies.map((s) => [s.id, s.attribute || "Untitled"])], u.draft.id, (v) => {
          const s = product.studies.find((x) => x.id === v);
          u.draft = s ? draftFrom(s) : blankDraft();
          ctx.refresh();
        }, { label: "Study" })) : null,
      el("div", { class: "form-grid" },
        field("attribute", "Quality attribute or parameter", { full: true, placeholder: "e.g. Assay, Dissolution, Hardness, Final yield" }),
        el("div", { class: "field" }, el("label", {}, "Process stage"), select(STAGES, u.draft.stage, (v) => { u.draft.stage = v; refresh(); }, { label: "Process stage" })),
        field("unit", "Unit", { placeholder: "%, kP, mg…" }),
        field("lsl", "LSL", { numeric: true, placeholder: "Lower spec" }),
        field("usl", "USL", { numeric: true, placeholder: "Upper spec" })),
      el("div", { class: "field" }, el("label", { for: "st-values" }, "Results, one per batch in manufacturing order"),
        el("textarea", { id: "st-values", class: "textarea mono", style: { minHeight: "150px" }, placeholder: "Paste a column from Excel, or type values separated by spaces", oninput: set("valuesText") }, u.draft.valuesText),
        el("span", { class: "hint" }, "Decimal commas are accepted. Blank cells and text are ignored.")),
      el("details", {}, el("summary", { style: { cursor: "pointer", fontWeight: 650, fontSize: "13px" } }, "Batch numbers, manual results and notes"),
        el("div", { class: "form-grid", style: { marginTop: "12px" } },
          el("div", { class: "field full" }, el("label", { for: "st-batches" }, "Batch numbers (same order, optional)"),
            el("textarea", { id: "st-batches", class: "textarea mono", style: { minHeight: "70px" }, oninput: set("batchText") }, u.draft.batchText)),
          field("cpkManual", "Cpk from Minitab", { numeric: true, placeholder: "When raw data is not entered" }),
          field("ppkManual", "Ppk from Minitab", { numeric: true }),
          el("div", { class: "field" }, el("label", {}, "Control chart (manual)"), select([["", "Not assessed"], ["in", "In control"], ["out", "Out of control"]], u.draft.controlManual, (v) => { u.draft.controlManual = v; refresh(); }, { label: "Control status" })),
          el("div", { class: "field full" }, el("label", { for: "st-note" }, "Interpretation note"),
            el("textarea", { id: "st-note", class: "textarea", oninput: set("note") }, u.draft.note)))),
      el("div", { style: { display: "flex", gap: "8px", flexWrap: "wrap" } },
        product ? el("button", { class: "btn primary", type: "button", onclick: () => save(ctx, u, product) }, icon("checkCircle", "sm"), u.draft.id ? "Save study" : "Save to APQR") : null,
        product && u.draft.id ? el("button", { class: "btn danger", type: "button", onclick: () => remove(ctx, u, product) }, icon("trash", "sm"), "Delete") : null,
        el("button", { class: "btn", type: "button", onclick: () => { u.draft = { ...EXAMPLE, id: "" }; ctx.refresh(); } }, icon("sparkles", "sm"), "Load example"),
        el("button", { class: "btn ghost", type: "button", onclick: () => { u.draft = blankDraft(); ctx.refresh(); } }, "Clear"),
        product ? el("a", { class: "btn ghost", href: `#/product/${encodeURIComponent(product.id)}?tab=statistics` }, "Open product", icon("chevronRight", "sm")) : null)));

  const view = el("div", { class: "view" },
    el("div", { class: "grid g-12" },
      el("div", { class: "span-5" }, form),
      el("div", { class: "span-7" }, results)),
    library(ctx));
  results.append(...resultsPanel(toStudy(u.draft)));
  return view;
}

function resultsPanel(study) {
  const ev = evaluateStudy(study);
  if (!ev.enough && ev.cpk === null) {
    return [el("section", { class: "card" }, el("div", { class: "empty" }, icon("flask"), el("h3", {}, "Paste at least two results"),
      el("p", {}, "Capability (Cp, Cpk, Pp, Ppk), an individuals control chart with Western Electric run rules, a histogram and an Anderson–Darling normality test appear here."),
      el("p", { style: { marginTop: "8px" } }, "Enter LSL and/or USL for capability. Use “Load example” to try it.")))];
  }
  const g = CAPABILITY_GUIDE.find((x) => x.band === ev.band);
  const d = ev.describe;
  const fmtV = (v, digits = 3) => (v === null || v === undefined || !Number.isFinite(v) ? "—" : fmtNum(v, digits));
  const out = [];
  out.push(el("section", { class: "card" },
    cardHead("Verdict", study.attribute || "Untitled study"),
    el("div", { class: "card-body", style: { display: "flex", flexDirection: "column", gap: "14px" } },
      el("div", { style: { display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "stretch" } },
        el("div", { class: `cpk-badge ${ev.band || "none"}` }, el("span", { class: "l" }, icon(ev.band === "excellent" ? "checkCircle" : ev.band ? "alert" : "info", "sm"), "Cpk"), el("span", { class: "v" }, fmtV(ev.cpk, 2)), el("span", { class: "l" }, g ? g.label : "Needs a spec limit")),
        el("div", { class: "cpk-badge none" }, el("span", { class: "l" }, "Ppk"), el("span", { class: "v" }, fmtV(ev.ppk, 2)), el("span", { class: "l" }, "overall")),
        el("div", { class: `cpk-badge ${ev.inControl === null ? "none" : ev.inControl ? "excellent" : "poor"}` }, el("span", { class: "l" }, "Control"), el("span", { class: "v", style: { fontSize: "18px", marginTop: "4px" } }, ev.inControl === null ? "—" : ev.inControl ? "In control" : "Out of control"), el("span", { class: "l" }, ev.enough ? `${ev.rules.length} rule${ev.rules.length === 1 ? "" : "s"} fired` : "manual")),
        ev.normality ? el("div", { class: `cpk-badge ${ev.normality.normal ? "none" : "acceptable"}` }, el("span", { class: "l" }, "Normality"), el("span", { class: "v", style: { fontSize: "18px", marginTop: "4px" } }, `p = ${ev.normality.p < 0.001 ? "<0.001" : ev.normality.p.toFixed(3)}`), el("span", { class: "l" }, `Anderson–Darling A² ${ev.normality.a2.toFixed(3)}`)) : null),
      g ? el("div", { class: `callout ${ev.band === "excellent" ? "good" : ev.band === "acceptable" ? "warning" : "critical"}` }, icon(ev.band === "excellent" ? "checkCircle" : "alert"), el("span", {}, el("strong", {}, `${g.meaning} `), g.action)) : null,
      ev.actions.filter((a) => !g || !a.startsWith(g.action.split(";")[0].slice(0, 12))).length ? el("div", { class: "callout info" }, icon("info"), el("div", {}, el("strong", {}, "To include in the PQR"),
        el("ul", {}, ev.actions.map((a) => el("li", {}, a))))) : null)));
  if (ev.enough) {
    out.push(el("section", { class: "card" }, cardHead("Descriptive statistics", `${ev.n} values${study.unit ? ` · ${study.unit}` : ""}`),
      el("div", { class: "card-body" }, el("div", { class: "stat-grid" },
        stat("Mean", fmtV(d.mean)), stat("Std dev (overall)", fmtV(ev.cap.sdOverall)), stat("Std dev (within, MR̄/d₂)", fmtV(ev.cap.sdWithin)), stat("Median", fmtV(d.median)),
        stat("Min", fmtV(d.min)), stat("Max", fmtV(d.max)), stat("Cp / Pp", `${fmtV(ev.cap.cp, 2)} / ${fmtV(ev.cap.pp, 2)}`), stat("Out of spec", String(ev.cap.outOfSpec)),
        stat("UCL", fmtV(ev.limits.ucl)), stat("Centre line", fmtV(ev.limits.cl)), stat("LCL", fmtV(ev.limits.lcl)), stat("MR̄", fmtV(ev.limits.mrBar))))));
    out.push(el("section", { class: "card" }, cardHead("Individuals control chart", "UCL/LCL = X̄ ± 2.66 MR̄ · red points break a run rule"),
      el("div", { class: "card-body" },
        legend([["Result", "var(--s1)", "line"], ["Centre line", "var(--good)", "line"], ["Control limits", "var(--serious)", "line"], ["Spec limits", "var(--critical)", "line"]]),
        lazyChart((w) => controlChart(study, ev, w), { label: "Control chart" }),
        ev.rules.length ? el("div", { class: "callout warning", style: { marginTop: "12px" } }, icon("alert"), el("div", {},
          el("strong", {}, "Special-cause signals: investigate and discuss in the report, even when all results are within specification."),
          el("ul", {}, ev.rules.map((r) => el("li", {}, `Rule ${r.rule}: ${r.text} (points ${r.points.map((i) => i + 1).join(", ")})`))))) : null)));
    const hist = histogram(ev.values, [study.lsl, study.usl].filter((v) => v !== "" && v !== undefined).map(Number));
    out.push(el("section", { class: "card" }, cardHead("Distribution", "Histogram with the fitted normal curve and specification limits"),
      el("div", { class: "card-body" }, legend([["Batches per bin", "var(--s1)"], ["Normal fit", "var(--s2)", "line"], ["Spec limits", "var(--critical)", "line"]]),
        lazyChart((w) => histogramChart(study, ev, hist, w), { label: "Histogram" }))));
  }
  return out;
}

function stat(label, value) {
  return el("div", { class: "stat" }, el("div", { class: "l" }, label), el("div", { class: "v" }, value));
}

function library(ctx) {
  const rows = [];
  for (const p of ctx.d.products) {
    for (const s of p.studies) {
      const ev = evaluateStudy(s);
      const g = CAPABILITY_GUIDE.find((x) => x.band === ev.band);
      rows.push({ key: `${p.id}|${s.id}`, productId: p.id, studyId: s.id, title: `${shortProduct(p.name)} · ${s.attribute || "Untitled"}`, cpk: ev.cpk, band: ev.band, bandLabel: g ? `${g.label}: ${g.action}` : "No Cpk", ev });
    }
  }
  rows.sort((a, b) => (a.cpk ?? 99) - (b.cpk ?? 99));
  const counts = { excellent: 0, acceptable: 0, poor: 0, none: 0 };
  rows.forEach((r) => { counts[r.band || "none"]++; });
  return el("section", { class: "card" },
    cardHead("Capability across the programme", rows.length ? `${rows.length} saved stud${rows.length === 1 ? "y" : "ies"} · lowest Cpk first · click a row to open it` : "Saved studies from every product appear here"),
    el("div", { class: "card-body" }, rows.length ? [
      el("div", { style: { display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "14px" } },
        bandChip("excellent"), el("strong", {}, counts.excellent), bandChip("acceptable"), el("strong", {}, counts.acceptable), bandChip("poor"), el("strong", {}, counts.poor)),
      lazyChart((w) => cpkStripChart(rows, w), {
        label: "Cpk by study",
        onClick: (e) => {
          const g = e.target.closest("[data-study]");
          if (!g) return;
          const [pid, sid] = g.dataset.study.split("|");
          ctx.go(`stats?product=${encodeURIComponent(pid)}&study=${encodeURIComponent(sid)}`);
        },
      }),
    ] : el("div", { class: "empty" }, icon("stats"), el("h3", {}, "No studies saved yet"), el("p", {}, "Choose a product above, enter its results and save."))));
}

function save(ctx, u, product) {
  const study = toStudy(u.draft);
  if (!study.attribute.trim()) { toast("Name the attribute first"); return; }
  const id = study.id || `S${Date.now().toString(36).toUpperCase()}`;
  const next = { ...study, id, savedAt: new Date().toISOString() };
  const studies = study.id ? product.studies.map((s) => (s.id === id ? next : s)) : [...product.studies, next];
  // Point the URL at the saved study without a navigation, so the next render keeps this draft.
  const q = new URLSearchParams({ product: product.id, study: id });
  history.replaceState(null, "", `#/stats?${q}`);
  ctx.route.query = q;
  u.lastQuery = q.toString();
  u.draft = draftFrom(next);
  ctx.store.updateProduct(product.id, { studies }, `${study.id ? "Update" : "Add"} statistical study: ${study.attribute}`);
  ctx.undoToast("Study saved to the APQR");
}

function remove(ctx, u, product) {
  ctx.confirm({ title: "Delete this study?", message: `${u.draft.attribute || "This study"} will be removed from ${shortProduct(product.name)}. You can undo this.`, confirmLabel: "Delete", danger: true }).then((ok) => {
    if (!ok) return;
    ctx.store.updateProduct(product.id, { studies: product.studies.filter((s) => s.id !== u.draft.id) }, `Delete statistical study: ${u.draft.attribute}`);
    u.draft = blankDraft();
    ctx.undoToast("Study deleted");
  });
}
