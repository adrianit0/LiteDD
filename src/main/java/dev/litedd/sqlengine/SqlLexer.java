package dev.litedd.sqlengine;

import java.util.ArrayList;
import java.util.List;

/**
 * Analizador léxico de SQL de MySQL (Q-58). Entiende cadenas, identificadores entre comillas
 * invertidas, comentarios y paréntesis. No es un parser: solo da los tokens con su profundidad.
 */
public final class SqlLexer {

    public enum Kind {
        WORD, STRING, QUOTED_ID, COMMENT, EXECUTABLE_COMMENT, VARIABLE, PLACEHOLDER, SEMICOLON, LPAREN, RPAREN, SPACE, OTHER
    }

    /**
     * @param depth profundidad de paréntesis del token. Un paréntesis de apertura y su cierre tienen la
     *              profundidad de fuera.
     */
    public record Token(Kind kind, String text, int start, int end, int depth) {

        public boolean isWord(String word) {
            return kind == Kind.WORD && text.equalsIgnoreCase(word);
        }

        /** Ni espacios ni comentarios normales. */
        public boolean significant() {
            return kind != Kind.SPACE && kind != Kind.COMMENT;
        }
    }

    private SqlLexer() {
    }

    public static List<Token> tokenize(String sql) {
        List<Token> out = new ArrayList<>();
        int depth = 0;
        int i = 0;
        int n = sql.length();
        while (i < n) {
            char c = sql.charAt(i);
            int start = i;
            Kind kind;
            if (Character.isWhitespace(c)) {
                while (i < n && Character.isWhitespace(sql.charAt(i))) {
                    i++;
                }
                kind = Kind.SPACE;
            } else if (c == '\'' || c == '"') {
                i = endOfQuoted(sql, i, c, true);
                kind = Kind.STRING;
            } else if (c == '`') {
                i = endOfQuoted(sql, i, c, false);
                kind = Kind.QUOTED_ID;
            } else if (c == '#' || (c == '-' && startsLineComment(sql, i))) {
                while (i < n && sql.charAt(i) != '\n') {
                    i++;
                }
                kind = Kind.COMMENT;
            } else if (c == '/' && i + 1 < n && sql.charAt(i + 1) == '*') {
                kind = i + 2 < n && sql.charAt(i + 2) == '!' ? Kind.EXECUTABLE_COMMENT : Kind.COMMENT;
                int close = sql.indexOf("*/", i + 2);
                i = close < 0 ? n : close + 2;
            } else if (c == '@') {
                i++;
                if (i < n && sql.charAt(i) == '@') {
                    i++;
                }
                if (i < n && (sql.charAt(i) == '\'' || sql.charAt(i) == '"' || sql.charAt(i) == '`')) {
                    i = endOfQuoted(sql, i, sql.charAt(i), sql.charAt(i) != '`');
                } else {
                    while (i < n && isWordChar(sql.charAt(i)) || i < n && sql.charAt(i) == '.') {
                        i++;
                    }
                }
                kind = Kind.VARIABLE;
            } else if (isWordChar(c)) {
                while (i < n && isWordChar(sql.charAt(i))) {
                    i++;
                }
                kind = Kind.WORD;
            } else {
                i++;
                kind = switch (c) {
                    case ';' -> Kind.SEMICOLON;
                    case '(' -> Kind.LPAREN;
                    case ')' -> Kind.RPAREN;
                    case '?' -> Kind.PLACEHOLDER;
                    default -> Kind.OTHER;
                };
            }
            if (kind == Kind.RPAREN) {
                depth = Math.max(0, depth - 1);
            }
            out.add(new Token(kind, sql.substring(start, i), start, i, depth));
            if (kind == Kind.LPAREN) {
                depth++;
            }
        }
        return out;
    }

    /** Siguiente token significativo desde from, o null. */
    public static Token next(List<Token> tokens, int from) {
        for (int i = from; i < tokens.size(); i++) {
            if (tokens.get(i).significant()) {
                return tokens.get(i);
            }
        }
        return null;
    }

    private static boolean isWordChar(char c) {
        return Character.isLetterOrDigit(c) || c == '_' || c == '$';
    }

    /** En MySQL «--» solo abre un comentario si le sigue un espacio, un control o el final. */
    private static boolean startsLineComment(String sql, int i) {
        if (i + 1 >= sql.length() || sql.charAt(i + 1) != '-') {
            return false;
        }
        return i + 2 >= sql.length() || Character.isWhitespace(sql.charAt(i + 2)) || Character.isISOControl(sql.charAt(i + 2));
    }

    /** Fin de una cadena o identificador entre comillas; la comilla doblada escapa, y la barra si backslash. */
    private static int endOfQuoted(String sql, int i, char quote, boolean backslash) {
        int n = sql.length();
        i++;
        while (i < n) {
            char c = sql.charAt(i);
            if (backslash && c == '\\') {
                i += 2;
                continue;
            }
            if (c == quote) {
                if (i + 1 < n && sql.charAt(i + 1) == quote) {
                    i += 2;
                    continue;
                }
                return i + 1;
            }
            i++;
        }
        return n;
    }
}
