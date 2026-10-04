package dev.litedd.mysql;

import com.zaxxer.hikari.HikariConfig;
import dev.litedd.http.ApiError;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.PosixFilePermission;
import java.nio.file.attribute.PosixFilePermissions;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

/** URL, pool y fichero de conexión (C-05 a C-08, S-04, S-20). */
class ConnectionConfigTest {

    @TempDir
    Path dir;

    private static ConnectionSettings settings(String extra) {
        return new ConnectionSettings("127.0.0.1", 3306, "lector", "secreto", "litedd_demo", extra);
    }

    @Test
    void c05_c06_url_has_the_fixed_parameters() {
        assertThat(JdbcUrl.build(settings(""), true)).isEqualTo("jdbc:mysql://127.0.0.1:3306/litedd_demo?useSSL=false"
                + "&allowPublicKeyRetrieval=true&characterEncoding=UTF-8&allowMultiQueries=false&tinyInt1isBit=false"
                + "&zeroDateTimeBehavior=CONVERT_TO_NULL&connectTimeout=5000");
    }

    @Test
    void c05_extra_parameters_go_after_and_schema_is_optional() {
        String url = JdbcUrl.build(settings("?serverTimezone=UTC&useCompression=true"), false);
        assertThat(url).startsWith("jdbc:mysql://127.0.0.1:3306/?useSSL=false");
        assertThat(url).endsWith("&connectTimeout=5000&serverTimezone=UTC&useCompression=true");
    }

    @Test
    void c05_c08_adr0012_dangerous_parameters_are_rejected() {
        for (String extra : new String[]{"allowMultiQueries=true", "ALLOWMULTIQUERIES=yes", "a=1&autoReconnect=true",
                "allowLoadLocalInfile=true", "allowLoadLocalInfileInPath=/tmp", "allowUrlInLocalInfile=true"}) {
            assertThatThrownBy(() -> JdbcUrl.validateExtra(extra)).as(extra).isInstanceOf(ApiError.class);
        }
        JdbcUrl.validateExtra("serverTimezone=UTC");
        JdbcUrl.validateExtra("");
        JdbcUrl.validateExtra(null);
    }

    @Test
    void s04_c07_pool_is_read_only_and_small() {
        HikariConfig cfg = MySqlGateway.poolConfig(settings(""));
        assertThat(cfg.getConnectionInitSql()).isEqualTo("SET SESSION TRANSACTION READ ONLY");
        assertThat(cfg.isReadOnly()).isTrue();
        assertThat(cfg.getMaximumPoolSize()).isEqualTo(3);
        assertThat(cfg.getMinimumIdle()).isZero();
        assertThat(cfg.getMaxLifetime()).isEqualTo(600_000);
        assertThat(cfg.getConnectionTimeout()).isEqualTo(5_000);
        // C-02: se crea aunque el servidor no responda.
        assertThat(cfg.getInitializationFailTimeout()).isEqualTo(-1);
        assertThat(cfg.getJdbcUrl()).contains("allowMultiQueries=false");
    }

    @Test
    void c08_pool_validates_on_every_borrow() {
        MySqlGateway.poolConfig(settings(""));
        assertThat(System.getProperty("com.zaxxer.hikari.aliveBypassWindowMs")).isEqualTo("0");
    }

    @Test
    void c11_changing_the_connection_cancels_running_queries() {
        MySqlGateway gateway = new MySqlGateway();
        try {
            java.util.concurrent.atomic.AtomicBoolean cancelled = new java.util.concurrent.atomic.AtomicBoolean();
            java.sql.Statement statement = (java.sql.Statement) java.lang.reflect.Proxy.newProxyInstance(
                    getClass().getClassLoader(), new Class<?>[]{java.sql.Statement.class}, (proxy, method, args) -> {
                        if (method.getName().equals("cancel")) {
                            cancelled.set(true);
                        }
                        return null;
                    });
            gateway.running().register("en-curso", statement);
            gateway.configure(new ConnectionSettings("127.0.0.1", 1, "lector", "x", "s", ""));
            assertThat(cancelled).isTrue();
            assertThat(gateway.status().state()).isEqualTo("disconnected");
        } finally {
            gateway.close();
        }
    }

    @Test
    void s20_connection_file_round_trip() {
        ConnectionFile file = new ConnectionFile(dir.resolve("litedd/connection.json"));
        assertThat(file.load()).isEmpty();
        file.save(settings("serverTimezone=UTC"));
        assertThat(file.load()).contains(settings("serverTimezone=UTC"));
    }

    @Test
    void s20_connection_file_is_private_on_posix() throws Exception {
        assumeTrue(dir.getFileSystem().supportedFileAttributeViews().contains("posix"), "Solo en sistemas POSIX (ADR-0004)");
        Path path = dir.resolve("litedd/connection.json");
        new ConnectionFile(path).save(settings(""));
        Set<PosixFilePermission> perms = Files.getPosixFilePermissions(path);
        assertThat(PosixFilePermissions.toString(perms)).isEqualTo("rw-------");
    }
}
