// Timeline: tracks top to bottom = Motion (auto-packed layers), Subtítulos, Video (thumbnails), Voz (waveform + words), Música (waveform), SFX.
// Blocks are labelled with their text; edges trim, the body moves, Alt-drag duplicates, Shift selects several, double-click edits text.
import { S, on, emit, commit, selectElement, select, selectCaption, selectTrack, clearSel, beginGesture, endGesture, cancelGesture, setTransient, byId, newId, clone, isSelected, mmss, toast } from "./store.js";
import { TYPES, windowOf, ticksOf, setTick, shiftTime, setStart, elementLabel, textKeyOf, isPinned, fitSegWords } from "./schema.js";
import * as caps from "./captions.js";
import { loadPeaks, thumb } from "./media.js";
import { X, activeUrl, setSfx } from "./extras.js";
import * as sfx from "./sfx.js";
import * as ops from "./ops.js";
import * as sfxlane from "./sfxlane.js";
import { hasType, readDrop, setDragPayload } from "./dnd.js";
import * as edlui from "./edl-ui.js";
import * as Edl from "/engine/edl.js";
import { showMenu } from "./menus.js";
import { seek, refreshLayers } from "./preview.js";
import { $, h } from "./dom.js";
import { selectLogo, selectCta } from "./store.js";
import { logoWindow } from "./logo.js";

const scroll = $("tlScroll");
const inner = $("tlInner");
const heads = $("tlHeads");
const HEIGHTS = { motion: 22, captions: 26, video: 48, voice: 38, music: 30, sfx: 30, brand: 20 };
const NAMES = { motion: "Motion", captions: "Subtítulos", video: "Video", voice: "Voz", music: "Música", sfx: "Efectos", brand: "Marca" };
const TOGGLE = { motion: "eye", captions: "eye", voice: "mute", music: "mute", sfx: "mute" };
const LOCKABLE = new Set(["motion", "captions"]);
const SNAP = 0.08;
const pps = () => S.zoomPps;
const px = (t) => t * pps();
const r3 = (v) => Math.round(v * 1000) / 1000;
const clampT = (t) => Math.max(0, Math.min(t, S.duration));
let playhead = null, snapLine = null;
let editing = false;

const ICON = {
  eye: '<svg viewBox="0 0 16 16" width="14" height="14"><path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="8" cy="8" r="2" fill="currentColor"/></svg>',
  eyeOff: '<svg viewBox="0 0 16 16" width="14" height="14"><path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z" fill="none" stroke="currentColor" stroke-width="1.4" opacity=".4"/><path d="M2 14L14 2" stroke="currentColor" stroke-width="1.6"/></svg>',
  mute: '<svg viewBox="0 0 16 16" width="14" height="14"><path d="M2 6h3l4-3v10L5 10H2z" fill="currentColor"/><path d="M11 5.5c1.3 1.3 1.3 3.7 0 5" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>',
  muteOff: '<svg viewBox="0 0 16 16" width="14" height="14"><path d="M2 6h3l4-3v10L5 10H2z" fill="currentColor" opacity=".4"/><path d="M11 5l4 6M15 5l-4 6" stroke="currentColor" stroke-width="1.5"/></svg>',
  lock: '<svg viewBox="0 0 16 16" width="14" height="14"><rect x="3" y="7" width="10" height="7" rx="1.5" fill="currentColor"/><path d="M5 7V5a3 3 0 016 0v2" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>',
  unlock: '<svg viewBox="0 0 16 16" width="14" height="14"><rect x="3" y="7" width="10" height="7" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M5 7V5a3 3 0 015.6-1.5" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>'
};

// ---------- motion layer packing (stable: an element keeps its layer while it has no overlap there) ----------
const layerCache = new Map();
function packMotion() {
  const els = S.motion.filter((e) => windowOf(e)).map((e) => ({ e, w: windowOf(e) })).sort((a, b) => a.w[0] - b.w[0] || a.w[1] - b.w[1]);
  const layers = [];
  const out = {};
  for (const { e, w } of els) {
    const free = (L) => !(layers[L] ?? []).some((x) => w[0] < x[1] - 1e-3 && w[1] > x[0] + 1e-3);
    const pref = layerCache.get(e.id);
    let L = pref !== undefined && pref <= layers.length && free(pref) ? pref : -1;
    if (L < 0) { L = 0; while (!free(L)) L += 1; }
    (layers[L] ??= []).push(w);
    out[e.id] = L;
    layerCache.set(e.id, L);
  }
  return { of: out, n: Math.max(1, layers.length) };
}

