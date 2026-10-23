// Spec of kineticWord (imported by engine/motion-lib.test.mjs).
import test from "node:test";
import assert from "node:assert/strict";
import * as Lib from "./index.js";
import { layoutWord, schedule } from "./kineticWord.js";
import { recorder, env, ZONES } from "./_testkit.mjs";

const el = (over = {}) => ({ id: "kw1", type: "kineticWord", in: 2, out: 4.4, text: "VENTAS", ...over });

test("kineticWord: letters stagger 3 frames and settle in ~8 frames; the exit is ~30 % shorter than the entry", () => {
  const s = schedule(6, 2.4);
  assert.ok(Math.abs(s.stagger - 0.1) < 1e-9 && Math.abs(s.settle - 8 / 30) < 1e-9);
  assert.ok(Math.abs(s.exit / s.entry - 0.7) < 1e-9);
  const b = Lib.timeline(el()).b;
  assert.ok(Math.abs(b.exit[1] - 2.4) < 1e-9 && b.entry[1] < b.exit[0]);
  const short = schedule(6, 0.9);
  assert.ok(short.k < 1 && short.entry + short.exit < 0.9, "a short window compresses the beats instead of overflowing");
});

test("kineticWord: auto size 180-260 fits the safe width; long words shrink or break into two lines", () => {
  const e = env();
  const one = layoutWord(el(), e, ZONES);
  assert.equal(one.size, 260);
  assert.equal(one.lines.length, 1);
  const mid = layoutWord(el({ text: "CLIENTES" }), e, ZONES);
  assert.ok(mid.size >= 180 && mid.size < 260 && mid.w <= 936, JSON.stringify(mid));
  const tiny = layoutWord(el({ text: "DEPARTAMENTOS" }), e, ZONES);
  assert.ok(tiny.size < 180 && tiny.size >= 96 && tiny.w <= 936, "one long word shrinks below 180 only as a last resort: " + JSON.stringify(tiny));
  const two = layoutWord(el({ text: "TU CRM INMOBILIARIO" }), e, ZONES);
  assert.equal(two.lines.length, 2);
  assert.ok(two.size >= 96 && two.size > 89 && two.w <= 936, "two lines beat one tiny line: " + JSON.stringify(two));
  assert.equal(layoutWord(el({ size: 200 }), e, ZONES).size, 200, "explicit size wins");
});

test("kineticWord: slots band (chest height) / center / top stay in the free area", () => {
  const band = Lib.rect(el(), ZONES, env()), center = Lib.rect(el({ slot: "center" }), ZONES, env()), top = Lib.rect(el({ slot: "top" }), ZONES, env());
  assert.ok(band.y > center.y && center.y > top.y);
  assert.ok(band.y + band.h <= 1540 && top.y >= 350);
  assert.ok(Math.abs(band.y + band.h / 2 - 1380) < 2, "band = chest height like the reference");
});

test("kineticWord: candidates give the planner every slot x size; an explicit slot pins the slot", () => {
  const all = Lib.candidates(el(), ZONES, env());
  assert.deepEqual([...new Set(all.map((c) => c.patch.slot))], ["band", "center", "top"]);
  assert.ok(all[0].cost < all[all.length - 1].cost);
  assert.deepEqual([...new Set(Lib.candidates(el({ slot: "top" }), ZONES, env()).map((c) => c.patch.slot))], ["top"]);
});

test("kineticWord: one whoosh at the start (rise) or a pop (slam)", () => {
  assert.deepEqual(Lib.events(el()).map((e) => [e.type, e.t]), [["whoosh", 2]]);
  assert.deepEqual(Lib.events(el({ style: "slam" })).map((e) => e.type), ["pop"]);
});

test("kineticWord: flat colour + soft shadow, no gradient; letters appear one by one; exit blurs", () => {
  const draws = (t, over) => { const log = []; Lib.draw(recorder(log), el(over), t, env()); return log; };
  const letters = (log) => log.filter((l) => l.startsWith("fillText")).length;
  assert.equal(letters(draws(2.02)), 1);
  assert.equal(letters(draws(2.25)), 3);
  assert.equal(letters(draws(3.0)), 6);
  const mid = draws(3.0);
  assert.ok(mid.some((l) => l.startsWith("shadowBlur=")) && !mid.some((l) => /Gradient/.test(l)));
  assert.ok(mid.some((l) => l === "fillStyle=#80BC00"), "default colour = readable brand primary");
  assert.ok(draws(3.0, { color: "#FFFFFF" }).some((l) => l === "fillStyle=#FFFFFF"));
  assert.ok(!draws(3.0).some((l) => l.startsWith("filter=")), "no blur while holding");
  assert.ok(draws(4.35).some((l) => l.startsWith("filter=blur")), "blur on exit");
  const slam = draws(2.01, { style: "slam" }).find((l) => l.startsWith("scale("));
  assert.ok(slam && Number(/scale\(([\d.]+)/.exec(slam)[1]) > 1.3, "slam starts big");
});

test("kineticWord: validation in plain Spanish", () => {
  const v = (o) => Lib.validate(el(o), "x");
  assert.deepEqual(v({}).errors, []);
  assert.match(v({ text: " " }).errors[0], /necesita la palabra/);
  assert.match(v({ style: "zoom" }).errors[0], /rise o slam/);
  assert.match(v({ color: "verde" }).errors[0], /color/);
  assert.match(v({ slot: "left" }).errors[0], /band, center o top/);
  assert.ok(v({ text: "UNA PALABRA MUY LARGA" }).warnings.length);
});
