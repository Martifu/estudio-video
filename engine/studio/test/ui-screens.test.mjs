// node --test engine/studio/test/ui-screens.test.mjs
// Estudio side of the product screens: schema validation of each type, defaults, prefill from Reda products, review rules, EDL ripple.
import test from "node:test";
import assert from "node:assert/strict";
import { TYPES, UI_TYPES, validateElement, validateMotion, shiftTime, elementLabel, textKeyOf, supportsPin } from "../client/schema.js";
import { listFromProducts } from "#motion-lib/uiList.js";
import { runReview } from "../client/review-rules.js";

const sample = (type, over = {}) => ({ ...TYPES[type].defaults(1, 30), id: type, ...over });
const sev = (r, check) => r.items.filter((i) => i.check === check).map((i) => i.severity);

test("defaults of every ui type validate cleanly, are fictional and in Spanish", () => {
  assert.ok(UI_TYPES.length >= 7, "at least the original seven product screens");
  for (const type of UI_TYPES) {
    const el = sample(type);
    const r = validateElement(el, 0, 30);
    assert.deepEqual(r, { errors: [], warnings: [] }, type);
    assert.ok(TYPES[type].ui && TYPES[type].pin === null && !supportsPin(el), `${type}: not pinnable (slot based)`);
    assert.ok(TYPES[type].screen.some((f) => f.key === "slot") && TYPES[type].screen.some((f) => f.key === "captions") && TYPES[type].screen.some((f) => f.key === "push"));
    if (type !== "uiIcons") assert.equal(el.source.kind, "fictional");
  }
  assert.ok(TYPES.uiList.screen.some((f) => f.key === "cursor") && !TYPES.uiStat.screen.some((f) => f.key === "cursor"));
});

test("schema validation: each ui type rejects missing / out-of-range content with a plain message", () => {
  const bad = (type, over, re) => {
    const r = validateElement(sample(type, over), 0, 30);
    assert.ok(r.errors.some((m) => re.test(m)), `${type} ${JSON.stringify(over).slice(0, 60)} -> ${JSON.stringify(r.errors)}`);
  };
  bad("uiList", { rows: [] }, /1 a 4 filas/);
  bad("uiList", { rows: [{ title: "a" }, {}] }, /nombre/);
  bad("uiList", { select: 9 }, /fila elegida/);
  bad("uiForm", { steps: [] }, /1 a 5 pasos/);
  bad("uiForm", { steps: [{ title: "x" }] }, /título y contenido/);
  bad("uiDoc", { rows: [{ label: "a", value: "" }] }, /concepto y monto/);
  bad("uiDoc", { highlight: 5 }, /resaltada/);
  bad("uiStat", { value: "" }, /cifra/);
  bad("uiKanban", { columns: [{ name: "a" }] }, /2 a 5 columnas/);
  bad("uiKanban", { to: 7 }, /columna/);
  bad("uiKanban", { card: {} }, /prospecto/);
  bad("uiFeed", { items: [] }, /1 a 12 avisos/);
  bad("uiIcons", { icons: ["whatsapp", "myspace"] }, /icono desconocido/);
  bad("uiIcons", { icons: [] }, /1 a 5 iconos/);
  bad("uiList", { slot: "left" }, /slot/);
  bad("uiList", { captions: "x" }, /captions/);
  bad("uiList", { push: 0.5 }, /acercamiento/);
  bad("uiList", { source: { kind: "invented" } }, /source\.kind/);
  assert.ok(validateElement(sample("uiList", { in: undefined }), 0, 30).errors.some((m) => /entra|"in"/i.test(m)), "timing is still required");
  bad("uiList", { rows: [...sample("uiList").rows, { title: "x" }] }, /1 a 4 filas \(tiene 5\)/);
  const m = validateMotion([sample("uiStat"), sample("uiFeed", { out: 99 })], 30);
  assert.equal(m.errors.length, 0);
  assert.ok(m.warnings.some((w) => /termina después del video/.test(w)));
});

test("ui elements survive time edits (feed items have no `at`) and expose labels for the timeline", () => {
  const f = sample("uiFeed");
  const moved = shiftTime(f, 2);
  assert.equal(moved.in, 3);
  assert.ok(moved.items.every((i) => i.at === undefined), "no NaN `at` written into feed items");
  assert.equal(elementLabel(sample("uiIcons")), "whatsapp · instagram · facebook");
  assert.equal(textKeyOf(sample("uiStat")), "label");
});

test("uiList is prefilled from Reda products when products.json has them", () => {
  const doc = { products: [
    { id: "a", name: "Depa 501", price: 3986811.18, source: "reda", fetchedAt: "2026-10-20T10:00:00Z", attributes: { Tipo: "Urban", Superficie: "76.72 m²" }, images: [{ id: "i", src: "assets/products/ab.jpg" }] },
    { id: "b", name: "Depa 605", price: 3977655.3, source: "reda", fetchedAt: "2026-10-22T10:00:00Z" },
    { id: "c", name: "Mesa", price: 10, source: "manual" }] };
  const p = listFromProducts(doc);
  assert.equal(p.rows.length, 2);
  assert.equal(p.rows[0].thumb, "../assets/products/ab.jpg");
  assert.equal(p.rows[0].meta, "Urban · 76.72 m²");
  assert.deepEqual(p.source, { kind: "reda", ref: "products.json", fetchedAt: "2026-10-22T10:00:00Z" });
  assert.equal(listFromProducts({ products: [doc.products[2]] }), null);
  assert.equal(listFromProducts(null), null);
});

