package dev.litedd.workflow;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Condición del nodo Condición (W-91, W-92, ADR-0041). */
class ConditionTest {

    private static JsonNode json(String s) {
        try {
            return References.JSON.readTree(s);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    /** Una respuesta HTTP, una consulta SQL, con valores como texto, y un Input. */
    private final Map<String, JsonNode> values = Map.of(
            "Conn1", json("{\"data\":{\"total\":3,\"active\":true,\"name\":\"Ana\",\"none\":null,\"tags\":[],\"code\":\"a && b\"}}"),
            "Query1", json("[{\"count\":\"0\",\"amount\":\"10.50\",\"date\":\"2026-11-06\"}]"),
            "Input1", json("{\"tipo\":\"A\",\"id\":\"54\",\"vacio\":\"\"}"));
    private final Function<String, Optional<JsonNode>> lookup = name -> Optional.ofNullable(values.get(name));

    private boolean is(String condition) {
        return Condition.evaluate(Condition.parse(condition), lookup).value();
    }

    @Test
    void w91_the_user_example_and_the_operators() {
        assertThat(is("$Conn1.data.total > 0 && $Input1.tipo == \"A\"")).isTrue();
        assertThat(is("$Conn1.data.total > 5 || $Input1.tipo != \"B\"")).isTrue();
        assertThat(is("!($Conn1.data.total >= 3)")).isFalse();
        assertThat(is("$Conn1.data.total <= 3 && $Conn1.data.total < 4")).isTrue();
        assertThat(is("  true  ")).isTrue();
        assertThat(is("false || null")).isFalse();
    }

    @Test
    void w91_precedence_is_not_then_comparisons_then_and_then_or() {
        // true || (false && false)
        assertThat(is("true || false && false")).isTrue();
        // (!true) == false
        assertThat(is("!true == false")).isTrue();
        assertThat(is("(true || false) && false")).isFalse();
    }

    @Test
    void w91_badly_written_conditions_say_why() {
        Map<String, String> bad = Map.of(
                "", "La condición está vacía",
                "$Conn1.data.total >", "Falta un valor al final",
                "($Conn1.data.total > 0", "Falta un paréntesis de cierre",
                "$Conn1.data.total > 0)", "Sobra «)»",
                "$Input1.tipo == A", "No se esperaba «A»: los textos van entre comillas",
                "$Input1.tipo == \"A", "Falta la comilla de cierre de un texto",
                "1 < 2 < 3", "Dos comparaciones seguidas necesitan paréntesis",
                "$1 == 1", "Tras «$» va el nombre de un nodo",
                "$Input1.tipo = \"A\"", "Sobra «= \"A\"»");
        bad.forEach((condition, message) -> {
            assertThat(Condition.problem(condition)).as(condition).isEqualTo(message);
            assertThatThrownBy(() -> Condition.parse(condition)).as(condition).hasMessage(message);
        });
        assertThat(Condition.problem("(1 < 2) == (2 < 3)")).isNull();
        assertThat(Condition.problem("\"con \\\"comillas\\\" y \\\\\" == \"x\"")).isNull();
    }

    @Test
    void w92_numbers_and_texts_that_are_numbers_compare_as_numbers() {
        assertThat(is("$Input1.id == 54")).isTrue();
        assertThat(is("\"54\" == 54.0")).isTrue();
        assertThat(is("$Query1[0].amount > 9")).isTrue();
        assertThat(is("$Query1[0].amount == 10.5")).isTrue();
        assertThat(is("-1.5 < 0")).isTrue();
        // Como texto, "10.50" < "9"; como número, no.
        assertThat(is("$Query1[0].amount < \"9\"")).isFalse();
    }

    @Test
    void w92_other_values_compare_as_text() {
        assertThat(is("$Conn1.data.name == \"Ana\"")).isTrue();
        assertThat(is("$Conn1.data.name == \"ana\"")).isFalse();
        assertThat(is("$Conn1.data.active == true")).isTrue();
        assertThat(is("$Conn1.data.active == \"true\"")).isTrue();
        assertThat(is("$Query1[0].date >= \"2026-01-01\"")).isTrue();
        assertThat(is("$Query1[0].date < \"2026-11-01\"")).isFalse();
        assertThat(is("$Conn1.data.tags == \"[]\"")).isTrue();
    }

    @Test
    void w92_null_is_only_equal_to_null_and_is_not_ordered() {
        assertThat(is("$Conn1.data.none == null")).isTrue();
        assertThat(is("$Conn1.data.name != null")).isTrue();
        assertThat(is("$Conn1.data.none == \"\"")).isFalse();
        assertThat(is("$Conn1.data.none < 1")).isFalse();
        assertThat(is("$Conn1.data.none >= 1")).isFalse();
    }

    @Test
    void w92_a_value_alone_is_false_when_null_false_zero_empty_text_or_empty_list() {
        for (String falsy : List.of("$Conn1.data.none", "false", "0", "$Query1[0].count", "$Input1.vacio", "$Conn1.data.tags",
                "$Conn1.data.nada")) {
            assertThat(is(falsy)).as(falsy).isFalse();
        }
        for (String truthy : List.of("$Conn1.data.total", "$Conn1.data.active", "$Input1.tipo", "$Conn1.data", "$Query1")) {
            assertThat(is(truthy)).as(truthy).isTrue();
        }
    }

    @Test
    void w92_missing_references_are_null_and_reported() {
        Condition.Result r = Condition.evaluate(Condition.parse("$Conn1.data.nada == null && $Conn2 == null"), lookup);
        assertThat(r.value()).isTrue();
        assertThat(r.missing()).containsExactly("$Conn1.data.nada", "$Conn2");
        // Lo que no se llega a evaluar no cuenta.
        assertThat(Condition.evaluate(Condition.parse("true || $Conn2"), lookup).missing()).isEmpty();
    }

    @Test
    void w92_a_reference_value_is_never_read_again_as_a_condition() {
        assertThat(is("$Conn1.data.code == \"a && b\"")).isTrue();
        assertThat(is("$Conn1.data.code")).isTrue();
    }
}
