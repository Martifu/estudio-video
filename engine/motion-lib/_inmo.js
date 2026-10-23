// Shared helpers of the "Inmobiliario" group (real-estate elements: unitCard, amenityGrid, floorPlanReveal, mapPin, availabilityGrid,
// paymentPlan, beforeAfter). Underscore file: not an element type. Pure functions only: no Date, no Math.random, no globals.
import { seg, lerp, expoOut, inOut, outBack, clamp, countText } from "../ui-motion.js";
import { rr, fnt, text, hexA, mix, hash, lum, coverImage, disc } from "./_kit.js";

// ---------- seeded numbers ----------
/** Deterministic generator from a string seed: rng() -> [0, 1). */
export function rng(seed) {
  let h = hash(seed || "inmo") || 1;
  return () => { h = (Math.imul(h, 1664525) + 1013904223) >>> 0; return h / 4294967296; };
}

// ---------- easing ----------
/** Money text of a count-up at k (0..1): counts whole units (no cents flicker) and starts at 70 % of the value, never at a fake "$0";
 *  the last frame (k >= 1) is the exact final text, cents included when the value has them. */
export function countMoney(value, k) {
  if (k >= 1) return countText(value, 1, "money");
  if (k <= 0) return "";
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value ?? "");
  return countText(Math.round(n), lerp(0.7, 1, k), "money");
}

/** Bounce out (ease) for the pin drop. */
export function bounceOut(x) {
  const n = 7.5625, d = 2.75;
  if (x < 1 / d) return n * x * x;
  if (x < 2 / d) { x -= 1.5 / d; return n * x * x + 0.75; }
  if (x < 2.5 / d) { x -= 2.25 / d; return n * x * x + 0.9375; }
  x -= 2.625 / d; return n * x * x + 0.984375;
}

// ---------- status colours (through the skin) ----------
/** Fill colour of a status label through the skin (Reda: Disponible, Separados, Formalizados, Cerrado...). */
export function statusFill(skin, label) {
  const key = String(label ?? "").toLowerCase();
  return skin.status?.[key] ?? skin.colors.muted;
}
/** Linear mix of two #rrggbb colours as #rrggbb (k = 0 -> a, 1 -> b). */
export function mixHex(a, b, k) {
  const x = parseInt(a.slice(1), 16), y = parseInt(b.slice(1), 16);
  const c = (sh) => Math.round(lerp((x >> sh) & 255, (y >> sh) & 255, k));
  return `#${[16, 8, 0].map((sh) => c(sh).toString(16).padStart(2, "0")).join("")}`;
}
/** Ink colour readable on top of a status fill. */
export const onFill = (hex) => (lum(hex) > 0.35 ? "#111111" : "#FFFFFF");

// ---------- field helpers ----------
/** Inspector field "Dónde se ve" shared by the elements (band = below the chin, top, center). */
export const SLOT_FIELD = { key: "slot", label: "Dónde se ve", kind: "select", options: [["band", "Abajo, entre la barbilla y los botones"], ["top", "Arriba"], ["center", "Al centro"]], opt: true, ph: "abajo" };
/** Image path shown through an inspector text field (resolved against the run folder, like uiList thumbs). */
export const PHOTO_FIELD = (label, key) => ({ key, label, kind: "text", opt: true, ph: "ej. reda/model-A.png" });
/** Products.json photo -> element path (same convention as uiList: "../" reaches the run assets). */
export const productPhoto = (p) => (p?.images?.[0]?.src ? `../${p.images[0].src}` : undefined);

// ---------- photo drawing ----------
/** Photo with a slow Ken Burns move inside a rounded box (zoom 1 -> 1+zoom, pan from `pan` px to 0). Missing photo = flat panel. */
export function kenBurnsPhoto(ctx, env, ref, x, y, w, h, r, { k = 0, zoom = 0.08, pan = 24, fill = env.skin.colors.panel } = {}) {
  const img = ref ? env.img(ref) : null;
  ctx.save();
  rr(ctx, x, y, w, h, r);
  ctx.clip();
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, w, h);
  if (img) {
    const z = 1 + zoom * inOut(clamp(k));
    ctx.translate(x + w / 2 + pan * (1 - inOut(clamp(k))), y + h / 2);
    ctx.scale(z, z);
    ctx.translate(-(x + w / 2), -(y + h / 2));
    coverImage(ctx, img, x, y, w, h, 0);
  }
  ctx.restore();
  return !!img;
}

