// Element "paymentPlan" of the motion library (grupo Inmobiliario): línea de tiempo del pago (Apartado, Enganche, Mensualidades, Entrega) con montos que cuentan.
// One file = one element type. Amounts and percentages come from the user's plan (never invented in the element). Timeline beats are in DESIGN seconds.
import { seg, expoOut, outBack, lerp, CARD_W } from "../ui-motion.js";
import { rr, fnt, text, card, radiusAt, envelope, beginCard, disc } from "./_kit.js";
import { FICTIONAL, UI_SOURCE } from "./_fields.js";
import { chip, countMoney, SLOT_FIELD } from "./_inmo.js";

export const PAY = { w: CARD_W, h: 560, pad: 60, nodeY: 270, nodeR: 34, chipY: 180, labelY: 350, amountY: 430, noteY: 486 };
const nodeX = (i, n) => PAY.pad + 50 + i * ((PAY.w - 2 * (PAY.pad + 50)) / Math.max(1, n - 1));
export const payTimeline = (el) => {
  const n = Math.min(5, (el.steps ?? []).length);
  const nodes = Array.from({ length: n }, (_, i) => [0.3 + i * 0.4, 0.3 + i * 0.4 + 0.4]);
  return { Ld: 3.8, b: { blob: [0, 0.5], title: [0.05, 0.4], line: [0.3, 0.3 + Math.max(0, n - 1) * 0.4 + 0.2], nodes, exit: [3.45, 3.8] } };
};

function drawPay(ctx, el, ts, tl, rect, env) {
  const { skin } = env, C = skin.colors, b = tl.b;
  const w = rect.w, h = rect.h;
  const E = envelope(tl, ts);
  beginCard(ctx, el, tl, ts, rect, [w / 2, h / 2], E);
  const R = radiusAt(E, skin, w, h);
  card(ctx, 0, 0, w, h, R, skin);
  ctx.save();
  rr(ctx, 0, 0, w, h, R);
  ctx.clip();
  ctx.globalAlpha = E.alpha;
  if (el.title) text(ctx, el.title, PAY.pad, 62, { font: fnt(skin, 700, 44), color: C.ink, maxW: w - PAY.pad * 2 });
  const steps = (el.steps ?? []).slice(0, 5);
  const n = steps.length;
  if (!n) { ctx.restore(); ctx.restore(); return; }
  // the line draws from the first node to the last one
  const lineP = expoOut(seg(ts, b.line[0], b.line[1]));
  const x0 = nodeX(0, n), x1 = nodeX(n - 1, n);
  ctx.strokeStyle = C.line;
  ctx.lineWidth = 8;
  ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(x0, PAY.nodeY); ctx.lineTo(x1, PAY.nodeY); ctx.stroke();
  ctx.strokeStyle = C.accent;
  ctx.beginPath(); ctx.moveTo(x0, PAY.nodeY); ctx.lineTo(lerp(x0, x1, lineP), PAY.nodeY); ctx.stroke();
  // one column per step: its width is the spacing between nodes, so labels and amounts never touch
  const colW = Math.min(230, (PAY.w - 2 * PAY.pad) / Math.max(1, n - 1));
  steps.forEach((s, i) => {
    const [st, en] = b.nodes[i];
    const k = outBack(seg(ts, st, en), 1.6);
    if (k <= 0) return;
    const x = nodeX(i, n), y = PAY.nodeY;
    // percentage chip above the node (neutral chip, the accent stays on the line and the numbers)
    if (s.percent !== undefined && s.percent !== "") {
      const pk = outBack(seg(ts, st + 0.15, en + 0.1));
      if (pk > 0) {
        ctx.save();
        ctx.globalAlpha = E.alpha * Math.min(1, pk * 2);
        const pw = chip(ctx, env, `${s.percent}%`, 0, 0, { px: 30, h: 56, k: 0 });
        chip(ctx, env, `${s.percent}%`, x - pw / 2, PAY.chipY, { px: 30, h: 56, bg: C.panel, color: C.accent, k: Math.max(0.01, pk) });
        ctx.restore();
      }
    }
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(lerp(0.4, 1, k), lerp(0.4, 1, k));
    ctx.globalAlpha = E.alpha * Math.min(1, k * 2);
    disc(ctx, 0, 0, PAY.nodeR, C.accent);
    text(ctx, String(i + 1), 0, 1, { font: fnt(skin, 700, 32), color: "#FFFFFF", align: "center" });
    ctx.restore();
    // label (wrapped to the column) and the amount that counts up in whole units
    const lk = expoOut(seg(ts, st + 0.1, en + 0.1));
    ctx.save();
    ctx.globalAlpha = E.alpha * lk;
    text(ctx, s.label ?? "", x, PAY.labelY, { font: fnt(skin, 600, 28), color: C.ink, align: "center", maxW: colW });
    ctx.restore();
    const ak = expoOut(seg(ts, st + 0.25, st + 0.95));
    if (s.amount !== undefined && s.amount !== "" && ak > 0) {
      text(ctx, countMoney(s.amount, ak), x, PAY.amountY, { font: fnt(skin, 800, 36), color: C.primary, align: "center", maxW: colW });
    }
    if (s.note) text(ctx, s.note, x, PAY.noteY, { font: fnt(skin, 500, 28), color: C.muted, align: "center", maxW: colW });
  });
  ctx.restore();
  ctx.restore();
}

