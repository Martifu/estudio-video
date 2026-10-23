// Preview SFX with Web Audio: the same kit files and gains mix.py uses (gain_db on the raw WAV, equal-power pan by event x * panWidth,
// "end" anchor = the WAV ends on the event). Differences vs the render: no per-take jitter, no master loudness/limiter.
let ctx = null;
let kit = { kinds: {}, panWidth: 0.5 };
const buffers = new Map(); // url -> Promise<AudioBuffer (mono)>
let live = [];

const ac = () => (ctx ??= new (window.AudioContext || window.webkitAudioContext)());
export const setKit = (k) => { kit = k ?? kit; };
export function load(url) {
  if (!buffers.has(url)) {
    buffers.set(url, (async () => {
      const raw = await ac().decodeAudioData(await (await fetch(url)).arrayBuffer());
      const mono = ac().createBuffer(1, raw.length, raw.sampleRate);
      const m = mono.getChannelData(0);
      for (let c = 0; c < raw.numberOfChannels; c += 1) { const d = raw.getChannelData(c); for (let i = 0; i < d.length; i += 1) m[i] += d[i] / raw.numberOfChannels; }
      return mono;
    })().catch(() => null));
  }
  return buffers.get(url);
}
export const preload = (urls) => Promise.all(urls.filter(Boolean).map(load));
export function stopAll() {
  for (const s of live) { try { s.stop(); } catch { /* already stopped */ } }
  live = [];
}
function spawn(b, when, gainDb, x, panWidth) {
  const a = ac();
  const src = a.createBufferSource();
  src.buffer = b;
  const th = ((Math.max(-1, Math.min(1, (x ?? 0) * panWidth)) + 1) * Math.PI) / 4;
  const gl = a.createGain(), gr = a.createGain(), merge = a.createChannelMerger(2);
  gl.gain.value = Math.SQRT2 * Math.cos(th) * 10 ** (gainDb / 20);
  gr.gain.value = Math.SQRT2 * Math.sin(th) * 10 ** (gainDb / 20);
  src.connect(gl); src.connect(gr);
  gl.connect(merge, 0, 0); gr.connect(merge, 0, 1);
  merge.connect(a.destination);
  src.start(when);
  live.push(src);
}
/**
 * Schedule every event at/after `from` (video seconds). opts: {enabled, db, isMuted(ev), replaceUrl(ev)}.
 * Must be called from a user gesture the first time (play button).
 */
export async function schedule(events, from, opts = {}) {
  stopAll();
  if (opts.enabled === false) return 0;
  const a = ac();
  if (a.state === "suspended") a.resume().catch(() => {});
  const now = a.currentTime;
  let n = 0;
  for (const ev of events) {
    if (ev.t < from - 0.01 || opts.isMuted?.(ev)) continue;
    const spec = kit.kinds[ev.type];
    const url = opts.replaceUrl?.(ev) ?? spec?.url;
    if (!url) continue;
    const b = await load(url);
    if (!b) continue;
    const start = ev.t - (spec?.anchor === "end" ? b.duration : 0);
    const when = now + Math.max(0, start - from);
    spawn(b, when, (opts.replaceUrl?.(ev) ? -14 : spec?.gain_db ?? -22) + (opts.db ?? 0), ev.x ?? 0, kit.panWidth ?? 0.5);
    n += 1;
  }
  return n;
}
/** Audition one sound (click on an SFX marker). */
export async function audition(ev, replaceUrl) {
  const spec = kit.kinds[ev.type];
  const url = replaceUrl ?? spec?.url;
  if (!url) return false;
  const b = await load(url);
  if (!b) return false;
  const a = ac();
  if (a.state === "suspended") await a.resume();
  spawn(b, a.currentTime, replaceUrl ? -14 : spec?.gain_db ?? -22, ev.x ?? 0, kit.panWidth ?? 0.5);
  return true;
}

/**
 * Schedule the MERGED events (engine/sfx-doc.js mergeSfx) at/after `from`.
 * opts: {enabled, db, isMuted(ev), resolve(ev) -> {url, gainDb, anchor}|null}; gainDb = the sound's default level + the event's trim.
 */
export async function scheduleMerged(events, from, opts = {}) {
  stopAll();
  if (opts.enabled === false) return 0;
  const a = ac();
  if (a.state === "suspended") a.resume().catch(() => {});
  const now = a.currentTime;
  let n = 0;
  for (const ev of events) {
    if (ev.t < from - 0.01 || ev.muted || opts.isMuted?.(ev)) continue;
    const r = opts.resolve?.(ev);
    if (!r?.url) continue;
    const b = await load(r.url);
    if (!b) continue;
    const start = ev.t - (r.anchor === "end" ? b.duration : 0);
    spawn(b, now + Math.max(0, start - from), r.gainDb + (opts.db ?? 0), ev.x ?? 0, kit.panWidth ?? 0.5);
    n += 1;
  }
  return n;
}
/** Play any sound url once (Efectos panel, marker click). gainDb = total level. */
export async function auditionUrl(url, gainDb = -14) {
  if (!url) return false;
  const b = await load(url);
  if (!b) return false;
  const a = ac();
  if (a.state === "suspended") await a.resume();
  spawn(b, a.currentTime, gainDb, 0, kit.panWidth ?? 0.5);
  return true;
}
