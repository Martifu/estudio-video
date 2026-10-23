// node --test engine/studio/test/products.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { checkProductsDoc, productRefsOf, resolveRef } from "../products.mjs";
import { pythonCandidates, dataDir, venvPython } from "../pyenv.mjs";
import { validateElement, TYPES, pinPatch, windowOf } from "../client/schema.js";
import { runReview, textPieces, upscaleOf } from "../client/review-rules.js";

const img = (o = {}) => ({ id: "ab12cd34", src: "assets/products/ab12cd34.jpg", w: 1000, h: 800, ...o });
const prod = (o = {}) => ({ id: "mesa", name: "Mesa de centro", price: 12500, currency: "MXN", source: "manual", images: [img()], ...o });
const doc = (...p) => ({ version: 1, products: p.length ? p : [prod()] });

test("products doc: a valid document and the shapes a catalog adapter may write", () => {
  assert.equal(checkProductsDoc(doc()), null);
  assert.equal(checkProductsDoc(doc(prod({ source: "reda", fetchedAt: "2026-10-22T10:00:00Z", sku: "M-1", url: "https://x.mx/m", attributes: { Madera: "Parota", Largo: 2.4 }, priceNote: "desde", images: [img({ cutout: "assets/products/00ff00ff.png", cw: 900, ch: 700, preferOriginal: true })] }))), null);
  assert.equal(checkProductsDoc({ version: 1, products: [] }), null);
});

test("products doc: rejects bad ids, duplicates, remote or escaping image paths, bad sizes", () => {
  assert.match(checkProductsDoc({ version: 2, products: [] }), /version/);
  assert.match(checkProductsDoc(doc(prod({ id: "a b" }))), /id/);
  assert.match(checkProductsDoc(doc(prod(), prod())), /repetido/);
  assert.match(checkProductsDoc(doc(prod({ name: "" }))), /nombre/);
  assert.match(checkProductsDoc(doc(prod({ price: -1 }))), /precio/);
  assert.match(checkProductsDoc(doc(prod({ currency: "pesos" }))), /moneda/);
  assert.match(checkProductsDoc(doc(prod({ url: "javascript:alert(1)" }))), /url/);
  assert.match(checkProductsDoc(doc(prod({ images: [img({ src: "https://evil.example/a.jpg" })] }))), /assets\/products/);
  assert.match(checkProductsDoc(doc(prod({ images: [img({ src: "assets/products/../../x.jpg" })] }))), /assets\/products/);
  assert.match(checkProductsDoc(doc(prod({ images: [img({ src: "/etc/passwd" })] }))), /assets\/products/);
  assert.match(checkProductsDoc(doc(prod({ images: [img({ w: 0 })] }))), /w y h/);
  assert.match(checkProductsDoc(doc(prod({ images: [img({ cutout: "assets/products/ab12cd34.jpg" })] }))), /PNG/);
  assert.match(checkProductsDoc(doc(prod({ images: [img(), img()] }))), /repetida/);
});

test("refs: cutout preferred unless preferOriginal; missing product / image are reported", () => {
  const d = doc(prod({ images: [img({ cutout: "assets/products/00ff00ff.png" }), img({ id: "bb", src: "assets/products/bb000000.jpg" })] }));
  assert.equal(resolveRef(d, { product: "mesa" }).src, "assets/products/00ff00ff.png");
  assert.equal(resolveRef(d, { product: "mesa", image: "bb" }).src, "assets/products/bb000000.jpg");
  d.products[0].images[0].preferOriginal = true;
  assert.equal(resolveRef(d, { product: "mesa" }).src, "assets/products/ab12cd34.jpg");
  assert.equal(resolveRef(d, { product: "nope" }).missing, "product");
  assert.equal(resolveRef(d, { product: "mesa", image: "zz" }).missing, "image");
  assert.deepEqual(productRefsOf({ type: "carousel", slides: [{ product: "a" }, { product: "b", image: "x" }] }), [{ product: "a", image: undefined }, { product: "b", image: "x" }]);
  assert.deepEqual(productRefsOf({ type: "productPop", product: "a" }), [{ product: "a", image: undefined }]);
});

