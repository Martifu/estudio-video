// Spec of uiStat (imported by engine/motion-lib.test.mjs).
import test from "node:test";
import assert from "node:assert/strict";
import * as Lib from "./index.js";
import { recorder, env } from "./_testkit.mjs";

test("uiStat: the number rolls up MONOTONICALLY and lands exactly on the final value (never above it, never back down)", () => {
  for (const [value, format] of [[342, "int"], [1284, "int"], [99, "int"], [5000, "int"], [7, "int"], [100, "int"], [3986811.18, "money"], [42.5, "pct"]]) {
    const el = { id: "s", type: "uiStat", in: 0, out: 4, label: "x", value, format };
    const final = Lib.timeline(el) && (format === "money" ? "$3,986,811.18" : format === "pct" ? "42.5%" : Number(value).toLocaleString("en-US"));
    let prev = -1, last = null;
    for (let t = 0.05; t < 3.95; t += 1 / 60) {
      const log = [];
      Lib.draw(recorder(log), el, t, env());
      const big = log.map((l) => /^fillText\((.*?),56,236\)$/.exec(l)).filter(Boolean).map((m) => m[1]);
      if (!big.length) continue;
      const n = Number(big[0].replace(/[$,%]/g, ""));
      assert.ok(n <= value + 1e-9, `${value}: showed ${n} at t=${t.toFixed(2)} (above the final)`);
      assert.ok(n >= prev - 1e-9, `${value}: went back down from ${prev} to ${n} at t=${t.toFixed(2)}`);
      prev = n; last = big[0];
    }
    assert.equal(last, final, `${value}: lands exactly on ${final}`);
  }
});
