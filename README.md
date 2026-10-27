# estudio-video

Skill para Claude Code (y Codex) que produce videos verticales 9:16 para vender: motion, video real editado con motion, y 100 % IA (Seedance), con un editor local (Estudio) para ajustar todo antes de exportar.

Funciona en **Mac** (mejor con Apple Silicon) y **Windows 10/11** (mejor con tarjeta NVIDIA, funciona sin ella).

## Instalar

**Mac** (Terminal):

```bash
mkdir -p ~/.claude/skills && git clone https://github.com/Martifu/estudio-video.git ~/.claude/skills/estudio-video
cd ~/.claude/skills/estudio-video && node engine/doctor.mjs --fix
```

**Windows** (PowerShell; necesitas Git: `winget install Git.Git`):

```powershell
git clone https://github.com/Martifu/estudio-video.git "$env:USERPROFILE\.claude\skills\estudio-video"
cd "$env:USERPROFILE\.claude\skills\estudio-video"; node engine\doctor.mjs --fix
```

El diagnóstico (`doctor.mjs --fix`) pregunta antes de instalar cada cosa (brew en Mac, winget en Windows). Con NVIDIA ofrece además la aceleración por GPU.

Después, en Claude Code: `quiero hacer un video con el estudio de video`.

## Actualizar

```bash
git -C ~/.claude/skills/estudio-video pull          # Mac
git -C "$env:USERPROFILE\.claude\skills\estudio-video" pull   # Windows
```

y vuelve a correr `node engine/doctor.mjs --fix` por si hay algo nuevo que instalar.

Guía completa (cuentas, conectores, diagnóstico, diferencias en Windows): [references/instalacion.md](references/instalacion.md). Instrucciones del skill: [SKILL.md](SKILL.md).

Las marcas no traen datos de personas reales: cada usuario registra a sus voceros (con su consentimiento) en `brands/<marca>/brand.json`.
