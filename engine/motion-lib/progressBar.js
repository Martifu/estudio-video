// Element "progressBar" of the motion library: una barra horizontal que se llena hasta el avance, con una marca de meta y un hito opcional.
// The value counts up and the fill grows with the same ease, so both land exactly on the final value. One file = one element type
// (see engine/README.md "Cómo agregar un elemento"). Timeline beats are in DESIGN seconds; the registry (index.js) scales them. Pure function of t.
import { seg, expoOut, statText, parseMoney } from "../ui-motion.js";
import { rr, fnt, text } from "./_kit.js";
import { UI_SCREEN, UI_SOURCE, FICTIONAL } from "./_fields.js";
import { CHART_FORMATS, cardEnvelope, endCardEnvelope, countUp } from "./_charts.js";

export const BAR = { w: 900, h: 480, pad: 56, track: 56, cy: 304 };
const LABEL_PX = 30; // goal and milestone labels: 30 px, never smaller
const TRACK_W = BAR.w - 2 * BAR.pad;

export const barTimeline = () => ({
  Ld: 2.8,
  b: {
    blob: [0, 0.5],
    label: [0.15, 0.5],
    track: [0.1, 0.5],
    count: [0.3, 1.5],
    goal: [0.5, 0.9],
    milestone: [1.2, 1.55],
    exit: [2.45, 2.8]
  }
});

// Same curve as countUp (1 - (1 - k)^3): the fill and the number move together and land on the final value.
const ease = (k) => 1 - Math.pow(1 - Math.min(1, Math.max(0, k)), 3);

// Anchor of a marker label: centred on its marker, but pushed inside the card at the edges.
function anchorOf(x) {
  if (x < BAR.pad + 150) return { x: BAR.pad, align: "left" };
  if (x > BAR.w - BAR.pad - 150) return { x: BAR.w - BAR.pad, align: "right" };
  return { x, align: "center" };
}

function drawProgress(ctx, el, ts, tl, rect, env) {
  const { skin } = env, C = skin.colors, b = tl.b;
  const w = rect.w, h = rect.h;
  cardEnvelope(ctx, el, tl, ts, rect, skin);
  const value = Math.max(0, parseMoney(el.value) ?? 0);
  const goal = Math.max(0, parseMoney(el.goal) ?? 0);
  const fe = { value: el.value, format: el.format ?? "money", prefix: el.prefix, suffix: el.suffix };
  const M = Math.max(goal, value, 1e-9); // the bar scale: the goal or the value, whichever is bigger
  const x0 = BAR.pad, cy = BAR.cy, top = cy - BAR.track / 2;
  const at = (v) => x0 + TRACK_W * (v / M);
  if (el.label) {
    ctx.save();
    ctx.globalAlpha *= expoOut(seg(ts, b.label[0], b.label[1]));
    text(ctx, el.label, BAR.pad, 84, { font: fnt(skin, 700, 38), color: C.ink, maxW: w - 2 * BAR.pad });
    ctx.restore();
  }
  // the value: the widest possible final text (the goal scale) decides the size, never below 48 px
  const kc = seg(ts, b.count[0], b.count[1]);
  let px = 96;
  ctx.font = fnt(skin, 700, px);
  while (px > 48 && ctx.measureText(statText(fe, 1)).width > TRACK_W * 0.8) { px -= 4; ctx.font = fnt(skin, 700, px); }
  // the number appears once the fill is 60 % there, so it never starts at a meaningless 0; it always equals the fill's share
  const shown = ease(kc) >= 0.6 ? countUp(fe, kc) : "";
  if (shown) {
    ctx.save();
    ctx.globalAlpha *= Math.min(1, (ease(kc) - 0.6) * 8);
    text(ctx, shown, BAR.pad, 186, { font: fnt(skin, 700, px), color: C.ink });
    ctx.restore();
  }
  // track (fades in) and fill (grows with the count)
  const ta = expoOut(seg(ts, b.track[0], b.track[1]));
  if (ta > 0) {
    ctx.save();
    ctx.globalAlpha *= ta;
    ctx.fillStyle = C.line;
    rr(ctx, x0, top, TRACK_W, BAR.track, BAR.track / 2);
    ctx.fill();
    ctx.restore();
  }
  const fillW = TRACK_W * (value / M) * ease(kc);
  if (fillW >= 1 && ta > 0) {
    ctx.save();
    ctx.globalAlpha *= ta;
    ctx.fillStyle = goal > 0 && value >= goal ? C.success : C.primary;
    rr(ctx, x0, top, Math.max(BAR.track, fillW), BAR.track, BAR.track / 2);
    ctx.fill();
    ctx.restore();
  }
  // markers: a tick across the track and a label below it. The milestone label drops to a second row when it would run into the goal label.
  const hasM = el.milestone !== undefined && el.milestone !== null && el.milestone !== "";
  const hasG = goal > 0;
  const mx = hasM ? at(parseMoney(el.milestone) ?? 0) : 0;
  const gx = hasG ? at(goal) : 0;
  const mText = hasM ? `Hito ${statText({ ...fe, value: el.milestone }, 1)}` : "";
  const gText = hasG ? `Meta ${statText({ ...fe, value: goal }, 1)}` : "";
  const boxOf = (t, x) => {
    ctx.font = fnt(skin, 600, LABEL_PX);
    const a = anchorOf(x), wd = Math.min(360, ctx.measureText(t).width);
    const l = a.align === "left" ? a.x : a.align === "right" ? a.x - wd : a.x - wd / 2;
    return [l, l + wd];
  };
  const mRow = hasM && hasG && (() => { const [m0, m1] = boxOf(mText, mx), [g0, g1] = boxOf(gText, gx); return m0 < g1 + 24 && g0 < m1 + 24; })() ? 1 : 0;
  const ma = seg(ts, b.milestone[0], b.milestone[1]);
  if (hasM && ma > 0) {
    const a = anchorOf(mx);
    ctx.save();
    ctx.globalAlpha *= expoOut(ma);
    ctx.strokeStyle = C.ink; ctx.lineWidth = 6; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(mx, top - 14); ctx.lineTo(mx, top + BAR.track + 14); ctx.stroke();
    text(ctx, mText, a.x, cy + 80 + 46 * mRow, { font: fnt(skin, 600, LABEL_PX), color: C.ink, align: a.align, maxW: 360 });
    ctx.restore();
  }
  const ga = seg(ts, b.goal[0], b.goal[1]);
  if (hasG && ga > 0) {
    const a = anchorOf(gx);
    ctx.save();
    ctx.globalAlpha *= expoOut(ga);
    ctx.strokeStyle = C.ink; ctx.lineWidth = 6; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(gx, top - 14); ctx.lineTo(gx, top + BAR.track + 14); ctx.stroke();
    text(ctx, gText, a.x, cy + 80, { font: fnt(skin, 600, LABEL_PX), color: C.muted, align: a.align, maxW: 360 });
    ctx.restore();
  }
  endCardEnvelope(ctx);
}

