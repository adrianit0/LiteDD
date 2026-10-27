package dev.litedd.workflow;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import dev.litedd.http.ApiError;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Contenido de un workflow (W-80, ADR-0031): casillas, nodos y flechas. Un workflow recién creado tiene el contenido
 * vacío, que equivale a Start unido a Finish (W-02).
 *
 * @param options casillas (W-40)
 * @param nodes   nodos con su tipo, nombre, posición y, según el tipo, nota y valores, segundos o filas
 * @param edges   flechas de la salida de un nodo a la entrada de otro (W-12)
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record WorkflowContent(Options options, List<Node> nodes, List<Edge> edges) {

    public static final String TYPE = "workflow";
    public static final String START = "start";
    public static final String FINISH = "finish";
    public static final String HTTP = "http";
    public static final String SQL = "sql";
    public static final String WAIT = "wait";
    public static final String INPUT = "input";
    /** W-16 */
    public static final int MAX_NODES = 100;
    static final Set<String> KINDS = Set.of(START, FINISH, HTTP, SQL, WAIT, INPUT);
    /** W-21, W-28 */
    static final Pattern NAME = Pattern.compile("[A-Za-z][A-Za-z0-9_]{0,39}");

    private static final ObjectMapper JSON = new ObjectMapper();

    /** W-40: un workflow nuevo solo tiene marcada «Parar si error». */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Options(Boolean sameInputs, Boolean stopOnError, Boolean stopOnMissing, Boolean lockValues) {
        public Options {
            sameInputs = sameInputs != null && sameInputs;
            stopOnError = stopOnError == null || stopOnError;
            stopOnMissing = stopOnMissing != null && stopOnMissing;
            lockValues = lockValues != null && lockValues;
        }
    }

    /** values: HTTP y SQL, por variable; seconds: Espera; rows: Input. */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Node(String id, String kind, String name, Integer x, Integer y, String noteId, Map<String, String> values,
                       String seconds, List<Row> rows) {
        public Node {
            name = name == null ? "" : name;
            values = values == null ? Map.of() : values;
            seconds = seconds == null ? "" : seconds;
            rows = rows == null ? List.of() : rows;
        }

        boolean named() {
            return !START.equals(kind) && !FINISH.equals(kind);
        }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Row(String name, String value) {
        public Row {
            name = name == null ? "" : name;
            value = value == null ? "" : value;
        }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Edge(String from, String to) {
    }

    public WorkflowContent {
        options = options == null ? new Options(null, null, null, null) : options;
        nodes = nodes == null ? List.of() : nodes;
        edges = edges == null ? List.of() : edges;
    }

    /** W-02: el contenido de un workflow nuevo, Start unido a Finish. */
    static WorkflowContent initial() {
        return new WorkflowContent(null,
                List.of(new Node(START, START, null, 32, 160, null, null, null, null),
                        new Node(FINISH, FINISH, null, 352, 160, null, null, null, null)),
                List.of(new Edge(START, FINISH)));
    }

    /** W-80: el contenido guardado; vacío es un workflow nuevo. W-81: la estructura debe ser válida. */
    public static WorkflowContent parse(String content) {
        if (content == null || content.isBlank()) {
            return initial();
        }
        WorkflowContent c;
        try {
            c = JSON.readValue(content, WorkflowContent.class);
        } catch (JsonProcessingException e) {
            throw invalid("El contenido del workflow no es un JSON válido");
        }
        if (c == null) {
            throw invalid("El contenido del workflow no es un JSON válido");
        }
        c.checkStructure();
        return c;
    }

    /** W-81: al guardar, restaurar e importar. */
    public static void validate(String content) {
        parse(content);
    }

    private void checkStructure() {
        if (nodes.size() > MAX_NODES) {
            throw invalid("Un workflow tiene como máximo " + MAX_NODES + " nodos");
        }
        Map<String, Node> byId = new HashMap<>();
        int starts = 0;
        int finishes = 0;
        for (Node n : nodes) {
            if (n == null || n.id() == null || n.id().isBlank()) {
                throw invalid("Hay un nodo sin identificador");
            }
            if (!KINDS.contains(n.kind())) {
                throw invalid("Tipo de nodo desconocido: " + n.kind());
            }
            if (byId.put(n.id(), n) != null) {
                throw invalid("El identificador de nodo " + n.id() + " está repetido");
            }
            starts += START.equals(n.kind()) ? 1 : 0;
            finishes += FINISH.equals(n.kind()) ? 1 : 0;
        }
        if (starts != 1 || finishes != 1) {
            throw invalid("Un workflow tiene exactamente un Start y un Finish");
        }
        Set<String> outs = new HashSet<>();
        Set<String> ins = new HashSet<>();
        for (Edge e : edges) {
            if (e == null || !byId.containsKey(e.from()) || !byId.containsKey(e.to())) {
                throw invalid("Hay una flecha hacia un nodo que no existe");
            }
            if (e.from().equals(e.to())) {
                throw invalid("Un nodo no se puede unir consigo mismo");
            }
            if (FINISH.equals(byId.get(e.from()).kind()) || START.equals(byId.get(e.to()).kind())) {
                throw invalid("Finish no tiene salida y Start no tiene entrada");
            }
            if (!outs.add(e.from()) || !ins.add(e.to())) {
                throw invalid("Cada entrada y cada salida admite una sola flecha");
            }
        }
    }

    /**
     * W-82: al importar como rama, las notas de los nodos que vienen en el archivo pasan a sus identificadores nuevos;
     * las demás se dejan como estaban. Se trabaja sobre el JSON para no perder nada de lo guardado.
     */
    public static String remapNotes(String content, Map<String, String> noteIds) {
        if (content == null || content.isBlank()) {
            return content;
        }
        try {
            JsonNode root = JSON.readTree(content);
            for (JsonNode n : root.path("nodes")) {
                String noteId = n.path("noteId").asText(null);
                if (noteId != null && noteIds.containsKey(noteId) && n instanceof ObjectNode o) {
                    o.put("noteId", noteIds.get(noteId));
                }
            }
            return JSON.writeValueAsString(root);
        } catch (JsonProcessingException e) {
            throw invalid("El contenido del workflow no es un JSON válido");
        }
    }

    public Optional<Node> node(String id) {
        return nodes.stream().filter(n -> n.id().equals(id)).findFirst();
    }

    /** W-15: el camino desde Start siguiendo las flechas, con Start y, si llega, Finish. */
    public List<Node> chain() {
        Map<String, String> next = new HashMap<>();
        edges.forEach(e -> next.put(e.from(), e.to()));
        List<Node> chain = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        Optional<Node> current = nodes.stream().filter(n -> START.equals(n.kind())).findFirst();
        while (current.isPresent() && seen.add(current.get().id())) {
            chain.add(current.get());
            String to = next.get(current.get().id());
            current = to == null ? Optional.empty() : node(to);
        }
        return chain;
    }

    public boolean reachesFinish() {
        List<Node> chain = chain();
        return !chain.isEmpty() && FINISH.equals(chain.getLast().kind());
    }

    /**
     * W-21, W-28, W-61: los nombres de los nodos y de las filas de los Input que impiden ejecutar, y si la cadena no
     * llega a Finish. Las notas de los nodos las comprueba quien tiene acceso a ellas.
     */
    public List<String> problems() {
        List<String> out = new ArrayList<>();
        if (!reachesFinish()) {
            List<Node> chain = chain();
            out.add("La cadena no llega de Start a Finish: se corta tras «" + label(chain.getLast()) + "»");
        }
        Map<String, String> seen = new LinkedHashMap<>();
        for (Node n : nodes) {
            if (!n.named()) {
                continue;
            }
            if (n.name().isEmpty()) {
                out.add("Hay un nodo " + kindLabel(n.kind()) + " sin nombre");
            } else if (!NAME.matcher(n.name()).matches()) {
                out.add("El nombre «" + n.name() + "» no es válido: letras sin acentos, números y _, empezando por una letra, hasta 40");
            } else if (seen.putIfAbsent(n.name().toLowerCase(Locale.ROOT), n.name()) != null) {
                out.add("El nombre «" + n.name() + "» está repetido");
            }
            if (INPUT.equals(n.kind())) {
                Set<String> rows = new HashSet<>();
                for (Row r : n.rows()) {
                    if (!NAME.matcher(r.name()).matches()) {
                        out.add("En «" + n.name() + "», el valor «" + r.name() + "» no tiene un nombre válido");
                    } else if (!rows.add(r.name())) {
                        out.add("En «" + n.name() + "», el valor «" + r.name() + "» está repetido");
                    }
                }
            }
        }
        return out;
    }

    static String label(Node n) {
        return n.named() ? (n.name().isEmpty() ? kindLabel(n.kind()) : n.name()) : kindLabel(n.kind());
    }

    static String kindLabel(String kind) {
        return switch (kind) {
            case START -> "Start";
            case FINISH -> "Finish";
            case HTTP -> "HTTP";
            case SQL -> "SQL";
            case WAIT -> "Espera";
            default -> "Input";
        };
    }

    private static ApiError invalid(String message) {
        return new ApiError(400, "invalid_workflow", message);
    }
}
