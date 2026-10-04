package dev.litedd.notes;

import dev.litedd.notes.NoteService.SearchHit;
import dev.litedd.notes.NoteService.TagCount;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.util.List;

/** Historial (N-44), búsqueda (N-70 a N-72), etiquetas (N-80) y favoritas (N-81). */
public interface ContentMapper {

    // --- Historial ---

    @Insert("INSERT INTO note_version (note_id, title, content, saved_at) VALUES (#{noteId}, #{title}, #{content}, #{savedAt})")
    void insertVersion(@Param("noteId") String noteId, @Param("title") String title, @Param("content") String content,
                       @Param("savedAt") String savedAt);

    @Select("SELECT id, title, content, saved_at FROM note_version WHERE note_id = #{noteId} ORDER BY id DESC LIMIT 1")
    NoteVersion selectLatestVersion(@Param("noteId") String noteId);

    @Select("SELECT id, title, content, saved_at FROM note_version WHERE note_id = #{noteId} ORDER BY id DESC")
    List<NoteVersion> selectVersions(@Param("noteId") String noteId);

    @Select("SELECT id, title, content, saved_at FROM note_version WHERE id = #{id} AND note_id = #{noteId}")
    NoteVersion selectVersion(@Param("noteId") String noteId, @Param("id") long id);

    @Delete("""
            DELETE FROM note_version WHERE note_id = #{noteId} AND id NOT IN (
                SELECT id FROM note_version WHERE note_id = #{noteId} ORDER BY id DESC LIMIT #{keep})""")
    void pruneVersions(@Param("noteId") String noteId, @Param("keep") int keep);

    // --- Búsqueda ---

    /**
     * Con match, búsqueda de texto completo con fragmento resaltado entre char(2) y char(3); sin él,
     * solo filtros, por fecha de modificación. Nunca notas de la papelera (D-04).
     */
    @Select("""
            <script>
            SELECT n.id, n.parent_id, n.type, n.title, n.favorite, n.updated_at,
            <choose>
              <when test="match != null">
                snippet(note_fts, 1, char(2), char(3), '…', 16) AS fragment,
                highlight(note_fts, 0, char(2), char(3)) AS title_marked
              </when>
              <otherwise>substr(n.content, 1, 160) AS fragment, NULL AS title_marked</otherwise>
            </choose>
            FROM note n
            <if test="match != null">JOIN note_fts ON note_fts.rowid = n.rid</if>
            WHERE n.deleted_at IS NULL
            <if test="match != null">AND note_fts MATCH #{match}</if>
            <if test="type != null">AND n.type = #{type}</if>
            <if test="favorite">AND n.favorite = 1</if>
            <if test="since != null">AND n.updated_at &gt;= #{since}</if>
            <if test="tags.size() > 0">
              AND (SELECT count(DISTINCT t.id) FROM note_tag nt JOIN tag t ON t.id = nt.tag_id
                   WHERE nt.note_id = n.id AND t.name IN
                   <foreach collection="tags" item="tag" open="(" separator="," close=")">#{tag}</foreach>) = #{tagCount}
            </if>
            ORDER BY <choose><when test="match != null">bm25(note_fts)</when><otherwise>n.updated_at DESC</otherwise></choose>
            LIMIT 200
            </script>""")
    List<SearchHit> search(@Param("match") String match, @Param("type") String type, @Param("favorite") boolean favorite,
                           @Param("since") String since, @Param("tags") List<String> tags, @Param("tagCount") int tagCount);

    // --- Etiquetas y favoritas ---

    @Insert("INSERT INTO tag (name) VALUES (#{name}) ON CONFLICT (name) DO NOTHING")
    void insertTag(@Param("name") String name);

    @Select("SELECT id FROM tag WHERE name = #{name}")
    long selectTagId(@Param("name") String name);

    @Delete("DELETE FROM note_tag WHERE note_id = #{noteId}")
    void deleteNoteTags(@Param("noteId") String noteId);

    @Insert("INSERT OR IGNORE INTO note_tag (note_id, tag_id) VALUES (#{noteId}, #{tagId})")
    void insertNoteTag(@Param("noteId") String noteId, @Param("tagId") long tagId);

    /** N-80: las etiquetas desaparecen al quedar sin notas. */
    @Delete("DELETE FROM tag WHERE id NOT IN (SELECT tag_id FROM note_tag)")
    void deleteOrphanTags();

    @Select("""
            SELECT t.name, (SELECT count(*) FROM note_tag nt JOIN note n ON n.id = nt.note_id AND n.deleted_at IS NULL
                            WHERE nt.tag_id = t.id) AS count
            FROM tag t ORDER BY t.name""")
    List<TagCount> selectTags();

    @Update("UPDATE note SET favorite = #{favorite} WHERE id = #{id} AND deleted_at IS NULL")
    int updateFavorite(@Param("id") String id, @Param("favorite") boolean favorite);
}
