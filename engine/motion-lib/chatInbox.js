// Element "chatInbox" of the motion library: bandeja de mensajes con avatares y logos oficiales de canal; un mensaje nuevo sube la conversación al tope. One file = one element type (see engine/README.md "Cómo agregar un elemento").
// Timeline beats are in DESIGN seconds; the registry (index.js) scales them to [in, out]. Drawing is a pure function of the local time.
import { seg, lerp, expoOut, CARD_W } from "../ui-motion.js";
import { rr, fnt, text, avatar, envelope, beginCard, radiusAt, card, pill, disc } from "./_kit.js";
import { UI_SCREEN, UI_SOURCE, FICTIONAL, idx } from "./_fields.js";
import { appTile, tileRefs, OFFICIAL_ICONS } from "./_app.js";

export const INBOX = { head: 124, row: 132, rowH: 116, rowX: 20, pad: 24, max: 5 };
const CHANNELS = [...OFFICIAL_ICONS];
const rowsOf = (el) => Math.min(INBOX.max, (el.rows ?? []).length);
export const inboxHeight = (el) => INBOX.head + Math.max(1, rowsOf(el)) * INBOX.row + INBOX.pad;

export function inboxTimeline(el, mode) {
  const n = Math.max(1, rowsOf(el));
  const step = mode === "full" ? 0.14 : 0.12; // 3-5 frames between siblings
  const rows = { start: 0.25, step, dur: 0.45 };
  const hasBump = Number.isInteger(el.bump) && el.bump >= 0 && el.bump < n;
  if (!hasBump) return { Ld: mode === "full" ? 2.4 : 1.9, b: { blob: [0, 0.5], rows, exit: [mode === "full" ? 2.0 : 1.5, mode === "full" ? 2.4 : 1.9] } };
  const bumpAt = rows.start + n * step + (mode === "full" ? 0.6 : 0.4);
  const Ld = bumpAt + (mode === "full" ? 1.4 : 0.9);
  return { Ld, b: { blob: [0, 0.5], rows, bump: [bumpAt, bumpAt + 0.5], exit: [Ld - 0.4, Ld] } };
}

/** Position slot (0 = top) of row i at time ts, animated between the before / after orders of the bump. */
export function rowSlot(el, i, ts, tl) {
  const b = tl.b;
  if (!b.bump || !Number.isInteger(el.bump)) return i;
  const bi = el.bump;
  const after = i === bi ? 0 : i < bi ? i + 1 : i;
  return lerp(i, after, expoOut(seg(ts, b.bump[0], b.bump[1])));
}

function drawInbox(ctx, el, ts, tl, rect, env) {
  const { skin } = env, C = skin.colors, b = tl.b;
  const w = rect.w, h = rect.h;
  const E = envelope(tl, ts);
  const rows = (el.rows ?? []).slice(0, INBOX.max);
  const bi = Number.isInteger(el.bump) && el.bump >= 0 && el.bump < rows.length ? el.bump : -1;
  const bumped = bi >= 0 && ts >= b.bump[0];
  beginCard(ctx, el, tl, ts, rect, [w / 2, h / 2], E);
  card(ctx, 0, 0, w, h, radiusAt(E, skin, w, h), skin);
  ctx.save();
  ctx.globalAlpha *= expoOut(seg(ts, 0.1, 0.5));
  text(ctx, "Mensajes", 44, 70, { font: fnt(skin, 700, 46), color: C.ink, maxW: w - 88 });
  ctx.restore();
  rows.forEach((row, i) => {
    const k = expoOut(seg(ts, b.rows.start + i * b.rows.step, b.rows.start + i * b.rows.step + b.rows.dur));
    if (k <= 0) return;
    const slot = rowSlot(el, i, ts, tl);
    const y = INBOX.head + slot * INBOX.row;
    const isNew = i === bi && bumped;
    const txt = isNew ? el.bumpText || row.text : row.text;
    const unread = (row.unread ?? 0) + (isNew ? 1 : 0);
    const cy = y + INBOX.rowH / 2;
    ctx.save();
    ctx.globalAlpha = E.alpha * k;
    ctx.translate(0, (1 - k) * 60);
    ctx.fillStyle = C.panel;
    rr(ctx, INBOX.rowX, y, w - INBOX.rowX * 2, INBOX.rowH, skin.radius.row);
    ctx.fill();
    const ax = INBOX.rowX + 24 + 40, r = 40;
    avatar(ctx, env, row.avatar, row.name, ax, cy, r);
    if (row.channel && OFFICIAL_ICONS.includes(row.channel)) {
      disc(ctx, ax + 30, cy + 30, 24, "#FFFFFF");
      appTile(ctx, env, row.channel, ax + 30 - 18, cy + 30 - 18, 36);
    }
    const tx = ax + r + 26, rightX = w - INBOX.rowX - 24;
    text(ctx, row.name ?? "", tx, cy - 18, { font: fnt(skin, 700, 36), color: C.ink, maxW: rightX - tx - 170 });
    text(ctx, row.time ?? "", rightX, cy - 18, { font: fnt(skin, 500, 28), color: C.faint, align: "right" });
    text(ctx, txt ?? "", tx, cy + 26, { font: fnt(skin, 500, 28), color: isNew ? C.ink : C.muted, maxW: rightX - tx - (unread > 0 ? 90 : 0) });
    if (unread > 0) pill(ctx, skin, String(unread), rightX, cy + 26, { bg: C.accent, px: 26, h: 44, padX: 14, align: "right" });
    ctx.restore();
  });
  ctx.restore();
  ctx.restore(); // beginCard
}

