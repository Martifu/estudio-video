// node --test transitions.test.mjs   (run from engine/; no DOM needed)
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as T from "./transitions/index.js";
import { createStaticHandler } from "./static-server.mjs";

const W = 1080, H = 1920, SEED = 7;
const BRAND = { primary: "#ff0000", ink: "#111111", paper: "#ffffff" };
const FROM = { id: "from" }, TO = { id: "to" };
const EXPECTED = ["cut", "flashWhite", "glitchRGB", "whipPan", "zoomPunch", "brandWipe", "irisCircle", "pushSlide", "blurCross", "fadeColor", "zoomMatch", "cardFlip"];
const DRAWING = new Set(["drawImage", "fillRect", "fill"]);
const STATE = ["globalAlpha", "globalCompositeOperation", "filter", "fillStyle"];

// Fake 2D context: records every drawing op with the state it was drawn with (alpha, composite, filter, matrix, clip).
// filterMode: "normal" (filter property exists), "absent" (no filter property), "ignored" (assignments do not stick).
function fakeCtx(filterMode = "normal") {
  const ops = [], stack = [];
  let m = [1, 0, 0, 1, 0, 0], clip = false;
  const r6 = (x) => Math.round(x * 1e6) / 1e6 + 0; // +0 turns -0 into 0
  const mul = (a, b) => [
    a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5],
  ];
  const rec = (op, src, args) => ops.push({
    op, src, args: args.map(r6), alpha: r6(ctx.globalAlpha), comp: ctx.globalCompositeOperation,
    filter: ctx.filter, fill: ctx.fillStyle, m: m.map(r6), clip,
  });
  const ctx = {
    globalAlpha: 1, globalCompositeOperation: "source-over", filter: "none", fillStyle: "#000000",
    save() {
      const props = Object.fromEntries(STATE.filter((k) => k in ctx).map((k) => [k, ctx[k]]));
      stack.push({ m, clip, props });
    },
    restore() {
      const s = stack.pop();
      if (!s) throw new Error("restore sin save");
      ({ m, clip } = s);
      for (const [k, v] of Object.entries(s.props)) ctx[k] = v;
    },
    translate(x, y) { m = mul(m, [1, 0, 0, 1, x, y]); },
    scale(x, y) { m = mul(m, [x, 0, 0, y, 0, 0]); },
    rotate(a) { m = mul(m, [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0]); },
    transform(a, b, c, d, e, f) { m = mul(m, [a, b, c, d, e, f]); },
    setTransform(a, b, c, d, e, f) { m = [a, b, c, d, e, f]; },
    beginPath() {}, arc() {}, rect() {},
    clip() { clip = true; },
    fill() { rec("fill", null, []); },
    fillRect(...a) { rec("fillRect", null, a); },
    drawImage(img, ...a) { rec("drawImage", img.id, a); },
  };
  if (filterMode === "absent") delete ctx.filter;
  if (filterMode === "ignored") Object.defineProperty(ctx, "filter", { get: () => "none", set() {}, enumerable: true, configurable: true });
  return { ctx, ops, open: () => stack.length };
}

function run(name, u, params = {}, { seed = SEED, filterMode } = {}) {
  const f = fakeCtx(filterMode);
  T.renderTransition(name, f.ctx, { from: FROM, to: TO, u, W, H, brand: BRAND, params, seed });
  return { ops: f.ops, open: f.open() };
}

/** Parameter sets to exercise: the defaults ({}) and, for each select, its second option. */
function variants(d) {
  const sel = d.params.filter((p) => p.kind === "select");
  return [{}, Object.fromEntries(sel.map((p) => [p.key, p.options[1][0]]))];
}

function assertFinalIsTo(ops, label) {
  const last = [...ops].reverse().find((o) => DRAWING.has(o.op));
  assert.ok(last, `${label}: sin operaciones de dibujo`);
  assert.equal(last.op, "drawImage", label);
  assert.equal(last.src, "to", label);
  const a = last.args;
  const full = a.length === 4 && a[0] === 0 && a[1] === 0 && a[2] === W && a[3] === H;
  const short = a.length === 2 && a[0] === 0 && a[1] === 0;
  assert.ok(full || short, `${label}: args del último drawImage ${JSON.stringify(a)}`);
  assert.equal(last.alpha, 1, `${label}: globalAlpha final`);
  assert.deepEqual(last.m, [1, 0, 0, 1, 0, 0], `${label}: transformación final`);
  assert.equal(last.clip, false, `${label}: clip activo al final`);
  assert.equal(last.comp, "source-over", `${label}: composición final`);
  assert.equal(last.filter, "none", `${label}: filtro final`);
}

