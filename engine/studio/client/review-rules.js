// Estudio "Revisión" (traffic light): pure checks over the data the editor already has. No DOM, no network: usable from the browser and from node
// (see engine/studio/test/review-rules.test.mjs). Thresholds come from references/motion-reglas.md and references/calidad.md; each item carries
// the rule it applies in `rule` (shown as a tooltip). Everything is optional: a missing input skips its check, it never throws.
//
// runReview(input) -> { items, counts: {red, yellow, green} }
//   input: {
//     duration, motion[] (source elements, with `id`), plan ({rects[], report:{elements[]}, logo:{hide}, capRect} from window.getPlan()),
//     zones {top,bottom,left,right}, words [{word,start,end}], captionSegs [{id,in,out,text,hidden?}] (the effective captions),
//     captionSize, hook {text,inAt,outAt}, cta {at,dur,title,subtitle,contact}, clips [{start}],
//     logoCfg (logo.json), edl (edl.json), loudness {integrated, truePeak} }
//   item: { id, check, severity: "red"|"yellow"|"green", title, detail, t, elementId, segId, rule }
import * as LIB from "#motion-lib/index.js";

const FPS = 30;
const FRAME = 1 / FPS;
const W = 1080;
const H = 1920;

export const LIMITS = {
  maxOvershoots: 2, // motion-reglas.md > Rebote
  maxFragmentWords: 4, // > Texto en pantalla
  maxVisibleWords: 8,
  minTextBase: 0.6, minTextPerWord: 0.1, // 0.6 s + 0.1 s por palabra (punchy)
  minTextPx: 32,
  hookChangeBy: 0.1, hookWordBy: 0.4, // > Hook
  deadAfter: 2.4, // > Sonido y sincronía
  ctaMin: 1.5, ctaMax: 2.5, ctaTail: 1, // > Cierre y marca
  ctaEnterS: 1.11, // brand-layer.js ctaCard: last staggered line (0.25 + 3 * 0.12 + 0.5 s) is fully in
  minShot: 0.45, // > Ritmo de cortes
  captionCps: 20, // Estudio threshold for caption reading speed
  faceRed: 0.15, faceYellow: 0.02,
  lufs: -14, lufsTol: 1, truePeak: -1 // calidad.md > Técnico
};

const RULE = {
  overshoot: "motion-reglas.md · Rebote: 1–7 % y máximo 2 por video; keywordPop y onomatopoeia cuentan dentro de esos 2",
  fragment: "motion-reglas.md · Texto en pantalla: fragmentos de 1–4 palabras",
  words8: "motion-reglas.md · Texto en pantalla: máximo 8 palabras visibles a la vez (subtítulos aparte)",
  minTime: "motion-reglas.md · Tiempo mínimo en pantalla: 0.6 s + 0.1 s por palabra",
  size: "motion-reglas.md · Texto en pantalla: tamaño mínimo 32 px",
  zones: "calidad.md · Imagen: nada importante en las zonas de la plataforma (220 px arriba, 380 px abajo, 60 px a los lados por defecto)",
  faces: "calidad.md · QA de layout: nada sobre la cara (los cortes ≥ 15 % rojo y ≥ 2 % amarillo son del Estudio; la fracción es la del área del elemento dentro de la caja de la cara, layout-report.json faceOverlap)",
  collide: "calidad.md · QA de layout: sin solapes entre elementos (collidesWith vacío salvo decisión consciente)",
  logo: "calidad.md · QA de layout: el logo legible (no tapado)",
  textFit: "calidad.md · QA de layout: el texto cabe en su caja y dentro del área segura (60 px a los lados por defecto) y no pisa el logo",
  hookChange: "motion-reglas.md · Hook: algo cambia a los ~0.1 s",
  hookWord: "motion-reglas.md · Hook: la primera palabra se lee a los ~0.4 s",
  dead: "motion-reglas.md · Sonido y sincronía: más de ~2.4 s sin ningún evento visible se siente muerto",
  cta: "motion-reglas.md · Cierre y marca: tarjeta CTA de 1.5–2.5 s y deja ≥ 1 s de cola",
  dissolve: "motion-reglas.md · Ritmo de cortes: cortes secos por defecto; nada de disolvencias entre escenas",
  transitionCount: "motion-reglas.md · Ritmo de cortes: máximo 3 transiciones por video; el corte seco es el default",
  fadeColorMid: "motion-reglas.md · Transiciones: fadeColor solo para el cierre del video",
  transitionSpeech: "motion-reglas.md · Voz: una transición no debe caer sobre una palabra",
  shortShot: "motion-reglas.md · Ritmo de cortes: planos de menos de 0.45 s sin texto",
  captionCps: "Umbral del Estudio: más de ~20 caracteres por segundo cuesta leer el subtítulo",
  claims: "legal.md · No inventar resultados ni promesas; sin garantías ni reembolsos salvo que la marca los tenga por escrito",
  productFace: "motion-reglas.md · Producto en pantalla: la foto del producto no tapa la cara de la persona (layout-report.json faceOverlap)",
  productPrice: "legal.md · Precios: un precio que viene de un catálogo (no escrito a mano) se verifica antes de publicar",
  productCutout: "rama-real.md · Productos: un recorte con huecos, halo o casi sin fondo quitado se ve mal; usa la foto original si hace falta",
  productRes: "calidad.md · Imagen: la foto debe tener resolución para su tamaño en pantalla (≤ 1.15× de ampliación)",
  kinetic: "motion-reglas.md · Palabra grande letra por letra (kineticWord): una sola por video; es la palabra héroe, no un recurso para varias",
  uiNumbersSource: "legal.md · Cifras: toda cifra en pantalla (precios, totales, conteos) debe tener fuente; las inventadas se confirman antes de publicar y los datos de Reda se refrescan cada 7 días",
  uiPlacement: "calidad.md · Imagen y QA de layout: la pantalla va dentro de la zona segura y no tapa la cara de la persona",
  loudness: "calidad.md · Técnico: −14 LUFS integrado y ≤ −1 dBTP (ebur128 sobre el mp4 final)"
};

// ---------- small helpers ----------
const num = (v, d = null) => (Number.isFinite(Number(v)) && v !== null && v !== "" ? Number(v) : d);
const round = (v, n = 2) => Math.round(v * 10 ** n) / 10 ** n;
const fmtT = (t) => `${round(t, 1).toFixed(1)} s`;
const words = (s) => String(s ?? "").trim().split(/\s+/).filter(Boolean);
const wc = (s) => words(s).length;
const isHidden = (el) => !!el?.hidden;

/** Lower-case, accents removed, same length as the input (so match indexes map back to the original text). */
export function fold(s) {
  let out = "";
  for (const ch of String(s ?? "")) {
    const n = ch.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
    out += n.length === ch.length ? n : ch.toLowerCase().length === ch.length ? ch.toLowerCase() : ch;
  }
  return out;
}

