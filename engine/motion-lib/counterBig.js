// Element "counterBig" of the motion library: un número gigante que cuenta hasta su valor, con prefijo / sufijo y una línea debajo.
// One file = one element type (see engine/README.md "Cómo agregar un elemento"). Timeline beats are in DESIGN seconds; the registry
// (index.js) scales them to [in, out]. Drawing is a pure function of the local time.
import { seg, expoOut, statText, parseMoney } from "../ui-motion.js";
import { fnt, text } from "./_kit.js";
import { UI_SCREEN, UI_SOURCE, FICTIONAL } from "./_fields.js";
import { CHART_FORMATS, cardEnvelope, endCardEnvelope, countUp, COUNT_FROM } from "./_charts.js";

export const BIG = { w: 900, h: 400, pad: 56, numY: 186, labelY: 318, maxPx: 260, minPx: 120 };
// Every text the number passes through (the count steps and the final text): the number is never smaller than BIG.minPx, so one that
// cannot fit the card at that size is an error (approx. 0.55 em per character).
const countTexts = (fe) => [...Array.from({ length: 20 }, (_, i) => countUp(fe, (i + 1) / 20, { from: COUNT_FROM })), statText(fe, 1)];

// The count ends at 1.3 s; the label is in by 0.85 s (right after the number shows). Both inside 0.6 * Ld = 1.44 s, so the thumbnail shows the final state.
export const bigTimeline = () => ({
  Ld: 2.4,
  b: { blob: [0, 0.5], count: [0.2, 1.3], label: [0.45, 0.85], exit: [2.05, 2.4] }
});

function drawBig(ctx, el, ts, tl, rect, env) {
  const { skin } = env, C = skin.colors, b = tl.b;
  const w = rect.w;
  cardEnvelope(ctx, el, tl, ts, rect, skin);
  const fe = { value: el.value, format: el.format ?? "int", prefix: el.prefix, suffix: el.suffix };
  // the number is sized once, from its FINAL text, so its size never changes while it counts (only the digits do)
  const final = statText(fe, 1);
  let px = BIG.maxPx;
  ctx.font = fnt(skin, 700, px);
  while (px > BIG.minPx && ctx.measureText(final).width > w - 2 * BIG.pad) { px -= 6; ctx.font = fnt(skin, 700, px); }
  const kc = seg(ts, b.count[0], b.count[1]);
  // nothing is drawn before the count starts; then it rolls up MONOTONICALLY and lands on the exact final text
  const shown = countUp(fe, kc, { from: COUNT_FROM });
  if (shown) {
    ctx.save();
    ctx.globalAlpha *= Math.min(1, kc * 4);
    text(ctx, shown, w / 2, BIG.numY, { font: fnt(skin, 700, px), color: C.accent, align: "center" });
    ctx.restore();
  }
  const la = seg(ts, b.label[0], b.label[1]);
  if (la > 0 && el.label) {
    ctx.save();
    ctx.globalAlpha *= expoOut(la);
    text(ctx, el.label, w / 2, BIG.labelY, { font: fnt(skin, 600, 44), color: C.ink, align: "center", maxW: w - 2 * BIG.pad });
    ctx.restore();
  }
  endCardEnvelope(ctx);
}

export default {
  type: "counterBig",
  category: "KPIs y gráficas",
  captions: "option",
  label: "Cifra gigante",
  timelineLabel: "Gráfica: cifra gigante",
  description: "Un número enorme que cuenta hasta su valor, con una línea debajo",
  brief: [
    "Qué: Un número gigante que cuenta hasta su valor, con una línea debajo que dice qué cuenta.",
    "Cuándo: una sola cifra que es el mensaje. No usar: varias cifras (usa kpiGrid) ni una cifra con tendencia (usa sparkCard).",
    "Coreografía: la tarjeta nace, el número aparece ya visible y cuenta hasta su valor, la etiqueta entra poco después con claridad y la salida dura 30 % menos.",
    "Gusto: el número es el héroe en acento; la etiqueta es chica, legible y no tenue; nunca un cero falso al inicio.",
    "Datos: fictional o screenshot; nunca datos reales de un cliente."
  ].join("\n"),
  icon: "M5 17h14M8 7h8",
  textKey: "label",
  defaults: (t, end) => ({
    type: "counterBig", in: t, out: Math.min(t + 2.4, end), value: 32, format: "int", label: "unidades disponibles", source: { ...FICTIONAL }
  }),
  fields: [
    { key: "value", label: "Cifra", kind: "number", step: 1 },
    { key: "format", label: "Formato", kind: "select", options: CHART_FORMATS, opt: true, ph: "número" },
    { key: "prefix", label: "Antes de la cifra (opcional)", kind: "text", opt: true },
    { key: "suffix", label: "Después de la cifra (opcional)", kind: "text", opt: true },
    { key: "label", label: "Qué cuenta (una línea)", kind: "text" }
  ],
  screen: UI_SCREEN(false),
  source: UI_SOURCE,
  pin: null,
  minScale: 0.76,
  thumbAt: 0.65,
  timeline: bigTimeline,
  size: () => ({ w: BIG.w, h: BIG.h }),
  showsNumbers: () => true,
  validate(el, tag) {
    const errors = [], warnings = [];
    if (!el.label) errors.push(`${tag}: necesita qué cuenta`);
    if (parseMoney(el.value) === null) errors.push(`${tag}: necesita una cifra`);
    if (el.format !== undefined && !CHART_FORMATS.some(([k]) => k === el.format)) errors.push(`${tag}: el formato no existe`);
    if (`${el.prefix ?? ""}${el.suffix ?? ""}`.length > 4) warnings.push(`${tag}: el prefijo o sufijo es largo; ponlo en la etiqueta si no cabe`);
    if (errors.length === 0) {
      const fe = { value: el.value, format: el.format ?? "int", prefix: el.prefix, suffix: el.suffix };
      const longest = Math.max(...countTexts(fe).map((s) => s.length));
      if (longest * 0.55 * BIG.minPx > BIG.w - 2 * BIG.pad) errors.push(`${tag}: la cifra es muy larga para la tarjeta; usa formato Corto`);
    }
    return { errors, warnings };
  },
  texts(el, add) {
    add(el.label);
  },
  events(el, rect, { beats: B, add }) {
    add(B.blob[0], "pop");
  },
  draw: (ctx, el, t, env) => drawBig(ctx, el, env.ts, env.tl, env.rect, env),
};
