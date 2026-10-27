#!/usr/bin/env python3
"""Mixes music + earshot SFX (+ optional voice) for a composition and masters it.

  python3 scripts/mix.py <comp-dir> --music PATH [--music-offset S|auto] [--drop-at 10]
                                      [--voice PATH] [--sfx-map JSON]

Reads <comp-dir>/out/events.json (node engine/render.mjs <run>/<comp>/index.html events), renders one SFX per event
(cached in $ESTUDIO_SFX_DIR, default ~/.cache/estudio-video/sfx), ducks the music under the voice, fades the music in/out, masters to
-14 LUFS integrated / -1 dBTP and writes <comp-dir>/out/mix.wav (48 kHz stereo, 24-bit).

--music-offset S   seconds skipped at the head of the music (S<0 delays the music by |S|). "auto" detects the
                   moment the music's activity drops and places it at --drop-at seconds of the video.
Optional structure flags (all off by default; V1-V3 behave exactly as before without them):
--duck-db DB       music attenuation under speech (default 11; V4 uses 9)
--align-downbeat T beat-tracks the music (kick-weighted onset envelope, bar phase = strongest of 4) and picks the
                   offset so the nearest strong downbeat at/after T lands exactly on video time T (overrides
                   --music-offset; the kick onset is refined to ~1 ms)
--music-break S:E  from S to E the music turns into a tape-stop (playback slows, low-pass closes, fades to silence);
                   it stays silent until --music-drop (required with --music-break)
--music-drop T     hard re-entry of the music at T (10 ms ramp, no fade). The duck is held off for --drop-hold s
                   (default 0.25) after T so the first kick lands at full level before ducking under the voice
--end T            ends the music: T is snapped to the nearest detected downbeat (when --align-downbeat is used),
                   the music plays on for --end-hold s (default 0.3, lets the last kick ring), then is cut with a
                   30 ms fade plus a short synthetic reverb tail (--end-tail s, default 0.6). Replaces the 2 s
                   fade-out / looping extension.
--pan-width W      equal-power stereo pan of every SFX by its event's `x` in [-1, 1] (screen position, -1 = left edge):
                   pan position = clip(x * W, -1, 1); W=0 (default) is off and leaves V1-V4 bit-identical. Level at
                   centre is unchanged (a dual-mono SFX stays as loud when x=0); voice and music are never panned.
                   An SFX spec can opt out with "pan": false (e.g. the drop hit, which stays centred).
--options FILE     JSON written by the Estudio editor (engine/studio); every key optional, absent file = unchanged behaviour:
                   {"music_db": dB added to the music gain, "voice_db": dB, "sfx_db": dB (SFX bus), "music_offset": S (replaces --music-offset),
                    "fade_in": S, "fade_out": S (music), "voice_atempo": 0.9..1.2 (voice speed; shifts word timings against the video!),
                    "sfx": {"enabled": false mutes every SFX, "mute": [{"t": S, "type": "pop"}], "replace": [{"t": S, "type": "pop", "file": "/abs.wav"}]}}
                   (an SFX event matches a mute/replace entry when its type is equal and |t - entry.t| < 0.03 s)
--no-music         no music bed (instead of --music): voice + SFX only, mastered like the music path (-14 LUFS / -1 dBTP); the music
                   flags (--music-offset, --align-downbeat, --end, ...) and the ducking do nothing.
--sfx-doc FILE     <comp>/sfx.json written by the Estudio (engine/sfx-doc.js; this file mirrors its merge): per-event overrides by event
                   `key` ({"t": move, "muted": drop, "src": play another sound, "gainDb": trim}) and `added` sounds ({id,t,src,gainDb?}).
                   src = "lib:<id>" (assets/sfx/lib/index.json) | "kit:<pop|whoosh|notify|click>" (assets/sfx/ui) | "path:<file inside the RUN>"
                   (the RUN = the parent of the comp dir; anything escaping it is refused). gainDb is a trim relative to the sound's default
                   level (lib index gain_db, kit ui-map gain, path -14). Absent flag = unchanged behaviour.
--events PATH      events.json to read (default <comp-dir>/out/events.json)
--out-dir DIR      where mix.wav / mix-report.json are written (default <comp-dir>/out)
SFX map entries may use "layers": [{...spec...}, ...] to stack several sounds on one event kind.
SFX map entries may reference rendered WAVs instead of a bank id (paths relative to the sfx-map's folder):
  {"file": "../_audio/sfx/v5/alarm.wav"}                          one WAV
  {"files": ["a.wav", "b.wav"]}                                   takes cycled event by event
  {"kit": "../_audio/sfx/v5/kit.lock.json", "role": "slam"}       the takes of an `earshot kit render` role, cycled;
                                                                  each take is placed by the role's `align` (onset /
                                                                  peak / end) using the lock's measured times
Placement for those entries: "anchor": S | "onset" | "peak" | "end" = the moment inside the WAV that lands on the
event time ("end" = the WAV's last sample, so a riser ENDS on its event); "end_at": T (absolute video seconds)
overrides the event time (e.g. a riser that must end exactly on the drop at 16.21 whatever the event says);
"delay": S shifts after that. "gain_db" is relative to the WAV's own peak (default: the kit role's level_db).
Needs numpy/scipy/librosa/soundfile: the script re-executes itself with the skill venv (earshot venv as legacy fallback) when they are missing.
"""
import argparse, copy, hashlib, json, os, re, subprocess, sys, tempfile
from pathlib import Path

