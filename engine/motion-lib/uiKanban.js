// Element "uiKanban" of the motion library: tablero de etapas: una tarjeta cambia de columna. One file = one element type (see engine/README.md "Cómo agregar un elemento").
// Timeline beats are in DESIGN seconds; the registry (index.js) scales them to [in, out]. Drawing is a pure function of the local time.
import { clamp, seg, lerp, expoOut, inOut, outBack, EXIT, CARD_W } from "../ui-motion.js";
import { rr, hexA, mix, fnt, text, wrapText, shadow, noShadow, card, disc, checkBadge, avatar, drawCursor, envelope, beginCard, radiusAt } from "./_kit.js";
import { UI_SCREEN, UI_SOURCE, FICTIONAL, idx } from "./_fields.js";
export const KANBAN = { h: 640 };

export function kanbanTimeline(el, mode) {
  const full = mode === "full";
  const move = Number.isInteger(el.to) && el.to !== (el.from ?? 0);
  const b = { blob: [0, 0.5], head: { start: 0.25, step: 0.08, dur: 0.4 } };
  if (full) {
    Object.assign(b, { cardIn: [0.7, 1.1], cursorIn: [1.0, 1.5], click: 1.5, lift: [1.5, 1.8] });
    const g0 = 1.8, g1 = move ? 2.6 : 1.8;
    Object.assign(b, { glide: [g0, g1], drop: [g1, g1 + 0.3], check: [g1 + 0.3, g1 + 0.65], label: [g1 + 0.5, g1 + 0.9], cursorOut: [g1, g1 + 0.3], push: [1.5, g1 + 0.7] });
    b.exit = [g1 + 1.1, g1 + 1.1 + EXIT];
  } else {
    Object.assign(b, { cardIn: [0.5, 0.8], lift: [1.1, 1.3] });
    const g1 = move ? 1.9 : 1.3;
    Object.assign(b, { glide: [1.3, g1], drop: [g1, g1 + 0.25], check: [g1 + 0.25, g1 + 0.55], label: [g1 + 0.4, g1 + 0.7], push: [1.1, g1 + 0.5] });
    b.exit = [g1 + 0.9, g1 + 0.9 + EXIT];
  }
  return { Ld: b.exit[1], b };
}

