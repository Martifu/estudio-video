// Estudio: the one place that describes motion element types.
// Shared by the browser (inspector, add menu, timeline, canvas manipulation) and by server.mjs (validation).
// No DOM access here. To support a new motion type (or, in phase 3, a type-1 params.json), add an entry to TYPES / `fields`.
//
// Field kinds (rendered by inspector.js): text, textarea, number, select, checkbox, point ({x,y}), list (array of strings, one per line),
// rows (specCard rows), chatItems, stackItems.
// `opt: true` fields are optional: an empty input deletes the key so the engine default applies (`ph` = default shown as placeholder).

export const SAFE = {
  top: 220, // nothing above
  bottom: 380, // nothing in the last 380 px (canvas 1920)
  freeY: [350, 1540],
  freeX: [60, 1020],
  side: 96,
  W: 1080,
  H: 1920
};

const COMMON_TIME = [
  { key: "in", label: "Entra (s)", kind: "number", step: 0.05, min: 0 },
  { key: "out", label: "Sale (s)", kind: "number", step: 0.05, min: 0 }
];

export const TYPES = {
  keywordPop: {
    label: "Palabra clave",
    timing: "inOut",
    defaults: (t, end) => ({ type: "keywordPop", text: "PALABRA", in: t, out: Math.min(t + 2.4, end), style: "box" }),
    fields: [
      { key: "text", label: "Texto", kind: "text" },
      { key: "style", label: "Estilo", kind: "select", options: [["box", "Caja"], ["stroke", "Contorno"]], opt: true, ph: "box" },
      { key: "rotate", label: "Giro (°)", kind: "number", step: 1, opt: true, ph: "-3" },
      { key: "size", label: "Tamaño", kind: "number", step: 2, min: 30, opt: true, ph: "150" }
    ],
    pin: { center: true, keep: { size: 150, maxW: 880 } }
  },
  onomatopoeia: {
    label: "Onomatopeya",
    timing: "inOut",
    defaults: (t, end) => ({ type: "onomatopoeia", text: "¡WOW!", in: t, out: Math.min(t + 1.2, end) }),
    fields: [
      { key: "text", label: "Texto", kind: "text" },
      { key: "rotate", label: "Giro (°)", kind: "number", step: 1, opt: true, ph: "-6" },
      { key: "size", label: "Tamaño", kind: "number", step: 2, min: 40, opt: true, ph: "170" },
      { key: "points", label: "Puntas", kind: "number", step: 1, min: 6, max: 30, opt: true, ph: "14" }
    ],
    pin: { center: true, keep: { size: 170 } }
  },
  specCard: {
    label: "Ficha",
    timing: "inOut",
    defaults: (t, end) => ({
      type: "specCard", title: "Ficha", in: t, out: Math.min(t + 4, end),
      rows: [{ label: "Material", value: "Madera", icon: "check" }, { label: "Acabado", value: "Natural", icon: "check" }]
    }),
    fields: [
      { key: "title", label: "Título", kind: "text" },
      { key: "rows", label: "Filas (2 a 4)", kind: "rows", min: 2, max: 4 },
      { key: "size", label: "Tamaño", kind: "number", step: 2, min: 30, opt: true, ph: "40" },
      { key: "maxW", label: "Ancho máx.", kind: "number", step: 10, min: 300, opt: true, ph: "820" }
    ],
    pin: { topLeft: [20, 20], keep: { size: 40 } }
  },
  productCard: {
    label: "Tarjeta de producto",
    timing: "inOut",
    defaults: (t, end) => ({ type: "productCard", product: "", in: t, out: Math.min(t + 4, end) }),
    fields: [
      { key: "product", label: "Producto", kind: "product" },
      { key: "image", label: "Foto", kind: "productImage", opt: true },
      { key: "name", label: "Nombre (si quieres cambiarlo)", kind: "text", opt: true },
      { key: "showPrice", label: "Mostrar precio", kind: "bool", ph: "sí" },
      { key: "badge", label: "Etiqueta (NUEVO, -20%…)", kind: "text", opt: true },
      { key: "w", label: "Ancho", kind: "number", step: 10, min: 300, max: 900, opt: true, ph: "540" }
    ],
    pin: { topLeft: [20, 20], keep: { w: 540 } }
  },
  productPop: {
    label: "Producto flotando",
    timing: "inOut",
    defaults: (t, end) => ({ type: "productPop", product: "", in: t, out: Math.min(t + 3, end) }),
    fields: [
      { key: "product", label: "Producto", kind: "product" },
      { key: "image", label: "Foto", kind: "productImage", opt: true },
      { key: "label", label: "Texto debajo (opcional)", kind: "text", opt: true },
      { key: "showPrice", label: "Mostrar precio", kind: "bool", ph: "no" },
      { key: "style", label: "Entrada", kind: "select", options: [["pop", "Aparece"], ["slide", "Desliza desde la izquierda"]], opt: true, ph: "pop" },
      { key: "size", label: "Tamaño", kind: "number", step: 10, min: 200, max: 900, opt: true, ph: "620" }
    ],
    pin: { center: true, keep: { size: 620 } }
  },
  carousel: {
    label: "Carrusel de productos",
    timing: "inOut",
    defaults: (t, end) => ({ type: "carousel", style: "slide", slides: [], in: t, out: Math.min(t + 6, end) }),
    fields: [
      { key: "style", label: "Estilo", kind: "select", options: [["slide", "Desliza de lado"], ["stack", "Tarjetas apiladas"], ["grid-pop", "Cuadrícula que aparece"]] },
      { key: "slides", label: "Productos (2 a 8)", kind: "slides", min: 2, max: 8 },
      { key: "showPrice", label: "Mostrar precios", kind: "bool", ph: "sí" },
      { key: "perItem", label: "Segundos por producto", kind: "number", step: 0.1, min: 0.2, max: 6, opt: true, ph: "1.6" },
      { key: "w", label: "Ancho", kind: "number", step: 10, min: 400, max: 960, opt: true, ph: "720" }
    ],
    pin: { topLeft: [20, 20], keep: { w: 720 } }
  },
  chatBubbles: {
    label: "Chat",
    timing: "items",
    defaults: (t, end) => ({
      type: "chatBubbles", out: Math.min(t + 4, end),
      items: [{ from: "client", text: "Hola", at: t }, { from: "rex", text: "¡Hola!", at: Math.min(t + 0.8, end) }]
    }),
    fields: [
      { key: "items", label: "Mensajes", kind: "chatItems" },
      { key: "variant", label: "Variante", kind: "select", options: [["tint", "Suave"], ["brand", "Marca"]], opt: true, ph: "tint" },
      { key: "maxW", label: "Ancho máx.", kind: "number", step: 10, min: 300, opt: true, ph: "760" }
    ],
    pin: { chat: true, keep: { maxW: 760, size: 52, max: 3 } }
  },
  toast: {
    label: "Notificación",
    timing: "inOut",
    defaults: (t, end) => ({ type: "toast", title: "Título", body: "Mensaje", in: t, out: Math.min(t + 2.5, end) }),
    fields: [
      { key: "title", label: "Título", kind: "text" },
      { key: "body", label: "Cuerpo", kind: "text" },
      { key: "time", label: "Hora", kind: "text", opt: true, ph: "ahora" }
    ],
    pin: { yOnly: true }
  },
  tagPill: {
    label: "Etiqueta",
    timing: "inOut",
    defaults: (t, end) => ({ type: "tagPill", text: "ETIQUETA", variant: "brand", in: t, out: Math.min(t + 3, end) }),
    fields: [
      { key: "text", label: "Texto", kind: "text" },
      { key: "variant", label: "Variante", kind: "select", options: [["ink", "Tinta"], ["brand", "Marca"], ["paper", "Papel"]], opt: true, ph: "ink" }
    ],
    pin: { topLeft: [0, 0], keep: {} }
  },
  counterBadge: {
    label: "Contador",
    timing: "inOut",
    defaults: (t, end) => ({ type: "counterBadge", from: 0, to: 40, dur: 2, label: "chats", in: t, out: Math.min(t + 4, end) }),
    fields: [
      { key: "from", label: "Desde", kind: "number", step: 1 },
      { key: "to", label: "Hasta", kind: "number", step: 1 },
      { key: "dur", label: "Duración (s)", kind: "number", step: 0.1, min: 0.2, opt: true, ph: "2" },
      { key: "label", label: "Etiqueta", kind: "text", opt: true },
      { key: "variant", label: "Variante", kind: "select", options: [["red", "Rojo"], ["brand", "Marca"]], opt: true, ph: "red" }
    ],
    pin: { counter: true, keep: {} }
  },
  dimensionLine: {
    label: "Medida",
    timing: "inOut",
    defaults: (t, end) => ({ type: "dimensionLine", label: "2.40 m", in: t, out: Math.min(t + 3, end), from: { x: 120, y: 1010 }, to: { x: 960, y: 1010 } }),
    fields: [
      { key: "label", label: "Texto", kind: "text" },
      { key: "from", label: "Desde (px)", kind: "point", noTrack: true },
      { key: "to", label: "Hasta (px)", kind: "point", noTrack: true },
      { key: "thickness", label: "Grosor", kind: "number", step: 1, min: 2, opt: true, ph: "7" },
      { key: "size", label: "Tamaño texto", kind: "number", step: 2, min: 30, opt: true, ph: "54" }
    ],
    pin: { dimension: true }
  },
  wordStack: {
    label: "Lista de palabras",
    timing: "items",
    defaults: (t, end) => ({ type: "wordStack", out: Math.min(t + 3.2, end), items: [{ text: "UNO", at: t }, { text: "DOS", at: Math.min(t + 0.6, end) }] }),
    fields: [
      { key: "items", label: "Palabras", kind: "stackItems" },
      { key: "size", label: "Tamaño", kind: "number", step: 2, min: 30, opt: true, ph: "58" }
    ],
    pin: { stack: true, keep: { size: 58, h: 100, gap: 18 } }
  },
  panel: {
    label: "Panel de video",
    timing: "inOut",
    noAdd: true, // needs a clip extracted by overlay.py: created by the AI, only moved/timed here
    defaults: () => null,
    fields: [],
    pin: { panel: true }
  },
  highlightWords: {
    label: "Resaltar palabras",
    timing: "none",
    defaults: () => ({ type: "highlightWords", words: ["palabra"], style: "underline" }),
    fields: [
      { key: "words", label: "Palabras (una por línea)", kind: "list" },
      { key: "style", label: "Estilo", kind: "select", options: [["underline", "Subrayado"], ["box", "Caja"]], opt: true, ph: "underline" }
    ],
    pin: null
  }
};


