// node --test edl-transitions.test.mjs   (run from engine/; no DOM needed)
// Registry transitions in the EDL (engine/edl.js) and the legacy invariants they must not change.
import test from "node:test";
import assert from "node:assert/strict";
import * as E from "./edl.js";
import { quantU, get as getTr } from "./transitions/index.js";

const BIN = [{ name: "a", dur: 6 }, { name: "b", dur: 5 }, { name: "c", dur: 4 }];
const seg = (id, clip, inn, out, transition) => ({ id, clip, in: inn, out, ...(transition ? { transition } : {}) });

test("legacy-only EDL: normalize output is the stored expected object", () => {
  const input = {
    segments: [
      { clip: "a", in: 0.5, out: 3 },
      { clip: "b", in: 0, out: 4, transition: { type: "fade", dur: 0.4 } },
      { clip: "c", in: 1, out: 3, transition: { type: "dipBlack", dur: 0.9 } },
    ],
  };
  const { edl, errors, warnings } = E.normalize(input, BIN);
  assert.deepEqual(errors, []);
  assert.deepEqual(warnings, []);
  assert.deepEqual(edl, {
    version: 1,
    segments: [
      { id: "s1", clip: "a", in: 0.5, out: 3 },
      { id: "s2", clip: "b", in: 0, out: 4, transition: { type: "fade", dur: 0.4 } },
      { id: "s3", clip: "c", in: 1, out: 3, transition: { type: "dipBlack", dur: 0.9 } },
    ],
  });
  assert.equal(E.duration(edl), 7.2);
});

test("legacy transition without dur keeps the 0.4 s fallback", () => {
  const { edl } = E.normalize({ segments: [{ clip: "a", in: 0, out: 3 }, { clip: "b", in: 0, out: 3, transition: { type: "fade" } }] }, BIN);
  assert.equal(edl.segments[1].transition.dur, 0.4);
});

test("isTransition and descriptorOf", () => {
  assert.equal(E.isTransition("fade"), true);
  assert.equal(E.isTransition("blurCross"), true);
  assert.equal(E.isTransition("nope"), false);
  assert.equal(E.descriptorOf("blurCross").audio, "crossfade");
  assert.equal(E.descriptorOf("fade"), undefined);
});

test("registry dur: default when missing, clamped to [minDur, maxDur] with a warning", () => {
  const d = getTr("flashWhite");
  const mk = (dur) => ({ segments: [{ id: "x1", clip: "a", in: 0, out: 3 }, { id: "x2", clip: "b", in: 0, out: 3, transition: { type: "flashWhite", dur } }] });
  const dflt = E.normalize(mk(undefined), BIN);
  assert.equal(dflt.edl.segments[1].transition.dur, d.defaultDur);
  const high = E.normalize(mk(5), BIN);
  assert.equal(high.edl.segments[1].transition.dur, d.maxDur);
  assert.ok(high.warnings.some((w) => w.includes("segmento 2") && w.includes("se ajustó")));
  const low = E.normalize(mk(0.01), BIN);
  assert.equal(low.edl.segments[1].transition.dur, d.minDur);
});

test("registry params: only keys known to the descriptor are kept", () => {
  const input = { segments: [{ id: "x1", clip: "a", in: 0, out: 3 }, { id: "x2", clip: "b", in: 0, out: 3, transition: { type: "fadeColor", dur: 0.5, params: { color: "blanco", extra: 1 } } }] };
  const { edl } = E.normalize(input, BIN);
  assert.deepEqual(edl.segments[1].transition, { type: "fadeColor", dur: 0.5, params: { color: "blanco" } });
});

