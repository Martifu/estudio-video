// "Productos" panel: add products (name, price, photos by drag & drop), remove the background, drag a product onto the stage or the
// timeline (productPop at the drop point/time; several selected = carousel). mountProductsPanel(containerEl) fits the ~280 px rail
// column (panel-products.js registers it in the left rail); initProducts() runs once at startup (data + stage/timeline drop targets).
// State lives in S.products = {doc, version, error} (read by the inspector, ops.addAt and the review rules).
import { S, on, emit, toast } from "./store.js";
import { api, get } from "./api.js";
import { h, $ } from "./dom.js";
import { showMenu, openModal, closeModal } from "./menus.js";
import * as ops from "./ops.js";
import * as preview from "./preview.js";
import { MIME, hasType, readDrop, setDragPayload } from "./dnd.js";

const EMPTY = { version: 1, products: [] };
S.products ??= { doc: EMPTY, version: null, error: null };
const sel = new Set(); // selected product ids
const busy = new Map(); // `${productId}:${imageId}` -> label ("Quitando el fondo…")
let roots = new Set();

const token = () => document.querySelector('meta[name="studio-token"]').content;
export const thumbSrc = (im) => `/${im.cutout && !im.preferOriginal ? im.cutout : im.src}`;
export const productList = () => S.products.doc.products;
export const productById = (id) => productList().find((p) => p.id === id);
const priceText = (p) => {
  if (p.price === undefined || p.price === "") return "Sin precio";
  const n = typeof p.price === "number" ? p.price.toLocaleString("es-MX", { maximumFractionDigits: 2 }) : p.price;
  return `${typeof p.price === "number" ? "$" : ""}${n}${p.currency && p.currency !== "MXN" && typeof p.price === "number" ? ` ${p.currency}` : ""}${p.priceNote ? ` · ${p.priceNote}` : ""}`;
};
/** How many motion elements use this product (shown before deleting it). */
export const usageOf = (id) => S.motion.filter((e) => (e.product === id) || (e.slides ?? []).some((s) => s.product === id)).length;

// ---------- data ----------
export async function refreshProducts() {
  const r = await get("/api/products");
  applyDoc(r);
  return r;
}
async function applyDoc(r) {
  const changed = JSON.stringify(r.doc) !== JSON.stringify(S.products.doc);
  S.products = { doc: r.doc, version: r.version, error: r.error ?? null };
  for (const id of [...sel]) if (!productById(id)) sel.delete(id);
  renderAll();
  if (changed) {
    const win = preview.getWin();
    if (win?.setProducts) { win.setProducts(r.doc); await preview.applyAll(); }
    emit("products");
  }
}
async function call(method, path, body) {
  try {
    const r = await api(method, path, body);
    if (r.doc) await applyDoc(r);
    return r;
  } catch (e) {
    toast(e.data?.error ?? e.message, 4500);
    return null;
  }
}
async function upload(productId, file) {
  const res = await fetch(`/api/products/image?product=${encodeURIComponent(productId)}`, { method: "POST", headers: { "X-Studio-Token": token(), "X-Filename": encodeURIComponent(file.name), "Content-Type": file.type || "application/octet-stream" }, body: file });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { toast(`${file.name}: ${data.error ?? res.statusText}`, 5000); return null; }
  if (data.warnings?.length) toast(`${file.name}: ${data.warnings[0]}`, 5000);
  await applyDoc(data);
  return data;
}
async function removeBg(p, im) {
  const key = `${p.id}:${im.id}`;
  busy.set(key, "Quitando el fondo… (unos segundos; la primera vez tarda más)");
  renderAll();
  try {
    const r = await call("POST", "/api/products/cutout", { product: p.id, imageId: im.id });
    if (r?.warnings?.length) toast("Revisa el recorte: " + r.warnings[0], 5000);
  } finally {
    busy.delete(key);
    renderAll();
  }
}

// ---------- creating elements ----------
const canvasPoint = (e) => {
  const r = $("overlay").getBoundingClientRect();
  return { x: Math.round((e.clientX - r.left) / S.scale), y: Math.round((e.clientY - r.top) / S.scale) };
};
const timeAt = (e) => {
  const r = $("tlInner").getBoundingClientRect();
  return Math.max(0, Math.min(S.duration, (e.clientX - r.left) / S.zoomPps));
};
export function createFor(ids, kind, t = S.t, pos = null) {
  const list = ids.map(productById).filter(Boolean);
  if (!list.length) return null;
  const t2 = Math.round(t * 100) / 100;
  if (kind === "carousel") return ops.addAt("carousel", t2, { slides: list.slice(0, 8).map((p) => ({ product: p.id })) });
  if (kind === "productCard") return ops.addAt("productCard", t2, { product: list[0].id, ...(pos ? { x: Math.round(pos.x - 270), y: Math.round(pos.y - 300) } : {}) });
  return ops.addAt("productPop", t2, { product: list[0].id, ...(pos ?? {}) });
}