const TIMED = new Set(["wordStack", "chatBubbles"]);
// Motion-library elements (engine/motion-lib; product screens, kinetic word, brand sting...). The registry is the single source of truth:
// is it a library element, does it show numbers (uiNumbersSource) and which texts it shows (claims scanner).
export const isUiEl = (el) => LIB.isLib(el);
export const uiShowsNumbers = (el) => LIB.showsNumbers(el);
/** Every string a library element shows (for the claims scanner). */
export const uiTexts = (el) => LIB.texts(el);
const windowOf = (el) => {
  if (!el || el.type === "highlightWords") return null;
  if (TIMED.has(el.type)) {
    const ats = (el.items ?? []).map((i) => num(i.at, 0));
    return [ats.length ? Math.min(...ats) : 0, num(el.out, 0)];
  }
  return [num(el.in, 0), num(el.out, 0)];
};

/** Visible text pieces of an element: {text, from, to, kind: "fragment"|"block"}. `fragment` pieces are subject to the 4-word rule. */
const PRODUCT_TYPES = ["productCard", "productPop", "carousel"];
const productOf = (doc, id) => doc?.products?.find((p) => p.id === id) ?? null;
export function textPieces(el, products = null) {
  const w = windowOf(el);
  if (!w) return [];
  const out = [];
  const add = (text, from, to, kind) => { if (String(text ?? "").trim()) out.push({ text: String(text), from, to, kind }); };
  switch (el.type) {
    case "keywordPop": case "onomatopoeia": case "tagPill": case "kineticWord": add(el.text, w[0], w[1], "fragment"); break;
    case "toast": add(el.title, w[0], w[1], "fragment"); add(el.body, w[0], w[1], "block"); break;
    case "counterBadge": add(el.label, w[0], w[1], "fragment"); break;
    case "dimensionLine": add(el.label, w[0], w[1], "fragment"); break;
    case "specCard":
      add(el.title, w[0], w[1], "block");
      for (const r of el.rows ?? []) add(`${r.label ?? ""} ${r.value ?? ""}`, w[0], w[1], "block");
      break;
    case "wordStack": for (const it of el.items ?? []) add(it.text, num(it.at, w[0]), w[1], "fragment"); break;
    case "productCard": add(el.name ?? productOf(products, el.product)?.name ?? (products ? "" : "producto"), w[0], w[1], "block"); break;
    case "productPop": add(el.label, w[0], w[1], "block"); break;
    case "carousel": { // one slide at a time (slide/stack); the grid shows every name
      const names = (el.slides ?? []).map((sl) => sl.caption ?? productOf(products, sl.product)?.name ?? (products ? "" : "producto"));
      for (const n of el.style === "grid-pop" ? names : names.slice(0, 1)) add(n, w[0], w[1], "block");
      break;
    }
    case "chatBubbles": for (const it of el.items ?? []) add(it.text, num(it.at, w[0]), w[1], "block"); break;
    default: break;
  }
  return out;
}

/** Every string a viewer reads or hears, with its time: used by the claims check. */
function claimSources(input) {
  const src = [];
  const hook = input.hook;
  if (hook?.text) src.push({ text: hook.text, t: num(hook.inAt, 0), label: "Título del hook" });
  for (const [i, el] of (input.motion ?? []).entries()) {
    if (isHidden(el) || el.type === "highlightWords") continue;
    for (const p of textPieces(el, input.products)) src.push({ text: p.text, t: p.from, label: `Motion: ${el.type}`, elementId: el.id, index: i });
    for (const text of uiTexts(el)) src.push({ text, t: num(el.in, 0), label: `Motion: ${el.type}`, elementId: el.id, index: i });
  }
  for (const s of input.captionSegs ?? []) if (!s.hidden && s.text) src.push({ text: s.text, t: num(s.in, 0), label: "Subtítulo", segId: s.id });
  const cta = input.cta;
  if (cta) {
    const at = num(cta.at, 0);
    const contact = Array.isArray(cta.contact) ? cta.contact.join(" · ") : cta.contact;
    for (const [k, v] of [["título", cta.title], ["subtítulo", cta.subtitle], ["contacto", contact]]) if (v) src.push({ text: v, t: at, label: `CTA (${k})` });
  }
  // The spoken transcript: groups of words (~8) with the time of the first word.
  const ws = (input.words ?? []).filter((w) => w && typeof w.word === "string");
  if (ws.length) {
    let text = "";
    const offsets = ws.map((w) => { const o = text.length; text += `${w.word} `; return { o, t: num(w.start, 0) }; });
    src.push({ text, t: offsets[0].t, label: "Voz", spoken: true, offsets });
  }
  return src;
}