// ---------- snapping ----------
function snapTargets(excludeIds = []) {
  const t = S.words.flatMap((w) => [w.start, w.end]);
  for (const e of S.motion) { if (excludeIds.includes(e.id)) continue; const w = windowOf(e); if (w) t.push(w[0], w[1]); }
  return t;
}
function snap(t, ev, targets) {
  if (ev.altKey) { hideSnap(); return t; }
  let best = t, d = SNAP;
  for (const c of [...targets, S.t]) if (Math.abs(c - t) < d) { d = Math.abs(c - t); best = c; }
  if (best !== t) showSnap(best); else hideSnap();
  return best;
}
function showSnap(t) { if (snapLine) { snapLine.style.display = "block"; snapLine.style.left = `${px(t)}px`; } }
function hideSnap() { if (snapLine) snapLine.style.display = "none"; }

// ---------- DOM helpers ----------
function blk(parent, cls, left, width, label, title) {
  const d = h("div", { class: `blk ${cls}`, style: { left: `${left}px`, width: `${Math.max(5, width)}px` }, title: title ?? "" });
  if (label !== undefined && (width >= 22 || cls.startsWith("ev"))) d.append(h("span", { class: "lbl" }, label));
  parent.append(d);
  return d;
}

// ---------- render ----------
let layout = null; // {y: {track: y0}, h: {track: height}}
export function render() {
  if (editing) return;
  const width = Math.max(px(S.duration) + 60, scroll.clientWidth);
  const pack = packMotion();
  const rows = { motion: pack.n };
  inner.replaceChildren();
  heads.replaceChildren();
  inner.style.width = `${width}px`;
  layout = { y: {}, h: {} };
  let y = 0;
  // ruler
  const ruler = h("div", { class: "lane ruler", style: { top: "0px", height: "24px", width: `${width}px` } });
  inner.append(ruler);
  heads.append(h("div", { class: "head ruler", style: { top: "0px", height: "24px" } }));
  y = 24;
  const lanes = {};
  for (const tr of Object.keys(HEIGHTS)) {
    const hh = tr === "motion" ? HEIGHTS.motion * rows.motion : HEIGHTS[tr];
    layout.y[tr] = y; layout.h[tr] = hh;
    lanes[tr] = h("div", { class: `lane ${tr}`, "data-track": tr, style: { top: `${y}px`, height: `${hh}px`, width: `${width}px` } });
    inner.append(lanes[tr]);
    buildHead(tr, y, hh);
    y += hh;
  }
  inner.style.height = `${y}px`;
  heads.style.height = `${y}px`;
  buildRuler(ruler, width);
  buildMotion(lanes.motion, pack);
  buildCaptions(lanes.captions);
  buildVideo(lanes.video);
  buildVoice(lanes.voice);
  buildMusic(lanes.music);
  buildSfx(lanes.sfx);
  buildBrand(lanes.brand);
  if (S.cta) inner.append(h("div", { class: "cta-zone", style: { left: `${px(S.cta.at)}px`, width: `${px(S.duration - S.cta.at)}px` } }, h("span", {}, "CTA · sin motion")));
  snapLine = h("div", { class: "snapline" });
  playhead = h("div", { id: "playhead" });
  inner.append(snapLine, playhead);
  for (const tr of Object.keys(lanes)) lanes[tr].addEventListener("pointerdown", (e) => laneDown(e, tr));
  for (const tr of Object.keys(lanes)) lanes[tr].addEventListener("contextmenu", (e) => laneMenu(e, tr));
  lanes.motion.addEventListener("dragover", (e) => { if (hasType(e, "text")) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; } });
  lanes.motion.addEventListener("drop", (e) => {
    if (!hasType(e, "text")) return;
    e.preventDefault();
    const p = readDrop(e, "text");
    setDragPayload(null);
    if (p?.type) ops.addAt(p.type, clampT((e.clientX - inner.getBoundingClientRect().left) / pps()));
  });
  movePlayhead();
  drawCanvases();
}

