// Estudio products: RUN-level products.json (source-agnostic catalog; the Reda MCP adapter will write the same document), photo upload,
// background removal and the render preflight for product elements. Registered by server.mjs (registerProducts(ctx)) after assets.mjs.
//
//   products.json  {version:1, products:[{id, sku?, name, price?, currency?, priceNote?, url?, attributes?, source:"manual"|"reda"|..., fetchedAt?,
//                   images:[{id, src, w, h, cutout?, cw?, ch?, preferOriginal?, cutoutWarnings?, cutoutModel?}]}]}
//   Images live content-addressed in RUN/assets/products/<sha8>.png|jpg (never overwritten); `src` / `cutout` are RUN-relative paths.
// All mutations go through the endpoints below (serialized), so two quick edits never overwrite each other.
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, watch, writeFileSync } from "node:fs";
import { join, resolve, isAbsolute, relative, extname } from "node:path";
import { findPython, runScript } from "./pyenv.mjs";

const MAX_UPLOAD = 25 * 1024 * 1024;
export const PRODUCT_DIR = "assets/products";
export const PRODUCT_TYPES = ["productCard", "productPop", "carousel"];
export const CUTOUT_MODEL = "birefnet-general-lite";
const SRC_RE = /^assets\/products\/[0-9a-f]{8}\.(png|jpg)$/;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const isStr = (v, max) => typeof v === "string" && v.length <= max;

