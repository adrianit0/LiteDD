package dev.litedd.transfer;

import dev.litedd.store.Store;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.regex.Pattern;
import java.util.stream.Stream;

/** Copias de la base de datos con VACUUM INTO (X-08, X-09). */
public final class Backups {

    static final Pattern DAILY = Pattern.compile("litedd-\\d{8}\\.db");
    static final String PRE_REPLACE_SUFFIX = "-prereemplazo.db";
    private static final int DAILY_KEPT = 3;
    private static final int PRE_REPLACE_KEPT = 2;
    private static final Duration DAILY_INTERVAL = Duration.ofHours(24);

    private final Store store;
    private final Path dir;
    private final Clock clock;

    public Backups(Store store, Path dir, Clock clock) {
        this.store = store;
        this.dir = dir;
        this.clock = clock;
    }

    public Path dir() {
        return dir;
    }

    /** X-08: al arrancar, si la última copia diaria tiene más de 24 horas. null si no tocaba. */
    public Path dailyIfDue() {
        Optional<Path> last = files(DAILY).stream().max(Comparator.comparing(Backups::modified));
        if (last.isPresent() && modified(last.get()).isAfter(clock.instant().minus(DAILY_INTERVAL))) {
            return null;
        }
        return backupNow();
    }

    /** X-10: «Crear copia ahora» rehace la copia del día (ADR-0017). */
    public Path backupNow() {
        String day = LocalDateTime.now(clock).format(DateTimeFormatter.BASIC_ISO_DATE);
        Path target = copyTo("litedd-" + day + ".db");
        rotate(files(DAILY), DAILY_KEPT);
        return target;
    }

    /** X-09: copia adicional antes de «Reemplazar todo»; se conservan las 2 últimas. */
    public Path preReplace() {
        String stamp = LocalDateTime.now(clock).format(DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss"));
        Path target = copyTo("litedd-" + stamp + PRE_REPLACE_SUFFIX);
        rotate(files(Pattern.compile("litedd-\\d{8}-\\d{6}" + Pattern.quote(PRE_REPLACE_SUFFIX))), PRE_REPLACE_KEPT);
        return target;
    }

    private Path copyTo(String name) {
        try {
            Files.createDirectories(dir);
            Path target = dir.resolve(name);
            Files.deleteIfExists(target);
            store.vacuumInto(target);
            return target;
        } catch (IOException e) {
            throw new UncheckedIOException("No se pudo crear la copia " + name, e);
        }
    }

    /** Conserva las más recientes por nombre, que empieza por la fecha. */
    private static void rotate(List<Path> files, int keep) {
        List<Path> old = files.stream()
                .sorted(Comparator.comparing((Path p) -> p.getFileName().toString()).reversed())
                .skip(keep)
                .toList();
        for (Path p : old) {
            try {
                Files.deleteIfExists(p);
            } catch (IOException e) {
                throw new UncheckedIOException(e);
            }
        }
    }

    private List<Path> files(Pattern pattern) {
        if (!Files.isDirectory(dir)) {
            return List.of();
        }
        try (Stream<Path> s = Files.list(dir)) {
            return s.filter(p -> pattern.matcher(p.getFileName().toString()).matches()).toList();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private static java.time.Instant modified(Path p) {
        try {
            return Files.getLastModifiedTime(p).toInstant();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
