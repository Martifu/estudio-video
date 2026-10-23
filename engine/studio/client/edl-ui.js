// Estudio: cutting the video (engine/edl.js). Segments on the Video track (trim edges, drag to reorder, split, delete, transitions),
// the "Material" list of available clips, the segment inspector, and the ripple of motion elements + caption overrides through the cut.
// The pure maths lives in /engine/edl.js (shared with the comp, so the preview and the render cut identically).
import * as Edl from "/engine/edl.js";
import { S, commit, clone, toast, selectSegment, select, beginGesture, endGesture, cancelGesture, setTransient, emit } from "./store.js";
import { dropPoint, insertAtDrop } from "./drop.js";
import { dragPayload, hasType, readDrop, setDragPayload, MIME } from "./dnd.js";
import { windowOf, shiftTime } from "./schema.js";
import { showMenu } from "./menus.js";
import { seek } from "./preview.js";
import { h } from "./dom.js";
import { section, field, slider, numberBox, selectBox, note } from "./ui.js";
import * as TR from "/engine/transitions/index.js";
import { BASIC_LABEL, buildTransition, selectGroups, numberRange, descriptorFor } from "./transition-picker.js";
import { pickerGroups, openPicker, groupedSelect, escuchar } from "./transition-ui.js";

const r3 = (v) => Math.round(v * 1000) / 1000;
export const drag = { active: false }; // true while a trim/reorder gesture runs (the timeline keeps its zoom)

// ---------- the cut being edited ----------
export const bin = () => S.studio?.bin ?? [];
export const binDur = (name) => bin().find((c) => c.name === name)?.dur ?? Infinity;
let idCache = { key: "", edl: null };
/** The EDL on screen: S.edl, or the clips back to back while the comp has no edl.json yet (identity cut). */
export function current() {
  if (S.edl) return S.edl;
  const key = JSON.stringify(idBin());
  if (idCache.key !== key) idCache = { key, edl: Edl.identity(idBin()) };
  return idCache.edl;
}
/** Clips that make the identity cut (uploaded clips are material you add by hand, never part of the original cut). */
const idBin = () => bin().filter((c) => !c.uploaded);
export const available = () => bin().length > 0;
export const fmtSpeed = (v) => `${Number(v.toFixed(2))}x`;
export const segs = () => Edl.layout(current()).segs;
export const segById = (id) => segs().find((s) => s.id === id) ?? null;
export const SEG_COLORS = ["#2b59ff", "#1a7f3c", "#b45309", "#7a5bd6", "#c0261d", "#0e7490"];
export const colorOf = (clip) => SEG_COLORS[Math.max(0, bin().findIndex((c) => c.name === clip)) % SEG_COLORS.length];

/** Frame to draw in the Video track thumbnails at output time t. */
export function frameAt(t) {
  const r = Edl.outToSrc(current(), t);
  const n = bin().find((c) => c.name === r?.clip)?.n ?? Infinity;
  return r ? { clip: r.clip, frame: Math.min(n, Math.max(1, Math.floor(r.srcT * 30 + 1e-6) + 1)) } : null;
}

// ---------- source words (snapping targets for the edges) ----------
const wordCache = new Map();
export function sourceWords(clip) {
  if (!wordCache.has(clip)) {
    wordCache.set(clip, null);
    fetch(`/footage/${clip}/words.json`).then((r) => (r.ok ? r.json() : [])).then((w) => { wordCache.set(clip, w); emit("selection"); }).catch(() => wordCache.set(clip, []));
  }
  return wordCache.get(clip) ?? [];
}

