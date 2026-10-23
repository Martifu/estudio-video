// Spec of offerBadge (imported by engine/motion-lib.test.mjs).
import test from "node:test";
import assert from "node:assert/strict";
import * as Lib from "./index.js";
import { recorder, env } from "./_testkit.mjs";

const el = (over = {}) => ({ id: "ob", type: "offerBadge", in: 0, out: 3, text: "-15%", sub: "de descuento", source: { kind: "brand" }, ...over });

test("offerBadge: it rotates in slightly and lands exactly square (rotation 0 and scale 1 once landed)", () => {
  const rot = (t) => { const log = []; Lib.draw(recorder(log), el(), t, env()); return log.filter((l) => /^rotate\(/.test(l)).map((l) => Number(/rotate\((.*?)\)/.exec(l)[1])); };
  const start = rot(0), landed = rot(1.0);
  assert.ok(start.length && Math.abs(start[0]) > 0.1 && Math.abs(start[0]) < 0.2, "starts turned slightly (about 7 degrees)");
  assert.equal(landed.length, 1);
  assert.ok(Math.abs(landed[0]) < 1e-6, "lands square");
});

test("offerBadge: a number is a discount claim (asks for the source); words alone are not", () => {
  assert.equal(Lib.showsNumbers(el()), true);
  assert.equal(Lib.showsNumbers(el({ text: "GRATIS", sub: "envío" })), false);
  assert.ok(Lib.validate(el({ source: undefined }), "ob").warnings.some((w) => w.includes("de dónde sale")));
  assert.deepEqual(Lib.validate(el({ text: "" }), "ob").errors.length, 1);
});
