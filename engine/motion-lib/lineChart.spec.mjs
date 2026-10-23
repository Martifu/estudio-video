// Spec of lineChart (imported by engine/motion-lib.test.mjs): count-up landing of the final callout, sparse events and validation messages.
import test from "node:test";
import assert from "node:assert/strict";
import * as Lib from "./index.js";
import { recorder, env } from "./_testkit.mjs";
import { statText } from "../ui-motion.js";

const UNIT = { "": 1, K: 1e3, M: 1e6, B: 1e9 };
const numOf = (s) => { const m = /^(-?\d*\.?\d+)([KMB]?)$/.exec(s.replace(/[$,%]/g, "")); return m ? Number(m[1]) * UNIT[m[2]] : NaN; };
const NUMERIC = /^\$?-?[\d,]*\.?\d+[KMB]?%?$/;
/** Numeric texts drawn over the element window, grouped by their y coordinate: Map<y, [{ t, text }]>. */
function numericByRow(el, step = 1 / 60) {
  const rows = new Map();
  for (let t = el.in; t < el.out; t += step) {
    const log = [];
    Lib.draw(recorder(log), el, t, env());
    for (const l of log) {
      const m = /^fillText\((.*),(-?[\d.]+),(-?[\d.]+)\)$/.exec(l);
      if (!m || !NUMERIC.test(m[1])) continue;
      if (!rows.has(m[3])) rows.set(m[3], []);
      rows.get(m[3]).push({ t, text: m[1] });
    }
  }
  return rows;
}

test("lineChart: the final callout counts up MONOTONICALLY and lands EXACTLY on the final value", () => {
  const el = { ...Lib.sampleOf("lineChart", {}), in: 0, out: 4 };
  const final = statText({ value: el.rows.at(-1).value, format: el.format, prefix: el.prefix, suffix: el.suffix }, 1);
  const rows = numericByRow(el);
  assert.equal(rows.size, 1, "one numeric text (the callout) is drawn");
  const seq = [...rows.values()][0];
  let prev = -1;
  for (const { t, text } of seq) {
    const n = numOf(text);
    assert.ok(n <= numOf(final) + 1e-9, `showed ${text} at t=${t.toFixed(2)} (above the final)`);
    assert.ok(n >= prev - 1e-9, `went back down at t=${t.toFixed(2)} (${prev} -> ${n})`);
    prev = n;
  }
  assert.equal(seq.at(-1).text, final, `lands exactly on ${final}`);
});

test("lineChart: nothing numeric before the callout starts; the line is drawn left to right with its leading dot", () => {
  const el = { ...Lib.sampleOf("lineChart", {}), in: 0, out: 4 };
  const at = (t) => { const log = []; Lib.draw(recorder(log), el, t, env()); return log; };
  assert.ok(!at(0.3).some((l) => /^fillText\(\$?[\d]/.test(l)), "no count text early on");
  const lineTo = (t) => at(t).filter((l) => l.startsWith("lineTo(")).length;
  assert.ok(lineTo(0.6) < lineTo(1.2) && lineTo(1.2) <= lineTo(1.7), "the polyline grows over time");
  assert.ok(at(0.8).some((l) => l.startsWith("arc(")), "the leading dot is drawn while the line runs");
});

test("lineChart: a birth pop and one pop at the callout (sparse events)", () => {
  const el = Lib.sampleOf("lineChart", {});
  const ev = Lib.events(el, Lib.rect(el, { x0: 60, x1: 1020, toastTop: 350, bottom: 1540 }, env()));
  assert.equal(ev.length, 2);
  assert.ok(ev.every((e) => e.type === "pop"));
});

test("lineChart: validate says what is wrong in plain Spanish", () => {
  const base = Lib.sampleOf("lineChart", {});
  const msgs = (patch) => Lib.validate({ ...base, ...patch }, "lineChart").errors;
  assert.deepEqual(msgs({}), []);
  assert.ok(msgs({ rows: [{ label: "Ene", value: 1 }] }).some((m) => m.includes("necesita de 2 a 12 filas")));
  assert.ok(msgs({ title: "" }).some((m) => m.includes("necesita qué mide")));
  assert.ok(msgs({ rows: [{ label: "Ene", value: 1 }, { label: "Feb", value: -4 }] }).some((m) => m.includes("no pueden ser negativas")));
  assert.ok(msgs({ format: "raro" }).some((m) => m.includes("el formato no existe")));
});
