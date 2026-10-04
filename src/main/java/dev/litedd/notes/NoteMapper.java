package dev.litedd.notes;

import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.util.List;

/** Acceso a la tabla note (D-06). Solo notas activas, salvo que se indique (D-04). */
public interface NoteMapper {

    record TreeRow(String id, String parentId, int position, String type, String title, boolean favorite,
                   String tags) {
    }

    record NoteRow(String id, String parentId, int position, String type, String title, String content,
                   boolean favorite, long version, String createdAt, String updatedAt) {
    }

    String TAG_SEPARATOR = "\u001f";

    @Select("""
            SELECT n.id, n.parent_id, n.position, n.type, n.title, n.favorite,
                   (SELECT group_concat(name, char(31)) FROM (
                       SELECT t.name FROM note_tag nt JOIN tag t ON t.id = nt.tag_id
                       WHERE nt.note_id = n.id ORDER BY t.name)) AS tags
            FROM note n
            WHERE n.deleted_at IS NULL
            ORDER BY n.parent_id, n.position""")
    List<TreeRow> selectTree();

    @Select("""
            SELECT id, parent_id, position, type, title, content, favorite, version, created_at, updated_at
            FROM note WHERE id = #{id} AND deleted_at IS NULL""")
    NoteRow selectActive(@Param("id") String id);

    @Select("""
            SELECT t.name FROM note_tag nt JOIN tag t ON t.id = nt.tag_id
            WHERE nt.note_id = #{id} ORDER BY t.name""")
    List<String> selectTags(@Param("id") String id);

    @Select("SELECT count(*) FROM note WHERE parent_id IS #{parentId} AND deleted_at IS NULL")
    int countChildren(@Param("parentId") String parentId);

    @Insert("""
            INSERT INTO note (id, parent_id, position, type, title, content, favorite, version, created_at, updated_at)
            VALUES (#{id}, #{parentId}, #{position}, #{type}, #{title}, #{content}, #{favorite}, #{version},
                    #{createdAt}, #{updatedAt})""")
    void insert(NoteRow note);

    @Update("""
            UPDATE note SET title = #{title}, content = #{content}, version = version + 1, updated_at = #{now}
            WHERE id = #{id} AND version = #{baseVersion} AND deleted_at IS NULL""")
    int updateContent(@Param("id") String id, @Param("title") String title, @Param("content") String content,
                      @Param("baseVersion") long baseVersion, @Param("now") String now);

    @Select("SELECT id FROM note WHERE parent_id IS #{parentId} AND deleted_at IS NULL ORDER BY position, rid")
    List<String> selectChildIds(@Param("parentId") String parentId);

    /** D-05: ¿está noteId en la cadena de antepasados de target, incluido el propio target? */
    @Select("""
            WITH RECURSIVE up(id, parent_id) AS (
                SELECT id, parent_id FROM note WHERE id = #{target}
                UNION ALL
                SELECT n.id, n.parent_id FROM note n JOIN up ON n.id = up.parent_id)
            SELECT count(*) FROM up WHERE id = #{noteId}""")
    int countInAncestry(@Param("noteId") String noteId, @Param("target") String target);

    @Update("UPDATE note SET parent_id = #{parentId}, position = #{position} WHERE id = #{id}")
    void place(@Param("id") String id, @Param("parentId") String parentId, @Param("position") int position);

    @Update("UPDATE note SET position = #{position} WHERE id = #{id}")
    void setPosition(@Param("id") String id, @Param("position") int position);

    @Update("UPDATE note SET deleted_at = #{now} WHERE id = #{id} AND deleted_at IS NULL")
    int markDeleted(@Param("id") String id, @Param("now") String now);

    @Update("UPDATE note SET deleted_at = NULL, parent_id = #{parentId}, position = #{position} WHERE id = #{id}")
    void markRestored(@Param("id") String id, @Param("parentId") String parentId, @Param("position") int position);

    @Select("""
            SELECT id, parent_id, type, title, deleted_at FROM note
            WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC, title""")
    List<TrashItem> selectTrash();

    @Select("SELECT parent_id FROM note WHERE id = #{id} AND deleted_at IS NOT NULL")
    String selectTrashedParent(@Param("id") String id);

    @Select("SELECT count(*) FROM note WHERE id = #{id} AND deleted_at IS NOT NULL")
    int countTrashed(@Param("id") String id);

    /** ADR-0010: las notas de la papelera que la tenían como madre pasan a la raíz. */
    @Update("UPDATE note SET parent_id = NULL WHERE parent_id = #{id} AND deleted_at IS NOT NULL")
    void detachTrashedChildren(@Param("id") String id);

    @Delete("DELETE FROM note WHERE id = #{id} AND deleted_at IS NOT NULL")
    int deleteTrashed(@Param("id") String id);

    @Update("""
            UPDATE note SET parent_id = NULL
            WHERE deleted_at IS NOT NULL
              AND parent_id IN (SELECT id FROM note WHERE deleted_at IS NOT NULL)""")
    void detachAllTrashedChildren();

    @Delete("DELETE FROM note WHERE deleted_at IS NOT NULL")
    int deleteAllTrashed();

    @Delete("DELETE FROM tab WHERE note_id = #{id}")
    void deleteTabs(@Param("id") String id);

    @Delete("DELETE FROM attachment WHERE note_id IS NULL")
    int deleteOrphanAttachments();
}
