// Element "phoneFrame" of the motion library: a clean phone that enters with a slight tilt, settles, and shows a screenshot (optionally scrolling). One file = one element type (see engine/README.md "Cómo agregar un elemento").
// Timeline beats are in DESIGN seconds; the registry (index.js) scales them to [in, out]. Drawing is a pure function of the local time.
import { seg, lerp, expoOut, inOut, clamp } from "../ui-motion.js";
import { phoneBody, drawFitted, clipRR } from "./_app.js";
import { UI_SCREEN, UI_SOURCE, FICTIONAL } from "./_fields.js";

export const PHONE = { w: 520, h: 1120 };

export function phoneTimeline(el, mode) {
  if (mode === "full") return { Ld: 3.6, b: { enter: [0, 0.7], scroll: [0.4, 3.0], exit: [3.2, 3.6] } };
  return { Ld: 2.4, b: { enter: [0, 0.5], scroll: [0.3, 1.9], exit: [2.0, 2.4] } };
}

/** Scroll offset 0..1 of the screen content at design time ts (el.scroll = fraction of the overflow travelled over the scroll window). */
export const phoneScroll = (el, tl, ts) => clamp(Number(el.scroll) || 0, 0, 1) * inOut(seg(ts, tl.b.scroll[0], tl.b.scroll[1]));

function drawPhone(ctx, el, ts, tl, rect, env) {
  const { skin } = env, C = skin.colors, b = tl.b;
  const w = rect.w, h = rect.h;
  const enter = expoOut(seg(ts, b.enter[0], b.enter[1]));
  const ex = seg(ts, b.exit[0], b.exit[1]);
  const tilt = Number(el.tilt) || 0;
  const angle = lerp(-8, tilt, enter) * Math.PI / 180; // tilted at birth, settles on el.tilt
  const sc = lerp(0.9, 1, enter) * (1 - 0.04 * inOut(ex));
  ctx.save();
  ctx.globalAlpha = clamp(enter * 2.2) * (1 - inOut(ex));
  ctx.translate(rect.x + w / 2, rect.y + h / 2);
  ctx.rotate(angle);
  ctx.scale(sc, sc);
  ctx.translate(-w / 2, -h / 2);
  // body without notch / home bar: they are drawn after the screen so the picture never covers them
  const scr = phoneBody(ctx, skin, w, h, { notch: false, homeBar: false });
  ctx.save();
  clipRR(ctx, scr.x, scr.y, scr.w, scr.h, scr.r);
  ctx.fillStyle = C.surface;
  ctx.fillRect(scr.x, scr.y, scr.w, scr.h);
  const img = el.src ? env.img(el.src) : null;
  if (img) drawFitted(ctx, img, scr.x, scr.y, scr.w, scr.h, el.fit === "contain" ? "contain" : "cover", phoneScroll(el, tl, ts));
  ctx.restore();
  if (el.notch !== false) {
    ctx.fillStyle = "#000000";
    ctx.beginPath();
    ctx.roundRect(w / 2 - w * 0.17, scr.y + 8, w * 0.34, 34, 17);
    ctx.fill();
  }
  if (el.homeBar !== false) {
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.beginPath();
    ctx.roundRect(w / 2 - w * 0.16, h - scr.x - 24, w * 0.32, 10, 5);
    ctx.fill();
  }
  ctx.restore();
}

export default {
  type: "phoneFrame",
  category: "App",
  family: "ui",
  captions: "option",
  label: "Teléfono",
  timelineLabel: "App: teléfono",
  description: "Un teléfono limpio que entra inclinado y muestra una captura, con desplazamiento opcional",
  brief: [
    "Qué: un teléfono limpio que entra inclinado y muestra una captura de la app: 'así se ve en el celular'.",
    "Cuándo: la voz muestra la app o un flujo en el móvil. No usar: para una ventana de escritorio (browserFrame); si la cara de quien habla es grande, que quede a un lado y más chico (lo decide la colocación con cara).",
    "Coreografía: el teléfono nace inclinado 8 grados, se endereza con expoOut en 0.5 s, la captura se desplaza si hay scroll, sale con un leve encogimiento.",
    "Gusto: sin marcas de marca ni brillo; cuerpo oscuro sobrio; se ubica a un lado del rostro, nunca encima.",
    "Datos: captura de la app de la marca (screenshot) o people:pNN para la pantalla; sin datos reales de clientes."
  ].join("\n"),
  icon: "M8 3h8a2 2 0 012 2v14a2 2 0 01-2 2H8a2 2 0 01-2-2V5a2 2 0 012-2zM11 18h2",
  defaults: (t, end) => ({ type: "phoneFrame", in: t, out: Math.min(t + 3.6, end), src: "people:p01", fit: "cover", tilt: 0, scroll: 0, notch: true, homeBar: true, source: { ...FICTIONAL } }),
  fields: [
    { key: "src", label: "Captura (ruta de la imagen o people:pNN)", kind: "text", ph: "people:p01" },
    { key: "fit", label: "Cómo ajustar la imagen", kind: "select", options: [["cover", "Llenar la pantalla"], ["contain", "Ver completa"]], opt: true, ph: "llenar" },
    { key: "scroll", label: "Desplazamiento dentro de la pantalla (0 a 1)", kind: "number", step: 0.05, min: 0, max: 1, opt: true, ph: "0" },
    { key: "tilt", label: "Inclinación final (grados, -15 a 15)", kind: "number", step: 1, min: -15, max: 15, opt: true, ph: "0" },
    { key: "notch", label: "Mostrar la muesca", kind: "bool", opt: true, ph: "sí" },
    { key: "homeBar", label: "Mostrar la barra de inicio", kind: "bool", opt: true, ph: "sí" }
  ],
  screen: UI_SCREEN(false),
  source: UI_SOURCE,
  pin: null,
  minScale: 0.7, // no text: the phone may shrink so it can take a side of the face
  fullMin: 3,
  timeline: phoneTimeline,
  size: () => ({ w: PHONE.w, h: PHONE.h }),
  imageRefs(el, add) {
    if (el.src) add(el.src, "captura");
  },
  validate(el, tag) {
    const errors = [], warnings = [];
    if (!el.src) errors.push(`${tag}: necesita una captura (src)`);
    if (el.fit !== undefined && !["cover", "contain"].includes(el.fit)) errors.push(`${tag}: "fit" debe ser cover o contain`);
    if (el.scroll !== undefined && !(Number(el.scroll) >= 0 && Number(el.scroll) <= 1)) errors.push(`${tag}: el desplazamiento va de 0 a 1`);
    if (el.tilt !== undefined && !(Math.abs(Number(el.tilt)) <= 15)) errors.push(`${tag}: la inclinación va de -15 a 15 grados`);
    return { errors, warnings };
  },
  events(el, rect, { beats: B, add }) {
    add(B.enter[0], "whoosh");
  },
  draw: (ctx, el, t, env) => drawPhone(ctx, el, env.ts, env.tl, env.rect, env),
};
