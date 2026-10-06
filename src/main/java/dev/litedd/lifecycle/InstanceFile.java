package dev.litedd.lifecycle;

import com.fasterxml.jackson.databind.ObjectMapper;
import dev.litedd.store.PrivateFile;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Optional;

/** instance.json con el puerto y el token de la instancia en marcha, para litedd --stop (ADR-0017). */
public final class InstanceFile {

    public record Instance(int port, String token) {
    }

    private static final ObjectMapper JSON = new ObjectMapper();

    private final Path path;

    public InstanceFile(Path path) {
        this.path = path;
    }

    public void write(int port, String token) {
        try {
            PrivateFile.writeJson(path, JSON, new Instance(port, token));
        } catch (IOException e) {
            throw new UncheckedIOException("No se pudo escribir " + path.getFileName(), e);
        }
    }

    public Optional<Instance> read() {
        if (!Files.exists(path)) {
            return Optional.empty();
        }
        try {
            return Optional.of(JSON.readValue(path.toFile(), Instance.class));
        } catch (IOException e) {
            return Optional.empty();
        }
    }

    public void delete() {
        try {
            Files.deleteIfExists(path);
        } catch (IOException e) {
            // Al apagar no hay nada más que hacer.
        }
    }
}