// ---------- UI ----------
function card(p) {
  const im = p.images[0];
  const cut = im?.cutout && !im.preferOriginal;
  const warn = im?.cutoutWarnings?.[0];
  const thumb = h("div", { class: `pp-thumb ${cut ? "pp-check" : "pp-cover"}` }, im ? h("img", { src: thumbSrc(im), alt: p.name, loading: "lazy" }) : h("div", { class: "pp-empty" }, "Sin foto"),
    cut ? h("span", { class: "pp-badge" }, "Sin fondo") : null,
    h("button", { class: "pp-tick", title: "Seleccionar (para crear un carrusel con varios)", onclick: (e) => { e.stopPropagation(); toggle(p.id); } }));
  const c = h("div", { class: `pp-card${sel.has(p.id) ? " pp-sel" : ""}`, draggable: "true", title: "Arrástralo al video o a la línea de tiempo para mostrarlo" },
    thumb,
    h("div", { class: "pp-meta" }, h("div", {}, h("div", { class: "pp-name" }, p.name), h("div", { class: "pp-price" }, priceText(p), p.source && p.source !== "manual" ? ` · ${p.source}` : "")),
      h("button", { class: "pp-more", title: "Más opciones", onclick: (e) => { e.stopPropagation(); menu(e, p); } }, "…")),
    warn ? h("div", { class: "pp-warn" }, warn) : null);
  c.addEventListener("click", () => toggle(p.id));
  c.addEventListener("dblclick", () => openEditor(p.id));
  c.addEventListener("dragstart", (e) => {
    const ids = sel.has(p.id) && sel.size > 1 ? [...sel] : [p.id];
    setDragPayload("product", { ids });
    e.dataTransfer.setData(MIME.product, JSON.stringify({ ids }));
    e.dataTransfer.effectAllowed = "copy";
    document.body.classList.add("pp-dragging");
  });
  c.addEventListener("dragend", () => { setDragPayload(null); document.body.classList.remove("pp-dragging"); });
  return c;
}
function toggle(id) { sel.has(id) ? sel.delete(id) : sel.add(id); renderAll(); }
function menu(e, p) {
  const im = p.images[0];
  const r = e.currentTarget.getBoundingClientRect();
  showMenu(r.left, r.bottom + 4, [
    { label: "Editar…", onClick: () => openEditor(p.id) },
    { label: im?.cutout ? "Ver o rehacer el recorte…" : "Quitar fondo", disabled: !im, onClick: () => (im?.cutout ? openEditor(p.id) : removeBg(p, im)) },
    { label: "Mostrar en el video aquí (en el cursor)", disabled: !im, onClick: () => createFor([p.id], "productPop") },
    "-",
    { label: "Borrar", danger: true, onClick: () => del(p) }
  ]);
}
async function del(p) {
  const n = usageOf(p.id);
  if (!window.confirm(`¿Borrar "${p.name}"?${n ? `\n\nSe usa en ${n} elemento${n > 1 ? "s" : ""} del video: dejarán de verse hasta que elijas otro producto.` : ""}`)) return;
  await call("DELETE", `/api/products/${p.id}`);
}
function bar() {
  const ids = [...sel];
  const n = ids.length;
  return h("div", { class: "pp-bar" },
    n ? h("small", {}, n === 1 ? "1 producto seleccionado" : `${n} productos seleccionados`) : h("small", {}, "Selecciona con el círculo de la foto, o arrastra un producto al video."),
    h("div", { class: "pp-row" },
      h("button", { class: "pp-pill pp-soft", disabled: n < 1, title: "Una tarjeta con la foto, el nombre y el precio", onclick: () => createFor(ids, "productCard") }, "Tarjeta"),
      h("button", { class: "pp-pill pp-soft", disabled: n < 1, title: "El producto flota sobre el video mientras la persona habla", onclick: () => createFor(ids, "productPop") }, "Flotando"),
      h("button", { class: "pp-pill", disabled: n < 2, title: n < 2 ? "Selecciona al menos 2 productos" : "Carrusel con los productos seleccionados", onclick: () => createFor(ids, "carousel") }, "Crear carrusel")));
}
function renderInto(root) {
  const list = productList();
  root.replaceChildren(...[
    h("div", { class: "pp-head" }, h("h3", {}, "Productos"), h("button", { class: "pp-pill", title: "Agrega un producto con su nombre, precio y fotos", onclick: () => openEditor(null) }, "+ Agregar producto")),
    S.products.error ? h("div", { class: "pp-warn", style: { margin: "0 12px" } }, `products.json tiene un problema: ${S.products.error}`) : null,
    h("div", { class: "pp-list" }, list.length ? list.map(card) : h("div", { class: "pp-empty" }, "Todavía no hay productos.", h("br"), "Agrega uno con su foto y precio; después lo arrastras al video.")),
    bar()].filter(Boolean));
}
function renderAll() { for (const r of roots) if (r.isConnected) renderInto(r); else roots.delete(r); if (editorRefresh) editorRefresh(); }

