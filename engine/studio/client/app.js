// Estudio client entry: boot, top bar, save, keyboard, server events.
import { S, on, emit, load, commit, isDirty, dirtyDocs, undo, redo, toast, setTime, selectElement, clearSel, selected, selIds, json, mmss, revalidate } from "./store.js";
import { api, get } from "./api.js";
import * as preview from "./preview.js";
import * as stage from "./stage.js";
import * as timeline from "./timeline.js";
import * as inspector from "./inspector.js";
import * as caps from "./captions.js";
import * as ops from "./ops.js";
import * as edlui from "./edl-ui.js";
import * as sfxlane from "./sfxlane.js";
import { X, init as initExtras, onExtrasEvent, openUpgrade, openRequests, runAction } from "./extras.js";
import { startRender, onRenderEvent } from "./render.js";
import { openHistory, openComments, refreshComments } from "./lists.js";
import { initAssetBanner } from "./logo.js";
import { showMenu, showShortcuts, modalOpen, closeModal, closeMenu } from "./menus.js";
import { validateMotion } from "./schema.js";
import * as LIB from "#motion-lib/index.js";
import { $, h } from "./dom.js";
import { init as initReview } from "./review.js";
import { init as initCosts } from "./costs.js";
import { init as initVariants } from "./variants.js";
import { initRail } from "./rail.js";
import { loadMedia, onMediaEvent } from "./media-store.js";
import "./panel-media.js";
import "./panel-music.js";
import "./panel-text.js";
import "./panel-screens.js";
import "./panel-transitions.js";
import "./panel-effects.js";
import "./panel-products.js";
import { initProducts } from "./products-panel.js";

window.__studio = { S, preview, stage, api, X, caps, timeline, edlui };

// ---------- banner ----------
function banner(text, bad = false, actions = []) {
  const b = $("banner");
  b.className = bad ? "bad" : "";
  b.hidden = !text;
  b.replaceChildren();
  if (!text) return;
  b.append(h("span", {}, text), ...actions.map(([label, fn]) => h("button", { class: "small", onclick: fn }, label)));
}

// ---------- state ----------
async function loadState(first = false) {
  const st = await get("/api/state");
  S.comp = st.comp; S.run = st.run; S.history = st.history; S.audio = st.audio;
  load({ motion: st.motion, version: st.version, captions: st.docs.captions.doc, zones: st.docs.zones.doc, capVersion: st.docs.captions.version, zonesVersion: st.docs.zones.version, edl: st.docs.edl?.doc, edlVersion: st.docs.edl?.version, logo: st.docs.logo?.doc, logoVersion: st.docs.logo?.version, cta: st.docs.cta?.doc, ctaVersion: st.docs.cta?.version, sfx: st.docs.sfx?.doc, sfxVersion: st.docs.sfx?.version });
  $("where").textContent = `${st.run} / ${st.comp}`;
  if (first) {
    S.compUrl = st.comp_url;
    if (st.words) S.words = await (await fetch(st.words)).json();
    // Comp-local element types (<comp>/motion-lib/<type>.js): listed under "De este video" in Pantallas, validated, reviewed, with their SFX.
    const local = await LIB.loadLocal(`/${encodeURIComponent(st.comp)}/motion-lib/`).catch((err) => ({ types: [], errors: [{ file: "motion-lib", problems: [err.message] }] }));
    for (const e of local.errors) toast(`El elemento propio ${e.file.replace(/^local:/, "")} no cumple el contrato: ${e.problems.join("; ")}`, 9000);
    await preview.loadComp(st.comp_url);
    await loadMedia().catch((err) => console.warn("media library not loaded", err)); // uploaded clips must reach the comp BEFORE the first plan
    preview.setAudioSource(st.audio[0]?.url ?? null);
    preview.fit();
    await preview.applyAll();
    timeline.fitZoom();
    await refreshComments();
  }
  S.build = st.build;
  S.final = st.final ?? null;
  return st;
}
const stateChanged = () => {
  $("dirtyDot").hidden = !isDirty();
  $("btnSave").classList.toggle("dirty", isDirty());
  $("btnUndo").disabled = !S.undo.length;
  $("btnRedo").disabled = !S.redo.length;
  document.title = `${isDirty() ? "• " : ""}Estudio · ${S.comp}`;
};
on("motion", stateChanged);
on("products", () => loadMedia().catch(() => {})); // product photos also show in the Media panel (Imágenes)

