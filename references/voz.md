# Fase 4 · Voz

## Requisitos
- Plan ElevenLabs con uso comercial: **Starter** basta para voz (TTS comercial; revisar los créditos del mes en la cuenta). **Creator** solo si se necesita Eleven Music para streaming o más créditos; sin él, la música sale de audio-studio local. Free: no comercial + atribución, solo voces premade, sin Voice Design ni biblioteca por API.
- `scripts/tts.py` (lee la key de `~/.config/reels-dibujados/.env`; nunca la imprimas ni la copies). Si el MCP alojado de ElevenLabs está conectado, puedes usarlo para buscar voces y Eleven Music.

## Casting → 🛑 Parada 3
1. Busca 3 voces en español latino acordes al brief (biblioteca: `GET /v1/shared-voices?language=es&accent=…`, o Voice Design con una descripción tipo "mujer mexicana, 30 años, cálida, ritmo de creadora de contenido, acento neutro del centro de México").
2. Las 3 dicen **la misma frase del guion** (el hook), ~120 caracteres c/u. Modelo `eleven_v3` (probar `eleven_v4` una vez antes de adoptarlo).
3. **El usuario tiene que poder escucharlos antes de elegir.** Los links a mp3 locales no se reproducen junto a una pregunta, y el visor HTML de T3 no carga audio local (`ERR_ACCESS_DENIED`, probado 2026-10-21). Ábrelos en su Mac: `open -a "QuickTime Player" RUN/voice/casting/{1,2,3}_*.mp3`. Termina el turno **sin** AskUserQuestion: lista las voces en texto y espera a que diga cuál; pregunta con opciones solo cuando ya los escuchó. Registra `voice_id` en `RUN/brief.json` y, para series, en `brands/<slug>/cast/<nombre>/voice.json`.

Más rápido y enérgico (probado con Ana Sofía, 2026-10-20): `[excited]` al inicio + `voice_settings.stability` 0.0 (Creative) o 0.5 (Natural), y después `ffmpeg -af atempo=1.1` (sube el ritmo sin cambiar el tono). Ojo: `[excited]` agrega pausas dramáticas, así que sin atempo queda *más lento* (~165 ppm vs ~171). Para tipo 3 camino B, la referencia de audio ya acelerada es la que fija la cadencia.

Energía: `[excited]`, `[curious]`, `[sarcastic]`, `[laughs]` con moderación (1–2 por pieza); verifica con `qa_speech.py` que no se lean en voz alta. `[whispers]` solo suaviza en español.

## Tipo 3: voz clonada de la persona (opción recomendada con persona real)
Con consentimiento de la persona: clona su voz (ElevenLabs Instant Voice Clone desde una grabación limpia de 1–3 min, o `create_voice` de Higgsfield) y regístrala en `brand.faces.people[].voice_clone` (`provider`, `voice_id`, fecha, consentimiento). Usos: (a) generar con ella el clip de referencia de 8–15 s para `audio_references`; (b) voz en off de partes animadas del mismo video sin que se note el cambio; (c) `voice_change` sobre una generación Seedance para igualar la voz entre generaciones. Nunca clonar la voz de alguien sin su permiso explícito.

## Tipo 3: una generación, una voz
En el tipo 3 la voz la produce Seedance. Con persona real: su muestra de voz como `audio_references` y en el prompt "Match the precise voice identity and timbre of the audio reference, NOT its words". Todo el texto va en **una sola generación** con cortes internos → una sola voz. No combines esa voz con una voz ElevenLabs en el mismo video (piloto Reda 2026-10-20: el usuario notó la diferencia de inmediato). Si una serie necesita varias generaciones y la voz varía, prueba `voice_change` de Higgsfield (sin probar aún) antes de regenerar.

## Usos
- **Tipos 1 y 2**: voz en off completa con timestamps (`tts.py` → `voice/master.wav`, `words.json`, `beats.json`), ritmo con `pace_voice.py` o `tighten`. La voz manda: la imagen se ajusta a ella.
- **Tipo 3 (habla en cámara)**: Seedance 2.5 genera el habla con lip-sync nativo. Dos caminos, decididos en el piloto:
  - **A · Voz nativa**: sin referencia de audio; el prompt fija idioma ("speaks in Latin American Spanish, neutral Mexican accent") y la frase de persona. Más barato; la voz puede variar entre clips.
  - **B · Voz de referencia**: un clip ElevenLabs de **2–15 s, mono mp3**, con la voz elegida diciendo una frase animada (no el guion del clip), subido con `media_upload` → PUT → `media_confirm` y pasado en `medias` con rol `audio_references`. El ritmo y timbre salen de la referencia; el prompt no lleva indicaciones de pausa beat por beat. La misma voz hace la voz en off de la demo → hook y demo suenan a la misma persona.
  - **C (respaldo)**: voz ElevenLabs completa + Lipsync Studio de Higgsfield sobre el clip. Solo si A y B fallan en español.
- `audio_references` (piloto Reda, 2026-10-20): aceptado por `seedance_2_5` en `omni_reference` junto con `image_references` (job_id del personaje); **mismo precio** que sin audio (5 s: 15 borrador / 80 en 1080p). Ref usada: mp3 mono 8.7 s de la voz elegida diciendo otra frase. Resultado: los 2 hooks salieron con el texto exacto (WER 0), habla desde 0.0 s, cierre con boca cerrada. Parecido de voz con la referencia: lo juzga el usuario escuchando (pendiente de anotar). Borrador = 480×854 a 24 fps.

## Ritmo
Palabras ÷ 4 − 1 = segundos (regla medida en inglés). Español con `eleven_v3`: 24 palabras ≈ 8–8.7 s a 1.1× (~180 ppm) → **palabras ÷ 3 ≈ segundos** (medido en el casting de Reda; confirmar con los clips de Seedance). El modelo llena todos los segundos que le das: largo → plano; corto → se come palabras. Une oraciones con comas si no quieres pausa (el punto invita a parar ~0.5 s).
