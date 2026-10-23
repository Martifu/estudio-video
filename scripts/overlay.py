#!/usr/bin/env python3
"""One command: clip(s) -> branded final (footage full-bleed + hook title + karaoke captions + CTA end card).

  python3 overlay.py --run RUN --clips a.mp4[,b.mp4] [--words words.json] [--hook "text"] [--cta] [--music f.wav] [--name overlay]
                     [--cta-title T] [--cta-subtitle S] [--cta-dur 3] [--cta-voice v.wav] [--hook-in 0.2] [--hook-out 3.2]
                     [--motion motion.json] [--reuse-footage] [--captions-y Y] [--captions-size N] [--logo-clips N] [--ai-label|--no-ai-label]

Needs RUN/brand.json (see brands/_template/brand.json). Steps: extract each clip to RUN/footage/<name>/%04d.jpg (30 fps,
1080x1920 cover-cropped) + audio -> build RUN/<name>/index.html from engine/templates/overlay.html -> render with
engine/render.mjs -> mux the clip audio (loudness-normalized to -14 LUFS, or mixed with --music via mix.py).
words.json ([{word,start,end}], e.g. from qa_speech.py) must be timed against the concatenated clips. Optional <comp>/edl.json
(engine/edl.js; written by the Estudio) cuts the clips (trim/split/reorder/transitions): then --clips is the available material, words come
per clip (--words-by-clip name=words.json,... | <clip>.words.json next to the mp4 | --words in concatenated time) and the audio is cut with the same
map. Without edl.json nothing changes. Output: RUN/<name>/out/<name>-final.mp4
Also: face tracking per clip (scripts/faces.swift -> footage/<clip>/faces.json, cached), face-aware auto-placement of motion elements
without x/y (engine/layout.js) -> RUN/<name>/layout-report.json, and a QA contact sheet RUN/<name>/out/qa-layout.jpg.
"""
import argparse, json, os, re, shutil, subprocess, sys
from pathlib import Path

SKILL = Path(__file__).resolve().parent.parent
ENGINE = SKILL / "engine"
FPS = 30


def sh(cmd, **kw):
    return subprocess.run([str(c) for c in cmd], check=True, **kw)


def probe(path, entries, stream="v:0"):
    r = subprocess.run(["ffprobe", "-v", "error", "-select_streams", stream, "-show_entries", entries, "-of", "json", str(path)],
                       capture_output=True, text=True, check=True)
    return json.loads(r.stdout)


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-") or "clip"


def extract(clip, run, name, audio=True, reuse=False):
    """Clip -> footage/<name>/%04d.jpg (+ audio.wav unless audio=False). Returns (frame count, duration seconds).
    reuse=True (--reuse-footage) skips the extraction when footage/<name> already holds the frames of this exact clip
    (stamp .extract.json = clip path/size/mtime; a dir without stamp is trusted only if its frame count matches the clip
    duration to within 1.5 frames). Default behaviour (always re-extract) is unchanged."""
    out = run / "footage" / name
    st_clip = clip.stat()
    stamp = out / ".extract.json"
    key = {"clip": str(clip), "size": st_clip.st_size, "mtime": int(st_clip.st_mtime), "fps": FPS, "audio": audio}
    if reuse and out.is_dir() and (not audio or (out / "audio.wav").exists()):
        n = len(list(out.glob("*.jpg")))
        ok = False
        if n and stamp.exists():
            try:
                ok = json.loads(stamp.read_text()) == key
            except ValueError:
                ok = False
        elif n:
            clip_dur = float(probe(clip, "format=duration").get("format", {}).get("duration", 0) or 0)
            ok = abs(clip_dur * FPS - n) <= 1.5
            if ok:
                stamp.write_text(json.dumps(key))
        if ok:
            print(f"footage {name}: reused ({n} frames, --reuse-footage)")
            return n, n / FPS
    faces_cache = out / "faces.json"
    kept = faces_cache.read_text() if faces_cache.exists() else None  # survives the re-extraction (see track_faces)
    shutil.rmtree(out, ignore_errors=True)
    out.mkdir(parents=True)
    st = (probe(clip, "stream=color_space")["streams"] or [{}])[0]
    # Untagged HD sources are BT.709; ffmpeg would otherwise assume BT.601 when converting to RGB for the JPEGs.
    matrix = "auto" if st.get("color_space") in ("bt709", "bt470bg", "smpte170m", "bt2020nc") else "bt709"
    vf = (f"fps={FPS},scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,"
          f"scale=in_color_matrix={matrix},format=rgb24")
    sh(["ffmpeg", "-v", "error", "-y", "-i", clip, "-vf", vf, "-q:v", "2", out / "%04d.jpg"])
    n = len(list(out.glob("*.jpg")))
    if kept:
        faces_cache.write_text(kept)
    stamp.write_text(json.dumps(key))
    dur = n / FPS
    if not audio:
        return n, dur
    has_audio = bool(probe(clip, "stream=codec_type", "a:0")["streams"])
    src = ["-i", clip] if has_audio else ["-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo"]
    sh(["ffmpeg", "-v", "error", "-y", *src, "-vn", "-af", "aresample=48000,apad", "-ac", "2", "-t", f"{dur:.4f}",
        "-c:a", "pcm_s16le", out / "audio.wav"])
    return n, dur


