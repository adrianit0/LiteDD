package dev.litedd.notes;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.litedd.http.HttpServer;
import dev.litedd.settings.SettingsApi;
import dev.litedd.store.Store;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.net.ServerSocket;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Path;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class NotesApiTest {

    private static final String TOKEN = "test-token-0123456789abcdefghijklmnop";
    private static final ObjectMapper JSON = new ObjectMapper();

    @TempDir
    Path dir;
    Store store;
    HttpServer server;
    HttpClient client = HttpClient.newHttpClient();
    int port;

    @BeforeEach
    void start() throws IOException {
        try (ServerSocket s = new ServerSocket(0)) {
            port = s.getLocalPort();
        }
        store = Store.open(dir.resolve("litedd.db"), dir.resolve("backups"));
        server = new HttpServer(port, TOKEN, List.of(new NotesApi(new NoteService(store)), new SettingsApi(store))).start();
    }

    @AfterEach
    void stop() {
        server.stop();
        store.close();
    }

    @Test
    void a01_create_get_and_tree_in_camel_case() throws Exception {
        Res created = call("POST", "/api/notes", "{\"parentId\":null,\"type\":\"md\",\"title\":\"Guía\"}");
        assertThat(created.status).isEqualTo(201);
        String id = created.json.get("id").asText();
        assertThat(created.json.get("parentId").isNull()).isTrue();
        assertThat(created.json.get("createdAt").asText()).endsWith("Z");

        Res child = call("POST", "/api/notes", "{\"parentId\":\"" + id + "\",\"type\":\"sql\"}");
        assertThat(child.json.get("title").asText()).isEqualTo("Sin título");

        Res tree = call("GET", "/api/tree", null);
        assertThat(tree.status).isEqualTo(200);
        assertThat(tree.json).hasSize(2);
        JsonNode first = tree.json.get(0);
        assertThat(first.has("favorite")).isTrue();
        assertThat(first.get("tags").isArray()).isTrue();
        assertThat(first.has("content")).isFalse();

        Res note = call("GET", "/api/notes/" + id, null);
        assertThat(note.json.get("title").asText()).isEqualTo("Guía");
        assertThat(note.json.get("version").asLong()).isEqualTo(1);
    }

    @Test
    void n42_a05_put_with_stale_version_returns_409_with_current_note() throws Exception {
        String id = call("POST", "/api/notes", "{\"type\":\"md\"}").json.get("id").asText();
        Res ok = call("PUT", "/api/notes/" + id, "{\"title\":\"A\",\"content\":\"uno\",\"baseVersion\":1}");
        assertThat(ok.status).isEqualTo(200);
        assertThat(ok.json.get("version").asLong()).isEqualTo(2);

        Res conflict = call("PUT", "/api/notes/" + id, "{\"title\":\"B\",\"content\":\"dos\",\"baseVersion\":1}");
        assertThat(conflict.status).isEqualTo(409);
        assertThat(conflict.json.get("code").asText()).isEqualTo("conflict");
        assertThat(conflict.json.get("message").asText()).isNotBlank();
        assertThat(conflict.json.get("details").get("content").asText()).isEqualTo("uno");
        assertThat(conflict.json.get("details").get("version").asLong()).isEqualTo(2);
    }

    @Test
    void a02_errors_have_code_message_details() throws Exception {
        Res missing = call("GET", "/api/notes/no-existe", null);
        assertThat(missing.status).isEqualTo(404);
        assertThat(missing.json.get("code").asText()).isEqualTo("not_found");

        Res bad = call("POST", "/api/notes", "{no es json");
        assertThat(bad.status).isEqualTo(400);
        assertThat(bad.json.has("message")).isTrue();

        Res badType = call("POST", "/api/notes", "{\"type\":\"txt\"}");
        assertThat(badType.status).isEqualTo(400);
    }

    @Test
    void settings_round_trip_ui_state() throws Exception {
        assertThat(call("GET", "/api/settings", null).json.size()).isZero();
        Res put = call("PUT", "/api/settings", "{\"ui.sidebarWidth\":320,\"ui.collapsed\":[\"a\",\"b\"]}");
        assertThat(put.status).isEqualTo(200);
        call("PUT", "/api/settings", "{\"ui.sidebarWidth\":280}");
        JsonNode s = call("GET", "/api/settings", null).json;
        assertThat(s.get("ui.sidebarWidth").asInt()).isEqualTo(280);
        assertThat(s.get("ui.collapsed").get(1).asText()).isEqualTo("b");
    }

    @Test
    void settings_reject_invalid_keys() throws Exception {
        assertThat(call("PUT", "/api/settings", "{\"bad key\":1}").status).isEqualTo(400);
    }

    private record Res(int status, JsonNode json) {
    }

    private Res call(String method, String path, String body) throws Exception {
        HttpRequest.Builder b = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + path))
                .header("X-LiteDD-Token", TOKEN)
                .header("Content-Type", "application/json")
                .method(method, body == null ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofString(body));
        HttpResponse<String> r = client.send(b.build(), HttpResponse.BodyHandlers.ofString());
        return new Res(r.statusCode(), r.body().isEmpty() ? null : JSON.readTree(r.body()));
    }
}
