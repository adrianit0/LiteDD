package dev.litedd.notes;

import dev.litedd.http.ApiError;
import dev.litedd.http.ApiRoutes;
import io.javalin.config.RoutesConfig;

/** Rutas /api/tree y /api/notes. */
public final class NotesApi implements ApiRoutes {

    record CreateRequest(String parentId, String type, String title) {
    }

    record SaveRequest(String title, String content, Long baseVersion) {
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
    }
}
