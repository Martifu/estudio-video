// EDL (edit decision list): which parts of the source clips ("bin") make the video, in which order, with which transitions.
// ONE pure module used by the comp (overlay.html), the Estudio client and node (overlay.py shells out to the CLI at the bottom).
//
//   edl = { version: 1,
//           segments: [{ id, clip: "<footage name>", in: <src s>, out: <src s>,
//                        transition?: { type: "cut"|"fade"|"dipBlack"|"dipWhite", dur: <s> },   // at the START of this segment
//                        audioFade?: <s>,                                                        // longer audio fades on both edges
//                        punch?: { scale, cx?, cy? },                                            // optional punch-in (scale >= 1, cx/cy 0..1)
//                        speed?: <0.25..4> }],                                                   // playback rate (absent/1 = normal), see below
//           fadeOut?: { type: "dipBlack"|"dipWhite", dur: <s> } }                                // tail fade, does not shorten
//
// Time model (video, audio and words all follow it): segments are laid out back to back. A non-cut transition of duration d on
// segment k OVERLAPS it with segment k-1 by d: segment k starts d earlier, so the total shortens by d (same rule as ffmpeg
// acrossfade). No handles are needed: the outgoing clip shows its last d seconds, the incoming one its first d seconds.
//   fade      crossfade (incoming alpha 0 -> 1 over the overlap)
//   dipBlack/dipWhite   outgoing -> plate during the first half of the overlap, plate -> incoming during the second half
// On the FIRST segment a non-cut transition is a fade-in from black (dipWhite: from white); it overlaps nothing.
// Times are seconds rounded to 1 ms.
// Speed: a segment with `speed` s plays its source range [in,out] in (out-in)/s output seconds and its audio is muted (a retimed voice
// would break lip sync). It is only allowed on material WITHOUT spoken words: normalize(edl, bin, wordsByClip) strips it (with a warning)
// from a segment whose source range overlaps a word. Without `speed` every number below is computed exactly as before.
import { has as hasTr, get as getTr, quantU } from "./transitions/index.js";
export const FPS = 30;
export const TRANSITIONS = ["cut", "fade", "dipBlack", "dipWhite"];
/** Legacy name, or a registry transition (engine/transitions). "cut" counts as a transition name (= no transition). */
export const isTransition = (type) => TRANSITIONS.includes(type) || hasTr(type);
/** Registry descriptor of a transition name, or undefined (legacy names have none). */
export const descriptorOf = (type) => getTr(type);
// registry kinds: any transition name that is not one of the legacy four
const isFx = (type) => hasTr(type) && !TRANSITIONS.includes(type);
export const MIN_SEG = 0.1; // shortest segment an op may produce (in source seconds)
export const SPEED_MIN = 0.25;
export const SPEED_MAX = 4;
export const WORD_TOL = 0.03; // a word counts as "inside" a source range when more than this many seconds of it overlap
export const SOFT_MIN_SEG = 0.45; // below this the lint warns
const r3 = (v) => Math.round(v * 1000) / 1000;
const r6 = (v) => Math.round(v * 1e6) / 1e6;
const clone = (o) => JSON.parse(JSON.stringify(o));
// speed helpers: every branch on rate === 1 keeps the floating-point association of the pre-speed code (byte-identical renders)
const lenOf = (s) => (s.speed ? (s.out - s.in) / s.speed : s.out - s.in);
const srcOf = (s, t) => (s.speed ? s.in + (t - s.start) * s.speed : s.in + (t - s.start)); // layout seg + output time -> source time
const outOf = (n, x) => (n.speed ? n.start + (x - n.in) / n.speed : n.start + x - n.in); // layout seg + source time -> output time
const isSpeed = (v) => Number.isFinite(v) && v >= SPEED_MIN - 1e-9 && v <= SPEED_MAX + 1e-9;

/** True when a spoken word overlaps the source range [a, b] by more than WORD_TOL. words = [{word,start,end}] */
export function hasWords(words, a, b) {
  for (const w of words ?? []) if (Math.min(w.end, b) - Math.max(w.start, a) > WORD_TOL) return true;
  return false;
}

let idSeq = 0;
export const newSegId = () => `s${Date.now().toString(36)}${(idSeq += 1)}`;

