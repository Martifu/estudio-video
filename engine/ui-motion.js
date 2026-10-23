// Shared base of the motion library: math curves, the product-screen SKIN (colors / font / radii, derived from brand.json or ui-skin.json), number
// formats and image-ref resolution. DATA ONLY (no canvas, no DOM, no globals). Element types live in engine/motion-lib/<type>.js; the generic
// machinery (timelines, geometry, events, validation, drawing) in engine/motion-lib/index.js; the canvas helpers in motion-lib/_kit.js.


// ---------- math (same curves as brand-layer.js; duplicated so this module stays dependency free) ----------
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const seg = (t, a, b) => (b <= a ? (t >= b ? 1 : 0) : clamp((t - a) / (b - a)));
export const lerp = (a, b, x) => a + (b - a) * x;
export const expoOut = (x) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x));
export const inOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
export const outBack = (x, s = 1.9) => 1 + (s + 1) * Math.pow(x - 1, 3) + s * Math.pow(x - 1, 2);

// ---------- skin ----------
export const SKIN_COLOR_KEYS = ["primary", "accent", "highlight", "ink", "text", "muted", "faint", "line", "panel", "surface", "success", "danger"];
const NEUTRALS = { text: "#1F2937", muted: "#6B7280", faint: "#9CA3AF", line: "#E5E7EB", panel: "#F8F9FB", surface: "#FFFFFF", success: "#22A06B", danger: "#D9534F" };
const isHex = (s) => typeof s === "string" && /^#[0-9a-f]{6}$/i.test(s);

// Accent candidates for a derived skin whose brand gives no distinct accent: saturated, readable on white (contrast >= 3:1).
const ACCENTS = ["#5E17EB", "#0B7FAB", "#D9480F", "#2F9E44", "#C2255C", "#3B5BDB"];
const hueOf = (hex) => {
  const n = parseInt(hex.slice(1), 16), r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (d < 0.08) return null; // grey-ish: no hue
  const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
};
const hueGap = (a, b) => (a === null || b === null ? 180 : Math.min(Math.abs(a - b), 360 - Math.abs(a - b)));
/** A second colour that reads as different from `primary` (selection, highlighted bar, totals): the candidate farthest in hue. */
export function contrastAccent(primary) {
  const h = hueOf(primary);
  return ACCENTS.reduce((best, c) => (hueGap(hueOf(c), h) > hueGap(hueOf(best), h) ? c : best), ACCENTS[0]);
}
/** Skin derived from brand.json when the brand has no ui-skin.json: white cards, the brand primary, sensible neutrals. When the brand
 *  has no accent of its own (or it is the primary again) the accent is derived so that selections still stand out from the primary. */
export function deriveSkin(brand = {}) {
  const c = brand.colors ?? {};
  const primary = isHex(c.primary) ? c.primary : "#2F6BFF";
  const own = isHex(c.accent_on_paper) ? c.accent_on_paper : null;
  const accent = own && own.toLowerCase() !== primary.toLowerCase() ? own : contrastAccent(primary);
  const body = brand.fonts?.body ?? brand.fonts?.display ?? null;
  return {
    derived: true,
    font: { family: body?.family ?? "system-ui", ...(body?.src ? { src: body.src } : {}) },
    colors: { primary, accent, highlight: isHex(c.accent) ? c.accent : primary, ink: isHex(c.ink) ? c.ink : "#1A1A1A", ...NEUTRALS, header: isHex(c.ink) ? c.ink : "#1A1A1A" },
    radius: { card: 44, row: 28, pill: 12 },
    status: {}
  };
}

/** Skin = derived defaults overlaid with ui-skin.json (doc) and then with the element's own `skin` override (same shape, any subset). */
export function resolveSkin(doc, brand = {}, override = null) {
  const base = deriveSkin(brand);
  const out = { ...base, derived: !doc, font: { ...base.font }, colors: { ...base.colors }, radius: { ...base.radius }, status: { ...base.status } };
  for (const src of [doc, override]) {
    if (!src || typeof src !== "object") continue;
    if (src.font?.family) out.font = { family: src.font.family, ...(src.font.src ? { src: src.font.src } : {}) };
    for (const k of [...SKIN_COLOR_KEYS, "header"]) if (isHex(src.colors?.[k])) out.colors[k] = src.colors[k];
    for (const k of ["card", "row", "pill"]) if (Number.isFinite(src.radius?.[k])) out.radius[k] = src.radius[k];
    if (src.status && typeof src.status === "object") for (const [k, v] of Object.entries(src.status)) if (isHex(v)) out.status[k.toLowerCase()] = v;
  }
  if (!doc?.colors?.header && !override?.colors?.header) out.colors.header = out.colors.ink;
  return out;
}
/** Color of a status label (pill) through the skin; `status` may also be a literal #rrggbb. */
export function statusColor(skin, pill) {
  const key = String(pill?.status ?? pill?.text ?? "").toLowerCase();
  if (isHex(pill?.status)) return pill.status;
  return skin.status[key] ?? skin.status[String(pill?.text ?? "").toLowerCase()] ?? skin.colors.muted;
}