// ---------- motion library (engine/motion-lib/<type>.js): product screens, kinetic word, brand sting... ----------
// The registry is the single source: every descriptor becomes a TYPES entry here (label, defaults, inspector fields), validation goes
// through LIB.validate. Adding an element type = adding its file in engine/motion-lib; nothing in this file changes.
import * as LIB from "#motion-lib/index.js";

export { LIB };
export const UI_TYPES = LIB.all().filter((d) => d.family === "ui").map((d) => d.type); // the "product screen" family
export const isUiType = (type) => UI_TYPES.includes(type);
export const isLibType = (type) => LIB.has(type);
for (const d of LIB.all()) {
  TYPES[d.type] = {
    label: d.timelineLabel ?? d.label,
    timing: "inOut",
    lib: true, // comes from the registry
    ui: d.family === "ui",
    panel: d.panel ?? "library", // "library" (Pantallas panel) | "text" (Texto panel)
    defaults: d.defaults,
    fields: d.fields,
    ...(d.screen ? { screen: d.screen } : {}),
    ...(d.source ? { source: d.source } : {}),
    pin: d.pin ?? null
  };
}

export const COMMON_FIELDS = {
  time: COMMON_TIME
};

export const typeLabel = (type) => TYPES[type]?.label ?? type;
export const elementLabel = (el) =>
  el.text ?? el.label ?? el.title ?? el.name ?? el.icons?.join(" · ") ?? el.items?.map((i) => i.text).filter(Boolean).join(" / ") ?? el.words?.join(" / ") ?? "";

