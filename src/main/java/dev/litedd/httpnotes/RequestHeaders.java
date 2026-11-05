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
import java.util.stream.Collectors;
import java.util.stream.Stream;

/**
 * Cabeceras de una llamada: las generadas (H-15), que empiezan por las de «Ajustes» (H-72), con los cambios de la nota,
 * y las propias (H-16).
 */
public final class RequestHeaders {

    public static final String ACCEPT = "Accept";
    public static final String CONTENT_TYPE = "Content-Type";
    public static final String USER_AGENT = "User-Agent";
    public static final String CACHE_CONTROL = "Cache-Control";
    public static final String X_USERID = "X-USERID";
    public static final String X_CSRF_TOKEN = "X-CSRF-TOKEN";
    public static final String COOKIE = "Cookie";
    public static final String AUTHORIZATION = "Authorization";

    /** H-72: valores de serie de las cabeceras básicas; en «Ajustes», el valor vacío es este. */
    public static final String DEFAULT_ACCEPT = "application/json";
    public static final String DEFAULT_USER_AGENT = AppInfo.NAME + "/" + AppInfo.VERSION;
    public static final String DEFAULT_CACHE_CONTROL = "no-cache";

    /** H-72, H-74: las cabeceras por defecto de serie, activas y con el valor de serie. */
    public static final List<Row> BASIC = List.of(new Row(ACCEPT, "", true), new Row(USER_AGENT, "", true), new Row(CACHE_CONTROL, "", true));

    /** H-16: el cliente HTTP de Java las pone él y no deja escribirlas. */
    static final Set<String> RESTRICTED = Set.of("host", "content-length", "connection", "expect", "upgrade");

    /** H-73: las calcula LiteDD en cada llamada. */
    static final Set<String> CALCULATED = Set.of("content-type", "x-userid", "x-csrf-token", "authorization");

    private RequestHeaders() {
    }

    /** H-73: por qué un nombre no vale como cabecera por defecto; null si vale. */
    public static String defaultHeaderProblem(String name) {
        String lower = name.toLowerCase(Locale.ROOT);
        if (RESTRICTED.contains(lower)) {
            return "la pone el cliente y no se puede escribir";
        }
        if (CALCULATED.contains(lower)) {
            return "la calcula LiteDD en cada llamada";
        }
        return invalidName(name) ? "no es un nombre de cabecera válido" : null;
    }

    /** H-72: el valor que se envía; vacío en una básica es su valor de serie. */
    static String defaultValue(Row header) {
        if (!header.value().isEmpty()) {
            return header.value();
        }
        return switch (header.key().toLowerCase(Locale.ROOT)) {
            case "accept" -> DEFAULT_ACCEPT;
            case "user-agent" -> DEFAULT_USER_AGENT;
            case "cache-control" -> DEFAULT_CACHE_CONTROL;
            default -> "";
        };
    }

    private static boolean invalidName(String name) {
        return name.isEmpty() || name.chars().anyMatch(ch -> ch <= 32 || ch == ':' || ch >= 127);
    }

    /** H-17, ADR-0038: el cuerpo raw se envía en UTF-8 y lo declara. */
    static final String UTF_8 = "; charset=UTF-8";

    /** H-17: Content-Type que corresponde al cuerpo. */
    static String contentTypeFor(HttpNoteContent.Body body, String boundary) {
        return switch (body.mode()) {
            case "form-data" -> "multipart/form-data; boundary=" + boundary;
            case "raw" -> switch (body.rawType()) {
                case "text" -> "text/plain";
                case "xml" -> "application/xml";
                default -> "application/json";
            } + UTF_8;
            default -> "application/json";
        };
    }

    /** Una cabecera candidata: enabled false no se envía salvo que la nota la active. */
    private record Header(String name, String value, boolean enabled) {
    }

    /**
     * H-15, H-23, H-72, H-73: las generadas en su orden (las de «Ajustes», Content-Type y las del login); luego los
     * cambios de la nota sobre ellas y por último las propias, que mandan sobre una generada del mismo nombre.
     */
    static List<Map.Entry<String, String>> build(HttpNoteContent content, String contentType, LoginSession login,
                                                 String authorization, AppConfig.Http settings) {
        Map<String, Header> headers = new LinkedHashMap<>();
        for (Row h : settings.headers()) {
            put(headers, h.key(), defaultValue(h), h.active());
        }
        put(headers, CONTENT_TYPE, contentType, true);
        if (authorization != null) {
            put(headers, AUTHORIZATION, authorization, true);
        }
        if (login != null) {
            put(headers, X_USERID, login.userId(), true);
            put(headers, X_CSRF_TOKEN, login.csrfToken(), true);
            // H-73: una Cookie activa de «Ajustes» se añade a las del login.
            Header extra = headers.get(COOKIE.toLowerCase(Locale.ROOT));
            String cookies = Stream.of(login.cookieHeader(), extra != null && extra.enabled() ? extra.value() : "")
                    .filter(c -> !c.isEmpty()).collect(Collectors.joining("; "));
            if (!cookies.isEmpty()) {
                put(headers, COOKIE, cookies, true);
            }
        }
        for (Map.Entry<String, Generated> change : content.generated().entrySet()) {
            Header current = headers.get(change.getKey().toLowerCase(Locale.ROOT));
            if (current == null) {
                continue;
            }
            Generated g = change.getValue();
            put(headers, current.name(), g.value() == null ? current.value() : g.value(),
                    g.enabled() == null ? current.enabled() : g.enabled());
        }
        for (Row h : content.headers()) {
            if (!h.active() || h.key() == null || h.key().isBlank()) {
                continue;
            }
            String name = h.key().strip();
            if (RESTRICTED.contains(name.toLowerCase(Locale.ROOT))) {
                throw new ApiError(400, "restricted_header", "La cabecera «" + name + "» la pone el cliente y no se puede escribir");
            }
            put(headers, name, h.value() == null ? "" : h.value(), true);
        }
        List<Map.Entry<String, String>> sent = new ArrayList<>();
        for (Header h : headers.values()) {
            if (!h.enabled()) {
                continue;
            }
            if (invalidName(h.name()) || h.value().chars().anyMatch(ch -> ch == '\r' || ch == '\n')) {
                throw new ApiError(400, "invalid_header", "Cabecera no válida: «" + h.name() + "»");
            }
            sent.add(Map.entry(h.name(), h.value()));
        }
        return sent;
    }

    private static void put(Map<String, Header> headers, String name, String value, boolean enabled) {
        headers.put(name.toLowerCase(Locale.ROOT), new Header(name, value, enabled));
    }
}
