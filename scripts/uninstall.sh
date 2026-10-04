#!/usr/bin/env bash
# Desinstala LiteDD del usuario actual. Las notas, copias, ajustes y conexión se conservan en
# ~/.local/share/litedd, ~/.config/litedd y ~/.local/state/litedd (registro); bórralos a mano si ya no los necesitas.
set -euo pipefail

OPT="$HOME/.local/opt/litedd"
APPS="$HOME/.local/share/applications"

if [ -x "$OPT/bin/litedd" ]; then
  "$OPT/bin/litedd" --stop >/dev/null 2>&1 || true
fi

rm -rf "$OPT"
rm -f "$HOME/.local/bin/litedd" "$APPS/litedd.desktop" "$HOME/.local/share/icons/hicolor/256x256/apps/litedd.png"
command -v update-desktop-database >/dev/null && update-desktop-database "$APPS" >/dev/null 2>&1 || true

echo "LiteDD desinstalado. Los datos siguen en ~/.local/share/litedd y ~/.config/litedd."
