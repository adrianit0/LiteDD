package dev.litedd.sqlengine;

import dev.litedd.sqlengine.NoteSource.PreparedNote;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/** Formato de la nota (Q-01 a Q-06) y variables (Q-10 a Q-17). */
class NoteSourceTest {

    private static final String DEMO = """
            SELECT b.id, b.title, a.name AS author
            FROM book b
            JOIN author a ON a.id = b.author_id
            <where>
              <if test="title != null">
                AND b.title LIKE CONCAT('%', #{title}, '%')
              </if>
              <if test="minYear != null">
                AND b.year >= #{minYear,int}
              </if>
              <if test="authorIds != null">
                AND a.id IN
                <foreach collection="authorIds" item="id" open="(" separator="," close=")">
                  #{id}
                </foreach>
              </if>
            </where>""";

    private static List<String> describe(PreparedNote p) {
        return p.variables().stream()
                .map(v -> v.name() + ":" + v.type().label() + (v.elementType() != null ? "<" + v.elementType().label() + ">" : "")
                        + (v.textual() ? "$" : ""))
                .toList();
    }

    @Test
    void q10_q13_q14_demo_note_has_three_fields_in_order() {
        PreparedNote p = NoteSource.prepare(DEMO);
        assertThat(p.errors()).isEmpty();
        assertThat(describe(p)).containsExactly("title:string", "minYear:int", "authorIds:list<string>");
    }

    @Test
    void q12_types_are_removed_before_mybatis() {
        PreparedNote p = NoteSource.prepare("SELECT #{a,int}, #{b, javaType=long}, #{c,jdbcType=VARCHAR}");
        assertThat(p.body()).isEqualTo("SELECT #{a}, #{b}, #{c}");
        assertThat(describe(p)).containsExactly("a:int", "b:long", "c:string");
    }

    @Test
    void t05_native_javatype_form_is_equivalent() {
        assertThat(describe(NoteSource.prepare("SELECT #{n, javaType=int}"))).containsExactly("n:int");
        assertThat(describe(NoteSource.prepare("SELECT #{n,javaType=java.lang.Integer}"))).containsExactly("n:int");
        assertThat(describe(NoteSource.prepare("SELECT #{n,javaType=BigDecimal}"))).containsExactly("n:decimal");
    }

    @Test
    void q14_item_type_converts_list_elements() {
        PreparedNote p = NoteSource.prepare("""
                SELECT 1 WHERE id IN <foreach collection="ids" item="x" index="i" open="(" separator="," close=")">#{x,long}</foreach>""");
        assertThat(describe(p)).containsExactly("ids:list<long>");
    }

    @Test
    void q10_q11_names_from_test_bind_and_paths_without_locals_or_ognl_words() {
        PreparedNote p = NoteSource.prepare("""
                <bind name="pattern" value="'%' + term + '%'"/>
                SELECT 1
                <if test="user.name != null and user.name.length() > 0 and active == true and _parameter != null">
                  AND name LIKE #{pattern} AND x = #{list[0]} AND y IN (#{other.prop})
                </if>
                <if test="limit gt 3 or flag neq 'a' and not done eq null">AND 1</if>""");
        assertThat(p.errors()).isEmpty();
        assertThat(p.variables()).extracting(Variable::name)
                .containsExactly("term", "user", "active", "list", "other", "limit", "flag", "done");
    }

    @Test
    void q15_t07_variable_only_in_test_typed_with_xml_comment() {
        PreparedNote p = NoteSource.prepare("""
                <!-- #{onlyActive,boolean} -->
                SELECT * FROM author <where><if test="onlyActive">AND active = 1</if></where>""");
        assertThat(describe(p)).containsExactly("onlyActive:boolean");
    }

    @Test
    void adr0011_comment_alone_does_not_create_a_field() {
        assertThat(NoteSource.prepare("<!-- #{ghost,int} --> SELECT 1").variables()).isEmpty();
    }

    @Test
    void q16_t08_contradictory_types_are_an_error() {
        PreparedNote p = NoteSource.prepare("SELECT #{n,int}, #{n,long}");
        assertThat(p.errors()).singleElement().satisfies(e -> {
            assertThat(e.code()).isEqualTo("type");
            assertThat(e.variable()).isEqualTo("n");
            assertThat(e.message()).contains("int").contains("long");
        });
    }

