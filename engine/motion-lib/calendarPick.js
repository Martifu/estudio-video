// Element "calendarPick" of the motion library: una tarjeta de calendario donde se toca un día, luego un horario, y se confirma la cita. One file = one element type (see engine/README.md "Cómo agregar un elemento").
// Timeline beats are in DESIGN seconds; the registry (index.js) scales them to [in, out]. Drawing is a pure function of the local time.
import { seg, expoOut, CARD_W } from "../ui-motion.js";
import { rr, fnt, text, envelope, beginCard, radiusAt, card, drawCursor } from "./_kit.js";
import { UI_SCREEN, UI_SOURCE, FICTIONAL } from "./_fields.js";
import { riseIn, doneBadge, popIn } from "./_app.js";

export const CAL = { pad: 40, headY: 72, weekY: 150, gridY: 190, cellH: 92, rows: 6, chipH: 84, confirmH: 120 };
export const WEEK = ["L", "M", "X", "J", "V", "S", "D"];
const cellW = (w) => (w - CAL.pad * 2) / 7;
export const calHeight = () => CAL.gridY + CAL.rows * CAL.cellH + 30 + CAL.chipH + 30 + CAL.confirmH;
/** Centre of a day cell in card-local px. */
export function dayCenter(w, startDay, day) {
  const idx = startDay + day - 1;
  return { x: CAL.pad + (idx % 7) * cellW(w) + cellW(w) / 2, y: CAL.gridY + Math.floor(idx / 7) * CAL.cellH + CAL.cellH / 2 };
}
/** Centre of time chip i (of n) in card-local px. */
export function chipCenter(w, n, i) {
  const cw = (w - CAL.pad * 2 - (n - 1) * 16) / n;
  return { x: CAL.pad + i * (cw + 16) + cw / 2, y: CAL.gridY + CAL.rows * CAL.cellH + 30 + CAL.chipH / 2 };
}

export function calTimeline(el, mode) {
  const full = mode === "full";
  const dayClick = full ? 1.3 : 0.8;
  const chipsStart = dayClick + (full ? 0.5 : 0.3);
  const chipClick = chipsStart + (full ? 1.0 : 0.6);
  const Ld = chipClick + (full ? 0.9 : 0.7);
  return {
    Ld,
    b: {
      blob: [0, 0.5], dayClick, chips: { start: chipsStart, step: 0.1, dur: 0.45 }, chipClick,
      cursorIn: [0.3, 0.6], cursorOut: [chipClick + 0.45, chipClick + 0.85],
      exit: [Ld - 0.4, Ld]
    }
  };
}

