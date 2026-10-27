# Fase 9 · QA

## Habla (todos los tipos con voz)
`$PY` = el Python del skill: obtén su ruta con `node SKILL/engine/doctor.mjs --print-python` (Mac: `~/Library/Application Support/estudio-video/venv/bin/python`; Windows: `%LOCALAPPDATA%\estudio-video\venv\Scripts\python.exe`). Se crea con `python3 SKILL/scripts/setup_python.py` (Windows: `py -3 SKILL/scripts/setup_python.py`); el doctor lo revisa. `qa_speech.py` y `mix.py` lo buscan solos aunque los llames con otro Python.
```bash
$PY SKILL/scripts/qa_speech.py RUN/out/clip.mp4 --script RUN/script_hook1.txt
```
- Palabras faltantes/cambiadas vs guion (WER). Si falta algo, transcribe el tramo aislado antes de regenerar (el ASR largo a veces se salta frases). Whisper normaliza; avisa si el subtítulo difiere del guion escrito.
- Pausas ≥ 0.25 s: 0–1 en una respiración natural está bien; 0.7 s se nota.
- Fin del habla a ≤ 0.3 s del final de la toma (1 s antes = apresurado/relleno).
- Palabras por minuto: rango UGC en inglés 230–250; calibrar el rango en español con el piloto y anotarlo aquí.
- Tags de v3 no leídos en voz alta.
- **Seedance 2.5 tarda ~1.1 s en empezar a hablar** aunque el prompt pida 0.15 s: recorta la cabeza del clip (y rehaz las palabras con `qa_speech.py` sobre el clip recortado). Revisa también agachadas o gestos raros al inicio de una toma y córtalos.
- **Elisiones que cambian el sentido**: el ASR puede transcribir bien y aun así sonar mal. Caso real (Reda, 2026-10-20): "¿quién les contesta?" se oía "¿quiénes contesta?"; "Rex sí" se funde en "Rexy". Evita en el guion pares que se funden (quién + les/le, nombres cortos + sí); busca en la transcripción palabras pegadas o plurales raros y, si hay duda, reescribe la frase en vez de regenerar. El oído del usuario manda: pídele que confirme esas frases.

## Imagen
- Cuadro completo cada 0.5 s a ≥ 960 px en clips generados: manos/dedos, producto duplicado, texto inventado, identidad y vestuario del personaje, objetos que se funden. Registra rangos malos y corta fuera de ellos.
- Zonas seguras 9:16: nada importante en los 220 px superiores ni 380 px inferiores (UI de la plataforma).
- Subtítulos no tapan caras ni producto.
- **Anti-slop** (hoja de contacto, tipos 1–2 y capa de motion): ningún degradado, brillo, viñeta de color ni fondo saturado; ningún elemento decorativo que no diga algo del guion; colores de marca solo como acento; texto de color sobre blanco con `accent_on_paper`. Reglas completas en [motion-reglas.md](motion-reglas.md). Si un cuadro "se ve hecho por IA", falla aunque lo demás esté bien.
### QA de layout (motion con detección de caras)
Con `--motion`, `overlay.py` deja `RUN/<comp>/out/qa-layout.jpg` y `layout-report.json`. Revisa `qa-layout.jpg` **más** una hoja de contacto completa del video (un cuadro cada ~0.5 s, no solo los cuadros QA): nada sobre la cara, sin solapes entre elementos (`collidesWith` vacío salvo decisión consciente), el logo legible (no tapado ni sobre un fondo que lo pierda). Si algo choca, mueve `x/y`, acorta ventanas o separa tiempos antes de re-renderizar.

### QA de cortes (tipo 3 y cualquier video con persona hablando)
Detecta todos los cortes del video final (`select='gt(scene,0.2)',showinfo`) y saca una tira con ±3 cuadros de cada uno, más los últimos 0.5 s:
- Estado de la boca en cada corte: cerrada, o en el inicio exacto de una palabra. Una boca abierta o moviéndose sin audio se percibe como "va a hablar y lo cortan".
- El cierre: el último cuadro con la persona debe tener la boca cerrada (gesto final) o pasar ya a la tarjeta CTA.
- Tamaño de la cara mientras habla: con menos de ~70 px de alto en el borrador, el lip sync no se puede juzgar ni medir. Tápalo con un plano de apoyo o súbelo con un punch-in.
- Reflejos: caras invertidas o parches de luz en superficies brillantes, revisados a resolución completa.
- Planos de apoyo: ¿se ven como el mismo video? (misma sala, mismo objeto, color y nitidez). Si parecen "otro video", recórtalos o sustitúyelos.

## Técnico
ffprobe: 1080×1920, 30 fps, `color_range tv`, BT.709, AAC; duración esperada. Loudness: −14 LUFS integrado, ≤ −1 dBTP (`ffmpeg -af ebur128=peak=true`). El codificador AAC puede pasarse del true peak masterizado (~2 dB en cortes duros): el mux de `render.mjs` aplica un limitador a −2 dBFS antes del AAC y deja el pico real en ≈ −2 dBTP. Verifica con ebur128 sobre el **mp4 final**, no sobre `mix.wav`. Si hay música + voz: ducking audible y voz inteligible.

## Lo que no puedes verificar
No escuchas: timbre, naturalidad, acento y lip-sync los juzga el usuario. Dilo en la entrega junto con cualquier desviación.
