// Transition "fadeColor": the outgoing scene fades through a solid colour (black or white) and the colour fades into the incoming scene.
// The colour is full at u = 0.5. Meant for the close of the video.
import { easeInOut, finishTo, readParams } from "./_helpers.js";

const PARAMS = [
  { key: "color", label: "Color", kind: "select", default: "negro", options: [["negro", "Negro"], ["blanco", "Blanco"]] },
];

export default {
  name: "fadeColor",
  label: "Fundido a color",
  description: "Pasa por negro o blanco, pensado para el cierre",
  brief: [
    "Qué: la escena se funde a negro o a blanco y desde ese color aparece la siguiente.",
    "Cuándo: solo para el cierre del video o un respiro largo antes del CTA. No usar: entre planos de contenido (es un corte de cierre, no de tema).",
    "Coreografía: 0.5 s; la primera mitad lleva la escena al color (curva inOut), la segunda la revela desde el color.",
    "Gusto: color plano, sin brillo ni degradado; el negro es el default, el blanco solo si el cierre es claro.",
    "Sonido: el audio hace crossfade con la imagen."
  ].join("\n"),
  category: "Suave",
  defaultDur: 0.5,
  minDur: 0.25,
  maxDur: 1.2,
  impact: 0.5,
  params: PARAMS,
  sfx: null,
  audio: "crossfade",
  render(ctx, { from, to, u, W, H, params }) {
    if (u >= 1) return finishTo(ctx, to, W, H);
    const c = readParams(PARAMS, params).color === "blanco" ? "#ffffff" : "#000000";
    ctx.save();
    ctx.globalAlpha = 1;
    if (u < 0.5) {
      ctx.drawImage(from, 0, 0, W, H);
      ctx.globalAlpha = easeInOut(u / 0.5);
      ctx.fillStyle = c;
      ctx.fillRect(0, 0, W, H);
    } else {
      ctx.fillStyle = c;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = easeInOut((u - 0.5) / 0.5);
      ctx.drawImage(to, 0, 0, W, H);
    }
    ctx.restore();
  },
};
