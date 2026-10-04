package dev.litedd.notes;

/** Versión guardada de una nota (N-44). */
public record NoteVersion(long id, String title, String content, String savedAt) {
}
