# estudio-video engine

Deterministic 9:16 (1080x1920, 30 fps) HTML/canvas renderer plus brand-agnostic overlay helpers and production scripts.
Requirements: Node, Google Chrome (`CHROME` env to override), ffmpeg, Python 3. One-time: `cd engine && npm install` (puppeteer-core).

## Layout of a run
```
<run>/brand.json        brand (copy of brands/<brand>/brand.json with colors filled; assets/ copied next to it)
<run>/footage/<name>/%04d.jpg   frame sequences (made by overlay.py)
<run>/voice/...         optional voice files
<run>/<comp>/index.html composition; outputs in <run>/<comp>/out/
```
The static server maps `/engine/*` to this directory and everything else to `<run>`, so a comp at `<run>/<comp>/index.html` loads
`../brand.json`, `../footage/...`, `/engine/brand-layer.js`.

## render.mjs
```
node engine/render.mjs <run>/<comp>/index.html <mode> [times|t] [--audio f.wav]
```
Modes: `v` (full render -> `out/<comp>-9x16.mp4`), `preview-v 1.5,4` (JPGs in `out/preview/`), `cover [t]` (PNG),
`events` (dumps `window.TIMELINE` to `out/events.json`), `qa [times]` (frames with the layout QA overlay -> `out/qa/NN.jpg`), `mux` (video copy + `--audio` or `out/mix.wav` -> `out/<comp>-final.mp4`).
A comp must set `window.TIMELINE = {DURATION, events}`, define `async window.render(t)` and set `window.READY = true`.
Env: `KEEP_FRAMES=1` keeps the JPEG frames; `FFMPEG` overrides ffmpeg. Output: limited-range BT.709, x264 crf 19, maxrate 16M.

## brand-layer.js (ES module)
`loadBrand("../brand.json")` (applies CSS vars `--brand-primary/ink/paper/accent/display/body`, loads fonts and logos, awaits
`document.fonts.ready`), `setCanvas(ctx)`, then pure functions of `t`: `captions(words, t, opts)`, `hookTitle(text, t, inAt, outAt)`,
`lowerThird({title, subtitle}, t, inAt, outAt)`, `logoBug(t, inAt, outAt)`, `ctaCard(t, {title, subtitle, contact}, {at})`,
`aiLabel(t, in, out, text, force)`, easing (`clamp seg lerp expoOut expoIn expoInOut inOut outBack env`). Safe zones: nothing in the top 220 px or bottom 380 px.
`logoBug(t, in, out, {corner, w:240, hide:[[a,b]]})` sits in the header band (y 230-330) with a soft scrim + drop shadow; it fades during the `hide` windows. `aiLabel` draws nothing unless `brand.ai_label` is true (or `force` = true).
Fonts: `fonts.*.src` is a woff2/ttf path relative to brand.json or a Google Fonts CSS URL (network needed only in that case).

