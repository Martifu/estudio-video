// Element "progressRing" of the motion library: un anillo que barre hasta un porcentaje y la cifra cuenta en el centro. The ring sweep and the
// count share one ease, so the arc and the number always agree and both land exactly on the final value. One file = one element type
// (see engine/README.md "Cómo agregar un elemento"). Timeline beats are in DESIGN seconds; the registry (index.js) scales them. Pure function of t.
import { seg, expoOut, statText, clamp } from "../ui-motion.js";
import { fnt, text, disc } from "./_kit.js";
import { UI_SCREEN, UI_SOURCE, FICTIONAL } from "./_fields.js";
import { cardEnvelope, endCardEnvelope, countUp, ringArc } from "./_charts.js";

export const RING = { w: 760, h: 760, cx: 380, cy: 372, r: 230, width: 40 };

export const ringTimeline = () => ({
  Ld: 2.8,
  b: {
    blob: [0, 0.5],
    label: [0.15, 0.5],
    track: [0.1, 0.5],
    count: [0.3, 1.5],
    exit: [2.45, 2.8]
  }
});

// Eased progress of the sweep (0..1). Same curve as countUp (1 - (1 - k)^3) so the arc and the number move together.
const ease = (k) => 1 - Math.pow(1 - clamp(k), 3);

function drawRing(ctx, el, ts, tl, rect, env) {
  const { skin } = env, C = skin.colors, b = tl.b;
  cardEnvelope(ctx, el, tl, ts, rect, skin);
  const pct = Math.min(100, Math.max(0, Number(el.value) || 0));
  const fe = { value: pct, format: "pct" };
  if (el.label) {
    const la = seg(ts, b.label[0], b.label[1]);
    ctx.save();
    ctx.globalAlpha *= expoOut(la);
    text(ctx, el.label, 56, 84, { font: fnt(skin, 700, 38), color: C.ink, maxW: RING.w - 112 });
    ctx.restore();
  }
  // track: the full circle, then the sweep from 12 o'clock (-90 deg) clockwise
  const k = seg(ts, b.count[0], b.count[1]);
  const ta = expoOut(seg(ts, b.track[0], b.track[1]));
  if (ta > 0) {
    ctx.save();
    ctx.globalAlpha *= ta;
    ctx.strokeStyle = C.line;
    ctx.lineWidth = RING.width;
    ctx.beginPath();
    ctx.arc(RING.cx, RING.cy, RING.r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  const frac = (pct / 100) * ease(k);
  const from = -Math.PI / 2;
  ringArc(ctx, RING.cx, RING.cy, RING.r, from, from + frac * Math.PI * 2, C.primary, RING.width);
  if (frac > 0.002) {
    const a = from + frac * Math.PI * 2;
    disc(ctx, RING.cx + Math.cos(a) * RING.r, RING.cy + Math.sin(a) * RING.r, RING.width * 0.5, C.accent);
  }
  // number in the centre: nothing before the count starts, the exact final text at the end
  // the number appears once the arc is 60 % swept: it starts at a real value and always equals the arc's share
  const shown = ease(k) >= 0.6 ? countUp(fe, k) : "";
  if (shown) {
    const final = statText(fe, 1);
    let px = 150;
    ctx.font = fnt(skin, 700, px);
    while (px > 48 && ctx.measureText(final).width > RING.r * 1.5) { px -= 6; ctx.font = fnt(skin, 700, px); }
    ctx.save();
    ctx.globalAlpha *= Math.min(1, (ease(k) - 0.6) * 8);
    text(ctx, shown, RING.cx, RING.cy, { font: fnt(skin, 700, px), color: C.ink, align: "center" });
    ctx.restore();
  }
  if (el.sub) {
    const sa = seg(ts, b.count[1] - 0.2, b.count[1] + 0.2);
    ctx.save();
    ctx.globalAlpha *= expoOut(sa);
    text(ctx, el.sub, RING.cx, 690, { font: fnt(skin, 600, 32), color: C.muted, align: "center", maxW: RING.w - 112 });
    ctx.restore();
  }
  endCardEnvelope(ctx);
}

export default {
  type: "progressRing",
  category: "KPIs y gráficas",
  captions: "option",
  label: "Anillo de avance",
  timelineLabel: "Anillo de avance",
  description: "Un anillo que barre hasta el porcentaje y cuenta la cifra en el centro",
  brief: [
    "Qué: Un anillo que barre hasta un porcentaje y cuenta esa cifra al centro.",
    "Cuándo: una meta o cumplimiento en porcentaje único. No usar: varias metas (usa progressBar) ni una serie (usa donut o barChart).",
    "Coreografía: el anillo nace, el arco barre con expoOut mientras la cifra cuenta; la cifra final queda exacta al terminar.",
    "Gusto: el arco es el color de acento sobre una pista clara; la cifra es el héroe; sin brillos ni sombras interiores.",
    "Datos: fictional o screenshot; el porcentaje viene del dato, no de adorno."
  ].join("\n"),
  icon: "M21 12a9 9 0 1 1-9-9",
  textKey: "label",
  defaults: (t, end) => ({
    type: "progressRing", in: t, out: Math.min(t + 2.8, end), label: "Meta de ventas del trimestre",
    value: 68.4, sub: "$1,231,000 de $1,800,000", source: { ...FICTIONAL }
  }),
  fields: [
    { key: "label", label: "Qué mide", kind: "text" },
    { key: "value", label: "Avance (0 a 100)", kind: "number", step: 0.1, min: 0, max: 100 },
    { key: "sub", label: "Texto debajo (opcional, ej. $1.2M de $1.8M)", kind: "text", opt: true }
  ],
  screen: UI_SCREEN(false),
  source: UI_SOURCE,
  thumbAt: 0.65,
  timeline: ringTimeline,
  size: () => ({ w: RING.w, h: RING.h }),
  minScale: 0.76,
  showsNumbers: () => true,
  validate(el, tag) {
    const errors = [], warnings = [];
    if (!String(el.label ?? "").trim()) errors.push(`${tag}: necesita qué mide`);
    const v = Number(el.value);
    if (el.value === undefined || el.value === null || el.value === "" || !Number.isFinite(v)) errors.push(`${tag}: necesita el avance en número`);
    else if (v < 0 || v > 100) errors.push(`${tag}: el avance va de 0 a 100`);
    return { errors, warnings };
  },
  texts(el, add) {
    add(el.label); add(el.sub);
  },
  events(el, rect, { beats: B, add }) {
    add(B.blob[0], "pop");
  },
  draw: (ctx, el, t, env) => drawRing(ctx, el, env.ts, env.tl, env.rect, env),
};

