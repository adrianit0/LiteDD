package dev.litedd.httpnotes;

import dev.litedd.http.ApiError;

import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLException;
import java.io.IOException;
import java.io.InputStream;
import java.net.ConnectException;
import java.net.HttpCookie;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpConnectTimeoutException;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpTimeoutException;
import java.security.cert.CertPathBuilderException;
import java.security.cert.CertPathValidatorException;
import java.security.cert.CertificateExpiredException;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CancellationException;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutionException;

/**
 * Una llamada HTTP al servidor local o a un entorno de preproducción (H-30 a H-35, H-41, H-66 a H-68): sin proxy, sin
 * redirecciones y sin almacén de cookies, con tiempo máximo, tope de tamaño y cancelación por executionId.
 */
public final class HttpCaller {

    /** Lo que se envía; las cabeceras ya montadas (RequestHeaders). preproduction: va por el cliente de la CA corporativa. */
    public record Call(String method, URI uri, List<Map.Entry<String, String>> headers, byte[] body, boolean preproduction) {
    }

    public record Cookie(String name, String value, String domain, String path, Long maxAge, boolean httpOnly, boolean secure) {
    }

    /** body: como mucho maxBytes; truncated si había más. size: Content-Length si lo hay, si no lo leído. */
    public record Exchange(int status, List<Map.Entry<String, String>> headers, List<Cookie> cookies, byte[] body,
                           boolean truncated, long size, long millis) {

        public String header(String name) {
            return headers.stream().filter(h -> h.getKey().equalsIgnoreCase(name)).map(Map.Entry::getValue).findFirst().orElse(null);
        }
    }

    /** H-32: error sin respuesta del servidor; el mensaje se muestra tal cual. */
    public static final class CallFailed extends Exception {
        private final String code;

        CallFailed(String code, String message) {
            super(message);
            this.code = code;
        }

        public String code() {
            return code;
        }
    }

    private final HttpClient client;
    private final CorporateCa ca;
    private SSLContext preproductionContext;
    private HttpClient preproductionClient;
    private final Map<String, CompletableFuture<?>> running = new ConcurrentHashMap<>();
    private final Map<String, InputStream> reading = new ConcurrentHashMap<>();

    /** Solo el perfil Local: sin CA corporativa, toda llamada de preproducción se rechaza (H-67). */
    public HttpCaller() {
        this(null);
    }

    public HttpCaller(CorporateCa ca) {
        this.client = builder().build();
        this.ca = ca;
    }

    /** H-41, H-68: sin proxy (NO_PROXY), sin redirecciones y sin CookieHandler. HTTP/1.1: sin intentos de h2c. */
    private static HttpClient.Builder builder() {
        return HttpClient.newBuilder()
                .proxy(HttpClient.Builder.NO_PROXY)
                .followRedirects(HttpClient.Redirect.NEVER)
                .version(HttpClient.Version.HTTP_1_1)
                .connectTimeout(Duration.ofSeconds(10));
    }

    /**
     * H-66, H-67: el cliente de preproducción solo confía en la CA importada y comprueba el nombre del certificado (lo
     * hace HttpClient con https). Se rehace si cambia la CA.
     */
    private synchronized HttpClient preproductionClient() {
        SSLContext context = ca == null ? null : ca.sslContext().orElse(null);
        if (context == null) {
            throw new ApiError(400, "no_ca", "Importa la CA corporativa en «Ajustes» antes de llamar a un entorno de preproducción");
        }
        if (context != preproductionContext) {
            preproductionClient = builder().sslContext(context).build();
            preproductionContext = context;
        }
        return preproductionClient;
    }

    public Exchange send(Call call, String executionId, int timeoutSeconds, long maxBytes) throws CallFailed {
        HttpClient http;
        if (call.preproduction()) {
            http = preproductionClient();
        } else {
            HttpUrls.checkResolvesLocally(call.uri());
            http = client;
        }
        HttpRequest.Builder b = HttpRequest.newBuilder(call.uri())
                .timeout(Duration.ofSeconds(timeoutSeconds))
                .method(call.method(), call.body() == null || call.body().length == 0
                        ? HttpRequest.BodyPublishers.noBody()
                        : HttpRequest.BodyPublishers.ofByteArray(call.body()));
        for (Map.Entry<String, String> h : call.headers()) {
            b.header(h.getKey(), h.getValue());
        }
        long start = System.nanoTime();
        CompletableFuture<HttpResponse<InputStream>> future = http.sendAsync(b.build(), HttpResponse.BodyHandlers.ofInputStream());
        running.put(executionId, future);
        try {
            HttpResponse<InputStream> response = future.get();
            reading.put(executionId, response.body());
            byte[] body;
            boolean truncated;
            long read;
            try (InputStream in = response.body()) {
                body = in.readNBytes((int) Math.min(maxBytes, Integer.MAX_VALUE - 8));
                read = body.length;
                truncated = in.read() >= 0;
            }
            long millis = Duration.ofNanos(System.nanoTime() - start).toMillis();
            List<Map.Entry<String, String>> headers = new ArrayList<>();
            response.headers().map().forEach((name, values) -> values.forEach(v -> headers.add(Map.entry(name, v))));
            long size = response.headers().firstValueAsLong("content-length").orElse(read);
            return new Exchange(response.statusCode(), headers, cookies(response), body, truncated, size, millis);
        } catch (CancellationException e) {
            throw cancelled();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw cancelled();
        } catch (ExecutionException e) {
            throw failure(e.getCause(), call.uri(), timeoutSeconds);
        } catch (IOException e) {
            if (future.isCancelled()) {
                throw cancelled();
            }
            throw failure(e, call.uri(), timeoutSeconds);
        } finally {
            running.remove(executionId);
            reading.remove(executionId);
        }
    }

