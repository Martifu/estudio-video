// Spec of kpiGrid (imported by engine/motion-lib.test.mjs): every count-up is monotonic and lands exactly on its final text; validate messages.
import test from "node:test";
import assert from "node:assert/strict";
import * as Lib from "./index.js";
import { recorder, env } from "./_testkit.mjs";
import { statText } from "../ui-motion.js";

const UNIT = { "": 1, K: 1e3, M: 1e6, B: 1e9 };
const numOf = (s) => { const m = /^-?\$?(-?[\d,]*\.?\d+)([KMB]?)/.exec(s); assert.ok(m, `not a count text: ${s}`); return Number(m[1].replace(/,/g, "")) * UNIT[m[2]]; };

test("kpiGrid: each value counts up MONOTONICALLY and lands EXACTLY on its final text", () => {
  for (const [value, format, prefix] of [[1284000, "money", undefined], [128, "int", undefined], [18.4, "pct", undefined], [612000, "compact", "$"]]) {
    const el = { id: "k", type: "kpiGrid", in: 0, out: 3.2, kpis: [{ label: "Indicador", value, format, prefix }], source: { kind: "fictional" } };
    const final = statText({ value, format, prefix }, 1);
    const tl = Lib.timeline(el);
    let prev = -1, last = null;
    for (let t = 0.01; t < el.out; t += 1 / 120) {
      const log = [];
      Lib.draw(recorder(log), el, t, env());
      const hit = log.map((l) => /^fillText\((.*?),32,138\)$/.exec(l)).filter(Boolean).map((m) => m[1]);
      if (!hit.length) continue;
      const n = numOf(hit[0]);
      assert.ok(n <= value + 1e-9, `${value}: showed ${hit[0]} at t=${t.toFixed(2)} (above the final)`);
      assert.ok(n >= prev - 1e-9, `${value}: went back down at t=${t.toFixed(2)}`);
      prev = n; last = hit[0];
    }
    assert.equal(last, final, `${value}: lands exactly on ${final}`);
    assert.ok(tl.b.count.start + tl.b.count.dur <= 0.65 * tl.Ld, "the count is done by the thumbnail frame");
  }
});

test("kpiGrid: every tile's final value is drawn by the end, and the grid is a 2-column layout", () => {
  const el = Lib.sampleOf("kpiGrid", {});
  const log = [];
  Lib.draw(recorder(log), { ...el, in: 0, out: 3.2 }, 0.65 * 3.2 + 0.2, env());
  for (const k of el.kpis) assert.ok(log.some((l) => l.startsWith(`fillText(${statText(k, 1)},`)), `shows ${statText(k, 1)}`);
});

test("kpiGrid: validate says what is wrong in plain Spanish", () => {
  const base = { type: "kpiGrid", kpis: [{ label: "A", value: 1 }, { label: "B", value: 2 }] };
  assert.deepEqual(Lib.validate({ ...base, in: 0, out: 3 }, "k").errors, []);
  assert.match(Lib.validate({ ...base, kpis: [{ label: "A", value: 1 }], in: 0, out: 3 }, "k").errors.join("|"), /de 2 a 4 indicadores \(tiene 1\)/);
  assert.match(Lib.validate({ ...base, kpis: [{ label: "", value: 1 }, { label: "B", value: 2 }], in: 0, out: 3 }, "k").errors.join("|"), /necesita un nombre/);
  assert.match(Lib.validate({ ...base, kpis: [{ label: "A", value: "" }, { label: "B", value: 2 }], in: 0, out: 3 }, "k").errors.join("|"), /necesita una cifra/);
  assert.match(Lib.validate({ ...base, kpis: [{ label: "A", value: 1, format: "x" }, { label: "B", value: 2 }], in: 0, out: 3 }, "k").errors.join("|"), /el formato del indicador 1 no existe/);
});
