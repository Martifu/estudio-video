// Spec of comparisonBars (imported by engine/motion-lib.test.mjs): monotonic exact count-up, the winner, sparse events and validation messages.
import test from "node:test";
import assert from "node:assert/strict";
import * as Lib from "./index.js";
import { recorder, env } from "./_testkit.mjs";
import { statText, resolveSkin } from "../ui-motion.js";
import { winnerOf } from "./comparisonBars.js";

const UNIT = { "": 1, K: 1e3, M: 1e6, B: 1e9 };
/** Numeric value of a count-up text in raw units ("$612K" -> 612000, "$3,986,811.18" -> 3986811.18, "31" -> 31). */
const numOf = (s) => { const m = /^\$?(-?[\d,]*\.?\d+)([KMB]?)/.exec(s); assert.ok(m, `not a count text: ${s}`); return Number(m[1].replace(/,/g, "")) * UNIT[m[2]]; };
const isCount = (s) => /^\$?-?[\d,]*\.?\d+[KMB]?$/.test(s);
/** Texts drawn at the x of one column (pre-transform coordinates, as the recorder logs them). */
const textsAt = (log, x) => log.map((l) => /^fillText\((.*),([-\d.]+),([-\d.]+)\)$/.exec(l)).filter(Boolean).filter((m) => Number(m[2]) === x).map((m) => m[1]);
const columnX = (i, n) => Math.round((56 + ((900 - 112) / n) * (i + 0.5)) * 100) / 100;

test("comparisonBars: every value counts up MONOTONICALLY and lands EXACTLY on its final text (never above, never back down)", () => {
  const rows = [{ label: "Antes", value: 3986811.18 }, { label: "Ahora", value: 412000 }, { label: "Después", value: 1284000 }];
  const el = { id: "c", type: "comparisonBars", in: 0, out: 3, title: "Ventas", format: "money", winner: 2, rows, source: { kind: "fictional" } };
  const finals = rows.map((r) => statText({ value: r.value, format: "money" }, 1));
  const prev = rows.map(() => -1);
  const last = rows.map(() => null);
  for (let t = 0.02; t < 2.98; t += 1 / 120) {
    const log = [];
    Lib.draw(recorder(log), el, t, env());
    rows.forEach((r, i) => {
      const s = textsAt(log, columnX(i, rows.length)).filter(isCount);
      if (!s.length) return;
      const n = numOf(s[0]);
      assert.ok(n <= r.value + 1e-9, `${r.label}: showed ${s[0]} at t=${t.toFixed(2)} (above the final)`);
      assert.ok(n >= prev[i] - 1e-9, `${r.label}: went back down from ${prev[i]} to ${n} at t=${t.toFixed(2)}`);
      prev[i] = n;
      last[i] = s[0];
    });
  }
  rows.forEach((r, i) => assert.equal(last[i], finals[i], `${r.label}: lands exactly on ${finals[i]}`));
});

test("comparisonBars: nothing is counted before the count starts", () => {
  const el = { id: "c", type: "comparisonBars", in: 0, out: 3, title: "Cierres", format: "int", rows: [{ label: "Antes", value: 12 }, { label: "Ahora", value: 31 }], source: { kind: "fictional" } };
  const log = [];
  Lib.draw(recorder(log), el, 0.1, env());
  assert.equal(textsAt(log, columnX(0, 2)).filter(isCount).length, 0);
  assert.equal(textsAt(log, columnX(1, 2)).filter(isCount).length, 0);
});

test("comparisonBars: the winner is the highlighted bar (accent); the others are a solid muted neutral", () => {
  const skin = resolveSkin(null, { colors: { primary: "#80BC00", accent_on_paper: "#5E17EB" } });
  const el = { id: "c", type: "comparisonBars", in: 0, out: 3, title: "Cierres", format: "int", winner: 1, rows: [{ label: "Antes", value: 12 }, { label: "Con nosotros", value: 31 }], source: { kind: "fictional" } };
  const log = [];
  Lib.draw(recorder(log), el, 2.0, env({ skin }));
  assert.ok(log.includes("fillStyle=#5E17EB"), "winner bar and value in the accent colour");
  assert.ok(log.includes(`fillStyle=${skin.colors.muted}`), "the other bar is the solid muted neutral (not a pale tint)");
  // without an explicit winner the highest value wins; an explicit winner always wins
  assert.equal(winnerOf({ ...el, winner: undefined, rows: [{ label: "a", value: 5 }, { label: "b", value: 9 }, { label: "c", value: 3 }] }), 1);
  assert.equal(winnerOf({ ...el, winner: 0 }), 0);
});

test("comparisonBars: sparse SFX: a pop at the birth and at most one at the winner pulse (never one per bar)", () => {
  const el = Lib.sampleOf("comparisonBars", {});
  const ev = Lib.events(el);
  assert.ok(ev.length >= 1 && ev.length <= 2, `events: ${ev.length}`);
  assert.ok(ev.every((e) => e.type === "pop"));
});

test("comparisonBars: validate gives Spanish messages", () => {
  const base = Lib.sampleOf("comparisonBars", {});
  assert.deepEqual(Lib.validate(base, "c").errors, []);
  assert.ok(Lib.validate({ ...base, rows: [{ label: "A", value: 5 }] }, "c").errors.some((m) => /de 2 a 4 filas/.test(m)), "too few rows");
  assert.ok(Lib.validate({ ...base, rows: Array.from({ length: 5 }, (_, i) => ({ label: `M${i}`, value: i + 1 })) }, "c").errors.some((m) => /de 2 a 4 filas/.test(m)), "too many rows");
  assert.ok(Lib.validate({ ...base, rows: [{ label: "", value: 1 }, { label: "B", value: 2 }] }, "c").errors.some((m) => /nombre/.test(m)), "row without name");
  assert.ok(Lib.validate({ ...base, rows: [{ label: "A", value: "mucho" }, { label: "B", value: 2 }] }, "c").errors.some((m) => /cifra/.test(m)), "row without number");
  assert.ok(Lib.validate({ ...base, rows: [{ label: "A", value: -4 }, { label: "B", value: 2 }] }, "c").errors.some((m) => /negativas/.test(m)), "negative values");
  assert.ok(Lib.validate({ ...base, winner: 9 }, "c").errors.some((m) => /ganadora no existe/.test(m)), "winner out of range");
  const wide = { ...base, format: "money", rows: [1, 2, 3, 4].map((i) => ({ label: `T${i}`, value: 3986811.18 })) };
  assert.ok(Lib.validate(wide, "c").errors.some((m) => /no cabe en 4 barras/.test(m)), "a label that cannot fit its slot at 48 px is an error");
  assert.ok(Lib.validate({ ...wide, format: "compact" }, "c").errors.length === 0, "the compact format fits");
  assert.ok(Lib.validate({ ...base, format: "raro" }, "c").errors.some((m) => /formato/.test(m)), "unknown format");
  assert.ok(Lib.validate({ ...base, title: "" }, "c").errors.some((m) => /qué compara/.test(m)), "title required");
});
