package dev.litedd.httpnotes;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpExchange;
import dev.litedd.http.ApiError;
import dev.litedd.httpnotes.HttpNoteContent.Generated;
import dev.litedd.httpnotes.HttpNoteContent.Row;
import dev.litedd.httpnotes.HttpRunner.Result;
import dev.litedd.notes.Note;
import dev.litedd.notes.NoteService;
import dev.litedd.settings.AppConfig;
import dev.litedd.store.Store;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.PosixFilePermissions;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Notas HTTP (H-10 a H-42) contra un servidor falso que imita el login de la aplicación. */
class HttpNotesTest {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final String PASSWORD = "secreto-de-prueba";

    @TempDir
    Path dir;
    Store store;
    NoteService notes;
    HttpCredentials credentials;
    AtomicReference<AppConfig> config = new AtomicReference<>();
    HttpRunner runner;
    com.sun.net.httpserver.HttpServer server;
    int port;
    /** Peticiones recibidas por el servidor falso: método, ruta con query y cabeceras. */
    List<Received> received = new CopyOnWriteArrayList<>();
    Map<String, Handler> routes = new ConcurrentHashMap<>();
    Note loginNote;

    record Received(String method, String uri, Map<String, List<String>> headers, String body) {
        String header(String name) {
            return headers.entrySet().stream().filter(e -> e.getKey().equalsIgnoreCase(name))
                    .map(e -> e.getValue().getFirst()).findFirst().orElse(null);
        }
    }

    interface Handler {
        void handle(HttpExchange ex) throws IOException;
    }

