// Element "highlighterText": a short phrase (<= 8 words) on a solid paper plate where a marker sweep highlights the chosen words, the way a
// real highlighter sits: the brand accent at 50 % under the text, low on the line, behind the ink. Words in the phrase are wrapped in
// asterisks ("Cuesta *menos de lo que crees*"); the marks are word-accurate (prefix widths keep the kerning).
// Beats (real seconds, compressed when short): the plate wipes in from the left -> the phrase fades up -> each marked word gets its own
// sweep, left to right, 0.3 s apart. Exit fades. One whoosh at the sweep start.
import { seg, expoOut, inOut } from "../ui-motion.js";
import { rr, shadow, noShadow, hexA } from "./_kit.js";
import { ZONES, fitText, wrapIdx, measurer, tokensOf, plainOf, boxRect, slotOf, candidatesOf, fitScale, timelineTexto, MAX_WORDS, minRead } from "./_texto.js";

const PLATE_W = 920, PAD_X = 56, PAD_Y = 48, MARK_GAP = 0.3, MARK_DUR = 0.42, TEXT_IN = 0.35;

/** Lines of the phrase: each line is a list of token indices; px = the largest size (112 -> 56) that fits 4 lines. */
export function layout(el, env, zones = ZONES) {
  const kit = env.kit;
  const toks = tokensOf(el.text);
  const text = toks.map((t) => t.w).join(" ");
  const maxW = PLATE_W - PAD_X * 2;
  const f = fitText(env, kit, "display", 800, text, { maxW, maxLines: 4, pxMax: el.size ?? 112, pxMin: Math.min(56, el.size ?? 56), lh: 1.16 });
  const ws = toks.map((t) => t.w);
  const m = measurer(env);
  const lines = wrapIdx(m, f.font, ws, maxW);
  const h = PAD_Y * 2 + lines.length * f.lh;
  return { rect: boxRect(slotOf(el), PLATE_W, h, zones), toks, lines, px: f.px, font: f.font, lh: f.lh, h };
}

