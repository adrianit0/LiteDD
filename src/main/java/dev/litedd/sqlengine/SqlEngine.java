package dev.litedd.sqlengine;

import dev.litedd.sqlengine.NoteSource.PreparedNote;
import dev.litedd.sqlengine.SqlRenderer.RenderedSql;
import dev.litedd.sqlengine.SqlStatements.Classification;
import dev.litedd.sqlengine.ValueConverter.Converted;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/** Fachada del motor: análisis para el editor y plan de ejecución con valores. */
public final class SqlEngine {

    /**
     * @param kind            query, meta o statement; null si no se pudo renderizar
     * @param forbiddenClause cláusula de S-02 encontrada, o null
     */
    public record Analysis(List<Variable> variables, String kind, String forbiddenClause, List<SqlError> errors) {
    }

    /**
     * @param rendered SQL renderizado, sin el «;» final, con sus parámetros
     * @param inlined  el mismo SQL con los valores como literales (Q-72)
     */
    public record Plan(List<Variable> variables, RenderedSql rendered, Classification classification, String inlined) {

        public boolean executable() {
            return classification.executable();
        }
    }

    /** Q-22, Q-93: valores que no convierten a su tipo, por variable. */
    public static final class InvalidValuesException extends RuntimeException {

        private final Map<String, String> errors;

        public InvalidValuesException(Map<String, String> errors) {
            super("Hay valores que no corresponden a su tipo");
            this.errors = Map.copyOf(errors);
        }

        public Map<String, String> errors() {
            return errors;
        }
    }

    private final SqlRenderer renderer = new SqlRenderer();

    /**
     * Q-82: variables, clase de sentencia y errores. Se renderiza con todas las variables a null; los
     * errores de OGNL que solo aparecen con valores concretos no se informan aquí.
     */
    public Analysis analyze(String content) {
        PreparedNote note = NoteSource.prepare(content);
        if (!note.errors().isEmpty()) {
            return new Analysis(note.variables(), null, null, note.errors());
        }
        List<SqlError> errors = new ArrayList<>();
        try {
            Map<String, Object> nulls = new HashMap<>();
            note.variables().forEach(v -> nulls.put(v.name(), null));
            RenderedSql rendered = renderer.render(note.body(), nulls);
            Classification c = SqlStatements.classify(SqlStatements.stripTrailingSemicolon(rendered.sql()));
            if (c.forbiddenClause() != null) {
                errors.add(SqlError.of("forbidden_clause", "Cláusula no permitida: " + c.forbiddenClause()));
            }
            return new Analysis(note.variables(), c.kind().name().toLowerCase(), c.forbiddenClause(), errors);
        } catch (SqlException e) {
            e.errors().stream().filter(err -> !err.code().equals("ognl_runtime")).forEach(errors::add);
            return new Analysis(note.variables(), null, null, errors);
        }
    }

    /**
     * Prepara una ejecución: convierte los valores, renderiza con MyBatis, comprueba que es una sola
     * sentencia y la clasifica. Lanza SqlException o InvalidValuesException.
     */
    public Plan plan(String content, Map<String, String> values) {
        PreparedNote note = NoteSource.prepare(content);
        if (!note.errors().isEmpty()) {
            throw new SqlException(note.errors());
        }
        Converted converted = ValueConverter.convert(note.variables(), values);
        if (!converted.errors().isEmpty()) {
            throw new InvalidValuesException(converted.errors());
        }
        RenderedSql raw = renderer.render(note.body(), converted.params());
        // S-03: la comprobación va sobre el SQL ya renderizado, con los ${…} sustituidos.
        RenderedSql rendered = new RenderedSql(SqlStatements.stripTrailingSemicolon(raw.sql()), raw.parameters());
        Classification c = SqlStatements.classify(rendered.sql());
        return new Plan(note.variables(), rendered, c, SqlLiterals.inline(rendered.sql(), rendered.parameters()));
    }
}
