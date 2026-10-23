// Pure logic of the transition picker (engine/studio/client/transition-picker.js): groups, values, params, thumbnail frames.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as TR from "../../transitions/index.js";
import * as P from "../client/transition-picker.js";

const ORDER = ["Corte", "Movimiento", "Marca", "Impacto", "Suave"];

test("byCategory order: the picker's registry groups follow CATEGORIES and every item sits in its group", () => {
  const gs = P.groups(TR).slice(1); // without Básicos
  const titles = gs.map((g) => g.title);
  assert.ok(titles.length > 0, "there are registry transitions");
  const expected = ORDER.filter((c) => titles.includes(c));
  assert.deepEqual(titles, expected);
  for (const g of gs) {
    assert.ok(g.items.length > 0);
    for (const it of g.items) {
      assert.equal(it.descriptor.category, g.title);
      assert.equal(it.type, it.descriptor.name);
      assert.equal(it.legacy, false);
    }
  }
  // same items as the registry, nothing lost or added (cut.js is the legacy "cut", listed in Básicos only)
  const picked = gs.flatMap((g) => g.items.map((it) => it.type)).sort();
  assert.deepEqual(picked, TR.names().filter((n) => !P.LEGACY.includes(n)).sort());
});

test("cut is listed once (in Básicos), even though cut.js is in the registry", () => {
  assert.ok(TR.has("cut"), "precondition: cut.js is a registry file");
  const all = P.groups(TR).flatMap((g) => g.items.map((i) => i.type));
  assert.equal(all.filter((t) => t === "cut").length, 1);
  assert.equal(P.descriptorFor(TR, "cut"), null);
  assert.equal(P.descriptorFor(TR, "fadeColor")?.name, "fadeColor");
  assert.equal(P.descriptorFor(TR, "noExiste"), null);
});

test("Básicos come first with the four legacy names, plain (no descriptor)", () => {
  const gs = P.groups(TR);
  assert.equal(gs[0].title, "Básicos");
  assert.deepEqual(gs[0].items.map((i) => i.type), ["cut", "fade", "dipBlack", "dipWhite"]);
  assert.deepEqual(gs[0].items.map((i) => i.label), ["Corte seco", "Fundido", "A negro", "A blanco"]);
  assert.ok(gs[0].items.every((i) => i.legacy && i.descriptor === undefined));
});

test("first segment offers only the entry choices (legacy path)", () => {
  const gs = P.groups(TR, { first: true });
  assert.equal(gs.length, 1);
  assert.deepEqual(gs[0].items.map((i) => i.type), ["cut", "dipBlack", "dipWhite"]);
});

test("selectGroups keeps the group order for the grouped select", () => {
  const sg = P.selectGroups(P.groups(TR));
  assert.equal(sg[0].label, "Básicos");
  assert.deepEqual(sg[0].options[0], ["cut", "Corte seco"]);
  assert.equal(sg.length, P.groups(TR).length);
});

test("buildTransition for a registry type: dur clamped to [minDur, maxDur] and snapped to 0.05", () => {
  const d = { name: "fx", defaultDur: 0.4, minDur: 0.2, maxDur: 0.8, params: [] };
  assert.deepEqual(P.buildTransition(d, { type: "fx", dur: 5 }), { type: "fx", dur: 0.8 });
  assert.deepEqual(P.buildTransition(d, { type: "fx", dur: -3 }), { type: "fx", dur: 0.2 });
  assert.deepEqual(P.buildTransition(d, { type: "fx", dur: 0.52 }), { type: "fx", dur: 0.5 });
  assert.deepEqual(P.buildTransition(d, { type: "fx" }), { type: "fx", dur: 0.4 }, "missing dur = defaultDur");
  assert.deepEqual(P.buildTransition(d, { type: "fx", dur: NaN }), { type: "fx", dur: 0.4 });
});

test("buildTransition keeps only the declared params, valid select values, clamped numbers", () => {
  const d = {
    name: "fx", defaultDur: 0.4, minDur: 0.2, maxDur: 0.8,
    params: [
      { key: "dir", kind: "select", default: "izquierda", options: [["izquierda", "Izquierda"], ["derecha", "Derecha"]] },
      { key: "amount", kind: "number", default: 1, min: 0, max: 2, step: 0.1 }
    ]
  };
  const tr = P.buildTransition(d, { type: "fx", dur: 0.4, params: { dir: "derecha", amount: 9, junk: 1 } });
  assert.deepEqual(tr, { type: "fx", dur: 0.4, params: { dir: "derecha", amount: 2 } });
  const bad = P.buildTransition(d, { type: "fx", dur: 0.4, params: { dir: "arriba", amount: "x", junk: 1 } });
  assert.deepEqual(bad, { type: "fx", dur: 0.4 }, "invalid values dropped; the renderer falls back to the default");
  assert.equal(P.buildTransition(d, { type: "fx", dur: 0.4, params: { amount: -4 } }).params.amount, 0);
});

test("buildTransition with a real registry descriptor: only its own params survive", () => {
  const d = TR.get(TR.names()[0]);
  const tr = P.buildTransition(d, { type: d.name, dur: d.defaultDur, params: { nope: 1 } });
  assert.equal(tr.type, d.name);
  assert.equal(tr.dur, d.defaultDur);
  assert.equal(tr.params, undefined, "no declared key was given: no params object");
});

test("legacy path unchanged: {type, dur} with no clamp; cut is null; unknown names are null", () => {
  assert.deepEqual(P.buildTransition(null, { type: "fade", dur: 0.7 }), { type: "fade", dur: 0.7 });
  assert.deepEqual(P.buildTransition(null, { type: "dipBlack", dur: 1.5 }), { type: "dipBlack", dur: 1.5 });
  assert.deepEqual(P.buildTransition(null, { type: "dipWhite" }), { type: "dipWhite", dur: 0.4 });
  assert.equal(P.buildTransition(null, { type: "cut", dur: 0.4 }), null);
  assert.equal(P.buildTransition(null, { type: "noExiste", dur: 0.4 }), null);
});

test("thumbnail frame index: 30 fps, loops every THUMB_FRAMES frames", () => {
  assert.equal(P.THUMB_FRAMES, 45);
  assert.equal(P.thumbFrame(0), 0);
  assert.equal(P.thumbFrame(1000), 30);
  assert.equal(P.thumbFrame(1499), 44);
  assert.equal(P.thumbFrame(1500), 0, "the loop restarts");
  assert.equal(P.thumbFrame(NaN), 0);
  assert.equal(P.thumbFrame(-50), 0);
});

test("thumbnail u values: first frame 0, last frame 1, out-of-range clamped, and uToFrame inverts them", () => {
  assert.equal(P.thumbU(0), 0);
  assert.equal(P.thumbU(44), 1);
  assert.equal(P.thumbU(99), 1);
  assert.equal(P.thumbU(-3), 0);
  assert.equal(P.uToFrame(0), 0);
  assert.equal(P.uToFrame(1), 44);
  assert.equal(P.uToFrame(0.5), 22);
  assert.equal(P.uToFrame(2), 44);
  assert.equal(P.uToFrame(NaN), 0);
  for (let f = 0; f < P.THUMB_FRAMES; f += 1) assert.equal(P.uToFrame(P.thumbU(f)), f);
});

test("numberRange: explicit min/max/step win; defaults otherwise", () => {
  assert.deepEqual(P.numberRange({ default: 1, min: 0, max: 2, step: 0.1 }), { min: 0, max: 2, step: 0.1 });
  assert.deepEqual(P.numberRange({ default: 1 }), { min: 0, max: 2, step: 0.05 });
});
