// Transition "cardFlip": a real 3D turn of the outgoing scene around its vertical axis, then the incoming scene
// turns in on the back of the card. Perspective is built from vertical strips, each projected with its own depth
// (drawImage slices, no WebGL). The plate under the card is the brand ink, so the edge-on moment shows a dimmed
// copy of the incoming scene, never a black flash. A neutral veil darkens the card as it turns away; the whole card shrinks slightly at the edge-on moment.
import { colorOr, EXIT, finishTo, OUT } from "./_helpers.js";

const N = 36; // vertical strips
const DIST = 1.8; // camera distance in card widths (mild perspective)
const VEIL = 0.45; // max neutral veil at the edge
const PLATE = 0.8; // ink veil over the dimmed backdrop

// Draws `img` turned by `theta` (rad, about the vertical axis through the centre), scaled by `sg` about the centre.
function turned(ctx, img, W, H, theta, sg, ink) {
  const c = Math.cos(theta), s = Math.sin(theta), dist = DIST * W;
  const proj = (X) => { const k = dist / (dist + X * s); return { x: X * c * k, k }; };
  const sw = W / N;
  for (let i = 0; i < N; i += 1) {
    const X0 = -W / 2 + i * sw, X1 = X0 + sw;
    const a = proj(X0), b = proj(X1), m = proj((X0 + X1) / 2);
    const x0 = W / 2 + sg * a.x, dw = sg * (b.x - a.x);
    if (dw <= 0) continue; // edge-on: nothing visible
    const h = H * m.k * sg;
    const y0 = H / 2 - h / 2;
    ctx.globalAlpha = 1;
    ctx.drawImage(img, i * sw, 0, sw + 0.5, H, x0, y0, dw + 0.5, h);
    const veil = VEIL * (1 - c);
    if (veil > 0.002) {
      ctx.globalAlpha = veil;
      ctx.fillStyle = ink;
      ctx.fillRect(x0, y0, dw + 0.5, h);
    }
  }
}

export default {
  name: "cardFlip",
  label: "Volteo de tarjeta",
  description: "La escena da vuelta como una tarjeta 3D, para revelar la siguiente",
  category: "Movimiento",
  brief: [
    "Qué: la escena actual gira como una tarjeta en perspectiva y revela la siguiente en la cara de atrás.",
    "Cuándo: revelar un producto, una ficha o un dato clave. No usar: para golpes rápidos (usar flashWhite o whipPan) o entre planos de la misma escena.",
    "Coreografía: 0.45 s; la primera mitad gira la escena saliente hasta canto (curva exit), la segunda gira la nueva desde canto hasta plano (curva out); la tarjeta se encoge un 6 % en el canto.",
    "Gusto: perspectiva real, velo neutro oscuro al girar; detrás de la tarjeta se ve la escena nueva atenuada con el color de tinta de la marca, nunca destellos negros.",
    "Sonido: un whoosh suave en el canto."
  ].join("\n"),
  defaultDur: 0.45,
  minDur: 0.3,
  maxDur: 0.8,
  impact: 0.5,
  params: [],
  sfx: { kind: "whoosh", offset: 0.25 },
  audio: "dry",
  render(ctx, { from, to, u, W, H, brand }) {
    if (u >= 1) return finishTo(ctx, to, W, H);
    const ink = colorOr(brand?.ink, "#111111");
    const sg = 1 - 0.06 * Math.sin(Math.PI * u);
    ctx.save();
    ctx.globalAlpha = 1;
    if (u > 0) {
      // plate under the card: the incoming scene, dimmed with the brand ink (no black frame at the edge-on moment)
      ctx.drawImage(to, 0, 0, W, H);
      ctx.globalAlpha = PLATE;
      ctx.fillStyle = ink;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
    if (u < 0.5) turned(ctx, from, W, H, (Math.PI / 2) * EXIT(u / 0.5), sg, ink);
    else turned(ctx, to, W, H, -(Math.PI / 2) * (1 - OUT((u - 0.5) / 0.5)), sg, ink);
    ctx.restore();
  },
};