/** Identity EDL: every clip of the bin, whole, in order. bin = [{name, dur}] */
export const identity = (bin) => ({ version: 1, segments: bin.map((c, i) => ({ id: `s${i + 1}`, clip: c.name, in: 0, out: r3(c.dur) })) });

// ---------- normalize / validate ----------
/** Cleaned copy: ids filled in, times rounded and clamped to the clip length, transitions capped, unknown clips reported.
 *  bin = [{name, dur}] (optional: without it clips are not checked). wordsByClip = {clip:[{word,start,end}]} (optional: a segment with
 *  `speed` over spoken words loses its speed with a warning). @returns {{edl, errors:string[], warnings:string[]}} */
export function normalize(input, bin = null, wordsByClip = null) {
  const errors = [];
  const warnings = [];
  const durOf = (name) => bin?.find((c) => c.name === name)?.dur;
  if (!input || typeof input !== "object" || !Array.isArray(input.segments)) return { edl: { version: 1, segments: [] }, errors: ["edl: se espera {segments:[...]}"], warnings };
  const seen = new Set();
  const segments = [];
  input.segments.forEach((s, i) => {
    const tag = `segmento ${i + 1}`;
    if (!s || typeof s.clip !== "string") { errors.push(`${tag}: falta "clip"`); return; }
    const cd = durOf(s.clip);
    if (bin && cd === undefined) { errors.push(`${tag}: el clip "${s.clip}" no está en el material`); return; }
    let a = Number(s.in), b = Number(s.out);
    if (!Number.isFinite(a) || !Number.isFinite(b)) { errors.push(`${tag}: "in" y "out" deben ser números`); return; }
    if (cd !== undefined) { a = Math.max(0, Math.min(a, cd)); b = Math.max(0, Math.min(b, cd)); }
    if (b - a < 1 / FPS - 1e-9) { errors.push(`${tag}: dura menos de un cuadro`); return; }
    let id = typeof s.id === "string" && s.id && !seen.has(s.id) ? s.id : null;
    if (!id) { id = `s${i + 1}`; while (seen.has(id)) id = newSegId(); }
    seen.add(id);
    const seg = { id, clip: s.clip, in: r3(a), out: r3(b) };
    const tr = s.transition;
    if (tr && typeof tr === "object" && tr.type && tr.type !== "cut") {
      if (!TRANSITIONS.includes(tr.type) && !isFx(tr.type)) warnings.push(`${tag}: transición "${tr.type}" desconocida, se usa corte`);
      else if (!isFx(tr.type)) seg.transition = { type: tr.type, dur: Math.max(0, Number(tr.dur) || 0.4) };
      else {
        // registry transition: default duration, clamped to the descriptor range; only known params are kept
        const d = getTr(tr.type);
        const given = tr.dur === undefined || tr.dur === null || tr.dur === "" ? NaN : Number(tr.dur);
        let dur = Number.isFinite(given) ? given : d.defaultDur;
        const clampedDur = Math.min(d.maxDur, Math.max(d.minDur, dur));
        if (clampedDur !== dur) warnings.push(`${tag}: la duración de "${d.label}" se ajustó a ${clampedDur} s (entre ${d.minDur} y ${d.maxDur} s)`);
        dur = clampedDur;
        const known = new Set(d.params.map((p) => p.key));
        const params = {};
        if (tr.params && typeof tr.params === "object") for (const k of Object.keys(tr.params)) if (known.has(k)) params[k] = tr.params[k];
        if (segments.length === 0) {
          // the first segment has nothing to overlap: fadeColor becomes a fade in from black (white when asked), other kinds are dropped
          if (d.name === "fadeColor") seg.transition = { type: params.color === "blanco" ? "dipWhite" : "dipBlack", dur };
          else warnings.push(`${tag}: la primera toma no tiene transición de entrada`);
        } else {
          seg.transition = { type: tr.type, dur, ...(Object.keys(params).length ? { params } : {}) };
        }
      }
    }
    if (s.speed !== undefined && s.speed !== null) {
      const v = Number(s.speed);
      if (!Number.isFinite(v) || v <= 0) warnings.push(`${tag}: velocidad no válida, se usa la normal`);
      else {
        const sp = r3(Math.min(SPEED_MAX, Math.max(SPEED_MIN, v)));
        if (sp !== r3(v)) warnings.push(`${tag}: la velocidad se ajustó a ${sp}x`);
        if (sp !== 1) {
          if (wordsByClip && hasWords(wordsByClip[s.clip], seg.in, seg.out)) warnings.push(`${tag}: tiene voz, se ignora el cambio de velocidad`);
          else seg.speed = sp;
        }
      }
    }
    if (Number(s.audioFade) > 0) seg.audioFade = r3(Number(s.audioFade));
    if (s.punch && Number(s.punch.scale) > 1) seg.punch = { scale: r3(Math.min(3, Number(s.punch.scale))), cx: Number(s.punch.cx ?? 0.5), cy: Number(s.punch.cy ?? 0.5) };
    segments.push(seg);
  });
  // cap transitions: an overlap can use at most half of either neighbour (so two overlaps never collide in one segment)
  segments.forEach((s, i) => {
    if (!s.transition) return;
    const len = lenOf(s);
    const cap = i === 0 ? len : Math.min(len, lenOf(segments[i - 1])) / 2;
    const capped = r3(Math.min(s.transition.dur, i === 0 ? cap : Math.min(cap, len / 2)));
    if (capped < 0.05) { delete s.transition; return; }
    if (capped < s.transition.dur - 1e-9) warnings.push(`segmento ${i + 1}: la transición se acortó a ${capped} s`);
    s.transition.dur = capped;
  });
  // speech check (warn only): an overlap covers the outgoing source tail and the incoming source head; a word there may be cut
  if (wordsByClip) {
    segments.forEach((s, i) => {
      if (!s.transition || i === 0) return; // the first segment overlaps nothing
      const d = s.transition.dur;
      const inHit = hasWords(wordsByClip[s.clip], s.in, s.in + d);
      const outHit = i > 0 && hasWords(wordsByClip[segments[i - 1].clip], segments[i - 1].out - d, segments[i - 1].out);
      if (inHit || outHit) warnings.push(`segmento ${i + 1}: la transición cae sobre voz; puede cortar una palabra`);
    });
  }
  const edl = { version: 1, segments };
  const fo = input.fadeOut;
  if (fo && Number(fo.dur) > 0 && segments.length) {
    const last = segments.at(-1);
    edl.fadeOut = { type: fo.type === "dipWhite" ? "dipWhite" : "dipBlack", dur: r3(Math.min(Number(fo.dur), lenOf(last))) };
  }
  return { edl, errors, warnings };
}
export const validate = (edl, bin = null) => {
  const { errors, warnings } = normalize(edl, bin);
  if (!edl?.segments?.length) errors.push("edl: no tiene segmentos");
  return { errors, warnings };
};

