import { test } from "node:test";
import assert from "node:assert/strict";
import {
  rpn, classify, mandatoryFields, addBusinessDays, businessDaysBetween, deadlines, complianceCheck, trend,
  SCOPES, IMPACT_QUESTIONS, SIX_M, ROOT_CAUSES,
} from "../qe/js/sop.js";
import { dataRequirements, referencesFor, REFERENCES, DATA_ITEMS } from "../qe/js/knowledge.js";
import { buildRequest, parseResponse, systemPrompt, ANALYSIS_SCHEMA, INVESTIGATION_SCHEMA, ClaudeError } from "../qe/js/claude.js";
import { offlineAnalysis, offlineInvestigation } from "../qe/js/drafts.js";
import { newRecord, applyAnalysis, applyInvestigation, summary, reportSections, exportText, buildDataItems } from "../qe/js/record.js";

const input = {
  title: "Compression failure batch 261401", description: "Poor flow, hardness OOS", occurrenceDate: "2026-09-08",
  detectionDate: "2026-09-08", reportedDate: "2026-09-08", department: "Manufacturing", area: "FFO-09",
  equipment: "EQ0940-Onc", product: "Porenza 200 mg", batch: "261401", rawMaterial: "Pazopanib lot X",
  immediateActions: "Compression stopped, batch in quarantine", scopes: ["ipc", "mfg"], language: "en",
};

test("RPN classes follow QA0015E/Onc/AE07/02", () => {
  assert.equal(rpn(2, 3, 2), 12);
  assert.equal(rpn(0, 3, 2), null);
  assert.equal(classify(1).code, "IN");
  assert.equal(classify(5).code, "IN");
  assert.equal(classify(6).code, "MI");
  assert.equal(classify(12).code, "MI");
  assert.equal(classify(13).code, "MA");
  assert.equal(classify(32).code, "MA");
  assert.equal(classify(33).code, "CR");
  assert.equal(classify(125).code, "CR");
  assert.equal(classify(null), null);
  // Examples from the site reports: QE-KO-4 (1×3×1 = 3, incident), QE-KO-26 (3×2×2 = 12, minor), QE-KO-17 (4×3×2 = 24, major).
  assert.equal(classify(rpn(1, 3, 1)).name, "Incident");
  assert.equal(classify(rpn(3, 2, 2)).name, "Minor deviation");
  assert.equal(classify(rpn(4, 3, 2)).name, "Major deviation");
});

test("mandatory selections follow the AE05 matrix", () => {
  assert.equal(SCOPES.length, 17);
  assert.deepEqual(mandatoryFields(["doc"]), []);
  assert.deepEqual(mandatoryFields(["human"]).map(([k]) => k), ["area", "batch"]);
  assert.deepEqual(mandatoryFields(["csv"]).map(([k]) => k), ["computerizedSystem", "batch"]);
  assert.equal(mandatoryFields(["oos"]).length, 9);
  assert.deepEqual(mandatoryFields(["supplier", "packmat"]).map(([k]) => k), ["packingMaterial", "supplier", "batch"]);
});

test("working days skip the Friday–Saturday weekend", () => {
  // 2026-09-10 is a Thursday: the next working day is Sunday 13th.
  assert.equal(addBusinessDays("2026-09-10", 1), "2026-09-13");
  assert.equal(addBusinessDays("2026-09-13", 5), "2026-09-20");
  assert.equal(businessDaysBetween("2026-09-10", "2026-09-13"), 1);
  assert.equal(businessDaysBetween("2026-09-13", "2026-09-13"), 0);
  assert.equal(addBusinessDays("bad", 1), null);
  const d = deadlines({ detectionDate: "2026-09-08", eventClass: "CR" });
  assert.equal(d.logBy, "2026-09-09");
  assert.equal(d.investigationDue, addBusinessDays("2026-09-08", 30));
  assert.ok(d.quhNotification);
});

test("data requirements filter the library by scope and cover all six factors", () => {
  const generic = dataRequirements([]);
  const oos = dataRequirements(["oos"]);
  assert.deepEqual(Object.keys(generic), SIX_M);
  for (const m of SIX_M) assert.ok(oos[m].length >= generic[m].length, m);
  const total = (g) => Object.values(g).flat().length;
  assert.ok(total(oos) > total(generic));
  assert.ok(total(dataRequirements(SCOPES.map((s) => s.id))) === DATA_ITEMS.length);
  assert.ok(referencesFor(["oos"]).some((r) => r.id === "FDA-OOS"));
  assert.ok(!referencesFor(["doc"]).some((r) => r.id === "FDA-OOS"));
});

