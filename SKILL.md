---
name: estudio-video
description: Produce videos verticales 9:16 para vender, para cualquier marca o rubro, en 3 tipos — (1) motion: animación con personajes 3D o generados (Codex/Higgsfield), mockups (chats, pantallas), voz ElevenLabs, música y efectos earshot; (2) video real: el usuario pasa una carpeta con sus tomas y fotos del producto y la IA edita y agrega motion (medidas, fichas, onomatopeyas, palabras clave); (3) 100 % IA: 10–14 s generados con Seedance 2.5 (persona real con consentimiento o avatar) con cortes y movimiento, más nuestra capa de motion y subtítulos. Empieza siempre en modo plan estilo grill: identidad de la marca, investigación de anuncios en Meta Ad Library, tipo, objetivo, temperatura, estilo, guion con tiempos, storyboard y cotización antes de gastar créditos. Usar para "video de producto", "UGC", "anuncio en video", "reel para vender", "video con avatar", "video con IA para <marca>", "edita este video con motion graphics", "Katana"; English triggers: product video, UGC ad, AI avatar video, sales reel.
---

# Estudio de video

Entrega MP4s 1080×1920 30 fps listos para Reels/TikTok/Shorts, más guion, storyboard, portada, copy y `costos.md`. Idioma por defecto: español latino. Código, identificadores y comentarios en inglés.

Rutas: `SKILL` es este directorio. Cada video vive en su `RUN` (`~/Videos/<marca>/<fecha>-<slug>/`). Las marcas viven en `SKILL/brands/<slug>/` (identidad, assets, personajes, personas con consentimiento, recetas). Motor y scripts: [engine/README.md](engine/README.md). Python: `PY=~/.local/share/reels-dibujados/venv/bin/python` (mlx-whisper, PIL). Corre los scripts desde `/tmp` con `-I`.

**Regla de oro: las paradas son el producto.** En cada 🛑 te detienes, muestras opciones y el usuario elige. Nunca gastes créditos (Higgsfield, ElevenLabs) antes de la parada de cotización. Las tablas a veces no se ven junto a una pregunta: escribe lo importante (guion, opciones) como texto antes de preguntar. Si la decisión es de oído o de vista (voces, música, borradores), ábrele los archivos (`open -a "QuickTime Player" …`) y espera su respuesta en el siguiente mensaje, sin AskUserQuestion en ese turno.

## Doctor (diagnóstico de instalación)

`node SKILL/engine/doctor.mjs` revisa que la computadora tenga todo para producir: Node, ffmpeg, Google Chrome, Python y sus paquetes, llave de ElevenLabs, y los conectores de Claude (Higgsfield, Reda, ElevenLabs). Funciona en **Mac** y **Windows 10/11** (Linux: «no compatible por ahora»). Mismas capacidades con otro motor según el sistema: transcripción mlx-whisper (Mac Apple Silicon) / faster-whisper (Windows; usa la GPU NVIDIA con CUDA si existe, si no el procesador); caras Apple Vision (Mac) / OpenCV YuNet (Windows). Con NVIDIA el doctor ofrece, opcional, `setup_python.py --gpu` (quitar fondo y transcripción en GPU) y exportar con `ESTUDIO_VIDEO_ENCODER=h264_nvenc`. Música local (audio-studio) solo existe en Mac: en Windows la música es Eleven Music. Si Codex está instalado, también revisa que `reda` y `higgsfield` estén agregados en `codex mcp list` (solo presencia; en Codex cada usuario corre una vez `codex mcp login reda` y `codex mcp login higgsfield`: los conectores de claude.ai no se comparten). Es de solo lectura salvo `--fix`.

