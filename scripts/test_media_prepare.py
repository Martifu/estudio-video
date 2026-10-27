"""Tests for scripts/media_prepare.py. Needs Pillow + ffmpeg:
  <skill venv python> -m unittest discover -s scripts -p test_media_prepare.py   (<skill venv python> = python3 scripts/paths.py --python)
"""
import importlib.util, io, json, subprocess, tempfile, unittest
from contextlib import redirect_stdout
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("media_prepare", HERE / "media_prepare.py")
mp = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mp)


def ff(*args):
    subprocess.run(["ffmpeg", "-v", "error", "-y", *args], check=True)


class MediaPrepare(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        t = Path(cls.tmp.name).resolve()
        cls.t = t
        ff("-f", "lavfi", "-i", "testsrc=size=320x240:rate=30:duration=1", "-f", "lavfi", "-i", "sine=duration=1", "-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", str(t / "v.mp4"))
        ff("-f", "lavfi", "-i", "testsrc=size=320x240:rate=30:duration=1", "-c:v", "libx264", "-pix_fmt", "yuv420p", str(t / "silent.mp4"))
        ff("-f", "lavfi", "-i", "sine=duration=1", str(t / "a.wav"))
        Image.new("RGB", (64, 96), (10, 200, 10)).save(t / "i.png")
        (t / "fake.mp4").write_text("nope")
        (t / "trunc.png").write_bytes((t / "i.png").read_bytes()[:40])

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def test_probe_video(self):
        r = mp.probe_video(self.t / "v.mp4")
        self.assertTrue(r["ok"])
        self.assertEqual((r["width"], r["height"], r["hasAudio"]), (320, 240, True))
        self.assertAlmostEqual(r["duration"], 1.0, delta=0.1)
        self.assertFalse(mp.probe_video(self.t / "silent.mp4")["hasAudio"])

    def test_probe_video_rejects(self):
        self.assertIn("no es un video que se pueda leer", mp.probe_video(self.t / "fake.mp4")["error"])
        self.assertIn("solo audio", mp.probe_video(self.t / "a.wav")["error"])
        self.assertIn("imagen", mp.probe_video(self.t / "i.png")["error"])

    def test_probe_audio(self):
        self.assertTrue(mp.probe_audio(self.t / "a.wav")["ok"])
        self.assertIn("trae video", mp.probe_audio(self.t / "v.mp4")["error"])
        self.assertIn("audio no se puede leer", mp.probe_audio(self.t / "fake.mp4")["error"])

    def test_image(self):
        self.assertEqual(mp.check_image(self.t / "i.png")["format"], "PNG")
        self.assertIn("dañada", mp.check_image(self.t / "trunc.png")["error"])
        self.assertIn("dañada", mp.check_image(self.t / "fake.mp4")["error"])

    def test_to_wav(self):
        r = mp.to_wav(self.t / "v.mp4", self.t / "o.wav")  # the audio of a video also works
        self.assertTrue(r["ok"])
        info = json.loads(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "stream=sample_rate,channels,codec_name", "-of", "json", str(self.t / "o.wav")], capture_output=True, text=True).stdout)["streams"][0]
        self.assertEqual((info["sample_rate"], info["channels"], info["codec_name"]), ("48000", 2, "pcm_s16le"))
        self.assertFalse(mp.to_wav(self.t / "fake.mp4", self.t / "x.wav")["ok"])

    def test_image_clip_and_prepare_clip(self):
        out = self.t / "imgclip-test.mp4"
        r = mp.image_clip(self.t / "i.png", out, 1.0)
        self.assertTrue(r["ok"])
        run = self.t / "run"
        run.mkdir()
        c = mp.prepare_clip(run, out)
        self.assertEqual(c["name"], "imgclip-test")  # overlay.slug(stem)
        self.assertEqual(c["n"], 30)
        self.assertEqual(len(list((run / "footage" / "imgclip-test").glob("*.jpg"))), 30)
        self.assertTrue((run / "footage" / "imgclip-test" / "audio.wav").exists())
        self.assertEqual((run / "footage" / "imgclip-test" / "words.json").read_text(), "[]")
        self.assertIn(c["faces"]["source"], ("default", "vision", "yunet"))
        # the stamp matches what `overlay.py --reuse-footage` computes: a second extract with reuse=True is a no-op
        ov = mp.load_overlay()
        buf = io.StringIO()
        with redirect_stdout(buf):
            n, dur = ov.extract(out.resolve(), run, "imgclip-test", reuse=True)
        self.assertIn("reused", buf.getvalue())
        self.assertEqual(n, 30)

    def test_sidecar_words_are_copied(self):
        clip = self.t / "withwords.mp4"
        clip.write_bytes((self.t / "silent.mp4").read_bytes())
        (self.t / "withwords.words.json").write_text('[{"word":"hola","start":0.1,"end":0.4}]')
        run = self.t / "run2"
        run.mkdir()
        c = mp.prepare_clip(run, clip)
        self.assertEqual(json.loads((run / "footage" / c["name"] / "words.json").read_text())[0]["word"], "hola")


if __name__ == "__main__":
    unittest.main()
