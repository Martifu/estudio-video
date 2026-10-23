// Element "uiList" of the motion library: lista de unidades o productos; una fila se elige con un clic. One file = one element type (see engine/README.md "Cómo agregar un elemento").
// Timeline beats are in DESIGN seconds; the registry (index.js) scales them to [in, out]. Drawing is a pure function of the local time.
import { seg, lerp, expoOut, inOut, outBack, statusColor, countText, CARD_W } from "../ui-motion.js";
import { rr, hexA, fnt, text, shadow, noShadow, card, pill, drawCursor, envelope, beginCard, radiusAt } from "./_kit.js";
import { UI_SCREEN, UI_SOURCE, FICTIONAL, idx } from "./_fields.js";
const LIST_ROW = [
  { key: "title", label: "Nombre", kind: "text" },
  { key: "pill.text", label: "Etiqueta (ej. Disponible)", kind: "text", opt: true },
  { key: "meta", label: "Detalle (ej. 76 m²)", kind: "text", opt: true },
  { key: "value", label: "Valor (ej. 3986811.18)", kind: "text", opt: true },
  { key: "format", label: "El valor es", kind: "select", options: [["money", "Dinero"], ["text", "Texto"]], opt: true, ph: "dinero" },
  { key: "thumb", label: "Miniatura (ruta de la imagen)", kind: "text", opt: true, ph: "ej. crm/plano.jpg" }
];

export const rowCount = (el) => Math.min(4, (el.rows ?? []).length);
export const hasSel = (el) => Number.isInteger(el.select) && el.select >= 0 && el.select < rowCount(el);

export const LIST = { head: 146, row: 146, rowH: 132, pad: 20 };

export const listHeight = (el) => LIST.head + Math.max(1, rowCount(el)) * LIST.row + LIST.pad;

export function listTimeline(el, mode) {
  const full = mode === "full";
  const rows = full ? { start: 0.3, step: 0.09, dur: 0.45 } : { start: 0.2, step: 0.07, dur: 0.35 };
  const count = full ? { start: 0.4, step: 0.09, dur: 0.7 } : { start: 0.25, step: 0.07, dur: 0.55 };
  const b = { blob: [0, 0.5], rows, count };
  if (!hasSel(el)) return { Ld: full ? 2.6 : 2.0, b: { ...b, exit: full ? [2.2, 2.6] : [1.6, 2.0] } };
  if (full) Object.assign(b, { cursorIn: [0.9, 1.4], click: 1.55, sel: [1.55, 1.95], dim: [1.55, 1.8], push: [1.75, 2.5], tag: [2.1, 2.5], cursorOut: [2.0, 2.3], exit: [3.0, 3.4] });
  else Object.assign(b, { click: 1.0, sel: [1.0, 1.35], dim: [1.0, 1.2], push: [1.15, 1.65], tag: [1.4, 1.7], exit: [2.1, 2.5] });
  return { Ld: full ? 3.4 : 2.5, b };
}

