// Element "browserFrame" of the motion library: una ventana de navegador minimalista; la URL se escribe letra por letra y luego aparece la página. One file = one element type (see engine/README.md "Cómo agregar un elemento").
// Timeline beats are in DESIGN seconds; the registry (index.js) scales them to [in, out]. Drawing is a pure function of the local time.
import { seg, expoOut, inOut, clamp, CARD_W } from "../ui-motion.js";
import { fnt, card, radiusAt, rr } from "./_kit.js";
import { browserChrome, BROWSER_BAR, typed, caret, drawFitted, clipRR } from "./_app.js";
import { UI_SCREEN, UI_SOURCE, FICTIONAL } from "./_fields.js";

export const CPS = 18; // characters per second of the URL (craft rule: 15 to 22)
export const frameHeight = (el) => clamp(Number(el.h) || 720, 600, 900);

export function browserTimeline(el, mode) {
  const url = String(el.url ?? "");
  const full = mode === "full";
  const start = full ? 0.5 : 0.35;
  const typeEnd = start + url.length / CPS;
  const page = [typeEnd + 0.05, typeEnd + 0.45];
  const Ld = full ? Math.max(3.6, page[1] + 1.0) : Math.max(2.6, page[1] + 0.8);
  const exit = [Ld - 0.4, Ld];
  return { Ld, b: { rise: [0, full ? 0.5 : 0.4], type: [start, typeEnd], page, scroll: [page[1], Ld - 0.5], exit } };
}

function drawBrowser(ctx, el, ts, tl, rect, env) {
  const { skin } = env, C = skin.colors, b = tl.b;
  const w = rect.w, h = rect.h;
  const url = String(el.url ?? "");
  const rise = expoOut(seg(ts, b.rise[0], b.rise[1]));
  const ex = seg(ts, b.exit[0], b.exit[1]);
  const typing = typed(url, ts, b.type[0], CPS);
  const pageK = expoOut(seg(ts, b.page[0], b.page[1]));
  const R = radiusAt({ k: rise }, skin, w, h);
  ctx.save();
  ctx.globalAlpha = clamp(rise * 2) * (1 - inOut(ex));
  ctx.translate(rect.x + w / 2, rect.y + h / 2 + (1 - rise) * 60);
  ctx.scale(1 - 0.04 * inOut(ex), 1 - 0.04 * inOut(ex));
  ctx.translate(-w / 2, -h / 2);
  card(ctx, 0, 0, w, h, R, skin);
  browserChrome(ctx, skin, w, h, typing);
  // caret while the URL is still being typed
  if (ts >= b.type[0] && ts < b.type[1]) {
    ctx.font = fnt(skin, 500, 30);
    const tw = ctx.measureText(typing).width;
    caret(ctx, 150 + 26 + tw + 3, BROWSER_BAR / 2, 34, C.ink);
  }
  // the page: top aligned, faded and risen in once the URL is written
  ctx.save();
  clipRR(ctx, 0, 0, w, h, R);
  const area = { x: 0, y: BROWSER_BAR, w, h: h - BROWSER_BAR };
  // while the URL types the page is a pale placeholder with skeleton bars, never a blank white box
  ctx.fillStyle = C.panel;
  ctx.fillRect(area.x, area.y, area.w, area.h);
  ctx.save();
  ctx.globalAlpha = 1 - pageK;
  ctx.fillStyle = C.line;
  [[60, 56, 0.72], [60, 110, 0.5], [60, 146, 0.6]].forEach(([x, y, f]) => { rr(ctx, x, area.y + y, (area.w - 120) * f, 26, 13); ctx.fill(); });
  ctx.restore();
  ctx.globalAlpha = pageK;
  ctx.fillStyle = C.surface;
  ctx.fillRect(area.x, area.y, area.w, area.h);
  const img = el.src ? env.img(el.src) : null;
  const scroll = clamp(Number(el.scroll) || 0, 0, 1) * inOut(seg(ts, b.scroll[0], b.scroll[1]));
  if (img) {
    ctx.save();
    ctx.translate(0, (1 - pageK) * 40);
    ctx.beginPath();
    ctx.rect(area.x, area.y, area.w, area.h);
    ctx.clip();
    drawFitted(ctx, img, area.x, area.y, area.w, area.h, "cover", scroll);
    ctx.restore();
  }
  ctx.restore();
  ctx.restore();
}

export default {
  type: "browserFrame",
  category: "App",
  family: "ui",
  captions: "option",
  label: "Navegador",
  timelineLabel: "App: navegador",
  description: "Una ventana de navegador: la dirección se escribe y aparece la página",
  brief: [
    "Qué: una ventana de navegador donde la dirección se escribe y luego aparece la página: 'esto vive en la web'.",
    "Cuándo: la voz habla de la web, la agenda en línea o un sitio. No usar: para un teléfono (phoneFrame) ni para una lista de resultados (searchBar).",
    "Coreografía: nace la ventana, la URL se escribe a 18 letras por segundo, la página sube y aparece en 0.5 s, sale con fundido corto.",
    "Gusto: la página no debe verse en blanco mientras se escribe: el chrome y la URL son lo que se lee; una sola acción de color; sin sombras pesadas.",
    "Datos: captura de la página de la marca (screenshot) o fictional; la URL es de ejemplo, nunca un dominio real de cliente."
  ].join("\n"),
  icon: "M3 5h18v14H3zM3 9h18M6 7h.01M9 7h.01",
  textKey: "url",
  defaults: (t, end) => ({ type: "browserFrame", in: t, out: Math.min(t + 4.2, end), url: "torreaurora.mx/agenda", src: "people:p02", fit: "cover", scroll: 0, h: 720, source: { ...FICTIONAL } }),
  fields: [
    { key: "url", label: "Dirección que se escribe", kind: "text", ph: "torreaurora.mx/agenda" },
    { key: "src", label: "Página (ruta de la imagen o people:pNN)", kind: "text", ph: "people:p02" },
    { key: "scroll", label: "Desplazamiento de la página (0 a 1)", kind: "number", step: 0.05, min: 0, max: 1, opt: true, ph: "0" },
    { key: "h", label: "Alto de la ventana (600 a 900)", kind: "number", step: 10, min: 600, max: 900, opt: true, ph: "720" }
  ],
  screen: UI_SCREEN(false),
  source: UI_SOURCE,
  pin: null,
  minScale: 0.8, // the URL is 30 px: 0.8 keeps it at 24 px
  fullMin: 3,
  timeline: browserTimeline,
  size: (el) => ({ w: CARD_W, h: frameHeight(el) }),
  imageRefs(el, add) {
    if (el.src) add(el.src, "captura");
  },
  validate(el, tag) {
    const errors = [], warnings = [];
    if (!el.url) errors.push(`${tag}: necesita una dirección (url)`);
    if (!el.src) errors.push(`${tag}: necesita una imagen de la página (src)`);
    if (el.h !== undefined && !(Number(el.h) >= 600 && Number(el.h) <= 900)) errors.push(`${tag}: el alto va de 600 a 900`);
    if (el.scroll !== undefined && !(Number(el.scroll) >= 0 && Number(el.scroll) <= 1)) errors.push(`${tag}: el desplazamiento va de 0 a 1`);
    return { errors, warnings };
  },
  texts(el, add) {
    add(el.url);
  },
  events(el, rect, { beats: B, add }) {
    add(B.rise[0], "whoosh");
    add(B.page[0], "pop");
  },
  draw: (ctx, el, t, env) => drawBrowser(ctx, el, env.ts, env.tl, env.rect, env),
};
