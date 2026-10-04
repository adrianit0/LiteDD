package dev.litedd.store;

import org.apache.ibatis.session.SqlSession;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class StoreTest {

    @TempDir
    Path dir;
    Store store;

    @BeforeEach
    void open() {
        store = Store.open(dir.resolve("litedd.db"), dir.resolve("backups"));
    }

    @AfterEach
    void close() {
        store.close();
    }

    @Test
    void d01_pragmas_on_write_and_read_connections() {
        List<String> write = store.write(s -> pragmas(s.getConnection()));
        List<String> read = store.read(s -> pragmas(s.getConnection()));
        // foreign_keys=1, journal_mode=wal, synchronous=1 (NORMAL)
        assertThat(write).containsExactly("1", "wal", "1");
        assertThat(read).containsExactly("1", "wal", "1");
    }

    @Test
    void d01_foreign_keys_are_enforced() {
        assertThatThrownBy(() -> store.write(s -> exec(s,
                "INSERT INTO note_tag(note_id, tag_id) VALUES ('missing', 1)")))
                .hasRootCauseInstanceOf(SQLException.class);
    }

    @Test
    void d02_initial_migration_sets_user_version() {
        assertThat(readScalar("PRAGMA user_version")).isEqualTo(String.valueOf(Migrator.MIGRATIONS.size()));
        assertThat(readScalar("SELECT count(*) FROM sqlite_master WHERE name IN "
                + "('note','tag','note_tag','note_version','attachment','variable_value','tab','setting','note_fts')"))
                .isEqualTo("9");
    }

    @Test
    void d02_reopening_does_not_migrate_or_back_up_again() {
        store.close();
        store = Store.open(dir.resolve("litedd.db"), dir.resolve("backups"));
        assertThat(dir.resolve("backups")).doesNotExist();
    }

    @Test
    void d06_mybatis_session_runs_on_store_connections() {
        store.write(s -> exec(s, "INSERT INTO setting(key, value) VALUES ('k', '1')"));
        assertThat(readScalar("SELECT value FROM setting WHERE key = 'k'")).isEqualTo("1");
    }

    @Test
    void d07_writes_are_serialized() throws Exception {
        store.write(s -> exec(s, "CREATE TABLE counter (n INTEGER)"));
        store.write(s -> exec(s, "INSERT INTO counter VALUES (0)"));
        AtomicInteger inside = new AtomicInteger();
        List<Integer> maxInside = Collections.synchronizedList(new ArrayList<>());
        ExecutorService pool = Executors.newFixedThreadPool(8);
        CountDownLatch start = new CountDownLatch(1);
        for (int i = 0; i < 40; i++) {
            pool.submit(() -> {
                start.await();
                return store.write(s -> {
                    maxInside.add(inside.incrementAndGet());
                    // Lectura y escritura separadas: solo es correcto si nadie más escribe a la vez.
                    int n = Integer.parseInt(query(s, "SELECT n FROM counter"));
                    exec(s, "UPDATE counter SET n = " + (n + 1));
                    inside.decrementAndGet();
                    return null;
                });
            });
        }
        start.countDown();
        pool.shutdown();
        assertThat(pool.awaitTermination(30, TimeUnit.SECONDS)).isTrue();
        assertThat(maxInside).allMatch(n -> n == 1);
        assertThat(readScalar("SELECT n FROM counter")).isEqualTo("40");
    }

    @Test
    void d07_reads_run_in_parallel_with_a_write() throws Exception {
        CountDownLatch writing = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        Thread writer = new Thread(() -> store.write(s -> {
            exec(s, "INSERT INTO setting(key, value) VALUES ('w', '1')");
            writing.countDown();
            try {
                release.await();
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
            return null;
        }));
        writer.start();
        writing.await();
        // La escritura sigue abierta y la lectura no se bloquea ni ve datos sin confirmar.
        assertThat(readScalar("SELECT count(*) FROM setting WHERE key = 'w'")).isEqualTo("0");
        release.countDown();
        writer.join();
        assertThat(readScalar("SELECT count(*) FROM setting WHERE key = 'w'")).isEqualTo("1");
    }

    @Test
    void write_rolls_back_on_failure() {
        assertThatThrownBy(() -> store.write(s -> {
            exec(s, "INSERT INTO setting(key, value) VALUES ('x', '1')");
            throw new IllegalStateException("fallo");
        })).isInstanceOf(IllegalStateException.class);
        assertThat(readScalar("SELECT count(*) FROM setting")).isEqualTo("0");
    }

    @Test
    void creates_parent_directories() {
        Path nested = dir.resolve("a/b/litedd.db");
        Store.open(nested, dir.resolve("a/backups")).close();
        assertThat(Files.exists(nested)).isTrue();
    }

    static List<String> pragmas(Connection c) {
        try (Statement st = c.createStatement()) {
            List<String> out = new ArrayList<>();
            for (String p : List.of("foreign_keys", "journal_mode", "synchronous")) {
                try (ResultSet rs = st.executeQuery("PRAGMA " + p)) {
                    rs.next();
                    out.add(rs.getString(1));
                }
            }
            return out;
        } catch (SQLException e) {
            throw new RuntimeException(e);
        }
    }

    String readScalar(String sql) {
        return store.read(s -> query(s, sql));
    }

    static String query(SqlSession s, String sql) {
        try (Statement st = s.getConnection().createStatement(); ResultSet rs = st.executeQuery(sql)) {
            rs.next();
            return rs.getString(1);
        } catch (SQLException e) {
            throw new RuntimeException(e);
        }
    }

    static Void exec(SqlSession s, String sql) {
        try (Statement st = s.getConnection().createStatement()) {
            st.executeUpdate(sql);
            return null;
        } catch (SQLException e) {
            throw new RuntimeException(e);
        }
    }
}
