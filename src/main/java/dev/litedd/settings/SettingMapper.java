package dev.litedd.settings;

import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

/** Tabla setting: estado de interfaz en JSON (ADR-0005). */
public interface SettingMapper {

    record SettingRow(String key, String value) {
    }

    @Select("SELECT key, value FROM setting ORDER BY key")
    List<SettingRow> selectAll();

    @Insert("""
            INSERT INTO setting (key, value) VALUES (#{key}, #{value})
            ON CONFLICT (key) DO UPDATE SET value = excluded.value""")
    void upsert(@Param("key") String key, @Param("value") String value);
}
