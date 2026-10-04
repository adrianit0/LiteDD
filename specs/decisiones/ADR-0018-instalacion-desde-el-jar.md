# ADR-0018: Instalación desde el JAR único, sin Maven

- Estado: aceptada (2026-10-04)
- Requisitos: build y distribución, criterio de aceptación del Sprint 6 sobre `scripts/install.sh`

## Contexto

En el equipo con Ubuntu no se puede usar Maven, así que allí no se puede ejecutar `./mvnw -Pdist package`. jpackage no genera imágenes para otro sistema: la imagen construida en Windows lleva un ejecutable y un runtime de Windows. El JAR único sí es portable: incluye la interfaz construida y la librería nativa de SQLite para Linux.

## Decisión

`scripts/install.sh` acepta un argumento opcional con la ruta del JAR único (`target/dist/input/litedd.jar`, generado en cualquier sistema con `./mvnw -Pdist package`):

1. Sin argumento, instala la imagen `target/dist/litedd` como hasta ahora.
2. Con el JAR, busca un Java 21 o posterior en `$JAVA_HOME`, `/usr/lib/jvm/*` y el `PATH`, sin exigir que sea el Java por defecto del sistema.
3. Si junto a ese Java está `jpackage` (JDK completo), genera la imagen en el propio equipo, con icono y las opciones de JVM, y la instala como en el punto 1.
4. Si no lo está (solo JRE), copia el JAR a `~/.local/opt/litedd/lib/` y crea `~/.local/opt/litedd/bin/litedd`, que ejecuta ese Java con `-Xmx384m -XX:+UseSerialGC -jar`. En este caso la aplicación usa el Java del sistema en lugar de un runtime propio.

En los dos casos el comando, el lanzador `.desktop`, el icono, `--stop` y `scripts/uninstall.sh` funcionan igual. Para instalar basta con copiar al equipo el JAR y las carpetas `scripts/` y `packaging/`.

## Consecuencias

- Se puede instalar en Ubuntu sin Maven, sin npm y sin acceso a los repositorios de paquetes de Java o JavaScript.
- Las pruebas `-Pit` (ADR-0013) siguen necesitando Maven: o se habilita en Ubuntu, o se lanzan desde el equipo de desarrollo contra un MySQL accesible desde él.