// ---------- amenity icons (one coherent line set, 24 x 24 design units) ----------
export const AMENITIES = [
  { key: "alberca", label: "Alberca" }, { key: "gimnasio", label: "Gimnasio" }, { key: "terraza", label: "Terraza" },
  { key: "cowork", label: "Cowork" }, { key: "cafeteria", label: "Cafetería" }, { key: "skybar", label: "Skybar" },
  { key: "roofgarden", label: "Roof garden" }, { key: "seguridad", label: "Seguridad" }, { key: "estacionamiento", label: "Estacionamiento" },
  { key: "petfriendly", label: "Pet friendly" }, { key: "juegos", label: "Juegos" }, { key: "asadores", label: "Asadores" }
];
const ICON = {
  alberca(c) { c.moveTo(2, 14); c.quadraticCurveTo(5, 11, 8, 14); c.quadraticCurveTo(11, 17, 14, 14); c.quadraticCurveTo(17, 11, 20, 14); c.moveTo(2, 19.5); c.quadraticCurveTo(5, 16.5, 8, 19.5); c.quadraticCurveTo(11, 22.5, 14, 19.5); c.quadraticCurveTo(17, 16.5, 20, 19.5); c.moveTo(15, 2); c.lineTo(21, 2); c.moveTo(17, 2); c.lineTo(17, 8); },
  gimnasio(c) { c.moveTo(3, 12); c.lineTo(21, 12); c.roundRect(5, 7, 3, 10, 1); c.roundRect(16, 7, 3, 10, 1); c.roundRect(1.5, 9.5, 2.5, 5, 1); c.roundRect(20, 9.5, 2.5, 5, 1); },
  terraza(c) { c.arc(12, 14, 4.5, Math.PI, 0); c.moveTo(2, 14); c.lineTo(22, 14); c.moveTo(3, 18); c.lineTo(21, 18); for (const x of [6, 9, 12, 15, 18]) { c.moveTo(x, 18); c.lineTo(x, 21); } },
  cowork(c) { c.roundRect(5, 5, 14, 10.5, 1.5); c.moveTo(2, 19); c.lineTo(22, 19); },
  cafeteria(c) { c.roundRect(4.5, 9, 12, 9, 2); c.moveTo(16.5, 11); c.arc(16.5, 13.5, 2.5, -Math.PI / 2, Math.PI / 2); c.moveTo(8, 5.5); c.quadraticCurveTo(7, 7, 8, 8.5); c.moveTo(12, 5.5); c.quadraticCurveTo(11, 7, 12, 8.5); },
  skybar(c) { c.moveTo(4, 4); c.lineTo(20, 4); c.lineTo(12, 13); c.closePath(); c.moveTo(12, 13); c.lineTo(12, 20); c.moveTo(7.5, 20.5); c.lineTo(16.5, 20.5); },
  roofgarden(c) { c.moveTo(2.5, 21); c.lineTo(21.5, 21); c.arc(12, 9, 5, 0, Math.PI * 2); c.moveTo(12, 14); c.lineTo(12, 21); },
  seguridad(c) { c.moveTo(12, 2.5); c.lineTo(19.5, 5.5); c.lineTo(19.5, 11.5); c.quadraticCurveTo(19.5, 18, 12, 21.5); c.quadraticCurveTo(4.5, 18, 4.5, 11.5); c.lineTo(4.5, 5.5); c.closePath(); c.moveTo(8.5, 11.5); c.lineTo(11, 14); c.lineTo(15.5, 9.5); },
  estacionamiento(c) { c.roundRect(3, 3, 18, 18, 4); c.moveTo(9, 17.5); c.lineTo(9, 6.5); c.lineTo(13.2, 6.5); c.quadraticCurveTo(16.5, 6.5, 16.5, 10); c.quadraticCurveTo(16.5, 13.5, 13.2, 13.5); c.lineTo(9, 13.5); },
  petfriendly(c) { c.arc(12, 16, 3.8, 0, Math.PI * 2); c.moveTo(7.5, 11.5); c.arc(6, 11.5, 1.6, 0, Math.PI * 2); c.moveTo(10.5, 7.5); c.arc(10, 7.5, 1.6, 0, Math.PI * 2); c.moveTo(14.5, 7.5); c.arc(14, 7.5, 1.6, 0, Math.PI * 2); c.moveTo(18.5, 11.5); c.arc(18, 11.5, 1.6, 0, Math.PI * 2); },
  juegos(c) { c.roundRect(3, 12.5, 8, 8, 1.5); c.roundRect(13, 12.5, 8, 8, 1.5); c.roundRect(8, 3.5, 8, 8, 1.5); },
  asadores(c) { c.moveTo(3, 9); c.lineTo(21, 9); for (const x of [7, 11, 15, 19]) { c.moveTo(x, 9); c.lineTo(x, 15.5); } c.moveTo(6, 15.5); c.lineTo(4.5, 21); c.moveTo(18, 15.5); c.lineTo(19.5, 21); c.moveTo(12, 2.5); c.quadraticCurveTo(14.5, 5.5, 12, 7.5); c.quadraticCurveTo(9.5, 5.5, 12, 2.5); }
};
/** Line icon `key` centred on (cx, cy), `size` px square. Unknown key draws nothing. */
export function drawAmenityIcon(ctx, key, cx, cy, size, color) {
  const path = ICON[key];
  if (!path) return false;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(size / 24, size / 24);
  ctx.translate(-12, -12);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.9;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  path(ctx);
  ctx.stroke();
  ctx.restore();
  return true;
}

