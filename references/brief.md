# Brief en un solo mensaje

El usuario puede activar la skill con todo el brief en el primer mensaje. Si escribe `/estudio-video plantilla`, muéstrale el bloque común + el del tipo que diga (o los tres) para copiar y llenar.

## Cómo se usa
- Todo campo lleno se anota como **dado**: no se vuelve a preguntar en el grill.
- Campo vacío o ausente → se pregunta en la tanda normal ([grill.md](grill.md)). "propón" → das opciones con una `(Recommended)`.
- **Las paradas 🛑 se hacen siempre**, aunque el brief traiga hook, guion o voz: muestras lo que vas a usar (escrito en texto) y pides confirmación. El brief ahorra preguntas, no paradas. Si traen un guion propio, revísalo igual (claims, elisiones, ~palabras ÷ 3 ≈ segundos) antes de confirmarlo.
- La Fase 0 se mantiene: si `MARCA` apunta a `brands/<slug>` con `status: ready`, muestra el resumen y confirma; si no, investiga con los links que dio y entrevista solo lo que falte.
- Cierra el grill con la tabla del brief (dados + respondidos) y guarda `RUN/brief.json`.

## Bloque común
```
/estudio-video
TIPO: <1 motion | 2 video real | 3 100% IA>
MARCA: <nombre> · <web / Instagram / Facebook> · (si ya está registrada: "usa brands/<slug>")
PRODUCTO: <qué se vende o se explica; medidas, material, precio si se puede decir>
OBJETIVO: <mensajes por WhatsApp | visitas | ventas | seguidores | enseñar a usar algo>
PÚBLICO: <quién> · TEMPERATURA: <frío | tibio | caliente>
ESTILO: <punchy | humor | tranquilo/premium | comparativa | tutorial paso a paso | demostración>
DURACIÓN: <seg> · PLATAFORMA: <Reels | TikTok | Shorts | interno>
HOOK: <investiga en Meta Ads | usa este: "..." | propón 3>
GUION: <propón 3–5 | usa este: "...">
CLAIMS PERMITIDOS: <lo que sí se puede afirmar> · PROHIBIDO: <precios, garantías, etc.>
CTA: <texto · teléfono · link>
PRESUPUESTO: <máx. créditos Higgsfield / caracteres ElevenLabs>
PANTALLAS: <motion reinterpretado | capturas reales | sin pantallas> · cuáles: <inventario, cotizador, esquema, embudo…> · datos: <MCP de Reda | capturas en <ruta>>
```

## Tipo 1 · Motion
```
PERSONAJE: <mascota de la marca (ruta) | genera uno: descripción | sin personaje>
MOCKUP: <chat de WhatsApp | pantalla de app/terminal | producto recortado> · qué pasa en él: <...>
GRÁFICOS: <cotas | ficha | contador | onomatopeyas | palabras resaltadas | pasos numerados>
VOZ: <casting de 3 | voz ID ...> · energía: <alta | media>
MÚSICA: <audio-studio | Eleven Music> · ambiente: <...>
```

## Tipo 2 · Video real
```
MATERIAL: <ruta de la carpeta | stock de Pexels | genera lista de tomas para grabar>
QUIÉN SALE: <persona real a cámara (con permiso) | solo producto | voz en off>
VOZ: <la de las tomas | voz en off ElevenLabs>
GRÁFICOS: <cotas con medidas reales: ... | ficha: 3–4 datos | onomatopeyas | palabras resaltadas>
QUÉ EVITAR: <tomas con subtítulos quemados, personas sin permiso, etc.>
```

## Tipo 3 · 100 % IA
```
PERSONA: <vocero registrado (nombre) | persona nueva: fotos en <ruta> + permiso | avatar ficticio: descripción>
LOCACIÓN: <una sola, con luz: "taller de madera, luz de tarde">
VESTUARIO: <prenda exacta, sin logos>
PLANOS: <3 con corte seco | propón> · acciones: <camina, toca el producto, señala...>
PALABRAS DIFÍCILES: <marca y cómo se pronuncia: "Vichac = BEE-chak">
GENERACIONES: <1 de 14 s | varias> · siempre borrador 480p primero
```
