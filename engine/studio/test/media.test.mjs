// node --test engine/studio/test/media.test.mjs
// Starts the real server (engine/studio/server.mjs) on a tiny temp comp and uploads generated files (ffmpeg + Pillow).
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { request as httpRequest } from "node:http";
import { registerMedia } from "../media.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const SERVER = join(here, "..", "server.mjs");
const SKILL = join(here, "..", "..", "..");
const PORT = 4400 + (process.pid % 50);

const root = realpathSync(mkdtempSync(join(tmpdir(), "estudio-media-")));
const RUN = join(root, "run");
const COMP = join(RUN, "comp");
const FIX = join(root, "fixtures");
let child, base, token;

const sh = (cmd, args) => execFileSync(cmd, args, { stdio: "pipe" });
const py = [process.env.ESTUDIO_PY, join(homedir(), ".local/share/reels-dibujados/venv/bin/python"), "python3"].find((p) => p && (p === "python3" || existsSync(p)));

before(async () => {
  mkdirSync(join(COMP, ".studio"), { recursive: true });
  mkdirSync(FIX, { recursive: true });
  writeFileSync(join(COMP, "index.html"), "<html><!-- window.setState window.setEdl window.setLogoSrc window.addClips --><script>const CONFIG = {};\n</script></html>");
  writeFileSync(join(RUN, "brand.json"), "{}");
  // fixtures
  sh("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc=size=320x240:rate=30:duration=1.5", "-f", "lavfi", "-i", "sine=frequency=440:duration=1.5", "-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", join(FIX, "ok.mp4")]);
  sh("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=880:duration=1", join(FIX, "ok.wav")]);
  sh("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=330:duration=9", "-c:a", "libmp3lame", join(FIX, "long.mp3")]);
  sh(py, ["-c", `from PIL import Image; Image.new("RGB",(200,300),(200,60,60)).save(r"${join(FIX, "ok.png")}")`]);
  writeFileSync(join(FIX, "fake.mp4"), "this is not a video, just text\n");
  writeFileSync(join(FIX, "trunc.png"), readFileSync(join(FIX, "ok.png")).subarray(0, 60));
  writeFileSync(join(FIX, "empty.wav"), "");
  cpSync(join(FIX, "ok.png"), join(FIX, "real.jpg")); // a PNG called .jpg
  child = spawn("node", [SERVER, COMP, "--port", String(PORT), "--no-open"], { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, ESTUDIO_MEDIA_MAX_MB: "1", ESTUDIO_PY: py } });
  base = `http://127.0.0.1:${PORT}`;
  for (let i = 0; i < 100; i += 1) {
    try {
      const html = await (await fetch(`${base}/`)).text();
      token = /name="studio-token" content="([0-9a-f]+)"/.exec(html)?.[1];
      if (token) break;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.ok(token, "server did not start");
});
after(() => {
  child?.kill();
  rmSync(root, { recursive: true, force: true });
});

const upload = (file, { name = file, as = "", headers = {}, body } = {}) =>
  fetch(`${base}/api/asset/media${as ? `?as=${as}` : ""}`, { method: "POST", headers: { "X-Studio-Token": token, "X-Filename": encodeURIComponent(name), ...headers }, body: body ?? readFileSync(join(FIX, file)) });
const media = async () => (await fetch(`${base}/api/media`)).json();

test("security: wrong token, wrong origin, wrong host are refused", async () => {
  let r = await upload("ok.wav", { headers: { "X-Studio-Token": "nope" } });
  assert.equal(r.status, 403);
  r = await upload("ok.wav", { headers: { Origin: "http://evil.example" } });
  assert.equal(r.status, 403);
  const status = await new Promise((res, rej) => {
    const q = httpRequest({ host: "127.0.0.1", port: PORT, path: "/api/asset/media", method: "POST", headers: { Host: "evil.example", "X-Studio-Token": token, "X-Filename": "a.wav" } }, (x) => { x.resume(); res(x.statusCode); });
    q.on("error", rej);
    q.end("x");
  });
  assert.equal(status, 403);
});