def track_faces(clip, run, name, n):
    """Face + upper-body boxes per clip (Apple Vision via scripts/faces.swift) -> footage/<name>/faces.json (1080x1920 canvas px).
    Cached next to the frames, keyed by frame count + source clip (path, size, mtime). Falls back to a centered default box
    (the layout planner uses it when `samples` is empty) with a warning when swift/Vision is unavailable or finds no face."""
    fdir = run / "footage" / name
    cache = fdir / "faces.json"
    st = clip.stat()
    key = {"n": n, "clip": str(clip), "size": st.st_size, "mtime": int(st.st_mtime)}
    if cache.exists():
        try:
            c = json.loads(cache.read_text())
            if c.get("key") == key and c.get("source") == "vision":
                print(f"faces {name}: cached ({c['detected']}/{len(c['samples'])} samples)")
                return c
        except (ValueError, KeyError):
            pass
    src, binary = SKILL / "scripts" / "faces.swift", Path(os.environ.get("ESTUDIO_CACHE", Path.home() / ".cache" / "estudio-video")) / "faces-bin"
    data = None
    try:
        binary.parent.mkdir(parents=True, exist_ok=True)
        if not binary.exists() or binary.stat().st_mtime < src.stat().st_mtime:
            subprocess.run(["swiftc", "-O", str(src), "-o", str(binary)], check=True, capture_output=True, text=True)
        tmp = fdir / "faces.tmp.json"
        subprocess.run([str(binary), str(fdir), "--step", "3", "--out", str(tmp)], check=True, capture_output=True, text=True)
        data = json.loads(tmp.read_text())
        tmp.unlink()
    except (OSError, subprocess.CalledProcessError, ValueError) as e:
        detail = (getattr(e, "stderr", "") or str(e)).strip().splitlines()[-1:] or [""]
        print(f"warning: face tracking failed for {name} ({detail[0]}); using a centered default face box")
    if data is None or not data.get("detected"):
        if data is not None:
            print(f"warning: no face detected in {name}; using a centered default face box")
        return {"source": "default", "samples": [], "detected": 0, "key": key}
    data.update({"source": "vision", "key": key})
    cache.write_text(json.dumps(data))
    print(f"faces {name}: {data['detected']}/{len(data['samples'])} samples with a face")
    return data


def split_words(words, clips):
    """Words in the concatenated timeline of the bin -> {clip name: words in that clip's own time} (words crossing a clip edge are dropped)."""
    out = {}
    for c in clips:
        lo, hi = c["start"], c["start"] + c["dur"]
        out[c["name"]] = [{**w, "start": round(w["start"] - lo, 3), "end": round(w["end"] - lo, 3)}
                          for w in words if w["start"] >= lo - 0.02 and w["end"] <= hi + 0.02]
    return out


def source_words(a, run, comp, clips, paths, edl_on):
    """Per-clip source words: --words-by-clip name=path > sidecar <clip>.words.json (only with an edl.json) > --words (concatenated time).
    Written to footage/<clip>/words.json (the comp and the Estudio re-derive the output words from them). Returns {name: [...]} or None."""
    byclip, explicit = {}, {}
    for item in (a.words_by_clip or "").split(","):
        if item.strip():
            k, _, v = item.partition("=")
            explicit[k.strip()] = Path(v.strip()).expanduser().resolve()
    concat = None
    if a.words:
        wp = Path(a.words).expanduser().resolve()
        stashed = all((run / "footage" / c["name"] / "words.json").exists() for c in clips)
        if not (wp == (comp / "words.json").resolve() and stashed):  # comp/words.json is derived output once the stash exists
            concat = split_words(json.loads(wp.read_text()), clips)
    for c in clips:
        name = c["name"]
        side = paths[name].with_name(paths[name].stem + ".words.json")
        if name in explicit:
            byclip[name] = json.loads(explicit[name].read_text())
        elif edl_on and side.exists():
            byclip[name] = json.loads(side.read_text())
        elif concat is not None:
            byclip[name] = concat[name]
        elif (run / "footage" / name / "words.json").exists():
            byclip[name] = json.loads((run / "footage" / name / "words.json").read_text())
    if not byclip:
        return None
    for c in clips:
        (run / "footage" / c["name"] / "words.json").write_text(json.dumps(byclip.get(c["name"], []), ensure_ascii=False))
    return byclip


