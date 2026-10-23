// Integration of media (stable event keys for sfx.json) and product (new element types): every element type that emits an SFX event
// must carry a unique, stable `key`.
import test from "node:test";
import assert from "node:assert/strict";
import * as B from "./brand-layer.js";

test("motionEvents: product elements emit keyed events too", () => {
  const ev = B.motionEvents([
    { id: "a", type: "productCard", product: "p", in: 1, out: 4 },
    { id: "b", type: "productPop", product: "p", in: 2, out: 5 },
    { id: "c", type: "carousel", slides: [{ product: "p" }, { product: "q" }], in: 3, out: 8 },
    { type: "keywordPop", text: "HOLA", in: 0.5, out: 2 }
  ]);
  assert.equal(ev.length, 4);
  assert.ok(ev.every((e) => typeof e.key === "string" && e.key.length));
  assert.equal(new Set(ev.map((e) => e.key)).size, 4);
  assert.deepEqual(ev.map((e) => e.key), ["#3:pop", "a:whoosh", "b:pop", "c:whoosh"]);
});

test("motionEvents: ui elements emit keyed pop / whoosh / notify / click events (<id>:<type>:<n>), none when hidden", () => {
  const list = { id: "inv", type: "uiList", in: 1, out: 6, rows: [{ title: "a", value: 1 }, { title: "b", value: 2 }], select: 1, tag: "b" };
  const ev = B.motionEvents([list, { id: "q", type: "uiDoc", in: 7, out: 11, brand: "X", title: "T", rows: [{ label: "a", value: "$1" }, { label: "b", value: "$2" }], highlight: 1, lift: { label: "b", value: "$2" } }, { ...list, id: "off", hidden: true }]);
  assert.deepEqual(ev.map((e) => e.key), ["inv:pop:0", "inv:click:0", "inv:pop:1", "q:whoosh:0", "q:pop:0"]);
  assert.deepEqual(ev.map((e) => e.type), ["pop", "click", "pop", "whoosh", "pop"]);
  assert.equal(new Set(ev.map((e) => e.key)).size, ev.length);
});

test("motionEvents: kineticWord and logoSting emit keyed events (<id>:<type>:<n>); slam uses pop, rise uses whoosh; hidden = none", () => {
  const ev = B.motionEvents([
    { id: "kw1", type: "kineticWord", in: 1, out: 3.4, text: "VENTAS" },
    { id: "kw2", type: "kineticWord", in: 4, out: 6.4, text: "HOY", style: "slam" },
    { id: "ls1", type: "logoSting", in: 8, out: 11, url: "reda.mx" },
    { id: "off", type: "kineticWord", in: 9, out: 10, text: "X", hidden: true }
  ]);
  assert.deepEqual(ev.map((e) => e.key), ["kw1:whoosh:0", "kw2:pop:0", "ls1:whoosh:0", "ls1:pop:0"]);
  assert.deepEqual(ev.map((e) => e.type), ["whoosh", "pop", "whoosh", "pop"]);
  assert.equal(new Set(ev.map((e) => e.key)).size, ev.length);
  assert.ok(ev.every((e) => e.x >= -1 && e.x <= 1));
});