// ---------- layout ----------
const cache = new WeakMap();
/** Lays the segments out on the output timeline. @returns {{segs:[{...seg, idx, len, start, end, d, kind}], duration}} */
export function layout(edl) {
  const hit = cache.get(edl);
  if (hit) return hit;
  const segs = [];
  let cursor = 0;
  (edl.segments ?? []).forEach((s, i) => {
    const len = r6(lenOf(s));
    const kind = s.transition && s.transition.type && s.transition.type !== "cut" ? s.transition.type : "cut";
    const d = i > 0 && kind !== "cut" ? Math.min(r6(s.transition.dur || 0), len, segs[i - 1].len) : 0;
    const start = i === 0 ? 0 : r6(cursor - d);
    segs.push({ ...s, idx: i, len, start, end: r6(start + len), d, kind });
    cursor = start + len;
  });
  const out = { segs, duration: r6(cursor) };
  cache.set(edl, out);
  return out;
}
export const duration = (edl) => layout(edl).duration;

// ---------- output time -> source ----------
const layerOf = (L, s, t, alpha = 1) => ({ idx: s.idx, seg: s.id, clip: s.clip, srcT: srcOf(s, t), punch: s.punch ?? null, alpha });
/** What to draw at output time t.
 *  @returns {{idx, seg, clip, srcT, punch, layers:[{idx,seg,clip,srcT,punch,alpha}], blend?:{clip2,srcT2,alpha,type}, plate?:{color,a}}}
 *  `layers` are bottom -> top (draw each with its alpha); clip/srcT/seg are those of the top layer. `plate` = colour veil to draw on top. */
