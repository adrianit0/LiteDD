package dev.litedd.workflow;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import dev.litedd.http.ApiError;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Deque;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Contenido de un workflow (W-80, ADR-0031, ADR-0041): casillas, nodos y flechas. Un workflow recién creado tiene el
 * contenido vacío, que equivale a Start unido a Finish (W-02).
 *
 * @param options casillas (W-40)
 * @param nodes   nodos con su tipo, nombre, posición y, según el tipo, nota y valores, segundos, filas, condición,
 *                lista o cambios
 * @param edges   flechas de una salida de un nodo a la entrada de otro (W-12)
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
    /** W-29 */
    public static final String LOGIN = "login";
    /** W-90 */
    public static final String CONDITION = "condition";
    /** W-93 */
    public static final String FOREACH = "foreach";
    /** W-96 */
    public static final String BREAK = "break";
    /** W-97 */
    public static final String SET = "set";
    /** W-29: el usuario del Login va en values, como los campos de HTTP y SQL. */
    public static final String USER = "user";
    /** W-12, W-90: las salidas de una Condición. La de los demás nodos no tiene nombre. */
    public static final String YES = "yes";
    public static final String NO = "no";
    /** W-16 */
    public static final int MAX_NODES = 100;
    static final Set<String> KINDS = Set.of(START, FINISH, HTTP, SQL, WAIT, INPUT, LOGIN, CONDITION, FOREACH, BREAK, SET);
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

    /**
     * values: HTTP, SQL y Login; seconds: Espera; rows: Input; condition: Condición; list: Bucle; assignments: Cambiar
     * valor.
     */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Node(String id, String kind, String name, Integer x, Integer y, String noteId, Map<String, String> values,
                       String seconds, List<Row> rows, String condition, String list, List<Assignment> assignments) {
        public Node {
            name = name == null ? "" : name;
            values = values == null ? Map.of() : values;
            seconds = seconds == null ? "" : seconds;
            rows = rows == null ? List.of() : rows;
            condition = condition == null ? "" : condition;
            list = list == null ? "" : list;
            assignments = assignments == null ? List.of() : assignments;
        }

        boolean named() {
            return !START.equals(kind) && !FINISH.equals(kind);
        }

        /** W-12: las salidas del nodo; null es la salida normal. */
        List<String> outs() {
            if (FINISH.equals(kind)) {
                return List.of();
            }
            if (CONDITION.equals(kind)) {
                return Arrays.asList(YES, NO);
            }
            List<String> one = new ArrayList<>();
            one.add(null);
            return one;
        }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Row(String name, String value) {
        public Row {
            name = name == null ? "" : name;
            value = value == null ? "" : value;
        }
    }

    /** W-97: una fila de Cambiar valor. */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Assignment(String target, String value) {
        public Assignment {
            target = target == null ? "" : target;
            value = value == null ? "" : value;
        }
    }

    /** W-18: un codo de una flecha. */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Point(Integer x, Integer y) {
    }

    /** W-12, W-18: out es la salida de la que parte (null, o yes y no en una Condición); points, sus codos. */
    @JsonIgnoreProperties(ignoreUnknown = true)
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Edge(String from, String to, String out, List<Point> points) {
        public Edge {
            out = out == null || out.isEmpty() ? null : out;
        }
    }

    public WorkflowContent {
        options = options == null ? new Options(null, null, null, null) : options;
        nodes = nodes == null ? List.of() : nodes;
        edges = edges == null ? List.of() : edges;
    }

    /** W-02: el contenido de un workflow nuevo, Start unido a Finish. */
    static WorkflowContent initial() {
        return new WorkflowContent(null,
                List.of(new Node(START, START, null, 32, 160, null, null, null, null, null, null, null),
                        new Node(FINISH, FINISH, null, 352, 160, null, null, null, null, null, null, null)),
                List.of(new Edge(START, FINISH, null, null)));
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
        for (Edge e : edges) {
            if (e == null || !byId.containsKey(e.from()) || !byId.containsKey(e.to())) {
                throw invalid("Hay una flecha hacia un nodo que no existe");
            }
            if (e.from().equals(e.to())) {
                throw invalid("Un nodo no se puede unir consigo mismo");
            }
            Node from = byId.get(e.from());
            if (FINISH.equals(from.kind()) || START.equals(byId.get(e.to()).kind())) {
                throw invalid("Finish no tiene salida y Start no tiene entrada");
            }
            if (!from.outs().contains(e.out())) {
                throw invalid("El nodo " + e.from() + " no tiene la salida " + (e.out() == null ? "normal" : e.out()));
            }
            if (!outs.add(e.from() + "/" + e.out())) {
                throw invalid("Cada salida admite una sola flecha");
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

    public Node start() {
        return nodes.stream().filter(n -> START.equals(n.kind())).findFirst().orElseThrow();
    }

    /** W-12: el nodo al que lleva una salida, si tiene flecha. */
    public Optional<Node> next(Node from, String out) {
        return edges.stream()
                .filter(e -> e.from().equals(from.id()) && Objects.equals(e.out(), out))
                .findFirst()
                .flatMap(e -> node(e.to()));
    }

    /** W-15, W-17: los nodos a los que se llega desde Start, en anchura y con «Sí» antes que «No». */
    public List<Node> flow() {
        return reachableFrom(start());
    }

    /** Los nodos a los que se llega desde from, from incluido. */
    List<Node> reachableFrom(Node from) {
        Set<String> seen = new LinkedHashSet<>();
        List<Node> out = new ArrayList<>();
        Deque<Node> queue = new ArrayDeque<>(List.of(from));
        while (!queue.isEmpty()) {
            Node n = queue.removeFirst();
            if (!seen.add(n.id())) {
                continue;
            }
            out.add(n);
            n.outs().forEach(o -> next(n, o).ifPresent(queue::addLast));
        }
        return out;
    }

    /**
     * W-21, W-28, W-61, W-91, W-93, W-96, W-97: lo que impide ejecutar y se ve sin mirar las notas: salidas sin
     * flecha, ciclos, Break sin Bucle en curso, condiciones, listas y destinos de los nodos del flujo, y los nombres
     * de todos los nodos. Las notas de los nodos las comprueba quien tiene acceso a ellas.
     */
    public List<String> problems() {
        List<String> out = new ArrayList<>();
        List<Node> flow = flow();
        for (Node n : flow) {
            for (String o : n.outs()) {
                if (next(n, o).isEmpty()) {
                    out.add(o == null ? "La salida de «" + label(n) + "» no tiene flecha"
                            : "La salida «" + (YES.equals(o) ? "Sí" : "No") + "» de «" + label(n) + "» no tiene flecha");
                }
            }
        }
        List<Node> cycle = cycle(flow);
        if (!cycle.isEmpty()) {
            out.add("Las flechas forman un ciclo: " + String.join(" → ", cycle.stream().map(n -> "«" + label(n) + "»").toList())
                    + ". Solo el Bucle repite");
        } else {
            breaksWithoutLoop(flow).forEach(n -> out.add("Se puede llegar a «" + label(n) + "» sin un Bucle en curso"));
        }
        for (Node n : flow) {
            switch (n.kind()) {
                case CONDITION -> {
                    if (n.condition().isBlank()) {
                        out.add("«" + label(n) + "» no tiene condición");
                    } else {
                        String problem = Condition.problem(n.condition());
                        if (problem != null) {
                            out.add("La condición de «" + label(n) + "» no es válida: " + problem);
                        }
                    }
                }
                case FOREACH -> {
                    if (n.list().isBlank()) {
                        out.add("«" + label(n) + "» no tiene lista");
                    }
                }
                case SET -> {
                    Set<String> targets = new HashSet<>();
                    for (Assignment a : n.assignments()) {
                        if (References.single(a.target()).isEmpty()) {
                            out.add("En «" + label(n) + "», el destino «" + a.target() + "» no es una referencia");
                        } else if (!targets.add(a.target())) {
                            out.add("En «" + label(n) + "», el destino «" + a.target() + "» está repetido");
                        }
                    }
                }
                default -> {
                    // Sin campos propios que comprobar aquí.
                }
            }
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

    /** W-12, W-61: un ciclo entre los nodos del flujo, cerrado con su primer nodo, o vacío. */
    private List<Node> cycle(List<Node> flow) {
        Map<String, Integer> state = new HashMap<>();
        Deque<Node> path = new ArrayDeque<>();
        for (Node n : flow) {
            List<Node> found = cycleFrom(n, state, path);
            if (!found.isEmpty()) {
                return found;
            }
        }
        return List.of();
    }

    /** Búsqueda en profundidad: 1 en el camino actual, 2 terminado. */
    private List<Node> cycleFrom(Node n, Map<String, Integer> state, Deque<Node> path) {
        Integer s = state.get(n.id());
        if (s != null && s == 2) {
            return List.of();
        }
        if (s != null) {
            List<Node> cycle = new ArrayList<>();
            boolean in = false;
            for (Node p : path.reversed()) {
                in |= p.id().equals(n.id());
                if (in) {
                    cycle.add(p);
                }
            }
            cycle.add(n);
            return cycle;
        }
        state.put(n.id(), 1);
        path.push(n);
        for (String o : n.outs()) {
            Optional<Node> to = next(n, o);
            if (to.isPresent()) {
                List<Node> found = cycleFrom(to.get(), state, path);
                if (!found.isEmpty()) {
                    return found;
                }
            }
        }
        path.pop();
        state.put(n.id(), 2);
        return List.of();
    }

    /**
     * W-96: los Break a los que se puede llegar sin un Bucle en curso. Por cada nodo, el menor número de Bucles en
     * curso con que se llega a él: cada Bucle abre uno y cada Break cierra uno. El flujo no tiene ciclos.
     */
    private List<Node> breaksWithoutLoop(List<Node> flow) {
        Map<String, Integer> indegree = new HashMap<>();
        flow.forEach(n -> indegree.put(n.id(), 0));
        for (Node n : flow) {
            n.outs().forEach(o -> next(n, o).ifPresent(t -> indegree.merge(t.id(), 1, Integer::sum)));
        }
        Map<String, Integer> depth = new HashMap<>();
        depth.put(start().id(), 0);
        Deque<Node> ready = new ArrayDeque<>(List.of(start()));
        List<Node> out = new ArrayList<>();
        while (!ready.isEmpty()) {
            Node n = ready.removeFirst();
            int d = depth.getOrDefault(n.id(), 0);
            if (BREAK.equals(n.kind()) && d < 1) {
                out.add(n);
            }
            int after = Math.max(0, d + (FOREACH.equals(n.kind()) ? 1 : BREAK.equals(n.kind()) ? -1 : 0));
            for (String o : n.outs()) {
                Optional<Node> to = next(n, o);
                if (to.isEmpty()) {
                    continue;
                }
                String id = to.get().id();
                depth.merge(id, after, Math::min);
                if (indegree.merge(id, -1, Integer::sum) == 0) {
                    ready.addLast(to.get());
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
            case LOGIN -> "Login";
            case CONDITION -> "Condición";
            case FOREACH -> "Bucle";
            case BREAK -> "Break";
            case SET -> "Cambiar valor";
            default -> "Input";
        };
    }

    private static ApiError invalid(String message) {
        return new ApiError(400, "invalid_workflow", message);
    }
}
