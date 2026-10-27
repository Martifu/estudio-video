#!/usr/bin/env python3
"""Variantes en un clic: render N text-only variants of a finished comp (free, local; no paid generation).

    python3 variants.py --comp <RUN>/<comp> [--build FILE] [--only 00,01] [--export]

Reads <comp>/variants.json:
  {"axes":[{"id","label","target":{"kind":"motion","id"|"index","field"} | {"kind":"cta","field":"title"|"subtitle"} |
            {"kind":"caption","segment":N,"field":"text"}, "options":[current, alt1, ...]}], "selected":[...]}
Every combination (max 2 axes, max 12 combos) becomes a sibling comp <comp>__var-<i><j> that carries the comp's editable docs
(motion/captions/zones/logo/cta/edl .json, unchanged except the overridden text) and is built with the comp's own build argv
(--name and --motion swapped, --reuse-footage kept, so nothing is re-extracted), one after another. A failed variant is
recorded and the others continue. Outputs: <comp>/variants/<slug>.mp4 (hard link), <slug>.jpg (hook frame), <slug>-cta.jpg,
<slug>-preview.mp4 (3 s around the hook), grid.jpg (contact sheet), names.csv; state in <comp>/.studio/variants/manifest.json.
The base comp is never modified. Progress lines for the Estudio server start with "@variants ".
"""
import argparse
import csv
import json
import os
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import encoding  # noqa: E402

SKILL = Path(__file__).resolve().parent.parent
DOCS = ("motion.json", "captions.json", "zones.json", "logo.json", "cta.json", "edl.json")
MAX_AXES, MAX_COMBOS, MAX_OPTIONS, MAX_TEXT = 2, 12, 4, 120
FIELD_RE = re.compile(r"^[a-z][A-Za-z]{0,20}$")
ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,40}$")
ALLOWED_EXE = {"python3", "python", "node"}
CONTROL_RE = re.compile(r"[\x00-\x08\x0b-\x1f\x7f]")


class VariantError(Exception):
    pass


# ---------- document validation (mirrors engine/studio/variants.mjs; this side is the one that guards the render) ----------
def validate_doc(doc):
    """-> (errors, warnings, combos) where combos is a list of index tuples (one index per axis)."""
    errors, warnings = [], []
    if not isinstance(doc, dict) or not isinstance(doc.get("axes"), list):
        return ["variants.json: se espera {axes:[...]}"], warnings, []
    axes = doc["axes"]
    if not 1 <= len(axes) <= MAX_AXES:
        errors.append(f"variants.json: entre 1 y {MAX_AXES} ejes")
    seen = set()
    for n, ax in enumerate(axes[:MAX_AXES + 1]):
        tag = f"eje {n + 1}"
        if not isinstance(ax, dict):
            errors.append(f"{tag}: debe ser un objeto")
            continue
        if not isinstance(ax.get("id"), str) or not ID_RE.match(ax["id"]) or ax["id"] in seen:
            errors.append(f"{tag}: id inválido o repetido")
        seen.add(ax.get("id"))
        t = ax.get("target")
        if not isinstance(t, dict):
            errors.append(f"{tag}: falta target")
        else:
            kind = t.get("kind")
            if kind == "motion":
                if not ((isinstance(t.get("id"), str) and ID_RE.match(t["id"])) or isinstance(t.get("index"), int)):
                    errors.append(f"{tag}: el elemento necesita id o index")
                if not isinstance(t.get("field"), str) or not FIELD_RE.match(t["field"]):
                    errors.append(f"{tag}: campo inválido")
            elif kind == "cta":
                if t.get("field") not in ("title", "subtitle"):
                    errors.append(f"{tag}: el cierre solo admite title o subtitle")
            elif kind == "caption":
                if not isinstance(t.get("segment"), int) or isinstance(t.get("segment"), bool) or t["segment"] < 0:
                    errors.append(f"{tag}: subtítulo sin segmento")
                if t.get("field", "text") != "text":
                    errors.append(f"{tag}: el subtítulo solo admite text")
            else:
                errors.append(f"{tag}: tipo de objetivo desconocido")
        opts = ax.get("options")
        if not isinstance(opts, list) or not 2 <= len(opts) <= MAX_OPTIONS or not all(isinstance(o, str) for o in opts):
            errors.append(f"{tag}: entre 2 y {MAX_OPTIONS} textos (el primero es el actual)")
            continue
        for k, o in enumerate(opts):
            s = o.strip()
            if not s:
                errors.append(f"{tag}, opción {k + 1}: texto vacío")
            elif len(s) > MAX_TEXT or CONTROL_RE.search(o):
                errors.append(f"{tag}, opción {k + 1}: más de {MAX_TEXT} caracteres o con caracteres de control")
            elif len(s.split()) > 4 and isinstance(t, dict) and t.get("kind") != "caption":
                warnings.append(f"{tag}, opción {k + 1}: {len(s.split())} palabras (la guía es 1-4 por fragmento)")
        if len({o.strip().lower() for o in opts}) != len(opts):
            warnings.append(f"{tag}: hay textos repetidos")
    combos = [()]
    for ax in axes[:MAX_AXES]:
        n = len(ax.get("options", [])) if isinstance(ax, dict) and isinstance(ax.get("options"), list) else 0
        combos = [c + (i,) for c in combos for i in range(n)]
    if len(combos) > MAX_COMBOS:
        errors.append(f"{len(combos)} combinaciones (máximo {MAX_COMBOS})")
    return errors, warnings, combos