// ---------- ripple: motion elements and caption overrides follow their video through the cut ----------
const clampTo = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
function rippleEl(el, rm) {
  const w = windowOf(el);
  if (!w) return { el, gone: false };
  const iv = rm.interval(w[0], w[1]);
  if (!iv || iv[1] - iv[0] < Math.min(0.1, (w[1] - w[0]) * 0.5)) {
    // entirely inside a removed range: hide it (keep it inside the new duration so it can be restored by hand)
    let c = clone(el);
    if (w[1] > rm.newEnd) c = shiftTime(c, Math.max(-w[0], rm.newEnd - w[1]));
    const was = !!el.hidden;
    c.hidden = true;
    return { el: c, gone: !was };
  }
  const c = clone(el);
  const map = (t) => r3(clampTo(rm.point(t) ?? iv[0] + ((t - w[0]) / Math.max(1e-6, w[1] - w[0])) * (iv[1] - iv[0]), iv[0], iv[1]));
  if (c.items?.length && c.in === undefined) { // wordStack / chatBubbles (timed items); uiFeed has in/out and items without `at`
    const first = c.items.reduce((m, it, k) => (it.at < c.items[m].at ? k : m), 0);
    c.items.forEach((it, k) => { it.at = k === first ? r3(iv[0]) : map(it.at); });
  } else if (c.in !== undefined) c.in = r3(iv[0]);
  if (c.out !== undefined) c.out = r3(iv[1]);
  c.track?.forEach((k) => { k.t = map(k.t); });
  return { el: c, gone: false };
}
export function rippleMotion(motion, rm) {
  let gone = 0;
  const out = motion.map((el) => { const r = rippleEl(el, rm); if (r.gone) gone += 1; return r.el; });
  return { motion: out, gone };
}
export function rippleCaptions(doc, rm) {
  if (!doc?.segments) return doc; // automatic captions follow the words, which the comp remaps itself
  const d = clone(doc);
  d.segments = d.segments.flatMap((sg) => {
    const iv = rm.interval(sg.in, sg.out);
    if (!iv || iv[1] - iv[0] < 0.05) return [];
    const out = { ...sg, in: r3(iv[0]), out: r3(iv[1]) };
    if (sg.words) {
      const ws = sg.words.map((w) => { const v = rm.interval(w.start, w.end); return v ? { ...w, start: r3(v[0]), end: r3(v[1]) } : null; });
      if (ws.every(Boolean)) out.words = ws; else delete out.words; // a word fell in the cut: the editor spreads the text over the segment
    }
    return [out];
  });
  return d;
}

/** Commit a new EDL as ONE undoable step, rippling motion + caption overrides. Returns false (and toasts) on error. */
export function apply(res, key = null) {
  if (!res || res.error) { toast(res?.error ?? "No se pudo hacer ese corte"); return false; }
  const rm = res.remap ?? Edl.remapper(current(), res.edl);
  const { motion, gone } = rippleMotion(S.motion, rm);
  commit(motion, key, "edl", { captions: rippleCaptions(S.captions, rm), edl: res.edl });
  if (gone) toast(`${gone} ${gone === 1 ? "elemento quedó fuera del corte" : "elementos quedaron fuera del corte"} (ocultos, puedes volver a mostrarlos)`, 3800);
  return true;
}

