// Element "compareTable" of the motion library (grupo Venta): tabla "Nosotros vs Otros"; las filas se revelan una por una con ✓ (marca) y ✗ (gris).
// Timeline beats are in DESIGN seconds; the registry (index.js) scales them to [in, out]. Drawing is a pure function of the local time.
import { seg, expoOut } from "../ui-motion.js";
import { rr, fnt, text, card, hexA } from "./_kit.js";
import { drawCheck, drawCross, onPrimary, pushed } from "./_venta.js";
import { UI_SCREEN } from "./_fields.js";

export const TABLE = { w: 900, pad: 36, labelW: 480, colW: 190, row: 112, head: 84, title: 96 };
const rowsOf = (el) => (Array.isArray(el.rows) ? el.rows.filter((r) => r && typeof r.label === "string" && r.label.trim()) : []);
const hasTitle = (el) => !!el.title;
const topOf = (el) => (hasTitle(el) ? TABLE.title + 24 : 40);

export function tableTimeline(el) {
  const n = Math.max(1, rowsOf(el).length);
  // rows come in 0.2 s after the card starts, 0.14 s apart; the table holds 0.5 s after the last row, then a 0.25 s exit
  const Ld = 0.2 + (n - 1) * 0.14 + 0.4 + 0.5 + 0.25;
  return { Ld, b: { head: [0, 0.3], rows: { start: 0.2, step: 0.14, dur: 0.4 }, exit: [Ld - 0.25, Ld] } };
}

function drawTable(ctx, el, ts, tl, rect, env) {
  const { skin } = env, C = skin.colors, b = tl.b;
  const rows = rowsOf(el);
  // the card is born first (from 40 % opacity, 24 px below); the exit is 0.25 s
  const kb = expoOut(seg(ts, 0, 0.4));
  const out = (1 - seg(ts, b.exit[0], b.exit[1])) * Math.min(1, kb * 2.5);
  const top = topOf(el);
  const ourX = TABLE.pad + TABLE.labelW, theirX = ourX + TABLE.colW;
  const headY = top, bodyY = top + TABLE.head + 16;
  const kh = expoOut(seg(ts, b.head[0], b.head[1]));
  ctx.save();
  ctx.translate(rect.x, rect.y + (1 - kb) * 24);
  ctx.globalAlpha = out;
  card(ctx, 0, 0, rect.w, rect.h, skin.radius.card ?? 28, skin);
  ctx.globalAlpha = out;
  if (hasTitle(el)) {
    ctx.globalAlpha = out * kh;
    text(ctx, el.title, TABLE.pad, 56, { font: fnt(skin, 700, 40), color: C.ink, maxW: rect.w - TABLE.pad * 2 });
  }
  // our column is tinted and its header is the brand pill
  ctx.globalAlpha = out * kh;
  ctx.fillStyle = hexA(C.primary, 0.1);
  rr(ctx, ourX, headY, TABLE.colW, TABLE.head + 16 + rows.length * TABLE.row, 22);
  ctx.fill();
  ctx.fillStyle = C.primary;
  rr(ctx, ourX + 12, headY + 8, TABLE.colW - 24, TABLE.head - 16, 16);
  ctx.fill();
  text(ctx, el.oursName ?? "Nosotros", ourX + TABLE.colW / 2, headY + TABLE.head / 2, { font: fnt(skin, 800, 30), color: onPrimary(C.primary), align: "center", maxW: TABLE.colW - 40 });
  text(ctx, el.theirsName ?? "Otros", theirX + TABLE.colW / 2, headY + TABLE.head / 2, { font: fnt(skin, 700, 30), color: C.muted, align: "center", maxW: TABLE.colW - 40 });
  // rows
  rows.forEach((r, i) => {
    const s = b.rows.start + i * b.rows.step;
    const k = expoOut(seg(ts, s, s + b.rows.dur));
    const y = bodyY + i * TABLE.row + TABLE.row / 2;
    const mk = seg(ts, s + 0.2, s + 0.5);
    ctx.save();
    ctx.globalAlpha = out * k;
    ctx.translate((1 - k) * 30, 0);
    if (i > 0) {
      ctx.strokeStyle = C.line; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(TABLE.pad, bodyY + i * TABLE.row); ctx.lineTo(rect.w - TABLE.pad, bodyY + i * TABLE.row); ctx.stroke();
    }
    text(ctx, r.label, TABLE.pad, y, { font: fnt(skin, 600, 34), color: C.ink, maxW: TABLE.labelW - 16 });
    const ox = ourX + TABLE.colW / 2, tx = theirX + TABLE.colW / 2;
    if (r.ours === true) drawCheck(ctx, ox, y, 56, C.primary, 8, mk); // the inspector deletes a false bool: only true ticks
    else drawCross(ctx, ox, y, 52, C.muted, 7, mk);
    if (r.theirs === true) drawCheck(ctx, tx, y, 56, C.muted, 7, mk);
    else drawCross(ctx, tx, y, 52, C.muted, 7, mk);
    ctx.restore();
  });
  ctx.restore();
}