test("first segment: fadeColor becomes dipWhite (blanco) or dipBlack; other registry kinds are removed with a warning", () => {
  const first = (type, params) => ({ segments: [{ id: "x1", clip: "a", in: 0, out: 3, transition: { type, dur: 0.6, ...(params ? { params } : {}) } }, { id: "x2", clip: "b", in: 0, out: 3 }] });
  const white = E.normalize(first("fadeColor", { color: "blanco" }), BIN);
  assert.deepEqual(white.edl.segments[0].transition, { type: "dipWhite", dur: 0.6 });
  const black = E.normalize(first("fadeColor"), BIN);
  assert.deepEqual(black.edl.segments[0].transition, { type: "dipBlack", dur: 0.6 });
  const removed = E.normalize(first("flashWhite"), BIN);
  assert.equal(removed.edl.segments[0].transition, undefined);
  assert.ok(removed.warnings.includes("segmento 1: la primera toma no tiene transición de entrada"));
});

test("layout: a registry kind overlaps exactly like a legacy one of the same dur", () => {
  const legacy = E.normalize({ segments: [seg("p", "a", 0, 3), seg("q", "b", 0, 3, { type: "fade", dur: 0.5 })] }, BIN).edl;
  const reg = E.normalize({ segments: [seg("p", "a", 0, 3), seg("q", "b", 0, 3, { type: "blurCross", dur: 0.5 })] }, BIN).edl;
  const L = E.layout(legacy), R = E.layout(reg);
  assert.equal(R.segs[1].d, L.segs[1].d);
  assert.equal(R.segs[1].start, L.segs[1].start);
  assert.equal(R.duration, L.duration);
  assert.equal(R.segs[1].kind, "blurCross");
});

test("outToSrc inside a registry overlap: two full-alpha layers, no plate, fx with quantised u and seed", () => {
  const edl = E.normalize({ segments: [seg("p", "a", 0, 3), seg("q", "b", 0, 3, { type: "whipPan", dur: 0.4, params: { dir: "arriba" } })] }, BIN).edl;
  const L = E.layout(edl);
  const s = L.segs[1];
  const t = s.start + 0.2; // 6 frames into a 0.4 s overlap (12 frames)
  const r = E.outToSrc(edl, t);
  assert.equal(r.layers.length, 2);
  assert.deepEqual(r.layers.map((l) => l.alpha), [1, 1]);
  assert.equal(r.layers[0].clip, "a");
  assert.equal(r.layers[1].clip, "b");
  assert.equal(r.plate, undefined);
  const q = quantU(t - s.start, s.d);
  assert.deepEqual(r.fx, { type: "whipPan", u: q.u, params: { dir: "arriba" }, seed: 2 });
  assert.equal(r.fx.u, 0.5);
  // after the overlap: the plain incoming segment, no fx
  const after = E.outToSrc(edl, s.start + s.d + 0.05);
  assert.equal(after.fx, undefined);
  assert.equal(after.layers.length, 1);
});

test("quantU: frame accuracy at 30 fps", () => {
  assert.deepEqual(quantU(0, 0.5), { u: 0, frame: 0, frames: 15 });
  assert.deepEqual(quantU(0.25, 0.5), { u: 7 / 15, frame: 7, frames: 15 });
  assert.deepEqual(quantU(0.5, 0.5), { u: 1, frame: 15, frames: 15 });
  assert.equal(quantU(-1, 0.5).frame, 0);
  assert.equal(quantU(9, 0.5).frame, 15);
});

test("audioPlan: crossfade registry kinds use the legacy fade arithmetic", () => {
  const edl = E.normalize({ segments: [seg("p", "a", 0, 3), seg("q", "b", 0, 3, { type: "blurCross", dur: 0.5 })] }, BIN).edl;
  const plan = E.audioPlan(edl);
  const d = E.layout(edl).segs[1].d;
  assert.deepEqual(plan[1].fades[0], { type: "in", d, st: 0, curve: "qsin" });
  const out = plan[0].fades.find((f) => f.type === "out");
  assert.deepEqual(out, { type: "out", d, st: E.layout(edl).segs[0].len - d, curve: "qsin" });
});

