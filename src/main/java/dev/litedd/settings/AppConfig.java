package dev.litedd.settings;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import dev.litedd.http.ApiError;
import dev.litedd.httpnotes.LocalUrls;

import java.util.Arrays;
import java.util.List;

/**
 * Ajustes de la pantalla «Ajustes» (U-10), guardados en config.json (ADR-0005, ADR-0017).
 *
 * @param defaultPageSize     Q-50: 10, 20, 50, 100, 200, 500 o null («Sin límite»)
 * @param rowCap              Q-55: tope de filas
 * @param queryTimeoutSeconds S-05, Q-43: tiempo máximo por consulta
 * @param port                puerto local; se aplica al siguiente arranque
 * @param autoShutdownMinutes apagado tras N minutos sin ventanas y sin despedida; null desactivado
 * @param autosave            N-40: guardado automático; false, guardado manual (N-46). Si falta, true
 * @param http                notas HTTP (H-10, H-20, H-22, H-31, H-35). Si falta, los valores por defecto
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record AppConfig(Integer defaultPageSize, int rowCap, int queryTimeoutSeconds, int port, Integer autoShutdownMinutes,
                        Boolean autosave, Http http) {

    /**
     * Ajustes de las notas HTTP. La contraseña no está aquí: va a http.json (H-21).
     *
     * @param baseUrl            H-10: solo 127.0.0.1, localhost o ::1 (H-40); null sin configurar
     * @param loginNoteId        H-20: nota HTTP de login; null sin elegir
     * @param user               H-22: usuario por defecto
     * @param timeoutSeconds     H-31
     * @param maxResponseMb      H-35
     */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Http(String baseUrl, String loginNoteId, String user, Integer timeoutSeconds, Integer maxResponseMb) {

        public static final Http DEFAULT = new Http(null, null, "", 30, 10);

        public Http {
            baseUrl = baseUrl == null || baseUrl.isBlank() ? null : baseUrl.strip();
            loginNoteId = loginNoteId == null || loginNoteId.isBlank() ? null : loginNoteId;
            user = user == null ? "" : user.strip();
            timeoutSeconds = timeoutSeconds == null ? 30 : timeoutSeconds;
            maxResponseMb = maxResponseMb == null ? 10 : maxResponseMb;
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
        if (http.baseUrl() != null) {
            try {
                LocalUrls.validateBase(http.baseUrl());
            } catch (ApiError e) {
                throw invalid(e.getMessage());
            }
        }
        if (http.timeoutSeconds() < 1 || http.timeoutSeconds() > 3600) {
            throw invalid("El tiempo máximo de las llamadas HTTP debe estar entre 1 y 3.600 segundos");
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
