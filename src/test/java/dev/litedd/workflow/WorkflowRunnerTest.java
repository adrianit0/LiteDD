package dev.litedd.workflow;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpExchange;
import dev.litedd.http.ApiError;
import dev.litedd.httpnotes.HttpCaller;
import dev.litedd.httpnotes.HttpCredentials;
import dev.litedd.httpnotes.HttpRunner;
import dev.litedd.mysql.FakeSqlRunner;
import dev.litedd.notes.Note;
import dev.litedd.notes.NoteService;
import dev.litedd.settings.AppConfig;
import dev.litedd.settings.AppConfig.Profile;
import dev.litedd.sqlengine.SqlEngine;
import dev.litedd.store.Store;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Ejecución de un workflow (W-30 a W-68) contra un servidor HTTP falso y un SQL simulado. */
class WorkflowRunnerTest {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final String PASSWORD = "secreto-de-prueba";
    private static final String LOCAL = Profile.LOCAL_ID;

    @TempDir
    Path dir;
    Store store;
    NoteService notes;
    HttpCredentials credentials;
    AtomicReference<AppConfig> config = new AtomicReference<>();
    HttpRunner http;
    FakeSqlRunner sql;
    WorkflowRunner runner;
    com.sun.net.httpserver.HttpServer server;
    String base;
    List<String[]> received = new CopyOnWriteArrayList<>();
    Map<String, Handler> routes = new ConcurrentHashMap<>();
    Note loginNote;
    Note tasks;
    Note echo;
    Note missing;

    interface Handler {
        void handle(HttpExchange ex, String body) throws IOException;
    }

