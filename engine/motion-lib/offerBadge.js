// Element "offerBadge" of the motion library (grupo Venta): sello circular plano ("-15%", "6 MESES GRATIS") que gira un poco y aterriza. Sin starburst.
// Timeline beats are in DESIGN seconds; the registry (index.js) scales them to [in, out]. Drawing is a pure function of the local time.
import { seg, expoOut, lerp } from "../ui-motion.js";
import { fnt, text } from "./_kit.js";
import { onPrimary, pushed, slotCandidates } from "./_venta.js";
import { UI_SOURCE, FICTIONAL, UI_SCREEN } from "./_fields.js";

export const BADGE = { size: 360, r: 170 };
export const badgeTimeline = () => ({ Ld: 2.4, b: { land: [0, 0.22], exit: [2.2, 2.4] } });

function drawBadge(ctx, el, ts, tl, rect, env) {
  const { skin } = env, C = skin.colors, b = tl.b;
  const p = seg(ts, b.land[0], b.land[1]);           // the hit: 0.22 s
  const x = seg(ts, b.exit[0], b.exit[1]);           // the exit: 0.2 s, shrinks a little, no turn
  const out = 1 - x;
  // punch: 1.22x -> 0.96x -> 1x (no glow, no overshoot past the rest size)
  const punch = p < 0.5 ? lerp(1.22, 0.96, expoOut(p * 2)) : lerp(0.96, 1, expoOut((p - 0.5) * 2));
  const sc = (p < 1 ? punch : 1) * lerp(1, 0.96, x);
  const rot = (1 - expoOut(p)) * -0.12;
  const alpha = Math.min(1, p * 4) * out;
  const cx = rect.x + BADGE.size / 2, cy = rect.y + BADGE.size / 2;
  const on = onPrimary(C.primary);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(cx, cy);
  ctx.rotate(rot);
  ctx.scale(sc, sc);
  // flat disc in the brand primary with one thin inner ring
  ctx.fillStyle = C.primary;
  ctx.beginPath(); ctx.arc(0, 0, BADGE.r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = on; ctx.globalAlpha = alpha * 0.85; ctx.lineWidth = 6;
  ctx.beginPath(); ctx.arc(0, 0, BADGE.r * 0.86, 0, Math.PI * 2); ctx.stroke();
  ctx.globalAlpha = alpha;
  // main text fits the disc (120 px down to 56 px); the optional sub line sits under it
  let px = 120;
  const main = String(el.text ?? "");
  ctx.font = fnt(skin, 800, px);
  while (px > 56 && ctx.measureText(main).width > BADGE.r * 1.45) { px -= 4; ctx.font = fnt(skin, 800, px); }
  text(ctx, main, 0, el.sub ? -18 : 0, { font: fnt(skin, 800, px), color: on, align: "center" });
  if (el.sub) text(ctx, el.sub, 0, 62, { font: fnt(skin, 700, 32), color: on, align: "center", maxW: BADGE.r * 1.5 });
  ctx.restore();
}

export default {
  type: "offerBadge",
  category: "Venta",
  captions: "option", // subtitles hide while the element is on screen (element.captions "keep" keeps them), like the screens
  label: "Sello de oferta",
  description: "Un sello plano con el descuento o la promoción, que gira y aterriza",
  brief: [
    "Qué: sello de oferta (\"-20 %\", \"2x1\") que golpea sobre algo.",
    "Cuándo: destacar un descuento o una promoción puntual. No usar: para un precio completo (priceTag) ni para una cuenta regresiva (countdown).",
    "Coreografía: el sello cae y golpea en 0.2 s con una pequeña compresión; se queda; sale corto (≈0.25 s).",
    "Gusto: un golpe, nada de brillo ni resplandor; contraste total del texto; salida corta y sin fantasmas semitransparentes.",
    "Datos: porcentaje o texto escrito por el usuario; sin datos reales de clientes."
  ].join("\n"),
  icon: "M12 3a9 9 0 100 18 9 9 0 000-18zM12 8v8M9 11h6",
  textKey: "text",
  defaults: (t, end) => ({ type: "offerBadge", in: t, out: Math.min(t + 3, end), text: "-15%", sub: "de descuento", source: { ...FICTIONAL } }),
  fields: [
    { key: "text", label: "Texto grande (ej. -15% o 6 MESES)", kind: "text" },
    { key: "sub", label: "Texto chico (opcional, ej. GRATIS)", kind: "text", opt: true },
  ],
  source: UI_SOURCE,
  screen: UI_SCREEN(false),
  candidates: (el, zones) => slotCandidates(el, zones, BADGE.size, BADGE.size, "badge"), // the sticker keeps its size: no scale variants (drawn at its own size)
  timeline: badgeTimeline,
  size: () => ({ w: BADGE.size, h: BADGE.size }),
  showsNumbers: (el) => /\d/.test(String(el.text ?? "")),
  validate(el, tag) {
    const errors = [], warnings = [];
    if (!el.text) errors.push(`${tag}: necesita el texto grande`);
    if (/\d/.test(String(el.text ?? "")) && !el.source?.kind) warnings.push(`${tag}: el sello tiene una cifra: indica de dónde sale (Fuente de los datos)`);
    return { errors, warnings };
  },
  texts(el, add) {
    add(el.text); add(el.sub);
  },
  events(el, rect, { beats: B, add }) {
    add(B.land[1], "pop");
  },
  draw: (ctx, el, t, env) => pushed(ctx, el, env.ts, env.tl, env.rect, () => drawBadge(ctx, el, env.ts, env.tl, env.rect, env)),
};
