// Shared helpers of the "Texto" family (quoteCard, stepsTimeline, highlighterText, lowerThirdPro, bigNumberStatement).
// Pure functions: no DOM, no Date, no random. Sizes are canvas px (1080 x 1920). Files starting with "_" are NOT element types.
import { seg, lerp, expoOut, inOut } from "../ui-motion.js";
import { lum } from "./_kit.js";

export const ZONES = { x0: 60, x1: 1020, toastTop: 350, bottom: 1540 };
export const HEX = /^#[0-9a-f]{6}$/i;
export const SLOTS = ["band", "center", "top"];
export const SLOT_COST = { band: 0, center: 30, top: 60 };
export const EXIT = 0.4; // seconds of the exit (fade + small retreat); the other beats are compressed when the window is short
export const MAX_WORDS = 8; // words visible at once (motion-reglas.md)
export const MIN_CONTRAST = 4.5;

/** Words of a string (whitespace split, empty dropped). */
export const words = (s) => String(s ?? "").trim().split(/\s+/).filter(Boolean);

/**
 * Tokens of a phrase with highlight flags. "*palabra*" marks a word and "*menos tiempo*" marks a run.
 * Returns [{w, hl}] with the asterisks removed.
 */
export function tokensOf(s) {
  let on = false;
  return words(s).map((raw) => {
    const open = raw.startsWith("*");
    if (open) on = true;
    const mark = on;
    const close = raw.endsWith("*") && raw.length > 1;
    if (close) on = false;
    return { w: raw.replace(/\*/g, ""), hl: mark };
  }).filter((t) => t.w);
}
/** The phrase without asterisks (what texts() reports to the claims review). */
export const plainOf = (s) => tokensOf(s).map((t) => t.w).join(" ");

/** Seconds a text needs to be read: 0.7 s + 0.13 s per word, at least 1 s (tranquilo, motion-reglas.md). */
export const minRead = (n) => Math.max(1, 0.7 + 0.13 * n);

/** WCAG contrast ratio of two "#rrggbb" colours (1..21). */
export function contrast(a, b) {
  const x = lum(a), y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
/** Mix of two "#rrggbb" colours: t = 0 -> a, 1 -> b. */
export function blend(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const c = (s) => Math.round(lerp((pa >> s) & 255, (pb >> s) & 255, t)).toString(16).padStart(2, "0");
  return `#${c(16)}${c(8)}${c(0)}`;
}
/** First candidate colour that reads on `bg` with >= 4.5:1; otherwise the one with the most contrast. */
export function readable(bg, cands) {
  const ok = cands.filter((c) => HEX.test(c ?? ""));
  const pass = ok.find((c) => contrast(c, bg) >= MIN_CONTRAST);
  return pass ?? ok.sort((a, b) => contrast(b, bg) - contrast(a, bg))[0];
}

/** Width measurer: env.measure(font, s) when the host has a canvas, else an 0.55 em estimate (Node tests, thumbnails). */
export function measurer(env) {
  if (env?.measure) return (font, s) => env.measure(font, s);
  return (font, s) => String(s).length * 0.55 * (Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1]) || 40);
}

/** Greedy word wrap. ws = words; returns lines as arrays of word indices (a word wider than maxW stays alone). */
export function wrapIdx(m, font, ws, maxW) {
  const lines = [];
  let cur = [];
  ws.forEach((w, i) => {
    const test = [...cur, i].map((j) => ws[j]).join(" ");
    if (!cur.length || m(font, test) <= maxW) cur.push(i);
    else { lines.push(cur); cur = [i]; }
  });
  if (cur.length) lines.push(cur);
  return lines;
}

/**
 * Largest size in [pxMin, pxMax] at which the text fits `maxLines` lines of `maxW` px (and `maxH` px of height).
 * Returns { px, font, lh, lines: [string] }. Never returns more lines than maxLines (the caller warns when the text is too long).
 */
