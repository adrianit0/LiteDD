package dev.litedd.session;

import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

/** Tabla tab: pestañas abiertas y su estado (P-09). */
public interface SessionMapper {

    record TabRow(String id, String noteId, int position, boolean active, String mode, String state) {
    }

    /** Solo pestañas de notas activas (N-54). */
    @Select("""
            SELECT t.id, t.note_id, t.position, t.active, t.mode, t.state
            FROM tab t JOIN note n ON n.id = t.note_id AND n.deleted_at IS NULL
            ORDER BY t.position""")
    List<TabRow> selectAll();

    @Select("SELECT count(*) FROM note WHERE id = #{id} AND deleted_at IS NULL")
    int countActiveNote(@Param("id") String id);

    @Delete("DELETE FROM tab")
    void deleteAll();

    @Insert("""
            INSERT INTO tab (id, note_id, position, active, mode, state)
            VALUES (#{id}, #{noteId}, #{position}, #{active}, #{mode}, #{state})""")
    void insert(TabRow tab);
}
