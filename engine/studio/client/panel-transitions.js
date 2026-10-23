// Panel "Transiciones": the registry groups as cards with an animated thumbnail (Básicos as plain rows). Click applies to the selected clip;
// drag a card onto a diamond (or a clip) of the Video lane. The drag carries the transition name: {type}.
import { S, toast } from "./store.js";
import { h } from "./dom.js";
import { registerPanel, ICONS } from "./rail.js";
import * as edlui from "./edl-ui.js";
import { setDragPayload, MIME } from "./dnd.js";
import { pickerGroups, groupNodes } from "./transition-ui.js";

function mount(root) {
  const onPick = (type) => {
    const seg = S.selection.kind === "segment" ? edlui.segById(S.selection.seg) : null;
    if (!seg) { toast("Primero elige un clip en la línea de tiempo (o arrastra la transición al rombo entre dos clips)"); return; }
    edlui.applyTransitionType(seg, type);
  };
  const list = h("div", { class: "trlist" }, groupNodes(pickerGroups({}), {
    title: "Arrástrala al rombo entre dos clips",
    onPick,
    onDragStart: (type, e) => { setDragPayload("transition", { type }); e.dataTransfer.setData(MIME.transition, JSON.stringify({ type })); e.dataTransfer.effectAllowed = "copy"; },
    onDragEnd: () => setDragPayload(null)
  }));
  root.append(h("div", { class: "pn-title" }, "Transiciones"), list, h("div", { class: "pn-hint" }, "Elige un clip del carril Video y haz clic en una transición. O arrastra una al rombo que está entre dos clips."));
}
registerPanel({ id: "transitions", label: "Transiciones", icon: ICONS.transition, order: 40, title: "Cómo cambia una toma a la siguiente", mount });
