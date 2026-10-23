// node --test engine/motion-lib-local.test.mjs
// Comp-local element types (RUN/<comp>/motion-lib/<type>.js) and the shared face-aware placement default of the registry.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as Lib from "./motion-lib/index.js";
import { contractProblems } from "./motion-lib/_contract.mjs";
import { recorder, env, ZONES } from "./motion-lib/_testkit.mjs";

const FIX = fileURLToPath(new URL("./test-fixtures/local-lib/", import.meta.url));
const CLI = fileURLToPath(new URL("./motion-lib/cli.mjs", import.meta.url));

test("no local folder: loadLocal is a no-op", async () => {
  const before = Lib.types().length;
  assert.deepEqual(await Lib.loadLocal(`${FIX}missing/motion-lib`), { types: [], errors: [] });
  assert.deepEqual(await Lib.loadLocal(null), { types: [], errors: [] });
  assert.equal(Lib.types().length, before);
});

test("a comp-local element registers for this video, with its relative imports rewritten to the engine", async () => {
  const r = await Lib.loadLocal(`${FIX}good/motion-lib`);
  assert.deepEqual(r, { types: ["demoBadge"], errors: [] });
  assert.ok(Lib.has("demoBadge") && Lib.isLocal("demoBadge") && !Lib.isLocal("uiStat"));
  assert.deepEqual(contractProblems(Lib.get("demoBadge")), [], "a copy of _template.js meets the contract");
  assert.equal(Lib.byCategory()[0].category, Lib.LOCAL_CATEGORY, '"De este video" is the first group of the panel');
  assert.deepEqual(Lib.byCategory()[0].items.map((d) => d.type), ["demoBadge"]);
  assert.equal(Lib.get("demoBadge").category, "Ejemplos", "the descriptor itself is not mutated");
  assert.deepEqual(await Lib.loadLocal(`${FIX}good/motion-lib`), { types: [], errors: [] }, "twice = no-op");
  const el = { ...Lib.sampleOf("demoBadge"), in: 1, out: 3 };
  assert.ok(Lib.events(el).length >= 1);
});

