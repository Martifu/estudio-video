// Spec of paymentPlan (imported by engine/motion-lib.test.mjs): steps, percentages, amounts that land exactly.
import test from "node:test";
import assert from "node:assert/strict";
import * as Lib from "./index.js";
import { recorder, env } from "./_testkit.mjs";

const el = { id: "pp", type: "paymentPlan", in: 0, out: 4, title: "Plan", steps: [{ label: "Apartado", amount: 50000 }, { label: "Enganche", amount: 230000, percent: 10 }, { label: "Entrega", amount: 1000000, percent: 40 }], source: { kind: "fictional" } };

test("paymentPlan: 2 to 5 steps; amounts must be positive; percentages above 100 are advice", () => {
  assert.deepEqual(Lib.validate(el, "pp").errors, []);
  assert.ok(Lib.validate({ ...el, steps: [{ label: "A", amount: 1 }] }, "pp").errors.length >= 1);
  assert.ok(Lib.validate({ ...el, steps: [{ label: "A", amount: -1 }, { label: "B", amount: 1 }] }, "pp").errors.length >= 1);
  const over = Lib.validate({ ...el, steps: [{ label: "A", amount: 1, percent: 70 }, { label: "B", amount: 1, percent: 50 }] }, "pp");
  assert.ok(over.warnings.some((m) => /120%/.test(m)));
});

test("paymentPlan: the last amount counts up monotonically and lands exactly on its text", () => {
  let prev = -1, last = "";
  for (let t = 1.0; t < 3.5; t += 1 / 30) {
    const log = [];
    Lib.draw(recorder(log), el, t, env());
    const hit = log.map((l) => /^fillText\((\$[\d,.]+),790,430\)$/.exec(l)).filter(Boolean).map((m) => m[1]);
    if (!hit.length) continue;
    const v = hit[0];
    const n = Number(v.replace(/[$,]/g, ""));
    assert.ok(n >= prev - 1e-6 && n <= 1000000, `went from ${prev} to ${n}`);
    prev = n; last = v;
  }
  assert.equal(last, "$1,000,000");
});

test("paymentPlan: one node per step; the line draws before the last node pops", () => {
  const tl = Lib.timeline(el);
  assert.equal(tl.b.nodes.length, 3);
  assert.ok(tl.b.line[1] <= tl.b.nodes[2][1] + 0.5);
  assert.ok(Lib.showsNumbers(el));
});
