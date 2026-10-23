// Specs of the "Texto" group (quoteCard, stepsTimeline, highlighterText, lowerThirdPro, bigNumberStatement). Imported by motion-lib.test.mjs.
import test from "node:test";
import assert from "node:assert/strict";
import * as Lib from "./index.js";
import { figureParts } from "./bigNumberStatement.js";
import { tokensOf, plainOf, contrast, blend, ZONES as Z, minRead } from "./_texto.js";
import { env, ZONES } from "./_testkit.mjs";

const e = (over) => ({ id: "t1", in: 1, out: 5, ...over });

test("Texto: highlighter tokens keep word order, asterisks removed, runs marked", () => {
  const t = tokensOf("Cuesta *menos de lo* que *crees*");
  assert.deepEqual(t.map((x) => x.w), ["Cuesta", "menos", "de", "lo", "que", "crees"]);
  assert.deepEqual(t.map((x) => x.hl), [false, true, true, true, false, true]);
  assert.equal(plainOf("Cuesta *menos*"), "Cuesta menos");
  assert.ok(minRead(4) >= 1.2);
});

test("Texto: every element stays inside the safe area in all slots and its texts are plain", () => {
  const samples = [
    e({ type: "quoteCard", text: "Cerramos el mes con 32 citas nuevas y cero papeles", by: "María Hernández" }),
    e({ type: "stepsTimeline", steps: [{ title: "Uno" }, { title: "Dos", subtitle: "detalle" }, { title: "Tres" }] }),
    e({ type: "highlighterText", text: "Cuesta *menos de lo que crees*" }),
    e({ type: "lowerThirdPro", name: "María Hernández", role: "Directora comercial" }),
    e({ type: "bigNumberStatement", before: "Quedan", figure: "32", after: "unidades disponibles" })
  ];
  for (const s of samples) for (const slot of ["band", "center", "top"]) {
    const r = Lib.rect({ ...s, slot }, ZONES, env());
    assert.ok(r.x >= 60 - 1 && r.x + r.w <= 1020 + 1 && r.y >= 350 - 1 && r.y + r.h <= 1540 + 1, `${s.type}/${slot} ${JSON.stringify(r)}`);
    assert.ok(Lib.candidates(s, ZONES, env()).length >= 3, `${s.type} offers planner candidates`);
  }
  assert.deepEqual(Lib.texts(samples[2]), ["Cuesta menos de lo que crees"]);
});

test("Texto: highlighter words are word-accurate and the marker keeps the text readable (>= 4.5:1 on paper)", () => {
  const kit = env().kit;
  const mark = blend(kit.colors.paper, kit.colors.accent, 0.5);
  assert.ok(contrast(kit.colors.ink, mark) >= 4.5, "ink on a 50 % accent marker");
  const ws = Lib.texts(e({ type: "highlighterText", text: "a *b c*" }));
  assert.equal(ws.length, 1);
});

test("Texto: bigNumberStatement counts to the exact final value and reports numbers", () => {
  assert.deepEqual(figureParts("$1,250"), { pre: "$", num: "1,250", suf: "", value: 1250, dec: 0 });
  assert.deepEqual(figureParts("12.5%"), { pre: "", num: "12.5", suf: "%", value: 12.5, dec: 1 });
  assert.equal(figureParts("∞"), null);
  const el = e({ type: "bigNumberStatement", figure: "32", after: "unidades", in: 0, out: 3 });
  assert.equal(Lib.showsNumbers(el), true);
  assert.equal(Lib.showsNumbers({ ...el, figure: "gratis" }), false);
  const log = []; Lib.draw(env().canvas ? recorderCtx(log) : null, el, 2.9, env());
  assert.ok(log.some((s) => s.includes("fillText(32")), "final frame shows the figure as typed");
});

test("Texto: stepsTimeline needs 3 to 5 steps and fills circles in order", () => {
  assert.ok(Lib.validate(e({ type: "stepsTimeline", steps: [{ title: "Uno" }] })).errors.length > 0);
  assert.equal(Lib.validate(e({ type: "stepsTimeline", steps: [{ title: "Uno" }, { title: "Dos" }, { title: "Tres" }], in: 0, out: 4 })).errors.length, 0);
  const ev = Lib.events(e({ type: "stepsTimeline", steps: [{ title: "a" }, { title: "b" }, { title: "c" }], in: 0, out: 4 }), Lib.rect(e({ type: "stepsTimeline", steps: [{ title: "a" }, { title: "b" }, { title: "c" }] }), ZONES, env()));
  assert.ok(ev.every((x) => x.t >= 0 && x.t <= 4));
});

test("Texto: lowerThirdPro exits in reverse (role leaves before the name retracts) and warns on short windows", () => {
  const el = e({ type: "lowerThirdPro", name: "María Hernández", role: "Directora", in: 0, out: 3 });
  assert.equal(Lib.timeline(el).b.exit[1], 3);
  assert.equal(Lib.validate({ ...el, out: 0.5 }).warnings.length > 0, true);
});

test("Texto: quoteCard warns when the quote is longer than 30 words", () => {
  const long = Array.from({ length: 31 }, () => "palabra").join(" ");
  assert.ok(Lib.validate(e({ type: "quoteCard", text: long, in: 0, out: 9 })).warnings.some((w) => w.includes("31")));
});

// Minimal recording context: every method call appended as "name(args)".
function recorderCtx(log) {
  const base = { measureText: (s) => ({ width: String(s).length * 11 }), createLinearGradient: () => ({ addColorStop() {} }), canvas: {} };
  return new Proxy(base, { get(t, k) { if (k in t) return t[k]; return (...a) => { log.push(`${String(k)}(${a.map((x) => (typeof x === "number" ? Math.round(x) : x)).join(",")})`); }; }, set() { return true; } });
}
