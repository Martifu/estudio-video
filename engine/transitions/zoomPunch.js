// Transition "zoomPunch": the outgoing scene zooms in with a soft trailing copy, the cut lands on the beat (u = 0.5),
// and the incoming scene starts a little zoomed out and settles to 1.
import { colorOr, drawScaled, easeIn, easeOut, finishTo } from "./_helpers.js";

export default {
  name: "zoomPunch",
  label: "Zoom de golpe",
  description: "Acercamiento que corta sobre el pulso de la música",
  brief: [
    "Qué: acercamiento fuerte de la escena saliente que corta sobre el pulso; la nueva entra un poco alejada y se asienta.",
    "Cuándo: cortes sobre el pulso de la música en un ritmo punchy. No usar: en momentos tranquilos o de voz (usar cut o blurCross).",
    "Coreografía: 0.3 s; la escena saliente sube a 1.35 con una copia suave detrás; en u = 0.5 cae el corte sobre fondo de tinta y la entrada se asienta de 0.92 a 1.",
    "Gusto: copia trasera a 30 % de opacidad, sin brillo; el fondo es el color de tinta de la marca.",
    "Sonido: un pop sobre el corte."
  ].join("\n"),
  category: "Movimiento",
  defaultDur: 0.3,
  minDur: 0.15,
  maxDur: 0.5,
  impact: 0.5,
  params: [],
  sfx: { kind: "pop", offset: 0 },
  audio: "dry",
  render(ctx, { from, to, u, W, H, brand }) {
    if (u >= 1) return finishTo(ctx, to, W, H);
    ctx.save();
    ctx.globalAlpha = 1;
    if (u < 0.5) {
      const s = 1 + 0.35 * easeIn(u / 0.5);
      drawScaled(ctx, from, s, W, H);
      drawScaled(ctx, from, 1 + 0.6 * (s - 1), W, H, 0.3);
    } else {
      ctx.fillStyle = colorOr(brand?.ink, "#000000");
      ctx.fillRect(0, 0, W, H);
      drawScaled(ctx, to, 0.92 + 0.08 * easeOut((u - 0.5) / 0.5), W, H);
    }
    ctx.restore();
  },
};