    /** H-30: false si no hay ninguna llamada con ese identificador. */
    public boolean cancel(String executionId) {
        CompletableFuture<?> f = running.get(executionId);
        if (f == null) {
            return false;
        }
        f.cancel(true);
        InputStream in = reading.get(executionId);
        if (in != null) {
            try {
                in.close();
            } catch (IOException ignored) {
                // Ya cerrado.
            }
        }
        return true;
    }

    private static List<Cookie> cookies(HttpResponse<?> response) {
        List<Cookie> out = new ArrayList<>();
        for (String raw : response.headers().allValues("set-cookie")) {
            try {
                for (HttpCookie c : HttpCookie.parse(raw)) {
                    out.add(new Cookie(c.getName(), c.getValue(), c.getDomain(), c.getPath(),
                            c.getMaxAge() < 0 ? null : c.getMaxAge(), c.isHttpOnly(), c.getSecure()));
                }
            } catch (IllegalArgumentException ignored) {
                // Una cookie mal formada se ve igualmente en las cabeceras.
            }
        }
        return out;
    }

    private static CallFailed cancelled() {
        return new CallFailed("cancelled", "Llamada cancelada");
    }

    /** H-32: el mismo texto que Postman cuando el servidor no escucha. */
    private static CallFailed failure(Throwable cause, URI uri, int timeoutSeconds) {
        if (cause instanceof CancellationException) {
            return cancelled();
        }
        if (cause instanceof HttpConnectTimeoutException || cause instanceof HttpTimeoutException) {
            return new CallFailed("timeout", "Tiempo agotado: el servidor no respondió en " + timeoutSeconds + " s");
        }
        if (find(cause, SSLException.class) != null) {
            return new CallFailed("tls", "Error: " + tlsProblem(cause, hostOf(uri)));
        }
        Throwable root = cause;
        while (root.getCause() != null && !(root instanceof ConnectException)) {
            root = root.getCause();
        }
        if (root instanceof ConnectException) {
            return new CallFailed("connection_refused", "Error: connect ECONNREFUSED " + hostPort(uri));
        }
        String detail = cause.getMessage() == null ? cause.getClass().getSimpleName() : cause.getMessage();
        return new CallFailed("network", "Error: " + detail);
    }

    /** H-67: por qué no se aceptó el certificado, en palabras del usuario. */
    private static String tlsProblem(Throwable cause, String host) {
        CertPathValidatorException invalid = find(cause, CertPathValidatorException.class);
        if (find(cause, CertificateExpiredException.class) != null
                || invalid != null && invalid.getReason() == CertPathValidatorException.BasicReason.EXPIRED) {
            return "el certificado de " + host + " ha caducado";
        }
        for (Throwable t = cause; t != null; t = t.getCause()) {
            String message = t.getMessage() == null ? "" : t.getMessage();
            if (message.startsWith("No subject alternative") || message.startsWith("No name matching")) {
                return "el certificado del servidor no es para " + host;
            }
        }
        if (invalid != null || find(cause, CertPathBuilderException.class) != null) {
            return "el certificado de " + host + " no está firmado por la CA importada";
        }
        return "no se pudo establecer la conexión segura con " + host + ": " + cause.getMessage();
    }

    private static <T extends Throwable> T find(Throwable t, Class<T> type) {
        for (Throwable c = t; c != null; c = c.getCause()) {
            if (type.isInstance(c)) {
                return type.cast(c);
            }
        }
        return null;
    }

    private static String hostOf(URI uri) {
        String host = uri.getHost();
        return host.startsWith("[") ? host.substring(1, host.length() - 1) : host;
    }

    static String hostPort(URI uri) {
        return hostOf(uri) + ":" + HttpUrls.port(uri);
    }
}
