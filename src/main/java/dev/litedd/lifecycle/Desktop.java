package dev.litedd.lifecycle;

import dev.litedd.store.DataPaths;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.net.URI;
import java.nio.file.Path;
import java.util.List;
import java.util.Locale;

/**
 * Ventana y carpeta en el escritorio. En Linux: google-chrome --app (o xdg-open) y xdg-open. En
 * otros sistemas, solo para desarrollo, el navegador y el explorador por defecto (ADR-0004).
 */
public final class Desktop {

    private static final Logger log = LoggerFactory.getLogger(Desktop.class);
    private static final boolean LINUX = System.getProperty("os.name", "").toLowerCase(Locale.ROOT).contains("linux");

    private Desktop() {
    }

    /** Clase de ventana; coincide con StartupWMClass y el nombre de packaging/litedd.desktop (ADR-0019). */
    public static final String WINDOW_CLASS = "litedd";

    /** Ciclo de vida, paso 3: Chrome en modo aplicación; si no está, xdg-open. */
    public static void openWindow(String url) {
        if (LINUX) {
            if (!start(chromeCommand(url, DataPaths.stateDir().resolve("chrome")).toArray(String[]::new))) {
                start("xdg-open", url);
            }
            return;
        }
        try {
            java.awt.Desktop.getDesktop().browse(URI.create(url));
        } catch (IOException | RuntimeException e) {
            log.warn("No se pudo abrir la ventana: {}. Abre {} en el navegador.", e.getMessage(), url);
        }
    }

    /**
     * ADR-0019: un perfil propio arranca un proceso de Chrome aparte, de modo que la ventana no se une a un
     * Chrome ya abierto y conserva su clase. Con X11 (también bajo Wayland) la clase es la de --class y el
     * escritorio la asocia al lanzador de LiteDD y a su icono.
     */
    static List<String> chromeCommand(String url, Path profile) {
        return List.of("google-chrome", "--app=" + url, "--class=" + WINDOW_CLASS, "--user-data-dir=" + profile,
                "--ozone-platform=x11", "--no-first-run", "--no-default-browser-check");
    }

    /** X-10: abre la carpeta de datos. */
    public static void openFolder(Path folder) {
        if (LINUX) {
            if (!start("xdg-open", folder.toString())) {
                throw new IllegalStateException("No se pudo abrir la carpeta " + folder);
            }
            return;
        }
        try {
            java.awt.Desktop.getDesktop().open(folder.toFile());
        } catch (IOException | RuntimeException e) {
            throw new IllegalStateException("No se pudo abrir la carpeta " + folder, e);
        }
    }

    private static boolean start(String... command) {
        try {
            new ProcessBuilder(command).inheritIO().start();
            return true;
        } catch (IOException e) {
            log.debug("No se pudo ejecutar {}: {}", command[0], e.getMessage());
            return false;
        }
    }
}
