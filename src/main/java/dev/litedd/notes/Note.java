package dev.litedd.notes;

import java.util.List;

/** Nota completa tal como la devuelve la API. */
public record Note(String id, String parentId, int position, String type, String title, String description,
                   String content,
                   boolean favorite, long version, String createdAt, String updatedAt, List<String> tags,
                   String statementId, String statementKind) {

    /** M-20: hija generada de una nota XML, de solo lectura. */
    public boolean generated() {
        return statementId != null;
    }
}