// ---------- operations ----------
export function splitAtPlayhead() {
  if (!available()) return false;
  const res = Edl.split(current(), S.t);
  if (res.error) { toast(res.error === "no hay video en ese punto" ? "Pon el cursor sobre el video" : "Demasiado cerca del borde para dividir"); return false; }
  if (apply(res)) { selectSegment(res.rightId); return true; }
  return false;
}
export function removeSegment(id = S.selection.seg) {
  if (!id) return;
  const base = current();
  const res = Edl.remove(base, id);
  if (res.error) { toast("El video necesita al menos un segmento"); return; }
  const nextSel = segs().find((s) => s.id !== id && s.start >= (segById(id)?.start ?? 0)) ?? null;
  if (apply(res)) select(nextSel ? { kind: "segment", seg: nextSel.id } : {});
}
export const setTransition = (id, tr, key = null) => apply(Edl.setTransition(current(), id, tr), key);
export const setFadeOut = (fo) => apply(Edl.setFadeOut(current(), fo));
export function insertClip(name, where = "end") {
  const dur = binDur(name);
  const edl = current();
  let drop = { kind: "boundary", t: 0, index: edl.segments.length };
  if (where === "cursor") {
    const here = Edl.segmentAt(edl, S.t);
    if (here) {
      const sp = Edl.split(edl, S.t);
      drop = !sp.error ? { kind: "split", t: S.t, index: here.idx + 1 } : { kind: "boundary", t: 0, index: S.t - here.start < here.len / 2 ? here.idx : here.idx + 1 };
    }
  }
  placeClip(name, dur, drop);
}
/** Insert `name` (whole clip) at a drop point from drop.js. */
export function placeClip(name, dur, drop) {
  const res = insertAtDrop(Edl, current(), name, dur, drop);
  if (apply(res)) { selectSegment(res.id); toast(`${name} añadido`); }
}
/** Back to the clips whole, back to back, no edl.json. */
export function clearCuts() {
  const old = current();
  const id = Edl.identity(idBin());
  const rm = Edl.remapper(old, id);
  const { motion } = rippleMotion(S.motion, rm);
  commit(motion, null, "edl", { captions: rippleCaptions(S.captions, rm), edl: null });
  toast("Clips completos, sin cortes");
}
const trKind = (s) => (s.kind ?? "cut");
/** Short Spanish name of a transition name (legacy or registry). */
const trLabel = (type) => BASIC_LABEL[type] ?? descriptorFor(TR, type)?.label ?? type;

/**
 * Apply a transition name to the START of segment `seg`. Legacy names keep {type, dur}; a registry name gets its default duration
 * (or keeps the current one when the type does not change) and its params. First segment: a fade becomes a fade-in from black,
 * and only the legacy entry choices apply (no clip comes before it).
 */
export function applyTransitionType(seg, type) {
  const first = seg.idx === 0;
  const t = type === "fade" && first ? "dipBlack" : type;
  if (t === "cut") return setTransition(seg.id, null);
  const d = Edl.descriptorOf(t);
  if (!d) return setTransition(seg.id, { type: t, dur: seg.transition?.dur ?? 0.4 }); // legacy: unchanged
  if (first) { toast("En el primer clip solo hay entrada desde negro o blanco"); return false; }
  const same = seg.transition?.type === t;
  return setTransition(seg.id, buildTransition(d, { type: t, dur: same ? seg.transition.dur : d.defaultDur, params: same ? seg.transition.params : {} }));
}
// ---------- transition picker (diamond between segments, context menu) ----------
function openTransitionPicker(seg, trigger, at = null) {
  const first = seg.idx === 0;
  const cur = first && trKind(seg) === "fade" ? "dipBlack" : trKind(seg);
  openPicker({
    trigger, x: at?.x, y: at?.y,
    title: first ? "Entrada del video" : "Transición",
    sub: first ? "Cómo aparece el video desde un color" : "Entre este clip y el anterior",
    groups: pickerGroups({ first }),
    current: cur,
    onPick: (type) => applyTransitionType(seg, type)
  });
}
function tailMenu(ev) {
  const fo = current().fadeOut;
  const items = [[null, "Sin fundido final"], ["dipBlack", "Fundido a negro"], ["dipWhite", "Fundido a blanco"]].map(([type, label]) => ({
    label: `${(fo?.type ?? null) === type ? "✓ " : "   "}${label}`, onClick: () => setFadeOut(type ? { type, dur: fo?.dur ?? 0.5 } : null)
  }));
  showMenu(ev.clientX, ev.clientY, items);
}

