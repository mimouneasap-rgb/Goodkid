import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { readXlsx, writeXlsx } from "../apqr/js/xlsx.js";
import { importTasks, createState } from "../apqr/js/model.js";
import { SEED_META, PRODUCT_FIELDS, PRODUCT_ROWS, TASK_FIELDS, TASK_ROWS } from "../apqr/js/seed-data.js";

const seed = () => createState({ meta: SEED_META, productFields: PRODUCT_FIELDS, productRows: PRODUCT_ROWS, taskFields: TASK_FIELDS, taskRows: TASK_ROWS });

test("written workbooks read back with strings, numbers, booleans and escaping", async () => {
  const blob = await writeXlsx([
    { name: "Task Register", columns: ["Reference ID", "Product", "Count", "Flag"], rows: [["APQR-KE-1", 'A & B <"x">', 3.5, true], ["APQR-KE-2", "Ünïcødé ✓", 0, false]] },
    { name: "Notes/2026?", columns: ["Text"], rows: [] },
  ]);
  const sheets = await readXlsx(await blob.arrayBuffer());
  assert.deepEqual(sheets.map((s) => s.name), ["Task Register", "Notes 2026 "]);
  assert.deepEqual(sheets[0].rows[0], ["Reference ID", "Product", "Count", "Flag"]);
  assert.deepEqual(sheets[0].rows[1], ["APQR-KE-1", 'A & B <"x">', 3.5, true]);
  assert.deepEqual(sheets[0].rows[2], ["APQR-KE-2", "Ünïcødé ✓", 0, false]);
});

test("a full task export round-trips through the Excel writer and the importer", async () => {
  const state = seed();
  const columns = ["Reference ID", "Product", "Department", "Task Type", "Task Title", "Workflow Stage", "Status", "Assigned User", "Created", "Start", "Due", "Closed On"];
  const byId = new Map(state.products.map((p) => [p.id, p]));
  const rows = state.tasks.map((t) => [t.ref, byId.get(t.productId).scigeniqName || byId.get(t.productId).name, t.dept, t.type, t.title, t.stage, t.status, t.user, t.created, t.start, t.due, t.closedOn]);
  const sheets = await readXlsx(await (await writeXlsx([{ name: "Data", columns, rows }])).arrayBuffer());
  const out = importTasks(sheets[0].rows, state.products);
  assert.equal(out.tasks.length, 784);
  assert.equal(out.newProducts.length, 0);
  assert.deepEqual(out.tasks.map((t) => [t.productId, t.status, t.due]), state.tasks.map((t) => [t.productId, t.status, t.due]));
});

const TRACKER = process.env.APQR_TRACKER_XLSX || "tests/fixtures/APQR_Master_Tracker_ELKENDI_2026.xlsx";
test("reads the master tracker workbook exported from Excel", { skip: !existsSync(TRACKER) && "fixture not present" }, async () => {
  const sheets = await readXlsx((await readFile(TRACKER)).buffer);
  assert.ok(sheets.some((s) => s.name === "Task Register"));
  const out = importTasks(sheets.find((s) => s.name === "Task Register").rows, seed().products);
  assert.equal(out.tasks.length, 784);
  assert.equal(out.newProducts.length, 0);
  const seeded = seed().tasks;
  assert.deepEqual(out.tasks.map((t) => [t.ref, t.productId, t.status, t.user, t.due.slice(0, 10)]), seeded.map((t) => [t.ref, t.productId, t.status, t.user, t.due.slice(0, 10)]));
});
