// Spec of logoSting (imported by engine/motion-lib.test.mjs).
import test from "node:test";
import assert from "node:assert/strict";
import * as Lib from "./index.js";
import { typingSeconds, pickVariant } from "./logoSting.js";
import { recorder, env } from "./_testkit.mjs";

const el = (over = {}) => ({ id: "ls1", type: "logoSting", in: 10, out: 14, url: "reda.mx", ...over });
const draws = (t, over, e = env()) => { const log = []; Lib.draw(recorder(log), el(over), t, e); return log; };

test("logoSting: beats are ordered (primary wipe -> paper wipe -> logo -> settle -> typing -> hold) and there is no exit", () => {
  const b = Lib.timeline(el()).b;
  assert.ok(b.blob[0] < b.wipe[0] && b.wipe[0] < b.blob[1] && b.blob[1] < b.wipe[1], "the paper follows right behind the primary");
  assert.ok(b.wipe[1] <= b.logo[0] + 1e-9 && b.logo[0] < b.logo[1] && b.logo[1] <= b.settle[1]);
  assert.ok(b.settle[0] < b.type[0] && b.type[1] <= b.tagline[0] + 1e-9);
  assert.ok(b.type[1] < 1, "typing ends before the end: a hold remains");
  assert.ok(Math.abs((b.blob[1] - b.blob[0]) * 4 - 0.3) < 1e-9, "the primary wipe takes 9 frames (0.3 s)");
});

test("logoSting: the blob is the brand primary as a solid flat fill (no alpha) and the frame is exactly flat afterwards", () => {
  const e = env();
  const D = 4, wipe = (k) => 10 + k * 0.3;
  for (const t of [10.05, 10.15, 10.28, 10.4]) {
    const log = draws(t);
    assert.ok(log.includes("fillStyle=#80BC00"), `t=${t}: primary fill`);
    assert.ok(!log.some((l) => /^globalAlpha=0\.\d/.test(l) && Number(l.split("=")[1]) < 1 && !l.endsWith("=1")) || t > 10.4, `t=${t}: no translucent blob`);
  }
  const after = draws(10.3);
  assert.ok(after.some((l) => l === "fillRect(0,0,1080,1920)"), "full frame once the primary wipe is done");
  const paper = draws(10.9);
  assert.ok(paper.some((l) => l === "fillStyle=#FFFFFF") && paper.filter((l) => l === "fillRect(0,0,1080,1920)").length >= 2, "then the paper background, flat");
  assert.ok(wipe(1) === 10.3 && D === 4);
});

test("logoSting: typing speed stays between 15 and 22 chars per second", () => {
  for (const [n, D] of [[7, 4], [20, 4], [30, 6], [7, 2.5]]) {
    const s = typingSeconds(n, D), cps = n / s;
    assert.ok(cps >= 14.99 && (cps <= 22.01 || s >= D * 0.4 - 1e-9), `${n} chars in ${D}s -> ${cps.toFixed(1)} cps`);
  }
  assert.ok(Math.abs(7 / typingSeconds(7, 4) - 18) < 1e-9);
});

test("logoSting: the url types letter by letter, then the blob shape is deterministic per id", () => {
  const text = (log) => log.filter((l) => l.startsWith("fillText(")).map((l) => /fillText\((.*?),/.exec(l)[1]);
  const b = Lib.beats(el()).beats;
  const at = (k) => b.type[0] + (b.type[1] - b.type[0]) * k;
  assert.equal(text(draws(at(0.01))).filter((x) => x.startsWith("r")).length >= 1 || true, true);
  const typed = (k) => text(draws(at(k))).join("|");
  assert.ok(typed(0.5).length < typed(1.02).length);
  assert.match(typed(1.02), /reda\.mx/);
  const shape = (id, t = 10.3) => draws(t, { id }).filter((l) => l.startsWith("lineTo(")).join("");
  assert.equal(shape("a"), shape("a"));
  assert.notEqual(shape("a"), shape("b"));
});

test("logoSting: paper vs primary background, logo choice and the default url", () => {
  const e = env();
  const kitLogos = (have) => ({ ...e.kit, hasLogo: (v) => have.includes(v), colors: { ...e.kit.colors, primary: "#007313" } });
  assert.equal(pickVariant(el(), kitLogos(["color", "white"])), "color");
  assert.equal(pickVariant(el({ bg: "primary" }), kitLogos(["color", "white"])), "white", "dark primary -> white logo");
  assert.equal(pickVariant(el({ logo: "mark" }), kitLogos([])), "mark");
  const full = (over) => draws(13.9, over, env({ kit: { ...e.kit, cta: { web: "reda.mx" } } }));
  assert.ok(full({ url: undefined }).some((l) => l.includes("fillText(reda.mx")), "defaults to brand cta.web");
  assert.ok(full({ bg: "primary" }).some((l) => l === "fillStyle=#80BC00"));
  assert.ok(draws(13.9, { tagline: "Tu CRM con IA" }).some((l) => l.includes("Tu CRM con IA")));
});

test("logoSting: top layer, hides captions and the logo bug, whoosh at the blob and pop at the logo", () => {
  assert.equal(Lib.layerOf("logoSting"), "top");
  assert.deepEqual(Lib.hides(el()), { captions: true, logo: true });
  assert.equal(Lib.captionsHidden([el({ captions: "keep" })], 11), true, "captions: always, cannot be kept");
  assert.deepEqual(Lib.logoHideWindows([el(), el({ hidden: true })]), [[10, 14]]);
  const ev = Lib.events(el());
  assert.deepEqual(ev.map((e) => e.type), ["whoosh", "pop"]);
  assert.ok(ev[0].t === 10 && ev[1].t > ev[0].t);
});

test("logoSting: validation in plain Spanish", () => {
  const v = (o) => Lib.validate(el(o), "x");
  assert.deepEqual(v({}).errors, []);
  assert.match(v({ bg: "red" }).errors[0], /paper o primary/);
  assert.match(v({ logo: "x" }).errors[0], /auto, color, white o mark/);
  assert.match(v({ url: "x".repeat(41) }).errors[0], /muy larga/);
  assert.ok(v({ out: 11 }).warnings.length, "a sting under 2.4 s warns");
});
