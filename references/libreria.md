# Librería de motion (catálogo)

Generado desde los descriptores (`node engine/motion-lib/cli.mjs catalog --md > references/libreria.md`); no lo edites a mano.
Cada elemento trae su `brief` completo (para qué, cuándo no, coreografía, reglas de gusto, de dónde salen los datos) en `engine/motion-lib/<tipo>.js`.

## Pantallas

| Tipo | Qué es | Cuándo usarlo |
|---|---|---|
| `barChart` | Gráfica de barras: Barras que crecen en escalera y cuentan hasta su cifra; una barra resalta | comparar de 2 a 6 categorías con una cifra cada una. No usar: una serie en el tiempo (usa lineChart) ni dos grupos lado a lado (usa comparisonBars). |
| `uiDoc` | Documento: Hoja de cotización que sube; una fila se resalta y se despega | la voz menciona la cotización o el esquema financiero. No usar: para tablas largas que nadie alcanza a leer ni para un solo precio (priceTag). |
| `uiFeed` | Actividad: Avisos que van entrando uno a uno | la voz dice 'te llegan…', 'mientras duermes…'. No usar: para un solo aviso (socialProof) ni para notificaciones del teléfono (notificationStack). |
| `uiForm` | Formulario: Formulario paso a paso que se llena solo y genera un PDF | la voz explica un proceso de varios pasos que la app resuelve. No usar: si no hay proceso (uiStat) o si es solo un botón (buttonTap). |
| `uiIcons` | Iconos de apps: Iconos de WhatsApp, Instagram, Facebook… que aparecen de golpe | la voz enumera canales o integraciones. No usar: logos dibujados a mano ni marcas que no estén en assets/brand-icons. |
| `uiKanban` | Embudo: Tablero de etapas: una tarjeta cambia de columna | la voz habla de embudo, seguimiento o etapas. No usar: para mostrar volumen por etapa (funnelChart) ni cifras. |
| `uiList` | Lista: Lista de unidades o productos; una fila se elige con un clic | la voz nombra el inventario o una búsqueda con resultados. No usar: para una sola unidad (unitCard) ni para una cifra (uiStat). |
| `uiStat` | Cifra grande: Una cifra grande que cuenta hasta su valor | la voz dice un número clave del producto. No usar: varias cifras a la vez (kpiGrid) ni una cifra de marketing sin tarjeta de app (counterBig). |

## App

| Tipo | Qué es | Cuándo usarlo |
|---|---|---|
| `browserFrame` | Navegador: Una ventana de navegador: la dirección se escribe y aparece la página | la voz habla de la web, la agenda en línea o un sitio. No usar: para un teléfono (phoneFrame) ni para una lista de resultados (searchBar). |
| `buttonTap` | Botón: Un botón grande que un dedo toca y cambia a «hecho» | la voz pide una acción concreta (agendar, comprar, enviar). No usar: para un interruptor (toggleSwitch) ni para un formulario entero (uiForm). |
| `calendarPick` | Calendario: Un día y un horario se eligen con un toque; la cita queda agendada | la voz habla de agendar una visita, una cita o una demo. No usar: para una sola fecha sin horarios (qrCard o uiStat) ni para una lista de inventario (uiList). |
| `chatInbox` | Bandeja de mensajes: Conversaciones con canal y contador; un mensaje nuevo sube al tope | la voz habla de responder clientes, WhatsApp o redes. No usar: para una lista de productos (uiList) ni para ajustes (toggleSwitch). |
| `notificationStack` | Notificaciones: Una lista de actividad reciente: avisos con logo, título y detalle, que entran uno por uno | la voz habla de avisos, ventas o actividad en vivo. No usar: para un chat (chatInbox) ni para una cifra (counterBig). |
| `phoneFrame` | Teléfono: Un teléfono limpio que entra inclinado y muestra una captura, con desplazamiento opcional | la voz muestra la app o un flujo en el móvil. No usar: para una ventana de escritorio (browserFrame); si la cara de quien habla es grande, que quede a un lado y más chico (lo decide la colocación con cara). |
| `qrCard` | Código QR: Código QR real de una dirección, con una línea de escaneo | la voz manda al espectador a escanear o a un enlace. No usar: para un botón (buttonTap) ni para un calendario (calendarPick). |
| `searchBar` | Búsqueda: Campo de búsqueda que se escribe letra por letra y muestra resultados | la voz habla de buscar un inmueble, producto o cita. No usar: para una lista fija (uiList) ni para un chat (chatInbox). |
| `toggleSwitch` | Interruptores: Filas de ajustes que se activan una por una, con una línea de efecto | la voz habla de configurar, automatizar o activar algo. No usar: para una lista de productos (uiList) ni para un formulario (uiForm). |

