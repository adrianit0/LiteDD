package dev.litedd.notes;

/** Nota en la papelera (N-52). */
public record TrashItem(String id, String parentId, String type, String title, String deletedAt) {
}
