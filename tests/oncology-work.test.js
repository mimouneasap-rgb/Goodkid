// Tests of the work done in the app on SOPs: the audit trail's field-by-field changes, résumés edited by people (and
// kept when the file is read again), form definitions corrected, added and removed in the forms register, SOP review
// requests and what closing them does to the review date, and the cockpit of everything due — on synthetic codes only.
import { test } from "node:test";
import assert from "node:assert/strict";
import SCHEMA from "../oncology/js/schema.js";
import { EXT_COLS } from "../oncology/js/schema-ext.js";
import { buildModel, toDay } from "../oncology/js/model.js";
import { buildDomains } from "../oncology/js/domain.js";
import { parseSopText } from "../oncology/js/sopkit.js";
import { indexFields } from "../oncology/js/sop-drive.js";
import { diffRows, auditOf } from "../oncology/js/audit.js";
import { editSummary, editedParts, formRow, formOverride, joinReviews, reviewSuggestions, nextReviewId, reviewPlan, linesOf, codesOf } from "../oncology/js/sopwork.js";
import { dueItems, bucketOf, loadBy } from "../oncology/js/cockpit.js";

const COLS = { ...SCHEMA.cols, ...EXT_COLS };
const table = (key, objs) => ({ cols: COLS[key], rows: objs.map((o) => COLS[key].map((c) => o[c] ?? null)) });
const empty = () => Object.fromEntries(Object.keys(COLS).map((k) => [k, table(k, [])]));
const DAY = 86400000;

test("the audit trail lists each changed field; a résumé by part", () => {
  const cols = ["Code", "Title", "Summary"];
  const before = ["SOPXY0001/Onc", "Old title", JSON.stringify({ by: "app", purpose: "Old purpose", steps: [{ do: "A" }], at: "2026-01-01" })];
  const after = ["SOPXY0001/Onc", "New title", JSON.stringify({ by: "app", purpose: "New purpose", steps: [{ do: "A" }], at: "2026-02-02", edited: true })];
  assert.deepEqual(diffRows(cols, before, after), [["Title", "Old title", "New title"], ["Summary · purpose", "Old purpose", "New purpose"]]);
  // lists item by item, as people read them
  const steps = (xs) => ["X", "T", JSON.stringify({ steps: xs })];
  assert.deepEqual(diffRows(cols, steps([{ phase: "Réception", do: "Check", records: ["XY1"] }, { do: "Store" }]), steps([{ phase: "Réception", do: "Check twice", records: ["XY1"] }, { do: "Store" }, { do: "Sign", who: "QA" }])),
    [["Summary · steps 1", "Réception › Check [XY1]", "Réception › Check twice [XY1]"], ["Summary · steps 3", null, "Sign — QA"]]);
  assert.deepEqual(diffRows(["Forms"], [JSON.stringify([{ code: "XY1" }])], [JSON.stringify([{ code: "XY1" }, { code: "XY2" }])]), [["Forms", null, "XY2"]]);
  assert.deepEqual(diffRows(cols, before, before), []);
  assert.deepEqual(diffRows(["Code", "Note"], null, ["X", "y"]), [["Code", null, "X"], ["Note", null, "y"]]);
  const long = "x".repeat(900);
  assert.equal(diffRows(["Note"], [null], [long])[0][2].length, 400);
  const E = [{ table: "sop", ref: "SOPXY0001/Onc" }, { table: "sop", ref: "SOPXY0002/Onc" }, { table: "forms", ref: "SOPXY0001/Onc" }];
  assert.equal(auditOf(E, "sop", "SOPXY0001/Onc").length, 1);
});

