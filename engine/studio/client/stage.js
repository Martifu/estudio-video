// Direct manipulation on the preview: select (hit-test against the planner's boxes), move, resize, dimensionLine endpoints, caption
// block (drag y/x, width), draggable platform-zone lines, inline text editing, click-to-comment, context menu.
// Everything lives in canvas px inside #overlay (scaled with the stage).
import { S, on, emit, selectElement, select, selectCaption, selectTrack, clearSel, selected, beginGesture, endGesture, cancelGesture, setTransient, replaceEl, toast, clone, byId, isSelected, effZones, commit } from "./store.js";
import { SAFE, TYPES, pinPatch, resizePatch, canResize, moveDimension, dimensionAt, isPinned, supportsPin, textKeyOf, CAPTION_DEFAULTS, zonesOf } from "./schema.js";
import * as caps from "./captions.js";
import * as ops from "./ops.js";
import { api } from "./api.js";
import { showMenu } from "./menus.js";
import { h } from "./dom.js";
import { selectLogo, selectCta } from "./store.js";
import { logoRect, logoWindow, effLogo, setLogo, setLogoTransient, pickLogoFile } from "./logo.js";

const overlay = document.getElementById("overlay");
let drag = null;

const pt = (e) => {
  const r = overlay.getBoundingClientRect();
  return { x: ((e.clientX - r.left) / r.width) * 1080, y: ((e.clientY - r.top) / r.height) * 1920 };
};
const inside = (r, p, m = 0) => p.x >= r.x - m && p.x <= r.x + r.w + m && p.y >= r.y - m && p.y <= r.y + r.h + m;

/** Index of the topmost/smallest element drawn at time t under point p, from the planner's report (no geometry duplicated here). */
export function hitTest(p, t = S.t) {
  const rep = S.plan?.report.elements ?? [];
  let best = -1, bestArea = Infinity;
  rep.forEach((e, i) => {
    if (!e.rect || !e.window || t < e.window[0] - 0.02 || t > e.window[1] + 0.02) return;
    if (S.cta && t >= S.cta.at) return;
    if (!inside(e.rect, p, e.type === "dimensionLine" ? 24 : 4)) return;
    const a = e.rect.w * e.rect.h;
    if (a <= bestArea) { best = i; bestArea = a; }
  });
  return best;
}
const capHit = (p) => S.capRect && inside(S.capRect, p, 14);
/** The logo bug is a selectable pseudo-element: its box comes from the planner (plan.logo.rect), visible between its in / out times. */
function logoHit(p, t = S.t) {
  const r = logoRect();
  if (!r || S.logo?.hidden || (S.cta && t >= S.cta.at)) return false;
  const [a, b] = logoWindow();
  return t >= a - 0.02 && t <= b + 0.02 && inside(r, p, 6);
}

const div = (cls, css = {}, parent = overlay) => {
  const d = document.createElement("div");
  d.className = cls;
  for (const [k, v] of Object.entries(css)) d.style[k] = typeof v === "number" ? `${v}px` : v;
  parent.appendChild(d);
  return d;
};