    @Test
    void q16_declared_type_wins_over_undeclared() {
        assertThat(describe(NoteSource.prepare("SELECT #{n}, #{n,int}"))).containsExactly("n:int");
    }

    @Test
    void q92_unknown_type_is_an_error() {
        assertThat(NoteSource.prepare("SELECT #{n,entero}").errors()).singleElement()
                .satisfies(e -> assertThat(e.message()).contains("entero"));
    }

    @Test
    void q17_t09_dollar_is_textual_string() {
        PreparedNote p = NoteSource.prepare("SELECT * FROM book ORDER BY ${col}");
        assertThat(describe(p)).containsExactly("col:string$");
        assertThat(NoteSource.prepare("SELECT ${col,int}").errors()).isNotEmpty();
    }

    @Test
    void q02_t12_wrapping_select_uses_its_body() {
        PreparedNote p = NoteSource.prepare("<select id=\"x\" resultType=\"map\">\n  SELECT #{a}\n</select>");
        assertThat(p.errors()).isEmpty();
        assertThat(p.body().strip()).isEqualTo("SELECT #{a}");
        for (String tag : List.of("insert", "update", "delete")) {
            assertThat(NoteSource.prepare("<" + tag + ">SELECT 1</" + tag + ">").errors()).isEmpty();
        }
    }

    @Test
    void q02_t12_two_wrappers_or_text_outside_is_an_error() {
        assertThat(NoteSource.prepare("<select>SELECT 1</select><select>SELECT 2</select>").errors())
                .singleElement().satisfies(e -> assertThat(e.code()).isEqualTo("wrapper"));
        assertThat(NoteSource.prepare("SELECT 0 <select>SELECT 1</select>").errors())
                .singleElement().satisfies(e -> assertThat(e.code()).isEqualTo("wrapper"));
    }

    @Test
    void q03_t13_include_is_not_supported() {
        assertThat(NoteSource.prepare("SELECT <include refid=\"x\"/>").errors()).singleElement().satisfies(e -> {
            assertThat(e.code()).isEqualTo("include");
            assertThat(e.message()).contains("no admitido en esta versión");
        });
    }

    @Test
    void q04_t11_unescaped_less_than_is_an_xml_error_with_line_and_column() {
        PreparedNote p = NoteSource.prepare("SELECT 1\nWHERE a < 3");
        assertThat(p.errors()).singleElement().satisfies(e -> {
            assertThat(e.code()).isEqualTo("xml");
            assertThat(e.line()).isEqualTo(2);
            assertThat(e.column()).isPositive();
            assertThat(e.message()).startsWith("XML no válido en la línea 2");
        });
    }

    @Test
    void q04_t11_same_sql_in_cdata_or_escaped_is_valid() {
        assertThat(NoteSource.prepare("SELECT 1\n<![CDATA[ WHERE a < 3 ]]>").errors()).isEmpty();
        assertThat(NoteSource.prepare("SELECT 1 WHERE a &lt; 3 AND b &amp; 1").errors()).isEmpty();
    }

    @Test
    void q04_column_of_first_line_ignores_the_script_wrapper() {
        assertThat(NoteSource.prepare("SELECT a < 3").errors().getFirst().line()).isEqualTo(1);
        assertThat(NoteSource.prepare("SELECT a < 3").errors().getFirst().column()).isLessThanOrEqualTo(12);
    }

    @Test
    void q04_doctype_and_external_entities_are_rejected() {
        assertThat(NoteSource.prepare("<!DOCTYPE x [<!ENTITY e SYSTEM \"file:///etc/passwd\">]> SELECT &e;").errors())
                .isNotEmpty();
    }

    @Test
    void q01_q06_plain_sql_and_where_clause_are_valid() {
        PreparedNote p = NoteSource.prepare("SELECT * FROM book WHERE year > #{y,int}");
        assertThat(p.errors()).isEmpty();
        assertThat(describe(p)).containsExactly("y:int");
    }
}
