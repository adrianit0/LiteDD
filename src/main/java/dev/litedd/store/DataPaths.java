package dev.litedd.store;

import java.nio.file.Path;

/** Rutas de «Rutas en disco». Respeta XDG_DATA_HOME y XDG_CONFIG_HOME si están definidas. */
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

    /** Ajustes y conexión: ~/.config/litedd, o $XDG_CONFIG_HOME/litedd. */
    public static Path configDir() {
        String xdg = System.getenv("XDG_CONFIG_HOME");
        Path base = xdg != null && !xdg.isBlank() ? Path.of(xdg) : Path.of(System.getProperty("user.home"), ".config");
        return base.resolve("litedd");
    }

    public static Path connectionFile() {
        return configDir().resolve("connection.json");
    }
}