EARSHOT_HOME = Path(os.environ.get("EARSHOT_HOME", "~/tools/earshot")).expanduser()
sys.path.insert(0, str(Path(__file__).resolve().parent))
import paths  # noqa: E402
LEGACY_PY = paths.venv_bin(EARSHOT_HOME / ".venv", "python")  # legacy fallback; the skill venv (setup_python.py) goes first
VENV_PYS = [paths.venv_python(), LEGACY_PY]
EARSHOT = paths.venv_bin(EARSHOT_HOME / ".venv", "earshot")  # Scripts\earshot.exe on Windows
try:
    import numpy as np, soundfile as sf, librosa  # noqa: E401
    from scipy.signal import resample_poly, sosfilt, butter, fftconvolve
except ImportError:
    for cand in VENV_PYS:
        if cand.exists() and Path(sys.executable).resolve() != cand.resolve():
            paths.reexec(cand, sys.argv)
    raise

SR = 48000
SKILL_DIR = Path(__file__).resolve().parent.parent
SFX_DIR = Path(os.environ.get("ESTUDIO_SFX_DIR", "~/.cache/estudio-video/sfx")).expanduser()

# Default per-kind SFX (soft, organic). gain_db is relative to the sound's -1 dBFS peak.
# apex_at: seconds after the event at which a whoosh should peak. seeds: takes cycled for variation.
DEFAULT_MAP = {
    "skip_label_regex": "line",  # text line reveals are silent
    "sfx_bus_db": 0.0,
    "kinds": {
        "click": {"sound": "pro_click/soft", "gain_db": -22, "seeds": 6, "jitter_db": 1.5},
        "tick": {"sound": "pro_hover_tick/soft", "gain_db": -26, "seeds": 6, "jitter_db": 1.5},
        "whoosh": {"sound": "swipe/velvet", "gain_db": -20, "apex": 0.5, "apex_at": 0.35},
        "resolve": {"sound": "fit/bell/small_bell", "gain_db": -24},
        "draw": {"sound": "logo_sting/soft_bloom", "gain_db": -22},
        "hit": None,
    },
    "labels": [],  # [{"match": "regex", "kind": "click" | null, "sound": ..., "gain_db": ...}], first match wins; "silent": true mutes
    "music": {"gain_db": 0.0, "fade_in": 0.5, "fade_out": 2.0, "extend": "auto"},
    "duck": {"db": 11.0, "attack": 0.12, "release": 0.6},
    "voice_gain_db": 0.0,
    "master": {"lufs": -14.0, "tp": -1.0},
}


def merge(a, b):
    out = copy.deepcopy(a)
    for k, v in b.items():
        out[k] = merge(out[k], v) if isinstance(v, dict) and isinstance(out.get(k), dict) else v
    return out


def run(cmd, **kw):
    return subprocess.run(cmd, check=True, capture_output=True, text=True, **kw)


def load(path, sr=SR):
    y, fs = sf.read(str(path), always_2d=True, dtype="float32")
    y = y.T
    if y.shape[0] == 1:
        y = np.vstack([y, y])
    y = y[:2]
    if fs != sr:
        g = np.gcd(fs, sr)
        y = resample_poly(y, sr // g, fs // g, axis=1).astype("float32")
    return y


def db(x):
    return 10 ** (x / 20)


# ---------- music analysis ----------
def music_drop(path):
    """Time (s) at which the music's activity (onset-strength envelope, 2 s smoothing) falls to the midpoint
    between its busy plateau and its calm section. Returns (time, curve_times, curve)."""
    y, sr = librosa.load(str(path), sr=22050, mono=True)
    hop = 256
    env = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop)
    fps = sr / hop
    k = int(2 * fps)
    sm = np.convolve(env, np.ones(k) / k, mode="same")
    t = np.arange(len(sm)) / fps
    busy = sm[(t > 2) & (t < 9)].max()
    # calm level: median of the smoothed envelope in the 12-18 s window
    calm = np.median(sm[(t > 12) & (t < 18)])
    mid = (busy + calm) / 2
    peak_i = np.argmax(np.where((t > 2) & (t < 10), sm, -1))
    after = np.where((t > t[peak_i]) & (sm < mid))[0]
    drop = float(t[after[0]]) if len(after) else float("nan")
    return drop, t, sm


