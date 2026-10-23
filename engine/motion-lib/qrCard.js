// Element "qrCard" of the motion library: tarjeta con un código QR real (generado de la url) y una línea de escaneo. One file = one element type (see engine/README.md "Cómo agregar un elemento").
// Timeline beats are in DESIGN seconds; the registry (index.js) scales them to [in, out]. Drawing is a pure function of the local time.
import { seg, expoOut } from "../ui-motion.js";
import { fnt, text, card, envelope, beginCard, radiusAt } from "./_kit.js";
import { qrMatrix } from "./_app.js";
import { UI_SCREEN, UI_SOURCE, FICTIONAL } from "./_fields.js";

export const QR = { w: 720, h: 800, box: 600, quiet: 4, top: 56, maxLen: 150, minSpeed: 0.8, maxSpeed: 4 };
const ECC_LEVELS = ["L", "M", "Q", "H"];
const cache = new Map(); // pure memo: url|ecc -> matrix (the same url always draws the same code)

/** The QR matrix of `url` (boolean[][], no quiet zone), computed once per url and level. */
export function qrFor(url, ecc = "M") {
  const key = `${url}|${ecc}`;
  if (!cache.has(key)) cache.set(key, qrMatrix(String(url), ecc));
  return cache.get(key);
}

export function qrTimeline(el, mode) {
  if (mode !== "full") return { Ld: 2.4, b: { blob: [0, 0.5], rise: [0.4, 0.8], exit: [2.0, 2.4] } };
  return { Ld: 3.2, b: { blob: [0, 0.5], rise: [0.45, 0.9], sweep: [0.9, 2.9], exit: [2.8, 3.2] } };
}

/** Scan line position 0..1 (down and back up, one trip every `speed` seconds). */
export function scanPhase(ts, start, speed) {
  const f = ((ts - start) / speed) % 1;
  return 1 - Math.abs(f * 2 - 1);
}

function drawQr(ctx, el, ts, tl, rect, env) {
  const { skin } = env, C = skin.colors, b = tl.b;
  const w = rect.w, h = rect.h;
  const E = envelope(tl, ts);
  beginCard(ctx, el, tl, ts, rect, [w / 2, h / 2], E);
  const R = radiusAt(E, skin, w, h);
  card(ctx, 0, 0, w, h, R, skin, { blur: 50, off: 24, a: 0.22 });
  const M = qrFor(el.url, el.ecc ?? "M");
  const n = M.length;
  const mod = Math.floor(QR.box / (n + 2 * QR.quiet));
  const side = mod * n;
  const x0 = Math.round((w - side) / 2), y0 = Math.round(QR.top + (QR.box - side) / 2);
  ctx.save();
  ctx.fillStyle = C.ink;
  for (let r = 0; r < n; r += 1) for (let c = 0; c < n; c += 1) if (M[r][c]) ctx.fillRect(x0 + c * mod, y0 + r * mod, mod, mod);
  ctx.restore();
  if (b.sweep) {
    const [s0, s1] = b.sweep;
    const a = Math.min(seg(ts, s0, s0 + 0.15), 1 - seg(ts, s1 - 0.15, s1));
    if (a > 0) {
      ctx.save();
      ctx.globalAlpha *= a;
      ctx.fillStyle = C.accent;
      const y = y0 + scanPhase(ts, s0, Number(el.scanSpeed) || 1.6) * side;
      ctx.fillRect(x0 - 8, Math.round(y) - 3, side + 16, 6);
      ctx.restore();
    }
  }
  const rise = expoOut(seg(ts, b.rise[0], b.rise[1]));
  ctx.globalAlpha *= rise;
  text(ctx, el.caption || "Escanea para agendar", w / 2, QR.top + QR.box + 60 + (1 - rise) * 40, { font: fnt(skin, 700, 40), color: C.ink, align: "center", maxW: w - 80 });
  ctx.restore();
}

export default {
  type: "qrCard",
  category: "App",
  family: "ui",
  captions: "option",
  label: "Código QR",
  timelineLabel: "App: código QR",
  description: "Código QR real de una dirección, con una línea de escaneo",
  brief: [
    "Qué: un código QR real de una dirección con una línea de escaneo: 'escanea y entra'.",
    "Cuándo: la voz manda al espectador a escanear o a un enlace. No usar: para un botón (buttonTap) ni para un calendario (calendarPick).",
    "Coreografía: nace la tarjeta, el código aparece en el mismo instante, la línea de acento barre dos veces y el texto sube al final; sale junto con la tarjeta.",
    "Gusto: el código es negro sobre blanco, nunca de color; un solo acento en la línea de escaneo; texto de 40 px.",
    "Datos: la URL es la de la marca o de ejemplo; nunca un enlace personal."
  ].join("\n"),
  icon: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h3v3h-3zM19 19h1v1h-1zM17 17h3v3h-3z",
  textKey: "caption",
  defaults: (t, end) => ({ type: "qrCard", in: t, out: Math.min(t + 3.2, end), url: "https://modo.mx/agenda", caption: "Escanea para agendar", source: { ...FICTIONAL } }),
  fields: [
    { key: "url", label: "Dirección que abre el código (máximo 150 caracteres)", kind: "text" },
    { key: "caption", label: "Texto debajo del código", kind: "text", opt: true, ph: "Escanea para agendar" },
    { key: "ecc", label: "Corrección de errores", kind: "select", options: [["L", "Baja"], ["M", "Media"], ["Q", "Alta"], ["H", "Máxima"]], opt: true, ph: "media" },
    { key: "scanSpeed", label: "Segundos por barrido de la línea", kind: "number", step: 0.1, min: QR.minSpeed, max: QR.maxSpeed, opt: true, ph: "1.6" }
  ],
  screen: UI_SCREEN(false),
  source: UI_SOURCE,
  pin: null,
  minScale: 0.76,
  fullMin: 2.8,
  timeline: qrTimeline,
  size: () => ({ w: QR.w, h: QR.h }),
  validate(el, tag) {
    const errors = [], warnings = [];
    const url = String(el.url ?? "");
    if (!url.trim()) errors.push(`${tag}: necesita una dirección (url)`);
    else if (url.length > QR.maxLen) errors.push(`${tag}: la dirección tiene ${url.length} caracteres (máximo ${QR.maxLen})`);
    if (el.ecc !== undefined && !ECC_LEVELS.includes(el.ecc)) errors.push(`${tag}: "ecc" debe ser L, M, Q o H`);
    if (el.scanSpeed !== undefined && !(Number(el.scanSpeed) >= QR.minSpeed && Number(el.scanSpeed) <= QR.maxSpeed)) errors.push(`${tag}: los segundos por barrido van de ${QR.minSpeed} a ${QR.maxSpeed}`);
    return { errors, warnings };
  },
  texts(el, add) {
    add(el.caption || "Escanea para agendar");
  },
  events(el, rect, { beats: B, cursor, add }) {
    add(B.blob[0], "pop");
  },
  draw: (ctx, el, t, env) => drawQr(ctx, el, env.ts, env.tl, env.rect, env),
};
