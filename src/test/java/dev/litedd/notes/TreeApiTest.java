package dev.litedd.notes;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.litedd.http.HttpServer;
import dev.litedd.session.SessionApi;
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

/** Rutas de mover, eliminar, papelera y sesión. */
class TreeApiTest {

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
        server = new HttpServer(port, TOKEN, List.of(new NotesApi(new NoteService(store)), new SessionApi(store))).start();
    }

    @AfterEach
    void stop() {
        server.stop();
        store.close();
    }

    private String create(String parentId, String title) throws Exception {
        String parent = parentId == null ? "null" : "\"" + parentId + "\"";
        return call("POST", "/api/notes", "{\"parentId\":" + parent + ",\"type\":\"md\",\"title\":\"" + title + "\"}")
                .json.get("id").asText();
    }

    @Test
    void move_and_cycle_rejection() throws Exception {
        String a = create(null, "A");
        String a1 = create(a, "A1");
        String b = create(null, "B");

        assertThat(call("POST", "/api/notes/" + b + "/move", "{\"parentId\":\"" + a + "\",\"position\":0}").status).isEqualTo(200);
        Res cycle = call("POST", "/api/notes/" + a + "/move", "{\"parentId\":\"" + a1 + "\",\"position\":0}");
        assertThat(cycle.status).isEqualTo(409);
        assertThat(cycle.json.get("code").asText()).isEqualTo("cycle");
        assertThat(call("POST", "/api/notes/" + b + "/move", "{\"parentId\":null}").status).isEqualTo(400);
    }

    @Test
    void delete_trash_restore_and_purge() throws Exception {
        String a = create(null, "A");
        create(a, "A1");

        Res refused = call("DELETE", "/api/notes/" + a, null);
        assertThat(refused.status).isEqualTo(409);
        assertThat(refused.json.get("code").asText()).isEqualTo("has_children");

        assertThat(call("DELETE", "/api/notes/" + a + "?children=promote", null).status).isEqualTo(204);
        JsonNode trash = call("GET", "/api/trash", null).json;
        assertThat(trash).hasSize(1);
        assertThat(trash.get(0).get("title").asText()).isEqualTo("A");
        assertThat(trash.get(0).has("deletedAt")).isTrue();

        assertThat(call("POST", "/api/trash/" + a + "/restore", null).json.get("parentId").isNull()).isTrue();
        assertThat(call("DELETE", "/api/notes/" + a, null).status).isEqualTo(204);
        assertThat(call("DELETE", "/api/trash/" + a, null).status).isEqualTo(204);
        assertThat(call("GET", "/api/trash", null).json).isEmpty();

        String b = create(null, "B");
        call("DELETE", "/api/notes/" + b, null);
        assertThat(call("DELETE", "/api/trash", null).status).isEqualTo(204);
        assertThat(call("GET", "/api/trash", null).json).isEmpty();
    }

    @Test
    void p09_session_round_trip_keeps_order_mode_and_state() throws Exception {
        String a = create(null, "A");
        String b = create(null, "B");
        String body = """
                {"tabs":[
                  {"id":"t1","noteId":"%s","mode":"edit","active":false,"state":{"scroll":120}},
                  {"id":"t2","noteId":"%s","mode":"view","active":true,"state":{"scroll":0}},
                  {"id":"t3","noteId":"%s","mode":"view","active":false,"state":null}
                ]}""".formatted(b, a, b);
        assertThat(call("PUT", "/api/session", body).status).isEqualTo(200);

        JsonNode tabs = call("GET", "/api/session", null).json.get("tabs");
        assertThat(tabs).hasSize(3);
        assertThat(tabs.get(0).get("id").asText()).isEqualTo("t1");
        assertThat(tabs.get(0).get("mode").asText()).isEqualTo("edit");
        assertThat(tabs.get(0).get("state").get("scroll").asInt()).isEqualTo(120);
        assertThat(tabs.get(1).get("active").asBoolean()).isTrue();
        assertThat(tabs.get(2).get("noteId").asText()).isEqualTo(b);
    }

    @Test
    void n54_session_drops_tabs_of_deleted_notes() throws Exception {
        String a = create(null, "A");
        String b = create(null, "B");
        call("PUT", "/api/session", """
                {"tabs":[{"id":"t1","noteId":"%s","mode":"view","active":true,"state":null},
                         {"id":"t2","noteId":"%s","mode":"view","active":false,"state":null}]}""".formatted(a, b));
        call("DELETE", "/api/notes/" + a, null);
        JsonNode tabs = call("GET", "/api/session", null).json.get("tabs");
        assertThat(tabs).hasSize(1);
        assertThat(tabs.get(0).get("noteId").asText()).isEqualTo(b);
    }

    @Test
    void session_ignores_tabs_of_missing_notes_and_rejects_bad_modes() throws Exception {
        String a = create(null, "A");
        call("PUT", "/api/session", """
                {"tabs":[{"id":"t1","noteId":"no-existe","mode":"view","active":true,"state":null},
                         {"id":"t2","noteId":"%s","mode":"view","active":false,"state":null}]}""".formatted(a));
        assertThat(call("GET", "/api/session", null).json.get("tabs")).hasSize(1);
        assertThat(call("PUT", "/api/session", """
                {"tabs":[{"id":"t1","noteId":"%s","mode":"otro","active":true,"state":null}]}""".formatted(a)).status)
                .isEqualTo(400);
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
