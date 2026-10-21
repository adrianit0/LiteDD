package dev.litedd.httpnotes;

import dev.litedd.http.ApiError;
import dev.litedd.http.ApiRoutes;
import dev.litedd.settings.AppConfig;
import io.javalin.config.RoutesConfig;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.function.Supplier;

/**
 * Rutas /api/http: ejecutar y cancelar una nota HTTP, el perfil activo, las contraseñas de los perfiles, la clave de
 * confirmación y la CA corporativa (H-21, H-30, H-63, H-66, H-69).
 */
public final class HttpApi implements ApiRoutes {

    record ExecuteRequest(String noteId, Long version, String executionId, String profileId, String confirmKey) {
    }

    record CancelRequest(String executionId) {
    }

    record ProfileRequest(String id) {
    }

    record CredentialsRequest(String profileId, String password) {
    }

    record ConfirmKeyRequest(String key) {
    }

    record CaRequest(String pem) {
    }

    private final HttpRunner runner;
    private final HttpCredentials credentials;
    private final CorporateCa ca;
    private final Supplier<AppConfig> config;

    public HttpApi(HttpRunner runner, HttpCredentials credentials, CorporateCa ca, Supplier<AppConfig> config) {
        this.runner = runner;
        this.credentials = credentials;
        this.ca = ca;
        this.config = config;
    }

    @Override
    public void register(RoutesConfig routes) {
        routes.post("/api/http/execute", ctx -> {
            ExecuteRequest req = ctx.bodyAsClass(ExecuteRequest.class);
            if (req.noteId() == null || req.version() == null || req.profileId() == null) {
                throw new ApiError(400, "bad_request", "Faltan la nota, su versión o el perfil");
            }
            ctx.json(runner.execute(req.noteId(), req.version(), req.executionId(), req.profileId(), req.confirmKey()));
        });
        routes.post("/api/http/cancel", ctx -> {
            CancelRequest req = ctx.bodyAsClass(CancelRequest.class);
            ctx.json(Map.of("cancelled", req.executionId() != null && runner.cancel(req.executionId())));
        });
        routes.get("/api/http/profile", ctx -> ctx.json(Map.of("active", runner.activeProfile().id())));
        routes.put("/api/http/profile", ctx -> {
            ProfileRequest req = ctx.bodyAsClass(ProfileRequest.class);
            ctx.json(Map.of("active", runner.selectProfile(req.id()).id()));
        });
        // H-21, S-21: solo se dice qué perfiles tienen contraseña; nunca se devuelve.
        routes.get("/api/http/credentials", ctx -> ctx.json(credentialsView()));
        routes.put("/api/http/credentials", ctx -> {
            CredentialsRequest req = ctx.bodyAsClass(CredentialsRequest.class);
            if (req.profileId() == null || !config.get().http().profileIds().contains(req.profileId())) {
                throw new ApiError(400, "unknown_profile", "El perfil no existe; guarda antes los ajustes");
            }
            credentials.setPassword(req.profileId(), req.password());
            ctx.json(credentialsView());
        });
        // H-69, S-21: la clave tampoco se devuelve nunca.
        routes.put("/api/http/confirm-key", ctx -> {
            ConfirmKeyRequest req = ctx.bodyAsClass(ConfirmKeyRequest.class);
            credentials.setConfirmKey(req.key());
            ctx.json(Map.of("hasConfirmKey", credentials.hasConfirmKey()));
        });
        routes.get("/api/http/ca", ctx -> ctx.json(Map.of("certificates", ca.certificates())));
        routes.put("/api/http/ca", ctx -> {
            CaRequest req = ctx.bodyAsClass(CaRequest.class);
            ctx.json(Map.of("certificates", ca.importPem(req.pem())));
        });
    }

    private Map<String, Object> credentialsView() {
        Map<String, Boolean> passwords = new LinkedHashMap<>();
        Set<String> stored = credentials.profilesWithPassword();
        config.get().http().profileIds().forEach(id -> passwords.put(id, stored.contains(id)));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("passwords", passwords);
        out.put("hasConfirmKey", credentials.hasConfirmKey());
        return out;
    }
}