// ---------- add / edit dialog ----------
let editorRefresh = null;
function parsePrice(v) {
  const t = String(v ?? "").trim().replace(/[$\s]/g, "");
  if (!t) return "";
  const n = Number(t.replace(/,/g, ""));
  return Number.isFinite(n) ? n : String(v).trim();
}
export async function openEditor(id) {
  let pid = id;
  const f = { name: "", price: "", currency: "MXN", priceNote: "", sku: "", url: "" };
  const cur = () => (pid ? productById(pid) : null);
  if (cur()) Object.assign(f, { name: cur().name, price: cur().price ?? "", currency: cur().currency ?? "MXN", priceNote: cur().priceNote ?? "", sku: cur().sku ?? "", url: cur().url ?? "" });
  const photos = h("div", { class: "pp-photos" });
  const inp = (key, attrs = {}) => h("input", { type: "text", value: f[key], ...attrs, oninput: (e) => { f[key] = e.target.value; } });
  const ensureProduct = async () => {
    if (pid) return pid;
    if (!f.name.trim()) { toast("Primero escribe el nombre del producto."); return null; }
    const r = await call("POST", "/api/products", payload());
    pid = r?.id ?? null;
    return pid;
  };
  const payload = () => ({ name: f.name, price: parsePrice(f.price), currency: f.currency, priceNote: f.priceNote, sku: f.sku, url: f.url });
  const addFiles = async (files) => {
    const imgs = [...files].filter((x) => /^image\//.test(x.type) || /\.(png|jpe?g|webp)$/i.test(x.name));
    if (!imgs.length) { toast("Suelta fotos PNG, JPG o WebP."); return; }
    if (!(await ensureProduct())) return;
    for (const file of imgs) await upload(pid, file);
  };
  const dz = h("div", { class: "pp-dz", title: "Arrastra las fotos aquí o haz clic para elegirlas" }, "Arrastra las fotos aquí o haz clic para elegirlas", h("br"), h("small", {}, "PNG, JPG o WebP · el producto solo, sin personas ni texto encima"));
  const file = h("input", { type: "file", accept: "image/png,image/jpeg,image/webp", multiple: true, hidden: true, onchange: (e) => { addFiles(e.target.files); e.target.value = ""; } });
  dz.onclick = () => file.click();
  for (const ev of ["dragenter", "dragover"]) dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add("pp-drop-on"); });
  for (const ev of ["dragleave", "drop"]) dz.addEventListener(ev, () => dz.classList.remove("pp-drop-on"));
  dz.addEventListener("drop", (e) => { e.preventDefault(); addFiles(e.dataTransfer.files); });
  const drawPhotos = () => {
    const p = cur();
    photos.replaceChildren(...(p?.images ?? []).map((im, i) => {
      const key = `${p.id}:${im.id}`;
      const cut = !!im.cutout;
      const useCut = cut && !im.preferOriginal;
      const orig = h("figure", {}, h("div", { class: "pp-thumb pp-cover" }, h("img", { src: `/${im.src}` })), "Original");
      const after = cut ? h("figure", {}, h("div", { class: "pp-thumb pp-check" }, h("img", { src: `/${im.cutout}` })), "Sin fondo") : null;
      return h("div", { class: "pp-photo" },
        h("div", { class: "pp-ba", style: cut ? {} : { gridTemplateColumns: "1fr" } }, orig, after),
        (im.cutoutWarnings ?? []).map((w) => h("div", { class: "pp-warn" }, w)),
        h("div", { class: "pp-acts" },
          busy.has(key) ? h("span", {}, h("span", { class: "pp-spin" }), busy.get(key)) : [
            h("button", { class: "pp-pill pp-soft", title: "Borra el fondo de la foto para que el producto flote sobre el video", onclick: () => removeBg(p, im) }, cut ? "Rehacer recorte" : "Quitar fondo"),
            cut ? h("label", { class: "check", title: "Si el recorte no quedó bien, usa la foto completa" }, h("input", { type: "checkbox", checked: !useCut, onchange: (e) => call("PUT", `/api/products/${p.id}/image/${im.id}`, e.target.checked ? { preferOriginal: true } : { preferOriginal: false }) }), "Usar original") : null,
            cut ? h("button", { class: "small", title: "Elimina el recorte y deja solo la foto original", onclick: () => call("PUT", `/api/products/${p.id}/image/${im.id}`, { removeCutout: true }) }, "Quitar recorte") : null,
            h("button", { class: "small danger", title: "Quitar esta foto del producto", onclick: () => call("DELETE", `/api/products/${p.id}/image/${im.id}`) }, "Quitar foto")],
          i === 0 ? h("small", { class: "muted" }, " · foto principal") : null));
    }));
  };
  editorRefresh = drawPhotos;
  const done = async () => {
    if (!f.name.trim()) { toast("Escribe el nombre del producto."); return; }
    if (pid) await call("PUT", `/api/products/${pid}`, payload());
    else await call("POST", "/api/products", payload());
    editorRefresh = null;
    closeModal();
  };
  const close = () => { editorRefresh = null; closeModal(); };
  const src = cur()?.source;
  const card2 = h("div", { class: "pp-modal" },
    h("h2", {}, id ? "Editar producto" : "Agregar producto"),
    src && src !== "manual" ? h("div", { class: "pp-warn", style: { marginBottom: "10px" } }, `Estos datos vienen de ${src}. Verifica el precio antes de publicar.`) : null,
    h("div", { class: "pp-form" },
      h("div", { class: "pp-full" }, h("label", {}, "Nombre"), inp("name", { placeholder: "Ej. Mesa de centro parota", autofocus: true })),
      h("div", {}, h("label", {}, "Precio"), inp("price", { placeholder: "Ej. 12,500" })),
      h("div", {}, h("label", {}, "Moneda"), h("select", { onchange: (e) => { f.currency = e.target.value; } }, ["MXN", "USD"].map((c) => h("option", { value: c, selected: f.currency === c }, c)))),
      h("div", { class: "pp-full" }, h("label", {}, "Nota del precio (opcional)"), inp("priceNote", { placeholder: "Ej. desde, por metro, IVA incluido" }))),
    h("details", { style: { marginTop: "10px" } }, h("summary", { class: "muted" }, "Más datos (opcional)"),
      h("div", { class: "pp-form", style: { marginTop: "8px" } }, h("div", {}, h("label", {}, "Código (SKU)"), inp("sku")), h("div", {}, h("label", {}, "Enlace"), inp("url", { placeholder: "https://" })))),
    dz, file, photos,
    h("div", { style: { display: "flex", gap: "8px", justifyContent: "flex-end", marginTop: "14px" } }, h("button", { onclick: close }, "Cerrar"), h("button", { class: "pp-pill", onclick: done }, "Guardar")));
  openModal(card2);
  drawPhotos();
}