test("rejects unknown types, fake videos, damaged images, empty and wrong-kind files with Spanish messages", async () => {
  let r = await upload("fake.mp4");
  assert.equal(r.status, 422);
  assert.match((await r.json()).error, /no es un video que se pueda leer/);
  r = await upload("trunc.png");
  assert.equal(r.status, 422);
  assert.match((await r.json()).error, /dañada o no se puede abrir/);
  r = await upload("ok.wav", { name: "clip.mp4" }); // audio called .mp4
  assert.equal(r.status, 422);
  r = await upload("ok.mp4", { name: "song.mp3" }); // video called .mp3
  assert.equal(r.status, 422);
  assert.match((await r.json()).error, /trae video/);
  r = await upload("ok.png", { name: "x.mp4" });
  assert.equal(r.status, 422);
  r = await upload("real.jpg");
  assert.equal(r.status, 422);
  assert.match((await r.json()).error, /no es realmente JPG/);
  r = await upload("ok.wav", { name: "notes.txt" });
  assert.equal(r.status, 415);
  r = await upload("empty.wav");
  assert.equal(r.status, 400);
  r = await upload("ok.wav", { as: "bogus" });
  assert.equal(r.status, 400);
  assert.deepEqual(readdirSync(join(RUN, "assets", "media")).filter((f) => !f.startsWith(".")), []); // nothing was stored
});

test("size cap: 413 while streaming (cap lowered to 1 MB), nothing left in .studio/tmp", async () => {
  const big = Buffer.alloc(3 * 1024 * 1024, 7);
  let r = await upload("x", { name: "big.wav", body: big });
  assert.equal(r.status, 413);
  assert.match((await r.json()).error, /demasiado grande/);
  r = await upload("x", { name: "big.png", body: big, headers: { "Content-Length": String(big.length) } });
  assert.equal(r.status, 413);
  assert.equal(readdirSync(join(COMP, ".studio", "tmp")).length, 0);
});

let videoId, imageId, audioId;
test("video upload: stored content-addressed, extracted as an EDL clip, registered", async () => {
  const r = await upload("ok.mp4", { name: "../../etc/Mi toma.mp4" }); // traversal in the filename is only a label
  assert.equal(r.status, 200, JSON.stringify(await r.clone().json()));
  const b = await r.json();
  assert.equal(b.kind, "video");
  videoId = b.id;
  assert.match(b.id, /^video:[0-9a-f]{8}$/);
  const sha8 = b.id.split(":")[1];
  assert.equal(b.clip.name, `video-${sha8}`);
  assert.ok(b.clip.n >= 44 && b.clip.n <= 46, `n=${b.clip.n}`);
  assert.ok(Math.abs(b.clip.dur - 1.5) < 0.1);
  assert.ok(b.clip.faces && "samples" in b.clip.faces);
  assert.equal(b.item.name, "Mi toma.mp4");
  assert.equal(b.item.uploaded, true);
  assert.ok(existsSync(join(RUN, "assets", "media", `video-${sha8}.mp4`)));
  assert.ok(existsSync(join(RUN, "footage", b.clip.name, "0001.jpg")));
  assert.ok(existsSync(join(RUN, "footage", b.clip.name, "audio.wav")));
  assert.equal(readFileSync(join(RUN, "footage", b.clip.name, "words.json"), "utf8"), "[]");
  assert.ok(!existsSync(join(root, "etc")));
  const reg = JSON.parse(readFileSync(join(COMP, ".studio", "media.json"), "utf8")).entries.find((e) => e.id === b.id);
  assert.equal(reg.slot, "media");
  assert.equal(reg.source, "upload");
  assert.equal(reg.path, `assets/media/video-${sha8}.mp4`);
  assert.equal(reg.width, 320);
  assert.equal(reg.hasAudio, true);
  assert.equal(reg.note, "subido: Mi toma.mp4");
});

