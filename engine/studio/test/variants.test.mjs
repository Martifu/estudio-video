// node --test engine/studio/test/variants.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { validateDoc, variantSlug } from "../variants.mjs";

const hook = (options, extra = {}) => ({ id: "hook", label: "Gancho", target: { kind: "motion", index: 0, field: "text" }, options, ...extra });
const cta = (options) => ({ id: "cta", target: { kind: "cta", field: "title" }, options });

test("valid 2x2 document", () => {
  const r = validateDoc({ axes: [hook(["A", "B"]), cta(["C", "D"])] }, { motion: [{ text: "A" }], ctaOn: true });
  assert.deepEqual(r.errors, []);
  assert.equal(r.combos.length, 4);
});
test("limits: axes, combinations, options, length, empty text", () => {
  assert.ok(validateDoc({ axes: [hook(["a", "b"]), cta(["a", "b"]), { ...cta(["a", "b"]), id: "x" }] }).errors.length);
  assert.ok(validateDoc({ axes: [hook(["a", "b", "c", "d"]), cta(["a", "b", "c", "d"])] }).errors.some((e) => /combinaciones/.test(e))); // 16 > 12
  assert.ok(validateDoc({ axes: [hook(["a"])] }).errors.length);
  assert.ok(validateDoc({ axes: [hook(["a", "x".repeat(121)])] }).errors.length);
  assert.ok(validateDoc({ axes: [hook(["a", "  "])] }).errors.length);
  assert.ok(validateDoc({ axes: [hook(["a", "b\u0007"])] }).errors.length);
});
test("more than 4 words is a warning, not an error", () => {
  const r = validateDoc({ axes: [hook(["a", "uno dos tres cuatro cinco"])] });
  assert.deepEqual(r.errors, []);
  assert.equal(r.warnings.length, 1);
});
test("existence checks need the env", () => {
  assert.ok(validateDoc({ axes: [hook(["a", "b"])] }, { motion: [] }).errors.length);
  assert.ok(validateDoc({ axes: [cta(["a", "b"])] }, { ctaOn: false }).errors.length);
});
test("bad targets and ids are rejected", () => {
  assert.ok(validateDoc({ axes: [{ id: "../x", target: { kind: "cta", field: "title" }, options: ["a", "b"] }] }).errors.length);
  assert.ok(validateDoc({ axes: [{ id: "a", target: { kind: "motion", index: 0, field: "__proto__" }, options: ["a", "b"] }] }).errors.length);
  assert.ok(validateDoc({ axes: [{ id: "a", target: { kind: "cta", field: "dur" }, options: ["a", "b"] }] }).errors.length);
});
test("slug only contains digits, whatever the texts are", () => {
  assert.equal(variantSlug("corte", [0, 1]), "corte__var-01");
  assert.match(variantSlug("corte", [2]), /^corte__var-\d$/);
});
