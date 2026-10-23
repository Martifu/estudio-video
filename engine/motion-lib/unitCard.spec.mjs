// Spec of unitCard (imported by engine/motion-lib.test.mjs): Reda prefill, price count and status colour through the skin.
import test from "node:test";
import assert from "node:assert/strict";
import * as Lib from "./index.js";
import { recorder, env } from "./_testkit.mjs";
import { unitFromProducts } from "./unitCard.js";

const reda = { version: 1, products: [
  { id: "reda-717-m1500", name: "IVORIA · Modelo A", source: "reda", price: 2300046.01, priceNote: "desde", fetchedAt: "2026-10-22", attributes: { proyecto: "IVORIA", m2: "47.80 m²" }, images: [{ src: "assets/products/a.png" }] },
  { id: "reda-717", name: "IVORIA", source: "reda", price: 1636054.88, images: [] }
] };

test("unitCard: prefill takes the first Reda MODEL product (price desde, photo through ../, source reda)", () => {
  const patch = Lib.get("unitCard").prefill({ products: reda });
  assert.equal(patch.title, "IVORIA · Modelo A");
  assert.equal(patch.price, 2300046.01);
  assert.equal(patch.priceNote, "desde");
  assert.equal(patch.photo, "../assets/products/a.png");
  assert.deepEqual(patch.source, { kind: "reda", ref: "products.json", fetchedAt: "2026-10-22" });
  assert.deepEqual(patch.chips, ["IVORIA", "47.80 m²"]);
});

test("unitCard: prefill returns null without a Reda model product (never invents a unit)", () => {
  assert.equal(unitFromProducts({ products: [{ id: "x", source: "manual", price: 5, name: "x" }] }), null);
  assert.equal(unitFromProducts({ products: [{ id: "reda-717", source: "reda", price: 1, name: "IVORIA" }] }), null);
  assert.equal(unitFromProducts(undefined), null);
});

test("unitCard: the price counts up monotonically and lands exactly on the final text", () => {
  const el = { id: "u", type: "unitCard", in: 0, out: 4, title: "A", price: 2300046.01, priceNote: "desde", status: "Disponible", source: { kind: "reda" } };
  let prev = 0, last = "";
  for (let t = 1.2; t < 3.9; t += 1 / 30) {
    const log = [];
    Lib.draw(recorder(log), el, t, env());
    const hit = log.map((l) => /^fillText\((\$[\d,.]+),44,/.exec(l)).filter(Boolean);
    if (!hit.length) continue;
    const n = Number(hit[0][1].replace(/[$,]/g, ""));
    assert.ok(n >= prev - 1e-6 && n <= 2300046.01 + 1e-6, `went from ${prev} to ${n} at ${t.toFixed(2)}`);
    prev = n; last = hit[0][1];
  }
  assert.equal(last, "$2,300,046.01");
});

test("unitCard: the status pill takes its colour from the skin status table", () => {
  const e = env({ skin: { ...env().skin, status: { disponible: "#123456" } } });
  const log = [];
  Lib.draw(recorder(log), { id: "u", type: "unitCard", in: 0, out: 4, title: "A", status: "Disponible" }, 2.5, e);
  assert.ok(log.includes("fillStyle=#123456"), "pill filled with the skin colour");
});

test("unitCard: validation asks for a name and a non-negative price; more than 3 chips is advice", () => {
  assert.deepEqual(Lib.validate({ type: "unitCard", in: 0, out: 3 }, "u").errors.length, 1);
  const bad = Lib.validate({ type: "unitCard", in: 0, out: 3, title: "A", price: -1 }, "u");
  assert.ok(bad.errors.some((m) => /precio/.test(m)));
  const many = Lib.validate({ type: "unitCard", in: 0, out: 3, title: "A", chips: ["1", "2", "3", "4"] }, "u");
  assert.equal(many.errors.length, 0);
  assert.ok(many.warnings.some((m) => /3 chips/.test(m)));
});
