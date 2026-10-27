"""whisper_backend.py: engine choice, faster-whisper normalization (must equal the mlx result shape), CUDA -> CPU fallback,
and the untouched mlx call on Apple Silicon. Run: python -m unittest discover -s scripts -p 'test_whisper_backend.py'

No model is downloaded: faster_whisper / mlx_whisper / ctranslate2 are replaced by fakes in sys.modules.
"""
import os
import sys
import types
import unittest
from types import SimpleNamespace
from unittest import mock
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import whisper_backend as wb  # noqa: E402

# What mlx_whisper.transcribe(..., word_timestamps=True) returns (the subset qa_speech consumes), canned.
MLX_FIXTURE = {
    "text": " Hola, esto es una prueba. Tu negocio atiende.",
    "segments": [
        {"start": 0.0, "end": 2.1, "text": " Hola, esto es una prueba.", "words": [
            {"word": " Hola,", "start": 0.12, "end": 0.48, "probability": 0.97},
            {"word": " esto", "start": 0.56, "end": 0.80, "probability": 0.93},
            {"word": " es", "start": 0.84, "end": 0.94, "probability": 0.99},
            {"word": " una", "start": 0.98, "end": 1.20, "probability": 0.95},
            {"word": " prueba.", "start": 1.26, "end": 2.02, "probability": 0.91},
        ]},
        {"start": 2.4, "end": 4.0, "text": " Tu negocio atiende.", "words": [
            {"word": " Tu", "start": 2.44, "end": 2.60, "probability": 0.98},
            {"word": " negocio", "start": 2.66, "end": 3.10, "probability": 0.96},
            {"word": " atiende.", "start": 3.20, "end": 3.92, "probability": 0.90},
        ]},
    ],
}


def faster_like_segments():
    """Objects shaped like faster_whisper.transcribe() output (Segment.words are Word objects with leading-space text)."""
    def word(w, s, e, p):
        return SimpleNamespace(word=w, start=s, end=e, probability=p)
    return [
        SimpleNamespace(id=1, seek=0, start=0.0, end=2.1, text=" Hola, esto es una prueba.", tokens=[1], avg_logprob=-0.2,
                        compression_ratio=1.1, no_speech_prob=0.01, temperature=0.0, words=[
                            word(" Hola,", 0.12, 0.48, 0.97), word(" esto", 0.56, 0.80, 0.93), word(" es", 0.84, 0.94, 0.99),
                            word(" una", 0.98, 1.20, 0.95), word(" prueba.", 1.26, 2.02, 0.91)]),
        SimpleNamespace(id=2, seek=210, start=2.4, end=4.0, text=" Tu negocio atiende.", tokens=[2], avg_logprob=-0.3,
                        compression_ratio=1.0, no_speech_prob=0.02, temperature=0.0, words=[
                            word(" Tu", 2.44, 2.60, 0.98), word(" negocio", 2.66, 3.10, 0.96), word(" atiende.", 3.20, 3.92, 0.90)]),
    ]


class Normalization(unittest.TestCase):
    def test_faster_whisper_output_normalizes_to_the_mlx_shape(self):
        got = wb.normalize(faster_like_segments())
        self.assertEqual(got, MLX_FIXTURE)
        self.assertEqual(set(got), {"text", "segments"})
        self.assertEqual(set(got["segments"][0]), {"start", "end", "text", "words"})
        self.assertEqual(set(got["segments"][0]["words"][0]), {"word", "start", "end", "probability"})

    def test_word_text_keeps_leading_space_and_numbers_are_floats(self):
        w = wb.normalize(faster_like_segments())["segments"][1]["words"][0]
        self.assertEqual(w["word"], " Tu")
        self.assertTrue(all(isinstance(w[k], float) for k in ("start", "end", "probability")))

    def test_segment_without_words_gives_empty_list(self):
        seg = SimpleNamespace(start=0.0, end=1.0, text=" hola", words=None)
        self.assertEqual(wb.normalize([seg])["segments"][0]["words"], [])

    def test_text_is_the_joined_segment_text(self):
        self.assertEqual(wb.normalize(faster_like_segments())["text"], MLX_FIXTURE["text"])

    def test_qa_speech_word_list_is_the_same_from_either_engine(self):
        def words_of(res):  # the exact loop qa_speech.py runs over the result
            out = []
            for seg in res.get("segments", []):
                for w in seg.get("words", []):
                    out.append({"word": w["word"].strip(), "start": round(float(w["start"]), 3), "end": round(float(w["end"]), 3)})
            return [w for w in out if w["word"]]
        self.assertEqual(words_of(wb.normalize(faster_like_segments())), words_of(MLX_FIXTURE))


class EngineChoice(unittest.TestCase):
    def test_darwin_arm64_is_mlx_everything_else_faster_whisper(self):
        cases = {("darwin", "arm64"): "mlx", ("darwin", "x86_64"): "faster-whisper", ("win32", "AMD64"): "faster-whisper",
                 ("linux", "x86_64"): "faster-whisper", ("linux", "aarch64"): "faster-whisper"}
        for (plat, mach), want in cases.items():
            with self.subTest(plat=plat, mach=mach), mock.patch.object(sys, "platform", plat), mock.patch.object(wb.platform, "machine", return_value=mach):
                self.assertEqual(wb.engine(), want)

    def test_model_names(self):
        self.assertEqual(wb.fw_model_name("mlx-community/whisper-large-v3-turbo"), "large-v3-turbo")
        self.assertEqual(wb.fw_model_name("mlx-community/whisper-small-mlx"), "small")
        self.assertEqual(wb.fw_model_name("mlx-community/whisper-tiny"), "tiny")


