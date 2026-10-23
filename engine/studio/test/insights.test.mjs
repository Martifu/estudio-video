// node --test engine/studio/test/insights.test.mjs  (cost aggregation + reference validation, against a temp RUN)
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { registerInsights } from "../insights.mjs";

const here = join(dirname(fileURLToPath(import.meta.url)), "..");
function setup({ ledger, media, requests, history = [] } = {}) {
  const runDir = mkdtempSync(join(tmpdir(), "insights-"));
  const compDir = join(runDir, "comp");
  const studioDir = join(compDir, ".studio");
  const historyDir = join(studioDir, "history");
  mkdirSync(historyDir, { recursive: true });
  if (ledger) writeFileSync(join(runDir, "ledger.json"), JSON.stringify(ledger));
  if (media) writeFileSync(join(studioDir, "media.json"), JSON.stringify({ entries: media }));
  if (requests) writeFileSync(join(studioDir, "requests.jsonl"), requests.map((r) => JSON.stringify(r)).join("\n") + "\n");
  for (const n of history) writeFileSync(join(historyDir, n), "[]");
  const routes = {};
  const ctx = {
    here, compDir, runDir, compName: "comp", studioDir, historyDir,
    json: (res, code, obj) => { res.code = code; res.body = obj; },
    readJson: async (req) => req.body, readBody: async () => Buffer.alloc(0),
    writeAtomic: (f, d) => writeFileSync(f, d), insideDir: () => true, broadcast: () => {},
    route: (method, path, mutating, handler) => { routes[`${method} ${path}`] = { handler, mutating }; }
  };
  registerInsights(ctx);
  const call = async (key, body) => { const res = {}; await routes[key].handler({ body }, res); return res; };
  return { runDir, call, routes, ctx };
}

test("ledger jobs split into drafts and finals; the same spend in media.json / requests is not counted twice", async () => {
  const { call } = setup({
    ledger: { cap: 500, jobs: [{ item: "G1 seedance 14s draft", credits: 42, job_id: "j1" }, { item: "G1 final 1080p", credits: 224, job_id: "j2" }, { item: "algo", credits: 10, job_id: "j3" }] },
    media: [{ id: "hf:j1", job_id: "j1", source: "higgsfield", quality: "draft480", cost: 42 }, { id: "hf:j4", job_id: "j4", source: "higgsfield", quality: "draft480", cost: 15 }],
    requests: [
      { id: "rq-1", action: "footage_regen", costClass: "higgsfield", status: "done", cost_real: 42, result_media_id: "hf:j1" },
      { id: "rq-2", action: "voice_full", costClass: "elevenlabs", status: "approved", estimate: { chars: 100 } },
      { id: "rq-2", status: "done", cost_real: 40 },
      { id: "rq-3", action: "voice_retake", costClass: "elevenlabs", status: "pending", estimate: { chars: 999 } } // not done: not counted
    ],
    history: ["2026-01-01-original.json", "2026-01-02.json", "captions-2026-01-03.json"]
  });
  const { body: d } = await call("GET /api/costs");
  assert.equal(d.higgsfield.credits, 42 + 224 + 10 + 15);
  assert.deepEqual(d.higgsfield.draft, { count: 2, credits: 57 }); // j1 (ledger) + j4 (media only)
  assert.deepEqual(d.higgsfield.final, { count: 1, credits: 224 });
  assert.deepEqual(d.higgsfield.unclassified, { count: 1, credits: 10 });
  assert.equal(d.elevenlabs.chars, 100);
  assert.equal(d.elevenlabs.credits, 40);
  assert.equal(d.free.edits, 2); // -original excluded
  assert.equal(d.free.renders, null); // no render log yet
  assert.equal(d.budget.cap, 500);
  assert.ok(Number.isFinite(d.usd)); // config.json has usd_per_credit
  assert.equal(d.reference, null);
  assert.equal(d.comparison, null);
});

test("empty RUN: zero spend, nothing invented", async () => {
  const { call } = setup();
  const { body: d } = await call("GET /api/costs");
  assert.equal(d.hasLedger, false);
  assert.equal(d.higgsfield.credits, 0);
  assert.equal(d.elevenlabs.chars, null);
  assert.deepEqual(d.items, []);
});

test("cost reference: validated, saved under <RUN>/.studio, comparison only when convertible", async () => {
  const { call, runDir, routes } = setup({ ledger: { jobs: [{ item: "d draft", credits: 100 }] } });
  assert.equal(routes["PUT /api/cost-reference"].mutating, true);
  assert.equal(routes["POST /api/review/loudness"].mutating, true);
  assert.equal(routes["GET /api/costs"].mutating, false);
  assert.equal((await call("PUT /api/cost-reference", { amount: -1, currency: "USD" })).code, 422);
  assert.equal((await call("PUT /api/cost-reference", { amount: 10, currency: "DOLLARS" })).code, 422);
  assert.equal((await call("PUT /api/cost-reference", { amount: 9000, currency: "mxn", note: "editor" })).code, 200);
  assert.ok(existsSync(join(runDir, ".studio", "cost-reference.json")));
  let d = (await call("GET /api/costs")).body;
  assert.equal(d.reference.currency, "MXN");
  assert.equal(d.comparison.ok, false); // no fx configured: never guessed
  assert.equal(d.comparison.reason, "no_fx");
  await call("PUT /api/cost-reference", { amount: 450, currency: "USD", note: "a mano" });
  d = (await call("GET /api/costs")).body;
  assert.equal(d.comparison.ok, true);
  assert.equal(d.comparison.spentUsd, d.usd);
  assert.equal(d.comparison.savedUsd, Math.round((450 - d.usd) * 100) / 100);
  await call("PUT /api/cost-reference", { amount: null });
  assert.equal((await call("GET /api/costs")).body.reference, null);
  assert.equal(JSON.parse(readFileSync(join(runDir, ".studio", "cost-reference.json"), "utf8")).amount, undefined);
});
