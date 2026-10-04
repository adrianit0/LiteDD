package dev.litedd.sqlengine;

import dev.litedd.sqlengine.SqlRenderer.BoundParameter;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.Arrays;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/** Q-72, T-25: SQL con los valores insertados con el escapado de MySQL. */
class SqlLiteralsTest {

    private static List<BoundParameter> values(Object... v) {
        return java.util.stream.IntStream.range(0, v.length)
                .mapToObj(i -> new BoundParameter(i + 1, v[i], "x")).toList();
    }

    @Test
    void t25_string_with_quote_and_backslash_is_escaped() {
        assertThat(SqlLiterals.inline("SELECT ?", values("O'Brien \\ \"x\"\n\0\u001a")))
                .isEqualTo("SELECT 'O\\'Brien \\\\ \\\"x\\\"\\n\\0\\Z'");
    }

    @Test
    void t25_null_number_boolean_and_expanded_list() {
        assertThat(SqlLiterals.inline("SELECT ?, ?, ?, ?, ?", values(null, 12, new BigDecimal("1.50"), true, 99999999999L)))
                .isEqualTo("SELECT NULL, 12, 1.50, TRUE, 99999999999");
        assertThat(SqlLiterals.inline("WHERE id IN ( ? , ? , ? )", values(Arrays.asList(1, 2, 3).toArray())))
                .isEqualTo("WHERE id IN ( 1 , 2 , 3 )");
    }

    @Test
    void question_marks_in_strings_and_comments_are_left_alone() {
        assertThat(SqlLiterals.inline("SELECT '?', ? -- ¿?\n", values("a"))).isEqualTo("SELECT '?', 'a' -- ¿?\n");
    }
}
