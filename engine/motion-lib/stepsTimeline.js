// Element "stepsTimeline": 3 to 5 numbered steps on a solid paper plate. A connecting line runs down between the circles; each circle fills
// with the brand primary as its step activates (the number turns to the readable ink on it), the connector to the next step draws while
// the next step is coming in, and each title (<= 4 words) slides in with its optional subtitle. Sparse SFX: a whoosh at the plate, a pop on the last step.
import { seg, expoOut, inOut } from "../ui-motion.js";
import { rr, shadow, noShadow } from "./_kit.js";
import { ZONES, fitText, boxRect, slotOf, candidatesOf, readable, blend, fitScale, timelineTexto, words } from "./_texto.js";

const PLATE_W = 900, PAD = 52, DIA = 84, GAP_X = 32, ROW_GAP = 30, TITLE_LH = 1.08;
const S0 = 0.35, STEP = 0.5; // design seconds: first activation, time between activations (the step beats, not a sibling stagger)

/** Rows of the timeline. el.size = title px (explicit); otherwise 54 px, shrunk (min 44) until every title fits 2 lines. */
export function layout(el, env, zones = ZONES) {
  const kit = env.kit;
  const steps = (el.steps ?? []).slice(0, 5);
  const textX = PAD + DIA + GAP_X, maxW = PLATE_W - textX - PAD;
  let px = el.size ?? 54;
  const titles = steps.map((s) => fitText(env, kit, "display", 800, s.title ?? "", { maxW, maxLines: 2, pxMax: px, pxMin: px, lh: TITLE_LH }));
  while (px > 44 && titles.some((t) => t.lines.length > 2)) { px -= 2; titles.forEach((_, i) => { titles[i] = fitText(env, kit, "display", 800, steps[i].title ?? "", { maxW, maxLines: 2, pxMax: px, pxMin: px, lh: TITLE_LH }); }); }
  let y = PAD;
  const rows = steps.map((s, i) => {
    const t = titles[i];
    const sub = s.subtitle ? fitText(env, kit, "body", 500, s.subtitle, { maxW, maxLines: 2, pxMax: 34, pxMin: 28, lh: 1.25 }) : null;
    const h = Math.max(DIA, t.lines.length * t.lh + (sub ? 8 + sub.lines.length * sub.lh : 0));
    const row = { title: t, sub, y, h };
    y += h + ROW_GAP;
    return row;
  });
  const h = rows.length ? y - ROW_GAP + PAD : 0;
  return { rect: boxRect(slotOf(el), PLATE_W, h, zones), rows, px, h };
}