def effective_end(y, sr=SR, rel_db=-30.0):
    """Last time (s) at which the music's 0.5 s RMS is within rel_db of its loudest 0.5 s."""
    mono = y.mean(axis=0)
    n = int(0.5 * sr)
    frames = mono[: len(mono) // n * n].reshape(-1, n)
    rms = np.sqrt((frames**2).mean(axis=1) + 1e-12)
    ok = np.where(20 * np.log10(rms / rms.max()) > rel_db)[0]
    return (ok[-1] + 1) * 0.5


# ---------- music structure (optional) ----------
def detect_downbeats(path):
    """Beat-tracks the music; returns (downbeat times in s refined to the kick onset, beat period, bpm)."""
    y, sr = librosa.load(str(path), sr=22050, mono=True)
    hop = 64
    low = sosfilt(butter(4, 160, "lp", fs=sr, output="sos"), y)
    env_low = librosa.onset.onset_strength(y=low, sr=sr, hop_length=hop)
    env_all = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop)
    env = env_low / (env_low.max() + 1e-9) + 0.5 * env_all / (env_all.max() + 1e-9)
    tempo, beats = librosa.beat.beat_track(onset_envelope=env, sr=sr, hop_length=hop, start_bpm=120, tightness=200, trim=False)
    tempo = float(np.atleast_1d(tempo)[0])
    bt = librosa.frames_to_time(beats, sr=sr, hop_length=hop)
    period = float(np.median(np.diff(bt)))
    # snap every beat to the local maximum of the low-band envelope (+-45 ms)
    w = int(0.045 * sr / hop)
    snapped = []
    for f in beats:
        lo, hi = max(f - w, 0), min(f + w + 1, len(env))
        snapped.append(lo + int(np.argmax(env[lo:hi])))
    bt = librosa.frames_to_time(np.array(snapped), sr=sr, hop_length=hop)
    strength = env[np.array(snapped)]
    phase = int(np.argmax([strength[k::4].sum() for k in range(4)]))
    down = bt[phase::4]
    # refine to the kick onset at full rate: first 1 ms-smoothed low-band energy crossing 25% of its local peak
    y48, _ = librosa.load(str(path), sr=SR, mono=True)
    low48 = sosfilt(butter(4, 200, "lp", fs=SR, output="sos"), y48)
    e = np.convolve(low48**2, np.ones(48) / 48, mode="same")
    out = []
    for d in down:
        c = int(d * SR)
        a, b = max(c - int(0.05 * SR), 0), min(c + int(0.06 * SR), len(e))
        pk = a + int(np.argmax(e[a:b]))
        thr = 0.25 * e[pk]
        k = pk
        while k > a and e[k] > thr:
            k -= 1
        out.append(k / SR)
    return np.array(out), period, tempo


def tape_stop(mus, i0, i1, rate_end=0.2):
    """In-place: from sample i0 to i1 the music is replayed at a falling speed through a closing low-pass and faded out."""
    L = i1 - i0
    s = np.arange(L) / L
    rate = 1.0 - (1.0 - rate_end) * s**1.5
    pos = i0 + np.cumsum(rate)
    src = np.arange(mus.shape[1])
    seg = np.stack([np.interp(pos, src, mus[c]) for c in range(2)]).astype("float32")
    blk = 256
    zi = None
    for b0 in range(0, L, blk):
        b1 = min(b0 + blk, L)
        fc = 16000 * (180 / 16000) ** (b0 / L)
        sos = np.vstack([butter(2, fc, "lp", fs=SR, output="sos")] * 2)
        if zi is None:
            zi = np.zeros((sos.shape[0], 2, 2))
        seg[:, b0:b1], zi = sosfilt(sos, seg[:, b0:b1], axis=1, zi=zi)
    seg *= ((1 - s) ** 1.5).astype("float32")
    mus[:, i0:i1] = seg
    return mus


def reverb_tail(x, length):
    """Short synthetic reverb: x (2, k) convolved with decaying noise; returns (2, length) tail."""
    rng = np.random.default_rng(7)
    m = int(0.7 * SR)
    ir = rng.standard_normal((2, m)).astype("float32") * np.exp(-np.arange(m) / (0.18 * SR)).astype("float32")
    ir = sosfilt(butter(2, 5000, "lp", fs=SR, output="sos"), ir, axis=1)
    wet = np.stack([fftconvolve(x[c], ir[c]) for c in range(2)])
    wet = wet[:, x.shape[1] : x.shape[1] + length] / (np.abs(wet).max() + 1e-9) * np.abs(x).max() * 0.5
    if wet.shape[1] < length:
        wet = np.pad(wet, ((0, 0), (0, length - wet.shape[1])))
    return wet.astype("float32")


