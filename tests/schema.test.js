import { test } from "node:test";
import assert from "node:assert/strict";
import { T1_REGISTERS, T2_REGISTERS } from "../qa-tiers/js/schema.js";

test("no register declares the same field twice", () => {
  for (const regs of [T1_REGISTERS, T2_REGISTERS])
    for (const [name, sc] of Object.entries(regs)) {
      const keys = (sc.fields || []).map((f) => f.key);
      const dup = keys.filter((k, i) => keys.indexOf(k) !== i);
      assert.deepEqual(dup, [], `${name} has duplicate fields`);
    }
});
