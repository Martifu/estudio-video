// Preview: the comp in an iframe (1080x1920, scaled), scrubbed through its own window.render(t); the voice <audio> is the master clock.
// Playback never starts a render while one is in flight (drops to the latest t), prefetches footage ahead of the playhead and draws
// into an off-screen buffer that is blitted only when complete (window.__BUFFER), so the visible canvas never shows a cleared frame.
import { S, on, emit, setTime, effZones } from "./store.js";
import { autoFromPhrases } from "./captions.js";
import * as sfx from "./sfx.js";
import * as edlAudio from "./edlaudio.js";

const frame = document.getElementById("comp");
const audio = document.getElementById("audio");
const stage = document.getElementById("stage");
const wrap = document.getElementById("stageWrap");
let win = null;

export const perf = { samples: [], dropped: 0, frames: 0, planMs: 0, opts: { buffer: true, prefetch: true } };
export const getWin = () => win;

export async function loadComp(url) {
  await new Promise((resolve) => { frame.onload = resolve; frame.src = url; });
  const t0 = performance.now();
  while (!frame.contentWindow.READY) {
    if (performance.now() - t0 > 60000) throw new Error("la composición no terminó de cargar");
    await new Promise((r) => setTimeout(r, 50));
  }
  win = frame.contentWindow;
  S.studio = win.STUDIO;
  S.duration = win.STUDIO.duration;
  S.cta = win.STUDIO.cta;
  // Skin of the product screens: comps built before they had a ui element carry no CONFIG.uiSkinFile, so ask the server (comp -> run -> brand).
  // Comp-local element types (<comp>/motion-lib/): the comp registers them when built with them; this covers files added since the last build.
  try { await win.loadLocalLib?.("./motion-lib/"); } catch { /* reported by the editor's own registry */ }
  try { const r = await fetch("/api/ui-skin"); const j = r.ok ? await r.json() : null; if (j?.doc && win.setUiSkin) await win.setUiSkin(j.doc); } catch { /* no skin: derived from brand.json */ }
  applyPerfOpts();
}
export function applyPerfOpts() {
  if (!win) return;
  win.__BUFFER = perf.opts.buffer;
  win.setFootageCache?.(perf.opts.prefetch ? 96 : 24);
}

/** Elements that fail validation would throw inside the planner/drawers: preview them as hidden. */
function sanitized() {
  return S.motion.map((el) => (S.layerOff.motion || S.issues[el.id]?.errors.length ? { ...el, hidden: true } : el));
}
const zonesDoc = () => (S.zones ? { top: effZones().top, bottom: effZones().bottom, left: effZones().left, right: effZones().right } : null);
const captionsDoc = () => {
  if (!S.layerOff.captions) return S.captions;
  return { style: S.captions?.style ?? {}, segments: [] };
};

/** Push motion + zones + captions into the comp (one re-plan), then redraw. */
export async function applyAll() {
  if (!win) return;
  const t0 = performance.now();
  try {
    await win.setLogoSrc?.(S.logo?.src ?? null); // decode the per-comp logo before the planner measures it (failures land in ASSET_ERRORS)
    S.plan = win.setState({ elements: sanitized(), zones: zonesDoc(), captions: captionsDoc(), edl: S.edl, logo: S.logo, cta: S.ctaDoc });
    syncAssetIssues();
    S.events = win.TIMELINE.events;
    syncFromComp();
    S.autoSegs = autoFromPhrases(win.getAutoPhrases());
  } catch (err) {
    console.error("setState failed", err);
  }
  perf.planMs = performance.now() - t0;
  emit("plan");
  requestRender(S.t, true);
}
export const applyMotion = applyAll; // legacy name

/** window.ASSET_ERRORS / ASSET_WARNINGS of the comp (logo images that failed to load...): the studio shows them in a banner. */
function syncAssetIssues() {
  const next = { errors: [...(win.ASSET_ERRORS ?? [])], warnings: [...(win.ASSET_WARNINGS ?? [])] };
  if (JSON.stringify(next) === JSON.stringify(S.assetIssues)) return;
  S.assetIssues = next;
  emit("assets");
}

/** The cut changes the duration, the CTA time and the words (captions): read them back from the comp. */
function syncFromComp() {
  const st = win.STUDIO;
  S.cta = st.cta;
  if (st.words !== S.words) { S.words = st.words; emit("words"); }
  if (Math.abs(st.duration - S.duration) > 1e-6) {
    S.duration = st.duration;
    if (S.t > S.duration) S.t = S.duration;
    emit("duration");
  }
}