export function draw() {
  const keep = [...overlay.querySelectorAll(".cbox, .iedit")];
  overlay.replaceChildren(...keep);
  overlay.classList.toggle("commenting", S.commentMode);
  const z = effZones();
  const zoneSel = S.selection.kind === "zones";
  if (S.guides) {
    div("guide band", { left: 0, top: 0, width: 1080, height: z.top }).innerHTML = `<span class="tag">arriba ${z.top}</span>`;
    div("guide band", { left: 0, top: 1920 - z.bottom, width: 1080, height: z.bottom }).innerHTML = `<span class="tag">abajo ${z.bottom}</span>`;
    div("guide band side", { left: 0, top: z.top, width: z.left, height: 1920 - z.top - z.bottom });
    div("guide band side", { left: 1080 - z.right, top: z.top, width: z.right, height: 1920 - z.top - z.bottom });
    div("guide free", { left: z.left, top: z.top + 130, width: 1080 - z.left - z.right, height: 1920 - z.bottom - z.top - 130 });
    for (const [k, css] of [["top", { left: 0, top: z.top - 12, width: 1080, height: 24 }], ["bottom", { left: 0, top: 1920 - z.bottom - 12, width: 1080, height: 24 }],
      ["left", { left: z.left - 12, top: z.top, width: 24, height: 1920 - z.top - z.bottom }], ["right", { left: 1080 - z.right - 12, top: z.top, width: 24, height: 1920 - z.top - z.bottom }]]) {
      const l = div(`zoneline ${k}${zoneSel ? " on" : ""}`, css);
      l.dataset.z = k;
      l.title = "Arrastra para ajustar la zona de la plataforma";
    }
  }
  // selected elements
  for (const id of S.selection.kind === "element" ? S.selection.ids : []) {
    const i = S.motion.findIndex((e) => e.id === id);
    const el = S.motion[i];
    const rep = S.plan?.report.elements[i];
    if (!el || !rep?.rect) continue;
    const primary = id === S.selection.ids[0];
    const live = rep.window && S.t >= rep.window[0] - 0.02 && S.t <= rep.window[1] + 0.02;
    const r = rep.rect;
    const box = div(`selbox${live ? "" : " ghost"}`, { left: r.x, top: r.y, width: r.w, height: r.h });
    if (primary && (supportsPin(el) || el.type === "panel")) div("chip", {}, box).textContent = isPinned(el) ? "fijado" : "auto";
    if (!primary) continue;
    if (el.type === "dimensionLine") {
      const d = dimensionAt(el, S.t);
      for (const k of ["from", "to"]) div("handle round", { left: d[k].x, top: d[k].y }).dataset.h = k;
    } else if (canResize(el)) div("handle", { left: r.x + r.w, top: r.y + r.h }).dataset.h = "resize";
  }
  // logo bug (selected from the stage, the inspector or the timeline)
  if (S.selection.kind === "logo") {
    const r = logoRect();
    if (r) {
      const [a, b] = logoWindow();
      const live = !S.logo?.hidden && S.t >= a - 0.02 && S.t <= b + 0.02 && !(S.cta && S.t >= S.cta.at);
      const box = div(`selbox${live ? "" : " ghost"}`, { left: r.x, top: r.y, width: r.w, height: r.h });
      div("chip", {}, box).textContent = S.logo?.x !== undefined ? "fijado" : "auto";
      div("handle", { left: r.x + r.w, top: r.y + r.h }).dataset.h = "logoresize";
    }
  }
  if (S.selection.kind === "cta" && S.cta && S.t >= S.cta.at) div("selbox", { left: 6, top: 6, width: 1068, height: 1908 });
  // caption block
  if (S.capRect && (S.selection.kind === "caption" || S.selection.kind === "track" && S.selection.track === "captions")) {
    const st = caps.capStyle();
    const cr = S.capRect;
    div("selbox cap", { left: cr.x - 8, top: cr.y - 8, width: cr.w + 16, height: cr.h + 16 });
    const mw = st.maxW, cx = st.cx;
    div("capwidth", { left: cx - mw / 2, top: cr.y - 14, width: mw, height: cr.h + 28 });
    div("handle capw", { left: cx + mw / 2, top: cr.y + cr.h / 2 }).dataset.h = "capwidth";
    div("handle capw", { left: cx - mw / 2, top: cr.y + cr.h / 2 }).dataset.h = "capwidthL";
  }
  S.comments.forEach((c) => {
    if (c.x == null || Math.abs(c.t - S.t) > 1.2) return;
    div(`pin${c.resolved ? " done" : ""}`, { left: c.x, top: c.y }).title = c.text;
  });
}

