package dev.litedd.lifecycle;

import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.attribute.FileAttribute;
import java.nio.file.attribute.PosixFilePermissions;
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
            Path dir = path.toAbsolutePath().getParent();
            Files.createDirectories(dir);
            boolean posix = dir.getFileSystem().supportedFileAttributeViews().contains("posix");
            FileAttribute<?>[] attrs = posix
                    ? new FileAttribute<?>[]{PosixFilePermissions.asFileAttribute(PosixFilePermissions.fromString("rw-------"))}
                    : new FileAttribute<?>[0];
            Path tmp = Files.createTempFile(dir, "instance", ".tmp", attrs);
            JSON.writeValue(tmp.toFile(), new Instance(port, token));
            Files.move(tmp, path, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
            if (posix) {
                Files.setPosixFilePermissions(path, PosixFilePermissions.fromString("rw-------"));
            }
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