# ---------- SFX ----------
def render_sfx(sound, dur=None, apex=None, pitch=None, seed=None):
    SFX_DIR.mkdir(parents=True, exist_ok=True)
    key = f"{sound.replace('/', '_')}_d{dur}_a{apex}_p{pitch}_s{seed}"
    out = SFX_DIR / (key + ".wav")
    if not out.exists():
        cmd = [str(EARSHOT), "sfx", "render", sound, "-o", str(out), "--sr", "48000"]
        for flag, val in (("--dur", dur), ("--apex", apex), ("--pitch", pitch), ("--seed", seed)):
            if val is not None:
                cmd += [flag, str(val)]
        run(cmd)
    return load(out)


def pan_gains(x, width):
    """Equal-power pan gains (L, R) for screen position x in [-1, 1]; centre = 1.0 on both (dual-mono unchanged)."""
    p = float(np.clip(x * width, -1.0, 1.0))
    th = (p + 1.0) * np.pi / 4.0
    return np.sqrt(2.0) * np.cos(th), np.sqrt(2.0) * np.sin(th)


def resolve_file_take(spec, idx, base):
    """For specs that name rendered WAVs ("file" / "files" / "kit"+"role"): returns (key, path, anchor_s, default_gain)."""
    base = Path(base)
    anchor, gain = spec.get("anchor"), None
    if spec.get("kit"):
        lock_path = (base / spec["kit"]).resolve()
        role = json.loads(lock_path.read_text())["roles"][spec["role"]]
        take = role["takes"][idx % len(role["takes"])]
        path = lock_path.parent / take["file"]
        align = spec.get("align", role.get("align", "onset"))
        if anchor is None:
            anchor = take.get({"onset": "onset_s", "peak": "peak_s", "end": "end_s"}[align], 0.0)
        gain = role.get("level_db")
        key = f"{lock_path}:{spec['role']}"
    else:
        files = spec["files"] if spec.get("files") else [spec["file"]]
        path = (base / files[idx % len(files)]).resolve()
        key = "|".join(files)
    return key, path, anchor, gain


KIT_SOUNDS = ("pop", "whoosh", "notify", "click")
PATH_DEFAULT_GAIN_DB = -14.0  # level of a replaced / uploaded sound (same as the Estudio's "replace")


def resolve_sfx_src(src, run):
    """sfx-doc src -> {"file": abs path, "gain_db": default level, "anchor": ...} or None (unknown / refused). lib: and kit: are plain
    WAVs shipped with the skill (no earshot needed); path: must stay inside the RUN."""
    if not isinstance(src, str) or ":" not in src:
        return None
    form, _, rest = src.partition(":")
    if form == "lib":
        if not re.fullmatch(r"[A-Za-z0-9_-]+", rest):
            return None
        idx = SKILL_DIR / "assets" / "sfx" / "lib" / "index.json"
        if not idx.exists():
            return None
        snd = next((x for x in json.loads(idx.read_text()).get("sounds", []) if x.get("id") == rest), None)
        if not snd:
            return None
        spec = {"file": str(idx.parent / snd["file"]), "gain_db": float(snd.get("gain_db", -17))}
        if snd.get("anchor") is not None:
            spec["anchor"] = snd["anchor"]
        return spec
    if form == "kit":
        if rest not in KIT_SOUNDS:
            return None
        kinds = json.loads((SKILL_DIR / "assets" / "sfx" / "ui-map.json").read_text())["kinds"]
        k = kinds[rest]
        return {"file": str(SKILL_DIR / "assets" / "sfx" / k["file"]), "gain_db": float(k["gain_db"]), "anchor": k.get("anchor", "onset")}
    if form == "path":
        if not rest or "\0" in rest or "://" in rest or rest.startswith("/") or any(p in ("", ".", "..") or p.startswith(".") for p in rest.split("/")):
            return None
        run = Path(run).resolve()
        f = (run / rest).resolve()
        if f != run and run not in f.parents:
            return None
        return {"file": str(f), "gain_db": PATH_DEFAULT_GAIN_DB}
    return None


def ev_key(ev):
    return ev["key"] if isinstance(ev.get("key"), str) and ev["key"] else f"{ev.get('type') or ev.get('kind')}@{float(ev['t']):.2f}"


