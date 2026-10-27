// node --test engine/doctor.test.mjs
// Windows/macOS branches are exercised with mocked platform, env, filesystem and child processes.
import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as D from "./doctor.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = fs.readFileSync(path.join(here, "test-fixtures", "claude-init.stream.jsonl"), "utf8");
const SECRET = "sk_TEST_SECRET_VALUE_1234567890";

const WIN = { platform: "win32", arch: "x64", homedir: "C:\\Users\\Ana", osRelease: "10.0.22631" };
const WIN_ENV = {
  USERPROFILE: "C:\\Users\\Ana",
  LOCALAPPDATA: "C:\\Users\\Ana\\AppData\\Local",
  ProgramFiles: "C:\\Program Files",
  "ProgramFiles(x86)": "C:\\Program Files (x86)",
};
const MAC = { platform: "darwin", arch: "arm64", homedir: "/Users/ana", osRelease: "25.0.0" };

/** exec mock: handler(file, args) -> {stdout, code?} | null (null = ENOENT) */
function fakeExec(handler) {
  const calls = [];
  const fn = async (file, args = []) => {
    calls.push([file, args]);
    const r = handler(file, args);
    if (!r) return { ok: false, code: null, stdout: "", stderr: "", error: "ENOENT" };
    const code = r.code ?? 0;
    return { ok: code === 0, code, stdout: r.stdout ?? "", stderr: r.stderr ?? "", error: code === 0 ? null : "ERROR" };
  };
  fn.calls = calls;
  return fn;
}

function ctxFor(base, { files = [], env = {}, exec, ...rest } = {}) {
  const set = new Set(files);
  return D.makeContext({
    ...base,
    env: base === WIN ? { ...WIN_ENV, ...env } : { ...env },
    skillRoot: base === WIN ? "C:\\skills\\estudio-video" : "/skills/estudio-video",
    nodeVersion: "v22.1.0",
    exists: (p) => set.has(p),
    readText: (p) => {
      if (rest.texts?.[p] !== undefined) return rest.texts[p];
      throw new Error("ENOENT " + p);
    },
    listDirs: (p) => rest.dirs?.[p] ?? [],
    freeBytes: () => rest.free ?? 80 * 1024 ** 3,
    canWrite: () => rest.canWrite ?? true,
    exec: exec ?? fakeExec(() => null),
    sleep: async () => {},
    probeRetryMs: 0,
    ...("fetch" in rest ? { fetch: rest.fetch } : {}),
    ...("spawn" in rest ? { spawn: rest.spawn } : {}),
    ...("now" in rest ? { now: rest.now } : {}),
    ...("writeText" in rest ? { writeText: rest.writeText } : {}),
  });
}

// ---------------------------------------------------------------------------------------------------- paths
test("dataDir follows the per-OS convention shared with scripts/paths.py", () => {
  assert.equal(D.dataDir(ctxFor(MAC)), "/Users/ana/Library/Application Support/estudio-video");
  assert.equal(D.dataDir(ctxFor(WIN)), "C:\\Users\\Ana\\AppData\\Local\\estudio-video");
  assert.equal(D.dataDir(ctxFor({ ...WIN }, { env: { LOCALAPPDATA: "D:\\Data" } })), "D:\\Data\\estudio-video");
  assert.equal(D.dataDir(ctxFor({ platform: "linux", arch: "x64", homedir: "/home/ana", osRelease: "6" })), "/home/ana/.local/share/estudio-video");
  assert.equal(D.dataDir(ctxFor({ platform: "linux", arch: "x64", homedir: "/home/ana", osRelease: "6" }, { env: { XDG_DATA_HOME: "/xdg" } })), "/xdg/estudio-video");
});

test("venv python uses Scripts\\python.exe on Windows and bin/python elsewhere", () => {
  assert.equal(D.venvPython(ctxFor(WIN)), "C:\\Users\\Ana\\AppData\\Local\\estudio-video\\venv\\Scripts\\python.exe");
  assert.equal(D.venvPython(ctxFor(MAC)), "/Users/ana/Library/Application Support/estudio-video/venv/bin/python");
});

test("default videos folder", () => {
  assert.equal(D.defaultVideosDir(ctxFor(WIN)), "C:\\Users\\Ana\\Videos");
  assert.equal(D.defaultVideosDir(ctxFor(MAC)), "/Users/ana/Videos");
});

// ---------------------------------------------------------------------------------------------------- where / which
test("parseWhere handles CRLF and blank lines; Windows ranking prefers .exe and demotes WindowsApps stubs", () => {
  const out = "C:\\Users\\Ana\\AppData\\Local\\Microsoft\\WindowsApps\\python.exe\r\nC:\\Python312\\python.exe\r\n\r\nC:\\tools\\python.cmd\r\n";
  const lines = D.parseWhere(out);
  assert.equal(lines.length, 3);
  const ranked = D.rankWindowsPaths(lines);
  assert.equal(ranked[0], "C:\\Python312\\python.exe");
  assert.match(ranked.at(-1), /WindowsApps/);
});

test("findBinary uses `where` on Windows and `which -a` on mac, then falls back to known folders", async () => {
  const exec = fakeExec((f, a) => (f === "where" && a[0] === "ffmpeg" ? { stdout: "C:\\ffmpeg\\bin\\ffmpeg.cmd\r\nC:\\ffmpeg\\bin\\ffmpeg.exe\r\n" } : null));
  const ctx = ctxFor(WIN, { exec });
  assert.equal(await D.findBinary(ctx, "ffmpeg", { envVar: "FFMPEG" }), "C:\\ffmpeg\\bin\\ffmpeg.exe");
  assert.deepEqual(exec.calls[0], ["where", ["ffmpeg"]]);

  const winget = "C:\\Users\\Ana\\AppData\\Local\\Microsoft\\WinGet\\Links\\ffmpeg.exe";
  const c2 = ctxFor(WIN, { files: [winget] });
  assert.equal(await D.findBinary(c2, "ffmpeg", {}), winget);

  const macExec = fakeExec((f, a) => (f === "which" ? null : null));
  const c3 = ctxFor(MAC, { exec: macExec, files: ["/opt/homebrew/bin/ffmpeg"] });
  assert.equal(await D.findBinary(c3, "ffmpeg", {}), "/opt/homebrew/bin/ffmpeg");
  assert.deepEqual(macExec.calls[0], ["which", ["-a", "ffmpeg"]]);
});

// ---------------------------------------------------------------------------------------------------- browser
test("Windows: Chrome in Program Files (x86) is found", () => {
  const chrome = "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe";
  const c = D.checkBrowser(ctxFor(WIN, { files: [chrome] }));
  assert.equal(c.status, "ok");
  assert.equal(c.detail.path, chrome);
});

test("Windows: Chrome in LOCALAPPDATA is found", () => {
  const chrome = "C:\\Users\\Ana\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe";
  assert.equal(D.checkBrowser(ctxFor(WIN, { files: [chrome] })).status, "ok");
});

