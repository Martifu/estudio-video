// Element "kpiGrid" of the motion library: una cuadrícula de 2 a 4 indicadores (KPIs). Cada tarjeta nace escalonada, su cifra cuenta
// hasta el valor exacto y una insignia de cambio (verde o rojo) aparece al final. One file = one element type (see engine/README.md
// "Cómo agregar un elemento"). Timeline beats are in DESIGN seconds; the registry (index.js) scales them to [in, out]. Pure function of t.
import { seg, expoOut, statText } from "../ui-motion.js";
import { rr, fnt, text } from "./_kit.js";
import { UI_SCREEN, UI_SOURCE, FICTIONAL } from "./_fields.js";
import { CHART_FORMATS, cardEnvelope, endCardEnvelope, countUp, deltaBadge, COUNT_FROM } from "./_charts.js";

export const KPI = { w: 900, minN: 2, maxN: 4, tileH: 260, gap: 24, pad: 56, head: 150, tail: 56 };
const tileW = () => (KPI.w - 2 * KPI.pad - KPI.gap) / 2;
const rowsOf = (n) => Math.ceil(Math.max(1, n) / 2);
const heightOf = (n) => KPI.head + rowsOf(n) * KPI.tileH + (rowsOf(n) - 1) * KPI.gap + KPI.tail;

// Birth of tile i (scale with a small overshoot + alpha), its count and its delta badge. Beats are design seconds.
const TILE_STEP = 0.12;
// Every count and delta lands before ~0.65 of Ld (the thumbnail frame); the exit is 0.35 s (shorter than the entrance) and ends at Ld.
export function tlFor() {
  const Ld = 3.2;
  return {
    Ld,
    b: {
      blob: [0, 0.5],
      born: { start: 0.12, step: TILE_STEP, dur: 0.5 },
      count: { start: 0.35, step: TILE_STEP, dur: 0.9 },
      delta: { start: 1.1, step: TILE_STEP, dur: 0.45 },
      exit: [Ld - 0.35, Ld]
    }
  };
}

function drawKpi(ctx, el, ts, tl, rect, env) {
  const { skin } = env, C = skin.colors, b = tl.b;
  const kpis = (el.kpis ?? []).slice(0, KPI.maxN);
  const n = kpis.length;
  cardEnvelope(ctx, el, tl, ts, rect, skin);
  if (el.title) text(ctx, el.title, KPI.pad, 84, { font: fnt(skin, 700, 38), color: C.ink, maxW: KPI.w - 2 * KPI.pad });
  if (!n) { endCardEnvelope(ctx); return; }
  const tw = tileW();
  const fe = (k) => ({ value: k.value, format: k.format ?? "int", prefix: k.prefix, suffix: k.suffix });
  // one value size for every tile: the widest FINAL value fits the tile, never below 48 px (no jitter while counting)
  const finals = kpis.flatMap((k) => [...Array.from({ length: 20 }, (_, j) => countUp(fe(k), (j + 1) / 20, { from: COUNT_FROM })), statText(fe(k), 1)]);
  const widest = (px) => { ctx.font = fnt(skin, 700, px); return Math.max(0, ...finals.map((s) => ctx.measureText(s).width)); };
  let px = 88;
  while (px > 48 && widest(px) > tw - 64) px -= 4;
  px = Math.max(48, px);
  kpis.forEach((k, i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const lastOdd = n % 2 === 1 && i === n - 1; // a lone last tile spans the full width
    const x = KPI.pad + col * (tw + KPI.gap);
    const y = KPI.head + row * (KPI.tileH + KPI.gap);
    const w = lastOdd ? KPI.w - 2 * KPI.pad : tw;
    const birth = seg(ts, b.born.start + i * b.born.step, b.born.start + i * b.born.step + b.born.dur);
    if (birth <= 0) return;
    // a rise, not a bounce: from 40 % opacity and 24 px below, expoOut (the card envelope is the only overshoot)
    const rise = expoOut(birth);
    ctx.save();
    ctx.globalAlpha *= 0.4 + 0.6 * rise;
    ctx.translate(x, y + 24 * (1 - rise));
    ctx.fillStyle = C.panel;
    rr(ctx, 0, 0, w, KPI.tileH, 28);
    ctx.fill();
    text(ctx, k.label ?? "", 32, 52, { font: fnt(skin, 600, 30), color: C.muted, maxW: w - 64 });
    const kc = seg(ts, b.count.start + i * b.count.step, b.count.start + i * b.count.step + b.count.dur);
    const shown = countUp(fe(k), kc, { from: COUNT_FROM });
    if (shown) text(ctx, shown, 32, 138, { font: fnt(skin, 700, px), color: C.ink, maxW: w - 64 });
    const dg = seg(ts, b.delta.start + i * b.delta.step, b.delta.start + i * b.delta.step + b.delta.dur);
    if (k.delta?.text && dg > 0) deltaBadge(ctx, skin, k.delta.text, k.delta.dir, 32, 216, dg);
    ctx.restore();
  });
  endCardEnvelope(ctx);
}

