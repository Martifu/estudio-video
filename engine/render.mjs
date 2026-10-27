// Renders a deterministic time-driven composition: captures it frame by frame in Chrome and muxes audio with ffmpeg.
//
//   node engine/render.mjs <run>/<comp>/index.html <mode> [times|t] [--audio file.wav]
//
// Static server: /engine/* -> this engine directory; everything else -> the RUN directory (the comp's parent dir),
// so a comp can load ../brand.json, ../voice/..., ../footage/... (served as /brand.json, /footage/...).
//
// Modes:
//   v                   full render, 9:16 (1080x1920) -> <out>/<slug>-9x16.mp4
//   preview-v | preview single JPG frames at the given comma-separated times -> <out>/preview/tNNNNN.jpg
//   cover [t]           one PNG frame at time t (default 0) at 1080x1920 -> <out>/<slug>-cover.png
//   events              dumps window.TIMELINE.events + DURATION -> <out>/events.json (for audio SFX sync)
//   qa [times]          frames with the layout QA overlay (face box, element rects) -> <out>/qa/NN.jpg; default times = the
//                       midpoint of each motion element (from layout-report.json)
//   mux                 no re-render: copies the video of <out>/<slug>-9x16.mp4 and muxes the audio
//                       (--audio, else <out>/mix.wav) -> <out>/<slug>-final.mp4
//
// <out> is "<comp-dir>/out". Audio: --audio <file>, else "<out>/mix.wav" if present. `v --no-audio` encodes the video alone (scripts/overlay.py
// always does: the final mux supplies the audio, and a leftover mix.wav must never influence the encoded video length).
// Env: CHROME (Chrome binary; default: the first Chrome found for this OS), FFMPEG, KEEP_FRAMES=1 (keep the JPEG frames),
// ESTUDIO_VIDEO_ENCODER=libx264 (default) | h264_nvenc (NVIDIA GPU encoder, Windows/Linux with an NVIDIA card).
// Requires: puppeteer-core (engine/node_modules), Google Chrome, ffmpeg.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { basename, dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { createStaticHandler } from "./static-server.mjs";
import { resolveChrome } from "./chrome-path.mjs";
import { finalEncodeArgv, resolveEncoder } from "./encoder-args.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const FPS = 30;
const CHROME = resolveChrome();
const MODES = ["v", "preview", "preview-v", "cover", "events", "qa", "mux"];

// ---------- arguments ----------
const argv = process.argv.slice(2);
let audioArg = null;
let noAudio = false;
const positional = [];
for (let i = 0; i < argv.length; i += 1) {
  if (argv[i] === "--audio") audioArg = resolve(argv[(i += 1)]);
  else if (argv[i] === "--no-audio") noAudio = true;
  else positional.push(argv[i]);
}
const compArg = positional.shift();
const mode = positional[0] ?? "preview";
const extra = positional[1];
if (!compArg || !MODES.includes(mode)) {
  console.error(`Usage: node render.mjs <run>/<comp>/index.html <${MODES.join("|")}> [times|t] [--audio f.wav | --no-audio]`);
  process.exit(1);
}

const compFile = resolve(compArg);
if (!existsSync(compFile)) {
  console.error(`Composition not found: ${compFile}`);
  process.exit(1);
}
const compDir = dirname(compFile);
const runDir = dirname(compDir);
const out = join(compDir, "out");
const slug = basename(compDir);
const audio = audioArg ?? join(out, "mix.wav");
const compUrlPath = "/" + compDir.slice(runDir.length + 1).split(sep).join("/") + "/" + basename(compFile);

// ---------- mux: video stream copy + audio, no frames rendered ----------
if (mode === "mux") {
  const src = join(out, `${slug}-9x16.mp4`);
  const final = join(out, `${slug}-final.mp4`);
  if (!existsSync(src) || !existsSync(audio)) {
    console.error(`mux needs both ${src} and ${audio}`);
    process.exit(1);
  }
  execFileSync(
    process.env.FFMPEG ?? "ffmpeg",
    // AAC encoding can overshoot the mastered true peak by ~2 dB on hard cuts; a -2 dBFS limiter keeps the file under -1 dBTP.
    ["-y", "-i", src, "-i", audio, "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-af", "alimiter=limit=0.79:attack=1:release=50:level=false", "-c:a", "aac", "-b:a", "256k", "-shortest", "-movflags", "+faststart", final],
    { stdio: "inherit" }
  );
  console.log(`final → ${final}`);
  process.exit(0);
}

// ---------- 1. minimal static server: /engine/* -> engine dir, everything else -> run dir (same origin for canvas reads) ----------
const server = createServer(createStaticHandler({ engineDir: here, runDir }));
await new Promise((resolveListen) => server.listen(0, resolveListen));
const port = server.address().port;

