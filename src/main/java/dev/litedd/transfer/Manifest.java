package dev.litedd.transfer;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import java.util.List;

/** manifest.json del ZIP exportado (X-02). */
@JsonIgnoreProperties(ignoreUnknown = true)
public record Manifest(int formatVersion, String appVersion, String exportedAt, List<Note> notes, List<Attachment> attachments) {

    public static final int FORMAT_VERSION = 1;

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Note(String id, String parentId, int position, String type, String title, List<String> tags,
                       boolean favorite, String createdAt, String updatedAt, String file) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Attachment(String id, String noteId, String name, String mime, String file) {
    }
}
