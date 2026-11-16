import { test } from "node:test";
import assert from "node:assert/strict";
import "../release/model.js";

const M = globalThis.ReleaseModel;

// A small made-up workbook with the same layout as the CLL vs AX file.
const workbook = {
  name: "sample.xlsx",
  sheets: {
    "ERP 365": [
      ["Batch number detailed", "Batch disposition code"],
      [260001, "Released"],
      [260002, "Released"],
      [260003, "Quarantine"],
      [260009, "Quarantine"],
      ["260010A", "Quarantine"],
    ],
    "AX 2026": [
      ["Batch number detailed", "Batch disposition code"],
      [260001, "Released"],
      [260002, "Quarantine"],
    ],
    "CLL vs AX": [
      ["Colonne1", "Colonne2", "Colonne3", "Colonne4", "Colonne5", "Colonne6"],
      ["Product Name", "Batch No ", "Recieving CLL Date", "Status on AX", "Released Date on AX & ERP 365", "Remark"],
      ["Exval® Comprimé pelliculé 160/5mg B/30", 260001, "2026-01-05", "Released", "2026-01-05", null],
      ["Exval 160/5 mg comprimé pelliculé", 260002, "2026-01-05", "Released", "2026-01-19", "QE-KE-400 closed"],
      ["Co Tensotel® Comprimé 80/25mg B/30", 260003, "2026-02-01", "Quarantine", null, "Stability ( API inferieur a 1 mois ) ( CC-Ke-528 )"],
      ["Daktazol Gel", 260004, "2026-07-06", "Released", "13/07/026", "OF/OC not posted"],
      ["Daktazol Gel", 260004, "2026-07-06", "Released", "2026-07-01", null],
      ["Total", 5, 5, 5, 4, null],
    ],
    "Statut PF": [
      ["Product", "Batch number", "Colonne3", "Colonne1", "Colonne2"],
      ["Co Tensotel® Comprimé 80/25mg B/30 / Co Tensotel®", 240393, "1907-03-26", "2026-07-31", "Rejeté RE-005-26PF"],
      ["Flazol® Comprimé pelliculé 500mg B/20", 231580, 40393, "2027-11-30", "Waiting COA +CLL"],
      [null, null, null, null, "- (waiting investigation)"],
    ],
  },
};

const model = M.build(workbook, { today: "2026-11-09" });
const byId = (id) => model.batches.filter((b) => b.id === id);

test("parseDate reads ISO strings, Excel serials and typo'd years", () => {
  assert.equal(M.parseDate("2026-01-05"), "2026-01-05");
  assert.equal(M.parseDate(46027), "2026-01-05");
  assert.equal(M.parseDate("13/07/026"), "2026-07-13");
  assert.equal(M.parseDate("13/07/2026"), "2026-07-13");
  assert.equal(M.parseDate("soon"), null);
  assert.equal(M.parseDate(1218), null);
});

test("product names with different wording group together", () => {
  assert.equal(M.productKey("Exval® Comprimé pelliculé 160/5mg B/30").key, M.productKey("Exval 160/5 mg comprimé pelliculé").key);
  assert.equal(M.productKey("Co Tensotel® Comprimé 80/25mg B/30").label, "Co Tensotel 80/25mg");
});

test("remarks yield references and a category", () => {
  assert.deepEqual(M.refsIn("Stability ( CC-Ke-528 ) and QE-KE-400"), ["CC-KE-528", "QE-KE-400"]);
  assert.deepEqual(M.refsIn("Rejeté RE-005-26PF"), ["RE-005-26PF"]);
  assert.equal(M.remarkCategory("Stability ( CC-Ke-528 )"), "Stability");
  assert.equal(M.remarkCategory("OF/OC Not posted"), "ERP posting (OF/OC)");
  assert.equal(M.remarkCategory("QE-KE-400 closed"), "Deviation (QE)");
  assert.equal(M.remarkCategory(null), "No remark");
});

test("tracker rows become batches with lead times, skipping the total row", () => {
  assert.equal(model.found.tracker, "CLL vs AX");
  assert.equal(model.batches.length, 5);
  assert.equal(byId("260001")[0].lead, 0);
  assert.equal(byId("260002")[0].lead, 14);
  assert.equal(byId("260002")[0].bucket, "8-14");
  assert.equal(byId("260003")[0].age, 281);
});

