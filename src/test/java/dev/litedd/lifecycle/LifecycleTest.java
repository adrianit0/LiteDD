package dev.litedd.lifecycle;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.litedd.http.HttpServer;
import dev.litedd.lifecycle.CommandLine.Options;
import dev.litedd.settings.AppConfig;
import dev.litedd.settings.AppSettings;
import dev.litedd.settings.SettingsApi;
import dev.litedd.store.Store;
import dev.litedd.transfer.Backups;
import dev.litedd.transfer.DataApi;
import dev.litedd.transfer.Exporter;
import dev.litedd.transfer.Importer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.InputStream;
import java.net.ServerSocket;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.PosixFilePermissions;
import java.time.Clock;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Ciclo de vida, ajustes (U-10) y datos (X-01, X-05, X-10) por HTTP. */
class LifecycleTest {

    private static final String TOKEN = "test-token-0123456789abcdefghijklmnop";
    private static final ObjectMapper JSON = new ObjectMapper();

    @TempDir
    Path dir;
    Store store;
    AppSettings settings;
    Presence presence;
    HttpServer server;
    HttpClient client = HttpClient.newHttpClient();
    int port;
    AtomicInteger shutdowns = new AtomicInteger();
    AtomicReference<Path> openedFolder = new AtomicReference<>();

    @BeforeEach
    void start() throws Exception {
        try (ServerSocket s = new ServerSocket(0)) {
            port = s.getLocalPort();
        }
        store = Store.open(dir.resolve("litedd.db"), dir.resolve("backups"));
        settings = new AppSettings(dir.resolve("config/config.json"));
        presence = new Presence(shutdowns::incrementAndGet, Duration.ofMillis(300), () -> null);
        Clock clock = Clock.systemDefaultZone();
        Backups backups = new Backups(store, dir.resolve("backups"), clock);
        server = new HttpServer(port, TOKEN, List.of(
                new SettingsApi(store, settings),
                new LifecycleApi(presence, shutdowns::incrementAndGet),
                new DataApi(new Exporter(store, clock), new Importer(store, backups, clock, Importer.MAX_BYTES), backups,
                        dir.resolve("data"), openedFolder::set, clock))).start();
    }

    @AfterEach
    void stop() {
        server.stop();
        presence.close();
        store.close();
    }

    // --- Presencia y apagado ---

    @Test
    void lifecycle_bye_without_windows_shuts_down_after_the_grace_period() throws Exception {
        presence.connected();
        presence.bye();
        presence.disconnected();
        assertThat(shutdowns.get()).isZero();
        Thread.sleep(600);
        assertThat(shutdowns.get()).isEqualTo(1);
    }

    @Test
    void lifecycle_reconnecting_within_the_grace_period_keeps_running() throws Exception {
        presence.connected();
        presence.bye();
        presence.disconnected();
        presence.connected();
        Thread.sleep(600);
        assertThat(shutdowns.get()).isZero();
    }

    @Test
    void lifecycle_losing_presence_without_bye_keeps_running_unless_auto_shutdown() throws Exception {
        presence.connected();
        presence.disconnected();
        Thread.sleep(500);
        assertThat(shutdowns.get()).isZero();

        AtomicInteger auto = new AtomicInteger();
        try (Presence withAuto = new Presence(auto::incrementAndGet, Duration.ofMillis(300), () -> Duration.ofMillis(200))) {
            withAuto.connected();
            withAuto.disconnected();
            Thread.sleep(500);
            assertThat(auto.get()).isEqualTo(1);
        }
    }

    @Test
    void lifecycle_events_channel_requires_the_token_and_counts_presence() throws Exception {
        HttpResponse<String> denied = client.send(HttpRequest.newBuilder(url("/api/events")).GET().build(),
                HttpResponse.BodyHandlers.ofString());
        assertThat(denied.statusCode()).isEqualTo(403);

        HttpResponse<InputStream> stream = client.send(HttpRequest.newBuilder(url("/api/events"))
                .header("X-LiteDD-Token", TOKEN).header("Accept", "text/event-stream").GET().build(),
                HttpResponse.BodyHandlers.ofInputStream());
        assertThat(stream.statusCode()).isEqualTo(200);
        assertThat(stream.headers().firstValue("Content-Type").orElse("")).contains("text/event-stream");
        byte[] first = stream.body().readNBytes(1);
        assertThat(first).hasSize(1);
        assertThat(presence.connections()).isEqualTo(1);
        stream.body().close();
    }

    @Test
    void lifecycle_bye_and_shutdown_routes() throws Exception {
        assertThat(post("/api/presence/bye", "").statusCode()).isEqualTo(200);
        assertThat(post("/api/shutdown", "").statusCode()).isEqualTo(200);
        Thread.sleep(500);
        assertThat(shutdowns.get()).isGreaterThanOrEqualTo(1);
    }

    @Test
    void lifecycle_instance_file_is_private_and_removable() throws Exception {
        InstanceFile file = new InstanceFile(dir.resolve("state/instance.json"));
        assertThat(file.read()).isEmpty();
        file.write(47600, TOKEN);
        assertThat(file.read()).contains(new InstanceFile.Instance(47600, TOKEN));
        if (dir.getFileSystem().supportedFileAttributeViews().contains("posix")) {
            assertThat(PosixFilePermissions.toString(Files.getPosixFilePermissions(dir.resolve("state/instance.json"))))
                    .isEqualTo("rw-------");
        }
        file.delete();
        assertThat(file.read()).isEmpty();
    }

