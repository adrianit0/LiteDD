package dev.litedd.httpnotes;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpsConfigurator;
import com.sun.net.httpserver.HttpsServer;
import dev.litedd.http.ApiError;
import dev.litedd.httpnotes.HttpRunner.ProfileSummary;
import dev.litedd.httpnotes.HttpRunner.Result;
import dev.litedd.notes.Note;
import dev.litedd.notes.NoteService;
import dev.litedd.settings.AppConfig;
import dev.litedd.settings.AppConfig.Profile;
import dev.litedd.settings.AppSettings;
import dev.litedd.settings.SettingsApi;
import dev.litedd.store.Store;
import dev.litedd.transfer.Backups;
import dev.litedd.transfer.Exporter;
import org.assertj.core.api.ThrowableAssert.ThrowingCallable;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.slf4j.LoggerFactory;

import javax.net.ssl.SSLContext;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicReference;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.catchThrowable;

/**
 * Entornos de preproducción en las notas HTTP (H-60 a H-69, ADR-0028): perfiles, CA corporativa y clave de
 * confirmación, contra un servidor falso HTTP para Local y otro HTTPS para el entorno de preproducción.
 */
class HttpProfilesTest {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final String LOCAL = Profile.LOCAL_ID;
    private static final String LOCAL_PASSWORD = "clave-local-de-prueba";
    private static final String PRE_PASSWORD = "clave-pre-de-prueba";
    private static final String CONFIRM_KEY = "confirmo-el-envio";
    /** S-32: nombre inventado. Las pruebas que conectan usan localhost, con un certificado para localhost. */
    private static final String PRE_HOST = "pre1.litedd-demo.test";

    @TempDir
    static Path certificateDir;
    static TestCertificates certificates;

    @TempDir
    Path dir;
    Store store;
    NoteService notes;
    HttpCredentials credentials;
    CorporateCa ca;
    AtomicReference<AppConfig> config = new AtomicReference<>();
    HttpRunner runner;
    com.sun.net.httpserver.HttpServer local;
    HttpsServer pre;
    /** Peticiones recibidas: servidor, método y ruta, por ejemplo «pre GET /demo/user/5/tasks». */
    List<String> received = new CopyOnWriteArrayList<>();
    Note loginNote;
    Note tasks;

    @BeforeAll
    static void generateCertificates() throws Exception {
        certificates = TestCertificates.generate(certificateDir, PRE_HOST);
    }

    @BeforeEach
    void start() throws Exception {
        store = Store.open(dir.resolve("litedd.db"), dir.resolve("backups"));
        notes = new NoteService(store);
        credentials = new HttpCredentials(dir.resolve("config/http.json"));
        credentials.setPassword(LOCAL, LOCAL_PASSWORD);
        credentials.setPassword("pre1", PRE_PASSWORD);
        ca = new CorporateCa(dir.resolve("config/http-ca.pem"));
        local = com.sun.net.httpserver.HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        local.createContext("/", ex -> handle(ex, "local", "ana", LOCAL_PASSWORD));
        local.start();
        startPre(TestCertificates.VALID);
        loginNote = http("Login", "{\"method\":\"GET\",\"endpoint\":\"/users/#{userName}/login\"}");
        tasks = http("Tareas", "{\"endpoint\":\"/user/5/tasks\"}");
        configure(true, false, false);
        runner = new HttpRunner(notes, config::get, credentials, new HttpCaller(ca));
    }

    @AfterEach
    void stop() {
        local.stop(0);
        pre.stop(0);
        store.close();
    }

    /** Servidor del entorno de preproducción con el certificado del alias. */
    private void startPre(String alias) throws Exception {
        if (pre != null) {
            pre.stop(0);
        }
        pre = HttpsServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        pre.setHttpsConfigurator(new HttpsConfigurator(certificates.server(alias)));
        pre.createContext("/", ex -> handle(ex, "pre", "pre-ana", PRE_PASSWORD));
        pre.start();
    }

