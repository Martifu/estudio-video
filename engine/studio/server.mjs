#!/usr/bin/env node
// Estudio: local browser editor for the motion layer of an estudio-video comp.
//
//   node engine/studio/server.mjs <RUN>/<comp> [--port N] [--no-open]
//
// Serves the studio UI at http://127.0.0.1:<port>/ (loopback only) plus the comp and RUN files (confined to the RUN dir).
// See engine/studio/README.md for the endpoints, the on-disk layout (<comp>/.studio/) and how to extend the element schema.
import { spawn } from "node:child_process";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statSync, watch, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createStaticHandler, resolveStaticFile } from "../static-server.mjs";
import { validateMotion } from "./client/schema.js";
import { normalize as normalizeEdl } from "../edl.js";
import { checkSfxDoc } from "../sfx-doc.js";
import { registerExtras } from "./extras.mjs";
import { registerAssets, checkLogoDoc, checkCtaDoc } from "./assets.mjs";
import { registerInsights } from "./insights.mjs";
import { registerVariants } from "./variants.mjs";
import { resolveExe } from "./pyenv.mjs";
import { openPath, renderEnv as renderEnvFor } from "./platform.mjs";
import { registerMedia } from "./media.mjs";
import { registerProducts } from "./products.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const ENGINE = dirname(here);
const SKILL = dirname(ENGINE);
const CLIENT = join(here, "client");
const MAX_BODY = 1024 * 1024; // 1 MB

// ---------- arguments ----------
const argv = process.argv.slice(2);
let port = 0;
let noOpen = false;
const pos = [];
for (let i = 0; i < argv.length; i += 1) {
  if (argv[i] === "--no-open") noOpen = true;
  else if (argv[i] === "--port") port = Number(argv[(i += 1)]);
  else pos.push(argv[i]);
}
if (!pos[0]) {
  console.error("Usage: node engine/studio/server.mjs <RUN>/<comp> [--port N] [--no-open]");
  process.exit(1);
}
const compDir = resolve(pos[0]);
const runDir = dirname(compDir);
const compName = basename(compDir);
if (!existsSync(join(compDir, "index.html"))) {
  console.error(`Not a comp (no index.html): ${compDir}`);
  process.exit(1);
}
const studioDir = join(compDir, ".studio");
const historyDir = join(studioDir, "history");
mkdirSync(historyDir, { recursive: true });
const motionFile = join(compDir, "motion.json");
const inboxFile = join(studioDir, "inbox.jsonl");

const TOKEN = randomBytes(24).toString("hex");

