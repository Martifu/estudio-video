// Element "floorPlanReveal" of the motion library (grupo Inmobiliario): plano que se revela con un trazo de dibujo y etiquetas que se fijan con línea guía.
// Draws the plan from `rooms` (0..1 rectangles) when there is no image. One file = one element type. Timeline beats are in DESIGN seconds.
import { seg, expoOut, outBack, lerp, clamp } from "../ui-motion.js";
import { rr, fnt, text, card, radiusAt, envelope, beginCard, disc, hexA, shadow, noShadow } from "./_kit.js";
import { FICTIONAL, UI_SOURCE } from "./_fields.js";
import { SLOT_FIELD, PHOTO_FIELD } from "./_inmo.js";

export const PLAN = { w: 900, h: 700, x: 40, y: 120, bw: 820, bh: 530 };
export const planTimeline = (el) => {
  const labels = Math.min(6, (el.labels ?? []).length), dims = Math.min(4, (el.dims ?? []).length);
  const lab = Array.from({ length: labels }, (_, i) => [1.5 + i * 0.3, 1.5 + i * 0.3 + 0.4]);
  const dimStart = 1.5 + labels * 0.3 + 0.1;
  const dim = Array.from({ length: dims }, (_, i) => [dimStart + i * 0.3, dimStart + i * 0.3 + 0.35]);
  const exit = Math.max(3.5, dimStart + dims * 0.3 + 0.6);
  return { Ld: exit + 0.35, b: { blob: [0, 0.5], wipe: [0.2, 1.4], lab, dim, exit: [exit, exit + 0.35] } };
};

function strokeRect(ctx, x, y, w, h, lw, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.lineJoin = "miter";
  ctx.strokeRect(x, y, w, h);
}
function drawLine(ctx, x1, y1, x2, y2, p, color, lw) {
  if (p <= 0) return;
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x1 + (x2 - x1) * p, y1 + (y2 - y1) * p);
  ctx.stroke();
}

function drawPlanBody(ctx, el, env, box) {
  const { skin } = env, C = skin.colors;
  const img = el.image ? env.img(el.image) : null;
  if (img) {
    const s = Math.min(box.w / img.width, box.h / img.height);
    ctx.drawImage(img, box.x + (box.w - img.width * s) / 2, box.y + (box.h - img.height * s) / 2, img.width * s, img.height * s);
    return;
  }
  for (const r of el.rooms ?? []) {
    ctx.fillStyle = C.panel;
    ctx.fillRect(box.x + r.x * box.w, box.y + r.y * box.h, r.w * box.w, r.h * box.h);
    strokeRect(ctx, box.x + r.x * box.w, box.y + r.y * box.h, r.w * box.w, r.h * box.h, 9, C.ink);
  }
}

