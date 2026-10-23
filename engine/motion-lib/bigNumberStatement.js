// Element "bigNumberStatement": a statement built around one big figure ("32" unidades disponibles, "6" meses gratis). The figure slams in
// (1.35 -> 1 scale, one step) and counts up from 70 % of its value to the final value with monotonic easing; the words before it slide in from the left
// and the words after it from the right. The whole figure moves as one piece (no letter-by-letter stagger: that is kineticWord's).
// A figure that is not a number (e.g. "∞") slams without counting. Shows numbers: the review asks where they come from (source fields).
import { seg, expoOut, inOut, fmtNumber } from "../ui-motion.js";
import { rr, shadow, noShadow } from "./_kit.js";
import { ZONES, fitText, boxRect, slotOf, candidatesOf, readable, fitScale, timelineTexto, words } from "./_texto.js";
import { UI_SOURCE } from "./_fields.js";

const PLATE_W = 900, PAD_X = 56, PAD_Y = 52, GAP = 14, MAX_W = PLATE_W - PAD_X * 2;

/** "$1,250 mxn" -> { pre: "$", num: "1,250", suf: " mxn", value: 1250, dec: 0 }; null when the figure has no number. */
export function figureParts(figure) {
  const m = /^(\D*?)(\d[\d,]*(?:\.\d+)?)(.*)$/.exec(String(figure ?? "").trim());
  if (!m) return null;
  const num = m[2];
  return { pre: m[1], num, suf: m[3], value: Number(num.replace(/,/g, "")), dec: num.includes(".") ? num.split(".")[1].length : 0 };
}

/** Layout: before / figure / after blocks centred in a paper plate. el.size = figure px (explicit). */
export function layout(el, env, zones = ZONES) {
  const kit = env.kit;
  const fig = fitText(env, kit, "display", 800, el.figure ?? "", { maxW: MAX_W, maxLines: 1, pxMax: el.size ?? 240, pxMin: Math.min(120, el.size ?? 120), lh: 1.0 });
  const before = el.before ? fitText(env, kit, "body", 700, el.before, { maxW: MAX_W, maxLines: 2, pxMax: 60, pxMin: 40, lh: 1.15 }) : null;
  const after = el.after ? fitText(env, kit, "body", 700, el.after, { maxW: MAX_W, maxLines: 2, pxMax: 60, pxMin: 40, lh: 1.15 }) : null;
  const bH = before ? before.lines.length * before.lh + GAP : 0;
  const aH = after ? GAP + after.lines.length * after.lh : 0;
  const h = PAD_Y * 2 + bH + fig.lh + aH;
  return { rect: boxRect(slotOf(el), PLATE_W, h, zones), fig, before, after, bH, aH, px: fig.px };
}