function buildHead(tr, y, hh) {
  const kind = TOGGLE[tr];
  const off = tr === "sfx" ? (X.audio && !X.audio.sfx.enabled) || S.layerOff.sfx : S.layerOff[tr];
  const head = h("div", { class: `head${S.selection.kind === "track" && S.selection.track === tr ? " sel" : ""}`, style: { top: `${y}px`, height: `${hh}px` } });
  head.append(h("button", { class: "hname", title: `Ajustes de ${NAMES[tr]}`, onclick: () => selectTrack(tr) }, NAMES[tr]));
  const tools = h("div", { class: "htools" });
  if (kind) {
    const b = h("button", { class: `icon${off ? " off" : ""}`, title: kind === "eye" ? (off ? "Mostrar en la vista previa" : "Ocultar en la vista previa") : (off ? "Activar sonido" : "Silenciar (vista previa)"), html: ICON[kind + (off ? "Off" : "")] ?? ICON[kind] });
    b.onclick = () => {
      if (tr === "sfx" && X.audio) { setSfx({ enabled: !X.audio.sfx.enabled }); render(); return; }
      S.layerOff[tr] = !S.layerOff[tr];
      refreshLayers();
      render();
    };
    tools.append(b);
  }
  if (LOCKABLE.has(tr)) {
    const l = h("button", { class: `icon${S.locked[tr] ? " on" : ""}`, title: S.locked[tr] ? "Desbloquear" : "Bloquear (evita mover o recortar)", html: S.locked[tr] ? ICON.lock : ICON.unlock });
    l.onclick = () => { S.locked[tr] = !S.locked[tr]; render(); };
    tools.append(l);
  }
  head.append(tools);
  heads.append(head);
}

function buildRuler(ruler, width) {
  const step = [0.1, 0.25, 0.5, 1, 2, 5, 10, 30].find((s) => s * pps() >= 64) ?? 60;
  for (let t = 0; t <= S.duration + 1e-6; t += step) ruler.append(h("div", { class: "tick-label", style: { left: `${px(t)}px` } }, step < 1 ? `${t.toFixed(2)}` : mmss(t).replace(/\.00$/, "")));
  const sub = step / 5;
  if (sub * pps() >= 7) for (let t = 0; t <= S.duration; t += sub) ruler.append(h("div", { class: "tick-minor", style: { left: `${px(t)}px` } }));
  const scrub = (e) => seek(clampT((e.clientX - ruler.getBoundingClientRect().left) / pps()));
  ruler.addEventListener("pointerdown", (e) => {
    scrub(e);
    const mv = (ev) => scrub(ev);
    const up = () => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up);
  });
}

// ----- motion -----
function buildMotion(lane, pack) {
  S.motion.forEach((el) => {
    const w = windowOf(el);
    if (!w) return;
    const L = pack.of[el.id] ?? 0;
    const label = `${TYPES[el.type]?.label ?? el.type}${elementLabel(el) ? ` · ${elementLabel(el)}` : ""}`;
    const b = blk(lane, `motion${isSelected(el.id) ? " sel" : ""}${el.hidden ? " hidden" : ""}${S.issues[el.id]?.errors.length ? " bad" : ""}`, px(w[0]), px(w[1] - w[0]), label, `${el.type} ${w[0].toFixed(2)}–${w[1].toFixed(2)} s${el.hidden ? " (oculto)" : ""}`);
    b.style.top = `${L * HEIGHTS.motion + 2}px`;
    b.style.height = `${HEIGHTS.motion - 4}px`;
    b.append(h("i", { class: "edge l" }), h("i", { class: "edge r" }));
    ticksOf(el).forEach((tk) => b.append(h("i", { class: "sub", style: { left: `${px(tk.t - w[0])}px` }, "data-k": tk.k, title: `${tk.label} @ ${tk.t.toFixed(2)} s` })));
    b.addEventListener("pointerdown", (e) => motionDown(e, el, b));
    b.addEventListener("dblclick", (e) => { e.stopPropagation(); inlineEdit(b, el); });
    b.addEventListener("contextmenu", (e) => { e.preventDefault(); e.stopPropagation(); if (!isSelected(el.id)) selectElement(el.id); motionMenu(e, el); });
  });
}
function motionMenu(e, el) {
  const ids = S.selection.ids.length ? S.selection.ids : [el.id];
  showMenu(e.clientX, e.clientY, [
    { label: "Duplicar", hint: "Alt+arrastrar", onClick: () => ops.duplicate(ids) },
    { label: ids.every((id) => byId(id)?.hidden) ? "Mostrar" : "Ocultar", onClick: () => ops.toggleHide(ids) },
    { label: "Soltar posición", disabled: ids.length !== 1 || !isPinned(el), onClick: () => ops.unpin(el.id) },
    "-",
    { label: "Eliminar", hint: "Supr", danger: true, onClick: () => ops.remove(ids) }
  ]);
}
function laneMenu(e, tr) {
  if (e.target.closest(".blk")) return;
  e.preventDefault();
  const rect = inner.getBoundingClientRect();
  const t = clampT((e.clientX - rect.left) / pps());
  if (tr === "motion") {
    showMenu(e.clientX, e.clientY, Object.entries(TYPES).filter(([, s]) => !s.noAdd).map(([type, s]) => ({ label: `Añadir ${s.label.toLowerCase()} aquí`, onClick: () => ops.addAt(type, t) })));
  } else if (tr === "captions") {
    showMenu(e.clientX, e.clientY, [
      { label: "Dividir subtítulo en el cursor", hint: "S", disabled: !caps.segAt(S.t), onClick: () => splitAtPlayhead() },
      { label: "Volver a subtítulos automáticos", disabled: !caps.hasOverride(), onClick: () => caps.resetSegments() }
    ]);
  }
}
export function splitAtPlayhead() {
  // S cuts the video when a segment / the Video track is selected (or there is no subtitle under the playhead); otherwise the subtitle.
  const k = S.selection.kind;
  const onVideo = k === "segment" || (k === "track" && S.selection.track === "video");
  if (edlui.available() && k !== "caption" && (onVideo || !caps.segAt(S.t))) { edlui.splitAtPlayhead(); return; }
  const seg = caps.segAt(S.t);
  if (!seg || !(S.t > seg.in && S.t < seg.out)) { toast("Pon el cursor dentro de un subtítulo"); return; }
  if (!caps.split(seg.id, S.t)) toast("No se puede dividir ahí");
}

