package dev.litedd.workflow;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.ObjectNode;
import dev.litedd.http.ApiError;
import dev.litedd.httpnotes.HttpNoteContent;
import dev.litedd.httpnotes.HttpRunner;
import dev.litedd.httpnotes.LoginSession;
import dev.litedd.httpnotes.Variables;
import dev.litedd.mysql.SqlRunner;
import dev.litedd.notes.Note;
import dev.litedd.notes.NoteService;
import dev.litedd.settings.AppConfig.Profile;
import dev.litedd.sqlengine.SqlEngine;
import dev.litedd.sqlengine.SqlEngine.Analysis;
import dev.litedd.workflow.WorkflowContent.Node;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.function.Function;
import java.util.function.Supplier;

/**
 * Comprobación previa y ejecución nodo a nodo de un workflow (W-60 a W-68, ADR-0031). Recibe el workflow guardado y
 * los valores de la pestaña y produce eventos; no sabe nada del transporte.
 */
public final class WorkflowRunner {

    /** W-23, W-24: una variable de la nota de un nodo, con su tipo en SQL. */
    public record Field(String name, String type) {
    }

    /**
     * Lo que la interfaz necesita de la nota de un nodo (W-23 a W-26). state: active, trash o missing.
     *
     * @param executable SQL: si es una consulta que se puede ejecutar (Q-45)
     * @param values     valores iniciales: los guardados en la nota HTTP o los últimos ejecutados de la SQL
     */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record NoteInfo(String id, String state, String type, String title, String method, String endpoint, Boolean executable,
                           List<Field> fields, Map<String, String> values, String error) {
    }

    /**
     * W-70, W-72, W-78: el estado de un nodo y, al terminar, lo escrito en cada campo (raw), lo que entró (values), las
     * referencias que no existían (missing) y su resultado.
     */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record NodeEvent(String type, String nodeId, String status, Long millis, Map<String, String> raw,
                            Map<String, String> values, List<String> missing, Failure error, HttpRunner.Result http,
                            SqlRunner.Rows sql) {
    }

    public record StartEvent(String type, List<String> chain) {
    }

    /** W-71: status finished, stopped o cancelled. */
    public record EndEvent(String type, String status, int errors, long millis, String message) {
    }

    public record Failure(String code, String message) {
    }

    public interface Sink {
        void send(Object event) throws IOException;
    }

    /** Lo comprobado antes de empezar (W-61, W-63): la cadena, sus notas, los valores y el perfil. */
    public record Prepared(Note workflow, WorkflowContent content, List<Node> chain, Map<String, Note> notes,
                           Map<String, Map<String, String>> values, Profile profile) {

        /** W-53: los valores usados, como `<nodo>/<campo>`. */
        public Map<String, String> flatValues() {
            Map<String, String> out = new LinkedHashMap<>();
            values.forEach((node, fields) -> fields.forEach((field, value) -> out.put(node + "/" + field, value)));
            return out;
        }
    }

    static final String SECONDS = "seconds";
    /** W-27 */
    static final BigDecimal MAX_SECONDS = BigDecimal.valueOf(3600);
    private static final Logger log = LoggerFactory.getLogger(WorkflowRunner.class);

    private final NoteService notes;
    private final HttpRunner http;
    private final SqlRunner sql;
    private final SqlEngine engine;
    private final Supplier<Map<String, String>> constants;
    private final Map<String, Run> runs = new ConcurrentHashMap<>();

    public WorkflowRunner(NoteService notes, HttpRunner http, SqlRunner sql, SqlEngine engine,
                          Supplier<Map<String, String>> constants) {
        this.notes = notes;
        this.http = http;
        this.sql = sql;
        this.engine = engine;
        this.constants = constants;
    }

