#!/usr/bin/env python3
"""Helper of the Estudio media upload (engine/studio/media.mjs). Every mode prints ONE JSON object on stdout (exit code 0 unless it
crashed; failures are {"ok": false, "error": "<Spanish message>"}). Run isolated:  python3 -I media_prepare.py <mode> ...

  probe-video FILE          ffprobe: decodable video, duration (0 < d <= 600 s), size, fps, has audio.
  probe-audio FILE          ffprobe: decodable audio-only file, duration.
  image FILE                Pillow: decodes the whole image, returns format/size. (format must be PNG, JPEG or WEBP)
  to-wav IN OUT             any decodable audio -> WAV 48 kHz stereo 16-bit (so mix.py, soundfile and Web Audio all read it).
  image-clip IN OUT [--dur 8]   8 s silent 1080x1920 cover clip (30 fps) with a gentle Ken-Burns zoom; falls back to a static loop.
  clip --run RUN --file FILE [--name NAME]   extracts frames (1080x1920 cover, 30 fps) + audio.wav into RUN/footage/<name>/ and tracks
                            faces with scripts/overlay.py's own extract() / track_faces(), so the footage stamps match a later
                            `overlay.py --reuse-footage` build. NAME defaults to overlay.slug(file stem). A sidecar <file stem>.words.json
                            is copied to footage/<name>/words.json; without it an empty words.json is written (silent B-roll; it also
                            keeps overlay.py from re-deriving per-clip words from the comp's words.json).
                            -> {ok, name, n, dur, faces:{source, step, samples}}
"""
import argparse, importlib.util, io, json, shutil, subprocess, sys
from contextlib import redirect_stdout
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import encoding  # noqa: E402

HERE = Path(__file__).resolve().parent
MAX_VIDEO_S = 600
MAX_PIXELS = 60_000_000


def fail(msg, **kw):
    return {"ok": False, "error": msg, **kw}


def ffprobe(path):
    r = subprocess.run(["ffprobe", "-v", "error", "-show_format", "-show_streams", "-of", "json", str(path)], capture_output=True, text=True)
    if r.returncode:
        return None
    try:
        return json.loads(r.stdout)
    except ValueError:
        return None


def fps_of(stream):
    num, _, den = str(stream.get("avg_frame_rate") or stream.get("r_frame_rate") or "0/1").partition("/")
    try:
        v = float(num) / float(den or 1)
    except (ValueError, ZeroDivisionError):
        v = 0.0
    return round(v, 3)


def real_video(streams):
    return [s for s in streams if s.get("codec_type") == "video" and not (s.get("disposition") or {}).get("attached_pic")]


def probe_video(path):
    info = ffprobe(path)
    bad = fail("Este archivo no es un video que se pueda leer. Prueba con un MP4 o MOV.")
    if not info:
        return bad
    vs = real_video(info.get("streams", []))
    if not vs:
        if any(s.get("codec_type") == "audio" for s in info.get("streams", [])):
            return fail("Este archivo es solo audio, no tiene imagen. Súbelo como música o sonido.")
        return bad
    v = vs[0]
    fmt = info.get("format", {}).get("format_name", "")
    if "image2" in fmt or v.get("codec_name") in ("png", "mjpeg", "webp", "gif") and float(info["format"].get("duration") or 0) == 0:
        return fail("Este archivo es una imagen, no un video. Súbelo como imagen.")
    try:
        dur = float(info["format"].get("duration") or v.get("duration") or 0)
    except (TypeError, ValueError):
        dur = 0.0
    if not dur > 0:
        return bad
    if dur > MAX_VIDEO_S:
        return fail(f"El video dura más de {MAX_VIDEO_S // 60} minutos. Recórtalo y vuelve a subirlo.")
    w, h = int(v.get("width") or 0), int(v.get("height") or 0)
    if w < 16 or h < 16:
        return bad
    return {"ok": True, "duration": round(dur, 3), "width": w, "height": h, "fps": fps_of(v), "hasAudio": any(s.get("codec_type") == "audio" for s in info["streams"]), "container": fmt}


def probe_audio(path):
    info = ffprobe(path)
    bad = fail("El audio no se puede leer. Prueba con un archivo WAV, MP3 o M4A.")
    if not info:
        return bad
    streams = info.get("streams", [])
    if not any(s.get("codec_type") == "audio" for s in streams):
        return bad
    if real_video(streams):
        return fail("Este archivo trae video, no solo audio. Súbelo como video.")
    try:
        dur = float(info["format"].get("duration") or 0)
    except (TypeError, ValueError):
        dur = 0.0
    if not dur > 0:
        return bad
    return {"ok": True, "duration": round(dur, 3)}


