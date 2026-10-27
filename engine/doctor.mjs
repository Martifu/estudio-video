#!/usr/bin/env node
// Estudio de video · doctor (onboarding / diagnostics)
//
//   node engine/doctor.mjs [--json] [--fix] [--online] [--skip-claude] [--if-stale] [--no-write] [--print-python] [--help]
//
// Zero npm dependencies (node builtins only). Supported: macOS and Windows 11 (NVIDIA GPU optional). Linux is not supported yet.
// Code is in English; everything the user reads is in Spanish (Mexico).
// Secrets are never printed, logged or stored: the ElevenLabs key is only reported as present/absent
// and, with --online, validated against a free read-only endpoint (ok / invalid).

import { execFile, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import { chromeCandidates as sharedChromeCandidates } from "./chrome-path.mjs";

export const SUPPORTED_PLATFORMS = ["darwin", "win32"];
export const MIN_NODE_MAJOR = 20;
export const MIN_PY = [3, 10];
export const MIN_DISK_GB = 10;
export const CACHE_DAYS = 7;
export const ELEVEN_KEY_VAR = "ELEVENLABS_API_KEY";

export const REQUIRED_ENCODERS = ["libx264", "aac"];
export const REQUIRED_FILTERS = ["loudnorm", "ebur128", "alimiter", "atempo", "acrossfade", "amix", "adelay", "atrim"];
export const PY_REQUIRED = [
  { mod: "PIL", pip: "Pillow" },
  { mod: "requests", pip: "requests" },
  { mod: "numpy", pip: "numpy" },
  { mod: "scipy", pip: "scipy" },
  { mod: "librosa", pip: "librosa" },
  { mod: "soundfile", pip: "soundfile" },
];
export const PY_OPTIONAL = [
  { mod: "rembg", pip: "rembg" },
  { mod: "mlx_whisper", pip: "mlx-whisper", appleSiliconOnly: true },
];
// Windows (and other non-Mac) transcription and face detection. Kept out of PY_OPTIONAL: that list mirrors the Mac requirements.
export const PY_OPTIONAL_NON_MAC = [
  { mod: "faster_whisper", pip: "faster-whisper" },
  { mod: "cv2", pip: "opencv-python-headless" },
];
export const FACE_MODEL_FILE = "face_detection_yunet_2023mar.onnx";

const here = path.dirname(fileURLToPath(import.meta.url));
export const SKILL_ROOT = path.resolve(here, "..");

export const SECTIONS = {
  sistema: "Tu computadora",
  motor: "Motor de video",
  navegador: "Navegador para renderizar",
  python: "Python",
  opcionales: "Herramientas opcionales",
  secretos: "Llaves y cuentas",
  claude: "Claude y conectores",
  codex: "Codex (opcional)",
  skill: "Configuración del skill",
};

// ---------------------------------------------------------------------------------------------------------------
// Context (everything that touches the machine goes through here so tests can mock it)
// ---------------------------------------------------------------------------------------------------------------

export function pathFor(platform) {
  return platform === "win32" ? path.win32 : path.posix;
}

export function realExec(platform = process.platform) {
  return (file, args = [], opts = {}) =>
    new Promise((resolve) => {
      let f = file;
      let a = args;
      // Node refuses to run .cmd/.bat directly with shell:false; go through cmd.exe with fixed, non-shell args.
      if (platform === "win32" && /\.(cmd|bat)$/i.test(file)) {
        f = process.env.ComSpec || "cmd.exe";
        a = ["/d", "/c", file, ...args];
      }
      execFile(
        f,
        a,
        { timeout: opts.timeout ?? 15000, cwd: opts.cwd, env: opts.env ?? process.env, windowsHide: true, maxBuffer: 16 * 1024 * 1024, shell: false },
        (err, stdout, stderr) => {
          resolve({
            ok: !err,
            code: err ? (typeof err.code === "number" ? err.code : null) : 0,
            stdout: String(stdout ?? ""),
            stderr: String(stderr ?? ""),
            error: err ? (typeof err.code === "string" ? err.code : err.killed ? "TIMEOUT" : "ERROR") : null,
          });
        },
      );
    });
}

export function realSpawn(platform = process.platform) {
  return (file, args = [], opts = {}) => {
    let f = file;
    let a = args;
    if (platform === "win32" && /\.(cmd|bat)$/i.test(file)) {
      f = process.env.ComSpec || "cmd.exe";
      a = ["/d", "/c", file, ...args];
    }
    return spawn(f, a, { shell: false, windowsHide: true, stdio: opts.stdio ?? ["ignore", "pipe", "pipe"], cwd: opts.cwd, env: opts.env ?? process.env });
  };
}

export function makeContext(over = {}) {
  const platform = over.platform ?? process.platform;
  const env = over.env ?? process.env;
  const homedir = over.homedir ?? os.homedir();
  const ctx = {
    platform,
    arch: over.arch ?? process.arch,
    env,
    homedir,
    nodeVersion: over.nodeVersion ?? process.version,
    osRelease: over.osRelease ?? os.release(),
    skillRoot: over.skillRoot ?? SKILL_ROOT,
    exec: over.exec ?? realExec(platform),
    spawn: over.spawn ?? realSpawn(platform),
    fetch: over.fetch ?? ((url, init) => fetch(url, { signal: AbortSignal.timeout(15000), ...init })),
    sleep: over.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms))),
    now: over.now ?? (() => Date.now()),
    exists: over.exists ?? ((p) => fs.existsSync(p)),
    readText: over.readText ?? ((p) => fs.readFileSync(p, "utf8")),
    listDirs: over.listDirs ?? ((p) => {
      try {
        return fs.readdirSync(p, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
      } catch {
        return [];
      }
    }),
    freeBytes: over.freeBytes ?? ((p) => {
      const s = fs.statfsSync(p);
      return Number(s.bavail) * Number(s.bsize);
    }),
    canWrite: over.canWrite ?? ((p) => {
      try {
        fs.accessSync(p, fs.constants.W_OK);
        return true;
      } catch {
        return false;
      }
    }),
    writeText: over.writeText ?? ((p, s) => {
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, s);
    }),
    probeMs: over.probeMs ?? 60000,
    probeRetryMs: over.probeRetryMs ?? 3500,
  };
  ctx.P = pathFor(platform);
  return ctx;
}

// ---------------------------------------------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------------------------------------------

/** Same convention as scripts/paths.py data_dir(): per-OS user data folder for the skill. */
export function dataDir(ctx) {
  const { P, env, homedir, platform } = ctx;
  if (env.ESTUDIO_DATA_DIR) return env.ESTUDIO_DATA_DIR; // same override as engine/studio/pyenv.mjs
  if (platform === "darwin") return P.join(homedir, "Library", "Application Support", "estudio-video");
  if (platform === "win32") return P.join(env.LOCALAPPDATA || P.join(homedir, "AppData", "Local"), "estudio-video");
  return P.join(env.XDG_DATA_HOME || P.join(homedir, ".local", "share"), "estudio-video");
}

export function venvPython(ctx) {
  const { P, platform } = ctx;
  const v = P.join(dataDir(ctx), "venv");
  return platform === "win32" ? P.join(v, "Scripts", "python.exe") : P.join(v, "bin", "python");
}

/** OpenCV YuNet model used for face detection outside macOS; setup_python.py downloads it into <data_dir>/models. */
export function faceModelPath(ctx) {
  return ctx.P.join(dataDir(ctx), "models", FACE_MODEL_FILE);
}

export function defaultVideosDir(ctx) {
  const { P, env, homedir, platform } = ctx;
  if (platform === "win32") return P.join(env.USERPROFILE || homedir, "Videos");
  return P.join(homedir, "Videos");
}

/** Apple Silicon hardware (a node running under Rosetta reports x64, so runChecks also asks sysctl and sets ctx.hwArm64). */
export function isAppleSilicon(ctx) {
  return ctx.platform === "darwin" && (ctx.arch === "arm64" || ctx.hwArm64 === true);
}

/** `where` / `which -a` output -> list of paths (handles CRLF and blank lines). */
export function parseWhere(stdout) {
  return String(stdout ?? "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** On Windows prefer .exe, then .cmd/.bat; push the WindowsApps store aliases (python stubs) to the end. */
export function rankWindowsPaths(lines) {
  const score = (p) => {
    let s = /\.exe$/i.test(p) ? 0 : /\.(cmd|bat)$/i.test(p) ? 1 : 2;
    if (/\\WindowsApps\\/i.test(p)) s += 10;
    return s;
  };
  return [...lines].sort((a, b) => score(a) - score(b));
}

export function parseFfmpegList(text, kind) {
  // encoders: " V....D libx264  ..." ; filters: " TSC acrossfade  AA->A ..." ; legend lines have "=" as the name
  const names = new Set();
  for (const line of String(text).split(/\r?\n/)) {
    const m = line.match(kind === "filters" ? /^ [A-Z.|]{2,4} (\S+)\s/ : /^ [A-Z.]{6} (\S+)/);
    if (m && m[1] !== "=") names.add(m[1]);
  }
  return names;
}

export function parsePyVersion(text) {
  const m = String(text).match(/(\d+)\.(\d+)(?:\.(\d+))?/);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3] ?? 0)] : null;
}
export const versionAtLeast = (v, min) => v && (v[0] > min[0] || (v[0] === min[0] && v[1] >= min[1]));

/** One JSON line of `claude -p --output-format stream-json --verbose` -> the init event or null. */
export function parseInitEvent(line) {
  try {
    const o = JSON.parse(line);
    if (o && o.type === "system" && o.subtype === "init") return o;
  } catch {
    /* not json */
  }
  return null;
}

export function parseInitStream(text) {
  for (const line of String(text).split(/\r?\n/)) {
    const ev = line.trim() ? parseInitEvent(line) : null;
    if (ev) return ev;
  }
  return null;
}

/** Normalizes `mcp_servers` of the init event: [{name, status, source}]. Field names observed with Claude Code 2.1.308. */
export function summarizeMcp(init) {
  const list = Array.isArray(init?.mcp_servers) ? init.mcp_servers : [];
  return list.map((s) => ({ name: String(s?.name ?? ""), status: String(s?.status ?? "unknown"), source: s?.source ? String(s.source) : undefined }));
}

