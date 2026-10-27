// node --test engine/studio/test/platform.test.mjs
// OS-specific opening of files and the render child env. server.mjs is a script (it listens on import), so the wiring is checked in source.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { openCommand, openPath, renderEnv } from "../platform.mjs";

const STUDIO = join(dirname(fileURLToPath(import.meta.url)), "..");
const FILE_WIN = "C:\\Users\\Ana\\Videos\\Estudio\\final.mp4";
const FILE_MAC = "/Users/ana/Videos/Estudio/final.mp4";

test("openCommand: macOS keeps `open -a <app> file` (and `open file` without an app)", () => {
  assert.deepEqual(openCommand(FILE_MAC, { app: "QuickTime Player", platform: "darwin" }), ["open", ["-a", "QuickTime Player", FILE_MAC]]);
  assert.deepEqual(openCommand(FILE_MAC, { app: "Google Chrome", platform: "darwin" }), ["open", ["-a", "Google Chrome", FILE_MAC]]);
  assert.deepEqual(openCommand("/Users/ana/Videos/Estudio", { platform: "darwin" }), ["open", ["/Users/ana/Videos/Estudio"]]);
});

test("openCommand: Windows uses cmd /d /c start \"\" <path> (default app or browser), the app name is ignored", () => {
  assert.deepEqual(openCommand(FILE_WIN, { app: "QuickTime Player", platform: "win32", comspec: "C:\\Windows\\System32\\cmd.exe" }), [
    "C:\\Windows\\System32\\cmd.exe",
    ["/d", "/c", "start", "", FILE_WIN],
  ]);
  assert.equal(openCommand(FILE_WIN, { platform: "win32", comspec: undefined })[0], "cmd.exe");
});

test("openCommand: Linux uses xdg-open", () => {
  assert.deepEqual(openCommand("/home/a/x.mp4", { platform: "linux", app: "QuickTime Player" }), ["xdg-open", ["/home/a/x.mp4"]]);
});

test("openPath runs the per-OS command and resolves null on success, the error message on failure (never rejects)", async () => {
  const calls = [];
  const ok = await openPath(FILE_WIN, { app: "x" }, { platform: "win32", exec: (cmd, args, cb) => (calls.push([cmd, args]), cb(null)) });
  assert.equal(ok, null);
  assert.deepEqual(calls[0], ["cmd.exe", ["/d", "/c", "start", "", FILE_WIN]]);
  const failed = await openPath(FILE_MAC, { app: "QuickTime Player" }, { platform: "darwin", exec: (cmd, args, cb) => cb(Object.assign(new Error("open: not found"), {})) });
  assert.equal(failed, "open: not found");
  assert.deepEqual(calls.length, 1);
});

test("renderEnv: CHROME resolved per OS; the CHROME env var wins", () => {
  const winExists = (p) => p === "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  assert.deepEqual(renderEnv({ platform: "win32", env: {}, homedir: "C:\\Users\\Ana", exists: winExists }), {
    CHROME: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  });
  assert.deepEqual(renderEnv({ platform: "win32", env: { CHROME: "D:\\Brave\\chrome.exe" }, homedir: "C:\\Users\\Ana", exists: winExists }), { CHROME: "D:\\Brave\\chrome.exe" });
  assert.deepEqual(renderEnv({ platform: "darwin", env: {}, homedir: "/Users/ana", exists: () => false }), {
    CHROME: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  });
});

test("the studio server defines renderEnv in its ctx and both render spawns pass it to the child", () => {
  const server = readFileSync(join(STUDIO, "server.mjs"), "utf8");
  assert.match(server, /renderEnv: \(\) => renderEnvFor\(\)/);
  assert.match(server, /import \{ openPath, renderEnv as renderEnvFor \} from "\.\/platform\.mjs"/);
  assert.match(server, /spawn\(exe, rest, \{ cwd: runDir, env: \{ \.\.\.process\.env, \.\.\.\(ctx\.renderEnv\?\.\(\) \?\? \{\}\) \}/);
  const variants = readFileSync(join(STUDIO, "variants.mjs"), "utf8");
  assert.match(variants, /spawn\(resolved\.exe, argv, \{ cwd: runDir, env: \{ \.\.\.process\.env, \.\.\.\(ctx\.renderEnv\?\.\(\) \?\? \{\}\) \}/);
});

test("no studio module calls `open` (macOS only) directly any more", () => {
  for (const f of ["server.mjs", "variants.mjs", "extras.mjs", "media.mjs", "insights.mjs", "assets.mjs", "products.mjs"]) {
    const src = readFileSync(join(STUDIO, f), "utf8");
    assert.ok(!/execFile\("open"/.test(src), `${f} still calls open directly`);
  }
  assert.deepEqual(readdirSync(STUDIO).filter((f) => f.endsWith(".mjs")).filter((f) => /execFile\("open"/.test(readFileSync(join(STUDIO, f), "utf8"))), []);
});

test("client copy is OS-neutral (no QuickTime/Finder wording in user-facing text)", () => {
  for (const f of ["client/render.js", "client/inspector.js", "client/variants.js"]) {
    const src = readFileSync(join(STUDIO, f), "utf8");
    assert.ok(!/QuickTime/.test(src), `${f} still says QuickTime`);
  }
});
