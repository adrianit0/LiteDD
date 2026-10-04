package dev.litedd.mysql;

import dev.litedd.http.ApiError;
import dev.litedd.http.ApiRoutes;
import io.javalin.config.RoutesConfig;

import java.sql.SQLException;
import java.util.List;
import java.util.Map;

/** Rutas /api/connection (C-01 a C-11). La contraseña nunca sale (S-21). */
public final class ConnectionApi implements ApiRoutes {

    record ConnectionRequest(String host, Integer port, String user, String password, String schema, String extraParams) {
    }

    record ConnectionView(boolean configured, String host, int port, String user, String schema, String extraParams,
                          boolean hasPassword) {
    }

    static final String DEFAULT_HOST = "127.0.0.1";
    static final int DEFAULT_PORT = 3306;

    private final ConnectionFile file;
    private final MySqlGateway gateway;

    public ConnectionApi(ConnectionFile file, MySqlGateway gateway) {
        this.file = file;
        this.gateway = gateway;
    }

    @Override
    public void register(RoutesConfig routes) {
        routes.get("/api/connection", ctx -> ctx.json(view()));

        routes.put("/api/connection", ctx -> {
            ConnectionSettings settings = settingsFrom(ctx.bodyAsClass(ConnectionRequest.class));
            file.save(settings);
            ctx.json(gateway.configure(settings));
        });

        routes.post("/api/connection/test", ctx -> {
            ConnectionSettings settings = settingsFrom(ctx.bodyAsClass(ConnectionRequest.class));
            try {
                List<String> schemas = MySqlGateway.listSchemas(settings);
                ctx.json(Map.of("schemas", schemas));
            } catch (SQLException e) {
                throw new ApiError(422, "connection_failed", "No se pudo conectar: " + MySqlGateway.rootMessage(e));
            }
        });

        routes.post("/api/connection/reconnect", ctx -> ctx.json(gateway.reconnect()));
        routes.get("/api/connection/status", ctx -> ctx.json(gateway.status()));
    }

    private ConnectionView view() {
        return file.load()
                .map(s -> new ConnectionView(true, s.host(), s.port(), s.user(), s.schemaOrEmpty(),
                        s.extraParams() == null ? "" : s.extraParams(), s.password() != null && !s.password().isEmpty()))
                .orElse(new ConnectionView(false, DEFAULT_HOST, DEFAULT_PORT, "", "", "", false));
    }

    /** ADR-0012: contraseña vacía conserva la guardada. */
    private ConnectionSettings settingsFrom(ConnectionRequest req) {
        String host = req.host() == null || req.host().isBlank() ? DEFAULT_HOST : req.host().strip();
        int port = req.port() == null ? DEFAULT_PORT : req.port();
        if (port < 1 || port > 65535) {
            throw new ApiError(400, "invalid_port", "El puerto debe estar entre 1 y 65535");
        }
        if (req.user() == null || req.user().isBlank()) {
            throw new ApiError(400, "missing_user", "Falta el usuario");
        }
        JdbcUrl.validateExtra(req.extraParams());
        String password = req.password();
        if (password == null || password.isEmpty()) {
            password = file.load().map(ConnectionSettings::password).orElse("");
        }
        return new ConnectionSettings(host, port, req.user().strip(), password,
                req.schema() == null ? "" : req.schema().strip(), req.extraParams() == null ? "" : req.extraParams().strip());
    }
}
