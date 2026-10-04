package dev.litedd;

import dev.litedd.http.HttpServer;
import dev.litedd.notes.NoteService;
import dev.litedd.notes.NotesApi;
import dev.litedd.settings.SettingsApi;
import dev.litedd.store.DataPaths;
import dev.litedd.store.Store;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.security.SecureRandom;
import java.util.Base64;
import java.util.List;

/** Punto de entrada. El ciclo de vida completo (ventana, --stop, apagado) llega en el Sprint 6. */
public final class Main {

    public static final int DEFAULT_PORT = 47600;
    /** Solo para desarrollo: scripts/dev.sh comparte el token con Vite (ADR-0003). */
    static final String DEV_TOKEN_ENV = "LITEDD_DEV_TOKEN";

    private static final Logger log = LoggerFactory.getLogger(Main.class);

    private Main() {
    }

    public static void main(String[] args) {
        int port = DEFAULT_PORT;
        for (int i = 0; i < args.length; i++) {
            switch (args[i]) {
                case "--port" -> port = Integer.parseInt(args[++i]);
                case "--no-window" -> { /* Sprint 6: todavía no se abre ninguna ventana */ }
                default -> {
                    System.err.println("Opción desconocida: " + args[i]);
                    System.exit(2);
                }
            }
        }

        Store store = Store.open(DataPaths.database(), DataPaths.backups());
        HttpServer server = new HttpServer(port, sessionToken(), List.of(
                new NotesApi(new NoteService(store)),
                new SettingsApi(store))).start();
        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            server.stop();
            store.close();
        }, "litedd-shutdown"));
        log.info("{} {} escuchando en http://{}:{}/", AppInfo.NAME, AppInfo.VERSION, HttpServer.HOST, port);
    }

    /** S-12: token aleatorio generado en cada arranque. */
    static String sessionToken() {
        String dev = System.getenv(DEV_TOKEN_ENV);
        if (dev != null && dev.length() >= 32) {
            return dev;
        }
        byte[] bytes = new byte[32];
        new SecureRandom().nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }
}
