package dev.litedd.mysql;

import com.fasterxml.jackson.annotation.JsonInclude;
import dev.litedd.http.ApiError;
import dev.litedd.http.ApiRoutes;
import dev.litedd.mysql.QueryRunner.Column;
import dev.litedd.mysql.QueryRunner.Result;
import dev.litedd.mysql.SqlRunner.FinalSql;
import dev.litedd.notes.Note;
import dev.litedd.notes.NoteService;
import dev.litedd.notes.VariableValues;
import dev.litedd.settings.AppConfig;
import dev.litedd.sqlengine.CustomTypes;
import dev.litedd.sqlengine.MapperSource;
import dev.litedd.sqlengine.MapperSource.ParsedMapper;
import dev.litedd.sqlengine.SqlEngine.Analysis;
import dev.litedd.sqlengine.SqlError;
import dev.litedd.sqlengine.Variable;
import dev.litedd.sqlengine.Pagination;
import dev.litedd.sqlengine.Pagination.Page;
import dev.litedd.sqlengine.Pagination.PageRequest;
import dev.litedd.sqlengine.SqlEngine;
import dev.litedd.sqlengine.SqlEngine.Plan;
import dev.litedd.sqlengine.SqlStatements.StatementKind;
import io.javalin.config.RoutesConfig;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.sql.SQLException;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.function.Supplier;

/**
 * Rutas /api/sql: analizar, renderizar, ejecutar, contar y cancelar (Q-40 a Q-57, A-04, A-05). También
 * /api/mybatis/analyze, el análisis de una nota XML MyBatis (M-41).
 */
public final class SqlApi implements ApiRoutes {

    record AnalyzeRequest(String content, String noteId) {
    }

    /** ADR-0014: lastValues solo si se pide con noteId. */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    record AnalyzeResponse(List<Variable> variables, String kind, String forbiddenClause, List<SqlError> errors,
                           Map<String, String> lastValues) {
    }

    /** M-41 */
    record MapperStatement(String id, String kind) {
    }

    record MapperAnalysis(List<MapperStatement> statements, List<SqlError> errors) {
    }

    record Sort(Integer column, String direction) {
    }

    record ExecuteRequest(String noteId, Long version, String executionId, Map<String, String> values, Integer page,
                          Integer pageSize, Sort sort) {
    }

    record CancelRequest(String executionId) {
    }

    /** Q-107 */
    record LookupRequest(String table, String value) {
    }

    /** Q-114: el tipo tal como se usa, como «catalogo5». */
    record OptionsRequest(String type) {
    }

    /** Q-113, Q-114: pares [key, value] en el orden de la consulta y si se llegó al tope de filas. */
    record OptionsResponse(List<List<String>> options, boolean capReached) {
    }

