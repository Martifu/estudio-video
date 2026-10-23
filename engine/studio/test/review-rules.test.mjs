// node --test engine/studio/test/review-rules.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { runReview, findClaims, fold, edlSegments, textPieces } from "../client/review-rules.js";

const sev = (r, check) => r.items.filter((i) => i.check === check).map((i) => i.severity);
const base = (over = {}) => ({ duration: 30, motion: [], captionSegs: [], words: [], zones: null, ...over });
const pill = (text, i, o, extra = {}) => ({ id: `e${i}`, type: "tagPill", text, in: i, out: o, ...extra });

test("overshoot: 2 pops are fine, the 3rd is red", () => {
  const two = [{ id: "a", type: "keywordPop", text: "HOLA", in: 1, out: 3 }, { id: "b", type: "onomatopoeia", text: "ZAS", in: 5, out: 7 }];
  assert.deepEqual(sev(runReview(base({ motion: two })), "overshoot"), ["green"]);
  const three = [...two, { id: "c", type: "keywordPop", text: "OTRA", in: 9, out: 11 }];
  const r = runReview(base({ motion: three }));
  assert.deepEqual(sev(r, "overshoot"), ["red"]);
  assert.equal(r.items.find((i) => i.check === "overshoot").elementId, "c");
});

test("overshoot counts a logo that enters with pop", () => {
  const two = [{ id: "a", type: "keywordPop", text: "HOLA", in: 1, out: 3 }, { id: "b", type: "onomatopoeia", text: "ZAS", in: 5, out: 7 }];
  assert.deepEqual(sev(runReview(base({ motion: two, logoCfg: { enter: "pop" } })), "overshoot"), ["red"]);
  assert.deepEqual(sev(runReview(base({ motion: two, logoCfg: { enter: "fade" } })), "overshoot"), ["green"]);
  assert.deepEqual(sev(runReview(base({ motion: two, logoCfg: { enter: "pop", hidden: true } })), "overshoot"), ["green"]); // hidden logo does not pop
});

test("fragments over 4 words and more than 8 visible words", () => {
  const long = [{ id: "a", type: "keywordPop", text: "ESTO ES DEMASIADO LARGO PARA UN GOLPE", in: 1, out: 4 }];
  assert.deepEqual(sev(runReview(base({ motion: long })), "fragment"), ["yellow"]);
  const many = [pill("UNO DOS TRES CUATRO", 1, 4), pill("CINCO SEIS SIETE OCHO", 1, 4), pill("NUEVE", 1, 4)];
  const r = runReview(base({ motion: many }));
  assert.deepEqual(sev(r, "words8"), ["yellow"]);
  assert.match(r.items.find((i) => i.check === "words8").title, /9 palabras/);
  assert.deepEqual(sev(runReview(base({ motion: many.slice(0, 2) })), "words8"), ["green"]);
});

test("minimum on-screen time = 0.6 s + 0.1 s per word", () => {
  assert.deepEqual(sev(runReview(base({ motion: [pill("TRES PALABRAS AQUI", 1, 1.8)] })), "minTime"), ["yellow"]); // needs 0.9
  assert.deepEqual(sev(runReview(base({ motion: [pill("TRES PALABRAS AQUI", 1, 2)] })), "minTime"), ["green"]);
});

test("text under 32 px is red; unknown sizes are not guessed", () => {
  const r = runReview(base({ motion: [{ id: "a", type: "keywordPop", text: "HOLA", in: 1, out: 3, size: 28 }] }));
  assert.deepEqual(sev(r, "size"), ["red"]);
  assert.deepEqual(sev(runReview(base({ motion: [pill("HOLA", 1, 3)] })), "size"), []); // tagPill: size unknown
  assert.deepEqual(sev(runReview(base({ captionSize: 24 })), "size"), ["red"]);
});

