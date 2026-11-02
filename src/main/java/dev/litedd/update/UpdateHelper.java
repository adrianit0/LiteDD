package dev.litedd.update;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

/**
 * Proceso sh independiente que sustituye el JAR cuando LiteDD ya ha terminado (R-43, R-44). Si la versión nueva no
 * escribe instance.json a tiempo, vuelve a la anterior.
 */
final class UpdateHelper {

    /** R-44 */
    static final int WAIT_SECONDS = 60;

    /**
     * Las rutas llegan como argumentos: nunca forman parte del texto del script. R-43: con _JPACKAGE_LAUNCHER heredada,
     * el lanzador de jpackage cree que lo reejecuta la JVM y le entrega sus argumentos, así que no arrancaría (ADR-0035).
     * R-44: los errores del lanzador van al registro.
     */
    private static final String SCRIPT = """
            pid=$1 jar=$2 launcher=$3 port=$4 instance=$5 seconds=$6
            unset _JPACKAGE_LAUNCHER LD_LIBRARY_PATH
            say() { echo "$(date '+%F %T') $1"; }
            start() { nohup "$launcher" --no-window --port "$port" >/dev/null & started=$!; }
            arrived() {
              waited=0
              while [ "$waited" -lt "$seconds" ]; do
                [ -f "$instance" ] && return 0
                sleep 1
                waited=$((waited + 1))
              done
              [ -f "$instance" ]
            }

            say "Esperando a que termine LiteDD ($pid)"
            while kill -0 "$pid" 2>/dev/null; do sleep 0.2; done

            if ! cp -p "$jar" "$jar.prev" || ! mv -f "$jar.new" "$jar"; then
              say "No se pudo sustituir el JAR: sigue la versión anterior"
              rm -f "$jar.new"
              start
              say "FIN"
              exit 1
            fi

            say "JAR sustituido: arrancando la versión nueva"
            rm -f "$instance"
            start
            if arrived; then
              say "Versión nueva en marcha"
              say "FIN"
              exit 0
            fi

            say "La versión nueva no arrancó en $seconds s: se vuelve a la anterior"
            kill "$started" 2>/dev/null
            sleep 1
            mv -f "$jar.prev" "$jar"
            rm -f "$instance"
            start
            if arrived; then
              say "Versión anterior en marcha"
            else
              say "La versión anterior tampoco arrancó. Si la nueva migró la base, restaura la copia -premigracion"
            fi
            say "FIN"
            """;

    private UpdateHelper() {
    }

    static void start(Installation installation, int port, Path instance, Path log) throws IOException {
        process(installation, port, instance, log, ProcessHandle.current().pid(), WAIT_SECONDS).start();
    }

    /** R-44: el registro se reescribe en cada actualización. */
    static ProcessBuilder process(Installation installation, int port, Path instance, Path log, long pid, int seconds) throws IOException {
        Files.createDirectories(log.getParent());
        return new ProcessBuilder("/bin/sh", "-c", SCRIPT, "litedd-update", String.valueOf(pid), installation.jar().toString(),
                installation.launcher().toString(), String.valueOf(port), instance.toString(), String.valueOf(seconds))
                .redirectInput(ProcessBuilder.Redirect.from(new File("/dev/null")))
                .redirectErrorStream(true)
                .redirectOutput(ProcessBuilder.Redirect.to(log.toFile()));
    }
}