test("image upload: stored, plus a derived 8 s 1080x1920 clip", async () => {
  const r = await upload("ok.png");
  assert.equal(r.status, 200, JSON.stringify(await r.clone().json()));
  const b = await r.json();
  imageId = b.id;
  const sha8 = b.id.split(":")[1];
  assert.equal(b.kind, "image");
  assert.equal(b.clip.name, `imgclip-${sha8}`);
  assert.equal(b.clip.n, 240);
  assert.ok(Math.abs(b.clip.dur - 8) < 0.05);
  assert.ok(existsSync(join(RUN, "assets", "media", `image-${sha8}.png`)));
  assert.ok(existsSync(join(RUN, "assets", "media", `imgclip-${sha8}.mp4`)));
  assert.equal(b.item.thumb, `/assets/media/image-${sha8}.png`);
});

test("audio upload: transcoded to WAV 48k stereo 16-bit; slot from ?as= or by length", async () => {
  let r = await upload("ok.wav");
  let b = await r.json();
  assert.equal(r.status, 200, JSON.stringify(b));
  audioId = b.id;
  assert.equal(b.item.role, "sfx"); // 1 s < 8 s
  assert.match(b.item.src, /^path:assets\/media\/audio-[0-9a-f]{8}\.wav$/);
  const file = join(RUN, b.item.src.slice(5));
  const info = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=sample_rate,channels,codec_name", "-of", "json", file]).toString()).streams[0];
  assert.deepEqual([info.sample_rate, info.channels, info.codec_name], ["48000", 2, "pcm_s16le"]);
  r = await upload("long.mp3");
  b = await r.json();
  assert.equal(r.status, 200, JSON.stringify(b));
  assert.equal(b.item.role, "music"); // 9 s >= 8 s
  r = await upload("long.mp3", { name: "otra.mp3", as: "voice" });
  b = await r.json();
  assert.equal(b.existing, true); // same bytes -> same id, the first registration wins
  assert.equal(b.item.role, "music");
});

test("idempotent: same bytes, same id, no duplicate entry or file", async () => {
  const before = readdirSync(join(RUN, "assets", "media")).sort();
  const r = await upload("ok.mp4", { name: "otro nombre.mp4" });
  const b = await r.json();
  assert.equal(r.status, 200);
  assert.equal(b.existing, true);
  assert.equal(b.id, videoId);
  assert.deepEqual(readdirSync(join(RUN, "assets", "media")).sort(), before);
  const entries = JSON.parse(readFileSync(join(COMP, ".studio", "media.json"), "utf8")).entries;
  assert.equal(entries.filter((e) => e.id === videoId).length, 1);
  const [r1, r2] = await Promise.all([upload("ok.png"), upload("ok.png")]); // concurrent
  assert.equal((await r1.json()).id, (await r2.json()).id);
});

test("GET /api/media: unified list, uploaded bin and the sound library", async () => {
  const m = await media();
  const byId = Object.fromEntries(m.items.map((i) => [i.id, i]));
  assert.equal(byId[videoId].kind, "video");
  assert.equal(byId[videoId].role, "upload");
  assert.equal(byId[videoId].uploaded, true);
  assert.ok(byId[videoId].url.startsWith("/assets/media/video-"));
  assert.equal(byId[imageId].kind, "image");
  assert.equal(byId[audioId].kind, "audio");
  assert.ok(m.uploadedBin.some((c) => c.name === byId[videoId].clip && c.n > 0));
  assert.ok(m.uploadedBin.some((c) => c.name === byId[imageId].clip));
  assert.ok(!m.uploadedBin.some((c) => c.name.startsWith("audio")));
  assert.ok(m.lib.length >= 28);
  const subida = m.lib.find((s) => s.src === "lib:subida");
  assert.equal(subida.anchor, "end");
  assert.ok(subida.url.startsWith("/_skill/assets/sfx/lib/"));
  assert.ok(m.lib.some((s) => s.src === "kit:pop" && s.gain_db === -17 && s.dur > 0));
  assert.equal((await fetch(`${base}${subida.url}`)).status, 200);
  assert.equal((await fetch(`${base}${byId[videoId].url}`)).status, 200);
  assert.equal((await fetch(`${base}${byId[videoId].thumb}`)).status, 200);
});

