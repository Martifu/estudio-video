// TEMPLATE for a new transition (copy it to engine/transitions/<name>.js; files starting with "_" are never registered).
// One file = one transition: nothing else in the engine needs to know the new name.
//
//   1. Copy this file, rename `name` (lowerCamelCase, equal to the file name without .js) and fill every field below.
//   2. Run `cd engine && node --test transitions.test.mjs`: the shared test checks the descriptor, the render contract
//      (u=0 starts with `from`, u=1 ends with exactly `to`, deterministic, clamped u) and every param variant.
//
// Render contract: at u=0 the frame looks like `from`; at u=1 the last drawing operation is drawImage(to, 0, 0, W, H) at identity
// transform with globalAlpha 1 and nothing clipped. No Math.random (use mulberry32(seed) from _helpers.js), no Date, no globals.
// Use only: drawImage, fillRect, save, restore, translate, rotate, scale, transform, setTransform, beginPath, arc, rect, clip, fill,
// and the properties globalAlpha, globalCompositeOperation, filter, fillStyle. Wrap every transform/clip/alpha change in save/restore.
import { readParams, easeInOut, colorOr, finishTo } from "./_helpers.js";

// Inspector params (the caller passes values in `params`; readParams falls back to `default` when missing or invalid).
const PARAMS = [
  // { key: "shape", label: "Forma", kind: "select", default: "banda", options: [["banda", "Banda"], ["organica", "Orgánica"]] },
  // { key: "amount", label: "Intensidad", kind: "number", default: 1 },
];

export default {
  name: "templateTransition", // = file name without .js
  label: "Transición de ejemplo", // short Spanish name (Mexico), shown in the list
  description: "Una frase corta en español que explica el efecto", // one line shown under the name
  category: "Suave", // one of: "Corte", "Movimiento", "Marca", "Impacto", "Suave"
  // Design brief for the AI director: 3-6 lines in Spanish (Qué / Cuándo + No usar / Coreografía / Gusto / Sonido).
  brief: [
    "Qué: el plano se tiñe del color de la marca y aparece el siguiente.",
    "Cuándo: cambio de tema dentro del video. No usar: entre dos planos de la misma escena (corte seco).",
    "Coreografía: 0.3-0.5 s, entra y sale con la curva inOut, el cambio de plano cae a la mitad.",
    "Gusto: color plano, sin brillo; máximo 3 transiciones distintas por video, sobre el pulso de la música."
  ].join("\n"),
  defaultDur: 0.4, // seconds used when the user adds it
  minDur: 0.25, // shortest allowed (0 <= minDur <= defaultDur <= maxDur; the cut has all three at 0)
  maxDur: 0.8,
  impact: 0.5, // 0..1: how strong the hit is (used by the planner to place it on the beat)
  params: PARAMS,
  sfx: null, // null, or { kind: "whoosh" | "pop", offset: seconds after the transition starts (>= 0) }
  audio: "dry", // "crossfade" (audio fades with the picture) | "dry" (audio cuts at the transition)

  // Draws the transition at progress u in [0, 1] (already clamped by renderTransition). `from` and `to` are canvases of W x H.
  render(ctx, { from, to, u, W, H, brand, params, seed }) {
    if (u >= 1) return finishTo(ctx, to, W, H); // the final state: exactly `to`
    readParams(PARAMS, params); // a real transition destructures its params here: const { dir } = readParams(PARAMS, params);
    const k = easeInOut(u);
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.drawImage(from, 0, 0, W, H); // the first drawing op must be `from` (u = 0 looks like `from`)
    ctx.globalAlpha = k;
    ctx.fillStyle = colorOr(brand?.primary, "#000000");
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  },

  // Optional: a custom thumbnail render (ctx, { u, W, H, brand, params }). Omit it: the registry renders the synthetic sample scenes.
  // preview(ctx, { u, W, H, brand, params }) {},
};
