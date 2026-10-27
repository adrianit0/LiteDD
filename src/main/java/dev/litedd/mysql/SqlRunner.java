package dev.litedd.mysql;

import dev.litedd.http.ApiError;
import dev.litedd.mysql.MySqlGateway.NotConfiguredException;
import dev.litedd.mysql.QueryRunner.Column;
import dev.litedd.mysql.QueryRunner.Result;
import dev.litedd.settings.AppConfig;
import dev.litedd.sqlengine.Pagination;
import dev.litedd.sqlengine.Pagination.Page;
import dev.litedd.sqlengine.Pagination.PageRequest;
import dev.litedd.sqlengine.SqlEngine;
import dev.litedd.sqlengine.SqlEngine.InvalidValuesException;
import dev.litedd.sqlengine.SqlEngine.Plan;
import dev.litedd.sqlengine.SqlException;
import dev.litedd.sqlengine.SqlRenderer.BoundParameter;
import dev.litedd.sqlengine.SqlStatements.StatementKind;

import java.sql.SQLException;
import java.sql.SQLTimeoutException;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.function.Supplier;

/**
 * Plan y ejecución en solo lectura del contenido de una nota SQL, con la traducción de los errores (Q-30, Q-43,
 * Q-45, Q-74, Q-96 a Q-98). La usan las rutas /api/sql y los nodos SQL de un workflow (W-64, ADR-0031).
 */
public class SqlRunner {

    public record Parameter(int index, Object value, String type) {
    }

    /** Q-71, Q-72: el SQL final no incluye la paginación añadida por LiteDD. */
    public record FinalSql(String withPlaceholders, List<Parameter> parameters, String inlined) {
    }

    /** W-64: todas las filas, hasta el tope (Q-55). */
    public record Rows(List<Column> columns, List<List<String>> rows, boolean capReached, long serverMillis, FinalSql finalSql) {

        /** Q-61: las etiquetas de las columnas, que pueden repetirse. */
        public List<String> labels() {
            return columns.stream().map(Column::label).toList();
        }
    }

    /** Q-45 */
    static final String NOT_EXECUTABLE = "LiteDD solo ejecuta consultas. Copia la sentencia para ejecutarla en otra herramienta.";
    static final int ER_DUP_FIELDNAME = 1060;
    private static final int ER_QUERY_TIMEOUT = 3024;

    private final SqlEngine engine;
    private final MySqlGateway gateway;
    /** U-10: el tiempo máximo y el tope se leen de los ajustes en cada ejecución. */
    private final Supplier<AppConfig> config;
    /** M-62: valores de las constantes Java, leídos en cada análisis y ejecución. */
    private final Supplier<Map<String, String>> constants;

    public SqlRunner(SqlEngine engine, MySqlGateway gateway, Supplier<AppConfig> config, Supplier<Map<String, String>> constants) {
        this.engine = engine;
        this.gateway = gateway;
        this.config = config;
        this.constants = constants;
    }

    int timeoutSeconds() {
        return config.get().queryTimeoutSeconds();
    }

    int rowCap() {
        return config.get().rowCap();
    }

    Map<String, String> constants() {
        return constants.get();
    }

    /** Q-30: el SQL final con MyBatis; los valores llegan como texto y se convierten a su tipo (Q-22). */
    public Plan plan(String content, Map<String, String> values) {
        try {
            return engine.plan(content, values == null ? Map.of() : values, constants.get());
        } catch (SqlException e) {
            throw new ApiError(422, "sql_error", e.getMessage(), e.errors());
        } catch (InvalidValuesException e) {
            throw new ApiError(422, "invalid_values", "Hay valores que no corresponden al tipo de su variable", e.errors());
        }
    }