**Primera vez que se usa el skill en una máquina (o si el usuario dice que algo no funciona, o pide "revisa mi instalación"):**
1. Corre `node SKILL/engine/doctor.mjs --json --online`. Si ya existe `data_dir()/doctor-last.json` (Mac: `~/Library/Application Support/estudio-video`; Windows: `%LOCALAPPDATA%\estudio-video`) con menos de 7 días y todo en verde, usa `--if-stale` y se salta solo (el doctor guarda ese archivo al terminar).
2. Lee el JSON: `ok` (falta algo indispensable), `allGreen`, `readiness[]` (qué tipos de video están listos y qué falta) y `checks[]` (`status` ok/warn/fail/skip, `message`, `fix[]` ya adaptado al sistema operativo).
3. Explícale el resultado al usuario **en español y sin jerga**: primero para qué tipos de video está listo, luego solo lo que falta, con los pasos de `fix`. No pegues el JSON. Nunca pidas ni muestres una API key: el doctor solo dice presente/ausente.
4. Ofrece arreglarlo: `node SKILL/engine/doctor.mjs --fix` pregunta y/N antes de cada acción (crear el entorno de Python con `scripts/setup_python.py`, `npm install`, `brew` en Mac o `winget` en Windows). El asistente no instala nada de sistema sin que el usuario diga que sí. El comando `--fix` pide respuestas en la terminal: si no hay terminal interactiva, dale los comandos al usuario para que los corra él.
5. Los conectores (Higgsfield, Reda, ElevenLabs) los conecta el usuario en claude.ai > Configuración > Conectores; después corre `/mcp` en Claude Code. El estado `pending` significa que aún se estaba conectando: repite el diagnóstico. El aviso de Reda sobre "servidor de pruebas (staging)" es informativo, no bloquea. Si el doctor dice «conectado» pero una herramienta pide iniciar sesión, confía en la herramienta y pide al usuario reconectar.
6. Si `ok` es true y no hay nada que impida el tipo de video pedido, sigue con la Fase 0. Si falta lo indispensable para ese tipo, no empieces el plan hasta resolverlo.

Guía paso a paso para clientes nuevos: [references/instalacion.md](references/instalacion.md).

## Los 3 tipos

| | **1 · Motion** | **2 · Video real editado** | **3 · 100 % IA** |
|---|---|---|---|
| Material base | Personajes 3D (assets de la marca, p. ej. `rex_head.png`) o generados con imagen (Codex / Higgsfield) + mockups (chat, pantalla, producto) | Carpeta del usuario: tomas grabadas (producto, persona presentándolo) + fotos del producto | **Una** generación Seedance 2.5 de 10–14 s desde un guion con tiempos: persona real (2 fotos + muestra de voz, con consentimiento) o avatar, con cortes, caminar, manos, interacción con producto |
| Qué hace la IA | Anima todo en el motor | Elige tomas, corta silencios/muletillas, arma la edición | Escribe el prompt por planos, genera, recorta |
| Capa encima | Voz ElevenLabs, música (Eleven Music o audio-studio), efectos earshot/kit UI | Cotas de medidas, fichas de características, onomatopeyas, palabras resaltadas, subtítulos, CTA | Subtítulos, palabras clave, burbujas de chat con el personaje de la marca, notificaciones, contador, CTA |
| Costo | El más barato (casi gratis: solo la voz) | Casi gratis (material propio) | Lo caro: 14 s = 42 créditos borrador / 224 en 1080p |
| Guía | [rama-motion.md](references/rama-motion.md) | [rama-real.md](references/rama-real.md) | [rama-ia.md](references/rama-ia.md) |

Katana (remix de un reel de referencia, tipos 2–3): [katana.md](references/katana.md). La capa de motion es común y **dinámica por defecto**: elementos que entran en la palabra exacta del habla, colocados automáticamente lejos de la cara ([engine/README.md](engine/README.md) → motion.json, auto-placement).

## Fase 0 · Identidad de la marca (siempre)

[identidad.md](references/identidad.md). Si `brands/<slug>/brand.json` existe y `status` es `ready`, muéstralo y pregunta si se usa o se ajusta. Si no, entrevista (paleta, tipografía, logo, tono, CTA/contacto, **claims permitidos**, personajes/mascotas, personas reales con consentimiento, leyenda de IA en video o solo etiqueta de plataforma). Nada de colores fijos.

## Fase 1 · Grill del video

Si el primer mensaje trae un brief ([brief.md](references/brief.md)), lo que venga lleno se da por respondido y solo se pregunta lo que falte; **las paradas 🛑 se hacen siempre**. Con `/estudio-video plantilla`, entrega las plantillas de brief.md para copiar.