/** [start, end] of an element on the timeline, or null (highlightWords applies to the whole video). */
export function windowOf(el) {
  if (el.type === "highlightWords") return null;
  if (TYPES[el.type]?.timing === "items") {
    const ats = (el.items ?? []).map((i) => Number(i.at) || 0);
    return [ats.length ? Math.min(...ats) : 0, Number(el.out) || 0];
  }
  return [Number(el.in) || 0, Number(el.out) || 0];
}

/** An element is "fijado" (pinned) when the source config carries explicit x/y: the engine keeps those and skips auto-placement. */
export const isPinned = (el) => el.place !== "auto" && (el.x !== undefined || el.y !== undefined);
export const supportsPin = (el) => !!TYPES[el.type]?.pin && el.type !== "dimensionLine" && el.type !== "panel";

// ---------- validation: same rules as scripts/overlay.py prepare_motion (errors) plus advisory warnings ----------
const isPoint = (p) => p && typeof p === "object" && "x" in p && "y" in p;

/** @returns {{errors: string[], warnings: string[]}} messages in Spanish; `errors` mirror overlay.py exactly. */
export function validateElement(el, i = 0, total = Infinity) {
  const errors = [];
  const warnings = [];
  const tag = `#${i + 1} ${el?.type ?? "?"}`;
  if (!el || typeof el !== "object" || Array.isArray(el)) return { errors: [`${tag}: no es un objeto`], warnings };
  if (!TYPES[el.type]) return { errors: [`${tag}: tipo desconocido`], warnings };
  if (el.type === "highlightWords") {
    if (!Array.isArray(el.words) || !el.words.length || !el.words.every((w) => typeof w === "string")) errors.push(`${tag}: necesita "words" (lista de textos)`);
    return { errors, warnings };
  }
  const items = TYPES[el.type].timing === "items";
  if (!items && (el.in === undefined || el.out === undefined)) errors.push(`${tag}: necesita "in" y "out"`);
  if (items && (el.out === undefined || !el.items?.length)) errors.push(`${tag}: necesita "items" y "out"`);
  if (el.type === "chatBubbles" && (el.items ?? []).some((it) => !["client", "rex"].includes(it.from) || !("text" in it))) {
    errors.push(`${tag}: cada mensaje necesita "from" (client|rex) y texto`);
  }
  if (el.type === "dimensionLine") {
    if (el.track?.length) {
      if (!el.track.every((k) => "t" in k && isPoint(k.from) && isPoint(k.to))) errors.push(`${tag}: cada clave de "track" necesita t, from y to`);
    } else if (!(isPoint(el.from) && isPoint(el.to))) errors.push(`${tag}: necesita "from" y "to" ({x,y}) o un "track"`);
  }
  if (el.type === "specCard" && !(el.rows?.length >= 2 && el.rows.length <= 4)) errors.push(`${tag}: la ficha necesita de 2 a 4 filas`);
  if (el.type === "onomatopoeia" && !el.text) errors.push(`${tag}: necesita texto`);
  if ((el.type === "productCard" || el.type === "productPop") && !el.product) errors.push(`${tag}: elige un producto`);
  if (el.type === "carousel") {
    const n = Array.isArray(el.slides) ? el.slides.length : 0;
    if (n < 2 || n > 8) errors.push(`${tag}: el carrusel necesita de 2 a 8 productos (tiene ${n})`);
    else if (el.slides.some((x) => !x || !x.product)) errors.push(`${tag}: cada producto del carrusel necesita elegir uno`);
  }
  if (el.type === "panel" && !el.clip) errors.push(`${tag}: necesita "clip"`);
  if (LIB.isLib(el)) { const u = LIB.validate(el, tag); errors.push(...u.errors); warnings.push(...u.warnings); }
  // advisory
  const w = errors.length ? null : windowOf(el);
  if (w) {
    if (!(w[1] > w[0])) warnings.push(`${tag}: "sale" debe ser mayor que "entra"`);
    if (w[1] > total + 1e-6) warnings.push(`${tag}: termina después del video (${total.toFixed(2)} s)`);
  }
  if (el.type === "keywordPop" && !el.text) warnings.push(`${tag}: sin texto`);
  return { errors, warnings };
}