export function outToSrc(edl, t) {
  const L = layout(edl);
  const segs = L.segs;
  if (!segs.length) return null;
  let k = 0;
  for (let i = 0; i < segs.length; i += 1) if (segs[i].start <= t + 1e-9) k = i;
  const s = segs[k];
  let tt = t;
  if (tt > s.end) tt = s.end; // past the end (CTA card region): hold the last frame
  let layers = [layerOf(L, s, tt)];
  let plate = null;
  let fx = null;
  if (k > 0 && s.d > 0 && tt < s.start + s.d) {
    const u = Math.max(0, (tt - s.start) / s.d);
    const p = segs[k - 1];
    const color = s.kind === "dipWhite" ? "white" : "black";
    if (isFx(s.kind)) {
      // registry kind: both layers at full alpha, the renderer (engine/transitions) draws the overlap itself; no plate
      const q = quantU(tt - s.start, s.d);
      layers = [layerOf(L, p, tt), layerOf(L, s, tt)];
      fx = { type: s.kind, u: q.u, params: s.transition.params ?? {}, seed: s.idx + 1 };
    } else if (s.kind === "fade") layers = [layerOf(L, p, tt), layerOf(L, s, tt, u)];
    else if (u < 0.5) { layers = [layerOf(L, p, tt)]; plate = { color, a: 2 * u }; } else plate = { color, a: 2 * (1 - u) };
  } else if (k === 0 && s.kind !== "cut") {
    const d = Math.min(r6(s.transition.dur || 0), s.len);
    if (tt < d) plate = { color: s.kind === "dipWhite" ? "white" : "black", a: 1 - tt / d };
  }
  const fo = edl.fadeOut;
  if (fo && fo.dur > 0 && t > L.duration - fo.dur) {
    const a = Math.min(1, (t - (L.duration - fo.dur)) / fo.dur);
    if (!plate || a > plate.a) plate = { color: fo.type === "dipWhite" ? "white" : "black", a };
  }
  const top = layers.at(-1);
  const res = { ...top, layers };
  if (layers.length > 1) res.blend = { clip2: layers[0].clip, srcT2: layers[0].srcT, alpha: top.alpha, type: "fade" };
  if (plate) res.plate = plate;
  if (fx) res.fx = fx;
  return res;
}
/** Output time of source time `srcT` of `clip` (null when that part is not in the cut). Prefers segment `prefId`. */
export function srcToOut(edl, clip, srcT, prefId = null) {
  const segs = layout(edl).segs;
  const eps = 1e-6;
  const hit = (s) => s.clip === clip && srcT >= s.in - eps && srcT <= s.out + eps;
  const s = (prefId && segs.find((x) => x.id === prefId && hit(x))) || segs.find(hit);
  return s ? r6(outOf(s, srcT)) : null;
}
/** Segment (layout entry) playing at output time t (the incoming one inside an overlap). */
export function segmentAt(edl, t) {
  const segs = layout(edl).segs;
  let k = -1;
  for (let i = 0; i < segs.length; i += 1) if (segs[i].start <= t + 1e-9) k = i;
  return k >= 0 && t <= segs[k].end + 1e-9 ? segs[k] : null;
}

// ---------- remap (ripple): old output time -> new output time, through the source ----------
/** Builds {point(t)->t'|null, interval(a,b)->[a',b']|null} mapping times of `oldEdl` to `newEdl` by following the source material.
 *  Material that is no longer in the cut maps to null; an interval that straddles a removed part shrinks (hull of what survives). */
