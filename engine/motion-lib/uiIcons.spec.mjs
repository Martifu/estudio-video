// Spec of uiIcons: official logo files drawn as they are (imported by engine/motion-lib.test.mjs).
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import * as Lib from "./index.js";
import { UI_ICON_LABELS, iconsSize, decideIcon } from "./uiIcons.js";
import { boxLuminance } from "./_kit.js";
import { recorder, env, ZONES } from "./_testkit.mjs";

const DIR = new URL("../../assets/brand-icons/", import.meta.url);
const INDEX = JSON.parse(readFileSync(new URL("index.json", DIR), "utf8")).icons;

test("uiIcons: every selectable name has an official file in assets/brand-icons (png 512 alpha) and a label", () => {
  for (const [name, label] of UI_ICON_LABELS) {
    const e = INDEX[name];
    assert.ok(e?.png && existsSync(new URL(e.png, DIR)), `${name}: png in index.json`);
    assert.ok(existsSync(new URL(e.svg, DIR)), `${name}: svg`);
    assert.ok(["circle", "rounded", "square", "pin"].includes(e.shape) && ["none", "white"].includes(e.plate), name);
    assert.equal(e.label, label, `${name}: the label of the inspector matches index.json`);
    if (e.alt) assert.ok(existsSync(new URL(e.alt.png, DIR)) && existsSync(new URL(e.alt.svg, DIR)), `${name}: alternate files`);
  }
  assert.equal(INDEX.tiktok, undefined, "TikTok has no verified official file: it must not be drawn");
});

test("uiIcons: logos are drawn as images (no vector glyphs), aspect kept, plate only for transparent glyphs, shadow on the tile", () => {
  const img = (w, h) => ({ naturalWidth: w, naturalHeight: h });
  const e = env({ img: (ref) => (ref === "icon:x" ? img(512, 256) : img(512, 512)), iconMeta: (n) => INDEX[n] });
  const el = { id: "i", type: "uiIcons", in: 0, out: 4, icons: ["whatsapp", "x"], plate: "white" };
  const log = [];
  Lib.draw(recorder(log), el, 3, e);
  const imgs = log.filter((l) => l.startsWith("drawImage("));
  assert.equal(imgs.length, 2);
  const [, , , w1, h1] = /drawImage\(obj,([-\d.]+),([-\d.]+),([-\d.]+),([-\d.]+)\)/.exec(imgs[1]);
  assert.ok(Math.abs(Number(w1) / Number(h1) - 2) < 0.02, "the 2:1 file keeps its aspect");
  assert.ok(!log.some((l) => /bezier|quadratic|ellipse|Gradient/.test(l)), "no hand-made glyphs / gradients");
  assert.ok(log.filter((l) => l === "fillStyle=#FFFFFF").length >= 1, "white plate behind the X glyph");
  assert.ok(log.some((l) => l.startsWith("shadowBlur=46")), "soft shadow on the plate");
  const none = []; Lib.draw(recorder(none), el, 3, env({ img: () => null }));
  assert.ok(!none.some((l) => l.startsWith("drawImage(")), "no file, nothing drawn (the loader raises the asset error)");
});

test("uiIcons: clear space >= 1/4 of a logo's width, logos never under 96 px, everything inside the safe width", () => {
  for (const n of [1, 2, 3, 4, 5]) {
    const { d, gap, w } = iconsSize({ icons: new Array(n).fill("whatsapp") });
    assert.ok(d >= 96, `${n}: d=${d}`);
    if (n > 1) assert.ok(gap >= d / 4, `${n}: gap ${gap} >= d/4`);
    assert.ok(w <= 900);
  }
});

test("uiIcons: image refs are icon:<name>; tiktok validates but is never drawable; unknown names fail", () => {
  const el = { type: "uiIcons", in: 0, out: 3, icons: ["whatsapp", "tiktok", "gmail"] };
  assert.deepEqual(Lib.imageRefs(el).map((r) => r.ref), ["icon:whatsapp", "icon:tiktok", "icon:gmail"]);
  assert.deepEqual(Lib.validate(el, "x").errors, []);
  assert.match(Lib.validate({ ...el, icons: ["myspace"] }, "x").errors[0], /icono desconocido/);
  assert.deepEqual(Lib.resolveRef("icon:whatsapp"), { kind: "icon", name: "whatsapp", alt: false });
  assert.deepEqual(Lib.resolveRef("icon:x:alt"), { kind: "icon", name: "x", alt: true });
  assert.equal(Lib.resolveRef("icon:../x"), null);
});

test("the static server serves assets/brand-icons at /_icons/", async () => {
  const { resolveStaticFile } = await import("../static-server.mjs");
  const engineDir = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
  assert.ok(resolveStaticFile("/_icons/index.json", { engineDir, runDir: "/tmp" })?.endsWith("assets/brand-icons/index.json"));
  assert.ok(resolveStaticFile("/_icons/whatsapp.png", { engineDir, runDir: "/tmp" }));
  assert.equal(resolveStaticFile("/_icons/../people/p01.jpg", { engineDir, runDir: "/tmp" }), null);
});