test("a résumé edited by people: parts cleaned, the rest kept, and kept when the SOP is read again", () => {
  const old = { by: "app", purpose: "Extracted purpose", scope: "Site", steps: [{ phase: "A", do: "Do it", records: [] }], critical: ["Never"], history: [{ ver: "01" }], src: "2026-01-01", rev: "02" };
  const e = editSummary(old, { purpose: "  Corrected   purpose ", steps: [{ phase: " Reception ", do: "Check", who: "", records: ["XY0002F/Onc/FF01", "XY0002F/Onc/FF01", ""] }, { do: "  " }],
    roles: [{ role: "QA", duties: "Approves" }, { role: "", duties: "" }], critical: ["", " Keep cold "] }, "u-1", "2026-10-20", "2026-10-01");
  assert.equal(e.purpose, "Corrected purpose");
  assert.equal(e.scope, "Site");
  assert.deepEqual(e.steps, [{ phase: "Reception", do: "Check", who: null, records: ["XY0002F/Onc/FF01"] }]);
  assert.deepEqual(e.roles, [{ role: "QA", duties: "Approves" }]);
  assert.deepEqual(e.critical, ["Keep cold"]);
  assert.deepEqual([e.by, e.edited, e.editedBy, e.editedAt, e.src, e.history, e.rev], ["app", true, "u-1", "2026-10-20", "2026-10-01", [{ ver: "01" }], "02"]);
  assert.equal(editSummary(null, { purpose: "New" }, null, "2026-10-20").by, "people");
  assert.ok(editedParts(e).includes("purpose") && !editedParts(old).length);
  // reading the file again (even a newer one) keeps the edited résumé; its revision history is refreshed
  const text = ["Objectif", "", "Le texte de démonstration.", "", "Historique", "", "| Ver. No. | Effective Date | Revision Summary |", "| :-: | :-: | :-: |", "| 03 | 01/10/2026 | Démo |"].join("\n");
  const s = { Code: "SOPXY0001/Onc", Revision: "03", "Drive modified": "2026-10-22", Summary: JSON.stringify(e) };
  const f = indexFields(s, parseSopText(text), "2026-10-23", text);
  const kept = JSON.parse(f.Summary);
  assert.deepEqual([kept.purpose, kept.edited, kept.src], ["Corrected purpose", true, "2026-10-01"]);
  assert.equal(kept.history.at(-1).ver, "03");
  assert.deepEqual(linesOf("a\n\n b \n—"), ["a", "b"]);
  assert.deepEqual(codesOf("XY1, XY2;XY3"), ["XY1", "XY2", "XY3"]);
});

const FORMS_OF = (code, extra = []) => JSON.stringify([
  { key: "XY2/FF01", code: "XY0002F/Onc/FF01", title: "Avis de démo", kind: "form", citedRev: "02", attachedRev: "03", attached: true, cited: true, sections: ["Général"], fields: ["Date"], columns: [] },
  { key: "XY2/FF02", code: "XY0002F/Onc/FF02", title: "Logbook de démo", kind: "logbook", citedRev: "01", attachedRev: "01", attached: true, cited: true, sections: [], fields: [], columns: ["No", "Date"] },
  ...extra,
]);