// ---------- coalesced rendering: one render(t) in flight, always the latest t after it ----------
let want = null, running = false;
export function requestRender(t, force = false) {
  want = { t, force };
  if (!running) pump();
}
async function pump() {
  running = true;
  while (want) {
    const { t } = want;
    want = null;
    const t0 = performance.now();
    try { await win.render(t); } catch (err) { console.error("render failed", err); }
    const ms = performance.now() - t0;
    perf.samples.push(ms);
    if (perf.samples.length > 90) perf.samples.shift();
    perf.frames += 1;
    if (want) perf.dropped += 1;
    const r = win.getCaptionRect?.();
    S.capRect = r ? { ...r } : null;
  }
  running = false;
  emit("rendered");
}
export const avgMs = () => (perf.samples.length ? perf.samples.reduce((a, b) => a + b, 0) / perf.samples.length : 0);
export const idle = () => new Promise((resolve) => {
  const tick = () => (!running && !want ? resolve() : setTimeout(tick, 10));
  tick();
});

// ---------- fit ----------
export function fit() {
  const w = wrap.clientWidth - 16, h = wrap.clientHeight - 16;
  const s = Math.max(0.05, Math.min(w / 1080, h / 1920));
  stage.style.transform = `scale(${s})`;
  stage.style.marginRight = `${1080 * s - 1080}px`;
  stage.style.marginBottom = `${1920 * s - 1920}px`;
  document.documentElement.style.setProperty("--u", String(1 / s));
  S.scale = s;
  emit("fit");
}
new ResizeObserver(fit).observe(wrap);

// ---------- mix preview ----------
const musicEl = new Audio();
musicEl.preload = "auto";
export const mixState = {
  musicOffset: 0, musicDb: 0, voiceDb: 0, atempo: 1, musicUrl: null, duckDb: 11,
  sfx: { enabled: true, db: 0, muted: [], replace: [] }, replaceUrl: () => null
};
const vol = (db, base = 1) => Math.max(0, Math.min(1, base * 10 ** (db / 20)));
export function setMusic(url) {
  mixState.musicUrl = url || null;
  musicEl.src = url || "";
  if (url) musicEl.load();
}
export function applyMix(a = {}) {
  Object.assign(mixState, a);
  audio.volume = vol(mixState.voiceDb);
  edlAudio.setGain(S.layerOff.voice ? 0 : vol(mixState.voiceDb, 1));
  audio.playbackRate = mixState.atempo || 1;
  audio.muted = !!S.layerOff.voice;
  musicEl.muted = !!S.layerOff.music;
}
// Approximate ducking: music drops by duckDb while a word is being spoken (one-pole attack 0.12 s / release 0.6 s, like mix.py).
let duckEnv = 0, duckAt = 0;
const speaking = (t) => S.words.some((w) => t >= w.start - 0.03 && t <= w.end + 0.12);
function syncMusic(t) {
  const now = performance.now();
  const dt = Math.min(0.1, (now - duckAt) / 1000);
  duckAt = now;
  const target = speaking(t) ? 1 : 0;
  const tau = target > duckEnv ? 0.12 : 0.6;
  duckEnv += (target - duckEnv) * (1 - Math.exp(-dt / tau));
  musicEl.volume = vol(mixState.musicDb - mixState.duckDb * duckEnv, 0.35);
  if (!mixState.musicUrl) return;
  const mt = t + mixState.musicOffset;
  if (!S.playing || mt < 0) { musicEl.pause(); return; }
  if (musicEl.paused) { musicEl.currentTime = mt; musicEl.play().catch(() => {}); } else if (Math.abs(musicEl.currentTime - mt) > 0.3) musicEl.currentTime = mt;
}
/** Test hook: current preview music volume and duck envelope. */
export const debugMix = () => ({ musicVolume: musicEl.volume, duckEnv, playing: !musicEl.paused, musicTime: musicEl.currentTime });
const sfxOpts = () => ({
  enabled: mixState.sfx.enabled && !S.layerOff.sfx, db: mixState.sfx.db,
  isMuted: (ev) => (ev.auto ?? true) && mixState.sfx.muted.some((m) => m.type === ev.type && Math.abs(m.t - (ev.baseT ?? ev.t)) < 0.03), // legacy state.json mute (old comps)
  replaceUrl: (ev) => mixState.replaceUrl(ev),
  resolve: (ev) => sfxProvider?.resolve(ev, mixState.replaceUrl)
});
// engine/sfx-doc.js merged events (sfxlane.js registers itself): the preview plays what the render will play
let sfxProvider = null;
export const setSfxProvider = (p) => { sfxProvider = p; };
const playSfx = () => (sfxProvider ? sfx.scheduleMerged(sfxProvider.events(), S.t, sfxOpts()) : sfx.schedule(S.events, S.t, sfxOpts()));
const rescheduleSfx = () => { if (S.playing) playSfx(); };
on("plan", rescheduleSfx);
// With an EDL the voice is the source audio of each segment (the rendered clips.wav is stale), driven by the performance.now clock.
const rescheduleCut = () => { if (S.playing && S.edl) edlAudio.schedule(S.edl, S.t); };
let cutKey = "";
on("plan", () => { const k = JSON.stringify(S.edl); if (k !== cutKey) { cutKey = k; if (S.edl) edlAudio.ready(S.edl).then(rescheduleCut); } });

