// Element "priceCompare" of the motion library (grupo Venta): precio anterior tachado y precio nuevo que cae con la píldora de ahorro.
// Timeline beats are in DESIGN seconds; the registry (index.js) scales them to [in, out]. Drawing is a pure function of the local time.
import { seg, expoOut, lerp } from "../ui-motion.js";
import { rr, fnt, text, card } from "./_kit.js";
import { UI_SOURCE, FICTIONAL, UI_SCREEN } from "./_fields.js";
import { money, priceProblem, onPrimary, pushed, slotCandidates } from "./_venta.js";

export const COMPARE = { w: 880, h: 420 };
export const compareTimeline = () => ({ Ld: 2.7, b: { label: [0, 0.3], old: [0.1, 0.55], strike: [0.6, 0.95], slam: [0.95, 1.2], pill: [1.25, 1.65], exit: [2.4, 2.7] } });

function drawCompare(ctx, el, ts, tl, rect, env) {
  const { skin } = env, C = skin.colors, b = tl.b;
  // the card is born first (from 40 % opacity, 24 px below, expoOut), then its rows; the exit is 0.3 s
  const kb = expoOut(seg(ts, 0, 0.4));
  const out = (1 - seg(ts, b.exit[0], b.exit[1])) * Math.min(1, kb * 2.5);
  const w = rect.w, h = rect.h;
  const savings = Number(el.oldValue) - Number(el.value);
  ctx.save();
  ctx.translate(rect.x, rect.y + (1 - kb) * 24);
  ctx.globalAlpha = out;
  card(ctx, 0, 0, w, h, skin.radius.card ?? 28, skin);
  ctx.globalAlpha = out;
  const la = expoOut(seg(ts, b.label[0], b.label[1]));
  ctx.globalAlpha = out * la;
  if (el.label) text(ctx, el.label, 56, 56, { font: fnt(skin, 600, 34), color: C.muted, maxW: w - 112 });
  ctx.globalAlpha = out;
  // old price: appears, then a strike line draws through it
  const ko = expoOut(seg(ts, b.old[0], b.old[1]));
  const oldText = money(el.oldValue);
  ctx.font = fnt(skin, 600, 64);
  const oldW = ctx.measureText(oldText).width;
  ctx.save();
  ctx.globalAlpha = out * ko;
  text(ctx, oldText, 56, 170 + (1 - ko) * 20, { font: fnt(skin, 600, 64), color: C.muted });
  const st = expoOut(seg(ts, b.strike[0], b.strike[1]));
  if (st > 0) {
    ctx.strokeStyle = C.ink; ctx.lineWidth = 6; ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(52, 170 + (1 - ko) * 20);
    ctx.lineTo(52 + (oldW + 8) * st, 170 + (1 - ko) * 20);
    ctx.stroke();
  }
  ctx.restore();
  // new price slams in (scale 1.35 -> 1, no overshoot)
  const ks = expoOut(seg(ts, b.slam[0], b.slam[1]));
  if (ks > 0) {
    ctx.save();
    ctx.globalAlpha = out * Math.min(1, ks * 3);
    const sc = lerp(1.35, 1, ks);
    ctx.translate(56, 290);
    ctx.scale(sc, sc);
    text(ctx, money(el.value), 0, 0, { font: fnt(skin, 800, 128), color: C.primary, ls: -2 });
    ctx.restore();
  }
  // savings pill
  const kp = expoOut(seg(ts, b.pill[0], b.pill[1]));
  if (kp > 0) {
    ctx.save();
    ctx.globalAlpha = out * kp;
    ctx.translate(0, (1 - kp) * 24);
    const label = `${el.savingsLabel ?? "Ahorras"} ${money(savings)}`;
    ctx.font = fnt(skin, 700, 40);
    const pw = ctx.measureText(label).width + 64;
    ctx.fillStyle = C.primary; // one accent: the new price and its savings pill share it
    rr(ctx, 56, 352, pw, 60, 30);
    ctx.fill();
    text(ctx, label, 88, 382, { font: fnt(skin, 700, 40), color: onPrimary(C.primary) });
    ctx.restore();
  }
  ctx.restore();
}

export default {
  type: "priceCompare",
  category: "Venta",
  captions: "option", // subtitles hide while the element is on screen (element.captions "keep" keeps them), like the screens
  label: "Precio anterior y nuevo",
  description: "El precio anterior se tacha y el nuevo cae con el ahorro",
  brief: [
    "Qué: comparativo de precios de dos o más opciones, la más conveniente resaltada.",
    "Cuándo: elegir entre planes o unidades con precio. No usar: para un solo precio (usa priceTag) ni para una tabla de muchas características (usa compareTable).",
    "Coreografía: las tarjetas nacen en cascada con 3–5 fotogramas de separación; los precios cuentan al nacer la tarjeta; la opción destacada se marca al final.",
    "Gusto: un solo acento; la opción destacada es la única con relleno; cifras grandes, etiquetas pequeñas y apagadas; sin sombras dobles.",
    "Datos: products.json o cifras ficticias; etiquetas de opción cortas."
  ].join("\n"),
  icon: "M4 8h7M4 16h7M15 8l5 4-5 4",
  textKey: "label",
  defaults: (t, end) => ({ type: "priceCompare", in: t, out: Math.min(t + 3.4, end), label: "Preventa de departamentos", oldValue: 1450000, value: 1330000, savingsLabel: "Ahorras", source: { ...FICTIONAL } }),
  fields: [
    { key: "label", label: "Qué es (opcional)", kind: "text", opt: true },
    { key: "oldValue", label: "Precio anterior", kind: "number", step: 1 },
    { key: "value", label: "Precio nuevo", kind: "number", step: 1 },
    { key: "savingsLabel", label: "Texto del ahorro", kind: "text", opt: true, ph: "Ahorras" },
  ],
  source: UI_SOURCE,
  screen: UI_SCREEN(false),
  candidates: (el, zones) => slotCandidates(el, zones, COMPARE.w, COMPARE.h, "compare"),
  timeline: compareTimeline,
  size: () => ({ w: COMPARE.w, h: COMPARE.h }),
  showsNumbers: () => true,
  validate(el, tag) {
    const errors = [], warnings = [];
    const p1 = priceProblem(el.oldValue, tag), p2 = priceProblem(el.value, tag);
    if (p1) errors.push(p1.replace("un precio", "un precio anterior"));
    if (p2) errors.push(p2.replace("un precio", "un precio nuevo"));
    if (!p1 && !p2 && !(Number(el.oldValue) > Number(el.value) && Number(el.value) > 0)) errors.push(`${tag}: el precio nuevo debe ser mayor que cero y menor que el anterior`);
    if (!el.source?.kind) warnings.push(`${tag}: indica de dónde sale el precio (Fuente de los datos)`);
    return { errors, warnings };
  },
  texts(el, add) {
    add(el.label);
    if (Number.isFinite(Number(el.oldValue)) && Number.isFinite(Number(el.value))) add(`${el.savingsLabel ?? "Ahorras"} ${money(Number(el.oldValue) - Number(el.value))}`);
  },
  events(el, rect, { beats: B, add }) {
    add(B.slam[0], "pop");
  },
  draw: (ctx, el, t, env) => pushed(ctx, el, env.ts, env.tl, env.rect, () => drawCompare(ctx, el, env.ts, env.tl, env.rect, env)),
};
