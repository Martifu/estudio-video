#!/usr/bin/env python3
"""Platform data dir + interpreter helpers shared by the estudio-video scripts (stdlib only, no Apple-only calls).

  data_dir()      macOS   ~/Library/Application Support/estudio-video
                  Windows %LOCALAPPDATA%\\estudio-video
                  Linux   $XDG_DATA_HOME/estudio-video or ~/.local/share/estudio-video
                  (ESTUDIO_DATA_DIR overrides, for tests)
  venv_python()   the skill-managed venv interpreter (data_dir()/venv/bin/python, Scripts\\python.exe on Windows)
  model_dir()     where rembg keeps its ONNX weights (data_dir()/models); set as U2NET_HOME by cutout.py

The node side mirrors the interpreter lookup in engine/studio/pyenv.mjs (ESTUDIO_PY -> venv_python() -> fallbacks).
"""
import os
import sys
from pathlib import Path

APP = "estudio-video"


def data_dir():
    override = os.environ.get("ESTUDIO_DATA_DIR")
    if override:
        return Path(override).expanduser()
    home = Path.home()
    if sys.platform == "darwin":
        return home / "Library" / "Application Support" / APP
    if os.name == "nt" or sys.platform.startswith("win"):
        base = os.environ.get("LOCALAPPDATA") or str(home / "AppData" / "Local")
        return Path(base) / APP
    base = os.environ.get("XDG_DATA_HOME")
    return (Path(base) if base and os.path.isabs(base) else home / ".local" / "share") / APP


def venv_dir():
    return data_dir() / "venv"


def venv_python():
    v = venv_dir()
    return v / "Scripts" / "python.exe" if os.name == "nt" else v / "bin" / "python"


def model_dir():
    return data_dir() / "models"


if __name__ == "__main__":
    print(data_dir())
