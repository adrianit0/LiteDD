package dev.litedd.mysql;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.litedd.http.HttpServer;
import dev.litedd.notes.Note;
import dev.litedd.notes.NoteService;
import dev.litedd.notes.VariableValues;
import dev.litedd.sqlengine.SqlEngine;
import dev.litedd.store.Store;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.slf4j.LoggerFactory;

import java.net.ServerSocket;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/** Rutas /api/sql y /api/connection sin servidor MySQL. */
class SqlApiTest {

    private static final String TOKEN = "test-token-0123456789abcdefghijklmnop";
    private static final ObjectMapper JSON = new ObjectMapper();

    @TempDir
    Path dir;
    Store store;
    NoteService notes;
    MySqlGateway gateway;
    ConnectionFile file;
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
        file = new ConnectionFile(dir.resolve("config/connection.json"));
        gateway = new MySqlGateway();
        server = new HttpServer(port, TOKEN, List.of(
                new SqlApi(notes, new VariableValues(store), new SqlEngine(), gateway),
                new ConnectionApi(file, gateway))).start();
    }

    @AfterEach
    void stop() {
        server.stop();
        gateway.close();
        store.close();
    }

    private Note sqlNote(String content) {
        Note n = notes.create(null, "sql", "Consulta");
        return notes.save(n.id(), n.title(), content, n.version());
    }

    private String exec(Note n, String values) {
        return "{\"noteId\":\"" + n.id() + "\",\"version\":" + n.version() + ",\"executionId\":\"e1\",\"values\":" + values
                + ",\"page\":1,\"pageSize\":20}";
    }

    @Test
    void q82_analyze_returns_variables_kind_and_errors() throws Exception {
        Res r = call("POST", "/api/sql/analyze", JSON.writeValueAsString(Map.of("content",
                "SELECT * FROM book <where><if test=\"y != null\">AND year > #{y,int}</if></where>")));
        assertThat(r.status).isEqualTo(200);
        assertThat(r.json.get("variables").get(0).get("name").asText()).isEqualTo("y");
        assertThat(r.json.get("variables").get(0).get("type").asText()).isEqualTo("int");
        assertThat(r.json.get("kind").asText()).isEqualTo("query");
        assertThat(r.json.get("errors")).isEmpty();

        Res bad = call("POST", "/api/sql/analyze", JSON.writeValueAsString(Map.of("content", "SELECT a < 3")));
        assertThat(bad.json.get("errors").get(0).get("code").asText()).isEqualTo("xml");
        assertThat(bad.json.get("errors").get(0).get("line").asInt()).isEqualTo(1);
    }

    @Test
    void q24_successful_execute_remembers_values_and_analyze_returns_them() throws Exception {
        Note n = sqlNote("UPDATE book SET title = #{t} WHERE id = #{id,int} <if test=\"flag != null\">AND 1</if>");
        assertThat(call("POST", "/api/sql/execute", exec(n, "{\"t\":\"mar\",\"id\":\"\",\"otra\":\"x\"}")).status).isEqualTo(200);
        Res r = call("POST", "/api/sql/analyze", JSON.writeValueAsString(Map.of("content", n.content(), "noteId", n.id())));
        JsonNode last = r.json.get("lastValues");
        assertThat(last.get("t").asText()).isEqualTo("mar");
        assertThat(last.get("id").isNull()).isTrue();
        assertThat(last.get("flag").isNull()).isTrue();
        assertThat(last.has("otra")).isFalse();
        // Sin noteId no hay lastValues.
        Res plain = call("POST", "/api/sql/analyze", JSON.writeValueAsString(Map.of("content", n.content())));
        assertThat(plain.json.has("lastValues")).isFalse();
    }

    @Test
    void q24_failed_execute_does_not_remember_values() throws Exception {
        Note n = sqlNote("SELECT * FROM book WHERE year > #{y,int}");
        call("POST", "/api/sql/execute", exec(n, "{\"y\":\"abc\"}"));
        call("POST", "/api/sql/execute", exec(n, "{\"y\":\"1990\"}"));
        Res r = call("POST", "/api/sql/analyze", JSON.writeValueAsString(Map.of("content", n.content(), "noteId", n.id())));
        assertThat(r.json.get("lastValues").size()).isZero();
    }

    @Test
    void s06_q45_update_is_never_executed_and_returns_final_sql() throws Exception {
        Note n = sqlNote("UPDATE book SET title = #{t} WHERE id = #{id,int}");
        // Sin conexión configurada: si llegara al driver respondería 503.
        Res r = call("POST", "/api/sql/execute", exec(n, "{\"t\":\"O'Brien\",\"id\":\"7\"}"));
        assertThat(r.status).isEqualTo(200);
        assertThat(r.json.get("kind").asText()).isEqualTo("statement");
        assertThat(r.json.get("warning").asText())
                .isEqualTo("LiteDD solo ejecuta consultas. Copia la sentencia para ejecutarla en otra herramienta.");
        assertThat(r.json.get("finalSql").get("inlined").asText()).isEqualTo("UPDATE book SET title = 'O\\'Brien' WHERE id = 7");
        assertThat(r.json.get("finalSql").get("parameters")).hasSize(2);
    }

    @Test
    void s02_q95_forbidden_clause_is_not_executed() throws Exception {
        Note n = sqlNote("SELECT * FROM book FOR UPDATE");
        Res r = call("POST", "/api/sql/execute", exec(n, "{}"));
        assertThat(r.status).isEqualTo(200);
        assertThat(r.json.get("kind").asText()).isEqualTo("statement");
        assertThat(r.json.get("forbiddenClause").asText()).isEqualTo("FOR UPDATE");
    }

    @Test
    void s03_dollar_substitution_cannot_add_a_second_statement() throws Exception {
        Note n = sqlNote("SELECT * FROM book ORDER BY ${col}");
        Res r = call("POST", "/api/sql/execute", exec(n, "{\"col\":\"1; DROP TABLE book\"}"));
        assertThat(r.status).isEqualTo(422);
        assertThat(r.json.get("details").get(0).get("code").asText()).isEqualTo("multiple_statements");
    }

    @Test
    void q22_q93_invalid_value_is_reported_per_field_without_executing() throws Exception {
        Note n = sqlNote("SELECT * FROM book WHERE year > #{y,int}");
        Res r = call("POST", "/api/sql/execute", exec(n, "{\"y\":\"abc\"}"));
        assertThat(r.status).isEqualTo(422);
        assertThat(r.json.get("code").asText()).isEqualTo("invalid_values");
        assertThat(r.json.get("details").get("y").asText()).contains("entero");
    }

    @Test
    void a04_a05_stale_version_is_409() throws Exception {
        Note n = sqlNote("SELECT 1");
        String body = "{\"noteId\":\"" + n.id() + "\",\"version\":1,\"executionId\":\"e1\",\"values\":{},\"page\":1,\"pageSize\":20}";
        Res r = call("POST", "/api/sql/execute", body);
        assertThat(r.status).isEqualTo(409);
        assertThat(r.json.get("code").asText()).isEqualTo("stale_version");
    }

    @Test
    void q46_c02_query_without_connection_reports_it() throws Exception {
        Note n = sqlNote("SELECT 1");
        Res r = call("POST", "/api/sql/execute", exec(n, "{}"));
        assertThat(r.status).isEqualTo(503);
        assertThat(r.json.get("code").asText()).isEqualTo("not_configured");
    }

    @Test
    void q71_q72_render_without_executing() throws Exception {
        Note n = sqlNote("SELECT * FROM book WHERE title = #{t} AND year > #{y,int}");
        Res r = call("POST", "/api/sql/render", exec(n, "{\"t\":\"mar\",\"y\":\"1990\"}"));
        assertThat(r.status).isEqualTo(200);
        assertThat(r.json.get("kind").asText()).isEqualTo("query");
        JsonNode sql = r.json.get("finalSql");
        assertThat(sql.get("withPlaceholders").asText()).isEqualTo("SELECT * FROM book WHERE title = ? AND year > ?");
        assertThat(sql.get("parameters").get(1).get("value").asInt()).isEqualTo(1990);
        assertThat(sql.get("parameters").get(1).get("type").asText()).isEqualTo("int");
        assertThat(sql.get("inlined").asText()).isEqualTo("SELECT * FROM book WHERE title = 'mar' AND year > 1990");
    }

    @Test
    void execute_rejects_markdown_notes_and_bad_pages() throws Exception {
        Note md = notes.create(null, "md", "Texto");
        assertThat(call("POST", "/api/sql/execute", exec(md, "{}")).status).isEqualTo(400);
        Note n = sqlNote("SELECT 1");
        String body = "{\"noteId\":\"" + n.id() + "\",\"version\":" + n.version() + ",\"values\":{},\"page\":0,\"pageSize\":20}";
        assertThat(call("POST", "/api/sql/execute", body).status).isEqualTo(400);
    }

    @Test
    void s05_q43_default_limits() {
        assertThat(SqlApi.DEFAULT_TIMEOUT_SECONDS).isEqualTo(30);
        assertThat(SqlApi.DEFAULT_ROW_CAP).isEqualTo(10_000);
    }

    @Test
    void q41_cancel_unknown_execution_is_harmless() throws Exception {
        Res r = call("POST", "/api/sql/cancel", "{\"executionId\":\"no-existe\"}");
        assertThat(r.status).isEqualTo(200);
        assertThat(r.json.get("cancelled").asBoolean()).isFalse();
    }

    @Test
    void s22_log_has_no_values_and_sql_only_at_debug() throws Exception {
        Logger root = (Logger) LoggerFactory.getLogger(org.slf4j.Logger.ROOT_LOGGER_NAME);
        Logger sqlLog = (Logger) LoggerFactory.getLogger("dev.litedd");
        Level previous = sqlLog.getLevel();
        ListAppender<ILoggingEvent> appender = new ListAppender<>();
        appender.start();
        root.addAppender(appender);
        try {
            Note n = sqlNote("UPDATE book SET title = #{t} WHERE id = 1");
            sqlLog.setLevel(Level.INFO);
            call("POST", "/api/sql/execute", exec(n, "{\"t\":\"valor-secreto-123\"}"));
            assertThat(appender.list).noneMatch(e -> e.getFormattedMessage().contains("UPDATE book"));

            sqlLog.setLevel(Level.DEBUG);
            call("POST", "/api/sql/execute", exec(n, "{\"t\":\"valor-secreto-123\"}"));
            assertThat(appender.list).anyMatch(e -> e.getLevel() == Level.DEBUG && e.getFormattedMessage().contains("UPDATE book"));
            assertThat(appender.list).noneMatch(e -> e.getFormattedMessage().contains("valor-secreto-123"));
        } finally {
            root.detachAppender(appender);
            sqlLog.setLevel(previous);
        }
    }

    @Test
    void s21_c01_connection_never_returns_the_password() throws Exception {
        Res empty = call("GET", "/api/connection", null);
        assertThat(empty.json.get("configured").asBoolean()).isFalse();
        assertThat(empty.json.get("host").asText()).isEqualTo("127.0.0.1");
        assertThat(empty.json.get("port").asInt()).isEqualTo(3306);

        Res saved = call("PUT", "/api/connection", """
                {"host":"127.0.0.1","port":1,"user":"lector","password":"secreto","schema":"litedd_demo","extraParams":""}""");
        assertThat(saved.status).isEqualTo(200);
        Res got = call("GET", "/api/connection", null);
        assertThat(got.json.has("password")).isFalse();
        assertThat(got.json.get("hasPassword").asBoolean()).isTrue();
        assertThat(got.raw).doesNotContain("secreto");
    }

    @Test
    void adr0012_empty_password_keeps_the_saved_one() throws Exception {
        call("PUT", "/api/connection", """
                {"host":"127.0.0.1","port":1,"user":"lector","password":"secreto","schema":"litedd_demo","extraParams":""}""");
        call("PUT", "/api/connection", """
                {"host":"127.0.0.1","port":1,"user":"lector","password":"","schema":"otro","extraParams":""}""");
        assertThat(file.load().orElseThrow().password()).isEqualTo("secreto");
        assertThat(file.load().orElseThrow().schema()).isEqualTo("otro");
    }

    @Test
    void c05_put_rejects_allow_multi_queries() throws Exception {
        Res r = call("PUT", "/api/connection", """
                {"host":"127.0.0.1","port":3306,"user":"lector","password":"x","schema":"s","extraParams":"allowMultiQueries=true"}""");
        assertThat(r.status).isEqualTo(400);
        assertThat(file.load()).isEmpty();
    }

    @Test
    void c09_status_and_c03_test_against_a_closed_port() throws Exception {
        assertThat(call("GET", "/api/connection/status", null).json.get("state").asText()).isEqualTo("not_configured");
        call("PUT", "/api/connection", """
                {"host":"127.0.0.1","port":1,"user":"lector","password":"x","schema":"s","extraParams":""}""");
        JsonNode status = call("GET", "/api/connection/status", null).json;
        assertThat(status.get("state").asText()).isEqualTo("disconnected");
        assertThat(status.get("user").asText()).isEqualTo("lector");
        assertThat(status.has("password")).isFalse();

        Res test = call("POST", "/api/connection/test", """
                {"host":"127.0.0.1","port":1,"user":"lector","password":"","extraParams":""}""");
        assertThat(test.status).isEqualTo(422);
        assertThat(test.json.get("code").asText()).isEqualTo("connection_failed");

        assertThat(call("POST", "/api/connection/reconnect", null).json.get("state").asText()).isEqualTo("disconnected");
    }

    @Test
    void c03_system_schemas_are_hidden() {
        assertThat(MySqlGateway.userSchemas(List.of("information_schema", "litedd_demo", "mysql", "performance_schema", "sys", "otro")))
                .containsExactly("litedd_demo", "otro");
    }

    private record Res(int status, JsonNode json, String raw) {
    }

    private Res call(String method, String path, String body) throws Exception {
        HttpRequest.Builder b = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + path))
                .header("X-LiteDD-Token", TOKEN)
                .header("Content-Type", "application/json")
                .method(method, body == null ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofString(body));
        HttpResponse<String> r = client.send(b.build(), HttpResponse.BodyHandlers.ofString());
        return new Res(r.statusCode(), r.body().isEmpty() ? null : JSON.readTree(r.body()), r.body());
    }
}
