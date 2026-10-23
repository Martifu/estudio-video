// Spec of the qrCard element and of the QR encoder in _app.js (node --test; motion-lib.test.mjs loads it too).
// REFERENCE: REF_ROWS is the output of python-qrcode 8.x (an independent implementation, BSD-3-Clause) for "https://modo.mx/agenda",
// error correction M, version 2, byte mode, mask 2 (qrcode.QRCode(version=2, error_correction=M, border=0); add_data(s, optimize=0);
// makeImpl(False, 2)). python-qrcode and ours match on all 8 masks for the same inputs; segno differs on byte-aligned terminators.
import test from "node:test";
import assert from "node:assert/strict";
import { qrMatrix, qrVersionFor } from "./_app.js";
import Qr, { qrFor, scanPhase, qrTimeline } from "./qrCard.js";
import { recorder, env, ZONES } from "./_testkit.mjs";
import * as Lib from "./index.js";

const REF_URL = "https://modo.mx/agenda";
const REF_ROWS = [
  "1111111000011000101111111",
  "1000001000010111101000001",
  "1011101010001011001011101",
  "1011101011011111001011101",
  "1011101010011000101011101",
  "1000001010100011101000001",
  "1111111010101010101111111",
  "0000000010100010100000000",
  "1011111000000110001111100",
  "1100100010100100000100010",
  "0000101001001111010101011",
  "1010100010101001010110001",
  "0001101110110110111010111",
  "1000100011101000100101010",
  "1010101111100011111111011",
  "1010110101101001101110001",
  "1001011111001110111110100",
  "0000000011000001100011000",
  "1111111001111000101010111",
  "1000001010110010100011000",
  "1011101011110001111110111",
  "1011101010101101111011111",
  "1011101010000110100001101",
  "1000001000001101110111001",
  "1111111011101011010111111",
];
const asRows = (m) => m.map((r) => r.map((x) => (x ? "1" : "0")).join(""));

test("encoder: the reference matrix (python-qrcode, M, v2, mask 2) is reproduced exactly", () => {
  assert.deepEqual(asRows(qrMatrix(REF_URL, "M", { version: 2, mask: 2 })), REF_ROWS);
  assert.deepEqual(asRows(qrMatrix(REF_URL, "M")), REF_ROWS, "the default mask choice is 2 for this input");
});

test("encoder: finder patterns, separators and the dark module sit where the standard puts them", () => {
  const m = qrMatrix(REF_URL, "M");
  const n = m.length;
  assert.equal(n, 25);
  for (const [r0, c0] of [[0, 0], [0, n - 7], [n - 7, 0]]) {
    for (let i = 0; i < 7; i += 1) {
      assert.equal(m[r0][c0 + i], true, "top edge dark");
      assert.equal(m[r0 + 6][c0 + i], true, "bottom edge dark");
      assert.equal(m[r0 + i][c0], true, "left edge dark");
      assert.equal(m[r0 + i][c0 + 6], true, "right edge dark");
    }
    assert.equal(m[r0 + 1][c0 + 1], false, "inner ring light");
    assert.equal(m[r0 + 3][c0 + 3], true, "centre dark");
    assert.equal(m[r0 + 3][c0 + 2], true, "centre block dark");
  }
  assert.equal(m[n - 8][8], true, "dark module");
  for (let i = 0; i < 8; i += 1) { assert.equal(m[7][i], false, "separator row light"); assert.equal(m[i][7], false, "separator column light"); }
});

test("encoder: timing patterns alternate from the finder edge, and the version-2 alignment pattern is centred on (18, 18)", () => {
  const m = qrMatrix(REF_URL, "M");
  for (let i = 8; i < m.length - 8; i += 1) { assert.equal(m[6][i], i % 2 === 0, "horizontal timing"); assert.equal(m[i][6], i % 2 === 0, "vertical timing"); }
  assert.equal(m[18][18], true);
  assert.equal(m[17][18], false);
  assert.equal(m[16][18], true);
  assert.equal(m[18][16], true);
});

test("encoder: a short text uses version 1 (21 x 21); the size grows with the version", () => {
  assert.equal(qrVersionFor(4, "M"), 1);
  assert.equal(qrMatrix("hola", "M").length, 21);
  assert.equal(qrMatrix(REF_URL, "M").length, 25);
  const long = "x".repeat(150);
  assert.equal(qrMatrix(long, "M").length, 17 + 4 * qrVersionFor(long.length, "M"));
  assert.throws(() => qrMatrix("x".repeat(400), "H"), /no cabe/);
});

test("encoder: the output is deterministic (same input, same matrix)", () => {
  assert.deepEqual(qrMatrix("cita 10:00", "Q"), qrMatrix("cita 10:00", "Q"));
});

test("scan line: a triangle wave that starts and ends at the top and reaches the bottom in the middle of each trip", () => {
  assert.equal(scanPhase(1, 1, 1.6), 0);
  assert.ok(Math.abs(scanPhase(1.8, 1, 1.6) - 1) < 1e-9);
  assert.ok(Math.abs(scanPhase(2.6, 1, 1.6)) < 1e-9);
});

test("qrCard: the matrix is cached per url and level (pure memo)", () => {
  assert.equal(qrFor(REF_URL, "M"), qrFor(REF_URL, "M"));
  assert.notEqual(qrFor(REF_URL, "M"), qrFor(REF_URL, "H"));
});

test("qrCard: the drawn dark modules are exactly the matrix (one fill per dark module, plus the scan line)", () => {
  const el = { ...Lib.sampleOf("qrCard", {}), in: 1, out: 4.2 };
  const dark = qrFor(el.url, "M").flat().filter(Boolean).length;
  const mid = []; Lib.draw(recorder(mid), el, 1 + 2.0, env());
  const fills = mid.filter((s) => s.startsWith("fillRect(")).length;
  assert.ok(fills >= dark, `fills ${fills} >= dark ${dark}`);
  assert.ok(fills <= dark + 1, "only the scan line adds one more rect");
  assert.ok(mid.some((s) => s.startsWith("fillText(")), "the caption is drawn");
});

test("qrCard: validation refuses an empty or long address and bad levels", () => {
  const ok = Qr.defaults(0, 9);
  assert.deepEqual(Qr.validate(ok, "x").errors, []);
  assert.match(Qr.validate({ ...ok, url: "" }, "x").errors.join(" "), /dirección/);
  assert.match(Qr.validate({ ...ok, url: "h".repeat(151) }, "x").errors.join(" "), /máximo 150/);
  assert.match(Qr.validate({ ...ok, ecc: "Z" }, "x").errors.join(" "), /L, M, Q o H/);
  assert.match(Qr.validate({ ...ok, scanSpeed: 9 }, "x").errors.join(" "), /barrido/);
});

test("qrCard: the lite timeline (short elements) has no scan line beat and ends its exit at Ld", () => {
  const lite = qrTimeline({}, "lite");
  assert.equal(lite.b.sweep, undefined);
  assert.equal(lite.b.exit[1], lite.Ld);
  const full = qrTimeline({}, "full");
  assert.ok(full.b.sweep && full.b.sweep[1] <= full.b.exit[1] + 0.2);
});
