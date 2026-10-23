// Element "funnelChart" of the motion library: etapas de un embudo que se estrechan de arriba abajo; cada una con su cifra y su % de conversión.
// One file = one element type (see engine/README.md "Cómo agregar un elemento"). Timeline beats are in DESIGN seconds; the registry
// (index.js) scales them to [in, out]. Drawing is a pure function of the local time.
import { seg, parseMoney, statText } from "../ui-motion.js";
import { fnt, text } from "./_kit.js";
import { UI_SCREEN, UI_SOURCE, FICTIONAL } from "./_fields.js";
import { CHART_FORMATS, cardEnvelope, endCardEnvelope, growBar, countUp, seriesProblems, COUNT_FROM } from "./_charts.js";

export const FUN = { w: 900, h: 720, pad: 56, top: 150, rowH: 108, barH: 56, shapeX: 56, shapeW: 480, minFrac: 0.45, minStages: 3, maxStages: 5 };

// The last count ends by 1.7 s (5 stages, 0.15 s step): inside 0.6 * Ld = 1.92 s, so the thumbnail (0.65 * Ld) shows every number.
export const funTimeline = () => ({
  Ld: 3.2,
  b: {
    blob: [0, 0.5],
    stage: { start: 0.3, step: 0.15, dur: 0.5 },
    count: { start: 0.45, step: 0.15, dur: 0.65 },
    exit: [2.85, 3.2]
  }
});

const stagesOf = (el) => (el.stages ?? []).slice(0, FUN.maxStages);
const COUNT_PX = 48; // stage counts never go below 48 px
// Every text a count passes through (the count steps and the final text): the count must fit to the right of its bar, whatever the step.
const countTexts = (fe) => [...Array.from({ length: 20 }, (_, i) => countUp(fe, (i + 1) / 20)), statText(fe, 1)];
// Spanish words of the stage vocabulary (seriesProblems speaks of "filas")
const stageWords = (s) => s.replace(/\bfilas\b/g, "etapas").replace(/\bfila\b/g, "etapa");
/** Conversion of stage i from stage i-1 in percent, one decimal (null for the first stage or when the previous count is 0). */
export function conversionOf(rows, i) {
  if (i === 0) return null;
  const prev = parseMoney(rows[i - 1]?.value), cur = parseMoney(rows[i]?.value);
  if (!(prev > 0) || cur === null) return null;
  return Math.round((cur / prev) * 1000) / 10;
}

function drawFunnel(ctx, el, ts, tl, rect, env) {
  const { skin } = env, C = skin.colors, b = tl.b;
  const rows = stagesOf(el);
  const n = rows.length;
  const w = rect.w, h = rect.h;
  cardEnvelope(ctx, el, tl, ts, rect, skin);
  text(ctx, el.title ?? "", FUN.pad, 84, { font: fnt(skin, 700, 38), color: C.ink, maxW: w - 2 * FUN.pad });
  if (!n) { endCardEnvelope(ctx); return; }
  const fmt = el.format ?? "int";
  const vals = rows.map((r) => Math.max(0, parseMoney(r.value) ?? 0));
  const maxV = Math.max(1e-9, ...vals);
  const right = w - FUN.pad;
  rows.forEach((r, i) => {
    const top = FUN.top + i * FUN.rowH;
    const g = growBar(ts, b.stage, i);
    const kc = seg(ts, b.count.start + i * b.count.step, b.count.start + i * b.count.step + b.count.dur);
    // the stage narrows with its count, never below minFrac of the widest one (a funnel, not a bar chart)
    const bw = FUN.shapeW * (FUN.minFrac + (1 - FUN.minFrac) * (vals[i] / maxV));
    const bx = FUN.shapeX + (FUN.shapeW - bw) / 2;
    const by = top + 44;
    // stage name, top left; its conversion, top right; the bar wipes in from the left
    ctx.save();
    ctx.globalAlpha *= g;
    text(ctx, r.label ?? "", FUN.pad, top + 22, { font: fnt(skin, 600, 32), color: C.ink, maxW: right - FUN.pad - 240 });
    ctx.restore();
    const cv = conversionOf(rows, i);
    const pctShown = cv === null ? "" : countUp({ value: cv, format: "pct" }, kc, { from: COUNT_FROM });
    if (pctShown) {
      ctx.save();
      ctx.globalAlpha *= Math.min(1, kc * 4);
      text(ctx, pctShown, right, top + 22, { font: fnt(skin, 700, 32), color: C.accent, align: "right" });
      ctx.restore();
    }
    ctx.save();
    ctx.beginPath();
    ctx.rect(bx, by, bw * g, FUN.barH);
    ctx.clip();
    ctx.fillStyle = C.primary;
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, FUN.barH, Math.min(14, FUN.barH / 2));
    ctx.fill();
    ctx.restore();
    // the count sits just past the bar's right edge, on its vertical middle
    const shown = countUp({ value: r.value, format: fmt }, kc, { from: COUNT_FROM });
    if (shown) {
      ctx.save();
      ctx.globalAlpha *= Math.min(1, kc * 4);
      text(ctx, shown, bx + bw + 24, by + FUN.barH / 2, { font: fnt(skin, 700, COUNT_PX), color: C.ink });
      ctx.restore();
    }
  });
  endCardEnvelope(ctx);
}

