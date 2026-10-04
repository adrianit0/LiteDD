package dev.litedd.sqlengine;

import dev.litedd.sqlengine.ValueConverter.Converted;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class ValueConverterTest {

    private static Converted convert(Variable v, String raw) {
        Map<String, String> values = new HashMap<>();
        values.put(v.name(), raw);
        return ValueConverter.convert(List.of(v), values);
    }

    private static Variable var(String name, SqlType type) {
        return new Variable(name, type, null, false);
    }

    @Test
    void q21_t01_empty_is_always_null() {
        for (SqlType type : SqlType.values()) {
            Converted c = convert(new Variable("a", type, type == SqlType.LIST ? SqlType.INT : null, false), "");
            assertThat(c.errors()).isEmpty();
            assertThat(c.params()).containsEntry("a", null);
        }
    }

    @Test
    void q31_missing_values_are_null_too() {
        Converted c = ValueConverter.convert(List.of(var("a", SqlType.STRING)), Map.of());
        assertThat(c.params()).containsEntry("a", null);
    }

    @Test
    void q21_string_is_not_trimmed() {
        assertThat(convert(var("a", SqlType.STRING), "  x ").params()).containsEntry("a", "  x ");
    }

    @Test
    void t04_int_converts_or_reports_q93() {
        assertThat(convert(var("n", SqlType.INT), "12").params()).containsEntry("n", 12);
        assertThat(convert(var("n", SqlType.INT), "-3").params()).containsEntry("n", -3);
        Converted bad = convert(var("n", SqlType.INT), "abc");
        assertThat(bad.errors()).containsKey("n");
        assertThat(bad.errors().get("n")).contains("entero");
        assertThat(convert(var("n", SqlType.INT), "99999999999").errors()).containsKey("n");
    }

    @Test
    void q22_types_long_decimal_boolean_date_datetime() {
        assertThat(convert(var("a", SqlType.LONG), "99999999999").params()).containsEntry("a", 99999999999L);
        assertThat(convert(var("a", SqlType.DECIMAL), "1.50").params()).containsEntry("a", new BigDecimal("1.50"));
        assertThat(convert(var("a", SqlType.DECIMAL), "1,50").errors()).containsKey("a");
        assertThat(convert(var("a", SqlType.BOOLEAN), "true").params()).containsEntry("a", true);
        assertThat(convert(var("a", SqlType.BOOLEAN), "false").params()).containsEntry("a", false);
        assertThat(convert(var("a", SqlType.BOOLEAN), "quizá").errors()).containsKey("a");
        assertThat(convert(var("a", SqlType.DATE), "2026-10-04").params()).containsEntry("a", "2026-10-04");
        assertThat(convert(var("a", SqlType.DATE), "2026-02-30").errors()).containsKey("a");
        assertThat(convert(var("a", SqlType.DATE), "04/10/2026").errors()).containsKey("a");
        assertThat(convert(var("a", SqlType.DATETIME), "2026-10-04 10:30:00").params()).containsEntry("a", "2026-10-04 10:30:00");
        assertThat(convert(var("a", SqlType.DATETIME), "2026-10-04").errors()).containsKey("a");
    }

    @Test
    void t06_list_splits_trims_and_converts_each_element() {
        Converted c = convert(new Variable("ids", SqlType.LIST, SqlType.INT, false), "1, 2,3");
        assertThat(c.params()).containsEntry("ids", List.of(1, 2, 3));
        Converted strings = convert(new Variable("s", SqlType.LIST, SqlType.STRING, false), " a ,b");
        assertThat(strings.params()).containsEntry("s", List.of("a", "b"));
        assertThat(convert(new Variable("ids", SqlType.LIST, SqlType.INT, false), "1,x").errors()).containsKey("ids");
        assertThat(convert(new Variable("ids", SqlType.LIST, SqlType.INT, false), "1,,2").errors()).containsKey("ids");
    }
}
