// Frame-sequence player for deterministic compositions. Frames are JPEGs named %04d.jpg (1-based), e.g. footage/<name>/0001.jpg.
// The frame index is a pure function of t: floor((t - start) * fps) + 1 (+ offset). Frames load on demand; render(t) must be
// async (render.mjs awaits it), so every capture has its frame decoded before drawing.
const cache = new Map(); // url -> Promise<HTMLImageElement>
const lastGood = new Map(); // dir -> last successfully decoded image (fallback when a frame is missing)
let MAX_CACHE = 24;

// Studio only: a bigger cache and look-ahead decoding keep playback from waiting on JPEG decodes (offline renders never call these).
export const setCacheSize = (n) => { MAX_CACHE = Math.max(24, n | 0); };
export const prefetchFrames = (dir, from, count, n = Infinity) => {
  for (let i = from; i < from + count && i <= n; i += 1) loadFrame(dir, i).catch(() => {});
};

export const pad = (i) => String(i).padStart(4, "0");

export function frameIndex(t, { start = 0, fps = 30, offset = 0, n = Infinity } = {}) {
  const i = Math.floor((t - start) * fps + 1e-6) + 1 + offset;
  return Math.min(n, Math.max(1, i));
}

export function loadFrame(dir, idx) {
  const url = `${dir}/${pad(idx)}.jpg`;
  if (!cache.has(url)) {
    const img = new Image();
    img.src = url;
    cache.set(url, img.decode().then(() => img));
    while (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value); // bounded memory
  }
  return cache.get(url);
}

// Draws image `img` into the canvas rectangle (0,0,W,H) with CSS-like object-fit.
export function drawFit(ctx, img, fit = "cover", W = ctx.canvas.width, H = ctx.canvas.height) {
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  const k = fit === "contain" ? Math.min(W / iw, H / ih) : Math.max(W / iw, H / ih);
  const w = iw * k;
  const h = ih * k;
  ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
}

// Draws a source rect `crop` {x,y,w,h} (frame pixels, 1080x1920 space) of `img` into the canvas rect `box` {x,y,w,h}
// with object-fit semantics (cover crops the overflow around the center of the crop, contain letterboxes).
export function drawCrop(ctx, img, crop, box, fit = "cover") {
  const k = fit === "contain" ? Math.min(box.w / crop.w, box.h / crop.h) : Math.max(box.w / crop.w, box.h / crop.h);
  const sw = box.w / k;
  const sh = box.h / k;
  const sx = crop.x + (crop.w - sw) / 2;
  const sy = crop.y + (crop.h - sh) / 2;
  if (fit === "contain") {
    const dw = crop.w * k;
    const dh = crop.h * k;
    ctx.drawImage(img, crop.x, crop.y, crop.w, crop.h, box.x + (box.w - dw) / 2, box.y + (box.h - dh) / 2, dw, dh);
  } else ctx.drawImage(img, sx, sy, sw, sh, box.x, box.y, box.w, box.h);
}

// opts: { start = 0, fps = 30, fit = 'cover'|'contain', offset = 0, n = frame count (clamps to the last frame),
//         crop = {x,y,w,h} optional source rect, box = {x,y,w,h} optional destination rect (default: the whole canvas) }
// Without crop/box the behavior is unchanged. Returns true when a frame was drawn.
export async function drawFootage(ctx, dir, t, opts = {}) {
  const idx = frameIndex(t, opts);
  let img;
  try {
    img = await loadFrame(dir, idx);
    lastGood.set(dir, img);
  } catch {
    img = lastGood.get(dir);
  }
  if (!img) return false;
  if (opts.crop || opts.box) {
    const crop = opts.crop ?? { x: 0, y: 0, w: img.naturalWidth, h: img.naturalHeight };
    drawCrop(ctx, img, crop, opts.box ?? { x: 0, y: 0, w: ctx.canvas.width, h: ctx.canvas.height }, opts.fit ?? "cover");
  } else drawFit(ctx, img, opts.fit ?? "cover");
  return true;
}

// Preloads the first frame of each dir (call before window.READY = true). shots: [dir | {dir, start, fps, offset}]
export async function preloadFootage(shots, t = 0) {
  await Promise.all(shots.map((s) => (typeof s === "string" ? loadFrame(s, 1) : loadFrame(s.dir, frameIndex(t, s))).catch(() => null)));
}