export function fitText(env, kit, which, weight, s, { maxW, maxLines, maxH = Infinity, pxMax, pxMin, lh = 1.12 }) {
  const m = measurer(env), ws = words(s);
  const at = (px) => {
    const font = kit.font(which, px, weight);
    const idx = ws.length ? wrapIdx(m, font, ws, maxW) : [];
    return { px, font, lh: Math.round(px * lh), idx, lines: idx.map((ix) => ix.map((i) => ws[i]).join(" ")) };
  };
  for (let px = Math.floor(pxMax); px >= pxMin; px -= 2) {
    const f = at(px);
    if (f.lines.length <= maxLines && f.lines.length * f.lh <= maxH && f.lines.every((l) => m(f.font, l) <= maxW + 0.5)) return f;
  }
  return at(Math.floor(pxMin));
}

/** Box of w x h in a slot, horizontally centred unless x is given. band = bottom of the free area, top = under the header, center = middle. */
export function boxRect(slot, w, h, zones = ZONES, x = null) {
  const X = x ?? Math.round((zones.x0 + zones.x1) / 2 - w / 2);
  const y = slot === "top" ? zones.toastTop + 20 : slot === "center" ? (zones.toastTop + zones.bottom) / 2 - h / 2 : zones.bottom - h;
  return { x: Math.round(X), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
}
export const slotOf = (el) => (SLOTS.includes(el.slot) ? el.slot : "band");

/**
 * Candidates for the face-aware planner: every slot (or the pinned one) x two sizes. layoutFn(el, env, zones) -> {rect, px}.
 * A candidate's patch writes the slot and an explicit size (the px the auto fit chose, times the variant factor).
 */
export function candidatesOf(type, el, zones, env, layoutFn) {
  // el.slot is a preference, not a pin: the preferred slot costs 0, the others PIN_PENALTY more (same rule as index.js defaultCandidates)
  const pref = SLOTS.includes(el.slot) ? el.slot : null;
  const factors = Number.isFinite(el.size) ? [1] : [1, 0.86];
  const base = Number.isFinite(el.size) ? el.size : layoutFn(el, env, zones).px;
  const out = [];
  for (const slot of SLOTS) {
    const slotCost = pref ? (slot === pref ? 0 : PIN_PENALTY + SLOT_COST[slot]) : SLOT_COST[slot];
    for (const f of factors) {
      const size = Math.round(base * f);
      out.push({ name: `${type}-${slot}`, rect: layoutFn({ ...el, slot, size }, env, zones).rect, patch: { slot, size }, cost: slotCost + (1 - f) * 120 });
    }
  }
  return out;
}
/** Penalty of a non-preferred slot: same value as index.js PIN_PENALTY (copied: elements must not import the registry). */
export const PIN_PENALTY = 260;

/** Time scale that fits the entry (E seconds of beats at design scale) into the window D, keeping the exit. Never stretches (<= 1). */
export const fitScale = (D, E, exit = EXIT) => Math.min(1, Math.max(0.3, D - exit - 0.1) / Math.max(E, 1e-6));

/** Exit timeline shared by the texto elements: real seconds, the exit occupies the last EXIT seconds of the window. */
export function timelineTexto(el, exit) {
  const D = Math.max(0.05, (Number(el.out) || 0) - (Number(el.in) || 0));
  const x = Number.isFinite(exit) ? exit : EXIT; // callers may pass a context object as the 2nd argument: only a finite number overrides EXIT
  return { Ld: D, b: { exit: [Math.max(0, D - x), D] } };
}

/** Reveal of a clip rectangle that grows from its left edge: p in 0..1 (eased by the caller). */
export const wipeX = (ctx, x, y, w, h, p) => { ctx.beginPath(); ctx.rect(x, y, Math.max(0, w * p), h); ctx.clip(); };
/** Reveal from the top edge down. */
export const wipeY = (ctx, x, y, w, h, p) => { ctx.beginPath(); ctx.rect(x - 60, y - 60, w + 120, Math.max(0, h * p + 60)); ctx.clip(); };

export { seg, lerp, expoOut, inOut };
