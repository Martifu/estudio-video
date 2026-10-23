// Studio client state: the three editable documents (motion list, captions override, platform zones), selection, time, undo/redo.
// Tiny pub/sub; modules subscribe by topic.
import { validateElement, zonesOf } from "./schema.js";

export const S = {
  comp: "", run: "", compUrl: "",
  versions: { motion: null, captions: null, zones: null, edl: null, logo: null, cta: null, sfx: null },
  motion: [], // source elements (what motion.json holds, plus stable `id`s)
  captions: null, // {style:{...}, segments:[...]|null} or null = no captions.json (everything automatic)
  zones: null, // {top,bottom,left,right,preset?} or null = default zones
  logo: null, // logo.json {hidden,corner,x,y,w,h,variant,src,opacity,in,out,enter,fadeDur,scrim,shadow,autoHide} or null = brand default
  ctaDoc: null, // cta.json {enabled,title,subtitle,dur,logoVariant,bg} or null = the --cta* flags (S.cta is the comp's CONFIG.cta)
  sfx: null, // sfx.json {version:1, events:{<key>:{t?,muted?,src?,gainDb?}}, added:[{id,t,src,gainDb?,label?}]} or null = no overrides (engine/sfx-doc.js)
  edl: null, // engine/edl.js document {segments:[...]} or null = the clips back to back (no edl.json)
  saved: { motion: "[]", captions: "null", zones: "null", edl: "null", logo: "null", cta: "null", sfx: "null" },
  idsPending: false,
  selection: { kind: "none", ids: [], seg: null, track: null }, // kinds: none | element | caption | track | zones | event
  t: 0, playing: false, duration: 0, cta: null, words: [], audio: [],
  plan: null, events: [], autoSegs: [], capRect: null,
  guides: true, commentMode: false, zoomPps: 40, fitted: true,
  layerOff: {}, locked: {}, // timeline track toggles (preview-only): {motion:true,...}
  wordRange: null, undo: [], redo: [], comments: [], history: [], issues: {}, studio: null, scale: 1
};

const subs = {};
export const on = (topic, fn) => { (subs[topic] ??= new Set()).add(fn); return () => subs[topic].delete(fn); };
export const emit = (topic, source) => { for (const fn of subs[topic] ?? []) fn(source); };

export const clone = (o) => (o === undefined ? undefined : JSON.parse(JSON.stringify(o)));
export const json = (m) => JSON.stringify(m);
const snap = () => json({ m: S.motion, c: S.captions, z: S.zones, e: S.edl, l: S.logo, k: S.ctaDoc, x: S.sfx });
export const isDirty = () => json(S.motion) !== S.saved.motion || json(S.captions) !== S.saved.captions || json(S.zones) !== S.saved.zones || json(S.edl) !== S.saved.edl || json(S.logo) !== S.saved.logo || json(S.ctaDoc) !== S.saved.cta || json(S.sfx) !== S.saved.sfx;
export const dirtyDocs = () => ({ motion: json(S.motion) !== S.saved.motion, captions: json(S.captions) !== S.saved.captions, zones: json(S.zones) !== S.saved.zones, edl: json(S.edl) !== S.saved.edl, logo: json(S.logo) !== S.saved.logo, cta: json(S.ctaDoc) !== S.saved.cta, sfx: json(S.sfx) !== S.saved.sfx });

let idCounter = 0;
export const newId = () => `e${Date.now().toString(36)}${(idCounter += 1)}`;
export function ensureIds(list) {
  let added = false;
  for (const el of list) if (!el.id) { el.id = newId(); added = true; }
  return added;
}

export const indexOf = (id) => S.motion.findIndex((e) => e.id === id);
export const byId = (id) => S.motion.find((e) => e.id === id) ?? null;
export const selIds = () => (S.selection.kind === "element" ? S.selection.ids : []);
export const selected = () => (S.selection.kind === "element" ? byId(S.selection.ids[0]) : null);
export const isSelected = (id) => S.selection.kind === "element" && S.selection.ids.includes(id);
export const effZones = () => zonesOf(S.zones);

export function revalidate() {
  const total = S.cta?.at ?? S.duration ?? Infinity;
  S.issues = {};
  S.motion.forEach((el, i) => { S.issues[el.id] = validateElement(el, i, total || Infinity); });
}