## Cierres

| Tipo | Qué es | Cuándo usarlo |
|---|---|---|
| `logoSting` | Cierre con logo: Una mancha de color tapa la pantalla, aparece el logo y se escribe la dirección web | el final del video, solo o antes de la tarjeta CTA. No usar: a mitad del video ni más de una vez. |

## Inmobiliario

| Tipo | Qué es | Cuándo usarlo |
|---|---|---|
| `amenityGrid` | Cuadrícula de amenidades: Cuadrícula de amenidades con íconos de línea que entran uno por uno | la voz enumera lo que tiene el edificio (alberca, gimnasio…). No usar: más de 9 cosas (usa una lista) ni precios (paymentPlan). |
| `availabilityGrid` | Fachada de disponibilidad: Fachada por niveles con el estado de cada unidad y el conteo de disponibles | la voz dice cuántas unidades quedan y cuál es la de la venta. No usar: una sola unidad (unitCard) ni la lista de un inventario de texto. |
| `beforeAfter` | Antes y después: Dos imágenes con un deslizador que barre: obra y terminado, o render y real | la voz compara el antes y el después de una obra o un render. No usar: dos cifras (usa comparisonBars) ni una sola foto (usa unitCard). |
| `floorPlanReveal` | Plano que se revela: Plano que se dibuja y etiquetas de cada espacio con línea guía | la voz explica cómo se distribuye la unidad. No usar: la foto de un espacio (beforeAfter o unitCard) ni un mapa (mapPin). |
| `mapPin` | Mapa con distancias: Mapa esquemático con el pin del proyecto y distancias a puntos cercanos | la voz habla de la ubicación y de lo que queda cerca. No usar: un mapa real navegable ni una sola distancia (usa un lowerThird). |
| `paymentPlan` | Plan de pagos: Apartado, enganche, mensualidades y entrega con montos y porcentajes | la voz explica cómo se paga la unidad. No usar: un solo monto (unitCard) ni una tabla de cifras de ventas (sales). |
| `unitCard` | Tarjeta de unidad: Foto de la unidad, chips (recámaras, baños, m²), precio que cuenta y estado | la voz presenta una unidad concreta con precio. No usar: varias unidades a la vez (availabilityGrid) ni una lista de amenidades (amenityGrid). |

## KPIs y gráficas

| Tipo | Qué es | Cuándo usarlo |
|---|---|---|
| `comparisonBars` | Antes y después: Barras lado a lado con su cifra; la ganadora resalta | comparar dos estados de una misma métrica. No usar: más de 3 barras (usa barChart) ni una serie (usa lineChart). |
| `counterBig` | Cifra gigante: Un número enorme que cuenta hasta su valor, con una línea debajo | una sola cifra que es el mensaje. No usar: varias cifras (usa kpiGrid) ni una cifra con tendencia (usa sparkCard). |
| `donut` | Gráfica de dona: Segmentos que se barren en orden, con su leyenda y el total en el centro | partes de un todo con 2 a 6 segmentos. No usar: más de 6 categorías (usa barChart) ni comparar periodos (usa comparisonBars). |
| `funnelChart` | Embudo: Etapas que se estrechan; cada una con su cifra y su porcentaje de conversión | un proceso de 3 a 5 etapas que pierde gente en cada paso. No usar: partes de un todo (usa donut) ni una serie en el tiempo (usa lineChart). |
| `kpiGrid` | Indicadores (KPIs): De 2 a 4 indicadores que nacen escalonados; cada cifra cuenta hasta su valor | un resumen de 2–4 métricas de un mismo periodo. No usar: una sola cifra (usa counterBig) ni una serie en el tiempo (usa lineChart). |
| `lineChart` | Gráfica de línea: Una línea que se dibuja de izquierda a derecha y cierra con la cifra final | una serie en el tiempo (meses, semanas) con 4 a 12 puntos. No usar: categorías sueltas (usa barChart) ni un solo número (usa counterBig). |
| `progressBar` | Barra de avance: Una barra que se llena hasta el avance, con la marca de la meta y un hito | avance lineal hacia una meta con un hito intermedio. No usar: un solo porcentaje grande (usa progressRing). |
| `progressRing` | Anillo de avance: Un anillo que barre hasta el porcentaje y cuenta la cifra en el centro | una meta o cumplimiento en porcentaje único. No usar: varias metas (usa progressBar) ni una serie (usa donut o barChart). |
| `sparkCard` | Tarjeta con mini gráfica: Una cifra KPI que cuenta hasta su valor, con una mini gráfica debajo | un KPI con su historia reciente en una tarjeta. No usar: varias cifras (usa kpiGrid) ni una gráfica completa con ejes (usa lineChart). |