// ---------- number formats ----------
const group = (intStr) => intStr.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
export function fmtNumber(v, dec = 0) {
  const n = Math.abs(v);
  const [i, f] = n.toFixed(dec).split(".");
  return `${v < 0 ? "-" : ""}${group(i)}${f ? `.${f}` : ""}`;
}
export const fmtMoney = (v, dec = Number.isInteger(v) ? 0 : 2) => `$${fmtNumber(v, dec)}`;
export function fmtCompact(v) {
  const a = Math.abs(v);
  const f = (x, s) => `${(Math.round(x * 10) / 10).toString().replace(/\.0$/, "")}${s}`;
  if (a >= 1e9) return f(v / 1e9, "B");
  if (a >= 1e6) return f(v / 1e6, "M");
  if (a >= 1e3) return f(v / 1e3, "K");
  return String(Math.round(v));
}
/** "$3,986,811.18" | "3.986.811" | 3986811.18 -> number (null when it is not a plain number). */
export function parseMoney(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v ?? "").replace(/[$\s]|MXN|USD/gi, "").replace(/,/g, "");
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : null;
}
const decimalsOf = (v) => (typeof v === "string" && /\.\d+/.test(v) ? v.split(".")[1].replace(/\D.*$/, "").length : Number.isInteger(parseMoney(v)) ? 0 : 2);
/** Text of a value at `k` (0..1) of its count-up. Non-numeric text is returned as is. */
export function countText(value, k, format = "money") {
  const n = parseMoney(value);
  if (n === null) return String(value ?? "");
  if (k <= 0) return ""; // never show a fake "$0" before the count starts
  const dec = decimalsOf(value);
  const v = n * k;
  return format === "money" ? fmtMoney(k >= 1 ? n : v, dec) : fmtNumber(k >= 1 ? n : v, dec);
}
/** uiStat value text: final string for format money | int | pct | compact (prefix / suffix wrap it). */
export function statText(el, k = 1) {
  const n = parseMoney(el.value);
  const v = n === null ? 0 : n * k;
  const dec = decimalsOf(el.value);
  let s;
  switch (el.format ?? "int") {
    case "money": s = fmtMoney(k >= 1 ? n ?? 0 : v, dec); break;
    case "pct": s = `${fmtNumber(k >= 1 ? n ?? 0 : v, Math.min(dec, 1))}%`; break;
    case "compact": s = fmtCompact(k >= 1 ? n ?? 0 : v); break;
    default: s = fmtNumber(k >= 1 ? n ?? 0 : v, 0);
  }
  return `${el.prefix ?? ""}${s}${el.suffix ?? ""}`;
}

// ---------- shared constants ----------
export const EXIT = 0.4; // seconds of the exit animation of a screen
export const CARD_W = 900;
export const BAND_H = 760;
export const pushOf = (el) => clamp(Number.isFinite(Number(el.push)) ? Number(el.push) : 0.06, 0, 0.15);

// ---------- images ----------
const PEOPLE_RE = /^people:(p\d{2})$/;
const ICON_RE = /^icon:([a-z0-9]+)(:alt)?$/; // official platform logo of assets/brand-icons (index.json maps the name to its file)
/** ref -> { kind: "people", url: "/_people/pNN@256.jpg" } | { kind: "icon", name, alt } (file via /_icons/index.json; alt = the official alternate variant) | { kind: "rel", path } | null (not allowed: remote, absolute or with .. other than ../assets/). */
export function uiResolveRef(ref) {
  if (typeof ref !== "string" || !ref) return null;
  const m = PEOPLE_RE.exec(ref);
  if (m) return { kind: "people", url: `/_people/${m[1]}@256.jpg` };
  const ic = ICON_RE.exec(ref);
  if (ic) return { kind: "icon", name: ic[1], alt: !!ic[2] };
  if (/^[a-z]+:/i.test(ref) || ref.startsWith("/") || /[\\\0]/.test(ref)) return null;
  const parts = ref.split("/");
  // comp-relative; the only way out of the comp is "../assets/..." (the RUN's own assets, e.g. product photos)
  const up = parts[0] === ".." && parts[1] === "assets" ? 1 : 0;
  if (parts.slice(up).includes("..") || parts.includes("")) return null;
  return { kind: "rel", path: ref };
}