[grill.md](references/grill.md): tipo (1/2/3), formato (producto / demostración), producto o tema, objetivo, **temperatura** (frío/tibio/caliente), estilo (punchy, humor, tranquilo, comparativa…), duración, plataforma y, si el guion muestra un software o datos, **pantallas: motion reinterpretado o capturas reales** ([pantallas.md](references/pantallas.md)). Tandas de 2–4 preguntas con una opción `(Recommended)`.

## Fase 2 · Investigación de anuncios → 🛑 Parada 1

Si el usuario no trae referencias, investiga tú en **Meta Ad Library** con el navegador ([meta-ads.md](references/meta-ads.md)): competidores y búsquedas por rubro en el país, descarga 8–12 videos, transcribe sus primeros segundos y arma `RUN/refs/hooks.md` + `aperturas.jpg` ([hooks.md](references/hooks.md)). Resume qué se repite, qué está gastado y qué no copiar. 🛑 El usuario elige el patrón de hook.

## Fase 3 · Personaje o persona → 🛑 Parada 2

- Tipo 3, quién sale ([personaje.md](references/personaje.md) §0), recomendar en este orden: (1) **vocero/a ya registrado** de la marca (`faces.people[]` con `default_for_type3`, p. ej. Hassan en Reda); (2) **persona nueva**: fotos nuevas → avatar (2 fotos de referencia, o 5–20 para entrenar un personaje de Higgsfield) + **voz clonada** con su permiso; (3) avatar ficticio + voz de biblioteca.
- Avatar original o personaje 3D: prompt JSON bloqueado, 2–3 modelos, el usuario elige.
- Tipo 1: personajes/mascotas de `brand.characters` o generados.

## Fase 4 · Voz → 🛑 Parada 3

[voz.md](references/voz.md). Tipos 1–2: casting de 3 voces ElevenLabs con la misma frase. Tipo 3: la voz sale de la generación (referencia de timbre); una sola generación = una sola voz. Con persona real, la mejor referencia es su **voz clonada** (`faces.people[].voice_clone`, solo con su permiso), que también sirve para voz en off o `voice_change` entre generaciones. No mezcles voz ElevenLabs y voz Seedance en el mismo video: se nota.

## Fase 5 · Guion → 🛑 Parada 4

Propón 3–5 guiones de estilos distintos (escribe cada uno completo, en texto). Tipo 3: 3 planos con corte seco, frase exacta por plano con ventana de tiempo, acción física por plano; ~palabras ÷ 3 ≈ segundos en español. Números con letra. Solo `claims.allowed` ([legal.md](references/legal.md)): nunca resultados, cifras, testimonios ni garantías inventadas. Revisa pares que se funden al hablar ("quién les" → "quiénes"). 🛑 El usuario elige 1–2 (A/B).

## Fase 6 · Storyboard + cotización → 🛑 Parada 5

Storyboard con cuadros (tipo 1/2: `render.mjs … preview-v`, gratis). Cotiza con `get_cost: true`, registra con `ledger.py RUN quote`, fija tope con `ledger.py cap`. 🛑 Total en créditos + qué se genera.

## Fase 7 · Producción

Según la rama. Antes de cada trabajo pagado: `ledger.py guard`; registra cada `job_id`. Tipo 3: **borrador 480p primero** (`draft:true`); el final 1080p con `draft_job_id` solo cuando el usuario lo apruebe (vence a los 7 días). Un reintento por toma fallida.

## Fase 8 · Capa de motion, marca y sonido

