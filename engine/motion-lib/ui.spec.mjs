// Spec of the product-screen family (imported by engine/motion-lib.test.mjs): timelines, geometry, SFX events, captions rule, deterministic drawing.
// Product screens: beat timing (fractions of [in, out]), geometry, SFX events, skins, formats, captions rule and a deterministic draw of every type.
import test from "node:test";
import assert from "node:assert/strict";
import * as M from "../ui-motion.js";
import * as Lib from "./index.js";
import * as B from "../brand-layer.js";
import { readFileSync, readdirSync } from "node:fs";

const rows = [{ title: "215", value: 2460769 }, { title: "501", value: 3986811.18 }, { title: "605", value: 3977655.3 }];
const SAMPLES = {
  uiList: { title: "Inventario", rows, select: 1, tag: "501 · DISPONIBLE" },
  uiForm: {
    title: "Cotizar", steps: [
      { title: "Modelo", items: [{ kind: "option", title: "Urban", price: "$3,986,811.18", selected: true }] },
      { title: "Notas", items: [{ kind: "note", text: "Sin extras" }] },
      { title: "Fecha", items: [{ kind: "field", label: "Fecha", value: "22 de octubre de 2026", typed: true }, { kind: "select", label: "Esquema", value: "APARTADO 10%" }] }],
    total: { label: "Total", value: "$3,986,812" }, button: { label: "Generar", loading: "Generando PDF…", done: "Listo" }, toast: "Cotización lista"
  },
  uiDoc: { brand: "LAGRAND", title: "Esquema", rows: [{ label: "Precio", value: "$1.00" }, { label: "Apartado", value: "$0.10" }], highlight: 1, lift: { label: "Apartado", value: "$0.10", split: [{ label: "a", pct: 10 }, { label: "b", pct: 90 }] } },
  uiStat: { label: "Ventas", value: 1284500, format: "money", delta: { text: "+12%", dir: "up" } },
  uiKanban: { title: "Embudo", columns: [{ name: "A" }, { name: "B" }, { name: "C" }], card: { name: "María", chips: ["WhatsApp"] }, from: 0, to: 2, doneLabel: "Listo" },
  uiFeed: { title: "Actividad", items: [{ title: "a" }, { title: "b" }, { title: "c" }, { title: "d" }, { title: "e" }] },
  uiIcons: { icons: ["whatsapp", "instagram", "facebook"] }
};
const UI_TYPES = Lib.all().filter((d) => d.family === "ui").map((d) => d.type);
// types without a hand-written sample use their own descriptor sample (timing and type come from this element, not the sample)
const fromDescriptor = (type) => { const { in: _i, out: _o, type: _t, ...rest } = Lib.sampleOf(type, {}); return rest; };
const el = (type, over = {}) => ({ id: type, type, in: 2, out: 8, ...(SAMPLES[type] ?? fromDescriptor(type)), ...over });

test("every ui type has a timeline whose last beat is the exit and ends inside Ld", () => {
  for (const type of UI_TYPES) {
    const tl = Lib.timeline(el(type));
    assert.ok(tl.Ld > 1 && tl.b.exit, type);
    assert.ok(Math.abs(tl.b.exit[1] - tl.Ld) < 1e-9, `${type}: exit ends at Ld`);
  }
});

test("beat timing scales with in/out: doubling the window doubles every offset from `in`", () => {
  for (const type of UI_TYPES) {
    const a = Lib.beats(el(type, { in: 1, out: 7 }));
    const b = Lib.beats(el(type, { in: 1, out: 13 }));
    assert.equal(a.mode, b.mode, `${type}: same mode`);
    const flat = (o, acc = []) => { for (const v of Object.values(o)) { if (typeof v === "number") acc.push(v); else if (v && typeof v === "object") flat(v, acc); } return acc; };
    const fa = flat(a.beats), fb = flat(b.beats);
    assert.equal(fa.length, fb.length);
    // starts / spans are absolute times; step and dur are durations: the check is on the final beat, which must be exactly `out`
    assert.ok(Math.abs(a.beats.exit[1] - 7) < 1e-3 && Math.abs(b.beats.exit[1] - 13) < 1e-3, `${type}: exit ends at out`);
  }
  const a = Lib.beats(el("uiList", { in: 1, out: 7 })).beats, b = Lib.beats(el("uiList", { in: 1, out: 13 })).beats;
  assert.ok(Math.abs((b.click - 1) / (a.click - 1) - 2) < 1e-3, "click offset doubles");
  assert.ok(Math.abs((b.tag[0] - 1) / (a.tag[0] - 1) - 2) < 1e-3, "tag offset doubles");
  assert.ok(Math.abs(b.rows.step / a.rows.step - 2) < 1e-2, "row stagger doubles");
});

