// Estudio media: uploads (video / image / audio), the unified media list and the library of sounds. Registered by server.mjs
// (registerMedia(ctx), after registerExtras/registerAssets).
//
//   POST /api/asset/media?as=<music|voice|sfx>   raw bytes, header X-Filename (url-encoded original name). The CONTENT decides:
//        video mp4/mov/m4v/webm (<= 400 MB, <= 10 min), image png/jpg/jpeg/webp (<= 25 MB), audio wav/mp3/m4a/aac (<= 120 MB).
//        The body is streamed to <comp>/.studio/tmp (sha256 while streaming, size cap enforced) and never buffered in memory.
//        ESTUDIO_MEDIA_MAX_MB lowers every cap (tests).
//   GET  /api/media                              {items, lib, uploadedBin}
//
// Storage is content-addressed and never overwritten: RUN/assets/media/<video|image|audio>-<sha8>.<ext>. Audio is transcoded to
// WAV 48 kHz stereo 16-bit (audio-<sha8>.wav) so mix.py (soundfile), ffmpeg and Web Audio all read it. A video keeps its container and
// is extracted at upload time into RUN/footage/video-<sha8>/ (frames + audio.wav + faces; scripts/media_prepare.py reuses overlay.py's own
// extract() so a later `--reuse-footage` build finds a matching stamp). An image also gets a derived 8 s silent Ken-Burns clip
// (assets/media/imgclip-<sha8>.mp4, clip name "imgclip-<sha8>") so it can sit on the Video lane as a still segment (stretch it with `speed`).
// Registry: <comp>/.studio/media.json entries (see entryOf) + the upload's idempotency (same bytes -> same id, existing entry returned).
import { execFile } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { copyFileSync, createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync } from "node:fs";
import { once } from "node:events";
import { basename, extname, join, relative, resolve } from "node:path";
import { slugOf } from "./extras.mjs";
import { findPython as findPy } from "./pyenv.mjs";

const MB = 1024 * 1024;
const KINDS = { ".mp4": "video", ".mov": "video", ".m4v": "video", ".webm": "video", ".png": "image", ".jpg": "image", ".jpeg": "image", ".webp": "image", ".wav": "audio", ".mp3": "audio", ".m4a": "audio", ".aac": "audio" };
const CAPS_MB = { video: 400, image: 25, audio: 120 };
const IMG_FORMAT = { ".png": "PNG", ".jpg": "JPEG", ".jpeg": "JPEG", ".webp": "WEBP" };
const CONTAINER = { ".mp4": "mp4", ".mov": "mp4", ".m4v": "mp4", ".webm": "webm" }; // substring of ffprobe's format_name
const SLOTS = ["music", "voice", "sfx"];
const KIT_LABELS = { pop: "Pop", whoosh: "Whoosh", notify: "Notificación", click: "Clic" };
const TYPES_ES = "Sube un video (MP4, MOV, M4V o WEBM), una imagen (PNG, JPG o WEBP) o un audio (WAV, MP3, M4A o AAC).";

const capBytes = (kind) => {
  const env = Number(process.env.ESTUDIO_MEDIA_MAX_MB);
  return (Number.isFinite(env) && env > 0 ? Math.min(CAPS_MB[kind], env) : CAPS_MB[kind]) * MB;
};
const capLabel = (kind) => `${Math.round(capBytes(kind) / MB * 10) / 10} MB`;

/** Duration of a PCM WAV from its header (no ffprobe), or null. */
function wavDuration(file) {
  try {
    const b = readFileSync(file);
    let p = 12, byteRate = 0;
    while (p + 8 <= b.length) {
      const id = b.toString("ascii", p, p + 4), size = b.readUInt32LE(p + 4);
      if (id === "fmt ") byteRate = b.readUInt32LE(p + 16);
      if (id === "data") return byteRate ? Math.round((Math.min(size, b.length - p - 8) / byteRate) * 1000) / 1000 : null;
      p += 8 + size + (size % 2);
    }
  } catch { /* unreadable */ }
  return null;
}

