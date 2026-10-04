package dev.litedd.notes;

import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

/** Tabla variable_value: últimos valores ejecutados por nota SQL (Q-24, ADR-0014). */
public interface VariableValueMapper {

    record ValueRow(String name, String value) {
    }

    @Select("SELECT name, value FROM variable_value WHERE note_id = #{noteId} ORDER BY name")
    List<ValueRow> selectByNote(@Param("noteId") String noteId);

    @Delete("DELETE FROM variable_value WHERE note_id = #{noteId}")
    void deleteByNote(@Param("noteId") String noteId);

    @Insert("INSERT INTO variable_value (note_id, name, value) VALUES (#{noteId}, #{name}, #{value})")
    void insert(@Param("noteId") String noteId, @Param("name") String name, @Param("value") String value);
}
