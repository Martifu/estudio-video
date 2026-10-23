// Element "avatarStack" of the motion library (group Personas): 3-6 fotos que se solapan y entran en cadena, luego una burbuja "+N" que cuenta.
// One file = one element type (see engine/README.md "Cómo agregar un elemento"). Timeline beats are in DESIGN seconds.
import { seg, expoOut } from "../ui-motion.js";
import { rr, fnt, text, card, avatar, beginCard, envelope, radiusAt } from "./_kit.js";
import { countFrom, groupInt, popIn, ring, avatarOk, itemsField } from "./_personas.js";
import { FICTIONAL } from "./_fields.js";

export const STACK = { pad: 32, r: 56, border: 6, step: 84, overlap: 28, bubbleW: 150, row: 112, labelH: 44, h: 228, stagger: 0.12, max: 6 };
const shownCount = (el) => Math.max(1, Math.min(STACK.max, (el.items ?? []).length));
/** Card width: padding + photos (84 px apart) + the "+N" pill overlapping the last photo + padding. */
export const stackWidth = (el) => 2 * STACK.pad + STACK.r + (shownCount(el) - 1) * STACK.step + STACK.overlap + STACK.bubbleW;

export const avatarStackTimeline = (el) => {
  const n = shownCount(el);
  const bub = 0.15 + n * STACK.stagger;
  const Ld = bub + 1.7;
  return {
    Ld,
    b: {
      blob: [0, 0.3],
      avatars: { start: 0.15, step: STACK.stagger, dur: 0.4 },
      bubble: [bub, bub + 0.35],
      count: [bub + 0.1, bub + 1.2],
      label: [bub + 0.35, bub + 0.7],
      exit: [Ld - 0.35, Ld]
    }
  };
};

function drawAvatarStack(ctx, el, ts, tl, rect, env) {
  const { skin } = env, C = skin.colors, b = tl.b;
  const w = rect.w, h = rect.h;
  const items = (el.items ?? []).slice(0, STACK.max);
  const E = envelope(tl, ts);
  ctx.save();
  beginCard(ctx, el, tl, ts, rect, [w / 2, h / 2], E);
  const R = radiusAt(E, skin, w, h);
  card(ctx, 0, 0, w, h, R, skin);
  ctx.save();
  rr(ctx, 0, 0, w, h, R);
  ctx.clip();
  const cy = STACK.pad + STACK.row / 2;
  const x0 = STACK.pad + STACK.r;
  // photos: each one pops in (scale overshoot) 0.12 s after the previous
  items.forEach((it, i) => {
    const p = popIn(ts, b.avatars.start + i * b.avatars.step, b.avatars.dur);
    if (p.alpha <= 0) return;
    const cx = x0 + i * STACK.step;
    ctx.save();
    ctx.globalAlpha *= p.alpha;
    ctx.translate(cx, cy);
    ctx.scale(p.s, p.s);
    ctx.translate(-cx, -cy);
    ring(ctx, cx, cy, STACK.r + STACK.border, C.surface);
    avatar(ctx, env, it.avatar, it.name, cx, cy, STACK.r);
    ctx.restore();
  });
  // "+N" pill after the last photo: pops in, then the number counts up from 70 % of el.count (never a fake +0) to el.count, monotonic, lands exactly
  const bp = popIn(ts, b.bubble[0], b.bubble[1] - b.bubble[0]);
  if (bp.alpha > 0) {
    const bx = x0 + (items.length - 1) * STACK.step + STACK.overlap;
    const bw = STACK.bubbleW, bcx = bx + bw / 2;
    ctx.save();
    ctx.globalAlpha *= bp.alpha;
    ctx.translate(bcx, cy);
    ctx.scale(bp.s, bp.s);
    ctx.translate(-bcx, -cy);
    ctx.fillStyle = C.surface;
    rr(ctx, bx - STACK.border, cy - STACK.r - STACK.border, bw + STACK.border * 2, (STACK.r + STACK.border) * 2, STACK.r + STACK.border);
    ctx.fill();
    ctx.fillStyle = C.primary;
    rr(ctx, bx, cy - STACK.r, bw, STACK.r * 2, STACK.r);
    ctx.fill();
    const k = seg(ts, b.count[0], b.count[1]);
    const n = Math.max(0, Math.round(Number(el.count) || 0));
    text(ctx, `+${groupInt(countFrom(n, k))}`, bcx, cy + 1, { font: fnt(skin, 700, 34), color: "#FFFFFF", align: "center", maxW: bw - 16 });
    ctx.restore();
  }
  // label under the row, fades and rises in
  const lk = expoOut(seg(ts, b.label[0], b.label[1]));
  if (lk > 0 && el.label) {
    ctx.save();
    ctx.globalAlpha *= lk;
    text(ctx, el.label, w / 2, STACK.pad + STACK.row + 14 + STACK.labelH / 2, { font: fnt(skin, 700, 36), color: C.ink, align: "center", maxW: w - 48 });
    ctx.restore();
  }
  ctx.restore();
  ctx.restore();
}

