# Pantallas de producto en motion (los 3 tipos)

Cuando el guion menciona una función de un software o datos de un catálogo (inventario, cotizador, esquema de pago, embudo, actividad, métricas, canales), **no se pegan capturas con zoom**. La pantalla se redibuja en vector con los componentes `ui*` del motor, como un motion de After Effects: tarjetas que nacen, cifras que corren, cursor que da clic y la pantalla cambia. Lo aprobó el usuario el 2026-10-22 (bocetos sobre el reel INM02 de Hassan; referencia: TikTok de @reda_mx 7697411965739633921). Detalle técnico de campos: [engine/README.md](../engine/README.md) → `uiList`…`uiIcons`.

Principio (de huashu-motion): **la captura es la referencia, no la toma.** De la captura salen los textos, cifras, colores y el orden; lo que se ve en el video es la reconstrucción animada. Nunca cajas grises de relleno ni una interfaz inventada que el producto no tiene.

## 🛑 La pregunta (grill, tanda 2)
Si el video muestra pantallas o datos, pregunta una vez:
- **Motion reinterpretado (Recommended):** la pantalla se redibuja y se anima. Se lee en el teléfono, sigue a la voz y no expone datos privados.
- **Capturas reales:** la captura tal cual (solo si el usuario quiere probar "es la app real" o la pantalla es muy compleja). Aun así, nunca a pantalla completa con zoom lento: recorta solo la zona que se nombra y combínala con un `uiStat`/`tagPill` que diga la cifra.
- **Sin pantallas.**

Guárdalo en `brief.json` como `"screens": "motion" | "captures" | "none"`.

## Qué componente usar
| En el guion / en la app | Componente | Qué hace |
|---|---|---|
| Inventario, lista de unidades, catálogo, resultados | `uiList` | filas escalonadas, precios que cuentan, cursor da clic en una fila, se levanta, etiqueta |
| Cotizador, formulario, alta, checkout | `uiForm` | pasos numerados que avanzan, opción seleccionada, fecha que se escribe, total que cuenta, clic en el botón → «Generando…» → listo |
| Cotización PDF, esquema de pago, contrato, ticket | `uiDoc` | la hoja sube en 3D, se resalta una fila, esa cifra se despega como tarjeta con barra de reparto |
| Ingresos, ventas, conversión, cualquier KPI | `uiStat` | tarjeta que nace, dígitos que ruedan hasta la cifra, delta |
| Embudo, pipeline, etapas | `uiKanban` | una tarjeta de prospecto se arrastra de columna y termina en check |
| Actividad, notificaciones, "te llegan pedidos" | `uiFeed` | filas con avatar que entran y empujan a las de abajo |
| Canales (WhatsApp, Facebook, Instagram…) | `uiIcons` | los **logos oficiales** (`assets/brand-icons/`, nunca dibujados a mano) que entran escalonados, sin tarjeta de fondo salvo que no se lean sobre el video (`plate: auto`); TikTok aún no tiene archivo oficial |

Receta Reda (CRM): Inventario → `uiList`; Cotizador → `uiForm`; Esquema financiero / cotización → `uiDoc`; Embudos → `uiKanban`; Actividad → `uiFeed`; Rendimiento/Inicio → `uiStat`; Canales → `uiIcons`.

## De dónde salen los datos (en este orden)
1. **MCP de la marca** (Reda: `list_inventory`, `get_project`, `get_project_media`; solo lectura). `source: {kind:"reda", ref:"list_inventory proyecto 717", fetchedAt}`.
2. **Capturas del usuario** (o capturas que tomes tú con su sesión, como en INM02): léelas tú y copia textos, cifras y etiquetas exactas al elemento. `source: {kind:"screenshot", ref:"crm/01-inventario-lista.jpg"}`. Las capturas se guardan en `RUN/crm/` como respaldo de cada cifra.
3. **Datos de marca** (`brand.json` claims). `source: {kind:"brand"}`.
4. **Ilustrativos** solo si el usuario lo aprueba y no son cifras de un cliente real (p. ej. "$248.5K ingresos" en un anuncio de la propia herramienta): `source: {kind:"fictional"}`. Revisar los marca en amarillo.

Reglas: ninguna cifra sin `source` (Revisar la pone en rojo). Precios de cotización = precio de la unidad, no del modelo. **Personas:** nombres y fotos de prospectos siempre ficticios (banco `assets/people/pNN@256.jpg`, nombres comunes inventados); nunca un prospecto real ni datos de contacto, aunque salgan en la captura. Nombres de otras empresas (desarrolladoras, clientes) solo si están en `claims.allowed`.

