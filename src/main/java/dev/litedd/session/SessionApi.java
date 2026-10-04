package dev.litedd.session;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.litedd.http.ApiError;
import dev.litedd.http.ApiRoutes;
import dev.litedd.session.SessionMapper.TabRow;
import dev.litedd.store.Store;
import io.javalin.config.RoutesConfig;

import java.io.UncheckedIOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;

/** GET y PUT /api/session: pestañas, orden, activa, modo y estado (P-09). */
public final class SessionApi implements ApiRoutes {

    record TabDto(String id, String noteId, String mode, boolean active, JsonNode state) {
    }

    record Session(List<TabDto> tabs) {
    }

    private static final Set<String> MODES = Set.of("view", "edit");
    private static final ObjectMapper JSON = new ObjectMapper();

    private final Store store;

    public SessionApi(Store store) {
        this.store = store;
    }

    @Override
    public void register(RoutesConfig routes) {
        routes.get("/api/session", ctx -> ctx.json(load()));
        routes.put("/api/session", ctx -> {
            Session session = ctx.bodyAsClass(Session.class);
            List<TabDto> tabs = session.tabs() == null ? List.of() : session.tabs();
            for (TabDto t : tabs) {
                if (t.id() == null || t.id().isBlank() || t.noteId() == null || !MODES.contains(t.mode())) {
                    throw new ApiError(400, "invalid_session", "Pestaña no válida en la sesión");
                }
            }
            store.write(s -> {
                SessionMapper m = s.getMapper(SessionMapper.class);
                m.deleteAll();
                int position = 0;
                for (TabDto t : tabs) {
                    // Una nota borrada mientras tanto no se guarda en la sesión.
                    if (m.countActiveNote(t.noteId()) == 0) {
                        continue;
                    }
                    String state = t.state() == null || t.state().isNull() ? null : t.state().toString();
                    m.insert(new TabRow(t.id(), t.noteId(), position++, t.active(), t.mode(), state));
                }
                return null;
            });
            ctx.json(load());
        });
    }

    private Session load() {
        List<TabDto> tabs = new ArrayList<>();
        for (TabRow r : store.read(s -> s.getMapper(SessionMapper.class).selectAll())) {
            tabs.add(new TabDto(r.id(), r.noteId(), r.mode(), r.active(), parse(r.state())));
        }
        return new Session(tabs);
    }

    private static JsonNode parse(String state) {
        if (state == null) {
            return null;
        }
        try {
            return JSON.readTree(state);
        } catch (JsonProcessingException e) {
            throw new UncheckedIOException(e);
        }
    }
}