Reglas comunes a los 3 tipos (estilo claro, anti-slop, easing, duraciones, texto, hook, ritmo, sincronía): [motion-reglas.md](references/motion-reglas.md).
`scripts/overlay.py` con `--motion motion.json`: subtítulos, keywordPop, wordStack, chatBubbles (con el personaje de la marca), toast, counterBadge, tagPill, specCard, dimensionLine, onomatopoeia, highlightWords, productCard, productPop, carousel y las **pantallas de producto** `uiList`, `uiForm`, `uiDoc`, `uiStat`, `uiKanban`, `uiFeed`, `uiIcons`, la palabra grande letra por letra `kineticWord`, el cierre de marca `logoSting` (todo vive en `engine/motion-lib/`, un archivo por elemento: ver `engine/README.md`); logo en la franja superior lejos de la cara; tarjeta CTA. La colocación es automática por detección de cara (`faces.swift`); revisa `out/qa-layout.jpg`. Música (audio-studio o Eleven Music) + kit de efectos UI (`assets/sfx/ui-map.json`) o earshot → `mix.py` → −14 LUFS, pico ≤ −1 dBTP.

**Estudio (editor local, tipos 2 y 3):** tras el primer render corre `overlay.py … --studio-build` y lanza `node engine/studio/server.mjs RUN/<comp>` para que el usuario corrija la capa de motion (tiempos, posición, textos, audio, versiones de música/voz/tomas) sin volver a pedírtelo. Si dijo que dejó comentarios, lee `RUN/<comp>/.studio/inbox.jsonl`. Las acciones con costo (voz, música, regenerar toma, 1080p) llegan como solicitudes `approved` en `.studio/requests.jsonl`: antes de ejecutar una corre `ledger.py guard` y `get_cost`, informa el costo real en la solicitud y registra el resultado en `.studio/media.json`. Higgsfield siempre sale en borrador 480p hasta que el usuario pida "Pasar a 1080p". Contrato completo: [engine/studio/README.md](engine/studio/README.md). **Cortes (tipos 2 y 3):** el material crudo se recorta, divide, reordena y se une con fundidos desde la pista Video del Estudio (`edl.json`, gratis; ver «Cortes del video» en ese README) en lugar de regenerar tomas. El tipo 1 (plantilla con escenas/variables, `params.json`) queda para la fase 3.

**Material propio y sonido en el Estudio (tipos 2 y 3, gratis y local):** el panel izquierdo (Media, Música, Texto, Transiciones, Efectos, Productos) deja al usuario importar sus videos, fotos y audios (`POST /api/asset/media`; quedan en `RUN/assets/media/` y entran al bin sin reconstruir el comp), arrastrarlos al carril Video, estirar un clip sin voz con `speed` 0.25-4 (su audio se silencia; el EDL lo quita con aviso si cubre palabras habladas) y colocar o silenciar efectos de sonido en el carril Efectos (`<comp>/sfx.json`, clave estable por evento). Sin música pero con `sfx.json`, `overlay.py` mezcla voz + efectos (`mix.py --no-music --sfx-doc`). Lee `RUN/<comp>/sfx.json` y `RUN/assets/media/` antes de re-renderizar para no pisar lo que el usuario hizo. Detalle: [engine/studio/README.md](engine/studio/README.md).

**Pantallas de producto (los 3 tipos):** si el guion nombra funciones de un software o datos (inventario, cotizador, esquema de pago, embudo, actividad, KPI, canales), se redibujan y animan con los componentes `ui*` encima de la toma (o como escena completa en el tipo 1), con datos del MCP de la marca o leídos de las capturas, piel de la app (`brands/<slug>/ui-skin.json`) y `source` en cada cifra; nunca capturas con zoom. Editables en el panel *Pantallas* del Estudio. Guía: [pantallas.md](references/pantallas.md). Catálogo de los 53 elementos y 12 transiciones, con cuándo usar cada uno: [libreria.md](references/libreria.md) (el `brief` completo está en cada archivo). Si ningún elemento sirve, escribe uno propio del video en `RUN/<comp>/motion-lib/<tipo>.js` siguiendo `engine/motion-lib/_template.js` y el `brief` del elemento más parecido; si al usuario le gusta, promuévelo a la librería ([pantallas.md](references/pantallas.md) → «elemento propio»).

