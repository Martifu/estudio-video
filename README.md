# estudio-video

Skill para Claude Code (y Codex) que produce videos verticales 9:16 para vender: motion, video real editado con motion, y 100 % IA (Seedance), con un editor local (Estudio) para ajustar todo antes de exportar.

Solo Mac (mejor con Apple Silicon).

## Instalar

```bash
mkdir -p ~/.claude/skills && git clone https://github.com/Martifu/estudio-video.git ~/.claude/skills/estudio-video
cd ~/.claude/skills/estudio-video && node engine/doctor.mjs --fix
```

Después, en Claude Code: `quiero hacer un video con el estudio de video`.

Guía completa (cuentas, conectores, diagnóstico): [references/instalacion.md](references/instalacion.md). Instrucciones del skill: [SKILL.md](SKILL.md).

Las marcas no traen datos de personas reales: cada usuario registra a sus voceros (con su consentimiento) en `brands/<marca>/brand.json`.
