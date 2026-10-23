// Spec of beforeAfter (imported by engine/motion-lib.test.mjs): slider sweep geometry and the two images.
import test from "node:test";
import assert from "node:assert/strict";
import * as Lib from "./index.js";
import { sliderX, baTimeline } from "./beforeAfter.js";

test("beforeAfter: the slider starts at the right edge (all Antes) and sweeps monotonically to the middle", () => {
  const el = { in: 0, out: 3.8 };
  const tl = { ...baTimeline(), D: 3.8, Ld: 3.8 };
  assert.equal(sliderX(0, tl, 900), 900);
  let prev = 901;
  for (let ts = 0; ts <= 3.8; ts += 0.02) {
    const x = sliderX(ts, tl, 900);
    assert.ok(x <= prev + 1e-9 && x >= 450 - 1e-9, `slider ${x} at ${ts}`);
    prev = x;
  }
  assert.ok(Math.abs(sliderX(3.8, tl, 900) - 450) < 1e-9);
  void el;
});

test("beforeAfter: both images are required; the timeline has the sweep, the labels and the exit", () => {
  assert.ok(Lib.validate({ type: "beforeAfter", in: 0, out: 3, before: "a.png" }, "b").errors.length >= 1);
  assert.deepEqual(Lib.validate({ type: "beforeAfter", in: 0, out: 3, before: "a.png", after: "b.png" }, "b").errors, []);
  const tl = baTimeline();
  assert.ok(tl.b.sweep[1] <= tl.b.labelAfter[0] + 1e-9, "Después appears once the slider is done");
});
