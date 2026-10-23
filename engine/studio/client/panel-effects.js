// Panel "Efectos": sound library (bundled + kit + your own). Click = listen, drag onto the Efectos lane = add there.
import { S, on, toast } from "./store.js";
import { h } from "./dom.js";
import { api } from "./api.js";
import { openModal, closeModal } from "./menus.js";
import { registerPanel, ICONS } from "./rail.js";
import { M, soundList, loadMedia } from "./media-store.js";
import { X } from "./extras.js";
import * as sfxlane from "./sfxlane.js";
import { importButton, dropZone } from "./panel-media.js";
import { setDragPayload, MIME } from "./dnd.js";

const PLAY = '<svg viewBox="0 0 16 16" width="12" height="12"><path d="M4 2.5l9 5.5-9 5.5z" fill="currentColor"/></svg>';

function row(s) {
  const r = h("div", { class: `snd${sfxlane.pick.src === s.src ? " on" : ""}`, draggable: "true", title: `${s.label}\nClic: escuchar · arrástralo al carril Efectos` },
    h("span", { class: "snd-play", html: PLAY }), h("span", { class: "snd-name" }, s.label), s.dur != null ? h("span", { class: "snd-dur muted" }, `${s.dur < 1 ? s.dur.toFixed(2) : s.dur.toFixed(1)} s`) : null,
    h("button", { class: "dots", title: "Agregar en el cursor", onclick: (e) => { e.stopPropagation(); sfxlane.pick.src = s.src; sfxlane.addAtCursor(s.src); } }, "+"));
  r.addEventListener("click", () => { sfxlane.pick.src = s.src; sfxlane.audition(s.src); for (const x of r.parentElement.parentElement.querySelectorAll(".snd")) x.classList.remove("on"); r.classList.add("on"); });
  r.addEventListener("dragstart", (e) => { const p = { src: s.src, label: s.label }; sfxlane.pick.src = s.src; setDragPayload("sfx", p); e.dataTransfer.setData(MIME.sfx, JSON.stringify(p)); e.dataTransfer.effectAllowed = "copy"; });
  r.addEventListener("dragend", () => setDragPayload(null));
  return r;
}

function generateForm() {
  const prompt = h("textarea", { placeholder: "Ej.: un pop suave de burbuja, seco y corto", title: "Describe el sonido con tus palabras" });
  const dur = h("input", { type: "number", min: 0.3, max: 10, step: 0.1, placeholder: "Opcional (segundos)", title: "Cuánto debe durar, si lo sabes" });
  const label = h("input", { type: "text", placeholder: "Opcional", title: "Un nombre corto para reconocerlo después" });
  const msg = h("div", { class: "cost free", hidden: true });
  const ok = h("button", { class: "pill dark", title: "Enviar la solicitud" }, "Generar");
  ok.onclick = async () => {
    const p = prompt.value.trim();
    if (!p) { toast("Escribe cómo debe sonar"); return; }
    const params = { prompt: p };
    if (dur.value !== "") params.duration_s = Number(dur.value);
    if (label.value.trim()) params.label = label.value.trim();
    ok.disabled = true;
    try {
      await api("POST", "/api/request", { action: "sfx_new", params, confirmed: true });
      msg.hidden = false; msg.textContent = "Se envió la solicitud; aparecerá aquí cuando esté lista";
      ok.hidden = true;
    } catch (e) { ok.disabled = false; toast(e.data?.error ?? e.message, 4000); }
  };
  openModal(h("div", {},
    h("h2", {}, "Generar efecto"),
    h("div", { class: "field col" }, h("label", {}, "¿Cómo suena?"), prompt),
    h("div", { class: "field" }, h("label", {}, "Duración"), dur),
    h("div", { class: "field" }, h("label", {}, "Nombre"), label),
    msg,
    h("div", { class: "row" }, h("button", { onclick: closeModal }, "Cerrar"), ok)));
  prompt.focus();
}

function mount(root) {
  const body = h("div", { class: "snd-list" });
  const draw = () => {
    const list = soundList();
    const groups = new Map();
    for (const s of list) (groups.get(s.group) ?? groups.set(s.group, []).get(s.group)).push(s);
    const mine = groups.get("Mis sonidos") ?? [];
    groups.delete("Mis sonidos");
    const pend = (X.requests ?? []).filter((r) => r.action === "sfx_new" && ["pending", "approved", "running"].includes(r.status));
    const kids = [];
    kids.push(h("div", { class: "snd-group" }, h("div", { class: "snd-gt" }, "Mis sonidos", importButton("+ Subir sonido", { accept: "audio/*", forceAs: "sfx", title: "Subir un sonido tuyo (mp3, wav…)" })),
      ...(mine.length ? mine.map(row) : [h("div", { class: "pn-empty small" }, "Aquí aparecen los sonidos que subas o generes.")]),
      ...pend.map((r) => h("div", { class: "snd pending", title: "La solicitud está en cola" }, h("span", { class: "snd-name" }, `Generando: ${r.params?.prompt ?? "efecto"}`)))));
    for (const [g, items] of groups) kids.push(h("div", { class: "snd-group" }, h("div", { class: "snd-gt" }, g), ...items.map(row)));
    if (!list.length) kids.push(h("div", { class: "pn-empty" }, "Cargando sonidos…"));
    body.replaceChildren(...kids);
  };
  root.append(
    h("div", { class: "pn-head" }, h("button", { class: "pill dark", title: "Pedir un efecto nuevo describiéndolo", onclick: generateForm }, "Generar efecto…")),
    body, h("div", { class: "pn-hint" }, "Clic para escuchar. Arrastra un sonido al carril Efectos de la línea de tiempo para ponerlo en ese momento."));
  draw();
  dropZone(root, { forceAs: "sfx", text: "Suelta aquí tus sonidos" });
  on("media", draw); on("extras", draw);
  if (!M.loaded) loadMedia().catch(() => {});
}
registerPanel({ id: "effects", label: "Efectos", icon: ICONS.effects, order: 50, title: "Efectos de sonido", mount });
