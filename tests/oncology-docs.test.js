// Tests of document control: document types and where a file sits (controlled, obsolete, uncontrolled copy), codes
// and revisions of every document type, grouping, products, the master document indexes read from their scanned text,
// and the register model (index check, documents an index misses, product dossiers) — on synthetic codes and names.
import { test } from "node:test";
import assert from "node:assert/strict";
import SCHEMA from "../oncology/js/schema.js";
import { EXT_COLS } from "../oncology/js/schema-ext.js";
import { buildModel, toDay } from "../oncology/js/model.js";
import { buildDomains } from "../oncology/js/domain.js";
import { zoneOf, docTypeOf, parseDocName, docKey, groupDocs, docRows, productOf, strengthOf, isSystemFile, parseIndexText, indexIdOf, currentIndexes } from "../oncology/js/dockit.js";

test("where a file sits and what type of document it is", () => {
  assert.equal(zoneOf("QA Documents/QA SOP", "SOPXY0001E-Onc-01.pdf"), "controlled");
  assert.equal(zoneOf("OBSOLETE DOCUMENTS/QA SOP", "x.pdf"), "obsolete");
  assert.equal(zoneOf("", "SOPXY0024-Onc-01 Demo ( Démo ) obsolete.pdf"), "obsolete");
  assert.equal(zoneOf("Uncotrolled copies", "x.pdf"), "uncontrolled");
  assert.equal(zoneOf("DMS UNCONTROLLED", "x.pdf"), "uncontrolled");
  const types = ["SOPXY0001E-Onc-01 Demo.docx", "BMR0901F-Onc-01 DEMOXA 50 mg.pdf", "BPR0901F-Onc-01 DEMOXA.pdf", "OFONC-TB901 DEMOXA.pdf", "OC ONC-TB901P01 DEMOXA 50 mg.pdf",
    "BOM-ONC-TB901-02 Demoxa.pdf", "FPS901-Onc-02 Demoxa 50mg.pdf", "PMS901-On-01 Demo foil.pdf", "STMRM0901-Onc-01 Demozole.pdf", "STR0901-Onc-01 Demoxa.pdf", "IndXY-ONC-SOP25.pdf", "SKM C368 DO25030211510.pdf"]
    .map((n) => docTypeOf(n));
  assert.deepEqual(types, ["SOP", "BMR", "BPR", "OF", "OC", "BOM", "FPS", "PMS", "STM", "STR", "IND", "SCAN"]);
  assert.equal(docTypeOf("DEMOXA 200mg.pdf", "PL Documents/Creation CODE"), "COD"); // no type in the name: the folder says it
  assert.ok(isSystemFile("Thumbs.db") && isSystemFile("OFONC-TB902 Demo -.lnk") && !isSystemFile("FPS901-Onc-01.pdf"));
});

test("document codes, revisions and identity across spellings", () => {
  const p = (n) => { const x = parseDocName(n); return [x.type, x.code, x.rev, x.title]; };
  assert.deepEqual(p("BMR0903F-Onc-02 DEMOXA  200 mg.pdf"), ["BMR", "BMR0903F-Onc", "02", "DEMOXA 200 mg"]);
  assert.deepEqual(p("OF-ONC-TB912P-01 DEMOB 250 mg comprimés.pdf"), ["OF", "OF-Onc-TB912P", "01", "DEMOB 250 mg comprimés"]);
  assert.deepEqual(p("RMR0901-Onc-01-  Demozole.pdf"), ["RMR", "RMR0901-Onc", "01", "Demozole"]);
  assert.equal(docKey("FPS902-Onc-04"), docKey("FPS902/Onc/04"));
  assert.equal(docKey("OFONC-TB901"), docKey("OF-ONC-TB901-01"));
  assert.equal(docKey("SOPXY0015E/Onc/02"), docKey("SOPXY0015E-Onc-04"));
  assert.notEqual(docKey("FPS902-Onc"), docKey("FPS903-Onc"));
  assert.equal(strengthOf("Demoxa 2,5mg FC"), "2.5 mg");
});

test("a controlled file is current before an obsolete one, whatever their revisions", () => {
  const f = (id, title, path, mod = "2025-01-01") => ({ id, title, path, modifiedTime: mod, mimeType: "application/pdf" });
  const groups = groupDocs([
    f("a", "SOPXY0010E-Onc-01 Demo.pdf", "QA Documents/QA SOP"), f("b", "SOPXY0010E-Onc-03 Demo.docx", ""), f("c", "SOPXY0010E-Onc-04 Demo.pdf", "OBSOLETE DOCS/QA"),
    f("d", "SOPXY0011-Onc-02 Other.pdf", "OBSOLETE DOCS/QA"), f("e", "SOPXY0012-Onc-01.pdf", "Uncontrolled copy"), f("t", "Thumbs.db", ""),
  ]);
  const g = (code) => groups.find((x) => x.code.startsWith(code));
  assert.deepEqual([g("SOPXY0010E").current.id, g("SOPXY0010E").rev, g("SOPXY0010E").status, g("SOPXY0010E").zones], ["b", "03", "Effective", { controlled: 2, obsolete: 1, uncontrolled: 0 }]);
  assert.equal(g("SOPXY0011").status, "Obsolete");
  assert.equal(g("SOPXY0012").status, "Uncontrolled copy");
  assert.equal(groups.length, 3); // the thumbnail cache is not a document
});

