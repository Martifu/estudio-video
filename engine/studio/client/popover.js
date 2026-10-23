// Floating panel shared by "Revisar" and "Costo": sits beside the inspector so the preview, timeline and inspector stay usable while it is open.
// One at a time; closes on Escape or a click outside it (and outside its trigger button).
import { h } from "./dom.js";

let cur = null; // {id, el, trigger, render}
export function closePopover() {
  if (!cur) return;
  cur.el.remove();
  cur.trigger?.classList.remove("on");
  cur = null;
}
export const popoverOpen = (id) => !!cur && (id === undefined || cur.id === id);
/** Toggle the panel `id`; `render(el)` fills it (called again by refreshPopover). */
export function togglePopover(id, trigger, render, { width = 360 } = {}) {
  if (cur?.id === id) return closePopover();
  closePopover();
  const el = h("div", { class: "popover", id: `pop-${id}`, style: { width: `${width}px` } });
  cur = { id, el, trigger, render };
  trigger?.classList.add("on");
  render(el);
  document.body.append(el);
}
export function refreshPopover(id) {
  if (!cur || cur.id !== id) return;
  const top = cur.el.scrollTop;
  cur.render(cur.el);
  cur.el.scrollTop = top;
}
document.addEventListener("pointerdown", (e) => { if (cur && !cur.el.contains(e.target) && !cur.trigger?.contains(e.target)) closePopover(); }, true);
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closePopover(); });
