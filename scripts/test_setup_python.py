"""setup_python.py: interpreter candidates per OS, install hint, and the --gpu swap (pip calls faked).
Run: python -m unittest discover -s scripts -p 'test_setup_python.py'
"""
import os, sys, unittest
from pathlib import Path
from unittest import mock

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import setup_python as sp  # noqa: E402


class Candidates(unittest.TestCase):
    def test_windows_launcher_and_install_dirs_come_first(self):
        found = [r"C:\Users\m\AppData\Local\Programs\Python\Python313\python.exe",
                 r"C:\Users\m\AppData\Local\Programs\Python\Python312\python.exe"]
        with mock.patch.object(sp.paths, "is_windows", return_value=True), \
                mock.patch.dict(os.environ, {"LOCALAPPDATA": r"C:\Users\m\AppData\Local"}), \
                mock.patch.object(sp.glob, "glob", return_value=found) as g:
            c = sp.candidates()
        self.assertEqual(c[:4], [["py", "-3.12"], ["py", "-3.11"], ["py", "-3.13"], ["py", "-3.10"]])
        self.assertEqual(c[-1], ["py", "-3"])
        self.assertEqual([x[0] for x in c[4:6]], [found[1], found[0]])  # 3.12 install before 3.13
        pattern = g.call_args[0][0]
        self.assertTrue(pattern.endswith(os.path.join("Programs", "Python", "Python3*", "python.exe")), pattern)

    def test_posix_candidates_are_unchanged_paths(self):
        with mock.patch.object(sp.paths, "is_windows", return_value=False), \
                mock.patch.object(sp.glob, "glob", side_effect=lambda pat: ["/opt/homebrew/bin/python3.11"] if "homebrew" in pat else []):
            c = sp.candidates()
        self.assertEqual(c, [["/opt/homebrew/bin/python3.11"]])

    def test_hints(self):
        with mock.patch.object(sp.paths, "is_windows", return_value=True):
            self.assertIn("winget install Python.Python.3.12", sp.install_hint())
        with mock.patch.object(sp.paths, "is_windows", return_value=False):
            self.assertIn("brew install python@3.12", sp.install_hint())


class GpuSwap(unittest.TestCase):
    def test_gpu_uninstalls_cpu_onnxruntime_then_installs_gpu_requirements(self):
        calls = []

        def fake_pip(py, *args, check=True):
            calls.append(args)
            return None
        with mock.patch.object(sp, "pip", side_effect=fake_pip), mock.patch.object(sp, "has_dist", return_value=False), \
                mock.patch.object(sp.paths, "venv_python", return_value=Path("/v/python")), \
                mock.patch.object(sp.paths.Path, "exists", return_value=True), \
                mock.patch.object(sp.sys, "platform", "win32"), mock.patch.object(sp.sys, "argv", ["setup_python.py", "--gpu"]), \
                mock.patch("faces_yunet.ensure_model", create=True, return_value=Path("/m.onnx")), mock.patch("builtins.print"):
            sp.main()
        names = [c for c in calls]
        self.assertIn(("install", "-r", str(HERE / "requirements.txt")), names)
        self.assertIn(("uninstall", "-y", "onnxruntime"), names)
        self.assertIn(("install", "-r", str(HERE / "requirements-gpu.txt")), names)
        self.assertLess(names.index(("uninstall", "-y", "onnxruntime")), names.index(("install", "-r", str(HERE / "requirements-gpu.txt"))))

    def test_gpu_refused_on_macos(self):
        with mock.patch.object(sp.sys, "platform", "darwin"), mock.patch.object(sp.sys, "argv", ["setup_python.py", "--gpu"]):
            with self.assertRaises(SystemExit):
                sp.main()


if __name__ == "__main__":
    unittest.main()