### Motion-graphics overlays (brand-layer.js)
Pure functions of `t`, no-ops outside their window; canvas coords; nothing above y 220 or below y 1540.
- `keywordPop(text, t, in, out, {style:'box'|'stroke', rotate:-3, x:540, y:760, size:150, maxW:880})` scale-overshoot burst (lime box + ink text, or white text + ink stroke). The default y 760 sits on the face of a talking head: leave x/y out and let auto-placement pick (below).
- `wordStack(items:[{text,at}], t, {outAt, x:80, align:'left'|'center'|'right', y:480, size:58})` brand pills with a check, popping one by one, all leaving at `outAt`.
- `counterBadge(t, in, out, {from,to,dur,label}, {x:right edge 1020, y:340, variant:'red'|'brand', color})` notification badge, eased count-up, shakes on late ticks.
- `tagPill(text, t, in, out, {variant:'ink'|'brand'|'paper', x:60, y:246})` header-band label sliding in from the nearer side (y clamped to >= 230); auto-placement puts it on the corner opposite the logo.
- `toast(t, in, out, {title, body}, {y:350, time:'ahora', icon:'mark'})` iOS banner (brand mark icon), slides down and holds. It sits below the header band (y is clamped to >= 350), so it no longer covers the logo bug or a tagPill.
- `chatBubbles(items, t, {outAt, x:90, y:1340 (stack bottom), maxW:760, size:52, max:3, variant:'tint'|'brand'})` big readable chat, no phone chrome: `items:[{from:'client'|'rex', text, at}]`. Client bubbles are white and left; Rex bubbles are light lime (`#E4F3C2`, or the brand primary with `variant:'brand'`) and right, each with the round Rex avatar (`brand.characters.rex.image`, 124 px, pop-in + bob) and a small "Rex IA" tag on the first one. Each bubble pops in at `at` (slide + scale), older bubbles shift up, at most `max` (3) are visible (the oldest fades when the next arrives), all leave at `outAt`. Text >= 46 px. Emoji render through the system emoji font. SFX: one `pop` per bubble.
- `dimensionLine(t, in, out, {label, from, to, track}, {thickness:7, tick:34, size:54, color})` measurement callout for physical products (a 2.40 m table): two end ticks and a line that draws itself from the centre outward (0.8 s), brand-colored label pill (text always horizontal) popping on the middle. **Never auto-placed**: `from`/`to` are `{x,y}` in canvas px, any angle (horizontal, vertical, diagonal), tied to the product in the footage. Optional `track:[{t, from:{x,y}, to:{x,y}}, ...]` (seconds on the video timeline, at least 1 key; linear interpolation, held outside the first/last key) when the product drifts. The planner treats its bounding box over the whole track as an obstacle for auto-placed elements (a long diagonal reserves a large box: prefer horizontal/vertical when other elements compete). SFX: `whoosh`.
- `specCard(t, in, out, {title, rows:[{label, value, icon:'check'|'dot'} | "text"]}, {x:90, y:520, size:40, maxW:820, rowDelay:0.2})` white card, uppercase title with a brand bar, 2-4 rows (icon, label left, value right-aligned) that stagger in; label text >= 32 px (it shrinks to fit `maxW`, never below 30). Auto-placed (x/y = top-left when given). SFX: `whoosh`.
- `onomatopoeia(text, t, in, out, {x:540, y:760, size:170, rotate:-6, points:14, maxW:860})` comic word burst ("¡WOW!", "¡CRACK!", "¡ZAS!"): jagged starburst (deterministic per word) in the brand primary with ink outline and drop block, white word with ink stroke, overshoot pop (0 -> 1.22 -> 1), damped shake and tilt (`rotate` deg, default -6). Auto-placed and kept off the face zone (size variants 100 / 82 / 66 %, not below 80 px). SFX: `pop`.
- `highlightWords` (caption option,- **Producto (imágenes del catálogo)** `productCard`, `productPop`, `carousel`: leen SOLO `RUN/products.json` (nunca URLs remotas); el comp lo carga si existe (`overlay.py` pone `productsFile` en CONFIG). Cada elemento nombra al producto por `id` (`product`, y `image` = id de foto; si falta usa la primera) y usa el recorte si lo hay (salvo `preferOriginal` en esa foto). Las fotos se decodifican antes del primer cuadro (`B.loadProductImages` / `B.productsReady()`); una foto o producto que falta va a `ASSET_ERRORS` (`product`, `product-image`) y `render.mjs` sale con código 2.
  - `productCard` `{product, image?, name?, showPrice (default true), badge?, w:540, x, y}` tarjeta blanca (esquinas 7 %, sombra suave): foto en un recuadro (recorte flotando con sombra; foto completa recortada a cover), nombre (fuente display de la marca, hasta 2 líneas), precio grande y `priceNote`; la etiqueta (`"NUEVO"`, `"-20%"`) es una píldora del color primario sobre la foto. Entrada como `specCard` (escala 0.9→1, sin rebote visible), foto y textos escalonados. x/y = esquina superior izquierda; autocolocada lejos de la cara. SFX: `whoosh`.
  - `productPop` `{product, image?, label?, showPrice (default false), style:"pop"|"slide", size:620, x, y}` una sola imagen (mejor el recorte) que entra con escala/desliza y sombra suave que sigue su silueta, etiqueta opcional (`label` y/o precio) en píldora debajo. x/y = centro del bloque. SFX: `pop`.
  - `carousel` `{style:"slide"|"stack"|"grid-pop", slides:[{product, image?, caption?, price?}] (2-8), showPrice, perItem, w:720, x, y}`. `slide`: tarjetas que se deslizan de lado cada `perItem` s (1.6) con puntos de página; `stack`: pila de tarjetas ligeramente giradas, la de arriba sale volando (1.4 s); `grid-pop`: cuadrícula de 2 (≤4) o 3 columnas, cada celda aparece con `perItem` s de diferencia (0.35), solo nombre y precio. Respeta las zonas (el planificador mide la caja completa y evita cara y subtítulos). SFX: `whoosh`.
 `{"type":"highlightWords","words":[...],"style":"underline"|"box","color"}`): the captions renderer gives matching caption words a brand underline swipe (default, wiping left to right as the word starts) or a filled box. Matching ignores case, accents and punctuation, treats `2,40` = `2.40`, and an entry may span words (`"2.40 m"` matches the words `2.40` `m`, or one `2.40m`). Has no `in`/`out` (it applies to the whole video), is not placed, and shows up in `layout-report.json` as `mode: "caption-option"`. Exposed as `highlightOptions(elements)` -> `captions(..., {highlight})`, and `matchHighlights(words, list)` / `normWord` are exported for tests.
- `floatingPanel(t, in, out, drawContent(ctx, box, localT), {box:{x:140,y:1180,w:800,h:340}, radius, tilt})` async; card with shadow and a 3D tilt-in; box bottom is clamped to 1540. `drawContent` draws into an offscreen canvas (box = {0,0,w,h}).
  `panelFootage(dir, {clipStart, crop:{x,y,w,h}, fit, n})` makes a `drawContent` from a footage sequence (crop in 1080x1920 frame pixels; cover-fit, so pick a crop with the box aspect, 800:340).
