# Reglas de motion (los 3 tipos)

Aplican a todo lo que anima el motor: la composición completa del tipo 1 y la capa de motion (`overlay.py --motion`) de los tipos 2 y 3. Los números vienen de cinetic (Leonxlnx, MIT), donde están a 60 fps para películas horizontales; aquí ya están pasados a **30 fps y 1080×1920**. Son valores iniciales: si el usuario aprueba otro ritmo, anótalo en la receta de la marca.

| Sección | Tipo 1 | Tipo 2 | Tipo 3 |
|---|---|---|---|
| Estilo y anti-slop | todo | capa de motion | capa de motion |
| Easing, duraciones, rebote, texto | todo | capa de motion | capa de motion |
| Hook | composición | primer corte + motion | primer plano + motion |
| Ritmo de cortes | cambios de escena | tus cortes | solo planos de apoyo (los cortes internos los fija el prompt) |
| Sonido, cierre, acento | todo | todo | todo |

## Estilo base (feedback 2026-10-21)
Fondos claros y limpios por defecto (blanco o neutro muy claro), sin degradados de color, brillos ni viñetas neón: el usuario los rechazó por verse "AI slop, chillante". Fondo oscuro plano solo cuando la historia lo pide (de noche, p. ej. "Tú a las 2 a.m."), como cambio de tema, nunca con brillo neón. Los colores de la marca van como acento (subrayados, ticks, una etiqueta), no de fondo. Sobre blanco, el texto de color usa `accent_on_paper` (variante oscura) para que se lea. Los mockups de UI (terminal, chat) pueden ser oscuros sobre la página clara. En los tipos 2 y 3 el fondo es la toma; tarjetas, fichas y burbujas siguen estas reglas.

Anti-slop (adaptado de taste-skill v2 de Leonxlnx, que es para web):
- **Sin degradados**: ni de fondo, ni en tarjetas o botones, ni en texto. Color plano o una foto/toma real; la única excepción es un velo neutro bajo texto encima de una imagen.
- **Sin brillos (glow).** Las tarjetas modernas sí llevan profundidad: sombra suave y difusa, esquinas redondeadas y **fotos reales o realistas** (avatares, producto). Es lo que hace que los componentes de los videos de Reda se vean mejor; lo que sobra es el relleno (degradados de fondo, neón), no la profundidad.
- **Sin relleno decorativo**: manchas de degradado, formas abstractas, emojis de adorno, dashboards falsos de barras grises. Cada elemento en pantalla dice algo del guion.
- **Entradas solo con transform y opacity.** Nada de giros salvo un golpe puntual (onomatopeya, sello).
- **La paleta sale del producto y la marca**, no de una paleta "de IA" genérica (crema con terracota, violeta-índigo de relleno). Si la marca usa violeta (p. ej. `brands/estudio-video`), va como acento, nunca de fondo.

## Productos en pantalla (productCard, productPop, carousel)
- La foto sale de `products.json` (nunca URL remota); el nombre y el precio se leen en pantalla ≥ 30 px y nunca van pegados en la foto del producto.
- Misma entrada que una ficha (escala 0.9→1, `out`, sin rebote: no cuentan en los 2 rebotes; excepción deliberada: en el carrusel `stack` la tarjeta de arriba sale girando ~16°, un giro corto de salida); el carrusel `slide` muestra cada producto ≥ 1.2 s, el `grid-pop` escalona ≤ 0.4 s.
- Fuera de la cara y de las zonas de plataforma (colocación automática); un precio que viene de un catálogo (no de `source:"manual"`) se verifica antes de publicar; una foto no se amplía más de 1.15× (Revisar avisa).

## Pantallas de producto (uiList, uiForm, uiDoc, uiStat, uiKanban, uiFeed, uiIcons)
Software y datos se muestran redibujados y animados, nunca como captura con zoom: [pantallas.md](pantallas.md). Excepción a estas reglas: el nacimiento de la tarjeta lleva rebote y no cuenta en los 2 rebotes; el clic y el cambio de pantalla caen en el mismo cuadro; la cámara empuja una vez por paso y nunca acerca y luego aleja.

## Palabra grande y cierre con logo (kineticWord, logoSting)
- `kineticWord`: la palabra héroe, **una por video**, entra letra por letra (`rise` o `slam`), color liso con sombra suave, sin brillo ni degradados; va a la altura del pecho y lejos de la cara. Revisar avisa en amarillo si hay más de una.
- `logoSting`: cierre de marca alternativo o compañero de la tarjeta CTA (mancha de color → logo → dirección web escrita). Dura 3 s o más; oculta subtítulos y el logo de esquina mientras se ve.

## Easing
Máximo 3 curvas por video, siempre las mismas por nombre:

