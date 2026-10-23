// Spec of the "Personas" group (avatarCircle, avatarStack, socialProof, testimonial, rating); imported by engine/motion-lib.test.mjs.
import test from "node:test";
import assert from "node:assert/strict";
import * as Lib from "./index.js";
import { recorder, env } from "./_testkit.mjs";
import { countAt, scoreAt } from "./_personas.js";

const drawLog = (el, t) => { const log = []; Lib.draw(recorder(log), el, t, env()); return log; };

test("Personas: count-ups are monotonic and land exactly on the final value (never above it)", () => {
  for (const final of [1, 3, 120, 1240, 98765]) {
    let prev = -1;
    for (let k = 0; k <= 1.0001; k += 1 / 240) {
      const v = countAt(final, k);
      assert.ok(v <= final && v >= prev, `countAt(${final}, ${k.toFixed(3)}) = ${v}`);
      prev = v;
    }
    assert.equal(countAt(final, 1), final);
  }
  for (const score of [0, 4.8, 3.5, 5, 4.2]) {
    let prev = -1;
    for (let k = 0; k <= 1.0001; k += 1 / 240) {
      const v = Number(scoreAt(score, k));
      assert.ok(v <= score + 1e-9 && v >= prev - 1e-9, `scoreAt(${score}, ${k.toFixed(3)}) = ${v}`);
      prev = v;
    }
    assert.equal(scoreAt(score, 1), score.toFixed(1));
  }
});

test("avatarStack: 3 to 6 photos, a count and a label are required; the count is marked as illustrative until its source is set", () => {
  const item = (i) => ({ avatar: `people:p0${i}`, name: "X" });
  const base = { type: "avatarStack", in: 0, out: 4, label: "clientes felices", count: 120 };
  assert.match(Lib.validate({ ...base, items: [item(1), item(2)] }).errors.join(" "), /de 3 a 6 fotos/);
  assert.match(Lib.validate({ ...base, items: [1, 2, 3, 4, 5, 6, 7].map(item) }).errors.join(" "), /de 3 a 6 fotos/);
  assert.match(Lib.validate({ ...base, count: undefined, items: [1, 2, 3].map(item) }).errors.join(" "), /número que cuenta/);
  const ok = Lib.validate({ ...base, items: [1, 2, 3].map(item), source: { kind: "reda" } });
  assert.deepEqual(ok.errors, []);
  assert.deepEqual(ok.warnings, []);
  assert.ok(Lib.validate({ ...base, items: [1, 2, 3].map(item) }).warnings.some((w) => /ilustrativo/.test(w)));
});

test("testimonial: more than 25 words is a warning, not an error; an empty quote is an error", () => {
  const base = { type: "testimonial", in: 0, out: 5, name: "Luis", stars: 5 };
  const short = "Nos encontró el departamento en dos semanas y nos acompañó hasta la firma.";
  assert.deepEqual(Lib.validate({ ...base, quote: short }).warnings, []);
  const long = Array.from({ length: 30 }, (_, i) => `palabra${i}`).join(" ");
  const r = Lib.validate({ ...base, quote: long });
  assert.deepEqual(r.errors, []);
  assert.ok(r.warnings.some((w) => /30 palabras/.test(w)));
  assert.ok(Lib.validate({ ...base, quote: "" }).errors.some((e) => /texto del testimonio/.test(e)));
});

