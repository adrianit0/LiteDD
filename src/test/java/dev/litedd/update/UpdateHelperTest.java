package dev.litedd.update;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledOnOs;
import org.junit.jupiter.api.condition.OS;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;

/** R-43, R-44 con un lanzador falso. El proceso usa sh, así que solo corre en Linux (ADR-0004). */
@EnabledOnOs(OS.LINUX)
class UpdateHelperTest {

    /** Hace de aplicación: si el JAR dice «bueno», escribe instance.json, como el servidor al arrancar. */
    private static final String LAUNCHER = """
            #!/bin/sh
            dir=$(dirname "$0")/..
            echo "$@" >> "$dir/args"
            cat "$dir/lib/litedd.jar" >> "$dir/ran"
            if grep -q bueno "$dir/lib/litedd.jar"; then
              touch "$dir/instance.json"
            fi
            """;

    @TempDir
    Path dir;
    Path jar;
    Path next;
    Path instance;
    Path log;
    Installation installation;

    @BeforeEach
    void install() throws IOException {
        jar = dir.resolve("lib/litedd.jar");
        next = dir.resolve("lib/litedd.jar.new");
        instance = dir.resolve("instance.json");
        log = dir.resolve("state/update.log");
        Files.createDirectories(jar.getParent());
        Files.writeString(jar, "bueno anterior\n");
        Path launcher = dir.resolve("bin/litedd");
        Files.createDirectories(launcher.getParent());
        Files.writeString(launcher, LAUNCHER);
        assertThat(launcher.toFile().setExecutable(true)).isTrue();
        installation = new Installation(jar, launcher);
    }

    /** Un proceso de un segundo hace de LiteDD apagándose. */
    private void run(int seconds) throws Exception {
        Process app = new ProcessBuilder("sleep", "1").start();
        UpdateHelper.start(installation, 47600, instance, log, app.pid(), seconds);
        Instant limit = Instant.now().plus(Duration.ofSeconds(seconds * 3L + 10));
        while (Instant.now().isBefore(limit)) {
            if (Files.exists(log) && Files.readString(log).contains("FIN")) {
                return;
            }
            Thread.sleep(50);
        }
        throw new AssertionError("El proceso no terminó: " + (Files.exists(log) ? Files.readString(log) : "sin registro"));
    }

    @Test
    void r43_replaces_the_jar_keeps_the_previous_one_and_starts_on_the_same_port() throws Exception {
        Files.writeString(next, "bueno nuevo\n");
        run(5);
        assertThat(Files.readString(jar)).isEqualTo("bueno nuevo\n");
        assertThat(Files.readString(jar.resolveSibling("litedd.jar.prev"))).isEqualTo("bueno anterior\n");
        assertThat(next).doesNotExist();
        assertThat(Files.readString(dir.resolve("args")).strip()).isEqualTo("--no-window --port 47600");
    }

    @Test
    void r44_a_version_that_does_not_start_goes_back_to_the_previous_one() throws Exception {
        Files.writeString(next, "roto\n");
        run(2);
        assertThat(Files.readString(jar)).isEqualTo("bueno anterior\n");
        assertThat(Files.readString(dir.resolve("ran"))).isEqualTo("roto\nbueno anterior\n");
        assertThat(instance).exists();
        assertThat(Files.readString(log)).contains("se vuelve a la anterior").contains("Versión anterior en marcha");
    }

    @Test
    void r44_says_what_to_do_if_the_previous_version_does_not_start_either() throws Exception {
        Files.writeString(jar, "roto anterior\n");
        Files.writeString(next, "roto nuevo\n");
        run(1);
        assertThat(Files.readString(jar)).isEqualTo("roto anterior\n");
        assertThat(Files.readString(log)).contains("-premigracion");
    }

    @Test
    void r44_the_log_is_rewritten_on_each_update() throws Exception {
        Files.createDirectories(log.getParent());
        Files.writeString(log, "actualización anterior\n");
        Files.writeString(next, "bueno nuevo\n");
        run(5);
        assertThat(Files.readString(log)).doesNotContain("actualización anterior");
    }
}
