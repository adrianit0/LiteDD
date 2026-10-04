package dev.litedd.mysql;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class QueryRunnerTest {

    @Test
    void q62_binary_values_show_their_size_with_decimal_comma() {
        assertThat(QueryRunner.size(512)).isEqualTo("512 B");
        assertThat(QueryRunner.size(2355)).isEqualTo("2,3 KB");
        assertThat(QueryRunner.size(1_572_864)).isEqualTo("1,5 MB");
    }

    @Test
    void q64_cells_are_capped_at_ten_thousand_characters() {
        assertThat(QueryRunner.MAX_CELL_CHARS).isEqualTo(10_000);
    }
}