## Piel (cómo se ve)
`brands/<slug>/ui-skin.json`: tipografía, colores, radios y colores de estatus de la app real. Reda ya la tiene (Cabin, verde #7DBD4D para precios, morado #5E17EB para selección y totales, botón negro, estatus Disponible/Separados/Formalizados/Cerrado). Si la marca no tiene piel, el motor la deriva de `brand.json`; si el producto es una app, saca la piel de sus capturas (colores muestreados, tipografía parecida de Google Fonts) y guárdala en la marca para la próxima.

## Coreografía y tiempos
- Cada pantalla entra **en la palabra** que la nombra (`words.json`) y dura lo que tarda la frase (2–6 s). Los tiempos internos son proporcionales: si el usuario estira el elemento en el Estudio, todo se reacomoda. Con menos de ~3 s se omiten los pasos opcionales (escritura de campos, cursor).
- Reglas de oficio: el clic y el cambio de pantalla caen en el mismo cuadro; el cursor crece al acercarse (×1.3) y se hunde al dar clic (−15 %) con onda; la cámara empuja hacia la acción y **nunca** acerca y luego aleja; texto escrito a 15–22 caracteres/s; una sola idea por pantalla (resalta una fila, una cifra).
- Excepción aprobada a [motion-reglas.md](motion-reglas.md): el nacimiento de la tarjeta (mancha blanca → tarjeta) lleva rebote y **no** cuenta dentro de los 2 rebotes del video. Sin brillos neón: profundidad con sombra suave.
- Encadenar pantallas seguidas (inventario → cotizador → esquema) cuenta la historia de una sola operación: usa la **misma unidad/cliente** en todas.

## Si ningún elemento de la librería sirve: un elemento propio del video
Antes, revisa el catálogo [libreria.md](libreria.md) (cada elemento trae su `brief`: qué comunica, cuándo no usarlo, coreografía, gusto y datos). Si de verdad ninguno dice lo que pide el guion, escribe uno propio **para ese video**: `RUN/<comp>/motion-lib/<tipo>.js`, copiando `engine/motion-lib/_template.js` o el archivo del elemento más parecido y siguiendo su `brief` y [motion-reglas.md](motion-reglas.md) (tarjeta blanca, radio y sombra de la librería, entrada `out`, salida ~30 % más corta, escalonado 3–5 cuadros, un acento, texto ≥ 24 px, cifras con `source`). Mismo contrato que la librería, con su propio `brief`; el `type` no puede repetir uno de la librería. Se registra solo en ese video: render, Estudio (grupo «De este video» en Pantallas), revisión y efectos. `overlay.py` le corre la prueba de contrato antes de renderizar y se detiene en español si falla. Si al usuario le gusta, **promuévelo a la librería**: muévelo a `engine/motion-lib/`, agrega su `*.spec.mjs`, corre las pruebas y regenera `libreria.md`.

## Colocación
- Por defecto `slot:"band"`: la tarjeta vive entre la barbilla y la franja de la app (y ≈ 780–1540), con la persona visible arriba, como en la referencia. `slot:"center"` cuando no hay persona (tipo 1 o planos de producto). Revisa `qa-layout.jpg`: nada sobre la cara.
- Los elementos de la librería (salvo las 7 pantallas `ui*`, que respetan su slot tal cual) se colocan **con la cara**: el slot que pongas es una preferencia; si la cara estorba, el planner los pasa a otro slot, los encoge un poco (`scale`, nunca con texto < 24 px) o los manda a un lado (`align`). El reporte `layout-report.json` dice dónde quedó cada uno.
- Subtítulos: `captions:"hide"` (default) los oculta mientras la pantalla está en cuadro, porque la pantalla ya dice lo mismo. Usa `"keep"` solo si la frase dice algo que la pantalla no muestra.
- Tipo 3: pide en el prompt de Seedance que la persona sostenga una tablet o celular **sin pantalla legible** y deje el tercio inferior simple; las pantallas `ui*` van encima de su propia toma (no se corta a capturas). Tipo 2: encima de las tomas reales. Tipo 1: pueden ser la escena completa (`slot:"center"`), con fondo claro.

## Sonido
Los eventos salen solos del elemento: nacimiento = pop, scroll/subida de hoja/arrastre = whoosh, clic = clic, listo/check = notify. No los coloques a mano; el usuario los mueve o silencia en el carril Efectos del Estudio.

## En el Estudio
Panel izquierdo **Pantallas**: el usuario inserta cualquiera de los 7 en el cabezal y edita textos, cifras, filas (agregar/quitar/ordenar), la fila seleccionada, tiempos, cursor, colocación y subtítulos, con vista previa en vivo. Antes de re-renderizar, lee `motion.json` para no pisar sus cambios.