const allFinite = (ops) => ops.every((o) => o.args.every((x) => Number.isFinite(x)) && o.m.every((x) => Number.isFinite(x)) && Number.isFinite(o.alpha));

// ---------- registry and descriptors ----------

test("el registro carga sin errores y tiene las 12 transiciones", () => {
  assert.deepEqual(T.LOAD_ERRORS, []);
  assert.deepEqual([...T.names()].sort(), [...EXPECTED].sort());
  const dir = fileURLToPath(new URL("./transitions/", import.meta.url));
  const onDisk = readdirSync(dir).filter(T.isTypeFile).sort();
  assert.deepEqual(onDisk, EXPECTED.map((n) => `${n}.js`).sort());
  assert.equal(T.isTypeFile("_helpers.js"), false);
  assert.equal(T.isTypeFile("index.js"), false);
});

for (const d of T.all()) {
  test(`${d.name}: descriptor valido`, () => {
    assert.deepEqual(T.checkDescriptor(d), []);
    assert.equal(T.get(d.name), d);
    assert.ok(T.has(d.name));
    assert.ok(["Corte", "Movimiento", "Marca", "Impacto", "Suave"].includes(d.category));
    assert.ok(d.defaultDur >= d.minDur && d.defaultDur <= d.maxDur, "defaultDur fuera de [minDur, maxDur]");
    assert.ok(d.impact >= 0 && d.impact <= 1);
    assert.ok(d.label.trim() && d.description.trim());
    if (d.sfx !== null) {
      assert.ok(["whoosh", "pop"].includes(d.sfx.kind));
      assert.equal(typeof d.sfx.offset, "number");
    }
    assert.ok(["crossfade", "dry"].includes(d.audio));
    for (const p of d.params) {
      assert.ok(p.key && p.label && p.label.trim(), `${d.name}: param sin key o label`);
      assert.ok(["select", "number"].includes(p.kind));
    }
  });
}

test("cut tiene duraciones en cero y sin efecto", () => {
  const c = T.get("cut");
  assert.deepEqual([c.defaultDur, c.minDur, c.maxDur], [0, 0, 0]);
  assert.equal(c.sfx, null);
});

test("byCategory respeta el orden fijo de categorias", () => {
  assert.deepEqual(T.byCategory().map((g) => g.category), ["Corte", "Movimiento", "Marca", "Impacto", "Suave"]);
  const total = T.byCategory().reduce((n, g) => n + g.items.length, 0);
  assert.equal(total, EXPECTED.length);
});

test("renderTransition con nombre desconocido lanza error en español", () => {
  assert.throws(() => T.renderTransition("noExiste", fakeCtx().ctx, { from: FROM, to: TO, u: 0, W, H }), /Transición desconocida/);
});

test("quantU", () => {
  assert.deepEqual(T.quantU(0.1, 0.2), { u: 0.5, frame: 3, frames: 6 });
  assert.deepEqual(T.quantU(0, 0.2), { u: 0, frame: 0, frames: 6 });
  assert.deepEqual(T.quantU(99, 0.2), { u: 1, frame: 6, frames: 6 });
  assert.equal(T.quantU(0, 0).frames, 1);
});

// ---------- render contract, for every transition and every param variant ----------