def apply_sfx_doc(events, doc, run):
    """Python mirror of engine/sfx-doc.js mergeSfx(): events (already filtered by --options) -> events to play. Muted ones are dropped,
    `t` moves, `src` plays another file (`_spec`), `gainDb` is added to the played level (`_gain_off`); `added` sounds become type "custom"."""
    ov = doc.get("events") if isinstance(doc.get("events"), dict) else {}
    out = []
    for ev in events:
        o = ov.get(ev_key(ev))
        if not isinstance(o, dict):
            out.append(ev)
            continue
        if o.get("muted") is True:
            continue
        ev = dict(ev)
        if isinstance(o.get("t"), (int, float)):
            ev["t"] = float(o["t"])
        g = float(o["gainDb"]) if isinstance(o.get("gainDb"), (int, float)) else 0.0
        if o.get("src") is not None:
            spec = resolve_sfx_src(o["src"], run)
            if spec is None:
                print(f"warning: sfx.json: sound {o['src']!r} of event {ev_key(ev)} is not available, the default sound plays")
            else:
                spec["gain_db"] += g
                ev["_spec"] = spec
        elif g:
            ev["_gain_off"] = g
        out.append(ev)
    for a in doc.get("added") if isinstance(doc.get("added"), list) else []:
        spec = resolve_sfx_src(a.get("src"), run)
        if spec is None:
            print(f"warning: sfx.json: added sound {a.get('id')!r} ({a.get('src')!r}) is not available, skipped")
            continue
        spec["gain_db"] += float(a["gainDb"]) if isinstance(a.get("gainDb"), (int, float)) else 0.0
        out.append({"t": float(a["t"]), "type": "custom", "x": 0.0, "key": a.get("id"), "_spec": spec, **({"label": a["label"]} if a.get("label") else {})})
    out.sort(key=lambda e: e["t"])  # stable: automatic before added at equal times (same as mergeSfx)
    return out


def place_one(bus, placed, counters, spec, kind, label, t, n, x=0.0, pan_width=0.0, base=".", gain_off=0.0):
    is_file = bool(spec.get("file") or spec.get("files") or spec.get("kit"))
    if is_file:
        ck = "_" + str(spec.get("kit") or spec.get("file") or spec.get("files")) + (":" + spec["role"] if spec.get("kit") else "")
        idx = counters.get(ck, 0)
        key, path, anchor, dflt = resolve_file_take(spec, idx, base)
        counters[ck] = idx + 1
        wav = load(path)
        if anchor == "end":
            anchor = wav.shape[1] / SR
        elif anchor in ("onset", "peak", None):
            anchor = 0.0
        g = spec.get("gain_db", dflt if dflt is not None else -22) + spec.get("jitter_db", 0.0) * (((idx * 37) % 11) / 5.0 - 1.0)
        if gain_off:
            g += gain_off
        target = spec["end_at"] if spec.get("end_at") is not None else t
        start = target - anchor + spec.get("delay", 0.0)
        name = Path(path).name
    else:
        idx = counters.get(spec["sound"], 0)
        counters[spec["sound"]] = idx + 1
        seeds = spec.get("seeds")
        seed = (idx % seeds) + 1 if seeds else spec.get("seed")
        pitches = spec.get("pitches")
        pitch = pitches[idx % len(pitches)] if pitches else spec.get("pitch")
        wav = render_sfx(spec["sound"], spec.get("dur"), spec.get("apex"), pitch, seed)
        jitter = spec.get("jitter_db", 0.0)
        g = spec.get("gain_db", -22) + jitter * (((idx * 37) % 11) / 5.0 - 1.0)
        if gain_off:
            g += gain_off
        start = t + (spec.get("apex_at", spec.get("apex", 0)) - spec.get("apex", 0) if spec.get("apex") is not None else 0)
        start += spec.get("delay", 0.0)
        name = spec["sound"]
    if pan_width and spec.get("pan", True) is not False:
        gl, gr = pan_gains(x, pan_width)
        mono = wav.mean(axis=0)
        wav = np.stack([mono * gl, mono * gr]).astype("float32")
    i0 = int(round(start * SR))
    a, b = max(i0, 0), min(i0 + wav.shape[1], n)
    if b > a:
        bus[:, a:b] += wav[:, a - i0 : b - i0] * db(g)
    placed.append((round(start, 3), kind, label, name, round(g, 1)) + ((round(float(np.clip(x * pan_width, -1, 1)), 2),) if pan_width else ()))


