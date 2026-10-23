// Element "lowerThirdPro": broadcast lower third for a name and a role / company, on a solid paper plate (the Texto card idiom: radius 28, one soft shadow) with an accent bar on its left edge.
// Entry (real seconds, compressed when short): the accent bar grows up from the bottom -> the plate opens from the bar -> the name slides in
// from a mask (clip wipe + 40 px slide) -> the role fades in -> an optional small logo fades in.
// Exit is the entry reversed: the role fades, the name retracts into its mask, the plate closes onto the bar, the bar shrinks.
// Sparse SFX: one whoosh when the bar starts.
import { seg, expoOut, inOut } from "../ui-motion.js";
import { rr, shadow, noShadow } from "./_kit.js";
import { ZONES, fitText, boxRect, slotOf, candidatesOf, fitScale, timelineTexto, minRead, words, blend, EXIT } from "./_texto.js";

const BAR = 14, PAD_X = 40, PAD_Y = 26, GAP = 44, LOGO_H = 96, MAX_TEXT_W = 760;
const LOGOS = ["none", "mark", "white"]; // "white" is the light logo of the ink era: on the paper plate it is drawn as the mark

/** Logo variant drawn on the paper plate ("white" reads as the mark there); null when the brand has no such logo. */
const logoVariant = (v, kit) => { const x = v === "white" ? "mark" : v; return kit.hasLogo?.(x) ? x : null; };

/** Layout: text blocks, optional logo, box width / height, and the plate sizes. el.size = name px (explicit). */
export function layout(el, env, zones = ZONES) {
  const kit = env.kit;
  const name = fitText(env, kit, "display", 800, el.name ?? "", { maxW: MAX_TEXT_W, maxLines: 1, pxMax: el.size ?? 72, pxMin: Math.min(40, el.size ?? 40), lh: 1.1 });
  const role = el.role ? fitText(env, kit, "body", 500, el.role, { maxW: MAX_TEXT_W, maxLines: 1, pxMax: 42, pxMin: 32, lh: 1.2 }) : null;
  const m = (f, s) => (env.measure ? env.measure(f.font, s) : String(s).length * 0.55 * f.px);
  const textW = Math.max(m(name, name.lines[0] ?? ""), role ? m(role, role.lines[0] ?? "") : 0);
  const textH = name.lh + (role ? 4 + role.lh : 0);
  const logo = el.logo && el.logo !== "none" ? logoVariant(el.logo, kit) : null;
  const logoSize = logo ? kit.logoSize?.(logo) : null;
  const logoW = logoSize ? Math.round((LOGO_H * logoSize.w) / logoSize.h) : 0;
  const w = BAR + PAD_X + textW + (logoW ? GAP + logoW : 0) + PAD_X;
  const h = Math.max(textH + PAD_Y * 2, logo ? LOGO_H + PAD_Y : 0);
  return { rect: boxRect(slotOf(el), w, h, zones, zones.x0), name, role, textW, textH, logo, logoW, px: name.px };
}

