// Element "uiFeed" of the motion library: avisos que van entrando uno a uno. One file = one element type (see engine/README.md "Cómo agregar un elemento").
// Timeline beats are in DESIGN seconds; the registry (index.js) scales them to [in, out]. Drawing is a pure function of the local time.
import { clamp, seg, expoOut, EXIT, CARD_W } from "../ui-motion.js";
import { rr, hexA, fnt, text, wrapText, card, pill, avatar, envelope, beginCard, radiusAt } from "./_kit.js";
import { UI_SCREEN, UI_SOURCE, FICTIONAL } from "./_fields.js";
export const FEED = { head: 130, row: 140, pad: 20 };

export const FEED_MAX = 4;

export const feedRows = (el) => Math.max(1, Math.min(FEED_MAX, (el.items ?? []).length));
export const feedHeight = (el) => FEED.head + feedRows(el) * FEED.row + FEED.pad;

export function feedTimeline(el) {
  const n = (el.items ?? []).length;
  const arrive = (el.items ?? []).map((_, i) => [0.6 + i * 0.55, 0.6 + i * 0.55 + 0.45]);
  const last = n ? arrive[n - 1][1] : 0.6;
  return { Ld: last + 1.0 + EXIT, b: { blob: [0, 0.5], head: [0.2, 0.55], arrive, push: [0.5, last + 0.8], exit: [last + 1.0, last + 1.0 + EXIT] } };
}

function drawFeed(ctx, el, ts, tl, rect, env) {
  const { skin } = env, C = skin.colors, b = tl.b;
  const w = rect.w, h = rect.h;
  const E = envelope(tl, ts);
  beginCard(ctx, el, tl, ts, rect, [w / 2, h / 2], E);
  const R = radiusAt(E, skin, w, h);
  card(ctx, 0, 0, w, h, R, skin);
  ctx.save();
  rr(ctx, 0, 0, w, h, R);
  ctx.clip();
  const ha = expoOut(seg(ts, b.head[0], b.head[1]));
  ctx.save();
  ctx.globalAlpha *= ha;
  const tw = text(ctx, el.title ?? "", 44, 64, { font: fnt(skin, 700, 44), color: C.ink, maxW: w - 300 });
  void tw;
  if (el.action) pill(ctx, skin, el.action, w - 44, 64, { bg: hexA(C.accent, 0.1), color: C.accent, px: 26, h: 52, padX: 22, r: 26, align: "right" });
  ctx.restore();
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, FEED.head - 14, w, h - FEED.head + 14);
  ctx.clip();
  const items = el.items ?? [];
  const arr = items.map((_, i) => expoOut(seg(ts, b.arrive[i][0], b.arrive[i][1])));
  items.forEach((it, i) => {
    if (arr[i] <= 0) return;
    // slot index = how many later items have arrived (smoothly), so each new item pushes the others down
    let p = 0;
    for (let j = i + 1; j < items.length; j += 1) p += arr[j];
    const fade = 1 - clamp(p - (FEED_MAX - 1), 0, 1);
    if (fade <= 0) return;
    const y = FEED.head + p * FEED.row + (1 - arr[i]) * -70;
    ctx.save();
    ctx.globalAlpha = E.alpha * clamp(arr[i] * 2.2) * fade;
    ctx.fillStyle = C.panel;
    rr(ctx, 28, y, w - 56, FEED.row - 14, 26);
    ctx.fill();
    avatar(ctx, env, it.avatar, it.title, 28 + 24 + 42, y + (FEED.row - 14) / 2, 42);
    const tx = 28 + 24 + 84 + 22;
    const ty = it.time ? y + 40 : y + (FEED.row - 14) / 2;
    ctx.font = fnt(skin, 600, 30);
    const lines = wrapText(ctx, it.title ?? "", w - tx - 56 - 20, it.time ? 1 : 2);
    lines.forEach((ln, li) => text(ctx, ln, tx, ty + li * 36, { font: fnt(skin, 600, 30), color: C.ink }));
    if (it.time) text(ctx, it.time, tx, y + 84, { font: fnt(skin, 500, 26), color: C.faint });
    ctx.restore();
  });
  ctx.restore();
  ctx.restore();
  ctx.restore();
}