// ---------- drop targets: stage and timeline ----------
function wireDrops() {
  const ok = (e) => hasType(e, "product");
  const target = (el, onDrop) => {
    el.addEventListener("dragover", (e) => { if (!ok(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = "copy"; el.classList.add("pp-drop-on"); });
    el.addEventListener("dragleave", () => el.classList.remove("pp-drop-on"));
    el.addEventListener("drop", (e) => {
      el.classList.remove("pp-drop-on");
      if (!ok(e)) return;
      e.preventDefault();
      const payload = readDrop(e, "product");
      setDragPayload(null);
      if (payload?.ids?.length) onDrop(payload.ids, e);
    });
  };
  const many = (ids) => (ids.length > 1 ? "carousel" : "productPop");
  target($("overlay"), (ids, e) => createFor(ids, many(ids), S.t, ids.length > 1 ? null : canvasPoint(e)));
  target($("tlScroll"), (ids, e) => createFor(ids, many(ids), timeAt(e)));
}

// ---------- mounting ----------
export function mountProductsPanel(container) {
  container.replaceChildren();
  const root = h("div", { class: "pp-root" });
  container.append(root);
  roots.add(root);
  renderInto(root);
  refreshProducts().catch((e) => toast(`No se pudieron cargar los productos: ${e.message}`));
  return root;
}
export function unmountProductsPanel(container) {
  for (const r of [...roots]) if (container.contains(r)) roots.delete(r);
  container.replaceChildren();
}
/** Once at startup (the rail panel itself mounts lazily): load products.json, wire the stage/timeline drop targets, expose helpers. */
export function initProducts() {
  wireDrops();
  refreshProducts().catch(() => {});
  window.addEventListener("focus", () => refreshProducts().catch(() => {}));
  window.__studio && (window.__studio.products = { openEditor, refreshProducts, createFor, mount: mountProductsPanel });
}