function drawCal(ctx, el, ts, tl, rect, env) {
  const { skin } = env, C = skin.colors, b = tl.b;
  const w = rect.w, h = rect.h;
  const E = envelope(tl, ts);
  const slots = el.slots ?? [];
  const n = slots.length;
  const sel = Number.isInteger(el.chosen) && el.chosen >= 0 && el.chosen < n ? el.chosen : -1;
  const day = Number.isInteger(el.day) ? el.day : -1;
  const dayDone = ts >= b.dayClick;
  const chipDone = sel >= 0 && ts >= b.chipClick;
  beginCard(ctx, el, tl, ts, rect, [w / 2, h / 2], E);
  card(ctx, 0, 0, w, h, radiusAt(E, skin, w, h), skin);
  ctx.save();
  // header and week row
  ctx.globalAlpha *= expoOut(seg(ts, 0.1, 0.5));
  text(ctx, el.month ?? "", CAL.pad, CAL.headY, { font: fnt(skin, 700, 44), color: C.ink, maxW: w - CAL.pad * 2 });
  const cw = cellW(w);
  WEEK.forEach((d, i) => text(ctx, d, CAL.pad + i * cw + cw / 2, CAL.weekY, { font: fnt(skin, 600, 28), color: C.muted, align: "center" }));
  // day grid
  const dim = Math.min(31, Math.max(28, el.daysInMonth ?? 30));
  // leading cells show the end of the previous month in faint grey, so the first row is never a bare gap (October has 31 days)
  const prevLen = 31, lead = el.startDay ?? 0;
  for (let i = 0; i < lead; i += 1) {
    const { x, y } = dayCenter(w, 0, i + 1); // cell index i
    ctx.save();
    ctx.globalAlpha *= 0.4;
    text(ctx, String(prevLen - lead + i + 1), x, y + 1, { font: fnt(skin, 500, 34), color: C.faint, align: "center" });
    ctx.restore();
  }
  for (let d = 1; d <= dim; d += 1) {
    const { x, y } = dayCenter(w, el.startDay ?? 0, d);
    const isSel = d === day && dayDone;
    const press = isSel ? 0.9 + 0.1 * expoOut(seg(ts, b.dayClick, b.dayClick + 0.2)) : 1;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(press, press);
    if (isSel) {
      ctx.fillStyle = C.primary;
      ctx.beginPath();
      ctx.arc(0, 0, 40, 0, Math.PI * 2);
      ctx.fill();
    }
    text(ctx, String(d), 0, 1, { font: fnt(skin, isSel ? 700 : 500, 34), color: isSel ? "#FFFFFF" : C.ink, align: "center" });
    ctx.restore();
  }
  // time chips
  const cw2 = (w - CAL.pad * 2 - (n - 1) * 16) / Math.max(1, n);
  slots.forEach((label, i) => {
    const k = riseIn(ts, b.chips.start + i * b.chips.step, b.chips.dur, 40);
    if (k.k <= 0) return;
    const { x, y } = chipCenter(w, n, i);
    const on = i === sel && chipDone;
    ctx.save();
    ctx.globalAlpha *= k.k; // inherits the card alpha: the chips exit with the card
    ctx.fillStyle = on ? C.accent : C.panel;
    rr(ctx, x - cw2 / 2, y - CAL.chipH / 2 + k.dy, cw2, CAL.chipH, 26);
    ctx.fill();
    text(ctx, label, x, y + k.dy, { font: fnt(skin, 700, 32), color: on ? "#FFFFFF" : C.ink, align: "center", maxW: cw2 - 16 });
    ctx.restore();
  });
  // confirmation row
  if (chipDone) {
    const k = expoOut(seg(ts, b.chipClick, b.chipClick + 0.35));
    const cy = CAL.gridY + CAL.rows * CAL.cellH + 30 + CAL.chipH + 30 + CAL.confirmH / 2;
    doneBadge(ctx, CAL.pad + 36, cy, 72, C.success ?? C.primary, popIn(ts, b.chipClick, 0.35) * (k > 0 ? 1 : 0));
    text(ctx, `${el.confirm || "Cita agendada"} · ${slots[sel]}`, CAL.pad + 96, cy + 1, { font: fnt(skin, 700, 40), color: C.ink, maxW: w - CAL.pad * 2 - 96 });
  }
  ctx.restore();
  ctx.restore(); // beginCard
  // cursor: taps the day, then the chosen time (full mode only; the lite mode has no cursor)
  if (tl.cursor && day >= 1 && day <= dim && sel >= 0) {
    const d = dayCenter(w, el.startDay ?? 0, day), c = chipCenter(w, n, sel);
    const start = [1080 + 70, rect.y + h + 160];
    const path = [
      [b.cursorIn[0], start[0], start[1]],
      [b.dayClick - 0.35, rect.x + d.x, rect.y + d.y],
      [b.dayClick + 0.6, rect.x + d.x, rect.y + d.y],
      [b.chipClick - 0.35, rect.x + c.x, rect.y + c.y]
    ];
    const clickAt = ts < b.dayClick + 0.5 ? b.dayClick : b.chipClick;
    const a = seg(ts, b.cursorIn[0], b.cursorIn[1]) * (1 - seg(ts, b.cursorOut[0], b.cursorOut[1]));
    drawCursor(ctx, skin, ts, path, clickAt, a * E.alpha);
  }
}

