"""python3 -I engine/studio/test/test_products.py  (run with the skill venv: needs Pillow, numpy, scipy)
Product photo normalization (validate_asset.py --process-product), cutout quality checks on synthetic masks (cutout.py) and paths.py."""
import io, json, os, subprocess, sys, tempfile, unittest
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[3] / "scripts"
sys.path.insert(0, str(SCRIPTS))
import numpy as np  # noqa: E402
from PIL import Image  # noqa: E402
import cutout as C  # noqa: E402
import paths as P  # noqa: E402
import validate_asset as V  # noqa: E402


def mask(fn, h=400, w=400):
    a = np.zeros((h, w), np.uint8)
    fn(a)
    return a


class Quality(unittest.TestCase):
    def test_good_mask_has_no_warnings(self):
        w, st = C.quality(mask(lambda a: a.__setitem__((100, 100, 300, 300), 255) if False else a.__setitem__((slice(100, 300), slice(100, 300)), 255)))
        self.assertEqual(w, [])
        self.assertEqual(st["holes"], 0)
        self.assertAlmostEqual(st["coverage"], 0.25, places=2)

    def test_almost_empty_and_almost_full(self):
        w, _ = C.quality(mask(lambda a: a.__setitem__((slice(10, 20), slice(10, 20)), 255)))
        self.assertTrue(any("casi no se detectó" in x for x in w))
        w, _ = C.quality(mask(lambda a: a.fill(255)))
        self.assertTrue(any("casi no se quitó fondo" in x for x in w))

    def test_hard_hole_inside_product(self):
        def f(a):
            a[50:350, 50:350] = 255
            a[150:250, 150:250] = 0  # transparent island, not touching the border
        w, st = C.quality(mask(f))
        self.assertEqual(st["holes"], 1)
        self.assertTrue(any("hueco" in x for x in w))

    def test_notch_touching_the_border_is_not_a_hole(self):
        def f(a):
            a[50:350, 50:350] = 255
            a[0:200, 190:210] = 0
        self.assertEqual(C.quality(mask(f))[1]["holes"], 0)

    def test_very_soft_edges(self):
        def f(a):
            yy, xx = np.mgrid[0:400, 0:400]
            d = np.hypot(yy - 200, xx - 200)
            a[:] = np.clip((170 - d) / 60 * 255, 0, 255).astype(np.uint8)  # 60 px wide ramp
        w, st = C.quality(mask(f))
        self.assertGreater(st["edge_px"], C.SOFT_EDGE_PX)
        self.assertTrue(any("suaves" in x for x in w))


def png_bytes(im, **kw):
    b = io.BytesIO()
    im.save(b, "PNG", **kw)
    return b.getvalue()


class ProcessProduct(unittest.TestCase):
    def run_process(self, data, name="in.bin"):
        with tempfile.TemporaryDirectory() as d:
            src = Path(d) / name
            src.write_bytes(data)
            out = V.process_product(str(src), str(Path(d) / "out"))
            files = sorted(os.listdir(Path(d) / "out")) if (Path(d) / "out").exists() else []
            return out, files

    def test_mpo_drone_jpeg_is_accepted(self):
        b = io.BytesIO()
        Image.new("RGB", (800, 600), (30, 90, 160)).save(b, "MPO")
        self.assertTrue(b.getvalue().startswith(b"\xff\xd8\xff"))
        out, files = self.run_process(b.getvalue())
        self.assertTrue(out["ok"], out)
        self.assertEqual(files, [f"{out['sha8']}.jpg"])

    def test_opaque_photo_becomes_jpeg_content_addressed(self):
        im = Image.new("RGB", (800, 600), (200, 120, 40))
        out, files = self.run_process(png_bytes(im))
        self.assertTrue(out["ok"], out)
        self.assertEqual(files, [f"{out['sha8']}.jpg"])
        self.assertFalse(out["alpha"])
        self.assertEqual((out["width"], out["height"]), (800, 600))

    def test_same_bytes_same_name(self):
        data = png_bytes(Image.new("RGB", (700, 700), (1, 2, 3)))
        a, _ = self.run_process(data)
        b, _ = self.run_process(data)
        self.assertEqual(a["file"], b["file"])

    def test_alpha_kept_as_png(self):
        im = Image.new("RGBA", (700, 700), (0, 0, 0, 0))
        im.paste((255, 0, 0, 255), (100, 100, 600, 600))
        out, files = self.run_process(png_bytes(im))
        self.assertTrue(out["ok"] and out["alpha"])
        self.assertTrue(files[0].endswith(".png"))

    def test_big_image_downscaled_to_2048(self):
        out, _ = self.run_process(png_bytes(Image.new("RGB", (4000, 2000), (9, 9, 9))))
        self.assertEqual((out["width"], out["height"]), (2048, 1024))
        self.assertTrue(any("2048" in w for w in out["warnings"]))

    def test_exif_orientation_is_applied(self):
        im = Image.new("RGB", (800, 400), (50, 50, 50))
        exif = Image.Exif()
        exif[0x0112] = 6  # rotate 90 CW when displayed
        b = io.BytesIO()
        im.save(b, "JPEG", exif=exif)
        out, _ = self.run_process(b.getvalue())
        self.assertEqual((out["width"], out["height"]), (400, 800))

    def test_icc_profile_converted_to_srgb(self):
        from PIL import ImageCms
        prof = ImageCms.ImageCmsProfile(ImageCms.createProfile("sRGB")).tobytes()
        im = Image.new("RGB", (700, 700), (10, 200, 30))
        b = io.BytesIO()
        im.save(b, "JPEG", icc_profile=prof)
        out, _ = self.run_process(b.getvalue())
        self.assertTrue(out["ok"], out)

    def test_rejects_svg_garbage_and_tiny(self):
        out, _ = self.run_process(b"<svg xmlns='http://www.w3.org/2000/svg'></svg>")
        self.assertFalse(out["ok"])
        out, _ = self.run_process(b"not an image at all")
        self.assertFalse(out["ok"])
        out, _ = self.run_process(png_bytes(Image.new("RGB", (30, 30))))
        self.assertFalse(out["ok"])

    def test_small_photo_warns(self):
        out, _ = self.run_process(png_bytes(Image.new("RGB", (300, 300), (5, 5, 5))))
        self.assertTrue(out["ok"])
        self.assertTrue(any("pequeña" in w for w in out["warnings"]))


class Paths(unittest.TestCase):
    def test_data_dir_override_and_layout(self):
        os.environ["ESTUDIO_DATA_DIR"] = "/tmp/xx"
        try:
            self.assertEqual(str(P.data_dir()), "/tmp/xx")
            self.assertEqual(str(P.venv_python()), "/tmp/xx/venv/bin/python")
            self.assertEqual(str(P.model_dir()), "/tmp/xx/models")
        finally:
            del os.environ["ESTUDIO_DATA_DIR"]

    def test_default_is_per_user_app_dir(self):
        self.assertTrue(str(P.data_dir()).endswith("estudio-video"))


if __name__ == "__main__":
    unittest.main()
