// The descriptor contract of the motion library as a function (not an element type: "_" files are never registered).
// Used by the contract test (engine/motion-lib.test.mjs) for EVERY registered type and the template, and by cli.mjs before a render for
// the comp-local elements (RUN/<comp>/motion-lib/<type>.js), so a custom element meets exactly the same bar as a library one.
import * as Lib from "./index.js";
import { recorder, env, ZONES } from "./_testkit.mjs";

const SFX = new Set(["pop", "whoosh", "notify", "click"]);
export const FIELD_KINDS = new Set(["text", "textarea", "number", "select", "bool", "list", "point", "blocks", "index", "multi", "rows", "chatItems", "stackItems", "product", "productImage", "slides"]);

/** Problems (English strings; empty = the descriptor meets the contract). `registered` = the type is in the registry (drawing checks run). */
export function contractProblems(d, registered = Lib.has(d?.type)) {
  const p = [];
  const check = (ok, msg) => { if (!ok) p.push(msg); return ok; };
  const base = Lib.checkDescriptor(d);
  if (base.length) return base;
  try {
    const keys = new Set();
    const walk = (f) => { check(FIELD_KINDS.has(f.kind), `unknown field kind ${f.kind}`); if (f.fields) f.fields({}).forEach(walk); };
    for (const f of [...d.fields, ...(d.screen ?? []), ...(d.source ?? [])]) {
      walk(f);
      if (f.key) { check(!keys.has(f.key), `duplicate field ${f.key}`); keys.add(f.key); }
      check(f.label && /\S/.test(f.label), `field ${f.key} needs a Spanish label`);
    }
    const e0 = d.defaults(2, 30);
    check(e0.type === d.type, "defaults() must return an element of its own type");
    check(e0.out > e0.in && e0.in === 2, "defaults(t, end) starts at t and has a positive duration");
    check(d.defaults(29, 30).out <= 30, "defaults never end after the video");
    check(!(d.validate(e0, "x").errors ?? []).length, `the default element must validate: ${(d.validate(e0, "x").errors ?? []).join("; ")}`);
    if (!registered) return p;
    check(!Lib.validate(e0, "x").errors.length, `the default element must pass the common checks: ${Lib.validate(e0, "x").errors.join("; ")}`);
    const s0 = Lib.sampleOf(d.type, {});
    const el = { id: `${d.type}-1`, ...s0, in: 1, out: 1 + (s0.out - s0.in) };
    const tl = Lib.timeline(el);
    check(tl.Ld > 0 && tl.b.exit && Math.abs(tl.b.exit[1] - tl.Ld) < 1e-9, "beats.exit must end at Ld");
    const bb = Lib.beats(el).beats;
    const nums = []; (function flat(o) { for (const v of Object.values(o)) typeof v === "number" ? nums.push(v) : v && typeof v === "object" && flat(v); })(bb);
    check(nums.every(Number.isFinite), "all beats are finite numbers");
    check(Math.abs(bb.exit[1] - el.out) < 2e-3, "the exit ends at `out`");
    for (const slot of ["band", "top", "center"]) {
      const r = Lib.rect({ ...el, slot }, ZONES, env());
      check(r.w > 0 && r.h > 0, `${slot}: positive size`);
      if (!d.rect && !d.candidates) check(r.x >= 60 - 1 && r.x + r.w <= 1020 + 1 && r.y >= 350 - 1 && r.y + r.h <= 1540 + 1, `${slot}: inside the free area ${JSON.stringify(r)}`);
    }
    if (Lib.hasCandidates(el)) {
      const cs = Lib.candidates(el, ZONES, env());
      check(Array.isArray(cs) && cs.length > 0, "candidates() returns at least one position");
      for (const c of cs) check(c.rect && c.rect.w > 0 && c.rect.h > 0 && Number.isFinite(c.cost ?? 0), `candidate ${c.name}: rect and cost`);
    }
    for (const e of Lib.events(el, Lib.rect(el, ZONES, env()))) {
      check(SFX.has(e.type), `sfx kind ${e.type}`);
      check(e.t >= el.in - 1e-6 && e.t <= el.out + 1e-6, `event time ${e.t} outside the window`);
      check(e.x >= -1 && e.x <= 1, "event pan outside -1..1");
    }
    let small = null;
    for (let t = el.in - 0.1; t <= el.out + 0.1; t += 0.23) {
      const a = [], b = [];
      Lib.draw(recorder(a), el, t, env());
      Lib.draw(recorder(b), el, t, env());
      check(JSON.stringify(a) === JSON.stringify(b), `draw must be a pure function of t (differs at ${t.toFixed(2)})`);
      if (t < el.in || t >= el.out) check(a.length === 0, "nothing is drawn outside [in, out)");
      for (const l of a) { const m = /^font=.*?(\d+(?:\.\d+)?)px/.exec(l); if (m && Number(m[1]) < 24) small = Number(m[1]); }
    }
    check(small === null, `text below 24 px (${small} px)`);
    const mid = []; Lib.draw(recorder(mid), el, el.in + (el.out - el.in) * 0.6, env());
    check(mid.length > 5, "draws something mid-way");
    const hid = []; Lib.draw(recorder(hid), { ...el, hidden: true }, el.in + 1, env());
    check(hid.length === 0, "a hidden element draws nothing");
    const th = [];
    check(Lib.drawSample(recorder(th), d.type, { w: 168, h: 118 }) === true && th.length > 5, "the thumbnail draws");
    for (const r of Lib.imageRefs(el)) check(typeof r.ref === "string" && typeof r.what === "string", "imageRefs: {ref, what} strings");
    check(Lib.texts(el).every((s) => typeof s === "string"), "texts() adds strings only");
  } catch (e) {
    p.push(`threw: ${e.message}`);
  }
  return p;
}
