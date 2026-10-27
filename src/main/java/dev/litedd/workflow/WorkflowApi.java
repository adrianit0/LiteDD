package dev.litedd.workflow;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.litedd.http.ApiError;
import dev.litedd.http.ApiRoutes;
import dev.litedd.notes.NoteService;
import dev.litedd.notes.VariableValues;
import dev.litedd.workflow.WorkflowRunner.NoteInfo;
import dev.litedd.workflow.WorkflowRunner.Prepared;
import io.javalin.config.RoutesConfig;

import java.io.IOException;
import java.io.OutputStream;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;

/** Rutas /api/workflow: analizar las notas de los nodos, ejecutar en streaming y cancelar (W-23 a W-72, ADR-0031). */
public final class WorkflowApi implements ApiRoutes {

    record AnalyzeRequest(List<String> noteIds, String workflowId) {
    }

    /** W-51: lastValues, por nodo y campo, solo si se pide con workflowId. */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    record AnalyzeResponse(List<NoteInfo> notes, Map<String, Map<String, String>> lastValues) {
    }

    record ExecuteRequest(String noteId, Long version, String executionId, String profileId, String confirmKey,
                          Map<String, Map<String, String>> values) {
    }

    record CancelRequest(String executionId) {
    }

    record Tick(String type) {
    }

    /** Latido mientras dura una espera o una llamada larga: mantiene viva la conexión y detecta la pestaña cerrada. */
    static final long TICK_SECONDS = 5;
    private static final ObjectMapper JSON = new ObjectMapper();

    private final WorkflowRunner runner;
    private final VariableValues variableValues;
    private final NoteService notes;
    private final ScheduledExecutorService ticks = Executors.newSingleThreadScheduledExecutor(r -> {
        Thread t = new Thread(r, "litedd-workflow-tick");
        t.setDaemon(true);
        return t;
    });

    public WorkflowApi(WorkflowRunner runner, VariableValues variableValues, NoteService notes) {
        this.runner = runner;
        this.variableValues = variableValues;
        this.notes = notes;
    }

    @Override
    public void register(RoutesConfig routes) {
        routes.post("/api/workflow/analyze", ctx -> {
            AnalyzeRequest req = ctx.bodyAsClass(AnalyzeRequest.class);
            List<String> ids = req.noteIds() == null ? List.of() : req.noteIds().stream().distinct().toList();
            Map<String, Map<String, String>> lastSql = new HashMap<>();
            ids.forEach(id -> lastSql.put(id, variableValues.load(id)));
            ctx.json(new AnalyzeResponse(runner.describe(ids, lastSql),
                    req.workflowId() == null ? null : lastValues(req.workflowId())));
        });
        routes.post("/api/workflow/execute", ctx -> {
            ExecuteRequest req = ctx.bodyAsClass(ExecuteRequest.class);
            if (req.noteId() == null || req.version() == null) {
                throw new ApiError(400, "bad_request", "Faltan la nota o su versión");
            }
            // W-61, W-63: lo que falle aquí responde como un error normal, antes de la primera línea.
            Prepared p = runner.prepare(req.noteId(), req.version(), req.profileId(), req.confirmKey(), req.values());
            // W-53
            Map<String, String> flat = p.flatValues();
            variableValues.save(req.noteId(), flat.keySet(), flat);
            String executionId = req.executionId() == null ? UUID.randomUUID().toString() : req.executionId();

            ctx.status(200);
            ctx.res().setContentType("application/x-ndjson; charset=utf-8");
            ctx.res().setHeader("Cache-Control", "no-cache");
            // El flujo sin comprimir de la respuesta, para que cada línea llegue en cuanto se escribe.
            OutputStream out = ctx.res().getOutputStream();
            WorkflowRunner.Sink sink = new WorkflowRunner.Sink() {
                @Override
                public synchronized void send(Object event) throws IOException {
                    out.write(JSON.writeValueAsBytes(event));
                    out.write('\n');
                    out.flush();
                }
            };
            ScheduledFuture<?> tick = ticks.scheduleAtFixedRate(() -> {
                try {
                    sink.send(new Tick("tick"));
                } catch (IOException e) {
                    runner.cancel(executionId);
                }
            }, TICK_SECONDS, TICK_SECONDS, TimeUnit.SECONDS);
            try {
                runner.run(p, executionId, sink);
            } finally {
                tick.cancel(false);
            }
        });
        routes.post("/api/workflow/cancel", ctx -> {
            CancelRequest req = ctx.bodyAsClass(CancelRequest.class);
            ctx.json(Map.of("cancelled", runner.cancel(req.executionId())));
        });
    }

    /** W-51: `<nodo>/<campo>` → valor, agrupados por nodo. */
    private Map<String, Map<String, String>> lastValues(String workflowId) {
        notes.get(workflowId);
        Map<String, Map<String, String>> out = new LinkedHashMap<>();
        variableValues.load(workflowId).forEach((key, value) -> {
            int slash = key.indexOf('/');
            if (slash > 0) {
                out.computeIfAbsent(key.substring(0, slash), k -> new LinkedHashMap<>()).put(key.substring(slash + 1), value);
            }
        });
        return out;
    }
}
