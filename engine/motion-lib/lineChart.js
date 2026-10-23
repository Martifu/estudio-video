// Element "lineChart" of the motion library: los ejes aparecen, la línea se dibuja de izquierda a derecha con un punto guía y al final
// un globo con la cifra final que rebota y cuenta hasta su valor. One file = one element type (see engine/README.md "Cómo agregar un elemento").
// Timeline beats are in DESIGN seconds; the registry (index.js) scales them to [in, out]. Drawing is a pure function of the local time.
import { seg, inOut, expoOut, lerp, parseMoney, statText } from "../ui-motion.js";
import { fnt, text, disc, rr } from "./_kit.js";
import { UI_SCREEN, UI_SOURCE, FICTIONAL } from "./_fields.js";
import { CHART_FORMATS, cardEnvelope, endCardEnvelope, axisFade, polylineDraw, countUp, seriesProblems, niceDomain, COUNT_FROM } from "./_charts.js";

export const LINE = { w: 900, h: 640, pad: 56, top: 240, base: 540, minPts: 2, maxPts: 12 };

export const lineTimeline = () => ({
  Ld: 3.2,
  b: { blob: [0, 0.5], axis: [0.1, 0.6], line: [0.35, 1.6], callout: [1.6, 2.0], count: [1.6, 2.0], exit: [2.85, 3.2] }
});

function drawLine(ctx, el, ts, tl, rect, env) {
  const { skin } = env, C = skin.colors, b = tl.b;
  const rows = (el.rows ?? []).slice(0, LINE.maxPts);
  const n = rows.length;
  const w = rect.w;
  cardEnvelope(ctx, el, tl, ts, rect, skin);
  text(ctx, el.title ?? "", LINE.pad, 84, { font: fnt(skin, 700, 38), color: C.ink, maxW: w - 2 * LINE.pad });
  if (n < LINE.minPts) { endCardEnvelope(ctx); return; }
  const vals = rows.map((r) => Math.max(0, parseMoney(r.value) ?? 0));
  // the y-domain fits the data (padded, rounded to a nice step): a real variation reads as a trend, not a flat line at zero
  const dom = niceDomain(vals);
  const box = { x: LINE.pad, y: LINE.top, w: w - 2 * LINE.pad, h: LINE.base - LINE.top, lines: dom.lines };
  const axA = axisFade(ctx, skin, ts, b.axis, box);
  const dx = box.w / (n - 1);
  const yOf = (v) => box.y + (box.h * (dom.max - v)) / (dom.max - dom.min);
  const pts = vals.map((v, i) => [box.x + dx * i, yOf(v)]);
  polylineDraw(ctx, pts, inOut(seg(ts, b.line[0], b.line[1])), { color: C.primary, width: 10 });
  // category labels under the baseline (fade with the axis)
  ctx.save();
  ctx.globalAlpha *= axA;
  rows.forEach((r, i) => text(ctx, r.label ?? "", box.x + dx * i, LINE.base + 42, { font: fnt(skin, 600, 28), color: C.muted, align: "center", maxW: Math.max(40, dx - 8) }));
  ctx.restore();
  // the last point gets an end dot; the final value is a chip anchored just above (or below, when there is no room) that point
  const pop = seg(ts, b.callout[0], b.callout[1]);
  if (pop > 0) {
    const [ex, ey] = pts[n - 1];
    const fe = { value: rows[n - 1].value, format: el.format ?? "money", prefix: el.prefix, suffix: el.suffix };
    const final = statText(fe, 1);
    const shown = countUp(fe, seg(ts, b.count[0], b.count[1]), { from: COUNT_FROM });
    ctx.font = fnt(skin, 700, 52);
    const cw = ctx.measureText(final).width + 56;
    const cx = Math.min(Math.max(ex, LINE.pad + cw / 2), w - LINE.pad - cw / 2);
    let cy = ey - 72;
    if (cy - 42 < 150) cy = ey + 72;
    const s = lerp(0.8, 1, expoOut(pop));
    ctx.save();
    ctx.globalAlpha *= Math.min(1, pop * 3);
    disc(ctx, ex, ey, 19, C.surface);
    disc(ctx, ex, ey, 12, C.accent);
    ctx.translate(cx, cy);
    ctx.scale(s, s);
    ctx.fillStyle = C.accent;
    rr(ctx, -cw / 2, -42, cw, 84, 42);
    ctx.fill();
    if (shown) text(ctx, shown, 0, 2, { font: fnt(skin, 700, 52), color: C.surface, align: "center" });
    ctx.restore();
  }
  endCardEnvelope(ctx);
}

