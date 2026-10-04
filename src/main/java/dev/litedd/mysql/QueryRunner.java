package dev.litedd.mysql;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.SQLException;
import java.sql.Types;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/** Ejecución JDBC directa (Q-32) con tiempo máximo y cancelación (S-05, Q-41). */
final class QueryRunner {

    /** Q-61: etiqueta de la columna; se admiten repetidas. */
    record Column(String label, String type, boolean numeric) {
    }

    /** @param truncatedCells pares [fila, columna] de celdas recortadas por el servidor (Q-64) */
    record Result(List<Column> columns, List<List<String>> rows, List<List<Integer>> truncatedCells, long serverMillis) {
    }

    static final int MAX_CELL_CHARS = 10_000;

    private static final Set<Integer> NUMERIC = Set.of(Types.TINYINT, Types.SMALLINT, Types.INTEGER, Types.BIGINT,
            Types.FLOAT, Types.REAL, Types.DOUBLE, Types.NUMERIC, Types.DECIMAL, Types.BIT);
    private static final Set<Integer> BINARY = Set.of(Types.BINARY, Types.VARBINARY, Types.LONGVARBINARY, Types.BLOB);

    private QueryRunner() {
    }

    static Result query(Connection c, String sql, List<Object> params, int maxRows, int timeoutSeconds,
                        String executionId, RunningQueries running) throws SQLException {
        long start = System.nanoTime();
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            prepare(ps, params, timeoutSeconds);
            ps.setMaxRows(maxRows);
            running.register(executionId, ps);
            try (ResultSet rs = ps.executeQuery()) {
                ResultSetMetaData md = rs.getMetaData();
                int n = md.getColumnCount();
                List<Column> columns = new ArrayList<>(n);
                for (int i = 1; i <= n; i++) {
                    columns.add(new Column(md.getColumnLabel(i), md.getColumnTypeName(i), NUMERIC.contains(md.getColumnType(i))));
                }
                List<List<String>> rows = new ArrayList<>();
                List<List<Integer>> truncated = new ArrayList<>();
                while (rows.size() < maxRows && rs.next()) {
                    List<String> row = new ArrayList<>(n);
                    for (int i = 1; i <= n; i++) {
                        String value = cell(rs, md.getColumnType(i), i);
                        if (value != null && value.length() > MAX_CELL_CHARS) {
                            value = value.substring(0, MAX_CELL_CHARS);
                            truncated.add(List.of(rows.size(), i - 1));
                        }
                        row.add(value);
                    }
                    rows.add(row);
                }
                return new Result(columns, rows, truncated, (System.nanoTime() - start) / 1_000_000);
            } finally {
                running.unregister(executionId);
            }
        }
    }

    /** Q-54: COUNT(*) con el envoltorio, o recorriendo la consulta en streaming. */
    static long count(Connection c, String sql, List<Object> params, int timeoutSeconds, String executionId,
                      RunningQueries running, boolean streaming) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement(sql, ResultSet.TYPE_FORWARD_ONLY, ResultSet.CONCUR_READ_ONLY)) {
            prepare(ps, params, timeoutSeconds);
            if (streaming) {
                // Connector/J entrega las filas de una en una con este tamaño de lote.
                ps.setFetchSize(Integer.MIN_VALUE);
            }
            running.register(executionId, ps);
            try (ResultSet rs = ps.executeQuery()) {
                if (!streaming) {
                    rs.next();
                    return rs.getLong(1);
                }
                long total = 0;
                while (rs.next()) {
                    total++;
                }
                return total;
            } finally {
                running.unregister(executionId);
            }
        }
    }

    private static void prepare(PreparedStatement ps, List<Object> params, int timeoutSeconds) throws SQLException {
        ps.setQueryTimeout(timeoutSeconds);
        for (int i = 0; i < params.size(); i++) {
            ps.setObject(i + 1, params.get(i));
        }
    }

    /** Q-62: texto tal cual, sin conversiones de zona horaria; binarios como [BLOB tamaño]. */
    private static String cell(ResultSet rs, int type, int i) throws SQLException {
        if (BINARY.contains(type)) {
            byte[] bytes = rs.getBytes(i);
            return bytes == null ? null : "[BLOB " + size(bytes.length) + "]";
        }
        if (type == Types.BIT) {
            long v = rs.getLong(i);
            return rs.wasNull() ? null : Long.toString(v);
        }
        return rs.getString(i);
    }

    /** Tamaño con coma decimal (U-03): 512 B, 2,3 KB, 1,5 MB. */
    static String size(long bytes) {
        if (bytes < 1024) {
            return bytes + " B";
        }
        double kb = bytes / 1024.0;
        if (kb < 1024) {
            return String.format(Locale.ROOT, "%.1f KB", kb).replace('.', ',');
        }
        return String.format(Locale.ROOT, "%.1f MB", kb / 1024).replace('.', ',');
    }
}
