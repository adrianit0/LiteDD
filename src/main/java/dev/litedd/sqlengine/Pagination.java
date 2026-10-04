package dev.litedd.sqlengine;

import dev.litedd.sqlengine.SqlLexer.Kind;
import dev.litedd.sqlengine.SqlLexer.Token;

import java.util.List;

/** Paginación, ordenación y conteo sobre el SQL renderizado (Q-51 a Q-57). */
public final class Pagination {

    /**
     * @param page       página, desde 1
     * @param pageSize   filas por página; null es «Sin límite» (Q-55)
     * @param sortColumn posición de la columna, desde 1; null sin orden
     */
    public record PageRequest(int page, Integer pageSize, Integer sortColumn, boolean descending) {

        public PageRequest {
            if (page < 1) {
                throw new IllegalArgumentException("La página empieza en 1");
            }
            if (pageSize != null && pageSize < 1) {
                throw new IllegalArgumentException("Tamaño de página no válido");
            }
            if (sortColumn != null && sortColumn < 1) {
                throw new IllegalArgumentException("Columna de orden no válida");
            }
        }

        public long offset() {
            return pageSize == null ? 0 : (long) (page - 1) * pageSize;
        }
    }

    /** Página ya recortada: rows nunca supera el tamaño de página ni el tope. */
    public record Page(List<List<String>> rows, boolean hasMore, Long total, boolean capReached) {
    }

    private Pagination() {
    }

    /** Filas que se piden al servidor: una más de las que se muestran (Q-52). */
    public static int fetchLimit(PageRequest req, int cap) {
        return (req.pageSize() == null ? cap : req.pageSize()) + 1;
    }

    /**
     * Q-51, Q-57: añade orden y límite al final, o envuelve la consulta si ya tiene LIMIT, o si tiene
     * ORDER BY y se ha elegido orden en la tabla. El sufijo va en una línea nueva por si la consulta
     * termina en un comentario de línea.
     */
    public static String pageSql(String sql, PageRequest req, int cap) {
        TopLevel top = topLevel(sql);
        String order = req.sortColumn() == null ? "" : "ORDER BY " + req.sortColumn() + (req.descending() ? " DESC " : " ASC ");
        String limit = "LIMIT " + fetchLimit(req, cap) + " OFFSET " + req.offset();
        boolean wrap = top.limit() || top.orderBy() && req.sortColumn() != null;
        if (wrap) {
            return "SELECT * FROM (\n" + sql + "\n) AS litedd_page\n" + order + limit;
        }
        return sql + "\n" + order + limit;
    }

    /** Q-54 */
    public static String countSql(String sql) {
        return "SELECT COUNT(*) FROM (\n" + sql + "\n) AS litedd_count";
    }

    /** Q-52, Q-53, Q-55, Q-44: recorta lo leído y calcula si hay más y el total. */
    public static Page assemble(List<List<String>> fetched, PageRequest req, int cap, boolean meta) {
        if (meta || req.pageSize() == null) {
            boolean capReached = fetched.size() > cap;
            List<List<String>> rows = capReached ? fetched.subList(0, cap) : fetched;
            return new Page(rows, false, capReached ? null : (long) rows.size(), capReached);
        }
        boolean hasMore = fetched.size() > req.pageSize();
        List<List<String>> rows = hasMore ? fetched.subList(0, req.pageSize()) : fetched;
        return new Page(rows, hasMore, hasMore ? null : req.offset() + rows.size(), false);
    }

    private record TopLevel(boolean orderBy, boolean limit) {
    }

    /** ORDER BY y LIMIT de primer nivel, fuera de subconsultas, cadenas y comentarios. */
    private static TopLevel topLevel(String sql) {
        List<Token> tokens = SqlLexer.tokenize(sql);
        boolean orderBy = false;
        boolean limit = false;
        for (int i = 0; i < tokens.size(); i++) {
            Token t = tokens.get(i);
            if (t.kind() != Kind.WORD || t.depth() != 0) {
                continue;
            }
            if (t.isWord("ORDER")) {
                Token next = SqlLexer.next(tokens, i + 1);
                orderBy |= next != null && next.isWord("BY");
            } else if (t.isWord("LIMIT")) {
                limit = true;
            }
        }
        return new TopLevel(orderBy, limit);
    }
}