export function remapper(oldEdl, newEdl) {
  const O = layout(oldEdl);
  const N = layout(newEdl);
  const oldEnd = O.duration, newEnd = N.duration;
  const point = (t) => {
    if (t >= oldEnd - 1e-9) return r6(newEnd + (t - oldEnd)); // CTA region and beyond follows the end
    const s = segmentAt(oldEdl, t);
    if (!s) return null;
    return srcToOut(newEdl, s.clip, srcOf(s, t), s.id);
  };
  const interval = (a, b) => {
    const pieces = [];
    const add = (x, y) => pieces.push([x, y]);
    if (b > oldEnd - 1e-9) { // part beyond the cut video (CTA): keep relative to the end
      const x = r6(newEnd + Math.max(a, oldEnd) - oldEnd), y = r6(newEnd + b - oldEnd);
      if (a >= oldEnd - 1e-9) return [x, y];
      add(x, y);
    }
    for (const s of O.segs) {
      // a segment owns the output time up to where the next one starts (the incoming clip owns a transition overlap, like point())
      const own = O.segs[s.idx + 1] ? Math.min(s.end, Math.max(s.start, O.segs[s.idx + 1].start)) : s.end;
      const p = Math.max(a, s.start), q = Math.min(b, own);
      if (q - p <= 1e-9 && !(a === b && p <= q + 1e-9)) continue;
      const sa = srcOf(s, p), sb = srcOf(s, q);
      const ov = (n) => [Math.max(sa, n.in), Math.min(sb, n.out)];
      const cand = N.segs.filter((n) => n.clip === s.clip && sb > n.in - 1e-9 && sa < n.out + 1e-9 && (sb > n.in || sa === sb));
      // material kept under the same segment id wins; a sibling (e.g. the right half of a split) only counts for what the id doesn't cover
      const same = cand.filter((n) => n.id === s.id).map(ov);
      for (const n of cand) {
        const [x, y] = ov(n);
        if (n.id !== s.id && same.some(([u, v]) => x >= u - 1e-9 && y <= v + 1e-9)) continue;
        add(outOf(n, x), outOf(n, y));
      }
    }
    if (!pieces.length) return null;
    // pieces that end up far apart (a reorder put the two sides of a cut at opposite ends) must not become one block spanning the video:
    // pieces closer than GAP are merged, and the largest group wins
    pieces.sort((p, q) => p[0] - q[0]);
    const groups = [];
    for (const pc of pieces) {
      const g = groups.at(-1);
      if (g && pc[0] - g.hi <= 0.5) { g.hi = Math.max(g.hi, pc[1]); g.len += pc[1] - pc[0]; } else groups.push({ lo: pc[0], hi: pc[1], len: pc[1] - pc[0] });
    }
    const best = groups.reduce((m, g) => (g.len > m.len ? g : m));
    return [r6(best.lo), r6(best.hi)];
  };
  return { point, interval, oldEnd, newEnd };
}

// ---------- ops: each returns {edl, remap} (remap = remapper(old, new)) or {error} ----------
const done = (old, next) => { const n = normalize(next).edl; return { edl: n, remap: remapper(old, n) }; };
const findSeg = (edl, id) => edl.segments.findIndex((s) => s.id === id);