def edl_plan(edl_file, clips, words_by_clip):
    """engine/edl.js (the one implementation of the cut, shared with the comp and the Estudio): normalized EDL, layout, audio plan, words."""
    import tempfile
    with tempfile.TemporaryDirectory() as td:
        bin_f, wb_f = Path(td) / "bin.json", Path(td) / "wb.json"
        bin_f.write_text(json.dumps([{"name": c["name"], "dur": c["dur"]} for c in clips]))
        cmd = ["node", ENGINE / "edl.js", "plan", edl_file, bin_f]
        if words_by_clip is not None:
            wb_f.write_text(json.dumps(words_by_clip))
            cmd.append(wb_f)
        r = subprocess.run([str(c) for c in cmd], capture_output=True, text=True)
        if r.returncode:
            sys.exit(f"edl.js failed: {r.stderr.strip()[-400:]}")
        plan = json.loads(r.stdout)
    if plan["errors"]:
        sys.exit("edl.json: " + "; ".join(plan["errors"]))
    for w in plan["warnings"] + [x["msg"] for x in plan["lint"]]:
        print(f"warning: edl: {w}")
    return plan


def edl_audio_chain(plan, clips, run, total):
    """ffmpeg inputs + filter graph for the cut: atrim per segment, 10 ms seam fades (crossfades / dip halves per the plan), adelay, amix.
    Muted segments (retimed with `speed`: their sound would lose lip sync) are skipped; if every segment is muted a silent source of the
    total length keeps amix/apad working."""
    ins, parts, labels = [], [], []
    for seg in plan["audio"]:
        if seg.get("muted"):
            continue
        i = len(labels)
        ins += ["-i", run / "footage" / seg["clip"] / "audio.wav"]
        f = f"[{i}:a]atrim=start={seg['in']:.4f}:end={seg['out']:.4f},asetpts=PTS-STARTPTS"
        for fd in seg["fades"]:
            f += f",afade=t={fd['type']}:st={fd['st']:.4f}:d={fd['d']:.4f}:curve={fd['curve']}"
        ms = int(round(seg["delay"] * 1000))
        parts.append(f"{f},adelay={ms}|{ms}[s{i}]")
        labels.append(f"[s{i}]")
    n = len(labels)
    if not n:
        ins += ["-f", "lavfi", "-t", f"{max(total, 0.1):.4f}", "-i", "anullsrc=r=48000:cl=stereo"]
        return ins, f"[0:a]atrim=duration={max(total, 0.1):.4f},apad=whole_dur={total:.4f}", 1
    parts.append("".join(labels) + f"amix=inputs={n}:normalize=0:duration=longest,apad=whole_dur={total:.4f}")
    return ins, ";".join(parts), n


CORE_MOTION_TYPES = {"keywordPop", "wordStack", "counterBadge", "tagPill", "toast", "panel", "chatBubbles",
                     "dimensionLine", "specCard", "onomatopoeia", "highlightWords", "productCard", "productPop", "carousel"}


LIB_LOCAL = None  # <comp>/motion-lib when the comp brings its own element types (registered for this video only); set by main()