    /** El login de la aplicación en cada servidor, con su usuario y su contraseña; el resto responde una lista o redirige. */
    private void handle(HttpExchange ex, String server, String user, String password) throws IOException {
        ex.getRequestBody().readAllBytes();
        String path = ex.getRequestURI().getPath();
        received.add(server + " " + ex.getRequestMethod() + " " + path);
        if (path.equals("/demo/users/" + user + "/login")) {
            String expected = "Basic " + Base64.getEncoder().encodeToString((user + ":" + password).getBytes(StandardCharsets.UTF_8));
            if (!expected.equals(ex.getRequestHeaders().getFirst("Authorization"))) {
                reply(ex, 401, "{\"message\":\"Bad credentials\"}");
                return;
            }
            ex.getResponseHeaders().add("X-USERID", server + "-usr");
            ex.getResponseHeaders().add("Set-Cookie", "CSRF-TOKEN=" + server + "-csrf; Path=/");
            reply(ex, 200, "{\"message\":\"Login success\"}");
        } else if (path.equals("/demo/user/5/tasks")) {
            reply(ex, 200, "[{\"servidor\":\"" + server + "\"}]");
        } else if (path.equals("/demo/old")) {
            ex.getResponseHeaders().add("Location", "https://example.org/");
            ex.sendResponseHeaders(302, -1);
            ex.close();
        } else {
            reply(ex, 404, "{}");
        }
    }

