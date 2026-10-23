// "Efectos" lane: sound-effect markers from mergeSfx(S.events, S.sfx). Drag to move, click to listen + select, right-click menu,
// double-click on the empty lane to add one, drop a sound from the Efectos panel. Every edit goes through commit(..., {sfx}).
import * as SfxDoc from "/engine/sfx-doc.js";
import { S, on, commit, select, beginGesture, endGesture, cancelGesture, setTransient, toast, clone } from "./store.js";
import * as E from "./sfxedit.js";
import { M, soundList, soundBySrc, soundLabel, defaultSound } from "./media-store.js";
import { X } from "./extras.js";
import * as sfx from "./sfx.js";
import { setSfxProvider } from "./preview.js";
import { showMenu } from "./menus.js";
import { h } from "./dom.js";
import { section, slider, note } from "./ui.js";
import { hasType, readDrop, setDragPayload, dragPayload } from "./dnd.js";

export const pick = { src: null }; // the sound last chosen in the Efectos panel (used by double-click on the lane)
const r3 = (v) => Math.round(v * 1000) / 1000;

// ---------- merged events ----------
let memo = { ev: null, doc: undefined, out: [] };
export function merged() {
  if (memo.ev !== S.events || memo.doc !== S.sfx) memo = { ev: S.events, doc: S.sfx, out: SfxDoc.mergeSfx(S.events ?? [], S.sfx) };
  return memo.out;
}
export const eventByKey = (key) => merged().find((e) => e.key === key) ?? null;
const selEv = () => (S.selection.kind === "sfxev" ? eventByKey(S.selection.seg) : null);

// ---------- sounds ----------
export const srcOfItem = (it) => it.src ?? (it.url ? `path:${it.url.replace(/^\//, "")}` : null);
function urlOfSrc(src) {
  const s = soundBySrc(src);
  if (s) return s;
  if (src?.startsWith("path:")) {
    const it = M.items.find((i) => i.src === src || srcOfItem(i) === src);
    return { src, url: it?.url ?? `/${src.slice(5)}`, gainDb: SfxDoc.PATH_DEFAULT_GAIN_DB, anchor: "onset", label: it?.name };
  }
  return null;
}
/** What the preview plays for an event: {url, gainDb (default level + the event's trim), anchor}. legacyUrl(ev) = state.json replace (old comps). */
export function resolve(ev, legacyUrl = null) {
  const kind = X.sfxKit?.kinds?.[ev.type];
  let snd = ev.src ? urlOfSrc(ev.src) : null;
  if (!snd && ev.auto) {
    const lu = legacyUrl?.({ type: ev.type, t: ev.baseT });
    if (lu) return { url: lu, gainDb: SfxDoc.PATH_DEFAULT_GAIN_DB + ev.gainDb, anchor: "onset" };
    if (kind) snd = { url: kind.url, gainDb: kind.gain_db ?? -22, anchor: kind.anchor ?? "onset" };
  }
  if (!snd?.url) return null;
  return { url: snd.url, gainDb: snd.gainDb + (ev.gainDb ?? 0), anchor: snd.anchor };
}
setSfxProvider({ events: merged, resolve });
export function nameOf(ev) {
  if (ev.label) return ev.label;
  if (ev.src) return soundLabel(ev.src);
  const k = { pop: "Pop", whoosh: "Whoosh", notify: "Aviso", click: "Clic" }[ev.type];
  return k ?? "Efecto";
}
export const audition = (src, extraDb = 0) => { const r = urlOfSrc(src); if (r?.url) sfx.auditionUrl(r.url, r.gainDb + extraDb); };
export function auditionEvent(ev) {
  const r = resolve(ev, null);
  if (r?.url) sfx.auditionUrl(r.url, r.gainDb + (X.audio?.sfxDb ?? 0));
}
const preloadAll = () => sfx.preload(soundList().map((s) => s.url));
on("media", preloadAll); on("extras", preloadAll);

