package dev.litedd.httpnotes;

import dev.litedd.http.ApiError;
import dev.litedd.httpnotes.HttpNoteContent.Row;
import dev.litedd.settings.AppConfig.Profile;

import java.net.InetAddress;
import java.net.URI;
import java.net.URISyntaxException;
import java.net.URLEncoder;
import java.net.UnknownHostException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * Direcciones de las notas HTTP: solo el propio equipo con el perfil Local (H-40) o, con un perfil de preproducción,
 * https y un nombre de host (H-65). La URL final sale de la base del perfil, el endpoint, las variables de ruta y los
 * params (H-10 a H-12, H-14).
 */
public final class HttpUrls {

    /** H-40: nombres admitidos; además deben resolver a una dirección local. */
    private static final Set<String> LOCAL_HOSTS = Set.of("127.0.0.1", "localhost", "[::1]", "::1");

    private HttpUrls() {
    }

    /** H-10, H-40, H-65: la URL base del perfil. */
    public static URI validateBase(Profile profile) {
        String base = profile.baseUrl();
        if (base == null || base.isBlank()) {
            throw new ApiError(400, "invalid_base_url", "Falta la URL base del perfil «" + profile.name() + "» en «Ajustes»");
        }
        URI uri;
        try {
            uri = new URI(base.strip());
        } catch (URISyntaxException e) {
            throw new ApiError(400, "invalid_base_url", "La URL base no es válida: " + base.strip());
        }
        checkAllowed(uri, profile);
        if (uri.getRawQuery() != null || uri.getRawFragment() != null) {
            throw new ApiError(400, "invalid_base_url", "La URL base no puede llevar «?» ni «#»");
        }
        return uri;
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

    /**
     * H-10 a H-14, H-18, H-40, H-65: URL final, comprobada de nuevo; nunca sale del host y puerto de la base del perfil.
     * Las variables #{nombre} del endpoint se codifican como segmento de ruta; params ya llega sustituido.
     */
    public static URI compose(Profile profile, String endpoint, Map<String, String> values, List<Row> params) {
        URI baseUri = validateBase(profile);
        String path = Variables.fill(endpoint, values, v -> encodeSegment(v.strip()));
        StringBuilder url = new StringBuilder(join(baseUri.toString(), path));
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
        checkAllowed(uri, profile);
        if (!uri.getHost().equalsIgnoreCase(baseUri.getHost()) || port(uri) != port(baseUri)) {
            throw new ApiError(400, profile.isLocal() ? "not_local" : "not_allowed",
                    "La dirección sale del servidor de la URL base: " + uri.getHost());
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

    private static void checkAllowed(URI uri, Profile profile) {
        if (profile.isLocal()) {
            checkLocalName(uri);
        } else {
            checkPreproductionName(uri);
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

    /** H-65: https, sin usuario en la URL y con un nombre de host, nunca una IP: así el nombre del certificado se comprueba. */
    private static void checkPreproductionName(URI uri) {
        String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
        if (!scheme.equals("https")) {
            throw new ApiError(400, "not_allowed", "Un entorno de preproducción solo admite direcciones https");
        }
        if (uri.getRawUserInfo() != null) {
            throw new ApiError(400, "not_allowed", "La dirección no puede llevar usuario ni contraseña");
        }
        if (uri.getHost() == null) {
            throw new ApiError(400, "not_allowed", "La dirección no tiene un nombre de host válido: " + uri);
        }
        if (!isHostName(uri.getHost())) {
            throw new ApiError(400, "not_allowed",
                    "Un entorno de preproducción se indica con un nombre de host, no con una dirección IP: " + uri.getHost());
        }
    }

    /** Un nombre de host termina en una etiqueta que empieza por letra; una IPv4, en cualquiera de sus formas, no. */
    static boolean isHostName(String host) {
        if (host.startsWith("[")) {
            return false;
        }
        String last = host.substring(host.lastIndexOf('.') + 1);
        return !last.isEmpty() && Character.isLetter(last.charAt(0));
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
