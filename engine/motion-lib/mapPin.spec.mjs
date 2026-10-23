// Spec of mapPin (imported by engine/motion-lib.test.mjs): deterministic streets, pin bounce, chip slots.
import test from "node:test";
import assert from "node:assert/strict";
import * as Lib from "./index.js";
import { recorder, env } from "./_testkit.mjs";
import { mapGrid, bounceOut } from "./_inmo.js";
import { CHIP_SLOTS } from "./mapPin.js";

test("mapPin: the street map is a pure function of the seed (same seed = same map, other seed = other map)", () => {
  const a = JSON.stringify(mapGrid("torre-norte", 900, 700)), b = JSON.stringify(mapGrid("torre-norte", 900, 700));
  const c = JSON.stringify(mapGrid("otra", 900, 700));
  assert.equal(a, b);
  assert.notEqual(a, c);
});

test("mapPin: bounce ends exactly on the ground and never goes below it", () => {
  assert.equal(bounceOut(0), 0);
  assert.ok(Math.abs(bounceOut(1) - 1) < 1e-9);
  for (let x = 0; x <= 1; x += 0.01) assert.ok(bounceOut(x) <= 1.0001, `at ${x}`);
});

test("mapPin: at most 4 nearby points, one chip slot each; the pin lands before the last chip", () => {
  assert.equal(CHIP_SLOTS.length, 4);
  const el = { id: "m", type: "mapPin", in: 0, out: 4.4, title: "Torre", nearby: [{ minutes: 5, place: "Galerías" }, { minutes: 10, place: "Aeropuerto" }] };
  const tl = Lib.timeline(el);
  assert.equal(tl.b.chips.length, 2);
  assert.ok(tl.b.pin[1] < tl.b.chips[1][0]);
  assert.deepEqual(Lib.validate({ ...el, source: { kind: "fictional" } }, "m").errors, []);
  assert.ok(Lib.validate({ type: "mapPin", in: 0, out: 3, title: "T", nearby: [] }, "m").errors.length >= 1);
});

test("mapPin: a chip reads '<minutes> min · <place>' in the texts of the element", () => {
  const el = { id: "m", type: "mapPin", in: 0, out: 4, title: "T", nearby: [{ minutes: 5, place: "Galerías" }] };
  assert.ok(Lib.texts(el).includes("5 min · Galerías"));
  const log = [];
  Lib.draw(recorder(log), el, 3.0, env());
  assert.ok(log.some((l) => l.includes("5 min · Galerías")));
});