| Nombre | cubic-bezier | Para |
|---|---|---|
| `out` | .16, 1, .3, 1 | entradas (default) |
| `outSoft` | .22, 1, .36, 1 | entradas tranquilas, tarjetas grandes |
| `exit` | .55, .055, .675, .19 | salidas |
| `ui` | .4, 0, .2, 1 | mockups: taps, toggles, scroll de chat |
| `cam` | .48, .1, 0, .9 | push/zoom de cámara, zoompan de fotos |

Las salidas duran ~30 % menos que su entrada. Un movimiento secundario empieza al 55–75 % del principal (no a la vez). El efecto de una interacción (tap → pantalla cambia) empieza 1 cuadro después del tap.

## Duraciones (cuadros a 30 fps)
- Popover, badge, toast: 4–6 · botón/tick: 8–10 · tarjeta o ficha: ~13 · mockup completo o panel: 18–26 · push de cámara: 28–54.
- Contadores: 18–52 en `out`. Una revelación repetida va ~40 % más rápida la segunda vez.

## Rebote (overshoot)
1–7 % y solo cuando algo aterriza; **máximo 2 por video**. `keywordPop` (1.08) y `onomatopoeia` son los golpes permitidos y cuentan dentro de esos 2. Subtítulos, fichas y frases nunca rebotan. Solo una palabra héroe por video se anima letra por letra.

## Texto en pantalla
- Fragmentos de 1–4 palabras (ideal 2–3), máximo 8 palabras visibles a la vez (subtítulos aparte).
- Entrada: desde ~40 % de opacidad, sube 24–48 px y asienta en 6–12 cuadros. Escalonado entre palabras: 3 cuadros (punchy) o 5–6 (tranquilo). Slam: escala 1.4–2.1× → 1 en 10–13 cuadros.
- Tiempo mínimo en pantalla: 0.6 s + 0.1 s por palabra (punchy) o 0.7 s + 0.13 s por palabra, mínimo 1 s (tranquilo). En los tipos 1–2 el texto entra en la palabra de la voz que lo dispara y se queda al menos ese mínimo.
- Escritura tipo terminal: 15–22 caracteres/s, nunca más de 30.
- Tamaño mínimo 32 px; frases grandes 88–128 px con interlineado 0.95–1.05; contraste ≥ 4.5:1 (≥ 7:1 en la frase principal).
- Mientras se lee, el texto se mueve como máximo 3 px por cuadro (una deriva de ≥ 0.3 px/cuadro lo mantiene vivo).
- Zonas de plataforma: por defecto 220 px arriba, 380 px abajo y 60 px a los lados ([calidad.md](calidad.md)); se ajustan por plataforma (Reels, TikTok, Shorts) en el Estudio (`zones.json`) y la colocación automática las respeta.

## Hook (primer segundo)
Algo cambia a los ~0.1 s, la primera palabra se lee a los ~0.4 s, el problema se siente al 1 s y se dice antes de los 2 s. Después, un cambio visible cada ~1 s. Un título quieto más de 2.5 s es un hook lento. El producto se nombra en pantalla antes del ~25 % del video.

## Ritmo de cortes
- Plano mediano 1.5–2.7 s; ningún plano de más de ~6 s en tranquilo (~4 s en punchy). Planos de menos de 0.45 s sin texto.
- Cortes secos por defecto; nada de disolvencias entre escenas (sí a la tarjeta CTA).
- Una sola pausa quieta de 1–1.6 s en el mensaje clave, seguida del movimiento más grande.
- Respiro de 1–4 s entre el 55 y el 85 % del video; el último pico entre el 75 y el 90 %.

Transiciones (`engine/transitions/`): el corte seco es el default. Como máximo 3 transiciones distintas de corte por video, colocadas sobre el pulso de la música. Para golpes, `flashWhite` o `glitchRGB`. Para moverse entre escenas, `whipPan` o `pushSlide`. Para momentos de marca, `brandWipe` o `irisCircle`. Para algo suave y premium, `blurCross`. `fadeColor` solo para el cierre. Para pasar de persona a pantalla, `zoomMatch`. Para revelar un producto, `cardFlip`. `zoomPunch` cae sobre el pulso. Nada de disolvencias entre escenas.

## Sonido y sincronía
- El cambio visual cae en el cuadro del sonido o 1 cuadro antes; si el audio adelanta a la imagen más de ~45 ms, se nota.
- Whoosh: empieza 100–450 ms antes del punto máximo del movimiento.
- Un sonido suave por fragmento de texto, no por palabra.
- Los efectos salen de `events.json` (generado por la propia composición), nunca colocados a mano.
- Más de ~2.4 s (punchy ~1.6 s) sin ningún evento visible se siente muerto.

## Cierre y marca
- Tarjeta CTA de 1.5–2.5 s; el link o teléfono legible al menos 1.7 s; deja ≥ 1 s de cola.
- El logo grande aparece una vez, al final (el logo pequeño de la franja superior no cuenta).
- El color de acento cubre como máximo ~8 % de la imagen.
