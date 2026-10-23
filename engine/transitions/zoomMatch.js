// Transition "zoomMatch": a continuous zoom across the cut around one point (the eye follows it). The outgoing scene
// pushes in towards that point; at u = 0.5 the incoming scene starts at the same scale and the same point, then
// pulls back to 1. Both halves are zoom-blurred, strongest at the cut. Reads as "person to screen".
import { EXIT, OUT, finishTo, smearPoses } from "./_helpers.js";

const S = 1.4; // scale at the cut
const N = 7; // copies averaged for the zoom blur
const FOCUS_Y = 0.42; // the point the eye follows (about face height)

export default {
  name: "zoomMatch",
  label: "Zoom de empate",
  description: "Zoom continuo sobre un punto, de persona a pantalla",
  category: "Movimiento",
  brief: [
    "Qué: la cámara entra a un punto de la escena anterior y la nueva escena aparece a la misma escala y en el mismo punto, y luego se aleja.",
    "Cuándo: pasar de una persona a una pantalla, producto o tarjeta de marca. No usar: entre dos escenas sin relación de encuadre (corte seco o barrido).",
    "Coreografía: 0.4 s; la primera mitad empuja hacia el punto (acelera), el corte cae en u = 0.5 con la misma escala 1.4, la segunda mitad se aleja a 1 con curva out.",
    "Gusto: el ojo sigue un solo punto; desenfoque radial solo en el corte; sin brillos, sin viñetas ni degradados.",
    "Sonido: un whoosh suave al inicio; el audio puede hacer crossfade con la imagen."
  ].join("\n"),
  defaultDur: 0.4,
  minDur: 0.25,
  maxDur: 0.8,
  impact: 0.5,
  params: [],
  sfx: { kind: "whoosh", offset: 0.2 },
  audio: "crossfade",
  render(ctx, { from, to, u, W, H }) {
    if (u >= 1) return finishTo(ctx, to, W, H);
    const px = W / 2, py = H * FOCUS_Y;
    const b = 0.14 * Math.sin(Math.PI * u); // zoom-blur spread, maximal at the cut
    const n = b < 0.002 ? 1 : N;
    ctx.save();
    ctx.globalAlpha = 1;
    if (u < 0.5) {
      const s = S ** EXIT(u / 0.5); // push into the outgoing scene
      const poses = Array.from({ length: n }, (_, i) => ({ x: 0, y: 0, s: s * (1 - b * (n > 1 ? i / (n - 1) : 0)) }));
      smearPoses(ctx, from, W, H, poses, px, py);
    } else {
      const s = S ** (1 - OUT((u - 0.5) / 0.5)); // starts at S (matched to the cut), lands on 1
      const poses = Array.from({ length: n }, (_, i) => ({ x: 0, y: 0, s: s * (1 + b * (n > 1 ? i / (n - 1) : 0)) }));
      smearPoses(ctx, to, W, H, poses, px, py);
    }
    ctx.restore();
  },
};
