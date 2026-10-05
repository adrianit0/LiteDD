package dev.litedd.mysql;

import com.fasterxml.jackson.annotation.JsonInclude;
import dev.litedd.http.ApiError;
import dev.litedd.http.ApiRoutes;
import dev.litedd.mysql.MySqlGateway.NotConfiguredException;
import dev.litedd.mysql.QueryRunner.Column;
import dev.litedd.mysql.QueryRunner.Result;
import dev.litedd.notes.Note;
import dev.litedd.notes.NoteService;
import dev.litedd.notes.VariableValues;
import dev.litedd.settings.AppConfig;
import dev.litedd.sqlengine.SqlEngine.Analysis;
import dev.litedd.sqlengine.SqlError;
import dev.litedd.sqlengine.Variable;
import dev.litedd.sqlengine.Pagination;
import dev.litedd.sqlengine.Pagination.Page;
import dev.litedd.sqlengine.Pagination.PageRequest;
import dev.litedd.sqlengine.SqlEngine;
import dev.litedd.sqlengine.SqlEngine.InvalidValuesException;
import dev.litedd.sqlengine.SqlEngine.Plan;
import dev.litedd.sqlengine.SqlException;
import dev.litedd.sqlengine.SqlRenderer.BoundParameter;
import dev.litedd.sqlengine.SqlStatements.StatementKind;
import io.javalin.config.RoutesConfig;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.sql.SQLException;
import java.sql.SQLTimeoutException;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.function.Supplier;

/** Rutas /api/sql: analizar, renderizar, ejecutar, contar y cancelar (Q-40 a Q-57, A-04, A-05). */
public final class SqlApi implements ApiRoutes {

    record AnalyzeRequest(String content, String noteId) {
    }

    /** ADR-0014: lastValues solo si se pide con noteId. */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    record AnalyzeResponse(List<Variable> variables, String kind, String forbiddenClause, List<SqlError> errors,
                           Map<String, String> lastValues) {
    }

    record Sort(Integer column, String direction) {
    }

    record ExecuteRequest(String noteId, Long version, String executionId, Map<String, String> values, Integer page,
                          Integer pageSize, Sort sort) {
    }

    record CancelRequest(String executionId) {
    }

    record Parameter(int index, Object value, String type) {
    }

    /** Q-71, Q-72: el SQL final no incluye la paginación añadida por LiteDD. */
    record FinalSql(String withPlaceholders, List<Parameter> parameters, String inlined) {
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    record ExecuteResponse(String kind, List<Column> columns, List<List<String>> rows, List<List<Integer>> truncatedCells,
                           Boolean hasMore, Long total, Boolean capReached, Long serverMillis, FinalSql finalSql,
                           String warning, String forbiddenClause) {
    }

    /** Q-45 */
    static final String NOT_EXECUTABLE = "LiteDD solo ejecuta consultas. Copia la sentencia para ejecutarla en otra herramienta.";
    /** S-05, Q-43, ADR-0012: ajustable en el Sprint 6. */
    static final int DEFAULT_TIMEOUT_SECONDS = 30;
    /** Q-55, ADR-0012: ajustable en el Sprint 6. */
    static final int DEFAULT_ROW_CAP = 10_000;
    private static final int ER_DUP_FIELDNAME = 1060;
    private static final int ER_QUERY_TIMEOUT = 3024;
    private static final Logger log = LoggerFactory.getLogger(SqlApi.class);

    private final NoteService notes;
    private final VariableValues variableValues;
    private final SqlEngine engine;
    private final MySqlGateway gateway;
    /** U-10: el tiempo máximo y el tope se leen de los ajustes en cada ejecución. */
    private final Supplier<AppConfig> config;

    public SqlApi(NoteService notes, VariableValues variableValues, SqlEngine engine, MySqlGateway gateway) {
        this(notes, variableValues, engine, gateway, DEFAULT_TIMEOUT_SECONDS, DEFAULT_ROW_CAP);
    }

    public SqlApi(NoteService notes, VariableValues variableValues, SqlEngine engine, MySqlGateway gateway,
                  int timeoutSeconds, int rowCap) {
        this(notes, variableValues, engine, gateway,
                () -> new AppConfig(AppConfig.DEFAULT.defaultPageSize(), rowCap, timeoutSeconds, AppConfig.DEFAULT.port(), null, true));
    }

    public SqlApi(NoteService notes, VariableValues variableValues, SqlEngine engine, MySqlGateway gateway,
                  Supplier<AppConfig> config) {
        this.notes = notes;
        this.variableValues = variableValues;
        this.engine = engine;
        this.gateway = gateway;
        this.config = config;
    }

