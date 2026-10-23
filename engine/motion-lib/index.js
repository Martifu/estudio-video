// Motion library registry: every element type is ONE file in this directory (default export = a descriptor, see _template.js and
// engine/README.md "Cómo agregar un elemento"). This module discovers them, and offers the generic machinery every consumer uses
// (brand-layer.js, layout.js, the Estudio client, scripts/overlay.py through cli.mjs): timelines, geometry, SFX events, image refs,
// validation, drawing. Nothing outside this directory lists the types.
//
// Discovery: files named like a type (lowerCamel .js, not index.js, not starting with "_"). In Node the directory is read; in the browser
// engine/static-server.mjs answers /engine/motion-lib/manifest.json with the same list. Top-level await: importers get a ready registry.
import { clamp, resolveSkin, uiResolveRef } from "../ui-motion.js";

export { resolveSkin, uiResolveRef as resolveRef };
export const UI_SLOTS = ["band", "top", "center"];
export const LOAD_ERRORS = [];
const REG = new Map();
const LOCAL = new Set(); // types registered from a comp's own motion-lib folder (RUN/<comp>/motion-lib/<type>.js): this video only
export const LOCAL_CATEGORY = "De este video";
const HERE = new URL(".", import.meta.url);
export const isTypeFile = (f) => /^[a-z][A-Za-z0-9]*\.js$/.test(f) && f !== "index.js";