    /** W-23 a W-26: tipo, estado, variables y valores iniciales de cada nota. */
    public List<NoteInfo> describe(List<String> noteIds, Map<String, Map<String, String>> lastSqlValues) {
        List<NoteInfo> out = new ArrayList<>();
        for (String id : noteIds) {
            Note note;
            try {
                note = notes.get(id);
            } catch (ApiError e) {
                out.add(new NoteInfo(id, notes.inTrash(id) ? "trash" : "missing", null, null, null, null, null, null, null, null));
                continue;
            }
            try {
                switch (note.type()) {
                    case WorkflowContent.HTTP -> {
                        HttpNoteContent c = HttpNoteContent.parse(note.content());
                        List<Field> fields = Variables.names(c).stream().map(n -> new Field(n, null)).toList();
                        out.add(new NoteInfo(id, "active", note.type(), note.title(), c.method(), c.endpoint(), null, fields,
                                pick(fields, c.pathValues()), null));
                    }
                    case WorkflowContent.SQL -> {
                        Analysis a = engine.analyze(note.content(), constants.get());
                        List<Field> fields = a.variables().stream().map(v -> new Field(v.name(), v.type().name().toLowerCase())).toList();
                        boolean executable = a.kind() != null && !"statement".equals(a.kind()) && a.forbiddenClause() == null;
                        out.add(new NoteInfo(id, "active", note.type(), note.title(), null, null, executable, fields,
                                pick(fields, lastSqlValues.getOrDefault(id, Map.of())), null));
                    }
                    default -> out.add(new NoteInfo(id, "active", note.type(), note.title(), null, null, null, null, null, null));
                }
            } catch (ApiError e) {
                out.add(new NoteInfo(id, "active", note.type(), note.title(), null, null, null, List.of(), Map.of(), e.getMessage()));
            }
        }
        return out;
    }

    private static Map<String, String> pick(List<Field> fields, Map<String, String> values) {
        Map<String, String> out = new LinkedHashMap<>();
        fields.forEach(f -> out.put(f.name(), values.get(f.name())));
        return out;
    }

    /**
     * W-61, W-63, A-04, A-05: comprueba la versión, la cadena, las notas, los nombres, el perfil y la clave antes de
     * ejecutar nada. tabValues son los valores de consulta de la pestaña, por nodo y campo (W-44, W-51).
     */
    public Prepared prepare(String noteId, long version, String profileId, String confirmKey,
                            Map<String, Map<String, String>> tabValues) {
        Note workflow = notes.get(noteId);
        if (!WorkflowContent.TYPE.equals(workflow.type())) {
            throw new ApiError(400, "not_workflow", "La nota no es un workflow");
        }
        if (workflow.version() != version) {
            throw new ApiError(409, "stale_version", "La nota ha cambiado desde que se abrió. Pulsa «Actualizar».");
        }
        WorkflowContent content = WorkflowContent.parse(workflow.content());
        List<String> problems = new ArrayList<>(content.problems());
        List<Node> chain = content.chain();
        Map<String, Note> used = new HashMap<>();
        Map<String, List<String>> fields = new HashMap<>();
        boolean anyHttp = false;
        boolean anyLogin = false;
        for (Node n : chain) {
            if (WorkflowContent.LOGIN.equals(n.kind())) {
                anyLogin = true;
                continue;
            }
            if (!WorkflowContent.HTTP.equals(n.kind()) && !WorkflowContent.SQL.equals(n.kind())) {
                continue;
            }
            anyHttp |= WorkflowContent.HTTP.equals(n.kind());
            String label = "«" + WorkflowContent.label(n) + "»";
            if (n.noteId() == null || n.noteId().isBlank()) {
                problems.add(label + " no tiene nota");
                continue;
            }
            Note note;
            try {
                note = notes.get(n.noteId());
            } catch (ApiError e) {
                problems.add(notes.inTrash(n.noteId()) ? "La nota de " + label + " está en la papelera" : "La nota de " + label + " no existe");
                continue;
            }
            if (!n.kind().equals(note.type())) {
                problems.add("La nota de " + label + " no es una nota " + WorkflowContent.kindLabel(n.kind()));
                continue;
            }
            try {
                if (WorkflowContent.HTTP.equals(n.kind())) {
                    fields.put(n.id(), Variables.names(HttpNoteContent.parse(note.content())));
                } else {
                    Analysis a = engine.analyze(note.content(), constants.get());
                    if (!a.errors().isEmpty() || a.kind() == null) {
                        problems.add("La nota de " + label + " tiene errores: " + a.errors().getFirst().message());
                        continue;
                    }
                    if ("statement".equals(a.kind()) || a.forbiddenClause() != null) {
                        problems.add("La nota de " + label + " no es una consulta: LiteDD solo ejecuta consultas");
                        continue;
                    }
                    fields.put(n.id(), a.variables().stream().map(v -> v.name()).toList());
                }
            } catch (ApiError e) {
                problems.add("La nota de " + label + " no es válida: " + e.getMessage());
                continue;
            }
            used.put(n.id(), note);
        }
        if (anyLogin) {
            // W-61: el Login usa la nota de login de «Ajustes».
            try {
                http.checkLoginNote();
            } catch (ApiError e) {
                problems.add("El nodo Login necesita la nota de login: " + e.getMessage());
            }
        }
        anyHttp |= anyLogin;
        if (!problems.isEmpty()) {
            throw new ApiError(400, "workflow_invalid", "No se puede ejecutar: " + String.join(". ", problems), problems);
        }
        Profile profile = http.activeProfile();
        if (anyHttp) {
            if (!profile.id().equals(profileId)) {
                throw new ApiError(409, "profile_changed",
                        "El perfil activo es «" + profile.name() + "». Revisa el destino y vuelve a ejecutar.");
            }
            if (profile.requireKey()) {
                http.checkConfirmKey(profile, confirmKey);
            }
        }
        return new Prepared(workflow, content, chain, used, values(content, chain, fields, tabValues), profile);
    }