export default {
  type: "chatInbox",
  category: "App",
  family: "ui",
  captions: "option",
  label: "Bandeja de mensajes",
  timelineLabel: "App: mensajes",
  description: "Conversaciones con canal y contador; un mensaje nuevo sube al tope",
  brief: [
    "Qué: una bandeja de mensajes con avatares y canal; un mensaje nuevo sube su conversación al tope: 'te están escribiendo'.",
    "Cuándo: la voz habla de responder clientes, WhatsApp o redes. No usar: para una lista de productos (uiList) ni para ajustes (toggleSwitch).",
    "Coreografía: nace la tarjeta, el título Mensajes, las filas salen escalonadas cada 0.08-0.12 s, la fila nueva sube al tope con su contador y sale la tarjeta.",
    "Gusto: el nombre manda, el último mensaje va en gris; un solo acento en el contador; texto de 28 px o más; filas con aire, no apiladas.",
    "Datos: nombres y mensajes de ejemplo ficticios; avatares de people:pNN; nunca datos reales de clientes."
  ].join("\n"),
  icon: "M4 5h16v11H9l-5 4V5z",
  textKey: "bumpText",
  fullMin: 3,
  defaults: (t, end) => ({
    type: "chatInbox", in: t, out: Math.min(t + 4.6, end),
    rows: [
      { name: "María López", text: "¿Sigue disponible el 304?", time: "10:12", channel: "whatsapp", unread: 2, avatar: "people:p01" },
      { name: "Carlos Ruiz", text: "Gracias, nos vemos el sábado", time: "09:40", channel: "instagram", unread: 0, avatar: "people:p02" },
      { name: "Ana Torres", text: "¿Me mandas la lista de precios?", time: "ayer", channel: "messenger", unread: 1, avatar: "people:p03" },
      { name: "Luis Herrera", text: "Ya apartamos el 402", time: "ayer", channel: null, unread: 0, avatar: "people:p04" }
    ],
    bump: 2, bumpText: "Sí, te la envío hoy mismo", source: { ...FICTIONAL }
  }),
  fields: [
    { key: "rows", label: "Conversaciones (de 2 a 5, en el orden inicial)", kind: "blocks", prop: "rows", min: 2, max: 5, blank: () => ({ name: "Nuevo contacto", text: "Hola", time: "ahora", channel: "whatsapp", unread: 0, avatar: "" }), name: (r) => r.name || "Conversación",
      fields: () => [
        { key: "name", label: "Nombre", kind: "text" },
        { key: "text", label: "Último mensaje", kind: "text" },
        { key: "time", label: "Hora", kind: "text", opt: true },
        { key: "channel", label: "Canal", kind: "select", options: [["whatsapp", "WhatsApp"], ["instagram", "Instagram"], ["messenger", "Messenger"], ["", "Ninguno"]], opt: true },
        { key: "unread", label: "Mensajes sin leer", kind: "number", min: 0, max: 99, step: 1, opt: true },
        { key: "avatar", label: "Foto (people:p01 o ruta)", kind: "text", opt: true }
      ] },
    { key: "bump", label: "Conversación que recibe un mensaje nuevo (opcional)", kind: "index", of: "rows", name: (r) => r.name, opt: true },
    { key: "bumpText", label: "Texto del mensaje nuevo", kind: "text", opt: true }
  ],
  screen: UI_SCREEN(false),
  source: UI_SOURCE,
  pin: null,
  minScale: 0.88,
  timeline: inboxTimeline,
  size: (el) => ({ w: CARD_W, h: inboxHeight(el) }),
  imageRefs(el, add) {
    for (const r of el.rows ?? []) { add(r.avatar, "avatar"); tileRefs(r.channel, add); }
  },
  validate(el, tag) {
    const errors = [], warnings = [];
    const n = (el.rows ?? []).length;
    if (n < 2 || n > 5) errors.push(`${tag}: necesita de 2 a 5 conversaciones (tiene ${n})`);
    if ((el.rows ?? []).some((r) => !r?.name)) errors.push(`${tag}: cada conversación necesita nombre`);
    if ((el.rows ?? []).some((r) => r?.channel && !CHANNELS.includes(r.channel))) errors.push(`${tag}: el canal debe ser WhatsApp, Instagram o Messenger`);
    if (el.bump !== undefined && el.bump !== null && !idx(el, "bump", n)) errors.push(`${tag}: la conversación que recibe el mensaje no existe`);
    if (el.bump !== undefined && el.bump !== null && !el.bumpText) warnings.push(`${tag}: falta el texto del mensaje nuevo`);
    if (n > INBOX.max) warnings.push(`${tag}: solo se ven ${INBOX.max} conversaciones`);
    return { errors, warnings };
  },
  texts(el, add) {
    add("Mensajes"); add(el.bumpText);
    for (const r of el.rows ?? []) { add(r.name); add(r.text); add(r.time); }
  },
  events(el, rect, { beats: B, cursor, add }) {
    add(B.blob[0], "pop");
    if (B.bump) add(B.bump[0], "notify");
  },
  draw: (ctx, el, t, env) => drawInbox(ctx, el, env.ts, env.tl, env.rect, env),
};
