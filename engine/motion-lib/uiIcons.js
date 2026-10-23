// Element "uiIcons" of the motion library: iconos de whatsapp, instagram, facebook… que aparecen de golpe. One file = one element type (see engine/README.md "Cómo agregar un elemento").
// Timeline beats are in DESIGN seconds; the registry (index.js) scales them to [in, out]. Drawing is a pure function of the local time.
import { clamp, seg, lerp, inOut, outBack, EXIT, CARD_W } from "../ui-motion.js";
import { shadow, noShadow, pushScale, lum } from "./_kit.js";
import { UI_SCREEN, UI_SOURCE } from "./_fields.js";
/** Names of assets/brand-icons/index.json (the contract with the icon files) with their Spanish labels. */
export const UI_ICON_LABELS = [["whatsapp", "WhatsApp"], ["facebook", "Facebook"], ["instagram", "Instagram"], ["messenger", "Messenger"], ["youtube", "YouTube"], ["x", "X"], ["linkedin", "LinkedIn"], ["telegram", "Telegram"], ["gmail", "Gmail"], ["googlemaps", "Google Maps"], ["google", "Google"]];
/** "tiktok" is accepted but has no official file yet: the loader raises the asset issue (never draws an approximation). */
const KNOWN = new Set([...UI_ICON_LABELS.map(([k]) => k), "tiktok"]);
const GAP_K = 0.3; // clear space between logos >= 1/4 of their width (platform brand rules)
export function iconsSize(el) {
  const n = Math.max(1, (el.icons ?? []).length);
  const d = Math.min(240, Math.floor(CARD_W / (n + GAP_K * (n - 1))));
  const gap = Math.floor(d * GAP_K);
  return { d, gap, w: n * d + (n - 1) * gap };
}

export function iconsTimeline(el) {
  const n = (el.icons ?? []).length;
  const pops = (el.icons ?? []).map((_, i) => [0.1 + i * 0.18, 0.1 + i * 0.18 + 0.45]);
  const last = n ? pops[n - 1][1] : 0.55;
  return { Ld: last + 1.2 + EXIT, b: { pops, push: [0.3, last + 1.1], exit: [last + 1.2, last + 1.2 + EXIT] } };
}

export const PLATES = ["auto", "none", "white"];
const CONTRAST_MIN = 3; // a logo must keep at least 3:1 against what is behind it
const contrastOf = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
/**
 * Which file / plate one logo gets. meta = its assets/brand-icons/index.json entry ({color, plate, alt?:{when}}), back = { lum, min, max } of the
 * footage behind its box over the element's time span (null = plain background: assumed paper), mode = el.plate ("auto" default | "none" | "white").
 * "none": the logo alone. "white": a white rounded card behind it. "auto": no plate; the contrast test only applies to transparent glyph logos
 * (index plate "white": X, Google, Gmail, Maps): when one would not read (contrast < 3:1 against any sampled brightness) it gets first the
 * official alternate variant (X has a white one for dark backgrounds), else the white card (only when that separates better).
 * @returns {{variant: "main"|"alt", plate: boolean, contrast: number}}
 */
