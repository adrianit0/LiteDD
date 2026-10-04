package dev.litedd.notes;

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
}
