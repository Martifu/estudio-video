// Inspector building blocks: collapsible sections, labelled fields, slider + number inputs.
import { h } from "./dom.js";

const openState = new Map(); // section title -> open (kept across re-renders)
export function section(title, children, { open = true, key = title } = {}) {
  const d = h("details", { class: "sec" }, h("summary", {}, title), h("div", { class: "secbody" }, children));
  d.open = openState.has(key) ? openState.get(key) : open;
  d.addEventListener("toggle", () => openState.set(key, d.open));
  return d;
}
export const field = (label, control, col = false) => h("div", { class: `field${col ? " col" : ""}` }, h("label", {}, label), control);

/** Slider + number box. onInput(value|null): null when an optional box is emptied. */
export function slider({ label, value, min, max, step = 1, unit = "", ph = "", opt = false, onInput }) {
  const num = h("input", { type: "number", min, max, step, value: value ?? "", placeholder: ph, title: unit });
  const rng = h("input", { type: "range", min, max, step, value: value ?? ph ?? min });
  rng.oninput = () => { num.value = rng.value; onInput(Number(rng.value)); };
  num.oninput = () => {
    if (num.value === "") { if (opt) onInput(null); return; }
    const v = Math.min(max, Math.max(min, Number(num.value)));
    rng.value = v;
    onInput(v);
  };
  return h("div", { class: "field" }, h("label", {}, label), h("div", { class: "sl" }, rng, num));
}
export const numberBox = ({ label, value, step = 0.05, min, max, onInput, ph = "" }) =>
  field(label, h("input", { type: "number", step, min, max, value: value ?? "", placeholder: ph, oninput: (e) => onInput(e.target.value === "" ? null : Number(e.target.value)) }));
export const textBox = ({ label, value, onInput, ph = "", area = false }) =>
  field(label, area ? h("textarea", { placeholder: ph, oninput: (e) => onInput(e.target.value) }, value ?? "") : h("input", { type: "text", value: value ?? "", placeholder: ph, oninput: (e) => onInput(e.target.value) }), area);
export const checkBox = ({ label, checked, onChange, text = "" }) =>
  field(label, h("label", { class: "check" }, h("input", { type: "checkbox", checked: !!checked, onchange: (e) => onChange(e.target.checked) }), text));
export const selectBox = ({ label, value, options, onChange }) =>
  field(label, h("select", { onchange: (e) => onChange(e.target.value) }, options.map(([v, l]) => h("option", { value: v, selected: v === value }, l))));
export const note = (text, cls = "muted") => h("div", { class: `note ${cls}` }, text);
