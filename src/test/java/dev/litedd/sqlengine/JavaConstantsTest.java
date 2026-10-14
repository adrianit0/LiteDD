package dev.litedd.sqlengine;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Constantes Java de OGNL (M-60 a M-64, ADR-0025). */
class JavaConstantsTest {

    static final String ACTIVE = "demo.DemoConstants@STATUS_ACTIVE";
    static final String LABEL = "demo.DemoConstants@LABEL";

    static final String NOTE = """
            SELECT b.id FROM book b
            <where>
              <if test="statusId == @demo.DemoConstants@STATUS_ACTIVE">AND b.status_id = ${@demo.DemoConstants@STATUS_ACTIVE}</if>
              AND b.label = #{@demo.DemoConstants@LABEL}
              AND b.kind = '${@demo.DemoConstants@LABEL}'
            </where>""";

    private final SqlEngine engine = new SqlEngine();

    @Test
    void m60_references_are_found_but_not_static_method_calls() {
        assertThat(JavaConstants.find(NOTE)).containsExactly(ACTIVE, LABEL);
        assertThat(JavaConstants.find("<if test=\"@demo.Util@isEmpty(x)\">x</if> @@session.sql_mode a@b.com"))
                .isEmpty();
    }

    @Test
    void m60_short_name_and_valid_names() {
        assertThat(JavaConstants.shortName(ACTIVE)).isEqualTo("DemoConstants.STATUS_ACTIVE");
        assertThat(JavaConstants.isName(ACTIVE)).isTrue();
        assertThat(JavaConstants.isName("STATUS_ACTIVE")).isFalse();
        assertThat(JavaConstants.isName("a.B@C D")).isFalse();
    }

    @Test
    void m62_numbers_are_numbers_and_anything_else_is_text() {
        assertThat(JavaConstants.typed("5")).isEqualTo(5);
        assertThat(JavaConstants.typed("-12")).isEqualTo(-12);
        assertThat(JavaConstants.typed("12345678901")).isEqualTo(12345678901L);
        assertThat(JavaConstants.typed("2.50")).isEqualTo(new BigDecimal("2.50"));
        assertThat(JavaConstants.typed("05")).isEqualTo("05");
        assertThat(JavaConstants.typed("ES")).isEqualTo("ES");
    }

    @Test
    void m62_values_are_used_in_test_dollar_and_hash_tokens() {
        SqlEngine.Plan plan = engine.plan(NOTE, Map.of("statusId", "5"), Map.of(ACTIVE, "5", LABEL, "novel"));
        assertThat(plan.rendered().sql()).isEqualTo("""
                SELECT b.id FROM book b
                 WHERE  b.status_id = 5
                  AND b.label = ?
                  AND b.kind = 'novel'""");
        assertThat(plan.rendered().parameters()).singleElement().satisfies(p -> assertThat(p.value()).isEqualTo("novel"));
    }

    @Test
    void m62_number_compares_as_number_in_ognl() {
        String note = "SELECT 1 <if test=\"statusId == @demo.DemoConstants@STATUS_ACTIVE\">, 2</if>";
        assertThat(engine.plan(note, Map.of("statusId", "5"), Map.of(ACTIVE, "5")).rendered().sql().replaceAll("\\s+", " ")).isEqualTo("SELECT 1 , 2");
        assertThat(engine.plan(note, Map.of("statusId", "6"), Map.of(ACTIVE, "5")).rendered().sql()).isEqualTo("SELECT 1");
    }

    @Test
    void m63_constant_without_value_is_an_error_when_analyzing_and_planning() {
        SqlEngine.Analysis a = engine.analyze(NOTE, Map.of(ACTIVE, "5"));
        assertThat(a.errors()).singleElement().satisfies(e -> {
            assertThat(e.code()).isEqualTo("constant");
            assertThat(e.message()).isEqualTo("La constante «DemoConstants.LABEL» no tiene valor. Dale uno en «Constantes».");
        });
        assertThatThrownBy(() -> engine.plan(NOTE, Map.of(), Map.of(ACTIVE, "5")))
                .isInstanceOf(SqlException.class)
                .satisfies(e -> assertThat(((SqlException) e).errors()).extracting(SqlError::code).containsExactly("constant"));
    }

    @Test
    void m64_constants_are_not_form_variables() {
        SqlEngine.Analysis a = engine.analyze(NOTE, Map.of(ACTIVE, "5", LABEL, "novel"));
        assertThat(a.errors()).isEmpty();
        assertThat(a.variables()).extracting(Variable::name).containsExactly("statusId");
    }
}