- SFX sync: `motionEvents(elements)` fills `MOTION_EVENTS` from the config (never from render calls); the template copies it into `window.TIMELINE.events` as `{t, type:'pop'|'whoosh'|'notify', x:-1..1}` (keywordPop/wordStack item/counterBadge = pop, tagPill/panel = whoosh, toast = notify).
- `drawMotion(elements, t, types)` renders config elements (keywordPop, wordStack, counterBadge, tagPill, chatBubbles, dimensionLine, specCard, onomatopoeia, toast, panel); `captionsY(elements, t, base)` lifts captions to (panel top - 125, about 1055) while a panel is on screen, so they never collide with the panel (box ends at 1520), whatever `--captions-y` says.

`overlay.py --motion motion.json` takes a JSON list (times in seconds on the concatenated timeline):
```json
[{"type":"keywordPop","text":"40 CHATS","in":1.2,"out":3.6,"style":"box"},
 {"type":"counterBadge","in":0.8,"out":4.2,"from":0,"to":40,"dur":2.0,"label":"chats sin contestar"},
 {"type":"tagPill","text":"CON REX","in":4.4,"out":7.2,"variant":"brand"},
 {"type":"wordStack","items":[{"text":"RESPUESTA","at":5.6},{"text":"ETAPA","at":6.4}],"out":8.6},
 {"type":"panel","in":4.8,"out":8.6,"clip":"/abs/demo.mp4","clipStart":3.2,"crop":{"x":215,"y":520,"w":660,"h":280},"box":{"x":140,"y":1180,"w":800,"h":340}},
 {"type":"toast","in":7.4,"out":8.8,"title":"Reda · Nueva visita","body":"Domingo 11:00"}]
```
Optional per-type keys: x, y, size, rotate, align, variant, time, fit, maxW, max, `place`, `opts` (raw options object). Panel clips are extracted video-only to `footage/panel-*/`.
Type-2 (real footage) examples:
```json
[{"type":"dimensionLine","in":1.0,"out":4.0,"label":"2.40 m","from":{"x":120,"y":1010},"to":{"x":960,"y":1010}},
 {"type":"dimensionLine","in":4.2,"out":6.0,"label":"75 cm","from":{"x":990,"y":700},"to":{"x":990,"y":1010}},
 {"type":"dimensionLine","in":1.0,"out":4.0,"label":"2.40 m","track":[{"t":1.0,"from":{"x":120,"y":1010},"to":{"x":960,"y":1010}},{"t":4.0,"from":{"x":140,"y":1000},"to":{"x":950,"y":990}}]},
 {"type":"specCard","in":4.5,"out":8.0,"title":"Ficha","rows":[{"label":"Material","value":"Madera de parota"},{"label":"Acabado","value":"Natural"},{"label":"Capacidad","value":"8 personas"}]},
 {"type":"onomatopoeia","text":"¡WOW!","in":2.0,"out":3.2,"rotate":-8},
 {"type":"highlightWords","words":["gratis","2.40 m"],"style":"underline"}]
```
(the first three `dimensionLine` lines are alternatives: horizontal, vertical, and tracked.) `overlay.py` validates: `dimensionLine` needs `in`/`out` plus `from`+`to` or `track`; `specCard` needs 2-4 `rows`; `onomatopoeia` needs `text`; `highlightWords` needs `words`.

A chat sequence: `{"type":"chatBubbles","out":8.3,"items":[{"from":"client","text":"Hola, ¿sigue disponible?","at":3.9},{"from":"rex","text":"¡Hola! Sí 🙌","at":4.6}]}`.
Z-order: footage, panel, keyword/stack/counter/tag/chat/dimension/specCard/onomatopoeia, hook, captions, logo bug, toast, CTA card, AI label. Motion is hidden under the CTA card.

## Layout bands and face-aware auto-placement (layout.js, scripts/faces.swift)
Fixed bands (px, 1080x1920): header 230-330 = logo bug (240 px wide, in the corner farther from the face on average, top-right when
equal) plus tagPill on the opposite corner; toasts start at y >= 350; free area for motion y 350-1540, x 60-1020; captions at
`--captions-y` (1430 in the Reda cuts), lifted above a panel by `captionsY`; panel box 1180-1520; nothing above 220 or below 1540.

`overlay.py` runs `scripts/faces.swift` (Apple Vision `VNDetectFaceRectanglesRequest` + `VNDetectHumanRectanglesRequest` upper body; no installs,
`swiftc` builds `~/.cache/estudio-video/faces-bin` once) on every 3rd frame of each clip and writes `footage/<clip>/faces.json`
(boxes in 1080x1920 canvas px; frames are already cover-fitted, so the mapping is linear; cached by frame count + source clip stat). Face
boxes interpolate between samples (held through gaps and cuts). If swift/Vision fails or finds no face, a warning is printed and a centered
default face box (340,520,400,400) is used.

`engine/layout.js` `planLayout()` runs in the page at load. Elements with neither `x` nor `y` (or `"place":"auto"`) are auto-placed;
explicit x/y are kept (and still checked). Candidates = named slots (`upper-left/right/center`, `left-mid`, `right-mid`, `left-low`,
`right-low`, `lower-mid`, `above-head`, `below-face`, plus a coarse `grid-*` fallback) x size variants (keywordPop: size down to 60 % but
>= 56 px and narrower wrap; wordStack/counterBadge scale; chatBubbles: width, text size >= 46, or 2 bubbles visible instead of 3).
Score over the element's whole time window: face core + hair band overlap (weight 1000/400, hair weighted lower), person box (60), any
collision with captions/hook/panel/toast/other motion visible at the same time (3000+), leaving the free area (5000), small cost for
shrinking. tagPills go to the header corner opposite the logo; toasts keep y 350. The logo bug fades out while any element would cover it.
Writes `<run>/<comp>/layout-report.json` (slot, rect, `faceOverlap` = share of the element inside the face box, `faceZoneOverlap` including
hair band + margin, `personOverlap`, `collidesWith`, `qaTime`, variants tried) on every render.