export default {
  type: "funnelChart",
  category: "KPIs y gráficas",
  captions: "option",
  label: "Embudo",
  timelineLabel: "Gráfica: embudo",
  description: "Etapas que se estrechan; cada una con su cifra y su porcentaje de conversión",
  brief: [
    "Qué: Etapas de un embudo que se estrechan; cada una con su cifra y su porcentaje de conversión.",
    "Cuándo: un proceso de 3 a 5 etapas que pierde gente en cada paso. No usar: partes de un todo (usa donut) ni una serie en el tiempo (usa lineChart).",
    "Coreografía: la tarjeta nace; cada etapa entra de arriba abajo en 4 cuadros con su cifra; los porcentajes de conversión aparecen entre etapas al final.",
    "Gusto: etapas de ancho decreciente en tonos claramente distintos; etiquetas que no se encimen; un solo acento en la etapa final.",
    "Datos: fictional o screenshot; nunca datos reales de un cliente."
  ].join("\n"),
  icon: "M4 5h16M7 11h10M10 17h4",
  textKey: "title",
  defaults: (t, end) => ({
    type: "funnelChart", in: t, out: Math.min(t + 3.2, end), title: "Del anuncio a la venta", format: "int",
    stages: [
      { label: "Visitas al sitio", value: 4800 },
      { label: "Pidieron información", value: 1260 },
      { label: "Agendaron cita", value: 310 },
      { label: "Compraron", value: 92 }
    ],
    source: { ...FICTIONAL }
  }),
  fields: [
    { key: "title", label: "Qué mide", kind: "text" },
    { key: "stages", label: "Etapas (3 a 5, de arriba abajo)", kind: "blocks", prop: "stages", min: FUN.minStages, max: FUN.maxStages, blank: () => ({ label: "Nueva etapa", value: 0 }), fields: () => [
      { key: "label", label: "Nombre (ej. Visitas al sitio)", kind: "text" },
      { key: "value", label: "Cifra", kind: "number", step: 1 }
    ], name: (r) => r.label || "Etapa" },
    { key: "format", label: "Formato de las cifras", kind: "select", options: CHART_FORMATS, opt: true, ph: "número" }
  ],
  screen: UI_SCREEN(false),
  source: UI_SOURCE,
  pin: null,
  thumbAt: 0.65,
  timeline: funTimeline,
  size: () => ({ w: FUN.w, h: FUN.h }),
  minScale: 0.76,
  showsNumbers: () => true,
  validate(el, tag) {
    const rows = el.stages ?? [];
    const errors = seriesProblems(rows, tag, { min: FUN.minStages, max: FUN.maxStages }).map(stageWords), warnings = [];
    if (!el.title) errors.push(`${tag}: necesita qué mide`);
    if (el.format !== undefined && !CHART_FORMATS.some(([k]) => k === el.format)) errors.push(`${tag}: el formato no existe`);
    // the count of every stage must fit to the right of its bar (the widest bar is the first stage, at most)
    if (errors.length === 0) {
      const fmt = el.format ?? "int";
      const vals = rows.map((r) => Math.max(0, parseMoney(r.value) ?? 0));
      const maxV = Math.max(1e-9, ...vals);
      rows.forEach((r, i) => {
        const bw = FUN.shapeW * (FUN.minFrac + (1 - FUN.minFrac) * (vals[i] / maxV));
        const bx = FUN.shapeX + (FUN.shapeW - bw) / 2;
        const longest = Math.max(...countTexts({ value: r.value, format: fmt }).map((s) => s.length));
        if (bx + bw + 24 + longest * 0.55 * COUNT_PX > FUN.w - FUN.pad) errors.push(`${tag}: la cifra de "${r.label}" no cabe a la derecha de su barra; usa formato Corto o cifras más cortas`);
      });
    }
    // a later stage above the one before it means a conversion over 100 %: advice, not an error
    rows.forEach((r, i) => {
      if (i > 0 && conversionOf(rows, i) > 100) warnings.push(`${tag}: "${r.label}" es mayor que la etapa anterior (la conversión pasa de 100 %)`);
    });
    return { errors, warnings };
  },
  texts(el, add) {
    add(el.title);
    for (const r of el.stages ?? []) add(r.label);
  },
  events(el, rect, { beats: B, add }) {
    add(B.blob[0], "pop");
  },
  draw: (ctx, el, t, env) => drawFunnel(ctx, el, env.ts, env.tl, env.rect, env),
};
