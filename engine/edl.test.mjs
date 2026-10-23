// node --test engine/edl.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import * as E from "./edl.js";

const bin = [{ name: "a", dur: 10 }, { name: "b", dur: 6 }];
const near = (x, y, m = "") => assert.ok(Math.abs(x - y) < 1e-6, `${m} ${x} != ${y}`);

test("identity: duration is the sum and outToSrc is the identity inside each clip", () => {
  const e = E.identity(bin);
  near(E.duration(e), 16);
  let r = E.outToSrc(e, 4);
  assert.equal(r.clip, "a"); near(r.srcT, 4);
  r = E.outToSrc(e, 12);
  assert.equal(r.clip, "b"); near(r.srcT, 2);
  near(E.srcToOut(e, "b", 2), 12);
  assert.equal(E.srcToOut(e, "b", 7), null);
});

test("round trip outToSrc -> srcToOut after trims and a move", () => {
  let e = E.identity(bin);
  e = E.trim(e, "s1", "in", 1.5).edl; // a: 1.5..10
  e = E.trim(e, "s2", "out", 4, 6).edl; // b: 0..4
  e = E.move(e, "s1", 1).edl; // b, a
  near(E.duration(e), 4 + 8.5);
  for (const t of [0, 0.5, 3.99, 4, 7.3, 12.4]) {
    const r = E.outToSrc(e, t);
    near(E.srcToOut(e, r.clip, r.srcT, r.seg), t, `t=${t}`);
  }
});

test("trim clamps to the clip and keeps MIN_SEG", () => {
  const e = E.identity(bin);
  assert.equal(E.trim(e, "s1", "out", 99, 10).edl.segments[0].out, 10);
  assert.equal(E.trim(e, "s1", "in", -3).edl.segments[0].in, 0);
  near(E.trim(e, "s1", "in", 9.99).edl.segments[0].in, 10 - E.MIN_SEG);
});

test("split keeps the total and joins with a cut", () => {
  const e = E.identity(bin);
  const r = E.split(e, 3);
  near(E.duration(r.edl), 16);
  assert.equal(r.edl.segments.length, 3);
  assert.equal(r.edl.segments[0].out, 3);
  assert.equal(r.edl.segments[1].in, 3);
  for (const t of [0, 2.9, 3, 3.1, 9.9, 10, 15.9]) near(r.remap.point(t), t, `identity remap t=${t}`);
  assert.ok(E.split(e, 0.05).error); // too close to the edge
});

test("delete + removeRange ripple points and intervals", () => {
  const e = E.identity(bin);
  const r = E.removeRange(e, 3, 6); // cut 3 s out of clip a
  near(E.duration(r.edl), 13);
  assert.equal(r.edl.segments.map((s) => s.clip).join(), "a,a,b");
  near(r.remap.point(2), 2);
  assert.equal(r.remap.point(4), null); // inside the removed range
  near(r.remap.point(7), 4); // after: 3 s earlier
  near(r.remap.point(12), 9);
  near(r.remap.point(20), 17); // beyond the video (CTA): follows the end
  assert.deepEqual(r.remap.interval(3.5, 5.5), null); // entirely inside
  assert.deepEqual(r.remap.interval(2, 8), [2, 5]); // straddles: shrinks to what survives
  assert.deepEqual(r.remap.interval(7, 9), [4, 6]);
  const d = E.remove(e, "s2");
  near(E.duration(d.edl), 10);
  assert.ok(E.remove(d.edl, "s1").error); // last segment cannot be removed
});

test("move reorders and elements follow their material", () => {
  const e = E.identity(bin);
  const r = E.move(e, "s2", 0); // b first
  near(r.remap.point(11), 1); // old t=11 was b@1, b is now first
  near(r.remap.point(4), 10); // old t=4 was a@4, a now starts at 6
});

