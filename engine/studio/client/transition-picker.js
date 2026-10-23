// Transition picker: pure logic (no DOM, no registry import: callers pass the registry in, so this module has no side effects at import).
// Used by edl-ui.js, panel-transitions.js, transition-ui.js and transition-picker.test.mjs.
// Legacy names (cut, fade, dipBlack, dipWhite) keep their labels and their shape {type, dur}; registry names get a clamped dur and known params only.

export const LEGACY = ["cut", "fade", "dipBlack", "dipWhite"];
export const BASIC_LABEL = { cut: "Corte seco", fade: "Fundido", dipBlack: "A negro", dipWhite: "A blanco" };
const BASIC_DESC = {
  cut: "Cambio directo de una toma a otra",
  fade: "Una toma se disuelve en la siguiente",
  dipBlack: "Se oscurece y aparece la siguiente",
  dipWhite: "Se aclara y aparece la siguiente"
};
// First segment: the only legacy choices that make sense (a fade-in from a colour, no clip before it).
const FIRST = [["cut", "Sin fundido"], ["dipBlack", "Desde negro"], ["dipWhite", "Desde blanco"]];
export const DUR_STEP = 0.05;
export const THUMB_FPS = 30;
export const THUMB_FRAMES = 45; // one thumbnail loop = 1.5 s at 30 fps; frame 0 = u 0, last frame = u 1

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const isNum = (x) => typeof x === "number" && Number.isFinite(x);

/** Groups for the picker: "Básicos" first, then the registry categories in byCategory() order. First segment: the entry choices only. */
export function groups(registry, { first = false } = {}) {
  if (first) return [{ title: "Básicos", items: FIRST.map(([type, label]) => ({ type, label, description: "", legacy: true })) }];
  const basics = { title: "Básicos", items: LEGACY.map((type) => ({ type, label: BASIC_LABEL[type], description: BASIC_DESC[type], legacy: true })) };
  // cut.js is in the registry too, but "cut" is the legacy no-transition choice: it is listed once, in Básicos
  const cats = registry.byCategory()
    .map((g) => ({
      title: g.category,
      items: g.items.filter((d) => !LEGACY.includes(d.name)).map((d) => ({ type: d.name, label: d.label, description: d.description, legacy: false, descriptor: d }))
    }))
    .filter((g) => g.items.length);
  return [basics, ...cats];
}

/** The registry descriptor of a transition name, or null for the legacy names and the cut (cut.js is never a registry choice). */
export const descriptorFor = (registry, type) => (LEGACY.includes(type) ? null : registry.get(type) ?? null);

/** Flat-per-group options for a grouped <select>: [{label, options: [[type, label], ...]}]. */
export const selectGroups = (gs) => gs.map((g) => ({ label: g.title, options: g.items.map((it) => [it.type, it.label]) }));

/** Slider range of a number param: min/max/step (defaults when the descriptor omits them). */
export function numberRange(q) {
  const def = isNum(q.default) ? q.default : 0;
  return {
    min: isNum(q.min) ? q.min : Math.min(0, def),
    max: isNum(q.max) ? q.max : Math.max(1, def * 2),
    step: isNum(q.step) && q.step > 0 ? q.step : 0.05
  };
}

/** Duration for a registry transition: missing -> defaultDur; snapped to 0.05 s and kept inside [minDur, maxDur]. */
export function clampDur(d, dur) {
  const v = isNum(dur) ? dur : d.defaultDur;
  const snapped = Math.round(v / DUR_STEP) * DUR_STEP;
  return Math.round(clamp(snapped, d.minDur, d.maxDur) * 1000) / 1000;
}

/** Only the keys the descriptor declares; select values must be one of its options, numbers are clamped to the slider range. */
export function cleanParams(defs, given) {
  const out = {};
  for (const q of defs ?? []) {
    const v = given?.[q.key];
    if (q.kind === "select") {
      if (Array.isArray(q.options) && q.options.some(([val]) => val === v)) out[q.key] = v;
    } else if (q.kind === "number" && isNum(v)) {
      const r = numberRange(q);
      out[q.key] = clamp(v, r.min, r.max);
    }
  }
  return out;
}

/**
 * The transition object stored on a segment, or null for a cut.
 * desc: the registry descriptor, or null for a legacy name. Registry: {type, dur (clamped), params (known keys; omitted when empty)}.
 * Legacy: {type, dur} exactly as before (the 0.1..1.5 slider stays in the UI).
 */
export function buildTransition(desc, { type, dur, params } = {}) {
  if (type === "cut") return null;
  if (!desc) {
    if (!LEGACY.includes(type)) return null;
    return { type, dur: isNum(dur) ? dur : 0.4 };
  }
  const tr = { type, dur: clampDur(desc, dur) };
  const p = cleanParams(desc.params, params);
  if (Object.keys(p).length) tr.params = p;
  return tr;
}

/** Frame index (0 .. THUMB_FRAMES-1) of a thumbnail loop at `elapsedMs` since it started. Cycles every THUMB_FRAMES frames. */
export function thumbFrame(elapsedMs, frames = THUMB_FRAMES, fps = THUMB_FPS) {
  const e = isNum(elapsedMs) && elapsedMs > 0 ? elapsedMs : 0;
  return Math.floor((e * fps) / 1000) % frames;
}

/** The progress u drawn for thumbnail frame `frame`: 0 at the first frame, 1 at the last (out-of-range frames are clamped). */
export function thumbU(frame, frames = THUMB_FRAMES) {
  const f = clamp(isNum(frame) ? Math.floor(frame) : 0, 0, frames - 1);
  return f / (frames - 1);
}

/** Inverse of thumbU: the nearest frame index for progress u (clamped to [0, 1]; non-finite u = 0). */
export function uToFrame(u, frames = THUMB_FRAMES) {
  const x = isNum(u) ? clamp(u, 0, 1) : 0;
  return Math.round(x * (frames - 1));
}