// ----- captions -----
function buildCaptions(lane) {
  const mat = caps.hasOverride();
  caps.segments().forEach((sg) => {
    const sel = S.selection.kind === "caption" && S.selection.seg === sg.id;
    const b = blk(lane, `cap${sel ? " sel" : ""}${sg.hidden ? " hidden" : ""}${mat ? "" : " auto"}`, px(sg.in), px(sg.out - sg.in), sg.text, `${sg.text}\n${sg.in.toFixed(2)}–${sg.out.toFixed(2)} s${mat ? "" : " · automático (se vuelve editable al tocarlo)"}`);
    b.style.top = "3px"; b.style.height = `${HEIGHTS.captions - 6}px`;
    b.append(h("i", { class: "edge l" }), h("i", { class: "edge r" }));
    b.addEventListener("pointerdown", (e) => captionDown(e, sg, b));
    b.addEventListener("dblclick", (e) => { e.stopPropagation(); inlineEditCaption(b, sg); });
    b.addEventListener("contextmenu", (e) => {
      e.preventDefault(); e.stopPropagation(); selectCaption(sg.id);
      showMenu(e.clientX, e.clientY, [
        { label: "Editar texto", hint: "doble clic", onClick: () => inlineEditCaption(b, sg) },
        { label: "Dividir en el cursor", hint: "S", disabled: !(S.t > sg.in && S.t < sg.out), onClick: () => caps.split(sg.id, S.t) },
        { label: "Unir con el siguiente", onClick: () => caps.mergeNext(sg.id) },
        { label: sg.hidden ? "Mostrar" : "Ocultar", onClick: () => caps.toggleHidden(sg.id) },
        "-", { label: "Eliminar", danger: true, onClick: () => caps.removeSeg(sg.id) }
      ]);
    });
  });
}

