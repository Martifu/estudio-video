// Spec of amenityGrid (imported by engine/motion-lib.test.mjs): icon set coverage, grid geometry, validation.
import test from "node:test";
import assert from "node:assert/strict";
import * as Lib from "./index.js";
import { recorder, env } from "./_testkit.mjs";
import { AMENITIES, drawAmenityIcon } from "./_inmo.js";
import { gridCols, gridRows, gridHeight } from "./amenityGrid.js";

test("amenityGrid: the twelve line icons all draw something, unknown keys draw nothing", () => {
  assert.equal(AMENITIES.length, 12);
  for (const a of AMENITIES) {
    const log = [];
    assert.equal(drawAmenityIcon(recorder(log), a.key, 0, 0, 60, "#000"), true, a.key);
    assert.ok(log.filter((l) => l.startsWith("stroke(")).length >= 1, `${a.key} strokes a path`);
  }
  assert.equal(drawAmenityIcon(recorder([]), "nope", 0, 0, 60, "#000"), false);
});

test("amenityGrid: 2 columns up to 6 items, 3 above; explicit columns win; the card height follows the rows", () => {
  const six = { items: Array.from({ length: 6 }, () => ({ icon: "alberca" })) };
  const nine = { items: Array.from({ length: 9 }, () => ({ icon: "alberca" })) };
  assert.equal(gridCols(six), 2); assert.equal(gridRows(six), 3);
  assert.equal(gridCols(nine), 3); assert.equal(gridRows(nine), 3);
  assert.equal(gridCols({ ...six, columns: "3" }), 3);
  assert.ok(gridHeight(nine) <= 760, "fits the band");
  assert.ok(gridHeight({ ...six, title: "x" }) > gridHeight(six));
});

test("amenityGrid: validation rejects an empty list and unknown icons; the sample validates", () => {
  assert.ok(Lib.validate({ type: "amenityGrid", in: 0, out: 3, items: [] }, "a").errors.length >= 1);
  assert.ok(Lib.validate({ type: "amenityGrid", in: 0, out: 3, items: [{ icon: "piscina" }] }, "a").errors.some((m) => /desconocido/.test(m)));
  assert.deepEqual(Lib.validate(Lib.sampleOf("amenityGrid", {}), "a").errors, []);
});

test("amenityGrid: tiles enter one after another (the last tile starts after the first)", () => {
  const el = { id: "g", type: "amenityGrid", in: 0, out: 4, items: [{ icon: "alberca" }, { icon: "gimnasio" }, { icon: "terraza" }] };
  const early = [], late = [];
  Lib.draw(recorder(early), el, 0.45, env());
  Lib.draw(recorder(late), el, 1.6, env());
  assert.ok(late.length > early.length, "more is drawn as the tiles arrive");
});
