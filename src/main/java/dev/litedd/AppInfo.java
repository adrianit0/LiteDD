package dev.litedd;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.util.Properties;

/** Firma y versión de la aplicación, tomadas del build de Maven. */
public final class AppInfo {

    public static final String NAME = "LiteDD";
    private static final Properties BUILD_INFO = load();
    public static final String VERSION = BUILD_INFO.getProperty("version", "dev");
    /** R-06: número del workflow de publicación; 0 en un JAR compilado a mano. */
    public static final long BUILD = build(BUILD_INFO.getProperty("build", "0"));
    /** R-06: vacío en un JAR compilado a mano. */
    public static final String COMMIT = BUILD_INFO.getProperty("commit", "");

    private AppInfo() {
    }

    private static Properties load() {
        Properties props = new Properties();
        try (InputStream in = AppInfo.class.getResourceAsStream("version.properties")) {
            if (in != null) {
                props.load(in);
            }
            return props;
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private static long build(String value) {
        try {
            return Long.parseLong(value.strip());
        } catch (NumberFormatException e) {
            return 0;
        }
    }
}
