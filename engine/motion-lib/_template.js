// TEMPLATE for a new motion-library element (copy it to engine/motion-lib/<type>.js; "_" files are never registered).
// One file = one element: nothing else in the engine, the Estudio, the review or overlay.py needs to know the new type.
//
//   1. Copy this file, rename `type` (lowerCamelCase, = the file name without .js) and fill every field below.
//   2. Add a spec next to it: engine/motion-lib/<type>.spec.mjs (the shared contract test engine/motion-lib.test.mjs already
//      checks the descriptor, its sample drawing, events, validation and safe area for EVERY registered type; add yours only for
//      behaviour that is specific to the element).
//   3. Run `cd engine && node --test *.test.mjs studio/test/*.test.mjs`.
//
// Rules: draw() is a PURE function of the local time (no Date, no Math.random without a seed, no globals); text is never below 24 px (1080x1920
// canvas units); use the brand through env.skin (colors / font) and never hard-code a brand colour; keep everything inside the safe area
// (the default `size` + slot placement does it for you); user-facing strings (label, description, fields, validation messages) are Spanish (Mexico), plain words.
import { seg, expoOut, outBack, lerp } from "../ui-motion.js";
import { rr, fnt, text } from "./_kit.js";

export default {
  type: "templateBadge",
  category: "Ejemplos", // Spanish group title in the Estudio library (Pantallas, Texto, Cierres, ...)
  label: "Insignia de ejemplo", // short name (library card, timeline)
  description: "Una etiqueta que aparece con rebote y se va", // one line shown under the card
  icon: "M5 12h14M12 5v14", // single SVG path (24x24) used when there is no thumbnail
  // Design brief for the AI director (not shown to the user): 3-6 lines in Spanish, one idea per line, these prefixes:
  //   Qué: what it communicates · Cuándo: when to use it, and "No usar:" when not · Coreografía: the beats in order
  //   Gusto: the taste rules that matter for it · Datos: where its texts / numbers come from (source).
  // `node engine/motion-lib/cli.mjs catalog --md` builds references/libreria.md from label + description + the "Cuándo" line.
  brief: [
    "Qué: una etiqueta corta (1-2 palabras) que marca una novedad.",
    "Cuándo: la voz dice algo nuevo y basta una palabra. No usar: frases largas (usa highlighterText) ni cifras (usa counterBig).",
    "Coreografía: rebota al entrar (pop), se queda quieta, sale encogiéndose un 30 % más rápido que su entrada.",
    "Gusto: color de la marca plano, sin brillo ni degradado; texto ≥ 32 px; una sola por escena.",
    "Datos: el texto sale del guion; nunca inventes promociones."
  ].join("\n"),
  // family: "ui",      // optional: "ui" = product-screen family (needs ui-skin handling in overlay.py: set it only for screens)
  // captions: "option", // "option": element.captions "hide" (default) | "keep" decides; "always": hides subtitles while visible; omit = never
  // hidesLogo: true,    // true = the logo bug fades out while it is visible
  // fullFrame: true,   // covers the whole frame by design (rect = 1080x1920): exempt from face / safe-area / collision checks
  // placement: "pinned", // keep el.slot exactly (no face-aware default). Without it (and without rect/candidates) the planner may move the
  //                      // element to another slot when the face is in the way, shrink it down to `minScale`, or put it to a side
  // minScale: 0.88,     // smallest size the face-aware planner may use (default 1 = never shrink; keep every text >= 24 px after scaling)
  // layer: "mid",       // "mid" (default) | "over" (above the toast) | "top" (above everything but the CTA card)
  // panel: "library",   // "library" (Pantallas panel, default) | "text" (Texto panel)
  // tail: 0,            // seconds after `out` during which captions stay hidden (exit animations that outlive the window)
  textKey: "text", // the field a double click edits inline (omit when none)

  // New element when the user adds it at time t (end = video duration). Samples are FICTIONAL and in Spanish; `sample(brand)` is optional
  // (used for the thumbnail; default = defaults(0, sampleDur)).
  defaults: (t, end) => ({ type: "templateBadge", in: t, out: Math.min(t + 2.5, end), text: "NUEVO" }),

  // Inspector fields (kinds: text, textarea, number, select, bool, list, point, blocks, index; `opt: true` = optional, `ph` = placeholder default).
  fields: [{ key: "text", label: "Texto", kind: "text" }],
  // screen: [...slot / captions / push controls], source: [...where do the numbers come from]  (see _fields.js; only for screens)

  // Spanish problems of the element: { errors, warnings }. Errors stop the render; warnings are advice. The registry adds the common checks.
  validate(el, tag) {
    const errors = [];
    if (!el.text) errors.push(`${tag}: necesita texto`);
    return { errors, warnings: [] };
  },

  // Beats in DESIGN seconds ([a, b] spans); Ld = length of the whole design. The registry scales it to [in, out]. Always include an `exit`.
  timeline: () => ({ Ld: 1.6, b: { pop: [0, 0.4], exit: [1.2, 1.6] } }),
  // fullMin: 3, cursor: (el) => true  // optional "lite"/"full" modes by duration, and a cursor beat (see uiList.js)

  // Size of the element; the default placement puts it in el.slot ("band" | "top" | "center"). Provide rect(el, zones, env) instead for
  // anything else (full frame, own anchor); provide candidates(el, zones, env) to let the face-aware planner choose among positions.
  size: (el) => ({ w: 360, h: 120 }),

  // SFX: report beats with add(t, "pop" | "whoosh" | "notify" | "click", px?) - t from the absolute beats `B`.
  events(el, rect, { beats: B, cursor, add }) {
    add(B.pop[0], "pop");
  },

  // Optional: imageRefs(el, add) -> add(ref, "avatar"|"miniatura"); showsNumbers(el) -> bool (the review asks for the data source);
  // texts(el, add) -> add(string) for every claim-like string (the review scans them); prefill({ products }) -> patch | null.

  // Draw at global time t. env = { skin, img(ref), canvas(w, h), zones, measure(font, text), ts (local design time), tl (timeline), rect }.
  draw(ctx, el, t, env) {
    const { rect, ts, tl, skin } = env;
    const k = expoOut(seg(ts, tl.b.pop[0], tl.b.pop[1]));
    const out = 1 - seg(ts, tl.b.exit[0], tl.b.exit[1]);
    ctx.globalAlpha = Math.min(1, k * 2) * out;
    ctx.translate(rect.x + rect.w / 2, rect.y + rect.h / 2);
    const s = lerp(0.6, 1, outBack(seg(ts, tl.b.pop[0], tl.b.pop[1])));
    ctx.scale(s, s);
    ctx.fillStyle = skin.colors.primary;
    rr(ctx, -rect.w / 2, -rect.h / 2, rect.w, rect.h, rect.h / 2);
    ctx.fill();
    text(ctx, el.text, 0, 0, { font: fnt(skin, 800, 56), color: "#fff", align: "center" });
  }
};
