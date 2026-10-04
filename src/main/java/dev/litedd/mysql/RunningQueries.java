package dev.litedd.mysql;

import java.sql.SQLException;
import java.sql.Statement;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/** Consultas en curso por executionId, para cancelarlas (Q-41, C-11). */
public final class RunningQueries {

    private final Map<String, Statement> active = new ConcurrentHashMap<>();
    private final Set<String> cancelled = ConcurrentHashMap.newKeySet();

    void register(String executionId, Statement statement) {
        cancelled.remove(executionId);
        active.put(executionId, statement);
    }

    void unregister(String executionId) {
        active.remove(executionId);
    }

    /** Statement.cancel() sobre la consulta; false si no hay ninguna con ese identificador. */
    public boolean cancel(String executionId) {
        Statement st = active.get(executionId);
        if (st == null) {
            return false;
        }
        cancelled.add(executionId);
        try {
            st.cancel();
        } catch (SQLException e) {
            return false;
        }
        return true;
    }

    /** ¿Se canceló a petición? Se consulta una vez. */
    boolean wasCancelled(String executionId) {
        return cancelled.remove(executionId);
    }

    void cancelAll() {
        active.keySet().forEach(this::cancel);
    }
}