## Personas

| Tipo | Qué es | Cuándo usarlo |
|---|---|---|
| `avatarCircle` | Persona con foto: Foto circular con aro de marca; nombre y cargo salen al lado | al presentar a quien habla o atiende. No usar: para una cita larga (usa testimonial) ni para muchas personas (usa avatarStack). |
| `avatarStack` | Fotos de clientes: Fotos que se apilan y un contador: +120 clientes felices | para reforzar confianza con un número de clientes o reseñas. No usar: si el número no tiene fuente, o para una sola persona (usa avatarCircle). |
| `rating` | Calificación: Cinco estrellas que se llenan y cuentan la calificación | junto a un testimonio o una ficha de negocio. No usar: sin una fuente real de reseñas (el número sería inventado). |
| `socialProof` | Aviso de compra: Toast con foto: "Ana apartó la 302 · hace 3 min" | para mostrar actividad reciente de compradores. No usar: para una cifra agregada (usa avatarStack) ni para una cita (usa testimonial). |
| `testimonial` | Testimonio: Cita de un cliente con estrellas, foto y nombre | para una prueba social con voz propia. No usar: para una frase corta de la marca (usa quoteCard) ni sin nombre de quien opina. |

## Texto

| Tipo | Qué es | Cuándo usarlo |
|---|---|---|
| `bigNumberStatement` | Frase con cifra grande: Una cifra enorme que cuenta y cae de golpe, con las palabras alrededor que entran desde los lados | para un dato que vale la pena ver de un vistazo. No usar: para una frase sin número (usa quoteCard) ni para una lista de cifras. |
| `highlighterText` | Frase con subrayado: Una frase corta en una tarjeta; un marcador de color subraya las palabras que elijas | para resaltar la palabra clave de un mensaje corto. No usar: para más de 8 palabras visibles (usa quoteCard) ni para un rótulo de persona. |
| `kineticWord` | Palabra grande: La palabra clave del video, grande, que entra letra por letra | para una frase corta que debe golpear. No usar: para una cita larga (usa quoteCard) ni para una cifra (usa bigNumberStatement). |
| `lowerThirdPro` | Rótulo de persona: Nombre y cargo con barra de acento; entra desde una máscara y sale en orden inverso | para identificar a quien habla en pantalla. No usar: para una cita (usa quoteCard) ni para más de 4 palabras de nombre. |
| `quoteCard` | Tarjeta de cita: Una frase clave o un testimonio: la cita se revela línea por línea y luego aparece quién la dice | para una frase de impacto o testimonio corto. No usar: para una cifra (usa bigNumberStatement) ni para una lista de pasos (usa stepsTimeline). |
| `stepsTimeline` | Pasos numerados: De 3 a 5 pasos: los círculos se llenan uno a uno y se conectan con una línea | para explicar un proceso corto en orden. No usar: para una sola idea (usa quoteCard) ni para más de 5 pasos. |

## Venta

