// Panel "Media": the library of clips/images/audio, import (button or drag & drop from the OS), cards you can drag onto the Video lane.
import { S, on, toast } from "./store.js";
import { h } from "./dom.js";
import { showMenu, openModal, closeModal } from "./menus.js";
import { registerPanel, ICONS } from "./rail.js";
import { M, uploadFile, fileKind, loadMedia } from "./media-store.js";
import * as edlui from "./edl-ui.js";
import { X, setActive, entry } from "./extras.js";
import * as sfxlane from "./sfxlane.js";
import { setDragPayload } from "./dnd.js";

const state = { q: "", filter: "all", sort: "recent" };
const fmtDur = (d) => (d == null ? "" : d < 60 ? `${d.toFixed(1)} s` : `${Math.floor(d / 60)}:${String(Math.round(d % 60)).padStart(2, "0")}`);
const GLYPH = '<svg viewBox="0 0 80 40" width="80" height="40" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round">' + [6, 14, 22, 10, 28, 16, 8, 24, 14, 20, 6, 12].map((a, i) => `<path d="M${6 + i * 6} ${20 - a / 2}v${a}"/>`).join("") + "</svg>";

/** Ask what an audio file is. Resolves to "music"|"voice"|"sfx"|null. */
export function askAudioRole(name) {
  return new Promise((resolve) => {
    const done = (v) => { closeModal(); resolve(v); };
    const btn = (label, v, tip) => h("button", { class: "pill", title: tip, onclick: () => done(v) }, label);
    openModal(h("div", {},
      h("h2", {}, "¿Qué es este audio?"),
      h("p", { class: "muted" }, name),
      h("div", { class: "ask-row" }, btn("Música", "music", "Música de fondo del video"), btn("Voz", "voice", "Una voz o narración"), btn("Efecto de sonido", "sfx", "Un sonido corto: clic, golpe, whoosh…")),
      h("div", { class: "row" }, h("button", { onclick: () => done(null) }, "Cancelar"))));
  });
}
/** Upload a list of files; audio asks its role unless `forceAs` says it. */
export async function importFiles(files, forceAs = null) {
  for (const f of [...files]) {
    let as = null;
    if (fileKind(f) === "audio") { as = forceAs ?? (await askAudioRole(f.name)); if (!as) continue; }
    await uploadFile(f, as);
  }
}
/** Hook an element so files dragged from the OS onto it are imported (dashed overlay "Suelta aquí tus archivos"). */
export function dropZone(el, { forceAs = null, text = "Suelta aquí tus archivos" } = {}) {
  const veil = h("div", { class: "drop-veil", hidden: true }, h("div", {}, text));
  el.append(veil);
  let depth = 0;
  const isFiles = (e) => e.dataTransfer?.types?.includes("Files");
  el.addEventListener("dragenter", (e) => { if (!isFiles(e)) return; e.preventDefault(); depth += 1; veil.hidden = false; });
  el.addEventListener("dragover", (e) => { if (isFiles(e)) e.preventDefault(); });
  el.addEventListener("dragleave", (e) => { if (!isFiles(e)) return; depth = Math.max(0, depth - 1); if (!depth) veil.hidden = true; });
  el.addEventListener("drop", (e) => { if (!isFiles(e)) return; e.preventDefault(); depth = 0; veil.hidden = true; importFiles(e.dataTransfer.files, forceAs); });
}
/** A "+ Importar" pill with a hidden multi-file input. */
export function importButton(label, { accept = "", forceAs = null, title = "Elige archivos de tu computadora" } = {}) {
  const input = h("input", { type: "file", multiple: true, accept, hidden: true });
  input.onchange = () => { importFiles(input.files, forceAs); input.value = ""; };
  return h("span", {}, input, h("button", { class: "pill dark", title, onclick: () => input.click() }, label));
}

const usedClips = () => new Set(edlui.current().segments.map((s) => s.clip));
const clipOf = (it) => it.clip ?? null;
const thumbOf = (it) => it.thumb ?? (it.kind === "video" && it.clip ? `/footage/${it.clip}/0001.jpg` : it.kind === "image" ? it.url : null);

function cardMenu(ev, it) {
  const r = ev.currentTarget.getBoundingClientRect();
  const items = [];
  const clip = clipOf(it);
  if (clip && (it.kind === "video" || it.kind === "image")) {
    items.push({ label: "Agregar al final", onClick: () => edlui.insertClip(clip, "end") }, { label: "Agregar en el cursor", onClick: () => edlui.insertClip(clip, "cursor") });
  }
  if (it.role === "generated") {
    const e = X.entries.find((x) => x.url === it.url || x.id === it.id);
    items.push({ label: "Usar esta versión", disabled: !e, onClick: () => e && setActive(e.slot, e.id) });
  }
  if (it.kind === "audio") {
    if (it.role === "music") { const e = X.entries.find((x) => x.slot === "music" && (x.url === it.url || x.id === it.id)); items.push({ label: "Usar como música", disabled: !e, onClick: () => e && setActive("music", e.id) }); }
    if (it.role === "sfx") { const s = sfxlane.srcOfItem(it); items.push({ label: "Agregar como efecto en el cursor", onClick: () => s && sfxlane.addAtCursor(s) }); }
  }
  if (!items.length) items.push({ label: "Sin acciones", disabled: true });
  showMenu(r.left, r.bottom + 4, items);
}

