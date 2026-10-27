package dev.litedd.workflow;

import dev.litedd.http.ApiError;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Contenido de un workflow (W-02, W-15, W-21, W-28, W-40, W-61, W-80, W-81). */
class WorkflowContentTest {

    private static final String LINEAR = """
            {"options":{"stopOnError":false,"stopOnMissing":true},
             "nodes":[{"id":"start","kind":"start","x":32,"y":160},
                      {"id":"n1","kind":"input","name":"Input1","rows":[{"name":"id","value":"54"}]},
                      {"id":"n2","kind":"http","name":"Conn1","noteId":"h1","values":{"id":"$Input1.id"}},
                      {"id":"n3","kind":"wait","name":"Espera1","seconds":"1,5"},
                      {"id":"loose","kind":"sql","name":"Query1"},
                      {"id":"finish","kind":"finish"}],
             "edges":[{"from":"start","to":"n1"},{"from":"n1","to":"n2"},{"from":"n2","to":"n3"},{"from":"n3","to":"finish"}]}""";

    @Test
    void w02_empty_content_is_start_joined_to_finish() {
        WorkflowContent c = WorkflowContent.parse("");
        assertThat(c.chain()).extracting(WorkflowContent.Node::kind).containsExactly("start", "finish");
        assertThat(c.reachesFinish()).isTrue();
        assertThat(c.problems()).isEmpty();
    }

    @Test
    void w40_only_stop_on_error_is_checked_by_default() {
        WorkflowContent.Options o = WorkflowContent.parse("").options();
        assertThat(o.stopOnError()).isTrue();
        assertThat(o.sameInputs()).isFalse();
        assertThat(o.stopOnMissing()).isFalse();
        assertThat(o.lockValues()).isFalse();
        WorkflowContent.Options saved = WorkflowContent.parse(LINEAR).options();
        assertThat(saved.stopOnError()).isFalse();
        assertThat(saved.stopOnMissing()).isTrue();
    }

    @Test
    void w15_the_chain_follows_the_arrows_and_skips_loose_nodes() {
        WorkflowContent c = WorkflowContent.parse(LINEAR);
        assertThat(c.chain()).extracting(WorkflowContent.Node::id).containsExactly("start", "n1", "n2", "n3", "finish");
        assertThat(c.node("n3").orElseThrow().seconds()).isEqualTo("1,5");
        assertThat(c.node("n2").orElseThrow().values()).containsEntry("id", "$Input1.id");
        assertThat(c.problems()).isEmpty();
    }

    @Test
    void w15_w61_a_broken_chain_says_where_it_stops() {
        WorkflowContent c = WorkflowContent.parse(LINEAR.replace("{\"from\":\"n2\",\"to\":\"n3\"},", ""));
        assertThat(c.reachesFinish()).isFalse();
        assertThat(c.problems()).containsExactly("La cadena no llega de Start a Finish: se corta tras «Conn1»");
    }

    @Test
    void w21_w28_w61_invalid_or_repeated_names_block_running() {
        String bad = LINEAR.replace("\"name\":\"Espera1\"", "\"name\":\"conn1\"")
                .replace("\"name\":\"Query1\"", "\"name\":\"1Query\"")
                .replace("[{\"name\":\"id\",\"value\":\"54\"}]", "[{\"name\":\"id\",\"value\":\"54\"},{\"name\":\"id\"},{\"name\":\"año\"}]");
        assertThat(WorkflowContent.parse(bad).problems()).containsExactly(
                "En «Input1», el valor «id» está repetido",
                "En «Input1», el valor «año» no tiene un nombre válido",
                "El nombre «conn1» está repetido",
                "El nombre «1Query» no es válido: letras sin acentos, números y _, empezando por una letra, hasta 40");
        assertThat(WorkflowContent.parse(LINEAR.replace("\"name\":\"Query1\"", "\"name\":\"\"")).problems())
                .containsExactly("Hay un nodo SQL sin nombre");
    }

    @Test
    void w81_rejects_invalid_structures() {
        List<String> invalid = List.of(
                "no es json",
                "{\"nodes\":[{\"id\":\"start\",\"kind\":\"start\"}],\"edges\":[]}",
                LINEAR.replace("\"kind\":\"wait\"", "\"kind\":\"if\""),
                LINEAR.replace("\"id\":\"n3\"", "\"id\":\"n2\""),
                LINEAR.replace("{\"from\":\"n3\",\"to\":\"finish\"}", "{\"from\":\"n3\",\"to\":\"nada\"}"),
                LINEAR.replace("{\"from\":\"n3\",\"to\":\"finish\"}", "{\"from\":\"n3\",\"to\":\"finish\"},{\"from\":\"loose\",\"to\":\"finish\"}"),
                LINEAR.replace("{\"from\":\"n3\",\"to\":\"finish\"}", "{\"from\":\"n3\",\"to\":\"finish\"},{\"from\":\"n3\",\"to\":\"loose\"}"),
                LINEAR.replace("{\"from\":\"n3\",\"to\":\"finish\"}", "{\"from\":\"n3\",\"to\":\"n3\"}"),
                LINEAR.replace("{\"from\":\"n3\",\"to\":\"finish\"}", "{\"from\":\"finish\",\"to\":\"loose\"}"),
                LINEAR.replace("{\"from\":\"n3\",\"to\":\"finish\"}", "{\"from\":\"loose\",\"to\":\"start\"}"));
        for (String content : invalid) {
            assertThatThrownBy(() -> WorkflowContent.validate(content)).as(content)
                    .isInstanceOfSatisfying(ApiError.class, e -> assertThat(e.body().code()).isEqualTo("invalid_workflow"));
        }
    }

    @Test
    void w16_w81_at_most_one_hundred_nodes() {
        StringBuilder nodes = new StringBuilder("{\"id\":\"start\",\"kind\":\"start\"},{\"id\":\"finish\",\"kind\":\"finish\"}");
        for (int i = 0; i < 98; i++) {
            nodes.append(",{\"id\":\"w").append(i).append("\",\"kind\":\"wait\",\"name\":\"W").append(i).append("\"}");
        }
        WorkflowContent.validate("{\"nodes\":[" + nodes + "]}");
        assertThatThrownBy(() -> WorkflowContent.validate("{\"nodes\":[" + nodes + ",{\"id\":\"x\",\"kind\":\"wait\"}]}"))
                .hasMessageContaining("100");
    }
}
