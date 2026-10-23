# Tipo 3 · 100 % IA (Seedance 2.5 + capa de motion)

El video base son **10–14 s generados en una sola llamada** a Seedance 2.5: una persona (real con consentimiento, o avatar) dice el guion con 3 planos y cortes secos, se mueve, gesticula, usa el producto. Encima va nuestra capa de motion. Las recetas probadas se guardan en `brands/<marca>/recetas/` (no se publican: llevan IDs de la persona real).

Antes de empezar: `balance` de Higgsfield. Persona real: `brand.faces.people[]` con `identity_media_ids` (2 fotos), `voice_ref_media_id` y `consent`.

## Contrato del modelo (`seedance_2_5`, verificado 2026-10-21)
- `mode: "omni_reference"`, `duration` 4–30, `aspect_ratio: "9:16"`, `generate_audio: true`, `draft: true` (480×854 a 24 fps) → final con `draft_job_id` (≤ 7 días) en `resolution: "1080p"`.
- `medias`: las 2 fotos con rol `image_references` (o `image`) + la voz con `audio_references` (o `audio`). La referencia de audio **no cambia el precio**.
- Precios (créditos): 5 s 15 / 80 · 8 s 24 / 128 · 14 s 42 / 224 (borrador / 1080p). Ver [costos.md](costos.md).
- Si la respuesta dice que se recomendó un preset en vez de crear el trabajo: reintenta igual con `declined_preset_id`.
- Lote: `generate_video_batch` (≤ 6), espera con `jobs_wait` o con `sleep 150` en segundo plano; un borrador de 14 s tarda ~3–4 min.

## Plantilla del prompt (inglés; el texto hablado en español, literal)
1. **Cabecera fija** (igual en toda la serie):
   `Premium photoreal cinematic vertical commercial, 9:16. <Nombre> is the adult <man/woman> in the two supplied images: preserve <his/her> exact face, apparent age, <pelo>, skin tone, physique and identity. Match the precise voice identity and timbre of the audio reference, NOT its words. Mexican Spanish, natural conversational delivery, accurate lip sync. <MARCA> is pronounced <...>; WhatsApp is pronounced the natural Mexican way. Consistent wardrobe in every shot: <prenda exacta>, no added logos. Smartphone matte black, screen never legible. No subtitles, no written text, no UI, no graphics, no watermarks. Clean close-mic dry speech only, absolutely no music, no other voices. Keep the lower third of the frame visually simple and clear for later graphic overlays; <his/her> head stays in the upper half. Natural hands with five fingers, purposeful gestures. <He/She> speaks only in medium shots or close-ups where <his/her> face fills at least one quarter of the frame height; in wide shots and while walking away <he/she> is silent. No reflection of <his/her> face in any glossy surface (tabletops, resin, glass, screens); the camera never tilts from a surface up to <his/her> face. One continuous 14-second piece made of three shots separated by clean HARD CUTS (no transitions), same person, same wardrobe, same location, consistent light. Each sentence exactly as written, no extra words, numbers spoken as words.`
2. `LOCATION:` una sola locación con luz concreta (p. ej. azotea del desarrollo al atardecer).
3. Tres bloques `SHOT n (a–b s):` encuadre + **acción física** (camina, se recuesta, saca el celular, se pone lentes, toma el producto) + `At a–b s <he/she> says exactly, <tono>: '<frase>'`. Termina con un gesto final (sonrisa, guiño) y boca cerrada, **≥ 0.8 s después de la última palabra** (ese colchón es el que permite cerrar sin cortar a media boca).
4. Dinamismo que funcionó: cambiar de postura entre planos (recostado → sentado → de pie), acercarse a cámara, mostrar el celular sin pantalla legible, un remate visual al final (lentes de sol).
5. **Reglas antes de generar** (lo que falló en Vichac):
   - **Lip sync:** habla solo en plano medio o cerrado. En 480p una cara de ~40 px no deja leer la boca y se percibe desincronizada. Los planos abiertos y las caminatas van sin diálogo (o la frase cae en el plano siguiente).
   - **Reflejos:** con superficies brillantes (resina, vidrio, laca, pantallas), la persona va al lado del producto y no detrás; nada de movimientos de cámara de la superficie a la cara. Si el producto es brillante, pide "soft, physically consistent reflections".
   - **Palabras raras y la marca:** escríbelas fonéticamente en el prompt ("credenza, pronounced cre-DEN-sa") o cámbialas por una común ("mueble a juego"). Si una palabra es crítica (la marca, el CTA), prueba primero un borrador de 5 s (15 créditos) solo con esa frase.
   - **La frase del CTA nunca es la última del último plano sin colchón:** si sale mal no se puede recortar sin quedarse a media boca. Pon el CTA antes del gesto final.
   - **Ropa:** fotos de referencia sin logos, o pide quitarlo explícitamente.

