// Test helpers shared by motion-lib.test.mjs and the *.spec.mjs files (not an element type).
import { resolveSkin } from "../ui-motion.js";
import { stubKit } from "./index.js";

export const ZONES = { x0: 60, x1: 1020, toastTop: 350, bottom: 1540 };
/** Recording canvas context: every call / assignment is appended to `log` (strings); measureText = 11 px per char. */
export function recorder(log = []) {
  const base = { measureText: (s) => ({ width: String(s).length * 11 }), createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }), canvas: {} };
  return new Proxy(base, {
    get(t, k) { if (k in t) return t[k]; return (...a) => { log.push(`${String(k)}(${a.map((x) => (typeof x === "number" ? Math.round(x * 100) / 100 : typeof x === "object" ? "obj" : x)).join(",")})`); }; },
    set(t, k, v) { log.push(`${String(k)}=${v}`); return true; }
  });
}
globalThis.Path2D ??= class {};
/** Draw env with a text-only brand; `measure` approximates a 0.55 em advance. */
export function env(over = {}) {
  const skin = resolveSkin(null, { colors: { primary: "#80BC00", ink: "#0A0F0B" } });
  return { skin, kit: stubKit(skin), img: () => null, canvas: () => ({ canvas: {}, ctx: recorder() }), zones: ZONES, measure: (font, s) => String(s).length * 0.55 * (Number(/(\d+)px/.exec(font)?.[1]) || 40), ...over };
}
