#!/usr/bin/env python3
"""End-to-end test without paid APIs (macOS, Windows, Linux): synthetic clip -> qa_speech -> overlay (hook + captions + CTA) ->
ffprobe checks, then a second overlay pass with --motion (layout planner, QA sheet, limiter true peak).

  python3 scripts/smoke_test.py [--keep]        run dir: $SMOKE_RUN, or a fresh temp dir (tempfile, any OS)
  scripts/smoke_test.sh                         thin wrapper (Git Bash / macOS / Linux)

Speech: the clip carries a 440 Hz tone, not speech (the old macOS `say` voice is gone and tts.py needs a paid API key), so the
word timings are empty and the captions/speech metrics are exercised with an empty word list. Node checks (--check, the
highlight matcher) run only when `node` is on PATH and are reported as SKIP otherwise.
Interpreter for the child scripts: $PYTHON, else this interpreter (run it with the skill venv: python scripts/paths.py --python).
"""
import argparse, json, os, re, shutil, subprocess, sys, tempfile
from pathlib import Path

S = Path(__file__).resolve().parent.parent
PY = os.environ.get("PYTHON") or sys.executable
FAILED = []


def run(cmd, **kw):
    return subprocess.run([str(c) for c in cmd], check=True, **kw)


def check(name, ok):
    print(("PASS " if ok else "FAIL ") + name)
    if not ok:
        FAILED.append(name)


def ffprobe_json(path, *entries):
    r = subprocess.run(["ffprobe", "-v", "error", *entries, "-of", "json", str(path)], capture_output=True, text=True, check=True)
    return json.loads(r.stdout)


def static_checks():
    print("== 0. static checks")
    import py_compile
    for f in sorted((S / "scripts").glob("*.py")):
        py_compile.compile(str(f), doraise=True)
    print("syntax ok")
    node = shutil.which("node")
    if not node:
        print("SKIP node checks (node not on PATH)")
        return
    for f in sorted((S / "engine").glob("*.js")) + [S / "engine" / "render.mjs"]:
        run([node, "--check", f])
    # highlightWords matching must be case- and accent-insensitive (pure function, no browser needed).
    code = ("import { matchHighlights } from '%s'; const f = matchHighlights(['Tu','DÍA','es','GRATIS!','de','2,40','m.'], "
            "['dia', 'Gratis', '2.40 m']); const want = [false, true, false, true, false, true, true];"
            "if (JSON.stringify(f) !== JSON.stringify(want)) { console.error('highlight match FAIL', f); process.exit(1); }"
            "console.log('highlight matcher ok');") % (S / "engine" / "brand-layer.js").as_posix()
    run([node, "--input-type=module", "-e", code])


def make_clip(src_dir, secs=6):
    clip = src_dir / "clip.mp4"
    run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", f"testsrc2=s=1080x1920:r=30:d={secs}",
         "-f", "lavfi", "-i", f"sine=frequency=440:duration={secs}", "-filter_complex", "[1:a]aresample=48000,apad[a]",
         "-map", "0:v", "-map", "[a]", "-t", str(secs), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-colorspace", "bt709",
         "-color_primaries", "bt709", "-color_trc", "bt709", "-c:a", "aac", str(clip)])
    return clip


def make_brand(run_dir):
    shutil.copytree(S / "brands" / "reda" / "assets", run_dir / "assets", dirs_exist_ok=True)
    b = json.load(open(S / "brands" / "reda" / "brand.json", encoding="utf-8"))
    c = next(x for x in b["palette_candidates"] if x["source"] == "reda.mx")
    b["colors"] = {k: c[k] for k in ("primary", "ink", "paper", "accent")} | {"extra": []}
    # chatBubbles avatar: the brand's Rex head if present, else its logo mark (the avatar falls back to an ink circle if neither loads).
    if not b.get("characters", {}).get("rex", {}).get("image"):
        b.setdefault("characters", {})["rex"] = {"image": b["logo"]["mark"], "role": "chat avatar (smoke fallback)"}
    font = "Helvetica Neue" if sys.platform == "darwin" else "Arial"  # system font, no network
    b["fonts"] = {"display": {"family": font}, "body": {"family": font}}
    out = run_dir / "brand.json"
    json.dump(b, open(out, "w", encoding="utf-8"), indent=2)
    return out


MOTION = [
    {"type": "keywordPop", "text": "40 CHATS", "in": 0.5, "out": 1.8, "style": "box"},
    {"type": "toast", "in": 1.0, "out": 2.6, "title": "Reda · Nueva visita", "body": "Domingo 11:00"},
    {"type": "chatBubbles", "out": 4.4, "items": [{"from": "client", "text": "Hola, ¿sigue disponible?", "at": 2.0}, {"from": "rex", "text": "¡Hola! Sí 🙌", "at": 2.7}]},
    {"type": "specCard", "in": 2.8, "out": 5.0, "title": "Ficha", "rows": [{"label": "Madera", "value": "Parota"}, {"label": "Acabado", "value": "Natural"}, {"label": "Capacidad", "value": "8 personas"}]},
    {"type": "dimensionLine", "in": 3.4, "out": 5.4, "label": "2.40 m", "from": {"x": 140, "y": 1000}, "to": {"x": 940, "y": 1000}},
    {"type": "onomatopoeia", "text": "¡WOW!", "in": 4.6, "out": 5.8, "rotate": -8},
    {"type": "highlightWords", "words": ["whatsapp", "DIA"]},
]


