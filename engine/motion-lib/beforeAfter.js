// Element "beforeAfter" of the motion library (grupo Inmobiliario): dos imágenes (obra / terminado, render / real) con un deslizador que barre de derecha a izquierda.
// One file = one element type. Photos are shown as they are (never cut out). Timeline beats are in DESIGN seconds.
import { seg, expoOut, outBack, inOut, lerp, CARD_W } from "../ui-motion.js";
import { rr, fnt, text, card, radiusAt, envelope, beginCard, coverImage, shadow, noShadow, disc } from "./_kit.js";
import { FICTIONAL, UI_SOURCE } from "./_fields.js";
import { PHOTO_FIELD, SLOT_FIELD } from "./_inmo.js";

export const BA = { w: CARD_W, h: 640, bar: 96, pad: 30 };
export const baTimeline = () => ({
  Ld: 3.8,
  b: { blob: [0, 0.5], frame: [0, 0.4], sweep: [0.5, 2.3], labelBefore: [0.25, 0.6], labelAfter: [2.3, 2.7], caption: [2.7, 3.1], exit: [3.45, 3.8] }
});
/** Slider x inside the image box: starts at the right edge (all "Antes" visible) and sweeps to the middle. */
export const sliderX = (ts, tl, width) => lerp(width, width / 2, inOut(seg(ts, tl.b.sweep[0], tl.b.sweep[1])));
/** A side without image shows its word only when its visible part is wide enough to hold it clear of the handle. */
export const PLACEHOLDER_MIN_ROOM = 300;

/** One side of the comparison: a cover image (or a flat fill) clipped to its visible width `clipW`. */
function drawSide(ctx, img, x, y, w, h, zoom, clipW, fill) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, clipW, h);
  ctx.clip();
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, w, h);
  if (img) {
    ctx.translate(x + w / 2, y + h / 2);
    ctx.scale(zoom, zoom);
    ctx.translate(-(x + w / 2), -(y + h / 2));
    coverImage(ctx, img, x, y, w, h, 0);
  }
  ctx.restore();
}

function drawBA(ctx, el, ts, tl, rect, env) {
  const { skin } = env, C = skin.colors, b = tl.b;
  const w = rect.w, h = rect.h;
  const E = envelope(tl, ts);
  beginCard(ctx, el, tl, ts, rect, [w / 2, h / 2], E);
  const R = radiusAt(E, skin, w, h);
  card(ctx, 0, 0, w, h, R, skin);
  ctx.save();
  rr(ctx, 0, 0, w, h, R);
  ctx.clip();
  ctx.globalAlpha = E.alpha;
  const imgH = h - (el.caption ? BA.bar : 0);
  const before = el.before ? env.img(el.before) : null;
  const after = el.after ? env.img(el.after) : null;
  const frameK = expoOut(seg(ts, b.frame[0], b.frame[1]));
  const zoom = 1.04 - 0.04 * frameK;
  const sx = sliderX(ts, tl, w) * frameK + (1 - frameK) * w;
  // the after image fills the frame; the before image covers the left part up to the slider
  drawSide(ctx, after, 0, 0, w, imgH, zoom, w, C.panel);
  drawSide(ctx, before, 0, 0, w, imgH, zoom, sx, C.line);
  // without images, each word sits in the middle of its own visible part, so the handle never crosses it
  const word = (s, cx, room) => { if (room >= PLACEHOLDER_MIN_ROOM) text(ctx, s, cx, imgH / 2, { font: fnt(skin, 700, 40), color: C.muted, align: "center" }); };
  if (!after) word("Después", (sx + w) / 2, w - sx);
  if (!before) word("Antes", sx / 2, sx);
  // slider: a white line with a round handle and two chevrons
  if (frameK > 0.05) {
    ctx.save();
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(sx - 3, 0, 6, imgH);
    shadow(ctx, "rgba(16,24,40,0.3)", 22, 6);
    disc(ctx, sx, imgH / 2, 36, "#FFFFFF");
    noShadow(ctx);
    ctx.strokeStyle = C.accent;
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath(); ctx.moveTo(sx - 9, imgH / 2 - 12); ctx.lineTo(sx - 18, imgH / 2); ctx.lineTo(sx - 9, imgH / 2 + 12); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sx + 9, imgH / 2 - 12); ctx.lineTo(sx + 18, imgH / 2); ctx.lineTo(sx + 9, imgH / 2 + 12); ctx.stroke();
    ctx.restore();
  }
  // labels in the top corners, away from the handle (at mid height): "Antes" left, "Después" right (right-anchored)
  const pill = (s, x, y, a, right = false) => {
    const k = expoOut(seg(ts, a[0], a[1]));
    if (k <= 0) return;
    ctx.save();
    ctx.font = fnt(skin, 700, 34);
    const tw = ctx.measureText(s).width + 44;
    const left = right ? x - tw : x;
    const sc = lerp(0.6, 1, outBack(seg(ts, a[0], a[1])));
    ctx.globalAlpha = E.alpha * Math.min(1, k * 2);
    ctx.translate(left + tw / 2, y);
    ctx.scale(sc, sc);
    ctx.fillStyle = C.surface;
    rr(ctx, -tw / 2, -28, tw, 56, 28);
    ctx.fill();
    text(ctx, s, 0, 1, { font: fnt(skin, 700, 34), color: C.ink, align: "center" });
    ctx.restore();
  };
  pill(el.labelBefore || "Antes", 36, 44, b.labelBefore);
  pill(el.labelAfter || "Después", w - 36, 44, b.labelAfter, true);
  // optional caption bar at the bottom
  if (el.caption) {
    const ck = expoOut(seg(ts, b.caption[0], b.caption[1]));
    ctx.save();
    ctx.globalAlpha = E.alpha * ck;
    ctx.fillStyle = C.surface;
    ctx.fillRect(0, imgH, w, BA.bar);
    text(ctx, el.caption, BA.pad + 14, imgH + BA.bar / 2, { font: fnt(skin, 600, 36), color: C.ink, maxW: w - BA.pad * 2 - 28 });
    ctx.restore();
  }
  ctx.restore();
  ctx.restore();
}

