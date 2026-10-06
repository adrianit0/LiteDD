package dev.litedd.store;

import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.attribute.FileAttribute;
import java.nio.file.attribute.PosixFilePermissions;

/**
 * Ficheros solo para el usuario (permisos 600): connection.json, http.json e instance.json (S-20, H-21,
 * ADR-0017). En sistemas de ficheros que no son POSIX los permisos no se pueden aplicar (ADR-0004).
 */
public final class PrivateFile {

    private PrivateFile() {
    }

    /** Se escribe en un temporal ya privado y se sustituye de golpe. */
    public static void writeJson(Path path, ObjectMapper json, Object value) throws IOException {
        Path dir = path.toAbsolutePath().getParent();
        Files.createDirectories(dir);
        boolean posix = dir.getFileSystem().supportedFileAttributeViews().contains("posix");
        FileAttribute<?>[] attrs = posix
                ? new FileAttribute<?>[]{PosixFilePermissions.asFileAttribute(PosixFilePermissions.fromString("rw-------"))}
                : new FileAttribute<?>[0];
        Path tmp = Files.createTempFile(dir, path.getFileName().toString(), ".tmp", attrs);
        try {
            json.writeValue(tmp.toFile(), value);
            Files.move(tmp, path, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
        } finally {
            Files.deleteIfExists(tmp);
        }
        if (posix) {
            Files.setPosixFilePermissions(path, PosixFilePermissions.fromString("rw-------"));
        }
    }
}
