// SOP guide: the two procedures as an interactive reference, plus live
// data-quality checks across the plan and the Scigeniq export.

import { el, icon, fmtMonth } from "../dom.js";
import { shortProduct } from "../model.js";
import { SOP_REFS, PROCESS_FLOW, PHASES, ROLES, REQUIREMENTS, DEPARTMENTS, KEY_RULES, CAPABILITY_GUIDE } from "../sop.js";
import { cardHead } from "../ui.js";

export const title = () => "SOP guide";
export const crumbs = () => [`${SOP_REFS.pqr.id} Rev. ${SOP_REFS.pqr.rev} · ${SOP_REFS.scigeniq.id}-${SOP_REFS.scigeniq.rev}`];

const DEPT_COLOR = { QA: "var(--s1)", QC: "var(--s2)", Production: "var(--s3)", RA: "var(--s4)", Validation: "var(--s5)" };

export function render(ctx) {
  const section = ctx.route.query.get("section");
  const view = el("div", { class: "view" },
    el("div", { class: "section-head" }, el("div", {}, el("h2", {}, "Process flow and time limits"),
      el("p", {}, "Attachment QA0021E/AE02/08 · from the annual plan to the approved report"))),
    el("div", { class: "flow" }, PROCESS_FLOW.map((s) => el("div", { class: "flow-step" },
      el("h3", {}, s.step), el("p", {}, s.who), el("div", { class: "limit" }, s.limit), el("div", { class: "faint", style: { fontSize: "11px", marginTop: "2px" } }, s.ref)))),

    el("section", { class: "card" }, cardHead("Scigeniq workflow phases", "SOPQA0152E §10 · how one product's APQR moves through the system"),
      el("div", { class: "card-body" }, el("ol", { class: "stepper", style: { listStyle: "none", margin: 0, padding: "4px 0 0" } }, PHASES.map((ph, i) =>
        el("li", { class: "step done" }, el("span", { class: "step-dot" }, String(i + 1)), el("span", { class: "step-label" }, ph.label), el("span", { class: "step-sop" }, ph.sop)))))),

    el("div", { class: "grid g-12" },
      el("section", { class: "card span-7" }, cardHead("Content requirements by department", "SOPQA0021E §10.4.1 · who supplies each part of the report"),
        el("div", { class: "table-wrap", style: { marginTop: "12px" } }, el("table", { class: "table" },
          el("thead", {}, el("tr", {}, el("th", {}, "#"), el("th", {}, "Requirement"), DEPARTMENTS.map((d) => el("th", { class: "center", "data-tip": `${d.label}\n${d.annex} · ${d.template}` }, d.annexCode)))),
          el("tbody", {}, REQUIREMENTS.map((r) => el("tr", {},
            el("td", { class: "muted" }, r.id),
            el("td", { "data-tip": r.text }, el("div", { style: { fontWeight: 600 } }, r.title), el("div", { class: "muted", style: { fontSize: "12px" } }, r.annex)),
            DEPARTMENTS.map((d) => el("td", { class: "center" }, r.depts.includes(d.id) ? el("span", { class: "dot", style: { width: "12px", height: "12px", background: DEPT_COLOR[d.id] }, "aria-label": `${d.label} supplies this` }) : null)))))))),
      el("div", { class: "span-5", style: { display: "flex", flexDirection: "column", gap: "20px" } },
        el("section", { class: "card" }, cardHead("Roles", "SOPQA0152E §5"),
          el("div", { class: "card-body", style: { display: "flex", flexDirection: "column", gap: "12px" } }, ROLES.map((r) =>
            el("div", {}, el("div", { style: { fontWeight: 700 } }, r.role, el("span", { class: "muted", style: { fontWeight: 500 } }, ` · ${r.who}`)), el("div", { class: "muted", style: { fontSize: "12.5px" } }, r.duties))))),
        el("section", { class: "card" }, cardHead("Capability interpretation", "SOPQA0152E Phase 5"),
          el("div", { class: "card-body", style: { display: "flex", flexDirection: "column", gap: "10px" } }, CAPABILITY_GUIDE.map((g) =>
            el("div", { class: `callout ${g.band === "excellent" ? "good" : g.band === "acceptable" ? "warning" : "critical"}` }, icon(g.band === "excellent" ? "checkCircle" : "alert"),
              el("span", {}, el("strong", {}, `${g.range} · ${g.label}. `), g.action))),
          el("div", { class: "callout info" }, icon("info"), el("span", {}, el("strong", {}, "Control charts. "), "A point outside UCL/LCL or a non-random pattern means the process is out of control: investigate and discuss it in the report, even when all results are within specification.")))))),

    el("div", { class: "section-head" }, el("div", {}, el("h2", {}, "Key rules"), el("p", {}, "Quoted from SOPQA0021E Rev. 16"))),
    el("div", { class: "rules" }, KEY_RULES.map((r) => el("div", { class: "rule" }, el("span", { class: "ref" }, r.ref), el("p", {}, r.text)))),

    qualityCard(ctx),
  );
  if (section) setTimeout(() => document.getElementById(section)?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  return view;
}

function qualityCard(ctx) {
  const { d } = ctx;
  const dup = d.products.filter((p) => p.duplicate);
  const mismatch = d.products.filter((p) => p.flags.some((f) => f.kind === "mismatch"));
  const period = d.products.filter((p) => p.flags.some((f) => f.kind === "period"));
  const annualOnly = d.products.filter((p) => p.planNo && !p.scigeniqNo);
  const unplanned = d.products.filter((p) => !p.planNo);
  const ov = ctx.state.meta.exportOverview;
  const link = (p, extra) => el("li", {}, el("a", { href: `#/product/${encodeURIComponent(p.id)}` }, shortProduct(p.name)), extra ? el("span", { class: "muted" }, ` · ${extra}`) : null);
  const block = (tone, title, text, list) => el("div", { class: `callout ${tone}`, style: { flexDirection: "column", gap: "6px" } },
    el("strong", {}, title), el("span", {}, text), list?.length ? el("ul", { style: { color: "var(--ink-2)" } }, list) : null);
  return el("section", { class: "card", id: "quality" }, cardHead("Data-quality checks", "Recalculated from the current data · resolve in Scigeniq, then refresh here"),
    el("div", { class: "card-body", style: { display: "flex", flexDirection: "column", gap: "12px" } },
      dup.length ? block("warning", `${dup.length} products carry more than one APQR workflow`, "The tracker keeps the most recently triggered workflow as primary. Superseded ones usually sit in Batches Selection and inflate the overdue count; cancel them in Scigeniq.",
        dup.map((p) => link(p, p.refs.join(", ")))) : block("good", "No duplicate workflows", "Each product has at most one APQR workflow."),
      mismatch.length ? block("info", `${mismatch.length} review periods differ between the annual plan and the Scigeniq plan`, "The annual plan (QA0021E/TE02/03) is used for report-due dates.",
        mismatch.map((p) => link(p, `plan ${fmtMonth(p.periodStart)}–${fmtMonth(p.periodEnd)} · Scigeniq ${fmtMonth(p.scigeniqStart)}–${fmtMonth(p.scigeniqEnd)}`))) : null,
      period.length ? block("warning", `${period.length} review periods look wrong`, "Reporting period is 12 consecutive months (§10.2.1), extendable by up to 6 for campaign manufacturing.",
        period.map((p) => link(p, p.flags.find((f) => f.kind === "period").text))) : null,
      annualOnly.length ? block("info", `${annualOnly.length} annual-plan products are not in the Scigeniq plan ${ctx.state.meta.scigeniqPlan}`,
        "Most are planned for January–February 2026, before the Scigeniq module went live. Confirm whether their APQRs were issued in QMex and record the closure on each product.") : null,
      unplanned.length ? block("info", `${unplanned.length} product${unplanned.length > 1 ? "s have" : " has"} Scigeniq tasks but no place in the annual plan`, "Add them to the plan or confirm they belong to another site.",
        unplanned.map((p) => link(p, p.site))) : null,
      ov ? block("info", "Export totals do not reconcile", `The export's "Over All" sheet reports ${ov.open} open, ${ov.completed} completed and ${ov.overdue} overdue tasks; the "Data" sheet holds ${d.tasks.length} task rows. This app counts only the task rows. Reconcile before quoting figures in a management review.`) : null));
}