test("python lookup order: ESTUDIO_PY, skill venv, legacy venv, system", () => {
  const home = "/h";
  const venv = venvPython("darwin", dataDir({}, "darwin", home));
  assert.equal(venv, "/h/Library/Application Support/estudio-video/venv/bin/python");
  const has = (set) => (p) => set.includes(p);
  assert.deepEqual(pythonCandidates({ env: { ESTUDIO_PY: "/x/py" }, platform: "darwin", home, exists: has([venv, "/h/.local/share/reels-dibujados/venv/bin/python"]) }).slice(0, 3), ["/x/py", venv, "/h/.local/share/reels-dibujados/venv/bin/python"]);
  assert.deepEqual(pythonCandidates({ env: {}, platform: "darwin", home, exists: has([]) }), ["python3", "python", "/opt/homebrew/bin/python3", "/usr/local/bin/python3", "/usr/bin/python3"]);
  assert.equal(dataDir({ XDG_DATA_HOME: "/xdg" }, "linux", home), "/xdg/estudio-video");
  assert.equal(dataDir({ LOCALAPPDATA: "C:\\L" }, "win32", home).includes("estudio-video"), true);
});

test("schema: product element types validate and expose their fields", () => {
  for (const t of ["productCard", "productPop", "carousel"]) assert.ok(TYPES[t] && TYPES[t].fields.length && TYPES[t].pin, t);
  assert.deepEqual(validateElement({ type: "productCard", product: "mesa", in: 1, out: 4 }).errors, []);
  assert.match(validateElement({ type: "productCard", product: "", in: 1, out: 4 }).errors[0], /elige un producto/);
  assert.match(validateElement({ type: "productPop", in: 1, out: 4 }).errors[0], /elige un producto/);
  const car = { type: "carousel", style: "slide", in: 1, out: 7, slides: [{ product: "a" }, { product: "b" }] };
  assert.deepEqual(validateElement(car).errors, []);
  assert.match(validateElement({ ...car, slides: [{ product: "a" }] }).errors[0], /2 a 8/);
  assert.match(validateElement({ ...car, slides: Array.from({ length: 9 }, () => ({ product: "a" })) }).errors[0], /2 a 8/);
  assert.match(validateElement({ ...car, slides: [{ product: "a" }, {}] }).errors[0], /elegir/);
  assert.deepEqual(windowOf(car), [1, 7]); // timing inOut: carousel slides must not be read as timed items
  const d = TYPES.carousel.defaults(2, 30);
  assert.equal(d.type, "carousel");
  assert.equal(d.in, 2);
});

test("schema: pinning keeps the planner's width / size", () => {
  const src = { type: "productCard", product: "m", in: 0, out: 3 };
  const patch = pinPatch(src, { ...src, w: 460 }, { x: 100, y: 400, w: 540, h: 700 });
  assert.deepEqual(patch, { x: 120, y: 420, w: 460 });
  const pop = pinPatch({ type: "productPop", product: "m", in: 0, out: 3 }, { size: 500 }, { x: 100, y: 400, w: 540, h: 600 });
  assert.deepEqual(pop, { x: 370, y: 700, size: 500 });
});

const D = { version: 1, products: [prod({ images: [img({ w: 1000, h: 1000 })] }), prod({ id: "reda1", name: "Credenza", source: "reda", fetchedAt: "2020-01-01T00:00:00Z", images: [img({ id: "z", w: 300, h: 300, cutout: "assets/products/00ff00ff.png", cw: 260, ch: 260, cutoutWarnings: ["el recorte tiene 2 huecos dentro del producto."] })] })] };
const base = (over = {}) => ({ duration: 30, motion: [], captionSegs: [], words: [], zones: null, products: D, ...over });
const sev = (r, check) => r.items.filter((i) => i.check === check).map((i) => i.severity);

test("review: text pieces of product elements come from products.json", () => {
  assert.deepEqual(textPieces({ type: "productCard", product: "mesa", in: 1, out: 4 }, D).map((p) => p.text), ["Mesa de centro"]);
  assert.deepEqual(textPieces({ type: "productCard", product: "mesa", name: "Otra", in: 1, out: 4 }, D).map((p) => p.text), ["Otra"]);
  assert.deepEqual(textPieces({ type: "carousel", style: "slide", in: 0, out: 5, slides: [{ product: "mesa" }, { product: "reda1" }] }, D).map((p) => p.text), ["Mesa de centro"]);
  assert.equal(textPieces({ type: "carousel", style: "grid-pop", in: 0, out: 5, slides: [{ product: "mesa" }, { product: "reda1" }] }, D).length, 2);
});

