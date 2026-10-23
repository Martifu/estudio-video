// Element "sparkCard" of the motion library: una tarjeta KPI (nombre, cifra que cuenta hasta su valor, cambio con flecha) y, debajo de la
// cifra, una mini gráfica de línea que se dibuja con su punto guía. One file = one element type (see engine/README.md "Cómo agregar un elemento").
// Timeline beats are in DESIGN seconds; the registry (index.js) scales them to [in, out]. Drawing is a pure function of the local time.
import { seg, inOut, expoOut, parseMoney, statText } from "../ui-motion.js";
import { fnt, text, hexA } from "./_kit.js";
import { UI_SCREEN, UI_SOURCE, FICTIONAL } from "./_fields.js";
import { CHART_FORMATS, cardEnvelope, endCardEnvelope, polylineDraw, countUp, deltaBadge, COUNT_FROM } from "./_charts.js";

export const SPARK = { w: 820, h: 520, pad: 56, spark: { top: 296, h: 150 }, minPts: 3, maxPts: 12 };

export const sparkTimeline = () => ({
  Ld: 2.6,
  b: { blob: [0, 0.5], label: [0.2, 0.5], count: [0.3, 1.1], axis: [0.2, 0.6], spark: [0.5, 1.6], delta: [1.1, 1.45], exit: [2.25, 2.6] }
});

