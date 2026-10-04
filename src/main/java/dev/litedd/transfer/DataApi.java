package dev.litedd.transfer;

import dev.litedd.http.ApiError;
import dev.litedd.http.ApiRoutes;
import dev.litedd.transfer.Importer.Mode;
import io.javalin.config.RoutesConfig;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.util.Map;
import java.util.function.Consumer;

/** Menú «Datos» (X-10): exportar, importar, crear copia ahora y abrir la carpeta de datos. */
public final class DataApi implements ApiRoutes {

    private final Exporter exporter;
    private final Importer importer;
    private final Backups backups;
    private final Path dataDir;
    private final Consumer<Path> folderOpener;
    private final Clock clock;

    public DataApi(Exporter exporter, Importer importer, Backups backups, Path dataDir, Consumer<Path> folderOpener, Clock clock) {
        this.exporter = exporter;
        this.importer = importer;
        this.backups = backups;
        this.dataDir = dataDir;
        this.folderOpener = folderOpener;
        this.clock = clock;
    }

    @Override
    public void register(RoutesConfig routes) {
        routes.post("/api/data/export", ctx -> {
            byte[] zip = exporter.export();
            ctx.header("Content-Disposition", "attachment; filename=\"" + Exporter.fileName(clock) + "\"")
                    .contentType("application/zip")
                    .result(zip);
        });

        routes.post("/api/data/import", ctx -> {
            Mode mode = switch (String.valueOf(ctx.queryParam("mode"))) {
                case "replace" -> Mode.REPLACE;
                case "branch" -> Mode.BRANCH;
                default -> throw new ApiError(400, "invalid_mode", "Modo de importación no válido: «replace» o «branch»");
            };
            ctx.json(importer.importZip(ctx.bodyInputStream(), mode));
        });

        routes.post("/api/data/backup", ctx -> {
            Path file = backups.backupNow();
            ctx.json(Map.of("file", file.getFileName().toString()));
        });

        routes.post("/api/data/open-folder", ctx -> {
            try {
                Files.createDirectories(dataDir);
                folderOpener.accept(dataDir);
            } catch (RuntimeException e) {
                throw new ApiError(500, "open_failed", "No se pudo abrir la carpeta de datos: " + dataDir);
            }
            ctx.json(Map.of("opened", true, "path", dataDir.toString()));
        });
    }
}
