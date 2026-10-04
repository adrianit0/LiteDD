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
