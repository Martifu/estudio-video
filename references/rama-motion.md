# Tipo 1 · Motion (personajes + mockups + voz)

El más barato: todo se anima en nuestro motor. Personajes 3D de la marca (`brand.characters`, p. ej. `brands/reda/assets/rex_head.png`) o generados con imagen (Codex image gen o Higgsfield `gpt_image_2_5` / `soul_2`, ~0.12–0.25 créditos por imagen), mockups de producto (chat, app, pantalla, producto recortado), voz ElevenLabs, música y efectos.

Motor: `engine/render.mjs` captura una composición HTML/canvas (`window.render(t)` función pura de t, `window.TIMELINE`, `window.READY`) cuadro a cuadro y codifica BT.709 rango limitado. Capa de marca y motion: `engine/brand-layer.js`. Uso: [engine/README.md](../engine/README.md).

## Referencia probada: chat de Rex (Reda, 2026-10-20)
`~/Videos/reda/2026-10-20-ugc-rex/demo/index.html` → chat tipo WhatsApp animado (sin marcas de WhatsApp) sincronizado palabra por palabra con la voz (`vo_demo/voice/words.json`), con eventos para efectos. Se ve muy bien a pantalla completa; **como recuadro pequeño encima de otro video no se lee** (usar `chatBubbles`). Receta: `brands/reda/recetas/tipo1-chat-rex.md`.

## Flujo
1. **Voz primero** (`tts.py RUN --voice ID --stability 0.5 --tempo 1.1`, `[excited]` al inicio para energía) → `words.json`, `beats.json`. La imagen se ancla al inicio de la palabra que dispara cada cosa.
2. **Personajes**: de la marca o generados con hoja de personaje (frente, ¾, perfil, expresiones) para que se mantengan entre escenas; fondo transparente (`remove_background`).
3. **Composición** `RUN/<comp>/index.html`: escenas con golpe visual cada ≤ 3 s (punchy) o ≤ 7 s (tranquilo); hook con movimiento en el primer segundo; personajes con pop-in, bob y parpadeo; mockups con burbujas, notificaciones, contadores.
4. **Previews gratis** (`render.mjs … preview-v t1,t2,…`) para el storyboard de la 🛑 Parada 5.
5. **Sonido**: `events` → efectos (kit UI `assets/sfx/ui-map.json` para pops/whoosh/notify, o earshot para efectos más ricos), música (audio-studio local instrumental, o Eleven Music con plan que lo permita) → `mix.py` → `render.mjs … v` → `mux`.
6. Capa final con `overlay.py` (subtítulos, logo, CTA) si la composición no la trae.

## Estilo y reglas de motion
Fondos claros, anti-slop, easing, duraciones, texto, hook, ritmo y sincronía: [motion-reglas.md](motion-reglas.md) (comunes a los 3 tipos).

## Material
- Software: pantallas redibujadas con los componentes `ui*` (`slot:"center"`, escena completa) a partir de capturas reales con datos de prueba, o mockups como el chat de Rex; cursor y taps animados. Ver [pantallas.md](pantallas.md).
- Producto físico: fotos reales recortadas o stills de `product-photoshoot`.
- Personaje mascota: imagen de la marca o generada; nunca parecido a una persona real identificable.

## Otras referencias
Reels V1–V5 de Modo: tipografía cinética, slam de palabras, music hole, crítica de earshot.