def check_image(path):
    try:
        from PIL import Image
    except ImportError:
        return fail("Falta Pillow para revisar imágenes.")
    bad = fail("La imagen está dañada o no se puede abrir.")
    try:
        Image.MAX_IMAGE_PIXELS = None
        with Image.open(path) as im:
            fmt, (w, h) = im.format, im.size
            if w * h > MAX_PIXELS:
                return fail("La imagen es demasiado grande (más de 60 megapíxeles). Redúcela y vuelve a subirla.")
            im.load()
    except Exception:
        return bad
    if fmt not in ("PNG", "JPEG", "WEBP"):
        return fail("La imagen debe ser PNG, JPG o WEBP.")
    if min(w, h) < 16:
        return fail("La imagen es demasiado pequeña.")
    return {"ok": True, "format": fmt, "width": w, "height": h}


def to_wav(src, dst):
    r = subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(src), "-vn", "-ar", "48000", "-ac", "2", "-c:a", "pcm_s16le", str(dst)], capture_output=True, text=True)
    if r.returncode or not Path(dst).exists():
        return fail("El audio no se puede leer. Prueba con un archivo WAV, MP3 o M4A.")
    info = probe_audio(dst)
    return {**info, "ok": True} if info.get("ok") else info


def image_clip(src, dst, dur=8.0):
    """Still -> `dur` s clip. EXIF orientation is applied with Pillow first (ffmpeg ignores it for stills)."""
    from PIL import Image, ImageOps
    Image.MAX_IMAGE_PIXELS = None
    tmp = Path(str(dst) + ".src.png")
    try:
        with Image.open(src) as im:
            ImageOps.exif_transpose(im).convert("RGB").save(tmp, "PNG")
        frames = int(round(dur * 30))
        enc = ["-t", f"{dur}", "-r", "30", "-pix_fmt", "yuv420p", *encoding.video_codec_args(), "-an", "-movflags", "+faststart"]
        cover = "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920"
        # pre-scale 2x so the zoom does not shimmer, then ease from 1.0 to 1.08 over the clip, centred
        zoom = f"scale=2160:3840:force_original_aspect_ratio=increase,crop=2160:3840,zoompan=z='1+0.08*on/{frames}':d={frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920:fps=30"
        for vf in (zoom, f"{cover},fps=30"):
            r = subprocess.run(["ffmpeg", "-v", "error", "-y", "-loop", "1", "-i", str(tmp), "-vf", vf, *enc, str(dst)], capture_output=True, text=True)
            if r.returncode == 0 and Path(dst).exists() and Path(dst).stat().st_size > 0:
                return {"ok": True, "kenburns": vf is zoom}
        return fail("No se pudo preparar la imagen como clip de video.")
    finally:
        tmp.unlink(missing_ok=True)


def load_overlay():
    spec = importlib.util.spec_from_file_location("estudio_overlay", HERE / "overlay.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def prepare_clip(run, file, name=None):
    ov = load_overlay()
    run, file = Path(run).resolve(), Path(file).resolve()
    name = name or ov.slug(file.stem)
    with redirect_stdout(io.StringIO()):  # overlay's own progress prints are not part of our JSON
        n, dur = ov.extract(file, run, name, reuse=True)
        faces = ov.track_faces(file, run, name, n)
    fdir = run / "footage" / name
    side = file.with_name(file.stem + ".words.json")
    if side.exists():
        shutil.copyfile(side, fdir / "words.json")
    elif not (fdir / "words.json").exists():
        (fdir / "words.json").write_text("[]", encoding="utf-8")
    return {"ok": True, "name": name, "n": n, "dur": round(dur, 4), "faces": {"source": faces["source"], "step": faces.get("step", 3), "samples": faces["samples"]}}


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="mode", required=True)
    for m in ("probe-video", "probe-audio", "image"):
        sub.add_parser(m).add_argument("file")
    p = sub.add_parser("to-wav"); p.add_argument("src"); p.add_argument("dst")
    p = sub.add_parser("image-clip"); p.add_argument("src"); p.add_argument("dst"); p.add_argument("--dur", type=float, default=8.0)
    p = sub.add_parser("clip"); p.add_argument("--run", required=True); p.add_argument("--file", required=True); p.add_argument("--name")
    a = ap.parse_args()
    try:
        if a.mode == "probe-video":
            out = probe_video(a.file)
        elif a.mode == "probe-audio":
            out = probe_audio(a.file)
        elif a.mode == "image":
            out = check_image(a.file)
        elif a.mode == "to-wav":
            out = to_wav(a.src, a.dst)
        elif a.mode == "image-clip":
            out = image_clip(a.src, a.dst, a.dur)
        else:
            out = prepare_clip(a.run, a.file, a.name)
    except subprocess.CalledProcessError as e:
        out = fail(f"No se pudo preparar el archivo ({(e.stderr or b'').decode(errors='ignore')[-200:] if isinstance(e.stderr, bytes) else (e.stderr or '')[-200:]})")
    except Exception as e:  # noqa: BLE001 - always answer with JSON
        out = fail(f"No se pudo preparar el archivo ({type(e).__name__}: {e})")
    print(json.dumps(out, ensure_ascii=False))


if __name__ == "__main__":
    main()
