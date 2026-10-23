// Element "notificationStack" of the motion library: a "actividad reciente" list in a white card, with pale rows (app logo, bold title, muted detail, time). Rows arrive top-down, staggered. One file = one element type (see engine/README.md "Cómo agregar un elemento").
// Timeline beats are in DESIGN seconds; the registry (index.js) scales them to [in, out]. Drawing is a pure function of the local time.
import { seg, expoOut, CARD_W } from "../ui-motion.js";
import { rr, fnt, text, envelope, beginCard, radiusAt, card } from "./_kit.js";
import { UI_SCREEN, UI_SOURCE, FICTIONAL } from "./_fields.js";
import { appTile, tileRefs, OFFICIAL_ICONS } from "./_app.js";

export const NOTIF = { pad: 28, head: 112, rowH: 128, gap: 14, max: 4, icon: 72, stagger: 0.12 };
const APPS = [...OFFICIAL_ICONS, "brand"];
const visibleOf = (el) => Math.min(NOTIF.max, Math.max(1, (el.items ?? []).length));
/** Height of the card: header, one pale row per visible notification, the gaps between them and the padding. */
export const notifHeight = (el) => { const n = visibleOf(el); return NOTIF.pad + NOTIF.head + n * NOTIF.rowH + (n - 1) * NOTIF.gap + NOTIF.pad; };

export function notifTimeline(el, mode) {
  const n = visibleOf(el);
  const step = mode === "full" ? 0.14 : NOTIF.stagger;
  const arrive = Array.from({ length: n }, (_, i) => [0.3 + i * step, 0.3 + i * step + 0.45]);
  const Ld = arrive[n - 1][1] + 1.4;
  return { Ld, b: { blob: [0, 0.5], arrive, exit: [Ld - 0.4, Ld] } };
}

function drawNotifs(ctx, el, ts, tl, rect, env) {
  const { skin } = env, C = skin.colors, b = tl.b;
  const w = rect.w, h = rect.h;
  const items = (el.items ?? []).slice(0, NOTIF.max);
  const E = envelope(tl, ts);
  beginCard(ctx, el, tl, ts, rect, [w / 2, h / 2], E);
  card(ctx, 0, 0, w, h, radiusAt(E, skin, w, h), skin);
  ctx.save();
  ctx.globalAlpha *= expoOut(seg(ts, 0.1, 0.5));
  text(ctx, el.title || "Actividad reciente", NOTIF.pad + 16, NOTIF.pad + 52, { font: fnt(skin, 700, 40), color: C.ink, maxW: w - (NOTIF.pad + 16) * 2 });
  ctx.restore();
  items.forEach((it, i) => {
    const k = expoOut(seg(ts, b.arrive[i][0], b.arrive[i][1]));
    if (k <= 0) return;
    const x = NOTIF.pad, y = NOTIF.pad + NOTIF.head + i * (NOTIF.rowH + NOTIF.gap);
    const cy = y + NOTIF.rowH / 2;
    ctx.save();
    ctx.globalAlpha *= k;
    ctx.translate(0, (1 - k) * 40);
    ctx.fillStyle = C.panel;
    rr(ctx, x, y, w - NOTIF.pad * 2, NOTIF.rowH, skin.radius.row);
    ctx.fill();
    appTile(ctx, env, it.app, x + 22, cy - NOTIF.icon / 2, NOTIF.icon);
    const tx = x + 22 + NOTIF.icon + 24, rightX = w - NOTIF.pad - 24;
    text(ctx, it.title ?? "", tx, cy - 20, { font: fnt(skin, 700, 36), color: C.ink, maxW: rightX - tx - 150 });
    if (it.time) text(ctx, it.time, rightX, cy - 20, { font: fnt(skin, 500, 28), color: C.faint, align: "right" });
    text(ctx, it.body ?? "", tx, cy + 26, { font: fnt(skin, 500, 28), color: C.muted, maxW: rightX - tx });
    ctx.restore();
  });
  ctx.restore(); // beginCard
}

