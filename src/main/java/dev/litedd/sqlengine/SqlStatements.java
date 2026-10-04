package dev.litedd.sqlengine;

import dev.litedd.sqlengine.SqlLexer.Kind;
import dev.litedd.sqlengine.SqlLexer.Token;

import java.util.List;
import java.util.Set;

/**
 * Una sola sentencia (S-03, Q-05) y clasificación tras renderizar (S-01, S-02, ADR-0011).
 */
public final class SqlStatements {

    public enum StatementKind {
        /** SELECT, WITH … SELECT o consulta entre paréntesis: paginable. */
        QUERY,
        /** SHOW, DESCRIBE, DESC, EXPLAIN: se ejecutan tal cual (Q-44). */
        META,
        /** Cualquier otra cosa: no se ejecuta (S-06). */
        STATEMENT
    }

    /**
     * @param verb            primera palabra clave, en mayúsculas
     * @param forbiddenClause cláusula de S-02 encontrada, o null
     */
    public record Classification(StatementKind kind, String verb, String forbiddenClause) {

        public boolean executable() {
            return kind != StatementKind.STATEMENT && forbiddenClause == null;
        }
    }

    private static final Set<String> META = Set.of("SHOW", "DESCRIBE", "DESC", "EXPLAIN");
    private static final Set<String> EXPLAIN_MODIFIERS = Set.of("ANALYZE", "EXTENDED", "PARTITIONS", "FORMAT", "TREE",
            "JSON", "TRADITIONAL", "INTO");
    private static final Set<String> WRITE_VERBS = Set.of("UPDATE", "DELETE", "INSERT", "REPLACE", "TABLE", "VALUES");

    private SqlStatements() {
    }

    /** Q-05, Q-94: un «;» final se ignora; cualquier otro es un error. */
    public static String stripTrailingSemicolon(String sql) {
        List<Token> tokens = SqlLexer.tokenize(sql);
        for (int i = 0; i < tokens.size(); i++) {
            if (tokens.get(i).kind() == Kind.SEMICOLON) {
                if (SqlLexer.next(tokens, i + 1) != null) {
                    throw new SqlException(SqlError.of("multiple_statements", "Una nota solo puede contener una sentencia"));
                }
                return sql.substring(0, tokens.get(i).start()).stripTrailing();
            }
        }
        return sql.strip();
    }

    public static Classification classify(String sql) {
        List<Token> tokens = SqlLexer.tokenize(sql);
        int first = firstWord(tokens, 0);
        if (first < 0) {
            return new Classification(StatementKind.STATEMENT, "", null);
        }
        String verb = tokens.get(first).text().toUpperCase();
        String forbidden = forbiddenClause(tokens);
        StatementKind kind;
        if (verb.equals("SELECT")) {
            kind = StatementKind.QUERY;
        } else if (verb.equals("WITH")) {
            kind = withEndsInSelect(tokens, first) ? StatementKind.QUERY : StatementKind.STATEMENT;
        } else if (META.contains(verb)) {
            kind = explainAllowed(tokens, first) ? StatementKind.META : StatementKind.STATEMENT;
        } else {
            kind = StatementKind.STATEMENT;
        }
        return new Classification(kind, verb, forbidden);
    }

    /** Primera palabra significativa a partir de from, saltando paréntesis de apertura. */
    private static int firstWord(List<Token> tokens, int from) {
        for (int i = from; i < tokens.size(); i++) {
            Token t = tokens.get(i);
            if (!t.significant() || t.kind() == Kind.LPAREN) {
                continue;
            }
            return t.kind() == Kind.WORD ? i : -1;
        }
        return -1;
    }

    /** WITH … debe desembocar en SELECT: la primera palabra de nivel superior tras las CTE. */
    private static boolean withEndsInSelect(List<Token> tokens, int with) {
        int depth = tokens.get(with).depth();
        for (int i = with + 1; i < tokens.size(); i++) {
            Token t = tokens.get(i);
            if (t.kind() != Kind.WORD || t.depth() != depth) {
                continue;
            }
            String w = t.text().toUpperCase();
            if (w.equals("SELECT")) {
                return true;
            }
            if (WRITE_VERBS.contains(w)) {
                return false;
            }
        }
        // Una consulta final entre paréntesis: (SELECT …)
        int next = firstWordAfterCtes(tokens, with);
        return next >= 0 && tokens.get(next).isWord("SELECT");
    }

    private static int firstWordAfterCtes(List<Token> tokens, int with) {
        int depth = tokens.get(with).depth();
        boolean seenAs = false;
        for (int i = with + 1; i < tokens.size(); i++) {
            Token t = tokens.get(i);
            if (t.depth() == depth && t.isWord("AS")) {
                seenAs = true;
            }
            if (seenAs && t.kind() == Kind.RPAREN && t.depth() == depth) {
                Token after = SqlLexer.next(tokens, i + 1);
                if (after != null && after.kind() == Kind.LPAREN) {
                    return firstWord(tokens, tokens.indexOf(after));
                }
            }
        }
        return -1;
    }

    /** ADR-0011: EXPLAIN ANALYZE solo con consultas; EXPLAIN sin ANALYZE siempre. */
    private static boolean explainAllowed(List<Token> tokens, int first) {
        String verb = tokens.get(first).text().toUpperCase();
        if (verb.equals("SHOW")) {
            return true;
        }
        boolean analyze = false;
        for (int i = first + 1; i < tokens.size(); i++) {
            Token t = tokens.get(i);
            if (!t.significant() || t.kind() == Kind.OTHER) {
                continue;
            }
            if (t.kind() == Kind.WORD && EXPLAIN_MODIFIERS.contains(t.text().toUpperCase())) {
                analyze |= t.isWord("ANALYZE");
                continue;
            }
            if (!analyze) {
                return true;
            }
            int word = firstWord(tokens, i);
            if (word < 0) {
                return false;
            }
            String explained = tokens.get(word).text().toUpperCase();
            return explained.equals("SELECT") || explained.equals("WITH") && withEndsInSelect(tokens, word);
        }
        return true;
    }

    /** S-02: cláusulas prohibidas en cualquier parte, fuera de cadenas y comentarios. */
    private static String forbiddenClause(List<Token> tokens) {
        for (int i = 0; i < tokens.size(); i++) {
            Token t = tokens.get(i);
            if (t.kind() == Kind.EXECUTABLE_COMMENT) {
                return "comentario ejecutable /*! */";
            }
            if (t.kind() != Kind.WORD) {
                continue;
            }
            Token next = SqlLexer.next(tokens, i + 1);
            if (next == null) {
                continue;
            }
            if (t.isWord("INTO")) {
                if (next.isWord("OUTFILE")) {
                    return "INTO OUTFILE";
                }
                if (next.isWord("DUMPFILE")) {
                    return "INTO DUMPFILE";
                }
                if (next.kind() == Kind.VARIABLE) {
                    return "INTO @variable";
                }
            }
            if (t.isWord("FOR") && (next.isWord("UPDATE") || next.isWord("SHARE"))) {
                return "FOR " + next.text().toUpperCase();
            }
            if (t.isWord("LOCK") && next.isWord("IN")) {
                return "LOCK IN SHARE MODE";
            }
        }
        return null;
    }
}
