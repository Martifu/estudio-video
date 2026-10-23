// Logo + end card ("Cierre") editing: helpers over the logo.json / cta.json documents, their inspector panels, the logo replace flow
// (upload -> server validation -> content-addressed file -> logo.json `src`) and the asset-problems banner.
// The documents live in the store (S.logo, S.ctaDoc) so undo/redo, dirty tracking and the live preview work like every other edit.
import { S, on, emit, commitDoc, setTransient, clone, toast, json, selectLogo } from "./store.js";
import { api, get } from "./api.js";
import { X } from "./extras.js";
import { h, $ } from "./dom.js";
import { section, field, slider, textBox, checkBox, selectBox, note } from "./ui.js";

// Defaults = the values hard-coded in engine/brand-layer.js logoBug/logoBox: a logo.json with nothing set draws exactly the same.
export const LOGO_DEFAULTS = { w: 240, h: 90, opacity: 1, enter: "fade", fadeDur: 0.4, scrim: true, autoHide: true, shadow: { blur: 14, alpha: 0.6 } };
export const effLogo = () => ({ ...LOGO_DEFAULTS, ...(S.logo ?? {}) });
export const logoRect = () => S.plan?.logo?.rect ?? null;
export const logoWindow = () => [S.logo?.in ?? 0.3, S.logo?.out ?? S.studio?.logoUntil ?? S.cta?.at ?? S.duration];
const round = (v) => Math.round(v);

/** Merge `patch` into logo.json (undefined / null removes a key; an empty document removes the file = brand default). One undo step per `key`. */
export function setLogo(patch, key = null) {
  const next = { ...(S.logo ?? {}) };
  for (const [k, v] of Object.entries(patch)) { if (v === undefined || v === null) delete next[k]; else next[k] = v; }
  commitDoc({ logo: Object.keys(next).length ? next : null }, key ? `logo:${key}` : null, "logo");
}
/** Live drag updates (no history; the gesture end records ONE undo step). */
export function setLogoTransient(patch) {
  const next = { ...(S.logo ?? {}), ...patch };
  setTransient(undefined, "gesture", { logo: next });
}
export function setCta(patch, key = null) {
  const next = { ...(S.ctaDoc ?? {}) };
  for (const [k, v] of Object.entries(patch)) { if (v === undefined || v === null || v === "") delete next[k]; else next[k] = v; }
  commitDoc({ cta: Object.keys(next).length ? next : null }, key ? `cta:${key}` : null, "cta");
}

// ---------- brand logo URLs (thumbnails) ----------
let brand = null;
fetch("/brand.json").then((r) => (r.ok ? r.json() : null)).then((b) => { brand = b; }).catch(() => {});
const urlOf = (rel) => (rel ? `/${rel.split("/").map(encodeURIComponent).join("/")}` : null);
const currentUrl = () => {
  const l = effLogo();
  if (S.logo?.src) return urlOf(S.logo.src);
  const v = S.logo?.variant ?? (brand?.logo?.white ? "white" : brand?.logo?.mark ? "mark" : "color");
  return urlOf(brand?.logo?.[v]);
};

// ---------- upload ----------
const token = () => document.querySelector('meta[name="studio-token"]').content;
export const uploadState = { busy: false, error: null, warnings: [], name: null, info: null };
const MAX_UPLOAD = 15 * 1024 * 1024;

async function saveLogoDoc() {
  try {
    const r = await api("PUT", "/api/doc/logo", { version: S.versions.logo, doc: S.logo });
    S.versions.logo = r.version;
    S.saved.logo = json(S.logo);
    emitState();
    refreshPreflight();
  } catch (err) {
    toast(err.status === 409 ? "logo.json cambió en disco: recarga para guardar el logo nuevo" : `No se pudo guardar el logo: ${err.data?.errors?.[0] ?? err.message}`, 4500);
  }
}
const emitState = () => emit("motion", "saved");

