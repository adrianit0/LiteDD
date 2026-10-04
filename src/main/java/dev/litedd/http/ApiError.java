package dev.litedd.http;

/**
 * Error de la API con el cuerpo {"code", "message", "details"} (A-02).
 * El mensaje va en español y es apto para mostrarse.
 */
public class ApiError extends RuntimeException {

    private final int status;
    private final String code;
    private final Object details;

    public ApiError(int status, String code, String message) {
        this(status, code, message, null);
    }

    public ApiError(int status, String code, String message, Object details) {
        super(message);
        this.status = status;
        this.code = code;
        this.details = details;
    }

    public static ApiError forbidden(String message) {
        return new ApiError(403, "forbidden", message);
    }

    public int status() {
        return status;
    }

    public Body body() {
        return new Body(code, getMessage(), details);
    }

    public record Body(String code, String message, Object details) {
    }
}
