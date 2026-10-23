"""Generate the full narration in ONE ElevenLabs take, optionally speed it up, and write word/beat timings.

Usage: tts.py RUN_DIR --voice VOICE_ID [--model eleven_v3] [--speed 1.15] [--tempo 1.10] [--stability 0.5] [--seed 4242]
Reads RUN_DIR/script.json (beats[].text). Writes RUN_DIR/voice/{raw.mp3,master.wav,timestamps.json,words.json,beats.json}.
Needs ELEVENLABS_API_KEY in the environment. Times in words/beats.json are seconds of master.wav (after tempo).
"""
import argparse, base64, json, os, re, subprocess, sys
from pathlib import Path
import requests

p = argparse.ArgumentParser()
p.add_argument('run'); p.add_argument('--voice', required=True); p.add_argument('--model', default='eleven_v3')
p.add_argument('--speed', type=float, default=1.0); p.add_argument('--tempo', type=float, default=1.0)
p.add_argument('--seed', type=int, default=4242); p.add_argument('--language', default='es')
p.add_argument('--stability', type=float, default=None)  # eleven_v3: 0.0 creative, 0.5 natural, 1.0 robust
a = p.parse_args()


def api_key():
    """ELEVENLABS_API_KEY from the environment, else from ~/.config/reels-dibujados/.env (shared by Claude Code and
    Codex; Codex runs commands in a login shell that does not read ~/.zshrc)."""
    if os.environ.get('ELEVENLABS_API_KEY'):
        return os.environ['ELEVENLABS_API_KEY']
    cfg = Path.home() / '.config/reels-dibujados/.env'
    if cfg.exists():
        for line in cfg.read_text().splitlines():
            if line.strip().startswith('ELEVENLABS_API_KEY='):
                return line.split('=', 1)[1].strip().strip('"\'')
    sys.exit('ELEVENLABS_API_KEY not set: export it or put ELEVENLABS_API_KEY=... in ~/.config/reels-dibujados/.env (chmod 600)')


run = Path(a.run); out = run / 'voice'; out.mkdir(exist_ok=True)
beats = json.loads((run / 'script.json').read_text())['beats']
text = ' '.join(b['text'] for b in beats)

r = requests.post(f'https://api.elevenlabs.io/v1/text-to-speech/{a.voice}/with-timestamps?output_format=mp3_44100_128',
                  headers={'xi-api-key': api_key()}, timeout=600,
                  json={'text': text, 'model_id': a.model, 'language_code': a.language, 'seed': a.seed,
                        'voice_settings': {'speed': a.speed, **({'stability': a.stability} if a.stability is not None else {})}})
r.raise_for_status()
j = r.json()
(out / 'raw.mp3').write_bytes(base64.b64decode(j.pop('audio_base64')))
(out / 'timestamps.json').write_text(json.dumps({**j, 'request': {'voice': a.voice, 'model': a.model, 'speed': a.speed, 'seed': a.seed, 'tempo': a.tempo}}, ensure_ascii=False))
al = j['alignment']; ch, st, en = al['characters'], al['character_start_times_seconds'], al['character_end_times_seconds']
assert ''.join(ch) == text, 'alignment text differs from script'

# Tempo change keeps pitch (atempo); timings scale linearly. Then pad 0.3 s of tail and a 12 ms end fade.
filters = (f'atempo={a.tempo},' if a.tempo != 1.0 else '') + 'apad=pad_dur=0.3'
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(out / 'raw.mp3'), '-af', filters, '-ar', '48000', '-ac', '1',
                '-c:a', 'pcm_s16le', str(out / 'master.wav')], check=True)
k = 1 / a.tempo
words = []
for m in re.finditer(r'\S+', text):
    if re.fullmatch(r'\[[^\]]+\]', m.group()):  # v3 audio tags like [sarcastic] are not spoken -> no caption word
        continue
    i, j2 = m.start(), m.end() - 1
    words.append({'text': m.group(), 'start': round(st[i] * k, 3), 'end': round(en[j2] * k, 3), 'char': i})
(out / 'words.json').write_text(json.dumps(words, ensure_ascii=False, indent=0))
pos, rows = 0, []
for b in beats:
    i = text.index(b['text'], pos); j2 = i + len(b['text']) - 1; pos = j2 + 1
    rows.append({'id': b['id'], 'text': b['text'], 'start': round(st[i] * k, 3), 'end': round(en[j2] * k, 3)})
(out / 'beats.json').write_text(json.dumps(rows, ensure_ascii=False, indent=1))
dur = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', str(out / 'master.wav')],
                           capture_output=True, text=True).stdout)
print(json.dumps({'chars': len(text), 'master_seconds': round(dur, 2), 'beats': len(rows), 'words': len(words)}))
