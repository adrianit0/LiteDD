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
    void q102_a_column_keeps_its_origin_only_if_it_comes_from_a_table_of_the_connection_schema() {
        // b.author_id AS autor: Connector/J da la tabla y la columna originales.
        QueryRunner.Column aliased = QueryRunner.column("autor", "INT", true, "litedd_demo", "litedd_demo", "book", "author_id");
        assertThat(aliased).isEqualTo(new QueryRunner.Column("autor", "INT", true, "book", "author_id"));
        // Sin distinguir mayúsculas en el esquema.
        assertThat(QueryRunner.column("id", "INT", true, "litedd_demo", "LITEDD_DEMO", "book", "id").table()).isEqualTo("book");
        // Una expresión no tiene tabla; una columna de otro esquema no cuenta.
        QueryRunner.Column expression = QueryRunner.column("n", "BIGINT", true, "litedd_demo", "", "", "n");
        assertThat(expression.table()).isNull();
        assertThat(expression.column()).isNull();
        assertThat(QueryRunner.column("id", "INT", true, "litedd_demo", "otro", "book", "id").table()).isNull();
        assertThat(QueryRunner.column("id", "INT", true, null, "litedd_demo", "book", "id").table()).isNull();
    }

    @Test
    void q64_cells_are_capped_at_ten_thousand_characters() {
        assertThat(QueryRunner.MAX_CELL_CHARS).isEqualTo(10_000);
    }
}