// ---------- save ----------
async function save() {
  const d = dirtyDocs();
  if (!d.motion && !d.captions && !d.zones && !d.logo && !d.cta && !d.edl && !d.sfx && !S.idsPending) { toast("Nada que guardar"); return; }
  const v = validateMotion(S.motion, S.cta?.at ?? S.duration);
  if (v.errors.length) { banner(`No se puede guardar: ${v.errors[0]}`, true); return; }
  try {
    if (d.motion || S.idsPending) {
      const r = await api("PUT", "/api/motion", { version: S.versions.motion, motion: S.motion, total: S.duration });
      S.versions.motion = r.version; S.saved.motion = json(S.motion); S.idsPending = false; S.history = r.history;
    }
    for (const name of ["captions", "zones", "edl", "logo", "cta", "sfx"]) {
      if (!d[name]) continue;
      const doc = name === "cta" ? S.ctaDoc : S[name]; // S.cta is the comp's CONFIG.cta; the cta.json document is S.ctaDoc
      const r = await api("PUT", `/api/doc/${name}`, { version: S.versions[name], doc });
      S.versions[name] = r.version; S.saved[name] = json(doc);
    }
    banner("");
    stateChanged();
    toast("Guardado");
  } catch (err) {
    if (err.status === 409) banner("Un archivo cambió en disco (otro editor), recarga.", true, [["Recargar (descarta mis cambios)", reloadFromDisk]]);
    else banner(`No se pudo guardar: ${err.data?.errors?.[0] ?? err.message}`, true);
  }
}
async function reloadFromDisk() { await loadState(); banner(""); toast("Recargado desde disco"); }
$("btnSave").onclick = save;

// ---------- top bar ----------
$("btnUndo").onclick = undo;
$("btnRedo").onclick = redo;
$("btnRender").onclick = () => startRender();
$("btnPlay").onclick = () => preview.toggle();
$("btnFit").onclick = () => timeline.fitZoom();
$("btnSplit").onclick = () => edlui.splitAtPlayhead();
$("btnHelp").onclick = showShortcuts;
$("btnGuides").onclick = () => { S.guides = !S.guides; $("btnGuides").classList.toggle("on", S.guides); stage.redraw(); };
$("btnComment").onclick = toggleComment;
function toggleComment() {
  S.commentMode = !S.commentMode;
  $("btnComment").classList.toggle("on", S.commentMode);
  stage.redraw();
}
on("comments", () => { $("btnComment").classList.toggle("on", S.commentMode); stage.redraw(); });
$("btnMore").onclick = (e) => {
  e.stopPropagation();
  const r = $("btnMore").getBoundingClientRect();
  const open = S.comments.filter((c) => !c.resolved).length;
  showMenu(r.right - 220, r.bottom + 4, [
    { label: "Historial…", onClick: openHistory },
    { label: `Comentarios${open ? ` (${open})` : ""}…`, onClick: openComments },
    { label: "Solicitudes…", onClick: openRequests },
    "-",
    { label: "Pasar a 1080p…", hint: "paso final", onClick: openUpgrade },
    "-",
    { label: "Atajos", hint: "?", onClick: showShortcuts }
  ]);
};
on("play", () => { $("btnPlay").textContent = S.playing ? "⏸" : "▶"; });
const timeText = () => { $("timeRead").textContent = `${mmss(S.t)} / ${mmss(S.duration)}`; };
on("time", timeText);
on("rendered", () => {
  const avg = preview.avgMs();
  $("perf").textContent = avg ? `${avg.toFixed(1)} ms/cuadro` : "";
});

