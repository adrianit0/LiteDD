package dev.litedd.httpnotes;

import dev.litedd.http.ApiError;
import dev.litedd.http.ApiRoutes;
import io.javalin.config.RoutesConfig;

import java.util.Map;

/** Rutas /api/http: ejecutar y cancelar una nota HTTP, y la contraseña de su login (H-21, H-30). */
public final class HttpApi implements ApiRoutes {

    record ExecuteRequest(String noteId, Long version, String executionId) {
    }

    record CancelRequest(String executionId) {
    }

    record CredentialsRequest(String password) {
    }

    private final HttpRunner runner;
    private final HttpCredentials credentials;

    public HttpApi(HttpRunner runner, HttpCredentials credentials) {
        this.runner = runner;
        this.credentials = credentials;
    }

    @Override
    public void register(RoutesConfig routes) {
        routes.post("/api/http/execute", ctx -> {
            ExecuteRequest req = ctx.bodyAsClass(ExecuteRequest.class);
            if (req.noteId() == null || req.version() == null) {
                throw new ApiError(400, "bad_request", "Faltan la nota o su versión");
            }
            ctx.json(runner.execute(req.noteId(), req.version(), req.executionId()));
        });
        routes.post("/api/http/cancel", ctx -> {
            CancelRequest req = ctx.bodyAsClass(CancelRequest.class);
            ctx.json(Map.of("cancelled", req.executionId() != null && runner.cancel(req.executionId())));
        });
        // H-21, S-21: solo se dice si hay contraseña; nunca se devuelve.
        routes.get("/api/http/credentials", ctx -> ctx.json(Map.of("hasPassword", credentials.password().isPresent())));
        routes.put("/api/http/credentials", ctx -> {
            CredentialsRequest req = ctx.bodyAsClass(CredentialsRequest.class);
            credentials.setPassword(req.password());
            ctx.json(Map.of("hasPassword", credentials.password().isPresent()));
        });
    }
}