// ---------- gestures ----------
overlay.addEventListener("mousedown", (e) => { if (!e.target.closest(".cbox, .iedit")) e.preventDefault(); });
overlay.addEventListener("pointerdown", (e) => {
  if (e.target.closest(".cbox, .iedit") || e.button !== 0) return;
  const p = pt(e);
  if (S.commentMode) { openCommentBox(p); return; }
  const tg = e.target.dataset ?? {};
  if (tg.z) { overlay.setPointerCapture(e.pointerId); startZone(tg.z, p); return; }
  const el = selected();
  const i = el ? S.motion.findIndex((x) => x.id === el.id) : -1;
  if (tg.h === "capwidth" || tg.h === "capwidthL") { overlay.setPointerCapture(e.pointerId); startCap("width", p, tg.h === "capwidthL"); return; }
  if (tg.h === "logoresize") { overlay.setPointerCapture(e.pointerId); startLogo("resize", p); return; }
  if (logoHit(p)) {
    if (S.selection.kind !== "logo") selectLogo();
    if (!S.locked.logo) { overlay.setPointerCapture(e.pointerId); startLogo("move", p); }
    return;
  }
  if (tg.h && el) { overlay.setPointerCapture(e.pointerId); startDrag(tg.h === "resize" ? "resize" : tg.h === "from" ? "dimFrom" : "dimTo", p, el, i, e); return; }
  const hit = hitTest(p);
  if (hit >= 0) {
    const target = S.motion[hit];
    if (e.shiftKey) { selectElement(target.id, true); return; }
    if (!isSelected(target.id)) selectElement(target.id);
    if (S.locked.motion) return;
    overlay.setPointerCapture(e.pointerId);
    startDrag("move", p, target, hit, e);
    return;
  }
  if (capHit(p)) {
    const seg = caps.segAt(S.t);
    selectCaption(seg?.id ?? null);
    if (!S.locked.captions) { overlay.setPointerCapture(e.pointerId); startCap("move", p); }
    return;
  }
  if (S.cta && S.t >= S.cta.at) { selectCta(); return; }
  clearSel();
});

