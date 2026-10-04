package dev.litedd.transfer;

import dev.litedd.notes.AttachmentMapper;
import dev.litedd.notes.AttachmentMapper.AttachmentRow;
import dev.litedd.store.Store;

import java.time.Clock;
import java.time.temporal.ChronoUnit;
import java.util.UUID;

/** Acceso directo a adjuntos para preparar y comprobar importaciones. */
final class Attachments {

    private Attachments() {
    }

    static String insert(Store store, String noteId, String name, String mime, byte[] data, Clock clock) {
        String id = UUID.randomUUID().toString();
        store.write(s -> {
            s.getMapper(AttachmentMapper.class).insert(id, noteId, name, mime, data,
                    clock.instant().truncatedTo(ChronoUnit.MILLIS).toString());
            return null;
        });
        return id;
    }

    static byte[] load(Store store, String id) {
        AttachmentRow row = store.read(s -> s.getMapper(AttachmentMapper.class).select(id));
        return row == null ? null : row.data();
    }
}
