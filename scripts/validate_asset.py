#!/usr/bin/env python3
"""Validate / normalize image assets (logos) for the Estudio. Always prints one JSON object on stdout; exit code 0 unless it crashed.
Run it isolated:  python3 -I validate_asset.py ...   (needs Pillow; the Estudio finds a python that has it)

  --process IN --out-dir DIR [--cta-bg light|dark]
        Upload path. Accepts PNG / JPEG / WebP by magic bytes only (SVG and anything else is rejected), decodes the whole file,
        rejects > 40 MP or < 64 px on the shortest side, trims fully transparent padding, downscales the longest side to <= 1024 px
        and re-encodes as PNG written content-addressed to DIR/logo-<sha8>.png (never overwrites: same bytes -> same name).
        -> {ok, error, warnings[], width, height, alpha, lum, sha8, file, bytes, format}
  --process-product IN --out-dir DIR
        Product photo upload (Estudio "Productos"): same content sniffing and size limits, EXIF orientation applied, converted to sRGB
        (embedded ICC profile honoured), longest side downscaled to <= 2048 px, alpha kept as PNG, opaque photos re-encoded as JPEG q90.
        Written content-addressed to DIR/<sha8>.png|jpg (never overwrites). Rejects < 64 px; warns below 600 px (soft on a phone).
        -> {ok, error, warnings[], width, height, alpha, sha8, file, bytes, format}
  --check FILE [FILE ...] [--cta-bg light|dark]
        Preflight path: decodes each existing asset (no output file). -> {files:[{path, ok, error, warnings[], width, height, alpha, lum}]}

Warnings never block: no alpha channel (opaque box), logo too dark for the dark halo of the video bug / too dark or too light for the CTA
card background (--cta-bg), very thin / very wide aspect, animated input (first frame used).
"""
import argparse, hashlib, io, json, os, sys

MAX_PIXELS = 40_000_000
MIN_SIDE = 64
MAX_SIDE = 1024


def fail(msg, **extra):
    return {"ok": False, "error": msg, "warnings": [], **extra}


def sniff(head):
    if head.startswith(b"\x89PNG\r\n\x1a\n"):
        return "PNG"
    if head.startswith(b"\xff\xd8\xff"):
        return "JPEG"
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "WEBP"
    low = head[:512].lstrip().lower()
    if low.startswith(b"<svg") or low.startswith(b"<?xml") or b"<svg" in low:
        return "SVG"
    return None


def load(path, strict_size=True):
    """-> (RGBA image, info) or (None, error dict). Decodes the whole file."""
    from PIL import Image, ImageOps
    Image.MAX_IMAGE_PIXELS = None  # we enforce our own (stricter) limit before decoding
    try:
        with open(path, "rb") as f:
            head = f.read(4096)
    except OSError as e:
        return None, fail(f"no se pudo leer el archivo ({e.strerror or e})")
    if not head:
        return None, fail("el archivo está vacío")
    kind = sniff(head)
    if kind == "SVG":
        return None, fail("los SVG no se aceptan (pueden traer scripts y se dibujan distinto en cada motor). Exporta el logo a PNG con fondo transparente.")
    if kind is None:
        return None, fail("formato no soportado: sube un PNG, JPG o WebP (se comprueba el contenido real, no la extensión).")
    try:
        im = Image.open(path)
        w, h = im.size
    except Exception:
        return None, fail("el archivo está dañado o no es una imagen válida.")
    if (im.format if im.format != "MPO" else "JPEG") != kind:  # MPO = multi-picture JPEG (DJI drones, some phones): same bytes, Pillow names it differently
        return None, fail("el contenido del archivo no coincide con su formato.")
    if w * h > MAX_PIXELS:
        return None, fail(f"imagen demasiado grande ({w}x{h}, {w * h / 1e6:.0f} MP; máximo 40 MP). Redúcela antes de subirla.")
    if strict_size and min(w, h) < MIN_SIDE:
        return None, fail(f"imagen demasiado pequeña ({w}x{h}); el lado menor debe ser de al menos {MIN_SIDE} px para verse nítida.")
    warnings = []
    try:
        if getattr(im, "n_frames", 1) > 1:
            if im.format != "MPO":  # an MPO's extra frames are previews, not an animation
                warnings.append("la imagen es animada: se usa solo el primer cuadro.")
            im.seek(0)
        im.load()
        im = ImageOps.exif_transpose(im)
        has_alpha = im.mode in ("RGBA", "LA", "PA", "La", "RGBa") or "transparency" in im.info
        rgba = im.convert("RGBA")
    except Exception:
        return None, fail("el archivo está dañado o incompleto (no se pudo decodificar).")
    return rgba, {"format": kind, "has_alpha": has_alpha, "warnings": warnings, "src_size": [w, h]}