// ---------- Video lane (called by timeline.js buildVideo; tl = geometry helpers of the timeline) ----------
export function buildLane(lane, tl) {
  const L = Edl.layout(current());
  const hh = lane.clientHeight || 48;
  L.segs.forEach((s) => {
    const sel = S.selection.kind === "segment" && S.selection.seg === s.id;
    const b = h("div", { class: `blk seg${sel ? " sel" : ""}`, style: { left: `${tl.px(s.start)}px`, width: `${Math.max(6, tl.px(s.len))}px`, top: "0px", height: `${hh - 1}px`, "--c": colorOf(s.clip) },
      title: `${s.clip} · ${s.in.toFixed(2)}–${s.out.toFixed(2)} s del clip${s.speed ? ` · velocidad ${fmtSpeed(s.speed)}` : ""}\narrastra los bordes para recortar, el cuerpo para reordenar · Shift+borde estira (velocidad) · S divide · Supr borra` });
    sourceWords(s.clip); // warm the word cache: the speed rules need to know where the voice is
    if (tl.px(s.len) > 46) b.append(h("span", { class: "lbl" }, `${s.clip} · ${s.len.toFixed(1)} s`));
    if (s.speed && tl.px(s.len) > 24) b.append(h("span", { class: "spd", title: `Velocidad ${fmtSpeed(s.speed)}: el sonido de esta toma se silencia` }, fmtSpeed(s.speed)));
    b.append(h("i", { class: "edge l" }), h("i", { class: "edge r" }));
    b.addEventListener("pointerdown", (e) => segDown(e, s, b, tl));
    b.addEventListener("contextmenu", (e) => {
      e.preventDefault(); e.stopPropagation(); selectSegment(s.id);
      showMenu(e.clientX, e.clientY, [
        { label: "Dividir en el cursor", hint: "S", disabled: !(S.t > s.start + 0.1 && S.t < s.end - 0.1), onClick: splitAtPlayhead },
        { label: "Eliminar (cierra el hueco)", hint: "Supr", danger: true, disabled: L.segs.length < 2, onClick: () => removeSegment(s.id) },
        "-", { label: "Cambiar transición de entrada…", onClick: () => openTransitionPicker(s, null, { x: e.clientX, y: e.clientY }) }
      ]);
    });
    b.addEventListener("dragover", (e) => { if (hasType(e, "transition")) { e.preventDefault(); e.stopPropagation(); b.classList.add("dropt"); } });
    b.addEventListener("dragleave", () => b.classList.remove("dropt"));
    b.addEventListener("drop", (e) => { if (!hasType(e, "transition")) return; e.preventDefault(); e.stopPropagation(); b.classList.remove("dropt"); const p = readDrop(e, "transition"); if (p) { selectSegment(s.id); applyTransitionType(s, p.type); } setDragPayload(null); });
    lane.append(b);
    if (s.d > 0) lane.append(h("div", { class: `tband ${s.kind}`, style: { left: `${tl.px(s.start)}px`, width: `${Math.max(3, tl.px(s.d))}px` } }));
    // diamond: the transition INTO this segment (first segment: the fade-in)
    const dx = s.idx === 0 ? 0 : s.start + s.d / 2;
    const dia = h("button", { class: `tdia${s.kind !== "cut" ? " on" : ""}`, style: { left: `${tl.px(dx)}px` }, title: s.idx === 0 ? "Entrada del video (suelta aquí una transición)" : `Transición: ${trLabel(trKind(s))} (suelta aquí otra para cambiarla)`, onpointerdown: (e) => e.stopPropagation(), onclick: (e) => { e.stopPropagation(); selectSegment(s.id); openTransitionPicker(s, dia); } });
    dia.addEventListener("dragover", (e) => { if (hasType(e, "transition")) { e.preventDefault(); e.stopPropagation(); dia.classList.add("dropt"); } });
    dia.addEventListener("dragleave", () => dia.classList.remove("dropt"));
    dia.addEventListener("drop", (e) => { if (!hasType(e, "transition")) return; e.preventDefault(); e.stopPropagation(); dia.classList.remove("dropt"); const p = readDrop(e, "transition"); if (p) { selectSegment(s.id); applyTransitionType(s, p.type); } setDragPayload(null); });
    lane.append(dia);
  });
  attachClipDrop(lane, tl);
  const fo = current().fadeOut;
  lane.append(h("button", { class: `tdia tail${fo ? " on" : ""}`, style: { left: `${tl.px(L.duration)}px` }, title: fo ? "Fundido final" : "Sin fundido final", onpointerdown: (e) => e.stopPropagation(), onclick: (e) => { e.stopPropagation(); tailMenu(e); } }));
  if (fo) lane.append(h("div", { class: "tband tail", style: { left: `${tl.px(L.duration - fo.dur)}px`, width: `${Math.max(3, tl.px(fo.dur))}px` } }));
}

