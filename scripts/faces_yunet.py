#!/usr/bin/env python3
"""Face tracking for platforms without Apple Vision (Windows, Linux): OpenCV FaceDetectorYN (YuNet ONNX).

Writes the same JSON document as scripts/faces.swift (Apple Vision, macOS), with source tag "yunet" added by overlay.py:
  {"version":1,"n":394,"step":3,"fps":30,"detected":N,"samples":[{"f":1,"face":[x,y,w,h]|null,"person":null}, ...]}
Boxes are in 1080x1920 canvas pixels (top-left origin) and use the same cover fit as faces.swift. The largest face wins.
YuNet detects faces only, so "person" is always null (layout.js already accepts null: Vision emits it when no body is found).

  python faces_yunet.py <frames-dir> [--step 3] [--out faces.json]     (stand-alone, same flags as faces.swift)

The model (~230 KB, MIT, opencv_zoo) is downloaded once into paths.model_dir() and checked against a pinned sha256; it is never
committed. Needs opencv-python-headless (scripts/requirements.txt, non-darwin marker). This module imports cv2 lazily, so the
download helpers work from a stdlib-only interpreter (setup_python.py).
"""
import argparse, hashlib, json, math, os, shutil, sys, urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import paths  # noqa: E402

# Pinned to a commit of opencv/opencv_zoo (not "main"), so the file behind the sha256 can never change under us.
MODEL_NAME = "face_detection_yunet_2023mar.onnx"
MODEL_URL = ("https://github.com/opencv/opencv_zoo/raw/f12e12798e8314f7c074a6656816c048dcc95b7a/"
             "models/face_detection_yunet/face_detection_yunet_2023mar.onnx")
MODEL_SHA256 = "8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4"
CW, CH = 1080.0, 1920.0
SCORE_THRESHOLD = 0.6  # YuNet detection confidence (its own default is 0.9, which misses small or profile faces)
NMS_THRESHOLD = 0.3
TOP_K = 5000


def model_path():
    return paths.model_dir() / MODEL_NAME


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 16), b""):
            h.update(chunk)
    return h.hexdigest()


def ensure_model(download=True):
    """Path to the verified YuNet model; downloads it on first use (download=False only checks). Raises on any failure."""
    p = model_path()
    if p.exists() and sha256_file(p) == MODEL_SHA256:
        return p
    if not download:
        raise FileNotFoundError(f"YuNet model missing: {p}")
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_name(p.name + ".part")
    with urllib.request.urlopen(MODEL_URL, timeout=120) as r, open(tmp, "wb") as f:
        shutil.copyfileobj(r, f)
    got = sha256_file(tmp)
    if got != MODEL_SHA256:
        tmp.unlink(missing_ok=True)
        raise ValueError(f"YuNet model checksum mismatch (got {got[:12]}..., expected {MODEL_SHA256[:12]}...)")
    os.replace(tmp, p)
    return p


def _round(v):
    # Swift's .rounded() (half away from zero); all values here are >= 0 after clamping.
    return int(math.floor(v + 0.5))


def to_canvas(x, y, w, h, iw, ih):
    """Pixel box (top-left origin) in an iw x ih frame -> [x, y, w, h] on the 1080x1920 canvas with the cover fit
    (identical to toCanvas() in faces.swift; frames from overlay.extract() are already cover-fitted, so k == 1 there)."""
    k = max(CW / iw, CH / ih)
    ox, oy = (CW - iw * k) / 2, (CH - ih * k) / 2
    x0, y0 = x * k + ox, y * k + oy
    x1, y1 = x0 + w * k, y0 + h * k
    cx0, cy0 = max(0.0, x0), max(0.0, y0)
    cx1, cy1 = min(CW, x1), min(CH, y1)
    return [_round(cx0), _round(cy0), _round(max(0.0, cx1 - cx0)), _round(max(0.0, cy1 - cy0))]


def detect(frames_dir, step=3, model=None):
    """Run YuNet on every `step`-th frame (1-based f: 1, 1+step, ...) of <frames-dir>/*.jpg. Returns the faces.swift document."""
    import cv2  # lazy: only the detection needs OpenCV
    files = sorted(f for f in os.listdir(frames_dir) if f.lower().endswith(".jpg"))
    if not files:
        raise ValueError(f"no jpg frames in {frames_dir}")
    step = max(1, int(step))
    det = cv2.FaceDetectorYN.create(str(model or ensure_model()), "", (int(CW), int(CH)), SCORE_THRESHOLD, NMS_THRESHOLD, TOP_K)
    samples, hits = [], 0
    for idx in range(0, len(files), step):
        entry = {"f": idx + 1, "face": None, "person": None}
        img = cv2.imread(os.path.join(frames_dir, files[idx]))
        if img is not None:
            ih, iw = img.shape[:2]
            det.setInputSize((iw, ih))
            _, faces = det.detect(img)
            if faces is not None and len(faces):
                # rows: x, y, w, h, 10 landmark coords, score
                best = max(faces, key=lambda r: float(r[2]) * float(r[3]))
                entry["face"] = to_canvas(float(best[0]), float(best[1]), float(best[2]), float(best[3]), iw, ih)
                hits += 1
        samples.append(entry)
    return {"version": 1, "n": len(files), "step": step, "fps": 30, "detected": hits, "samples": samples}


def main(argv=None):
    ap = argparse.ArgumentParser(description="YuNet face boxes for a folder of 1080x1920 frames (faces.swift output schema).")
    ap.add_argument("frames_dir")
    ap.add_argument("--step", type=int, default=3)
    ap.add_argument("--out")
    a = ap.parse_args(argv)
    doc = detect(a.frames_dir, a.step)
    text = json.dumps(doc, sort_keys=True)
    if a.out:
        Path(a.out).write_text(text, encoding="utf-8")
    else:
        sys.stdout.write(text)
    print(f"faces: {doc['detected']}/{len(doc['samples'])} samples with a face", file=sys.stderr)


if __name__ == "__main__":
    main()