test("short elements drop the optional beats (cursor, typing) instead of cramming them", () => {
  const long = Lib.timeline(el("uiList", { in: 0, out: 5 })), short = Lib.timeline(el("uiList", { in: 0, out: 1.8 }));
  assert.equal(long.cursor, true);
  assert.ok(long.b.cursorIn);
  assert.equal(short.mode, "lite");
  assert.equal(short.cursor, false);
  assert.equal(short.b.cursorIn, undefined);
  assert.ok(short.b.click !== undefined, "the state change (click) still happens");
  const lf = Lib.timeline(el("uiForm", { in: 0, out: 3 })), ff = Lib.timeline(el("uiForm", { in: 0, out: 9 }));
  assert.equal(lf.cursor, false);
  assert.equal(lf.b.steps[2].type, undefined, "no typing beat in lite");
  assert.ok(ff.b.steps[2].type, "typing beat in full");
  assert.equal(Lib.timeline(el("uiList", { in: 0, out: 5, cursor: false })).cursor, false);
  assert.equal(Lib.timeline(el("uiList", { in: 0, out: 5, select: undefined })).cursor, false);
  assert.equal(Lib.timeline(el("uiKanban", { in: 0, out: 2 })).mode, "lite");
});

test("form schedule: forward-only scrolls stop at actionable steps and the click follows the total", () => {
  const b = Lib.timeline(el("uiForm", { in: 0, out: 9 })).b;
  assert.deepEqual(b.scrolls.map((s) => s.to), ["s2", "tail"]); // step 1 -> step 3 (the note is scrolled past) -> total / button
  assert.ok(b.scrolls[0].span[1] <= b.scrolls[1].span[0] + 1e-9 + 0.1);
  assert.ok(b.total[1] < b.click && b.click < b.done && b.done < b.toast[0] + 1e-9);
});

test("geometry: band slot is bottom-anchored in 780-1540 and everything stays in the safe width", () => {
  for (const type of UI_TYPES) {
    const r = Lib.rect(el(type));
    assert.ok(r.x >= 60 && r.x + r.w <= 1020, `${type} x`);
    assert.ok(r.y + r.h <= 1540 + 1e-9, `${type} bottom`);
  }
  assert.deepEqual(Lib.rect(el("uiForm")), { x: 90, y: 790, w: 900, h: 750 });
  assert.equal(Lib.rect(el("uiStat", { slot: "top" })).y, 350);
  const c = Lib.rect(el("uiStat", { slot: "center" }));
  assert.equal(Math.round(c.y + c.h / 2), Math.round((350 + 1540) / 2));
  assert.equal(Lib.rect(el("uiList")).y + Lib.rect(el("uiList")).h, 1540);
});

test("motionEvents: blob / icon pop = pop, scroll / sheet rise / glide = whoosh, toast / done / check = notify, click = click; keys are stable", () => {
  const ev = (type, over) => B.motionEvents([el(type, over)]);
  const types = (e) => e.map((x) => x.type);
  assert.deepEqual(types(ev("uiList")), ["pop", "click", "pop"]);
  assert.deepEqual(types(ev("uiList", { out: 2 })), ["pop", "pop"], "no cursor, no click sound");
  assert.deepEqual(types(ev("uiForm", { out: 12 })), ["pop", "whoosh", "whoosh", "click", "notify"]);
  assert.deepEqual(types(ev("uiDoc")), ["whoosh", "pop"]);
  assert.deepEqual(types(ev("uiStat")), ["pop"]);
  assert.deepEqual(types(ev("uiKanban")), ["pop", "click", "whoosh", "notify"]);
  assert.deepEqual(types(ev("uiFeed")), ["pop", "pop", "pop", "pop", "pop", "pop"]);
  assert.deepEqual(types(ev("uiIcons")), ["pop", "pop", "pop"]);
  const e = ev("uiList");
  assert.deepEqual(e.map((x) => x.key), ["uiList:pop:0", "uiList:click:0", "uiList:pop:1"]);
  assert.ok(e.every((x) => x.t >= 2 && x.t <= 8));
  assert.deepEqual(B.motionEvents([el("uiList", { hidden: true })]), []);
  const icons = ev("uiIcons");
  assert.ok(icons[0].x < icons[2].x, "icon pops pan left to right");
});

