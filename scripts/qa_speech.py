#!/usr/bin/env python3
"""Speech QA for a clip or wav: Whisper word timestamps + timing metrics (+ WER vs a script).

  python3 qa_speech.py <clip.mp4|audio.wav> [--out words.json] [--script script.txt] [--lang es] [--gap 0.25]

Transcribes with whisper_backend.py (mlx-whisper on Apple Silicon, faster-whisper elsewhere; large-v3-turbo), writes words.json
([{word,start,end}]) and prints JSON:
duration, speech_start, speech_end, end_gap (duration - speech_end), gaps >= --gap s, words_per_minute and, with --script,
a word-level diff + WER (accents, punctuation and case are normalized). Re-executes itself with the skill venv (scripts/setup_python.py;
legacy fallback: the reels-dibujados venv) when the transcription engine is not importable.
"""
import argparse, difflib, json, os, re, subprocess, sys, tempfile, unicodedata
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import paths  # noqa: E402
import whisper_backend  # noqa: E402
# Interpreters with the transcription engine, in order: QA_SPEECH_PYTHON, the skill venv (setup_python.py), the legacy reels-dibujados venv.
LEGACY_PY = paths.venv_bin(Path("~/.local/share/reels-dibujados/venv").expanduser(), "python")
CANDIDATES = [Path(os.environ["QA_SPEECH_PYTHON"]).expanduser()] if os.environ.get("QA_SPEECH_PYTHON") else [paths.venv_python(), LEGACY_PY]
MODEL = whisper_backend.MLX_MODEL


def norm(s):
    s = unicodedata.normalize("NFD", s.lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9ñ ]+", " ", s.replace("ñ", "n")).split()


def duration_of(path):
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=nk=1:nw=1", str(path)],
                       capture_output=True, text=True, check=True)
    return float(r.stdout.strip())


def diff_vs_script(hyp, ref):
    h, r = norm(hyp), norm(ref)
    sm = difflib.SequenceMatcher(a=r, b=h, autojunk=False)
    ops, sub, dele, ins = [], 0, 0, 0
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == "equal":
            continue
        ops.append({"op": tag, "script": " ".join(r[i1:i2]), "heard": " ".join(h[j1:j2])})
        if tag == "replace":
            sub += min(i2 - i1, j2 - j1); dele += max(0, (i2 - i1) - (j2 - j1)); ins += max(0, (j2 - j1) - (i2 - i1))
        elif tag == "delete":
            dele += i2 - i1
        else:
            ins += j2 - j1
    wer = (sub + dele + ins) / max(1, len(r))
    return {"wer": round(wer, 4), "ref_words": len(r), "substitutions": sub, "deletions": dele, "insertions": ins, "diff": ops}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("media")
    ap.add_argument("--out", help="words.json path (default: <media>.words.json next to the media)")
    ap.add_argument("--script", help="text file with the intended script")
    ap.add_argument("--lang", default="es")
    ap.add_argument("--gap", type=float, default=0.25)
    a = ap.parse_args()
    try:
        whisper_backend.require()
    except ImportError:
        for cand in CANDIDATES:
            if cand.exists() and Path(sys.executable).resolve() != cand.resolve():
                paths.reexec(cand, sys.argv)
        raise
    media = Path(a.media)
    out = Path(a.out) if a.out else media.with_suffix(".words.json")

    with tempfile.TemporaryDirectory() as tmp:
        wav = Path(tmp) / "a.wav"
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(media), "-vn", "-ac", "1", "-ar", "16000", str(wav)], check=True)
        res = whisper_backend.transcribe(wav, a.lang, MODEL)
    words = []
    for seg in res.get("segments", []):
        for w in seg.get("words", []):
            words.append({"word": w["word"].strip(), "start": round(float(w["start"]), 3), "end": round(float(w["end"]), 3)})
    words = [w for w in words if w["word"]]
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(words, ensure_ascii=False, indent=1), encoding="utf-8")

    dur = duration_of(media)
    rep = {"media": str(media), "words_json": str(out), "duration": round(dur, 3), "text": res.get("text", "").strip()}
    if words:
        s, e = words[0]["start"], words[-1]["end"]
        gaps = [{"after": words[i]["word"], "at": words[i]["end"], "gap": round(words[i + 1]["start"] - words[i]["end"], 3)}
                for i in range(len(words) - 1) if words[i + 1]["start"] - words[i]["end"] >= a.gap]
        rep.update(speech_start=s, speech_end=e, end_gap=round(dur - e, 3), gaps=gaps,
                   words_per_minute=round(len(words) / max(e - s, 1e-3) * 60, 1), word_count=len(words))
    else:
        rep.update(speech_start=None, speech_end=None, end_gap=None, gaps=[], words_per_minute=0, word_count=0)
    if a.script:
        rep["script_check"] = diff_vs_script(" ".join(w["word"] for w in words), Path(a.script).read_text(encoding="utf-8"))
    print(json.dumps(rep, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
