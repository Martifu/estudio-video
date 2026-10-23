// Element "socialProof" of the motion library (group Personas): aviso tipo toast ("Ana apartó la 302 · hace 3 min") que entra de un lado y cicla la lista.
// One file = one element type (see engine/README.md "Cómo agregar un elemento"). Timeline beats are in DESIGN seconds.
import { seg, expoOut, inOut, clamp } from "../ui-motion.js";
import { rr, fnt, text, wrapText, card, avatar } from "./_kit.js";
import { avatarOk, itemsField, slotRectOf, PIN_PENALTY } from "./_personas.js";
import { FICTIONAL } from "./_fields.js";

export const TOAST = { w: 900, h: 200, r: 100, pad: 28, hold: 2.4, enter: 0.45, exit: 0.3, lead: 0.3, max: 3 };
const itemsOf = (el) => (el.items ?? []).slice(0, 6);

/** Item i enters at lead + i*hold (slides in), holds, and leaves over `exit` seconds ending where the next one starts. */
export const toastTimeline = (el) => {
  const n = Math.max(1, itemsOf(el).length);
  const starts = Array.from({ length: n }, (_, i) => TOAST.lead + i * TOAST.hold);
  const Ld = TOAST.lead + n * TOAST.hold;
  return {
    Ld,
    b: {
      items: starts.map((s) => [s, s + TOAST.enter]),
      leave: starts.map((s) => [s + TOAST.hold - TOAST.exit, s + TOAST.hold]),
      exit: [Ld - TOAST.exit, Ld]
    }
  };
};

function drawToast(ctx, el, ts, tl, rect, env) {
  const { skin } = env, C = skin.colors, b = tl.b;
  const w = rect.w, h = rect.h;
  const items = itemsOf(el);
  // which item is on screen at ts (entering, holding or leaving)
  const i = items.findIndex((_, j) => ts >= b.items[j][0] && ts < b.leave[j][1]);
  if (i < 0) return;
  const dir = el.side === "right" ? 1 : -1;
  const enter = expoOut(seg(ts, b.items[i][0], b.items[i][1]));
  const leave = inOut(seg(ts, b.leave[i][0], b.leave[i][1]));
  const dx = (1 - enter) * dir * (w + 80) + leave * dir * (w + 80);
  ctx.save();
  ctx.globalAlpha *= clamp(enter * 2);
  ctx.translate(rect.x + dx, rect.y);
  const it = items[i];
  const R = Math.min(TOAST.r, h / 2);
  card(ctx, 0, 0, w, h, R, skin);
  ctx.save();
  rr(ctx, 0, 0, w, h, R);
  ctx.clip();
  const AV = 52, cx = TOAST.pad + AV, cy = h / 2;
  avatar(ctx, env, it.avatar, it.name ?? it.text, cx, cy, AV);
  const tx = cx + AV + 26, maxW = w - tx - 44;
  ctx.font = fnt(skin, 600, 40);
  const lines = wrapText(ctx, it.text ?? "", maxW, 2);
  const lh = 46, timeH = it.time ? 40 : 0;
  const blockH = lines.length * lh + timeH;
  let y = cy - blockH / 2 + lh / 2;
  lines.forEach((ln) => { text(ctx, ln, tx, y, { font: fnt(skin, 600, 40), color: C.ink }); y += lh; });
  if (it.time) text(ctx, it.time, tx, y + 8, { font: fnt(skin, 500, 30), color: C.muted, maxW });
  ctx.restore();
  ctx.restore();
}

