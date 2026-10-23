// node --test engine/studio/test/lane-logic.test.mjs  (pure client logic: drop point on the Video lane, sfx marker edits -> sfx.json patches)
import test from "node:test";
import assert from "node:assert/strict";
import * as Edl from "../../edl.js";
import { mergeSfx, checkSfxDoc } from "../../sfx-doc.js";
import { dropPoint, insertAtDrop } from "../client/drop.js";
import * as E from "../client/sfxedit.js";

const edl = () => ({ version: 1, segments: [{ id: "a", clip: "c1", in: 0, out: 4 }, { id: "b", clip: "c2", in: 0, out: 6 }] }); // a 0-4, b 4-10

test("dropPoint: near a boundary snaps to it, inside a segment splits", () => {
  assert.deepEqual(dropPoint(Edl, edl(), 4.05, 0.15), { kind: "boundary", t: 4, index: 1 });
  assert.deepEqual(dropPoint(Edl, edl(), 0.05, 0.15), { kind: "boundary", t: 0, index: 0 });
  assert.deepEqual(dropPoint(Edl, edl(), 9.95, 0.15), { kind: "boundary", t: 10, index: 2 });
  const d = dropPoint(Edl, edl(), 6, 0.15);
  assert.equal(d.kind, "split"); assert.equal(d.index, 2);
});
test("insertAtDrop: split inserts between the halves; boundary inserts at the index; total grows by the clip length", () => {
  const r = insertAtDrop(Edl, edl(), "c3", 2, dropPoint(Edl, edl(), 6, 0.15));
  assert.deepEqual(r.edl.segments.map((s) => s.clip), ["c1", "c2", "c3", "c2"]);
  assert.equal(Edl.duration(r.edl), 12);
  const r2 = insertAtDrop(Edl, edl(), "c3", 2, { kind: "boundary", t: 0, index: 0 });
  assert.equal(r2.edl.segments[0].clip, "c3");
  // the motion that sat on c2 follows it (ripple through the remapper)
  assert.ok(Math.abs(r2.remap.point(5) - 7) < 1e-6);
});
test("insertAtDrop keeps working with a retimed segment around", () => {
  const e = edl(); e.segments[1].speed = 2; // b plays 3 s
  const r = insertAtDrop(Edl, e, "c3", 2, dropPoint(Edl, e, 5.5, 0.15));
  assert.equal(r.edl.segments.length, 4);
  assert.ok(Math.abs(Edl.duration(r.edl) - (4 + 3 + 2)) < 1e-6);
});

const events = [{ key: "e1:in", t: 1, type: "pop" }, { key: "e2:in", t: 3, type: "whoosh" }];
test("moveEvent: auto event overrides only t; moving back clears the override", () => {
  let d = E.moveEvent(null, mergeSfx(events, null)[0], 1.5);
  assert.deepEqual(d.events, { "e1:in": { t: 1.5 } });
  const ev = mergeSfx(events, d)[0];
  assert.equal(ev.t, 1.5); assert.equal(ev.baseT, 1);
  assert.equal(E.moveEvent(d, ev, 1.001), null); // back to its own time: no doc left
  assert.equal(checkSfxDoc(d), null);
});
test("added events: add, move, change sound, volume, delete", () => {
  const { doc, id } = E.addEvent(null, { t: 2, src: "lib:click" });
  assert.equal(checkSfxDoc(doc), null);
  let ev = mergeSfx(events, doc).find((x) => x.id === id);
  let d = E.moveEvent(doc, ev, 2.4);
  assert.equal(d.added[0].t, 2.4);
  ev = mergeSfx(events, d).find((x) => x.id === id);
  d = E.setSrc(d, ev, "kit:pop");
  d = E.setGain(d, ev, 40); // clamped to +12
  assert.equal(d.added[0].src, "kit:pop"); assert.equal(d.added[0].gainDb, 12);
  assert.equal(checkSfxDoc(d), null);
  assert.equal(E.deleteEvent(d, ev), null);
});
test("deleting an automatic event mutes it; Silenciar/Activar toggles; undo-able as plain doc values", () => {
  const ev = mergeSfx(events, null)[1];
  const d = E.deleteEvent(null, ev);
  assert.deepEqual(d.events, { "e2:in": { muted: true } });
  assert.equal(mergeSfx(events, d)[1].muted, true);
  assert.equal(E.setMuted(d, mergeSfx(events, d)[1], false), null);
  assert.equal(E.setMuted(null, { added: true, id: "x" }, true), null); // hand-placed sounds have no mute: they are deleted
});
