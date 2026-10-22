import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore, diffRecords, applyRecords, seedState } from "../apqr/js/store.js";
import { changesToPatches, seedDocuments, planGroup, taskGroup } from "../apqr/js/sync.js";

test("diffRecords lists only added, changed and removed records", () => {
  const before = { products: [{ id: "A", x: 1 }, { id: "B", x: 1 }], tasks: [{ id: "T1", s: "Open" }] };
  const after = { products: [{ id: "A", x: 1 }, { id: "C", x: 2 }], tasks: [{ id: "T1", s: "Completed" }] };
  const d = diffRecords(before, after);
  const summary = d.map((c) => `${c.kind}:${c.id}:${c.before ? "old" : "-"}>${c.after ? "new" : "-"}`).sort();
  assert.deepEqual(summary, ["product:B:old>-", "product:C:->new", "task:T1:old>new"]);
  const applied = applyRecords(before, d);
  assert.deepEqual(applied.products.map((p) => p.id), ["A", "C"]);
  assert.equal(applied.tasks[0].s, "Completed");
});

test("undo reverses only what the last change touched and reports it to the shared workspace", () => {
  const store = createStore();
  const pushed = [];
  store.attachRemote({ push: (c) => pushed.push(c), log: () => {}, uid: "u1" });
  const [a, b] = store.state.products;
  store.updateProduct(a.id, { comments: "Chase QC" }, "Edit QA comment");
  assert.equal(pushed.length, 1);
  assert.deepEqual(pushed[0].map((c) => c.id), [a.id]);
  // Someone else changes another product meanwhile.
  store.applyRemote({ products: store.state.products.map((p) => (p.id === b.id ? { ...p, comments: "Remote note" } : p)) });
  store.undo();
  const now = new Map(store.state.products.map((p) => [p.id, p]));
  assert.equal(now.get(a.id).comments, "");
  assert.equal(now.get(b.id).comments, "Remote note");
  assert.deepEqual(pushed[1].map((c) => [c.id, c.after.comments]), [[a.id, ""]]);
  assert.equal(store.state.log[0].action, "Undo: Edit QA comment");
});

test("read-only stores refuse changes but keep personal settings", () => {
  const store = createStore();
  store.setReadOnly(true);
  const before = store.state.products[0].comments;
  assert.deepEqual(store.updateProduct(store.state.products[0].id, { comments: "x" }), []);
  assert.equal(store.state.products[0].comments, before);
  store.setSettings({ userName: "Viewer" });
  assert.equal(store.state.settings.userName, "Viewer");
});

test("changes become per-group item patches; moves clear the old group", () => {
  const p = { id: "TB1", plannedMonth: "2026-03" };
  const patches = changesToPatches([
    { kind: "product", id: "TB1", before: p, after: { ...p, plannedMonth: "2026-05" } },
    { kind: "task", id: "T9", before: { id: "T9", productId: "TB1" }, after: null },
    { kind: "product", id: "NEW", before: null, after: { id: "NEW", plannedMonth: "" } },
  ]);
  assert.deepEqual(Object.fromEntries(patches), {
    "plan/2026-03": { TB1: null },
    "plan/2026-05": { TB1: { id: "TB1", plannedMonth: "2026-05" } },
    "tasks/TB1": { T9: null },
    "plan/unplanned": { NEW: { id: "NEW", plannedMonth: "" } },
  });
  assert.equal(planGroup({ plannedMonth: "bad" }), "unplanned");
  assert.equal(taskGroup({ productId: "A B" }), "A-B");
});

test("the seed fits in a few small documents", () => {
  const docs = seedDocuments(seedState());
  const plan = [...docs.keys()].filter((k) => k.startsWith("plan/"));
  const tasks = [...docs.keys()].filter((k) => k.startsWith("tasks/"));
  assert.equal(plan.length, 13);
  assert.equal(tasks.length, 68);
  const items = [...docs.values()].reduce((n, d) => n + Object.keys(d.items).length, 0);
  assert.equal(items, 248 + 784);
  const largest = Math.max(...[...docs.values()].map((d) => JSON.stringify(d).length));
  assert.ok(largest < 64 * 1024, `largest document ${largest} bytes`);
});
