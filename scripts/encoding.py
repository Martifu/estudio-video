"""H.264 encoder choice for the ffmpeg calls that are not part of the Node render (media_prepare.py, variants.py previews).

Default is libx264 with exactly the arguments these scripts always used (macOS output does not change).
ESTUDIO_VIDEO_ENCODER=h264_nvenc switches to the NVIDIA encoder (needs an ffmpeg build with NVENC and an NVIDIA GPU; opt-in).
"""
import os

NVENC = "h264_nvenc"


def video_codec_args(preview=False):
    enc = os.environ.get("ESTUDIO_VIDEO_ENCODER", "").strip().lower() or "libx264"
    if enc == "libx264":
        return ["-c:v", "libx264", "-crf", "30", "-preset", "veryfast"] if preview else ["-c:v", "libx264", "-preset", "medium", "-crf", "18"]
    if enc == NVENC:
        # constant quality (-cq with -b:v 0); p1 (fastest) for the small preview, p6 (slower, better) for the masters
        return ["-c:v", NVENC, "-preset", "p1", "-cq", "30", "-b:v", "0"] if preview else ["-c:v", NVENC, "-preset", "p6", "-cq", "19", "-b:v", "0"]
    raise ValueError(f"ESTUDIO_VIDEO_ENCODER must be libx264 or h264_nvenc (got {enc!r})")