for (const name of EXPECTED) {
  test(`${name}: contrato de render`, () => {
    const d = T.get(name);
    for (const params of variants(d)) {
      const label = `${name} ${JSON.stringify(params)}`;
      const r0 = run(name, 0, params);
      const r1 = run(name, 1, params);
      assert.equal(r0.open, 0, `${label}: save/restore desbalanceado en u=0`);
      assert.equal(r1.open, 0, `${label}: save/restore desbalanceado en u=1`);

      // first drawing op: `from` at u=0 (cut is the exception: it draws `to` at every u)
      const first = r0.ops.find((o) => DRAWING.has(o.op));
      assert.ok(first, `${label}: sin dibujo en u=0`);
      assert.equal(first.src, name === "cut" ? "to" : "from", `${label}: primera operación en u=0`);

      // last drawing op at u=1: `to`, full, opaque, identity, nothing clipped
      assertFinalIsTo(r1.ops, `${label} u=1`);
      if (name === "cut") assertFinalIsTo(r0.ops, `${label} u=0`);

      // determinism
      assert.deepEqual(run(name, 0, params).ops, r0.ops, `${label}: u=0 no determinista`);
      assert.deepEqual(run(name, 1, params).ops, r1.ops, `${label}: u=1 no determinista`);

      // clamping: u outside [0, 1]
      assert.deepEqual(run(name, -3, params).ops, r0.ops, `${label}: u=-3 no se fija en 0`);
      assert.deepEqual(run(name, 7, params).ops, r1.ops, `${label}: u=7 no se fija en 1`);

      // interior frames: no throw, balanced state, finite numbers, deterministic
      for (const u of [0.25, 0.5, 0.75]) {
        const r = run(name, u, params);
        assert.equal(r.open, 0, `${label} u=${u}: save/restore desbalanceado`);
        assert.ok(r.ops.length > 0, `${label} u=${u}: sin dibujo`);
        assert.ok(allFinite(r.ops), `${label} u=${u}: número no finito en las operaciones`);
        assert.deepEqual(run(name, u, params).ops, r.ops, `${label} u=${u}: no determinista`);
      }
    }
  });
}

test("seed: mismo seed, mismo resultado; glitchRGB cambia con otra semilla", () => {
  assert.deepEqual(run("glitchRGB", 0.4, {}, { seed: 7 }).ops, run("glitchRGB", 0.4, {}, { seed: 7 }).ops);
  assert.notDeepEqual(run("glitchRGB", 0.4, {}, { seed: 7 }).ops, run("glitchRGB", 0.4, {}, { seed: 8 }).ops);
});

test("glitchRGB: en u=0 y u=1 no dibuja franjas de `to` sobre `from`", () => {
  const at0 = run("glitchRGB", 0, {});
  assert.ok(!at0.ops.some((o) => o.op === "drawImage" && o.src === "to"), "u=0 dibuja `to`");
});

test("static-server: /engine/transitions/manifest.json lista las transiciones", () => {
  const engineDir = fileURLToPath(new URL(".", import.meta.url));
  const handler = createStaticHandler({ engineDir, runDir: engineDir });
  let status = 0, body = "";
  const res = { writeHead(s) { status = s; return { end: (b) => { body = b; } }; } };
  handler({ url: "/engine/transitions/manifest.json", headers: {} }, res);
  assert.equal(status, 200);
  assert.deepEqual(JSON.parse(body).files, EXPECTED.map((n) => `${n}.js`).sort());
});

test("params invalidos caen al valor por defecto", () => {
  assert.deepEqual(run("whipPan", 0.5, { dir: "nope" }).ops, run("whipPan", 0.5, {}).ops);
  assert.deepEqual(run("irisCircle", 0.5, { centro: 3, modo: "x" }).ops, run("irisCircle", 0.5, {}).ops);
});

test("blurCross: sin soporte de ctx.filter (propiedad ausente) sigue dibujando un fundido", () => {
  for (const mode of ["absent", "ignored"]) {
    const r0 = run("blurCross", 0, {}, { filterMode: mode });
    assert.equal(r0.open, 0);
    assert.equal(r0.ops.find((o) => DRAWING.has(o.op)).src, "from");
    assertFinalIsTo(run("blurCross", 1, {}, { filterMode: mode }).ops, `blurCross ${mode}`);
    const mid = run("blurCross", 0.5, {}, { filterMode: mode });
    assert.equal(mid.open, 0);
    assert.ok(allFinite(mid.ops));
    assert.ok(mid.ops.some((o) => o.src === "from") && mid.ops.some((o) => o.src === "to"));
  }
});