test("forms register: corrections win over the SOP file, owner moves, additions appear, removed forms are hidden", () => {
  const wb = {
    ...empty(), meta: { asof: "2026-10-20", settings: {} }, tr: SCHEMA.tr, mapGrid: [],
    sop: table("sop", [{ Code: "SOPXY0002F/Onc", Title: "Demo reception", Forms: FORMS_OF() }, { Code: "SOPXY0009/Onc", Title: "Other demo" }]),
    forms: table("forms", [
      { "Form code": "XY0002F/Onc/FF01", Title: "Avis corrigé", Revision: "03", Sections: "—", Fields: "Date\nHeure\nVisa", Source: "App" },
      { "Form code": "XY0002F/Onc/FF02", Status: "Removed", Source: "App" },
      { "Form code": "XY0002F/Onc/FF07", Title: "Fiche ajoutée", Type: "Checklist", Source: "App" },
      { "Form code": "XY0009/Onc/F01", Title: "Moved form", "Owner SOP": "SOPXY0002F/Onc", Source: "App" },
    ]),
  };
  const m = buildDomains(buildModel(wb, { today: toDay("2026-10-21") }), wb, null);
  const X = m.x.sopx;
  const ff01 = X.formsByKey.get("XY2/FF01");
  assert.deepEqual([ff01.title, ff01.sections, ff01.fields, ff01.rev, ff01.mismatch], ["Avis corrigé", [], ["Date", "Heure", "Visa"], "03", false]);
  assert.deepEqual([ff01.read.title, ff01.read.sections, ff01.read.rev], ["Avis de démo", ["Général"], "03"]);
  assert.equal(X.formsByKey.get("XY2/FF02").removed, true);
  assert.ok(!X.forms.some((f) => f.key === "XY2/FF02") && X.removedForms.some((f) => f.key === "XY2/FF02"));
  const added = X.formsByKey.get("XY2/FF07");
  assert.deepEqual([added.inApp, added.kind, added.owner.Code], [true, "checklist", "SOPXY0002F/Onc"]);
  const moved = X.formsByKey.get("XY9/F01");
  assert.deepEqual([moved.owner.Code, moved.homeOwner.Code], ["SOPXY0002F/Onc", "SOPXY0009/Onc"]);
  const own = X.list.find((s) => s.Code === "SOPXY0002F/Onc").formList.map((f) => f.key);
  assert.deepEqual(own, ["XY2/FF01", "XY2/FF07", "XY9/F01"]);
  assert.deepEqual(X.list.find((s) => s.Code === "SOPXY0009/Onc").formList, []);
  // what the editor stores: only lines that were given; "—" when a list found in the file is cleared
  const row = formRow({ code: "XY0002F/Onc/FF01", title: "T", kind: "logbook", sections: [], fields: ["A", "B"], had: { sections: true } });
  assert.deepEqual([row.Type, row.Sections, row.Fields, row.Columns, row.Source], ["Logbook", "—", "A\nB", null, "App"]);
  assert.deepEqual(formOverride({ Sections: "—", Status: "removed" }).sections, []);
  assert.equal(formOverride({ Status: "removed" }).removed, true);
});

test("SOP reviews: open and late requests, closing restarts the review period, withdrawal retires the SOP", () => {
  const sopRows = [
    { Code: "SOPXY0001/Onc", Title: "Due demo", Revision: "02", "Effective date": "2023-01-10", "Drive ID": "a" },
    { Code: "SOPXY0002/Onc", Title: "Reviewed demo", Revision: "01", "Effective date": "2023-02-01" },
    { Code: "SOPXY0003/Onc", Title: "Withdrawn demo", Revision: "04", "Effective date": "2023-03-01" },
    { Code: "SOPXY0004/Onc", Title: "Revised demo", Revision: "01", "Effective date": "2025-06-01" },
  ];
  const reviews = [
    { "Review ID": "SR-2026-001", SOP: "SOPXY0001/Onc", Type: "Periodic review", Status: "In progress", "Requested on": "2026-09-01", Due: "2026-10-01" },
    { "Review ID": "SR-2026-002", SOP: "SOPXY0002/Onc", Type: "Periodic review", Status: "Closed", Outcome: "No change", "Closed on": "2026-10-15" },
    { "Review ID": "SR-2026-003", SOP: "SOPXY0003/Onc", Type: "Withdrawal", Status: "Closed", Outcome: "Withdrawn", "Closed on": "2026-10-10" },
    { "Review ID": "SR-2026-004", SOP: "SOPXY0004/Onc", Type: "Revision", Status: "Closed", Outcome: "Revised", "New revision": "02", "Effective on": "2026-10-05", "Closed on": "2026-10-01" },
  ];
  const wb = { ...empty(), meta: { asof: "2026-10-20", settings: {} }, tr: SCHEMA.tr, mapGrid: [], sop: table("sop", sopRows), sopReviews: table("sopReviews", reviews) };
  const m = buildDomains(buildModel(wb, { today: toDay("2026-10-21") }), wb, null);
  const X = m.x.sopx;
  const by = (c) => X.list.find((s) => s.Code === c);
  // effective date + 3 years has passed: overdue, with a late request
  assert.equal(by("SOPXY0001/Onc").reviewStatus, "Overdue");
  const r1 = by("SOPXY0001/Onc").openReview;
  assert.deepEqual([r1["Review ID"], r1.open, r1.overdue, r1.daysLate], ["SR-2026-001", true, true, 20]);
  // closed "No change": the next review is 3 years after the closing date
  const s2 = by("SOPXY0002/Onc");
  assert.deepEqual([s2.reviewStatus, s2.nextFromReview, new Date(s2.next).toISOString().slice(0, 10), s2.reviewedBy], ["In date", true, "2029-10-15", "SR-2026-002"]);
  assert.equal(by("SOPXY0003/Onc").reviewStatus, "Obsolete");
  // revised in the app, the Drive file not yet updated
  const s4 = by("SOPXY0004/Onc");
  assert.deepEqual([s4.pendingRevision, new Date(s4.next).toISOString().slice(0, 10)], ["02", "2029-10-05"]);
  assert.equal(X.reviews.length, 4);
  // suggestions skip SOPs with an open request and obsolete ones
  const sugg = reviewSuggestions(X.list.map((s) => (s.Code === "SOPXY0002/Onc" ? { ...s, daysToReview: 30 } : s)));
  assert.deepEqual(sugg.map((x) => [x.sop.Code, x.why[0][0]]), [["SOPXY0002/Onc", "due"]]);
  assert.equal(nextReviewId(reviews, 2026), "SR-2026-005");
  assert.equal(nextReviewId([], 2027), "SR-2027-001");
  const plan = reviewPlan(X.list, toDay("2026-10-21"), 12);
  assert.deepEqual([plan.length, plan[0].month, plan[0].sops.map((s) => s.Code)], [12, "2026-10", ["SOPXY0001/Onc"]]);
  // a review row joined to a code missing from the library keeps no SOP
  const lone = joinReviews([{ "Review ID": "SR-1", SOP: "SOPXY9999/Onc", Status: "Requested" }], [], { now: 0, dayOf: toDay, keyOf: (c) => c });
  assert.equal(lone[0].sop, null);
});

