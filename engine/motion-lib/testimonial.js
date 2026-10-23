// Element "testimonial" of the motion library (group Personas): tarjeta de cita con comilla grande, texto que se revela por líneas, estrellas y autor.
// One file = one element type (see engine/README.md "Cómo agregar un elemento"). Timeline beats are in DESIGN seconds.
import { seg, expoOut, clamp } from "../ui-motion.js";
import { rr, fnt, text, wrapText, card, avatar, beginCard, envelope, radiusAt } from "./_kit.js";
import { drawStar, popIn, childSpan, avatarOk, wordCount } from "./_personas.js";
import { FICTIONAL } from "./_fields.js";

export const QUOTE = { w: 900, h: 820, pad: 72, lineH: 62, maxLines: 6, quoteTop: 196, starY: 630, starR: 30, starStep: 76, footY: 748, quotePx: 44 };

export const testimonialTimeline = () => ({
  Ld: 4.2,
  b: {
    blob: [0, 0.45],
    mark: [0.1, 0.5],
    lines: { start: 0.3, step: 0.12, dur: 0.35 },
    stars: { start: 1.1, step: 0.1, dur: 0.3 },
    foot: [1.9, 2.3],
    exit: [3.9, 4.2]
  }
});

function drawTestimonial(ctx, el, ts, tl, rect, env) {
  const { skin } = env, C = skin.colors, b = tl.b;
  const w = rect.w, h = rect.h;
  const E = envelope(tl, ts, { blurExit: true }); // the exit blurs and fades the whole card at once: no lingering ghost
  ctx.save();
  beginCard(ctx, el, tl, ts, rect, [w / 2, h / 2], E);
  const R = radiusAt(E, skin, w, h);
  card(ctx, 0, 0, w, h, R, skin);
  ctx.save();
  rr(ctx, 0, 0, w, h, R);
  ctx.clip();
  // big quote mark: pops in, the one accent (same as the stars)
  const mp = popIn(ts, b.mark[0], b.mark[1] - b.mark[0]);
  if (mp.alpha > 0) {
    ctx.save();
    ctx.globalAlpha *= mp.alpha;
    ctx.translate(QUOTE.pad + 30, 150);
    ctx.scale(mp.s, mp.s);
    text(ctx, "“", 0, 0, { font: fnt(skin, 800, 220), color: C.primary, align: "left" });
    ctx.restore();
  }
  // quote text: one line at a time, rising from 30 px
  ctx.font = fnt(skin, 600, QUOTE.quotePx);
  const lines = wrapText(ctx, el.quote ?? "", w - QUOTE.pad * 2, QUOTE.maxLines);
  lines.forEach((ln, j) => {
    const [a, a2] = childSpan(b.lines, j);
    const k = expoOut(seg(ts, a, a2));
    if (k <= 0) return;
    ctx.save();
    ctx.globalAlpha *= clamp(k * 1.6);
    text(ctx, ln, QUOTE.pad, QUOTE.quoteTop + j * QUOTE.lineH + (1 - k) * 30, { font: fnt(skin, 600, QUOTE.quotePx), color: C.ink });
    ctx.restore();
  });
  // stars fill one after another (halves render as partial fills)
  const score = Math.max(0, Math.min(5, Number(el.stars ?? 5)));
  for (let i = 0; i < 5; i += 1) {
    const [a, a2] = childSpan(b.stars, i);
    const p = popIn(ts, a, a2 - a);
    if (p.alpha <= 0) continue;
    const cx = QUOTE.pad + QUOTE.starR + i * QUOTE.starStep;
    const cy = QUOTE.starY;
    ctx.save();
    ctx.globalAlpha *= p.alpha;
    ctx.translate(cx, cy);
    ctx.scale(p.s, p.s);
    ctx.translate(-cx, -cy);
    const fill = clamp(score - i) * expoOut(seg(ts, a + 0.05, a2));
    drawStar(ctx, cx, cy, QUOTE.starR, fill, C.primary, C.line);
    ctx.restore();
  }
  // author: avatar + name and role slide in together
  const fo = expoOut(seg(ts, b.foot[0], b.foot[1]));
  if (fo > 0) {
    ctx.save();
    ctx.globalAlpha *= fo;
    const ax = QUOTE.pad + 44, ay = QUOTE.footY;
    avatar(ctx, env, el.avatar, el.name, ax, ay, 44);
    const tx = ax + 44 + 24, maxW = w - tx - QUOTE.pad;
    text(ctx, el.name ?? "", tx, ay - 16, { font: fnt(skin, 700, 34), color: C.ink, maxW });
    if (el.role) text(ctx, el.role, tx, ay + 22, { font: fnt(skin, 500, 30), color: C.muted, maxW });
    ctx.restore();
  }
  ctx.restore();
  ctx.restore();
}

