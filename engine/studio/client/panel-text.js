// Panel "Texto": adds the existing motion element types at the cursor (or drag one onto the Motion lane).
import { S } from "./store.js";
import { h } from "./dom.js";
import { registerPanel, ICONS } from "./rail.js";
import { TYPES, LIB } from "./schema.js";
import * as ops from "./ops.js";
import { setDragPayload, MIME } from "./dnd.js";

const DESC = { keywordPop: "Una palabra grande en pantalla", onomatopoeia: "Un “¡BAM!” de cómic", specCard: "Ficha con datos del producto", chatBubbles: "Conversación tipo chat", toast: "Aviso como el del celular", tagPill: "Etiqueta corta", counterBadge: "Número que va subiendo", dimensionLine: "Línea con una medida", wordStack: "Palabras apiladas", highlightWords: "Resalta palabras del subtítulo" };
function mount(root) {
  const grid = h("div", { class: "tgrid" });
  for (const [type, spec] of Object.entries(TYPES).filter(([, s]) => !s.noAdd && (!s.lib || s.panel === "text"))) {
    const b = h("div", { class: "tcard", draggable: "true", title: `Agregar “${spec.label}” en el cursor, o arrástralo al carril Motion` },
      h("b", {}, spec.label), h("span", { class: "muted tiny" }, DESC[type] ?? LIB.get(type)?.description ?? ""));
    b.addEventListener("click", () => ops.addAt(type, S.t));
    b.addEventListener("dragstart", (e) => { setDragPayload("text", { type }); e.dataTransfer.setData(MIME.text, JSON.stringify({ type })); e.dataTransfer.effectAllowed = "copy"; });
    b.addEventListener("dragend", () => setDragPayload(null));
    grid.append(b);
  }
  root.append(h("div", { class: "pn-title" }, "Texto y motion"), grid, h("div", { class: "pn-hint" }, "Clic para agregarlo donde está el cursor. También puedes arrastrarlo a la línea de tiempo."));
}
registerPanel({ id: "text", label: "Texto", icon: ICONS.text, order: 30, title: "Texto y elementos de motion", mount });
