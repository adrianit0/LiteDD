package dev.litedd.store;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.List;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class MigratorTest {

    @TempDir
    Path dir;

    @Test
    void d02_applies_pending_migrations_in_order() throws Exception {
        try (Connection c = connect()) {
            new Migrator(List.of("test-migrations/V001__a.sql", "test-migrations/V002__b.sql"), dir).migrate(c);
            assertThat(userVersion(c)).isEqualTo(2);
            assertThat(scalar(c, "SELECT group_concat(name, ',') FROM (SELECT name FROM t ORDER BY name)")).isEqualTo("a,b");
        }
    }

    @Test
    void d02_backs_up_before_migrating_an_existing_database() throws Exception {
        try (Connection c = connect()) {
            new Migrator(List.of("test-migrations/V001__a.sql"), dir).migrate(c);
            assertThat(backups()).isEmpty();

            new Migrator(List.of("test-migrations/V001__a.sql", "test-migrations/V002__b.sql"), dir).migrate(c);
            assertThat(backups()).hasSize(1);
            // La copia conserva el estado anterior a la migración.
            try (Connection copy = DriverManager.getConnection("jdbc:sqlite:" + backups().getFirst())) {
                assertThat(userVersion(copy)).isEqualTo(1);
            }
        }
    }

    @Test
    void n07_v002_adds_an_empty_description_and_keeps_existing_notes_searchable() throws Exception {
        try (Connection c = connect()) {
            new Migrator(Migrator.MIGRATIONS.subList(0, 1), dir).migrate(c);
            try (Statement st = c.createStatement()) {
                st.execute("""
                        INSERT INTO note (id, parent_id, position, type, title, content, created_at, updated_at)
                        VALUES ('n1', NULL, 0, 'md', 'Préstamos', 'tabla loan', '2026-10-04T08:00:00Z', '2026-10-04T08:00:00Z')""");
            }
            new Migrator(Migrator.MIGRATIONS, dir).migrate(c);
            assertThat(scalar(c, "SELECT description FROM note WHERE id = 'n1'")).isEmpty();
            assertThat(scalar(c, "SELECT count(*) FROM note_fts WHERE note_fts MATCH '\"prestamos\"'")).isEqualTo("1");
            try (Statement st = c.createStatement()) {
                st.execute("UPDATE note SET description = 'resumen trimestral' WHERE id = 'n1'");
            }
            assertThat(scalar(c, "SELECT count(*) FROM note_fts WHERE note_fts MATCH '\"trimestral\"'")).isEqualTo("1");
        }
    }

    @Test
    void h01_v003_admits_http_notes_and_keeps_every_related_row() throws Exception {
        try (Connection c = connect()) {
            try (Statement st = c.createStatement()) {
                st.execute("PRAGMA foreign_keys = ON");
            }
            new Migrator(Migrator.MIGRATIONS.subList(0, 2), dir).migrate(c);
            try (Statement st = c.createStatement()) {
                st.execute("""
                        INSERT INTO note (id, parent_id, position, type, title, content, description, created_at, updated_at)
                        VALUES ('m', NULL, 0, 'md', 'Préstamos', 'tabla loan', 'resumen', '2026-10-04T08:00:00Z', '2026-10-04T08:00:00Z'),
                               ('s', 'm', 0, 'sql', 'Consulta', 'SELECT 1', '', '2026-10-04T08:00:00Z', '2026-10-04T08:00:00Z')""");
                st.execute("INSERT INTO tag (id, name) VALUES (1, 'demo')");
                st.execute("INSERT INTO note_tag (note_id, tag_id) VALUES ('m', 1)");
                st.execute("INSERT INTO note_version (note_id, title, content, saved_at) VALUES ('m', 'P', 'v1', '2026-10-04T08:00:00Z')");
                st.execute("INSERT INTO attachment (id, note_id, name, mime, data, created_at) VALUES ('a1', 'm', 'x.png', 'image/png', x'00', 'now')");
                st.execute("INSERT INTO variable_value (note_id, name, value) VALUES ('s', 'id', '5')");
                st.execute("INSERT INTO tab (id, note_id, position, active, mode) VALUES ('t1', 's', 0, 1, 'view')");
            }
            String ridBefore = scalar(c, "SELECT rid FROM note WHERE id = 'm'");

            new Migrator(Migrator.MIGRATIONS, dir).migrate(c);

            assertThat(userVersion(c)).isEqualTo(Migrator.MIGRATIONS.size());
            assertThat(scalar(c, "SELECT count(*) FROM note")).isEqualTo("2");
            assertThat(scalar(c, "SELECT rid FROM note WHERE id = 'm'")).isEqualTo(ridBefore);
            assertThat(scalar(c, "SELECT description FROM note WHERE id = 'm'")).isEqualTo("resumen");
            assertThat(scalar(c, "SELECT parent_id FROM note WHERE id = 's'")).isEqualTo("m");
            for (String table : List.of("note_tag", "note_version", "attachment", "variable_value", "tab")) {
                assertThat(scalar(c, "SELECT count(*) FROM " + table)).as(table).isEqualTo("1");
            }
            // La búsqueda sigue funcionando sobre las filas copiadas y sobre las nuevas.
            assertThat(scalar(c, "SELECT count(*) FROM note_fts WHERE note_fts MATCH '\"prestamos\"'")).isEqualTo("1");
            try (Statement st = c.createStatement()) {
                st.execute("""
                        INSERT INTO note (id, parent_id, position, type, title, content, created_at, updated_at)
                        VALUES ('h', NULL, 1, 'http', 'Login', '{}', '2026-10-06T08:00:00Z', '2026-10-06T08:00:00Z')""");
                assertThatThrownBy(() -> st.execute("""
                        INSERT INTO note (id, parent_id, position, type, title, content, created_at, updated_at)
                        VALUES ('x', NULL, 2, 'txt', 'X', '', 'now', 'now')""")).isInstanceOf(SQLException.class);
            }
            assertThat(scalar(c, "SELECT count(*) FROM note_fts WHERE note_fts MATCH '\"login\"'")).isEqualTo("1");
            // Las claves ajenas vuelven a estar activas y en cascada.
            assertThat(scalar(c, "PRAGMA foreign_keys")).isEqualTo("1");
            try (Statement st = c.createStatement()) {
                st.execute("DELETE FROM note WHERE id = 's'");
            }
            assertThat(scalar(c, "SELECT count(*) FROM tab")).isEqualTo("0");
            assertThat(scalar(c, "SELECT count(*) FROM variable_value")).isEqualTo("0");
            assertThat(backups()).hasSize(1);
        }
    }

    @Test
    void d02_keeps_only_two_premigration_backups() throws Exception {
        Files.createDirectories(dir);
        for (String name : List.of("litedd-20260101-000000-premigracion.db", "litedd-20260102-000000-premigracion.db",
                "litedd-20260103-000000-premigracion.db")) {
            Files.writeString(dir.resolve(name), "");
        }
        try (Connection c = connect()) {
            new Migrator(List.of("test-migrations/V001__a.sql"), dir).migrate(c);
            new Migrator(List.of("test-migrations/V001__a.sql", "test-migrations/V002__b.sql"), dir).migrate(c);
        }
        List<String> kept = backups().stream().map(p -> p.getFileName().toString()).toList();
        // Quedan la copia recién hecha y la anterior más reciente.
        assertThat(kept).hasSize(2).contains("litedd-20260103-000000-premigracion.db")
                .doesNotContain("litedd-20260101-000000-premigracion.db", "litedd-20260102-000000-premigracion.db");
    }

    @Test
    void d02_failed_migration_is_rolled_back() throws Exception {
        try (Connection c = connect()) {
            Migrator m = new Migrator(List.of("test-migrations/V001__a.sql", "test-migrations/V002__broken.sql"), dir);
            assertThatThrownBy(() -> m.migrate(c)).isInstanceOf(IllegalStateException.class);
            assertThat(userVersion(c)).isEqualTo(1);
            assertThat(scalar(c, "SELECT count(*) FROM t")).isEqualTo("1");
        }
    }

    @Test
    void d02_refuses_a_newer_database() throws Exception {
        try (Connection c = connect()) {
            try (Statement st = c.createStatement()) {
                st.execute("PRAGMA user_version = 99");
            }
            assertThatThrownBy(() -> new Migrator(List.of("test-migrations/V001__a.sql"), dir).migrate(c))
                    .hasMessageContaining("más reciente");
        }
    }

    @Test
    void splits_statements_keeping_trigger_bodies_whole() {
        List<String> parts = Migrator.split("""
                -- comentario
                CREATE TABLE a (x TEXT DEFAULT ';');
                CREATE TRIGGER tr AFTER INSERT ON a BEGIN
                  INSERT INTO a VALUES ('1');
                  INSERT INTO a VALUES ('2');
                END;
                """);
        assertThat(parts).hasSize(2);
        assertThat(parts.get(1)).contains("BEGIN").contains("'2'").endsWith("END");
    }

    private Connection connect() throws SQLException {
        return DriverManager.getConnection("jdbc:sqlite:" + dir.resolve("m.db"));
    }

    private List<Path> backups() throws IOException {
        try (Stream<Path> s = Files.list(dir)) {
            return s.filter(p -> p.getFileName().toString().endsWith("-premigracion.db")).sorted().toList();
        }
    }

    private static int userVersion(Connection c) throws SQLException {
        return Integer.parseInt(scalar(c, "PRAGMA user_version"));
    }

    private static String scalar(Connection c, String sql) throws SQLException {
        try (Statement st = c.createStatement(); ResultSet rs = st.executeQuery(sql)) {
            rs.next();
            return rs.getString(1);
        }
    }
}