/** Move one edge of a segment to source time `srcT` (clamped to [0, clipDur] and to MIN_SEG). side: "in" | "out" */
export function trim(edl, id, side, srcT, clipDur = Infinity) {
  const i = findSeg(edl, id);
  if (i < 0) return { error: "segmento no encontrado" };
  const next = clone(edl);
  const s = next.segments[i];
  if (side === "in") s.in = r3(Math.max(0, Math.min(srcT, s.out - MIN_SEG)));
  else s.out = r3(Math.min(clipDur, Math.max(srcT, s.in + MIN_SEG)));
  return done(edl, next);
}
/** Split the segment playing at output time t into two, joined with a hard cut (the total does not change). */
export function split(edl, t) {
  const s = segmentAt(edl, t);
  if (!s) return { error: "no hay video en ese punto" };
  const srcT = r3(srcOf(s, t));
  if (srcT - s.in < MIN_SEG || s.out - srcT < MIN_SEG) return { error: "demasiado cerca del borde del segmento" };
  const next = clone(edl);
  const i = findSeg(next, s.id);
  const left = next.segments[i];
  const right = { id: newSegId(), clip: left.clip, in: srcT, out: left.out };
  if (left.punch) right.punch = clone(left.punch);
  if (left.audioFade) right.audioFade = left.audioFade;
  if (left.speed) right.speed = left.speed;
  left.out = srcT;
  next.segments.splice(i + 1, 0, right);
  return { ...done(edl, next), rightId: right.id };
}
/** Remove a segment; everything after it moves earlier (ripple). */
export function remove(edl, id) {
  const i = findSeg(edl, id);
  if (i < 0) return { error: "segmento no encontrado" };
  if (edl.segments.length === 1) return { error: "el video necesita al menos un segmento" };
  const next = clone(edl);
  next.segments.splice(i, 1);
  if (i === 0 && next.segments[0]) delete next.segments[0].transition; // the new first segment must not inherit a mid-video transition
  return done(edl, next);
}
/** Remove the output range [t0, t1] (splits at both ends, deletes what is inside). */
export function removeRange(edl, t0, t1) {
  let cur = edl;
  let remapAll = null;
  const step = (res) => { if (res.error) return false; remapAll = remapAll ?? res.remap; cur = res.edl; return true; };
  const tail = split(cur, t1);
  if (!tail.error) cur = tail.edl;
  const head = split(cur, t0);
  if (!head.error) cur = head.edl;
  const mid = layout(cur).segs.filter((s) => s.start >= t0 - 1e-6 && s.end <= t1 + 1e-6 && s.start + 1e-6 < t1);
  let out = cur;
  for (const s of mid) { const res = remove(out, s.id); if (!step(res)) return res; out = res.edl; }
  return { edl: out, remap: remapper(edl, out) };
}
/** Move a segment to position `toIndex` (0-based, in the list after removing it). */
export function move(edl, id, toIndex) {
  const i = findSeg(edl, id);
  if (i < 0) return { error: "segmento no encontrado" };
  const next = clone(edl);
  const [s] = next.segments.splice(i, 1);
  next.segments.splice(Math.max(0, Math.min(toIndex, next.segments.length)), 0, s);
  next.segments[0] && next.segments[0].transition && delete next.segments[0].transition; // first segment: no inherited transition
  return done(edl, next);
}
/** Set (or clear with null/"cut") the transition at the start of a segment. */
export function setTransition(edl, id, tr) {
  const i = findSeg(edl, id);
  if (i < 0) return { error: "segmento no encontrado" };
  const next = clone(edl);
  if (!tr || tr.type === "cut") delete next.segments[i].transition;
  else {
    const d = descriptorOf(tr.type); // registry kinds: their own default and range; legacy kinds keep 0.4 s
    const dur = d ? Math.min(d.maxDur, Math.max(d.minDur, Number(tr.dur) || d.defaultDur)) : Number(tr.dur) || 0.4;
    next.segments[i].transition = { type: tr.type, dur };
    if (d && tr.params && typeof tr.params === "object") next.segments[i].transition.params = { ...tr.params };
  }
  return done(edl, next);
}
export function setFadeOut(edl, fo) {
  const next = clone(edl);
  if (!fo || !fo.dur) delete next.fadeOut; else next.fadeOut = { type: fo.type ?? "dipBlack", dur: fo.dur };
  return done(edl, next);
}
/** Insert part of a clip at `index` (default: the end), optionally retimed (`speed`, only for clips without voice). */
export function insertClip(edl, clip, srcIn, srcOut, index = edl.segments.length, speed = null) {
  const next = clone(edl);
  const seg = { id: newSegId(), clip, in: r3(srcIn), out: r3(srcOut) };
  if (speed && Number(speed) !== 1) seg.speed = r3(Math.min(SPEED_MAX, Math.max(SPEED_MIN, Number(speed))));
  next.segments.splice(Math.max(0, Math.min(index, next.segments.length)), 0, seg);
  return { ...done(edl, next), id: seg.id };
}
/** Retime a segment (SPEED_MIN..SPEED_MAX; 1 or null clears it). Refused when the source range has spoken words (lip sync). */
export function setSpeed(edl, id, speed, wordsByClip = null) {
  const i = findSeg(edl, id);
  if (i < 0) return { error: "segmento no encontrado" };
  const next = clone(edl);
  const s = next.segments[i];
  if (speed === null || speed === undefined || Number(speed) === 1) delete s.speed;
  else {
    const v = Number(speed);
    if (!isSpeed(v)) return { error: `La velocidad debe estar entre ${SPEED_MIN}x y ${SPEED_MAX}x` };
    if (wordsByClip && hasWords(wordsByClip[s.clip], s.in, s.out)) return { error: "Esta toma tiene voz; cambiar la velocidad rompería la sincronía de los labios" };
    s.speed = r3(v);
  }
  return done(edl, next);
}
export function patchSegment(edl, id, patch) {
  const i = findSeg(edl, id);
  if (i < 0) return { error: "segmento no encontrado" };
  const next = clone(edl);
  for (const [k, v] of Object.entries(patch)) { if (v === null || v === undefined) delete next.segments[i][k]; else next.segments[i][k] = v; }
  return done(edl, next);
}

