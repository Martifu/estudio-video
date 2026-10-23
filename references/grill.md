# Fase 1 · Grill del video

Objetivo: brief cerrado en 2–3 tandas. Cada pregunta trae una opción `(Recommended)` razonada por el rubro, el producto y la temperatura. No preguntes lo que ya se sabe; anótalo como "dado". Si el usuario mandó un brief en un mensaje ([brief.md](brief.md)), cada campo lleno es "dado" y las tandas se reducen a lo que falte (puede ser cero); las paradas 🛑 posteriores no se saltan.

## Tanda 1 · Qué y para qué
1. **Tipo** (ver tabla en SKILL.md):
   - **1 · Motion**: personajes 3D/generados + mockups + voz ElevenLabs + música/efectos. ≈ sin créditos de video.
   - **2 · Video real editado**: el usuario tiene (o va a grabar) una carpeta con tomas y fotos del producto; pide la ruta.
   - **3 · 100 % IA**: 10–14 s generados (persona real con consentimiento o avatar) + capa de motion. El más caro (14 s ≈ 42 créditos borrador, 224 en 1080p).
   Recomienda según material disponible y presupuesto.
   - Si es tipo 3, pregunta **quién sale** ([personaje.md](personaje.md) §0): vocero/a ya registrado de la marca (Recommended si existe) · persona nueva con fotos para avatar + voz clonada · avatar ficticio.
2. **Formato**: Producto (el producto es el héroe) · UGC demo (alguien muestra cómo se usa).
3. **Producto/tema**: qué se vende o demuestra, en una línea; qué material existe (fotos, capturas, footage, screen recording).
4. **Temperatura de la audiencia** (distribución típica 80 % frío / 15 % tibio / 5 % caliente):
   - **Frío** (no te conoce): hook de dolor o sorpresa, problema → demostración; CTA suave (seguir, ver más). 15–30 s.
   - **Tibio** (te conoce, compara): prueba, comparativa, objeciones, caso; CTA "agenda/cotiza". 30–45 s.
   - **Caliente** (listo para comprar): oferta, garantía, urgencia real, paso concreto; CTA directo con WhatsApp. 10–20 s.

## Tanda 2 · Cómo se siente
1. **Estilo** (el modelo puede proponer): punchy · humor · tranquilo/premium · comparativa (antes/después, nosotros vs. ellos) · POV · tutorial paso a paso · unboxing/reacción.
2. **Duración y plataforma**: Reels/TikTok 15–30 s (default), 30–45 s, o 1 demo + N hooks para A/B.
3. **Subtítulos**: palabras clave gigantes · frases sobrias · karaoke palabra a palabra.
4. **Música y efectos**: estilo musical + nivel de efectos (sutiles / punchy).
5. **Pantallas** (solo si el guion muestra un software o datos: inventario, cotizador, embudo, métricas…): motion reinterpretado (Recommended) · capturas reales · sin pantallas. Ver [pantallas.md](pantallas.md).

## Cierre
Tabla corta con el brief y "¿Lo planeamos así?". Guarda `RUN/brief.json`:
```json
{"brand":"reda","type":3,"format":"ugc_demo","product":"…","goal":"…","temperature":"cold",
 "style":"punchy","duration_s":20,"platforms":["reels","tiktok"],"captions":"keywords",
 "hooks_ab":5,"screens":"motion|captures|none","music":{"engine":"eleven_music|audio_studio","style":"…"},"sfx":"punchy",
 "katana":{"reference":null}}
```
