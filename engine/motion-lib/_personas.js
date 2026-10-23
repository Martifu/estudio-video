// Shared helpers of the "Personas" group (avatarCircle, avatarStack, socialProof, testimonial, rating). Not an element type (underscore).
// Pure functions of their arguments: no Date, no random, no globals.
import { clamp, seg, expoOut, outBack, inOut, lerp, fmtNumber } from "../ui-motion.js";
import { fnt, text, wrapText } from "./_kit.js";

/** Monotonic count-up: 0 at k=0, `final` at k>=1, never above `final`, never back down. Returns an integer. */
export const countAt = (final, k) => (k >= 1 ? final : Math.round(final * (1 - Math.pow(1 - clamp(k), 3))));
/** Count-up that starts at `from` (fraction of the final value), never at 0: no fake zero. Monotonic, lands exactly on `final`. */
export const countFrom = (final, k, from = 0.7) => (k >= 1 ? final : Math.round(final * (from + (1 - from) * (1 - Math.pow(1 - clamp(k), 3)))));
/** Decimal version of countFrom for ratings ("3.8" -> "4.8"): one digit, exact text at the end. */
export const scoreFrom = (score, k, from = 0.8) => (k >= 1 ? score.toFixed(1) : (Math.round(score * 10 * (from + (1 - from) * (1 - Math.pow(1 - clamp(k), 3)))) / 10).toFixed(1));
/** Same for a decimal value with one digit (ratings): exact text at the end ("4.8"), never above the score. */
export const scoreAt = (score, k) => (k >= 1 ? score.toFixed(1) : (Math.round(score * 10 * (1 - Math.pow(1 - clamp(k), 3))) / 10).toFixed(1));
/** Thousands separator for integers ("1,240"). */
export const groupInt = (n) => fmtNumber(Math.round(n));
export const wordCount = (s) => String(s ?? "").trim().split(/\s+/).filter(Boolean).length;
/** Stagger child window from a {start, step, dur} beat (design seconds). */
export const childSpan = (st, i) => [st.start + i * st.step, st.start + i * st.step + st.dur];
/** Slide-out / slide-in progress: 0 = hidden (offset by `dist`), 1 = in place. */
export const slideIn = (ts, a, dur, dist) => { const k = expoOut(seg(ts, a, a + dur)); return { k, dx: (1 - k) * dist }; };
/** Pops (scale overshoot) from 0.6 to 1 for a child whose span starts at a. Returns { s, alpha }. */
export const popIn = (ts, a, dur = 0.35) => { const p = seg(ts, a, a + dur); return { s: lerp(0.6, 1, outBack(p)), alpha: clamp(p * 3), p }; };

/** Five-point star outline (outer radius R) centred at cx, cy. */
export function starPath(ctx, cx, cy, R) {
  const r = R * 0.46;
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 === 0 ? R : r;
    const x = cx + Math.cos(a) * rad, y = cy + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
}
/** Star filled `frac` (0..1, left to right) with `on`, rest in `off`. Half and fractional stars read as partial fills. */
export function drawStar(ctx, cx, cy, R, frac, on, off) {
  starPath(ctx, cx, cy, R);
  ctx.fillStyle = off;
  ctx.fill();
  if (frac <= 0) return;
  ctx.save();
  starPath(ctx, cx, cy, R);
  ctx.clip();
  ctx.fillStyle = on;
  ctx.fillRect(cx - R, cy - R, 2 * R * clamp(frac), 2 * R);
  ctx.restore();
}
/** Wrapped lines of a text, each one 1..maxLines, at font `font` (ctx.font is set by the caller through text()). */
export function linesOf(ctx, s, font, maxW, maxLines) {
  ctx.font = font;
  return wrapText(ctx, s, maxW, maxLines);
}
/** Plain text helper that always sets the font first (keeps the brand font through env.skin). */
export const label = (ctx, skin, s, x, y, { w = 700, px, color, align = "left", maxW, ls = 0 }) => text(ctx, s, x, y, { font: fnt(skin, w, px), color, align, maxW, ls });
/** Fixed white disc under an avatar so overlapping photos separate cleanly. */
export const ring = (ctx, cx, cy, r, color) => { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill(); };
/** Brand ring that draws in clockwise from the top (p = 0..1). */
export function drawRing(ctx, cx, cy, r, p, color, lw = 8) {
  if (p <= 0) return;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp(p));
  ctx.stroke();
  ctx.restore();
}
/** Avatar refs must be the bundled bank (people:pNN) or a relative path; the validators below only check the shape. */
export const AVATAR_RE = /^(people:p\d{2}|[\w./-]+\.(png|jpe?g|webp))$/i;
export const avatarOk = (ref) => ref === undefined || ref === null || ref === "" || AVATAR_RE.test(String(ref));
/** Inspector "blocks" field of a list (fields is a function of the row, as in uiFeed). */
export const itemsField = (label0, fields, min, max, blank, name) => ({ key: "items", label: label0, kind: "blocks", prop: "items", min, max, blank, name, fields: () => fields });
/** Cost of a pinned-by-preference slot, same as index.js PIN_PENALTY (a copy: elements must not import the registry). */
export const PIN_PENALTY = 260;
/** Slot rect of a w x h box (same rule as index.js slotRect; a copy here because elements must not import the registry). */
export function slotRectOf(slot, w, h, zones) {
  const x = Math.round((zones.x0 + zones.x1) / 2 - w / 2);
  let y;
  if (slot === "top") y = zones.toastTop;
  else if (slot === "center") y = Math.round((zones.toastTop + zones.bottom) / 2 - h / 2);
  else y = zones.bottom - h;
  return { x, y, w, h };
}