    @BeforeEach
    void start() throws Exception {
        store = Store.open(dir.resolve("litedd.db"), dir.resolve("backups"));
        notes = new NoteService(store);
        credentials = new HttpCredentials(dir.resolve("config/http.json"));
        credentials.setPassword(PASSWORD);
        server = com.sun.net.httpserver.HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/", ex -> {
            byte[] body = ex.getRequestBody().readAllBytes();
            received.add(new Received(ex.getRequestMethod(), ex.getRequestURI().toString(), Map.copyOf(ex.getRequestHeaders()),
                    new String(body, StandardCharsets.UTF_8)));
            Handler h = routes.get(ex.getRequestURI().getPath());
            if (h == null) {
                reply(ex, 404, "application/json", "{\"error\":\"not found\"}");
            } else {
                h.handle(ex);
            }
        });
        server.setExecutor(java.util.concurrent.Executors.newVirtualThreadPerTaskExecutor());
        server.start();
        port = server.getAddress().getPort();
        routes.put("/demo/users/demo/login", HttpNotesTest::login);
        routes.put("/demo/users/otro/login", ex -> reply(ex, 401, "application/json", "{\"message\":\"Bad credentials\"}"));
        routes.put("/demo/user/5/tasks", ex -> reply(ex, 200, "application/json", "[{\"id\":1,\"title\":\"Tarea\"}]"));
        loginNote = http("Login", "{\"method\":\"GET\",\"endpoint\":\"/users/{userName}/login\"}");
        configure("http://127.0.0.1:" + port + "/demo/", 30, 10);
        runner = new HttpRunner(notes, config::get, credentials, new HttpCaller());
    }

    @AfterEach
    void stop() {
        server.stop(0);
        store.close();
    }

    /** El login de la aplicación: Basic Auth correcto → 200, X-USERID y cookies CSRF-TOKEN y JSESSIONID. */
    private static void login(HttpExchange ex) throws IOException {
        String expected = "Basic " + Base64.getEncoder().encodeToString(("demo:" + PASSWORD).getBytes(StandardCharsets.UTF_8));
        if (!expected.equals(ex.getRequestHeaders().getFirst("Authorization"))) {
            reply(ex, 401, "application/json", "{\"message\":\"Bad credentials\"}");
            return;
        }
        ex.getResponseHeaders().add("X-USERID", "usr-4711");
        ex.getResponseHeaders().add("Set-Cookie", "CSRF-TOKEN=csrf-abc; Path=/");
        ex.getResponseHeaders().add("Set-Cookie", "JSESSIONID=sesion-1; Path=/; HttpOnly");
        reply(ex, 200, "application/json", "{\"message\":\"Login success\"}");
    }

    private static void reply(HttpExchange ex, int status, String type, String body) throws IOException {
        reply(ex, status, type, body.getBytes(StandardCharsets.UTF_8));
    }

    private static void reply(HttpExchange ex, int status, String type, byte[] body) throws IOException {
        if (type != null) {
            ex.getResponseHeaders().add("Content-Type", type);
        }
        ex.sendResponseHeaders(status, body.length == 0 ? -1 : body.length);
        try (var out = ex.getResponseBody()) {
            out.write(body);
        }
    }

    private void configure(String base, int timeout, int maxMb) {
        config.set(new AppConfig(20, 10_000, 30, 47600, null, true,
                new AppConfig.Http(base, loginNote.id(), "demo", timeout, maxMb)));
    }

    private Note http(String title, String content) {
        Note n = notes.create(null, "http", title);
        return notes.save(n.id(), title, content, n.version());
    }

    private Result run(Note n) {
        return runner.execute(n.id(), notes.get(n.id()).version(), "e-" + n.id());
    }

    private List<Received> to(String path) {
        return received.stream().filter(r -> r.uri().startsWith(path)).toList();
    }

    // --- Dirección (H-10 a H-14, H-40) ---

    @Test
    void h11_one_slash_between_base_and_endpoint() {
        assertThat(LocalUrls.join("http://127.0.0.1:8080/demo/", "/user")).isEqualTo("http://127.0.0.1:8080/demo/user");
        assertThat(LocalUrls.join("http://127.0.0.1:8080/demo", "user")).isEqualTo("http://127.0.0.1:8080/demo/user");
        assertThat(LocalUrls.join("http://127.0.0.1:8080/demo/", "user")).isEqualTo("http://127.0.0.1:8080/demo/user");
        assertThat(LocalUrls.join("http://127.0.0.1:8080/demo", "/user")).isEqualTo("http://127.0.0.1:8080/demo/user");
        assertThat(LocalUrls.join("http://127.0.0.1:8080/demo/", "")).isEqualTo("http://127.0.0.1:8080/demo/");
    }

    @Test
    void h12_h14_path_variables_and_params_are_encoded() {
        String url = LocalUrls.compose("http://127.0.0.1:8080/demo/", "/user/{id}/tasks/{name}",
                Map.of("id", "5", "name", "a b/ñ"),
                List.of(new Row("q", "x&y=1", true), new Row("off", "1", false), new Row("page", "2", null))).toString();
        assertThat(url).isEqualTo("http://127.0.0.1:8080/demo/user/5/tasks/a%20b%2F%C3%B1?q=x%26y%3D1&page=2");
        assertThat(LocalUrls.pathVariables("/user/{id}/tasks/{name}/{id}")).containsExactly("id", "name");
        assertThatThrownBy(() -> LocalUrls.compose("http://127.0.0.1:8080/", "/user/{id}", Map.of("id", " "), List.of()))
                .isInstanceOf(ApiError.class).hasMessageContaining("id");
    }

    @Test
    void h40_only_local_addresses_are_accepted() {
        for (String base : List.of("http://127.0.0.1:8080/demo/", "http://localhost:8080", "http://[::1]:8080/x/", "https://127.0.0.1/")) {
            assertThat(LocalUrls.validateBase(base)).as(base).isNotNull();
        }
        for (String base : List.of("http://example.org/", "http://10.0.0.5:8080/", "http://127.0.0.2/", "ftp://127.0.0.1/",
                "http://usuario@127.0.0.1/", "file:///etc/passwd", "http://127.0.0.1.example.org/", "http://127.0.0.1:8080/?a=1")) {
            assertThatThrownBy(() -> LocalUrls.validateBase(base)).as(base).isInstanceOf(ApiError.class);
        }
        // La URL final no puede cambiar de host ni de puerto aunque el endpoint lo intente.
        for (String endpoint : List.of("@example.org/x", "//example.org/x", "/../../x")) {
            assertThat(LocalUrls.compose("http://127.0.0.1:8080/demo/", endpoint, Map.of(), List.of()).getHost())
                    .as(endpoint).isEqualTo("127.0.0.1");
        }
        // Los ajustes no admiten una URL base que no sea local.
        assertThatThrownBy(() -> new AppConfig(20, 10_000, 30, 47600, null, true,
                new AppConfig.Http("http://example.org/", null, "", 30, 10)).validate())
                .isInstanceOf(ApiError.class).hasMessageContaining("dirección local");
    }

    // --- Cabeceras y cuerpo (H-15 a H-17) ---

    @Test
    void h15_h16_generated_headers_can_be_changed_or_disabled_and_own_headers_win() {
        HttpNoteContent c = new HttpNoteContent("GET", "/x", null, null,
                List.of(new Row("X-Trace", "7", true), new Row("Cache-Control", "max-age=0", true), new Row("Off", "1", false)),
                Map.of("Accept", new Generated("text/plain", null), "User-Agent", new Generated(null, false)), null, null, null, false);
        LoginSession s = new LoginSession("demo", "usr-4711", "csrf", new java.util.LinkedHashMap<>(Map.of("CSRF-TOKEN", "csrf")));
        Map<String, String> h = new java.util.LinkedHashMap<>();
        RequestHeaders.build(c, "application/json", s, null).forEach(e -> h.put(e.getKey(), e.getValue()));
        assertThat(h).containsEntry("Accept", "text/plain").containsEntry("Content-Type", "application/json")
                .containsEntry("Cache-Control", "max-age=0").containsEntry("X-USERID", "usr-4711").containsEntry("X-CSRF-TOKEN", "csrf")
                .containsEntry("Cookie", "CSRF-TOKEN=csrf").containsEntry("X-Trace", "7")
                .doesNotContainKey("User-Agent").doesNotContainKey("Off");

        HttpNoteContent restricted = new HttpNoteContent("GET", "/x", null, null, List.of(new Row("Host", "evil", true)),
                null, null, null, null, false);
        assertThatThrownBy(() -> RequestHeaders.build(restricted, "application/json", null, null))
                .isInstanceOf(ApiError.class).hasMessageContaining("Host");
    }

    @Test
    void h17_bodies_and_their_content_type() {
        HttpNoteContent.Body form = new HttpNoteContent.Body("form-data", null, null,
                List.of(new Row("nombre", "Ana", true), new Row("off", "x", false)));
        String multipart = new String(HttpRunner.body(form, "B"), StandardCharsets.UTF_8);
        assertThat(multipart).isEqualTo("--B\r\nContent-Disposition: form-data; name=\"nombre\"\r\n\r\nAna\r\n--B--\r\n");
        assertThat(RequestHeaders.contentTypeFor(form, "B")).isEqualTo("multipart/form-data; boundary=B");
        assertThat(RequestHeaders.contentTypeFor(new HttpNoteContent.Body("raw", "xml", "<a/>", null), "B")).isEqualTo("application/xml");
        assertThat(RequestHeaders.contentTypeFor(new HttpNoteContent.Body("raw", "text", "x", null), "B")).isEqualTo("text/plain");
        assertThat(RequestHeaders.contentTypeFor(new HttpNoteContent.Body(null, null, null, null), "B")).isEqualTo("application/json");
    }

    // --- Login (H-20 a H-27) ---

    @Test
    void h20_h22_h23_login_then_call_with_userid_csrf_and_cookies() throws Exception {
        Note n = http("Tareas", "{\"method\":\"GET\",\"endpoint\":\"/user/{id}/tasks\",\"pathValues\":{\"id\":\"5\"}}");
        Result r = run(n);

        assertThat(r.error()).isNull();
        assertThat(r.phase()).isEqualTo("request");
        assertThat(r.login().status()).isEqualTo(200);
        assertThat(r.request().url()).isEqualTo("http://127.0.0.1:" + port + "/demo/user/5/tasks");
        assertThat(r.response().status()).isEqualTo(200);
        assertThat(r.response().statusText()).isEqualTo("OK");
        assertThat(r.response().text()).isEqualTo("[{\"id\":1,\"title\":\"Tarea\"}]");

        Received loginCall = to("/demo/users/demo/login").getFirst();
        assertThat(loginCall.method()).isEqualTo("GET");
        assertThat(loginCall.header("Accept")).isEqualTo("application/json");
        assertThat(loginCall.header("Content-Type")).isEqualTo("application/json");
        Received call = to("/demo/user/5/tasks").getFirst();
        assertThat(call.header("X-USERID")).isEqualTo("usr-4711");
        assertThat(call.header("X-CSRF-TOKEN")).isEqualTo("csrf-abc");
        assertThat(call.header("Cookie")).isEqualTo("CSRF-TOKEN=csrf-abc; JSESSIONID=sesion-1");
        assertThat(call.header("Authorization")).isNull();
        // La contraseña nunca vuelve a la interfaz.
        assertThat(JSON.writeValueAsString(r)).doesNotContain(PASSWORD)
                .doesNotContain(Base64.getEncoder().encodeToString(("demo:" + PASSWORD).getBytes(StandardCharsets.UTF_8)));
    }

    @Test
    void h24_no_login_sends_no_login_headers() {
        Note n = http("Libre", "{\"endpoint\":\"/user/5/tasks\",\"login\":\"none\"}");
        Result r = run(n);
        assertThat(r.error()).isNull();
        assertThat(r.login()).isNull();
        assertThat(to("/demo/users/")).isEmpty();
        Received call = to("/demo/user/5/tasks").getFirst();
        assertThat(call.header("X-USERID")).isNull();
        assertThat(call.header("X-CSRF-TOKEN")).isNull();
        assertThat(call.header("Cookie")).isNull();
    }

    @Test
    void h25_reuse_needs_a_previous_login_and_then_skips_it() {
        Note reuse = http("Reutiliza", "{\"endpoint\":\"/user/5/tasks\",\"login\":\"reuse\"}");
        Result none = run(reuse);
        assertThat(none.error().code()).isEqualTo("no_login");
        assertThat(received).isEmpty();

        run(http("Con login", "{\"endpoint\":\"/user/5/tasks\"}"));
        assertThat(to("/demo/users/demo/login")).hasSize(1);
        Result again = run(reuse);
        assertThat(again.error()).isNull();
        assertThat(to("/demo/users/demo/login")).hasSize(1);
        assertThat(to("/demo/user/5/tasks").getLast().header("X-USERID")).isEqualTo("usr-4711");
    }

    @Test
    void h26_a_failed_login_stops_the_call_and_shows_the_login_response() {
        Note n = http("Otro usuario", "{\"endpoint\":\"/user/5/tasks\",\"user\":\"otro\"}");
        Result r = run(n);
        assertThat(r.phase()).isEqualTo("login");
        assertThat(r.error().code()).isEqualTo("login_failed");
        assertThat(r.error().message()).isEqualTo("El login respondió 401 Unauthorized");
        assertThat(r.response().status()).isEqualTo(401);
        assertThat(to("/demo/user/5/tasks")).isEmpty();

        // Un 200 sin X-USERID tampoco vale.
        routes.put("/demo/users/demo/login", ex -> reply(ex, 200, "application/json", "{\"message\":\"Login success\"}"));
        Result missing = run(http("Sin cabecera", "{\"endpoint\":\"/user/5/tasks\"}"));
        assertThat(missing.error().message()).isEqualTo("El login no devolvió la cabecera X-USERID");
    }

    @Test
    void h21_h26_missing_password_or_user_stop_before_calling() {
        credentials.setPassword(null);
        assertThat(run(http("A", "{\"endpoint\":\"/user/5/tasks\"}")).error().code()).isEqualTo("no_password");
        credentials.setPassword(PASSWORD);
        config.set(new AppConfig(20, 10_000, 30, 47600, null, true,
                new AppConfig.Http("http://127.0.0.1:" + port + "/demo/", loginNote.id(), "", 30, 10)));
        assertThat(run(http("B", "{\"endpoint\":\"/user/5/tasks\"}")).error().code()).isEqualTo("no_user");
        assertThat(received).isEmpty();
    }

    @Test
    void h27_running_the_login_note_logs_in_and_leaves_it_for_reuse() {
        Result r = run(loginNote);
        assertThat(r.error()).isNull();
        assertThat(r.response().text()).isEqualTo("{\"message\":\"Login success\"}");
        assertThat(r.response().cookies()).extracting(HttpCaller.Cookie::name).containsExactly("CSRF-TOKEN", "JSESSIONID");
        assertThat(run(http("Reutiliza", "{\"endpoint\":\"/user/5/tasks\",\"login\":\"reuse\"}")).error()).isNull();
    }

    // --- Ejecución y respuesta (H-30 a H-35, H-41) ---

    @Test
    void h32_server_down_gives_the_postman_message() throws Exception {
        int free;
        try (ServerSocket s = new ServerSocket(0)) {
            free = s.getLocalPort();
        }
        configure("http://127.0.0.1:" + free + "/demo/", 30, 10);
        Result r = run(http("Apagado", "{\"endpoint\":\"/x\",\"login\":\"none\"}"));
        assertThat(r.error().code()).isEqualTo("connection_refused");
        assertThat(r.error().message()).isEqualTo("Error: connect ECONNREFUSED 127.0.0.1:" + free);
        // También si el que no responde es el login, indicando que es del login.
        Result login = run(http("Con login", "{\"endpoint\":\"/x\"}"));
        assertThat(login.phase()).isEqualTo("login");
        assertThat(login.error().message()).isEqualTo("Login: Error: connect ECONNREFUSED 127.0.0.1:" + free);
    }

    @Test
    void h31_timeout_and_h30_cancel() throws Exception {
        routes.put("/demo/slow", ex -> {
            try {
                Thread.sleep(3000);
            } catch (InterruptedException ignored) {
                Thread.currentThread().interrupt();
            }
            reply(ex, 200, "text/plain", "tarde");
        });
        configure("http://127.0.0.1:" + port + "/demo/", 1, 10);
        Note slow = http("Lenta", "{\"endpoint\":\"/slow\",\"login\":\"none\"}");
        Result timeout = run(slow);
        assertThat(timeout.error().code()).isEqualTo("timeout");
        assertThat(timeout.error().message()).contains("1 s");

        configure("http://127.0.0.1:" + port + "/demo/", 30, 10);
        AtomicReference<Result> result = new AtomicReference<>();
        Thread t = Thread.ofVirtual().start(() -> result.set(runner.execute(slow.id(), notes.get(slow.id()).version(), "lenta")));
        Thread.sleep(300);
        assertThat(runner.cancel("lenta")).isTrue();
        t.join(5000);
        assertThat(result.get().error().code()).isEqualTo("cancelled");
        assertThat(runner.cancel("no-existe")).isFalse();
    }

    @Test
    void h33_h34_methods_body_and_response_details() {
        routes.put("/demo/items", ex -> {
            ex.getResponseHeaders().add("Set-Cookie", "pref=1; Path=/demo; Max-Age=60");
            reply(ex, 201, "application/json; charset=utf-8", "{\"ok\":true,\"nombre\":\"Ñandú\"}");
        });
        Note post = http("Crear", "{\"method\":\"POST\",\"endpoint\":\"items\",\"login\":\"none\","
                + "\"body\":{\"mode\":\"raw\",\"rawType\":\"json\",\"raw\":\"{\\\"a\\\":1}\"}}");
        Result r = run(post);
        assertThat(r.response().status()).isEqualTo(201);
        assertThat(r.response().statusText()).isEqualTo("Created");
        assertThat(r.response().text()).isEqualTo("{\"ok\":true,\"nombre\":\"Ñandú\"}");
        assertThat(r.response().binary()).isFalse();
        assertThat(r.response().contentType()).isEqualTo("application/json; charset=utf-8");
        assertThat(r.response().cookies()).singleElement().satisfies(c -> {
            assertThat(c.name()).isEqualTo("pref");
            assertThat(c.path()).isEqualTo("/demo");
            assertThat(c.maxAge()).isEqualTo(60L);
        });
        assertThat(r.response().size()).isEqualTo("{\"ok\":true,\"nombre\":\"Ñandú\"}".getBytes(StandardCharsets.UTF_8).length);
        Received call = to("/demo/items").getFirst();
        assertThat(call.method()).isEqualTo("POST");
        assertThat(call.body()).isEqualTo("{\"a\":1}");
        assertThat(r.request().method()).isEqualTo("POST");
        assertThat(r.request().headers()).extracting(HttpRunner.Header::name).contains("Accept", "Content-Type", "User-Agent", "Cache-Control");

        for (String method : List.of("PUT", "PATCH", "DELETE", "HEAD", "OPTIONS")) {
            Result m = run(http(method, "{\"method\":\"" + method + "\",\"endpoint\":\"/items\",\"login\":\"none\"}"));
            assertThat(m.error()).as(method).isNull();
            assertThat(to("/demo/items").getLast().method()).isEqualTo(method);
        }
    }

    @Test
    void h35_binary_bodies_and_the_size_limit() {
        byte[] png = {(byte) 0x89, 'P', 'N', 'G', 0, 0, (byte) 0xFF, (byte) 0xFE};
        routes.put("/demo/logo", ex -> reply(ex, 200, "image/png", png));
        Result bin = run(http("Logo", "{\"endpoint\":\"/logo\",\"login\":\"none\"}"));
        assertThat(bin.response().binary()).isTrue();
        assertThat(bin.response().text()).isNull();
        assertThat(Base64.getDecoder().decode(bin.response().base64())).isEqualTo(png);

        byte[] big = "x".repeat(1024 * 1024 + 500).getBytes(StandardCharsets.UTF_8);
        routes.put("/demo/big", ex -> reply(ex, 200, "text/plain", big));
        configure("http://127.0.0.1:" + port + "/demo/", 30, 1);
        Result cut = run(http("Grande", "{\"endpoint\":\"/big\",\"login\":\"none\"}"));
        assertThat(cut.response().truncated()).isTrue();
        assertThat(cut.response().text()).hasSize(1024 * 1024);
        assertThat(cut.response().size()).isEqualTo(big.length);
    }

    @Test
    void h41_redirects_are_not_followed() {
        routes.put("/demo/old", ex -> {
            ex.getResponseHeaders().add("Location", "http://example.org/");
            reply(ex, 302, null, new byte[0]);
        });
        Result r = run(http("Redirige", "{\"endpoint\":\"/old\",\"login\":\"none\"}"));
        assertThat(r.response().status()).isEqualTo(302);
        assertThat(r.response().statusText()).isEqualTo("Found");
        assertThat(received).hasSize(1);
    }

    @Test
    void a04_a05_runs_the_saved_version_of_an_http_note() {
        Note n = http("Tareas", "{\"endpoint\":\"/user/5/tasks\",\"login\":\"none\"}");
        assertThatThrownBy(() -> runner.execute(n.id(), n.version() - 1, "x")).isInstanceOf(ApiError.class)
                .satisfies(e -> assertThat(((ApiError) e).status()).isEqualTo(409));
        Note md = notes.create(null, "md", "Texto");
        assertThatThrownBy(() -> runner.execute(md.id(), md.version(), "x")).isInstanceOf(ApiError.class)
                .hasMessageContaining("no es una nota HTTP");
        Note broken = http("Rota", "{no es json");
        assertThatThrownBy(() -> run(broken)).isInstanceOf(ApiError.class).hasMessageContaining("no es válido");
    }

    // --- Credenciales y registro (H-21, H-42) ---

    @Test
    void h21_password_lives_only_in_a_private_file() throws Exception {
        Path file = dir.resolve("config/http.json");
        assertThat(Files.readString(file)).contains(PASSWORD);
        if (file.getFileSystem().supportedFileAttributeViews().contains("posix")) {
            assertThat(PosixFilePermissions.toString(Files.getPosixFilePermissions(file))).isEqualTo("rw-------");
        }
        run(http("Tareas", "{\"endpoint\":\"/user/5/tasks\"}"));
        store.close();
        for (Path p : List.of(dir.resolve("litedd.db"), dir.resolve("litedd.db-wal"))) {
            if (Files.exists(p)) {
                assertThat(new String(Files.readAllBytes(p), StandardCharsets.ISO_8859_1)).as(p.toString()).doesNotContain(PASSWORD);
            }
        }
        store = Store.open(dir.resolve("litedd.db"), dir.resolve("backups"));
        credentials.setPassword("");
        assertThat(credentials.password()).isEmpty();
        assertThat(file).doesNotExist();
    }

    @Test
    void h21_h30_api_routes_never_return_the_password() throws Exception {
        String token = "test-token-0123456789abcdefghijklmnop";
        int apiPort;
        try (ServerSocket s = new ServerSocket(0)) {
            apiPort = s.getLocalPort();
        }
        dev.litedd.http.HttpServer api = new dev.litedd.http.HttpServer(apiPort, token, List.of(new HttpApi(runner, credentials))).start();
        try {
            java.net.http.HttpClient client = java.net.http.HttpClient.newHttpClient();
            java.util.function.BiFunction<String, String, java.net.http.HttpResponse<String>> call = (path, body) -> {
                try {
                    var b = java.net.http.HttpRequest.newBuilder(java.net.URI.create("http://127.0.0.1:" + apiPort + path))
                            .header("X-LiteDD-Token", token).header("Content-Type", "application/json");
                    b = body == null ? b.GET() : b.method(path.endsWith("credentials") ? "PUT" : "POST",
                            java.net.http.HttpRequest.BodyPublishers.ofString(body));
                    return client.send(b.build(), java.net.http.HttpResponse.BodyHandlers.ofString());
                } catch (Exception e) {
                    throw new IllegalStateException(e);
                }
            };
            assertThat(call.apply("/api/http/credentials", null).body()).isEqualTo("{\"hasPassword\":true}");
            assertThat(call.apply("/api/http/credentials", "{\"password\":\"nueva-clave\"}").body()).doesNotContain("nueva-clave");
            assertThat(credentials.password()).contains("nueva-clave");

            credentials.setPassword(PASSWORD);
            Note n = http("Tareas", "{\"endpoint\":\"/user/{id}/tasks\",\"pathValues\":{\"id\":\"5\"}}");
            var r = call.apply("/api/http/execute", "{\"noteId\":\"" + n.id() + "\",\"version\":" + n.version() + ",\"executionId\":\"x1\"}");
            assertThat(r.statusCode()).isEqualTo(200);
            assertThat(JSON.readTree(r.body()).get("response").get("status").asInt()).isEqualTo(200);
            assertThat(r.body()).doesNotContain(PASSWORD);
            assertThat(call.apply("/api/http/execute", "{\"noteId\":\"" + n.id() + "\"}").statusCode()).isEqualTo(400);
            assertThat(call.apply("/api/http/cancel", "{\"executionId\":\"nada\"}").body()).isEqualTo("{\"cancelled\":false}");
        } finally {
            api.stop();
        }
    }

    @Test
    void h42_log_has_no_bodies_headers_cookies_users_or_passwords() {
        Logger root = (Logger) LoggerFactory.getLogger(org.slf4j.Logger.ROOT_LOGGER_NAME);
        Logger appLog = (Logger) LoggerFactory.getLogger("dev.litedd");
        Level previous = appLog.getLevel();
        ListAppender<ILoggingEvent> appender = new ListAppender<>();
        appender.start();
        root.addAppender(appender);
        try {
            appLog.setLevel(Level.DEBUG);
            run(http("Tareas", "{\"endpoint\":\"/user/5/tasks\"}"));
            assertThat(appender.list).isNotEmpty();
            for (String secret : List.of(PASSWORD, "demo", "csrf-abc", "sesion-1", "Tarea", "Login success", "usr-4711")) {
                assertThat(appender.list).as(secret).noneMatch(e -> e.getFormattedMessage().contains(secret));
            }
        } finally {
            root.detachAppender(appender);
            appLog.setLevel(previous);
        }
    }
}