function startLogo(kind, p) {
  const rect = logoRect();
  if (!rect) return;
  drag = { cat: "logo", kind, p0: p, rect: { ...rect }, l0: effLogo(), moved: false };
  beginGesture();
}
function startDrag(kind, p, el, i, e) {
  drag = { cat: "el", kind, p0: p, id: el.id, src: clone(el), planEl: S.plan.elements[i], rect: { ...S.plan.report.elements[i].rect }, moved: false, shift: e.shiftKey, t: S.t };
  beginGesture();
}
function startZone(k, p) {
  drag = { cat: "zone", k, moved: false, p0: p, base: effZones() };
  beginGesture();
}
function startCap(kind, p, left = false) {
  const st = caps.capStyle();
  drag = { cat: "cap", kind, left, p0: p, st: { ...st }, moved: false };
  beginGesture();
}
overlay.addEventListener("pointermove", (e) => {
  if (!drag) return;
  const p = pt(e);
  const dx = p.x - drag.p0.x, dy = p.y - drag.p0.y;
  if (!drag.moved && Math.hypot(dx, dy) * (S.scale ?? 1) < 3) return;
  drag.moved = true;
  if (drag.cat === "zone") {
    const b = drag.base;
    const z = { ...b };
    if (drag.k === "top") z.top = Math.round(Math.max(0, Math.min(700, p.y)));
    if (drag.k === "bottom") z.bottom = Math.round(Math.max(0, Math.min(900, 1920 - p.y)));
    if (drag.k === "left") z.left = Math.round(Math.max(0, Math.min(400, p.x)));
    if (drag.k === "right") z.right = Math.round(Math.max(0, Math.min(400, 1080 - p.x)));
    if (z.top + z.bottom > 1500) return;
    setTransient(undefined, "gesture", { zones: { top: z.top, bottom: z.bottom, left: z.left, right: z.right } });
    return;
  }
  if (drag.cat === "logo") {
    const { rect, l0 } = drag;
    if (drag.kind === "move") {
      // First move pins x / y (the box does not jump); light snap to the safe margins and the centre.
      const z = effZones();
      let x = Math.max(0, Math.min(1080 - rect.w, rect.x + dx));
      const y = Math.max(0, Math.min(1920 - rect.h, rect.y + dy));
      for (const c of [z.left, 1080 - z.right - rect.w, (1080 - rect.w) / 2]) if (Math.abs(c - x) < 10 / (S.scale || 1)) x = c;
      setLogoTransient({ x: Math.round(x), y: Math.round(y) });
    } else {
      const f = Math.max(0.2, Math.min(4, (rect.w + dx) / rect.w));
      setLogoTransient({ x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(l0.w * f), h: Math.round(l0.h * f) });
    }
    return;
  }
  if (drag.cat === "cap") {
    const doc = clone(S.captions) ?? { style: {}, segments: null };
    doc.style = { ...(doc.style ?? {}) };
    if (drag.kind === "move") { doc.style.y = Math.round(drag.st.y + dy); doc.style.cx = Math.round(drag.st.cx + dx); }
    else doc.style.maxW = Math.round(Math.max(300, Math.min(1040, drag.st.maxW + 2 * (drag.left ? -dx : dx))));
    setTransient(undefined, "gesture", { captions: doc });
    return;
  }
  const { src, planEl, rect } = drag;
  let patch = {};
  if (drag.kind === "move") {
    if (src.type === "dimensionLine") patch = moveDimension(src, dx, dy);
    else if (!TYPES[src.type].pin) return;
    else {
      patch = pinPatch(src, planEl, rect);
      if (patch.x !== undefined) patch.x = Math.round(patch.x + dx);
      if (patch.y !== undefined) patch.y = Math.round(patch.y + dy);
      if (patch.box) patch.box = { ...patch.box, x: Math.round(patch.box.x + dx), y: Math.round(patch.box.y + dy) };
    }
  } else if (drag.kind === "resize") {
    const f = Math.max(0.25, Math.min(4, (rect.w + dx) / rect.w));
    patch = { ...pinPatch(src, planEl, rect), ...resizePatch(src, planEl, f, { shift: drag.shift }) };
  } else {
    const key = drag.kind === "dimFrom" ? "from" : "to";
    const np = { x: Math.round(p.x), y: Math.round(p.y) };
    if (src.track?.length) {
      const k = src.track.reduce((m, key2, j) => (Math.abs(key2.t - drag.t) < Math.abs(src.track[m].t - drag.t) ? j : m), 0);
      patch = { track: src.track.map((key2, j) => (j === k ? { ...key2, [key]: np } : key2)) };
    } else patch = { [key]: np };
  }
  setTransient(replaceEl(drag.id, (c) => Object.assign(c, patch)), "gesture");
});
function endDrag() {
  if (!drag) return;
  const { moved } = drag;
  drag = null;
  if (moved) endGesture(); else cancelGesture();
  emit("selection");
}
overlay.addEventListener("pointerup", endDrag);
overlay.addEventListener("pointercancel", endDrag);

// ---------- inline text editing ----------
overlay.addEventListener("dblclick", (e) => {
  if (e.target.closest(".cbox, .iedit")) return;
  const p = pt(e);
  const hit = hitTest(p);
  if (hit >= 0) {
    const el = S.motion[hit];
    const key = textKeyOf(el);
    selectElement(el.id);
    if (key) editInline(S.plan.report.elements[hit].rect, el[key] ?? "", (v) => commit(S.motion.map((m) => (m.id === el.id ? { ...clone(m), [key]: v } : m)), `inl:${el.id}`, "inline"));
    return;
  }
  if (capHit(p)) {
    const seg = caps.segAt(S.t);
    if (!seg) return;
    selectCaption(seg.id);
    editInline(S.capRect, seg.text, (v) => caps.setText(seg.id, v));
  }
});
function editInline(rect, value, done) {
  overlay.querySelector(".iedit")?.remove();
  const w = Math.max(rect.w, 520);
  const box = div("iedit", { left: Math.max(20, Math.min(rect.x + rect.w / 2 - w / 2, 1080 - w - 20)), top: Math.max(20, rect.y + rect.h / 2 - 40), width: w });
  const input = h("input", { type: "text", value });
  box.append(input);
  input.focus(); input.select();
  let closed = false;
  const fin = (ok) => {
    if (closed) return;
    closed = true;
    const v = input.value.trim();
    box.remove();
    if (ok && v && v !== value) done(v);
  };
  input.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter") fin(true); if (e.key === "Escape") fin(false); });
  input.addEventListener("blur", () => fin(true));
}