// ----- video / voice / music / sfx -----
const tlApi = () => ({ px, pps, clampT, showSnap, hideSnap, inner, rerender: () => render(), snapT: (t, ev, excludeKeys = []) => snap(t, ev, [...snapTargets(), ...sfxlane.merged().filter((x) => !excludeKeys.includes(x.key)).map((x) => x.t)]) });
function buildVideo(lane) {
  lane.append(h("canvas", { class: "cv", "data-cv": "video" }));
  if (edlui.available()) { edlui.buildLane(lane, tlApi()); return; } // the cut (engine/edl.js): segments, trims, transitions
  for (const c of S.studio?.clips ?? []) if (c.start > 0.01) lane.append(h("div", { class: "cut", style: { left: `${px(c.start)}px` }, title: `Corte · ${c.name}` }));
  for (const c of S.studio?.clips ?? []) lane.append(h("div", { class: "clipname", style: { left: `${px(c.start) + 4}px` } }, c.name));
}
function buildVoice(lane) {
  lane.append(h("canvas", { class: "cv", "data-cv": "voice" }));
  const wordsOk = pps() >= 110;
  if (wordsOk) {
    S.words.forEach((w, k) => {
      const inR = S.wordRange && k >= S.wordRange.a && k <= S.wordRange.b;
      const b = blk(lane, `word${inR ? " sel" : ""}`, px(w.start), px(w.end - w.start) - 1, w.word, `${w.word} · ${w.start.toFixed(2)}–${w.end.toFixed(2)} s\nclic: elegir · Shift+clic: ampliar (Regrabar frase)`);
      b.addEventListener("pointerdown", (e) => {
        e.stopPropagation();
        const r = S.wordRange;
        S.wordRange = e.shiftKey && r ? { a: Math.min(r.a, k), b: Math.max(r.b, k) } : { a: k, b: k };
        selectTrack("voice");
        render();
        emit("wordrange");
      });
    });
  } else {
    S.autoSegs.forEach((p) => {
      const b = blk(lane, "phrase", px(p.in), px(p.out - p.in) - 1, p.text, `${p.text} · ${p.in.toFixed(2)}–${p.out.toFixed(2)} s\nacerca el zoom para ver palabras`);
      b.addEventListener("pointerdown", (e) => {
        e.stopPropagation();
        const a = S.words.findIndex((w) => w.start >= p.in - 0.01);
        let z = a;
        S.words.forEach((w, k) => { if (w.end <= p.out + 0.01 && k >= a) z = k; });
        S.wordRange = { a: Math.max(0, a), b: Math.max(a, z) };
        selectTrack("voice");
        render();
        emit("wordrange");
      });
    });
  }
}
function buildMusic(lane) {
  lane.append(h("canvas", { class: "cv", "data-cv": "music" }));
  const e = X.entries.find((x) => x.id === X.active.music);
  lane.append(h("div", { class: "clipname", style: { left: "4px", position: "sticky" } }, e ? e.id.replace(/^music:/, "") : "sin música"));
}
// ----- brand: the logo bug and the end card as selectable blocks (inspectors in logo.js) -----
function buildBrand(lane) {
  const [a, b] = logoWindow();
  const end = Number.isFinite(b) ? Math.min(b, S.cta?.at ?? S.duration) : S.cta?.at ?? S.duration;
  if (!S.logo?.hidden && end > a) {
    const blkL = blk(lane, `brand logo${S.selection.kind === "logo" ? " sel" : ""}`, px(a), px(end - a), "Logo", `Logo ${a.toFixed(2)}–${end.toFixed(2)} s · clic: ajustes`);
    blkL.addEventListener("pointerdown", (e) => { if (e.button !== 0) return; e.stopPropagation(); selectLogo(); });
  } else if (S.logo?.hidden) lane.append(h("div", { class: "clipname", style: { left: "4px", position: "sticky" } }, "logo oculto"));
  if (S.cta) {
    const blkC = blk(lane, `brand cta${S.selection.kind === "cta" ? " sel" : ""}`, px(S.cta.at), px(S.duration - S.cta.at), "Cierre", `Tarjeta de cierre ${S.cta.at.toFixed(2)}–${S.duration.toFixed(2)} s · clic: ajustes`);
    blkC.addEventListener("pointerdown", (e) => { if (e.button !== 0) return; e.stopPropagation(); selectCta(); });
  }
}
function buildSfx(lane) { sfxlane.buildLane(lane, tlApi()); }