export const CONNECTORS = {
  higgsfield: { label: "Higgsfield", re: /higgsfield/i },
  reda: { label: "Reda", re: /(^|[^a-z])reda([^a-z]|$)/i },
  elevenlabs: { label: "ElevenLabs", re: /eleven\s*labs|elevenlabs/i },
};

const STATUS_RANK = { connected: 0, pending: 1, "needs-auth": 2, failed: 3 };
export function findConnector(servers, re) {
  const hits = servers.filter((s) => re.test(s.name));
  if (!hits.length) return null;
  return hits.sort((a, b) => (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9))[0];
}

export function hasPending(servers) {
  return Object.values(CONNECTORS).some((c) => findConnector(servers, c.re)?.status === "pending");
}

/** Reads ELEVENLABS_API_KEY without ever returning it to a caller that prints: returns {present, source, key}. */
export function lookupElevenKey(ctx) {
  if (ctx.env[ELEVEN_KEY_VAR]) return { present: true, source: "env", key: ctx.env[ELEVEN_KEY_VAR] };
  const file = ctx.P.join(ctx.homedir, ".config", "reels-dibujados", ".env");
  if (ctx.exists(file)) {
    try {
      for (const line of ctx.readText(file).split(/\r?\n/)) {
        if (line.trim().startsWith(`${ELEVEN_KEY_VAR}=`)) {
          const v = line.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
          if (v) return { present: true, source: "archivo", key: v };
        }
      }
    } catch {
      /* unreadable */
    }
  }
  return { present: false, source: null, key: null };
}
export const elevenKeyFile = (ctx) => ctx.P.join(ctx.homedir, ".config", "reels-dibujados", ".env");

/** Chrome candidates for this OS (list lives in engine/chrome-path.mjs, shared with the render). */
export function chromeCandidates(ctx) {
  return sharedChromeCandidates({ platform: ctx.platform, env: ctx.env, homedir: ctx.homedir });
}

