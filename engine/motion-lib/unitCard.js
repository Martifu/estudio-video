// Element "unitCard" of the motion library (grupo Inmobiliario): tarjeta de una unidad o modelo: foto con movimiento, chips, precio que cuenta y estado.
// One file = one element type (see engine/README.md "Cómo agregar un elemento"). Timeline beats are in DESIGN seconds.
import { seg, expoOut, outBack, lerp, CARD_W } from "../ui-motion.js";
import { rr, fnt, text, card, radiusAt, envelope, beginCard, hexA } from "./_kit.js";
import { FICTIONAL, UI_SOURCE } from "./_fields.js";
import { SLOT_FIELD, PHOTO_FIELD, productPhoto, kenBurnsPhoto, statusTag, chip, countMoney } from "./_inmo.js";

export const UNIT = { w: CARD_W, h: 700, photo: 340 };
export const unitTimeline = () => ({
  Ld: 3.6,
  b: { blob: [0, 0.5], photo: [0, 0.5], name: [0.3, 0.7], status: [0.55, 0.95], chips: [0.75, 1.2], price: [1.15, 2.15], exit: [3.25, 3.6] }
});

/** Initial of the unit name: the monogram of the no-photo state. */
export const monogram = (title) => String(title ?? "").trim().charAt(0).toUpperCase() || "•";

function drawUnit(ctx, el, ts, tl, rect, env) {
  const { skin } = env, C = skin.colors, b = tl.b;
  const w = rect.w, h = rect.h, P = UNIT.photo;
  const E = envelope(tl, ts);
  beginCard(ctx, el, tl, ts, rect, [w / 2, h / 2], E);
  const R = radiusAt(E, skin, w, h);
  card(ctx, 0, 0, w, h, R, skin);
  ctx.save();
  rr(ctx, 0, 0, w, h, R);
  ctx.clip();
  // photo band with a slow move inside the card (Ken Burns). Without a photo: a deliberate tinted band with the unit's monogram
  const photoK = expoOut(seg(ts, b.photo[0], b.photo[1]));
  ctx.globalAlpha = E.alpha * photoK;
  const hasPhoto = kenBurnsPhoto(ctx, env, el.photo, 0, 0, w, P, R, { k: ts / tl.Ld, zoom: 0.08, pan: 22, fill: hexA(C.primary, 0.08) });
  if (!hasPhoto) {
    text(ctx, monogram(el.title), w / 2, P / 2 + 8, { font: fnt(skin, 800, 200), color: hexA(C.primary, 0.3), align: "center" });
    ctx.fillStyle = hexA(C.primary, 0.14);
    ctx.fillRect(0, P - 6, w, 6);
  }
  // body: the name is the first read, the price the hero
  ctx.globalAlpha = E.alpha * expoOut(seg(ts, b.name[0], b.name[1]));
  text(ctx, el.title ?? "", 44, P + 64, { font: fnt(skin, 700, 56), color: C.ink, maxW: w - 88 });
  if (el.subtitle) text(ctx, el.subtitle, 44, P + 114, { font: fnt(skin, 500, 32), color: C.muted, maxW: w - 88 });
  ctx.globalAlpha = E.alpha;
  // chips pop one after another
  const chips = (el.chips ?? []).slice(0, 3);
  let x = 44;
  chips.forEach((label, i) => {
    const s = seg(ts, b.chips[0] + i * 0.12, b.chips[0] + i * 0.12 + 0.45);
    if (s <= 0) return;
    const k = outBack(s);
    ctx.save();
    ctx.globalAlpha = E.alpha * Math.min(1, s * 3);
    const cw = chip(ctx, env, label, x, P + 172, { px: 30, h: 56, bg: C.panel, color: C.ink, k: Math.max(0.01, k) });
    ctx.restore();
    x += cw + 14;
  });
  // price counts up in whole units (the cents land on the last frame); "desde" when the price is the model's base price
  const pk = expoOut(seg(ts, b.price[0], b.price[1]));
  if (el.price !== undefined && el.price !== "" && pk > 0) {
    if (el.priceNote) text(ctx, el.priceNote, 44, P + 236, { font: fnt(skin, 600, 32), color: C.muted });
    text(ctx, countMoney(el.price, pk), 44, P + 300, { font: fnt(skin, 800, 80), color: C.primary, ls: -1.5 });
  }
  ctx.restore(); // clip
  // status pill sits over the photo (top-left), drawn above the clip
  if (el.status && seg(ts, b.status[0], b.status[1]) > 0) {
    ctx.save();
    ctx.globalAlpha = E.alpha;
    statusTag(ctx, env, el.status, 36 + 96, 40 + 28, { k: lerp(0.4, 1, outBack(seg(ts, b.status[0], b.status[1]))) });
    ctx.restore();
  }
  ctx.restore(); // card transform
}

