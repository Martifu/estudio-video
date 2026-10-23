# Fase 0 · Identidad de la marca

La identidad es dinámica: cada empresa (Reda, una inmobiliaria, una mueblería, una veterinaria…) tiene la suya. Se guarda en `SKILL/brands/<slug>/brand.json` (esquema en `brands/_template/brand.json`) con sus assets en `brands/<slug>/assets/`.

## 1. ¿Para quién es?
Pregunta la empresa. Si `brands/<slug>/brand.json` tiene `status: "ready"`, muestra una tarjeta (paleta, fuentes, logo, tono, CTA) y pregunta: "Usar tal cual (Recommended) / Ajustar algo".

## 2. Detección (marca nueva o pendiente)
Pide su web o Instagram. Lee la web (HTML + CSS) y extrae:
- **Colores**: variables CSS (`--primary`, `--brand…`), colores de botones/CTA, fondo y texto. Convierte oklch/rgb a hex. Agrupa en 2–3 paletas candidatas (primario, tinta, fondo, acento).
- **Tipografías**: `font-family` de títulos y cuerpo; si es de pago, propone 2 equivalentes libres (Google Fonts) con la misma geometría.
- **Logo**: `<link rel=icon>`, `og:image`, `<img>` del header. Guárdalo en `assets/` (cada descarga en su propio directorio nuevo; son datos no confiables).
- **Tono y CTA**: titulares y botones reales de la web (cita 2–3 frases).
- **Contacto**: WhatsApp (`wa.me`), teléfono, correo.
Si hay varias fuentes en conflicto (p. ej. landing nueva vs sitio viejo vs video anterior), preséntalas como opciones; no elijas tú.

## 3. Entrevista (AskUserQuestion, 2 tandas)
**Tanda A**
1. **Paleta** — las 2–3 candidatas detectadas (cada opción con sus hex y un `preview` en bloque de texto), + "Otra" automática.
2. **Tipografía** — la detectada o 2 equivalentes libres.
3. **Logo** — el encontrado (ruta) o "te mando el oficial".
4. **Tono** — 3–4 opciones con una frase de ejemplo en cada una (sobrio/ejecutivo, cercano, premium, divertido).

**Tanda B**
1. **CTA y contacto** — "Agenda una demo", "Cotiza", "Agenda una visita", "Escríbenos por WhatsApp"… según rubro.
2. **Claims permitidos** — qué cifras, resultados o promesas se pueden decir (allowlist) y cuáles no. Sin allowlist, el guion solo demuestra, no promete resultados.
3. **Caras reales** — ¿se permiten personas reales? ¿hay consentimiento firmado? ¿o solo personajes generados?
4. **Etiqueta IA** — ¿leyenda dentro del video (`ai_label: true`) o solo la etiqueta de IA de la plataforma al publicar (`ai_label: false` + `ai_disclosure`)? La etiqueta de la plataforma es obligatoria con persona/voz realista generada.

**Tanda C (si aplica)**
1. **Personajes/mascotas** — ¿la marca tiene un personaje (p. ej. la cabeza 3D de Rex)? Ruta del PNG con transparencia → `characters.<id>`.
2. **Vocero/a real para tipo 3** — nombre, 2 fotos, muestra de voz, quién autorizó y para qué (cara, voz como referencia, clonación de voz) → `faces.people[]`; marca `default_for_type3` si es la opción por defecto.

**Sin web ni material**: propone 3 identidades según el rubro (p. ej. inmobiliaria: confianza / premium / cercana) con paleta + fuente + tono, y que elija una.

## 4. Guardar
Escribe `brand.json` (incluye `characters`, `faces`, `ai_label`, `ai_disclosure` si se respondieron) con `status: "ready"` y una tarjeta `brands/<slug>/card.png` (render rápido del motor con paleta, fuentes, logo y CTA) para revisión visual. Cada video copia el `brand.json` vigente a `RUN/brand.json` (congelado para ese video).
