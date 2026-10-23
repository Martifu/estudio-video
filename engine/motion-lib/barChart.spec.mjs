// Spec of barChart (imported by engine/motion-lib.test.mjs): count-up landing, sparse events and validation messages.
import test from "node:test";
import assert from "node:assert/strict";
import * as Lib from "./index.js";
import { recorder, env } from "./_testkit.mjs";
import { countUp } from "./_charts.js";
import { statText, resolveSkin } from "../ui-motion.js";

const UNIT = { "": 1, K: 1e3, M: 1e6, B: 1e9 };
/** Numeric value of a count-up text in raw units ("$612K" -> 612000, "1.2M" -> 1200000, "42.5%" -> 42.5, "7 citas" -> 7). */
const numOf = (s) => { const m = /^\$?(-?[\d,]*\.?\d+)([KMB]?)/.exec(s); assert.ok(m, `not a count text: ${s}`); return Number(m[1].replace(/,/g, "")) * UNIT[m[2]]; };

const CASES = [
  [{ value: 342, format: "int" }, "342"],
  [{ value: 1284, format: "int" }, "1,284"],
  [{ value: 3986811.18, format: "money" }, "$3,986,811.18"],
  [{ value: 42.5, format: "pct" }, "42.5%"],
  [{ value: 612000, format: "compact", prefix: "$" }, "$612K"],
  [{ value: 1200000, format: "compact" }, "1.2M"],
  [{ value: 7, format: "int", suffix: " citas" }, "7 citas"]
];

test("barChart: every value counts up MONOTONICALLY and lands EXACTLY on its final text (never above, never back down)", () => {
  for (const [fe, final] of CASES) {
    assert.equal(statText(fe, 1), final, `${fe.value}: final text`);
    assert.equal(countUp(fe, 1), final, `${fe.value}: countUp(1) is the final text`);
    assert.equal(countUp(fe, 0), "", `${fe.value}: nothing before the count starts`);
    assert.equal(countUp(fe, -0.2), "", `${fe.value}: nothing before the count starts (negative k)`);
    const target = numOf(final);
    let prev = -1;
    for (let k = 0.001; k < 1; k += 1 / 240) {
      const s = countUp(fe, k);
      const n = numOf(s);
      assert.ok(n <= target + 1e-9, `${fe.value}: showed ${s} at k=${k.toFixed(3)} (above the final)`);
      assert.ok(n >= prev - 1e-9, `${fe.value}: went back down at k=${k.toFixed(3)} (${prev} -> ${n})`);
      prev = n;
    }
    assert.equal(countUp(fe, 1), final);
  }
});

test("barChart: the drawn value labels end on the exact final text for every row", () => {
  const el = Lib.sampleOf("barChart", {});
  const tl = Lib.timeline(el);
  const finals = el.rows.map((r) => statText({ value: r.value, format: el.format, prefix: el.prefix, suffix: el.suffix }, 1));
  const ts = tl.Ld * 0.9; // after every count has landed (the last count ends before the pulse)
  const log = [];
  Lib.draw(recorder(log), { ...el, in: 0, out: tl.Ld }, ts, env());
  for (const f of finals) assert.ok(log.some((l) => l.startsWith(`fillText(${f},`)), `shows the exact final text ${f}`);
});