const money = (n) => (Number.isFinite(n) ? n : undefined);
/** unitCard prefilled from a Reda model product (id "reda-<proyecto>-m<modelo>", price "desde"); null when no such product. */
export function unitFromProducts(doc) {
  const p = (doc?.products ?? []).find((x) => x.source === "reda" && /-m[^-]+$/.test(String(x.id ?? "")) && money(x.price) !== undefined);
  if (!p) return null;
  const attrs = Object.values(p.attributes ?? {}).map((v) => String(v)).filter(Boolean).slice(0, 3);
  const photo = productPhoto(p);
  return {
    title: p.name, ...(attrs.length ? { chips: attrs } : {}), price: p.price,
    ...(p.priceNote ? { priceNote: p.priceNote } : {}), ...(photo ? { photo } : {}),
    source: { kind: "reda", ref: "products.json", ...(p.fetchedAt ? { fetchedAt: p.fetchedAt } : {}) }
  };
}

export default {
  type: "unitCard",
  category: "Inmobiliario",
  usesSkin: true, // reads env.skin (ui-skin colours / status table / font): overlay copies ui-skin.json when it is set
  label: "Tarjeta de unidad",
  timelineLabel: "Inmobiliario: tarjeta de unidad",
  description: "Foto de la unidad, chips (recámaras, baños, m²), precio que cuenta y estado",
  brief: [
    "Qué: tarjeta de una unidad o modelo: nombre, precio y estado, con la foto como fondo cuando la hay.",
    "Cuándo: la voz presenta una unidad concreta con precio. No usar: varias unidades a la vez (availabilityGrid) ni una lista de amenidades (amenityGrid).",
    "Coreografía: nace la tarjeta, entra la foto con un zoom lento, aparecen nombre y estado, luego los chips y el precio cuenta hasta su cifra exacta; sale en 0.35 s.",
    "Gusto: el nombre y el precio son lo que se lee; sin foto, un panel limpio con el nombre, nunca una caja gris vacía; un solo acento (el precio).",
    "Datos: MCP de Reda (list_inventory) o captura; source obligatorio; si es ilustrativa, kind fictional y aprobada por el usuario."
  ].join("\n"),
  icon: "M3 9l9-5 9 5v10H3zM9 19v-6h6v6",
  textKey: "title",
  captions: "option",
  minScale: 0.88,
  defaults: (t, end) => ({
    type: "unitCard", in: t, out: Math.min(t + 3.8, end), title: "Modelo A", subtitle: "Torre Norte · nivel 2",
    photo: "reda/model-A.png", chips: ["2 recámaras", "2 baños", "47.80 m²"], price: 2300046.01, priceNote: "desde", status: "Disponible",
    source: { ...FICTIONAL }
  }),
  fields: [
    { key: "title", label: "Nombre de la unidad o modelo", kind: "text" },
    { key: "subtitle", label: "Detalle (ej. torre, nivel)", kind: "text", opt: true },
    PHOTO_FIELD("Foto", "photo"),
    { key: "chips", label: "Chips (máximo 3, uno por línea: 2 recámaras, 2 baños, 47.80 m²)", kind: "list", opt: true },
    { key: "price", label: "Precio (sin signo, solo número)", kind: "number", step: 1, opt: true },
    { key: "priceNote", label: "Texto antes del precio (ej. desde)", kind: "text", opt: true, ph: "desde" },
    { key: "status", label: "Estado (ej. Disponible, Separados)", kind: "text", opt: true, ph: "Disponible" },
    SLOT_FIELD
  ],
  source: UI_SOURCE,
  prefill: ({ products }) => unitFromProducts(products),
  timeline: unitTimeline,
  size: () => ({ w: UNIT.w, h: UNIT.h }),
  imageRefs(el, add) { add(el.photo, "foto"); },
  showsNumbers: (el) => el.price !== undefined && el.price !== "" || (el.chips ?? []).length > 0,
  validate(el, tag) {
    const errors = [], warnings = [];
    if (!el.title) errors.push(`${tag}: necesita el nombre de la unidad`);
    if (el.price !== undefined && (!Number.isFinite(Number(el.price)) || Number(el.price) < 0)) errors.push(`${tag}: el precio debe ser un número positivo`);
    if ((el.chips ?? []).length > 3) warnings.push(`${tag}: solo caben 3 chips; se ven los primeros 3`);
    if (el.price !== undefined && !el.source) warnings.push(`${tag}: el precio necesita de dónde sale (Fuente de los datos)`);
    return { errors, warnings };
  },
  texts(el, add) {
    add(el.title); add(el.subtitle); add(el.status); add(el.priceNote);
    for (const c of el.chips ?? []) add(c);
  },
  events(el, rect, { beats: B, add }) {
    add(B.blob[0], "whoosh");
    if ((el.chips ?? []).length) add(B.chips[0], "pop");
  },
  draw: (ctx, el, t, env) => drawUnit(ctx, el, env.ts, env.tl, env.rect, env),
};