    /** W-44, W-51: los de la pestaña donde se pueden cambiar; los guardados en edición donde no. */
    private static Map<String, Map<String, String>> values(WorkflowContent content, List<Node> chain,
                                                           Map<String, List<String>> fields, Map<String, Map<String, String>> tab) {
        Map<String, Map<String, String>> out = new LinkedHashMap<>();
        for (Node n : chain) {
            boolean editable = WorkflowContent.INPUT.equals(n.kind()) || !content.options().lockValues();
            Map<String, String> fromTab = editable && tab != null ? tab.getOrDefault(n.id(), Map.of()) : Map.of();
            Map<String, String> v = new LinkedHashMap<>();
            switch (n.kind()) {
                case WorkflowContent.HTTP, WorkflowContent.SQL -> fields.get(n.id())
                        .forEach(f -> v.put(f, valueOf(fromTab, f, n.values().get(f))));
                case WorkflowContent.WAIT -> v.put(SECONDS, valueOf(fromTab, SECONDS, n.seconds()));
                case WorkflowContent.LOGIN -> v.put(WorkflowContent.USER, valueOf(fromTab, WorkflowContent.USER,
                        n.values().get(WorkflowContent.USER)));
                case WorkflowContent.INPUT -> n.rows().forEach(r -> v.put(r.name(), valueOf(fromTab, r.name(), r.value())));
                default -> {
                    continue;
                }
            }
            out.put(n.id(), v);
        }
        return out;
    }

    private static String valueOf(Map<String, String> tab, String field, String saved) {
        String v = tab.containsKey(field) ? tab.get(field) : saved;
        return v == null ? "" : v;
    }

    /** W-60, W-67: se cancela por el executionId de la ejecución. */
    public boolean cancel(String executionId) {
        Run run = executionId == null ? null : runs.get(executionId);
        if (run == null) {
            return false;
        }
        run.cancelled = true;
        run.cancel.countDown();
        String current = run.current;
        if (current != null) {
            http.cancel(current);
            sql.cancel(current);
        }
        return true;
    }

    /**
     * Estado de una ejecución en curso: la cancelación, la llamada o consulta que está en marcha y el último Login
     * (W-69), que vale solo para esta ejecución.
     */
    private static final class Run {
        final CountDownLatch cancel = new CountDownLatch(1);
        volatile boolean cancelled;
        volatile String current;
        volatile boolean gone;
        /** Nombre del último nodo Login; null si aún no hubo ninguno. */
        String loginName;
        /** Su sesión; null si falló. */
        LoginSession session;

        void login(String name, LoginSession result) {
            loginName = name;
            session = result;
        }
    }

