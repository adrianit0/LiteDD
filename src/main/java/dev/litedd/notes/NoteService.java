package dev.litedd.notes;

import dev.litedd.http.ApiError;
import dev.litedd.notes.NoteMapper.NoteRow;
import dev.litedd.store.Store;
import org.apache.ibatis.session.SqlSession;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Arrays;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/** Operaciones sobre notas y árbol. Cada operación va en una transacción (D-03). */
public final class NoteService {

    public static final String DEFAULT_TITLE = "Sin título";
    private static final Set<String> TYPES = Set.of("md", "sql");

    private final Store store;

    public NoteService(Store store) {
        this.store = store;
    }

    public List<TreeNode> tree() {
        return store.read(s -> s.getMapper(NoteMapper.class).selectTree().stream()
                .map(r -> new TreeNode(r.id(), r.parentId(), r.position(), r.type(), r.title(), r.favorite(),
                        r.tags() == null ? List.of() : Arrays.asList(r.tags().split(NoteMapper.TAG_SEPARATOR))))
                .toList());
    }

    public Note get(String id) {
        return store.read(s -> load(s, id));
    }

    /** N-05, N-06: la nota nueva va al final de sus hermanas. */
    public Note create(String parentId, String type, String title) {
        if (type == null || !TYPES.contains(type)) {
            throw new ApiError(400, "invalid_type", "Tipo de nota no válido: debe ser «md» o «sql»");
        }
        String finalTitle = title == null || title.isBlank() ? DEFAULT_TITLE : title.strip();
        return store.write(s -> {
            NoteMapper m = s.getMapper(NoteMapper.class);
            if (parentId != null && m.selectActive(parentId) == null) {
                throw notFound();
            }
            String now = now();
            NoteRow row = new NoteRow(UUID.randomUUID().toString(), parentId, m.countChildren(parentId), type,
                    finalTitle, "", false, 1, now, now);
            m.insert(row);
            return load(s, row.id());
        });
    }

    /** N-40, N-42: guarda título y contenido si la versión de partida sigue vigente. */
    public Note save(String id, String title, String content, long baseVersion) {
        if (title == null || title.isBlank()) {
            throw new ApiError(400, "invalid_title", "El título no puede estar vacío");
        }
        String finalContent = content == null ? "" : content;
        return store.write(s -> {
            int updated = s.getMapper(NoteMapper.class).updateContent(id, title.strip(), finalContent, baseVersion, now());
            if (updated == 0) {
                Note current = load(s, id);
                throw new ApiError(409, "conflict",
                        "La nota ha cambiado desde que se abrió. Recárgala o sobrescríbela.", current);
            }
            return load(s, id);
        });
    }

    private static Note load(SqlSession s, String id) {
        NoteMapper m = s.getMapper(NoteMapper.class);
        NoteRow r = m.selectActive(id);
        if (r == null) {
            throw notFound();
        }
        return new Note(r.id(), r.parentId(), r.position(), r.type(), r.title(), r.content(), r.favorite(),
                r.version(), r.createdAt(), r.updatedAt(), m.selectTags(id));
    }

    private static ApiError notFound() {
        return new ApiError(404, "not_found", "La nota no existe");
    }

    private static String now() {
        return Instant.now().truncatedTo(ChronoUnit.MILLIS).toString();
    }
}
