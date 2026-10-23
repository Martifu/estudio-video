// Spec shared by the four face-aware Venta elements and the screen controls of every Venta element.
import test from "node:test";
import assert from "node:assert/strict";
import * as Lib from "./index.js";
import { recorder, env, ZONES } from "./_testkit.mjs";
import { SLOT_COST } from "./_venta.js";

const VENTA = ["priceTag", "priceCompare", "featureChecklist", "countdown", "compareTable", "planCards", "offerBadge", "stampText"];
const CANDIDATES = ["priceTag", "priceCompare", "offerBadge", "stampText"];

test("Venta elements expose the screen controls (slot, captions, push) and validate them", () => {
  for (const type of VENTA) {
    const d = Lib.get(type);
    assert.ok(d.screen.some((f) => f.key === "slot") && d.screen.some((f) => f.key === "captions") && d.screen.some((f) => f.key === "push"), type);
    assert.ok(Lib.validate({ ...d.defaults(0, 5), slot: "left" }, type).errors.some((e) => e.includes("slot")), `${type}: a bad slot is an error`);
  }
});

test("the push control moves the card forward around its centre and never past the safe width", () => {
  const base = { id: "p", type: "stampText", in: 0, out: 3, text: "VENDIDO" };
  const at = (push) => { const log = []; Lib.draw(recorder(log), { ...base, push }, 1.5, env()); return log.filter((l) => l.startsWith("scale(")); };
  assert.deepEqual(at(undefined).filter((l) => !l.startsWith("scale(1,1)")), at(0).filter((l) => !l.startsWith("scale(1,1)")) , "no push when absent");
  assert.ok(at(0.1).some((l) => /^scale\(1\.0\d*,/.test(l) && !l.startsWith("scale(1,")), "push 0.1 scales the card above 1");
});

test("candidates: one position per slot, an explicit slot is a preference (others cost PIN_PENALTY more), and the cost follows the slot", () => {
  for (const type of CANDIDATES) {
    const d = Lib.get(type);
    const e = { id: "c", type, in: 0, out: 3, ...d.defaults(0, 5) };
    const all = d.candidates({ ...e, slot: undefined }, ZONES, env());
    assert.deepEqual(all.map((c) => c.patch.slot), ["band", "center", "top"], type);
    for (const c of all) {
      assert.equal(c.cost, SLOT_COST[c.patch.slot]);
      assert.ok(c.rect.x >= 60 && c.rect.x + c.rect.w <= 1020 && c.rect.y >= 350 && c.rect.y + c.rect.h <= 1540, `${type}/${c.name} stays in the free area`);
    }
    const pinned = d.candidates({ ...e, slot: "top" }, ZONES, env());
    assert.equal(pinned.find((c) => c.patch.slot === "top").cost, 0, `${type}: the chosen slot is free`);
    for (const c of pinned.filter((x) => x.patch.slot !== "top")) assert.ok(c.cost >= Lib.PIN_PENALTY, `${type}: leaving the chosen slot costs PIN_PENALTY`);
    assert.equal(Lib.hasCandidates(e), true);
  }
});

test("priceTag never shows a fake zero: the amount is blank until the count starts", () => {
  const el = { id: "pt", type: "priceTag", in: 0, out: 3, label: "Sillón", value: 12990, prefix: "desde" };
  const early = []; Lib.draw(recorder(early), el, 0.05, env());
  assert.ok(!early.some((l) => l.startsWith("fillText($0,") || l.startsWith("fillText(0,")), "no $0 before the count");
  assert.ok(!early.some((l) => /^fillText\(\$/.test(l)), "no amount at all before the count beat");
  const late = []; Lib.draw(recorder(late), el, 2.4, env());
  assert.ok(late.some((l) => l.includes("$12,990")), "the exact value at the end");
});