function drawList(ctx, el, ts, tl, rect, env) {
  const { skin } = env, C = skin.colors, b = tl.b;
  const rows = (el.rows ?? []).slice(0, 4);
  const w = rect.w, h = rect.h;
  const E = envelope(tl, ts);
  const sel = Number.isInteger(el.select) && el.select >= 0 && el.select < rows.length ? el.select : -1;
  beginCard(ctx, el, tl, ts, rect, [w / 2, 300], E);
  const R = radiusAt(E, skin, w, h);
  card(ctx, 0, 0, w, h, R, skin);
  ctx.save();
  rr(ctx, 0, 0, w, h, R);
  ctx.clip();
  // header
  const ha = expoOut(seg(ts, 0.1, 0.45));
  ctx.globalAlpha *= ha;
  text(ctx, el.title ?? "", 44, 66, { font: fnt(skin, 700, 46), color: C.ink, maxW: 520 });
  if (el.subtitle) text(ctx, el.subtitle, 44, 112, { font: fnt(skin, 500, 28), color: C.muted, maxW: 520 });
  const tabs = (el.tabs ?? []).slice(0, 3);
  if (tabs.length) {
    ctx.font = fnt(skin, 600, 26);
    const ws = tabs.map((s) => ctx.measureText(s).width + 52);
    const total = ws.reduce((n, x) => n + x, 0) + 12;
    let x = w - 44 - total;
    ctx.fillStyle = C.panel;
    rr(ctx, x, 36, total, 72, 18);
    ctx.fill();
    x += 6;
    const active = Number.isInteger(el.activeTab) ? el.activeTab : 0;
    tabs.forEach((s, i) => {
      if (i === active) { ctx.fillStyle = C.accent; rr(ctx, x, 42, ws[i], 60, 14); ctx.fill(); }
      text(ctx, s, x + ws[i] / 2, 73, { font: fnt(skin, 600, 26), color: i === active ? "#fff" : C.muted, align: "center" });
      x += ws[i];
    });
  }
  ctx.globalAlpha = E.alpha;
  // rows
  const clicked = sel >= 0 && b.click !== undefined && ts >= b.click;
  let selRect = null;
  rows.forEach((row, i) => {
    const k = expoOut(seg(ts, b.rows.start + i * b.rows.step, b.rows.start + i * b.rows.step + b.rows.dur));
    if (k <= 0) return;
    const isSel = i === sel;
    const lift = isSel && clicked ? outBack(seg(ts, b.sel[0], b.sel[1])) : 0;
    const dim = clicked && !isSel ? lerp(1, 0.38, seg(ts, b.dim[0], b.dim[1])) : 1;
    const rx = 26, ry = LIST.head + i * LIST.row, rw = w - 52, rh = LIST.rowH;
    if (isSel) selRect = { x: rx, y: ry, w: rw, h: rh };
    ctx.save();
    ctx.globalAlpha = E.alpha * k * dim;
    const cx = rx + rw / 2, cy = ry + rh / 2;
    ctx.translate(cx, cy + (1 - k) * 60 - lift * 10);
    ctx.scale(1 + 0.05 * lift, 1 + 0.05 * lift);
    ctx.translate(-cx, -cy);
    if (isSel && clicked) shadow(ctx, hexA(C.accent, 0.45), 44 * Math.min(1, lift), 24 * Math.min(1, lift));
    ctx.fillStyle = C.surface;
    rr(ctx, rx, ry, rw, rh, skin.radius.row);
    ctx.fill();
    noShadow(ctx);
    ctx.strokeStyle = isSel && clicked ? C.accent : C.line;
    ctx.lineWidth = isSel && clicked ? 4 : 2;
    rr(ctx, rx + 1, ry + 1, rw - 2, rh - 2, skin.radius.row);
    ctx.stroke();
    let tx = rx + 30;
    const img = row.thumb ? env.img(row.thumb) : null;
    if (row.thumb) {
      if (img) { ctx.save(); ctx.beginPath(); ctx.arc(rx + 22 + 48, cy, 48, 0, Math.PI * 2); ctx.clip(); const s = Math.max(96 / img.width, 96 / img.height); ctx.drawImage(img, rx + 70 - (img.width * s) / 2, cy - (img.height * s) / 2, img.width * s, img.height * s); ctx.restore(); }
      tx = rx + 22 + 96 + 24;
    }
    const vw = row.value !== undefined && row.value !== "" ? (() => { ctx.font = fnt(skin, 600, 38); return ctx.measureText(row.format === "text" ? String(row.value) : countText(row.value, 1, "money")).width; })() : 0;
    const maxText = rx + rw - 30 - vw - 24 - tx;
    const ty = row.meta ? cy - 22 : cy;
    const tw = text(ctx, row.title ?? "", tx, ty, { font: fnt(skin, 700, 42), color: C.ink, maxW: Math.max(120, maxText - (row.pill ? 190 : 0)) });
    if (row.pill?.text) pill(ctx, skin, row.pill.text, tx + tw + 14, ty + 1, { bg: statusColor(skin, row.pill) });
    if (row.meta) text(ctx, row.meta, tx, cy + 24, { font: fnt(skin, 500, 27), color: C.faint, maxW: maxText });
    if (row.value !== undefined && row.value !== "") {
      const ck = expoOut(seg(ts, b.count.start + i * b.count.step, b.count.start + i * b.count.step + b.count.dur));
      const s = row.format === "text" ? String(row.value) : countText(row.value, ck, "money");
      text(ctx, s, rx + rw - 30, cy + 1, { font: fnt(skin, 600, 38), color: C.primary, align: "right" });
    }
    ctx.restore();
  });
  ctx.restore(); // clip
  ctx.restore(); // card transform
  // tag pill: outside the push (it is a separate layer in the approved mockup)
  if (el.tag && selRect && b.tag) {
    const g = seg(ts, b.tag[0], b.tag[1]);
    if (g > 0) {
      ctx.save();
      ctx.globalAlpha = (1 - inOut(E.ex));
      ctx.font = fnt(skin, 800, 40);
      const tw = ctx.measureText(String(el.tag)).width + 68;
      const lx = Math.min(w * 0.52, w - 40 - tw);
      const cxp = rect.x + lx + tw / 2, cyp = rect.y + selRect.y + selRect.h + 6 + 42 - 30 * expoOut(g);
      ctx.translate(cxp, cyp);
      ctx.rotate((lerp(-8, -2, expoOut(g)) * Math.PI) / 180);
      const sc = lerp(0.4, 1, outBack(g));
      ctx.scale(sc, sc);
      shadow(ctx, "rgba(0,0,0,0.38)", 36, 18);
      ctx.fillStyle = C.highlight;
      rr(ctx, -tw / 2, -42, tw, 84, 24);
      ctx.fill();
      noShadow(ctx);
      text(ctx, String(el.tag), 0, 2, { font: fnt(skin, 800, 40), color: C.ink, align: "center", ls: -0.4 });
      ctx.restore();
    }
  }
  if (tl.cursor && sel >= 0) {
    const ty = rect.y + LIST.head + sel * LIST.row + LIST.rowH / 2;
    const path = [[b.cursorIn[0], 1080 + 70, rect.y + h + 160], [b.cursorIn[1], rect.x + w * 0.6, ty]];
    const a = ts < b.cursorIn[0] ? 0 : 1 - seg(ts, b.cursorOut[0], b.cursorOut[1]);
    drawCursor(ctx, skin, ts, path, b.click, a * (1 - inOut(E.ex)));
  }
}


