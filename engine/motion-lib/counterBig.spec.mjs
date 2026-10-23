// Spec of counterBig (imported by engine/motion-lib.test.mjs): monotonic exact count-up, nothing before the count, validation messages.
import test from "node:test";
import assert from "node:assert/strict";
import * as Lib from "./index.js";
import { recorder, env } from "./_testkit.mjs";
import { statText } from "../ui-motion.js";
import { BIG } from "./counterBig.js";

const UNIT = { "": 1, K: 1e3, M: 1e6, B: 1e9 };
const numOf = (s) => { const m = /^\$?(-?[\d,]*\.?\d+)([KMB]?)/.exec(s); assert.ok(m, `not a count text: ${s}`); return Number(m[1].replace(/,/g, "")) * UNIT[m[2]]; };
const isCount = (s) => /^\$?-?[\d,]*\.?\d+/.test(s);
/** Texts drawn at the centre x of the card (pre-transform coordinates, as the recorder logs them). */
const bigTexts = (log) => log.map((l) => /^fillText\((.*),([-\d.]+),([-\d.]+)\)$/.exec(l)).filter(Boolean).filter((m) => Number(m[2]) === BIG.w / 2).map((m) => m[1]);

const CASES = [
  [{ value: 32, format: "int" }, "32"],
  [{ value: 1234567, format: "money" }, "$1,234,567"],
  [{ value: 42.5, format: "pct" }, "42.5%"],
  [{ value: 7, format: "int", suffix: " unidades" }, "7 unidades"],
  [{ value: 612000, format: "compact", prefix: "$" }, "$612K"]
];

test("counterBig: the number rolls up MONOTONICALLY and lands EXACTLY on its final text (never above, never back down)", () => {
  for (const [fe, final] of CASES) {
    assert.equal(statText(fe, 1), final, `${fe.value}: final text`);
    const el = { id: "k", type: "counterBig", in: 0, out: 2.4, label: "unidades disponibles", ...fe };
    let prev = -1, last = null;
    for (let t = 0.02; t < 2.38; t += 1 / 120) {
      const log = [];
      Lib.draw(recorder(log), el, t, env());
      const shown = bigTexts(log).filter(isCount);
      if (!shown.length) continue;
      const n = numOf(shown[0]);
      assert.ok(n <= numOf(final) + 1e-9, `${final}: showed ${shown[0]} at t=${t.toFixed(2)} (above the final)`);
      assert.ok(n >= prev - 1e-9, `${final}: went back down at t=${t.toFixed(2)}`);
      prev = n;
      last = shown[0];
    }
    assert.equal(last, final, `${final}: lands exactly on the final text`);
  }
});

test("counterBig: nothing is drawn for the number before the count starts", () => {
  const el = { id: "k", type: "counterBig", in: 0, out: 2.4, value: 32, format: "int", label: "unidades disponibles" };
  const log = [];
  Lib.draw(recorder(log), el, 0.1, env());
  assert.equal(bigTexts(log).filter(isCount).length, 0);
});

test("counterBig: validate gives Spanish messages", () => {
  const base = Lib.sampleOf("counterBig", {});
  assert.deepEqual(Lib.validate(base, "k").errors, []);
  assert.ok(Lib.validate({ ...base, label: "" }, "k").errors.some((m) => /qué cuenta/.test(m)), "label required");
  assert.ok(Lib.validate({ ...base, value: "mucho" }, "k").errors.some((m) => /cifra/.test(m)), "value must be a number");
  assert.ok(Lib.validate({ ...base, format: "raro" }, "k").errors.some((m) => /formato/.test(m)), "unknown format");
  assert.ok(Lib.validate({ ...base, prefix: "MXN ", suffix: " al mes" }, "k").warnings.some((m) => /largo/.test(m)), "long prefix/suffix warns");
  assert.ok(Lib.validate({ ...base, value: 3986811.18, format: "money" }, "k").errors.some((m) => /muy larga/.test(m)), "a number too long for the card is an error");
  assert.deepEqual(Lib.validate({ ...base, value: 1234567, format: "money" }, "k").errors, [], "a 7-digit money number fits");
});
