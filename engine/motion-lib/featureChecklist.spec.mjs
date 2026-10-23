// Spec of featureChecklist (imported by engine/motion-lib.test.mjs).
import test from "node:test";
import assert from "node:assert/strict";
import * as Lib from "./index.js";
import { checklistTimeline } from "./featureChecklist.js";

const el = (n = 4) => ({ id: "fc", type: "featureChecklist", in: 0, out: 6, items: Array.from({ length: n }, (_, i) => `Punto ${i + 1}`) });

test("featureChecklist: items tick one after another, each text entering after its checkmark", () => {
  const tl = checklistTimeline(el(4));
  const { start, step } = tl.b.items;
  assert.ok(step >= 0.1 && step <= 0.17, "staggered by 3 to 5 frames, not all at once");
  assert.ok(Math.abs(tl.b.exit[1] - tl.Ld) < 1e-9, "the exit ends at Ld");
  assert.ok(start + 3 * step < tl.b.exit[0], "the last item finishes before the exit");
});

test("featureChecklist: validation keeps 3 to 6 points", () => {
  assert.ok(Lib.validate(el(2), "fc").errors.some((e) => e.includes("de 3 a 6")));
  assert.ok(Lib.validate(el(7), "fc").errors.some((e) => e.includes("de 3 a 6")));
  assert.deepEqual(Lib.validate(el(3), "fc").errors, []);
  assert.deepEqual(Lib.validate(el(6), "fc").errors, []);
});

test("featureChecklist: the height grows with the number of points and the title", () => {
  const h = (e) => Lib.rect({ ...e, slot: "center" }).h;
  assert.ok(h(el(5)) > h(el(3)));
  assert.ok(h({ ...el(3), title: "Incluye" }) > h(el(3)));
});
