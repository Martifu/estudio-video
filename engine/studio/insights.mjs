// Estudio insights: data for the "Revisión" semáforo and the "Costo" panel. Registered by server.mjs (like extras.mjs).
//
// Read-only (GET): /api/review/context, /api/review/loudness, /api/costs.
// Mutating (token + Origin + confined paths, see server.mjs): POST /api/review/loudness (runs ffmpeg locally, caches by mtime),
// PUT /api/cost-reference (writes <RUN>/.studio/cost-reference.json).
// Nothing here calls a paid API. Missing or malformed files (edl.json, logo.json, cta.json, ledger.json, ...) are treated as absent.
//
// On disk:
//   <comp>/.studio/loudness.json     {file, mtimeMs, size, result:{integrated, truePeak, lra, measuredAt}}  ebur128 cache of the last final render
//   <comp>/.studio/renders.jsonl     one line per finished render: {ts, code, ms}  (appended by the server via ctx.onRenderDone)
//   <RUN>/.studio/cost-reference.json {amount, currency, note, updatedAt}  what the same video costs when made by hand
import { spawn } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";

const readJsonFile = (f, dflt = null) => {
  try {
    return existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : dflt;
  } catch {
    return dflt;
  }
};
const readJsonl = (f) => {
  if (!existsSync(f)) return [];
  return readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => {
    try {
      return JSON.parse(l);
    } catch {
      return null;
    }
  }).filter(Boolean);
};
const isNum = (v) => typeof v === "number" && Number.isFinite(v);