test("products from document names, allowing typing slips", () => {
  const P = [{ key: "DEMOXA", product: "DEMOXA" }, { key: "DEMOZOLE", product: "DEMOXA" }, { key: "KORVIDAN", product: "KORVIDAN" }];
  assert.equal(productOf("BMR0905F-ONC-01 KOVRIDAN 200 mg", P), "KORVIDAN"); // two letters swapped
  assert.equal(productOf("STMRM0901-Onc-01 Demozole", P), "DEMOXA"); // by its API
  assert.equal(productOf("Clear PVC-PVDC 250 film", P), null);
  const rows = docRows(groupDocs([{ id: "x", title: "FPS901-Onc-02 Demoxa 50 mg Film Coated Tablets.pdf", path: "QC Documents/Specifications" }]), P);
  assert.deepEqual([rows[0].Type, rows[0].Product, rows[0].Strength, rows[0].Department, rows[0].Status], ["FPS", "DEMOXA", "50 mg", "QC", "Effective"]);
});

// a master index as the connector reads a scanned PDF: cells one per line, codes and dates out of step
const INDEX = [
  "SKM C368 DO25022310001", "Ref. SOP No. SOPXY0003E/Onc", "Master Document Index", "Form No.", "XY0003E/Onc/T01/01", "Index Coding (Code Index)", "IndXY/One-SOP25",
  "SOPXY0001E/Onc/01", "Demo one 20/12/2023", "20/12/2026", "N/A",
  "SOPXY0002E/One/02 Demo two", "N/A", "23/05/2024", "23/05/2027",
  "SOPXY0005E/Onc/01", "SOPXY0004/Onc/01", "Demo four", "Demo five", "02/04/2024", "02/04/2027", "N/A", "24/03/2024", "N/A", "24/03/2027", // listed out of order; N/A inside a row
  "SOPXYO006F/Onc/01 Demo six", "03/04/2024", "03/04/2024", "N/A", // letter O for a zero; validity = effective
  "Index revision History (Historique de la révision de l'index)", "First issue: SOPXY0009E/Onc/01", "18/02/2025",
].join("\n\n");

test("a scanned master index: entries, revisions, dates and anomalies", () => {
  const r = parseIndexText(INDEX, "IndXY-ONC-SOP25.pdf");
  assert.deepEqual([r.id, r.dept, r.scope, r.year, r.partial], ["IndXY/Onc-SOP25", "XY", "SOP", 2025, false]);
  assert.deepEqual(r.entries.map((e) => [e.code, e.rev, e.effective, e.validity]), [
    ["SOPXY0001E/Onc", "01", "2023-12-20", "2026-12-20"],
    ["SOPXY0002E/Onc", "02", "2024-05-23", "2027-05-23"],
    ["SOPXY0004/Onc", "01", "2024-04-02", "2027-04-02"],
    ["SOPXY0005E/Onc", "01", "2024-03-24", "2027-03-24"],
    ["SOPXY0006F/Onc", "01", "2024-04-03", "2024-04-03"],
  ]);
  assert.deepEqual(r.anomalies, [{ code: "SOPXY0006F/Onc", kind: "same-date" }]);
  // an index without validity dates: one date per document, the last ones read past the history
  const spec = parseIndexText(["IndQC/Onc-FPS25", "FPS901/Onc/02", "22/12/2024", "N/A", "N/A", "FPS902/Onc/01", "FPS903/Onc/01", "Index revision History", "21/01/2025", "N/A", "N/A", "06/05/2024", "N/A"].join("\n"), "IndQC-Onc-FPS24.pdf");
  assert.deepEqual(spec.entries.map((e) => [e.code, e.effective, e.validity]), [["FPS901/Onc", "2024-12-22", null], ["FPS902/Onc", "2025-01-21", null], ["FPS903/Onc", "2024-05-06", null]]);
  assert.equal(spec.year, 2025); // the index's own coding wins over the file name's year
  assert.deepEqual(indexIdOf("EN- INDEX-2025.pdf"), { dept: "EN", scope: "SOP", year: 2025 });
  const cur = currentIndexes([
    { Type: "IND", Status: "Effective", "Drive ID": "1", "Drive file": "IndXY-Onc-SOP24.pdf" }, { Type: "IND", Status: "Effective", "Drive ID": "2", "Drive file": "IndXY-ONC-SOP25.pdf" },
    { Type: "IND", Status: "Obsolete", "Drive ID": "3", "Drive file": "IndXY-Onc-SOP26.pdf" }, { Type: "IND", Status: "Effective", "Drive ID": "4", "Drive file": "IndQC-Onc-FPS24.pdf" },
  ]);
  assert.deepEqual(cur.map((x) => x.row["Drive ID"]), ["4", "2"]);
});

