// The Estudio consumes the motion library registry: TYPES entries, validation, panels, review rules.
import test from "node:test";
import assert from "node:assert/strict";
import { TYPES, LIB, validateElement, validateMotion, textKeyOf, supportsPin } from "../client/schema.js";
import { runReview } from "../client/review-rules.js";

test("every registered element is a TYPES entry built from its descriptor; panel placement comes from the descriptor", () => {
  for (const d of LIB.all()) {
    const t = TYPES[d.type];
    assert.ok(t?.lib && t.defaults === d.defaults && t.fields === d.fields, d.type);
    assert.equal(t.panel, d.panel ?? "library");
    assert.equal(supportsPin({ type: d.type }), false);
    assert.deepEqual(validateElement(d.defaults(1, 20), 0, 20).errors, [], `${d.type}: the default element validates`);
  }
  assert.equal(TYPES.kineticWord.panel, "text");
  assert.equal(TYPES.logoSting.panel, "library");
  assert.equal(textKeyOf({ type: "kineticWord" }), "text");
  const groups = LIB.byCategory().map((g) => g.category);
  assert.equal(groups[0], "Pantallas");
  assert.ok(groups.includes("Cierres") && groups.includes("Texto"));
});

test("validation of the new elements goes through the registry (Spanish messages, errors block)", () => {
  const r = validateMotion([{ type: "kineticWord", in: 1, out: 3, text: "" }, { type: "logoSting", in: 5, out: 6, bg: "red" }], 10);
  assert.ok(r.errors.some((e) => /necesita la palabra/.test(e)));
  assert.ok(r.errors.some((e) => /paper o primary/.test(e)));
  assert.ok(validateElement({ type: "logoSting", in: 5, out: 6.5 }, 0, 10).warnings.some((w) => /dura muy poco/.test(w)));
});

test("review: one kineticWord is fine, a second one is yellow; its text counts as on-screen text", () => {
  const kw = (id, t) => ({ id, type: "kineticWord", in: t, out: t + 2, text: "VENTAS" });
  const one = runReview({ duration: 10, motion: [kw("a", 1)] });
  assert.deepEqual(one.items.filter((i) => i.check === "kinetic").map((i) => i.severity), ["green"]);
  const two = runReview({ duration: 12, motion: [kw("a", 1), kw("b", 6)] });
  const warn = two.items.filter((i) => i.check === "kinetic" && i.severity === "yellow");
  assert.equal(warn.length, 1);
  assert.equal(warn[0].elementId, "b");
});
