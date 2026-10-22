import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseNumbers, mean, stdev, imrLimits, capability, classifyCpk, runRules, andersonDarling,
  normCdf, histogram, evaluateStudy,
} from "../apqr/js/stats.js";

const close = (a, b, eps = 1e-3) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

test("parseNumbers accepts lines, spaces, semicolons and decimal commas", () => {
  assert.deepEqual(parseNumbers("99.1\n100.2\t98.7"), [99.1, 100.2, 98.7]);
  assert.deepEqual(parseNumbers("1,2,3"), [1, 2, 3]);
  assert.deepEqual(parseNumbers("99,5\n100,1"), [99.5, 100.1]);
  assert.deepEqual(parseNumbers("99,5; 100,1"), [99.5, 100.1]);
  assert.deepEqual(parseNumbers("a 1 b 2"), [1, 2]);
  assert.deepEqual(parseNumbers(""), []);
});

test("descriptive statistics and I-MR limits", () => {
  const xs = [10, 12, 11, 13, 12];
  close(mean(xs), 11.6);
  close(stdev(xs), 1.1402);
  const l = imrLimits(xs);
  close(l.mrBar, 1.5); // |2|,|1|,|2|,|1|
  close(l.sigma, 1.5 / 1.128);
  close(l.ucl, 11.6 + 3 * 1.5 / 1.128);
});

test("capability indices for two- and one-sided specifications", () => {
  const xs = [99.8, 100.1, 99.9, 100.2, 100.0, 99.7, 100.3, 100.0, 99.9, 100.1];
  const c = capability(xs, { lsl: 95, usl: 105 });
  close(c.mean, 100);
  assert.ok(c.cpk > 1.33 && c.ppk > 1.33);
  close(c.pp, 10 / (6 * stdev(xs)));
  const upperOnly = capability(xs, { usl: 100.5 });
  assert.equal(upperOnly.cp, null);
  close(upperOnly.ppk, 0.5 / (3 * stdev(xs)));
  assert.equal(capability(xs, { lsl: 100.25 }).outOfSpec, 9);
});

test("Cpk bands follow SOPQA0152E Phase 5", () => {
  assert.equal(classifyCpk(1.5), "excellent");
  assert.equal(classifyCpk(1.33), "acceptable");
  assert.equal(classifyCpk(1.0), "acceptable");
  assert.equal(classifyCpk(0.99), "poor");
  assert.equal(classifyCpk(null), null);
});

test("run rules detect a point beyond 3σ, a shift and a trend", () => {
  const stable = [0, 1, -1, 0.5, -0.5, 0.2, -0.2, 0.1, -0.1, 0.3];
  assert.deepEqual(runRules(stable, 0, 1).map((r) => r.rule).filter((r) => r === 1 || r === 2 || r === 3), []);
  assert.ok(runRules([0, 0, 4, 0], 0, 1).some((r) => r.rule === 1 && r.points.includes(2)));
  assert.ok(runRules([0.1, 0.2, 0.3, 0.1, 0.2, 0.3, 0.1, 0.2, 0.3], 0, 1).some((r) => r.rule === 2));
  assert.ok(runRules([1, 2, 3, 4, 5, 6], 3.5, 10).some((r) => r.rule === 3));
});

test("Anderson–Darling separates normal-looking from skewed data", () => {
  close(normCdf(0), 0.5, 1e-6);
  close(normCdf(1.96), 0.975, 1e-3);
  const normalish = [-1.6, -1.1, -0.8, -0.5, -0.3, -0.1, 0, 0.1, 0.3, 0.5, 0.8, 1.1, 1.6, -0.2, 0.2, 0.05];
  assert.equal(andersonDarling(normalish).normal, true);
  const skewed = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 3, 20];
  assert.equal(andersonDarling(skewed).normal, false);
  assert.equal(andersonDarling([1, 2, 3]), null);
});

test("histogram bins cover the data and spec limits", () => {
  const h = histogram([1, 2, 2, 3, 3, 3, 4], [0, 5]);
  assert.equal(h.min, 0);
  assert.equal(h.max, 5);
  assert.equal(h.bins.reduce((n, b) => n + b.count, 0), 7);
});

test("evaluateStudy combines capability, control and SOP actions", () => {
  const values = [100.4, 100.6, 100.5, 100.7, 100.6, 100.8, 100.7, 100.9, 100.8, 101.0];
  const s = evaluateStudy({ values, lsl: 100, usl: 100.9 });
  assert.equal(s.enough, true);
  assert.equal(s.band, "poor");
  assert.equal(s.capaRequired, true);
  assert.ok(s.actions.some((a) => a.startsWith("CAPA is mandatory")));
  assert.ok(s.actions.some((a) => a.includes("Fewer than 20")));
  const manual = evaluateStudy({ values: [], cpkManual: "1.2", controlManual: "in" });
  assert.equal(manual.band, "acceptable");
  assert.equal(manual.inControl, true);
});
