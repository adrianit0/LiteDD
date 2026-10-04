package dev.litedd.settings;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.litedd.http.ApiError;
import dev.litedd.http.ApiRoutes;
import dev.litedd.store.Store;
import io.javalin.config.RoutesConfig;

import java.io.UncheckedIOException;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.regex.Pattern;

/** GET y PUT /api/settings sobre la tabla setting (ADR-0005). */
public final class SettingsApi implements ApiRoutes {

    private static final Pattern KEY = Pattern.compile("[A-Za-z0-9._-]{1,100}");
    private static final ObjectMapper JSON = new ObjectMapper();

    private final Store store;

    public SettingsApi(Store store) {
        this.store = store;
    }

    @Override
    public void register(RoutesConfig routes) {
        routes.get("/api/settings", ctx -> ctx.json(all()));
        routes.put("/api/settings", ctx -> {
            Map<String, JsonNode> changes = JSON.readValue(ctx.body(), new TypeReference<>() {
            });
            for (String key : changes.keySet()) {
                if (!KEY.matcher(key).matches()) {
                    throw new ApiError(400, "invalid_setting", "Clave de ajuste no válida: " + key);
                }
            }
            store.write(s -> {
                SettingMapper m = s.getMapper(SettingMapper.class);
                changes.forEach((k, v) -> m.upsert(k, v.toString()));
                return null;
            });
            ctx.json(all());
        });
    }

    private Map<String, JsonNode> all() {
        Map<String, JsonNode> out = new LinkedHashMap<>();
        store.read(s -> s.getMapper(SettingMapper.class).selectAll()).forEach(r -> {
            try {
                out.put(r.key(), JSON.readTree(r.value()));
            } catch (JsonProcessingException e) {
                throw new UncheckedIOException(e);
            }
        });
        return out;
    }
}
