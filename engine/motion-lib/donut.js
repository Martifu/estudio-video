// Element "donut" of the motion library: un anillo cuyos segmentos se barren uno tras otro, con su fila de leyenda (nombre y porcentaje)
// que aparece al terminar cada uno, y el total en el centro que cuenta hasta su cifra. One file = one element type (see engine/README.md
// "Cómo agregar un elemento"). Timeline beats are in DESIGN seconds; the registry (index.js) scales them to [in, out].
import { seg, inOut, expoOut, clamp, statText, parseMoney } from "../ui-motion.js";
import { fnt, text, disc } from "./_kit.js";
import { UI_SCREEN, UI_SOURCE, FICTIONAL } from "./_fields.js";
import { CHART_FORMATS, cardEnvelope, endCardEnvelope, countUp, seriesProblems, seriesPalette, COUNT_FROM } from "./_charts.js";

export const DONUT = { w: 900, h: 640, pad: 56, cx: 220, cy: 366, R: 140, band: 44, legX: 430, legTop: 250, legStep: 84, minSeg: 2, maxSeg: 5 };

export const donutTimeline = () => ({
  Ld: 2.8,
  b: {
    blob: [0, 0.5],
    track: [0.1, 0.5],
    wipe: { start: 0.3, step: 0.15, dur: 0.5 },
    legend: { start: 0.45, step: 0.15, dur: 0.4 },
    total: [0.4, 1.5],
    done: [1.5, 1.8],
    exit: [2.45, 2.8]
  }
});

/** Arc band (butt caps, so adjacent segments meet cleanly) from angle a0 to a1 (radians). Nothing when a1 <= a0. */
function bandArc(ctx, cx, cy, r, width, a0, a1, color) {
  if (a1 - a0 <= 1e-6) return;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "butt";
  ctx.beginPath();
  ctx.arc(cx, cy, r, a0, a1);
  ctx.stroke();
  ctx.restore();
}

function drawDonut(ctx, el, ts, tl, rect, env) {
  const { skin } = env, C = skin.colors, b = tl.b;
  const rows = (el.rows ?? []).slice(0, DONUT.maxSeg);
  const n = rows.length;
  const w = rect.w;
  cardEnvelope(ctx, el, tl, ts, rect, skin);
  text(ctx, el.title ?? "", DONUT.pad, 84, { font: fnt(skin, 700, 38), color: C.ink, maxW: w - 2 * DONUT.pad });
  if (n < DONUT.minSeg) { endCardEnvelope(ctx); return; }
  const vals = rows.map((r) => Math.max(0, parseMoney(r.value) ?? 0));
  const total = vals.reduce((s, v) => s + v, 0) || 1e-9;
  const cols = seriesPalette(C, n);
  const { cx, cy, R, band } = DONUT;
  // the empty track fades in first
  const ta = seg(ts, b.track[0], b.track[1]);
  if (ta > 0) {
    ctx.save();
    ctx.globalAlpha *= expoOut(ta);
    bandArc(ctx, cx, cy, R, band, -Math.PI / 2, (Math.PI * 3) / 2, C.line);
    ctx.restore();
  }
  // segments wipe in sequence, clockwise from 12 o'clock; each one starts where the previous one ends
  let a = -Math.PI / 2;
  rows.forEach((r, i) => {
    const sweep = (vals[i] / total) * Math.PI * 2;
    const s0 = b.wipe.start + i * b.wipe.step;
    const g = inOut(seg(ts, s0, s0 + b.wipe.dur));
    bandArc(ctx, cx, cy, R, band, a, a + sweep * g, cols[i]);
    a += sweep;
  });
  // total in the centre: counts up to its exact text (the size shrinks, never below 48 px, so it fits the hole)
  const feT = { value: total, format: el.format ?? "compact", prefix: el.prefix, suffix: el.suffix };
  // the size comes from a fixed widest reference (not the final text): intermediate counts are never wider than the size chosen
  const refT = statText({ ...feT, value: 888888888 }, 1);
  const holeW = 2 * (R - band / 2) - 40;
  let px = 60;
  ctx.font = fnt(skin, 700, px);
  while (px > 48 && ctx.measureText(refT).width > holeW) { px -= 4; ctx.font = fnt(skin, 700, px); }
  const shownT = countUp(feT, seg(ts, b.total[0], b.total[1]), { from: COUNT_FROM });
  if (shownT) {
    text(ctx, shownT, cx, cy - 8, { font: fnt(skin, 700, px), color: C.ink, align: "center", maxW: holeW });
    text(ctx, el.centerLabel ?? "Total", cx, cy + px * 0.5 + 26, { font: fnt(skin, 600, 28), color: C.muted, align: "center", maxW: holeW });
  }
  // legend rows: swatch + name on the left, share on the right; each one appears when its segment has wiped in
  rows.forEach((r, i) => {
    const s0 = b.legend.start + i * b.legend.step;
    const lg = seg(ts, s0, s0 + b.legend.dur);
    if (lg <= 0) return;
    const g = expoOut(lg);
    const y = DONUT.legTop + i * DONUT.legStep;
    const x = DONUT.legX + (1 - g) * 24;
    ctx.save();
    ctx.globalAlpha *= clamp(lg * 3);
    disc(ctx, x + 14, y, 14, cols[i]);
    // the share is the final text as soon as its row appears (no micro-counter per row competing with the total)
    const pctText = statText({ value: ((vals[i] / total) * 100).toFixed(1), format: "pct" }, 1);
    text(ctx, r.label ?? "", x + 44, y + 1, { font: fnt(skin, 600, 30), color: C.ink, maxW: Math.max(60, w - DONUT.pad - 170 - (x + 44)) });
    text(ctx, pctText, w - DONUT.pad, y + 1, { font: fnt(skin, 700, 32), color: C.ink, align: "right" });
    ctx.restore();
  });
  endCardEnvelope(ctx);
}

