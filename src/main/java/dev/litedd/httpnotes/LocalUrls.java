package dev.litedd.httpnotes;

import dev.litedd.http.ApiError;
import dev.litedd.httpnotes.HttpNoteContent.Row;

import java.net.InetAddress;
import java.net.URI;
import java.net.URISyntaxException;
import java.net.URLEncoder;
import java.net.UnknownHostException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Direcciones de las notas HTTP: solo el propio equipo (H-40) y la URL final a partir de la base, el
 * endpoint, las variables de ruta y los params (H-10 a H-12, H-14).
 */
public final class LocalUrls {

    /** H-40: nombres admitidos; además deben resolver a una dirección local. */
    private static final Set<String> LOCAL_HOSTS = Set.of("127.0.0.1", "localhost", "[::1]", "::1");
    private static final Pattern PATH_VARIABLE = Pattern.compile("\\{([^{}/]+)}");

    private LocalUrls() {
    }

    /** H-10, H-40: la URL base de Ajustes. */
    public static URI validateBase(String base) {
        if (base == null || base.isBlank()) {
            throw new ApiError(400, "invalid_base_url", "Falta la URL base de las notas HTTP en «Ajustes»");
        }
        URI uri;
        try {
            uri = new URI(base.strip());
        } catch (URISyntaxException e) {
            throw new ApiError(400, "invalid_base_url", "La URL base no es válida: " + base.strip());
        }
        checkLocalName(uri);
        if (uri.getRawQuery() != null || uri.getRawFragment() != null) {
            throw new ApiError(400, "invalid_base_url", "La URL base no puede llevar «?» ni «#»");
        }
        return uri;
    }

    /** H-12: variables {nombre} del endpoint, en orden y sin repetir. */
    public static List<String> pathVariables(String endpoint) {
        Set<String> names = new LinkedHashSet<>();
        Matcher m = PATH_VARIABLE.matcher(endpoint);
        while (m.find()) {
            names.add(m.group(1));
        }
        return List.copyOf(names);
    }

    /** H-11: una sola barra entre base y endpoint. */
    static String join(String base, String endpoint) {
        if (endpoint.isEmpty()) {
            return base;
        }
        boolean baseSlash = base.endsWith("/");
        boolean endpointSlash = endpoint.startsWith("/");
        if (baseSlash && endpointSlash) {
            return base + endpoint.substring(1);
        }
        return baseSlash || endpointSlash ? base + endpoint : base + "/" + endpoint;
    }

    /** H-10 a H-12, H-14, H-40: URL final, comprobada de nuevo; nunca sale del host y puerto de la base. */
    public static URI compose(String base, String endpoint, Map<String, String> pathValues, List<Row> params) {
        URI baseUri = validateBase(base);
        StringBuilder path = new StringBuilder();
        Matcher m = PATH_VARIABLE.matcher(endpoint);
        List<String> missing = new ArrayList<>();
        while (m.find()) {
            String value = pathValues.get(m.group(1));
            if (value == null || value.isBlank()) {
                missing.add(m.group(1));
                m.appendReplacement(path, "");
                continue;
            }
            m.appendReplacement(path, Matcher.quoteReplacement(encodeSegment(value.strip())));
        }
        m.appendTail(path);
        if (!missing.isEmpty()) {
            throw new ApiError(400, "missing_path_value", "Falta el valor de " + String.join(", ", missing), missing);
        }
        StringBuilder url = new StringBuilder(join(baseUri.toString(), path.toString()));
        String separator = url.indexOf("?") >= 0 ? "&" : "?";
        for (Row p : params) {
            if (!p.active() || p.key() == null || p.key().isBlank()) {
                continue;
            }
            url.append(separator).append(encodeQuery(p.key().strip())).append('=').append(encodeQuery(p.value() == null ? "" : p.value()));
            separator = "&";
        }
        URI uri;
        try {
            uri = new URI(url.toString());
        } catch (URISyntaxException e) {
            throw new ApiError(400, "invalid_url", "La dirección no es válida: " + e.getInput());
        }
        checkLocalName(uri);
        if (!uri.getHost().equalsIgnoreCase(baseUri.getHost()) || port(uri) != port(baseUri)) {
            throw new ApiError(400, "not_local", "La dirección sale del servidor de la URL base: " + uri.getHost());
        }
        return uri;
    }

    /** H-40: además del nombre, todas sus direcciones deben ser del propio equipo. Se comprueba en cada llamada. */
    public static void checkResolvesLocally(URI uri) {
        try {
            for (InetAddress a : InetAddress.getAllByName(stripBrackets(uri.getHost()))) {
                if (!a.isLoopbackAddress()) {
                    throw notLocal(uri.getHost());
                }
            }
        } catch (UnknownHostException e) {
            throw notLocal(uri.getHost());
        }
    }

    private static void checkLocalName(URI uri) {
        String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
        if (!scheme.equals("http") && !scheme.equals("https")) {
            throw new ApiError(400, "not_local", "Solo se admiten direcciones http o https del propio equipo");
        }
        if (uri.getRawUserInfo() != null || uri.getHost() == null
                || !LOCAL_HOSTS.contains(uri.getHost().toLowerCase(Locale.ROOT))) {
            throw notLocal(uri.getHost() == null ? uri.toString() : uri.getHost());
        }
    }

    private static ApiError notLocal(String host) {
        return new ApiError(400, "not_local",
                "Solo se puede llamar a 127.0.0.1, localhost o ::1; «" + host + "» no es una dirección local");
    }

    static int port(URI uri) {
        if (uri.getPort() >= 0) {
            return uri.getPort();
        }
        return "https".equalsIgnoreCase(uri.getScheme()) ? 443 : 80;
    }

    private static String stripBrackets(String host) {
        return host.startsWith("[") && host.endsWith("]") ? host.substring(1, host.length() - 1) : host;
    }

    private static String encodeSegment(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8).replace("+", "%20");
    }

    private static String encodeQuery(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }
}