/** Drag a clip card onto the lane: an insertion marker follows the pointer (snapping to the cuts); dropping inserts it there. */
function attachClipDrop(lane, tl) {
  const mark = h("div", { class: "dropmark", hidden: true });
  lane.append(mark);
  const where = (e) => dropPoint(Edl, current(), tl.clampT((e.clientX - tl.inner.getBoundingClientRect().left) / tl.pps()), Math.max(0.1, 8 / tl.pps()));
  lane.addEventListener("dragover", (e) => {
    if (!hasType(e, "clip")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    const d = where(e);
    mark.hidden = false;
    mark.style.left = `${tl.px(d.t)}px`;
    mark.classList.toggle("split", d.kind === "split");
    const len = dragPayload("clip")?.dur;
    mark.style.setProperty("--w", len ? `${Math.max(4, tl.px(len))}px` : "0px");
    mark.title = d.kind === "split" ? "Se divide la toma aquí y se inserta el clip" : "Se inserta entre las tomas";
  });
  lane.addEventListener("dragleave", (e) => { if (!lane.contains(e.relatedTarget)) mark.hidden = true; });
  lane.addEventListener("drop", (e) => {
    if (!hasType(e, "clip")) return;
    e.preventDefault();
    mark.hidden = true;
    const p = readDrop(e, "clip");
    setDragPayload(null);
    if (!p?.clip) return;
    placeClip(p.clip, Number.isFinite(p.dur) ? p.dur : binDur(p.clip), where(e));
  });
}

/** Snap a source time to a word edge of the clip, the playhead, or the other edge's neighbours (Alt disables). */
function snapSrc(clip, t, ev, tl, base) {
  if (ev.altKey) return { t, hit: false };
  const lim = Math.min(0.08, 7 / tl.pps());
  const cands = Edl.wordEdges(sourceWords(clip));
  const here = Edl.outToSrc(base, S.t);
  if (here && here.clip === clip) cands.push(here.srcT);
  let best = t, d = lim;
  for (const c of cands) if (Math.abs(c - t) < d) { d = Math.abs(c - t); best = c; }
  return { t: best, hit: best !== t };
}

function segDown(e, s, el, tl) {
  if (e.button !== 0) return;
  e.stopPropagation();
  const edge = e.target.classList.contains("edge") ? (e.target.classList.contains("l") ? "in" : "out") : null;
  selectSegment(s.id);
  const base = current();
  const x0 = e.clientX;
  const clickT = tl.clampT((e.clientX - tl.inner.getBoundingClientRect().left) / tl.pps());
  let moved = false, live = null, target = null;
  if (edge) beginGesture();
  const dur = binDur(s.clip);
  const stretch = !!edge && e.shiftKey; // Shift + edge: stretch the segment (changes its speed) instead of trimming it
  let warned = false;
  const mv = (ev) => {
    if (!moved && Math.abs(ev.clientX - x0) < 3) return;
    moved = true;
    drag.active = true;
    const dx = ev.clientX - x0;
    if (stretch) {
      const want = Math.max(0.05, s.len + (edge === "out" ? dx : -dx) / tl.pps());
      const v = Math.round(Math.min(Edl.SPEED_MAX, Math.max(Edl.SPEED_MIN, ((s.out - s.in) / want))) * 100) / 100;
      const res = Edl.setSpeed(base, s.id, Math.abs(v - 1) < 0.02 ? null : v, { [s.clip]: sourceWords(s.clip) });
      if (res.error) { if (!warned) { toast(res.error, 3200); warned = true; } return; }
      live = res;
      setTransient(S.motion, "gesture", { edl: res.edl });
      const ns = Edl.layout(res.edl).segs.find((x) => x.id === s.id);
      if (ns) seek(edge === "in" ? ns.start : Math.max(ns.start, ns.end - 1 / 30));
      return;
    }
    if (edge) {
      const sn = snapSrc(s.clip, (edge === "in" ? s.in : s.out) + (dx / tl.pps()) * (s.speed ?? 1), ev, tl, base);
      const res = Edl.trim(base, s.id, edge, sn.t, dur);
      if (res.error) return;
      live = res;
      setTransient(S.motion, "gesture", { edl: res.edl });
      const ns = Edl.layout(res.edl).segs.find((x) => x.id === s.id);
      if (ns) {
        seek(edge === "in" ? ns.start : Math.max(ns.start, ns.end - 1 / 30));
        if (sn.hit) tl.showSnap(edge === "in" ? ns.start : ns.end); else tl.hideSnap();
        target = edge === "in" ? ns.in : ns.out;
      }
    } else {
      el.style.transform = `translateX(${dx}px)`;
      el.style.opacity = "0.75";
      el.style.zIndex = "6";
      const others = Edl.layout(base).segs.filter((o) => o.id !== s.id);
      const cx = tl.px(s.start) + dx + tl.px(s.len) / 2;
      const idx = others.filter((o) => tl.px(o.start) + tl.px(o.len) / 2 < cx).length;
      target = idx;
      tl.showSnap(idx === 0 ? 0 : others[idx - 1].end);
    }
  };
  const up = () => {
    window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up);
    tl.hideSnap();
    drag.active = false;
    if (!moved) { if (edge) cancelGesture(); seek(clickT); return; }
    if (edge) {
      if (!live) { cancelGesture(); return; }
      const rm = live.remap;
      const { motion, gone } = rippleMotion(S.motion, rm);
      setTransient(motion, "gesture", { captions: rippleCaptions(S.captions, rm), edl: live.edl });
      endGesture();
      if (gone) toast(`${gone} ${gone === 1 ? "elemento quedó fuera del corte" : "elementos quedaron fuera del corte"}`, 3800);
    } else {
      el.style.transform = ""; el.style.opacity = ""; el.style.zIndex = "";
      if (target !== null && target !== s.idx) apply(Edl.move(base, s.id, target));
    }
    tl.rerender();
  };
  window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up);
  e.preventDefault();
}

