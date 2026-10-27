# Instalación paso a paso (Mac y Windows)

Guía para clientes de Reda que **no son técnicos**. Tiempo aproximado: 30 a 45 minutos la primera vez. Si te atoras en cualquier paso, escríbele a tu contacto en Reda con una captura de pantalla.

**Compatibilidad:** Mac (se recomienda Apple Silicon: M1 o más nuevo; con Intel funciona casi todo, pero no la transcripción de voz del Video tipo 2) y **Windows 10/11** (mejor con tarjeta NVIDIA, pero funciona sin ella). Los pasos de abajo están escritos para Mac; si usas Windows, sigue también la sección **[En Windows](#en-windows)**.

> Los nombres exactos de menús pueden cambiar un poco con las actualizaciones de las apps. Si algo no se ve igual, busca la opción parecida o pide ayuda.

## Qué necesitas antes de empezar

| Cuenta | Para qué sirve | Obligatoria | Costo |
|---|---|---|---|
| **Claude** (plan de pago con acceso a Claude Code) o **Codex** | El asistente que arma tus videos (usa uno de los dos) | Sí | Ver plan vigente en claude.ai / openai.com |
| **Higgsfield** | Genera videos con IA (Video tipo 3) y consume créditos | Solo para el tipo 3 | Ver plan vigente en higgsfield.ai |
| **ElevenLabs** | Voz en off de los videos tipo 1 y 2 | Solo para voz | Ver plan vigente en elevenlabs.io (revisa que el plan permita uso comercial) |
| **Reda** | Tu cuenta de Reda, conectada al asistente | Sí, si vas a usar Reda | La que ya tienes con Reda |

Tu Mac necesita internet y al menos 10 GB libres. Nunca compartas contraseñas ni llaves (API keys) por chat, correo o capturas; el asistente nunca te las pide ni las muestra.

## Dos formas de trabajar: Claude o Codex

Puedes usar **Claude Desktop** (pestaña **Code**) o **Codex** (app o terminal). El skill funciona en ambos, pero **los conectores no se comparten**: los de claude.ai (paso 2) solo sirven en Claude; en Codex los conectas aparte (paso 2b). Si usas los dos, haz ambos pasos.

## Paso 1. Instala tu asistente e inicia sesión

**Claude Desktop**
1. Entra a **claude.ai/download**, descarga la app para Mac y arrastra Claude a la carpeta Aplicaciones.
2. Ábrela e **inicia sesión** con tu cuenta de Claude.
3. Abre la pestaña **Code**. La primera vez te pedirá elegir una carpeta de trabajo: puedes crear una llamada `Estudio`.

**Codex** (si lo prefieres): instala la app de Codex o la herramienta de terminal desde el sitio de OpenAI e inicia sesión.

## Paso 2. Conecta tus cuentas

### 2a. En Claude (una sola vez, en el navegador)
1. Entra a **claude.ai** > **Configuración** > **Conectores**.
2. Busca **Higgsfield**, haz clic en **Conectar** e inicia sesión con tu cuenta de Higgsfield.
3. Busca **Reda**, haz clic en **Conectar** e inicia sesión con tu cuenta de Reda.
4. (Opcional) Conecta **ElevenLabs**; si prefieres, usa tu llave en el paso 5.
5. En la pestaña **Code** escribe `/mcp`: Higgsfield y Reda deben aparecer como conectados.

### 2b. En Codex (una sola vez por persona)
Abre la app **Terminal** y escribe, uno por uno (se abre el navegador para que inicies sesión):

```
codex mcp login reda
codex mcp login higgsfield
```

El diagnóstico revisa que estén agregados en Codex, pero no puede comprobar que tu sesión siga activa.

## Paso 3. Instala el skill del estudio de video

Abre **Terminal** y escribe (necesitas `git`; si la Mac lo pide, acepta instalar las herramientas de desarrollo):

```
mkdir -p ~/.claude/skills && git clone https://github.com/Martifu/estudio-video.git ~/.claude/skills/estudio-video
```

Para actualizarlo después: `git -C ~/.claude/skills/estudio-video pull`. En Codex, la carpeta de skills es `~/.codex/skills/` (mismo comando cambiando la ruta).

Cuando esté instalado, escribe: `quiero hacer un video con el estudio de video`.

## Paso 4. Corre el diagnóstico

El asistente lo corre solo la primera vez; también puedes pedirle *"revisa mi instalación"*. Revisa tu Mac y te dice, en español, qué falta y cómo arreglarlo. Si prefieres hacerlo tú, abre **Terminal** en la carpeta del skill y escribe:

```
node engine/doctor.mjs
```

Al final verás algo así:

```
Listo para:
  ✓ Video tipo 1 (motion)
  ✗ Video tipo 2 (video real editado) — falta: transcripción de voz
  ✓ Video tipo 3 (100 % IA)
  ✓ Estudio (editor local)
```

### Si faltan cosas
Escribe `node engine/doctor.mjs --fix`. **Te pregunta antes de cada paso** y solo instala si respondes `y`. Puede instalar con Homebrew:

| Programa | Comando |
|---|---|
| Node.js | `brew install node` |
| ffmpeg | `brew install ffmpeg` |
| Google Chrome | `brew install --cask google-chrome` |
| Python | `brew install python@3.12` |

Si no tienes Homebrew, instálalo desde **brew.sh** (copia el comando de esa página en Terminal). Después de instalar programas, cierra y vuelve a abrir Terminal y corre el diagnóstico otra vez.

## Paso 5. (Opcional) Tu llave de ElevenLabs

Si no usas el conector de ElevenLabs, el estudio necesita tu llave para la voz:

1. En **elevenlabs.io** entra a tu perfil > **API Keys** y crea una llave.
2. Guárdala en el archivo `~/.config/reels-dibujados/.env` con una sola línea: `ELEVENLABS_API_KEY=pega_tu_llave_aquí`
3. Corre `node engine/doctor.mjs --online`: dice si la llave es válida y cuántos caracteres de voz te quedan. Nunca muestra la llave.

## Paso 6. Haz tu primer video

1. Escribe: `quiero hacer un video con el estudio de video`.
2. La primera vez te hace preguntas sobre tu marca (colores, logo, tono, qué se puede decir). Se guarda para los siguientes videos.
3. Elige el tipo: **1** animación con mockups y voz, **2** tus propias tomas editadas con motion, **3** 100 % IA.
4. El asistente se detiene en cada decisión importante. **Antes de gastar créditos siempre te muestra el costo y espera tu permiso.**
5. Tus videos quedan en la carpeta **Videos**, dentro de una carpeta con el nombre de tu marca.

## En Windows

Lo mismo que en Mac, con estas diferencias:

**Programas** (el diagnóstico los instala con `winget` si respondes `y`; también puedes correrlos tú en **PowerShell**):

| Programa | Comando |
|---|---|
| Git (Claude Code lo necesita) | `winget install Git.Git` |
| Node.js | `winget install OpenJS.NodeJS.LTS` |
| ffmpeg | `winget install Gyan.FFmpeg` |
| Google Chrome | `winget install Google.Chrome` |
| Python | `winget install Python.Python.3.12` |

Después de instalar programas, cierra y vuelve a abrir la terminal.

**Instalar el skill** (en PowerShell):

```
git clone https://github.com/Martifu/estudio-video.git "$env:USERPROFILE\.claude\skills\estudio-video"
cd "$env:USERPROFILE\.claude\skills\estudio-video"
node engine\doctor.mjs --fix
```

Para actualizarlo: `git -C "$env:USERPROFILE\.claude\skills\estudio-video" pull` y vuelve a correr `node engine\doctor.mjs --fix` (instala lo nuevo, si hay).

**Tarjeta NVIDIA (opcional, más rápido):** si el diagnóstico detecta tu tarjeta, te ofrece `setup_python.py --gpu`. Con eso la transcripción de voz y «Quitar fondo» usan la tarjeta. Para exportar los videos con la tarjeta, pídele al asistente que use `ESTUDIO_VIDEO_ENCODER=h264_nvenc`. Sin tarjeta NVIDIA todo funciona igual, solo más lento.

**Qué cambia por dentro** (no tienes que hacer nada): la transcripción usa faster-whisper en lugar de mlx-whisper, y la detección de caras usa OpenCV en lugar de Apple Vision (descarga un modelo chico la primera vez). Los datos del skill viven en `%LOCALAPPDATA%\estudio-video`. La llave de ElevenLabs va en `%USERPROFILE%\.config\reels-dibujados\.env`.

**Lo único que no existe en Windows:** la música generada en tu propia computadora (audio-studio es solo de Mac). En Windows la música sale de **Eleven Music** (necesita el plan Creator de ElevenLabs) o de una pista que tú pongas. Los efectos de sonido incluidos funcionan igual.

## Problemas comunes

| Síntoma | Qué hacer |
|---|---|
| Higgsfield o Reda "necesita que inicies sesión" | Repite el paso 2 y luego escribe `/mcp` (Claude) o corre `codex mcp login ...` (Codex) |
| El conector "todavía se estaba conectando" | Espera unos segundos y corre el diagnóstico otra vez |
| Aviso de que Reda usa un "servidor de pruebas" | Es informativo; avísale a Reda solo si tu sesión falla seguido |
| "No encontré ffmpeg" (o Node, Chrome, Python) justo después de instalarlo | Cierra y vuelve a abrir Terminal |
| Faltan paquetes de Python | `node engine/doctor.mjs --fix` |
| Mac con Intel: sin transcripción | Es un límite de mlx_whisper (necesita Apple Silicon); el Video tipo 2 no tendrá subtítulos automáticos |

## Para quien distribuye el skill (no para clientes)

- Paso 3: hoy se instala clonando el repo público github.com/Martifu/estudio-video (sin datos de personas de las marcas). Pendiente: plugin/marketplace de Reda.
- Por sistema: Mac usa `mlx_whisper` y Apple Vision (`faces.swift`); Windows usa faster-whisper y OpenCV YuNet (`faces_yunet.py`). `earshot` (opcional, MIT) corre en ambos; `audio-studio` es solo Mac (MLX).
