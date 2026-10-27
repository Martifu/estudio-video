"""paths.py helpers (venv layout per OS, data dir, `--python` command) and the re-exec shim used by qa_speech.py and mix.py.
Run: python -m unittest discover -s scripts -p 'test_paths_reexec.py'
"""
import os, subprocess, sys, tempfile, unittest
from pathlib import Path
from unittest import mock

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import paths  # noqa: E402


class VenvLayout(unittest.TestCase):
    def test_windows_layout(self):
        with mock.patch.object(sys, "platform", "win32"):
            v = Path("C:/x/venv")
            self.assertEqual(paths.venv_bin(v, "python"), v / "Scripts" / "python.exe")
            self.assertEqual(paths.venv_bin(v, "earshot"), v / "Scripts" / "earshot.exe")

    def test_posix_layout(self):
        for plat in ("darwin", "linux"):
            with self.subTest(plat=plat), mock.patch.object(sys, "platform", plat):
                v = Path("/x/venv")
                self.assertEqual(paths.venv_bin(v, "python"), v / "bin" / "python")
                self.assertEqual(paths.venv_bin(v, "earshot"), v / "bin" / "earshot")

    def test_venv_python_follows_the_data_dir_override(self):
        with mock.patch.dict(os.environ, {"ESTUDIO_DATA_DIR": "/tmp/estudio-data-x"}):
            self.assertEqual(paths.venv_python(), paths.venv_dir() / "bin" / "python")
            with mock.patch.object(sys, "platform", "win32"):
                self.assertEqual(paths.venv_python(), Path("/tmp/estudio-data-x") / "venv" / "Scripts" / "python.exe")

    def test_data_dir_per_os(self):
        with mock.patch.dict(os.environ, {"LOCALAPPDATA": "C:\\Users\\m\\AppData\\Local"}, clear=False):
            os.environ.pop("ESTUDIO_DATA_DIR", None)
            with mock.patch.object(sys, "platform", "win32"):
                self.assertEqual(paths.data_dir(), Path("C:\\Users\\m\\AppData\\Local") / "estudio-video")
        with mock.patch.dict(os.environ, {}, clear=False):
            os.environ.pop("ESTUDIO_DATA_DIR", None)
            with mock.patch.object(sys, "platform", "darwin"):
                self.assertEqual(paths.data_dir().parts[-3:], ("Library", "Application Support", "estudio-video"))

    def test_windows_is_detected_from_sys_platform(self):
        with mock.patch.object(sys, "platform", "win32"):
            self.assertTrue(paths.is_windows())
        with mock.patch.object(sys, "platform", "darwin"):
            self.assertFalse(paths.is_windows())


class Reexec(unittest.TestCase):
    def test_posix_replaces_the_process_with_execv(self):
        with mock.patch.object(sys, "platform", "darwin"), mock.patch.object(paths.os, "execv") as ex, \
                mock.patch.object(paths.subprocess, "run") as run:
            paths.reexec(Path("/venv/bin/python"), ["qa_speech.py", "clip.mp4"])
        ex.assert_called_once_with("/venv/bin/python", ["/venv/bin/python", "qa_speech.py", "clip.mp4"])
        run.assert_not_called()

    def test_windows_runs_a_child_and_exits_with_its_code(self):
        with mock.patch.object(sys, "platform", "win32"), mock.patch.object(paths.os, "execv") as ex, \
                mock.patch.object(paths.subprocess, "run", return_value=subprocess.CompletedProcess([], 3)) as run:
            with self.assertRaises(SystemExit) as cm:
                paths.reexec(Path("C:/venv/Scripts/python.exe"), ["mix.py", "--run", "R"])
        self.assertEqual(cm.exception.code, 3)
        ex.assert_not_called()  # execv does not replace the process on Windows
        run.assert_called_once_with([str(Path("C:/venv/Scripts/python.exe")), "mix.py", "--run", "R"])

    def test_scripts_use_the_shim_not_execv(self):
        for name in ("qa_speech.py", "mix.py"):
            src = (HERE / name).read_text(encoding="utf-8")
            self.assertNotIn("os.execv", src, name)
            self.assertIn("paths.reexec(", src, name)


class PathsCli(unittest.TestCase):
    def run_cli(self, *args):
        return subprocess.run([sys.executable, str(HERE / "paths.py"), *args], capture_output=True, text=True, check=True).stdout.strip()

    def test_python_flag_prints_the_venv_interpreter(self):
        with tempfile.TemporaryDirectory() as d:
            env = {**os.environ, "ESTUDIO_DATA_DIR": d}
            out = subprocess.run([sys.executable, str(HERE / "paths.py"), "--python"], capture_output=True, text=True, check=True, env=env).stdout.strip()
            want = Path(d) / "venv" / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
            self.assertEqual(Path(out), want)

    def test_without_flag_prints_the_data_dir(self):
        with tempfile.TemporaryDirectory() as d:
            env = {**os.environ, "ESTUDIO_DATA_DIR": d}
            out = subprocess.run([sys.executable, str(HERE / "paths.py")], capture_output=True, text=True, check=True, env=env).stdout.strip()
            self.assertEqual(Path(out), Path(d))


if __name__ == "__main__":
    unittest.main()