test("transitions: overlap model shortens the total by d", () => {
  let e = E.identity(bin);
  e = E.setTransition(e, "s2", { type: "fade", dur: 1 }).edl;
  near(E.duration(e), 15);
  const L = E.layout(e);
  near(L.segs[1].start, 9);
  // before the overlap: only a; inside: a under, b over with alpha; after: only b
  let r = E.outToSrc(e, 8.9);
  assert.equal(r.layers.length, 1); assert.equal(r.clip, "a");
  r = E.outToSrc(e, 9.25);
  assert.equal(r.layers.length, 2);
  assert.equal(r.layers[0].clip, "a"); near(r.layers[0].srcT, 9.25);
  assert.equal(r.layers[1].clip, "b"); near(r.layers[1].srcT, 0.25); near(r.layers[1].alpha, 0.25);
  assert.equal(r.blend.clip2, "a");
  r = E.outToSrc(e, 10.5);
  assert.equal(r.layers.length, 1); assert.equal(r.clip, "b"); near(r.srcT, 1.5);
  // dip: first half outgoing + plate rising, second half incoming + plate falling
  e = E.setTransition(e, "s2", { type: "dipBlack", dur: 1 }).edl;
  r = E.outToSrc(e, 9.25);
  assert.equal(r.clip, "a"); near(r.plate.a, 0.5); assert.equal(r.plate.color, "black");
  r = E.outToSrc(e, 9.75);
  assert.equal(r.clip, "b"); near(r.plate.a, 0.5);
  r = E.outToSrc(e, 9.5);
  near(r.plate.a, 1);
  e = E.setTransition(e, "s2", { type: "dipWhite", dur: 1 }).edl;
  assert.equal(E.outToSrc(e, 9.5).plate.color, "white");
  // transitions are capped to half the neighbours
  const big = E.normalize({ segments: [{ clip: "a", in: 0, out: 1 }, { clip: "b", in: 0, out: 1, transition: { type: "fade", dur: 5 } }] }, bin);
  near(big.edl.segments[1].transition.dur, 0.5);
});

test("head fade-in and tail fade-out do not shorten", () => {
  let e = E.identity(bin);
  e = E.setTransition(e, "s1", { type: "dipBlack", dur: 0.5 }).edl;
  e = E.setFadeOut(e, { type: "dipBlack", dur: 1 }).edl;
  near(E.duration(e), 16);
  near(E.outToSrc(e, 0).plate.a, 1);
  near(E.outToSrc(e, 0.25).plate.a, 0.5);
  assert.equal(E.outToSrc(e, 0.6).plate, undefined);
  near(E.outToSrc(e, 15.5).plate.a, 0.5);
  near(E.outToSrc(e, 16).plate.a, 1);
});

test("remap keeps motion attached to the video through a transition change", () => {
  let e = E.identity(bin);
  const r = E.setTransition(e, "s2", { type: "fade", dur: 1 }); // b moves 1 s earlier
  near(r.remap.point(12), 11);
  near(r.remap.point(5), 5);
});

test("remapWords drops words outside the cut and crossing its edges", () => {
  const words = { a: [{ word: "uno", start: 0.5, end: 1 }, { word: "dos", start: 2, end: 3 }, { word: "tres", start: 4, end: 5 }, { word: "cuatro", start: 8, end: 9 }], b: [{ word: "cinco", start: 1, end: 2 }] };
  const e = E.removeRange(E.identity(bin), 2.5, 6).edl; // keeps a:0..2.5 and a:6..10, then b
  const w = E.remapWords(e, words);
  assert.deepEqual(w.map((x) => x.word), ["uno", "cuatro", "cinco"]); // "dos" crosses the cut at 2.5, "tres" is removed
  near(w[1].start, 4.5); // cuatro 8 -> 8 - 3.5
  near(w[2].start, 2.5 + 4 + 1);
  // head trim at a word boundary keeps the word
  const t = E.trim(E.identity(bin), "s1", "in", 2).edl;
  assert.deepEqual(E.remapWords(t, words).map((x) => x.word), ["dos", "tres", "cuatro", "cinco"]);
  near(E.remapWords(t, words)[0].start, 0);
});

test("audioPlan: seams, crossfade, dip halves, head/tail fades", () => {
  let e = E.identity(bin);
  let p = E.audioPlan(e);
  assert.equal(p.length, 2);
  assert.deepEqual(p[0].fades.map((f) => f.type), ["out"]);
  near(p[1].fades.find((f) => f.type === "in").d, 0.01);
  e = E.setTransition(e, "s2", { type: "fade", dur: 1 }).edl;
  p = E.audioPlan(e);
  near(p[1].delay, 9);
  near(p[0].fades.find((f) => f.type === "out").d, 1); near(p[0].fades.find((f) => f.type === "out").st, 9);
  e = E.setTransition(e, "s2", { type: "dipBlack", dur: 1 }).edl;
  p = E.audioPlan(e);
  near(p[0].fades.find((f) => f.type === "out").d, 0.5);
  near(p[1].fades.find((f) => f.type === "in").st, 0.5);
});