// ---------- words ----------
/** Source words per clip ({clipName: [{word,start,end}]}) -> output-time words of the cut. Words partly outside a segment are dropped. */
export function remapWords(edl, wordsByClip, tol = 0.03) {
  const out = [];
  for (const s of layout(edl).segs) {
    for (const w of wordsByClip[s.clip] ?? []) {
      if (w.start < s.in - tol || w.end > s.out + tol) continue;
      if (s.speed) out.push({ ...w, start: r3(s.start + Math.max(0, w.start - s.in) / s.speed), end: r3(s.start + Math.min(s.len, (w.end - s.in) / s.speed)) });
      else out.push({ ...w, start: r3(s.start + Math.max(0, w.start - s.in)), end: r3(s.start + Math.min(s.len, w.end - s.in)) });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}
/** Segment edges worth snapping to: the source times of words (start and end) of a clip. */
export const wordEdges = (words) => (words ?? []).flatMap((w) => [w.start, w.end]);

// ---------- audio plan (overlay.py builds the ffmpeg graph from it) ----------
const SEAM = 0.01;
// registry audio: "crossfade" = the legacy fade arithmetic; "dry" = a hard cut at the impact frame (SEAM-long fades around it)
const fxImpact = (kind) => getTr(kind).impact ?? 0.5;
const fxIn = (kind, d) => (getTr(kind).audio === "dry" ? [SEAM, Math.max(0, r3(d * fxImpact(kind) - SEAM / 2)), "tri"] : [d, 0, "qsin"]);
const fxOut = (kind, d, len) => (getTr(kind).audio === "dry" ? [SEAM, Math.max(0, r3(len - d + d * fxImpact(kind) - SEAM / 2)), "tri"] : [d, len - d, "qsin"]);
/** Per segment: where it plays and its fades. fades: [{type:"in"|"out", st, d, curve}] (st = seconds from the segment's own start). */
export function audioPlan(edl) {
  const L = layout(edl);
  const n = L.segs.length;
  return L.segs.map((s, i) => {
    const fades = [];
    const next = L.segs[i + 1];
    const af = s.audioFade ?? 0;
    const inD = (() => {
      if (i === 0) return s.kind !== "cut" ? [Math.min(s.transition.dur, s.len), 0, "tri"] : null;
      if (isFx(s.kind)) return fxIn(s.kind, s.d);
      if (s.kind === "fade") return [s.d, 0, "qsin"];
      if (s.kind !== "cut") return [s.d / 2, s.d / 2, "qsin"]; // dip: silent first half, fade in during the second
      return null;
    })();
    const outD = (() => {
      if (i === n - 1) return edl.fadeOut ? [edl.fadeOut.dur, s.len - edl.fadeOut.dur, "tri"] : null;
      if (isFx(next.kind)) return fxOut(next.kind, next.d, s.len);
      if (next.kind === "fade") return [next.d, s.len - next.d, "qsin"];
      if (next.kind !== "cut") return [next.d / 2, s.len - next.d, "qsin"]; // dip: fades during the first half, then silence
      return null;
    })();
    if (inD) fades.push({ type: "in", d: r3(inD[0]), st: r3(inD[1]), curve: inD[2] });
    else if (af > 0) fades.push({ type: "in", d: af, st: 0, curve: "tri" });
    else if (i > 0 || s.in > 0) fades.push({ type: "in", d: SEAM, st: 0, curve: "tri" });
    if (outD) fades.push({ type: "out", d: r3(outD[0]), st: r3(outD[1]), curve: outD[2] });
    else if (af > 0) fades.push({ type: "out", d: af, st: r3(s.len - af), curve: "tri" });
    else fades.push({ type: "out", d: SEAM, st: r3(s.len - SEAM), curve: "tri" });
    const entry = { id: s.id, clip: s.clip, in: s.in, out: s.out, delay: s.start, len: s.len, fades };
    if (s.speed) entry.muted = true; // retimed material is silent (a sped-up voice would break lip sync); the fades are irrelevant
    return entry;
  });
}

// ---------- lint (soft warnings, Spanish) ----------
export function lint(edl) {
  const out = [];
  const segs = layout(edl).segs;
  segs.forEach((s, i) => {
    if (s.len < SOFT_MIN_SEG) out.push({ id: s.id, level: "warn", msg: `El segmento ${i + 1} dura ${s.len.toFixed(2)} s: menos de ${SOFT_MIN_SEG} s se siente como un tic.` });
    if (i > 0 && s.kind !== "cut" && !isFx(s.kind)) out.push({ id: s.id, level: "warn", msg: "Las reglas de motion piden cortes secos por defecto: un fundido a mitad del video solo si la historia lo pide." });
    if (s.kind === "fadeColor" && i !== segs.length - 1) out.push({ id: s.id, level: "warn", msg: "fadeColor es para el cierre: en medio del video usa un corte o una transición de movimiento" });
  });
  const nTr = segs.filter((s) => s.kind !== "cut").length;
  if (nTr > 3) out.push({ id: null, level: "warn", msg: `Hay ${nTr} transiciones: el ritmo pide 3 como máximo; el corte seco es el default` });
  return out;
}

/** SFX events of the registry transitions that declare a sound (descriptor.sfx): one per transition, at its impact frame.
 *  @returns {{t, type, x, key}[]} key = tr:<segment id>:<kind>, so sfx.json overrides/mutes keep working. */
export function transitionEvents(edl) {
  const out = [];
  if (!edl?.segments?.length) return out;
  for (const s of layout(edl).segs) {
    if (!isFx(s.kind)) continue;
    const d = getTr(s.kind);
    if (!d.sfx) continue;
    const t = Math.max(0, s.start + s.d * (d.impact ?? 0.5) - d.sfx.offset);
    out.push({ t: Number(t.toFixed(3)), type: d.sfx.kind, x: 0, key: `tr:${s.id}:${d.sfx.kind}` });
  }
  return out;
}

// ---------- node CLI ----------
// node engine/edl.js plan <edl.json> <bin.json> [words-by-clip.json]
//   bin.json = [{name,dur}] (omit edl.json with "-" for the identity EDL).  Prints {edl, duration, segs, audio, words, errors, warnings}.
// node engine/edl.js remap-words <edl.json> <words-by-clip.json> [bin.json]   Prints the output-time words.
if (typeof process !== "undefined" && process.argv?.[1] && import.meta.url === `file://${process.argv[1]}`) {
  const { readFileSync } = await import("node:fs");
  const [cmd, a, b, c] = process.argv.slice(2);
  const rd = (f) => JSON.parse(readFileSync(f, "utf8"));
  if (cmd === "plan") {
    const bin = rd(b);
    const wbc = c ? rd(c) : null; // with words, a segment with `speed` over spoken words loses it (same rule as the comp and the studio)
    const { edl, errors, warnings } = normalize(a === "-" ? identity(bin) : rd(a), bin, wbc);
    const L = layout(edl);
    console.log(JSON.stringify({ edl, duration: L.duration, segs: L.segs, audio: audioPlan(edl), words: wbc ? remapWords(edl, wbc) : [], errors, warnings, lint: lint(edl) }));
  } else if (cmd === "remap-words") {
    const bin = c ? rd(c) : null;
    console.log(JSON.stringify(remapWords(normalize(rd(a), bin).edl, rd(b))));
  } else {
    console.error("usage: node edl.js plan <edl.json|-> <bin.json> [words-by-clip.json] | remap-words <edl.json> <words-by-clip.json> [bin.json]");
    process.exit(2);
  }
}