function drawPlan(ctx, el, ts, tl, rect, env) {
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
  if (el.title) text(ctx, el.title, PLAN.x, 62, { font: fnt(skin, 700, 46), color: C.ink, maxW: w - PLAN.x * 2 });
  const box = { x: PLAN.x, y: PLAN.y, w: PLAN.bw, h: PLAN.bh };
  // drawing wipe: the plan is revealed left to right behind a pen tip
  const wk = expoOut(seg(ts, b.wipe[0], b.wipe[1]));
  ctx.save();
  ctx.beginPath();
  ctx.rect(box.x - 30, box.y - 30, box.w * wk + 30, box.h + 60);
  ctx.clip();
  drawPlanBody(ctx, el, env, box);
  ctx.restore();
  if (wk > 0 && wk < 1) {
    const px = box.x + box.w * wk;
    drawLine(ctx, px, box.y - 20, px, box.y + box.h + 20, 1, C.accent, 6);
    disc(ctx, px, box.y - 20, 9, C.accent);
  }
  // dimension callouts: a line that draws, then its value
  (el.dims ?? []).slice(0, 4).forEach((d, i) => {
    const s = seg(ts, b.dim[i][0], b.dim[i][1]);
    if (s <= 0) return;
    const x1 = box.x + d.x1 * box.w, y1 = box.y + d.y1 * box.h, x2 = box.x + d.x2 * box.w, y2 = box.y + d.y2 * box.h;
    ctx.save();
    drawLine(ctx, x1, y1, x2, y2, expoOut(s), C.muted, 3);
    if (s >= 1 || s > 0.4) {
      const k = clamp((s - 0.4) / 0.6);
      ctx.globalAlpha = E.alpha * k;
      ctx.font = fnt(skin, 700, 30);
      const tw = ctx.measureText(d.text ?? "").width + 28;
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
      ctx.fillStyle = C.surface;
      rr(ctx, mx - tw / 2, my - 23, tw, 46, 14);
      ctx.fill();
      text(ctx, d.text ?? "", mx, my + 1, { font: fnt(skin, 700, 30), color: C.muted, align: "center" });
    }
    ctx.restore();
  });
  // labels pin in: an anchor dot, a leader line to the label, then the label box
  (el.labels ?? []).slice(0, 6).forEach((l, i) => {
    const start = b.lab[i][0];
    const ks = expoOut(seg(ts, start, start + 0.2));
    if (ks <= 0) return;
    const ax = box.x + l.x * box.w, ay = box.y + l.y * box.h;
    // lx = the label box edge (left edge for "der", right edge for "izq"), ly = its height; both 0..1 of the plan
    const side = l.side === "izq" ? -1 : 1;
    const ey = box.y + (l.ly ?? l.y) * box.h;
    const ex = clamp(box.x + (l.lx ?? (side > 0 ? 0.02 : 0.98)) * box.w, 60, w - 60);
    drawLine(ctx, ax, ay, ex, ey, expoOut(seg(ts, start, start + 0.2)), C.ink, 3);
    ctx.save();
    ctx.globalAlpha = E.alpha * clamp(ks * 2);
    disc(ctx, ax, ay, 9 * ks, C.accent);
    ctx.restore();
    const lk = outBack(seg(ts, start + 0.15, start + 0.4));
    ctx.save();
    ctx.globalAlpha = E.alpha * clamp(lk * 2);
    ctx.font = fnt(skin, 700, 32);
    const tw = ctx.measureText(l.text ?? "").width + 48;
    const bx = side > 0 ? ex : ex - tw;
    ctx.translate(bx + tw / 2, ey);
    ctx.scale(lerp(0.6, 1, lk), lerp(0.6, 1, lk));
    shadow(ctx, "rgba(16,24,40,0.18)", 18, 8);
    ctx.fillStyle = C.surface;
    rr(ctx, -tw / 2, -32, tw, 64, 16);
    ctx.fill();
    noShadow(ctx);
    ctx.strokeStyle = C.accent;
    ctx.lineWidth = 3;
    rr(ctx, -tw / 2, -32, tw, 64, 16);
    ctx.stroke();
    text(ctx, l.text ?? "", 0, 1, { font: fnt(skin, 700, 32), color: C.ink, align: "center" });
    ctx.restore();
  });
  ctx.restore();
  ctx.restore();
}

