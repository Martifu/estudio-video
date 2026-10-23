// Spec of sparkCard (imported by engine/motion-lib.test.mjs): count-up landing of the KPI value, sparkline drawing and validation messages.
import test from "node:test";
import assert from "node:assert/strict";
import * as Lib from "./index.js";
import { recorder, env } from "./_testkit.mjs";
import { statText } from "../ui-motion.js";

const UNIT = { "": 1, K: 1e3, M: 1e6, B: 1e9 };
const numOf = (s) => { const m = /^\$?(-?\d*\.?\d+)([KMB]?)$/.exec(s.replace(/,/g, "").replace(/%$/, "")); return m ? Number(m[1]) * UNIT[m[2]] : NaN; };
const NUMERIC = /^\$?-?[\d,]*\.?\d+[KMB]?%?$/;

test("sparkCard: the KPI value counts up MONOTONICALLY and lands EXACTLY on its final text", () => {
  for (const [value, format] of [[584000, "money"], [1284, "int"], [42.5, "pct"], [1200000, "compact"]]) {
    const el = { ...Lib.sampleOf("sparkCard", {}), in: 0, out: 3, value, format, delta: undefined };
    const final = statText({ value, format }, 1);
    let prev = -1, last = null, count = 0;
    for (let t = 0.02; t < 2.9; t += 1 / 60) {
      const log = [];
      Lib.draw(recorder(log), el, t, env());
      for (const l of log) {
        const m = /^fillText\((.*),(-?[\d.]+),(-?[\d.]+)\)$/.exec(l);
        if (!m || !NUMERIC.test(m[1]) || Number(m[3]) !== 214) continue;
        const n = numOf(m[1]);
        assert.ok(n <= numOf(final) + 1e-9, `${value}: showed ${m[1]} at t=${t.toFixed(2)} (above the final)`);
        assert.ok(n >= prev - 1e-9, `${value}: went back down at t=${t.toFixed(2)}`);
        prev = n; last = m[1]; count += 1;
      }
    }
    assert.ok(count > 0, `${value}: the value is drawn`);
    assert.equal(last, final, `${value}: lands exactly on ${final}`);
  }
});

test("sparkCard: the sparkline draws in from the left with its leading dot, and nothing numeric is drawn before the count", () => {
  const el = { ...Lib.sampleOf("sparkCard", {}), in: 0, out: 3 };
  const at = (t) => { const log = []; Lib.draw(recorder(log), el, t, env()); return log; };
  assert.ok(!at(0.1).some((l) => /^fillText\(\$?\d/.test(l)), "no count text before the count starts");
  const lineTo = (t) => at(t).filter((l) => l.startsWith("lineTo(")).length;
  // the baseline is one lineTo on its own: the sparkline adds more only after its beat starts
  const axisOnly = lineTo(0.3);
  assert.ok(lineTo(1.0) > axisOnly && lineTo(1.0) <= lineTo(1.5), "the sparkline grows after its beat starts");
  assert.ok(at(1.0).some((l) => l.startsWith("arc(")), "the leading dot is drawn");
});

test("sparkCard: one pop at the birth (and one at the change badge) and validation messages in Spanish", () => {
  const el = Lib.sampleOf("sparkCard", {});
  const ev = Lib.events(el, Lib.rect(el, { x0: 60, x1: 1020, toastTop: 350, bottom: 1540 }, env()));
  assert.ok(ev.length >= 1 && ev.length <= 2 && ev.every((e) => e.type === "pop"));
  const msgs = (patch) => Lib.validate({ ...el, ...patch }, "sparkCard").errors;
  assert.deepEqual(msgs({}), []);
  assert.ok(msgs({ label: "" }).some((m) => m.includes("necesita qué mide")));
  assert.ok(msgs({ value: "abc" }).some((m) => m.includes("necesita la cifra")));
  assert.ok(msgs({ series: [{ value: 1 }, { value: 2 }] }).some((m) => m.includes("necesita de 3 a 12 puntos")));
});
