#!/usr/bin/env python3
"""Create / refresh the skill-managed venv (paths.data_dir()/venv) from scripts/requirements.txt. Stdlib only (macOS, Windows, Linux).
   python3 setup_python.py [--python /path/to/python3.12 | "py -3.12"] [--recreate] [--gpu]
Needs Python 3.10-3.13 (onnxruntime / numba wheels). Whatever interpreter runs this script, the venv is built from a REAL
CPython: uv/pyenv shims and version symlinks are resolved first, and when the current python is outside 3.10-3.13 a supported one
is searched (uv, Homebrew, pyenv on macOS/Linux; the py launcher, winget/python.org installs under %LOCALAPPDATA% on Windows).
--gpu (Windows/Linux with an NVIDIA GPU, opt-in): replaces the CPU onnxruntime with onnxruntime-gpu and installs
scripts/requirements-gpu.txt (CUDA/cuDNN wheels). Also downloads the YuNet face model (non-macOS, sha256-pinned).
Prints the venv interpreter path on success (`python scripts/paths.py --python` prints the same path without installing)."""
import argparse, glob, os, re, shlex, subprocess, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import paths  # noqa: E402

MIN, MAX = (3, 10), (3, 13)
PREF = {12: 0, 11: 1, 13: 2, 10: 3}  # best-tested wheels first


def install_hint():
    return "winget install Python.Python.3.12" if paths.is_windows() else "brew install python@3.12"


def probe(py):
    """(major, minor, real_executable) of an interpreter, or None when it does not run.
    `py` is a path or an argv prefix such as ["py", "-3.12"] (the Windows launcher)."""
    argv = [str(x) for x in py] if isinstance(py, (list, tuple)) else [str(py)]
    code = ("import sys,os;"
            "b=os.path.join(sys.base_prefix,'python.exe') if os.name=='nt' else os.path.join(sys.base_prefix,'bin','python%d.%d'%sys.version_info[:2]);"
            "print(*sys.version_info[:2]);print(os.path.realpath(b if os.path.exists(b) else sys.executable))")
    try:
        r = subprocess.run([*argv, "-I", "-c", code], capture_output=True, text=True, timeout=30)
        v, real = r.stdout.strip().splitlines()[:2]
        maj, mnr = map(int, v.split())
        return maj, mnr, real
    except Exception:
        return None


def candidates():
    """Interpreter commands to try, best first. Each entry is an argv prefix (a path, or ["py", "-3.12"])."""
    if paths.is_windows():
        local = os.environ.get("LOCALAPPDATA") or str(Path.home() / "AppData" / "Local")
        found = glob.glob(os.path.join(local, "Programs", "Python", "Python3*", "python.exe"))
        def minor(p):  # ...\Programs\Python\Python312\python.exe -> 12
            m = re.search(r"Python3(\d+)[\\/]python\.exe$", p, re.I)
            return int(m.group(1)) if m else 99
        launcher = [["py", "-3.12"], ["py", "-3.11"], ["py", "-3.13"], ["py", "-3.10"]]
        return launcher + [[p] for p in sorted(found, key=lambda p: PREF.get(minor(p), 9))] + [["py", "-3"]]
    home = Path.home()
    pats = [str(home / ".local/share/uv/python/cpython-3.1[0-3].*/bin/python3.1[0-3]"),
            "/opt/homebrew/bin/python3.1[0-3]", "/usr/local/bin/python3.1[0-3]",
            str(home / ".pyenv/versions/3.1[0-3].*/bin/python3.1[0-3]")]
    found = sorted(p for pat in pats for p in glob.glob(pat))
    return [[p] for p in sorted(found, key=lambda p: PREF.get(int(p.rsplit("python3.", 1)[1]), 9))]


def pick_base(explicit=None):
    """The real interpreter the venv is created from."""
    if explicit:
        argv = [explicit] if os.path.exists(explicit) or " " not in explicit else shlex.split(explicit)
        info = probe(argv)
        if not info:
            sys.exit(f"error: {explicit} does not run.")
        if not MIN <= info[:2] <= MAX:
            print(f"warning: Python {info[0]}.{info[1]} is outside 3.10-3.13; some wheels may be missing.", file=sys.stderr)
        return info[2]
    cur = probe(sys.executable)
    if cur and MIN <= cur[:2] <= MAX:
        return cur[2]
    for c in candidates():
        info = probe(c)
        if info and MIN <= info[:2] <= MAX:
            return info[2]
    print(f"warning: no Python 3.10-3.13 found (running {sys.version_info.major}.{sys.version_info.minor}); install one: {install_hint()}", file=sys.stderr)
    return cur[2] if cur else sys.executable


def pip(py, *args, check=True):
    return subprocess.run([str(py), "-m", "pip", "--disable-pip-version-check", *args], check=check)


def has_dist(py, name):
    return subprocess.run([str(py), "-m", "pip", "show", name], capture_output=True).returncode == 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--python", help="interpreter to build the venv from, e.g. /path/to/python3.12 or \"py -3.12\" "
                                     "(default: the running one, or a supported one found on this machine)")
    ap.add_argument("--recreate", action="store_true")
    ap.add_argument("--gpu", action="store_true", help="NVIDIA build: onnxruntime-gpu + CUDA/cuDNN wheels (requirements-gpu.txt)")
    a = ap.parse_args()
    if a.gpu and sys.platform == "darwin":
        sys.exit("error: --gpu needs an NVIDIA GPU; macOS uses the CPU build (and mlx-whisper).")
    py = paths.venv_python()
    if a.recreate or not py.exists():
        base = pick_base(a.python)
        paths.venv_dir().parent.mkdir(parents=True, exist_ok=True)
        cmd = [base, "-m", "venv", "--copies"] + (["--clear"] if a.recreate else []) + [str(paths.venv_dir())]
        subprocess.check_call(cmd)
    pip(py, "install", "-r", str(HERE / "requirements.txt"))
    # onnxruntime and onnxruntime-gpu provide the same module: keep exactly one. rembg pulls the CPU wheel in with the base install.
    if a.gpu or has_dist(py, "onnxruntime-gpu"):
        pip(py, "uninstall", "-y", "onnxruntime", check=False)
    if a.gpu:
        pip(py, "install", "-r", str(HERE / "requirements-gpu.txt"))
    if sys.platform != "darwin":
        import faces_yunet  # stdlib-only at import time
        try:
            print(f"YuNet face model: {faces_yunet.ensure_model()}")
        except Exception as e:
            print(f"warning: YuNet face model not downloaded ({e}); face tracking uses the centered default box until it is.", file=sys.stderr)
    print(py)


if __name__ == "__main__":
    main()