export default {
  type: "notificationStack",
  category: "App",
  family: "ui",
  captions: "option",
  label: "Notificaciones",
  timelineLabel: "App: notificaciones",
  description: "Una lista de actividad reciente: avisos con logo, título y detalle, que entran uno por uno",
  brief: [
    "Qué: una lista «actividad reciente» de avisos con logo, título y detalle, como en el reference: 'pasó algo en tu negocio'.",
    "Cuándo: la voz habla de avisos, ventas o actividad en vivo. No usar: para un chat (chatInbox) ni para una cifra (counterBig).",
    "Coreografía: nace la tarjeta con rebote, el encabezado aparece, cada fila entra desde abajo 40 px con expoOut y un escalonado de 0.12 s; la tarjeta sale junta.",
    "Gusto: título 36 px en negrita, detalle 28 px en gris, filas pálidas sin borde; el texto nunca baja de 28 px; sin acento de más.",
    "Datos: títulos de ejemplo de la marca (pedido, pago, cliente); la hora relativa es ficticia."
  ].join("\n"),
  icon: "M5 4h14a1 1 0 011 1v4H4V5a1 1 0 011-1zM4 11h16v8H4z",
  textKey: "title",
  fullMin: 3,
  minScale: 0.88,
  defaults: (t, end) => ({
    type: "notificationStack", in: t, out: Math.min(t + 4.6, end), slot: "band", title: "Actividad reciente",
    items: [
      { app: "instagram", appName: "Instagram", title: "Nuevo mensaje", body: "Lucía quiere saber si el 304 sigue disponible", time: "9 min" },
      { app: "whatsapp", appName: "WhatsApp", title: "Nueva cita", body: "Carlos confirmó la visita del sábado a las 10:00", time: "4 min" },
      { app: "whatsapp", appName: "WhatsApp", title: "Cita agendada", body: "Ana llegará a las 12:30 el domingo", time: "ahora" }
    ],
    source: { ...FICTIONAL }
  }),
  fields: [
    { key: "title", label: "Encabezado (opcional)", kind: "text", opt: true, ph: "Actividad reciente" },
    { key: "items", label: "Avisos (de arriba abajo, en el orden en que llegan; se ven 4)", kind: "blocks", prop: "items", min: 1, max: 4, blank: () => ({ app: "whatsapp", appName: "WhatsApp", title: "Nuevo aviso", body: "Texto corto del aviso", time: "ahora" }), name: (r) => r.title || "Aviso",
      fields: () => [
        { key: "app", label: "App (logo oficial o la marca)", kind: "select", options: [["whatsapp", "WhatsApp"], ["instagram", "Instagram"], ["messenger", "Messenger"], ["brand", "Logo de la marca"]] },
        { key: "appName", label: "Nombre de la app", kind: "text" },
        { key: "title", label: "Título", kind: "text" },
        { key: "body", label: "Texto", kind: "text" },
        { key: "time", label: "Hora (ej. 4 min)", kind: "text", opt: true }
      ] }
  ],
  screen: UI_SCREEN(false),
  source: UI_SOURCE,
  pin: null,
  timeline: notifTimeline,
  size: (el) => ({ w: CARD_W, h: notifHeight(el) }),
  imageRefs(el, add) {
    for (const it of el.items ?? []) tileRefs(it.app, add);
  },
  validate(el, tag) {
    const errors = [], warnings = [];
    const n = (el.items ?? []).length;
    if (n < 1 || n > 4) errors.push(`${tag}: necesita de 1 a 4 notificaciones (tiene ${n})`);
    if ((el.items ?? []).some((x) => !x?.title)) errors.push(`${tag}: cada notificación necesita título`);
    if ((el.items ?? []).some((x) => !APPS.includes(x?.app))) errors.push(`${tag}: la app debe ser WhatsApp, Instagram, Messenger o la marca`);
    return { errors, warnings };
  },
  texts(el, add) {
    add(el.title || "Actividad reciente");
    for (const it of el.items ?? []) { add(it.appName); add(it.title); add(it.body); add(it.time); }
  },
  events(el, rect, { beats: B, cursor, add }) {
    B.arrive.forEach((a) => add(a[0], "notify"));
  },
  draw: (ctx, el, t, env) => drawNotifs(ctx, el, env.ts, env.tl, env.rect, env),
};
