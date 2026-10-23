// Spec of priceCompare (imported by engine/motion-lib.test.mjs).
import test from "node:test";
import assert from "node:assert/strict";
import * as Lib from "./index.js";
import { recorder, env } from "./_testkit.mjs";

const el = (over = {}) => ({ id: "pc", type: "priceCompare", in: 0, out: 3.5, oldValue: 1450000, value: 1330000, ...over });

test("priceCompare: the savings pill says the difference in money (Ahorras $120,000)", () => {
  assert.ok(Lib.texts(el()).includes("Ahorras $120,000"));
  assert.ok(Lib.texts(el({ savingsLabel: "Ahorra" })).includes("Ahorra $120,000"));
  const log = [];
  Lib.draw(recorder(log), el(), 3.0, env());
  assert.ok(log.some((l) => l.includes("Ahorras $120,000")));
});

test("priceCompare: the new price slams in without overshoot (its scale goes from 1.35 down to exactly 1)", () => {
  const scales = [];
  for (let t = 0.5; t <= 3.2; t += 1 / 60) {
    const log = [];
    Lib.draw(recorder(log), el(), t, env());
    for (const l of log) { const m = /^scale\((.*?),/.exec(l); if (m) scales.push(Number(m[1])); }
  }
  assert.ok(Math.max(...scales) <= 1.35 + 1e-6, "never bigger than the start");
  assert.ok(Math.min(...scales) >= 1 - 1e-6, "never below 1 (no bounce)");
});

test("priceCompare: validation needs both prices and a new price below the old one", () => {
  assert.ok(Lib.validate(el({ value: 2000000 }), "pc").errors.some((e) => e.includes("menor")));
  assert.ok(Lib.validate(el({ oldValue: "" }), "pc").errors.some((e) => e.includes("anterior")));
  assert.deepEqual(Lib.validate(el(), "pc").errors, []);
});
