// Transition "brandWipe": a flat shape in the brand primary colour sweeps across and reveals the incoming scene behind its edge.
import { colorOr, easeInOut, finishTo, readParams } from "./_helpers.js";

const PARAMS = [
  { key: "shape", label: "Forma", kind: "select", default: "banda", options: [["banda", "Banda"], ["organica", "Orgánica"]] },
];

export default {
  name: "brandWipe",
  label: "Barrido de marca",
  description: "Forma del color primario que descubre la siguiente escena",
  brief: [
    "Qué: una forma del color primario de la marca barre la pantalla y descubre la escena siguiente detrás de su borde.",
    "Cuándo: momento de marca o separación entre bloques de la marca. No usar: entre dos planos de producto (oculta la imagen) ni más de una vez por video.",
    "Coreografía: 0.4 s; la banda o las formas orgánicas avanzan con curva inOut de izquierda a derecha, fuera de cuadro en ambos extremos.",
    "Gusto: color primario plano, sin sombra ni degradado; la banda va en diagonal suave, la forma orgánica en nueve círculos.",
    "Sonido: un whoosh corto al inicio del barrido."
  ].join("\n"),
  category: "Marca",
  defaultDur: 0.4,
  minDur: 0.25,
  maxDur: 0.7,
  impact: 0.5,
  params: PARAMS,
  sfx: { kind: "whoosh", offset: 0.25 },
  audio: "dry",
  render(ctx, { from, to, u, W, H, brand, params }) {
    if (u >= 1) return finishTo(ctx, to, W, H);
    const { shape } = readParams(PARAMS, params);
    const color = colorOr(brand?.primary, "#000000");
    const p = easeInOut(u);
    const front = W * (-0.4 + 1.8 * p); // x of the leading edge (screen px); the band is off-screen at both ends
    const BIG = W + H;

    ctx.save();
    ctx.globalAlpha = 1;
    ctx.drawImage(from, 0, 0, W, H);
    ctx.restore();

    if (shape === "banda") {
      const ang = -0.35;
      const bw = W * 0.08;
      ctx.save();
      ctx.translate(W / 2, H / 2);
      ctx.rotate(ang);
      ctx.beginPath();
      ctx.rect(-BIG, -BIG, front - W / 2 + BIG, 2 * BIG);
      ctx.clip();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(to, 0, 0, W, H);
      ctx.restore();
      ctx.save();
      ctx.translate(W / 2, H / 2);
      ctx.rotate(ang);
      ctx.fillStyle = color;
      ctx.fillRect(front - W / 2 - bw, -BIG, bw, 2 * BIG);
      ctx.restore();
    } else {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, Math.max(0, front), H);
      ctx.clip();
      ctx.drawImage(to, 0, 0, W, H);
      ctx.restore();
      ctx.save();
      ctx.fillStyle = color;
      const N = 9;
      const r = W * 0.1;
      for (let i = 0; i < N; i += 1) {
        const y = (H * (i + 0.5)) / N;
        const x = front + W * 0.05 * Math.sin(i * 1.3 + p * 6);
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  },
};