// Risky ad claims (es/en). Patterns run on fold()ed text (lower-case, no accents). `yellow` = needs conditions, not a promise.
export const CLAIM_PATTERNS = [
  { id: "garantia", re: /\bgarantiz\w*|\bresultados? (?:garantizad\w*|asegurad\w*)|\bguarante\w*/g },
  { id: "reembolso", re: /\bte (?:lo )?devolvemos (?:tu |el )?dinero|\bdevolucion (?:total|del dinero)|\bmoney[- ]back/g },
  { id: "cien", re: /\b100 ?%|\bcien por ciento\b|\b100 percent\b/g },
  { id: "sinriesgo", re: /\bsin riesgos?\b|\brisk[- ]free\b/g },
  { id: "mejor", re: /\b(?:el|la|los|las) mejor(?:es)?\b|\bthe best\b/g },
  { id: "numero1", re: /\bnumero (?:1|uno)\b|(?:^|\s)#1\b|\bnumber (?:1|one)\b/g },
  { id: "cura", re: /\bcura(?:r|n|mos)?\b|\bcures?\b/g },
  { id: "aprobado", re: /\b(?:aprobad[oa]|avalad[oa]|certificad[oa]|recomendad[oa]) por\b|\b(?:approved|endorsed|certified) by\b/g },
  { id: "probado", re: /\b(?:clinica|cientifica)mente (?:probad|comprobad)\w*|\bclinically proven\b/g },
  { id: "milagro", re: /\bmilagr\w+|\bsin efectos secundarios\b/g },
  { id: "gratis", re: /\bgratis\b|\bgratuit[oa]s?\b|\bfree\b/g, yellow: true }
];

/** @returns {{id, text, yellow}[]} claims found in `text`, with their position in it. */
export function findClaims(text) {
  const f = fold(text);
  const hits = [];
  for (const p of CLAIM_PATTERNS) {
    p.re.lastIndex = 0;
    let m;
    while ((m = p.re.exec(f))) {
      hits.push({ id: p.id, index: m.index, match: String(text).slice(m.index, m.index + m[0].length).trim(), yellow: !!p.yellow });
      if (m[0].length === 0) p.re.lastIndex += 1;
    }
  }
  return hits;
}

// ---------- the checks ----------
const itemOf = (check, severity, title, detail, extra = {}) => ({ id: `${check}:${extra.key ?? extra.elementId ?? extra.t ?? title}`, check, severity, title, detail, rule: RULE[check], ...extra });
const green = (check, title, detail) => itemOf(check, "green", title, detail, { key: "ok" });

function checkOvershoot(input, out) {
  const pops = [];
  for (const el of input.motion ?? []) {
    if (isHidden(el)) continue;
    if (el.type === "keywordPop" || el.type === "onomatopoeia") pops.push({ t: windowOf(el)[0], what: `${el.type === "keywordPop" ? "Palabra clave" : "Onomatopeya"} «${el.text ?? ""}»`, elementId: el.id });
  }
  const lg = input.logoCfg;
  const enter = lg?.enter ?? lg?.anim?.enter ?? lg?.animation?.enter ?? lg?.entrance;
  if (lg && !lg.hidden && (enter === "pop" || enter?.type === "pop")) pops.push({ t: num(lg.in, 0.3), what: "Logo (entrada pop)" });
  pops.sort((a, b) => a.t - b.t);
  if (pops.length <= LIMITS.maxOvershoots) return out.push(green("overshoot", "Rebotes", `${pops.length} de ${LIMITS.maxOvershoots} permitidos`));
  const extra = pops.slice(LIMITS.maxOvershoots);
  for (const p of extra) out.push(itemOf("overshoot", "red", `Rebote de más: ${p.what}`, `Hay ${pops.length} rebotes (máximo ${LIMITS.maxOvershoots}). Quita el golpe a uno o usa una entrada sin rebote.`, { t: p.t, elementId: p.elementId, key: `${p.elementId ?? "logo"}` }));
}

function checkText(input, out) {
  const els = (input.motion ?? []).filter((e) => !isHidden(e));
  const pieces = [];
  for (const el of els) for (const p of textPieces(el, input.products)) pieces.push({ ...p, el });
  if (input.hook?.text) pieces.push({ text: input.hook.text, from: num(input.hook.inAt, 0), to: num(input.hook.outAt, 0), kind: "fragment", el: { id: null, type: "hook" } });
  if (!pieces.length) return;

  // fragments of 1-4 words
  const long = pieces.filter((p) => p.kind === "fragment" && wc(p.text) > LIMITS.maxFragmentWords);
  if (!long.length) out.push(green("fragment", "Fragmentos de texto", `Todos de ${LIMITS.maxFragmentWords} palabras o menos`));
  for (const p of long) out.push(itemOf("fragment", "yellow", `Texto largo: ${wc(p.text)} palabras`, `«${p.text}» (ideal 2–3, máximo ${LIMITS.maxFragmentWords}). Divídelo o acórtalo.`, { t: p.from, elementId: p.el.id ?? undefined, key: `${p.el.id}:${p.from}:${p.text}` }));

  // at most 8 visible words at once (captions excluded). Sweep the start times of every piece.
  let worst = null;
  const starts = [...new Set(pieces.map((p) => round(p.from + 0.001, 3)))].sort((a, b) => a - b);
  const over = [];
  for (const t of starts) {
    const vis = pieces.filter((p) => t >= p.from && t < p.to);
    const n = vis.reduce((a, p) => a + wc(p.text), 0);
    if (!worst || n > worst.n) worst = { n, t, vis };
    if (n > LIMITS.maxVisibleWords) over.push({ n, t, vis });
  }
  if (!over.length) out.push(green("words8", "Palabras visibles a la vez", `Máximo ${worst?.n ?? 0} (límite ${LIMITS.maxVisibleWords})`));
  else {
    // collapse consecutive sweep points that show the same set of elements into one item
    let lastKey = "";
    for (const o of over) {
      const key = o.vis.map((p) => p.el.id ?? p.el.type).sort().join("|");
      if (key === lastKey) continue;
      lastKey = key;
      const ids = [...new Set(o.vis.map((p) => p.el.id).filter(Boolean))];
      out.push(itemOf("words8", "yellow", `${o.n} palabras a la vez`, `Hay ${o.n} palabras de motion visibles en ${fmtT(o.t)} (máximo ${LIMITS.maxVisibleWords}, sin contar subtítulos). Las fichas y chats cuentan completos.`, { t: round(o.t, 2), elementId: ids[0], key: `${key}` }));
    }
  }

  // minimum on-screen time
  const short = [];
  for (const p of pieces) {
    const need = LIMITS.minTextBase + LIMITS.minTextPerWord * wc(p.text);
    const have = p.to - p.from;
    if (have + 1e-6 < need) short.push({ p, need, have });
  }
  if (!short.length) out.push(green("minTime", "Tiempo de lectura del texto", "Todo el texto dura lo mínimo"));
  for (const s of short) out.push(itemOf("minTime", "yellow", `Texto muy breve (${round(s.have)} s)`, `«${s.p.text}» necesita al menos ${round(s.need)} s (0.6 s + 0.1 s por palabra) y está ${round(s.have)} s.`, { t: s.p.from, elementId: s.p.el.id ?? undefined, key: `${s.p.el.id}:${s.p.from}` }));
}

const DEFAULT_SIZES = { keywordPop: 150, onomatopoeia: 170, specCard: 40, wordStack: 58, chatBubbles: 52, dimensionLine: 54 };
function checkSize(input, out) {
  const known = [];
  const rep = input.plan?.report?.elements ?? [];
  for (const [i, el] of (input.motion ?? []).entries()) {
    if (isHidden(el) || el.type === "highlightWords" || !textPieces(el, input.products).length) continue;
    const planned = num(input.plan?.elements?.[i]?.size) ?? num(rep[i]?.variant?.size);
    const size = planned ?? num(el.size) ?? DEFAULT_SIZES[el.type] ?? null;
    if (size !== null) known.push({ el, size, explicit: planned !== null || num(el.size) !== null });
  }
  const cap = num(input.captionSize);
  const bad = known.filter((k) => k.size < LIMITS.minTextPx);
  if (!bad.length && !(cap !== null && cap < LIMITS.minTextPx)) {
    if (known.length || cap !== null) out.push(green("size", "Tamaño del texto", `Todo ≥ ${LIMITS.minTextPx} px donde se conoce el tamaño`));
    return;
  }
  for (const b of bad) out.push(itemOf("size", "red", `Texto de ${b.size} px`, `${b.el.type} «${String(b.el.text ?? b.el.title ?? "").slice(0, 40)}» mide ${b.size} px (mínimo ${LIMITS.minTextPx} px).`, { t: windowOf(b.el)?.[0], elementId: b.el.id, key: b.el.id }));
  if (cap !== null && cap < LIMITS.minTextPx) out.push(itemOf("size", "red", `Subtítulos de ${cap} px`, `El tamaño de los subtítulos (${cap} px) está bajo el mínimo de ${LIMITS.minTextPx} px.`, { t: 0, key: "captions" }));
}

const inter = (a, b) => {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
};
function checkZones(input, out) {
  const plan = input.plan;
  if (!plan?.rects) return;
  const z = { top: 220, bottom: 380, left: 60, right: 60, ...(input.zones ?? {}) };
  const bands = { arriba: { x: 0, y: 0, w: W, h: z.top }, abajo: { x: 0, y: H - z.bottom, w: W, h: z.bottom }, izquierda: { x: 0, y: 0, w: z.left, h: H }, derecha: { x: W - z.right, y: 0, w: z.right, h: H } };
  const rows = [];
  (input.motion ?? []).forEach((el, i) => {
    const r = plan.rects[i];
    if (!r || isHidden(el) || el.type === "panel" || el.type === "highlightWords" || isUiEl(el)) return; // ui*: own placement rule (checkUiPlacement)
    const area = r.w * r.h;
    if (!(area > 0)) return;
    const hit = Object.entries(bands).map(([name, b]) => ({ name, frac: inter(r, b) / area, px: inter(r, b) })).filter((x) => x.frac > 0.02);
    if (hit.length) rows.push({ el, i, hit });
  });
  if (plan.capRect && (input.captionSegs ?? []).some((s) => !s.hidden)) {
    const r = plan.capRect;
    const hit = Object.entries(bands).map(([name, b]) => ({ name, frac: inter(r, b) / (r.w * r.h) })).filter((x) => x.frac > 0.02);
    if (hit.length) rows.push({ el: { type: "captions", id: undefined }, i: -1, hit });
  }
  if (!rows.length) return out.push(green("zones", "Zonas de la plataforma", "Nada invade las zonas reservadas"));
  for (const r of rows) {
    const worst = r.hit.reduce((a, b) => (b.frac > a.frac ? b : a));
    const w = windowOf(r.el);
    const name = r.el.type === "captions" ? "Subtítulos" : `${r.el.type} «${String(r.el.text ?? r.el.title ?? r.el.label ?? "").slice(0, 28)}»`;
    out.push(itemOf("zones", worst.frac > 0.5 ? "red" : "yellow", `${name} en la zona de la plataforma`, `${Math.round(worst.frac * 100)} % de la caja cae en la zona ${worst.name} (${r.hit.map((h) => h.name).join(", ")}); la app tapa esa franja.`, { t: w?.[0] ?? 0, elementId: r.el.id, key: `${r.el.id ?? "captions"}` }));
  }
}

function checkFaces(input, out) {
  const rep = input.plan?.report?.elements;
  if (!rep) return;
  const faceSrc = input.plan?.report?.faces ?? [];
  if (!Array.isArray(faceSrc) || !faceSrc.length) return; // no face data in this comp: do not claim "nobody covers the face"
  const bad = [];
  const coll = [];
  (input.motion ?? []).forEach((el, i) => {
    const r = rep[i];
    if (!r || isHidden(el) || r.mode === "caption-option") return;
    const f = PRODUCT_TYPES.includes(el.type) ? 0 : num(r.faceOverlap, 0); // product images get their own (yellow) face rule in checkProducts
    if (PRODUCT_TYPES.includes(el.type) || isUiEl(el)) { if (r.collidesWith?.length) coll.push({ el, r }); return; } // ui*: face rule in checkUiPlacement
    if (f >= LIMITS.faceYellow) bad.push({ el, r, f });
    if (r.collidesWith?.length) coll.push({ el, r });
  });
  if (!bad.length) out.push(green("faces", "Elementos sobre caras", "Ninguno tapa la cara"));
  for (const b of bad) out.push(itemOf("faces", b.f >= LIMITS.faceRed ? "red" : "yellow", `Tapa la cara (${Math.round(b.f * 100)} %)`, `${b.el.type} «${String(b.el.text ?? b.el.title ?? b.r.label ?? "").slice(0, 30)}» tiene el ${Math.round(b.f * 100)} % de su área sobre la caja de la cara en ${fmtT(b.r.window?.[0] ?? 0)}. Muévelo o recórtalo.`, { t: b.r.window?.[0] ?? windowOf(b.el)?.[0] ?? 0, elementId: b.el.id, key: b.el.id }));
  if (!coll.length) out.push(green("collide", "Solapes entre elementos", "Sin solapes"));
  for (const c of coll) out.push(itemOf("collide", "yellow", "Se solapa con otro elemento", `${c.el.type} choca con ${c.r.collidesWith.join(", ")}. Separa los tiempos o muévelo.`, { t: c.r.window?.[0] ?? 0, elementId: c.el.id, key: c.el.id }));
}

function checkLogo(input, out) {
  const hide = input.plan?.logo?.hide;
  if (!Array.isArray(hide) || input.logoCfg?.hidden) return; // logo.json "hidden": there is no logo to hide
  if (!hide.length) return out.push(green("logo", "Logo visible", "Nada lo tapa"));
  // elements that take the logo away on purpose (logoSting: its own brand moment) are not a problem
  const design = LIB.logoHideWindows(input.motion);
  const rest = hide.filter(([a, b]) => !design.some(([x, y]) => Math.abs(a - x) < 0.02 && Math.abs(b - y) < 0.02));
  if (!rest.length) return out.push(green("logo", "Logo visible", "Solo se oculta a propósito (cierre con logo)"));
  for (const [a, b] of rest) out.push(itemOf("logo", "yellow", `Logo oculto ${fmtT(a)} – ${fmtT(b)}`, `El logo se atenúa porque un elemento lo cubre entre ${fmtT(a)} y ${fmtT(b)} (${round(b - a, 1)} s sin marca).`, { t: a, key: `${a}` }));
}

// Text whose measured box (plan.rects, from the layout planner's measure*() calls) leaves the side safe area or lands on the logo.
// Known engine behaviour this guards: a tagPill never wraps or shrinks, so a long text runs under the logo or off the frame.
function checkTextFit(input, out) {
  const plan = input.plan;
  if (!plan?.rects) return;
  const z = { left: 60, right: 60, ...(input.zones ?? {}) };
  const logoRect = input.logoCfg?.hidden ? null : plan.logo?.rect;
  const hide = Array.isArray(plan.logo?.hide) ? plan.logo.hide : [];
  const TOL = 2;
  const bad = [];
  let checked = 0;
  (input.motion ?? []).forEach((el, i) => {
    const r = plan.rects[i];
    if (!r || isHidden(el) || el.type === "panel" || el.type === "highlightWords" || !textPieces(el, input.products).length) return;
    if (!(r.w > 0 && r.h > 0)) return;
    checked += 1;
    const w = windowOf(el);
    const left = Math.max(0, z.left - r.x), right = Math.max(0, r.x + r.w - (W - z.right));
    if (left > TOL || right > TOL) bad.push({ el, w, why: `se sale ${Math.round(Math.max(left, right))} px del área segura (${right > left ? "derecha" : "izquierda"})` });
    else if (logoRect && inter(r, logoRect) > 0 && !hide.some(([a, b]) => w && a < w[1] && b > w[0])) bad.push({ el, w, why: "invade el logo" });
  });
  if (!checked) return;
  if (!bad.length) return out.push(green("textFit", "Texto dentro de su caja", "Ningún texto se sale del área segura ni pisa el logo"));
  for (const b of bad) out.push(itemOf("textFit", "yellow", `Texto no cabe: ${b.el.type} «${String(b.el.text ?? b.el.title ?? "").slice(0, 28)}»`, `${b.el.type} «${String(b.el.text ?? b.el.title ?? "").slice(0, 40)}» ${b.why}. Acórtalo, reduce el tamaño o muévelo.`, { t: b.w?.[0] ?? 0, elementId: b.el.id, key: `${b.el.id ?? b.w?.[0]}` }));
}

/** Moments when the motion layer visibly changes (captions and the footage's own movement do not count). */
export function visibleEvents(input) {
  const ev = [];
  if (input.hook?.text) ev.push(num(input.hook.inAt, 0), num(input.hook.outAt, 0));
  for (const el of input.motion ?? []) {
    if (isHidden(el) || el.type === "highlightWords") continue;
    const w = windowOf(el);
    if (TIMED.has(el.type)) for (const it of el.items ?? []) ev.push(num(it.at, 0));
    else ev.push(w[0]);
    ev.push(w[1]);
  }
  for (const c of input.clips ?? []) if (num(c.start, 0) > 0) ev.push(num(c.start));
  for (const s of edlSegments(input.edl)) if (s.start > 0) ev.push(s.start);
  if (input.cta) ev.push(num(input.cta.at, 0));
  return ev.filter((t) => Number.isFinite(t)).sort((a, b) => a - b);
}

function checkHook(input, out) {
  const segs = (input.captionSegs ?? []).filter((s) => !s.hidden && String(s.text ?? "").trim());
  const firstCap = segs.length ? Math.min(...segs.map((s) => num(s.in, Infinity))) : Infinity;
  const textStarts = [];
  if (input.hook?.text) textStarts.push(num(input.hook.inAt, 0));
  for (const el of input.motion ?? []) if (!isHidden(el)) for (const p of textPieces(el, input.products)) textStarts.push(p.from);
  const firstWord = Math.min(firstCap, ...textStarts);
  const firstChange = Math.min(firstWord, ...visibleEvents(input));
  if (!Number.isFinite(firstChange)) return;
  if (firstChange <= LIMITS.hookChangeBy + FRAME) out.push(green("hookChange", "Hook: primer cambio", `Algo cambia a los ${round(firstChange)} s`));
  else out.push(itemOf("hookChange", "yellow", `Nada cambia hasta ${fmtT(firstChange)}`, `El primer cambio visible llega a los ${round(firstChange)} s (objetivo ~${LIMITS.hookChangeBy} s). Añade un movimiento o texto al inicio.`, { t: 0, key: "change" }));
  if (firstWord <= LIMITS.hookWordBy + FRAME) out.push(green("hookWord", "Hook: primera palabra", `Se lee a los ${round(firstWord)} s`));
  else if (!Number.isFinite(firstWord)) out.push(itemOf("hookWord", "yellow", "Sin texto legible en el hook", "No hay subtítulo ni texto de motion para leer al inicio.", { t: 0, key: "word" }));
  else out.push(itemOf("hookWord", "yellow", `Primera palabra a los ${fmtT(firstWord)}`, `La primera palabra legible llega a los ${round(firstWord)} s (objetivo ~${LIMITS.hookWordBy} s).`, { t: 0, key: "word" }));
}

function checkDead(input, out) {
  const end = num(input.cta?.at) ?? num(input.duration);
  if (!end) return;
  if (!(input.motion ?? []).length && !input.hook?.text) return; // no motion layer at all: the rule is about motion events
  const pts = [0, ...visibleEvents(input).filter((t) => t > 0 && t < end), end];
  const gaps = [];
  for (let i = 1; i < pts.length; i += 1) if (pts[i] - pts[i - 1] > LIMITS.deadAfter) gaps.push([pts[i - 1], pts[i]]);
  if (!gaps.length) return out.push(green("dead", "Ritmo visual", `Ningún tramo supera ${LIMITS.deadAfter} s sin evento`));
  // One item for the whole video (the worst stretch is where the click goes); the other stretches are listed in the detail.
  const worst = gaps.reduce((m, g) => (g[1] - g[0] > m[1] - m[0] ? g : m));
  const list = [...gaps].sort((x, y) => (y[1] - y[0]) - (x[1] - x[0])).slice(0, 5).map(([a, b]) => `${fmtT(a)}–${fmtT(b)} (${round(b - a, 1)} s)`).join(", ");
  out.push(itemOf("dead", "yellow", gaps.length === 1 ? `${round(worst[1] - worst[0], 1)} s sin evento de motion` : `${gaps.length} tramos sin evento de motion (el mayor, ${round(worst[1] - worst[0], 1)} s)`,
    `No entra ni sale ningún elemento de motion en: ${list}. Los subtítulos no cuentan; se siente muerto pasados ~${LIMITS.deadAfter} s.`, { t: worst[0], key: "gaps" }));
}

function checkCta(input, out) {
  const cta = input.cta;
  if (!cta) return;
  const at = num(cta.at);
  const dur = num(cta.dur) ?? (at !== null && num(input.duration) ? num(input.duration) - at : null);
  if (dur === null || at === null) return;
  const tail = dur - LIMITS.ctaEnterS;
  let bad = 0;
  if (dur < LIMITS.ctaMin - 1e-6 || dur > LIMITS.ctaMax + 1e-6) {
    bad += 1;
    out.push(itemOf("cta", "yellow", `CTA de ${round(dur, 1)} s`, `La tarjeta final dura ${round(dur, 1)} s (regla ${LIMITS.ctaMin}–${LIMITS.ctaMax} s).`, { t: at, key: "dur" }));
  }
  if (tail < LIMITS.ctaTail - 1e-6) {
    bad += 1;
    out.push(itemOf("cta", "yellow", `Cola del CTA de ${round(Math.max(tail, 0), 1)} s`, `Con todas las líneas ya visibles (~${LIMITS.ctaEnterS} s tras entrar) quedan ${round(Math.max(tail, 0), 1)} s; la regla pide ≥ ${LIMITS.ctaTail} s.`, { t: at, key: "tail" }));
  }
  if (!bad) out.push(green("cta", "Tarjeta CTA", `${round(dur, 1)} s, cola de ${round(tail, 1)} s`));
}

/** Segments of edl.json laid out on the output timeline, same rule as engine/edl.js layout(): a non-cut transition of `dur` on segment k overlaps
 *  segment k-1 by `dur` (fade, dipBlack, dipWhite). Tolerant of other shapes: a bare list, or [src, in, out] rows. */
export function edlSegments(edl) {
  const list = Array.isArray(edl) ? edl : edl?.segments ?? [];
  if (!Array.isArray(list)) return [];
  const segs = [];
  let cursor = 0;
  for (const s of list) {
    const o = Array.isArray(s) ? { in: s[1], out: s[2] } : s;
    if (!o || typeof o !== "object") continue;
    const rawLen = num(o.dur) ?? (num(o.out) !== null && num(o.in) !== null ? num(o.out) - num(o.in) : null);
    if (rawLen === null || rawLen <= 0) continue;
    const len = round(rawLen, 3);
    const tr = o.transition;
    const kind = typeof tr === "string" ? tr : tr?.type ?? "";
    const isDissolve = !!kind && !/^(cut|none)$/i.test(kind);
    const idx = segs.length;
    const d = idx > 0 && isDissolve ? Math.min(num(tr?.dur, 0), len, segs[idx - 1].dur) : 0;
    const start = idx === 0 ? 0 : round(cursor - d, 3);
    segs.push({ index: idx, start, dur: len, end: round(start + len, 3), dissolve: isDissolve, kind });
    cursor = round(start + len, 3);
  }
  return segs;
}

function checkEdl(input, out) {
  const segs = edlSegments(input.edl);
  if (!segs.length) return;
  const mid = segs.filter((s, i) => s.dissolve && i > 0);
  if (!mid.length) out.push(green("dissolve", "Disolvencias", "Solo cortes secos"));
  for (const s of mid) out.push(itemOf("dissolve", "yellow", "Disolvencia en medio del video", `La entrada del plano ${s.index + 1} es una transición «${s.kind}» (${fmtT(s.start)}). Los cortes secos son el estándar; deja la disolvencia para la tarjeta CTA.`, { t: s.start, key: `${s.index}` }));
  const textAt = (a, b) => (input.motion ?? []).some((el) => !isHidden(el) && textPieces(el, input.products).some((p) => p.from < b && p.to > a));
  const tiny = segs.filter((s) => s.dur < LIMITS.minShot && !textAt(s.start, s.end));
  if (!tiny.length) out.push(green("shortShot", "Planos cortos", `Ninguno de menos de ${LIMITS.minShot} s`));
  for (const s of tiny) out.push(itemOf("shortShot", "yellow", `Plano de ${round(s.dur)} s`, `El plano ${s.index + 1} dura ${round(s.dur)} s (mínimo ${LIMITS.minShot} s sin texto).`, { t: s.start, key: `${s.index}` }));
}

// Transition rules for the registry transitions (engine/transitions) and the overlap rules of engine/edl.js lint. Yellow only.
const TR_MAX = 3; // more than this many transitions in one video = too many
function checkTransitions(input, out) {
  const segs = edlSegments(input.edl);
  if (!segs.length) return;
  const cuts = segs.filter((s) => s.dissolve);
  if (cuts.length > TR_MAX) out.push(itemOf("transitionCount", "yellow", `Hay ${cuts.length} transiciones`, `El ritmo pide ${TR_MAX} como máximo; el corte seco es el default.`, { key: "count" }));
  const last = segs.length - 1;
  for (const s of segs) {
    if (s.kind === "fadeColor" && s.index !== last) out.push(itemOf("fadeColorMid", "yellow", "fadeColor en medio del video", `El plano ${s.index + 1} entra con fadeColor (${fmtT(s.start)}). Ese fundido es para el cierre; en medio usa un corte o una transición de movimiento.`, { t: s.start, key: `${s.index}` }));
  }
  const words = Array.isArray(input.words) ? input.words : [];
  if (!words.length) return; // speech check needs word data; without it the rule is skipped silently
  for (const s of segs) {
    if (!s.dissolve || s.index === 0) continue;
    const a = s.start, b = segs[s.index - 1].end; // overlap window on the output timeline (the incoming start up to the outgoing end)
    const hit = words.some((w) => Math.min(num(w.end, 0), b) - Math.max(num(w.start, 0), a) > 0.03);
    if (hit) out.push(itemOf("transitionSpeech", "yellow", "Transición sobre voz", `La transición del plano ${s.index + 1} (${fmtT(s.start)}) cae sobre una palabra; puede cortarla.`, { t: s.start, key: `${s.index}` }));
  }
}

function checkCaptionSpeed(input, out) {
  const segs = (input.captionSegs ?? []).filter((s) => !s.hidden && String(s.text ?? "").trim());
  if (!segs.length) return;
  const fast = [];
  for (const s of segs) {
    const dur = num(s.out, 0) - num(s.in, 0);
    if (dur < 0.05) continue;
    const cps = String(s.text).trim().length / dur;
    if (cps > LIMITS.captionCps) fast.push({ s, cps });
  }
  if (!fast.length) return out.push(green("captionCps", "Velocidad de lectura de subtítulos", `Todos ≤ ${LIMITS.captionCps} car/s`));
  for (const f of fast) out.push(itemOf("captionCps", "yellow", `Subtítulo rápido (${Math.round(f.cps)} car/s)`, `«${f.s.text}» se muestra ${round(f.s.out - f.s.in)} s: ${Math.round(f.cps)} caracteres por segundo (límite ~${LIMITS.captionCps}). Alarga el segmento o divídelo.`, { t: num(f.s.in, 0), segId: f.s.id, key: `${f.s.id ?? f.s.in}` }));
}

function checkClaims(input, out) {
  const found = [];
  for (const s of claimSources(input)) {
    for (const c of findClaims(s.text)) {
      const at = s.offsets ? s.offsets.filter((o) => o.o <= c.index).at(-1)?.t ?? s.t : s.t; // spoken: time of the word where the claim starts
      found.push({ ...c, t: at, label: s.label, text: s.text, elementId: s.elementId, segId: s.segId, spoken: s.spoken });
    }
  }
  found.sort((a, b) => a.t - b.t);
  // The same claim shows up in the voice, the caption and the on-screen text: keep one item per (claim, ~2.5 s) and list where it appears.
  const merged = [];
  for (const f of found) {
    const prev = merged.find((m) => m.id === f.id && Math.abs(m.t - f.t) < 2.5);
    if (prev) { if (!prev.labels.includes(f.label)) prev.labels.push(f.label); prev.elementId ??= f.elementId; prev.segId ??= f.segId; } else merged.push({ ...f, labels: [f.label] });
  }
  if (!merged.length) return out.push(green("claims", "Promesas de venta", "Sin frases de riesgo"));
  for (const m of merged) {
    const where = m.labels.join(" + ");
    out.push(itemOf("claims", m.yellow ? "yellow" : "red", m.yellow ? `«${m.match}» pide condiciones claras` : "Promesa que requiere respaldo o letra pequeña", `«${m.match}» en ${where} (${fmtT(m.t)}): ${m.yellow ? "di qué incluye y hasta cuándo." : "confirma que la marca la tiene por escrito o quítala."}`, { t: m.t, elementId: m.elementId, segId: m.segId, key: `${m.id}:${round(m.t, 1)}` }));
  }
}

// ---------- product elements (productCard / productPop / carousel) ----------
const clampN = (v, a, b) => Math.min(b, Math.max(a, v));
const imageOfRef = (doc, ref) => {
  const p = productOf(doc, ref?.product);
  const im = p ? (ref.image ? p.images?.find((i) => i.id === ref.image) : p.images?.[0]) : null;
  if (!im) return null;
  const cut = !!im.cutout && !im.preferOriginal;
  return { p, im, cut, w: cut ? im.cw ?? im.w : im.w, h: cut ? im.ch ?? im.h : im.h };
};
/** Magnification of the photo on screen (1 = one source pixel per output pixel), mirroring the draw code in brand-layer.js. */
export function upscaleOf(el, ref, rect, doc, planEl = null) {
  const r = imageOfRef(doc, ref);
  if (!r || !rect || !(r.w > 0 && r.h > 0)) return null;
  const ar = r.w / r.h;
  const boxW = rect.w - 40;
  const tile = (inner, tileH) => (r.cut ? Math.min((inner * 0.88) / r.w, (tileH * 0.88) / r.h) : Math.max(inner / r.w, tileH / r.h));
  if (el.type === "productCard") {
    const w = planEl?.w ?? el.w ?? boxW, inner = w * 0.91;
    return tile(inner, inner * clampN(1 / ar, 0.62, 1));
  }
  if (el.type === "productPop") {
    const size = planEl?.size ?? el.size ?? 620;
    return size / Math.max(r.w, r.h);
  }
  const n = (el.slides ?? []).length;
  const cols = el.style === "grid-pop" ? (n <= 4 ? 2 : 3) : 1;
  const cw = (boxW - 20 * (cols - 1)) / cols, inner = cw * 0.9;
  return tile(inner, inner);
}
const wantsPrice = (el, doc) => {
  if (el.showPrice === false) return false;
  if (el.type === "productPop" && el.showPrice !== true) return false;
  const refs = el.type === "carousel" ? el.slides ?? [] : [el];
  return refs.some((x) => (x.price !== undefined && x.price !== "") || (productOf(doc, x.product)?.price !== undefined));
};
// Reda is a trusted source for prices (the importer keeps priceBasis / "desde"): green while the import is fresh, yellow once it is over 7 days old (or undated).
const isStale = (p) => !p.fetchedAt || Date.now() - Date.parse(p.fetchedAt) > 7 * 864e5 || Number.isNaN(Date.parse(p.fetchedAt));
function checkProducts(input, out) {
  const els = (input.motion ?? []).map((el, i) => ({ el, i })).filter(({ el }) => PRODUCT_TYPES.includes(el.type) && !isHidden(el));
  if (!els.length) return;
  const doc = input.products;
  const rep = input.plan?.report?.elements ?? [];
  const before = out.length;
  for (const { el, i } of els) {
    const w = windowOf(el);
    const refs = el.type === "carousel" ? el.slides ?? [] : [el];
    const name = (ref) => productOf(doc, ref.product)?.name ?? "producto";
    // face
    const r = rep[i];
    if (r && r.mode !== "caption-option" && (num(r.faceOverlap, 0) >= LIMITS.faceYellow || num(r.faceZoneOverlap, 0) >= 0.1) && (input.plan?.report?.faces ?? []).length) {
      out.push(itemOf("productFace", "yellow", "La foto del producto tapa la cara", `${TYPES_LABEL[el.type]} «${name(refs[0])}» cubre la cara de la persona en ${fmtT(r.window?.[0] ?? w[0])}. Muévela a un lado o hazla más pequeña.`, { t: r.window?.[0] ?? w[0], elementId: el.id, key: `face:${el.id}` }));
    }
    // price from a catalog / unknown source
    if (wantsPrice(el, doc)) {
      const srcs = [...new Map(refs.map((x) => [x.product, productOf(doc, x.product)]).filter(([, p]) => p && p.price !== undefined && (p.source ?? "") !== "manual" && !(p.source === "reda" && !isStale(p)))).values()];
      if (srcs.length) {
        const old = srcs.find((p) => p.fetchedAt && Date.now() - Date.parse(p.fetchedAt) > 7 * 864e5);
        out.push(itemOf("productPrice", "yellow", "Verifica el precio", `Se muestra el precio de ${srcs.map((p) => `«${p.name}»`).join(", ")}, que viene de ${[...new Set(srcs.map((p) => p.source || "una fuente sin nombre"))].join(" / ")} y no lo escribiste a mano. Confírmalo antes de publicar${old ? " (los datos tienen más de 7 días)" : ""}.`, { t: w[0], elementId: el.id, key: `price:${el.id}` }));
      }
    }
    // cutout quality + resolution
    const seen = new Set();
    for (const ref of refs) {
      const x = imageOfRef(doc, ref);
      if (!x) continue;
      if (x.cut && x.im.cutoutWarnings?.length && !seen.has(`c${x.im.id}`)) {
        seen.add(`c${x.im.id}`);
        out.push(itemOf("productCutout", "yellow", `Recorte dudoso: ${x.p.name}`, `${x.im.cutoutWarnings.join(" ")} Revisa la foto en Productos o marca «Usar original».`, { t: w[0], elementId: el.id, key: `cut:${el.id}:${x.im.id}` }));
      }
      const k = upscaleOf(el, ref, input.plan?.rects?.[i], doc, input.plan?.elements?.[i]);
      if (k !== null && k > 1.15 && !seen.has(`r${x.im.id}`)) {
        seen.add(`r${x.im.id}`);
        out.push(itemOf("productRes", "yellow", `Foto de baja resolución: ${x.p.name}`, `La foto de «${x.p.name}» (${x.w}×${x.h} px) se amplía ${k.toFixed(1)}× en pantalla y puede verse borrosa. Sube una más grande o hazla más pequeña.`, { t: w[0], elementId: el.id, key: `res:${el.id}:${x.im.id}` }));
      }
    }
  }
  if (out.length === before) out.push(green("productRes", "Productos", "Fotos nítidas, precios verificados y sin tapar la cara"));
}
const TYPES_LABEL = { productCard: "La tarjeta", productPop: "El producto flotando", carousel: "El carrusel" };

function checkLoudness(input, out) {
  const l = input.loudness;
  if (!l || !Number.isFinite(Number(l.integrated))) return;
  const i = Number(l.integrated);
  const tp = num(l.truePeak);
  const problems = [];
  if (Math.abs(i - LIMITS.lufs) > LIMITS.lufsTol) problems.push(`${i.toFixed(1)} LUFS (objetivo ${LIMITS.lufs} ±${LIMITS.lufsTol})`);
  if (tp !== null && tp > LIMITS.truePeak) problems.push(`pico real ${tp.toFixed(1)} dBTP (máximo ${LIMITS.truePeak})`);
  if (!problems.length) out.push(green("loudness", "Sonoridad del último render", `${i.toFixed(1)} LUFS${tp !== null ? `, ${tp.toFixed(1)} dBTP` : ""}`));
  else out.push(itemOf("loudness", "yellow", "Sonoridad fuera de objetivo", `El último render mide ${problems.join(" y ")}.`, { key: "loud" }));
}

// kinetic: exactly one hero letter-by-letter word per video (kineticWord).
function checkKinetic(input, out) {
  const ks = (input.motion ?? []).filter((e) => e?.type === "kineticWord" && !isHidden(e));
  if (!ks.length) return;
  if (ks.length === 1) { out.push(green("kinetic", "Una sola palabra grande", `«${ks[0].text ?? ""}» es la palabra héroe del video`)); return; }
  ks.slice(1).forEach((el) => out.push(itemOf("kinetic", "yellow", `Más de una palabra grande: «${el.text ?? ""}»`, `Hay ${ks.length} palabras grandes letra por letra (solo se recomienda una por video). Deja la más importante y cambia las demás a «Palabra clave».`, { t: num(el.in, 0), elementId: el.id, key: `kw:${el.id ?? el.text}` })));
}
// uiNumbersSource: a product screen with figures must say where they come from.
function checkUiNumbers(input, out) {
  for (const el of input.motion ?? []) {
    if (isHidden(el) || !isUiEl(el) || !uiShowsNumbers(el)) continue;
    const w = windowOf(el);
    const name = `${String(el.title ?? el.label ?? el.brand ?? el.type).slice(0, 30)}`;
    const k = el.source?.kind;
    const extra = { t: w?.[0] ?? 0, elementId: el.id, key: el.id };
    if (!k) out.push(itemOf("uiNumbersSource", "red", `Cifra sin fuente: «${name}»`, `La pantalla «${name}» muestra cifras pero no dice de dónde salen. Elige la fuente en «Fuente de los datos» (Reda, captura, marca o ilustrativos).`, extra));
    else if (k === "fictional") out.push(itemOf("uiNumbersSource", "yellow", `Cifras ilustrativas: «${name}»`, "Cifras ilustrativas: confirma antes de publicar que no se presentan como datos reales.", extra));
    else if (k === "reda" && isStale({ fetchedAt: el.source?.fetchedAt })) out.push(itemOf("uiNumbersSource", "yellow", `Datos de Reda viejos: «${name}»`, `Los datos de Reda de «${name}» ${el.source?.fetchedAt ? `tienen más de 7 días (${String(el.source.fetchedAt).slice(0, 10)})` : "no tienen fecha"}. Vuelve a traerlos o confirma que siguen vigentes.`, extra));
    else out.push(itemOf("uiNumbersSource", "green", `Cifras con fuente: «${name}»`, `Fuente: ${k}${el.source?.ref ? ` (${el.source.ref})` : ""}.`, extra));
  }
}
// uiPlacement: the card stays inside the platform-safe area (zones) and off the face box when face data exists.
function checkUiPlacement(input, out) {
  const plan = input.plan;
  if (!plan?.rects) return;
  const z = { top: 220, bottom: 380, left: 60, right: 60, ...(input.zones ?? {}) };
  const box = { x0: z.left, x1: W - z.right, y0: z.top, y1: H - z.bottom };
  const rep = plan.report?.elements ?? [];
  const hasFaces = Array.isArray(plan.report?.faces) && plan.report.faces.length > 0;
  let checked = 0, bad = 0;
  (input.motion ?? []).forEach((el, i) => {
    const r = plan.rects[i];
    if (!r || isHidden(el) || !isUiEl(el) || LIB.isFullFrame(el)) return; // full-frame closers are exempt
    checked += 1;
    const w = windowOf(el);
    const TOL = 2;
    const over = Math.max(box.x0 - r.x, r.x + r.w - box.x1, box.y0 - r.y, r.y + r.h - box.y1);
    const name = `${el.type} «${String(el.title ?? el.label ?? el.brand ?? "").slice(0, 28)}»`;
    if (over > TOL) { bad += 1; out.push(itemOf("uiPlacement", "red", `Pantalla fuera de la zona segura: ${name}`, `La pantalla se sale ${Math.round(over)} px de la zona segura (la app tapa esa franja). Cambia «Dónde se ve» o las zonas de la plataforma.`, { t: w?.[0] ?? 0, elementId: el.id, key: `safe:${el.id}` })); }
    const face = num(rep[i]?.faceOverlap, 0), zone = num(rep[i]?.faceZoneOverlap, 0);
    if (hasFaces && face >= LIMITS.faceYellow) { bad += 1; out.push(itemOf("uiPlacement", "red", `La pantalla tapa la cara: ${name}`, `${Math.round(face * 100)} % de la pantalla está sobre la cara de la persona. Cámbiala de zona («Dónde se ve») o acórtala.`, { t: w?.[0] ?? 0, elementId: el.id, key: `face:${el.id}` })); }
    else if (hasFaces && zone >= 0.1) { bad += 1; out.push(itemOf("uiPlacement", "yellow", `La pantalla roza la cara: ${name}`, `Está muy pegada a la cara (${Math.round(zone * 100)} % dentro de su zona). Revisa que se vea bien la expresión.`, { t: w?.[0] ?? 0, elementId: el.id, key: `zone:${el.id}` })); }
  });
  if (checked && !bad) out.push(green("uiPlacement", "Pantallas bien colocadas", "Dentro de la zona segura y sin tapar la cara"));
}

const ORDER = { red: 0, yellow: 1, green: 2 };
export function runReview(raw = {}) {
  // Non-object entries become hidden placeholders so plan indices (rects[i], report.elements[i]) keep lining up with the motion list.
  const input = { ...(raw ?? {}), motion: (raw?.motion ?? []).map((e) => (e && typeof e === "object" ? e : { type: "?", hidden: true })) };
  const items = [];
  const checks = [checkOvershoot, checkText, checkSize, checkZones, checkTextFit, checkFaces, checkLogo, checkHook, checkDead, checkCta, checkEdl, checkTransitions, checkCaptionSpeed, checkClaims, checkProducts, checkKinetic, checkUiNumbers, checkUiPlacement, checkLoudness];
  for (const fn of checks) {
    try {
      fn(input, items);
    } catch (err) {
      items.push({ id: `error:${fn.name}`, check: fn.name, severity: "yellow", title: "No se pudo evaluar una regla", detail: String(err?.message ?? err), rule: "", t: null });
    }
  }
  items.sort((a, b) => ORDER[a.severity] - ORDER[b.severity] || (a.t ?? 0) - (b.t ?? 0));
  const counts = { red: 0, yellow: 0, green: 0 };
  for (const it of items) counts[it.severity] += 1;
  return { items, counts };
}