// ---------- inspector ----------
export function segmentPanel() {
  const base = current();
  const s = segById(S.selection.seg);
  if (!s) return [h("h2", {}, "Video"), note("Selecciona un segmento de la pista Video.")];
  const first = s.idx === 0;
  const out = [h("h2", {}, `Segmento ${s.idx + 1}`, h("span", { class: "muted tiny" }, `  ${s.clip}`))];
  out.push(h("div", { class: "btnrow" },
    h("button", { disabled: !(S.t > s.start + 0.1 && S.t < s.end - 0.1), title: "S", onclick: splitAtPlayhead }, "✂ Dividir en el cursor"),
    h("button", { class: "danger", disabled: base.segments.length < 2, title: "Supr", onclick: () => removeSegment(s.id) }, "Eliminar")));
  out.push(section("Recorte", [
    numberBox({ label: "Empieza en (s)", value: r3(s.in), step: 0.05, min: 0, onInput: (v) => v !== null && apply(Edl.trim(base, s.id, "in", v, binDur(s.clip)), `seg:${s.id}:in`) }),
    numberBox({ label: "Termina en (s)", value: r3(s.out), step: 0.05, min: 0, max: binDur(s.clip), onInput: (v) => v !== null && apply(Edl.trim(base, s.id, "out", v, binDur(s.clip)), `seg:${s.id}:out`) }),
    note(`Dura ${s.len.toFixed(2)} s de ${Number.isFinite(binDur(s.clip)) ? binDur(s.clip).toFixed(2) : "?"} s del clip. Lo que sigue se recorre solo; el motion y los subtítulos acompañan a su video.`)
  ], { key: "seg-trim" }));
  out.push(speedSection(base, s));
  const cur = first && trKind(s) === "fade" ? "dipBlack" : trKind(s);
  const d = descriptorFor(TR, cur); // registry descriptor; null for the legacy names and the cut
  const tr = [];
  const choice = groupedSelect({ value: cur, groups: selectGroups(pickerGroups({ first })), onChange: (v) => applyTransitionType(s, v) });
  const listen = d?.sfx ? h("button", { class: "small", title: "Escuchar el sonido de esta transición", onclick: () => escuchar(d.sfx.kind) }, "Escuchar") : null;
  tr.push(h("div", { class: "field" }, h("label", {}, first ? "Entrada" : "Transición"), h("div", { class: "sl" }, choice, listen)));
  const curTr = s.transition ?? {};
  const update = (patch, key = null) => setTransition(s.id, buildTransition(d, { type: cur, dur: curTr.dur, params: curTr.params ?? {}, ...patch }), key);
  if (cur !== "cut" && d) {
    tr.push(slider({ label: "Duración (s)", value: curTr.dur ?? d.defaultDur, min: d.minDur, max: d.maxDur, step: 0.05, onInput: (v) => v !== null && update({ dur: v }, `seg:${s.id}:tr`) }));
    for (const q of d.params) {
      const val = curTr.params?.[q.key] ?? q.default;
      if (q.kind === "select") tr.push(selectBox({ label: q.label, value: val, options: q.options, onChange: (v) => update({ params: { ...(curTr.params ?? {}), [q.key]: v } }) }));
      else {
        const r = numberRange(q);
        tr.push(slider({ label: q.label, value: val, min: r.min, max: r.max, step: r.step, onInput: (v) => v !== null && update({ params: { ...(curTr.params ?? {}), [q.key]: v } }, `seg:${s.id}:trp:${q.key}`) }));
      }
    }
  } else if (cur !== "cut") tr.push(slider({ label: "Duración (s)", value: s.transition?.dur ?? 0.4, min: 0.1, max: 1.5, step: 0.05, onInput: (v) => v !== null && setTransition(s.id, { type: s.transition.type, dur: v }, `seg:${s.id}:tr`) }));
  tr.push(note(d ? d.description : first ? "Aparece desde un color." : "Los dos clips se solapan durante la transición: el video se acorta esa misma duración."));
  out.push(section("Cómo entra", tr, { key: "seg-tr" }));
  const warns = Edl.lint(base).filter((l) => l.id === s.id);
  if (warns.length) out.push(h("div", { class: "warns yellow" }, warns.map((w) => h("div", {}, w.msg))));
  return out;
}