test("uiIcons auto plate: no plate when the logo reads; the official alternate on dark; the white card otherwise; explicit modes win", () => {
  const back = (lum, min = lum, max = lum) => ({ lum, min, max });
  const X = INDEX.x, WA = INDEX.whatsapp, GM = INDEX.gmail;
  // plain / bright background (no footage): everything without a plate except what cannot read
  assert.deepEqual(decideIcon(WA, null), { variant: "main", plate: false, contrast: decideIcon(WA, null).contrast });
  assert.equal(decideIcon(X, null).plate, false, "black X on paper reads");
  // dark footage: black X -> its official white variant; whatsapp green still reads on mid-dark
  const dark = back(0.04, 0.01, 0.08);
  assert.equal(decideIcon(X, dark).variant, "alt");
  assert.equal(decideIcon(X, dark).plate, false);
  assert.equal(decideIcon(WA, dark).plate, false);
  // tile logos (index plate "none") NEVER get a card in auto mode, whatever is behind them
  for (const n of ["whatsapp", "facebook", "instagram", "messenger", "youtube", "linkedin", "telegram"]) {
    for (const b of [back(0.02), back(0.5, 0.45, 0.55), back(0.9), back(INDEX[n] ? 0.3 : 0.3, 0.05, 0.95)]) assert.equal(decideIcon(INDEX[n], b).plate, false, `${n} never gets a plate in auto`);
  }
  // transparent glyph logos (index plate "white") that cannot read and have no alternate: the white card
  const onSame = decideIcon({ ...GM, color: "#EA4335" }, back(0.23, 0.2, 0.3));
  assert.equal(onSame.plate, true);
  assert.equal(onSame.variant, "main");
  // bright footage: black X reads; gmail red on light-red wall -> card
  assert.equal(decideIcon(X, back(0.8)).plate, false);
  assert.equal(decideIcon(GM, back(0.23, 0.2, 0.3)).plate, true);
  assert.equal(decideIcon(INDEX.google, back(0.9)).plate, false, "google on a bright background reads");
  // footage that is both very dark and very bright under the logo: neither variant improves things, so no card is added
  const mixed = back(0.3, 0.02, 0.95);
  assert.deepEqual([decideIcon(X, mixed).variant, decideIcon(X, mixed).plate], ["main", false]);
  // a white card on a white background adds nothing
  assert.equal(decideIcon({ ...GM, color: "#FFFFFF" }, back(1)).plate, false);
  // explicit modes
  assert.deepEqual([decideIcon(WA, dark, "white").plate, decideIcon(WA, back(0.9), "white").variant], [true, "main"]);
  assert.equal(decideIcon(X, dark, "none").plate, false);
  assert.equal(decideIcon(X, dark, "none").variant, "main");
});

test("uiIcons: plate field, backdrops() only for automatic plates, draw picks the alternate / plate from the measured backdrop", () => {
  const el = { id: "i", type: "uiIcons", in: 0, out: 4, icons: ["whatsapp", "x"] };
  const r = Lib.rect(el, ZONES, env());
  const boxes = Lib.backdrops(el, r);
  assert.equal(boxes.length, 2);
  assert.ok(boxes[0].x < boxes[1].x && boxes[0].w === iconsSize(el).d);
  assert.deepEqual(Lib.backdrops({ ...el, plate: "none" }, r), []);
  assert.match(Lib.validate({ ...el, plate: "gray" }, "x").errors[0], /auto, none o white/);
  const img = (w, h) => ({ naturalWidth: w, naturalHeight: h, tag: `${w}x${h}` });
  const drawn = (backdrop, plate) => { const log = []; Lib.draw(recorder(log), { ...el, ...(plate ? { plate } : {}) }, 3, env({ img: (ref) => (ref === "icon:x:alt" ? img(100, 100) : img(512, 512)), iconMeta: (n) => INDEX[n], backdrop: () => backdrop })); return log; };
  const dark = drawn({ lum: 0.03, min: 0.01, max: 0.06 });
  assert.equal(dark.filter((l) => l.startsWith("drawImage(")).length, 2);
  assert.ok(dark.some((l) => /drawImage\(obj,-?[\d.]+,-?[\d.]+,[\d.]+,[\d.]+\)/.test(l)));
  assert.ok(!dark.some((l) => l === "fillStyle=#FFFFFF"), "dark: the X uses its white variant, no card");
  assert.ok(drawn({ lum: 0.03, min: 0.01, max: 0.06 }, "white").some((l) => l === "fillStyle=#FFFFFF"), "explicit white card");
});

test("boxLuminance: mean / min / max of a pixel box", () => {
  const w = 8, h = 8, data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i += 1) { const left = i % w < 4; data.set(left ? [0, 0, 0, 255] : [255, 255, 255, 255], i * 4); }
  const all = boxLuminance(data, w, h, { x: 0, y: 0, w, h }, 1);
  assert.ok(Math.abs(all.lum - 0.5) < 1e-9 && all.min === 0 && all.max === 1);
  assert.deepEqual(boxLuminance(data, w, h, { x: 0, y: 0, w: 4, h }, 1), { lum: 0, min: 0, max: 0 });
  assert.equal(boxLuminance(data, w, h, { x: 20, y: 20, w: 4, h: 4 }), null);
});
