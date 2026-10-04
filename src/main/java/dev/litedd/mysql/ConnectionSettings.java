package dev.litedd.mysql;

/** Contenido de connection.json (C-01). La contraseña no sale nunca por la API (S-21). */
public record ConnectionSettings(String host, Integer port, String user, String password, String schema, String extraParams) {

    public String schemaOrEmpty() {
        return schema == null ? "" : schema.strip();
    }

    public ConnectionSettings withPassword(String newPassword) {
        return new ConnectionSettings(host, port, user, newPassword, schema, extraParams);
    }
}
