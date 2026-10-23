// Transition "irisCircle": a circular mask opens on the incoming scene (modo "abrir") or closes on the outgoing one (modo "cerrar").
import { easeOut, finishTo, readParams } from "./_helpers.js";

const PARAMS = [
  { key: "centro", label: "Centro", kind: "select", default: "centro", options: [["centro", "Centro"], ["arriba", "Arriba"], ["abajo", "Abajo"]] },
  { key: "modo", label: "Modo", kind: "select", default: "abrir", options: [["abrir", "Abrir"], ["cerrar", "Cerrar"]] },
];
const CENTERS = { centro: [0.5, 0.5], arriba: [0.5, 0.3], abajo: [0.5, 0.7] };

export default {
  name: "irisCircle",
  label: "Iris circular",
  description: "Círculo que se abre o se cierra sobre la escena",
  brief: [
    "Qué: un círculo se abre sobre la escena nueva (o se cierra sobre la saliente) desde el centro elegido.",
    "Cuándo: momento de marca, presentación de logo o cierre con isotipo. No usar: para cambios de tema normales (usar pushSlide) ni con texto que cruce el círculo.",
    "Coreografía: 0.5 s; el círculo crece con curva out desde el centro hasta cubrir la esquina más lejana.",
    "Gusto: borde del círculo limpio, sin anillo ni sombra; un solo centro por video.",
    "Sonido: un whoosh suave al 30 %."
  ].join("\n"),
  category: "Marca",
  defaultDur: 0.5,
  minDur: 0.3,
  maxDur: 0.8,
  impact: 0.5,
  params: PARAMS,
  sfx: { kind: "whoosh", offset: 0.3 },
  audio: "dry",
  render(ctx, { from, to, u, W, H, params }) {
    if (u >= 1) return finishTo(ctx, to, W, H);
    const { centro, modo } = readParams(PARAMS, params);
    const [fx, fy] = CENTERS[centro];
    const cx = fx * W;
    const cy = fy * H;
    const rmax = Math.hypot(Math.max(cx, W - cx), Math.max(cy, H - cy));
    const p = easeOut(u);
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.drawImage(from, 0, 0, W, H);
    ctx.beginPath();
    if (modo === "abrir") {
      ctx.arc(cx, cy, p * rmax, 0, Math.PI * 2);
      ctx.clip();
    } else {
      ctx.rect(0, 0, W, H);
      ctx.arc(cx, cy, (1 - p) * rmax, 0, Math.PI * 2);
      ctx.clip("evenodd");
    }
    ctx.drawImage(to, 0, 0, W, H);
    ctx.restore();
  },
};