export default {
  type: "stepsTimeline",
  category: "Texto",
  usesSkin: false, // brand typography element: reads the brand kit, not the ui skin
  panel: "text",
  captions: "option",
  label: "Pasos numerados",
  description: "De 3 a 5 pasos: los círculos se llenan uno a uno y se conectan con una línea",
  brief: [
    "Qué: de 3 a 5 pasos numerados que se activan uno tras otro, unidos por una línea.",
    "Cuándo: para explicar un proceso corto en orden. No usar: para una sola idea (usa quoteCard) ni para más de 5 pasos.",
    "Coreografía: la placa baja, el paso 1 se activa (círculo primario y su título entra), la línea se dibuja hacia el siguiente y así en cadena hasta el último.",
    "Gusto: jerarquía clara: título grande y negro, subtítulo gris; el círculo activo es el único acento; el número del círculo tiene contraste suficiente.",
    "Datos: pasos del usuario; sin cifras inventadas."
  ].join("\n"),
  icon: "M6 5v3M6 16v3M6 10.5v1M4 5h4M4 19h4M12 7h8M12 17h8",
  thumbAt: 0.8,
  sampleDur: 4.5,
  defaults: (t, end) => ({ type: "stepsTimeline", in: t, out: Math.min(t + 4.5, end), steps: [
    { title: "Llega el prospecto", subtitle: "Desde WhatsApp o tu web" },
    { title: "Rex lo califica", subtitle: "Pregunta lo que importa" },
    { title: "Agenda la cita", subtitle: "Sin llamadas de ida y vuelta" }
  ] }),
  fields: [
    { key: "steps", label: "Pasos (3 a 5)", kind: "blocks", prop: "steps", min: 3, max: 5, blank: () => ({ title: "Nuevo paso", subtitle: "" }), name: (r) => r.title || "Paso",
      fields: () => [
        { key: "title", label: "Título (máximo 4 palabras)", kind: "text" },
        { key: "subtitle", label: "Subtítulo (opcional)", kind: "text", opt: true }
      ] },
    { key: "size", label: "Tamaño de los títulos (se ajusta solo)", kind: "number", step: 2, min: 44, max: 80, opt: true, ph: "automático" },
    { key: "slot", label: "Dónde se ve", kind: "select", options: [["band", "Abajo, entre la barbilla y los botones"], ["center", "Al centro"], ["top", "Arriba"]], opt: true, ph: "abajo" }
  ],
  screen: [{ key: "captions", label: "Subtítulos mientras se ve", kind: "select", options: [["hide", "Ocultarlos"], ["keep", "Dejarlos"]], opt: true, ph: "ocultarlos" }],
  pin: null,

  validate(el, tag) {
    const errors = [], warnings = [];
    const steps = el.steps ?? [];
    if (steps.length < 3 || steps.length > 5) errors.push(`${tag}: necesita de 3 a 5 pasos`);
    steps.forEach((s, i) => {
      if (!words(s.title).length) errors.push(`${tag}: el paso ${i + 1} necesita título`);
      if (words(s.title).length > 4) warnings.push(`${tag}: el paso ${i + 1} tiene más de 4 palabras en el título`);
    });
    if (el.slot !== undefined && !["band", "center", "top"].includes(el.slot)) errors.push(`${tag}: "slot" debe ser band, center o top`);
    if (el.size !== undefined && !(Number(el.size) >= 44 && Number(el.size) <= 80)) errors.push(`${tag}: el tamaño va de 44 a 80`);
    const D = Number(el.out) - Number(el.in);
    const n = steps.reduce((a, s) => a + words(s.title).length + words(s.subtitle).length, 0);
    if (D > 0 && D < S0 + STEP * (steps.length - 1) + 0.8) warnings.push(`${tag}: dura muy poco para mostrar todos los pasos`);
    if (n > 40) warnings.push(`${tag}: hay ${n} palabras en total; con menos pasos o subtítulos más cortos se lee mejor`);
    return { errors, warnings };
  },

  timeline: timelineTexto,

  rect: (el, zones, env) => layout(el, env, zones).rect,
  candidates: (el, zones, env) => candidatesOf("steps", el, zones, env, layout),

  texts: (el, add) => (el.steps ?? []).forEach((s) => { add(s.title); if (s.subtitle) add(s.subtitle); }),
  events(el, rect, { add }) {
    add(el.in, "whoosh");
    const n = Math.min(5, (el.steps ?? []).length);
    const D = Math.max(0.05, el.out - el.in);
    if (n) add(el.in + (S0 + STEP * (n - 1)) * fitScale(D, S0 + STEP * (n - 1) + 0.4), "pop");
  },

  draw(ctx, el, t, env) {
    const { kit, tl, ts } = env;
    const L = layout(el, env, env.zones ?? ZONES);
    const n = L.rows.length;
    if (!n) return;
    const D = tl.Ld, r = L.rect;
    const paper = kit.colors.paper, ink = kit.colors.ink, prim = kit.colors.primary;
    const onPrim = readable(prim, [kit.colors.on_primary, paper, ink]);
    const faint = blend(ink, paper, 0.8), subC = blend(ink, paper, 0.25);
    const k = fitScale(D, S0 + STEP * (n - 1) + 0.4);
    const act = (i) => (S0 + STEP * i) * k;
    const cxs = r.x + PAD + DIA / 2;
    const out = 1 - inOut(seg(ts, tl.b.exit[0], tl.b.exit[1]));
    const pin = expoOut(seg(ts, 0, 0.4 * k));

    ctx.save();
    ctx.globalAlpha = out * pin;
    ctx.translate(0, (1 - pin) * 36);
    shadow(ctx, "rgba(16,24,40,0.28)", 40, 14);
    ctx.fillStyle = paper;
    rr(ctx, r.x, r.y, r.w, r.h, 28);
    ctx.fill();
    noShadow(ctx);

    // connectors: faint track, then the primary fills it while the next step comes in
    for (let i = 0; i < n - 1; i += 1) {
      const y0 = r.y + L.rows[i].y + DIA / 2, y1 = r.y + L.rows[i + 1].y + DIA / 2;
      ctx.fillStyle = faint;
      ctx.fillRect(cxs - 3, y0, 6, y1 - y0);
      const p = seg(ts, act(i), act(i + 1));
      if (p > 0) { ctx.fillStyle = prim; ctx.fillRect(cxs - 3, y0, 6, (y1 - y0) * p); }
    }

    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    L.rows.forEach((row, i) => {
      const a = expoOut(seg(ts, act(i), act(i) + 0.3 * k));
      const cy = r.y + row.y + DIA / 2;
      // circle: paper -> primary fill, ring in the primary
      // circle: inactive steps are a faint outline (no skeleton of full circles on a blank plate); active ones fill with the primary
      ctx.beginPath();
      ctx.arc(cxs, cy, DIA / 2 - 3, 0, Math.PI * 2);
      ctx.fillStyle = blend(paper, prim, a);
      ctx.fill();
      ctx.lineWidth = 6;
      ctx.strokeStyle = blend(faint, prim, a);
      ctx.stroke();
      ctx.font = kit.font("display", 40, 800);
      ctx.textAlign = "center";
      ctx.fillStyle = a > 0.5 ? onPrim : blend(faint, ink, a);
      ctx.fillText(String(i + 1), cxs, cy + 1);
      ctx.textAlign = "left";
      // title slides in from the right of the circle; the subtitle follows 4 frames later
      const tx = r.x + PAD + DIA + 32 - (1 - a) * 24;
      if (a <= 0) return;
      ctx.globalAlpha = out * a;
      ctx.font = row.title.font;
      ctx.fillStyle = ink;
      row.title.lines.forEach((ln, j) => ctx.fillText(ln, tx, r.y + row.y + row.title.lh * (j + 0.5)));
      if (row.sub) {
        const sa = expoOut(seg(ts, act(i) + 0.13 * k, act(i) + 0.13 * k + 0.3 * k));
        ctx.globalAlpha = out * sa;
        ctx.font = row.sub.font;
        ctx.fillStyle = subC;
        const sy = r.y + row.y + row.title.lines.length * row.title.lh + 8;
        row.sub.lines.forEach((ln, j) => ctx.fillText(ln, tx, sy + row.sub.lh * (j + 0.5)));
      }
      ctx.globalAlpha = out;
    });
    ctx.restore();
  }
};
