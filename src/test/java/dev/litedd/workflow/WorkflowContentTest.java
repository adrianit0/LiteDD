package dev.litedd.workflow;

import dev.litedd.http.ApiError;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Contenido de un workflow (W-02, W-12, W-15, W-18, W-21, W-28, W-40, W-61, W-80, W-81, W-91, W-93, W-96, W-97). */
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
        assertThat(c.flow()).extracting(WorkflowContent.Node::kind).containsExactly("start", "finish");
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
    void w15_the_flow_follows_the_arrows_and_skips_loose_nodes() {
        WorkflowContent c = WorkflowContent.parse(LINEAR);
        assertThat(c.flow()).extracting(WorkflowContent.Node::id).containsExactly("start", "n1", "n2", "n3", "finish");
        assertThat(c.node("n3").orElseThrow().seconds()).isEqualTo("1,5");
        assertThat(c.node("n2").orElseThrow().values()).containsEntry("id", "$Input1.id");
        assertThat(c.problems()).isEmpty();
    }

    @Test
    void w15_w61_an_output_of_the_flow_without_arrow_blocks_running() {
        WorkflowContent c = WorkflowContent.parse(LINEAR.replace("{\"from\":\"n2\",\"to\":\"n3\"},", ""));
        assertThat(c.problems()).containsExactly("La salida de «Conn1» no tiene flecha");
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
                LINEAR.replace("{\"from\":\"n3\",\"to\":\"finish\"}", "{\"from\":\"n3\",\"to\":\"finish\"},{\"from\":\"n3\",\"to\":\"loose\"}"),
                LINEAR.replace("{\"from\":\"n3\",\"to\":\"finish\"}", "{\"from\":\"n3\",\"to\":\"n3\"}"),
                LINEAR.replace("{\"from\":\"n3\",\"to\":\"finish\"}", "{\"from\":\"finish\",\"to\":\"loose\"}"),
                LINEAR.replace("{\"from\":\"n3\",\"to\":\"finish\"}", "{\"from\":\"loose\",\"to\":\"start\"}"),
                // W-12: solo la Condición tiene las salidas yes y no, y no tiene la normal.
                LINEAR.replace("{\"from\":\"n3\",\"to\":\"finish\"}", "{\"from\":\"n3\",\"out\":\"yes\",\"to\":\"finish\"}"),
                graph("{\"from\":\"c\",\"to\":\"finish\"}"),
                graph("{\"from\":\"c\",\"out\":\"maybe\",\"to\":\"finish\"}"),
                graph("{\"from\":\"c\",\"out\":\"yes\",\"to\":\"finish\"},{\"from\":\"c\",\"out\":\"yes\",\"to\":\"a\"}"));
        for (String content : invalid) {
            assertThatThrownBy(() -> WorkflowContent.validate(content)).as(content)
                    .isInstanceOfSatisfying(ApiError.class, e -> assertThat(e.body().code()).isEqualTo("invalid_workflow"));
        }
    }

    @Test
    void w29_w81_login_nodes_keep_their_user_in_values() {
        WorkflowContent c = WorkflowContent.parse(LINEAR.replace(
                "{\"id\":\"loose\",\"kind\":\"sql\",\"name\":\"Query1\"}",
                "{\"id\":\"loose\",\"kind\":\"login\",\"name\":\"Login1\",\"values\":{\"user\":\"$Input1.user\"}}"));
        assertThat(c.node("loose").orElseThrow().values()).containsEntry("user", "$Input1.user");
        assertThat(c.problems()).isEmpty();
    }

    /**
     * Start, una Condición c, dos Espera a y b, un Bucle f, dos Break k y k2, un Cambiar valor s y Finish, con las
     * flechas dadas.
     */
    private static String graph(String edges) {
        return """
                {"nodes":[{"id":"start","kind":"start"},
                          {"id":"c","kind":"condition","name":"Condicion1","condition":"$A == null"},
                          {"id":"a","kind":"wait","name":"A","seconds":"0"},
                          {"id":"b","kind":"wait","name":"B","seconds":"0"},
                          {"id":"f","kind":"foreach","name":"Bucle1","list":"$A"},
                          {"id":"k","kind":"break","name":"Break1"},
                          {"id":"k2","kind":"break","name":"Break2"},
                          {"id":"s","kind":"set","name":"Cambiar1","assignments":[{"target":"$A.x","value":"1"}]},
                          {"id":"finish","kind":"finish"}],
                 "edges":[%s]}""".formatted(edges);
    }

    /** Flechas escritas como «a>b» o «c:yes>a». */
    private static String edges(String... arrows) {
        List<String> out = new java.util.ArrayList<>();
        for (String arrow : arrows) {
            String[] parts = arrow.split(">");
            String[] from = parts[0].split(":");
            out.add("{\"from\":\"" + from[0] + "\"" + (from.length > 1 ? ",\"out\":\"" + from[1] + "\"" : "")
                    + ",\"to\":\"" + parts[1] + "\"}");
        }
        return String.join(",", out);
    }

    private static List<String> problems(String content) {
        return WorkflowContent.parse(content).problems();
    }

    @Test
    void w12_w81_an_entry_admits_several_arrows_and_a_condition_has_two_outputs() {
        WorkflowContent c = WorkflowContent.parse(graph(edges("start>c", "c:yes>a", "c:no>b", "a>finish", "b>finish")));
        assertThat(c.flow()).extracting(WorkflowContent.Node::id).containsExactly("start", "c", "a", "b", "finish");
        assertThat(c.problems()).isEmpty();
        WorkflowContent.Node cond = c.node("c").orElseThrow();
        assertThat(c.next(cond, "yes")).map(WorkflowContent.Node::id).contains("a");
        assertThat(c.next(cond, "no")).map(WorkflowContent.Node::id).contains("b");
        // Las dos salidas pueden ir al mismo nodo.
        assertThat(problems(graph(edges("start>c", "c:yes>finish", "c:no>finish")))).isEmpty();
    }

    @Test
    void w15_w61_both_outputs_of_a_condition_need_an_arrow() {
        assertThat(problems(graph(edges("start>c", "c:yes>a", "a>finish"))))
                .containsExactly("La salida «No» de «Condicion1» no tiene flecha");
    }

    @Test
    void w12_w61_arrows_that_form_a_cycle_block_running() {
        assertThat(problems(graph(edges("start>a", "a>b", "b>a"))))
                .containsExactly("Las flechas forman un ciclo: «A» → «B» → «A». Solo el Bucle repite");
        assertThat(problems(graph(edges("start>c", "c:yes>a", "c:no>finish", "a>c"))))
                .containsExactly("Las flechas forman un ciclo: «Condicion1» → «A» → «Condicion1». Solo el Bucle repite");
        // Un ciclo fuera del flujo no impide ejecutar.
        assertThat(problems(graph(edges("start>finish", "a>b", "b>a")))).isEmpty();
    }

    @Test
    void w96_w61_a_break_needs_a_loop_in_progress() {
        String problem = "Se puede llegar a «Break1» sin un Bucle en curso";
        assertThat(problems(graph(edges("start>k", "k>finish")))).containsExactly(problem);
        assertThat(problems(graph(edges("start>f", "f>k", "k>finish")))).isEmpty();
        // Por una rama que no pasa por el Bucle.
        assertThat(problems(graph(edges("start>c", "c:yes>f", "c:no>k", "f>k", "k>finish")))).containsExactly(problem);
        // Tras otro Break que ya terminó el único Bucle.
        assertThat(problems(graph(edges("start>f", "f>k", "k>k2", "k2>finish"))))
                .containsExactly("Se puede llegar a «Break2» sin un Bucle en curso");
    }

    @Test
    void w91_w61_a_condition_must_be_written_correctly() {
        String base = graph(edges("start>c", "c:yes>finish", "c:no>finish"));
        assertThat(problems(base)).isEmpty();
        assertThat(problems(base.replace("$A == null", " "))).containsExactly("«Condicion1» no tiene condición");
        assertThat(problems(base.replace("$A == null", "$A ==")))
                .containsExactly("La condición de «Condicion1» no es válida: Falta un valor al final");
    }

    @Test
    void w93_w61_a_loop_needs_a_list() {
        String base = graph(edges("start>f", "f>finish"));
        assertThat(problems(base)).isEmpty();
        assertThat(problems(base.replace("\"list\":\"$A\"", "\"list\":\"\""))).containsExactly("«Bucle1» no tiene lista");
    }

    @Test
    void w97_w61_targets_are_single_references_and_not_repeated() {
        String base = graph(edges("start>s", "s>finish"));
        assertThat(problems(base)).isEmpty();
        String rows = "[{\"target\":\"A.x\",\"value\":\"1\"},{\"target\":\"$A.x\",\"value\":\"1\"},"
                + "{\"target\":\"$A.x\",\"value\":\"2\"},{\"target\":\"$A.x y\",\"value\":\"1\"}]";
        assertThat(problems(base.replace("[{\"target\":\"$A.x\",\"value\":\"1\"}]", rows))).containsExactly(
                "En «Cambiar1», el destino «A.x» no es una referencia",
                "En «Cambiar1», el destino «$A.x» está repetido",
                "En «Cambiar1», el destino «$A.x y» no es una referencia");
    }

    @Test
    void w18_w80_arrows_keep_their_output_and_their_points() {
        WorkflowContent c = WorkflowContent.parse(graph("{\"from\":\"start\",\"to\":\"c\",\"points\":[{\"x\":96,\"y\":240}]},"
                + edges("c:yes>finish", "c:no>finish")));
        assertThat(c.edges().getFirst().points()).containsExactly(new WorkflowContent.Point(96, 240));
        assertThat(c.edges().getFirst().out()).isNull();
        assertThat(c.edges().get(1).out()).isEqualTo("yes");
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
