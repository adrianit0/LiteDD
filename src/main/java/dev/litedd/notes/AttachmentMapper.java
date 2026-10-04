package dev.litedd.notes;

import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

/** Tabla attachment: imágenes pegadas en las notas (N-92). */
public interface AttachmentMapper {

    record AttachmentRow(String mime, byte[] data) {
    }

    @Insert("""
            INSERT INTO attachment (id, note_id, name, mime, data, created_at)
            VALUES (#{id}, #{noteId}, #{name}, #{mime}, #{data}, #{createdAt})""")
    void insert(@Param("id") String id, @Param("noteId") String noteId, @Param("name") String name,
                @Param("mime") String mime, @Param("data") byte[] data, @Param("createdAt") String createdAt);

    @Select("SELECT mime, data FROM attachment WHERE id = #{id}")
    AttachmentRow select(@Param("id") String id);

    @Select("SELECT count(*) FROM note WHERE id = #{id} AND deleted_at IS NULL")
    int countActiveNote(@Param("id") String id);
}
