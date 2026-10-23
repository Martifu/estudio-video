// Shared drawing kit of the motion library (canvas helpers every element type can use). Pure functions of their arguments: no Date, no
// random, no globals. Card-local coordinates (0,0 = card top-left); text is never drawn below 24 px (1080x1920 units).
// Files starting with "_" are NOT element types (the registry in index.js skips them).
import { clamp, seg, lerp, expoOut, inOut, outBack, pushOf } from "../ui-motion.js";

// ---------- drawing kit ----------
export const rr = (ctx, x, y, w, h, r) => { ctx.beginPath(); ctx.roundRect(x, y, w, h, Math.max(0, Math.min(r, w / 2, h / 2))); };
export const hexA = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};
export const mix = (a, b, k) => {
  const x = parseInt(a.slice(1), 16), y = parseInt(b.slice(1), 16);
  const c = (s) => Math.round(lerp((x >> s) & 255, (y >> s) & 255, k));
  return `rgb(${c(16)},${c(8)},${c(0)})`;
};
export const fnt = (skin, w, px, italic = false) => `${italic ? "italic " : ""}${w} ${px}px "${skin.font.family}", system-ui, sans-serif`;
export const spacing = (ctx, px) => { if ("letterSpacing" in ctx) ctx.letterSpacing = `${px}px`; };
export function ell(ctx, s, maxW) {
  s = String(s ?? "");
  if (!maxW || ctx.measureText(s).width <= maxW) return s;
  while (s.length > 1 && ctx.measureText(`${s}…`).width > maxW) s = s.slice(0, -1);
  return `${s.trimEnd()}…`;
}
/** Text at (x, y = vertical middle). Returns the drawn width. */
export function text(ctx, s, x, y, { font, color, align = "left", maxW, ls = 0 }) {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  spacing(ctx, ls);
  const str = ell(ctx, s, maxW);
  ctx.fillText(str, x, y);
  const w = ctx.measureText(str).width;
  spacing(ctx, 0);
  return w;
}
export function wrapText(ctx, s, maxW, maxLines) {
  const words = String(s ?? "").split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = "";
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(test).width <= maxW || !cur) cur = test;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) { const keep = lines.slice(0, maxLines); keep[maxLines - 1] = ell(ctx, `${keep[maxLines - 1]} ${lines.slice(maxLines).join(" ")}`, maxW); return keep; }
  return lines;
}
export const shadow = (ctx, color, blur, y = 0) => { ctx.shadowColor = color; ctx.shadowBlur = blur; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = y; };
export const noShadow = (ctx) => { ctx.shadowColor = "transparent"; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0; };
export function card(ctx, x, y, w, h, r, skin, { fill = skin.colors.surface, blur = 70, off = 30, a = 0.32 } = {}) {
  ctx.save();
  shadow(ctx, `rgba(16,24,40,${a})`, blur, off);
  ctx.fillStyle = fill;
  rr(ctx, x, y, w, h, r);
  ctx.fill();
  ctx.restore();
}
export function pill(ctx, skin, s, x, y, { bg, color = "#fff", px = 24, h = 40, padX = 16, w: weight = 700, r = skin.radius.pill, align = "left" }) {
  ctx.font = fnt(skin, weight, px);
  const w = ctx.measureText(s).width + padX * 2;
  const x0 = align === "right" ? x - w : align === "center" ? x - w / 2 : x;
  ctx.fillStyle = bg;
  rr(ctx, x0, y - h / 2, w, h, r);
  ctx.fill();
  text(ctx, s, x0 + padX, y + 1, { font: ctx.font, color });
  return w;
}
export function checkMark(ctx, cx, cy, size, color, lw = size * 0.11) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(cx - size * 0.3, cy + size * 0.02);
  ctx.lineTo(cx - size * 0.08, cy + size * 0.24);
  ctx.lineTo(cx + size * 0.32, cy - size * 0.2);
  ctx.stroke();
  ctx.restore();
}
export function disc(ctx, cx, cy, r, fill) { ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill(); }
export function checkBadge(ctx, cx, cy, size, bg, k = 1) {
  if (k <= 0) return;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(k, k);
  disc(ctx, 0, 0, size / 2, bg);
  checkMark(ctx, 0, 0, size * 0.62, "#fff", size * 0.075);
  ctx.restore();
}
export const PALETTE = ["#5E17EB", "#01A0C6", "#E8590C", "#2F9E44", "#C2255C", "#3B5BDB"];
export const hash = (s) => { let h = 7; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; };
export const initials = (name) => String(name ?? "?").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
/** Round avatar: the image when `ref` resolves to a decoded one, else coloured initials of `name`. */
export function avatar(ctx, env, ref, name, cx, cy, r) {
  const img = ref ? env.img(ref) : null;
  if (img) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    const s = Math.max((2 * r) / img.width, (2 * r) / img.height);
    ctx.drawImage(img, cx - (img.width * s) / 2, cy - (img.height * s) / 2, img.width * s, img.height * s);
    ctx.restore();
    return;
  }
  disc(ctx, cx, cy, r, PALETTE[hash(name) % PALETTE.length]);
  text(ctx, initials(name), cx, cy + 1, { font: fnt(env.skin, 700, Math.round(r * 0.8)), color: "#fff", align: "center" });
}
export function coverImage(ctx, img, x, y, w, h, r) {
  ctx.save();
  rr(ctx, x, y, w, h, r);
  ctx.clip();
  const s = Math.max(w / img.width, h / img.height);
  ctx.drawImage(img, x + (w - img.width * s) / 2, y + (h - img.height * s) / 2, img.width * s, img.height * s);
  ctx.restore();
}

