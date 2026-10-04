package dev.litedd;

import dev.litedd.http.HttpServer;
import dev.litedd.lifecycle.CommandLine;
import dev.litedd.lifecycle.CommandLine.Options;
import dev.litedd.lifecycle.Desktop;
import dev.litedd.lifecycle.InstanceFile;
import dev.litedd.lifecycle.LifecycleApi;
import dev.litedd.lifecycle.Presence;
import dev.litedd.mysql.ConnectionApi;
import dev.litedd.mysql.ConnectionFile;
import dev.litedd.mysql.MySqlGateway;
import dev.litedd.mysql.SqlApi;
import dev.litedd.notes.AttachmentsApi;
import dev.litedd.notes.NoteService;
import dev.litedd.notes.NotesApi;
import dev.litedd.notes.VariableValues;
import dev.litedd.session.SessionApi;
import dev.litedd.settings.AppSettings;
import dev.litedd.settings.SettingsApi;
import dev.litedd.sqlengine.SqlEngine;
import dev.litedd.store.DataPaths;
import dev.litedd.store.Store;
import dev.litedd.transfer.Backups;
import dev.litedd.transfer.DataApi;
import dev.litedd.transfer.Exporter;
import dev.litedd.transfer.Importer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Path;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.util.Base64;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Punto de entrada y ciclo de vida: instancia única, ventana, presencia y apagado ordenado
 * (ADR-0017). Opciones: litedd [--no-window] [--port N] | litedd --stop.
 */
public final class Main {

    /** Solo para desarrollo: scripts/dev.sh comparte el token con Vite (ADR-0003). */
    static final String DEV_TOKEN_ENV = "LITEDD_DEV_TOKEN";

    static {
        // El registro va a ~/.local/state/litedd/litedd.log; tiene que fijarse antes del primer logger.
        System.setProperty("litedd.logdir", DataPaths.stateDir().toString());
    }

    private static final Logger log = LoggerFactory.getLogger(Main.class);

    private Main() {
    }

    public static void main(String[] args) {
        Options options;
        try {
            options = CommandLine.parse(args);
        } catch (IllegalArgumentException e) {
            System.err.println(e.getMessage());
            System.err.println(CommandLine.USAGE);
            System.exit(2);
            return;
        }
        InstanceFile instance = new InstanceFile(DataPaths.instanceFile());
        if (options.stop()) {
            System.exit(stop(instance));
            return;
        }

        AppSettings settings = new AppSettings(DataPaths.configFile());
        int port = options.port() != null ? options.port() : settings.get().port();
        String url = "http://" + HttpServer.HOST + ":" + port + "/";

        // Ciclo de vida, paso 1: si ya hay una instancia, solo se abre la ventana.
        if (isRunning(port)) {
            System.out.println("LiteDD ya está en marcha en " + url);
            if (!options.noWindow()) {
                Desktop.openWindow(url);
            }
            return;
        }
        start(port, url, settings, instance, options.noWindow());
    }