export default {
  type: "bigNumberStatement",
  category: "Texto",
  usesSkin: false, // brand typography element: reads the brand kit, not the ui skin
  panel: "text",
  captions: "option",
  label: "Frase con cifra grande",
  description: "Una cifra enorme que cuenta y cae de golpe, con las palabras alrededor que entran desde los lados",
  brief: [
    "Qué: una frase con una cifra enorme (32 unidades disponibles, 6 meses gratis) que se cuenta y cae de golpe.",
    "Cuándo: para un dato que vale la pena ver de un vistazo. No usar: para una frase sin número (usa quoteCard) ni para una lista de cifras.",
    "Coreografía: la placa aparece, las palabras de antes entran desde la izquierda, la cifra cae con un golpe y cuenta desde un valor creíble hasta el exacto, las palabras de después entran desde la derecha.",
    "Gusto: la cifra es el héroe y el único acento; nunca mostrar 0 ni un número pequeño mientras la placa nace; sin rebotes exagerados.",
    "Datos: la cifra viene del usuario o de la fuente indicada en source; nunca inventar cifras."
  ].join("\n"),
  icon: "M5 12h4M15 12h4M9 6v12M12 9l1 3-1 3",
  textKey: "figure",
  thumbAt: 0.85,
  sampleDur: 3.6,
  defaults: (t, end) => ({ type: "bigNumberStatement", in: t, out: Math.min(t + 3.6, end), before: "Quedan", figure: "32", after: "unidades disponibles", source: { kind: "fictional" } }),
  fields: [
    { key: "before", label: "Palabras antes de la cifra (opcional)", kind: "text", opt: true },
    { key: "figure", label: "La cifra (ej. 32, $1,250, 6 meses)", kind: "text" },
    { key: "after", label: "Palabras después de la cifra (opcional)", kind: "text", opt: true },
    { key: "size", label: "Tamaño de la cifra (se ajusta solo)", kind: "number", step: 8, min: 120, max: 320, opt: true, ph: "automático" },
    { key: "slot", label: "Dónde se ve", kind: "select", options: [["band", "Abajo, entre la barbilla y los botones"], ["center", "Al centro"], ["top", "Arriba"]], opt: true, ph: "abajo" }
  ],
  screen: [{ key: "captions", label: "Subtítulos mientras se ve", kind: "select", options: [["hide", "Ocultarlos"], ["keep", "Dejarlos"]], opt: true, ph: "ocultarlos" }],
  source: UI_SOURCE,
  pin: null,

  validate(el, tag) {
    const errors = [], warnings = [];
    if (!String(el.figure ?? "").trim()) errors.push(`${tag}: necesita la cifra`);
    if (String(el.figure ?? "").length > 12) warnings.push(`${tag}: la cifra es muy larga; mejor una cifra corta y el resto en las palabras`);
    if (words(el.before).length + words(el.after).length > 10) warnings.push(`${tag}: hay demasiadas palabras alrededor de la cifra (máximo 10)`);
    if (el.slot !== undefined && !["band", "center", "top"].includes(el.slot)) errors.push(`${tag}: "slot" debe ser band, center o top`);
    if (el.size !== undefined && !(Number(el.size) >= 120 && Number(el.size) <= 320)) errors.push(`${tag}: el tamaño va de 120 a 320`);
    const D = Number(el.out) - Number(el.in);
    if (D > 0 && D < 1.6) warnings.push(`${tag}: dura muy poco para contar la cifra`);
    return { errors, warnings };
  },

  timeline: timelineTexto,

  showsNumbers: (el) => /\d/.test(String(el.figure ?? "")),
  rect: (el, zones, env) => layout(el, env, zones).rect,
  candidates: (el, zones, env) => candidatesOf("bignum", el, zones, env, layout),

  texts: (el, add) => { if (el.before) add(el.before); add(el.figure); if (el.after) add(el.after); },
  events(el, rect, { add }) {
    add(el.in + 0.05, "whoosh");
    add(el.in + 0.2 * fitScale(Math.max(0.05, el.out - el.in), 1.2), "pop");
  },

  draw(ctx, el, t, env) {
    const { kit, tl, ts } = env;
    const L = layout(el, env, env.zones ?? ZONES);
    const r = L.rect, D = tl.Ld;
    const paper = kit.colors.paper, ink = kit.colors.ink;
    const figC = readable(paper, [kit.colors.accent_on_paper, kit.colors.primary, ink]);
    const k = fitScale(D, 1.2 + 0.4);
    const out = 1 - inOut(seg(ts, tl.b.exit[0], tl.b.exit[1]));
    const pl = expoOut(seg(ts, 0, 0.3 * k));
    const pB = expoOut(seg(ts, 0.05 * k, 0.45 * k));
    const pF = expoOut(seg(ts, 0.2 * k, 0.45 * k));
    const pA = expoOut(seg(ts, 0.35 * k, 0.75 * k));

    ctx.save();
    ctx.globalAlpha = out;
    ctx.save();
    ctx.globalAlpha = out * pl;
    ctx.translate(0, (1 - pl) * 30);
    shadow(ctx, "rgba(16,24,40,0.28)", 40, 14);
    ctx.fillStyle = paper;
    rr(ctx, r.x, r.y, r.w, r.h, 28);
    ctx.fill();
    noShadow(ctx);
    ctx.restore();

    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    const cx = r.x + r.w / 2;
    let y = r.y + PAD_Y;
    if (L.before) {
      ctx.font = L.before.font;
      ctx.fillStyle = ink;
      ctx.globalAlpha = out * pB;
      L.before.lines.forEach((ln, i) => ctx.fillText(ln, cx + (1 - pB) * -90, y + L.before.lh * (i + 0.5)));
      y += L.bH;
    }
    // figure: slam + count-up (the final frame shows the figure exactly as typed)
    const parts = figureParts(el.figure);
    const e = expoOut(seg(ts, 0.2 * k, 1.2 * k));
    // counts from 70 % of the value (never a fake 0 on the first visible frame) up to the exact figure
    const shown = parts && e < 1 ? `${parts.pre}${fmtNumber(parts.value * (0.7 + 0.3 * e), parts.dec)}${parts.suf}` : el.figure;
    const s = 1 + 0.35 * (1 - pF);
    ctx.save();
    ctx.globalAlpha = out * Math.min(1, pF * 3);
    ctx.translate(cx, y + L.fig.lh / 2);
    ctx.scale(s, s);
    ctx.font = L.fig.font;
    ctx.fillStyle = figC;
    ctx.fillText(shown, 0, 0);
    ctx.restore();
    y += L.fig.lh;
    if (L.after) {
      y += GAP;
      ctx.font = L.after.font;
      ctx.fillStyle = ink;
      ctx.globalAlpha = out * pA;
      L.after.lines.forEach((ln, i) => ctx.fillText(ln, cx + (1 - pA) * 90, y + L.after.lh * (i + 0.5)));
    }
    ctx.restore();
  }
};
