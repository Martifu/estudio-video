// Element "planCards" of the motion library (grupo Venta): 2 o 3 planes o modelos; el recomendado va resaltado con cinta.
// Layout "fila" (side by side) or "columna" (stacked); the default is fila for 2 cards and columna for 3.
// Timeline beats are in DESIGN seconds; the registry (index.js) scales them to [in, out]. Drawing is a pure function of the local time.
import { seg, expoOut } from "../ui-motion.js";
import { rr, fnt, text, card, hexA } from "./_kit.js";
import { UI_SOURCE, FICTIONAL, UI_SCREEN } from "./_fields.js";
import { money, drawCheck, onPrimary, pushed } from "./_venta.js";

export const PLANS = { w: 900, gap: 24, rowH: 620, colH: 280, colGap: 20, bulletH: 66 };
const plansOf = (el) => (Array.isArray(el.plans) ? el.plans.filter((p) => p && typeof p.name === "string" && p.name.trim()) : []);
/** Bullet points of a plan: `features` as text separated by "|" (the inspector cannot nest lists), at most 3. */
export const featuresOf = (p) => (Array.isArray(p.features) ? p.features : String(p.features ?? "").split("|").map((s) => s.trim()).filter(Boolean)).slice(0, 3);
export const layoutOf = (el) => (el.layout === "columna" || el.layout === "fila" ? el.layout : plansOf(el).length <= 2 ? "fila" : "columna");

export const plansTimeline = (el) => {
  const n = Math.max(1, plansOf(el).length);
  const Ld = 0.15 + (n - 1) * 0.2 + 0.55 + 0.8 + 0.4;
  return { Ld, b: { cards: { start: 0.15, step: 0.2, dur: 0.55 }, ribbon: [0.7, 1.0], exit: [Ld - 0.4, Ld] } };
};

function drawFila(ctx, p, i, cw, ts, b, env, out) {
  const { skin } = env, C = skin.colors, hi = p.recommended === true;
  const s = b.cards.start + i * b.cards.step;
  const k = expoOut(seg(ts, s, s + b.cards.dur));
  const ink = hi ? onPrimary(C.primary) : C.ink, sub = hi ? hexA(ink, 0.8) : C.muted;
  ctx.save();
  ctx.translate(i * (cw + PLANS.gap), (1 - k) * 50);
  ctx.globalAlpha = out * k;
  card(ctx, 0, 0, cw, PLANS.rowH, skin.radius.card ?? 28, skin, { fill: hi ? C.primary : C.surface });
  text(ctx, p.name, 28, 104, { font: fnt(skin, 700, 36), color: ink, maxW: cw - 56 }); // below the ribbon, which sits inside the card
  const dec = Number.isInteger(Number(p.price)) ? 0 : 2;
  let px = 84; ctx.font = fnt(skin, 800, px);
  const priceStr = money(p.price, dec);
  while (px > 56 && ctx.measureText(priceStr).width > cw - 56) { px -= 4; ctx.font = fnt(skin, 800, px); }
  text(ctx, priceStr, 28, 198, { font: fnt(skin, 800, px), color: hi ? ink : C.primary, ls: -1 });
  if (p.period) text(ctx, p.period, 28, 256, { font: fnt(skin, 500, 28), color: sub, maxW: cw - 56 });
  ctx.strokeStyle = hi ? hexA(ink, 0.35) : C.line; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(28, 306); ctx.lineTo(cw - 28, 306); ctx.stroke();
  featuresOf(p).forEach((f, j) => {
    const y = 362 + j * PLANS.bulletH;
    const kf = seg(ts, s + 0.3 + j * 0.08, s + 0.6 + j * 0.08);
    drawCheck(ctx, 44, y, 26, hi ? ink : C.primary, 5, kf);
    text(ctx, f, 70, y, { font: fnt(skin, 500, 30), color: ink, maxW: cw - 100 });
  });
  ctx.restore();
  return k;
}

