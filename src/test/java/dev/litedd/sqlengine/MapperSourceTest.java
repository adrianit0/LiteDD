package dev.litedd.sqlengine;

import dev.litedd.sqlengine.MapperSource.ParsedMapper;
import dev.litedd.sqlengine.MapperSource.Statement;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/** Análisis de una nota XML MyBatis (M-02 a M-06, M-11, M-40). */
class MapperSourceTest {

    static final String DEMO = """
            <?xml version="1.0" encoding="UTF-8"?>
            <!DOCTYPE mapper PUBLIC "-//mybatis.org//DTD Mapper 3.0//EN" "https://mybatis.org/dtd/mybatis-3-mapper.dtd">
            <mapper namespace="demo.BookMapper">
              <resultMap id="bookMap" type="demo.Book">
                <id property="id" column="id"/>
              </resultMap>

              <sql id="bookColumns">b.id, b.title, b.year</sql>

              <select id="selectByAuthor" resultMap="bookMap" parameterType="map">
                SELECT <include refid="bookColumns"/>
                FROM book b
                <where>
                  <if test="authorId != null">AND b.author_id = #{authorId,int}</if>
                  <if test="minYear != null">AND b.year >= #{minYear,int}</if>
                </where>
              </select>

              <select id="countBooks" resultType="long">
                SELECT count(*) FROM book b WHERE b.year &lt; #{year,int}
              </select>

              <update id="renameBook">
                UPDATE book SET title = #{title} WHERE id = #{id,int}
              </update>
            </mapper>
            """;

    @Test
    void m02_m04_doctype_is_ignored_and_statements_come_in_order() {
        ParsedMapper p = MapperSource.parse(DEMO);
        assertThat(p.errors()).isEmpty();
        assertThat(p.statements()).extracting(Statement::id).containsExactly("selectByAuthor", "countBooks", "renameBook");
        assertThat(p.statements()).extracting(Statement::kind).containsExactly("select", "select", "update");
    }

    @Test
    void m05_m11_include_is_resolved_and_body_is_dedented() {
        Statement s = MapperSource.parse(DEMO).statements().getFirst();
        assertThat(s.body()).isEqualTo("""
                SELECT b.id, b.title, b.year
                FROM book b
                <where>
                  <if test="authorId != null">AND b.author_id = #{authorId,int}</if>
                  <if test="minYear != null">AND b.year >= #{minYear,int}</if>
                </where>""");
    }

    @Test
    void m11_body_is_a_valid_sql_note() {
        SqlEngine engine = new SqlEngine();
        ParsedMapper p = MapperSource.parse(DEMO);
        SqlEngine.Analysis select = engine.analyze(p.statements().getFirst().body());
        assertThat(select.errors()).isEmpty();
        assertThat(select.kind()).isEqualTo("query");
        assertThat(select.variables()).extracting(Variable::name).containsExactly("authorId", "minYear");

        // El «<» escapado sigue escapado y la nota sigue siendo XML válido.
        assertThat(p.statements().get(1).body()).isEqualTo("SELECT count(*) FROM book b WHERE b.year &lt; #{year,int}");
        assertThat(engine.analyze(p.statements().get(1).body()).errors()).isEmpty();
    }

    @Test
    void m23_write_statement_is_not_executable() {
        Statement update = MapperSource.parse(DEMO).statements().get(2);
        SqlEngine.Plan plan = new SqlEngine().plan(update.body(), Map.of("title", "Nuevo", "id", "7"));
        assertThat(plan.executable()).isFalse();
        assertThat(plan.inlined()).isEqualTo("UPDATE book SET title = 'Nuevo' WHERE id = 7");
    }

    @Test
    void m05_namespaced_refid_property_and_nested_fragments() {
        ParsedMapper p = MapperSource.parse("""
                <mapper namespace="demo.LoanMapper">
                  <sql id="alias">${prefix}.id</sql>
                  <sql id="columns"><include refid="alias"><property name="prefix" value="l"/></include>, l.book_id</sql>
                  <select id="loans">SELECT <include refid="demo.LoanMapper.columns"/> FROM loan l</select>
                </mapper>""");
        assertThat(p.errors()).isEmpty();
        assertThat(p.statements().getFirst().body()).isEqualTo("SELECT l.id, l.book_id FROM loan l");
    }

    @Test
    void m05_property_does_not_touch_user_variables() {
        ParsedMapper p = MapperSource.parse("""
                <mapper>
                  <sql id="byTitle">title = #{title} AND ${col} = 1</sql>
                  <select id="s">SELECT * FROM book WHERE <include refid="byTitle"/></select>
                </mapper>""");
        assertThat(p.statements().getFirst().body()).isEqualTo("SELECT * FROM book WHERE title = #{title} AND ${col} = 1");
    }

