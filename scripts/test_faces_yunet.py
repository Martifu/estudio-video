"""Face tracking off macOS: faces_yunet.py (schema and geometry, same as faces.swift) and overlay.track_faces' source-tagged
cache. No OpenCV or model needed: cv2 and the detector are faked. Run: python -m unittest discover -s scripts -p 'test_faces_yunet.py'
"""
import importlib.util, json, shutil, sys, tempfile, types, unittest
from pathlib import Path
from unittest import mock

import numpy as np  # imported before any sys.modules patching (re-importing numpy in one process fails)

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import faces_yunet as fy  # noqa: E402


def load_overlay():
    spec = importlib.util.spec_from_file_location("estudio_overlay_test", HERE / "overlay.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


class Geometry(unittest.TestCase):
    def test_canvas_frame_is_identity(self):
        self.assertEqual(fy.to_canvas(479, 791, 255, 255, 1080, 1920), [479, 791, 255, 255])

    def test_cover_fit_of_a_landscape_frame(self):
        # 1920x1080 frame -> cover fit to 1080x1920: k = 1920/1080 (height limits), horizontal offset ox = (1080 - 1920*k)/2
        k = 1920 / 1080
        ox = (1080 - 1920 * k) / 2
        got = fy.to_canvas(800, 400, 200, 200, 1920, 1080)
        self.assertEqual(got, [round(800 * k + ox), round(400 * k), round(200 * k), round(200 * k)])
        self.assertEqual(got, [256, 711, 356, 356])

    def test_clipping_to_canvas(self):
        got = fy.to_canvas(-50, -50, 200, 200, 1080, 1920)
        self.assertEqual(got, [0, 0, 150, 150])
        self.assertEqual(fy.to_canvas(1000, 1900, 300, 300, 1080, 1920), [1000, 1900, 80, 20])

    def test_rounding_is_half_up_like_swift(self):
        self.assertEqual(fy._round(2.5), 3)
        self.assertEqual(fy._round(2.49), 2)


class FakeCV2(types.ModuleType):
    """cv2 stand-in: imread returns a 1920x1080 array; FaceDetectorYN returns one face per frame, boxes from `faces_by_frame`."""
    def __init__(self, faces_by_frame):
        super().__init__("cv2")
        self.faces_by_frame = faces_by_frame
        self.seen = []
        outer = self

        class FaceDetectorYN:
            @staticmethod
            def create(model, cfg, size, score, nms, topk):
                outer.model_args = (model, size, score)
                return FaceDetector()

        class FaceDetector:
            def __init__(self):
                self.size = None
                self.frame = 0

            def setInputSize(self, size):
                self.size = size

            def detect(self, img):
                self.frame += 1
                outer.seen.append(img.shape)
                rows = outer.faces_by_frame.get(outer.current, None)
                if not rows:
                    return (1, None)
                return (1, np.array(rows, dtype=np.float32))

        self.FaceDetectorYN = FaceDetectorYN
        self.current = None

    def imread(self, path):
        self.current = int(Path(path).stem)
        return np.zeros((1920, 1080, 3), dtype=np.uint8)


class DetectSchema(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp(prefix="yunet-test-"))
        self.addCleanup(shutil.rmtree, self.dir, True)
        for i in range(1, 8):  # 7 frames -> samples at f = 1, 4, 7
            (self.dir / f"{i:04d}.jpg").write_bytes(b"x")

    def run_detect(self, faces_by_frame):
        cv2 = FakeCV2(faces_by_frame)
        with mock.patch.dict(sys.modules, {"cv2": cv2}), mock.patch.object(fy, "ensure_model", return_value=Path("/nonexistent/model.onnx")):
            return fy.detect(self.dir, step=3), cv2

    def test_document_has_the_faces_swift_keys(self):
        doc, _ = self.run_detect({})
        self.assertEqual(set(doc), {"version", "n", "step", "fps", "detected", "samples"})
        self.assertEqual((doc["version"], doc["n"], doc["step"], doc["fps"], doc["detected"]), (1, 7, 3, 30, 0))
        self.assertEqual([s["f"] for s in doc["samples"]], [1, 4, 7])
        for s in doc["samples"]:
            self.assertEqual(set(s), {"f", "face", "person"})
            self.assertIsNone(s["face"])
            self.assertIsNone(s["person"])  # YuNet has no body detector

    def test_largest_face_wins_and_is_canvas_pixels(self):
        rows = [10, 10, 40, 40, 0, 0, 0, 0, 0, 0, 0, 0, 0.9], [100, 200, 300, 320, 0, 0, 0, 0, 0, 0, 0, 0, 0.8]
        doc, cv2 = self.run_detect({1: rows, 4: rows[:1]})
        s1, s4, s7 = doc["samples"]
        self.assertEqual(s1["face"], [100, 200, 300, 320])
        self.assertEqual(s4["face"], [10, 10, 40, 40])
        self.assertIsNone(s7["face"])
        self.assertEqual(doc["detected"], 2)
        self.assertEqual(cv2.model_args[1], (1080, 1920))
        self.assertEqual(cv2.seen[0], (1920, 1080, 3))

    def test_missing_frames_dir_raises(self):
        empty = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, empty, True)
        with mock.patch.dict(sys.modules, {"cv2": FakeCV2({})}):
            with self.assertRaises(ValueError):
                fy.detect(empty)


