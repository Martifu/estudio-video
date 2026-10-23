// Element "rating" of the motion library (group Personas): cinco estrellas que se llenan una a una, la calificación cuenta hasta su valor y, opcional, el número de reseñas.
// One file = one element type (see engine/README.md "Cómo agregar un elemento"). Timeline beats are in DESIGN seconds.
import { seg, expoOut, clamp } from "../ui-motion.js";
import { rr, fnt, text, card, beginCard, envelope, radiusAt } from "./_kit.js";
import { drawStar, popIn, childSpan, scoreFrom, countFrom, groupInt } from "./_personas.js";
import { FICTIONAL, UI_SOURCE } from "./_fields.js";

export const RATING = { w: 800, h: 270, starR: 40, starStep: 100, x0: 260, cy: 118 };

export const ratingTimeline = () => ({
  Ld: 3.0,
  b: {
    blob: [0, 0.45],
    stars: { start: 0.4, step: 0.12, dur: 0.3 },
    score: [0.4, 1.6],
    reviews: [0.6, 1.8],
    exit: [2.6, 3.0]
  }
});

function drawRating(ctx, el, ts, tl, rect, env) {
  const { skin } = env, C = skin.colors, b = tl.b;
  const w = rect.w, h = rect.h;
  const E = envelope(tl, ts);
  ctx.save();
  beginCard(ctx, el, tl, ts, rect, [w / 2, h / 2], E);
  const R = radiusAt(E, skin, w, h);
  card(ctx, 0, 0, w, h, R, skin);
  ctx.save();
  rr(ctx, 0, 0, w, h, R);
  ctx.clip();
  const score = clamp(Number(el.score) || 0, 0, 5);
  const k = seg(ts, b.score[0], b.score[1]);
  // one shared value drives the number and the stars, so they always agree: the count starts at 80 % of the score (no fake zero)
  // and lands exactly on e.g. "4.8"; the number is visible from its first frame
  const shownScore = k > 0 ? scoreFrom(score, k) : "";
  const shownNum = Number(shownScore) || 0;
  if (shownScore) {
    ctx.save();
    ctx.globalAlpha *= clamp(k * 4);
    text(ctx, shownScore, 48, RATING.cy, { font: fnt(skin, 700, 110), color: C.ink, ls: -2 });
    ctx.restore();
  }
  // five stars, popping and filling one by one (4.8 = four full, one 80 % filled)
  for (let i = 0; i < 5; i += 1) {
    const [a, a2] = childSpan(b.stars, i);
    const p = popIn(ts, a, a2 - a);
    if (p.alpha <= 0) continue;
    const cx = RATING.x0 + RATING.starR + i * RATING.starStep, cy = RATING.cy;
    const fill = clamp(shownNum - i) * expoOut(seg(ts, a + 0.05, a2));
    ctx.save();
    ctx.globalAlpha *= p.alpha;
    ctx.translate(cx, cy);
    ctx.scale(p.s, p.s);
    ctx.translate(-cx, -cy);
    drawStar(ctx, cx, cy, RATING.starR, fill, C.primary, C.line);
    ctx.restore();
  }
  // optional review count, fades in after the stars
  if (el.reviews !== undefined && el.reviews !== null && el.reviews !== "") {
    const rk = expoOut(seg(ts, b.reviews[0], b.reviews[1]));
    if (rk > 0) {
      const rv = seg(ts, b.reviews[0], b.reviews[1]);
      const shown = countFrom(Math.max(0, Math.round(Number(el.reviews) || 0)), rv);
      ctx.save();
      ctx.globalAlpha *= rk;
      text(ctx, `(${groupInt(shown)} reseñas)`, 48, 218, { font: fnt(skin, 600, 32), color: C.muted });
      ctx.restore();
    }
  }
  ctx.restore();
  ctx.restore();
}

export default {
  type: "rating",
  category: "Personas",
  captions: "option",
  label: "Calificación",
  description: "Cinco estrellas que se llenan y cuentan la calificación",
  brief: [
    "Qué: calificación de 0 a 5 con estrellas y el número de reseñas, para dar credibilidad a un negocio o producto.",
    "Cuándo: junto a un testimonio o una ficha de negocio. No usar: sin una fuente real de reseñas (el número sería inventado).",
    "Coreografía: la tarjeta nace, las cinco estrellas aparecen una a una y se llenan, la calificación sube desde un valor creíble hasta el exacto, y el conteo de reseñas aparece al final.",
    "Gusto: un acento (las estrellas primarias); la cifra grande es el héroe; sin cero falso al inicio.",
    "Datos: calificación y número de reseñas de la fuente indicada en source; nunca inventar la calificación."
  ].join("\n"),
  icon: "M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6-4.5-4.2 6.1-.7L12 3Z",
  defaults: (t, end) => ({
    type: "rating", in: t, out: Math.min(t + 3.4, end), score: 4.8, reviews: 1240,
    source: { ...FICTIONAL }
  }),
  fields: [
    { key: "score", label: "Calificación (0 a 5, ej. 4.8)", kind: "number", step: 0.1, min: 0, max: 5 },
    { key: "reviews", label: "Número de reseñas (opcional)", kind: "number", step: 1, min: 0, opt: true, ph: "sin reseñas" },
  ],
  source: UI_SOURCE,
  timeline: ratingTimeline,
  size: () => ({ w: RATING.w, h: RATING.h }),
  minScale: 0.76, // smallest text 32 px x 0.76 = 24 px
  showsNumbers: () => true,
  validate(el, tag) {
    const errors = [], warnings = [];
    const s = Number(el.score);
    if (el.score === undefined || el.score === "" || !(s >= 0 && s <= 5)) errors.push(`${tag}: la calificación va de 0 a 5`);
    if (el.reviews !== undefined && el.reviews !== "" && !(Number(el.reviews) >= 0)) errors.push(`${tag}: el número de reseñas no puede ser negativo`);
    if (el.score !== undefined && !el.source?.kind) warnings.push(`${tag}: indica de dónde sale la calificación (fuente de los datos)`);
    return { errors, warnings };
  },
  texts(el, add) {
    add(`${el.score}`);
  },
  events(el, rect, { beats: B, add }) {
    add(B.blob[0], "pop");
    add(B.stars.start, "pop");
  },
  draw: (ctx, el, t, env) => drawRating(ctx, el, env.ts, env.tl, env.rect, env),
};