    /** Resultado de un nodo. stop: el flujo se detiene aunque «Parar si error» esté desmarcada (W-43, W-63). */
    private record Outcome(String status, Map<String, String> values, Failure error, HttpRunner.Result http, SqlRunner.Rows sql,
                           Supplier<Optional<JsonNode>> value, String stopMessage) {

        static Outcome error(Map<String, String> values, String code, String message) {
            return new Outcome("error", values, new Failure(code, message), null, null, null, null);
        }
    }

    /** W-60 a W-68: recorre la cadena y envía un evento por cada cambio de estado. */
    public void run(Prepared p, String executionId, Sink sink) {
        Run run = new Run();
        runs.put(executionId, run);
        long start = System.nanoTime();
        try {
            emit(run, executionId, sink, new StartEvent("start", p.chain().stream().map(Node::id).toList()));
            Map<String, Supplier<Optional<JsonNode>>> valuesByName = new HashMap<>();
            int errors = 0;
            for (Node n : p.chain()) {
                if (run.cancelled) {
                    end(run, executionId, sink, "cancelled", errors, start, "Cancelado");
                    return;
                }
                if (!n.named()) {
                    emit(run, executionId, sink, new NodeEvent("node", n.id(), "ok", 0L, null, null, null, null, null, null));
                    continue;
                }
                emit(run, executionId, sink, new NodeEvent("node", n.id(), "running", null, null, null, null, null, null, null));
                long nodeStart = System.nanoTime();
                Resolution r = resolve(p, n, name -> {
                    Supplier<Optional<JsonNode>> v = valuesByName.get(name);
                    return v == null ? Optional.empty() : v.get();
                });
                Outcome o = execute(p, n, r, executionId, run);
                long millis = (System.nanoTime() - nodeStart) / 1_000_000;
                if (run.cancelled && !"ok".equals(o.status())) {
                    o = new Outcome("cancelled", o.values(), new Failure("cancelled", "Cancelado"), o.http(), o.sql(), null, null);
                }
                // W-68: ni valores, ni cuerpos, ni cabeceras.
                log.debug("Nodo {} ({}) {} en {} ms", n.name(), n.kind(), o.status(), millis);
                emit(run, executionId, sink, new NodeEvent("node", n.id(), o.status(), millis, p.values().get(n.id()), o.values(),
                        r.missing().isEmpty() ? null : r.missing(), o.error(), o.http(), o.sql()));
                if (o.value() != null) {
                    valuesByName.put(n.name(), memoize(o.value()));
                }
                if ("cancelled".equals(o.status())) {
                    end(run, executionId, sink, "cancelled", errors, start, "Cancelado");
                    return;
                }
                if (o.stopMessage() != null) {
                    end(run, executionId, sink, "stopped", errors + 1, start, o.stopMessage());
                    return;
                }
                if ("error".equals(o.status())) {
                    errors++;
                    if (p.content().options().stopOnError()) {
                        end(run, executionId, sink, "stopped", errors, start, "Detenido por error en " + n.name());
                        return;
                    }
                }
            }
            end(run, executionId, sink, "finished", errors, start,
                    errors == 0 ? "Terminado" : "Terminado con " + errors + (errors == 1 ? " error" : " errores"));
        } finally {
            runs.remove(executionId);
        }
    }

    /** W-34, W-35, W-78: los campos de un nodo con sus referencias resueltas y las que no existían. */
    private record Resolution(Map<String, String> resolved, List<String> missing) {
    }

    private static Resolution resolve(Prepared p, Node n, Function<String, Optional<JsonNode>> lookup) {
        Map<String, String> resolved = new LinkedHashMap<>();
        List<String> missing = new ArrayList<>();
        for (Map.Entry<String, String> e : p.values().getOrDefault(n.id(), Map.of()).entrySet()) {
            References.Resolved r = References.resolve(e.getValue(), lookup);
            resolved.put(e.getKey(), r.value());
            r.missing().stream().filter(m -> !missing.contains(m)).forEach(missing::add);
        }
        return new Resolution(resolved, missing);
    }

