// Tests of SOP résumés and forms: the forms, templates and attachments an SOP lists and attaches, the résumé the app
// extracts (purpose, who does what, key steps, critical points), bilingual SOPs, Claude's answer reduced to the app's
// shape, and the forms register across SOPs — on synthetic codes and text (no confidential data).
import { test } from "node:test";
import assert from "node:assert/strict";
import SCHEMA from "../oncology/js/schema.js";
import { EXT_COLS } from "../oncology/js/schema-ext.js";
import { buildModel, toDay } from "../oncology/js/model.js";
import { buildDomains } from "../oncology/js/domain.js";
import { parseSopText, sopForms, sopDigest, unfoldText, formKey, formKind } from "../oncology/js/sopkit.js";
import { indexFields } from "../oncology/js/sop-drive.js";
import { cleanSummary, summaryPrompt } from "../oncology/js/sop-ai.js";

const SOP = [
  "Objectif", "", "Cette procédure est pour but de", "", "Gérer la réception des matières de démonstration.", "",
  "Domaine d’Application", "", "Cette procédure s’applique au magasin de démonstration.", "",
  "Responsabilités", "", "Il est de la responsabilité du chef de magasin et/ou ses délégués de veiller à l’application de cette procédure.", "",
  "Il est de la responsabilité du service des achats d’envoyer les documents nécessaires.", "",
  "Documents Associés", "", "|  |  |", "| :-: | :-: |", "| Document No. | Titre |",
  "| XY0002F/Onc/FF01/02 | Avis de démonstration |", "| XY0002F/Onc/FF02/01 | Logbook de démonstration |", "| XY0009/Onc/F03/01 | Fiche d’une autre procédure |", "| SOPXY0017E | Autre procédure |", "",
  "Procédure", "", "Précautions", "", "Ne pas transférer les palettes en bois dans le magasin.", "",
  "Réception", "", "Vérifier les documents avec la fiche réf. XY0002F/Onc/FF01/03 : Avis de démonstration.", "",
  "Renseigner le logbook XY0002F/Onc/FF02/01 dans un délai maximal de 2 jours.", "", "Le magasinier doit:", "", "Décharger les marchandises au quai.", "",
  "Historique", "", "|  |  |  |", "| :-: | :-: | :-: |", "| Ver. No. | Effective Date | Revision Summary |", "| 01 | 28/03/2024 | Première émission |", "",
  "|  |  |", "| :-: | :-: |", "| Fiche Nr | Avis de démonstration |", "| XY0002F/Onc/FF01/03 |  |", "",
  "|  |  |  |  |", "| :-: | :-: | :-: | :-: |", "| Informations générales :  |  |  |  |", "| Date de réception : | ……/……./…… | Heure : | …… |", "",
  "|  |  |", "| :-: | :-: |", "| Fiche Nr | Logbook de démonstration |", "| XY0002F/Onc/FF02/01 |  |", "",
  "|  |  |  |", "| :-: | :-: | :-: |", "| No. Rec. | Date | Code Article |",
].join("\n");

test("forms, templates and attachments: listed, attached, what they record, revisions", () => {
  const F = sopForms(SOP);
  const by = (k) => F.find((f) => f.key === k);
  assert.deepEqual(F.map((f) => f.key), ["XY2/FF01", "XY2/FF02", "XY9/F03"]);
  const ff01 = by("XY2/FF01"), ff02 = by("XY2/FF02");
  assert.deepEqual([ff01.title, ff01.kind, ff01.citedRev, ff01.attachedRev, ff01.attached, ff01.cited], ["Avis de démonstration", "form", "02", "03", true, true]);
  assert.deepEqual([ff01.sections, ff01.fields], [["Informations générales"], ["Date de réception", "Heure"]]);
  assert.deepEqual([ff02.kind, ff02.columns, ff02.attached], ["logbook", ["No. Rec.", "Date", "Code Article"], true]);
  assert.deepEqual([by("XY9/F03").attached, by("XY9/F03").cited], [false, true]);
  assert.equal(formKey("XY0002F/FF01/Onc/02"), "XY2/FF01"); // as some SOPs type it
  assert.deepEqual([formKind("A01"), formKind("TE01"), formKind("F02", "Check-list de ligne")], ["attachment", "template", "checklist"]);
});

test("the résumé the app extracts: purpose, who does what, key steps by stage, critical points", () => {
  const d = sopDigest(parseSopText(SOP));
  assert.equal(d.purpose, "Cette procédure est pour but de Gérer la réception des matières de démonstration.");
  assert.deepEqual(d.roles, [{ role: "chef de magasin et/ou ses délégués", duties: "veiller à l’application de cette procédure." }, { role: "service des achats", duties: "envoyer les documents nécessaires." }]);
  assert.deepEqual(d.steps.map((s) => [s.phase, s.do.slice(0, 22), s.records]), [
    ["Précautions", "Ne pas transférer les ", []],
    ["Réception", "Vérifier les documents", ["XY0002F/Onc/FF01"]],
    ["Réception", "Renseigner le logbook ", ["XY0002F/Onc/FF02"]],
    ["Le magasinier doit", "Décharger les marchand", []],
  ]);
  assert.deepEqual(d.critical, []); // the prohibition and the time limit are already steps
  // stored on the SOP with its history; a résumé Claude wrote for the same file is kept
  const s = { Code: "SOPXY0002F/Onc", Revision: "03", Language: "French", "Drive modified": "2026-10-01" };
  const f1 = indexFields(s, parseSopText(SOP), "2026-10-23", SOP);
  const sum = JSON.parse(f1.Summary);
  assert.deepEqual([sum.by, sum.lang, sum.src, sum.history[0].ver], ["app", "FR", "2026-10-01", "01"]);
  assert.equal(JSON.parse(f1.Forms).length, 3);
  const kept = indexFields({ ...s, Summary: JSON.stringify({ by: "claude", src: "2026-10-01", purpose: "Kept" }) }, parseSopText(SOP), "2026-10-23", SOP);
  assert.equal(JSON.parse(kept.Summary).purpose, "Kept");
  const redone = indexFields({ ...s, "Drive modified": "2026-10-20", Summary: JSON.stringify({ by: "claude", src: "2026-10-01", purpose: "Old" }) }, parseSopText(SOP), "2026-10-23", SOP);
  assert.equal(JSON.parse(redone.Summary).by, "app"); // the file changed since Claude wrote it
});

