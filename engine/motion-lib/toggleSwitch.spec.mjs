// Behaviour of toggleSwitch: the switches that end "on" turn on in row order, one click each; off rows never click.
import test from "node:test";
import assert from "node:assert/strict";
import * as Lib from "./index.js";
import { env, ZONES } from "./_testkit.mjs";

test("toggleSwitch: on rows switch in order, off rows stay off (no beat, no click)", () => {
  const el = { id: "tog-spec", type: "toggleSwitch", in: 1, out: 6, effect: "Respuestas automáticas: activadas",
    rows: [{ label: "Uno", on: true }, { label: "Dos", on: false }, { label: "Tres", on: true }] };
  const B = Lib.beats(el).beats;
  const first = B.sw[0][0], second = B.sw[2][0];
  assert.ok(first >= el.in && second > first, "row 3 switches after row 1");
  assert.ok(B.sw[0][1] <= second, "the first switch finishes before the second one starts");
  assert.equal(B.sw[1][0], B.sw[1][1], "the off row has an empty span");
  const clicks = Lib.events(el, Lib.rect(el, ZONES, env())).filter((e) => e.type === "click").map((e) => e.t);
  assert.equal(clicks.length, 2, "one click per switch that ends on, none for the off row");
  clicks.forEach((t, i) => assert.ok(Math.abs(t - [first, second][i]) < 2e-3));
  assert.ok(B.effect[0] > B.sw[2][1], "the effect line appears after the last switch");
});
