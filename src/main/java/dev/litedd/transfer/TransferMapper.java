package dev.litedd.transfer;

import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Select;

import java.util.List;

/** Lecturas para exportar y borrados para «Reemplazar todo» (X-02 a X-05). */
public interface TransferMapper {

    record ExportNote(String id, String parentId, int position, String type, String title, String description, String content,
                      boolean favorite, String createdAt, String updatedAt) {
    }

    record NoteTagRow(String noteId, String name) {
    }

    record ExportAttachment(String id, String noteId, String name, String mime, byte[] data) {
    }

    @Select("""
            SELECT id, parent_id, position, type, title, description, content, favorite, created_at, updated_at
            FROM note WHERE deleted_at IS NULL ORDER BY parent_id, position""")
    List<ExportNote> selectActiveNotes();

    @Select("""
            SELECT nt.note_id, t.name FROM note_tag nt
            JOIN tag t ON t.id = nt.tag_id
            JOIN note n ON n.id = nt.note_id AND n.deleted_at IS NULL
            ORDER BY t.name""")
    List<NoteTagRow> selectActiveTags();

    @Select("""
            SELECT a.id, a.note_id, a.name, a.mime, a.data FROM attachment a
            JOIN note n ON n.id = a.note_id AND n.deleted_at IS NULL
            ORDER BY a.created_at, a.id""")
    List<ExportAttachment> selectActiveAttachments();

    @Delete("DELETE FROM note_version")
    void deleteVersions();

    @Delete("DELETE FROM variable_value")
    void deleteVariableValues();

    @Delete("DELETE FROM tab")
    void deleteTabs();

    @Delete("DELETE FROM note_tag")
    void deleteNoteTags();

    @Delete("DELETE FROM tag")
    void deleteTags();

    @Delete("DELETE FROM attachment")
    void deleteAttachments();

    @Delete("DELETE FROM note")
    void deleteNotes();
}