    private int timeoutSeconds() {
        return config.get().queryTimeoutSeconds();
    }

    private int rowCap() {
        return config.get().rowCap();
    }

    @Override
    public void register(RoutesConfig routes) {
        routes.post("/api/sql/analyze", ctx -> {
            AnalyzeRequest req = ctx.bodyAsClass(AnalyzeRequest.class);
            Analysis a = engine.analyze(req.content() == null ? "" : req.content());
            Map<String, String> last = null;
            if (req.noteId() != null) {
                Map<String, String> saved = variableValues.load(req.noteId());
                last = new java.util.LinkedHashMap<>();
                for (Variable v : a.variables()) {
                    if (saved.containsKey(v.name())) {
                        last.put(v.name(), saved.get(v.name()));
                    }
                }
            }
            ctx.json(new AnalyzeResponse(a.variables(), a.kind(), a.forbiddenClause(), a.errors(), last));
        });
        routes.post("/api/sql/render", ctx -> {
            ExecuteRequest req = ctx.bodyAsClass(ExecuteRequest.class);
            Plan plan = plan(req);
            ctx.json(new ExecuteResponse(kindOf(plan), null, null, null, null, null, null, null, finalSql(plan),
                    plan.executable() ? null : NOT_EXECUTABLE, plan.classification().forbiddenClause()));
        });
        routes.post("/api/sql/execute", ctx -> {
            ExecuteRequest req = ctx.bodyAsClass(ExecuteRequest.class);
            PageRequest page = pageRequest(req);
            Plan plan = plan(req);
            ExecuteResponse response = execute(req, page, plan);
            // Q-24: se recuerdan los valores de una ejecución correcta.
            variableValues.save(req.noteId(), plan.variables().stream().map(Variable::name).toList(), req.values());
            ctx.json(response);
        });
        routes.post("/api/sql/count", ctx -> ctx.json(Map.of("total", count(ctx.bodyAsClass(ExecuteRequest.class)))));
        routes.post("/api/sql/cancel", ctx -> {
            CancelRequest req = ctx.bodyAsClass(CancelRequest.class);
            boolean cancelled = req.executionId() != null && gateway.running().cancel(req.executionId());
            ctx.json(Map.of("cancelled", cancelled));
        });
    }

    /** A-04: siempre el contenido guardado, en la versión que tiene la pestaña. */
    private Plan plan(ExecuteRequest req) {
        if (req.noteId() == null || req.version() == null) {
            throw new ApiError(400, "bad_request", "Faltan la nota o su versión");
        }
        Note note = notes.get(req.noteId());
        if (!"sql".equals(note.type())) {
            throw new ApiError(400, "not_sql", "La nota no es una nota SQL");
        }
        if (note.version() != req.version()) {
            throw new ApiError(409, "stale_version", "La nota ha cambiado desde que se abrió. Pulsa «Actualizar».");
        }
        try {
            Plan plan = engine.plan(note.content(), req.values() == null ? Map.of() : req.values());
            // S-22: el SQL solo en depuración y nunca los valores.
            log.debug("SQL de la nota {}: {}", note.id(), plan.rendered().sql());
            return plan;
        } catch (SqlException e) {
            throw new ApiError(422, "sql_error", e.getMessage(), e.errors());
        } catch (InvalidValuesException e) {
            throw new ApiError(422, "invalid_values", "Hay valores que no corresponden al tipo de su variable", e.errors());
        }
    }

    private ExecuteResponse execute(ExecuteRequest req, PageRequest page, Plan plan) {
        FinalSql finalSql = finalSql(plan);
        if (!plan.executable()) {
            // S-06: una sentencia no ejecutable nunca llega al driver.
            return new ExecuteResponse("statement", null, null, null, null, null, null, null, finalSql, NOT_EXECUTABLE,
                    plan.classification().forbiddenClause());
        }
        boolean meta = plan.classification().kind() == StatementKind.META;
        String sql = meta ? plan.rendered().sql() : Pagination.pageSql(plan.rendered().sql(), page, rowCap());
        int maxRows = meta ? rowCap() + 1 : Pagination.fetchLimit(page, rowCap());
        String executionId = req.executionId() == null ? UUID.randomUUID().toString() : req.executionId();
        boolean wrapped = !meta && sql.startsWith("SELECT * FROM (\n");

        Result result = run(executionId, wrapped, () -> gateway.withConnection(c -> QueryRunner.query(c, sql,
                values(plan), maxRows, timeoutSeconds(), executionId, gateway.running())));
        Page assembled = Pagination.assemble(result.rows(), page, rowCap(), meta);
        List<List<Integer>> truncated = result.truncatedCells().stream()
                .filter(cell -> cell.getFirst() < assembled.rows().size()).toList();
        return new ExecuteResponse(meta ? "meta" : "query", result.columns(), assembled.rows(), truncated,
                assembled.hasMore(), assembled.total(), assembled.capReached(), result.serverMillis(), finalSql, null, null);
    }

