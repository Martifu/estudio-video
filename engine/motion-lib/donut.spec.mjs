// Spec of donut (imported by engine/motion-lib.test.mjs): sequential segment wipes, count-up of the centre total and of the legend shares, validation.
import test from "node:test";
import assert from "node:assert/strict";
import * as Lib from "./index.js";
import { recorder, env } from "./_testkit.mjs";
import { statText } from "../ui-motion.js";

const UNIT = { "": 1, K: 1e3, M: 1e6, B: 1e9 };
const numOf = (s) => { const m = /^\$?(-?\d*\.?\d+)([KMB]?)$/.exec(s.replace(/,/g, "").replace(/%$/, "")); return m ? Number(m[1]) * UNIT[m[2]] : NaN; };
const NUMERIC = /^\$?-?[\d,]*\.?\d+[KMB]?%?$/;

/** Numeric texts of the element over its window, grouped by y (one group per drawn number). */
function numericByRow(el, step = 1 / 60) {
  const rows = new Map();
  for (let t = 0.02; t < el.out - 0.05; t += step) {
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

test("donut: the centre total and every legend share count up MONOTONICALLY and land EXACTLY on their final text", () => {
  const el = { ...Lib.sampleOf("donut", {}), in: 0, out: 3 };
  const rows = numericByRow(el);
  const total = el.rows.reduce((s, r) => s + r.value, 0);
  const finals = [statText({ value: total, format: el.format ?? "compact", prefix: el.prefix, suffix: el.suffix }, 1), ...el.rows.map((r) => `${((r.value / total) * 100).toFixed(1)}%`)];
  assert.equal(rows.size, 1 + el.rows.length, "one group for the total and one per legend row");
  for (const seq of rows.values()) {
    let prev = -1;
    const target = numOf(seq.at(-1).text);
    for (const { t, text } of seq) {
      const n = numOf(text);
      assert.ok(n <= target + 1e-9, `showed ${text} at t=${t.toFixed(2)} (above the final)`);
      assert.ok(n >= prev - 1e-9, `went back down at t=${t.toFixed(2)} (${text})`);
      prev = n;
    }
  }
  const lastTexts = [...rows.values()].map((seq) => seq.at(-1).text);
  for (const f of finals) assert.ok(lastTexts.includes(f), `lands exactly on ${f} (drawn: ${lastTexts.join(" | ")})`);
});

test("donut: segments wipe in sequence (the second starts after the first has begun) and nothing is drawn before the track fades", () => {
  const el = { ...Lib.sampleOf("donut", {}), in: 0, out: 3 };
  const arcsAt = (t) => { const log = []; Lib.draw(recorder(log), el, t, env()); return log.filter((l) => l.startsWith("arc(")); };
  assert.equal(arcsAt(0.02).length, 0, "nothing before the track fades in");
  const first = arcsAt(0.6).length, later = arcsAt(1.2).length;
  assert.ok(later >= first && first > 0, "arcs appear one after another");
});

test("donut: a pop at the birth and one when the last segment lands (sparse events)", () => {
  const el = Lib.sampleOf("donut", {});
  const ev = Lib.events(el, Lib.rect(el, { x0: 60, x1: 1020, toastTop: 350, bottom: 1540 }, env()));
  assert.equal(ev.length, 2);
  assert.ok(ev.every((e) => e.type === "pop"));
});

test("donut: validate says what is wrong in plain Spanish", () => {
  const base = Lib.sampleOf("donut", {});
  const msgs = (patch) => Lib.validate({ ...base, ...patch }, "donut").errors;
  assert.deepEqual(msgs({}), []);
  assert.ok(msgs({ rows: [{ label: "A", value: 1 }] }).some((m) => m.includes("necesita de 2 a 5 filas")));
  assert.ok(msgs({ rows: [{ label: "", value: 1 }, { label: "B", value: 2 }] }).some((m) => m.includes("cada fila necesita un nombre")));
  assert.ok(msgs({ rows: [{ label: "A", value: 0 }, { label: "B", value: 0 }] }).some((m) => m.includes("al menos una cifra debe ser mayor que cero")));
  assert.ok(msgs({ title: "" }).some((m) => m.includes("necesita qué mide")));
});