export default {
  type: "testimonial",
  category: "Personas",
  captions: "option",
  label: "Testimonio",
  description: "Cita de un cliente con estrellas, foto y nombre",
  brief: [
    "Qué: cita de un cliente con comilla grande, estrellas, foto y nombre.",
    "Cuándo: para una prueba social con voz propia. No usar: para una frase corta de la marca (usa quoteCard) ni sin nombre de quien opina.",
    "Coreografía: la tarjeta nace, la comilla aparece, las líneas de la cita se revelan una a una con 4 fotogramas de separación, luego las estrellas se llenan y el autor entra; la salida dura menos de la mitad de la entrada.",
    "Gusto: la cita es el héroe en texto grande y negro; la comilla es el único acento; sin tarjeta vacía larga ni fantasmas semitransparentes que se quedan.",
    "Datos: la cita y el nombre vienen del usuario o de la fuente indicada; testimonio ficticio marcado como ilustrativo."
  ].join("\n"),
  icon: "M7 17h3l2-4V7H6v6h3l-2 4Zm8 0h3l2-4V7h-6v6h3l-2 4Z",
  textKey: "quote",
  defaults: (t, end) => ({
    type: "testimonial", in: t, out: Math.min(t + 5.2, end), stars: 5,
    quote: "Nos encontró el departamento en dos semanas y nos acompañó hasta la firma. Muy claros en todo.",
    name: "Luis Enrique Vargas", role: "Compró en Valle Alto", avatar: "people:p02", source: { ...FICTIONAL }
  }),
  fields: [
    { key: "quote", label: "Lo que dijo (máximo unas 25 palabras)", kind: "textarea" },
    { key: "name", label: "Nombre", kind: "text" },
    { key: "role", label: "Cargo o detalle (opcional)", kind: "text", opt: true, ph: "sin detalle" },
    { key: "avatar", label: "Foto (people:p01 … o ruta)", kind: "text", opt: true, ph: "iniciales" },
    { key: "stars", label: "Estrellas (0 a 5, medias permitidas)", kind: "number", step: 0.5, min: 0, max: 5, opt: true, ph: "5" }
  ],
  timeline: testimonialTimeline,
  minScale: 0.88, // smallest text 30 px x 0.88 = 26 px
  size: () => ({ w: QUOTE.w, h: QUOTE.h }),
  imageRefs(el, add) {
    add(el.avatar, "avatar");
  },
  validate(el, tag) {
    const errors = [], warnings = [];
    if (!el.quote) errors.push(`${tag}: necesita el texto del testimonio`);
    if (!el.name) errors.push(`${tag}: necesita el nombre de quien opina`);
    if (!avatarOk(el.avatar)) errors.push(`${tag}: la foto debe ser people:p01 … o una ruta de imagen`);
    if (el.stars !== undefined && !(Number(el.stars) >= 0 && Number(el.stars) <= 5)) errors.push(`${tag}: las estrellas van de 0 a 5`);
    const n = wordCount(el.quote);
    if (n > 25) warnings.push(`${tag}: el testimonio tiene ${n} palabras; con más de 25 cuesta leerlo en pantalla, acórtalo`);
    return { errors, warnings };
  },
  texts(el, add) {
    add(el.quote); add(el.name); add(el.role);
  },
  events(el, rect, { beats: B, add }) {
    add(B.blob[0], "pop");
    add(B.stars.start, "click");
  },
  draw: (ctx, el, t, env) => drawTestimonial(ctx, el, env.ts, env.tl, env.rect, env),
};
