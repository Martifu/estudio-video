// Shared helpers of the "Venta" group (priceTag, priceCompare, featureChecklist, countdown, compareTable, planCards, offerBadge, stampText).
// Not an element type (underscore = the registry skips it). Pure functions: no clock reads, no unseeded randomness, no globals.
import { clamp, seg, fmtMoney, inOut, pushOf } from "../ui-motion.js";
import { hash, lum } from "./_kit.js";

/** Text colour on a flat fill of the brand primary: white on dark brands, near-black on light ones. */
export const onPrimary = (hex) => (/^#[0-9a-f]{6}$/i.test(String(hex ?? "")) && lum(hex) < 0.35 ? "#FFFFFF" : "#111111");

// ---------- money (es-MX: "$1,284,000"; decimals only when the amount has them) ----------
/** Money string of a number; `dec` forces the decimals used while counting (so the digits do not jump). */
export const money = (v, dec = Number.isInteger(Number(v)) ? 0 : 2) => fmtMoney(Number(v), dec);

/** Count-up value at progress k (0..1): ease-out cubic, monotonic, exactly `value` at k >= 1 (never above it). */
export function countUp(value, k) {
  const n = Number(value) || 0;
  if (k >= 1) return n;
  const f = 1 - Math.pow(1 - clamp(k), 3);
  const p = 10 ** (Number.isInteger(n) ? 0 : 2);
  return Math.round(n * f * p) / p;
}

/** Count that starts at 70 % of the value (a believable start, never a fake zero) and lands exactly on `value` at k >= 1. */
export function countFrom(value, k) {
  const n = Number(value) || 0;
  if (k >= 1) return n;
  const p = 10 ** (Number.isInteger(n) ? 0 : 2);
  const f = 1 - Math.pow(1 - clamp(k), 3);
  return Math.round((n * 0.7 + n * 0.3 * f) * p) / p;
}

// ---------- remaining time and deadlines (countdown) ----------
/** "DD:HH:MM:SS" -> seconds, or null when malformed (hours <= 23, minutes and seconds <= 59). */
export function parseRemaining(s) {
  const m = /^(\d{1,3}):(\d{2}):(\d{2}):(\d{2})$/.exec(String(s ?? "").trim());
  if (!m) return null;
  const [d, h, mi, se] = m.slice(1).map(Number);
  if (h > 23 || mi > 59 || se > 59) return null;
  return d * 86400 + h * 3600 + mi * 60 + se;
}
/** "aaaa-mm-dd" or "aaaa-mm-dd hh:mm" with a real month and day. */
export function validDeadline(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})( \d{2}:\d{2})?$/.exec(String(s ?? "").trim());
  if (!m) return false;
  const mo = Number(m[2]), d = Number(m[3]);
  return mo >= 1 && mo <= 12 && d >= 1 && d <= 31;
}

// ---------- motion ----------
/** Damped swing of a hanging piece after it lands: starts at `amp` radians at `a`, decays over `dur`, 0 outside. */
export function dampedSwing(ts, a, dur, amp, cycles = 2.2, decay = 4.2) {
  if (ts < a || dur <= 0) return 0;
  const x = clamp((ts - a) / dur);
  return x >= 1 ? 0 : amp * Math.exp(-decay * x) * Math.cos(2 * Math.PI * cycles * x);
}
/** Checkmark drawn on (p 0..1 along its two legs), same geometry as the kit's checkMark. */
export function drawCheck(ctx, cx, cy, size, color, lw, p) {
  if (p <= 0) return;
  const a = [cx - size * 0.3, cy + size * 0.02], b = [cx - size * 0.08, cy + size * 0.24], c = [cx + size * 0.32, cy - size * 0.2];
  const l1 = Math.hypot(b[0] - a[0], b[1] - a[1]), l2 = Math.hypot(c[0] - b[0], c[1] - b[1]);
  const left = clamp(p) * (l1 + l2);
  ctx.save();
  ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(a[0], a[1]);
  if (left <= l1) { const k = left / l1; ctx.lineTo(a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k); }
  else {
    ctx.lineTo(b[0], b[1]);
    const k = (left - l1) / l2;
    ctx.lineTo(b[0] + (c[0] - b[0]) * k, b[1] + (c[1] - b[1]) * k);
  }
  ctx.stroke();
  ctx.restore();
}
/** Cross drawn on (p 0..1): first stroke then second. Neutral grey by default (the caller passes it). */
export function drawCross(ctx, cx, cy, size, color, lw, p) {
  if (p <= 0) return;
  const s = size * 0.3;
  const q1 = clamp(p * 2), q2 = clamp(p * 2 - 1);
  ctx.save();
  ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(cx - s, cy - s); ctx.lineTo(cx - s + 2 * s * q1, cy - s + 2 * s * q1);
  if (q2 > 0) { ctx.moveTo(cx + s, cy - s); ctx.lineTo(cx + s - 2 * s * q2, cy - s + 2 * s * q2); }
  ctx.stroke();
  ctx.restore();
}