// ---------- transport ----------
let clockStart = 0, clockT0 = 0, usingAudio = false, raf = 0;
export function setAudioSource(url) {
  if (S.playing) pause();
  audio.src = url ?? "";
  audio.load();
  usingAudio = !!url;
}
export async function play() {
  if (S.playing) return;
  if (S.t >= S.duration - 0.05) setTime(0);
  if (S.edl) await edlAudio.ready(S.edl);
  S.playing = true;
  clockStart = performance.now(); clockT0 = S.t; duckAt = performance.now();
  applyMix();
  playSfx();
  if (S.edl) edlAudio.schedule(S.edl, S.t);
  else if (usingAudio) {
    audio.currentTime = S.t;
    try { await audio.play(); } catch { usingAudio = false; }
  }
  emit("play");
  const loop = () => {
    if (!S.playing) return;
    const t = usingAudio && !audio.paused && audio.playbackRate === 1 ? audio.currentTime : clockT0 + (performance.now() - clockStart) / 1000;
    syncMusic(t);
    if (t >= S.duration) { pause(); setTime(S.duration); return; }
    S.t = t;
    emit("time", "play");
    if (perf.opts.prefetch) win.prefetch?.(t + 0.1);
    requestRender(t);
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
}
export function pause() {
  if (!S.playing) return;
  S.playing = false;
  cancelAnimationFrame(raf);
  audio.pause();
  musicEl.pause();
  sfx.stopAll();
  edlAudio.stopAll();
  emit("play");
}
export const toggle = () => (S.playing ? pause() : play());
export function seek(t) {
  setTime(t, "seek");
  musicEl.pause();
  sfx.stopAll();
  if (usingAudio && Number.isFinite(audio.duration)) audio.currentTime = Math.min(S.t, audio.duration);
  clockStart = performance.now(); clockT0 = S.t;
  if (S.playing) { playSfx(); if (S.edl) edlAudio.schedule(S.edl, S.t); }
  if (perf.opts.prefetch) win?.prefetch?.(S.t);
  requestRender(S.t);
}
on("motion", () => scheduleApply());
let applyQueued = false;
function scheduleApply() {
  if (applyQueued) return;
  applyQueued = true;
  requestAnimationFrame(() => { applyQueued = false; applyAll(); });
}
export const refreshLayers = () => { applyMix(); applyAll(); };

/** Headless test helper: samples the visible canvas just before each paint while playing; returns mean luma per sample. */
export function startLumaProbe() {
  const probe = { luma: [], stop: false };
  const c = document.createElement("canvas");
  c.width = 18; c.height = 32;
  const g = c.getContext("2d", { willReadFrequently: true });
  const src = frame.contentDocument.getElementById("scene");
  const tick = () => {
    if (probe.stop) return;
    g.drawImage(src, 0, 0, 18, 32);
    const d = g.getImageData(0, 0, 18, 32).data;
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    probe.luma.push(sum / (d.length / 4));
    frame.contentWindow.requestAnimationFrame(tick);
  };
  frame.contentWindow.requestAnimationFrame(tick);
  return probe;
}
