// Element "comparisonBars" of the motion library: "Antes / Con <marca>": barras lado a lado con su cifra; la ganadora resalta.
// One file = one element type (see engine/README.md "Cómo agregar un elemento"). Timeline beats are in DESIGN seconds; the registry
// (index.js) scales them to [in, out]. Drawing is a pure function of the local time.
import { seg, parseMoney, statText } from "../ui-motion.js";
import { fnt, text } from "./_kit.js";
import { UI_SCREEN, UI_SOURCE, FICTIONAL, idx } from "./_fields.js";
import { CHART_FORMATS, cardEnvelope, endCardEnvelope, axisFade, growBar, countUp, seriesProblems, COUNT_FROM } from "./_charts.js";

export const CMP = { w: 900, h: 640, pad: 56, top: 220, base: 520, minRows: 2, maxRows: 4 };
// Value labels: 84 px at most, never below 48 px (one size for the whole chart, so the count never jitters).
const VALUE_MAX = 84, VALUE_MIN = 48;

// Every count ends by 1.56 s (4 rows), so the data is fully drawn by 0.6 * Ld (the thumbnail lands at 0.65 * Ld).
export const cmpTimeline = () => ({
  Ld: 3.0,
  b: {
    blob: [0, 0.5],
    axis: [0.1, 0.55],
    grow: { start: 0.3, step: 0.12, dur: 0.8 },
    count: { start: 0.4, step: 0.12, dur: 0.8 },
    pulse: [1.6, 2.1],
    exit: [2.65, 3.0]
  }
});

const rowsOf = (el) => (el.rows ?? []).slice(0, CMP.maxRows);
const COUNT_STEPS = Array.from({ length: 20 }, (_, i) => (i + 1) / 20);
/** Every text a value shows while it counts (the count steps and the final text): the value size must fit all of them, because a count
 * passes through digits the final text does not have ("$999.9K" on the way to "$412K"). */
export function valueTexts(fe) { return [...COUNT_STEPS.map((k) => countUp(fe, k, { from: COUNT_FROM })), statText(fe, 1)]; }
/** Index of the winning bar: el.winner when it exists, else the highest value (-1 when no value reads as a number). */
export function winnerOf(el) {
  const rows = rowsOf(el);
  if (Number.isInteger(el.winner) && el.winner >= 0 && el.winner < rows.length) return el.winner;
  let best = -1, top = -Infinity;
  rows.forEach((r, i) => { const v = parseMoney(r.value); if (v !== null && v > top) { top = v; best = i; } });
  return best;
}

function drawCompare(ctx, el, ts, tl, rect, env) {
  const { skin } = env, C = skin.colors, b = tl.b;
  const rows = rowsOf(el);
  const n = rows.length;
  const w = rect.w, h = rect.h;
  cardEnvelope(ctx, el, tl, ts, rect, skin);
  text(ctx, el.title ?? "", CMP.pad, 84, { font: fnt(skin, 700, 38), color: C.ink, maxW: w - 2 * CMP.pad });
  if (!n) { endCardEnvelope(ctx); return; }
  const fe = (r) => ({ value: r.value, format: el.format ?? "money", prefix: el.prefix, suffix: el.suffix });
  const x0 = CMP.pad, x1 = w - CMP.pad;
  const box = { x: x0, y: CMP.top, w: x1 - x0, h: CMP.base - CMP.top, lines: 4 };
  axisFade(ctx, skin, ts, b.axis, box);
  const slot = (x1 - x0) / n;
  // one value size for the whole chart: the widest text any value shows (count steps included) fits its slot, never below 48 px.
  // Text width is linear in the font size, so it is measured once at 100 px.
  ctx.font = fnt(skin, 700, 100);
  const widest100 = Math.max(1, ...rows.flatMap((r) => valueTexts(fe(r))).map((s) => ctx.measureText(s).width));
  const px = Math.max(VALUE_MIN, Math.min(VALUE_MAX, Math.floor(((slot - 8) * 100) / widest100)));
  const vals = rows.map((r) => Math.max(0, parseMoney(r.value) ?? 0));
  const maxV = Math.max(1e-9, ...vals);
  const win = winnerOf(el);
  const bw = Math.min(180, slot * 0.5);
  rows.forEach((r, i) => {
    const g = growBar(ts, b.grow, i);
    const kc = seg(ts, b.count.start + i * b.count.step, b.count.start + i * b.count.step + b.count.dur);
    const bh = (CMP.base - CMP.top) * (vals[i] / maxV) * g;
    const cx = x0 + slot * (i + 0.5);
    const isWin = i === win;
    // the winner pulses ONCE (width only, so its value stays on the top edge); the others (the "before") are a solid muted neutral
    const p = isWin ? seg(ts, b.pulse[0], b.pulse[1]) : 0;
    const s = isWin ? 1 + 0.06 * Math.sin(Math.PI * p) : 1;
    ctx.save();
    ctx.translate(cx, 0);
    ctx.scale(s, 1);
    ctx.translate(-cx, 0);
    if (bh >= 1) {
      ctx.fillStyle = win < 0 ? C.primary : isWin ? C.accent : C.muted;
      const rt = Math.min(18, bw / 2, bh);
      ctx.beginPath();
      ctx.roundRect(cx - bw / 2, CMP.base - bh, bw, bh, [rt, rt, 0, 0]);
      ctx.fill();
    }
    const shown = countUp(fe(r), kc, { from: COUNT_FROM });
    if (shown) {
      ctx.save();
      ctx.globalAlpha *= Math.min(1, kc * 4);
      text(ctx, shown, cx, CMP.base - bh - 36, { font: fnt(skin, 700, px), color: isWin ? C.accent : C.ink, align: "center" });
      ctx.restore();
    }
    ctx.restore();
    // row name under the baseline (shortened by the ellipsis when it does not fit its slot)
    text(ctx, r.label ?? "", cx, CMP.base + 44, { font: fnt(skin, 600, 30), color: C.muted, align: "center", maxW: slot - 10 });
  });
  endCardEnvelope(ctx);
}

