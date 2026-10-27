"""Tests for the --sfx-doc path of scripts/mix.py (mirror of engine/sfx-doc.js mergeSfx).
Run with a python that has numpy/soundfile/librosa/scipy (the earshot venv):
  <earshot venv python> -m unittest scripts/test_mix_sfx_doc.py   (~/tools/earshot/.venv; Scripts/python.exe on Windows)
"""
import importlib.util, json, subprocess, sys, tempfile, unittest
from pathlib import Path

import numpy as np
import soundfile as sf

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("mix", HERE / "mix.py")
mix = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mix)

# same events and doc as engine/sfx-doc.test.mjs ("mergeSfx applies overrides ...")
EVENTS = [
    {"t": 1, "type": "pop", "x": -0.5, "key": "kw1:pop"},
    {"t": 2.5, "type": "whoosh", "x": 0.2, "key": "#1:whoosh"},
    {"t": 4, "type": "pop", "x": 0, "key": "ws:pop:0"},
    {"t": 4.5, "type": "pop", "x": 0, "key": "ws:pop:1"},
    {"t": 6.126, "type": "notify", "x": 0},
]
DOC = {
    "version": 1,
    "events": {"kw1:pop": {"t": 3, "gainDb": -3}, "#1:whoosh": {"muted": True}, "ws:pop:1": {"src": "lib:ding", "gainDb": 2}, "gone:pop": {"t": 9}},
    "added": [{"id": "a1", "t": 0.5, "src": "kit:pop", "label": "Clic"}, {"id": "a2", "t": 4, "src": "path:assets/media/audio-ab12cd34.wav", "gainDb": -6}],
}


