// Speed-less EDLs used to freeze the output of engine/edl.js (plan, ops). Snapshot: edl-plans.json (generated from the pre-speed edl.js).
import * as E from "../edl.js";

export const bin = [{ name: "a", dur: 10 }, { name: "b", dur: 6 }, { name: "c", dur: 4.2 }];
export const words = { a: [{ word: "hola", start: 0.5, end: 0.9 }, { word: "mundo", start: 3.1, end: 3.6 }, { word: "x", start: 9.5, end: 9.9 }], b: [{ word: "dos", start: 1, end: 1.4 }], c: [] };

export const cases = {
  identity: E.identity(bin),
  trimmed: { version: 1, segments: [{ id: "s1", clip: "a", in: 1.3, out: 7.77 }, { id: "s2", clip: "b", in: 0, out: 4.123 }, { id: "s3", clip: "c", in: 0.5, out: 4.2 }] },
  fades: { version: 1, segments: [
    { id: "s1", clip: "a", in: 0, out: 5, transition: { type: "fade", dur: 0.5 }, audioFade: 0.2 },
    { id: "s2", clip: "b", in: 1, out: 5.5, transition: { type: "dipBlack", dur: 0.8 }, punch: { scale: 1.3, cx: 0.4, cy: 0.5 } },
    { id: "s3", clip: "a", in: 5, out: 9.1, transition: { type: "fade", dur: 1 } },
    { id: "s4", clip: "c", in: 0.1, out: 3.3, transition: { type: "dipWhite", dur: 0.6 } }],
    fadeOut: { type: "dipWhite", dur: 0.7 } },
  reordered: { version: 1, segments: [{ id: "x", clip: "c", in: 0, out: 2.01 }, { id: "y", clip: "a", in: 2, out: 3 }, { id: "z", clip: "a", in: 6.1, out: 8.8 }, { id: "w", clip: "b", in: 2, out: 5.9 }] },
};

/** Everything the speed-less code path produces for each case: plan fields, outToSrc samples, ops, remapper results. */
export function snapshot() {
  const out = {};
  for (const [name, input] of Object.entries(cases)) {
    const { edl, errors, warnings } = E.normalize(input, bin);
    const L = E.layout(edl);
    const samples = [];
    for (let t = 0; t <= L.duration + 0.5; t += 0.37) samples.push(E.outToSrc(edl, t));
    const ops = {};
    const t1 = L.duration / 3;
    const sp = E.split(edl, t1);
    ops.split = sp.error ? sp : { edl: sp.edl, pts: [0.3, 2, 5, 8].map((t) => sp.remap.point(t)), iv: sp.remap.interval(1, 6) };
    const rr = E.removeRange(edl, 1.2, 3.4);
    ops.removeRange = rr.error ? rr : { edl: rr.edl, pts: [0.3, 2, 5, 8].map((t) => rr.remap.point(t)), iv: rr.remap.interval(1, 6) };
    const tr = E.trim(edl, edl.segments[0].id, "out", 4.4, 10);
    ops.trim = tr.error ? tr : { edl: tr.edl, pts: [0.3, 2, 5, 8].map((t) => tr.remap.point(t)) };
    const mv = E.move(edl, edl.segments[0].id, 1);
    ops.move = mv.error ? mv : { edl: mv.edl, pts: [0.3, 2, 5, 8].map((t) => mv.remap.point(t)), iv: mv.remap.interval(0.5, 5) };
    const srcToOut = [["a", 2], ["a", 7], ["b", 3], ["c", 1]].map(([c, t]) => E.srcToOut(edl, c, t));
    out[name] = { edl, errors, warnings, segs: L.segs, duration: L.duration, audio: E.audioPlan(edl), words: E.remapWords(edl, words), lint: E.lint(edl), samples, ops, srcToOut };
  }
  // generated segment ids are time based: mask them
  return JSON.parse(JSON.stringify(out), (k, v) => (k === "id" && typeof v === "string" && /^s[0-9a-z]{8,}$/.test(v) ? "GEN" : v));
}