export default {
  type: "kpiGrid",
  category: "KPIs y gráficas",
  captions: "option",
  label: "Indicadores (KPIs)",
  timelineLabel: "Indicadores en cuadrícula",
  description: "De 2 a 4 indicadores que nacen escalonados; cada cifra cuenta hasta su valor",
  brief: [
    "Qué: De 2 a 4 indicadores (KPIs) en cuadrícula, cada cifra grande con su etiqueta chica.",
    "Cuándo: un resumen de 2–4 métricas de un mismo periodo. No usar: una sola cifra (usa counterBig) ni una serie en el tiempo (usa lineChart).",
    "Coreografía: la tarjeta nace; cada indicador entra escalonado 4 cuadros y su cifra cuenta de forma visible; la salida dura 30 % menos que la entrada.",
    "Gusto: una cifra por celda, grande y de acento; etiquetas chicas y apagadas; nada de bordes ni degradados; las celdas comparten radio y sombra.",
    "Datos: source screenshot o ficticio; nunca datos reales de un cliente."
  ].join("\n"),
  icon: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  textKey: "title",
  defaults: (t, end) => ({
    type: "kpiGrid", in: t, out: Math.min(t + 3.2, end), title: "Resumen del mes",
    kpis: [
      { label: "Ventas", value: 1284000, format: "money", delta: { text: "+12.4%", dir: "up" } },
      { label: "Citas agendadas", value: 128, format: "int", delta: { text: "+18%", dir: "up" } },
      { label: "Tasa de cierre", value: 18.4, format: "pct", delta: { text: "-2.1 pts", dir: "down" } },
      { label: "Ticket promedio", value: 612000, format: "compact", prefix: "$", delta: { text: "+4%", dir: "up" } }
    ],
    source: { ...FICTIONAL }
  }),
  fields: [
    { key: "title", label: "Título (opcional)", kind: "text", opt: true },
    { key: "kpis", label: "Indicadores (2 a 4)", kind: "blocks", prop: "kpis", min: KPI.minN, max: KPI.maxN, blank: () => ({ label: "Nuevo", value: 0, format: "int" }), fields: () => [
      { key: "label", label: "Qué mide (ej. Ventas)", kind: "text" },
      { key: "value", label: "Cifra", kind: "number", step: 1 },
      { key: "format", label: "Formato", kind: "select", options: CHART_FORMATS, opt: true, ph: "número" },
      { key: "prefix", label: "Antes de la cifra (opcional)", kind: "text", opt: true },
      { key: "suffix", label: "Después de la cifra (opcional)", kind: "text", opt: true },
      { key: "delta.text", label: "Cambio (ej. +12%)", kind: "text", opt: true },
      { key: "delta.dir", label: "El cambio es", kind: "select", options: [["up", "Sube (verde)"], ["down", "Baja (rojo)"]], opt: true, ph: "sube" }
    ], name: (r) => r.label || "Indicador" }
  ],
  screen: UI_SCREEN(false),
  source: UI_SOURCE,
  thumbAt: 0.65,
  timeline: tlFor,
  size: (el) => ({ w: KPI.w, h: heightOf((el.kpis ?? []).length) }),
  minScale: 0.88,
  showsNumbers: () => true,
  validate(el, tag) {
    const kpis = el.kpis ?? [];
    const errors = [], warnings = [];
    if (kpis.length < KPI.minN || kpis.length > KPI.maxN) errors.push(`${tag}: necesita de ${KPI.minN} a ${KPI.maxN} indicadores (tiene ${kpis.length})`);
    kpis.forEach((k, i) => {
      if (!k || !String(k.label ?? "").trim()) errors.push(`${tag}: el indicador ${i + 1} necesita un nombre`);
      if (!k || !Number.isFinite(Number(k.value)) || k.value === "" || k.value === null) errors.push(`${tag}: el indicador ${i + 1} necesita una cifra`);
      if (k && k.format !== undefined && !CHART_FORMATS.some(([f]) => f === k.format)) errors.push(`${tag}: el formato del indicador ${i + 1} no existe`);
      if (k?.delta?.dir !== undefined && !["up", "down"].includes(k.delta.dir)) errors.push(`${tag}: el cambio del indicador ${i + 1} debe subir o bajar`);
    });
    return { errors, warnings };
  },
  texts(el, add) {
    add(el.title);
    for (const k of el.kpis ?? []) { add(k.label); add(k.delta?.text); }
  },
  events(el, rect, { beats: B, add }) {
    add(B.blob[0], "pop");
  },
  draw: (ctx, el, t, env) => drawKpi(ctx, el, env.ts, env.tl, env.rect, env),
};