export default {
  type: "highlighterText",
  category: "Texto",
  usesSkin: false, // brand typography element: reads the brand kit, not the ui skin
  panel: "text",
  captions: "option",
  label: "Frase con subrayado",
  description: "Una frase corta en una tarjeta; un marcador de color subraya las palabras que elijas",
  brief: [
    "Qué: frase en la que una palabra o tramo se marca con un trazo de subrayador que se dibuja al ritmo de la voz.",
    "Cuándo: para resaltar la palabra clave de un mensaje corto. No usar: para más de 8 palabras visibles (usa quoteCard) ni para un rótulo de persona.",
    "Coreografía: el texto aparece palabra por palabra, el trazo del subrayador se dibuja bajo la palabra marcada y luego la frase sale.",
    "Gusto: un solo color de acento para el trazo; el texto negro sobre la placa clara; el trazo es grueso y seguro, no neón.",
    "Datos: frase del usuario; sin cifras inventadas."
  ].join("\n"),
  icon: "M4 15l5-1 9-9-4-4-9 9-1 5zM14 6l4 4",
  textKey: "text",
  thumbAt: 0.85,
  sampleDur: 3.6,
  defaults: (t, end) => ({ type: "highlighterText", in: t, out: Math.min(t + 3.6, end), text: "Cuesta *menos de lo que crees*" }),
  fields: [
    { key: "text", label: "La frase (máximo 8 palabras; pon *asteriscos* alrededor de lo que se subraya)", kind: "text" },
    { key: "size", label: "Tamaño (se ajusta solo)", kind: "number", step: 4, min: 56, max: 140, opt: true, ph: "automático" },
    { key: "slot", label: "Dónde se ve", kind: "select", options: [["band", "Abajo, entre la barbilla y los botones"], ["center", "Al centro"], ["top", "Arriba"]], opt: true, ph: "abajo" }
  ],
  screen: [{ key: "captions", label: "Subtítulos mientras se ve", kind: "select", options: [["hide", "Ocultarlos"], ["keep", "Dejarlos"]], opt: true, ph: "ocultarlos" }],
  pin: null,

  validate(el, tag) {
    const errors = [], warnings = [];
    const toks = tokensOf(el.text);
    if (!toks.length) errors.push(`${tag}: necesita la frase`);
    if (toks.length > MAX_WORDS) warnings.push(`${tag}: la frase tiene ${toks.length} palabras; el máximo son ${MAX_WORDS}`);
    if (toks.length && !toks.some((t) => t.hl)) warnings.push(`${tag}: no hay palabras subrayadas (ponlas entre *asteriscos*)`);
    if (el.slot !== undefined && !["band", "center", "top"].includes(el.slot)) errors.push(`${tag}: "slot" debe ser band, center o top`);
    if (el.size !== undefined && !(Number(el.size) >= 56 && Number(el.size) <= 140)) errors.push(`${tag}: el tamaño va de 56 a 140`);
    const D = Number(el.out) - Number(el.in);
    if (D > 0 && D < minRead(toks.length)) warnings.push(`${tag}: dura muy poco para leer la frase (mínimo ${minRead(toks.length).toFixed(1)} s)`);
    return { errors, warnings };
  },

  timeline: timelineTexto,

  rect: (el, zones, env) => layout(el, env, zones).rect,
  candidates: (el, zones, env) => candidatesOf("highlight", el, zones, env, layout),

  texts: (el, add) => add(plainOf(el.text)),
  events(el, rect, { add }) {
    add(el.in + 0.6 * fitScale(Math.max(0.05, el.out - el.in), 1.6), "whoosh");
  },

  draw(ctx, el, t, env) {
    const { kit, tl, ts } = env;
    const L = layout(el, env, env.zones ?? ZONES);
    const r = L.rect, D = tl.Ld;
    const paper = kit.colors.paper, ink = kit.colors.ink;
    const marker = hexA(kit.colors.accent, 0.5);
    const hl = L.toks.map((tk, i) => ({ ...tk, i })).filter((tk) => tk.hl);
    const E = 0.6 + (hl.length ? (hl.length - 1) * MARK_GAP + MARK_DUR : 0);
    const k = fitScale(D, E);
    const out = 1 - inOut(seg(ts, tl.b.exit[0], tl.b.exit[1]));
    const plate = expoOut(seg(ts, 0, 0.35 * k));
    const textP = expoOut(seg(ts, 0.1 * k, TEXT_IN * k + 0.1 * k));

    ctx.save();
    ctx.globalAlpha = out;
    ctx.save();
    ctx.beginPath();
    ctx.rect(r.x, r.y, r.w * plate, r.h);
    ctx.clip();
    shadow(ctx, "rgba(16,24,40,0.24)", 36, 12);
    ctx.fillStyle = paper;
    rr(ctx, r.x, r.y, r.w, r.h, 26);
    ctx.fill();
    noShadow(ctx);
    ctx.restore();

    ctx.font = L.font;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    // word geometry: centred lines, x of each word from the width of the words before it (kerning kept)
    const geo = L.lines.map((ln, li) => {
      const strs = ln.map((i) => L.toks[i].w);
      const lineW = ctx.measureText(strs.join(" ")).width;
      const x0 = r.x + (r.w - lineW) / 2;
      const cy = r.y + PAD_Y + L.lh * (li + 0.5);
      return ln.map((i, j) => {
        const before = strs.slice(0, j).join(" ") + (j > 0 ? " " : "");
        return { i, text: L.toks[i].w, hl: L.toks[i].hl, x: x0 + ctx.measureText(before).width, w: ctx.measureText(L.toks[i].w).width, cy };
      });
    }).flat();

    // marker sweeps first (under the text), one per marked word
    hl.forEach((tk, n) => {
      const g = geo.find((x) => x.i === tk.i);
      if (!g) return;
      const p = expoOut(seg(ts, (0.6 + n * MARK_GAP) * k, (0.6 + n * MARK_GAP + MARK_DUR) * k));
      if (p <= 0) return;
      ctx.save();
      ctx.beginPath();
      ctx.rect(g.x - 10, g.cy - L.lh / 2, (g.w + 20) * p, L.lh);
      ctx.clip();
      ctx.fillStyle = marker;
      rr(ctx, g.x - 10, g.cy - L.px * 0.04, g.w + 20, L.px * 0.52, Math.min(L.px * 0.26, 14));
      ctx.fill();
      ctx.restore();
    });

    // the phrase: fades up
    ctx.fillStyle = ink;
    ctx.globalAlpha = out * textP;
    geo.forEach((g) => ctx.fillText(g.text, g.x, g.cy + (1 - textP) * 12));
    ctx.restore();
  }
};
