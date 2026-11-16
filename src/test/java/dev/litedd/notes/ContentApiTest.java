package dev.litedd.notes;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.litedd.http.HttpServer;
import dev.litedd.store.Store;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.net.ServerSocket;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/** Rutas de historial, búsqueda, etiquetas, favorita y adjuntos. */
class ContentApiTest {

    private static final String TOKEN = "test-token-0123456789abcdefghijklmnop";
    private static final ObjectMapper JSON = new ObjectMapper();
    static final byte[] PNG = {(byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0};

    @TempDir
    Path dir;
    Store store;
    HttpServer server;
    HttpClient client = HttpClient.newHttpClient();
    int port;
    String noteId;

    @BeforeEach
    void start() throws Exception {
        try (ServerSocket s = new ServerSocket(0)) {
            port = s.getLocalPort();
        }
        store = Store.open(dir.resolve("litedd.db"), dir.resolve("backups"));
        NoteService notes = new NoteService(store);
        server = new HttpServer(port, TOKEN, List.of(new NotesApi(notes), new AttachmentsApi(store))).start();
        noteId = notes.create(null, "md", "Préstamos").id();
    }

    @AfterEach
    void stop() {
        server.stop();
        store.close();
    }

    @Test
    void n44_n45_snapshot_versions_and_restore() throws Exception {
        call("PUT", "/api/notes/" + noteId, "{\"title\":\"Préstamos\",\"content\":\"uno\",\"baseVersion\":1,\"snapshot\":true}");
        call("PUT", "/api/notes/" + noteId, "{\"title\":\"Préstamos\",\"content\":\"dos\",\"baseVersion\":2,\"snapshot\":true}");
        JsonNode versions = call("GET", "/api/notes/" + noteId + "/versions", null).json;
        assertThat(versions).hasSize(2);
        assertThat(versions.get(1).get("content").asText()).isEqualTo("uno");
        assertThat(versions.get(1).get("savedAt").asText()).endsWith("Z");

        Res restored = call("POST", "/api/notes/" + noteId + "/versions/" + versions.get(1).get("id").asLong() + "/restore",
                "{\"baseVersion\":3}");
        assertThat(restored.status).isEqualTo(200);
        assertThat(restored.json.get("content").asText()).isEqualTo("uno");
        assertThat(call("POST", "/api/notes/" + noteId + "/versions/999/restore", "{\"baseVersion\":4}").status).isEqualTo(404);
    }

    @Test
    void n70_n72_search_with_filters() throws Exception {
        call("PUT", "/api/notes/" + noteId, "{\"title\":\"Préstamos\",\"content\":\"tabla loan\",\"baseVersion\":1}");
        call("PUT", "/api/notes/" + noteId + "/tags", "{\"tags\":[\"demo\"]}");
        call("PUT", "/api/notes/" + noteId + "/favorite", "{\"favorite\":true}");

        JsonNode hits = call("GET", "/api/search?q=" + enc("préstamo") + "&type=md&tags=demo&favorite=true", null).json;
        assertThat(hits).hasSize(1);
        assertThat(hits.get(0).get("title").asText()).isEqualTo("Préstamos");
        assertThat(hits.get(0).has("fragment")).isTrue();
        assertThat(call("GET", "/api/search?q=" + enc("\"#{*") , null).status).isEqualTo(200);
        assertThat(call("GET", "/api/search?type=sql", null).json).isEmpty();

        JsonNode tags = call("GET", "/api/tags", null).json;
        assertThat(tags.get(0).get("name").asText()).isEqualTo("demo");
        assertThat(tags.get(0).get("count").asInt()).isEqualTo(1);
        assertThat(call("GET", "/api/tree", null).json.get(0).get("favorite").asBoolean()).isTrue();
    }

    @Test
    void n92_upload_and_download_an_image() throws Exception {
        HttpResponse<String> up = client.send(HttpRequest.newBuilder(URI.create(url("/api/attachments?noteId=" + noteId + "&name=x.png")))
                .header("X-LiteDD-Token", TOKEN).header("Content-Type", "image/png")
                .POST(HttpRequest.BodyPublishers.ofByteArray(PNG)).build(), HttpResponse.BodyHandlers.ofString());
        assertThat(up.statusCode()).isEqualTo(201);
        String id = JSON.readTree(up.body()).get("id").asText();
        assertThat(id).matches("[0-9a-f-]{36}");

        HttpResponse<byte[]> down = client.send(HttpRequest.newBuilder(URI.create(url("/api/attachments/" + id)))
                .header("X-LiteDD-Token", TOKEN).GET().build(), HttpResponse.BodyHandlers.ofByteArray());
        assertThat(down.statusCode()).isEqualTo(200);
        assertThat(down.headers().firstValue("Content-Type")).contains("image/png");
        assertThat(down.body()).isEqualTo(PNG);
    }

    @Test
    void n92_rejects_other_types_mismatched_content_and_large_files() throws Exception {
        assertThat(upload("text/plain", "hola".getBytes(StandardCharsets.UTF_8))).isEqualTo(415);
        assertThat(upload("image/png", "<svg/>".getBytes(StandardCharsets.UTF_8))).isEqualTo(415);
        byte[] big = Arrays.copyOf(PNG, 10 * 1024 * 1024 + 1);
        assertThat(upload("image/png", big)).isEqualTo(413);
        byte[] gif = "GIF89a......".getBytes(StandardCharsets.US_ASCII);
        assertThat(upload("image/gif", gif)).isEqualTo(201);
        byte[] webp = "RIFF\0\0\0\0WEBPVP8 ".getBytes(StandardCharsets.US_ASCII);
        assertThat(upload("image/webp", webp)).isEqualTo(201);
        byte[] jpeg = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xE0, 0, 0};
        assertThat(upload("image/jpeg", jpeg)).isEqualTo(201);
    }

