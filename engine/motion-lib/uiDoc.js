// Element "uiDoc" of the motion library: hoja de cotización que sube; una fila se resalta y se despega. One file = one element type (see engine/README.md "Cómo agregar un elemento").
// Timeline beats are in DESIGN seconds; the registry (index.js) scales them to [in, out]. Drawing is a pure function of the local time.
import { clamp, seg, lerp, expoOut, inOut, outBack, EXIT, countText, CARD_W } from "../ui-motion.js";
import { rr, hexA, mix, fnt, text, shadow, noShadow, card, envelope, pushScale, rise } from "./_kit.js";
import { UI_SCREEN, UI_SOURCE, FICTIONAL, idx } from "./_fields.js";
export const DOC = { top: 120, title: 70, th: 58, pad: 30, lift: 160, gap: 22 };
export const docRowH = (el) => ((el.rows ?? []).some((r) => r.detail) ? 90 : 72);

export const docSheetHeight = (el) => DOC.top + DOC.title + DOC.th + (el.rows ?? []).length * docRowH(el) + DOC.pad;
export const hasLift = (el) => Number.isInteger(el.highlight) && el.highlight >= 0 && el.highlight < (el.rows ?? []).length && !!el.lift;

export function docTimeline(el) {
  const hl = Number.isInteger(el.highlight) && el.highlight >= 0 && el.highlight < (el.rows ?? []).length;
  const b = { rise: [0, 0.7], rule: [0.5, 0.9], rows: { start: 0.65, step: 0.1, dur: 0.4 } };
  if (!hl) { Object.assign(b, { push: [1.2, 1.8], exit: [1.9, 2.3] }); return { Ld: 2.3, b }; }
  Object.assign(b, { highlight: [1.4, 1.75], lift: [1.8, 2.2], count: [1.85, 2.5], push: [1.8, 2.4] });
  if (el.lift?.split?.length) { b.splitIn = [2.45, 2.6]; b.split = [2.55, 3.2]; }
  b.exit = [(el.lift?.split?.length ? 3.2 : 2.6) + 0.4, (el.lift?.split?.length ? 3.2 : 2.6) + 0.4 + EXIT];
  return { Ld: b.exit[1], b };
}