export default {
  type: "beforeAfter",
  category: "Inmobiliario",
  usesSkin: true, // reads env.skin (ui-skin colours / status table / font): overlay copies ui-skin.json when it is set
  label: "Antes y después",
  timelineLabel: "Inmobiliario: antes y después",
  description: "Dos imágenes con un deslizador que barre: obra y terminado, o render y real",
  brief: [
    "Qué: dos imágenes (obra y terminado, render y real) con un deslizador que barre de derecha a izquierda.",
    "Cuándo: la voz compara el antes y el después de una obra o un render. No usar: dos cifras (usa comparisonBars) ni una sola foto (usa unitCard).",
    "Coreografía: nace la tarjeta, el deslizador entra por la derecha con las dos etiquetas, barre hasta la mitad, aparece la etiqueta de la derecha y el pie; todo sale en 0.5 s.",
    "Gusto: las etiquetas viven en su propia mitad, lejos del tirador; el tirador es blanco con un acento; sin imágenes, el texto de cada mitad se centra en esa mitad, nunca cruzado por la línea.",
    "Datos: fotos reales del proyecto (obra y terminado) entregadas por el usuario; nunca montajes presentados como reales; source obligatorio."
  ].join("\n"),
  icon: "M3 5h18v14H3zM12 5v14M8 10l-2 2 2 2M16 10l2 2-2 2",
  textKey: "labelAfter",
  captions: "option",
  minScale: 0.88,
  defaults: (t, end) => ({
    type: "beforeAfter", in: t, out: Math.min(t + 3.8, end), before: "reda/gal1.png", after: "reda/model-A.png",
    labelBefore: "Antes", labelAfter: "Después", caption: "Obra gris y terminado",
    source: { ...FICTIONAL }
  }),
  fields: [
    PHOTO_FIELD("Imagen de «Antes» (obra, render…)", "before"),
    PHOTO_FIELD("Imagen de «Después» (terminado, real…)", "after"),
    { key: "labelBefore", label: "Etiqueta izquierda", kind: "text", opt: true, ph: "Antes" },
    { key: "labelAfter", label: "Etiqueta derecha", kind: "text", opt: true, ph: "Después" },
    { key: "caption", label: "Pie (opcional)", kind: "text", opt: true },
    SLOT_FIELD
  ],
  source: UI_SOURCE,
  timeline: baTimeline,
  size: (el) => ({ w: BA.w, h: BA.h }),
  imageRefs(el, add) { add(el.before, "antes"); add(el.after, "después"); },
  showsNumbers: () => false,
  validate(el, tag) {
    const errors = [], warnings = [];
    if (!el.before || !el.after) errors.push(`${tag}: necesita las dos imágenes (antes y después)`);
    return { errors, warnings };
  },
  texts(el, add) {
    add(el.labelBefore); add(el.labelAfter); add(el.caption);
  },
  events(el, rect, { beats: B, add }) {
    add(B.sweep[0], "whoosh");
    add(B.labelAfter[0], "pop");
  },
  draw: (ctx, el, t, env) => drawBA(ctx, el, env.ts, env.tl, env.rect, env),
};