export async function replaceLogo(file) {
  if (!file) return;
  if (file.size > MAX_UPLOAD) { uploadState.error = "El archivo pesa más de 15 MB."; uploadState.warnings = []; refreshPanel(); return; }
  Object.assign(uploadState, { busy: true, error: null, warnings: [], name: file.name, info: null });
  refreshPanel();
  try {
    const res = await fetch("/api/asset/logo", {
      method: "POST",
      headers: { "X-Studio-Token": token(), "Content-Type": file.type || "application/octet-stream", "X-Filename": encodeURIComponent(file.name) },
      body: file
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error ?? (res.status === 413 ? "El archivo pesa más de 15 MB." : res.statusText));
    Object.assign(uploadState, { busy: false, warnings: data.warnings ?? [], info: { width: data.width, height: data.height, alpha: data.alpha, src: data.src } });
    setLogo({ src: data.src, variant: undefined }, null); // the file already exists on disk (content-addressed); point logo.json at it
    await saveLogoDoc(); // saved right away: a logo that is only "pending" is exactly the replace-then-render-the-old-one trap
    toast(data.warnings?.length ? "Logo reemplazado (con avisos)" : "Logo reemplazado y guardado", 3000);
  } catch (err) {
    Object.assign(uploadState, { busy: false, error: err.message, warnings: [] });
  }
  refreshPanel();
}
export function pickLogoFile() {
  const input = h("input", { type: "file", accept: "image/png,image/jpeg,image/webp", style: { display: "none" }, onchange: () => { replaceLogo(input.files[0]); input.remove(); } });
  document.body.append(input);
  input.click();
}
let refreshPanel = () => {};
export const onRefresh = (fn) => { refreshPanel = fn; };

// ---------- inspector: logo ----------
const ENTER_OPTIONS = [["fade", "Fundido (por defecto)"], ["pop", "Aparecer con rebote suave"], ["slide", "Deslizar desde el borde"], ["none", "Sin animación"]];
const CORNER_OPTIONS = [["auto", "Automático (lejos de la cara)"], ["tr", "Arriba a la derecha"], ["tl", "Arriba a la izquierda"]];

/** x / y of the logo box; the first edit pins BOTH axes at the current position so the box does not jump from corner-anchored to pinned. */
function setPos(ax, value, rect) {
  const seed = S.logo?.x === undefined && S.logo?.y === undefined && rect ? { x: round(rect.x), y: round(rect.y) } : {};
  setLogo({ ...seed, [ax]: value }, `pos${ax}`);
}

export function logoPanel() {
  const l = effLogo();
  const rect = logoRect();
  const [tin, tout] = logoWindow();
  const out = [];
  out.push(h("h2", {}, "Logo"));
  const thumb = currentUrl();
  out.push(h("div", { class: "logobox" },
    thumb ? h("img", { src: thumb, alt: "logo actual" }) : h("span", { class: "muted" }, "sin imagen"),
    h("div", { class: "muted tiny" }, S.logo?.src ? `Logo propio de este video\n${S.logo.src}` : "Logo de la marca (brand.json)")));
  out.push(h("div", { class: "btnrow" },
    h("button", { class: "accent", disabled: uploadState.busy, onclick: pickLogoFile }, uploadState.busy ? "Subiendo…" : "Reemplazar logo…"),
    h("button", { onclick: () => setLogo({ hidden: S.logo?.hidden ? undefined : true }) }, S.logo?.hidden ? "Mostrar" : "Ocultar")));
  if (uploadState.error) out.push(h("div", { class: "errs" }, h("div", {}, uploadState.error)));
  if (uploadState.warnings.length) out.push(h("div", { class: "warns" }, uploadState.warnings.map((w) => h("div", {}, w))));
  if (uploadState.info && !uploadState.error) out.push(note(`Subido: ${uploadState.info.width}×${uploadState.info.height} px${uploadState.info.alpha ? ", con transparencia" : ""}. Se guardó como ${uploadState.info.src}; el logo de la marca (brand.json) no se toca.`));
  if (S.logo?.src) {
    out.push(h("div", { class: "btnrow" }, h("button", { onclick: () => setLogo({ src: undefined }) }, "Volver al logo de la marca")));
    const older = X.entries.filter((e) => e.slot === "logo" && !e.invalid && e.path !== S.logo.src);
    if (older.length) out.push(field("Logos subidos antes", h("div", { class: "logohist" }, older.map((e) => h("button", { class: "small", title: e.note ?? e.path, onclick: () => setLogo({ src: e.path }) }, h("img", { src: e.url, alt: e.path })))), true));
  } else if (brand?.logo) {
    const opts = ["color", "white", "mark"].filter((k) => brand.logo[k]).map((k) => [k, { color: "Color", white: "Blanco", mark: "Marca" }[k]]);
    out.push(selectBox({ label: "Versión", value: S.logo?.variant ?? "", options: [["", "Automática"], ...opts], onChange: (v) => setLogo({ variant: v || undefined }) }));
  }
  out.push(section("Tamaño y posición", [
    slider({ label: "Tamaño (ancho)", value: rect ? round(rect.w) : 240, min: 60, max: 760, step: 5, onInput: (v) => { const k = rect?.w ? v / rect.w : 1; setLogo({ w: round(l.w * k), h: round(l.h * k) }, "size"); } }),
    slider({ label: "Opacidad", value: Math.round(l.opacity * 100), min: 10, max: 100, step: 5, unit: "%", onInput: (v) => setLogo({ opacity: v >= 100 ? undefined : v / 100 }, "opacity") }),
    selectBox({ label: "Esquina", value: S.logo?.corner ?? "auto", options: CORNER_OPTIONS, onChange: (v) => setLogo({ corner: v === "auto" ? undefined : v, x: undefined, y: undefined }) }),
    field("x / y (px)", h("div", { class: "pair" }, ["x", "y"].map((ax) => h("input", { type: "number", step: 1, title: ax, placeholder: rect ? String(round(rect[ax])) : ax, value: S.logo?.[ax] ?? "",
      oninput: (e) => setPos(ax, e.target.value === "" ? undefined : Number(e.target.value), rect) })))),
    h("button", { disabled: S.logo?.x === undefined && S.logo?.y === undefined, onclick: () => setLogo({ x: undefined, y: undefined }) }, "Soltar posición (volver a la esquina)"),
    note("También se mueve arrastrando el logo en el cuadro y se agranda con la esquina.")
  ], { key: "logo-pos" }));
  out.push(section("Entrada y tiempo", [
    selectBox({ label: "Entrada", value: l.enter, options: ENTER_OPTIONS, onChange: (v) => setLogo({ enter: v === "fade" ? undefined : v }) }),
    l.enter === "pop" ? note("El rebote suave (1.04) cuenta como uno de los 2 rebotes permitidos por video.", "warns") : null,
    l.enter === "none" ? null : slider({ label: "Duración del fundido (s)", value: l.fadeDur, min: 0.1, max: 2, step: 0.05, onInput: (v) => setLogo({ fadeDur: Math.abs(v - 0.4) < 0.001 ? undefined : v }, "fade") }),
    field("Entra / sale (s)", h("div", { class: "pair" },
      h("input", { type: "number", step: 0.05, min: 0, title: "entra", placeholder: String(tin), value: S.logo?.in ?? "", oninput: (e) => setLogo({ in: e.target.value === "" ? undefined : Math.max(0, Number(e.target.value)) }, "in") }),
      h("input", { type: "number", step: 0.05, min: 0, title: "sale", placeholder: Number.isFinite(tout) ? tout.toFixed(2) : "", value: S.logo?.out ?? "", oninput: (e) => setLogo({ out: e.target.value === "" ? undefined : Math.max(tin + 0.1, Number(e.target.value)) }, "out") })))
  ], { key: "logo-time" }));
  out.push(section("Más", [
    checkBox({ label: "Halo oscuro", checked: l.scrim, text: "mancha suave detrás del logo", onChange: (v) => setLogo({ scrim: v ? undefined : false }) }),
    checkBox({ label: "Sombra", checked: l.shadow !== false, text: "sombra suave", onChange: (v) => setLogo({ shadow: v ? undefined : false }) }),
    l.shadow === false ? null : slider({ label: "Difuminado de la sombra", value: l.shadow.blur ?? 14, min: 0, max: 40, step: 1, onInput: (v) => setLogo({ shadow: v === 14 && (l.shadow.alpha ?? 0.6) === 0.6 ? undefined : { blur: v, alpha: l.shadow.alpha ?? 0.6 } }, "shadow") }),
    checkBox({ label: "Esconderse solo", checked: l.autoHide, text: "se desvanece cuando un elemento lo tapa", onChange: (v) => setLogo({ autoHide: v ? undefined : false }) }),
    h("button", { class: "danger", disabled: !S.logo, onclick: () => setLogo(Object.fromEntries(Object.keys(S.logo ?? {}).map((k) => [k, undefined]))) }, "Restablecer todo (logo de la marca)")
  ], { key: "logo-more", open: false }));
  return out.filter(Boolean);
}

// ---------- inspector: end card ----------
const CTA_VARIANTS = [["auto", "Automática"], ["color", "Color"], ["white", "Blanco"], ["mark", "Marca"]];
export function ctaPanel() {
  const d = S.ctaDoc ?? {};
  const base = S.cta ?? null;
  const on_ = d.enabled ?? !!base;
  const out = [h("h2", {}, "Cierre (CTA)")];
  out.push(note("La tarjeta final con el título, el subtítulo y el contacto de la marca. Los cambios de texto y color se ven al instante; activar o cambiar la duración mueve el final del video y se aplica al renderizar."));
  out.push(checkBox({ label: "Tarjeta de cierre", checked: on_, text: on_ ? "activada" : "desactivada", onChange: (v) => setCta({ enabled: v === !!base && !("enabled" in d) ? undefined : v }) }));
  if (!on_) return out;
  if (d.enabled && !base) out.push(note("Se agregará al renderizar (la vista previa actual no la tiene).", "warns"));
  out.push(section("Contenido", [
    textBox({ label: "Título", value: d.title ?? "", ph: base?.title ?? "(el de la marca)", onInput: (v) => setCta({ title: v }, "title") }),
    textBox({ label: "Subtítulo", value: d.subtitle ?? "", ph: base?.subtitle ?? "", onInput: (v) => setCta({ subtitle: v }, "subtitle") }),
    slider({ label: "Duración (s)", value: d.dur ?? base?.dur ?? 3, min: 1, max: 8, step: 0.5, onInput: (v) => setCta({ dur: v }, "dur") }),
    note("Cambiar la duración alarga o acorta el video: se aplica al renderizar.")
  ], { key: "cta-content" }));
  const variants = S.logo?.src ? [...CTA_VARIANTS, ["custom", "Logo de este video"]] : CTA_VARIANTS;
  out.push(section("Aspecto", [
    selectBox({ label: "Logo", value: d.logoVariant ?? "auto", options: variants, onChange: (v) => setCta({ logoVariant: v === "auto" ? undefined : v }) }),
    selectBox({ label: "Fondo", value: d.bg ?? "", options: [["", "Según la marca"], ["light", "Claro"], ["dark", "Oscuro"]], onChange: (v) => setCta({ bg: v || undefined }) }),
    h("button", { disabled: !S.ctaDoc, onclick: () => setCta(Object.fromEntries(Object.keys(S.ctaDoc ?? {}).map((k) => [k, undefined]))) }, "Restablecer (valores del comando)")
  ], { key: "cta-look" }));
  return out;
}

// ---------- asset problems banner (window.ASSET_ERRORS of the comp) ----------
export async function refreshPreflight() {
  try { S.preflight = await get("/api/preflight"); } catch { return; }
  paintAssetBanner();
}
/** Red banner = the comp could not load something (window.ASSET_ERRORS) or the server's preflight found a missing / undecodable file. */
export function paintAssetBanner() {
  const el = $("assetBanner");
  if (!el) return;
  const errors = [...(S.assetIssues?.errors ?? []).map((e) => e.error), ...(S.preflight?.errors ?? []).map((e) => e.message)];
  const warnings = [...(S.assetIssues?.warnings ?? []).map((e) => e.error), ...(S.preflight?.warnings ?? []).map((e) => e.message)];
  const uniq = (a) => [...new Set(a)];
  el.hidden = !errors.length && !warnings.length;
  el.className = errors.length ? "bad" : "warn";
  el.replaceChildren();
  if (el.hidden) return;
  const list = uniq(errors.length ? errors : warnings);
  el.append(h("div", {}, errors.length ? "Hay assets con problemas: el render se detendrá hasta arreglarlos." : "Avisos de assets"),
    ...list.map((m) => h("div", { class: "tiny" }, `• ${m}`)),
    h("button", { class: "small", onclick: () => selectLogo() }, "Abrir Logo"));
}
export function initAssetBanner() {
  on("assets", paintAssetBanner);
  window.addEventListener("focus", refreshPreflight);
  refreshPreflight();
}
export const hasAssetErrors = () => !!S.assetIssues?.errors?.length;
void clone;