test("barChart: no count text before the count starts, and the bars grow staggered (first bar ahead of the second)", () => {
  const el = { id: "b", type: "barChart", in: 0, out: 3, title: "Ventas", format: "int", rows: [{ label: "A", value: 10 }, { label: "B", value: 20 }], source: { kind: "fictional" } };
  const at = (t) => { const log = []; Lib.draw(recorder(log), el, t, env()); return log; };
  assert.ok(!at(0.2).some((l) => /^fillText\(\d/.test(l)), "no count text before the count starts");
  // bars are the roundRect calls narrower than the card (x, y, w, h): their heights grow with time
  const heights = (t) => at(t).filter((l) => l.startsWith("roundRect(")).map((l) => l.slice(10).split(",")).filter((a) => Number(a[2]) < 200).map((a) => Number(a[3]));
  const h1 = heights(1.0), h2 = heights(2.0), h3 = heights(2.9);
  assert.equal(h1.length, 2, "two bars drawn at 1.0 s");
  assert.ok(h2[0] >= h1[0] && h2[1] >= h1[1], "bars never shrink while they grow");
  assert.ok(Math.abs(h3[1] / h3[0] - 2) < 1e-6, "settled bars are proportional to their values (20 vs 10)");
  assert.equal(heights(0.05).length, 0, "nothing drawn before the stagger starts");
});

test("barChart: one pop at the birth and at most one more (sparse events, never one per bar)", () => {
  const el = Lib.sampleOf("barChart", {});
  const ev = Lib.events(el, Lib.rect(el, { x0: 60, x1: 1020, toastTop: 350, bottom: 1540 }, env()));
  assert.ok(ev.length >= 1 && ev.length <= 2, `events: ${ev.length}`);
  assert.equal(ev[0].type, "pop");
  assert.ok(ev.every((e) => e.type === "pop"));
});

test("barChart: the highlight pulses once and is drawn in the accent colour; the other bars are solid primary", () => {
  const el = { id: "b", type: "barChart", in: 0, out: 3, title: "Ventas", format: "int", highlight: 1, rows: [{ label: "A", value: 10 }, { label: "B", value: 20 }], source: { kind: "fictional" } };
  const skin = resolveSkin(null, { colors: { primary: "#80BC00", accent_on_paper: "#5E17EB" } });
  const log = [];
  Lib.draw(recorder(log), el, 2.1, env({ skin }));
  assert.ok(log.includes("fillStyle=#5E17EB"), "highlight bar in the accent colour");
  assert.ok(log.some((l) => l.startsWith("fillStyle=#80BC00")), "the other bars are solid primary (no pale tint for data)");
});

test("barChart: validate gives Spanish messages", () => {
  const base = Lib.sampleOf("barChart", {});
  assert.deepEqual(Lib.validate(base, "b").errors, []);
  const one = { ...base, rows: [{ label: "A", value: 5 }] };
  assert.ok(Lib.validate(one, "b").errors.some((m) => /de 2 a 6 filas/.test(m)), "too few rows");
  const seven = { ...base, rows: Array.from({ length: 7 }, (_, i) => ({ label: `M${i}`, value: i + 1 })) };
  assert.ok(Lib.validate(seven, "b").errors.some((m) => /de 2 a 6 filas/.test(m)), "too many rows");
  const noName = { ...base, rows: [{ label: "", value: 1 }, { label: "B", value: 2 }] };
  assert.ok(Lib.validate(noName, "b").errors.some((m) => /nombre/.test(m)), "row without name");
  const badVal = { ...base, rows: [{ label: "A", value: "mucho" }, { label: "B", value: 2 }] };
  assert.ok(Lib.validate(badVal, "b").errors.some((m) => /cifra/.test(m)), "row without number");
  const neg = { ...base, rows: [{ label: "A", value: -4 }, { label: "B", value: 2 }] };
  assert.ok(Lib.validate(neg, "b").errors.some((m) => /negativas/.test(m)), "negative values");
  const zero = { ...base, rows: [{ label: "A", value: 0 }, { label: "B", value: 0 }] };
  assert.ok(Lib.validate(zero, "b").errors.some((m) => /mayor que cero/.test(m)), "all zero");
  assert.ok(Lib.validate({ ...base, highlight: 9 }, "b").errors.some((m) => /resalta no existe/.test(m)), "highlight out of range");
  assert.ok(Lib.validate({ ...base, format: "raro" }, "b").errors.some((m) => /formato/.test(m)), "unknown format");
  assert.ok(Lib.validate({ ...base, title: "" }, "b").errors.some((m) => /qué mide/.test(m)), "title required");
});
