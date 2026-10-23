// SFX document (<comp>/sfx.json): the user's edits on top of the sound effects the motion elements produce automatically.
// ONE pure module (no DOM, no node APIs) shared by the Estudio client and node tests; scripts/mix.py mirrors mergeSfx() in Python
// (scripts/test_mix_sfx_doc.py keeps both honest).
//
//   doc = { version: 1,
//           events: { "<eventKey>": { t?: <s>, muted?: bool, src?: "<src>", gainDb?: <dB> } },   // overrides of automatic events
//           added:  [ { id, t, src, gainDb?, label? } ] }                                         // sounds the user placed by hand
//
// eventKey of an automatic event = ev.key (engine/brand-layer.js motionEvents: "<element id | #index>:<kind>[:<item>]"), or
// "<type>@<t to 2 decimals>" for events that carry no key. Overrides of keys that no longer exist are ignored but kept in the doc
// (the element may come back).
//
// src forms:  "lib:<id>"   a sound of assets/sfx/lib/index.json
//             "kit:<pop|whoosh|notify|click>"   the built-in UI sounds (assets/sfx/ui/<name>.wav)
//             "path:<file inside the run>"   uploaded/generated audio, RUN-relative (e.g. "path:assets/media/audio-ab12cd34.wav")
// gainDb = trim in dB relative to the sound's own default level (lib index gain_db; kit: ui-map.json gain; path: -14), -24..+12.
export const SFX_VERSION = 1;
export const GAIN_MIN = -24;
export const GAIN_MAX = 12;
export const KIT_SOUNDS = ["pop", "whoosh", "notify", "click"];
export const PATH_DEFAULT_GAIN_DB = -14; // same level mix.py always gave to a replaced event

export const emptyDoc = () => ({ version: SFX_VERSION, events: {}, added: [] });

/** Stable identity of an automatic event. */
export const evKey = (ev) => (typeof ev?.key === "string" && ev.key ? ev.key : `${ev?.type}@${Number(ev?.t).toFixed(2)}`);

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);

/** Parse a src string -> {form:"lib"|"kit"|"path", id|name|path} or null when it is not a valid src. */
export function parseSrc(src) {
  if (typeof src !== "string") return null;
  const i = src.indexOf(":");
  if (i < 0) return null;
  const form = src.slice(0, i), rest = src.slice(i + 1);
  if (form === "lib") return /^[A-Za-z0-9_-]+$/.test(rest) ? { form, id: rest } : null;
  if (form === "kit") return KIT_SOUNDS.includes(rest) ? { form, name: rest } : null;
  if (form === "path") {
    if (!rest || rest.length > 400 || /[\0\\]/.test(rest) || rest.startsWith("/") || /^[A-Za-z]:/.test(rest) || rest.includes("://")) return null;
    const parts = rest.split("/");
    if (parts.some((p) => !p || p === "." || p === ".." || p.startsWith("."))) return null; // no escapes, no dotfiles
    return { form, path: rest };
  }
  return null;
}

const SRC_ERR = (where) => `${where}: el sonido no es válido`;

/** Validates a whole sfx.json. @returns {string|null} a Spanish error message, or null when it is fine. */
export function checkSfxDoc(d) {
  if (!isObj(d)) return "El archivo de sonidos no es válido";
  for (const k of Object.keys(d)) if (!["version", "events", "added"].includes(k)) return `Campo desconocido en los sonidos: "${k}"`;
  if (d.version !== undefined && d.version !== SFX_VERSION) return "Versión de sonidos no compatible";
  if (d.events !== undefined) {
    if (!isObj(d.events)) return "Los ajustes de sonidos automáticos no son válidos";
    for (const [key, o] of Object.entries(d.events)) {
      const where = `Sonido "${key}"`;
      if (!isObj(o)) return `${where}: ajuste no válido`;
      for (const k of Object.keys(o)) if (!["t", "muted", "src", "gainDb"].includes(k)) return `${where}: campo desconocido "${k}"`;
      if (o.t !== undefined && (!isNum(o.t) || o.t < 0)) return `${where}: el tiempo debe ser un número desde 0`;
      if (o.muted !== undefined && typeof o.muted !== "boolean") return `${where}: "muted" debe ser verdadero o falso`;
      if (o.src !== undefined && !parseSrc(o.src)) return SRC_ERR(where);
      if (o.gainDb !== undefined && (!isNum(o.gainDb) || o.gainDb < GAIN_MIN || o.gainDb > GAIN_MAX)) return `${where}: el volumen debe estar entre ${GAIN_MIN} y +${GAIN_MAX} dB`;
    }
  }
  if (d.added !== undefined) {
    if (!Array.isArray(d.added)) return "La lista de sonidos agregados no es válida";
    const seen = new Set();
    for (const [i, o] of d.added.entries()) {
      const where = `Sonido agregado ${i + 1}`;
      if (!isObj(o)) return `${where}: ajuste no válido`;
      for (const k of Object.keys(o)) if (!["id", "t", "src", "gainDb", "label"].includes(k)) return `${where}: campo desconocido "${k}"`;
      if (typeof o.id !== "string" || !o.id || o.id.length > 80) return `${where}: falta el identificador`;
      if (seen.has(o.id)) return `${where}: identificador repetido`;
      seen.add(o.id);
      if (!isNum(o.t) || o.t < 0) return `${where}: el tiempo debe ser un número desde 0`;
      if (!parseSrc(o.src)) return SRC_ERR(where);
      if (o.gainDb !== undefined && (!isNum(o.gainDb) || o.gainDb < GAIN_MIN || o.gainDb > GAIN_MAX)) return `${where}: el volumen debe estar entre ${GAIN_MIN} y +${GAIN_MAX} dB`;
      if (o.label !== undefined && (typeof o.label !== "string" || o.label.length > 120)) return `${where}: la etiqueta no es válida`;
    }
  }
  return null;
}

/** Automatic events (events.json / MOTION_EVENTS) + overrides + added sounds -> the full sorted list the editor shows and mix.py plays.
 *  @returns {{key, id?, t, baseT, type, x, src:string|null, gainDb, muted, added, auto, label?}[]} (muted ones included, flagged) */
export function mergeSfx(events, doc) {
  const d = doc ?? emptyDoc();
  const ov = isObj(d.events) ? d.events : {};
  const out = [];
  for (const ev of events ?? []) {
    const key = evKey(ev);
    const o = isObj(ov[key]) ? ov[key] : {};
    const row = { key, t: isNum(o.t) ? o.t : ev.t, baseT: ev.t, type: ev.type ?? ev.kind, x: ev.x ?? 0, src: typeof o.src === "string" ? o.src : null, gainDb: isNum(o.gainDb) ? o.gainDb : 0, muted: o.muted === true, added: false, auto: true };
    if (ev.label) row.label = ev.label;
    out.push(row);
  }
  for (const a of Array.isArray(d.added) ? d.added : []) {
    const row = { key: a.id, id: a.id, t: a.t, baseT: a.t, type: "custom", x: 0, src: a.src, gainDb: isNum(a.gainDb) ? a.gainDb : 0, muted: false, added: true, auto: false };
    if (a.label) row.label = a.label;
    out.push(row);
  }
  return out.map((r, i) => [r, i]).sort((p, q) => p[0].t - q[0].t || p[1] - q[1]).map((p) => p[0]);
}
