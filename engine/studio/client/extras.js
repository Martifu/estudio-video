// Estudio extras (client): media versions, audio settings, cost-classed actions and the request queue.
// Paid work is never executed here: confirming creates an `approved` request (<comp>/.studio/requests.jsonl) the assistant processes.
// The pieces are exported as inspector sections (track inspectors) and menu actions; there are no tabs.
import { S, on, emit, toast } from "./store.js";
import { api, get } from "./api.js";
import * as preview from "./preview.js";
import * as sfx from "./sfx.js";
import { h, esc, $ } from "./dom.js";
import { openModal, closeModal } from "./menus.js";
import { section, slider, note, checkBox } from "./ui.js";
import { startRender } from "./render.js";

export const X = { config: null, entries: [], active: {}, audio: null, requests: [], budget: null, drafts: [], actions: {}, sfxKit: { kinds: {} } };

export const BADGE = { free: ["free", "Gratis"], elevenlabs: ["eleven", "ElevenLabs"], higgsfield: ["higgs", "Higgsfield"] };
export const badge = (cls) => `<span class="badge ${BADGE[cls][0]}">${BADGE[cls][1]}</span>`;
const wordsText = (a, b) => S.words.slice(a, b + 1).map((w) => w.word).join(" ");

// ---------- action registry (schema-driven forms; the server holds the authoritative cost table) ----------
export const ACTIONS = {
  rerender: { label: "Renderizar (local)", cost: "free", direct: true },
  music_new: {
    label: "Pedir otra música", cost: "free", hint: "audio-studio (local): la IA genera la pista y la registra como nueva versión.",
    fields: [
      { key: "prompt", label: "Prompt", kind: "textarea", ph: "p. ej. lo-fi cálido, piano suave, 90 bpm" },
      { key: "duration_s", label: "Duración (s)", kind: "number", def: () => Math.round(S.duration || 60) }
    ]
  },
  sfx_new: {
    label: "Nuevo SFX", cost: "free", hint: "audio-studio (local).",
    fields: [
      { key: "prompt", label: "Descripción", kind: "textarea", ph: "p. ej. pop suave de burbuja, seco" },
      { key: "kind", label: "Para evento", kind: "select", options: [["pop", "pop"], ["whoosh", "whoosh"], ["notify", "notify"], ["click", "click"], ["other", "otro"]], def: () => "pop" },
      { key: "duration_s", label: "Duración (s)", kind: "number", def: () => 1 }
    ]
  },
  voice_retake: {
    label: "Regrabar frase", cost: "elevenlabs", needsRange: true, hint: "Elige palabras en la pista de voz (clic y Shift+clic).",
    fields: [
      { key: "from", label: "Desde (s)", kind: "number", def: () => (S.wordRange ? S.words[S.wordRange.a].start : S.t) },
      { key: "to", label: "Hasta (s)", kind: "number", def: () => (S.wordRange ? S.words[S.wordRange.b].end : S.t + 2) },
      { key: "text", label: "Texto", kind: "textarea", def: () => (S.wordRange ? wordsText(S.wordRange.a, S.wordRange.b) : "") },
      { key: "voice", label: "Voz (id o nombre)", kind: "text", def: () => "", ph: "vacío = la voz de la marca" }
    ]
  },
  voice_full: {
    label: "Cambiar voz completa", cost: "elevenlabs",
    fields: [
      { key: "text", label: "Guion completo", kind: "textarea", def: () => wordsText(0, S.words.length - 1) },
      { key: "voice", label: "Voz (id o nombre)", kind: "text", def: () => "" }
    ]
  },
  footage_regen: {
    label: "Regenerar tramo/toma", cost: "higgsfield", hint: "Siempre se genera como borrador 480p.",
    fields: [
      { key: "shot", label: "Toma", kind: "select", options: () => [["", "(rango de tiempo)"], ...(S.studio?.clips ?? []).map((c) => [c.name, c.name])], def: () => "" },
      { key: "from", label: "Desde (s)", kind: "number", def: () => S.t },
      { key: "to", label: "Hasta (s)", kind: "number", def: () => S.t + 5 },
      { key: "duration_s", label: "Duración generada", kind: "select", options: () => (X.config?.higgsfield.tiers ?? [5, 14]).map((t) => [String(t), `${t} s`]), def: () => "5" },
      { key: "notes", label: "Notas / prompt", kind: "textarea", ph: "qué cambiar en la toma" }
    ]
  }
};

