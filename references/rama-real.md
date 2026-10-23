# Tipo 2 · Video real editado + motion

El usuario graba y deja todo en una carpeta; la IA edita y pone la capa de motion. Ejemplo típico: una mesa de madera de lujo → tomas del producto, una persona presentándolo, fotos de detalle → edición con cotas de medidas, ficha de características y onomatopeyas en los momentos clave.

## 1. Recibir la carpeta
Pide la ruta (p. ej. `~/Videos/<marca>/material/<producto>/`). No muevas ni modifiques los originales: copia o enlaza a `RUN/footage/raw/`.
- Si aún no grabó: genera `RUN/tomas.md` (lista de tomas): hero del producto, detalle/textura, en uso, escala con persona, la persona a cámara (2 variantes del hook), b-roll de ambiente. Vertical 9:16, 3–8 s por toma + 2 s de colchón, luz de frente (nunca contraluz), micrófono cerca, sin música de fondo.
- Inventario: `ffprobe` de cada archivo (duración, fps, rotación, HDR → convertir a SDR BT.709), y `qa_speech.py` en cada toma con voz → transcripción con tiempos. Fotos: tamaño y orientación.
- Escribe `RUN/inventario.md`: una fila por archivo (qué se ve, calidad, frases útiles, rango bueno).

## 1b. Sin material propio: stock (Pexels)
Si el usuario no tiene tomas, arma la carpeta con stock de **Pexels** (Pexels License: uso comercial sin atribución obligatoria; no usar a personas identificables de forma que parezca que respaldan la marca, ni revender el clip tal cual). Busca en pexels.com con el navegador de vista previa (`preview_open`, `open:false`, `https://www.pexels.com/search/videos/<término>/?orientation=portrait`), elige clips verticales y descarga el archivo directo (`https://videos.pexels.com/video-files/<id>/<id>-uhd_1440_2560_<fps>fps.mp4` o la resolución que exista). Cada clip en `RUN/footage/raw/pexels-<id>/` con `credits.json` (`source_url`, `file`, `author`, `license`, `downloaded`, `used_as`). Ejemplo previo: `~/Desktop/personal/modo/launch/videos/_stock/`.
- Producto: 4–8 tomas (hero, detalle, en uso, escala con persona) + 2–4 fotos (Pexels fotos).
- El stock casi nunca trae habla sincronizada: usa voz en off ElevenLabs (casting normal) y personas solo como b-roll.

## 2. Guion de edición → 🛑 Parada 4
Propón 2–3 cortes (orden de tomas + qué dice + qué motion entra), de 15–30 s, con el hook en los primeros 2 s. Usa solo lo que existe en la carpeta; si falta una toma clave, dilo y propón cubrirla con una foto animada o una toma generada (cotizada).

## 3. Edición
- Selecciona tomas comparando transcripción vs guion; corta silencios > 0.3 s, muletillas y tomas falsas; arma `RUN/edl.json` (clip, in, out, rol) y renderiza los cortes con ffmpeg (`trim`/`concat`, mismo fps).
- Fotos del producto: entran como clips cortos con movimiento (zoom/paneo lento) generados con el motor o ffmpeg `zoompan`.
- Gradación unificada sutil hacia la paleta (caras naturales).
- **Recortar sin rehacer el montaje:** pasa todas las tomas como material (`--clips a.mp4,b.mp4,…`, con `<toma>.words.json` al lado o `--words-by-clip`) y deja el corte en `<comp>/edl.json` (`{segments:[{clip,in,out,transition?}]}`, ver engine/studio/README.md «Cortes del video»); el usuario lo ajusta en la pista Video del Estudio (bordes = recortar, S = dividir, rombo = transición). Sin `edl.json` todo funciona como antes.

## 4. Capa de motion (motion.json, ver engine/README.md)
Estilo, tiempos y ritmo de cortes: [motion-reglas.md](motion-reglas.md).
- `dimensionLine`: cotas sobre el producto ("2.40 m"), con `from`/`to` en px del lienzo; usa `track` si la cámara se mueve. Mide la posición del producto en un cuadro (preview) antes de fijarla.
- `specCard`: ficha de 2–4 características (material, acabado, capacidad, garantía real).
- `onomatopoeia`: "¡WOW!", "¡ZAS!", "¡CRACK!" en acciones visibles (golpe a la madera, se abre un cajón, se enciende un panel).
- `highlightWords`: resalta en los subtítulos las palabras de venta que detectes en la transcripción (medidas, "a mano", "garantía", precio si está en `claims.allowed`).
- `keywordPop` para el hook, `toast`/`chatBubbles` si el producto implica mensajes, CTA final.
- Colocación automática lejos de la cara; las cotas sí van en posición fija sobre el producto.
- Si la persona habla de un software o de datos (inventario, cotizador, métricas): pantallas `ui*` encima de su toma, no capturas ([pantallas.md](pantallas.md)).
- **Fotos del producto (catálogo):** `productCard` (foto + nombre + precio + etiqueta "NUEVO"/"-20%"), `carousel` (2–8 productos: `slide`, `stack`, `grid-pop`) y `productPop` (el recorte flota mientras la persona habla). Salen de `RUN/products.json`, que el usuario llena en el panel *Productos* del Estudio (fotos arrastradas, «Quitar fondo» gratis y local) y que también llena el importador de Reda (ver 4c; `source:"reda"` con datos de menos de 7 días no pide verificar el precio, otra fuente desconocida sí). Usa el producto por `id`, nunca una URL. Prefiere `productPop` sin precio para "mira esto" mientras habla, `productCard` cuando dice el precio, `carousel` para "tenemos más piezas". Un recorte con aviso (huecos, casi sin fondo quitado) se sustituye con «Usar original».