test("lint warns on short segments and mid-video dissolves", () => {
  let e = E.identity(bin);
  e = E.setTransition(e, "s2", { type: "fade", dur: 0.4 }).edl;
  assert.equal(E.lint(e).length, 1);
  e = E.trim(e, "s1", "out", 0.3, 10).edl;
  assert.ok(E.lint(e).some((l) => /menos de/.test(l.msg)));
});

test("normalize reports unknown clips and out-of-range values", () => {
  const r = E.normalize({ segments: [{ clip: "zzz", in: 0, out: 1 }, { clip: "a", in: -2, out: 99 }] }, bin);
  assert.equal(r.errors.length, 1);
  assert.equal(r.edl.segments[0].in, 0); assert.equal(r.edl.segments[0].out, 10);
});

test("a transition overlap belongs to the incoming segment when remapping intervals", () => {
  const e = E.setTransition(E.identity(bin), "s2", { type: "fade", dur: 1 }).edl; // s2 starts at 9
  const moved = E.move(e, "s2", 0); // b first
  // an interval inside the overlap [9,10] belongs to b (incoming): it must not also drag in a's tail
  const iv = moved.remap.interval(9.2, 9.8);
  assert.ok(iv[1] - iv[0] < 0.7 && iv[0] < 1, JSON.stringify(iv));
});

test("an interval straddling a cut stays one block after the two sides move far apart", () => {
  const e = E.split(E.identity(bin), 5).edl; // a: 0..5 | 5..10, b 10..16
  const right = e.segments[1].id;
  const moved = E.move(e, right, 2); // a0..5, b, a5..10 -> the old 4.5..6 straddles pieces now ~6 s apart
  const iv = moved.remap.interval(4.5, 6);
  assert.ok(iv && iv[1] - iv[0] <= 1.0 + 1e-6, JSON.stringify(iv)); // the larger piece (1 s), not the hull
  // adjacent pieces (a plain split) still give the whole interval
  const sp = E.split(E.identity(bin), 5);
  assert.deepEqual(sp.remap.interval(4.5, 6), [4.5, 6]);
});

// ---------- speed ----------
import { readFileSync } from "node:fs";
import { snapshot } from "./test-fixtures/edl-cases.mjs";

test("speed-less EDLs: plans and ops are deep-equal to the frozen pre-speed snapshot", () => {
  const frozen = JSON.parse(readFileSync(new URL("./test-fixtures/edl-plans.json", import.meta.url), "utf8"));
  assert.deepEqual(snapshot(), frozen);
});

const sped = (speed) => ({ version: 1, segments: [{ id: "s1", clip: "a", in: 0, out: 4 }, { id: "s2", clip: "b", in: 1, out: 5, speed }, { id: "s3", clip: "a", in: 6, out: 8 }] });

test("speed: normalize validates, rounds and drops 1", () => {
  let n = E.normalize(sped(2), bin);
  assert.equal(n.edl.segments[1].speed, 2);
  assert.equal(E.normalize(sped(1), bin).edl.segments[1].speed, undefined);
  assert.equal(E.normalize(sped(0.33333), bin).edl.segments[1].speed, 0.333);
  n = E.normalize(sped(9), bin);
  assert.equal(n.edl.segments[1].speed, E.SPEED_MAX);
  assert.ok(n.warnings.length);
  n = E.normalize(sped("abc"), bin);
  assert.equal(n.edl.segments[1].speed, undefined);
  assert.ok(n.warnings.length);
});

test("speed: layout, outToSrc and srcToOut follow the rate", () => {
  const e = E.normalize(sped(2), bin).edl; // s2 plays 4 source seconds in 2 output seconds
  const L = E.layout(e);
  near(L.segs[1].len, 2); near(L.segs[1].start, 4); near(L.segs[2].start, 6);
  near(E.duration(e), 8);
  assert.equal(L.segs[0].speed, undefined);
  let r = E.outToSrc(e, 5);
  assert.equal(r.clip, "b"); near(r.srcT, 3); // 1 s into the segment = 2 source seconds
  near(E.srcToOut(e, "b", 3), 5);
  near(E.srcToOut(e, "b", 5), 6);
  const slow = E.normalize(sped(0.5), bin).edl;
  near(E.duration(slow), 4 + 8 + 2);
  near(E.outToSrc(slow, 8).srcT, 3);
  for (const t of [4, 4.5, 7.9, 11.9]) { r = E.outToSrc(slow, t); near(E.srcToOut(slow, r.clip, r.srcT, r.seg), t, `t=${t}`); }
});

