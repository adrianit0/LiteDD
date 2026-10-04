package dev.litedd.mysql;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.litedd.http.HttpServer;
import dev.litedd.notes.Note;
import dev.litedd.notes.NoteService;
import dev.litedd.notes.VariableValues;
import dev.litedd.sqlengine.SqlEngine;
import dev.litedd.store.Store;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.junit.jupiter.api.io.TempDir;

import java.net.ServerSocket;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

/**
 * Pruebas contra un MySQL real (perfil -Pit, ADR-0013). Leen LITEDD_IT_HOST, LITEDD_IT_PORT,
 * LITEDD_IT_USER y LITEDD_IT_PASSWORD; crean y borran su propio esquema litedd_it y no tocan otro.
 */
@Tag("mysql")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class MySqlIntegrationTest {

    private static final String SCHEMA = "litedd_it";
    private static final String TOKEN = "test-token-0123456789abcdefghijklmnop";
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final int TIMEOUT_SECONDS = 2;

    @TempDir
    Path dir;
    ConnectionSettings settings;
    Store store;
    NoteService notes;
    MySqlGateway gateway;
    HttpServer server;
    HttpClient client = HttpClient.newHttpClient();
    int port;

    @BeforeAll
    void setUp() throws Exception {
        String host = System.getenv("LITEDD_IT_HOST");
        assumeTrue(host != null && !host.isBlank(), "Faltan las variables LITEDD_IT_*");
        String p = System.getenv("LITEDD_IT_PORT");
        settings = new ConnectionSettings(host, p == null || p.isBlank() ? 3306 : Integer.parseInt(p),
                System.getenv("LITEDD_IT_USER"), System.getenv("LITEDD_IT_PASSWORD"), SCHEMA, "");
        createSchema();

        try (ServerSocket s = new ServerSocket(0)) {
            port = s.getLocalPort();
        }
        store = Store.open(dir.resolve("litedd.db"), dir.resolve("backups"));
        notes = new NoteService(store);
        gateway = new MySqlGateway();
        gateway.configure(settings);
        server = new HttpServer(port, TOKEN, List.of(
                new SqlApi(notes, new VariableValues(store), new SqlEngine(), gateway, TIMEOUT_SECONDS, SqlApi.DEFAULT_ROW_CAP),
                new ConnectionApi(new ConnectionFile(dir.resolve("connection.json")), gateway))).start();
    }

    @AfterAll
    void tearDown() throws Exception {
        if (settings == null) {
            return;
        }
        server.stop();
        gateway.close();
        store.close();
        try (Connection c = admin(); Statement st = c.createStatement()) {
            st.execute("DROP DATABASE IF EXISTS " + SCHEMA);
        }
    }

    // --- Criterios de aceptación del Sprint 3 ---

    @Test
    void sprint3_q32_demo_query_with_variables_returns_a_page_through_jdbc() throws Exception {
        Note n = sqlNote("""
                SELECT b.id, b.title, a.name AS author
                FROM book b JOIN author a ON a.id = b.author_id
                <where>
                  <if test="title != null">AND b.title LIKE CONCAT('%', #{title}, '%')</if>
                  <if test="minYear != null">AND b.year >= #{minYear,int}</if>
                  <if test="authorIds != null">AND a.id IN
                    <foreach collection="authorIds" item="id" open="(" separator="," close=")">#{id,int}</foreach>
                  </if>
                </where>""");
        JsonNode r = execute(n, Map.of("title", "Libro", "minYear", "2000", "authorIds", "1, 2"), 1, 5, null).json;
        assertThat(r.get("kind").asText()).isEqualTo("query");
        assertThat(r.get("columns")).extracting(c -> c.get("label").asText()).containsExactly("id", "title", "author");
        assertThat(r.get("rows").size()).isBetween(1, 5);
        assertThat(r.get("finalSql").get("parameters")).hasSize(4);
        assertThat(r.get("serverMillis").asLong()).isNotNegative();
    }

    @Test
    void s04_update_rejected_by_classification_and_by_read_only_session() throws Exception {
        Note n = sqlNote("UPDATE book SET title = 'x'");
        assertThat(execute(n, Map.of(), 1, 20, null).json.get("kind").asText()).isEqualTo("statement");
        // Forzando el envío: la sesión de solo lectura lo rechaza (1792).
        assertThatThrownBy(() -> gateway.withConnection(c -> {
            try (Statement st = c.createStatement()) {
                return st.executeUpdate("UPDATE book SET title = 'x'");
            }
        })).isInstanceOfSatisfying(SQLException.class, e -> assertThat(e.getErrorCode()).isIn(1792, 1290));
        assertThat(scalar("SELECT COUNT(*) FROM " + SCHEMA + ".book WHERE title = 'x'")).isEqualTo("0");
    }

    @Test
    void c03_test_lists_schemas_without_system_ones() throws Exception {
        String body = JSON.writeValueAsString(Map.of("host", settings.host(), "port", settings.port(), "user", settings.user(),
                "password", settings.password() == null ? "" : settings.password(), "extraParams", ""));
        JsonNode r = call("POST", "/api/connection/test", body).json;
        List<String> schemas = new ArrayList<>();
        r.get("schemas").forEach(s -> schemas.add(s.asText()));
        assertThat(schemas).contains(SCHEMA).doesNotContain("mysql", "sys", "information_schema", "performance_schema");
    }

    @Test
    void c09_status_is_connected() throws Exception {
        JsonNode s = call("GET", "/api/connection/status", null).json;
        assertThat(s.get("state").asText()).isEqualTo("connected");
        assertThat(s.get("schema").asText()).isEqualTo(SCHEMA);
    }

    // --- T-22 a T-28 ---

    @Test
    void t22_duplicate_column_names_page_sort_and_count() throws Exception {
        Note n = sqlNote("SELECT a.id, b.id FROM author a JOIN book b ON b.author_id = a.id");
        JsonNode r = execute(n, Map.of(), 1, 5, Map.of("column", 2, "direction", "desc")).json;
        assertThat(r.get("columns")).extracting(c -> c.get("label").asText()).containsExactly("id", "id");
        assertThat(r.get("rows")).hasSize(5);
        assertThat(r.get("rows").get(0).get(1).asInt()).isEqualTo(21);
        assertThat(r.get("hasMore").asBoolean()).isTrue();
        // COUNT(*) con el envoltorio falla por la columna repetida (1060): se cuenta en streaming.
        assertThat(count(n).json.get("total").asLong()).isEqualTo(21);
    }

    @Test
    void q57_note_with_order_by_and_duplicate_columns_explains_how_to_fix_it() throws Exception {
        Note n = sqlNote("SELECT a.id, b.id FROM author a JOIN book b ON b.author_id = a.id ORDER BY b.id");
        Res r = execute(n, Map.of(), 1, 5, Map.of("column", 1, "direction", "asc"));
        assertThat(r.status).isEqualTo(422);
        assertThat(r.json.get("message").asText()).contains("1060").contains("quita ORDER BY y LIMIT");
    }

    @Test
    void t23_extra_row_means_more_and_short_page_gives_total() throws Exception {
        JsonNode full = execute(sqlNote("SELECT id FROM book"), Map.of(), 1, 20, null).json;
        assertThat(full.get("rows")).hasSize(20);
        assertThat(full.get("hasMore").asBoolean()).isTrue();
        assertThat(full.has("total")).isFalse();
        JsonNode few = execute(sqlNote("SELECT id FROM book WHERE id <= 5"), Map.of(), 1, 20, null).json;
        assertThat(few.get("total").asLong()).isEqualTo(5);
    }

    @Test
    void t24_unlimited_over_cap() throws Exception {
        JsonNode r = execute(sqlNote("SELECT id FROM loan"), Map.of(), 1, null, null).json;
        assertThat(r.get("rows")).hasSize(10_000);
        assertThat(r.get("capReached").asBoolean()).isTrue();
    }

    @Test
    void t26_special_types_are_shown_without_exceptions() throws Exception {
        JsonNode r = execute(sqlNote("SELECT zero_date, blob_col, long_text, bit_col, tiny, dec_col, json_col FROM types"),
                Map.of(), 1, 20, null).json;
        JsonNode row = r.get("rows").get(0);
        assertThat(row.get(0).isNull()).isTrue();
        assertThat(row.get(1).asText()).isEqualTo("[BLOB 2,3 KB]");
        assertThat(row.get(2).asText()).hasSize(QueryRunner.MAX_CELL_CHARS);
        assertThat(r.get("truncatedCells").get(0).get(1).asInt()).isEqualTo(2);
        assertThat(row.get(3).asText()).isEqualTo("5");
        assertThat(row.get(4).asText()).isEqualTo("1");
        assertThat(row.get(5).asText()).isEqualTo("12.50");
        assertThat(row.get(6).asText()).contains("\"a\"");
        assertThat(r.get("columns").get(5).get("numeric").asBoolean()).isTrue();
    }

    @Test
    void q44_show_runs_as_it_is() throws Exception {
        JsonNode r = execute(sqlNote("SHOW TABLES"), Map.of(), 1, 20, null).json;
        assertThat(r.get("kind").asText()).isEqualTo("meta");
        assertThat(r.get("rows").size()).isGreaterThanOrEqualTo(4);
    }

    @Test
    void s05_t27_timeout_and_cancel_return_the_connection_to_the_pool() throws Exception {
        Res timeout = execute(sqlNote("SELECT SLEEP(5)"), Map.of(), 1, 20, null);
        assertThat(timeout.status).isEqualTo(422);
        assertThat(timeout.json.get("code").asText()).isEqualTo("timeout");
        assertThat(execute(sqlNote("SELECT 1"), Map.of(), 1, 20, null).status).isEqualTo(200);

        Note slow = sqlNote("SELECT SLEEP(1.5)");
        String body = executeBody(slow, Map.of(), 1, 20, null).replace("\"e1\"", "\"cancelame\"");
        CompletableFuture<Res> running = CompletableFuture.supplyAsync(() -> {
            try {
                return call("POST", "/api/sql/execute", body);
            } catch (Exception e) {
                throw new IllegalStateException(e);
            }
        });
        Thread.sleep(500);
        assertThat(call("POST", "/api/sql/cancel", "{\"executionId\":\"cancelame\"}").json.get("cancelled").asBoolean()).isTrue();
        Res cancelled = running.get();
        assertThat(cancelled.json.get("code").asText()).isEqualTo("cancelled");
        assertThat(execute(sqlNote("SELECT 1"), Map.of(), 1, 20, null).status).isEqualTo(200);
    }

    @Test
    void t28_q47_connection_killed_between_executions_is_retried() throws Exception {
        Note n = sqlNote("SELECT COUNT(*) FROM author");
        assertThat(execute(n, Map.of(), 1, 20, null).status).isEqualTo(200);
        try (Connection c = admin(); Statement st = c.createStatement()) {
            List<Long> ids = new ArrayList<>();
            try (ResultSet rs = st.executeQuery("SELECT id FROM information_schema.processlist WHERE db = '" + SCHEMA
                    + "' AND id <> CONNECTION_ID()")) {
                while (rs.next()) {
                    ids.add(rs.getLong(1));
                }
            }
            for (long id : ids) {
                st.execute("KILL " + id);
            }
        }
        Res again = execute(n, Map.of(), 1, 20, null);
        assertThat(again.status).isEqualTo(200);
        assertThat(again.json.get("rows").get(0).get(0).asInt()).isEqualTo(3);
    }

    @Test
    void c10_missing_schema_is_reported_and_reconnect_recovers() throws Exception {
        MySqlGateway other = new MySqlGateway();
        try {
            ConnectionSettings missing = new ConnectionSettings(settings.host(), settings.port(), settings.user(),
                    settings.password(), "litedd_it_no_existe", "");
            assertThat(other.configure(missing).state()).isEqualTo("schema_unavailable");
            assertThat(other.configure(settings).state()).isEqualTo("connected");
        } finally {
            other.close();
        }
    }

    // --- Utilidades ---

    private Note sqlNote(String content) {
        Note n = notes.create(null, "sql", "Consulta");
        return notes.save(n.id(), n.title(), content, n.version());
    }

    private String executeBody(Note n, Map<String, String> values, int page, Integer pageSize, Map<String, Object> sort)
            throws Exception {
        Map<String, Object> body = new java.util.HashMap<>();
        body.put("noteId", n.id());
        body.put("version", n.version());
        body.put("executionId", "e1");
        body.put("values", values);
        body.put("page", page);
        body.put("pageSize", pageSize);
        body.put("sort", sort);
        return JSON.writeValueAsString(body);
    }

    private Res execute(Note n, Map<String, String> values, int page, Integer pageSize, Map<String, Object> sort)
            throws Exception {
        return call("POST", "/api/sql/execute", executeBody(n, values, page, pageSize, sort));
    }

    private Res count(Note n) throws Exception {
        return call("POST", "/api/sql/count", executeBody(n, Map.of(), 1, 20, null));
    }

    private Connection admin() throws SQLException {
        ConnectionSettings noSchema = new ConnectionSettings(settings.host(), settings.port(), settings.user(),
                settings.password(), "", "");
        return DriverManager.getConnection(JdbcUrl.build(noSchema, false), settings.user(), settings.password());
    }

    private String scalar(String sql) throws SQLException {
        try (Connection c = admin(); Statement st = c.createStatement(); ResultSet rs = st.executeQuery(sql)) {
            rs.next();
            return rs.getString(1);
        }
    }

    /** Esquema inventado de S-31 más una tabla de tipos para T-26. */
    private void createSchema() throws SQLException {
        try (Connection c = admin(); Statement st = c.createStatement()) {
            st.execute("DROP DATABASE IF EXISTS " + SCHEMA);
            st.execute("CREATE DATABASE " + SCHEMA + " CHARACTER SET utf8mb4");
            st.execute("USE " + SCHEMA);
            st.execute("CREATE TABLE author (id INT PRIMARY KEY, name VARCHAR(100) NOT NULL, active TINYINT(1) NOT NULL)");
            st.execute("CREATE TABLE book (id INT PRIMARY KEY, title VARCHAR(200) NOT NULL, year INT, author_id INT NOT NULL)");
            st.execute("CREATE TABLE loan (id INT AUTO_INCREMENT PRIMARY KEY, book_id INT NOT NULL, loaned_at DATETIME NOT NULL,"
                    + " returned_at DATETIME NULL)");
            st.execute("INSERT INTO author VALUES (1, 'Autora Uno', 1), (2, 'Autor Dos', 1), (3, 'Autora Tres', 0)");
            st.execute("SET SESSION cte_max_recursion_depth = 20000");
            st.execute("INSERT INTO book (id, title, year, author_id) WITH RECURSIVE s(n) AS (SELECT 1 UNION ALL SELECT n + 1"
                    + " FROM s WHERE n < 21) SELECT n, CONCAT('Libro ', n), 1990 + n, 1 + n % 3 FROM s");
            st.execute("INSERT INTO loan (book_id, loaned_at) WITH RECURSIVE s(n) AS (SELECT 1 UNION ALL SELECT n + 1"
                    + " FROM s WHERE n < 10050) SELECT 1 + n % 21, '2026-01-01 10:00:00' FROM s");
            st.execute("CREATE TABLE types (zero_date DATETIME, blob_col BLOB, long_text LONGTEXT, bit_col BIT(3),"
                    + " tiny TINYINT(1), dec_col DECIMAL(10, 2), json_col JSON)");
            st.execute("SET SESSION sql_mode = ''");
            st.execute("INSERT INTO types VALUES ('0000-00-00 00:00:00', REPEAT(_binary 'a', 2355), REPEAT('x', 50000),"
                    + " b'101', 1, 12.50, '{\"a\": 1}')");
        }
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