    private static void reply(HttpExchange ex, int status, String body) throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        ex.getResponseHeaders().add("Content-Type", "application/json");
        ex.sendResponseHeaders(status, bytes.length);
        try (var out = ex.getResponseBody()) {
            out.write(bytes);
        }
    }

    /** Local por http y PRE1 por https a localhost, cada uno con su usuario; PRE1 pide la CA corporativa. */
    private void configure(boolean preproduction, boolean localKey, boolean preKey) {
        configure(preproduction, localKey, preKey, true);
    }

    private void configure(boolean preproduction, boolean localKey, boolean preKey, boolean preCa) {
        config.set(new AppConfig(20, 10_000, 30, 47600, null, true, new AppConfig.Http(preproduction, List.of(
                new Profile(LOCAL, "Local", "http://127.0.0.1:" + local.getAddress().getPort() + "/demo/", "ana", localKey, false),
                new Profile("pre1", "PRE1", "https://localhost:" + pre.getAddress().getPort() + "/demo/", "pre-ana", preKey, preCa)),
                loginNote.id(), 30, 10, null, null, null)));
    }

    private Note http(String title, String content) {
        Note n = notes.create(null, "http", title);
        return notes.save(n.id(), title, content, n.version());
    }

    private Result run(Note n) {
        return run(n, null);
    }

    private Result run(Note n, String key) {
        return runner.execute(n.id(), notes.get(n.id()).version(), "e-" + n.id(), runner.activeProfile().id(), key);
    }

    private static String code(ThrowingCallable call) {
        Throwable t = catchThrowable(call);
        assertThat(t).isInstanceOf(ApiError.class);
        return ((ApiError) t).body().code();
    }

    private static Profile pre(String base) {
        return new Profile("pre1", "PRE1", base, "", true, true);
    }

    // --- Perfiles y ajustes (H-60 a H-62, H-65) ---

    @Test
    void h60_h61_settings_and_password_from_before_profiles_become_the_local_profile() throws Exception {
        Path configFile = dir.resolve("antes/config.json");
        Files.createDirectories(configFile.getParent());
        Files.writeString(configFile, """
                {"defaultPageSize":20,"rowCap":10000,"queryTimeoutSeconds":30,"port":47600,
                 "http":{"baseUrl":"http://127.0.0.1:8080/demo/","user":"ana","loginNoteId":null,"timeoutSeconds":45}}""");
        Path httpFile = dir.resolve("antes/http.json");
        Files.writeString(httpFile, "{\"password\":\"" + LOCAL_PASSWORD + "\"}");

        AppSettings settings = new AppSettings(configFile);
        AppConfig.Http http = settings.get().http();
        assertThat(http.preproduction()).isFalse();
        assertThat(http.profiles()).containsExactly(new Profile(LOCAL, "Local", "http://127.0.0.1:8080/demo/", "ana", false, false));
        assertThat(http.timeoutSeconds()).isEqualTo(45);
        assertThat(new HttpCredentials(httpFile).password(LOCAL)).contains(LOCAL_PASSWORD);

        // Al guardar ya se escriben los perfiles, sin los campos antiguos.
        settings.update(settings.get());
        JsonNode saved = JSON.readTree(configFile.toFile()).get("http");
        assertThat(saved.has("baseUrl")).isFalse();
        assertThat(saved.get("profiles").get(0).get("id").asText()).isEqualTo(LOCAL);
        new HttpCredentials(httpFile).setPassword("pre1", PRE_PASSWORD);
        JsonNode stored = JSON.readTree(httpFile.toFile());
        assertThat(stored.has("password")).isFalse();
        assertThat(stored.get("passwords").get(LOCAL).asText()).isEqualTo(LOCAL_PASSWORD);
        assertThat(stored.get("passwords").get("pre1").asText()).isEqualTo(PRE_PASSWORD);
    }

    @Test
    void h60_h62_h65_local_is_fixed_and_profiles_are_validated() throws Exception {
        assertThat(AppConfig.DEFAULT.http().preproduction()).isFalse();
        assertThat(AppConfig.DEFAULT.http().profiles()).extracting(Profile::id).containsExactly(LOCAL);
        // Local siempre existe, va primero y se llama «Local».
        AppConfig.Http http = JSON.readValue("""
                {"preproduction":true,"profiles":[{"id":"pre1","name":" PRE1 ","baseUrl":"https://pre1.litedd-demo.test/"},
                 {"id":"local","name":"Otro nombre","baseUrl":"http://127.0.0.1:8080/"}]}""", AppConfig.Http.class);
        assertThat(http.profiles()).extracting(Profile::id).containsExactly(LOCAL, "pre1");
        assertThat(http.local().name()).isEqualTo("Local");
        assertThat(http.profiles().get(1).name()).isEqualTo("PRE1");
        new AppConfig(20, 10_000, 30, 47600, null, true, http).validate();
        // Propuesta C: sin el campo, Local no pide la clave y un entorno de preproducción sí.
        assertThat(http.local().requireKey()).isFalse();
        assertThat(http.profiles().get(1).requireKey()).isTrue();
        assertThat(JSON.readValue("{\"profiles\":[]}", AppConfig.Http.class).profiles()).extracting(Profile::id).containsExactly(LOCAL);

        for (String bad : List.of(
                "[{\"id\":\"pre1\",\"name\":\"\"}]",
                "[{\"id\":\"pre1\",\"name\":\"PRE\"},{\"id\":\"pre2\",\"name\":\"pre\"}]",
                "[{\"id\":\"pre1\",\"name\":\"local\"}]",
                "[{\"id\":\"pre1\",\"name\":\"A\"},{\"id\":\"pre1\",\"name\":\"B\"}]",
                "[{\"id\":\"pre 1\",\"name\":\"A\"}]",
                "[{\"id\":\"pre1\",\"name\":\"A\\nB\"}]",
                "[{\"id\":\"pre1\",\"name\":\"" + "x".repeat(61) + "\"}]",
                "[{\"id\":\"pre1\",\"name\":\"A\",\"baseUrl\":\"http://" + PRE_HOST + "/\"}]")) {
            AppConfig.Http h = JSON.readValue("{\"preproduction\":true,\"profiles\":" + bad + "}", AppConfig.Http.class);
            assertThatThrownBy(() -> new AppConfig(20, 10_000, 30, 47600, null, true, h).validate()).as(bad).isInstanceOf(ApiError.class);
        }
        AppConfig.Http plainHttp = new AppConfig.Http(true, List.of(Profile.local(null, ""), pre("http://" + PRE_HOST + "/")),
                null, 30, 10, null, null, null);
        assertThatThrownBy(() -> new AppConfig(20, 10_000, 30, 47600, null, true, plainHttp).validate())
                .isInstanceOf(ApiError.class).hasMessageContaining("PRE1").hasMessageContaining("https");
    }

    @Test
    void h62_h63_only_usable_profiles_can_be_chosen_and_disabling_goes_back_to_local() {
        assertThat(runner.activeProfile().id()).isEqualTo(LOCAL);
        assertThat(runner.selectProfile("pre1").name()).isEqualTo("PRE1");
        assertThat(runner.activeProfile().id()).isEqualTo("pre1");
        assertThat(code(() -> runner.selectProfile("no-existe"))).isEqualTo("unknown_profile");

        // Sin la casilla solo queda Local, pero los perfiles y sus contraseñas se conservan.
        configure(false, false, false);
        assertThat(runner.activeProfile().id()).isEqualTo(LOCAL);
        assertThat(code(() -> runner.selectProfile("pre1"))).isEqualTo("unknown_profile");
        assertThat(config.get().http().profiles()).extracting(Profile::id).contains("pre1");
        assertThat(credentials.password("pre1")).contains(PRE_PASSWORD);
    }

    @Test
    void h62_deleting_a_profile_deletes_its_password() {
        credentials.setPassword("pre2", "otra-clave");
        credentials.retainProfiles(Set.of(LOCAL, "pre1"));
        assertThat(credentials.password("pre2")).isEmpty();
        assertThat(credentials.password("pre1")).contains(PRE_PASSWORD);
        assertThat(credentials.password(LOCAL)).contains(LOCAL_PASSWORD);
        assertThat(credentials.profilesWithPassword()).containsExactlyInAnyOrder(LOCAL, "pre1");
    }

    @Test
    void h70_h71_the_order_and_the_ca_box_are_kept_in_config_json() throws Exception {
        Path configFile = dir.resolve("orden/config.json");
        Files.createDirectories(configFile.getParent());
        // Local va siempre primero; los entornos, en el orden recibido.
        AppConfig.Http http = JSON.readValue("""
                {"preproduction":true,"profiles":[{"id":"pre2","name":"PRE2","requireCa":false},
                 {"id":"local","name":"Local","requireCa":true},{"id":"pre1","name":"PRE1"}]}""", AppConfig.Http.class);
        assertThat(http.profiles()).extracting(Profile::id).containsExactly(LOCAL, "pre2", "pre1");
        // Sin el campo, un entorno pide la CA, como antes de existir la casilla; Local nunca.
        assertThat(http.profiles()).extracting(Profile::requireCa).containsExactly(false, false, true);

        AppSettings settings = new AppSettings(configFile);
        settings.update(new AppConfig(20, 10_000, 30, 47600, null, true, http));
        List<String> saved = new ArrayList<>();
        JSON.readTree(configFile.toFile()).get("http").get("profiles").forEach(p -> saved.add(p.get("id").asText()));
        assertThat(saved).containsExactly(LOCAL, "pre2", "pre1");
        assertThat(new AppSettings(configFile).get().http().profiles()).isEqualTo(http.profiles());
    }

    // --- Perfil activo (H-25, H-33, H-61, H-63) ---

    @Test
    void h61_h33_a_preproduction_call_uses_its_url_user_and_password_and_reports_the_profile() throws Exception {
        ca.importPem(certificates.caPem());
        Result atLocal = run(tasks);
        assertThat(atLocal.error()).isNull();
        assertThat(atLocal.profile()).isEqualTo(new ProfileSummary(LOCAL, "Local"));
        assertThat(atLocal.response().text()).isEqualTo("[{\"servidor\":\"local\"}]");

        runner.selectProfile("pre1");
        Result atPre = run(tasks);
        assertThat(atPre.error()).isNull();
        assertThat(atPre.profile()).isEqualTo(new ProfileSummary("pre1", "PRE1"));
        assertThat(atPre.request().url()).isEqualTo("https://localhost:" + pre.getAddress().getPort() + "/demo/user/5/tasks");
        assertThat(atPre.response().text()).isEqualTo("[{\"servidor\":\"pre\"}]");
        assertThat(received).containsSubsequence("pre GET /demo/users/pre-ana/login", "pre GET /demo/user/5/tasks");
    }

    @Test
    void h25_h63_changing_the_profile_drops_the_reusable_login() throws Exception {
        ca.importPem(certificates.caPem());
        Note reuse = http("Reutiliza", "{\"endpoint\":\"/user/5/tasks\",\"login\":\"reuse\"}");
        assertThat(run(tasks).error()).isNull();
        assertThat(run(reuse).error()).isNull();

        runner.selectProfile("pre1");
        assertThat(run(reuse).error().code()).isEqualTo("no_login");
        runner.selectProfile(LOCAL);
        assertThat(run(reuse).error().code()).isEqualTo("no_login");
        // Elegir el perfil que ya está activo no lo descarta.
        assertThat(run(tasks).error()).isNull();
        runner.selectProfile(LOCAL);
        assertThat(run(reuse).error()).isNull();
    }

    @Test
    void h63_a_call_for_a_profile_that_is_not_the_active_one_is_refused_without_connecting() {
        runner.selectProfile("pre1");
        assertThatThrownBy(() -> runner.execute(tasks.id(), tasks.version(), "x", LOCAL, null)).isInstanceOf(ApiError.class)
                .satisfies(e -> assertThat(((ApiError) e).status()).isEqualTo(409))
                .hasMessageContaining("PRE1");
        assertThat(received).isEmpty();
    }

    // --- CA corporativa y TLS (H-66 a H-68) ---

    @Test
    void h67_without_the_ca_nothing_is_sent() {
        runner.selectProfile("pre1");
        assertThat(ca.certificates()).isEmpty();
        assertThat(code(() -> run(tasks))).isEqualTo("no_ca");
        assertThat(received).isEmpty();
    }

    @Test
    void h66_the_ca_is_imported_from_pem_and_shows_subject_and_expiry() throws Exception {
        assertThat(code(() -> ca.importPem("no es un certificado"))).isEqualTo("invalid_ca");
        assertThat(code(() -> ca.importPem("-----BEGIN CERTIFICATE-----\nAAAA\n-----END CERTIFICATE-----\n"))).isEqualTo("invalid_ca");
        assertThat(ca.certificates()).isEmpty();

        List<CorporateCa.Info> imported = ca.importPem("Texto antes del bloque\n" + certificates.caPem());
        assertThat(imported).singleElement().satisfies(c -> {
            assertThat(c.subject()).contains("CN=LiteDD Demo CA");
            assertThat(Instant.parse(c.notAfter())).isAfter(Instant.now());
        });
        assertThat(Files.readString(dir.resolve("config/http-ca.pem"))).startsWith("-----BEGIN CERTIFICATE-----");
        // Otra instancia la lee del fichero.
        assertThat(new CorporateCa(dir.resolve("config/http-ca.pem")).certificates()).isEqualTo(imported);
    }

    @Test
    void h66_h67_only_certificates_signed_by_the_imported_ca_and_for_the_host_are_accepted() throws Exception {
        ca.importPem(certificates.caPem());
        runner.selectProfile("pre1");
        assertThat(run(tasks).error()).isNull();

        startPre(TestCertificates.OTHER_CA);
        configure(true, false, false);
        received.clear();
        Result untrusted = run(tasks);
        assertThat(untrusted.phase()).isEqualTo("login");
        assertThat(untrusted.error().code()).isEqualTo("tls");
        assertThat(untrusted.error().message()).isEqualTo("Login: Error: el certificado de localhost no está firmado por la CA importada");
        assertThat(received).isEmpty();

        startPre(TestCertificates.OTHER_NAME);
        configure(true, false, false);
        Result otherName = run(tasks);
        assertThat(otherName.error().code()).isEqualTo("tls");
        assertThat(otherName.error().message()).isEqualTo("Login: Error: el certificado del servidor no es para localhost");
        assertThat(received).isEmpty();
    }

    @Test
    void h71_without_the_box_the_certificate_is_validated_against_the_java_trusted_cas() throws Exception {
        configure(true, false, false, false);
        runner.selectProfile("pre1");
        // Sin CA importada la llamada se intenta; el certificado de prueba no es de ninguna CA de Java.
        assertThat(ca.certificates()).isEmpty();
        Result untrusted = run(tasks);
        assertThat(untrusted.error().code()).isEqualTo("tls");
        assertThat(untrusted.error().message())
                .isEqualTo("Login: Error: el certificado de localhost no está firmado por una CA de confianza de Java");
        // La CA importada solo vale para los entornos que la piden.
        ca.importPem(certificates.caPem());
        assertThat(run(tasks).error().code()).isEqualTo("tls");
        assertThat(received).isEmpty();

        // Con la CA de prueba entre las de Java, la llamada se hace y el nombre del certificado se sigue comprobando.
        SSLContext previous = SSLContext.getDefault();
        SSLContext.setDefault(certificates.client());
        try {
            runner = new HttpRunner(notes, config::get, credentials, new HttpCaller(ca));
            runner.selectProfile("pre1");
            assertThat(run(tasks).error()).isNull();
            assertThat(received).contains("pre GET /demo/user/5/tasks");

            startPre(TestCertificates.OTHER_NAME);
            configure(true, false, false, false);
            received.clear();
            assertThat(run(tasks).error().message()).isEqualTo("Login: Error: el certificado del servidor no es para localhost");
            assertThat(received).isEmpty();
        } finally {
            SSLContext.setDefault(previous);
        }
    }

    @Test
    void h68_preproduction_calls_do_not_follow_redirects() throws Exception {
        ca.importPem(certificates.caPem());
        runner.selectProfile("pre1");
        Result r = run(http("Redirige", "{\"endpoint\":\"/old\",\"login\":\"none\"}"));
        assertThat(r.response().status()).isEqualTo(302);
        assertThat(received).containsExactly("pre GET /demo/old");
    }

    // --- Clave de confirmación (H-69) ---

    @Test
    void h69_the_key_is_stored_only_as_a_salted_hash() throws Exception {
        Path file = dir.resolve("config/http.json");
        credentials.setConfirmKey(CONFIRM_KEY);
        assertThat(credentials.hasConfirmKey()).isTrue();
        assertThat(Files.readString(file)).doesNotContain(CONFIRM_KEY).contains("confirmKey");
        String firstHash = JSON.readTree(file.toFile()).get("confirmKey").get("hash").asText();
        assertThat(credentials.confirmKeyMatches(CONFIRM_KEY)).isTrue();
        assertThat(credentials.confirmKeyMatches("otra")).isFalse();
        assertThat(credentials.confirmKeyMatches("")).isFalse();
        assertThat(credentials.confirmKeyMatches(null)).isFalse();
        // La misma clave con otra sal da otro hash.
        credentials.setConfirmKey(CONFIRM_KEY);
        JsonNode stored = JSON.readTree(file.toFile()).get("confirmKey");
        assertThat(stored.get("hash").asText()).isNotEqualTo(firstHash);
        assertThat(stored.get("iterations").asInt()).isEqualTo(HttpCredentials.ITERATIONS);
        // Cambiar una contraseña no toca la clave.
        credentials.setPassword("pre1", "nueva");
        assertThat(credentials.confirmKeyMatches(CONFIRM_KEY)).isTrue();
        credentials.setConfirmKey("");
        assertThat(credentials.hasConfirmKey()).isFalse();
        assertThat(credentials.confirmKeyMatches(CONFIRM_KEY)).isFalse();
    }

    @Test
    void h69_a_profile_with_the_box_asks_for_the_key_on_every_call_before_connecting() throws Exception {
        ca.importPem(certificates.caPem());
        configure(true, false, true);
        runner.selectProfile("pre1");

        assertThat(code(() -> run(tasks, CONFIRM_KEY))).isEqualTo("confirm_key_missing");
        credentials.setConfirmKey(CONFIRM_KEY);
        assertThat(code(() -> run(tasks))).isEqualTo("confirm_key_required");
        assertThat(code(() -> run(tasks, "no-es-esta"))).isEqualTo("confirm_key_wrong");
        assertThat(received).isEmpty();

        // Una entrada vale para el login y la llamada; la siguiente llamada la vuelve a pedir.
        assertThat(run(tasks, CONFIRM_KEY).error()).isNull();
        assertThat(received).containsExactly("pre GET /demo/users/pre-ana/login", "pre GET /demo/user/5/tasks");
        assertThat(code(() -> run(tasks))).isEqualTo("confirm_key_required");
        // También al ejecutar la propia nota de login.
        assertThat(code(() -> run(loginNote))).isEqualTo("confirm_key_required");
        assertThat(run(loginNote, CONFIRM_KEY).error()).isNull();
    }

    @Test
    void h69_local_can_ask_for_the_key_too() {
        credentials.setConfirmKey(CONFIRM_KEY);
        assertThat(run(tasks).error()).isNull();
        configure(true, true, false);
        assertThat(code(() -> run(tasks))).isEqualTo("confirm_key_required");
        assertThat(run(tasks, CONFIRM_KEY).error()).isNull();
    }

    // --- API (H-21, H-62, H-63, H-66, H-69, S-21) ---

    @Test
    void h21_h62_h63_h69_s21_api_never_returns_secrets_and_deleting_a_profile_deletes_its_password() throws Exception {
        String token = "test-token-0123456789abcdefghijklmnop";
        int apiPort = freePort();
        AppSettings settings = new AppSettings(dir.resolve("config/config.json"));
        settings.update(config.get());
        HttpRunner apiRunner = new HttpRunner(notes, settings::get, credentials, new HttpCaller(ca));
        dev.litedd.http.HttpServer api = new dev.litedd.http.HttpServer(apiPort, token, List.of(
                new SettingsApi(store, settings, c -> credentials.retainProfiles(c.http().profileIds())),
                new HttpApi(apiRunner, credentials, ca, settings::get))).start();
        try {
            Client c = new Client(apiPort, token);
            assertThat(c.send("GET", "/api/http/credentials", null).body())
                    .isEqualTo("{\"passwords\":{\"local\":true,\"pre1\":true},\"hasConfirmKey\":false}");
            assertThat(c.send("PUT", "/api/http/credentials", "{\"profileId\":\"pre1\",\"password\":\"nueva-clave-pre\"}").body())
                    .doesNotContain("nueva-clave-pre");
            assertThat(credentials.password("pre1")).contains("nueva-clave-pre");
            assertThat(c.send("PUT", "/api/http/credentials", "{\"profileId\":\"no-existe\",\"password\":\"x\"}").statusCode()).isEqualTo(400);

            assertThat(c.send("PUT", "/api/http/confirm-key", "{\"key\":\"" + CONFIRM_KEY + "\"}").body())
                    .isEqualTo("{\"hasConfirmKey\":true}");

            assertThat(c.send("GET", "/api/http/ca", null).body()).isEqualTo("{\"certificates\":[]}");
            JsonNode imported = JSON.readTree(c.send("PUT", "/api/http/ca", JSON.writeValueAsString(Map.of("pem", certificates.caPem()))).body());
            assertThat(imported.get("certificates").get(0).get("subject").asText()).contains("CN=LiteDD Demo CA");
            assertThat(c.send("PUT", "/api/http/ca", "{\"pem\":\"nada\"}").statusCode()).isEqualTo(400);

            assertThat(c.send("GET", "/api/http/profile", null).body()).isEqualTo("{\"active\":\"local\"}");
            assertThat(c.send("PUT", "/api/http/profile", "{\"id\":\"pre1\"}").body()).isEqualTo("{\"active\":\"pre1\"}");
            assertThat(c.send("PUT", "/api/http/profile", "{\"id\":\"no-existe\"}").statusCode()).isEqualTo(400);

            String execute = "{\"noteId\":\"" + tasks.id() + "\",\"version\":" + tasks.version() + ",\"executionId\":\"x1\",\"profileId\":\"%s\"}";
            assertThat(c.send("POST", "/api/http/execute", execute.formatted(LOCAL)).statusCode()).isEqualTo(409);
            HttpResponse<String> ok = c.send("POST", "/api/http/execute", execute.formatted("pre1"));
            assertThat(ok.statusCode()).isEqualTo(200);
            assertThat(JSON.readTree(ok.body()).get("profile").get("name").asText()).isEqualTo("PRE1");
            assertThat(ok.body()).doesNotContain("nueva-clave-pre").doesNotContain(CONFIRM_KEY);
            assertThat(c.send("POST", "/api/http/execute", "{\"noteId\":\"" + tasks.id() + "\",\"version\":" + tasks.version() + "}")
                    .statusCode()).isEqualTo(400);

            // Quitar el perfil en «Ajustes» borra su contraseña y vuelve a Local.
            AppConfig without = new AppConfig(20, 10_000, 30, 47600, null, true, new AppConfig.Http(true,
                    List.of(config.get().http().local()), loginNote.id(), 30, 10, null, null, null));
            assertThat(c.send("PUT", "/api/settings", JSON.writeValueAsString(Map.of("config", without))).statusCode()).isEqualTo(200);
            assertThat(credentials.password("pre1")).isEmpty();
            assertThat(c.send("GET", "/api/http/profile", null).body()).isEqualTo("{\"active\":\"local\"}");
            assertThat(c.send("GET", "/api/http/credentials", null).body())
                    .isEqualTo("{\"passwords\":{\"local\":true},\"hasConfirmKey\":true}");
        } finally {
            api.stop();
        }
    }

    // --- Datos (H-64, S-20, H-42) ---

    @Test
    void h64_s20_h42_no_password_key_or_profile_reaches_the_database_backups_export_or_log() throws Exception {
        ca.importPem(certificates.caPem());
        credentials.setConfirmKey(CONFIRM_KEY);
        configure(true, false, true);
        runner.selectProfile("pre1");

        Logger root = (Logger) LoggerFactory.getLogger(org.slf4j.Logger.ROOT_LOGGER_NAME);
        Logger appLog = (Logger) LoggerFactory.getLogger("dev.litedd");
        Level previous = appLog.getLevel();
        ListAppender<ILoggingEvent> appender = new ListAppender<>();
        appender.start();
        root.addAppender(appender);
        try {
            appLog.setLevel(Level.DEBUG);
            assertThat(run(tasks, CONFIRM_KEY).error()).isNull();
        } finally {
            root.detachAppender(appender);
            appLog.setLevel(previous);
        }

        Path backup = new Backups(store, dir.resolve("backups"), Clock.systemDefaultZone()).backupNow();
        byte[] zip = new Exporter(store, Clock.systemDefaultZone()).export();
        store.close();
        List<String> places = new ArrayList<>();
        for (Path p : List.of(dir.resolve("litedd.db"), dir.resolve("litedd.db-wal"), backup)) {
            if (Files.exists(p)) {
                places.add(new String(Files.readAllBytes(p), StandardCharsets.ISO_8859_1));
            }
        }
        try (ZipInputStream in = new ZipInputStream(new ByteArrayInputStream(zip))) {
            for (ZipEntry e = in.getNextEntry(); e != null; e = in.getNextEntry()) {
                places.add(new String(in.readAllBytes(), StandardCharsets.UTF_8));
            }
        }
        appender.list.forEach(e -> places.add(e.getFormattedMessage()));
        store = Store.open(dir.resolve("litedd.db"), dir.resolve("backups"));

        for (String secret : List.of(LOCAL_PASSWORD, PRE_PASSWORD, CONFIRM_KEY, "PRE1", "pre-ana",
                "localhost:" + pre.getAddress().getPort())) {
            assertThat(places).as(secret).noneMatch(text -> text.contains(secret));
        }
    }

    private static int freePort() throws IOException {
        try (ServerSocket s = new ServerSocket(0)) {
            return s.getLocalPort();
        }
    }

    private record Client(int port, String token) {
        HttpResponse<String> send(String method, String path, String body) throws Exception {
            HttpRequest request = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + path))
                    .header("X-LiteDD-Token", token).header("Content-Type", "application/json")
                    .method(method, body == null ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofString(body))
                    .build();
            return HttpClient.newHttpClient().send(request, HttpResponse.BodyHandlers.ofString());
        }
    }
}