// ---------- canvases (video thumbnails, waveforms) drawn for the visible slice only ----------
let drawQueued = false;
export function drawCanvases() {
  if (drawQueued) return;
  drawQueued = true;
  requestAnimationFrame(() => { drawQueued = false; paintCanvases(); });
}
function sizeCanvas(cv, hh) {
  const dpr = devicePixelRatio || 1;
  const w = scroll.clientWidth;
  cv.style.left = "0px";
  cv.style.width = `${w}px`; cv.style.height = `${hh}px`;
  cv.width = Math.round(w * dpr); cv.height = Math.round(hh * dpr);
  const g = cv.getContext("2d");
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { g, w, dpr };
}
function paintCanvases() {
  const sl = scroll.scrollLeft;
  for (const cv of inner.querySelectorAll("canvas.cv")) {
    const kind = cv.dataset.cv;
    cv.style.transform = `translateX(${sl}px)`;
    const { g, w } = sizeCanvas(cv, layout.h[kind]);
    const hh = layout.h[kind];
    if (kind === "video") {
      const cell = Math.max(18, Math.round(hh * 0.5625));
      for (let x = 0; x < w; x += cell) {
        const t = (sl + x + cell / 2) / pps();
        if (t > S.duration) break;
        let clip = (S.studio?.clips ?? []).find((c) => t >= c.start && t < c.start + c.dur) ?? S.studio?.clips?.at(-1);
        let frame = clip ? Math.max(1, Math.floor((t - clip.start) * 30) + 1) : 1;
        if (edlui.available()) { const fa = edlui.frameAt(t); clip = fa ? { name: fa.clip } : null; frame = fa?.frame ?? 1; }
        if (!clip || (S.cta && t >= S.cta.at)) { g.fillStyle = "#e7e7e1"; g.fillRect(x, 0, cell - 1, hh); continue; }
        g.fillStyle = "#d9d9d2"; g.fillRect(x, 0, cell - 1, hh);
        thumb(clip.name, frame).then((bm) => { if (bm && cv.isConnected) { const gg = cv.getContext("2d"); gg.drawImage(bm, x, 0, cell - 1, hh); } });
      }
    } else {
      const url = kind === "voice" ? activeUrl("voice") : activeUrl("music");
      const off = kind === "music" ? (X.audio?.musicOffset ?? 0) : 0;
      const color = kind === "voice" ? "#2f9e5b" : "#7a5bd6";
      g.fillStyle = kind === "voice" ? "#e8f5ec" : "#efeafb";
      g.fillRect(0, 0, w, hh);
      if (kind === "voice" && S.edl) { // the voice of the cut: each segment's source audio at its place
        for (const sg of Edl.layout(S.edl).segs) {
          if (sg.speed) continue; // retimed material is muted
          loadPeaks(`/footage/${sg.clip}/audio.wav`).then((p) => {
            if (!p || !cv.isConnected) return;
            const gg = cv.getContext("2d");
            gg.fillStyle = color;
            for (let x = Math.max(0, Math.floor(sg.start * pps() - sl)); x < Math.min(w, Math.ceil(sg.end * pps() - sl)); x += 1) {
              const t0 = (sl + x) / pps() - sg.start + sg.in, t1 = t0 + 1 / pps();
              let m = 0;
              for (let i = Math.max(0, Math.floor(t0 * p.perSec)); i <= Math.min(p.peaks.length - 1, Math.ceil(t1 * p.perSec)); i += 1) if (p.peaks[i] > m) m = p.peaks[i];
              const bh = Math.max(1, Math.min(1, m * 1.4) * (hh - 6));
              gg.fillRect(x, hh / 2 - bh / 2, 1, bh);
            }
          });
        }
        continue;
      }
      loadPeaks(url).then((p) => {
        if (!p || !cv.isConnected) return;
        const gg = cv.getContext("2d");
        gg.fillStyle = color;
        const mid = hh / 2;
        for (let x = 0; x < w; x += 1) {
          const t0 = (sl + x) / pps() - off, t1 = (sl + x + 1) / pps() - off;
          if (t1 < 0 || t0 > p.duration) continue;
          let m = 0;
          const i1 = Math.min(p.peaks.length - 1, Math.ceil(t1 * p.perSec));
          for (let i = Math.max(0, Math.floor(t0 * p.perSec)); i <= i1; i += 1) if (p.peaks[i] > m) m = p.peaks[i];
          const bh = Math.max(1, Math.min(1, m * 1.4) * (hh - 6));
          gg.fillRect(x, mid - bh / 2, 1, bh);
        }
      });
    }
  }
}

function movePlayhead() {
  if (!playhead) return;
  playhead.style.left = `${px(S.t)}px`;
  if (S.playing) {
    const x = px(S.t);
    if (x > scroll.scrollLeft + scroll.clientWidth * 0.92 || x < scroll.scrollLeft) scroll.scrollLeft = Math.max(0, x - scroll.clientWidth * 0.15);
  }
}

