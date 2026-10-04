package dev.litedd.sqlengine;

import dev.litedd.sqlengine.SqlRenderer.BoundParameter;
import dev.litedd.sqlengine.SqlRenderer.RenderedSql;
import org.apache.ibatis.mapping.BoundSql;
import org.apache.ibatis.scripting.xmltags.XMLLanguageDriver;
import org.apache.ibatis.session.Configuration;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Renderizado con MyBatis (Q-30 a Q-33) y casos T-01 a T-10. */
class SqlRendererTest {

    private final SqlRenderer renderer = new SqlRenderer();

    private static Map<String, Object> params(Object... kv) {
        Map<String, Object> m = new HashMap<>();
        for (int i = 0; i < kv.length; i += 2) {
            m.put((String) kv[i], kv[i + 1]);
        }
        return m;
    }

    private static String squash(String sql) {
        return sql.replaceAll("\\s+", " ").strip();
    }

    @Test
    void t01_q31_empty_field_binds_null() {
        RenderedSql r = renderer.render("SELECT * FROM book WHERE title = #{a}", params("a", null));
        assertThat(r.parameters()).singleElement().satisfies(p -> assertThat(p.value()).isNull());
    }

    @Test
    void t02_if_omits_or_includes_fragment() {
        String body = "SELECT * FROM book WHERE 1 = 1 <if test=\"a != null\">AND title = #{a}</if>";
        assertThat(squash(renderer.render(body, params("a", null)).sql())).isEqualTo("SELECT * FROM book WHERE 1 = 1");
        RenderedSql with = renderer.render(body, params("a", "mar"));
        assertThat(squash(with.sql())).isEqualTo("SELECT * FROM book WHERE 1 = 1 AND title = ?");
        assertThat(with.parameters()).extracting(BoundParameter::value).containsExactly("mar");
    }

    @Test
    void t03_where_drops_itself_or_the_leading_and() {
        String body = "SELECT * FROM book <where><if test=\"a != null\">AND a = #{a}</if><if test=\"b != null\">AND b = #{b}</if></where>";
        assertThat(squash(renderer.render(body, params("a", null, "b", null)).sql())).isEqualTo("SELECT * FROM book");
        assertThat(squash(renderer.render(body, params("a", null, "b", 2)).sql())).isEqualTo("SELECT * FROM book WHERE b = ?");
    }

    @Test
    void t06_foreach_expands_list_parameters() {
        String body = "SELECT * FROM author WHERE 1 = 1 <if test=\"ids != null\">AND id IN "
                + "<foreach collection=\"ids\" item=\"id\" open=\"(\" separator=\",\" close=\")\">#{id}</foreach></if>";
        RenderedSql r = renderer.render(body, params("ids", List.of(1, 2, 3)));
        assertThat(squash(r.sql())).isEqualTo("SELECT * FROM author WHERE 1 = 1 AND id IN ( ? , ? , ? )");
        assertThat(r.parameters()).extracting(BoundParameter::value).containsExactly(1, 2, 3);
        assertThat(r.parameters()).extracting(BoundParameter::index).containsExactly(1, 2, 3);
        assertThat(r.parameters()).extracting(BoundParameter::type).containsOnly("int");
        assertThat(squash(renderer.render(body, params("ids", null)).sql())).isEqualTo("SELECT * FROM author WHERE 1 = 1");
    }

    @Test
    void t09_q17_dollar_is_textual_substitution() {
        RenderedSql r = renderer.render("SELECT * FROM book ORDER BY ${col}", params("col", "title"));
        assertThat(squash(r.sql())).isEqualTo("SELECT * FROM book ORDER BY title");
        assertThat(r.parameters()).isEmpty();
    }

    @Test
    void t10_q30_choose_otherwise_trim_and_bind_match_mybatis() {
        String body = """
                <bind name="pattern" value="term == null ? null : '%' + term + '%'"/>
                SELECT * FROM book
                <trim prefix="WHERE" prefixOverrides="AND |OR ">
                  <choose>
                    <when test="term != null">AND title LIKE #{pattern}</when>
                    <otherwise>AND year &gt; #{year}</otherwise>
                  </choose>
                </trim>""";
        for (Map<String, Object> p : List.of(params("term", "mar", "year", null), params("term", null, "year", 1990))) {
            RenderedSql ours = renderer.render(body, p);
            BoundSql theirs = mybatis(body, p);
            assertThat(ours.sql()).isEqualTo(theirs.getSql());
            assertThat(ours.parameters()).hasSize(theirs.getParameterMappings().size());
        }
        assertThat(renderer.render(body, params("term", "mar", "year", null)).parameters())
                .extracting(BoundParameter::value).containsExactly("%mar%");
    }

    @Test
    void q91_invalid_test_expression_reports_expression_and_ognl_error() {
        assertThatThrownBy(() -> renderer.render("SELECT 1 <if test=\"a ==== b\">x</if>", params("a", 1, "b", 2)))
                .isInstanceOfSatisfying(SqlException.class, e -> {
                    assertThat(e.errors().getFirst().code()).isEqualTo("ognl");
                    assertThat(e.getMessage()).contains("a ==== b");
                });
    }

    @Test
    void q33_sql_sources_are_cached_by_content() {
        renderer.render("SELECT #{a}", params("a", 1));
        renderer.render("SELECT #{a}", params("a", 2));
        renderer.render("SELECT #{b}", params("b", 2));
        assertThat(renderer.cacheSize()).isEqualTo(2);
    }

    @Test
    void parameter_types_follow_values() {
        RenderedSql r = renderer.render("SELECT #{a}, #{b}, #{c}, #{d}, #{e}",
                params("a", "x", "b", 1L, "c", new BigDecimal("1.5"), "d", true, "e", null));
        assertThat(r.parameters()).extracting(BoundParameter::type).containsExactly("string", "long", "decimal", "boolean", "null");
    }

    private static BoundSql mybatis(String body, Map<String, Object> p) {
        Configuration cfg = new Configuration();
        return new XMLLanguageDriver().createSqlSource(cfg, "<script>" + body + "</script>", Map.class).getBoundSql(p);
    }
}
