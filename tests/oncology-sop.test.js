// Tests of the SOP library: codes and revisions from file names, grouping of a Drive folder, reading an SOP's text
// (sections, header, history, distribution, cross-references), library rows from Drive and the topic links — on
// synthetic codes and text (no confidential data).
import { test } from "node:test";
import assert from "node:assert/strict";
import SCHEMA from "../oncology/js/schema.js";
import { EXT_COLS } from "../oncology/js/schema-ext.js";
import { buildModel, toDay } from "../oncology/js/model.js";
import { buildDomains, folderIdOf } from "../oncology/js/domain.js";
import { SOP_TOPICS } from "../oncology/js/catalogs.js";
import { sopKey, parseSopFileName, groupSopFiles, parseSopText, sopHeader, deptCodes, driveRows, matchesIn, topicsOf } from "../oncology/js/sopkit.js";

test("SOP codes, revisions, site and language from file names", () => {
  const p = (n) => { const x = parseSopFileName(n); return x && [x.code, x.key, x.rev, x.site, x.lang, x.title]; };
  assert.deepEqual(p("SOPXY0040F-Onc-01 Procédure de Vérification des Sondes.docx"), ["SOPXY0040F/Onc", "SOPXY40/ONC", "01", "Oncology", "French", "Procédure de Vérification des Sondes"]);
  assert.deepEqual(p("SOPXY0231-Onc -03 Validation Shelf Life (1).docx"), ["SOPXY0231/Onc", "SOPXY231/ONC", "03", "Oncology", "English", "Validation Shelf Life"]);
  assert.deepEqual(p("SOPXY0092F.2.docx"), ["SOPXY0092F", "SOPXY92", "02", "General", "French", ""]);
  assert.deepEqual(p("SOPXY0099E Demo Tester.pdf"), ["SOPXY0099E", "SOPXY99", null, "General", "English", "Demo Tester"]);
  assert.deepEqual(p("SOPXY0194E-Onc-01 Data Integrity Demo 27072026.docx"), ["SOPXY0194E/Onc", "SOPXY194/ONC", "01", "Oncology", "English", "Data Integrity Demo"]);
  assert.equal(p("Meeting notes.docx"), null);
  assert.equal(sopKey("SOPXY0003E-Onc"), sopKey("SOPXY0003E/Onc"));
  assert.equal(sopKey("SOPXY001/Onc"), sopKey("SOPXY0001F/Onc"));
  assert.notEqual(sopKey("SOPXY0003E"), sopKey("SOPXY0003E/Onc")); // site versions are different documents
});

test("a folder groups by SOP; the highest revision is current, Word before PDF", () => {
  const f = (id, title, mod = "2026-01-01") => ({ id, title, modifiedTime: mod });
  const { sops, other } = groupSopFiles([f("a", "SOPXY0010E-Onc-02 Demo.pdf"), f("b", "SOPXY0010E-Onc-03 Demo.docx"), f("c", "SOPXY0010E-Onc-03 Demo.pdf"), f("d", "SOPXY0011-Onc-01 Other.docx"), f("e", "notes.txt"), f("a", "SOPXY0010E-Onc-02 Demo.pdf")]);
  assert.equal(sops.length, 2);
  const g = sops.find((x) => x.key === "SOPXY10/ONC");
  assert.deepEqual([g.current.id, g.rev, g.files.length], ["b", "03", 3]);
  assert.deepEqual(other.map((x) => x.id), ["e"]);
});

const WORD = [
  "Introduction", "", "Intro text.", "", "Purpose", "", "This procedure describes the demo activity.", "", "Scope", "", "Demo site.", "",
  "Related Documents", "", "|  |  |", "| :-: | :-: |", "| Document No. | Document Title |", "| SOPXY0073F/Onc | Demo one |", "| SOPXY0044/Onc | Demo two |", "",
  "Procedure", "", "Lot Numbering", "", "The warehouse responsible, should:", "", "Allocate the number; record the hold time.", "",
  "Distribution List", "", "Quality Assurance Department.", "", "Production (Ordering) Department.", "",
  "SOP History", "", "|  |  |  |", "| :-: | :-: | :-: |", "| Ver.No. | Effective Date | Revision Summary |", "| 01 | 03/03/2024 | First issue as per CC-XY-2023-0064 |", "| 02 | As per Change Control No: CC0010/0324 |  |",
].join("\n");
const PDF = [
  "Demo SOPs", "", "Document Nr SOPXY0085E Rev.: 3 Document Name Demo Monitoring Trend Document Name Other Lang.", "", "NA", "", "Effective Date 23/06/2025 Validity Date 23/06/2028", "",
  "QMex | Document Management 23/06/2025 17:50, Someone , Page 1 of 7", "", "Demo SOPs Demo Monitoring Trend 23/06/2025", "",
  "1\\. Introduction", "", "1.1. Trend text.", "", "2\\. Purpose", "", "2.1. The purpose is to demo trends.", "", "10.Procedure", "", "10.1. Follow SOPXY0010E and SOPXY0015E.", "",
  "11.Distribution List:", "", "11.1.Validation Department.", "", "14.SOP History", "", "Ver. No. Date Effective Revision Summary", "", "01 22/02/2022 1. First issue", "", "02 07/04/2022 1. Correction", "", "Effective",
].join("\n");