// ---------- keyboard ----------
function deleteSelection() {
  if (S.selection.kind === "element") ops.remove();
  else if (S.selection.kind === "caption" && S.selection.seg) caps.removeSeg(S.selection.seg);
  else if (S.selection.kind === "segment") edlui.removeSegment(S.selection.seg);
  else if (S.selection.kind === "sfxev") sfxlane.remove();
}
document.addEventListener("keydown", (e) => {
  const mod = e.metaKey || e.ctrlKey;
  const ae = document.activeElement;
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(ae?.tagName) && !(ae.type === "checkbox" || ae.type === "range");
  if (mod && e.key.toLowerCase() === "s") { e.preventDefault(); save(); return; }
  if (mod && e.key.toLowerCase() === "z") { if (typing) return; e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if (typing) { if (e.key === "Escape") ae.blur(); return; }
  if (modalOpen()) { if (e.key === "Escape") closeModal(); return; }
  if (e.key === " ") { e.preventDefault(); preview.toggle(); }
  else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
    e.preventDefault();
    const d = (e.shiftKey ? 1 : 1 / 30) * (e.key === "ArrowLeft" ? -1 : 1);
    preview.seek(Math.round((S.t + d) * 30) / 30);
  } else if (e.key === "?" ) showShortcuts();
  else if (e.key.toLowerCase() === "c" && !mod) toggleComment();
  else if (e.key.toLowerCase() === "s" && !mod) timeline.splitAtPlayhead();
  else if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); deleteSelection(); }
  else if (e.key === "Escape") { closeMenu(); S.commentMode = false; $("btnComment").classList.remove("on"); clearSel(); stage.redraw(); }
});
window.addEventListener("beforeunload", (e) => { if (isDirty()) { e.preventDefault(); e.returnValue = ""; } });

// ---------- server events ----------
function connectEvents() {
  const es = new EventSource("/api/events");
  es.addEventListener("motion", (ev) => {
    const d = JSON.parse(ev.data);
    if (d.version === S.versions.motion) return;
    if (!isDirty()) reloadFromDisk().then(() => toast("motion.json cambió en disco (otro editor): recargado"));
    else banner("motion.json cambió en disco (otro editor) y tienes cambios sin guardar.", false, [["Recargar (descarta mis cambios)", reloadFromDisk]]);
  });
  es.addEventListener("doc", (ev) => {
    const d = JSON.parse(ev.data);
    if (d.version === S.versions[d.name]) return;
    if (!dirtyDocs()[d.name]) reloadFromDisk().then(() => toast(`${d.name}.json cambió en disco: recargado`));
    else banner(`${d.name}.json cambió en disco y tienes cambios sin guardar.`, false, [["Recargar (descarta mis cambios)", reloadFromDisk]]);
  });
  es.addEventListener("comments", () => refreshComments().catch(() => {}));
  es.addEventListener("render", (ev) => onRenderEvent(JSON.parse(ev.data)));
  es.addEventListener("extras", () => onExtrasEvent());
  es.addEventListener("media", () => onMediaEvent());
}

initAssetBanner();
(async () => {
  try {
    await loadState(true);
    connectEvents();
    await initExtras().catch((err) => console.warn("extras not loaded", err));
    initReview().catch((err) => console.warn("review not loaded", err));
    initCosts().catch((err) => console.warn("costs not loaded", err));
    initVariants().catch((err) => console.warn("variants not loaded", err));
    initRail($("rail"), $("panelCol"));
    initProducts();
    inspector.render();
    timeline.render();
    stateChanged();
    setTime(0);
    timeText();
    window.__studio.ready = true;
  } catch (err) {
    console.error(err);
    banner(`No se pudo iniciar: ${err.message}`, true);
  }
})();
