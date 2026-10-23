// Element "uiStat" of the motion library: una cifra grande que cuenta hasta su valor. One file = one element type (see engine/README.md "Cómo agregar un elemento").
// Timeline beats are in DESIGN seconds; the registry (index.js) scales them to [in, out]. Drawing is a pure function of the local time.
import { clamp, seg, lerp, expoOut, outBack, statText } from "../ui-motion.js";
import { rr, hexA, fnt, text, card, disc, envelope, beginCard, radiusAt } from "./_kit.js";
import { UI_SCREEN, UI_SOURCE, FICTIONAL } from "./_fields.js";
export const STAT = { w: 820, h: 420 };

export const statTimeline = () => ({ Ld: 2.8, b: { blob: [0, 0.5], label: [0.25, 0.6], count: [0.35, 1.45], delta: [1.45, 1.85], push: [1.0, 2.4], exit: [2.4, 2.8] } });

function statGlyph(ctx, name, cx, cy, size, color) {
  ctx.save();
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = size * 0.09; ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.translate(cx, cy);
  const s = size / 24;
  ctx.scale(s, s);
  ctx.translate(-12, -12);
  ctx.beginPath();
  if (name === "users") { ctx.arc(9, 8, 3.6, 0, Math.PI * 2); ctx.moveTo(2.5, 20); ctx.quadraticCurveTo(9, 9, 15.5, 20); ctx.moveTo(16, 4.8); ctx.arc(16.5, 8, 3, -1.9, 1.9); ctx.moveTo(18, 14); ctx.quadraticCurveTo(21, 15.5, 21.5, 20); ctx.stroke(); }
  else if (name === "chart") { ctx.moveTo(5, 20); ctx.lineTo(5, 12); ctx.moveTo(12, 20); ctx.lineTo(12, 5); ctx.moveTo(19, 20); ctx.lineTo(19, 9); ctx.stroke(); }
  else if (name === "home") { ctx.moveTo(3.5, 11); ctx.lineTo(12, 4); ctx.lineTo(20.5, 11); ctx.moveTo(6, 9.5); ctx.lineTo(6, 20); ctx.lineTo(18, 20); ctx.lineTo(18, 9.5); ctx.stroke(); }
  else if (name === "calendar") { ctx.roundRect(3, 5, 18, 16, 2); ctx.moveTo(16, 3); ctx.lineTo(16, 7); ctx.moveTo(8, 3); ctx.lineTo(8, 7); ctx.moveTo(3, 10); ctx.lineTo(21, 10); ctx.stroke(); }
  else { ctx.arc(12, 12, 9, 0, Math.PI * 2); ctx.stroke(); ctx.font = `700 14px system-ui, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("$", 12, 12.8); }
  ctx.restore();
}
function drawStat(ctx, el, ts, tl, rect, env) {
  const { skin } = env, C = skin.colors, b = tl.b;
  const w = rect.w, h = rect.h;
  const E = envelope(tl, ts, { blurExit: true });
  beginCard(ctx, el, tl, ts, rect, [w / 2, h / 2], E);
  const R = radiusAt(E, skin, w, h);
  card(ctx, 0, 0, w, h, R, skin);
  ctx.save();
  rr(ctx, 0, 0, w, h, R);
  ctx.clip();
  const la = expoOut(seg(ts, b.label[0], b.label[1]));
  ctx.globalAlpha *= la;
  let lx = 56;
  if (el.icon) { disc(ctx, 56 + 42, 84, 42, hexA(C.accent, 0.1)); statGlyph(ctx, el.icon, 98, 84, 48, C.accent); lx = 56 + 84 + 24; }
  text(ctx, el.label ?? "", lx, 84, { font: fnt(skin, 600, 34), color: C.muted, maxW: w - lx - 56 });
  ctx.globalAlpha = E.alpha;
  // value: counts up to the exact text
  const final = statText(el, 1);
  const kc = seg(ts, b.count[0], b.count[1]);
  let px = 170;
  ctx.font = fnt(skin, 700, px);
  while (px > 80 && ctx.measureText(final).width > w - 112) { px -= 6; ctx.font = fnt(skin, 700, px); }
  // The number counts up MONOTONICALLY (ease-out, 1 - (1 - k)^3) and lands exactly on the final text: it never exceeds the final value and
  // never goes back down. Left aligned, so a changing digit count does not move the first digit.
  const shown = kc >= 1 ? final : statText(el, 1 - Math.pow(1 - kc, 3));
  ctx.save();
  ctx.globalAlpha *= expoOut(seg(ts, b.count[0] - 0.1, b.count[0] + 0.2));
  text(ctx, shown, 56, 236, { font: ctx.font, color: C.ink, ls: -2 });
  ctx.restore();
  if (el.delta?.text) {
    const g = seg(ts, b.delta[0], b.delta[1]);
    if (g > 0) {
      const up = el.delta.dir !== "down";
      const col = up ? C.success : C.danger;
      ctx.save();
      ctx.font = fnt(skin, 700, 32);
      const dw = ctx.measureText(el.delta.text).width + 40 + 30 + 10;
      const cy = 350;
      ctx.translate(56 + dw / 2, cy);
      const sc = lerp(0.5, 1, outBack(g));
      ctx.scale(sc, sc);
      ctx.globalAlpha *= clamp(g * 4);
      ctx.fillStyle = hexA(col, 0.14);
      rr(ctx, -dw / 2, -29, dw, 58, 29);
      ctx.fill();
      ctx.strokeStyle = col; ctx.lineWidth = 4.5; ctx.lineCap = "round"; ctx.lineJoin = "round";
      const ax = -dw / 2 + 36;
      ctx.beginPath();
      if (up) { ctx.moveTo(ax, 8); ctx.lineTo(ax, -9); ctx.moveTo(ax - 8, -1); ctx.lineTo(ax, -9); ctx.lineTo(ax + 8, -1); }
      else { ctx.moveTo(ax, -8); ctx.lineTo(ax, 9); ctx.moveTo(ax - 8, 1); ctx.lineTo(ax, 9); ctx.lineTo(ax + 8, 1); }
      ctx.stroke();
      text(ctx, el.delta.text, ax + 24, 2, { font: fnt(skin, 700, 32), color: col });
      ctx.restore();
    }
  }
  ctx.restore();
  ctx.restore();
}


export default {
  type: "uiStat",
  category: "Pantallas",
  family: "ui",
  placement: "pinned", // the original product screens keep their slot (no face-aware default)
  captions: "option",
  label: "Cifra grande",
  timelineLabel: "Pantalla: cifra grande",
  description: "Una cifra grande que cuenta hasta su valor",
  brief: [
    "Qué: una cifra de la app (ingresos, citas, conversión) que corre hasta su valor, con su variación.",
    "Cuándo: la voz dice un número clave del producto. No usar: varias cifras a la vez (kpiGrid) ni una cifra de marketing sin tarjeta de app (counterBig).",
    "Coreografía: nace la tarjeta, los dígitos ruedan hasta la cifra (18-52 cuadros, curva out), aparece el delta, empuje leve de cámara.",
    "Gusto: la cifra domina (≥ 150 px); etiqueta corta arriba; delta verde/rojo pequeño; nada de gráficas de relleno.",
    "Datos: MCP (get_performance_summary) o captura; source obligatorio; si es ilustrativa, kind fictional y aprobada por el usuario."
  ].join("\n"),
  icon: "M5 20V10M12 20V4M19 20v-8",
  textKey: "label",
  defaults: (t, end) => ({ type: "uiStat", in: t, out: Math.min(t + 3.2, end), label: "Citas agendadas este mes", value: 128, format: "int", delta: { text: "+18% vs. mes pasado", dir: "up" }, icon: "calendar", source: { ...FICTIONAL } }),
  fields: [
    { key: "label", label: "Qué mide", kind: "text" },
    { key: "value", label: "Cifra", kind: "number", step: 1 },
    { key: "format", label: "Formato", kind: "select", options: [["int", "Número (1,284)"], ["money", "Dinero ($1,284)"], ["pct", "Porcentaje (42%)"], ["compact", "Corto (1.2M)"]] },
    { key: "prefix", label: "Antes de la cifra (opcional)", kind: "text", opt: true },
    { key: "suffix", label: "Después de la cifra (opcional)", kind: "text", opt: true },
    { key: "delta.text", label: "Cambio (ej. +12% vs. mes pasado)", kind: "text", opt: true },
    { key: "delta.dir", label: "El cambio es", kind: "select", options: [["up", "Sube (verde)"], ["down", "Baja (rojo)"]], opt: true, ph: "sube" },
    { key: "icon", label: "Icono", kind: "select", options: [["money", "Dinero"], ["users", "Personas"], ["chart", "Gráfica"], ["home", "Casa"], ["calendar", "Calendario"]], opt: true, ph: "sin icono" }
  ],
  screen: UI_SCREEN(false),
  source: UI_SOURCE,
  pin: null,
  timeline: statTimeline,
  size: (el) => ({ w: STAT.w, h: STAT.h }),
  showsNumbers: (el) => true,
  validate(el, tag) {
    const errors = [], warnings = [];
    if (!el.label || el.value === undefined || el.value === "") errors.push(`${tag}: necesita qué mide y la cifra`);
    return { errors, warnings };
  },
  texts(el, add) {
    add(el.label); add(el.delta?.text);
  },
  events(el, rect, { beats: B, cursor, add }) {
    add(B.blob[0], "pop");
  },
  draw: (ctx, el, t, env) => drawStat(ctx, el, env.ts, env.tl, env.rect, env),
};
