# Legal y confianza

No es asesoría legal; son reglas de la casa para no meter en problemas a la marca ni a la plataforma.

## Sí
- Publicar **desde la cuenta de la marca** (o de un creador real que acepta y lo declara). UGC = estilo, no engaño.
- La leyenda de IA **dentro del video** es una opción de la marca (`brand.ai_label`; `ai_disclosure` documenta la decisión). Lo que sí es obligatorio: cuando aparece una persona o voz realista generada con IA, activar el interruptor de la plataforma al publicar (Meta "Información de IA", TikTok "Contenido generado por IA").
- Personajes generados desde una **descripción** (prompt JSON bloqueado), o personas reales con **consentimiento por escrito** para cara y voz, registrado en `brand.faces.people[]` (`consent`, con quién y para qué uso; `consent_on_file: true` y `real_people_allowed: true`).
- Voces con licencia: ElevenLabs (plan con uso comercial: Starter o superior; Free es no comercial y exige atribución) o la voz real de alguien que consiente.
- Música: Eleven Music según su plan (streaming solo Creator/Pro; excluye cine/TV/radio), Stable Audio local (Stability Community License, uso comercial < USD 1M de ingresos — verificar), o stock con licencia.
- Footage de stock: licencia que permita uso comercial (Pexels: sin atribución obligatoria; no sugerir que personas identificables respaldan el producto).

## No
- **No inventar resultados, cifras, reseñas ni testimonios.** Todo número o promesa debe estar en `brand.claims.allowed`. Un personaje IA no puede decir "a mí me funcionó" como si fuera cliente real; puede **demostrar** ("mira lo que hace…").
- No crear cuentas falsas de "usuarios reales" ni publicar como si un cliente real lo dijera.
- **Sin garantías ni reembolsos** ("dinero de vuelta", "garantizado") salvo que la marca los tenga por escrito (en `brand.claims.allowed`).
- No clonar la voz de un desconocido (p. ej. de un video viral) ni hacer "dobles" de creadores o personas identificables.
- No usar referencias de rostro hiperrealistas de personas reales sin consentimiento, ni rutas "sin restricciones" para saltarse protecciones contra suplantación.
- No evadir moderación cambiando de proveedor o quitando referencias.
- Rubros sensibles (salud, finanzas, veterinaria con tratamientos, inmobiliario con rendimientos): sin promesas de resultado, precios ni rendimientos que no estén aprobados por el cliente.

## En la entrega
`copy.md` incluye: recordatorio del interruptor de IA de la plataforma si hay persona/voz IA realista (y la leyenda en video si la marca la usa), atribuciones que exija el plan (p. ej. ElevenLabs Free), y créditos de stock si la licencia lo pide.