    private static void start(int port, String url, AppSettings settings, InstanceFile instance, boolean noWindow) {
        Clock clock = Clock.systemDefaultZone();
        // Ciclo de vida, paso 2: SQLite, migraciones, copia diaria y servidor.
        Store store = Store.open(DataPaths.database(), DataPaths.backups());
        Backups backups = new Backups(store, DataPaths.backups(), clock);
        try {
            Path daily = backups.dailyIfDue();
            if (daily != null) {
                log.info("Copia diaria creada: {}", daily.getFileName());
            }
        } catch (RuntimeException e) {
            log.warn("No se pudo crear la copia diaria: {}", e.getMessage());
        }
        NoteService notes = new NoteService(store);
        int purged = notes.purgeOrphanAttachments();
        if (purged > 0) {
            log.info("Adjuntos sin referencias eliminados: {}", purged);
        }

        ConnectionFile connectionFile = new ConnectionFile(DataPaths.connectionFile());
        MySqlGateway gateway = new MySqlGateway();
        String token = sessionToken();
        AtomicBoolean stopped = new AtomicBoolean();
        Holder<HttpServer> server = new Holder<>();
        Holder<Presence> presence = new Holder<>();

        // Sincronizado: si el apagado empieza en un hilo daemon y la JVM sale entretanto, el gancho de
        // apagado espera a que termine en lugar de volver enseguida.
        Runnable shutdown = () -> {
            synchronized (stopped) {
                if (stopped.get()) {
                    return;
                }
                stopAll(server.value, gateway, store, instance, presence.value);
                stopped.set(true);
            }
        };
        Runnable exit = () -> {
            shutdown.run();
            System.exit(0);
        };
        presence.value = new Presence(exit, Presence.BYE_GRACE, () -> {
            Integer minutes = settings.get().autoShutdownMinutes();
            return minutes == null ? null : Duration.ofMinutes(minutes);
        });

        try {
            server.value = new HttpServer(port, token, List.of(
                    new NotesApi(notes),
                    new AttachmentsApi(store),
                    new SettingsApi(store, settings),
                    new SessionApi(store),
                    new SqlApi(notes, new VariableValues(store), new SqlEngine(), gateway, settings::get),
                    new ConnectionApi(connectionFile, gateway),
                    new DataApi(new Exporter(store, clock), new Importer(store, backups, clock, Importer.MAX_BYTES), backups,
                            DataPaths.dataDir(), Desktop::openFolder, clock),
                    new LifecycleApi(presence.value, exit))).start();
        } catch (RuntimeException e) {
            System.err.println("No se pudo escuchar en el puerto " + port + ": " + e.getMessage());
            shutdown.run();
            System.exit(1);
            return;
        }
        instance.write(port, token);
        Runtime.getRuntime().addShutdownHook(new Thread(shutdown, "litedd-shutdown"));

        // C-02: las notas funcionan mientras se comprueba la conexión, que puede tardar unos segundos.
        Thread.ofVirtual().name("litedd-mysql-start").start(() -> connectionFile.load().ifPresent(gateway::configure));
        log.info("{} {} escuchando en {}", AppInfo.NAME, AppInfo.VERSION, url);
        if (!noWindow) {
            // Ciclo de vida, paso 3.
            Desktop.openWindow(url);
        }
    }

    private static void stopAll(HttpServer server, MySqlGateway gateway, Store store, InstanceFile instance, Presence presence) {
        log.info("Apagando LiteDD");
        if (server != null) {
            server.stop();
        }
        gateway.close();
        store.close();
        instance.delete();
        if (presence != null) {
            presence.close();
        }
        log.info("LiteDD apagado");
    }

    /** ¿Responde LiteDD en ese puerto? */
    static boolean isRunning(int port) {
        try {
            HttpResponse<String> r = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(1)).build().send(
                    HttpRequest.newBuilder(URI.create("http://" + HttpServer.HOST + ":" + port + "/api/health"))
                            .timeout(Duration.ofSeconds(2)).GET().build(),
                    HttpResponse.BodyHandlers.ofString());
            return r.statusCode() == 200 && r.body().contains("\"app\":\"" + AppInfo.NAME + "\"");
        } catch (Exception e) {
            return false;
        }
    }

    /** litedd --stop: apagado ordenado con el token del fichero de instancia (ADR-0017). */
    static int stop(InstanceFile instance) {
        InstanceFile.Instance running = instance.read().orElse(null);
        if (running == null || !isRunning(running.port())) {
            System.out.println("LiteDD no está en marcha");
            instance.delete();
            return 1;
        }
        try {
            HttpResponse<String> r = HttpClient.newHttpClient().send(
                    HttpRequest.newBuilder(URI.create("http://" + HttpServer.HOST + ":" + running.port() + "/api/shutdown"))
                            .header("X-LiteDD-Token", running.token())
                            .POST(HttpRequest.BodyPublishers.noBody()).build(),
                    HttpResponse.BodyHandlers.ofString());
            if (r.statusCode() != 200) {
                System.err.println("LiteDD no aceptó el apagado (" + r.statusCode() + ")");
                return 1;
            }
            System.out.println("LiteDD se está apagando");
            return 0;
        } catch (Exception e) {
            System.err.println("No se pudo contactar con LiteDD: " + e.getMessage());
            return 1;
        }
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

    private static final class Holder<T> {
        T value;
    }
}
