package dev.litedd.settings;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import dev.litedd.http.ApiError;
import dev.litedd.httpnotes.HttpUrls;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Ajustes de la pantalla «Ajustes» (U-10), guardados en config.json (ADR-0005, ADR-0017).
 *
 * @param defaultPageSize     Q-50: 10, 20, 50, 100, 200, 500 o null («Sin límite»)
 * @param rowCap              Q-55: tope de filas
 * @param queryTimeoutSeconds S-05, Q-43: tiempo máximo por consulta
 * @param port                puerto local; se aplica al siguiente arranque
 * @param autoShutdownMinutes apagado tras N minutos sin ventanas y sin despedida; null desactivado
 * @param autosave            N-40: guardado automático; false, guardado manual (N-46). Si falta, true
 * @param http                notas HTTP (H-10, H-20, H-22, H-31, H-35, H-60). Si falta, los valores por defecto
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record AppConfig(Integer defaultPageSize, int rowCap, int queryTimeoutSeconds, int port, Integer autoShutdownMinutes,
                        Boolean autosave, Http http) {

    /**
     * Ajustes de las notas HTTP. Las contraseñas y la clave de confirmación no están aquí: van a http.json (H-21, H-64).
     *
     * @param preproduction  H-62: casilla «Permitir entornos de preproducción»
     * @param profiles       H-60, H-61: Local, siempre el primero, y los entornos de preproducción
     * @param loginNoteId    H-20: nota HTTP de login, común a todos los perfiles; null sin elegir
     * @param timeoutSeconds H-31
     * @param maxResponseMb  H-35
     * @param accept         H-15, ADR-0022: Accept por defecto; null el de serie
     * @param userAgent      H-15: User-Agent por defecto; null el de serie
     * @param cacheControl   H-15: Cache-Control por defecto; null el de serie
     */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Http(boolean preproduction, List<Profile> profiles, String loginNoteId, Integer timeoutSeconds, Integer maxResponseMb,
                       String accept, String userAgent, String cacheControl) {

        public static final Http DEFAULT = new Http(null, null, "", 30, 10, null, null, null);

        private static final Pattern PROFILE_ID = Pattern.compile("[A-Za-z0-9_-]{1,64}");
        private static final int MAX_NAME = 60;

        public Http {
            profiles = localFirst(profiles);
            loginNoteId = loginNoteId == null || loginNoteId.isBlank() ? null : loginNoteId;
            timeoutSeconds = timeoutSeconds == null ? 30 : timeoutSeconds;
            maxResponseMb = maxResponseMb == null ? 10 : maxResponseMb;
            accept = blankToNull(accept);
            userAgent = blankToNull(userAgent);
            cacheControl = blankToNull(cacheControl);
        }

        /** Solo el perfil Local, con su URL base y su usuario: como eran los ajustes antes de los perfiles (H-61). */
        public Http(String baseUrl, String loginNoteId, String user, Integer timeoutSeconds, Integer maxResponseMb,
                    String accept, String userAgent, String cacheControl) {
            this(false, List.of(Profile.local(baseUrl, user)), loginNoteId, timeoutSeconds, maxResponseMb, accept, userAgent, cacheControl);
        }

        /** H-61: un config.json anterior a los perfiles trae baseUrl y user, que pasan al perfil Local. */
        @JsonCreator
        static Http fromJson(@JsonProperty("preproduction") Boolean preproduction, @JsonProperty("profiles") List<Profile> profiles,
                             @JsonProperty("baseUrl") String baseUrl, @JsonProperty("user") String user,
                             @JsonProperty("loginNoteId") String loginNoteId, @JsonProperty("timeoutSeconds") Integer timeoutSeconds,
                             @JsonProperty("maxResponseMb") Integer maxResponseMb, @JsonProperty("accept") String accept,
                             @JsonProperty("userAgent") String userAgent, @JsonProperty("cacheControl") String cacheControl) {
            List<Profile> list = new ArrayList<>(profiles == null ? List.of() : profiles);
            if (list.stream().filter(Objects::nonNull).noneMatch(Profile::isLocal)) {
                list.addFirst(Profile.local(baseUrl, user));
            }
            return new Http(preproduction != null && preproduction, list, loginNoteId, timeoutSeconds, maxResponseMb,
                    accept, userAgent, cacheControl);
        }

        /** H-60: el perfil fijo. */
        public Profile local() {
            return profiles.getFirst();
        }

        /** H-62, H-63: un perfil que se puede elegir: Local o, con la casilla marcada, uno de preproducción. */
        public Optional<Profile> usable(String id) {
            return profiles.stream().filter(p -> p.id().equals(id) && (p.isLocal() || preproduction)).findFirst();
        }

        public Set<String> profileIds() {
            Set<String> ids = new LinkedHashSet<>();
            profiles.forEach(p -> ids.add(p.id()));
            return ids;
        }

        /** H-60, H-62, H-65. */
        void validate() {
            Set<String> ids = new HashSet<>();
            Set<String> names = new HashSet<>();
            for (Profile p : profiles) {
                if (!PROFILE_ID.matcher(p.id()).matches() || !ids.add(p.id())) {
                    throw invalid("Identificador de perfil no válido o repetido: " + p.id());
                }
                if (p.name().isEmpty()) {
                    throw invalid("Cada entorno de preproducción necesita un nombre");
                }
                if (p.name().length() > MAX_NAME || hasControl(p.name()) || hasControl(p.user())) {
                    throw invalid("El nombre de un perfil tiene como mucho " + MAX_NAME + " caracteres y, como el usuario, "
                            + "no admite saltos de línea ni caracteres de control");
                }
                if (!names.add(p.name().toLowerCase(Locale.ROOT))) {
                    throw invalid("Ya hay un perfil llamado «" + p.name() + "»");
                }
                if (p.baseUrl() != null) {
                    try {
                        HttpUrls.validateBase(p);
                    } catch (ApiError e) {
                        throw invalid("Perfil «" + p.name() + "»: " + e.getMessage());
                    }
                }
            }
        }

        private static List<Profile> localFirst(List<Profile> profiles) {
            List<Profile> given = profiles == null ? List.of() : profiles.stream().filter(Objects::nonNull).toList();
            List<Profile> out = new ArrayList<>();
            out.add(given.stream().filter(Profile::isLocal).findFirst().orElse(Profile.local(null, "")));
            given.stream().filter(p -> !p.isLocal()).forEach(out::add);
            return List.copyOf(out);
        }

        private static boolean hasControl(String value) {
            return value.chars().anyMatch(ch -> ch < 32 || ch == 127);
        }

        private static String blankToNull(String value) {
            return value == null || value.isBlank() ? null : value.strip();
        }
    }

    /**
     * Perfil de destino de las notas HTTP (H-60, H-61, ADR-0028). La contraseña no está aquí: va a http.json.
     *
     * @param id         «local» para el perfil fijo; cualquier otro es un entorno de preproducción
     * @param name       el que se ve en el selector; el de Local es siempre «Local»
     * @param baseUrl    H-10, H-40, H-65; null sin configurar
     * @param user       H-22: usuario por defecto
     * @param requireKey H-69: pedir la clave de confirmación al enviar
     */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Profile(String id, String name, String baseUrl, String user, boolean requireKey) {

        public static final String LOCAL_ID = "local";
        public static final String LOCAL_NAME = "Local";

        public Profile {
            id = id == null ? "" : id.strip();
            name = LOCAL_ID.equals(id) ? LOCAL_NAME : name == null ? "" : name.strip();
            baseUrl = baseUrl == null || baseUrl.isBlank() ? null : baseUrl.strip();
            user = user == null ? "" : user.strip();
        }

        /** Propuesta C de ADR-0028: sin el campo, Local no pide la clave y un entorno de preproducción sí. */
        @JsonCreator
        static Profile fromJson(@JsonProperty("id") String id, @JsonProperty("name") String name, @JsonProperty("baseUrl") String baseUrl,
                                @JsonProperty("user") String user, @JsonProperty("requireKey") Boolean requireKey) {
            boolean local = id != null && LOCAL_ID.equals(id.strip());
            return new Profile(id, name, baseUrl, user, requireKey == null ? !local : requireKey);
        }

        public static Profile local(String baseUrl, String user) {
            return new Profile(LOCAL_ID, LOCAL_NAME, baseUrl, user, false);
        }

        @JsonIgnore
        public boolean isLocal() {
            return LOCAL_ID.equals(id);
        }
    }

    public AppConfig {
        // Un config.json anterior a N-46 o a H-10 no trae los campos.
        autosave = autosave == null || autosave;
        http = http == null ? Http.DEFAULT : http;
    }

    public static final AppConfig DEFAULT = new AppConfig(20, 10_000, 30, 47600, null, true, Http.DEFAULT);

    private static final List<Integer> PAGE_SIZES = Arrays.asList(10, 20, 50, 100, 200, 500, null);

    public AppConfig validate() {
        if (!PAGE_SIZES.contains(defaultPageSize)) {
            throw invalid("El tamaño de página debe ser 10, 20, 50, 100, 200, 500 o «Sin límite»");
        }
        if (rowCap < 100 || rowCap > 100_000) {
            throw invalid("El tope de filas debe estar entre 100 y 100.000");
        }
        if (queryTimeoutSeconds < 1 || queryTimeoutSeconds > 3600) {
            throw invalid("El tiempo máximo debe estar entre 1 y 3.600 segundos");
        }
        if (port < 1024 || port > 65535) {
            throw invalid("El puerto debe estar entre 1024 y 65535");
        }
        if (autoShutdownMinutes != null && (autoShutdownMinutes < 1 || autoShutdownMinutes > 1440)) {
            throw invalid("El apagado automático debe estar entre 1 y 1.440 minutos, o desactivado");
        }
        http.validate();
        if (http.timeoutSeconds() < 1 || http.timeoutSeconds() > 3600) {
            throw invalid("El tiempo máximo de las llamadas HTTP debe estar entre 1 y 3.600 segundos");
        }
        for (String header : java.util.Arrays.asList(http.accept(), http.userAgent(), http.cacheControl())) {
            if (header != null && header.chars().anyMatch(ch -> ch < 32 || ch == 127)) {
                throw invalid("Una cabecera por defecto no puede tener saltos de línea ni caracteres de control");
            }
        }
        if (http.maxResponseMb() < 1 || http.maxResponseMb() > 100) {
            throw invalid("El tamaño máximo de respuesta debe estar entre 1 y 100 MB");
        }
        return this;
    }

    private static ApiError invalid(String message) {
        return new ApiError(400, "invalid_config", message);
    }
}