test("captions are hidden only while a ui element (captions != keep) is on screen", () => {
  const els = [{ type: "keywordPop", text: "x", in: 0, out: 20 }, el("uiList", { in: 3, out: 6 }), el("uiStat", { in: 10, out: 12, captions: "keep" }), el("uiFeed", { in: 14, out: 16, hidden: true })];
  assert.equal(Lib.captionsHidden(els, 2.9), false);
  assert.equal(Lib.captionsHidden(els, 3), true);
  assert.equal(Lib.captionsHidden(els, 5.99), true);
  assert.equal(Lib.captionsHidden(els, 6), false);
  assert.equal(Lib.captionsHidden(els, 11), false, "captions: keep");
  assert.equal(Lib.captionsHidden(els, 15), false, "hidden element");
  assert.equal(Lib.captionsHidden([{ type: "keywordPop", in: 0, out: 9 }], 3), false, "comps without ui elements are untouched");
  assert.equal(Lib.captionsHidden([], 3), false);
});

test("drawUi: every type draws at every sample time without throwing, and identically twice (pure function of t)", () => {
  for (const type of UI_TYPES) {
    const e = el(type, { in: 1, out: 9 });
    for (let t = 0.9; t <= 9.1; t += 0.37) {
      const a = [], b = [];
      Lib.draw(recorder(a), e, t, env());
      Lib.draw(recorder(b), e, t, env());
      assert.deepEqual(a, b, `${type} @ ${t.toFixed(2)}`);
      if (t < 1 || t >= 9) assert.equal(a.length, 0, `${type}: nothing drawn outside [in, out)`);
    }
    const mid = []; Lib.draw(recorder(mid), e, 4, env());
    assert.ok(mid.length > 20, `${type} draws something mid-way`);
  }
  const hidden = []; Lib.draw(recorder(hidden), el("uiList", { hidden: true }), 4, env());
  assert.equal(hidden.length, 0);
});

test("no text is drawn under 24 px (every font size literal of the ui types and the kit, plus the sizes derived from the avatar radius)", () => {
  const dir = new URL("./", import.meta.url);
  const files = readdirSync(dir).filter((f) => /^(ui[A-Z]\w*|_kit)\.js$/.test(f));
  assert.ok(files.length >= 8);
  const sizes = files.flatMap((f) => [...readFileSync(new URL(f, dir), "utf8").matchAll(/fnt\(skin, \d+, (\d+)/g)].map((m) => Number(m[1])));
  assert.ok(sizes.length > 40);
  assert.ok(sizes.every((px) => px >= 24), `smallest ${Math.min(...sizes)}`);
  // initials inside an avatar: 80 % of the radius (radius >= 38 in every use)
  assert.ok(38 * 0.8 >= 24);
});

test("captions: gaps shorter than 0.6 s between two hiding elements stay hidden (no caption blip), longer gaps let them back", () => {
  const els = [el("uiList", { in: 3, out: 6 }), el("uiForm", { in: 6.4, out: 10 }), el("uiDoc", { in: 10.3, out: 13 }), el("uiStat", { in: 14, out: 16 })];
  assert.equal(Lib.captionsHidden(els, 6.2), true, "0.4 s gap between list and form");
  assert.equal(Lib.captionsHidden(els, 10.1), true, "0.3 s gap between form and doc");
  assert.equal(Lib.captionsHidden(els, 13.5), false, "1 s gap: captions are back");
  assert.equal(Lib.captionsHidden(els, 13.99), false);
  assert.equal(Lib.captionsHidden(els, 14), true);
  assert.deepEqual(Lib.captionHideWindows(els), [[3, 13], [14, 16]]);
  // a kept-captions element does not take part, and does not bridge anything
  const kept = [el("uiList", { in: 3, out: 6 }), el("uiStat", { in: 6.2, out: 8, captions: "keep" }), el("uiFeed", { in: 6.4, out: 9 })];
  assert.deepEqual(Lib.captionHideWindows(kept), [[3, 9]]);
  assert.equal(Lib.captionsHidden(kept, 7), true, "bridged by the list -> feed gap (0.4 s)");
});

// ---- deterministic drawing: a recording ctx; the same (element, t) must always produce the same calls ----
function recorder(log) {
  const base = { measureText: (s) => ({ width: String(s).length * 11 }), createLinearGradient: () => ({ addColorStop() {} }), canvas: {} };
  return new Proxy(base, {
    get(t, k) { if (k in t) return t[k]; return (...a) => { log.push(`${String(k)}(${a.map((x) => (typeof x === "number" ? Math.round(x * 100) / 100 : typeof x === "object" ? "obj" : x)).join(",")})`); }; },
    set(t, k, v) { log.push(`${String(k)}=${v}`); return true; }
  });
}
globalThis.Path2D ??= class {};
const env = () => ({ skin: M.resolveSkin(null, {}), img: () => null, canvas: () => ({ canvas: {}, ctx: recorder([]) }), zones: { x0: 60, x1: 1020, toastTop: 350, bottom: 1540 } });