export function registerMedia(ctx) {
  const { SKILL, compDir, runDir, studioDir, json, writeAtomic, insideDir, route, broadcast } = ctx;
  const mediaFile = join(studioDir, "media.json");
  const mediaDir = join(runDir, "assets", "media");
  const prep = join(SKILL, "scripts", "media_prepare.py");
  const readJsonFile = (f, dflt) => {
    try {
      return existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : dflt;
    } catch {
      return dflt;
    }
  };
  const abs = (p) => resolve(runDir, p);
  const relOf = (p) => relative(runDir, abs(p)).split("\\").join("/");
  const urlOf = (rel) => "/" + rel.split("/").map(encodeURIComponent).join("/");
  const registry = () => readJsonFile(mediaFile, { entries: [] }).entries ?? [];

  // ---------- python helper ----------
  async function runPy(args, timeout = 120000, needPillow = false) {
    const found = await findPy(["PIL"]);
    if (needPillow && !found) return { ok: false, fatal: true, error: "No hay un Python con Pillow para revisar imágenes (pip install pillow, o define ESTUDIO_PY)." };
    const py = found ?? (process.platform === "win32" ? "python" : "python3");
    return new Promise((res) => {
      execFile(py, ["-I", "-X", "utf8", prep, ...args], { timeout, maxBuffer: 16 * MB }, (err, stdout, stderr) => {
        try {
          res(JSON.parse(stdout));
        } catch {
          res({ ok: false, fatal: true, error: `No se pudo preparar el archivo: ${(stderr || err?.message || "sin respuesta").toString().trim().split("\n").pop()}` });
        }
      });
    });
  }

  // ---------- registry ----------
  const fileOk = (rel) => rel && existsSync(abs(rel)) && insideDir(abs(rel), runDir);
  const uploadName = (e) => e.name ?? (e.note ?? "").replace(/^subido: /, "") ?? e.id;
  /** media.json entry -> the item the client lists. */
  function itemOf(e) {
    const rel = relOf(e.path);
    const kind = e.id.split(":")[0];
    const it = {
      id: e.id, kind, role: kind === "audio" ? e.slot : "upload", name: uploadName(e), dur: e.duration ?? 0, url: urlOf(rel),
      source: "upload", uploaded: true, createdAt: e.createdAt
    };
    if (e.width) { it.w = e.width; it.h = e.height; }
    if (e.thumb) it.thumb = urlOf(e.thumb);
    if (e.clip) { it.clip = e.clip; it.n = e.n; it.faces = e.faces; }
    if (kind === "audio") it.src = `path:${rel}`;
    return it;
  }
  const clipInfo = (e) => ({ name: e.clip, dur: e.duration, n: e.n, faces: e.faces });

  // one upload of a given content at a time (the second waits and gets the same answer)
  const inflight = new Map();

  async function ingest({ tmp, ext, kind, sha8, origName, as, size }) {
    const id = `${kind}:${sha8}`;
    const existing = registry().find((e) => e.id === id);
    if (existing && fileOk(existing.path)) return { code: 200, body: { ok: true, existing: true, id, kind, item: itemOf(existing), ...(existing.clip ? { clip: clipInfo(existing) } : {}) } };
    if (existsSync(mediaDir) ? !insideDir(mediaDir, runDir) : !insideDir(join(runDir, "assets"), runDir)) return { code: 400, body: { error: "La carpeta assets/ del RUN apunta fuera del RUN; no se puede guardar el archivo." } };
    mkdirSync(mediaDir, { recursive: true });
    const stored = [];
    const cleanup = () => { for (const f of stored) rmSync(f, { recursive: true, force: true }); };
    const place = (from, to) => {
      try {
        renameSync(from, to);
      } catch {
        copyFileSync(from, to);
        rmSync(from, { force: true });
      }
      stored.push(to);
    };
    const fail = (code, error, extra = {}) => { cleanup(); return { code, body: { error, ...extra } }; };
    const entry = { id, slot: "media", path: "", source: "upload", quality: null, createdAt: new Date().toISOString(), note: `subido: ${origName}`, name: origName };

    if (kind === "video") {
      const p = await runPy(["probe-video", tmp]);
      if (!p.ok) return fail(p.fatal ? 500 : 422, p.error);
      if (!(CONTAINER[ext] && String(p.container).split(",").includes(CONTAINER[ext]))) return fail(422, `Este archivo no es un ${ext.slice(1).toUpperCase()} real. Prueba con un MP4 o MOV.`);
      const file = join(mediaDir, `video-${sha8}${ext}`);
      place(tmp, file);
      const c = await runPy(["clip", "--run", runDir, "--file", file], 600000);
      if (!c.ok) { rmSync(join(runDir, "footage", `video-${sha8}`), { recursive: true, force: true }); return fail(c.fatal ? 500 : 422, c.error); }
      Object.assign(entry, { path: relOf(file), duration: c.dur, width: p.width, height: p.height, fps: p.fps, hasAudio: p.hasAudio, clip: c.name, n: c.n, faces: c.faces, thumb: `footage/${c.name}/0001.jpg` });
    } else if (kind === "image") {
      const p = await runPy(["image", tmp], 60000, true);
      if (!p.ok) return fail(p.fatal ? 500 : 422, p.error);
      if (IMG_FORMAT[ext] !== p.format) return fail(422, `La imagen no es realmente ${ext.slice(1).toUpperCase()}. Cambia la extensión o súbela de nuevo.`);
      const file = join(mediaDir, `image-${sha8}${ext === ".jpeg" ? ".jpg" : ext}`);
      place(tmp, file);
      const clipFile = join(mediaDir, `imgclip-${sha8}.mp4`);
      stored.push(clipFile);
      const ic = await runPy(["image-clip", file, clipFile], 180000, true);
      if (!ic.ok) return fail(500, ic.error);
      const c = await runPy(["clip", "--run", runDir, "--file", clipFile], 300000);
      if (!c.ok) { rmSync(join(runDir, "footage", `imgclip-${sha8}`), { recursive: true, force: true }); return fail(c.fatal ? 500 : 422, c.error); }
      Object.assign(entry, { path: relOf(file), clipPath: relOf(clipFile), duration: c.dur, width: p.width, height: p.height, clip: c.name, n: c.n, faces: c.faces, thumb: relOf(file) });
    } else {
      const p = await runPy(["probe-audio", tmp]);
      if (!p.ok) return fail(p.fatal ? 500 : 422, p.error);
      const wavTmp = join(studioDir, "tmp", `audio-${sha8}-${randomBytes(4).toString("hex")}.wav`);
      stored.push(wavTmp);
      const w = await runPy(["to-wav", tmp, wavTmp], 300000);
      if (!w.ok) return fail(w.fatal ? 500 : 422, w.error);
      const file = join(mediaDir, `audio-${sha8}.wav`);
      stored.pop();
      place(wavTmp, file);
      Object.assign(entry, { slot: as ?? (w.duration < 8 ? "sfx" : "music"), path: relOf(file), duration: w.duration });
    }
    // register (read-modify-write in one synchronous block: no interleaving with other writers of this process)
    const media = readJsonFile(mediaFile, { entries: [] });
    media.entries ??= [];
    if (!media.entries.some((e) => e.id === id)) {
      media.entries.push(entry);
      writeAtomic(mediaFile, JSON.stringify(media, null, 1));
    }
    const reg = media.entries.find((e) => e.id === id);
    broadcast("media", { id, kind });
    return { code: 200, body: { ok: true, existing: false, id, kind, item: itemOf(reg), ...(reg.clip ? { clip: clipInfo(reg) } : {}) } };
  }

  route("POST", "/api/asset/media", true, async (req, res) => {
    const drain = () => req.resume();
    const reply = (code, error, extra) => { drain(); return json(res, code, { error }, extra); };
    const q = new URL(req.url, "http://x").searchParams;
    const as = q.get("as");
    if (as && !SLOTS.includes(as)) return reply(400, "El tipo de audio debe ser música, voz o efecto.");
    let origName = "archivo";
    try {
      origName = decodeURIComponent(String(req.headers["x-filename"] ?? ""));
    } catch { /* keep the default */ }
    origName = basename(origName.replace(/\\/g, "/")).replace(/[\u0000-\u001f]/g, "").slice(0, 120) || "archivo"; // display only: never used as a path
    const ext = extname(origName).toLowerCase();
    const kind = KINDS[ext];
    if (!kind) return reply(415, `Este tipo de archivo no se puede usar. ${TYPES_ES}`);
    const cap = capBytes(kind);
    const tooBig = () => `El archivo es demasiado grande (máximo ${capLabel(kind)} para ${kind === "video" ? "videos" : kind === "image" ? "imágenes" : "audios"}).`;
    if (Number(req.headers["content-length"]) > cap) return reply(413, tooBig());

    const tmpDir = join(studioDir, "tmp");
    mkdirSync(tmpDir, { recursive: true });
    const tmp = join(tmpDir, `upload-${randomBytes(6).toString("hex")}${ext}`);
    const hash = createHash("sha256");
    const out = createWriteStream(tmp);
    let size = 0, over = false, writeErr = null;
    out.on("error", (e) => { writeErr = e; });
    try {
      for await (const chunk of req) { // keep draining after the cap so the client can read the 413
        size += chunk.length;
        if (over || writeErr) continue;
        if (size > cap) { over = true; continue; }
        hash.update(chunk);
        if (!out.write(chunk)) await once(out, "drain").catch(() => {});
      }
      await new Promise((r) => out.end(r));
    } catch {
      out.destroy();
      rmSync(tmp, { force: true });
      return; // client went away
    }
    if (over) { rmSync(tmp, { force: true }); return json(res, 413, { error: tooBig() }); }
    if (writeErr) { rmSync(tmp, { force: true }); return json(res, 500, { error: "No se pudo guardar el archivo (¿disco lleno?)." }); }
    if (!size) { rmSync(tmp, { force: true }); return json(res, 400, { error: "El archivo está vacío." }); }

    const sha8 = hash.digest("hex").slice(0, 8);
    const key = `${kind}:${sha8}`;
    let job = inflight.get(key);
    if (!job) {
      job = ingest({ tmp, ext: ext === ".jpeg" ? ".jpg" : ext, kind, sha8, origName, as, size }).finally(() => inflight.delete(key));
      inflight.set(key, job);
    }
    let result;
    try {
      result = await job;
    } catch (err) {
      result = { code: 500, body: { error: `No se pudo procesar el archivo: ${err.message}` } };
    } finally {
      rmSync(tmp, { force: true }); // already moved on success; a duplicate upload leaves its own copy here
    }
    json(res, result.code, result.body);
  });

  // ---------- listing ----------
  const probeCache = new Map(); // abs -> {mtime, dur}
  async function probeDur(file) {
    try {
      const m = statSync(file).mtimeMs;
      const hit = probeCache.get(file);
      if (hit && hit.mtime === m) return hit.dur;
      const dur = file.endsWith(".wav") ? wavDuration(file) : await new Promise((res) => execFile("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], { timeout: 15000 }, (e, so) => res(e ? null : Math.round(Number(so) * 1000) / 1000 || null)));
      probeCache.set(file, { mtime: m, dur });
      return dur;
    } catch {
      return null;
    }
  }
  const framesCache = new Map(); // dir -> {mtime, n}
  function frameCount(dir) {
    try {
      const m = statSync(dir).mtimeMs;
      const hit = framesCache.get(dir);
      if (hit && hit.mtime === m) return hit.n;
      const n = readdirSync(dir).filter((f) => f.endsWith(".jpg")).length;
      framesCache.set(dir, { mtime: m, n });
      return n;
    } catch {
      return 0;
    }
  }
  function buildClipPaths() {
    const b = readJsonFile(join(studioDir, "build.json"), null);
    const i = b?.argv?.indexOf("--clips") ?? -1;
    return i >= 0 ? b.argv[i + 1].split(",").filter(Boolean) : [];
  }
  /** Names overlay.py gives the build's clips (slug of the stem, "-<i>" on a repeat). */
  function footageClips() {
    const used = new Set();
    return buildClipPaths().map((c, i) => {
      let name = slugOf(c);
      if (used.has(name)) name = `${name}-${i + 1}`;
      used.add(name);
      return { name, path: abs(c) };
    });
  }

  async function listMedia() {
    const items = [];
    for (const c of footageClips()) {
      const fdir = join(runDir, "footage", c.name);
      const n = frameCount(fdir);
      const dur = n ? Math.round((n / 30) * 1000) / 1000 : (await probeDur(c.path)) ?? 0;
      const inRun = existsSync(c.path) && insideDir(c.path, runDir);
      items.push({
        id: `footage:${c.name}`, kind: "video", role: "footage", name: c.name, clip: c.name, dur, n, w: 1080, h: 1920,
        url: inRun ? urlOf(relOf(c.path)) : null, thumb: n ? urlOf(`footage/${c.name}/0001.jpg`) : null,
        source: "local", uploaded: false, createdAt: existsSync(c.path) ? statSync(c.path).mtime.toISOString() : null
      });
    }
    // photos of the products in products.json (read-only here; managed by the Productos panel)
    const prods = readJsonFile(join(runDir, "products.json"), { products: [] }).products;
    for (const p of Array.isArray(prods) ? prods : []) {
      for (const im of p?.images ?? []) {
        if (typeof im?.src !== "string" || !fileOk(im.src)) continue;
        const cut = im.cutout && !im.preferOriginal && fileOk(im.cutout) ? im.cutout : im.src;
        items.push({ id: `product:${p.id}:${im.id}`, kind: "image", role: "product", name: p.name ?? "Producto", dur: 0, url: urlOf(relOf(im.src)), thumb: urlOf(relOf(cut)), source: "products", uploaded: false, createdAt: statSync(abs(im.src)).mtime.toISOString() });
      }
    }
    const entries = ctx.mediaEntries ? ctx.mediaEntries() : [];
    for (const e of entries) {
      if (e.invalid || !e.path || !existsSync(abs(e.path))) continue;
      if (e.slot === "media") {
        if (e.id.startsWith("video:") || e.id.startsWith("image:")) items.push(itemOf(e));
      } else if (e.slot.startsWith("footage:") && !e.id.endsWith(":original")) {
        const rel = relOf(e.path);
        items.push({
          id: e.id, kind: "video", role: "generated", name: e.note || e.id, clip: e.slot.slice(8), dur: e.duration ?? (await probeDur(abs(e.path))) ?? 0,
          url: insideDir(abs(e.path), runDir) ? urlOf(rel) : null, source: e.source ?? "local", uploaded: false, createdAt: e.createdAt
        });
      } else if (SLOTS.includes(e.slot) && insideDir(abs(e.path), runDir)) {
        if (e.source === "upload" && e.id.startsWith("audio:")) { items.push(itemOf(e)); continue; }
        const rel = relOf(e.path);
        items.push({
          id: e.id, kind: "audio", role: e.slot, name: e.note && e.source !== "local" ? e.note : basename(e.path), dur: e.duration ?? (await probeDur(abs(e.path))) ?? 0,
          url: urlOf(rel), source: e.source ?? "local", uploaded: false, createdAt: e.createdAt, src: `path:${rel}`
        });
      }
    }
    const uploadedBin = items.filter((i) => i.uploaded && i.clip).map((i) => ({ name: i.clip, dur: i.dur, n: i.n, faces: i.faces }));
    return { items, lib: library(), uploadedBin };
  }
  function library() {
    const base = join(SKILL, "assets", "sfx");
    const out = [];
    const idx = readJsonFile(join(base, "lib", "index.json"), { sounds: [] });
    for (const s of idx.sounds ?? []) out.push({ id: s.id, src: `lib:${s.id}`, label: s.label, group: s.group, url: `/_skill/assets/sfx/lib/${encodeURIComponent(s.file)}`, gain_db: s.gain_db, ...(s.anchor ? { anchor: s.anchor } : {}), dur: s.dur });
    const map = readJsonFile(join(base, "ui-map.json"), { kinds: {} });
    for (const [name, k] of Object.entries(map.kinds ?? {})) {
      if (!KIT_LABELS[name]) continue;
      out.push({ id: name, src: `kit:${name}`, label: KIT_LABELS[name], group: "Básicos", url: `/_skill/assets/sfx/${k.file.split("/").map(encodeURIComponent).join("/")}`, gain_db: k.gain_db, anchor: k.anchor, dur: wavDuration(join(base, k.file)) ?? 0 });
    }
    return out;
  }
  route("GET", "/api/media", false, async (req, res) => json(res, 200, await listMedia()));

  // ---------- render: uploaded clips used by edl.json join --clips ----------
  const prevCompose = ctx.composeArgv;
  ctx.composeArgv = (argv) => {
    const out = prevCompose ? prevCompose(argv) : [...argv];
    const edl = readJsonFile(join(compDir, "edl.json"), null);
    const ci = out.indexOf("--clips");
    if (!edl?.segments?.length || ci < 0) return out;
    const used = new Set(edl.segments.map((s) => s.clip));
    const have = new Set(out[ci + 1].split(",").filter(Boolean).map((c) => slugOf(c)));
    const add = [];
    for (const e of registry()) {
      if (e.source !== "upload" || !e.clip || !used.has(e.clip) || have.has(e.clip)) continue;
      const rel = e.clipPath ?? e.path;
      if (fileOk(rel) && !add.includes(abs(rel))) add.push(abs(rel));
    }
    if (add.length) out[ci + 1] = [out[ci + 1], ...add].join(",");
    return out;
  };
}
