# Costos y cotización

## Regla
Nada pagado antes de la 🛑 Parada 5. Toda generación de Higgsfield se cotiza con el mismo request + `params.get_cost: true` (devuelve créditos, no crea trabajo ni cobra). Cotiza con los **mismos** `mode`, `medias`, duración y resolución que vas a usar: el precio de `t2v` no vale para `omni_reference`.

```bash
$PY SKILL/scripts/ledger.py RUN cap 600                       # tope total del video
$PY SKILL/scripts/ledger.py RUN quote --item "hook1 seedance 15s 720p omni" --credits 105
$PY SKILL/scripts/ledger.py RUN guard 105 && <generar>        # exit 1 si excede el tope
$PY SKILL/scripts/ledger.py RUN job --item "hook1" --job-id <id> --credits 105
$PY SKILL/scripts/ledger.py RUN report                        # → RUN/costos.md
```

## Referencias medidas (Higgsfield, 2026-10-20, `get_cost`, 9:16, con audio, t2v)
| Seedance 2.5, 15 s | Créditos |
|---|---|
| Borrador 480p (`draft:true`) | 45 |
| 720p | 105 |
| 1080p | 240 |

## Seedance 2.5 `omni_reference` (medido 2026-10-21, `get_cost`, 9:16, con audio)
La referencia de audio **no cambia el precio**. Créditos:
| Duración | Borrador 480p | 720p | 1080p |
|---|---|---|---|
| 5 s | 15 | n/a | 80 |
| 8 s | 24 | 56 | 128 |
| 14 s | 42 | n/a | 224 |
| 15 s t2v | 45 | 105 | 240 |

- Los borradores salen a 480×854 y 24 fps, y **caducan para finalizar a los 7 días** (finaliza con `draft_job_id` antes).
- Piloto tipo 3 típico: 2 borradores de 14 s = 84 créditos; final 1080p de 14 s = 224 c/u (solo de la toma ganadora).
- Imágenes por retrato (medido): `soul_2` ≈ 0.12, `gpt_image_2_5` ≈ 0.25, `nano_banana_pro` → se enruta a `nano_banana_2` ≈ 2 créditos.

- Borrador → final: `draft_job_id` finaliza el mismo borrador a 1080p (dentro de 7 días). Úsalo para aprobar la toma barata y pagar 1080p solo de la ganadora. Cotiza el finalize antes.
- Imágenes de personaje/producto: ~1–2 créditos c/u (publicado por Higgsfield; cotizar).
- USD por crédito: ~0.05 (publicado por Higgsfield en ejemplos; **estimado**, confirmar con `transactions`).
- Saldo: `balance`. No compres créditos ni cambies de plan.

## ElevenLabs
El plan Starter es TTS de uso comercial (~31k caracteres/mes). La música sale de audio-studio (local), no de Eleven Music.
~1 crédito por carácter de TTS. Casting de 3 voces × 1 frase ≈ 400 caracteres; clip de referencia 10–15 s ≈ 200; voz en off de 30 s ≈ 450. Eleven Music ≈ 900 créditos/min (publicado). Revisa saldo antes; si no alcanza, dilo en la cotización.

## Presupuesto típico (estimado, cotizar siempre)
- Tipo 1: 0 créditos de video; solo voz y música.
- Tipo 2: 0–200 créditos (b-roll IA opcional).
- Tipo 3 UGC, 4 hooks × 15 s en 720p + personaje: ~450 créditos; con borradores previos +180.
