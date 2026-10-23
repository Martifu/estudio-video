// Behaviour proofs of chatInbox (bump reorder) and calendarPick (grid layout). Run through motion-lib.test.mjs.
import test from "node:test";
import assert from "node:assert/strict";
import { rowSlot, inboxTimeline } from "./chatInbox.js";
import cal, { dayCenter, chipCenter, calTimeline, CAL } from "./calendarPick.js";
import { envelope } from "./_kit.js";
import { env } from "./_testkit.mjs";

const rows = [{ name: "A" }, { name: "B" }, { name: "C" }, { name: "D" }];

test("chatInbox: the bumped row ends at the top and the rows above it move down by one", () => {
  const el = { type: "chatInbox", rows, bump: 2 };
  const tl = { b: inboxTimeline(el, "full").b, Ld: 0 };
  const end = tl.b.bump[1] + 0.01;
  assert.equal(rowSlot(el, 2, end, tl), 0, "bumped row at the top");
  assert.equal(rowSlot(el, 0, end, tl), 1, "row above moved down");
  assert.equal(rowSlot(el, 1, end, tl), 2, "row above moved down");
  assert.equal(rowSlot(el, 3, end, tl), 3, "row below stays");
  assert.equal(rowSlot(el, 2, 0, tl), 2, "before the bump nothing moved");
});

test("calendarPick: day 1 position follows startDay and rows wrap every 7 cells", () => {
  const w = 900;
  const mondayStart = dayCenter(w, 0, 1), sundayStart = dayCenter(w, 6, 1);
  assert.equal(mondayStart.x, CAL.pad + (900 - CAL.pad * 2) / 14);
  assert.equal(sundayStart.x, CAL.pad + 6 * ((900 - CAL.pad * 2) / 7) + (900 - CAL.pad * 2) / 14, "sunday is the seventh column");
  assert.equal(sundayStart.y, mondayStart.y, "day 1 on a Sunday start is in the first row");
  assert.equal(dayCenter(w, 0, 8).x, dayCenter(w, 0, 1).x, "day 8 sits under day 1");
  assert.equal(dayCenter(w, 0, 8).y - dayCenter(w, 0, 1).y, CAL.cellH);
  const c0 = chipCenter(w, 3, 0), c2 = chipCenter(w, 3, 2);
  assert.ok(c2.x > c0.x && c0.y === c2.y);
});

test("calendarPick: the day click comes before the chip click, and a day outside the month is an error", () => {
  const el = { type: "calendarPick", month: "Noviembre 2026", startDay: 0, daysInMonth: 30, day: 3, slots: ["10:00", "12:00"], chosen: 0 };
  const b = calTimeline(el, "full").b;
  assert.ok(b.dayClick > 0 && b.chipClick > b.dayClick);
  assert.equal(cal.validate({ ...el, day: 31 }, "t").errors.length, 1, "day beyond the month is an error");
});

// Every fill / text of calendarPick is drawn with an alpha no higher than the card's envelope alpha, from the exit start on
// (the chips used to overwrite the alpha with their own and stayed fully opaque after the card had left).
function alphaRecorder() {
  const log = [], stack = [];
  const base = {
    globalAlpha: 1, filter: "none", font: "", fillStyle: "", strokeStyle: "", textAlign: "left", textBaseline: "middle", lineWidth: 1,
    save() { stack.push(this.globalAlpha); }, restore() { this.globalAlpha = stack.pop() ?? 1; },
    measureText: (s) => ({ width: String(s).length * 20 }),
    fillText() { log.push(this.globalAlpha); }, fillRect() { log.push(this.globalAlpha); }, fill() { log.push(this.globalAlpha); },
  };
  const ctx = new Proxy(base, { get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, v) => { t[k] = v; return true; } });
  return { ctx, log };
}

test("calendarPick: after the exit starts, nothing is drawn with more alpha than the card", () => {
  const el = { type: "calendarPick", month: "Noviembre 2026", startDay: 6, daysInMonth: 30, day: 14, slots: ["10:00", "12:00", "16:30", "18:00"], chosen: 1, confirm: "Cita agendada", cursor: true };
  const tl = calTimeline(el, "full");
  tl.cursor = true;
  const rect = { x: 0, y: 0, w: 1000, h: 1000 };
  const exit0 = tl.b.exit[0];
  for (let k = 0; k <= 10; k += 1) {
    const ts = exit0 + (tl.Ld - exit0) * (k / 10);
    const { ctx, log } = alphaRecorder();
    cal.draw(ctx, el, ts, { ...env(), ts, tl, rect });
    const cardAlpha = envelope(tl, ts).alpha;
    assert.ok(log.every((a) => a <= cardAlpha + 1e-9), `t=${ts.toFixed(2)}: a child is drawn above the card alpha ${cardAlpha.toFixed(3)} (max ${Math.max(0, ...log).toFixed(3)})`);
  }
  const { ctx, log } = alphaRecorder();
  cal.draw(ctx, el, tl.Ld, { ...env(), ts: tl.Ld, tl, rect });
  assert.ok(log.every((a) => a <= 1e-9), "at the end of the exit nothing of the element is visible");
});
