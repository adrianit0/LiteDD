package dev.litedd.httpnotes;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.litedd.settings.AppConfig.Profile;
import dev.litedd.store.PrivateFile;

import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.TreeMap;

/**
 * http.json: único sitio donde se guardan las contraseñas de las notas HTTP, una por perfil, y el hash de la clave de
 * confirmación, con permisos 600 (H-21, H-64, H-69, S-20). Nunca van a SQLite, a las copias, a la exportación ni al registro.
 */
public final class HttpCredentials {

    /** password: el formato anterior a los perfiles; esa contraseña es la del perfil Local (H-61). */
    @JsonIgnoreProperties(ignoreUnknown = true)
    @JsonInclude(JsonInclude.Include.NON_NULL)
    record Stored(String password, Map<String, String> passwords, ConfirmKey confirmKey) {
    }

    /** H-69: hash PBKDF2-HMAC-SHA256 con sal; las iteraciones se guardan para poder cambiarlas. */
    record ConfirmKey(String salt, String hash, int iterations) {
    }

    static final int ITERATIONS = 210_000;
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final SecureRandom RANDOM = new SecureRandom();

    private final Path path;

    public HttpCredentials(Path path) {
        this.path = path;
    }

    public synchronized Optional<String> password(String profileId) {
        return Optional.ofNullable(read().passwords().get(profileId));
    }

    public synchronized Set<String> profilesWithPassword() {
        return Set.copyOf(read().passwords().keySet());
    }

    /** Vacía o null la borra. */
    public synchronized void setPassword(String profileId, String password) {
        Stored s = read();
        if (password == null || password.isEmpty()) {
            s.passwords().remove(profileId);
        } else {
            s.passwords().put(profileId, password);
        }
        write(s);
    }

    /** H-62: al borrar un perfil se borra su contraseña. */
    public synchronized void retainProfiles(Set<String> profileIds) {
        Stored s = read();
        if (s.passwords().keySet().retainAll(profileIds)) {
            write(s);
        }
    }

    public synchronized boolean hasConfirmKey() {
        return read().confirmKey() != null;
    }

    /** H-69: vacía o null la borra. Solo se guarda su hash, con una sal nueva cada vez. */
    public synchronized void setConfirmKey(String key) {
        Stored s = read();
        ConfirmKey hashed = null;
        if (key != null && !key.isEmpty()) {
            byte[] salt = new byte[16];
            RANDOM.nextBytes(salt);
            hashed = new ConfirmKey(Base64.getEncoder().encodeToString(salt),
                    Base64.getEncoder().encodeToString(pbkdf2(key, salt, ITERATIONS)), ITERATIONS);
        }
        write(new Stored(null, s.passwords(), hashed));
    }

    /** H-69: compara en tiempo constante; sin clave guardada nada coincide. */
    public boolean confirmKeyMatches(String candidate) {
        ConfirmKey stored;
        synchronized (this) {
            stored = read().confirmKey();
        }
        if (stored == null || candidate == null || candidate.isEmpty()) {
            return false;
        }
        byte[] expected = Base64.getDecoder().decode(stored.hash());
        byte[] actual = pbkdf2(candidate, Base64.getDecoder().decode(stored.salt()), stored.iterations());
        return MessageDigest.isEqual(expected, actual);
    }

    /** Siempre con el mapa de contraseñas modificable; la del formato anterior pasa a Local. */
    private Stored read() {
        Stored s = null;
        if (path != null && Files.exists(path)) {
            try {
                s = JSON.readValue(path.toFile(), Stored.class);
            } catch (IOException e) {
                throw new UncheckedIOException("No se puede leer " + path.getFileName(), e);
            }
        }
        Map<String, String> passwords = new TreeMap<>();
        if (s != null && s.passwords() != null) {
            s.passwords().forEach((id, p) -> {
                if (p != null && !p.isEmpty()) {
                    passwords.put(id, p);
                }
            });
        }
        if (s != null && s.password() != null && !s.password().isEmpty()) {
            passwords.putIfAbsent(Profile.LOCAL_ID, s.password());
        }
        return new Stored(null, passwords, s == null ? null : s.confirmKey());
    }

    /** Sin contraseñas ni clave el fichero se borra. */
    private void write(Stored s) {
        try {
            if (s.passwords().isEmpty() && s.confirmKey() == null) {
                Files.deleteIfExists(path);
                return;
            }
            PrivateFile.writeJson(path, JSON, new Stored(null, s.passwords(), s.confirmKey()));
        } catch (IOException e) {
            throw new UncheckedIOException("No se puede guardar " + path.getFileName(), e);
        }
    }

    private static byte[] pbkdf2(String key, byte[] salt, int iterations) {
        PBEKeySpec spec = new PBEKeySpec(key.toCharArray(), salt, iterations, 256);
        try {
            return SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).getEncoded();
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("PBKDF2 no está disponible", e);
        } finally {
            spec.clearPassword();
        }
    }
}