test("offline analysis fills the SOP structure and flags missing facts", () => {
  const a = offlineAnalysis({ ...input, equipment: "" });
  assert.equal(a.qe_form.batches, "261401");
  assert.match(a.qe_form.equipment, /TO COMPLETE/);
  assert.match(a.containment[0], /261401/);
  assert.ok(a.investigation_planning.investigations.length > 0);
  const fr = offlineAnalysis({ ...input, language: "fr", equipment: "" });
  assert.match(fr.qe_form.equipment, /À COMPLÉTER/);
});

test("request uses structured output, adaptive thinking and a stable system prompt", () => {
  const rec = newRecord(input);
  const req = buildRequest("analysis", rec, { model: "claude-opus-5-5", effort: "xhigh" }, "2026-10-24");
  assert.equal(req.model, "claude-opus-5-5");
  assert.equal(req.output_config.effort, "xhigh");
  assert.equal(req.output_config.format.type, "json_schema");
  assert.equal(req.output_config.format.schema, ANALYSIS_SCHEMA);
  assert.deepEqual(req.thinking, { type: "adaptive" });
  assert.equal(req.fallbacks, "default");
  assert.deepEqual(req.betas, ["server-side-fallback-2026-07-01"]);
  assert.equal(req.system[0].text, systemPrompt());
  assert.match(req.messages[0].content, /Compression failure batch 261401/);
  assert.equal(buildRequest("analysis", rec, { model: "gpt-4" }).model, "claude-opus-5-5");
  assert.equal(buildRequest("investigation", rec, {}).output_config.format.schema, INVESTIGATION_SCHEMA);
});

test("schemas meet structured-output rules: every object closed and fully required", () => {
  const walk = (node, path) => {
    if (node.type === "object") {
      assert.equal(node.additionalProperties, false, path);
      assert.deepEqual(node.required, Object.keys(node.properties), path);
      for (const [k, v] of Object.entries(node.properties)) walk(v, `${path}.${k}`);
    }
    if (node.type === "array") walk(node.items, `${path}[]`);
    for (const banned of ["minimum", "maximum", "minLength", "maxLength", "minItems", "maxItems"]) assert.ok(!(banned in node), `${path} ${banned}`);
  };
  walk(ANALYSIS_SCHEMA, "analysis");
  walk(INVESTIGATION_SCHEMA, "investigation");
  const refEnum = ANALYSIS_SCHEMA.properties.regulatory_focus.items.properties.reference_id.enum;
  assert.deepEqual(refEnum, REFERENCES.map((r) => r.id));
  assert.deepEqual(INVESTIGATION_SCHEMA.properties.investigation_form.properties.root_cause_category.enum, ROOT_CAUSES);
});

test("parseResponse returns JSON and explains refusals and truncation", () => {
  const ok = { stop_reason: "end_turn", content: [{ type: "thinking", thinking: "" }, { type: "text", text: '{"a":1}' }] };
  assert.deepEqual(parseResponse(ok), { a: 1 });
  assert.throws(() => parseResponse({ stop_reason: "refusal", content: [] }), ClaudeError);
  assert.throws(() => parseResponse({ stop_reason: "max_tokens", content: [{ type: "text", text: "{" }] }), /cut off/);
  assert.throws(() => parseResponse({ stop_reason: "end_turn", content: [{ type: "text", text: "nope" }] }), /not valid JSON/);
});

test("analysis builds the data checklist and keeps findings across re-drafts", () => {
  let rec = applyAnalysis(newRecord(input), offlineAnalysis(input));
  const keys = Object.keys(rec.dataItems);
  assert.ok(keys.length > 20);
  const key = keys[0];
  rec.dataItems[key].status = "anomaly";
  rec.dataItems[key].note = "found";
  const ai = { ...offlineAnalysis(input), data_requirements: [{ factor: "Method", item: "Compare BMR external phase formula", source: "BMR", purpose: "yield", priority: "Critical" }] };
  rec = applyAnalysis(rec, ai);
  assert.equal(rec.dataItems[key].status, "anomaly");
  assert.equal(rec.dataItems[key].note, "found");
  assert.ok(Object.values(rec.dataItems).some((d) => d.origin === "event" && d.factor === "Method"));
  // A finding on an item that disappears is kept.
  const kept = buildDataItems([], [], { x: { factor: "Man", item: "custom", status: "ok", note: "n" } });
  assert.equal(kept.x.note, "n");
});

