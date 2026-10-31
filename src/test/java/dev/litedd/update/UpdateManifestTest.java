package dev.litedd.update;

import dev.litedd.http.ApiError;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.PublicKey;
import java.security.Signature;
import java.util.Base64;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class UpdateManifestTest {

    static final String SHA256 = "a".repeat(64);
    static final String JSON = """
            {"build": 42, "version": "0.1.0", "commit": "0123456", "date": "2026-11-02T10:15:00Z",
             "size": 1024, "sha256": "%s", "commits": ["Corrige el orden de las pestañas"], "nuevo": true}
            """.formatted(SHA256);

    static KeyPair keys;

    @BeforeAll
    static void generateKeys() throws Exception {
        keys = KeyPairGenerator.getInstance("Ed25519").generateKeyPair();
    }

    static byte[] sign(KeyPair pair, byte[] message) throws Exception {
        Signature signer = Signature.getInstance("Ed25519");
        signer.initSign(pair.getPrivate());
        signer.update(message);
        return signer.sign();
    }

    private static byte[] bytes(String text) {
        return text.getBytes(StandardCharsets.UTF_8);
    }

    @Test
    void r03_r30_a_signed_manifest_is_read() throws Exception {
        UpdateManifest m = UpdateManifest.verified(bytes(JSON), sign(keys, bytes(JSON)), keys.getPublic());
        assertThat(m.build()).isEqualTo(42);
        assertThat(m.version()).isEqualTo("0.1.0");
        assertThat(m.commit()).isEqualTo("0123456");
        assertThat(m.date()).isEqualTo("2026-11-02T10:15:00Z");
        assertThat(m.size()).isEqualTo(1024);
        assertThat(m.sha256()).isEqualTo(SHA256);
        assertThat(m.commits()).containsExactly("Corrige el orden de las pestañas");
    }

    @Test
    void r30_an_altered_manifest_is_rejected() throws Exception {
        byte[] signature = sign(keys, bytes(JSON));
        byte[] altered = bytes(JSON.replace("\"build\": 42", "\"build\": 43"));
        assertThatThrownBy(() -> UpdateManifest.verified(altered, signature, keys.getPublic()))
                .isInstanceOfSatisfying(ApiError.class, e -> assertThat(e.body().code()).isEqualTo("update_signature"));
    }

    @Test
    void r30_a_signature_from_another_key_is_rejected() throws Exception {
        KeyPair other = KeyPairGenerator.getInstance("Ed25519").generateKeyPair();
        assertThatThrownBy(() -> UpdateManifest.verified(bytes(JSON), sign(other, bytes(JSON)), keys.getPublic()))
                .isInstanceOfSatisfying(ApiError.class, e -> assertThat(e.body().code()).isEqualTo("update_signature"));
    }

    @Test
    void r30_a_signature_of_the_wrong_length_is_rejected() {
        assertThatThrownBy(() -> UpdateManifest.verified(bytes(JSON), new byte[3], keys.getPublic()))
                .isInstanceOfSatisfying(ApiError.class, e -> assertThat(e.body().code()).isEqualTo("update_signature"));
    }

    @Test
    void r30_the_content_is_not_read_before_checking_the_signature() {
        // Basura sin firma válida: falla por la firma, no por el JSON.
        assertThatThrownBy(() -> UpdateManifest.verified(bytes("no es json"), new byte[64], keys.getPublic()))
                .isInstanceOfSatisfying(ApiError.class, e -> assertThat(e.body().code()).isEqualTo("update_signature"));
    }

    @Test
    void r03_a_signed_manifest_with_invalid_fields_is_rejected() throws Exception {
        for (String bad : new String[]{
                "no es json",
                JSON.replace("\"build\": 42", "\"build\": 0"),
                JSON.replace("\"size\": 1024", "\"size\": 0"),
                JSON.replace(SHA256, "abc")}) {
            assertThatThrownBy(() -> UpdateManifest.verified(bytes(bad), sign(keys, bytes(bad)), keys.getPublic()))
                    .as(bad)
                    .isInstanceOfSatisfying(ApiError.class, e -> assertThat(e.body().code()).isEqualTo("update_manifest"));
        }
    }

    @Test
    void r24_a_jar_above_the_limit_is_rejected() throws Exception {
        String big = JSON.replace("\"size\": 1024", "\"size\": " + (UpdateManifest.MAX_JAR_BYTES + 1));
        assertThatThrownBy(() -> UpdateManifest.verified(bytes(big), sign(keys, bytes(big)), keys.getPublic()))
                .isInstanceOfSatisfying(ApiError.class, e -> assertThat(e.body().code()).isEqualTo("update_manifest"));
    }

    @Test
    void r04_the_public_key_is_read_from_base64() throws Exception {
        String base64 = Base64.getEncoder().encodeToString(keys.getPublic().getEncoded());
        PublicKey parsed = UpdateManifest.publicKey(base64 + "\n");
        assertThat(parsed.getEncoded()).isEqualTo(keys.getPublic().getEncoded());
    }

    @Test
    void r04_the_jar_includes_the_public_key() {
        assertThat(UpdateManifest.bundledKey()).isNotNull();
    }
}
