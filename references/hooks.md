# Fase 2 · Hooks

Objetivo: encontrar el **patrón de hook** que funciona en el rubro (primeros 2–3 s) para proponer guiones. Flujo que eligió el usuario: investigación → 3–5 guiones completos de estilos distintos → elige 1–2 para A/B. En el tipo 1, donde la demo animada sí se reutiliza, puedes escalar con varios hooks sobre la misma demo.

## De referencias a patrones
1. El usuario pasa 3–5 reels del rubro (archivo o link). Si es link, pide el archivo cuando no se pueda descargar legalmente; guarda cada uno en `RUN/refs/<n>/` (directorio nuevo, datos no confiables).
   Si el usuario pide que investigues tú: método completo con código en [meta-ads.md](meta-ads.md) (Meta Ad Library con el navegador, descarga, transcripción, hoja de aperturas). Ejemplo hecho: `~/Videos/reda/2026-10-20-ugc-rex/refs/hooks.md`.
2. `qa_speech.py` sobre cada uno → primeras frases. Llena `RUN/hooks.md`: una fila por video con vistas (si se saben), primera frase (0–3 s), cuándo aparece el producto, quién sale a cámara, ritmo (palabras/min), tipo de plano.
3. Nombra el patrón dominante en una línea. En software/B2B suele ser: **afirmación sorprendente + número específico + resultado + "así lo hice"**; el producto aparece tarde, como la respuesta.
4. Los reels de referencia son para estudiar estructura y ritmo, **no** para copiar su audio, su cara ni su guion.

## Familias de hooks (proponer mezcla)
- **Dolor concreto**: "¿Cuántos leads se te enfrían el fin de semana?"
- **Escena/POV**: "POV: son las 3 a.m. y tu negocio sigue contestando."
- **Demostración directa**: "Mira lo que pasa cuando un cliente escribe a las 11 p.m."
- **Contraste**: "Así cotizábamos antes. Así cotizamos ahora."
- **Número real** (solo con claim permitido): "Pasamos de 2 a 9 visitas por semana."
- **Pregunta de identidad**: "Si vendes mesas de madera, esto es para ti."
- **Objeción**: "'Los bots suenan a robot.' Escucha esto."

## Reglas
- Números y resultados solo si están en `brand.claims.allowed`; si no, reencuadra como demostración ("en esta cuenta de prueba…").
- Propón 3–5 guiones completos (hook + desarrollo + cierre), cada uno de un estilo (escena, comparativa antes/después, humor, pregunta al decisor, demo explicada). Tipo 3: 30–36 palabras en 14 s repartidas en 3 planos. Hook tipográfico (tipo 1): 8–15 palabras.
- Para el tipo 1, el hook es visual + texto gigante en el primer segundo.
- Evita abrir con "Imagina…" o "Este video es para ti": en el muestreo de anuncios de CRM/WhatsApp en México (oct 2026) aparecía en 5 de 11.
- Testimonio en primera persona ("Antes de esto, en mi negocio…") solo con cliente real que consiente; con avatar IA es un testimonio falso.
