// Element "searchBar" of the motion library: un campo de búsqueda que se escribe letra por letra y muestra resultados. One file = one element type (see engine/README.md "Cómo agregar un elemento").
// Timeline beats are in DESIGN seconds; the registry (index.js) scales them to [in, out]. Drawing is a pure function of the local time.
import { seg, inOut, CARD_W } from "../ui-motion.js";
import { rr, hexA, fnt, text, card, pill } from "./_kit.js";
import { UI_SCREEN, UI_SOURCE, FICTIONAL, idx } from "./_fields.js";
import { typed, caret, searchGlyph, riseIn } from "./_app.js";

export const SEARCH = { field: 124, row: 118, rowH: 104, head: 28, cps: 18, max: 4, stagger: 0.1 };
const rowsOf = (el) => Math.min(SEARCH.max, (el.results ?? []).length);

export function searchTimeline(el, mode) {
  const q = String(el.query ?? "");
  const typeStart = 0.35;
  const typeEnd = typeStart + q.length / SEARCH.cps;
  const n = Math.max(1, rowsOf(el));
  const resStart = typeEnd + 0.12;
  const res = Array.from({ length: n }, (_, i) => [resStart + i * SEARCH.stagger, resStart + i * SEARCH.stagger + 0.45]);
  const hlStart = resStart + n * SEARCH.stagger + 0.25;
  const hold = mode === "full" ? 1.2 : 0.7;
  const Ld = hlStart + hold;
  return { Ld, b: { type: [typeStart, typeEnd], res, hl: [hlStart, hlStart + 0.35], exit: [Ld - 0.45, Ld] } };
}

function drawSearch(ctx, el, ts, tl, rect, env) {
  const { skin } = env, C = skin.colors, b = tl.b;
  const w = rect.w, F = SEARCH.field;
  const out = 1 - inOut(seg(ts, b.exit[0], b.exit[1]));
  const q = String(el.query ?? "");
  const shown = typed(q, ts, b.type[0], SEARCH.cps);
  ctx.save();
  ctx.globalAlpha = out;
  ctx.translate(rect.x, rect.y);
  card(ctx, 0, 0, w, F, F / 2, skin, { blur: 40, off: 14, a: 0.2 });
  searchGlyph(ctx, 66, F / 2, 18, C.muted, 4);
  const tx = 118;
  if (shown) text(ctx, shown, tx, F / 2 + 1, { font: fnt(skin, 500, 44), color: C.ink, maxW: w - tx - 40 });
  else if (ts < b.type[0]) text(ctx, el.placeholder || "Buscar", tx, F / 2 + 1, { font: fnt(skin, 500, 44), color: C.faint, maxW: w - tx - 40 });
  if (ts >= b.type[0] && ts < b.type[1] + 0.4) {
    ctx.font = fnt(skin, 500, 44);
    caret(ctx, tx + ctx.measureText(shown).width + 4, F / 2, 50, C.accent);
  }
  const results = (el.results ?? []).slice(0, SEARCH.max);
  const hl = Number.isInteger(el.highlight) ? el.highlight : -1;
  const hk = seg(ts, b.hl[0], b.hl[1]);
  results.forEach((r, i) => {
    const k = riseIn(ts, b.res[i][0], b.res[i][1] - b.res[i][0], 40);
    if (k.k <= 0) return;
    const y = F + SEARCH.head + i * SEARCH.row + k.dy;
    const isHl = i === hl;
    ctx.save();
    ctx.globalAlpha = k.k * out; // the rows leave with the field
    ctx.fillStyle = C.surface;
    rr(ctx, 0, y, w, SEARCH.rowH, skin.radius.row);
    ctx.fill();
    if (isHl && hk > 0) {
      ctx.fillStyle = hexA(C.accent, 0.12 * hk);
      rr(ctx, 0, y, w, SEARCH.rowH, skin.radius.row);
      ctx.fill();
      ctx.fillStyle = C.accent;
      ctx.globalAlpha = k.k * hk * out;
      ctx.fillRect(0, y + 14, 8, SEARCH.rowH - 28);
      ctx.globalAlpha = k.k * out;
    }
    text(ctx, r.title ?? "", 44, y + 38, { font: fnt(skin, 700, 34), color: C.ink, maxW: w - 260 });
    text(ctx, r.meta ?? "", 44, y + 74, { font: fnt(skin, 500, 28), color: C.muted, maxW: w - 260 });
    if (isHl && hk > 0) {
      ctx.globalAlpha = k.k * hk * out;
      pill(ctx, skin, "Elegir", w - 36, y + SEARCH.rowH / 2, { bg: C.accent, px: 26, h: 52, padX: 22, align: "right" });
    }
    ctx.restore();
  });
  ctx.restore();
}