    private Outcome execute(Prepared p, Node n, Resolution r, String executionId, Run run) {
        Map<String, String> resolved = r.resolved();
        if (!r.missing().isEmpty() && p.content().options().stopOnMissing()) {
            // W-43
            String message = r.missing().getFirst() + " no existe";
            return new Outcome("error", resolved, new Failure("missing_reference", message), null, null, null, "Detenido: " + message);
        }
        String sub = executionId + "/" + n.id();
        run.current = sub;
        try {
            return switch (n.kind()) {
                case WorkflowContent.HTTP -> http(p, n, resolved, sub, run);
                case WorkflowContent.LOGIN -> login(p, n, resolved, sub, run);
                case WorkflowContent.SQL -> sql(p.notes().get(n.id()), resolved, sub);
                case WorkflowContent.WAIT -> waitFor(resolved, run);
                default -> input(resolved);
            };
        } finally {
            run.current = null;
        }
    }

    /** W-63: si el perfil activo cambió, el nodo no se envía y el flujo se detiene. */
    private Outcome profileChanged(Prepared p, Map<String, String> resolved) {
        Profile active = http.activeProfile();
        if (active.id().equals(p.profile().id())) {
            return null;
        }
        String message = "El perfil activo ha cambiado a «" + active.name() + "»: no se envía";
        return new Outcome("error", resolved, new Failure("profile_changed", message), null, null, null,
                "Detenido: el perfil activo ha cambiado");
    }

    /** W-29, W-69: el login de «Ajustes» con el usuario del nodo; su sesión es la de los nodos HTTP siguientes. */
    private Outcome login(Prepared p, Node n, Map<String, String> resolved, String sub, Run run) {
        Outcome changed = profileChanged(p, resolved);
        if (changed != null) {
            return changed;
        }
        String user = resolved.get(WorkflowContent.USER);
        HttpRunner.LoginCall call;
        try {
            // W-54: una referencia que vale null se envía como el texto null; vacío es el usuario del perfil.
            call = http.loginAs(user == null ? "null" : user, p.profile(), sub);
        } catch (ApiError e) {
            run.login(n.name(), null);
            return Outcome.error(resolved, e.body().code(), e.getMessage());
        }
        run.login(n.name(), call.session());
        HttpRunner.Result r = call.result();
        Supplier<Optional<JsonNode>> value = r.response() != null ? () -> body(r.response()) : null;
        if (call.session() == null) {
            Failure f = r.error() == null ? new Failure("login_failed", "El login falló") : new Failure(r.error().code(), r.error().message());
            return new Outcome("error", resolved, f, r, null, value, null);
        }
        return new Outcome("ok", resolved, null, r, null, value, null);
    }

    /** W-42, W-54, W-62, W-63, W-69 */
    private Outcome http(Prepared p, Node n, Map<String, String> resolved, String sub, Run run) {
        Outcome changed = profileChanged(p, resolved);
        if (changed != null) {
            return changed;
        }
        Map<String, String> values = new HashMap<>();
        resolved.forEach((k, v) -> values.put(k, v == null ? "null" : v));
        Note note = p.notes().get(n.id());
        HttpRunner.Result r;
        try {
            boolean usesLogin = !HttpNoteContent.LOGIN_NONE.equals(HttpNoteContent.parse(note.content()).login());
            if (run.loginName != null && run.session == null && usesLogin) {
                return Outcome.error(resolved, "login_failed", "El login de «" + run.loginName + "» falló: no se envía");
            }
            r = http.executeWith(note, values, p.profile(), sub, run.session);
        } catch (ApiError e) {
            return Outcome.error(resolved, e.body().code(), e.getMessage());
        }
        boolean answered = r.response() != null && "request".equals(r.phase());
        Supplier<Optional<JsonNode>> value = answered ? () -> body(r.response()) : null;
        if (r.error() != null) {
            return new Outcome("error", resolved, new Failure(r.error().code(), r.error().message()), r, null, value, null);
        }
        if (r.response().status() >= 400) {
            String text = (r.response().status() + " " + r.response().statusText()).strip();
            return new Outcome("error", resolved, new Failure("http_status", "Respondió " + text), r, null, value, null);
        }
        return new Outcome("ok", resolved, null, r, null, value, null);
    }

