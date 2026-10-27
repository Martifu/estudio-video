// One place that decides which Python interpreter the studio (and later the rest of the node code) uses for the skill's scripts.
// Order: ESTUDIO_PY env override -> the skill-managed venv in the platform data dir (scripts/setup_python.py creates it)
// -> existing fallbacks (the reels-dibujados venv, then system pythons). Mirrors scripts/paths.py.
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** Platform data dir, same rule as scripts/paths.py data_dir() (ESTUDIO_DATA_DIR overrides, mainly for tests). */
export function dataDir(env = process.env, platform = process.platform, home = homedir()) {
  if (env.ESTUDIO_DATA_DIR) return env.ESTUDIO_DATA_DIR;
  if (platform === "darwin") return join(home, "Library", "Application Support", "estudio-video");
  if (platform === "win32") return join(env.LOCALAPPDATA || join(home, "AppData", "Local"), "estudio-video");
  const xdg = env.XDG_DATA_HOME;
  return join(xdg && xdg.startsWith("/") ? xdg : join(home, ".local", "share"), "estudio-video");
}
/** Interpreter inside the skill-managed venv (bin/python, Scripts\python.exe on Windows). */
export const venvPython = (platform = process.platform, dir = dataDir()) => (platform === "win32" ? join(dir, "venv", "Scripts", "python.exe") : join(dir, "venv", "bin", "python"));

/** Ordered candidate list (pure; tested). Entries that are paths must exist; bare names are resolved by the OS. */
export function pythonCandidates({ env = process.env, platform = process.platform, home = homedir(), exists = existsSync } = {}) {
  const list = [];
  if (env.ESTUDIO_PY) list.push(env.ESTUDIO_PY);
  const v = venvPython(platform, dataDir(env, platform, home));
  if (exists(v)) list.push(v);
  const legacy = join(home, ".local/share/reels-dibujados/venv/bin/python");
  if (platform !== "win32" && exists(legacy)) list.push(legacy);
  if (platform === "win32") list.push("python", "py");
  else list.push("python3", "python", "/opt/homebrew/bin/python3", "/usr/local/bin/python3", "/usr/bin/python3");
  return list;
}

const cache = new Map();
/** First interpreter that can `import` every module in `modules` (default Pillow). null when none can. Cached per module list. */
export function findPython(modules = ["PIL"], opts) {
  const key = modules.join(",");
  if (!cache.has(key)) {
    cache.set(key, (async () => {
      for (const py of pythonCandidates(opts)) {
        const ok = await new Promise((res) => execFile(py, ["-I", "-X", "utf8", "-c", `import ${modules.join(", ")}`], { timeout: 60000 }, (err) => res(!err)));
        if (ok) return py;
      }
      return null;
    })());
  }
  return cache.get(key);
}
export const forgetPython = () => cache.clear();

/** Run `python -I script args...`; resolves {out, stderr} or {fatal: Spanish message}. Never rejects. */
export async function runScript(py, script, args, { timeout = 60000 } = {}) {
  return new Promise((res) => {
    execFile(py, ["-I", "-X", "utf8", script, ...args], { timeout, maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => {
      try {
        res({ out: JSON.parse(stdout), stderr: String(stderr ?? "") });
      } catch {
        res({ fatal: err?.killed ? "La operación tardó demasiado y se canceló." : `El script falló: ${(String(stderr) || err?.message || "sin salida").trim().split("\n").pop().slice(0, 200)}` });
      }
    });
  });
}

/** Executable actually spawned for a validated build.json argv[0]: python/python3 -> the interpreter findPython() picks (the one the
 *  doctor validates; never the bare PATH name), node stays "node". Resolves {exe} or {error: Spanish message}. Never rejects. */
export async function resolveExe(name, modules = ["PIL"]) {
  if (name === "node") return { exe: "node" };
  if (name !== "python3" && name !== "python") return { error: `ejecutable no permitido (${name})` };
  const py = await findPython(modules);
  return py ? { exe: py } : { error: "no encontré un Python con Pillow (corre el doctor: node engine/doctor.mjs --fix)" };
}