test("a bilingual SOP: the English column, its headings and sentences split again", () => {
  const big = `| IntroductionThis procedure applies to the demo site.PurposeThe purpose of this procedure is to define the demo review.ScopeThis procedure applies to the demo site only.ResponsibilitiesDemo Manager:The Demo Manager is responsible for the demo review.ProcedureMeeting Frequency:The demo meeting is performed at least twice a year.Record the minutes in template XY0001/Onc/T01/01.${" filler".repeat(60)} | Le texte français |`;
  const text = unfoldText(big);
  assert.ok(text.includes("\nPurpose\n") && text.includes("\nProcedure\n"));
  const d = sopDigest(parseSopText(big));
  assert.equal(d.scope, "This procedure applies to the demo site only.");
  assert.equal(d.steps[0].phase, "Meeting Frequency");
  assert.ok(d.critical.some((c) => /at least twice a year/.test(c)));
});

test("Claude's answer is reduced to the app's shape; the prompt carries the language and the text", () => {
  const c = cleanSummary({ purpose: "  Do   the demo. ", roles: [{ role: "QA", duties: "Approves." }, { role: "", duties: "x" }, "bad"], steps: [{ phase: "", do: "Check it", records: ["XY0001/Onc/T01", 3] }, { do: "" }],
    critical: ["Never skip.", 5], forms: [{ code: "XY0001/Onc/T01", title: "Demo", use: "Each meeting" }], extra: "ignored" });
  assert.deepEqual(c.roles, [{ role: "QA", duties: "Approves." }]);
  assert.deepEqual(c.steps, [{ phase: null, do: "Check it", who: null, records: ["XY0001/Onc/T01"] }]);
  assert.deepEqual([c.purpose, c.critical, c.scope, c.forms.length], ["Do the demo.", ["Never skip."], null, 1]);
  assert.deepEqual(cleanSummary(null).steps, []);
  const p = summaryPrompt({ Code: "SOPXY0001/Onc", Revision: "02", Title: "Demo" }, "Procedure\n\nDo it.", "FR");
  assert.ok(p.includes("in French") && p.includes("SOP SOPXY0001/Onc rev 02 — Demo") && p.endsWith("Procedure\n\nDo it."));
});

test("the forms register: owner SOP, other SOPs using a form, revisions, the steps that fill it, the workbook register", () => {
  const COLS = { ...SCHEMA.cols, ...EXT_COLS };
  const table = (key, objs) => ({ cols: COLS[key], rows: objs.map((o) => COLS[key].map((c) => o[c] ?? null)) });
  const empty = Object.fromEntries(Object.keys(COLS).map((k) => [k, table(k, [])]));
  const own = sopForms(SOP);
  const summary = { by: "app", steps: [{ phase: "Réception", do: "Vérifier les documents", records: ["XY0002F/Onc/FF01"] }, { phase: null, do: "Ranger", records: [] }] };
  const wb = {
    ...empty, meta: { asof: "2026-10-20", settings: {} }, tr: SCHEMA.tr, mapGrid: [],
    sop: table("sop", [
      { Code: "SOPXY0002F/Onc", Title: "Demo reception", Forms: JSON.stringify(own), Summary: JSON.stringify(summary), "Drive ID": "a" },
      { Code: "SOPXY0009/Onc", Title: "Other demo", Forms: JSON.stringify([{ key: "XY2/FF01", code: "XY0002F/Onc/FF01", title: "Avis", citedRev: "01", attached: false }]) },
    ]),
    forms: table("forms", [{ "Form code": "XY0002F/Onc/FF01/02", Title: "Avis (register)", Type: "Checklist", "Linked room": "R-01" }, { "Form code": "XY0050/Onc/TE01/01", Title: "Register-only template", Type: "Template" }]),
  };
  const m = buildDomains(buildModel(wb, { today: toDay("2026-10-21") }), wb, null);
  const X = m.x.sopx;
  const ff01 = X.formsByKey.get("XY2/FF01");
  assert.deepEqual([ff01.owner.Code, ff01.usedBy.map((s) => s.Code), ff01.citedRev, ff01.attachedRev, ff01.mismatch, ff01.kind, ff01.register["Linked room"]],
    ["SOPXY0002F/Onc", ["SOPXY0009/Onc"], "02", "03", true, "checklist", "R-01"]);
  assert.deepEqual(ff01.steps.map((s) => s.n), [1]);
  assert.equal(X.formsByKey.get("XY9/F03").owner.Code, "SOPXY0009/Onc");
  const reg = X.formsByKey.get("XY50/TE01");
  assert.deepEqual([reg.owner, reg.kind, reg.title], [null, "template", "Register-only template"]);
  assert.equal(X.list.find((s) => s.Code === "SOPXY0002F/Onc").summary.steps.length, 2);
});