test("rating: the score must be 0 to 5; the stars and count land on the score, halves allowed", () => {
  const el = { type: "rating", in: 0, out: 3.5, score: 4.8, reviews: 1240, source: { kind: "reda" } };
  assert.deepEqual(Lib.validate(el).errors, []);
  assert.ok(Lib.validate({ ...el, score: 6 }).errors.some((e) => /de 0 a 5/.test(e)));
  assert.ok(Lib.validate({ ...el, reviews: -2 }).errors.some((e) => /negativo/.test(e)));
  const end = drawLog(el, 3.2).join("\n");
  assert.match(end, /fillText\(4\.8,/);
  assert.match(end, /fillText\(\(1,240 reseñas\),/);
  // no review count when it is not given
  assert.doesNotMatch(drawLog({ ...el, reviews: undefined }, 3.2).join("\n"), /reseñas/);
});

test("socialProof: the list cycles one item after another; each item is on screen in its own window", () => {
  const el = {
    type: "socialProof", in: 0, out: 9, side: "right", slot: "top",
    items: [
      { text: "Ana de Monterrey apartó la 302", time: "hace 3 min" },
      { text: "Luis de Puebla pidió una cita", time: "hace 8 min" },
      { text: "Carmen cotizó el departamento 504", time: "hace 12 min" }
    ]
  };
  const at = (i) => {
    // design time of item i is lead 0.3 + i * 2.4 plus the middle of its hold; scale it to the video window
    const tl = Lib.timeline(el);
    return el.in + (0.3 + i * 2.4 + 1.2) * tl.D / tl.Ld;
  };
  for (let i = 0; i < 3; i += 1) {
    const log = drawLog(el, at(i)).join("\n");
    assert.ok(log.includes(el.items[i].text.slice(0, 12)), `item ${i} visible at its window`);
    for (let j = 0; j < 3; j += 1) if (j !== i) assert.ok(!log.includes(el.items[j].text.slice(0, 12)), `item ${j} not visible during item ${i}`);
  }
  assert.ok(Lib.validate({ ...el, items: [] }).errors.some((e) => /al menos un aviso/.test(e)));
  assert.ok(Lib.validate({ ...el, items: [{ time: "hace 1 min" }] }).errors.some((e) => /necesita texto/.test(e)));
});

test("Personas: drawing is deterministic and silent outside each window", () => {
  const els = [
    { type: "avatarCircle", in: 1, out: 4, name: "Ana Robles", role: "Asesora", avatar: "people:p05", verified: true },
    { type: "avatarStack", in: 1, out: 5, count: 120, label: "clientes felices", items: [1, 2, 3].map((i) => ({ avatar: `people:p0${i}`, name: "X" })), source: { kind: "reda" } },
    { type: "testimonial", in: 1, out: 6, quote: "Muy claros en todo.", name: "Luis", stars: 4.5, avatar: "people:p02" }
  ];
  for (const el of els) {
    const e = { ...el, slot: "center" };
    assert.deepEqual(drawLog(e, 0.2), [], `${el.type} is silent before in`);
    assert.deepEqual(drawLog(e, 2.5), drawLog(e, 2.5), `${el.type} is deterministic`);
    assert.ok(drawLog(e, 2.5).length > 0, `${el.type} draws mid-window`);
  }
});

test("socialProof offers band, top and center to the face-aware planner (band cheapest); an explicit slot is a preference (cost 0, others +260)", async () => {
  const d = Lib.get("socialProof");
  const zones = { x0: 60, x1: 1020, toastTop: 350, bottom: 1540 };
  const base = { type: "socialProof", in: 0, out: 6, items: [{ text: "Ana apartó la 302" }] };
  const c = d.candidates(base, zones, env());
  assert.deepEqual(c.map((x) => x.patch.slot).sort(), ["band", "center", "top"]);
  assert.equal(c.find((x) => x.patch.slot === "band").cost, 0);
  for (const x of c) assert.ok(x.rect.y >= 350 && x.rect.y + x.rect.h <= 1540, "candidate inside the free area");
  const pref = d.candidates({ ...base, slot: "top" }, zones, env());
  assert.deepEqual(pref.map((x) => x.patch.slot).sort(), ["band", "center", "top"]);
  assert.equal(pref.find((x) => x.patch.slot === "top").cost, 0);
  assert.ok(pref.filter((x) => x.patch.slot !== "top").every((x) => x.cost >= 260), "non-preferred slots pay PIN_PENALTY");
});

test("rating: no fake zero; the first visible score is at least 70 % of the score and stars agree with it", () => {
  const el = { type: "rating", in: 0, out: 3, score: 4.8, reviews: 1240, source: { kind: "reda" } };
  const at = (f) => drawLog(el, f * 3).join("\n");
  assert.doesNotMatch(at(0.05), /fillText\(0\.0,/);
  assert.doesNotMatch(at(0.05), /reseñas/);
  assert.match(at(0.95), /fillText\(4\.8,/);
  // first frame that shows a number: must be >= 0.7 x score (no "2.0" with stars beginning to fill)
  let first = null;
  for (let f = 0.1; f < 0.95 && first === null; f += 0.01) { const m = /fillText\((\d\.\d),/.exec(at(f)); if (m) first = Number(m[1]); }
  assert.ok(first !== null && first >= 0.7 * 4.8, `first visible score ${first}`);
});

test("avatarStack and rating counts start at >= 70 % of their final value (no fake +0 / 0 reviews)", () => {
  const el = { type: "avatarStack", in: 0, out: 4, count: 120, label: "clientes felices", items: [1, 2, 3].map((i) => ({ avatar: `people:p0${i}`, name: "X" })), source: { kind: "reda" } };
  const shown = [];
  for (let f = 0.05; f < 0.95; f += 0.01) { const m = /fillText\(\+(\d+),/.exec(drawLog(el, f * 4).join("\n")); if (m) shown.push(Number(m[1])); }
  assert.ok(shown.length > 0 && Math.min(...shown) >= 84, `+N first value ${Math.min(...shown)}`);
  assert.equal(shown.at(-1), 120);
});