// ---------- cursor ----------
// path: [[t, x, y], ...] in canvas px, eased between waypoints (inOut). Hover grows x1.3 before the click, the press shrinks 15 %, a ripple follows.
export function cursorAt(path, ts) {
  let x = path[0][1], y = path[0][2];
  for (let i = 0; i < path.length - 1; i += 1) {
    const [ta, xa, ya] = path[i], [tb, xb, yb] = path[i + 1];
    if (ts >= ta) { const k = inOut(seg(ts, ta, tb)); x = lerp(xa, xb, k); y = lerp(ya, yb, k); }
  }
  return { x, y };
}
export function drawCursor(ctx, skin, ts, path, clickAt, alpha, ripple = skin.colors.accent) {
  if (alpha <= 0) return;
  const { x, y } = cursorAt(path, ts);
  const hover = seg(ts, clickAt - 0.35, clickAt - 0.1);
  const press = Math.max(0, 1 - Math.abs(ts - clickAt - 0.05) / 0.12);
  const s = (1 + 0.3 * hover) * (1 - 0.15 * press);
  const r = seg(ts, clickAt, clickAt + 0.45);
  ctx.save();
  if (r > 0 && r < 1) {
    ctx.globalAlpha = alpha * (1 - r);
    ctx.strokeStyle = ripple;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(x + 6, y + 6, 20 * (1 + r * 4), 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.scale(s, s);
  shadow(ctx, "rgba(0,0,0,0.35)", 10, 6);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(40, 24);
  ctx.lineTo(22.7, 28.3);
  ctx.lineTo(14.4, 45.3);
  ctx.closePath();
  ctx.fillStyle = "#fff";
  ctx.fill();
  noShadow(ctx);
  ctx.strokeStyle = "#111";
  ctx.lineWidth = 3.7;
  ctx.lineJoin = "round";
  ctx.stroke();
  ctx.restore();
}

// ---------- shared card envelope ----------
// Blob birth (small rounded white blob -> card, with overshoot), forward-only camera push, blur / fade exit. Returns the state to draw with.
export function envelope(tl, ts, o = {}) {
  const k = seg(ts, tl.b.blob?.[0] ?? 0, tl.b.blob?.[1] ?? 0.5);
  const ex = seg(ts, tl.b.exit[0], tl.b.exit[1]);
  return { k, ex, blob: lerp(0.18, 1, outBack(k, 1.9)), alpha: (k > 0 ? 1 : 0) * (1 - inOut(ex)), exitScale: 1 - 0.04 * inOut(ex), ...o };
}
export const pushScale = (el, tl, ts, w) => {
  if (!tl.b.push) return 1;
  const p = clamp(pushOf(el), 0, Math.max(0, 960 / w - 1)); // never past the safe width
  return 1 + p * inOut(seg(ts, tl.b.push[0], tl.b.push[1]));
};
export function beginCard(ctx, el, tl, ts, rect, origin, E) {
  ctx.save();
  ctx.globalAlpha = E.alpha;
  if (E.blurExit && E.ex > 0) ctx.filter = `blur(${(10 * inOut(E.ex)).toFixed(2)}px)`;
  const sc = E.blob * pushScale(el, tl, ts, rect.w) * E.exitScale;
  ctx.translate(rect.x + origin[0], rect.y + origin[1]);
  ctx.scale(sc, sc);
  ctx.translate(-origin[0], -origin[1]);
}
export const radiusAt = (E, skin, w, h) => lerp(300, skin.radius.card, expoOut(E.k)) > Math.min(w, h) / 2 ? Math.min(w, h) / 2 : lerp(300, skin.radius.card, expoOut(E.k));
export const rise = (ts, a, dur = 0.45) => { const k = expoOut(seg(ts, a, a + dur)); return { k, a: k, dy: (1 - k) * 60 }; };


// ---------- brand kit ----------
// env.kit (built by brand-layer.js, stubbed by index.js when absent): the brand as the library needs it.
//   { name, colors: {primary, ink, paper, accent, on_primary, accent_on_paper}, cta, website, webHost,
//     font(which: "display"|"body", px, weight) -> CSS font string, hasLogo(variant), logoSize(variant) -> {w,h}|null,
//     drawLogo(ctx, variant, cx, cy, maxW, maxH) -> bool, missingLogo(variant) (reports an asset error) }
/** Relative luminance 0..1 of "#rrggbb". */
export const lum = (hex) => {
  const n = parseInt(String(hex).slice(1), 16);
  const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * f((n >> 16) & 255) + 0.7152 * f((n >> 8) & 255) + 0.0722 * f(n & 255);
};
/** Text colour readable on footage: the brand primary unless it is too dark, then the accent, then white. */
export const footageColor = (colors) => [colors.primary, colors.accent].find((c) => /^#[0-9a-f]{6}$/i.test(c ?? "") && lum(c) >= 0.18) ?? "#FFFFFF";
/** Deterministic phases for an organic shape from a string seed (no Math.random). */
export const seedPhases = (seed, n) => { let h = hash(seed || "seed"); return Array.from({ length: n }, () => { h = (Math.imul(h, 1664525) + 1013904223) >>> 0; return (h / 4294967296) * Math.PI * 2; }); };
/** Luminance statistics of a box of RGBA pixels (ImageData.data of a w x h canvas), sampled every `step` px: { lum (mean), min, max } of the per-pixel relative luminance (0..1). */
export function boxLuminance(data, w, h, box, step = 4) {
  const x0 = Math.max(0, Math.floor(box.x)), y0 = Math.max(0, Math.floor(box.y));
  const x1 = Math.min(w, Math.ceil(box.x + box.w)), y1 = Math.min(h, Math.ceil(box.y + box.h));
  const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  let sum = 0, n = 0, min = 1, max = 0;
  for (let y = y0; y < y1; y += step) {
    for (let x = x0; x < x1; x += step) {
      const i = (y * w + x) * 4;
      const L = 0.2126 * lin(data[i]) + 0.7152 * lin(data[i + 1]) + 0.0722 * lin(data[i + 2]);
      sum += L; n += 1; min = Math.min(min, L); max = Math.max(max, L);
    }
  }
  return n ? { lum: sum / n, min, max } : null;
}