test("Windows: no browser -> fail with winget instructions; CHROME env wins", () => {
  const none = D.checkBrowser(ctxFor(WIN));
  assert.equal(none.status, "fail");
  assert.ok(none.fix.some((l) => l.includes("winget install Google.Chrome")));
  const custom = D.checkBrowser(ctxFor(WIN, { files: ["D:\\chrome\\chrome.exe"], env: { CHROME: "D:\\chrome\\chrome.exe" } }));
  assert.equal(custom.status, "ok");
  assert.equal(custom.detail.kind, "custom");
});

test("macOS: Chrome in /Applications", () => {
  const c = D.checkBrowser(ctxFor(MAC, { files: ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"] }));
  assert.equal(c.status, "ok");
  const none = D.checkBrowser(ctxFor(MAC));
  assert.ok(none.fix.some((l) => l.includes("brew install --cask google-chrome")));
  assert.ok(none.fix.every((l) => !l.includes("winget install Google.Chrome")));
});

// ---------------------------------------------------------------------------------------------------- python
const PYOK = (v = [3, 12, 1], missing = [], optional = {}) => ({ stdout: JSON.stringify({ v, missing, optional }) });

test("python candidates on Windows: ESTUDIO_PY, venv Scripts\\python.exe, py -3, python, python3", () => {
  const venv = "C:\\Users\\Ana\\AppData\\Local\\estudio-video\\venv\\Scripts\\python.exe";
  const ctx = ctxFor(WIN, { files: [venv], env: { ESTUDIO_PY: "D:\\py\\python.exe" } });
  const c = D.pythonCandidates(ctx).map((x) => [x.cmd, ...x.args].join(" "));
  assert.deepEqual(c, ["D:\\py\\python.exe", venv, "py -3", "python", "python3"]);
});

test("python candidates on mac: venv, legacy venv, python3, python, homebrew", () => {
  const venv = "/Users/ana/Library/Application Support/estudio-video/venv/bin/python";
  const c = D.pythonCandidates(ctxFor(MAC, { files: [venv] })).map((x) => x.cmd);
  assert.equal(c[0], venv);
  assert.deepEqual(c.slice(1), ["python3", "python", "/opt/homebrew/bin/python3", "/usr/local/bin/python3"]);
});

test("resolvePython on Windows falls through to `py -3`, runs it isolated (-I -c)", async () => {
  const exec = fakeExec((f, a) => {
    if (f === "py") return PYOK([3, 12, 1], [], { faster_whisper: true });
    return null; // python / python3 not on PATH
  });
  const ctx = ctxFor(WIN, { exec });
  const res = await D.resolvePython(ctx);
  assert.equal(res.chosen.cmd, "py");
  assert.deepEqual(res.chosen.args, ["-3"]);
  const call = exec.calls.find((c) => c[0] === "py");
  assert.deepEqual(call[1].slice(0, 5), ["-3", "-I", "-X", "utf8", "-c"]);
  // mlx_whisper is only probed on Apple Silicon
  assert.ok(!call[1].at(-1).includes("mlx_whisper"));
});

test("mlx_whisper is probed on Apple Silicon only", async () => {
  const exec = fakeExec(() => PYOK());
  await D.resolvePython(ctxFor(MAC, { exec }));
  assert.ok(exec.calls[0][1].at(-1).includes("mlx_whisper"));
  const exec2 = fakeExec(() => PYOK());
  await D.resolvePython(ctxFor({ ...MAC, arch: "x64" }, { exec: exec2 }));
  assert.ok(!exec2.calls[0][1].at(-1).includes("mlx_whisper"));
});

test("old python (3.9) fails the version check and is not chosen over a newer one", async () => {
  const exec = fakeExec((f) => (f === "python3" ? PYOK([3, 9, 6]) : f === "/opt/homebrew/bin/python3" ? PYOK([3, 12, 2]) : null));
  const res = await D.resolvePython(ctxFor(MAC, { exec }));
  assert.equal(res.chosen.cmd, "/opt/homebrew/bin/python3");
  const only9 = fakeExec((f) => (f === "python3" ? PYOK([3, 9, 6]) : null));
  const { checks } = await D.checkPython(ctxFor(MAC, { exec: only9 }));
  assert.equal(checks.find((c) => c.id === "py.version").status, "fail");
});

test("missing required packages -> fail with pip names; transcription and opencv are warn", async () => {
  const exec = fakeExec((f) => (f === "py" ? PYOK([3, 12, 0], ["PIL", "scipy"], { rembg: false, faster_whisper: false, cv2: false }) : null));
  const { checks } = await D.checkPython(ctxFor(WIN, { exec }));
  const byId = Object.fromEntries(checks.map((c) => [c.id, c]));
  assert.equal(byId["py.required"].status, "fail");
  assert.deepEqual(byId["py.required"].detail.missing, ["Pillow", "scipy"]);
  assert.equal(byId["py.transcribe"].status, "warn"); // Windows: faster-whisper is the backend
  assert.equal(byId["py.faces"].status, "warn"); // Windows: OpenCV YuNet faces (cv2 + model file)
  assert.ok(byId["py.required"].fix.some((l) => l.includes("--fix")));
});

test("no python at all -> fail with winget python instructions on Windows", async () => {
  const { checks } = await D.checkPython(ctxFor(WIN));
  const v = checks.find((c) => c.id === "py.version");
  assert.equal(v.status, "fail");
  assert.ok(v.fix.some((l) => l.includes("winget install Python.Python.3.12")));
});

// ---------------------------------------------------------------------------------------------------- ffmpeg
const ENCODERS = `Encoders:
 V..... = Video
 A..... = Audio
 ------
 V....D libx264              libx264 H.264 (codec h264)
 A....D aac                  AAC (Advanced Audio Coding)
`;
const FILTERS = `Filters:
  T.. = Timeline support
  .S. = Slice threading
 ... acrossfade        AA->A      Cross fade two input audio streams.
 T.. adelay            A->A       Delay one or more audio channels.
 ... alimiter          A->A       Audio lookahead limiter.
 .S. amix              N->A       Audio mixing.
 ... atempo            A->A       Adjust audio tempo.
 ... atrim             A->A       Pick one continuous section from the input.
 ... ebur128           A->N       EBU R128 scanner.
 ... loudnorm          A->A       EBU R128 loudness normalization
`;

test("parseFfmpegList ignores legend lines and returns names", () => {
  const e = D.parseFfmpegList(ENCODERS, "encoders");
  assert.ok(e.has("libx264") && e.has("aac") && !e.has("="));
  const f = D.parseFfmpegList(FILTERS, "filters");
  for (const n of D.REQUIRED_FILTERS) assert.ok(f.has(n), n);
  assert.ok(!f.has("="));
});

test("checkFfmpeg: all good, then a build lacking libx264 and loudnorm fails", async () => {
  const mkExec = (enc, fil) =>
    fakeExec((f, a) => {
      if (f === "where") return { stdout: `C:\\ff\\${a[0]}.exe\r\n` };
      if (a[0] === "-version") return { stdout: "ffmpeg version 7.1-essentials_build\n" };
      if (a.includes("-encoders")) return { stdout: enc };
      if (a.includes("-filters")) return { stdout: fil };
      return null;
    });
  const good = await D.checkFfmpeg(ctxFor(WIN, { exec: mkExec(ENCODERS, FILTERS) }));
  assert.deepEqual(good.map((c) => c.status), ["ok", "ok", "ok"]);
  const bad = await D.checkFfmpeg(ctxFor(WIN, { exec: mkExec(ENCODERS.replace("libx264", "x"), FILTERS.replace("loudnorm", "x")) }));
  const feat = bad.find((c) => c.id === "ffmpeg.features");
  assert.equal(feat.status, "fail");
  assert.deepEqual(feat.detail.missingEncoders, ["libx264"]);
  assert.deepEqual(feat.detail.missingFilters, ["loudnorm"]);
});

test("checkFfmpeg: missing -> fail with per-OS install commands", async () => {
  const w = await D.checkFfmpeg(ctxFor(WIN));
  assert.equal(w[0].status, "fail");
  assert.ok(w[0].fix.some((l) => l.includes("winget install Gyan.FFmpeg")));
  const m = await D.checkFfmpeg(ctxFor(MAC));
  assert.ok(m[0].fix.some((l) => l.includes("brew install ffmpeg")));
});

// ---------------------------------------------------------------------------------------------------- system
test("checkSystem on Windows: Windows 11, USERPROFILE\\Videos, low disk warns", async () => {
  const videos = "C:\\Users\\Ana\\Videos";
  const ctx = ctxFor(WIN, { files: [videos], free: 3 * 1024 ** 3 });
  const [os, disk, vid] = await D.checkSystem(ctx);
  assert.match(os.message, /Windows 11/);
  assert.equal(disk.status, "warn");
  assert.equal(vid.status, "ok");
  assert.equal(vid.detail.folder, videos);
  const noWrite = await D.checkSystem(ctxFor(WIN, { files: [videos], canWrite: false }));
  assert.equal(noWrite[2].status, "fail");
  assert.ok(noWrite[2].fix[0].includes("Propiedades"));
});

test("checkSystem: Windows 10 build and missing Videos folder (warn, parent writable)", async () => {
  const r = await D.checkSystem(ctxFor({ ...WIN, osRelease: "10.0.19045" }, { files: ["C:\\Users\\Ana", "C:\\"] }));
  assert.match(r[0].message, /Windows 10/);
  assert.equal(r[2].status, "warn");
});

test("checkNode: version gate and node_modules", () => {
  const ok = D.checkNode(ctxFor(MAC, { files: ["/skills/estudio-video/engine/node_modules/puppeteer-core/package.json"] }));
  assert.deepEqual(ok.map((c) => c.status), ["ok", "ok"]);
  const old = D.checkNode(D.makeContext({ ...ctxFor(MAC), nodeVersion: "v18.19.0", exists: () => false, skillRoot: "/s" }));
  assert.deepEqual(old.map((c) => c.status), ["fail", "fail"]);
  assert.ok(old[0].fix.some((l) => l.includes("brew install node")));
});

// ---------------------------------------------------------------------------------------------------- claude init
test("parseInitStream finds the init event after hook events and summarizeMcp normalizes it", () => {
  const init = D.parseInitStream(FIXTURE);
  assert.equal(init.subtype, "init");
  const s = D.summarizeMcp(init);
  assert.equal(s.length, 5);
  assert.deepEqual(D.findConnector(s, D.CONNECTORS.higgsfield.re), { name: "claude.ai Higgsfield", status: "connected", source: "claudeai" });
  assert.equal(D.findConnector(s, D.CONNECTORS.reda.re).status, "needs-auth");
  assert.equal(D.findConnector(s, D.CONNECTORS.elevenlabs.re), null);
  assert.equal(D.parseInitEvent("not json"), null);
  assert.equal(D.parseInitEvent(JSON.stringify({ type: "system", subtype: "hook_started" })), null);
  assert.deepEqual(D.summarizeMcp({}), []);
});

test("fixture has no account-identifying data", () => {
  assert.ok(!/@|\/Users\/|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-(?!000000000000)[0-9a-f]{12}/.test(FIXTURE));
});

function fakeChild() {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.killed = false;
  child.kill = () => {
    child.killed = true;
    return true;
  };
  child.pid = 4242;
  return child;
}

test("probeClaudeOnce parses chunked stdout, resolves at init and kills its own child", async () => {
  const child = fakeChild();
  const ctx = ctxFor(MAC, { spawn: () => child });
  const p = D.probeClaudeOnce(ctx, "/bin/claude");
  const mid = Math.floor(FIXTURE.length * 0.7);
  child.stdout.emit("data", FIXTURE.slice(0, mid));
  child.stdout.emit("data", FIXTURE.slice(mid));
  const r = await p;
  assert.equal(r.ok, true);
  assert.equal(r.version, "2.1.308");
  assert.equal(child.killed, true);
});

test("probeClaudeOnce: process exits without init -> not ok; timeout kills the child", async () => {
  const c1 = fakeChild();
  const p1 = D.probeClaudeOnce(ctxFor(MAC, { spawn: () => c1 }), "claude");
  c1.emit("close", 1);
  assert.equal((await p1).reason, "no-init");
  const c2 = fakeChild();
  const ctx = ctxFor(MAC, { spawn: () => c2 });
  ctx.probeMs = 10;
  const r = await D.probeClaudeOnce(ctx, "claude");
  assert.equal(r.reason, "timeout");
  assert.equal(c2.killed, true);
});

const initLine = (servers) => JSON.stringify({ type: "system", subtype: "init", mcp_servers: servers }) + "\n";

test("probeClaude retries while connectors are pending/unlisted and keeps the latest settled status", async () => {
  const snaps = [
    [{ name: "claude.ai Higgsfield", status: "pending", source: "claudeai" }, { name: "claude.ai Reda", status: "pending", source: "claudeai" }],
    [{ name: "audio-studio", status: "connected", source: "user" }], // claude.ai not discovered yet
    [{ name: "claude.ai Higgsfield", status: "connected", source: "claudeai" }, { name: "claude.ai Reda", status: "needs-auth", source: "claudeai" }],
  ];
  let i = 0;
  const ctx = ctxFor(MAC, {
    spawn: () => {
      const ch = fakeChild();
      const line = initLine(snaps[Math.min(i++, snaps.length - 1)]);
      queueMicrotask(() => ch.stdout.emit("data", line));
      return ch;
    },
  });
  const r = await D.probeClaude(ctx, "claude");
  assert.equal(r.ok, true);
  assert.equal(r.attempts, 3);
  assert.equal(D.findConnector(r.servers, D.CONNECTORS.higgsfield.re).status, "connected");
  assert.equal(D.findConnector(r.servers, D.CONNECTORS.reda.re).status, "needs-auth");
});

test("probeClaude gives up after the attempts and reports pending honestly", async () => {
  const ctx = ctxFor(MAC, {
    spawn: () => {
      const ch = fakeChild();
      queueMicrotask(() => ch.stdout.emit("data", initLine([{ name: "claude.ai Higgsfield", status: "pending", source: "claudeai" }])));
      return ch;
    },
  });
  const r = await D.probeClaude(ctx, "claude", { attempts: 2 });
  assert.equal(r.attempts, 2);
  assert.equal(D.findConnector(r.servers, D.CONNECTORS.higgsfield.re).status, "pending");
});

test("checkClaude: CLI missing, skipped, and connector statuses map to Spanish messages with fixes", async () => {
  const skipped = await D.checkClaude(ctxFor(WIN), { skip: true });
  assert.ok(skipped.checks.every((c) => c.status === "skip"));

  const missing = await D.checkClaude(ctxFor(WIN), { skip: false });
  assert.equal(missing.checks[0].status, "warn");
  assert.ok(missing.checks[0].fix.some((l) => l.includes("install.ps1")));

  const claudeExe = "C:\\Users\\Ana\\.local\\bin\\claude.exe";
  const exec = fakeExec((f, a) => (f === "where" ? { stdout: claudeExe + "\r\n" } : f === claudeExe && a[0] === "--version" ? { stdout: "2.1.308 (Claude Code)\n" } : null));
  const ctx = ctxFor(WIN, {
    exec,
    spawn: () => {
      const ch = fakeChild();
      queueMicrotask(() => ch.stdout.emit("data", FIXTURE));
      return ch;
    },
  });
  const r = await D.checkClaude(ctx, { skip: false, online: false });
  const by = Object.fromEntries(r.checks.map((c) => [c.id, c]));
  assert.equal(by["claude.cli"].status, "ok");
  assert.equal(by["claude.higgsfield"].status, "ok");
  assert.equal(by["claude.reda"].status, "warn");
  assert.match(by["claude.reda"].message, /necesita que inicies sesión/);
  assert.ok(by["claude.reda"].fix[0].includes("claude.ai > Configuración > Conectores > Reda > Conectar"));
  assert.ok(by["claude.reda"].fix[1].includes("/mcp"));
  assert.equal(by["claude.elevenlabs"].status, "warn");
  assert.equal(by["claude.reda.staging"].status, "skip");
  assert.equal(r.servers.length, 5);
});

test("Reda staging OAuth metadata -> informational warn (only with --online)", async () => {
  const mkFetch = (servers) => async () => ({ ok: true, json: async () => ({ authorization_servers: servers }) });
  const staging = await D.checkRedaStaging(ctxFor(MAC, { fetch: mkFetch(["https://confident-siren-36-staging.authkit.app"]) }), true);
  assert.equal(staging.status, "warn");
  assert.equal(staging.detail.staging, true);
  const prod = await D.checkRedaStaging(ctxFor(MAC, { fetch: mkFetch(["https://auth.reda.mx"]) }), true);
  assert.equal(prod.status, "ok");
  assert.equal((await D.checkRedaStaging(ctxFor(MAC), false)).status, "skip");
  const down = await D.checkRedaStaging(ctxFor(MAC, { fetch: async () => { throw new Error("offline"); } }), true);
  assert.equal(down.status, "skip");
});

// ---------------------------------------------------------------------------------------------------- secrets
test("ElevenLabs key: presence from env or file, never in any output", async () => {
  const envCtx = ctxFor(MAC, { env: { ELEVENLABS_API_KEY: SECRET } });
  const [c1, c2] = await D.checkElevenLabs(envCtx, { online: false });
  assert.equal(c1.status, "ok");
  assert.equal(c2.status, "skip");
  assert.ok(!JSON.stringify([c1, c2]).includes(SECRET));

  const file = "/Users/ana/.config/reels-dibujados/.env";
  const fileCtx = ctxFor(MAC, { files: [file], texts: { [file]: `OTHER=1\nELEVENLABS_API_KEY="${SECRET}"\n` } });
  const [f1] = await D.checkElevenLabs(fileCtx, { online: false });
  assert.equal(f1.detail.source, "archivo");
  assert.ok(!JSON.stringify(f1).includes(SECRET));

  const [none] = await D.checkElevenLabs(ctxFor(WIN), { online: false });
  assert.equal(none.status, "warn");
  assert.ok(none.fix[0].includes("C:\\Users\\Ana\\.config\\reels-dibujados\\.env"));
});

test("validateElevenKey: ok + remaining characters, invalid, restricted key, offline; key only goes in the header", async () => {
  const seen = [];
  const mk = (handler) => ctxFor(MAC, { fetch: async (url, init) => { seen.push([url, init]); return handler(url); } });
  const resp = (status, body) => ({ status, ok: status >= 200 && status < 300, json: async () => body, text: async () => JSON.stringify(body) });

  const ok = await D.validateElevenKey(mk(() => resp(200, { subscription: { character_count: 1000, character_limit: 31000 } })), SECRET);
  assert.equal(ok.status, "ok");
  assert.equal(ok.detail.charactersRemaining, 30000);
  assert.ok(!JSON.stringify(ok).includes(SECRET));
  assert.equal(seen[0][0], "https://api.elevenlabs.io/v1/user");
  assert.equal(seen[0][1].method, "GET");
  assert.equal(seen[0][1].headers["xi-api-key"], SECRET);

  const bad = await D.validateElevenKey(mk(() => resp(401, { detail: { status: "invalid_api_key" } })), SECRET);
  assert.equal(bad.status, "warn");
  assert.equal(bad.detail.valid, false);

  const restricted = await D.validateElevenKey(mk((u) => (u.endsWith("/v1/user") ? resp(401, { detail: { status: "missing_permissions" } }) : resp(200, []))), SECRET);
  assert.equal(restricted.status, "ok");

  const off = await D.validateElevenKey(ctxFor(MAC, { fetch: async () => { throw new Error("x"); } }), SECRET);
  assert.equal(off.status, "warn");
  assert.ok(!JSON.stringify(off).includes(SECRET));
});

// ---------------------------------------------------------------------------------------------------- readiness
const C = (id, status) => ({ id, status });
const allOk = () => [
  "node.version", "node.modules", "ffmpeg.bin", "ffmpeg.features", "ffprobe.bin", "browser", "py.version", "py.required", "py.transcribe",
  "secret.elevenlabs", "claude.higgsfield",
].map((id) => C(id, "ok"));

test("readiness: everything ok -> all four ready", () => {
  const r = D.computeReadiness(allOk());
  assert.deepEqual(r.map((x) => x.ready), [true, true, true, true]);
});

test("readiness: tipo 3 needs Higgsfield, voz needs ElevenLabs, tipo 2 needs transcription", () => {
  const set = (id, status) => allOk().map((c) => (c.id === id ? C(id, status) : c));
  let r = Object.fromEntries(D.computeReadiness(set("claude.higgsfield", "warn")).map((x) => [x.id, x]));
  assert.equal(r.tipo3.ready, false);
  assert.match(r.tipo3.missing.join(), /Higgsfield/);
  assert.ok(r.tipo1.ready && r.tipo2.ready && r.estudio.ready);

  r = Object.fromEntries(D.computeReadiness(set("secret.elevenlabs", "warn")).map((x) => [x.id, x]));
  assert.equal(r.tipo1.ready, false);
  assert.ok(r.tipo2.ready && r.tipo3.ready);

  r = Object.fromEntries(D.computeReadiness(set("py.transcribe", "warn")).map((x) => [x.id, x]));
  assert.equal(r.tipo2.ready, false);
  assert.ok(r.tipo1.ready && r.tipo3.ready);

  r = Object.fromEntries(D.computeReadiness(set("ffmpeg.bin", "fail")).map((x) => [x.id, x]));
  assert.ok(Object.values(r).filter((x) => x.id !== "estudio").every((x) => !x.ready));
  assert.ok(r.estudio.ready); // the editor does not need ffmpeg

  r = Object.fromEntries(D.computeReadiness(set("claude.higgsfield", "skip")).map((x) => [x.id, x]));
  assert.match(r.tipo3.missing.join(), /sin comprobar/);
});

test("readiness: an invalid ElevenLabs key blocks voice", () => {
  const checks = [...allOk(), C("secret.elevenlabs.online", "warn")];
  assert.equal(D.computeReadiness(checks).find((x) => x.id === "tipo1").ready, false);
});

// ---------------------------------------------------------------------------------------------------- skill config
test("checkSkillConfig: valid config + brands; broken config fails; no brands warns", () => {
  const root = "/skills/estudio-video";
  const cfg = `${root}/engine/studio/config.json`;
  const ctx = ctxFor(MAC, {
    files: [cfg, `${root}/brands`, `${root}/brands/reda/brand.json`],
    texts: { [cfg]: JSON.stringify({ higgsfield: {}, elevenlabs: {} }) },
    dirs: { [`${root}/brands`]: ["_template", "reda", "empty"] },
  });
  const [c, b] = D.checkSkillConfig(ctx);
  assert.equal(c.status, "ok");
  assert.equal(b.status, "ok");
  assert.deepEqual(b.detail.brands, ["reda"]);
  const broken = D.checkSkillConfig(ctxFor(MAC, { files: [cfg], texts: { [cfg]: "{nope" } }));
  assert.equal(broken[0].status, "fail");
  assert.equal(broken[1].status, "warn");
});

// ---------------------------------------------------------------------------------------------------- cache
test("doctor-last.json: written with readiness; fresh+green is skipped, stale or not green is not", () => {
  const written = {};
  const now = Date.parse("2026-10-22T12:00:00Z");
  const ctx = ctxFor(MAC, { now: () => now, writeText: (p, s) => (written[p] = s) });
  const result = { timestamp: new Date(now).toISOString(), ok: true, allGreen: true, platform: "darwin", readiness: [{ id: "tipo1", ready: true }] };
  assert.ok(D.writeCache(ctx, result));
  const p = "/Users/ana/Library/Application Support/estudio-video/doctor-last.json";
  assert.ok(written[p]);

  const readCtx = (ts, allGreen, nowMs = now) =>
    ctxFor(MAC, { now: () => nowMs, files: [p], texts: { [p]: JSON.stringify({ timestamp: ts, allGreen }) } });
  assert.equal(D.readFreshCache(readCtx("2026-10-20T12:00:00Z", true)).skipped, true);
  assert.equal(D.readFreshCache(readCtx("2026-10-10T12:00:00Z", true)), null); // > 7 days
  assert.equal(D.readFreshCache(readCtx("2026-10-21T12:00:00Z", false)), null); // not green
  assert.equal(D.readFreshCache(ctxFor(MAC)), null); // no file
});

// ---------------------------------------------------------------------------------------------------- fix
test("buildFixPlan: Windows uses winget ids, mac uses brew; nothing missing -> empty", () => {
  const failing = (ids) => ({ checks: ids.map((id) => ({ id, status: "fail" })) });
  const w = D.buildFixPlan(ctxFor(WIN), failing(["node.version", "ffmpeg.bin", "browser"]), null);
  assert.deepEqual(w.map((s) => [s.cmd[0], ...s.cmd[1]].join(" ")), [
    "winget install --id OpenJS.NodeJS.LTS -e",
    "winget install --id Gyan.FFmpeg -e",
    "winget install --id Google.Chrome -e",
  ]);
  const m = D.buildFixPlan(ctxFor(MAC), failing(["ffmpeg.bin", "browser", "node.modules"]), null);
  assert.deepEqual(m.map((s) => s.id), ["ffmpeg", "chrome", "npm"]);
  assert.deepEqual(m[0].cmd, ["brew", ["install", "ffmpeg"]]);
  assert.deepEqual(m[1].cmd, ["brew", ["install", "--cask", "google-chrome"]]);
  assert.equal(m[2].cmd[0], "npm");
  assert.deepEqual(D.buildFixPlan(ctxFor(MAC), failing([]), null), []);
});

test("buildFixPlan: ONE python step (scripts/setup_python.py) only when it exists; Windows npm is npm.cmd", () => {
  const req = "C:\\skills\\estudio-video\\scripts\\requirements.txt";
  const setup = "C:\\skills\\estudio-video\\scripts\\setup_python.py";
  const res = { firstVersionOk: { cmd: "py", args: ["-3"], version: [3, 12, 0] } };
  const checks = { checks: [{ id: "py.required", status: "fail" }, { id: "node.modules", status: "fail" }] };
  const withReq = D.buildFixPlan(ctxFor(WIN, { files: [req, setup] }), checks, res);
  assert.deepEqual(withReq.map((s) => s.id), ["npm", "pyenv"]);
  assert.equal(withReq[0].cmd[0], "npm.cmd");
  assert.deepEqual(withReq[1].cmd, ["py", ["-3", setup]]);
  const without = D.buildFixPlan(ctxFor(WIN), checks, res);
  assert.equal(without.find((s) => s.id === "pip-manual").kind, "manual");
  assert.ok(!without.some((s) => s.id === "pyenv"));
});

test("doctor's interpreter order mirrors engine/studio/pyenv.mjs (the one node-side lookup)", async () => {
  const { pythonCandidates } = await import("./studio/pyenv.mjs");
  const opts = { env: {}, platform: "darwin", home: "/Users/ana", exists: () => true };
  const want = pythonCandidates(opts);
  const got = D.pythonCandidates(ctxFor(MAC, { files: [] })).map((c) => c.cmd);
  const sub = want.filter((c) => got.includes(c) || !c.startsWith("/usr/bin"));
  assert.deepEqual(got.filter((c) => want.includes(c)), sub.filter((c) => got.includes(c)));
});

test("doctor's Python package lists match scripts/requirements.txt", () => {
  const txt = fs.readFileSync(path.join(D.SKILL_ROOT, "scripts", "requirements.txt"), "utf8");
  const reqs = txt.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#")).map((l) => l.split(/[<>=;\s[]/)[0].toLowerCase());
  for (const p of [...D.PY_REQUIRED, ...D.PY_OPTIONAL]) assert.ok(reqs.includes(p.pip.toLowerCase()), `${p.pip} is checked by the doctor but missing from requirements.txt`);
});

test("runFix never runs anything the user declines, and runs on explicit yes", async () => {
  const exec = fakeExec((f) => (f === "which" ? { stdout: "/opt/homebrew/bin/brew\n" } : null));
  const ctx = ctxFor(MAC, { exec });
  const result = { checks: [{ id: "ffmpeg.bin", status: "fail" }] };
  const mkIo = (answer) => {
    const io = { out: [], ran: [], print: (s) => io.out.push(s), ask: async () => answer, run: async (f, a) => (io.ran.push([f, a]), 0) };
    return io;
  };
  const no = mkIo(false);
  assert.deepEqual(await D.runFix(ctx, result, no), { ran: 0, declined: 1 });
  assert.equal(no.ran.length, 0);
  const yes = mkIo(true);
  assert.deepEqual(await D.runFix(ctx, result, yes), { ran: 1, declined: 0 });
  assert.deepEqual(yes.ran, [["brew", ["install", "ffmpeg"]]]);
  assert.ok(yes.out.join("\n").includes("brew install ffmpeg"));
});

test("runFix without brew/winget explains instead of installing", async () => {
  const io = { out: [], ran: [], print: (s) => io.out.push(s), ask: async () => true, run: async (f, a) => (io.ran.push([f, a]), 0) };
  await D.runFix(ctxFor(MAC), { checks: [{ id: "ffmpeg.bin", status: "fail" }] }, io);
  assert.equal(io.ran.length, 0);
  assert.match(io.out.join("\n"), /brew\.sh/);
});

// ---------------------------------------------------------------------------------------------------- end to end (mocked Windows)
test("runChecks on a mocked Windows machine produces serializable, secret-free JSON and exit semantics", async () => {
  const chrome = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  const exec = fakeExec((f, a) => {
    if (f === "where") return { stdout: `C:\\bin\\${a[0]}.exe\r\n` };
    if (a[0] === "-version") return { stdout: "ffmpeg version 7.1\n" };
    if (a.includes("-encoders")) return { stdout: ENCODERS };
    if (a.includes("-filters")) return { stdout: FILTERS };
    if (f === "py") return PYOK([3, 12, 0], [], { faster_whisper: true, rembg: true, cv2: true });
    return null;
  });
  const root = "C:\\skills\\estudio-video";
  const cfg = `${root}\\engine\\studio\\config.json`;
  const ctx = ctxFor(WIN, {
    exec,
    env: { ELEVENLABS_API_KEY: SECRET },
    files: [chrome, "C:\\Users\\Ana\\Videos", `${root}\\engine\\node_modules\\puppeteer-core\\package.json`, cfg, `${root}\\brands`, `${root}\\brands\\reda\\brand.json`, "C:\\bin\\ffmpeg.exe"],
    texts: { [cfg]: JSON.stringify({ higgsfield: {}, elevenlabs: {} }) },
    dirs: { [`${root}\\brands`]: ["reda"] },
  });
  const res = await D.runChecks(ctx, { skipClaude: true, allPlatforms: true });
  const json = JSON.stringify(res);
  assert.ok(!json.includes(SECRET));
  assert.deepEqual(res.checks.filter((c) => c.required && c.status === "fail").map((c) => c.id), []); // Windows is supported now
  assert.equal(res.platform, "win32");
  assert.equal(res.allGreen, false); // higgsfield skipped
  const by = Object.fromEntries(res.readiness.map((r) => [r.id, r]));
  assert.ok(by.tipo1.ready && by.estudio.ready && by.tipo2.ready && !by.tipo3.ready); // faster-whisper (no mlx) is the Windows transcription backend
  const report = D.formatReport(res);
  assert.match(report, /Diagnóstico de Estudio de video/);
  assert.match(report, /Listo para:/);
  assert.ok(!report.includes(SECRET));
  // earshot is an optional warn on Windows too (its venv is not there); swift does not exist on Windows (skip)
  assert.equal(res.checks.find((c) => c.id === "opt.earshot").status, "warn");
  assert.equal(res.checks.find((c) => c.id === "opt.swift").status, "skip");
});

test("a required failure makes ok=false", async () => {
  const res = await D.runChecks(ctxFor(WIN), { skipClaude: true, allPlatforms: true });
  assert.equal(res.ok, false);
  assert.ok(res.checks.some((c) => c.required && c.status === "fail"));
  assert.match(D.formatReport(res), /Cómo arreglarlo/);
});

test("parseArgs", () => {
  const o = D.parseArgs(["--json", "--online", "--skip-claude", "--bogus"]);
  assert.ok(o.json && o.online && o.skipClaude && !o.fix);
  assert.deepEqual(o.unknown, ["--bogus"]);
});

// ---------------------------------------------------------------------------------------------------- scope: macOS only
test("Linux: first check is a required fail, nothing is ready, the rest is skipped (Windows is no longer gated)", async () => {
  for (const base of [{ platform: "linux", arch: "x64", homedir: "/home/a", osRelease: "6.1" }]) {
    const exec = fakeExec(() => { throw new Error("nothing else may run"); });
    const res = await D.runChecks(ctxFor(base, { exec }), {});
    assert.equal(res.ok, false);
    assert.equal(res.allGreen, false);
    assert.equal(res.checks.length, 1);
    assert.equal(res.checks[0].id, "sys.os");
    assert.equal(res.checks[0].status, "fail");
    assert.match(res.checks[0].message, /No compatible por ahora/);
    assert.match(res.checks[0].message, /Mac y en Windows 11/);
    assert.ok(res.readiness.every((r) => r.ready === false));
    assert.match(D.formatReport(res), /No compatible por ahora/);
  }
});

test("Intel Mac: chip warns and transcription (mlx_whisper) is unavailable; Apple Silicon needs mlx_whisper", async () => {
  const intel = ctxFor({ ...MAC, arch: "x64" });
  const [, chip] = await D.checkSystem(intel);
  assert.equal(chip.id, "sys.chip");
  assert.equal(chip.status, "warn");
  assert.match(chip.message, /Apple Silicon/);
  const exec = fakeExec((f) => (f === "python3" ? PYOK([3, 12, 0], [], { mlx_whisper: true }) : null));
  const t1 = (await D.checkPython(ctxFor({ ...MAC, arch: "x64" }, { exec }))).checks.find((c) => c.id === "py.transcribe");
  assert.equal(t1.status, "warn");
  assert.ok(t1.fix.every((l) => !/faster|opencv/i.test(l)));
  const t2 = (await D.checkPython(ctxFor(MAC, { exec }))).checks.find((c) => c.id === "py.transcribe");
  assert.equal(t2.status, "ok");
  const t3 = (await D.checkPython(ctxFor(MAC, { exec: fakeExec((f) => (f === "python3" ? PYOK() : null)) }))).checks.find((c) => c.id === "py.transcribe");
  assert.equal(t3.status, "warn");
  assert.ok(t3.fix[0].includes("mlx-whisper"));
  // Rosetta: node reports x64 but the hardware is arm64
  const ros = ctxFor({ ...MAC, arch: "x64" });
  ros.hwArm64 = true;
  assert.equal((await D.checkSystem(ros))[1].status, "ok");
});

test("macOS version is reported", async () => {
  const exec = fakeExec((f) => (f === "sw_vers" ? { stdout: "15.2\n" } : null));
  const [os] = await D.checkSystem(ctxFor(MAC, { exec }));
  assert.equal(os.status, "ok");
  assert.match(os.message, /macOS 15\.2/);
});

test("Codex: absent -> skip; present -> presence of reda/higgsfield from `codex mcp list` names only", async () => {
  assert.equal((await D.checkCodex(ctxFor(MAC), { skip: false }))[0].status, "skip");
  const table = "Name   Url   Status   Auth\nreda   https://mcp.reda.mx/mcp   enabled   OAuth\nfal   https://mcp.fal.ai/mcp   enabled   Not logged in\n\nName Command Args Env Cwd Status Auth\nblender uv x - - enabled Unsupported\n";
  assert.deepEqual(D.parseCodexMcpNames(table), ["reda", "fal", "blender"]);
  const exec = fakeExec((f, a) => (f === "which" ? { stdout: "/Users/ana/.local/bin/codex\n" } : a[0] === "mcp" ? { stdout: table } : null));
  const r = await D.checkCodex(ctxFor(MAC, { exec }), { skip: false });
  const by = Object.fromEntries(r.map((c) => [c.id, c]));
  assert.equal(by["codex.cli"].status, "ok");
  assert.equal(by["codex.reda"].status, "ok");
  assert.equal(by["codex.higgsfield"].status, "warn");
  assert.ok(by["codex.higgsfield"].fix[0].includes("codex mcp login higgsfield"));
  assert.match(by["codex.reda"].message, /no puedo confirmar/);
});

// ---------------------------------------------------------------------------------------------------- Windows 11 (+ optional NVIDIA)
const NVENC_LINE = " V....D h264_nvenc            NVIDIA NVENC H.264 encoder\n";
const WIN_ROOT = "C:\\skills\\estudio-video";
const WIN_MODEL = "C:\\Users\\Ana\\AppData\\Local\\estudio-video\\models\\face_detection_yunet_2023mar.onnx";
const WIN_CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const WIN_PY_OK = () => PYOK([3, 12, 0], [], { faster_whisper: true, cv2: true, rembg: true });

/** Windows machine: ffmpeg/where/nvidia-smi/py answered by the mock; `nvidia` is nvidia-smi stdout (null = not installed). */
function winExec({ nvidia = null, encoders = ENCODERS, py = WIN_PY_OK() } = {}) {
  return fakeExec((f, a) => {
    if (f === "where") return { stdout: `C:\\bin\\${a[0]}.exe\r\n` };
    if (f === "nvidia-smi") return nvidia === null ? null : { stdout: nvidia };
    if (a[0] === "-version") return { stdout: "ffmpeg version 7.1\n" };
    if (a.includes("-encoders")) return { stdout: encoders };
    if (a.includes("-filters")) return { stdout: FILTERS };
    if (f === "py") return py;
    return null;
  });
}
function winCtx({ exec, files = [], env = {} } = {}) {
  const cfg = `${WIN_ROOT}\\engine\\studio\\config.json`;
  return ctxFor(WIN, {
    exec: exec ?? winExec(),
    env,
    files: [WIN_CHROME, "C:\\Users\\Ana\\Videos", `${WIN_ROOT}\\engine\\node_modules\\puppeteer-core\\package.json`, cfg, `${WIN_ROOT}\\brands`, "C:\\bin\\ffmpeg.exe", ...files],
    texts: { [cfg]: JSON.stringify({ higgsfield: {}, elevenlabs: {} }) },
    dirs: { [`${WIN_ROOT}\\brands`]: [] },
  });
}
const byIdOf = (checks) => Object.fromEntries(checks.map((c) => [c.id, c]));

test("Windows: faster-whisper + OpenCV + YuNet model present -> type 2 ready (no mlx_whisper needed)", async () => {
  const res = await D.runChecks(winCtx({ files: [WIN_MODEL] }), { skipClaude: true });
  const by = byIdOf(res.checks);
  assert.equal(res.platform, "win32");
  assert.equal(by["sys.os"].status, "ok");
  assert.equal(by["py.transcribe"].status, "ok");
  assert.match(by["py.transcribe"].message, /faster-whisper/);
  assert.equal(by["py.faces"].status, "ok");
  assert.equal(by["py.gpu"], undefined); // no NVIDIA card: no GPU opt-in offered
  assert.equal(by["ffmpeg.nvenc"], undefined);
  assert.equal(by["sys.gpu"].status, "skip");
  const r = Object.fromEntries(res.readiness.map((x) => [x.id, x]));
  assert.ok(r.tipo2.ready && r.estudio.ready);
  assert.match(r.tipo1.missing.join(), /llave de ElevenLabs/); // type 1 still needs the voice key, as on Mac
  assert.deepEqual(res.checks.filter((c) => c.required && c.status === "fail"), []);
  assert.equal(res.python.interpreter, "py -3");
});

test("Windows: without the YuNet model, faces warn but type 2 stays ready (faces is optional, like swift on Mac)", async () => {
  const res = await D.runChecks(winCtx({ files: [] }), { skipClaude: true });
  const by = byIdOf(res.checks);
  assert.equal(by["py.faces"].status, "warn");
  assert.match(by["py.faces"].message, /modelo de detección de caras/);
  assert.ok(Object.fromEntries(res.readiness.map((x) => [x.id, x])).tipo2.ready);
});

test("Windows: faster-whisper missing -> type 2 not ready, with the setup_python.py fix", async () => {
  const res = await D.runChecks(winCtx({ files: [WIN_MODEL], exec: winExec({ py: PYOK([3, 12, 0], [], { cv2: true }) }) }), { skipClaude: true });
  const by = byIdOf(res.checks);
  assert.equal(by["py.transcribe"].status, "warn");
  assert.ok(by["py.transcribe"].fix.some((l) => l.includes("setup_python.py")));
  assert.equal(Object.fromEntries(res.readiness.map((x) => [x.id, x])).tipo2.ready, false);
});

test("Windows + NVIDIA: GPU reported with driver, opt-in GPU fix steps, h264_nvenc detected", async () => {
  const exec = winExec({ nvidia: "NVIDIA GeForce RTX 4070, 552.22\r\n", encoders: ENCODERS + NVENC_LINE });
  const res = await D.runChecks(winCtx({ exec, files: [WIN_MODEL] }), { skipClaude: true });
  const by = byIdOf(res.checks);
  assert.equal(by["sys.gpu"].status, "ok");
  assert.match(by["sys.gpu"].message, /RTX 4070/);
  assert.match(by["sys.gpu"].message, /552\.22/);
  assert.equal(by["py.gpu"].status, "warn"); // opt-in: never silently installed
  const fix = by["py.gpu"].fix.join("\n");
  assert.match(fix, /setup_python\.py --gpu/);
  assert.match(fix, /ESTUDIO_VIDEO_ENCODER=h264_nvenc/);
  assert.equal(by["ffmpeg.nvenc"].status, "ok");
  assert.equal(res.checks.filter((c) => c.required && c.status === "fail").length, 0);
  assert.ok(Object.fromEntries(res.readiness.map((x) => [x.id, x])).tipo2.ready); // GPU is never required
});

test("Windows + NVIDIA but ffmpeg without h264_nvenc -> warn with the full-build fix", async () => {
  const exec = winExec({ nvidia: "NVIDIA GeForce RTX 3060, 560.10\r\n", encoders: ENCODERS });
  const by = byIdOf((await D.runChecks(winCtx({ exec, files: [WIN_MODEL] }), { skipClaude: true })).checks);
  assert.equal(by["ffmpeg.nvenc"].status, "warn");
  assert.ok(by["ffmpeg.nvenc"].fix.some((l) => l.includes("Gyan.FFmpeg")));
});

test("nvidia-smi is only probed on Windows: macOS never runs it", async () => {
  const exec = fakeExec(() => null);
  await D.runChecks(ctxFor(MAC, { exec }), { skipClaude: true });
  assert.ok(!exec.calls.some((c) => c[0] === "nvidia-smi"));
});

test("NVIDIA GPU detection parses the nvidia-smi csv line and is memoized on the context", async () => {
  const exec = winExec({ nvidia: "NVIDIA RTX A2000 Laptop GPU, 572.16\r\nNVIDIA second line, 1\r\n" });
  const ctx = winCtx({ exec });
  assert.deepEqual(await D.detectNvidia(ctx), { present: true, name: "NVIDIA RTX A2000 Laptop GPU", driver: "572.16" });
  await D.detectNvidia(ctx);
  assert.equal(exec.calls.filter((c) => c[0] === "nvidia-smi").length, 1);
  assert.deepEqual(await D.detectNvidia(winCtx({ exec: winExec() })), { present: false, name: null, driver: null });
});

test("Windows fix plan: Python env for missing faces/transcription, GPU step only as opt-in when NVIDIA", async () => {
  const files = [`${WIN_ROOT}\\scripts\\setup_python.py`, `${WIN_ROOT}\\scripts\\requirements.txt`];
  const py = { firstVersionOk: { cmd: "py", args: ["-3"] } };
  const base = [{ id: "py.version", status: "ok" }, { id: "py.required", status: "ok" }, { id: "py.faces", status: "warn" }, { id: "py.transcribe", status: "ok" }];
  const plan = D.buildFixPlan(winCtx({ files }), { checks: base }, py);
  assert.ok(plan.some((s) => s.id === "pyenv" && s.cmd[1].includes(`${WIN_ROOT}\\scripts\\setup_python.py`)));
  assert.ok(!plan.some((s) => s.id === "pyenv-gpu"));
  const gpu = D.buildFixPlan(winCtx({ files }), { checks: [...base, { id: "py.gpu", status: "warn" }] }, py);
  const step = gpu.find((s) => s.id === "pyenv-gpu");
  assert.ok(step);
  assert.deepEqual(step.cmd[1].slice(0, 2), ["-3", `${WIN_ROOT}\\scripts\\setup_python.py`]);
  assert.equal(step.cmd[1].at(-1), "--gpu");
});

test("--print-python prints one line with the skill venv python and runs no checks", async () => {
  const exec = fakeExec(() => {
    throw new Error("no checks may run");
  });
  const lines = [];
  const log = console.log;
  console.log = (...a) => lines.push(a.join(" "));
  let code;
  try {
    code = await D.main(["--print-python"], ctxFor(WIN, { exec }));
  } finally {
    console.log = log;
  }
  assert.equal(code, 0);
  assert.deepEqual(lines, ["C:\\Users\\Ana\\AppData\\Local\\estudio-video\\venv\\Scripts\\python.exe"]);
  assert.equal(exec.calls.length, 0);
});

test("the venv path matches engine/studio/pyenv.mjs (same data dir rules; separators aside)", async () => {
  const pyenv = await import("./studio/pyenv.mjs");
  const norm = (p) => p.replace(/\\/g, "/");
  assert.equal(norm(D.venvPython(ctxFor(WIN))), norm(pyenv.venvPython("win32", pyenv.dataDir(WIN_ENV, "win32", WIN.homedir))));
  assert.equal(D.venvPython(ctxFor(MAC)), pyenv.venvPython("darwin", pyenv.dataDir({}, "darwin", "/Users/ana")));
  // ESTUDIO_DATA_DIR overrides the data dir on every OS, as in pyenv.mjs
  assert.equal(D.venvPython(ctxFor(WIN, { env: { ESTUDIO_DATA_DIR: "D:\\data" } })), "D:\\data\\venv\\Scripts\\python.exe");
  assert.equal(D.dataDir(ctxFor(MAC, { env: { ESTUDIO_DATA_DIR: "/tmp/x" } })), "/tmp/x");
});

test("faces model lives under <data_dir>/models and the probe list is OS-aware", () => {
  assert.equal(D.faceModelPath(ctxFor(WIN)), WIN_MODEL);
  assert.deepEqual(D.optionalProbeMods(ctxFor(WIN)), ["rembg", "faster_whisper", "cv2"]);
  assert.deepEqual(D.optionalProbeMods(ctxFor(MAC)), ["rembg", "mlx_whisper"]);
  assert.deepEqual(D.optionalProbeMods(ctxFor({ ...MAC, arch: "x64" })), ["rembg"]); // Intel Mac stays mlx-only (no faster-whisper)
});

test("earshot on Windows checks <home>\\.venv\\Scripts\\earshot.exe; audio-studio is skipped and music is Eleven Music", async () => {
  const earshot = "C:\\Users\\Ana\\tools\\earshot\\.venv\\Scripts\\earshot.exe";
  const by = byIdOf(await D.checkOptionalTools(ctxFor(WIN, { files: [earshot] }), null));
  assert.equal(by["opt.earshot"].status, "ok");
  assert.equal(by["opt.audio-studio"].status, "skip");
  assert.match(by["opt.audio-studio"].message, /no está disponible en Windows/);
  assert.equal(by["opt.music"].status, "warn"); // no key, no connector
  const withKey = byIdOf(await D.checkOptionalTools(ctxFor(WIN, { env: { ELEVENLABS_API_KEY: SECRET } }), null));
  assert.equal(withKey["opt.music"].status, "ok");
  assert.ok(!JSON.stringify(withKey).includes(SECRET));
  const connected = byIdOf(await D.checkOptionalTools(ctxFor(WIN), [{ name: "elevenlabs", status: "connected", source: "claudeai" }]));
  assert.equal(connected["opt.music"].status, "ok");
});

test("Windows: no Mac-only check is emitted (chip, Homebrew-style probes, swift binary)", async () => {
  const res = await D.runChecks(winCtx({ files: [WIN_MODEL] }), { skipClaude: true });
  const ids = res.checks.map((c) => c.id);
  assert.ok(!ids.includes("sys.chip"));
  assert.equal(byIdOf(res.checks)["opt.swift"].status, "skip");
});
