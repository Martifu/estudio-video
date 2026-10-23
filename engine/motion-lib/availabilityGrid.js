// Element "availabilityGrid" of the motion library (grupo Inmobiliario): fachada de niveles x unidades; cada celda toma el color de su estado (skin) y cuenta los disponibles.
// One file = one element type. Cell statuses come from the data (Reda inventory); colours come from env.skin.status. Timeline beats are in DESIGN seconds.
import { seg, expoOut, outBack, lerp, CARD_W } from "../ui-motion.js";
import { rr, fnt, text, card, radiusAt, envelope, beginCard, disc } from "./_kit.js";
import { FICTIONAL, UI_SOURCE } from "./_fields.js";
import { statusFill, mixHex, SLOT_FIELD } from "./_inmo.js";

const clamp01 = (x) => Math.max(0, Math.min(1, x));
export const AV = { w: CARD_W, pad: 44, facadeX: 100, facadeW: 460, cellH: 84, gap: 12, head: 250 };
const isAvailable = (s) => String(s ?? "").trim().toLowerCase() === "disponible";
export const PALETTES = ["venta", "crm"];
/** Fill of a unit by status. "venta" (default, for sales videos): available = skin success (green), the others are neutrals that get darker
 *  from Separados to Cerrado. "crm": the exact status colours of the Reda CRM (skin.status). */
export function cellFill(skin, status, palette = "venta") {
  if (palette === "crm") return statusFill(skin, status);
  const C = skin.colors, key = String(status ?? "").trim().toLowerCase();
  if (key === "disponible") return C.success ?? C.primary;
  const neutral = { separados: 0.3, formalizados: 0.55, cerrado: 0.8 }[key] ?? 0.45;
  return mixHex(C.surface, C.ink, neutral);
}
/** Colour of the counter and of the "available" legend dot. */
export const availableColor = (skin, palette = "venta") => cellFill(skin, "Disponible", palette);
export const cellsOf = (el) => (el.cells ?? []).map((s) => String(s ?? "").trim()).filter(Boolean);
export const availability = (el) => {
  const cells = cellsOf(el);
  return { total: cells.length, available: cells.filter(isAvailable).length };
};
export const avTimeline = () => ({
  Ld: 4.05,
  b: { blob: [0, 0.5], head: [0.1, 0.5], count: [0.3, 1.2], legend: [2.0, 2.5], callout: [2.5, 3.1], exit: [3.7, 4.05] }
});
/** Cell rectangle of level r (0 = top) and column c. */
export function cellRect(el, r, c) {
  const p = Math.max(1, Number(el.perLevel) || 1);
  const cw = (AV.facadeW - AV.gap * (p - 1)) / p;
  return { x: AV.facadeX + c * (cw + AV.gap), y: AV.head + r * (AV.cellH + AV.gap), w: cw, h: AV.cellH };
}
export const facadeHeight = (el) => {
  const levels = Math.max(1, Number(el.levels) || 1);
  return levels * AV.cellH + (levels - 1) * AV.gap;
};
export const avSize = (el) => {
  const legend = new Set(cellsOf(el).map((s) => s.toLowerCase())).size > 1 ? 70 : 0;
  return { w: AV.w, h: AV.head + facadeHeight(el) + 60 + legend };
};

