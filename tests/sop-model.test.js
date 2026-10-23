import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fold, tokens, attachmentKey, displayCode, indexLibrary, filterSops, filterAttachments, quickFind,
  sortSops, stats, reviewTimeline, graphData, layoutGraph, recordColumns, fieldKind, validateRecord,
  recordsToCsv, libraryToCsv,
} from "../sop/js/model.js";
import { DEMO_LIBRARY } from "../sop/js/demo-data.js";

const TODAY = new Date("2026-10-23T00:00:00Z");

const att = (code, base, kind, num, extra = {}) => ({ code, base, kind, num, title: "", type: "form", fields: [], own: true, ...extra });
const sop = (o) => ({ site: "Onc", status: "current", lang: "E", attachments: [], sopRefs: [], ...o });

function smallLibrary() {
  return {
    schema: "sop-library/1",
    sops: [
      sop({ id: "a", code: "SOPQA0001E", dept: "QA", num: "0001", version: "03", title: "Document Control",
        purpose: "How documents are approved.", text: "Every controlled copy is stamped.",
        reviewDate: "2026-01-01", sopRefs: ["SOPQC0002", "SOPXX9999"],
        attachments: [att("QA0001E/Onc/FE01/03", "QA0001E", "FE", 1, { title: "Change request", fields: ["Date", "Reason"] }),
          att("QA0001E/Onc/FE02/02", "QA0001E", "FE", 2, { title: "Distribution log", type: "logbook" })] }),
      sop({ id: "b", code: "SOPQC0002F", dept: "QC", num: "0002", version: "01", lang: "F", title: "Réception des échantillons",
        reviewDate: "2027-01-10", sopRefs: ["SOPQA0001"],
        attachments: [att("QA0001F/Onc/FF01/03", "QA0001F", "FF", 1, { own: false }),
          att("QC0002F/Onc/TF01/01", "QC0002F", "TF", 1, { title: "Registre", type: "template" })] }),
      sop({ id: "c", code: "SOPQA0001E", dept: "QA", num: "0001", version: "03", title: "Document Control", status: "duplicate" }),
    ],
  };
}

test("fold and tokens ignore accents and case", () => {
  assert.equal(fold("Échantillon RÉCEPTION"), "echantillon reception");
  assert.deepEqual(tokens("  Réception,  QC0002 "), ["reception", "qc0002"]);
});

test("attachmentKey ignores the language letter and version", () => {
  assert.equal(attachmentKey({ base: "QA0118F", kind: "FF", num: 2 }), "QA0118/F02");
  assert.equal(attachmentKey({ base: "QA0118E", kind: "FE", num: 2 }), "QA0118/F02");
  assert.equal(attachmentKey({ base: "QA0118", kind: "TE", num: 11 }), "QA0118/T11");
});

test("displayCode adds site and version", () => {
  assert.equal(displayCode({ code: "SOPQA0001E", site: "Onc", version: "03" }), "SOPQA0001E/Onc/03");
  assert.equal(displayCode({ code: "SOPVL0010E", site: "General", version: "19" }), "SOPVL0010E/19");
});

test("indexLibrary rejects files that are not libraries", () => {
  assert.throws(() => indexLibrary({}), /not an SOP library/);
  assert.throws(() => indexLibrary(null), /not an SOP library/);
});

test("indexLibrary links SOPs both ways and lists missing references", () => {
  const lib = indexLibrary(smallLibrary(), TODAY);
  const a = lib.byId.get("a");
  const b = lib.byId.get("b");
  assert.deepEqual(a.links, ["b"]);
  assert.deepEqual(a.missing, ["SOPXX9999"]);
  assert.deepEqual(b.links, ["a"]);           // the current file, not the duplicate
  assert.deepEqual(a.backlinks, ["b"]);
  assert.equal(lib.byId.get("c").backlinks.length, 0);
});

