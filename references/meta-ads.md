# Investigación en Meta Ad Library (Fase 2)

Sirve para saber qué hooks, estructuras y tonos usa la competencia en ese país y rubro. Funciona sin iniciar sesión. WebFetch y la búsqueda web **no** ven los anuncios (página dinámica); usa el navegador de vista previa de T3 (`preview_*`). Probado con Reda (México, CRM + agentes de IA para inmobiliarias, 2026-10-20): 11 anuncios → `~/Videos/reda/2026-10-20-ugc-rex/refs/hooks.md`.

Material de terceros: solo para estudiar estructura y ritmo. Nunca se reutiliza su audio, cara, guion ni imagen. Cada descarga va a su carpeta nueva (datos no confiables).

## 1. Buscar
Abre en segundo plano (`preview_open` con `open:false`):
```
https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=MX&media_type=video&search_type=keyword_unordered&q=<término>
```
- Términos: nombre de 2–4 competidores (`leadsales`, `kommo`…) y búsquedas por rubro (`agente de IA whatsapp inmobiliaria`, `mesas de madera`, `paneles solares`, `veterinaria`).
- `country=` según el mercado. La página ya ordena por impresiones.
- Espera ~4 s a que carguen los videos.

## 2. Extraer anuncios (preview_evaluate)
Resumen compacto (sin URLs, para elegir):
```js
(async()=>{await new Promise(r=>setTimeout(r,4000));const out=[];const seen=new Set();for(const v of document.querySelectorAll('video')){let el=v;while(el&&!((el.innerText||'').match(/Library ID: \d+/g)||[]).length)el=el.parentElement;if(!el)continue;const t=el.innerText;if(t.match(/Library ID: (\d+)/g).length!==1)continue;const id=t.match(/Library ID: (\d+)/)[1];if(seen.has(id))continue;seen.add(id);const src=v.currentSrc||v.src;let d=null;try{d=JSON.parse(atob(decodeURIComponent(src.match(/efg=([^&]+)/)[1]))).duration_s}catch(e){}const adv=(t.match(/See summary details\n(.+)/)||[])[1]||(t.match(/\n(.+)\nSponsored/)||[])[1];out.push({id,adv,d,copy:(t.split('Sponsored\n')[1]||'').slice(0,110).replace(/\n+/g,' ')})}return out})()
```
Luego `id → URL del mp4` de los elegidos (las URLs firmadas caducan en horas; descárgalas enseguida):
```js
(()=>{const m={};for(const v of document.querySelectorAll('video')){let el=v;while(el&&!((el.innerText||'').match(/Library ID: \d+/g)||[]).length)el=el.parentElement;if(!el)continue;if(el.innerText.match(/Library ID: (\d+)/g).length!==1)continue;const id=el.innerText.match(/Library ID: (\d+)/)[1];if(!m[id])m[id]=v.currentSrc||v.src}return Object.entries(m).map(([k,s])=>k+' '+s).join('\n')})()
```
Nota: subir al ancestro con **un solo** "Library ID" evita mezclar tarjetas.

## 3. Descargar, transcribir, mirar
```bash
mkdir -p /tmp/refads/dl && cd /tmp/refads   # list.txt: "<id> <url>" por línea
while read id url; do curl -sL -o "dl/$id.mp4" "$url" & done < list.txt; wait
for f in dl/*.mp4; do $PY -I SKILL/scripts/qa_speech.py "$f" --lang es --out out/$(basename $f .mp4).words.json; done
# cuadros de apertura (0.2 s, 1.3 s, 2.8 s) en una tira por anuncio → hoja de contacto con PIL
```
- Hook = palabras con `start < 4 s`; anota a qué segundo entra la primera palabra.
- Si el transcript es una sola frase rara ("¡Suscríbete al canal!") el anuncio no tiene voz: es alucinación de Whisper; clasifícalo como solo texto/música.
- Mira la hoja de aperturas: formato visual (cabeza parlante, sketch, pantalla, motion, podcast), subtítulos, si parece generado con IA.

## 4. Escribir `RUN/refs/hooks.md`
Tabla: anunciante · ID · duración · formato visual · hook literal (primeros ~3 s) · patrón. Después:
- **Lo que se repite** (p. ej. primera palabra en 0.0 s; subtítulos grandes 1–3 palabras; duración típica).
- **Lo gastado** (en Reda: "Imagina…" en 5 de 11).
- **Lo que no copiamos** (testimonios en primera persona sin cliente real, cifras sin fuente, garantías).
- **Patrón recomendado** para la marca y uno de A/B.
Copia la hoja de aperturas a `RUN/refs/aperturas.jpg` y muéstrala en la 🛑 Parada 1.