function drawSpark(ctx, el, ts, tl, rect, env) {
  const { skin } = env, C = skin.colors, b = tl.b;
  const w = rect.w;
  const pad = SPARK.pad;
  cardEnvelope(ctx, el, tl, ts, rect, skin);
  // label (left) and the change badge (right, same row); the badge is measured first so the label never runs under it
  const la = expoOut(seg(ts, b.label[0], b.label[1]));
  const dtext = el.delta?.text ?? "";
  const dw = dtext ? deltaBadge(ctx, skin, dtext, el.delta.dir, 0, 0, 0) : 0;
  const dx = w - pad - dw;
  ctx.save();
  ctx.globalAlpha *= la;
  text(ctx, el.label ?? "", pad, 84, { font: fnt(skin, 600, 34), color: C.muted, maxW: Math.max(60, (dtext ? dx - 24 : w - 2 * pad) - pad) });
  ctx.restore();
  if (dtext) deltaBadge(ctx, skin, dtext, el.delta.dir, dx, 84, seg(ts, b.delta[0], b.delta[1]));
  // value: counts up MONOTONICALLY to the exact final text (left aligned, so the first digit never moves)
  const fe = { value: el.value, format: el.format ?? "int", prefix: el.prefix, suffix: el.suffix };
  const final = statText(fe, 1);
  let px = 130;
  ctx.font = fnt(skin, 700, px);
  while (px > 80 && ctx.measureText(final).width > w - 2 * pad) { px -= 6; ctx.font = fnt(skin, 700, px); }
  const shown = countUp(fe, seg(ts, b.count[0], b.count[1]), { from: COUNT_FROM });
  if (shown) text(ctx, shown, pad, 214, { font: fnt(skin, 700, px), color: C.ink, ls: -2 });
  // sparkline under the value: axis first, then the line draws with its leading dot (vertical scale = its own min..max)
  const box = { x: pad, y: SPARK.spark.top, w: w - 2 * pad, h: SPARK.spark.h };
  // baseline only (own stroke: axisFade divides by `lines`, which is 0 here)
  const ba = expoOut(seg(ts, b.axis[0], b.axis[1]));
  if (ba > 0) {
    ctx.save();
    ctx.globalAlpha *= ba;
    ctx.strokeStyle = C.faint;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(box.x, box.y + box.h + 1.5);
    ctx.lineTo(box.x + box.w, box.y + box.h + 1.5);
    ctx.stroke();
    ctx.restore();
  }
  const vals = (el.series ?? []).map((r) => Math.max(0, parseMoney(r.value) ?? 0));
  if (vals.length >= SPARK.minPts) {
    const lo = Math.min(...vals), hi = Math.max(...vals), span = hi - lo || 1;
    const pts = vals.map((v, i) => [box.x + box.w * (i / (vals.length - 1)), box.y + box.h - 8 - (box.h - 16) * ((v - lo) / span)]);
    const prog = inOut(seg(ts, b.spark[0], b.spark[1]));
    if (prog > 0) {
      // a soft area under the line (a background tint), revealed with the line
      ctx.save();
      ctx.beginPath();
      ctx.rect(box.x, box.y, box.w * prog, box.h + 2);
      ctx.clip();
      ctx.fillStyle = hexA(C.primary, 0.12);
      ctx.beginPath();
      ctx.moveTo(pts[0][0], box.y + box.h);
      for (const [x, y] of pts) ctx.lineTo(x, y);
      ctx.lineTo(pts[pts.length - 1][0], box.y + box.h);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    polylineDraw(ctx, pts, prog, { color: C.primary, width: 9 });
  }
  endCardEnvelope(ctx);
}

export default {
  type: "sparkCard",
  category: "KPIs y gráficas",
  captions: "option",
  label: "Tarjeta con mini gráfica",
  timelineLabel: "Pantalla: tarjeta con mini gráfica",
  description: "Una cifra KPI que cuenta hasta su valor, con una mini gráfica debajo",
  brief: [
    "Qué: Una cifra KPI que cuenta hasta su valor, con una mini gráfica de tendencia debajo.",
    "Cuándo: un KPI con su historia reciente en una tarjeta. No usar: varias cifras (usa kpiGrid) ni una gráfica completa con ejes (usa lineChart).",
    "Coreografía: la tarjeta nace, la cifra cuenta, la mini gráfica se traza de izquierda a derecha con su punto final y el delta aparece al final.",
    "Gusto: la mini gráfica es gruesa y de acento, no un hilo; el área bajo la línea es un tinte suave; la cifra es el héroe.",
    "Datos: fictional o screenshot; nunca datos reales de un cliente."
  ].join("\n"),
  icon: "M4 18l4-5 3 2 4-6 5 4",
  textKey: "label",
  defaults: (t, end) => ({
    type: "sparkCard", in: t, out: Math.min(t + 2.6, end), label: "Ventas del mes", value: 584000, format: "money",
    delta: { text: "+14% vs. mes anterior", dir: "up" },
    series: [{ value: 412000 }, { value: 438000 }, { value: 467000 }, { value: 451000 }, { value: 512000 }, { value: 584000 }],
    source: { ...FICTIONAL }
  }),
  fields: [
    { key: "label", label: "Qué mide", kind: "text" },
    { key: "value", label: "Cifra", kind: "number", step: 1 },
    { key: "format", label: "Formato", kind: "select", options: CHART_FORMATS, opt: true, ph: "número" },
    { key: "prefix", label: "Antes de la cifra (opcional)", kind: "text", opt: true },
    { key: "suffix", label: "Después de la cifra (opcional)", kind: "text", opt: true },
    { key: "delta.text", label: "Cambio (ej. +14% vs. mes anterior)", kind: "text", opt: true },
    { key: "delta.dir", label: "El cambio es", kind: "select", options: [["up", "Sube (verde)"], ["down", "Baja (rojo)"]], opt: true, ph: "sube" },
    { key: "series", label: "Puntos de la mini gráfica (3 a 12)", kind: "blocks", prop: "series", min: SPARK.minPts, max: SPARK.maxPts, blank: () => ({ value: 0 }), fields: () => [
      { key: "value", label: "Cifra del punto", kind: "number", step: 1 }
    ], name: (r) => String(r.value ?? "Punto") }
  ],
  screen: UI_SCREEN(false),
  source: UI_SOURCE,
  pin: null,
  thumbAt: 0.65,
  timeline: sparkTimeline,
  size: () => ({ w: SPARK.w, h: SPARK.h }),
  minScale: 0.76,
  showsNumbers: () => true,
  validate(el, tag) {
    const errors = [], warnings = [];
    const series = el.series ?? [];
    if (!el.label) errors.push(`${tag}: necesita qué mide`);
    if (el.value === undefined || el.value === "" || parseMoney(el.value) === null) errors.push(`${tag}: necesita la cifra`);
    if (series.length < SPARK.minPts || series.length > SPARK.maxPts) errors.push(`${tag}: la mini gráfica necesita de ${SPARK.minPts} a ${SPARK.maxPts} puntos (tiene ${series.length})`);
    else if (series.some((r) => !r || parseMoney(r.value) === null)) errors.push(`${tag}: cada punto necesita una cifra`);
    if (el.format !== undefined && !CHART_FORMATS.some(([k]) => k === el.format)) errors.push(`${tag}: el formato no existe`);
    return { errors, warnings };
  },
  texts(el, add) {
    add(el.label);
    add(el.delta?.text);
  },
  events(el, rect, { beats: B, add }) {
    add(B.blob[0], "pop");
    if (el.delta?.text) add(B.delta[0], "pop");
  },
  draw: (ctx, el, t, env) => drawSpark(ctx, el, env.ts, env.tl, env.rect, env),
};