function drawSheet(ctx, el, ts, tl, env, w, H) {
  const { skin } = env, C = skin.colors, b = tl.b;
  ctx.fillStyle = C.surface;
  rr(ctx, 0, 0, w, H, 30);
  ctx.fill();
  ctx.save();
  rr(ctx, 0, 0, w, H, 30);
  ctx.clip();
  text(ctx, el.brand ?? "", 40, 52, { font: fnt(skin, 800, 44), color: "#111111", ls: 0.9, maxW: 520 });
  if (el.kind) text(ctx, String(el.kind).toUpperCase(), 40, 90, { font: fnt(skin, 600, 24), color: C.faint, ls: 3, maxW: 520 });
  if (el.date) {
    text(ctx, "Fecha", w - 40, 44, { font: fnt(skin, 700, 26), color: "#111111", align: "right" });
    text(ctx, el.date, w - 40, 82, { font: fnt(skin, 500, 26), color: "#444444", align: "right" });
  }
  const rule = inOut(seg(ts, b.rule[0], b.rule[1]));
  ctx.fillStyle = C.primary;
  ctx.fillRect(40, DOC.top - 8, (w - 80) * rule, 5);
  text(ctx, el.title ?? "", 40, DOC.top + 24, { font: fnt(skin, 800, 36), color: "#111111", maxW: w - 80 });
  const ty = DOC.top + DOC.title, tw = w - 80, rh = docRowH(el);
  ctx.save();
  rr(ctx, 40, ty, tw, DOC.th + (el.rows ?? []).length * rh, 18);
  ctx.clip();
  ctx.fillStyle = C.header;
  ctx.fillRect(40, ty, tw, DOC.th);
  const cols = el.columns?.length ? el.columns : ["CONCEPTO", "MONTO"];
  text(ctx, String(cols[0]).toUpperCase(), 66, ty + DOC.th / 2 + 1, { font: fnt(skin, 800, 24), color: "#fff", ls: 2.4 });
  text(ctx, String(cols[cols.length - 1]).toUpperCase(), 40 + tw - 26, ty + DOC.th / 2 + 1, { font: fnt(skin, 800, 24), color: "#fff", ls: 2.4, align: "right" });
  (el.rows ?? []).forEach((r, i) => {
    const q = expoOut(seg(ts, b.rows.start + i * b.rows.step, b.rows.start + i * b.rows.step + b.rows.dur));
    const y = ty + DOC.th + i * rh;
    ctx.save();
    ctx.globalAlpha *= q;
    ctx.translate((1 - q) * -40, 0);
    ctx.fillStyle = C.surface;
    ctx.fillRect(40, y, tw, rh);
    ctx.fillStyle = "#EEF0F3";
    ctx.fillRect(40, y, tw, 2);
    if (i === el.highlight && b.highlight) {
      const k = inOut(seg(ts, b.highlight[0], b.highlight[1]));
      ctx.fillStyle = hexA(C.highlight, 0.55);
      ctx.fillRect(40, y + 2, tw * k, rh - 2);
    }
    const mid = y + rh / 2;
    const strong = r.bold || i === el.highlight;
    if (r.detail) {
      text(ctx, r.label ?? "", 66, mid - 14, { font: fnt(skin, strong ? 800 : 500, 26), color: strong ? "#111111" : "#333333", maxW: tw - 300 });
      text(ctx, r.detail, 66, mid + 18, { font: fnt(skin, 500, 24), color: C.muted, maxW: tw - 300 });
    } else text(ctx, r.label ?? "", 66, mid + 1, { font: fnt(skin, strong ? 800 : 500, 26), color: strong ? "#111111" : "#333333", maxW: tw - 300 });
    text(ctx, String(r.value ?? ""), 40 + tw - 26, mid + 1, { font: fnt(skin, 800, 26), color: "#111111", align: "right" });
    ctx.restore();
  });
  ctx.restore();
  ctx.strokeStyle = "#E6E8EC";
  ctx.lineWidth = 2;
  rr(ctx, 41, ty + 1, tw - 2, DOC.th + (el.rows ?? []).length * rh - 2, 18);
  ctx.stroke();
  ctx.restore();
}
function drawDoc(ctx, el, ts, tl, rect, env) {
  const { skin } = env, C = skin.colors, b = tl.b;
  const w = rect.w;
  const lift = hasLift(el);
  const sheetH = rect.h - (lift ? DOC.lift + DOC.gap : 0);
  const sheetY = rect.y + rect.h - sheetH;
  const E = envelope(tl, ts, {});
  const k = expoOut(seg(ts, b.rise[0], b.rise[1]));
  const alpha = seg(ts, 0, 0.15) * (1 - inOut(E.ex));
  const sc = pushScale(el, tl, ts, w) * E.exitScale;
  const tilt = ((1 - k) * 28 * Math.PI) / 180;
  const rise0 = (1 - k) * 500;
  ctx.save();
  ctx.globalAlpha = alpha;
  // camera push about the sheet's centre (forward only)
  ctx.translate(rect.x + w / 2, sheetY + sheetH / 2);
  ctx.scale(sc, sc);
  ctx.translate(-w / 2, -sheetH / 2);
  const off = tilt > 0.002 ? env.canvas?.(w, sheetH) : null;
  if (tilt > 0.002 && off) {
    // rotateX around the bottom edge with perspective: draw the sheet flat, then project it strip by strip
    off.ctx.clearRect(0, 0, w, sheetH);
    drawSheet(off.ctx, el, ts, tl, env, w, sheetH);
    const P = 2200, step = 3, cos = Math.cos(tilt), sin = Math.sin(tilt);
    const sMid = P / (P + (sheetH / 2) * sin);
    ctx.save();
    shadow(ctx, "rgba(16,24,40,0.30)", 70, 30);
    ctx.fillStyle = C.surface;
    const topS = P / (P + sheetH * sin);
    ctx.beginPath();
    ctx.moveTo(w / 2 - (w * topS) / 2 + 20, rise0 + sheetH - sheetH * cos);
    ctx.lineTo(w / 2 + (w * topS) / 2 - 20, rise0 + sheetH - sheetH * cos);
    ctx.lineTo(w, rise0 + sheetH);
    ctx.lineTo(0, rise0 + sheetH);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    void sMid;
    for (let y = 0; y < sheetH; y += step) {
      const hh = sheetH - y;
      const s = P / (P + hh * sin);
      const dy = rise0 + sheetH - hh * cos;
      ctx.drawImage(off.canvas, 0, y, w, Math.min(step, sheetH - y), w / 2 - (w * s) / 2, dy, w * s, Math.max(1, step * cos * s + 0.6));
    }
  } else {
    ctx.save();
    ctx.translate(0, rise0);
    card(ctx, 0, 0, w, sheetH, 30, skin);
    drawSheet(ctx, el, ts, tl, env, w, sheetH);
    ctx.restore();
  }
  ctx.restore();
  // lifted row: a separate card that rises above the sheet
  if (lift && b.lift) {
    const l = seg(ts, b.lift[0], b.lift[1]);
    if (l > 0) {
      const rh = docRowH(el);
      const rowY = sheetY + DOC.top + DOC.title + DOC.th + el.highlight * rh;
      const y0 = rowY + rh / 2 - DOC.lift / 2, y1 = rect.y;
      const y = lerp(y0, y1, expoOut(l));
      const s = lerp(0.9, 1, outBack(l));
      ctx.save();
      ctx.globalAlpha = clamp(l * 5) * (1 - inOut(E.ex));
      ctx.translate(rect.x + w / 2, y + DOC.lift / 2);
      ctx.scale(s * E.exitScale, s * E.exitScale);
      ctx.translate(-w / 2, -DOC.lift / 2);
      shadow(ctx, "rgba(0,0,0,0.38)", 60, 30);
      ctx.fillStyle = C.surface;
      rr(ctx, 0, 0, w, DOC.lift, 30);
      ctx.fill();
      noShadow(ctx);
      ctx.strokeStyle = C.highlight;
      ctx.lineWidth = 4;
      rr(ctx, 2, 2, w - 4, DOC.lift - 4, 28);
      ctx.stroke();
      const lf = el.lift;
      const sp = lf.split ?? [];
      const sub = lf.sub ?? (sp.length ? sp.map((x) => `${x.pct}% ${x.label}`).join(" · ") : "");
      const top = sp.length && b.splitIn ? lerp(DOC.lift / 2, 44, expoOut(seg(ts, b.splitIn[0] - 0.1, b.splitIn[1] + 0.1))) : DOC.lift / 2;
      text(ctx, lf.label ?? "", 36, top - (sub ? 12 : 0), { font: fnt(skin, 600, 28), color: "#555555", maxW: w - 420 });
      if (sub) text(ctx, sub, 36, top + 22, { font: fnt(skin, 500, 24), color: C.muted, maxW: w - 420 });
      const ck = b.count ? expoOut(seg(ts, b.count[0], b.count[1])) : 1;
      text(ctx, countText(lf.value, ck, "money"), w - 36, top + 4, { font: fnt(skin, 800, 58), color: "#111111", align: "right", ls: -1 });
      if (sp.length && b.split) {
        const sa = seg(ts, b.splitIn[0], b.splitIn[1]);
        const g = inOut(seg(ts, b.split[0], b.split[1]));
        ctx.globalAlpha *= sa;
        const bx = 36, bw = w - 72, by = DOC.lift - 46;
        ctx.fillStyle = "#EEF0F3";
        rr(ctx, bx, by, bw, 22, 11);
        ctx.fill();
        ctx.save();
        rr(ctx, bx, by, bw, 22, 11);
        ctx.clip();
        const tot = sp.reduce((n, x) => n + (Number(x.pct) || 0), 0) || 100;
        let xx = bx;
        const cols = [C.highlight, C.accent, C.primary, C.faint];
        sp.forEach((x, i) => { const sw = (bw * (Number(x.pct) || 0)) / tot * g; ctx.fillStyle = i === 1 ? mix("#FFFFFF", C.accent, 0.2) : cols[i % cols.length]; ctx.fillRect(xx, by, sw, 22); xx += sw; });
        ctx.restore();
      }
      ctx.restore();
    }
  }
}


