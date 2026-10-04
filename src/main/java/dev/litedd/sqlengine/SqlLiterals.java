package dev.litedd.sqlengine;

import dev.litedd.sqlengine.SqlLexer.Kind;
import dev.litedd.sqlengine.SqlLexer.Token;
import dev.litedd.sqlengine.SqlRenderer.BoundParameter;

import java.math.BigDecimal;
import java.util.List;

/** Q-72: el SQL con los valores insertados como literales de MySQL, listo para pegar. */
public final class SqlLiterals {

    private SqlLiterals() {
    }

    public static String inline(String sql, List<BoundParameter> parameters) {
        StringBuilder out = new StringBuilder();
        int next = 0;
        for (Token t : SqlLexer.tokenize(sql)) {
            if (t.kind() == Kind.PLACEHOLDER && next < parameters.size()) {
                out.append(literal(parameters.get(next++).value()));
            } else {
                out.append(t.text());
            }
        }
        return out.toString();
    }

    static String literal(Object value) {
        if (value == null) {
            return "NULL";
        }
        if (value instanceof BigDecimal d) {
            return d.toPlainString();
        }
        if (value instanceof Number) {
            return value.toString();
        }
        if (value instanceof Boolean b) {
            return b ? "TRUE" : "FALSE";
        }
        return quote(value.toString());
    }

    /** Escapado de MySQL con NO_BACKSLASH_ESCAPES desactivado, el modo por defecto. */
    static String quote(String s) {
        StringBuilder out = new StringBuilder(s.length() + 2).append('\'');
        for (char c : s.toCharArray()) {
            switch (c) {
                case '\0' -> out.append("\\0");
                case '\'' -> out.append("\\'");
                case '"' -> out.append("\\\"");
                case '\b' -> out.append("\\b");
                case '\n' -> out.append("\\n");
                case '\r' -> out.append("\\r");
                case '\t' -> out.append("\\t");
                case '\u001a' -> out.append("\\Z");
                case '\\' -> out.append("\\\\");
                default -> out.append(c);
            }
        }
        return out.append('\'').toString();
    }
}
