// Element "buttonTap" of the motion library: un botón grande de llamada a la acción; un dedo (cursor) lo toca, se hunde y cambia a estado de éxito. One file = one element type (see engine/README.md "Cómo agregar un elemento").
// Timeline beats are in DESIGN seconds; the registry (index.js) scales them to [in, out]. Drawing is a pure function of the local time.
import { seg, expoOut, inOut, clamp, CARD_W } from "../ui-motion.js";
import { fnt, text, disc, checkMark, drawCursor, shadow, noShadow } from "./_kit.js";
import { popIn } from "./_app.js";
import { UI_SCREEN, UI_SOURCE, FICTIONAL } from "./_fields.js";

export const BTN = { w: CARD_W, h: 150 };

export function buttonTimeline(el, mode) {
  if (mode === "full") {
    return { Ld: 2.8, b: { enter: [0, 0.45], cursorIn: [0.7, 1.2], click: 1.25, cursorOut: [1.7, 2.1], exit: [2.4, 2.8] } };
  }
  return { Ld: 2.0, b: { enter: [0, 0.4], click: 0.7, exit: [1.6, 2.0] } };
}

/** Colour of the button after the tap: the brand success colour when it differs from the primary, otherwise the primary (the badge and label carry the change). */
export const doneFill = (skin) => (skin.colors.success && skin.colors.success !== skin.colors.primary ? skin.colors.success : skin.colors.primary);

function drawButton(ctx, el, ts, tl, rect, env) {
  const { skin } = env, C = skin.colors, b = tl.b;
  const w = rect.w, h = rect.h;
  const enter = popIn(ts, b.enter[0], b.enter[1] - b.enter[0]);
  const ex = seg(ts, b.exit[0], b.exit[1]);
  const dt = ts - b.click;
  const done = dt >= 0;
  const press = done ? 1 - seg(dt, 0, 0.16) : 0; // sinks 4 % on the tap frame, springs back in ~5 frames
  const alpha = clamp(enter * 2) * (1 - inOut(ex));
  const label = done ? String(el.doneLabel ?? "") : String(el.label ?? "");
  const fill = done ? doneFill(skin) : C.primary;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(rect.x + w / 2, rect.y + h / 2);
  const s = enter * (1 - 0.04 * press) * (1 - 0.04 * inOut(ex));
  ctx.scale(s, s);
  shadow(ctx, "rgba(16,24,40,0.24)", 40, 14);
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.roundRect(-w / 2, -h / 2, w, h, h / 2);
  ctx.fill();
  noShadow(ctx);
  const f = fnt(skin, 700, 46);
  if (!done) {
    text(ctx, label, 0, 1, { font: f, color: "#FFFFFF", align: "center", maxW: w - 80 });
  } else {
    // success: a white badge with the check, then the done label, centred as a group
    ctx.font = f;
    const tw = Math.min(ctx.measureText(label).width, w - 180);
    const d = 60, k = expoOut(seg(dt, 0, 0.35));
    const gx = -(d + 22 + tw) / 2;
    disc(ctx, gx + d / 2, 0, (d / 2) * k, "#FFFFFF");
    if (k > 0.5) checkMark(ctx, gx + d / 2, 0, d * 0.62 * k, fill, d * 0.08);
    text(ctx, label, gx + d + 22, 1, { font: f, color: "#FFFFFF", align: "left", maxW: w - 180 });
  }
  ctx.restore();
  if (tl.cursor) {
    const ty = rect.y + h / 2;
    const path = [[b.cursorIn[0], 1080 + 70, rect.y + h + 180], [b.cursorIn[1], rect.x + w * 0.66, ty]];
    const a = ts < b.cursorIn[0] ? 0 : 1 - seg(ts, b.cursorOut[0], b.cursorOut[1]);
    drawCursor(ctx, skin, ts, path, b.click, a * (1 - inOut(ex)));
  }
}

export default {
  type: "buttonTap",
  category: "App",
  family: "ui",
  captions: "option",
  label: "Botón",
  timelineLabel: "App: botón",
  description: "Un botón grande que un dedo toca y cambia a «hecho»",
  brief: [
    "Qué: un botón grande de llamada a la acción que un dedo toca y cambia a «hecho»: 'ya quedó'.",
    "Cuándo: la voz pide una acción concreta (agendar, comprar, enviar). No usar: para un interruptor (toggleSwitch) ni para un formulario entero (uiForm).",
    "Coreografía: el botón nace con rebote, el cursor llega y da el toque, el botón se hunde 4 % y pasa al color de éxito con la marca de check.",
    "Gusto: un solo color por estado, texto blanco de 46 px, sin brillo; el check nace dentro del botón, no fuera.",
    "Datos: el texto es el de la acción; sin datos personales."
  ].join("\n"),
  icon: "M4 9h16v6H4zM8 12h8",
  textKey: "label",
  defaults: (t, end) => ({ type: "buttonTap", in: t, out: Math.min(t + 2.8, end), label: "Agendar cita", doneLabel: "Cita agendada", source: { ...FICTIONAL } }),
  fields: [
    { key: "label", label: "Texto del botón", kind: "text" },
    { key: "doneLabel", label: "Texto cuando se toca", kind: "text" }
  ],
  screen: UI_SCREEN(true),
  source: UI_SOURCE,
  pin: null,
  minScale: 0.76,
  fullMin: 2.4,
  cursor: () => true,
  timeline: buttonTimeline,
  size: () => ({ w: BTN.w, h: BTN.h }),
  validate(el, tag) {
    const errors = [], warnings = [];
    if (!el.label) errors.push(`${tag}: el botón necesita texto`);
    if (!el.doneLabel) errors.push(`${tag}: necesita el texto de cuando se toca (doneLabel)`);
    return { errors, warnings };
  },
  texts(el, add) {
    add(el.label); add(el.doneLabel);
  },
  events(el, rect, { beats: B, cursor, add }) {
    if (cursor) add(B.click, "click");
    add(B.click, "pop");
  },
  draw: (ctx, el, t, env) => drawButton(ctx, el, env.ts, env.tl, env.rect, env),
};