// ---------- ink texture (deterministic: a seeded LCG, no unseeded randomness) ----------
/** n small specks inside a w x h box, the same for the same seed. Used as paper showing through the ink. */
export function speckles(seed, n, w, h) {
  let s = hash(seed) || 1;
  const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  return Array.from({ length: n }, () => ({ x: rnd() * w, y: rnd() * h, r: 0.9 + rnd() * 2.4, a: 0.2 + rnd() * 0.35 }));
}

// ---------- products.json ----------
/** Prefill patch for a price element from the first product with a price in MXN: {productId, label, value, prefix?, source}, or null. */
export function productPatch(doc) {
  const p = (doc?.products ?? []).find((x) => Number.isFinite(Number(x.price)) && (!x.currency || x.currency === "MXN"));
  if (!p) return null;
  return {
    productId: p.id,
    label: p.name,
    value: Number(p.price),
    ...(p.priceNote === "desde" ? { prefix: "desde" } : {}),
    source: { kind: p.source === "reda" ? "reda" : "brand", ref: "products.json", ...(p.fetchedAt ? { fetchedAt: p.fetchedAt } : {}) }
  };
}

/** Problems shared by the price elements: a price must be a finite number. */
export const priceProblem = (v, tag) => (Number.isFinite(Number(v)) && v !== "" && v !== null ? null : `${tag}: necesita un precio (número)`);

// ---------- screen controls: camera push (the same convention as the ui screens: `push` 0..0.15, absent = no push) ----------
/** Runs fn() with the card pushed forward around its centre (ease in-out over the hold). Never wider than the safe width (936 px). */
export function pushed(ctx, el, ts, tl, rect, fn) {
  const want = el.push === undefined ? 0 : pushOf(el);
  const p = Math.min(want, Math.max(0, 936 / rect.w - 1));
  const s = 1 + p * inOut(seg(ts, tl.Ld * 0.2, tl.Ld * 0.85));
  if (s === 1) return fn();
  const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
  ctx.save();
  ctx.translate(cx, cy); ctx.scale(s, s); ctx.translate(-cx, -cy);
  fn();
  ctx.restore();
}

// ---------- face-aware positions (the planner scores each candidate against the face; a pinned slot keeps only that one) ----------
export const SLOT_COST = { band: 0, center: 30, top: 60 };
/** Geometry of a slot (same rules as index.js slotRect: band bottom-anchored, top under the header, centre in the free area). */
export function slotBox(slot, w, h, zones) {
  const x = Math.round((zones.x0 + zones.x1) / 2 - w / 2);
  const y = slot === "top" ? zones.toastTop : slot === "center" ? Math.round((zones.toastTop + zones.bottom) / 2 - h / 2) : zones.bottom - h;
  return { x, y, w, h };
}
/** Cost of a slot: the pinned slot (el.slot) costs 0 and the others PIN_PENALTY more (a preference, not a pin, like index.js defaultCandidates). */
export const PIN_PENALTY = 260; // same value as index.js PIN_PENALTY (not imported: index.js loads these modules)
export function slotCost(el, slot) {
  const pref = ["band", "center", "top"].includes(el.slot) ? el.slot : null;
  return pref ? (slot === pref ? 0 : PIN_PENALTY + SLOT_COST[slot]) : SLOT_COST[slot];
}
/** candidates() for a card of w x h: one position per slot (band, centre, top); el.slot only sets the cost of each. */
export function slotCandidates(el, zones, w, h, name) {
  return ["band", "center", "top"].map((slot) => ({ name: `${name}-${slot}`, rect: slotBox(slot, w, h, zones), patch: { slot }, cost: slotCost(el, slot) }));
}
