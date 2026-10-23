// Spec of progressRing (imported by engine/motion-lib.test.mjs): the centre count is monotonic and lands exactly on the final percentage.
import test from "node:test";
import assert from "node:assert/strict";
import * as Lib from "./index.js";
import { recorder, env } from "./_testkit.mjs";
import { statText } from "../ui-motion.js";

const numOf = (s) => { const m = /^(-?[\d.]+)%$/.exec(s); assert.ok(m, `not a percentage: ${s}`); return Number(m[1]); };

test("progressRing: the centre count rises MONOTONICALLY and lands EXACTLY on the final percentage", () => {
  for (const value of [68.4, 100, 0, 7, 42]) {
    const el = { id: "r", type: "progressRing", in: 0, out: 2.8, label: "Avance", value, source: { kind: "fictional" } };
    const final = statText({ value, format: "pct" }, 1);
    let prev = -1, last = null;
    for (let t = 0.01; t < el.out; t += 1 / 120) {
      const log = [];
      Lib.draw(recorder(log), el, t, env());
      const hit = log.map((l) => /^fillText\((.*?),380,372\)$/.exec(l)).filter(Boolean).map((m) => m[1]);
      if (!hit.length) continue;
      const n = numOf(hit[0]);
      assert.ok(n <= value + 1e-9, `${value}: showed ${hit[0]} at t=${t.toFixed(2)} (above the final)`);
      assert.ok(n >= prev - 1e-9, `${value}: went back down at t=${t.toFixed(2)}`);
      prev = n; last = hit[0];
    }
    assert.equal(last, final, `${value}: lands exactly on ${final}`);
  }
});

test("progressRing: validate says what is wrong in plain Spanish", () => {
  const ok = { type: "progressRing", label: "Meta", value: 50, in: 0, out: 3 };
  assert.deepEqual(Lib.validate(ok, "r").errors, []);
  assert.match(Lib.validate({ ...ok, label: "" }, "r").errors.join("|"), /necesita qué mide/);
  assert.match(Lib.validate({ ...ok, value: undefined }, "r").errors.join("|"), /necesita el avance en número/);
  assert.match(Lib.validate({ ...ok, value: 120 }, "r").errors.join("|"), /el avance va de 0 a 100/);
});
