#!/usr/bin/env bash
# Publica la release build-N (ADR-0033): el JAR, latest.json con su tamaño, su hash y los commits, y la firma.
# Lo ejecuta .github/workflows/release.yml después de ./mvnw -Pdist verify.
#
# Uso: GITHUB_RUN_NUMBER=N GITHUB_SHA=commit LITEDD_RELEASE_KEY=clave scripts/release.sh [carpeta]
# Con una carpeta deja allí los ficheros y no publica nada.
set -euo pipefail
cd "$(dirname "$0")/.."

JAR="target/dist/input/litedd.jar"
PUBLIC_KEY="src/main/resources/dev/litedd/update/release-key.pub"
BUILD="${GITHUB_RUN_NUMBER:?Falta GITHUB_RUN_NUMBER}"
COMMIT="${GITHUB_SHA:?Falta GITHUB_SHA}"
: "${LITEDD_RELEASE_KEY:?Falta el secreto LITEDD_RELEASE_KEY: no se publica nada}"
if [ ! -f "$JAR" ]; then
  echo "No existe $JAR. Ejecuta antes ./mvnw -Pdist verify" >&2
  exit 1
fi

umask 077
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
KEY="$WORK/release.pem"
printf '%s\n' "$LITEDD_RELEASE_KEY" > "$KEY"

# Una release firmada con otra clave la rechazaría toda instalación (R-30).
if [ ! -f "$PUBLIC_KEY" ] || [ "$(openssl pkey -in "$KEY" -pubout -outform DER | base64 -w0)" != "$(tr -d '[:space:]' < "$PUBLIC_KEY")" ]; then
  echo "LITEDD_RELEASE_KEY no corresponde a $PUBLIC_KEY: no se publica nada" >&2
  exit 1
fi

OUT="${1:-$WORK/release}"
mkdir -p "$OUT"
VERSION="$(sed -n '0,/<version>/s:.*<version>\(.*\)</version>.*:\1:p' pom.xml)"
PREVIOUS="$(git describe --tags --abbrev=0 --match 'build-*' 2>/dev/null || true)"
git log -n 50 --format=%s ${PREVIOUS:+"$PREVIOUS..HEAD"} > "$WORK/commits.txt"

# R-03
jq -n --argjson build "$BUILD" --arg version "$VERSION" --arg commit "$COMMIT" \
  --arg date "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --argjson size "$(wc -c < "$JAR")" \
  --arg sha256 "$(sha256sum "$JAR" | cut -d' ' -f1)" --rawfile commits "$WORK/commits.txt" \
  '{build: $build, version: $version, commit: $commit, date: $date, size: $size, sha256: $sha256,
    commits: ($commits | split("\n") | map(select(length > 0)))}' > "$OUT/latest.json"
# R-04
openssl pkeyutl -sign -rawin -inkey "$KEY" -in "$OUT/latest.json" -out "$OUT/latest.json.sig"

if [ $# -gt 0 ]; then
  echo "Ficheros de la release build-$BUILD en $OUT"
  exit 0
fi

# R-02
gh release create "build-$BUILD" "$JAR" "$OUT/latest.json" "$OUT/latest.json.sig" \
  --target "$COMMIT" --title "Build $BUILD" --notes-file "$WORK/commits.txt" --latest