    @Test
    void s12_attachments_require_the_token() throws Exception {
        HttpResponse<String> r = client.send(HttpRequest.newBuilder(URI.create(url("/api/attachments/x"))).GET().build(),
                HttpResponse.BodyHandlers.ofString());
        assertThat(r.statusCode()).isEqualTo(403);
    }

    private int upload(String type, byte[] body) throws Exception {
        return client.send(HttpRequest.newBuilder(URI.create(url("/api/attachments?noteId=" + noteId)))
                .header("X-LiteDD-Token", TOKEN).header("Content-Type", type)
                .POST(HttpRequest.BodyPublishers.ofByteArray(body)).build(), HttpResponse.BodyHandlers.ofString()).statusCode();
    }

    private String url(String path) {
        return "http://127.0.0.1:" + port + path;
    }

    private static String enc(String s) {
        return URLEncoder.encode(s, StandardCharsets.UTF_8);
    }

    private record Res(int status, JsonNode json) {
    }

    private Res call(String method, String path, String body) throws Exception {
        HttpRequest.Builder b = HttpRequest.newBuilder(URI.create(url(path)))
                .header("X-LiteDD-Token", TOKEN)
                .header("Content-Type", "application/json")
                .method(method, body == null ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofString(body));
        HttpResponse<String> r = client.send(b.build(), HttpResponse.BodyHandlers.ofString());
        return new Res(r.statusCode(), r.body().isEmpty() ? null : JSON.readTree(r.body()));
    }

    @Test
    void n82_n84_n86_obsolete_is_marked_searched_and_replaced_through_the_api() throws Exception {
        call("PUT", "/api/notes/" + noteId, "{\"title\":\"Préstamos\",\"content\":\"tabla loan\",\"baseVersion\":1}");
        String other = call("POST", "/api/notes", "{\"type\":\"md\",\"title\":\"Nueva\"}").json.get("id").asText();

        Res marked = call("PUT", "/api/notes/" + noteId + "/obsolete", "{\"obsolete\":true,\"replacedBy\":\"" + other + "\"}");
        assertThat(marked.status).isEqualTo(200);
        assertThat(marked.json.get("obsolete").asBoolean()).isTrue();
        assertThat(marked.json.get("replacedBy").asText()).isEqualTo(other);
        assertThat(marked.json.get("lastRunAt").isNull()).isTrue();
        assertThat(marked.json.get("version").asInt()).isEqualTo(2);
        for (JsonNode node : call("GET", "/api/tree", null).json) {
            assertThat(node.get("obsolete").asBoolean()).isEqualTo(node.get("id").asText().equals(noteId));
        }

        assertThat(call("GET", "/api/search?q=" + enc("préstamo"), null).json).isEmpty();
        JsonNode hits = call("GET", "/api/search?q=" + enc("préstamo") + "&obsolete=true", null).json;
        assertThat(hits).hasSize(1);
        assertThat(hits.get(0).get("obsolete").asBoolean()).isTrue();

        assertThat(call("PUT", "/api/notes/" + noteId + "/obsolete", "{\"obsolete\":true,\"replacedBy\":\"" + noteId + "\"}").status)
                .isEqualTo(400);
        assertThat(call("PUT", "/api/notes/" + noteId + "/obsolete", "{\"obsolete\":true,\"replacedBy\":\"nope\"}").status)
                .isEqualTo(404);
        Res cleared = call("PUT", "/api/notes/" + noteId + "/obsolete", "{\"obsolete\":false}");
        assertThat(cleared.json.get("obsolete").asBoolean()).isFalse();
        assertThat(cleared.json.get("replacedBy").isNull()).isTrue();
    }

    @Test
    void n89_n99_important_is_marked_filtered_and_cleared_through_the_api() throws Exception {
        call("PUT", "/api/notes/" + noteId, "{\"title\":\"Análisis\",\"content\":\"pendiente\",\"baseVersion\":1}");
        call("POST", "/api/notes", "{\"type\":\"md\",\"title\":\"Otra\"}");

        Res marked = call("PUT", "/api/notes/" + noteId + "/important", "{\"until\":\"2026-11-20\"}");
        assertThat(marked.status).isEqualTo(200);
        assertThat(marked.json.get("importantUntil").asText()).isEqualTo("2026-11-20");
        assertThat(marked.json.get("version").asInt()).isEqualTo(2);
        for (JsonNode node : call("GET", "/api/tree", null).json) {
            assertThat(node.get("importantUntil").isNull()).isEqualTo(!node.get("id").asText().equals(noteId));
        }

        JsonNode hits = call("GET", "/api/search?important=2026-11-20", null).json;
        assertThat(hits).hasSize(1);
        assertThat(hits.get(0).get("id").asText()).isEqualTo(noteId);
        assertThat(hits.get(0).get("importantUntil").asText()).isEqualTo("2026-11-20");
        assertThat(call("GET", "/api/search?important=2026-11-21", null).json).isEmpty();
        assertThat(call("GET", "/api/search?important=ayer", null).status).isEqualTo(400);

        assertThat(call("PUT", "/api/notes/" + noteId + "/important", "{\"until\":\"20/11/2026\"}").status).isEqualTo(400);
        assertThat(call("PUT", "/api/notes/nope/important", "{\"until\":\"2026-11-20\"}").status).isEqualTo(404);
        Res cleared = call("PUT", "/api/notes/" + noteId + "/important", "{\"until\":null}");
        assertThat(cleared.status).isEqualTo(200);
        assertThat(cleared.json.get("importantUntil").isNull()).isTrue();
    }
}
