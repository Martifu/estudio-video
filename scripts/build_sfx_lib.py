#!/usr/bin/env python3
"""Developer tool: (re)builds the bundled sound library assets/sfx/lib/ from the local earshot bank (deterministic, no network).

  ~/tools/earshot/.venv/bin/python scripts/build_sfx_lib.py [--only id,id] [--keep-tmp]

Needs earshot (only here: the built WAVs are plain files, so rendering videos and the Estudio never need earshot for them).
Each sound = one earshot render (or a small composition of renders), onset trimmed to ~0 (5 ms of lead kept), tail trimmed at -60 dB,
10 ms fade-out, peak-normalised to -1 dBFS (like assets/sfx/ui/*.wav), mono 48 kHz 16-bit. index.json lists id, Spanish label, file,
default gain_db (consistent with the kit: pop -17, whoosh -19, notify -14), group, dur and, for risers, "anchor": "end".
"""
import argparse, json, os, subprocess, sys, tempfile
from pathlib import Path

import numpy as np
import soundfile as sf

SR = 48000
EARSHOT = Path(os.environ.get("EARSHOT_HOME", "~/tools/earshot")).expanduser() / ".venv/bin/earshot"
OUT = Path(__file__).resolve().parent.parent / "assets" / "sfx" / "lib"

# id: (label, group, parts, gain_db, max_dur_s, anchor)   parts = [(earshot sound, offset_s, {render options})]
LIB = {
    "clic": ("Clic", "Interfaz", [("pro_click/soft", 0, {})], -21, 0.3, None),
    "tecleo": ("Tecleo", "Interfaz", [("pro_typing_run/soft", 0, {})], -23, 1.6, None),
    "burbuja": ("Burbuja", "Interfaz", [("pro_pop/bloop", 0, {})], -17, 0.4, None),
    "pop-2": ("Pop 2", "Interfaz", [("pop/1", 0, {})], -17, 0.4, None),
    "interruptor": ("Interruptor", "Interfaz", [("toggle/on", 0, {})], -20, 0.4, None),
    "ding": ("Ding", "Interfaz", [("pro_notify/ding_2045", 0, {})], -17, 1.0, None),
    "notificacion-2": ("Notificación 2", "Interfaz", [("notify/m2", 0, {})], -15, 2.0, None),
    "obturador": ("Obturador de cámara", "Interfaz", [("toggle/latch", 0, {}), ("toggle/rocker", 0.07, {})], -19, 0.6, None),
    "swoosh-arriba": ("Swoosh arriba", "Movimiento", [("pro_zip/up", 0, {})], -19, 0.6, None),
    "swoosh-abajo": ("Swoosh abajo", "Movimiento", [("pro_zip/down", 0, {})], -19, 0.6, None),
    "deslizar": ("Deslizar (swipe)", "Movimiento", [("swipe/glide", 0, {})], -20, 1.0, None),
    "pasar-pagina": ("Pasar página", "Movimiento", [("swipe/paper", 0, {})], -20, 1.0, None),
    "whoosh-2": ("Whoosh 2", "Movimiento", [("whoosh_fast/crisp", 0, {})], -19, 1.1, None),
    "whoosh-grande": ("Whoosh grande", "Movimiento", [("whoosh_big/cape", 0, {})], -19, 1.4, None),
    "caja-registradora": ("Caja registradora", "Dinero y compras", [("toggle/latch", 0, {}), ("pro_notify/ding_2045", 0.10, {}), ("pro_notify/ding_2296", 0.24, {})], -17, 1.4, None),
    "moneda": ("Moneda", "Dinero y compras", [("fit/bell/small_bell", 0, {})], -21, 1.5, None),
    "impacto": ("Impacto", "Impactos y subidas", [("pro_impact/short", 0, {})], -16, 0.7, None),
    "golpe-grave": ("Golpe grave", "Impactos y subidas", [("pro_sub_drop/quick", 0, {})], -17, 1.0, None),
    "subida": ("Subida (riser)", "Impactos y subidas", [("riser/rush", 0, {})], -19, 1.8, "end"),
    "subida-larga": ("Subida larga", "Impactos y subidas", [("riser/tension", 0, {})], -19, 2.9, "end"),
    "caida": ("Caída", "Impactos y subidas", [("downlifter/air_fall", 0, {})], -19, 2.1, None),
    "chispa": ("Chispa", "Impactos y subidas", [("logo_sting/spark", 0, {})], -19, 1.6, None),
    "glitch": ("Glitch", "Impactos y subidas", [("pro_glitch/standard", 0, {})], -19, 0.75, None),
    "exito": ("Éxito", "Alertas", [("pro_notify/ding_1930", 0, {}), ("pro_notify/ding_2296", 0.13, {})], -16, 1.0, None),
    "error": ("Error", "Alertas", [("pro_pop_in/deep", 0, {}), ("pro_pop_in/knock", 0.17, {})], -15, 0.6, None),
}


def render(sound, opts, tmp):
    out = Path(tmp) / (sound.replace("/", "_") + "".join(f"_{k}{v}" for k, v in opts.items()) + ".wav")
    cmd = [str(EARSHOT), "sfx", "render", sound, "-o", str(out), "--sr", str(SR)]
    for k, v in opts.items():
        cmd += [f"--{k}", str(v)]
    subprocess.run(cmd, check=True, capture_output=True)
    y, sr = sf.read(str(out), always_2d=True, dtype="float32")
    assert sr == SR
    return y.mean(axis=1)


def build(parts, max_dur, tmp):
    waves = [(off, render(s, o, tmp)) for s, off, o in parts]
    n = max(int(round(off * SR)) + len(w) for off, w in waves)
    y = np.zeros(n, dtype="float32")
    for off, w in waves:
        i = int(round(off * SR))
        y[i:i + len(w)] += w
    # onset: first sample above -45 dB of the peak, keep 5 ms of lead
    peak = float(np.abs(y).max())
    i0 = max(int(np.argmax(np.abs(y) > peak * 10 ** (-45 / 20))) - int(0.005 * SR), 0)
    y = y[i0:]
    # tail: last sample above -60 dB of the peak
    last = int(np.nonzero(np.abs(y) > peak * 10 ** (-60 / 20))[0][-1]) + int(0.02 * SR)
    y = y[: min(last, int(max_dur * SR), len(y))]
    k = int(0.01 * SR)
    y[-k:] *= np.linspace(1, 0, k, dtype="float32")
    y *= 10 ** (-1 / 20) / float(np.abs(y).max())
    return y


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only")
    a = ap.parse_args()
    only = set(a.only.split(",")) if a.only else None
    OUT.mkdir(parents=True, exist_ok=True)
    sounds = []
    with tempfile.TemporaryDirectory() as tmp:
        for sid, (label, group, parts, gain, max_dur, anchor) in LIB.items():
            if only and sid not in only:
                continue
            y = build(parts, max_dur, tmp)
            sf.write(str(OUT / f"{sid}.wav"), y, SR, subtype="PCM_16")
            row = {"id": sid, "label": label, "file": f"{sid}.wav", "gain_db": gain, "group": group, "dur": round(len(y) / SR, 3)}
            if anchor:
                row["anchor"] = anchor
            sounds.append(row)
            print(f"{sid:20s} {row['dur']:.2f}s")
    if not only:
        (OUT / "index.json").write_text(json.dumps({"version": 1, "sounds": sounds}, ensure_ascii=False, indent=1) + "\n")
        print(f"{len(sounds)} sounds -> {OUT}")


if __name__ == "__main__":
    main()