**Productos (tipos 2 y 3):** el catálogo del video es `RUN/products.json` (panel *Productos* del Estudio: nombre, precio, fotos, «Quitar fondo» gratis y local con `scripts/cutout.py`; entorno Python propio del skill: su ruta la da `node SKILL/engine/doctor.mjs --print-python`; se crea una vez con `scripts/setup_python.py`). Tipo 2: `productCard` / `carousel` / `productPop` sobre las tomas reales. Tipo 3: el recorte sirve de imagen `omni_reference` de Seedance, sin texto sobre el producto; nombre y precio van en la capa de motion. El mismo documento lo llena el importador de Reda (`scripts/reda_import.py`, abajo); `source` desconocido (ni `manual` ni `reda`) → Revisar pide verificar el precio.

**Variantes en un clic (remarketing, gratis):** del video terminado, el botón *Variantes* del Estudio (o `scripts/variants.py --comp RUN/<comp>`) renderiza hasta 12 versiones A/B cambiando solo texto (ganchos × cierres, `variants.json`); sin generación de pago. Ver «Variantes en un clic» en [engine/studio/README.md](engine/studio/README.md).

**Si el video es de un proyecto o modelo de Reda (CRM inmobiliario; tipos 2 y 3):** `list_projects` → `get_project` → `get_project_media` (+ `list_inventory` para disponibilidad y precio de unidad) del MCP de Reda, **solo herramientas de lectura** (nunca `preview_/apply_inventory_price_adjustment` ni `update_inventory_unit`). Guarda los resultados crudos en un JSON `{list_projects, get_project, get_project_media, list_inventory}` (p. ej. `RUN/reda-<id>.json`; con `get_project_media` solo basta) y corre `"$HOME/Library/Application Support/estudio-video/venv/bin/python" -I scripts/reda_import.py RUN/reda-<id>.json --run RUN [--models all|id,id] [--include remarketing,gallery,amenities,brochure] [--max-images N]`. El Estudio muestra los productos al instante (un producto por modelo + uno del proyecto + colecciones «Remarketing» y «Amenidades»; sus fotos también salen en Media). Reglas: **todo precio en pantalla sale de Reda con su `priceBasis`** (el precio de un modelo es «desde»; para una cotización a un cliente usa el precio de la unidad de `list_inventory`, nunca el del modelo), no inventes precios, metros ni amenidades que Reda no mandó, y si el proyecto es ambiguo pregunta cuál (`list_projects`) antes de importar. Si `list_inventory` vino parcial (`limit` chico) el importador no guarda precios de unidad: pídelo completo. Fotos de inmuebles: originales, sin quitar fondo (`--cutout` solo si el usuario lo pide). Los PDF (brochure) quedan como URL en `attributes`, no se descargan. Re-correr el importador actualiza precios y datos sin duplicar fotos; con datos de más de 7 días Revisar vuelve a pedir verificar el precio. Detalle: [references/rama-real.md](references/rama-real.md).

## Fase 9 · QA

[calidad.md](references/calidad.md): `qa_speech.py` contra el guion, elisiones, hoja de cuadros completa + `qa-layout.jpg` (nada sobre la cara, nada encimado, logo legible), ffprobe, ebur128 **sobre el mp4 final**. No puedes escuchar ni juzgar el parecido de una persona: pídeselo al usuario.

## Fase 10 · Entrega y receta

`RUN/entrega/`: MP4 por versión, portada, `copy.md` (caption, CTA, recordatorio de activar la etiqueta de IA de la plataforma si hay persona/voz IA), `costos.md`. Lo que le guste al usuario se guarda en `brands/<slug>/recetas/` (prompt exacto, medias, recortes, motion.json, comando de overlay, por qué funcionó). Lo aprendido que sirva a todas las marcas va a la referencia de la rama.

## Límites

- No publiques, no compres créditos, no cambies de plan sin permiso. Las API keys nunca en archivos (`tts.py` lee `~/.config/reels-dibujados/.env`).
- Caras y voces de personas reales solo con consentimiento registrado. Nada de "dobles" de personas identificables ni cuentas que finjan ser usuarios reales.
- Material de anuncios de terceros: solo para estudiar estructura; nunca se reutiliza.
- Si Higgsfield responde con un preset recomendado en lugar de crear el trabajo, reintenta con `declined_preset_id`; si un trabajo es rechazado por moderación, repórtalo, no lo evadas.
- Verifica al inicio que los MCP de Higgsfield (y ElevenLabs si se usa) estén conectados.
