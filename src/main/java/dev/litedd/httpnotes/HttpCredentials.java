package dev.litedd.httpnotes;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.litedd.store.PrivateFile;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Optional;

/**
 * http.json: único sitio donde se guarda la contraseña de las notas HTTP, con permisos 600 (H-21, S-20).
 * Nunca va a SQLite, a las copias, a la exportación ni al registro.
 */
public final class HttpCredentials {

    @JsonIgnoreProperties(ignoreUnknown = true)
    record Stored(String password) {
    }

    private static final ObjectMapper JSON = new ObjectMapper();

    private final Path path;

    public HttpCredentials(Path path) {
        this.path = path;
    }

    public Optional<String> password() {
        if (path == null || !Files.exists(path)) {
            return Optional.empty();
        }
        try {
            String p = JSON.readValue(path.toFile(), Stored.class).password();
            return p == null || p.isEmpty() ? Optional.empty() : Optional.of(p);
        } catch (IOException e) {
            throw new UncheckedIOException("No se puede leer " + path.getFileName(), e);
        }
    }

    /** Vacía o null la borra. */
    public void setPassword(String password) {
        try {
            if (password == null || password.isEmpty()) {
                Files.deleteIfExists(path);
                return;
            }
            PrivateFile.writeJson(path, JSON, new Stored(password));
        } catch (IOException e) {
            throw new UncheckedIOException("No se puede guardar " + path.getFileName(), e);
        }
    }
}