def install_fake_engines(test, mlx_result=None, cuda_fails=False, cuda_count=1):
    """Install fake mlx_whisper / faster_whisper / ctranslate2 modules; returns the list of WhisperModel calls."""
    calls = []

    class WhisperModel:
        def __init__(self, name, device, compute_type):
            calls.append((name, device, compute_type))
            if device == "cuda" and cuda_fails:
                raise RuntimeError("Library cudnn_ops_infer64_8.dll is not found or cannot be loaded")

        def transcribe(self, wav, language, word_timestamps):
            self.wav, self.language, self.word_timestamps = wav, language, word_timestamps
            return (iter(faster_like_segments()), SimpleNamespace(language=language))

    fw = types.ModuleType("faster_whisper")
    fw.WhisperModel = WhisperModel
    ct = types.ModuleType("ctranslate2")
    ct.get_cuda_device_count = lambda: cuda_count
    mw = types.ModuleType("mlx_whisper")
    mw.calls = []

    def transcribe(path, **kw):
        mw.calls.append((path, kw))
        return mlx_result if mlx_result is not None else MLX_FIXTURE
    mw.transcribe = transcribe
    for name, mod in (("faster_whisper", fw), ("ctranslate2", ct), ("mlx_whisper", mw)):
        p = mock.patch.dict(sys.modules, {name: mod})
        p.start()
        test.addCleanup(p.stop)
    return calls, mw


class FasterWhisperPath(unittest.TestCase):
    def setUp(self):
        self.env = mock.patch.dict(os.environ, {}, clear=False)
        self.env.start()
        self.addCleanup(self.env.stop)
        os.environ.pop("ESTUDIO_WHISPER_DEVICE", None)
        self.plat = mock.patch.object(sys, "platform", "win32")
        self.plat.start()
        self.addCleanup(self.plat.stop)
        self.mach = mock.patch.object(wb.platform, "machine", return_value="AMD64")
        self.mach.start()
        self.addCleanup(self.mach.stop)

    def test_cuda_when_available(self):
        calls, _ = install_fake_engines(self)
        out = wb.transcribe(Path("a.wav"), "es", "mlx-community/whisper-large-v3-turbo")
        self.assertEqual(calls, [("large-v3-turbo", "cuda", "float16")])
        self.assertEqual(out, MLX_FIXTURE)

    def test_cuda_load_error_falls_back_to_cpu_int8(self):
        calls, _ = install_fake_engines(self, cuda_fails=True)
        with mock.patch("builtins.print") as p:
            out = wb.transcribe(Path("a.wav"), "es")
        self.assertEqual(calls, [("large-v3-turbo", "cuda", "float16"), ("large-v3-turbo", "cpu", "int8")])
        self.assertEqual(out, MLX_FIXTURE)
        self.assertIn("cudnn", p.call_args[0][0])

    def test_no_cuda_device_skips_the_cuda_attempt(self):
        calls, _ = install_fake_engines(self, cuda_count=0)
        wb.transcribe(Path("a.wav"), "es")
        self.assertEqual(calls, [("large-v3-turbo", "cpu", "int8")])

    def test_env_forces_cpu(self):
        calls, _ = install_fake_engines(self)
        os.environ["ESTUDIO_WHISPER_DEVICE"] = "cpu"
        wb.transcribe(Path("a.wav"), "es")
        self.assertEqual(calls, [("large-v3-turbo", "cpu", "int8")])

    def test_env_forced_cuda_does_not_fall_back(self):
        calls, _ = install_fake_engines(self, cuda_fails=True)
        os.environ["ESTUDIO_WHISPER_DEVICE"] = "cuda"
        with self.assertRaises(RuntimeError):
            wb.transcribe(Path("a.wav"), "es")
        self.assertEqual(calls, [("large-v3-turbo", "cuda", "float16")])

    def test_bad_env_value_is_an_error(self):
        install_fake_engines(self)
        os.environ["ESTUDIO_WHISPER_DEVICE"] = "gpu"
        with self.assertRaises(ValueError):
            wb.transcribe(Path("a.wav"), "es")


class MlxPathUnchanged(unittest.TestCase):
    def test_apple_silicon_calls_mlx_with_the_same_arguments_and_returns_it_untouched(self):
        raw = {"text": " x", "segments": [{"start": 0.0, "end": 1.0, "text": " x", "words": [], "tokens": [5], "extra": True}]}
        with mock.patch.object(sys, "platform", "darwin"), mock.patch.object(wb.platform, "machine", return_value="arm64"):
            _, mw = install_fake_engines(self, mlx_result=raw)
            out = wb.transcribe(Path("/tmp/a.wav"), "es", wb.MLX_MODEL)
        self.assertIs(out, raw)  # no normalization on macOS: the output stays byte-identical
        self.assertEqual(mw.calls, [("/tmp/a.wav", {"path_or_hf_repo": "mlx-community/whisper-large-v3-turbo", "word_timestamps": True,
                                                     "language": "es", "verbose": None})])


if __name__ == "__main__":
    unittest.main()
