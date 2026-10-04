package dev.litedd.notes;

import dev.litedd.http.ApiError;
import dev.litedd.http.ApiRoutes;
import io.javalin.config.RoutesConfig;

/** Rutas /api/tree, /api/notes y /api/trash. */
public final class NotesApi implements ApiRoutes {

    record CreateRequest(String parentId, String type, String title) {
    }

    record SaveRequest(String title, String content, Long baseVersion) {
    }

    record MoveRequest(String parentId, Integer position) {
    }

    private final NoteService notes;

    public NotesApi(NoteService notes) {
        this.notes = notes;
    }

    @Override
    public void register(RoutesConfig routes) {
        routes.get("/api/tree", ctx -> ctx.json(notes.tree()));

        routes.post("/api/notes", ctx -> {
            CreateRequest req = ctx.bodyAsClass(CreateRequest.class);
            ctx.status(201).json(notes.create(req.parentId(), req.type(), req.title()));
        });

        routes.get("/api/notes/{id}", ctx -> ctx.json(notes.get(ctx.pathParam("id"))));

        routes.put("/api/notes/{id}", ctx -> {
            SaveRequest req = ctx.bodyAsClass(SaveRequest.class);
            if (req.baseVersion() == null) {
                throw new ApiError(400, "missing_base_version", "Falta la versión de partida (baseVersion)");
            }
            ctx.json(notes.save(ctx.pathParam("id"), req.title(), req.content(), req.baseVersion()));
        });

        routes.post("/api/notes/{id}/move", ctx -> {
            MoveRequest req = ctx.bodyAsClass(MoveRequest.class);
            if (req.position() == null) {
                throw new ApiError(400, "missing_position", "Falta la posición de destino");
            }
            ctx.json(notes.move(ctx.pathParam("id"), req.parentId(), req.position()));
        });

        routes.delete("/api/notes/{id}", ctx -> {
            notes.delete(ctx.pathParam("id"), "promote".equals(ctx.queryParam("children")));
            ctx.status(204);
        });

        routes.get("/api/trash", ctx -> ctx.json(notes.trash()));
        routes.post("/api/trash/{id}/restore", ctx -> ctx.json(notes.restore(ctx.pathParam("id"))));
        routes.delete("/api/trash/{id}", ctx -> {
            notes.purge(ctx.pathParam("id"));
            ctx.status(204);
        });
        routes.delete("/api/trash", ctx -> {
            notes.emptyTrash();
            ctx.status(204);
        });
    }
}