export function validateMotion(list, total = Infinity) {
  if (!Array.isArray(list)) return { errors: ["motion.json debe ser una lista"], warnings: [], perElement: [] };
  const perElement = list.map((el, i) => validateElement(el, i, total));
  return {
    errors: perElement.flatMap((r) => r.errors),
    warnings: perElement.flatMap((r) => r.warnings),
    perElement
  };
}

// ---------- geometry <-> explicit x/y (inverse of layout.js rectOf; the engine treats explicit x/y as pinned) ----------
const clone = (o) => JSON.parse(JSON.stringify(o));

/**
 * Pin an element at `rect` (the box the planner reported) and return the keys to merge into the source element.
 * `planEl` is the planner's resolved copy (carries the auto-chosen align/size), `src` the source element.
 * Sizes the planner shrank are frozen too so the pinned element looks exactly like it did.
 */
export function pinPatch(src, planEl, rect) {
  const spec = TYPES[src.type]?.pin;
  if (!spec) return {};
  const patch = {};
  if (spec.center) {
    patch.x = Math.round(rect.x + rect.w / 2);
    patch.y = Math.round(rect.y + rect.h / 2);
  } else if (spec.topLeft) {
    patch.x = Math.round(rect.x + spec.topLeft[0]);
    patch.y = Math.round(rect.y + spec.topLeft[1]);
  } else if (spec.chat) {
    patch.x = Math.round(rect.x + 10);
    patch.y = Math.round(rect.y + rect.h - 10);
  } else if (spec.counter) {
    patch.x = Math.round(rect.x + rect.w - 10);
    patch.y = Math.round(rect.y + 10);
  } else if (spec.stack) {
    const al = planEl.align ?? src.align ?? "left";
    patch.align = al;
    patch.x = Math.round(al === "center" ? rect.x + rect.w / 2 : al === "right" ? rect.x + rect.w : rect.x);
    patch.y = Math.round(rect.y);
  } else if (spec.yOnly) {
    patch.y = Math.round(rect.y);
  } else if (spec.panel) {
    patch.box = { ...(src.box ?? { x: 140, y: 1180, w: 800, h: 340 }), x: Math.round(rect.x), y: Math.round(rect.y) };
  }
  // freeze sizes the planner changed
  for (const [k, dflt] of Object.entries(spec.keep ?? {})) {
    const want = planEl[k] ?? dflt;
    if (want !== (src[k] ?? dflt)) patch[k] = want;
  }
  if (spec.counter && planEl.opts && JSON.stringify(planEl.opts) !== JSON.stringify(src.opts ?? {})) patch.opts = clone(planEl.opts);
  return patch;
}

