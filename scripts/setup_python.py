#!/usr/bin/env python3
"""Create / refresh the skill-managed venv (paths.data_dir()/venv) from scripts/requirements.txt. Stdlib only (macOS).
   python3 setup_python.py [--python /path/to/python3.11] [--recreate]
Needs Python 3.10-3.13 (onnxruntime / numba wheels). Whatever interpreter runs this script, the venv is built from a REAL
CPython: uv/pyenv shims and version symlinks (~/.local/bin/python3.11 -> ...) are resolved first, and when the current python is
outside 3.10-3.13 a supported one is searched (uv, Homebrew, pyenv). Prints the venv interpreter path on success."""
import argparse, glob, os, subprocess, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import paths  # noqa: E402

MIN, MAX = (3, 10), (3, 13)


def probe(py):
    """(major, minor, real_executable) of an interpreter, or None when it does not run."""
    code = "import sys,os;b=os.path.join(sys.base_prefix,'bin','python%d.%d'%sys.version_info[:2]);" \
           "print(*sys.version_info[:2]);print(os.path.realpath(b if os.path.exists(b) else sys.executable))"
    try:
        r = subprocess.run([str(py), "-I", "-c", code], capture_output=True, text=True, timeout=30)
        v, real = r.stdout.strip().splitlines()[:2]
        maj, mnr = map(int, v.split())
        return maj, mnr, real
    except Exception:
        return None


def candidates():
    home = Path.home()
    pats = [str(home / ".local/share/uv/python/cpython-3.1[0-3].*/bin/python3.1[0-3]"),
            "/opt/homebrew/bin/python3.1[0-3]", "/usr/local/bin/python3.1[0-3]",
            str(home / ".pyenv/versions/3.1[0-3].*/bin/python3.1[0-3]")]
    found = sorted(p for pat in pats for p in glob.glob(pat))
    pref = {12: 0, 11: 1, 13: 2, 10: 3}  # best-tested wheels first
    return sorted(found, key=lambda p: pref.get(int(p.rsplit("python3.", 1)[1]), 9))


def pick_base(explicit=None):
    """The real interpreter the venv is created from."""
    if explicit:
        info = probe(explicit)
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
    print(f"warning: no Python 3.10-3.13 found (running {sys.version_info.major}.{sys.version_info.minor}); install one: brew install python@3.12", file=sys.stderr)
    return cur[2] if cur else sys.executable


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--python", help="interpreter to build the venv from (default: the running one, or a supported one found on this Mac)")
    ap.add_argument("--recreate", action="store_true")
    a = ap.parse_args()
    py = paths.venv_python()
    if a.recreate or not py.exists():
        base = pick_base(a.python)
        paths.venv_dir().parent.mkdir(parents=True, exist_ok=True)
        cmd = [base, "-m", "venv", "--copies"] + (["--clear"] if a.recreate else []) + [str(paths.venv_dir())]
        subprocess.check_call(cmd)
    req = Path(__file__).resolve().parent / "requirements.txt"
    subprocess.check_call([str(py), "-m", "pip", "install", "--disable-pip-version-check", "-r", str(req)])
    print(py)


if __name__ == "__main__":
    main()
