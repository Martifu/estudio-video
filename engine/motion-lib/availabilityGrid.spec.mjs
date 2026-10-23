// Spec of availabilityGrid (imported by engine/motion-lib.test.mjs): counter from the data, exact landing, facade geometry, validation.
import test from "node:test";
import assert from "node:assert/strict";
import * as Lib from "./index.js";
import { recorder, env } from "./_testkit.mjs";
import { availability, cellRect, avSize, cellFill, availableColor } from "./availabilityGrid.js";
import { lum } from "./_kit.js";

const el = { id: "v", type: "availabilityGrid", in: 0, out: 4.4, title: "T", levels: 4, perLevel: 3,
  cells: ["Disponible", "Separados", "Disponible", "Disponible", "Formalizados", "Disponible", "Cerrado", "Disponible", "Disponible", "Disponible", "Separados", "Disponible"], highlight: 5, callout: "Tu opción: 402" };

test("availabilityGrid: the counter is the number of Disponible cells, of the total", () => {
  assert.deepEqual(availability(el), { total: 12, available: 8 });
  assert.deepEqual(availability({ cells: ["disponible", " Disponible "] }), { total: 2, available: 2 });
});

test("availabilityGrid: the counter counts up monotonically, never shows a fake 0, and lands on the available number", () => {
  let prev = -1, last = "", first = "";
  for (let t = 0.3; t < 4.3; t += 1 / 30) {
    const log = [];
    Lib.draw(recorder(log), el, t, env());
    // the hero counter is drawn at (40,158), 112 px
    const hit = log.map((l) => /^fillText\((\d+),40,158\)$/.exec(l)).filter(Boolean);
    if (!hit.length) continue;
    const n = Number(hit[0][1]);
    if (first === "") first = hit[0][1];
    assert.ok(n >= prev && n <= 8, `went from ${prev} to ${n}`);
    prev = n; last = hit[0][1];
  }
  assert.equal(last, "8");
  assert.ok(Number(first) >= 4, `the first visible counter must be a believable start, got ${first}`);
});

test("availabilityGrid: cells sit inside the facade and the card fits the band", () => {
  for (let r = 0; r < 4; r += 1) for (let c = 0; c < 3; c += 1) {
    const cr = cellRect(el, r, c);
    assert.ok(cr.x >= 0 && cr.x + cr.w <= 600 && cr.y >= 0, `cell ${r},${c}`);
  }
  assert.ok(avSize(el).h <= 760);
});

test("availabilityGrid: the cell count must match levels x units per level; the highlight must exist", () => {
  assert.ok(Lib.validate({ ...el, cells: ["Disponible"] }, "v").errors.some((m) => /estados/.test(m)));
  assert.ok(Lib.validate({ ...el, highlight: 99 }, "v").errors.some((m) => /destacada/.test(m)));
  assert.deepEqual(Lib.validate(el, "v").errors, []);
});

test("availabilityGrid: palette crm uses the exact skin status colours", () => {
  const e = env({ skin: { ...env().skin, status: { separados: "#01A0C6" } } });
  assert.equal(cellFill(e.skin, "Separados", "crm"), "#01A0C6");
  assert.equal(Lib.validate({ ...el, palette: "crm" }, "v").errors.length, 0);
});

test("availabilityGrid: default palette venta makes available read green and the rest darker neutrals", () => {
  const skin = env().skin;
  assert.equal(cellFill(skin, "Disponible"), skin.colors.success);
  const L = (h) => lum(h);
  const sep = cellFill(skin, "Separados"), form = cellFill(skin, "Formalizados"), cer = cellFill(skin, "Cerrado");
  assert.ok(L(sep) > L(form) && L(form) > L(cer), "lightness decreases Separados > Formalizados > Cerrado");
  assert.equal(Lib.validate({ ...el, palette: "rosa" }, "v").errors.length, 1);
  assert.equal(availableColor(skin, "venta"), skin.colors.success);
});

test("availabilityGrid: the highlighted unit is drawn in the accent colour under venta", () => {
  const log = [];
  Lib.draw(recorder(log), { ...el }, 3.5, env());
  assert.ok(log.some((l) => l === `fillStyle=${env().skin.colors.accent}`), "accent fill for the highlighted unit");
});
