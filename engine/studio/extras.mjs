// Estudio extras: media versions registry, audio settings, cost-classed action requests, budget. Registered by server.mjs.
//
// On disk (all under <comp>/.studio/, written atomically):
//   media.json     {"entries":[{id, slot, path, source, quality, job_id?, cost?, duration?, createdAt, note}]}  (the AI appends results here)
//   state.json     {"active":{slot:id}, "audio":{...}}  selection + audio settings, applied on render and in the preview
//   requests.jsonl append-only log, one JSON object per line; the LAST line per `id` wins (later lines may be partial updates)
//   mix-options.json  derived from state.json at render time (mix.py --options)
// The server never calls a paid API: paid/MCP work is only queued as `approved` requests for the assistant (see README.md).
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, watch } from "node:fs";
import { randomBytes } from "node:crypto";
import { basename, dirname, extname, join, relative, resolve } from "node:path";

const AUDIO_EXT = new Set([".wav", ".mp3", ".m4a", ".flac", ".ogg"]);
const STATUSES = ["pending", "approved", "running", "done", "failed", "cancelled"];
export const slugOf = (p) => basename(p, extname(p)).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "clip";

export const DEFAULT_AUDIO = {
  voiceDb: 0, musicDb: 0, sfxDb: 0, musicOffset: 0, fadeIn: null, fadeOut: null, voiceAtempo: 1,
  sfx: { enabled: true, mute: [], replace: [] }
};
const RANGES = { voiceDb: [-30, 12], musicDb: [-30, 12], sfxDb: [-30, 12], musicOffset: [-30, 60], fadeIn: [0, 10], fadeOut: [0, 10], voiceAtempo: [0.9, 1.2] };

