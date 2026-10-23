# tipo1-chat-rex: animated WhatsApp-like chat synced to the voice

Type-1 (motion graphics with voice) recipe that worked in the Reda UGC pilot (2026-10-20). Two reusable pieces: the phone chat composition and the Rex head avatar.

## 1. The chat composition (`~/Videos/reda/2026-10-20-ugc-rex/demo/index.html`)
A standalone engine composition (10.8 s, 1080x1920). A messaging-app mockup (phone at x 200, y 250, 680x1080) whose messages appear when the narrator says the matching word. Everything drawn is a pure function of `t`.

How it is wired (what to copy and change):
- **Run layout**: it lives at `<run>/demo/index.html` and loads `../brand.json`, `../assets/icon-only.png`, `../character/character.png` (presenter image, only used as a blurred, darkened background) and `../vo_demo/voice/words.json` (word timings of the voice-over, `[{text|word, start, end}]`).
- **Sync to words**: `wordAt("responde")` looks a normalized word up in `words.json` and returns its `start`; it throws if the word is missing, so a rewritten script fails loudly instead of drifting. The `T = {...}` map holds the anchor words; the `msgs` array lists each message as `{id, kind: "in"|"rex"|"cards"|"chip", text, t, typing?, label?}` where `t` is a word time (plus a small offset), `typing` is the seconds of "typing..." dots shown before a Rex message.
- **To reuse**: copy the file to the new run, replace the strings in `msgs` and the anchor words in `T`/`wordAt(...)` with words that exist in the new voice track, set `DURATION` to the voice length (+ tail), and update `NOTIFY_T` (the "new visit" notification). Message height, stacking and scroll are computed from the text, so no manual layout is needed. Keep chat text >= 34 px (it is a phone mockup, so smaller than `chatBubbles`; for big readable chat without a phone use `chatBubbles` instead).
- **SFX events**: the file builds `window.TIMELINE = {DURATION, events}` itself: one `pop` per message (x = 0.32 for client, 0.68 for Rex, 0.5 for the chip), a `whoosh` for the property cards, and a `notify` at `NOTIFY_T`. `node engine/render.mjs <run>/demo/index.html events` dumps them to `out/events.json`, and `scripts/mix.py` turns them into SFX with `assets/sfx/ui-map.json` (the pilot's output is in `demo/out/`: `demo-9x16.mp4`, `events.json`, `demo_vo_sfx.wav`, `demo-final.mp4`).
- **Render**: `node ~/.claude/skills/estudio-video/engine/render.mjs <run>/demo/index.html v`, then `mix.py <run>/demo --music <bed> --voice <voice.wav> --events <run>/demo/out/events.json --sfx-map <skill>/assets/sfx/ui-map.json`, then `render.mjs ... mux`. Use `preview-v t1,t2,...` to check frames first.
- Placeholder content in the pilot (property prices, "Depto 2 rec", "Casa 3 rec", the "3.5 millones" budget) is demo data, not claims: keep it clearly a demonstration (see `brand.json` `claims`).

## 2. Rex head avatar (`brands/reda/assets/rex_head.png`)
500x500 PNG of the Rex 3D head. `brand.json` registers it as `characters.rex.image`, which `loadBrand()` loads as the avatar for `chatBubbles` (round, 124 px, pop-in + bob, "Rex IA" tag under the first Rex bubble). For other brands, set `characters.rex.image` to any avatar (or leave it out: the avatar becomes an ink circle). The phone composition above does not use the head: it draws its own icon from `assets/icon-only.png`.

## 3. When to use which
- Narrated explainer with a phone mockup, messages timed word by word: this composition.
- Overlay on top of a talking person (type 2 or 3): `chatBubbles` in `--motion motion.json` (auto-placed away from the face), with the Rex head avatar.
