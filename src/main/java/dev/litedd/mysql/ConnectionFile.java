package dev.litedd.mysql;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import dev.litedd.store.PrivateFile;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Optional;

/**
 * connection.json: único sitio donde se guarda la contraseña, con permisos 600 (S-20). En sistemas
 * de ficheros que no son POSIX los permisos no se pueden aplicar (ADR-0004, ADR-0012).
 */
public final class ConnectionFile {

    private static final ObjectMapper JSON = new ObjectMapper()
            .enable(SerializationFeature.INDENT_OUTPUT)
            .disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES);

    private final Path path;

    public ConnectionFile(Path path) {
        this.path = path;
    }

    public Optional<ConnectionSettings> load() {
        if (!Files.exists(path)) {
            return Optional.empty();
        }
        try {
            return Optional.of(JSON.readValue(path.toFile(), ConnectionSettings.class));
        } catch (IOException e) {
            throw new UncheckedIOException("No se puede leer " + path.getFileName(), e);
        }
    }

    public void save(ConnectionSettings settings) {
        try {
            PrivateFile.writeJson(path, JSON, settings);
        } catch (IOException e) {
            throw new UncheckedIOException("No se puede guardar " + path.getFileName(), e);
        }
    }
}