    /** Q-54: COUNT(*) envuelto; con columnas repetidas (1060), recorriendo la consulta. */
    private long count(ExecuteRequest req) {
        Plan plan = plan(req);
        if (!plan.executable() || plan.classification().kind() != StatementKind.QUERY) {
            throw new ApiError(400, "not_countable", "Solo se pueden contar las filas de una consulta");
        }
        String executionId = req.executionId() == null ? UUID.randomUUID().toString() : req.executionId();
        List<Object> values = values(plan);
        String sql = plan.rendered().sql();
        return run(executionId, false, () -> gateway.withConnection(c -> {
            try {
                return QueryRunner.count(c, Pagination.countSql(sql), values, timeoutSeconds(), executionId, gateway.running(), false);
            } catch (SQLException e) {
                if (e.getErrorCode() != ER_DUP_FIELDNAME) {
                    throw e;
                }
                return QueryRunner.count(c, sql, values, timeoutSeconds(), executionId, gateway.running(), true);
            }
        }));
    }

    @FunctionalInterface
    private interface Work<T> {
        T run() throws SQLException;
    }

    /** Q-96 a Q-98: errores de MySQL, tiempo agotado, cancelación y falta de conexión. */
    private <T> T run(String executionId, boolean wrapped, Work<T> work) {
        long start = System.nanoTime();
        try {
            return work.run();
        } catch (NotConfiguredException e) {
            throw new ApiError(503, "not_configured", "No hay ninguna conexión a MySQL configurada");
        } catch (SQLException e) {
            double seconds = (System.nanoTime() - start) / 1e9;
            if (gateway.running().wasCancelled(executionId)) {
                throw new ApiError(422, "cancelled", "Consulta cancelada a los " + seconds(seconds));
            }
            if (e instanceof SQLTimeoutException || e.getErrorCode() == ER_QUERY_TIMEOUT) {
                throw new ApiError(422, "timeout", "La consulta superó el tiempo máximo de " + timeoutSeconds()
                        + " s y se canceló (" + seconds(seconds) + ")");
            }
            if (MySqlGateway.isUnknownSchema(e)) {
                throw new ApiError(503, "schema_unavailable", gateway.status().message());
            }
            if (MySqlGateway.isCommunication(e)) {
                throw new ApiError(503, "not_connected", "Sin conexión con MySQL: " + MySqlGateway.rootMessage(e));
            }
            String message = "Error de MySQL " + e.getErrorCode() + ": " + e.getMessage();
            if (wrapped && e.getErrorCode() == ER_DUP_FIELDNAME) {
                message += ". La consulta tiene columnas con el mismo nombre: quita ORDER BY y LIMIT de la nota para paginarla y ordenarla.";
            }
            throw new ApiError(422, "mysql_error", message, Map.of("errorCode", e.getErrorCode(),
                    "sqlState", e.getSQLState() == null ? "" : e.getSQLState()));
        }
    }

    private static String seconds(double s) {
        return String.format(Locale.ROOT, "%.1f s", s).replace('.', ',');
    }

    private static PageRequest pageRequest(ExecuteRequest req) {
        int page = req.page() == null ? 1 : req.page();
        Integer column = req.sort() == null ? null : req.sort().column();
        boolean desc = req.sort() != null && "desc".equalsIgnoreCase(req.sort().direction());
        try {
            return new PageRequest(page, req.pageSize(), column, desc);
        } catch (IllegalArgumentException e) {
            throw new ApiError(400, "bad_page", e.getMessage());
        }
    }

    private static List<Object> values(Plan plan) {
        return plan.rendered().parameters().stream().map(BoundParameter::value).toList();
    }

    private static String kindOf(Plan plan) {
        return plan.executable() ? plan.classification().kind().name().toLowerCase() : "statement";
    }

    private static FinalSql finalSql(Plan plan) {
        List<Parameter> params = plan.rendered().parameters().stream()
                .map(p -> new Parameter(p.index(), p.value(), p.type())).toList();
        return new FinalSql(plan.rendered().sql(), params, plan.inlined());
    }
}
