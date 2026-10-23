// Transition "glitchRGB": RGB split (additive offset copies) plus blocky horizontal slices shifted by seeded offsets.
// The switch from `from` to `to` happens at u = 0.5, where the glitch is strongest.
import { finishTo, mulberry32 } from "./_helpers.js";

const SLICES = 12;

export default {
  name: "glitchRGB",
  label: "Glitch RGB",
  description: "Desfase de copias y franjas que se desplazan, para los golpes",
  brief: [
    "Qué: un golpe digital corto: copias desfasadas y franjas horizontales que saltan antes de caer en la escena nueva.",
    "Cuándo: acento sobre un pulso fuerte o un dato que aparece de golpe. No usar: como transición de tema (usar whipPan o pushSlide) ni en planos largos.",
    "Coreografía: 0.25 s; el pico está en u = 0.5, donde se cambia de escena; sin franjas en los extremos.",
    "Gusto: desfase neutro sin brillo aditivo ni neón; máximo una vez por video.",
    "Sonido: un whoosh corto en el arranque."
  ].join("\n"),
  category: "Impacto",
  defaultDur: 0.25,
  minDur: 0.1,
  maxDur: 0.27,
  impact: 0.5,
  params: [],
  sfx: { kind: "whoosh", offset: 0.2 },
  audio: "dry",
  render(ctx, { from, to, u, W, H, seed }) {
    if (u >= 1) return finishTo(ctx, to, W, H);
    const base = u < 0.5 ? from : to;
    const other = u < 0.5 ? to : from;
    const A = Math.sin(Math.PI * u);
    const rnd = mulberry32(Number(seed) + Math.floor(u * 8) * 7919);
    const dx = Math.round(14 * A);
    const h = H / SLICES;
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.drawImage(base, 0, 0, W, H);
    ctx.globalAlpha = 0.35 * A; // neutral ghost: no additive brightening (no glow)
    ctx.drawImage(base, dx, 0, W, H);
    ctx.drawImage(base, -dx, 0, W, H);
    ctx.globalAlpha = 1;
    for (let i = 0; i < SLICES; i += 1) {
      const hit = rnd() < 0.75 * A; // no slices at u = 0 and u = 1: the frame is exactly from / to there
      const off = Math.round((rnd() * 2 - 1) * 90 * A);
      if (hit) ctx.drawImage(other, 0, i * h, W, h, off, i * h, W, h);
    }
    ctx.restore();
  },
};
