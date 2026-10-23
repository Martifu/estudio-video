// Element "quoteCard": a key phrase of the speaker or a testimonial on a solid paper plate (no gradients, one soft shadow).
// Beats (real seconds, compressed when the window is short): the plate wipes down from the top -> a big quotation mark draws in (clip
// reveal + 0.7 -> 1 scale) -> each line of the quote is revealed by a left-to-right mask wipe, 0.16 s apart -> the attribution slides in
// from the left, with a short accent rule growing before it -> the exit fades out over 0.3 s.
// Sparse SFX: a whoosh at the plate, a pop when the attribution lands.
import { seg, expoOut, inOut, lerp } from "../ui-motion.js";
import { rr, shadow, noShadow } from "./_kit.js";
import { ZONES, fitText, boxRect, slotOf, candidatesOf, readable, fitScale, timelineTexto, wipeY, wipeX, minRead, words } from "./_texto.js";

const PLATE_W = 900, PAD_X = 64, PAD_T = 44, PAD_B = 92, MARK_H = 104;
const Q_START = 0.3, LINE_STEP = 0.13, LINE_DUR = 0.42, ATTR_GAP = 0.12, ATTR_DUR = 0.5, PLATE_IN = 0.28, MARK_IN = 0.45;
const EXIT_Q = 0.3; // exit fade is shorter than the entry, which runs ~2.5 s

/** Layout of the card in canvas px. el.size = quote px (explicit); otherwise the largest size that fits 6 lines. */
export function layout(el, env, zones = ZONES) {
  const kit = env.kit;
  const maxW = PLATE_W - PAD_X * 2;
  const q = fitText(env, kit, "display", 700, el.text, { maxW, maxLines: 6, maxH: 760, pxMax: el.size ?? 100, pxMin: Math.min(56, el.size ?? 56), lh: 1.16 });
  const attr = el.by ? fitText(env, kit, "body", 700, el.by, { maxW, maxLines: 1, pxMax: 46, pxMin: 36, lh: 1.2 }) : null;
  const role = el.role ? fitText(env, kit, "body", 500, el.role, { maxW, maxLines: 1, pxMax: 38, pxMin: 32, lh: 1.2 }) : null;
  const attrH = attr ? 36 + attr.lh + (role ? 6 + role.lh : 0) : 0;
  const h = PAD_T + MARK_H + q.lines.length * q.lh + attrH + PAD_B;
  return { rect: boxRect(slotOf(el), PLATE_W, h, zones), q, attr, role, attrH, px: q.px };
}