test("offline investigation derives 6M, root cause and consistent impact questions", () => {
  let rec = applyAnalysis(newRecord(input), offlineAnalysis(input));
  const method = Object.entries(rec.dataItems).find(([, d]) => d.factor === "Method");
  rec.dataItems[method[0]].status = "anomaly";
  rec.dataItems[method[0]].note = "BMR has no external-phase recalculation above 100 % yield";
  const env = Object.entries(rec.dataItems).find(([, d]) => d.factor === "Environment");
  rec.dataItems[env[0]].status = "ok";
  rec = applyInvestigation(rec, offlineInvestigation(rec));
  const inv = rec.investigation;
  assert.equal(inv.six_m.length, 6);
  assert.equal(inv.six_m.find((m) => m.factor === "Method").contributing, true);
  assert.equal(inv.six_m.find((m) => m.factor === "Environment").contributing, false);
  assert.equal(inv.investigation_form.root_cause_category, "Procedure or instruction-related");
  assert.equal(inv.impact_questions.length, IMPACT_QUESTIONS.length);
  assert.equal(inv.impact_questions[12].answer, "Yes");
  assert.equal(inv.impact_questions[8].answer, "No");
  const checks = complianceCheck(rec);
  assert.ok(!checks.some((c) => c.rule.startsWith("iaq-")), "6M and impact questions agree");
});

test("compliance check catches SOP and regulatory gaps", () => {
  const rec = applyAnalysis(newRecord({ ...input, detectionDate: "2026-09-01", occurrenceDate: "2026-09-08", reportedDate: "2026-09-08", immediateActions: "Informed QA" }), offlineAnalysis(input));
  rec.analysis.qe_form.immediate_actions = "Informed QA";
  rec.analysis.containment = [];
  rec.analysis.initial_risk = { ...rec.analysis.initial_risk, severity: 4, occurrence: 3, detectability: 3 };
  rec.analysis.investigation_planning.investigation_required = false;
  const rules = complianceCheck(rec, new Date("2026-09-10")).map((c) => c.rule);
  assert.ok(rules.includes("date-order"));
  assert.ok(rules.includes("late-logging"));
  assert.ok(rules.includes("quarantine"));
  assert.ok(rules.includes("investigation-mandatory"));

  const he = applyInvestigation(rec, { ...offlineInvestigation(rec), human_error_justification: "N/A", investigation_form: { ...offlineInvestigation(rec).investigation_form, root_cause_category: "Human error" } });
  he.investigation.six_m[1].contributing = true; // Man
  he.investigation.impact_questions[10].answer = "No";
  const r2 = complianceCheck(he).map((c) => c.rule);
  assert.ok(r2.includes("human-error-justification"));
  assert.ok(r2.includes("iaq-Man"));
  const nd = applyInvestigation(rec, { ...offlineInvestigation(rec), investigation_form: { ...offlineInvestigation(rec).investigation_form, root_cause_category: "Not determined" } });
  assert.ok(complianceCheck(nd).some((c) => c.rule === "not-determined"));
});

test("report sections follow the Scigeniq stages and export to text", () => {
  let rec = applyAnalysis(newRecord(input), offlineAnalysis(input));
  assert.deepEqual(reportSections(rec).map((s) => s.id), ["open", "review", "planning"]);
  rec = applyInvestigation(rec, offlineInvestigation(rec));
  assert.deepEqual(reportSections(rec).map((s) => s.id), ["open", "review", "planning", "investigation", "rca", "qam"]);
  const text = exportText(rec);
  assert.match(text, /=== Open · Quality Event Form ===/);
  assert.match(text, /6M – Method/);
  assert.match(text, /Investigation data plan/);
  const s = summary(rec);
  assert.equal(s.stage, "RCA and CAPA Planning");
  assert.ok(s.initialClass);
});

test("trend counts events per semester", () => {
  const a = applyAnalysis(newRecord(input), offlineAnalysis(input));
  const b = applyAnalysis(newRecord({ ...input, detectionDate: "2026-02-01" }), offlineAnalysis(input));
  const { periods, table } = trend([a, b]);
  assert.deepEqual(periods, ["H1/2026", "H2/2026"]);
  assert.equal(table.status["Not closed"]["H1/2026"], 1);
  assert.equal(table.scope["In-process testing failure"]["H2/2026"], 1);
});
