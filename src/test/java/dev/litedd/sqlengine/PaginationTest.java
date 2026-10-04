package dev.litedd.sqlengine;

import dev.litedd.sqlengine.Pagination.Page;
import dev.litedd.sqlengine.Pagination.PageRequest;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class PaginationTest {

    private static final int CAP = 10_000;

    @Test
    void t19_q51_q52_first_page_asks_for_one_extra_row() {
        assertThat(Pagination.pageSql("SELECT id, title FROM book", new PageRequest(1, 20, null, false), CAP))
                .isEqualTo("SELECT id, title FROM book\nLIMIT 21 OFFSET 0");
    }

    @Test
    void t19_q51_sort_by_column_position_before_limit() {
        assertThat(Pagination.pageSql("SELECT id, title FROM book", new PageRequest(1, 20, 2, true), CAP))
                .isEqualTo("SELECT id, title FROM book\nORDER BY 2 DESC LIMIT 21 OFFSET 0");
        assertThat(Pagination.pageSql("SELECT id FROM book", new PageRequest(3, 50, 1, false), CAP))
                .isEqualTo("SELECT id FROM book\nORDER BY 1 ASC LIMIT 51 OFFSET 100");
    }

    @Test
    void t20_q57_note_ending_in_order_by_only_gets_limit() {
        assertThat(Pagination.pageSql("SELECT id FROM book ORDER BY title", new PageRequest(2, 10, null, false), CAP))
                .isEqualTo("SELECT id FROM book ORDER BY title\nLIMIT 11 OFFSET 10");
    }

    @Test
    void t20_q57_order_by_in_note_plus_table_sort_is_wrapped() {
        assertThat(Pagination.pageSql("SELECT id FROM book ORDER BY title", new PageRequest(1, 10, 1, false), CAP))
                .isEqualTo("SELECT * FROM (\nSELECT id FROM book ORDER BY title\n) AS litedd_page\nORDER BY 1 ASC LIMIT 11 OFFSET 0");
    }

    @Test
    void t20_q57_note_with_its_own_limit_is_wrapped() {
        assertThat(Pagination.pageSql("SELECT id FROM book LIMIT 5", new PageRequest(1, 20, null, false), CAP))
                .isEqualTo("SELECT * FROM (\nSELECT id FROM book LIMIT 5\n) AS litedd_page\nLIMIT 21 OFFSET 0");
    }

    @Test
    void t21_order_by_or_limit_in_subquery_or_string_do_not_count() {
        String sub = "SELECT * FROM (SELECT id FROM book ORDER BY id LIMIT 3) b";
        assertThat(Pagination.pageSql(sub, new PageRequest(1, 20, null, false), CAP)).isEqualTo(sub + "\nLIMIT 21 OFFSET 0");
        String str = "SELECT 'ORDER BY x LIMIT 2' AS t";
        assertThat(Pagination.pageSql(str, new PageRequest(1, 20, null, false), CAP)).isEqualTo(str + "\nLIMIT 21 OFFSET 0");
        String window = "SELECT id, ROW_NUMBER() OVER (ORDER BY id) FROM book";
        assertThat(Pagination.pageSql(window, new PageRequest(1, 20, null, false), CAP)).isEqualTo(window + "\nLIMIT 21 OFFSET 0");
    }

    @Test
    void q51_suffix_goes_on_a_new_line_after_a_trailing_comment() {
        assertThat(Pagination.pageSql("SELECT 1 -- fin", new PageRequest(1, 20, null, false), CAP))
                .isEqualTo("SELECT 1 -- fin\nLIMIT 21 OFFSET 0");
    }

    @Test
    void q55_unlimited_uses_cap_plus_one() {
        assertThat(Pagination.pageSql("SELECT id FROM book", new PageRequest(1, null, null, false), CAP))
                .isEqualTo("SELECT id FROM book\nLIMIT 10001 OFFSET 0");
    }

    @Test
    void q54_count_wraps_the_query() {
        assertThat(Pagination.countSql("SELECT id FROM book"))
                .isEqualTo("SELECT COUNT(*) FROM (\nSELECT id FROM book\n) AS litedd_count");
    }

    @Test
    void t23_q52_extra_row_means_next_page() {
        Page page = Pagination.assemble(rows(21), new PageRequest(1, 20, null, false), CAP, false);
        assertThat(page.rows()).hasSize(20);
        assertThat(page.hasMore()).isTrue();
        assertThat(page.total()).isNull();
    }

    @Test
    void t23_q53_page_not_full_knows_the_total() {
        Page page = Pagination.assemble(rows(5), new PageRequest(1, 20, null, false), CAP, false);
        assertThat(page.hasMore()).isFalse();
        assertThat(page.total()).isEqualTo(5L);
        Page third = Pagination.assemble(rows(7), new PageRequest(3, 20, null, false), CAP, false);
        assertThat(third.total()).isEqualTo(47L);
    }

    @Test
    void t24_q55_unlimited_over_cap_shows_cap_and_flags_it() {
        Page page = Pagination.assemble(rows(CAP + 1), new PageRequest(1, null, null, false), CAP, false);
        assertThat(page.rows()).hasSize(CAP);
        assertThat(page.capReached()).isTrue();
        assertThat(page.total()).isNull();
        Page under = Pagination.assemble(rows(10), new PageRequest(1, null, null, false), CAP, false);
        assertThat(under.capReached()).isFalse();
        assertThat(under.total()).isEqualTo(10L);
    }

    @Test
    void q44_meta_statements_only_apply_the_cap() {
        Page page = Pagination.assemble(rows(CAP + 1), new PageRequest(1, 20, null, false), CAP, true);
        assertThat(page.rows()).hasSize(CAP);
        assertThat(page.capReached()).isTrue();
        assertThat(page.hasMore()).isFalse();
    }

    private static List<List<String>> rows(int n) {
        List<List<String>> out = new ArrayList<>();
        for (int i = 0; i < n; i++) {
            out.add(List.of(String.valueOf(i)));
        }
        return out;
    }
}