test("platform zones: default 220/380/60 and custom zones", () => {
  const motion = [pill("ARRIBA", 1, 3), pill("ABAJO", 4, 6)];
  const plan = { rects: [{ x: 100, y: 190, w: 400, h: 80 }, { x: 100, y: 1480, w: 400, h: 80 }], report: { elements: [] } };
  const r = runReview(base({ motion, plan }));
  assert.deepEqual(sev(r, "zones"), ["yellow", "yellow"]);
  const deep = { rects: [{ x: 100, y: 100, w: 400, h: 80 }, { x: 100, y: 300, w: 400, h: 80 }], report: { elements: [] } };
  assert.deepEqual(sev(runReview(base({ motion, plan: deep })), "zones"), ["red"]); // fully inside the top zone
  const ok = { rects: [{ x: 100, y: 300, w: 400, h: 80 }, { x: 100, y: 1400, w: 400, h: 80 }], report: { elements: [] } };
  assert.deepEqual(sev(runReview(base({ motion, plan: ok })), "zones"), ["green"]);
  // reels preset moves the top to 250: the pill at y=240 now collides
  const near = { rects: [{ x: 100, y: 240, w: 400, h: 80 }, ok.rects[1]], report: { elements: [] } };
  assert.deepEqual(sev(runReview(base({ motion, plan: near })), "zones"), ["green"]);
  assert.deepEqual(sev(runReview(base({ motion, plan: near, zones: { top: 250, bottom: 420, left: 60, right: 90 } })), "zones"), ["yellow"]);
});

test("faces and collisions come from the layout report", () => {
  const motion = [pill("A", 1, 3), pill("B", 1, 3)];
  const report = { faces: [{ source: "vision" }], elements: [{ faceOverlap: 0.32, collidesWith: [], window: [1, 3], mode: "auto" }, { faceOverlap: 0.05, collidesWith: ["keywordPop[0]"], window: [1, 3], mode: "auto" }] };
  const r = runReview(base({ motion, plan: { rects: [null, null], report } }));
  assert.deepEqual(sev(r, "faces"), ["red", "yellow"]);
  assert.deepEqual(sev(r, "collide"), ["yellow"]);
  // no face data: no false "nobody covers the face"
  assert.deepEqual(sev(runReview(base({ motion, plan: { rects: [], report: { faces: [], elements: [] } } })), "faces"), []);
});

test("logo hidden windows", () => {
  const r = runReview(base({ plan: { rects: [], report: { elements: [] }, logo: { hide: [[4.1, 6.4]] } } }));
  assert.deepEqual(sev(r, "logo"), ["yellow"]);
  assert.equal(r.items.find((i) => i.check === "logo").t, 4.1);
  assert.deepEqual(sev(runReview(base({ plan: { rects: [], report: { elements: [] }, logo: { hide: [] } } })), "logo"), ["green"]);
});

test("hook: change by 0.1 s and first readable word by 0.4 s", () => {
  const good = runReview(base({ captionSegs: [{ id: "a0", in: 0, out: 1, text: "HOLA A TODOS" }], motion: [pill("X", 3, 5)] }));
  assert.deepEqual(sev(good, "hookChange"), ["green"]);
  assert.deepEqual(sev(good, "hookWord"), ["green"]);
  const slow = runReview(base({ captionSegs: [{ id: "a0", in: 0.9, out: 2, text: "HOLA" }], motion: [pill("X", 3, 5)] }));
  assert.deepEqual(sev(slow, "hookChange"), ["yellow"]);
  assert.deepEqual(sev(slow, "hookWord"), ["yellow"]);
});

test("dead time: more than 2.4 s without a motion event", () => {
  const motion = [pill("A", 1, 2), pill("B", 3, 4), pill("C", 8, 9)];
  const r = runReview(base({ motion, duration: 12, cta: { at: 10, dur: 2 } }));
  const dead = r.items.filter((i) => i.check === "dead");
  assert.deepEqual(dead.map((i) => i.t), [4]); // gaps: 0->1, 4->8 (only this one is > 2.4 s), 9->10
  const many = runReview(base({ motion: [pill("A", 3, 3.5), pill("B", 9, 9.5)], duration: 14, cta: { at: 12, dur: 2 } })).items.filter((i) => i.check === "dead");
  assert.equal(many.length, 1); // several long stretches collapse into one item pointing at the worst one
  assert.equal(many[0].t, 3.5);
  assert.match(many[0].title, /3 tramos/);
});