export default {
  type: "socialProof",
  category: "Personas",
  captions: "option",
  label: "Aviso de compra",
  description: "Toast con foto: \"Ana apartó la 302 · hace 3 min\"",
  brief: [
    "Qué: aviso tipo notificación de compra (\"Ana apartó la 302 · hace 3 min\") que cicla una lista de avisos.",
    "Cuándo: para mostrar actividad reciente de compradores. No usar: para una cifra agregada (usa avatarStack) ni para una cita (usa testimonial).",
    "Coreografía: el aviso entra desde un lado con la foto, sostiene la lectura, sale en 0.3 s y deja paso al siguiente, con 4 fotogramas de separación.",
    "Gusto: el texto es el héroe (tamaño legible, nunca menor de 24 px); una sola píldora blanca con sombra suave; sin cara tapada.",
    "Datos: avisos ficticios o de la fuente indicada; nombres y ciudades sin datos reales de clientes."
  ].join("\n"),
  icon: "M4 6h16v9H9l-5 4V6Z",
  textKey: "text",
  defaults: (t, end) => ({
    type: "socialProof", in: t, out: Math.min(t + 7.6, end), side: "right",
    items: [
      { avatar: "people:p01", text: "Ana de Monterrey apartó la 302", time: "hace 3 min" },
      { avatar: "people:p02", text: "Luis de Puebla pidió una cita para el sábado", time: "hace 8 min" },
      { avatar: "people:p04", text: "Carmen cotizó el departamento 504", time: "hace 12 min" }
    ], source: { ...FICTIONAL }
  }),
  fields: [
    { key: "side", label: "Entra desde", kind: "select", options: [["left", "Izquierda"], ["right", "Derecha"]], opt: true, ph: "derecha" },
    { key: "slot", label: "Dónde se ve (vacío = automático, evita la cara)", kind: "select", options: [["band", "Abajo"], ["top", "Arriba"], ["center", "Al centro"]], opt: true, ph: "automático" },
    itemsField("Avisos (se muestran uno tras otro, de 2 a 3)", [
      { key: "text", label: "Texto (ej. Ana de Monterrey apartó la 302)", kind: "text" },
      { key: "time", label: "Hace cuánto (ej. hace 3 min)", kind: "text", opt: true },
      { key: "avatar", label: "Foto (people:p01 … o ruta)", kind: "text", opt: true, ph: "iniciales" }
    ], 1, 6, () => ({ text: "Nuevo aviso", time: "ahora" }), (r) => r.text || "Aviso")
  ],
  timeline: toastTimeline,
  size: () => ({ w: TOAST.w, h: TOAST.h }),
  // Face-aware: the planner scores each slot against the face zone; band is cheapest, so it wins unless the face is in the way.
  // An explicit el.slot is a preference: that slot costs 0, the others PIN_PENALTY (260) more, as in index.js defaultCandidates.
  candidates(el, zones) {
    const pref = ["band", "top", "center"].includes(el.slot) ? el.slot : null;
    const cost = { band: 0, center: 30, top: 60 };
    return ["band", "top", "center"].map((slot) => ({
      name: `toast-${slot}`, rect: slotRectOf(slot, TOAST.w, TOAST.h, zones), patch: { slot },
      cost: pref ? (slot === pref ? 0 : PIN_PENALTY + cost[slot]) : cost[slot]
    }));
  },
  imageRefs(el, add) {
    for (const it of el.items ?? []) add(it.avatar, "avatar");
  },
  validate(el, tag) {
    const errors = [], warnings = [];
    const n = (el.items ?? []).length;
    if (n < 1) errors.push(`${tag}: necesita al menos un aviso`);
    if ((el.items ?? []).some((x) => !x?.text)) errors.push(`${tag}: cada aviso necesita texto`);
    if ((el.items ?? []).some((x) => !avatarOk(x?.avatar))) errors.push(`${tag}: cada foto debe ser people:p01 … o una ruta de imagen`);
    if (n > TOAST.max) warnings.push(`${tag}: son ${n} avisos; se recomiendan 2 o 3 para que cada uno se lea`);
    if (el.side !== undefined && !["left", "right"].includes(el.side)) errors.push(`${tag}: "side" debe ser left o right`);
    return { errors, warnings };
  },
  texts(el, add) {
    for (const it of el.items ?? []) { add(it.text); add(it.time); }
  },
  events(el, rect, { beats: B, add }) {
    B.items.forEach((span) => add(span[0], "notify"));
  },
  draw: (ctx, el, t, env) => drawToast(ctx, el, env.ts, env.tl, env.rect, env),
};
