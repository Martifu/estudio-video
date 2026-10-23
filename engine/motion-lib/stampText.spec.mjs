// Spec of stampText (imported by engine/motion-lib.test.mjs) + a purity scan of the Venta family.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import * as Lib from "./index.js";
import { recorder, env } from "./_testkit.mjs";
import { speckles } from "./_venta.js";

const el = (over = {}) => ({ id: "st", type: "stampText", in: 0, out: 2.4, text: "APARTADO", ...over });
const VENTA = ["priceTag", "priceCompare", "featureChecklist", "countdown", "compareTable", "planCards", "offerBadge", "stampText", "_venta"];

test("stampText: the ink texture is deterministic (same seed, same specks; always inside the box)", () => {
  assert.deepEqual(speckles("st", 70, 840, 260), speckles("st", 70, 840, 260));
  assert.notDeepEqual(speckles("st", 70, 840, 260), speckles("otro", 70, 840, 260));
  for (const s of speckles("st", 70, 840, 260)) assert.ok(s.x >= 0 && s.x <= 840 && s.y >= 0 && s.y <= 260 && s.r > 0 && s.a > 0 && s.a < 1);
});

test("stampText: the slam lands at scale 1 without overshoot (never below 1 after it hits)", () => {
  const scales = [];
  const design = (t) => t * 2.2 / 2.4; // the spec element runs 2.4 s; the design timeline is 2.2 s
  for (let t = 0; t < 2.4; t += 1 / 60) {
    const log = [];
    Lib.draw(recorder(log), el(), t, env());
    for (const l of log) { const m = /^scale\((.*?),/.exec(l); if (m) scales.push([design(t), Number(m[1])]); }
  }
  // the exit (design 1.95 s on) shrinks to 0.96 at most; before it the landing rules hold
  assert.ok(scales.filter(([d]) => d < 1.95).every(([, s]) => s >= 1 - 1e-6 && s <= 1.7 + 1e-6), "scale stays between 1 and 1.7 before the exit");
  assert.ok(scales.filter(([d]) => d > 0.2 && d < 1.95).every(([, s]) => Math.abs(s - 1) < 1e-6), "after the slam it is exactly 1");
  assert.ok(scales.filter(([d]) => d >= 1.95).every(([, s]) => s >= 0.96 - 1e-6 && s <= 1 + 1e-6), "the exit shrinks to 0.96 at most and never grows back");
});

test("stampText: validation asks for the word and warns on long words", () => {
  assert.ok(Lib.validate(el({ text: "" }), "st").errors.length === 1);
  assert.ok(Lib.validate(el({ text: "A".repeat(20) }), "st").warnings.length === 1);
});

test("the Venta family is pure: no Math.random, no Date, no Math.random-based seeds", () => {
  const dir = new URL("./", import.meta.url);
  for (const f of readdirSync(dir).filter((x) => VENTA.some((v) => x === `${v}.js`))) {
    const src = readFileSync(new URL(f, dir), "utf8");
    assert.ok(!/Math\.random|new Date|Date\.now/.test(src), `${f} uses a non-deterministic source`);
  }
});
