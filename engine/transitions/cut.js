// Transition "cut": a plain cut. The incoming scene replaces the outgoing one; every frame draws `to`.
export default {
  name: "cut",
  label: "Corte seco",
  description: "Cambio directo, sin efecto",
  brief: [
    "Qué: corte seco; la escena nueva reemplaza a la anterior en el mismo cuadro.",
    "Cuándo: el default entre dos planos. No usar: cuando el cambio pide energía o marca (usar whipPan, zoomPunch o brandWipe).",
    "Coreografía: ninguna; el cambio cae sobre el cuadro exacto del pulso o del corte de voz.",
    "Gusto: sin efecto ni sombra; la limpieza es el gusto.",
    "Sonido: sin sfx; el audio corta con la imagen."
  ].join("\n"),
  category: "Corte",
  defaultDur: 0,
  minDur: 0,
  maxDur: 0,
  impact: 0.5,
  params: [],
  sfx: null,
  audio: "dry",
  render(ctx, { to, W, H }) {
    ctx.drawImage(to, 0, 0, W, H);
  },
};
