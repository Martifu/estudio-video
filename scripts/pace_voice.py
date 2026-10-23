"""Insert silence between voiceover beats for a calmer pace.

Usage: python3 pace_voice.py <comp-dir> <gap_s> [lead_s] [--src _fast] [--gaps b6=0.9,b7=0.4]
Reads <comp-dir>/voice/{master,beats,words}<src>.(wav|json); writes voice/paced.wav,
voice/paced_beats.json and voice/paced_words.json with shifted timestamps.
--gaps overrides the silence appended after specific beats (by beat id).
"""
import argparse
import json
import subprocess
from pathlib import Path

ap = argparse.ArgumentParser()
ap.add_argument("comp"); ap.add_argument("gap", type=float); ap.add_argument("lead", type=float, nargs="?", default=0.4)
ap.add_argument("--src", default=""); ap.add_argument("--gaps", default="")
args = ap.parse_args()
comp, gap, lead = Path(args.comp), args.gap, args.lead
overrides = {k: float(v) for k, v in (item.split("=") for item in args.gaps.split(",") if item)}
voice = comp / "voice"
master = voice / f"master{args.src}.wav"
beats = json.loads((voice / f"beats{args.src}.json").read_text())
words = json.loads((voice / f"words{args.src}.json").read_text())
gaps = [overrides.get(b["id"], gap) for b in beats]

# Cut each beat at the midpoint of the natural pause around it, so no breath or consonant is clipped.
bounds = [0.0] + [(a["end"] + b["start"]) / 2 for a, b in zip(beats, beats[1:])] + [None]
filters, labels, shifted_beats = [], [], []
offset = lead
for i, b in enumerate(beats):
    start, end = bounds[i], bounds[i + 1]
    trim = f"atrim=start={start}" + (f":end={end}" if end is not None else "")
    filters.append(f"[0:a]{trim},asetpts=PTS-STARTPTS[s{i}]")
    labels.append(f"[s{i}]")
    shift = offset - start
    shifted_beats.append({**b, "start": round(b["start"] + shift, 3), "end": round(b["end"] + shift, 3), "shift": round(shift, 3)})
    seg_len = (end if end is not None else b["end"] + 0.4) - start
    offset += seg_len + gaps[i]

for w in words:
    # Last beat that starts at or before the word (boundary words belong to the beat they open).
    beat = [sb for sb, bb in zip(shifted_beats, beats) if bb["start"] - 0.05 <= w["start"]][-1]
    w["start"] = round(w["start"] + beat["shift"], 3)
    w["end"] = round(w["end"] + beat["shift"], 3)

# Each segment gets its gap of silence appended (the first also gets the lead-in).
pads = [f"{labels[i]}apad=pad_dur={gaps[i]}{',adelay=' + str(int(lead * 1000)) + ':all=1' if i == 0 else ''}[p{i}]" for i in range(len(labels))]
graph = ";".join(filters + pads) + ";" + "".join(f"[p{i}]" for i in range(len(labels))) + f"concat=n={len(labels)}:v=0:a=1[out]"
subprocess.run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", str(master),
                "-filter_complex", graph, "-map", "[out]", "-ar", "44100", str(voice / "paced.wav")], check=True)
(voice / "paced_beats.json").write_text(json.dumps(shifted_beats, ensure_ascii=False, indent=1))
(voice / "paced_words.json").write_text(json.dumps(words, ensure_ascii=False, indent=0))
dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0",
                            str(voice / "paced.wav")], capture_output=True, text=True).stdout)
print(json.dumps({"paced_seconds": round(dur, 2), "beats": [[b["id"], b["start"], b["end"]] for b in shifted_beats]}))
