// Transition "whipPan": a fast directional camera whip. Both plates move together with the same `cam` curve (the
// outgoing one is pushed out, the incoming one follows from the opposite side). The blur is strongest at u = 0.5,
// where the switch happens, and it smears along the move only.
import { CAM, colorOr, dirParam, dirVec, finishTo, readParams, smearPoses } from "./_helpers.js";

const PARAMS = [dirParam()];
const N = 16; // copies averaged for the blur

export default {
  name: "whipPan",
  label: "Paneo rápido",
  description: "Paneo de cámara con desenfoque direccional, de una escena a la otra",
  category: "Movimiento",
  brief: [
    "Qué: un paneo de cámara rápido; las dos escenas se mueven juntas en la misma dirección y el corte queda oculto por el desenfoque.",
    "Cuándo: cambio de tema dentro de una misma secuencia de movimiento. No usar: entre dos planos quietos o de la misma escena (usar corte seco).",
    "Coreografía: 0.25-0.35 s; curva cam, la salida y la entrada van juntas; el desenfoque llega a su máximo en u = 0.5, donde ocurre el cambio.",
    "Gusto: solo desenfoque direccional a lo largo del movimiento, sin destellos ni brillos; la dirección la marca el parámetro, nunca cambia a mitad.",
    "Sonido: un whoosh que cae cerca del pico de desenfoque."
  ].join("\n"),
  defaultDur: 0.3,
  minDur: 0.25,
  maxDur: 0.4,
  impact: 0.5,
  params: PARAMS,
  sfx: { kind: "whoosh", offset: 0.08 },
  audio: "dry",
  render(ctx, { from, to, u, W, H, params, brand }) {
    if (u >= 1) return finishTo(ctx, to, W, H);
    const [vx, vy] = dirVec(readParams(PARAMS, params).dir);
    const D = vx ? W : H; // travel distance across the frame
    const p = CAM(u);
    const len = D * 0.45 * Math.sin(Math.PI * u); // blur length: 0 at the ends, maximal at the switch
    const n = len < 1 ? 1 : N;
    // Pose of a plate that is `q` frames away from its rest position; copies lag towards the rest position.
    const poses = (q) => Array.from({ length: n }, (_, i) => {
      const d = q * D - (n > 1 ? len * (i / (n - 1)) : 0);
      return { x: vx * d, y: vy * d, s: 1 };
    });
    ctx.save();
    ctx.globalAlpha = 1;
    if (u > 0) {
      ctx.fillStyle = colorOr(brand?.ink, "#111111"); // neutral plate under the smear edges, never pure black
      ctx.fillRect(0, 0, W, H);
    }
    smearPoses(ctx, from, W, H, poses(p), W / 2, H / 2);
    smearPoses(ctx, to, W, H, poses(p - 1), W / 2, H / 2);
    ctx.restore();
  },
};
