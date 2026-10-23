#!/usr/bin/env python3
"""Remove the background of a product photo (free, local, CPU; macOS and Windows).  Always prints ONE JSON object on stdout.

  python -I cutout.py --in IMG --out-dir DIR [--model isnet-general-use] [--check-only ALPHA_PNG]

Uses rembg (ONNX runtime, CPU). Model weights are downloaded once (free, GitHub releases) into paths.model_dir() (U2NET_HOME), a
per-user data dir, so a fresh install needs network only for the first cutout.
Model: `isnet-general-use` (IS-Net, ~170 MB): good on arbitrary objects (furniture, bottles, boxes), ~2-4 s per photo on a laptop CPU.
`birefnet-general-lite` (~224 MB) gives finer edges but is several times slower on CPU; pick it with --model when edges matter more.

Output: PNG with alpha, transparent margin trimmed (+ a small pad), content-addressed in DIR as <sha8>.png (never overwrites).
-> {ok, error, file, sha8, width, height, model, seconds, warnings[], stats:{coverage, holes, edge_px}}
Quality checks (Spanish warnings, never blocking): mask covers < 5 % or > 95 % of the photo, hard holes inside the product,
very soft edges (average semi-transparent band wider than 5 px).
"""
import argparse, hashlib, io, json, os, sys, time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import paths  # noqa: E402

DEFAULT_MODEL = "isnet-general-use"
MIN_COVER, MAX_COVER = 0.05, 0.95
HOLE_MIN_FRAC = 0.003  # a transparent island must cover >= 0.3 % of the photo to count as a hole
SOFT_EDGE_PX = 5.0


def quality(alpha):
    """alpha: numpy uint8 HxW. -> (warnings, stats). Pure function (tested with synthetic masks)."""
    import numpy as np
    h, w = alpha.shape
    total = float(h * w)
    solid = alpha > 127
    coverage = float(solid.sum()) / total
    warnings = []
    if coverage < MIN_COVER:
        warnings.append(f"casi no se detectó el producto (ocupa {coverage * 100:.0f} % de la foto). Prueba con otra foto o usa la original.")
    elif coverage > MAX_COVER:
        warnings.append(f"casi no se quitó fondo (el producto ocupa {coverage * 100:.0f} % de la foto). Si el producto llena toda la foto, usa la original.")
    holes = 0
    edge_px = 0.0
    try:
        from scipy import ndimage
        lab, n = ndimage.label(alpha < 64)
        if n:
            sizes = ndimage.sum(np.ones_like(lab), lab, index=range(1, n + 1))
            border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]])).tolist())
            for i, sz in enumerate(sizes, start=1):
                if i not in border and sz / total >= HOLE_MIN_FRAC:
                    holes += 1
        er = ndimage.binary_erosion(solid)
        perimeter = float((solid & ~er).sum())
        soft = float(((alpha > 16) & (alpha < 240)).sum())
        edge_px = soft / perimeter if perimeter else 0.0
    except ImportError:
        pass
    if holes:
        warnings.append(f"el recorte tiene {holes} hueco{'s' if holes > 1 else ''} dentro del producto (zonas que se volvieron transparentes). Revisa la vista previa o usa la original.")
    if edge_px > SOFT_EDGE_PX:
        warnings.append("los bordes del recorte quedaron muy suaves o borrosos; sobre el video puede verse un halo. Usa la original si se nota.")
    return warnings, {"coverage": round(coverage, 4), "holes": holes, "edge_px": round(edge_px, 2)}


def fail(msg, **extra):
    return {"ok": False, "error": msg, "warnings": [], **extra}


def run(path, out_dir, model):
    t0 = time.time()
    os.environ.setdefault("U2NET_HOME", str(paths.model_dir()))
    paths.model_dir().mkdir(parents=True, exist_ok=True)
    try:
        import numpy as np
        from PIL import Image, ImageOps
    except ImportError:
        return fail("falta Pillow/numpy en este Python: crea el entorno del skill con scripts/setup_python.py.", missing_deps=True)
    try:
        from rembg import new_session, remove
    except ImportError:
        return fail("falta rembg en este Python: crea el entorno del skill con scripts/setup_python.py.", missing_deps=True)
    try:
        im = Image.open(path)
        im.load()
        im = ImageOps.exif_transpose(im).convert("RGB")
    except Exception:
        return fail("no se pudo abrir la foto.")
    if max(im.size) > 2048:
        k = 2048 / max(im.size)
        im = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
    try:
        sess = new_session(model, providers=["CPUExecutionProvider"])
    except Exception as e:  # first run without network, unknown model...
        return fail(f"no se pudo cargar el modelo de recorte ({model}): {str(e).splitlines()[-1][:160]}. La primera vez necesita internet para bajarlo.")
    try:
        out = remove(im, session=sess, post_process_mask=True)
    except Exception as e:
        return fail(f"falló el recorte: {str(e).splitlines()[-1][:160]}")
    out = out.convert("RGBA")
    alpha = np.asarray(out.getchannel("A"))
    warnings, stats = quality(alpha)
    bbox = out.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox()
    if bbox is None:
        return fail("no se encontró ningún producto en la foto.", stats=stats)
    pad = max(4, round(max(out.size) * 0.01))
    box = (max(0, bbox[0] - pad), max(0, bbox[1] - pad), min(out.width, bbox[2] + pad), min(out.height, bbox[3] + pad))
    out = out.crop(box)
    buf = io.BytesIO()
    out.save(buf, "PNG", optimize=True)
    data = buf.getvalue()
    sha8 = hashlib.sha256(data).hexdigest()[:8]
    os.makedirs(out_dir, exist_ok=True)
    dest = os.path.join(out_dir, f"{sha8}.png")
    if not os.path.exists(dest):
        tmp = f"{dest}.{os.getpid()}.tmp"
        with open(tmp, "wb") as f:
            f.write(data)
        os.replace(tmp, dest)
    return {"ok": True, "error": None, "warnings": warnings, "stats": stats, "width": out.width, "height": out.height, "sha8": sha8,
            "file": os.path.basename(dest), "bytes": len(data), "model": model, "seconds": round(time.time() - t0, 2)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="inp")
    ap.add_argument("--out-dir")
    ap.add_argument("--model", default=DEFAULT_MODEL)
    ap.add_argument("--check-only", help="quality checks on an existing RGBA PNG (no model, no output file)")
    a = ap.parse_args()
    if a.check_only:
        import numpy as np
        from PIL import Image
        alpha = np.asarray(Image.open(a.check_only).convert("RGBA").getchannel("A"))
        w, st = quality(alpha)
        print(json.dumps({"ok": True, "warnings": w, "stats": st}, ensure_ascii=False))
        return
    if not a.inp or not a.out_dir:
        sys.exit("usage: cutout.py --in IMG --out-dir DIR [--model NAME]")
    print(json.dumps(run(a.inp, a.out_dir, a.model), ensure_ascii=False))


if __name__ == "__main__":
    main()
