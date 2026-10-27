#!/usr/bin/env python3
"""Platform data dir + interpreter helpers shared by the estudio-video scripts (stdlib only, no Apple-only calls).

  data_dir()      macOS   ~/Library/Application Support/estudio-video
                  Windows %LOCALAPPDATA%\\estudio-video
                  Linux   $XDG_DATA_HOME/estudio-video or ~/.local/share/estudio-video
                  (ESTUDIO_DATA_DIR overrides, for tests)
  venv_python()   the skill-managed venv interpreter (data_dir()/venv/bin/python, Scripts\\python.exe on Windows)
  venv_bin(venv, name)  any console script / interpreter inside a venv, same layout rule (earshot, python)
  model_dir()     where rembg keeps its ONNX weights (data_dir()/models); set as U2NET_HOME by cutout.py
  reexec(py, argv) run the script again under another interpreter (execv on POSIX, child process + exit code on Windows)

Command line: `python scripts/paths.py --python` prints the venv interpreter (use it in docs instead of a path);
without arguments it prints data_dir().

The platform is read inside each function (never at import time) so tests can patch sys.platform.
The node side mirrors the interpreter lookup in engine/studio/pyenv.mjs (ESTUDIO_PY -> venv_python() -> fallbacks).
"""
import argparse
import os
import subprocess
import sys
from pathlib import Path

APP = "estudio-video"


def is_windows():
    return sys.platform.startswith("win") or os.name == "nt"


def data_dir():
    override = os.environ.get("ESTUDIO_DATA_DIR")
    if override:
        return Path(override).expanduser()
    home = Path.home()
    if sys.platform == "darwin":
        return home / "Library" / "Application Support" / APP
    if is_windows():
        base = os.environ.get("LOCALAPPDATA") or str(home / "AppData" / "Local")
        return Path(base) / APP
    base = os.environ.get("XDG_DATA_HOME")
    return (Path(base) if base and os.path.isabs(base) else home / ".local" / "share") / APP


def venv_dir():
    return data_dir() / "venv"


def venv_bin(venv, name):
    """<venv>/Scripts/<name>.exe on Windows, <venv>/bin/<name> elsewhere."""
    venv = Path(venv)
    return venv / "Scripts" / f"{name}.exe" if is_windows() else venv / "bin" / name


def venv_python(venv=None):
    return venv_bin(venv if venv is not None else venv_dir(), "python")


def model_dir():
    return data_dir() / "models"


def reexec(python, argv):
    """Run this script again with `python` (argv = the original sys.argv). POSIX replaces the process (execv).
    Windows has no real exec: run a child, then exit with its code, so the caller never continues in this interpreter."""
    if is_windows():
        sys.exit(subprocess.run([str(python), *argv]).returncode)
    os.execv(str(python), [str(python), *argv])


def main(argv=None):
    ap = argparse.ArgumentParser(description="Print the estudio-video data dir, or the skill venv interpreter with --python.")
    ap.add_argument("--python", action="store_true", help="print the venv interpreter path for this OS")
    a = ap.parse_args(argv)
    print(venv_python() if a.python else data_dir())


if __name__ == "__main__":
    main()
