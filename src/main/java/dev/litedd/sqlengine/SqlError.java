package dev.litedd.sqlengine;

/**
 * Error de análisis o renderizado de una nota SQL (Q-90 a Q-95).
 *
 * @param code xml, wrapper, include, type, ognl, mybatis, multiple_statements o forbidden_clause
 */
public record SqlError(String code, String message, Integer line, Integer column, String variable) {

    public static SqlError of(String code, String message) {
        return new SqlError(code, message, null, null, null);
    }
}