function drawColumna(ctx, p, i, ts, b, env, out) {
  const { skin } = env, C = skin.colors, hi = p.recommended === true;
  const s = b.cards.start + i * b.cards.step;
  const k = expoOut(seg(ts, s, s + b.cards.dur));
  const y0 = i * (PLANS.colH + PLANS.colGap);
  const ink = hi ? onPrimary(C.primary) : C.ink, sub = hi ? hexA(ink, 0.8) : C.muted;
  ctx.save();
  ctx.translate(0, y0 + (1 - k) * 50);
  ctx.globalAlpha = out * k;
  card(ctx, 0, 0, PLANS.w, PLANS.colH, skin.radius.card ?? 28, skin, { fill: hi ? C.primary : C.surface });
  text(ctx, p.name, 40, 70, { font: fnt(skin, 700, 36), color: ink, maxW: 340 });
  const dec = Number.isInteger(Number(p.price)) ? 0 : 2;
  let px = 84; ctx.font = fnt(skin, 800, px);
  const priceStr = money(p.price, dec);
  while (px > 56 && ctx.measureText(priceStr).width > 340) { px -= 4; ctx.font = fnt(skin, 800, px); }
  text(ctx, priceStr, 40, 166, { font: fnt(skin, 800, px), color: hi ? ink : C.primary, ls: -1 });
  if (p.period) text(ctx, p.period, 40, 224, { font: fnt(skin, 500, 28), color: sub, maxW: 340 });
  ctx.strokeStyle = hi ? hexA(ink, 0.35) : C.line; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(420, 40); ctx.lineTo(420, PLANS.colH - 40); ctx.stroke();
  featuresOf(p).forEach((f, j) => {
    const y = 74 + j * 68;
    const kf = seg(ts, s + 0.3 + j * 0.08, s + 0.6 + j * 0.08);
    drawCheck(ctx, 456, y, 26, hi ? ink : C.primary, 5, kf);
    text(ctx, f, 494, y, { font: fnt(skin, 500, 32), color: ink, maxW: PLANS.w - 494 - 36 });
  });
  ctx.restore();
  return k;
}

function drawPlans(ctx, el, ts, tl, rect, env) {
  const { skin } = env, C = skin.colors, b = tl.b;
  const plans = plansOf(el);
  const out = 1 - seg(ts, b.exit[0], b.exit[1]);
  const fila = layoutOf(el) === "fila";
  const cw = (PLANS.w - PLANS.gap * (plans.length - 1)) / Math.max(1, plans.length);
  ctx.save();
  ctx.translate(rect.x, rect.y);
  plans.forEach((p, i) => {
    const hi = p.recommended === true;
    fila ? drawFila(ctx, p, i, cw, ts, b, env, out) : drawColumna(ctx, p, i, ts, b, env, out);
    if (!hi) return;
    // ribbon: a flat white pill inside the card's top edge (fila: centred; columna: top right), always fully visible
    const kr = seg(ts, b.ribbon[0], b.ribbon[1]);
    if (kr <= 0) return;
    ctx.save();
    ctx.globalAlpha = out * kr;
    ctx.font = fnt(skin, 700, 26);
    const label = "Recomendado";
    const pw = ctx.measureText(label).width + 40;
    const rx = fila ? i * (cw + PLANS.gap) + cw / 2 - pw / 2 : PLANS.w - pw - 28;
    const ry = fila ? 16 : i * (PLANS.colH + PLANS.colGap) + 14;
    ctx.fillStyle = C.surface; // the ribbon is the only white on the highlighted plan: ink text reads on both skins
    rr(ctx, rx, ry, pw, 40, 20);
    ctx.fill();
    text(ctx, label, rx + pw / 2, ry + 20, { font: fnt(skin, 700, 26), color: C.ink, align: "center" });
    ctx.restore();
  });
  ctx.restore();
}