function drawKanban(ctx, el, ts, tl, rect, env) {
  const { skin } = env, C = skin.colors, b = tl.b;
  const w = rect.w, h = rect.h;
  const E = envelope(tl, ts);
  const cols = (el.columns ?? []).slice(0, 5);
  const n = Math.max(1, cols.length);
  const from = clamp(Number.isInteger(el.from) ? el.from : 0, 0, n - 1);
  const to = clamp(Number.isInteger(el.to) ? el.to : from, 0, n - 1);
  const padX = 28, gap = 14;
  const colW = (w - padX * 2 - gap * (n - 1)) / n;
  const colTop = 150, colH = h - colTop - 28;
  const colX = (i) => padX + i * (colW + gap);
  beginCard(ctx, el, tl, ts, rect, [w / 2, h / 2], E);
  const R = radiusAt(E, skin, w, h);
  card(ctx, 0, 0, w, h, R, skin);
  ctx.save();
  rr(ctx, 0, 0, w, h, R);
  ctx.clip();
  const ha = expoOut(seg(ts, 0.1, 0.45));
  ctx.globalAlpha *= ha;
  text(ctx, el.title ?? "", 44, 56, { font: fnt(skin, 700, 46), color: C.ink, maxW: w - 88 });
  if (el.subtitle) text(ctx, el.subtitle, 44, 104, { font: fnt(skin, 500, 28), color: C.muted, maxW: w - 88 });
  ctx.globalAlpha = E.alpha;
  const arrived = seg(ts, b.glide[1], b.glide[1] + 0.2); // the target column lights up as the card lands
  cols.forEach((c, i) => {
    const q = expoOut(seg(ts, b.head.start + i * b.head.step, b.head.start + i * b.head.step + b.head.dur));
    if (q <= 0) return;
    const col = c.color ?? C.accent;
    const lit = i === to && to !== from ? inOut(arrived) : 0;
    ctx.save();
    ctx.globalAlpha = E.alpha * q;
    ctx.translate(0, (1 - q) * 30);
    ctx.fillStyle = lit > 0 ? mix(C.panel, col, 0.1 * lit) : C.panel;
    rr(ctx, colX(i), colTop, colW, colH, 24);
    ctx.fill();
    if (lit > 0) { ctx.strokeStyle = hexA(col, 0.9 * lit); ctx.lineWidth = 3; rr(ctx, colX(i) + 1.5, colTop + 1.5, colW - 3, colH - 3, 23); ctx.stroke(); }
    disc(ctx, colX(i) + 26, colTop + 36, 9, col);
    text(ctx, c.name ?? "", colX(i) + 46, colTop + 37, { font: fnt(skin, 700, 26), color: C.ink, maxW: colW - 58 });
    ctx.restore();
  });
  // the moving card
  const cd = el.card ?? {};
  const cw = colW - 20;
  ctx.font = fnt(skin, 700, 28);
  const nameLines = wrapText(ctx, cd.name ?? "", cw - 28, 2);
  const chips = (cd.chips ?? []).slice(0, 3);
  ctx.font = fnt(skin, 600, 24);
  // chips flow in rows
  const chipRows = [];
  { let row = [], x = 0; for (const c of chips) { const cwid = Math.min(cw - 28, ctx.measureText(String(c)).width + 24); if (row.length && x + cwid > cw - 28) { chipRows.push(row); row = []; x = 0; } row.push({ c, w: cwid }); x += cwid + 8; } if (row.length) chipRows.push(row); }
  const cardH = 24 + 76 + 14 + nameLines.length * 34 + (chipRows.length ? 10 + chipRows.length * 44 : 0) + 20;
  const inK = expoOut(seg(ts, b.cardIn[0], b.cardIn[1]));
  if (inK > 0) {
    const lift = inOut(seg(ts, b.lift[0], b.lift[1]));
    const gl = inOut(seg(ts, b.glide[0], b.glide[1]));
    const dropK = seg(ts, b.drop[0], b.drop[1]);
    const settle = dropK > 0 ? outBack(dropK, 1.6) : 0;
    const held = lift * (1 - Math.min(1, settle)); // 1 while held, back to 0 once dropped
    const x = lerp(colX(from) + 10, colX(to) + 10, gl);
    const y = colTop + 76 + (1 - inK) * 40 - 30 * Math.sin(Math.PI * gl) * lift - 8 * held;
    const tilt = (-4 * Math.PI) / 180 * Math.sin(Math.PI * gl) * lift;
    ctx.save();
    ctx.globalAlpha = E.alpha * inK;
    ctx.translate(x + cw / 2, y + cardH / 2);
    ctx.rotate(tilt);
    const sc = 1 + 0.07 * held;
    ctx.scale(sc, sc);
    ctx.translate(-cw / 2, -cardH / 2);
    shadow(ctx, "rgba(16,24,40,0.34)", 18 + 40 * held, 6 + 22 * held);
    ctx.fillStyle = C.surface;
    rr(ctx, 0, 0, cw, cardH, 22);
    ctx.fill();
    noShadow(ctx);
    ctx.strokeStyle = held > 0.5 ? C.accent : C.line;
    ctx.lineWidth = held > 0.5 ? 3 : 2;
    rr(ctx, 1, 1, cw - 2, cardH - 2, 22);
    ctx.stroke();
    avatar(ctx, env, cd.avatar, cd.name, 14 + 38, 24 + 38, 38);
    nameLines.forEach((ln, i) => text(ctx, ln, 14, 24 + 76 + 14 + 17 + i * 34, { font: fnt(skin, 700, 28), color: C.ink }));
    let cy = 24 + 76 + 14 + nameLines.length * 34 + 10;
    for (const row of chipRows) {
      let cx = 14;
      for (const c of row) { ctx.fillStyle = hexA(C.accent, 0.1); rr(ctx, cx, cy, c.w, 36, 12); ctx.fill(); text(ctx, String(c.c), cx + 12, cy + 19, { font: fnt(skin, 600, 24), color: C.accent, maxW: c.w - 20 }); cx += c.w + 8; }
      cy += 44;
    }
    // done: check badge on the card
    const ck = seg(ts, b.check[0], b.check[1]);
    if (ck > 0) checkBadge(ctx, cw - 6, 6, 64, C.success, outBack(ck, 2.2));
    ctx.restore();
    if (cd) {
      const lk = seg(ts, b.label[0], b.label[1]);
      if (el.doneLabel && lk > 0) {
        ctx.save();
        ctx.globalAlpha = E.alpha * clamp(lk * 3);
        ctx.font = fnt(skin, 700, 28);
        const lw = ctx.measureText(String(el.doneLabel)).width + 40;
        const lx = clamp(colX(to) + colW / 2 - lw / 2, 20, w - 20 - lw);
        const ly = y + cardH + 34 + (1 - expoOut(lk)) * 16;
        const s2 = lerp(0.6, 1, outBack(lk));
        ctx.translate(lx + lw / 2, ly);
        ctx.scale(s2, s2);
        ctx.fillStyle = C.success;
        rr(ctx, -lw / 2, -24, lw, 48, 24);
        ctx.fill();
        text(ctx, String(el.doneLabel), 0, 1, { font: fnt(skin, 700, 28), color: "#fff", align: "center" });
        ctx.restore();
      }
    }
  }
  ctx.restore();
  ctx.restore();
  if (tl.cursor && b.click !== undefined && inK > 0) {
    const gl = inOut(seg(ts, b.glide[0], b.glide[1]));
    const gx = lerp(colX(from), colX(to), gl) + rect.x + 10 + cw * 0.82;
    const gy = rect.y + colTop + 76 + 46 - 30 * Math.sin(Math.PI * gl);
    const path = [[b.cursorIn[0], 1080 + 70, rect.y + h + 120], [b.cursorIn[1], gx, gy]];
    const holding = ts >= b.cursorIn[1];
    const a = ts < b.cursorIn[0] ? 0 : 1 - seg(ts, b.cursorOut[0], b.cursorOut[1]);
    drawCursor(ctx, skin, ts, holding ? [[0, gx, gy]] : path, b.click, a * (1 - inOut(E.ex)));
  }
}