// ---------- pointer interactions ----------
function laneDown(e, tr) {
  if (e.target.closest(".blk") || e.button !== 0) return;
  const seekAt = (ev) => seek(clampT((ev.clientX - inner.getBoundingClientRect().left) / pps()));
  seekAt(e);
  if (tr === "motion" || tr === "captions") clearSel();
  else selectTrack(tr);
  const mv = (ev) => seekAt(ev);
  const up = () => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); };
  window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up);
}

function motionDown(e, el, bar) {
  if (e.button !== 0) return;
  e.stopPropagation();
  if (e.shiftKey) { selectElement(el.id, true); return; }
  if (!isSelected(el.id)) selectElement(el.id);
  if (S.locked.motion) return;
  const edge = e.target.classList.contains("edge") ? (e.target.classList.contains("l") ? "l" : "r") : null;
  const subK = e.target.classList.contains("sub") ? Number(e.target.dataset.k) : null;
  let ids = S.selection.ids.length > 1 && S.selection.ids.includes(el.id) && !edge && subK === null ? [...S.selection.ids] : [el.id];
  const x0 = e.clientX;
  let moved = false, dupDone = false;
  beginGesture();
  const startDrag = () => {
    if (e.altKey && !edge && subK === null && !dupDone) {
      dupDone = true;
      const copies = ids.map((id) => { const c = clone(byId(id)); c.id = newId(); return c; });
      setTransient([...S.motion, ...copies]);
      ids = copies.map((c) => c.id);
      select({ kind: "element", ids });
    }
  };
  let origs = null, w0 = null;
  const mv = (ev) => {
    if (!moved && Math.abs(ev.clientX - x0) < 3) return;
    if (!moved) { moved = true; startDrag(); origs = Object.fromEntries(ids.map((id) => [id, clone(byId(id))])); w0 = windowOf(origs[ids[0]]); }
    const dt = (ev.clientX - x0) / pps();
    const targets = snapTargets(ids);
    let next;
    if (subK !== null) {
      const o = origs[ids[0]];
      next = { [ids[0]]: setTick(o, subK, r3(clampT(snap(ticksOf(o)[subK].t + dt, ev, targets)))) };
    } else if (edge === "l") {
      next = { [ids[0]]: setStart(origs[ids[0]], r3(Math.min(clampT(snap(w0[0] + dt, ev, targets)), w0[1] - 0.1))) };
    } else if (edge === "r") {
      next = { [ids[0]]: { ...origs[ids[0]], out: r3(Math.max(clampT(snap(w0[1] + dt, ev, targets)), w0[0] + 0.1)) } };
    } else {
      const a = snap(w0[0] + dt, ev, targets), b = snap(w0[1] + dt, ev, targets);
      let sh = Math.abs(a - (w0[0] + dt)) <= Math.abs(b - (w0[1] + dt)) ? a - w0[0] : b - w0[1];
      if (ev.altKey) { sh = dt; hideSnap(); }
      const wins = ids.map((id) => windowOf(origs[id]));
      sh = Math.max(-Math.min(...wins.map((w) => w[0])), Math.min(sh, S.duration - Math.max(...wins.map((w) => w[1]))));
      next = Object.fromEntries(ids.map((id) => [id, shiftTime(origs[id], sh)]));
    }
    setTransient(S.motion.map((m) => next[m.id] ?? m), "gesture");
  };
  const up = () => {
    window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up);
    hideSnap();
    if (moved) endGesture(); else cancelGesture();
  };
  window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up);
  e.preventDefault();
}

