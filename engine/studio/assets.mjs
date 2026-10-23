// Estudio assets: logo upload (validated + normalized by scripts/validate_asset.py) and the render preflight.
// Registered by server.mjs (registerAssets(ctx)). Nothing here writes brand.json: a replaced logo lives in RUN/assets/logo-<sha8>.png
// (content-addressed, never overwritten, so a new file always has a new URL: no stale cache in the preview or the render) and is
// referenced from <comp>/logo.json `src` by the client.
import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { findPython as findPy } from "./pyenv.mjs";
import { extname, isAbsolute, join, relative, resolve } from "node:path";

const MAX_UPLOAD = 15 * 1024 * 1024; // logo upload only; every other route keeps the 1 MB body limit
export const LOGO_EXT = new Set([".png", ".jpg", ".jpeg", ".webp"]);
export const BRAND_VARIANTS = ["color", "white", "mark"];

const num = (v, lo, hi) => typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;
/** logo.json: where / how the logo bug appears. Every key optional (absent = today's look). -> error message or null. */
export function checkLogoDoc(d, { runDir, insideDir }) {
  if (!d || typeof d !== "object" || Array.isArray(d)) return "logo debe ser un objeto";
  const known = ["hidden", "corner", "x", "y", "w", "h", "variant", "src", "opacity", "in", "out", "enter", "fadeDur", "scrim", "shadow", "autoHide"];
  for (const k of Object.keys(d)) if (!known.includes(k)) return `logo.${k}: campo desconocido`;
  for (const k of ["hidden", "scrim", "autoHide"]) if (k in d && typeof d[k] !== "boolean") return `logo.${k} debe ser verdadero o falso`;
  if ("corner" in d && !["tr", "tl", "auto"].includes(d.corner)) return "logo.corner: tr, tl o auto";
  if ("x" in d && !num(d.x, -300, 1400)) return "logo.x fuera de rango (-300..1400)";
  if ("y" in d && !num(d.y, -300, 2200)) return "logo.y fuera de rango (-300..2200)";
  if ("w" in d && !num(d.w, 16, 1080)) return "logo.w fuera de rango (16..1080)";
  if ("h" in d && !num(d.h, 16, 1920)) return "logo.h fuera de rango (16..1920)";
  if ("variant" in d && !BRAND_VARIANTS.includes(d.variant)) return "logo.variant: color, white o mark";
  if ("opacity" in d && !num(d.opacity, 0, 1)) return "logo.opacity fuera de rango (0..1)";
  if ("in" in d && !num(d.in, 0, 3600)) return "logo.in inválido";
  if ("out" in d && !num(d.out, 0, 3600)) return "logo.out inválido";
  if ("in" in d && "out" in d && d.out <= d.in) return "logo: 'sale' debe ser mayor que 'entra'";
  if ("enter" in d && !["fade", "pop", "slide", "none"].includes(d.enter)) return "logo.enter: fade, pop, slide o none";
  if ("fadeDur" in d && !num(d.fadeDur, 0, 3)) return "logo.fadeDur fuera de rango (0..3 s)";
  if ("shadow" in d && d.shadow !== false && !(d.shadow && typeof d.shadow === "object" && num(d.shadow.blur ?? 14, 0, 60) && num(d.shadow.alpha ?? 0.6, 0, 1))) return "logo.shadow: false o {blur 0..60, alpha 0..1}";
  if ("src" in d) {
    if (typeof d.src !== "string" || !d.src || /^[a-z][a-z0-9+.-]*:/i.test(d.src) || d.src.startsWith("/") || d.src.startsWith("//") || d.src.split(/[\\/]/).includes("..")) return "logo.src debe ser una ruta relativa al RUN";
    if (!LOGO_EXT.has(extname(d.src).toLowerCase())) return "logo.src: solo PNG, JPG o WebP";
    if (!insideDir(resolve(runDir, d.src), runDir)) return "logo.src sale del RUN";
  }
  return null;
}
/** cta.json: the end card. Absent keys = the --cta* flags of build.json. */
export function checkCtaDoc(d) {
  if (!d || typeof d !== "object" || Array.isArray(d)) return "cta debe ser un objeto";
  const known = ["enabled", "title", "subtitle", "dur", "logoVariant", "bg"];
  for (const k of Object.keys(d)) if (!known.includes(k)) return `cta.${k}: campo desconocido`;
  if ("enabled" in d && typeof d.enabled !== "boolean") return "cta.enabled debe ser verdadero o falso";
  if ("title" in d && (typeof d.title !== "string" || d.title.length > 120)) return "cta.title: texto de hasta 120 caracteres";
  if ("subtitle" in d && (typeof d.subtitle !== "string" || d.subtitle.length > 200)) return "cta.subtitle: texto de hasta 200 caracteres";
  if ("dur" in d && !num(d.dur, 0.5, 10)) return "cta.dur fuera de rango (0.5..10 s)";
  if ("logoVariant" in d && ![...BRAND_VARIANTS, "custom", "auto"].includes(d.logoVariant)) return "cta.logoVariant: auto, color, white, mark o custom";
  if ("bg" in d && !["light", "dark"].includes(d.bg)) return "cta.bg: light o dark";
  return null;
}