// ---------- map (abstract, deterministic, brand-neutral) ----------
/** Streets and blocks of an abstract city grid, from a seed (same seed = same map). Coordinates are in the map box (w x h). */
export function mapGrid(seed, w, h) {
  const r = rng(seed);
  const streets = [];
  const rows = [], cols = [];
  for (let i = 0; i < 6; i += 1) rows.push(70 + i * 128 + (r() - 0.5) * 36);
  for (let j = 0; j < 7; j += 1) cols.push(40 + j * 146 + (r() - 0.5) * 30);
  rows.forEach((y, i) => streets.push({ x1: -20, y1: y + (r() - 0.5) * 24, x2: w + 20, y2: y - (r() - 0.5) * 24, lw: i % 3 === 1 ? 26 : 16 }));
  cols.forEach((x, j) => streets.push({ x1: x + (r() - 0.5) * 24, y1: -20, x2: x - (r() - 0.5) * 24, y2: h + 20, lw: j % 3 === 1 ? 26 : 16 }));
  const blocks = [];
  for (let i = 0; i < rows.length - 1; i += 1) for (let j = 0; j < cols.length - 1; j += 1) {
    const x = cols[j] + 16, y = rows[i] + 16, bw = cols[j + 1] - cols[j] - 32, bh = rows[i + 1] - rows[i] - 32;
    blocks.push({ x, y, w: bw, h: bh, park: r() < 0.16, ink: r() < 0.5 });
  }
  return { streets, blocks };
}
/** Map pin: teardrop whose tip is at (x, y). R = head radius. */
export function pinPath(ctx, x, y, R) {
  const cy = y - R * 1.8, d = R * 1.8, half = Math.acos(R / d);
  const t1 = Math.PI / 2 + half, t2 = Math.PI / 2 - half;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + R * Math.cos(t1), cy + R * Math.sin(t1));
  ctx.arc(x, cy, R, t1, t2 + Math.PI * 2, false);
  ctx.closePath();
}

// ---------- status pill (text inside a coloured pill) ----------
export function statusTag(ctx, env, label, x, y, { px = 30, h = 56, k = 1 } = {}) {
  const { skin } = env;
  const bg = statusFill(skin, label);
  ctx.font = fnt(skin, 700, px);
  const w = ctx.measureText(label).width + 36;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(k, k);
  ctx.fillStyle = bg;
  rr(ctx, -w / 2, -h / 2, w, h, h / 2);
  ctx.fill();
  text(ctx, label, 0, 1, { font: ctx.font, color: onFill(bg), align: "center" });
  ctx.restore();
  return w;
}

/** Pill chip of scale k. `x` is the LEFT edge, y the vertical middle. Returns its width (also when k <= 0, to lay chips out). */
export function chip(ctx, env, label, x, y, { px = 30, h = 56, bg = env.skin.colors.panel, color = env.skin.colors.ink, k = 1 } = {}) {
  const { skin } = env;
  ctx.font = fnt(skin, 600, px);
  const w = ctx.measureText(label).width + 40;
  if (k <= 0) return w;
  ctx.save();
  ctx.translate(x + w / 2, y);
  ctx.scale(k, k);
  ctx.fillStyle = bg;
  rr(ctx, -w / 2, -h / 2, w, h, h / 2);
  ctx.fill();
  text(ctx, label, 0, 1, { font: fnt(skin, 600, px), color, align: "center" });
  ctx.restore();
  return w;
}