// ---------- data ----------
export const entry = (id) => X.entries.find((e) => e.id === id);
export const activeEntry = (slot) => entry(X.active[slot]);
export const activeUrl = (slot) => activeEntry(slot)?.url ?? null;

export async function init() {
  await refresh();
  const voice = activeUrl("voice");
  if (voice) preview.setAudioSource(voice);
}
let lastVoice = null;
export async function refresh() {
  const d = await get("/api/extras");
  Object.assign(X, d);
  applyToPreview();
  renderBudget();
  emit("extras");
}
export const onExtrasEvent = () => refresh().catch(() => {});

function applyToPreview() {
  const voiceUrl = activeUrl("voice");
  if (voiceUrl && voiceUrl !== lastVoice) { if (lastVoice !== null) preview.setAudioSource(voiceUrl); lastVoice = voiceUrl; }
  preview.setMusic(activeUrl("music"));
  sfx.setKit(X.sfxKit);
  sfx.preload([...Object.values(X.sfxKit?.kinds ?? {}).map((k) => k.url), ...X.entries.filter((e) => e.slot === "sfx").map((e) => e.url)]);
  const a = X.audio;
  if (!a) return;
  const replaceUrl = (ev) => {
    const r = a.sfx.replace.find((m) => m.type === ev.type && Math.abs(m.t - ev.t) < 0.03);
    return r ? entry(r.entry)?.url ?? null : null;
  };
  preview.applyMix({
    voiceDb: a.voiceDb, musicDb: a.musicDb, musicOffset: a.musicOffset, atempo: a.voiceAtempo,
    duckDb: X.sfxKit?.duck_db ?? 11, sfx: { enabled: a.sfx.enabled, db: a.sfxDb, muted: a.sfx.mute, replace: a.sfx.replace }, replaceUrl
  });
}
function renderBudget() {
  const el = $("budget");
  const b = X.budget;
  if (!b?.available) { el.hidden = true; return; }
  el.hidden = false;
  el.textContent = `${b.spent}${b.cap != null ? ` / ${b.cap}` : ""} cr${b.committed ? ` (+${b.committed})` : ""}`;
  el.title = `Créditos gastados en este RUN${b.cap != null ? ` · tope ${b.cap}` : ""}${b.committed ? ` · ${b.committed} comprometidos en la cola` : ""}. Lee ledger.json (scripts/ledger.py); la IA corre ledger.py guard antes de gastar.`;
}
let saveTimer = null;
async function putState(patch) {
  const r = await api("PUT", "/api/extras/state", patch);
  X.active = r.active; X.audio = r.audio;
  applyToPreview();
  emit("extras");
}
/** Debounced audio-setting change: updates the preview immediately, persists after 250 ms. */
export function setAudio(patch) {
  Object.assign(X.audio, patch);
  applyToPreview();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => putState({ audio: patch }).catch((e) => toast(e.message)), 250);
}
export const setSfx = (patch) => { Object.assign(X.audio.sfx, patch); putState({ audio: { sfx: patch } }).catch((e) => toast(e.message)); applyToPreview(); };
export const setActive = (slot, id) => putState({ active: { [slot]: id } }).then(() => toast("Versión activa cambiada")).catch((e) => toast(e.message));

// ---------- inspector sections ----------
const SOURCE = { local: "local", audio_studio: "audio-studio", elevenlabs: "ElevenLabs", higgsfield: "Higgsfield" };
export function versionPicker(slot, title = "Versiones") {
  const list = X.entries.filter((e) => e.slot === slot);
  const body = list.length ? list.map((e) => {
    const q = e.quality === "draft480" ? ' <span class="badge higgs">borrador 480p</span>' : e.quality === "final1080" ? ' <span class="badge free">1080p</span>' : "";
    const row = h("label", { class: "ver" });
    row.innerHTML = `<input type="radio" name="v-${esc(slot)}" ${X.active[slot] === e.id ? "checked" : ""} ${e.invalid ? "disabled" : ""}/><div><b>${esc(e.id.replace(/^[a-z]+:/, ""))}</b>${q}<div class="muted">${esc(SOURCE[e.source] ?? e.source)}${e.cost != null ? ` · ${e.cost} cr` : ""} · ${esc((e.createdAt ?? "").slice(0, 10))}${e.note ? ` · ${esc(e.note)}` : ""}${e.invalid ? " · ruta fuera del RUN" : ""}</div></div>`;
    row.querySelector("input").onchange = () => setActive(slot, e.id);
    return row;
  }) : [note("Sin versiones registradas.")];
  return section(title, body, { key: `ver-${slot}` });
}
const actionBtn = (id) => {
  const a = ACTIONS[id];
  const b = h("button", { class: "action", onclick: () => runAction(id) });
  b.innerHTML = `<span>${a.label}</span>${badge(a.cost)}`;
  return b;
};
const A = () => X.audio;

