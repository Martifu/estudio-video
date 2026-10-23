// Spec of the shared Inmobiliario helpers (imported by engine/motion-lib.test.mjs).
import test from "node:test";
import assert from "node:assert/strict";
import { rng, statusFill, onFill, productPhoto, countMoney } from "./_inmo.js";

test("_inmo: countMoney counts whole units from 70 % (no cents flicker, no fake $0) and lands exactly on the final text", () => {
  const mid = countMoney(2300046.01, 0.5);
  assert.ok(!mid.includes("."), `cents while counting: ${mid}`);
  assert.ok(Number(mid.replace(/[$,]/g, "")) >= 1610032, `starts below 70 %: ${mid}`);
  assert.equal(countMoney(2300046.01, 1), "$2,300,046.01");
  assert.equal(countMoney(50000, 1), "$50,000");
  assert.equal(countMoney(50000, 0), "");
});

test("_inmo: the seeded generator repeats for the same seed and stays in [0, 1)", () => {
  const a = rng("x"), b = rng("x");
  for (let i = 0; i < 50; i += 1) { const v = a(); assert.equal(v, b()); assert.ok(v >= 0 && v < 1); }
  assert.notEqual(rng("x")(), rng("y")());
});

test("_inmo: status colours come from the skin table (case-insensitive), muted when unknown", () => {
  const skin = { status: { disponible: "#6B7280" }, colors: { muted: "#999999" } };
  assert.equal(statusFill(skin, "Disponible"), "#6B7280");
  assert.equal(statusFill(skin, "Vendido raro"), "#999999");
  assert.equal(onFill("#FFFFFF"), "#111111");
  assert.equal(onFill("#0B0146"), "#FFFFFF");
});

test("_inmo: products photo path reaches the run assets through ../ (uiList convention)", () => {
  assert.equal(productPhoto({ images: [{ src: "assets/products/a.png" }] }), "../assets/products/a.png");
  assert.equal(productPhoto({ images: [] }), undefined);
});
