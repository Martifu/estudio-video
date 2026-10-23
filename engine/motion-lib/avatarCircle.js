// Element "avatarCircle" of the motion library (group Personas): foto circular con aro de marca que se dibuja y nombre + cargo que salen al lado.
// One file = one element type (see engine/README.md "Cómo agregar un elemento"). Timeline beats are in DESIGN seconds.
import { seg, expoOut, outBack } from "../ui-motion.js";
import { rr, fnt, text, card, avatar, checkBadge, beginCard, envelope, radiusAt } from "./_kit.js";
import { slideIn, drawRing, avatarOk } from "./_personas.js";

export const AVATAR_CIRCLE = { w: 680, h: 176, r: 74, ring: 8 };

export const avatarCircleTimeline = (el) => ({
  Ld: 2.4,
  b: { blob: [0, 0.4], ring: [0.08, 0.62], photo: [0.12, 0.4], name: [0.4, 0.74], role: [0.52, 0.86], verified: [0.8, 1.0], push: [0.4, 2.0], exit: [2.1, 2.4] }
});

function drawAvatarCircle(ctx, el, ts, tl, rect, env) {
  const { skin } = env, C = skin.colors, b = tl.b;
  const w = rect.w, h = rect.h;
  const { r, ring: rw } = AVATAR_CIRCLE;
  const E = envelope(tl, ts);
  ctx.save();
  beginCard(ctx, el, tl, ts, rect, [w / 2, h / 2], E);
  const R = radiusAt(E, skin, w, h);
  card(ctx, 0, 0, w, h, R, skin);
  ctx.save();
  rr(ctx, 0, 0, w, h, R);
  ctx.clip();
  const cx = h / 2, cy = h / 2;
  // photo: fades in while the ring draws around it
  const ph = seg(ts, b.photo[0], b.photo[1]);
  ctx.save();
  ctx.globalAlpha *= ph;
  avatar(ctx, env, el.avatar, el.name, cx, cy, r);
  ctx.restore();
  drawRing(ctx, cx, cy, r + rw / 2 + 2, expoOut(seg(ts, b.ring[0], b.ring[1])), C.primary, rw);
  // name and role slide out to the right of the photo (lower third)
  const tx = cx + r + 40, maxW = w - tx - 40;
  const n = slideIn(ts, b.name[0], b.name[1] - b.name[0], -48);
  ctx.save();
  ctx.globalAlpha *= n.k;
  const nameY = el.role ? cy - 22 : cy;
  text(ctx, el.name ?? "", tx + n.dx, nameY, { font: fnt(skin, 700, 44), color: C.ink, maxW });
  ctx.restore();
  if (el.role) {
    const ro = slideIn(ts, b.role[0], b.role[1] - b.role[0], -48);
    ctx.save();
    ctx.globalAlpha *= ro.k;
    text(ctx, el.role, tx + ro.dx, cy + 30, { font: fnt(skin, 600, 30), color: C.muted, maxW });
    ctx.restore();
  }
  if (el.verified) {
    const k = outBack(seg(ts, b.verified[0], b.verified[1]));
    checkBadge(ctx, cx + r - 6, cy + r - 6, 52, C.primary, Math.max(0, k));
  }
  ctx.restore();
  ctx.restore();
  ctx.restore();
}

export default {
  type: "avatarCircle",
  category: "Personas",
  captions: "option",
  label: "Persona con foto",
  description: "Foto circular con aro de marca; nombre y cargo salen al lado",
  brief: [
    "Qué: presenta a una persona (asesora, cliente) con su foto y nombre, como firma de un testimonio o de un vendedor.",
    "Cuándo: al presentar a quien habla o atiende. No usar: para una cita larga (usa testimonial) ni para muchas personas (usa avatarStack).",
    "Coreografía: la tarjeta nace, el aro de marca se dibuja alrededor de la foto, luego el nombre y el cargo entran desde la izquierda, y al final aparece la palomita.",
    "Gusto: una sola acción de color (el aro); nombre grande y firme, cargo chico y gris; sin sombras duras ni rebotes extra.",
    "Datos: nombre y cargo ficticios o del brief; foto del banco people:pNN; sin datos reales de clientes."
  ].join("\n"),
  icon: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 21a8 8 0 0 1 16 0",
  textKey: "name",
  minScale: 0.88, // smallest text 30 px x 0.88 = 26 px
  defaults: (t, end) => ({
    type: "avatarCircle", in: t, out: Math.min(t + 3, end), name: "Ana Robles", role: "Asesora inmobiliaria", avatar: "people:p05", verified: true
  }),
  fields: [
    { key: "name", label: "Nombre", kind: "text" },
    { key: "role", label: "Cargo o ciudad (opcional)", kind: "text", opt: true, ph: "sin cargo" },
    { key: "avatar", label: "Foto (people:p01 … o ruta)", kind: "text", opt: true, ph: "iniciales" },
    { key: "verified", label: "Mostrar la palomita de verificado", kind: "bool", opt: true, ph: "no" }
  ],
  timeline: avatarCircleTimeline,
  size: () => ({ w: AVATAR_CIRCLE.w, h: AVATAR_CIRCLE.h }),
  imageRefs(el, add) {
    add(el.avatar, "avatar");
  },
  validate(el, tag) {
    const errors = [], warnings = [];
    if (!el.name) errors.push(`${tag}: necesita el nombre de la persona`);
    if (!avatarOk(el.avatar)) errors.push(`${tag}: la foto debe ser people:p01 … o una ruta de imagen (png, jpg, webp)`);
    if (!el.avatar) warnings.push(`${tag}: sin foto se muestran las iniciales; pon una foto para que se vea más humano`);
    return { errors, warnings };
  },
  texts(el, add) {
    add(el.name); add(el.role);
  },
  events(el, rect, { beats: B, add }) {
    add(B.blob[0], "pop");
    add(B.name[0], "whoosh");
    if (el.verified) add(B.verified[0], "pop");
  },
  draw: (ctx, el, t, env) => drawAvatarCircle(ctx, el, env.ts, env.tl, env.rect, env),
};
