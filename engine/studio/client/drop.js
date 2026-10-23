// Pure maths for dropping a clip on the Video lane (no DOM; `Edl` = engine/edl.js is passed in so node tests can load it by relative path).

/** Where a clip dropped at output time t goes: inside a segment (farther than `snap` s from both edges) -> split there;
 *  otherwise the nearest segment boundary. @returns {{kind:"split"|"boundary", t, index}} (index = position in the segment list after the drop) */
export function dropPoint(Edl, edl, t, snap = 0.15) {
  const segs = Edl.layout(edl).segs;
  if (!segs.length) return { kind: "boundary", t: 0, index: 0 };
  const bounds = segs.map((s, i) => ({ index: i, t: s.start }));
  bounds.push({ index: segs.length, t: segs.at(-1).end });
  let best = bounds[0];
  for (const b of bounds) if (Math.abs(b.t - t) < Math.abs(best.t - t)) best = b;
  const inside = segs.find((s) => t > s.start && t < s.end);
  if (inside && Math.abs(best.t - t) > snap && t - inside.start > 0.1 && inside.end - t > 0.1) return { kind: "split", t, index: inside.idx + 1 };
  return { kind: "boundary", t: best.t, index: best.index };
}

/** New EDL with `clip` (source 0..dur, optionally retimed) inserted at the drop point. @returns {{edl, remap, id}|{error}} */
export function insertAtDrop(Edl, edl, clip, dur, drop) {
  let base = edl;
  let index = drop.index;
  if (drop.kind === "split") {
    const sp = Edl.split(edl, drop.t);
    if (!sp.error) { base = sp.edl; index = base.segments.findIndex((s) => s.id === sp.rightId); }
  }
  const res = Edl.insertClip(base, clip, 0, dur, index);
  if (res.error) return res;
  res.remap = Edl.remapper(edl, res.edl);
  return res;
}
