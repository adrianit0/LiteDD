package dev.litedd.http;

import io.javalin.http.Context;
import io.javalin.http.HandlerType;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Set;

/**
 * Protecciones del servidor local: Host (S-11), token de sesión (S-12),
 * Origin (S-13) y cabecera CSP (S-14).
 */
public final class LocalSecurity {

    public static final String TOKEN_HEADER = "X-LiteDD-Token";
    public static final String CSP = "default-src 'self'; img-src 'self' data:";

    private static final Set<HandlerType> SAFE_METHODS =
            Set.of(HandlerType.GET, HandlerType.HEAD, HandlerType.OPTIONS);

    private final Set<String> allowedHosts;
    private final Set<String> allowedOrigins;
    private final byte[] token;

    public LocalSecurity(int port, String token) {
        this.allowedHosts = Set.of("127.0.0.1:" + port, "localhost:" + port);
        this.allowedOrigins = Set.of("http://127.0.0.1:" + port, "http://localhost:" + port);
        this.token = token.getBytes(StandardCharsets.UTF_8);
    }

    /** Se ejecuta antes de cualquier petición, incluidos los ficheros estáticos. */
    public void check(Context ctx) {
        ctx.header("Content-Security-Policy", CSP);

        String host = ctx.header("Host");
        if (host == null || !allowedHosts.contains(host.toLowerCase())) {
            throw ApiError.forbidden("Cabecera Host no permitida");
        }

        if (!SAFE_METHODS.contains(ctx.method())) {
            String origin = ctx.header("Origin");
            // Sin Origin solo llegan clientes que no son navegador; el token sigue siendo obligatorio.
            if (origin != null && !allowedOrigins.contains(origin.toLowerCase())) {
                throw ApiError.forbidden("Origen no permitido");
            }
        }

        String path = ctx.path();
        boolean isApi = path.equals("/api") || path.startsWith("/api/");
        boolean isHealth = ctx.method() == HandlerType.GET && path.equals("/api/health");
        if (isApi && !isHealth && !validToken(ctx.header(TOKEN_HEADER))) {
            throw ApiError.forbidden("Token de sesión ausente o no válido");
        }
    }

    private boolean validToken(String candidate) {
        return candidate != null
                && MessageDigest.isEqual(token, candidate.getBytes(StandardCharsets.UTF_8));
    }
}
