package dev.litedd.notes;

import dev.litedd.http.ApiError;
import dev.litedd.http.ApiRoutes;
import io.javalin.config.RoutesConfig;

import java.util.Map;

/** Rutas /api/constants (M-65, M-66). */
public final class ConstantsApi implements ApiRoutes {

    record UpdateRequest(Map<String, String> values) {
    }

    private final JavaConstantValues constants;

    public ConstantsApi(JavaConstantValues constants) {
        this.constants = constants;
    }

    @Override
    public void register(RoutesConfig routes) {
        routes.get("/api/constants", ctx -> ctx.json(constants.list()));
        routes.put("/api/constants", ctx -> {
            UpdateRequest req = ctx.bodyAsClass(UpdateRequest.class);
            if (req.values() == null) {
                throw new ApiError(400, "bad_request", "Faltan los valores");
            }
            ctx.json(constants.update(req.values()));
        });
    }
}