## Lo medido en el piloto (Reda, 2026-10-21)
- Los 3 planos con corte seco salen dentro de una sola generación, con **una sola voz** (consistente). Mezclar una voz ElevenLabs en otra parte del video sí se nota: evitar.
- El habla empezó ~**1.1 s** tarde aunque se pidió 0.15 s → recortar la cabeza (`ffmpeg -ss 1.0`). En Vichac empezó en 0.0 s: **mídelo en cada toma**, no recortes a ciegas.
- Puede haber un instante raro al inicio de un plano (p. ej. agachado): quitarlo en el silencio entre frases (`trim` + `concat`).
- Ritmo: 33–36 palabras en 14 s (≈ 150–175 ppm) entran completas, WER 0.
- La identidad se parece más en primeros planos; en planos abiertos la cara es pequeña. El parecido y la voz los juzga el usuario.

## Montaje
1. Descarga el borrador, `qa_speech.py --script` (texto exacto), hoja de cuadros cada 0.5 s, detecta cortes (`select='gt(scene,0.25)',showinfo`).
2-bis. **Recortar en vez de regenerar (gratis):** la latencia de ~1.1 s antes de que Seedance empiece a hablar y los tramos que marcó el QA (boca sin audio, pronunciación mala, reflejo pálido) se quitan con `edl.json` en el comp: el borrador completo es el material y el corte son los `in`/`out` de cada tramo (los `<k>_draft.words.json` ya sirven como palabras por toma). El usuario lo ajusta en la pista Video del Estudio (arrastrar bordes, S, Supr, rombo de transición) y el motion y los subtítulos se recorren con el corte; solo regenera (pago) lo que no se arregle recortando. Un fundido a mitad del video avisa en amarillo: las reglas piden corte seco. Detalle en engine/studio/README.md «Cortes del video».
2. Recorta cabeza y momentos raros → `drafts/<k>_trim.mp4`; vuelve a transcribir para los tiempos de subtítulos.
2b. **Reglas de corte** (aplican a tus cortes y a los cortes internos de Seedance):
   - **Nunca cortes con la boca abierta sin audio.** Entra o sal de la persona con la boca cerrada, o exactamente al inicio de una palabra. Revisa ±3 cuadros en cada corte. Caso Vichac: en 29.6 s el plano entra moviendo la boca 0.25 s antes de "Les", y en 47.4 s el video termina con la boca abierta empezando "cotiza".
   - **Si quitas la última palabra, también quitas el gesto final:** termina en el fin de la última palabra + ≤ 0.1 s y entra ya la tarjeta CTA (disolvencia), o tapa la cola con un plano de producto.
   - **Cada corte de audio debe ir tapado** con video del mismo tramo (plano de apoyo). Si no, la boca se mueve sin sonido.
   - **Planos de apoyo con footage real:** que sea el mismo objeto, igualado en color y nitidez al borrador, de 1.5–2 s, y **nunca como plano de arranque**. El primer segundo es la cara y el hook. Si el look no empata (otra cámara, otra sala, otra veta), mejor genera un plano de producto de 5 s con Seedance a partir de la foto real (15 créditos), que se ve igual que el resto.
3. `motion_<k>.json`: cada elemento entra en la palabra exacta (tiempos de `words.json`), con las reglas de [motion-reglas.md](motion-reglas.md). Patrones que funcionaron:
   - Hook: `keywordPop` con la palabra gancho ("SÁBADO") + `toast` del mensaje que llega.
   - Explicación: `chatBubbles` grandes (cliente blanco / personaje de la marca en lima con su avatar 3D), máx. 3 visibles.
   - Prueba: `toast` "Nueva visita agendada", o `counterBadge` + `tagPill` ANTES / CON <PRODUCTO> en comparativas.
   - Funciones del software (inventario, cotizador, esquema…): `uiList` / `uiForm` / `uiDoc` encima de la persona, cada una en su palabra, con la misma unidad o cliente en todas ([pantallas.md](pantallas.md)).
   - Sin x/y: la colocación automática evita la cara; revisa `qa-layout.jpg`.
4. `overlay.py --clips drafts/<k>_trim.mp4 --words … --motion … --cta --cta-subtitle "…" --cta-dur 3 --music … --captions-y 1430 --captions-size 70`.
4b. **Estudio (editor local):** agrega `--studio-build` al `overlay.py` del paso 4 y lanza `node engine/studio/server.mjs RUN/<comp>` para que el usuario ajuste el motion (posición, tiempos, textos, audio, versiones de medios). Si dice que dejó comentarios, lee `RUN/<comp>/.studio/inbox.jsonl` (un JSON por línea: `t`, `elementId`, `elementType`, `x`, `y`, `text`, `resolved`), aplica los cambios en `motion.json` y marca `"resolved": true`.
   El logo y el cierre también son editables en el Estudio (`logo.json` / `cta.json`; *Reemplazar logo…* valida y guarda en `RUN/assets/logo-<sha8>.png`, no toca `brand.json`; el render falla en voz alta si un asset no carga).
   **Cola de solicitudes (`.studio/requests.jsonl`)**: cuando el usuario confirma una acción con costo en el Estudio queda una línea con `status: "approved"`. Tú la procesas: antes de gastar corre `ledger.py guard` y `get_cost` (el estimado de la solicitud es solo informativo), ejecuta, registra el trabajo (`ledger.py job`), agrega la media a `.studio/media.json` y anota en la solicitud (línea nueva con el mismo `id`: `status` `running` → `done|failed`, `cost_real`, `result_media_id`, `error`). **Higgsfield siempre como borrador 480p** (`draft: true`, `quality: "draft480"`, con `job_id`); el 1080p solo con una solicitud `upgrade_1080p` (botón final "Pasar a 1080p"; vence a los 7 días). Detalle del contrato: [engine/studio/README.md](../engine/studio/README.md).
