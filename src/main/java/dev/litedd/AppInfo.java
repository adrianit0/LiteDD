package dev.litedd;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.util.Properties;

/** Firma y versión de la aplicación, tomadas del build de Maven. */
public final class AppInfo {

    public static final String NAME = "LiteDD";
    public static final String VERSION = loadVersion();

    private AppInfo() {
    }

    private static String loadVersion() {
        try (InputStream in = AppInfo.class.getResourceAsStream("version.properties")) {
            if (in == null) {
                return "dev";
            }
            Properties props = new Properties();
            props.load(in);
            return props.getProperty("version", "dev");
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
