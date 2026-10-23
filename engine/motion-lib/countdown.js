// Element "countdown" of the motion library (grupo Venta): cuenta regresiva DD:HH:MM:SS que baja en segundos reales.
// `from` is the remaining time when the element starts (a realistic one, e.g. 03:14:22:10); it ticks 1 s per second of video and must not
// reach zero inside the element. The digit change is a clean vertical slide clipped inside each digit cell (tabular: fixed cells, centred).
// Timeline beats are in DESIGN seconds; the registry (index.js) scales them to [in, out]. Drawing is a pure function of the local time.
import { seg, expoOut } from "../ui-motion.js";
import { rr, fnt, text, card } from "./_kit.js";
import { UI_SOURCE, UI_SCREEN, FICTIONAL } from "./_fields.js";
import { parseRemaining, validDeadline, pushed } from "./_venta.js";

export const COUNT = { w: 880, h: 340, cell: 84, cellH: 140, pair: 8, sep: 30, top: 100, slide: 0.2 };
export const countTimeline = () => ({ Ld: 2.8, b: { label: [0, 0.35], exit: [2.5, 2.8] } });
// Groups DD, HH, MM, SS: each is two digit cells; [seconds per unit, base] of the cell (units, tens). Hours use the day-local seconds.
const CELLS = [
  [[86400, 10], [864000, 10]], // days
  [[3600, 10], [36000, 3]],    // hours (on N % 86400)
  [[60, 10], [600, 6]],        // minutes
  [[1, 10], [10, 6]],          // seconds
];
const UNITS = ["días", "horas", "min", "seg"];

/** Digit shown by a cell for the whole-second value n (group g). */
export function cellDigit(n, g, c) {
  const [p, base] = CELLS[g][c];
  const v = g === 1 ? n % 86400 : n;
  return Math.floor(v / p) % base;
}
/** Remaining whole seconds at local real time `elapsed` (s) from `fromSec`, and the slide fraction u (0 right after a tick -> 1 before the next). */
export function ticker(fromSec, elapsed) {
  const S = Math.max(0, fromSec - elapsed);
  const m = Math.floor(S);
  return { m, u: 1 - (S - m) };
}