export function registerAssets(ctx) {
  const { SKILL, compDir, runDir, studioDir, json, readBody, writeAtomic, insideDir, route } = ctx;
  const validator = join(SKILL, "scripts", "validate_asset.py");
  const mediaFile = join(studioDir, "media.json");
  const readJsonFile = (f, dflt) => {
    try {
      return existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : dflt;
    } catch {
      return dflt;
    }
  };

  // ---------- a python with Pillow: one shared lookup (pyenv.mjs: ESTUDIO_PY -> skill venv -> legacy venv -> system) ----------
  const findPython = () => findPy(["PIL"]);
  async function runValidator(args) {
    const py = await findPython();
    if (!py) return { fatal: "No hay un Python con Pillow para validar imágenes (pip install pillow, o define ESTUDIO_PY)." };
    return new Promise((res) => {
      execFile(py, ["-I", validator, ...args], { timeout: 60000, maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
        try {
          res({ out: JSON.parse(stdout) });
        } catch {
          res({ fatal: `El validador de imágenes falló: ${(stderr || err?.message || "sin salida").toString().trim().split("\n").pop()}` });
        }
      });
    });
  }

  // ---------- paths: everything is relative to RUN and must stay inside it (realpath, no symlink escapes) ----------
  const isRemote = (s) => /^[a-z][a-z0-9+.-]*:/i.test(s) || s.startsWith("//");
  /** -> {abs, rel} for a RUN-relative image path, or {error}. */
  function resolveAsset(rel) {
    if (typeof rel !== "string" || !rel) return { error: "ruta vacía" };
    if (isRemote(rel)) return { error: "no se permiten URLs: el archivo debe estar dentro del RUN" };
    if (isAbsolute(rel) || rel.split(/[\\/]/).includes("..")) return { error: "la ruta debe ser relativa al RUN y no salir de él" };
    const abs = resolve(runDir, rel);
    if (!insideDir(abs, runDir)) return { error: "la ruta sale del RUN (enlace simbólico o '..')" };
    return { abs, rel: relative(runDir, abs).split("\\").join("/") };
  }
  const brandOf = () => readJsonFile(join(runDir, "brand.json"), {});
  /** Background of the CTA card: cta.json bg > brand.cta_card.background ("paper" = light card, default dark). */
  const ctaBg = () => {
    const cta = readJsonFile(join(compDir, "cta.json"), null);
    if (cta?.bg === "light" || cta?.bg === "dark") return cta.bg;
    return brandOf().cta_card?.background === "paper" ? "light" : "dark";
  };

  // ---------- preflight ----------
  /** Resolve and decode every asset the render will touch. -> {ok, errors:[{kind,path,message}], warnings:[...], assets:[...]} */
  async function preflight() {
    const errors = [];
    const warnings = [];
    const assets = [];
    const brand = brandOf();
    const logoDoc = readJsonFile(join(compDir, "logo.json"), null);
    const ctaDoc = readJsonFile(join(compDir, "cta.json"), null);
    const bg = ctaBg();
    const files = new Map(); // abs -> {kind, label, rel}
    const want = (kind, label, rel) => {
      const r = resolveAsset(rel);
      if (r.error) return errors.push({ kind, path: rel, message: `${label}: ${r.error}` });
      if (!LOGO_EXT.has(extname(r.abs).toLowerCase()) && extname(r.abs).toLowerCase() !== ".svg") return errors.push({ kind, path: rel, message: `${label}: formato no soportado (${extname(r.abs) || "sin extensión"})` });
      if (!existsSync(r.abs)) return errors.push({ kind, path: rel, message: `${label}: el archivo no existe (${rel})` });
      if (!files.has(r.abs)) files.set(r.abs, { kind, label, rel: r.rel });
    };
    const bl = brand.logo ?? {};
    let anyBrandLogo = false;
    for (const k of BRAND_VARIANTS) {
      if (!bl[k]) continue;
      anyBrandLogo = true;
      want("logo", `Logo "${k}" de brand.json`, bl[k]);
    }
    if (brand.characters?.rex?.image) want("image", "Imagen de Rex (brand.json)", brand.characters.rex.image);
    const custom = logoDoc?.src;
    if (custom) want("logo-src", "Logo de este video (logo.json)", custom);
    if (!anyBrandLogo && !custom) warnings.push({ kind: "logo-missing", path: "brand.json", message: "No hay imagen de logo: se dibujará el nombre de la marca como texto." });
    const variantOk = (v) => (v === "custom" ? !!custom : !!bl[v]);
    if (logoDoc && !logoDoc.hidden && !custom && logoDoc.variant && !variantOk(logoDoc.variant)) {
      errors.push({ kind: "logo-variant", path: logoDoc.variant, message: `logo.json: la variante "${logoDoc.variant}" no está definida en brand.json` });
    }
    const buildArgv = readJsonFile(join(studioDir, "build.json"), { argv: [] }).argv ?? [];
    const ctaOn = ctaDoc && "enabled" in ctaDoc ? !!ctaDoc.enabled : buildArgv.includes("--cta");
    if (ctaOn && ctaDoc?.logoVariant && ctaDoc.logoVariant !== "auto" && !variantOk(ctaDoc.logoVariant)) {
      errors.push({ kind: "cta-logo", path: ctaDoc.logoVariant, message: `cta.json: la variante de logo "${ctaDoc.logoVariant}" no está disponible` });
    }
    // Brand variants are picked per background, so only their integrity is checked; the per-comp logo also gets the contrast checks
    // (video bug always; the CTA card only when cta.json asks for the "custom" variant).
    const groups = [
      { items: [...files.entries()].filter(([, m]) => m.kind !== "logo-src"), args: ["--no-contrast"] },
      { items: [...files.entries()].filter(([, m]) => m.kind === "logo-src"), args: ctaOn && ctaDoc?.logoVariant === "custom" ? ["--cta-bg", bg] : [] }
    ];
    for (const g of groups) {
      if (!g.items.length) continue;
      const { out, fatal } = await runValidator(["--check", ...g.items.map(([abs]) => abs), ...g.args]);
      if (fatal) { warnings.push({ kind: "validator", path: "", message: fatal }); continue; }
      for (const f of out.files) {
        const meta = files.get(f.path);
        if (!f.ok) errors.push({ kind: meta.kind, path: meta.rel, message: `${meta.label} (${meta.rel}): ${f.error}` });
        else {
          assets.push({ kind: meta.kind, label: meta.label, path: meta.rel, width: f.width ?? null, height: f.height ?? null, alpha: f.alpha ?? null });
          for (const w of f.warnings ?? []) warnings.push({ kind: meta.kind, path: meta.rel, message: `${meta.label}: ${w}` });
        }
      }
    }
    return { ok: errors.length === 0, errors, warnings, assets };
  }
  ctx.preflight = preflight;
  route("GET", "/api/preflight", false, async (req, res) => json(res, 200, await ctx.preflight())); // ctx.preflight may be wrapped by products.mjs

  // ---------- logo upload ----------
  route("POST", "/api/asset/logo", true, async (req, res) => {
    const buf = await readBody(req, MAX_UPLOAD); // raw bytes (Content-Type image/*); the content, not the header or extension, decides the format
    if (!buf.length) return json(res, 400, { error: "El archivo está vacío." });
    const assetsDir = join(runDir, "assets");
    if (existsSync(assetsDir) && !insideDir(assetsDir, runDir)) return json(res, 400, { error: "La carpeta assets/ del RUN apunta fuera del RUN; no se puede guardar el logo." });
    const tmpDir = join(studioDir, "tmp");
    mkdirSync(tmpDir, { recursive: true });
    const tmp = join(tmpDir, `upload-${randomBytes(6).toString("hex")}`);
    writeFileSync(tmp, buf);
    let result;
    try {
      result = await runValidator(["--process", tmp, "--out-dir", assetsDir, "--cta-bg", ctaBg()]);
    } finally {
      rmSync(tmp, { force: true });
    }
    if (result.fatal) return json(res, 500, { error: result.fatal });
    const v = result.out;
    if (!v.ok) return json(res, 422, { error: v.error, warnings: v.warnings ?? [] });
    const rel = `assets/${v.file}`;
    const placed = resolveAsset(rel);
    if (placed.error || !existsSync(placed.abs)) return json(res, 500, { error: "No se pudo guardar el logo dentro del RUN." });
    // Register as media slot "logo" (a version list entry; harmless to the AI's own entries).
    const name = decodeURIComponent(String(req.headers["x-filename"] ?? "")).slice(0, 120);
    const media = readJsonFile(mediaFile, { entries: [] });
    media.entries ??= [];
    const id = `logo:${v.sha8}`;
    if (!media.entries.some((e) => e.id === id)) {
      media.entries.push({ id, slot: "logo", path: rel, source: "upload", quality: null, createdAt: new Date().toISOString(), note: name ? `subido: ${name}` : "logo subido" });
      writeAtomic(mediaFile, JSON.stringify(media, null, 1));
    }
    json(res, 200, { ok: true, src: rel, url: `/${rel}`, width: v.width, height: v.height, alpha: v.alpha, lum: v.lum, warnings: v.warnings ?? [], id });
  });
}
