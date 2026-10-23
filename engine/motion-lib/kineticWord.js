// Element "kineticWord": THE hero word of the video, animated letter by letter ("VENTAS" at chest height in the reference TikTok).
// motion-reglas.md allows exactly one per video (the review warns on more). Flat colour + a soft shadow for legibility on footage: no glow,
// no gradients, no texture. One file = one element type (see engine/README.md "Cómo agregar un elemento").
//
//   rise  letters stagger 3 frames, rise 40 px from ~40 % opacity and settle in ~8 frames
//   slam  each letter lands from scale 1.6 -> 1 (same stagger / settle)
//   exit  quick fade + blur, ~30 % shorter than the entry
//
// All timings are REAL seconds (the beats are not stretched by the element duration; they are compressed only when the window is too short).
import { seg, lerp, expoOut, inOut } from "../ui-motion.js";
import { footageColor } from "./_kit.js";

const FPS = 30;
const STAGGER = 3 / FPS, SETTLE = 8 / FPS, RISE_PX = 40;
const SLOTS = ["band", "center", "top"];
const SLOT_COST = { band: 0, center: 30, top: 60 };
const MIN_SIZE = 96, AUTO_MIN = 180, AUTO_MAX = 260;
const HEX = /^#[0-9a-f]{6}$/i;

/** Letters of the word (grapheme-ish: code points) of a line. */
const letters = (s) => Array.from(String(s ?? ""));
const widthOf = (env, font, s, px) => (env.measure ? env.measure(font, s) : String(s).length * px * 0.64);

/** Lines + size that fit the free width: auto size 260 -> 180, then two lines, then smaller (never below MIN_SIZE). */
export function layoutWord(el, env, zones) {
  const text = String(el.text ?? "").trim();
  const maxW = zones.x1 - zones.x0 - 24;
  const fontAt = (px) => env.kit.font("display", px, 800);
  const fit = (lines, px) => Math.max(...lines.map((l) => widthOf(env, fontAt(px), l, px)));
  const mk = (lines, size) => ({ lines, size, lineH: Math.round(size * 1.04), w: Math.min(maxW, fit(lines, size)), h: Math.round(size * 1.04) * lines.length });
  if (Number.isFinite(el.size) && el.size > 0) return mk([text], el.size);
  const one = [text];
  const w260 = fit(one, AUTO_MAX);
  if (w260 <= maxW) return mk(one, AUTO_MAX);
  const s1 = Math.floor((AUTO_MAX * maxW) / w260);
  if (s1 >= AUTO_MIN) return mk(one, s1);
  const words = text.split(/\s+/);
  const oneSize = Math.max(MIN_SIZE, Math.floor((AUTO_MAX * maxW) / w260));
  if (words.length > 1) { // two balanced lines, as big as they fit; below 180 only when that still beats one tiny line
    let best = null;
    for (let k = 1; k < words.length; k += 1) {
      const lines = [words.slice(0, k).join(" "), words.slice(k).join(" ")];
      const size = Math.min(AUTO_MAX, Math.floor((AUTO_MAX * maxW) / fit(lines, AUTO_MAX)));
      if (!best || size > best.size || (size === best.size && Math.abs(lines[0].length - lines[1].length) < Math.abs(best.lines[0].length - best.lines[1].length))) best = { lines, size };
    }
    if (best.size >= AUTO_MIN || best.size > oneSize) return mk(best.lines, Math.max(MIN_SIZE, best.size));
  }
  return mk(one, oneSize);
}

/** Centre y of each slot (canvas px): band = chest height like the reference, center = middle of the free area, top = just under the header. */
const slotY = (slot, h, zones) => (slot === "top" ? zones.toastTop + 20 : slot === "center" ? Math.round((zones.toastTop + zones.bottom) / 2 - h / 2) : Math.min(1380 - Math.round(h / 2), zones.bottom - h));
const rectFor = (el, env, zones, slot = el.slot, size = el.size) => {
  const L = layoutWord({ ...el, size }, env, zones);
  const s = SLOTS.includes(slot) ? slot : "band";
  return { rect: { x: Math.round((zones.x0 + zones.x1) / 2 - L.w / 2), y: slotY(s, L.h, zones), w: Math.round(L.w), h: L.h }, layout: L, slot: s };
};

