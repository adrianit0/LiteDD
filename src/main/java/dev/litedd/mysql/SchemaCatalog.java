package dev.litedd.mysql;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Q-84: tablas y columnas del esquema de la conexión para el autocompletado, leídas de information_schema con una
 * sentencia fija de solo lectura (principio 3, ADR-0043).
 */
final class SchemaCatalog {

    record Table(String name, List<String> columns) {
    }

    /** Las vistas también están en COLUMNS. Sin esquema elegido, DATABASE() es NULL y no hay filas. */
    static final String COLUMNS_SQL = "SELECT TABLE_NAME, COLUMN_NAME FROM information_schema.COLUMNS"
            + " WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME, ORDINAL_POSITION";

    private SchemaCatalog() {
    }

    static List<Table> load(Connection c, int timeoutSeconds) throws SQLException {
        List<String[]> rows = new ArrayList<>();
        try (PreparedStatement ps = c.prepareStatement(COLUMNS_SQL)) {
            ps.setQueryTimeout(timeoutSeconds);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    rows.add(new String[]{rs.getString(1), rs.getString(2)});
                }
            }
        }
        return group(rows);
    }

    /** Pares [tabla, columna] en orden; las columnas de cada tabla, en el orden de la tabla. */
    static List<Table> group(List<String[]> rows) {
        Map<String, List<String>> tables = new LinkedHashMap<>();
        for (String[] row : rows) {
            tables.computeIfAbsent(row[0], k -> new ArrayList<>()).add(row[1]);
        }
        return tables.entrySet().stream().map(e -> new Table(e.getKey(), List.copyOf(e.getValue()))).toList();
    }
}
