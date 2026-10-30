package dev.litedd.update;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.litedd.http.ApiError;
import dev.litedd.http.HttpServer;
import dev.litedd.update.UpdateClient.Reply;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.net.ServerSocket;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class UpdaterTest {

    private static final String REPOSITORY = "https://github.com/demo/app";
    private static final String LATEST = REPOSITORY + "/releases/latest/download/";
    private static final byte[] NEW_JAR = "jar nuevo".getBytes(StandardCharsets.UTF_8);
    private static final String TOKEN = "test-token-0123456789abcdefghijklmnop";

    static KeyPair keys;

    @TempDir
    Path dir;

    private final Map<URI, byte[]> files = new HashMap<>();
    private final List<URI> connected = new ArrayList<>();
    private final AtomicReference<String> repository = new AtomicReference<>(REPOSITORY);
    private final AtomicInteger restarts = new AtomicInteger();
    private final AtomicInteger exits = new AtomicInteger();
    private HttpServer server;

    private final UpdateClient client = new UpdateClient((uri, timeout) -> {
        connected.add(uri);
        byte[] body = files.get(uri);
        if (body == null) {
            return new Reply(404, null, new ByteArrayInputStream(new byte[0]));
        }
        return new Reply(200, null, new ByteArrayInputStream(body));
    });

    @BeforeAll
    static void generateKeys() throws Exception {
        keys = KeyPairGenerator.getInstance("Ed25519").generateKeyPair();
    }

    @AfterEach
    void stop() {
        if (server != null) {
            server.stop();
        }
    }

    private Path jar() {
        return dir.resolve("litedd.jar");
    }

    private Updater updater(long build, String problem) {
        return new Updater(repository::get, client, "0.1.0", build, "abc", keys.getPublic(), jar(), problem, restarts::incrementAndGet);
    }

    private void publish(long build, byte[] jar, byte[] signatureOverride) throws Exception {
        String json = """
                {"build": %d, "version": "0.1.0", "commit": "0123456", "date": "2026-11-02T10:15:00Z",
                 "size": %d, "sha256": "%s", "commits": ["Cambio"]}
                """.formatted(build, jar.length, HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(jar)));
        byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
        files.put(URI.create(LATEST + "latest.json"), bytes);
        files.put(URI.create(LATEST + "latest.json.sig"), signatureOverride != null ? signatureOverride : UpdateManifestTest.sign(keys, bytes));
        files.put(URI.create(REPOSITORY + "/releases/download/build-" + build + "/litedd.jar"), jar);
    }

    private static void assertCode(Runnable call, String code) {
        assertThatThrownBy(call::run).isInstanceOfSatisfying(ApiError.class, e -> assertThat(e.body().code()).isEqualTo(code));
    }

    // --- Búsqueda ---

    @Test
    void r12_nothing_connects_until_a_button_is_pressed() {
        updater(5, null).status();
        assertThat(connected).isEmpty();
    }

    @Test
    void r11_without_a_saved_url_the_calls_are_rejected_without_connecting() {
        repository.set(null);
        Updater updater = updater(5, null);
        assertCode(updater::check, "update_not_configured");
        assertCode(() -> updater.apply(6), "update_not_configured");
        assertThat(connected).isEmpty();
    }

    @Test
    void r14_where_it_is_not_available_the_calls_are_rejected_without_connecting() {
        Updater updater = updater(5, "motivo");
        assertThat(updater.status().available()).isFalse();
        assertThat(updater.status().reason()).isEqualTo("motivo");
        assertCode(updater::check, "update_unavailable");
        assertCode(() -> updater.apply(6), "update_unavailable");
        assertThat(connected).isEmpty();
    }

    @Test
    void r13_offers_a_newer_build() throws Exception {
        publish(6, NEW_JAR, null);
        Updater.Check check = updater(5, null).check();
        assertThat(check.newer()).isTrue();
        assertThat(check.latest().build()).isEqualTo(6);
        assertThat(check.latest().commits()).containsExactly("Cambio");
    }

    @Test
    void r13_r31_the_same_build_is_not_newer() throws Exception {
        publish(5, NEW_JAR, null);
        assertThat(updater(5, null).check().newer()).isFalse();
    }

    @Test
    void r31_an_older_signed_build_is_not_offered_and_cannot_be_applied() throws Exception {
        publish(4, NEW_JAR, null);
        Updater updater = updater(5, null);
        assertThat(updater.check().newer()).isFalse();
        assertCode(() -> updater.apply(4), "update_stale");
    }

    @Test
    void r06_any_published_build_is_newer_than_a_handmade_jar() throws Exception {
        publish(1, NEW_JAR, null);
        assertThat(updater(0, null).check().newer()).isTrue();
    }

    @Test
    void r30_a_bad_signature_offers_nothing() throws Exception {
        publish(6, NEW_JAR, new byte[64]);
        Updater updater = updater(5, null);
        assertCode(updater::check, "update_signature");
        assertCode(() -> updater.apply(6), "update_stale");
    }

    @Test
    void r30_changing_the_url_does_not_change_who_is_trusted() throws Exception {
        // Una release de otro repositorio, firmada con otra clave.
        KeyPair other = KeyPairGenerator.getInstance("Ed25519").generateKeyPair();
        byte[] json = "{\"build\": 9}".getBytes(StandardCharsets.UTF_8);
        repository.set("https://github.com/otro/app");
        files.put(URI.create("https://github.com/otro/app/releases/latest/download/latest.json"), json);
        files.put(URI.create("https://github.com/otro/app/releases/latest/download/latest.json.sig"), UpdateManifestTest.sign(other, json));
        Updater updater = updater(5, null);
        assertCode(updater::check, "update_signature");
    }

    // --- Instalación ---

    @Test
    void r42_r43_downloads_next_to_the_jar_and_then_restarts() throws Exception {
        publish(6, NEW_JAR, null);
        Files.writeString(jar(), "jar actual");
        Updater updater = updater(5, null);
        updater.check();
        updater.apply(6);
        assertThat(Files.readAllBytes(dir.resolve("litedd.jar.new"))).isEqualTo(NEW_JAR);
        assertThat(Files.readString(jar())).isEqualTo("jar actual");
        assertThat(restarts.get()).isEqualTo(1);
    }

    @Test
    void r32_a_jar_with_another_hash_leaves_everything_as_it_was() throws Exception {
        publish(6, NEW_JAR, null);
        files.put(URI.create(REPOSITORY + "/releases/download/build-6/litedd.jar"), "jar falso".getBytes(StandardCharsets.UTF_8));
        Files.writeString(jar(), "jar actual");
        Updater updater = updater(5, null);
        updater.check();
        assertCode(() -> updater.apply(6), "update_hash");
        assertThat(dir.resolve("litedd.jar.new")).doesNotExist();
        assertThat(Files.readString(jar())).isEqualTo("jar actual");
        assertThat(restarts.get()).isZero();
    }

    @Test
    void r33_only_the_build_of_the_last_verified_search_can_be_applied() throws Exception {
        publish(6, NEW_JAR, null);
        Updater updater = updater(5, null);
        assertCode(() -> updater.apply(6), "update_stale");
        updater.check();
        assertCode(() -> updater.apply(7), "update_stale");
        assertThat(restarts.get()).isZero();
        assertThat(connected).extracting(URI::toString).noneMatch(u -> u.endsWith("litedd.jar"));
    }

    @Test
    void r43_if_the_process_cannot_start_the_download_is_removed_and_nothing_changes() throws Exception {
        publish(6, NEW_JAR, null);
        Updater updater = new Updater(repository::get, client, "0.1.0", 5, "abc", keys.getPublic(), jar(), null, () -> {
            throw new IOException("sin sh");
        });
        updater.check();
        assertThatThrownBy(() -> updater.apply(6)).isInstanceOf(ApiError.class).hasMessageContaining("sin sh");
        assertThat(dir.resolve("litedd.jar.new")).doesNotExist();
    }

    // --- Disponibilidad ---

    private Path file(String relative) throws IOException {
        Path path = dir.resolve(relative);
        Files.createDirectories(path.getParent());
        Files.writeString(path, "x");
        path.toFile().setExecutable(true);
        return path;
    }

    @Test
    void r14_finds_the_launcher_of_a_jpackage_image() throws Exception {
        Path jar = file("litedd/lib/app/litedd.jar");
        Path launcher = file("litedd/bin/litedd");
        assertThat(Installation.of(jar)).contains(new Installation(jar, launcher));
    }

    @Test
    void r14_finds_the_launcher_of_a_jar_run_with_the_system_java() throws Exception {
        Path jar = file("litedd/lib/litedd.jar");
        Path launcher = file("litedd/bin/litedd");
        assertThat(Installation.of(jar)).contains(new Installation(jar, launcher));
    }

    @Test
    void r14_development_classes_or_a_loose_jar_are_not_an_installation() throws Exception {
        assertThat(Installation.of(dir)).isEmpty();
        assertThat(Installation.of(file("suelto/litedd.jar"))).isEmpty();
    }

    @Test
    void r14_says_why_it_is_not_available() throws Exception {
        Path jar = file("litedd/lib/litedd.jar");
        Installation installation = new Installation(jar, file("litedd/bin/litedd"));
        assertThat(Updater.problem(false, Optional.of(installation), keys.getPublic())).contains("Ubuntu");
        assertThat(Updater.problem(true, Optional.empty(), keys.getPublic())).contains("instalación");
        assertThat(Updater.problem(true, Optional.of(installation), null)).contains("clave");
        assertThat(Updater.problem(true, Optional.of(installation), keys.getPublic())).isNull();
    }

    // --- API ---

    private HttpResponse<String> call(String method, String path, String body, boolean token) throws Exception {
        HttpRequest.Builder b = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + server.port() + path))
                .method(method, body == null ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofString(body));
        if (token) {
            b.header("X-LiteDD-Token", TOKEN);
        }
        return HttpClient.newHttpClient().send(b.build(), HttpResponse.BodyHandlers.ofString());
    }

    private void startServer(Updater updater) throws Exception {
        int port;
        try (ServerSocket s = new ServerSocket(0)) {
            port = s.getLocalPort();
        }
        server = new HttpServer(port, TOKEN, List.of(new UpdateApi(updater, exits::incrementAndGet))).start();
    }

    @Test
    void r10_the_api_gives_the_installed_version() throws Exception {
        startServer(updater(5, null));
        JsonNode body = new ObjectMapper().readTree(call("GET", "/api/update", null, true).body());
        assertThat(body.get("version").asText()).isEqualTo("0.1.0");
        assertThat(body.get("build").asLong()).isEqualTo(5);
        assertThat(body.get("commit").asText()).isEqualTo("abc");
        assertThat(body.get("available").asBoolean()).isTrue();
    }

    @Test
    void s12_the_update_routes_require_the_token() throws Exception {
        startServer(updater(5, null));
        assertThat(call("GET", "/api/update", null, false).statusCode()).isEqualTo(403);
        assertThat(call("POST", "/api/update/check", null, false).statusCode()).isEqualTo(403);
        assertThat(call("POST", "/api/update/apply", "{\"build\": 6}", false).statusCode()).isEqualTo(403);
        assertThat(connected).isEmpty();
    }

    @Test
    void r13_the_api_returns_the_result_of_the_search() throws Exception {
        publish(6, NEW_JAR, null);
        startServer(updater(5, null));
        JsonNode body = new ObjectMapper().readTree(call("POST", "/api/update/check", null, true).body());
        assertThat(body.get("newer").asBoolean()).isTrue();
        assertThat(body.get("latest").get("build").asLong()).isEqualTo(6);
        assertThat(body.get("latest").get("commits").get(0).asText()).isEqualTo("Cambio");
    }

    @Test
    void r43_the_api_answers_and_then_shuts_down_in_order() throws Exception {
        publish(6, NEW_JAR, null);
        Updater updater = updater(5, null);
        startServer(updater);
        updater.check();
        HttpResponse<String> r = call("POST", "/api/update/apply", "{\"build\": 6}", true);
        assertThat(r.statusCode()).isEqualTo(200);
        assertThat(new ObjectMapper().readTree(r.body()).get("restarting").asBoolean()).isTrue();
        for (int i = 0; i < 100 && exits.get() == 0; i++) {
            Thread.sleep(20);
        }
        assertThat(exits.get()).isEqualTo(1);
    }

    @Test
    void r33_a_failed_apply_does_not_shut_down() throws Exception {
        startServer(updater(5, null));
        HttpResponse<String> r = call("POST", "/api/update/apply", "{\"build\": 6}", true);
        assertThat(r.statusCode()).isEqualTo(409);
        Thread.sleep(300);
        assertThat(exits.get()).isZero();
    }

    @Test
    void a02_apply_without_a_build_is_a_bad_request() throws Exception {
        startServer(updater(5, null));
        assertThat(call("POST", "/api/update/apply", "{}", true).statusCode()).isEqualTo(400);
    }
}