def variant_slug(comp_name, combo):
    """Safe sibling-comp name: only digits from the option indexes, never user text."""
    return f"{comp_name}__var-{''.join(str(int(i)) for i in combo)}"


# ---------- override application ----------
def apply_overrides(docs, axes, combo):
    """docs: dict of loaded JSON by file name (mutated). Returns a list of applied overrides [{axis, text}]."""
    applied = []
    for ax, idx in zip(axes, combo):
        text = ax["options"][idx].strip()
        t = ax["target"]
        if t["kind"] == "motion":
            motion = docs.get("motion.json")
            if not isinstance(motion, list):
                raise VariantError("motion.json no es una lista")
            el = next((e for e in motion if isinstance(e, dict) and t.get("id") and e.get("id") == t["id"]), None)
            if el is None and isinstance(t.get("index"), int) and 0 <= t["index"] < len(motion):
                el = motion[t["index"]]
            if not isinstance(el, dict):
                raise VariantError(f"eje «{ax.get('label', ax['id'])}»: el elemento ya no existe en motion.json")
            if not isinstance(el.get(t["field"]), str):
                raise VariantError(f"eje «{ax.get('label', ax['id'])}»: el elemento no tiene el campo de texto «{t['field']}»")
            el[t["field"]] = text
        elif t["kind"] == "cta":
            cta = docs.get("cta.json")
            if not isinstance(cta, dict):
                cta = docs["cta.json"] = {}
            cta[t["field"]] = text
        else:
            caps = docs.get("captions.json")
            segs = caps.get("segments") if isinstance(caps, dict) else None
            if not isinstance(segs, list) or t["segment"] >= len(segs) or not isinstance(segs[t["segment"]], dict):
                raise VariantError(f"eje «{ax.get('label', ax['id'])}»: no existe ese segmento de captions.json")
            segs[t["segment"]]["text"] = text
        applied.append({"axis": ax["id"], "label": ax.get("label", ax["id"]), "text": text})
    return applied


def variant_argv(base_argv, base_name, var_name, var_motion):
    """The base build argv for a variant: --name and --motion swapped, --studio-build dropped, --reuse-footage kept."""
    a = [x for x in base_argv if x != "--studio-build"]
    for flag, val in (("--name", var_name), ("--motion", str(var_motion))):
        if flag in a:
            a[a.index(flag) + 1] = val
        else:
            a += [flag, val]
    if "--reuse-footage" not in a:
        a.append("--reuse-footage")
    return a


def check_argv(argv, run):
    if len(argv) < 2 or argv[0] not in ALLOWED_EXE or not all(isinstance(x, str) for x in argv):
        raise VariantError("build.json: argv inválido")
    if Path(argv[1]).resolve() != (SKILL / "scripts" / "overlay.py"):
        raise VariantError("build.json: el script debe ser scripts/overlay.py de este skill")
    if "--run" in argv and Path(argv[argv.index("--run") + 1]).resolve() != run:
        raise VariantError("build.json: --run debe ser el RUN de este comp")


# ---------- helpers ----------
def read_json(p, default=None):
    try:
        return json.loads(Path(p).read_text())
    except (OSError, ValueError):
        return default


def write_json(p, obj):
    p = Path(p)
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_name(p.name + f".{os.getpid()}.tmp")
    tmp.write_text(json.dumps(obj, indent=1, ensure_ascii=False))
    os.replace(tmp, p)


