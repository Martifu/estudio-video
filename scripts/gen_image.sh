#!/usr/bin/env bash
# usage: gen_image.sh PROMPT_FILE OUT_PNG [ORIENT]
# Generates one image with Codex built-in image generation. ORIENT: square (default)|portrait|landscape.
# No reference images. Work/log dir: <OUT without ext>.codex/codex.log
# POSIX bash (macOS, Linux, Git Bash on Windows). Paths are made absolute with realpath (python3 fallback).
set -e
abspath() { realpath -m -- "$1" 2>/dev/null || python3 -c 'import os,sys;print(os.path.abspath(sys.argv[1]))' "$1"; }
PROMPT_FILE=$(abspath "$1"); OUT=$(abspath "$2"); ORIENT=${3:-square}
case $ORIENT in portrait) SIZE="portrait 2:3, e.g. 1024x1536";; landscape) SIZE="landscape 3:2, e.g. 1536x1024";; *) SIZE="square 1:1, 1024x1024";; esac
OUT_DIR=$(dirname "$OUT"); OUT_BASE=$(basename "$OUT")
WORK="$OUT_DIR/${OUT_BASE%.*}.codex"; mkdir -p "$WORK" "$OUT_DIR"; cd "$WORK"
codex exec --skip-git-repo-check --sandbox workspace-write --add-dir "$OUT_DIR" -- "Use your built-in image generation tool exactly once ($SIZE). Use this prompt verbatim as the generation prompt:

$(cat "$PROMPT_FILE")

After generating, copy the PNG to $OUT and print that path. Do not edit, crop or post-process the image." < /dev/null > "$WORK/codex.log" 2>&1
ls -la "$OUT"