export default {
  type: "searchBar",
  category: "App",
  family: "ui",
  captions: "option",
  label: "Búsqueda",
  timelineLabel: "App: búsqueda",
  description: "Campo de búsqueda que se escribe letra por letra y muestra resultados",
  brief: [
    "Qué: un campo de búsqueda que se escribe letra por letra y muestra resultados; uno queda resaltado: 'encontré lo que buscas'.",
    "Cuándo: la voz habla de buscar un inmueble, producto o cita. No usar: para una lista fija (uiList) ni para un chat (chatInbox).",
    "Coreografía: el campo nace, la búsqueda se escribe a 18 letras por segundo, los resultados suben en cascada de 0.12 s, el resaltado se enciende con el acento y sale la tarjeta.",
    "Gusto: el resultado resaltado es el único con color; títulos en negrita, detalle en gris; sin fondos de relleno.",
    "Datos: resultados de ejemplo del inventario de la marca (reda MCP) o captura; sin datos personales."
  ].join("\n"),
  icon: "M10.5 4a6.5 6.5 0 110 13 6.5 6.5 0 010-13zM15.5 15.5L20 20",
  textKey: "query",
  fullMin: 3,
  defaults: (t, end) => ({
    type: "searchBar", in: t, out: Math.min(t + 5, end), slot: "band", placeholder: "Buscar departamento", query: "torre aurora",
    results: [
      { title: "Torre Aurora · 304", meta: "2 recámaras · 68.40 m² · Disponible" },
      { title: "Torre Aurora · 402", meta: "2 recámaras · 71.25 m² · Disponible" },
      { title: "Torre Aurora · 506", meta: "3 recámaras · 92.80 m² · Apartado" }
    ],
    highlight: 0, source: { ...FICTIONAL }
  }),
  fields: [
    { key: "query", label: "Lo que se escribe", kind: "text" },
    { key: "placeholder", label: "Texto antes de escribir (opcional)", kind: "text", opt: true, ph: "Buscar" },
    { key: "results", label: "Resultados (de 1 a 4)", kind: "blocks", prop: "results", min: 1, max: 4, blank: () => ({ title: "Nuevo resultado", meta: "" }), name: (r) => r.title || "Resultado",
      fields: () => [{ key: "title", label: "Título", kind: "text" }, { key: "meta", label: "Detalle", kind: "text", opt: true }] },
    { key: "highlight", label: "Resultado resaltado", kind: "index", of: "results", name: (r) => r.title }
  ],
  screen: UI_SCREEN(false),
  source: UI_SOURCE,
  pin: null,
  minScale: 0.88,
  timeline: searchTimeline,
  size: (el) => ({ w: CARD_W, h: SEARCH.field + SEARCH.head + Math.max(1, rowsOf(el)) * SEARCH.row + 16 }),
  validate(el, tag) {
    const errors = [], warnings = [];
    if (!String(el.query ?? "").trim()) errors.push(`${tag}: necesita el texto que se escribe`);
    const n = rowsOf(el);
    if (n < 1 || (el.results ?? []).length > 4) errors.push(`${tag}: necesita de 1 a 4 resultados`);
    if (!idx(el, "highlight", n)) errors.push(`${tag}: el resultado resaltado no existe`);
    if (String(el.query ?? "").length > 24) warnings.push(`${tag}: una búsqueda corta se lee mejor`);
    return { errors, warnings };
  },
  texts(el, add) {
    add(el.query); add(el.placeholder);
    for (const r of el.results ?? []) { add(r.title); add(r.meta); }
  },
  events(el, rect, { beats: B, cursor, add }) {
    if (B.res[0]) add(B.res[0][0], "pop");
  },
  draw: (ctx, el, t, env) => drawSearch(ctx, el, env.ts, env.tl, env.rect, env),
};
