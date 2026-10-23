// Element "barChart" of the motion library: barras verticales que crecen en escalera, con la cifra de cada una contando hasta su valor.
// One file = one element type (see engine/README.md "Cómo agregar un elemento"). Timeline beats are in DESIGN seconds; the registry
// (index.js) scales them to [in, out]. Drawing is a pure function of the local time.
import { seg, parseMoney, statText } from "../ui-motion.js";
import { fnt, text } from "./_kit.js";
import { UI_SCREEN, UI_SOURCE, FICTIONAL, idx } from "./_fields.js";
import { CHART_FORMATS, cardEnvelope, endCardEnvelope, axisFade, growBar, countUp, seriesProblems, COUNT_FROM } from "./_charts.js";

export const BAR = { w: 900, h: 640, pad: 56, top: 240, base: 560, maxBars: 6, minBars: 2 };

export const barTimeline = () => ({
  Ld: 3.0,
  b: {
    blob: [0, 0.5],
    axis: [0.1, 0.55],
    grow: { start: 0.35, step: 0.1, dur: 0.85 },
    // each count starts when its bar is already ~60 % grown, so its label rides on the bar and starts at a real value
    count: { start: 0.6, step: 0.1, dur: 0.9 },
    pulse: [1.9, 2.4],
    exit: [2.65, 3.0]
  }
});

const hasHighlight = (el) => Number.isInteger(el.highlight) && el.highlight >= 0 && el.highlight < (el.rows ?? []).length;

// Value labels never go below 48 px; the widest final label of the chart must fit one slot (see drawBar).
const VALUE_PX = 48;
function slotWidthOf(n) { return (BAR.w - 2 * BAR.pad) / Math.max(1, n); }

function drawBar(ctx, el, ts, tl, rect, env) {
  const { skin } = env, C = skin.colors, b = tl.b;
  const rows = (el.rows ?? []).slice(0, BAR.maxBars);
  const n = rows.length;
  const w = rect.w, h = rect.h;
  cardEnvelope(ctx, el, tl, ts, rect, skin);
  // title
  text(ctx, el.title ?? "", BAR.pad, 84, { font: fnt(skin, 700, 38), color: C.ink, maxW: w - 2 * BAR.pad });
  if (!n) { endCardEnvelope(ctx); return; }
  const fe = (r) => ({ value: r.value, format: el.format ?? "money", prefix: el.prefix, suffix: el.suffix });
  const x0 = BAR.pad, x1 = w - BAR.pad;
  const box = { x: x0, y: BAR.top, w: x1 - x0, h: BAR.base - BAR.top, lines: 4 };
  const axA = axisFade(ctx, skin, ts, b.axis, box);
  const slot = slotWidthOf(n);
  // one value size for the whole chart: the widest label of any count step fits its slot, never below 48 px (no jitter while counting)
  // every text a label shows while it counts (from COUNT_FROM up to the exact final text) must fit its slot: neighbours never overlap
  const shownTexts = rows.flatMap((r) => [...Array.from({ length: 20 }, (_, k) => countUp(fe(r), (k + 1) / 20, { from: COUNT_FROM })), statText(fe(r), 1)]);
  const finalTexts = rows.map((r) => statText(fe(r), 1));
  const widestOf = (texts, p) => { ctx.font = fnt(skin, 700, p); return Math.max(0, ...texts.map((s) => ctx.measureText(s).width)); };
  const fitPx = (texts) => { let p = 52; while (p > VALUE_PX && widestOf(texts, p) > slot - 8) p -= 2; return Math.max(VALUE_PX, p); };
  // counting labels when every count step fits its slot; otherwise each label fades in per bar at its final text (finals always fit)
  const pxAll = fitPx(shownTexts);
  const animate = widestOf(shownTexts, pxAll) <= slot - 8;
  const px = animate ? pxAll : fitPx(finalTexts);
  const vals = rows.map((r) => Math.max(0, parseMoney(r.value) ?? 0));
  const maxV = Math.max(1e-9, ...vals);
  const hl = hasHighlight(el) ? el.highlight : -1;
  const bw = Math.min(96, slot * 0.56);
  rows.forEach((r, i) => {
    const g = growBar(ts, b.grow, i);
    const kc = seg(ts, b.count.start + i * b.count.step, b.count.start + i * b.count.step + b.count.dur);
    const bh = (BAR.base - BAR.top) * (vals[i] / maxV) * g;
    const cx = x0 + slot * (i + 0.5);
    const hi = i === hl;
    // the highlight bar pulses ONCE (width only, so the value above it stays on its top edge)
    const p = hi ? seg(ts, b.pulse[0], b.pulse[1]) : 0;
    const s = hi ? 1 + 0.06 * Math.sin(Math.PI * p) : 1;
    ctx.save();
    ctx.translate(cx, 0);
    ctx.scale(s, 1);
    ctx.translate(-cx, 0);
    if (bh >= 1) {
      ctx.fillStyle = hi && hl >= 0 ? C.accent : C.primary;
      const rt = Math.min(18, bw / 2, bh);
      ctx.beginPath();
      ctx.roundRect(cx - bw / 2, BAR.base - bh, bw, bh, [rt, rt, 0, 0]);
      ctx.fill();
    }
    const shown = animate ? countUp(fe(r), kc, { from: COUNT_FROM }) : kc >= 0.6 ? statText(fe(r), 1) : "";
    if (shown) {
      ctx.save();
      ctx.globalAlpha *= animate ? Math.min(1, kc * 4) : Math.min(1, (kc - 0.6) * 5);
      text(ctx, shown, cx, BAR.base - bh - 36, { font: fnt(skin, 700, px), color: hi ? C.accent : C.ink, align: "center" });
      ctx.restore();
    }
    ctx.restore();
    // category label under the baseline (shortened by the ellipsis when it does not fit its slot)
    ctx.save();
    ctx.globalAlpha *= axA;
    text(ctx, r.label ?? "", cx, BAR.base + 44, { font: fnt(skin, 600, 30), color: C.muted, align: "center", maxW: slot - 10 });
    ctx.restore();
  });
  endCardEnvelope(ctx);
}

