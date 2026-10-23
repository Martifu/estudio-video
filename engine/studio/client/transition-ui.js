// Transition UI (DOM): cards with an animated thumbnail, the picker popover, the grouped select and the "Escuchar" button.
// The grouping and the value rules live in transition-picker.js; the drawing is the registry's own render (engine/transitions).
import * as TR from "/engine/transitions/index.js";
import { sampleFrames } from "/engine/transitions/_samples.js";
import { h } from "./dom.js";
import { togglePopover, closePopover, popoverOpen } from "./popover.js";
import * as sfx from "./sfx.js";
import { toast } from "./store.js";
import { groups, thumbFrame, thumbU } from "./transition-picker.js";

const TW = 108; // thumbnail size: 9:16, drawn small
const TH = 192;
const LOOP_WAIT_FRAMES = 120; // a thumbnail that is never attached stops after this many animation frames
let scene = null; // shared sample frames for every thumbnail (sampleFrames allocates canvases: build once)
const sceneFor = () => (scene ??= sampleFrames(TW, TH, {}));

/** The registry groups (Básicos first, then the categories). first: the first-segment entry choices only. */
export const pickerGroups = (opts) => groups(TR, opts);

function drawThumb(ctx, name, u) {
  const { from, to } = sceneFor();
  try {
    const d = TR.get(name);
    if (d?.preview) d.preview(ctx, { u, W: TW, H: TH, brand: {} });
    else TR.renderTransition(name, ctx, { from, to, u, W: TW, H: TH, brand: {}, seed: 7 });
  } catch (err) {
    console.error(`transition thumbnail ${name}`, err);
  }
}

/** A canvas that plays transition `name` in a loop (30 fps, u 0..1). The loop ends once the canvas has been removed from the page. */
export function animatedThumb(name) {
  const c = h("canvas", { class: "trthumb", width: TW, height: TH, "aria-hidden": "true" });
  const ctx = c.getContext("2d");
  const t0 = performance.now();
  let last = -1;
  let seen = false;
  let waits = 0;
  const tick = (now) => {
    if (c.isConnected) seen = true;
    else if (seen || (waits += 1) > LOOP_WAIT_FRAMES) return; // removed (or never shown): stop
    // panels stay mounted but hidden (rail.js): draw only while the canvas has a box (display:none gives none, fixed popovers do)
    if (c.isConnected && c.getClientRects().length > 0) {
      const frame = thumbFrame(now - t0);
      if (frame !== last) { last = frame; drawThumb(ctx, name, thumbU(frame)); }
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return c;
}

/**
 * Nodes for picker groups. Básicos are plain text rows; registry transitions are cards with an animated thumbnail.
 * opts: {current (type marked), onPick(type), onDragStart(type, e), onDragEnd(), title (tooltip)}.
 */
export function groupNodes(gs, { current = null, onPick, onDragStart = null, onDragEnd = null, title = "" } = {}) {
  return gs.map((g) => h("div", { class: "trgroup" }, h("div", { class: "grp" }, g.title), ...g.items.map((it) => {
    const on = current === it.type ? " on" : "";
    const node = it.legacy
      ? h("div", { class: `trbasic${on}`, role: "button", tabindex: "0", title: it.description || it.label }, h("b", {}, it.label), it.description ? h("small", { class: "muted" }, it.description) : null)
      : h("div", { class: `trcard${on}`, role: "button", tabindex: "0", title: `${it.description}${title ? `\n${title}` : ""}` }, animatedThumb(it.type), h("span", { class: "trtxt" }, h("b", {}, it.label), h("small", { class: "muted" }, it.description)));
    node.addEventListener("click", () => onPick?.(it.type));
    node.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPick?.(it.type); } });
    if (onDragStart) {
      node.setAttribute("draggable", "true");
      node.addEventListener("dragstart", (e) => onDragStart(it.type, e));
      if (onDragEnd) node.addEventListener("dragend", onDragEnd);
    }
    return node;
  })));
}

/**
 * Opens the picker popover. Anchor: `trigger` (the element; placed under it) or {x, y} (client px, e.g. a context menu).
 * onPick(type) is called after the popover closes.
 */
export function openPicker({ trigger = null, x, y, title, sub, groups: gs, current = null, onPick }) {
  togglePopover("transition", trigger, (el) => {
    el.replaceChildren(
      h("h3", {}, title),
      h("div", { class: "sub" }, sub),
      ...groupNodes(gs, { current, onPick: (type) => { closePopover(); onPick(type); } })
    );
  }, { width: 360 });
  if (!popoverOpen("transition")) return;
  const el = document.getElementById("pop-transition");
  if (!el) return;
  let left = x;
  let top = y;
  if (trigger) {
    const r = trigger.getBoundingClientRect();
    left = r.left;
    top = r.bottom + 6;
  }
  el.style.right = "auto";
  el.style.left = `${Math.max(8, Math.min(left ?? 8, innerWidth - 376))}px`;
  el.style.top = `${Math.max(8, Math.min(top ?? 8, innerHeight - 120))}px`;
}

/** A <select> with optgroups (the caller adds the label and the row). gs: [{label, options: [[value, text], ...]}]. */
export function groupedSelect({ value, groups: gs, onChange }) {
  return h("select", { onchange: (e) => onChange(e.target.value) },
    gs.map((g) => h("optgroup", { label: g.label }, g.options.map(([v, l]) => h("option", { value: v, selected: v === value }, l)))));
}

/** Plays the sound of a descriptor's sfx kind ("whoosh" | "pop") through the Efectos kit. */
export async function escuchar(kind) {
  const ok = await sfx.audition({ type: kind, x: 0 });
  if (!ok) toast("No hay sonido de ese tipo en el kit de efectos");
}