test("status cross-checks flag AX lag, missing ERP rows, duplicates and bad dates", () => {
  const kinds = (id) => byId(id).flatMap((b) => b.issues.map((i) => i.kind));
  assert.ok(kinds("260002").includes("ax-behind"));
  assert.ok(kinds("260004").includes("erp-missing"));
  assert.ok(kinds("260004").includes("duplicate"));
  assert.ok(kinds("260004").includes("negative-lead"));
  assert.deepEqual(kinds("260001"), []);
});

test("ERP quarantine batches without a CLL are listed as awaiting", () => {
  assert.deepEqual(model.awaitingCll.map((a) => a.id), ["260009", "260010A"]);
});

test("stats count unique batches and lead-time spread", () => {
  const s = model.stats;
  assert.equal(s.total, 4);
  assert.equal(s.released, 3);
  assert.equal(s.quarantine, 1);
  assert.equal(s.median, 7);
  assert.equal(s.byBucket.find((b) => b.id === "0").count, 1);
  assert.equal(s.products[0].label, "Exval 160/5mg");
  assert.equal(s.products[0].count, 2);
});

test("blocked stock repairs date-typed quantities and joins continuation rows", () => {
  assert.equal(model.blocked.length, 2);
  const [rej, flazol] = model.blocked;
  assert.equal(rej.qty, 2642);
  assert.equal(rej.kind, "Rejected");
  assert.deepEqual(rej.refs, ["RE-005-26PF"]);
  assert.equal(flazol.kind, "Missing CLL / COA");
  assert.match(flazol.reason, /waiting investigation/);
  assert.ok(flazol.monthsLeft > 12);
});

test("duplicate tracker rows get distinct row keys", () => {
  assert.deepEqual(byId("260004").map((b) => b.rowKey), ["260004", "260004@1"]);
});

test("applyEdits updates, adds and deletes tracker rows without touching the original", () => {
  const edited = M.applyEdits(workbook, [
    { kind: "tracker", key: "260003", action: "upsert", values: { product: "Co Tensotel® Comprimé 80/25mg B/30", batch: "260003", cll: "2026-02-01", status: "Released", released: "2026-02-10", remark: "QE-KE-401" } },
    { kind: "tracker", key: "260004@1", action: "delete" },
    { kind: "tracker", key: "260099", action: "upsert", isNew: true, values: { product: "Daktazol Gel", batch: "260099", cll: "2026-11-02", status: "Quarantine", released: "", remark: "" } },
    { kind: "erp", key: "260003", action: "upsert", values: { status: "Released" } },
    { kind: "erp", key: "260099", action: "upsert", values: { status: "Quarantine" } },
  ]);
  const m = M.build(edited, { today: "2026-11-09" });
  const one = (id) => m.batches.filter((b) => b.id === id);
  assert.equal(one("260003")[0].status, "Released");
  assert.equal(one("260003")[0].lead, 9);
  assert.equal(one("260003")[0].erp, "Released");
  assert.deepEqual(one("260003")[0].refs, ["QE-KE-401"]);
  assert.equal(one("260004").length, 1);
  assert.equal(one("260099")[0].status, "Quarantine");
  assert.equal(one("260099")[0].erp, "Quarantine");
  // the new row sits above the Total row, which is still skipped
  const rows = edited.sheets["CLL vs AX"];
  assert.equal(rows[rows.length - 1][0], "Total");
  assert.equal(rows[rows.length - 2][1], 260099);
  // original workbook unchanged
  assert.equal(workbook.sheets["CLL vs AX"].length, 8);
  assert.equal(model.batches.find((b) => b.id === "260003").status, "Quarantine");
});

test("applyEdits replaces a blocked batch's continued reason and removes blocked rows", () => {
  const edited = M.applyEdits(workbook, [
    { kind: "blocked", key: "231580", action: "upsert", values: { product: "Flazol® 500mg", batch: "231580", qty: "40000", expiry: "2027-12-31", reason: "CLL received, waiting QA review" } },
    { kind: "blocked", key: "240393", action: "delete" },
    { kind: "blocked", key: "250001", action: "upsert", isNew: true, values: { product: "Zeta® Pommade 2% T/15g", batch: "250001", qty: 1200, expiry: "2027-03-31", reason: "Rejeter RE050-26PF" } },
  ]);
  const m = M.build(edited, { today: "2026-11-09" });
  assert.deepEqual(m.blocked.map((b) => b.batch), ["231580", "250001"]);
  assert.equal(m.blocked[0].qty, 40000);
  assert.equal(m.blocked[0].reason, "CLL received, waiting QA review");
  assert.equal(m.blocked[1].kind, "Rejected");
});
