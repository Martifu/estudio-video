// node --test engine/edl-main.test.mjs
// edl.js runs its CLI only when it is the entry point. The old check (`file://${argv[1]}`) never matched a path with spaces
// or a Windows drive letter; the URL is now built with pathToFileURL on the realpath.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ENGINE = path.dirname(fileURLToPath(import.meta.url));

test("Windows-style path: pathToFileURL gives file:///C:/... while the old template gave file://C:\\...", () => {
  const winPath = "C:\\Users\\Ana\\skills\\estudio-video\\engine\\edl.js";
  assert.equal(pathToFileURL(winPath, { windows: true }).href, "file:///C:/Users/Ana/skills/estudio-video/engine/edl.js");
  assert.equal(`file://${winPath}`, "file://C:\\Users\\Ana\\skills\\estudio-video\\engine\\edl.js"); // what the old check compared against
  assert.notEqual(`file://${winPath}`, pathToFileURL(winPath, { windows: true }).href);
});

test("the CLI runs when edl.js is the entry point, also through a symlink in a directory with spaces", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "edl entry "));
  try {
    const link = path.join(dir, "edl.js");
    fs.symlinkSync(path.join(ENGINE, "edl.js"), link);
    const bin = path.join(dir, "bin.json");
    fs.writeFileSync(bin, JSON.stringify([{ name: "a", dur: 2 }]));
    const out = execFileSync(process.execPath, [link, "plan", "-", bin], { encoding: "utf8" });
    const j = JSON.parse(out);
    assert.equal(j.duration, 2);
    assert.deepEqual(j.errors, []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("imported as a module, the CLI does not run (no usage output, no exit code 2)", () => {
  const out = execFileSync(process.execPath, ["--input-type=module", "-e", `import * as E from ${JSON.stringify(pathToFileURL(path.join(ENGINE, "edl.js")).href)}; console.log(typeof E.normalize === "function" ? "loaded" : "no")`], { encoding: "utf8" });
  assert.equal(out.trim(), "loaded");
});