export default {
  type: "calendarPick",
  category: "App",
  family: "ui",
  captions: "option",
  label: "Calendario",
  timelineLabel: "App: agendar cita",
  description: "Un día y un horario se eligen con un toque; la cita queda agendada",
  brief: [
    "Qué: un calendario donde se toca un día y luego un horario; la cita queda agendada: 'elige y listo'.",
    "Cuándo: la voz habla de agendar una visita, una cita o una demo. No usar: para una sola fecha sin horarios (qrCard o uiStat) ni para una lista de inventario (uiList).",
    "Coreografía: nace la tarjeta, el mes y la semana aparecen, el cursor toca el día (círculo de acento), los horarios salen escalonados, el cursor toca un horario y aparece la confirmación; todo sale junto con la tarjeta.",
    "Gusto: un solo acento (el día y el horario elegidos); los días del mes se leen con la misma fuerza; nunca un horario que quede sin tarjeta.",
    "Datos: mes y horarios de ejemplo; si es de una marca, los horarios salen de su agenda real (reda MCP) o de la captura."
  ].join("\n"),
  icon: "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4",
  textKey: "month",
  fullMin: 3,
  defaults: (t, end) => ({
    type: "calendarPick", in: t, out: Math.min(t + 5.4, end), month: "Noviembre 2026", startDay: 6, daysInMonth: 30, day: 14,
    slots: ["10:00", "12:00", "16:30", "18:00"], chosen: 1, confirm: "Cita agendada", cursor: true, source: { ...FICTIONAL }
  }),
  fields: [
    { key: "month", label: "Mes", kind: "text" },
    { key: "startDay", label: "El día 1 cae en", kind: "select", options: [["0", "Lunes"], ["1", "Martes"], ["2", "Miércoles"], ["3", "Jueves"], ["4", "Viernes"], ["5", "Sábado"], ["6", "Domingo"]] },
    { key: "daysInMonth", label: "Días del mes (28 a 31)", kind: "number", min: 28, max: 31, step: 1 },
    { key: "day", label: "Día que se elige", kind: "number", min: 1, max: 31, step: 1 },
    { key: "slots", label: "Horarios (de 2 a 4)", kind: "list" },
    { key: "chosen", label: "Horario que se elige", kind: "index", of: "slots", name: (s) => s },
    { key: "confirm", label: "Texto de confirmación", kind: "text", opt: true, ph: "Cita agendada" }
  ],
  screen: UI_SCREEN(true),
  source: UI_SOURCE,
  pin: null,
  minScale: 0.88,
  timeline: calTimeline,
  cursor: (el) => Number.isInteger(el.chosen),
  size: () => ({ w: CARD_W, h: calHeight() }),
  texts(el, add) {
    add(el.month); add(el.confirm || "Cita agendada");
    for (const s of el.slots ?? []) add(s);
  },
  validate(el, tag) {
    const errors = [], warnings = [];
    const n = (el.slots ?? []).length;
    if (n < 2 || n > 4) errors.push(`${tag}: necesita de 2 a 4 horarios (tiene ${n})`);
    const dim = el.daysInMonth ?? 30;
    if (!Number.isInteger(dim) || dim < 28 || dim > 31) errors.push(`${tag}: los días del mes van de 28 a 31`);
    if (!Number.isInteger(el.startDay) || el.startDay < 0 || el.startDay > 6) errors.push(`${tag}: el día 1 debe ser de 0 (lunes) a 6 (domingo)`);
    if (!Number.isInteger(el.day) || el.day < 1 || el.day > dim) errors.push(`${tag}: el día elegido no existe en el mes`);
    if (!Number.isInteger(el.chosen) || el.chosen < 0 || el.chosen >= n) errors.push(`${tag}: el horario elegido no existe`);
    if (!el.month) errors.push(`${tag}: necesita el nombre del mes`);
    return { errors, warnings };
  },
  events(el, rect, { beats: B, cursor, add }) {
    add(B.dayClick, "click");
    add(B.chipClick, "click");
    add(B.chipClick, "pop");
  },
  draw: (ctx, el, t, env) => drawCal(ctx, el, env.ts, env.tl, env.rect, env),
};
