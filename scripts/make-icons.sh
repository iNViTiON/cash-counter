#!/usr/bin/env bash
# Rasterises the PWA icon set from the two source SVGs.
# ImageMagick comes from the nix devShell, so no `sharp` native build is needed.
set -euo pipefail

cd "$(dirname "$0")/.."
DIR=static/icons

magick -background none "$DIR/icon.svg" -resize 192x192 "$DIR/icon-192.png"
magick -background none "$DIR/icon.svg" -resize 512x512 "$DIR/icon-512.png"
magick -background none "$DIR/icon.svg" -resize 180x180 "$DIR/apple-touch-icon.png"
magick -background none "$DIR/icon-maskable.svg" -resize 512x512 "$DIR/icon-maskable-512.png"
magick -background none "$DIR/icon.svg" -resize 32x32 "$DIR/favicon.png"

ls -l "$DIR"