def build_sfx_bus(events, cfg, n, pan_width=0.0, base="."):
    bus = np.zeros((2, n), dtype="float32")
    counters, placed = {}, []
    skip = re.compile(cfg["skip_label_regex"], re.I) if cfg.get("skip_label_regex") else None
    for ev in events:
        # Motion overlays (brand-layer motionEvents) emit `type` instead of `kind`.
        label, kind, t = ev.get("label", ""), ev.get("kind") or ev.get("type"), ev["t"]
        spec = None
        rule_hit = False
        if ev.get("_spec"):  # sfx.json: this event plays the chosen lib / kit / uploaded sound (gain already includes the trim)
            place_one(bus, placed, counters, ev["_spec"], kind, label, t, n, ev.get("x", 0.0) or 0.0, pan_width, base)
            continue
        goff = ev.get("_gain_off", 0.0)  # sfx.json: trim of the mapped sound
        if ev.get("_replace"):  # Estudio: this event plays a chosen WAV instead of the mapped sound
            place_one(bus, placed, counters, {"file": ev["_replace"], "gain_db": -14}, kind, label, t, n, ev.get("x", 0.0) or 0.0, pan_width, base)
            continue
        for rule in cfg["labels"]:
            if re.search(rule["match"], label, re.I):
                rule_hit = True
                if rule.get("silent"):
                    spec = None
                else:
                    spec = merge(cfg["kinds"].get(rule.get("kind", kind)) or {}, {k: v for k, v in rule.items() if k not in ("match", "kind", "silent")})
                break
        if not rule_hit:
            if skip and skip.search(label):
                continue
            spec = cfg["kinds"].get(kind)
        if not spec:
            continue
        for sub in (spec["layers"] if spec.get("layers") else [spec]):
            if sub.get("sound") or sub.get("file") or sub.get("files") or sub.get("kit"):
                place_one(bus, placed, counters, sub, kind, label, t, n, ev.get("x", 0.0) or 0.0, pan_width, base, goff)
    return bus, placed


# ---------- loudness ----------
def ebur128(path):
    r = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(path), "-af", "ebur128=peak=true", "-f", "null", "-"], capture_output=True, text=True)
    txt = r.stderr.split("Summary:")[-1]
    lufs = float(re.search(r"I:\s+(-?[\d.]+) LUFS", txt).group(1))
    tp = float(re.search(r"Peak:\s+(-?[\d.]+) dBFS", txt).group(1))
    lra = float(re.search(r"LRA:\s+(-?[\d.]+) LU", txt).group(1))
    return lufs, tp, lra