    @Test
    void lifecycle_command_line_options() {
        assertThat(CommandLine.parse(new String[0])).isEqualTo(new Options(false, null, false));
        assertThat(CommandLine.parse(new String[]{"--no-window", "--port", "47700"})).isEqualTo(new Options(true, 47700, false));
        assertThat(CommandLine.parse(new String[]{"--stop"})).isEqualTo(new Options(false, null, true));
        assertThatThrownBy(() -> CommandLine.parse(new String[]{"--port"})).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> CommandLine.parse(new String[]{"--port", "x"})).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> CommandLine.parse(new String[]{"--otra"})).isInstanceOf(IllegalArgumentException.class);
    }

    // --- U-10 ---

    @Test
    void u10_settings_have_defaults_persist_and_are_validated() throws Exception {
        JsonNode config = get("/api/settings").get("config");
        assertThat(config.get("defaultPageSize").asInt()).isEqualTo(20);
        assertThat(config.get("rowCap").asInt()).isEqualTo(10_000);
        assertThat(config.get("queryTimeoutSeconds").asInt()).isEqualTo(30);
        assertThat(config.get("port").asInt()).isEqualTo(47600);
        assertThat(config.get("autoShutdownMinutes").isNull()).isTrue();

        HttpResponse<String> ok = put("/api/settings", """
                {"config":{"defaultPageSize":null,"rowCap":5000,"queryTimeoutSeconds":60,"port":47700,"autoShutdownMinutes":30},
                 "ui.sidebarWidth":300}""");
        assertThat(ok.statusCode()).isEqualTo(200);
        assertThat(settings.get()).isEqualTo(new AppConfig(null, 5000, 60, 47700, 30));
        assertThat(new AppSettings(dir.resolve("config/config.json")).get()).isEqualTo(settings.get());
        assertThat(get("/api/settings").get("ui.sidebarWidth").asInt()).isEqualTo(300);

        for (String bad : List.of("{\"defaultPageSize\":7,\"rowCap\":5000,\"queryTimeoutSeconds\":60,\"port\":47700}",
                "{\"defaultPageSize\":20,\"rowCap\":0,\"queryTimeoutSeconds\":60,\"port\":47700}",
                "{\"defaultPageSize\":20,\"rowCap\":5000,\"queryTimeoutSeconds\":0,\"port\":47700}",
                "{\"defaultPageSize\":20,\"rowCap\":5000,\"queryTimeoutSeconds\":60,\"port\":80}",
                "{\"defaultPageSize\":20,\"rowCap\":5000,\"queryTimeoutSeconds\":60,\"port\":47700,\"autoShutdownMinutes\":0}")) {
            assertThat(put("/api/settings", "{\"config\":" + bad + "}").statusCode()).as(bad).isEqualTo(400);
        }
        assertThat(settings.get().rowCap()).isEqualTo(5000);
    }

    // --- X-01, X-05, X-10 ---

    @Test
    void x01_export_downloads_a_zip_with_date_in_its_name() throws Exception {
        HttpResponse<byte[]> r = client.send(HttpRequest.newBuilder(url("/api/data/export")).header("X-LiteDD-Token", TOKEN)
                .POST(HttpRequest.BodyPublishers.noBody()).build(), HttpResponse.BodyHandlers.ofByteArray());
        assertThat(r.statusCode()).isEqualTo(200);
        assertThat(r.headers().firstValue("Content-Type")).contains("application/zip");
        assertThat(r.headers().firstValue("Content-Disposition").orElse("")).matches("attachment; filename=\"litedd-export-\\d{8}-\\d{4}\\.zip\"");
        assertThat(r.body()[0]).isEqualTo((byte) 'P');

        HttpResponse<String> imported = client.send(HttpRequest.newBuilder(url("/api/data/import?mode=branch"))
                .header("X-LiteDD-Token", TOKEN).header("Content-Type", "application/zip")
                .POST(HttpRequest.BodyPublishers.ofByteArray(r.body())).build(), HttpResponse.BodyHandlers.ofString());
        assertThat(imported.statusCode()).isEqualTo(200);
        assertThat(JSON.readTree(imported.body()).has("rootId")).isTrue();
        assertThat(post("/api/data/import?mode=otro", "").statusCode()).isEqualTo(400);
    }

    @Test
    void x10_backup_now_and_open_the_data_folder() throws Exception {
        HttpResponse<String> backup = post("/api/data/backup", "");
        assertThat(backup.statusCode()).isEqualTo(200);
        assertThat(JSON.readTree(backup.body()).get("file").asText()).matches("litedd-\\d{8}\\.db");
        assertThat(post("/api/data/open-folder", "").statusCode()).isEqualTo(200);
        assertThat(openedFolder.get()).isEqualTo(dir.resolve("data"));
    }

    private URI url(String path) {
        return URI.create("http://127.0.0.1:" + port + path);
    }

    private JsonNode get(String path) throws Exception {
        return JSON.readTree(client.send(HttpRequest.newBuilder(url(path)).header("X-LiteDD-Token", TOKEN).GET().build(),
                HttpResponse.BodyHandlers.ofString()).body());
    }

    private HttpResponse<String> post(String path, String body) throws Exception {
        return client.send(HttpRequest.newBuilder(url(path)).header("X-LiteDD-Token", TOKEN)
                .POST(HttpRequest.BodyPublishers.ofString(body)).build(), HttpResponse.BodyHandlers.ofString());
    }

    private HttpResponse<String> put(String path, String body) throws Exception {
        return client.send(HttpRequest.newBuilder(url(path)).header("X-LiteDD-Token", TOKEN).header("Content-Type", "application/json")
                .PUT(HttpRequest.BodyPublishers.ofString(body)).build(), HttpResponse.BodyHandlers.ofString());
    }
}
