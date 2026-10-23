// Element "toggleSwitch" of the motion library: filas de ajustes con interruptores que se encienden uno por uno. One file = one element type (see engine/README.md "Cómo agregar un elemento").
// Timeline beats are in DESIGN seconds; the registry (index.js) scales them to [in, out]. Drawing is a pure function of the local time.
import { seg, expoOut, EXIT, CARD_W } from "../ui-motion.js";
import { fnt, text, card, radiusAt, beginCard, envelope, rr, hexA } from "./_kit.js";
import { drawSwitch, doneBadge, clipRR } from "./_app.js";
import { UI_SCREEN, UI_SOURCE, FICTIONAL } from "./_fields.js";

export const SW = { row: 124, pad: 40, sw: 116, swH: 66, effect: 130 };
export const toggleRows = (el) => Math.max(1, Math.min(5, (el.rows ?? []).length));
export const toggleHeight = (el) => SW.pad * 2 + toggleRows(el) * SW.row + (el.effect ? SW.effect : 0);

/** Beats: each switch that ends "on" turns on in order (the first on-row at `first`), then the effect line. */
export function toggleTimeline(el, mode) {
  const rows = (el.rows ?? []).slice(0, 5);
  const full = mode === "full";
  const first = full ? 0.6 : 0.4;
  const step = full ? 0.5 : 0.36;
  const dur = full ? 0.5 : 0.4;
  let j = 0;
  const sw = rows.map((r) => {
    if (!r.on) return [0, 0];
    const a = first + j * step;
    j += 1;
    return [a, a + dur];
  });
  const lastOn = j ? sw.filter((_, i) => rows[i].on).pop()[1] : first;
  const eff = [lastOn + 0.2, lastOn + 0.7];
  const Ld = (el.effect ? eff[1] : lastOn) + 1.0 + EXIT;
  return { Ld, b: { blob: [0, 0.5], sw, effect: eff, exit: [Ld - EXIT, Ld] } };
}

function drawToggles(ctx, el, ts, tl, rect, env) {
  const { skin } = env, C = skin.colors, b = tl.b;
  const rows = (el.rows ?? []).slice(0, 5);
  const w = rect.w, h = rect.h;
  const E = envelope(tl, ts);
  beginCard(ctx, el, tl, ts, rect, [w / 2, h / 2], E);
  const R = radiusAt(E, skin, w, h);
  card(ctx, 0, 0, w, h, R, skin);
  ctx.save();
  clipRR(ctx, 0, 0, w, h, R);
  rows.forEach((row, i) => {
    const y0 = SW.pad + i * SW.row;
    const k = row.on ? seg(ts, b.sw[i][0], b.sw[i][1]) : 0;
    const sx = w - 44 - SW.sw, sy = y0 + SW.row / 2 - SW.swH / 2;
    text(ctx, row.label ?? "", 44, row.note ? y0 + SW.row / 2 - 18 : y0 + SW.row / 2, { font: fnt(skin, 600, 36), color: C.ink, maxW: sx - 44 - 40 });
    if (row.note) text(ctx, row.note, 44, y0 + SW.row / 2 + 22, { font: fnt(skin, 500, 28), color: C.muted, maxW: sx - 44 - 40 });
    drawSwitch(ctx, skin, sx, sy, SW.sw, SW.swH, k, C.primary);
    if (i < rows.length - 1) {
      ctx.fillStyle = C.line;
      ctx.fillRect(44, y0 + SW.row, w - 88, 2);
    }
  });
  if (el.effect) {
    const g = expoOut(seg(ts, b.effect[0], b.effect[1]));
    const yE = SW.pad + toggleRows(el) * SW.row + SW.effect / 2;
    ctx.save();
    ctx.globalAlpha = g * E.alpha; // leaves with the card
    ctx.fillStyle = hexA(C.primary, 0.14);
    rr(ctx, 44, yE - 52, w - 88, 104, 28);
    ctx.fill();
    doneBadge(ctx, 96, yE, 56, C.primary, g);
    text(ctx, el.effect, 140, yE, { font: fnt(skin, 700, 34), color: C.ink, maxW: w - 88 - 130 });
    ctx.restore();
  }
  ctx.restore();
  ctx.restore();
}

export default {
  type: "toggleSwitch",
  category: "App",
  family: "ui",
  captions: "option",
  label: "Interruptores",
  timelineLabel: "App: ajustes",
  description: "Filas de ajustes que se activan una por una, con una línea de efecto",
  brief: [
    "Qué: filas de ajustes que se activan una por una y una línea de efecto: 'ya quedó configurado'.",
    "Cuándo: la voz habla de configurar, automatizar o activar algo. No usar: para una lista de productos (uiList) ni para un formulario (uiForm).",
    "Coreografía: nace la tarjeta, cada interruptor se enciende en orden cada 0.36-0.5 s, la línea de efecto aparece después del último y la tarjeta sale junta.",
    "Gusto: el nombre manda, la nota va en gris, un solo color (primario) para encendido; sin ruido de filas vacías; efecto con insignia.",
    "Datos: ajustes de ejemplo de la app de la marca; nunca datos reales."
  ].join("\n"),
  icon: "M4 9h10a3 3 0 010 6H4M20 15H10a3 3 0 010-6h10",
  defaults: (t, end) => ({
    type: "toggleSwitch", in: t, out: Math.min(t + 4.4, end), effect: "Respuestas automáticas: activadas",
    rows: [
      { label: "Respuestas automáticas", note: "Contesta en cuanto llega un mensaje", on: true },
      { label: "Recordatorio de cita", note: "Avisa 2 horas antes", on: true },
      { label: "Enviar resumen diario", on: false }
    ],
    source: { ...FICTIONAL }
  }),
  fields: [
    { key: "rows", label: "Ajustes (de 1 a 5)", kind: "blocks", prop: "rows", min: 1, max: 5, blank: () => ({ label: "Nuevo ajuste", on: false }), name: (r) => r.label || "Ajuste",
      fields: () => [{ key: "label", label: "Nombre del ajuste", kind: "text" }, { key: "note", label: "Nota (opcional)", kind: "text", opt: true }, { key: "on", label: "Encendido al final", kind: "bool" }] },
    { key: "effect", label: "Línea de efecto (opcional)", kind: "text", opt: true, ph: "Respuestas automáticas: activadas" }
  ],
  screen: UI_SCREEN(false),
  source: UI_SOURCE,
  pin: null,
  fullMin: 3,
  minScale: 0.88,
  timeline: toggleTimeline,
  size: (el) => ({ w: CARD_W, h: toggleHeight(el) }),
  validate(el, tag) {
    const errors = [], warnings = [];
    const n = (el.rows ?? []).length;
    if (n < 1 || n > 5) errors.push(`${tag}: necesita de 1 a 5 ajustes (tiene ${n})`);
    if ((el.rows ?? []).some((r) => !r?.label)) errors.push(`${tag}: cada ajuste necesita un nombre`);
    if ((el.rows ?? []).some((r) => r && r.on !== undefined && typeof r.on !== "boolean")) errors.push(`${tag}: "on" debe ser sí o no`);
    return { errors, warnings };
  },
  texts(el, add) {
    add(el.effect);
    for (const r of el.rows ?? []) { add(r.label); add(r.note); }
  },
  events(el, rect, { beats: B, add }) {
    (el.rows ?? []).slice(0, 5).forEach((r, i) => { if (r.on) add(B.sw[i][0], "click"); });
    if (el.effect) add(B.effect[0], "pop");
  },
  draw: (ctx, el, t, env) => drawToggles(ctx, el, env.ts, env.tl, env.rect, env),
};
