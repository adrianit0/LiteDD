package dev.litedd.settings;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import dev.litedd.http.ApiError;

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
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record AppConfig(Integer defaultPageSize, int rowCap, int queryTimeoutSeconds, int port, Integer autoShutdownMinutes) {

    public static final AppConfig DEFAULT = new AppConfig(20, 10_000, 30, 47600, null);

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
        return this;
    }

    private static ApiError invalid(String message) {
        return new ApiError(400, "invalid_config", message);
    }
}