## 4b. Estudio (editor local)
Tras el primer render, agrega `--studio-build` a ese `overlay.py` (escribe `<comp>/.studio/build.json`) y lanza el editor para que el usuario ajuste el motion sin volver a pedírtelo: `node engine/studio/server.mjs RUN/<comp>` (abre Chrome en `http://127.0.0.1:<puerto>/`). Corrige tiempos, posiciones, textos, visibilidad, audio y versiones de medios; renderiza con el botón o el endpoint. Cuando el usuario diga que dejó comentarios, lee `RUN/<comp>/.studio/inbox.jsonl` (una línea JSON por comentario: `t`, `elementId`, `elementType`, `x`, `y`, `text`, `resolved`), aplica los cambios en `motion.json` (el editor recarga solo vía SSE) y marca el comentario como resuelto en el archivo (`"resolved": true`). Solicitudes con costo (voz, música, regenerar tomas, 1080p): `.studio/requests.jsonl`, contrato en [engine/studio/README.md](../engine/studio/README.md).
El logo y la tarjeta de cierre también se editan ahí (mover, tamaño, entrada, texto; *Reemplazar logo…* sube un PNG/JPG/WebP validado a `RUN/assets/logo-<sha8>.png` sin tocar `brand.json`); se guardan en `logo.json` / `cta.json` y el render se detiene con un error claro si un asset no carga.

## 4c. Producto de Reda (inmuebles)
Si el video es de un proyecto/modelo de Reda: `list_projects` → `get_project` → `get_project_media` (+ `list_inventory` para disponibilidad y precio de unidad), solo lectura → guarda los resultados crudos en `RUN/reda-<id>.json` → `scripts/reda_import.py` (con el Python del venv, ver SKILL.md) → el Estudio muestra los productos.
- Ids: `reda-<proyecto>` (el proyecto: portada + galería, amenidades/brochure en `attributes`), `reda-<proyecto>-m<modelo>` (precio «desde», recámaras, baños, m², disponibles; portada del modelo + galería) y las colecciones `reda-<proyecto>-remarketing` (piezas activas; cada foto guarda `title`, `audience` frío/tibio/caliente y `shareUrl` /promo) y `reda-<proyecto>-amenidades`.
- **Precios:** salen de Reda con su `priceBasis`. El precio de un modelo es «desde» (`priceNote`); para cotizar a un cliente usa el precio de la unidad (`list_inventory`, `precioFinal`/`precioLote`) y escríbelo tú en el motion con su fuente; un precio 0 o `unavailable` no se importa y no se muestra. Nunca inventes precio, m² ni amenidades.
- Si hay varios proyectos o modelos posibles, pregunta cuál antes de importar (`--models id,id` limita los modelos).
- Fotos de inmuebles: originales, **sin quitar fondo** (`productCard` / `carousel` las muestran tal cual; las de Reda son renders y pueden ser chicas: Revisar avisa si se amplían de más). Las piezas de remarketing llevan texto propio de marketing: úsalas como referencia de estilo o b-roll, no como foto de producto.
- Re-importar actualiza precios y datos sin duplicar fotos ni mover el orden que el usuario dejó.

## 5. Sonido
Voz real de la toma (normalizada) o voz en off ElevenLabs si el usuario la pide; música audio-studio/Eleven Music; efectos del kit UI o earshot sincronizados con los eventos de motion → `mix.py`.

## Katana
Si el usuario quiere "uno como este reel" y hay archivo de referencia con derechos, [katana.md](katana.md) puede editar su footage en ese lenguaje; después pasa por nuestra capa de marca si hace falta.

## Estado
Rama documentada pero aún sin piloto: el primer proyecto real calibra `dimensionLine`/`specCard` y la edición automática; anota aquí lo aprendido.
