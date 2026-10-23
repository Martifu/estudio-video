// Panel "Pantallas": the browsable library of motion-lib elements (engine/motion-lib), grouped by category, each with a small static
// thumbnail drawn from the element's sample() by the SAME draw code the render uses. Click = add at the cursor; drag onto the Motion lane
// works like the Texto panel. Elements whose descriptor says panel: "text" live in the Texto panel instead. With Reda data in
// products.json the uiList comes prefilled from it (descriptor.prefill).
import { S } from "./store.js";
import { h } from "./dom.js";
import { registerPanel, ICONS } from "./rail.js";
import { LIB } from "./schema.js";
import * as ops from "./ops.js";
import { setDragPayload, MIME } from "./dnd.js";

const THUMB = { w: 168, h: 118 };
let ENV = null; // { brand, skin }: loaded once
async function env() {
  if (ENV) return ENV;
  const get = async (u) => { try { const r = await fetch(u); return r.ok ? await r.json() : null; } catch { return null; } };
  const [brand, skin] = await Promise.all([get("/brand.json"), get("/api/ui-skin")]);
  ENV = { brand: brand ?? {}, skin: LIB.resolveSkin(skin?.doc ?? null, brand ?? {}) };
  return ENV;
}
// Thumbnails draw the sample with the SAME images as the render: people:pNN avatars and the official icon:<name> logos.
const IMGS = new Map();
let ICONS_INDEX = null;
async function loadRef(ref) {
  if (IMGS.has(ref)) return;
  const r = LIB.resolveRef(ref);
  let url = r?.kind === "people" ? r.url : null;
  if (r?.kind === "icon") {
    ICONS_INDEX ??= await fetch("/_icons/index.json").then((x) => (x.ok ? x.json() : {}), () => ({})).then((j) => j.icons ?? {});
    if (ICONS_INDEX[r.name]?.png) url = `/_icons/${ICONS_INDEX[r.name].png}`;
  }
  if (!url) return;
  const img = new Image();
  img.src = url;
  try { await img.decode(); IMGS.set(ref, img); } catch { /* no image: the thumbnail simply lacks it */ }
}
function thumb(type) {
  const c = h("canvas", { class: "lib-thumb", width: THUMB.w * 2, height: THUMB.h * 2, "aria-hidden": "true" });
  env().then(async (e) => {
    await Promise.all(LIB.imageRefs(LIB.sampleOf(type, e.brand)).map((x) => loadRef(x.ref)));
    const ctx = c.getContext("2d");
    ctx.scale(2, 2);
    try { LIB.drawSample(ctx, type, { w: THUMB.w, h: THUMB.h, brand: e.brand, skin: e.skin, img: (ref) => IMGS.get(ref) ?? null, iconMeta: (name) => ICONS_INDEX?.[name] ?? null }); } catch { /* the card still works without a thumbnail */ }
  });
  return c;
}
function add(type) {
  const patch = LIB.get(type).prefill?.({ products: S.products?.doc }) ?? {};
  ops.addAt(type, S.t, patch);
}
function card(d) {
  const b = h("div", { class: "tcard lib", draggable: "true", title: `Agregar “${d.label}” en el cursor, o arrástralo al carril Motion` },
    thumb(d.type), h("b", {}, d.label), h("span", { class: "muted tiny" }, d.description));
  b.addEventListener("click", () => add(d.type));
  b.addEventListener("dragstart", (e) => { setDragPayload("text", { type: d.type }); e.dataTransfer.setData(MIME.text, JSON.stringify({ type: d.type })); e.dataTransfer.effectAllowed = "copy"; });
  b.addEventListener("dragend", () => setDragPayload(null));
  return b;
}
function mount(root) {
  root.append(h("div", { class: "pn-title" }, "Pantallas"));
  for (const { category, items } of LIB.byCategory()) {
    const shown = items.filter((d) => (d.panel ?? "library") === "library");
    if (!shown.length) continue;
    root.append(h("div", { class: "pn-cat" }, category), h("div", { class: "tgrid" }, ...shown.map(card)));
  }
  root.append(h("div", { class: "pn-hint" }, "Clic para agregarla donde está el cursor. Vienen con datos de ejemplo inventados: cámbialos por los reales y marca de dónde salen (la revisión te lo pedirá)."));
}
registerPanel({ id: "screens", label: "Pantallas", icon: ICONS.screens, order: 35, title: "Biblioteca de elementos: pantallas, cierres…", mount });
