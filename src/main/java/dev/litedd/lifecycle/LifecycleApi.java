package dev.litedd.lifecycle;

import dev.litedd.http.ApiError;
import dev.litedd.http.ApiRoutes;
import io.javalin.config.RoutesConfig;
import io.javalin.http.sse.SseClient;

import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;
import java.util.regex.Pattern;

/**
 * /api/events (presencia), /api/presence/bye y /api/shutdown (ciclo de vida, ADR-0017), y /api/open-link
 * (N-32, ADR-0036). La interfaz abre /api/events con fetch para poder enviar el token (S-12).
 */
public final class LifecycleApi implements ApiRoutes {

    /** Una conexión cerrada se descubre al escribir; con 5 s se detecta antes de que venza la despedida. */
    private static final long HEARTBEAT_SECONDS = 5;

    /** ADR-0036: solo enlaces web o de correo, sin espacios ni caracteres de control. */
    private static final Pattern LINK = Pattern.compile("(?i)(https?|mailto):[^\\s\\p{Cntrl}]+");

    record LinkRequest(String url) {
    }

    private final Presence presence;
    private final Runnable shutdown;
    private final Consumer<String> linkOpener;
    private final Set<SseClient> clients = ConcurrentHashMap.newKeySet();

    public LifecycleApi(Presence presence, Runnable shutdown, Consumer<String> linkOpener) {
        this.presence = presence;
        this.shutdown = shutdown;
        this.linkOpener = linkOpener;
        // Un comentario periódico descubre las conexiones caídas.
        presence.scheduler().scheduleAtFixedRate(() -> clients.forEach(c -> {
            try {
                c.sendComment("latido");
            } catch (RuntimeException e) {
                c.close();
            }
        }), HEARTBEAT_SECONDS, HEARTBEAT_SECONDS, TimeUnit.SECONDS);
    }

    @Override
    public void register(RoutesConfig routes) {
        routes.sse("/api/events", client -> {
            client.keepAlive();
            clients.add(client);
            presence.connected();
            client.onClose(() -> {
                if (clients.remove(client)) {
                    presence.disconnected();
                }
            });
            client.sendComment("conectado");
        });

        routes.post("/api/presence/bye", ctx -> {
            presence.bye();
            ctx.json(Map.of("ok", true));
        });

        routes.post("/api/shutdown", ctx -> {
            ctx.json(Map.of("stopping", true));
            // Se responde antes de apagar.
            Thread.ofVirtual().name("litedd-stop").start(() -> {
                try {
                    Thread.sleep(200);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
                shutdown.run();
            });
        });

        routes.post("/api/open-link", ctx -> {
            String url = ctx.bodyAsClass(LinkRequest.class).url();
            if (url == null || !LINK.matcher(url).matches()) {
                throw new ApiError(400, "invalid_link", "Solo se pueden abrir enlaces http, https o mailto");
            }
            try {
                linkOpener.accept(url);
            } catch (RuntimeException e) {
                throw new ApiError(500, "open_failed", "No se pudo abrir el enlace en el navegador");
            }
            ctx.json(Map.of("opened", true));
        });
    }
}