5. Al aprobar: final 1080p con `draft_job_id` y el mismo montaje (revisar que la actuación no cambió).

## Producto (sin persona)
Fotos reales del producto (mejor) o `product-photoshoot`; Seedance `omni_reference` con la foto como referencia, una acción y un movimiento de cámara por plano, nunca texto en el producto. Alternativa: `marketing_studio_video` (cotizar y comparar). Misma capa de motion.
**Fotos del catálogo (`RUN/products.json`, panel *Productos* del Estudio):** quita el fondo con el botón (gratis, `scripts/cutout.py`) y usa el recorte, no la foto con fondo, como imagen de referencia `omni_reference` de Seedance (menos contaminación del entorno). Nunca pidas texto sobre el producto (Seedance lo deforma): el nombre y el precio van después, en la capa de motion (`productCard`, `productPop`, `carousel`). El catálogo puede venir de Reda (`scripts/reda_import.py`, ver rama-real.md 4c).
**Reda (inmuebles, tipo 3):** usa las fotos del modelo/proyecto (originales, las de mayor resolución de `RUN/assets/products/`; **sin recorte**, un inmueble no se recorta) como imágenes `omni_reference` de Seedance: portada del modelo + 1–2 de galería (exterior/interior) por plano, nunca texto ni precio en la imagen. El nombre, el precio «desde» (con su `priceBasis`) y los datos (recámaras, m²) van en la capa de motion, tomados de `products.json`, nunca inventados; para un precio de cliente, el de la unidad de `list_inventory`. Seedance no debe inventar fachadas: describe en el prompt solo lo que se ve en la foto.

## Lo que no hacer
- Un hook de avatar de 5 s pegado a una demo animada con otra voz (primer piloto): la voz cambia y no se siente como un video.
- Paneles pequeños con capturas de pantalla: no se leen en el teléfono. Usar burbujas grandes.
- Cortar de la persona a capturas a pantalla completa con zoom lento (INM02, 2026-10-22: "capturas estáticas sin chiste"). Las funciones del software van como pantallas `ui*` encima de su propia toma, en la palabra que las nombra ([pantallas.md](pantallas.md)); en el prompt, la persona sostiene una tablet o celular sin pantalla legible y deja libre el tercio inferior.

## Lo medido en Vichac (2026-10-21, reconstrucción de un reel propio con Hassan, 4 × 14 s)
- **El logo de la foto de referencia se cuela en la ropa** aunque el prompt diga "no added logos" (el emblema lima de Reda apareció en las 4 tomas). Hay que usar una foto de referencia con camisa lisa o escribir "remove the chest emblem seen in the reference photos; plain shirt".
- **Superficies brillantes:** "camera rises to his face" sobre una mesa de resina produjo una cara invertida reflejada dentro de la resina. También salieron parches de luz raros. Hay que evitar planos que pasen de la superficie a la cara y pedir "no reflections of his face in the tabletop".
- **El habla empezó en 0.0 s en las 4 tomas** (en Reda empezaba ~1.1 s tarde): recortar el inicio no aplica siempre, hay que medirlo en cada toma.
- **Pronunciación:** "credenza" sonó como "creadora" y "cotiza" como "copista" (lo confirmó el usuario escuchando). Whisper sirve como alarma temprana. Para palabras poco comunes conviene escribirlas fonéticamente en el prompt o evitarlas.
- **Lipsync en planos abiertos:** con caras de unos 40 px en 480p no se lee la boca y el usuario lo percibe como desincronía. La medición con Vision (inner lips contra la envolvente RMS) solo funciona con caras de más de 70 px. No encontró un desfase constante, así que la corrección práctica son planos de apoyo, no mover el video.
- **5 imágenes + audio** de referencia cuestan lo mismo que 2 imágenes (42 créditos por 14 s en borrador).
- **Arreglos sin créditos que funcionaron:** planos de apoyo con footage real del producto, cortes de audio en silencios medidos por RMS, y terminar antes de una palabra mal dicha dejando que la tarjeta del CTA la diga. Receta: `brands/vichac/recetas/reconstruccion-reel-mesa/`.