| Tipo | Qué es | Cuándo usarlo |
|---|---|---|
| `compareTable` | Nosotros vs otros: Tabla comparativa: cada fila aparece con ✓ o ✗ | comparar con competidores o con la alternativa de siempre. No usar: para un solo precio (priceTag) o para una lista de casillas sin comparación (featureChecklist). |
| `countdown` | Cuenta regresiva: Días, horas, minutos y segundos que bajan hasta el cierre de la oferta | una oferta con fecha de vencimiento. No usar: para un contador de cifras que sube (counterBig) ni para un temporizador de procesos (progressBar). |
| `featureChecklist` | Lista de características: Puntos con casilla que se marcan uno por uno | mostrar qué incluye un producto o plan. No usar: para comparar precios (priceCompare) ni para una tabla con varias columnas (compareTable). |
| `offerBadge` | Sello de oferta: Un sello plano con el descuento o la promoción, que gira y aterriza | destacar un descuento o una promoción puntual. No usar: para un precio completo (priceTag) ni para una cuenta regresiva (countdown). |
| `planCards` | Planes o modelos: De 2 a 3 planes lado a lado o apilados, con uno recomendado | vender 2 a 3 planes con precio y bullets. No usar: para un solo precio (priceTag) ni para comparar características fila por fila (compareTable). |
| `priceCompare` | Precio anterior y nuevo: El precio anterior se tacha y el nuevo cae con el ahorro | elegir entre planes o unidades con precio. No usar: para un solo precio (usa priceTag) ni para una tabla de muchas características (usa compareTable). |
| `priceTag` | Etiqueta de precio: Una etiqueta de precio que cae, se balancea y cuenta hasta su valor | una oferta o precio de un producto suelto ("desde $1,850,000"). No usar: para comparar varias opciones (usa priceCompare) ni para un descuento tachado (usa offerBadge). |
| `stampText` | Sello de texto: Una palabra de sello (APARTADO, VENDIDO) que cae con tinta | marcar un estado final sobre una imagen o tarjeta. No usar: para una oferta con porcentaje (offerBadge) ni para un titular animado (kineticWord). |

## Transiciones (`engine/transitions/`)

| Tipo | Qué es | Cuándo usarla |
|---|---|---|
| `blurCross` | Fundido con desenfoque: Disolvencia suave con desenfoque, de tono premium | pasos de tono premium, cierre de una idea o cambio de tema lento. No usar: para cortes rápidos o para ritmo de música (usar zoomPunch o whipPan). |
| `brandWipe` | Barrido de marca: Forma del color primario que descubre la siguiente escena | momento de marca o separación entre bloques de la marca. No usar: entre dos planos de producto (oculta la imagen) ni más de una vez por video. |
| `cardFlip` | Volteo de tarjeta: La escena da vuelta como una tarjeta 3D, para revelar la siguiente | revelar un producto, una ficha o un dato clave. No usar: para golpes rápidos (usar flashWhite o whipPan) o entre planos de la misma escena. |
| `cut` | Corte seco: Cambio directo, sin efecto | el default entre dos planos. No usar: cuando el cambio pide energía o marca (usar whipPan, zoomPunch o brandWipe). |
| `fadeColor` | Fundido a color: Pasa por negro o blanco, pensado para el cierre | solo para el cierre del video o un respiro largo antes del CTA. No usar: entre planos de contenido (es un corte de cierre, no de tema). |
| `flashWhite` | Destello blanco: Un destello blanco breve en el golpe | acento sobre un pulso fuerte o una cifra clave. No usar: para moverse entre temas (usar whipPan) ni dos veces seguidas. |
| `glitchRGB` | Glitch RGB: Desfase de copias y franjas que se desplazan, para los golpes | acento sobre un pulso fuerte o un dato que aparece de golpe. No usar: como transición de tema (usar whipPan o pushSlide) ni en planos largos. |
| `irisCircle` | Iris circular: Círculo que se abre o se cierra sobre la escena | momento de marca, presentación de logo o cierre con isotipo. No usar: para cambios de tema normales (usar pushSlide) ni con texto que cruce el círculo. |
| `pushSlide` | Empuje: La escena nueva empuja a la anterior | cambio de tema entre dos planos con la misma lógica de movimiento. No usar: para golpes (usar flashWhite) o para revelar un producto (usar cardFlip). |
| `whipPan` | Paneo rápido: Paneo de cámara con desenfoque direccional, de una escena a la otra | cambio de tema dentro de una misma secuencia de movimiento. No usar: entre dos planos quietos o de la misma escena (usar corte seco). |
| `zoomMatch` | Zoom de empate: Zoom continuo sobre un punto, de persona a pantalla | pasar de una persona a una pantalla, producto o tarjeta de marca. No usar: entre dos escenas sin relación de encuadre (corte seco o barrido). |
| `zoomPunch` | Zoom de golpe: Acercamiento que corta sobre el pulso de la música | cortes sobre el pulso de la música en un ritmo punchy. No usar: en momentos tranquilos o de voz (usar cut o blurCross). |

