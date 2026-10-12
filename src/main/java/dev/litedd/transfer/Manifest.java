package dev.litedd.transfer;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.List;

/** manifest.json del ZIP exportado (X-02). */
@JsonIgnoreProperties(ignoreUnknown = true)
public record Manifest(int formatVersion, String appVersion, String exportedAt, List<Note> notes, List<Attachment> attachments) {

    public static final int FORMAT_VERSION = 1;

    /**
     * description (N-07) falta en los archivos anteriores; se importa como vacía. statementId y statementKind solo
     * aparecen en las hijas de una nota XML MyBatis (M-50).
     */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Note(String id, String parentId, int position, String type, String title, String description, List<String> tags,
                       boolean favorite, String createdAt, String updatedAt, String file,
                       @JsonInclude(JsonInclude.Include.NON_NULL) String statementId,
                       @JsonInclude(JsonInclude.Include.NON_NULL) String statementKind) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Attachment(String id, String noteId, String name, String mime, String file) {
    }
}
