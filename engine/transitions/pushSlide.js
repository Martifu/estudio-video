// Transition "pushSlide": the incoming scene pushes the outgoing one off the frame; both move together.
import { dirParam, dirVec, easeInOut, finishTo, readParams } from "./_helpers.js";

const PARAMS = [dirParam()];

export default {
  name: "pushSlide",
  label: "Empuje",
  description: "La escena nueva empuja a la anterior",
  brief: [
    "Qué: la escena nueva empuja a la anterior fuera del cuadro; las dos se mueven juntas.",
    "Cuándo: cambio de tema entre dos planos con la misma lógica de movimiento. No usar: para golpes (usar flashWhite) o para revelar un producto (usar cardFlip).",
    "Coreografía: 0.35 s; curva inOut para ambas escenas, sin rebote; la dirección la marca el parámetro y no cambia.",
    "Gusto: movimiento limpio y sin desenfoque; si el cambio pide más velocidad, usar whipPan.",
    "Sonido: un whoosh cerca de la mitad del empuje."
  ].join("\n"),
  category: "Movimiento",
  defaultDur: 0.35,
  minDur: 0.2,
  maxDur: 0.6,
  impact: 0.5,
  params: PARAMS,
  sfx: { kind: "whoosh", offset: 0.25 },
  audio: "dry",
  render(ctx, { from, to, u, W, H, params }) {
    if (u >= 1) return finishTo(ctx, to, W, H);
    const [vx, vy] = dirVec(readParams(PARAMS, params).dir);
    const p = easeInOut(u);
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.drawImage(from, vx * W * p, vy * H * p, W, H);
    ctx.drawImage(to, vx * W * (p - 1), vy * H * (p - 1), W, H);
    ctx.restore();
  },
};
