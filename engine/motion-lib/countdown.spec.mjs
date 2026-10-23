// Spec of countdown (imported by engine/motion-lib.test.mjs).
import test from "node:test";
import assert from "node:assert/strict";
import * as Lib from "./index.js";
import { recorder, env } from "./_testkit.mjs";
import { cellDigit, ticker } from "./countdown.js";
import { parseRemaining, validDeadline } from "./_venta.js";

const el = (over = {}) => ({ id: "cd", type: "countdown", in: 0, out: 3.2, label: "Termina la preventa", from: "03:14:22:10", offerEnds: "2026-11-30 23:59", source: { kind: "brand" }, ...over });

test("countdown: DD:HH:MM:SS parses and rejects malformed values", () => {
  assert.equal(parseRemaining("03:14:22:10"), 3 * 86400 + 14 * 3600 + 22 * 60 + 10);
  assert.equal(parseRemaining("00:24:00:00"), null, "hours go to 23");
  assert.equal(parseRemaining("00:00:60:00"), null, "seconds go to 59");
  assert.equal(parseRemaining("10:00"), null);
  assert.equal(validDeadline("2026-11-30 23:59"), true);
  assert.equal(validDeadline("2026-13-01"), false);
});

test("countdown: it ticks in real seconds (one whole second per second of video) and slides only at the tick", () => {
  assert.equal(ticker(10, 0).m, 10);
  assert.equal(ticker(10, 0.5).m, 9, "the second changes after exactly one second");
  assert.equal(ticker(10, 1.0).m, 9);
  assert.ok(ticker(10, 0.9).u > 0.05, "the slide is not running before the tick");
  assert.ok(ticker(10, 1.01).u < 0.05, "the slide starts at the tick");
  // tabular cells: the digit of each place value
  assert.equal(cellDigit(3 * 86400 + 14 * 3600 + 22 * 60 + 10, 0, 0), 3, "days");
  assert.equal(cellDigit(14 * 3600 + 22 * 60 + 10, 1, 0), 4, "hours units");
  assert.equal(cellDigit(22 * 60 + 10, 2, 1), 2, "minutes tens");
  assert.equal(cellDigit(10, 3, 0), 0, "seconds units");
});

test("countdown: it never reaches zero inside the element, and the drawn value is the remaining time", () => {
  const log = [];
  Lib.draw(recorder(log), el(), 2.0, env());
  const digits = log.filter((l) => /^fillText\d,/.test(l) || /^fillText\(\d,/.test(l)).length;
  assert.ok(digits >= 8, "eight digit cells are drawn");
  // at the start the seconds read 10 (no slide: u = 1 at a whole second)
  const first = []; Lib.draw(recorder(first), el(), 0.0, env());
  assert.ok(first.some((l) => l.startsWith("fillText(1,")), "a 1 (tens of seconds) is drawn");
});

test("countdown: validation needs a remaining time longer than the element, a real end, and warns when it is illustrative", () => {
  assert.ok(Lib.validate(el({ from: "00:00:00:02" }), "cd").errors.some((e) => e.includes("no puede llegar a cero")));
  assert.ok(Lib.validate(el({ offerEnds: undefined }), "cd").errors.some((e) => e.includes("fecha real")));
  assert.ok(Lib.validate(el({ from: "9" }), "cd").errors.some((e) => e.includes("DD:HH:MM:SS")));
  assert.ok(Lib.validate(el({ source: { kind: "fictional" } }), "cd").warnings.some((w) => w.includes("fecha real de la oferta")));
  assert.deepEqual(Lib.validate(el(), "cd").errors, []);
  assert.deepEqual(Lib.validate(el(), "cd").warnings, []);
});
