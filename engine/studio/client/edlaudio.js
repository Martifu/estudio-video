// Preview audio for an EDL cut: the source audio of each segment (footage/<clip>/audio.wav) scheduled with Web Audio, with the same
// fades the render uses (edl.js audioPlan: 10 ms seams, crossfades, dip halves). The rendered audio/clips.wav is stale as soon as the
// cut changes, so while an EDL exists the preview plays this instead and the clock is performance.now (see preview.js).
import { audioPlan } from "/engine/edl.js";

let ctx = null;
let bus = null;
const buffers = new Map(); // clip -> Promise<AudioBuffer|null>
let live = [];

const ac = () => {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    bus = ctx.createGain();
    bus.connect(ctx.destination);
  }
  return ctx;
};
export function loadClip(clip) {
  if (!buffers.has(clip)) {
    buffers.set(clip, (async () => {
      try {
        const r = await fetch(`/footage/${clip}/audio.wav`);
        return r.ok ? await ac().decodeAudioData(await r.arrayBuffer()) : null;
      } catch { return null; }
    })());
  }
  return buffers.get(clip);
}
export function setGain(g) { ac(); bus.gain.value = g; }
export function stopAll() {
  for (const s of live) { try { s.stop(); } catch { /* already stopped */ } }
  live = [];
}

const CURVE = { tri: (x) => x, qsin: (x) => Math.sin((x * Math.PI) / 2) };
/** Gain of a segment at `u` seconds from its own start, from its fade list. */
const gainAt = (fades, u) => {
  let g = 1;
  for (const f of fades) {
    const x = (u - f.st) / f.d;
    const c = CURVE[f.curve] ?? CURVE.tri;
    if (f.type === "in") g *= x <= 0 ? 0 : x >= 1 ? 1 : c(x);
    else g *= x <= 0 ? 1 : x >= 1 ? 0 : c(1 - x);
  }
  return g;
};

/** Decode every clip the cut uses (await before starting the clock so playback does not stall). */
export async function ready(edl) {
  for (const clip of new Set(edl.segments.map((s) => s.clip))) resolved.set(clip, await loadClip(clip));
}

/** Start the cut's audio at output time `from`. Needs the clips decoded (ready). Returns the number of sources started. */
export function schedule(edl, from) {
  stopAll();
  const a = ac();
  if (a.state === "suspended") a.resume().catch(() => {});
  const now = a.currentTime + 0.03;
  let n = 0;
  // buffers are resolved synchronously here (ready() awaited them)
  for (const seg of audioPlan(edl)) {
    const end = seg.delay + seg.len;
    if (end <= from + 0.005) continue;
    if (seg.muted) continue; // retimed (speed) segments are silent: the render skips them too
    const b = resolved.get(seg.clip);
    if (!b) continue;
    const skip = Math.max(0, from - seg.delay); // seconds already played inside this segment
    const when = now + Math.max(0, seg.delay - from);
    const src = a.createBufferSource();
    src.buffer = b;
    const g = a.createGain();
    const step = 0.01, len = seg.len - skip;
    const curve = new Float32Array(Math.max(2, Math.ceil(len / step) + 1));
    for (let i = 0; i < curve.length; i += 1) curve[i] = gainAt(seg.fades, skip + i * step);
    g.gain.setValueCurveAtTime(curve, when, Math.max(step, len));
    src.connect(g);
    g.connect(bus);
    src.start(when, seg.in + skip, len);
    live.push(src);
    n += 1;
  }
  return n;
}
const resolved = new Map(); // clip -> AudioBuffer (filled by ready)