    /** Q-105: las etiquetas y la primera fila; sin filas, row no aparece. */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    record LookupResponse(List<String> columns, List<String> row) {
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    record ExecuteResponse(String kind, List<Column> columns, List<List<String>> rows, List<List<Integer>> truncatedCells,
                           Boolean hasMore, Long total, Boolean capReached, Long serverMillis, FinalSql finalSql,
                           String warning, String forbiddenClause) {
    }

    /** Q-45 */
    static final String NOT_EXECUTABLE = SqlRunner.NOT_EXECUTABLE;
    /** S-05, Q-43, ADR-0012: ajustable en el Sprint 6. */
    static final int DEFAULT_TIMEOUT_SECONDS = 30;
    /** Q-55, ADR-0012: ajustable en el Sprint 6. */
    static final int DEFAULT_ROW_CAP = 10_000;
    private static final Logger log = LoggerFactory.getLogger(SqlApi.class);

    private final NoteService notes;
    private final VariableValues variableValues;
    private final SqlEngine engine;
    private final MySqlGateway gateway;
    /** Q-100: las referencias se leen de los ajustes en cada petición. */
    private final Supplier<AppConfig> config;
    /** Plan, ejecución y errores, compartidos con los nodos SQL de un workflow (ADR-0031). */
    private final SqlRunner sql;

    public SqlApi(NoteService notes, VariableValues variableValues, SqlEngine engine, MySqlGateway gateway) {
        this(notes, variableValues, engine, gateway, DEFAULT_TIMEOUT_SECONDS, DEFAULT_ROW_CAP);
    }

    public SqlApi(NoteService notes, VariableValues variableValues, SqlEngine engine, MySqlGateway gateway,
                  int timeoutSeconds, int rowCap) {
        this(notes, variableValues, engine, gateway,
                () -> new AppConfig(AppConfig.DEFAULT.defaultPageSize(), rowCap, timeoutSeconds, AppConfig.DEFAULT.port(), null, true, null));
    }

    public SqlApi(NoteService notes, VariableValues variableValues, SqlEngine engine, MySqlGateway gateway,
                  Supplier<AppConfig> config) {
        this(notes, variableValues, engine, gateway, config, Map::of);
    }

    public SqlApi(NoteService notes, VariableValues variableValues, SqlEngine engine, MySqlGateway gateway,
                  Supplier<AppConfig> config, Supplier<Map<String, String>> constants) {
        this.notes = notes;
        this.variableValues = variableValues;
        this.engine = engine;
        this.gateway = gateway;
        this.config = config;
        this.sql = new SqlRunner(engine, gateway, config, constants);
    }

    private int timeoutSeconds() {
        return sql.timeoutSeconds();
    }

    private int rowCap() {
        return sql.rowCap();
    }

    @Override
    public void register(RoutesConfig routes) {
        routes.post("/api/sql/analyze", ctx -> {
            AnalyzeRequest req = ctx.bodyAsClass(AnalyzeRequest.class);
            Analysis a = engine.analyze(req.content() == null ? "" : req.content(), sql.constants());
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
        routes.post("/api/mybatis/analyze", ctx -> {
            AnalyzeRequest req = ctx.bodyAsClass(AnalyzeRequest.class);
            // M-05: con los fragmentos de las demás notas XML.
            ParsedMapper p = MapperSource.parse(req.content() == null ? "" : req.content(), notes.mapperLibrary(req.noteId()));
            ctx.json(new MapperAnalysis(p.statements().stream().map(s -> new MapperStatement(s.id(), s.kind())).toList(),
                    p.errors()));
        });
        routes.post("/api/sql/render", ctx -> {
            ExecuteRequest req = ctx.bodyAsClass(ExecuteRequest.class);
            Plan plan = plan(req);
            ctx.json(new ExecuteResponse(kindOf(plan), null, null, null, null, null, null, null, SqlRunner.finalSql(plan),
                    plan.executable() ? null : NOT_EXECUTABLE, plan.classification().forbiddenClause()));
        });
        routes.post("/api/sql/execute", ctx -> {
            ExecuteRequest req = ctx.bodyAsClass(ExecuteRequest.class);
            PageRequest page = pageRequest(req);
            Plan plan = plan(req);
            ExecuteResponse response = execute(req, page, plan);
            // Q-24: se recuerdan los valores de una ejecución correcta.
            variableValues.save(req.noteId(), plan.variables().stream().map(Variable::name).toList(), req.values());
            // N-88: una sentencia que no se ejecuta (Q-45) no cuenta.
            if (response.warning() == null) {
                notes.markRun(req.noteId());
            }
            ctx.json(response);
        });
        routes.post("/api/sql/count", ctx -> ctx.json(Map.of("total", count(ctx.bodyAsClass(ExecuteRequest.class)))));
        routes.post("/api/sql/cancel", ctx -> {
            CancelRequest req = ctx.bodyAsClass(CancelRequest.class);
            ctx.json(Map.of("cancelled", sql.cancel(req.executionId())));
        });
        routes.post("/api/sql/explain", ctx -> ctx.json(explain(ctx.bodyAsClass(ExecuteRequest.class))));
        routes.get("/api/sql/schema", ctx -> ctx.json(Map.of("tables", schema())));
        routes.get("/api/sql/references", ctx -> ctx.json(Map.of("foreignKeys", foreignKeys())));
        routes.post("/api/sql/lookup", ctx -> ctx.json(lookup(ctx.bodyAsClass(LookupRequest.class))));
        routes.post("/api/sql/options", ctx -> ctx.json(options(ctx.bodyAsClass(OptionsRequest.class))));
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
        Plan plan = sql.plan(note.content(), req.values());
        // S-22: el SQL solo en depuración y nunca los valores.
        log.debug("SQL de la nota {}: {}", note.id(), plan.rendered().sql());
        return plan;
    }

    private ExecuteResponse execute(ExecuteRequest req, PageRequest page, Plan plan) {
        FinalSql finalSql = SqlRunner.finalSql(plan);
        if (!plan.executable()) {
            // S-06: una sentencia no ejecutable nunca llega al driver.
            return new ExecuteResponse("statement", null, null, null, null, null, null, null, finalSql, NOT_EXECUTABLE,
                    plan.classification().forbiddenClause());
        }
        boolean meta = plan.classification().kind() == StatementKind.META;
        String paged = meta ? plan.rendered().sql() : Pagination.pageSql(plan.rendered().sql(), page, rowCap());
        int maxRows = meta ? rowCap() + 1 : Pagination.fetchLimit(page, rowCap());
        String executionId = req.executionId() == null ? UUID.randomUUID().toString() : req.executionId();
        boolean wrapped = !meta && paged.startsWith("SELECT * FROM (\n");

        Result result = sql.run(executionId, wrapped, finalSql, () -> gateway.withConnection(c -> QueryRunner.query(c, paged,
                SqlRunner.values(plan), maxRows, timeoutSeconds(), executionId, gateway.running())));
        Page assembled = Pagination.assemble(result.rows(), page, rowCap(), meta);
        List<List<Integer>> truncated = result.truncatedCells().stream()
                .filter(cell -> cell.getFirst() < assembled.rows().size()).toList();
        return new ExecuteResponse(meta ? "meta" : "query", result.columns(), assembled.rows(), truncated,
                assembled.hasMore(), assembled.total(), assembled.capReached(), result.serverMillis(), finalSql, null, null);
    }

    /**
     * Q-48: EXPLAIN del SQL final de una consulta, sin paginación y con los valores del formulario. No recuerda los
     * valores (Q-24) ni llega al driver si la sentencia no es una consulta ejecutable (S-06).
     */
    private ExecuteResponse explain(ExecuteRequest req) {
        Plan plan = plan(req);
        if (!plan.executable() || plan.classification().kind() != StatementKind.QUERY) {
            throw new ApiError(400, "not_explainable", "Solo se puede explicar una consulta");
        }
        FinalSql finalSql = SqlRunner.finalSql(plan);
        String explained = explainSql(plan.rendered().sql());
        String executionId = req.executionId() == null ? UUID.randomUUID().toString() : req.executionId();
        Result result = sql.run(executionId, false, finalSql, () -> gateway.withConnection(c -> QueryRunner.query(c, explained,
                SqlRunner.values(plan), rowCap() + 1, timeoutSeconds(), executionId, gateway.running())));
        Page assembled = Pagination.assemble(result.rows(), new PageRequest(1, null, null, false), rowCap(), true);
        return new ExecuteResponse("explain", result.columns(), assembled.rows(), result.truncatedCells().stream()
                .filter(cell -> cell.getFirst() < assembled.rows().size()).toList(), false, null, assembled.capReached(),
                result.serverMillis(), finalSql, null, null);
    }

    /** Q-48: el EXPLAIN tradicional; EXPLAIN ANALYZE ejecutaría la consulta (ADR-0043). */
    static String explainSql(String rendered) {
        return "EXPLAIN " + rendered;
    }

    /** Q-84: tablas y columnas del esquema de la conexión. */
    private List<SchemaCatalog.Table> schema() {
        try {
            return gateway.withConnection(c -> SchemaCatalog.load(c, timeoutSeconds()));
        } catch (MySqlGateway.NotConfiguredException e) {
            throw new ApiError(503, "not_configured", "No hay ninguna conexión a MySQL configurada");
        } catch (SQLException e) {
            throw new ApiError(503, "schema_unavailable", "No se pudo leer el esquema: " + MySqlGateway.rootMessage(e));
        }
    }

    /** Q-103: claves foráneas hacia las tablas objetivo; sin referencias no llega a MySQL. */
    private List<SchemaCatalog.ForeignKey> foreignKeys() {
        List<String> targets = config.get().references().stream().map(AppConfig.Reference::table).toList();
        if (targets.isEmpty()) {
            return List.of();
        }
        try {
            return gateway.withConnection(c -> SchemaCatalog.loadForeignKeys(c, timeoutSeconds(), targets));
        } catch (MySqlGateway.NotConfiguredException e) {
            throw new ApiError(503, "not_configured", "No hay ninguna conexión a MySQL configurada");
        } catch (SQLException e) {
            throw new ApiError(503, "schema_unavailable", "No se pudieron leer las claves foráneas: " + MySqlGateway.rootMessage(e));
        }
    }

    /**
     * Q-101, Q-105, Q-107: ejecuta el contenido guardado de la nota de la referencia con el valor en su única variable,
     * como una consulta más (S-01 a S-06), sin paginación y con una sola fila. No recuerda valores (Q-24), no marca la
     * ejecución (N-88) y no registra el valor (S-22).
     */
    private LookupResponse lookup(LookupRequest req) {
        if (req.table() == null || req.value() == null) {
            throw new ApiError(400, "bad_request", "Faltan la tabla objetivo o el valor");
        }
        AppConfig.Reference ref = config.get().reference(req.table()).orElseThrow(() ->
                new ApiError(404, "no_reference", "No hay ninguna referencia para la tabla «" + req.table() + "» en «Ajustes»"));
        String name = "La nota de la referencia «" + ref.table() + "»";
        Note note = settingsNote(ref.noteId(), name, SqlApi::badReference);
        Analysis analysis = engine.analyze(note.content(), sql.constants());
        if (analysis.errors().isEmpty() && analysis.variables().size() != 1) {
            throw badReference(name + " debe tener una sola variable");
        }
        Map<String, String> values = analysis.variables().isEmpty() ? Map.of()
                : Map.of(analysis.variables().getFirst().name(), req.value());
        Plan plan = sql.plan(note.content(), values);
        if (!plan.executable() || plan.classification().kind() != StatementKind.QUERY) {
            throw badReference(name + " no es una consulta");
        }
        FinalSql finalSql = SqlRunner.finalSql(plan);
        String executionId = UUID.randomUUID().toString();
        Result result = sql.run(executionId, false, finalSql, () -> gateway.withConnection(c -> QueryRunner.query(c,
                plan.rendered().sql(), SqlRunner.values(plan), 1, timeoutSeconds(), executionId, gateway.running())));
        return new LookupResponse(result.columns().stream().map(Column::label).toList(),
                result.rows().isEmpty() ? null : result.rows().getFirst());
    }

    private static ApiError badReference(String message) {
        return new ApiError(422, "bad_reference", message);
    }

    /** Q-105, Q-114: la nota SQL elegida en «Ajustes» para una referencia o un tipo. */
    private Note settingsNote(String noteId, String name, Function<String, ApiError> bad) {
        if (notes.inTrash(noteId)) {
            throw bad.apply(name + " está en la papelera");
        }
        Note note;
        try {
            note = notes.get(noteId);
        } catch (ApiError e) {
            throw bad.apply(name + " ya no existe");
        }
        if (!"sql".equals(note.type())) {
            throw bad.apply(name + " no es una nota SQL");
        }
        return note;
    }

    /**
     * Q-113, Q-114: ejecuta el contenido guardado de la nota del tipo, con el valor del parámetro en su única variable si
     * el tipo lo tiene, como una consulta más (S-01 a S-06) y hasta el tope de filas. No recuerda valores (Q-24), no
     * marca la ejecución (N-88) y no registra el parámetro (S-22).
     */
    private OptionsResponse options(OptionsRequest req) {
        if (req.type() == null || req.type().isBlank()) {
            throw new ApiError(400, "bad_request", "Falta el tipo");
        }
        AppConfig settings = config.get();
        ApiError missing = new ApiError(404, "no_type", "No hay ningún tipo «" + req.type().strip() + "» en «Ajustes»");
        CustomTypes.Resolved type = settings.customTypes().resolve(req.type()).orElseThrow(() -> missing);
        AppConfig.CustomType definition = settings.customType(type.name()).orElseThrow(() -> missing);
        String name = "La nota del tipo «" + definition.name() + "»";
        Note note = settingsNote(definition.noteId(), name, SqlApi::badType);
        Analysis analysis = engine.analyze(note.content(), sql.constants());
        int wanted = type.parameter() == null ? 0 : 1;
        if (analysis.errors().isEmpty() && analysis.variables().size() != wanted) {
            throw badType(wanted == 0 ? name + " no puede tener variables: el tipo no tiene parámetro"
                    : name + " debe tener una sola variable, que recibe el parámetro «" + type.parameter() + "»");
        }
        Map<String, String> values = wanted == 0 || analysis.variables().isEmpty() ? Map.of()
                : Map.of(analysis.variables().getFirst().name(), type.value());
        Plan plan = sql.plan(note.content(), values);
        if (!plan.executable() || plan.classification().kind() != StatementKind.QUERY) {
            throw badType(name + " no es una consulta");
        }
        int cap = sql.rowCap();
        String executionId = UUID.randomUUID().toString();
        Result result = sql.run(executionId, false, SqlRunner.finalSql(plan), () -> gateway.withConnection(c -> QueryRunner.query(c,
                plan.rendered().sql(), SqlRunner.values(plan), cap + 1, timeoutSeconds(), executionId, gateway.running())));
        List<String> labels = result.columns().stream().map(Column::label).toList();
        int key = columnIndex(labels, "key", 0);
        int value = columnIndex(labels, "value", Math.min(1, labels.size() - 1));
        List<List<String>> options = result.rows().stream().limit(cap)
                // Q-113: null es «(Vacío)».
                .filter(r -> r.get(key) != null)
                .map(r -> Arrays.asList(r.get(key), r.get(value)))
                .toList();
        return new OptionsResponse(options, result.rows().size() > cap);
    }

    /** Q-113: la columna con esa etiqueta, sin distinguir mayúsculas, o la de esa posición. */
    static int columnIndex(List<String> labels, String label, int fallback) {
        for (int i = 0; i < labels.size(); i++) {
            if (labels.get(i).equalsIgnoreCase(label)) {
                return i;
            }
        }
        return fallback;
    }

    private static ApiError badType(String message) {
        return new ApiError(422, "bad_type", message);
    }

    /** Q-54: COUNT(*) envuelto; con columnas repetidas (1060), recorriendo la consulta. */
    private long count(ExecuteRequest req) {
        Plan plan = plan(req);
        if (!plan.executable() || plan.classification().kind() != StatementKind.QUERY) {
            throw new ApiError(400, "not_countable", "Solo se pueden contar las filas de una consulta");
        }
        String executionId = req.executionId() == null ? UUID.randomUUID().toString() : req.executionId();
        List<Object> values = SqlRunner.values(plan);
        String rendered = plan.rendered().sql();
        return sql.run(executionId, false, SqlRunner.finalSql(plan), () -> gateway.withConnection(c -> {
            try {
                return QueryRunner.count(c, Pagination.countSql(rendered), values, timeoutSeconds(), executionId, gateway.running(), false);
            } catch (SQLException e) {
                if (e.getErrorCode() != SqlRunner.ER_DUP_FIELDNAME) {
                    throw e;
                }
                return QueryRunner.count(c, rendered, values, timeoutSeconds(), executionId, gateway.running(), true);
            }
        }));
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

    private static String kindOf(Plan plan) {
        return plan.executable() ? plan.classification().kind().name().toLowerCase() : "statement";
    }
}