test("indexLibrary connects attachments to their owner and to SOPs that use them", () => {
  const lib = indexLibrary(smallLibrary(), TODAY);
  assert.equal(lib.attachments.length, 3);   // the non-owned reference is not an attachment
  const change = lib.attById.get("a~QA0001/F01");
  assert.equal(change.title, "Change request");
  assert.deepEqual(change.usedBy, ["b"]);
  assert.deepEqual(lib.byId.get("b").foreign, ["a~QA0001/F01"]);
});

test("review state is computed against today", () => {
  const lib = indexLibrary(smallLibrary(), TODAY);
  assert.equal(lib.byId.get("a").reviewState, "overdue");
  assert.equal(lib.byId.get("b").reviewState, "due");
  assert.equal(lib.byId.get("c").reviewState, "unknown");
  const later = indexLibrary(smallLibrary(), new Date("2025-01-01"));
  assert.equal(later.byId.get("a").reviewState, "ok");
  const close = indexLibrary(smallLibrary(), new Date("2025-11-15"));
  assert.equal(close.byId.get("a").reviewState, "due");
  assert.equal(later.byId.get("b").reviewState, "ok");
});

test("quality issues report overdue reviews, duplicates, missing refs and untitled attachments", () => {
  const kinds = indexLibrary(smallLibrary(), TODAY).issues.map((i) => i.kind).sort();
  assert.deepEqual(kinds, ["duplicate", "missing", "overdue"]);
  const raw = smallLibrary();
  raw.sops[0].attachments[0].title = "";
  assert.ok(indexLibrary(raw, TODAY).issues.some((i) => i.kind === "untitled"));
});

test("filterSops matches every term, ranks code hits first and searches full text", () => {
  const lib = indexLibrary(smallLibrary(), TODAY);
  const ids = (r) => r.map((x) => x.sop.id);
  assert.deepEqual(ids(filterSops(lib, { query: "qc0002" })), ["b"]);
  assert.deepEqual(ids(filterSops(lib, { query: "echantillons" })), ["b"]);
  assert.deepEqual(ids(filterSops(lib, { query: "stamped", status: "current" })), ["a"]);
  assert.deepEqual(ids(filterSops(lib, { query: "stamped", fullText: false })), []);
  assert.deepEqual(ids(filterSops(lib, { query: "document missingword" })), []);
  const hit = filterSops(lib, { query: "stamped" }).find((r) => r.sop.id === "a");
  assert.match(hit.snippet, /stamped/);
});

test("filterSops applies department, language, review and attachment filters", () => {
  const lib = indexLibrary(smallLibrary(), TODAY);
  const ids = (f) => filterSops(lib, f).map((x) => x.sop.id);
  assert.deepEqual(ids({ dept: "QC" }), ["b"]);
  assert.deepEqual(ids({ lang: "F" }), ["b"]);
  assert.deepEqual(ids({ review: "overdue" }), ["a"]);
  assert.deepEqual(ids({ has: "logbook" }), ["a"]);
  assert.deepEqual(ids({ status: "duplicate" }), ["c"]);
});

test("filterAttachments searches fields and parent SOP", () => {
  const lib = indexLibrary(smallLibrary(), TODAY);
  assert.deepEqual(filterAttachments(lib, { query: "reason" }).map((a) => a.code), ["QA0001E/Onc/FE01/03"]);
  assert.deepEqual(filterAttachments(lib, { type: "template" }).map((a) => a.code), ["QC0002F/Onc/TF01/01"]);
  assert.equal(filterAttachments(lib, { withFields: true }).length, 1);
});

test("quickFind returns SOPs and attachments, exact code first", () => {
  const lib = indexLibrary(smallLibrary(), TODAY);
  const r = quickFind(lib, "QA0001");
  assert.equal(r[0].kind, "sop");
  assert.equal(r[0].id, "a");
  assert.ok(r.some((x) => x.kind === "att"));
  assert.deepEqual(quickFind(lib, ""), []);
});

test("sortSops sorts by title, review date and attachment count", () => {
  const lib = indexLibrary(smallLibrary(), TODAY);
  assert.deepEqual(sortSops(lib.sops, "review").map((s) => s.id), ["a", "b", "c"]);
  assert.deepEqual(sortSops(lib.sops, "links", "desc").map((s) => s.id)[0], "a");
  assert.deepEqual(sortSops(lib.sops, "title", "desc").map((s) => s.id)[0], "b");
});