class SfxDoc(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.run_dir = Path(self.tmp.name) / "run"
        (self.run_dir / "assets" / "media").mkdir(parents=True)
        sf.write(str(self.run_dir / "assets" / "media" / "audio-ab12cd34.wav"), np.zeros((4800, 2), dtype="float32"), 48000)

    def tearDown(self):
        self.tmp.cleanup()

    def test_key_fallback_matches_js(self):
        self.assertEqual(mix.ev_key(EVENTS[0]), "kw1:pop")
        self.assertEqual(mix.ev_key(EVENTS[4]), "notify@6.13")

    def test_merge_parity_with_js(self):
        out = mix.apply_sfx_doc(EVENTS, DOC, self.run_dir)
        # JS: ["a1", "#1:whoosh"(muted -> dropped here), "kw1:pop", "ws:pop:0", "a2", "ws:pop:1", "notify@6.13"]
        self.assertEqual([mix.ev_key(e) for e in out], ["a1", "kw1:pop", "ws:pop:0", "a2", "ws:pop:1", "notify@6.13"])
        self.assertEqual([e["t"] for e in out], [0.5, 3.0, 4, 4.0, 4.5, 6.126])
        kw = out[1]
        self.assertEqual(kw["_gain_off"], -3.0)
        self.assertNotIn("_spec", kw)
        ws = out[4]
        ding = json.loads((HERE.parent / "assets/sfx/lib/index.json").read_text())["sounds"]
        base = next(s for s in ding if s["id"] == "ding")["gain_db"]
        self.assertEqual(ws["_spec"]["gain_db"], base + 2)
        a2 = out[3]
        self.assertEqual(a2["type"], "custom")
        self.assertEqual(a2["_spec"]["gain_db"], mix.PATH_DEFAULT_GAIN_DB - 6)
        self.assertEqual(out[0]["label"], "Clic")
        # input untouched
        self.assertNotIn("_gain_off", EVENTS[0])

    def test_without_doc_keys_events_are_unchanged(self):
        self.assertEqual(mix.apply_sfx_doc(EVENTS, {}, self.run_dir), EVENTS)

    def test_src_resolution_and_path_confinement(self):
        r = mix.resolve_sfx_src("lib:subida", self.run_dir)
        self.assertEqual(r["anchor"], "end")
        self.assertTrue(Path(r["file"]).exists())
        k = mix.resolve_sfx_src("kit:whoosh", self.run_dir)
        self.assertEqual(k["gain_db"], -19)
        self.assertTrue(Path(k["file"]).exists())
        ok = mix.resolve_sfx_src("path:assets/media/audio-ab12cd34.wav", self.run_dir)
        self.assertEqual(Path(ok["file"]), (self.run_dir / "assets/media/audio-ab12cd34.wav").resolve())
        for bad in ["path:../x.wav", "path:/etc/passwd", "path:a/../../x.wav", "path:", "path:http://x/y.wav", "path:.studio/x", "lib:nope", "lib:a/b", "kit:boom", "x:y", "nocolon", None, 5]:
            self.assertIsNone(mix.resolve_sfx_src(bad, self.run_dir), bad)
        # a symlink inside the RUN pointing outside is refused too
        (self.run_dir / "link").symlink_to(Path(self.tmp.name))
        self.assertIsNone(mix.resolve_sfx_src("path:link/x.wav", self.run_dir))

    def test_unknown_sources_are_skipped_with_a_warning(self):
        doc = {"events": {"kw1:pop": {"src": "lib:nope"}}, "added": [{"id": "z", "t": 1, "src": "lib:nope"}]}
        out = mix.apply_sfx_doc(EVENTS, doc, self.run_dir)
        self.assertEqual(len(out), len(EVENTS))  # default sound stays, the added one is skipped
        self.assertNotIn("_spec", out[0])

    def test_bundled_library_plays_without_earshot(self):
        idx = json.loads((HERE.parent / "assets/sfx/lib/index.json").read_text())
        self.assertGreaterEqual(len(idx["sounds"]), 20)
        for s in idx["sounds"]:
            info = sf.info(str(HERE.parent / "assets/sfx/lib" / s["file"]))
            self.assertEqual(info.samplerate, 48000)
            self.assertLessEqual(info.duration, 3.0)
            self.assertAlmostEqual(info.duration, s["dur"], places=2)
        n = 48000 * 4
        events = mix.apply_sfx_doc([], {"added": [{"id": "r", "t": 2.0, "src": "lib:subida"}, {"id": "p", "t": 1.0, "src": "kit:pop", "gainDb": 3}]}, self.run_dir)
        bus, placed = mix.build_sfx_bus(events, mix.DEFAULT_MAP, n, 0.5, ".")
        self.assertEqual(len(placed), 2)
        self.assertGreater(float(np.abs(bus).max()), 0.0)
        # the riser anchors on its LAST sample: it must start before t=2 s and be silent after it
        riser_start = next(p[0] for p in placed if p[3] == "subida.wav")
        self.assertLess(riser_start, 1.0)
        self.assertLess(float(np.abs(bus[:, int(2.05 * 48000):]).max()), 1e-4)
        pop_gain = next(p[4] for p in placed if p[3] == "pop.wav")
        self.assertEqual(pop_gain, -14.0)  # -17 + 3

    def test_gain_offset_on_a_mapped_event(self):
        n = 48000 * 2
        cfg = mix.merge(mix.DEFAULT_MAP, json.loads((HERE.parent / "assets/sfx/ui-map.json").read_text()))
        base = mix.build_sfx_bus([{"t": 0.5, "type": "pop", "x": 0}], cfg, n, 0.0, HERE.parent / "assets/sfx")[1]
        trimmed = mix.build_sfx_bus([{"t": 0.5, "type": "pop", "x": 0, "_gain_off": -4.0}], cfg, n, 0.0, HERE.parent / "assets/sfx")[1]
        self.assertAlmostEqual(base[0][4] - 4.0, trimmed[0][4], places=1)


class NoMusic(unittest.TestCase):
    """mix.py --no-music: voice + SFX only, mastered like the music path."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        run = Path(self.tmp.name) / "run"
        self.comp = run / "comp"
        (self.comp / "out").mkdir(parents=True)
        t = np.arange(48000 * 4) / 48000
        sf.write(str(run / "voice.wav"), (0.2 * np.sin(2 * np.pi * 220 * t * (1 + 0.5 * (t % 1.0 < 0.5)))).astype("float32"), 48000)
        (self.comp / "out" / "events.json").write_text(json.dumps({"slug": "comp", "DURATION": 4.0, "events": [{"t": 1.0, "type": "pop", "x": 0, "key": "e1:pop"}]}))
        self.run = run

    def tearDown(self):
        self.tmp.cleanup()

    def mix(self, *extra):
        return subprocess.run([sys.executable, str(HERE / "mix.py"), str(self.comp), "--voice", str(self.run / "voice.wav"), "--sfx-map", str(HERE.parent / "assets/sfx/ui-map.json"), *extra], capture_output=True, text=True)

    def test_needs_exactly_one_of_music_or_no_music(self):
        r = self.mix()
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("--music", r.stderr)

    def test_voice_and_sfx_only_is_mastered(self):
        (self.comp / "sfx.json").write_text(json.dumps({"version": 1, "added": [{"id": "a", "t": 2.0, "src": "lib:ding"}]}))
        r = self.mix("--no-music", "--sfx-doc", str(self.comp / "sfx.json"), "--events", str(self.comp / "out" / "events.json"))
        self.assertEqual(r.returncode, 0, r.stderr)
        out = self.comp / "out" / "mix.wav"
        y, sr = sf.read(str(out))
        self.assertEqual(sr, 48000)
        self.assertAlmostEqual(len(y) / sr, 4.0, places=1)
        rep = json.loads((self.comp / "out" / "mix-report.json").read_text())
        self.assertEqual(len(rep["sfx"]), 2)  # the automatic pop and the added ding
        self.assertLess(abs(rep["lufs"] + 14.0), 1.0)
        self.assertLessEqual(rep["true_peak"], -0.9)
        self.assertIn("no music", "\n".join(rep["notes"]))
        # the ding at t=2 s is audible on top of the voice
        self.assertGreater(float(np.abs(y[int(2.0 * sr):int(2.3 * sr)]).max()), float(np.abs(y[int(3.2 * sr):int(3.6 * sr)]).max()) * 0.5)


if __name__ == "__main__":
    unittest.main()