    /**
     * W-64: ejecuta el contenido sin paginación ni orden, con el tope de filas y el tiempo máximo. Una sentencia que
     * no es consulta no llega al driver (S-06).
     */
    public Rows all(String content, Map<String, String> values, String executionId) {
        Plan plan = plan(content, values);
        FinalSql finalSql = finalSql(plan);
        if (!plan.executable()) {
            throw new ApiError(422, "not_executable", NOT_EXECUTABLE, Map.of("finalSql", finalSql));
        }
        boolean meta = plan.classification().kind() == StatementKind.META;
        PageRequest unlimited = new PageRequest(1, null, null, false);
        String sql = meta ? plan.rendered().sql() : Pagination.pageSql(plan.rendered().sql(), unlimited, rowCap());
        int maxRows = meta ? rowCap() + 1 : Pagination.fetchLimit(unlimited, rowCap());
        boolean wrapped = !meta && sql.startsWith("SELECT * FROM (\n");
        Result result = run(executionId, wrapped, finalSql, () -> gateway.withConnection(c -> QueryRunner.query(c, sql,
                values(plan), maxRows, timeoutSeconds(), executionId, gateway.running())));
        Page page = Pagination.assemble(result.rows(), unlimited, rowCap(), meta);
        return new Rows(result.columns(), page.rows(), page.capReached(), result.serverMillis(), finalSql);
    }

    public boolean cancel(String executionId) {
        return executionId != null && gateway.running().cancel(executionId);
    }

    @FunctionalInterface
    interface Work<T> {
        T run() throws SQLException;
    }

    /**
     * Q-96 a Q-98: errores de MySQL, tiempo agotado, cancelación y falta de conexión. Q-74: todos llevan en
     * details el SQL final que se envió o se iba a enviar.
     */
    <T> T run(String executionId, boolean wrapped, FinalSql finalSql, Work<T> work) {
        Map<String, Object> sent = Map.of("finalSql", finalSql);
        long start = System.nanoTime();
        try {
            return work.run();
        } catch (NotConfiguredException e) {
            throw new ApiError(503, "not_configured", "No hay ninguna conexión a MySQL configurada", sent);
        } catch (SQLException e) {
            double seconds = (System.nanoTime() - start) / 1e9;
            if (gateway.running().wasCancelled(executionId)) {
                throw new ApiError(422, "cancelled", "Consulta cancelada a los " + seconds(seconds), sent);
            }
            if (e instanceof SQLTimeoutException || e.getErrorCode() == ER_QUERY_TIMEOUT) {
                throw new ApiError(422, "timeout", "La consulta superó el tiempo máximo de " + timeoutSeconds()
                        + " s y se canceló (" + seconds(seconds) + ")", sent);
            }
            if (MySqlGateway.isUnknownSchema(e)) {
                throw new ApiError(503, "schema_unavailable", gateway.status().message(), sent);
            }
            if (MySqlGateway.isCommunication(e)) {
                throw new ApiError(503, "not_connected", "Sin conexión con MySQL: " + MySqlGateway.rootMessage(e), sent);
            }
            String message = "Error de MySQL " + e.getErrorCode() + ": " + e.getMessage();
            if (wrapped && e.getErrorCode() == ER_DUP_FIELDNAME) {
                message += ". La consulta tiene columnas con el mismo nombre: quita ORDER BY y LIMIT de la nota para paginarla y ordenarla.";
            }
            throw new ApiError(422, "mysql_error", message, Map.of("errorCode", e.getErrorCode(),
                    "sqlState", e.getSQLState() == null ? "" : e.getSQLState(), "finalSql", finalSql));
        }
    }

    private static String seconds(double s) {
        return String.format(Locale.ROOT, "%.1f s", s).replace('.', ',');
    }

    static List<Object> values(Plan plan) {
        return plan.rendered().parameters().stream().map(BoundParameter::value).toList();
    }

    static FinalSql finalSql(Plan plan) {
        List<Parameter> params = plan.rendered().parameters().stream()
                .map(p -> new Parameter(p.index(), p.value(), p.type())).toList();
        return new FinalSql(plan.rendered().sql(), params, plan.inlined());
    }
}
