package dev.litedd.update;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.litedd.http.ApiError;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.KeyFactory;
import java.security.PublicKey;
import java.security.Signature;
import java.security.SignatureException;
import java.security.spec.X509EncodedKeySpec;
import java.util.Base64;
import java.util.List;
import java.util.regex.Pattern;

/** latest.json, firmado con Ed25519 (R-03, R-04, R-30). */
@JsonIgnoreProperties(ignoreUnknown = true)
public record UpdateManifest(long build, String version, String commit, String date, long size, String sha256,
                             List<String> commits) {

    /** R-24 */
    static final long MAX_JAR_BYTES = 200L * 1024 * 1024;

    private static final String ALGORITHM = "Ed25519";
    private static final String KEY_RESOURCE = "release-key.pub";
    private static final Pattern SHA256 = Pattern.compile("[0-9a-f]{64}");
    private static final ObjectMapper JSON = new ObjectMapper();

    public UpdateManifest {
        commits = commits == null ? List.of() : List.copyOf(commits);
    }

    /** R-30: la firma se comprueba antes de interpretar el contenido. */
    static UpdateManifest verified(byte[] json, byte[] signature, PublicKey key) {
        if (!signed(json, signature, key)) {
            throw new ApiError(502, "update_signature", "La firma de la versión publicada no es válida: no se instalará");
        }
        UpdateManifest manifest;
        try {
            manifest = JSON.readValue(json, UpdateManifest.class);
        } catch (IOException e) {
            throw invalid();
        }
        if (manifest.build < 1 || manifest.size < 1 || manifest.size > MAX_JAR_BYTES || manifest.sha256 == null
                || !SHA256.matcher(manifest.sha256).matches()) {
            throw invalid();
        }
        return manifest;
    }

    private static boolean signed(byte[] json, byte[] signature, PublicKey key) {
        try {
            Signature verifier = Signature.getInstance(ALGORITHM);
            verifier.initVerify(key);
            verifier.update(json);
            return verifier.verify(signature);
        } catch (SignatureException e) {
            return false;
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("No se puede comprobar la firma", e);
        }
    }

    /** La clave en Base64, tal como la da openssl en DER (ADR-0033). */
    static PublicKey publicKey(String base64) throws GeneralSecurityException {
        byte[] der = Base64.getDecoder().decode(base64.strip());
        return KeyFactory.getInstance(ALGORITHM).generatePublic(new X509EncodedKeySpec(der));
    }

    /** R-14: null si esta compilación no trae clave pública. */
    static PublicKey bundledKey() {
        try (InputStream in = UpdateManifest.class.getResourceAsStream(KEY_RESOURCE)) {
            return in == null ? null : publicKey(new String(in.readAllBytes(), StandardCharsets.US_ASCII));
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        } catch (GeneralSecurityException | IllegalArgumentException e) {
            throw new IllegalStateException("La clave pública del JAR no es válida", e);
        }
    }

    private static ApiError invalid() {
        return new ApiError(502, "update_manifest", "El manifiesto de la versión publicada no es válido");
    }
}
