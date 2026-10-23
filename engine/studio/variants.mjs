// Estudio "Variantes en un clic": N text-only variants of the finished comp (e.g. 3 hooks x 2 CTAs) for A/B tests. Free and local:
// only text/motion change, so nothing here calls a paid API. Registered by server.mjs (like insights.mjs).
//
// GET  /api/variants           -> {doc, version, manifest, running, progress, estimate, combos, errors, warnings}
// PUT  /api/variants           -> {version, doc} writes <comp>/variants.json (doc:null deletes it); token + Origin; 409 / 422
// POST /api/variants/render    -> {only?: ["01", ...]} runs scripts/variants.py (fixed argv; preflight first); token + Origin
// POST /api/variants/export    -> rewrites <comp>/variants/names.csv from the manifest (variants.py --export)
// POST /api/variants/open      -> opens <comp>/variants in Finder
// SSE "variants" events: {event:"start"|"variant"|"progress"|"done", code, status, frac, n, total}.
//
// On disk: <comp>/variants.json (the document), <comp>/.studio/variants/{manifest.json,base-build.json,logs/}, <comp>/variants/ (served:
// <slug>.mp4, <slug>.jpg, <slug>-cta.jpg, <slug>-preview.mp4, grid.jpg, names.csv), sibling comps <RUN>/<comp>__var-<i><j>/ (editable).
// scripts/variants.py is the side that guards the render and re-validates everything; validateDoc() here gives the editor fast feedback
// (and is the same rules). Pure helpers are exported for engine/studio/test/variants.test.mjs.
import { execFile, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { findPython, resolveExe } from "./pyenv.mjs";

export const MAX_AXES = 2;
export const MAX_COMBOS = 12;
export const MAX_OPTIONS = 4; // option 0 = the current value + up to 3 alternatives
export const MAX_TEXT = 120;
const FIELD_RE = /^[a-z][A-Za-z]{0,20}$/;
const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\x00-\x08\x0b-\x1f\x7f]/;
const words = (s) => s.trim().split(/\s+/).filter(Boolean).length;

/** Validate a variants.json document. -> {errors[], warnings[], combos: number[][]}. `ctx` = {motion?, ctaOn?} enables existence checks. */
export function validateDoc(doc, env = {}) {
  const errors = [];
  const warnings = [];
  if (!doc || typeof doc !== "object" || !Array.isArray(doc.axes)) return { errors: ["variants.json: se espera {axes:[...]}"], warnings, combos: [] };
  const axes = doc.axes;
  if (axes.length < 1 || axes.length > MAX_AXES) errors.push(`variants.json: entre 1 y ${MAX_AXES} ejes`);
  const seen = new Set();
  axes.slice(0, MAX_AXES + 1).forEach((ax, n) => {
    const tag = `eje ${n + 1}`;
    if (!ax || typeof ax !== "object") { errors.push(`${tag}: debe ser un objeto`); return; }
    if (typeof ax.id !== "string" || !ID_RE.test(ax.id) || seen.has(ax.id)) errors.push(`${tag}: id inválido o repetido`);
    seen.add(ax.id);
    if (ax.label !== undefined && (typeof ax.label !== "string" || ax.label.length > 60)) errors.push(`${tag}: etiqueta inválida`);
    const t = ax.target;
    if (!t || typeof t !== "object") errors.push(`${tag}: falta target`);
    else if (t.kind === "motion") {
      const hasId = typeof t.id === "string" && ID_RE.test(t.id);
      if (!hasId && !Number.isInteger(t.index)) errors.push(`${tag}: el elemento necesita id o index`);
      if (typeof t.field !== "string" || !FIELD_RE.test(t.field)) errors.push(`${tag}: campo inválido`);
      else if (Array.isArray(env.motion)) {
        const el = (hasId && env.motion.find((e) => e?.id === t.id)) || (Number.isInteger(t.index) ? env.motion[t.index] : null);
        if (!el) errors.push(`${tag}: el elemento ya no existe en motion.json`);
        else if (typeof el[t.field] !== "string") errors.push(`${tag}: el elemento no tiene el campo de texto «${t.field}»`);
      }
    } else if (t.kind === "cta") {
      if (t.field !== "title" && t.field !== "subtitle") errors.push(`${tag}: el cierre solo admite title o subtitle`);
      if (env.ctaOn === false) errors.push(`${tag}: este video no tiene tarjeta de cierre`);
    } else if (t.kind === "caption") {
      if (!Number.isInteger(t.segment) || t.segment < 0) errors.push(`${tag}: subtítulo sin segmento`);
      if (t.field !== undefined && t.field !== "text") errors.push(`${tag}: el subtítulo solo admite text`);
    } else errors.push(`${tag}: tipo de objetivo desconocido`);
    const opts = ax.options;
    if (!Array.isArray(opts) || opts.length < 2 || opts.length > MAX_OPTIONS || !opts.every((o) => typeof o === "string")) {
      errors.push(`${tag}: entre 2 y ${MAX_OPTIONS} textos (el primero es el actual)`);
      return;
    }
    opts.forEach((o, k) => {
      const s = o.trim();
      if (!s) errors.push(`${tag}, opción ${k + 1}: texto vacío`);
      else if (s.length > MAX_TEXT || CONTROL_RE.test(o)) errors.push(`${tag}, opción ${k + 1}: más de ${MAX_TEXT} caracteres o con caracteres de control`);
      else if (words(s) > 4 && t?.kind !== "caption") warnings.push(`${tag}, opción ${k + 1}: ${words(s)} palabras (la guía es 1-4 por fragmento)`);
    });
    if (new Set(opts.map((o) => o.trim().toLowerCase())).size !== opts.length) warnings.push(`${tag}: hay textos repetidos`);
  });
  let combos = [[]];
  for (const ax of axes.slice(0, MAX_AXES)) {
    const n = Array.isArray(ax?.options) ? ax.options.length : 0;
    combos = combos.flatMap((c) => Array.from({ length: n }, (_, i) => [...c, i]));
  }
  if (combos.length > MAX_COMBOS) errors.push(`${combos.length} combinaciones (máximo ${MAX_COMBOS})`);
  return { errors, warnings, combos };
}
/** Safe sibling-comp name: built only from option indexes, never from user text. */
export const variantSlug = (compName, combo) => `${compName}__var-${combo.map((i) => String(Number(i) | 0)).join("")}`;

