package dev.litedd.store;

import java.nio.file.Path;

/** Rutas de datos de «Rutas en disco». Respeta XDG_DATA_HOME si está definida. */
public final class DataPaths {

    private DataPaths() {
    }

    public static Path dataDir() {
        String xdg = System.getenv("XDG_DATA_HOME");
        Path base = xdg != null && !xdg.isBlank()
                ? Path.of(xdg)
                : Path.of(System.getProperty("user.home"), ".local", "share");
        return base.resolve("litedd");
    }

    public static Path database() {
        return dataDir().resolve("litedd.db");
    }

    public static Path backups() {
        return dataDir().resolve("backups");
    }
}