    @Test
    void m06_select_key_and_unknown_elements_are_ignored() {
        ParsedMapper p = MapperSource.parse("""
                <mapper namespace="demo.AuthorMapper">
                  <cache/>
                  <insert id="insertAuthor" useGeneratedKeys="true" keyProperty="id">
                    <selectKey keyProperty="id" resultType="int" order="AFTER">SELECT LAST_INSERT_ID()</selectKey>
                    INSERT INTO author (name) VALUES (#{name})
                  </insert>
                  <delete id="deleteAuthor">DELETE FROM author WHERE id = #{id,int}</delete>
                </mapper>""");
        assertThat(p.errors()).isEmpty();
        assertThat(p.statements()).extracting(Statement::kind).containsExactly("insert", "delete");
        assertThat(p.statements().getFirst().body()).isEqualTo("INSERT INTO author (name) VALUES (#{name})");
    }

    @Test
    void m11_dynamic_tags_comments_and_cdata_are_kept() {
        ParsedMapper p = MapperSource.parse("""
                <mapper>
                  <select id="s">
                    <!-- #{onlyActive,boolean} -->
                    SELECT * FROM book WHERE <![CDATA[ year < 2000 ]]>
                    <if test="ids != null">
                      AND id IN <foreach collection="ids" item="id" open="(" separator="," close=")">#{id,int}</foreach>
                    </if>
                  </select>
                </mapper>""");
        assertThat(p.statements().getFirst().body()).isEqualTo("""
                <!-- #{onlyActive,boolean} -->
                SELECT * FROM book WHERE <![CDATA[ year < 2000 ]]>
                <if test="ids != null">
                  AND id IN <foreach collection="ids" item="id" open="(" separator="," close=")">#{id,int}</foreach>
                </if>""");
    }

    @Test
    void m40_malformed_xml_reports_line_and_column_with_doctype() {
        ParsedMapper p = MapperSource.parse("""
                <?xml version="1.0"?>
                <!DOCTYPE mapper PUBLIC "-//mybatis.org//DTD Mapper 3.0//EN" "https://mybatis.org/dtd/mybatis-3-mapper.dtd">
                <mapper>
                  <select id="s">SELECT 1 WHERE 1 < 2</select>
                </mapper>""");
        assertThat(p.valid()).isFalse();
        assertThat(p.errors()).singleElement().satisfies(e -> {
            assertThat(e.code()).isEqualTo("xml");
            assertThat(e.line()).isEqualTo(4);
        });
    }

    @Test
    void m03_root_must_be_mapper() {
        assertThat(MapperSource.parse("<select id=\"s\">SELECT 1</select>").errors())
                .singleElement().satisfies(e -> assertThat(e.code()).isEqualTo("mapper"));
    }

    @Test
    void m40_missing_and_repeated_ids() {
        ParsedMapper p = MapperSource.parse("""
                <mapper>
                  <select>SELECT 1</select>
                  <select id="a">SELECT 1</select>
                  <update id="a">UPDATE book SET year = 1</update>
                </mapper>""");
        assertThat(p.valid()).isFalse();
        assertThat(p.errors()).extracting(SqlError::message)
                .containsExactly("Hay un elemento <select> sin id", "El id de sentencia «a» está repetido (línea 4)");
        assertThat(p.statements()).extracting(Statement::id).containsExactly("a");
    }

    @Test
    void m40_unknown_or_foreign_fragment() {
        ParsedMapper p = MapperSource.parse("""
                <mapper namespace="demo.BookMapper">
                  <select id="a">SELECT <include refid="demo.AuthorMapper.columns"/> FROM author</select>
                </mapper>""");
        assertThat(p.errors()).singleElement().satisfies(e -> {
            assertThat(e.code()).isEqualTo("include");
            assertThat(e.message()).contains("«a»", "«demo.AuthorMapper.columns»");
            assertThat(e.line()).isEqualTo(2);
        });
        assertThat(p.statements()).extracting(Statement::body).containsOnlyNulls();
    }

    static final MapperSource.MapperFile AUTHORS = new MapperSource.MapperFile("n-authors", "Autores", """
            <?xml version="1.0" encoding="UTF-8"?>
            <!DOCTYPE mapper PUBLIC "-//mybatis.org//DTD Mapper 3.0//EN" "https://mybatis.org/dtd/mybatis-3-mapper.dtd">
            <mapper namespace="demo.AuthorMapper">
              <sql id="columns">a.id, a.name</sql>
              <sql id="activeOnly">AND a.active = 1 <include refid="demo.AuthorMapper.notDeleted"/></sql>
              <sql id="notDeleted">AND a.deleted_at IS NULL</sql>
            </mapper>""");

