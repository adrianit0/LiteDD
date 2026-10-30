package dev.litedd.update;

import java.net.URISyntaxException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Optional;

/**
 * El JAR en ejecución y su lanzador (R-14). Las dos formas de instalar tienen uno de cada: lib/app/litedd.jar en la
 * imagen de jpackage y lib/litedd.jar con el Java del sistema, las dos con bin/litedd (ADR-0018).
 */
record Installation(Path jar, Path launcher) {

    private static final int MAX_LEVELS = 3;

    static Optional<Installation> of(Path code) {
        if (!Files.isRegularFile(code) || !code.getFileName().toString().endsWith(".jar")) {
            return Optional.empty();
        }
        Path dir = code.getParent();
        for (int level = 0; level < MAX_LEVELS && dir != null; level++) {
            Path launcher = dir.resolve("bin").resolve("litedd");
            if (Files.isExecutable(launcher)) {
                return Optional.of(new Installation(code, launcher));
            }
            dir = dir.getParent();
        }
        return Optional.empty();
    }

    /** En desarrollo es la carpeta de clases, que no es una instalación. */
    static Path running() {
        try {
            return Path.of(Installation.class.getProtectionDomain().getCodeSource().getLocation().toURI()).toAbsolutePath();
        } catch (URISyntaxException e) {
            throw new IllegalStateException(e);
        }
    }
}