export function musicSections() {
  const a = A();
  return [
    versionPicker("music", "Versión de música"),
    section("Mezcla", [
      slider({ label: "Nivel (dB)", value: a.musicDb, min: -24, max: 12, step: 0.5, onInput: (v) => setAudio({ musicDb: v ?? 0 }) }),
      slider({ label: "Desfase (s)", value: a.musicOffset, min: -10, max: 30, step: 0.1, onInput: (v) => setAudio({ musicOffset: v ?? 0 }) }),
      slider({ label: "Fade in (s)", value: a.fadeIn, min: 0, max: 6, step: 0.1, ph: "auto", opt: true, onInput: (v) => setAudio({ fadeIn: v }) }),
      slider({ label: "Fade out (s)", value: a.fadeOut, min: 0, max: 8, step: 0.1, ph: "auto", opt: true, onInput: (v) => setAudio({ fadeOut: v }) }),
      note("La vista previa baja la música mientras hablas (aproximado); el render usa el ducking de mix.py.")
    ]),
    section("Pedir", [actionBtn("music_new")])
  ];
}
export function voiceSections() {
  const a = A();
  const sel = S.wordRange ? `Elegido: ${S.words[S.wordRange.a].start.toFixed(2)}–${S.words[S.wordRange.b].end.toFixed(2)} s · “${wordsText(S.wordRange.a, S.wordRange.b)}”` : "Para regrabar una frase, elige palabras en la pista (clic y Shift+clic).";
  return [
    versionPicker("voice", "Versión de voz"),
    section("Nivel y velocidad", [
      slider({ label: "Nivel (dB)", value: a.voiceDb, min: -24, max: 12, step: 0.5, onInput: (v) => setAudio({ voiceDb: v ?? 0 }) }),
      slider({ label: "Velocidad ×", value: a.voiceAtempo, min: 0.9, max: 1.2, step: 0.01, onInput: (v) => setAudio({ voiceAtempo: v ?? 1 }) }),
      Math.abs((a.voiceAtempo ?? 1) - 1) > 0.001 ? note("Cambiar la velocidad desplaza el tiempo de las palabras: subtítulos y motion dejan de coincidir con el audio.", "warns") : null
    ]),
    section("Regrabar", [note(sel), actionBtn("voice_retake"), actionBtn("voice_full")])
  ];
}
export function videoSections() {
  const slots = [...new Set(X.entries.filter((e) => e.slot.startsWith("footage:")).map((e) => e.slot))];
  return [
    ...(slots.length ? slots.map((s) => versionPicker(s, `Toma: ${s.slice(8)}`)) : [section("Tomas", [note("Sin tomas registradas.")])]),
    section("Pedir", [actionBtn("footage_regen"), note("Higgsfield siempre como borrador 480p; el paso a 1080p es la acción final “Pasar a 1080p” en ⋯.")])
  ];
}
export function sfxSections() {
  const a = A();
  return [
    section("Efectos de sonido", [
      checkBox({ label: "Global", checked: a.sfx.enabled, text: "Efectos activados", onChange: (v) => setSfx({ enabled: v }) }),
      slider({ label: "Nivel (dB)", value: a.sfxDb, min: -24, max: 12, step: 0.5, onInput: (v) => setAudio({ sfxDb: v ?? 0 }) }),
      note(`${S.events.length ? "Haz clic en un efecto del carril para escucharlo y cambiarlo; arrástralo para moverlo." : "Aún no hay efectos."} Doble clic en el carril agrega uno; también puedes arrastrar un sonido desde el panel Efectos.`)
    ]),
    section("Pedir", [actionBtn("sfx_new")])
  ];
}

