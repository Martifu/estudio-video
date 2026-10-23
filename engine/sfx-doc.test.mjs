// node --test engine/sfx-doc.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { evKey, checkSfxDoc, mergeSfx, emptyDoc, parseSrc } from "./sfx-doc.js";

const events = [
  { t: 1, type: "pop", x: -0.5, key: "kw1:pop" },
  { t: 2.5, type: "whoosh", x: 0.2, key: "#1:whoosh" },
  { t: 4, type: "pop", x: 0, key: "ws:pop:0" },
  { t: 4.5, type: "pop", x: 0, key: "ws:pop:1" },
  { t: 6.126, type: "notify", x: 0 }, // no key
];

test("evKey falls back to type@t", () => {
  assert.equal(evKey(events[0]), "kw1:pop");
  assert.equal(evKey(events[4]), "notify@6.13");
});

test("mergeSfx without a doc lists the automatic events", () => {
  const m = mergeSfx(events, null);
  assert.equal(m.length, 5);
  assert.deepEqual(m[0], { key: "kw1:pop", t: 1, baseT: 1, type: "pop", x: -0.5, src: null, gainDb: 0, muted: false, added: false, auto: true });
  assert.deepEqual(mergeSfx(events, emptyDoc()), m);
});

test("mergeSfx applies overrides, ignores stale keys and sorts added sounds in", () => {
  const doc = {
    version: 1,
    events: { "kw1:pop": { t: 3, gainDb: -3 }, "#1:whoosh": { muted: true }, "ws:pop:1": { src: "lib:ding", gainDb: 2 }, "gone:pop": { t: 9 } },
    added: [{ id: "a1", t: 0.5, src: "kit:pop", label: "Clic" }, { id: "a2", t: 4, src: "path:assets/media/audio-ab12cd34.wav", gainDb: -6 }],
  };
  assert.equal(checkSfxDoc(doc), null);
  const m = mergeSfx(events, doc);
  assert.equal(m.length, 7); // the stale override adds nothing
  assert.deepEqual(m.map((r) => r.key), ["a1", "#1:whoosh", "kw1:pop", "ws:pop:0", "a2", "ws:pop:1", "notify@6.13"]);
  const kw = m.find((r) => r.key === "kw1:pop");
  assert.equal(kw.t, 3); assert.equal(kw.baseT, 1); assert.equal(kw.gainDb, -3);
  assert.equal(m.find((r) => r.key === "#1:whoosh").muted, true);
  const ws = m.find((r) => r.key === "ws:pop:1");
  assert.equal(ws.src, "lib:ding"); assert.equal(ws.gainDb, 2);
  const a2 = m.find((r) => r.id === "a2");
  assert.deepEqual(a2, { key: "a2", id: "a2", t: 4, baseT: 4, type: "custom", x: 0, src: "path:assets/media/audio-ab12cd34.wav", gainDb: -6, muted: false, added: true, auto: false });
  assert.equal(m[0].label, "Clic");
  // order of equal times is stable: automatic first, then added
  assert.ok(m.indexOf(m.find((r) => r.key === "ws:pop:0")) < m.indexOf(a2));
});

test("checkSfxDoc rejects bad documents with Spanish messages", () => {
  assert.equal(checkSfxDoc(emptyDoc()), null);
  assert.equal(checkSfxDoc({}), null);
  const bad = [
    null, [], { foo: 1 }, { version: 2 }, { events: [] }, { events: { a: 1 } },
    { events: { a: { x: 1 } } }, { events: { a: { t: -1 } } }, { events: { a: { t: NaN } } }, { events: { a: { t: "1" } } },
    { events: { a: { muted: 1 } } }, { events: { a: { gainDb: 13 } } }, { events: { a: { gainDb: -25 } } }, { events: { a: { src: "lib:" } } },
    { added: {} }, { added: [{ t: 1, src: "kit:pop" }] }, { added: [{ id: "a", t: -1, src: "kit:pop" }] }, { added: [{ id: "a", t: 1 }] },
    { added: [{ id: "a", t: 1, src: "kit:pop" }, { id: "a", t: 2, src: "kit:pop" }] }, { added: [{ id: "a", t: 1, src: "kit:boom" }] },
    { added: [{ id: "a", t: 1, src: "kit:pop", extra: 1 }] }, { added: [{ id: "a", t: 1, src: "kit:pop", gainDb: 99 }] },
  ];
  for (const d of bad) {
    const e = checkSfxDoc(d);
    assert.equal(typeof e, "string", JSON.stringify(d));
    assert.ok(e.length > 5);
  }
});

test("src forms: lib, kit and a confined path", () => {
  for (const ok of ["lib:ding", "lib:swoosh-up_2", "kit:pop", "kit:whoosh", "kit:notify", "path:assets/media/audio-ab12cd34.wav", "path:music/a b.wav"]) assert.ok(parseSrc(ok), ok);
  for (const no of ["", "lib", "lib:", "lib:a/b", "kit:x", "path:", "path:/etc/passwd", "path:../x.wav", "path:a/../../x.wav", "path:a//b.wav", "path:C:/x.wav", "path:http://x/y.wav", "path:a\\b.wav", "path:.studio/x.wav", "path:a/./b.wav", "file:x", 5, null]) assert.equal(parseSrc(no), null, String(no));
});

test("brand-layer motionEvents emits stable keys", async () => {
  // brand-layer needs a canvas; read the source instead of importing it
  const src = readFileSync(new URL("./brand-layer.js", import.meta.url), "utf8");
  assert.ok(src.includes("key: `${id}:${type}"));
});
