// History and comments lists (opened from the ⋯ menu).
import { S, commit, toast, selectElement, emit, clone } from "./store.js";
import { api, get } from "./api.js";
import { h, esc } from "./dom.js";
import { openModal, closeModal } from "./menus.js";
import { seek } from "./preview.js";

export async function refreshComments() {
  S.comments = (await get("/api/comments")).comments;
  emit("comments");
}
export function openComments() {
  const card = h("div", {}, h("h2", {}, "Comentarios"),
    h("div", { class: "muted", html: "Pulsa <b>C</b> y haz clic en el cuadro para dejar uno. Se guardan en <span class='mono'>.studio/inbox.jsonl</span> para que la IA los lea." }));
  if (!S.comments.length) card.append(h("div", { class: "empty" }, "Sin comentarios."));
  [...S.comments].sort((a, b) => a.t - b.t).forEach((c) => {
    const chk = h("input", { type: "checkbox", checked: !!c.resolved, onchange: async (e) => {
      try { await api("POST", "/api/comment/resolve", { id: c.id, resolved: e.target.checked }); c.resolved = e.target.checked; emit("comments"); openComments(); } catch (err) { toast(err.message); }
    } });
    const txt = h("div", { class: "txt", style: { cursor: "pointer" }, onclick: () => { closeModal(); seek(c.t); if (c.elementId && S.motion.some((m) => m.id === c.elementId)) selectElement(c.elementId); } }, c.text);
    card.append(h("div", { class: `item${c.resolved ? " resolved" : ""}` }, h("div", { class: "meta" }, h("span", {}, `${c.t.toFixed(2)} s${c.elementType ? ` · ${c.elementType}` : ""}`), h("label", { class: "check" }, chk, " resuelto")), txt));
  });
  card.append(h("div", { class: "row" }, h("button", { onclick: closeModal }, "Cerrar")));
  openModal(card);
}
export function openHistory() {
  const card = h("div", {}, h("h2", {}, "Historial"),
    h("div", { class: "muted", html: "Cada guardado crea una copia en <span class='mono'>.studio/history/</span>. Restaurar carga la copia en el editor (se puede deshacer) y queda sin guardar hasta que guardes." }));
  if (!S.history.length) card.append(h("div", { class: "empty" }, "Sin historial todavía."));
  S.history.forEach((e) => {
    card.append(h("div", { class: "item" },
      h("div", { class: "meta" }, h("span", {}, `${e.ts.replace(/T/, " ").replace(/-(\d\d)-(\d\d)-(\d+)Z$/, ":$1:$2")}${e.original ? " · original" : ""}`), h("span", {}, `${e.elements ?? "?"} elementos`)),
      h("button", { class: "small", style: { marginTop: "6px" }, onclick: async () => {
        const { motion } = await get(`/api/history/${encodeURIComponent(e.name)}`);
        commit(motion.map((m, i) => ({ ...m, id: m.id ?? S.motion[i]?.id ?? `r${Date.now().toString(36)}${i}` })), null, "history");
        closeModal();
        toast("Restaurado (sin guardar)");
      } }, "Restaurar")));
  });
  card.append(h("div", { class: "row" }, h("button", { onclick: closeModal }, "Cerrar")));
  openModal(card);
}
