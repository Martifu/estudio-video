#!/usr/bin/env python3
"""Speech-to-text backend for qa_speech.py (and any future caller). One entry point, two engines:

  darwin + arm64 (Apple Silicon)  mlx-whisper, called exactly as before (the raw mlx result is returned untouched, so the
                                  Mac output does not change).
  everything else                 faster-whisper (CTranslate2): CUDA float16 when a CUDA device is usable, else CPU int8.
  ESTUDIO_WHISPER_DEVICE=cuda|cpu forces one device (no fallback when forced).

Both engines return the same shape the mlx result has (the subset the scripts consume):
  {"text": str, "segments": [{"start": float, "end": float, "text": str,
                              "words": [{"word": str, "start": float, "end": float, "probability": float}]}]}
Word text keeps Whisper's leading space (" Hola"), as mlx does; callers strip it.

Imports are lazy and platform/env are read at call time, so tests can patch sys.platform, platform.machine and sys.modules.
"""
import os, platform, re, sys

MLX_MODEL = "mlx-community/whisper-large-v3-turbo"
# mlx repo -> faster-whisper model name (faster_whisper.utils._MODELS aliases; faster-whisper downloads the CTranslate2 build).
FW_MODELS = {
    "mlx-community/whisper-large-v3-turbo": "large-v3-turbo",
    "mlx-community/whisper-large-v3-mlx": "large-v3",
    "mlx-community/whisper-medium-mlx": "medium",
    "mlx-community/whisper-small-mlx": "small",
    "mlx-community/whisper-base-mlx": "base",
    "mlx-community/whisper-tiny-mlx": "tiny",
}


def engine():
    """'mlx' on darwin/arm64, 'faster-whisper' everywhere else."""
    return "mlx" if sys.platform == "darwin" and platform.machine() == "arm64" else "faster-whisper"


def require():
    """Import the engine module for this platform (ImportError when it is not installed in this interpreter)."""
    if engine() == "mlx":
        import mlx_whisper  # noqa: F401
    else:
        import faster_whisper  # noqa: F401


def fw_model_name(model):
    if model in FW_MODELS:
        return FW_MODELS[model]
    # generic fallback: "mlx-community/whisper-large-v3-turbo" -> "large-v3-turbo"
    name = model.rsplit("/", 1)[-1]
    name = re.sub(r"^whisper-", "", name)
    return re.sub(r"-mlx$", "", name)


def normalize(segments):
    """faster-whisper segments (objects with .start/.end/.text/.words[.word/.start/.end/.probability]) -> the mlx-shaped dict.
    Accepts any iterable of such objects, so the same function serves the canned test fixtures."""
    out = []
    for s in segments:
        words = [{"word": w.word, "start": float(w.start), "end": float(w.end), "probability": float(w.probability)}
                 for w in (getattr(s, "words", None) or [])]
        out.append({"start": float(s.start), "end": float(s.end), "text": s.text, "words": words})
    return {"text": "".join(s["text"] for s in out), "segments": out}


def _device_plan():
    forced = os.environ.get("ESTUDIO_WHISPER_DEVICE", "").strip().lower()
    if forced == "cpu":
        return [("cpu", "int8")]
    if forced == "cuda":
        return [("cuda", "float16")]
    if forced:
        raise ValueError(f"ESTUDIO_WHISPER_DEVICE must be 'cuda' or 'cpu' (got {forced!r})")
    plan = [("cuda", "float16"), ("cpu", "int8")]
    try:  # no CUDA device at all: skip the CUDA attempt instead of failing it
        import ctranslate2
        if ctranslate2.get_cuda_device_count() == 0:
            plan = plan[1:]
    except Exception:
        plan = plan[1:]
    return plan


def _faster_segments(wav, lang, model, device, compute):
    from faster_whisper import WhisperModel
    m = WhisperModel(model, device=device, compute_type=compute)
    segments, _info = m.transcribe(str(wav), language=lang, word_timestamps=True)
    return list(segments)  # lazy generator: CUDA/cuDNN errors surface while consuming it, so consume inside the try


def transcribe(wav, lang="es", model=MLX_MODEL):
    """Transcribe a wav file -> the mlx-shaped dict (see module docstring)."""
    if engine() == "mlx":
        import mlx_whisper
        return mlx_whisper.transcribe(str(wav), path_or_hf_repo=model, word_timestamps=True, language=lang, verbose=None)
    name = fw_model_name(model)
    plan = _device_plan()
    for i, (device, compute) in enumerate(plan):
        try:
            return normalize(_faster_segments(wav, lang, name, device, compute))
        except Exception as e:
            if i == len(plan) - 1:
                raise
            why = (str(e).strip().splitlines() or [type(e).__name__])[-1][:160]
            print(f"warning: whisper on {device} failed ({why}); retrying on cpu int8", file=sys.stderr)
    raise RuntimeError("unreachable")
