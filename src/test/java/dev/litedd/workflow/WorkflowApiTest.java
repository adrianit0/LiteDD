package dev.litedd.workflow;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.litedd.http.ApiError;
import dev.litedd.http.HttpServer;
import dev.litedd.httpnotes.HttpCaller;
import dev.litedd.httpnotes.HttpCredentials;
import dev.litedd.httpnotes.HttpRunner;
import dev.litedd.mysql.FakeSqlRunner;
import dev.litedd.notes.Note;
import dev.litedd.notes.NoteService;
import dev.litedd.notes.VariableValues;
import dev.litedd.settings.AppConfig;
import dev.litedd.sqlengine.SqlEngine;
import dev.litedd.store.Store;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.net.ServerSocket;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Rutas /api/workflow (W-23 a W-26, W-51, W-53, W-60, W-61, W-81). */
class WorkflowApiTest {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final String TOKEN = "test-token-0123456789abcdefghijklmnop";

    @TempDir
    Path dir;
    Store store;
    NoteService notes;
    VariableValues values;
    HttpServer server;
    HttpClient client = HttpClient.newHttpClient();
    int port;

    @BeforeEach
    void start() throws Exception {
        try (ServerSocket s = new ServerSocket(0)) {
            port = s.getLocalPort();
        }
        store = Store.open(dir.resolve("litedd.db"), dir.resolve("backups"));
        notes = new NoteService(store);
        values = new VariableValues(store);
        HttpRunner http = new HttpRunner(notes, () -> AppConfig.DEFAULT, new HttpCredentials(dir.resolve("config/http.json")),
                new HttpCaller());
        WorkflowRunner runner = new WorkflowRunner(notes, http, new FakeSqlRunner(List.of("id"), List.of()), new SqlEngine(), Map::of);
        server = new HttpServer(port, TOKEN, List.of(new WorkflowApi(runner, values, notes))).start();
    }

    @AfterEach
    void stop() {
        server.stop();
        store.close();
    }

    private Note note(String type, String title, String content) {
        Note n = notes.create(null, type, title);
        return notes.save(n.id(), n.title(), content, n.version());
    }

    /** Start → Input1 (id) → Espera1 → Finish. */
    private Note waitingWorkflow(String seconds) {
        return note("workflow", "Alta", """
                {"nodes":[{"id":"start","kind":"start"},
                          {"id":"n1","kind":"input","name":"Input1","rows":[{"name":"id","value":"1"}]},
                          {"id":"n2","kind":"wait","name":"Espera1","seconds":"%s"},
                          {"id":"finish","kind":"finish"}],
                 "edges":[{"from":"start","to":"n1"},{"from":"n1","to":"n2"},{"from":"n2","to":"finish"}]}""".formatted(seconds));
    }

