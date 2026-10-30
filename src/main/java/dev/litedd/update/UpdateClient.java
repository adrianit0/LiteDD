package dev.litedd.update;

import dev.litedd.AppInfo;
import dev.litedd.http.ApiError;

import javax.net.ssl.SSLException;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpConnectTimeoutException;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpTimeoutException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.PosixFilePermissions;
import java.security.DigestOutputStream;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.util.HexFormat;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;

/**
 * La única salida a GitHub (R-20 a R-24): solo GET por HTTPS a los hosts de la lista, validados contra las CA de Java,
 * sin proxy, sin cookies y sin credenciales. Las redirecciones se siguen a mano para comprobar cada destino.
 */
public final class UpdateClient {

    static final Set<String> HOSTS = Set.of("github.com", "release-assets.githubusercontent.com");
    static final int MAX_REDIRECTS = 3;
    static final int MAX_MANIFEST_BYTES = 64 * 1024;
    static final int MAX_SIGNATURE_BYTES = 1024;
    private static final Duration MANIFEST_TIMEOUT = Duration.ofSeconds(30);
    private static final Duration JAR_TIMEOUT = Duration.ofMinutes(5);
    private static final Set<Integer> REDIRECTS = Set.of(301, 302, 303, 307, 308);

    /** Lo que importa de una respuesta. */
    record Reply(int status, String location, InputStream body) {
    }

    /** La conexión; las pruebas dan la suya para comprobar a qué destinos se llega. */
    @FunctionalInterface
    interface Transport {
        Reply get(URI uri, Duration timeout) throws IOException, InterruptedException;
    }

    private final Transport transport;
    private final Duration manifestTimeout;
    private final Duration jarTimeout;

    public UpdateClient() {
        this(javaTransport());
    }

    UpdateClient(Transport transport) {
        this(transport, MANIFEST_TIMEOUT, JAR_TIMEOUT);
    }

    UpdateClient(Transport transport, Duration timeout) {
        this(transport, timeout, timeout);
    }

    private UpdateClient(Transport transport, Duration manifestTimeout, Duration jarTimeout) {
        this.transport = transport;
        this.manifestTimeout = manifestTimeout;
        this.jarTimeout = jarTimeout;
    }

    private static Transport javaTransport() {
        HttpClient http = HttpClient.newBuilder()
                .proxy(HttpClient.Builder.NO_PROXY)
                .followRedirects(HttpClient.Redirect.NEVER)
                .version(HttpClient.Version.HTTP_1_1)
                .connectTimeout(Duration.ofSeconds(10))
                .build();
        return (uri, timeout) -> {
            HttpResponse<InputStream> r = http.send(request(uri, timeout), HttpResponse.BodyHandlers.ofInputStream());
            return new Reply(r.statusCode(), r.headers().firstValue("location").orElse(null), r.body());
        };
    }

    /** R-22 */
    static HttpRequest request(URI uri, Duration timeout) {
        return HttpRequest.newBuilder(uri).timeout(timeout).header("User-Agent", AppInfo.NAME).GET().build();
    }

