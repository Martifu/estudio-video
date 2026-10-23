// "Variantes": one finished comp -> N free text-only variants (e.g. 3 hooks x 2 CTAs) for A/B tests.
// The document is <comp>/variants.json (saved through PUT /api/variants as you type); rendering runs scripts/variants.py on the server and
// progress arrives over the "variants" SSE event. Variants are sibling comps, so nothing here touches the base comp's files.
import { S, selected, toast } from "./store.js";
import { api, get } from "./api.js";
import { togglePopover, refreshPopover, popoverOpen } from "./popover.js";
import { openModal, closeModal } from "./menus.js";
import { TYPES } from "./schema.js";
import { $, h } from "./dom.js";

const ID = "variants";
const MAX_ALTS = 3;
let data = null; // last GET /api/variants
let hook = null; // {id, index, field, type, alts: []} or null
let ctaAxis = { on: false, field: "title", alts: [] };
let running = false;
let prog = { n: 0, total: 0, frac: 0, code: null };
let saveTimer = null;
let adopted = false;
let problems = { errors: [], warnings: [] };

const textField = (el) => (typeof el?.text === "string" ? "text" : typeof el?.title === "string" ? "title" : null);
const ctaCurrent = (field) => String((field === "title" ? S.ctaDoc?.title ?? S.cta?.title : S.ctaDoc?.subtitle ?? S.cta?.subtitle) ?? "");
const hasCta = () => !!(S.ctaDoc ? S.ctaDoc.enabled !== false : S.cta);
const hookEl = () => (hook ? S.motion.find((e) => e.id === hook.id) ?? S.motion[hook.index] ?? null : null);
const cleanAlts = (alts) => alts.map((a) => a.trim()).filter(Boolean);

/** The document the inputs describe (option 0 = what the video says now). */
function buildDoc() {
  const axes = [];
  const el = hookEl();
  const alts = hook ? cleanAlts(hook.alts) : [];
  if (hook && el && alts.length) axes.push({ id: "hook", label: "Gancho", target: { kind: "motion", id: hook.id, index: S.motion.indexOf(el), field: hook.field }, options: [String(el[hook.field]), ...alts] });
  const calts = cleanAlts(ctaAxis.alts);
  if (ctaAxis.on && calts.length) axes.push({ id: "cta", label: "Cierre", target: { kind: "cta", field: ctaAxis.field }, options: [ctaCurrent(ctaAxis.field), ...calts] });
  return axes.length ? { axes } : null;
}
const comboCount = (doc) => (doc ? doc.axes.reduce((n, a) => n * a.options.length, 1) : 0);

/** Fill the form from a saved document. */
function adopt(doc) {
  hook = null;
  ctaAxis = { on: false, field: "title", alts: [] };
  for (const ax of doc?.axes ?? []) {
    if (ax.target?.kind === "motion") {
      const el = S.motion.find((e) => e.id === ax.target.id) ?? S.motion[ax.target.index];
      if (el) hook = { id: el.id, index: S.motion.indexOf(el), field: ax.target.field, type: el.type, alts: ax.options.slice(1) };
    } else if (ax.target?.kind === "cta") ctaAxis = { on: true, field: ax.target.field, alts: ax.options.slice(1) };
  }
}

async function load() {
  try {
    data = await get("/api/variants");
    running = data.running;
    if (!adopted) { adopt(data.doc); adopted = true; }
    problems = { errors: data.errors ?? [], warnings: data.warnings ?? [] };
  } catch (err) {
    console.warn("variants not loaded", err);
  }
  paintButton();
  refreshPopover(ID);
}

function paintButton() {
  const b = $("btnVariants");
  const done = data?.manifest?.variants?.filter((v) => v.status === "done").length ?? 0;
  b.textContent = running ? `Variantes ${prog.n}/${prog.total}` : done ? `Variantes · ${done}` : "Variantes";
  b.classList.toggle("busy", running);
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    saveTimer = null;
    const doc = buildDoc();
    try {
      const r = await api("PUT", "/api/variants", { version: data?.version ?? "none", doc: doc ?? null });
      data = { ...data, version: r.version, doc };
      problems = { errors: [], warnings: r.warnings ?? [] };
    } catch (err) {
      if (err.status === 409) { await load(); return; }
      problems = { errors: err.data?.errors ?? [err.message], warnings: [] };
    }
    refreshPopover(ID);
  }, 450);
}

const fmtMin = (s) => (s < 90 ? `~${Math.max(1, Math.round(s))} s` : `~${Math.round(s / 60)} min`);
function summary() {
  const doc = buildDoc();
  const n = comboCount(doc);
  if (!n) return "Agrega al menos una alternativa";
  const per = data?.estimate?.perVariantS;
  return `${n} variantes · gratis${per ? ` · ${fmtMin(per * n)}` : ""}`;
}