    @BeforeEach
    void start() throws Exception {
        store = Store.open(dir.resolve("litedd.db"), dir.resolve("backups"));
        notes = new NoteService(store);
        credentials = new HttpCredentials(dir.resolve("config/http.json"));
        credentials.setPassword(LOCAL, PASSWORD);
        server = com.sun.net.httpserver.HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/", ex -> {
            String body = new String(ex.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
            received.add(new String[]{ex.getRequestURI().getPath(), body, ex.getRequestHeaders().getFirst("X-USERID")});
            Handler h = routes.get(ex.getRequestURI().getPath());
            if (h == null) {
                reply(ex, 404, "{\"error\":\"not found\"}");
            } else {
                h.handle(ex, body);
            }
        });
        server.setExecutor(Executors.newVirtualThreadPerTaskExecutor());
        server.start();
        base = "http://127.0.0.1:" + server.getAddress().getPort() + "/demo/";
        routes.put("/demo/users/demo/login", (ex, body) -> {
            String expected = "Basic " + Base64.getEncoder().encodeToString(("demo:" + PASSWORD).getBytes(StandardCharsets.UTF_8));
            if (!expected.equals(ex.getRequestHeaders().getFirst("Authorization"))) {
                reply(ex, 401, "{\"message\":\"Bad credentials\"}");
                return;
            }
            ex.getResponseHeaders().add("X-USERID", "usr-4711");
            ex.getResponseHeaders().add("Set-Cookie", "CSRF-TOKEN=csrf-abc; Path=/");
            reply(ex, 200, "{\"message\":\"Login success\"}");
        });
        routes.put("/demo/user/5/tasks", (ex, body) -> reply(ex, 200, "[{\"id\":1,\"title\":\"Tarea\"}]"));
        routes.put("/demo/echo", (ex, body) -> reply(ex, 200, body));
        loginNote = httpNote("Login", "{\"endpoint\":\"/users/#{userName}/login\"}");
        tasks = httpNote("Tareas", "{\"endpoint\":\"/user/#{id}/tasks\",\"login\":\"none\",\"pathValues\":{\"id\":\"5\"}}");
        echo = httpNote("Eco", "{\"method\":\"POST\",\"endpoint\":\"/echo\",\"login\":\"none\","
                + "\"body\":{\"mode\":\"raw\",\"rawType\":\"json\",\"raw\":\"{\\\"task\\\": #{t}, \\\"who\\\": \\\"#{w}\\\"}\"}}");
        missing = httpNote("Falta", "{\"endpoint\":\"/missing\",\"login\":\"none\"}");
        configure(List.of(Profile.local(base, "demo")), false);
        http = new HttpRunner(notes, config::get, credentials, new HttpCaller());
        sql = new FakeSqlRunner(List.of("col1", "col2", "col1"), List.of(List.of("1", "test", "X"), java.util.Arrays.asList("3", null, "Y")));
        runner = new WorkflowRunner(notes, http, sql, new SqlEngine(), Map::of);
    }

    @AfterEach
    void stop() {
        server.stop(0);
        store.close();
    }

    private static void reply(HttpExchange ex, int status, String body) throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        ex.getResponseHeaders().add("Content-Type", "application/json");
        ex.sendResponseHeaders(status, bytes.length == 0 ? -1 : bytes.length);
        try (var out = ex.getResponseBody()) {
            out.write(bytes);
        }
    }

    private void configure(List<Profile> profiles, boolean preproduction) {
        config.set(new AppConfig(20, 10_000, 30, 47600, null, true,
                new AppConfig.Http(preproduction, profiles, loginNote == null ? null : loginNote.id(), 30, 10, null, null, null)));
    }

    private Note httpNote(String title, String content) {
        Note n = notes.create(null, "http", title);
        return notes.save(n.id(), n.title(), content, n.version());
    }

    private Note sqlNote(String title, String content) {
        Note n = notes.create(null, "sql", title);
        return notes.save(n.id(), n.title(), content, n.version());
    }

    // --- Construcción de workflows lineales: Start → nodos → Finish ---

    private static String input(String id, String name, String... rows) {
        List<String> r = new ArrayList<>();
        for (int i = 0; i < rows.length; i += 2) {
            r.add("{\"name\":\"" + rows[i] + "\",\"value\":" + quote(rows[i + 1]) + "}");
        }
        return "{\"id\":\"" + id + "\",\"kind\":\"input\",\"name\":\"" + name + "\",\"rows\":[" + String.join(",", r) + "]}";
    }

    private static String node(String id, String kind, String name, Note note, Map<String, String> values) {
        try {
            return "{\"id\":\"" + id + "\",\"kind\":\"" + kind + "\",\"name\":\"" + name + "\",\"noteId\":\""
                    + (note == null ? "" : note.id()) + "\",\"values\":" + JSON.writeValueAsString(values) + "}";
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
    }

    private static String waitNode(String id, String name, String seconds) {
        return "{\"id\":\"" + id + "\",\"kind\":\"wait\",\"name\":\"" + name + "\",\"seconds\":" + quote(seconds) + "}";
    }

    private static String quote(String s) {
        try {
            return JSON.writeValueAsString(s);
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
    }

    private static String flow(String options, String... nodes) {
        List<String> ids = new ArrayList<>(List.of("start"));
        for (String n : nodes) {
            try {
                ids.add(JSON.readTree(n).get("id").asText());
            } catch (IOException e) {
                throw new IllegalStateException(e);
            }
        }
        ids.add("finish");
        List<String> edges = new ArrayList<>();
        for (int i = 0; i + 1 < ids.size(); i++) {
            edges.add("{\"from\":\"" + ids.get(i) + "\",\"to\":\"" + ids.get(i + 1) + "\"}");
        }
        return "{\"options\":" + options + ",\"nodes\":[{\"id\":\"start\",\"kind\":\"start\"}," + String.join(",", nodes)
                + (nodes.length == 0 ? "" : ",") + "{\"id\":\"finish\",\"kind\":\"finish\"}],\"edges\":[" + String.join(",", edges) + "]}";
    }

    private Note workflow(String content) {
        Note n = notes.create(null, "workflow", "Alta");
        return notes.save(n.id(), n.title(), content, n.version());
    }

    private List<JsonNode> run(Note wf, Map<String, Map<String, String>> tab) {
        return run(wf, tab, LOCAL, null);
    }

    private List<JsonNode> run(Note wf, Map<String, Map<String, String>> tab, String profileId, String key) {
        WorkflowRunner.Prepared p = runner.prepare(wf.id(), wf.version(), profileId, key, tab);
        List<JsonNode> events = new CopyOnWriteArrayList<>();
        runner.run(p, "e1", event -> events.add(JSON.valueToTree(event)));
        return events;
    }

    /** nodo:estado de los eventos finales de cada nodo. */
    private static List<String> statuses(List<JsonNode> events) {
        return events.stream().filter(e -> e.get("type").asText().equals("node") && !e.get("status").asText().equals("running"))
                .map(e -> e.get("nodeId").asText() + ":" + e.get("status").asText()).toList();
    }

    private static JsonNode nodeEvent(List<JsonNode> events, String nodeId) {
        return events.stream().filter(e -> e.get("type").asText().equals("node") && e.get("nodeId").asText().equals(nodeId)
                && !e.get("status").asText().equals("running")).findFirst().orElseThrow();
    }

    private static JsonNode end(List<JsonNode> events) {
        return events.getLast();
    }

    private List<String> bodies(String path) {
        return received.stream().filter(r -> r[0].equals(path)).map(r -> r[1]).toList();
    }

    /** Las rutas recibidas, en orden, con la cabecera X-USERID si la llevaban. */
    private List<String> calls() {
        return received.stream().map(r -> r[0] + (r[2] == null ? "" : " [" + r[2] + "]")).toList();
    }

    private static String login(String id, String name, String user) {
        return "{\"id\":\"" + id + "\",\"kind\":\"login\",\"name\":\"" + name + "\",\"values\":{\"user\":" + quote(user) + "}}";
    }

    // --- Pruebas ---

    @Test
    void w29_w69_the_login_node_logs_in_once_and_later_http_nodes_use_its_session() {
        Note asOther = httpNote("Como otro", "{\"endpoint\":\"/user/5/tasks\",\"user\":\"otro\"}");
        Note open = httpNote("Abierta", "{\"endpoint\":\"/echo\",\"method\":\"POST\",\"login\":\"none\"}");
        List<JsonNode> events = run(workflow(flow("{}",
                input("n1", "Input1", "user", "demo"),
                login("n2", "Login1", "$Input1.user"),
                node("n3", "http", "Conn1", asOther, Map.of()),
                node("n4", "http", "Conn2", tasks, Map.of("id", "5")),
                node("n5", "http", "Abierta", open, Map.of()))), Map.of());

        assertThat(statuses(events)).containsExactly("start:ok", "n1:ok", "n2:ok", "n3:ok", "n4:ok", "n5:ok", "finish:ok");
        // Un solo login, con el usuario del Input; la nota «Como otro» no hace el suyo. Las dos notas con «No necesita
        // login» («Tareas» y «Abierta») van sin sesión.
        assertThat(calls()).containsExactly("/demo/users/demo/login", "/demo/user/5/tasks [usr-4711]",
                "/demo/user/5/tasks", "/demo/echo");
        // W-32: el valor del Login es el cuerpo de su respuesta.
        assertThat(nodeEvent(events, "n2").get("http").get("response").get("status").asInt()).isEqualTo(200);
        // W-78: lo escrito y lo que entró.
        assertThat(nodeEvent(events, "n2").get("raw").get("user").asText()).isEqualTo("$Input1.user");
        assertThat(nodeEvent(events, "n2").get("values").get("user").asText()).isEqualTo("demo");
    }

    @Test
    void w69_the_execution_login_is_not_the_reusable_login_of_http_notes() {
        run(workflow(flow("{}", login("n1", "Login1", ""))), Map.of());
        assertThat(calls()).containsExactly("/demo/users/demo/login");
        Note reuse = httpNote("Reutiliza", "{\"endpoint\":\"/user/5/tasks\",\"login\":\"reuse\"}");
        assertThat(http.execute(reuse.id(), reuse.version(), "suelta", LOCAL, null).error().code()).isEqualTo("no_login");
    }

    @Test
    void w69_http_nodes_before_the_first_login_log_in_as_always() {
        Note withLogin = httpNote("Con login", "{\"endpoint\":\"/user/5/tasks\"}");
        run(workflow(flow("{}", node("n1", "http", "Conn1", withLogin, Map.of()), login("n2", "Login1", ""))), Map.of());
        assertThat(calls()).containsExactly("/demo/users/demo/login", "/demo/user/5/tasks [usr-4711]", "/demo/users/demo/login");
    }

    @Test
    void w42_w69_a_failed_login_blocks_the_http_nodes_that_need_it_until_another_login() {
        Note withLogin = httpNote("Con login", "{\"endpoint\":\"/user/5/tasks\"}");
        Note open = httpNote("Abierta", "{\"endpoint\":\"/echo\",\"method\":\"POST\",\"login\":\"none\"}");
        List<JsonNode> events = run(workflow(flow("{\"stopOnError\":false}",
                login("n1", "Login1", "otro"),
                node("n2", "http", "Conn1", withLogin, Map.of()),
                node("n3", "http", "Abierta", open, Map.of()),
                login("n4", "Login2", "demo"),
                node("n5", "http", "Conn2", withLogin, Map.of()))), Map.of());

        assertThat(statuses(events)).containsExactly("start:ok", "n1:error", "n2:error", "n3:ok", "n4:ok", "n5:ok", "finish:ok");
        assertThat(nodeEvent(events, "n1").get("error").get("code").asText()).isEqualTo("login_failed");
        assertThat(nodeEvent(events, "n2").get("error").get("message").asText()).isEqualTo("El login de «Login1» falló: no se envía");
        assertThat(calls()).containsExactly("/demo/users/otro/login", "/demo/echo", "/demo/users/demo/login",
                "/demo/user/5/tasks [usr-4711]");
        assertThat(end(events).get("message").asText()).isEqualTo("Terminado con 2 errores");
    }

    @Test
    void w61_w63_a_login_needs_the_login_note_and_counts_as_an_http_call() {
        Note wf = workflow(flow("{}", login("n1", "Login1", "")));
        assertThatThrownBy(() -> runner.prepare(wf.id(), wf.version(), "otro", null, Map.of()))
                .isInstanceOfSatisfying(ApiError.class, e -> assertThat(e.body().code()).isEqualTo("profile_changed"));
        config.set(new AppConfig(20, 10_000, 30, 47600, null, true,
                new AppConfig.Http(false, List.of(Profile.local(base, "demo")), null, 30, 10, null, null, null)));
        assertThatThrownBy(() -> runner.prepare(wf.id(), wf.version(), LOCAL, null, Map.of()))
                .isInstanceOfSatisfying(ApiError.class, e -> assertThat((List<Object>) e.body().details())
                        .containsExactly("El nodo Login necesita la nota de login: Elige la nota de login en «Ajustes»"));
    }

    @Test
    void w78_events_carry_what_was_written_and_the_missing_references() {
        List<JsonNode> events = run(workflow(flow("{}",
                input("n1", "Input1", "id", "5"),
                node("n2", "http", "Conn1", echo, Map.of("t", "$Input1.id", "w", "$Input1.nada $Input1.nada")))), Map.of());
        JsonNode conn = nodeEvent(events, "n2");
        assertThat(conn.get("raw").get("w").asText()).isEqualTo("$Input1.nada $Input1.nada");
        assertThat(conn.get("values").get("w").asText()).isEqualTo("null null");
        assertThat(conn.get("missing")).extracting(JsonNode::asText).containsExactly("$Input1.nada");
        assertThat(nodeEvent(events, "n1").has("missing")).isFalse();
    }

    @Test
    void w60_w62_w30_runs_the_chain_in_order_and_passes_results_forward() {
        Note wf = workflow(flow("{}",
                input("n1", "Input1", "id", "5"),
                node("n2", "http", "Conn1", tasks, Map.of("id", "$Input1.id")),
                node("n3", "http", "Conn2", echo, Map.of("t", "$Conn1[0].id", "w", "$Conn1[0].title")),
                waitNode("n4", "Espera1", "0")));

        List<JsonNode> events = run(wf, Map.of());

        assertThat(events.getFirst().get("chain")).extracting(JsonNode::asText)
                .containsExactly("start", "n1", "n2", "n3", "n4", "finish");
        assertThat(statuses(events)).containsExactly("start:ok", "n1:ok", "n2:ok", "n3:ok", "n4:ok", "finish:ok");
        assertThat(bodies("/demo/echo")).containsExactly("{\"task\": 1, \"who\": \"Tarea\"}");
        JsonNode conn2 = nodeEvent(events, "n3");
        assertThat(conn2.get("values").get("t").asText()).isEqualTo("1");
        assertThat(conn2.get("http").get("response").get("status").asInt()).isEqualTo(200);
        assertThat(end(events).get("status").asText()).isEqualTo("finished");
        assertThat(end(events).get("message").asText()).isEqualTo("Terminado");
    }

    @Test
    void w42_stop_on_error_stops_at_a_status_of_400_or_more() {
        String nodes = node("n1", "http", "Conn1", missing, Map.of());
        String next = node("n2", "http", "Conn2", echo, Map.of("t", "2", "w", "$Conn1.error"));

        List<JsonNode> stopped = run(workflow(flow("{\"stopOnError\":true}", nodes, next)), Map.of());
        assertThat(statuses(stopped)).containsExactly("start:ok", "n1:error");
        assertThat(nodeEvent(stopped, "n1").get("error").get("message").asText()).isEqualTo("Respondió 404 Not Found");
        assertThat(end(stopped).get("status").asText()).isEqualTo("stopped");
        assertThat(end(stopped).get("message").asText()).isEqualTo("Detenido por error en Conn1");
        assertThat(bodies("/demo/echo")).isEmpty();

        // W-33: el cuerpo de una respuesta con error se puede usar.
        List<JsonNode> going = run(workflow(flow("{\"stopOnError\":false}", nodes, next)), Map.of());
        assertThat(statuses(going)).containsExactly("start:ok", "n1:error", "n2:ok", "finish:ok");
        assertThat(bodies("/demo/echo")).containsExactly("{\"task\": 2, \"who\": \"not found\"}");
        assertThat(end(going).get("message").asText()).isEqualTo("Terminado con 1 error");
        assertThat(end(going).get("errors").asInt()).isEqualTo(1);
    }

    @Test
    void w33_a_node_without_response_has_no_value() {
        Note badLogin = httpNote("Con login", "{\"endpoint\":\"/user/5/tasks\",\"user\":\"otro\"}");
        List<JsonNode> events = run(workflow(flow("{\"stopOnError\":false}",
                node("n1", "http", "Conn1", badLogin, Map.of()),
                node("n2", "http", "Conn2", echo, Map.of("t", "0", "w", "$Conn1.message")))), Map.of());
        assertThat(nodeEvent(events, "n1").get("status").asText()).isEqualTo("error");
        assertThat(bodies("/demo/echo")).containsExactly("{\"task\": 0, \"who\": \"null\"}");
    }

    @Test
    void w35_w54_missing_references_send_null_unless_stop_on_missing() {
        String in = input("n1", "Input1", "id", "5");
        String call = node("n2", "http", "Conn2", echo, Map.of("t", "$Input1.nada", "w", "x$Input1.nada"));

        List<JsonNode> going = run(workflow(flow("{}", in, call)), Map.of());
        assertThat(bodies("/demo/echo")).containsExactly("{\"task\": null, \"who\": \"xnull\"}");
        assertThat(end(going).get("status").asText()).isEqualTo("finished");

        // W-43: para aunque «Parar si error» esté desmarcada, sin enviar nada.
        List<JsonNode> stopped = run(workflow(flow("{\"stopOnMissing\":true,\"stopOnError\":false}", in, call)), Map.of());
        assertThat(nodeEvent(stopped, "n2").get("error").get("code").asText()).isEqualTo("missing_reference");
        assertThat(end(stopped).get("status").asText()).isEqualTo("stopped");
        assertThat(end(stopped).get("message").asText()).isEqualTo("Detenido: $Input1.nada no existe");
        assertThat(bodies("/demo/echo")).hasSize(1);
    }

    @Test
    void w54_an_empty_http_variable_is_a_node_error() {
        List<JsonNode> events = run(workflow(flow("{}", node("n1", "http", "Conn1", echo, Map.of("t", "", "w", "a")))), Map.of());
        assertThat(nodeEvent(events, "n1").get("error").get("code").asText()).isEqualTo("missing_value");
        assertThat(end(events).get("message").asText()).isEqualTo("Detenido por error en Conn1");
        assertThat(bodies("/demo/echo")).isEmpty();
    }

    @Test
    void w44_w51_tab_values_apply_except_locked_fields() {
        String in = input("n1", "Input1", "id", "1");
        String call = node("n2", "http", "Conn1", tasks, Map.of("id", "9"));
        Map<String, Map<String, String>> tab = Map.of("n1", Map.of("id", "7"), "n2", Map.of("id", "5"));

        List<JsonNode> free = run(workflow(flow("{}", in, call)), tab);
        assertThat(nodeEvent(free, "n1").get("values").get("id").asText()).isEqualTo("7");
        assertThat(nodeEvent(free, "n2").get("status").asText()).isEqualTo("ok");

        String lockedCall = node("n2", "http", "Conn1", tasks, Map.of("id", "5"));
        Map<String, Map<String, String>> tab2 = Map.of("n1", Map.of("id", "7"), "n2", Map.of("id", "9"));
        List<JsonNode> locked = run(workflow(flow("{\"lockValues\":true}", in, lockedCall)), tab2);
        assertThat(nodeEvent(locked, "n1").get("values").get("id").asText()).isEqualTo("7");
        assertThat(nodeEvent(locked, "n2").get("values").get("id").asText()).isEqualTo("5");
        assertThat(nodeEvent(locked, "n2").get("status").asText()).isEqualTo("ok");
    }

    @Test
    void w61_problems_are_listed_before_running_anything() {
        Note trashed = sqlNote("Borrada", "SELECT 1");
        notes.delete(trashed.id(), false);
        Note update = sqlNote("Cambio", "UPDATE book SET title = #{t}");
        Note wf = workflow(flow("{}",
                node("n1", "http", "Conn1", null, Map.of()),
                node("n2", "http", "Conn2", update, Map.of()),
                node("n3", "sql", "Query1", trashed, Map.of()),
                node("n4", "sql", "Query2", update, Map.of()),
                waitNode("n5", "conn1", "1")));

        assertThatThrownBy(() -> runner.prepare(wf.id(), wf.version(), LOCAL, null, Map.of()))
                .isInstanceOfSatisfying(ApiError.class, e -> {
                    assertThat(e.status()).isEqualTo(400);
                    assertThat(e.body().code()).isEqualTo("workflow_invalid");
                    assertThat((List<Object>) e.body().details()).containsExactly(
                            "El nombre «conn1» está repetido",
                            "«Conn1» no tiene nota",
                            "La nota de «Conn2» no es una nota HTTP",
                            "La nota de «Query1» está en la papelera",
                            "La nota de «Query2» no es una consulta: LiteDD solo ejecuta consultas");
                });
        assertThat(received).isEmpty();

        assertThatThrownBy(() -> runner.prepare(wf.id(), wf.version() - 1, LOCAL, null, Map.of()))
                .isInstanceOfSatisfying(ApiError.class, e -> assertThat(e.status()).isEqualTo(409));
    }

    @Test
    void w63_profile_must_be_the_active_one_and_the_key_is_asked_once() {
        Note wf = workflow(flow("{}",
                node("n1", "http", "Conn1", tasks, Map.of("id", "5")),
                node("n2", "http", "Conn2", tasks, Map.of("id", "5"))));
        assertThatThrownBy(() -> runner.prepare(wf.id(), wf.version(), "otro", null, Map.of()))
                .isInstanceOfSatisfying(ApiError.class, e -> assertThat(e.body().code()).isEqualTo("profile_changed"));
        // Sin nodos HTTP, el perfil no importa.
        Note onlyWait = workflow(flow("{}", waitNode("n1", "Espera1", "0")));
        assertThat(end(run(onlyWait, Map.of(), null, null)).get("status").asText()).isEqualTo("finished");

        configure(List.of(new Profile(LOCAL, null, base, "demo", true, false)), false);
        assertThatThrownBy(() -> runner.prepare(wf.id(), wf.version(), LOCAL, null, Map.of()))
                .isInstanceOfSatisfying(ApiError.class, e -> assertThat(e.body().code()).isEqualTo("confirm_key_missing"));
        credentials.setConfirmKey("clave-de-prueba");
        assertThatThrownBy(() -> runner.prepare(wf.id(), wf.version(), LOCAL, "otra", Map.of()))
                .isInstanceOfSatisfying(ApiError.class, e -> assertThat(e.body().code()).isEqualTo("confirm_key_wrong"));
        assertThat(received).isEmpty();
        List<JsonNode> events = run(wf, Map.of(), LOCAL, "clave-de-prueba");
        assertThat(statuses(events)).containsExactly("start:ok", "n1:ok", "n2:ok", "finish:ok");
    }

    @Test
    void w63_changing_the_active_profile_stops_before_the_next_http_node() {
        configure(List.of(Profile.local(base, "demo"),
                new Profile("pre1", "Pre 1", "https://pre1.litedd-demo.test/demo/", "demo", false, false)), true);
        routes.put("/demo/switch", (ex, body) -> {
            http.selectProfile("pre1");
            reply(ex, 200, "{}");
        });
        Note switcher = httpNote("Cambia", "{\"endpoint\":\"/switch\",\"login\":\"none\"}");
        List<JsonNode> events = run(workflow(flow("{\"stopOnError\":false}",
                node("n1", "http", "Conn1", switcher, Map.of()),
                node("n2", "http", "Conn2", tasks, Map.of("id", "5")))), Map.of());
        assertThat(statuses(events)).containsExactly("start:ok", "n1:ok", "n2:error");
        assertThat(nodeEvent(events, "n2").get("error").get("code").asText()).isEqualTo("profile_changed");
        assertThat(end(events).get("message").asText()).isEqualTo("Detenido: el perfil activo ha cambiado");
        assertThat(bodies("/demo/user/5/tasks")).isEmpty();
    }

    @Test
    void w64_w32_sql_rows_by_label_with_the_first_repeated_column() {
        Note query = sqlNote("Libros", "SELECT col1, col2 FROM t WHERE a = #{a,int} <if test=\"b != null\">AND b = #{b}</if>");
        List<JsonNode> events = run(workflow(flow("{}",
                input("n1", "Input1", "id", "5"),
                node("n2", "sql", "Query1", query, Map.of("a", "$Input1.id", "b", "")),
                node("n3", "http", "Conn1", echo, Map.of("t", "$Query1[0].col1", "w", "$Query1[1].col2")))), Map.of());
        assertThat(statuses(events)).containsExactly("start:ok", "n1:ok", "n2:ok", "n3:ok", "finish:ok");
        assertThat(sql.received.getFirst()).containsEntry("a", "5").containsEntry("b", "");
        assertThat(bodies("/demo/echo")).containsExactly("{\"task\": 1, \"who\": \"null\"}");
        assertThat(nodeEvent(events, "n2").get("sql").get("rows")).hasSize(2);
        assertThat(WorkflowRunner.rowsValue(sql.all("SELECT 1", Map.of(), "x")).get(0).get("col1").asText()).isEqualTo("1");

        Note failing = sqlNote("Mal", "SELECT * FROM FAIL");
        List<JsonNode> failed = run(workflow(flow("{}", node("n1", "sql", "Query1", failing, Map.of()))), Map.of());
        assertThat(nodeEvent(failed, "n1").get("error").get("code").asText()).isEqualTo("mysql_error");
        assertThat(end(failed).get("status").asText()).isEqualTo("stopped");
    }

    @Test
    void w27_invalid_seconds_are_a_node_error() {
        for (String seconds : List.of("", "abc", "-1", "3600,5")) {
            List<JsonNode> events = run(workflow(flow("{}", waitNode("n1", "Espera1", seconds))), Map.of());
            assertThat(nodeEvent(events, "n1").get("error").get("code").asText()).as(seconds).isEqualTo("invalid_seconds");
        }
        assertThat(end(run(workflow(flow("{}", waitNode("n1", "Espera1", "0,05"))), Map.of())).get("status").asText())
                .isEqualTo("finished");
    }

    @Test
    void w60_w65_cancel_interrupts_a_wait_at_once() throws Exception {
        Note wf = workflow(flow("{}", waitNode("n1", "Espera1", "30"), node("n2", "http", "Conn1", tasks, Map.of("id", "5"))));
        WorkflowRunner.Prepared p = runner.prepare(wf.id(), wf.version(), LOCAL, null, Map.of());
        List<JsonNode> events = new CopyOnWriteArrayList<>();
        Thread t = Thread.ofVirtual().start(() -> runner.run(p, "e-cancel", event -> events.add(JSON.valueToTree(event))));
        long deadline = System.currentTimeMillis() + 5000;
        while (events.stream().noneMatch(e -> "running".equals(e.path("status").asText())) && System.currentTimeMillis() < deadline) {
            Thread.sleep(10);
        }
        long before = System.nanoTime();
        assertThat(runner.cancel("e-cancel")).isTrue();
        t.join(5000);
        assertThat((System.nanoTime() - before) / 1_000_000).isLessThan(2000);
        assertThat(nodeEvent(events, "n1").get("status").asText()).isEqualTo("cancelled");
        assertThat(end(events).get("status").asText()).isEqualTo("cancelled");
        assertThat(end(events).get("message").asText()).isEqualTo("Cancelado");
        assertThat(bodies("/demo/user/5/tasks")).isEmpty();
        assertThat(runner.cancel("e-cancel")).isFalse();
    }

    @Test
    void w60_a_tab_that_stops_listening_cancels_the_run() {
        Note wf = workflow(flow("{}", waitNode("n1", "Espera1", "30")));
        WorkflowRunner.Prepared p = runner.prepare(wf.id(), wf.version(), LOCAL, null, Map.of());
        long before = System.nanoTime();
        List<Object> sent = new ArrayList<>();
        runner.run(p, "e-gone", event -> {
            sent.add(event);
            if (sent.size() == 3) {
                throw new IOException("Broken pipe");
            }
        });
        assertThat((System.nanoTime() - before) / 1_000_000).isLessThan(2000);
    }

    @Test
    void w68_the_log_has_node_names_but_no_values() {
        Logger root = (Logger) LoggerFactory.getLogger(org.slf4j.Logger.ROOT_LOGGER_NAME);
        Logger appLog = (Logger) LoggerFactory.getLogger("dev.litedd");
        Level previous = appLog.getLevel();
        ListAppender<ILoggingEvent> appender = new ListAppender<>();
        appender.start();
        root.addAppender(appender);
        try {
            appLog.setLevel(Level.DEBUG);
            run(workflow(flow("{}",
                    input("n1", "Input1", "who", "valor-secreto-77"),
                    node("n2", "http", "Conn2", echo, Map.of("t", "1", "w", "$Input1.who")))), Map.of());
            assertThat(appender.list).anyMatch(e -> e.getFormattedMessage().contains("Conn2"));
            for (String secret : List.of("valor-secreto-77", "$Input1.who", "task")) {
                assertThat(appender.list).as(secret).noneMatch(e -> e.getFormattedMessage().contains(secret));
            }
        } finally {
            root.detachAppender(appender);
            appLog.setLevel(previous);
        }
    }
}
