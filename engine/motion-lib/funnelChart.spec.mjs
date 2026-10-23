// Spec of funnelChart (imported by engine/motion-lib.test.mjs): monotonic exact count-up per stage, conversion %, sparse events and validation messages.
import test from "node:test";
import assert from "node:assert/strict";
import * as Lib from "./index.js";
import { recorder, env } from "./_testkit.mjs";
import { statText } from "../ui-motion.js";
import { conversionOf, FUN } from "./funnelChart.js";

const UNIT = { "": 1, K: 1e3, M: 1e6, B: 1e9 };
const numOf = (s) => { const m = /^(-?[\d,]*\.?\d+)([KMB]?)/.exec(s); assert.ok(m, `not a count text: ${s}`); return Number(m[1].replace(/,/g, "")) * UNIT[m[2]]; };
const isCount = (s) => /^-?[\d,]*\.?\d+[KMB]?$/.test(s);
/** Texts drawn at a given y (pre-transform coordinates, as the recorder logs them). */
const textsAtY = (log, y) => log.map((l) => /^fillText\((.*),([-\d.]+),([-\d.]+)\)$/.exec(l)).filter(Boolean).filter((m) => Number(m[3]) === y).map((m) => m[1]);
const countY = (i) => FUN.top + i * FUN.rowH + 72; // vertical middle of the stage bar: the count sits there
const pctY = (i) => FUN.top + i * FUN.rowH + 22; // the conversion sits on the stage's label row

const STAGES = [
  { label: "Visitas al sitio", value: 4800 },
  { label: "Pidieron información", value: 1260 },
  { label: "Agendaron cita", value: 310 },
  { label: "Compraron", value: 92 }
];

test("funnelChart: every stage counts up MONOTONICALLY and lands EXACTLY on its final count", () => {
  const el = { id: "f", type: "funnelChart", in: 0, out: 3.2, title: "Embudo", format: "int", stages: STAGES, source: { kind: "fictional" } };
  const prev = STAGES.map(() => -1);
  const last = STAGES.map(() => null);
  for (let t = 0.02; t < 3.18; t += 1 / 120) {
    const log = [];
    Lib.draw(recorder(log), el, t, env());
    STAGES.forEach((s, i) => {
      const c = textsAtY(log, countY(i)).filter(isCount);
      if (!c.length) return;
      const n = numOf(c[0]);
      assert.ok(n <= s.value + 1e-9, `${s.label}: showed ${c[0]} at t=${t.toFixed(2)} (above the final)`);
      assert.ok(n >= prev[i] - 1e-9, `${s.label}: went back down at t=${t.toFixed(2)}`);
      prev[i] = n;
      last[i] = c[0];
    });
  }
  STAGES.forEach((s, i) => assert.equal(last[i], statText({ value: s.value, format: "int" }, 1), `${s.label}: lands on its final count`));
});

test("funnelChart: conversion is each stage over the one before it (one decimal); none for the first stage", () => {
  assert.equal(conversionOf(STAGES, 0), null, "the first stage has no conversion");
  assert.equal(conversionOf(STAGES, 2), 24.6, "310 / 1260");
  assert.equal(conversionOf(STAGES, 3), 29.7, "92 / 310");
  assert.equal(conversionOf([{ value: 0 }, { value: 5 }], 1), null, "no conversion over a zero count");
  // the drawn conversion lands on its exact text
  const el = { id: "f", type: "funnelChart", in: 0, out: 3.2, title: "Embudo", format: "int", stages: STAGES, source: { kind: "fictional" } };
  const log = [];
  Lib.draw(recorder(log), el, 2.9 - 0.02, env());
  assert.equal(textsAtY(log, pctY(0)).filter((s) => s.endsWith("%")).length, 0, "no conversion text on the first stage");
  assert.ok(textsAtY(log, pctY(2)).includes(`${conversionOf(STAGES, 2)}%`), "stage 3 shows its conversion");
});

test("funnelChart: sparse SFX: one pop at the birth, never one per stage", () => {
  const el = Lib.sampleOf("funnelChart", {});
  const ev = Lib.events(el);
  assert.equal(ev.length, 1);
  assert.equal(ev[0].type, "pop");
});

test("funnelChart: validate gives Spanish messages (and warns when a stage is above the one before it)", () => {
  const base = Lib.sampleOf("funnelChart", {});
  assert.deepEqual(Lib.validate(base, "f").errors, []);
  assert.ok(Lib.validate({ ...base, stages: STAGES.slice(0, 2) }, "f").errors.some((m) => /de 3 a 5 etapas/.test(m)), "too few stages");
  assert.ok(Lib.validate({ ...base, stages: [...STAGES, ...STAGES] }, "f").errors.some((m) => /de 3 a 5 etapas/.test(m)), "too many stages");
  assert.ok(Lib.validate({ ...base, stages: [{ label: "", value: 1 }, ...STAGES.slice(1)] }, "f").errors.some((m) => /nombre/.test(m)), "stage without name");
  assert.ok(Lib.validate({ ...base, stages: [{ label: "A", value: "mucho" }, ...STAGES.slice(1)] }, "f").errors.some((m) => /cifra/.test(m)), "stage without number");
  assert.ok(Lib.validate({ ...base, format: "raro" }, "f").errors.some((m) => /formato/.test(m)), "unknown format");
  const longMoney = { ...base, format: "money", stages: [{ label: "Visitas", value: 3986811.18 }, { label: "Registros", value: 1000000 }, { label: "Compraron", value: 100000 }] };
  assert.ok(Lib.validate(longMoney, "f").errors.some((m) => /no cabe a la derecha/.test(m)), "a count that cannot fit right of its bar is an error");
  assert.ok(Lib.validate({ ...longMoney, format: "compact" }, "f").errors.length === 0, "the compact format fits");
  assert.ok(Lib.validate({ ...base, title: "" }, "f").errors.some((m) => /qué mide/.test(m)), "title required");
  const above = Lib.validate({ ...base, stages: [{ label: "A", value: 100 }, { label: "B", value: 150 }, { label: "C", value: 20 }] }, "f");
  assert.deepEqual(above.errors, []);
  assert.ok(above.warnings.some((m) => /100 %/.test(m)), "a stage above the one before it is a warning");
});