export default {
  type: "planCards",
  category: "Venta",
  captions: "option", // subtitles hide while the element is on screen (element.captions "keep" keeps them), like the screens
  label: "Planes o modelos",
  description: "De 2 a 3 planes lado a lado o apilados, con uno recomendado",
  brief: [
    "Qué: tarjetas de planes lado a lado; el plan recomendado se resalta.",
    "Cuándo: vender 2 a 3 planes con precio y bullets. No usar: para un solo precio (priceTag) ni para comparar características fila por fila (compareTable).",
    "Coreografía: las tarjetas nacen en cascada; el listón \"Recomendado\" entra completo, sin recortarse; el plan destacado se rellena de acento con texto oscuro legible.",
    "Gusto: el plan destacado es el único relleno de color; texto del destacado con contraste alto en ambos skins; sin brillo.",
    "Datos: nombres y precios escritos por el usuario o products.json; sin datos reales de clientes."
  ].join("\n"),
  icon: "M3 6h7v12H3zM14 6h7v12h-7z",
  textKey: "title",
  defaults: (t, end) => ({ type: "planCards", in: t, out: Math.min(t + 4.4, end), plans: [
    { name: "Básico", price: 1490, period: "al mes", features: "1 usuario | Seguimiento básico", recommended: false },
    { name: "Pro", price: 2990, period: "al mes", features: "5 usuarios | Reportes semanales | Factura electrónica", recommended: true }
  ], source: { ...FICTIONAL } }),
  fields: [
    { key: "layout", label: "Disposición", kind: "select", options: [["fila", "Lado a lado"], ["columna", "Apilados"]], opt: true, ph: "automática" },
    { key: "plans", label: "Planes (de 2 a 3)", kind: "blocks", prop: "plans", min: 2, max: 3, blank: () => ({ name: "Plan", price: 0, period: "", features: "", recommended: false }), fields: () => [
      { key: "name", label: "Nombre", kind: "text" },
      { key: "price", label: "Precio", kind: "number", step: 1 },
      { key: "period", label: "Periodo (ej. al mes)", kind: "text", opt: true },
      { key: "features", label: "Puntos (separados por |, máx. 3)", kind: "text", opt: true },
      { key: "recommended", label: "Es el recomendado", kind: "bool" }
    ], name: (p) => p.name },
  ],
  source: UI_SOURCE,
  screen: UI_SCREEN(false),
  timeline: plansTimeline,
  size: (el) => {
    const n = plansOf(el).length || 2;
    return layoutOf(el) === "fila" ? { w: PLANS.w, h: PLANS.rowH } : { w: PLANS.w, h: n * PLANS.colH + (n - 1) * PLANS.colGap };
  },
  showsNumbers: () => true,
  validate(el, tag) {
    const errors = [], warnings = [];
    const plans = plansOf(el);
    if (plans.length < 2 || plans.length > 3) errors.push(`${tag}: necesita de 2 a 3 planes con nombre (tiene ${plans.length})`);
    plans.forEach((p) => { if (!Number.isFinite(Number(p.price))) errors.push(`${tag}: el plan "${p.name}" necesita un precio (número)`); });
    if (plans.filter((p) => p.recommended === true).length > 1) warnings.push(`${tag}: solo un plan debe ser el recomendado`);
    if (!el.source?.kind) warnings.push(`${tag}: indica de dónde salen los precios (Fuente de los datos)`);
    return { errors, warnings };
  },
  texts(el, add) {
    for (const p of plansOf(el)) { add(p.name); add(p.period); featuresOf(p).forEach((f) => add(f)); if (Number.isFinite(Number(p.price))) add(money(p.price)); }
  },
  events(el, rect, { beats: B, add }) {
    add(B.cards.start, "whoosh");
  },
  draw: (ctx, el, t, env) => pushed(ctx, el, env.ts, env.tl, env.rect, () => drawPlans(ctx, el, env.ts, env.tl, env.rect, env)),
};
