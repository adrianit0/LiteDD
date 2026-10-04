#!/usr/bin/env bash
# Instala LiteDD para el usuario actual, sin sudo:
#   ~/.local/opt/litedd/                          imagen de aplicación (con su runtime de Java)
#   ~/.local/bin/litedd                           comando
#   ~/.local/share/applications/litedd.desktop    lanzador con icono
# Requiere haber ejecutado antes ./mvnw -Pdist package. Los datos no se tocan.
set -euo pipefail
cd "$(dirname "$0")/.."

IMAGE="target/dist/litedd"
OPT="$HOME/.local/opt/litedd"
BIN_DIR="$HOME/.local/bin"
APPS="$HOME/.local/share/applications"
ICONS="$HOME/.local/share/icons/hicolor/256x256/apps"

if [ ! -x "$IMAGE/bin/litedd" ]; then
  echo "No existe $IMAGE. Ejecuta antes: ./mvnw -Pdist package" >&2
  exit 1
fi

# Si LiteDD está en marcha, se apaga antes de sustituir la imagen.
if [ -x "$OPT/bin/litedd" ]; then
  "$OPT/bin/litedd" --stop >/dev/null 2>&1 || true
fi

mkdir -p "$(dirname "$OPT")" "$BIN_DIR" "$APPS" "$ICONS"
rm -rf "$OPT"
cp -R "$IMAGE" "$OPT"

ln -sfn "$OPT/bin/litedd" "$BIN_DIR/litedd"
install -m 644 packaging/litedd.png "$ICONS/litedd.png"
sed -e "s|@BIN@|$OPT/bin/litedd|" -e "s|@ICON@|$ICONS/litedd.png|" packaging/litedd.desktop > "$APPS/litedd.desktop"
chmod 644 "$APPS/litedd.desktop"
command -v update-desktop-database >/dev/null && update-desktop-database "$APPS" >/dev/null 2>&1 || true

echo "LiteDD instalado en $OPT"
case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *) echo "Añade $BIN_DIR al PATH para usar el comando litedd." ;;
esac