test("an SOP's text: sections, related documents, history, distribution and change controls", () => {
  const d = parseSopText(WORD);
  assert.deepEqual(d.sections.map((s) => s.id), ["intro", "purpose", "scope", "related", "procedure", "distribution", "history"]);
  assert.equal(d.purpose, "This procedure describes the demo activity.");
  assert.deepEqual(d.related, [{ code: "SOPXY0073F/Onc", title: "Demo one" }, { code: "SOPXY0044/Onc", title: "Demo two" }]);
  assert.deepEqual(d.history.map((x) => [x.ver, x.date]), [["01", "2024-03-03"], ["02", null]]);
  assert.equal(d.effective, "2024-03-03");
  assert.deepEqual(deptCodes(d.distribution), ["QA", "PR"]);
  assert.deepEqual(d.changes, ["CC-XY-2023-0064", "CC0010/0324"]);
  assert.deepEqual(d.sections.find((s) => s.id === "procedure").blocks.map((b) => b.type), ["h", "p", "p"]);
  assert.deepEqual(matchesIn(WORD, "hold time"), ["Allocate the number; record the hold time."]);
});

test("a document-system PDF: header (title, revision, effective and validity dates) and line history", () => {
  const d = parseSopText(PDF);
  assert.deepEqual(d.header, { code: "SOPXY0085E", rev: "03", title: "Demo Monitoring Trend", effective: "2025-06-23", validity: "2028-06-23" });
  assert.deepEqual([d.effective, d.validity, d.purpose], ["2025-06-23", "2028-06-23", "The purpose is to demo trends."]);
  assert.deepEqual(d.distribution, ["Validation Department"]);
  assert.deepEqual(d.history.map((x) => x.ver), ["01", "02"]);
  assert.ok(d.refs.includes("SOPXY0010E") && d.refs.includes("SOPXY0015E"));
  assert.ok(!d.sections.some((s) => s.blocks.some((b) => /QMex|Page 1 of/.test(b.text ?? "")))); // page furniture dropped
  assert.deepEqual(sopHeader("| SOP No.: | SOPAB001 | Revision No.: | 00 |\n| Title: | Foreign template |\n\nIntroduction\n\nx"), { code: "SOPAB001", rev: "00", title: "Foreign template", effective: null, validity: null });
});

test("library rows from Drive keep curated titles and match codes across spellings", () => {
  const lib = [{ Code: "SOPXY0003E-Onc", Title: "Curated title", Status: "Listed", Source: "Workbook" }];
  const { sops } = groupSopFiles([{ id: "f1", title: "SOPXY0003E-Onc-04 File title.docx", modifiedTime: "2026-09-26T00:00:00Z" }, { id: "f2", title: "SOPXY0050F-Onc-01 Nouvelle procédure.docx" }]);
  const rows = driveRows(lib, sops, "Folder A");
  const a = rows.find((r) => r.Code === "SOPXY0003E-Onc");
  assert.deepEqual([a.Title, a.Revision, a["Drive ID"], a["Drive modified"], a.Status, a.Source], ["Curated title", "04", "f1", "2026-09-26", "Effective", "Workbook"]);
  const b = rows.find((r) => r.Code === "SOPXY0050F/Onc");
  assert.deepEqual([b.Title, b.Language, b.Site, b.Source], ["Nouvelle procédure", "French", "Oncology", "Drive · Folder A"]);
});

test("topics, citations, links and review dates in the library model", () => {
  const COLS = { ...SCHEMA.cols, ...EXT_COLS };
  const table = (key, objs) => ({ cols: COLS[key], rows: objs.map((o) => COLS[key].map((c) => o[c] ?? null)) });
  const empty = Object.fromEntries(Object.keys(COLS).map((k) => [k, table(k, [])]));
  const wb = {
    ...empty, meta: { asof: "2026-10-20", settings: {} }, tr: SCHEMA.tr, mapGrid: [],
    sop: table("sop", [
      { Code: "SOPXY0026/Onc", Title: "Corrective action and Preventive action", "Effective date": "2022-01-10", References: "SOPXY0015E/Onc" },
      { Code: "SOPXY0015E/Onc", Title: "Handling of Quality Events", "Effective date": "2025-05-05", "Next review": "2026-12-01", References: "SOPXY0026/Onc SOPXY0999/Onc" },
      { Code: "SOPXY0077", Title: "Demo without topic" },
    ]),
    sopSources: table("sopSources", [{ Folder: "https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOp", Name: "Demo", "Review years": 3 }]),
    sopLinks: table("sopLinks", [{ Topic: "fives", SOP: "SOPXY0077" }]),
  };
  const m = buildDomains(buildModel(wb, { today: toDay("2026-10-21") }), wb, null);
  const X = m.x.sopx;
  const capa = X.byKey.get(sopKey("SOPXY0026/Onc")), qe = X.byKey.get(sopKey("SOPXY0015E/Onc"));
  assert.deepEqual(capa.topics, ["capa"]);
  assert.deepEqual(X.byTopic.get("deviations").map((s) => s.Code), ["SOPXY0015E/Onc"]);
  assert.deepEqual(X.byTopic.get("fives").map((s) => s.Code), ["SOPXY0077"]); // a manual link replaces the title match
  assert.deepEqual(qe.citedBy.map((s) => s.Code), ["SOPXY0026/Onc"]);
  assert.deepEqual(qe.refKeys, [sopKey("SOPXY0026/Onc"), sopKey("SOPXY0999/Onc")]);
  assert.equal(capa.reviewStatus, "Overdue"); // effective 2022-01-10 + 3 years
  assert.equal(capa.nextFromEffective, true);
  assert.equal(qe.reviewStatus, "Due ≤90 d"); // its own next review date wins
  assert.equal(X.sources[0].folderId, "1AbCdEfGhIjKlMnOp");
  assert.equal(folderIdOf("1AbCdEfGhIjKlMnOp"), "1AbCdEfGhIjKlMnOp");
  assert.deepEqual(topicsOf("Procédure Opératoire du Débitmètre", SOP_TOPICS), ["calibration"]);
});