    /** R-24: un fichero pequeño, como el manifiesto o su firma. */
    byte[] read(URI uri, int maxBytes) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        copy(uri, out, maxBytes, manifestTimeout);
        return out.toByteArray();
    }

    /** R-32, R-42: si el tamaño o el hash no coinciden con el manifiesto, la descarga se borra. */
    void download(URI uri, Path target, long size, String sha256) {
        MessageDigest digest = sha256();
        long total;
        try (OutputStream out = new DigestOutputStream(Files.newOutputStream(target), digest)) {
            total = copy(uri, out, Math.min(size, UpdateManifest.MAX_JAR_BYTES), jarTimeout);
        } catch (IOException | ApiError e) {
            deleteQuietly(target);
            throw e instanceof ApiError api ? api : failure(e, uri);
        }
        if (total != size || !HexFormat.of().formatHex(digest.digest()).equals(sha256)) {
            deleteQuietly(target);
            throw new ApiError(502, "update_hash", "El JAR descargado no coincide con el manifiesto: no se instalará");
        }
        try {
            if (target.getFileSystem().supportedFileAttributeViews().contains("posix")) {
                Files.setPosixFilePermissions(target, PosixFilePermissions.fromString("rw-r--r--"));
            }
        } catch (IOException e) {
            deleteQuietly(target);
            throw failure(e, uri);
        }
    }

    /** R-24: el tiempo máximo de la petición no cubre el cuerpo; al vencer, cerrar el flujo corta la lectura. */
    private long copy(URI uri, OutputStream out, long maxBytes, Duration timeout) {
        Reply reply = follow(uri, timeout);
        InputStream in = reply.body();
        CompletableFuture<Void> limit = CompletableFuture.runAsync(() -> closeQuietly(in),
                CompletableFuture.delayedExecutor(timeout.toMillis(), TimeUnit.MILLISECONDS));
        try (in) {
            byte[] buffer = new byte[64 * 1024];
            long total = 0;
            int n;
            while ((n = in.read(buffer)) >= 0) {
                total += n;
                if (total > maxBytes) {
                    throw new ApiError(502, "update_too_big", "El fichero publicado es mayor de lo esperado: no se instalará");
                }
                out.write(buffer, 0, n);
            }
            return total;
        } catch (IOException e) {
            throw limit.isDone() ? timedOut() : failure(e, uri);
        } finally {
            limit.cancel(false);
        }
    }

    /** R-20, R-21 */
    private Reply follow(URI start, Duration timeout) {
        URI uri = start;
        for (int hops = 0; hops <= MAX_REDIRECTS; hops++) {
            check(uri);
            Reply reply;
            try {
                reply = transport.get(uri, timeout);
            } catch (IOException e) {
                throw failure(e, uri);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw failure(e, uri);
            }
            if (reply.status() == 200) {
                return reply;
            }
            closeQuietly(reply.body());
            if (!REDIRECTS.contains(reply.status()) || reply.location() == null) {
                throw new ApiError(502, "update_http", reply.status() == 404
                        ? "No hay ninguna versión publicada en ese repositorio"
                        : "GitHub respondió con el estado " + reply.status());
            }
            uri = uri.resolve(reply.location());
        }
        throw new ApiError(502, "update_redirects", "GitHub encadenó demasiadas redirecciones");
    }

    /** R-20: antes de conectar. */
    private static void check(URI uri) {
        boolean allowed = "https".equals(uri.getScheme()) && uri.getRawUserInfo() == null
                && (uri.getPort() == -1 || uri.getPort() == 443) && HOSTS.contains(uri.getHost());
        if (!allowed) {
            throw new ApiError(502, "update_destination", "Destino no permitido para las actualizaciones: " + uri.getHost());
        }
    }

    /** R-13: el motivo, sin rutas ni parámetros de la URL. */
    private static ApiError failure(Exception cause, URI uri) {
        if (cause instanceof HttpConnectTimeoutException || cause instanceof HttpTimeoutException) {
            return timedOut();
        }
        for (Throwable t = cause; t != null; t = t.getCause()) {
            if (t instanceof SSLException) {
                return new ApiError(502, "update_tls", "No se pudo validar el certificado de " + uri.getHost());
            }
        }
        String detail = cause.getMessage() == null ? cause.getClass().getSimpleName() : cause.getMessage();
        return new ApiError(502, "update_network", "No se pudo contactar con " + uri.getHost() + ": " + detail);
    }

    private static ApiError timedOut() {
        return new ApiError(504, "update_timeout", "GitHub no respondió a tiempo");
    }

    private static MessageDigest sha256() {
        try {
            return MessageDigest.getInstance("SHA-256");
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    private static void closeQuietly(InputStream in) {
        try {
            in.close();
        } catch (IOException ignored) {
            // Ya cerrado.
        }
    }

    private static void deleteQuietly(Path file) {
        try {
            Files.deleteIfExists(file);
        } catch (IOException ignored) {
            // Se sustituye en la siguiente descarga (R-42).
        }
    }
}