async function start(only) {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; await flush(); }
  try {
    await api("POST", "/api/variants/render", only ? { only } : {});
    running = true; prog = { n: 0, total: only?.length ?? comboCount(buildDoc()), frac: 0, code: null };
    paintButton(); refreshPopover(ID);
  } catch (err) {
    const pf = err.data?.preflight;
    toast(pf ? `No se puede renderizar: ${pf.errors[0]?.message}` : err.data?.error ?? err.message, 5000);
  }
}
async function flush() {
  const doc = buildDoc();
  try {
    const r = await api("PUT", "/api/variants", { version: data?.version ?? "none", doc: doc ?? null });
    data = { ...data, version: r.version, doc };
  } catch (err) { toast(err.data?.errors?.[0] ?? err.message, 4000); }
}

// ---------- form ----------
function altInputs(alts, onChange, ph) {
  const box = h("div", { class: "vr-alts" });
  alts.forEach((val, i) => {
    box.append(h("div", { class: "vr-alt" },
      h("input", { type: "text", maxlength: "120", placeholder: ph, value: val, oninput: (e) => { alts[i] = e.target.value; onChange(); } }),
      h("button", { class: "small", title: "Quitar", onclick: () => { alts.splice(i, 1); onChange(true); } }, "×")));
  });
  if (alts.length < MAX_ALTS) box.append(h("button", { class: "small", onclick: () => { alts.push(""); onChange(true); } }, "+ Alternativa"));
  return box;
}
const changed = (repaint) => { scheduleSave(); if (repaint) refreshPopover(ID); else paintSummary(); };
function paintSummary() { const s = document.querySelector("#pop-variants .vr-sum"); if (s) s.textContent = summary(); }

function pickSelection() {
  const el = selected();
  const field = textField(el);
  if (!el || !field) { toast("Elige en el cuadro un elemento con texto (palabra clave, etiqueta, título…)"); return; }
  if (!el.id) return;
  hook = { id: el.id, index: S.motion.indexOf(el), field, type: el.type, alts: hook?.id === el.id ? hook.alts : [] };
  if (!hook.alts.length) hook.alts.push("");
  changed(true);
}

function hookBlock() {
  const el = hookEl();
  const box = h("div", { class: "vr-axis" }, h("div", { class: "grp" }, "Gancho (texto en pantalla)"));
  if (!hook || !el) {
    box.append(h("div", { class: "cost-hint" }, "Haz clic en un texto del cuadro y pulsa el botón."),
      h("button", { class: "small primary", onclick: pickSelection }, "Usar el elemento seleccionado"));
    return box;
  }
  box.append(h("div", { class: "vr-cur" }, h("span", { class: "tag" }, `${TYPES[el.type]?.label ?? el.type} · ${(el.in ?? 0).toFixed(1)} s`), h("b", {}, `«${el[hook.field]}»`),
    h("button", { class: "small", title: "Usar otro elemento (selecciónalo antes)", onclick: pickSelection }, "Cambiar")));
  box.append(altInputs(hook.alts, changed, "Texto alternativo"));
  return box;
}
function ctaBlock() {
  const box = h("div", { class: "vr-axis" }, h("div", { class: "grp" }, "Cierre (CTA)"));
  if (!hasCta()) { box.append(h("div", { class: "cost-hint" }, "Este video no tiene tarjeta de cierre.")); return box; }
  box.append(h("div", { class: "vr-cur" }, h("span", { class: "tag" }, ctaAxis.field === "title" ? "Título" : "Subtítulo"), h("b", {}, `«${ctaCurrent(ctaAxis.field)}»`)));
  if (!ctaAxis.on) box.append(h("button", { class: "small", onclick: () => { ctaAxis.on = true; if (!ctaAxis.alts.length) ctaAxis.alts.push(""); changed(true); } }, "Agregar alternativas de cierre"));
  else {
    box.append(altInputs(ctaAxis.alts, changed, "Título alternativo"),
      h("button", { class: "small", onclick: () => { ctaAxis = { on: false, field: "title", alts: [] }; changed(true); } }, "Quitar eje del cierre"));
  }
  return box;
}

