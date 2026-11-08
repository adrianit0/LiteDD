package dev.litedd.lifecycle;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.litedd.http.ApiError;
import dev.litedd.http.ApiRoutes;
import io.javalin.config.RoutesConfig;
import io.javalin.http.sse.SseClient;

import java.io.UncheckedIOException;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Consumer;
import java.util.regex.Pattern;

/**
 * /api/events (presencia), /api/presence/bye y /api/shutdown (ciclo de vida, ADR-0017), /api/open-link
 * (N-32, ADR-0036) y /api/open-note (N-95, N-96, ADR-0045). La interfaz abre /api/events con fetch para
 * poder enviar el token (S-12).
 */
public final class LifecycleApi implements ApiRoutes {

    /** Una conexión cerrada se descubre al escribir; con 5 s se detecta antes de que venza la despedida. */
    private static final long HEARTBEAT_SECONDS = 5;

    /** ADR-0045: evento del canal con la nota pedida desde fuera. */
    static final String OPEN_EVENT = "open";

    /** ADR-0036: solo enlaces web o de correo, sin espacios ni caracteres de control. */
    private static final Pattern LINK = Pattern.compile("(?i)(https?|mailto):[^\\s\\p{Cntrl}]+");

    private static final ObjectMapper JSON = new ObjectMapper();

    record LinkRequest(String url) {
    }

    private final Presence presence;
    private final Runnable shutdown;
    private final Consumer<String> linkOpener;
    private final Runnable windowOpener;
    private final Runnable windowRaiser;
    private final Set<SseClient> clients = ConcurrentHashMap.newKeySet();
    /** ADR-0045: la nota que espera a que se conecte la ventana que se ha abierto para ella. */
    private final AtomicReference<String> pending = new AtomicReference<>();

    /**
     * @param windowOpener abre una ventana nueva (ciclo de vida, paso 3)
     * @param windowRaiser trae al frente la ventana abierta (ADR-0045)
     */
    public LifecycleApi(Presence presence, Runnable shutdown, Consumer<String> linkOpener, Runnable windowOpener,
                        Runnable windowRaiser) {
        this.presence = presence;
        this.shutdown = shutdown;
        this.linkOpener = linkOpener;
        this.windowOpener = windowOpener;
        this.windowRaiser = windowRaiser;
        // Un comentario periódico descubre las conexiones caídas.
        presence.scheduler().scheduleAtFixedRate(() -> clients.forEach(c -> {
            try {
                c.sendComment("latido");
            } catch (RuntimeException e) {
                c.close();
            }
        }), HEARTBEAT_SECONDS, HEARTBEAT_SECONDS, TimeUnit.SECONDS);
    }

    /**
     * N-95, N-96: entrega la nota a las ventanas conectadas y trae la ventana al frente. Sin ninguna, la
     * guarda, abre una ventana y se la entrega cuando se conecta (ADR-0045).
     */
    public void open(OpenRequest request) {
        String data;
        try {
            data = JSON.writeValueAsString(request);
        } catch (JsonProcessingException e) {
            throw new UncheckedIOException(e);
        }
        int delivered = 0;
        for (SseClient client : clients) {
            if (!client.terminated()) {
                try {
                    client.sendEvent(OPEN_EVENT, data);
                } catch (RuntimeException e) {
                    client.close();
                }
            }
            if (client.terminated()) {
                client.close();
            } else {
                delivered++;
            }
        }
        if (delivered > 0) {
            windowRaiser.run();
        } else {
            pending.set(data);
            windowOpener.run();
        }
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
            String waiting = pending.getAndSet(null);
            if (waiting != null) {
                client.sendEvent(OPEN_EVENT, waiting);
            }
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

        routes.post("/api/open-note", ctx -> {
            OpenRequest request = ctx.bodyAsClass(OpenRequest.class);
            if (request == null || !request.valid()) {
                throw new ApiError(400, "invalid_note", "Indica el identificador o el título de una nota");
            }
            try {
                open(request);
            } catch (RuntimeException e) {
                throw new ApiError(500, "open_failed", "No se pudo abrir la ventana de LiteDD");
            }
            ctx.json(Map.of("opened", true));
        });
    }
}
