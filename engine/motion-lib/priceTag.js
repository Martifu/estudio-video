// Element "priceTag" of the motion library (grupo Venta): etiqueta de precio que cae y se balancea al aterrizar; el precio cuenta hasta su valor.
// Timeline beats are in DESIGN seconds; the registry (index.js) scales them to [in, out]. Drawing is a pure function of the local time.
import { seg, expoOut } from "../ui-motion.js";
import { rr, fnt, text } from "./_kit.js";
import { UI_SOURCE, FICTIONAL, UI_SCREEN } from "./_fields.js";
import { money, countFrom, dampedSwing, priceProblem, productPatch, pushed, slotCandidates } from "./_venta.js";

export const TAG = { w: 600, h: 300 };
const HOLE = { x: 52, y: 52, r: 14 };

export const tagTimeline = () => ({ Ld: 2.6, b: { drop: [0, 0.42], swing: [0.36, 1.9], count: [0.45, 1.5], note: [0.95, 1.3], exit: [2.3, 2.6] } });

function drawTag(ctx, el, ts, tl, rect, env) {
  const { skin } = env, C = skin.colors, b = tl.b;
  const k = expoOut(seg(ts, b.drop[0], b.drop[1])); // lands without overshoot; the swing below is the only bounce
  const out = 1 - seg(ts, b.exit[0], b.exit[1]);
  const ang = dampedSwing(ts, b.swing[0], b.swing[1] - b.swing[0], 0.075);
  ctx.globalAlpha = Math.min(1, k * 2.5) * out;
  // the tag drops in from above (140 px), then swings around its hole
  ctx.translate(rect.x, rect.y + (1 - k) * -140);
  ctx.translate(HOLE.x, HOLE.y);
  ctx.rotate(ang);
  ctx.translate(-HOLE.x, -HOLE.y);
  // flat tag with a punched hole (even-odd fill keeps the hole transparent)
  rr(ctx, 0, 0, TAG.w, TAG.h, 24);
  ctx.moveTo(HOLE.x + HOLE.r, HOLE.y);
  ctx.arc(HOLE.x, HOLE.y, HOLE.r, 0, Math.PI * 2);
  ctx.fillStyle = C.surface;
  ctx.shadowColor = "rgba(16,24,40,0.28)"; ctx.shadowBlur = 40; ctx.shadowOffsetY = 18;
  ctx.fill("evenodd");
  ctx.shadowColor = "transparent"; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  // rows (centres): label beside the hole, "desde" above the price, the price, then the note under it: no row overlaps another
  text(ctx, el.label ?? "", 100, HOLE.y, { font: fnt(skin, 600, 34), color: C.ink, maxW: TAG.w - 140 });
  if (el.prefix) text(ctx, el.prefix, 40, 118, { font: fnt(skin, 600, 30), color: C.muted });
  const kc = seg(ts, b.count[0], b.count[1]);
  const dec = Number.isInteger(Number(el.value)) ? 0 : 2;
  // the size comes from the final value, so counting never rescales the price; the count starts at 70 % of it (no fake zero)
  let px = 104;
  ctx.font = fnt(skin, 800, px);
  while (px > 56 && ctx.measureText(money(el.value, dec)).width > TAG.w - 80) { px -= 4; ctx.font = fnt(skin, 800, px); }
  const shown = kc > 0 ? money(countFrom(el.value, kc), dec) : "";
  text(ctx, shown, 40, 196, { font: fnt(skin, 800, px), color: C.primary, ls: -1 });
  const ng = seg(ts, b.note[0], b.note[1]);
  if (el.note && ng > 0) {
    ctx.globalAlpha *= ng;
    text(ctx, el.note, 40, 262, { font: fnt(skin, 500, 28), color: C.muted, maxW: TAG.w - 80 });
  }
}

export default {
  type: "priceTag",
  category: "Venta",
  captions: "option", // subtitles hide while the element is on screen (element.captions "keep" keeps them), like the screens
  label: "Etiqueta de precio",
  description: "Una etiqueta de precio que cae, se balancea y cuenta hasta su valor",
  brief: [
    "Qué: un precio de lista como etiqueta física que cae, se balancea y cuenta hasta su valor.",
    "Cuándo: una oferta o precio de un producto suelto (\"desde $1,850,000\"). No usar: para comparar varias opciones (usa priceCompare) ni para un descuento tachado (usa offerBadge).",
    "Coreografía: la etiqueta cae 0–0.42 s; se balancea 0.36–1.9 s; el precio cuenta 0.45–1.5 s desde una cifra en blanco; la nota aparece 0.95 s; sale 2.2–2.6 s.",
    "Gusto: el precio es el héroe (grande, color primario); la etiqueta y la nota son pequeñas y apagadas; sin brillo ni borde; el balanceo es lo único que rebota.",
    "Datos: products.json (reda o brand) o cifras ficticias; nunca precios reales de clientes."
  ].join("\n"),
  icon: "M3 12l9-9h8v8l-9 9-8-8zM16 7.5h.01",
  textKey: "label",
  defaults: (t, end) => ({ type: "priceTag", in: t, out: Math.min(t + 3.2, end), label: "Departamento 2 recámaras", value: 1850000, prefix: "desde", note: "Precio de lista", source: { ...FICTIONAL } }),
  fields: [
    { key: "label", label: "Qué es", kind: "text" },
    { key: "value", label: "Precio", kind: "number", step: 1 },
    { key: "prefix", label: "Antes del precio (ej. desde)", kind: "text", opt: true, ph: "sin texto" },
    { key: "note", label: "Nota bajo el precio (opcional)", kind: "text", opt: true },
    { key: "productId", label: "Id del producto (opcional)", kind: "text", opt: true },
  ],
  source: UI_SOURCE,
  screen: UI_SCREEN(false),
  candidates: (el, zones) => slotCandidates(el, zones, TAG.w, TAG.h, "tag"),
  timeline: tagTimeline,
  size: () => ({ w: TAG.w, h: TAG.h }),
  prefill: ({ products } = {}) => productPatch(products),
  showsNumbers: () => true,
  validate(el, tag) {
    const errors = [], warnings = [];
    if (!el.label) errors.push(`${tag}: necesita qué es`);
    const p = priceProblem(el.value, tag);
    if (p) errors.push(p);
    if (!el.source?.kind) warnings.push(`${tag}: indica de dónde sale el precio (Fuente de los datos)`);
    return { errors, warnings };
  },
  texts(el, add) {
    add(el.label); add(el.note);
    if (Number.isFinite(Number(el.value))) add(`${el.prefix ? `${el.prefix} ` : ""}${money(el.value)}`);
  },
  events(el, rect, { beats: B, add }) {
    add(B.drop[0], "whoosh");
    add(B.drop[1], "pop");
  },
  draw: (ctx, el, t, env) => pushed(ctx, el, env.ts, env.tl, env.rect, () => drawTag(ctx, el, env.ts, env.tl, env.rect, env)),
};