// ---------- gallery ----------
const url = (f) => `/${S.comp}/variants/${encodeURIComponent(f)}`;
function openPlayer(v) {
  const vid = h("video", { src: url(v.file), controls: true, autoplay: true, playsinline: true, style: { maxHeight: "74vh", maxWidth: "100%", borderRadius: "8px", background: "#000" } });
  openModal(h("div", {}, h("h2", {}, `Variante ${v.code}`), h("div", { class: "muted" }, v.overrides.map((o) => `${o.label}: «${o.text}»`).join("  ·  ")),
    h("div", { style: { textAlign: "center", marginTop: "8px" } }, vid), h("div", { class: "row" }, h("button", { onclick: closeModal }, "Cerrar"))));
}
function card(v) {
  const label = h("div", { class: "vr-lbl" }, v.overrides.map((o) => h("div", { title: o.label }, h("span", { class: "k" }, `${o.label}: `), o.text)));
  const head = h("div", { class: "vr-code" }, v.code, h("span", { class: `vr-st ${v.status}` }, { done: v.renderS ? `${Math.round(v.renderS)} s` : "listo", failed: "falló", running: "renderizando…", queued: "en cola" }[v.status] ?? v.status));
  if (v.status !== "done") return h("div", { class: "vr-card" }, h("div", { class: "vr-thumb empty" }, v.status === "failed" ? "✕" : "…"), head, label, v.error ? h("div", { class: "vr-err", title: v.error }, v.error) : null);
  const img = h("img", { src: url(v.poster), alt: v.code, loading: "lazy" });
  const thumb = h("div", { class: "vr-thumb", onclick: () => openPlayer(v) }, img, v.posterCta ? h("img", { class: "cta", src: url(v.posterCta), alt: "" }) : null);
  let pv = null;
  thumb.onmouseenter = () => { pv = h("video", { src: url(v.preview), muted: true, autoplay: true, loop: true, playsinline: true }); thumb.append(pv); };
  thumb.onmouseleave = () => { pv?.remove(); pv = null; };
  return h("div", { class: "vr-card" }, thumb, head, label, h("div", { class: "btnrow" }, h("button", { class: "small", onclick: () => api("POST", "/api/variants/open", { code: v.code }).catch((e) => toast(e.data?.error ?? e.message)), title: "Abrir este video en QuickTime" }, "Ver"), h("button", { class: "small", onclick: () => start([v.code]), title: "Volver a renderizar solo esta" }, "Rehacer")));
}
async function exportNames() {
  try {
    const r = await api("POST", "/api/variants/export", {});
    toast(`Listo: ${r.file.split("/").slice(-2).join("/")} (nombres de archivo → textos)`, 4000);
  } catch (err) { toast(err.data?.error ?? err.message, 4000); }
}

function gallery() {
  const m = data?.manifest;
  const box = h("div", {}, h("div", { class: "grp" }, "Resultados"));
  if (!m?.variants?.length) { box.append(h("div", { class: "cost-hint" }, "Todavía no hay variantes renderizadas.")); return box; }
  box.append(h("div", { class: "vr-grid" }, m.variants.map(card)));
  const done = m.variants.filter((v) => v.status === "done").length;
  box.append(h("div", { class: "vr-foot" },
    h("button", { class: "small", onclick: () => api("POST", "/api/variants/open", {}).catch((e) => toast(e.message)) }, "Abrir carpeta"),
    m.grid ? h("a", { class: "small btnlike", href: url(m.grid), target: "_blank" }, "Hoja de contacto") : null,
    done ? h("button", { class: "small", onclick: exportNames, title: "Escribe variants/names.csv: nombre de archivo → textos del gancho y del cierre" }, "Exportar nombres para Meta") : null));
  return box;
}

function render(el) {
  const doc = buildDoc();
  const bad = problems.errors;
  el.replaceChildren(h("h3", {}, "Variantes en un clic"), h("div", { class: "sub" }, "Un video, varias versiones para probar (A/B). Solo cambia el texto: nada de generación de pago."));
  el.append(hookBlock(), ctaBlock());
  if (bad.length) el.append(h("ul", { class: "vr-msg bad" }, bad.map((e) => h("li", {}, e))));
  if (problems.warnings.length) el.append(h("ul", { class: "vr-msg warn" }, problems.warnings.map((e) => h("li", {}, e))));
  const bar = h("div", { class: "progress" }, h("div", { style: { width: `${Math.round(((prog.n - 1 + prog.frac) / Math.max(prog.total, 1)) * 100)}%` } }));
  el.append(h("div", { class: "vr-run" },
    h("span", { class: "vr-sum" }, summary()),
    h("button", { class: "accent", disabled: running || !doc || bad.length > 0, onclick: () => start() }, running ? `Renderizando ${prog.n}/${prog.total}…` : "Renderizar variantes")));
  if (running) el.append(bar);
  el.append(gallery());
}

export async function init() {
  $("btnVariants").onclick = async () => {
    togglePopover(ID, $("btnVariants"), render, { width: 560 });
    if (popoverOpen(ID)) await load();
  };
  const es = new EventSource("/api/events");
  es.addEventListener("variants", async (ev) => {
    const d = JSON.parse(ev.data);
    if (d.event === "start") { running = true; prog = { n: 0, total: d.total, frac: 0, code: null }; }
    else if (d.event === "variant") { prog.n = d.n; prog.total = d.total; prog.code = d.code; prog.frac = 0; if (d.status !== "running") prog.frac = 1; }
    else if (d.event === "progress") { prog.n = d.n; prog.frac = d.frac; }
    if (d.event === "finished") { running = false; }
    if (d.event === "variant" || d.event === "finished" || d.event === "start") await load();
    else { paintButton(); refreshPopover(ID); }
  });
  await load();
}