export default {
  type: "uiFeed",
  category: "Pantallas",
  family: "ui",
  placement: "pinned", // the original product screens keep their slot (no face-aware default)
  captions: "option",
  label: "Actividad",
  timelineLabel: "Pantalla: actividad",
  description: "Avisos que van entrando uno a uno",
  brief: [
    "Qué: actividad que no para (pedidos, citas, prospectos nuevos) dentro de la app.",
    "Cuándo: la voz dice 'te llegan…', 'mientras duermes…'. No usar: para un solo aviso (socialProof) ni para notificaciones del teléfono (notificationStack).",
    "Coreografía: nace la tarjeta con su encabezado, las filas con avatar entran una a una desde arriba y empujan a las de abajo.",
    "Gusto: 3-4 filas, textos cortos en pasado ('Ana apartó la 402'), tiempos relativos; sin badges de colores sobrantes.",
    "Datos: actividad del MCP o ilustrativa (fictional); nombres y fotos siempre ficticios."
  ].join("\n"),
  icon: "M5 6h14M5 12h14M5 18h9M3 6h.01M3 12h.01M3 18h.01",
  textKey: "title",
  defaults: (t, end) => ({
    type: "uiFeed", in: t, out: Math.min(t + 4.8, end), title: "Actividad reciente", action: "Ver todo",
    items: [
      { avatar: "people:p01", title: "María pidió una cita para el sábado", time: "hace 2 min" },
      { avatar: "people:p02", title: "Carlos cotizó el departamento 304", time: "hace 8 min" },
      { avatar: "people:p03", title: "Ana dejó su teléfono", time: "hace 15 min" },
      { avatar: "people:p04", title: "Luis apartó el 402", time: "hace 21 min" }
    ], source: { ...FICTIONAL }
  }),
  fields: [
    { key: "title", label: "Título", kind: "text" },
    { key: "action", label: "Texto del botón (opcional)", kind: "text", opt: true },
    { key: "items", label: "Avisos (el primero entra primero; los nuevos aparecen arriba; se ven 4)", kind: "blocks", prop: "items", min: 1, max: 12, blank: () => ({ title: "Nuevo aviso", time: "ahora" }), name: (r) => r.title || "Aviso",
      fields: () => [{ key: "title", label: "Texto", kind: "text" }, { key: "time", label: "Hora (ej. hace 2 min)", kind: "text", opt: true }, { key: "avatar", label: "Foto (people:p01 o ruta)", kind: "text", opt: true }] }
  ],
  screen: UI_SCREEN(false),
  source: UI_SOURCE,
  pin: null,
  timeline: feedTimeline,
  size: (el) => ({ w: CARD_W, h: feedHeight(el) }),
  imageRefs(el, add) {
    for (const it of el.items ?? []) add(it.avatar, "avatar");
  },
  validate(el, tag) {
    const errors = [], warnings = [];
    const n = (el.items ?? []).length;
    if (n < 1 || n > 12) errors.push(`${tag}: necesita de 1 a 12 avisos (tiene ${n})`);
    if ((el.items ?? []).some((x) => !x?.title)) errors.push(`${tag}: cada aviso necesita texto`);
    if (n > FEED_MAX) warnings.push(`${tag}: se ven ${FEED_MAX} avisos a la vez; los más viejos salen`);
    return { errors, warnings };
  },
  texts(el, add) {
    add(el.title); add(el.action);
    for (const i of el.items ?? []) add(i.title);
  },
  events(el, rect, { beats: B, cursor, add }) {
    add(B.blob[0], "pop");
    B.arrive.forEach((a) => add(a[0], "pop"));
  },
  draw: (ctx, el, t, env) => drawFeed(ctx, el, env.ts, env.tl, env.rect, env),
};