const money = (n) => (Number.isFinite(n) ? n : undefined);
/** uiList prefilled from the RUN's products.json when it holds Reda data (source "reda"); null otherwise. */
export function listFromProducts(doc) {
  const ps = (doc?.products ?? []).filter((p) => p.source === "reda" && money(p.price) !== undefined).slice(0, 4);
  if (ps.length < 2) return null;
  const rows = ps.map((p) => {
    const attrs = Object.entries(p.attributes ?? {}).slice(0, 2).map(([k, v]) => `${v}`).join(" · ");
    const img = p.images?.[0];
    return { title: p.name, ...(attrs ? { meta: attrs } : {}), value: p.price, format: "money", ...(img?.src ? { thumb: `../${img.src}` } : {}) };
  });
  const fetched = ps.map((p) => p.fetchedAt).filter(Boolean).sort().pop();
  return { title: "Inventario", subtitle: `${ps.length} unidades`, rows, select: Math.min(1, rows.length - 1), tag: String(rows[Math.min(1, rows.length - 1)].title).slice(0, 24), source: { kind: "reda", ref: "products.json", ...(fetched ? { fetchedAt: fetched } : {}) } };
}

export default {
  type: "uiList",
  category: "Pantallas",
  family: "ui",
  placement: "pinned", // the original product screens keep their slot (no face-aware default)
  captions: "option",
  label: "Lista",
  timelineLabel: "Pantalla: lista",
  description: "Lista de unidades o productos; una fila se elige con un clic",
  brief: [
    "Qué: una lista real del producto (inventario, catálogo, resultados) donde se elige una fila: 'esto es lo que hay y este es el tuyo'.",
    "Cuándo: la voz nombra el inventario o una búsqueda con resultados. No usar: para una sola unidad (unitCard) ni para una cifra (uiStat).",
    "Coreografía: nace la tarjeta (rebote permitido), filas escalonadas, precios que cuentan, el cursor da clic en UNA fila, se levanta y sale su etiqueta; el resto se atenúa.",
    "Gusto: 3-5 filas, una sola idea (la fila elegida); mismos textos y orden que la captura; nunca cajas grises de relleno.",
    "Datos: MCP de la marca (list_inventory) o captura del usuario; source obligatorio; precio de la unidad, no del modelo."
  ].join("\n"),
  icon: "M4 6h16M4 12h16M4 18h16",
  textKey: "title",
  defaults: (t, end) => ({
    type: "uiList", in: t, out: Math.min(t + 3.4, end), title: "Departamentos", subtitle: "Torre Aurora · 24 unidades encontradas", tabs: ["Lista", "Niveles"], activeTab: 0,
    rows: [
      { title: "201", pill: { text: "Disponible" }, meta: "Studio · 42.10 m²", value: 1850000, format: "money" },
      { title: "304", pill: { text: "Disponible" }, meta: "2 recámaras · 68.40 m²", value: 2960000, format: "money" },
      { title: "402", pill: { text: "Disponible" }, meta: "2 recámaras · 71.25 m²", value: 3120500, format: "money" },
      { title: "506", pill: { text: "Disponible" }, meta: "3 recámaras · 92.80 m²", value: 4275000, format: "money" }
    ],
    select: 1, tag: "304 · DISPONIBLE", source: { ...FICTIONAL }
  }),
  fields: [
    { key: "title", label: "Título", kind: "text" },
    { key: "subtitle", label: "Subtítulo", kind: "text", opt: true },
    { key: "tabs", label: "Pestañas (una por línea, hasta 3)", kind: "list" },
    { key: "rows", label: "Filas (1 a 4)", kind: "blocks", prop: "rows", min: 1, max: 4, blank: () => ({ title: "Nuevo", pill: { text: "Disponible" }, meta: "", value: 0, format: "money" }), fields: () => LIST_ROW, name: (r) => r.title || "Fila" },
    { key: "select", label: "Fila que se elige con el clic", kind: "index", of: "rows", name: (r) => r.title },
    { key: "tag", label: "Etiqueta que aparece al elegirla", kind: "text", opt: true }
  ],
  screen: UI_SCREEN(true),
  source: UI_SOURCE,
  pin: null,
  prefill: ({ products }) => listFromProducts(products), // Estudio: prefilled from the RUN's Reda products.json when it has data
  fullMin: 2.8,
  cursor: (el) => Number.isInteger(el.select),
  timeline: listTimeline,
  size: (el) => ({ w: CARD_W, h: listHeight(el) }),
  imageRefs(el, add) {
    for (const r of (el.rows ?? []).slice(0, 4)) add(r.thumb, "miniatura");
  },
  showsNumbers: (el) => (el.rows ?? []).some((r) => r.value !== undefined && r.value !== ""),
  validate(el, tag) {
    const errors = [], warnings = [];
    const n = (el.rows ?? []).length;
    if (n < 1 || n > 4) errors.push(`${tag}: necesita de 1 a 4 filas (tiene ${n})`);
    if ((el.rows ?? []).some((r) => !r?.title)) errors.push(`${tag}: cada fila necesita un nombre`);
    if (!idx(el, "select", n)) errors.push(`${tag}: la fila elegida no existe`);
    if (n > 4) warnings.push(`${tag}: solo se ven 4 filas`);
    return { errors, warnings };
  },
  texts(el, add) {
    add(el.title); add(el.subtitle); add(el.tag);
    for (const r of el.rows ?? []) { add(r.title); add(r.meta); add(r.pill?.text); }
  },
  events(el, rect, { beats: B, cursor, add }) {
    add(B.blob[0], "pop");
    if (hasSel(el)) {
      if (cursor) add(B.click, "click");
      add(B.tag[0], "pop");
    }
  },
  draw: (ctx, el, t, env) => drawList(ctx, el, env.ts, env.tl, env.rect, env),
};