`overlay.py` also renders `<run>/<comp>/out/qa-layout.jpg`: one frame at the midpoint of each element with the face box (red), face zone
(yellow dashed), person box (blue dashed), captions/logo (magenta) and element rects (cyan) drawn. Only the QA frames carry these
outlines (`render.mjs ... qa`); the delivered video does not.

## Pantallas de sistema (`ui*`: UI rehecha en vector y animada)
Siete tipos de motion (`engine/motion-lib/ui*.js`) que redibujan una pantalla de producto (CRM, cotizador, PDF…) y la animan estilo After Effects, en lugar de un screenshot con zoom lento. Se dibujan en canvas con el mismo render de siempre (función pura de `t`, sin `Date`/random). Código: `ui-motion.js` (datos: skin, formatos, timelines, geometría, eventos SFX; sin canvas ni DOM), `ui-draw.js` (dibujo), integración en `brand-layer.js` (`drawMotion`, `motionEvents`, `loadUiAssets`/`uiReady`, `captionsHidden`) y `layout.js` (caja fija por `slot`).

**Campos comunes**: `id, in, out, hidden`, `slot` (`"band"` por defecto = tarjeta abajo, dentro de y 780–1540 / x 90–990, entre la barbilla y la UI de la plataforma; `"top"` justo bajo el encabezado; `"center"`), `captions` (`"hide"` por defecto: no se dibujan subtítulos mientras el elemento está en pantalla; `"keep"`), `cursor` (bool, default true donde un clic tiene sentido), `push` (0–0.15, default 0.06; acercamiento de cámara único, siempre hacia adelante y nunca más ancho que la zona segura), `source` (`{kind:"reda"|"screenshot"|"brand"|"fictional", ref?, fetchedAt?}`), `skin` (override parcial del skin). Todos los beats son **fracciones de [in, out]**: estirar el elemento en la línea de tiempo reescala la coreografía; si el elemento es corto (`FULL_MIN` en `ui-motion.js`: lista 2.8 s, formulario 4.8 s, embudo 3.6 s) se usa la tabla "lite" (sin cursor ni tecleo, beats más juntos) en vez de apretar todo. Sin `x`/`y` ni autocolocación: la caja sale del `slot` (`B.uiBox(el)`); la revisión (`uiPlacement`) avisa si se sale de la zona segura o tapa la cara.

| tipo | campos |
|---|---|
| `uiList` | `{title, subtitle, tabs?:[..], activeTab?, rows:[{thumb?, title, pill?:{text,status?}, meta?, value?, format?:"money"\|"text"}] (1–4), select?: índice, tag?: texto}`. Mancha blanca → tarjeta (rebote), filas escalonadas con cuenta de valores, cursor a la fila elegida, clic: la fila se levanta (borde de acento, sombra) y las demás se apagan, empuje, píldora `tag`. |
| `uiForm` | `{title, badge?, subtitle?, steps:[{title, aside?, items:[{kind:"option",thumb?,title,price?,meta?,selected?} \| {kind:"note",text} \| {kind:"field",label,value,icon?:"calendar"\|"user"\|"search",typed?} \| {kind:"select",label,value}]}], total?:{label,value}, button?:{label, loading?, done?}, toast?}`. Encabezado fijo + capa con scroll que avanza paso a paso (solo hacia adelante, se salta los pasos sin acción); el borde de la opción se dibuja y salta el check, `typed` teclea letra por letra, el select cae, el total cuenta, clic en el botón → `loading` → `done` (+ `toast`). |
| `uiDoc` | `{brand, kind?, date?, title, columns?:[..], rows:[{label, detail?, value, bold?}], highlight?: índice, lift?:{label, sub?, value, split?:[{label,pct}]}}`. La hoja sube con inclinación en perspectiva (tiras proyectadas, canvas no tiene rotateX), la regla de acento se dibuja, filas entran, marcador lima barre `highlight` y esa fila se despega como tarjeta (`lift`) con cuenta y barra de reparto. |
| `uiStat` | `{label, value, format:"money"\|"int"\|"pct"\|"compact", prefix?, suffix?, delta?:{text, dir:"up"\|"down"}, icon?}` (`icon`: money, users, chart, home, calendar). Los dígitos giran y se fijan de izquierda a derecha, insignia de cambio, salida con desenfoque. |
| `uiKanban` | `{title, subtitle?, columns:[{name,color?}] (2–5), card:{name, avatar?, chips?:[..]}, from, to, doneLabel?}`. La tarjeta se levanta, cruza las columnas, cae, check verde + `doneLabel`. |
| `uiFeed` | `{title, action?, items:[{avatar?, title, time?}]}`. El primero de la lista entra primero; cada nuevo aviso entra desde arriba y empuja a los demás (máx. 4 visibles). |
| `uiIcons` | `{icons:["whatsapp","facebook","instagram","messenger","youtube","x","linkedin","telegram","gmail","googlemaps","google"] (1–5), plate?:"auto"\|"none"\|"white"}`. **Logos oficiales** de `assets/brand-icons/` (PNG 512 con alfa + `index.json`; se sirven en `/_icons/` y se decodifican antes de READY como las miniaturas: ref `icon:<nombre>`), dibujados tal cual: sin recolorear, sin re-trazar, proporción intacta, separación ≥ ¼ del ancho y nunca menos de 96 px; sombra suave detrás, nunca brillo. **Fondo** (`plate`): por defecto `auto` = sin tarjeta, salvo que el logo no se lea (contraste < 3:1 contra el video de atrás: el comp mide la luminosidad del footage bajo cada logo en 3 momentos antes de READY, `backdrops()` + `B.setBackdropSampler`); entonces primero la variante oficial alterna del `index.json` (`alt`: X tiene una blanca para fondos oscuros) y, si no, una tarjeta blanca redondeada (solo si separa mejor que el logo). Sin video (tipo 1) se decide contra papel. `none` = nunca tarjeta, `white` = siempre. Un archivo que falta es error de asset (el render se detiene), nunca un dibujo falso; TikTok no tiene archivo oficial: se acepta el nombre pero el render se detiene con «falta el logo oficial de TikTok». La función pura `decideIcon` (en `uiIcons.js`) decide y tiene su prueba. |

