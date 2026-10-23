// Element "mapPin" of the motion library (grupo Inmobiliario): mapa plano abstracto (sin tiles reales) con un pin que cae y chips de distancia que salen por líneas.
// Streets are generated from a seed (deterministic); brand colours come from env.skin. One file = one element type. Timeline beats are in DESIGN seconds.
import { seg, expoOut, outBack, lerp, clamp, CARD_W } from "../ui-motion.js";
import { rr, fnt, text, card, radiusAt, envelope, beginCard, disc, hexA } from "./_kit.js";
import { FICTIONAL, UI_SOURCE } from "./_fields.js";
import { mapGrid, pinPath, bounceOut, chip, SLOT_FIELD } from "./_inmo.js";

export const MAP = { w: CARD_W, h: 700, pinX: 450, pinY: 400, pinR: 42 };
// chip centres (card px) around the pin; at most 4 nearby points
export const CHIP_SLOTS = [[205, 262], [700, 232], [200, 512], [700, 520]];
export const mapTimeline = (el) => {
  const n = Math.min(4, (el.nearby ?? []).length);
  const chips = Array.from({ length: n }, (_, i) => [1.3 + i * 0.15, 1.3 + i * 0.15 + 0.45]);
  return { Ld: 4, b: { blob: [0, 0.5], map: [0, 0.45], pin: [0.3, 1.15], chips, exit: [3.65, 4] } };
};

/** The quiet city behind the pin: a faint block pattern and white streets; the only colour is a whisper of park green. */
function drawMap(ctx, env, seed, w, h) {
  const { skin } = env, C = skin.colors;
  const g = mapGrid(seed, w, h);
  ctx.fillStyle = C.panel;
  ctx.fillRect(0, 0, w, h);
  // parks only (no grey lattice of blocks): a whisper of green, then thin white streets
  for (const b of g.blocks) {
    if (!b.park) continue;
    ctx.fillStyle = hexA(C.success, 0.14);
    ctx.fillRect(b.x, b.y, b.w, b.h);
  }
  ctx.lineCap = "butt";
  ctx.strokeStyle = C.surface;
  for (const s of g.streets) {
    ctx.lineWidth = s.lw === 26 ? 9 : 5;
    ctx.beginPath();
    ctx.moveTo(s.x1, s.y1);
    ctx.lineTo(s.x2, s.y2);
    ctx.stroke();
  }
}

