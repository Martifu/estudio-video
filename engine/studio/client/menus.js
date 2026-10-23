// Context menu, modal helpers and the shortcuts overlay.
import { $, h } from "./dom.js";

let menuEl = null;
export function closeMenu() { menuEl?.remove(); menuEl = null; }
/** items: [{label, hint?, onClick, disabled?, danger?, badge?}] | "-" separators. Opens at client (x, y). */
export function showMenu(x, y, items) {
  closeMenu();
  menuEl = h("div", { class: "menu ctx" });
  for (const it of items) {
    if (it === "-") { menuEl.append(h("hr")); continue; }
    const b = h("button", { class: it.danger ? "danger" : "", disabled: !!it.disabled, onclick: (e) => { e.stopPropagation(); closeMenu(); it.onClick?.(); } },
      h("span", {}, it.label), it.hint ? h("span", { class: "hint" }, it.hint) : null);
    if (it.badge) b.insertAdjacentHTML("beforeend", it.badge);
    menuEl.append(b);
  }
  document.body.append(menuEl);
  const r = menuEl.getBoundingClientRect();
  menuEl.style.left = `${Math.min(x, innerWidth - r.width - 8)}px`;
  menuEl.style.top = `${Math.min(y, innerHeight - r.height - 8)}px`;
}
document.addEventListener("pointerdown", (e) => { if (menuEl && !menuEl.contains(e.target)) closeMenu(); }, true);
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeMenu(); });
window.addEventListener("blur", closeMenu);

export function openModal(card, { wide = false } = {}) {
  const m = $("modal");
  card.classList.add("card");
  if (wide) card.classList.add("wide");
  m.replaceChildren(card);
  m.hidden = false;
  m.onclick = (e) => { if (e.target === m) closeModal(); };
}
export function closeModal() { const m = $("modal"); m.hidden = true; m.replaceChildren(); }
export const modalOpen = () => !$("modal").hidden;

export const SHORTCUTS = [
  ["Espacio", "Reproducir / pausar"], ["← →", "Cuadro anterior / siguiente (Shift: ±1 s)"], ["⌘S", "Guardar"], ["⌘Z / ⇧⌘Z", "Deshacer / rehacer"],
  ["Clic / Shift+clic", "Seleccionar / sumar a la selección"], ["Doble clic", "Editar el texto en el sitio"], ["Arrastrar borde", "Recortar entrada / salida"],
  ["Alt + arrastrar", "Duplicar el bloque (y desactivar el imán)"], ["Supr", "Eliminar lo seleccionado"], ["Clic derecho", "Menú del bloque / pista"],
  ["⌘ + rueda", "Zoom de la línea de tiempo"], ["C", "Comentar: clic en el cuadro"], ["S", "Dividir el video (o el subtítulo) en el cursor"],
  ["Arrastrar segmento", "Reordenar tomas; sus bordes recortan"],
  ["Esc", "Cerrar / quitar selección"], ["?", "Esta ayuda"]
];
export function showShortcuts() {
  const card = h("div", {}, h("h2", {}, "Atajos"),
    h("div", { class: "kbd-grid" }, SHORTCUTS.flatMap(([k, d]) => [h("kbd", {}, k), h("span", {}, d)])),
    h("div", { class: "row" }, h("button", { onclick: closeModal }, "Cerrar")));
  openModal(card);
}