class TrackFacesCache(unittest.TestCase):
    """overlay.track_faces: the cache is accepted only when its source is this OS's backend ("yunet" off macOS, "vision" on it)."""

    def setUp(self):
        self.ov = load_overlay()
        self.t = Path(tempfile.mkdtemp(prefix="track-test-"))
        self.addCleanup(shutil.rmtree, self.t, True)
        self.clip = self.t / "clip.mov"
        self.clip.write_bytes(b"0" * 100)
        self.run = self.t / "run"
        (self.run / "footage" / "clip").mkdir(parents=True)
        self.doc = {"version": 1, "n": 4, "step": 3, "fps": 30, "detected": 1,
                    "samples": [{"f": 1, "face": [1, 2, 3, 4], "person": None}, {"f": 4, "face": None, "person": None}]}

    def cache_path(self):
        return self.run / "footage" / "clip" / "faces.json"

    def test_yunet_result_is_cached_with_its_source_tag_and_reused(self):
        with mock.patch.object(sys, "platform", "linux"), mock.patch.object(fy, "detect", return_value=dict(self.doc)) as det:
            out = self.ov.track_faces(self.clip, self.run, "clip", 4)
            self.assertEqual(out["source"], "yunet")
            self.assertEqual(json.loads(self.cache_path().read_text())["source"], "yunet")
            again = self.ov.track_faces(self.clip, self.run, "clip", 4)
        self.assertEqual(det.call_count, 1)  # second call read the cache
        self.assertEqual(again["source"], "yunet")

    def test_vision_cache_is_recomputed_off_macos(self):
        self.cache_path().write_text(json.dumps({**self.doc, "source": "vision", "key": self.key()}))
        with mock.patch.object(sys, "platform", "win32"), mock.patch.object(fy, "detect", return_value=dict(self.doc)) as det:
            out = self.ov.track_faces(self.clip, self.run, "clip", 4)
        self.assertEqual(det.call_count, 1)
        self.assertEqual(out["source"], "yunet")

    def test_yunet_cache_is_recomputed_on_macos(self):
        self.cache_path().write_text(json.dumps({**self.doc, "source": "yunet", "key": self.key()}))
        with mock.patch.object(sys, "platform", "darwin"), mock.patch.object(fy, "detect") as det, \
                mock.patch.object(self.ov.subprocess, "run", side_effect=OSError("swiftc not found")):
            out = self.ov.track_faces(self.clip, self.run, "clip", 4)
        det.assert_not_called()  # macOS never uses the YuNet result
        self.assertEqual(out["source"], "default")

    def test_no_face_gives_the_default_box_and_writes_no_cache(self):
        empty = dict(self.doc, detected=0, samples=[{"f": 1, "face": None, "person": None}])
        with mock.patch.object(sys, "platform", "linux"), mock.patch.object(fy, "detect", return_value=empty):
            out = self.ov.track_faces(self.clip, self.run, "clip", 4)
        self.assertEqual((out["source"], out["samples"]), ("default", []))
        self.assertFalse(self.cache_path().exists())

    def test_missing_backend_gives_the_default_box(self):
        with mock.patch.object(sys, "platform", "linux"), mock.patch.object(fy, "detect", side_effect=ImportError("No module named cv2")):
            out = self.ov.track_faces(self.clip, self.run, "clip", 4)
        self.assertEqual(out["source"], "default")

    def test_backend_tag(self):
        with mock.patch.object(sys, "platform", "darwin"):
            self.assertEqual(self.ov.face_backend_tag(), "vision")
        with mock.patch.object(sys, "platform", "win32"):
            self.assertEqual(self.ov.face_backend_tag(), "yunet")

    def key(self):
        st = self.clip.stat()
        return {"n": 4, "clip": str(self.clip), "size": st.st_size, "mtime": int(st.st_mtime)}


class ModelPin(unittest.TestCase):
    def test_model_url_is_pinned_to_a_commit_not_a_branch(self):
        self.assertIn("/raw/", fy.MODEL_URL)
        self.assertNotIn("/main/", fy.MODEL_URL)
        self.assertRegex(fy.MODEL_URL.split("/raw/", 1)[1].split("/", 1)[0], r"^[0-9a-f]{40}$")
        self.assertRegex(fy.MODEL_SHA256, r"^[0-9a-f]{64}$")

    def test_ensure_model_rejects_a_wrong_file_without_download(self):
        d = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, d, True)
        with mock.patch.object(fy.paths, "model_dir", return_value=d):
            with self.assertRaises(FileNotFoundError):
                fy.ensure_model(download=False)
            (d / fy.MODEL_NAME).write_bytes(b"not onnx")
            with self.assertRaises(FileNotFoundError):
                fy.ensure_model(download=False)  # present but wrong content is not accepted either


if __name__ == "__main__":
    unittest.main()
