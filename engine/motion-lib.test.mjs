// node --test engine/motion-lib.test.mjs
// Contract test of the motion library: EVERY registered element type (engine/motion-lib/<type>.js) and the template must satisfy the
// descriptor contract; type specific specs (motion-lib/<type>.spec.mjs, or <family>.spec.mjs) are imported at the bottom.
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import * as Lib from "./motion-lib/index.js";
import template from "./motion-lib/_template.js";
import { contractProblems } from "./motion-lib/_contract.mjs";

test("the registry loads every file without problems and is not empty", () => {
  assert.deepEqual(Lib.LOAD_ERRORS, []);
  assert.ok(Lib.types().length >= 7);
  const files = readdirSync(new URL("./motion-lib/", import.meta.url)).filter(Lib.isTypeFile).map((f) => f.replace(/\.js$/, "")).sort();
  assert.deepEqual(Lib.types().sort(), files, "one file per registered type, named after it");
});

test("_template.js is itself a valid descriptor (so the documented template never rots)", () => {
  assert.deepEqual(Lib.checkDescriptor(template), []);
  assert.equal(Lib.has(template.type), false, "files starting with _ are not registered");
});

for (const d of [...Lib.all(), template]) {
  test(`contract: ${d.type}`, () => {
    assert.deepEqual(contractProblems(d), []);
  });
}

test("the static server publishes the manifest the browser registry needs", async () => {
  const { createStaticHandler } = await import("./static-server.mjs");
  const h = createStaticHandler({ engineDir: new URL(".", import.meta.url).pathname.replace(/\/$/, ""), runDir: "/tmp" });
  let body = "", status = 0;
  h({ url: "/engine/motion-lib/manifest.json", headers: {} }, { writeHead: (s) => { status = s; return { end: (b) => { body = b; } }; } });
  assert.equal(status, 200);
  assert.deepEqual(JSON.parse(body).files, readdirSync(new URL("./motion-lib/", import.meta.url)).filter(Lib.isTypeFile).sort());
});

// type specific specs
for (const f of readdirSync(new URL("./motion-lib/", import.meta.url)).filter((x) => x.endsWith(".spec.mjs")).sort()) await import(`./motion-lib/${f}`);
