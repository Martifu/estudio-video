// Spec of compareTable (imported by engine/motion-lib.test.mjs).
import test from "node:test";
import assert from "node:assert/strict";
import * as Lib from "./index.js";
import { tableTimeline } from "./compareTable.js";
import { recorder, env } from "./_testkit.mjs";

const el = (rows) => ({ id: "ct", type: "compareTable", in: 0, out: 5, rows });
const three = [{ label: "A", ours: true, theirs: false }, { label: "B", ours: true, theirs: true }, { label: "C", ours: false, theirs: false }];

test("compareTable: rows reveal one by one, in order", () => {
  const tl = tableTimeline(el(three));
  assert.ok(tl.b.rows.step > 0 && tl.b.rows.dur > 0);
  assert.ok(Math.abs(tl.b.exit[1] - tl.Ld) < 1e-9);
});

test("compareTable: only a true 'ours' ticks (an unchecked bool is removed by the inspector, so it must read as a cross)", () => {
  const draw = (rows) => { const log = []; Lib.draw(recorder(log), el(rows), 4.2, env()); return log.join("|"); };
  assert.notEqual(draw([{ label: "x", ours: true }, { label: "y" }]), draw([{ label: "x" }, { label: "y" }]));
  assert.deepEqual(Lib.texts(el([{ label: "Solo" }])), ["Solo"]);
  assert.equal(Lib.validate(el([{ label: "x", ours: true }]), "ct").errors.length, 1, "needs 2 to 6 rows");
  assert.deepEqual(Lib.validate(el(three.slice(0, 2)), "ct").errors, []);
  assert.equal(Lib.validate(el(three.concat(three, [{ label: "z" }])), "ct").errors.length, 1, "more than six rows is an error");
});