export default {
  type: "quoteCard",
  category: "Texto",
  usesSkin: false, // brand typography element: reads the brand kit, not the ui skin
  panel: "text",
  captions: "option",
  label: "Tarjeta de cita",
  description: "Una frase clave o un testimonio: la cita se revela línea por línea y luego aparece quién la dice",
  brief: [
    "Qué: frase clave o cita sobre una placa clara; la cita se revela línea por línea y luego aparece quien la dice.",
    "Cuándo: para una frase de impacto o testimonio corto. No usar: para una cifra (usa bigNumberStatement) ni para una lista de pasos (usa stepsTimeline).",
    "Coreografía: la placa baja desde arriba, la comilla se dibuja, cada línea se revela con 4 fotogramas de separación, luego la atribución entra y la salida dura menos que la entrada.",
    "Gusto: la cita es el héroe en texto negro; comilla y regla de atribución en el acento; sin texto fantasma largo al salir.",
    "Datos: cita y autor del usuario; testimonios ficticios marcados como ilustrativos."
  ].join("\n"),
  icon: "M7 17c-2 0-3-1.5-3-4 0-3 1.5-6 5-7M16 17c-2 0-3-1.5-3-4 0-3 1.5-6 5-7",
  textKey: "text",
  thumbAt: 0.7,
  sampleDur: 4.2,
  defaults: (t, end) => ({ type: "quoteCard", in: t, out: Math.min(t + 4.2, end), text: "Cerramos el mes con 32 citas nuevas y cero papeles", by: "María Hernández", role: "Directora comercial, Inmobiliaria Norte" }),
  fields: [
    { key: "text", label: "La cita (máximo 30 palabras)", kind: "textarea" },
    { key: "by", label: "Quién la dice", kind: "text", opt: true },
    { key: "role", label: "Cargo o empresa (opcional)", kind: "text", opt: true },
    { key: "size", label: "Tamaño de la cita (se ajusta solo)", kind: "number", step: 4, min: 40, max: 160, opt: true, ph: "automático" },
    { key: "slot", label: "Dónde se ve", kind: "select", options: [["band", "Abajo, entre la barbilla y los botones"], ["center", "Al centro"], ["top", "Arriba"]], opt: true, ph: "abajo" }
  ],
  screen: [{ key: "captions", label: "Subtítulos mientras se ve", kind: "select", options: [["hide", "Ocultarlos"], ["keep", "Dejarlos"]], opt: true, ph: "ocultarlos" }],
  pin: null,

  validate(el, tag) {
    const errors = [], warnings = [];
    if (!words(el.text).length) errors.push(`${tag}: necesita la cita`);
    const n = words(el.text).length;
    if (n > 30) warnings.push(`${tag}: la cita tiene ${n} palabras; una tarjeta se lee mejor con 30 o menos`);
    if (el.slot !== undefined && !["band", "center", "top"].includes(el.slot)) errors.push(`${tag}: "slot" debe ser band, center o top`);
    if (el.size !== undefined && !(Number(el.size) >= 40 && Number(el.size) <= 160)) errors.push(`${tag}: el tamaño va de 40 a 160`);
    const D = Number(el.out) - Number(el.in);
    if (D > 0 && D < minRead(n)) warnings.push(`${tag}: dura muy poco para leer ${n} palabras (mínimo ${minRead(n).toFixed(1)} s)`);
    return { errors, warnings };
  },

  // Real seconds: Ld = the element duration; the line / attribution beats are computed in draw() from the real line count.
  timeline: (el) => timelineTexto(el, EXIT_Q),

  rect: (el, zones, env) => layout(el, env, zones).rect,
  candidates: (el, zones, env) => candidatesOf("quote", el, zones, env, layout),

  texts: (el, add) => { add(el.text); if (el.by) add(el.by); if (el.role) add(el.role); },
  events(el, rect, { add }) {
    add(el.in, "whoosh");
  },

  draw(ctx, el, t, env) {
    const { kit, tl, ts } = env;
    const L = layout(el, env, env.zones ?? ZONES);
    const r = L.rect, q = L.q, n = q.lines.length, D = tl.Ld;
    const paper = kit.colors.paper, ink = kit.colors.ink;
    const markC = readable(paper, [kit.colors.accent_on_paper, kit.colors.primary, ink]);
    const E = Q_START + (n - 1) * LINE_STEP + LINE_DUR + ATTR_GAP + ATTR_DUR;
    const k = fitScale(D, E);
    const qs = Q_START * k, step = LINE_STEP * k, dur = LINE_DUR * k;
    const as = (Q_START + (n - 1) * LINE_STEP + LINE_DUR + ATTR_GAP) * k, ad = ATTR_DUR * k;
    const out = 1 - inOut(seg(ts, tl.b.exit[0], tl.b.exit[1]));
    const plateIn = expoOut(seg(ts, 0, PLATE_IN * k));

    ctx.save();
    ctx.globalAlpha = out;
    // plate: wipes down from the top, soft shadow only
    ctx.save();
    wipeY(ctx, r.x, r.y, r.w, r.h, plateIn);
    shadow(ctx, "rgba(16,24,40,0.28)", 40, 14);
    ctx.fillStyle = paper;
    rr(ctx, r.x, r.y, r.w, r.h, 28);
    ctx.fill();
    noShadow(ctx);
    ctx.restore();

    // big quotation mark: clip reveal + scale 0.7 -> 1
    const mp = expoOut(seg(ts, 0.1 * k, MARK_IN * k));
    if (mp > 0) {
      ctx.save();
      wipeY(ctx, r.x + PAD_X, r.y, 200, PAD_T + MARK_H, mp);
      const cx = r.x + PAD_X + 52, cy = r.y + PAD_T + 40;
      ctx.translate(cx, cy);
      ctx.scale(lerp(0.7, 1, mp), lerp(0.7, 1, mp));
      ctx.font = kit.font("display", 220, 800);
      ctx.fillStyle = markC;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("“", 0, 0);
      ctx.restore();
    }

    // quote: one mask wipe per line
    const y0 = r.y + PAD_T + MARK_H;
    ctx.font = q.font;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    q.lines.forEach((line, i) => {
      const p = expoOut(seg(ts, qs + i * step, qs + i * step + dur));
      if (p <= 0) return;
      const lw = ctx.measureText(line).width;
      const cy = y0 + q.lh * (i + 0.5);
      ctx.save();
      wipeX(ctx, r.x + PAD_X - 4, y0 + q.lh * i, lw + 8, q.lh, p);
      ctx.fillStyle = ink;
      ctx.fillText(line, r.x + PAD_X, cy);
      ctx.restore();
    });

    // attribution: accent rule grows, name slides in from the left, role follows
    const ay = y0 + q.lines.length * q.lh + 36;
    const pa = expoOut(seg(ts, as, as + ad));
    if (L.attr && pa > 0) {
      ctx.save();
      ctx.fillStyle = markC;
      ctx.fillRect(r.x + PAD_X, ay, 72 * pa, 6);
      ctx.restore();
      ctx.save();
      ctx.font = L.attr.font;
      ctx.fillStyle = ink;
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      ctx.globalAlpha = out * Math.min(1, pa * 1.6);
      ctx.fillText(L.attr.lines[0], r.x + PAD_X - (1 - pa) * 48, ay + 20 + L.attr.lh / 2);
      ctx.restore();
    }
    if (L.role) {
      const pr = seg(ts, as + 0.12 * k, as + 0.12 * k + ad);
      ctx.save();
      ctx.font = L.role.font;
      ctx.fillStyle = ink;
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      ctx.globalAlpha = out * pr * 0.85;
      ctx.fillText(L.role.lines[0], r.x + PAD_X, ay + 20 + (L.attr?.lh ?? 0) + 6 + L.role.lh / 2);
      ctx.restore();
    }
    ctx.restore();
  }
};
