// Element "stampText" of the motion library (grupo Venta): palabra de sello ("APARTADO", "VENDIDO", "NUEVO") que cae con un temblor corto.
// The ink texture is deterministic (specks from a seed made of the element id), never random. Subtle, not grungy.
// Timeline beats are in DESIGN seconds; the registry (index.js) scales them to [in, out]. Drawing is a pure function of the local time.
import { seg, expoOut } from "../ui-motion.js";
import { rr, fnt, text } from "./_kit.js";
import { speckles, pushed, slotCandidates } from "./_venta.js";
import { UI_SCREEN } from "./_fields.js";

export const STAMP = { w: 880, h: 300, inset: 20 };
export const stampTimeline = () => ({ Ld: 2.2, b: { slam: [0, 0.16], shake: [0.16, 0.56], exit: [1.95, 2.2] } });

function drawStamp(ctx, el, ts, tl, rect, env) {
  const { skin } = env, C = skin.colors, b = tl.b;
  const x = seg(ts, b.exit[0], b.exit[1]); // exit 0.25 s: a short fade with a little shrink, no ghost
  const out = (1 - x);
  const k = seg(ts, b.slam[0], b.slam[1]);
  const scale = (1 + 0.7 * (1 - expoOut(k))) * (1 - 0.04 * x); // falls from 1.7x to 1x, no overshoot: it lands on the surface
  const sh = seg(ts, b.shake[0], b.shake[1]);
  const jx = sh > 0 && sh < 1 ? 4 * Math.sin(2 * Math.PI * 3 * sh) * (1 - sh) : 0;
  const jy = sh > 0 && sh < 1 ? 2 * Math.cos(2 * Math.PI * 3 * sh) * (1 - sh) : 0;
  const ink = el.color === "danger" ? C.danger : C.primary;
  const w = rect.w, h = rect.h;
  ctx.save();
  ctx.globalAlpha = Math.min(1, k * 6) * out;
  ctx.translate(rect.x + w / 2 + jx, rect.y + h / 2 + jy);
  ctx.rotate(-0.12);
  ctx.scale(scale, scale);
  ctx.strokeStyle = ink; ctx.lineWidth = 16;
  rr(ctx, -w / 2 + 12, -h / 2 + 12, w - 24, h - 24, 22);
  ctx.stroke();
  ctx.lineWidth = 5;
  rr(ctx, -w / 2 + 12 + STAMP.inset, -h / 2 + 12 + STAMP.inset, w - 24 - STAMP.inset * 2, h - 24 - STAMP.inset * 2, 12);
  ctx.stroke();
  // the word fits the frame (150 px down to 56 px)
  const word = String(el.text ?? "");
  let px = 150;
  ctx.font = fnt(skin, 800, px);
  while (px > 56 && ctx.measureText(word).width > w - 180) { px -= 4; ctx.font = fnt(skin, 800, px); }
  text(ctx, word, 0, 0, { font: fnt(skin, 800, px), color: ink, align: "center", ls: 4 });
  // ink texture: paper showing through as small specks (deterministic)
  ctx.fillStyle = "#FFFFFF";
  for (const s of speckles(el.id ?? word, 70, w - 40, h - 40)) {
    ctx.globalAlpha = Math.min(1, k * 6) * out * s.a;
    ctx.beginPath();
    ctx.arc(s.x - (w - 40) / 2, s.y - (h - 40) / 2, s.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export default {
  type: "stampText",
  category: "Venta",
  captions: "option", // subtitles hide while the element is on screen (element.captions "keep" keeps them), like the screens
  label: "Sello de texto",
  description: "Una palabra de sello (APARTADO, VENDIDO) que cae con tinta",
  brief: [
    "Qué: una palabra de sello (\"APROBADO\", \"VENDIDO\") que se estampa con un golpe.",
    "Cuándo: marcar un estado final sobre una imagen o tarjeta. No usar: para una oferta con porcentaje (offerBadge) ni para un titular animado (kineticWord).",
    "Coreografía: la palabra se estampa con un golpe corto de 0.18 s; se queda; sale corta (≈0.25 s) sin ghosts.",
    "Gusto: un golpe seco, sin resplandor ni sombra difusa; una sola tinta de acento; el texto nunca se corta.",
    "Datos: palabra escrita por el usuario; sin datos reales de clientes."
  ].join("\n"),
  icon: "M5 4h14v6H5zM4 16h16M8 20h8",
  textKey: "text",
  defaults: (t, end) => ({ type: "stampText", in: t, out: Math.min(t + 2.4, end), text: "APARTADO" }),
  fields: [
    { key: "text", label: "Palabra del sello (ej. APARTADO, VENDIDO)", kind: "text" },
    { key: "color", label: "Color", kind: "select", options: [["primary", "Color de la marca"], ["danger", "Rojo de aviso"]], opt: true, ph: "color de la marca" },
  ],
  screen: UI_SCREEN(false),
  candidates: (el, zones) => slotCandidates(el, zones, STAMP.w, STAMP.h, "stamp"),
  timeline: stampTimeline,
  size: () => ({ w: STAMP.w, h: STAMP.h }),
  validate(el, tag) {
    const errors = [], warnings = [];
    if (!el.text) errors.push(`${tag}: necesita la palabra del sello`);
    else if (String(el.text).length > 14) warnings.push(`${tag}: una palabra corta se lee mejor en un sello (hoy ${String(el.text).length} letras)`);
    return { errors, warnings };
  },
  texts(el, add) {
    add(el.text);
  },
  events(el, rect, { beats: B, add }) {
    add(B.slam[1], "pop");
  },
  draw: (ctx, el, t, env) => pushed(ctx, el, env.ts, env.tl, env.rect, () => drawStamp(ctx, el, env.ts, env.tl, env.rect, env)),
};