// ---------- modal flows ----------
const sentenceCost = (cls, est) => {
  if (!est) return "";
  if (cls === "free") return `${badge("free")} Gratis. ${esc(est.note ?? "")}`;
  if (cls === "elevenlabs") return `${badge("elevenlabs")} ~${est.chars} caracteres ≈ <b>${est.amount} créditos</b> de ElevenLabs. ${esc(est.note)}. Saldo restante: ${est.remaining ?? "no disponible aquí (la IA lo consulta con tts.py sin mostrar la clave)"}.`;
  return `${badge("higgsfield")} <b>${est.amount} créditos</b> de Higgsfield (${esc(est.note)}). Se genera como <b>borrador 480p</b>.`;
};

export async function runAction(id) {
  const a = ACTIONS[id];
  if (a.direct) { startRender(); return; }
  if (a.needsRange && !S.wordRange) toast("Elige primero palabras en la pista de voz (clic y Shift+clic)");
  const params = {};
  const card = h("div", {}, h("h2", { html: `${a.label} ${badge(a.cost)}` }));
  if (a.hint) card.append(h("div", { class: "muted" }, a.hint));
  const inputs = {};
  for (const f of a.fields ?? []) {
    const val = f.def?.() ?? "";
    const opts = typeof f.options === "function" ? f.options() : f.options;
    const el = f.kind === "textarea" ? h("textarea") : f.kind === "select" ? h("select", {}, opts.map(([v, l]) => h("option", { value: v }, l))) : h("input", { type: f.kind === "number" ? "number" : "text", step: f.kind === "number" ? "0.05" : undefined });
    el.placeholder = f.ph ?? "";
    el.value = f.kind === "number" ? (val === "" ? "" : Number(val).toFixed(2)) : val;
    inputs[f.key] = el;
    card.append(h("div", { class: `field${f.kind === "textarea" ? " col" : ""}` }, h("label", {}, f.label), el));
  }
  const cost = h("div", { class: "cost" });
  const confirmRow = h("label", { class: "check", hidden: a.cost === "free" });
  confirmRow.innerHTML = `<input type="checkbox"/> ${a.cost === "higgsfield" ? "Entiendo que esto gasta créditos de Higgsfield y se genera como <b>borrador 480p</b>" : "Entiendo que esto gasta créditos de ElevenLabs"}`;
  const ok = h("button", { class: "accent" }, a.cost === "free" ? "Confirmar (gratis)" : "Confirmar y gastar créditos");
  card.append(cost, confirmRow, h("div", { class: "row" }, h("button", { onclick: closeModal }, "Cancelar"), ok));
  openModal(card);
  const collect = () => {
    for (const f of a.fields ?? []) {
      const v = inputs[f.key].value;
      params[f.key] = f.kind === "number" || (f.key === "duration_s" && v !== "") ? Number(v) : v;
    }
    return params;
  };
  const update = async () => {
    try {
      const r = await api("POST", "/api/estimate", { action: id, params: collect() });
      cost.className = `cost ${a.cost === "free" ? "free" : a.cost === "higgsfield" ? "bad" : ""}`;
      cost.innerHTML = r.error ? `<span class="muted">Completa los datos: ${esc(r.error)}</span>` : sentenceCost(a.cost, r.estimate);
      ok.disabled = !!r.error || (a.cost !== "free" && !confirmRow.querySelector("input").checked);
    } catch (e) { cost.textContent = e.message; ok.disabled = true; }
  };
  let t = null;
  card.addEventListener("input", () => { clearTimeout(t); t = setTimeout(update, 150); });
  card.addEventListener("change", update);
  update();
  ok.onclick = async () => {
    try {
      const { request } = await api("POST", "/api/request", { action: id, params: collect(), confirmed: true });
      closeModal();
      toast(`Solicitud encolada (${request.id}): la IA la procesará`);
      await refresh();
    } catch (e) { toast(`No se pudo encolar: ${e.data?.error ?? e.message}`); }
  };
}

