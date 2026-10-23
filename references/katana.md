# Katana (Higgsfield)

## Qué es
Workflow de Higgsfield para **remix desde una referencia** o **edición de footage propio**. Estudia un reel de referencia cuadro por cuadro (cortes, ritmo, efectos, tipografía, música) y arma un video **nuevo** con el sujeto/producto del usuario en ese lenguaje. Escenas nuevas con Seedance 2.5, locaciones con Soul Cinema, todo procesado en el sandbox de Higgsfield. Cobra créditos del plan.

## Comportamiento que importa
- **Autónomo**: no pregunta ni pide aprobación; decide y gasta dentro de la autoridad existente. Por eso, en esta skill, Katana se invoca **solo después** de la 🛑 Parada 5, con un tope explícito de créditos en el pedido.
- **Música grabada**: usa la del reel de referencia, stock o una librería CC0 de efectos; no usa nuestra música generada. Si la marca necesita su música, se reemplaza después en nuestra mezcla.
- **Fuera de nuestro motor**: no corre `render.mjs` ni `mix.py`. Si hace falta CTA/subtítulos de la marca, el resultado pasa después por `overlay.py`.
- Referencia como **archivo** (no acepta links de IG/TikTok); se necesitan derechos sobre ella. Hasta ~5 fotos de sujeto/producto/ropa.
- Mantiene la ropa del sujeto de la foto en todas las escenas.

## Cuándo sí
- "Quiero uno como este reel" con archivo de referencia → tipo 2 (con footage del cliente) o tipo 3 (con fotos del producto/personaje).
- Editar footage del cliente con un estilo de edición muy marcado (cortes rápidos, flashes, shakes) que nuestro motor no hace.

## Cuándo no
- Tipo 1 (motion + voz): nuestro motor da más control de marca.
- Sin referencia ni footage: primero el flujo normal.
- Cuando la marca necesita su voz ElevenLabs y su música exactas en el mismo paso.

## Cómo invocarlo
`get_workflow_instructions({workflow:"katana"})` para el flujo; presets con `get_presets({source:"katana"})` y `/katana/<slug>` (sesión con `get_katana_config`). Pide resultado final + tope de créditos + qué se conserva (producto, ropa, texto). Al terminar: `show_result` con `action:"katana_video"` y registro en `ledger.py`.