export default {
  type: "paymentPlan",
  category: "Inmobiliario",
  usesSkin: true, // reads env.skin (ui-skin colours / status table / font): overlay copies ui-skin.json when it is set
  label: "Plan de pagos",
  timelineLabel: "Inmobiliario: plan de pagos",
  description: "Apartado, enganche, mensualidades y entrega con montos y porcentajes",
  brief: [
    "Qué: línea de tiempo del pago (apartado, enganche, mensualidades, entrega) con el monto de cada paso.",
    "Cuándo: la voz explica cómo se paga la unidad. No usar: un solo monto (unitCard) ni una tabla de cifras de ventas (sales).",
    "Coreografía: la línea se traza, cada paso aparece con su número, luego su porcentaje, su monto que cuenta y su nota; todo sale junto en 0.35 s.",
    "Gusto: el monto es lo que se lee (≥ 36 px); etiquetas y montos centrados en su columna sin tocarse; un solo acento (la línea y los números del paso).",
    "Datos: montos y porcentajes del plano de pago del proyecto (MCP de Reda, get_sale_payment_plan) o captura; nunca se inventan; source obligatorio."
  ].join("\n"),
  icon: "M3 12h18M6 12a2 2 0 100-4 2 2 0 000 4zM18 12a2 2 0 100-4 2 2 0 000 4zM12 12a2 2 0 100 4 2 2 0 000-4z",
  textKey: "title",
  captions: "option",
  minScale: 0.88,
  defaults: (t, end) => ({
    type: "paymentPlan", in: t, out: Math.min(t + 4, end), title: "Plan de pago",
    steps: [
      { label: "Apartado", amount: 50000 },
      { label: "Enganche", amount: 230000, percent: 10 },
      { label: "Mensualidades", amount: 35000, note: "cada mes" },
      { label: "Entrega", amount: 1000000, percent: 40 }
    ],
    source: { ...FICTIONAL }
  }),
  fields: [
    { key: "title", label: "Título (opcional)", kind: "text", opt: true },
    {
      key: "steps", label: "Pasos del pago (2 a 5)", kind: "blocks", prop: "steps", min: 2, max: 5,
      blank: () => ({ label: "Enganche", amount: 0 }),
      fields: () => [
        { key: "label", label: "Nombre (ej. Enganche)", kind: "text" },
        { key: "amount", label: "Monto", kind: "number", step: 1, min: 0 },
        { key: "percent", label: "Porcentaje del precio (opcional)", kind: "number", step: 1, min: 0, max: 100, opt: true },
        { key: "note", label: "Nota (opcional, ej. cada mes)", kind: "text", opt: true }
      ],
      name: (r) => r.label || "Paso"
    },
    SLOT_FIELD
  ],
  source: UI_SOURCE,
  timeline: payTimeline,
  size: () => ({ w: PAY.w, h: PAY.h }),
  showsNumbers: () => true,
  validate(el, tag) {
    const errors = [], warnings = [];
    const steps = el.steps ?? [];
    if (steps.length < 2 || steps.length > 5) errors.push(`${tag}: necesita de 2 a 5 pasos (tiene ${steps.length})`);
    if (steps.some((s) => !s.label || !Number.isFinite(Number(s.amount)) || Number(s.amount) < 0)) errors.push(`${tag}: cada paso necesita nombre y un monto positivo`);
    const pct = steps.reduce((n, s) => n + (Number(s.percent) || 0), 0);
    if (pct > 100) warnings.push(`${tag}: los porcentajes suman ${pct}% (más de 100%)`);
    if (!el.source) warnings.push(`${tag}: los montos necesitan de dónde salen (Fuente de los datos)`);
    return { errors, warnings };
  },
  texts(el, add) {
    add(el.title);
    for (const s of el.steps ?? []) { add(s.label); add(s.note); }
  },
  events(el, rect, { beats: B, add }) {
    add(B.line[0], "whoosh");
    (B.nodes ?? []).forEach((span) => add(span[0], "pop"));
  },
  draw: (ctx, el, t, env) => drawPay(ctx, el, env.ts, env.tl, env.rect, env),
};