// ---------- history ----------
let lastKey = null, lastKeyAt = 0;
function apply(snapJson) {
  const d = JSON.parse(snapJson);
  S.motion = d.m; S.captions = d.c; S.zones = d.z; S.edl = d.e ?? null; S.logo = d.l ?? null; S.ctaDoc = d.k ?? null; S.sfx = d.x ?? null;
  if (S.selection.kind === "segment" && !S.edl?.segments.some((x) => x.id === S.selection.seg)) S.selection = { kind: "none", ids: [], seg: null, track: null };
  S.selection.ids = S.selection.ids.filter((id) => byId(id));
  revalidate();
}
/** Replace the motion list (and optionally captions/zones) as ONE undoable step. Same `key` within 800 ms coalesces. */
export function commit(nextMotion, key = null, source = "app", docs = {}) {
  const before = snap();
  const next = { m: nextMotion ?? S.motion, c: "captions" in docs ? docs.captions : S.captions, z: "zones" in docs ? docs.zones : S.zones, e: "edl" in docs ? docs.edl : S.edl, l: "logo" in docs ? docs.logo : S.logo, k: "cta" in docs ? docs.cta : S.ctaDoc, x: "sfx" in docs ? docs.sfx : S.sfx };
  if (json(next) === before) return;
  const now = performance.now();
  if (!(key && key === lastKey && now - lastKeyAt < 800)) S.undo.push(before);
  if (S.undo.length > 200) S.undo.shift();
  lastKey = key; lastKeyAt = now;
  S.redo = [];
  S.motion = next.m; S.captions = next.c; S.zones = next.z; S.edl = next.e; S.logo = next.l; S.ctaDoc = next.k; S.sfx = next.x;
  revalidate();
  emit("motion", source);
}
export const commitDoc = (docs, key = null, source = "app") => commit(S.motion, key, source, docs);

/** Live updates during a drag: set without history; endGesture() pushes the gesture's start state once. */
export function setTransient(nextMotion, source = "gesture", docs = {}) {
  S.motion = nextMotion ?? S.motion;
  if ("captions" in docs) S.captions = docs.captions;
  if ("zones" in docs) S.zones = docs.zones;
  if ("edl" in docs) S.edl = docs.edl;
  if ("logo" in docs) S.logo = docs.logo;
  if ("cta" in docs) S.ctaDoc = docs.cta;
  if ("sfx" in docs) S.sfx = docs.sfx;
  revalidate();
  emit("motion", source);
}
let gestureBefore = null;
export const beginGesture = () => { gestureBefore = snap(); };
export function endGesture() {
  if (gestureBefore !== null && gestureBefore !== snap()) { S.undo.push(gestureBefore); S.redo = []; lastKey = null; }
  gestureBefore = null;
  emit("motion", "gesture-end");
}
export const cancelGesture = () => { gestureBefore = null; };

export function undo() {
  if (!S.undo.length) return;
  S.redo.push(snap());
  apply(S.undo.pop());
  lastKey = null;
  emit("motion", "undo");
}
export function redo() {
  if (!S.redo.length) return;
  S.undo.push(snap());
  apply(S.redo.pop());
  lastKey = null;
  emit("motion", "undo");
}

export function load({ motion, version, captions, zones, capVersion, zonesVersion, edl = null, edlVersion = null, logo = null, logoVersion = null, cta = null, ctaVersion = null, sfx = null, sfxVersion = null }) {
  const list = clone(motion);
  S.idsPending = ensureIds(list);
  S.motion = list;
  S.captions = clone(captions ?? null);
  S.zones = clone(zones ?? null);
  S.edl = clone(edl ?? null);
  S.logo = clone(logo ?? null);
  S.ctaDoc = clone(cta ?? null);
  S.sfx = clone(sfx ?? null);
  S.saved = { motion: json(list), captions: json(S.captions), zones: json(S.zones), edl: json(S.edl), logo: json(S.logo), cta: json(S.ctaDoc), sfx: json(S.sfx) };
  S.versions = { motion: version, captions: capVersion, zones: zonesVersion, edl: edlVersion, logo: logoVersion, cta: ctaVersion, sfx: sfxVersion };
  S.undo = []; S.redo = [];
  S.selection.ids = S.selection.ids.filter((id) => byId(id));
  if (S.selection.kind === "element" && !S.selection.ids.length) S.selection = { kind: "none", ids: [], seg: null, track: null };
  revalidate();
  emit("motion", "load");
}

// ---------- selection ----------
export function select(sel) {
  S.selection = { kind: "none", ids: [], seg: null, track: null, ...sel };
  emit("selection");
}
export const clearSel = () => select({});
export function selectElement(id, additive = false) {
  if (!id) return clearSel();
  if (additive && S.selection.kind === "element") {
    const ids = S.selection.ids.includes(id) ? S.selection.ids.filter((x) => x !== id) : [...S.selection.ids, id];
    return select(ids.length ? { kind: "element", ids } : {});
  }
  if (S.selection.kind === "element" && S.selection.ids.length === 1 && S.selection.ids[0] === id) return;
  select({ kind: "element", ids: [id] });
}
export const selectCaption = (seg) => select({ kind: "caption", seg });
export const selectTrack = (track) => select({ kind: "track", track });
export const selectZones = () => select({ kind: "zones" });
export const selectLogo = () => select({ kind: "logo" });
export const selectCta = () => select({ kind: "cta" });
export const selectSegment = (seg) => select({ kind: "segment", seg });

export function setTime(t, source = "app") {
  S.t = Math.max(0, Math.min(t, S.duration || t));
  emit("time", source);
}
export const replaceEl = (id, fn) => S.motion.map((e) => (e.id === id ? fn(clone(e)) : e));
export const fmt = (t) => t.toFixed(2);
export const mmss = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, "0")}`;
export const toast = (msg, ms = 2200) => {
  const el = document.getElementById("toast");
  el.textContent = msg; el.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { el.hidden = true; }, ms);
};