test("stats and the review timeline count current SOPs only", () => {
  const lib = indexLibrary(smallLibrary(), TODAY);
  const st = stats(lib);
  assert.equal(st.total, 3);
  assert.equal(st.current, 2);
  assert.deepEqual(st.byDept, { QA: 1, QC: 1 });
  assert.equal(st.byType.logbook, 1);
  assert.equal(st.overdue, 1);
  assert.equal(st.duplicates, 1);
  const tl = reviewTimeline(lib, TODAY, 6);
  assert.equal(tl.overdue, 1);
  assert.equal(tl.buckets.length, 6);
  assert.deepEqual(tl.buckets.find((b) => b.key === "2027-01").sops, ["b"]);
});

test("graph data and layout are deterministic and stay inside the canvas", () => {
  const lib = indexLibrary(DEMO_LIBRARY, TODAY);
  const g = graphData(lib, { connectedOnly: true });
  assert.ok(g.nodes.length > 3);
  assert.ok(g.edges.every((e) => g.nodes.some((n) => n.id === e.source) && g.nodes.some((n) => n.id === e.target)));
  const p1 = layoutGraph(g, 800, 600, 80);
  const p2 = layoutGraph(g, 800, 600, 80);
  for (const n of g.nodes) {
    const a = p1.get(n.id), b = p2.get(n.id);
    assert.equal(a.x, b.x);
    assert.ok(a.x >= 24 && a.x <= 776 && a.y >= 24 && a.y <= 576);
  }
  assert.ok(graphData(lib, { dept: "QC" }).nodes.every((n) => n.dept === "QC"));
});

test("record columns use the form fields, with a generic fallback", () => {
  assert.deepEqual(recordColumns({ fields: ["Date", "Température (°C)", "Comments"] }).map((c) => c.kind), ["date", "number", "text"]);
  assert.equal(recordColumns({ fields: [] }).length, 4);
  assert.equal(fieldKind("Checked by / date"), "short");
  assert.equal(fieldKind("Heure"), "time");
  assert.equal(fieldKind("Lot No."), "short");
});

test("validateRecord needs at least one value", () => {
  const cols = recordColumns({ fields: ["A", "B"] });
  assert.equal(validateRecord({}, cols).length, 1);
  assert.deepEqual(validateRecord({ f1: "x" }, cols), []);
});

test("CSV exports quote separators and keep entry order", () => {
  const a = { fields: ["Room", "Note"] };
  const cols = recordColumns(a);
  const csv = recordsToCsv(a, cols, [
    { createdAt: "2026-10-01T08:00:00Z", by: "MB", values: { f0: "Lab 1", f1: 'said "ok", fine' } },
    { createdAt: "2026-10-02T08:00:00Z", by: "AK", values: { f0: "Lab 2" } },
  ]).split("\r\n");
  assert.equal(csv[0], "Entry,Recorded at,Recorded by,Room,Note");
  assert.equal(csv[1], '1,2026-10-01T08:00:00Z,MB,Lab 1,"said ""ok"", fine"');
  assert.equal(csv[2], "2,2026-10-02T08:00:00Z,AK,Lab 2,");
  const lib = indexLibrary(smallLibrary(), TODAY);
  const rows = libraryToCsv(lib).split("\r\n");
  assert.equal(rows.length, 4);
  assert.match(rows[1], /^SOPQA0001E,03,Onc,QA,E,Document Control,current/);
});

test("the demo library indexes cleanly", () => {
  const lib = indexLibrary(DEMO_LIBRARY, TODAY);
  assert.equal(lib.meta.demo, true);
  assert.equal(lib.sops.length, 10);
  assert.ok(lib.attachments.length >= 15);
  assert.ok(lib.sops.every((s) => s.title && s.attachments.length));
  assert.equal(lib.issues.filter((i) => i.kind === "missing").length, 0);
});