/** Keys removed by "Soltar posición" (back to auto-placement). */
export const UNPIN_KEYS = ["x", "y", "place", "align"];

/** Resize an element by scale factor `f` (>0) from its source/plan values. Returns the keys to merge. */
export function resizePatch(src, planEl, f, { shift = false } = {}) {
  const spec = TYPES[src.type]?.pin;
  const r = (v) => Math.max(1, Math.round(v));
  switch (src.type) {
    case "keywordPop": return { size: r((planEl.size ?? 150) * f) };
    case "onomatopoeia": return { size: r((planEl.size ?? 170) * f) };
    case "specCard":
      return shift ? { maxW: r((planEl.maxW ?? 820) * f) } : { size: r((planEl.size ?? 40) * f) };
    case "wordStack": return { size: r((planEl.size ?? 58) * f), h: r((planEl.h ?? 100) * f), gap: r((planEl.gap ?? 18) * f) };
    case "chatBubbles": return { maxW: r((planEl.maxW ?? 760) * f) };
    case "productCard": return { w: r((planEl.w ?? 540) * f) };
    case "carousel": return { w: r((planEl.w ?? 720) * f) };
    case "productPop": return { size: r((planEl.size ?? 620) * f) };
    default: return spec ? {} : {};
  }
}
export const canResize = (el) => ["keywordPop", "onomatopoeia", "specCard", "wordStack", "chatBubbles", "productCard", "productPop", "carousel"].includes(el.type);

