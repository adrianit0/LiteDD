package dev.litedd.httpnotes;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.litedd.http.ApiError;

import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Contenido de una nota HTTP (H-03): un JSON con todo lo de la llamada salvo la contraseña. Los campos que
 * falten toman su valor por defecto; una nota recién creada tiene el contenido vacío.
 *
 * @param method     H-13
 * @param endpoint   H-10: lo que va tras la URL base, con variables {nombre}
 * @param pathValues H-12: valores de las variables de ruta
 * @param params     H-14
 * @param headers    H-16: cabeceras propias
 * @param generated  H-15: valor cambiado o desactivación de una cabecera generada, por nombre
 * @param body       H-17
 * @param login      H-24: «always», «none» o «reuse»
 * @param user       H-22: vacío = el usuario de Ajustes
 * @param hideGenerated H-15: «Esconder headers generados»
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record HttpNoteContent(String method, String endpoint, Map<String, String> pathValues, List<Row> params,
                              List<Row> headers, Map<String, Generated> generated, Body body, String login, String user,
                              boolean hideGenerated) {

    public static final Set<String> METHODS = Set.of("GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS");
    public static final String LOGIN_ALWAYS = "always";
    public static final String LOGIN_NONE = "none";
    public static final String LOGIN_REUSE = "reuse";

    private static final ObjectMapper JSON = new ObjectMapper();

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Row(String key, String value, Boolean enabled) {
        public boolean active() {
            return enabled == null || enabled;
        }
    }

    /** value null = el valor generado; enabled false = no se envía. */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Generated(String value, Boolean enabled) {
    }

    /** mode: «none», «form-data» o «raw»; rawType: «json», «text» o «xml». */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Body(String mode, String rawType, String raw, List<Row> form) {
        public Body {
            mode = mode == null ? "none" : mode;
            rawType = rawType == null ? "json" : rawType;
            raw = raw == null ? "" : raw;
            form = form == null ? List.of() : form;
        }
    }

    public HttpNoteContent {
        method = method == null || method.isBlank() ? "GET" : method.toUpperCase(java.util.Locale.ROOT);
        endpoint = endpoint == null ? "" : endpoint.strip();
        pathValues = pathValues == null ? Map.of() : pathValues;
        params = params == null ? List.of() : params;
        headers = headers == null ? List.of() : headers;
        generated = generated == null ? Map.of() : generated;
        body = body == null ? new Body(null, null, null, null) : body;
        login = login == null ? LOGIN_ALWAYS : login;
        user = user == null ? "" : user.strip();
    }

    /** H-03: el contenido guardado de la nota; vacío da una llamada GET sin endpoint. */
    public static HttpNoteContent parse(String content) {
        if (content == null || content.isBlank()) {
            return new HttpNoteContent(null, null, null, null, null, null, null, null, null, false);
        }
        HttpNoteContent c;
        try {
            c = JSON.readValue(content, HttpNoteContent.class);
        } catch (JsonProcessingException e) {
            throw new ApiError(422, "invalid_http_note", "El contenido de la nota HTTP no es válido");
        }
        if (!METHODS.contains(c.method())) {
            throw new ApiError(422, "invalid_method", "Método no admitido: " + c.method());
        }
        if (!Set.of(LOGIN_ALWAYS, LOGIN_NONE, LOGIN_REUSE).contains(c.login())) {
            throw new ApiError(422, "invalid_http_note", "Modo de login no válido: " + c.login());
        }
        if (!Set.of("none", "form-data", "raw").contains(c.body().mode())
                || !Set.of("json", "text", "xml").contains(c.body().rawType())) {
            throw new ApiError(422, "invalid_http_note", "Tipo de cuerpo no válido");
        }
        return c;
    }
}
