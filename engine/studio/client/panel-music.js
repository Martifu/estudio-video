// Panel "Música": the music tracks of the video (versions) with "Usar" and a listen button.
import { on } from "./store.js";
import { h } from "./dom.js";
import { registerPanel, ICONS } from "./rail.js";
import { M, loadMedia } from "./media-store.js";
import { X, setActive } from "./extras.js";
import { importButton, dropZone } from "./panel-media.js";

let player = null, playingUrl = null;
function listen(url, btn) {
  if (player) { player.pause(); player = null; document.querySelectorAll(".mus-play.on").forEach((b) => b.classList.remove("on")); }
  if (playingUrl === url) { playingUrl = null; return; }
  playingUrl = url;
  player = new Audio(url);
  player.volume = 0.6;
  player.play().catch(() => {});
  player.onended = () => { playingUrl = null; btn.classList.remove("on"); };
  btn.classList.add("on");
}
/** Music tracks: extras entries of the slot "music" + library items with role "music" that have no entry yet. */
export function tracks() {
  const list = X.entries.filter((e) => e.slot === "music").map((e) => ({ id: e.id, name: e.id.replace(/^music:/, ""), url: e.url, note: e.note ?? "", usable: !e.invalid }));
  for (const it of M.items) if (it.kind === "audio" && it.role === "music" && !list.some((t) => t.url === it.url)) list.push({ id: it.id, name: it.name, url: it.url, note: "", usable: true, item: true });
  return list;
}
function mount(root) {
  const body = h("div", { class: "mus-list" });
  const draw = () => {
    const act = X.active?.music;
    const list = tracks();
    body.replaceChildren(...(list.length ? list.map((t) => {
      const on_ = t.id === act;
      const play = h("button", { class: "mus-play", title: "Escuchar", onclick: () => listen(t.url, play) }, "▶");
      return h("div", { class: `mus${on_ ? " active" : ""}` }, play, h("div", { class: "mus-meta" }, h("b", {}, t.name), h("span", { class: "muted tiny" }, on_ ? "En uso" : t.note || "Disponible")),
        on_ ? h("span", { class: "mbadge ok" }, "En uso") : h("button", { class: "pill", disabled: !t.usable, title: "Usar esta música en el video", onclick: () => setActive("music", t.id) }, "Usar"));
    }) : [h("div", { class: "pn-empty" }, "Todavía no hay música. Sube una pista con “+ Subir música”.")]));
  };
  root.append(h("div", { class: "pn-head" }, importButton("+ Subir música", { accept: "audio/*", forceAs: "music", title: "Subir una pista de música (mp3, wav…)" })), body,
    h("div", { class: "pn-hint" }, "Elige cuál música suena en el video. Los ajustes de volumen están en el encabezado de la pista Música."));
  draw();
  dropZone(root, { forceAs: "music", text: "Suelta aquí tu música" });
  on("extras", draw); on("media", draw);
  if (!M.loaded) loadMedia().catch(() => {});
}
registerPanel({ id: "music", label: "Música", icon: ICONS.music, order: 20, title: "Música del video", mount });