export async function openUpgrade() {
  await refresh();
  const cfg = X.config.higgsfield;
  const card = h("div", {}, h("h2", { html: `Pasar a 1080p ${badge("higgsfield")}` }));
  if (!X.drafts.length) {
    card.append(h("p", {}, "No hay borradores de Higgsfield en las versiones activas. Todo lo generado ya está en su calidad final o aún no hay tomas de IA."), h("div", { class: "row" }, h("button", { onclick: closeModal }, "Cerrar")));
    openModal(card);
    return;
  }
  const total = X.drafts.reduce((n, d) => n + d.credits, 0);
  card.append(h("p", { class: "muted" }, `Paso final. Cada borrador 480p se regenera en 1080p (${cfg.label}). Los borradores caducan ${cfg.draft_expires_days} días después de crearse.`));
  X.drafts.forEach((d) => {
    const warn = d.daysLeft != null && d.daysLeft <= 1 ? " style='color:#c0261d'" : "";
    card.append(h("div", { class: "item", html: `<div class="meta"><span><b>${esc(d.slot)}</b> · ${esc(d.id.replace(/^[a-z]+:/, ""))}</span><span><b>${d.credits} cr</b></span></div><div class="muted"${warn}>creado ${esc((d.createdAt ?? "").slice(0, 10))} · ${d.daysLeft != null && d.daysLeft <= 0 ? "caducado" : `quedan ${d.daysLeft ?? "?"} día(s)`} · ${d.duration} s</div>` }));
  });
  const ok = h("button", { class: "accent", disabled: true }, "Confirmar y gastar créditos");
  card.append(
    h("div", { class: "cost bad", html: `<b>Total: ${total} créditos</b> (${X.drafts.length} toma(s)). Esto gastará créditos de Higgsfield; se registra una única solicitud "upgrade_1080p" con los job_id de los borradores.` }),
    h("label", { class: "check" }, h("input", { type: "checkbox", onchange: (e) => { ok.disabled = !e.target.checked; } }), ` Entiendo que esto gasta ${total} créditos`),
    h("div", { class: "row" }, h("button", { onclick: closeModal }, "Cancelar"), ok)
  );
  openModal(card);
  ok.onclick = async () => {
    try {
      const { request } = await api("POST", "/api/request", { action: "upgrade_1080p", confirmed: true, params: {} });
      closeModal();
      toast(`Solicitud 1080p encolada (${request.id})`);
      await refresh();
    } catch (e) { toast(`No se pudo encolar: ${e.data?.error ?? e.message}`); }
  };
}

export function openRequests() {
  const card = h("div", {}, h("h2", {}, "Solicitudes"), note("Las acciones con costo quedan como solicitud approved en .studio/requests.jsonl; la IA las procesa (ledger.py guard / get_cost antes de gastar) y anota el costo real."));
  if (!X.requests.length) card.append(h("div", { class: "empty" }, "Sin solicitudes."));
  [...X.requests].reverse().forEach((r) => {
    const est = r.estimate ? (r.estimate.amount ? `${r.estimate.amount} cr` : "gratis") : "";
    const it = h("div", { class: "item", html: `<div class="meta"><span class="mono">${esc(r.id)} · ${esc(r.action)}</span><span>${esc(r.status)}</span></div><div>${badge(r.costClass)} <span class="muted">${esc(est)}${r.cost_real != null ? ` · real ${esc(r.cost_real)} cr` : ""}${r.result_media_id ? ` · → ${esc(r.result_media_id)}` : ""}</span></div>${r.error ? `<div class="errs">${esc(r.error)}</div>` : ""}` });
    if (r.status === "pending" || r.status === "approved") {
      const row = h("div", { style: { marginTop: "6px" } });
      if (r.status === "pending") row.append(h("button", { class: "small accent", onclick: () => setStatus(r.id, "approved", card) }, "Aprobar"), " ");
      row.append(h("button", { class: "small danger", onclick: () => setStatus(r.id, "cancelled", card) }, "Cancelar"));
      it.append(row);
    }
    card.append(it);
  });
  card.append(h("div", { class: "row" }, h("button", { onclick: closeModal }, "Cerrar")));
  openModal(card);
}
async function setStatus(id, status) {
  try { await api("POST", "/api/request/status", { id, status }); await refresh(); openRequests(); } catch (e) { toast(e.data?.error ?? e.message); }
}
on("extras", () => {});