export default {
  type: "avatarStack",
  category: "Personas",
  captions: "option",
  label: "Fotos de clientes",
  description: "Fotos que se apilan y un contador: +120 clientes felices",
  brief: [
    "Qué: muestra prueba social: varias fotos apiladas y un número que cuenta (+120 clientes felices).",
    "Cuándo: para reforzar confianza con un número de clientes o reseñas. No usar: si el número no tiene fuente, o para una sola persona (usa avatarCircle).",
    "Coreografía: la tarjeta nace, las fotos entran en cadena (una cada 4 fotogramas), la burbuja +N aparece y su número sube de forma monótona hasta el valor exacto.",
    "Gusto: el número empieza en un valor creíble (nunca +0 ni +1 mientras la burbuja nace); la burbuja es el único acento; fotos con aro blanco limpio.",
    "Datos: el número y las fotos vienen de la fuente indicada en source (reda, captura o ilustrativo); nunca inventar cifras."
  ].join("\n"),
  icon: "M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM16 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM4 20a4 4 0 0 1 8 0M12 20a4 4 0 0 1 8 0",
  textKey: "label",
  defaults: (t, end) => ({
    type: "avatarStack", in: t, out: Math.min(t + 3.4, end), count: 120, label: "clientes felices",
    items: [
      { avatar: "people:p01", name: "María" }, { avatar: "people:p02", name: "Carlos" }, { avatar: "people:p03", name: "Ana" },
      { avatar: "people:p04", name: "Luis" }, { avatar: "people:p06", name: "Sofía" }
    ], source: { ...FICTIONAL }
  }),
  fields: [
    itemsField("Fotos (de 3 a 6; se apilan en este orden)", [
      { key: "avatar", label: "Foto (people:p01 … o ruta)", kind: "text", opt: true, ph: "iniciales" },
      { key: "name", label: "Nombre (para las iniciales)", kind: "text", opt: true }
    ], 3, 6, () => ({ name: "Nueva persona", avatar: "" }), (r) => r.name || "Foto"),
    { key: "count", label: "Cuántos (el número que cuenta)", kind: "number", step: 1, min: 0 },
    { key: "label", label: "Texto debajo (ej. clientes felices)", kind: "text" }
  ],
  source: [
    { key: "source.kind", label: "¿De dónde sale el número?", kind: "select", options: [["reda", "De Reda (datos reales)"], ["screenshot", "De una captura de pantalla"], ["brand", "De la marca"], ["fictional", "Ilustrativo (inventado)"]], opt: true, ph: "sin indicar" },
    { key: "source.ref", label: "Referencia (opcional)", kind: "text", opt: true, ph: "ej. CRM, enero-octubre" },
    { key: "source.fetchedAt", label: "Fecha del dato (aaaa-mm-dd)", kind: "text", opt: true, ph: "2026-10-22" }
  ],
  timeline: avatarStackTimeline,
  size: (el) => ({ w: stackWidth(el), h: STACK.h }),
  imageRefs(el, add) {
    for (const it of el.items ?? []) add(it.avatar, "avatar");
  },
  minScale: 0.76, // smallest text 34 px x 0.76 = 26 px
  showsNumbers: () => true,
  validate(el, tag) {
    const errors = [], warnings = [];
    const n = (el.items ?? []).length;
    if (n < 3 || n > 6) errors.push(`${tag}: necesita de 3 a 6 fotos (tiene ${n})`);
    if ((el.items ?? []).some((x) => !avatarOk(x?.avatar))) errors.push(`${tag}: cada foto debe ser people:p01 … o una ruta de imagen`);
    if (el.count === undefined || el.count === "" || !(Number(el.count) >= 0)) errors.push(`${tag}: necesita el número que cuenta`);
    if (!el.label) errors.push(`${tag}: necesita el texto debajo del número`);
    if (el.count !== undefined && (!el.source?.kind || el.source.kind === "fictional")) warnings.push(`${tag}: el número es ilustrativo; confirma su fuente antes de publicar`);
    return { errors, warnings };
  },
  texts(el, add) {
    add(el.label);
    add(`+${el.count}`);
  },
  events(el, rect, { beats: B, add }) {
    add(B.blob[0], "pop");
    add(B.bubble[0], "pop");
  },
  draw: (ctx, el, t, env) => drawAvatarStack(ctx, el, env.ts, env.tl, env.rect, env),
};