// ---------- 2. browser ----------
const portrait = true; // engine is 9:16 only
const size = { width: 1080, height: 1920 };
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--hide-scrollbars"] });
const page = await browser.newPage();
await page.setViewport({ ...size, deviceScaleFactor: 1 });
page.on("pageerror", (error) => console.error("page error:", error.message));
page.on("response", (r) => r.status() >= 400 && !r.url().endsWith("/favicon.ico") && console.error(`HTTP ${r.status()} ${r.url()}`));
await page.goto(`http://localhost:${port}${compUrlPath}${portrait ? "?fmt=v" : ""}`, { waitUntil: "networkidle0" });
await page.waitForFunction("window.READY === true", { timeout: 60000 });
const { DURATION, events = [] } = await page.evaluate(() => window.TIMELINE);
const cdp = await page.createCDPSession();

// Assets that failed to load (logo images...) must never reach a delivered file as a silent fallback (e.g. the brand name as text):
// the comp records them in window.ASSET_ERRORS (engine/brand-layer.js). Checked once the comp is ready and again after the frames
// were drawn (the CTA card only touches its logo variant when it first draws). Warnings are printed but never block.
const reported = new Set();
const checkAssets = async () => {
  const { errors, warnings } = await page.evaluate(() => ({ errors: window.ASSET_ERRORS ?? [], warnings: window.ASSET_WARNINGS ?? [] }));
  for (const w of warnings) if (!reported.has(w.kind + w.path)) { reported.add(w.kind + w.path); console.warn(`aviso: ${w.error}`); }
  if (!errors.length) return;
  console.error("ERROR: el render se detuvo porque faltan o fallan assets (no se escribió ningún video nuevo):");
  for (const e of errors) console.error(`  - [${e.kind}] ${e.path}: ${e.error}`);
  await browser.close();
  server.close();
  process.exit(2);
};
await checkAssets();

const capture = async (t, file, format = "jpeg") => {
  await page.evaluate((time) => window.render(time), t);
  const { data } = await cdp.send("Page.captureScreenshot", format === "png" ? { format: "png" } : { format: "jpeg", quality: 94 });
  writeFileSync(file, Buffer.from(data, "base64"));
};

mkdirSync(out, { recursive: true });
// Face-aware layout report (comps built from templates/overlay.html expose window.LAYOUT.report).
const layout = await page.evaluate(() => window.LAYOUT ?? null);
if (layout) writeFileSync(join(compDir, "layout-report.json"), JSON.stringify(layout.report, null, 2));
if (mode === "qa") {
  const dir = join(out, "qa");
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  await page.evaluate(() => {
    window.QA = true;
  });
  const times = extra ? extra.split(",").map(Number) : (layout?.report.elements ?? []).filter((e) => e.rect).map((e) => e.qaTime);
  let k = 0;
  for (const t of times) await capture(t, join(dir, `${String((k += 1)).padStart(2, "0")}.jpg`));
  await checkAssets();
  console.log(`qa (${times.length} frames) → ${dir}`);
} else if (mode === "events") {
  const file = join(out, "events.json");
  writeFileSync(file, JSON.stringify({ slug, DURATION, events }, null, 2));
  console.log(`events (${events.length}, ${DURATION}s) → ${file}`);
} else if (mode === "cover") {
  const t = Number(extra ?? 0);
  const file = join(out, `${slug}-cover.png`);
  await capture(t, file, "png");
  console.log(`cover (t=${t}) → ${file}`);
} else if (mode.startsWith("preview")) {
  const dir = join(out, "preview");
  mkdirSync(dir, { recursive: true });
  const fallback = [0.1, 0.25, 0.5, 0.75, 0.95].map((f) => (f * DURATION).toFixed(2)).join(",");
  const times = (extra ?? fallback).split(",").map(Number);
  const nameOf = (t) => t.toFixed(2).padStart(5, "0");
  for (const t of times) await capture(t, join(dir, `t${nameOf(t)}.jpg`));
  await checkAssets();
  console.log(`preview → ${dir}`);
} else {
  const frames = join(out, `frames-${mode}`);
  rmSync(frames, { recursive: true, force: true });
  mkdirSync(frames, { recursive: true });
  const total = Math.round(DURATION * FPS);
  const started = Date.now();
  for (let f = 0; f < total; f += 1) {
    await capture(f / FPS, join(frames, `${String(f).padStart(5, "0")}.jpg`));
    if (f % 150 === 0) console.log(`${f}/${total} · ${((Date.now() - started) / 1000).toFixed(0)}s`);
  }

  await checkAssets();
  const video = join(out, `${slug}-9x16.mp4`);
  const ffmpeg = process.env.FFMPEG ?? "ffmpeg";
  const hasAudio = !noAudio && existsSync(audio);
  const enc = resolveEncoder(process.env.ESTUDIO_VIDEO_ENCODER);
  if (enc.warning) console.warn(`aviso: ${enc.warning}`);
  execFileSync(
    ffmpeg,
    // libx264 (default) keeps the historical argv exactly; see encoder-args.test.mjs.
    finalEncodeArgv({ fps: FPS, framesPattern: join(frames, "%05d.jpg"), audio: hasAudio ? audio : null, video, encoder: enc.encoder }),
    { stdio: "inherit" }
  );
  if (!process.env.KEEP_FRAMES) rmSync(frames, { recursive: true, force: true });
  console.log(`video → ${video}${hasAudio ? ` (audio: ${audio})` : " (no audio)"}`);
}

await browser.close();
server.close();