const readJsonFile = (f, dflt = null) => {
  try {
    return existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : dflt;
  } catch {
    return dflt;
  }
};

export function registerVariants(ctx) {
  const { compDir, runDir, compName, studioDir, SKILL, json, readJson, readBody, writeAtomic, insideDir, route, sha } = ctx;
  const docFile = join(compDir, "variants.json");
  const vStudio = join(studioDir, "variants");
  const manifestFile = join(vStudio, "manifest.json");
  const baseBuildFile = join(vStudio, "base-build.json");
  const outDir = join(compDir, "variants");
  let job = null; // {startedAt, done, code, log[], progress}

  const docRead = () => {
    const raw = existsSync(docFile) ? readFileSync(docFile) : null;
    let doc = null;
    try { doc = raw ? JSON.parse(raw.toString("utf8")) : null; } catch { /* corrupt: treated as absent */ }
    return { doc, version: raw ? sha(raw) : "none" };
  };
  const env = () => {
    const cta = readJsonFile(join(compDir, "cta.json"), null);
    const build = readJsonFile(join(studioDir, "build.json"), { argv: [] });
    return { motion: readJsonFile(join(compDir, "motion.json"), []), ctaOn: cta && "enabled" in cta ? !!cta.enabled : (build.argv ?? []).includes("--cta") };
  };
  /** Rough time per variant: the last good full render of the comp, else the average of the last variants run. */
  function estimate() {
    const manifest = readJsonFile(manifestFile);
    const times = (manifest?.variants ?? []).filter((v) => v.status === "done" && Number.isFinite(v.renderS)).map((v) => v.renderS);
    if (times.length) return { perVariantS: Math.round(times.reduce((a, b) => a + b, 0) / times.length), source: "variants" };
    const rf = join(studioDir, "renders.jsonl");
    if (existsSync(rf)) {
      const lines = readFileSync(rf, "utf8").split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter((r) => r && r.code === 0 && r.ms > 0);
      if (lines.length) return { perVariantS: Math.round(lines[lines.length - 1].ms / 1000), source: "render" };
    }
    return { perVariantS: null, source: null };
  }

  route("GET", "/api/variants", false, (req, res) => {
    const { doc, version } = docRead();
    const v = doc ? validateDoc(doc, env()) : { errors: [], warnings: [], combos: [] };
    json(res, 200, {
      doc, version, manifest: readJsonFile(manifestFile), running: !!job && !job.done, progress: job ? { done: job.done, code: job.code, log: job.log.slice(-30), last: job.last ?? null } : null,
      estimate: estimate(), combos: v.combos.length, errors: v.errors, warnings: v.warnings, base: compName, outputs: `/${compName}/variants/`
    });
  });

  route("PUT", "/api/variants", true, async (req, res) => {
    const b = await readJson(req, 64 * 1024);
    if (!b || typeof b !== "object" || typeof b.version !== "string") return json(res, 400, { error: "se espera {version, doc}" });
    const cur = docRead();
    if (b.version !== cur.version) return json(res, 409, { error: "conflict", version: cur.version });
    if (b.doc === null) {
      if (existsSync(docFile)) writeAtomic(docFile, "null");
      return json(res, 200, { version: docRead().version, errors: [], warnings: [], combos: 0 });
    }
    // Only the known keys are kept (the document is later read by variants.py).
    const doc = { axes: Array.isArray(b.doc?.axes) ? b.doc.axes.map((ax) => ({ id: ax?.id, label: ax?.label, target: ax?.target && typeof ax.target === "object" ? { ...ax.target } : ax?.target, options: ax?.options })) : b.doc?.axes };
    if (Array.isArray(b.doc?.selected)) doc.selected = b.doc.selected.filter((x) => typeof x === "string").slice(0, MAX_COMBOS);
    const v = validateDoc(doc, env());
    if (v.errors.length) return json(res, 422, { error: "invalid", errors: v.errors });
    if (!insideDir(docFile, compDir)) return json(res, 403, { error: "ruta fuera del comp" });
    writeAtomic(docFile, JSON.stringify(doc, null, 1));
    json(res, 200, { version: docRead().version, warnings: v.warnings, combos: v.combos.length });
  });

  route("POST", "/api/variants/render", true, async (req, res) => {
    const b = (await readJson(req, 4096)) ?? {};
    if (job && !job.done) return json(res, 409, { error: "ya hay un render de variantes en curso" });
    const { doc } = docRead();
    if (!doc) return json(res, 422, { error: "no hay variantes definidas todavía" });
    const v = validateDoc(doc, env());
    if (v.errors.length) return json(res, 422, { error: v.errors[0], errors: v.errors });
    const only = Array.isArray(b.only) ? b.only.filter((c) => typeof c === "string" && /^\d{1,2}$/.test(c)) : null;
    // Same asset preflight as the normal render (logos referenced by brand.json / logo.json / cta.json must decode).
    const pf = await ctx.preflight();
    if (!pf.ok) return json(res, 422, { error: `No se puede renderizar: ${pf.errors[0].message}`, preflight: pf });
    // The base command = build.json + the active media versions / audio settings, validated like the normal render.
    const base = readJsonFile(join(studioDir, "build.json"));
    if (!base?.argv) return json(res, 422, { error: "falta .studio/build.json (se escribe con overlay.py --studio-build)" });
    const checked = ctx.validateArgv(ctx.composeArgv ? ctx.composeArgv(base.argv) : base.argv);
    if (checked.error) return json(res, 422, { error: checked.error });
    mkdirSync(vStudio, { recursive: true });
    writeAtomic(baseBuildFile, JSON.stringify({ argv: checked.argv }, null, 1));
    const argv = [join(SKILL, "scripts", "variants.py"), "--comp", compDir, "--build", baseBuildFile, ...(only?.length ? ["--only", only.join(",")] : [])];
    // python3 | python | node in build.json are names only: variants.py always runs under the pyenv.mjs interpreter (the doctor's).
    const resolved = await resolveExe(checked.argv[0] === "node" ? "python3" : checked.argv[0]);
    if (resolved.error) return json(res, 422, { error: `build.json: ${resolved.error}` });
    const j = { startedAt: Date.now(), done: false, code: null, log: [], last: null };
    job = j;
    const child = spawn(resolved.exe, argv, { cwd: runDir, env: { ...process.env, ...(ctx.renderEnv?.() ?? {}) }, stdio: ["ignore", "pipe", "pipe"] });
    let buf = "";
    const onData = (chunk) => {
      buf += chunk.toString("utf8");
      const lines = buf.split(/\r?\n|\r/);
      buf = lines.pop();
      for (const line of lines) {
        if (!line.trim() || /^(frame=|size=)/.test(line.trim())) continue;
        if (line.startsWith("@variants ")) {
          try { j.last = JSON.parse(line.slice(10)); ctx.broadcast("variants", j.last); } catch { /* ignore a torn line */ }
          continue;
        }
        j.log.push(line);
        if (j.log.length > 200) j.log.shift();
      }
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("close", (code) => { j.done = true; j.code = code; ctx.broadcast("variants", { event: "finished", code }); });
    child.on("error", (err) => { j.done = true; j.code = -1; j.log.push(`error: ${err.message}`); ctx.broadcast("variants", { event: "finished", code: -1 }); });
    json(res, 202, { started: true, combos: v.combos.length });
  });

  route("POST", "/api/variants/export", true, async (req, res) => {
    await readBody(req, 1024);
    if (!existsSync(manifestFile)) return json(res, 404, { error: "todavía no hay variantes renderizadas" });
    const py = await findPython(["PIL"]);
    if (!py) return json(res, 500, { error: "no encontré un Python con Pillow" });
    execFile(py, [join(SKILL, "scripts", "variants.py"), "--comp", compDir, "--export"], { cwd: runDir }, (err, stdout) => {
      if (err) return json(res, 500, { error: err.message });
      json(res, 200, { file: `/${compName}/variants/names.csv`, message: stdout.trim() });
    });
  });

  route("POST", "/api/variants/open", true, async (req, res) => {
    const b = (await readJson(req, 1024)) ?? {};
    // With a code: open that variant's mp4 in QuickTime (the code must exist in the manifest). Without: the folder in Finder.
    if (b.code != null) {
      const v = readJsonFile(manifestFile)?.variants?.find((x) => x.code === String(b.code) && x.status === "done");
      const file = v && join(outDir, v.file);
      if (!file || !insideDir(file, outDir) || !existsSync(file)) return json(res, 404, { error: "esa variante no tiene video" });
      execFile("open", ["-a", "QuickTime Player", file], (err) => err && console.error("open failed:", err.message));
      return json(res, 200, { opened: file });
    }
    mkdirSync(outDir, { recursive: true });
    execFile("open", [outDir], (err) => err && console.error("open failed:", err.message));
    json(res, 200, { opened: outDir });
  });
}