async function listFiles() {
  if (typeof window === "undefined" && typeof process !== "undefined" && process.versions?.node) {
    const { readdirSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    return readdirSync(fileURLToPath(HERE)).filter(isTypeFile).sort();
  }
  const r = await fetch(new URL("manifest.json", HERE), { cache: "no-store" });
  if (!r.ok) throw new Error(`motion-lib manifest: HTTP ${r.status}`);
  return (await r.json()).files.filter(isTypeFile).sort();
}

/** Problems of a descriptor against the contract (strings; empty = valid). Used at load time and by the contract test. */
export function checkDescriptor(d) {
  const p = [];
  if (!d || typeof d !== "object") return ["the default export is not an object"];
  for (const k of ["type", "category", "label", "description", "icon", "brief"]) if (typeof d[k] !== "string" || !d[k]) p.push(`"${k}" must be a non-empty string`);
  if (typeof d.brief === "string" && d.brief.trim().split("\n").length < 3) p.push('"brief" must have 3-6 lines (what it says, when to use it / not, choreography, taste rules, data source)');
  for (const k of ["defaults", "validate", "timeline", "draw", "events"]) if (typeof d[k] !== "function") p.push(`"${k}" must be a function`);
  if (typeof d.size !== "function" && typeof d.rect !== "function" && typeof d.candidates !== "function") p.push('one of "size", "rect" or "candidates" must be a function');
  if (!Array.isArray(d.fields)) p.push('"fields" must be an array');
  if (d.layer !== undefined && !["mid", "over", "top"].includes(d.layer)) p.push('"layer" must be mid | over | top');
  if (d.captions !== undefined && !["option", "always"].includes(d.captions)) p.push('"captions" must be option | always');
  if (d.placement !== undefined && d.placement !== "pinned") p.push('"placement" must be "pinned" (or absent = face-aware)');
  if (d.minScale !== undefined && !(d.minScale > 0 && d.minScale <= 1)) p.push('"minScale" must be in (0, 1]');
  return p;
}

function register(mods, local = false) {
  const errors = [];
  for (const { f, d, e } of mods) {
    const problems = e ? [`import failed: ${e.message}`] : checkDescriptor(d);
    if (d && !problems.length && REG.has(d.type)) problems.push(local ? `type ${d.type} already exists in the library (rename it)` : `duplicate type ${d.type}`);
    if (d && !problems.length && f !== `${d.type}.js`) problems.push(`file name must be ${d.type}.js`);
    if (problems.length) { errors.push({ file: local ? `local:${f}` : f, problems }); console.error(`motion-lib/${local ? "(local) " : ""}${f}: ${problems.join("; ")}`); continue; }
    REG.set(d.type, d);
    if (local) LOCAL.add(d.type);
  }
  LOAD_ERRORS.push(...errors);
  return errors;
}
const files = await listFiles();
register(await Promise.all(files.map(async (f) => {
  try { return { f, d: (await import(`./${f}`)).default }; } catch (e) { return { f, e }; }
})));

// ---------- comp-local elements (RUN/<comp>/motion-lib/<type>.js) ----------
// A video may bring its own element types, written exactly like a library file (same contract, copied from _template.js or from the
// closest element). Their relative imports ("./_kit.js", "../ui-motion.js") are rewritten to the shared engine files so a copy works
// unchanged. They register for this process / page only and are listed under "De este video". No folder (or an empty one) = no-op.
const ENGINE_URL = new URL("../", HERE);
const rewriteImports = (src) => src.replace(/(\bfrom\s*|\bimport\s*\(?\s*)(["'])(\.\.?\/)([^"']+)\2/g, (m, pre, q, rel, rest) => `${pre}${q}${new URL(rest, rel === "./" ? HERE : ENGINE_URL).href}${q}`);
/**
 * Register the comp-local element types of `dir` (Node: a filesystem path; browser: a URL of the folder, served with a manifest.json).
 * Returns { types, errors } (errors = [{file, problems}], also appended to LOAD_ERRORS). Calling it twice for the same folder is a no-op.
 */
const LOADED_LOCAL = new Set();
export async function loadLocal(dir) {
  if (!dir) return { types: [], errors: [] };
  let list = [], read;
  const isNode = typeof window === "undefined" && typeof process !== "undefined" && process.versions?.node;
  if (isNode) {
    const { existsSync, readdirSync, readFileSync, realpathSync } = await import("node:fs");
    if (!existsSync(dir)) return { types: [], errors: [] };
    const real = realpathSync(dir);
    if (LOADED_LOCAL.has(real)) return { types: [], errors: [] };
    LOADED_LOCAL.add(real);
    list = readdirSync(real).filter(isTypeFile).sort();
    read = (f) => readFileSync(`${real}/${f}`, "utf8");
  } else {
    const base = new URL(String(dir).endsWith("/") ? dir : `${dir}/`, document.baseURI);
    if (LOADED_LOCAL.has(base.href)) return { types: [], errors: [] };
    LOADED_LOCAL.add(base.href);
    const r = await fetch(new URL("manifest.json", base), { cache: "no-store" }).catch(() => null);
    if (!r?.ok) return { types: [], errors: [] };
    list = ((await r.json().catch(() => ({}))).files ?? []).filter(isTypeFile).sort();
    read = async (f) => { const x = await fetch(new URL(f, base), { cache: "no-store" }); if (!x.ok) throw new Error(`HTTP ${x.status}`); return x.text(); };
  }
  const mods = await Promise.all(list.map(async (f) => {
    try {
      const src = rewriteImports(await read(f));
      const url = isNode ? `data:text/javascript;base64,${Buffer.from(src).toString("base64")}` : URL.createObjectURL(new Blob([src], { type: "text/javascript" }));
      return { f, d: (await import(/* @vite-ignore */ url)).default };
    } catch (e) { return { f, e }; }
  }));
  const before = new Set(REG.keys());
  const errors = register(mods, true);
  return { types: [...REG.keys()].filter((t) => !before.has(t)), errors };
}

// ---------- registry ----------
export const get = (type) => REG.get(type);
export const has = (type) => REG.has(type);
export const isLib = (el) => REG.has(el?.type);
export const all = () => [...REG.values()];
export const types = () => [...REG.keys()];
/** True for a type that comes from the comp's own motion-lib folder (not the shared library). */
export const isLocal = (type) => LOCAL.has(type);
/** Spanish category label -> descriptors. "De este video" (comp-local elements) first, then Pantallas, then the rest in alphabetical order. */
export function byCategory() {
  const m = new Map();
  for (const d of REG.values()) { const c = LOCAL.has(d.type) ? LOCAL_CATEGORY : d.category; m.set(c, [...(m.get(c) ?? []), d]); }
  const order = (c) => (c === LOCAL_CATEGORY ? "" : c === "Pantallas" ? " " : c);
  return [...m.entries()].sort((a, b) => order(a[0]).localeCompare(order(b[0]), "es")).map(([category, items]) => ({ category, items }));
}
/** Full-frame elements (logoSting): never part of face / safe-area / collision checks. */
export const isFullFrame = (el) => !!REG.get(el?.type)?.fullFrame;
export const layerOf = (type) => REG.get(type)?.layer ?? "mid";
export const typesOnLayer = (layer) => types().filter((t) => layerOf(t) === layer);

// ---------- timelines ----------
// Every type has a design length `Ld` (seconds) and named beats in design seconds ([a, b] = a span; {start, step, dur} = a stagger). The
// element runs the whole design inside [in, out]: ts = (t - in) / (out - in) * Ld, so stretching it in the Estudio timeline rescales the
// choreography. Types with `fullMin` switch to a "lite" table below that many seconds (optional beats such as the cursor are dropped).
export const durOf = (el) => Math.max(0.05, (Number(el.out) || 0) - (Number(el.in) || 0));
export const modeOf = (el) => { const d = REG.get(el.type); return !d || d.fullMin === undefined ? "full" : durOf(el) >= d.fullMin ? "full" : "lite"; };
/** { type, D, mode, Ld, b, cursor }: b = beats in design seconds. */
export function timeline(el) {
  const d = REG.get(el.type);
  const D = durOf(el), mode = modeOf(el);
  const s = d.timeline(el, mode);
  return { type: el.type, D, mode, Ld: s.Ld, b: s.b, cursor: !!(d.cursor && el.cursor !== false && mode === "full" && d.cursor(el)) };
}
/** Design time of the element at global time t (0 before `in`, Ld at/after `out`). */
export function localTime(el, t, tl = timeline(el)) {
  return clamp((t - el.in) / tl.D) * tl.Ld;
}
const REL_KEYS = new Set(["step", "dur"]); // spans inside {start, step, dur}: scaled, not offset
const mapBeat = (v, f, rel, key = "") => (Array.isArray(v) ? v.map((x) => mapBeat(x, f, rel)) : typeof v === "number" ? (REL_KEYS.has(key) ? rel(v) : f(v)) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, mapBeat(x, f, rel, k)])) : v);
/** Absolute beat times (seconds on the video timeline): every design second scaled by D / Ld and offset by `in`. */
export function beats(el) {
  const tl = timeline(el);
  const f = (s) => Math.round((el.in + (s / tl.Ld) * tl.D) * 1e4) / 1e4;
  const rel = (s) => Math.round((s / tl.Ld) * tl.D * 1e4) / 1e4;
  return { type: el.type, mode: tl.mode, cursor: tl.cursor, in: el.in, out: el.out, beats: mapBeat(tl.b, f, rel) };
}
export const visible = (el, t) => isLib(el) && !el.hidden && t >= el.in && t < el.out;

// ---------- what an element hides while it is on screen ----------
/** { captions, logo }: does it hide the captions / the logo bug. descriptor.captions "always" | "option" (element.captions "hide" default, "keep"). */
export function hides(el) {
  const d = REG.get(el?.type);
  if (!d) return { captions: false, logo: false };
  return { captions: d.captions === "always" || (d.captions === "option" && el.captions !== "keep"), logo: !!d.hidesLogo };
}
export const CAPTION_BRIDGE = 0.6; // gaps shorter than this between two caption-hiding elements stay hidden (no one-frame-ish caption blip)
/** [[from, to]] windows where captions must stay hidden: each hiding element's [in, out + tail], gaps < CAPTION_BRIDGE merged. */
export function captionHideWindows(elements) {
  const w = [];
  for (const el of elements ?? []) {
    if (!isLib(el) || el.hidden || !hides(el).captions) continue;
    w.push([el.in, el.out + (REG.get(el.type).tail ?? 0)]);
  }
  w.sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const x of w) {
    const last = out[out.length - 1];
    if (last && x[0] - last[1] < CAPTION_BRIDGE) last[1] = Math.max(last[1], x[1]);
    else out.push([...x]);
  }
  return out;
}
export function captionsHidden(elements, t) {
  for (const [a, b] of captionHideWindows(elements)) if (t >= a && t < b) return true;
  return false;
}
/** Windows where an element asks for the logo bug to be hidden. */
export function logoHideWindows(elements) {
  return (elements ?? []).filter((el) => isLib(el) && !el.hidden && hides(el).logo).map((el) => [el.in, el.out]);
}

// ---------- geometry ----------
/**
 * Bounding box of an element in canvas px. zones = { x0, x1, toastTop, bottom } (B.SAFE.x0/x1, B.BANDS.toastTop/bottom).
 * Default (descriptor.size(el, env) -> {w, h}): slot "band" (default) = bottom-anchored between the chin and the platform UI,
 * "top" = just under the header, "center" = centred in the free area. A descriptor may supply its own rect(el, zones, env).
 */
export function rect(el, zones = { x0: 60, x1: 1020, toastTop: 350, bottom: 1540 }, env = {}) {
  const d = REG.get(el.type);
  env = withKit({ skin: resolveSkin(null, {}), ...env });
  if (d.rect) return d.rect(el, zones, env);
  const { w, h } = d.size(el, env);
  return placedRect(el, w, h, zones);
}
// ---------- face-aware placement (shared default) ----------
// Every element sized by `size()` (no own rect / candidates) and not declared `placement: "pinned"` is placed by the face-aware planner
// (layout.js): its slot (the user's `slot` is a preference, the other slots cost PIN_PENALTY more), and, inside a slot, a smaller
// `scale` (never below descriptor.minScale, default 1 = no shrink) and an `align` (left / right; only when narrower than the free width).
// The planner writes the winner into el.slot / el.scale / el.align at render time; absent fields = the plain slot (byte-identical).
export const PIN_PENALTY = 260;
const SIDES = ["left", "right"];
const scaleOf = (el) => (Number.isFinite(Number(el.scale)) && Number(el.scale) > 0 && Number(el.scale) < 1 ? Number(el.scale) : 1);
function placedRect(el, w, h, zones) {
  if (!autoPlaced(REG.get(el.type))) return slotRect(el.slot, w, h, zones);
  const s = scaleOf(el);
  const r = slotRect(el.slot, Math.round(w * s), Math.round(h * s), zones);
  if (SIDES.includes(el.align)) r.x = el.align === "left" ? zones.x0 : zones.x1 - r.w;
  return r;
}
/** The default planner applies to this element (see above). */
const autoPlaced = (d) => d && typeof d.candidates !== "function" && typeof d.rect !== "function" && typeof d.size === "function" && d.placement !== "pinned" && !d.fullFrame;
/** Elements that let the face-aware planner choose among positions: descriptor.candidates(el, zones, env) -> [{name, rect, patch, cost}], or the shared default. */
export const hasCandidates = (el) => typeof REG.get(el?.type)?.candidates === "function" || autoPlaced(REG.get(el?.type));
export function candidates(el, zones, env = {}) {
  const d = REG.get(el.type);
  env = withKit({ skin: resolveSkin(null, {}), ...env });
  if (typeof d.candidates === "function") return d.candidates(el, zones, env);
  return defaultCandidates(d, el, zones, env);
}
const SLOT_COST = { band: 0, center: 30, top: 60 };
/** slot x scale x side variants of a size()-based element. An explicit el.slot / el.scale / el.align is a preference, not a pin. */
export function defaultCandidates(d, el, zones, env = {}) {
  const { w, h } = d.size({ ...el, scale: undefined, align: undefined }, env);
  const pref = UI_SLOTS.includes(el.slot) ? el.slot : null;
  const minS = d.minScale ?? 1;
  const scales = [1, 0.88, 0.76].filter((k) => k >= minS - 1e-9);
  if (scaleOf(el) !== 1 && !scales.includes(scaleOf(el))) scales.push(scaleOf(el));
  const free = zones.x1 - zones.x0;
  const out = [];
  for (const slot of UI_SLOTS) {
    const slotCost = pref ? (slot === pref ? 0 : PIN_PENALTY + SLOT_COST[slot]) : SLOT_COST[slot];
    for (const k of scales) {
      for (const side of [null, ...SIDES]) {
        if (side && w * k > free - 120) continue; // a side position needs real room left on the other side
        const patch = { slot, scale: k === 1 ? undefined : k, align: side ?? undefined };
        const userSide = SIDES.includes(el.align) ? el.align : null;
        const cost = slotCost + Math.abs(scaleOf(el) - k) * 220 + (side === userSide ? 0 : 40);
        out.push({ name: `${d.type}-${slot}${k === 1 ? "" : `@${k}`}${side ? `-${side}` : ""}`, rect: placedRect({ ...el, ...patch }, w, h, zones), patch, cost, faceArea: true });
      }
    }
  }
  return out;
}
export function slotRect(slot, w, h, zones = { x0: 60, x1: 1020, toastTop: 350, bottom: 1540 }) {
  const x = Math.round((zones.x0 + zones.x1) / 2 - w / 2);
  const s = UI_SLOTS.includes(slot) ? slot : "band";
  let y;
  if (s === "top") y = zones.toastTop;
  else if (s === "center") y = Math.round((zones.toastTop + zones.bottom) / 2 - h / 2);
  else y = zones.bottom - h;
  return { x, y, w, h };
}

// ---------- SFX events ----------
/** [{t, type: "pop"|"whoosh"|"notify"|"click", x: -1..1}]: the descriptor reports beats through add(t, type, px?) (px = canvas x, default the rect centre). */
export function events(el, r = rect(el)) {
  const { beats: B, cursor } = beats(el);
  const cx = r.x + r.w / 2;
  const X = (px) => Number((((px ?? cx) / 1080) * 2 - 1).toFixed(3));
  const ev = [];
  const add = (t, type, px) => ev.push({ t: Number(t.toFixed(3)), type, x: X(px) });
  REG.get(el.type).events(el, r, { beats: B, cursor, add });
  return ev;
}

// ---------- images ----------
/** Image refs (thumbs / avatars) an element draws: [{ref, what}] without duplicates. "people:pNN" = the bundled fictional bank. */
export function imageRefs(el) {
  const out = [];
  const add = (ref, what) => { if (typeof ref === "string" && ref && !out.some((x) => x.ref === ref)) out.push({ ref, what }); };
  REG.get(el.type)?.imageRefs?.(el, add);
  return out;
}
/** Every string the element shows (claims scanner of the review). */
export function texts(el) {
  const out = [];
  REG.get(el?.type)?.texts?.(el, (x) => { if (typeof x === "string" && x.trim()) out.push(x); });
  return out;
}
/** Regions of the footage an element wants to know the brightness of (decisions that depend on what is behind it): [{key, x, y, w, h}]; descriptor.backdrops(el, rect). */
export const backdrops = (el, r = rect(el)) => REG.get(el?.type)?.backdrops?.(el, r) ?? [];
/** True when the element shows numbers (the review asks where they come from). */
export const showsNumbers = (el) => !!REG.get(el?.type)?.showsNumbers?.(el);

// ---------- validation ----------
/** Spanish problems of an element: { errors, warnings }. Common checks (slot / captions / push / source) + the descriptor's own. */
export function validate(el, tag = el?.type) {
  const d = REG.get(el?.type);
  if (!d) return { errors: [`${tag}: tipo desconocido`], warnings: [] };
  const r = d.validate(el, tag);
  const errors = [...(r?.errors ?? [])], warnings = [...(r?.warnings ?? [])];
  if (d.screen) {
    if (el.slot !== undefined && !UI_SLOTS.includes(el.slot)) errors.push(`${tag}: "slot" debe ser band, top o center`);
    if (el.captions !== undefined && !["hide", "keep"].includes(el.captions)) errors.push(`${tag}: "captions" debe ser hide o keep`);
    if (el.push !== undefined && !(Number(el.push) >= 0 && Number(el.push) <= 0.15)) errors.push(`${tag}: el acercamiento va de 0 a 0.15`);
  }
  if (autoPlaced(d) && el.scale !== undefined && !(Number(el.scale) >= 0.5 && Number(el.scale) <= 1)) errors.push(`${tag}: "scale" va de 0.5 a 1`);
  if (autoPlaced(d) && el.align !== undefined && !SIDES.includes(el.align)) errors.push(`${tag}: "align" debe ser left o right`);
  if (d.source && el.source !== undefined && !(el.source && ["reda", "screenshot", "brand", "fictional"].includes(el.source.kind))) {
    errors.push(`${tag}: "source.kind" debe ser reda, screenshot, brand, fictional`);
  }
  return { errors, warnings };
}

// ---------- drawing ----------
/** Brand kit used when the host provides none (Node tests, thumbnails): text-only brand built from the skin. */
export function stubKit(skin = resolveSkin(null, {})) {
  const c = skin.colors;
  return {
    name: "Marca", colors: { primary: c.primary, ink: c.ink, paper: "#FFFFFF", accent: c.highlight ?? c.primary, on_primary: c.ink, accent_on_paper: c.accent }, cta: {}, website: "", webHost: "",
    font: (which, px, w = 700) => `${w} ${px}px "${skin.font.family}", system-ui, sans-serif`,
    hasLogo: () => false, logoSize: () => null, drawLogo: () => false, missingLogo: () => {}
  };
}
const withKit = (env) => (env.kit ? env : { ...env, kit: stubKit(env.skin) });
/** Draw one element at global time t (no-op when hidden or outside [in, out)). env = { skin, img(ref), canvas(w, h), zones, measure? }. */
export function draw(ctx, el, t, env) {
  const d = REG.get(el.type);
  if (!d || el.hidden || t < el.in || t >= el.out) return;
  env = withKit(env);
  const tl = timeline(el);
  const ts = localTime(el, t, tl);
  let r = env.rect ?? rect(el, env.zones, env);
  ctx.save();
  if (autoPlaced(d) && (scaleOf(el) !== 1 || SIDES.includes(el.align))) {
    // Placed smaller and/or to a side by the planner: the element draws at its natural slot geometry, mapped onto the placed rect.
    const zones = env.zones ?? { x0: 60, x1: 1020, toastTop: 350, bottom: 1540 };
    const { w, h } = d.size({ ...el, scale: undefined, align: undefined }, env);
    const n = slotRect(el.slot, w, h, zones);
    ctx.translate(r.x, r.y);
    ctx.scale(r.w / n.w, r.h / n.h);
    ctx.translate(-n.x, -n.y);
    r = n;
  }
  d.draw(ctx, el, t, { ...env, tl, ts, rect: r });
  ctx.restore();
}

/** The element Estudio inserts for a thumbnail / preview: descriptor.sample(brand) or defaults(0, sampleDur). */
export function sampleOf(type, brand = {}) {
  const d = REG.get(type);
  const el = d.sample ? d.sample(brand) : d.defaults(0, d.sampleDur ?? 4.5);
  return { ...el, in: el.in ?? 0, out: el.out ?? d.sampleDur ?? 4.5 };
}
/**
 * Static thumbnail: draws the sample of `type` (at fraction `at` of its window, default the descriptor's thumbAt) scaled to fit a w x h box
 * on `ctx`. skin = resolved skin (default derived from `brand`). Returns false when it could not draw.
 */
export function drawSample(ctx, type, { w, h, brand = {}, skin = resolveSkin(null, brand), img = () => null, iconMeta, at } = {}) {
  const d = REG.get(type);
  if (!d) return false;
  const el = sampleOf(type, brand);
  const zones = { x0: 60, x1: 1020, toastTop: 350, bottom: 1540 };
  const env = { skin, img, iconMeta, canvas: () => null, zones, measure: undefined };
  const r = rect({ ...el, slot: "center" }, zones, env);
  const k = Math.min(w / r.w, h / r.h) * 0.94;
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.scale(k, k);
  ctx.translate(-(r.x + r.w / 2), -(r.y + r.h / 2));
  const t = el.in + (el.out - el.in) * (at ?? d.thumbAt ?? 0.72);
  draw(ctx, { ...el, slot: "center" }, t, { ...env, rect: r });
  ctx.restore();
  return true;
}
