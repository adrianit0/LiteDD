package dev.litedd.notes;

import dev.litedd.http.ApiError;
import dev.litedd.http.ApiRoutes;
import io.javalin.config.RoutesConfig;

import java.util.Arrays;
import java.util.List;

/** Rutas /api/tree, /api/notes y /api/trash. */
public final class NotesApi implements ApiRoutes {

    record CreateRequest(String parentId, String type, String title) {
    }

    record SaveRequest(String title, String description, String content, Long baseVersion, Boolean snapshot) {
    }

    record RestoreRequest(Long baseVersion) {
    }

    record TagsRequest(List<String> tags) {
    }

    record FavoriteRequest(Boolean favorite) {
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
            ctx.json(notes.save(ctx.pathParam("id"), req.title(), req.description(), req.content(), req.baseVersion(),
                    Boolean.TRUE.equals(req.snapshot())));
        });

        routes.get("/api/notes/{id}/versions", ctx -> ctx.json(notes.versions(ctx.pathParam("id"))));
        routes.post("/api/notes/{id}/versions/{versionId}/restore", ctx -> {
            RestoreRequest req = ctx.bodyAsClass(RestoreRequest.class);
            if (req.baseVersion() == null) {
                throw new ApiError(400, "missing_base_version", "Falta la versión de partida (baseVersion)");
            }
            long versionId;
            try {
                versionId = Long.parseLong(ctx.pathParam("versionId"));
            } catch (NumberFormatException e) {
                throw new ApiError(404, "not_found", "La versión no existe");
            }
            ctx.json(notes.restoreVersion(ctx.pathParam("id"), versionId, req.baseVersion()));
        });

        routes.put("/api/notes/{id}/tags", ctx -> {
            TagsRequest req = ctx.bodyAsClass(TagsRequest.class);
            ctx.json(notes.setTags(ctx.pathParam("id"), req.tags()));
        });
        routes.put("/api/notes/{id}/favorite", ctx -> {
            FavoriteRequest req = ctx.bodyAsClass(FavoriteRequest.class);
            ctx.json(notes.setFavorite(ctx.pathParam("id"), Boolean.TRUE.equals(req.favorite())));
        });
        routes.get("/api/tags", ctx -> ctx.json(notes.tags()));
        routes.get("/api/search", ctx -> {
            String tags = ctx.queryParam("tags");
            ctx.json(notes.search(new NoteService.SearchQuery(ctx.queryParam("q"), ctx.queryParam("type"),
                    tags == null || tags.isBlank() ? List.of() : Arrays.asList(tags.split(",")),
                    "true".equals(ctx.queryParam("favorite")), ctx.queryParam("since"))));
        });

        // N-08
        routes.post("/api/notes/{id}/duplicate", ctx -> ctx.status(201).json(notes.duplicate(ctx.pathParam("id"))));

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