/** Move a dimensionLine (from/to or every track key) by (dx, dy). Returns the keys to merge. */
export function moveDimension(src, dx, dy) {
  const mv = (p) => ({ x: Math.round(p.x + dx), y: Math.round(p.y + dy) });
  if (src.track?.length) return { track: src.track.map((k) => ({ ...k, from: mv(k.from), to: mv(k.to) })) };
  return { from: mv(src.from), to: mv(src.to) };
}

/** Interpolated from/to of a dimensionLine at time t (same rule as the engine: linear between keys, held outside). */
export function dimensionAt(el, t) {
  const tr = el.track;
  if (!tr?.length) return { from: el.from, to: el.to };
  const ks = [...tr].sort((a, b) => a.t - b.t);
  if (t <= ks[0].t) return ks[0];
  if (t >= ks[ks.length - 1].t) return ks[ks.length - 1];
  let i = 0;
  while (ks[i + 1].t < t) i += 1;
  const k = (t - ks[i].t) / (ks[i + 1].t - ks[i].t);
  const lp = (a, b) => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });
  return { from: lp(ks[i].from, ks[i + 1].from), to: lp(ks[i].to, ks[i + 1].to) };
}

/** Sub-time ticks of an element: [{id, label, t}] with a `set(el, t)` applier (wordStack/chat items `at`, dimensionLine track keys). */
export function ticksOf(el) {
  if (el.type === "wordStack" || el.type === "chatBubbles") return (el.items ?? []).map((it, k) => ({ k, label: it.text ?? "", t: Number(it.at) || 0 }));
  if (el.type === "dimensionLine" && el.track?.length) return el.track.map((key, k) => ({ k, label: `clave ${k + 1}`, t: Number(key.t) || 0 }));
  return [];
}
export function setTick(el, k, t) {
  const c = clone(el);
  if (c.items) c.items[k].at = t;
  else if (c.track) c.track[k].t = t;
  return c;
}

/** Shift the whole element in time by dt (in/out, item `at`, track keys). */
export function shiftTime(el, dt) {
  const c = clone(el);
  const sh = (v) => Math.round((v + dt) * 1000) / 1000;
  if (c.in !== undefined) c.in = sh(c.in);
  if (c.out !== undefined) c.out = sh(c.out);
  c.items?.forEach((it) => { if (it.at !== undefined) it.at = sh(it.at); }); // uiFeed items have no `at`
  c.track?.forEach((k) => { k.t = sh(k.t); });
  return c;
}

/** Set the start edge (in, or the first item's `at`). */
export function setStart(el, t) {
  const c = clone(el);
  if (TYPES[c.type]?.timing === "items") {
    const first = c.items.reduce((m, it, k) => (it.at < c.items[m].at ? k : m), 0);
    c.items[first].at = t;
  } else c.in = t;
  return c;
}

