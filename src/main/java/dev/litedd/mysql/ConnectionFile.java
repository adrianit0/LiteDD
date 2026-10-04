package dev.litedd.mysql;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.attribute.FileAttribute;
import java.nio.file.attribute.PosixFilePermissions;
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
            Path dir = path.toAbsolutePath().getParent();
            Files.createDirectories(dir);
            boolean posix = dir.getFileSystem().supportedFileAttributeViews().contains("posix");
            FileAttribute<?>[] attrs = posix
                    ? new FileAttribute<?>[]{PosixFilePermissions.asFileAttribute(PosixFilePermissions.fromString("rw-------"))}
                    : new FileAttribute<?>[0];
            // Se escribe en un temporal ya privado y se sustituye de golpe.
            Path tmp = Files.createTempFile(dir, "connection", ".tmp", attrs);
            try {
                JSON.writeValue(tmp.toFile(), settings);
                Files.move(tmp, path, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
            } finally {
                Files.deleteIfExists(tmp);
            }
            if (posix) {
                Files.setPosixFilePermissions(path, PosixFilePermissions.fromString("rw-------"));
            }
        } catch (IOException e) {
            throw new UncheckedIOException("No se puede guardar " + path.getFileName(), e);
        }
    }
}