export default {
  type: "uiDoc",
  category: "Pantallas",
  family: "ui",
  placement: "pinned", // the original product screens keep their slot (no face-aware default)
  captions: "option",
  label: "Documento",
  timelineLabel: "Pantalla: documento",
  description: "Hoja de cotización que sube; una fila se resalta y se despega",
  brief: [
    "Qué: el documento que entrega la app (cotización PDF, esquema de pago, contrato) con UNA cifra que importa.",
    "Cuándo: la voz menciona la cotización o el esquema financiero. No usar: para tablas largas que nadie alcanza a leer ni para un solo precio (priceTag).",
    "Coreografía: la hoja sube en 3D, se dibuja la regla, entran las filas, se resalta una fila, esa cifra se despega como tarjeta con barra de reparto.",
    "Gusto: 4-6 filas máximo; la fila resaltada es la que dice la voz; tipografía de la piel de la app.",
    "Datos: captura del PDF real o del MCP (get_sale_payment_plan); source obligatorio; nunca datos de un cliente real."
  ].join("\n"),
  icon: "M7 3h8l4 4v14H7zM15 3v4h4M10 12h6M10 16h6",
  textKey: "title",
  defaults: (t, end) => ({
    type: "uiDoc", in: t, out: Math.min(t + 4.2, end), brand: "TORRE AURORA", kind: "Cotización financiera", date: "22/10/2026", title: "Esquema financiero", columns: ["Concepto", "Monto"],
    rows: [
      { label: "Precio final cotizado", value: "$2,960,000.00" },
      { label: "Apartado base del esquema", value: "10.0%" },
      { label: "Apartado total a pagar", value: "$296,000.00", bold: true },
      { label: "Total a liquidar", value: "$2,664,000.00", bold: true }
    ],
    highlight: 2, lift: { label: "Apartado 10%", value: "$296,000.00", split: [{ label: "apartado", pct: 10 }, { label: "saldo", pct: 90 }] }, source: { ...FICTIONAL }
  }),
  fields: [
    { key: "brand", label: "Nombre del desarrollo o empresa", kind: "text" },
    { key: "kind", label: "Tipo de documento", kind: "text", opt: true },
    { key: "date", label: "Fecha", kind: "text", opt: true },
    { key: "title", label: "Título", kind: "text" },
    { key: "columns", label: "Encabezados de columna (2 líneas)", kind: "list" },
    { key: "rows", label: "Filas (1 a 8)", kind: "blocks", prop: "rows", min: 1, max: 8, blank: () => ({ label: "Concepto", value: "$0" }), name: (r) => r.label || "Fila",
      fields: () => [{ key: "label", label: "Concepto", kind: "text" }, { key: "detail", label: "Detalle (opcional)", kind: "text", opt: true }, { key: "value", label: "Monto", kind: "text" }, { key: "bold", label: "En negritas", kind: "bool" }] },
    { key: "highlight", label: "Fila que se resalta", kind: "index", of: "rows", name: (r) => r.label },
    { key: "lift.label", label: "Tarjeta de la fila resaltada: título", kind: "text", opt: true },
    { key: "lift.value", label: "Tarjeta: monto", kind: "text", opt: true },
    { key: "lift.sub", label: "Tarjeta: texto pequeño (opcional)", kind: "text", opt: true },
    { key: "lift.split", label: "Reparto de la barra (opcional)", kind: "blocks", prop: "lift.split", min: 0, max: 3, blank: () => ({ label: "parte", pct: 50 }), name: (r) => r.label || "Parte",
      fields: () => [{ key: "label", label: "Nombre", kind: "text" }, { key: "pct", label: "Porcentaje", kind: "number", step: 1, min: 0, max: 100 }] }
  ],
  screen: UI_SCREEN(false),
  source: UI_SOURCE,
  pin: null,
  timeline: docTimeline,
  size: (el) => ({ w: CARD_W, h: docSheetHeight(el) + (hasLift(el) ? DOC.lift + DOC.gap : 0) }),
  showsNumbers: (el) => (el.rows ?? []).some((r) => r.value !== undefined && r.value !== "") || !!el.lift,
  validate(el, tag) {
    const errors = [], warnings = [];
    const n = (el.rows ?? []).length;
    if (n < 1 || n > 8) errors.push(`${tag}: necesita de 1 a 8 filas (tiene ${n})`);
    if ((el.rows ?? []).some((r) => !r || r.label === undefined || r.value === undefined || r.value === "")) errors.push(`${tag}: cada fila necesita concepto y monto`);
    if (!idx(el, "highlight", n)) errors.push(`${tag}: la fila resaltada no existe`);
    return { errors, warnings };
  },
  texts(el, add) {
    add(el.brand); add(el.title); add(el.lift?.label); add(el.lift?.sub);
    for (const r of el.rows ?? []) { add(r.label); add(r.detail); }
  },
  events(el, rect, { beats: B, cursor, add }) {
    add(B.rise[0], "whoosh");
    if (B.lift) add(B.lift[0], "pop");
  },
  draw: (ctx, el, t, env) => drawDoc(ctx, el, env.ts, env.tl, env.rect, env),
};