function drawAvailability(ctx, el, ts, tl, rect, env) {
  const { skin } = env, C = skin.colors, b = tl.b;
  const w = rect.w, h = rect.h;
  const E = envelope(tl, ts);
  beginCard(ctx, el, tl, ts, rect, [w / 2, h / 2], E);
  const R = radiusAt(E, skin, w, h);
  card(ctx, 0, 0, w, h, R, skin);
  ctx.save();
  rr(ctx, 0, 0, w, h, R);
  ctx.clip();
  ctx.globalAlpha = E.alpha;
  const cells = cellsOf(el);
  const levels = Math.max(1, Number(el.levels) || 1), p = Math.max(1, Number(el.perLevel) || 1);
  // header: the title, then the hero counter. It never shows a fake 0: the count starts at 60 % of the real number and lands exactly on it
  const hk = expoOut(seg(ts, b.head[0], b.head[1]));
  ctx.globalAlpha = E.alpha * hk;
  if (el.title) text(ctx, el.title, AV.pad, 58, { font: fnt(skin, 700, 44), color: C.ink, maxW: w - AV.pad * 2 });
  const { available, total } = availability(el);
  const shownAvail = Math.round(available * lerp(0.6, 1, expoOut(seg(ts, b.count[0], b.count[1]))));
  const numFont = fnt(skin, 700, 112);
  ctx.font = numFont;
  const numW = ctx.measureText(String(shownAvail)).width;
  text(ctx, String(shownAvail), AV.pad - 4, 158, { font: numFont, color: availableColor(skin, el.palette), ls: -2 });
  const tx = AV.pad + numW + 16;
  text(ctx, el.countLabel || "disponibles", tx, 140, { font: fnt(skin, 700, 32), color: C.ink, maxW: w - tx - AV.pad });
  text(ctx, `de ${total} unidades`, tx, 186, { font: fnt(skin, 500, 30), color: C.muted, maxW: w - tx - AV.pad });
  ctx.globalAlpha = E.alpha;
  // facade frame, then the cells fill from the bottom level up
  ctx.fillStyle = C.panel;
  rr(ctx, AV.facadeX - 24, AV.head - 24, AV.facadeW + 48, facadeHeight(el) + 48, 22);
  ctx.fill();
  cells.slice(0, levels * p).forEach((status, i) => {
    const r = Math.floor(i / p), c = i % p;
    const fromBottom = levels - 1 - r;
    const start = b.count[0] + 0.2 + fromBottom * 0.12 + c * 0.04;
    const k = expoOut(seg(ts, start, start + 0.45));
    const cr = cellRect(el, r, c);
    const palette = el.palette ?? "venta";
    const fill = i === el.highlight && palette === "venta" ? C.accent : cellFill(skin, status, palette);
    ctx.save();
    ctx.globalAlpha = E.alpha * clamp01(k * 3);
    const s = lerp(0.7, 1, outBack(seg(ts, start, start + 0.45), 1.4));
    ctx.translate(cr.x + cr.w / 2, cr.y + cr.h / 2);
    ctx.scale(s, s);
    ctx.translate(-(cr.x + cr.w / 2), -(cr.y + cr.h / 2));
    ctx.fillStyle = fill;
    rr(ctx, cr.x, cr.y, cr.w, cr.h, 16);
    ctx.fill();
    if (i === el.highlight && seg(ts, b.callout[0], b.callout[1]) > 0) {
      ctx.strokeStyle = C.accent;
      ctx.lineWidth = 6;
      rr(ctx, cr.x - 5, cr.y - 5, cr.w + 10, cr.h + 10, 20);
      ctx.stroke();
    }
    ctx.restore();
  });
  // legend: one dot per distinct status (up to 4), readable (28 px)
  const distinct = [...new Map(cells.map((s) => [s.toLowerCase(), s])).values()].slice(0, 4);
  if (distinct.length > 1) {
    const lk = expoOut(seg(ts, b.legend[0], b.legend[1]));
    ctx.save();
    ctx.globalAlpha = E.alpha * lk;
    let x = AV.pad;
    const y = AV.head + facadeHeight(el) + 58;
    for (const s of distinct) {
      disc(ctx, x + 14, y, 14, cellFill(skin, s, el.palette ?? "venta"));
      ctx.font = fnt(skin, 600, 28);
      const tw = ctx.measureText(s).width;
      text(ctx, s, x + 40, y + 1, { font: fnt(skin, 600, 28), color: C.muted });
      x += tw + 64;
    }
    ctx.restore();
  }
  // callout on the highlighted unit: a leader from its cell to a label on the right
  const hl = el.highlight;
  if (Number.isInteger(hl) && el.callout && hl >= 0 && hl < cells.length) {
    const ck = outBack(seg(ts, b.callout[0], b.callout[1]));
    if (ck > 0) {
      const cr = cellRect(el, Math.floor(hl / p), hl % p);
      const ax = cr.x + cr.w, ay = cr.y + cr.h / 2;
      const lx = AV.facadeX + AV.facadeW + 40;
      ctx.save();
      ctx.globalAlpha = E.alpha * clamp01(ck * 2);
      ctx.strokeStyle = C.accent;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(ax + 6, ay);
      ctx.lineTo(lerp(ax + 6, lx, expoOut(seg(ts, b.callout[0], b.callout[0] + 0.25))), ay);
      ctx.stroke();
      ctx.font = fnt(skin, 700, 32);
      const tw = ctx.measureText(el.callout).width + 40;
      ctx.translate(lx + tw / 2, ay);
      ctx.scale(lerp(0.6, 1, ck), lerp(0.6, 1, ck));
      ctx.fillStyle = C.accent;
      rr(ctx, -tw / 2, -30, tw, 60, 30);
      ctx.fill();
      text(ctx, el.callout, 0, 1, { font: fnt(skin, 700, 32), color: "#FFFFFF", align: "center" });
      ctx.restore();
    }
  }
  ctx.restore();
  ctx.restore();
}

