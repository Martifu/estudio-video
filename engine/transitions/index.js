// Transitions registry: every transition is ONE file in this directory (default export = a descriptor, see _template.js). This module
// discovers them the same way engine/motion-lib/index.js does: in Node the directory is read; in the browser engine/static-server.mjs
// answers /engine/transitions/manifest.json with the same list. Top-level await: importers get a ready registry. It does not import motion-lib.
import { sampleFrames } from "./_samples.js";

export const CATEGORIES = ["Corte", "Movimiento", "Marca", "Impacto", "Suave"];
export const LOAD_ERRORS = [];
const REG = new Map();
const HERE = new URL(".", import.meta.url);
export const isTypeFile = (f) => /^[a-z][A-Za-z0-9]*\.js$/.test(f) && f !== "index.js";
const SFX_KINDS = ["whoosh", "pop"];
const AUDIO_KINDS = ["crossfade", "dry"];
const isNum = (x) => typeof x === "number" && Number.isFinite(x);
const isText = (x) => typeof x === "string" && x.trim() !== "";
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

async function listFiles() {
  if (typeof window === "undefined" && typeof process !== "undefined" && process.versions?.node) {
    const { readdirSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    return readdirSync(fileURLToPath(HERE)).filter(isTypeFile).sort();
  }
  const r = await fetch(new URL("manifest.json", HERE), { cache: "no-store" });
  if (!r.ok) throw new Error(`transitions manifest: HTTP ${r.status}`);
  return (await r.json()).files.filter(isTypeFile).sort();
}

/** Problems of a descriptor against the contract (strings; empty = valid). Used at load time and by the test file. */
export function checkDescriptor(d) {
  const p = [];
  if (!d || typeof d !== "object") return ["el export por defecto no es un objeto"];
  for (const k of ["name", "label", "description", "brief"]) if (!isText(d[k])) p.push(`"${k}" debe ser texto no vacío`);
  if (isText(d.brief) && d.brief.trim().split("\n").length < 3) p.push('"brief" debe tener de 3 a 6 líneas (qué comunica, cuándo usarla / no, coreografía, reglas de gusto)');
  if (!CATEGORIES.includes(d.category)) p.push(`"category" debe ser una de: ${CATEGORIES.join(", ")}`);
  for (const k of ["defaultDur", "minDur", "maxDur"]) if (!isNum(d[k])) p.push(`"${k}" debe ser un número finito`);
  if ([d.minDur, d.defaultDur, d.maxDur].every(isNum) && !(d.minDur >= 0 && d.minDur <= d.defaultDur && d.defaultDur <= d.maxDur)) {
    p.push("hay que cumplir 0 <= minDur <= defaultDur <= maxDur");
  }
  if (!(isNum(d.impact) && d.impact >= 0 && d.impact <= 1)) p.push('"impact" debe ser un número entre 0 y 1');
  if (!Array.isArray(d.params)) p.push('"params" debe ser una lista');
  else {
    d.params.forEach((q, i) => {
      if (!q || typeof q !== "object") { p.push(`params[${i}] no es un objeto`); return; }
      if (!isText(q.key)) p.push(`params[${i}].key debe ser texto no vacío`);
      if (!isText(q.label)) p.push(`params[${i}].label debe ser texto no vacío`);
      if (q.kind === "select") {
        const ok = Array.isArray(q.options) && q.options.length > 0 && q.options.every((o) => Array.isArray(o) && o.length === 2 && typeof o[0] === "string" && isText(o[1]));
        if (!ok) p.push(`params[${i}].options debe ser una lista no vacía de [valor, etiqueta]`);
        else if (!q.options.some(([v]) => v === q.default)) p.push(`params[${i}].default no es una de las opciones`);
      } else if (q.kind === "number") {
        if (!isNum(q.default)) p.push(`params[${i}].default debe ser un número finito`);
      } else p.push(`params[${i}].kind debe ser select o number`);
    });
  }
  if (d.sfx !== null && !(d.sfx && typeof d.sfx === "object" && SFX_KINDS.includes(d.sfx.kind) && isNum(d.sfx.offset) && d.sfx.offset >= 0)) {
    p.push('"sfx" debe ser null o {kind: "whoosh" | "pop", offset >= 0}');
  }
  if (!AUDIO_KINDS.includes(d.audio)) p.push('"audio" debe ser crossfade o dry');
  if (typeof d.render !== "function") p.push('"render" debe ser una función');
  if (d.preview !== undefined && typeof d.preview !== "function") p.push('"preview" debe ser una función si existe');
  return p;
}

const files = await listFiles();
const mods = await Promise.all(files.map(async (f) => {
  try { return { f, d: (await import(`./${f}`)).default }; } catch (e) { return { f, e }; }
}));
for (const { f, d, e } of mods) {
  const problems = e ? [`no se pudo importar: ${e.message}`] : checkDescriptor(d);
  if (d && !problems.length && REG.has(d.name)) problems.push(`nombre duplicado: ${d.name}`);
  if (d && !problems.length && f !== `${d.name}.js`) problems.push(`el archivo debe llamarse ${d.name}.js`);
  if (problems.length) { LOAD_ERRORS.push({ file: f, problems }); console.error(`transitions/${f}: ${problems.join("; ")}`); continue; }
  REG.set(d.name, d);
}

// ---------- registry ----------
export const get = (name) => REG.get(name);
export const has = (name) => REG.has(name);
export const all = () => [...REG.values()];
export const names = () => [...REG.keys()];
/** [{category, items}] in the fixed CATEGORIES order; only categories that have items. */
export function byCategory() {
  return CATEGORIES
    .map((category) => ({ category, items: [...REG.values()].filter((d) => d.category === category) }))
    .filter((g) => g.items.length);
}

/**
 * Draws transition `name` at progress u (clamped to [0, 1]; non-finite u = 0). ctx is a 2D context of W x H.
 * from / to: the outgoing and incoming canvases. brand: { primary, ink, paper }. params: values by key. seed: number (deterministic noise).
 */
export function renderTransition(name, ctx, { from, to, u, W, H, brand, params, seed } = {}) {
  const d = REG.get(name);
  if (!d) throw new Error(`Transición desconocida: "${name}"`);
  const uu = Number.isFinite(u) ? clamp(u, 0, 1) : 0;
  return d.render(ctx, { from, to, u: uu, W, H, brand, params, seed });
}

/** Frame quantisation: frames = round(durSec * fps) (at least 1); the frame index is floor(elapsed * fps) clamped to [0, frames]. */
export function quantU(elapsedSec, durSec, fps = 30) {
  const frames = Math.max(1, Math.round((Number.isFinite(durSec) ? durSec : 0) * fps));
  const e = Number.isFinite(elapsedSec) ? elapsedSec : 0;
  const frame = clamp(Math.floor(e * fps + 1e-6), 0, frames);
  return { u: frame / frames, frame, frames };
}

/** Thumbnail / preview of `name` at u: descriptor.preview when present, else the synthetic sample scenes (browser only). */
export function renderPreview(name, ctx, { u = 0.5, W = 1080, H = 1920, brand = {}, params } = {}) {
  const d = REG.get(name);
  if (!d) throw new Error(`Transición desconocida: "${name}"`);
  const uu = Number.isFinite(u) ? clamp(u, 0, 1) : 0;
  if (d.preview) return d.preview(ctx, { u: uu, W, H, brand, params });
  const { from, to } = sampleFrames(W, H, brand);
  return d.render(ctx, { from, to, u: uu, W, H, brand, params, seed: 7 });
}