def analyse(rgba, info, cta_bg, contrast=True):
    """Alpha / luminance / aspect checks on the (already trimmed) image. -> (warnings, alpha_ok, lum)"""
    from PIL import ImageStat
    warnings = list(info["warnings"])
    a = rgba.getchannel("A")
    lo, hi = a.getextrema()
    alpha_ok = info["alpha_real"] if "alpha_real" in info else (info["has_alpha"] and lo < 250)
    if not alpha_ok:
        warnings.append("la imagen no tiene canal alfa (fondo transparente): se verá una caja opaca alrededor del logo. Usa un PNG con transparencia.")
    mask = a.point(lambda v: 255 if v > 200 else 0)
    if mask.getbbox() is None:
        mask = None
    lum = ImageStat.Stat(rgba.convert("L"), mask=mask).mean[0] / 255.0 if mask is not None else 0.0
    if alpha_ok and contrast:
        if lum < 0.25:
            warnings.append(f"el logo es muy oscuro (luminosidad {lum:.2f}): sobre el video (halo oscuro) casi no se verá. Usa una versión clara o blanca.")
    if contrast and cta_bg == "dark" and lum < 0.25:
        warnings.append("el logo es oscuro y la tarjeta de cierre es oscura: poco contraste.")
    if contrast and cta_bg == "light" and lum > 0.8:
        warnings.append("el logo es muy claro y la tarjeta de cierre es clara: poco contraste.")
    w, h = rgba.size
    ratio = w / h
    if ratio > 6:
        warnings.append(f"el logo es muy ancho (relación {ratio:.1f}:1): se verá pequeño y bajo.")
    elif ratio < 1 / 3:
        warnings.append(f"el logo es muy delgado (relación 1:{1 / ratio:.1f}): se verá muy angosto.")
    return warnings, alpha_ok, lum


def process(path, out_dir, cta_bg):
    from PIL import Image
    rgba, info = load(path)
    if rgba is None:
        return info
    info["alpha_real"] = info["has_alpha"] and rgba.getchannel("A").getextrema()[0] < 250  # judged before trimming the transparent margin
    if info["has_alpha"]:
        box = rgba.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox()
        if box is None:
            return fail("la imagen es totalmente transparente: no hay nada que mostrar.")
        if box != (0, 0, rgba.width, rgba.height):
            rgba = rgba.crop(box)
            info["warnings"].append("se recortó el margen transparente alrededor del logo.")
    if max(rgba.size) > MAX_SIDE:
        k = MAX_SIDE / max(rgba.size)
        rgba = rgba.resize((max(1, round(rgba.width * k)), max(1, round(rgba.height * k))), Image.LANCZOS)
        info["warnings"].append(f"se redujo a {rgba.width}x{rgba.height} px (máximo {MAX_SIDE} px por lado).")
    if max(rgba.size) < 32:
        return fail("después de recortar el margen el logo queda diminuto; revisa la imagen.")
    warnings, alpha_ok, lum = analyse(rgba, info, cta_bg)
    buf = io.BytesIO()
    rgba.save(buf, "PNG", optimize=True)
    data = buf.getvalue()
    sha8 = hashlib.sha256(data).hexdigest()[:8]
    os.makedirs(out_dir, exist_ok=True)
    dest = os.path.join(out_dir, f"logo-{sha8}.png")
    if os.path.exists(dest):
        with open(dest, "rb") as f:
            if f.read() != data:  # astronomically unlikely; never overwrite a different file
                return fail("colisión de nombre de archivo; vuelve a intentarlo.")
    else:
        tmp = f"{dest}.{os.getpid()}.tmp"
        with open(tmp, "wb") as f:
            f.write(data)
        os.replace(tmp, dest)
    return {"ok": True, "error": None, "warnings": warnings, "width": rgba.width, "height": rgba.height, "alpha": alpha_ok,
            "lum": round(lum, 3), "sha8": sha8, "file": os.path.basename(dest), "bytes": len(data), "format": info["format"]}


PRODUCT_MAX_SIDE = 2048
PRODUCT_SOFT_SIDE = 600


def to_srgb(im):
    """Convert an image with an embedded ICC profile to sRGB; images without a profile are assumed sRGB."""
    prof = im.info.get("icc_profile")
    if not prof:
        return im
    try:
        from PIL import ImageCms
        src = ImageCms.ImageCmsProfile(io.BytesIO(prof))
        dst = ImageCms.createProfile("sRGB")
        mode = "RGBA" if im.mode == "RGBA" else "RGB"
        out = ImageCms.profileToProfile(im.convert(mode), src, dst, outputMode=mode)
        return out
    except Exception:
        return im


