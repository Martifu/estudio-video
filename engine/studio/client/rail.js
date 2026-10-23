// Left rail: a narrow column of icon tabs + ONE panel column showing the selected tab. Features plug in with registerPanel().
//   registerPanel({ id, label, icon (svg string), order, mount(containerEl), unmount?() })
// A panel is mounted lazily the first time it is selected and its container is kept (hidden) afterwards, so it keeps its state.
import { h } from "./dom.js";

const panels = new Map();
let railEl = null, panelEl = null, current = null, collapsed = false;
const mounted = new Set();

export function registerPanel(spec) {
  panels.set(spec.id, { order: 100, ...spec });
  if (railEl) build();
}
export const activePanel = () => (collapsed ? null : current);
export const panelContainer = (id) => panelEl?.querySelector(`[data-panel="${id}"]`) ?? null;

function build() {
  railEl.replaceChildren();
  const list = [...panels.values()].sort((a, b) => a.order - b.order);
  for (const p of list) {
    const b = h("button", { class: `rail-tab${p.id === current && !collapsed ? " sel" : ""}`, "data-tab": p.id, title: p.title ?? p.label, onclick: () => (p.id === current && !collapsed ? setCollapsed(true) : selectPanel(p.id)) },
      h("span", { class: "rail-ico", html: p.icon }), h("span", { class: "rail-lbl" }, p.label));
    railEl.append(b);
    if (!panelEl.querySelector(`[data-panel="${p.id}"]`)) panelEl.append(h("div", { class: "panel-body", "data-panel": p.id, hidden: true }));
  }
}
function setCollapsed(v) {
  collapsed = v;
  document.getElementById("main")?.classList.toggle("rail-collapsed", v);
  build();
  show();
}
function show() {
  for (const el of panelEl.querySelectorAll(".panel-body")) el.hidden = collapsed || el.dataset.panel !== current;
}
/** Select a tab (and open the panel column if it was collapsed). */
export function selectPanel(id) {
  const p = panels.get(id);
  if (!p) return;
  current = id;
  collapsed = false;
  document.getElementById("main")?.classList.remove("rail-collapsed");
  const box = panelEl.querySelector(`[data-panel="${id}"]`);
  if (box && !mounted.has(id)) { mounted.add(id); try { p.mount(box); } catch (err) { console.error("panel", id, err); box.append(h("div", { class: "pn-empty" }, "No se pudo abrir este panel.")); } }
  build();
  show();
  try { localStorage.setItem("estudio.panel", id); } catch { /* private mode */ }
}
export function initRail(rail, panel, first = "media") {
  railEl = rail; panelEl = panel;
  build();
  let want = first;
  try { want = localStorage.getItem("estudio.panel") ?? first; } catch { /* ignore */ }
  selectPanel(panels.has(want) ? want : first);
}

// ---------- icons (24x24, stroke) ----------
const svg = (d) => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
export const ICONS = {
  media: svg('<rect x="3.5" y="5" width="17" height="14" rx="3"/><path d="M10 9.5v5l4.2-2.5z" fill="currentColor"/>'),
  music: svg('<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>'),
  text: svg('<path d="M5 6V4.5h14V6M12 4.5V19M9 19h6"/>'),
  transition: svg('<rect x="3.5" y="5" width="9" height="14" rx="2.5"/><rect x="11.5" y="5" width="9" height="14" rx="2.5" stroke-dasharray="2 2.4"/>'),
  screens: svg('<rect x="3.5" y="4.5" width="17" height="15" rx="3"/><path d="M3.5 9.5h17M8 13.5h8M8 16.5h5"/>'),
  effects: svg('<path d="M12 3.5l1.7 4.8 4.8 1.7-4.8 1.7L12 16.5l-1.7-4.8L5.5 10l4.8-1.7z"/><path d="M18.5 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/>'),
  products: svg('<path d="M4 8l8-4 8 4v8l-8 4-8-4z"/><path d="M4 8l8 4 8-4M12 12v8"/>')
};
