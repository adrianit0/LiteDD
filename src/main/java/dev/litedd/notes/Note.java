package dev.litedd.notes;

import java.util.List;

/**
 * Nota completa tal como la devuelve la API.
 *
 * @param replacedBy N-86: la nota que la sustituye, o null
 * @param lastRunAt  N-88: última ejecución correcta, o null
 * @param importantUntil N-89: importante hasta ese día (AAAA-MM-DD), o null
 */
public record Note(String id, String parentId, int position, String type, String title, String description,
                   String content,
                   boolean favorite, long version, String createdAt, String updatedAt, List<String> tags,
                   String statementId, String statementKind, boolean obsolete, String replacedBy, String lastRunAt,
                   String importantUntil) {

    /** M-20: hija generada de una nota XML, de solo lectura. */
    public boolean generated() {
        return statementId != null;
    }
}
