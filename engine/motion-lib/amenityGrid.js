// Element "amenityGrid" of the motion library (grupo Inmobiliario): cuadrícula 2x3 o 3x3 de amenidades con íconos de línea que entran escalonados.
// One file = one element type (see engine/README.md "Cómo agregar un elemento"). Timeline beats are in DESIGN seconds.
import { seg, expoOut, outBack, lerp, CARD_W } from "../ui-motion.js";
import { rr, fnt, text, card, radiusAt, envelope, beginCard, disc, hexA } from "./_kit.js";
import { FICTIONAL, UI_SOURCE } from "./_fields.js";
import { AMENITIES, drawAmenityIcon, kenBurnsPhoto, SLOT_FIELD, PHOTO_FIELD } from "./_inmo.js";

const KEYS = AMENITIES.map((a) => a.key);
const LABEL = Object.fromEntries(AMENITIES.map((a) => [a.key, a.label]));
export const GRID = { pad: 44, gap: 20, top: 40, topTitle: 120, tile: 180, tilePhoto: 190, bottom: 44 };
/** Columns: the element's `columns` (2 or 3) or 3 for more than 6 items, 2 otherwise. */
export const gridCols = (el) => (Number(el.columns) === 3 || Number(el.columns) === 2 ? Number(el.columns) : (el.items ?? []).length > 6 ? 3 : 2);
export const gridRows = (el) => Math.max(1, Math.ceil(Math.min(9, (el.items ?? []).length) / gridCols(el)));
export const gridHeight = (el) => {
  const top = el.title ? GRID.topTitle : GRID.top;
  const hasPhoto = (el.items ?? []).some((i) => i.photo);
  const th = hasPhoto ? GRID.tilePhoto : GRID.tile;
  const rows = gridRows(el);
  return top + rows * th + (rows - 1) * GRID.gap + GRID.bottom;
};
export const amenityTimeline = () => ({ Ld: 3.6, b: { blob: [0, 0.5], title: [0.1, 0.5], tiles: [0.3, 1.2], exit: [3.25, 3.6] } });

function drawTile(ctx, env, item, x, y, w, h, s, k) {
  const { skin } = env, C = skin.colors;
  ctx.save();
  ctx.globalAlpha *= Math.min(1, k * 2);
  const cx = x + w / 2, cy = y + h / 2;
  ctx.translate(cx, cy + (1 - k) * 46);
  ctx.scale(lerp(0.85, 1, s), lerp(0.85, 1, s));
  ctx.translate(-cx, -cy);
  ctx.fillStyle = C.panel;
  rr(ctx, x, y, w, h, skin.radius.row);
  ctx.fill();
  if (item.photo) {
    const ph = h - 76;
    kenBurnsPhoto(ctx, env, item.photo, x, y, w, ph, skin.radius.row, { k: 0.5, zoom: 0.04, pan: 0, fill: C.line });
    drawAmenityIcon(ctx, item.icon, x + 42, y + ph + 38, 44, C.accent);
    text(ctx, item.label ?? LABEL[item.icon] ?? "", x + 78, y + ph + 38, { font: fnt(skin, 600, 30), color: C.ink, maxW: w - 98 });
  } else {
    disc(ctx, cx, y + 64, 48, hexA(C.accent, 0.12));
    drawAmenityIcon(ctx, item.icon, cx, y + 64, 64, C.accent);
    text(ctx, item.label ?? LABEL[item.icon] ?? "", cx, y + h - 40, { font: fnt(skin, 600, 32), color: C.ink, align: "center", maxW: w - 24 });
  }
  ctx.restore();
}

function drawAmenity(ctx, el, ts, tl, rect, env) {
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
  const top = el.title ? GRID.topTitle : GRID.top;
  if (el.title) {
    const tk = expoOut(seg(ts, b.title[0], b.title[1]));
    ctx.globalAlpha = E.alpha * tk;
    text(ctx, el.title, GRID.pad, 66, { font: fnt(skin, 700, 50), color: C.ink, maxW: w - GRID.pad * 2 });
    ctx.globalAlpha = E.alpha;
  }
  const cols = gridCols(el), items = (el.items ?? []).slice(0, 9);
  const hasPhoto = items.some((i) => i.photo);
  const th = hasPhoto ? GRID.tilePhoto : GRID.tile;
  const tw = (w - GRID.pad * 2 - (cols - 1) * GRID.gap) / cols;
  items.forEach((item, i) => {
    const start = b.tiles[0] + i * ((b.tiles[1] - b.tiles[0]) / Math.max(1, items.length));
    const k = expoOut(seg(ts, start, start + 0.5));
    const s = outBack(seg(ts, start, start + 0.5), 1.4);
    if (k <= 0) return;
    const col = i % cols, row = Math.floor(i / cols);
    drawTile(ctx, env, item, GRID.pad + col * (tw + GRID.gap), top + row * (th + GRID.gap), tw, th, s, k);
  });
  ctx.restore();
  ctx.restore();
}