// ---------- speed ----------
export function setSpeedOf(id, v, key = null) {
  const s = segById(id);
  if (!s) return false;
  return apply(Edl.setSpeed(current(), id, v === null || Math.abs(v - 1) < 1e-6 ? null : v, { [s.clip]: sourceWords(s.clip) }), key);
}
function speedSection(base, s) {
  const blocked = Edl.hasWords(sourceWords(s.clip), s.in, s.out);
  const cur = s.speed ?? 1;
  const read = h("b", { class: "spd-read" }, fmtSpeed(cur));
  const rng = h("input", { type: "range", min: -200, max: 200, step: 1, value: Math.round(Math.log2(cur) * 100), disabled: blocked, title: "Más a la izquierda: cámara lenta. Más a la derecha: acelerado." });
  rng.oninput = () => {
    let v = Math.round(2 ** (Number(rng.value) / 100) * 100) / 100;
    if (Math.abs(v - 1) < 0.04) v = 1;
    read.textContent = fmtSpeed(v);
    setSpeedOf(s.id, v, `seg:${s.id}:speed`);
  };
  const quick = [0.5, 1, 2].map((v) => h("button", { class: `small${Math.abs(cur - v) < 1e-6 ? " on" : ""}`, disabled: blocked, title: v === 1 ? "Velocidad normal" : v < 1 ? "Mitad de velocidad (cámara lenta)" : "El doble de rápido", onclick: () => setSpeedOf(s.id, v) }, fmtSpeed(v)));
  const body = [
    h("div", { class: "field" }, h("label", {}, "Velocidad"), h("div", { class: "sl" }, rng, read)),
    h("div", { class: "btnrow" }, ...quick)
  ];
  if (blocked) body.push(note("Esta toma tiene voz; cambiar la velocidad rompería la sincronía de los labios.", "warns"));
  else {
    body.push(note(cur !== 1 ? `Se silencia el sonido de esta toma. Dura ${s.len.toFixed(2)} s en lugar de ${(s.out - s.in).toFixed(2)} s.` : "Solo para tomas sin voz (cámara lenta, tomas de producto). Tip: Shift + arrastrar el borde del bloque también la cambia."));
  }
  return section("Velocidad", body, { key: "seg-speed" });
}

