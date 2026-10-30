package dev.litedd.update;

import dev.litedd.AppInfo;
import dev.litedd.http.ApiError;
import dev.litedd.store.DataPaths;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.PublicKey;
import java.util.Locale;
import java.util.Optional;
import java.util.function.Supplier;

/** Buscar e instalar una versión publicada (ADR-0033). Nada sale del equipo sin una llamada de la interfaz (R-12). */
public final class Updater {

    private static final Logger log = LoggerFactory.getLogger(Updater.class);
    private static final String MANIFEST = "latest.json";
    private static final String SIGNATURE = "latest.json.sig";
    private static final String JAR = "litedd.jar";

    /** reason: por qué no está disponible (R-14); null si lo está. */
    public record Status(String version, long build, String commit, boolean available, String reason) {
    }

    public record Check(boolean newer, UpdateManifest latest) {
    }

    /** Arranca el proceso que sustituye el JAR (R-43). */
    @FunctionalInterface
    interface Restart {
        void run() throws IOException;
    }

    private final Supplier<String> repository;
    private final UpdateClient client;
    private final String version;
    private final long build;
    private final String commit;
    private final PublicKey key;
    private final Path jar;
    private final String problem;
    private final Restart restart;
    private UpdateManifest verified;

    Updater(Supplier<String> repository, UpdateClient client, String version, long build, String commit, PublicKey key, Path jar,
            String problem, Restart restart) {
        this.repository = repository;
        this.client = client;
        this.version = version;
        this.build = build;
        this.commit = commit;
        this.key = key;
        this.jar = jar;
        this.problem = problem;
        this.restart = restart;
    }

    /** repository: la URL guardada en «Ajustes»; port: el de esta instancia, para volver a arrancar en él. */
    public static Updater installed(Supplier<String> repository, int port) {
        Optional<Installation> installation = Installation.of(Installation.running());
        PublicKey key = UpdateManifest.bundledKey();
        boolean linux = System.getProperty("os.name", "").toLowerCase(Locale.ROOT).contains("linux");
        return new Updater(repository, new UpdateClient(), AppInfo.VERSION, AppInfo.BUILD, AppInfo.COMMIT, key,
                installation.map(Installation::jar).orElse(null), problem(linux, installation, key),
                () -> UpdateHelper.start(installation.orElseThrow(), port, DataPaths.instanceFile(),
                        DataPaths.stateDir().resolve("update.log")));
    }

    /** R-14: null si se puede actualizar. */
    static String problem(boolean linux, Optional<Installation> installation, PublicKey key) {
        if (!linux) {
            return "Las actualizaciones solo funcionan en la instalación de Ubuntu.";
        }
        if (installation.isEmpty()) {
            return "Esta aplicación no se ejecuta desde una instalación. Instálala con scripts/install.sh.";
        }
        if (key == null) {
            return "Esta compilación no incluye la clave pública de firma.";
        }
        Path folder = installation.get().jar().getParent();
        return Files.isWritable(folder) ? null : "No se puede escribir en " + folder + ".";
    }

    public Status status() {
        return new Status(version, build, commit, problem == null, problem);
    }

    /** R-13: el manifiesto solo se tiene en cuenta si la firma es válida y el build es mayor (R-30, R-31). */
    public synchronized Check check() {
        String url = requireRepository();
        verified = null;
        byte[] json = client.read(UpdateUrls.latest(url, MANIFEST), UpdateClient.MAX_MANIFEST_BYTES);
        byte[] signature = client.read(UpdateUrls.latest(url, SIGNATURE), UpdateClient.MAX_SIGNATURE_BYTES);
        UpdateManifest latest = UpdateManifest.verified(json, signature, key);
        boolean newer = latest.build() > build;
        verified = newer ? latest : null;
        return new Check(newer, latest);
    }

    /** R-32, R-33, R-42, R-43: al volver, el JAR nuevo ya está comprobado y el proceso que lo instala, en marcha. */
    public synchronized void apply(long wanted) {
        String url = requireRepository();
        if (verified == null || verified.build() != wanted) {
            throw new ApiError(409, "update_stale", "Vuelve a buscar actualizaciones antes de actualizar");
        }
        Path next = jar.resolveSibling(jar.getFileName() + ".new");
        client.download(UpdateUrls.ofBuild(url, wanted, JAR), next, verified.size(), verified.sha256());
        try {
            restart.run();
        } catch (IOException e) {
            try {
                Files.deleteIfExists(next);
            } catch (IOException ignored) {
                // Se sustituye en la siguiente descarga (R-42).
            }
            throw new ApiError(500, "update_restart", "No se pudo iniciar la actualización: " + e.getMessage());
        }
        log.info("Actualización al build {} en curso", wanted);
    }

    /** R-11, R-14: sin conectar. */
    private String requireRepository() {
        if (problem != null) {
            throw new ApiError(409, "update_unavailable", problem);
        }
        String url = repository.get();
        if (url == null) {
            throw new ApiError(409, "update_not_configured", "Guarda la URL del repositorio en «Ajustes → Actualizaciones»");
        }
        return url;
    }
}