test("GET /api/state exposes docs.sfx and PUT /api/doc/sfx validates", async () => {
  let st = await (await fetch(`${base}/api/state`)).json();
  assert.ok("sfx" in st.docs);
  const put = (doc, version) => fetch(`${base}/api/doc/sfx`, { method: "PUT", headers: { "X-Studio-Token": token, "Content-Type": "application/json" }, body: JSON.stringify({ doc, version }) });
  let r = await put({ version: 1, events: { "kw:pop": { gainDb: 99 } } }, st.docs.sfx.version);
  assert.equal(r.status, 422);
  r = await put({ version: 1, events: {}, added: [{ id: "a", t: 1, src: "path:../x.wav" }] }, st.docs.sfx.version);
  assert.equal(r.status, 422);
  r = await put({ version: 1, events: { "kw:pop": { gainDb: -3 } }, added: [{ id: "a", t: 1, src: "lib:ding" }] }, st.docs.sfx.version);
  assert.equal(r.status, 200, JSON.stringify(await r.clone().json()));
  st = await (await fetch(`${base}/api/state`)).json();
  assert.equal(st.docs.sfx.doc.added[0].id, "a");
});

test("composeArgv: unchanged without edl/uploads, appends the uploaded clips an edl uses", () => {
  const studioDir = join(COMP, ".studio");
  const ctx = {
    SKILL, compDir: COMP, runDir: RUN, studioDir, json() {}, writeAtomic() {}, route() {}, broadcast() {},
    insideDir: (p, b) => resolveReal(p).startsWith(resolveReal(b)),
    composeArgv: (a) => [...a],
    mediaEntries: () => [],
  };
  const resolveReal = (p) => { try { return realpathSync(p); } catch { return p; } };
  registerMedia(ctx);
  const clipA = join(root, "a.mp4");
  const argv = ["python3", join(SKILL, "scripts/overlay.py"), "--run", RUN, "--clips", clipA, "--name", "comp"];
  const edlFile = join(COMP, "edl.json");
  const reg = JSON.parse(readFileSync(join(studioDir, "media.json"), "utf8")).entries;
  const vid = reg.find((e) => e.id === videoId);
  const img = reg.find((e) => e.id === imageId);
  assert.deepEqual(ctx.composeArgv(argv), argv); // no edl.json
  writeFileSync(edlFile, JSON.stringify({ version: 1, segments: [{ id: "s1", clip: "a", in: 0, out: 1 }] }));
  assert.deepEqual(ctx.composeArgv(argv), argv); // edl without uploaded clips
  writeFileSync(edlFile, JSON.stringify({ version: 1, segments: [{ id: "s1", clip: "a", in: 0, out: 1 }, { id: "s2", clip: vid.clip, in: 0, out: 1 }, { id: "s3", clip: img.clip, in: 0, out: 2 }] }));
  const out = ctx.composeArgv(argv);
  const clips = out[out.indexOf("--clips") + 1].split(",");
  assert.deepEqual(clips, [clipA, join(RUN, vid.path), join(RUN, img.clipPath)]);
  assert.deepEqual(ctx.composeArgv(out), out); // idempotent when already there
  assert.deepEqual(ctx.composeArgv(["python3", "x.py"]), ["python3", "x.py"]); // no --clips
  rmSync(edlFile);
  assert.ok(statSync(join(RUN, vid.path)).size > 0);
});
