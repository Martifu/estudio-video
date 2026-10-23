# Fase 3 · Personaje

Para tipo 3 y UGC con avatar. El personaje es **original** (desde una descripción) o una **persona real que consiente** (`brand.faces.consent_on_file`). Nunca un "doble" de alguien identificable.

## 0. ¿Quién sale en el tipo 3? (recomendar en este orden)
1. **Vocero/a que la marca ya tiene registrado** (`brand.faces.people[]`, p. ej. Hassan en Reda): se reutilizan sus fotos y su muestra de voz. Es la opción recomendada por defecto: cero preparación, identidad y voz ya probadas, misma cara en toda la serie.
2. **Persona real nueva → avatar + voz clonada**: el usuario pasa fotos nuevas de la persona (mínimo 2; con 5–20 se puede entrenar un personaje reutilizable de Higgsfield, `show_characters(action='train')`, ~10 min) y una grabación limpia de su voz (1–3 min, sin música) para **clonarla** (ElevenLabs Instant Voice Clone, incluido desde Starter; o `create_voice` de Higgsfield — verificar en el primer uso). Con la voz clonada se genera el clip de referencia para Seedance (otra frase, 8–15 s, mono) y, si una serie usa varias generaciones, se iguala la voz con `voice_change`. Requiere consentimiento por escrito de esa persona para su cara **y** su voz en anuncios.
3. **Avatar 100 % ficticio** (sección 1–3) + voz de biblioteca ElevenLabs como referencia de timbre: no necesita permiso, pero la voz no queda idéntica entre generaciones.
Pregunta con AskUserQuestion mostrando estas 3 opciones (la 1 como `(Recommended)` si existe).

## Persona real: cómo se registra
Si la marca tiene un vocero/a real: 2 fotos de identidad (una de frente, una de medio cuerpo con el vestuario de marca) subidas a Higgsfield (`media_upload` → PUT → `media_confirm`) + una muestra de su voz (mp3 2–15 s, mono). Registra en `brand.faces.people[]`: `name`, `role`, `identity_media_ids`, `voice_ref_media_id`, `consent` (quién y cuándo lo autorizó para anuncios), `pronunciation`. Sin consentimiento confirmado por el usuario, no se usa. En el prompt: "preserve his exact face, apparent age, hair, skin tone, physique and identity", vestuario fijo y sin logos generados (el logo lo pone la capa de motion). Ejemplo: Hassan en `brands/reda/brand.json`.

## 1. Brief del personaje (AskUserQuestion)
Vibra (de la Parada 1), edad aparente (adulto, ≥ 21), rol (dueña de negocio, asesor inmobiliario, veterinaria, instalador solar…), vestuario coherente con el rubro, locación (oficina, bodega, casa, clínica, obra), estilo: **fotorreal** o **caricatura 3D profesional** (estilo animación de estudio, consistente entre tomas).

## 2. Prompt JSON bloqueado (método "portrait-clone")
Cada variable que el modelo podría inventar se fija con un valor concreto; lo no fijado se aleatoriza. Guarda `RUN/character/prompt_v1.json`:
- `critical_constraints` (líneas `FACE:`, `EYES:`, `HAIR:`, `LOOK:`, `MEDIUM:`) y `negative_prompt` arriba.
- Cara, ojos, piel (hex de tono, poros, asimetrías ubicadas), cabello (hex, largo por referencia anatómica), manos, vestuario por prenda (hex, tela, ajuste), pose, expresión (intensidad n/10), escena, luz (key/fill, temperatura), cámara (pipeline de captura real: "iPhone front camera, 26 mm equiv"), color, salida (9:16 o 3:4).
- **Ausencias explícitas**: lentes, aretes, texto, logos, segunda persona, props → `"none"` y también en `negative_prompt`.
- **De-slop obligatorio**: nada de "4K, 8K, ultra-detailed, masterpiece, flawless, glowing skin"; sí imperfecciones ubicadas, sin sharpening, grading natural, post-proceso de captura de teléfono. La última línea de `critical_constraints` es `MEDIUM: must read as an unretouched phone capture, never a render or retouched photo` (fotorreal).
- Contra el "default de modelo" (ojos grandes, cara de muñeca, piel de cera, pose de modelo): describe la desviación, agrégala a `critical_constraints` y pon el default en `negative_prompt`.
- Etnicidad por rasgos, sin nombrarla; nunca nombres reales ni "parecido a X".
- El personaje sale **sin producto en las manos** (el producto entra en las escenas).

## 3. Generar y comparar → 🛑 Parada 2
Cotiza y genera el mismo JSON en 2–3 modelos de imagen de Higgsfield (p. ej. `soul_2` 3:4 2k — el que usa el flujo UGC oficial —, `nano_banana_pro`, `gpt_image_2_5`; confirma IDs con `models_explore`). Muéstralos lado a lado y di cuál suele verse más real. El usuario elige. Guarda `RUN/character/character.jpg` + su `media_id`/`job_id` y el JSON ganador.

Iteración: si un rasgo no coincide, compara variable por variable, divide el campo en subcampos más precisos, refuerza `critical_constraints` y `negative_prompt`, sube la versión (`_v2`). Un cambio a la vez (no hay semilla estable en video).

## 4. Consistencia
- Hoja de personaje multi-ángulo (frente, ¾, perfil, plano medio) con el workflow `character-sheet` de Higgsfield cuando el video tenga varias escenas o planos.
- Para series de una marca, guarda el personaje en `brands/<slug>/cast/<nombre>/` (imagen, JSON, media_id, voz asociada) y reúsalo.
- La descripción escrita es el contrato de continuidad: repite la misma frase de persona en cada prompt de clip.

## Banco de avatares (componentes)
- `assets/people/` tiene 16 retratos ficticios latinoamericanos (8 mujeres / 8 hombres, 23-63 años; `p01`-`p16`, `<id>.jpg` 512 px y `<id>@256.jpg`; ver `manifest.json` para edad, look y tags, y `sheet.jpg` para elegir) para listas de actividad, avatares de chat, reseñas y listas de prospectos del CRM. Los rostros son ficticios (no requieren consentimiento) pero nunca se presentan como clientes ni testimonios reales (ver `legal.md`).
- Para agregar más: escribe un prompt en `assets/people/prompts/pNN.txt`, corre `scripts/gen_image.sh prompts/pNN.txt assets/people/src/pNN.png square`, agrega la entrada a `manifest.json` y ejecuta `scripts/people_post.py` con `~/.local/share/reels-dibujados/venv/bin/python -I` (recorte cuadrado, exports y `sheet.jpg`).
