// Spec of planCards (imported by engine/motion-lib.test.mjs).
import test from "node:test";
import assert from "node:assert/strict";
import * as Lib from "./index.js";
import { recorder, env } from "./_testkit.mjs";
import { featuresOf, layoutOf } from "./planCards.js";

const plan = (name, rec = false, features = "a | b | c | d") => ({ name, price: 1490, period: "al mes", features, recommended: rec });
const el = (plans, over = {}) => ({ id: "pl", type: "planCards", in: 0, out: 5, plans, ...over });

test("planCards: features are split on | and capped at three", () => {
  assert.deepEqual(featuresOf(plan("x")), ["a", "b", "c"]);
  assert.deepEqual(featuresOf({ features: " uno |  | dos " }), ["uno", "dos"]);
});

test("planCards: two plans sit side by side, three stack, and an explicit layout wins", () => {
  assert.equal(layoutOf(el([plan("a"), plan("b")])), "fila");
  assert.equal(layoutOf(el([plan("a"), plan("b"), plan("c")])), "columna");
  assert.equal(layoutOf(el([plan("a"), plan("b"), plan("c")], { layout: "fila" })), "fila");
});

test("planCards: only the recommended plan gets the ribbon", () => {
  const drawn = (plans) => { const log = []; Lib.draw(recorder(log), el(plans), 3.0, env()); return log.filter((l) => l.startsWith("fillText(Recomendado,")).length; };
  assert.equal(drawn([plan("Básico"), plan("Pro", true)]), 1);
  assert.equal(drawn([plan("Básico"), plan("Pro")]), 0);
});

test("planCards: validation asks for 2 to 3 named plans with a numeric price", () => {
  assert.ok(Lib.validate(el([plan("solo")]), "pl").errors.some((e) => e.includes("de 2 a 3")));
  assert.ok(Lib.validate(el([plan("a"), plan("b"), plan("c"), plan("d")]), "pl").errors.some((e) => e.includes("de 2 a 3")));
  assert.ok(Lib.validate(el([{ name: "a" }, plan("b")]), "pl").errors.some((e) => e.includes("necesita un precio")));
  assert.ok(Lib.validate(el([plan("a", true), plan("b", true)]), "pl").warnings.some((w) => w.includes("solo un plan")));
});
