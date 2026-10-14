package dev.litedd.notes;

import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

/** Acceso a la tabla java_constant (M-61, ADR-0025). */
public interface JavaConstantMapper {

    record ConstantRow(String name, String value) {
    }

    @Select("SELECT name, value FROM java_constant ORDER BY name")
    List<ConstantRow> selectAll();

    @Insert("""
            INSERT INTO java_constant (name, value, updated_at) VALUES (#{name}, #{value}, #{now})
            ON CONFLICT (name) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at""")
    void upsert(@Param("name") String name, @Param("value") String value, @Param("now") String now);

    /** M-68: «Añadir como rama» no cambia los valores que ya hay. */
    @Insert("INSERT INTO java_constant (name, value, updated_at) VALUES (#{name}, #{value}, #{now}) ON CONFLICT (name) DO NOTHING")
    void insertMissing(@Param("name") String name, @Param("value") String value, @Param("now") String now);

    @Delete("DELETE FROM java_constant WHERE name = #{name}")
    void delete(@Param("name") String name);

    @Delete("DELETE FROM java_constant")
    void deleteAll();

    /** M-61: contenido de las notas donde pueden aparecer constantes. */
    @Select("SELECT content FROM note WHERE deleted_at IS NULL AND type IN ('sql', 'xml')")
    List<String> selectSqlContents();
}