test("speed: split keeps the rate on both halves and the total", () => {
  const e = E.normalize(sped(2), bin).edl;
  const r = E.split(e, 5); // 1 s into s2 = source 3
  assert.equal(r.edl.segments.length, 4);
  assert.equal(r.edl.segments[1].out, 3);
  assert.equal(r.edl.segments[2].in, 3);
  assert.equal(r.edl.segments[1].speed, 2);
  assert.equal(r.edl.segments[2].speed, 2);
  near(E.duration(r.edl), 8);
  for (const t of [0, 3.9, 4.5, 5, 5.5, 7, 7.9]) near(r.remap.point(t), t, `t=${t}`);
});

test("speed: trim is in source seconds and the remapper follows the material", () => {
  const e = E.normalize(sped(2), bin).edl;
  const r = E.trim(e, "s2", "out", 3, 6); // 2 source seconds left -> 1 output second
  near(E.layout(r.edl).segs[1].len, 1);
  near(E.duration(r.edl), 7);
  near(r.remap.point(4.5), 4.5); // still inside
  near(r.remap.point(7), 6); // the tail moved 1 s earlier
  assert.equal(r.remap.point(5.5), null); // trimmed away
  const iv = r.remap.interval(4.2, 5.8);
  near(iv[0], 4.2); near(iv[1], 5);
  const mv = E.move(e, "s2", 0);
  near(mv.remap.point(5), 1); // s2 now starts at 0: old t=5 was 1 s into it
});

test("speed: remapWords scales words (when present) and audioPlan mutes sped segments", () => {
  const e = E.normalize(sped(2), bin).edl;
  const w = E.remapWords(e, { b: [{ word: "x", start: 2, end: 3 }] });
  near(w[0].start, 4.5); near(w[0].end, 5);
  const ap = E.audioPlan(e);
  assert.equal(ap[1].muted, true);
  assert.equal("muted" in ap[0], false);
  assert.equal("muted" in ap[2], false);
  near(ap[1].len, 2);
  near(ap[2].delay, 6);
});

test("speed: voice rule in normalize (words strip the speed) and setSpeed", () => {
  const words = { a: [{ word: "hola", start: 1, end: 1.5 }], b: [{ word: "x", start: 8, end: 8.5 }] };
  const n = E.normalize({ version: 1, segments: [{ id: "s1", clip: "a", in: 0, out: 4, speed: 2 }, { id: "s2", clip: "b", in: 1, out: 5, speed: 2 }] }, bin, words);
  assert.equal(n.edl.segments[0].speed, undefined);
  assert.equal(n.edl.segments[1].speed, 2);
  assert.deepEqual(n.warnings, ["segmento 1: tiene voz, se ignora el cambio de velocidad"]);
  assert.ok(E.hasWords(words.a, 0, 4));
  assert.ok(!E.hasWords(words.a, 1.49, 4)); // 10 ms overlap is inside the tolerance
  assert.ok(!E.hasWords(words.b, 0, 4));
  const id = E.identity(bin);
  let r = E.setSpeed(id, "s1", 2, words);
  assert.equal(r.error, "Esta toma tiene voz; cambiar la velocidad rompería la sincronía de los labios");
  r = E.setSpeed(id, "s2", 2, words);
  assert.equal(r.edl.segments[1].speed, 2);
  near(E.duration(r.edl), 10 + 3);
  assert.ok(r.remap.point(12) !== null);
  assert.ok(E.setSpeed(id, "s2", 5, words).error);
  assert.ok(E.setSpeed(id, "s2", 0.1, words).error);
  assert.ok(E.setSpeed(id, "nope", 2, words).error);
  assert.equal(E.setSpeed(r.edl, "s2", 1, words).edl.segments[1].speed, undefined);
  assert.equal(E.setSpeed(r.edl, "s2", null).edl.segments[1].speed, undefined);
});

test("speed: insertClip accepts a speed (stills can be stretched)", () => {
  const r = E.insertClip(E.identity(bin), "b", 0, 6, 1, 0.5);
  assert.equal(r.edl.segments[1].speed, 0.5);
  near(E.duration(r.edl), 10 + 12 + 6);
  assert.equal("speed" in E.insertClip(E.identity(bin), "b", 0, 6, 1).edl.segments[1], false);
});