/** Interpreter candidates in the order the engine uses: ESTUDIO_PY, data_dir()/venv, python3/python/py -3. */
export function pythonCandidates(ctx) {
  const { P, env, homedir, platform } = ctx;
  const list = [];
  if (env.ESTUDIO_PY) list.push({ cmd: env.ESTUDIO_PY, args: [], label: "ESTUDIO_PY", source: "env" });
  const vpy = venvPython(ctx);
  if (ctx.exists(vpy)) list.push({ cmd: vpy, args: [], label: "entorno del skill", source: "venv" });
  if (platform !== "win32") {
    const legacy = P.join(homedir, ".local", "share", "reels-dibujados", "venv", "bin", "python");
    if (ctx.exists(legacy)) list.push({ cmd: legacy, args: [], label: "entorno anterior (reels-dibujados)", source: "legacy" });
  }
  if (platform === "win32") {
    list.push({ cmd: "py", args: ["-3"], label: "py -3", source: "path" });
    list.push({ cmd: "python", args: [], label: "python", source: "path" });
    list.push({ cmd: "python3", args: [], label: "python3", source: "path" });
  } else {
    list.push({ cmd: "python3", args: [], label: "python3", source: "path" });
    list.push({ cmd: "python", args: [], label: "python", source: "path" });
    if (platform === "darwin") {
      list.push({ cmd: "/opt/homebrew/bin/python3", args: [], label: "Homebrew python3", source: "path" });
      list.push({ cmd: "/usr/local/bin/python3", args: [], label: "python3 (/usr/local)", source: "path" });
    }
  }
  const seen = new Set();
  return list.filter((c) => {
    const k = `${c.cmd}\u0000${c.args.join(" ")}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

const PY_PROBE = `
import sys, json, importlib, importlib.util
req = sys.argv[1].split(",")
opt = [m for m in sys.argv[2].split(",") if m]
out = {"v": list(sys.version_info[:3]), "missing": [], "optional": {}}
for m in req:
    try:
        importlib.import_module(m)
    except Exception:
        out["missing"].append(m)
for m in opt:
    try:
        out["optional"][m] = importlib.util.find_spec(m) is not None
    except Exception:
        out["optional"][m] = False
print(json.dumps(out))
`;

/** Optional modules probed on this OS. Intel Macs stay mlx-only (no faster-whisper / OpenCV there). */
export function optionalProbeMods(ctx) {
  const mac = PY_OPTIONAL.filter((o) => !o.appleSiliconOnly || isAppleSilicon(ctx)).map((o) => o.mod);
  if (ctx.platform === "darwin") return mac;
  const common = PY_OPTIONAL.filter((o) => !o.appleSiliconOnly).map((o) => o.mod);
  return ctx.platform === "win32" ? [...common, ...PY_OPTIONAL_NON_MAC.map((o) => o.mod)] : common;
}

export async function probePython(ctx, cand) {
  const optMods = optionalProbeMods(ctx);
  const r = await ctx.exec(cand.cmd, [...cand.args, "-I", "-X", "utf8", "-c", PY_PROBE, PY_REQUIRED.map((p) => p.mod).join(","), optMods.join(",")], { timeout: 60000 });
  if (!r.ok) return { ...cand, works: false, reason: r.error || `código ${r.code}` };
  try {
    const j = JSON.parse(r.stdout.trim().split(/\r?\n/).pop());
    return { ...cand, works: true, version: j.v, missing: j.missing, optional: j.optional };
  } catch {
    return { ...cand, works: false, reason: "salida inesperada" };
  }
}

/** Walks the candidates; returns {chosen, tried[]}. Chosen = first with version ok and all required packages, else first usable. */
export async function resolvePython(ctx) {
  const tried = [];
  let firstWorking = null;
  let firstVersionOk = null;
  for (const cand of pythonCandidates(ctx)) {
    const r = await probePython(ctx, cand);
    tried.push(r);
    if (!r.works) continue;
    firstWorking ??= r;
    const vOk = versionAtLeast(r.version, MIN_PY);
    if (vOk) firstVersionOk ??= r;
    if (vOk && r.missing.length === 0) return { chosen: r, tried, firstVersionOk: r };
  }
  return { chosen: firstVersionOk ?? firstWorking, tried, firstVersionOk };
}

export async function findBinary(ctx, name, { envVar, extraDirs = [] } = {}) {
  const exe = ctx.platform === "win32" ? `${name}.exe` : name;
  if (envVar && ctx.env[envVar] && ctx.exists(ctx.env[envVar])) return ctx.env[envVar];
  const r = await ctx.exec(ctx.platform === "win32" ? "where" : "which", ctx.platform === "win32" ? [name] : ["-a", name], { timeout: 8000 });
  if (r.ok) {
    let lines = parseWhere(r.stdout);
    if (ctx.platform === "win32") lines = rankWindowsPaths(lines);
    if (lines.length) return lines[0];
  }
  const dirs = [...extraDirs];
  if (ctx.platform === "darwin") dirs.push("/opt/homebrew/bin", "/usr/local/bin");
  if (ctx.platform === "win32") {
    const local = ctx.env.LOCALAPPDATA || ctx.P.join(ctx.homedir, "AppData", "Local");
    dirs.push(ctx.P.join(local, "Microsoft", "WinGet", "Links"), ctx.P.join(ctx.env.ProgramFiles || "C:\\Program Files", "ffmpeg", "bin"));
  }
  for (const d of dirs) {
    const p = ctx.P.join(d, exe);
    if (ctx.exists(p)) return p;
  }
  return null;
}

// ---------------------------------------------------------------------------------------------------------------
// Check model
// ---------------------------------------------------------------------------------------------------------------

function pickFix(platform, f) {
  if (!f) return [];
  if (Array.isArray(f)) return f;
  const os = platform === "win32" ? f.win : platform === "darwin" ? f.mac : f.linux ?? f.mac;
  return [...(os ?? []), ...(f.all ?? [])];
}

export function mk(ctx, o) {
  return {
    id: o.id,
    section: o.section,
    label: o.label,
    status: o.status, // ok | warn | fail | skip
    required: !!o.required,
    message: o.message,
    fix: o.status === "ok" || o.status === "skip" ? [] : pickFix(ctx.platform, o.fix),
    ...(o.detail ? { detail: o.detail } : {}),
  };
}

const gb = (b) => (b / 1024 ** 3).toFixed(1);

// ---------------------------------------------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------------------------------------------

/**
 * NVIDIA GPU through nvidia-smi. Only Windows runs it (macOS and Linux never do). Memoized on ctx.nvidia, so runChecks and the
 * individual checks share one probe and tests can preset it.
 */
export async function detectNvidia(ctx) {
  if (ctx.nvidia !== undefined) return ctx.nvidia;
  let res = { present: false, name: null, driver: null };
  if (ctx.platform === "win32") {
    const r = await ctx.exec("nvidia-smi", ["--query-gpu=name,driver_version", "--format=csv,noheader"], { timeout: 8000 });
    const line = r.ok ? parseWhere(r.stdout)[0] ?? "" : "";
    const [name, driver] = line.split(",").map((s) => s.trim());
    if (name) res = { present: true, name, driver: driver || null };
  }
  ctx.nvidia = res;
  return res;
}

export async function osLabel(ctx) {
  if (ctx.platform === "darwin") {
    const r = await ctx.exec("sw_vers", ["-productVersion"], { timeout: 5000 });
    const v = r.ok ? r.stdout.trim() : "";
    return `macOS ${v || `(Darwin ${ctx.osRelease})`}`;
  }
  if (ctx.platform === "win32") {
    const build = Number((ctx.osRelease.split(".")[2] ?? "0"));
    return `${build >= 22000 ? "Windows 11" : "Windows 10"} (versión ${ctx.osRelease})`;
  }
  return `${ctx.platform} ${ctx.osRelease}`;
}

export async function checkSystem(ctx) {
  const out = [];
  const S = "sistema";
  const label = await osLabel(ctx);
  const supported = SUPPORTED_PLATFORMS.includes(ctx.platform);
  out.push(
    mk(ctx, {
      id: "sys.os", section: S, label: "Sistema operativo", required: true, status: supported ? "ok" : "fail",
      message: supported
        ? `${label}.`
        : `No compatible por ahora: Estudio Video funciona en Mac y en Windows 11 (tu sistema: ${label}).`,
      fix: { all: ["Usa una Mac o una PC con Windows 11 para hacer videos con el estudio. Linux no es compatible por ahora."] },
      detail: { platform: ctx.platform, arch: ctx.arch, release: ctx.osRelease },
    }),
  );
  if (ctx.platform === "darwin") {
    const apple = isAppleSilicon(ctx);
    out.push(
      mk(ctx, {
        id: "sys.chip", section: S, label: "Procesador", status: apple ? "ok" : "warn",
        message: apple
          ? "Mac con Apple Silicon (M1 o más nuevo)."
          : "Mac con procesador Intel. Funciona casi todo, pero la transcripción de voz (mlx_whisper) necesita Apple Silicon: sin ella no hay subtítulos automáticos en Video tipo 2.",
        fix: { all: ["Para el tipo 2 usa una Mac con Apple Silicon (M1 o más nuevo)."] },
        detail: { appleSilicon: apple, arch: ctx.arch },
      }),
    );
  }
  const videos = defaultVideosDir(ctx);
  let probeDir = videos;
  while (!ctx.exists(probeDir) && ctx.P.dirname(probeDir) !== probeDir) probeDir = ctx.P.dirname(probeDir);
  try {
    const free = ctx.freeBytes(probeDir);
    const low = free < MIN_DISK_GB * 1024 ** 3;
    out.push(
      mk(ctx, {
        id: "sys.disk", section: S, label: "Espacio en disco", status: low ? "warn" : "ok",
        message: low
          ? `Solo quedan ${gb(free)} GB libres donde se guardan tus videos. Conviene tener al menos ${MIN_DISK_GB} GB.`
          : `${gb(free)} GB libres donde se guardan tus videos.`,
        fix: { all: ["Libera espacio: vacía la papelera y borra descargas o videos que ya no uses."] },
        detail: { freeGB: Number(gb(free)), folder: videos },
      }),
    );
  } catch {
    out.push(mk(ctx, { id: "sys.disk", section: S, label: "Espacio en disco", status: "skip", message: "No pude medir el espacio libre." }));
  }

  const exists = ctx.exists(videos);
  const parent = ctx.P.dirname(videos);
  const writable = exists ? ctx.canWrite(videos) : ctx.canWrite(parent);
  out.push(
    mk(ctx, {
      id: "sys.videos", section: S, label: "Carpeta de videos", required: true,
      status: !writable ? "fail" : exists ? "ok" : "warn",
      message: !writable
        ? `No puedo escribir en ${videos}.`
        : exists
          ? `Puedo guardar videos en ${videos}.`
          : `La carpeta ${videos} todavía no existe; se creará al hacer tu primer video.`,
      fix: {
        mac: ["Abre Finder, haz clic derecho en la carpeta Videos > Obtener información > Compartir y permisos, y da acceso de lectura y escritura a tu usuario."],
        win: ["En el Explorador de archivos haz clic derecho en la carpeta Videos > Propiedades > Seguridad, y da \"Control total\" a tu usuario."],
      },
      detail: { folder: videos },
    }),
  );
  if (ctx.platform === "win32") {
    const nv = await detectNvidia(ctx);
    out.push(
      nv.present
        ? mk(ctx, { id: "sys.gpu", section: S, label: "Tarjeta de video", status: "ok", message: `GPU NVIDIA detectada: ${nv.name}${nv.driver ? ` (driver ${nv.driver})` : ""}.`, detail: { gpu: nv.name, driver: nv.driver } })
        : mk(ctx, { id: "sys.gpu", section: S, label: "Tarjeta de video", status: "skip", message: "No detecté una GPU NVIDIA: el render y la transcripción usan el procesador (CPU).", detail: { gpu: null } }),
    );
  }
  return out;
}

export function checkNode(ctx) {
  const major = Number(String(ctx.nodeVersion).replace(/^v/, "").split(".")[0]);
  const ok = major >= MIN_NODE_MAJOR;
  const out = [
    mk(ctx, {
      id: "node.version", section: "motor", label: "Node.js", required: true, status: ok ? "ok" : "fail",
      message: ok ? `Node.js ${ctx.nodeVersion} instalado.` : `Tu Node.js es ${ctx.nodeVersion} y se necesita la versión ${MIN_NODE_MAJOR} o más nueva.`,
      fix: {
        mac: ["En Terminal: brew install node", "Si no tienes Homebrew, descarga el instalador LTS de https://nodejs.org"],
        win: ["En PowerShell: winget install OpenJS.NodeJS.LTS", "Luego cierra y vuelve a abrir la ventana."],
        all: ["O ejecuta: node engine/doctor.mjs --fix (te pregunto antes de instalar)."],
      },
      detail: { version: ctx.nodeVersion },
    }),
  ];
  const pc = ctx.P.join(ctx.skillRoot, "engine", "node_modules", "puppeteer-core", "package.json");
  const has = ctx.exists(pc);
  out.push(
    mk(ctx, {
      id: "node.modules", section: "motor", label: "Componentes del motor (puppeteer-core)", required: true, status: has ? "ok" : "fail",
      message: has ? "Los componentes del motor de video están instalados." : "Faltan los componentes del motor de video (carpeta node_modules).",
      fix: { all: ["Ejecuta: node engine/doctor.mjs --fix  (instala todo con tu permiso)", "O a mano: abre una terminal en la carpeta engine del skill y escribe: npm install"] },
    }),
  );
  return out;
}

export async function checkFfmpeg(ctx) {
  const S = "motor";
  const out = [];
  const installFix = {
    mac: ["En Terminal: brew install ffmpeg"],
    win: ["En PowerShell: winget install Gyan.FFmpeg", "Luego cierra y vuelve a abrir la ventana."],
    all: ["O ejecuta: node engine/doctor.mjs --fix (te pregunto antes de instalar)."],
  };
  const ffmpeg = await findBinary(ctx, "ffmpeg", { envVar: "FFMPEG" });
  if (!ffmpeg) {
    out.push(mk(ctx, { id: "ffmpeg.bin", section: S, label: "ffmpeg", required: true, status: "fail", message: "No encontré ffmpeg, el programa que arma y exporta los videos.", fix: installFix }));
  } else {
    const v = await ctx.exec(ffmpeg, ["-version"], { timeout: 15000 });
    const ver = v.ok ? (v.stdout.split(/\r?\n/)[0].match(/version\s+(\S+)/)?.[1] ?? "?") : null;
    if (!v.ok) {
      out.push(mk(ctx, { id: "ffmpeg.bin", section: S, label: "ffmpeg", required: true, status: "fail", message: "ffmpeg está instalado pero no se pudo ejecutar.", fix: installFix, detail: { path: ffmpeg } }));
    } else {
      out.push(mk(ctx, { id: "ffmpeg.bin", section: S, label: "ffmpeg", required: true, status: "ok", message: `ffmpeg ${ver} instalado.`, detail: { path: ffmpeg, version: ver } }));
      const [enc, fil] = await Promise.all([
        ctx.exec(ffmpeg, ["-hide_banner", "-encoders"], { timeout: 20000 }),
        ctx.exec(ffmpeg, ["-hide_banner", "-filters"], { timeout: 20000 }),
      ]);
      const encs = parseFfmpegList(enc.stdout, "encoders");
      const fils = parseFfmpegList(fil.stdout, "filters");
      const missE = REQUIRED_ENCODERS.filter((e) => !encs.has(e));
      const missF = REQUIRED_FILTERS.filter((f) => !fils.has(f));
      const miss = [...missE, ...missF];
      out.push(
        mk(ctx, {
          id: "ffmpeg.features", section: S, label: "ffmpeg: funciones necesarias", required: true, status: miss.length ? "fail" : "ok",
          message: miss.length ? `A tu ffmpeg le faltan funciones que usa el motor: ${miss.join(", ")}.` : "ffmpeg trae todo lo necesario (H.264, AAC, normalización de volumen).",
          fix: {
            mac: ["Reinstala la versión completa: brew reinstall ffmpeg"],
            win: ["Instala la versión completa: winget install Gyan.FFmpeg (evita versiones \"mínimas\" de ffmpeg)."],
          },
          detail: { missingEncoders: missE, missingFilters: missF },
        }),
      );
      if (ctx.platform === "win32" && (await detectNvidia(ctx)).present) {
        const hasNvenc = encs.has("h264_nvenc");
        out.push(
          mk(ctx, {
            id: "ffmpeg.nvenc", section: S, label: "ffmpeg: codificador NVIDIA (h264_nvenc)", status: hasNvenc ? "ok" : "warn",
            message: hasNvenc
              ? "ffmpeg trae h264_nvenc: el render por GPU está disponible (opcional, ver Python)."
              : "Tienes GPU NVIDIA, pero este ffmpeg no trae h264_nvenc. El render sigue funcionando con el procesador.",
            fix: { win: ["Instala la versión completa: winget install Gyan.FFmpeg (incluye h264_nvenc)."] },
            detail: { present: hasNvenc },
          }),
        );
      }
    }
  }
  const ffprobe = await findBinary(ctx, "ffprobe", { envVar: "FFPROBE" });
  out.push(
    ffprobe
      ? mk(ctx, { id: "ffprobe.bin", section: S, label: "ffprobe", required: true, status: "ok", message: "ffprobe instalado.", detail: { path: ffprobe } })
      : mk(ctx, { id: "ffprobe.bin", section: S, label: "ffprobe", required: true, status: "fail", message: "No encontré ffprobe (viene junto con ffmpeg).", fix: installFix }),
  );
  return out;
}

export function checkBrowser(ctx) {
  const S = "navegador";
  const fix = {
    mac: ["En Terminal: brew install --cask google-chrome", "O descárgalo de https://www.google.com/chrome"],
    win: ["En PowerShell: winget install Google.Chrome", "O descárgalo de https://www.google.com/chrome"],
    all: ["O ejecuta: node engine/doctor.mjs --fix (te pregunto antes de instalar)."],
  };
  const custom = ctx.env.CHROME;
  if (custom && ctx.exists(custom)) {
    return mk(ctx, { id: "browser", section: S, label: "Navegador", required: true, status: "ok", message: "Usaré el navegador que indicaste en la variable CHROME.", detail: { kind: "custom", path: custom } });
  }
  const found = chromeCandidates(ctx).filter((c) => ctx.exists(c.path));
  const chrome = found.find((c) => c.kind === "chrome");
  const staleNote = custom ? " (la variable CHROME apunta a un archivo que no existe)" : "";
  if (chrome) {
    return mk(ctx, { id: "browser", section: S, label: "Navegador", required: true, status: "ok", message: `Google Chrome encontrado${staleNote}.`, detail: { kind: "chrome", path: chrome.path } });
  }
  return mk(ctx, { id: "browser", section: S, label: "Navegador", required: true, status: "fail", message: `No encontré Google Chrome${staleNote}. Lo necesito para dibujar los cuadros del video.`, fix });
}

/** Windows Python checks: faster-whisper (transcription), OpenCV + YuNet model (faces) and the optional NVIDIA acceleration. */
export async function checkWinPython(ctx, c) {
  const S = "python";
  const opt = c.optional ?? {};
  const out = [];
  const fw = !!opt.faster_whisper;
  out.push(
    mk(ctx, {
      id: "py.transcribe", section: S, label: "Transcripción de voz (faster-whisper)", status: fw ? "ok" : "warn",
      message: fw
        ? "Transcripción disponible (faster-whisper)."
        : "faster-whisper no está instalado. Sin él no se pueden poner subtítulos automáticos ni cortar muletillas en Video tipo 2.",
      fix: { all: ["Ejecuta: node engine/doctor.mjs --fix (instala faster-whisper en el entorno del skill)", "O a mano: python scripts/setup_python.py"] },
      detail: { available: fw, backend: "faster_whisper" },
    }),
  );
  const cv = !!opt.cv2;
  const model = faceModelPath(ctx);
  const hasModel = ctx.exists(model);
  out.push(
    mk(ctx, {
      id: "py.faces", section: S, label: "Detección de caras (OpenCV YuNet)", status: cv && hasModel ? "ok" : "warn",
      message: cv && hasModel
        ? "Detección de caras disponible: los textos esquivan la cara."
        : !cv
          ? "OpenCV no está instalado (opcional). Sin él los textos se colocan en una caja centrada en vez de esquivar la cara."
          : `Falta el modelo de detección de caras (${model}). Sin él los textos se colocan en una caja centrada.`,
      fix: { all: ["Ejecuta: node engine/doctor.mjs --fix (instala OpenCV y descarga el modelo de caras)", "O a mano: python scripts/setup_python.py"] },
      detail: { opencv: cv, model: hasModel },
    }),
  );
  const nv = await detectNvidia(ctx);
  if (nv.present) {
    out.push(
      mk(ctx, {
        id: "py.gpu", section: S, label: "Aceleración por GPU NVIDIA (opcional)", status: "warn",
        message: `GPU NVIDIA detectada (${nv.name}). La aceleración con CUDA es opcional; desde aquí no puedo comprobar si ya está activa.`,
        fix: {
          all: [
            "Opcional, una sola vez: python scripts/setup_python.py --gpu (instala onnxruntime-gpu y las librerías CUDA de cuBLAS y cuDNN en el entorno del skill).",
            "Para renderizar con la GPU define la variable de entorno ESTUDIO_VIDEO_ENCODER=h264_nvenc (sin ella se usa libx264 en el procesador).",
          ],
        },
        detail: { gpu: nv.name },
      }),
    );
  }
  return out;
}

export async function checkPython(ctx) {
  const S = "python";
  const res = await resolvePython(ctx);
  const out = [];
  const venvFix = {
    all: ["Ejecuta: node engine/doctor.mjs --fix (crea el entorno de Python del skill y descarga los paquetes, con tu permiso)."],
  };
  const c = res.chosen;
  if (!c) {
    const install = {
      mac: ["En Terminal: brew install python@3.12"],
      win: ["En PowerShell: winget install Python.Python.3.12", "Durante la instalación marca \"Add python.exe to PATH\" si te lo pregunta."],
      ...venvFix,
    };
    out.push(mk(ctx, { id: "py.version", section: S, label: "Python", required: true, status: "fail", message: "No encontré Python instalado.", fix: install, detail: { tried: res.tried.map((t) => ({ label: t.label, works: t.works })) } }));
    out.push(mk(ctx, { id: "py.required", section: S, label: "Paquetes de Python", required: true, status: "skip", message: "Se revisan cuando haya un Python disponible." }));
    return { checks: out, python: res };
  }
  const vOk = versionAtLeast(c.version, MIN_PY);
  const vs = c.version.join(".");
  out.push(
    mk(ctx, {
      id: "py.version", section: S, label: "Python", required: true, status: vOk ? "ok" : "fail",
      message: vOk ? `Python ${vs} (${c.label}).` : `Tu Python es ${vs} y se necesita ${MIN_PY.join(".")} o más nuevo.`,
      fix: { mac: ["En Terminal: brew install python@3.12"], win: ["En PowerShell: winget install Python.Python.3.12"], ...venvFix },
      detail: { version: vs, interpreter: c.label, source: c.source },
    }),
  );
  const missPip = c.missing.map((m) => PY_REQUIRED.find((p) => p.mod === m)?.pip ?? m);
  out.push(
    mk(ctx, {
      id: "py.required", section: S, label: "Paquetes de Python (imágenes, red, audio)", required: true, status: c.missing.length ? "fail" : "ok",
      message: c.missing.length ? `Faltan paquetes de Python: ${missPip.join(", ")}.` : "Los paquetes de Python necesarios están instalados.",
      fix: { ...venvFix, all: [...venvFix.all, "O a mano: python3 scripts/setup_python.py"] },
      detail: { missing: missPip },
    }),
  );
  const opt = c.optional ?? {};
  if (ctx.platform === "win32") {
    out.push(...(await checkWinPython(ctx, c)));
  } else {
    const apple = isAppleSilicon(ctx);
    out.push(
      mk(ctx, {
        id: "py.transcribe", section: S, label: "Transcripción de voz (mlx_whisper)", status: apple && opt.mlx_whisper ? "ok" : "warn",
        message: !apple
          ? "La transcripción (mlx_whisper) necesita una Mac con Apple Silicon; en este Mac no está disponible. Sin ella no hay subtítulos automáticos ni corte de muletillas en Video tipo 2."
          : opt.mlx_whisper
            ? "Transcripción disponible (mlx_whisper)."
            : "mlx_whisper no está instalado. Sin él no se pueden poner subtítulos automáticos ni cortar muletillas en Video tipo 2.",
        fix: apple ? { all: ["Ejecuta: node engine/doctor.mjs --fix (instala mlx-whisper en el entorno del skill)", "O a mano: python3 scripts/setup_python.py"] } : { all: ["Usa una Mac con Apple Silicon para el Video tipo 2."] },
        detail: { available: apple && !!opt.mlx_whisper, appleSilicon: apple },
      }),
    );
  }
  out.push(
    mk(ctx, {
      id: "py.rembg", section: S, label: "Quitar fondos (opcional)", status: opt.rembg ? "ok" : "warn",
      message: opt.rembg ? "rembg instalado." : "rembg no está instalado: no podré recortar fondos de fotos de producto automáticamente.",
      fix: { all: ["Ejecuta: node engine/doctor.mjs --fix (instala rembg en el entorno del skill)", "O a mano: python3 scripts/setup_python.py"] },
    }),
  );
  return { checks: out, python: res };
}

export async function checkOptionalTools(ctx, mcpServers) {
  const S = "opcionales";
  const out = [];
  // earshot (optional, ~2.5 GB, not distributable). Windows: <home>\.venv\Scripts\earshot.exe
  if (ctx.platform === "win32") {
    const home = ctx.env.EARSHOT_HOME ? ctx.env.EARSHOT_HOME : ctx.P.join(ctx.homedir, "tools", "earshot");
    const has = ctx.exists(ctx.P.join(home, ".venv", "Scripts", "earshot.exe"));
    out.push(
      mk(ctx, {
        id: "opt.earshot", section: S, label: "earshot (efectos de sonido avanzados)", status: has ? "ok" : "warn",
        message: has ? "earshot instalado." : "earshot no está instalado (opcional). Sin él no se generan efectos de sonido a la medida ni la mezcla avanzada de música y efectos.",
        fix: { all: ["Es una herramienta interna de Reda que no se distribuye con el skill; pregunta a tu contacto en Reda si la necesitas."] },
      }),
    );
  } else if (ctx.platform === "darwin") {
    const home = ctx.env.EARSHOT_HOME ? ctx.env.EARSHOT_HOME : ctx.P.join(ctx.homedir, "tools", "earshot");
    const has = ctx.exists(ctx.P.join(home, ".venv", "bin", "earshot"));
    out.push(
      mk(ctx, {
        id: "opt.earshot", section: S, label: "earshot (efectos de sonido avanzados)", status: has ? "ok" : "warn",
        message: has ? "earshot instalado." : "earshot no está instalado (opcional, solo Mac). Sin él no se generan efectos de sonido a la medida ni la mezcla avanzada de música y efectos.",
        fix: { all: ["Es una herramienta interna de Reda que no se distribuye con el skill; pregunta a tu contacto en Reda si la necesitas."] },
      }),
    );
  } else {
    out.push(mk(ctx, { id: "opt.earshot", section: S, label: "earshot (efectos de sonido avanzados)", status: "skip", message: "Solo existe para Mac; en tu sistema se usa el kit de efectos incluido." }));
  }
  // swift / Apple Vision
  if (ctx.platform === "darwin") {
    const sw = await findBinary(ctx, "swiftc", { extraDirs: ["/usr/bin"] });
    out.push(
      mk(ctx, {
        id: "opt.swift", section: S, label: "Swift (detección de caras)", status: sw ? "ok" : "warn",
        message: sw ? "Swift disponible: los textos esquivan la cara automáticamente." : "Swift no está instalado (opcional). Sin él los textos se colocan en una caja centrada en vez de esquivar la cara.",
        fix: { mac: ["En Terminal: xcode-select --install"] },
      }),
    );
  } else if (ctx.platform === "win32") {
    out.push(mk(ctx, { id: "opt.swift", section: S, label: "Swift (detección de caras)", status: "skip", message: "Solo existe para Mac; en Windows la detección de caras usa OpenCV (ver Python)." }));
  } else {
    out.push(mk(ctx, { id: "opt.swift", section: S, label: "Swift (detección de caras)", status: "skip", message: "Solo existe para Mac; en tu sistema los textos se colocan en una caja centrada." }));
  }
  // Windows: audio-studio (local, MLX/Apple-only) does not exist; music comes from Eleven Music (connector or key).
  if (ctx.platform === "win32") {
    out.push(mk(ctx, { id: "opt.audio-studio", section: S, label: "audio-studio (música y efectos locales)", status: "skip", message: "audio-studio no está disponible en Windows (es local y solo corre en Mac con Apple Silicon)." }));
    const connector = mcpServers ? findConnector(mcpServers, CONNECTORS.elevenlabs.re)?.status === "connected" : false;
    const haveEleven = lookupElevenKey(ctx).present || connector;
    out.push(
      mk(ctx, {
        id: "opt.music", section: S, label: "Música (Eleven Music)", status: haveEleven ? "ok" : "warn",
        message: haveEleven
          ? "Música disponible con Eleven Music (conector de ElevenLabs o tu llave)."
          : "Sin conector ni llave de ElevenLabs no hay música de fondo generada. Sin ella el video sale sin música.",
        fix: { all: ["Conecta ElevenLabs en claude.ai > Configuración > Conectores, o guarda tu llave (ver la sección Llaves y cuentas)."] },
      }),
    );
  } else if (!mcpServers) {
    out.push(mk(ctx, { id: "opt.audio-studio", section: S, label: "audio-studio (música y efectos locales)", status: "skip", message: "No se revisó porque se omitió la revisión de Claude." }));
  } else {
    const a = mcpServers.find((s) => /audio-studio/i.test(s.name));
    out.push(
      mk(ctx, {
        id: "opt.audio-studio", section: S, label: "audio-studio (música y efectos locales)", status: a?.status === "connected" ? "ok" : "warn",
        message: a?.status === "connected"
          ? "audio-studio conectado."
          : "audio-studio no está conectado (opcional, solo Mac con GPU). Sin él la música de fondo y los efectos locales no se generan; puedes usar los efectos incluidos o la música de ElevenLabs.",
        fix: { all: ["Es opcional. Si lo tienes instalado, en Claude Code escribe /mcp y revisa que audio-studio esté activo."] },
      }),
    );
  }
  return out;
}

export async function checkElevenLabs(ctx, { online }) {
  const S = "secretos";
  const found = lookupElevenKey(ctx);
  const file = elevenKeyFile(ctx);
  const fix = {
    mac: [`Crea el archivo ${file} con una línea: ${ELEVEN_KEY_VAR}=tu_llave  (tu llave está en elevenlabs.io > tu perfil > API Keys)`, `Luego protégelo: chmod 600 ${file}`],
    win: [`Crea el archivo ${file} con una línea: ${ELEVEN_KEY_VAR}=tu_llave  (tu llave está en elevenlabs.io > tu perfil > API Keys)`, "O guárdala como variable de entorno de usuario: Inicio > \"Editar las variables de entorno de esta cuenta\"."],
    all: ["La llave nunca se muestra aquí ni se guarda dentro del skill."],
  };
  const out = [];
  out.push(
    mk(ctx, {
      id: "secret.elevenlabs", section: S, label: "Llave de ElevenLabs", status: found.present ? "ok" : "warn",
      message: found.present ? `Llave presente (${found.source === "env" ? "variable de entorno" : "archivo de configuración"}).` : "Llave ausente. Sin ella no se puede generar la voz en off de los videos tipo 1 y 2.",
      fix,
      detail: { present: found.present, source: found.source },
    }),
  );
  if (!found.present) {
    out.push(mk(ctx, { id: "secret.elevenlabs.online", section: S, label: "Llave de ElevenLabs: validación", status: "skip", message: "No hay llave que validar." }));
  } else if (!online) {
    out.push(mk(ctx, { id: "secret.elevenlabs.online", section: S, label: "Llave de ElevenLabs: validación", status: "skip", message: "No se validó en línea. Corre el diagnóstico con --online para comprobar que la llave funciona (no cuesta nada)." }));
  } else {
    out.push(await validateElevenKey(ctx, found.key));
  }
  return out;
}

export async function validateElevenKey(ctx, key) {
  const base = { id: "secret.elevenlabs.online", section: "secretos", label: "Llave de ElevenLabs: validación" };
  const invalidFix = { all: ["Revisa que la llave esté completa y vigente en elevenlabs.io > tu perfil > API Keys; si hace falta, crea una nueva."] };
  const get = async (url) => ctx.fetch(url, { method: "GET", headers: { "xi-api-key": key } });
  try {
    let r = await get("https://api.elevenlabs.io/v1/user");
    if (r.status === 401) {
      // restricted keys may lack the "user_read" permission: a free models listing tells us if the key itself is valid
      let body = "";
      try {
        body = await r.text();
      } catch {
        /* ignore */
      }
      if (/missing_permissions/i.test(body)) {
        const r2 = await get("https://api.elevenlabs.io/v1/models");
        if (r2.ok) return mk(ctx, { ...base, status: "ok", message: "La llave es válida (no tiene permiso para consultar tu saldo de caracteres)." });
      }
      return mk(ctx, { ...base, status: "warn", message: "ElevenLabs dice que la llave no es válida.", fix: invalidFix, detail: { valid: false } });
    }
    if (!r.ok) return mk(ctx, { ...base, status: "warn", message: `No pude validar la llave ahora (ElevenLabs respondió ${r.status}). Intenta más tarde.`, detail: { httpStatus: r.status } });
    let j = null;
    try {
      j = await r.json();
    } catch {
      /* no body */
    }
    const sub = j?.subscription;
    const left = sub && Number.isFinite(sub.character_limit) && Number.isFinite(sub.character_count) ? sub.character_limit - sub.character_count : null;
    return mk(ctx, {
      ...base, status: "ok",
      message: left !== null ? `La llave es válida. Te quedan ${left.toLocaleString("es-MX")} caracteres de voz este periodo.` : "La llave es válida.",
      detail: { valid: true, charactersRemaining: left },
    });
  } catch (e) {
    return mk(ctx, { ...base, status: "warn", message: "No pude conectar con ElevenLabs para validar la llave (¿sin internet?).", detail: { error: e?.name ?? "error" } });
  }
}

// ----- Claude CLI + connectors -----

export async function findClaude(ctx) {
  return findBinary(ctx, "claude", { extraDirs: [ctx.P.join(ctx.homedir, ".local", "bin")] });
}

function killTree(ctx, child) {
  try {
    if (ctx.platform === "win32" && child.pid) {
      execFile("taskkill", ["/pid", String(child.pid), "/t", "/f"], { windowsHide: true }, () => {});
    } else {
      child.kill("SIGTERM");
    }
  } catch {
    /* already gone */
  }
}

/** Starts `claude -p ok --output-format stream-json --verbose --max-turns 1`, resolves at the first system/init line and kills OUR child. */
export function probeClaudeOnce(ctx, claudePath) {
  return new Promise((resolve) => {
    let done = false;
    let buf = "";
    const finish = (r) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(r);
    };
    let child;
    try {
      child = ctx.spawn(claudePath, ["-p", "ok", "--output-format", "stream-json", "--verbose", "--max-turns", "1", "--no-session-persistence"], { cwd: os.tmpdir() });
    } catch (e) {
      return resolve({ ok: false, reason: "spawn", servers: [] });
    }
    const timer = setTimeout(() => {
      killTree(ctx, child);
      finish({ ok: false, reason: "timeout", servers: [] });
    }, ctx.probeMs);
    child.on?.("error", () => finish({ ok: false, reason: "spawn", servers: [] }));
    child.on?.("close", () => finish({ ok: false, reason: "no-init", servers: [] }));
    child.stdout?.on("data", (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 1);
        const ev = line.trim() ? parseInitEvent(line) : null;
        if (ev) {
          killTree(ctx, child); // we have what we need: stop before the model call costs anything
          finish({ ok: true, servers: summarizeMcp(ev), version: ev.claude_code_version });
        }
      }
    });
  });
}

/** Union of init snapshots by server name: the latest settled status wins; "pending" only stays if it was never settled. */
export function mergeServers(snapshots) {
  const by = new Map();
  for (const list of snapshots) {
    for (const s of list) {
      const prev = by.get(s.name);
      if (!prev || s.status !== "pending") by.set(s.name, s);
    }
  }
  return [...by.values()];
}

/**
 * claude.ai connectors load in the background: a fresh init event may list them as "pending" or not list them at all
 * (observed with Claude Code 2.1.308). Retry a few times until a claude.ai server is known and none of ours is pending.
 */
export async function probeClaude(ctx, claudePath, { attempts = 4 } = {}) {
  const snaps = [];
  let version;
  let lastFail = null;
  let n = 0;
  for (let i = 0; i < attempts; i += 1) {
    n = i + 1;
    const r = await probeClaudeOnce(ctx, claudePath);
    if (!r.ok) {
      lastFail = r;
      if (r.reason === "timeout" || r.reason === "spawn") break;
    } else {
      snaps.push(r.servers);
      version = r.version ?? version;
      const merged = mergeServers(snaps);
      if (!hasPending(merged) && merged.some((s) => s.source === "claudeai")) break;
    }
    if (i < attempts - 1) await ctx.sleep(ctx.probeRetryMs);
  }
  if (!snaps.length) return { ...(lastFail ?? { ok: false, reason: "no-init", servers: [] }), attempts: n };
  return { ok: true, servers: mergeServers(snaps), version, attempts: n };
}

const CONNECT_FIX = (name) => ({
  all: [
    `Abre claude.ai > Configuración > Conectores > ${name} > Conectar, e inicia sesión con tu cuenta de ${name}.`,
    "Luego, en Claude Code, escribe /mcp y revisa que aparezca como conectado.",
  ],
});

function connectorCheck(ctx, key, servers, { capability }) {
  const c = CONNECTORS[key];
  const base = { id: `claude.${key}`, section: "claude", label: `Conector ${c.label}` };
  if (!servers) return mk(ctx, { ...base, status: "skip", message: "No se pudo comprobar (falta la revisión de Claude)." });
  const s = findConnector(servers, c.re);
  if (!s) {
    return mk(ctx, { ...base, status: "warn", message: `El conector de ${c.label} no aparece en tu Claude. ${capability}`, fix: CONNECT_FIX(c.label), detail: { status: "absent" } });
  }
  if (s.status === "connected") return mk(ctx, { ...base, status: "ok", message: `${c.label} conectado.`, detail: { status: s.status } });
  const msg = {
    "needs-auth": `${c.label} necesita que inicies sesión. ${capability}`,
    pending: `${c.label} todavía se estaba conectando cuando revisé. Vuelve a correr el diagnóstico en unos segundos.`,
    failed: `${c.label} no pudo conectarse. ${capability}`,
  }[s.status] ?? `${c.label} está en estado "${s.status}". ${capability}`;
  const fix = s.status === "pending" ? { all: ["Espera unos segundos y corre el diagnóstico otra vez."] } : CONNECT_FIX(c.label);
  return mk(ctx, { ...base, status: "warn", message: msg, fix, detail: { status: s.status } });
}

export async function checkClaude(ctx, { skip, online }) {
  const S = "claude";
  const out = [];
  let servers = null;
  if (skip) {
    out.push(mk(ctx, { id: "claude.cli", section: S, label: "Claude Code", status: "skip", message: "Revisión omitida (--skip-claude)." }));
    for (const k of ["higgsfield", "reda", "elevenlabs"]) out.push(connectorCheck(ctx, k, null, { capability: "" }));
    return { checks: out, servers };
  }
  const claude = await findClaude(ctx);
  if (!claude) {
    out.push(
      mk(ctx, {
        id: "claude.cli", section: S, label: "Claude Code", status: "warn",
        message: "No encontré el comando \"claude\". Sin él no puedo comprobar tus conectores (Higgsfield, Reda, ElevenLabs).",
        fix: {
          mac: ["Instala Claude Code: en Terminal, curl -fsSL https://claude.ai/install.sh | bash", "O desde la app de Claude Desktop, pestaña Code."],
          win: ["Instala Claude Code: en PowerShell, irm https://claude.ai/install.ps1 | iex", "O desde la app de Claude Desktop, pestaña Code."],
        },
      }),
    );
    for (const k of ["higgsfield", "reda", "elevenlabs"]) out.push(connectorCheck(ctx, k, null, { capability: "" }));
    return { checks: out, servers };
  }
  const v = await ctx.exec(claude, ["--version"], { timeout: 15000 });
  const ver = v.ok ? v.stdout.trim().split(/\s+/)[0] : null;
  out.push(
    v.ok
      ? mk(ctx, { id: "claude.cli", section: S, label: "Claude Code", status: "ok", message: `Claude Code ${ver} instalado.`, detail: { version: ver, path: claude } })
      : mk(ctx, { id: "claude.cli", section: S, label: "Claude Code", status: "warn", message: "Claude Code está instalado pero no respondió.", detail: { path: claude } }),
  );
  if (!v.ok) {
    for (const k of ["higgsfield", "reda", "elevenlabs"]) out.push(connectorCheck(ctx, k, null, { capability: "" }));
    return { checks: out, servers };
  }
  const probe = await probeClaude(ctx, claude);
  if (!probe.ok) {
    const why = probe.reason === "timeout" ? "tardó demasiado" : "no pude leer su estado";
    out.push(mk(ctx, { id: "claude.probe", section: S, label: "Estado de conectores", status: "warn", message: `Claude Code ${why}. Puede que no hayas iniciado sesión.`, fix: { all: ["Abre Claude Code y escribe /login para iniciar sesión; después corre el diagnóstico otra vez."] } }));
    for (const k of ["higgsfield", "reda", "elevenlabs"]) out.push(connectorCheck(ctx, k, null, { capability: "" }));
    return { checks: out, servers };
  }
  servers = probe.servers;
  out.push(connectorCheck(ctx, "higgsfield", servers, { capability: "Sin él no se pueden generar videos con IA (Video tipo 3)." }));
  out.push(connectorCheck(ctx, "reda", servers, { capability: "Sin él no se conecta con tu cuenta de Reda." }));
  const eleven = connectorCheck(ctx, "elevenlabs", servers, { capability: "Es opcional: también puedes usar tu llave de ElevenLabs." });
  if (eleven.status === "warn" && eleven.detail?.status === "absent") eleven.message = "El conector de ElevenLabs no aparece. Es opcional: con tu llave de ElevenLabs basta para la voz.";
  out.push(eleven);
  out.push(await checkRedaStaging(ctx, online));
  return { checks: out, servers };
}

/** Informational: Reda's OAuth metadata currently points at a staging AuthKit server. Free unauthenticated GET, only with --online. */
export async function checkRedaStaging(ctx, online) {
  const base = { id: "claude.reda.staging", section: "claude", label: "Reda: servidor de inicio de sesión" };
  if (!online) return mk(ctx, { ...base, status: "skip", message: "No se revisó (usa --online)." });
  try {
    const r = await ctx.fetch("https://mcp.reda.mx/.well-known/oauth-protected-resource", { method: "GET" });
    if (!r.ok) return mk(ctx, { ...base, status: "skip", message: "No pude consultar el servidor de Reda." });
    const j = await r.json();
    const servers = Array.isArray(j?.authorization_servers) ? j.authorization_servers.map(String) : [];
    const staging = servers.find((s) => /staging/i.test(s));
    if (staging) {
      return mk(ctx, {
        ...base, status: "warn",
        message: "Aviso informativo: el inicio de sesión de Reda apunta hoy a un servidor de pruebas (staging). Puede funcionar, pero avisa a Reda si tu sesión falla o se pierde seguido.",
        fix: { all: ["No tienes que hacer nada. Si Reda no se conecta, comenta este aviso con tu contacto en Reda."] },
        detail: { staging: true },
      });
    }
    return mk(ctx, { ...base, status: "ok", message: "El inicio de sesión de Reda usa su servidor normal.", detail: { staging: false } });
  } catch {
    return mk(ctx, { ...base, status: "skip", message: "No pude consultar el servidor de Reda (¿sin internet?)." });
  }
}

// ----- Codex (optional second runtime; connectors are NOT synced from claude.ai) -----

/** First column of each row of `codex mcp list` (names only: the rest of the table can contain env hints). */
export function parseCodexMcpNames(stdout) {
  const names = [];
  for (const line of String(stdout).split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    const first = t.split(/\s+/)[0];
    if (first && first !== "Name") names.push(first);
  }
  return names;
}

export async function checkCodex(ctx, { skip }) {
  const S = "codex";
  const base = { section: S };
  if (skip) return [mk(ctx, { ...base, id: "codex.cli", label: "Codex", status: "skip", message: "Revisión omitida (--skip-claude)." })];
  const bin = await findBinary(ctx, "codex", { extraDirs: [ctx.P.join(ctx.homedir, ".local", "bin")] });
  if (!bin) return [mk(ctx, { ...base, id: "codex.cli", label: "Codex", status: "skip", message: "Codex no está instalado. Es opcional: solo lo necesitas si vas a trabajar desde Codex en lugar de Claude." })];
  const out = [mk(ctx, { ...base, id: "codex.cli", label: "Codex", status: "ok", message: "Codex instalado.", detail: { path: bin } })];
  const r = await ctx.exec(bin, ["mcp", "list"], { timeout: 20000 });
  if (!r.ok) {
    out.push(mk(ctx, { ...base, id: "codex.mcp", label: "Conectores de Codex", status: "warn", message: "No pude leer la lista de conectores de Codex." }));
    return out;
  }
  const names = parseCodexMcpNames(r.stdout);
  for (const key of ["reda", "higgsfield"]) {
    const c = CONNECTORS[key];
    const has = names.some((n) => c.re.test(n));
    out.push(
      mk(ctx, {
        ...base, id: `codex.${key}`, label: `Codex: ${c.label}`, status: has ? "ok" : "warn",
        message: has
          ? `${c.label} está agregado en Codex (solo compruebo que exista; no puedo confirmar que tu sesión siga activa).`
          : `${c.label} no está agregado en Codex. Los conectores de Claude no se comparten con Codex: cada persona los conecta una vez.`,
        fix: { all: [`En Terminal: codex mcp login ${key}`, "Se abre el navegador para que inicies sesión; después vuelve a correr el diagnóstico."] },
        detail: { present: has },
      }),
    );
  }
  return out;
}

// ----- Skill config -----

export function checkSkillConfig(ctx) {
  const S = "skill";
  const out = [];
  const cfgPath = ctx.P.join(ctx.skillRoot, "engine", "studio", "config.json");
  let cfgOk = false;
  let why = "";
  if (!ctx.exists(cfgPath)) why = "No encuentro engine/studio/config.json.";
  else {
    try {
      const j = JSON.parse(ctx.readText(cfgPath));
      if (!j || typeof j !== "object" || !j.higgsfield || !j.elevenlabs) why = "config.json no tiene las secciones higgsfield y elevenlabs.";
      else cfgOk = true;
    } catch {
      why = "config.json no es un JSON válido.";
    }
  }
  out.push(
    mk(ctx, {
      id: "skill.config", section: S, label: "Configuración del Estudio", required: true, status: cfgOk ? "ok" : "fail",
      message: cfgOk ? "La configuración del Estudio está en orden." : why,
      fix: { all: ["Reinstala o actualiza el skill para restaurar el archivo engine/studio/config.json."] },
    }),
  );
  const brandsDir = ctx.P.join(ctx.skillRoot, "brands");
  const names = ctx.listDirs(brandsDir).filter((n) => !n.startsWith("_") && !n.startsWith("."));
  const configured = names.filter((n) => ctx.exists(ctx.P.join(brandsDir, n, "brand.json")));
  const hasDir = ctx.exists(brandsDir);
  out.push(
    mk(ctx, {
      id: "skill.brands", section: S, label: "Marcas", status: configured.length ? "ok" : "warn",
      message: !hasDir
        ? "No existe la carpeta de marcas (brands)."
        : configured.length
          ? `${configured.length} marca${configured.length === 1 ? "" : "s"} configurada${configured.length === 1 ? "" : "s"}: ${configured.join(", ")}.`
          : "Todavía no hay ninguna marca configurada. Es normal la primera vez: al pedir tu primer video, el asistente te hace unas preguntas para crearla.",
      fix: { all: ["Pídele a Claude: \"quiero hacer un video con el estudio de video\" y responde las preguntas de identidad de marca."] },
      detail: { brands: configured },
    }),
  );
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Readiness
// ---------------------------------------------------------------------------------------------------------------

const byId = (checks) => Object.fromEntries(checks.map((c) => [c.id, c]));
const usable = (c) => c && (c.status === "ok" || c.status === "warn");

export function computeReadiness(checks) {
  const c = byId(checks);
  const why = (id, text, okFn = (x) => x?.status === "ok") => (okFn(c[id]) ? null : c[id]?.status === "skip" ? `${text}, sin comprobar` : text);
  const core = [
    why("node.version", "Node.js", usable),
    why("node.modules", "componentes del motor", usable),
    why("ffmpeg.bin", "ffmpeg", usable),
    why("ffmpeg.features", "funciones de ffmpeg", usable),
    why("ffprobe.bin", "ffprobe", usable),
    why("browser", "Google Chrome", usable),
    why("py.version", "Python", usable),
    why("py.required", "paquetes de Python", usable),
  ].filter(Boolean);
  const voice = why("secret.elevenlabs", "llave de ElevenLabs", (x) => x?.status === "ok") ?? null;
  const voiceOnline = c["secret.elevenlabs.online"]?.status === "warn" ? "la llave de ElevenLabs no es válida" : null;
  const voiceMissing = voice || voiceOnline;
  const transcribe = why("py.transcribe", "transcripción de voz");
  const higgs = why("claude.higgsfield", "conector de Higgsfield");
  const mk3 = (label, id, extra) => {
    const missing = [...core, ...extra.filter(Boolean)];
    return { id, label, ready: missing.length === 0, missing };
  };
  return [
    mk3("Video tipo 1 (motion)", "tipo1", [voiceMissing]),
    mk3("Video tipo 2 (video real editado)", "tipo2", [transcribe]),
    mk3("Video tipo 3 (100 % IA)", "tipo3", [higgs]),
    {
      id: "estudio", label: "Estudio (editor local)",
      ready: ["node.version", "node.modules", "browser", "py.version", "py.required"].every((id) => usable(c[id])),
      missing: [why("node.version", "Node.js", usable), why("node.modules", "componentes del motor", usable), why("browser", "Google Chrome", usable), why("py.version", "Python", usable), why("py.required", "paquetes de Python", usable)].filter(Boolean),
    },
  ];
}

// ---------------------------------------------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------------------------------------------

export async function runChecks(ctx, opts = {}) {
  if (!SUPPORTED_PLATFORMS.includes(ctx.platform) && !opts.allPlatforms) {
    const os = (await checkSystem(ctx)).slice(0, 1);
    const readiness = [
      { id: "tipo1", label: "Video tipo 1 (motion)" },
      { id: "tipo2", label: "Video tipo 2 (video real editado)" },
      { id: "tipo3", label: "Video tipo 3 (100 % IA)" },
      { id: "estudio", label: "Estudio (editor local)" },
    ].map((r) => ({ ...r, ready: false, missing: ["sistema no compatible por ahora"] }));
    return { version: 1, timestamp: new Date(ctx.now()).toISOString(), platform: ctx.platform, arch: ctx.arch, dataDir: dataDir(ctx), ok: false, allGreen: false, checks: os, readiness, python: null };
  }
  if (ctx.platform === "darwin" && ctx.hwArm64 === undefined) {
    const r = await ctx.exec("sysctl", ["-n", "hw.optional.arm64"], { timeout: 5000 });
    ctx.hwArm64 = r.ok && r.stdout.trim() === "1";
  }
  const checks = [];
  checks.push(...(await checkSystem(ctx)));
  checks.push(...checkNode(ctx));
  checks.push(...(await checkFfmpeg(ctx)));
  checks.push(checkBrowser(ctx));
  const py = await checkPython(ctx);
  checks.push(...py.checks);
  const cl = await checkClaude(ctx, { skip: !!opts.skipClaude, online: !!opts.online });
  checks.push(...(await checkOptionalTools(ctx, cl.servers)));
  checks.push(...(await checkElevenLabs(ctx, { online: !!opts.online })));
  checks.push(...cl.checks);
  checks.push(...(await checkCodex(ctx, { skip: !!opts.skipClaude })));
  checks.push(...checkSkillConfig(ctx));
  const readiness = computeReadiness(checks);
  const ok = !checks.some((c) => c.required && c.status === "fail");
  const allGreen = ok && readiness.every((r) => r.ready);
  return {
    version: 1,
    timestamp: new Date(ctx.now()).toISOString(),
    platform: ctx.platform,
    arch: ctx.arch,
    dataDir: dataDir(ctx),
    ok,
    allGreen,
    checks,
    readiness,
    python: py.python?.chosen ? { interpreter: py.python.chosen.cmd === "py" ? "py -3" : py.python.chosen.label, version: py.python.chosen.version?.join(".") } : null,
  };
}

export const cachePath = (ctx) => ctx.P.join(dataDir(ctx), "doctor-last.json");

export function writeCache(ctx, result) {
  try {
    ctx.writeText(
      cachePath(ctx),
      JSON.stringify({ timestamp: result.timestamp, ok: result.ok, allGreen: result.allGreen, platform: result.platform, readiness: Object.fromEntries(result.readiness.map((r) => [r.id, r.ready])) }, null, 2),
    );
    return true;
  } catch {
    return false;
  }
}

/** If doctor-last.json is < 7 days old and was all green, returns {skipped:true,...}. */
export function readFreshCache(ctx) {
  try {
    const p = cachePath(ctx);
    if (!ctx.exists(p)) return null;
    const j = JSON.parse(ctx.readText(p));
    const age = ctx.now() - Date.parse(j.timestamp);
    if (j.allGreen && Number.isFinite(age) && age >= 0 && age < CACHE_DAYS * 86400000) return { skipped: true, lastRun: j.timestamp, ageDays: Number((age / 86400000).toFixed(1)), allGreen: true };
  } catch {
    /* ignore */
  }
  return null;
}

// ---------------------------------------------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------------------------------------------

export function formatReport(result, { color = false } = {}) {
  const c = (code, s) => (color ? `\u001b[${code}m${s}\u001b[0m` : s);
  const icon = { ok: c(32, "✓"), warn: c(33, "⚠"), fail: c(31, "✗"), skip: c(90, "–") };
  const lines = [];
  lines.push(c(1, "Diagnóstico de Estudio de video"));
  lines.push(c(90, `${result.platform === "darwin" ? "macOS" : result.platform === "win32" ? "Windows" : result.platform} · ${result.arch}`));
  for (const [sec, title] of Object.entries(SECTIONS)) {
    const items = result.checks.filter((x) => x.section === sec);
    if (!items.length) continue;
    lines.push("", c(1, title));
    for (const x of items) {
      lines.push(`  ${icon[x.status]} ${x.label}: ${x.message}`);
      if (x.fix.length) {
        lines.push(c(90, "      Cómo arreglarlo:"));
        for (const f of x.fix) lines.push(c(90, `        - ${f}`));
      }
    }
  }
  lines.push("", c(1, "Resumen"));
  lines.push(`  Listo para:`);
  for (const r of result.readiness) {
    lines.push(`    ${r.ready ? icon.ok : icon.fail} ${r.label}${r.ready ? "" : ` — falta: ${r.missing.join("; ")}`}`);
  }
  lines.push("");
  const fails = result.checks.filter((x) => x.required && x.status === "fail").length;
  const warns = result.checks.filter((x) => x.status === "warn").length;
  if (result.allGreen) lines.push(c(32, "Todo está listo. ¡A hacer videos!"));
  else if (result.ok) lines.push(c(33, `Lo básico funciona${warns ? `; hay ${warns} aviso${warns === 1 ? "" : "s"} que limitan algunos tipos de video` : ""}. Puedes arreglarlo con las indicaciones de arriba.`));
  else lines.push(c(31, `Faltan ${fails} cosa${fails === 1 ? "" : "s"} indispensable${fails === 1 ? "" : "s"} para hacer videos. Sigue las indicaciones "Cómo arreglarlo" o corre: node engine/doctor.mjs --fix`));
  return lines.join("\n");
}

// ---------------------------------------------------------------------------------------------------------------
// --fix
// ---------------------------------------------------------------------------------------------------------------

export function buildFixPlan(ctx, result, py) {
  const st = (id) => result.checks.find((c) => c.id === id)?.status;
  const plan = [];
  const win = ctx.platform === "win32";
  const mac = ctx.platform === "darwin";
  const sys = (id, title, mac_, win_) => {
    if (win) plan.push({ id, title, kind: "system", cmd: win_ });
    else if (mac) plan.push({ id, title, kind: "system", cmd: mac_ });
  };
  if (st("node.version") === "fail") sys("node", "Instalar Node.js", ["brew", ["install", "node"]], ["winget", ["install", "--id", "OpenJS.NodeJS.LTS", "-e"]]);
  if (st("ffmpeg.bin") === "fail" || st("ffmpeg.features") === "fail" || st("ffprobe.bin") === "fail") {
    sys("ffmpeg", "Instalar ffmpeg", ["brew", ["install", "ffmpeg"]], ["winget", ["install", "--id", "Gyan.FFmpeg", "-e"]]);
  }
  if (st("browser") === "fail") sys("chrome", "Instalar Google Chrome", ["brew", ["install", "--cask", "google-chrome"]], ["winget", ["install", "--id", "Google.Chrome", "-e"]]);
  const base = py?.firstVersionOk;
  if (st("py.version") === "fail" && !base) sys("python", "Instalar Python", ["brew", ["install", "python@3.12"]], ["winget", ["install", "--id", "Python.Python.3.12", "-e"]]);
  if (st("node.modules") === "fail") {
    const lock = ctx.exists(ctx.P.join(ctx.skillRoot, "engine", "package-lock.json"));
    plan.push({ id: "npm", title: "Instalar los componentes del motor de video (npm)", kind: "local", cmd: [win ? "npm.cmd" : "npm", [lock ? "ci" : "install"]], cwd: ctx.P.join(ctx.skillRoot, "engine") });
  }
  const apple = isAppleSilicon(ctx);
  const needEnv = st("py.required") === "fail" || (st("py.version") === "fail" && base) || (apple && st("py.transcribe") === "warn") || st("py.rembg") === "warn" || (win && (st("py.transcribe") === "warn" || st("py.faces") === "warn"));
  if (needEnv) {
    // ONE environment for the whole skill: scripts/setup_python.py creates paths.data_dir()/venv from scripts/requirements.txt (it resolves uv/pyenv shims itself)
    const setup = ctx.P.join(ctx.skillRoot, "scripts", "setup_python.py");
    const req = ctx.P.join(ctx.skillRoot, "scripts", "requirements.txt");
    if (!ctx.exists(setup) || !ctx.exists(req)) {
      plan.push({ id: "pip-manual", title: "Instalar paquetes de Python", kind: "manual", note: `No encuentro scripts/setup_python.py. Instálalos a mano: ${venvPython(ctx)} -m pip install ${[...PY_REQUIRED, ...PY_OPTIONAL, ...(win ? PY_OPTIONAL_NON_MAC : [])].map((p) => p.pip).join(" ")}` });
    } else if (base) {
      plan.push({ id: "pyenv", title: "Crear o actualizar el entorno de Python del skill (descarga los paquetes)", kind: "local", cmd: [base.cmd, [...base.args, setup]] });
    }
  }
  // Opt-in (asked [y/N] like every step): CUDA packages for NVIDIA machines. Never part of the default environment.
  if (base && st("py.gpu") === "warn") {
    const setup = ctx.P.join(ctx.skillRoot, "scripts", "setup_python.py");
    if (ctx.exists(setup)) plan.push({ id: "pyenv-gpu", title: "Activar la aceleración por GPU NVIDIA en el entorno de Python (opcional)", kind: "local", cmd: [base.cmd, [...base.args, setup, "--gpu"]] });
  }
  return plan;
}

const fmtCmd = ([f, a]) => [f, ...a].map((s) => (/\s/.test(s) ? `"${s}"` : s)).join(" ");

export async function runFix(ctx, result, io) {
  const plan = buildFixPlan(ctx, result, result._pythonResolution);
  if (!plan.length) {
    io.print("No hay nada que arreglar automáticamente. Revisa las indicaciones \"Cómo arreglarlo\" del reporte.");
    return { ran: 0, declined: 0 };
  }
  io.print("Puedo arreglar esto por ti. Te pregunto antes de cada paso; nada se instala sin tu permiso.\n");
  let ran = 0;
  let declined = 0;
  let systemInstalled = false;
  for (const step of plan) {
    io.print(`• ${step.title}`);
    if (step.kind === "manual") {
      io.print(`  ${step.note}\n`);
      continue;
    }
    if (step.kind === "system") {
      const tool = step.cmd[0];
      const have = await findBinary(ctx, tool, {});
      if (!have) {
        io.print(ctx.platform === "win32"
          ? "  Para esto necesito winget (viene con Windows 11; si no aparece, instala \"Instalador de aplicaciones\" desde Microsoft Store) y vuelve a correr --fix."
          : "  Para esto necesito Homebrew, que no está instalado. Instálalo desde https://brew.sh (copia el comando de esa página en Terminal) y vuelve a correr --fix.");
        io.print("");
        continue;
      }
    }
    io.print(`  Comando: ${fmtCmd(step.cmd)}${step.cwd ? `   (en ${step.cwd})` : ""}`);
    const yes = await io.ask("  ¿Lo hago ahora? [y/N] ");
    if (!yes) {
      declined += 1;
      io.print("  Lo dejo para después.\n");
      continue;
    }
    const code = await io.run(step.cmd[0], step.cmd[1], { cwd: step.cwd });
    if (code === 0) {
      ran += 1;
      if (step.kind === "system") systemInstalled = true;
      io.print("  Listo.\n");
    } else {
      io.print(`  Algo salió mal (código ${code}). Copia el mensaje de arriba y compártelo con tu contacto en Reda.\n`);
    }
  }
  if (systemInstalled) io.print("Cierra esta ventana y ábrela de nuevo para que tu computadora reconozca lo que se instaló. Después corre el diagnóstico otra vez.\n");
  return { ran, declined };
}

function makeIo(ctx) {
  const interactive = !!process.stdin.isTTY && !!process.stdout.isTTY;
  return {
    print: (s) => console.log(s),
    ask: (q) => {
      if (!interactive) {
        console.log("  No puedo preguntarte en esta terminal, así que no ejecuto nada. Copia el comando y córrelo tú, o abre una terminal normal y usa --fix.");
        return Promise.resolve(false);
      }
      return new Promise((res) => {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        rl.question(q, (a) => {
          rl.close();
          res(/^\s*(y|yes|s|si|sí)\s*$/i.test(a));
        });
      });
    },
    run: (file, args, opts) =>
      new Promise((res) => {
        let f = file;
        let a = args;
        if (ctx.platform === "win32" && /\.(cmd|bat)$/i.test(file)) {
          f = process.env.ComSpec || "cmd.exe";
          a = ["/d", "/c", file, ...args];
        }
        const child = spawn(f, a, { stdio: "inherit", shell: false, cwd: opts?.cwd, windowsHide: false });
        child.on("error", () => res(-1));
        child.on("close", (code) => res(code ?? -1));
      }),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------------------------------------------

const HELP = `Diagnóstico de Estudio de video

Uso: node engine/doctor.mjs [opciones]

  --json          Resultado en JSON (para que lo lea el asistente).
  --fix           Ofrece arreglar lo que falta; pregunta [y/N] antes de cada paso.
  --online        Valida tu llave de ElevenLabs y revisa el inicio de sesión de Reda (solo consultas gratuitas).
  --skip-claude   No revisa Claude ni los conectores.
  --if-stale      No hace nada si hubo un diagnóstico todo en verde hace menos de ${CACHE_DAYS} días.
  --no-write      No guarda doctor-last.json.
  --print-python  Imprime la ruta del Python del entorno del skill (no revisa nada).
  --help          Muestra esta ayuda.

Código de salida: 0 si todo lo indispensable está bien, 1 si falta algo.`;

export function parseArgs(argv) {
  const o = { json: false, fix: false, online: false, skipClaude: false, ifStale: false, noWrite: false, printPython: false, help: false, unknown: [] };
  for (const a of argv) {
    if (a === "--json") o.json = true;
    else if (a === "--print-python") o.printPython = true;
    else if (a === "--fix") o.fix = true;
    else if (a === "--online") o.online = true;
    else if (a === "--skip-claude") o.skipClaude = true;
    else if (a === "--if-stale") o.ifStale = true;
    else if (a === "--no-write") o.noWrite = true;
    else if (a === "--help" || a === "-h") o.help = true;
    else o.unknown.push(a);
  }
  return o;
}

export async function main(argv = process.argv.slice(2), ctx = makeContext()) {
  const o = parseArgs(argv);
  if (o.help) {
    console.log(HELP);
    return 0;
  }
  if (o.unknown.length) {
    console.error(`Opción desconocida: ${o.unknown.join(" ")}\n\n${HELP}`);
    return 2;
  }
  if (o.json && o.fix) {
    console.error("--fix pregunta cosas y no se puede combinar con --json.");
    return 2;
  }
  if (o.printPython) {
    console.log(venvPython(ctx)); // one line, no checks: docs and scripts can call it
    return 0;
  }
  if (o.ifStale) {
    const fresh = readFreshCache(ctx);
    if (fresh) {
      if (o.json) console.log(JSON.stringify(fresh, null, 2));
      else console.log(`Tu última revisión (hace ${fresh.ageDays} días) salió toda en verde; no hace falta repetirla. Usa el diagnóstico sin --if-stale para forzarlo.`);
      return 0;
    }
  }
  const color = !o.json && !!process.stdout.isTTY && !process.env.NO_COLOR;
  if (!o.json) console.log("Revisando tu computadora, esto toma unos segundos...\n");
  let result = await runChecks(ctx, o);
  if (o.fix) {
    console.log(formatReport(result, { color }));
    console.log("");
    const res = await resolvePython(ctx);
    result._pythonResolution = res;
    await runFix(ctx, result, makeIo(ctx));
    console.log("Revisando de nuevo...\n");
    result = await runChecks(ctx, o);
  }
  if (!o.noWrite) writeCache(ctx, result);
  if (o.json) {
    const { _pythonResolution, ...clean } = result;
    console.log(JSON.stringify(clean, null, 2));
  } else console.log(formatReport(result, { color }));
  return result.ok ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(
    (code) => {
      process.exitCode = code;
    },
    (e) => {
      console.error("El diagnóstico tuvo un error inesperado:", e?.message ?? e);
      process.exitCode = 1;
    },
  );
}
