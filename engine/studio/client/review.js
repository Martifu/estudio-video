// "Revisar": traffic-light review of the video against references/motion-reglas.md and calidad.md.
// One top-bar button with red / yellow / green counts; the panel lists the checks (click = go to the time and select the element).
// Free and local: the checks (review-rules.js) run in the browser on the data the editor already has; re-run (debounced) after every edit.
// Loudness is the one measurement that needs ffmpeg: the server computes it on demand and caches it by file mtime.
import { S, on, toast, byId, selectElement, selectCaption, clearSel } from "./store.js";
import { api, get } from "./api.js";
import * as preview from "./preview.js";
import { segments, capStyle } from "./captions.js";
import { runReview } from "./review-rules.js";
import { togglePopover, refreshPopover, popoverOpen } from "./popover.js";
import { $, h } from "./dom.js";

const ID = "review";
let ctx = { edl: null, logo: null, cta: null, loudness: null }; // optional files read by the server (any may be absent)
let result = { items: [], counts: { red: 0, yellow: 0, green: 0 } };
let ready = false;
let timer = null;

const finite = (v) => (Number.isFinite(Number(v)) && v !== null ? Number(v) : null);

/** Everything the checks need, from the live editor state. */
export function buildInput() {
  const st = S.studio ?? {};
  let cta = S.cta ? { ...S.cta } : null;
  if (ctx.cta && typeof ctx.cta === "object") { // cta.json: live title / subtitle / duration; enabled:false = no end card
    if (ctx.cta.enabled === false) cta = null;
    else if (cta) {
      if (typeof ctx.cta.title === "string") cta.title = ctx.cta.title;
      if (typeof ctx.cta.subtitle === "string") cta.subtitle = ctx.cta.subtitle;
      if (finite(ctx.cta.dur) !== null) cta.dur = finite(ctx.cta.dur);
    }
  }
  return {
    duration: S.duration, motion: S.motion, products: S.products?.doc ?? null, plan: S.plan, zones: S.zones ? { ...S.zones } : null,
    words: S.words ?? [], captionSegs: segments(), captionSize: finite(S.captions?.style?.size) ?? finite(st.captions?.size) ?? finite(capStyle().size),
    hook: st.hook ?? null, cta, clips: st.clips ?? [], logoCfg: ctx.logo, edl: ctx.edl, loudness: ctx.loudness?.result ?? null
  };
}

export function run() {
  if (!S.plan) return;
  try {
    result = runReview(buildInput());
  } catch (err) {
    console.error("review failed", err);
    return;
  }
  ready = true;
  paintButton();
  refreshPopover(ID);
}
const schedule = () => { clearTimeout(timer); timer = setTimeout(run, 350); };

// ---------- top bar button ----------
const dot = (cls) => h("i", { class: `dot ${cls}` });
function paintButton() {
  const b = $("btnReview");
  const c = result.counts;
  b.replaceChildren(h("span", {}, "Revisar"),
    ...(ready ? [["red", c.red], ["yellow", c.yellow], ["green", c.green]].map(([k, n]) => h("span", { class: "n" }, dot(k), String(n))) : []));
  b.title = ready
    ? `Revisión de reglas de motion y calidad: ${c.red} en rojo, ${c.yellow} en amarillo, ${c.green} correctas. Es local y gratis; se actualiza al editar.`
    : "Revisión de reglas de motion y calidad (calculando…)";
}

// ---------- panel ----------
const mmss = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, "0")}`;
function go(it) {
  if (it.t !== null && it.t !== undefined) preview.seek(Math.max(0, it.t));
  if (it.elementId && byId(it.elementId)) selectElement(it.elementId);
  else if (it.segId) selectCaption(it.segId);
  else clearSel();
}
function itemRow(it) {
  return h("div", { class: "rv-item", title: `${it.rule ?? ""}${it.t != null ? "\n\nClic: ir a ese momento" : ""}`, onclick: () => go(it) },
    dot(it.severity), h("b", {}, it.title), it.t != null ? h("span", { class: "tm" }, mmss(it.t)) : h("span"),
    h("div", { class: "why" }, it.detail));
}
function loudnessRow() {
  const l = ctx.loudness;
  if (!l?.exists) return h("span", { class: "muted" }, "Sonoridad: renderiza el video para medirla.");
  const r = l.result;
  const running = l.running || measuring;
  const label = running ? "Midiendo…" : r ? "Volver a medir" : "Medir sonoridad";
  return h("div", { class: "rv-foot" },
    h("span", { class: r ? "" : "muted", title: RULE_LOUD }, r ? `Último render: ${r.integrated.toFixed(1)} LUFS${Number.isFinite(r.truePeak) ? ` · ${r.truePeak.toFixed(1)} dBTP` : ""}` : l.stale ? "La medición es de un render anterior." : "Sonoridad sin medir."),
    h("button", { class: "small", disabled: running, onclick: measure }, label));
}
const RULE_LOUD = "calidad.md · Técnico: −14 LUFS integrado y ≤ −1 dBTP, medido con ebur128 sobre el mp4 final. Usa ffmpeg en tu equipo, sin costo.";
let measuring = false;
async function measure() {
  measuring = true;
  refreshPopover(ID);
  try {
    await api("POST", "/api/review/loudness", {});
    for (let i = 0; i < 100; i += 1) { // poll up to ~2.5 min
      await new Promise((r) => setTimeout(r, 1500));
      const st = await get("/api/review/loudness");
      ctx.loudness = st;
      if (!st.running) { if (st.error) toast(st.error, 4000); break; }
    }
  } catch (err) {
    toast(err.data?.error ?? err.message, 4000);
  }
  measuring = false;
  run();
  refreshPopover(ID);
}

function render(el) {
  const c = result.counts;
  const by = (s) => result.items.filter((i) => i.severity === s);
  el.replaceChildren(
    h("h3", {}, "Revisión"),
    h("div", { class: "sub" }, `${c.red} en rojo · ${c.yellow} en amarillo · ${c.green} correctas. Local y gratis; pasa el cursor sobre un punto para ver la regla.`));
  if (!ready) { el.append(h("div", { class: "empty" }, "Calculando…")); return; }
  for (const [sev, label] of [["red", "Corregir"], ["yellow", "Revisar"]]) {
    const list = by(sev);
    if (!list.length) continue;
    el.append(h("div", { class: "grp" }, dot(sev), label), ...list.map(itemRow));
  }
  if (!c.red && !c.yellow) el.append(h("div", { class: "empty" }, "Todo en verde."));
  const ok = by("green");
  if (ok.length) {
    const d = h("details", { class: "rv-greens" }, h("summary", { class: "grp" }, dot("green"), `Correctas (${ok.length})`),
      ...ok.map((it) => h("div", { class: "rv-ok", title: it.rule }, h("b", {}, it.title), h("span", {}, it.detail))));
    el.append(d);
  }
  el.append(loudnessRow(), h("div", { class: "cost-hint" }, "No se puede juzgar aquí: timbre y naturalidad de la voz, lip-sync ni si una frase suena fusionada; eso lo confirma una persona."));
}

async function refreshContext() {
  try {
    ctx = await get("/api/review/context");
  } catch (err) {
    console.warn("review context not loaded", err);
  }
  run();
}

export async function init() {
  $("btnReview").onclick = async () => {
    togglePopover(ID, $("btnReview"), render);
    if (popoverOpen(ID)) await refreshContext();
  };
  paintButton();
  on("plan", schedule);
  window.addEventListener("focus", () => { refreshContext(); });
  await refreshContext();
  window.__studio.review = { run, buildInput, get result() { return result; } };
}