function card(it, used) {
  const clip = clipOf(it);
  const canDrag = clip && (it.kind === "video" || it.kind === "image");
  const th = thumbOf(it);
  const c = h("div", { class: `mcard ${it.kind}`, draggable: canDrag ? "true" : false, title: canDrag ? `${it.name}\nArrástralo a la línea de tiempo (carril Video) o usa …` : it.name });
  const t = h("div", { class: "mthumb" });
  if (th) t.append(h("img", { src: th, alt: "", loading: "lazy", draggable: false }));
  else t.append(h("div", { class: "glyph", html: GLYPH }));
  if (it.dur != null && it.kind !== "image") t.append(h("span", { class: "mdur" }, fmtDur(it.dur)));
  if (clip && used.has(clip)) t.append(h("span", { class: "mbadge", title: "Este material ya está en el video" }, "Agregado"));
  if (it.role === "generated") t.append(h("span", { class: "mbadge gen", title: "Versión generada" }, "Generado"));
  c.append(t, h("div", { class: "mmeta" }, h("span", { class: "mname" }, it.name), h("button", { class: "dots", title: "Más opciones", onclick: (e) => { e.stopPropagation(); cardMenu(e, it); } }, "···")));
  if (canDrag) {
    c.addEventListener("dragstart", (e) => {
      const p = { clip, dur: it.dur ?? edlui.binDur(clip) };
      setDragPayload("clip", p);
      e.dataTransfer.setData("application/x-estudio-clip", JSON.stringify(p));
      e.dataTransfer.effectAllowed = "copy";
    });
    c.addEventListener("dragend", () => setDragPayload(null));
    c.addEventListener("dblclick", () => edlui.insertClip(clip, "end"));
  }
  return c;
}
function uploadCard(u) {
  return h("div", { class: "mcard uploading", title: u.name },
    h("div", { class: "mthumb" }, h("div", { class: "glyph", html: GLYPH }), h("div", { class: "uprog" }, h("div", { style: { width: `${Math.round(u.progress * 100)}%` } })), h("span", { class: "mbadge" }, u.state === "procesando" ? "Procesando…" : `${Math.round(u.progress * 100)}%`)),
    h("div", { class: "mmeta" }, h("span", { class: "mname" }, u.name)));
}

function mount(root) {
  const list = h("div", { class: "mgrid" });
  const search = h("input", { type: "text", class: "psearch", placeholder: "Buscar", title: "Busca por nombre", oninput: (e) => { state.q = e.target.value.toLowerCase(); draw(); } });
  const sortBtn = h("button", { class: "ico-btn", title: "Cambiar el orden (recientes / nombre)", onclick: () => { state.sort = state.sort === "recent" ? "name" : "recent"; sortBtn.textContent = state.sort === "recent" ? "⇅ Recientes" : "⇅ A–Z"; draw(); } }, "⇅ Recientes");
  const chips = h("div", { class: "chips" });
  const drawChips = () => {
    chips.replaceChildren(...[["all", "Todo"], ["video", "Video"], ["image", "Imágenes"], ["audio", "Audio"]].map(([k, l]) => h("button", { class: `chip2${state.filter === k ? " on" : ""}`, title: `Mostrar: ${l}`, onclick: () => { state.filter = k; drawChips(); draw(); } }, l)));
  };
  const draw = () => {
    const used = usedClips();
    let items = M.items.filter((it) => (state.filter === "all" || it.kind === state.filter) && (!state.q || String(it.name).toLowerCase().includes(state.q)));
    items = [...items].sort(state.sort === "name" ? (a, b) => String(a.name).localeCompare(String(b.name)) : (a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")));
    const kids = [...M.uploads.map(uploadCard), ...items.map((it) => card(it, used))];
    list.replaceChildren(...(kids.length ? kids : [h("div", { class: "pn-empty" }, M.loaded ? "Aquí aparecerán tus videos, imágenes y audios. Usa “+ Importar” o suelta archivos." : "Cargando…")]));
  };
  root.append(
    h("div", { class: "pn-head" }, importButton("+ Importar", { title: "Importar videos, imágenes o audios" }), sortBtn),
    search, chips, list, h("div", { class: "pn-hint" }, "Arrastra una tarjeta al carril Video para insertarla donde la sueltes."));
  drawChips(); draw();
  dropZone(root);
  let q = false;
  const again = () => { if (q) return; q = true; requestAnimationFrame(() => { q = false; draw(); }); };
  on("media", again);
  on("motion", again);
  if (!M.loaded) loadMedia().catch(() => {});
}

registerPanel({ id: "media", label: "Media", icon: ICONS.media, order: 10, title: "Tus videos, imágenes y audios", mount });
