// Transition "flashWhite": a quick white flash on the hit. Outgoing before the peak, incoming after it; white at u = 0.5.
import { easeInOut, easeOut, finishTo } from "./_helpers.js";

export default {
  name: "flashWhite",
  label: "Destello blanco",
  description: "Un destello blanco breve en el golpe",
  brief: [
    "Qué: destello blanco breve que marca el golpe; la escena saliente queda en blanco y entra la nueva.",
    "Cuándo: acento sobre un pulso fuerte o una cifra clave. No usar: para moverse entre temas (usar whipPan) ni dos veces seguidas.",
    "Coreografía: 0.2 s; el blanco está completo en u = 0.5; la entrada desacelera (curva out) desde el blanco.",
    "Gusto: blanco plano, sin glow ni halo; máximo un destello por escena.",
    "Sonido: un pop en el arranque, sobre el golpe."
  ].join("\n"),
  category: "Impacto",
  defaultDur: 0.2,
  minDur: 0.1,
  maxDur: 0.3,
  impact: 0.5,
  params: [],
  sfx: { kind: "pop", offset: 0 },
  audio: "dry",
  render(ctx, { from, to, u, W, H }) {
    if (u >= 1) return finishTo(ctx, to, W, H);
    ctx.save();
    ctx.globalAlpha = 1;
    if (u < 0.5) {
      ctx.drawImage(from, 0, 0, W, H);
      ctx.globalAlpha = easeInOut(u / 0.5);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, W, H);
    } else {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = easeOut((u - 0.5) / 0.5);
      ctx.drawImage(to, 0, 0, W, H);
    }
    ctx.restore();
  },
};
