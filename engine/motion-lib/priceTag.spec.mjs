// Spec of priceTag (imported by engine/motion-lib.test.mjs).
import test from "node:test";
import assert from "node:assert/strict";
import * as Lib from "./index.js";
import { recorder, env } from "./_testkit.mjs";
import { countFrom, dampedSwing, money, productPatch } from "./_venta.js";

const el = (over = {}) => ({ id: "pt", type: "priceTag", in: 0, out: 3, label: "Sillón", value: 12990, ...over });

test("priceTag: the price counts up from 70 % of its value (never a fake zero), monotonically, and lands exactly on its value", () => {
  let prev = -1;
  for (let k = 0; k <= 1; k += 0.01) { const v = countFrom(12990, k); assert.ok(v >= prev && v <= 12990); prev = v; }
  assert.ok(countFrom(12990, 0) >= 12990 * 0.7 - 1e-6, "the first counted value is already 70 % of the price");
  assert.equal(countFrom(12990, 1), 12990);
  assert.equal(money(12990), "$12,990");
  assert.equal(money(1850000), "$1,850,000");
  const log = [];
  Lib.draw(recorder(log), el(), 2.9, env());
  assert.ok(log.some((l) => l.includes("$12,990")), "the final price is drawn at the end");
});

test("priceTag: the landing swing is damped (its amplitude shrinks and it is 0 after the swing)", () => {
  const amp = (t) => Math.abs(dampedSwing(t, 0, 1, 0.075));
  assert.ok(amp(0) >= amp(0.25) && amp(0.25) >= amp(0.6));
  assert.equal(dampedSwing(-0.1, 0, 1, 0.075), 0);
  assert.equal(dampedSwing(1.2, 0, 1, 0.075), 0);
});

test("priceTag: prefill takes the first MXN product with a price, with its id and 'desde' when the note says so", () => {
  const patch = productPatch({ products: [{ id: "x", name: "USD", price: 9, currency: "USD" }, { id: "p1", name: "Lote 120 m²", price: 1850000, priceNote: "desde", source: "reda", fetchedAt: "2026-10-20" }] });
  assert.equal(patch.productId, "p1");
  assert.equal(patch.value, 1850000);
  assert.equal(patch.prefix, "desde");
  assert.deepEqual(patch.source, { kind: "reda", ref: "products.json", fetchedAt: "2026-10-20" });
  assert.equal(productPatch({ products: [] }), null);
  assert.equal(Lib.get("priceTag").prefill({ products: { products: [] } }), null);
});

test("priceTag: validation asks for the label and a numeric price; a missing source is a warning", () => {
  const bad = Lib.validate(el({ label: "", value: "" }), "pt");
  assert.ok(bad.errors.some((e) => e.includes("qué es")) && bad.errors.some((e) => e.includes("precio")));
  const noSource = Lib.validate(el({ source: undefined }), "pt");
  assert.deepEqual(noSource.errors, []);
  assert.ok(noSource.warnings.some((w) => w.includes("de dónde sale el precio")));
  assert.equal(Lib.showsNumbers(el()), true);
});

test("priceTag: an explicit slot is a preference, not a pin (the pinned slot costs 0, the others 260 more)", () => {
  const zones = { x0: 60, x1: 1020, toastTop: 350, bottom: 1540 };
  const costs = (slot) => Object.fromEntries(Lib.candidates(el({ slot }), zones).map((c) => [c.name, c.cost]));
  const c = costs("top");
  assert.equal(c["tag-top"], 0);
  assert.ok(c["tag-band"] >= 260 && c["tag-center"] >= 260, "the other slots stay possible, at a penalty");
  assert.equal(Object.values(costs(undefined)).filter((v) => v === 0)[0], 0, "without a slot the band is free");
});
