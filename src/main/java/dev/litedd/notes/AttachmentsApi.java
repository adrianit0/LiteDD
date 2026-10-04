package dev.litedd.notes;

import dev.litedd.http.ApiError;
import dev.litedd.http.ApiRoutes;
import dev.litedd.notes.AttachmentMapper.AttachmentRow;
import dev.litedd.store.Store;
import io.javalin.config.RoutesConfig;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Arrays;
import java.util.Map;
import java.util.UUID;

/** POST y GET /api/attachments (N-92). El tipo se decide por la firma del fichero (ADR-0016). */
public final class AttachmentsApi implements ApiRoutes {

    public static final int MAX_BYTES = 10 * 1024 * 1024;

    private final Store store;

    public AttachmentsApi(Store store) {
        this.store = store;
    }

    @Override
    public void register(RoutesConfig routes) {
        routes.post("/api/attachments", ctx -> {
            String noteId = ctx.queryParam("noteId");
            byte[] data = ctx.bodyAsBytes();
            if (data.length > MAX_BYTES) {
                throw new ApiError(413, "too_large", "La imagen supera el máximo de 10 MB");
            }
            String mime = detect(data);
            if (mime == null) {
                throw new ApiError(415, "unsupported_type", "Solo se admiten imágenes PNG, JPEG, GIF y WebP");
            }
            String id = UUID.randomUUID().toString();
            String name = ctx.queryParam("name");
            store.write(s -> {
                AttachmentMapper m = s.getMapper(AttachmentMapper.class);
                if (noteId == null || m.countActiveNote(noteId) == 0) {
                    throw new ApiError(404, "not_found", "La nota no existe");
                }
                m.insert(id, noteId, name, mime, data, Instant.now().truncatedTo(ChronoUnit.MILLIS).toString());
                return null;
            });
            ctx.status(201).json(Map.of("id", id, "mime", mime));
        });

        routes.get("/api/attachments/{id}", ctx -> {
            AttachmentRow row = store.read(s -> s.getMapper(AttachmentMapper.class).select(ctx.pathParam("id")));
            if (row == null) {
                throw new ApiError(404, "not_found", "La imagen no existe");
            }
            ctx.header("Cache-Control", "private, max-age=86400").contentType(row.mime()).result(row.data());
        });
    }

    /** Firma de PNG, JPEG, GIF o WebP; null si no es ninguna. */
    public static String detect(byte[] d) {
        if (starts(d, new byte[]{(byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A})) {
            return "image/png";
        }
        if (starts(d, new byte[]{(byte) 0xFF, (byte) 0xD8, (byte) 0xFF})) {
            return "image/jpeg";
        }
        if (starts(d, "GIF87a".getBytes(StandardCharsets.US_ASCII)) || starts(d, "GIF89a".getBytes(StandardCharsets.US_ASCII))) {
            return "image/gif";
        }
        if (d.length >= 12 && starts(d, "RIFF".getBytes(StandardCharsets.US_ASCII))
                && Arrays.equals(Arrays.copyOfRange(d, 8, 12), "WEBP".getBytes(StandardCharsets.US_ASCII))) {
            return "image/webp";
        }
        return null;
    }

    private static boolean starts(byte[] data, byte[] prefix) {
        return data.length >= prefix.length && Arrays.equals(Arrays.copyOf(data, prefix.length), prefix);
    }
}
