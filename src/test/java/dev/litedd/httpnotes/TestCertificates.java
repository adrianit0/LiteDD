package dev.litedd.httpnotes;

import javax.net.ssl.KeyManagerFactory;
import javax.net.ssl.SSLContext;
import javax.net.ssl.TrustManagerFactory;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.KeyStore;
import java.security.cert.X509Certificate;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

/**
 * Certificados de las pruebas de TLS (H-66, H-67), generados con el keytool de la JDK en una carpeta temporal: el
 * repositorio no guarda ninguna clave (S-32). Una CA de prueba firma dos certificados de servidor; un tercero es autofirmado.
 */
final class TestCertificates {

    /** Firmado por la CA, para localhost. */
    static final String VALID = "valido";
    /** Firmado por la CA, pero para otro nombre. */
    static final String OTHER_NAME = "otro-nombre";
    /** Para localhost, pero sin pasar por la CA. */
    static final String OTHER_CA = "otra-ca";

    private final KeyStore store;
    private final char[] password;

    private TestCertificates(KeyStore store, char[] password) {
        this.store = store;
        this.password = password;
    }

    static TestCertificates generate(Path dir, String otherHost) throws Exception {
        String pass = UUID.randomUUID().toString();
        Path file = dir.resolve("pruebas.p12");
        keytool(file, pass, "-alias", "ca", "-dname", "CN=LiteDD Demo CA, O=litedd_demo", "-ext", "bc:c");
        keytool(file, pass, "-alias", VALID, "-dname", "CN=localhost", "-signer", "ca", "-signerkeypass", pass, "-ext", "san=dns:localhost");
        keytool(file, pass, "-alias", OTHER_NAME, "-dname", "CN=" + otherHost, "-signer", "ca", "-signerkeypass", pass,
                "-ext", "san=dns:" + otherHost);
        keytool(file, pass, "-alias", OTHER_CA, "-dname", "CN=localhost", "-ext", "san=dns:localhost");
        KeyStore store = KeyStore.getInstance("PKCS12");
        try (InputStream in = Files.newInputStream(file)) {
            store.load(in, pass.toCharArray());
        }
        return new TestCertificates(store, pass.toCharArray());
    }

    /** La CA de prueba en PEM, como la importaría el usuario. */
    String caPem() throws Exception {
        X509Certificate ca = (X509Certificate) store.getCertificate("ca");
        return "-----BEGIN CERTIFICATE-----\n"
                + Base64.getMimeEncoder(64, "\n".getBytes(StandardCharsets.US_ASCII)).encodeToString(ca.getEncoded())
                + "\n-----END CERTIFICATE-----\n";
    }

    /** Contexto TLS de un servidor que presenta el certificado del alias, con su cadena. */
    SSLContext server(String alias) throws Exception {
        KeyStore one = KeyStore.getInstance("PKCS12");
        one.load(null, null);
        KeyStore.ProtectionParameter protection = new KeyStore.PasswordProtection(password);
        one.setEntry(alias, store.getEntry(alias, protection), protection);
        KeyManagerFactory kmf = KeyManagerFactory.getInstance(KeyManagerFactory.getDefaultAlgorithm());
        kmf.init(one, password);
        SSLContext context = SSLContext.getInstance("TLS");
        context.init(kmf.getKeyManagers(), null, null);
        return context;
    }

    /** Contexto TLS de un cliente que solo confía en la CA de prueba: hace de «CA de confianza de Java» (H-71). */
    SSLContext client() throws Exception {
        KeyStore trusted = KeyStore.getInstance("PKCS12");
        trusted.load(null, null);
        trusted.setCertificateEntry("ca", store.getCertificate("ca"));
        TrustManagerFactory tmf = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm());
        tmf.init(trusted);
        SSLContext context = SSLContext.getInstance("TLS");
        context.init(null, tmf.getTrustManagers(), null);
        return context;
    }

    private static void keytool(Path file, String pass, String... args) throws IOException, InterruptedException {
        boolean windows = System.getProperty("os.name", "").toLowerCase(Locale.ROOT).contains("win");
        List<String> command = new ArrayList<>(List.of(
                Path.of(System.getProperty("java.home"), "bin", windows ? "keytool.exe" : "keytool").toString(),
                "-genkeypair", "-keyalg", "EC", "-groupname", "secp256r1", "-validity", "2", "-storetype", "PKCS12",
                "-keystore", file.toString(), "-storepass", pass, "-keypass", pass));
        command.addAll(List.of(args));
        Process p = new ProcessBuilder(command).redirectErrorStream(true).start();
        String output = new String(p.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
        if (p.waitFor() != 0) {
            throw new IllegalStateException("keytool falló: " + output);
        }
    }
}
