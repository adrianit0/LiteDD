package dev.litedd.store;

import java.nio.file.Path;

/** Rutas de «Rutas en disco». Respeta XDG_DATA_HOME, XDG_CONFIG_HOME y XDG_STATE_HOME si están definidas. */
public final class DataPaths {

    private DataPaths() {
    }

    private static Path xdg(String variable, String... fallback) {
        String value = System.getenv(variable);
        Path base = value != null && !value.isBlank() ? Path.of(value) : Path.of(System.getProperty("user.home"), fallback);
        return base.resolve("litedd");
    }

    public static Path dataDir() {
        return xdg("XDG_DATA_HOME", ".local", "share");
    }

    public static Path database() {
        return dataDir().resolve("litedd.db");
    }

    public static Path backups() {
        return dataDir().resolve("backups");
    }

    /** Ajustes y conexión: ~/.config/litedd. */
    public static Path configDir() {
        return xdg("XDG_CONFIG_HOME", ".config");
    }

    public static Path connectionFile() {
        return configDir().resolve("connection.json");
    }

    /** U-10 */
    public static Path configFile() {
        return configDir().resolve("config.json");
    }

    /** Registro e instancia en marcha: ~/.local/state/litedd. */
    public static Path stateDir() {
        return xdg("XDG_STATE_HOME", ".local", "state");
    }

    /** ADR-0017 */
    public static Path instanceFile() {
        return stateDir().resolve("instance.json");
    }
}