export default {
  type: "amenityGrid",
  category: "Inmobiliario",
  usesSkin: true, // reads env.skin (ui-skin colours / status table / font): overlay copies ui-skin.json when it is set
  label: "Cuadrícula de amenidades",
  timelineLabel: "Inmobiliario: amenidades",
  description: "Cuadrícula de amenidades con íconos de línea que entran uno por uno",
  brief: [
    "Qué: cuadrícula de amenidades del desarrollo con íconos de línea y su nombre.",
    "Cuándo: la voz enumera lo que tiene el edificio (alberca, gimnasio…). No usar: más de 9 cosas (usa una lista) ni precios (paymentPlan).",
    "Coreografía: nace la tarjeta, el título entra, las celdas aparecen una a una en 3-5 cuadros de diferencia y salen juntas en 0.35 s.",
    "Gusto: íconos de una sola línea con el mismo grosor; nombre legible (≥ 28 px) bajo cada ícono; un acento en los íconos; nada de chips apretados.",
    "Datos: lista fija de amenidades del desarrollo (fuente: brochure o captura del usuario); source obligatorio."
  ].join("\n"),
  icon: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  textKey: "title",
  captions: "option",
  minScale: 0.88,
  defaults: (t, end) => ({
    type: "amenityGrid", in: t, out: Math.min(t + 3.6, end), title: "Amenidades",
    items: [{ icon: "alberca" }, { icon: "gimnasio" }, { icon: "terraza" }, { icon: "cowork" }, { icon: "cafeteria" }, { icon: "skybar" }],
    source: { ...FICTIONAL }
  }),
  fields: [
    { key: "title", label: "Título (opcional)", kind: "text", opt: true },
    { key: "columns", label: "Columnas", kind: "select", options: [["2", "2 columnas"], ["3", "3 columnas"]], opt: true, ph: "automático" },
    {
      key: "items", label: "Amenidades (1 a 9)", kind: "blocks", prop: "items", min: 1, max: 9,
      blank: () => ({ icon: "alberca", label: "" }),
      fields: () => [
        { key: "icon", label: "Ícono", kind: "select", options: AMENITIES.map((a) => [a.key, a.label]) },
        { key: "label", label: "Texto (opcional, si no el nombre del ícono)", kind: "text", opt: true },
        PHOTO_FIELD("Foto (opcional)", "photo")
      ],
      name: (r) => r.label || LABEL[r.icon] || "Amenidad"
    },
    SLOT_FIELD
  ],
  source: UI_SOURCE,
  timeline: amenityTimeline,
  size: (el) => ({ w: CARD_W, h: gridHeight(el) }),
  imageRefs(el, add) { for (const i of el.items ?? []) add(i.photo, "foto"); },
  showsNumbers: () => false,
  validate(el, tag) {
    const errors = [], warnings = [];
    const n = (el.items ?? []).length;
    if (n < 1 || n > 9) errors.push(`${tag}: necesita de 1 a 9 amenidades (tiene ${n})`);
    if ((el.items ?? []).some((i) => !KEYS.includes(i.icon))) errors.push(`${tag}: ícono de amenidad desconocido`);
    if (n > 6 && gridCols(el) === 2) warnings.push(`${tag}: con más de 6 amenidades conviene 3 columnas`);
    return { errors, warnings };
  },
  texts(el, add) {
    add(el.title);
    for (const i of el.items ?? []) add(i.label ?? LABEL[i.icon]);
  },
  events(el, rect, { beats: B, add }) {
    add(B.blob[0], "whoosh");
  },
  draw: (ctx, el, t, env) => drawAmenity(ctx, el, env.ts, env.tl, env.rect, env),
};