    @Test
    void m05_fragments_of_other_xml_notes_are_resolved_by_namespace() {
        ParsedMapper p = MapperSource.parse("""
                <mapper namespace="demo.BookMapper">
                  <select id="a">SELECT <include refid="demo.AuthorMapper.columns"/> FROM author a
                    WHERE 1 = 1 <include refid="demo.AuthorMapper.activeOnly"/></select>
                </mapper>""", MapperSource.Library.of(List.of(AUTHORS)));
        assertThat(p.errors()).isEmpty();
        assertThat(p.statements().getFirst().body())
                .isEqualTo("SELECT a.id, a.name FROM author a\nWHERE 1 = 1 AND a.active = 1 AND a.deleted_at IS NULL");
    }

    @Test
    void m05_own_namespace_wins_over_a_note_with_the_same_namespace() {
        String own = """
                <mapper namespace="demo.AuthorMapper">
                  <sql id="columns">mine</sql>
                  <select id="a">SELECT <include refid="columns"/>, <include refid="demo.AuthorMapper.columns"/></select>
                </mapper>""";
        ParsedMapper p = MapperSource.parse(own, MapperSource.Library.of(List.of(AUTHORS)));
        assertThat(p.errors()).isEmpty();
        assertThat(p.statements().getFirst().body()).isEqualTo("SELECT mine, mine");
    }

    @Test
    void m05_library_without_excludes_the_note_being_analyzed() {
        MapperSource.Library library = MapperSource.Library.of(List.of(AUTHORS)).without("n-authors");
        ParsedMapper p = MapperSource.parse("""
                <mapper namespace="demo.BookMapper">
                  <select id="a">SELECT <include refid="demo.AuthorMapper.columns"/></select>
                </mapper>""", library);
        assertThat(p.errors()).singleElement().satisfies(e -> assertThat(e.code()).isEqualTo("include"));
    }

    @Test
    void m40_message_names_only_missing_fragments() {
        ParsedMapper p = MapperSource.parse("""
                <mapper namespace="demo.BookMapper">
                  <sql id="own">b.id</sql>
                  <select id="a">SELECT <include refid="own"/>, <include refid="demo.AuthorMapper.columns"/>
                    FROM book <include refid="demo.PagingMapper.page"/></select>
                </mapper>""", MapperSource.Library.of(List.of(AUTHORS)));
        assertThat(p.errors()).singleElement().satisfies(e -> assertThat(e.message()).isEqualTo(
                "La sentencia «a» usa un fragmento que no está en este mapper ni en otra nota XML MyBatis: «demo.PagingMapper.page»"));
    }

    @Test
    void m40_repeated_namespace_names_the_notes() {
        MapperSource.MapperFile copy = new MapperSource.MapperFile("n-copy", "Autores (2)", AUTHORS.content());
        ParsedMapper p = MapperSource.parse("""
                <mapper namespace="demo.BookMapper">
                  <select id="a">SELECT <include refid="demo.AuthorMapper.columns"/></select>
                </mapper>""", MapperSource.Library.of(List.of(AUTHORS, copy)));
        assertThat(p.errors()).singleElement().satisfies(e -> assertThat(e.message()).isEqualTo(
                "La sentencia «a» usa el namespace «demo.AuthorMapper», que está en varias notas XML MyBatis: «Autores», «Autores (2)»"));
    }

    @Test
    void m40_circular_include_across_mappers() {
        MapperSource.MapperFile other = new MapperSource.MapperFile("n-other", "Otro", """
                <mapper namespace="demo.Other">
                  <sql id="x">x <include refid="demo.BookMapper.y"/></sql>
                </mapper>""");
        ParsedMapper p = MapperSource.parse("""
                <mapper namespace="demo.BookMapper">
                  <sql id="y">y <include refid="demo.Other.x"/></sql>
                  <select id="s">SELECT <include refid="y"/></select>
                </mapper>""", MapperSource.Library.of(List.of(other)));
        assertThat(p.errors()).singleElement().satisfies(e -> assertThat(e.message()).startsWith("<include> circular:"));
    }

    @Test
    void m40_circular_include() {
        ParsedMapper p = MapperSource.parse("""
                <mapper>
                  <sql id="a">x <include refid="b"/></sql>
                  <sql id="b">y <include refid="a"/></sql>
                  <select id="s">SELECT <include refid="a"/></select>
                </mapper>""");
        assertThat(p.errors()).singleElement().satisfies(e -> assertThat(e.message()).isEqualTo("<include> circular: a → b → a"));
    }
}