export default {
  type: "progressBar",
  category: "KPIs y gráficas",
  captions: "option",
  label: "Barra de avance",
  timelineLabel: "Barra de avance hacia una meta",
  description: "Una barra que se llena hasta el avance, con la marca de la meta y un hito",
  brief: [
    "Qué: Una barra que se llena hasta un avance, con la marca de la meta y un hito.",
    "Cuándo: avance lineal hacia una meta con un hito intermedio. No usar: un solo porcentaje grande (usa progressRing).",
    "Coreografía: la barra nace, se llena con expoOut, la meta y el hito aparecen después y el porcentaje cuenta al llegar al avance.",
    "Gusto: la pista clara, el avance en acento, etiquetas de meta y de hito legibles y separadas; nunca se encima nada con la barra.",
    "Datos: fictional o screenshot; cifras de un dato real del usuario, nunca de un cliente real."
  ].join("\n"),
  icon: "M3 12h13M19 7v10",
  textKey: "label",
  defaults: (t, end) => ({
    type: "progressBar", in: t, out: Math.min(t + 2.8, end), label: "Ventas del trimestre",
    value: 1231000, goal: 1800000, format: "money", milestone: 900000, source: { ...FICTIONAL }
  }),
  fields: [
    { key: "label", label: "Qué mide", kind: "text" },
    { key: "value", label: "Avance actual", kind: "number", step: 1, min: 0 },
    { key: "goal", label: "Meta", kind: "number", step: 1, min: 0 },
    { key: "format", label: "Formato de las cifras", kind: "select", options: CHART_FORMATS, opt: true, ph: "dinero" },
    { key: "prefix", label: "Antes de la cifra (opcional)", kind: "text", opt: true },
    { key: "suffix", label: "Después de la cifra (opcional)", kind: "text", opt: true },
    { key: "milestone", label: "Hito intermedio (opcional, en la misma unidad)", kind: "number", step: 1, min: 0, opt: true }
  ],
  screen: UI_SCREEN(false),
  source: UI_SOURCE,
  minScale: 0.88,
  thumbAt: 0.65,
  timeline: barTimeline,
  size: () => ({ w: BAR.w, h: BAR.h }),
  showsNumbers: () => true,
  validate(el, tag) {
    const errors = [], warnings = [];
    const value = parseMoney(el.value), goal = parseMoney(el.goal);
    if (!String(el.label ?? "").trim()) errors.push(`${tag}: necesita qué mide`);
    if (value === null || value < 0) errors.push(`${tag}: el avance debe ser una cifra de cero o más`);
    if (goal === null || goal <= 0) errors.push(`${tag}: la meta debe ser una cifra mayor que cero`);
    if (el.format !== undefined && !CHART_FORMATS.some(([k]) => k === el.format)) errors.push(`${tag}: el formato no existe`);
    if (el.milestone !== undefined && el.milestone !== null && el.milestone !== "") {
      const m = parseMoney(el.milestone);
      if (m === null || m <= 0 || (goal !== null && m > goal)) errors.push(`${tag}: el hito debe estar entre cero y la meta`);
    }
    if (value !== null && goal !== null && value > goal) warnings.push(`${tag}: el avance ya supera la meta`);
    const ms = parseMoney(el.milestone);
    if (ms !== null && goal !== null && goal > 0 && ms / goal > 0.8) warnings.push(`${tag}: el hito queda muy cerca de la meta y las etiquetas se encimarán`);
    return { errors, warnings };
  },
  texts(el, add) {
    add(el.label);
  },
  events(el, rect, { beats: B, add }) {
    add(B.blob[0], "pop");
    if (el.milestone !== undefined && el.milestone !== null && el.milestone !== "") add(B.milestone[0], "pop");
  },
  draw: (ctx, el, t, env) => drawProgress(ctx, el, env.ts, env.tl, env.rect, env),
};
