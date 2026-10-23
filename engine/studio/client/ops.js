// Shared editing operations on the motion list (used by the timeline, canvas, inspector and menus).
import { S, commit, clone, newId, byId, selectElement, select, clearSel } from "./store.js";
import { TYPES, windowOf, shiftTime, UNPIN_KEYS, isPinned } from "./schema.js";

export function duplicate(ids = S.selection.ids, dt = 0.5) {
  const out = [...S.motion];
  const created = [];
  for (const id of ids) {
    const src = byId(id);
    if (!src) continue;
    let copy = clone(src);
    if (windowOf(copy)) copy = shiftTime(copy, dt);
    copy.id = newId();
    out.splice(out.findIndex((e) => e.id === id) + 1 + created.length, 0, copy);
    created.push(copy.id);
  }
  if (!created.length) return [];
  commit(out, null, "ops");
  select({ kind: "element", ids: created });
  return created;
}
export function remove(ids = S.selection.ids) {
  if (!ids.length) return;
  commit(S.motion.filter((e) => !ids.includes(e.id)), null, "ops");
  clearSel();
}
export function toggleHide(ids = S.selection.ids) {
  const anyVisible = ids.some((id) => !byId(id)?.hidden);
  commit(S.motion.map((e) => {
    if (!ids.includes(e.id)) return e;
    const c = clone(e);
    if (anyVisible) c.hidden = true; else delete c.hidden;
    return c;
  }), null, "ops");
}
export function unpin(id) {
  commit(S.motion.map((e) => { if (e.id !== id) return e; const c = clone(e); for (const k of UNPIN_KEYS) delete c[k]; return c; }), null, "ops");
}
const PRODUCT_TYPES = ["productCard", "productPop", "carousel"];
export function addAt(type, t = S.t, patch = {}) {
  const end = S.cta?.at ?? S.duration;
  const base = TYPES[type].defaults(Math.round(t * 100) / 100, end);
  if (!base) return null;
  Object.assign(base, patch);
  // Product elements start with a product so they draw something (the first one, or the first few for a carousel); the inspector changes it.
  const prods = S.products?.doc?.products ?? [];
  if (PRODUCT_TYPES.includes(type) && prods.length) {
    if (type === "carousel" && !patch.slides) base.slides = prods.slice(0, Math.min(4, prods.length)).map((p) => ({ product: p.id }));
    else if (type !== "carousel" && !patch.product) base.product = prods[0].id;
  }
  const el = { ...base, id: newId() };
  commit([...S.motion, el], null, "ops");
  selectElement(el.id);
  return el.id;
}
export const pinned = (id) => isPinned(byId(id) ?? {});