/** Entry / exit schedule in real seconds, compressed (never stretched) when the window is short. */
export function schedule(n, D) {
  const entry = Math.max(0, n - 1) * STAGGER + SETTLE;
  const exit = entry * 0.7;
  const k = Math.min(1, D / (entry + exit + 0.35));
  return { k, stagger: STAGGER * k, settle: SETTLE * k, entry: entry * k, exit: exit * k };
}

export default {
  type: "kineticWord",
  category: "Texto",
  usesSkin: false, // brand typography element: reads the brand kit, not the ui skin
  panel: "text",
  captions: "option",
  label: "Palabra grande",
  description: "La palabra clave del video, grande, que entra letra por letra",
  brief: [
    "Qué: texto que se arma palabra por palabra con movimiento cinético, para un mensaje de impacto.",
    "Cuándo: para una frase corta que debe golpear. No usar: para una cita larga (usa quoteCard) ni para una cifra (usa bigNumberStatement).",
    "Coreografía: cada palabra entra en secuencia con una pequeña inercia, la frase queda completa un instante y luego sale.",
    "Gusto: tipografía grande y firme; un solo acento; sin efectos de neón ni sombras duras.",
    "Datos: frase del usuario; sin cifras inventadas."
  ].join("\n"),
  icon: "M4 19L9 5l5 14M6 14h6M17 5v14M17 12h4",
  textKey: "text",
  thumbAt: 0.5,
  sampleDur: 2.4,
  defaults: (t, end) => ({ type: "kineticWord", in: t, out: Math.min(t + 2.4, end), text: "VENTAS", style: "rise" }),
  fields: [
    { key: "text", label: "La palabra", kind: "text" },
    { key: "style", label: "Cómo entra", kind: "select", options: [["rise", "Sube letra por letra"], ["slam", "Cae de golpe, letra por letra"]], opt: true, ph: "sube" },
    { key: "color", label: "Color (ej. #80BC00)", kind: "text", opt: true, ph: "el de la marca" },
    { key: "size", label: "Tamaño (se ajusta solo)", kind: "number", step: 4, min: 60, max: 400, opt: true, ph: "180 a 260" }
  ],
  screen: [
    { key: "slot", label: "Dónde se ve", kind: "select", options: [["band", "Altura del pecho"], ["center", "Al centro"], ["top", "Arriba"]], opt: true, ph: "altura del pecho" },
    { key: "captions", label: "Subtítulos mientras se ve", kind: "select", options: [["hide", "Ocultarlos"], ["keep", "Dejarlos"]], opt: true, ph: "ocultarlos" }
  ],
  pin: null,

  validate(el, tag) {
    const errors = [], warnings = [];
    if (!String(el.text ?? "").trim()) errors.push(`${tag}: necesita la palabra`);
    if (el.style !== undefined && !["rise", "slam"].includes(el.style)) errors.push(`${tag}: "style" debe ser rise o slam`);
    if (el.color !== undefined && !HEX.test(el.color)) errors.push(`${tag}: el color debe ser como #80BC00`);
    if (el.size !== undefined && !(Number(el.size) >= 60 && Number(el.size) <= 400)) errors.push(`${tag}: el tamaño va de 60 a 400`);
    if (el.slot !== undefined && !SLOTS.includes(el.slot)) errors.push(`${tag}: "slot" debe ser band, center o top`);
    if (el.captions !== undefined && !["hide", "keep"].includes(el.captions)) errors.push(`${tag}: "captions" debe ser hide o keep`);
    if (String(el.text ?? "").trim().length > 14) warnings.push(`${tag}: una palabra tan larga se ve más chica; mejor una sola palabra corta`);
    const D = Number(el.out) - Number(el.in);
    if (D > 0 && D < schedule(letters(el.text).length, 99).entry + 0.6) warnings.push(`${tag}: dura muy poco para leerse completa`);
    return { errors, warnings };
  },

  // Real seconds: entry (stagger + settle), a hold, then the exit; Ld = the element duration so the registry does not rescale anything.
  timeline(el) {
    const D = Math.max(0.05, (Number(el.out) || 0) - (Number(el.in) || 0));
    const n = letters(el.text).length;
    const s = schedule(n, D);
    return { Ld: D, b: { letters: { start: 0, step: s.stagger, dur: s.settle }, entry: [0, s.entry], exit: [Math.max(s.entry, D - s.exit), D] } };
  },

  size: (el, env = {}) => { const { rect } = rectFor(el, { kit: env.kit, measure: env.measure }, env.zones ?? { x0: 60, x1: 1020, toastTop: 350, bottom: 1540 }); return { w: rect.w, h: rect.h }; },
  rect: (el, zones, env) => rectFor(el, env, zones).rect,
  // Face-aware planner: slot x size variants, scored by layout.js (face overlap, captions, other elements); an explicit slot pins the slot.
  candidates(el, zones, env) {
    const out = [];
    const slots = SLOTS.includes(el.slot) ? [el.slot] : SLOTS;
    const base = layoutWord(el, env, zones).size;
    for (const slot of slots) {
      for (const f of Number.isFinite(el.size) ? [1] : [1, 0.86, 0.74]) {
        const size = Math.max(MIN_SIZE, Math.round(base * f));
        const r = rectFor(el, env, zones, slot, size);
        out.push({ name: `kinetic-${slot}`, rect: r.rect, patch: { slot, size }, cost: SLOT_COST[slot] + (1 - f) * 150 });
      }
    }
    return out;
  },

  texts: (el, add) => add(el.text),
  events(el, rect, { beats: B, add }) {
    add(B.letters.start, el.style === "slam" ? "pop" : "whoosh");
  },

  draw(ctx, el, t, env) {
    const { kit, tl, ts, rect } = env;
    const L = layoutWord(el, env, env.zones);
    const color = HEX.test(el.color ?? "") ? el.color : footageColor(kit.colors);
    const font = kit.font("display", L.size, 800);
    const slam = el.style === "slam";
    const ex = inOut(seg(ts, tl.b.exit[0], tl.b.exit[1]));
    ctx.save();
    ctx.font = font;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    if (ex > 0) ctx.filter = `blur(${(14 * ex).toFixed(2)}px)`;
    const cx = rect.x + rect.w / 2;
    L.lines.forEach((line, li) => {
      const cy = rect.y + L.lineH * li + L.lineH / 2;
      const full = ctx.measureText(line).width;
      const x0 = cx - full / 2;
      let idx = 0;
      for (let li2 = 0; li2 < li; li2 += 1) idx += letters(L.lines[li2]).length;
      const chars = letters(line);
      chars.forEach((ch, ci) => {
        if (ch === " ") return;
        const gi = idx + ci;
        const p = seg(ts, tl.b.letters.start + gi * tl.b.letters.step, tl.b.letters.start + gi * tl.b.letters.step + tl.b.letters.dur);
        if (p <= 0) return;
        const k = expoOut(p);
        const px = ctx.measureText(chars.slice(0, ci).join("")).width; // prefix width keeps the font's kerning
        const cw = ctx.measureText(ch).width;
        const alpha = (slam ? Math.min(1, p * 3) : lerp(0.4, 1, k)) * (1 - ex);
        const sc = slam ? lerp(1.6, 1, k) : 1;
        const dy = slam ? 0 : (1 - k) * RISE_PX;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(x0 + px + cw / 2, cy + dy);
        ctx.scale(sc * (1 + 0.03 * ex), sc * (1 + 0.03 * ex));
        ctx.shadowColor = "rgba(0,0,0,0.45)";
        ctx.shadowBlur = 22;
        ctx.shadowOffsetY = 6;
        ctx.fillStyle = color;
        ctx.textAlign = "center";
        ctx.fillText(ch, 0, 0);
        ctx.restore();
      });
    });
    ctx.restore();
  }
};