def ffprobe_duration(f):
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", str(f)], capture_output=True, text=True)
    try:
        return float(r.stdout.strip())
    except ValueError:
        return None


def grab_frame(src, t, dst, width=540):
    r = subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", f"{max(t, 0):.3f}", "-i", str(src), "-frames:v", "1", "-vf", f"scale={width}:-2", "-q:v", "3", str(dst)], capture_output=True, text=True)
    if r.returncode or not Path(dst).exists():
        raise VariantError(f"no se pudo sacar un cuadro en {t:.1f}s: {r.stderr.strip()[-200:]}")


def make_preview(src, dst, start=0.0, secs=3.0):
    r = subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", f"{max(start, 0):.3f}", "-i", str(src), "-t", str(secs), "-vf", "scale=360:-2", "-an", *encoding.video_codec_args(preview=True), "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(dst)], capture_output=True, text=True)
    if r.returncode:
        raise VariantError(f"preview: {r.stderr.strip()[-200:]}")


def link_or_copy(src, dst):
    dst = Path(dst)
    if dst.exists() or dst.is_symlink():
        dst.unlink()
    try:
        os.link(src, dst)
    except OSError:
        shutil.copy2(src, dst)


def make_grid(entries, out_dir, out_file):
    """Contact sheet: one cell per variant (hook frame, plus the CTA frame beside it when there is a CTA axis) with its code and texts."""
    from PIL import Image, ImageDraw, ImageFont
    ok = [e for e in entries if e.get("poster") and (out_dir / e["poster"]).exists()]
    if not ok:
        return False
    two = any(e.get("posterCta") for e in ok)
    fw = 270
    fh = 480
    cell_w = fw * (2 if two else 1) + 8
    label_h = 80
    cols = min(len(ok), 3 if two else 4)
    rows = (len(ok) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * cell_w + 8, rows * (fh + label_h + 8) + 8), (24, 24, 24))
    d = ImageDraw.Draw(sheet)
    font = None
    win_fonts = Path(os.environ.get("WINDIR", "C:/Windows")) / "Fonts"
    for cand in ("/System/Library/Fonts/Helvetica.ttc", "/System/Library/Fonts/SFNS.ttf", "/Library/Fonts/Arial.ttf",
                 str(win_fonts / "arialbd.ttf"), str(win_fonts / "segoeuib.ttf")):
        try:
            font = ImageFont.truetype(cand, 15)
            break
        except OSError:
            continue
    font = font or ImageFont.load_default()
    for n, e in enumerate(ok):
        x = 8 + (n % cols) * cell_w
        y = 8 + (n // cols) * (fh + label_h + 8)
        for k, key in enumerate(("poster", "posterCta")[: 2 if two else 1]):
            p = out_dir / e[key] if e.get(key) else None
            if p and p.exists():
                im = Image.open(p).convert("RGB").resize((fw, fh))
                sheet.paste(im, (x + k * (fw + 2), y))
        lines = [f"{e['code']}"] + [f"{o['label']}: {o['text']}" for o in e["overrides"]]
        for k, line in enumerate(lines[:4]):
            line = "".join(ch for ch in line if ord(ch) < 0x2190)  # the sheet font has no emoji: drop them here only
            max_chars = max(10, int((cell_w - 12) / 8.5))
            d.text((x, y + fh + 4 + 18 * k), line if len(line) <= max_chars else line[: max_chars - 1] + "…", fill=(240, 240, 240) if k == 0 else (205, 205, 205), font=font)
    sheet.save(out_file, quality=88)
    return True


def export_names(comp, manifest):
    """names.csv / names.json: file name -> variant texts, for naming ads in Meta."""
    vdir = comp / "variants"
    vdir.mkdir(exist_ok=True)
    rows = []
    for v in manifest.get("variants", []):
        if v.get("status") != "done":
            continue
        row = {"file": v["file"], "variant": v["code"], "ad_name": f"{comp.name}_{v['code']}"}
        for o in v["overrides"]:
            row[o["label"]] = o["text"]
        rows.append(row)
    cols = []
    for r in rows:
        for k in r:
            if k not in cols:
                cols.append(k)
    with open(vdir / "names.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        w.writerows(rows)
    write_json(vdir / "names.json", rows)
    return len(rows)


def emit(**kw):
    print("@variants " + json.dumps(kw, ensure_ascii=False), flush=True)


# ---------- main ----------
def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--comp", required=True)
    ap.add_argument("--build", help="base build argv JSON ({argv:[...]}); default <comp>/.studio/build.json")
    ap.add_argument("--only", help="comma-separated variant codes to (re)render, e.g. 01,11")
    ap.add_argument("--export", action="store_true", help="only rewrite names.csv from the manifest")
    ap.add_argument("--timeout", type=int, default=1500, help="seconds per variant build")
    a = ap.parse_args()

    comp = Path(a.comp).resolve()
    run = comp.parent
    sdir = comp / ".studio" / "variants"
    mf_path = sdir / "manifest.json"
    if a.export:
        print(f"{export_names(comp, read_json(mf_path, {}))} filas -> {comp / 'variants' / 'names.csv'}")
        return 0

    doc = read_json(comp / "variants.json")
    errors, warnings, combos = validate_doc(doc)
    if errors:
        print("variants.json inválido: " + "; ".join(errors), file=sys.stderr)
        return 2
    axes = doc["axes"]
    build = read_json(a.build or comp / ".studio" / "build.json", {})
    base_argv = build.get("argv") if isinstance(build, dict) else None
    try:
        check_argv(base_argv or [], run)
    except VariantError as e:
        print(str(e), file=sys.stderr)
        return 2
    base_docs = {}
    for name in DOCS:
        p = comp / name
        if p.exists():
            base_docs[name] = read_json(p)
            if base_docs[name] is None:
                print(f"{p}: JSON inválido", file=sys.stderr)
                return 2
    cta_on = "--cta" in base_argv or (isinstance(base_docs.get("cta.json"), dict) and base_docs["cta.json"].get("enabled"))
    if any(ax["target"]["kind"] == "cta" for ax in axes) and not cta_on:
        print("Este video no tiene tarjeta de cierre (CTA): quita el eje del cierre o activa el cierre primero.", file=sys.stderr)
        return 2

    only = {c.strip() for c in a.only.split(",")} if a.only else None
    prev = read_json(mf_path, {}) if only else {}
    prev_by = {v["code"]: v for v in prev.get("variants", [])} if isinstance(prev, dict) else {}
    plan = []
    for combo in combos:
        code = "".join(str(i) for i in combo)
        slug = variant_slug(comp.name, combo)
        plan.append({"code": code, "combo": list(combo), "slug": slug, "comp": slug,
                     "overrides": [{"axis": ax["id"], "label": ax.get("label", ax["id"]), "text": ax["options"][i].strip()} for ax, i in zip(axes, combo)]})
    manifest = {"version": 1, "comp": comp.name, "startedAt": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "finishedAt": None, "status": "running",
                "warnings": warnings, "axes": [{"id": ax["id"], "label": ax.get("label", ax["id"])} for ax in axes], "variants": []}
    for p in plan:
        old = prev_by.get(p["code"])
        rerun = only is None or p["code"] in only
        manifest["variants"].append({**p, "status": "queued" if rerun else (old or {}).get("status", "queued"), **({} if rerun or not old else {k: v for k, v in old.items() if k not in p and k != "status"})})
    write_json(mf_path, manifest)
    (comp / "variants").mkdir(exist_ok=True)
    total = sum(1 for v in manifest["variants"] if v["status"] == "queued")
    emit(event="start", total=total)

    base_dur = None
    done_n = 0
    for v in manifest["variants"]:
        if v["status"] != "queued":
            continue
        t0 = time.time()
        done_n += 1
        v.update(status="running", error=None, startedAt=time.strftime("%Y-%m-%dT%H:%M:%S%z"))
        write_json(mf_path, manifest)
        emit(event="variant", code=v["code"], status="running", n=done_n, total=total)
        try:
            vdir = run / v["comp"]
            # copy the editable docs, apply the text overrides (the base comp's own files are only read)
            docs = json.loads(json.dumps(base_docs))
            docs.setdefault("motion.json", [])
            applied = apply_overrides(docs, axes, v["combo"])
            vdir.mkdir(parents=True, exist_ok=True)
            for name in DOCS:  # drop stale docs from a previous run that the base no longer has
                if name not in docs and (vdir / name).exists():
                    (vdir / name).unlink()
            for name, content in docs.items():
                write_json(vdir / name, content)
            argv = variant_argv(base_argv, comp.name, v["comp"], vdir / "motion.json")
            write_json(vdir / ".studio" / "build.json", {"argv": argv})
            log = sdir / "logs" / f"{v['comp']}.log"
            log.parent.mkdir(parents=True, exist_ok=True)
            with open(log, "w") as lf:
                proc = subprocess.Popen([sys.executable if argv[0] in ("python3", "python") else argv[0], *argv[1:]], cwd=run, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
                deadline = time.time() + a.timeout
                for line in proc.stdout:
                    lf.write(line)
                    m = re.match(r"^(\d+)/(\d+) ·", line)
                    if m:
                        emit(event="progress", code=v["code"], frac=int(m.group(1)) / max(int(m.group(2)), 1), n=done_n, total=total)
                    if time.time() > deadline:
                        proc.kill()
                        raise VariantError(f"tardó más de {a.timeout}s")
                if proc.wait() != 0:
                    tail = "".join(open(log).readlines()[-6:]).strip()
                    raise VariantError(f"el render falló (código {proc.returncode}): {tail[-300:]}")
            final = vdir / "out" / f"{v['comp']}-final.mp4"
            if not final.exists():
                raise VariantError("no se generó el video final")
            dur = ffprobe_duration(final)
            out = comp / "variants"
            mp4 = out / f"{v['slug']}.mp4"
            link_or_copy(final, mp4)
            # hook frame: just after the first overridden motion element enters (else 1.0 s); CTA frame: inside the closing card
            t_hook = 1.0
            for ax, i in zip(axes, v["combo"]):
                t = ax["target"]
                if t["kind"] == "motion":
                    mo = docs["motion.json"]
                    el = next((e for e in mo if isinstance(e, dict) and t.get("id") and e.get("id") == t["id"]), None)
                    if el is None and isinstance(t.get("index"), int):
                        el = mo[t["index"]]
                    if isinstance(el, dict) and isinstance(el.get("in"), (int, float)):
                        t_hook = float(el["in"]) + 0.8
                    break
                if t["kind"] == "caption":
                    segs = (docs.get("captions.json") or {}).get("segments", [])
                    s = segs[t["segment"]] if t["segment"] < len(segs) else {}
                    if isinstance(s.get("start"), (int, float)):
                        t_hook = float(s["start"]) + 0.3
                    break
            if dur:
                t_hook = min(t_hook, dur - 0.2)
            poster, cta_poster = out / f"{v['slug']}.jpg", out / f"{v['slug']}-cta.jpg"
            grab_frame(final, t_hook, poster)
            has_cta = any(ax["target"]["kind"] == "cta" for ax in axes)
            if has_cta and dur:
                grab_frame(final, max(dur - 1.0, 0), cta_poster)
            elif cta_poster.exists():
                cta_poster.unlink()
            make_preview(final, out / f"{v['slug']}-preview.mp4", start=t_hook - 0.8)
            base_dur = base_dur or dur
            v.update(status="done", error=None, durationS=dur, renderS=round(time.time() - t0, 1), file=mp4.name, final=f"{v['comp']}/out/{v['comp']}-final.mp4",
                     poster=poster.name, posterCta=cta_poster.name if has_cta and dur else None, preview=f"{v['slug']}-preview.mp4", hookAtS=round(t_hook, 2),
                     overrides=applied)
        except (VariantError, OSError, ValueError, KeyError, subprocess.SubprocessError) as e:
            print(f"ERROR variante {v['code']}: {e}", file=sys.stderr, flush=True)
            v.update(status="failed", error=str(e)[:400], renderS=round(time.time() - t0, 1))
        write_json(mf_path, manifest)
        emit(event="variant", code=v["code"], status=v["status"], n=done_n, total=total, renderS=v.get("renderS"))

    entries = manifest["variants"]
    try:
        if make_grid([e for e in entries if e["status"] == "done"], comp / "variants", comp / "variants" / "grid.jpg"):
            manifest["grid"] = "grid.jpg"
    except Exception as e:  # the sheet is a convenience; never fail the run for it
        print(f"warning: contact sheet: {e}", file=sys.stderr)
    manifest["finishedAt"] = time.strftime("%Y-%m-%dT%H:%M:%S%z")
    n_ok = sum(1 for e in entries if e["status"] == "done")
    manifest["status"] = "done" if n_ok == len(entries) else ("failed" if n_ok == 0 else "partial")
    write_json(mf_path, manifest)
    export_names(comp, manifest)
    emit(event="done", ok=n_ok, total=len(entries), status=manifest["status"])
    print(f"variantes: {n_ok}/{len(entries)} -> {comp / 'variants'}")
    return 0 if n_ok else 1


if __name__ == "__main__":
    sys.exit(main())