    /** W-32: JSON si el cuerpo lo es; si no, su texto. Un cuerpo binario no tiene valor. */
    static Optional<JsonNode> body(HttpRunner.Received response) {
        String text = response.text();
        if (text == null) {
            return Optional.empty();
        }
        try {
            JsonNode node = References.JSON.readTree(text);
            if (node != null && !node.isMissingNode()) {
                return Optional.of(node);
            }
        } catch (IOException e) {
            // No es JSON: vale su texto.
        }
        return Optional.of(JsonNodeFactory.instance.textNode(text));
    }

    /** W-42, W-54, W-64 */
    private Outcome sql(Note note, Map<String, String> resolved, String sub) {
        SqlRunner.Rows rows;
        try {
            rows = sql.all(note.content(), resolved, sub);
        } catch (ApiError e) {
            return Outcome.error(resolved, e.body().code(), e.getMessage());
        }
        return new Outcome("ok", resolved, null, null, rows, () -> Optional.of(rowsValue(rows)), null);
    }

    /** W-32: cada fila con sus columnas por etiqueta; si una se repite, vale la primera. */
    static JsonNode rowsValue(SqlRunner.Rows rows) {
        List<String> labels = rows.labels();
        ArrayNode out = JsonNodeFactory.instance.arrayNode();
        for (List<String> r : rows.rows()) {
            ObjectNode o = out.addObject();
            for (int i = 0; i < labels.size(); i++) {
                if (!o.has(labels.get(i))) {
                    String cell = r.get(i);
                    if (cell == null) {
                        o.putNull(labels.get(i));
                    } else {
                        o.put(labels.get(i), cell);
                    }
                }
            }
        }
        return out;
    }

    /** W-27, W-65: de 0 a 3600 segundos, con coma o punto; Cancelar la interrumpe. */
    private static Outcome waitFor(Map<String, String> resolved, Run run) {
        String text = resolved.get(SECONDS);
        BigDecimal seconds;
        try {
            seconds = new BigDecimal(text == null ? "" : text.strip().replace(',', '.'));
        } catch (NumberFormatException e) {
            seconds = null;
        }
        if (seconds == null || seconds.signum() < 0 || seconds.compareTo(MAX_SECONDS) > 0) {
            return Outcome.error(resolved, "invalid_seconds", "Los segundos deben ser un número de 0 a 3600");
        }
        try {
            if (run.cancel.await(seconds.movePointRight(3).longValue(), TimeUnit.MILLISECONDS)) {
                return new Outcome("cancelled", resolved, new Failure("cancelled", "Cancelado"), null, null, null, null);
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return new Outcome("cancelled", resolved, new Failure("cancelled", "Cancelado"), null, null, null, null);
        }
        return new Outcome("ok", resolved, null, null, null, null, null);
    }

    /** W-66: sus filas por nombre, ya resueltas. */
    private static Outcome input(Map<String, String> resolved) {
        ObjectNode value = JsonNodeFactory.instance.objectNode();
        resolved.forEach((k, v) -> {
            if (v == null) {
                value.putNull(k);
            } else {
                value.put(k, v);
            }
        });
        return new Outcome("ok", resolved, null, null, null, () -> Optional.of(value), null);
    }

    /** ADR-0031: el cuerpo de una respuesta solo se analiza la primera vez que una referencia lo usa. */
    private static Supplier<Optional<JsonNode>> memoize(Supplier<Optional<JsonNode>> s) {
        return new Supplier<>() {
            private Optional<JsonNode> value;

            @Override
            public synchronized Optional<JsonNode> get() {
                if (value == null) {
                    value = s.get();
                }
                return value;
            }
        };
    }

    private void end(Run run, String executionId, Sink sink, String status, int errors, long start, String message) {
        emit(run, executionId, sink, new EndEvent("end", status, errors, (System.nanoTime() - start) / 1_000_000, message));
    }

    /** Si la pestaña ya no escucha, la ejecución se cancela (ADR-0031). */
    private void emit(Run run, String executionId, Sink sink, Object event) {
        if (run.gone) {
            return;
        }
        try {
            sink.send(event);
        } catch (IOException e) {
            run.gone = true;
            cancel(executionId);
        }
    }
}
