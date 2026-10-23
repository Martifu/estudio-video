// A comp-local element that breaks the contract: text below 24 px and no exit beat.
import { fnt, text } from "./_kit.js";
export default {
  type: "tinyText", category: "Ejemplos", label: "Texto diminuto", description: "Rompe el contrato", icon: "M5 12h14",
  brief: "Qué: prueba.\nCuándo: nunca.\nGusto: ninguno.",
  defaults: (t, end) => ({ type: "tinyText", in: t, out: Math.min(t + 2, end), text: "hola" }),
  fields: [{ key: "text", label: "Texto", kind: "text" }],
  validate: () => ({ errors: [], warnings: [] }),
  timeline: () => ({ Ld: 1, b: { pop: [0, 0.2], exit: [0.8, 1] } }),
  size: () => ({ w: 300, h: 80 }),
  events() {},
  draw(ctx, el, t, env) { text(ctx, el.text, env.rect.x, env.rect.y + 40, { font: fnt(env.skin, 700, 14), color: "#000" }); }
};
