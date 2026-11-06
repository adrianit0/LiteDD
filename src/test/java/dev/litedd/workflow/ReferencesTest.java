package dev.litedd.workflow;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.litedd.workflow.References.Ref;
import dev.litedd.workflow.References.Resolved;
import dev.litedd.workflow.References.Text;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Referencias $Nombre.ruta (W-30 a W-35) y asignación de Cambiar valor (W-97 a W-99). */
class ReferencesTest {

    private static final ObjectMapper JSON = References.JSON;

    private static JsonNode json(String s) {
        try {
            return JSON.readTree(s);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    /** Los valores del ejemplo del usuario: una respuesta HTTP, una consulta SQL y un Input. */
    private final Map<String, JsonNode> values = Map.of(
            "Conn1", json("{\"data\":{\"test\":54,\"ok\":true,\"ratio\":1.50,\"tags\":[\"a\",\"b\"],\"none\":null,\"user-id\":\"u7\"}}"),
            "Query1", json("[{\"col1\":\"1\",\"col2\":\"test\",\"col3\":\"true\"},{\"col1\":\"3\",\"col2\":\"test2\",\"col3\":null}]"),
            "Input1", json("{\"value1\":\"3\",\"value2\":\"test\"}"));
    private final Function<String, Optional<JsonNode>> lookup = name -> Optional.ofNullable(values.get(name));

    private Resolved resolve(String text) {
        return References.resolve(text, lookup);
    }

    @Test
    void w30_parses_keys_positions_and_quoted_keys() {
        assertThat(References.parse("$Conn1.data.test")).containsExactly(new Ref("$Conn1.data.test", "Conn1", List.of("data", "test")));
        assertThat(References.parse("$Query1[0].col1")).containsExactly(new Ref("$Query1[0].col1", "Query1", List.of(0, "col1")));
        assertThat(References.parse("$Conn1.items[2][\"user-id\"]"))
                .containsExactly(new Ref("$Conn1.items[2][\"user-id\"]", "Conn1", List.of("items", 2, "user-id")));
        assertThat(References.parse("$A[\"a\\\"b\"]")).containsExactly(new Ref("$A[\"a\\\"b\"]", "A", List.of("a\"b")));
    }

    @Test
    void w30_user_examples_resolve_to_text() {
        assertThat(resolve("$Conn1.data.test").value()).isEqualTo("54");
        assertThat(resolve("$Query1[0].col1").value()).isEqualTo("1");
        assertThat(resolve("$Input1.value2").value()).isEqualTo("test");
        assertThat(resolve("$Conn1.data[\"user-id\"]").value()).isEqualTo("u7");
    }

    @Test
    void w31_references_inside_text_and_dollar_escapes() {
        assertThat(References.parse("Bearer $Login.token.")).containsExactly(new Text("Bearer "),
                new Ref("$Login.token", "Login", List.of("token")), new Text("."));
        assertThat(resolve("id=$Conn1.data.test-x").value()).isEqualTo("id=54-x");
        assertThat(resolve("Cuesta $$5 o $5 y $").value()).isEqualTo("Cuesta $5 o $5 y $");
        assertThat(resolve("$$Conn1.data.test").value()).isEqualTo("$Conn1.data.test");
        // Un corchete que no forma un paso es texto.
        assertThat(resolve("$Input1.value1[x]").value()).isEqualTo("3[x]");
        assertThat(References.refs("sin referencias")).isEmpty();
    }

    @Test
    void w34_numbers_booleans_objects_and_lists_as_json() {
        assertThat(resolve("$Conn1.data.ok").value()).isEqualTo("true");
        assertThat(resolve("$Conn1.data.ratio").value()).isEqualTo("1.50");
        assertThat(resolve("$Conn1.data.tags").value()).isEqualTo("[\"a\",\"b\"]");
        assertThat(resolve("$Input1").value()).isEqualTo("{\"value1\":\"3\",\"value2\":\"test\"}");
        assertThat(resolve("$Query1[1]").value()).isEqualTo("{\"col1\":\"3\",\"col2\":\"test2\",\"col3\":null}");
    }

    @Test
    void w34_null_is_null_alone_and_the_text_null_inside_text() {
        Resolved alone = resolve("$Conn1.data.none");
        assertThat(alone.value()).isNull();
        assertThat(alone.missing()).isEmpty();
        assertThat(resolve("$Query1[1].col3").value()).isNull();
        assertThat(resolve("x=$Conn1.data.none").value()).isEqualTo("x=null");
    }

    @Test
    void w35_missing_references_are_null_and_reported() {
        for (String missing : List.of("$Conn1.data.value", "$Conn2.data", "$Query1[5].col1", "$Query1[0].nope",
                "$Conn1.data.test.deeper", "$Input1[0]", "$Conn1.data.tags.first")) {
            Resolved r = resolve(missing);
            assertThat(r.value()).as(missing).isNull();
            assertThat(r.missing()).as(missing).containsExactly(missing);
        }
        Resolved inText = resolve("a=$Conn1.data.value&b=$Input1.value1");
        assertThat(inText.value()).isEqualTo("a=null&b=3");
        assertThat(inText.missing()).containsExactly("$Conn1.data.value");
    }

    @Test
    void w93_w97_a_single_reference_is_the_whole_text() {
        assertThat(References.single("$Conn1.data[\"user-id\"]")).contains(new Ref("$Conn1.data[\"user-id\"]", "Conn1", List.of("data", "user-id")));
        assertThat(References.single("$Query1")).contains(new Ref("$Query1", "Query1", List.of()));
        for (String notSingle : List.of("", "Conn1.data", " $Conn1", "$Conn1 ", "$Conn1.data x", "a$Conn1", "$1", "$$Conn1")) {
            assertThat(References.single(notSingle)).as(notSingle).isEmpty();
        }
    }

    @Test
    void w98_a_value_is_read_as_json_when_it_is() {
        assertThat(References.readValue("54").isNumber()).isTrue();
        assertThat(References.readValue("1.50").toString()).isEqualTo("1.50");
        assertThat(References.readValue("true").isBoolean()).isTrue();
        assertThat(References.readValue("null").isNull()).isTrue();
        assertThat(References.readValue(null).isNull()).isTrue();
        assertThat(References.readValue("{\"a\":[1,2]}").get("a").get(1).asInt()).isEqualTo(2);
        assertThat(References.readValue("\"54\"").textValue()).isEqualTo("54");
        for (String text : List.of("abc", "", "54 abc", "007", "{\"a\":", "Ana López")) {
            JsonNode v = References.readValue(text);
            assertThat(v.isTextual()).as(text).isTrue();
            assertThat(v.textValue()).as(text).isEqualTo(text);
        }
    }

    @Test
    void w99_assign_sets_a_key_or_an_existing_position() {
        JsonNode conn = json("{\"data\":{\"test\":54,\"tags\":[\"a\",\"b\"]}}").deepCopy();
        Ref value = References.single("$Conn1.data.test").orElseThrow();
        assertThat(References.assign(conn, value, json("55")).get("data").get("test").asInt()).isEqualTo(55);
        References.assign(conn, References.single("$Conn1.data.nueva").orElseThrow(), json("\"x\""));
        References.assign(conn, References.single("$Conn1.data.tags[1]").orElseThrow(), json("\"z\""));
        References.assign(conn, References.single("$Conn1[\"otra clave\"]").orElseThrow(), json("[]"));
        assertThat(conn.toString()).isEqualTo("{\"data\":{\"test\":55,\"tags\":[\"a\",\"z\"],\"nueva\":\"x\"},\"otra clave\":[]}");
        // Sin ruta, el valor entero.
        assertThat(References.assign(conn, References.single("$Conn1").orElseThrow(), json("7")).asInt()).isEqualTo(7);
    }

    @Test
    void w99_assign_says_which_step_does_not_exist() {
        JsonNode conn = json("{\"data\":{\"test\":54,\"tags\":[\"a\"]}}").deepCopy();
        Map<String, String> errors = Map.of(
                "$Conn1.data.tags[3]", "`$Conn1.data.tags[3]` no existe",
                "$Conn1.data.nada.x", "`$Conn1.data.nada` no existe",
                "$Conn1.data.test.x", "`$Conn1.data.test` no es un objeto",
                "$Conn1.data[0]", "`$Conn1.data` no es una lista",
                "$Conn1.data.tags.x", "`$Conn1.data.tags` no es un objeto");
        errors.forEach((target, message) -> assertThatThrownBy(
                () -> References.assign(conn, References.single(target).orElseThrow(), json("1"))).as(target).hasMessage(message));
        assertThat(conn.toString()).isEqualTo("{\"data\":{\"test\":54,\"tags\":[\"a\"]}}");
    }

    @Test
    void w32_a_text_body_has_a_value_but_no_paths() {
        Function<String, Optional<JsonNode>> text = name -> Optional.of(JSON.getNodeFactory().textNode("hola"));
        assertThat(References.resolve("$Conn1", text).value()).isEqualTo("hola");
        assertThat(References.resolve("$Conn1.data", text).missing()).containsExactly("$Conn1.data");
    }
}
