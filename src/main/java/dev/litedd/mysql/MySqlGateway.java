package dev.litedd.mysql;

import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.SQLTransientConnectionException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.Set;

/**
 * Conexión única a MySQL (C-01 a C-11): pool de solo lectura, estado y reintento ante fallos de
 * comunicación.
 */
public final class MySqlGateway implements AutoCloseable {

    /** C-09, C-10 */
    public record Status(String state, String user, String host, Integer port, String schema, String message) {

        static final String NOT_CONFIGURED = "not_configured";
        static final String CONNECTED = "connected";
        static final String DISCONNECTED = "disconnected";
        static final String SCHEMA_UNAVAILABLE = "schema_unavailable";
    }

    @FunctionalInterface
    public interface SqlWork<T> {
        T run(Connection connection) throws SQLException;
    }

    /** No hay ninguna conexión configurada (C-02). */
    public static final class NotConfiguredException extends RuntimeException {
    }

    static final int ER_BAD_DB = 1049;
    private static final Set<String> SYSTEM_SCHEMAS = Set.of("information_schema", "mysql", "performance_schema", "sys");
    private static final Logger log = LoggerFactory.getLogger(MySqlGateway.class);

    static {
        // C-08, ADR-0012: HikariCP valida cada conexión antes de entregarla.
        System.setProperty("com.zaxxer.hikari.aliveBypassWindowMs", "0");
    }

    private final RunningQueries running = new RunningQueries();
    private ConnectionSettings settings;
    private HikariDataSource pool;
    private volatile Status status = new Status(Status.NOT_CONFIGURED, null, null, null, null, null);

    public RunningQueries running() {
        return running;
    }

    public synchronized Optional<ConnectionSettings> settings() {
        return Optional.ofNullable(settings);
    }

    public Status status() {
        return status;
    }

    /** C-11: cambiar la conexión cancela lo que esté en curso y cierra el pool anterior. */
    public Status configure(ConnectionSettings newSettings) {
        synchronized (this) {
            running.cancelAll();
            closePool();
            settings = newSettings;
            pool = new HikariDataSource(poolConfig(newSettings));
        }
        return refreshStatus();
    }

    /** C-09: «Reconectar» recrea el pool. */
    public Status reconnect() {
        ConnectionSettings current = settings().orElse(null);
        return current == null ? status : configure(current);
    }

    /** Comprueba el servidor con una conexión directa, que falla enseguida si no responde. */
    public Status refreshStatus() {
        ConnectionSettings s = settings().orElse(null);
        if (s == null) {
            return status;
        }
        try (Connection c = DriverManager.getConnection(JdbcUrl.build(s, true), s.user(), s.password())) {
            setStatus(s, Status.CONNECTED, null);
        } catch (SQLException e) {
            if (isUnknownSchema(e)) {
                updateStatusFrom(s, e);
            } else {
                // Credenciales, red o cualquier otro fallo: sin conexión (C-09).
                setStatus(s, Status.DISCONNECTED, rootMessage(e));
            }
        }
        return status;
    }

    /** S-04, C-07, C-08 */
    static HikariConfig poolConfig(ConnectionSettings s) {
        System.setProperty("com.zaxxer.hikari.aliveBypassWindowMs", "0");
        HikariConfig cfg = new HikariConfig();
        cfg.setPoolName("litedd-mysql");
        cfg.setJdbcUrl(JdbcUrl.build(s, true));
        cfg.setUsername(s.user());
        cfg.setPassword(s.password());
        cfg.setMaximumPoolSize(3);
        cfg.setMinimumIdle(0);
        cfg.setConnectionInitSql("SET SESSION TRANSACTION READ ONLY");
        cfg.setReadOnly(true);
        cfg.setMaxLifetime(600_000);
        cfg.setConnectionTimeout(5_000);
        cfg.setInitializationFailTimeout(-1);
        return cfg;
    }

    /** C-03: SHOW DATABASES sin los esquemas de sistema, conectando sin esquema. */
    public static List<String> listSchemas(ConnectionSettings s) throws SQLException {
        try (Connection c = DriverManager.getConnection(JdbcUrl.build(s, false), s.user(), s.password())) {
            c.setReadOnly(true);
            List<String> all = new ArrayList<>();
            try (Statement st = c.createStatement(); ResultSet rs = st.executeQuery("SHOW DATABASES")) {
                while (rs.next()) {
                    all.add(rs.getString(1));
                }
            }
            return userSchemas(all);
        }
    }

    static List<String> userSchemas(List<String> all) {
        return all.stream().filter(name -> !SYSTEM_SCHEMAS.contains(name.toLowerCase())).sorted().toList();
    }

    /**
     * Ejecuta con una conexión del pool. Q-47: ante un fallo de comunicación se descarta la conexión y
     * se reintenta una vez con otra.
     */
    public <T> T withConnection(SqlWork<T> work) throws SQLException {
        HikariDataSource p;
        ConnectionSettings s;
        synchronized (this) {
            p = pool;
            s = settings;
        }
        if (p == null) {
            throw new NotConfiguredException();
        }
        for (int attempt = 0; ; attempt++) {
            Connection c = null;
            try {
                c = p.getConnection();
                T result = work.run(c);
                setStatus(s, Status.CONNECTED, null);
                return result;
            } catch (SQLException e) {
                if (isCommunication(e) && attempt == 0) {
                    log.info("Fallo de comunicación con MySQL; se reintenta con una conexión nueva");
                    if (c != null) {
                        p.evictConnection(c);
                        c = null;
                    }
                    continue;
                }
                updateStatusFrom(s, e);
                throw e;
            } finally {
                if (c != null) {
                    c.close();
                }
            }
        }
    }

    static boolean isCommunication(SQLException e) {
        for (Throwable t = e; t != null; t = t.getCause()) {
            if (t instanceof SQLTransientConnectionException) {
                return true;
            }
            if (t instanceof SQLException sql && sql.getSQLState() != null && sql.getSQLState().startsWith("08")) {
                return true;
            }
        }
        return false;
    }

    static boolean isUnknownSchema(SQLException e) {
        for (Throwable t = e; t != null; t = t.getCause()) {
            if (t instanceof SQLException sql && sql.getErrorCode() == ER_BAD_DB) {
                return true;
            }
        }
        return false;
    }

    private void updateStatusFrom(ConnectionSettings s, SQLException e) {
        if (isUnknownSchema(e)) {
            setStatus(s, Status.SCHEMA_UNAVAILABLE, "El esquema «" + s.schemaOrEmpty() + "» no está disponible");
        } else if (isCommunication(e)) {
            setStatus(s, Status.DISCONNECTED, rootMessage(e));
        }
    }

    private void setStatus(ConnectionSettings s, String state, String message) {
        if (s != null) {
            status = new Status(state, s.user(), s.host(), s.port(), s.schemaOrEmpty(), message);
        }
    }

    static String rootMessage(Throwable e) {
        Throwable t = e;
        while (t.getCause() != null && t.getCause() != t) {
            t = t.getCause();
        }
        return t.getMessage() == null ? t.getClass().getSimpleName() : t.getMessage();
    }

    private void closePool() {
        if (pool != null) {
            pool.close();
            pool = null;
        }
    }

    @Override
    public synchronized void close() {
        running.cancelAll();
        closePool();
    }
}
