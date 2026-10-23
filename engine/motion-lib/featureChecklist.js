// Element "featureChecklist" of the motion library (grupo Venta): lista de 3 a 6 puntos; cada casilla se marca y luego entra el texto.
// Timeline beats are in DESIGN seconds; the registry (index.js) scales them to [in, out]. Drawing is a pure function of the local time.
import { seg, expoOut } from "../ui-motion.js";
import { rr, fnt, text, card, hexA } from "./_kit.js";
import { drawCheck, onPrimary, pushed } from "./_venta.js";
import { UI_SCREEN } from "./_fields.js";

export const CHECK = { w: 880, row: 112, box: 56, titleH: 96 };
const itemsOf = (el) => (Array.isArray(el.items) ? el.items.filter((s) => typeof s === "string" && s.trim()) : []);

export function checklistTimeline(el) {
  const n = Math.max(1, itemsOf(el).length);
  // rows: a 0.14 s stagger; the last row's text lands at +0.96 s, then a 0.5 s hold and a 0.25 s exit
  const Ld = 0.4 + (n - 1) * 0.14 + 0.96 + 0.5 + 0.25;
  return { Ld, b: { title: [0, 0.4], items: { start: 0.4, step: 0.14, dur: 0.6 }, exit: [Ld - 0.25, Ld] } };
}

function drawChecklist(ctx, el, ts, tl, rect, env) {
  const { skin } = env, C = skin.colors, b = tl.b;
  const items = itemsOf(el);
  const hasTitle = !!el.title;
  const y0 = hasTitle ? CHECK.titleH + 56 : 56;
  const out = 1 - seg(ts, b.exit[0], b.exit[1]);
  const k = expoOut(seg(ts, 0, 0.35));
  ctx.save();
  ctx.translate(rect.x, rect.y + (1 - k) * 24);
  ctx.globalAlpha = Math.min(1, k * 2) * out;
  const R = skin.radius.card ?? 28;
  card(ctx, 0, 0, rect.w, rect.h, R, skin);
  if (hasTitle) {
    ctx.globalAlpha = out * expoOut(seg(ts, b.title[0], b.title[1]));
    text(ctx, el.title, 56, 64, { font: fnt(skin, 700, 44), color: C.ink, maxW: rect.w - 112 });
    ctx.globalAlpha = out * Math.min(1, k * 2);
  }
  items.forEach((label, i) => {
    const s = b.items.start + i * b.items.step;
    const cy = y0 + CHECK.row * i + CHECK.row / 2 - 8;
    const bx = 56, half = CHECK.box / 2;
    // a row is one unit: its box outline fades in with the row, fills at once, the mark draws, then the text slides in
    const ko = expoOut(seg(ts, s, s + 0.14));          // outline (never seen alone for long)
    const kb = seg(ts, s + 0.1, s + 0.24);             // the box fills with the accent
    const kc = seg(ts, s + 0.2, s + 0.46);             // the checkmark draws on
    const kt = expoOut(seg(ts, s + 0.18, s + 0.18 + b.items.dur)); // the text slides in
    ctx.save();
    ctx.globalAlpha = out * ko;
    rr(ctx, bx, cy - half, CHECK.box, CHECK.box, 14);
    ctx.strokeStyle = C.line; ctx.lineWidth = 4;
    ctx.stroke();
    if (kb > 0) {
      ctx.fillStyle = hexA(C.primary, kb);
      rr(ctx, bx, cy - half, CHECK.box, CHECK.box, 14);
      ctx.fill();
    }
    drawCheck(ctx, bx + half, cy, CHECK.box * 0.9, onPrimary(C.primary), CHECK.box * 0.1, kc);
    ctx.restore();
    if (kt > 0) {
      ctx.save();
      ctx.globalAlpha = out * kt;
      text(ctx, label, bx + CHECK.box + 36 + (1 - kt) * 40, cy, { font: fnt(skin, 600, 36), color: C.ink, maxW: rect.w - (bx + CHECK.box + 36) - 56 });
      ctx.restore();
    }
  });
  ctx.restore();
}

export default {
  type: "featureChecklist",
  category: "Venta",
  captions: "option", // subtitles hide while the element is on screen (element.captions "keep" keeps them), like the screens
  label: "Lista de características",
  description: "Puntos con casilla que se marcan uno por uno",
  brief: [
    "Qué: lista de características con casillas que se marcan una a una.",
    "Cuándo: mostrar qué incluye un producto o plan. No usar: para comparar precios (priceCompare) ni para una tabla con varias columnas (compareTable).",
    "Coreografía: la tarjeta nace; cada renglón entra en cascada; la casilla se llena con el acento y luego se dibuja la marca; no hay casillas vacías visibles antes de su renglón.",
    "Gusto: casillas con relleno suave al marcarse, no contornos que parezcan carga; texto 28–34 px; sin contadores ni brillo.",
    "Datos: lista escrita por el usuario; nunca datos reales de clientes."
  ].join("\n"),
  icon: "M4 6l2 2 3-3M4 14l2 2 3-3M12 6h8M12 14h8",
  textKey: "title",
  defaults: (t, end) => ({ type: "featureChecklist", in: t, out: Math.min(t + 3.6, end), title: "Incluye", items: ["Agente de WhatsApp 24/7", "Seguimiento de prospectos", "Reporte semanal", "Factura electrónica"] }),
  fields: [
    { key: "title", label: "Título (opcional)", kind: "text", opt: true },
    { key: "items", label: "Puntos (uno por línea, de 3 a 6)", kind: "list" },
  ],
  screen: UI_SCREEN(false),
  timeline: checklistTimeline,
  minScale: 0.76, // the smallest text (36 px) x 0.76 stays >= 24 px
  size: (el) => ({ w: CHECK.w, h: Math.max(1, itemsOf(el).length) * CHECK.row + (el.title ? CHECK.titleH + 56 : 56) + 40 }),
  validate(el, tag) {
    const errors = [], warnings = [];
    const n = itemsOf(el).length;
    if (n < 3 || n > 6) errors.push(`${tag}: necesita de 3 a 6 puntos (tiene ${n})`);
    return { errors, warnings };
  },
  texts(el, add) {
    add(el.title); itemsOf(el).forEach((s) => add(s));
  },
  events(el, rect, { beats: B, add }) {
    add(B.items.start, "whoosh");
    add(B.items.start + (Math.max(1, itemsOf(el).length) - 1) * B.items.step + 0.46, "pop");
  },
  draw: (ctx, el, t, env) => pushed(ctx, el, env.ts, env.tl, env.rect, () => drawChecklist(ctx, el, env.ts, env.tl, env.rect, env)),
};
