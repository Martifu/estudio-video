#!/bin/zsh
# usage: gen_image.sh PROMPT_FILE OUT_PNG [ORIENT]
# Generates one image with Codex built-in image generation. ORIENT: square (default)|portrait|landscape.
# No reference images. Work/log dir: <OUT without ext>.codex/codex.log
set -e
PROMPT_FILE=${1:A}; OUT=${2:A}; ORIENT=${3:-square}
case $ORIENT in portrait) SIZE="portrait 2:3, e.g. 1024x1536";; landscape) SIZE="landscape 3:2, e.g. 1536x1024";; *) SIZE="square 1:1, 1024x1024";; esac
WORK=${OUT:r}.codex; mkdir -p $WORK ${OUT:h}; cd $WORK
codex exec --skip-git-repo-check --sandbox workspace-write --add-dir ${OUT:h} -- "Use your built-in image generation tool exactly once ($SIZE). Use this prompt verbatim as the generation prompt:

$(cat $PROMPT_FILE)

After generating, copy the PNG to $OUT and print that path. Do not edit, crop or post-process the image." < /dev/null > $WORK/codex.log 2>&1
ls -la $OUT