/** Validate a products.json document. -> error message in Spanish, or null. */
export function checkProductsDoc(doc) {
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) return "products.json debe ser un objeto";
  if (doc.version !== 1) return "products.json: version debe ser 1";
  if (!Array.isArray(doc.products)) return "products.json: falta la lista \"products\"";
  const seen = new Set();
  for (const [i, p] of doc.products.entries()) {
    const tag = `producto #${i + 1}`;
    if (!p || typeof p !== "object" || Array.isArray(p)) return `${tag}: no es un objeto`;
    if (!ID_RE.test(p.id ?? "")) return `${tag}: "id" inválido (letras, números, - y _; hasta 64)`;
    if (seen.has(p.id)) return `${tag}: el id "${p.id}" está repetido`;
    seen.add(p.id);
    if (!isStr(p.name, 120) || !p.name.trim()) return `${tag}: necesita un nombre (hasta 120 caracteres)`;
    if ("sku" in p && !isStr(p.sku, 64)) return `${tag}: sku de hasta 64 caracteres`;
    if ("price" in p && !((isNum(p.price) && p.price >= 0 && p.price < 1e9) || isStr(p.price, 40))) return `${tag}: el precio debe ser un número o un texto corto`;
    if ("currency" in p && !(typeof p.currency === "string" && /^[A-Za-z]{3}$/.test(p.currency))) return `${tag}: la moneda debe ser un código de 3 letras (MXN, USD)`;
    if ("priceNote" in p && !isStr(p.priceNote, 60)) return `${tag}: la nota del precio es de hasta 60 caracteres`;
    if ("url" in p && !(isStr(p.url, 500) && /^https?:\/\//.test(p.url))) return `${tag}: url debe empezar con http:// o https://`;
    if ("attributes" in p && !(p.attributes && typeof p.attributes === "object" && !Array.isArray(p.attributes) && Object.values(p.attributes).every((v) => isStr(v, 200) || isNum(v)))) return `${tag}: attributes debe ser {nombre: texto o número}`;
    if (!isStr(p.source ?? "manual", 40)) return `${tag}: source inválido`;
    if ("fetchedAt" in p && !(isStr(p.fetchedAt, 40) && !Number.isNaN(Date.parse(p.fetchedAt)))) return `${tag}: fetchedAt debe ser una fecha ISO`;
    if (!Array.isArray(p.images ?? [])) return `${tag}: images debe ser una lista`;
    const ids = new Set();
    for (const im of p.images ?? []) {
      if (!im || !ID_RE.test(im.id ?? "")) return `${tag}: una foto tiene id inválido`;
      if (ids.has(im.id)) return `${tag}: foto repetida (${im.id})`;
      ids.add(im.id);
      if (typeof im.src !== "string" || !SRC_RE.test(im.src)) return `${tag}: la foto ${im.id} debe estar en ${PRODUCT_DIR}/<sha8>.png|jpg`;
      if (!(Number.isInteger(im.w) && im.w > 0 && Number.isInteger(im.h) && im.h > 0)) return `${tag}: la foto ${im.id} necesita w y h`;
      if ("cutout" in im && (typeof im.cutout !== "string" || !SRC_RE.test(im.cutout) || !im.cutout.endsWith(".png"))) return `${tag}: el recorte de ${im.id} debe ser un PNG en ${PRODUCT_DIR}/`;
      for (const k of ["cw", "ch"]) if (k in im && !(Number.isInteger(im[k]) && im[k] > 0)) return `${tag}: ${k} inválido en ${im.id}`;
      if ("preferOriginal" in im && typeof im.preferOriginal !== "boolean") return `${tag}: preferOriginal debe ser verdadero o falso`;
    }
  }
  return null;
}

/** Engine-equivalent resolution used by the preflight: a motion element's image refs -> [{ref, product, entry, src}] (pure; tested). */
export function productRefsOf(el) {
  if (el.type === "carousel") return (el.slides ?? []).map((s) => ({ product: s?.product, image: s?.image }));
  return [{ product: el.product, image: el.image }];
}
export function resolveRef(doc, ref) {
  const p = doc.products.find((x) => x.id === ref.product);
  if (!p) return { missing: "product" };
  const entry = ref.image ? p.images?.find((i) => i.id === ref.image) : p.images?.[0];
  if (!entry) return { product: p, missing: "image" };
  return { product: p, entry, src: entry.cutout && !entry.preferOriginal ? entry.cutout : entry.src };
}

const slug = (s) => String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "producto";

export function registerProducts(ctx) {
  const { SKILL, compDir, runDir, studioDir, json, readJson, readBody, writeAtomic, insideDir, route, broadcast } = ctx;
  const docFile = join(runDir, "products.json");
  const imgDir = join(runDir, PRODUCT_DIR);
  const validator = join(SKILL, "scripts", "validate_asset.py");
  const cutoutScript = join(SKILL, "scripts", "cutout.py");
  const empty = () => ({ version: 1, products: [] });
  const sha = (buf) => createHash("sha256").update(buf).digest("hex").slice(0, 16);
  const readDoc = () => {
    if (!existsSync(docFile)) return { doc: empty(), version: sha("empty"), error: null };
    const raw = readFileSync(docFile);
    try {
      const doc = JSON.parse(raw.toString("utf8"));
      const error = checkProductsDoc(doc);
      return { doc: error ? empty() : doc, version: sha(raw), error };
    } catch {
      return { doc: empty(), version: sha(raw), error: "products.json no se puede leer (JSON dañado)" };
    }
  };
  // Serialized read-modify-write so concurrent requests never lose an edit.
  let chain = Promise.resolve();
  let lastWrite = null;
  const mutate = (fn) => {
    const run = chain.then(async () => {
      const cur = readDoc();
      if (cur.error && existsSync(docFile)) throw Object.assign(new Error(`products.json tiene un problema (${cur.error}); corrígelo antes de editar.`), { status: 409 });
      const doc = structuredClone(cur.doc);
      const out = await fn(doc);
      const err = checkProductsDoc(doc);
      if (err) throw Object.assign(new Error(err), { status: 422 });
      const text = JSON.stringify(doc, null, 1);
      writeAtomic(docFile, text);
      lastWrite = sha(Buffer.from(text));
      broadcast("products", { version: lastWrite });
      return { doc, out, version: lastWrite };
    });
    chain = run.catch(() => {});
    return run;
  };
  const fail = (res, e) => json(res, e.status ?? 500, { error: e.message });
  const pick = (b) => {
    const o = {};
    if ("name" in b) o.name = String(b.name ?? "").trim();
    if ("sku" in b) o.sku = b.sku === "" || b.sku == null ? undefined : String(b.sku);
    if ("price" in b) o.price = b.price === "" || b.price === null ? undefined : typeof b.price === "string" && /^\d+(\.\d+)?$/.test(b.price.replace(/[$,\s]/g, "")) ? Number(b.price.replace(/[$,\s]/g, "")) : b.price;
    if ("currency" in b) o.currency = b.currency ? String(b.currency).toUpperCase() : undefined;
    if ("priceNote" in b) o.priceNote = b.priceNote ? String(b.priceNote) : undefined;
    if ("url" in b) o.url = b.url ? String(b.url) : undefined;
    if ("attributes" in b) o.attributes = b.attributes && Object.keys(b.attributes).length ? b.attributes : undefined;
    return o;
  };
  const apply = (p, patch) => { for (const [k, v] of Object.entries(patch)) { if (v === undefined) delete p[k]; else p[k] = v; } };

  // ---------- documents ----------
  route("GET", "/api/products", false, (req, res) => {
    const r = readDoc();
    json(res, 200, { doc: r.doc, version: r.version, error: r.error });
  });
  route("POST", "/api/products", true, async (req, res) => {
    try {
      const b = (await readJson(req, 64 * 1024)) ?? {};
      if (!String(b.name ?? "").trim()) return json(res, 400, { error: "Escribe el nombre del producto." });
      const r = await mutate((doc) => {
        let id = slug(b.name);
        while (doc.products.some((p) => p.id === id)) id = `${slug(b.name).slice(0, 34)}-${randomBytes(2).toString("hex")}`;
        const p = { id, name: "", source: "manual", images: [] };
        apply(p, pick(b));
        doc.products.push(p);
        return id;
      });
      json(res, 200, { id: r.out, doc: r.doc, version: r.version });
    } catch (e) { fail(res, e); }
  });
  route("PUT", /^\/api\/products\/([\w-]+)$/, true, async (req, res, m) => {
    try {
      const b = (await readJson(req, 64 * 1024)) ?? {};
      const r = await mutate((doc) => {
        const p = doc.products.find((x) => x.id === m[1]);
        if (!p) throw Object.assign(new Error("Ese producto ya no existe."), { status: 404 });
        const patch = pick(b);
        if (patch.name !== undefined && !patch.name) throw Object.assign(new Error("El nombre no puede quedar vacío."), { status: 400 });
        apply(p, patch);
        if (Array.isArray(b.imageOrder)) p.images.sort((a, c) => b.imageOrder.indexOf(a.id) - b.imageOrder.indexOf(c.id));
      });
      json(res, 200, { doc: r.doc, version: r.version });
    } catch (e) { fail(res, e); }
  });
  route("DELETE", /^\/api\/products\/([\w-]+)$/, true, async (req, res, m) => {
    try {
      const r = await mutate((doc) => {
        const i = doc.products.findIndex((x) => x.id === m[1]);
        if (i < 0) throw Object.assign(new Error("Ese producto ya no existe."), { status: 404 });
        doc.products.splice(i, 1);
      });
      json(res, 200, { doc: r.doc, version: r.version });
    } catch (e) { fail(res, e); }
  });

  // ---------- photos ----------
  async function pythonFor(modules, what) {
    const py = await findPython(modules);
    if (!py) return { fatal: what };
    return { py };
  }
  route("POST", "/api/products/image", true, async (req, res) => {
    try {
      const url = new URL(req.url, "http://x");
      const pid = url.searchParams.get("product") ?? "";
      if (!readDoc().doc.products.some((p) => p.id === pid)) return json(res, 404, { error: "Ese producto ya no existe." });
      const buf = await readBody(req, MAX_UPLOAD);
      if (!buf.length) return json(res, 400, { error: "El archivo está vacío." });
      if (existsSync(join(runDir, "assets")) && !insideDir(join(runDir, "assets"), runDir)) return json(res, 400, { error: "La carpeta assets/ del RUN apunta fuera del RUN; no se puede guardar la foto." });
      const { py, fatal } = await pythonFor(["PIL"], "No hay un Python con Pillow para revisar la foto (corre scripts/setup_python.py).");
      if (fatal) return json(res, 500, { error: fatal });
      const tmpDir = join(studioDir, "tmp");
      mkdirSync(tmpDir, { recursive: true });
      const tmp = join(tmpDir, `product-${randomBytes(6).toString("hex")}`);
      writeFileSync(tmp, buf);
      let result;
      try {
        result = await runScript(py, validator, ["--process-product", tmp, "--out-dir", imgDir]);
      } finally {
        rmSync(tmp, { force: true });
      }
      if (result.fatal) return json(res, 500, { error: result.fatal });
      const v = result.out;
      if (!v.ok) return json(res, 422, { error: v.error, warnings: v.warnings ?? [] });
      const src = `${PRODUCT_DIR}/${v.file}`;
      const r = await mutate((doc) => {
        const p = doc.products.find((x) => x.id === pid);
        if (!p) throw Object.assign(new Error("Ese producto ya no existe."), { status: 404 });
        if (!p.images.some((i) => i.id === v.sha8)) p.images.push({ id: v.sha8, src, w: v.width, h: v.height });
      });
      json(res, 200, { ok: true, imageId: v.sha8, src, warnings: v.warnings ?? [], doc: r.doc, version: r.version });
    } catch (e) { fail(res, e); }
  });
  route("PUT", /^\/api\/products\/([\w-]+)\/image\/([\w-]+)$/, true, async (req, res, m) => {
    try {
      const b = (await readJson(req, 4096)) ?? {};
      const r = await mutate((doc) => {
        const im = doc.products.find((x) => x.id === m[1])?.images.find((i) => i.id === m[2]);
        if (!im) throw Object.assign(new Error("Esa foto ya no existe."), { status: 404 });
        if ("preferOriginal" in b) { if (b.preferOriginal && im.cutout) im.preferOriginal = true; else delete im.preferOriginal; }
        if (b.removeCutout) for (const k of ["cutout", "cw", "ch", "preferOriginal", "cutoutWarnings", "cutoutModel"]) delete im[k];
      });
      json(res, 200, { doc: r.doc, version: r.version });
    } catch (e) { fail(res, e); }
  });
  route("DELETE", /^\/api\/products\/([\w-]+)\/image\/([\w-]+)$/, true, async (req, res, m) => {
    try {
      const r = await mutate((doc) => {
        const p = doc.products.find((x) => x.id === m[1]);
        const i = p?.images.findIndex((x) => x.id === m[2]) ?? -1;
        if (i < 0) throw Object.assign(new Error("Esa foto ya no existe."), { status: 404 });
        p.images.splice(i, 1);
      });
      json(res, 200, { doc: r.doc, version: r.version });
    } catch (e) { fail(res, e); }
  });

  // ---------- background removal (one at a time: it is CPU heavy) ----------
  let cutoutChain = Promise.resolve();
  route("POST", "/api/products/cutout", true, async (req, res) => {
    const b = (await readJson(req, 4096)) ?? {};
    const job = cutoutChain.then(async () => {
      const cur = readDoc().doc;
      const p = cur.products.find((x) => x.id === b.product);
      const im = p?.images.find((i) => i.id === b.imageId);
      if (!im) throw Object.assign(new Error("Esa foto ya no existe."), { status: 404 });
      const input = resolve(runDir, im.src);
      if (!insideDir(input, runDir) || !existsSync(input)) throw Object.assign(new Error("No se encuentra el archivo de la foto."), { status: 404 });
      const { py, fatal } = await pythonFor(["PIL", "numpy", "rembg"], "Falta instalar el recortador de fondo. Pide que corran scripts/setup_python.py (una sola vez; después funciona sin internet).");
      if (fatal) throw Object.assign(new Error(fatal), { status: 503 });
      const model = typeof b.model === "string" && /^[\w-]{1,40}$/.test(b.model) ? b.model : CUTOUT_MODEL;
      const r = await runScript(py, cutoutScript, ["--in", input, "--out-dir", imgDir, "--model", model], { timeout: 15 * 60 * 1000 });
      if (r.fatal) throw Object.assign(new Error(r.fatal), { status: 500 });
      if (!r.out.ok) throw Object.assign(new Error(r.out.error), { status: 422 });
      const v = r.out;
      const out = await mutate((doc) => {
        const q = doc.products.find((x) => x.id === b.product)?.images.find((i) => i.id === b.imageId);
        if (!q) throw Object.assign(new Error("Esa foto ya no existe."), { status: 404 });
        q.cutout = `${PRODUCT_DIR}/${v.file}`;
        q.cw = v.width;
        q.ch = v.height;
        q.cutoutModel = v.model;
        if (v.warnings?.length) q.cutoutWarnings = v.warnings; else delete q.cutoutWarnings;
        delete q.preferOriginal;
      });
      return { ...out, cutout: v };
    });
    cutoutChain = job.catch(() => {});
    try {
      const r = await job;
      json(res, 200, { ok: true, warnings: r.cutout.warnings ?? [], seconds: r.cutout.seconds, model: r.cutout.model, stats: r.cutout.stats, doc: r.doc, version: r.version });
    } catch (e) { fail(res, e); }
  });

  // ---------- external edits (a catalog adapter writing products.json) ----------
  let timer = null;
  try {
    watch(runDir, (_e, name) => {
      if (name !== "products.json") return;
      clearTimeout(timer);
      timer = setTimeout(() => { const v = readDoc().version; if (v !== lastWrite) broadcast("products", { version: v, external: true }); }, 150);
    });
  } catch { /* unwatchable RUN: the panel refreshes on focus instead */ }

  // ---------- preflight: every image a product element will draw must exist, stay inside the RUN and decode ----------
  const basePreflight = ctx.preflight;
  ctx.preflight = async () => {
    const r = basePreflight ? await basePreflight() : { ok: true, errors: [], warnings: [], assets: [] };
    let motion = [];
    try { motion = JSON.parse(readFileSync(join(compDir, "motion.json"), "utf8")); } catch { /* the base render reports it */ }
    const els = Array.isArray(motion) ? motion.filter((e) => PRODUCT_TYPES.includes(e?.type) && !e.hidden) : [];
    if (!els.length) return r;
    const pd = readDoc();
    if (pd.error) { r.errors.push({ kind: "product", path: "products.json", message: `products.json: ${pd.error}` }); r.ok = false; return r; }
    const files = new Map();
    const seenMsg = new Set();
    const err = (kind, path, message) => { if (!seenMsg.has(message)) { seenMsg.add(message); r.errors.push({ kind, path, message }); } };
    for (const el of els) {
      for (const ref of productRefsOf(el)) {
        const x = resolveRef(pd.doc, ref);
        if (x.missing === "product") { err("product", String(ref.product), `Un elemento de producto usa "${ref.product}", que ya no está en tu lista de productos.`); continue; }
        if (x.missing === "image") { err("product-image", String(ref.image ?? ""), `El producto "${x.product.name}" no tiene la foto que usa el video.`); continue; }
        const label = `Foto de "${x.product.name}"`;
        if (typeof x.src !== "string" || /^[a-z][a-z0-9+.-]*:/i.test(x.src) || isAbsolute(x.src) || x.src.split(/[\\/]/).includes("..")) { err("product-image", String(x.src), `${label}: la ruta no es válida (debe estar dentro del RUN).`); continue; }
        const abs = resolve(runDir, x.src);
        if (!insideDir(abs, runDir)) { err("product-image", x.src, `${label}: la ruta sale del RUN.`); continue; }
        if (!existsSync(abs)) { err("product-image", x.src, `${label}: el archivo no existe (${x.src}). Vuelve a subir la foto.`); continue; }
        files.set(abs, { label, rel: relative(runDir, abs).split("\\").join("/") });
        for (const w of x.entry.cutoutWarnings ?? []) if (x.src === x.entry.cutout && !seenMsg.has(`${x.product.id}:${w}`)) { seenMsg.add(`${x.product.id}:${w}`); r.warnings.push({ kind: "product-cutout", path: x.src, message: `${label}: ${w}` }); }
      }
    }
    if (files.size) {
      const { py } = await pythonFor(["PIL"], "");
      if (py) {
        const v = await runScript(py, validator, ["--check", ...files.keys(), "--no-contrast"]);
        if (v.out) for (const f of v.out.files) {
          const meta = files.get(f.path);
          if (!f.ok) err("product-image", meta.rel, `${meta.label} (${meta.rel}): ${f.error}`);
          else r.assets.push({ kind: "product-image", label: meta.label, path: meta.rel, width: f.width ?? null, height: f.height ?? null, alpha: f.alpha ?? null });
        }
      }
    }
    r.ok = r.errors.length === 0;
    return r;
  };
}