// ---------- edits ----------
const put = (doc, key = null) => commit(null, key, "sfx", { sfx: doc });
export function addAt(src, t, label) {
  const snd = urlOfSrc(src) ?? defaultSound();
  if (!snd) { toast("Todavía no hay sonidos disponibles"); return null; }
  const { doc, id } = E.addEvent(S.sfx, { t: Math.min(Math.max(0, t), S.duration || t), src: snd.src ?? src, label });
  put(doc);
  select({ kind: "sfxev", seg: id });
  audition(snd.src ?? src);
  return id;
}
export const addAtCursor = (src) => addAt(src ?? pick.src ?? defaultSound()?.src, S.t);
export const changeSound = (ev, src) => { put(E.setSrc(S.sfx, ev, src)); audition(src, ev.gainDb); };
export const setVolume = (ev, db) => put(E.setGain(S.sfx, ev, db), `sfx:${ev.key}:gain`);
export const setMuted = (ev, m) => put(E.setMuted(S.sfx, ev, m));
export function remove(ev = selEv()) {
  if (!ev) return;
  put(E.deleteEvent(S.sfx, ev));
  select({ kind: "track", track: "sfx" });
}

// ---------- lane ----------
const SPK = '<svg viewBox="0 0 16 16" width="12" height="12"><path d="M2 6h3l4-3v10L5 10H2z" fill="currentColor"/><path d="M11 5.5c1.3 1.3 1.3 3.7 0 5" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>';
export function buildLane(lane, tl) {
  const a = X.audio;
  const off = a && !a.sfx.enabled;
  const mark = h("div", { class: "dropmark fx", hidden: true });
  lane.append(mark);
  const timeAt = (e) => tl.clampT((e.clientX - tl.inner.getBoundingClientRect().left) / tl.pps());
  for (const ev of merged()) {
    const legacyMuted = ev.auto && a?.sfx.mute.some((m) => m.type === ev.type && Math.abs(m.t - ev.baseT) < 0.03);
    const muted = ev.muted || legacyMuted || off;
    const sel = S.selection.kind === "sfxev" && S.selection.seg === ev.key;
    const b = h("div", { class: `blk fxm${muted ? " muted" : ""}${sel ? " sel" : ""}${ev.added ? " added" : ""}`, style: { left: `${Math.max(0, tl.px(ev.t) - 11)}px`, width: "22px", top: "5px", height: "20px" },
      title: `${nameOf(ev)} · ${ev.t.toFixed(2)} s${muted ? " (silenciado)" : ""}\nclic: escuchar · arrastra: mover (Alt: sin imán) · clic derecho: más opciones` });
    b.innerHTML = SPK;
    b.addEventListener("pointerdown", (e) => down(e, ev, tl));
    b.addEventListener("dblclick", (e) => e.stopPropagation());
    b.addEventListener("contextmenu", (e) => { e.preventDefault(); e.stopPropagation(); select({ kind: "sfxev", seg: ev.key }); eventMenu(e, ev); });
    lane.append(b);
  }
  lane.addEventListener("dblclick", (e) => {
    if (e.target.closest(".blk")) return;
    addAt(pick.src ?? defaultSound()?.src, timeAt(e));
  });
  lane.addEventListener("dragover", (e) => {
    if (!hasType(e, "sfx")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    mark.hidden = false; mark.style.left = `${tl.px(timeAt(e))}px`;
  });
  lane.addEventListener("dragleave", (e) => { if (!lane.contains(e.relatedTarget)) mark.hidden = true; });
  lane.addEventListener("drop", (e) => {
    if (!hasType(e, "sfx")) return;
    e.preventDefault(); mark.hidden = true;
    const p = readDrop(e, "sfx");
    setDragPayload(null);
    if (p?.src) addAt(p.src, timeAt(e), undefined);
  });
}

function down(e, ev, tl) {
  if (e.button !== 0) return;
  e.stopPropagation();
  select({ kind: "sfxev", seg: ev.key });
  auditionEvent(ev);
  const x0 = e.clientX;
  const doc0 = S.sfx;
  let moved = false;
  const mv = (m) => {
    if (!moved && Math.abs(m.clientX - x0) < 3) return;
    if (!moved) { moved = true; beginGesture(); }
    const t0 = tl.clampT(ev.t + (m.clientX - x0) / tl.pps());
    const t = tl.snapT(t0, m, [ev.key]);
    setTransient(undefined, "gesture", { sfx: E.moveEvent(doc0, ev, r3(t)) });
  };
  const up = () => {
    window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up);
    tl.hideSnap();
    if (moved) endGesture(); else cancelGesture();
  };
  window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up);
  e.preventDefault();
}