export default {
  type: "compareTable",
  category: "Venta",
  captions: "option", // subtitles hide while the element is on screen (element.captions "keep" keeps them), like the screens
  label: "Nosotros vs otros",
  description: "Tabla comparativa: cada fila aparece con ✓ o ✗",
  brief: [
    "Qué: tabla comparativa de características entre nuestra opción y otras.",
    "Cuándo: comparar con competidores o con la alternativa de siempre. No usar: para un solo precio (priceTag) o para una lista de casillas sin comparación (featureChecklist).",
    "Coreografía: la tarjeta nace; los encabezados entran; las filas llegan en cascada de 3–5 fotogramas; la columna propia se resalta al final.",
    "Gusto: la columna propia es la única con fondo de acento; etiquetas de fila 24–28 px pero legibles, no diminutas; el espacio vacío de la tarjeta se llena pronto.",
    "Datos: cifras y nombres escritos por el usuario; sin datos reales de competidores."
  ].join("\n"),
  icon: "M4 5h16M4 12h16M4 19h16M14 3v18",
  textKey: "title",
  defaults: (t, end) => ({ type: "compareTable", in: t, out: Math.min(t + 4, end), title: "Nosotros vs otros", oursName: "Nosotros", theirsName: "Otros", rows: [
    { label: "Factura electrónica incluida", ours: true, theirs: false },
    { label: "Atención por WhatsApp", ours: true, theirs: true },
    { label: "Reportes semanales", ours: true, theirs: false },
    { label: "Sin contrato de permanencia", ours: true, theirs: false }
  ] }),
  fields: [
    { key: "title", label: "Título (opcional)", kind: "text", opt: true },
    { key: "oursName", label: "Nombre de nuestra columna", kind: "text", opt: true, ph: "Nosotros" },
    { key: "theirsName", label: "Nombre de la otra columna", kind: "text", opt: true, ph: "Otros" },
    { key: "rows", label: "Filas (de 2 a 6)", kind: "blocks", prop: "rows", min: 2, max: 6, blank: () => ({ label: "Nuevo punto", ours: true, theirs: false }), fields: () => [
      { key: "label", label: "Punto", kind: "text" },
      { key: "ours", label: "Lo tenemos", kind: "bool" },
      { key: "theirs", label: "Lo tienen los otros", kind: "bool" }
    ], name: (r) => r.label },
  ],
  screen: UI_SCREEN(false),
  timeline: tableTimeline,
  minScale: 0.88, // the smallest text (30 px headers) x 0.88 stays >= 24 px
  size: (el) => ({ w: TABLE.w, h: topOf(el) + TABLE.head + 16 + Math.max(1, rowsOf(el).length) * TABLE.row + 24 }),
  validate(el, tag) {
    const errors = [], warnings = [];
    const n = rowsOf(el).length;
    if (n < 2 || n > 6) errors.push(`${tag}: necesita de 2 a 6 filas con texto (tiene ${n})`);
    return { errors, warnings };
  },
  texts(el, add) {
    add(el.title); add(el.oursName); add(el.theirsName); rowsOf(el).forEach((r) => add(r.label));
  },
  events(el, rect, { beats: B, add }) {
    add(B.head[0], "whoosh");
  },
  draw: (ctx, el, t, env) => pushed(ctx, el, env.ts, env.tl, env.rect, () => drawTable(ctx, el, env.ts, env.tl, env.rect, env)),
};