def lib_run(*args):
    """Ask the motion library registry (engine/motion-lib/cli.mjs) - the only place that knows the library element types.
    With a comp-local folder (LIB_LOCAL) its elements are registered too and must pass the library contract test first."""
    extra = ["--local", str(LIB_LOCAL)] if LIB_LOCAL else []
    r = subprocess.run(["node", str(ENGINE / "motion-lib" / "cli.mjs"), *map(str, args), *extra], capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit(f"motion library: {(r.stderr or r.stdout).strip()[:400]}")
    out = json.loads(r.stdout)
    if out.get("localErrors"):
        lines = "\n".join(f"  - {e['file']}: {'; '.join(e['problems'])}" for e in out["localErrors"])
        sys.exit(f"Los elementos propios de este video ({LIB_LOCAL}) no cumplen el contrato de la librería; corrígelos antes de renderizar "
                 f"(guía: engine/motion-lib/_template.js y references/pantallas.md):\n{lines}")
    if out.get("loadErrors"):
        print(f"warning: motion library files with problems: {out['loadErrors']}")
    return out


_LIB_TYPES = None


def lib_types():
    """{type: {family, category, label}} of the motion library (cached)."""
    global _LIB_TYPES
    if _LIB_TYPES is None:
        _LIB_TYPES = lib_run("types")["types"]
    return _LIB_TYPES


def is_ui(el):
    """True for a product-screen element (family "ui" in the library): they need the ui skin."""
    return lib_types().get(el.get("type"), {}).get("family") == "ui"


def needs_skin(el):
    """True when the element reads the ui skin: product screens (family "ui") and elements that declare usesSkin."""
    t = lib_types().get(el.get("type"), {})
    return t.get("family") == "ui" or bool(t.get("usesSkin"))


def prepare_ui_skin(run, comp, motion):
    """ui-skin.json for the product-screen elements: the comp's own, else the run's, else the brand's (brands/<slug>/ui-skin.json).
    Copied into the comp; returns True when the comp has one. Nothing happens for comps without ui elements."""
    if not any(needs_skin(e) and not e.get("hidden") for e in motion):
        return False
    if (comp / "ui-skin.json").exists():
        return True
    cands = [run / "ui-skin.json"]
    try:
        cands.append(SKILL / "brands" / json.loads((run / "brand.json").read_text()).get("slug", "") / "ui-skin.json")
    except (OSError, ValueError):
        pass
    for c in cands:
        if c.is_file():
            shutil.copyfile(c, comp / "ui-skin.json")
            return True
    return False


def prepare_motion(path, run, comp, total, reuse=False):
    """Validate motion.json, copy it into the comp dir and extract each panel clip (video only) to footage/panel-*/."""
    src = Path(path).expanduser().resolve()
    els = json.loads(src.read_text())
    if not isinstance(els, list):
        sys.exit("motion.json must be a JSON list of elements")
    if src != (comp / "motion.json").resolve():  # the studio rebuilds from the comp's own motion.json
        shutil.copyfile(src, comp / "motion.json")
    panels = {}  # clip path -> (footage name, frames)
    lib_errors = {}  # motion-library elements are validated by their own descriptors (engine/motion-lib), never by a list kept here
    if any(isinstance(e, dict) and e.get("type") in lib_types() for e in els):
        for item in lib_run("check", src)["errors"]:
            lib_errors.setdefault(item["index"], []).append(item["message"])
    for i, el in enumerate(els):
        if el.get("type") not in CORE_MOTION_TYPES and el.get("type") not in lib_types():
            sys.exit(f"motion[{i}]: unknown type {el.get('type')!r} (expected one of {sorted(CORE_MOTION_TYPES | set(lib_types()))})")
        if lib_errors.get(i):
            sys.exit(lib_errors[i][0])
        if el["type"] == "highlightWords":
            if not el.get("words") or not all(isinstance(w, str) for w in el["words"]):
                sys.exit(f"motion[{i}] (highlightWords): needs 'words' (list of strings)")
            continue
        if el["type"] not in ("wordStack", "chatBubbles") and ("in" not in el or "out" not in el):
            sys.exit(f"motion[{i}] ({el['type']}): needs 'in' and 'out'")
        if el["type"] in ("wordStack", "chatBubbles") and ("out" not in el or not el.get("items")):
            sys.exit(f"motion[{i}] ({el['type']}): needs 'items' and 'out'")
        if el["type"] == "chatBubbles" and any(it.get("from") not in ("client", "rex") or "text" not in it for it in el["items"]):
            sys.exit(f"motion[{i}] (chatBubbles): items need 'from' ('client'|'rex'), 'text' and 'at'")
        if el["type"] == "dimensionLine":
            pt = lambda p: isinstance(p, dict) and "x" in p and "y" in p
            tr = el.get("track")
            if tr:
                if not all("t" in k and pt(k.get("from")) and pt(k.get("to")) for k in tr):
                    sys.exit(f"motion[{i}] (dimensionLine): track keys need 't', 'from' and 'to' ({{x,y}})")
            elif not (pt(el.get("from")) and pt(el.get("to"))):
                sys.exit(f"motion[{i}] (dimensionLine): needs 'from' and 'to' ({{x,y}} in canvas px) or a 'track'")
        if el["type"] == "specCard" and not (2 <= len(el.get("rows") or []) <= 4):
            sys.exit(f"motion[{i}] (specCard): needs 2-4 'rows'")
        if el["type"] == "onomatopoeia" and not el.get("text"):
            sys.exit(f"motion[{i}] (onomatopoeia): needs 'text'")
        if el["type"] in ("productCard", "productPop") and not el.get("product"):
            sys.exit(f"motion[{i}] ({el['type']}): needs 'product' (an id from products.json)")
        if el["type"] == "carousel":
            sl = el.get("slides")
            if not (isinstance(sl, list) and 2 <= len(sl) <= 8 and all(isinstance(x, dict) and x.get("product") for x in sl)):
                sys.exit(f"motion[{i}] (carousel): needs 2-8 'slides' ({{product, image?, caption?, price?}})")
        end = max(el.get("out", 0), *(it["at"] for it in el.get("items", []) if isinstance(it, dict) and "at" in it), 0)  # uiFeed items have no `at`
        if end > total + 1e-6:
            print(f"warning: motion[{i}] ({el['type']}) ends at {end}s, after the video ({total:.2f}s)")
        if el["type"] == "panel":
            clip = Path(el["clip"]).expanduser().resolve()
            if not clip.exists():
                sys.exit(f"motion[{i}]: panel clip not found: {clip}")
            if str(clip) not in panels:
                name = f"panel-{slug(clip.stem)}-{len(panels) + 1}"
                n, dur = extract(clip, run, name, audio=False, reuse=reuse)
                panels[str(clip)] = (name, n)
                print(f"panel clip {name}: {n} frames, {dur:.2f}s")
            name, n = panels[str(clip)]
            el["dir"] = f"../footage/{name}"
            el["n"] = n
    return els


def qa_sheet(comp):
    """RUN/<comp>/out/qa-layout.jpg: one QA frame per motion element (face box + element rects drawn), 4 per row, captioned."""
    frames = sorted((comp / "out" / "qa").glob("*.jpg"))
    rep = json.loads((comp / "layout-report.json").read_text())["elements"]
    rep = [e for e in rep if e["rect"]]
    if not frames:
        return
    try:
        from PIL import Image, ImageDraw
    except ImportError:
        print("warning: Pillow missing, skipping qa-layout.jpg (frames are in out/qa/)")
        return
    tw, th, cols = 324, 576, 4
    rows = -(-len(frames) // cols)
    sheet = Image.new("RGB", (cols * tw, rows * (th + 28)), (20, 20, 20))
    d = ImageDraw.Draw(sheet)
    for i, f in enumerate(frames):
        x, y = (i % cols) * tw, (i // cols) * (th + 28)
        sheet.paste(Image.open(f).convert("RGB").resize((tw, th)), (x, y + 28))
        e = rep[i] if i < len(rep) else {}
        d.text((x + 4, y + 4), f"{e.get('type','?')} {e.get('slot','')} t={e.get('qaTime','')}", fill=(255, 255, 255))
        d.text((x + 4, y + 15), f"face {e.get('faceOverlap')} zone {e.get('faceZoneOverlap')} hit {','.join(e.get('collidesWith', [])) or '-'}", fill=(255, 225, 77))
    sheet.save(comp / "out" / "qa-layout.jpg", quality=90)
    print(f"qa sheet -> {comp / 'out' / 'qa-layout.jpg'}")


def apply_cta_doc(a, comp):
    """<comp>/cta.json (written by the Estudio; absent = the --cta* flags as before): {enabled, title, subtitle, dur, logoVariant, bg}.
    enabled / title / subtitle / dur override the flags in place (so the total duration, the audio bed and logoUntil follow); enabled:true
    without --cta adds a card of `dur` (default 3 s). Returns (doc, command-line values) or (None, None)."""
    f = comp / "cta.json"
    if not f.exists():
        return None, None
    try:
        d = json.loads(f.read_text())
    except ValueError:
        sys.exit(f"{f}: no es JSON válido")
    if not isinstance(d, dict):
        sys.exit(f"{f}: debe ser un objeto")
    argv_vals = {"enabled": bool(a.cta), "title": a.cta_title, "subtitle": a.cta_subtitle, "dur": a.cta_dur}
    if "enabled" in d:
        a.cta = bool(d["enabled"])
    if d.get("title"):
        a.cta_title = str(d["title"])
    if d.get("subtitle") is not None and "subtitle" in d:
        a.cta_subtitle = str(d["subtitle"])
    if d.get("dur") is not None:
        try:
            dur = float(d["dur"])
        except (TypeError, ValueError):
            sys.exit(f"{f}: dur debe ser un número")
        if not 0.5 <= dur <= 10:
            sys.exit(f"{f}: dur fuera de rango (0.5 a 10 s)")
        a.cta_dur = dur
    return d, argv_vals


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--run", required=True)
    ap.add_argument("--clips", required=True, help="comma-separated clip paths, in order")
    ap.add_argument("--words")
    ap.add_argument("--words-by-clip", help="name=words.json,... per-clip source words (clip time) for an edl.json cut; default: <clip>.words.json next to the mp4")
    ap.add_argument("--hook")
    ap.add_argument("--hook-in", type=float, default=0.2)
    ap.add_argument("--hook-out", type=float, default=3.2)
    ap.add_argument("--cta", action="store_true")
    ap.add_argument("--cta-title"); ap.add_argument("--cta-subtitle", default="")
    ap.add_argument("--cta-dur", type=float, default=3.0)
    ap.add_argument("--music")
    ap.add_argument("--sfx-map", help="mix.py SFX map for motion events (default: assets/sfx/ui-map.json when --motion is used)")
    ap.add_argument("--captions-y", type=float, help="caption baseline y (default 1180); e.g. 1430 to clear a phone mockup")
    ap.add_argument("--captions-size", type=float)
    ap.add_argument("--logo-clips", type=int, help="show the logo bug only during the first N clips (default: all)")
    ap.add_argument("--cta-voice", help="voice-over (wav/mp3) placed at the start of the CTA card")
    ap.add_argument("--ai-label", action=argparse.BooleanOptionalAction, default=None,
                    help="force the in-video AI legend on/off (default: brand.json ai_label)")
    ap.add_argument("--reuse-footage", action="store_true",
                    help="skip frame extraction when footage/<clip> already matches the clip (fast re-renders after motion-only edits)")
    ap.add_argument("--mix-options", help="mix.py --options JSON (levels, fades, voice atempo, SFX mute/replace); written by the Estudio editor")
    ap.add_argument("--voice-wav", help="use this WAV as the voice bed for the mix/master instead of audio/clips.wav (Estudio voice takes; same length as the video)")
    ap.add_argument("--studio-build", action="store_true",
                    help="after a successful run, write <comp>/.studio/build.json (this command with absolute paths, --reuse-footage, "
                         "--motion <comp>/motion.json) so the Estudio editor can re-render the comp (engine/studio/README.md)")
    ap.add_argument("--motion", help="motion.json: list of motion-graphics elements (see engine/README.md)")
    ap.add_argument("--name", default="overlay")
    a = ap.parse_args()

    run = Path(a.run).resolve()
    if not (run / "brand.json").exists():
        sys.exit(f"missing {run / 'brand.json'} (copy brands/<brand>/brand.json with a real palette into the run)")
    comp = run / a.name
    comp.mkdir(parents=True, exist_ok=True)
    global LIB_LOCAL
    LIB_LOCAL = comp / "motion-lib" if (comp / "motion-lib").is_dir() and any((comp / "motion-lib").glob("*.js")) else None
    cta_doc, cta_argv = apply_cta_doc(a, comp)

    clips, t0, used, paths = [], 0.0, set(), {}
    for i, c in enumerate(x.strip() for x in a.clips.split(",") if x.strip()):
        p = Path(c).expanduser().resolve()
        if not p.exists():
            sys.exit(f"clip not found: {p}")
        name = slug(p.stem)
        if name in used:
            name = f"{name}-{i + 1}"
        used.add(name)
        paths[name] = p
        n, dur = extract(p, run, name, reuse=a.reuse_footage)
        faces = track_faces(p, run, name, n)
        clips.append({"name": name, "start": round(t0, 4), "dur": round(dur, 4), "n": n,
                      "faces": {"source": faces["source"], "step": faces.get("step", 3), "samples": faces["samples"]}})
        t0 += dur
        print(f"clip {name}: {n} frames, {dur:.2f}s")
    clips_end = round(t0, 4)
    # edl.json (engine/edl.js): the cut. Absent = clips back to back, exactly as before. CONFIG.clips stays the bin of available clips.
    plan, edl_cfg, wbc = None, None, None
    edl_file = comp / "edl.json"
    if edl_file.exists():
        wbc = source_words(a, run, comp, clips, paths, True)
        plan = edl_plan(edl_file, clips, wbc)
        edl_cfg = plan["edl"]
        clips_end = round(plan["duration"], 4)
        print(f"edl: {len(edl_cfg['segments'])} segments, {clips_end:.2f}s (bin: {len(clips)} clips)")
        if a.voice_wav:
            print("warning: --voice-wav is ignored while edl.json exists (voice takes are aligned to the uncut clips); the cut clip audio is used")
            a.voice_wav = None
    elif a.words or a.words_by_clip:
        wbc = source_words(a, run, comp, clips, paths, False)  # also stash per-clip words so the Estudio can start an EDL later
    total = clips_end + (a.cta_dur if a.cta else 0)

    motion = prepare_motion(a.motion, run, comp, total, a.reuse_footage) if a.motion else []

    logo_until = (clips[a.logo_clips - 1]["start"] + clips[a.logo_clips - 1]["dur"]) if a.logo_clips else None
    if plan is not None and a.logo_clips:  # with a cut: until the last segment that uses one of the first N clips ends
        first = {c["name"] for c in clips[:a.logo_clips]}
        logo_until = max((s["end"] for s in plan["segs"] if s["clip"] in first), default=None)
    cfg = {"clips": clips, "words": bool(a.words) or bool(wbc), "duration": round(total, 4),
           "hook": {"text": a.hook, "inAt": a.hook_in, "outAt": min(a.hook_out, clips_end)} if a.hook else None,
           "cta": {"at": clips_end, "dur": a.cta_dur, "title": a.cta_title, "subtitle": a.cta_subtitle} if a.cta else None,
           "captions": {k: v for k, v in (("y", a.captions_y), ("size", a.captions_size)) if v is not None},
           "logoUntil": logo_until,
           "aiLabel": a.ai_label, "motion": motion}
    if edl_cfg:
        cfg["edl"] = edl_cfg
    if cta_doc is not None:  # cta.json already overrode the --cta-* values above; the comp keeps the command-line ones as the live fallback
        cfg["ctaArgv"] = cta_argv
        for k in ("bg", "logoVariant"):
            if cfg["cta"] and cta_doc.get(k):
                cfg["cta"][k] = cta_doc[k]
    # Optional comp files written by the Estudio editor (engine/studio): platform zones, caption overrides and the logo bug.
    for flag, name in (("zonesFile", "zones.json"), ("captionsFile", "captions.json"), ("logoFile", "logo.json")):
        if (comp / name).exists():
            cfg[flag] = True
    if prepare_ui_skin(run, comp, motion):
        cfg["uiSkinFile"] = True
    if LIB_LOCAL:  # comp-local element types: the page registers them before planning (engine/motion-lib/index.js loadLocal)
        cfg["localLib"] = True
    if (run / "products.json").exists():  # RUN-level product catalog (engine/studio/products.mjs): images for productCard / productPop / carousel
        cfg["productsFile"] = True
    if plan is not None and wbc:
        (comp / "words.json").write_text(json.dumps(plan["words"], ensure_ascii=False))
    elif a.words and Path(a.words).resolve() != (comp / "words.json").resolve():
        shutil.copyfile(a.words, comp / "words.json")
    elif wbc and not (comp / "words.json").exists():  # --words-by-clip without an edl: the clips back to back
        (comp / "words.json").write_text(json.dumps(sorted((w for c in clips for w in ({**x, "start": round(x["start"] + c["start"], 3), "end": round(x["end"] + c["start"], 3)} for x in wbc.get(c["name"], []))), key=lambda w: w["start"]), ensure_ascii=False))
    html = (ENGINE / "templates" / "overlay.html").read_text().replace("/*CONFIG*/ {}", json.dumps(cfg, ensure_ascii=False))
    (comp / "index.html").write_text(html)

    # Audio bed: clip audios back to back (+ silence under the CTA card).
    audio_dir = comp / "audio"
    audio_dir.mkdir(exist_ok=True)
    if plan is not None:
        ins, chain, n_in = edl_audio_chain(plan, clips, run, total)
    else:
        ins = [x for c in clips for x in ("-i", run / "footage" / c["name"] / "audio.wav")]
        chain = "".join(f"[{i}:a]" for i in range(len(clips))) + f"concat=n={len(clips)}:v=0:a=1,apad=whole_dur={total:.4f}"
        n_in = len(clips)
    if a.cta and a.cta_voice:
        # Lay the CTA voice-over under the card: delay it to clips_end and sum it with the clip bed.
        ins += ["-i", Path(a.cta_voice).expanduser().resolve()]
        ms = int(round((clips_end + 0.15) * 1000))
        chain = (chain + "[bed];" + f"[{n_in}:a]aresample=48000,aformat=channel_layouts=stereo,adelay={ms}|{ms}[cv];"
                 + f"[bed][cv]amix=inputs=2:normalize=0:duration=first")
    voice = audio_dir / "clips.wav"
    sh(["ffmpeg", "-v", "error", "-y", *ins, "-filter_complex", chain, "-ar", "48000", "-ac", "2", "-c:a", "pcm_s16le", voice])

    if a.voice_wav:
        voice = Path(a.voice_wav).expanduser().resolve()
    render = ["node", ENGINE / "render.mjs", comp / "index.html"]
    out = comp / "out"
    if motion:
        sh([*render, "qa"])
        qa_sheet(comp)
    # The video is encoded WITHOUT audio: `render v` would otherwise mux whatever out/mix.wav is lying around (with -shortest) and a
    # leftover mix.wav from an earlier run changed the encoded video length, so a clean out/ gave a different mp4. The audio of this
    # render (the fresh mix.wav or master.wav) is only added by the final `mux` below.
    sh([*render, "v", "--no-audio"])
    use_mix = bool(a.music)
    if a.music:
        sh([*render, "events"])
    elif (comp / "sfx.json").exists():  # no music, but the user placed / edited sound effects: mix them over the voice
        sh([*render, "events"])
        use_mix = has_sfx_events(comp / "sfx.json", out / "events.json", a.mix_options)
        if not use_mix:
            print("sfx.json has no sounds to play: the voice is mastered alone")
    if use_mix:
        sfx_map = a.sfx_map or (SKILL / "assets" / "sfx" / "ui-map.json" if a.motion else None)
        extra = ["--sfx-map", Path(sfx_map).resolve(), "--pan-width", "0.5"] if sfx_map else []
        sh([sys.executable, SKILL / "scripts" / "mix.py", comp, *(["--music", Path(a.music).resolve()] if a.music else ["--no-music"]), "--voice", voice,
            "--events", out / "events.json", *extra, *(["--options", Path(a.mix_options).resolve()] if a.mix_options else []),
            *(["--sfx-doc", comp / "sfx.json"] if (comp / "sfx.json").exists() else [])])
        audio = out / "mix.wav"
    else:
        audio = audio_dir / "master.wav"
        sh(["ffmpeg", "-v", "error", "-y", "-i", voice, "-af", "loudnorm=I=-14:TP=-1:LRA=11", "-ar", "48000", "-c:a", "pcm_s16le", audio])
    sh([*render, "mux", "--audio", audio])
    print(f"final -> {out / (a.name + '-final.mp4')}")
    if a.studio_build:
        write_studio_build(a, run, comp)


def has_sfx_events(sfx_doc, events_file, mix_options=None):
    """True when sfx.json leaves at least one sound to play: an automatic event not muted by it (or an added one), unless the mix options
    switch every SFX off. Uses engine/sfx-doc.js (the one merge implementation); a broken sfx.json counts as nothing to play."""
    try:
        if mix_options and (json.loads(Path(mix_options).read_text()).get("sfx") or {}).get("enabled") is False:
            return False
        js = ("import {mergeSfx} from __SFXDOC__; import fs from 'node:fs';"
              "const ev=JSON.parse(fs.readFileSync(process.argv[1],'utf8')).events??[];"
              "console.log(mergeSfx(ev,JSON.parse(fs.readFileSync(process.argv[2],'utf8'))).filter(r=>!r.muted).length)")
        r = subprocess.run(["node", "--input-type=module", "-e", js.replace("__SFXDOC__", json.dumps((ENGINE / "sfx-doc.js").as_uri())), str(events_file), str(sfx_doc)],
                           capture_output=True, text=True, check=True)
        return int(r.stdout.strip() or 0) > 0
    except (OSError, ValueError, subprocess.CalledProcessError):
        print("warning: sfx.json could not be read; it is ignored")
        return False


PATH_OPTS = {"--run", "--words", "--music", "--sfx-map", "--cta-voice", "--motion", "--voice-wav", "--mix-options"}


def write_studio_build(a, run, comp):
    """<comp>/.studio/build.json: the command that rebuilds this comp (absolute paths; motion from the comp's own motion.json;
    --reuse-footage so motion-only edits skip frame extraction). Written by the CLI, only read by engine/studio/server.mjs."""
    args, argv = [], sys.argv[1:]
    i = 0
    while i < len(argv):
        k = argv[i]
        if k in ("--studio-build", "--reuse-footage"):
            i += 1
            continue
        if k in PATH_OPTS and i + 1 < len(argv):
            args += [k, str(Path(argv[i + 1]).expanduser().resolve())]
            i += 2
        elif k == "--words-by-clip" and i + 1 < len(argv):
            pairs = [x.partition("=") for x in argv[i + 1].split(",") if x.strip()]
            args += [k, ",".join(f"{n.strip()}={Path(v.strip()).expanduser().resolve()}" for n, _, v in pairs)]
            i += 2
        elif k == "--clips" and i + 1 < len(argv):
            args += [k, ",".join(str(Path(c.strip()).expanduser().resolve()) for c in argv[i + 1].split(",") if c.strip())]
            i += 2
        else:
            args.append(k)
            i += 1
    for key, val in (("--run", run), ("--name", comp.name)):
        if key not in args:
            args += [key, str(val)]
    if "--motion" in args:
        args[args.index("--motion") + 1] = str(comp / "motion.json")
    d = comp / ".studio"
    d.mkdir(exist_ok=True)
    (d / "build.json").write_text(json.dumps({"argv": ["python3", str(Path(__file__).resolve()), *args, "--reuse-footage"]}, indent=1, ensure_ascii=False))
    print(f"studio build -> {d / 'build.json'}")


if __name__ == "__main__":
    main()