// ---------- helpers ----------
const sha = (buf) => createHash("sha256").update(buf).digest("hex").slice(0, 16);
const readMotionRaw = () => (existsSync(motionFile) ? readFileSync(motionFile) : Buffer.from("[]"));
const stamp = () => new Date().toISOString().replace(/[:.]/g, "-");
function writeAtomic(file, data) {
  const tmp = `${file}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  writeFileSync(tmp, data);
  renameSync(tmp, file);
}
/** True when `p` (existing or not) resolves inside `base`, following symlinks of the nearest existing ancestor. */
function insideDir(p, base) {
  let cur = resolve(p);
  const tail = [];
  while (!existsSync(cur)) {
    tail.unshift(basename(cur));
    const up = dirname(cur);
    if (up === cur) return false;
    cur = up;
  }
  const real = join(realpathSync(cur), ...tail);
  const realBase = realpathSync(base);
  return real === realBase || real.startsWith(realBase + sep);
}
const json = (res, code, obj, extra = {}) => {
  res.writeHead(code, { "Content-Type": "application/json", "Cache-Control": "no-store", ...extra });
  res.end(JSON.stringify(obj));
};
async function readBody(req, limit = MAX_BODY) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw Object.assign(new Error("body too large"), { status: 413 });
    chunks.push(c);
  }
  return Buffer.concat(chunks);
}
async function readJson(req, limit) {
  const buf = await readBody(req, limit);
  try {
    return JSON.parse(buf.toString("utf8") || "null");
  } catch {
    throw Object.assign(new Error("invalid JSON"), { status: 400 });
  }
}

// Comp-local element types (<comp>/motion-lib/<type>.js): registered in this process too, so validateMotion knows them. Problems are
// printed (the editor shows them as well); the render (overlay.py) refuses to build with an element that fails the contract.
{
  const { loadLocal } = await import("../motion-lib/index.js");
  const r = await loadLocal(join(compDir, "motion-lib"));
  for (const e of r.errors) console.error(`Elemento propio ${e.file.replace(/^local:/, "")}: ${e.problems.join("; ")}`);
}

// ---------- state shared with extras ----------
const ctx = {
  SKILL, ENGINE, here, compDir, runDir, compName, studioDir, historyDir, motionFile, inboxFile,
  json, readJson, readBody, writeAtomic, insideDir, sha, stamp,
  broadcast: (event, data) => broadcast(event, data),
  motionVersion: () => sha(readMotionRaw()),
  // Env for render children (render.mjs, variants.py): CHROME resolved for this OS. Used by startRender and variants.
  renderEnv: () => renderEnvFor()
};

// ---------- Server-Sent Events ----------
const clients = new Set();
function broadcast(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const c of clients) c.write(msg);
}

// ---------- make the comp hookable (window.setMotion) ----------
/** Comps built before the hook existed lack window.setMotion: rebuild index.html from the current template with the same CONFIG. */
function ensureHook() {
  const file = join(compDir, "index.html");
  const html = readFileSync(file, "utf8");
  if (html.includes("window.setState") && html.includes("window.setEdl") && html.includes("window.setLogoSrc") && html.includes("window.addClips") && html.includes("window.setProducts")) return false; // comps built before the zones/captions/EDL hooks are rebuilt from the template
  const m = /const CONFIG = (\{.*\});?\n/.exec(html);
  if (!m) throw new Error("index.html has no CONFIG line; rebuild the comp with overlay.py");
  const template = readFileSync(join(ENGINE, "templates", "overlay.html"), "utf8");
  if (!existsSync(join(studioDir, "index.pre-studio.html"))) writeFileSync(join(studioDir, "index.pre-studio.html"), html);
  writeFileSync(file, template.replace("/*CONFIG*/ {}", () => m[1]));
  return true;
}
const upgraded = ensureHook();

// ---------- motion state ----------
let lastWritten = null; // hash of our own last write (to ignore the watcher echo)
let knownVersion = ctx.motionVersion();
let watchTimer = null;
const docTimers = {};
watch(compDir, (_evt, name) => {
  if (name && name.endsWith(".json") && Object.keys(DOCS).includes(name.replace(".json", ""))) {
    const which = name.replace(".json", "");
    clearTimeout(docTimers[which]);
    docTimers[which] = setTimeout(() => {
      const v = ctx.docRead(which).version;
      if (v !== lastDocWrite[which]) broadcast("doc", { name: which, version: v, external: true });
    }, 150);
    return;
  }
  if (name !== "motion.json") return;
  clearTimeout(watchTimer);
  watchTimer = setTimeout(() => {
    const v = ctx.motionVersion();
    if (v === knownVersion) return;
    knownVersion = v;
    if (v === lastWritten) return;
    broadcast("motion", { version: v, external: true });
  }, 150);
});

function listHistory() {
  return readdirSync(historyDir)
    .filter((n) => n.endsWith(".json") && !/^[a-z]+-\d{4}-/.test(n)) // motion snapshots start with the year; companion docs are <name>-<stamp>.json
    .sort()
    .reverse()
    .map((name) => {
      let n = null;
      try {
        n = JSON.parse(readFileSync(join(historyDir, name), "utf8")).length;
      } catch { /* unreadable snapshot */ }
      return { name, ts: name.replace(/\.json$/, "").replace(/-original$/, ""), original: name.endsWith("-original.json"), elements: n };
    });
}

function readJsonl(file) {
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => {
    try {
      return JSON.parse(l);
    } catch {
      return null;
    }
  }).filter(Boolean);
}

// ---------- render pipeline (fixed; argv comes from <comp>/.studio/build.json, never from the browser) ----------
const buildFile = join(studioDir, "build.json");
const ALLOWED_EXE = new Set(["python3", "python", "node"]);
/** Validate build.json: {argv:[exe, script, ...args]}. Every path-like argument must resolve inside the skill or RUN dir. */
function loadBuild() {
  if (!existsSync(buildFile)) return { error: "falta .studio/build.json (se escribe con overlay.py --studio-build)" };
  let b;
  try {
    b = JSON.parse(readFileSync(buildFile, "utf8"));
  } catch {
    return { error: "build.json inválido" };
  }
  return validateArgv(b.argv);
}
/** Same checks for the argv actually spawned (build.json argv after the active media versions are applied). */
function validateArgv(args) {
  if (!Array.isArray(args) || args.length < 2 || !args.every((a) => typeof a === "string")) return { error: "build.json: argv inválido" };
  if (!ALLOWED_EXE.has(args[0])) return { error: `build.json: ejecutable no permitido (${args[0]})` };
  const under = (p) => {
    const abs = resolve(runDir, p);
    return insideDir(abs, SKILL) || insideDir(abs, runDir);
  };
  if (!insideDir(resolve(runDir, args[1]), SKILL)) return { error: "build.json: el script debe estar dentro del skill" };
  // Windows paths may use backslashes; on macOS/Linux this is exactly the old "/" test.
  const SEP = process.platform === "win32" ? /[\\/]/ : /\//;
  for (const a of args.slice(2)) {
    if (a.startsWith("~") || ((SEP.test(a) || a.startsWith(".")) && !a.startsWith("--") && !under(a))) return { error: `build.json: ruta fuera de skill/RUN (${a})` };
    if (a.startsWith("--") && a.includes("=") && (/~/.test(a.split("=")[1] ?? "") || SEP.test(a.split("=")[1] ?? "")) && !under(a.split("=")[1])) return { error: `build.json: ruta fuera de skill/RUN (${a})` };
  }
  const flag = (name) => args[args.indexOf(name) + 1];
  if (args[1].endsWith("overlay.py")) {
    if (args.includes("--run") && resolve(runDir, flag("--run")) !== runDir) return { error: "build.json: --run debe ser el RUN de este comp" };
    if (args.includes("--name") && flag("--name") !== compName) return { error: "build.json: --name debe ser este comp" };
  }
  return { argv: args };
}

let renderJob = null; // {startedAt, log:[], child}
async function startRender() {
  const build = loadBuild();
  if (build.error) return { error: build.error };
  const argv = ctx.composeArgv ? ctx.composeArgv(build.argv) : build.argv;
  const checked = validateArgv(argv);
  if (checked.error) return { error: checked.error };
  // python/python3 in build.json is only a name: spawn the interpreter the doctor validates (pyenv.mjs), not whatever PATH gives.
  const resolved = await resolveExe(argv[0]);
  if (resolved.error) return { error: `build.json: ${resolved.error}` };
  if (renderJob && !renderJob.done) return { error: "ya hay un render en curso", code: 409 };
  const exe = resolved.exe;
  const rest = argv.slice(1);
  const job = { startedAt: Date.now(), done: false, code: null, log: [], output: join(compDir, "out", `${compName}-final.mp4`) };
  renderJob = job;
  const child = spawn(exe, rest, { cwd: runDir, env: { ...process.env, ...(ctx.renderEnv?.() ?? {}) }, stdio: ["ignore", "pipe", "pipe"] });
  const cmdLine = `$ ${[exe, ...rest].map((x) => (/[\s"']/.test(x) ? JSON.stringify(x) : x)).join(" ")}`;
  job.command = [exe, ...rest];
  job.log.push(cmdLine);
  broadcast("render", { line: cmdLine });
  let buf = "";
  const onData = (chunk) => {
    buf += chunk.toString("utf8");
    const lines = buf.split(/\r?\n|\r/);
    buf = lines.pop();
    for (const line of lines) {
      if (!line.trim()) continue;
      if (/^(frame=|size=)/.test(line.trim())) continue; // ffmpeg progress spam
      job.log.push(line);
      if (job.log.length > 400) job.log.shift();
      const p = /^(\d+)\/(\d+) ·/.exec(line);
      broadcast("render", { line, progress: p ? Number(p[1]) / Number(p[2]) : undefined });
    }
  };
  child.stdout.on("data", onData);
  child.stderr.on("data", onData);
  child.on("close", (code) => {
    job.done = true;
    job.code = code;
    ctx.onRenderDone?.(code, job);
    broadcast("render", { done: true, code, output: code === 0 ? job.output : null });
  });
  child.on("error", (err) => {
    job.done = true;
    job.code = -1;
    broadcast("render", { line: `error: ${err.message}`, done: true, code: -1 });
  });
  return { ok: true };
}

// ---------- security ----------
let boundPort = 0;
const hostOk = (req) => {
  const h = (req.headers.host ?? "").toLowerCase();
  return h === `127.0.0.1:${boundPort}` || h === `localhost:${boundPort}`;
};
const originOk = (req) => {
  const o = req.headers.origin;
  return !o || o === `http://127.0.0.1:${boundPort}` || o === `http://localhost:${boundPort}`;
};
const tokenOk = (req) => {
  const got = Buffer.from(String(req.headers["x-studio-token"] ?? ""));
  const want = Buffer.from(TOKEN);
  return got.length === want.length && timingSafeEqual(got, want);
};

// ---------- routes ----------
const routes = []; // {method, path|regex, mutating, handler(req,res,match)}
const route = (method, path, mutating, handler) => routes.push({ method, path, mutating, handler });
ctx.route = route;

route("GET", "/api/state", false, (req, res) => {
  const raw = readMotionRaw();
  let motion = [];
  try {
    motion = JSON.parse(raw.toString("utf8"));
  } catch { /* corrupt motion.json: the UI shows an empty list and the error */ }
  const audio = [];
  for (const [rel, label] of [["audio/clips.wav", "Voz (clips)"], ["audio/master.wav", "Master"], ["out/mix.wav", "Mezcla (música + SFX)"]]) {
    if (existsSync(join(compDir, rel))) audio.push({ url: `/${compName}/${rel}`, label });
  }
  const build = loadBuild();
  json(res, 200, {
    docs: Object.fromEntries(Object.keys(DOCS).map((k) => [k, docRead(k)])),
    comp: compName, run: basename(runDir), version: sha(raw), motion, audio, words: existsSync(join(compDir, "words.json")) ? `/${compName}/words.json` : null,
    comp_url: `/${compName}/index.html?fmt=v`, build: build.error ? { error: build.error } : { ok: true },
    upgraded, history: listHistory(), render: renderJob ? { done: renderJob.done, code: renderJob.code, output: renderJob.output } : null,
    hasFinal: existsSync(join(compDir, "out", `${compName}-final.mp4`)),
    final: finalInfo()
  });
});

// ui-skin.json for the preview: the comp's own, else the RUN's, else the brand's (same order as scripts/overlay.py prepare_ui_skin). A comp built
// before it had any ui element has no CONFIG.uiSkinFile, so the preview asks here and the render picks the same file up later.
route("GET", "/api/ui-skin", false, (req, res) => {
  const slug = (() => { try { return JSON.parse(readFileSync(join(runDir, "brand.json"), "utf8")).slug ?? ""; } catch { return ""; } })();
  const cands = [["comp", join(compDir, "ui-skin.json")], ["run", join(runDir, "ui-skin.json")], ...(/^[\w-]+$/.test(slug) ? [["brand", join(SKILL, "brands", slug, "ui-skin.json")]] : [])];
  for (const [source, file] of cands) {
    if (!existsSync(file)) continue;
    try { return json(res, 200, { doc: JSON.parse(readFileSync(file, "utf8")), source }); } catch { /* unreadable skin: fall through to the next candidate */ }
  }
  json(res, 200, { doc: null, source: null });
});

route("PUT", "/api/motion", true, async (req, res) => {
  const body = await readJson(req);
  if (!body || typeof body.version !== "string" || !Array.isArray(body.motion)) return json(res, 400, { error: "se espera {version, motion[]}" });
  const current = ctx.motionVersion();
  if (body.version !== current) return json(res, 409, { error: "conflict", version: current });
  const total = Number(body.total) || Infinity;
  const v = validateMotion(body.motion, total);
  if (v.errors.length) return json(res, 422, { error: "invalid", errors: v.errors });
  const text = JSON.stringify(body.motion, null, 1);
  // First save of this comp: keep the pre-studio file as -original.
  if (!listHistory().length && existsSync(motionFile)) writeFileSync(join(historyDir, `${stamp()}-original.json`), readMotionRaw());
  writeFileSync(join(historyDir, `${stamp()}.json`), text);
  lastWritten = sha(Buffer.from(text));
  writeAtomic(motionFile, text);
  knownVersion = lastWritten;
  json(res, 200, { version: lastWritten, history: listHistory(), warnings: v.warnings });
});

route("GET", /^\/api\/history\/([\w.-]+\.json)$/, false, (req, res, m) => {
  const f = join(historyDir, m[1]);
  if (!existsSync(f)) return json(res, 404, { error: "not found" });
  json(res, 200, { motion: JSON.parse(readFileSync(f, "utf8")) });
});

// ---------- companion documents: <comp>/captions.json and <comp>/zones.json (read by the template when overlay.py finds them) ----------
const DOCS = {
  zones: {
    file: join(compDir, "zones.json"),
    check(d) {
      if (!d || typeof d !== "object") return "zones debe ser un objeto";
      const lim = { top: [0, 700], bottom: [0, 900], left: [0, 400], right: [0, 400] };
      for (const [k, [lo, hi]] of Object.entries(lim)) if (!Number.isFinite(Number(d[k])) || d[k] < lo || d[k] > hi) return `zones.${k} fuera de rango (${lo}..${hi})`;
      if (d.top + d.bottom > 1500) return "las zonas no dejan área libre";
      return null;
    }
  },
  captions: {
    file: join(compDir, "captions.json"),
    check(d) {
      if (!d || typeof d !== "object") return "captions debe ser un objeto";
      if (d.style && typeof d.style !== "object") return "captions.style inválido";
      for (const [k, v] of Object.entries(d.style ?? {})) if (!["number", "boolean", "string"].includes(typeof v)) return `captions.style.${k} inválido`;
      if (d.segments != null) {
        if (!Array.isArray(d.segments)) return "captions.segments debe ser una lista";
        for (const [i, sg] of d.segments.entries()) {
          if (!Number.isFinite(Number(sg.in)) || !Number.isFinite(Number(sg.out)) || typeof sg.text !== "string") return `segmento #${i + 1}: necesita in, out y text`;
        }
      }
      return null;
    }
  }
};
// edl.json (engine/edl.js): the cut. Structure only here: the clip names are checked against the bin by overlay.py / the comp.
DOCS.edl = {
  file: join(compDir, "edl.json"),
  check(d) {
    if (!d || typeof d !== "object" || !Array.isArray(d.segments)) return "edl debe ser {segments:[...]}";
    if (!d.segments.length) return "el video necesita al menos un segmento";
    const r = normalizeEdl(d, null);
    return r.errors[0] ?? null;
  }
};
// logo.json / cta.json (Estudio logo + end-card inspectors; engine/studio/assets.mjs validates them)
DOCS.logo = { file: join(compDir, "logo.json"), check: (d) => checkLogoDoc(d, { runDir, insideDir }) };
DOCS.cta = { file: join(compDir, "cta.json"), check: (d) => checkCtaDoc(d) };
// sfx.json (engine/sfx-doc.js): user edits on top of the automatic sound effects. overlay.py hands it to mix.py (with --music, or --no-music when the comp has sfx.json).
DOCS.sfx = { file: join(compDir, "sfx.json"), check: (d) => checkSfxDoc(d) };
const docRead = (name) => {
  const f = DOCS[name].file;
  if (!existsSync(f)) return { doc: null, version: sha(Buffer.from("null")) };
  const raw = readFileSync(f);
  try {
    return { doc: JSON.parse(raw.toString("utf8")), version: sha(raw) };
  } catch {
    return { doc: null, version: sha(raw), corrupt: true };
  }
};
ctx.docRead = docRead;
route("PUT", new RegExp(`^/api/doc/(${Object.keys(DOCS).join("|")})$`), true, async (req, res, m) => {
  const name = m[1];
  const body = await readJson(req);
  const cur = docRead(name);
  if (!body || typeof body.version !== "string") return json(res, 400, { error: "se espera {version, doc}" });
  if (body.version !== cur.version) return json(res, 409, { error: "conflict", version: cur.version });
  if (body.doc === null) {
    if (existsSync(DOCS[name].file)) {
      writeFileSync(join(historyDir, `${name}-${stamp()}.json`), readFileSync(DOCS[name].file));
      rmSync(DOCS[name].file);
    }
  } else {
    const err = DOCS[name].check(body.doc);
    if (err) return json(res, 422, { error: "invalid", errors: [err] });
    const text = JSON.stringify(body.doc, null, 1);
    writeFileSync(join(historyDir, `${name}-${stamp()}.json`), text);
    writeAtomic(DOCS[name].file, text);
  }
  lastDocWrite[name] = docRead(name).version;
  json(res, 200, { version: docRead(name).version });
});
const lastDocWrite = {};
route("GET", "/api/comments", false, (req, res) => json(res, 200, { comments: readJsonl(inboxFile) }));
route("POST", "/api/comment", true, async (req, res) => {
  const b = await readJson(req, 16 * 1024);
  const text = typeof b?.text === "string" ? b.text.trim().slice(0, 2000) : "";
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
  if (!text || num(b.t) === null) return json(res, 400, { error: "se espera {t, text}" });
  const entry = {
    id: randomBytes(4).toString("hex"), ts: new Date().toISOString(), t: num(b.t), elementId: typeof b.elementId === "string" ? b.elementId : null,
    elementType: typeof b.elementType === "string" ? b.elementType : null, x: num(b.x), y: num(b.y), text, motionVersion: ctx.motionVersion(), resolved: false
  };
  appendFileSync(inboxFile, `${JSON.stringify(entry)}\n`);
  broadcast("comments", {});
  json(res, 200, { comment: entry });
});
route("POST", "/api/comment/resolve", true, async (req, res) => {
  const b = await readJson(req, 4096);
  const all = readJsonl(inboxFile);
  const c = all.find((x) => x.id === b?.id);
  if (!c) return json(res, 404, { error: "not found" });
  c.resolved = !!b.resolved;
  writeAtomic(inboxFile, all.map((x) => JSON.stringify(x)).join("\n") + "\n");
  broadcast("comments", {});
  json(res, 200, { comment: c });
});

route("GET", "/api/events", false, (req, res) => {
  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive" });
  res.write(`event: hello\ndata: ${JSON.stringify({ version: ctx.motionVersion() })}\n\n`);
  clients.add(res);
  const ping = setInterval(() => res.write(": ping\n\n"), 20000);
  req.on("close", () => {
    clearInterval(ping);
    clients.delete(res);
  });
});

route("POST", "/api/render", true, async (req, res) => {
  await readBody(req, 1024); // body ignored: the pipeline is fixed
  // Preflight: every referenced asset (logo files, CTA variant) must resolve inside the RUN and decode. Blocks the render with the reasons.
  const pf = await ctx.preflight();
  if (!pf.ok) return json(res, 422, { error: `No se puede renderizar: ${pf.errors[0].message}`, preflight: pf });
  const r = await startRender();
  if (r.error) return json(res, r.code ?? 400, { error: r.error });
  json(res, 202, { started: true });
});
route("GET", "/api/render", false, (req, res) => json(res, 200, renderJob ? { done: renderJob.done, code: renderJob.code, output: renderJob.output, command: renderJob.command, log: renderJob.log.slice(-80) } : { idle: true }));
// Last final video on disk (survives restarts) and whether edits saved after it are missing from it.
function finalInfo() {
  const file = join(compDir, "out", `${compName}-final.mp4`);
  if (!existsSync(file)) return null;
  const mtime = statSync(file).mtimeMs;
  const docs = [join(compDir, "motion.json"), ...Object.values(DOCS).map((d) => d.file)].filter((f) => existsSync(f));
  const stale = docs.some((f) => statSync(f).mtimeMs > mtime + 1000);
  return { at: new Date(mtime).toISOString(), stale };
}
route("POST", "/api/open-final", true, async (req, res) => {
  await readBody(req, 1024);
  const file = join(compDir, "out", `${compName}-final.mp4`);
  if (!existsSync(file)) return json(res, 404, { error: "no hay video final todavía" });
  openPath(file, { app: "QuickTime Player" }).then((err) => err && console.error("open failed:", err));
  json(res, 200, { opened: file });
});

registerExtras(ctx);
registerAssets(ctx);
registerProducts(ctx);
registerInsights(ctx);
registerVariants(ctx);
registerMedia(ctx);

// ---------- HTTP ----------
const staticHandler = createStaticHandler({ engineDir: ENGINE, runDir, ranges: true, realpathConfine: true, headers: { "Cache-Control": "no-store" } });
const CLIENT_TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css" };

ctx.validateArgv = validateArgv;
const server = createServer(async (req, res) => {
  try {
    if (!hostOk(req)) return json(res, 403, { error: "bad host" });
    const url = new URL(req.url, "http://x");
    const path = url.pathname;
    if (req.method !== "GET" && req.method !== "HEAD" && !originOk(req)) return json(res, 403, { error: "bad origin" });
    if (path.startsWith("/api/")) {
      const r = routes.find((x) => x.method === req.method && (typeof x.path === "string" ? x.path === path : x.path.test(path)));
      if (!r) return json(res, 404, { error: "not found" });
      if (r.mutating && !tokenOk(req)) return json(res, 403, { error: "bad token" });
      return await r.handler(req, res, typeof r.path === "string" ? null : r.path.exec(path));
    }
    if (path === "/" || path === "/index.html") {
      const html = readFileSync(join(CLIENT, "index.html"), "utf8").replace("__TOKEN__", TOKEN);
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      return res.end(html);
    }
    if (path.startsWith("/_studio/")) {
      const f = resolveStaticFile(path.slice("/_studio".length), { engineDir: CLIENT, runDir: CLIENT, realpathConfine: true });
      if (!f) return json(res, 404, { error: "not found" });
      res.writeHead(200, { "Content-Type": CLIENT_TYPES[extname(f)] ?? "application/octet-stream", "Cache-Control": "no-store" });
      return res.end(readFileSync(f));
    }
    if (path.startsWith("/_skill/assets/")) { // read-only SFX kit for the preview (confined to <skill>/assets)
      const f = resolveStaticFile("/engine/" + path.slice("/_skill/assets/".length), { engineDir: join(SKILL, "assets"), runDir, realpathConfine: true });
      if (!f) return json(res, 404, { error: "not found" });
      res.writeHead(200, { "Content-Type": { ".wav": "audio/wav", ".json": "application/json", ".mp3": "audio/mpeg" }[extname(f)] ?? "application/octet-stream", "Cache-Control": "no-store" });
      return res.end(readFileSync(f));
    }
    if (req.method !== "GET" && req.method !== "HEAD") return json(res, 405, { error: "method not allowed" });
    if (path.split("/").some((s) => s.startsWith("."))) return json(res, 404, { error: "not found" }); // .studio/, dotfiles
    return staticHandler(req, res);
  } catch (err) {
    if (!res.headersSent) json(res, err.status ?? 500, { error: err.message });
    else res.end();
    if (!err.status) console.error(err);
  }
});

server.listen(port, "127.0.0.1", () => {
  boundPort = server.address().port;
  const url = `http://127.0.0.1:${boundPort}/`;
  console.log(`Estudio · ${basename(runDir)}/${compName}${upgraded ? " (index.html actualizado con window.setMotion; copia en .studio/index.pre-studio.html)" : ""}`);
  console.log(url);
  if (!noOpen) openPath(url, { app: "Google Chrome" }).then((err) => err && console.error("could not open Chrome:", err));
});
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => process.exit(0));