export function registerExtras(ctx) {
  const { SKILL, compDir, runDir, studioDir, json, readJson, writeAtomic, insideDir, route, broadcast } = ctx;
  const mediaFile = join(studioDir, "media.json");
  const stateFile = join(studioDir, "state.json");
  const requestsFile = join(studioDir, "requests.jsonl");
  const mixOptionsFile = join(studioDir, "mix-options.json");
  const config = JSON.parse(readFileSync(join(ctx.here, "config.json"), "utf8"));
  const readJsonFile = (f, dflt) => {
    try {
      return existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : dflt;
    } catch {
      return dflt;
    }
  };
  const abs = (p) => resolve(runDir, p);
  const allowedPath = (p) => insideDir(abs(p), runDir) || insideDir(abs(p), SKILL);
  const mtimeIso = (f) => statSync(f).mtime.toISOString();

  // ---------- media registry ----------
  function buildClips() {
    const b = readJsonFile(join(studioDir, "build.json"), null);
    const i = b?.argv?.indexOf("--clips") ?? -1;
    return i >= 0 ? b.argv[i + 1].split(",").filter(Boolean) : [];
  }
  function buildMusic() {
    const b = readJsonFile(join(studioDir, "build.json"), null);
    const i = b?.argv?.indexOf("--music") ?? -1;
    return i >= 0 ? b.argv[i + 1] : null;
  }
  function listDir(dir, filter) {
    return existsSync(dir) ? readdirSync(dir).filter(filter).sort().map((n) => join(dir, n)) : [];
  }
  /** Registered entries (media.json) + discovered local files (RUN/music, RUN/voice, the comp's own voice/clips, skill SFX). */
  function mediaEntries() {
    const reg = readJsonFile(mediaFile, { entries: [] }).entries ?? [];
    const out = reg.map((e) => ({ source: "local", quality: null, ...e, invalid: !e.path || !allowedPath(e.path) }));
    const known = new Set(out.map((e) => e.path && abs(e.path)));
    const add = (e) => {
      if (known.has(e.path)) return;
      known.add(e.path);
      out.push({ source: "local", quality: null, note: "", ...e, createdAt: mtimeIso(e.path), invalid: false });
    };
    for (const f of listDir(join(runDir, "music"), (n) => AUDIO_EXT.has(extname(n)))) add({ id: `music:${basename(f)}`, slot: "music", path: f, note: f === abs(buildMusic() ?? "") ? "la del render actual" : "" });
    for (const f of listDir(join(runDir, "voice"), (n) => AUDIO_EXT.has(extname(n)))) add({ id: `voice:${basename(f)}`, slot: "voice", path: f });
    const own = join(compDir, "audio", "clips.wav");
    if (existsSync(own)) add({ id: "voice:original", slot: "voice", path: own, note: "voz original del corte" });
    for (const c of buildClips()) {
      const p = abs(c);
      if (existsSync(p)) add({ id: `footage:${slugOf(p)}:original`, slot: `footage:${slugOf(p)}`, path: p, note: "toma original" });
    }
    for (const f of listDir(join(SKILL, "assets", "sfx", "ui"), (n) => extname(n) === ".wav")) add({ id: `sfx:${basename(f)}`, slot: "sfx", path: f });
    return out;
  }
  ctx.mediaEntries = mediaEntries; // media.mjs: unified media list
  const defaultActive = (entries) => {
    const act = {};
    const bm = buildMusic();
    const m = entries.find((e) => e.slot === "music" && bm && abs(e.path) === abs(bm));
    if (m) act.music = m.id;
    if (entries.some((e) => e.id === "voice:original")) act.voice = "voice:original";
    for (const e of entries) if (e.slot.startsWith("footage:") && e.id.endsWith(":original")) act[e.slot] = e.id;
    return act;
  };
  function readState() {
    const st = readJsonFile(stateFile, {});
    return { active: st.active ?? {}, audio: { ...DEFAULT_AUDIO, ...(st.audio ?? {}), sfx: { ...DEFAULT_AUDIO.sfx, ...(st.audio?.sfx ?? {}) } } };
  }

  // ---------- requests (append-only, last line per id wins) ----------
  function readRequests() {
    if (!existsSync(requestsFile)) return [];
    const byId = new Map();
    for (const line of readFileSync(requestsFile, "utf8").split("\n")) {
      if (!line.trim()) continue;
      let o;
      try {
        o = JSON.parse(line);
      } catch {
        continue;
      }
      if (!o.id) continue;
      byId.set(o.id, { ...(byId.get(o.id) ?? {}), ...o });
    }
    return [...byId.values()];
  }
  const tier = (d) => String(config.higgsfield.tiers.find((t) => d <= t) ?? config.higgsfield.tiers.at(-1));
  const hfCredits = (quality, dur) => config.higgsfield.credits[quality][tier(Number(dur) || 5)];

  /** Server-side action table: validates params and computes cost class + estimate (never trust the client's numbers). */
  const ACTIONS = {
    music_new: {
      costClass: "free",
      check: (p) => (typeof p.prompt === "string" && p.prompt.trim() ? null : "falta el prompt"),
      estimate: () => ({ unit: "credits", amount: 0, note: config.audio_studio.label })
    },
    sfx_new: {
      costClass: "free",
      check: (p) => (typeof p.prompt === "string" && p.prompt.trim() ? null : "falta el prompt"),
      estimate: () => ({ unit: "credits", amount: 0, note: config.audio_studio.label })
    },
    voice_retake: {
      costClass: "elevenlabs",
      check: (p) => (typeof p.text === "string" && p.text.trim() && Number.isFinite(Number(p.from)) && Number.isFinite(Number(p.to)) ? null : "faltan texto o rango"),
      estimate: (p) => ({ unit: "credits", chars: p.text.length, amount: Math.round(p.text.length * config.elevenlabs.credits_per_char * 10) / 10, note: config.elevenlabs.label, remaining: config.elevenlabs.remaining })
    },
    voice_full: {
      costClass: "elevenlabs",
      check: (p) => (typeof p.text === "string" && p.text.trim() ? null : "falta el texto"),
      estimate: (p) => ({ unit: "credits", chars: p.text.length, amount: Math.round(p.text.length * config.elevenlabs.credits_per_char * 10) / 10, note: config.elevenlabs.label, remaining: config.elevenlabs.remaining })
    },
    footage_regen: {
      costClass: "higgsfield",
      check: (p) => (Number(p.duration_s) > 0 && typeof p.notes === "string" ? null : "faltan duración o notas"),
      normalize: (p) => ({ ...p, quality: config.higgsfield.draft_quality }), // always a 480p draft first
      estimate: (p) => ({ unit: "credits", amount: hfCredits("draft480", p.duration_s), quality: "draft480", note: `${config.higgsfield.model} borrador 480p, ${tier(Number(p.duration_s))} s; ${config.higgsfield.label}` })
    },
    upgrade_1080p: {
      costClass: "higgsfield",
      check: () => null, // validated against media entries below
      estimate: (p) => ({ unit: "credits", amount: p.items.reduce((n, i) => n + i.credits, 0), quality: "final1080", note: `${config.higgsfield.model} 1080p; ${config.higgsfield.label}` })
    }
  };

  /** Higgsfield drafts used by the active versions, with 1080p cost and expiry. */
  function draftsInUse() {
    const entries = mediaEntries();
    const { active } = readState();
    const ids = new Set(Object.values(active));
    return entries
      .filter((e) => ids.has(e.id) && e.source === "higgsfield" && e.quality === config.higgsfield.draft_quality)
      .map((e) => {
        const created = Date.parse(e.createdAt);
        const daysLeft = Number.isFinite(created) ? Math.ceil(config.higgsfield.draft_expires_days - (Date.now() - created) / 86400000) : null;
        return { id: e.id, slot: e.slot, job_id: e.job_id ?? null, createdAt: e.createdAt, daysLeft, duration: e.duration ?? 5, credits: hfCredits("final1080", e.duration ?? 5), note: e.note ?? "" };
      });
  }

  function budget() {
    const ledger = readJsonFile(join(runDir, "ledger.json"), null);
    const spent = (ledger?.jobs ?? []).reduce((n, j) => n + (Number(j.credits) || 0), 0);
    const committed = readRequests()
      .filter((r) => r.costClass === "higgsfield" && ["pending", "approved", "running"].includes(r.status))
      .reduce((n, r) => n + (r.estimate?.amount ?? 0), 0);
    return { available: !!ledger, spent, cap: ledger?.cap ?? null, committed };
  }

  /** SFX kit as the browser can play it: the sfx-map mix.py uses (build --sfx-map, else the default UI map when the comp has motion). */
  function sfxKit() {
    const b = readJsonFile(join(studioDir, "build.json"), null);
    const argv = b?.argv ?? [];
    const i = argv.indexOf("--sfx-map");
    const mapPath = i >= 0 ? argv[i + 1] : argv.includes("--motion") ? join(SKILL, "assets", "sfx", "ui-map.json") : null;
    if (!mapPath || !existsSync(mapPath) || !allowedPath(mapPath)) return { kinds: {}, panWidth: 0.5 };
    const map = readJsonFile(mapPath, {});
    const urlOf = (f) => {
      const p = resolve(dirname(mapPath), f);
      if (!existsSync(p) || !allowedPath(p)) return null;
      const rs = relative(runDir, p);
      if (!rs.startsWith("..")) return "/" + rs.split("/").map(encodeURIComponent).join("/");
      const sk = relative(join(SKILL, "assets"), p);
      return sk.startsWith("..") ? null : "/_skill/assets/" + sk.split("/").map(encodeURIComponent).join("/");
    };
    const kinds = {};
    for (const [k, spec] of Object.entries(map.kinds ?? {})) {
      const f = spec.file ?? spec.files?.[0];
      const url = f ? urlOf(f) : null;
      if (url) kinds[k] = { url, gain_db: spec.gain_db ?? -22, anchor: spec.anchor ?? null };
    }
    return { kinds, panWidth: 0.5, duck_db: 11 };
  }
  const skillUrl = (p) => {
    const sk = relative(join(SKILL, "assets"), abs(p));
    return sk.startsWith("..") ? null : "/_skill/assets/" + sk.split("/").map(encodeURIComponent).join("/");
  };

  // ---------- routes ----------
  route("GET", "/api/extras", false, (req, res) => {
    const entries = mediaEntries().map((e) => {
      const rel = e.path ? relative(runDir, abs(e.path)) : "..";
      return { ...e, url: e.invalid ? null : rel.startsWith("..") ? skillUrl(e.path) : "/" + rel.split("/").map(encodeURIComponent).join("/") };
    });
    const st = readState();
    json(res, 200, {
      config, entries, sfxKit: sfxKit(), active: { ...defaultActive(entries), ...st.active }, audio: st.audio,
      requests: readRequests(), budget: budget(), drafts: draftsInUse(), actions: Object.fromEntries(Object.entries(ACTIONS).map(([k, v]) => [k, v.costClass]))
    });
  });
  route("PUT", "/api/extras/state", true, async (req, res) => {
    const b = await readJson(req, 64 * 1024);
    const entries = mediaEntries();
    const cur = readState();
    const next = { active: { ...cur.active }, audio: { ...cur.audio, sfx: { ...cur.audio.sfx } } };
    if (b.active) {
      for (const [slot, id] of Object.entries(b.active)) {
        const e = entries.find((x) => x.id === id);
        if (!e || e.slot !== slot || e.invalid) return json(res, 422, { error: `versión inválida para ${slot}` });
        next.active[slot] = id;
      }
    }
    if (b.audio) {
      for (const [k, [lo, hi]] of Object.entries(RANGES)) {
        if (b.audio[k] === undefined) continue;
        if (b.audio[k] === null && (k === "fadeIn" || k === "fadeOut")) { next.audio[k] = null; continue; }
        const v = Number(b.audio[k]);
        if (!Number.isFinite(v) || v < lo || v > hi) return json(res, 422, { error: `${k} fuera de rango (${lo}..${hi})` });
        next.audio[k] = v;
      }
      if (b.audio.sfx) {
        const s = b.audio.sfx;
        if (s.enabled !== undefined) next.audio.sfx.enabled = !!s.enabled;
        const ev = (a) => (Array.isArray(a) ? a.filter((x) => Number.isFinite(Number(x.t)) && typeof x.type === "string").slice(0, 200) : null);
        if (s.mute) next.audio.sfx.mute = ev(s.mute).map((x) => ({ t: Number(x.t), type: x.type }));
        if (s.replace) {
          const rep = ev(s.replace).map((x) => ({ t: Number(x.t), type: x.type, entry: String(x.entry) }));
          for (const r of rep) {
            const e = entries.find((x) => x.id === r.entry && x.slot === "sfx");
            if (!e || e.invalid) return json(res, 422, { error: `SFX inválido: ${r.entry}` });
          }
          next.audio.sfx.replace = rep;
        }
      }
    }
    writeAtomic(stateFile, JSON.stringify(next, null, 1));
    json(res, 200, { active: { ...defaultActive(entries), ...next.active }, audio: next.audio });
  });

  // Non-mutating helper so the cost shown in the modal comes from the same table the server records.
  route("POST", "/api/estimate", false, async (req, res) => {
    const b = await readJson(req, 64 * 1024);
    const def = ACTIONS[b?.action];
    if (!def || b.action === "upgrade_1080p") return json(res, 400, { error: "acción desconocida" });
    let params = b.params && typeof b.params === "object" ? b.params : {};
    const err = def.check(params);
    if (err) return json(res, 200, { costClass: def.costClass, error: err });
    if (def.normalize) params = def.normalize(params);
    json(res, 200, { costClass: def.costClass, estimate: def.estimate(params) });
  });
  route("POST", "/api/request", true, async (req, res) => {
    const b = await readJson(req, 64 * 1024);
    const def = ACTIONS[b?.action];
    if (!def) return json(res, 400, { error: "acción desconocida" });
    if (b.confirmed !== true) return json(res, 400, { error: "falta la confirmación del usuario" });
    let params = b.params && typeof b.params === "object" ? b.params : {};
    if (b.action === "upgrade_1080p") {
      const drafts = draftsInUse().filter((d) => !Array.isArray(params.media_ids) || params.media_ids.includes(d.id));
      if (!drafts.length) return json(res, 422, { error: "no hay borradores de Higgsfield en uso" });
      params = { media_ids: drafts.map((d) => d.id), job_ids: drafts.map((d) => d.job_id), items: drafts.map((d) => ({ media_id: d.id, job_id: d.job_id, credits: d.credits, daysLeft: d.daysLeft })) };
    }
    const err = def.check(params);
    if (err) return json(res, 422, { error: err });
    if (def.normalize) params = def.normalize(params);
    const now = new Date().toISOString();
    const reqObj = {
      id: `rq-${randomBytes(4).toString("hex")}`, action: b.action, params, costClass: def.costClass, estimate: def.estimate(params),
      status: "approved", result_media_id: null, createdAt: now, updatedAt: now, approvedAt: now, motionVersion: ctx.motionVersion()
    };
    appendFileSync(requestsFile, `${JSON.stringify(reqObj)}\n`);
    json(res, 200, { request: reqObj });
  });
  route("POST", "/api/request/status", true, async (req, res) => {
    const b = await readJson(req, 4096);
    const cur = readRequests().find((r) => r.id === b?.id);
    if (!cur) return json(res, 404, { error: "not found" });
    // The browser may only approve a pending request or cancel one that has not started; everything else belongs to the assistant.
    const ok = (b.status === "approved" && cur.status === "pending") || (b.status === "cancelled" && ["pending", "approved"].includes(cur.status));
    if (!ok) return json(res, 409, { error: `no se puede pasar de ${cur.status} a ${b.status}` });
    appendFileSync(requestsFile, `${JSON.stringify({ id: cur.id, status: b.status, updatedAt: new Date().toISOString() })}\n`);
    json(res, 200, { ok: true });
  });

  // ---------- render: apply the active versions + audio settings on top of build.json ----------
  ctx.composeArgv = (argv) => {
    const entries = mediaEntries();
    const st = readState();
    const active = { ...defaultActive(entries), ...st.active };
    const out = [...argv];
    const setOpt = (name, value) => {
      const i = out.indexOf(name);
      if (i >= 0) out[i + 1] = value;
      else out.push(name, value);
    };
    const pick = (slot) => entries.find((e) => e.id === active[slot] && !e.invalid);
    const music = pick("music");
    if (music) setOpt("--music", abs(music.path));
    const voice = pick("voice");
    if (voice && voice.id !== "voice:original") setOpt("--voice-wav", abs(voice.path));
    const ci = out.indexOf("--clips");
    if (ci >= 0) {
      out[ci + 1] = out[ci + 1].split(",").map((c) => {
        const e = pick(`footage:${slugOf(c)}`);
        return e ? abs(e.path) : c;
      }).join(",");
    }
    const a = st.audio;
    const d = DEFAULT_AUDIO;
    const sfxCustom = !a.sfx.enabled || a.sfx.mute.length || a.sfx.replace.length;
    const custom = a.voiceDb !== d.voiceDb || a.musicDb !== d.musicDb || a.sfxDb !== d.sfxDb || a.musicOffset !== d.musicOffset || a.fadeIn !== null || a.fadeOut !== null || a.voiceAtempo !== 1 || sfxCustom;
    if (custom) {
      const opts = { music_db: a.musicDb, voice_db: a.voiceDb, sfx_db: a.sfxDb, voice_atempo: a.voiceAtempo };
      if (a.musicOffset !== 0) opts.music_offset = a.musicOffset;
      if (a.fadeIn !== null) opts.fade_in = a.fadeIn;
      if (a.fadeOut !== null) opts.fade_out = a.fadeOut;
      opts.sfx = {
        enabled: a.sfx.enabled, mute: a.sfx.mute,
        replace: a.sfx.replace.map((r) => ({ t: r.t, type: r.type, file: abs(entries.find((e) => e.id === r.entry).path) }))
      };
      writeAtomic(mixOptionsFile, JSON.stringify(opts, null, 1));
      setOpt("--mix-options", mixOptionsFile);
    }
    return out;
  };

  // ---------- watch ----------
  mkdirSync(studioDir, { recursive: true });
  let timer = null;
  watch(studioDir, (_e, name) => {
    if (!["media.json", "state.json", "requests.jsonl"].includes(name)) return;
    clearTimeout(timer);
    timer = setTimeout(() => broadcast("extras", { what: name }), 120);
  });
  void STATUSES;
}