export default {
  type: "lowerThirdPro",
  category: "Texto",
  usesSkin: false, // brand typography element: reads the brand kit, not the ui skin
  panel: "text",
  captions: "option",
  label: "Rótulo de persona",
  description: "Nombre y cargo con barra de acento; entra desde una máscara y sale en orden inverso",
  brief: [
    "Qué: rótulo de persona en la parte baja (nombre y cargo o empresa) con barra de acento.",
    "Cuándo: para identificar a quien habla en pantalla. No usar: para una cita (usa quoteCard) ni para más de 4 palabras de nombre.",
    "Coreografía: la barra de acento crece desde abajo, la placa se abre desde la barra, el nombre entra desde una máscara, el cargo aparece y el logo al final; la salida hace lo mismo al revés en menos tiempo.",
    "Gusto: no debe parecer una barra negra genérica: placa clara o de marca con tipografía firme, barra de acento como único color, esquinas y sombra consistentes con el resto de la familia.",
    "Datos: nombre y cargo del usuario o de la fuente indicada; sin datos reales de personas."
  ].join("\n"),
  icon: "M3 17h12M3 13h18M3 9h9",
  textKey: "name",
  thumbAt: 0.7,
  sampleDur: 3.2,
  defaults: (t, end) => ({ type: "lowerThirdPro", in: t, out: Math.min(t + 3.2, end), name: "María Hernández", role: "Directora comercial, Inmobiliaria Norte", logo: "none" }),
  fields: [
    { key: "name", label: "Nombre (una línea)", kind: "text" },
    { key: "role", label: "Cargo o empresa (opcional)", kind: "text", opt: true },
    { key: "logo", label: "Logo pequeño", kind: "select", options: [["none", "Sin logo"], ["mark", "Solo el símbolo"], ["white", "Logo de la marca (a color)"]], opt: true, ph: "sin logo" },
    { key: "size", label: "Tamaño del nombre (se ajusta solo)", kind: "number", step: 2, min: 40, max: 110, opt: true, ph: "automático" },
    { key: "slot", label: "Dónde se ve", kind: "select", options: [["band", "Abajo, a la izquierda"], ["center", "Al centro"], ["top", "Arriba"]], opt: true, ph: "abajo" }
  ],
  screen: [{ key: "captions", label: "Subtítulos mientras se ve", kind: "select", options: [["hide", "Ocultarlos"], ["keep", "Dejarlos"]], opt: true, ph: "ocultarlos" }],
  pin: null,

  validate(el, tag) {
    const errors = [], warnings = [];
    if (!String(el.name ?? "").trim()) errors.push(`${tag}: necesita el nombre`);
    if (el.logo !== undefined && !LOGOS.includes(el.logo)) errors.push(`${tag}: "logo" debe ser none, mark o white`);
    if (el.slot !== undefined && !["band", "center", "top"].includes(el.slot)) errors.push(`${tag}: "slot" debe ser band, center o top`);
    if (el.size !== undefined && !(Number(el.size) >= 40 && Number(el.size) <= 110)) errors.push(`${tag}: el tamaño va de 40 a 110`);
    if (words(el.name).length > 4) warnings.push(`${tag}: el nombre tiene más de 4 palabras; uno corto se lee mejor`);
    if (words(el.role).length > 8) warnings.push(`${tag}: el cargo tiene más de 8 palabras`);
    const n = words(el.name).length + words(el.role).length;
    const D = Number(el.out) - Number(el.in);
    if (D > 0 && D < minRead(n) + 0.5) warnings.push(`${tag}: dura muy poco para leer el rótulo`);
    return { errors, warnings };
  },

  timeline: timelineTexto,

  rect: (el, zones, env) => layout(el, env, zones).rect,
  candidates: (el, zones, env) => candidatesOf("lower", el, zones, env, layout),

  texts: (el, add) => { if (el.name) add(el.name); if (el.role) add(el.role); },
  events(el, rect, { add }) {
    add(el.in, "whoosh");
  },

  draw(ctx, el, t, env) {
    const { kit, tl, ts } = env;
    const L = layout(el, env, env.zones ?? ZONES);
    const r = L.rect, D = tl.Ld;
    const paper = kit.colors.paper, ink = kit.colors.ink;
    const accent = kit.colors.accent;
    const subC = blend(ink, paper, 0.25);
    const k = fitScale(D, 0.9, EXIT + 0.1);
    const ex = seg(ts, D - 0.5, D); // exit progress, reverse of the entry
    const barIn = expoOut(seg(ts, 0, 0.3 * k));
    const plateIn = expoOut(seg(ts, 0.1 * k, 0.5 * k));
    const nameIn = expoOut(seg(ts, 0.25 * k, 0.7 * k));
    const roleIn = seg(ts, 0.5 * k, 0.85 * k);
    const logoIn = seg(ts, 0.6 * k, 0.9 * k);
    const out = 1 - inOut(seg(ts, tl.b.exit[0], tl.b.exit[1]));
    const roleOut = 1 - seg(ex, 0, 0.35), nameOut = 1 - seg(ex, 0.2, 0.7), plateOut = 1 - seg(ex, 0.5, 1), barOut = 1 - seg(ex, 0.75, 1);

    const bar = r.h * barIn * barOut;
    const plateW = (r.w - BAR) * plateIn * plateOut;
    if (bar <= 0) return;
    ctx.save();
    ctx.globalAlpha = out;
    // plate: solid paper with the family's one soft shadow; the accent bar grows up from the bottom edge, inside the same radius
    ctx.save();
    shadow(ctx, "rgba(16,24,40,0.28)", 40, 14);
    ctx.fillStyle = paper;
    rr(ctx, r.x, r.y, BAR + plateW, r.h, 28);
    ctx.fill();
    noShadow(ctx);
    ctx.restore();
    ctx.save();
    rr(ctx, r.x, r.y, BAR + plateW, r.h, 28);
    ctx.clip();
    ctx.fillStyle = accent;
    ctx.fillRect(r.x, r.y + r.h - bar, BAR, bar);
    ctx.restore();
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    const x0 = r.x + BAR + PAD_X;
    // name: revealed through a mask growing from the left, sliding 40 px
    const nameW = L.textW;
    const nameShift = (1 - nameIn) * -40;
    if (nameIn * nameOut > 0.001) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(x0 - 8, r.y, (nameW + 16) * Math.min(1, nameIn * nameOut + 0.0001), r.h);
      ctx.clip();
      ctx.font = L.name.font;
      ctx.fillStyle = ink;
      ctx.fillText(L.name.lines[0] ?? "", x0 + nameShift, r.y + PAD_Y + L.name.lh / 2);
      ctx.restore();
    }
    if (L.role && roleIn * roleOut > 0.001) {
      ctx.save();
      ctx.globalAlpha = out * roleIn * roleOut;
      ctx.font = L.role.font;
      ctx.fillStyle = subC;
      ctx.fillText(L.role.lines[0] ?? "", x0, r.y + PAD_Y + L.name.lh + 4 + L.role.lh / 2);
      ctx.restore();
    }
    if (L.logo && logoIn > 0) {
      ctx.save();
      ctx.globalAlpha = out * logoIn * plateOut;
      const cx = x0 + L.textW + GAP + L.logoW / 2;
      kit.drawLogo(ctx, L.logo, cx, r.y + r.h / 2, L.logoW, LOGO_H);
      ctx.restore();
    }
    ctx.restore();
  }
};
