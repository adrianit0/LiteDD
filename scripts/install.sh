#!/usr/bin/env bash
# Instala LiteDD para el usuario actual, sin sudo:
#   ~/.local/opt/litedd/                          aplicación
#   ~/.local/bin/litedd                           comando
#   ~/.local/share/applications/litedd.desktop    lanzador con icono
#
# Uso:
#   scripts/install.sh               instala la imagen de ./mvnw -Pdist package (target/dist/litedd)
#   scripts/install.sh litedd.jar    instala desde el JAR único, sin Maven (ADR-0018): con el jpackage
#                                    de un JDK 21 genera la imagen aquí; si no lo hay, ejecuta el JAR
#                                    con el Java 21 instalado
#
# Desde el JAR basta con copiar el JAR y las carpetas scripts/ y packaging/. Los datos no se tocan.
set -euo pipefail

JAR=""
if [ $# -gt 1 ]; then
  echo "Uso: $0 [litedd.jar]" >&2
  exit 2
fi
if [ $# -eq 1 ]; then
  if [ ! -f "$1" ]; then
    echo "No existe el fichero $1" >&2
    exit 1
  fi
  JAR="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
fi
cd "$(dirname "$0")/.."

OPT="$HOME/.local/opt/litedd"
BIN_DIR="$HOME/.local/bin"
APPS="$HOME/.local/share/applications"
ICONS="$HOME/.local/share/icons/hicolor/256x256/apps"
JAVA_OPTIONS="-Xmx384m -XX:+UseSerialGC"
APP_VERSION="0.1.0"

# Busca un Java 21 o posterior sin exigir que sea el Java por defecto del sistema.
find_java() {
  local candidates=()
  [ -n "${JAVA_HOME:-}" ] && candidates+=("$JAVA_HOME/bin/java")
  for j in /usr/lib/jvm/*/bin/java; do candidates+=("$j"); done
  command -v java >/dev/null && candidates+=("$(command -v java)")
  for j in "${candidates[@]}"; do
    [ -x "$j" ] || continue
    local version
    version="$("$j" -XshowSettings:properties -version 2>&1 | sed -n 's/^ *java.specification.version = //p')"
    if [[ "$version" =~ ^[0-9]+$ ]] && [ "$version" -ge 21 ]; then
      echo "$j"
      return 0
    fi
  done
  return 1
}

WORK=""
trap 'if [ -n "$WORK" ]; then rm -rf "$WORK"; fi' EXIT

if [ -z "$JAR" ]; then
  IMAGE="target/dist/litedd"
  if [ ! -x "$IMAGE/bin/litedd" ]; then
    echo "No existe $IMAGE. Ejecuta antes ./mvnw -Pdist package o indica el JAR: $0 litedd.jar" >&2
    exit 1
  fi
else
  if ! JAVA="$(find_java)"; then
    echo "Hace falta Java 21 o posterior: sudo apt install openjdk-21-jdk" >&2
    exit 1
  fi
  JPACKAGE="$(dirname "$JAVA")/jpackage"
  if [ -x "$JPACKAGE" ]; then
    echo "Generando la imagen de aplicación con $JPACKAGE…"
    WORK="$(mktemp -d)"
    mkdir "$WORK/input"
    cp "$JAR" "$WORK/input/litedd.jar"
    "$JPACKAGE" --type app-image --name litedd --app-version "$APP_VERSION" \
      --input "$WORK/input" --main-jar litedd.jar --main-class dev.litedd.Main \
      --java-options "$JAVA_OPTIONS" --icon packaging/litedd.png --dest "$WORK/dist"
    IMAGE="$WORK/dist/litedd"
  else
    echo "No hay jpackage junto a $JAVA: se instala el JAR y se ejecutará con ese Java."
    IMAGE=""
  fi
fi

# Si LiteDD está en marcha, se apaga antes de sustituirlo.
if [ -x "$OPT/bin/litedd" ]; then
  "$OPT/bin/litedd" --stop >/dev/null 2>&1 || true
fi

mkdir -p "$(dirname "$OPT")" "$BIN_DIR" "$APPS" "$ICONS"
rm -rf "$OPT"
if [ -n "$IMAGE" ]; then
  cp -R "$IMAGE" "$OPT"
else
  mkdir -p "$OPT/bin" "$OPT/lib"
  install -m 644 "$JAR" "$OPT/lib/litedd.jar"
  cat > "$OPT/bin/litedd" <<EOF
#!/bin/sh
exec "$JAVA" $JAVA_OPTIONS -jar "$OPT/lib/litedd.jar" "\$@"
EOF
  chmod 755 "$OPT/bin/litedd"
fi

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
