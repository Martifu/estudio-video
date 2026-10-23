// Pure helpers that turn an edit of a sound-effect marker into a new sfx.json document (no DOM, no imports: node tests load it).
// `ev` is a row of mergeSfx(): {key, id?, t, baseT, src, gainDb, muted, added, auto}. Every function returns a NEW doc, or null when the
// document ends up empty (an empty doc is the same as no sfx.json).
const r3 = (v) => Math.round(v * 1000) / 1000;
const clone = (o) => JSON.parse(JSON.stringify(o));
const blank = () => ({ version: 1, events: {}, added: [] });

/** Drops empty overrides; returns null when nothing is left. */
export function tidy(doc) {
  if (!doc) return null;
  const d = clone(doc);
  d.events ??= {};
  d.added ??= [];
  for (const [k, o] of Object.entries(d.events)) {
    for (const f of Object.keys(o)) if (o[f] === undefined || o[f] === null || (f === "muted" && o[f] === false) || (f === "gainDb" && o[f] === 0)) delete o[f];
    if (!Object.keys(o).length) delete d.events[k];
  }
  return !Object.keys(d.events).length && !d.added.length ? null : d;
}

function patch(doc, ev, fields) {
  const d = doc ? clone(doc) : blank();
  d.events ??= {}; d.added ??= [];
  if (ev.added) {
    const a = d.added.find((x) => x.id === ev.id);
    if (a) for (const [k, v] of Object.entries(fields)) { if (v === undefined || v === null) delete a[k]; else a[k] = v; }
  } else d.events[ev.key] = { ...(d.events[ev.key] ?? {}), ...fields };
  return tidy(d);
}

/** Move a marker to output time t (auto events keep their element: only `t` is overridden; back on its own time = no override). */
export function moveEvent(doc, ev, t) {
  const tt = Math.max(0, r3(t));
  if (ev.added) return patch(doc, ev, { t: tt });
  return patch(doc, ev, { t: Math.abs(tt - ev.baseT) < 0.005 ? null : tt });
}
export const setMuted = (doc, ev, muted) => (ev.added ? doc : patch(doc, ev, { muted: muted ? true : null }));
export const setSrc = (doc, ev, src) => patch(doc, ev, { src });
export const setGain = (doc, ev, gainDb) => patch(doc, ev, { gainDb: Math.max(-24, Math.min(12, Math.round(gainDb * 2) / 2)) });
/** "Borrar": an automatic event (made by a motion element) is silenced, a hand-placed one is removed. */
export function deleteEvent(doc, ev) {
  if (!ev.added) return patch(doc, ev, { muted: true });
  const d = clone(doc ?? blank());
  d.added = (d.added ?? []).filter((x) => x.id !== ev.id);
  return tidy(d);
}
let seq = 0;
export const newAddedId = () => `a${Date.now().toString(36)}${(seq += 1)}`;
/** Add a sound placed by hand. Returns {doc, id}. */
export function addEvent(doc, { t, src, gainDb = 0, label }) {
  const d = doc ? clone(doc) : blank();
  d.added ??= []; d.events ??= {};
  const id = newAddedId();
  const a = { id, t: Math.max(0, r3(t)), src };
  if (gainDb) a.gainDb = gainDb;
  if (label) a.label = label;
  d.added.push(a);
  return { doc: d, id };
}