export function registerInsights(ctx) {
  const { compDir, runDir, compName, studioDir, historyDir, json, readJson, writeAtomic, insideDir, route } = ctx;
  const config = readJsonFile(join(ctx.here, "config.json"), {});
  const mediaFile = join(studioDir, "media.json");
  const requestsFile = join(studioDir, "requests.jsonl");
  const rendersFile = join(studioDir, "renders.jsonl");
  const loudFile = join(studioDir, "loudness.json");
  const runStudioDir = join(runDir, ".studio");
  const refFile = join(runStudioDir, "cost-reference.json");

  // ---------- render log (free actions count) ----------
  ctx.onRenderDone = (code, job) => {
    try {
      appendFileSync(rendersFile, `${JSON.stringify({ ts: new Date().toISOString(), code, ms: Date.now() - (job?.startedAt ?? Date.now()) })}\n`);
    } catch { /* the log is informational */ }
  };

  // ---------- review context ----------
  /** Files the checks may use, each optional. The client composes them with what it already has in memory. */
  route("GET", "/api/review/context", false, (req, res) => {
    json(res, 200, {
      edl: readJsonFile(join(compDir, "edl.json")),
      logo: readJsonFile(join(compDir, "logo.json")),
      cta: readJsonFile(join(compDir, "cta.json")),
      loudness: loudnessStatus()
    });
  });

  // ---------- loudness (ebur128 on the last final render; computed on demand, cached by mtime) ----------
  /** out/<comp>-final.mp4, else the newest out/*.mp4. */
  function finalRender() {
    const out = join(compDir, "out");
    const pref = join(out, `${compName}-final.mp4`);
    if (existsSync(pref)) return pref;
    if (!existsSync(out)) return null;
    const mp4s = readdirSync(out).filter((n) => n.endsWith(".mp4")).map((n) => join(out, n)).map((f) => ({ f, m: statSync(f).mtimeMs })).sort((a, b) => b.m - a.m);
    return mp4s[0]?.f ?? null;
  }
  let loudJob = null; // {file, startedAt, done, error}
  function loudnessStatus() {
    const file = finalRender();
    if (!file) return { exists: false, running: false, result: null };
    const st = statSync(file);
    const cache = readJsonFile(loudFile);
    const fresh = cache && cache.file === basename(file) && cache.mtimeMs === st.mtimeMs && cache.size === st.size;
    return {
      exists: true, file: basename(file), running: !!loudJob && !loudJob.done, error: loudJob?.done ? loudJob.error ?? null : null,
      result: fresh ? cache.result : null, stale: !!cache && !fresh, renderedAt: st.mtime.toISOString()
    };
  }
  /** Parse the summary block ffmpeg's ebur128 filter prints at the end. */
  function parseEbur128(text) {
    const tail = text.slice(Math.max(0, text.lastIndexOf("Summary:")));
    const pick = (re) => {
      const m = re.exec(tail);
      return m ? Number(m[1]) : null;
    };
    const integrated = pick(/\bI:\s+(-?[\d.]+)\s+LUFS/);
    if (integrated === null) return null;
    return { integrated, lra: pick(/\bLRA:\s+(-?[\d.]+)\s+LU\b/), truePeak: pick(/\bPeak:\s+(-?[\d.]+)\s+dBFS/) };
  }
  route("GET", "/api/review/loudness", false, (req, res) => json(res, 200, loudnessStatus()));
  route("POST", "/api/review/loudness", true, async (req, res) => {
    await ctx.readBody(req, 1024);
    const file = finalRender();
    if (!file) return json(res, 404, { error: "no hay video renderizado todavía" });
    if (!insideDir(file, runDir)) return json(res, 403, { error: "ruta fuera del RUN" });
    if (loudJob && !loudJob.done) return json(res, 202, loudnessStatus());
    const st = statSync(file);
    const job = { file, startedAt: Date.now(), done: false, error: null };
    loudJob = job;
    const child = spawn(process.env.FFMPEG ?? "ffmpeg", ["-hide_banner", "-nostats", "-nostdin", "-i", file, "-vn", "-af", "ebur128=peak=true", "-f", "null", "-"], { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    child.stderr.on("data", (c) => { err += c.toString("utf8"); if (err.length > 400000) err = err.slice(-200000); });
    const timer = setTimeout(() => child.kill("SIGKILL"), 120000);
    child.on("error", (e) => { clearTimeout(timer); job.done = true; job.error = `ffmpeg: ${e.message}`; });
    child.on("close", (code) => {
      clearTimeout(timer);
      job.done = true;
      const result = code === 0 ? parseEbur128(err) : null;
      if (!result) { job.error = job.error ?? "ffmpeg no devolvió una medición"; return; }
      writeAtomic(loudFile, JSON.stringify({ file: basename(file), mtimeMs: st.mtimeMs, size: st.size, result: { ...result, measuredAt: new Date().toISOString() } }, null, 1));
      ctx.broadcast?.("extras", { what: "loudness.json" });
    });
    json(res, 202, loudnessStatus());
  });

  // ---------- costs ----------
  const usdPerCredit = isNum(config.usd_per_credit) && config.usd_per_credit > 0 ? config.usd_per_credit : null;
  const fxTable = config.fx_usd_per_unit && typeof config.fx_usd_per_unit === "object" ? config.fx_usd_per_unit : {}; // optional: {"MXN": 0.05}; never guessed

  const qualityOf = (q) => (q === config.higgsfield?.draft_quality || /480|draft/i.test(String(q ?? "")) ? "draft" : q === config.higgsfield?.final_quality || /1080|final/i.test(String(q ?? "")) ? "final" : null);
  const itemQuality = (text) => (/1080|final/i.test(text) ? "final" : /480|draft|borrador/i.test(text) ? "draft" : null);

  function readRequests() {
    const byId = new Map();
    for (const o of readJsonl(requestsFile)) if (o.id) byId.set(o.id, { ...(byId.get(o.id) ?? {}), ...o });
    return [...byId.values()];
  }

  function costs() {
    const items = []; // {source, label, credits, quality: draft|final|null, service: higgsfield|elevenlabs|other, at, jobId}
    const seen = new Set(); // job ids and media ids already counted (the same spend can appear in the ledger, media.json and requests)
    const mediaAll = readJsonFile(mediaFile, { entries: [] })?.entries ?? [];
    const mediaByJob = new Map(mediaAll.filter((e) => e.job_id).map((e) => [e.job_id, e]));

    const ledger = readJsonFile(join(runDir, "ledger.json"));
    for (const j of ledger?.jobs ?? []) {
      if (!isNum(Number(j.credits))) continue;
      const m = j.job_id ? mediaByJob.get(j.job_id) : null;
      items.push({
        source: "ledger", label: String(j.item ?? j.job_id ?? "job"), credits: Number(j.credits), at: j.at ?? null, jobId: j.job_id ?? null,
        service: /eleven|tts/i.test(j.item ?? "") ? "elevenlabs" : "higgsfield", quality: qualityOf(m?.quality) ?? itemQuality(String(j.item ?? ""))
      });
      if (j.job_id) seen.add(j.job_id);
      if (m) seen.add(m.id);
    }
    for (const e of mediaAll) {
      if (!isNum(Number(e.cost)) || e.cost === null || e.cost === "") continue;
      if ((e.job_id && seen.has(e.job_id)) || seen.has(e.id)) continue;
      items.push({ source: "media", label: e.note || e.id, credits: Number(e.cost), at: e.createdAt ?? null, jobId: e.job_id ?? null, service: e.source === "elevenlabs" ? "elevenlabs" : e.source === "higgsfield" ? "higgsfield" : "other", quality: qualityOf(e.quality) });
      seen.add(e.id);
      if (e.job_id) seen.add(e.job_id);
    }
    const reqs = readRequests();
    let elevenChars = 0;
    let elevenCharsRecorded = false;
    for (const r of reqs) {
      if (r.status !== "done" && r.status !== "failed") continue;
      if (!isNum(Number(r.cost_real)) || r.cost_real === null) continue;
      if (r.costClass === "elevenlabs") {
        const chars = Number(r.estimate?.chars ?? r.params?.text?.length);
        if (Number.isFinite(chars)) { elevenChars += chars; elevenCharsRecorded = true; }
      }
      const dup = (r.result_media_id && seen.has(r.result_media_id)) || (r.job_id && seen.has(r.job_id));
      if (dup) continue;
      items.push({
        source: "request", label: `${r.action ?? "solicitud"}${r.params?.notes ? `: ${String(r.params.notes).slice(0, 40)}` : ""}`, credits: Number(r.cost_real), at: r.updatedAt ?? r.createdAt ?? null, jobId: r.job_id ?? null,
        service: r.costClass === "elevenlabs" ? "elevenlabs" : r.costClass === "higgsfield" ? "higgsfield" : "other",
        quality: r.action === "upgrade_1080p" ? "final" : r.action === "footage_regen" ? "draft" : qualityOf(r.params?.quality)
      });
    }
    const sum = (list) => list.reduce((n, i) => n + i.credits, 0);
    const hf = items.filter((i) => i.service === "higgsfield");
    const group = (q) => { const l = hf.filter((i) => i.quality === q); return { count: l.length, credits: sum(l) }; };
    const eleven = items.filter((i) => i.service === "elevenlabs");
    const higgsfield = { credits: sum(hf), count: hf.length, draft: group("draft"), final: group("final"), unclassified: group(null) };
    const doneReqs = reqs.filter((r) => r.status === "done");
    const history = existsSync(historyDir) ? readdirSync(historyDir).filter((n) => n.endsWith(".json") && !n.endsWith("-original.json")).length : 0;
    const renders = readJsonl(rendersFile);
    const ref = readJsonFile(refFile);
    const reference = ref && isNum(ref.amount) && ref.amount > 0 ? { amount: ref.amount, currency: String(ref.currency ?? "USD"), note: String(ref.note ?? ""), updatedAt: ref.updatedAt ?? null } : null;
    const usd = usdPerCredit !== null ? Math.round(higgsfield.credits * usdPerCredit * 100) / 100 : null;
    let comparison = null;
    if (reference) {
      const rate = reference.currency === "USD" ? 1 : isNum(fxTable[reference.currency]) ? fxTable[reference.currency] : null;
      if (usd !== null && rate !== null) {
        const refUsd = reference.amount * rate;
        comparison = { ok: true, refUsd: Math.round(refUsd * 100) / 100, spentUsd: usd, savedUsd: Math.round((refUsd - usd) * 100) / 100, savedPct: Math.round(((refUsd - usd) / refUsd) * 1000) / 10 };
      } else comparison = { ok: false, reason: usd === null ? "no_usd_per_credit" : "no_fx" };
    }
    const budget = { cap: ledger?.cap ?? null, spent: sum(items.filter((i) => i.source === "ledger" && i.service === "higgsfield")) };
    return {
      comp: compName, run: basename(runDir), hasLedger: !!ledger,
      note: "El ledger es de toda la corrida (RUN), no solo de este corte.",
      higgsfield, usd, usdPerCredit, usdLabel: config.usd_label ?? "estimado, el precio real depende del plan",
      elevenlabs: { credits: sum(eleven), count: eleven.length, chars: elevenCharsRecorded ? elevenChars : null },
      other: { credits: sum(items.filter((i) => i.service === "other")), count: items.filter((i) => i.service === "other").length },
      budget, items: items.slice(-60),
      free: { edits: history, renders: existsSync(rendersFile) ? renders.length : null, rendersOk: renders.filter((r) => r.code === 0).length, freeRequests: doneReqs.filter((r) => r.costClass === "free").length },
      reference, comparison, fxKnown: Object.keys(fxTable)
    };
  }
  route("GET", "/api/costs", false, (req, res) => json(res, 200, costs()));

  route("PUT", "/api/cost-reference", true, async (req, res) => {
    const b = await readJson(req, 4096);
    if (!b || typeof b !== "object") return json(res, 400, { error: "se espera {amount, currency, note}" });
    mkdirSync(runStudioDir, { recursive: true });
    if (!insideDir(refFile, runDir)) return json(res, 403, { error: "ruta fuera del RUN" });
    if (b.amount === null) { // clear
      if (existsSync(refFile)) writeAtomic(refFile, JSON.stringify({}, null, 1));
      return json(res, 200, { reference: null });
    }
    const amount = Number(b.amount);
    const currency = String(b.currency ?? "USD").trim().toUpperCase();
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1e9) return json(res, 422, { error: "el monto debe ser un número mayor que 0" });
    if (!/^[A-Z]{3}$/.test(currency)) return json(res, 422, { error: "moneda inválida (3 letras, ej. USD, MXN)" });
    const note = typeof b.note === "string" ? b.note.trim().slice(0, 200) : "";
    const reference = { amount, currency, note, updatedAt: new Date().toISOString() };
    writeAtomic(refFile, JSON.stringify(reference, null, 1));
    json(res, 200, { reference });
  });
}