export default {
  type: "availabilityGrid",
  category: "Inmobiliario",
  usesSkin: true, // reads env.skin (ui-skin colours / status table / font): overlay copies ui-skin.json when it is set
  label: "Fachada de disponibilidad",
  timelineLabel: "Inmobiliario: disponibilidad",
  description: "Fachada por niveles con el estado de cada unidad y el conteo de disponibles",
  brief: [
    "Qué: fachada del edificio por niveles, cada unidad coloreada por su estado, con el conteo de disponibles.",
    "Cuándo: la voz dice cuántas unidades quedan y cuál es la de la venta. No usar: una sola unidad (unitCard) ni la lista de un inventario de texto.",
    "Coreografía: aparece el título, el conteo sube desde la primera cifra real hasta el total exacto, las unidades se llenan de abajo hacia arriba, la leyenda entra y la unidad destacada se marca; todo sale en 0.6 s.",
    "Gusto: el número es el héroe (≥ 1.8 × el texto); la leyenda es legible (≥ 26 px); un solo acento para la unidad destacada; nunca un cero falso al nacer.",
    "Datos: estados del inventario (MCP de Reda, list_inventory) o captura; source obligatorio; las cifras nunca se redondean ni se inventan."
  ].join("\n"),
  icon: "M3 21V7l9-4 9 4v14M8 21v-6h3v6M13 11h3v3h-3zM8 11h3v3H8z",
  textKey: "title",
  captions: "option",
  minScale: 0.88,
  defaults: (t, end) => ({
    type: "availabilityGrid", in: t, out: Math.min(t + 4.4, end), title: "Torre Norte · disponibilidad",
    levels: 4, perLevel: 3,
    cells: ["Disponible", "Separados", "Disponible", "Disponible", "Formalizados", "Disponible", "Cerrado", "Disponible", "Disponible", "Disponible", "Separados", "Disponible"],
    highlight: 5, callout: "Tu opción: 402", palette: "venta",
    source: { ...FICTIONAL }
  }),
  fields: [
    { key: "title", label: "Título (opcional)", kind: "text", opt: true },
    { key: "countLabel", label: "Texto del conteo (ej. disponibles)", kind: "text", opt: true, ph: "disponibles" },
    { key: "levels", label: "Niveles (1 a 5)", kind: "number", step: 1, min: 1, max: 5 },
    { key: "perLevel", label: "Unidades por nivel (1 a 5)", kind: "number", step: 1, min: 1, max: 5 },
    { key: "cells", label: "Estado de cada unidad, de arriba abajo y de izquierda a derecha (una por línea)", kind: "list" },
    { key: "highlight", label: "Unidad destacada (número de la celda, empieza en 0)", kind: "number", step: 1, min: 0, opt: true },
    { key: "callout", label: "Texto de la unidad destacada", kind: "text", opt: true, ph: "Tu opción" },
    { key: "palette", label: "Colores", kind: "select", options: [["venta", "Venta: disponibles en verde, el resto en grises"], ["crm", "Colores exactos del CRM de Reda"]], opt: true, ph: "venta" },
    SLOT_FIELD
  ],
  source: UI_SOURCE,
  timeline: avTimeline,
  size: (el) => avSize(el),
  showsNumbers: () => true,
  validate(el, tag) {
    const errors = [], warnings = [];
    const levels = Number(el.levels), p = Number(el.perLevel);
    if (!(levels >= 1 && levels <= 5) || !(p >= 1 && p <= 5)) errors.push(`${tag}: niveles y unidades por nivel van de 1 a 5`);
    const n = cellsOf(el).length;
    if (n !== levels * p) errors.push(`${tag}: hay ${n} estados y la fachada tiene ${levels * p} unidades`);
    if (el.highlight !== undefined && el.highlight !== null && !(el.highlight >= 0 && el.highlight < n)) errors.push(`${tag}: la unidad destacada no existe`);
    if (el.palette !== undefined && !PALETTES.includes(el.palette)) errors.push(`${tag}: la paleta debe ser venta o crm`);
    if (el.highlight !== undefined && el.highlight !== null && !el.callout) warnings.push(`${tag}: la unidad destacada no tiene texto`);
    return { errors, warnings };
  },
  texts(el, add) {
    add(el.title); add(el.callout); add(el.countLabel);
  },
  events(el, rect, { beats: B, add }) {
    add(B.head[0], "whoosh");
    add(B.callout[0], "pop");
  },
  draw: (ctx, el, t, env) => drawAvailability(ctx, el, env.ts, env.tl, env.rect, env),
};