def verify_pass1(final):
    print("== 5. verify")
    j = ffprobe_json(final, "-show_streams", "-show_format")
    v = next(s for s in j["streams"] if s["codec_type"] == "video")
    a = [s for s in j["streams"] if s["codec_type"] == "audio"]
    num, den = map(int, v["avg_frame_rate"].split("/"))
    fps, dur = num / den, float(j["format"]["duration"])
    print(f"video {v['width']}x{v['height']} fps={fps:.3f} range={v.get('color_range')} matrix={v.get('color_space')} duration={dur:.3f} audio_streams={len(a)}")
    check("1080x1920", (v["width"], v["height"]) == (1080, 1920))
    check("30 fps", abs(fps - 30) < 0.01)
    check("color_range tv", v.get("color_range") == "tv")
    check("colorspace bt709", v.get("color_space") == "bt709")
    check("duration ~9 s (6 clip + 3 CTA)", abs(dur - 9.0) < 0.2)
    check("audio present", len(a) == 1)
    print("-- ebur128 integrated loudness")
    r = subprocess.run(["ffmpeg", "-nostats", "-i", str(final), "-vn", "-af", "ebur128=framelog=quiet", "-f", "null", "-"], capture_output=True, text=True)
    print("\n".join(l for l in r.stderr.splitlines() if re.match(r"\s*(I|LRA|Peak):", l)))


def verify_pass2(final, comp, motion):
    print("== 7. verify motion pass")
    check("final mp4 exists", final.exists())
    dur = float(ffprobe_json(final, "-show_format")["format"]["duration"]) if final.exists() else 0.0
    check(f"duration ~9 s (got {dur:.2f})", abs(dur - 9.0) < 0.2)
    rep = comp / "layout-report.json"
    check("layout-report.json exists", rep.exists())
    els = json.load(open(rep, encoding="utf-8"))["elements"] if rep.exists() else []
    want = MOTION
    check("report lists every motion element", len(els) == len(want) and [e["type"] for e in els] == [w["type"] for w in want])
    auto_types = {"keywordPop", "chatBubbles", "specCard", "onomatopoeia"}
    autos = [e for e in els if e["mode"] == "auto"]
    check("every auto-placed element has a slot and rect", {e["type"] for e in autos} == auto_types and all(e["slot"] and e["rect"] for e in autos))
    check("dimensionLine is explicit (not auto)", any(e["type"] == "dimensionLine" and e["mode"] == "explicit" and e["rect"] for e in els))
    check("qa-layout.jpg exists", (comp / "out" / "qa-layout.jpg").exists())
    r = subprocess.run(["ffmpeg", "-nostats", "-i", str(final), "-vn", "-af", "ebur128=peak=true:framelog=quiet", "-f", "null", "-"], capture_output=True, text=True)
    m = re.search(r"True peak:\s*\n\s*Peak:\s*(-?[\d.]+|-inf) dBFS", r.stderr)
    tp = float(m.group(1)) if m and m.group(1) != "-inf" else -99.0
    check(f"true peak <= -1 dBTP (got {tp:.1f})", m is not None and tp <= -1.0)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--keep", action="store_true", help="kept for compatibility (the run dir is never deleted)")
    ap.parse_args()
    run_dir = Path(os.environ.get("SMOKE_RUN") or tempfile.mkdtemp(prefix="estudio-smoke-")).resolve()
    (run_dir / "src").mkdir(parents=True, exist_ok=True)
    print(f"run dir: {run_dir}")
    static_checks()

    print("== 1. synthetic 6 s 1080x1920 clip (tone, no speech: see the module docstring)")
    clip = make_clip(run_dir / "src")

    print("== 2. qa_speech")
    qa = run_dir / "src" / "qa.json"
    words = run_dir / "src" / "words.json"
    with open(qa, "w", encoding="utf-8") as f:
        run([PY, S / "scripts" / "qa_speech.py", clip, "--out", words], stdout=f)
    print(qa.read_text(encoding="utf-8"))

    print("== 3. test brand.json (reda.mx palette candidate injected into the TEST run only, system font, no network)")
    brand = make_brand(run_dir)

    print("== 4. overlay (hook + captions + CTA)")
    run([PY, S / "scripts" / "overlay.py", "--run", run_dir, "--clips", clip, "--words", words,
         "--hook", "Tu negocio no duerme", "--cta", "--name", "smoke"])
    final = run_dir / "smoke" / "out" / "smoke-final.mp4"
    verify_pass1(final)

    print("== 6. second overlay pass: --motion (keywordPop, chatBubbles, toast, specCard, dimensionLine, onomatopoeia, highlightWords)")
    motion = run_dir / "src" / "motion.json"
    motion.write_text(json.dumps(MOTION, ensure_ascii=False, indent=1), encoding="utf-8")
    run([PY, S / "scripts" / "overlay.py", "--run", run_dir, "--clips", clip, "--words", words,
         "--hook", "Tu negocio no duerme", "--cta", "--motion", motion, "--name", "smoke2"])
    final2 = run_dir / "smoke2" / "out" / "smoke2-final.mp4"
    verify_pass2(final2, run_dir / "smoke2", motion)

    if FAILED:
        print(f"SMOKE TEST FAILED ({len(FAILED)} checks): {', '.join(FAILED)}")
        sys.exit(1)
    print(f"SMOKE TEST PASSED ({final}, {final2})")


if __name__ == "__main__":
    main()
