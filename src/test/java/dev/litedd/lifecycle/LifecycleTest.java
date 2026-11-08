package dev.litedd.lifecycle;

import com.fasterxml.jackson.core.type.TypeReference;
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

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.ServerSocket;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.PosixFilePermissions;
import java.time.Clock;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Ciclo de vida, enlaces externos (N-32), ajustes (U-10) y datos (X-01, X-05, X-10) por HTTP. */
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
    List<String> openedLinks = new CopyOnWriteArrayList<>();
    volatile boolean linksFail;
    AtomicInteger windowsOpened = new AtomicInteger();
    AtomicInteger windowsRaised = new AtomicInteger();

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
                new LifecycleApi(presence, shutdowns::incrementAndGet, url -> {
                    if (linksFail) {
                        throw new IllegalStateException("sin navegador");
                    }
                    openedLinks.add(url);
                }, windowsOpened::incrementAndGet, windowsRaised::incrementAndGet),
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
    void lifecycle_closed_window_detected_after_the_grace_period_shuts_down_at_once() throws Exception {
        // El cierre del canal se descubre con el latido, después de que haya vencido el plazo.
        presence.connected();
        presence.bye();
        Thread.sleep(500);
        assertThat(shutdowns.get()).isZero();
        presence.disconnected();
        Thread.sleep(200);
        assertThat(shutdowns.get()).isEqualTo(1);
    }

    @Test
    void lifecycle_closed_window_detected_within_the_grace_period_waits_for_it() throws Exception {
        presence.connected();
        presence.bye();
        presence.disconnected();
        Thread.sleep(100);
        assertThat(shutdowns.get()).isZero();
        Thread.sleep(500);
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
    void lifecycle_chrome_window_has_its_own_profile_and_class() throws Exception {
        java.util.List<String> command = Desktop.chromeCommand("http://127.0.0.1:47600/", dir.resolve("chrome"));
        assertThat(command).startsWith("google-chrome", "--app=http://127.0.0.1:47600/")
                .contains("--class=litedd", "--user-data-dir=" + dir.resolve("chrome"), "--ozone-platform=x11");
        // El lanzador se asocia a la ventana por su clase.
        String desktopFile = Files.readString(Path.of("packaging/litedd.desktop"));
        assertThat(desktopFile).contains("StartupWMClass=" + Desktop.WINDOW_CLASS);
    }

    // --- N-32 ---

    @Test
    void n32_external_links_open_in_the_usual_chrome_as_a_new_tab() throws Exception {
        assertThat(post("/api/open-link", "{\"url\":\"https://example.org/a?b=1#c\"}").statusCode()).isEqualTo(200);
        assertThat(post("/api/open-link", "{\"url\":\"MAILTO:demo@example.org\"}").statusCode()).isEqualTo(200);
        assertThat(openedLinks).containsExactly("https://example.org/a?b=1#c", "MAILTO:demo@example.org");
        // ADR-0036: sin --app ni el perfil propio de la ventana, Chrome lo abre en el perfil habitual.
        assertThat(Desktop.browserTabCommand("https://example.org/")).containsExactly("google-chrome", "https://example.org/");
    }

    @Test
    void n32_only_web_and_mail_links_are_opened() throws Exception {
        for (String bad : List.of("{\"url\":\"file:///etc/hosts\"}", "{\"url\":\"javascript:alert(1)\"}",
                "{\"url\":\"--app=https://example.org/\"}", "{\"url\":\"https://example.org/a b\"}",
                "{\"url\":\"https://example.org/\\nb\"}", "{\"url\":\"https:\"}", "{}")) {
            HttpResponse<String> r = post("/api/open-link", bad);
            assertThat(r.statusCode()).as(bad).isEqualTo(400);
            assertThat(JSON.readTree(r.body()).get("code").asText()).isEqualTo("invalid_link");
        }
        assertThat(openedLinks).isEmpty();

        linksFail = true;
        HttpResponse<String> failed = post("/api/open-link", "{\"url\":\"https://example.org/\"}");
        assertThat(failed.statusCode()).isEqualTo(500);
        assertThat(JSON.readTree(failed.body()).get("code").asText()).isEqualTo("open_failed");
    }

    @Test
    void lifecycle_command_line_options() {
        assertThat(CommandLine.parse(new String[0])).isEqualTo(new Options(false, null, false, null));
        assertThat(CommandLine.parse(new String[]{"--no-window", "--port", "47700"})).isEqualTo(new Options(true, 47700, false, null));
        assertThat(CommandLine.parse(new String[]{"--stop"})).isEqualTo(new Options(false, null, true, null));
        assertThatThrownBy(() -> CommandLine.parse(new String[]{"--port"})).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> CommandLine.parse(new String[]{"--port", "x"})).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> CommandLine.parse(new String[]{"--otra"})).isInstanceOf(IllegalArgumentException.class);
    }

    // --- N-95, N-96 (ADR-0045) ---

    @Test
    void n95_command_line_accepts_a_note_link_as_the_launcher_passes_it() {
        String id = "3f2b8c1e-0d4a-4b7e-9c55-1a2b3c4d5e6f";
        assertThat(CommandLine.parse(new String[]{"litedd://note/" + id}).open()).isEqualTo(OpenRequest.note(id));
        for (String link : List.of("litedd://note/" + id + "/", "litedd://note/" + id + "?x=1", "litedd://note/" + id + "#a",
                "LITEDD://note/" + id, "litedd://note/" + id.replace("-", "%2D"))) {
            assertThat(OpenRequest.fromLink(link)).as(link).isEqualTo(OpenRequest.note(id));
        }
        assertThat(CommandLine.parse(new String[]{"--port", "47700", "litedd://note/" + id}))
                .isEqualTo(new Options(false, 47700, false, OpenRequest.note(id)));
        for (String bad : List.of("litedd://note/", "litedd://note/a%20b", "litedd://note/a%2Fb", "litedd://note/%zz",
                "litedd://attachment/" + id, "https://example.org/")) {
            assertThatThrownBy(() -> CommandLine.parse(new String[]{bad})).as(bad).isInstanceOf(IllegalArgumentException.class);
        }
        assertThatThrownBy(() -> CommandLine.parse(new String[]{"litedd://note/a", "litedd://note/b"}))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void n96_command_line_opens_by_title() {
        assertThat(CommandLine.parse(new String[]{"--open", "  Plan de pruebas "}).open())
                .isEqualTo(OpenRequest.title("Plan de pruebas"));
        assertThat(OpenRequest.title("Plan de pruebas").title()).isEqualTo("Plan de pruebas");
        for (String[] bad : List.of(new String[]{"--open"}, new String[]{"--open", "  "}, new String[]{"--open", "a\nb"},
                new String[]{"--open", "x".repeat(OpenRequest.TITLE_MAX + 1)}, new String[]{"--open", "a", "litedd://note/b"})) {
            assertThatThrownBy(() -> CommandLine.parse(bad)).as(String.join(" ", bad)).isInstanceOf(IllegalArgumentException.class);
        }
    }

    @Test
    void n95_open_note_reaches_the_connected_window_and_brings_it_to_the_front() throws Exception {
        try (BufferedReader events = events()) {
            assertThat(post("/api/open-note", "{\"noteId\":\"nota-1\"}").statusCode()).isEqualTo(200);
            assertThat(nextOpenEvent(events)).isEqualTo(Map.of("noteId", "nota-1"));
            // N-96: el título viaja tal cual; la ventana busca la nota.
            assertThat(post("/api/open-note", "{\"title\":\" Plan de pruebas \"}").statusCode()).isEqualTo(200);
            assertThat(nextOpenEvent(events)).isEqualTo(Map.of("title", "Plan de pruebas"));
        }
        assertThat(windowsRaised.get()).isEqualTo(2);
        assertThat(windowsOpened.get()).isZero();
    }

    @Test
    void n95_without_a_window_opens_one_and_delivers_the_note_when_it_connects() throws Exception {
        assertThat(post("/api/open-note", "{\"noteId\":\"nota-2\"}").statusCode()).isEqualTo(200);
        assertThat(windowsOpened.get()).isEqualTo(1);
        assertThat(windowsRaised.get()).isZero();
        try (BufferedReader events = events()) {
            assertThat(nextOpenEvent(events)).isEqualTo(Map.of("noteId", "nota-2"));
        }
        // Se entrega una sola vez.
        try (BufferedReader again = events()) {
            assertThat(post("/api/open-note", "{\"noteId\":\"nota-3\"}").statusCode()).isEqualTo(200);
            assertThat(nextOpenEvent(again)).isEqualTo(Map.of("noteId", "nota-3"));
        }
    }

    @Test
    void n95_open_note_needs_the_token_and_exactly_one_valid_target() throws Exception {
        HttpResponse<String> denied = client.send(HttpRequest.newBuilder(url("/api/open-note"))
                .POST(HttpRequest.BodyPublishers.ofString("{\"noteId\":\"a\"}")).build(), HttpResponse.BodyHandlers.ofString());
        assertThat(denied.statusCode()).isEqualTo(403);
        for (String bad : List.of("{}", "{\"noteId\":\"a\",\"title\":\"b\"}", "{\"noteId\":\"a b\"}", "{\"noteId\":\"../a\"}",
                "{\"title\":\"  \"}", "{\"title\":\"" + "x".repeat(OpenRequest.TITLE_MAX + 1) + "\"}")) {
            HttpResponse<String> r = post("/api/open-note", bad);
            assertThat(r.statusCode()).as(bad).isEqualTo(400);
            assertThat(JSON.readTree(r.body()).get("code").asText()).isEqualTo("invalid_note");
        }
        assertThat(windowsOpened.get() + windowsRaised.get()).isZero();
    }

    @Test
    void n95_the_launcher_and_the_installer_register_the_litedd_scheme() throws Exception {
        String desktopFile = Files.readString(Path.of("packaging/litedd.desktop"));
        assertThat(desktopFile).contains("Exec=@BIN@ %u", "MimeType=x-scheme-handler/litedd;");
        assertThat(Files.readString(Path.of("scripts/install.sh")))
                .contains("xdg-mime default litedd.desktop x-scheme-handler/litedd");
        assertThat(Files.readString(Path.of("scripts/uninstall.sh"))).contains("x-scheme-handler\\/litedd=");
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
        assertThat(settings.get()).isEqualTo(new AppConfig(null, 5000, 60, 47700, 30, true, null));
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

    @Test
    void n46_autosave_defaults_to_true_and_can_be_turned_off() throws Exception {
        assertThat(get("/api/settings").get("config").get("autosave").asBoolean()).isTrue();
        // Un config.json sin el campo, de una versión anterior, sigue con guardado automático.
        Files.createDirectories(dir.resolve("config"));
        Files.writeString(dir.resolve("config/config.json"),
                "{\"defaultPageSize\":20,\"rowCap\":10000,\"queryTimeoutSeconds\":30,\"port\":47600}");
        assertThat(new AppSettings(dir.resolve("config/config.json")).get().autosave()).isTrue();

        assertThat(put("/api/settings", """
                {"config":{"defaultPageSize":20,"rowCap":10000,"queryTimeoutSeconds":30,"port":47600,"autoShutdownMinutes":null,
                 "autosave":false}}""").statusCode()).isEqualTo(200);
        assertThat(new AppSettings(dir.resolve("config/config.json")).get().autosave()).isFalse();
        assertThat(get("/api/settings").get("config").get("autosave").asBoolean()).isFalse();
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

    /** Abre /api/events como la ventana y espera a quedar conectado. */
    private BufferedReader events() throws Exception {
        HttpResponse<InputStream> stream = client.send(HttpRequest.newBuilder(url("/api/events"))
                .header("X-LiteDD-Token", TOKEN).header("Accept", "text/event-stream").GET().build(),
                HttpResponse.BodyHandlers.ofInputStream());
        BufferedReader reader = new BufferedReader(new InputStreamReader(stream.body(), StandardCharsets.UTF_8));
        assertThat(readLine(reader)).contains("conectado");
        return reader;
    }

    /** El JSON del siguiente evento open, sin los campos nulos. */
    private Map<String, Object> nextOpenEvent(BufferedReader reader) throws Exception {
        String line;
        do {
            line = readLine(reader);
        } while (!line.equals("event: " + LifecycleApi.OPEN_EVENT));
        do {
            line = readLine(reader);
        } while (!line.startsWith("data:"));
        Map<String, Object> data = JSON.readValue(line.substring(5).strip(), new TypeReference<Map<String, Object>>() { });
        data.values().removeIf(Objects::isNull);
        return data;
    }

    private static String readLine(BufferedReader reader) throws Exception {
        String line = CompletableFuture.supplyAsync(() -> {
            try {
                return reader.readLine();
            } catch (java.io.IOException e) {
                throw new java.io.UncheckedIOException(e);
            }
        }).get(5, TimeUnit.SECONDS);
        assertThat(line).as("el canal sigue abierto").isNotNull();
        return line;
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