    private HttpRequest post(String path, Object body) throws Exception {
        return HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + path))
                .header("X-LiteDD-Token", TOKEN)
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(JSON.writeValueAsString(body))).build();
    }

    private Map<String, Object> execute(Note wf, String executionId, Map<String, Map<String, String>> tab) {
        return Map.of("noteId", wf.id(), "version", wf.version(), "executionId", executionId, "profileId", "local", "values", tab);
    }

    @Test
    void w60_execute_streams_one_json_event_per_line_as_it_happens() throws Exception {
        Note wf = waitingWorkflow("1");
        long start = System.nanoTime();
        HttpResponse<java.util.stream.Stream<String>> r = client.send(post("/api/workflow/execute", execute(wf, "e1", Map.of())),
                HttpResponse.BodyHandlers.ofLines());
        assertThat(r.statusCode()).isEqualTo(200);
        assertThat(r.headers().firstValue("Content-Type").orElse("")).startsWith("application/x-ndjson");
        List<JsonNode> events = new ArrayList<>();
        List<Long> arrivals = new ArrayList<>();
        r.body().forEach(line -> {
            arrivals.add((System.nanoTime() - start) / 1_000_000);
            try {
                events.add(JSON.readTree(line));
            } catch (Exception e) {
                throw new IllegalStateException(e);
            }
        });
        assertThat(events.getFirst().get("type").asText()).isEqualTo("start");
        assertThat(events.getLast().get("type").asText()).isEqualTo("end");
        assertThat(events.getLast().get("status").asText()).isEqualTo("finished");
        // El inicio llega antes de que acabe la espera: nada se queda en un búfer.
        assertThat(arrivals.getFirst()).isLessThan(800);
        assertThat(arrivals.getLast()).isGreaterThanOrEqualTo(1000);
    }

    @Test
    void w53_w51_execution_values_come_back_as_last_values() throws Exception {
        Note wf = waitingWorkflow("0");
        client.send(post("/api/workflow/execute", execute(wf, "e1", Map.of("n1", Map.of("id", "7")))),
                HttpResponse.BodyHandlers.ofString());
        HttpResponse<String> r = client.send(post("/api/workflow/analyze", Map.of("noteIds", List.of(), "workflowId", wf.id())),
                HttpResponse.BodyHandlers.ofString());
        JsonNode last = JSON.readTree(r.body()).get("lastValues");
        assertThat(last.get("n1").get("id").asText()).isEqualTo("7");
        assertThat(last.get("n2").get("seconds").asText()).isEqualTo("0");
        // Los valores guardados del workflow no cambian.
        assertThat(notes.get(wf.id()).content()).contains("\"value\":\"1\"");
        // Sin workflowId no hay lastValues.
        HttpResponse<String> without = client.send(post("/api/workflow/analyze", Map.of("noteIds", List.of())),
                HttpResponse.BodyHandlers.ofString());
        assertThat(JSON.readTree(without.body()).has("lastValues")).isFalse();
    }

    @Test
    void w23_w24_w26_analyze_describes_the_notes_of_the_nodes() throws Exception {
        Note http = note("http", "Tareas", "{\"endpoint\":\"/user/#{id}/tasks\",\"pathValues\":{\"id\":\"5\"}}");
        Note query = note("sql", "Libros", "SELECT * FROM book WHERE id = #{id,int} AND title = #{t}");
        values.save(query.id(), List.of("id", "t"), Map.of("id", "3"));
        Note update = note("sql", "Cambio", "UPDATE book SET title = 'x'");
        Note trashed = note("http", "Vieja", "{}");
        notes.delete(trashed.id(), false);

        HttpResponse<String> r = client.send(post("/api/workflow/analyze",
                Map.of("noteIds", List.of(http.id(), query.id(), update.id(), trashed.id(), "no-existe"))), HttpResponse.BodyHandlers.ofString());
        JsonNode list = JSON.readTree(r.body()).get("notes");
        assertThat(list.get(0).get("state").asText()).isEqualTo("active");
        assertThat(list.get(0).get("method").asText()).isEqualTo("GET");
        assertThat(list.get(0).get("endpoint").asText()).isEqualTo("/user/#{id}/tasks");
        assertThat(list.get(0).get("fields").get(0).get("name").asText()).isEqualTo("id");
        assertThat(list.get(0).get("values").get("id").asText()).isEqualTo("5");
        assertThat(list.get(1).get("fields")).extracting(f -> f.get("name").asText() + ":" + f.get("type").asText())
                .containsExactly("id:int", "t:string");
        assertThat(list.get(1).get("executable").asBoolean()).isTrue();
        assertThat(list.get(1).get("values").get("id").asText()).isEqualTo("3");
        assertThat(list.get(2).get("executable").asBoolean()).isFalse();
        assertThat(list.get(3).get("state").asText()).isEqualTo("trash");
        assertThat(list.get(4).get("state").asText()).isEqualTo("missing");
    }

    @Test
    void w61_problems_answer_as_plain_json_before_streaming() throws Exception {
        Note wf = note("workflow", "Rota", """
                {"nodes":[{"id":"start","kind":"start"},{"id":"n1","kind":"wait","name":"Espera1","seconds":"0"},
                          {"id":"finish","kind":"finish"}],
                 "edges":[{"from":"start","to":"n1"}]}""");
        HttpResponse<String> r = client.send(post("/api/workflow/execute", execute(wf, "e1", Map.of())),
                HttpResponse.BodyHandlers.ofString());
        assertThat(r.statusCode()).isEqualTo(400);
        JsonNode body = JSON.readTree(r.body());
        assertThat(body.get("code").asText()).isEqualTo("workflow_invalid");
        assertThat(body.get("details").get(0).asText()).contains("no llega de Start a Finish");
    }

    @Test
    void w60_the_cancel_route_ends_a_running_execution() throws Exception {
        Note wf = waitingWorkflow("30");
        CompletableFuture<HttpResponse<String>> running = client.sendAsync(post("/api/workflow/execute", execute(wf, "e-api", Map.of())),
                HttpResponse.BodyHandlers.ofString());
        JsonNode cancelled = null;
        for (int i = 0; i < 100 && (cancelled == null || !cancelled.get("cancelled").asBoolean()); i++) {
            Thread.sleep(20);
            cancelled = JSON.readTree(client.send(post("/api/workflow/cancel", Map.of("executionId", "e-api")),
                    HttpResponse.BodyHandlers.ofString()).body());
        }
        String body = running.get(5, TimeUnit.SECONDS).body();
        String[] lines = body.strip().split("\n");
        assertThat(JSON.readTree(lines[lines.length - 1]).get("status").asText()).isEqualTo("cancelled");
    }

    @Test
    void w81_saving_an_invalid_workflow_is_rejected_and_the_note_does_not_change() {
        Note wf = waitingWorkflow("0");
        assertThatThrownBy(() -> notes.save(wf.id(), wf.title(), "{\"nodes\":[{\"id\":\"start\",\"kind\":\"start\"}]}", wf.version()))
                .isInstanceOfSatisfying(ApiError.class, e -> assertThat(e.body().code()).isEqualTo("invalid_workflow"));
        assertThat(notes.get(wf.id()).version()).isEqualTo(wf.version());
        // Un workflow recién creado tiene el contenido vacío y es válido (W-02).
        Note fresh = notes.create(null, "workflow", null);
        assertThat(fresh.content()).isEmpty();
    }
}