function eventMenu(e, ev) {
  showMenu(e.clientX, e.clientY, [
    { label: "Cambiar sonido…", onClick: () => select({ kind: "sfxev", seg: ev.key }) },
    ev.added ? null : { label: ev.muted ? "Activar" : "Silenciar", onClick: () => setMuted(ev, !ev.muted) },
    "-",
    { label: "Borrar", hint: "Supr", danger: true, onClick: () => remove(ev) }
  ].filter(Boolean));
}

// ---------- inspector ----------
export function panel() {
  const ev = selEv();
  if (!ev) return [h("h2", {}, "Efecto de sonido"), note("Ese efecto ya no existe.")];
  const out = [h("h2", {}, "Efecto de sonido", h("span", { class: "muted tiny" }, ` ${ev.t.toFixed(2)} s`))];
  out.push(h("div", { class: "kv fxkv" }, h("span", {}, "Sonido"), h("b", {}, nameOf(ev)), h("span", {}, "Origen"), h("b", {}, ev.added ? "Agregado por ti" : "Automático (de un elemento de motion)")));
  out.push(h("div", { class: "btnrow", style: { marginTop: "8px" } },
    h("button", { title: "Escuchar este efecto", onclick: () => auditionEvent(ev) }, "▶ Escuchar"),
    ev.added ? null : h("button", { title: ev.muted ? "Volver a activar este efecto" : "Que no suene este efecto", onclick: () => setMuted(ev, !ev.muted) }, ev.muted ? "Activar" : "Silenciar"),
    h("button", { class: "danger", title: "Quitar este efecto (Supr)", onclick: () => remove(ev) }, "Borrar")));
  out.push(section("Volumen", [
    slider({ label: "Volumen", value: ev.gainDb, min: SfxDoc.GAIN_MIN, max: SfxDoc.GAIN_MAX, step: 0.5, unit: "dB (0 = como viene)", onInput: (v) => setVolume(ev, v ?? 0) }),
    note("Sube o baja solo este efecto. 0 es su volumen normal.")
  ], { key: "fx-vol" }));
  const cur = ev.src ?? (soundBySrc(`kit:${ev.type}`) ? `kit:${ev.type}` : null);
  const groups = new Map();
  for (const s of soundList()) (groups.get(s.group) ?? groups.set(s.group, []).get(s.group)).push(s);
  const body = [];
  for (const [g, list] of groups) {
    body.push(h("div", { class: "fxgrp" }, g));
    for (const s of list) body.push(h("button", { class: `fxpick${s.src === cur ? " on" : ""}`, title: `Usar “${s.label}” en este efecto`, onclick: () => changeSound(ev, s.src) }, s.label));
  }
  out.push(section("Cambiar sonido", body.length ? body : [note("Todavía no hay sonidos disponibles.")], { key: "fx-snd", open: false }));
  if (ev.auto) out.push(note("Si lo mueves, queda fijo en ese momento aunque cambies el elemento de motion."));
  return out;
}

// an undo/redo can remove the selected marker: fall back to the lane's inspector
on("motion", () => { if (S.selection.kind === "sfxev" && !eventByKey(S.selection.seg)) select({ kind: "track", track: "sfx" }); });
