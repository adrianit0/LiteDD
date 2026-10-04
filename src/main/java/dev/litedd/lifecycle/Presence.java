package dev.litedd.lifecycle;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.Duration;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.function.Supplier;

/**
 * Presencia de ventanas (ciclo de vida, pasos 4 a 6, ADR-0017). Tras una despedida, si pasado el plazo
 * no queda ninguna ventana conectada, se apaga. Si la conexión se pierde sin despedida, solo se apaga
 * si hay apagado automático configurado.
 */
public final class Presence implements AutoCloseable {

    /** Ciclo de vida, paso 5. */
    public static final Duration BYE_GRACE = Duration.ofSeconds(15);
    private static final Logger log = LoggerFactory.getLogger(Presence.class);

    private final Runnable shutdown;
    private final Duration byeGrace;
    private final Supplier<Duration> autoShutdown;
    private final ScheduledExecutorService scheduler = Executors.newSingleThreadScheduledExecutor(r -> {
        Thread t = new Thread(r, "litedd-presence");
        t.setDaemon(true);
        return t;
    });
    private int connections;
    private boolean byeReceived;
    private ScheduledFuture<?> pending;

    /** @param autoShutdown plazo sin ventanas tras perder la presencia sin despedida; null desactivado */
    public Presence(Runnable shutdown, Duration byeGrace, Supplier<Duration> autoShutdown) {
        this.shutdown = shutdown;
        this.byeGrace = byeGrace;
        this.autoShutdown = autoShutdown;
    }

    public synchronized void connected() {
        connections++;
        byeReceived = false;
        cancelPending();
    }

    public synchronized void disconnected() {
        connections = Math.max(0, connections - 1);
        if (connections == 0 && !byeReceived) {
            Duration auto = autoShutdown.get();
            if (auto != null) {
                schedule(auto);
            }
        }
    }

    /** POST /api/presence/bye: una ventana se cierra. */
    public synchronized void bye() {
        byeReceived = true;
        schedule(byeGrace);
    }

    public synchronized int connections() {
        return connections;
    }

    ScheduledExecutorService scheduler() {
        return scheduler;
    }

    private void schedule(Duration delay) {
        cancelPending();
        pending = scheduler.schedule(this::check, delay.toMillis(), TimeUnit.MILLISECONDS);
    }

    private void check() {
        synchronized (this) {
            if (connections > 0) {
                return;
            }
        }
        log.info("No queda ninguna ventana abierta: LiteDD se apaga");
        shutdown.run();
    }

    private void cancelPending() {
        if (pending != null) {
            pending.cancel(false);
            pending = null;
        }
    }

    @Override
    public void close() {
        scheduler.shutdownNow();
    }
}