// ---------- speed, text editing key, platform zone presets, caption helpers ----------
/** Key holding the main text of an element (what a double-click edits inline), or null. */
export const textKeyOf = (el) => LIB.get(el.type)?.textKey ?? ({ keywordPop: "text", onomatopoeia: "text", tagPill: "text", specCard: "title", toast: "title", dimensionLine: "label", counterBadge: "label", productPop: "label" })[el.type] ?? null;
export const SPEED_TYPES = ["keywordPop", "wordStack", "counterBadge", "tagPill", "toast", "chatBubbles", "dimensionLine", "specCard", "onomatopoeia", "panel", "productCard", "productPop", "carousel"];

/** Platform zone presets: px reserved by the platform UI at the top/bottom and side margins of the free area. APPROXIMATE values (apps change them). */
export const ZONE_PRESETS = {
  default: { label: "Por defecto (actual)", top: 220, bottom: 380, left: 60, right: 60 },
  reels: { label: "Reels (aprox.)", top: 250, bottom: 420, left: 60, right: 90 },
  tiktok: { label: "TikTok (aprox.)", top: 130, bottom: 480, left: 60, right: 130 },
  shorts: { label: "Shorts (aprox.)", top: 160, bottom: 460, left: 60, right: 120 },
  custom: { label: "Personalizado" }
};
export const DEFAULT_ZONES = { top: 220, bottom: 380, left: 60, right: 60 };
export const zonesOf = (z) => ({ ...DEFAULT_ZONES, ...(z ?? {}) });
export const presetOf = (z) => {
  const e = zonesOf(z);
  const hit = Object.entries(ZONE_PRESETS).find(([k, p]) => k !== "custom" && p.top === e.top && p.bottom === e.bottom && p.left === e.left && p.right === e.right);
  return hit ? hit[0] : "custom";
};

export const CAPTION_DEFAULTS = { y: 1180, size: 78, maxW: 900, cx: 540, upper: true, maxWords: 3 };

const words = (t) => String(t ?? "").split(/\s+/).filter(Boolean);
/** Replace a segment's text keeping the voice timing of its words when the word count is unchanged. */
export function setSegText(seg, text) {
  const toks = words(text);
  const keep = seg.words?.length === toks.length ? seg.words.map((w, i) => ({ ...w, text: toks[i] })) : undefined;
  const out = { ...seg, text: toks.join(" ") };
  if (keep) out.words = keep; else delete out.words;
  return out;
}
/** Clamp the words of a segment into [in, out] after a trim/move. */
export function fitSegWords(seg) {
  if (!seg.words) return seg;
  return { ...seg, words: seg.words.map((w) => ({ ...w, start: Math.min(Math.max(w.start, seg.in), seg.out), end: Math.min(Math.max(w.end, seg.in), seg.out) })) };
}
/** Split a segment at time t (needs at least one word on each side by word timing; falls back to text proportion). */
export function splitSeg(seg, t) {
  const toks = words(seg.text);
  if (toks.length < 2 || !(t > seg.in && t < seg.out)) return null;
  let k;
  if (seg.words?.length === toks.length) {
    k = seg.words.findIndex((w) => w.start >= t - 1e-6);
    if (k <= 0) k = Math.max(1, seg.words.filter((w) => (w.start + w.end) / 2 < t).length);
  } else k = Math.max(1, Math.min(toks.length - 1, Math.round(((t - seg.in) / (seg.out - seg.in)) * toks.length)));
  k = Math.min(Math.max(k, 1), toks.length - 1);
  const w1 = seg.words?.slice(0, k), w2 = seg.words?.slice(k);
  const a = { ...seg, out: t, text: toks.slice(0, k).join(" ") };
  const b = { ...seg, in: t, text: toks.slice(k).join(" ") };
  if (w1?.length === k) { a.words = w1; b.words = w2; } else { delete a.words; delete b.words; }
  return [fitSegWords(a), fitSegWords(b)];
}
export function mergeSegs(a, b) {
  const both = a.words && b.words ? [...a.words, ...b.words] : null;
  const out = { ...a, out: Math.max(a.out, b.out), text: `${a.text} ${b.text}`.trim() };
  if (both) out.words = both; else delete out.words;
  return out;
}
