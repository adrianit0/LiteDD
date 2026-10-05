package dev.litedd.store;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.stream.Stream;

/**
 * Migraciones numeradas controladas con PRAGMA user_version (D-02).
 * Antes de migrar una base ya existente se hace una copia; se conservan las 2 últimas (X-09).
 */
public final class Migrator {

    /** Orden de aplicación; user_version es el número de migraciones aplicadas. */
    public static final List<String> MIGRATIONS = List.of("db/migration/V001__initial.sql",
            "db/migration/V002__note_description.sql");

    static final String BACKUP_SUFFIX = "-premigracion.db";
    private static final int BACKUPS_KEPT = 2;
    private static final DateTimeFormatter STAMP = DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss");

    private final List<String> migrations;
    private final Path backupDir;

    public Migrator(List<String> migrations, Path backupDir) {
        this.migrations = migrations;
        this.backupDir = backupDir;
    }

    public void migrate(Connection c) throws SQLException {
        int current = userVersion(c);
        if (current > migrations.size()) {
            throw new IllegalStateException(
                    "La base de datos procede de una versión más reciente de LiteDD (esquema " + current + ")");
        }
        if (current == migrations.size()) {
            return;
        }
        if (current > 0) {
            backup(c);
        }
        boolean autoCommit = c.getAutoCommit();
        for (int i = current; i < migrations.size(); i++) {
            String name = migrations.get(i);
            c.setAutoCommit(false);
            try (Statement st = c.createStatement()) {
                for (String sql : split(read(name))) {
                    st.execute(sql);
                }
                st.execute("PRAGMA user_version = " + (i + 1));
                c.commit();
            } catch (SQLException e) {
                c.rollback();
                throw new IllegalStateException("Falló la migración " + name + ": " + e.getMessage(), e);
            } finally {
                c.setAutoCommit(autoCommit);
            }
        }
    }

    private void backup(Connection c) throws SQLException {
        try {
            Files.createDirectories(backupDir);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        Path target = backupDir.resolve("litedd-" + LocalDateTime.now().format(STAMP) + BACKUP_SUFFIX);
        try (Statement st = c.createStatement()) {
            st.execute("VACUUM INTO '" + target.toString().replace("'", "''") + "'");
        }
        try (Stream<Path> files = Files.list(backupDir)) {
            List<Path> old = files.filter(p -> p.getFileName().toString().endsWith(BACKUP_SUFFIX))
                    .sorted(Comparator.comparing((Path p) -> p.getFileName().toString()).reversed())
                    .skip(BACKUPS_KEPT)
                    .toList();
            for (Path p : old) {
                Files.deleteIfExists(p);
            }
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private static int userVersion(Connection c) throws SQLException {
        try (Statement st = c.createStatement(); ResultSet rs = st.executeQuery("PRAGMA user_version")) {
            rs.next();
            return rs.getInt(1);
        }
    }

    private static String read(String resource) {
        try (InputStream in = Migrator.class.getClassLoader().getResourceAsStream(resource)) {
            if (in == null) {
                throw new IllegalStateException("No se encuentra la migración " + resource);
            }
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    /**
     * Separa un fichero de migración en sentencias. Cada sentencia termina en una línea acabada en «;»,
     * salvo dentro de un CREATE TRIGGER, que termina en «END;».
     */
    static List<String> split(String script) {
        List<String> out = new ArrayList<>();
        StringBuilder current = new StringBuilder();
        boolean inTrigger = false;
        for (String line : script.split("\\R")) {
            String trimmed = line.strip();
            if (current.isEmpty() && (trimmed.isEmpty() || trimmed.startsWith("--"))) {
                continue;
            }
            current.append(line).append('\n');
            if (current.toString().stripLeading().toUpperCase().startsWith("CREATE TRIGGER")) {
                inTrigger = true;
            }
            boolean ends = inTrigger ? trimmed.equalsIgnoreCase("END;") : trimmed.endsWith(";");
            if (ends) {
                String sql = current.toString().strip();
                out.add(sql.substring(0, sql.length() - 1).strip());
                current.setLength(0);
                inTrigger = false;
            }
        }
        if (!current.toString().isBlank()) {
            out.add(current.toString().strip());
        }
        return out;
    }
}