// ---------- context menu ----------
overlay.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  const p = pt(e);
  const hit = hitTest(p);
  if (logoHit(p)) {
    selectLogo();
    showMenu(e.clientX, e.clientY, [
      { label: "Reemplazar logo…", onClick: pickLogoFile },
      { label: "Ocultar logo", onClick: () => setLogo({ hidden: true }) },
      { label: "Soltar posición", disabled: S.logo?.x === undefined && S.logo?.y === undefined, onClick: () => setLogo({ x: undefined, y: undefined }) }
    ]);
  } else if (hit >= 0) {
    const el = S.motion[hit];
    if (!isSelected(el.id)) selectElement(el.id);
    showMenu(e.clientX, e.clientY, [
      { label: "Editar texto", hint: "doble clic", disabled: !textKeyOf(el), onClick: () => { const k = textKeyOf(el); editInline(S.plan.report.elements[hit].rect, el[k] ?? "", (v) => commit(S.motion.map((m) => (m.id === el.id ? { ...clone(m), [k]: v } : m)), null, "inline")); } },
      { label: "Duplicar", onClick: () => ops.duplicate([el.id]) },
      { label: el.hidden ? "Mostrar" : "Ocultar", onClick: () => ops.toggleHide([el.id]) },
      { label: "Soltar posición", disabled: !isPinned(el), onClick: () => ops.unpin(el.id) },
      "-", { label: "Eliminar", danger: true, onClick: () => ops.remove([el.id]) }
    ]);
  } else if (capHit(p)) {
    const seg = caps.segAt(S.t);
    selectCaption(seg?.id ?? null);
    showMenu(e.clientX, e.clientY, [
      { label: "Editar texto", disabled: !seg, onClick: () => editInline(S.capRect, seg.text, (v) => caps.setText(seg.id, v)) },
      { label: "Dividir en el cursor", hint: "S", disabled: !seg, onClick: () => caps.split(seg.id, S.t) },
      { label: "Ocultar este subtítulo", disabled: !seg, onClick: () => caps.toggleHidden(seg.id) }
    ]);
  } else {
    showMenu(e.clientX, e.clientY, [
      { label: "Añadir palabra clave aquí", onClick: () => ops.addAt("keywordPop") },
      { label: "Añadir etiqueta aquí", onClick: () => ops.addAt("tagPill") },
      { label: "Comentar aquí", onClick: () => { S.commentMode = true; emit("comments"); } }
    ]);
  }
});

// ---------- comments ----------
function openCommentBox(p) {
  overlay.querySelector(".cbox")?.remove();
  const box = div("cbox", { left: Math.min(p.x, 1080 - 320), top: Math.min(p.y, 1920 - 140) });
  box.innerHTML = '<textarea placeholder="Escribe el comentario…"></textarea><div class="row"><button class="small" data-a="cancel">Cancelar</button><button class="small accent" data-a="send">Enviar</button></div>';
  const ta = box.querySelector("textarea");
  setTimeout(() => ta.focus(), 0);
  const hit = hitTest(p);
  const send = async () => {
    const text = ta.value.trim();
    if (!text) return;
    const el = hit >= 0 ? S.motion[hit] : null;
    try {
      const { comment } = await api("POST", "/api/comment", { t: Number(S.t.toFixed(3)), x: Math.round(p.x), y: Math.round(p.y), text, elementId: el?.id ?? null, elementType: el?.type ?? null });
      S.comments.push(comment);
      box.remove();
      S.commentMode = false;
      emit("comments");
      toast("Comentario guardado");
    } catch (err) { toast(`No se pudo guardar: ${err.message}`); }
  };
  box.addEventListener("click", (e) => { if (e.target.dataset.a === "send") send(); if (e.target.dataset.a === "cancel") box.remove(); });
  ta.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } if (e.key === "Escape") box.remove(); });
}

for (const topic of ["selection", "plan", "time", "fit", "comments", "rendered"]) on(topic, () => { if (!(S.playing && (topic === "time" || topic === "rendered")) && !(drag && topic === "rendered")) draw(); });
export { draw as redraw };