test("CTA: 1.5-2.5 s and >= 1 s of tail", () => {
  assert.deepEqual(sev(runReview(base({ duration: 32, cta: { at: 30, dur: 2.2 } })), "cta"), ["green"]);
  assert.deepEqual(sev(runReview(base({ duration: 33, cta: { at: 30, dur: 3 } })), "cta"), ["yellow"]);
  assert.deepEqual(sev(runReview(base({ duration: 31.6, cta: { at: 30, dur: 1.6 } })), "cta"), ["yellow"]); // duration ok, tail 0.49 s
  assert.deepEqual(sev(runReview(base()), "cta"), []);
});

test("EDL: mid-video dissolves and short segments (shape-tolerant)", () => {
  const seg = (id, a, b, transition) => ({ id, clip: "c1", in: a, out: b, ...(transition ? { transition } : {}) });
  const edl = { version: 1, segments: [seg("s1", 0, 4), seg("s2", 5, 5.3, { type: "fade", dur: 0.2 }), seg("s3", 8, 12), seg("s4", 12, 12.4, { type: "cut" })] };
  const r = runReview(base({ edl }));
  assert.deepEqual(sev(r, "dissolve"), ["yellow"]);
  assert.deepEqual(sev(r, "shortShot"), ["yellow", "yellow"]);
  assert.deepEqual(sev(runReview(base({ edl: null })), "dissolve"), []);
  assert.deepEqual(edlSegments({ nonsense: true }), []);
  assert.deepEqual(edlSegments(["x", 1]).length, 0);
  assert.deepEqual(edlSegments(edl).map((x) => [x.start, x.dur]), [[0, 4], [3.8, 0.3], [4.1, 4], [8.1, 0.4]].map(([a, b]) => [a, b])); // the fade overlaps the previous segment by 0.2 s
  assert.deepEqual(sev(runReview(base({ edl: { version: 1, segments: [seg("s1", 0, 4, { type: "fade", dur: 0.4 })] } })), "dissolve"), ["green"]); // a fade-in on the first segment is not mid-video
  // a short segment under text is allowed
  const withText = runReview(base({ edl, motion: [pill("HOLA", 3.8, 4.1), pill("OTRA", 8.1, 8.6)] }));
  assert.deepEqual(sev(withText, "shortShot"), ["green"]);
});

test("caption reading speed over ~20 chars/s", () => {
  const r = runReview(base({ captionSegs: [{ id: "a", in: 0, out: 1, text: "ESTO ES MUY RAPIDO DE LEER OK" }, { id: "b", in: 2, out: 4, text: "ESTO SE LEE BIEN" }] }));
  assert.deepEqual(sev(r, "captionCps"), ["yellow"]);
  assert.equal(r.items.find((i) => i.check === "captionCps").segId, "a");
});