export default {
  type: "floorPlanReveal",
  category: "Inmobiliario",
  usesSkin: true, // reads env.skin (ui-skin colours / status table / font): overlay copies ui-skin.json when it is set
  label: "Plano que se revela",
  timelineLabel: "Inmobiliario: plano",
  description: "Plano que se dibuja y etiquetas de cada espacio con línea guía",
  brief: [
    "Qué: plano de la distribución que se dibuja de izquierda a derecha y etiqueta cada espacio, con sus cotas.",
    "Cuándo: la voz explica cómo se distribuye la unidad. No usar: la foto de un espacio (beforeAfter o unitCard) ni un mapa (mapPin).",
    "Coreografía: un trazo de pluma revela el plano, luego cada etiqueta se fija con su línea guía, luego las cotas; todo sale junto en 0.45 s.",
    "Gusto: muros nítidos y finos, sin relleno de color más que el panel suave; etiquetas con sombra suave y texto ≥ 28 px; ninguna etiqueta encima de otra.",
    "Datos: medidas y espacios del plano del desarrollo (fuente: plano entregado por el cliente); nunca medidas inventadas; source obligatorio."
  ].join("\n"),
  icon: "M3 3h18v18H3zM3 11h9M12 3v8M12 14v7",
  textKey: "title",
  captions: "option",
  minScale: 0.88,
  defaults: (t, end) => ({
    type: "floorPlanReveal", in: t, out: Math.min(t + 4.2, end), title: "Distribución · 2 recámaras",
    rooms: [
      { x: 0.02, y: 0.04, w: 0.5, h: 0.56 }, { x: 0.02, y: 0.6, w: 0.22, h: 0.36 }, { x: 0.24, y: 0.6, w: 0.28, h: 0.36 },
      { x: 0.52, y: 0.04, w: 0.46, h: 0.46 }, { x: 0.52, y: 0.5, w: 0.46, h: 0.46 }
    ],
    labels: [
      { text: "Sala-comedor", x: 0.25, y: 0.3, side: "der", lx: 0.06, ly: 0.2 },
      { text: "Cocina", x: 0.13, y: 0.8, side: "der", lx: 0.06, ly: 0.9 },
      { text: "Recámara 1", x: 0.75, y: 0.22, side: "izq", lx: 0.98, ly: 0.2 },
      { text: "Recámara 2", x: 0.75, y: 0.74, side: "izq", lx: 0.98, ly: 0.86 }
    ],
    dims: [{ text: "4.20 m", x1: 0.02, y1: -0.03, x2: 0.52, y2: -0.03 }],
    source: { ...FICTIONAL }
  }),
  fields: [
    { key: "title", label: "Título (opcional)", kind: "text", opt: true },
    PHOTO_FIELD("Imagen del plano (opcional; si no, se dibuja con «Espacios»)", "image"),
    {
      key: "rooms", label: "Espacios para dibujar el plano (0 a 1: x, y, ancho, alto)", kind: "blocks", prop: "rooms", min: 0, max: 12,
      blank: () => ({ x: 0.1, y: 0.1, w: 0.3, h: 0.3 }),
      fields: () => [
        { key: "x", label: "x (0 a 1)", kind: "number", step: 0.01, min: 0, max: 1 },
        { key: "y", label: "y (0 a 1)", kind: "number", step: 0.01, min: 0, max: 1 },
        { key: "w", label: "Ancho (0 a 1)", kind: "number", step: 0.01, min: 0, max: 1 },
        { key: "h", label: "Alto (0 a 1)", kind: "number", step: 0.01, min: 0, max: 1 }
      ],
      name: (r) => `Espacio ${Math.round(r.x * 100)},${Math.round(r.y * 100)}`
    },
    {
      key: "labels", label: "Etiquetas (1 a 6)", kind: "blocks", prop: "labels", min: 1, max: 6,
      blank: () => ({ text: "Recámara", x: 0.5, y: 0.5, side: "der" }),
      fields: () => [
        { key: "text", label: "Texto (ej. Recámara 1)", kind: "text" },
        { key: "x", label: "Punto x (0 a 1)", kind: "number", step: 0.01, min: 0, max: 1 },
        { key: "y", label: "Punto y (0 a 1)", kind: "number", step: 0.01, min: 0, max: 1 },
        { key: "side", label: "La etiqueta va", kind: "select", options: [["der", "A la derecha"], ["izq", "A la izquierda"]] },
        { key: "lx", label: "Borde de la etiqueta x (0 a 1; opcional)", kind: "number", step: 0.01, min: 0, max: 1, opt: true },
        { key: "ly", label: "Altura de la etiqueta y (0 a 1; opcional)", kind: "number", step: 0.01, min: 0, max: 1, opt: true }
      ],
      name: (r) => r.text || "Etiqueta"
    },
    {
      key: "dims", label: "Cotas (opcional: medidas que da el plano)", kind: "blocks", prop: "dims", min: 0, max: 4,
      blank: () => ({ text: "3.00 m", x1: 0.1, y1: 0, x2: 0.4, y2: 0 }),
      fields: () => [
        { key: "text", label: "Medida (tal cual viene del plano)", kind: "text" },
        { key: "x1", label: "Inicio x (0 a 1)", kind: "number", step: 0.01, min: -1, max: 1 },
        { key: "y1", label: "Inicio y (0 a 1)", kind: "number", step: 0.01, min: -1, max: 1 },
        { key: "x2", label: "Fin x (0 a 1)", kind: "number", step: 0.01, min: -1, max: 1 },
        { key: "y2", label: "Fin y (0 a 1)", kind: "number", step: 0.01, min: -1, max: 1 }
      ],
      name: (r) => r.text || "Cota"
    },
    SLOT_FIELD
  ],
  source: UI_SOURCE,
  timeline: planTimeline,
  size: () => ({ w: PLAN.w, h: PLAN.h }),
  imageRefs(el, add) { add(el.image, "plano"); },
  showsNumbers: (el) => (el.dims ?? []).length > 0,
  validate(el, tag) {
    const errors = [], warnings = [];
    if (!el.image && !(el.rooms ?? []).length) errors.push(`${tag}: necesita una imagen del plano o al menos un espacio`);
    if ((el.labels ?? []).length > 6) warnings.push(`${tag}: solo se ven 6 etiquetas`);
    if ((el.dims ?? []).some((d) => !d.text)) errors.push(`${tag}: cada cota necesita su medida`);
    if ((el.dims ?? []).length && !el.source) warnings.push(`${tag}: las cotas necesitan de dónde salen (Fuente de los datos)`);
    return { errors, warnings };
  },
  texts(el, add) {
    add(el.title);
    for (const l of el.labels ?? []) add(l.text);
    for (const d of el.dims ?? []) add(d.text);
  },
  events(el, rect, { beats: B, add }) {
    add(B.wipe[0], "whoosh");
    (B.lab ?? []).forEach((span) => add(span[0], "pop"));
  },
  draw: (ctx, el, t, env) => drawPlan(ctx, el, env.ts, env.tl, env.rect, env),
};