/** Sections for the Video track inspector: the material (all available clips) and the closing fade. */
export function binSections() {
  if (!available()) return [];
  const base = current();
  const used = new Map();
  for (const s of base.segments) used.set(s.clip, (used.get(s.clip) ?? 0) + (s.out - s.in));
  const rows = bin().map((c) => h("div", { class: "binrow", draggable: "true", title: "Arrástralo al carril Video", ondragstart: (e) => { const p = { clip: c.name, dur: c.dur }; setDragPayload("clip", p); e.dataTransfer.setData(MIME.clip, JSON.stringify(p)); }, ondragend: () => setDragPayload(null) },
    h("img", { src: `/footage/${c.name}/0001.jpg`, alt: "", loading: "lazy", style: { borderColor: colorOf(c.name) } }),
    h("div", { class: "binmeta" }, h("b", {}, c.name), h("span", { class: "muted tiny" }, `${c.dur.toFixed(1)} s · ${used.has(c.name) ? `${used.get(c.name).toFixed(1)} s en el video` : "sin usar"}`)),
    h("div", { class: "binbtn" },
      h("button", { class: "small", title: "Añadir el clip completo al final", onclick: () => insertClip(c.name, "end") }, "+ Final"),
      h("button", { class: "small", title: "Insertar el clip en el cursor", onclick: () => insertClip(c.name, "cursor") }, "+ Cursor"))));
  const fo = base.fadeOut;
  const out = [section("Material", [...rows, note("Tomas disponibles (generadas o subidas). Añade una para usarla; recórtala arrastrando sus bordes.")], { key: "bin" })];
  out.push(section("Cortes", [
    h("div", { class: "btnrow" }, h("button", { title: "S", onclick: splitAtPlayhead }, "✂ Dividir en el cursor")),
    selectBox({ label: "Fundido final", value: fo?.type ?? "", options: [["", "Ninguno"], ["dipBlack", "A negro"], ["dipWhite", "A blanco"]], onChange: (v) => setFadeOut(v ? { type: v, dur: fo?.dur ?? 0.5 } : null) }),
    fo ? slider({ label: "Duración (s)", value: fo.dur, min: 0.1, max: 2, step: 0.05, onInput: (v) => v !== null && apply(Edl.setFadeOut(base, { type: fo.type, dur: v }), "edl:fadeout") }) : null,
    S.edl ? h("button", { class: "small danger", onclick: () => { if (confirm("¿Quitar todos los cortes y volver a los clips completos?")) clearCuts(); } }, "Quitar todos los cortes") : null
  ], { key: "cuts" }));
  return out;
}