export default {
  type: "uiKanban",
  category: "Pantallas",
  family: "ui",
  placement: "pinned", // the original product screens keep their slot (no face-aware default)
  captions: "option",
  label: "Embudo",
  timelineLabel: "Pantalla: embudo",
  description: "Tablero de etapas: una tarjeta cambia de columna",
  brief: [
    "Qué: un prospecto avanza de etapa en el embudo de la app ('de interesado a cita').",
    "Cuándo: la voz habla de embudo, seguimiento o etapas. No usar: para mostrar volumen por etapa (funnelChart) ni cifras.",
    "Coreografía: nace el tablero, entran las columnas, el cursor toma UNA tarjeta, la arrastra a la columna siguiente, cae y aparece el check y su etiqueta.",
    "Gusto: 3-4 columnas con los nombres reales de las etapas; una sola tarjeta se mueve; prospecto con foto del banco ficticio.",
    "Datos: etapas de list_funnels o de la captura; personas siempre ficticias (people:pNN)."
  ].join("\n"),
  icon: "M4 4h5v16H4zM10 4h5v10h-5zM16 4h4v13h-4z",
  textKey: "title",
  defaults: (t, end) => ({
    type: "uiKanban", in: t, out: Math.min(t + 4.6, end), title: "Embudo de ventas", subtitle: "Prospectos de Torre Aurora",
    columns: [{ name: "Nuevo" }, { name: "Contactado" }, { name: "Cita" }, { name: "Cierre", color: "#2F9E44" }],
    card: { name: "María Hernández", avatar: "people:p01", chips: ["WhatsApp", "2 recámaras"] }, from: 1, to: 2, doneLabel: "Cita agendada", source: { ...FICTIONAL }
  }),
  fields: [
    { key: "title", label: "Título", kind: "text" },
    { key: "subtitle", label: "Subtítulo", kind: "text", opt: true },
    { key: "columns", label: "Columnas (2 a 5)", kind: "blocks", prop: "columns", min: 2, max: 5, blank: () => ({ name: "Etapa" }), name: (r) => r.name || "Columna",
      fields: () => [{ key: "name", label: "Nombre", kind: "text" }, { key: "color", label: "Color (ej. #2F9E44)", kind: "text", opt: true }] },
    { key: "card.name", label: "Nombre del prospecto", kind: "text" },
    { key: "card.avatar", label: "Foto (people:p01 o ruta)", kind: "text", opt: true },
    { key: "card.chips", label: "Etiquetas del prospecto (una por línea, hasta 3)", kind: "list" },
    { key: "from", label: "Empieza en la columna", kind: "index", of: "columns", name: (r) => r.name, required: true },
    { key: "to", label: "Termina en la columna", kind: "index", of: "columns", name: (r) => r.name, required: true },
    { key: "doneLabel", label: "Texto al terminar (ej. Cita agendada)", kind: "text", opt: true }
  ],
  screen: UI_SCREEN(true),
  source: UI_SOURCE,
  pin: null,
  fullMin: 3.6,
  cursor: () => true,
  timeline: kanbanTimeline,
  size: (el) => ({ w: CARD_W, h: KANBAN.h }),
  imageRefs(el, add) {
    add(el.card?.avatar, "avatar");
  },
  validate(el, tag) {
    const errors = [], warnings = [];
    const n = (el.columns ?? []).length;
    if (n < 2 || n > 5) errors.push(`${tag}: necesita de 2 a 5 columnas (tiene ${n})`);
    if (!el.card?.name) errors.push(`${tag}: el prospecto necesita nombre`);
    if (!idx(el, "from", n) || !idx(el, "to", n)) errors.push(`${tag}: la columna de inicio o de término no existe`);
    return { errors, warnings };
  },
  texts(el, add) {
    add(el.title); add(el.subtitle); add(el.doneLabel); add(el.card?.name);
    for (const c of el.card?.chips ?? []) add(c);
  },
  events(el, rect, { beats: B, cursor, add }) {
    add(B.blob[0], "pop");
    if (cursor) add(B.click, "click");
    if (B.glide[1] > B.glide[0]) add(B.glide[0], "whoosh");
    add(B.check[0], "notify");
  },
  draw: (ctx, el, t, env) => drawKanban(ctx, el, env.ts, env.tl, env.rect, env),
};
