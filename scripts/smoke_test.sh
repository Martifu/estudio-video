#!/usr/bin/env bash
# End-to-end test without paid APIs: synthetic clip (+ Spanish TTS) -> qa_speech -> overlay (hook + captions + CTA) -> ffprobe checks,
# then a second overlay pass with --motion (layout planner, QA sheet, limiter true peak).
# Usage: scripts/smoke_test.sh [--keep]   (run dir: $SMOKE_RUN or a fresh /tmp dir)
set -euo pipefail
S="$(cd "$(dirname "$0")/.." && pwd)"
PY=${PYTHON:-python3}
RUN="${SMOKE_RUN:-$(mktemp -d /tmp/estudio-smoke.XXXXXX)}"
mkdir -p "$RUN/src"
echo "run dir: $RUN"

echo "== 0. static checks"
for f in "$S"/engine/*.js "$S"/engine/render.mjs; do node --check "$f"; done
"$PY" -m py_compile "$S"/scripts/*.py && echo "syntax ok"
# highlightWords matching must be case- and accent-insensitive (pure function, no browser needed).
node --input-type=module -e "
import { matchHighlights } from '$S/engine/brand-layer.js';
const f = matchHighlights(['Tu','DÍA','es','GRATIS!','de','2,40','m.'], ['dia', 'Gratis', '2.40 m']);
const want = [false, true, false, true, false, true, true];
if (JSON.stringify(f) !== JSON.stringify(want)) { console.error('highlight match FAIL', f); process.exit(1); }
console.log('highlight matcher ok');
"

echo "== 1. synthetic 6 s 1080x1920 clip with Spanish speech"
TEXT="Hola, esto es una prueba del sistema. Tu negocio atiende por whatsapp, todo el día."
if say -v Paulina -o "$RUN/src/speech.aiff" "$TEXT" 2>/dev/null; then
  AUDIO_IN=(-i "$RUN/src/speech.aiff")
else
  echo "say/Paulina unavailable: falling back to a sine tone"
  AUDIO_IN=(-f lavfi -i "sine=frequency=440:duration=6")
fi
ffmpeg -v error -y -f lavfi -i "testsrc2=s=1080x1920:r=30:d=6" "${AUDIO_IN[@]}" \
  -filter_complex "[1:a]aresample=48000,apad[a]" -map 0:v -map "[a]" -t 6 \
  -c:v libx264 -pix_fmt yuv420p -colorspace bt709 -color_primaries bt709 -color_trc bt709 -c:a aac "$RUN/src/clip.mp4"

echo "== 2. qa_speech"
"$PY" "$S/scripts/qa_speech.py" "$RUN/src/clip.mp4" --out "$RUN/src/words.json" > "$RUN/src/qa.json"
cat "$RUN/src/qa.json"

echo "== 3. test brand.json (reda.mx palette candidate injected into the TEST run only, system font, no network)"
cp -R "$S/brands/reda/assets" "$RUN/assets"
"$PY" - "$S/brands/reda/brand.json" "$RUN/brand.json" <<'PY'
import json, sys
b = json.load(open(sys.argv[1]))
c = next(x for x in b["palette_candidates"] if x["source"] == "reda.mx")
b["colors"] = {k: c[k] for k in ("primary", "ink", "paper", "accent")} | {"extra": []}
# chatBubbles avatar: use the brand's Rex head if present, else its logo mark (the avatar falls back to an ink circle if neither loads).
if not b.get("characters", {}).get("rex", {}).get("image"):
    b.setdefault("characters", {})["rex"] = {"image": b["logo"]["mark"], "role": "chat avatar (smoke fallback)"}
b["fonts"] = {"display": {"family": "Helvetica Neue"}, "body": {"family": "Helvetica Neue"}}
json.dump(b, open(sys.argv[2], "w"), indent=2)
PY

echo "== 4. overlay (hook + captions + CTA)"
KEEP_FRAMES=${KEEP_FRAMES:-} "$PY" "$S/scripts/overlay.py" --run "$RUN" --clips "$RUN/src/clip.mp4" --words "$RUN/src/words.json" \
  --hook "Tu negocio no duerme" --cta --name smoke
FINAL="$RUN/smoke/out/smoke-final.mp4"

echo "== 5. verify"
"$PY" - "$FINAL" <<'PY'
import json, subprocess, sys
f = sys.argv[1]
r = subprocess.run(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", f], capture_output=True, text=True, check=True)
j = json.loads(r.stdout)
v = next(s for s in j["streams"] if s["codec_type"] == "video")
a = [s for s in j["streams"] if s["codec_type"] == "audio"]
num, den = map(int, v["avg_frame_rate"].split("/"))
fps = num / den
dur = float(j["format"]["duration"])
checks = {
    "1080x1920": (v["width"], v["height"]) == (1080, 1920),
    "30 fps": abs(fps - 30) < 0.01,
    "color_range tv": v.get("color_range") == "tv",
    "colorspace bt709": v.get("color_space") == "bt709",
    "duration ~9 s (6 clip + 3 CTA)": abs(dur - 9.0) < 0.2,
    "audio present": len(a) == 1,
}
print(f"video {v['width']}x{v['height']} fps={fps:.3f} range={v.get('color_range')} matrix={v.get('color_space')} duration={dur:.3f} audio_streams={len(a)}")
for k, ok in checks.items():
    print(("PASS " if ok else "FAIL ") + k)
sys.exit(0 if all(checks.values()) else 1)
PY
echo "-- ebur128 integrated loudness"
ffmpeg -nostats -i "$FINAL" -vn -af ebur128=framelog=quiet -f null - 2>&1 | grep -A12 "Summary" | grep -E "I:|LRA:|Peak:" || true

echo "== 6. second overlay pass: --motion (keywordPop, chatBubbles, toast, specCard, dimensionLine, onomatopoeia, highlightWords)"
# The synthetic clip has no face: Vision finds nothing, so overlay.py prints a warning and layout.js uses its centered default face box.
# This exercises the face-tracking fallback path, the auto-placement planner, the QA sheet and the AAC limiter, not real face avoidance.
cat > "$RUN/src/motion.json" <<'JSON'
[
 {"type":"keywordPop","text":"40 CHATS","in":0.5,"out":1.8,"style":"box"},
 {"type":"toast","in":1.0,"out":2.6,"title":"Reda · Nueva visita","body":"Domingo 11:00"},
 {"type":"chatBubbles","out":4.4,"items":[{"from":"client","text":"Hola, ¿sigue disponible?","at":2.0},{"from":"rex","text":"¡Hola! Sí 🙌","at":2.7}]},
 {"type":"specCard","in":2.8,"out":5.0,"title":"Ficha","rows":[{"label":"Madera","value":"Parota"},{"label":"Acabado","value":"Natural"},{"label":"Capacidad","value":"8 personas"}]},
 {"type":"dimensionLine","in":3.4,"out":5.4,"label":"2.40 m","from":{"x":140,"y":1000},"to":{"x":940,"y":1000}},
 {"type":"onomatopoeia","text":"¡WOW!","in":4.6,"out":5.8,"rotate":-8},
 {"type":"highlightWords","words":["whatsapp","DIA"]}
]
JSON
"$PY" "$S/scripts/overlay.py" --run "$RUN" --clips "$RUN/src/clip.mp4" --words "$RUN/src/words.json" \
  --hook "Tu negocio no duerme" --cta --motion "$RUN/src/motion.json" --name smoke2
FINAL2="$RUN/smoke2/out/smoke2-final.mp4"

echo "== 7. verify motion pass"
"$PY" - "$FINAL2" "$RUN/smoke2" "$RUN/src/motion.json" <<'PY'
import json, os, re, subprocess, sys
final, comp, motion = sys.argv[1:4]
ok = {}
ok["final mp4 exists"] = os.path.exists(final)
dur = float(json.loads(subprocess.run(["ffprobe", "-v", "error", "-show_format", "-of", "json", final], capture_output=True, text=True, check=True).stdout)["format"]["duration"]) if ok["final mp4 exists"] else 0
ok[f"duration ~9 s (got {dur:.2f})"] = abs(dur - 9.0) < 0.2
rep_path = os.path.join(comp, "layout-report.json")
ok["layout-report.json exists"] = os.path.exists(rep_path)
els = json.load(open(rep_path))["elements"] if ok["layout-report.json exists"] else []
want = json.load(open(motion))
ok["report lists every motion element"] = len(els) == len(want) and [e["type"] for e in els] == [w["type"] for w in want]
auto_types = {"keywordPop", "chatBubbles", "specCard", "onomatopoeia"}
autos = [e for e in els if e["mode"] == "auto"]
ok["every auto-placed element has a slot and rect"] = {e["type"] for e in autos} == auto_types and all(e["slot"] and e["rect"] for e in autos)
ok["dimensionLine is explicit (not auto)"] = any(e["type"] == "dimensionLine" and e["mode"] == "explicit" and e["rect"] for e in els)
ok["qa-layout.jpg exists"] = os.path.exists(os.path.join(comp, "out", "qa-layout.jpg"))
r = subprocess.run(["ffmpeg", "-nostats", "-i", final, "-vn", "-af", "ebur128=peak=true:framelog=quiet", "-f", "null", "-"], capture_output=True, text=True)
m = re.search(r"True peak:\s*\n\s*Peak:\s*(-?[\d.]+|-inf) dBFS", r.stderr)
tp = float(m.group(1)) if m and m.group(1) != "-inf" else -99.0
ok[f"true peak <= -1 dBTP (got {tp:.1f})"] = m is not None and tp <= -1.0
for k, v in ok.items():
    print(("PASS " if v else "FAIL ") + k)
sys.exit(0 if all(ok.values()) else 1)
PY
echo "SMOKE TEST PASSED ($FINAL, $FINAL2)"