export default {
  type: "comparisonBars",
  category: "KPIs y gráficas",
  captions: "option",
  label: "Antes y después",
  timelineLabel: "Gráfica: antes y después",
  description: "Barras lado a lado con su cifra; la ganadora resalta",
  brief: [
    "Qué: Dos barras lado a lado (antes y después) con su cifra; la ganadora resalta.",
    "Cuándo: comparar dos estados de una misma métrica. No usar: más de 3 barras (usa barChart) ni una serie (usa lineChart).",
    "Coreografía: la tarjeta nace; la barra de antes crece con su cifra, luego la de después crece más y resalta; las cifras cuentan al llegar.",
    "Gusto: la barra de antes en un gris medio legible (no pálido); la de después en acento; cifras grandes; diferencia explícita.",
    "Datos: fictional o screenshot; nunca datos reales de un cliente."
  ].join("\n"),
  icon: "M5 20v-6M12 20V6M19 20v-10",
  textKey: "title",
  defaults: (t, end) => ({
    type: "comparisonBars", in: t, out: Math.min(t + 3.0, end), title: "Cierres al mes", format: "int", winner: 1,
    rows: [
      { label: "Antes", value: 12 },
      { label: "Con nosotros", value: 31 }
    ],
    source: { ...FICTIONAL }
  }),
  fields: [
    { key: "title", label: "Qué compara", kind: "text" },
    { key: "rows", label: "Barras (2 a 4)", kind: "blocks", prop: "rows", min: CMP.minRows, max: CMP.maxRows, blank: () => ({ label: "Nuevo", value: 0 }), fields: () => [
      { key: "label", label: "Nombre (ej. Antes)", kind: "text" },
      { key: "value", label: "Cifra", kind: "number", step: 1 }
    ], name: (r) => r.label || "Barra" },
    { key: "format", label: "Formato de las cifras", kind: "select", options: CHART_FORMATS, opt: true, ph: "dinero" },
    { key: "prefix", label: "Antes de la cifra (opcional)", kind: "text", opt: true },
    { key: "suffix", label: "Después de la cifra (opcional)", kind: "text", opt: true },
    { key: "winner", label: "Barra ganadora (vacío = la más alta)", kind: "index", of: "rows", name: (r) => r.label, opt: true }
  ],
  screen: UI_SCREEN(false),
  source: UI_SOURCE,
  pin: null,
  minScale: 0.88,
  thumbAt: 0.65,
  timeline: cmpTimeline,
  size: () => ({ w: CMP.w, h: CMP.h }),
  showsNumbers: () => true,
  validate(el, tag) {
    const n = (el.rows ?? []).length;
    const errors = seriesProblems(el.rows, tag, { min: CMP.minRows, max: CMP.maxRows }), warnings = [];
    if (!el.title) errors.push(`${tag}: necesita qué compara`);
    if (!idx(el, "winner", n)) errors.push(`${tag}: la barra ganadora no existe`);
    if (el.format !== undefined && !CHART_FORMATS.some(([k]) => k === el.format)) errors.push(`${tag}: el formato no existe`);
    // a value label is 48 px and must not run into its neighbour or past the card: an error when the widest text (count steps included)
    // cannot fit its slot even at that size (approx. 0.55 em per character)
    if (n >= CMP.minRows && n <= CMP.maxRows && errors.length === 0) {
      const fmt = el.format ?? "money";
      const longest = Math.max(...(el.rows ?? []).flatMap((r) => valueTexts({ value: r.value, format: fmt, prefix: el.prefix, suffix: el.suffix })).map((s) => s.length));
      if (longest * 0.55 * VALUE_MIN > (CMP.w - 2 * CMP.pad) / n - 8) errors.push(`${tag}: la cifra más larga no cabe en ${n} barras; usa formato Corto o menos barras`);
    }
    return { errors, warnings };
  },
  texts(el, add) {
    add(el.title);
    for (const r of el.rows ?? []) add(r.label);
  },
  events(el, rect, { beats: B, add }) {
    add(B.blob[0], "pop");
    if (winnerOf(el) >= 0) add(B.pulse[0], "pop");
  },
  draw: (ctx, el, t, env) => drawCompare(ctx, el, env.ts, env.tl, env.rect, env),
};
