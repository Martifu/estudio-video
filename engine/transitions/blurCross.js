// Transition "blurCross": soft crossfade. The outgoing scene blurs out while the incoming one blurs in and its alpha ramps up.
// Where ctx.filter is unsupported the blur is skipped and the render is a plain crossfade (never throws).
import { drawScaled, easeInOut, finishTo, setFilter } from "./_helpers.js";

export default {
  name: "blurCross",
  label: "Fundido con desenfoque",
  description: "Disolvencia suave con desenfoque, de tono premium",
  brief: [
    "Qué: disolvencia suave; la escena saliente se desenfoca mientras la nueva entra desenfocada y se enfoca.",
    "Cuándo: pasos de tono premium, cierre de una idea o cambio de tema lento. No usar: para cortes rápidos o para ritmo de música (usar zoomPunch o whipPan).",
    "Coreografía: 0.5 s; el desenfoque sube a 24 px en u = 0.5 y baja en la entrada; la mezcla usa curva inOut.",
    "Gusto: un solo desenfoque suave, sin halo ni brillo; si el navegador no soporta filter, queda un fundido simple.",
    "Sonido: el audio hace crossfade con la imagen."
  ].join("\n"),
  category: "Suave",
  defaultDur: 0.5,
  minDur: 0.25,
  maxDur: 1.0,
  impact: 0.5,
  params: [],
  sfx: null,
  audio: "crossfade",
  render(ctx, { from, to, u, W, H }) {
    if (u >= 1) return finishTo(ctx, to, W, H);
    const e = easeInOut(u);
    const s = 1 + 0.06 * Math.sin(Math.PI * u); // slight overscan keeps the blurred edges inside the frame
    ctx.save();
    ctx.globalAlpha = 1;
    setFilter(ctx, `blur(${(24 * u).toFixed(2)}px)`);
    drawScaled(ctx, from, s, W, H);
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = 1;
    setFilter(ctx, `blur(${(24 * (1 - u)).toFixed(2)}px)`);
    drawScaled(ctx, to, s, W, H, e);
    ctx.restore();
  },
};
