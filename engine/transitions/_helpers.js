// Shared helpers for the transition renders (engine/transitions). Files starting with "_" are never registered as transitions.
// Render code may only use these context members: drawImage, fillRect, save, restore, translate, rotate, scale, transform,
// setTransform, beginPath, arc, rect, clip, fill, and the properties globalAlpha, globalCompositeOperation, filter, fillStyle.
// No Math.random, no Date, no getImageData, no gradients: a draw is a pure function of (from, to, u, W, H, brand, params, seed).

export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const easeIn = (t) => t * t;
export const easeOut = (t) => 1 - (1 - t) ** 3;
export const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2);
export const colorOr = (c, fallback) => (typeof c === "string" && c.trim() ? c : fallback);

/** Param values for a descriptor's `params` list: a missing or invalid value falls back to the declared default. */
export function readParams(defs, given) {
  const out = {};
  for (const p of defs) {
    const v = given?.[p.key];
    if (p.kind === "select") out[p.key] = p.options.some(([val]) => val === v) ? v : p.default;
    else out[p.key] = typeof v === "number" && Number.isFinite(v) ? v : p.default;
  }
  return out;
}

/** Seeded PRNG (mulberry32): same seed, same sequence. Never Math.random. */
export function mulberry32(seed) {
  let a = (Math.floor(Number(seed)) || 0) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const DIRS = { izquierda: [-1, 0], derecha: [1, 0], arriba: [0, -1], abajo: [0, 1] };
export const dirVec = (name) => DIRS[name] ?? DIRS.izquierda;
/** The shared "dir" param (motion direction). Returns a fresh object each call. */
export const dirParam = () => ({
  key: "dir",
  label: "Dirección",
  kind: "select",
  default: "izquierda",
  options: [["izquierda", "Izquierda"], ["derecha", "Derecha"], ["arriba", "Arriba"], ["abajo", "Abajo"]],
});

/** Sets ctx.filter when the context supports it. Returns whether the value stuck. Never throws. */
export function setFilter(ctx, value) {
  try {
    if (!("filter" in ctx)) return false;
    ctx.filter = value;
    return ctx.filter === value;
  } catch {
    return false;
  }
}

/** Draws img full frame, scaled by s about the frame centre, with the given alpha. Own save/restore. */
export function drawScaled(ctx, img, s, W, H, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(W / 2, H / 2);
  ctx.scale(s, s);
  ctx.translate(-W / 2, -H / 2);
  ctx.drawImage(img, 0, 0, W, H);
  ctx.restore();
}

/** Motion-blur trail: `steps` copies of img at (x, y) pulled back along (vx, vy) * len, alpha decreasing. Own save/restore. */
export function trail(ctx, img, x, y, W, H, vx, vy, len, steps = 3) {
  ctx.save();
  for (let j = 1; j <= steps; j += 1) {
    const f = j / steps;
    ctx.globalAlpha = 0.22 * (1 - f * 0.75);
    ctx.drawImage(img, x - vx * len * f, y - vy * len * f, W, H);
  }
  ctx.restore();
}

/** Last drawing op of every render when u >= 1: `to` fully, opaque, identity transform, nothing else active. */
export function finishTo(ctx, to, W, H) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.filter = "none";
  ctx.drawImage(to, 0, 0, W, H);
}

/** Cubic-bezier easing with CSS semantics (bisection on x, deterministic). The house curves of references/motion-reglas.md. */
export function bezierEase(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = (t) => ((ax * t + bx) * t + cx) * t;
  const sy = (t) => ((ay * t + by) * t + cy) * t;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let lo = 0, hi = 1, t = x;
    for (let i = 0; i < 40; i += 1) {
      t = (lo + hi) / 2;
      if (sx(t) < x) lo = t; else hi = t;
    }
    return sy(t);
  };
}
export const CAM = bezierEase(0.48, 0.1, 0, 0.9); // "cam": push / zoom of the camera
export const EXIT = bezierEase(0.55, 0.055, 0.675, 0.19); // "exit": accelerating exits
export const OUT = bezierEase(0.16, 1, 0.3, 1); // "out": decelerating entries

/**
 * Motion blur: the image averaged over `poses` ({x, y, s}: offset in px and scale), each drawn about the pivot (px, py).
 * Uniform weight 1/n; poses[0] is the sharpest. Pass one pose for a plain draw. Own save/restore.
 */
export function smearPoses(ctx, img, W, H, poses, px = W / 2, py = H / 2) {
  ctx.save();
  const n = poses.length;
  for (let j = 0; j < n; j += 1) {
    const { x, y, s } = poses[n - 1 - j]; // back to front: the k-th drawn copy gets alpha 1/k
    ctx.globalAlpha = 1 / (j + 1);
    ctx.save();
    ctx.translate(px + x, py + y);
    ctx.scale(s, s);
    ctx.translate(-px, -py);
    ctx.drawImage(img, 0, 0, W, H);
    ctx.restore();
  }
  ctx.restore();
}
