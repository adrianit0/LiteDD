package dev.litedd.httpnotes;

import dev.litedd.AppInfo;
import dev.litedd.http.ApiError;
import dev.litedd.httpnotes.HttpNoteContent.Generated;
import dev.litedd.httpnotes.HttpNoteContent.Row;
import dev.litedd.settings.AppConfig;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/** Cabeceras de una llamada: las generadas (H-15), con los cambios de la nota, y las propias (H-16). */
public final class RequestHeaders {

    public static final String ACCEPT = "Accept";
    public static final String CONTENT_TYPE = "Content-Type";
    public static final String USER_AGENT = "User-Agent";
    public static final String CACHE_CONTROL = "Cache-Control";
    public static final String X_USERID = "X-USERID";
    public static final String X_CSRF_TOKEN = "X-CSRF-TOKEN";
    public static final String COOKIE = "Cookie";
    public static final String AUTHORIZATION = "Authorization";

    /** H-15: valores de serie de las cabeceras generadas fijas. */
    public static final String DEFAULT_ACCEPT = "application/json";
    public static final String DEFAULT_USER_AGENT = AppInfo.NAME + "/" + AppInfo.VERSION;
    public static final String DEFAULT_CACHE_CONTROL = "no-cache";

    /** H-16: el cliente HTTP de Java las pone él y no deja escribirlas. */
    static final Set<String> RESTRICTED = Set.of("host", "content-length", "connection", "expect", "upgrade");

    private RequestHeaders() {
    }

    /** H-17: Content-Type que corresponde al cuerpo. */
    static String contentTypeFor(HttpNoteContent.Body body, String boundary) {
        return switch (body.mode()) {
            case "form-data" -> "multipart/form-data; boundary=" + boundary;
            case "raw" -> switch (body.rawType()) {
                case "text" -> "text/plain";
                case "xml" -> "application/xml";
                default -> "application/json";
            };
            default -> "application/json";
        };
    }

    /**
     * H-15, H-23: las generadas en su orden, con los valores del login si los hay; luego los cambios de la
     * nota sobre ellas y por último las propias, que mandan sobre una generada del mismo nombre.
     */
    static List<Map.Entry<String, String>> build(HttpNoteContent content, String contentType, LoginSession login,
                                                 String authorization, AppConfig.Http settings) {
        Map<String, Map.Entry<String, String>> headers = new LinkedHashMap<>();
        // H-15, ADR-0022: Accept, User-Agent y Cache-Control con el valor de «Ajustes» si lo hay.
        put(headers, ACCEPT, orDefault(settings.accept(), DEFAULT_ACCEPT));
        put(headers, CONTENT_TYPE, contentType);
        put(headers, USER_AGENT, orDefault(settings.userAgent(), DEFAULT_USER_AGENT));
        put(headers, CACHE_CONTROL, orDefault(settings.cacheControl(), DEFAULT_CACHE_CONTROL));
        if (authorization != null) {
            put(headers, AUTHORIZATION, authorization);
        }
        if (login != null) {
            put(headers, X_USERID, login.userId());
            put(headers, X_CSRF_TOKEN, login.csrfToken());
            if (!login.cookieHeader().isEmpty()) {
                put(headers, COOKIE, login.cookieHeader());
            }
        }
        for (Map.Entry<String, Generated> change : content.generated().entrySet()) {
            String key = change.getKey().toLowerCase(Locale.ROOT);
            if (!headers.containsKey(key)) {
                continue;
            }
            Generated g = change.getValue();
            if (g.enabled() != null && !g.enabled()) {
                headers.remove(key);
            } else if (g.value() != null) {
                put(headers, headers.get(key).getKey(), g.value());
            }
        }
        for (Row h : content.headers()) {
            if (!h.active() || h.key() == null || h.key().isBlank()) {
                continue;
            }
            String name = h.key().strip();
            if (RESTRICTED.contains(name.toLowerCase(Locale.ROOT))) {
                throw new ApiError(400, "restricted_header", "La cabecera «" + name + "» la pone el cliente y no se puede escribir");
            }
            put(headers, name, h.value() == null ? "" : h.value());
        }
        for (Map.Entry<String, String> e : headers.values()) {
            if (e.getKey().chars().anyMatch(ch -> ch <= 32 || ch == ':' || ch >= 127)
                    || e.getValue().chars().anyMatch(ch -> ch == '\r' || ch == '\n')) {
                throw new ApiError(400, "invalid_header", "Cabecera no válida: «" + e.getKey() + "»");
            }
        }
        return new ArrayList<>(headers.values());
    }

    private static String orDefault(String value, String fallback) {
        return value == null ? fallback : value;
    }

    private static void put(Map<String, Map.Entry<String, String>> headers, String name, String value) {
        headers.put(name.toLowerCase(Locale.ROOT), Map.entry(name, value));
    }
}