test("review uiNumbersSource: no source = red, fictional = yellow, stale Reda = yellow, fresh / other = green; no numbers = no item", () => {
  const run = (el) => runReview({ duration: 30, motion: [el] });
  const list = (source) => sample("uiList", { source });
  const noSource = sample("uiList"); delete noSource.source;
  assert.deepEqual(sev(run(noSource), "uiNumbersSource"), ["red"]);
  assert.match(run(noSource).items.find((i) => i.check === "uiNumbersSource").title, /[Cc]ifra sin fuente/);
  assert.deepEqual(sev(run(list({ kind: "fictional" })), "uiNumbersSource"), ["yellow"]);
  assert.match(run(list({ kind: "fictional" })).items.find((i) => i.check === "uiNumbersSource").detail, /cifras ilustrativas: confirma antes de publicar/i);
  const old = new Date(Date.now() - 8 * 864e5).toISOString(), fresh = new Date(Date.now() - 864e5).toISOString();
  assert.deepEqual(sev(run(list({ kind: "reda", fetchedAt: old })), "uiNumbersSource"), ["yellow"]);
  assert.deepEqual(sev(run(list({ kind: "reda" })), "uiNumbersSource"), ["yellow"], "undated Reda data counts as old");
  assert.deepEqual(sev(run(list({ kind: "reda", fetchedAt: fresh })), "uiNumbersSource"), ["green"]);
  assert.deepEqual(sev(run(list({ kind: "screenshot", ref: "crm/inventario" })), "uiNumbersSource"), ["green"]);
  assert.deepEqual(sev(run(sample("uiIcons")), "uiNumbersSource"), [], "icons show no numbers");
  assert.deepEqual(sev(run(sample("uiFeed")), "uiNumbersSource"), []);
  assert.deepEqual(sev(run({ ...list({ kind: "fictional" }), hidden: true }), "uiNumbersSource"), []);
  assert.deepEqual(sev(run(sample("uiStat", { source: undefined })), "uiNumbersSource"), ["red"], "a stat always shows a number");
});

test("review uiPlacement: inside the safe zones and off the face box (only when face data exists)", () => {
  const el = sample("uiList", { source: { kind: "screenshot" } });
  const plan = (rect, faceOverlap = 0, faceZoneOverlap = 0, faces = [{ clip: "a", source: "vision", samples: 3 }]) => ({ rects: [rect], report: { faces, elements: [{ rect, mode: "fixed", window: [1, 4.4], faceOverlap, faceZoneOverlap, collidesWith: [] }] } });
  const ok = { x: 90, y: 790, w: 900, h: 750 };
  const r = (p, zones) => runReview({ duration: 30, motion: [el], plan: p, zones });
  assert.deepEqual(sev(r(plan(ok)), "uiPlacement"), ["green"]);
  assert.deepEqual(sev(r(plan({ ...ok, y: 900 })), "uiPlacement"), ["red"], "bottom edge past the platform zone (1540)");
  assert.deepEqual(sev(r(plan({ ...ok, x: 20 })), "uiPlacement"), ["red"], "left margin");
  assert.deepEqual(sev(r(plan(ok), { top: 220, bottom: 480, left: 60, right: 130 }), "uiPlacement"), ["red"], "custom zones (TikTok-like) shrink the safe area");
  assert.deepEqual(sev(r(plan(ok, 0.2)), "uiPlacement"), ["red"], "covers the face");
  assert.deepEqual(sev(r(plan(ok, 0, 0.3)), "uiPlacement"), ["yellow"], "touches the face zone");
  assert.deepEqual(sev(r(plan(ok, 0.5, 0.5, [])), "uiPlacement"), ["green"], "no face data in the comp: the face rule is skipped");
  assert.ok(!r(plan(ok, 0.5)).items.some((i) => i.check === "faces" && i.severity !== "green"), "the generic faces rule leaves ui elements to uiPlacement");
  assert.ok(!r(plan({ ...ok, y: 900 })).items.some((i) => i.check === "zones" && i.severity !== "green"));
});

test("review claims scanner also reads the text of ui elements", () => {
  const r = runReview({ duration: 30, motion: [sample("uiList", { source: { kind: "brand" }, title: "El mejor precio garantizado" })] });
  assert.ok(r.items.some((i) => i.check === "claims"));
});

test("every field kind used by a ui type has a control in the inspector (guards against a silently dropped editor)", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../client/inspector.js", import.meta.url), "utf8");
  const kinds = new Set();
  const walk = (f) => { kinds.add(f.kind); if (f.kind === "blocks") { for (const g of f.fields({})) kinds.add(g.kind); if (f.children) for (const g of f.children.fields({ kind: "option" })) kinds.add(g.kind); } };
  for (const t of UI_TYPES) for (const f of [...TYPES[t].fields, ...TYPES[t].screen, ...TYPES[t].source]) walk(f);
  for (const k of kinds) assert.ok(src.includes(`case "${k}"`) || (k === "bool" && src.includes('case "bool"')), `inspector has no control for kind "${k}"`);
  assert.ok(src.includes("getPath(el, f.key)"), "control() reads dotted paths");
});
