package dev.litedd.httpnotes;

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
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CancellationException;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutionException;

/**
 * Una llamada HTTP al servidor local (H-30 a H-35, H-41): sin proxy, sin redirecciones y sin almacén de
 * cookies, con tiempo máximo, tope de tamaño y cancelación por executionId.
 */
public final class HttpCaller {

    /** Lo que se envía; las cabeceras ya montadas (RequestHeaders). */
    public record Call(String method, URI uri, List<Map.Entry<String, String>> headers, byte[] body) {
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
    private final Map<String, CompletableFuture<?>> running = new ConcurrentHashMap<>();
    private final Map<String, InputStream> reading = new ConcurrentHashMap<>();

    public HttpCaller() {
        // H-41: sin proxy (NO_PROXY), sin redirecciones y sin CookieHandler. HTTP/1.1: sin intentos de h2c.
        this.client = HttpClient.newBuilder()
                .proxy(HttpClient.Builder.NO_PROXY)
                .followRedirects(HttpClient.Redirect.NEVER)
                .version(HttpClient.Version.HTTP_1_1)
                .connectTimeout(Duration.ofSeconds(10))
                .build();
    }

    public Exchange send(Call call, String executionId, int timeoutSeconds, long maxBytes) throws CallFailed {
        LocalUrls.checkResolvesLocally(call.uri());
        HttpRequest.Builder b = HttpRequest.newBuilder(call.uri())
                .timeout(Duration.ofSeconds(timeoutSeconds))
                .method(call.method(), call.body() == null || call.body().length == 0
                        ? HttpRequest.BodyPublishers.noBody()
                        : HttpRequest.BodyPublishers.ofByteArray(call.body()));
        for (Map.Entry<String, String> h : call.headers()) {
            b.header(h.getKey(), h.getValue());
        }
        long start = System.nanoTime();
        CompletableFuture<HttpResponse<InputStream>> future = client.sendAsync(b.build(), HttpResponse.BodyHandlers.ofInputStream());
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

    static String hostPort(URI uri) {
        String host = uri.getHost();
        if (host.startsWith("[")) {
            host = host.substring(1, host.length() - 1);
        }
        return host + ":" + LocalUrls.port(uri);
    }
}
