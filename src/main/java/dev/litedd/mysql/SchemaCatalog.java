package dev.litedd.mysql;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * Q-84: tablas y columnas del esquema de la conexión para el autocompletado, leídas de information_schema con una
 * sentencia fija de solo lectura (principio 3, ADR-0043). Q-103: también sus claves foráneas (ADR-0048).
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

    /** Q-102: la columna table.column tiene una clave foránea de una sola columna hacia referencedTable. */
    record ForeignKey(String table, String column, String referencedTable) {
    }

    /** Q-103: todas las claves foráneas del esquema de la conexión hacia ese mismo esquema; fija y de solo lectura. */
    static final String FOREIGN_KEYS_SQL = "SELECT TABLE_NAME, CONSTRAINT_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME"
            + " FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = DATABASE()"
            + " AND REFERENCED_TABLE_SCHEMA = DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL"
            + " ORDER BY TABLE_NAME, CONSTRAINT_NAME, ORDINAL_POSITION";

    static List<ForeignKey> loadForeignKeys(Connection c, int timeoutSeconds, Collection<String> targets) throws SQLException {
        List<String[]> rows = new ArrayList<>();
        try (PreparedStatement ps = c.prepareStatement(FOREIGN_KEYS_SQL)) {
            ps.setQueryTimeout(timeoutSeconds);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    rows.add(new String[]{rs.getString(1), rs.getString(2), rs.getString(3), rs.getString(4)});
                }
            }
        }
        return foreignKeys(rows, targets);
    }

    /**
     * Filas [tabla, restricción, columna, tabla referenciada] en orden. Q-102: solo las claves de una columna, porque la
     * nota de la referencia recibe un solo valor, y solo hacia una tabla objetivo, sin distinguir mayúsculas.
     */
    static List<ForeignKey> foreignKeys(List<String[]> rows, Collection<String> targets) {
        Set<String> wanted = new HashSet<>();
        targets.forEach(t -> wanted.add(t.toLowerCase(Locale.ROOT)));
        Map<List<String>, List<String[]>> constraints = new LinkedHashMap<>();
        for (String[] row : rows) {
            constraints.computeIfAbsent(List.of(row[0], row[1]), k -> new ArrayList<>()).add(row);
        }
        return constraints.values().stream()
                .filter(cols -> cols.size() == 1 && wanted.contains(cols.getFirst()[3].toLowerCase(Locale.ROOT)))
                .map(cols -> new ForeignKey(cols.getFirst()[0], cols.getFirst()[2], cols.getFirst()[3]))
                .toList();
    }
}
