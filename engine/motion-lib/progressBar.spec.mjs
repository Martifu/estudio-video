// Spec of progressBar (imported by engine/motion-lib.test.mjs): the value count is monotonic and lands exactly; validate messages.
import test from "node:test";
import assert from "node:assert/strict";
import * as Lib from "./index.js";
import { recorder, env } from "./_testkit.mjs";
import { statText } from "../ui-motion.js";

const UNIT = { "": 1, K: 1e3, M: 1e6, B: 1e9 };
const numOf = (s) => { const m = /^\$?(-?[\d,]*\.?\d+)([KMB]?)/.exec(s); assert.ok(m, `not a count text: ${s}`); return Number(m[1].replace(/,/g, "")) * UNIT[m[2]]; };

test("progressBar: the value counts up MONOTONICALLY and lands EXACTLY on its final text", () => {
  for (const [value, format] of [[1231000, "money"], [128, "int"], [612000, "compact"], [0, "int"]]) {
    const el = { id: "p", type: "progressBar", in: 0, out: 2.8, label: "Meta", value, goal: 1800000, format, source: { kind: "fictional" } };
    const final = statText({ value, format }, 1);
    let prev = -1, last = null;
    for (let t = 0.01; t < el.out; t += 1 / 120) {
      const log = [];
      Lib.draw(recorder(log), el, t, env());
      const hit = log.map((l) => /^fillText\((.*?),56,186\)$/.exec(l)).filter(Boolean).map((m) => m[1]);
      if (!hit.length) continue;
      const n = numOf(hit[0]);
      assert.ok(n <= value + 1e-9, `${value}: showed ${hit[0]} at t=${t.toFixed(2)} (above the final)`);
      assert.ok(n >= prev - 1e-9, `${value}: went back down at t=${t.toFixed(2)}`);
      prev = n; last = hit[0];
    }
    assert.equal(last, final, `${value}: lands exactly on ${final}`);
  }
});

test("progressBar: validate says what is wrong in plain Spanish", () => {
  const ok = { type: "progressBar", label: "Ventas", value: 100, goal: 200, milestone: 150, in: 0, out: 3 };
  assert.deepEqual(Lib.validate(ok, "p").errors, []);
  assert.match(Lib.validate({ ...ok, label: "" }, "p").errors.join("|"), /necesita qué mide/);
  assert.match(Lib.validate({ ...ok, goal: 0 }, "p").errors.join("|"), /la meta debe ser una cifra mayor que cero/);
  assert.match(Lib.validate({ ...ok, value: -1 }, "p").errors.join("|"), /el avance debe ser una cifra de cero o más/);
  assert.match(Lib.validate({ ...ok, milestone: 300 }, "p").errors.join("|"), /el hito debe estar entre cero y la meta/);
  assert.match(Lib.validate({ ...ok, value: 250 }, "p").warnings.join("|"), /ya supera la meta/);
  assert.match(Lib.validate({ ...ok, milestone: 190 }, "p").warnings.join("|"), /el hito queda muy cerca de la meta/);
});