test("claims QA: red message, sources merged, 'gratis' only yellow", () => {
  const input = base({
    words: [{ word: "Garantizado", start: 3, end: 3.5 }, { word: "o", start: 3.5, end: 3.6 }, { word: "te", start: 3.6, end: 3.7 }, { word: "devolvemos", start: 3.7, end: 4 }, { word: "tu", start: 4, end: 4.1 }, { word: "dinero", start: 4.1, end: 4.4 }],
    captionSegs: [{ id: "a0", in: 3, out: 4.4, text: "GARANTIZADO O TE DEVOLVEMOS TU DINERO" }],
    motion: [{ id: "k", type: "keywordPop", text: "100%", in: 8, out: 10 }, pill("ENVÍO GRATIS", 12, 14)],
    cta: { at: 20, title: "El mejor taller", subtitle: "Número 1 en México" }
  });
  const r = runReview(input);
  const claims = r.items.filter((i) => i.check === "claims");
  const red = claims.filter((i) => i.severity === "red");
  assert.ok(red.every((i) => i.title === "Promesa que requiere respaldo o letra pequeña"));
  assert.equal(red.length, 5, red.map((i) => i.detail).join("\n")); // garantizado, te devolvemos tu dinero, 100%, el mejor, número 1
  assert.equal(claims.filter((i) => i.severity === "yellow").length, 1);
  const g = red.find((i) => /garantiz/i.test(i.detail));
  assert.match(g.detail, /Subtítulo \+ Voz|Voz \+ Subtítulo/); // merged, one item
  assert.equal(g.segId, "a0");
  assert.equal(red.find((i) => /100/.test(i.detail)).elementId, "k");
  assert.deepEqual(sev(runReview(base({ captionSegs: [{ id: "a", in: 0, out: 2, text: "Hecho a la medida" }] })), "claims"), ["green"]);
});

test("findClaims: accents, word boundaries, spoken text", () => {
  assert.deepEqual(findClaims("Es el número 1 del país").map((c) => c.id), ["numero1"]);
  assert.deepEqual(findClaims("#1 en ventas").map((c) => c.id), ["numero1"]);
  assert.deepEqual(findClaims("Sin riesgo y sin letra chica").map((c) => c.id), ["sinriesgo"]);
  assert.deepEqual(findClaims("resultados garantizados").map((c) => c.id), ["garantia"]);
  assert.deepEqual(findClaims("Aprobado por la FDA").map((c) => c.id), ["aprobado"]);
  assert.deepEqual(findClaims("esto cura todo").map((c) => c.id), ["cura"]);
  assert.deepEqual(findClaims("mejor calidad, curación, mejoramos").map((c) => c.id), []); // "mejor" alone and unrelated words do not match
  assert.equal(fold("NÚMERO ÑANDÚ").length, "NÚMERO ÑANDÚ".length);
});

test("loudness only when measured", () => {
  assert.deepEqual(sev(runReview(base()), "loudness"), []);
  assert.deepEqual(sev(runReview(base({ loudness: { integrated: -14.2, truePeak: -2 } })), "loudness"), ["green"]);
  assert.deepEqual(sev(runReview(base({ loudness: { integrated: -18, truePeak: -0.2 } })), "loudness"), ["yellow"]);
});

test("empty / malformed input never throws and counts add up", () => {
  for (const input of [undefined, {}, { motion: [null, {}, { type: "nope" }], plan: {}, captionSegs: [{}], edl: 5, words: [null, {}] }]) {
    const r = runReview(input);
    assert.equal(r.counts.red + r.counts.yellow + r.counts.green, r.items.length);
    assert.ok(!r.items.some((i) => i.id.startsWith("error:")), JSON.stringify(r.items.filter((i) => i.id.startsWith("error:"))));
  }
  assert.deepEqual(textPieces({ type: "highlightWords", words: ["a"] }), []);
});

test("text fit: measured rect past the safe area or on the logo is yellow", () => {
  const motion = [pill("MADERA QUE DURA GENERACIONES", 1, 4)];
  const logo = { rect: { x: 780, y: 244, w: 240, h: 73 }, hide: [] };
  const wide = { rects: [{ x: 60, y: 246, w: 1050, h: 84 }], report: { elements: [] }, logo };
  const r = runReview(base({ motion, plan: wide }));
  assert.deepEqual(sev(r, "textFit"), ["yellow"]);
  assert.match(r.items.find((i) => i.check === "textFit").detail, /área segura \(derecha\)/);
  const onLogo = { rects: [{ x: 60, y: 246, w: 800, h: 84 }], report: { elements: [] }, logo };
  assert.match(runReview(base({ motion, plan: onLogo })).items.find((i) => i.check === "textFit").detail, /logo/);
  assert.deepEqual(sev(runReview(base({ motion, plan: { ...onLogo, logo: { ...logo, hide: [[0, 9]] } } })), "textFit"), ["green"]); // logo already dimmed
  assert.deepEqual(sev(runReview(base({ motion, plan: onLogo, logoCfg: { hidden: true } })), "textFit"), ["green"]);
  const ok = { rects: [{ x: 60, y: 246, w: 567, h: 84 }], report: { elements: [] }, logo };
  assert.deepEqual(sev(runReview(base({ motion, plan: ok })), "textFit"), ["green"]);
  assert.deepEqual(sev(runReview(base({ motion })), "textFit"), []); // no plan data: no claim
  assert.deepEqual(sev(runReview(base({ motion, plan: wide, zones: { top: 220, bottom: 380, left: 60, right: 10 } })), "textFit"), ["yellow"]); // 1110 > 1070
});

