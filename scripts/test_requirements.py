"""Platform markers in scripts/requirements.txt and scripts/requirements-gpu.txt. Run: python -m unittest discover -s scripts -p 'test_requirements.py'

Each requirement line is parsed with packaging and its marker evaluated for the four platforms the skill supports, so a
missing or inverted marker (the old unmarked mlx-whisper broke `pip install -r` on Windows) fails here.
"""
import os
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
PLATFORMS = {
    "darwin-arm64": {"sys_platform": "darwin", "platform_machine": "arm64", "platform_system": "Darwin", "os_name": "posix"},
    "darwin-x86_64": {"sys_platform": "darwin", "platform_machine": "x86_64", "platform_system": "Darwin", "os_name": "posix"},
    "win32-AMD64": {"sys_platform": "win32", "platform_machine": "AMD64", "platform_system": "Windows", "os_name": "nt"},
    "linux-x86_64": {"sys_platform": "linux", "platform_machine": "x86_64", "platform_system": "Linux", "os_name": "posix"},
}
# distribution name -> platforms where it must be installed
EXPECTED = {
    "pillow": {"darwin-arm64", "darwin-x86_64", "win32-AMD64", "linux-x86_64"},
    "onnxruntime": {"darwin-arm64", "darwin-x86_64", "win32-AMD64", "linux-x86_64"},
    "rembg": {"darwin-arm64", "darwin-x86_64", "win32-AMD64", "linux-x86_64"},
    "mlx-whisper": {"darwin-arm64"},
    "faster-whisper": {"darwin-x86_64", "win32-AMD64", "linux-x86_64"},
    "opencv-python-headless": {"win32-AMD64", "linux-x86_64"},  # macOS uses Apple Vision, never OpenCV here
}
GPU_ONLY = {"onnxruntime-gpu", "nvidia-cublas-cu12", "nvidia-cudnn-cu12"}


def requirement_lines(path):
    for raw in Path(path).read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if line and not line.startswith("#"):
            yield line


class RequirementsMarkers(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        try:
            from packaging.requirements import Requirement
        except ImportError:
            raise unittest.SkipTest("packaging is not installed in this interpreter")
        cls.Requirement = Requirement

    def installed_on(self, path):
        """{distribution name: set of platforms where its requirement applies}"""
        out = {}
        for line in requirement_lines(path):
            req = self.Requirement(line)
            name = req.name.lower()
            on = {p for p, env in PLATFORMS.items() if req.marker is None or req.marker.evaluate(env)}
            out[name] = on
        return out

    def test_every_line_parses_and_only_known_markers(self):
        for path in (HERE / "requirements.txt", HERE / "requirements-gpu.txt"):
            for line in requirement_lines(path):
                self.Requirement(line)  # raises on invalid syntax

    def test_expected_install_set_per_platform(self):
        reqs = self.installed_on(HERE / "requirements.txt")
        for name, want in EXPECTED.items():
            self.assertEqual(reqs.get(name, set()), want, f"{name} applies to {sorted(reqs.get(name, set()))}")

    def test_mlx_only_on_apple_silicon_and_faster_whisper_everywhere_else(self):
        reqs = self.installed_on(HERE / "requirements.txt")
        self.assertEqual(reqs["mlx-whisper"], {"darwin-arm64"})
        self.assertEqual(reqs["faster-whisper"] | reqs["mlx-whisper"], set(PLATFORMS))
        self.assertFalse(reqs["faster-whisper"] & reqs["mlx-whisper"], "mlx-whisper and faster-whisper must never both install")

    def test_cpu_onnxruntime_is_unmarked_and_gpu_build_is_not_in_base_file(self):
        reqs = self.installed_on(HERE / "requirements.txt")
        self.assertEqual(reqs["onnxruntime"], set(PLATFORMS))
        self.assertNotIn("onnxruntime-gpu", reqs)
        self.assertFalse(GPU_ONLY & set(reqs), "GPU wheels must stay in requirements-gpu.txt (opt-in)")

    def test_gpu_file_lists_the_cuda_wheels(self):
        names = {self.Requirement(l).name.lower() for l in requirement_lines(HERE / "requirements-gpu.txt")}
        self.assertEqual(names, GPU_ONLY)

    def test_marker_strings_as_documented(self):
        lines = {self.Requirement(l).name.lower(): self.Requirement(l) for l in requirement_lines(HERE / "requirements.txt")}
        self.assertEqual(str(lines["mlx-whisper"].marker), 'sys_platform == "darwin" and platform_machine == "arm64"')
        self.assertEqual(str(lines["opencv-python-headless"].marker), 'sys_platform != "darwin"')


if __name__ == "__main__":
    unittest.main()