def master(src, dst, lufs, tp):
    target_tp = tp - 0.3
    for _ in range(4):
        first = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(src), "-af", f"loudnorm=I={lufs}:TP={target_tp}:LRA=11:print_format=json", "-f", "null", "-"], capture_output=True, text=True)
        m = json.loads(re.search(r"\{[^{}]*\"input_i\"[^{}]*\}", first.stderr, re.S).group(0))
        af = (f"loudnorm=I={lufs}:TP={target_tp}:LRA=11:measured_I={m['input_i']}:measured_TP={m['input_tp']}:measured_LRA={m['input_lra']}"
              f":measured_thresh={m['input_thresh']}:offset={m['target_offset']}:linear=true,aresample={SR}")
        subprocess.run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", str(src), "-af", af, "-ar", str(SR), "-ac", "2", "-c:a", "pcm_s24le", str(dst)], check=True)
        i, p, lra = ebur128(dst)
        if p <= tp + 0.02:
            break
        target_tp -= (p - tp) + 0.1
    return i, p, lra


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("comp_dir")
    ap.add_argument("--music")
    ap.add_argument("--no-music", action="store_true", help="no music bed: mix the voice (+ SFX) only and master it the same way (written to mix.wav)")
    ap.add_argument("--music-offset", default="0")
    ap.add_argument("--drop-at", type=float, default=10.0)
    ap.add_argument("--voice")
    ap.add_argument("--voice-offset", type=float, default=0.0)
    ap.add_argument("--sfx-map")
    ap.add_argument("--duck-db", type=float)
    ap.add_argument("--align-downbeat", type=float)
    ap.add_argument("--music-break")
    ap.add_argument("--music-drop", type=float)
    ap.add_argument("--drop-hold", type=float, default=0.25)
    ap.add_argument("--end", type=float)
    ap.add_argument("--end-hold", type=float, default=0.3)
    ap.add_argument("--end-tail", type=float, default=0.6)
    ap.add_argument("--pan-width", type=float, default=0.0)
    ap.add_argument("--events")
    ap.add_argument("--out-dir")
    ap.add_argument("--options")
    ap.add_argument("--sfx-doc")
    a = ap.parse_args()
    if bool(a.music) == bool(a.no_music):
        ap.error("give exactly one of --music PATH or --no-music")
    opts = json.loads(Path(a.options).read_text()) if a.options else {}

    out_dir = Path(a.out_dir) if a.out_dir else Path(a.comp_dir) / "out"
    out_dir.mkdir(parents=True, exist_ok=True)
    ev_file = json.loads(Path(a.events or Path(a.comp_dir) / "out" / "events.json").read_text())
    dur, events = float(ev_file["DURATION"]), ev_file["events"]
    cfg = DEFAULT_MAP
    if a.sfx_map:
        cfg = merge(cfg, json.loads(Path(a.sfx_map).read_text()))
    n = int(round(dur * SR))
    if opts:
        cfg = copy.deepcopy(cfg)
        cfg["music"]["gain_db"] = cfg["music"].get("gain_db", 0.0) + float(opts.get("music_db", 0.0))
        cfg["voice_gain_db"] = cfg.get("voice_gain_db", 0.0) + float(opts.get("voice_db", 0.0))
        cfg["sfx_bus_db"] = cfg.get("sfx_bus_db", 0.0) + float(opts.get("sfx_db", 0.0))
        for k in ("fade_in", "fade_out"):
            if opts.get(k) is not None:
                cfg["music"][k] = float(opts[k])
        if opts.get("music_offset") is not None:
            a.music_offset = str(opts["music_offset"])

    # --- music ---
    if a.no_music:  # voice + SFX only: a silent bed, nothing to analyse, extend, fade or duck
        mus, offset, downs, drop_t, mc = np.zeros((2, n), dtype="float32"), 0.0, None, None, cfg["music"]
        notes = ["no music: voice + SFX only"]
    else:
        mus = load(a.music)
        downs = None
        if a.align_downbeat is not None:
            downs, period, tempo = detect_downbeats(a.music)
            cand = downs[downs >= a.align_downbeat - 0.005]
            d = float(cand[0]) if len(cand) else float(downs[-1])
            offset = d - a.align_downbeat
            print(f"beat tracking: {tempo:.1f} bpm (beat {period*1000:.0f} ms); downbeats {np.round(downs,2).tolist()}")
            print(f"downbeat at music {d:.3f}s -> offset {offset:+.3f}s so it lands at {a.align_downbeat}s")
        elif a.music_offset == "auto":
            d, _, _ = music_drop(a.music)
            offset = d - a.drop_at
            print(f"music activity drop at {d:.2f}s -> offset {offset:+.2f}s so it lands at {a.drop_at}s")
        else:
            offset = float(a.music_offset)
        if offset >= 0:
            mus = mus[:, int(offset * SR):]
        else:
            mus = np.pad(mus, ((0, 0), (int(-offset * SR), 0)))
        mc = cfg["music"]
        end = effective_end(mus)
        notes = [f"music offset {offset:+.2f}s" + ("" if a.end is not None else f", audible until ~{end:.1f}s of the video (video {dur:.1f}s)")]
        structured = a.end is not None
        if not structured and (mus.shape[1] < n or (end < dur - 1.0 and mc["extend"] in ("auto", True))):
            # Extend: crossfade into a loop of the calm bed so the ending is not dead air, then fade out.
            xf = int(2.0 * SR)
            lo, hi = int(max(end - 8, 6) * SR), int(max(end - 2, 8) * SR)
            bed = mus[:, lo:hi]
            cut = hi
            ext = mus[:, :cut].copy()
            while ext.shape[1] < n + xf:
                fade = np.linspace(0, 1, xf, dtype="float32") ** 0.5
                head = ext[:, -xf:] * np.cos(fade * np.pi / 2) + bed[:, :xf] * np.sin(fade * np.pi / 2)
                ext = np.concatenate([ext[:, :-xf], head, bed[:, xf:]], axis=1)
            mus = ext
            notes.append(f"music tail extended by looping the calm bed {lo/SR:.1f}-{hi/SR:.1f}s (2 s crossfades)")
        if mus.shape[1] < n:
            mus = np.pad(mus, ((0, 0), (0, n - mus.shape[1])))
        mus = mus[:, :n].copy()
        fi, fo = int(mc["fade_in"] * SR), int(mc["fade_out"] * SR)
        mus[:, :fi] *= np.linspace(0, 1, fi, dtype="float32") ** 2
        if not structured:
            mus[:, -fo:] *= np.linspace(1, 0, fo, dtype="float32") ** 2
        drop_t = a.music_drop
        if a.music_break:
            if drop_t is None:
                ap.error("--music-break needs --music-drop")
            bs, be = (float(x) for x in a.music_break.split(":"))
            i0, i1, i2 = int(bs * SR), int(be * SR), int(drop_t * SR)
            mus = tape_stop(mus, i0, i1)
            mus[:, i1:i2] = 0.0
            notes.append(f"music break: tape-stop {bs:.2f}-{be:.2f}s, silent until drop at {drop_t:.2f}s")
        if drop_t is not None:
            ramp = int(0.010 * SR)
            i2 = int(drop_t * SR)
            if a.music_break:
                mus[:, i2 : i2 + ramp] *= np.linspace(0, 1, ramp, dtype="float32")
        if structured:
            e = a.end
            if downs is not None:
                vd = downs - offset
                e = float(vd[np.argmin(np.abs(vd - a.end))])
                notes.append(f"music end: snapped to downbeat at {e:.2f}s")
            cut = int(min(e + a.end_hold, dur) * SR)
            tail_len = int(min(a.end_tail, max(dur - cut / SR, 0)) * SR)
            tail = reverb_tail(mus[:, max(cut - int(0.5 * SR), 0) : cut], tail_len) if tail_len > 0 else None
            f30 = int(0.03 * SR)
            mus[:, cut:] = 0.0
            mus[:, cut - f30 : cut] *= np.linspace(1, 0, f30, dtype="float32")
            if tail is not None:
                tail *= np.linspace(1, 0, tail_len, dtype="float32") ** 1.5
                mus[:, cut : cut + tail_len] += tail
            notes.append(f"music cut at {cut/SR:.2f}s with {tail_len/SR:.2f}s reverb tail")
        mus *= db(mc["gain_db"])

    # --- voice + ducking ---
    voice = None
    if a.voice:
        voice_path = a.voice
        tempo = float(opts.get("voice_atempo") or 1.0)
        if abs(tempo - 1.0) > 1e-3:
            if not 0.5 <= tempo <= 2.0:
                sys.exit("voice_atempo must be between 0.5 and 2.0")
            print(f"warning: voice_atempo {tempo} changes the voice length; word timings no longer match the video")
            tmp_voice = out_dir / "voice-atempo.wav"
            run(["ffmpeg", "-v", "error", "-y", "-i", a.voice, "-af", f"atempo={tempo}", str(tmp_voice)])
            voice_path = str(tmp_voice)
        v = load(voice_path)
        voice = np.zeros((2, n), dtype="float32")
        i0 = int(a.voice_offset * SR)
        seg = v[:, : max(0, n - i0)]
        voice[:, i0 : i0 + seg.shape[1]] = seg
        hop = int(0.02 * SR)
        mono = voice.mean(axis=0)
        fr = np.sqrt((mono[: n // hop * hop].reshape(-1, hop) ** 2).mean(axis=1) + 1e-12)
        act = (20 * np.log10(fr / fr.max()) > -35).astype("float32")
        # one-pole smoothing with different attack / release
        d = dict(cfg["duck"])
        if a.duck_db is not None:
            d["db"] = a.duck_db
        if drop_t is not None:
            h0 = int(drop_t * SR / hop)
            act[h0 : h0 + int(a.drop_hold * SR / hop)] = 0.0  # let the drop land at full level
        ca, cr = np.exp(-hop / SR / d["attack"]), np.exp(-hop / SR / d["release"])
        env, s = np.zeros_like(act), 0.0
        for k, x in enumerate(act):
            c = ca if x > s else cr
            s = c * s + (1 - c) * x
            env[k] = s
        gain = db(-d["db"] * env)
        mus *= np.interp(np.arange(n), (np.arange(len(gain)) + 0.5) * hop, gain).astype("float32")
        voice *= db(cfg["voice_gain_db"])

    # --- sfx ---
    sfx_opts = opts.get("sfx") or {}
    if sfx_opts.get("enabled") is False:
        events = []
    elif sfx_opts.get("mute") or sfx_opts.get("replace"):
        near = lambda ev, m: ev.get("type") == m.get("type") and abs(ev["t"] - m["t"]) < 0.03
        kept = []
        for ev in events:
            if any(near(ev, m) for m in sfx_opts.get("mute", [])):
                continue
            rp = next((r for r in sfx_opts.get("replace", []) if near(ev, r)), None)
            kept.append({**ev, "_replace": rp["file"]} if rp else ev)
        events = kept
    if a.sfx_doc:
        events = apply_sfx_doc(events, json.loads(Path(a.sfx_doc).read_text()), Path(a.comp_dir).resolve().parent)
    sfx, placed = build_sfx_bus(events, cfg, n, a.pan_width, Path(a.sfx_map).resolve().parent if a.sfx_map else Path.cwd())
    sfx *= db(cfg["sfx_bus_db"])

    mix = mus + sfx + (voice if voice is not None else 0)
    with tempfile.TemporaryDirectory() as tmp:
        raw = Path(tmp) / "premaster.wav"
        sf.write(str(raw), mix.T, SR, subtype="FLOAT")
        i, p, lra = master(raw, out_dir / "mix.wav", cfg["master"]["lufs"], cfg["master"]["tp"])
    (out_dir / "mix-report.json").write_text(json.dumps({"offset": offset, "notes": notes, "sfx": placed, "lufs": i, "true_peak": p, "lra": lra}, indent=2))
    print("\n".join(notes))
    print(f"SFX placed: {len(placed)} of {len(events)} events")
    for row in placed:
        print("  ", *row)
    print(f"mix.wav: {i:.1f} LUFS integrated, {p:.1f} dBTP, LRA {lra:.1f} LU -> {out_dir/'mix.wav'}")


if __name__ == "__main__":
    main()