export default {
  type: "barChart",
  category: "Pantallas",
  captions: "option",
  label: "Gráfica de barras",
  timelineLabel: "Pantalla: gráfica de barras",
  description: "Barras que crecen en escalera y cuentan hasta su cifra; una barra resalta",
  brief: [
    "Qué: Barras verticales que crecen en escalera y cuentan hasta su cifra; una barra resalta.",
    "Cuándo: comparar de 2 a 6 categorías con una cifra cada una. No usar: una serie en el tiempo (usa lineChart) ni dos grupos lado a lado (usa comparisonBars).",
    "Coreografía: ejes aparecen, las barras crecen en escalera 4 cuadros entre una y otra, cada cifra aparece al llegar su barra y la barra destacada cierra la historia.",
    "Gusto: cifras grandes y legibles sobre cada barra; las etiquetas nunca se encimen aunque las barras sean cortas; una sola barra en acento.",
    "Datos: fictional o screenshot; nunca datos reales de un cliente."
  ].join("\n"),
  icon: "M5 20V12M10 20V6M15 20v-9M20 20V9",
  textKey: "title",
  defaults: (t, end) => ({
    type: "barChart", in: t, out: Math.min(t + 3.0, end), title: "Ventas por mes", format: "compact", prefix: "$", highlight: 3,
    rows: [
      { label: "Ene", value: 412000 },
      { label: "Feb", value: 538000 },
      { label: "Mar", value: 467000 },
      { label: "Abr", value: 612000 },
      { label: "May", value: 584000 }
    ],
    source: { ...FICTIONAL }
  }),
  fields: [
    { key: "title", label: "Qué mide", kind: "text" },
    { key: "rows", label: "Barras (2 a 6)", kind: "blocks", prop: "rows", min: BAR.minBars, max: BAR.maxBars, blank: () => ({ label: "Nuevo", value: 0 }), fields: () => [
      { key: "label", label: "Nombre (ej. Ene)", kind: "text" },
      { key: "value", label: "Cifra", kind: "number", step: 1 }
    ], name: (r) => r.label || "Barra" },
    { key: "format", label: "Formato de las cifras", kind: "select", options: CHART_FORMATS, opt: true, ph: "dinero" },
    { key: "prefix", label: "Antes de la cifra (opcional)", kind: "text", opt: true },
    { key: "suffix", label: "Después de la cifra (opcional)", kind: "text", opt: true },
    { key: "highlight", label: "Barra que resalta", kind: "index", of: "rows", name: (r) => r.label, opt: true }
  ],
  screen: UI_SCREEN(false),
  source: UI_SOURCE,
  pin: null,
  minScale: 0.88,
  thumbAt: 0.65,
  timeline: barTimeline,
  size: () => ({ w: BAR.w, h: BAR.h }),
  showsNumbers: () => true,
  validate(el, tag) {
    const n = (el.rows ?? []).length;
    const errors = seriesProblems(el.rows, tag, { min: BAR.minBars, max: BAR.maxBars }), warnings = [];
    if (!el.title) errors.push(`${tag}: necesita qué mide`);
    if (!idx(el, "highlight", n)) errors.push(`${tag}: la barra que resalta no existe`);
    if (el.format !== undefined && !CHART_FORMATS.some(([k]) => k === el.format)) errors.push(`${tag}: el formato no existe`);
    // a value label is 48 px: warn when the widest one cannot fit its slot even at that size (approx. 0.6 em per character)
    if (n >= BAR.minBars && n <= BAR.maxBars && errors.length === 0) {
      const fmt = el.format ?? "money";
      const longest = Math.max(...(el.rows ?? []).map((r) => statText({ value: r.value, format: fmt, prefix: el.prefix, suffix: el.suffix }, 1).length));
      if (longest * 0.6 * VALUE_PX > slotWidthOf(n) - 8) warnings.push(`${tag}: la cifra más larga no cabe en ${n} barras; usa formato Corto o menos barras`);
    }
    return { errors, warnings };
  },
  texts(el, add) {
    add(el.title);
    for (const r of el.rows ?? []) add(r.label);
  },
  events(el, rect, { beats: B, add }) {
    add(B.blob[0], "pop");
    if (hasHighlight(el)) add(B.pulse[0], "pop");
  },
  draw: (ctx, el, t, env) => drawBar(ctx, el, env.ts, env.tl, env.rect, env),
};