test("audioPlan: dry registry kinds cut at the impact frame with SEAM-long fades", () => {
  const edl = E.normalize({ segments: [seg("p", "a", 0, 3), seg("q", "b", 0, 3, { type: "flashWhite", dur: 0.2 })] }, BIN).edl;
  const plan = E.audioPlan(edl);
  const len = E.layout(edl).segs[0].len; // 3
  const inFade = plan[1].fades.find((f) => f.type === "in");
  const outFade = plan[0].fades.find((f) => f.type === "out");
  // flashWhite: impact 0.5, d 0.2 -> impact at 0.1 s into the overlap
  assert.deepEqual(inFade, { type: "in", d: 0.01, st: 0.095, curve: "tri" });
  assert.deepEqual(outFade, { type: "out", d: 0.01, st: 2.895, curve: "tri" }); // len 3 - d 0.2 + d*impact 0.1 - SEAM/2
  assert.equal(len, 3);
});

test("lint: more than 3 transitions warns once (id null)", () => {
  const segs = [seg("s0", "a", 0, 1)];
  for (let i = 1; i <= 4; i += 1) segs.push(seg(`s${i}`, "b", 0, 1, { type: "blurCross", dur: 0.3 }));
  const msgs = E.lint({ segments: segs }).filter((w) => w.msg.startsWith("Hay "));
  assert.equal(msgs.length, 1);
  assert.equal(msgs[0].id, null);
  assert.equal(msgs[0].msg, "Hay 4 transiciones: el ritmo pide 3 como máximo; el corte seco es el default");
});

test("lint: fadeColor mid-video warns, fadeColor on the last segment does not; registry kinds skip the generic mid warning", () => {
  const mid = E.lint({ segments: [seg("s0", "a", 0, 3), seg("s1", "b", 0, 3, { type: "fadeColor", dur: 0.5 }), seg("s2", "c", 0, 3)] });
  assert.ok(mid.some((w) => w.msg.startsWith("fadeColor es para el cierre")));
  assert.ok(!mid.some((w) => w.msg.startsWith("Las reglas de motion")));
  const last = E.lint({ segments: [seg("s0", "a", 0, 3), seg("s1", "b", 0, 3, { type: "fadeColor", dur: 0.5 })] });
  assert.ok(!last.some((w) => w.msg.startsWith("fadeColor es para el cierre")));
});

test("speech overlap: a registry transition over a spoken word warns and keeps the transition", () => {
  const input = { segments: [seg("p", "a", 0, 3), seg("q", "b", 1, 4, { type: "blurCross", dur: 0.5 })] };
  const words = { b: [{ word: "hola", start: 1.1, end: 1.4 }] }; // inside the incoming head [1, 1.5]
  const hit = E.normalize(input, BIN, words);
  assert.equal(hit.edl.segments[1].transition.type, "blurCross");
  assert.ok(hit.warnings.includes("segmento 2: la transición cae sobre voz; puede cortar una palabra"));
  const clear = E.normalize(input, BIN, { b: [{ word: "x", start: 3, end: 3.4 }] });
  assert.ok(!clear.warnings.some((w) => w.includes("cae sobre voz")));
  // without word data the check is not run
  assert.ok(!E.normalize(input, BIN).warnings.some((w) => w.includes("cae sobre voz")));
});

test("transitionEvents: one sfx event per registry transition with a sound, at the impact frame", () => {
  const edl = E.normalize({ segments: [seg("p", "a", 0, 3), seg("q", "b", 0, 3, { type: "flashWhite", dur: 0.2 }), seg("r", "c", 0, 2, { type: "blurCross", dur: 0.5 })] }, BIN).edl;
  const L = E.layout(edl).segs;
  const ev = E.transitionEvents(edl);
  assert.equal(ev.length, 1, "blurCross has no sfx");
  assert.deepEqual(ev[0], { t: Number((L[1].start + L[1].d * 0.5).toFixed(3)), type: "pop", x: 0, key: "tr:q:pop" });
  assert.deepEqual(E.transitionEvents(null), []);
  assert.deepEqual(E.transitionEvents({ segments: [seg("p", "a", 0, 3)] }), []);
});