def write_addressed(data, out_dir, ext):
    sha8 = hashlib.sha256(data).hexdigest()[:8]
    os.makedirs(out_dir, exist_ok=True)
    dest = os.path.join(out_dir, f"{sha8}.{ext}")
    if os.path.exists(dest):
        with open(dest, "rb") as f:
            if f.read() != data:
                return None, sha8
    else:
        tmp = f"{dest}.{os.getpid()}.tmp"
        with open(tmp, "wb") as f:
            f.write(data)
        os.replace(tmp, dest)
    return dest, sha8


def process_product(path, out_dir):
    """Validate + normalize a product photo. See the module docstring (--process-product)."""
    from PIL import Image, ImageOps
    rgba, info = load(path)  # sniff, 40 MP cap, >= 64 px, EXIF orientation, first frame
    if rgba is None:
        return info
    warnings = list(info["warnings"])
    rgba = to_srgb(rgba).convert("RGBA")  # load() keeps the embedded ICC profile in rgba.info
    alpha_real = info["has_alpha"] and rgba.getchannel("A").getextrema()[0] < 250
    if max(rgba.size) > PRODUCT_MAX_SIDE:
        k = PRODUCT_MAX_SIDE / max(rgba.size)
        rgba = rgba.resize((max(1, round(rgba.width * k)), max(1, round(rgba.height * k))), Image.LANCZOS)
        warnings.append(f"se redujo a {rgba.width}x{rgba.height} px (máximo {PRODUCT_MAX_SIDE} px por lado).")
    if max(rgba.size) < PRODUCT_SOFT_SIDE:
        warnings.append(f"la foto es pequeña ({rgba.width}x{rgba.height}); en el video puede verse borrosa. Sube una de al menos {PRODUCT_SOFT_SIDE} px.")
    buf = io.BytesIO()
    if alpha_real:
        rgba.save(buf, "PNG", optimize=True)
        ext = "png"
    else:
        rgba.convert("RGB").save(buf, "JPEG", quality=90, optimize=True, subsampling=0)
        ext = "jpg"
    dest, sha8 = write_addressed(buf.getvalue(), out_dir, ext)
    if dest is None:
        return fail("colisión de nombre de archivo; vuelve a intentarlo.")
    return {"ok": True, "error": None, "warnings": warnings, "width": rgba.width, "height": rgba.height, "alpha": bool(alpha_real),
            "sha8": sha8, "file": os.path.basename(dest), "bytes": len(buf.getvalue()), "format": info["format"]}


def check(path, cta_bg, contrast=True):
    if not os.path.isfile(path):
        return {"path": path, **fail("el archivo no existe")}
    with open(path, "rb") as f:
        head = f.read(4096)
    if sniff(head) == "SVG":  # brand.json may legitimately ship an SVG: only its existence can be checked here
        return {"path": path, "ok": True, "error": None, "warnings": ["SVG: no se puede comprobar el contenido; si se ve mal, expórtalo a PNG."]}
    rgba, info = load(path, strict_size=False)
    if rgba is None:
        return {"path": path, **info}
    warnings, alpha_ok, lum = analyse(rgba, info, cta_bg, contrast)
    if min(rgba.size) < MIN_SIDE:
        warnings.append(f"el logo es muy pequeño ({rgba.width}x{rgba.height}); puede verse borroso.")
    return {"path": path, "ok": True, "error": None, "warnings": warnings, "width": rgba.width, "height": rgba.height, "alpha": alpha_ok, "lum": round(lum, 3), "format": info["format"]}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--process")
    ap.add_argument("--out-dir")
    ap.add_argument("--process-product")
    ap.add_argument("--check", nargs="+")
    ap.add_argument("--cta-bg", choices=["light", "dark"])
    ap.add_argument("--no-contrast", action="store_true", help="--check: skip the luminance warnings (brand variants are chosen per background)")
    a = ap.parse_args()
    try:
        import PIL  # noqa: F401
    except ImportError:
        print(json.dumps(fail("falta Pillow en este Python (pip install pillow).", missing_pillow=True)))
        return
    if a.process:
        if not a.out_dir:
            sys.exit("--process needs --out-dir")
        out = process(a.process, a.out_dir, a.cta_bg)
    elif a.process_product:
        if not a.out_dir:
            sys.exit("--process-product needs --out-dir")
        out = process_product(a.process_product, a.out_dir)
    elif a.check:
        out = {"files": [check(p, a.cta_bg, not a.no_contrast) for p in a.check]}
    else:
        sys.exit("usage: validate_asset.py --process IN --out-dir DIR | --check FILE...")
    print(json.dumps(out, ensure_ascii=False))


if __name__ == "__main__":
    main()