**Skin** `brands/<slug>/ui-skin.json`: `{font:{family,src}, colors:{primary,accent,highlight,ink,text,muted,faint,line,panel,surface,success,danger, header?}, radius:{card,row,pill}, status:{<etiqueta>:<color>}}`. `overlay.py` lo copia al comp (el del comp gana, luego `RUN/ui-skin.json`, luego el de la marca según `brand.json` `slug`) solo si hay elementos `ui*`, y pone `uiSkinFile` en CONFIG; sin archivo se deriva de `brand.json` (tarjetas blancas, color primario como acento, neutros). La tipografía se carga como las de marca (Google Fonts `<link>` o archivo local). `header` (opcional) = color del encabezado de la tabla de `uiDoc`. Colores de píldora por etiqueta: `status["disponible"]`… (sin distinguir mayúsculas), o `pill.status` con un `#rrggbb`. `brands/reda/ui-skin.json` lleva los tokens reales del CRM de Reda (Cabin, verde #7DBD4D, morado #5E17EB…).

**Imágenes** (`thumb`, `avatar`): ruta relativa al comp (p. ej. `crm/plano.jpg`; `../assets/…` llega a los assets del RUN, p. ej. fotos de `products.json`) o `people:pNN` (banco ficticio `assets/people/pNN@256.jpg`, servido en `/_people/`). Sin URLs remotas ni `..` salvo `../assets/`. Se decodifican antes de READY (`B.uiReady()`); un fallo va a `ASSET_ERRORS` (`ui-image`, `ui-skin`) y `render.mjs` sale con código 2.

**SFX** (`motionEvents`, claves `<id>:<tipo>:<n>`): nacer de la mancha / pop de icono / aviso que entra = `pop`; scroll, subida de la hoja, deslizamiento de la tarjeta = `whoosh`; toast, "listo", check = `notify`; clic del cursor = `click` (nuevo tipo: `assets/sfx/ui-map.json` → `lib/clic.wav`, también `kit:click` en `sfx.json`).

**Regla de subtítulos**: `B.captionsHidden(elements, t)` (en `motion-lib/index.js`) es true mientras un elemento de la biblioteca que oculta subtítulos esté visible (`ui*` con `captions !== "keep"`, `kineticWord` igual, `logoSting` siempre). Los huecos de menos de 0.6 s entre dos elementos que ocultan se tratan como parte de la ventana (sin parpadeo de subtítulo entre pantalla y pantalla); un descriptor puede pedir `tail` segundos extra después de su `out`. `overlay.html` no dibuja subtítulos entonces y el planner no cuenta los subtítulos como obstáculo. Sin elementos que oculten no cambia nada.

## Biblioteca de motion (`engine/motion-lib/`): un archivo = un elemento
Todo elemento nuevo del motion (pantallas, palabra grande, cierre con logo y los que vengan) es **un solo archivo** `engine/motion-lib/<tipo>.js` con un descriptor como export por defecto. Nada más cambia: el registro (`index.js`) descubre los archivos (Node lee la carpeta; el navegador pide `/engine/motion-lib/manifest.json`, que genera `static-server.mjs`) y de ahí salen el dibujo (`brand-layer.js`), el planner de caras (`layout.js`), la validación (`overlay.py` llama a `motion-lib/cli.mjs`; el Estudio usa `schema.js`), el inspector, la biblioteca del panel **Pantallas** (agrupada por `category`, con miniatura dibujada por el mismo `draw`), la revisión y las claves de SFX. Archivos que empiezan con `_` no son elementos (`_kit.js` herramientas de dibujo y marca, `_fields.js` fragmentos del inspector, `_template.js` plantilla, `_testkit.mjs` ayudas de prueba).

**Cómo agregar un elemento**
1. Copia `engine/motion-lib/_template.js` a `engine/motion-lib/<tipo>.js` (el nombre del archivo es el `type`, en lowerCamelCase) y llena el descriptor.
2. Agrega, si hace falta, `engine/motion-lib/<tipo>.spec.mjs` con pruebas propias del elemento. La prueba de contrato `engine/motion-lib.test.mjs` ya revisa **todo** tipo registrado: descriptor completo, `defaults` que validan, beats finitos con `exit` al final de `Ld`, geometría dentro del área libre, eventos de SFX conocidos, dibujo puro (igual dos veces, nada fuera de `[in, out)`, no lanza), miniatura y textos; y carga los `*.spec.mjs`.
3. Corre `cd engine && node --test *.test.mjs studio/test/*.test.mjs motion-lib/*.spec.mjs` y regenera el catálogo: `node engine/motion-lib/cli.mjs catalog --md > references/libreria.md`.

La prueba de contrato vive en `motion-lib/_contract.mjs` (`contractProblems(d)`): la usan `motion-lib.test.mjs` para cada tipo de la librería y `cli.mjs --local` para los elementos propios de un video.

**Elementos propios de un video** (`RUN/<comp>/motion-lib/<tipo>.js`): mismo contrato, escritos igual que un archivo de la librería (copia `_template.js` o el elemento más parecido; sus imports relativos `./_kit.js`, `../ui-motion.js` se reescriben solos a los del motor). Se registran solo para esa composición: render (`overlay.py` pone `CONFIG.localLib` y la página llama `B.loadLocalLib("./motion-lib/")`), Estudio (panel Pantallas, grupo «De este video»; el servidor y el cliente los registran al abrir), revisión y SFX. `overlay.py` corre la prueba de contrato sobre ellos antes de renderizar (`cli.mjs … --local <comp>/motion-lib`) y se detiene con un mensaje en español si alguno falla o si su `type` ya existe en la librería. Sin carpeta = sin cambios (mismos bytes).

**Colocación con cara (por defecto):** todo elemento con solo `size()` (sin `rect`/`candidates`) y sin `placement: "pinned"` lo coloca el planner de caras (`index.js defaultCandidates`): prueba los 3 slots (el `slot` que eligió el usuario es una preferencia: salir de él cuesta `PIN_PENALTY`, así que solo se mueve si la cara de verdad estorba), tamaños `scale` 1 → 0.88 → 0.76 hasta `minScale` del descriptor (por defecto 1 = nunca encoge) y `align: "left"|"right"` cuando la caja deja espacio. El elemento se dibuja a su tamaño natural con una sola transformación sobre la caja elegida. Las 7 pantallas originales (`ui*`) llevan `placement: "pinned"` y no cambian.

**Contrato del descriptor** (`checkDescriptor` en `index.js` lo exige):

| campo | qué es |
|---|---|
| `brief` | 3–6 líneas en español para el director IA (no para el usuario): `Qué:` comunica · `Cuándo:` usarlo y `No usar:` · `Coreografía:` beats · `Gusto:` reglas que importan · `Datos:` de dónde salen textos y cifras. El catálogo `references/libreria.md` se genera de aquí |
| `type`, `category`, `label`, `description`, `icon` | identidad. `category` es el título en español del grupo en la biblioteca; `icon` un solo trazo SVG 24×24. Opcionales: `timelineLabel` (nombre largo en la línea de tiempo), `textKey` (campo que edita el doble clic) |
| `defaults(t, end)` | elemento nuevo al agregarlo en `t`. Datos de ejemplo inventados y en español. `sample(brand)` (opcional) para la miniatura; `sampleDur`, `thumbAt` ajustan la miniatura |
| `fields[]` | campos del inspector (`text, textarea, number, select, bool, list, point, blocks, index…`; `opt: true` = opcional con `ph`). `screen[]` y `source[]` (opcionales, ver `_fields.js`) añaden las secciones «Pantalla» (slot, subtítulos, acercamiento) y «Fuente de los datos» |
| `validate(el, tag)` | `{errors, warnings}` en español sencillo. Los errores detienen el render; el registro suma los chequeos comunes (`slot`, `captions`, `push`, `source`) cuando hay `screen` / `source` |
| `timeline(el, mode)` | `{Ld, b}`: beats con nombre en segundos de diseño (`[a,b]` tramos, `{start,step,dur}` escalonados), siempre con `exit` terminando en `Ld`. El registro los escala a `[in, out]`. `fullMin` + `cursor(el)` para versiones "lite"/"full" por duración. Usa segundos reales con `Ld = out - in` si no quieres que se estiren |
| `size(el, env)` o `rect(el, zones, env)` o `candidates(el, zones, env)` | colocación: `size` → caja en el `slot` (`band` abajo, `top`, `center`) elegida por el planner de caras (ver arriba; `minScale`, `placement: "pinned"`). `rect` para algo propio (pantalla completa). `candidates` devuelve `[{name, rect, patch, cost}]` y el planner de caras elige la mejor (como `kineticWord`) |
| `events(el, rect, {beats, cursor, add})` | SFX: `add(t, "pop"\|"whoosh"\|"notify"\|"click", px?)`. Las claves quedan `<id>:<tipo>:<n>` |
| `draw(ctx, el, t, env)` | función pura de `t`; `env` = `{skin, kit, img, canvas, zones, measure, ts, tl, rect}` (`kit` = la marca: colores, fuentes, logos, `cta`; ver `_kit.js`). Texto nunca menor a 24 px, sin brillos ni degradados de relleno, nada de `Math.random` sin semilla (`seedPhases`) |
| opcionales | `family: "ui"` (pantallas: necesita skin), `captions: "option"\|"always"`, `tail`, `hidesLogo`, `layer: "mid"\|"over"\|"top"`, `panel: "library"\|"text"`, `imageRefs(el, add)`, `showsNumbers(el)`, `texts(el, add)`, `prefill({products})`, `pin` |

### kineticWord (la palabra héroe)
`{id, in, out, text, style?: "rise"\|"slam", color?, size?, slot?: "band"\|"center"\|"top", captions?: "hide"\|"keep"}`. Letras escalonadas 3 cuadros; `rise` sube 40 px desde ~40 % de opacidad y se asienta en ~8 cuadros, `slam` cae de escala 1.6 a 1. Color liso (por defecto el primario o el acento de la marca si se lee sobre video, si no blanco) con sombra suave; sin brillo, degradado ni textura. Tamaño automático 260 → 180 px para caber en el ancho seguro (si no cabe: dos líneas, y solo al final más chica). `band` = altura del pecho (centro y≈1380), como "VENTAS" en el TikTok de referencia. La salida (desvanecido + desenfoque) dura ~30 % menos que la entrada. SFX: un `whoosh` al inicio (`pop` si es `slam`). El planner prueba cada slot y tamaño y elige el que menos tape la cara. La revisión avisa en amarillo si hay más de una por video.

### logoSting (cierre de marca)
`{id, in, out, bg?: "paper"\|"primary", logo?: "auto"\|"color"\|"white"\|"mark", url?, tagline?}`. Capa `top` (encima del logo y el toast, debajo de la tarjeta CTA), oculta subtítulos y el logo de esquina mientras se ve. Tiempos como fracción de la duración: una mancha orgánica del color primario (forma determinista: las fases salen de un hash del `id`) barre la pantalla y deja el fondo liso → el logo entra con un rebote pequeño → se asienta (se achica y sube) → la dirección web se escribe letra por letra (15–22 letras/s) → se queda. Logo de los mismos archivos que usa el logo de esquina y la tarjeta CTA (`logo: "auto"` elige color sobre papel, blanco sobre primario oscuro); una variante pedida que no existe es error de asset, no un cambio silencioso. `url` por defecto: `brand.cta.web`, si no el host de `brand.website`. SFX: `whoosh` en la mancha, `pop` en el logo.

## Transiciones (engine/transitions)
Registro de transiciones entre escenas, con el mismo patrón que `motion-lib`: un archivo por transición en `engine/transitions/` (`<name>.js`, lowerCamelCase, `export default` con el descriptor). `index.js` las descubre solas (Node lee el directorio; el navegador pide `/engine/transitions/manifest.json`); los archivos que empiezan con `_` no se registran.

Para agregar una: copia `_template.js` a `<name>.js`, llena los campos (incluido `brief`, 3–6 líneas para el director IA) y escribe `render(ctx, {from, to, u, W, H, brand, params, seed})`. Contrato: con `u = 0` se ve `from`; con `u = 1` queda exactamente `to`, y la última operación de dibujo es `to` a tamaño completo, opaco y sin transformación; sin `Math.random` ni `Date` (la misma entrada produce las mismas llamadas). Prueba: `cd engine && node --test transitions.test.mjs`.

El esquema de la EDL está en `edl.js`.

## Productos (products.json) y recorte de fondo
`RUN/products.json`: `{version:1, products:[{id, sku?, name, price?, currency?, priceNote?, url?, attributes?, source:"manual"|"reda"|…, fetchedAt?, images:[{id, src, w, h, cutout?, cw?, ch?, preferOriginal?, cutoutWarnings?, cutoutModel?}]}]}`. Es agnóstico de la fuente: el Estudio lo escribe a mano (`source:"manual"`) y `scripts/reda_import.py` escribe el mismo documento desde los resultados del MCP de Reda (`source:"reda"`, `fetchedAt`, `priceBasis`, `priceNote:"desde"`; cada foto guarda `redaUrl`/`redaId`/`redaRole`, y las piezas de remarketing además `title`/`audience`/`shareUrl`; claves extra que el Estudio conserva). Las fotos viven en `RUN/assets/products/<sha8>.png|jpg` (por contenido, nunca se sobrescriben) y se validan con `scripts/validate_asset.py --process-product` (formato real, EXIF aplicado, sRGB, lado mayor ≤ 2048 px, ≥ 64 px). `scripts/cutout.py` quita el fondo con rembg en CPU (modelo `birefnet-general-lite`, ~224 MB, descarga única a `paths.model_dir()`; `--model isnet-general-use` es ~3× más rápido pero falla en tomas recortadas), recorta el margen transparente y avisa en español si la máscara cubre < 5 % o > 95 %, deja huecos duros o bordes muy suaves.
Python: `scripts/paths.py` (`data_dir()`: Mac `~/Library/Application Support/estudio-video`, Windows `%LOCALAPPDATA%\estudio-video`; `python scripts/paths.py --python` imprime el Python del venv), `scripts/requirements.txt` + `scripts/setup_python.py` crean el venv del skill en `data_dir()/venv` (una vez; necesita un Python 3.10–3.13 real, no un shim); node lo encuentra en `engine/studio/pyenv.mjs` (`ESTUDIO_PY` → venv del skill → venv de reels-dibujados → python3).

## footage.js## footage.js
`drawFootage(ctx, dir, t, {start, fps:30, fit:'cover'|'contain', offset, n, crop:{x,y,w,h}, box:{x,y,w,h}})` (async; frame = floor((t-start)*fps)+1; `crop` = source rect, `box` = destination rect, both optional),
`drawCrop`,
`preloadFootage([{dir,start}])` for READY, `frameIndex`, `drawFit`.

## scripts/
- `overlay.py --run RUN --clips a.mp4,b.mp4 [--words words.json] [--hook "text"] [--cta] [--music f.wav] [--name overlay] [--motion motion.json]`
  clips -> frames+audio -> branded render -> mux. Final: `RUN/<name>/out/<name>-final.mp4`. Needs `RUN/brand.json`.
  Also: `--captions-y/--captions-size`, `--logo-clips N`, `--cta-voice v.wav`, `--sfx-map f.json`, `--ai-label/--no-ai-label` (force the in-video AI legend on/off; default = `brand.json` `ai_label`; the label is not drawn when false).
  Without `--music` the clip audio is loudnorm'ed to -14 LUFS; with it, `mix.py` ducks the music and masters to -14 LUFS.
- `faces.swift <frames-dir> [--step 3] [--out faces.json]` Apple Vision face + upper-body boxes (`swift faces.swift ...` or `swiftc -O` it); used by overlay.py.
- `qa_speech.py clip|wav [--out words.json] [--script s.txt] [--lang es]` Whisper words + JSON report (duration, speech_start/end,
  end_gap, gaps >= 0.25 s, words_per_minute, WER vs script). Uses the reels-dibujados venv (`QA_SPEECH_PYTHON` to override).
- `ledger.py RUN quote|job|cap|guard|report` credit ledger -> `RUN/ledger.json`, `RUN/costos.md` (USD is an estimate, `--usd-per-credit`, default 0.05).
- `mix.py RUN_COMP --music f --voice v.wav --events out/events.json` music/voice/SFX mixer (see its docstring). Needs the earshot venv
  (`~/tools/earshot`, `EARSHOT_HOME`); SFX cache in `$ESTUDIO_SFX_DIR` (default `~/.cache/estudio-video/sfx`).
- `pace_voice.py COMP gap [lead]` inserts silence between voice beats.
- `tts.py RUN --voice ID` ElevenLabs narration (key from env or `~/.config/reels-dibujados/.env`; never printed). Paid API.
- `smoke_test.sh` end-to-end check without paid APIs (synthetic clip, `say`, whisper, overlay, ffprobe + ebur128), plus a second `--motion` pass (keywordPop, chatBubbles, toast, specCard, dimensionLine, onomatopoeia, highlightWords) that asserts the final duration, `layout-report.json` (every element, all auto-placed ones with slot + rect), `qa-layout.jpg` and a true peak <= -1 dBTP. The synthetic clip has no face, so it exercises the default-face fallback, not real face avoidance.

## Estudio (editor)
`node engine/studio/server.mjs <run>/<comp> [--port N] [--no-open]` abre un editor local (127.0.0.1) para corregir el `motion.json` de un comp de tipo 2/3 sin volver a pedírselo a la IA: vista previa en vivo, línea de tiempo con las palabras de la voz, arrastre directo en el cuadro, inspector por tipo, comentarios para la IA, historial, y render con el comando guardado por `overlay.py --studio-build`. Detalles, endpoints y cómo extender el esquema: [studio/README.md](studio/README.md).
Segunda pasada: zonas de plataforma ajustables (`B.setZones({top,bottom,left,right})`, `zones.json`; por defecto 220/380/60/60), subtítulos editables (`captions.json`: `{style:{y,size,cx,maxW,upper,maxWords,color,active}, segments:[{in,out,text,words?,hidden?}]}`; `B.captions(..., {phrases, cx})`, `B.segmentsToPhrases`), `speed` por elemento (multiplicador de las duraciones de entrada/salida de cada función de dibujo; 1 = idéntico) y un camino de vista previa sin parpadeo (`window.__BUFFER`, `window.prefetch`; el render offline no los usa). Soporte en el motor: `templates/overlay.html` expone `window.setState({elements, zones, captions})`, `window.setMotion(elements)` (vuelve a correr la colocación automática y recalcula `TIMELINE.events`), `window.getPlan()` y `window.STUDIO`; un elemento con `"hidden": true` no se dibuja, no ocupa espacio en la colocación, no genera eventos de SFX ni resalta palabras; `static-server.mjs` es el servidor estático compartido con `render.mjs`; `overlay.py` acepta `--reuse-footage` (omite la extracción si los cuadros ya corresponden al clip), `--studio-build`, `--mix-options` y `--voice-wav`; `mix.py` acepta `--options FILE`.