test("cockpit: everything due across modules, by urgency, skipping SOPs whose request carries the date", () => {
  const now = toDay("2026-10-21");
  const sop = { Code: "SOPXY0001/Onc", Title: "Demo", next: now - 5 * DAY, reviewStatus: "Overdue", openReview: null, Owner: "QA lead", Department: "QA" };
  const covered = { Code: "SOPXY0002/Onc", Title: "Covered", next: now - 9 * DAY, reviewStatus: "Overdue", openReview: { open: true } };
  const m = {
    records: [{ isOpen: true, type: "CAPA", ref: "CAPA-DEMO-1", title: "Fix", due: now + 3 * DAY, owner: "A. Demo", department: "QA" }, { isOpen: false, type: "CAPA", ref: "CAPA-DEMO-2", due: now }],
    actions: [{ isOpen: true, ref: "ACT-DEMO-1", title: "Act", due: now + 20 * DAY, owner: "A. Demo" }],
    fmea: [], impr: [{ ID: "IMP-1", Title: "Idea", Stage: "Idea", "Target date": "2026-12-01" }],
    x: { sopx: { list: [sop, covered], reviews: [{ open: true, "Review ID": "SR-2026-001", SOP: "SOPXY0002/Onc", sop: covered, due: now + 60 * DAY, Type: "Periodic review" }] },
      training: [{ "Training ID": "TR-1", Program: "Demo", plannedEnd: now + 200 * DAY, status: "Planned" }], calplan: [], validation: [], apqr: [], qaact: [], suppliers: [], wip: [] },
  };
  const D = dueItems(m, now);
  assert.deepEqual(D.map((x) => [x.mod, x.id, x.bucket]), [
    ["sop", "SOPXY0001/Onc", "overdue"], ["records", "CAPA-DEMO-1", "week"], ["actions", "ACT-DEMO-1", "month"], ["improvements", "IMP-1", "quarter"], ["sopReview", "SR-2026-001", "quarter"]]);
  assert.deepEqual(D[1].link, { route: "capa" });
  assert.equal(dueItems(m, now, { horizon: 365 }).some((x) => x.mod === "training"), true);
  assert.deepEqual([bucketOf(-1), bucketOf(0), bucketOf(7), bucketOf(8), bucketOf(91)], ["overdue", "week", "week", "month", null]);
  assert.deepEqual(loadBy(D, (x) => x.owner).slice(0, 2).map((x) => [x.key, x.n, x.overdue]), [["QA lead", 1, 1], ["A. Demo", 2, 0]]);
});
