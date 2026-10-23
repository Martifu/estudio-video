// Spec of floorPlanReveal (imported by engine/motion-lib.test.mjs): beats per label and dimension, validation of the plan source.
import test from "node:test";
import assert from "node:assert/strict";
import * as Lib from "./index.js";

test("floorPlanReveal: one beat span per label and per dimension, the exit is last", () => {
  const el = { id: "p", type: "floorPlanReveal", in: 0, out: 6, rooms: [{ x: 0, y: 0, w: 1, h: 1 }],
    labels: [{ text: "A", x: 0.5, y: 0.5 }, { text: "B", x: 0.2, y: 0.2 }, { text: "C", x: 0.8, y: 0.8 }], dims: [{ text: "3 m", x1: 0, y1: 0, x2: 1, y2: 0 }] };
  const tl = Lib.timeline(el);
  assert.equal(tl.b.lab.length, 3);
  assert.equal(tl.b.dim.length, 1);
  assert.ok(tl.b.lab[2][0] > tl.b.lab[1][0] && tl.b.lab[1][0] > tl.b.lab[0][0], "labels pin in one after another");
  assert.ok(tl.b.dim[0][0] >= tl.b.lab[2][1], "dimensions come after the labels");
  assert.ok(tl.b.exit[0] >= tl.b.dim[0][1], "the exit waits for the dimensions");
});

test("floorPlanReveal: a plan needs an image or at least one room; dimensions need their text and a source", () => {
  assert.ok(Lib.validate({ type: "floorPlanReveal", in: 0, out: 4 }, "p").errors.length >= 1);
  assert.deepEqual(Lib.validate({ type: "floorPlanReveal", in: 0, out: 4, image: "reda/plano.png" }, "p").errors, []);
  assert.ok(Lib.validate({ type: "floorPlanReveal", in: 0, out: 4, rooms: [{ x: 0, y: 0, w: 1, h: 1 }], dims: [{ text: "" }] }, "p").errors.some((m) => /cota/.test(m)));
  assert.equal(Lib.showsNumbers({ type: "floorPlanReveal", dims: [{ text: "3 m" }] }), true);
  assert.equal(Lib.showsNumbers({ type: "floorPlanReveal", rooms: [{ x: 0, y: 0, w: 1, h: 1 }] }), false);
});