test("review: price from a non-manual source is yellow 'verifica el precio'; manual is not", () => {
  const manual = runReview(base({ motion: [{ id: "a", type: "productCard", product: "mesa", in: 1, out: 4 }] }));
  assert.equal(manual.items.filter((i) => i.check === "productPrice" && i.severity === "yellow").length, 0);
  const reda = runReview(base({ motion: [{ id: "a", type: "productCard", product: "reda1", in: 1, out: 4 }] }));
  const it = reda.items.find((i) => i.check === "productPrice");
  assert.equal(it.severity, "yellow");
  assert.match(it.title, /Verifica el precio/);
  assert.match(it.detail, /más de 7 días/);
  const hidden = runReview(base({ motion: [{ id: "a", type: "productCard", product: "reda1", showPrice: false, in: 1, out: 4 }] }));
  assert.equal(hidden.items.filter((i) => i.check === "productPrice").length, 0);
  const pop = runReview(base({ motion: [{ id: "a", type: "productPop", product: "reda1", in: 1, out: 4 }] })); // pop hides the price unless asked
  assert.equal(pop.items.filter((i) => i.check === "productPrice").length, 0);
});

test("review: cutout warnings and low resolution surface as yellow", () => {
  const el = { id: "a", type: "productCard", product: "reda1", w: 540, in: 1, out: 4 };
  const plan = { rects: [{ x: 270, y: 500, w: 580, h: 700 }], report: { elements: [{ faceOverlap: 0, window: [1, 4], mode: "explicit", collidesWith: [] }], faces: [] }, elements: [{ w: 540 }], logo: {} };
  const r = runReview(base({ motion: [el], plan }));
  assert.ok(r.items.some((i) => i.check === "productCutout" && i.severity === "yellow" && /huecos/.test(i.detail)));
  const res = r.items.find((i) => i.check === "productRes");
  assert.equal(res.severity, "yellow"); // 260 px cutout in a ~430 px tile
  assert.match(res.detail, /260×260/);
  const ok = runReview(base({ motion: [{ id: "b", type: "productCard", product: "mesa", w: 300, in: 1, out: 4 }], plan: { ...plan, elements: [{ w: 300 }] } }));
  assert.equal(ok.items.filter((i) => i.check === "productRes" && i.severity === "yellow").length, 0);
  assert.ok(upscaleOf({ type: "productPop", size: 620 }, { product: "mesa" }, { w: 660, h: 700 }, D) < 1);
});

test("review: a product photo over the face is yellow (never red) and text fit reuses the planner box", () => {
  const el = { id: "a", type: "productPop", product: "mesa", label: "Mesa de centro parota", in: 1, out: 4 };
  const plan = { rects: [{ x: 40, y: 500, w: 700, h: 700 }], report: { elements: [{ faceOverlap: 0.4, faceZoneOverlap: 0.5, window: [1, 4], mode: "auto", collidesWith: [] }], faces: [{ clip: "c", source: "vision", samples: 10 }] }, elements: [{}], logo: {} };
  const r = runReview(base({ motion: [el], plan }));
  assert.deepEqual(sev(r, "productFace"), ["yellow"]);
  assert.deepEqual(sev(r, "faces"), ["green"]); // generic face rule skips product types
  assert.deepEqual(sev(r, "textFit"), ["yellow"]); // x 40 < the 60 px side margin
});

test("resolveExe: python names resolve through findPython (never the bare PATH name), node stays, anything else is refused", async () => {
  const { resolveExe, findPython } = await import("../pyenv.mjs");
  const py = await findPython(["PIL"]);
  assert.deepEqual(await resolveExe("node"), { exe: "node" });
  for (const n of ["python3", "python"]) {
    const r = await resolveExe(n);
    if (py) { assert.equal(r.exe, py); assert.notEqual(r.exe, n); } else assert.ok(r.error);
  }
  assert.ok((await resolveExe("bash")).error);
  assert.ok((await resolveExe("/usr/bin/python3")).error);
});