export default {
  type: "lineChart",
  category: "KPIs y gráficas",
  captions: "option",
  label: "Gráfica de línea",
  timelineLabel: "Pantalla: gráfica de línea",
  description: "Una línea que se dibuja de izquierda a derecha y cierra con la cifra final",
  brief: [
    "Qué: Una línea de tendencia que se dibuja de izquierda a derecha y cierra con la cifra final.",
    "Cuándo: una serie en el tiempo (meses, semanas) con 4 a 12 puntos. No usar: categorías sueltas (usa barChart) ni un solo número (usa counterBig).",
    "Coreografía: la rejilla aparece, la línea se traza con su punto final, luego el globo de la última cifra; la salida baja 30 % de duración.",
    "Gusto: el dominio del eje se ajusta a los datos (no empieza en cero si la variación es chica); línea gruesa de acento; un solo punto final destacado.",
    "Datos: fictional o screenshot; nunca datos reales de un cliente."
  ].join("\n"),
  icon: "M4 17l5-5 4 3 7-8",
  textKey: "title",
  defaults: (t, end) => ({
    type: "lineChart", in: t, out: Math.min(t + 3.2, end), title: "Ventas por mes", format: "compact", prefix: "$",
    rows: [
      { label: "Ene", value: 412000 },
      { label: "Feb", value: 438000 },
      { label: "Mar", value: 467000 },
      { label: "Abr", value: 451000 },
      { label: "May", value: 512000 },
      { label: "Jun", value: 584000 }
    ],
    source: { ...FICTIONAL }
  }),
  fields: [
    { key: "title", label: "Qué mide", kind: "text" },
    { key: "rows", label: "Puntos (2 a 12)", kind: "blocks", prop: "rows", min: LINE.minPts, max: LINE.maxPts, blank: () => ({ label: "Nuevo", value: 0 }), fields: () => [
      { key: "label", label: "Nombre (ej. Ene)", kind: "text" },
      { key: "value", label: "Cifra", kind: "number", step: 1 }
    ], name: (r) => r.label || "Punto" },
    { key: "format", label: "Formato de las cifras", kind: "select", options: CHART_FORMATS, opt: true, ph: "dinero" },
    { key: "prefix", label: "Antes de la cifra (opcional)", kind: "text", opt: true },
    { key: "suffix", label: "Después de la cifra (opcional)", kind: "text", opt: true }
  ],
  screen: UI_SCREEN(false),
  source: UI_SOURCE,
  pin: null,
  minScale: 0.88,
  thumbAt: 0.65,
  timeline: lineTimeline,
  size: () => ({ w: LINE.w, h: LINE.h }),
  showsNumbers: () => true,
  validate(el, tag) {
    const errors = seriesProblems(el.rows, tag, { min: LINE.minPts, max: LINE.maxPts }), warnings = [];
    if (!el.title) errors.push(`${tag}: necesita qué mide`);
    if (el.format !== undefined && !CHART_FORMATS.some(([k]) => k === el.format)) errors.push(`${tag}: el formato no existe`);
    return { errors, warnings };
  },
  texts(el, add) {
    add(el.title);
    for (const r of el.rows ?? []) add(r.label);
  },
  events(el, rect, { beats: B, add }) {
    add(B.blob[0], "pop");
    add(B.callout[0], "pop");
  },
  draw: (ctx, el, t, env) => drawLine(ctx, el, env.ts, env.tl, env.rect, env),
};