test("cli: --local registers the folder; a type clash or a contract failure comes back as localErrors", () => {
  const good = JSON.parse(execFileSync("node", [CLI, "types", "--local", `${FIX}good/motion-lib`], { encoding: "utf8" }));
  assert.equal(good.types.demoBadge.category, Lib.LOCAL_CATEGORY);
  assert.equal(good.types.demoBadge.local, true);
  assert.deepEqual(good.localErrors, []);
  const plain = JSON.parse(execFileSync("node", [CLI, "types"], { encoding: "utf8" }));
  assert.equal(plain.localErrors, undefined, "without --local the output is unchanged");
  assert.equal(plain.types.demoBadge, undefined);
  const bad = JSON.parse(execFileSync("node", [CLI, "types", "--local", `${FIX}bad/motion-lib`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
  const byFile = Object.fromEntries(bad.localErrors.map((e) => [e.file, e.problems.join("; ")]));
  assert.match(byFile["uiStat.js"], /already exists in the library|must be/);
  assert.match(byFile["tinyText.js"], /below 24 px|exit/);
  assert.equal(bad.types.uiStat.local, undefined, "the library uiStat is untouched");
});

test("the static server lists a comp's local elements (empty list when there is none)", async () => {
  const { createStaticHandler } = await import("./static-server.mjs");
  const h = createStaticHandler({ engineDir: fileURLToPath(new URL(".", import.meta.url)).replace(/\/$/, ""), runDir: FIX.replace(/\/$/, "") });
  const get = (url) => { let body = "", status = 0; h({ url, headers: {} }, { writeHead: (s) => { status = s; return { end: (b) => { body = b; } }; } }); return { status, files: JSON.parse(body).files }; };
  assert.deepEqual(get("/good/motion-lib/manifest.json"), { status: 200, files: ["demoBadge.js"] });
  assert.deepEqual(get("/nothing/motion-lib/manifest.json"), { status: 200, files: [] });
});

test("catalog --md groups the library by category with one row per type", () => {
  const md = execFileSync("node", [CLI, "catalog", "--md"], { encoding: "utf8" });
  for (const t of Lib.types().filter((x) => !Lib.isLocal(x))) assert.ok(md.includes(`| \`${t}\` |`), `${t} in the catalog`);
  assert.match(md, /^## Pantallas$/m);
  assert.match(md, /^## Transiciones/m);
});

// ---------- face-aware placement default ----------
const FACE_FREE = ZONES;
test("the 7 original screens stay pinned (no candidates, plain slot rect)", () => {
  for (const t of ["uiList", "uiForm", "uiDoc", "uiStat", "uiKanban", "uiFeed", "uiIcons"]) {
    const el = { ...Lib.sampleOf(t), slot: "top", scale: 0.76, align: "left" };
    assert.equal(Lib.hasCandidates(el), false, t);
    const { w, h } = Lib.get(t).size(el, env());
    assert.deepEqual(Lib.rect(el, FACE_FREE, env()), Lib.slotRect("top", w, h, FACE_FREE), `${t}: scale / align ignored`);
  }
});

test("size()-based elements get face-aware candidates; an explicit slot is a preference, not a pin", () => {
  const el = { ...Lib.sampleOf("notificationStack"), slot: "top" };
  assert.ok(Lib.hasCandidates(el));
  const cs = Lib.candidates(el, FACE_FREE, env());
  const top = cs.find((c) => c.patch.slot === "top" && !c.patch.scale && !c.patch.align);
  const band = cs.find((c) => c.patch.slot === "band" && !c.patch.scale && !c.patch.align);
  assert.equal(top.cost, 0);
  assert.equal(band.cost, Lib.PIN_PENALTY, "leaving the chosen slot costs PIN_PENALTY (only a real face hit moves it)");
  for (const c of cs) assert.ok(c.rect.x >= 60 - 1 && c.rect.x + c.rect.w <= 1020 + 1 && c.rect.y >= 350 - 1 && c.rect.y + c.rect.h <= 1540 + 1, `${c.name} inside the free area`);
  // without a slot: band is the cheapest
  const free = Lib.candidates({ ...el, slot: undefined }, FACE_FREE, env());
  assert.equal(free.reduce((a, b) => (b.cost < a.cost ? b : a)).patch.slot, "band");
});

test("shrink and side variants respect minScale; a placed element draws through one transform onto its rect", () => {
  const d = Lib.get("phoneFrame");
  const el = { ...Lib.sampleOf("phoneFrame"), slot: "band" };
  const cs = Lib.candidates(el, FACE_FREE, env());
  const min = d.minScale ?? 1;
  assert.ok(cs.every((c) => (c.patch.scale ?? 1) >= min - 1e-9));
  const placed = { ...el, scale: Math.max(min, 0.76), align: "right" };
  const r = Lib.rect(placed, FACE_FREE, env());
  assert.equal(r.x + r.w, 1020, "align right hugs the right edge of the free area");
  const log = [];
  Lib.draw(recorder(log), placed, placed.in + 1, { ...env(), rect: r });
  assert.ok(log.some((l) => l.startsWith("scale(")), "drawn through a scale transform");
  const plain = [];
  Lib.draw(recorder(plain), el, el.in + 1, env());
  assert.ok(!plain.slice(0, 3).some((l) => l.startsWith("scale(")), "no transform when nothing was moved");
});

test("planner: a pinned-by-preference top card leaves the face; a close-up shrinks the frame instead of covering more of the face", async () => {
  const { planLayout } = await import("./layout.js");
  const faces = (box) => ({ source: "vision", samples: [1, 30, 60, 90, 120, 150].map((f) => ({ f, face: box, person: null })) });
  const plan = (el, box) => planLayout({ elements: [el], clips: [{ name: "a", start: 0, dur: 5, n: 150, faces: faces(box) }] }).report.elements[0];
  const normal = [402, 274, 361, 361], closeup = [44, 145, 1030, 1030];
  const top = plan({ id: "n", type: "notificationStack", in: 0.5, out: 4, slot: "top" }, normal);
  assert.notEqual(top.slot.split("-")[1].split("@")[0], "top", "slot top over the mouth gives way");
  assert.equal(top.faceOverlap, 0);
  const free = plan({ id: "n", type: "notificationStack", in: 0.5, out: 4, slot: "top" }, [700, 1500, 60, 60]);
  assert.match(free.slot, /-top$/, "with the face elsewhere the user's slot stays");
  const phone = plan({ id: "p", type: "phoneFrame", in: 0.5, out: 4 }, closeup);
  assert.match(phone.slot, /@0\.7|@0\.8/, "the phone shrinks under a close-up");
  assert.ok(phone.rect.y > 600);
});
