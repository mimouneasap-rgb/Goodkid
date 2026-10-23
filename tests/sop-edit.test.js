import { test } from "node:test";
import assert from "node:assert/strict";
import {
  indexLibrary, applyEdits, diffSop, validateSop, parseSopCode, parseAttachmentCode, attachmentType,
  sopRefsFrom, parseGlossary, glossaryToText, parseHistory, historyToText, exportableSop, changesToCsv,
} from "../sop/js/model.js";

const base = () => ({
  schema: "sop-library/1",
  sops: [
    { id: "a", code: "SOPQA0001E", dept: "QA", num: "0001", lang: "E", site: "Onc", version: "02", title: "Document Control",
      status: "current", sopRefs: [], history: [{ ver: "01", date: "2024-01-01", summary: "First issue" }],
      attachments: [{ code: "QA0001E/Onc/FE01/02", base: "QA0001E", kind: "FE", num: 1, title: "Change request", type: "form", fields: ["Date"], own: true }] },
    { id: "b", code: "SOPQC0002E", dept: "QC", num: "0002", lang: "E", site: "Onc", version: "01", title: "Sampling", status: "current", sopRefs: [], attachments: [] },
  ],
});

test("parseSopCode and parseAttachmentCode read the site's code formats", () => {
  assert.deepEqual(parseSopCode("sopqa0016e"), { code: "SOPQA0016E", dept: "QA", num: "0016", lang: "E" });
  assert.deepEqual(parseSopCode("SOPHSE0004"), { code: "SOPHSE0004", dept: "HSE", num: "0004", lang: null });
  assert.equal(parseSopCode("QA0016"), null);
  assert.deepEqual(parseAttachmentCode("QA0016/Onc/AF01/02"), { code: "QA0016/Onc/AF01/02", base: "QA0016", site: "Onc", kind: "AF", num: 1, version: "02" });
  assert.equal(parseAttachmentCode("VL0010E/FF03/05").kind, "FF");
  assert.equal(parseAttachmentCode("qa0016/onc/fe1").code, "QA0016/Onc/FE01");
  assert.equal(parseAttachmentCode("not a code"), null);
  assert.equal(attachmentType("FE", "Balance log book"), "logbook");
  assert.equal(attachmentType("TF", "Page de garde"), "template");
  assert.equal(attachmentType("AE", ""), "annex");
});

test("text helpers round-trip glossary, history and SOP references", () => {
  const g = [{ term: "QA", def: "Quality Assurance" }, { term: "SOP", def: "" }];
  assert.deepEqual(parseGlossary(glossaryToText(g)), g);
  const h = [{ ver: "01", date: "2024-01-01", summary: "First issue" }, { ver: "02", date: null, summary: "Review | new form" }];
  assert.deepEqual(parseHistory(historyToText(h)), h);
  assert.deepEqual(parseHistory("3 | 2026-10-23 | Periodic review"), [{ ver: "03", date: "2026-10-23", summary: "Periodic review" }]);
  assert.deepEqual(sopRefsFrom("SOPQA0001E — Doc control\nsee SOP QC 0002 and SOPQA0001F"), ["SOPQA0001", "SOPQC0002"]);
});

test("validateSop reports bad codes, dates and duplicate attachment numbers", () => {
  const ok = base().sops[0];
  assert.deepEqual(validateSop(ok), []);
  const bad = { ...ok, code: "QA1", title: " ", effectiveDate: "23/10/2026",
    attachments: [...ok.attachments, { ...ok.attachments[0], code: "QA0001E/Onc/FE01/03" }, { code: "oops", own: true }] };
  const errs = validateSop(bad).join("\n");
  assert.match(errs, /Code must look like/);
  assert.match(errs, /title/);
  assert.match(errs, /effectiveDate/);
  assert.match(errs, /share the number/);
  assert.match(errs, /"oops"/);
});

test("diffSop keeps only changed editable fields and treats empty values alike", () => {
  const s = base().sops[0];
  assert.deepEqual(diffSop(s, { ...s }), {});
  assert.deepEqual(diffSop(s, { ...s, title: "Document Control System", purpose: "", tools: [] }), { title: "Document Control System" });
  assert.deepEqual(diffSop(s, { ...s, text: "ignored, not editable" }), {});
  assert.equal(Object.keys(diffSop(null, s)).includes("title"), true);
});

test("applyEdits edits, removes and adds SOPs, and the index sees the result", () => {
  const raw = base();
  const edits = [
    { sopId: "a", patch: { title: "Document Control System", sopRefs: ["SOPQC0002"] }, updatedBy: "MB", updatedAt: "2026-10-23T08:00:00Z" },
    { sopId: "b", patch: {}, deleted: true },
    { sopId: "new-1", created: true, patch: { code: "SOPVL0099E", dept: "VL", num: "0099", lang: "E", title: "Cleaning validation", version: "01",
      attachments: [{ code: "VL0099E/FE01/01", base: "VL0099E", kind: "FE", num: 1, title: "Swab log", type: "logbook", fields: ["Date", "Result"], own: true }] } },
  ];
  const out = applyEdits(raw, edits);
  assert.equal(raw.sops[0].title, "Document Control");   // input untouched
  assert.deepEqual(out.sops.map((s) => s.id), ["a", "new-1"]);
  const lib = indexLibrary(out, new Date("2026-10-23"));
  const a = lib.byId.get("a");
  assert.equal(a.title, "Document Control System");
  assert.equal(a._edited, true);
  assert.equal(a._editedBy, "MB");
  assert.deepEqual(a.missing, ["SOPQC0002"]);   // b was removed
  const added = lib.byId.get("new-1");
  assert.equal(added._created, true);
  assert.equal(added.family, "VL0099");
  assert.ok(lib.attById.has("new-1~VL0099/F01"));
  assert.equal(applyEdits(raw, []), raw);
});

test("applyEdits ignores fields the editor may not change", () => {
  const out = applyEdits(base(), [{ sopId: "a", patch: { id: "hijack", text: "x", title: "T" } }]);
  assert.equal(out.sops[0].id, "a");
  assert.equal(out.sops[0].text, undefined);
  assert.equal(out.sops[0].title, "T");
});

test("exported SOPs drop index and edit markers; the change log exports as CSV", () => {
  const lib = indexLibrary(applyEdits(base(), [{ sopId: "a", patch: { title: "X" } }]));
  const e = exportableSop(lib.byId.get("a"));
  assert.equal(e.title, "X");
  for (const k of ["_edited", "_search", "_text", "links", "backlinks", "reviewState"]) assert.equal(k in e, false, k);
  const csv = changesToCsv([{ at: "2026-10-23T08:00:00Z", by: "MB", code: "SOPQA0001E", action: "edited", fields: ["title", "reviewDate"], reason: "Review, minor" }]).split("\r\n");
  assert.equal(csv[0], "When,By,SOP,Action,Fields,Reason");
  assert.equal(csv[1], '2026-10-23T08:00:00Z,MB,SOPQA0001E,edited,Title | Review date,"Review, minor"');
});