test("product price: manual and fresh Reda are green; stale Reda, undated Reda and unknown sources are yellow", () => {
  const card = { id: "c1", type: "productCard", product: "p1", in: 1, out: 4, showPrice: true };
  const doc = (p) => ({ version: 1, products: [{ id: "p1", name: "Rimac", images: [], ...p }] });
  const price = (p) => sev(runReview(base({ motion: [card], products: doc(p) })), "productPrice");
  const days = (n) => new Date(Date.now() - n * 864e5).toISOString();
  assert.deepEqual(price({ price: 100, source: "manual" }), []);
  assert.deepEqual(price({ price: 100, source: "reda", priceNote: "desde", priceBasis: "precioModelo", fetchedAt: days(1) }), []);
  assert.deepEqual(price({ price: 100, source: "reda", fetchedAt: days(9) }), ["yellow"]);
  assert.deepEqual(price({ price: 100, source: "reda" }), ["yellow"]);
  assert.deepEqual(price({ price: 100, source: "otro-catalogo", fetchedAt: days(1) }), ["yellow"]);
  const r = runReview(base({ motion: [card], products: doc({ price: 100, source: "reda", fetchedAt: days(1) }) }));
  assert.ok(r.items.some((i) => i.check === "productRes" && i.severity === "green"), "the Productos line stays green");
});

// ---------- registry transitions: count, fadeColor mid-video, speech overlap (yellow only) ----------
const cutsEdl = (kinds) => ({ segments: kinds.map((k, i) => ({ dur: 3, ...(k ? { transition: { type: k, dur: 0.4 } } : {}) })) });

test("transitions: more than 3 non-cut transitions is yellow; 3 is fine", () => {
  assert.deepEqual(sev(runReview(base({ edl: cutsEdl([null, "blurCross", "flashWhite", "whipPan"]) })), "transitionCount"), []);
  const r = runReview(base({ edl: cutsEdl([null, "blurCross", "flashWhite", "whipPan", "zoomPunch"]) }));
  assert.deepEqual(sev(r, "transitionCount"), ["yellow"]);
  assert.equal(r.items.find((i) => i.check === "transitionCount").title, "Hay 4 transiciones");
});

test("transitions: fadeColor in the middle is yellow, on the last segment it is not", () => {
  assert.deepEqual(sev(runReview(base({ edl: cutsEdl([null, "fadeColor"]) })), "fadeColorMid"), []);
  assert.deepEqual(sev(runReview(base({ edl: cutsEdl([null, "fadeColor", null]) })), "fadeColorMid"), ["yellow"]);
});

test("transitions: a transition over a spoken word is yellow; no word data = silent", () => {
  const edl = cutsEdl([null, "blurCross"]); // overlap [2.5, 3] on the output timeline
  assert.deepEqual(sev(runReview(base({ edl, words: [{ word: "hola", start: 2.7, end: 2.9 }] })), "transitionSpeech"), ["yellow"]);
  assert.deepEqual(sev(runReview(base({ edl, words: [{ word: "hola", start: 0.5, end: 0.9 }] })), "transitionSpeech"), []);
  assert.deepEqual(sev(runReview(base({ edl, words: [] })), "transitionSpeech"), []);
});