export function decideIcon(meta = {}, back = null, mode = "auto") {
  const Lc = lum(/^#[0-9a-f]{6}$/i.test(meta.color ?? "") ? meta.color : "#888888");
  const lbs = back ? [back.min ?? back.lum, back.lum, back.max ?? back.lum] : [1];
  const contrast = Math.min(...lbs.map((Lb) => contrastOf(Lb, Lc)));
  if (mode === "white") return { variant: "main", plate: true, contrast };
  // logos that are their own tile (index plate "none": WhatsApp, Facebook, Instagram...) NEVER get a card in auto mode: their separation is the soft shadow
  if (mode === "none" || meta.plate === "none" || contrast >= CONTRAST_MIN) return { variant: "main", plate: false, contrast };
  const meanBack = back?.lum ?? 1;
  if (meta.alt && (meta.alt.when !== "dark" || meanBack < 0.5)) {
    // would the alternate read? it is the opposite tone: check against its own tone (white for "dark")
    const altL = meta.alt.when === "dark" ? 1 : 0;
    if (Math.min(...lbs.map((Lb) => contrastOf(Lb, altL))) >= CONTRAST_MIN) return { variant: "alt", plate: false, contrast };
  }
  // the white card only when it separates better than the logo itself would (a white card on a white background adds nothing)
  const cardContrast = Math.min(...lbs.map((Lb) => contrastOf(Lb, 1)));
  return { variant: "main", plate: cardContrast > contrast + 0.5, contrast };
}
// The OFFICIAL logo files (assets/brand-icons/<name>.svg|png, index.json {name: {png, label, shape, plate, color, alt?}}) are drawn as they are: no recolor,
// no re-tracing, aspect kept. They are decoded before READY like thumbs ("icon:<name>" refs); a missing one is an asset error, never a fake.
function drawIcons(ctx, el, ts, tl, rect, env) {
  const b = tl.b;
  const { d, gap, w } = iconsSize(el);
  const icons = el.icons ?? [];
  const ex = seg(ts, b.exit[0], b.exit[1]);
  const push = pushScale(el, tl, ts, w);
  ctx.save();
  ctx.translate(rect.x + rect.w / 2, rect.y + rect.h / 2);
  ctx.scale(push * (1 - 0.1 * inOut(ex)), push * (1 - 0.1 * inOut(ex)));
  icons.forEach((name, i) => {
    const k = seg(ts, b.pops[i][0], b.pops[i][1]);
    if (k <= 0) return;
    const cx = -w / 2 + i * (d + gap) + d / 2;
    const bob = Math.sin((ts - b.pops[i][1]) * 2.6 + i) * 5 * seg(ts, b.pops[i][1], b.pops[i][1] + 0.4);
    const s = lerp(0.18, 1, outBack(k, 1.9));
    ctx.save();
    ctx.globalAlpha = clamp(k * 6) * (1 - inOut(ex));
    ctx.translate(cx, bob);
    ctx.scale(s, s);
    // The OFFICIAL logo, as it is (PNG with alpha, aspect kept, no recolor, no effect ON the logo). plate "white" = a white rounded card behind it
    // (transparent glyphs); the soft shadow belongs to the tile / plate only (never a glow). Without the file nothing is drawn: the loader already raised the asset error.
    const meta = env.iconMeta?.(name) ?? {};
    const dec = decideIcon(meta, env.backdrop?.(el, String(i)) ?? null, el.plate ?? "auto");
    const img = (dec.variant === "alt" && env.img(`icon:${name}:alt`)) || env.img(`icon:${name}`);
    if (img) {
      const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
      const box = dec.plate ? d * 0.62 : d;
      const f = Math.min(box / iw, box / ih);
      shadow(ctx, "rgba(16,24,40,0.34)", dec.plate ? 46 : 30, dec.plate ? 22 : 12);
      if (dec.plate) { ctx.fillStyle = "#FFFFFF"; ctx.beginPath(); ctx.roundRect(-d / 2, -d / 2, d, d, d * 0.22); ctx.fill(); noShadow(ctx); ctx.drawImage(img, -(iw * f) / 2, -(ih * f) / 2, iw * f, ih * f); }
      else { ctx.drawImage(img, -(iw * f) / 2, -(ih * f) / 2, iw * f, ih * f); noShadow(ctx); } // no plate: the logo alone, a soft shadow behind it for separation (no glow, no effect on it)
    }
    ctx.restore();
  });
  ctx.restore();
}


export default {
  type: "uiIcons",
  category: "Pantallas",
  family: "ui",
  placement: "pinned", // the original product screens keep their slot (no face-aware default)
  captions: "option",
  label: "Iconos de apps",
  timelineLabel: "Pantalla: iconos",
  description: "Iconos de WhatsApp, Instagram, Facebook… que aparecen de golpe",
  brief: [
    "Qué: los canales donde funciona el producto (WhatsApp, Instagram, Facebook…) con sus logos oficiales.",
    "Cuándo: la voz enumera canales o integraciones. No usar: logos dibujados a mano ni marcas que no estén en assets/brand-icons.",
    "Coreografía: los iconos entran escalonados (3-5 cuadros) con un pop corto, se quedan quietos, salen juntos.",
    "Gusto: sin tarjeta de fondo salvo que no se lean sobre la toma (plate auto); 2-4 iconos; mismo tamaño todos.",
    "Datos: solo los logos oficiales de assets/brand-icons (TikTok aún no tiene archivo oficial)."
  ].join("\n"),
  icon: "M12 3a9 9 0 100 18 9 9 0 000-18zM8 12l3 3 5-6",
  defaults: (t, end) => ({ type: "uiIcons", in: t, out: Math.min(t + 3.2, end), icons: ["whatsapp", "instagram", "facebook"] }),
  fields: [
    { key: "plate", label: "Fondo del logo", kind: "select", options: [["auto", "Automático (solo si no se ve)"], ["none", "Sin fondo"], ["white", "Con tarjeta blanca"]], opt: true, ph: "automático" },
    { key: "icons", label: "Logos (de 1 a 5; salen en el orden en que los marcas)", kind: "multi", options: UI_ICON_LABELS, min: 1, max: 5 }
  ],
  screen: UI_SCREEN(false),
  source: UI_SOURCE,
  pin: null,
  timeline: iconsTimeline,
  size: (el) => ((({ d, w }) => ({ w, h: d }))(iconsSize(el))),
  // footage regions under each logo (only when the plate is automatic): the comp measures their brightness before READY (brand-layer loadUiAssets)
  backdrops(el, rect) {
    if ((el.plate ?? "auto") !== "auto") return [];
    const { d, gap, w } = iconsSize(el);
    return (el.icons ?? []).map((_, i) => ({ key: String(i), x: rect.x + (rect.w - w) / 2 + i * (d + gap), y: rect.y, w: d, h: d }));
  },
  imageRefs(el, add) {
    for (const name of el.icons ?? []) add(`icon:${name}`, "icono");
  },
  validate(el, tag) {
    const errors = [], warnings = [];
    if (el.plate !== undefined && !PLATES.includes(el.plate)) errors.push(`${tag}: "plate" debe ser auto, none o white`);
    const n = (el.icons ?? []).length;
    if (n < 1 || n > 5) errors.push(`${tag}: necesita de 1 a 5 iconos (tiene ${n})`);
    if ((el.icons ?? []).some((x) => !KNOWN.has(x))) errors.push(`${tag}: hay un icono desconocido`);
    return { errors, warnings };
  },
  events(el, rect, { beats: B, cursor, add }) {
    const { d, gap, w } = iconsSize(el);
    B.pops.forEach((p, i) => add(p[0], "pop", rect.x + (rect.w - w) / 2 + i * (d + gap) + d / 2));
  },
  draw: (ctx, el, t, env) => drawIcons(ctx, el, env.ts, env.tl, env.rect, env),
};
