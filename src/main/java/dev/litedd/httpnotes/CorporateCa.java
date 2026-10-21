package dev.litedd.httpnotes;

import dev.litedd.http.ApiError;

import javax.net.ssl.SSLContext;
import javax.net.ssl.TrustManagerFactory;
import javax.security.auth.x500.X500Principal;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.security.GeneralSecurityException;
import java.security.KeyStore;
import java.security.cert.CertificateException;
import java.security.cert.CertificateFactory;
import java.security.cert.X509Certificate;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * http-ca.pem: la CA corporativa, la única en la que confían las llamadas de preproducción (H-66, H-67). No es un
 * secreto: es un certificado público.
 */
public final class CorporateCa {

    /** H-66: lo que «Ajustes» muestra de cada certificado. notAfter en ISO-8601, como las demás fechas de la API. */
    public record Info(String subject, String notAfter) {
    }

    private static final Pattern PEM = Pattern.compile("-----BEGIN CERTIFICATE-----(.*?)-----END CERTIFICATE-----", Pattern.DOTALL);
    private static final int MAX_PEM_CHARS = 1_000_000;

    private final Path file;
    private List<X509Certificate> certificates;
    private SSLContext context;

    public CorporateCa(Path file) {
        this.file = file;
    }

    public synchronized List<Info> certificates() {
        return loaded().stream().map(CorporateCa::info).toList();
    }

    /** H-66: guarda los certificados del PEM, sin el texto que los rodee, y sustituye a la CA anterior. */
    public synchronized List<Info> importPem(String pem) {
        List<X509Certificate> parsed = parse(pem);
        StringBuilder out = new StringBuilder();
        Base64.Encoder base64 = Base64.getMimeEncoder(64, "\n".getBytes(StandardCharsets.US_ASCII));
        try {
            for (X509Certificate c : parsed) {
                out.append("-----BEGIN CERTIFICATE-----\n").append(base64.encodeToString(c.getEncoded()))
                        .append("\n-----END CERTIFICATE-----\n");
            }
            Path dir = file.toAbsolutePath().getParent();
            Files.createDirectories(dir);
            Path tmp = Files.createTempFile(dir, "http-ca", ".tmp");
            try {
                Files.writeString(tmp, out, StandardCharsets.US_ASCII);
                Files.move(tmp, file, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
            } finally {
                Files.deleteIfExists(tmp);
            }
        } catch (CertificateException e) {
            throw invalid("El certificado no es válido: " + e.getMessage());
        } catch (IOException e) {
            throw new UncheckedIOException("No se puede guardar " + file.getFileName(), e);
        }
        certificates = parsed;
        context = null;
        return certificates();
    }

    /** H-66: contexto TLS que solo confía en la CA importada; vacío si no hay ninguna (H-67). */
    public synchronized Optional<SSLContext> sslContext() {
        if (context == null && !loaded().isEmpty()) {
            try {
                KeyStore trusted = KeyStore.getInstance(KeyStore.getDefaultType());
                trusted.load(null, null);
                for (int i = 0; i < certificates.size(); i++) {
                    trusted.setCertificateEntry("ca-" + i, certificates.get(i));
                }
                TrustManagerFactory tmf = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm());
                tmf.init(trusted);
                SSLContext tls = SSLContext.getInstance("TLS");
                tls.init(null, tmf.getTrustManagers(), null);
                context = tls;
            } catch (GeneralSecurityException | IOException e) {
                throw new IllegalStateException("No se pudo preparar la CA corporativa", e);
            }
        }
        return Optional.ofNullable(context);
    }

    private List<X509Certificate> loaded() {
        if (certificates == null) {
            try {
                certificates = file == null || !Files.exists(file) ? List.of() : parse(Files.readString(file, StandardCharsets.US_ASCII));
            } catch (IOException e) {
                throw new UncheckedIOException("No se puede leer " + file.getFileName(), e);
            }
        }
        return certificates;
    }

    private static List<X509Certificate> parse(String pem) {
        if (pem == null || pem.length() > MAX_PEM_CHARS) {
            throw invalid("El fichero no es un PEM con certificados");
        }
        List<X509Certificate> out = new ArrayList<>();
        Matcher m = PEM.matcher(pem);
        try {
            CertificateFactory factory = CertificateFactory.getInstance("X.509");
            while (m.find()) {
                byte[] der = Base64.getMimeDecoder().decode(m.group(1));
                out.add((X509Certificate) factory.generateCertificate(new ByteArrayInputStream(der)));
            }
        } catch (CertificateException | IllegalArgumentException e) {
            throw invalid("El certificado no es válido: " + e.getMessage());
        }
        if (out.isEmpty()) {
            throw invalid("El fichero no contiene ningún certificado PEM («-----BEGIN CERTIFICATE-----»)");
        }
        return List.copyOf(out);
    }

    private static Info info(X509Certificate c) {
        return new Info(c.getSubjectX500Principal().getName(X500Principal.RFC2253), c.getNotAfter().toInstant().toString());
    }

    private static ApiError invalid(String message) {
        return new ApiError(400, "invalid_ca", message);
    }
}