test("the register model: index check, documents an index misses, product dossiers, review dates from the index", () => {
  const COLS = { ...SCHEMA.cols, ...EXT_COLS };
  const table = (key, objs) => ({ cols: COLS[key], rows: objs.map((o) => COLS[key].map((c) => o[c] ?? null)) });
  const empty = Object.fromEntries(Object.keys(COLS).map((k) => [k, table(k, [])]));
  const sop = (Code, Revision, extra = {}) => ({ Code, Title: `Demo ${Code}`, Department: "XY", Site: "Oncology", Revision, "Drive ID": `d-${Code}`, ...extra });
  const doc = (Code, Type, Title, extra = {}) => ({ Code, Type, Title, Department: "QC", Site: "Oncology", Revision: "01", Status: "Effective", "Drive ID": `f-${Code}`, ...extra });
  const ix = (Code, Revision, eff, val, Index = "IndXY/Onc-SOP25", Scope = "SOP", Department = "XY") => ({ Index, Department, Scope, Year: 2025, Code, Revision, "Effective date": eff, "Validity date": val });
  const wb = {
    ...empty, meta: { asof: "2026-10-20", settings: {} }, tr: SCHEMA.tr, mapGrid: [],
    sop: table("sop", [sop("SOPXY0001E/Onc", "01"), sop("SOPXY0002E/Onc", "03", { Revisions: "01 03", "Effective date": "2025-06-01" }), sop("SOPXY0004/Onc", null, { "Drive ID": null, Status: "Listed" }),
      sop("SOPXY0007/Onc", "01"), sop("SOPXY0008/Onc", "01", { Status: "Obsolete" }), sop("SOPXY0009/Onc", "01", { Status: "Uncontrolled copy" })]),
    docIndex: table("docIndex", [ix("SOPXY0001E/Onc", "01", "2023-12-20", "2026-12-20"), ix("SOPXY0002E/Onc", "02", "2024-05-23", "2027-05-23"), ix("SOPXY0004/Onc", "01", "2024-04-02", "2027-04-02"), ix("SOPXY0009/Onc", "01", "2024-04-02", "2027-04-02"),
      ix("FPS901/Onc", "01", "2024-12-22", null, "IndQC/Onc-FPS25", "FPS", "QC")]),
    docs: table("docs", [doc("FPS901-Onc", "FPS", "Demoxa 50 mg tablets"), doc("FPS902-Onc", "FPS", "Demoxa 100 mg tablets"), doc("BMR0901F-Onc", "BMR", "DEMOXA 50 mg", { "Product code": "TB901" }),
      doc("OF-Onc-TB905", "OF", "NOVADEM 25 mg comprimés", { "Product code": "TB905" }), doc("BMR0905F-Onc", "BMR", "Novadem 25 mg", { "Product code": "TB905" })]),
    prod: table("prod", [{ "Search key": "DEMOXA", Product: "DEMOXA", API: "Demozole", Status: "Marketed (SMF Annex 2)" }]),
  };
  const m = buildDomains(buildModel(wb, { today: toDay("2026-10-21") }), wb, null);
  const X = m.x.docx, S = m.x.sopx;
  const state = (code) => X.checks.find((c) => c.code === code)?.state;
  assert.deepEqual([state("SOPXY0001E/Onc"), state("SOPXY0002E/Onc"), state("SOPXY0004/Onc"), state("SOPXY0009/Onc"), state("FPS901/Onc")], ["match", "drive-newer", "missing", "missing", "match"]);
  assert.equal(X.checks.find((c) => c.code === "SOPXY0002E/Onc").hasListedRev, false); // Drive holds 01 and 03, the index lists 02
  assert.deepEqual(X.unlisted.map((d) => d.code).sort(), ["FPS902-Onc", "SOPXY0007/Onc"]); // the obsolete SOP is not expected in the index
  const s1 = S.list.find((s) => s.Code === "SOPXY0001E/Onc");
  assert.deepEqual([s1.reviewStatus, s1.datesFromIndex, s1.idx.state], ["Due ≤90 d", true, "match"]); // valid until 2026-12-20
  const s2 = S.list.find((s) => s.Code === "SOPXY0002E/Onc");
  assert.deepEqual([s2.datesFromIndex, s2.next === toDay("2028-06-01")], [false, true]); // rev 03 has its own date: the index's dates (rev 02) do not apply
  assert.equal(S.list.find((s) => s.Code === "SOPXY0008/Onc").reviewStatus, "Obsolete");
  const demoxa = X.products.find((p) => p.name === "DEMOXA"), nova = X.products.find((p) => p.name === "NOVADEM");
  assert.deepEqual([demoxa.cells.FPS.length, demoxa.cells.BMR.length, demoxa.missing.includes("BPR"), demoxa.strengths], [2, 1, true, ["50 mg", "100 mg"]]);
  assert.deepEqual([nova.inList, nova.code, nova.cells.OF.length, nova.marketed], [false, "TB905", 1, true]); // found from its product code
});
