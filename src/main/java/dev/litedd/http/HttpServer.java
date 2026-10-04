package dev.litedd.http;

import dev.litedd.AppInfo;
import io.javalin.Javalin;
import io.javalin.http.staticfiles.Location;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.Map;

/**
 * Servidor HTTP local: API JSON, interfaz estática y protecciones S-10 a S-14.
 */
public final class HttpServer {

    /** S-10: solo se escucha en la interfaz de bucle local. */
    public static final String HOST = "127.0.0.1";
    static final String TOKEN_PLACEHOLDER = "__LITEDD_TOKEN__";
    private static final String WEB_ROOT = "/web";

    private final int port;
    private final String token;
    private Javalin app;

    public HttpServer(int port, String token) {
        this.port = port;
        this.token = token;
    }

    public HttpServer start() {
        LocalSecurity security = new LocalSecurity(port, token);
        boolean hasWeb = HttpServer.class.getResource(WEB_ROOT + "/index.html") != null;

        app = Javalin.create(config -> {
            config.jetty.host = HOST;
            config.jetty.port = port;
            config.startup.showJavalinBanner = false;
            if (hasWeb) {
                config.staticFiles.add(files -> {
                    files.hostedPath = "/";
                    files.directory = WEB_ROOT;
                    files.location = Location.CLASSPATH;
                    // La página inicial se sirve aparte para inyectar el token (S-12).
                    files.skipFileFunction = req -> isIndex(req.getRequestURI());
                });
            }

            config.routes.before(security::check);
            config.routes.exception(ApiError.class, (e, ctx) -> ctx.status(e.status()).json(e.body()));

            config.routes.get("/api/health", ctx -> ctx.json(Map.of(
                    "app", AppInfo.NAME,
                    "version", AppInfo.VERSION)));

            if (hasWeb) {
                String index = readIndex();
                config.routes.get("/", ctx -> ctx
                        .header("Cache-Control", "no-store")
                        .html(index.replace(TOKEN_PLACEHOLDER, token)));
                config.routes.get("/index.html", ctx -> ctx.redirect("/"));
            }
        });
        app.start();
        return this;
    }

    public void stop() {
        if (app != null) {
            app.stop();
        }
    }

    public int port() {
        return port;
    }

    private static boolean isIndex(String uri) {
        return uri.equals("/") || uri.equals("/index.html");
    }

    private static String readIndex() {
        try (InputStream in = HttpServer.class.getResourceAsStream(WEB_ROOT + "/index.html")) {
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