function captionDown(e, sg, bar) {
  if (e.button !== 0) return;
  e.stopPropagation();
  selectCaption(sg.id);
  if (S.locked.captions) return;
  const edge = e.target.classList.contains("edge") ? (e.target.classList.contains("l") ? "l" : "r") : null;
  const x0 = e.clientX;
  let moved = false, orig = null;
  beginGesture();
  const mv = (ev) => {
    if (!moved && Math.abs(ev.clientX - x0) < 3) return;
    if (!moved) { moved = true; const doc = caps.materialized(); orig = clone(doc.segments.find((s) => s.id === sg.id)); if (!S.captions?.segments) setTransient(undefined, "gesture", { captions: doc }); }
    const dt = (ev.clientX - x0) / pps();
    const targets = snapTargets();
    let seg;
    if (edge === "l") seg = { ...orig, in: r3(Math.min(clampT(snap(orig.in + dt, ev, targets)), orig.out - 0.1)) };
    else if (edge === "r") seg = { ...orig, out: r3(Math.max(clampT(snap(orig.out + dt, ev, targets)), orig.in + 0.1)) };
    else {
      const a = snap(orig.in + dt, ev, targets), b = snap(orig.out + dt, ev, targets);
      let sh = Math.abs(a - (orig.in + dt)) <= Math.abs(b - (orig.out + dt)) ? a - orig.in : b - orig.out;
      if (ev.altKey) { sh = dt; hideSnap(); }
      sh = Math.max(-orig.in, Math.min(sh, S.duration - orig.out));
      seg = { ...orig, in: r3(orig.in + sh), out: r3(orig.out + sh), words: orig.words?.map((w) => ({ ...w, start: r3(w.start + sh), end: r3(w.end + sh) })) };
      if (!seg.words) delete seg.words;
    }
    const doc = clone(S.captions);
    doc.segments = doc.segments.map((s) => (s.id === sg.id ? fitSegWords(seg) : s));
    setTransient(undefined, "gesture", { captions: doc });
  };
  const up = () => {
    window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up);
    hideSnap();
    if (moved) endGesture(); else cancelGesture();
  };
  window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up);
  e.preventDefault();
}

// ---------- inline editing (double-click on a text block) ----------
function inlineEdit(bar, el) {
  const key = textKeyOf(el);
  if (!key) { selectElement(el.id); return; }
  startInput(bar, el[key] ?? "", (v) => commit(S.motion.map((m) => (m.id === el.id ? { ...clone(m), [key]: v } : m)), `inl:${el.id}`, "inline"));
}
function inlineEditCaption(bar, sg) {
  selectCaption(sg.id);
  startInput(bar, sg.text, (v) => caps.setText(sg.id, v));
}
function startInput(bar, value, done) {
  editing = true;
  const input = h("input", { class: "inline", type: "text", value });
  bar.replaceChildren(input);
  input.focus(); input.select();
  const finish = (ok) => {
    if (!editing) return;
    editing = false;
    const v = input.value;
    if (ok && v !== value && v.trim()) done(v.trim()); else render();
  };
  input.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter") finish(true); if (e.key === "Escape") finish(false); });
  input.addEventListener("blur", () => finish(true));
  input.addEventListener("pointerdown", (e) => e.stopPropagation());
}

// ---------- zoom ----------
export function setZoom(v, anchorClientX) {
  const rect = scroll.getBoundingClientRect();
  const ax = anchorClientX !== undefined ? anchorClientX - rect.left : scroll.clientWidth / 2;
  const tAt = (scroll.scrollLeft + ax) / pps();
  S.zoomPps = Math.max(6, Math.min(900, v));
  S.fitted = false;
  render();
  scroll.scrollLeft = tAt * pps() - ax;
  syncSlider();
}
export function fitZoom() {
  S.fitted = true;
  S.zoomPps = Math.max(6, (scroll.clientWidth - 24) / Math.max(1, S.duration));
  render();
  scroll.scrollLeft = 0;
  syncSlider();
}
const slider = $("zoomSlider");
const toSlider = (p) => (Math.log(p / 6) / Math.log(900 / 6)) * 100;
const fromSlider = (v) => 6 * Math.pow(900 / 6, v / 100);
function syncSlider() { if (slider) slider.value = String(toSlider(S.zoomPps)); }
slider?.addEventListener("input", () => setZoom(fromSlider(Number(slider.value))));
scroll.addEventListener("wheel", (e) => {
  if (e.ctrlKey || e.metaKey) { e.preventDefault(); setZoom(S.zoomPps * Math.exp(-e.deltaY * 0.0025), e.clientX); }
  else if (e.shiftKey && !e.deltaX) { e.preventDefault(); scroll.scrollLeft += e.deltaY; }
}, { passive: false });
scroll.addEventListener("scroll", () => { heads.style.transform = `translateY(${-scroll.scrollTop}px)`; if (!editing) drawCanvases(); });
new ResizeObserver(() => { if (S.fitted && S.duration) fitZoom(); else if (S.duration) { render(); } }).observe(scroll);

let q = false;
const rerender = () => { if (q) return; q = true; requestAnimationFrame(() => { q = false; render(); }); };
for (const topic of ["motion", "plan", "selection", "extras", "wordrange", "words"]) on(topic, rerender);
on("duration", () => { if (edlui.drag.active) return; if (S.fitted) fitZoom(); else rerender(); });
on("time", () => movePlayhead());
