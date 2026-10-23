// Caption helpers: the editable list of segments (captions.json override, or the automatic phrases of the voice words).
import { S, commitDoc, clone, newId, selectCaption } from "./store.js";
import { CAPTION_DEFAULTS, setSegText, fitSegWords, splitSeg, mergeSegs } from "./schema.js";

export const capStyle = () => ({ ...CAPTION_DEFAULTS, ...(S.captions?.style ?? {}) });
export const hasOverride = () => !!S.captions?.segments;
export const segments = () => S.captions?.segments ?? S.autoSegs;
export const segById = (id) => segments().find((s) => s.id === id) ?? null;

/** Automatic phrases of the voice words as editable segments (ids a0, a1, ...). */
export const autoFromPhrases = (phrases) => phrases.map((p, i) => ({
  id: `a${i}`, in: p.start, out: p.end, text: p.words.map((w) => w.text).join(" "),
  words: p.words.map((w) => ({ text: w.text, start: w.start, end: w.end }))
}));

/** The document with explicit segments (materialized from the automatic ones the first time something is edited). */
export function materialized() {
  const doc = clone(S.captions) ?? { style: {}, segments: null };
  doc.style ??= {};
  if (!doc.segments) doc.segments = clone(S.autoSegs);
  return doc;
}
export function editSeg(id, fn, key = null) {
  const doc = materialized();
  doc.segments = doc.segments.map((s) => (s.id === id ? fitSegWords(fn(s)) : s));
  commitDoc({ captions: doc }, key ?? `cap:${id}`, "captions");
}
export function setStyle(patch, key = "capstyle") {
  const doc = clone(S.captions) ?? { style: {}, segments: null };
  doc.style = { ...(doc.style ?? {}) };
  for (const [k, v] of Object.entries(patch)) { if (v === undefined || v === null) delete doc.style[k]; else doc.style[k] = v; }
  commitDoc({ captions: doc }, key, "captions");
}
export function setText(id, text) { editSeg(id, (s) => setSegText(s, text), `captext:${id}`); }
export function toggleHidden(id) { editSeg(id, (s) => { const c = { ...s }; if (c.hidden) delete c.hidden; else c.hidden = true; return c; }, null); }
export function split(id, t) {
  const doc = materialized();
  const i = doc.segments.findIndex((s) => s.id === id);
  const parts = i >= 0 ? splitSeg(doc.segments[i], t) : null;
  if (!parts) return false;
  parts[1].id = newId();
  doc.segments.splice(i, 1, ...parts);
  commitDoc({ captions: doc }, null, "captions");
  selectCaption(parts[1].id);
  return true;
}
export function mergeNext(id) {
  const doc = materialized();
  const i = doc.segments.findIndex((s) => s.id === id);
  if (i < 0 || i >= doc.segments.length - 1) return false;
  doc.segments.splice(i, 2, mergeSegs(doc.segments[i], doc.segments[i + 1]));
  commitDoc({ captions: doc }, null, "captions");
  return true;
}
export function removeSeg(id) {
  const doc = materialized();
  doc.segments = doc.segments.filter((s) => s.id !== id);
  commitDoc({ captions: doc }, null, "captions");
}
/** Back to automatic captions (drops the segment override, keeps the style). */
export function resetSegments() {
  const doc = clone(S.captions);
  if (!doc) return;
  doc.segments = null;
  commitDoc({ captions: doc.style && Object.keys(doc.style).length ? doc : null }, null, "captions");
}
/** Segment shown at time t (the latest one that started and hasn't ended + 0.3 s hold). */
export function segAt(t) {
  let hit = null;
  for (const s of segments()) if (!s.hidden && t >= s.in - 0.04 && t <= s.out + 0.3) hit = s;
  return hit;
}
