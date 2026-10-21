package dev.litedd.notes;

import dev.litedd.http.ApiError;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.util.Base64;

/**
 * Contenido de una pizarra: vacío o un PNG como URL data: (B-30, ADR-0029). Se comprueban la firma y la cabecera
 * IHDR sin decodificar la imagen (B-31).
 */
public final class BoardImage {

    public static final String TYPE = "board";
    public static final String PREFIX = "data:image/png;base64,";
    /** B-22, B-31 */
    public static final int MAX_SIDE = 4096;

    private BoardImage() {
    }

    /** B-31: vacío, o un PNG de hasta 10 MB y 4096 × 4096 píxeles. */
    public static void validate(String content) {
        check(decode(content));
    }

    /** B-34: los bytes del PNG; vacío si la pizarra lo está. */
    public static byte[] decode(String content) {
        if (content.isEmpty()) {
            return new byte[0];
        }
        if (!content.startsWith(PREFIX)) {
            throw invalid("El contenido de una pizarra debe ser una imagen PNG");
        }
        String data = content.substring(PREFIX.length());
        if ((long) data.length() / 4 * 3 > AttachmentsApi.MAX_BYTES + 3L) {
            throw tooLarge();
        }
        try {
            return Base64.getDecoder().decode(data);
        } catch (IllegalArgumentException e) {
            throw invalid("La imagen de la pizarra no está bien codificada");
        }
    }

    /** B-34: contenido de la nota a partir de un .png exportado; un fichero vacío es una pizarra vacía. */
    public static String encode(byte[] png) {
        check(png);
        return png.length == 0 ? "" : PREFIX + Base64.getEncoder().encodeToString(png);
    }

    private static void check(byte[] png) {
        if (png.length == 0) {
            return;
        }
        if (png.length > AttachmentsApi.MAX_BYTES) {
            throw tooLarge();
        }
        if (!"image/png".equals(AttachmentsApi.detect(png)) || png.length < 24
                || !"IHDR".equals(new String(png, 12, 4, StandardCharsets.US_ASCII))) {
            throw invalid("La pizarra no es una imagen PNG válida");
        }
        // Enteros sin signo de 32 bits: uno enorme sale negativo.
        int width = ByteBuffer.wrap(png).getInt(16);
        int height = ByteBuffer.wrap(png).getInt(20);
        if (width < 1 || height < 1 || width > MAX_SIDE || height > MAX_SIDE) {
            throw invalid("La pizarra mide " + Integer.toUnsignedString(width) + " × " + Integer.toUnsignedString(height)
                    + " píxeles; el máximo es " + MAX_SIDE + " × " + MAX_SIDE);
        }
    }

    private static ApiError invalid(String message) {
        return new ApiError(400, "invalid_board", message);
    }

    private static ApiError tooLarge() {
        return new ApiError(413, "too_large", "La pizarra supera el máximo de 10 MB");
    }
}
