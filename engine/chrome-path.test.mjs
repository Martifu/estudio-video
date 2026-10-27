// node --test engine/chrome-path.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { chromeCandidates, resolveChrome } from "./chrome-path.mjs";

const WIN = { platform: "win32", env: { ProgramFiles: "C:\\Program Files", LOCALAPPDATA: "C:\\Users\\Ana\\AppData\\Local" }, homedir: "C:\\Users\\Ana" };
const MAC = { platform: "darwin", env: {}, homedir: "/Users/ana" };

test("macOS candidates and the default are unchanged", () => {
  assert.deepEqual(chromeCandidates(MAC).map((c) => c.path), [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Users/ana/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ]);
  // nothing installed: the historical macOS path (the launch error names it)
  assert.equal(resolveChrome({ ...MAC, exists: () => false }), "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome");
  assert.equal(resolveChrome({ ...MAC, exists: (p) => p.startsWith("/Users/ana/") }), "/Users/ana/Applications/Google Chrome.app/Contents/MacOS/Google Chrome");
});

test("Windows candidates use Windows paths (Program Files, Program Files (x86), LocalAppData)", () => {
  assert.deepEqual(chromeCandidates(WIN).map((c) => c.path), [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Users\\Ana\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe",
  ]);
  const local = "C:\\Users\\Ana\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe";
  assert.equal(resolveChrome({ ...WIN, exists: (p) => p === local }), local);
});

test("CHROME env always wins, even when it points nowhere", () => {
  assert.equal(resolveChrome({ ...WIN, env: { ...WIN.env, CHROME: "D:\\Chrome\\chrome.exe" }, exists: () => true }), "D:\\Chrome\\chrome.exe");
  assert.equal(resolveChrome({ ...MAC, env: { CHROME: "/opt/chrome" }, exists: () => false }), "/opt/chrome");
});

test("Linux candidates", () => {
  assert.equal(resolveChrome({ platform: "linux", env: {}, homedir: "/home/a", exists: (p) => p === "/usr/bin/chromium" }), "/usr/bin/chromium");
});
