package dev.litedd.httpnotes;

import java.util.Map;
import java.util.stream.Collectors;

/**
 * H-23, H-25: lo que deja un login correcto. Vive solo en memoria y se pierde al apagar.
 *
 * @param cookies todas las cookies del login, en su orden
 */
public record LoginSession(String user, String userId, String csrfToken, Map<String, String> cookies) {

    /** H-23: la cabecera Cookie de la llamada. */
    public String cookieHeader() {
        return cookies.entrySet().stream().map(e -> e.getKey() + "=" + e.getValue()).collect(Collectors.joining("; "));
    }
}