export default {
  type: "donut",
  category: "KPIs y gráficas",
  captions: "option",
  label: "Gráfica de dona",
  timelineLabel: "Pantalla: gráfica de dona",
  description: "Segmentos que se barren en orden, con su leyenda y el total en el centro",
  brief: [
    "Qué: Segmentos de una dona que se barren en orden, con su leyenda y el total al centro.",
    "Cuándo: partes de un todo con 2 a 6 segmentos. No usar: más de 6 categorías (usa barChart) ni comparar periodos (usa comparisonBars).",
    "Coreografía: la dona nace, cada segmento se barre en orden de 4 cuadros, el total aparece al centro y la leyenda entra al final.",
    "Gusto: cada segmento se distingue de los demás (nunca tintes pálidos de la misma familia); colores de la marca; leyenda chica pero legible.",
    "Datos: fictional o screenshot; nunca datos reales de un cliente."
  ].join("\n"),
  icon: "M12 3a9 9 0 1 0 9 9M12 3v9h9",
  textKey: "title",
  defaults: (t, end) => ({
    type: "donut", in: t, out: Math.min(t + 2.8, end), title: "Formas de pago", format: "compact", prefix: "$", centerLabel: "Total",
    rows: [
      { label: "Efectivo", value: 480000 },
      { label: "Tarjeta", value: 360000 },
      { label: "Transferencia", value: 240000 },
      { label: "Otros", value: 120000 }
    ],
    source: { ...FICTIONAL }
  }),
  fields: [
    { key: "title", label: "Qué mide", kind: "text" },
    { key: "rows", label: "Segmentos (2 a 5)", kind: "blocks", prop: "rows", min: DONUT.minSeg, max: DONUT.maxSeg, blank: () => ({ label: "Nuevo", value: 0 }), fields: () => [
      { key: "label", label: "Nombre (ej. Efectivo)", kind: "text" },
      { key: "value", label: "Cifra", kind: "number", step: 1 }
    ], name: (r) => r.label || "Segmento" },
    { key: "format", label: "Formato de las cifras", kind: "select", options: CHART_FORMATS, opt: true, ph: "corto" },
    { key: "prefix", label: "Antes del total (opcional)", kind: "text", opt: true },
    { key: "suffix", label: "Después del total (opcional)", kind: "text", opt: true },
    { key: "centerLabel", label: "Texto bajo el total (opcional)", kind: "text", opt: true, ph: "Total" }
  ],
  screen: UI_SCREEN(false),
  source: UI_SOURCE,
  pin: null,
  minScale: 0.88,
  thumbAt: 0.65,
  timeline: donutTimeline,
  size: () => ({ w: DONUT.w, h: DONUT.h }),
  showsNumbers: () => true,
  validate(el, tag) {
    const errors = seriesProblems(el.rows, tag, { min: DONUT.minSeg, max: DONUT.maxSeg }), warnings = [];
    if (!el.title) errors.push(`${tag}: necesita qué mide`);
    if (el.format !== undefined && !CHART_FORMATS.some(([k]) => k === el.format)) errors.push(`${tag}: el formato no existe`);
    return { errors, warnings };
  },
  texts(el, add) {
    add(el.title);
    add(el.centerLabel);
    for (const r of el.rows ?? []) add(r.label);
  },
  events(el, rect, { beats: B, add }) {
    add(B.blob[0], "pop");
    add(B.done[0], "pop");
  },
  draw: (ctx, el, t, env) => drawDonut(ctx, el, env.ts, env.tl, env.rect, env),
};
