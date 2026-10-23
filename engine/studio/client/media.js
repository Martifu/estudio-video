// Timeline media helpers: audio waveform peaks and video thumbnails (cached).
const peaksCache = new Map();
let actx = null;
export async function loadPeaks(url, perSec = 100) {
  if (!url) return null;
  if (peaksCache.has(url)) return peaksCache.get(url);
  const p = (async () => {
    try {
      actx ??= new (window.AudioContext || window.webkitAudioContext)();
      const buf = await actx.decodeAudioData(await (await fetch(url)).arrayBuffer());
      const ch = buf.getChannelData(0);
      const step = Math.max(1, Math.floor(buf.sampleRate / perSec));
      const n = Math.ceil(ch.length / step);
      const peaks = new Float32Array(n);
      for (let i = 0; i < n; i += 1) {
        let m = 0;
        for (let j = i * step; j < Math.min(ch.length, (i + 1) * step); j += 1) { const v = Math.abs(ch[j]); if (v > m) m = v; }
        peaks[i] = m;
      }
      return { peaks, perSec: buf.sampleRate / step, duration: buf.duration };
    } catch (err) {
      console.warn("waveform failed", url, err);
      return null;
    }
  })();
  peaksCache.set(url, p);
  return p;
}

const thumbs = new Map(); // url -> Promise<ImageBitmap|null>
export function thumb(clipName, frame) {
  const url = `/footage/${clipName}/${String(frame).padStart(4, "0")}.jpg`;
  if (!thumbs.has(url)) {
    thumbs.set(url, fetch(url).then((r) => (r.ok ? r.blob() : null)).then((b) => (b ? createImageBitmap(b, { resizeWidth: 72, resizeHeight: 128, resizeQuality: "low" }) : null)).catch(() => null));
    if (thumbs.size > 300) thumbs.delete(thumbs.keys().next().value);
  }
  return thumbs.get(url);
}