function drawPinMap(ctx, el, ts, tl, rect, env) {
  const { skin } = env, C = skin.colors, b = tl.b;
  const w = rect.w, h = rect.h;
  const E = envelope(tl, ts);
  beginCard(ctx, el, tl, ts, rect, [w / 2, h / 2], E);
  const R = radiusAt(E, skin, w, h);
  card(ctx, 0, 0, w, h, R, skin);
  ctx.save();
  rr(ctx, 0, 0, w, h, R);
  ctx.clip();
  ctx.globalAlpha = E.alpha * expoOut(seg(ts, b.map[0], b.map[1]));
  drawMap(ctx, env, el.seed || el.title || "mapa", w, h);
  ctx.globalAlpha = E.alpha;
  // distance chips along lines from the pin
  const hx = MAP.pinX, hy = MAP.pinY - MAP.pinR * 1.8;
  (el.nearby ?? []).slice(0, 4).forEach((n, i) => {
    const [s0, s1] = b.chips[i];
    const line = expoOut(seg(ts, s0, s0 + 0.3));
    const [cx, cy] = CHIP_SLOTS[i];
    if (line > 0) {
      ctx.save();
      ctx.strokeStyle = C.ink;
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(hx, hy);
      ctx.lineTo(lerp(hx, cx, line), lerp(hy, cy, line));
      ctx.stroke();
      ctx.restore();
    }
    const k = outBack(seg(ts, s0 + 0.25, s1));
    if (k <= 0) return;
    ctx.save();
    ctx.globalAlpha = E.alpha * clamp(k * 3);
    const label = `${n.minutes} min · ${n.place}`;
    const cw = chip(ctx, env, label, 0, 0, { px: 30, h: 58, k: 0 });
    chip(ctx, env, label, cx - cw / 2, cy, { px: 30, h: 58, bg: C.surface, color: C.ink, k: Math.max(0.01, k) });
    ctx.restore();
  });
  // pin: drops with a bounce, shadow under it
  const drop = bounceOut(seg(ts, b.pin[0], b.pin[1]));
  const lift = (1 - drop) * 260;
  const px = MAP.pinX, py = MAP.pinY - lift, pr = MAP.pinR;
  ctx.save();
  ctx.globalAlpha = E.alpha * clamp(drop * 2);
  ctx.fillStyle = "rgba(16,24,40,0.22)";
  ctx.beginPath();
  ctx.ellipse(MAP.pinX, MAP.pinY + 2, pr * 0.9 * (1 - 0.3 * (1 - drop)), pr * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.globalAlpha = E.alpha * clamp(seg(ts, b.pin[0], b.pin[0] + 0.2) * 2);
  pinPath(ctx, px, py, pr);
  ctx.fillStyle = C.accent;
  ctx.fill();
  disc(ctx, px, py - pr * 1.8, pr * 0.38, "#FFFFFF");
  ctx.restore();
  // title bar on top of the map
  if (el.title) {
    const ta = expoOut(seg(ts, 0.1, 0.5));
    ctx.save();
    ctx.globalAlpha = E.alpha * ta;
    ctx.fillStyle = C.surface;
    rr(ctx, 30, 28, w - 60, 84, 24);
    ctx.fill();
    text(ctx, el.title, 60, 70, { font: fnt(skin, 700, 44), color: C.ink, maxW: w - 120 });
    ctx.restore();
  }
  ctx.restore();
  ctx.restore();
}

export default {
  type: "mapPin",
  category: "Inmobiliario",
  usesSkin: true, // reads env.skin (ui-skin colours / status table / font): overlay copies ui-skin.json when it is set
  label: "Mapa con distancias",
  timelineLabel: "Inmobiliario: mapa",
  description: "Mapa esquemático con el pin del proyecto y distancias a puntos cercanos",
  brief: [
    "Qué: ubicación del proyecto en un mapa esquemático con los lugares cercanos y sus minutos.",
    "Cuándo: la voz habla de la ubicación y de lo que queda cerca. No usar: un mapa real navegable ni una sola distancia (usa un lowerThird).",
    "Coreografía: el mapa aparece en gris tenue, el pin cae con rebote, luego cada distancia sale por una línea fina; todo sale junto en 0.5 s.",
    "Gusto: el mapa es fondo silencioso (calles tenues, sin bloques de colores fuertes); el pin es el único acento; chips de distancia sin tocarse entre sí ni con el pin.",
    "Datos: lugares y minutos reales (fuente: el usuario o una consulta de ruta); source obligatorio; nunca minutos inventados."
  ].join("\n"),
  icon: "M12 21s-7-6.2-7-11a7 7 0 0114 0c0 4.8-7 11-7 11zM12 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z",
  textKey: "title",
  captions: "option",
  minScale: 0.88,
  defaults: (t, end) => ({
    type: "mapPin", in: t, out: Math.min(t + 4.4, end), title: "Torre Norte", seed: "torre-norte",
    nearby: [{ minutes: 5, place: "Galerías" }, { minutes: 10, place: "Aeropuerto" }, { minutes: 3, place: "Parque" }],
    source: { ...FICTIONAL }
  }),
  fields: [
    { key: "title", label: "Nombre del proyecto en el mapa", kind: "text" },
    { key: "seed", label: "Semilla de las calles (opcional: mismo texto = mismo mapa)", kind: "text", opt: true },
    {
      key: "nearby", label: "Puntos cercanos (1 a 4)", kind: "blocks", prop: "nearby", min: 1, max: 4,
      blank: () => ({ minutes: 5, place: "Centro" }),
      fields: () => [
        { key: "minutes", label: "Minutos en auto o a pie", kind: "number", step: 1, min: 1, max: 99 },
        { key: "place", label: "Lugar (ej. Galerías)", kind: "text" }
      ],
      name: (r) => `${r.minutes} min · ${r.place || "lugar"}`
    },
    SLOT_FIELD
  ],
  source: UI_SOURCE,
  timeline: mapTimeline,
  size: () => ({ w: MAP.w, h: MAP.h }),
  showsNumbers: (el) => (el.nearby ?? []).length > 0,
  validate(el, tag) {
    const errors = [], warnings = [];
    const n = (el.nearby ?? []).length;
    if (!el.title) errors.push(`${tag}: necesita el nombre del proyecto`);
    if (n < 1 || n > 4) errors.push(`${tag}: necesita de 1 a 4 puntos cercanos (tiene ${n})`);
    if ((el.nearby ?? []).some((x) => !(x.minutes > 0) || !x.place)) errors.push(`${tag}: cada punto necesita minutos y lugar`);
    if (n && !el.source) warnings.push(`${tag}: las distancias necesitan de dónde salen (Fuente de los datos)`);
    return { errors, warnings };
  },
  texts(el, add) {
    add(el.title);
    for (const x of el.nearby ?? []) add(`${x.minutes} min · ${x.place}`);
  },
  events(el, rect, { beats: B, add }) {
    add(B.map[0], "whoosh");
    add(B.pin[1], "pop");
  },
  draw: (ctx, el, t, env) => drawPinMap(ctx, el, env.ts, env.tl, env.rect, env),
};