function drawCountdown(ctx, el, t, ts, tl, rect, env) {
  const { skin } = env, C = skin.colors, b = tl.b;
  const fromSec = parseRemaining(el.from) ?? 0;
  const { m, u } = ticker(fromSec, Math.max(0, t - el.in));
  // the card is born first (from 40 % opacity, 24 px below), the label and digits follow; the exit is 0.3 s
  const kb = expoOut(seg(ts, 0, 0.4));
  const out = (1 - seg(ts, b.exit[0], b.exit[1])) * Math.min(1, kb * 2.5);
  const kl = expoOut(seg(ts, b.label[0], b.label[1]));
  const { cell, cellH, pair, sep, top } = COUNT;
  const groupW = cell * 2 + pair;
  const total = groupW * 4 + sep * 3;
  const x0 = (rect.w - total) / 2;
  ctx.save();
  ctx.translate(rect.x, rect.y + (1 - kb) * 24);
  ctx.globalAlpha = out;
  card(ctx, 0, 0, rect.w, rect.h, skin.radius.card ?? 28, skin);
  ctx.globalAlpha = out * kl;
  text(ctx, el.label ?? "", 48, 52, { font: fnt(skin, 700, 40), color: C.ink, maxW: rect.w - 96 });
  ctx.globalAlpha = out;
  const sliding = u < COUNT.slide;
  const q = expoOut(Math.min(1, u / COUNT.slide));
  let x = x0;
  for (let g = 0; g < 4; g += 1) {
    for (let c = 0; c < 2; c += 1) {
      const cx0 = x + c * (cell + pair);
      // cell c = position from the left: the left cell is the tens digit (CELLS index 1), the right one the units
      const cur = cellDigit(m, g, 1 - c), old = cellDigit(m + 1, g, 1 - c);
      ctx.save();
      ctx.fillStyle = C.panel ?? C.line;
      rr(ctx, cx0, top, cell, cellH, 16);
      ctx.fill();
      rr(ctx, cx0, top, cell, cellH, 16);
      ctx.clip();
      const mid = top + cellH / 2, font = fnt(skin, 800, 104);
      const digitColor = g === 3 ? C.primary : C.ink; // one accent: the seconds
      if (sliding && cur !== old) {
        // the old digit leaves downwards, the new one comes in from the top; both stay inside the cell
        text(ctx, String(old), cx0 + cell / 2, mid + q * cellH, { font, color: digitColor, align: "center" });
        text(ctx, String(cur), cx0 + cell / 2, mid - (1 - q) * cellH, { font, color: digitColor, align: "center" });
      } else {
        text(ctx, String(cur), cx0 + cell / 2, mid, { font, color: digitColor, align: "center" });
      }
      ctx.restore();
    }
    text(ctx, UNITS[g], x + groupW / 2, top + cellH + 46, { font: fnt(skin, 600, 32), color: C.muted, align: "center" });
    x += groupW;
    if (g < 3) {
      const sx = x + sep / 2;
      ctx.fillStyle = C.ink;
      ctx.beginPath(); ctx.arc(sx, top + cellH / 2 - 24, 6, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(sx, top + cellH / 2 + 24, 6, 0, Math.PI * 2); ctx.fill();
      x += sep;
    }
  }
  ctx.restore();
}

export default {
  type: "countdown",
  category: "Venta",
  captions: "option", // subtitles hide while the element is on screen (element.captions "keep" keeps them), like the screens
  label: "Cuenta regresiva",
  description: "Días, horas, minutos y segundos que bajan hasta el cierre de la oferta",
  brief: [
    "Qué: cuenta regresiva de una fecha límite (días, horas, minutos, segundos).",
    "Cuándo: una oferta con fecha de vencimiento. No usar: para un contador de cifras que sube (counterBig) ni para un temporizador de procesos (progressBar).",
    "Coreografía: la tarjeta nace; las unidades entran en cascada; los dígitos caen al cambiar; al final la tarjeta sale.",
    "Gusto: dígitos grandes con espaciado normal (sin letter-spacing suelto), unidades pequeñas y apagadas debajo; el acento solo en los segundos o en el bloque de días.",
    "Datos: fecha límite del usuario en formato aaaa-mm-dd hh:mm; sin datos reales de clientes."
  ].join("\n"),
  icon: "M12 7v5l3 2M12 3a9 9 0 110 18 9 9 0 010-18z",
  textKey: "label",
  defaults: (t, end) => ({ type: "countdown", in: t, out: Math.min(t + 3.2, end), label: "Termina la preventa", from: "03:14:22:10", offerEnds: "2026-11-30 23:59", source: { ...FICTIONAL } }),
  fields: [
    { key: "label", label: "Qué termina", kind: "text" },
    { key: "from", label: "Tiempo que queda al empezar (DD:HH:MM:SS)", kind: "text", ph: "03:14:22:10" },
    { key: "offerEnds", label: "Fin real de la oferta (aaaa-mm-dd hh:mm)", kind: "text", ph: "2026-11-30 23:59" },
  ],
  screen: UI_SCREEN(false),
  source: UI_SOURCE,
  timeline: countTimeline,
  minScale: 0.76, // the smallest text (32 px unit labels) x 0.76 stays >= 24 px
  size: () => ({ w: COUNT.w, h: COUNT.h }),
  showsNumbers: () => true,
  validate(el, tag) {
    const errors = [], warnings = [];
    if (!el.label) errors.push(`${tag}: necesita qué termina`);
    const sec = parseRemaining(el.from);
    if (sec === null) errors.push(`${tag}: "Tiempo que queda" debe ser DD:HH:MM:SS (horas 0-23, minutos y segundos 0-59)`);
    else if (sec <= Math.max(0, Number(el.out) - Number(el.in)) + 1) errors.push(`${tag}: el tiempo que queda debe ser mayor que la duración del elemento (no puede llegar a cero)`);
    if (!el.offerEnds) errors.push(`${tag}: necesita la fecha real de fin de la oferta`);
    else if (!validDeadline(el.offerEnds)) errors.push(`${tag}: la fecha de fin debe ser aaaa-mm-dd o aaaa-mm-dd hh:mm`);
    if (!el.source?.kind || el.source.kind === "fictional") warnings.push(`${tag}: la cuenta regresiva debe ligarse a la fecha real de la oferta (es ilustrativa)`);
    return { errors, warnings };
  },
  texts(el, add) {
    add(el.label);
  },
  events(el, rect, { beats: B, add }) {
    add(B.label[0], "pop");
  },
  draw: (ctx, el, t, env) => pushed(ctx, el, env.ts, env.tl, env.rect, () => drawCountdown(ctx, el, t, env.ts, env.tl, env.rect, env)),
};
