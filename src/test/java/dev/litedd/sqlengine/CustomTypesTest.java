package dev.litedd.sqlengine;

import dev.litedd.sqlengine.CustomTypes.Resolved;
import dev.litedd.sqlengine.NoteSource.PreparedNote;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/** Tipos personalizados de variable (Q-111, Q-112, ADR-0050). */
class CustomTypesTest {

    private static final CustomTypes TYPES = CustomTypes.of(List.of("lang", "catalogo#{id}", "cat#{id}", "cat"));

    private static PreparedNote prepare(String content) {
        return NoteSource.prepare(content, TYPES);
    }

    @Test
    void q111_a_usage_resolves_first_without_parameter_then_by_the_longest_prefix() {
        assertThat(TYPES.resolve("lang")).contains(new Resolved("lang", null, null));
        assertThat(TYPES.resolve(" LANG ")).contains(new Resolved("lang", null, null));
        assertThat(TYPES.resolve("catalogo5")).contains(new Resolved("catalogo#{id}", "id", "5"));
        assertThat(TYPES.resolve("CATALOGO12")).contains(new Resolved("catalogo#{id}", "id", "12"));
        assertThat(TYPES.resolve("cat")).contains(new Resolved("cat", null, null));
        assertThat(TYPES.resolve("cat7")).contains(new Resolved("cat#{id}", "id", "7"));
        // Sin nada detrás no hay parámetro.
        assertThat(TYPES.resolve("catalogo")).contains(new Resolved("cat#{id}", "id", "alogo"));
        assertThat(CustomTypes.of(List.of("catalogo#{id}")).resolve("catalogo")).isEmpty();
        assertThat(TYPES.resolve("langs")).isEmpty();
        assertThat(CustomTypes.NONE.resolve("lang")).isEmpty();
    }

    @Test
    void q110_names_are_identifiers_with_an_optional_parameter() {
        assertThat(CustomTypes.prefix("catalogo#{id}")).contains("catalogo");
        assertThat(CustomTypes.prefix("catalogo#{ id }")).contains("catalogo");
        assertThat(CustomTypes.prefix("lang")).contains("lang");
        for (String bad : List.of("", "5lang", "la-ng", "cat#{id}x", "cat#{}", "#{id}", "cat#{a}#{b}")) {
            assertThat(CustomTypes.prefix(bad)).as(bad).isEmpty();
        }
    }

    @Test
    void q111_q112_a_custom_type_is_a_string_with_its_usage() {
        PreparedNote p = prepare("SELECT * FROM book WHERE lang_id = #{lenguajeId, lang} AND type_id = #{tipoId, javaType=catalogo5}"
                + " <if test=\"x != null\">AND 1</if> <!-- #{x,LANG} -->");
        assertThat(p.errors()).isEmpty();
        assertThat(p.variables()).containsExactly(
                new Variable("lenguajeId", SqlType.STRING, null, false, "lang"),
                new Variable("tipoId", SqlType.STRING, null, false, "catalogo5"),
                new Variable("x", SqlType.STRING, null, false, "LANG"));
        // Q-12: MyBatis recibe el token sin tipo.
        assertThat(p.body()).contains("#{lenguajeId}").contains("#{tipoId}");
        // Un token sin tipo junto a uno con tipo personalizado vale el declarado (Q-16).
        assertThat(prepare("SELECT #{a} , #{a, lang}").variables()).containsExactly(new Variable("a", SqlType.STRING, null, false, "lang"));
        assertThat(prepare("SELECT #{a, lang} , #{a, Lang}").errors()).isEmpty();
    }

    @Test
    void q111_an_unknown_type_is_still_an_error() {
        PreparedNote p = prepare("SELECT #{a, idioma}");
        assertThat(p.errors()).extracting(SqlError::message).containsExactly("Tipo desconocido «idioma» en la variable «a»");
        assertThat(NoteSource.prepare("SELECT #{a, lang}").errors()).extracting(SqlError::code).containsExactly("type");
    }

    @Test
    void q112_custom_types_conflict_with_other_types_dollar_and_foreach() {
        assertThat(messages("SELECT #{a, lang}, #{a, int}")).containsExactly("La variable «a» tiene tipos contradictorios: int, lang");
        assertThat(messages("SELECT #{a, lang}, #{a, catalogo5}"))
                .containsExactly("La variable «a» tiene tipos contradictorios: lang, catalogo5");
        assertThat(messages("SELECT ${a}, #{a, lang}")).containsExactly("La variable «a» se usa en ${…}, que siempre es string: lang");
        assertThat(messages("SELECT 1 <foreach collection=\"ids\" item=\"i\">#{i}</foreach> <!-- #{ids, lang} -->"))
                .containsExactly("La variable «ids» es la colección de un <foreach> y por tanto list: lang");
        assertThat(messages("SELECT 1 <foreach collection=\"ids\" item=\"i\">#{i, lang}</foreach>"))
                .containsExactly("La variable «i» es el item de un <foreach> y no admite el tipo «lang»");
    }

    private static List<String> messages(String content) {
        return prepare(content).errors().stream().map(SqlError::message).toList();
    }

    @Test
    void q111_the_engine_reads_the_types_on_each_analysis() {
        List<String> names = new java.util.ArrayList<>();
        SqlEngine engine = new SqlEngine(() -> CustomTypes.of(names));
        assertThat(engine.analyze("SELECT * FROM book WHERE lang_id = #{l, lang}").errors()).isNotEmpty();
        names.add("lang");
        SqlEngine.Analysis a = engine.analyze("SELECT * FROM book WHERE lang_id = #{l, lang}");
        assertThat(a.errors()).isEmpty();
        assertThat(a.variables().getFirst().customType()).isEqualTo("lang");
        // Q-112: la variable recibe la key tal cual, como string.
        assertThat(engine.plan("SELECT * FROM book WHERE lang_id = #{l, lang}", java.util.Map.of("l", "3")).inlined())
                .isEqualTo("SELECT * FROM book WHERE lang_id = '3'");
    }
}
