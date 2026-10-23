// Media library state (GET /api/media), uploads (POST /api/asset/media) and the sound catalogue shared by the side panels.
import { S, emit, toast } from "./store.js";
import { get } from "./api.js";
import { getWin } from "./preview.js";
import { X } from "./extras.js";

export const M = { items: [], lib: [], uploadedBin: [], loaded: false, uploads: [] };
const token = () => document.querySelector('meta[name="studio-token"]').content;
const addedToComp = new Set();

/** The bin of the studio = the comp's clips + the uploaded ones (flagged `uploaded`, never part of the identity cut). */
export function syncBin() {
  if (!S.studio) return;
  const bin = [];
  for (const c of S.studio.bin ?? []) if (!bin.some((b) => b.name === c.name)) bin.push(c);
  const up = new Set(M.uploadedBin.map((c) => c.name));
  for (const c of bin) if (up.has(c.name)) c.uploaded = true;
  for (const c of M.uploadedBin) if (!bin.some((b) => b.name === c.name)) bin.push({ name: c.name, dur: c.dur, n: c.n, faces: c.faces, uploaded: true });
  S.studio.bin = bin;
}
/** Tell the comp about uploaded clips (window.addClips) so the preview can draw them. Returns true when something was added. */
export async function pushClipsToComp() {
  const win = getWin();
  const fresh = M.uploadedBin.filter((c) => !addedToComp.has(c.name));
  if (!fresh.length) return false;
  for (const c of fresh) addedToComp.add(c.name);
  if (typeof win?.addClips === "function") await win.addClips(fresh.map((c) => ({ name: c.name, start: 0, dur: c.dur, n: c.n, faces: c.faces })));
  return true;
}
export async function loadMedia() {
  const d = await get("/api/media");
  M.items = d.items ?? []; M.lib = d.lib ?? []; M.uploadedBin = d.uploadedBin ?? [];
  M.loaded = true;
  const added = await pushClipsToComp();
  syncBin();
  emit("media");
  return added;
}
export const onMediaEvent = () => loadMedia().catch(() => {});

// ---------- upload ----------
const AUDIO_EXT = /\.(mp3|wav|m4a|aac|ogg|oga|flac|aif|aiff)$/i;
const IMAGE_EXT = /\.(png|jpe?g|webp|gif|heic|avif)$/i;
export function fileKind(f) {
  if (f.type.startsWith("audio/") || AUDIO_EXT.test(f.name)) return "audio";
  if (f.type.startsWith("image/") || IMAGE_EXT.test(f.name)) return "image";
  return "video";
}
/** Upload one File. `as` = "music"|"voice"|"sfx" for audio. Resolves to the server item or null (a Spanish toast explains the failure). */
export function uploadFile(file, as = null) {
  const up = { id: Math.random().toString(36).slice(2), name: file.name, kind: fileKind(file), progress: 0, state: "subiendo" };
  M.uploads.push(up);
  emit("media");
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/asset/media${as ? `?as=${as}` : ""}`);
    xhr.setRequestHeader("X-Studio-Token", token());
    xhr.setRequestHeader("X-Filename", encodeURIComponent(file.name));
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) { up.progress = e.loaded / e.total; if (up.progress >= 1) up.state = "procesando"; emit("media"); } };
    const finish = (ok, data) => {
      M.uploads = M.uploads.filter((u) => u !== up);
      if (ok) {
        for (const w of data?.warnings ?? []) toast(w, 4200);
        loadMedia().then(() => { if (!(data?.warnings?.length)) toast(`Listo: ${file.name}`); resolve(data?.item ?? null); }).catch(() => resolve(data?.item ?? null));
      } else { emit("media"); resolve(null); }
    };
    xhr.onload = () => {
      let data = null;
      try { data = JSON.parse(xhr.responseText); } catch { /* not JSON */ }
      if (xhr.status >= 200 && xhr.status < 300) finish(true, data);
      else { toast(data?.error ?? "No se pudo subir el archivo", 4500); finish(false); }
    };
    xhr.onerror = () => { toast("No se pudo subir el archivo (se cortó la conexión)", 4500); finish(false); };
    xhr.send(file);
  });
}

// ---------- sounds ----------
export const GROUP_LABEL = { ui: "Interfaz", interfaz: "Interfaz", motion: "Movimiento", movimiento: "Movimiento" };
/** Every sound the editor can place: bundled library, the kit, and the user's own (uploaded/generated). */
export function soundList() {
  const out = [];
  for (const l of M.lib) out.push({ src: `lib:${l.id}`, label: l.label ?? l.id, group: GROUP_LABEL[l.group] ?? l.group ?? "Biblioteca", url: l.url, gainDb: l.gain_db ?? -17, anchor: l.anchor ?? "onset", dur: l.dur ?? null, kind: "lib" });
  for (const [name, k] of Object.entries(X.sfxKit?.kinds ?? {})) out.push({ src: `kit:${name}`, label: KIT_LABEL[name] ?? name, group: "Básicos", url: k.url, gainDb: k.gain_db ?? -17, anchor: k.anchor ?? "onset", dur: null, kind: "kit" });
  for (const it of M.items) {
    if (it.kind !== "audio" || it.role !== "sfx") continue;
    out.push({ src: it.src ?? `path:${it.url}`, label: it.name, group: "Mis sonidos", url: it.url, gainDb: -14, anchor: "onset", dur: it.dur ?? null, kind: "path", item: it });
  }
  return out;
}
export const KIT_LABEL = { pop: "Pop", whoosh: "Whoosh", notify: "Aviso" };
export const soundBySrc = (src) => soundList().find((s) => s.src === src) ?? null;
export const soundLabel = (src) => soundBySrc(src)?.label ?? (src?.startsWith("kit:") ? KIT_LABEL[src.slice(4)] : src?.replace(/^\w+:/, "").split("/").pop()) ?? "Sonido";
/** The sound to use when a marker has no explicit src: the kit sound of its type. */
export const defaultSound = () => soundBySrc("lib:clic") ?? soundBySrc("kit:pop") ?? soundList()[0] ?? null;
